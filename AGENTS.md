# Repository Guidelines

## Project Overview
OCR is a privacy-first, fully client-side OCR (Optical Character Recognition) application. Users upload an image or PDF, and PaddleOCR PP-OCRv6 small runs completely within the browser via ONNX Runtime Web (WASM). A comparison interface displays the source vs. extracted text. All files remain strictly local; there is no server-side OCR and no external AI/LLM processing. The backend `/api` layer only serves static metadata, health checks, and SEO assets.

*Note: The project was previously a server-side Jina Reader + DeepSeek SEO tool. All Jina/DeepSeek API endpoints, SSRF validation guards, and server-side rate limits are deprecated or deleted. Ignore stale documentation referencing them.*

## Architecture & Data Flow
The application runs as a Client-Side Rendered (CSR) Single Page Application (SPA) built on React 19, Vite 7, and Hono.

### Client-Side OCR Pipeline
The core OCR flow runs entirely in the browser, orchestrated by `OcrEngine` (`src/lib/ocr/engine.ts`), a lazily-constructed singleton facade:
1. **File Handoff**: The file upload is handled in `src/routes/index.tsx` which calls `setPendingFile(file)` in `src/lib/ocr/scan-input.ts` (a non-reactive, transition-safe in-memory singleton) and navigates to `/scan`.
2. **Scan Route**: `src/routes/scan.tsx` fetches the file using `takePendingFile()` on mount. It utilizes a `startedRef` guard to ensure the pipeline runs exactly once under React StrictMode.
3. **Model Loading & Caching**: `src/lib/ocr/model-loader.ts` downloads `det.onnx`, `rec.onnx`, and `ppocrv6_dict.txt` from `/models/pp-ocrv6-small/` on the first run, caches the buffers in IndexedDB, and initializes the `onnxruntime-web` sessions.
4. **PDF Handling**: If the input is a PDF, `src/lib/ocr/pdf-renderer.ts` renders pages one by one using a PDF.js worker thread to bound peak memory usage.
5. **Preprocessing**: `src/lib/ocr/preprocessor.ts` resizes the image, snaps dimensions to multiples of 32 (detector requirement), and produces a raw CHW Float32 buffer in **BGR** order scaled to `[0,1]`. That buffer is deliberately model-agnostic; `normalizeForDet()` applies the detector's ImageNet mean/std and `normalizeForRec()` applies the recogniser's `(x - 0.5) / 0.5`. Both models were exported from a PaddleOCR `PreProcess` that decodes with `img_mode: BGR` and has no normalization baked into the graph, so the channel order and the per-model normalization must not be merged or dropped — see `public/models/pp-ocrv6-small/README.md`.
6. **Inference Pipeline**: `src/lib/ocr/pipeline.ts` runs detection and feeds cropped tensors to the recognition model. Crops are taken from the *raw* buffer, so recognition re-normalizes them itself. Direction classification is intentionally not used in the current PP-OCRv6 small deployment.
7. **Postprocessing**: `src/lib/ocr/postprocessor.ts` thresholds the DBNet probability map, drops boxes whose mean score is below `box_threshold` (0.45), applies the unclip ratio, then Non-Maximum Suppression, sorts coordinate regions, and decodes recognition scores into character strings using CTC greedy decoding. Defaults mirror the detector's published postprocess config (`thresh 0.2`, `box_thresh 0.45`, `unclip_ratio 1.4`).
8. **Character Translation**: `OcrEngine` translates class indices using the embedded or external character dictionary (`ppocrv6_dict.txt`). The recognition model's class size must strictly match `dict length + 2` (prepended CTC blank index 0 and a trailing space; currently 18710 classes for 18708 dictionary entries).

