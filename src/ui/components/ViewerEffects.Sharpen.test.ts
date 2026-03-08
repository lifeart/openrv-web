/**
 * ViewerEffects Sharpen Tests
 *
 * Tests for CPU-based sharpening filter (unsharp mask approximation).
 */

import { describe, it, expect } from 'vitest';
import { applySharpenCPU } from './ViewerEffects';

/** Helper: create ImageData from flat RGBA array */
function createImageData(pixels: number[], width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(pixels),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

/** Helper: create uniform NxN image */
function createUniformImage(width: number, height: number, r: number, g: number, b: number, a = 255): ImageData {
  const pixels: number[] = [];
  for (let i = 0; i < width * height; i++) {
    pixels.push(r, g, b, a);
  }
  return createImageData(pixels, width, height);
}

/** Helper: get pixel at (x, y) */
function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!];
}

describe('applySharpenCPU', () => {
  it('SHP-001: amount=0 leaves pixels unchanged', () => {
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        pixels.push((x * 50) % 256, (y * 50) % 256, 128, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);
    const original = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 0);
    expect(img.data).toEqual(original);
  });

  it('SHP-002: positive amount on uniform image leaves it unchanged (no edges)', () => {
    const img = createUniformImage(5, 5, 128, 128, 128);
    const original = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 1.0);
    // Uniform image: kernel sum = center * 5 - 4 neighbors * 1 = 128*5 - 4*128 = 128
    // So sharpened == original for uniform images
    expect(img.data).toEqual(original);
  });

  it('SHP-003: sharpening increases contrast at edges', () => {
    // 5x5: left half dark, right half bright (edge at column 2-3)
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = x < 3 ? 80 : 200;
        pixels.push(v, v, v, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);

    // Get values at the edge before sharpening
    const darkSideBefore = getPixel(img, 2, 2)[0]; // 80 (dark side of edge)
    const brightSideBefore = getPixel(img, 3, 2)[0]; // 200 (bright side of edge)

    applySharpenCPU(img, 1.0);

    const darkSideAfter = getPixel(img, 2, 2)[0];
    const brightSideAfter = getPixel(img, 3, 2)[0];

    // Sharpening should make the dark side darker and bright side brighter at the edge
    expect(darkSideAfter).toBeLessThanOrEqual(darkSideBefore);
    expect(brightSideAfter).toBeGreaterThanOrEqual(brightSideBefore);
  });

  it('SHP-004: border pixels are unchanged (kernel skips y=0, y=last, x=0, x=last)', () => {
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = (x + y) * 20;
        pixels.push(v, v, v, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);
    const original = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 1.0);

    // Check all border pixels are unchanged
    for (let x = 0; x < 5; x++) {
      // Top row (y=0)
      expect(getPixel(img, x, 0)).toEqual([
        original[(0 * 5 + x) * 4]!,
        original[(0 * 5 + x) * 4 + 1]!,
        original[(0 * 5 + x) * 4 + 2]!,
        original[(0 * 5 + x) * 4 + 3]!,
      ]);
      // Bottom row (y=4)
      expect(getPixel(img, x, 4)).toEqual([
        original[(4 * 5 + x) * 4]!,
        original[(4 * 5 + x) * 4 + 1]!,
        original[(4 * 5 + x) * 4 + 2]!,
        original[(4 * 5 + x) * 4 + 3]!,
      ]);
    }
    for (let y = 0; y < 5; y++) {
      // Left column (x=0)
      expect(getPixel(img, 0, y)).toEqual([
        original[(y * 5 + 0) * 4]!,
        original[(y * 5 + 0) * 4 + 1]!,
        original[(y * 5 + 0) * 4 + 2]!,
        original[(y * 5 + 0) * 4 + 3]!,
      ]);
      // Right column (x=4)
      expect(getPixel(img, 4, y)).toEqual([
        original[(y * 5 + 4) * 4]!,
        original[(y * 5 + 4) * 4 + 1]!,
        original[(y * 5 + 4) * 4 + 2]!,
        original[(y * 5 + 4) * 4 + 3]!,
      ]);
    }
  });

  it('SHP-005: alpha channel is preserved', () => {
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        pixels.push(x * 50, y * 50, 100, 128 + x);
      }
    }
    const img = createImageData(pixels, 5, 5);
    const originalAlphas: number[] = [];
    for (let i = 3; i < img.data.length; i += 4) {
      originalAlphas.push(img.data[i]!);
    }
    applySharpenCPU(img, 1.0);
    for (let i = 0; i < originalAlphas.length; i++) {
      expect(img.data[i * 4 + 3]).toBe(originalAlphas[i]);
    }
  });

  it('SHP-006: values are clamped to [0, 255], no overflow', () => {
    // High contrast: 0 next to 255
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = (x + y) % 2 === 0 ? 0 : 255;
        pixels.push(v, v, v, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);
    applySharpenCPU(img, 1.0);
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i]!).toBeLessThanOrEqual(255);
      expect(img.data[i + 1]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i + 1]!).toBeLessThanOrEqual(255);
      expect(img.data[i + 2]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i + 2]!).toBeLessThanOrEqual(255);
    }
  });

  it('SHP-007: 3x3 image only center pixel is affected', () => {
    const pixels = [
      50, 50, 50, 255, 50, 50, 50, 255, 50, 50, 50, 255,
      50, 50, 50, 255, 200, 200, 200, 255, 50, 50, 50, 255,
      50, 50, 50, 255, 50, 50, 50, 255, 50, 50, 50, 255,
    ];
    const img = createImageData(pixels, 3, 3);
    const original = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 1.0);

    // All border pixels should be unchanged
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (x === 1 && y === 1) continue; // skip center
        const idx = (y * 3 + x) * 4;
        expect(img.data[idx]).toBe(original[idx]);
        expect(img.data[idx + 1]).toBe(original[idx + 1]);
        expect(img.data[idx + 2]).toBe(original[idx + 2]);
      }
    }

    // Center pixel should be sharpened (brighter because it's brighter than surroundings)
    const centerAfter = getPixel(img, 1, 1)[0];
    expect(centerAfter).toBeGreaterThan(200);
  });

  it('SHP-008: 2x2 image all pixels are border, all unchanged', () => {
    const pixels = [
      100, 100, 100, 255,
      200, 200, 200, 255,
      50, 50, 50, 255,
      150, 150, 150, 255,
    ];
    const img = createImageData(pixels, 2, 2);
    const original = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 1.0);
    expect(img.data).toEqual(original);
  });

  it('SHP-009: 1x1 image is unchanged (no interior pixels)', () => {
    const img = createImageData([128, 128, 128, 255], 1, 1);
    applySharpenCPU(img, 1.0);
    expect(img.data[0]).toBe(128);
    expect(img.data[1]).toBe(128);
    expect(img.data[2]).toBe(128);
    expect(img.data[3]).toBe(255);
  });

  it('SHP-010: higher amount produces stronger sharpening', () => {
    const makeImg = () => {
      const pixels: number[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const v = (x === 2 && y === 2) ? 200 : 100;
          pixels.push(v, v, v, 255);
        }
      }
      return createImageData(pixels, 5, 5);
    };

    const imgLow = makeImg();
    applySharpenCPU(imgLow, 0.3);
    const centerLow = getPixel(imgLow, 2, 2)[0];

    const imgHigh = makeImg();
    applySharpenCPU(imgHigh, 1.0);
    const centerHigh = getPixel(imgHigh, 2, 2)[0];

    // Higher amount should move center further from its original value of 200
    // Center is brighter than surroundings, so sharpening increases it
    expect(centerHigh).toBeGreaterThanOrEqual(centerLow);
  });

  it('SHP-011: RGB channels are processed independently', () => {
    // Center pixel has different R, G, B values
    const pixels: number[] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (x === 1 && y === 1) {
          pixels.push(200, 100, 50, 255);
        } else {
          pixels.push(100, 100, 100, 255);
        }
      }
    }
    const img = createImageData(pixels, 3, 3);
    applySharpenCPU(img, 1.0);
    const [r, g, b] = getPixel(img, 1, 1);
    // Red had highest contrast with surroundings, should be sharpened most
    // Green was same as surroundings => no change
    // Blue was lower than surroundings => should go lower
    expect(r).toBeGreaterThan(200);
    expect(g).toBe(100); // same as neighbors, no change
    expect(b).toBeLessThan(50); // darker than neighbors, goes darker
  });

  it('SHP-012: amount=0 with high-contrast image produces no change', () => {
    const pixels: number[] = [];
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = (x + y) % 2 === 0 ? 0 : 255;
        pixels.push(v, v, v, 255);
      }
    }
    const img = createImageData(pixels, 5, 5);
    const original = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 0);
    expect(img.data).toEqual(original);
  });

  it('SHP-013: fractional amount between 0 and 1 blends original and sharpened', () => {
    const makeImg = () => {
      const pixels: number[] = [];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const v = (x === 1 && y === 1) ? 200 : 80;
          pixels.push(v, v, v, 255);
        }
      }
      return createImageData(pixels, 3, 3);
    };

    const imgHalf = makeImg();
    applySharpenCPU(imgHalf, 0.5);
    const centerHalf = getPixel(imgHalf, 1, 1)[0];

    const imgFull = makeImg();
    applySharpenCPU(imgFull, 1.0);
    const centerFull = getPixel(imgFull, 1, 1)[0];

    // Half amount should be between original (200) and fully sharpened
    expect(centerHalf).toBeGreaterThanOrEqual(200);
    expect(centerHalf).toBeLessThanOrEqual(centerFull);
  });

  it('SHP-014: large image (10x10) processes without error', () => {
    const pixels: number[] = [];
    for (let i = 0; i < 100; i++) {
      pixels.push((i * 7) % 256, (i * 13) % 256, (i * 23) % 256, 255);
    }
    const img = createImageData(pixels, 10, 10);
    expect(() => applySharpenCPU(img, 0.8)).not.toThrow();
    for (let i = 0; i < img.data.length; i += 4) {
      expect(img.data[i]!).toBeGreaterThanOrEqual(0);
      expect(img.data[i]!).toBeLessThanOrEqual(255);
    }
  });

  it('SHP-015: sharpening black image produces no change', () => {
    const img = createUniformImage(5, 5, 0, 0, 0);
    const original = new Uint8ClampedArray(img.data);
    applySharpenCPU(img, 1.0);
    expect(img.data).toEqual(original);
  });
});
