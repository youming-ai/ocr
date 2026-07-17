import { describe, expect, it } from 'bun:test';
import type * as ort from 'onnxruntime-web';
import type { LoadedModels } from '~/lib/ocr/model-loader';
import { OcrPipeline } from '~/lib/ocr/pipeline';
import type { OcrProgress } from '~/lib/ocr/types';

function fakeTensor(data: Float32Array, dims: number[]): ort.Tensor {
  return { data, dims } as ort.Tensor;
}

function createFakeRecSession(output: Float32Array, seqLen: number, numClasses: number) {
  const out = fakeTensor(output, [1, seqLen, numClasses]);
  return {
    run: async () => ({ output: out }),
  } as unknown as LoadedModels['rec'];
}

function createFakeDetSession(probMap: Float32Array, width: number, height: number) {
  const out = fakeTensor(probMap, [1, 1, height, width]);
  return {
    run: async () => ({ output: out }),
  } as unknown as LoadedModels['det'];
}

describe('OcrPipeline', () => {
  it('detects no text and reports progress stages', async () => {
    const stages: string[] = [];
    const onProgress = (p: OcrProgress) => stages.push(p.stage);

    const pipeline = new OcrPipeline(
      {
        det: createFakeDetSession(new Float32Array(64 * 64).fill(0), 64, 64),
        rec: createFakeRecSession(new Float32Array(0), 0, 4),
      },
      onProgress,
      { maxDimension: 64 }
    );

    // Provide a minimal white image (RGB CHW) directly to skip browser image loading.
    const pixels = new Float32Array(3 * 64 * 64).fill(1);
    const result = await pipeline.processPixels(pixels, 64, 64);

    expect(stages).toContain('detecting');
    expect(result.boxes).toHaveLength(0);
    expect(result.text).toBe('');
  });

  it('throws when rec model class count does not match dictionary length', async () => {
    const pipeline = new OcrPipeline(
      {
        det: createFakeDetSession(new Float32Array(64 * 64).fill(0.9), 64, 64),
        rec: createFakeRecSession(new Float32Array(3 * 4).fill(0), 3, 4),
      },
      () => {}
    );
    // Dict has 3 entries; model has 4 classes -> mismatch.
    pipeline.setDict(['', 'A', 'B']);

    const err = await pipeline
      .recognizeBox(new Float32Array(3 * 64 * 64), 64, 64, [
        [10, 10],
        [20, 10],
        [20, 20],
        [10, 20],
      ])
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('class count');
  });

  it('decodes recognized text from fake rec output', async () => {
    const dict = ['', 'A', 'B', 'C'];
    const recOutput = new Float32Array([
      1,
      0,
      0,
      0, // blank
      0,
      1,
      0,
      0, // A
      0,
      0,
      1,
      0, // B
    ]);

    const pipeline = new OcrPipeline(
      {
        det: createFakeDetSession(new Float32Array(64 * 64).fill(0.9), 64, 64),
        rec: createFakeRecSession(recOutput, 3, 4),
      },
      () => {}
    );
    pipeline.setDict(dict);

    const { text, confidence } = await pipeline.recognizeBox(
      new Float32Array(3 * 64 * 64),
      64,
      64,
      [
        [10, 10],
        [20, 10],
        [20, 20],
        [10, 20],
      ]
    );

    expect(text).toBe('AB');
    expect(confidence).toBeGreaterThan(0);
  });
});
