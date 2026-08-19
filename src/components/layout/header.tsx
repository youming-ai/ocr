import { Link } from '~/components/link';
import { LanguageToggle } from './language-toggle';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-6 lg:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          {/* Detection-bracket mark: corner registration around the glyph */}
          <span className="relative grid h-6 w-6 place-items-center">
            <span className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-foreground" />
            <span className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r-2 border-t-2 border-foreground" />
            <span className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2 border-foreground" />
            <span className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2 border-foreground" />
            <span className="h-2 w-2 bg-foreground" />
          </span>
          <span className="font-mono text-sm font-semibold tracking-[0.18em]">OCR</span>
        </Link>

        <div className="flex items-center gap-2">
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
