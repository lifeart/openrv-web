/**
 * Deinterlace Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  applyDeinterlace,
  isDeinterlaceActive,
  detectInterlacing,
  DEFAULT_DEINTERLACE_PARAMS,
} from './Deinterlace';

// Helper to create test ImageData
function createTestImageData(width: number, height: number, fill?: number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0] ?? 128;
      data[i + 1] = fill[1] ?? 128;
      data[i + 2] = fill[2] ?? 128;
      data[i + 3] = fill[3] ?? 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Create a synthetic interlaced pattern: even lines white, odd lines black.
 * This simulates perfect combing artifacts from interlaced video with motion.
 */
function createInterlacedPattern(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const value = y % 2 === 0 ? 255 : 0; // Even=white, Odd=black
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Calculate average absolute luminance difference between adjacent lines.
 * High values indicate combing; low values indicate smooth transitions.
 */
function interLineVariance(imageData: ImageData): number {
  const { data, width, height } = imageData;
  let totalDiff = 0;
  let count = 0;

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const idxBelow = ((y + 1) * width + x) * 4;
      const luma = 0.2126 * data[idx]! + 0.7152 * data[idx + 1]! + 0.0722 * data[idx + 2]!;
      const lumaBelow = 0.2126 * data[idxBelow]! + 0.7152 * data[idxBelow + 1]! + 0.0722 * data[idxBelow + 2]!;
      totalDiff += Math.abs(luma - lumaBelow);
      count++;
    }
  }

  return count > 0 ? totalDiff / count : 0;
}

