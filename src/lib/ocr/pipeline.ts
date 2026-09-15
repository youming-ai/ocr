import * as ort from 'onnxruntime-web';
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
  /** Mean-probability floor for a detected box (PaddleOCR `box_thresh`). */
  detBoxThreshold: number;
  detUnclipRatio: number;
  detMinSideLength: number;
  detMinArea: number;
}

// Defaults follow PP-OCRv6_small_det's published postprocess config
// (thresh 0.2, box_thresh 0.45, unclip_ratio 1.4).
const DEFAULT_CONFIG: PipelineConfig = {
  maxDimension: 960,
  detThreshold: 0.2,
  detBoxThreshold: 0.45,
  detUnclipRatio: 1.4,
  detMinSideLength: 3,
  detMinArea: 10,
};

export class OcrPipeline {
  private models: LoadedModels;
  private onProgress?: (progress: OcrProgress) => void;
  private config: PipelineConfig;
  private dict: string[] = [];

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
    // `pixels` stays raw (BGR, [0, 1]) because the recognizer re-crops from this
    // same buffer and needs the un-normalized values; only the detector input
    // gets the ImageNet normalization the det model was exported with.
    const detTensor = new ort.Tensor('float32', normalizeForDet(pixels), [1, 3, height, width]);
    const detResults = await this.models.det.run({ x: detTensor });
    const detKey = Object.keys(detResults)[0];
    if (!detKey) throw new Error('Detection model returned no output');
    const detOutput = detResults[detKey] as ort.Tensor;
    const probMap = detOutput.data as Float32Array;
    const probMapH = detOutput.dims[2] as number;
    const probMapW = detOutput.dims[3] as number;

    // Boxes come back in probability-map space, but `recognizeBox` crops them out
    // of the input buffer, so a mismatch would silently produce garbage crops.
    if (probMapW !== width || probMapH !== height) {
      throw new Error(
        `Detection output size ${probMapW}x${probMapH} does not match the ${width}x${height} input. ` +
          'The detector must preserve spatial dimensions.'
      );
    }

    const detectedBoxes = extractBoxes(probMap, probMapW, probMapH, {
      threshold: this.config.detThreshold,
      boxThreshold: this.config.detBoxThreshold,
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
        console.warn(`[WARN] Failed to recognize box ${i}: ${err}`);
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
    // `normalizeForRec` clamps the resized width to at least 1, so recW is always
    // a valid tensor dimension here.

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

// Recognition runs one crop per `rec.run()` call (see the loop in
// `processPixels`). Batching several crops into a single call is the main
// remaining speed-up for text-dense pages; the rec model's dynamic shapes
// already allow a batched `x` (e.g. [8, 3, 48, W]).
