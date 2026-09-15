import type { TranslationKey } from '~/lib/i18n/translations';
import type { OcrEngine } from './engine';
import type { OcrProgress, PdfPageResult } from './types';

export type ScanStatus =
  | { stage: 'idle' }
  | { stage: 'loading'; progress: OcrProgress }
  | { stage: 'processing'; progress: OcrProgress }
  | { stage: 'done' }
  | { stage: 'error'; errorKey: TranslationKey; detail: string };

export interface ScanSessionState {
  status: ScanStatus;
  pages: PdfPageResult[];
  activePage: number;
  fileName: string | null;
  fileSize: number | null;
  imageSrc: string | null;
  truncated: { rendered: number; total: number } | null;
}

export interface ScanSession {
  state: ScanSessionState;
  cancel(): void;
  setActivePage(page: number): void;
  exportCurrentDoc(): string;
  exportAllPagesDoc(): string;
  exportCurrentJson(): string;
  exportAllPagesJson(): string;
  /** Fires exactly once when the session is cancelled, useful for tests. */
  onCancelled(callback: () => void): () => void;
}

/**
 * Map a thrown error to a user-facing translation key plus the raw detail.
 * The key is resolved by the route at render time, so the message follows the
 * active language rather than the language that happened to be active at
 * failure time (and internal strings stay out of the headline).
 */
export function describeScanError(err: unknown): {
  errorKey: TranslationKey;
  detail: string;
} {
  const detail = err instanceof Error ? err.message : String(err);
  const lower = detail.toLowerCase();
  if (lower.includes('dictionary')) return { errorKey: 'error.dictionary', detail };
  if (lower.includes('model')) return { errorKey: 'error.modelDownload', detail };
  if (lower.includes('load image') || lower.includes('canvas')) {
    return { errorKey: 'error.imageDecode', detail };
  }
  if (lower.includes('pdf')) return { errorKey: 'error.pdf', detail };
  return { errorKey: 'error.ocrFailed', detail };
}

