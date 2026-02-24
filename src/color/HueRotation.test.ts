import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildHueRotationMatrix,
  getHueRotationMatrix,
  clearHueRotationCache,
  applyHueRotation,
  applyHueRotationInto,
  isIdentityHueRotation,
  buildHueRotationMatrixMul,
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

  describe('getHueRotationMatrix (caching)', () => {
    beforeEach(() => {
      clearHueRotationCache();
    });

    it('HRM-C01: returns correct values matching buildHueRotationMatrix', () => {
      const cached = getHueRotationMatrix(45);
      const direct = buildHueRotationMatrix(45);
      for (let i = 0; i < 9; i++) {
        expect(cached[i]).toBeCloseTo(direct[i]!, 6);
      }
    });

    it('HRM-C02: returns same reference on repeated calls with same angle (cache hit)', () => {
      const first = getHueRotationMatrix(45);
      const second = getHueRotationMatrix(45);
      expect(second).toBe(first); // reference equality - same object
    });

    it('HRM-C03: returns different reference when angle changes (cache invalidation)', () => {
      const first = getHueRotationMatrix(45);
      const second = getHueRotationMatrix(90);
      expect(second).not.toBe(first);
      // Also verify values are correct for the new angle
      const direct90 = buildHueRotationMatrix(90);
      for (let i = 0; i < 9; i++) {
        expect(second[i]).toBeCloseTo(direct90[i]!, 6);
      }
    });

    it('HRM-C04: normalizes 360 to 0 (cache hit for equivalent angles)', () => {
      const mat0 = getHueRotationMatrix(0);
      const mat360 = getHueRotationMatrix(360);
      expect(mat360).toBe(mat0); // same reference because 360 normalizes to 0
    });

    it('HRM-C05: normalizes -90 to 270 (cache hit for equivalent negative angles)', () => {
      const mat270 = getHueRotationMatrix(270);
      const matNeg90 = getHueRotationMatrix(-90);
      expect(matNeg90).toBe(mat270); // same reference
    });

    it('HRM-C06: normalizes 720 to 0', () => {
      const mat0 = getHueRotationMatrix(0);
      const mat720 = getHueRotationMatrix(720);
      expect(mat720).toBe(mat0);
    });

    it('HRM-C07: clearHueRotationCache forces recomputation', () => {
      const first = getHueRotationMatrix(45);
      clearHueRotationCache();
      const second = getHueRotationMatrix(45);
      // After clearing, a new Float32Array is allocated (different reference)
      expect(second).not.toBe(first);
      // But values should still be identical
      for (let i = 0; i < 9; i++) {
        expect(second[i]).toBeCloseTo(first[i]!, 6);
      }
    });

    it('HRM-C08: no new Float32Array allocation on cache hit', () => {
      // Call once to populate cache
      const first = getHueRotationMatrix(60);
      // Call multiple times - all should return exact same object
      for (let j = 0; j < 5; j++) {
        expect(getHueRotationMatrix(60)).toBe(first);
      }
    });

    it('HRM-C09: returns Float32Array of length 9', () => {
      const mat = getHueRotationMatrix(45);
      expect(mat).toBeInstanceOf(Float32Array);
      expect(mat.length).toBe(9);
    });
  });

  describe('buildHueRotationMatrixMul (cross-validation)', () => {
    it('HRM-X01: matches buildHueRotationMatrix for 0 degrees', () => {
      const canonical = buildHueRotationMatrix(0);
      const mul = buildHueRotationMatrixMul(0);
      for (let i = 0; i < 9; i++) {
        expect(mul[i]).toBeCloseTo(canonical[i]!, 5);
      }
    });

    it('HRM-X02: matches buildHueRotationMatrix for 90 degrees', () => {
      const canonical = buildHueRotationMatrix(90);
      const mul = buildHueRotationMatrixMul(90);
      for (let i = 0; i < 9; i++) {
        expect(mul[i]).toBeCloseTo(canonical[i]!, 5);
      }
    });

    it('HRM-X03: matches buildHueRotationMatrix for 180 degrees', () => {
      const canonical = buildHueRotationMatrix(180);
      const mul = buildHueRotationMatrixMul(180);
      for (let i = 0; i < 9; i++) {
        expect(mul[i]).toBeCloseTo(canonical[i]!, 5);
      }
    });

    it('HRM-X04: matches buildHueRotationMatrix for arbitrary angles', () => {
      for (const angle of [30, 45, 137, 200, 270, 315]) {
        const canonical = buildHueRotationMatrix(angle);
        const mul = buildHueRotationMatrixMul(angle);
        for (let i = 0; i < 9; i++) {
          expect(mul[i]).toBeCloseTo(canonical[i]!, 4);
        }
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

  describe('applyHueRotationInto', () => {
    it('HRM-INTO-001: produces identical results to applyHueRotation', () => {
      const angles = [0, 30, 90, 137, 180, 270];
      const out: [number, number, number] = [0, 0, 0];
      for (const deg of angles) {
        const [er, eg, eb] = applyHueRotation(0.8, 0.3, 0.5, deg);
        applyHueRotationInto(0.8, 0.3, 0.5, deg, out);
        expect(out[0]).toBeCloseTo(er, 6);
        expect(out[1]).toBeCloseTo(eg, 6);
        expect(out[2]).toBeCloseTo(eb, 6);
      }
    });

    it('HRM-INTO-002: output buffer is same reference across calls', () => {
      const out: [number, number, number] = [0, 0, 0];
      applyHueRotationInto(1, 0, 0, 90, out);
      const ref = out;
      applyHueRotationInto(0, 1, 0, 180, out);
      expect(out).toBe(ref);
    });

    it('HRM-INTO-003: clamps output to [0,1]', () => {
      const out: [number, number, number] = [0, 0, 0];
      // Use extreme values that might produce out-of-range results
      applyHueRotationInto(1, 0, 0, 120, out);
      for (let i = 0; i < 3; i++) {
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThanOrEqual(1);
      }
    });

    it('HRM-INTO-004: preserves neutral gray', () => {
      const out: [number, number, number] = [0, 0, 0];
      applyHueRotationInto(0.5, 0.5, 0.5, 90, out);
      expect(out[0]).toBeCloseTo(0.5, 5);
      expect(out[1]).toBeCloseTo(0.5, 5);
      expect(out[2]).toBeCloseTo(0.5, 5);
    });

    it('HRM-INTO-005: handles (0,0,0) black', () => {
      const out: [number, number, number] = [0, 0, 0];
      applyHueRotationInto(0, 0, 0, 90, out);
      expect(out[0]).toBe(0);
      expect(out[1]).toBe(0);
      expect(out[2]).toBe(0);
    });

    it('HRM-INTO-006: handles (1,1,1) white', () => {
      const out: [number, number, number] = [0, 0, 0];
      applyHueRotationInto(1, 1, 1, 90, out);
      expect(out[0]).toBeCloseTo(1, 5);
      expect(out[1]).toBeCloseTo(1, 5);
      expect(out[2]).toBeCloseTo(1, 5);
    });
  });
});
