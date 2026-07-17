import { type LoadedModels, loadModels } from './model-loader';
import { OcrPipeline } from './pipeline';
import type { OcrEngineConfig, OcrProgress, OcrResult } from './types';

/**
 * High-level OCR engine. Handles model loading, caching, and pipeline execution.
 *
 * Usage:
 * ```ts
 * import { OcrEngine } from './engine';
 * const engine = new OcrEngine();
 * await engine.load();
 * const result = await engine.recognize(imageUrl, (progress) => console.log(progress));
 * ```
 */
export class OcrEngine {
  private models: LoadedModels | null = null;
  private config: Required<OcrEngineConfig>;
  private loading: Promise<void> | null = null;
  private dict: string[] | null = null;

  constructor(config?: OcrEngineConfig) {
    this.config = {
      modelBaseUrl: config?.modelBaseUrl ?? '/models/pp-ocrv6-small',
      maxDimension: config?.maxDimension ?? 960,
      detThreshold: config?.detThreshold ?? 0.3,
      detUnclipRatio: config?.detUnclipRatio ?? 1.6,
      detMinSideLength: config?.detMinSideLength ?? 3,
      detMinArea: config?.detMinArea ?? 10,
    };
  }

  /** Whether models have been loaded */
  get isReady(): boolean {
    return this.models !== null;
  }

  /**
   * Load ONNX models. Subsequent calls are no-ops if already loaded.
   * Safe to call multiple times concurrently.
   */
  async load(onModelLoaded?: (name: string, fromCache: boolean) => void): Promise<void> {
    if (this.models) return;
    if (this.loading) return this.loading;

    this.loading = loadModels(this.config.modelBaseUrl, onModelLoaded).then(async (models) => {
      this.models = models;
      // Pre-load the character dictionary once so every recognize() call skips the fetch.
      const { loadFullDictionary } = await import('./character-dict');
      this.dict = await loadFullDictionary(this.config.modelBaseUrl);
    });

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Run OCR on an image.
   * @param imageSource - Data URL or object URL of the image
   * @param onProgress - Progress callback
   */
  async recognize(
    imageSource: string,
    onProgress?: (progress: OcrProgress) => void
  ): Promise<OcrResult> {
    if (!this.models || !this.dict) {
      throw new Error('OCR engine not loaded. Call engine.load() first.');
    }

    const pipeline = new OcrPipeline(this.models, onProgress, {
      maxDimension: this.config.maxDimension,
      detThreshold: this.config.detThreshold,
      detUnclipRatio: this.config.detUnclipRatio,
      detMinSideLength: this.config.detMinSideLength,
      detMinArea: this.config.detMinArea,
    });

    pipeline.setDict(this.dict);
    return pipeline.process(imageSource);
  }
}
