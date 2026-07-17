# Parsify

### Your Files Never Leave Your Device

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🌐 **Live**: [parsify.dev](https://parsify.dev)

On-device OCR powered by PaddleOCR PP-OCRv6. Extract text from images and PDFs — files stay in your browser.

## 🚀 Quick start

### Prerequisites

- **Bun** ≥ 1.3

### Install & run

```bash
git clone https://github.com/youming-ai/parsify.dev.git
cd parsify.dev
bun install
bun run dev
```

Open http://localhost:5173.

## 🏗️ Tech stack

- **OCR**: PaddleOCR PP-OCRv6 via ONNX Runtime Web (WASM) — runs entirely in-browser
- **Framework**: React 19 + TanStack Router
- **API layer**: Hono v4 mounted at `/api/*`
- **Validation**: Zod 4
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Testing**: Bun test runner
- **Linting**: Biome v2
- **Logging**: pino + hono-pino
- **Build**: Vite 7
- **Runtime**: Bun (Node ≥ 20 also supported)
- **Deploy**: Dokploy + Docker

## 🔒 Privacy

- **OCR runs in-browser.** Source files never leave your device — all processing happens locally via WASM.
- **No AI/LLM processing.** No extracted text is sent to any server or third-party model.
- **API layer only serves metadata.** The Hono backend provides health checks, SEO assets, and static metadata — it never receives files or OCR output.

## 📄 License

MIT — see [LICENSE](LICENSE).
