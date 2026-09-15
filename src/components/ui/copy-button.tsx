import { useEffect, useRef, useState } from 'react';
import { useI18n } from '~/components/i18n-provider';

type CopyButtonProps = {
  text: string;
  label?: string;
  className?: string;
};

export function CopyButton({ text, label, className }: CopyButtonProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Clipboard access is rejected outside a secure context and when the user
      // denies permission; reporting "Copied!" anyway would be a lie.
      console.warn(`[WARN] Clipboard write failed: ${(err as Error).message}`);
      return;
    }

    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      className={className ?? 'text-xs text-muted-foreground hover:text-foreground'}
      onClick={() => void handleCopy()}
    >
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </button>
  );
}
