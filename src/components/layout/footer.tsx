import { Mail } from 'lucide-react';
import { useI18n } from '~/components/i18n-provider';
import { Link } from '~/components/link';

const socialLinks = [
  {
    name: 'GitHub',
    href: 'https://github.com/youming-ai/ocr',
    icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
      </svg>
    ),
  },
  {
    name: 'X',
    href: 'https://x.com/um1ng_x',
    icon: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  { name: 'Email', href: 'mailto:ikashue@gmail.com', icon: Mail },
];

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t bg-background text-foreground">
      <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row lg:px-8">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
            <span className="text-green-700">●</span> {t('footer.status')}
          </p>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} OCR</p>
        </div>

        <div className="flex items-center gap-4">
          {socialLinks.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="sr-only">{item.name}</span>
              <item.icon className="h-4 w-4" />
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
