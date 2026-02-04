/**
 * HDRPixelData Unit Tests
 *
 * Tests for the HDR pixel data compatibility wrapper that provides
 * unified access to ImageData pixels regardless of underlying storage type.
 *
 * Test ID prefix: P3- (Phase 3)
 */

import { describe, it, expect } from 'vitest';
import { getPixelValue, isHDRImageData, getMaxRepresentableValue } from './HDRPixelData';

describe('HDRPixelData', () => {
  // ====================================================================
  // getPixelValue
  // ====================================================================
  describe('getPixelValue', () => {
    it('P3-001: returns value/255 for Uint8ClampedArray (SDR path)', () => {
      const imageData = new ImageData(2, 2);
      // Set pixel at (0,0) to RGBA (128, 64, 255, 200)
      imageData.data[0] = 128;
      imageData.data[1] = 64;
      imageData.data[2] = 255;
      imageData.data[3] = 200;

      expect(getPixelValue(imageData, 0)).toBeCloseTo(128 / 255, 6);
      expect(getPixelValue(imageData, 1)).toBeCloseTo(64 / 255, 6);
      expect(getPixelValue(imageData, 2)).toBeCloseTo(255 / 255, 6);
      expect(getPixelValue(imageData, 3)).toBeCloseTo(200 / 255, 6);
    });

    it('P3-002: returns 0 for Uint8ClampedArray with zero values', () => {
      const imageData = new ImageData(1, 1);
      // Default is all zeros
      expect(getPixelValue(imageData, 0)).toBe(0);
      expect(getPixelValue(imageData, 1)).toBe(0);
      expect(getPixelValue(imageData, 2)).toBe(0);
      expect(getPixelValue(imageData, 3)).toBe(0);
    });

    it('P3-003: returns 1.0 for Uint8ClampedArray with 255', () => {
      const imageData = new ImageData(1, 1);
      imageData.data[0] = 255;
      expect(getPixelValue(imageData, 0)).toBe(1);
    });

    it('P3-004: returns value directly for Float32Array (HDR path)', () => {
      // Simulate HDR ImageData with Float32Array backing
      const floatData = new Float32Array([1.5, 0.5, 2.0, 1.0]);
      const hdrImageData = {
        data: floatData,
        width: 1,
        height: 1,
        colorSpace: 'display-p3',
      } as unknown as ImageData;

      expect(getPixelValue(hdrImageData, 0)).toBe(1.5);
      expect(getPixelValue(hdrImageData, 1)).toBe(0.5);
      expect(getPixelValue(hdrImageData, 2)).toBe(2.0);
      expect(getPixelValue(hdrImageData, 3)).toBe(1.0);
    });

    it('P3-005: handles values > 1.0 in Float32Array (HDR content)', () => {
      const floatData = new Float32Array([4.0, 3.5, 0.0, 1.0]);
      const hdrImageData = {
        data: floatData,
        width: 1,
        height: 1,
        colorSpace: 'rec2100-hlg',
      } as unknown as ImageData;

      expect(getPixelValue(hdrImageData, 0)).toBe(4.0);
      expect(getPixelValue(hdrImageData, 1)).toBe(3.5);
    });

    it('P3-006: returns 0 for out-of-bounds offset with Uint8ClampedArray', () => {
      const imageData = new ImageData(1, 1);
      // Offset 4 is out of bounds for a 1x1 image (only 0-3 valid)
      expect(getPixelValue(imageData, 100)).toBe(0);
    });

    it('P3-007: returns 0 for out-of-bounds offset with Float32Array', () => {
      const floatData = new Float32Array([1.0, 0.5, 0.0, 1.0]);
      const hdrImageData = {
        data: floatData,
        width: 1,
        height: 1,
      } as unknown as ImageData;

      expect(getPixelValue(hdrImageData, 100)).toBe(0);
    });

    it('P3-008: SDR mode behavior is identical to direct data[offset]/255', () => {
      const imageData = new ImageData(4, 4);
      // Fill with varied data
      for (let i = 0; i < imageData.data.length; i++) {
        imageData.data[i] = i % 256;
      }

      // Verify every pixel matches direct access
      for (let i = 0; i < imageData.data.length; i++) {
        const expected = (imageData.data[i] ?? 0) / 255;
        expect(getPixelValue(imageData, i)).toBe(expected);
      }
    });
  });

  // ====================================================================
  // isHDRImageData
  // ====================================================================
  describe('isHDRImageData', () => {
    it('P3-009: returns false for standard Uint8ClampedArray ImageData', () => {
      const imageData = new ImageData(1, 1);
      expect(isHDRImageData(imageData)).toBe(false);
    });

    it('P3-010: returns true for Float32Array-backed ImageData', () => {
      const floatData = new Float32Array(4);
      const hdrImageData = {
        data: floatData,
        width: 1,
        height: 1,
      } as unknown as ImageData;

      expect(isHDRImageData(hdrImageData)).toBe(true);
    });
  });

  // ====================================================================
  // getMaxRepresentableValue
  // ====================================================================
  describe('getMaxRepresentableValue', () => {
    it('P3-011: returns 1.0 for standard SDR ImageData', () => {
      const imageData = new ImageData(1, 1);
      expect(getMaxRepresentableValue(imageData)).toBe(1.0);
    });

    it('P3-012: returns Infinity for HDR (Float32) ImageData', () => {
      const floatData = new Float32Array(4);
      const hdrImageData = {
        data: floatData,
        width: 1,
        height: 1,
      } as unknown as ImageData;

      expect(getMaxRepresentableValue(hdrImageData)).toBe(Infinity);
    });
  });

  // ====================================================================
  // Backward compatibility
  // ====================================================================
  describe('backward compatibility', () => {
    it('P3-013: getPixelValue with standard ImageData produces identical results to manual normalization', () => {
      // This test verifies that the SDR path is a trivial passthrough
      const imageData = new ImageData(10, 10);
      const testValues = [0, 1, 127, 128, 254, 255];

      for (const val of testValues) {
        imageData.data[0] = val;
        const wrapperResult = getPixelValue(imageData, 0);
        const directResult = val / 255;
        expect(wrapperResult).toBe(directResult);
      }
    });

    it('P3-014: getPixelValue handles negative float values in HDR data', () => {
      // HDR data can technically have negative values (out-of-gamut)
      const floatData = new Float32Array([-0.1, -0.5, 0.0, 1.0]);
      const hdrImageData = {
        data: floatData,
        width: 1,
        height: 1,
      } as unknown as ImageData;

      expect(getPixelValue(hdrImageData, 0)).toBeCloseTo(-0.1, 5);
      expect(getPixelValue(hdrImageData, 1)).toBeCloseTo(-0.5, 5);
    });
  });
});
