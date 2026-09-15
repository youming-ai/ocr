/**
 * Recognition-level regression tool for the shipped rec model.
 *
 * Drives the REAL production decode path (normalizeForRec + decodeCtc) over the
 * committed text-line fixtures in src/__tests__/fixtures/rec, and reports how
 * each script family decodes:
 *
 *   - ASCII (en)  — must decode exactly; guarded by --guard (CI).
 *   - CJK / kana / accented Latin — tracks the known upstream issue: the
 *     PP-OCRv6 small rec model transcribes every non-ASCII character as the
 *     CP1252 rendering of its UTF-8 bytes (e.g. 本 -> "æœ¬"). The tool prints
 *     both the raw decode and a best-effort UTF-8 byte reassembly, plus the
 *     fraction of characters whose bytes are even representable in the
 *     vocabulary. See docs/upstream-rec-non-ascii.md for the full evidence.
 *
 * Usage:
 *   bun scripts/verify-rec-model.ts            # full report
 *   bun scripts/verify-rec-model.ts --guard    # exit 1 if an ASCII fixture regresses
 *   bun scripts/verify-rec-model.ts --model <onnx> --dict <txt>
 */
import { inflateSync } from 'node:zlib';
import * as ort from 'onnxruntime-web';
import manifest from '../src/__tests__/fixtures/rec/manifest.json';
import { decodeCtc } from '~/lib/ocr/postprocessor';
import { normalizeForRec } from '~/lib/ocr/preprocessor';

const ROOT = import.meta.dir + '/..';
const DEFAULT_MODEL = `${ROOT}/public/models/pp-ocrv6-small/rec.onnx`;
const DEFAULT_DICT = `${ROOT}/public/models/pp-ocrv6-small/ppocrv6_dict.txt`;

// ---------------------------------------------------------------------------
// CP1252 tables: the model emits UTF-8 bytes rendered through CP1252.
// ---------------------------------------------------------------------------

/** CP1252 decoding of the 0x80-0x9F range (the rest of the byte range is identity). */
const CP1252_HIGH: Record<number, string> = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026',
  0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8a: '\u0160',
  0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017D', 0x91: '\u2018', 0x92: '\u2019',
  0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02DC', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203A', 0x9c: '\u0153',
  0x9e: '\u017E', 0x9f: '\u0178',
};

/** Byte -> the string the model emits for it (NFKC-expansions included, see below). */
const NFKC_EXPANSIONS: Record<number, string> = {
  0x85: '...', 0x99: 'TM', 0xa0: ' ', 0xaa: 'a', 0xb2: '2', 0xb3: '3', 0xb5: '\u03BC',
  0xb9: '1', 0xba: 'o', 0xbc: '1\u20444', 0xbd: '1\u20442', 0xbe: '3\u20444',
};

/**
 * Folds the model actually emits when the vocab lacks the NFKC expansion's
 * middle characters (e.g. U+2044 FRACTION SLIM is not in the vocabulary, so
 * "1⁄4" comes out as "14"). Only applied while a continuation byte is expected.
 */
const VOCAB_DROPPED_FOLDS: Record<number, string> = {
  0xbc: '14', 0xbd: '12', 0xbe: '34',
};

function byteToChar(byte: number): string {
  if (byte in CP1252_HIGH) return CP1252_HIGH[byte] as string;
  return String.fromCharCode(byte);
}

/** char -> byte, for chars that have a direct CP1252 rendering. */
const CHAR_TO_BYTE = new Map<string, number>();
for (let b = 0; b < 0x100; b++) CHAR_TO_BYTE.set(byteToChar(b), b);
/**
 * Best-effort inverse of the model's byte emission: walk the decoded string as
 * a UTF-8 state machine, mapping characters back to bytes (multi-character
 * NFKC folds included) and re-decode. Returns null when the text is pure ASCII
 * (nothing to do) or when the byte stream cannot be rebuilt (dropped bytes are
 * unrecoverable — see docs/upstream-rec-non-ascii.md).
 */
