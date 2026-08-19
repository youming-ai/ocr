# PDF Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PDF rendering support and update file size limits for Parsify OCR.

**Architecture:** PDF pages rendered to canvas via `pdfjs-dist`, then each page image processed through existing OCR pipeline. Multi-page results aggregated for enhance.

**Tech Stack:** pdfjs-dist, existing onnxruntime-web + React + TanStack Router

---

## Task 1: Add pdfjs-dist dependency

- [ ] Run `bun add pdfjs-dist`
- [ ] Commit: `feat: add pdfjs-dist dependency`

## Task 2: Create PDF renderer

**Files:**
- Create: `src/lib/ocr/pdf-renderer.ts`

- [ ] Write `src/lib/ocr/pdf-renderer.ts`:

```typescript
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { logger } from '~/lib/logger';

// Configure the self-hosted pdf.js worker copied into /public by postinstall
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface RenderPdfOptions {
  /** Maximum number of pages to render (default: 50) */
  maxPages?: number;
  /** Render scale — 2 = 2x resolution (default: 2) */
  scale?: number;
  /** Maximum render width in pixels (default: 960) */
  maxWidth?: number;
}

export interface PdfRenderResult {
  /** Object URLs for each rendered page image */
  pages: string[];
  /** Total pages in the PDF document */
  totalPages: number;
}

/**
 * Render PDF pages to image Object URLs.
 * Each page is rendered to a canvas, then converted to a blob URL.
 */
export async function renderPdfPages(
  file: File,
  opts?: RenderPdfOptions,
): Promise<PdfRenderResult> {
  const maxPages = opts?.maxPages ?? 50;
  const scale = opts?.scale ?? 2;
  const maxWidth = opts?.maxWidth ?? 960;

  const arrayBuffer = await file.arrayBuffer();
  const pdf: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pagesToRender = Math.min(totalPages, maxPages);

  if (totalPages > maxPages) {
    logger.warn(`PDF has ${totalPages} pages, limiting to ${maxPages}`);
  }

  const pages: string[] = [];

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    // Cap width
    const actualScale = viewport.width > maxWidth ? (maxWidth / page.getViewport({ scale: 1 }).width) : scale;
    const cappedViewport = page.getViewport({ scale: actualScale });

    const canvas = document.createElement('canvas');
    canvas.width = cappedViewport.width;
    canvas.height = cappedViewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas 2d context');

    await page.render({ canvasContext: ctx, viewport: cappedViewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to convert canvas to blob'));
      }, 'image/png');
    });

    pages.push(URL.createObjectURL(blob));
  }

  logger.info(`Rendered ${pagesToRender}/${totalPages} PDF pages`);

  return { pages, totalPages };
}
```

- [ ] Commit: `feat: add PDF page renderer`

## Task 3: Update types

**Files:**
- Modify: `src/lib/ocr/types.ts`

- [ ] Add to `src/lib/ocr/types.ts`:

```typescript
/** Result from processing a single PDF page */
export interface PdfPageResult {
  /** 1-based page number */
  pageNumber: number;
  /** OCR result for this page */
  ocr: OcrResult;
  /** Object URL of the rendered page image */
  imageSrc: string;
}
```

- [ ] Commit: `feat: add PdfPageResult type`

## Task 4: Update image-upload component

**Files:**
- Modify: `src/components/ocr/image-upload.tsx`

- [ ] Changes:
  - Add `'application/pdf'` to `ACCEPTED_TYPES`
  - Change `MAX_SIZE` to `10 * 1024 * 1024` (10MB) for images
  - Add `PDF_MAX_SIZE = 200 * 1024 * 1024` (200MB) for PDFs
  - Update `validate()` to use different limits based on file type
  - Update hint text: "PNG, JPEG, WebP, BMP, TIFF, PDF — up to 10MB (images) / 200MB (PDF)"
  - Update `accept` attribute on input

- [ ] Commit: `feat: accept PDF uploads with size limits`

## Task 5: Update homepage for PDF flow

**Files:**
- Modify: `src/routes/index.tsx`

- [ ] Changes:
  - Import `renderPdfPages` from `~/lib/ocr/pdf-renderer`
  - Add state: `pdfPages`, `currentPage`, `totalPages`, `allPageResults`
  - In `handleImageSelect`:
    - If `file.type === 'application/pdf'`: render pages, iterate OCR per page
    - If image: existing single-image flow
  - Show page navigation when PDF (prev/next buttons + "Page X of Y")
  - Aggregate all page texts for enhance request
  - Update progress message: "Processing page X of Y..."

- [ ] Commit: `feat: PDF multi-page OCR flow`

## Task 6: Verify and cleanup

- [ ] Run `bun run lint`
- [ ] Run `bun run typecheck`
- [ ] Run `bun test`
- [ ] Run `bun run build`
- [ ] Commit if fixes needed
