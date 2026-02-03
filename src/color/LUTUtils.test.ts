/**
 * LUT Utility Function Tests
 */

import { describe, it, expect } from 'vitest';
import { reorderRFastestToBFastest, normalizeIntegers } from './LUTUtils';

describe('LUTUtils', () => {
  describe('reorderRFastestToBFastest', () => {
    it('LUTU-001: correctly transposes size-2 cube', () => {
      // R-fastest order: iterate b, g, r
      // [r=0,g=0,b=0], [r=1,g=0,b=0], [r=0,g=1,b=0], [r=1,g=1,b=0],
      // [r=0,g=0,b=1], [r=1,g=0,b=1], [r=0,g=1,b=1], [r=1,g=1,b=1]
      const input = new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, // b=0
        0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, // b=1
      ]);

      const result = reorderRFastestToBFastest(input, 2);

      // B-fastest order: iterate r, g, b
      // [r=0,g=0,b=0], [r=0,g=0,b=1], [r=0,g=1,b=0], [r=0,g=1,b=1],
      // [r=1,g=0,b=0], [r=1,g=0,b=1], [r=1,g=1,b=0], [r=1,g=1,b=1]
      expect(Array.from(result)).toEqual([
        0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1,
        1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1,
      ]);
    });

    it('LUTU-002: correctly transposes size-4 cube', () => {
      const size = 4;
      const count = size * size * size;
      // Create R-fastest data where each entry stores its (r,g,b) coordinates
      const input = new Float32Array(count * 3);
      for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
          for (let r = 0; r < size; r++) {
            const srcIdx = (b * size * size + g * size + r) * 3;
            input[srcIdx] = r / (size - 1);
            input[srcIdx + 1] = g / (size - 1);
            input[srcIdx + 2] = b / (size - 1);
          }
        }
      }

      const result = reorderRFastestToBFastest(input, size);

      // Verify B-fastest order: for each (r, g, b), the entry at
      // index (r * size^2 + g * size + b) should have value (r, g, b)
      for (let r = 0; r < size; r++) {
        for (let g = 0; g < size; g++) {
          for (let b = 0; b < size; b++) {
            const dstIdx = (r * size * size + g * size + b) * 3;
            expect(result[dstIdx]).toBeCloseTo(r / (size - 1));
            expect(result[dstIdx + 1]).toBeCloseTo(g / (size - 1));
            expect(result[dstIdx + 2]).toBeCloseTo(b / (size - 1));
          }
        }
      }
    });

    it('LUTU-003: preserves identity LUT semantics', () => {
      const size = 3;
      // Create identity LUT in R-fastest order
      const input = new Float32Array(size * size * size * 3);
      for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
          for (let r = 0; r < size; r++) {
            const idx = (b * size * size + g * size + r) * 3;
            input[idx] = r / (size - 1);
            input[idx + 1] = g / (size - 1);
            input[idx + 2] = b / (size - 1);
          }
        }
      }

      const result = reorderRFastestToBFastest(input, size);

      // In B-fastest order, entry at (r,g,b) should still map to (r/(N-1), g/(N-1), b/(N-1))
      for (let r = 0; r < size; r++) {
        for (let g = 0; g < size; g++) {
          for (let b = 0; b < size; b++) {
            const idx = (r * size * size + g * size + b) * 3;
            expect(result[idx]).toBeCloseTo(r / (size - 1));
            expect(result[idx + 1]).toBeCloseTo(g / (size - 1));
            expect(result[idx + 2]).toBeCloseTo(b / (size - 1));
          }
        }
      }
    });

    it('LUTU-004: reordering is deterministic', () => {
      const original = new Float32Array([
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
        0.7, 0.8, 0.9, 1.0, 0.0, 0.1,
        0.2, 0.3, 0.4, 0.5, 0.6, 0.7,
        0.8, 0.9, 1.0, 0.0, 0.1, 0.2,
      ]);

      const reordered1 = reorderRFastestToBFastest(original, 2);
      const reordered2 = reorderRFastestToBFastest(original, 2);

      expect(Array.from(reordered1)).toEqual(Array.from(reordered2));
    });

    it('LUTU-005: handles size-1 (single entry, no-op)', () => {
      const input = new Float32Array([0.5, 0.6, 0.7]);
      const result = reorderRFastestToBFastest(input, 1);
      expect(result[0]).toBeCloseTo(0.5);
      expect(result[1]).toBeCloseTo(0.6);
      expect(result[2]).toBeCloseTo(0.7);
    });
  });

  describe('normalizeIntegers', () => {
    it('LUTU-006: converts 12-bit range to 0.0-1.0', () => {
      const input = new Float32Array([0, 2048, 4095]);
      const result = normalizeIntegers(input, 4095);

      expect(result[0]).toBeCloseTo(0.0);
      expect(result[1]).toBeCloseTo(0.5, 2);
      expect(result[2]).toBeCloseTo(1.0);
    });

    it('LUTU-007: converts 10-bit range to 0.0-1.0', () => {
      const input = new Float32Array([0, 512, 1023]);
      const result = normalizeIntegers(input, 1023);

      expect(result[0]).toBeCloseTo(0.0);
      expect(result[1]).toBeCloseTo(0.5, 2);
      expect(result[2]).toBeCloseTo(1.0);
    });

    it('LUTU-008: preserves 0 as 0.0 and max as 1.0', () => {
      const input = new Float32Array([0, 4095]);
      const result = normalizeIntegers(input, 4095);

      expect(result[0]).toBe(0);
      expect(result[1]).toBeCloseTo(1.0);
    });
  });
});