export function recoverUtf8(text: string): string | null {
  if (/^[\x00-\x7f]*$/.test(text)) return null;
  const bytes: number[] = [];
  let expectedContinuations = 0;
  let i = 0;
  const foldEntries = [
    ...Object.entries(NFKC_EXPANSIONS).map(([h, s]) => [Number(h), s] as [number, string]),
    ...Object.entries(VOCAB_DROPPED_FOLDS).map(([h, s]) => [Number(h), s] as [number, string]),
  ].sort((a, b) => b[1].length - a[1].length);

  while (i < text.length) {
    if (expectedContinuations > 0) {
      // Only bytes in 0x80-0xBF can continue the sequence.
      let matched = false;
      for (const [byte, expansion] of foldEntries) {
        if (byte >= 0x80 && byte <= 0xbf && text.startsWith(expansion, i)) {
          bytes.push(byte);
          i += expansion.length;
          expectedContinuations--;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      const c = text[i] ?? '';
      const direct = CHAR_TO_BYTE.get(c);
      if (direct !== undefined && direct >= 0x80 && direct <= 0xbf) {
        bytes.push(direct);
        i++;
        expectedContinuations--;
        continue;
      }
      return null; // sequence cannot be continued
    }
    // Expecting a lead byte or plain ASCII.
    const ch = text[i];
    if (ch === undefined) return null;
    let byte = CHAR_TO_BYTE.get(ch);
    if (byte === undefined) {
      for (const [b, expansion] of foldEntries) {
        if (text.startsWith(expansion, i)) {
          byte = b;
          i += expansion.length - 1;
          break;
        }
      }
    }
    if (byte === undefined) return null;
    bytes.push(byte);
    if (byte < 0x80) {
      // ASCII
    } else if (byte >= 0xc2 && byte <= 0xdf) expectedContinuations = 1;
    else if (byte >= 0xe0 && byte <= 0xef) expectedContinuations = 2;
    else if (byte >= 0xf0 && byte <= 0xf4) expectedContinuations = 3;
    else return null; // stray continuation byte
    i++;
  }
  if (expectedContinuations > 0) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/** Fraction of `text`'s characters whose UTF-8 bytes the vocabulary can express at all. */
function byteIntactRate(text: string, vocab: Set<string>): { intact: number; total: number } {
  let intact = 0;
  let total = 0;
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) <= 0x7f) continue;
    total++;
    const utf8 = new TextEncoder().encode(ch);
    let ok = true;
    for (const byte of utf8) {
      const candidates = [byteToChar(byte), NFKC_EXPANSIONS[byte] ?? ''];
      const anyPresent = candidates.some((c) => c !== '' && vocab.has(c));
      if (!anyPresent) ok = false;
    }
    if (ok) intact++;
  }
  return { intact, total };
}

function similarity(a: string, b: string): number {
  // Simple LCS ratio, adequate for a report.
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      const ai = a[i - 1];
      const bj = b[j - 1];
      cur[j] = ai !== undefined && bj !== undefined && ai === bj
        ? (prev[j - 1] ?? 0) + 1
        : Math.max(prev[j] ?? 0, cur[j - 1] ?? 0);
    }
    prev = cur;
  }
  return (prev[n] ?? 0) / Math.max(m, n);
}

// ---------------------------------------------------------------------------
// Minimal PNG decoder (8-bit RGBA, non-interlaced) for the committed fixtures.
// Fixtures store channels in BGRA order (see manifest note).
// ---------------------------------------------------------------------------

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

