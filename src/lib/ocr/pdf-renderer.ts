import type { PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';

// Serve the pdf.js worker from our own origin (copied into /public by the
// postinstall step) rather than a third-party CDN, so PDF OCR is not broken by
// CSP rules, locked-down networks, or a CDN outage, and the worker version is
// guaranteed to match the bundled pdfjs-dist.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Default page ceiling. Each rendered page holds a PNG blob URL alive for the
// page navigator, so an unbounded cap (the previous 1000) let a single large
// PDF allocate hundreds of canvases and retained blobs and freeze the tab
// before any OCR ran. 50 keeps worst-case memory bounded; callers can raise it.
const DEFAULT_MAX_PAGES = 50;

export interface RenderedPdfPage {
  pageNumber: number;
  /** Object URL for the rendered page PNG. Caller owns its lifecycle. */
  imageSrc: string;
  totalPages: number;
  /** Number of pages that will actually be rendered (after the maxPages cap). */
  pagesToRender: number;
}

export interface RenderPdfOptions {
  maxPages?: number;
  scale?: number;
  maxWidth?: number;
  /** Aborts rendering between pages; the in-flight page resolves, then we stop. */
  signal?: AbortSignal;
  /**
   * Invoked after each page is rendered. Rendering is interleaved with this
   * callback, so a caller can OCR (and the GC can reclaim each canvas) before
   * the next page is rendered instead of materializing every page up front.
   */
  onPage?: (page: RenderedPdfPage) => Promise<void> | void;
}

export interface PdfRenderResult {
  /** Object URLs for every rendered page, in order. Caller must revoke them. */
  pages: string[];
  totalPages: number;
}

class AbortError extends Error {
  constructor() {
    super('PDF rendering was cancelled');
    this.name = 'AbortError';
  }
}

export async function renderPdfPages(
  file: File,
  opts?: RenderPdfOptions
): Promise<PdfRenderResult> {
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES;
  const scale = opts?.scale ?? 2;
  const maxWidth = opts?.maxWidth ?? 960;
  const signal = opts?.signal;

  const throwIfAborted = () => {
    if (signal?.aborted) throw new AbortError();
  };

  throwIfAborted();

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  try {
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pagesToRender = Math.min(totalPages, maxPages);

    if (totalPages > maxPages) {
      console.warn(`[WARN] PDF has ${totalPages} pages, limiting to ${maxPages}`);
    }

    const pages: string[] = [];

    for (let i = 1; i <= pagesToRender; i++) {
      throwIfAborted();

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const actualScale =
        viewport.width > maxWidth ? maxWidth / page.getViewport({ scale: 1 }).width : scale;
      const cappedViewport = page.getViewport({ scale: actualScale });

      const canvas = document.createElement('canvas');
      canvas.width = cappedViewport.width;
      canvas.height = cappedViewport.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas 2d context');

      try {
        await page.render({ canvas, canvasContext: ctx, viewport: cappedViewport }).promise;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error('Failed to convert canvas to blob'));
          }, 'image/png');
        });

        const imageSrc = URL.createObjectURL(blob);
        pages.push(imageSrc);

        await opts?.onPage?.({ pageNumber: i, imageSrc, totalPages, pagesToRender });
      } finally {
        // Release the page's internal resources and drop the canvas backing
        // store so memory is reclaimed before the next iteration.
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    console.log(`[INFO] Rendered ${pages.length}/${totalPages} PDF pages`);

    return { pages, totalPages };
  } finally {
    await loadingTask.destroy();
  }
}
