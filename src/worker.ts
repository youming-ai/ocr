import { app } from '~/server/hono';

interface Env {
  PUBLIC_ORIGIN?: string;
  LOG_LEVEL?: string;
  ASSETS?: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API routes → Hono app
    if (url.pathname.startsWith('/api')) {
      return app.fetch(request, env);
    }

    // Everything else is a static asset or an SPA route. The `ASSETS` binding
    // (configured in wrangler.toml with single-page-application not-found
    // handling) serves real files and falls back to index.html for client
    // routes. Guard against a missing binding so a misconfiguration surfaces as
    // a clear 500 instead of a `Cannot read properties of undefined` crash.
    if (!env.ASSETS) {
      return new Response('Static asset binding is not configured', { status: 500 });
    }

    return env.ASSETS.fetch(request);
  },
};
