/** A single detected text region with recognition result */
export interface TextBox {
  /** Bounding box polygon points [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] */
  points: number[][];
  /** Recognized text content */
  text: string;
  /** Recognition confidence score (0-1) */
  confidence: number;
}

/** Complete OCR result from processing an image */
export interface OcrResult {
  /** All detected and recognized text boxes */
  boxes: TextBox[];
  /** Full text (all boxes joined by newlines) */
  text: string;
  /** Processing time in milliseconds */
  elapsed: number;
}

/** Pipeline processing stage */
export type OcrStage = 'idle' | 'loading-models' | 'detecting' | 'recognizing';

/** Progress callback for OCR pipeline */
export interface OcrProgress {
  stage: OcrStage;
  /** Overall progress 0-1 */
  progress: number;
  /** Human-readable status message */
  message: string;
}

/** Configuration for OCR engine */
export interface OcrEngineConfig {
  /** Base URL for model files (default: '/models/pp-ocrv6-small') */
  modelBaseUrl?: string;
  /** Maximum image dimension in pixels (default: 960) */
  maxDimension?: number;
  /** Detection threshold (default: 0.3) */
  detThreshold?: number;
  /** Detection box unclip ratio (default: 1.6) */
  detUnclipRatio?: number;
  /** Minimum box side length to keep (default: 3) */
  detMinSideLength?: number;
  /** Minimum box area to keep (default: 10) */
  detMinArea?: number;
}

/** Result from processing a single PDF page */
export interface PdfPageResult {
  /** 1-based page number */
  pageNumber: number;
  /** OCR result for this page */
  ocr: OcrResult;
  /** Object URL of the rendered page image */
  imageSrc: string;
}
