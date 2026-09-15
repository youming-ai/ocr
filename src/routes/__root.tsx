import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { AppShell } from '~/components/layout/app-shell';
import { NotFoundPage } from '~/components/not-found';
import '~/styles/app.css';

function RootComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const Route = createRootRouteWithContext<object>()({
  component: RootComponent,
  // Unmatched paths render the shared 404 view inside the app shell. Without
  // this, TanStack Router's bare default not-found UI was shown instead of the
  // designed page, which was only reachable at the literal /404 route.
  notFoundComponent: () => <NotFoundPage />,
});
