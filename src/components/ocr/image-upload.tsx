import { ScanText } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '~/components/i18n-provider';
import { cn } from '~/lib/utils';

interface ImageUploadProps {
  onImageSelect: (file: File) => void;
  className?: string;
}

// Only formats an `<img>` can actually decode: the pipeline feeds the file to an
// HTMLImageElement via an object URL. That rules out TIFF, which Chrome and
// Firefox cannot decode (Safari only), so offering it here would guarantee a
// "Failed to load image" error after a successful upload.
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const PDF_MAX_SIZE = 200 * 1024 * 1024; // 200MB

export function ImageUpload({ onImageSelect, className }: ImageUploadProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return t('upload.errFormat');
      }
      const limit = file.type === 'application/pdf' ? PDF_MAX_SIZE : MAX_SIZE;
      if (file.size > limit) {
        const limitMB = file.type === 'application/pdf' ? 200 : 10;
        return t('upload.errSize', { mb: limitMB });
      }
      return null;
    },
    [t]
  );

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      onImageSelect(file);
    },
    [onImageSelect, validate]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // Paste is a document-level gesture: the button only receives paste events
  // while it happens to hold focus, so listening on the button alone made the
  // advertised "paste from clipboard" hint unreliable.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (file) handleFile(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleFile]);

  const handleClick = () => inputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset first: without this, re-picking the same file (e.g. after a size or
    // format error) fires no change event and the error message sticks.
    e.target.value = '';
    if (file) handleFile(file);
  };

  return (
    <div className={cn('w-full', className)}>
      <button
        type="button"
        className={cn(
          'relative flex w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border bg-card p-12 transition-colors',
          isDragging
            ? 'border-foreground bg-foreground/5'
            : 'border-border hover:border-foreground/50'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={handleClick}
        aria-label={t('upload.aria')}
      >
        {/* scanner-bed registration brackets */}
        <span className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-foreground/70" />
        <span className="pointer-events-none absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-foreground/70" />
        <span className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-foreground/70" />
        <span className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-foreground/70" />
        <span className="scan-beam" aria-hidden="true" />

        <span className="mb-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          {t('upload.idle')}
        </span>
        <ScanText className="mb-3 mt-2 h-9 w-9 text-foreground" strokeWidth={1.5} />
        <p className="text-sm font-medium text-foreground">{t('upload.drop')}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('upload.hint')}</p>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground/70">
          PNG JPG WEBP BMP · 10MB &nbsp;·&nbsp; PDF · 200MB
        </p>
      </button>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
