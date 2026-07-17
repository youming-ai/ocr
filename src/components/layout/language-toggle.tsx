import { useI18n } from '~/components/i18n-provider';
import type { Lang } from '~/lib/i18n/translations';
import { cn } from '~/lib/utils';

const OPTIONS: { value: Lang; label: string; name: string }[] = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'zh', label: '中', name: '中文' },
  { value: 'ja', label: '日', name: '日本語' },
];

export function LanguageToggle() {
  const { lang, setLang } = useI18n();

  return (
    <div className="flex items-center rounded-md border p-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setLang(opt.value)}
          aria-label={opt.name}
          aria-pressed={lang === opt.value}
          className={cn(
            'rounded px-2 py-0.5 font-mono text-[11px] tracking-wider transition-colors',
            lang === opt.value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
