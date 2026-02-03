/**
 * Tetrahedral Interpolation Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  applyLUT3DTetrahedral,
  applyLUT3DToBuffer,
  compareInterpolationMethods,
} from './TetrahedralInterp';
import { applyLUT3D, parseCubeLUT } from './LUTLoader';
import type { LUT3D } from './LUTLoader';
import { createSampleCubeLUT } from '../../test/utils';

/**
 * Create an identity 3D LUT of given size
 */
function createIdentityLUT3D(size: number): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  let idx = 0;
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        data[idx++] = r / (size - 1);
        data[idx++] = g / (size - 1);
        data[idx++] = b / (size - 1);
      }
    }
  }
  return {
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

/**
 * Create a non-linear 3D LUT (gamma-like transform) to test interpolation differences
 */
function createGammaLUT3D(size: number, gamma: number): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  let idx = 0;
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        data[idx++] = Math.pow(r / (size - 1), gamma);
        data[idx++] = Math.pow(g / (size - 1), gamma);
        data[idx++] = Math.pow(b / (size - 1), gamma);
      }
    }
  }
  return {
    title: 'Gamma LUT',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

describe('TetrahedralInterp', () => {
  describe('applyLUT3DTetrahedral', () => {
    it('TET-001: identity LUT preserves input at exact lattice points', () => {
      const lut = createIdentityLUT3D(4);

      // Test at exact lattice points (no interpolation needed)
      const testValues: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 1],
        [1 / 3, 1 / 3, 1 / 3],
        [2 / 3, 2 / 3, 2 / 3],
      ];

      for (const [r, g, b] of testValues) {
        const result = applyLUT3DTetrahedral(lut, r, g, b);
        expect(result[0]).toBeCloseTo(r, 5);
        expect(result[1]).toBeCloseTo(g, 5);
        expect(result[2]).toBeCloseTo(b, 5);
      }
    });

    it('TET-002: identity LUT preserves input at intermediate points', () => {
      const lut = createIdentityLUT3D(4);

      const testValues: [number, number, number][] = [
        [0.25, 0.5, 0.75],
        [0.1, 0.2, 0.3],
        [0.9, 0.4, 0.6],
        [0.5, 0.5, 0.5],
      ];

      for (const [r, g, b] of testValues) {
        const result = applyLUT3DTetrahedral(lut, r, g, b);
        expect(result[0]).toBeCloseTo(r, 2);
        expect(result[1]).toBeCloseTo(g, 2);
        expect(result[2]).toBeCloseTo(b, 2);
      }
    });

    it('TET-003: clamps out-of-domain inputs', () => {
      const lut = createIdentityLUT3D(4);

      const result = applyLUT3DTetrahedral(lut, 1.5, -0.5, 2.0);

      expect(result[0]).toBeGreaterThanOrEqual(0);
      expect(result[0]).toBeLessThanOrEqual(1);
      expect(result[1]).toBeGreaterThanOrEqual(0);
      expect(result[1]).toBeLessThanOrEqual(1);
      expect(result[2]).toBeGreaterThanOrEqual(0);
      expect(result[2]).toBeLessThanOrEqual(1);
    });

    it('TET-004: handles corner cases black (0,0,0) and white (1,1,1)', () => {
      const lut = createIdentityLUT3D(4);

      const black = applyLUT3DTetrahedral(lut, 0, 0, 0);
      expect(black[0]).toBeCloseTo(0, 5);
      expect(black[1]).toBeCloseTo(0, 5);
      expect(black[2]).toBeCloseTo(0, 5);

      const white = applyLUT3DTetrahedral(lut, 1, 1, 1);
      expect(white[0]).toBeCloseTo(1, 5);
      expect(white[1]).toBeCloseTo(1, 5);
      expect(white[2]).toBeCloseTo(1, 5);
    });

    it('TET-005: handles primary colors at lattice points', () => {
      const lut = createIdentityLUT3D(4);

      const red = applyLUT3DTetrahedral(lut, 1, 0, 0);
      expect(red[0]).toBeCloseTo(1, 5);
      expect(red[1]).toBeCloseTo(0, 5);
      expect(red[2]).toBeCloseTo(0, 5);

      const green = applyLUT3DTetrahedral(lut, 0, 1, 0);
      expect(green[0]).toBeCloseTo(0, 5);
      expect(green[1]).toBeCloseTo(1, 5);
      expect(green[2]).toBeCloseTo(0, 5);

      const blue = applyLUT3DTetrahedral(lut, 0, 0, 1);
      expect(blue[0]).toBeCloseTo(0, 5);
      expect(blue[1]).toBeCloseTo(0, 5);
      expect(blue[2]).toBeCloseTo(1, 5);
    });

    it('TET-006: respects custom domain', () => {
      const lut = createIdentityLUT3D(4);
      lut.domainMin = [0, 0, 0];
      lut.domainMax = [0.5, 0.5, 0.5];

      // Value at 0.25 (middle of 0-0.5 domain) should map to middle of identity LUT (0.5)
      const result = applyLUT3DTetrahedral(lut, 0.25, 0.25, 0.25);
      expect(result[0]).toBeCloseTo(0.5, 1);
      expect(result[1]).toBeCloseTo(0.5, 1);
      expect(result[2]).toBeCloseTo(0.5, 1);
    });

    it('TET-007: works with small LUT size (2)', () => {
      const lut = createIdentityLUT3D(2);

      const result = applyLUT3DTetrahedral(lut, 0.5, 0.5, 0.5);
      expect(result[0]).toBeCloseTo(0.5, 2);
      expect(result[1]).toBeCloseTo(0.5, 2);
      expect(result[2]).toBeCloseTo(0.5, 2);
    });

    it('TET-008: works with large LUT size (17)', () => {
      const lut = createIdentityLUT3D(17);

      const result = applyLUT3DTetrahedral(lut, 0.3, 0.6, 0.9);
      expect(result[0]).toBeCloseTo(0.3, 2);
      expect(result[1]).toBeCloseTo(0.6, 2);
      expect(result[2]).toBeCloseTo(0.9, 2);
    });

    it('TET-009: non-identity LUT produces transformed values', () => {
      const lut = createGammaLUT3D(4, 2.2);

      // Input 0.5 should become 0.5^2.2 = ~0.2176 (approximately, with interpolation)
      const result = applyLUT3DTetrahedral(lut, 0.5, 0.5, 0.5);
      const expected = Math.pow(0.5, 2.2);
      expect(result[0]).toBeCloseTo(expected, 1);
      expect(result[1]).toBeCloseTo(expected, 1);
      expect(result[2]).toBeCloseTo(expected, 1);
    });

    it('TET-010: weights sum to 1 (barycentric property)', () => {
      // Test that tetrahedral interpolation produces reasonable results
      // by checking that a constant-value LUT returns that constant
      const size = 4;
      const data = new Float32Array(size * size * size * 3);
      data.fill(0.42);
      const lut: LUT3D = {
        title: 'Constant',
        size,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        data,
      };

      const result = applyLUT3DTetrahedral(lut, 0.3, 0.6, 0.9);
      expect(result[0]).toBeCloseTo(0.42, 5);
      expect(result[1]).toBeCloseTo(0.42, 5);
      expect(result[2]).toBeCloseTo(0.42, 5);
    });

    it('TET-011: covers all 6 tetrahedra based on ordering', () => {
      const lut = createIdentityLUT3D(4);

      // Each test point will trigger a different tetrahedron
      // based on the ordering of the fractional parts

      // fr > fg > fb
      const r1 = applyLUT3DTetrahedral(lut, 0.8, 0.5, 0.2);
      expect(r1[0]).toBeCloseTo(0.8, 1);

      // fr > fb > fg
      const r2 = applyLUT3DTetrahedral(lut, 0.8, 0.2, 0.5);
      expect(r2[0]).toBeCloseTo(0.8, 1);

      // fb > fr > fg
      const r3 = applyLUT3DTetrahedral(lut, 0.5, 0.2, 0.8);
      expect(r3[2]).toBeCloseTo(0.8, 1);

      // fg > fr > fb
      const r4 = applyLUT3DTetrahedral(lut, 0.5, 0.8, 0.2);
      expect(r4[1]).toBeCloseTo(0.8, 1);

      // fg > fb > fr
      const r5 = applyLUT3DTetrahedral(lut, 0.2, 0.8, 0.5);
      expect(r5[1]).toBeCloseTo(0.8, 1);

      // fb > fg > fr
      const r6 = applyLUT3DTetrahedral(lut, 0.2, 0.5, 0.8);
      expect(r6[2]).toBeCloseTo(0.8, 1);
    });

    it('TET-012: matches trilinear at lattice points', () => {
      const lut = createGammaLUT3D(4, 2.2);

      // At exact lattice points, both methods should give exact same result
      const latticePoints: [number, number, number][] = [
        [0, 0, 0],
        [1 / 3, 1 / 3, 1 / 3],
        [2 / 3, 2 / 3, 2 / 3],
        [1, 1, 1],
      ];

      for (const [r, g, b] of latticePoints) {
        const tri = applyLUT3D(lut, r, g, b);
        const tet = applyLUT3DTetrahedral(lut, r, g, b);
        expect(tet[0]).toBeCloseTo(tri[0], 5);
        expect(tet[1]).toBeCloseTo(tri[1], 5);
        expect(tet[2]).toBeCloseTo(tri[2], 5);
      }
    });

    it('TET-013: matches parsed cube file LUT', () => {
      const content = createSampleCubeLUT(4);
      const lut = parseCubeLUT(content) as LUT3D;

      const result = applyLUT3DTetrahedral(lut, 0.5, 0.5, 0.5);
      expect(result[0]).toBeCloseTo(0.5, 1);
      expect(result[1]).toBeCloseTo(0.5, 1);
      expect(result[2]).toBeCloseTo(0.5, 1);
    });
  });

  describe('applyLUT3DToBuffer', () => {
    it('TET-020: processes RGBA buffer with tetrahedral interpolation', () => {
      const lut = createIdentityLUT3D(4);
      const input = new Float32Array([
        0.2, 0.4, 0.6, 1.0,
        0.8, 0.1, 0.3, 1.0,
      ]);

      const output = applyLUT3DToBuffer(input, 2, 1, lut, 'tetrahedral');

      expect(output[0]).toBeCloseTo(0.2, 2);
      expect(output[1]).toBeCloseTo(0.4, 2);
      expect(output[2]).toBeCloseTo(0.6, 2);
      expect(output[3]).toBe(1.0); // alpha preserved

      expect(output[4]).toBeCloseTo(0.8, 2);
      expect(output[5]).toBeCloseTo(0.1, 2);
      expect(output[6]).toBeCloseTo(0.3, 2);
      expect(output[7]).toBe(1.0);
    });

    it('TET-021: processes RGBA buffer with trilinear interpolation', () => {
      const lut = createIdentityLUT3D(4);
      const input = new Float32Array([
        0.2, 0.4, 0.6, 1.0,
      ]);

      const output = applyLUT3DToBuffer(input, 1, 1, lut, 'trilinear');

      expect(output[0]).toBeCloseTo(0.2, 2);
      expect(output[1]).toBeCloseTo(0.4, 2);
      expect(output[2]).toBeCloseTo(0.6, 2);
      expect(output[3]).toBe(1.0);
    });

    it('TET-022: preserves alpha channel', () => {
      const lut = createIdentityLUT3D(4);
      const input = new Float32Array([
        0.5, 0.5, 0.5, 0.75,
        0.5, 0.5, 0.5, 0.25,
      ]);

      const output = applyLUT3DToBuffer(input, 2, 1, lut, 'tetrahedral');

      expect(output[3]).toBe(0.75);
      expect(output[7]).toBe(0.25);
    });

    it('TET-023: defaults to tetrahedral method', () => {
      const lut = createGammaLUT3D(4, 2.2);
      const input = new Float32Array([0.5, 0.5, 0.5, 1.0]);

      const defaultOutput = applyLUT3DToBuffer(input, 1, 1, lut);
      const tetraOutput = applyLUT3DToBuffer(input, 1, 1, lut, 'tetrahedral');

      expect(defaultOutput[0]).toBeCloseTo(tetraOutput[0]!, 5);
      expect(defaultOutput[1]).toBeCloseTo(tetraOutput[1]!, 5);
      expect(defaultOutput[2]).toBeCloseTo(tetraOutput[2]!, 5);
    });
  });

  describe('compareInterpolationMethods', () => {
    it('TET-030: returns both results and difference', () => {
      const lut = createGammaLUT3D(4, 2.2);

      const comparison = compareInterpolationMethods(lut, 0.5, 0.5, 0.5);

      expect(comparison.trilinear).toBeDefined();
      expect(comparison.tetrahedral).toBeDefined();
      expect(comparison.difference).toBeDefined();
      expect(comparison.maxDifference).toBeGreaterThanOrEqual(0);

      // Verify difference is calculated correctly
      expect(comparison.difference[0]).toBeCloseTo(
        Math.abs(comparison.trilinear[0] - comparison.tetrahedral[0]),
        10
      );
    });

    it('TET-031: difference is zero at lattice points', () => {
      const lut = createGammaLUT3D(4, 2.2);

      const comparison = compareInterpolationMethods(lut, 0, 0, 0);
      expect(comparison.maxDifference).toBeCloseTo(0, 5);

      const comp2 = compareInterpolationMethods(lut, 1, 1, 1);
      expect(comp2.maxDifference).toBeCloseTo(0, 5);
    });

    it('TET-032: identity LUT has zero difference everywhere', () => {
      const lut = createIdentityLUT3D(4);

      const testPoints: [number, number, number][] = [
        [0.1, 0.2, 0.3],
        [0.5, 0.5, 0.5],
        [0.7, 0.3, 0.9],
      ];

      for (const [r, g, b] of testPoints) {
        const comp = compareInterpolationMethods(lut, r, g, b);
        // For identity LUT, both methods should agree closely
        expect(comp.maxDifference).toBeLessThan(0.01);
      }
    });

    it('TET-033: non-identity LUT may show differences between methods', () => {
      // With a highly non-linear LUT at small size, differences emerge
      const lut = createGammaLUT3D(2, 3.0);

      // At midpoints between lattice nodes, methods may diverge
      const comp = compareInterpolationMethods(lut, 0.5, 0.5, 0.5);

      // Both should produce reasonable results
      expect(comp.trilinear[0]).toBeGreaterThanOrEqual(0);
      expect(comp.trilinear[0]).toBeLessThanOrEqual(1);
      expect(comp.tetrahedral[0]).toBeGreaterThanOrEqual(0);
      expect(comp.tetrahedral[0]).toBeLessThanOrEqual(1);
    });
  });

  describe('accuracy comparison', () => {
    it('TET-040: tetrahedral matches or outperforms trilinear for gamma curve', () => {
      // Use a small LUT with a known gamma curve and compare both methods
      // against the exact analytical result
      const gamma = 2.2;
      const lut = createGammaLUT3D(4, gamma);

      const testPoints: [number, number, number][] = [
        [0.1, 0.1, 0.1],
        [0.3, 0.3, 0.3],
        [0.5, 0.5, 0.5],
        [0.7, 0.7, 0.7],
        [0.9, 0.9, 0.9],
      ];

      let tetraErrorSum = 0;
      let triErrorSum = 0;

      for (const [r, g, b] of testPoints) {
        const expected = Math.pow(r, gamma);
        const tri = applyLUT3D(lut, r, g, b);
        const tet = applyLUT3DTetrahedral(lut, r, g, b);

        const triError = Math.abs(tri[0] - expected);
        const tetError = Math.abs(tet[0] - expected);

        tetraErrorSum += tetError;
        triErrorSum += triError;
      }

      // Tetrahedral should generally have lower or equal total error
      // for monotonic functions along the diagonal
      expect(tetraErrorSum).toBeLessThanOrEqual(triErrorSum + 0.01);
    });

    it('TET-041: both methods converge with higher LUT resolution', () => {
      const gamma = 2.2;

      // Compare error at size 4 vs size 17
      const lut4 = createGammaLUT3D(4, gamma);
      const lut17 = createGammaLUT3D(17, gamma);

      const r = 0.42;
      const expected = Math.pow(r, gamma);

      const tet4 = applyLUT3DTetrahedral(lut4, r, r, r);
      const tet17 = applyLUT3DTetrahedral(lut17, r, r, r);

      const error4 = Math.abs(tet4[0] - expected);
      const error17 = Math.abs(tet17[0] - expected);

      // Higher resolution should give lower error
      expect(error17).toBeLessThan(error4);
    });
  });
});
