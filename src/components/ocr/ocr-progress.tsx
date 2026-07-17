import { useI18n } from '~/components/i18n-provider';
import type { TranslationKey } from '~/lib/i18n/translations';
import type { OcrProgress } from '~/lib/ocr/types';
import { cn } from '~/lib/utils';

interface OcrProgressProps {
  progress: OcrProgress | null;
  className?: string;
}

// The OCR pipeline is a real ordered sequence, so numbered steps carry meaning.
const PIPELINE: { stage: OcrProgress['stage']; key: TranslationKey }[] = [
  { stage: 'loading-models', key: 'step.load' },
  { stage: 'detecting', key: 'step.detect' },
  { stage: 'recognizing', key: 'step.recognize' },
];

const STAGE_KEY: Record<OcrProgress['stage'], TranslationKey | null> = {
  idle: null,
  'loading-models': 'progress.loading-models',
  detecting: 'progress.detecting',
  recognizing: 'progress.recognizing',
};

export function OcrProgressIndicator({ progress, className }: OcrProgressProps) {
  const { t } = useI18n();
  if (!progress || progress.stage === 'idle') return null;

  const activeIndex = PIPELINE.findIndex((s) => s.stage === progress.stage);
  const pct = Math.round(progress.progress * 100);
  const stageKey = STAGE_KEY[progress.stage];

  return (
    <div className={cn('w-full space-y-3 rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-foreground">{stageKey ? t(stageKey) : progress.message}</span>
        <span className="text-blue-700">{pct}%</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-blue-700 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider">
        {PIPELINE.map((step, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
          return (
            <li key={step.stage} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  state === 'active' && 'animate-pulse bg-blue-700',
                  state === 'done' && 'bg-foreground',
                  state === 'pending' && 'bg-muted-foreground/30'
                )}
              />
              <span
                className={cn(
                  state === 'active' && 'text-blue-700',
                  state === 'done' && 'text-foreground',
                  state === 'pending' && 'text-muted-foreground/40'
                )}
              >
                {i + 1} {t(step.key)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
