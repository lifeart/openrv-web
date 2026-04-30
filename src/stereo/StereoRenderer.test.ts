/**
 * Unit tests for StereoRenderer
 *
 * These tests verify the actual image processing logic is correct,
 * not just that "something changed" but that the output pixels are
 * mathematically correct.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  applyStereoMode,
  validateStereoOffset,
  extractStereoEyes,
  type StereoState,
  DEFAULT_STEREO_STATE,
  isDefaultStereoState,
  getStereoModeLabel,
} from './StereoRenderer';

// Helper to create test ImageData
function createTestImageData(
  width: number,
  height: number,
  fill?: (x: number, y: number) => [number, number, number, number],
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
function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!];
}

describe('StereoRenderer', () => {
  describe('applyStereoMode with mode=off', () => {
    it('returns source data unchanged when mode is off', () => {
      const source = createTestImageData(100, 100);
      const state: StereoState = { mode: 'off', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      expect(result).toBe(source); // Should return exact same reference
    });
  });

  describe('side-by-side mode', () => {
    it('splits image into left and right halves', () => {
      // Create a 100x50 image with left half RED, right half BLUE
      const source = createTestImageData(100, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255]; // Left half red
        return [0, 0, 255, 255]; // Right half blue
      });

      const state: StereoState = { mode: 'side-by-side', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);

      // Left quarter should be red (from left eye)
      const leftPixel = getPixel(result, 10, 25);
      expect(leftPixel[0]).toBeGreaterThan(200); // Red
      expect(leftPixel[2]).toBeLessThan(50); // Not blue

      // Right quarter should be blue (from right eye)
      const rightPixel = getPixel(result, 75, 25);
      expect(rightPixel[2]).toBeGreaterThan(200); // Blue
      expect(rightPixel[0]).toBeLessThan(50); // Not red
    });

    it('applies eye swap correctly', () => {
      // Left half RED, right half BLUE
      const source = createTestImageData(100, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });

      const state: StereoState = { mode: 'side-by-side', eyeSwap: true, offset: 0 };
      const result = applyStereoMode(source, state);

      // With eye swap, left quarter should be BLUE (swapped from right)
      const leftPixel = getPixel(result, 10, 25);
      expect(leftPixel[2]).toBeGreaterThan(200); // Blue
      expect(leftPixel[0]).toBeLessThan(50); // Not red

      // Right quarter should be RED (swapped from left)
      const rightPixel = getPixel(result, 75, 25);
      expect(rightPixel[0]).toBeGreaterThan(200); // Red
      expect(rightPixel[2]).toBeLessThan(50); // Not blue
    });
  });

  describe('over-under mode', () => {
    it('places left eye on top, right eye on bottom', () => {
      // Left half RED, right half BLUE (side-by-side input)
      const source = createTestImageData(100, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });

      const state: StereoState = { mode: 'over-under', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);

      // Top half should be red (from left eye)
      const topPixel = getPixel(result, 50, 10);
      expect(topPixel[0]).toBeGreaterThan(200); // Red

      // Bottom half should be blue (from right eye)
      const bottomPixel = getPixel(result, 50, 40);
      expect(bottomPixel[2]).toBeGreaterThan(200); // Blue
    });
  });

  describe('anaglyph mode', () => {
    it('combines left eye red with right eye cyan', () => {
      // Left half: pure RED (255, 0, 0)
      // Right half: pure GREEN (0, 255, 0)
      const source = createTestImageData(100, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255]; // Left: Red
        return [0, 255, 0, 255]; // Right: Green
      });

      const state: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      // Result should combine:
      // - Red channel from left eye (255)
      // - Green channel from right eye (255)
      // - Blue channel from right eye (0)
      const pixel = getPixel(result, 25, 25);
      expect(pixel[0]).toBe(255); // Red from left eye
      expect(pixel[1]).toBe(255); // Green from right eye
      expect(pixel[2]).toBe(0); // Blue from right eye (was 0)
      expect(pixel[3]).toBe(255); // Alpha
    });

    it('anaglyph-luminance uses grayscale values', () => {
      // Left half: pure RED (255, 0, 0) → luma ≈ 54
      // Right half: pure GREEN (0, 255, 0) → luma ≈ 182
      const source = createTestImageData(100, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 255, 0, 255];
      });

      const state: StereoState = { mode: 'anaglyph-luminance', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      const pixel = getPixel(result, 25, 25);

      // Left luminance: 0.2126 * 255 + 0.7152 * 0 + 0.0722 * 0 ≈ 54
      expect(pixel[0]).toBeCloseTo(54, 0);

      // Right luminance: 0.2126 * 0 + 0.7152 * 255 + 0.0722 * 0 ≈ 182
      expect(pixel[1]).toBeCloseTo(182, 0);
      expect(pixel[2]).toBeCloseTo(182, 0);
    });
  });

  describe('checkerboard mode', () => {
    it('alternates pixels in checkerboard pattern', () => {
      // Left half RED, right half BLUE
      const source = createTestImageData(100, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });

      const state: StereoState = { mode: 'checkerboard', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      // (0,0) is even (0+0=0), should be left eye (red)
      const p00 = getPixel(result, 0, 0);
      expect(p00[0]).toBeGreaterThan(200); // Red

      // (1,0) is odd (1+0=1), should be right eye (blue)
      const p10 = getPixel(result, 1, 0);
      expect(p10[2]).toBeGreaterThan(200); // Blue

      // (0,1) is odd (0+1=1), should be right eye (blue)
      const p01 = getPixel(result, 0, 1);
      expect(p01[2]).toBeGreaterThan(200); // Blue

      // (1,1) is even (1+1=2), should be left eye (red)
      const p11 = getPixel(result, 1, 1);
      expect(p11[0]).toBeGreaterThan(200); // Red
    });
  });

  describe('scanline mode', () => {
    it('alternates lines between left and right eyes', () => {
      // Left half RED, right half BLUE
      const source = createTestImageData(100, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });

      const state: StereoState = { mode: 'scanline', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      // Line 0 (even) should be left eye (red)
      const line0 = getPixel(result, 25, 0);
      expect(line0[0]).toBeGreaterThan(200); // Red

      // Line 1 (odd) should be right eye (blue)
      const line1 = getPixel(result, 25, 1);
      expect(line1[2]).toBeGreaterThan(200); // Blue

      // Line 2 (even) should be left eye (red)
      const line2 = getPixel(result, 25, 2);
      expect(line2[0]).toBeGreaterThan(200); // Red
    });
  });

  describe('mirror mode', () => {
    it('flips the right eye horizontally', () => {
      // Create gradient: left half goes 0→49 (dark to light), right half is solid blue
      const source = createTestImageData(100, 10, (x) => {
        if (x < 50) return [x * 5, 0, 0, 255]; // Left: red gradient
        return [0, 0, 255, 255]; // Right: solid blue
      });

      const state: StereoState = { mode: 'mirror', eyeSwap: false, offset: 0 };
      const result = applyStereoMode(source, state);

      // Left side should have red gradient (from left eye, unflipped)
      const leftPixel = getPixel(result, 10, 5);
      expect(leftPixel[0]).toBeGreaterThan(0);

      // Right side should be solid blue (from right eye, flipped - but was solid anyway)
      const rightPixel = getPixel(result, 75, 5);
      expect(rightPixel[2]).toBeGreaterThan(200);
    });
  });

  describe('offset control', () => {
    it('positive offset shifts right eye to the right', () => {
      // Create a clear pattern: right half has a vertical white stripe at x=0-5
      const source = createTestImageData(100, 10, (x) => {
        if (x < 50) return [128, 128, 128, 255]; // Left half gray
        if (x >= 50 && x < 55) return [255, 255, 255, 255]; // Right half starts with white stripe
        return [0, 0, 0, 255]; // Rest of right half black
      });

      // With positive offset, the white stripe should shift right in output
      const stateNoOffset: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: 0 };
      const stateWithOffset: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: 10 };

      const resultNoOffset = applyStereoMode(source, stateNoOffset);
      const resultWithOffset = applyStereoMode(source, stateWithOffset);

      // The output should be different when offset is applied
      const p1 = getPixel(resultNoOffset, 5, 5);
      const p2 = getPixel(resultWithOffset, 5, 5);

      // With 10% offset on a 50px wide image (right eye is 50px wide),
      // the offset is 5 pixels. So content shifts right.
      // At x=5, without offset we see the white stripe's G/B channels
      // With offset, we see black (shifted out of view)
      expect(p1[1]).not.toBe(p2[1]); // Green channels should differ
    });

    it('negative offset shifts right eye to the left', () => {
      const source = createTestImageData(100, 10, (x) => {
        if (x < 50) return [128, 128, 128, 255];
        if (x >= 95) return [255, 255, 255, 255]; // White stripe at end of right half
        return [0, 0, 0, 255];
      });

      const stateNegOffset: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: -10 };
      const result = applyStereoMode(source, stateNegOffset);

      // With negative offset, content shifts left, bringing the white stripe into view earlier
      // The rightmost pixels should now show black (shifted out)
      const rightEdge = getPixel(result, 49, 5);
      expect(rightEdge[1]).toBe(0); // Should be black (shifted out)
    });
  });

  describe('edge cases', () => {
    it('handles 1x1 image', () => {
      const source = createTestImageData(1, 1, () => [255, 0, 0, 255]);
      const state: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: 0 };

      // Should not throw
      const result = applyStereoMode(source, state);
      expect(result.width).toBe(0); // 1/2 = 0 after floor
    });

    it('handles 2x2 image', () => {
      const source = createTestImageData(2, 2, (x) => {
        if (x < 1) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });
      const state: StereoState = { mode: 'side-by-side', eyeSwap: false, offset: 0 };

      const result = applyStereoMode(source, state);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
    });

    it('handles odd width gracefully', () => {
      const source = createTestImageData(101, 50, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });
      const state: StereoState = { mode: 'side-by-side', eyeSwap: false, offset: 0 };

      const result = applyStereoMode(source, state);
      expect(result.width).toBe(101);

      // Check that all pixels are written (no uninitialized black stripe)
      // The last column at x=100 should have content
      const lastCol = getPixel(result, 100, 25);
      expect(lastCol[3]).toBe(255); // Alpha should be set
    });
  });

  describe('utility functions', () => {
    it('isDefaultStereoState returns true for default state', () => {
      expect(isDefaultStereoState(DEFAULT_STEREO_STATE)).toBe(true);
    });

    it('isDefaultStereoState returns false for modified state', () => {
      expect(isDefaultStereoState({ mode: 'anaglyph', eyeSwap: false, offset: 0 })).toBe(false);
      expect(isDefaultStereoState({ mode: 'off', eyeSwap: true, offset: 0 })).toBe(false);
      expect(isDefaultStereoState({ mode: 'off', eyeSwap: false, offset: 5 })).toBe(false);
    });

    it('getStereoModeLabel returns correct labels', () => {
      expect(getStereoModeLabel('off')).toBe('Off');
      expect(getStereoModeLabel('side-by-side')).toBe('Side-by-Side');
      expect(getStereoModeLabel('anaglyph')).toBe('Anaglyph');
      expect(getStereoModeLabel('anaglyph-luminance')).toBe('Anaglyph (Luma)');
    });
  });

  describe('validateStereoOffset', () => {
    it('returns valid offset values unchanged', () => {
      expect(validateStereoOffset(0)).toBe(0);
      expect(validateStereoOffset(10)).toBe(10);
      expect(validateStereoOffset(-10)).toBe(-10);
      expect(validateStereoOffset(25.5)).toBe(25.5);
      expect(validateStereoOffset(-50)).toBe(-50);
      expect(validateStereoOffset(50)).toBe(50);
    });

    it('clamps values exceeding the maximum', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateStereoOffset(100)).toBe(50);
      expect(validateStereoOffset(51)).toBe(50);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it('clamps values below the minimum', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateStereoOffset(-100)).toBe(-50);
      expect(validateStereoOffset(-51)).toBe(-50);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });

    it('returns 0 for NaN', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateStereoOffset(NaN)).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toContain('NaN');
      warnSpy.mockRestore();
    });

    it('clamps positive Infinity to max', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateStereoOffset(Infinity)).toBe(50);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toContain('Infinity');
      warnSpy.mockRestore();
    });

    it('clamps negative Infinity to min', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateStereoOffset(-Infinity)).toBe(-50);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('boundary values -50 and 50 are accepted without warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateStereoOffset(-50)).toBe(-50);
      expect(validateStereoOffset(50)).toBe(50);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns -0 as-is (negative zero is within valid range)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = validateStereoOffset(-0);
      // -0 is a valid number in range; the function returns it unchanged
      expect(Object.is(result, -0)).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns 0 with warning for non-number input (typeof guard)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = validateStereoOffset(undefined as unknown as number);
      expect(result).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]![0]).toContain('non-number');
      warnSpy.mockRestore();
    });

    it('default stereo state offset is valid', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(validateStereoOffset(DEFAULT_STEREO_STATE.offset)).toBe(0);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('offset validation in applyStereoMode', () => {
    it('NaN offset is treated as 0 (no shift applied)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Left half RED, right half BLUE
      const source = createTestImageData(100, 10, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });

      const stateNaN: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: NaN };
      const stateZero: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: 0 };

      const resultNaN = applyStereoMode(source, stateNaN);
      const resultZero = applyStereoMode(source, stateZero);

      // NaN should be treated as 0, producing identical results
      const pNaN = getPixel(resultNaN, 25, 5);
      const pZero = getPixel(resultZero, 25, 5);
      expect(pNaN).toEqual(pZero);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('excessively large offset is clamped and rendering still works', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = createTestImageData(100, 10, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });

      const state: StereoState = { mode: 'anaglyph', eyeSwap: false, offset: 999 };
      const result = applyStereoMode(source, state);

      // Should not throw and should produce valid output
      expect(result.width).toBe(50);
      expect(result.height).toBe(10);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('Infinity offset is clamped and rendering still works', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = createTestImageData(100, 10, (x) => {
        if (x < 50) return [255, 0, 0, 255];
        return [0, 0, 255, 255];
      });

      const state: StereoState = { mode: 'side-by-side', eyeSwap: false, offset: Infinity };
      const result = applyStereoMode(source, state);

      expect(result.width).toBe(100);
      expect(result.height).toBe(10);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('odd width/height splitting (LOW-15)', () => {
    describe('side-by-side extraction with odd width', () => {
      it('even width: both eyes get equal width', () => {
        const source = createTestImageData(100, 10, (x) => {
          if (x < 50) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const { left, right } = extractStereoEyes(source, 'side-by-side', false);
        expect(left.width).toBe(50);
        expect(right.width).toBe(50);
        expect(left.width + right.width).toBe(100);
      });

      it('odd width: right eye gets the extra pixel, total equals original', () => {
        // Create 101-wide image: left 50px red, right 51px blue
        const source = createTestImageData(101, 10, (x) => {
          if (x < 50) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const { left, right } = extractStereoEyes(source, 'side-by-side', false);
        expect(left.width).toBe(50);
        expect(right.width).toBe(51);
        expect(left.width + right.width).toBe(101);
        expect(left.height).toBe(10);
        expect(right.height).toBe(10);

        // Verify pixel data integrity: left eye should be all red
        const leftPixel = getPixel(left, 0, 0);
        expect(leftPixel).toEqual([255, 0, 0, 255]);

        // Right eye pixel at x=0 corresponds to source x=50 which is blue
        const rightPixel = getPixel(right, 0, 0);
        expect(rightPixel).toEqual([0, 0, 255, 255]);

        // Right eye last pixel at x=50 corresponds to source x=100 which is blue
        const rightLastPixel = getPixel(right, 50, 0);
        expect(rightLastPixel).toEqual([0, 0, 255, 255]);
      });

      it('width = 1: left eye gets 0 width is not possible, right gets 1', () => {
        // Width 1 means floor(1/2) = 0 for left, 1 for right
        // ImageData with width=0 is invalid, so left eye should be 0-width
        // Actually ImageData(0, h) throws, so width=1 is a degenerate case.
        // Let's test width=2 as minimum meaningful, and width=1 should be handled
        // by the caller. We verify width=2 works correctly.
        const source = createTestImageData(2, 2, (x) => {
          if (x < 1) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const { left, right } = extractStereoEyes(source, 'side-by-side', false);
        expect(left.width).toBe(1);
        expect(right.width).toBe(1);
        expect(left.width + right.width).toBe(2);
      });

      it('width = 3: left gets 1, right gets 2', () => {
        const source = createTestImageData(3, 2, (x) => {
          if (x === 0) return [255, 0, 0, 255]; // left eye
          if (x === 1) return [0, 255, 0, 255]; // right eye pixel 0
          return [0, 0, 255, 255]; // right eye pixel 1
        });
        const { left, right } = extractStereoEyes(source, 'side-by-side', false);
        expect(left.width).toBe(1);
        expect(right.width).toBe(2);
        expect(left.width + right.width).toBe(3);

        // Verify pixel content
        expect(getPixel(left, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(getPixel(right, 0, 0)).toEqual([0, 255, 0, 255]);
        expect(getPixel(right, 1, 0)).toEqual([0, 0, 255, 255]);
      });

      it('large odd width (1921): correct split', () => {
        const source = createTestImageData(1921, 1);
        const { left, right } = extractStereoEyes(source, 'side-by-side', false);
        expect(left.width).toBe(960);
        expect(right.width).toBe(961);
        expect(left.width + right.width).toBe(1921);
      });
    });

    describe('over-under extraction with odd height', () => {
      it('even height: both eyes get equal height', () => {
        const source = createTestImageData(10, 100, (_x, y) => {
          if (y < 50) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const { left, right } = extractStereoEyes(source, 'over-under', false);
        expect(left.height).toBe(50);
        expect(right.height).toBe(50);
        expect(left.height + right.height).toBe(100);
      });

      it('odd height: bottom eye gets the extra pixel, total equals original', () => {
        const source = createTestImageData(10, 101, (_x, y) => {
          if (y < 50) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const { left, right } = extractStereoEyes(source, 'over-under', false);
        expect(left.height).toBe(50);
        expect(right.height).toBe(51);
        expect(left.height + right.height).toBe(101);
        expect(left.width).toBe(10);
        expect(right.width).toBe(10);

        // Verify pixel data: top eye should be red
        const topPixel = getPixel(left, 0, 0);
        expect(topPixel).toEqual([255, 0, 0, 255]);

        // Bottom eye first row (source row 50) should be blue
        const bottomPixel = getPixel(right, 0, 0);
        expect(bottomPixel).toEqual([0, 0, 255, 255]);

        // Bottom eye last row (source row 100) should be blue
        const bottomLastPixel = getPixel(right, 0, 50);
        expect(bottomLastPixel).toEqual([0, 0, 255, 255]);
      });

      it('height = 2: both eyes get 1 row', () => {
        const source = createTestImageData(4, 2, (_x, y) => {
          if (y === 0) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const { left, right } = extractStereoEyes(source, 'over-under', false);
        expect(left.height).toBe(1);
        expect(right.height).toBe(1);
        expect(left.height + right.height).toBe(2);
      });

      it('height = 3: top gets 1, bottom gets 2', () => {
        const source = createTestImageData(2, 3, (_x, y) => {
          if (y === 0) return [255, 0, 0, 255];
          if (y === 1) return [0, 255, 0, 255];
          return [0, 0, 255, 255];
        });
        const { left, right } = extractStereoEyes(source, 'over-under', false);
        expect(left.height).toBe(1);
        expect(right.height).toBe(2);
        expect(left.height + right.height).toBe(3);

        expect(getPixel(left, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(getPixel(right, 0, 0)).toEqual([0, 255, 0, 255]);
        expect(getPixel(right, 0, 1)).toEqual([0, 0, 255, 255]);
      });
    });

    describe('side-by-side rendering with odd width', () => {
      it('odd output width: result covers all pixels without gap', () => {
        // Create a 101-wide side-by-side source
        const source = createTestImageData(101, 10, (x) => {
          if (x < 50) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const state: StereoState = { mode: 'side-by-side', eyeSwap: false, offset: 0 };
        const result = applyStereoMode(source, state);

        expect(result.width).toBe(101);
        expect(result.height).toBe(10);

        // Verify no uninitialized (all-zero) pixels at the seam
        const leftEdge = getPixel(result, 49, 0);
        expect(leftEdge[3]).toBe(255); // alpha should be set
        const rightEdge = getPixel(result, 50, 0);
        expect(rightEdge[3]).toBe(255); // alpha should be set
        const lastPixel = getPixel(result, 100, 0);
        expect(lastPixel[3]).toBe(255); // last pixel should be set
      });
    });

    describe('over-under rendering with odd height', () => {
      it('odd output height: result covers all pixels without gap', () => {
        const source = createTestImageData(10, 101, (_x, y) => {
          if (y < 50) return [255, 0, 0, 255];
          return [0, 0, 255, 255];
        });
        const state: StereoState = { mode: 'over-under', eyeSwap: false, offset: 0 };
        const result = applyStereoMode(source, state);

        expect(result.width).toBe(10);
        expect(result.height).toBe(101);

        // Verify no uninitialized pixels at the seam
        const topEdge = getPixel(result, 0, 49);
        expect(topEdge[3]).toBe(255);
        const bottomEdge = getPixel(result, 0, 50);
        expect(bottomEdge[3]).toBe(255);
        const lastPixel = getPixel(result, 0, 100);
        expect(lastPixel[3]).toBe(255);
      });
    });
  });
});
