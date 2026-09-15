import { describe, expect, it } from 'bun:test';
import { normalizeForDet, normalizeForRec, resizeImage } from '~/lib/ocr/preprocessor';

describe('resizeImage', () => {
  it('keeps dimensions within maxDimension but snaps to multiples of 32', () => {
    const result = resizeImage(800, 600, 960);
    expect(result.width).toBe(800); // already a multiple of 32
    expect(result.height).toBe(608); // 600 snapped up to the nearest multiple of 32
    expect(result.scaleX).toBeCloseTo(1);
    expect(result.height % 32).toBe(0);
  });

  it('scales down wide images to maxDimension', () => {
    const result = resizeImage(1920, 1080, 960);
    expect(result.width).toBe(960);
    expect(result.height).toBe(544); // 1080 * 0.5 = 540, rounded to 544 (multiple of 32)
    expect(result.scaleX).toBeCloseTo(0.5);
  });

  it('scales down tall images to maxDimension', () => {
    const result = resizeImage(1080, 1920, 960);
    expect(result.width).toBe(544); // 1080 * 0.5 = 540, rounded to 544 (multiple of 32)
    expect(result.height).toBe(960);
    expect(result.scaleY).toBeCloseTo(0.5);
  });

  it('rounds dimensions to multiples of 32', () => {
    const result = resizeImage(1000, 750, 960);
    expect(result.width % 32).toBe(0);
    expect(result.height % 32).toBe(0);
  });
});

describe('normalizeForDet', () => {
  it('applies the model ImageNet mean/std per BGR channel', () => {
    // One pixel, mid grey in every channel: B=G=R=0.5.
    const input = new Float32Array([0.5, 0.5, 0.5]);
    const out = normalizeForDet(input);
    // (0.5 - 0.485) / 0.229, (0.5 - 0.456) / 0.224, (0.5 - 0.406) / 0.225
    expect(out[0]).toBeCloseTo(0.065502, 5);
    expect(out[1]).toBeCloseTo(0.196429, 5);
    expect(out[2]).toBeCloseTo(0.417778, 5);
  });

  it('preserves BGR channel order and does not mutate the input', () => {
    const input = new Float32Array([1, 0, 0]); // B only
    const out = normalizeForDet(input);
    expect(out[0]).toBeCloseTo(2.248908, 5);
    expect(out[1]).toBeCloseTo(-2.035714, 5);
    expect(out[2]).toBeCloseTo(-1.804444, 5);
    expect(Array.from(input)).toEqual([1, 0, 0]);
  });
});

describe('normalizeForRec', () => {
  it('resizes to fixed height 48 and normalizes', () => {
    const input = new Float32Array(100 * 32 * 3); // 100x32 image, 3 channels
    const result = normalizeForRec(input, 100, 32, 48);
    // Output height should be 48
    expect(result.height).toBe(48);
  });
});
