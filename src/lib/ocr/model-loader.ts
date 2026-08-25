import * as ort from 'onnxruntime-web/wasm';

export type ModelName = 'det' | 'rec';

const MODEL_FILES: Record<ModelName, string> = {
  det: 'det.onnx',
  rec: 'rec.onnx',
};

const DB_NAME = 'ocr-models';
// ponytail: legacy IndexedDB name from pre-rename (parsify → ocr). Delete after 2026-10-01 if no migration hits in prod logs.
const LEGACY_DB_NAME = 'parsify-ocr-models';
const DB_VERSION = 3;
const STORE_NAME = 'models';

let legacyMigration: Promise<void> | null = null;
async function migrateLegacyCache(): Promise<void> {
  if (!indexedDB.databases) return;
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === LEGACY_DB_NAME)) return;

  const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  try {
    if (!legacyDb.objectStoreNames.contains(STORE_NAME)) return;
    const entries = await new Promise<Array<[string, ArrayBuffer]>>((resolve, reject) => {
      const request = legacyDb
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .openCursor();
      const result: Array<[string, ArrayBuffer]> = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(result);
          return;
        }
        if (cursor.value instanceof ArrayBuffer) {
          result.push([String(cursor.key), cursor.value]);
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });

    if (entries.length > 0) {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        for (const [key, value] of entries) store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
  } finally {
    legacyDb.close();
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function ensureLegacyCacheMigrated(): Promise<void> {
  legacyMigration ??= migrateLegacyCache().catch((error) => {
    console.warn(`[WARN] Failed to migrate legacy model cache: ${(error as Error).message}`);
  });
  return legacyMigration;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedModel(name: ModelName): Promise<ArrayBuffer | null> {
  try {
    await ensureLegacyCacheMigrated();
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(name);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function setCachedModel(name: ModelName, data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(data, name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteCachedModel(name: ModelName): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // ignore cache deletion failures
  }
}

async function fetchModel(
  name: ModelName,
  baseUrl: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  const url = `${baseUrl}/${MODEL_FILES[name]}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model ${name}: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const reader = response.body?.getReader();
  if (!reader) {
    return await response.arrayBuffer();
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, contentLength);
  }

  const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}

export interface LoadedModels {
  det: ort.InferenceSession;
  rec: ort.InferenceSession;
}

/**
 * Load PP-OCRv6 models (det + rec required, cls optional).
 * Checks IndexedDB cache first, falls back to network fetch.
 */
export async function loadModels(
  baseUrl = '/models/pp-ocrv6-small',
  onModelLoaded?: (name: ModelName, fromCache: boolean) => void
): Promise<LoadedModels> {
  ort.env.wasm.numThreads = 1;
  // Vite 7+ refuses to import JS files from /public during dev, so load the
  // ONNX Runtime wasm loader module directly from node_modules in development.
  // In production the non-JSEP WASM files are copied to /ort by postinstall.
  ort.env.wasm.wasmPaths = import.meta.env['DEV'] ? '/node_modules/onnxruntime-web/dist/' : '/ort/';

  const loadOne = async (name: ModelName, allowRetry = true): Promise<ort.InferenceSession> => {
    let buffer = await getCachedModel(name);
    const fromCache = buffer !== null;

    if (!buffer) {
      console.log(`[INFO] Downloading model: ${name}`);
      buffer = await fetchModel(name, baseUrl);
      try {
        await setCachedModel(name, buffer);
        console.log(`[INFO] Cached model: ${name} (${(buffer.byteLength / 1024).toFixed(1)}KB)`);
      } catch (cacheErr) {
        console.warn(`[WARN] Failed to cache model ${name}: ${(cacheErr as Error).message}`);
      }
    } else {
      console.log(`[INFO] Loaded model from cache: ${name}`);
    }

    onModelLoaded?.(name, fromCache);

    try {
      return await ort.InferenceSession.create(buffer, {
        executionProviders: ['wasm'],
      });
    } catch (err) {
      // Stale/corrupt cache (e.g. a previous 404 response) can cause protobuf
      // parse errors. Drop the cached entry and re-fetch once.
      if (
        fromCache &&
        allowRetry &&
        err instanceof Error &&
        err.message.includes('protobuf parsing failed')
      ) {
        console.warn(`[WARN] Cached model ${name} failed protobuf validation; re-fetching`);
        await deleteCachedModel(name);
        return loadOne(name, false);
      }
      throw err;
    }
  };

  const [det, rec] = await Promise.all([loadOne('det'), loadOne('rec')]);

  return { det, rec };
}
