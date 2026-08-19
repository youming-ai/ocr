import { useI18n } from '~/components/i18n-provider';
import type { TextBox } from '~/lib/ocr/types';
import { cn } from '~/lib/utils';

interface OcrResultListProps {
  boxes: TextBox[];
  highlightedIndex: number | null;
  onBoxHover: (index: number | null) => void;
  className?: string;
}

/**
 * Per-line recognition view. Each line maps to a detection box, so hovering a
 * line highlights its region on the source canvas (and vice-versa).
 */
export function OcrResultList({
  boxes,
  highlightedIndex,
  onBoxHover,
  className,
}: OcrResultListProps) {
  const { t } = useI18n();
  if (boxes.length === 0) {
    return <p className={cn('text-sm text-muted-foreground', className)}>{t('output.noLines')}</p>;
  }

  return (
    <ul className={cn('space-y-px', className)}>
      {boxes.map((box, i) => {
        const active = i === highlightedIndex;
        const pct = Math.round(box.confidence * 100);
        return (
          <li
            key={i}
            className={cn(
              'flex items-center gap-3 rounded px-2 py-1.5 transition-colors',
              active ? 'bg-foreground/10 ring-1 ring-foreground/20' : 'hover:bg-muted'
            )}
            onMouseEnter={() => onBoxHover(i)}
            onMouseLeave={() => onBoxHover(null)}
          >
            <span className="min-w-0 flex-1 break-words font-mono text-sm text-foreground">
              {box.text}
            </span>
            <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
              <span
                className={cn('block h-full', active ? 'bg-foreground' : 'bg-blue-700')}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
              {pct}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}
