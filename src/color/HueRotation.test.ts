import { describe, it, expect } from 'vitest';
import {
  buildHueRotationMatrix,
  applyHueRotation,
  isIdentityHueRotation,
} from './HueRotation';

const Wr = 0.2126;
const Wg = 0.7152;
const Wb = 0.0722;

function luminance(r: number, g: number, b: number): number {
  return Wr * r + Wg * g + Wb * b;
}

describe('HueRotation', () => {
  describe('buildHueRotationMatrix', () => {
    it('HRM-001: returns Float32Array of length 9', () => {
      const mat = buildHueRotationMatrix(0);
      expect(mat).toBeInstanceOf(Float32Array);
      expect(mat.length).toBe(9);
    });

    it('HRM-002: identity at 0 degrees', () => {
      const mat = buildHueRotationMatrix(0);
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (let i = 0; i < 9; i++) {
        expect(mat[i]).toBeCloseTo(identity[i]!, 5);
      }
    });

    it('HRM-003: identity at 360 degrees', () => {
      const mat = buildHueRotationMatrix(360);
      const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      for (let i = 0; i < 9; i++) {
        expect(mat[i]).toBeCloseTo(identity[i]!, 4);
      }
    });

    it('HRM-004: preserves luminance at 90 degrees', () => {
      const [r, g, b] = [0.8, 0.3, 0.5];
      const [rr, rg, rb] = applyHueRotation(r, g, b, 90);
      expect(luminance(rr, rg, rb)).toBeCloseTo(luminance(r, g, b), 4);
    });

    it('HRM-005: preserves luminance at 180 degrees', () => {
      const [r, g, b] = [0.8, 0.3, 0.5];
      const [rr, rg, rb] = applyHueRotation(r, g, b, 180);
      expect(luminance(rr, rg, rb)).toBeCloseTo(luminance(r, g, b), 4);
    });

    it('HRM-006: preserves luminance at 270 degrees', () => {
      const [r, g, b] = [0.8, 0.3, 0.5];
      const [rr, rg, rb] = applyHueRotation(r, g, b, 270);
      expect(luminance(rr, rg, rb)).toBeCloseTo(luminance(r, g, b), 4);
    });

    it('HRM-007: preserves luminance for arbitrary angle (137 degrees)', () => {
      // Use a mid-range color that won't clip after rotation
      const [r, g, b] = [0.5, 0.4, 0.5];
      const [rr, rg, rb] = applyHueRotation(r, g, b, 137);
      expect(luminance(rr, rg, rb)).toBeCloseTo(luminance(r, g, b), 4);
    });

    it('HRM-008: preserves neutral gray', () => {
      for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const [r, g, b] = applyHueRotation(0.5, 0.5, 0.5, angle);
        expect(r).toBeCloseTo(0.5, 4);
        expect(g).toBeCloseTo(0.5, 4);
        expect(b).toBeCloseTo(0.5, 4);
      }
    });

    it('HRM-009: preserves white', () => {
      for (const angle of [0, 90, 180, 270]) {
        const [r, g, b] = applyHueRotation(1, 1, 1, angle);
        expect(r).toBeCloseTo(1, 4);
        expect(g).toBeCloseTo(1, 4);
        expect(b).toBeCloseTo(1, 4);
      }
    });

    it('HRM-010: preserves black', () => {
      for (const angle of [0, 90, 180, 270]) {
        const [r, g, b] = applyHueRotation(0, 0, 0, angle);
        expect(r).toBeCloseTo(0, 4);
        expect(g).toBeCloseTo(0, 4);
        expect(b).toBeCloseTo(0, 4);
      }
    });

    it('HRM-011: 120 degrees shifts red toward green', () => {
      const [r, g] = applyHueRotation(1, 0, 0, 120);
      expect(g).toBeGreaterThan(r);
    });

    it('HRM-012: 240 degrees shifts red toward blue', () => {
      const [r, , b] = applyHueRotation(1, 0, 0, 240);
      expect(b).toBeGreaterThan(r);
    });

    it('HRM-013: negative angle equivalent to positive complement', () => {
      const [r1, g1, b1] = applyHueRotation(0.7, 0.3, 0.5, -90);
      const [r2, g2, b2] = applyHueRotation(0.7, 0.3, 0.5, 270);
      expect(r1).toBeCloseTo(r2, 4);
      expect(g1).toBeCloseTo(g2, 4);
      expect(b1).toBeCloseTo(b2, 4);
    });

    it('HRM-015: matrix row sums equal 1', () => {
      for (const angle of [0, 30, 90, 180, 270]) {
        const mat = buildHueRotationMatrix(angle);
        // Column-major: row 0 = mat[0], mat[3], mat[6]
        expect(mat[0]! + mat[3]! + mat[6]!).toBeCloseTo(1.0, 5);
        expect(mat[1]! + mat[4]! + mat[7]!).toBeCloseTo(1.0, 5);
        expect(mat[2]! + mat[5]! + mat[8]!).toBeCloseTo(1.0, 5);
      }
    });

    it('HRM-016: column-major order for WebGL', () => {
      // At 0 degrees, should be identity in column-major
      const mat = buildHueRotationMatrix(0);
      // Column 0: m00, m10, m20
      expect(mat[0]).toBeCloseTo(1, 5); // m00
      expect(mat[1]).toBeCloseTo(0, 5); // m10
      expect(mat[2]).toBeCloseTo(0, 5); // m20
      // Column 1: m01, m11, m21
      expect(mat[3]).toBeCloseTo(0, 5); // m01
      expect(mat[4]).toBeCloseTo(1, 5); // m11
      expect(mat[5]).toBeCloseTo(0, 5); // m21
      // Column 2: m02, m12, m22
      expect(mat[6]).toBeCloseTo(0, 5); // m02
      expect(mat[7]).toBeCloseTo(0, 5); // m12
      expect(mat[8]).toBeCloseTo(1, 5); // m22
    });
  });

  describe('applyHueRotation', () => {
    it('HRM-017: clamps output to [0,1]', () => {
      // Test with various angles to ensure clamping works
      for (const angle of [0, 90, 180, 270, 45, 135, 225, 315]) {
        const [r, g, b] = applyHueRotation(1, 0, 0, angle);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('isIdentityHueRotation', () => {
    it('HRM-018: returns true for 0', () => {
      expect(isIdentityHueRotation(0)).toBe(true);
    });

    it('HRM-019: returns true for 360', () => {
      expect(isIdentityHueRotation(360)).toBe(true);
    });

    it('HRM-020: returns false for 180', () => {
      expect(isIdentityHueRotation(180)).toBe(false);
    });

    it('returns true for 720', () => {
      expect(isIdentityHueRotation(720)).toBe(true);
    });

    it('returns true for -360', () => {
      expect(isIdentityHueRotation(-360)).toBe(true);
    });

    it('returns false for 90', () => {
      expect(isIdentityHueRotation(90)).toBe(false);
    });
  });
});
