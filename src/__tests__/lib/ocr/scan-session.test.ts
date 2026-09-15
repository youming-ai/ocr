import { describe, expect, it } from 'bun:test';
import type { OcrEngine } from '~/lib/ocr/engine';
import {
  describeScanError,
  runScanSession,
  type ScanSessionState,
  serializeAllPagesDoc,
  serializeAllPagesJson,
} from '~/lib/ocr/scan-session';
import type { OcrResult } from '~/lib/ocr/types';

function createFakeEngine(resultText: string): OcrEngine {
  return {
    isReady: true,
    load: async () => {},
    recognize: async () =>
      ({
        boxes: [],
        text: resultText,
        elapsed: 1,
      }) as OcrResult,
  } as unknown as OcrEngine;
}

function makeImageFile(name = 'test.png'): File {
  return new File(['x'], name, { type: 'image/png' });
}

describe('runScanSession', () => {
  it('processes an image file and notifies updates', async () => {
    const { promise: done, resolve } = Promise.withResolvers<void>();
    const updates: ScanSessionState[] = [];
    const session = await runScanSession({
      file: makeImageFile(),
      engine: createFakeEngine('TEST'),
      onUpdate: (s) => {
        updates.push(s);
        if (s.status.stage === 'done') resolve();
      },
      navigateHome: () => {},
    });

    await done;

    expect(session.state.pages).toHaveLength(1);
    expect(session.state.pages[0]?.ocr.text).toBe('TEST');
    expect(
      updates.some((u) => u.status.stage === 'loading' || u.status.stage === 'processing')
    ).toBe(true);
    expect(session.state.fileName).toBe('test.png');
  });

  it('does not commit an image result after cancellation', async () => {
    const { promise: recognizing, resolve: markRecognizing } = Promise.withResolvers<void>();
    const { promise: recognition, resolve: finishRecognition } = Promise.withResolvers<OcrResult>();
    const { promise: navigated, resolve: markNavigated } = Promise.withResolvers<void>();
    const engine = {
      isReady: true,
      load: async () => {},
      recognize: async () => {
        markRecognizing();
        return recognition;
      },
    } as unknown as OcrEngine;
    const session = await runScanSession({
      file: makeImageFile(),
      engine,
      onUpdate: () => {},
      navigateHome: markNavigated,
    });

    await recognizing;
    session.cancel();
    finishRecognition({ boxes: [], text: 'SHOULD NOT COMMIT', elapsed: 1 });
    await navigated;

    expect(session.state.pages).toHaveLength(0);
    expect(session.state.status.stage).toBe('idle');
  });

  it('notifies cancellation listeners', async () => {
    const { promise: cancelled, resolve } = Promise.withResolvers<void>();
    const session = await runScanSession({
      file: makeImageFile(),
      engine: createFakeEngine('TEST'),
      onUpdate: () => {},
      navigateHome: () => {},
    });

    session.onCancelled(() => resolve());
    session.cancel();

    await cancelled;
    // If cancel is called after the scan already finished, the status is done;
    // the observable still guarantees the listener fires exactly once.
    expect(session.state.status.stage === 'idle' || session.state.status.stage === 'done').toBe(
      true
    );
  });

  it('aggregates all pages for export', async () => {
    const { promise: done, resolve } = Promise.withResolvers<void>();
    const session = await runScanSession({
      file: makeImageFile(),
      engine: createFakeEngine('LINE1\nLINE2'),
      onUpdate: (s) => {
        if (s.status.stage === 'done') resolve();
      },
      navigateHome: () => {},
    });

    await done;

    expect(session.exportAllPagesDoc()).toContain('LINE1');
    expect(serializeAllPagesDoc(session.state)).toContain('LINE1');
    expect(JSON.parse(serializeAllPagesJson(session.state)).pages).toHaveLength(1);
    expect(session.exportCurrentDoc()).toBe('LINE1\nLINE2');
  });

  it('reports a translated error key plus the raw detail', async () => {
    const { promise: failed, resolve } = Promise.withResolvers<void>();
    const engine = {
      isReady: true,
      load: async () => {},
      recognize: async () => {
        throw new Error('Failed to fetch model det: 404 Not Found');
      },
    } as unknown as OcrEngine;

    const session = await runScanSession({
      file: makeImageFile(),
      engine,
      onUpdate: (s) => {
        if (s.status.stage === 'error') resolve();
      },
      navigateHome: () => {},
    });

    await failed;

    expect(session.state.status.stage).toBe('error');
    if (session.state.status.stage === 'error') {
      expect(session.state.status.errorKey).toBe('error.modelDownload');
      expect(session.state.status.detail).toContain('404');
    }
    // Nothing succeeded, so there is nothing to show.
    expect(session.state.pages).toHaveLength(0);
  });
});

describe('describeScanError', () => {
  it('maps known failure shapes to specific keys', () => {
    expect(describeScanError(new Error('Failed to load OCR dictionary: 404')).errorKey).toBe(
      'error.dictionary'
    );
    expect(describeScanError(new Error('Failed to load image')).errorKey).toBe('error.imageDecode');
    expect(describeScanError(new Error('Invalid PDF structure')).errorKey).toBe('error.pdf');
  });

  it('falls back to the generic key and stringifies non-errors', () => {
    const result = describeScanError('boom');
    expect(result.errorKey).toBe('error.ocrFailed');
    expect(result.detail).toBe('boom');
  });
});
