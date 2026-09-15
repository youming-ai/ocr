import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    // The Cloudflare plugin builds the client into dist/client and also emits a
    // bundled Worker (dist/ocr/index.js). Only dist/client is deployed by this
    // repo's `wrangler deploy`, which bundles src/worker.ts itself from
    // wrangler.toml — the extra Worker output is a side effect of the plugin,
    // not the deploy artifact.
    ...(mode !== 'development' ? [cloudflare()] : []),
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    // onnxruntime-web resolves its "external wasm" build only under this
    // condition; without it the bundler pulls in the JSEP variant.
    conditions: ['onnxruntime-web-use-extern-wasm'],
    alias: {
      '~': '/src',
    },
  },
  server: {
    // Dev only: the Hono API runs separately via `bun run dev:api`.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
