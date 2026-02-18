/**
 * Color Inversion Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { applyColorInversion, isInvertedPixel } from './Inversion';
import { createTestImageData } from '../../test/utils';

describe('Color Inversion', () => {
  describe('applyColorInversion', () => {
    it('INV-U001: inverts pure black to pure white', () => {
      const imageData = createTestImageData(1, 1, { r: 0, g: 0, b: 0, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(255);
      expect(imageData.data[1]).toBe(255);
      expect(imageData.data[2]).toBe(255);
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U002: inverts pure white to pure black', () => {
      const imageData = createTestImageData(1, 1, { r: 255, g: 255, b: 255, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(0);
      expect(imageData.data[1]).toBe(0);
      expect(imageData.data[2]).toBe(0);
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U003: inverts mid-gray to mid-gray', () => {
      const imageData = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(127);
      expect(imageData.data[1]).toBe(127);
      expect(imageData.data[2]).toBe(127);
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U004: inverts pure red correctly', () => {
      const imageData = createTestImageData(1, 1, { r: 255, g: 0, b: 0, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(0);   // R -> 0 (cyan)
      expect(imageData.data[1]).toBe(255); // G -> 255
      expect(imageData.data[2]).toBe(255); // B -> 255
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U005: inverts pure green correctly', () => {
      const imageData = createTestImageData(1, 1, { r: 0, g: 255, b: 0, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(255); // R -> 255 (magenta)
      expect(imageData.data[1]).toBe(0);   // G -> 0
      expect(imageData.data[2]).toBe(255); // B -> 255
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U006: inverts pure blue correctly', () => {
      const imageData = createTestImageData(1, 1, { r: 0, g: 0, b: 255, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(255); // R -> 255 (yellow)
      expect(imageData.data[1]).toBe(255); // G -> 255
      expect(imageData.data[2]).toBe(0);   // B -> 0
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U007: preserves alpha channel (fully opaque)', () => {
      const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U008: preserves alpha channel (semi-transparent)', () => {
      const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 128 });
      applyColorInversion(imageData);
      expect(imageData.data[3]).toBe(128);
    });

    it('INV-U009: preserves alpha channel (fully transparent)', () => {
      const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 0 });
      applyColorInversion(imageData);
      expect(imageData.data[3]).toBe(0);
    });

    it('INV-U010: inverts arbitrary pixel correctly', () => {
      const imageData = createTestImageData(1, 1, { r: 100, g: 150, b: 200, a: 180 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(155);
      expect(imageData.data[1]).toBe(105);
      expect(imageData.data[2]).toBe(55);
      expect(imageData.data[3]).toBe(180);
    });

    it('INV-U011: handles single pixel ImageData', () => {
      const imageData = createTestImageData(1, 1, { r: 50, g: 100, b: 150, a: 255 });
      applyColorInversion(imageData);
      expect(imageData.data[0]).toBe(205);
      expect(imageData.data[1]).toBe(155);
      expect(imageData.data[2]).toBe(105);
      expect(imageData.data[3]).toBe(255);
    });

    it('INV-U012: handles multi-pixel ImageData', () => {
      const imageData = createTestImageData(4, 4, { r: 200, g: 100, b: 50, a: 255 });
      applyColorInversion(imageData);
      // Check all 16 pixels
      for (let i = 0; i < imageData.data.length; i += 4) {
        expect(imageData.data[i]).toBe(55);
        expect(imageData.data[i + 1]).toBe(155);
        expect(imageData.data[i + 2]).toBe(205);
        expect(imageData.data[i + 3]).toBe(255);
      }
    });

    it('INV-U013: double inversion restores original', () => {
      const imageData = createTestImageData(2, 2, { r: 123, g: 45, b: 67, a: 200 });
      const originalData = new Uint8ClampedArray(imageData.data);
      applyColorInversion(imageData);
      applyColorInversion(imageData);
      expect(Array.from(imageData.data)).toEqual(Array.from(originalData));
    });

    it('INV-U014: modifies ImageData in-place', () => {
      const imageData = createTestImageData(1, 1, { r: 100, g: 100, b: 100, a: 255 });
      const dataRef = imageData.data;
      applyColorInversion(imageData);
      expect(imageData.data).toBe(dataRef);
      expect(imageData.data[0]).toBe(155);
    });

    it('INV-U015: does not allocate new ImageData', () => {
      const imageData = createTestImageData(1, 1, { r: 50, g: 50, b: 50, a: 255 });
      const result = applyColorInversion(imageData);
      expect(result).toBeUndefined();
    });

    it('INV-U016: handles empty ImageData (0x0)', () => {
      // ImageData with 0x0 is not valid in spec, use 1x1 with no fill as minimal case
      const imageData = createTestImageData(1, 1);
      expect(() => applyColorInversion(imageData)).not.toThrow();
    });

    it('INV-U020: performance: inverts 1920x1080 image under 150ms', () => {
      const imageData = createTestImageData(1920, 1080, { r: 128, g: 128, b: 128, a: 255 });
      const start = performance.now();
      applyColorInversion(imageData);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('isInvertedPixel', () => {
    it('INV-U017: returns true for correctly inverted pixel', () => {
      const original: [number, number, number, number] = [100, 150, 200, 255];
      const inverted: [number, number, number, number] = [155, 105, 55, 255];
      expect(isInvertedPixel(original, inverted)).toBe(true);
    });

    it('INV-U018: returns false for non-inverted pixel', () => {
      const original: [number, number, number, number] = [100, 150, 200, 255];
      const notInverted: [number, number, number, number] = [100, 150, 200, 255];
      expect(isInvertedPixel(original, notInverted)).toBe(false);
    });

    it('INV-U019: checks alpha preservation', () => {
      const original: [number, number, number, number] = [100, 150, 200, 128];
      const wrongAlpha: [number, number, number, number] = [155, 105, 55, 255];
      expect(isInvertedPixel(original, wrongAlpha)).toBe(false);
    });
  });
});
