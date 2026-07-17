import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '~/components/i18n-provider';
import { OcrCanvas } from '~/components/ocr/ocr-canvas';
import { OcrProgressIndicator } from '~/components/ocr/ocr-progress';
import { OcrResult } from '~/components/ocr/ocr-result';
import { Button } from '~/components/ui/button';
import { CopyButton } from '~/components/ui/copy-button';
import type { OcrEngine } from '~/lib/ocr/engine';
import { takePendingFile } from '~/lib/ocr/scan-input';
import { runScanSession, type ScanSession, type ScanSessionState } from '~/lib/ocr/scan-session';
import type { OcrProgress } from '~/lib/ocr/types';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/scan')({
  component: ScanPage,
});

let enginePromise: Promise<OcrEngine> | null = null;
const getEngine = (): Promise<OcrEngine> => {
  if (!enginePromise) {
    enginePromise = import('~/lib/ocr/engine').then(({ OcrEngine }) => new OcrEngine());
  }
  return enginePromise;
};

function ScanPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [state, setState] = useState<ScanSessionState>({
    status: { stage: 'idle' },
    pages: [],
    activePage: 0,
    fileName: null,
    fileSize: null,
    imageSrc: null,
    truncated: null,
  });
  const [outputTab, setOutputTab] = useState<'doc' | 'json' | 'pages'>('doc');
  const [highlightedBox, setHighlightedBox] = useState<number | null>(null);

  const sessionRef = useRef<ScanSession | null>(null);
  const startedRef = useRef(false);
  const navigateHome = useCallback(() => navigate({ to: '/', replace: true }), [navigate]);

  const onUpdate = useCallback((next: ScanSessionState) => {
    setState(next);
  }, []);

  useEffect(() => {
    if (startedRef.current) {
      // StrictMode: every real mount must register a cleanup. The second
      // invocation is a no-op, but its cleanup will run on actual unmount.
      return () => {
        sessionRef.current?.cancel();
        sessionRef.current = null;
      };
    }
    startedRef.current = true;

    const file = takePendingFile();
    if (!file) {
      navigateHome();
      return;
    }

    const start = async () => {
      const engine = await getEngine();
      const session = await runScanSession({
        file,
        engine,
        onUpdate,
        navigateHome,
        t,
      });
      sessionRef.current = session;
    };

    void start();

    return () => {
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
  }, [navigateHome, onUpdate, t]);

  const activeResult = state.pages[state.activePage - 1]?.ocr ?? null;
  const isProcessing = state.status.stage !== 'done' && state.status.stage !== 'error';
  const isError = state.status.stage === 'error';
  const errorMessage =
    isError && 'message' in state.status && typeof state.status.message === 'string'
      ? state.status.message
      : null;

  const progress: OcrProgress | null =
    state.status.stage === 'loading' || state.status.stage === 'processing'
      ? state.status.progress
      : null;

  const docText = activeResult?.text ?? '';
  const singleJsonText = activeResult
    ? JSON.stringify(
        { boxes: activeResult.boxes, text: activeResult.text, elapsed: activeResult.elapsed },
        null,
        2
      )
    : '';
  const fullPdfDocText = state.pages
    .map((p) => `--- Page ${p.pageNumber} ---\n${p.ocr.text}`)
    .join('\n\n');
  const fullPdfJsonText =
    state.pages.length > 0
      ? JSON.stringify(
          {
            pages: state.pages.map((p) => ({
              pageNumber: p.pageNumber,
              boxes: p.ocr.boxes,
              text: p.ocr.text,
              elapsed: p.ocr.elapsed,
            })),
          },
          null,
          2
        )
      : singleJsonText;
  const activeText =
    outputTab === 'json' ? fullPdfJsonText : outputTab === 'pages' ? fullPdfDocText : docText;

  const handleDownload = () => {
    const isJson = outputTab === 'json';
    const isAllPages = outputTab === 'pages';
    const blob = new Blob([activeText], { type: isJson ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    if (isJson) {
      a.download = 'parsify-result.json';
    } else if (isAllPages) {
      a.download = 'parsify-result-all-pages.txt';
    } else {
      a.download = 'parsify-result.txt';
    }
    a.click();
    URL.revokeObjectURL(url);
  };

  const navigateToPage = useCallback((page: number) => {
    sessionRef.current?.setActivePage(page);
    setHighlightedBox(null);
  }, []);

  const pdfPager =
    state.pages.length > 1 ? (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => navigateToPage(state.activePage - 1)}
          disabled={state.activePage <= 1}
          aria-label={t('source.prevPage')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          {String(state.activePage).padStart(2, '0')}/{String(state.pages.length).padStart(2, '0')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => navigateToPage(state.activePage + 1)}
          disabled={state.activePage >= state.pages.length}
          aria-label={t('source.nextPage')}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    ) : null;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('scan.new')}
        </Link>
      </div>

      {progress && (
        <div className="mb-4">
          <OcrProgressIndicator progress={progress} />
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="font-mono text-[11px] tracking-wider">{t('common.error')}</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {state.truncated && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <span>
            {t('upload.truncated', {
              rendered: state.truncated.rendered,
              total: state.truncated.total,
            })}
          </span>
        </div>
      )}

      {activeResult && state.imageSrc ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <OcrCanvas
            imageSrc={state.imageSrc}
            boxes={activeResult.boxes}
            highlightedIndex={highlightedBox}
            onBoxClick={(i) => setHighlightedBox(i)}
            fileName={state.fileName ?? undefined}
            fileSize={state.fileSize ?? undefined}
            pager={pdfPager}
            className="lg:h-[78vh] lg:max-h-[820px]"
          />

          <div className="flex flex-col overflow-hidden rounded-lg border bg-card lg:h-[78vh] lg:max-h-[820px]">
            <div className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2">
              <div className="flex items-center gap-1">
                <OutputTab active={outputTab === 'doc'} onClick={() => setOutputTab('doc')}>
                  {t('output.doc')}
                </OutputTab>
                {state.pages.length > 1 && (
                  <OutputTab active={outputTab === 'pages'} onClick={() => setOutputTab('pages')}>
                    {t('output.allPages')}
                  </OutputTab>
                )}
                <OutputTab active={outputTab === 'json'} onClick={() => setOutputTab('json')}>
                  {t('output.json')}
                </OutputTab>
              </div>
              <div className="flex items-center gap-2">
                <CopyButton
                  text={activeText}
                  className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={handleDownload}
                  aria-label={t('common.download')}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {outputTab === 'doc' ? (
                <div>
                  <p className="mb-2 font-mono text-[11px] tracking-wider text-muted-foreground">
                    {t('output.lines', { n: activeResult.boxes.length })}
                  </p>
                  <OcrResult
                    boxes={activeResult.boxes}
                    highlightedIndex={highlightedBox}
                    onBoxHover={setHighlightedBox}
                  />
                </div>
              ) : outputTab === 'pages' ? (
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                  {fullPdfDocText}
                </pre>
              ) : (
                <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                  {fullPdfJsonText}
                </pre>
              )}
            </div>
          </div>
        </div>
      ) : (
        isProcessing && (
          <div className="flex min-h-[40vh] items-center justify-center rounded-lg border bg-card">
            <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
              {t('scan.processing')}
            </p>
          </div>
        )
      )}
    </div>
  );
}

function OutputTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-2.5 py-1 font-mono text-[11px] tracking-wider transition-colors',
        active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