export function serializeAllPagesDoc(state: ScanSessionState): string {
  return state.pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.ocr.text}`).join('\n\n');
}

export function serializeAllPagesJson(state: ScanSessionState): string {
  return JSON.stringify(
    {
      pages: state.pages.map((p) => ({
        pageNumber: p.pageNumber,
        boxes: p.ocr.boxes,
        text: p.ocr.text,
        elapsed: p.ocr.elapsed,
      })),
    },
    null,
    2
  );
}

interface ScanDeps {
  file: File;
  engine: OcrEngine;
  onUpdate(state: ScanSessionState): void;
  navigateHome(): void;
}

/**
 * Owns a single scan lifecycle: model loading, image/PDF inference, progress,
 * cancellation, and object URL cleanup. The route consumes the small ScanSession
 * interface and no longer needs to orchestrate the pipeline inline.
 */
export async function runScanSession(deps: ScanDeps): Promise<ScanSession> {
  const { file, engine, onUpdate, navigateHome } = deps;

  let objectUrls: string[] = [];
  const controller = new AbortController();

  const state: ScanSessionState = {
    status: { stage: 'idle' },
    pages: [],
    activePage: 0,
    fileName: file.name,
    fileSize: file.size,
    imageSrc: null,
    truncated: null,
  };

  let cancelled = false;
  const cancelListeners = new Set<() => void>();

  function fireCancelled() {
    if (cancelled) return;
    cancelled = true;
    for (const cb of cancelListeners) cb();
  }

  function revokeAll() {
    for (const url of objectUrls) {
      URL.revokeObjectURL(url);
    }
    objectUrls = [];
  }

  function setStatus(next: ScanStatus, force = false) {
    if (cancelled && !force) return;
    state.status = next;
    onUpdate({ ...state });
  }

  function reportProgress(stage: OcrProgress['stage'], progress: number, message: string) {
    if (cancelled) return;
    const p: OcrProgress = { stage, progress, message };
    setStatus(
      stage === 'loading-models'
        ? { stage: 'loading', progress: p }
        : { stage: 'processing', progress: p }
    );
  }

  function setActivePage(page: number) {
    const target = state.pages[page - 1];
    if (!target) return;
    state.activePage = page;
    state.imageSrc = target.imageSrc;
    onUpdate({ ...state });
  }

  function exportCurrentDoc(): string {
    return state.pages[state.activePage - 1]?.ocr.text ?? '';
  }

  function exportAllPagesDoc(): string {
    return serializeAllPagesDoc(state);
  }

  function exportCurrentJson(): string {
    const current = state.pages[state.activePage - 1];
    if (!current) return '';
    return JSON.stringify(
      { boxes: current.ocr.boxes, text: current.ocr.text, elapsed: current.ocr.elapsed },
      null,
      2
    );
  }

  function exportAllPagesJson(): string {
    return serializeAllPagesJson(state);
  }

  const session: ScanSession = {
    get state() {
      return { ...state };
    },
    cancel() {
      fireCancelled();
      controller.abort();
      revokeAll();
      setStatus({ stage: 'idle' }, true);
    },
    setActivePage,
    exportCurrentDoc,
    exportAllPagesDoc,
    exportCurrentJson,
    exportAllPagesJson,
    onCancelled(callback: () => void) {
      if (cancelled) {
        callback();
      }
      cancelListeners.add(callback);
      return () => cancelListeners.delete(callback);
    },
  };

  async function ensureModels() {
    if (engine.isReady) return;
    reportProgress('loading-models', 0, 'Loading OCR models...');
    await engine.load((name, fromCache) => {
      reportProgress(
        'loading-models',
        fromCache ? 0.8 : 0.5,
        `Loaded ${name} model${fromCache ? ' (cached)' : ''}`
      );
    });
  }

  function handleError(err: unknown) {
    if (cancelled) return;
    const { errorKey, detail } = describeScanError(err);
    console.error(`[ERROR] Scan failed: ${detail}`);

    // Keep the pages that already finished: their object URLs are still live
    // and the user may still want to read, copy, or download them. Revoking here
    // (while `state.pages` kept referencing the URLs) rendered broken images for
    // pages that had succeeded, so only `cancel()` releases them now.
    const lastPage = state.pages[state.pages.length - 1];
    if (lastPage) {
      state.activePage = lastPage.pageNumber;
      state.imageSrc = lastPage.imageSrc;
    }
    setStatus({ stage: 'error', errorKey, detail });
  }

  function throwIfCancelled() {
    if (!cancelled) return;
    const error = new Error('Scan cancelled');
    error.name = 'AbortError';
    throw error;
  }

  function addObjectUrl(src: string) {
    objectUrls.push(src);
  }

  async function run() {
    try {
      if (file.type === 'application/pdf') {
        await ensureModels();
        throwIfCancelled();
        // PDF.js is large; only load it when the user actually uploads a PDF.
        const { renderPdfPages } = await import('./pdf-renderer');
        await renderPdfPages(file, {
          signal: controller.signal,
          onPage: async ({ pageNumber, imageSrc, totalPages, pagesToRender }) => {
            throwIfCancelled();
            addObjectUrl(imageSrc);
            state.imageSrc = imageSrc;
            state.activePage = pageNumber;
            if (totalPages > pagesToRender) {
              state.truncated = { rendered: pagesToRender, total: totalPages };
            }
            reportProgress(
              'detecting',
              (pageNumber - 0.5) / pagesToRender,
              `Processing page ${pageNumber}/${pagesToRender}...`
            );
            const ocr = await engine.recognize(imageSrc, (p) =>
              reportProgress(p.stage, p.progress, p.message)
            );
            throwIfCancelled();
            state.pages.push({ pageNumber, ocr, imageSrc });
            onUpdate({ ...state });
          },
        });
      } else {
        await ensureModels();
        throwIfCancelled();
        const src = URL.createObjectURL(file);
        addObjectUrl(src);
        state.imageSrc = src;
        reportProgress('detecting', 0.5, 'Recognizing image...');
        const result = await engine.recognize(src, (p) =>
          reportProgress(p.stage, p.progress, p.message)
        );
        throwIfCancelled();
        state.pages.push({ pageNumber: 1, ocr: result, imageSrc: src });
        state.activePage = 1;
        onUpdate({ ...state });
      }
      throwIfCancelled();
      setStatus({ stage: 'done' });
    } catch (err) {
      if (cancelled || (err instanceof Error && err.name === 'AbortError')) {
        console.log('[INFO] Scan cancelled by user');
        navigateHome();
        return;
      }
      handleError(err);
    }
  }

  void run();
  return session;
}
