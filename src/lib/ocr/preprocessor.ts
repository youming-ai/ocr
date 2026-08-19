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
 * Draw image to canvas and extract pixel data as CHW Float32Array.
 * Returns [pixelData, width, height].
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

  // Convert HWC (RGBA) to CHW (RGB), normalize to [0, 1]
  const channels = 3;
  const pixels = targetWidth * targetHeight;
  const data = new Float32Array(channels * pixels);

  for (let i = 0; i < pixels; i++) {
    data[i] = (rgba[i * 4] ?? 0) / 255; // R
    data[pixels + i] = (rgba[i * 4 + 1] ?? 0) / 255; // G
    data[2 * pixels + i] = (rgba[i * 4 + 2] ?? 0) / 255; // B
  }

  return { data, width: targetWidth, height: targetHeight };
}

/**
 * Normalize pixel data for recognition model input.
 * PP-OCRv6 rec model expects (x - 0.5) / 0.5.
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
 * Extract a sub-region from CHW pixel data.
 * Used to crop detected text regions for recognition.
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
