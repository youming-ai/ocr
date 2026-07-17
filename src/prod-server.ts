import { extname, join, resolve, sep } from 'node:path';
import { logger } from '~/lib/logger';
import { app } from '~/server/hono';

const PORT = Number(process.env['PORT'] ?? '5173');
const STATIC_ROOT = resolve(
  process.env['STATIC_ROOT'] ?? join(import.meta.dir, '..', 'dist', 'client')
);

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const env = {
  PUBLIC_ORIGIN: process.env['PUBLIC_ORIGIN'] ?? `http://localhost:${PORT}`,
};

function safeStaticPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const routePath = decoded === '/' ? '/index.html' : decoded;
  const filePath = resolve(STATIC_ROOT, routePath.replace(/^\/+/, ''));
  const insideRoot = filePath === STATIC_ROOT || filePath.startsWith(`${STATIC_ROOT}${sep}`);
  return insideRoot ? filePath : null;
}

async function staticResponse(pathname: string): Promise<Response> {
  const filePath = safeStaticPath(pathname);
  if (!filePath) {
    return new Response('Bad request', { status: 400 });
  }

  let servedPath = filePath;
  let file = Bun.file(servedPath);
  if (!(await file.exists())) {
    if (extname(pathname)) {
      return new Response('Not found', { status: 404 });
    }
    servedPath = join(STATIC_ROOT, 'index.html');
    file = Bun.file(servedPath);
  }

  const extension = extname(servedPath).toLowerCase();
  const headers = new Headers({
    'content-type': MIME_TYPES[extension] ?? 'application/octet-stream',
  });

  if (pathname.startsWith('/assets/')) {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  } else if (pathname.startsWith('/models/') || pathname.startsWith('/ort/')) {
    headers.set('cache-control', 'public, max-age=86400, must-revalidate');
  } else {
    headers.set('cache-control', 'no-cache');
  }

  return new Response(file, { headers });
}

Bun.serve({
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api')) {
      return app.fetch(request, env);
    }

    return staticResponse(url.pathname);
  },
  port: PORT,
});

logger.info(`Production server running on http://localhost:${PORT}`);
