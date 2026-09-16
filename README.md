# OCR

### Your Files Never Leave Your Device

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🌐 **Live**: [ocr.um1ng.me](https://ocr.um1ng.me)

On-device OCR powered by PaddleOCR PP-OCRv6. Extract text from images and PDFs — files stay in your browser.

> **Status** — English/ASCII recognition is reliable. Non-ASCII scripts (Chinese, Japanese,
> accented Latin) are degraded by an upstream model issue:
> see [docs/upstream-rec-non-ascii.md](docs/upstream-rec-non-ascii.md).

## 🚀 Quick start

Requires **Bun ≥ 1.4**.

```bash
git clone https://github.com/youming-ai/ocr.git
cd ocr
bun install     # also copies ONNX Runtime WASM + the PDF.js worker into public/
bun run dev     # UI on http://localhost:5173, API proxy on :3001
```

## 🏗️ Tech stack

- **OCR**: PaddleOCR PP-OCRv6 (DBNet detector + SVTR-LCNet/CTC recogniser) via ONNX Runtime Web — entirely in-browser
- **Framework**: React 19 + TanStack Router (CSR SPA)
- **API**: Hono v4 at `/api/*` — health check and headers only, no OCR server-side
- **Styling**: Tailwind CSS v4 with Vercel Geist tokens (light theme only)
- **Tooling**: Bun + Biome v2 + Vite 7; deploy to Cloudflare Workers (`bun run deploy`) or self-host with the bundled Docker image

## ⚡ Performance

- **Threads**: WASM runs single-threaded unless the document is cross-origin isolated. Set
  `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (plus
  `Cross-Origin-Resource-Policy: same-origin`) on *every* response to enable multi-threading.
- **Batching**: crops are recognised one at a time; batching them into one `rec.run()` call is the main remaining speed-up (see `src/lib/ocr/pipeline.ts`).

## 🔒 Privacy

- **OCR runs in-browser.** Source files never leave your device — all processing happens locally via WASM.
- **No AI/LLM processing.** No extracted text is sent to any server or third-party model.
- **API layer only serves metadata.** It never receives files or OCR output.

## 🔗 Models

`det.onnx`, `rec.onnx`, and `ppocrv6_dict.txt` live in `public/models/pp-ocrv6-small/`; provenance,
parameters, and the known limitation are documented in that directory's
[README](public/models/pp-ocrv6-small/README.md).

## 📄 License

MIT — see [LICENSE](LICENSE).
