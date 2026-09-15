import { loadFullDictionary } from './character-dict';
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
      detThreshold: config?.detThreshold ?? 0.2,
      detBoxThreshold: config?.detBoxThreshold ?? 0.45,
      detUnclipRatio: config?.detUnclipRatio ?? 1.4,
      detMinSideLength: config?.detMinSideLength ?? 3,
      detMinArea: config?.detMinArea ?? 10,
    };
  }

  /**
   * Whether models *and* the character dictionary are loaded, i.e. whether
   * `recognize()` can run. Reporting model-only success here would make
   * `runScanSession` skip a needed retry and surface a misleading
   * "engine not loaded" error instead.
   */
  get isReady(): boolean {
    return this.models !== null && this.dict !== null;
  }

  /**
   * Load ONNX models and the character dictionary. Subsequent calls are no-ops
   * once both are present, and a partial failure stays retryable: the model set
   * is only published after the dictionary resolves, so a failed dictionary
   * fetch does not wedge the engine for the lifetime of the page.
   * Safe to call multiple times concurrently.
   */
  async load(onModelLoaded?: (name: string, fromCache: boolean) => void): Promise<void> {
    if (this.isReady) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      // Reuse whichever half already succeeded, so a dictionary-only retry does
      // not re-download the models.
      const models = this.models ?? (await loadModels(this.config.modelBaseUrl, onModelLoaded));
      const dict = this.dict ?? (await loadFullDictionary(this.config.modelBaseUrl));
      this.models = models;
      this.dict = dict;
    })();

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
      detBoxThreshold: this.config.detBoxThreshold,
      detUnclipRatio: this.config.detUnclipRatio,
      detMinSideLength: this.config.detMinSideLength,
      detMinArea: this.config.detMinArea,
    });

    pipeline.setDict(this.dict);
    return pipeline.process(imageSource);
  }
}
