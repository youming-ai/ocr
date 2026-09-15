import { Link } from '~/components/link';
import { useDocumentHead } from '~/components/seo/head';

/**
 * Shared not-found view: rendered at `/404` and for every unmatched path via the
 * root route's `notFoundComponent`.
 *
 * It deliberately renders no `<main>` and no `id="main-content"`: the app shell
 * already provides the main landmark, and duplicating either is invalid HTML.
 */
export function NotFoundPage() {
  useDocumentHead({
    title: 'Page not found',
    description: "The page you're looking for doesn't exist.",
    path: '/404',
    appendSiteName: false,
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to home
      </Link>
    </div>
  );
}
