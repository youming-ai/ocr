# PDF Support for Parsify OCR

**Date**: 2026-06-17
**Status**: Approved
**Scope**: Add PDF rendering + update file size limits

## Overview

Add PDF support to Parsify OCR. PDF pages are rendered to images in the browser using `pdfjs-dist`, then processed through the existing PP-OCRv6 pipeline. Also update file size limits and accepted formats.

## Requirements

- **Accepted formats**: PDF, PNG, JPEG, WebP, BMP, TIFF
- **PDF limits**: ≤200MB file size, ≤50 pages by default (callers may raise the cap)
- **Image limits**: ≤10MB per image file
- **Processing**: PDF pages rendered sequentially, each page runs through OCR pipeline
- **UI**: Page navigation for multi-page PDFs, per-page results + aggregated full-text

## Architecture

```
PDF file ──→ pdfjs-dist ──→ Page 1 Canvas ──→ OCR Pipeline ──→ Page 1 text
                        ──→ Page 2 Canvas ──→ OCR Pipeline ──→ Page 2 text
                        ──→ Page N Canvas ──→ OCR Pipeline ──→ Page N text
                                                                     │
                                                          aggregate ──→ enhance
```

Image files go directly to OCR pipeline (no PDF rendering step).

## New Dependency

| Package | Purpose |
|---|---|
| `pdfjs-dist` | PDF rendering in browser (Mozilla PDF.js) |

## Files

### Create

| File | Responsibility |
|---|---|
| `src/lib/ocr/pdf-renderer.ts` | PDF → array of page image URLs |

### Modify

| File | Changes |
|---|---|
| `src/components/ocr/image-upload.tsx` | Accept PDF, update max size to 10MB for images, 200MB for PDFs |
| `src/routes/index.tsx` | Handle PDF multi-page flow: detect PDF, render pages, iterate OCR |
| `src/lib/ocr/types.ts` | Add `PdfPageResult` type |

## Design Details

### `pdf-renderer.ts`

```typescript
export async function renderPdfPages(
  file: File,
  opts?: { maxPages?: number; scale?: number },
): Promise<{ pages: string[]; totalPages: number }>
```

- Uses `pdfjs-dist` with `GlobalWorkerOptions.workerSrc` set to the self-hosted `/pdf.worker.min.mjs`
- Renders each page to canvas at 2x scale (capped at 960px width)
- Returns Object URLs for each rendered page
- Limits to `maxPages` (default 50) to bound browser memory; callers may raise the cap
- Caller is responsible for revoking Object URLs

### `image-upload.tsx` changes

- Add `'application/pdf'` to `ACCEPTED_TYPES`
- Dual size limits: 10MB for images, 200MB for PDFs
- Update hint text to mention PDF
- Change component name from `ImageUpload` to `FileUpload` (or keep as-is)

### `index.tsx` changes

- Detect PDF vs image by `file.type`
- For PDF: render pages → show page count → iterate OCR per page
- Track current page index for display
- Aggregate all page results for enhance request
- Show "Processing page X/N" in progress
