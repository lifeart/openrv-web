/**
 * LUT Utility Function Tests
 */

import { describe, it, expect } from 'vitest';
import {
  reorderRFastestToBFastest,
  normalizeIntegers,
  sanitizeLUTMatrix,
  applyColorMatrix,
  isIdentityMatrix,
  IDENTITY_MATRIX_4X4,
} from './LUTUtils';

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

  describe('LUT Matrix Utilities', () => {
    // LUT-MAT-001: Identity inMatrix -> output unchanged
    it('LUT-MAT-001: identity matrix does not change color via applyColorMatrix', () => {
      const identity = IDENTITY_MATRIX_4X4;
      const [r, g, b] = applyColorMatrix(0.5, 0.3, 0.8, identity);
      expect(r).toBeCloseTo(0.5);
      expect(g).toBeCloseTo(0.3);
      expect(b).toBeCloseTo(0.8);
    });

    // LUT-MAT-002: Scale matrix [2,0,0,0; 0,2,0,0; 0,0,2,0; 0,0,0,1] -> input doubled
    it('LUT-MAT-002: scale matrix doubles input color via applyColorMatrix', () => {
      const scale2x = new Float32Array([
        2, 0, 0, 0,
        0, 2, 0, 0,
        0, 0, 2, 0,
        0, 0, 0, 1,
      ]);
      const [r, g, b] = applyColorMatrix(0.25, 0.3, 0.4, scale2x);
      expect(r).toBeCloseTo(0.5);
      expect(g).toBeCloseTo(0.6);
      expect(b).toBeCloseTo(0.8);
    });

    // LUT-MAT-003: Offset matrix (translation in 4th row) adds offset
    it('LUT-MAT-003: offset matrix adds offset via 4th row', () => {
      // Row-major: 4th row [0.1, 0.2, 0.3, 1] provides translation
      const offsetMatrix = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0.1, 0.2, 0.3, 1,
      ]);
      const [r, g, b] = applyColorMatrix(0.0, 0.0, 0.0, offsetMatrix);
      expect(r).toBeCloseTo(0.1);
      expect(g).toBeCloseTo(0.2);
      expect(b).toBeCloseTo(0.3);
    });

    // LUT-MAT-004: Identity outMatrix -> output unchanged after transform
    it('LUT-MAT-004: sanitizeLUTMatrix returns null for identity (optimization)', () => {
      const identity = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
      const result = sanitizeLUTMatrix(identity);
      expect(result).toBeNull(); // null means identity, skip matrix application
    });

    // LUT-MAT-005: Scale outMatrix -> output scaled
    it('LUT-MAT-005: sanitizeLUTMatrix preserves non-identity scale matrix', () => {
      const scaleMatrix = new Float32Array([
        0.5, 0, 0, 0,
        0, 0.5, 0, 0,
        0, 0, 0.5, 0,
        0, 0, 0, 1,
      ]);
      const result = sanitizeLUTMatrix(scaleMatrix);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(16);
      // Verify the scale values
      expect(result![0]).toBe(0.5);
      expect(result![5]).toBe(0.5);
      expect(result![10]).toBe(0.5);
    });

    // LUT-MAT-006: Round-trip with inMatrix and inverse outMatrix
    it('LUT-MAT-006: scale then inverse scale produces original values', () => {
      const scale2x = new Float32Array([
        2, 0, 0, 0,
        0, 2, 0, 0,
        0, 0, 2, 0,
        0, 0, 0, 1,
      ]);
      const scale0_5x = new Float32Array([
        0.5, 0, 0, 0,
        0, 0.5, 0, 0,
        0, 0, 0.5, 0,
        0, 0, 0, 1,
      ]);

      // Apply inMatrix (scale 2x)
      const [r1, g1, b1] = applyColorMatrix(0.25, 0.3, 0.4, scale2x);
      // Apply outMatrix (scale 0.5x — inverse)
      const [r2, g2, b2] = applyColorMatrix(r1, g1, b1, scale0_5x);

      expect(r2).toBeCloseTo(0.25);
      expect(g2).toBeCloseTo(0.3);
      expect(b2).toBeCloseTo(0.4);
    });

    // LUT-MAT-007: NaN matrix entries handled gracefully (sanitized to identity)
    it('LUT-MAT-007: NaN entries cause sanitizeLUTMatrix to return identity', () => {
      const nanMatrix = new Float32Array([
        NaN, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
      const result = sanitizeLUTMatrix(nanMatrix);
      // Should be sanitized to identity, which means returns a copy of identity
      expect(result).not.toBeNull();
      expect(isIdentityMatrix(result!)).toBe(true);
    });

    it('LUT-MAT-007b: Infinity entries cause sanitizeLUTMatrix to return identity', () => {
      const infMatrix = new Float32Array([
        1, 0, 0, 0,
        0, Infinity, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
      const result = sanitizeLUTMatrix(infMatrix);
      expect(result).not.toBeNull();
      expect(isIdentityMatrix(result!)).toBe(true);
    });

    // LUT-MAT-008: Row-major GTO array correctly transposed
    it('LUT-MAT-008: row-major flat array from GTO is correctly parsed', () => {
      // GTO stores row-major: [m00, m01, m02, m03, m10, m11, m12, m13, ...]
      // A scale matrix [2,0,0,0, 0,3,0,0, 0,0,4,0, 0,0,0,1]
      const gtoArray = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1];
      const sanitized = sanitizeLUTMatrix(gtoArray);
      expect(sanitized).not.toBeNull();
      expect(sanitized!.length).toBe(16);

      // When used with applyColorMatrix (which expects row-major),
      // the color should be scaled correctly
      const [r, g, b] = applyColorMatrix(1, 1, 1, sanitized!);
      expect(r).toBeCloseTo(2);
      expect(g).toBeCloseTo(3);
      expect(b).toBeCloseTo(4);
    });

    it('LUT-MAT-008b: nested array from GTO is correctly flattened', () => {
      // GTO may provide as nested array [[1,0,0,0],[0,2,0,0],[0,0,3,0],[0,0,0,1]]
      const nested = [[1, 0, 0, 0], [0, 2, 0, 0], [0, 0, 3, 0], [0, 0, 0, 1]];
      const sanitized = sanitizeLUTMatrix(nested);
      expect(sanitized).not.toBeNull();

      const [r, g, b] = applyColorMatrix(0.5, 0.5, 0.5, sanitized!);
      expect(r).toBeCloseTo(0.5);
      expect(g).toBeCloseTo(1.0);
      expect(b).toBeCloseTo(1.5);
    });

    it('sanitizeLUTMatrix returns null for null input', () => {
      expect(sanitizeLUTMatrix(null)).toBeNull();
    });

    it('sanitizeLUTMatrix returns null for undefined input', () => {
      expect(sanitizeLUTMatrix(undefined)).toBeNull();
    });

    it('sanitizeLUTMatrix returns null for wrong-length array', () => {
      expect(sanitizeLUTMatrix([1, 2, 3])).toBeNull();
      expect(sanitizeLUTMatrix(new Float32Array(9))).toBeNull();
    });

    it('isIdentityMatrix correctly identifies identity', () => {
      expect(isIdentityMatrix(IDENTITY_MATRIX_4X4)).toBe(true);
      const nonIdentity = new Float32Array(16);
      nonIdentity[0] = 2;
      expect(isIdentityMatrix(nonIdentity)).toBe(false);
    });

    it('applyColorMatrix correctly handles off-diagonal elements', () => {
      // Channel swap matrix: R->G, G->B, B->R
      const swapMatrix = new Float32Array([
        0, 1, 0, 0,  // row0: r maps to g
        0, 0, 1, 0,  // row1: g maps to b
        1, 0, 0, 0,  // row2: b maps to r
        0, 0, 0, 1,
      ]);
      const [r, g, b] = applyColorMatrix(1, 0, 0, swapMatrix);
      expect(r).toBeCloseTo(0); // r*0 + g*0 + b*1 + 0 = 0
      expect(g).toBeCloseTo(1); // r*1 + g*0 + b*0 + 0 = 1
      expect(b).toBeCloseTo(0); // r*0 + g*1 + b*0 + 0 = 0
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
