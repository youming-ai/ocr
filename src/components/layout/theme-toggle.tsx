// Deprecated: kept as a placeholder for the future Vercel dark theme. Clicking is currently a no-op.
import { Sun } from 'lucide-react';
import { Button } from '~/components/ui/button';

export function ThemeToggle() {
  return (
    <Button variant="ghost" size="icon" type="button" aria-label="Toggle theme">
      <Sun className="h-[1.2rem] w-[1.2rem]" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
