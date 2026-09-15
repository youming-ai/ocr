import { app } from '~/server/hono';

const PORT = Number(process.env['API_PORT'] || '3001');
// Loopback by default: the API holds no secrets, but there is no reason for a
// developer's machine to expose it (and the proxied dev UI) to the LAN.
const HOST = process.env['API_HOST'] || '127.0.0.1';

const env = {
  PUBLIC_ORIGIN: process.env['PUBLIC_ORIGIN'] || 'http://localhost:5173',
};

Bun.serve({
  fetch: (request: Request) => app.fetch(request, env),
  port: PORT,
  hostname: HOST,
});

console.log(`[INFO] API server running on http://${HOST}:${PORT}`);
console.log(`[INFO] Proxied by Vite at ${env.PUBLIC_ORIGIN}/api/*`);
