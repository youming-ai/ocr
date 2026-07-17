export interface DetectedBox {
  points: number[][];
  score: number;
}

export interface CtcResult {
  text: string;
  confidence: number;
}

/**
 * Decode CTC output: argmax per timestep, collapse repeated, remove blanks.
 * Operates directly on a flat Float32Array of shape [seqLen, numClasses].
 * @param data - Flat logits: timestep-major, each of length numClasses
 * @param numClasses - Number of classes per timestep
 * @param dict - Character dictionary (index 0 = blank)
 */
export function decodeCtc(data: Float32Array, numClasses: number, dict: string[]): CtcResult {
  if (data.length === 0 || numClasses === 0) return { text: '', confidence: 0 };
  const seqLen = Math.floor(data.length / numClasses);
  if (seqLen === 0) return { text: '', confidence: 0 };

  let text = '';
  let totalConf = 0;
  let prevIdx = -1;

  for (let t = 0; t < seqLen; t++) {
    const offset = t * numClasses;
    // Find argmax over this timestep
    let maxIdx = 0;
    let maxVal = data[offset] ?? 0;
    for (let c = 1; c < numClasses; c++) {
      const val = data[offset + c] ?? 0;
      if (val > maxVal) {
        maxVal = val;
        maxIdx = c;
      }
    }

    // Skip blanks (index 0) and repeated
    if (maxIdx !== 0 && maxIdx !== prevIdx) {
      const ch = dict[maxIdx] ?? '';
      text += ch;
      totalConf += maxVal;
    }

    prevIdx = maxIdx;
  }

  const confidence = text.length > 0 ? totalConf / text.length : 0;
  return { text, confidence: Math.min(1, Math.max(0, confidence)) };
}

/**
 * Non-Maximum Suppression for polygon boxes.
 * Uses IoU (Intersection over Union) to suppress overlapping boxes.
 */
export function nmsBoxes(boxes: number[][][], scores: number[], iouThreshold: number): number[] {
  const indices = scores.map((_, i) => i).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));

  const kept: number[] = [];
  const suppressed = new Set<number>();

  for (const i of indices) {
    if (suppressed.has(i)) continue;
    kept.push(i);

    for (const j of indices) {
      if (j === i || suppressed.has(j)) continue;
      const iou = computePolygonIoU(boxes[i] ?? [], boxes[j] ?? []);
      if (iou > iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}

function computePolygonIoU(a: number[][], b: number[][]): number {
  const rectA = boundingRect(a);
  const rectB = boundingRect(b);
  const inter = intersectionArea(rectA, rectB);
  const areaA = rectArea(rectA);
  const areaB = rectArea(rectB);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function boundingRect(points: number[][]): [number, number, number, number] {
  const xs = points.map((p) => p[0] ?? 0);
  const ys = points.map((p) => p[1] ?? 0);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function rectArea(r: [number, number, number, number]): number {
  return Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
}

function intersectionArea(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

const NEIGHBOR_DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Extract text bounding boxes from a DBNet probability map.
 *
 * Algorithm:
 * 1. Threshold the probability map
 * 2. Find connected components
 * 3. Extract minimum bounding rectangles
 * 4. Expand with unclip ratio
 * 5. Filter by side length and area
 */
export function extractBoxes(
  probMap: Float32Array,
  width: number,
  height: number,
  opts: {
    threshold: number;
    unclipRatio: number;
    minSideLength: number;
    minArea: number;
  }
): DetectedBox[] {
  // 1. Threshold → binary mask
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < probMap.length; i++) {
    mask[i] = (probMap[i] ?? 0) > opts.threshold ? 1 : 0;
  }

  // 2. Find connected components (simple flood fill)
  const visited = new Uint8Array(width * height);
  const components: { box: number[][]; score: number }[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 0 || visited[idx] === 1) continue;

      // BFS to find all pixels in this component
      const pixels: number[] = [];
      const queue = [idx];
      visited[idx] = 1;

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cx = cur % width;
        const cy = Math.floor(cur / width);
        pixels.push(cx, cy);

        // 4-connected neighbors
        for (const dir of NEIGHBOR_DIRECTIONS) {
          const nx = cx + (dir[0] ?? 0);
          const ny = cy + (dir[1] ?? 0);
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = ny * width + nx;
          if (mask[ni] === 0 || visited[ni] === 1) continue;
          visited[ni] = 1;
          queue.push(ni);
        }
      }

      // 3. Extract bounding rect from component pixels
      if (pixels.length < 8) continue; // need at least 4 points

      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      for (let i = 0; i < pixels.length; i += 2) {
        const px = pixels[i] ?? 0;
        const py = pixels[i + 1] ?? 0;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }

      const sideX = maxX - minX;
      const sideY = maxY - minY;

      // 5. Filter by side length and area
      if (sideX < opts.minSideLength || sideY < opts.minSideLength) continue;
      if (sideX * sideY < opts.minArea) continue;

      // 6. Expand with unclip ratio
      const expandX = (sideX * (opts.unclipRatio - 1)) / 2;
      const expandY = (sideY * (opts.unclipRatio - 1)) / 2;

      const x0 = Math.max(0, Math.round(minX - expandX));
      const y0 = Math.max(0, Math.round(minY - expandY));
      const x1 = Math.min(width - 1, Math.round(maxX + expandX));
      const y1 = Math.min(height - 1, Math.round(maxY + expandY));

      let scoreSum = 0;
      const pixelCount = pixels.length / 2;
      for (let i = 0; i < pixels.length; i += 2) {
        const px = pixels[i] ?? 0;
        const py = pixels[i + 1] ?? 0;
        scoreSum += probMap[py * width + px] ?? 0;
      }
      const score = scoreSum / pixelCount;

      components.push({
        box: [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ],
        score,
      });
    }
  }

  // NMS on detected boxes
  const boxes = components.map((c) => c.box);
  const scores = components.map((c) => c.score);
  const kept = nmsBoxes(boxes, scores, 0.5);

  return kept.map((i) => ({
    points: components[i]?.box ?? [],
    score: components[i]?.score ?? 0,
  }));
}

/**
 * Sort boxes in reading order: top-to-bottom, left-to-right.
 */
export function sortBoxes(boxes: DetectedBox[]): DetectedBox[] {
  return [...boxes].sort((a, b) => {
    const yA = a.points.reduce((s, p) => s + (p[1] ?? 0), 0) / a.points.length;
    const yB = b.points.reduce((s, p) => s + (p[1] ?? 0), 0) / b.points.length;
    const rowDiff = yA - yB;
    if (Math.abs(rowDiff) > 10) return rowDiff;
    const xA = a.points.reduce((s, p) => s + (p[0] ?? 0), 0) / a.points.length;
    const xB = b.points.reduce((s, p) => s + (p[0] ?? 0), 0) / b.points.length;
    return xA - xB;
  });
}
