/**
 * Stereo Single-Eye Viewing Mode Tests
 *
 * Tests for left-only and right-only stereo viewing modes.
 * These modes extract a single eye from stereo content and display it
 * at full output resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  applyStereoMode,
  applyStereoModeWithEyeTransforms,
  getStereoModeLabel,
  getStereoModeShortLabel,
  isDefaultStereoState,
} from './StereoRenderer';
import type { StereoState } from '../core/types/stereo';

// Helper to create test ImageData
function createTestImageData(
  width: number,
  height: number,
  fill?: (x: number, y: number) => [number, number, number, number]
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (fill) {
        const [r, g, b, a] = fill(x, y);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      } else {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      }
    }
  }
  return new ImageData(data, width, height);
}

// Helper to get pixel at x,y
function getPixel(
  img: ImageData,
  x: number,
  y: number
): [number, number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!];
}

describe('Stereo Single-Eye Modes', () => {
  // Create a side-by-side stereo source: left half RED, right half BLUE
  function createStereoSource(width = 100, height = 50) {
    return createTestImageData(width, height, (x) => {
      const halfWidth = Math.floor(width / 2);
      if (x < halfWidth) return [255, 0, 0, 255]; // Left: red
      return [0, 0, 255, 255]; // Right: blue
    });
  }

  describe('left-only mode', () => {
    it('SE-001: left-only displays only the left eye', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      // Output should be full size
      expect(result.width).toBe(100);
      expect(result.height).toBe(50);

      // All pixels should be red (from left eye)
      const leftPixel = getPixel(result, 10, 25);
      expect(leftPixel[0]).toBeGreaterThan(200); // Red
      expect(leftPixel[2]).toBeLessThan(50); // Not blue

      const centerPixel = getPixel(result, 50, 25);
      expect(centerPixel[0]).toBeGreaterThan(200); // Red
      expect(centerPixel[2]).toBeLessThan(50); // Not blue

      const rightPixel = getPixel(result, 90, 25);
      expect(rightPixel[0]).toBeGreaterThan(200); // Red
      expect(rightPixel[2]).toBeLessThan(50); // Not blue
    });

    it('SE-002: left-only has no blue pixels (right eye excluded)', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      // Check multiple pixels across the output
      for (let x = 0; x < result.width; x += 10) {
        const pixel = getPixel(result, x, 25);
        expect(pixel[2]).toBeLessThan(50); // No blue
      }
    });

    it('SE-003: left-only with eyeSwap shows right eye instead', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'left-only', eyeSwap: true, offset: 0 };
      const result = applyStereoMode(source, state);

      // With swap, "left" should now be the right eye (blue)
      const pixel = getPixel(result, 50, 25);
      expect(pixel[2]).toBeGreaterThan(200); // Blue
      expect(pixel[0]).toBeLessThan(50); // Not red
    });
  });

  describe('right-only mode', () => {
    it('SE-010: right-only displays only the right eye', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'right-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      // Output should be full size
      expect(result.width).toBe(100);
      expect(result.height).toBe(50);

      // All pixels should be blue (from right eye)
      const leftPixel = getPixel(result, 10, 25);
      expect(leftPixel[2]).toBeGreaterThan(200); // Blue
      expect(leftPixel[0]).toBeLessThan(50); // Not red

      const centerPixel = getPixel(result, 50, 25);
      expect(centerPixel[2]).toBeGreaterThan(200); // Blue
      expect(centerPixel[0]).toBeLessThan(50); // Not red

      const rightPixel = getPixel(result, 90, 25);
      expect(rightPixel[2]).toBeGreaterThan(200); // Blue
      expect(rightPixel[0]).toBeLessThan(50); // Not red
    });

    it('SE-011: right-only has no red pixels (left eye excluded)', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'right-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      for (let x = 0; x < result.width; x += 10) {
        const pixel = getPixel(result, x, 25);
        expect(pixel[0]).toBeLessThan(50); // No red
      }
    });

    it('SE-012: right-only with eyeSwap shows left eye instead', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'right-only', eyeSwap: true, offset: 0 };
      const result = applyStereoMode(source, state);

      // With swap, "right" should now be the left eye (red)
      const pixel = getPixel(result, 50, 25);
      expect(pixel[0]).toBeGreaterThan(200); // Red
      expect(pixel[2]).toBeLessThan(50); // Not blue
    });
  });

  describe('output dimensions', () => {
    it('SE-020: left-only output matches original dimensions', () => {
      const source = createStereoSource(200, 100);
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('SE-021: right-only output matches original dimensions', () => {
      const source = createStereoSource(200, 100);
      const state: StereoState = { mode: 'right-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      expect(result.width).toBe(200);
      expect(result.height).toBe(100);
    });

    it('SE-022: single-eye mode handles odd width source', () => {
      const source = createStereoSource(101, 50);
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      expect(result.width).toBe(101);
      expect(result.height).toBe(50);
      // All pixels should have alpha set (no uninitialized pixels)
      const lastCol = getPixel(result, 100, 25);
      expect(lastCol[3]).toBe(255);
    });
  });

  describe('over-under input format', () => {
    it('SE-030: left-only with over-under input shows top half', () => {
      // Top half GREEN, bottom half YELLOW
      const source = createTestImageData(100, 100, (_x, y) => {
        if (y < 50) return [0, 255, 0, 255]; // Top: green
        return [255, 255, 0, 255]; // Bottom: yellow
      });
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state, 'over-under');

      // Should show green (top half = left eye)
      const pixel = getPixel(result, 50, 50);
      expect(pixel[1]).toBeGreaterThan(200); // Green
      expect(pixel[0]).toBeLessThan(50); // Not red
    });

    it('SE-031: right-only with over-under input shows bottom half', () => {
      const source = createTestImageData(100, 100, (_x, y) => {
        if (y < 50) return [0, 255, 0, 255]; // Top: green
        return [255, 255, 0, 255]; // Bottom: yellow
      });
      const state: StereoState = { mode: 'right-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state, 'over-under');

      // Should show yellow (bottom half = right eye)
      const pixel = getPixel(result, 50, 50);
      expect(pixel[0]).toBeGreaterThan(200); // Red component of yellow
      expect(pixel[1]).toBeGreaterThan(200); // Green component of yellow
    });
  });

  describe('with eye transforms', () => {
    it('SE-040: left-only works with applyStereoModeWithEyeTransforms', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoModeWithEyeTransforms(source, state);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);

      const pixel = getPixel(result, 50, 25);
      expect(pixel[0]).toBeGreaterThan(200); // Red (left eye)
    });

    it('SE-041: right-only works with applyStereoModeWithEyeTransforms', () => {
      const source = createStereoSource();
      const state: StereoState = { mode: 'right-only', eyeSwap: false, offset: 0 };
      const result = applyStereoModeWithEyeTransforms(source, state);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);

      const pixel = getPixel(result, 50, 25);
      expect(pixel[2]).toBeGreaterThan(200); // Blue (right eye)
    });
  });

  describe('offset with single-eye modes', () => {
    it('SE-050: offset is applied to right eye in right-only mode', () => {
      // Right half has distinct pattern: first 5 columns white, rest black
      const source = createTestImageData(100, 10, (x) => {
        if (x < 50) return [128, 128, 128, 255]; // Left: gray
        if (x >= 50 && x < 55) return [255, 255, 255, 255]; // Right starts with white
        return [0, 0, 0, 255]; // Right rest is black
      });

      const stateNoOffset: StereoState = { mode: 'right-only', eyeSwap: false, offset: 0 };
      const stateWithOffset: StereoState = { mode: 'right-only', eyeSwap: false, offset: 10 };

      const resultNoOffset = applyStereoMode(source, stateNoOffset);
      const resultWithOffset = applyStereoMode(source, stateWithOffset);

      // Results should differ due to offset
      const p1 = getPixel(resultNoOffset, 2, 5);
      const p2 = getPixel(resultWithOffset, 2, 5);
      expect(p1[0]).not.toBe(p2[0]);
    });

    it('SE-051: offset does not affect left eye in left-only mode', () => {
      const source = createStereoSource();
      const stateNoOffset: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const stateWithOffset: StereoState = { mode: 'left-only', eyeSwap: false, offset: 10 };

      const resultNoOffset = applyStereoMode(source, stateNoOffset);
      const resultWithOffset = applyStereoMode(source, stateWithOffset);

      // Left eye should be the same regardless of offset
      const p1 = getPixel(resultNoOffset, 25, 25);
      const p2 = getPixel(resultWithOffset, 25, 25);
      expect(p1[0]).toBe(p2[0]);
      expect(p1[1]).toBe(p2[1]);
      expect(p1[2]).toBe(p2[2]);
    });
  });

  describe('utility functions with new modes', () => {
    it('SE-060: getStereoModeLabel returns correct labels for new modes', () => {
      expect(getStereoModeLabel('left-only')).toBe('Left Only');
      expect(getStereoModeLabel('right-only')).toBe('Right Only');
    });

    it('SE-061: getStereoModeShortLabel returns correct short labels', () => {
      expect(getStereoModeShortLabel('left-only')).toBe('L');
      expect(getStereoModeShortLabel('right-only')).toBe('R');
    });

    it('SE-062: isDefaultStereoState returns false for left-only', () => {
      expect(isDefaultStereoState({ mode: 'left-only', eyeSwap: false, offset: 0 })).toBe(false);
    });

    it('SE-063: isDefaultStereoState returns false for right-only', () => {
      expect(isDefaultStereoState({ mode: 'right-only', eyeSwap: false, offset: 0 })).toBe(false);
    });
  });
});