describe('Deinterlace', () => {
  describe('DEFAULT_DEINTERLACE_PARAMS', () => {
    it('DEINT-T011: should have expected default values', () => {
      expect(DEFAULT_DEINTERLACE_PARAMS.method).toBe('bob');
      expect(DEFAULT_DEINTERLACE_PARAMS.fieldOrder).toBe('tff');
      expect(DEFAULT_DEINTERLACE_PARAMS.enabled).toBe(false);
    });
  });

  describe('isDeinterlaceActive', () => {
    it('DEINT-T010a: should return false when disabled', () => {
      expect(isDeinterlaceActive({ method: 'bob', fieldOrder: 'tff', enabled: false })).toBe(false);
    });

    it('DEINT-T010b: should return false for weave even when enabled', () => {
      expect(isDeinterlaceActive({ method: 'weave', fieldOrder: 'tff', enabled: true })).toBe(false);
    });

    it('DEINT-T010c: should return true for bob when enabled', () => {
      expect(isDeinterlaceActive({ method: 'bob', fieldOrder: 'tff', enabled: true })).toBe(true);
    });

    it('DEINT-T010d: should return true for blend when enabled', () => {
      expect(isDeinterlaceActive({ method: 'blend', fieldOrder: 'tff', enabled: true })).toBe(true);
    });
  });

  describe('applyDeinterlace', () => {
    it('DEINT-T007: should not modify image when enabled=false', () => {
      const imageData = createInterlacedPattern(10, 10);
      const originalData = new Uint8ClampedArray(imageData.data);

      applyDeinterlace(imageData, {
        method: 'bob',
        fieldOrder: 'tff',
        enabled: false,
      });

      expect(imageData.data).toEqual(originalData);
    });

    it('DEINT-T002: weave returns identical data (no-op)', () => {
      const imageData = createInterlacedPattern(10, 10);
      const originalData = new Uint8ClampedArray(imageData.data);

      applyDeinterlace(imageData, {
        method: 'weave',
        fieldOrder: 'tff',
        enabled: true,
      });

      expect(imageData.data).toEqual(originalData);
    });

    it('DEINT-T001: bob produces smooth output from interlaced pattern', () => {
      const imageData = createInterlacedPattern(20, 20);
      const varianceBefore = interLineVariance(imageData);

      applyDeinterlace(imageData, {
        method: 'bob',
        fieldOrder: 'tff',
        enabled: true,
      });

      const varianceAfter = interLineVariance(imageData);
      // Bob should dramatically reduce inter-line variance
      expect(varianceAfter).toBeLessThan(varianceBefore);
    });

    it('DEINT-T003: blend reduces inter-line variance', () => {
      const imageData = createInterlacedPattern(20, 20);
      const varianceBefore = interLineVariance(imageData);

      applyDeinterlace(imageData, {
        method: 'blend',
        fieldOrder: 'tff',
        enabled: true,
      });

      const varianceAfter = interLineVariance(imageData);
      expect(varianceAfter).toBeLessThan(varianceBefore);
    });

    it('DEINT-T004a: TFF bob keeps even lines from original', () => {
      const imageData = createInterlacedPattern(10, 10);

      applyDeinterlace(imageData, {
        method: 'bob',
        fieldOrder: 'tff',
        enabled: true,
      });

      const { data, width } = imageData;
      // TFF: even lines (kept field) should be white (255)
      for (let y = 0; y < 10; y += 2) {
        const idx = (y * width) * 4;
        expect(data[idx]).toBe(255);
        expect(data[idx + 1]).toBe(255);
        expect(data[idx + 2]).toBe(255);
      }
    });

    it('DEINT-T004b: BFF bob keeps odd lines from original', () => {
      const imageData = createInterlacedPattern(10, 10);

      applyDeinterlace(imageData, {
        method: 'bob',
        fieldOrder: 'bff',
        enabled: true,
      });

      const { data, width } = imageData;
      // BFF: odd lines (kept field) should be black (0)
      for (let y = 1; y < 10; y += 2) {
        const idx = (y * width) * 4;
        expect(data[idx]).toBe(0);
        expect(data[idx + 1]).toBe(0);
        expect(data[idx + 2]).toBe(0);
      }
    });

    it('DEINT-T008: alpha channel preserved', () => {
      const imageData = createTestImageData(10, 10, [128, 128, 128, 200]);

      // Set alternating line pattern for R channel to create combing
      for (let y = 0; y < 10; y++) {
        const value = y % 2 === 0 ? 255 : 0;
        for (let x = 0; x < 10; x++) {
          imageData.data[(y * 10 + x) * 4] = value;
        }
      }

      applyDeinterlace(imageData, {
        method: 'bob',
        fieldOrder: 'tff',
        enabled: true,
      });

      // All alpha values should still be 200
      for (let i = 3; i < imageData.data.length; i += 4) {
        expect(imageData.data[i]).toBe(200);
      }
    });

    it('DEINT-T009: handles small images (2x2)', () => {
      const imageData = createInterlacedPattern(2, 2);

      expect(() => {
        applyDeinterlace(imageData, {
          method: 'bob',
          fieldOrder: 'tff',
          enabled: true,
        });
      }).not.toThrow();

      expect(() => {
        applyDeinterlace(imageData, {
          method: 'blend',
          fieldOrder: 'tff',
          enabled: true,
        });
      }).not.toThrow();
    });
  });

  describe('detectInterlacing', () => {
    it('DEINT-T005: returns high combMetric for interlaced pattern', () => {
      const imageData = createInterlacedPattern(40, 40);
      const result = detectInterlacing(imageData);

      expect(result.combMetric).toBeGreaterThan(30);
      expect(result.isInterlaced).toBe(true);
    });

    it('DEINT-T006: returns low combMetric for progressive (uniform) image', () => {
      const imageData = createTestImageData(40, 40, [128, 128, 128, 255]);
      const result = detectInterlacing(imageData);

      expect(result.combMetric).toBe(0);
      expect(result.isInterlaced).toBe(false);
    });

    it('should handle very small images gracefully', () => {
      const imageData = createTestImageData(2, 2, [128, 128, 128, 255]);
      const result = detectInterlacing(imageData);

      expect(result.isInterlaced).toBe(false);
      expect(result.combMetric).toBe(0);
    });
  });
});
