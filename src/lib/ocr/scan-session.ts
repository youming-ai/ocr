import type { TranslationKey } from '~/lib/i18n/translations';
import { logger } from '~/lib/logger';
import type { OcrEngine } from './engine';
import type { OcrProgress, PdfPageResult } from './types';

export type ScanStatus =
  | { stage: 'idle' }
  | { stage: 'loading'; progress: OcrProgress }
  | { stage: 'processing'; progress: OcrProgress }
  | { stage: 'done' }
  | { stage: 'error'; message: string };

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

interface ScanDeps {
  file: File;
  engine: OcrEngine;
  onUpdate(state: ScanSessionState): void;
  navigateHome(): void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

/**
 * Owns a single scan lifecycle: model loading, image/PDF inference, progress,
 * cancellation, and object URL cleanup. The route consumes the small ScanSession
 * interface and no longer needs to orchestrate the pipeline inline.
 */
export async function runScanSession(deps: ScanDeps): Promise<ScanSession> {
  const { file, engine, onUpdate, navigateHome, t } = deps;

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

  function setStatus(next: ScanStatus) {
    state.status = next;
    onUpdate({ ...state });
  }

  function reportProgress(stage: OcrProgress['stage'], progress: number, message: string) {
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
    if (state.pages.length > 0) {
      const current = state.pages[state.activePage - 1];
      return current?.ocr.text ?? '';
    }
    return state.pages[0]?.ocr.text ?? '';
  }

  function exportAllPagesDoc(): string {
    return state.pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.ocr.text}`).join('\n\n');
  }

  function exportCurrentJson(): string {
    const current = state.pages.length > 0 ? state.pages[state.activePage - 1] : state.pages[0];
    if (!current) return '';
    return JSON.stringify(
      { boxes: current.ocr.boxes, text: current.ocr.text, elapsed: current.ocr.elapsed },
      null,
      2
    );
  }

  function exportAllPagesJson(): string {
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

  const session: ScanSession = {
    get state() {
      return { ...state };
    },
    cancel() {
      controller.abort();
      revokeAll();
      setStatus({ stage: 'idle' });
      fireCancelled();
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
    const message = err instanceof Error ? err.message : t('error.ocrFailed');
    logger.error(`Scan failed: ${message}`);
    setStatus({ stage: 'error', message });
    revokeAll();
  }

  function addObjectUrl(src: string) {
    objectUrls.push(src);
  }

  async function run() {
    try {
      if (file.type === 'application/pdf') {
        await ensureModels();
        // PDF.js is large; only load it when the user actually uploads a PDF.
        const { renderPdfPages } = await import('./pdf-renderer');
        await renderPdfPages(file, {
          signal: controller.signal,
          onPage: async ({ pageNumber, imageSrc, totalPages, pagesToRender }) => {
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
            state.pages.push({ pageNumber, ocr, imageSrc });
            onUpdate({ ...state });
          },
        });
      } else {
        await ensureModels();
        const src = URL.createObjectURL(file);
        addObjectUrl(src);
        state.imageSrc = src;
        reportProgress('detecting', 0.5, 'Recognizing image...');
        const result = await engine.recognize(src, (p) =>
          reportProgress(p.stage, p.progress, p.message)
        );
        state.pages.push({ pageNumber: 1, ocr: result, imageSrc: src });
        state.activePage = 1;
        onUpdate({ ...state });
      }
      setStatus({ stage: 'done' });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        logger.info('Scan cancelled by user');
        navigateHome();
        return;
      }
      handleError(err);
    }
  }

  void run();
  return session;
}
