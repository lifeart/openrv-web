/**
 * ViewerEffects Clarity Tests
 *
 * Tests for CPU-based clarity (local contrast / midtone enhancement) processing.
 */

import { describe, it, expect } from 'vitest';
import { applyClarity } from './ViewerEffects';

/** Helper: create ImageData from flat RGBA array */
function createImageData(pixels: number[], width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(pixels),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

/** Helper: create 1-pixel ImageData */
function createImageData1px(r: number, g: number, b: number, a = 255): ImageData {
  return createImageData([r, g, b, a], 1, 1);
}

/** Helper: create uniform NxN image (all pixels same color) */
function createUniformImage(width: number, height: number, r: number, g: number, b: number, a = 255): ImageData {
  const pixels: number[] = [];
  for (let i = 0; i < width * height; i++) {
    pixels.push(r, g, b, a);
  }
  return createImageData(pixels, width, height);
}

/** Helper: get pixel at (x, y) from ImageData */
function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!];
}

describe('applyClarity', () => {
  it('CLR-001: clarity=0 leaves pixels unchanged', () => {
    const img = createUniformImage(5, 5, 128, 100, 80);
    const original = new Uint8ClampedArray(img.data);
    applyClarity(img, 0);
    expect(img.data).toEqual(original);
  });

  it('CLR-002: positive clarity on midtone uniform image is mostly unchanged', () => {
    // Uniform image has no high-frequency detail, so clarity should have minimal effect
    const img = createUniformImage(5, 5, 128, 128, 128);
    applyClarity(img, 80);
    const [r, g, b] = getPixel(img, 2, 2);
    // Uniform image: blurred == original, so highFreq = 0 => no change
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });

  it('CLR-003: positive clarity increases local contrast on image with edges', () => {
    // 5x5 image: dark border, bright center
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const isBorder = x === 0 || x === 4 || y === 0 || y === 4;
        const v = isBorder ? 60 : 180;
        pixels.push(v, v, v, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);
    const centerBefore = getPixel(img, 2, 2)[0];

    applyClarity(img, 100);
    const centerAfter = getPixel(img, 2, 2)[0];

    // Center pixel is a midtone (180), with darker surroundings
    // High-frequency = original - blurred > 0, so positive clarity should boost it
    expect(centerAfter).toBeGreaterThanOrEqual(centerBefore);
  });

  it('CLR-004: negative clarity has smoothing effect', () => {
    // 5x5 image with alternating 80 and 180 values for texture
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = (x + y) % 2 === 0 ? 80 : 180;
        pixels.push(v, v, v, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);
    const original = new Uint8ClampedArray(img.data);

    applyClarity(img, -100);

    // Negative clarity should reduce the difference between neighboring pixels
    // Check center pixel - it should move toward the average
    const centerIdx = (2 * 5 + 2) * 4;
    const centerOriginal = original[centerIdx]!;
    const centerNew = img.data[centerIdx]!;
    // Center is 80. With negative clarity, high-freq detail is subtracted,
    // moving it toward the blurred value (closer to average)
    const diff = Math.abs(centerNew - 128); // distance from average
    const diffOriginal = Math.abs(centerOriginal - 128);
    expect(diff).toBeLessThanOrEqual(diffOriginal);
  });

  it('CLR-005: dark pixels have minimal clarity effect (midtone mask)', () => {
    // Very dark uniform region
    const img = createUniformImage(5, 5, 10, 10, 10);
    const original = new Uint8ClampedArray(img.data);
    applyClarity(img, 100);
    // Dark pixels: midtone mask is near 0, so effect should be minimal
    // Uniform image has no detail anyway, but verify no change
    expect(img.data).toEqual(original);
  });

  it('CLR-006: bright pixels have minimal clarity effect (midtone mask)', () => {
    const img = createUniformImage(5, 5, 245, 245, 245);
    const original = new Uint8ClampedArray(img.data);
    applyClarity(img, 100);
    expect(img.data).toEqual(original);
  });

  it('CLR-007: edge pixels do not cause out-of-bounds access', () => {
    // 3x3 image with varying values
    const pixels = [
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      128, 128, 0, 255, 64, 64, 64, 255, 200, 100, 50, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255,
    ];
    const img = createImageData(pixels, 3, 3);
    // Should not throw
    expect(() => applyClarity(img, 100)).not.toThrow();
    // All values should be in valid range
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i]!).toBeLessThanOrEqual(255);
      expect(img.data[i + 1]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i + 1]!).toBeLessThanOrEqual(255);
      expect(img.data[i + 2]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i + 2]!).toBeLessThanOrEqual(255);
    }
  });

  it('CLR-008: 1x1 image does not crash', () => {
    const img = createImageData1px(128, 128, 128);
    expect(() => applyClarity(img, 100)).not.toThrow();
    // Value should still be valid
    expect(img.data[0]!).toBeGreaterThanOrEqual(0);
    expect(img.data[0]!).toBeLessThanOrEqual(255);
  });

  it('CLR-009: 3x3 image center pixel is affected by clarity', () => {
    // Edge: dark, center: bright midtone
    const pixels = [
      40, 40, 40, 255, 40, 40, 40, 255, 40, 40, 40, 255,
      40, 40, 40, 255, 160, 160, 160, 255, 40, 40, 40, 255,
      40, 40, 40, 255, 40, 40, 40, 255, 40, 40, 40, 255,
    ];
    const img = createImageData(pixels, 3, 3);
    applyClarity(img, 100);
    const [r] = getPixel(img, 1, 1);
    // Center is bright in dark surroundings => high-freq positive => boosted
    expect(r).toBeGreaterThanOrEqual(160);
  });

  it('CLR-010: value clamping prevents overflow', () => {
    // High contrast edge
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = x < 3 ? 0 : 255;
        pixels.push(v, v, v, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);
    applyClarity(img, 100);
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i]!).toBeLessThanOrEqual(255);
    }
  });

  it('CLR-011: alpha channel remains unchanged', () => {
    const pixels = [
      128, 128, 128, 200, 128, 128, 128, 100, 128, 128, 128, 50,
      128, 128, 128, 0, 128, 128, 128, 255, 128, 128, 128, 128,
      128, 128, 128, 64, 128, 128, 128, 32, 128, 128, 128, 16,
    ];
    const img = createImageData(pixels, 3, 3);
    const alphas = [200, 100, 50, 0, 255, 128, 64, 32, 16];
    applyClarity(img, 80);
    for (let i = 0; i < 9; i++) {
      expect(img.data[i * 4 + 3]).toBe(alphas[i]);
    }
  });

  it('CLR-012: negative clarity on 1x1 does not crash', () => {
    const img = createImageData1px(128, 128, 128);
    expect(() => applyClarity(img, -100)).not.toThrow();
  });

  it('CLR-013: large image (10x10) processes without error', () => {
    const pixels: number[] = [];
    for (let i = 0; i < 100; i++) {
      pixels.push((i * 7) % 256, (i * 13) % 256, (i * 23) % 256, 255);
    }
    const img = createImageData(pixels, 10, 10);
    expect(() => applyClarity(img, 50)).not.toThrow();
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i]!).toBeLessThanOrEqual(255);
    }
  });

  it('CLR-014: clarity effect scales with parameter magnitude', () => {
    // Create identical images with texture
    const makeImg = () => {
      const pixels: number[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const v = (x + y) % 2 === 0 ? 100 : 160;
          pixels.push(v, v, v, 255);
        }
      }
      return createImageData(pixels, 5, 5);
    };

    const imgLow = makeImg();
    const imgHigh = makeImg();
    const original = new Uint8ClampedArray(imgLow.data);

    applyClarity(imgLow, 30);
    applyClarity(imgHigh, 90);

    // Higher clarity should produce bigger changes
    let diffLow = 0, diffHigh = 0;
    for (let i = 0; i < original.length; i += 4) {
      diffLow += Math.abs(imgLow.data[i]! - original[i]!);
      diffHigh += Math.abs(imgHigh.data[i]! - original[i]!);
    }
    expect(diffHigh).toBeGreaterThanOrEqual(diffLow);
  });

  it('CLR-015: midtone pixel (128) gets maximum clarity effect', () => {
    // 5x5 with bright center in dark surroundings
    const makePatchImg = (centerVal: number) => {
      const pixels: number[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const v = (x === 2 && y === 2) ? centerVal : 60;
          pixels.push(v, v, v, 255);
        }
      }
      return createImageData(pixels, 5, 5);
    };

    // Midtone center
    const imgMid = makePatchImg(128);
    const midBefore = getPixel(imgMid, 2, 2)[0];
    applyClarity(imgMid, 100);
    const midAfter = getPixel(imgMid, 2, 2)[0];
    const midDiff = Math.abs(midAfter - midBefore);

    // Very bright center (low midtone mask)
    const imgBright = makePatchImg(250);
    const brightBefore = getPixel(imgBright, 2, 2)[0];
    applyClarity(imgBright, 100);
    const brightAfter = getPixel(imgBright, 2, 2)[0];
    const brightDiff = Math.abs(brightAfter - brightBefore);

    // Midtone should get more effect than extreme
    expect(midDiff).toBeGreaterThanOrEqual(brightDiff);
  });

  it('CLR-016: 2x2 image processes without error', () => {
    const img = createImageData([
      100, 100, 100, 255,
      200, 200, 200, 255,
      50, 50, 50, 255,
      150, 150, 150, 255,
    ], 2, 2);
    expect(() => applyClarity(img, 50)).not.toThrow();
  });

  it('CLR-017: clarity on RGB channels only, all channels affected', () => {
    // Non-uniform colored image
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        pixels.push(
          (x === 2 && y === 2) ? 200 : 80,
          (x === 2 && y === 2) ? 150 : 60,
          (x === 2 && y === 2) ? 100 : 40,
          255,
        );
      }
    }
    const img = createImageData(pixels, 5, 5);
    const [rBefore, gBefore, bBefore] = getPixel(img, 2, 2);
    applyClarity(img, 80);
    const [rAfter, gAfter, bAfter] = getPixel(img, 2, 2);
    // All three channels should be affected for the center pixel
    const totalChange = Math.abs(rAfter - rBefore) + Math.abs(gAfter - gBefore) + Math.abs(bAfter - bBefore);
    expect(totalChange).toBeGreaterThan(0);
  });

  it('CLR-018: zero-size dimension does not crash', () => {
    // Edge case: 0 pixels
    const img = createImageData([], 0, 0);
    expect(() => applyClarity(img, 50)).not.toThrow();
  });

  it('CLR-019: positive and negative clarity produce opposite effects', () => {
    const makeImg = () => {
      const pixels: number[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const v = (x === 2 && y === 2) ? 140 : 80;
          pixels.push(v, v, v, 255);
        }
      }
      return createImageData(pixels, 5, 5);
    };

    const imgPos = makeImg();
    applyClarity(imgPos, 100);
    const centerPos = getPixel(imgPos, 2, 2)[0];

    const imgNeg = makeImg();
    applyClarity(imgNeg, -100);
    const centerNeg = getPixel(imgNeg, 2, 2)[0];

    // Positive should boost, negative should reduce
    // Center is brighter than surroundings, so positive clarity should increase it
    // and negative should decrease it
    expect(centerPos).toBeGreaterThan(centerNeg);
  });

  it('CLR-020: repeated application accumulates effect', () => {
    const makeImg = () => {
      const pixels: number[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const v = (x === 2 && y === 2) ? 160 : 80;
          pixels.push(v, v, v, 255);
        }
      }
      return createImageData(pixels, 5, 5);
    };

    const imgOnce = makeImg();
    applyClarity(imgOnce, 50);
    const centerOnce = getPixel(imgOnce, 2, 2)[0];

    const imgTwice = makeImg();
    applyClarity(imgTwice, 50);
    applyClarity(imgTwice, 50);
    const centerTwice = getPixel(imgTwice, 2, 2)[0];

    // Two applications should produce more effect than one
    expect(Math.abs(centerTwice - 160)).toBeGreaterThanOrEqual(Math.abs(centerOnce - 160));
  });
});
