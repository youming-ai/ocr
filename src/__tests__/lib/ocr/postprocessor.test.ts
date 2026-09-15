import { describe, expect, it } from 'bun:test';
import { decodeCtc, extractBoxes, nmsBoxes } from '~/lib/ocr/postprocessor';

describe('decodeCtc', () => {
  it('decodes simple sequence with blank collapse', () => {
    // Simulate: blank, 'A', 'A', blank, 'B', blank
    const dict = ['', 'A', 'B', 'C'];
    const numClasses = dict.length;
    const logits = new Float32Array([
      1,
      0,
      0,
      0, // blank
      0,
      1,
      0,
      0, // A
      0,
      1,
      0,
      0, // A (duplicate — collapsed)
      1,
      0,
      0,
      0, // blank
      0,
      0,
      1,
      0, // B
      1,
      0,
      0,
      0, // blank
    ]);
    const result = decodeCtc(logits, numClasses, dict);
    expect(result.text).toBe('AB');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('handles empty logits', () => {
    const result = decodeCtc(new Float32Array(0), 2, ['', 'A']);
    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });

  it('decodes all-blank sequence', () => {
    const logits = new Float32Array([1, 0, 1, 0]);
    const result = decodeCtc(logits, 2, ['', 'A']);
    expect(result.text).toBe('');
  });

  it('averages confidence per emitted character, not per UTF-16 unit', () => {
    // U+10000 is a surrogate pair in UTF-16 (string length 2) but one character.
    const astral = String.fromCodePoint(0x10000);
    const dict = ['', astral, 'B'];
    const logits = new Float32Array([
      0,
      0.8,
      0, // astral @ 0.8
      0,
      0,
      0.6, // B @ 0.6
    ]);
    const result = decodeCtc(logits, 3, dict);
    expect(result.text).toBe(`${astral}B`);
    // (0.8 + 0.6) / 2, not (0.8 + 0.6) / 3.
    expect(result.confidence).toBeCloseTo(0.7, 5);
  });
});

describe('nmsBoxes', () => {
  it('keeps non-overlapping boxes', () => {
    const boxes = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
      ],
    ];
    const scores = [0.9, 0.8];
    const result = nmsBoxes(boxes, scores, 0.5);
    expect(result).toHaveLength(2);
  });

  it('removes highly overlapping boxes', () => {
    const boxes = [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      [
        [1, 1],
        [11, 1],
        [11, 11],
        [1, 11],
      ],
    ];
    const scores = [0.9, 0.8];
    const result = nmsBoxes(boxes, scores, 0.5);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(0); // higher score kept
  });
});

describe('extractBoxes', () => {
  const BASE_OPTS = {
    threshold: 0.2,
    boxThreshold: 0.45,
    unclipRatio: 1.4,
    minSideLength: 3,
    minArea: 10,
  };

  it('returns empty array for all-zero probability map', () => {
    const probMap = new Float32Array(32 * 32); // all zeros
    expect(extractBoxes(probMap, 32, 32, BASE_OPTS)).toHaveLength(0);
  });

  it('extracts a box from a filled region', () => {
    const width = 64;
    const height = 64;
    const probMap = new Float32Array(width * height);
    // Fill a 20x20 rectangle in the center
    for (let y = 20; y < 40; y++) {
      for (let x = 20; x < 40; x++) {
        probMap[y * width + x] = 0.9;
      }
    }
    const result = extractBoxes(probMap, width, height, BASE_OPTS);
    expect(result.length).toBeGreaterThanOrEqual(1);
    if (result.length > 0) {
      expect(result[0]?.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('drops boxes whose mean score is below boxThreshold', () => {
    const width = 64;
    const height = 64;
    const probMap = new Float32Array(width * height);
    // 0.3 clears the 0.2 binarization threshold but not box_thresh 0.45.
    for (let y = 20; y < 40; y++) {
      for (let x = 20; x < 40; x++) {
        probMap[y * width + x] = 0.3;
      }
    }
    expect(extractBoxes(probMap, width, height, BASE_OPTS)).toHaveLength(0);
  });

  it('throws when the map is smaller than the stated dimensions', () => {
    expect(() => extractBoxes(new Float32Array(16), 32, 32, BASE_OPTS)).toThrow(/16 values/);
  });
});
