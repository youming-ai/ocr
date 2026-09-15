import { createFileRoute } from '@tanstack/react-router';
import { NotFoundPage } from '~/components/not-found';

export const Route = createFileRoute('/404')({
  component: NotFoundPage,
});
