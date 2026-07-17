import * as ort from 'onnxruntime-web';
import { logger } from '~/lib/logger';
import { CHARACTER_DICT, loadFullDictionary } from './character-dict';
import type { LoadedModels } from './model-loader';
import { decodeCtc, extractBoxes, sortBoxes } from './postprocessor';
import {
  cropRegion,
  imageToPixels,
  loadImage,
  normalizeForDet,
  normalizeForRec,
  resizeImage,
} from './preprocessor';
import type { OcrProgress, OcrResult, TextBox } from './types';

export interface PipelineConfig {
  maxDimension: number;
  detThreshold: number;
  detUnclipRatio: number;
  detMinSideLength: number;
  detMinArea: number;
}

const DEFAULT_CONFIG: PipelineConfig = {
  maxDimension: 960,
  detThreshold: 0.3,
  detUnclipRatio: 1.6,
  detMinSideLength: 3,
  detMinArea: 10,
};

export class OcrPipeline {
  private models: LoadedModels;
  private onProgress?: (progress: OcrProgress) => void;
  private config: PipelineConfig;
  private dict: string[] = CHARACTER_DICT;

  constructor(
    models: LoadedModels,
    onProgress?: (progress: OcrProgress) => void,
    config?: Partial<PipelineConfig>
  ) {
    this.models = models;
    this.onProgress = onProgress;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private report(stage: OcrProgress['stage'], progress: number, message: string) {
    this.onProgress?.({ stage, progress, message });
  }

  async init(): Promise<void> {
    this.dict = await loadFullDictionary();
  }

  setDict(dict: string[]) {
    this.dict = dict;
  }

  async process(imageSource: string): Promise<OcrResult> {
    const startTime = performance.now();

    // Load and preprocess image
    this.report('detecting', 0.1, 'Loading image...');
    const img = await loadImage(imageSource);
    const { width, height, scaleX, scaleY } = resizeImage(
      img.width,
      img.height,
      this.config.maxDimension
    );
    const { data: pixels } = imageToPixels(img, width, height);

    const result = await this.processPixels(pixels, width, height);

    // Scale box points back to original-image coordinates for the canvas overlay.
    const scaledBoxes = result.boxes.map((b) => ({
      ...b,
      points: b.points.map((p) => [
        Math.round((p[0] ?? 0) / scaleX),
        Math.round((p[1] ?? 0) / scaleY),
      ]),
    }));

    return {
      boxes: scaledBoxes,
      text: result.text,
      elapsed: performance.now() - startTime,
    };
  }

  async processPixels(pixels: Float32Array, width: number, height: number): Promise<OcrResult> {
    const startTime = performance.now();

    // Stage 1: Detection
    this.report('detecting', 0.2, 'Detecting text regions...');
    const detInput = normalizeForDet(pixels);
    const detTensor = new ort.Tensor('float32', detInput, [1, 3, height, width]);
    const detResults = await this.models.det.run({ x: detTensor });
    const detKey = Object.keys(detResults)[0];
    if (!detKey) throw new Error('Detection model returned no output');
    const detOutput = detResults[detKey] as ort.Tensor;
    const probMap = detOutput.data as Float32Array;
    const probMapH = detOutput.dims[2] as number;
    const probMapW = detOutput.dims[3] as number;

    const detectedBoxes = extractBoxes(probMap, probMapW, probMapH, {
      threshold: this.config.detThreshold,
      unclipRatio: this.config.detUnclipRatio,
      minSideLength: this.config.detMinSideLength,
      minArea: this.config.detMinArea,
    });

    if (detectedBoxes.length === 0) {
      this.report('idle', 1, 'No text detected');
      return { boxes: [], text: '', elapsed: performance.now() - startTime };
    }

    // Recognition runs on the resized pixel buffer, so cropping must use the
    // detection (resized) coordinates.
    const sortedBoxes = sortBoxes(detectedBoxes);

    // Stage 2: Recognition for each box
    this.report('recognizing', 0.5, `Recognizing ${sortedBoxes.length} text regions...`);
    const textBoxes: TextBox[] = [];

    for (let i = 0; i < sortedBoxes.length; i++) {
      const box = sortedBoxes[i];
      if (!box) continue;
      const progress = 0.5 + (i / sortedBoxes.length) * 0.4;
      this.report('recognizing', progress, `Processing region ${i + 1}/${sortedBoxes.length}...`);

      try {
        const { text, confidence } = await this.recognizeBox(pixels, width, height, box.points);
        if (text.trim().length > 0) {
          const points = box.points.map((p) => [Math.round(p[0] ?? 0), Math.round(p[1] ?? 0)]);
          textBoxes.push({ points, text, confidence });
        }
      } catch (err) {
        logger.warn(`Failed to recognize box ${i}: ${err}`);
      }
    }

    const elapsed = performance.now() - startTime;
    this.report('idle', 1, `Done — ${textBoxes.length} text regions recognized`);

    return {
      boxes: textBoxes,
      text: textBoxes.map((b) => b.text).join('\n'),
      elapsed,
    };
  }

  async recognizeBox(
    pixels: Float32Array,
    imgWidth: number,
    imgHeight: number,
    box: number[][]
  ): Promise<{ text: string; confidence: number }> {
    // Crop region from image
    const cropped = cropRegion(pixels, imgWidth, imgHeight, box);
    if (cropped.width === 0 || cropped.height === 0) {
      return { text: '', confidence: 0 };
    }

    // Normalize for recognition (resize to height 48)
    const {
      data: recInput,
      width: recW,
      height: recH,
    } = normalizeForRec(cropped.data, cropped.width, cropped.height, 48);

    if (recW === 0) return { text: '', confidence: 0 };

    // Run recognition model
    const recTensor = new ort.Tensor('float32', recInput, [1, 3, recH, recW]);
    const recResults = await this.models.rec.run({ x: recTensor });
    const recKey = Object.keys(recResults)[0];
    if (!recKey) throw new Error('Recognition model returned no output');
    const recOutput = recResults[recKey] as ort.Tensor;

    // Parse rec output: shape [1, seqLen, numClasses]
    const dims = recOutput.dims;
    const numClasses = dims[2] as number;
    const data = recOutput.data as Float32Array;

    if (numClasses !== this.dict.length) {
      throw new Error(
        `Recognition model class count (${numClasses}) does not match dictionary length (${this.dict.length}). ` +
          'The model and dictionary may be mismatched or outdated; clear the model cache and reload.'
      );
    }

    return decodeCtc(data, numClasses, this.dict);
  }
}

/**
 * TODO: Recognition batch inference.
 *
 * Current state: `processPixels` calls `recognizeBox` once per detected text
 * region. Each call builds a `[1, 3, 48, W]` tensor and runs the recognition
 * model separately. For documents with many boxes this is the dominant
 * latency source after detection.
 *
 * Feasible approach:
 * 1. Extend `normalizeForRec` (or add `normalizeForRecBatch`) to accept a
 *    list of cropped CHW buffers and resize each to height 48 while keeping
 *    per-box widths. Compute `maxW` across the batch.
 * 2. Pad each normalized box to `[3, 48, maxW]` with the background mean
 *    (0.5 after norm → 0.0) and stack into `[N, 3, 48, maxW]`.
 * 3. Run the recognition model once with the batched tensor; output shape
 *    becomes `[N, seqLen, numClasses]`.
 * 4. Slice the per-box logits by each original width (or use a padding mask
 *    if the model is sensitive to trailing pad) and run `decodeCtc` per box.
 *
 * Constraints / risks:
 * - The CRNN recognizer expects a fixed horizontal sequence; padding on the
 *   right usually has no effect because blank indices collapse, but this must
 *   be validated against the PP-OCRv6-small model.
 * - Memory grows with `N * maxW * 48 * 3 * 4` bytes. A safe first step is to
 *   cap batch size (e.g., 8 or 16) and fall back to single-box inference when
 *   the widest box exceeds a pixel budget.
 * - Cancellation must be checked between batches so `AbortSignal` remains
 *   responsive for large documents.
 *
 * Acceptance criteria before merging:
 * - Add a benchmark comparing per-box vs batched latency on a 10-region,
 *   50-region, and 200-region synthetic image.
 * - Confirm no accuracy regression on a small held-out sample of real
 *   screenshots/PDF pages.
 * - Keep single-box path as fallback when batching fails or is disabled.
 */