async function decodePng(path: string): Promise<{ width: number; height: number; bgra: Uint8Array }> {
  const data = new Uint8Array(await Bun.file(path).arrayBuffer());
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== sig[i]) throw new Error(`not a PNG: ${path}`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  while (pos + 12 <= data.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(
      data[pos + 4] ?? 0,
      data[pos + 5] ?? 0,
      data[pos + 6] ?? 0,
      data[pos + 7] ?? 0
    );
    const body = data.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      colorType = data[pos + 17] ?? 0;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (colorType !== 6) throw new Error(`fixture must be 8-bit RGBA (colorType 6), got ${colorType}`);
  const raw = inflateSync(concat(idat));
  const stride = width * 4;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p] ?? 0;
    p += 1;
    const line = raw.slice(p, p + stride);
    p += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? (line[i - 4] ?? 0) : 0;
      const up = prev[i] ?? 0;
      const upLeft = i >= 4 ? (prev[i - 4] ?? 0) : 0;
      let v = line[i] ?? 0;
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) v += paeth(left, up, upLeft);
      line[i] = v & 0xff;
    }
    out.set(line, y * stride);
    prev = line;
  }
  return { width, height, bgra: out };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const guard = argv.includes('--guard');
  const modelFlag = argv.indexOf('--model');
  const dictFlag = argv.indexOf('--dict');
  const modelPath = modelFlag >= 0 ? (argv[modelFlag + 1] ?? DEFAULT_MODEL) : DEFAULT_MODEL;
  const dictPath = dictFlag >= 0 ? (argv[dictFlag + 1] ?? DEFAULT_DICT) : DEFAULT_DICT;

  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `${ROOT}/node_modules/onnxruntime-web/dist/`;

  // Dict loading mirrors loadFullDictionary() in src/lib/ocr/character-dict.ts.
  const dictText = await Bun.file(dictPath).text();
  const dictLines = dictText.replace(/\r\n/g, '\n').split('\n');
  if (dictLines.length > 0 && dictLines[dictLines.length - 1] === '') dictLines.pop();
  if (dictLines.length < 100) throw new Error(`dict suspiciously short: ${dictLines.length}`);
  const dict = ['', ...dictLines, ' '];
  const vocabSet = new Set<string>(dict);

  const session = await ort.InferenceSession.create(await Bun.file(modelPath).arrayBuffer(), {
    executionProviders: ['wasm'],
  });
  console.log(`model: ${modelPath}\ndict:  ${dictPath} (${dict.length} entries)\n`);

  let guardFailed = false;
  const summary: Record<string, unknown>[] = [];

  for (const fixture of manifest.fixtures) {
    const expected = fixture.text;
    const { width, height, bgra } = await decodePng(
      `${ROOT}/src/__tests__/fixtures/rec/${fixture.file}`
    );

    // Raw BGR [0,1] CHW — the buffer shape imageToPixels() produces.
    const pixels = width * height;
    const raw = new Float32Array(3 * pixels);
    for (let i = 0; i < pixels; i++) {
      raw[i] = (bgra[i * 4] ?? 0) / 255;
      raw[pixels + i] = (bgra[i * 4 + 1] ?? 0) / 255;
      raw[2 * pixels + i] = (bgra[i * 4 + 2] ?? 0) / 255;
    }

    // Real production path: normalizeForRec -> session -> decodeCtc.
    const { data, width: recW, height: recH } = normalizeForRec(raw, width, height, 48);
    const out = await session.run({ x: new ort.Tensor('float32', data, [1, 3, recH, recW]) });
    const key = Object.keys(out)[0] as string;
    const tensor = out[key] as ort.Tensor;
    const numClasses = tensor.dims[2] as number;
    if (numClasses !== dict.length) {
      throw new Error(`class count ${numClasses} != dict ${dict.length}`);
    }
    const { text: rawDecoded, confidence } = decodeCtc(
      tensor.data as Float32Array,
      numClasses,
      dict
    );
    const recovered = recoverUtf8(rawDecoded);
    const best = recovered ?? rawDecoded;
    const exact = best === expected;
    const { intact, total } = byteIntactRate(expected, vocabSet);
    const asciiOnly = /^[\x00-\x7f]*$/.test(expected);

    if (asciiOnly && best !== expected) guardFailed = true;

    summary.push({
      fixture: fixture.file,
      script: asciiOnly ? 'ascii' : 'non-ascii',
      exact,
      charSimilarity: Number(similarity(best, expected).toFixed(3)),
      bytesRepresentable: total > 0 ? `${intact}/${total}` : 'n/a',
      recovered: recovered !== null,
    });

    console.log(`── ${fixture.file} (${asciiOnly ? 'ASCII' : 'non-ASCII'})`);
    console.log(`   expected : ${expected}`);
    console.log(`   decoded  : ${rawDecoded}`);
    if (recovered !== null) console.log(`   recovered: ${recovered}`);
    console.log(
      `   exact=${exact} sim=${similarity(best, expected).toFixed(3)}` +
        (total > 0 ? ` bytesRepresentable=${intact}/${total}` : '') +
        ` conf=${confidence.toFixed(2)}`
    );
  }

  const nonAscii = summary.filter((s) => s['script'] === 'non-ascii');
  const asciiOk = summary.filter((s) => s['script'] === 'ascii' && s['exact']).length;
  const nonAsciiExact = nonAscii.filter((s) => s['exact']).length;
  console.log(`\nsummary: ascii exact ${asciiOk}/${summary.filter((s) => s['script'] === 'ascii').length},` +
    ` non-ascii exact ${nonAsciiExact}/${nonAscii.length}`);

  if (guard) {
    if (guardFailed) {
      console.error('\nGUARD FAILED: an ASCII fixture no longer decodes exactly.');
      process.exit(1);
    }
    console.log('guard ok');
  }
}

void main();
