/**
 * Stereo Input Format Integration Tests
 *
 * Tests that the stereo input format detection and rendering pipeline
 * correctly handles different stereo source formats (side-by-side,
 * over-under, separate/multi-view).
 */

import { describe, it, expect } from 'vitest';
import {
  applyStereoMode,
  applyStereoModeWithEyeTransforms,
  extractStereoEyes,
  type StereoState,
} from './StereoRenderer';
import type { StereoInputFormat } from '../core/types/stereo';

/**
 * Create a test ImageData with a simple pattern:
 * left half is red (255,0,0), right half is blue (0,0,255)
 */
function createSideBySideTestImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const halfWidth = Math.floor(width / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (x < halfWidth) {
        data[idx] = 255;     // R - left eye red
        data[idx + 1] = 0;
        data[idx + 2] = 0;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 255; // B - right eye blue
      }
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Create a test ImageData with a pattern for over-under:
 * top half is green (0,255,0), bottom half is yellow (255,255,0)
 */
function createOverUnderTestImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const halfHeight = Math.floor(height / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (y < halfHeight) {
        data[idx] = 0;
        data[idx + 1] = 255;  // G - left/top eye green
        data[idx + 2] = 0;
      } else {
        data[idx] = 255;
        data[idx + 1] = 255;  // Y - right/bottom eye yellow
        data[idx + 2] = 0;
      }
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Create a test ImageData filled uniformly (for 'separate' format testing)
 */
function createUniformTestImage(width: number, height: number, r: number, g: number, b: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

describe('Stereo Input Format', () => {
  // ===========================================================================
  // extractStereoEyes with different input formats
  // ===========================================================================
  describe('extractStereoEyes', () => {
    it('SIF-001: side-by-side extracts left and right halves', () => {
      const source = createSideBySideTestImage(100, 50);
      const { left, right } = extractStereoEyes(source, 'side-by-side', false);

      expect(left.width).toBe(50);
      expect(left.height).toBe(50);
      expect(right.width).toBe(50);
      expect(right.height).toBe(50);

      // Left should be all red
      expect(left.data[0]).toBe(255);
      expect(left.data[1]).toBe(0);
      expect(left.data[2]).toBe(0);

      // Right should be all blue
      expect(right.data[0]).toBe(0);
      expect(right.data[1]).toBe(0);
      expect(right.data[2]).toBe(255);
    });

    it('SIF-002: over-under extracts top and bottom halves', () => {
      const source = createOverUnderTestImage(50, 100);
      const { left, right } = extractStereoEyes(source, 'over-under', false);

      expect(left.width).toBe(50);
      expect(left.height).toBe(50);
      expect(right.width).toBe(50);
      expect(right.height).toBe(50);

      // Left (top) should be green
      expect(left.data[0]).toBe(0);
      expect(left.data[1]).toBe(255);
      expect(left.data[2]).toBe(0);

      // Right (bottom) should be yellow
      expect(right.data[0]).toBe(255);
      expect(right.data[1]).toBe(255);
      expect(right.data[2]).toBe(0);
    });

    it('SIF-003: separate format uses full source as both eyes', () => {
      const source = createUniformTestImage(50, 50, 128, 64, 32);
      const { left, right } = extractStereoEyes(source, 'separate', false);

      // Both eyes should have full dimensions
      expect(left.width).toBe(50);
      expect(left.height).toBe(50);
      expect(right.width).toBe(50);
      expect(right.height).toBe(50);

      // Both should be copies of the source
      expect(left.data[0]).toBe(128);
      expect(left.data[1]).toBe(64);
      expect(left.data[2]).toBe(32);
      expect(right.data[0]).toBe(128);
      expect(right.data[1]).toBe(64);
      expect(right.data[2]).toBe(32);
    });

    it('SIF-004: eye swap works with side-by-side', () => {
      const source = createSideBySideTestImage(100, 50);
      const { left, right } = extractStereoEyes(source, 'side-by-side', true);

      // Swapped: left should now be blue (originally right)
      expect(left.data[0]).toBe(0);
      expect(left.data[2]).toBe(255);
      // Right should now be red (originally left)
      expect(right.data[0]).toBe(255);
      expect(right.data[2]).toBe(0);
    });

    it('SIF-005: eye swap works with over-under', () => {
      const source = createOverUnderTestImage(50, 100);
      const { left, right } = extractStereoEyes(source, 'over-under', true);

      // Swapped: left should be yellow (originally bottom/right)
      expect(left.data[0]).toBe(255);
      expect(left.data[1]).toBe(255);
      // Right should be green (originally top/left)
      expect(right.data[0]).toBe(0);
      expect(right.data[1]).toBe(255);
    });

    it('SIF-006: eye swap works with separate format', () => {
      const source = createUniformTestImage(50, 50, 128, 64, 32);
      const { left, right } = extractStereoEyes(source, 'separate', true);

      // For separate format with identical content, swap just exchanges the refs
      expect(left.width).toBe(50);
      expect(right.width).toBe(50);
    });

    it('SIF-007: separate format uses rightEyeImageData when provided (#345)', () => {
      const leftSource = createUniformTestImage(50, 50, 255, 0, 0); // red
      const rightSource = createUniformTestImage(50, 50, 0, 0, 255); // blue

      const { left, right } = extractStereoEyes(leftSource, 'separate', false, rightSource);

      // Left should be red
      expect(left.data[0]).toBe(255);
      expect(left.data[1]).toBe(0);
      expect(left.data[2]).toBe(0);

      // Right should be blue (NOT a copy of left)
      expect(right.data[0]).toBe(0);
      expect(right.data[1]).toBe(0);
      expect(right.data[2]).toBe(255);
    });

    it('SIF-008: separate format with rightEyeImageData respects eye swap (#345)', () => {
      const leftSource = createUniformTestImage(50, 50, 255, 0, 0); // red
      const rightSource = createUniformTestImage(50, 50, 0, 0, 255); // blue

      const { left, right } = extractStereoEyes(leftSource, 'separate', true, rightSource);

      // After swap: left should be blue (originally right)
      expect(left.data[0]).toBe(0);
      expect(left.data[1]).toBe(0);
      expect(left.data[2]).toBe(255);

      // After swap: right should be red (originally left)
      expect(right.data[0]).toBe(255);
      expect(right.data[1]).toBe(0);
      expect(right.data[2]).toBe(0);
    });

    it('SIF-009: separate format without rightEyeImageData falls back to duplication', () => {
      const source = createUniformTestImage(50, 50, 128, 64, 32);

      const { left, right } = extractStereoEyes(source, 'separate', false);

      // Without rightEyeImageData, both eyes should be identical copies
      expect(left.data[0]).toBe(128);
      expect(right.data[0]).toBe(128);
      expect(left.data[1]).toBe(64);
      expect(right.data[1]).toBe(64);
    });

    it('SIF-010a: applyStereoMode with separate + rightEyeImageData produces different eyes (#345)', () => {
      const leftSource = createUniformTestImage(50, 50, 255, 0, 0); // red
      const rightSource = createUniformTestImage(50, 50, 0, 255, 0); // green

      // Use anaglyph mode - left eye goes to red channel, right eye to green+blue
      const state: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(leftSource, state, 'separate', rightSource);

      // Anaglyph: R from left (255), G from right (255), B from right (0)
      expect(result.data[0]).toBe(255); // red from left
      expect(result.data[1]).toBe(255); // green from right
      expect(result.data[2]).toBe(0);   // blue from right
    });
  });

  // ===========================================================================
  // applyStereoMode with different input formats
  // ===========================================================================
  describe('applyStereoMode with input format', () => {
    it('SIF-010: side-by-side input with left-only mode returns left eye', () => {
      const source = createSideBySideTestImage(100, 50);
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state, 'side-by-side');

      // Result should be the left eye (red) scaled to full dimensions
      expect(result.data[0]).toBe(255);
      expect(result.data[1]).toBe(0);
      expect(result.data[2]).toBe(0);
    });

    it('SIF-011: over-under input with left-only mode returns top eye', () => {
      const source = createOverUnderTestImage(50, 100);
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state, 'over-under');

      // Result should be the top (left) eye - green
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(255);
      expect(result.data[2]).toBe(0);
    });

    it('SIF-012: off mode returns source unchanged regardless of input format', () => {
      const source = createSideBySideTestImage(100, 50);
      const state: StereoState = { mode: 'off', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state, 'over-under');
      expect(result).toBe(source);
    });

    it('SIF-013: default input format parameter is side-by-side (backward compat)', () => {
      const source = createSideBySideTestImage(100, 50);
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };

      // Call without explicit input format - should default to side-by-side
      const result = applyStereoMode(source, state);
      expect(result.data[0]).toBe(255); // Red - left half
      expect(result.data[2]).toBe(0);
    });
  });

  // ===========================================================================
  // applyStereoModeWithEyeTransforms with input format
  // ===========================================================================
  describe('applyStereoModeWithEyeTransforms with input format', () => {
    it('SIF-020: passes input format through to eye extraction', () => {
      const source = createOverUnderTestImage(50, 100);
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };
      const result = applyStereoModeWithEyeTransforms(source, state, undefined, undefined, 'over-under');

      // Should extract top half (green) as left eye
      expect(result.data[0]).toBe(0);
      expect(result.data[1]).toBe(255);
      expect(result.data[2]).toBe(0);
    });

    it('SIF-021: default input format is side-by-side (backward compat)', () => {
      const source = createSideBySideTestImage(100, 50);
      const state: StereoState = { mode: 'left-only', eyeSwap: false, offset: 0 };

      // Call without explicit input format
      const result = applyStereoModeWithEyeTransforms(source, state);
      expect(result.data[0]).toBe(255); // Red - left half
      expect(result.data[2]).toBe(0);
    });
  });

  // ===========================================================================
  // StereoInputFormat type completeness
  // ===========================================================================
  describe('StereoInputFormat type', () => {
    it('SIF-030: all input formats are valid for extractStereoEyes', () => {
      const source = createSideBySideTestImage(100, 50);
      const formats: StereoInputFormat[] = ['side-by-side', 'over-under', 'separate'];

      for (const format of formats) {
        const result = extractStereoEyes(source, format, false);
        expect(result.left).toBeDefined();
        expect(result.right).toBeDefined();
        expect(result.left.width).toBeGreaterThan(0);
        expect(result.left.height).toBeGreaterThan(0);
      }
    });
  });
});
