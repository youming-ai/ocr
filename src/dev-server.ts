import { logger } from '~/lib/logger';
import { app } from '~/server/hono';

const PORT = Number(process.env['API_PORT'] || '3001');

const env = {
  PUBLIC_ORIGIN: process.env['PUBLIC_ORIGIN'] || 'http://localhost:5173',
};

Bun.serve({
  fetch: (request: Request) => app.fetch(request, env),
  port: PORT,
});

logger.info(`API server running on http://localhost:${PORT}`);
logger.info(`Proxied by Vite at ${env.PUBLIC_ORIGIN}/api/*`);
