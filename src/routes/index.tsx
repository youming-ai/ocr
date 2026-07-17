import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useI18n } from '~/components/i18n-provider';
import { ImageUpload } from '~/components/ocr/image-upload';
import { DetectionFrame } from '~/components/ui/detection-frame';
import { setPendingFile } from '~/lib/ocr/scan-input';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const handleImageSelect = (file: File) => {
    // OCR runs on the /scan route — hand the file off and switch pages.
    setPendingFile(file);
    navigate({ to: '/scan' });
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 sm:py-14">
      {/* Hero — the engine reads a word in front of you */}
      <section className="mb-10">
        <p className="mb-4 font-mono text-[11px] tracking-[0.22em] text-muted-foreground">
          ◢ {t('hero.eyebrow')}
        </p>
        <h1 className="font-mono text-3xl font-semibold leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl">
          {t('hero.headPre')}{' '}
          <DetectionFrame
            label="99.7%"
            coord="x:0 y:0"
            scan="once"
            className="inline-block align-baseline"
            contentClassName="px-2 py-0.5"
          >
            {t('hero.headWord')}
          </DetectionFrame>
          {t('hero.headPost') ? <> {t('hero.headPost')}</> : null}
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">{t('hero.sub')}</p>
      </section>

      {/* Scanner bed */}
      <ImageUpload onImageSelect={handleImageSelect} />

      {/* Spec strip */}
      <section className="mt-12 grid overflow-hidden rounded-lg border bg-card sm:grid-cols-3">
        <SpecCell label={t('spec.local.label')} description={t('spec.local.desc')} />
        <SpecCell
          label={t('spec.model.label')}
          description={t('spec.model.desc')}
          className="border-t sm:border-l sm:border-t-0"
        />
        <SpecCell
          label={t('spec.scripts.label')}
          description={t('spec.scripts.desc')}
          className="border-t sm:border-l sm:border-t-0"
        />
      </section>
    </div>
  );
}

function SpecCell({
  label,
  description,
  className,
}: {
  label: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={cn('p-5', className)}>
      <p className="mb-2 flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.16em] text-foreground">
        <span className="h-1.5 w-1.5 bg-foreground" />
        {label}
      </p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
