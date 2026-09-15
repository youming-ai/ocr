# OCR

### Your Files Never Leave Your Device

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🌐 **Live**: [ocr.um1ng.me](https://ocr.um1ng.me)

On-device OCR powered by PaddleOCR PP-OCRv6. Extract text from images and PDFs — files stay in your browser.

## 🚀 Quick start

### Prerequisites

- **Bun** ≥ 1.4 (pinned by `packageManager`; Node ≥ 20 is accepted for engine compatibility)

### Install & run

```bash
git clone https://github.com/youming-ai/ocr.git
cd ocr
bun install
bun run dev
```

Open http://localhost:5173.

`bun install` also runs `postinstall`, which copies the ONNX Runtime WASM binaries and the PDF.js worker out of `node_modules` into `public/`. If those assets 404, re-run `bun install`.

## 🏗️ Tech stack

- **OCR**: PaddleOCR PP-OCRv6 (DBNet detector + SVTR-LCNet/CTC recogniser) via ONNX Runtime Web — runs entirely in-browser
- **Framework**: React 19 + TanStack Router (CSR SPA)
- **API layer**: Hono v4 mounted at `/api/*` (health check and headers only; no OCR server-side)
- **Styling**: Tailwind CSS v4 with Vercel Geist design tokens (light theme only)
- **Testing**: Bun test runner (`bun test`)
- **Linting/formatting**: Biome v2 (`bun run lint`)
- **Build**: Vite 7
- **Runtime**: Bun
- **Deploy**: Cloudflare Workers (`bun run deploy`) or the bundled Docker image (`src/prod-server.ts`) for self-hosting

## ⚡ Performance notes

OCR is CPU-bound WASM. Two things bound throughput:

- **Threads.** ONNX Runtime uses a single WASM thread unless the document is
  cross-origin isolated. Serving the app with the isolation headers enables
  multi-threaded execution (the runtime picks them up automatically, capped at 4):

  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  ```

  Apply them to *every* response (HTML, JS, WASM, models) or the browser drops
  isolation. Cloudflare Workers can do this from a `public/_headers` file; the
  bundled `src/prod-server.ts` does not set them yet.
- **Recognition batching.** Crops are currently recognised one at a time; batching
  them into a single `rec.run()` call is the main remaining speed-up (see the note
  at the end of `src/lib/ocr/pipeline.ts`).

## 🔒 Privacy

- **OCR runs in-browser.** Source files never leave your device — all processing happens locally via WASM.
- **No AI/LLM processing.** No extracted text is sent to any server or third-party model.
- **API layer only serves metadata.** The Hono backend provides health checks and static metadata — it never receives files or OCR output.

## 🔗 Model files

`det.onnx`, `rec.onnx`, and `ppocrv6_dict.txt` live in `public/models/pp-ocrv6-small/`.
Provenance, language coverage, and the exact preprocessing/postprocessing
parameters each model was exported with are documented in
[`public/models/pp-ocrv6-small/README.md`](public/models/pp-ocrv6-small/README.md).

## 📄 License

MIT — see [LICENSE](LICENSE).
