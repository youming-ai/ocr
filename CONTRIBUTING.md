# Contributing to OCR

Thank you for your interest in contributing to OCR! This document provides guidelines and instructions for contributing.

## Development Setup

- [Bun](https://bun.sh/) ≥ 1.4
- A modern browser with WebAssembly support

### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/ocr.git
   cd ocr
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Copy the environment file if you want local overrides:
   ```bash
   cp .env.example .env
   ```
5. Start the development server:
   ```bash
   bun run dev
   ```

Open http://localhost:5173 to see the app.

## Development Commands

| Command | Description |
|---|---|
| `bun run dev` | Start Vite dev server |
| `bun run build` | Build for production |
| `bun run typecheck` | Run TypeScript type checking |
| `bun test` | Run tests |
| `bun run lint` | Run Biome linter |
| `bun run lint:fix` | Fix lint issues |
| `bun run format` | Format code |
| `bun scripts/verify-rec-model.ts` | Run the recognition fixtures through the real decode path (`--guard` = ASCII-only check used by CI) |

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The configuration is in `biome.json`.

Key conventions:
- 2-space indent
- 100 char line width
- Single quotes, JSX double quotes
- Semicolons always
- Trailing commas (ES5)
- LF line endings

Please run `bun run lint` and `bun run format` before submitting a PR.

## Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Run tests: `bun test`
4. Run lint: `bun run lint`
5. Run typecheck: `bun run typecheck`
6. Commit your changes with a descriptive message
7. Push to your fork and submit a Pull Request

Changes touching OCR preprocessing/postprocessing, the model files, or the dictionary must keep the
committed recognition fixtures green — run `bun scripts/verify-rec-model.ts`. ASCII fixtures are
CI-enforced; open non-ASCII numbers are tracked upstream (see `docs/upstream-rec-non-ascii.md`).

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what the PR does
- Reference any related issues
- Ensure all tests pass
- Ensure linting passes
- Add tests for new features

## Reporting Issues

- Use the GitHub issue tracker
- Include steps to reproduce the issue
- Include expected vs actual behavior
- Include your environment details (OS, Bun version, etc.)

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for reporting instructions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