**Known limitation (do not "fix" locally)**: the shipped rec checkpoint emits non-ASCII characters as CP1252-rendered UTF-8 bytes (`本` → `æœ¬`), and missing dictionary entries make the text unrecoverable. ASCII is unaffected; product copy stays English-first. Details, reproducer (`bun scripts/verify-rec-model.ts`, CI-guarded via `src/__tests__/fixtures/rec/`) and the filed upstream issue ([#18364](https://github.com/PaddlePaddle/PaddleOCR/issues/18364)): `docs/upstream-rec-non-ascii.md`.

### Server & Deployment Layers
The Hono backend API (`src/server/hono.ts`) is mounted at `/api` and serves `/health` (plus CORS, security headers, and request logging). It does not contain OCR business logic. `robots.txt`, `sitemap.xml`, and `llm.txt` are plain static files in `public/`, not API routes. The Hono router is mounted by three entrypoints:
- **Cloudflare Worker**: `src/worker.ts` handles API routes and serves frontend static assets using Cloudflare Workers Assets via the `ASSETS` binding, configured in `wrangler.toml` with SPA fallback. `src/worker.ts` is the deploy artifact `wrangler deploy` bundles.
- **Bun Self-Host**: `src/prod-server.ts` runs a standalone production server via `Bun.serve`, serving static build assets from `dist/client` and falling back to `index.html` for frontend SPA routing (with path-traversal guards).
- **Local Dev Server**: `src/dev-server.ts` runs a Hono server on port 3001 (loopback by default), while Vite (port 5173) handles dev hot-reloading and proxies `/api` requests to port 3001 through `vite.config.ts`.

**Merging to `main` deploys to production**: a Cloudflare Workers Build (`Workers Builds: ocr` in PR checks) runs on every push to `main`, so treat `main` as live. `bun run deploy` is only for out-of-band releases.

## Key Directories
- `src/routes/`: TanStack Router file-based frontend routes (`__root.tsx`, `index.tsx`, `scan.tsx`, `404.tsx`). Unknown paths render `src/components/not-found.tsx` via the root route's `notFoundComponent`.
- `src/server/`: Hono router only (`hono.ts`). The server entrypoints (`worker.ts`, `dev-server.ts`, `prod-server.ts`) live at the `src/` root.
- `src/lib/ocr/`: Core OCR engine, model loader, preprocessing, postprocessing, and PDF renderer.
- `src/components/ocr/`: Frontend OCR UI components (e.g., canvas overlay, upload forms, result lists).
- `src/components/ui/`: Hand-rolled UI primitives in shadcn/ui style (no shadcn or CVA dependency).
- `src/styles/`: Tailwind CSS entrypoint (`app.css`) and global theme configurations.
- `src/__tests__/`: Unit tests for pure OCR logic (preprocessor, postprocessor, pipeline, scan-session) plus `tsconfig.test.json`, which type-checks them separately because the main tsconfig excludes them.

## Development Commands
Manage and run tasks via Bun:

| Command | Action |
|---|---|
| `bun run dev` | Starts Vite dev server (UI on `:5173`, API proxy on `:3001`) |
| `bun run dev:ui` | Starts Vite frontend dev server only |
| `bun run dev:api` | Starts backend dev server on `:3001` only |
| `bun run build` | Builds frontend assets (`dist/client`) and generates router routes |
| `bun run start` | Runs the production server via `src/prod-server.ts` |
| `bun run deploy` | Vite build followed by `wrangler deploy` to Cloudflare |
| `bun run typecheck` | Runs `tsc --noEmit`, then `tsc -p tsconfig.test.json --noEmit` for the test files |
| `bun run lint` | Runs Biome code checks on `src/` |
| `bun run lint:fix` | Automatically fixes code style violations |
| `bun run format` | Runs Biome formatter on `src/` |
| `bun test` | Runs the test suite |
| `bun test <file>` | Runs a specific test file (e.g. `bun test src/__tests__/lib/ocr/pipeline.test.ts`) |
| `bun scripts/verify-rec-model.ts` | Recognition fixtures through the real decode path (`--guard`: ASCII check used by CI) |

*Note: the `postinstall` script copies ONNX SIMD WASM binaries and the PDF.js worker from `node_modules` into `public/`. If WASM or worker files 404 on fresh builds, execute `bun install`.*

## Code Conventions & Common Patterns
- **Formatting & Style**: Strictly enforced by Biome (2-space indents, single quotes, mandatory semicolons, ES5 trailing commas). Unused variables and imports are treated as compilation errors.
- **Path Aliasing**: Always import local modules via `~/*` mapping to `src/*` (e.g., `~/lib/ocr/engine`). Relative path-backs (`../../`) are discouraged.
- **TypeScript strict rules**:
  - `noPropertyAccessFromIndexSignature` is enabled: accessing environment variables or index signatures like `process.env.NODE_ENV` will fail. You must use brackets: `process.env['NODE_ENV']`.
  - `noUncheckedIndexedAccess` is enabled: array element accesses are typed as optional (potentially `undefined`), requiring explicit guard checks.
- **State Management & Async**:
  - Single-run execution: React `StrictMode` in development executes hooks twice. Protect initialization and transition flows using `useRef` guards (e.g., `startedRef`).
  - Route transition handoffs: Avoid large file serializations in route URLs. Pass files using the non-reactive global singleton in `src/lib/ocr/scan-input.ts`.
  - Avoid revoking object URLs too aggressively in route components (leads to StrictMode lifecycle race conditions).
- **Design Tokens**: Standardized via Vercel Geist design tokens in `src/styles/app.css` (`@theme`).
  - Layer 1: Semantic variables (e.g., `--color-background`, `--color-primary`, `--color-ring`).
  - Layer 2: Full Geist gray/accent palette (e.g. `bg-blue-700`, `text-gray-900`).
  - Layer 3: Geometry/motion/elevation.
  - Accent scale: Accent color is pinned to a single scale (e.g., `blue-700`).
  - Dark theme is out of scope; the current application is light-only and the toggle is a deprecated no-op placeholder.
- **Imports**: Import UI primitives from `~/components/ui/` and use `cn()` from `~/lib/utils` for Tailwind CSS class merging.
- **Security / Randomness**: Always use Web Crypto API (`crypto.subtle`) for security-critical actions. Never use `Math.random()`.
- **Commit Attribution**:
  All AI commits must append:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

## Important Files
- `src/client.tsx`: SPA entrypoint; creates the TanStack Router instance (`src/router.tsx` does not exist — routing setup lives here and in `src/routes/`).
- `src/routes/__root.tsx`: Root route; owns the app shell and the `notFoundComponent` used for unmatched paths.
- `src/server/hono.ts`: Central Hono router; serves `/health` only (robots/sitemap/llm.txt are static files).
- `src/lib/ocr/engine.ts`: High-level OCR singleton facade.
- `src/lib/ocr/model-loader.ts`: Local model IndexedDB caching and WASM setup.
- `src/lib/ocr/scan-session.ts`: One scan lifecycle (model load, inference, progress, cancellation, exports).
- `package.json`: Dependencies, dev scripts, and assets `postinstall` triggers.
- `wrangler.toml`: Cloudflare Worker and Asset binding setup.
- `Dockerfile` / `docker-compose.yml`: Server self-hosting templates.
- `biome.json` / `lefthook.yml` / `tsconfig.test.json`: Lint rules, pre-commit hooks, and the test type-check config.

## Runtime/Tooling Preferences
- **Runtime**: Bun (1.4.x, pinned via `packageManager`) is required. Node >= 20 is accepted for engine compatibility, but development, scripts, and production processes run under Bun.
- **Package Manager**: Bun is the exclusive package manager. Do not use npm or yarn.
- **Tooling Constraints**:
  - Biome v2 is used instead of ESLint/Prettier.
  - Lefthook hooks are used to run Biome checks pre-commit.
  - `onnxruntime-web` requires specific resolving conditions (`onnxruntime-web-use-extern-wasm`) configured in `vite.config.ts`.

## Testing & QA
- **Framework**: Bun test runner (`bun:test`) is used.
- **Environment**: Node.js environment (no browser DOM emulation); `src/__tests__/setup.ts` stubs `DOMMatrix` for the `pdfjs-dist` import.
- **Scope**: Testing is restricted to pure-logic modules (`src/__tests__/lib/ocr/*` covering the preprocessor, postprocessor, pipeline, and scan-session). Browser-only modules (`model-loader`, `pdf-renderer`, components) are not unit-tested.
- **Type checking**: The main `tsconfig.json` excludes `src/__tests__/**`, so test files are checked by `tsconfig.test.json` instead — keep both green, or a type error in a test (e.g. a drifting fake) goes unnoticed.
- **Coverage**: Coverage is validated in CI (`.github/workflows/ci.yml`) using `bun run test -- --coverage`.
- **Verification**: UI, layout, and page routing logic are not unit-tested. Verify UI changes visually by driving the application in a browser environment.
