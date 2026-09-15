/**
 * Image preprocessing for PP-OCRv6 pipeline.
 * Handles resize, normalization, and canvas-based image decoding.
 */

export interface ResizeResult {
  width: number;
  height: number;
  /** Actual horizontal scale after snapping. */
  scaleX: number;
  /** Actual vertical scale after snapping. */
  scaleY: number;
}

/**
 * Calculate resize dimensions, constrained to maxDimension and rounded to multiples of 32.
 */
export function resizeImage(srcWidth: number, srcHeight: number, maxDimension = 960): ResizeResult {
  const maxSide = Math.max(srcWidth, srcHeight);
  // Only downscale when larger than the limit, but ALWAYS snap to a multiple of
  // 32: the DBNet detector downsamples by 32, and non-aligned input sizes make
  // its skip-connection feature maps mismatch ("Shape mismatch ... {…,55,…} !=
  // {…,56,…}") and OrtRun fails. Small images hit this too, so round in both cases.
  const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
  const snap = (v: number) => Math.max(32, Math.round((v * scale) / 32) * 32);
  const width = snap(srcWidth);
  const height = snap(srcHeight);
  // Return the actual per-axis scale so downstream coordinate remapping
  // accounts for snapping (which can shift dimensions by up to 31px).
  return {
    width,
    height,
    scaleX: width / srcWidth,
    scaleY: height / srcHeight,
  };
}

/**
 * Load an image file into an HTMLImageElement.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Draw image to canvas and extract pixel data as a raw CHW Float32Array in
 * **BGR** channel order, scaled to [0, 1].
 *
 * This is deliberately *model-agnostic*: detection and recognition need
 * different normalizations of the same pixels, so this function must not bake
 * in either one. Apply `normalizeForDet()` before running the detector and
 * `normalizeForRec()` before running the recognizer.
 *
 * Channel order is BGR because both PP-OCRv6 ONNX models were exported from a
 * PaddleOCR `PreProcess` that decodes with `img_mode: BGR` and never converts
 * to RGB (see the model's `inference.yml`), so the network expects swapped
 * R/B channels relative to the canvas's RGBA data.
 */
export function imageToPixels(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): { data: Float32Array; width: number; height: number } {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const rgba = imageData.data;

  // Convert HWC (RGBA) to CHW (BGR), scale to [0, 1]
  const channels = 3;
  const pixels = targetWidth * targetHeight;
  const data = new Float32Array(channels * pixels);

  for (let i = 0; i < pixels; i++) {
    data[i] = (rgba[i * 4 + 2] ?? 0) / 255; // B
    data[pixels + i] = (rgba[i * 4 + 1] ?? 0) / 255; // G
    data[2 * pixels + i] = (rgba[i * 4] ?? 0) / 255; // R
  }

  return { data, width: targetWidth, height: targetHeight };
}

// Detector normalization, from PP-OCRv6_small_det's `inference.yml`
// (`NormalizeImage: {mean: [...], std: [...], scale: 1/255, order: hwc}`).
// Values are listed in BGR order to match the CHW buffer from `imageToPixels`.
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

/**
 * Normalize a raw [0, 1] BGR CHW buffer for the DBNet detector: (x - mean) / std
 * per channel. Skipping this shifts the probability map and degrades detection.
 */
export function normalizeForDet(data: Float32Array): Float32Array {
  const pixels = Math.floor(data.length / 3);
  const result = new Float32Array(pixels * 3);
  for (let c = 0; c < 3; c++) {
    const mean = DET_MEAN[c] ?? 0;
    const std = DET_STD[c] ?? 1;
    const offset = c * pixels;
    for (let i = 0; i < pixels; i++) {
      result[offset + i] = ((data[offset + i] ?? 0) - mean) / std;
    }
  }
  return result;
}

/**
 * Normalize pixel data for recognition model input.
 *
 * Consumes the raw [0, 1] BGR buffer from `imageToPixels` (or a crop of it) and
 * applies PP-OCR's `RecResizeImg` scaling in place of mean 0.5 / std 0.5, i.e.
 * (x - 0.5) / 0.5. Channel order is preserved (BGR), matching the rec model's
 * `img_mode: BGR` preprocessing.
 */
export function normalizeForRec(
  data: Float32Array,
  width: number,
  srcHeight: number,
  targetHeight = 48
): { data: Float32Array; width: number; height: number } {
  // If source height matches target, just normalize in-place
  if (srcHeight === targetHeight) {
    const result = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = ((data[i] ?? 0) - 0.5) / 0.5;
    }
    return { data: result, width, height: targetHeight };
  }

  // Resize by re-drawing to canvas at target height
  const scale = targetHeight / srcHeight;
  const newWidth = Math.max(1, Math.round(width * scale));
  const pixels = newWidth * targetHeight;
  const result = new Float32Array(3 * pixels);

  // Bilinear interpolation for each channel
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const srcX = x / scale;
        const srcY = y / scale;
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, width - 1);
        const y1 = Math.min(y0 + 1, srcHeight - 1);

        const dx = srcX - x0;
        const dy = srcY - y0;

        const c00 = data[c * srcHeight * width + y0 * width + x0] ?? 0;
        const c10 = data[c * srcHeight * width + y0 * width + x1] ?? 0;
        const c01 = data[c * srcHeight * width + y1 * width + x0] ?? 0;
        const c11 = data[c * srcHeight * width + y1 * width + x1] ?? 0;

        const val =
          c00 * (1 - dx) * (1 - dy) + c10 * dx * (1 - dy) + c01 * (1 - dx) * dy + c11 * dx * dy;
        result[c * pixels + y * newWidth + x] = (val - 0.5) / 0.5;
      }
    }
  }

  return { data: result, width: newWidth, height: targetHeight };
}

/**
 * Extract a sub-region from a raw CHW BGR buffer (see `imageToPixels`).
 * Used to crop detected text regions before recognition; the crop keeps the
 * un-normalized [0, 1] values so `normalizeForRec` can own the rec scaling.
 */
export function cropRegion(
  data: Float32Array,
  imgWidth: number,
  imgHeight: number,
  box: number[][]
): { data: Float32Array; width: number; height: number } {
  // Get bounding rect of the polygon
  const xs = box.map((p) => p[0] ?? 0);
  const ys = box.map((p) => p[1] ?? 0);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(imgWidth - 1, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(imgHeight - 1, Math.ceil(Math.max(...ys)));

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  if (cropW <= 0 || cropH <= 0) {
    return { data: new Float32Array(0), width: 0, height: 0 };
  }

  const result = new Float32Array(3 * cropW * cropH);
  const pixels = imgWidth * imgHeight;

  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const srcIdx = c * pixels + (minY + y) * imgWidth + (minX + x);
        const dstIdx = c * cropW * cropH + y * cropW + x;
        result[dstIdx] = data[srcIdx] ?? 0;
      }
    }
  }

  return { data: result, width: cropW, height: cropH };
}
