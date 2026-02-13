/**
 * Perspective Correction Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERSPECTIVE_PARAMS,
  isPerspectiveActive,
  computeHomography,
  invertHomography3x3,
  computeInverseHomographyFloat32,
  applyPerspectiveCorrection,
  generatePerspectiveGrid,
  PerspectiveCorrectionParams,
} from './PerspectiveCorrection';
import { createTestImageData } from '../../test/utils';

describe('PerspectiveCorrection', () => {
  describe('DEFAULT_PERSPECTIVE_PARAMS', () => {
    it('PERSP-T001: has correct default values', () => {
      expect(DEFAULT_PERSPECTIVE_PARAMS.enabled).toBe(false);
      expect(DEFAULT_PERSPECTIVE_PARAMS.topLeft).toEqual({ x: 0, y: 0 });
      expect(DEFAULT_PERSPECTIVE_PARAMS.topRight).toEqual({ x: 1, y: 0 });
      expect(DEFAULT_PERSPECTIVE_PARAMS.bottomRight).toEqual({ x: 1, y: 1 });
      expect(DEFAULT_PERSPECTIVE_PARAMS.bottomLeft).toEqual({ x: 0, y: 1 });
      expect(DEFAULT_PERSPECTIVE_PARAMS.quality).toBe('bilinear');
    });
  });

  describe('isPerspectiveActive', () => {
    it('PERSP-T002: returns false for default params', () => {
      expect(isPerspectiveActive(DEFAULT_PERSPECTIVE_PARAMS)).toBe(false);
    });

    it('PERSP-T002b: returns false when enabled but corners are default', () => {
      expect(isPerspectiveActive({ ...DEFAULT_PERSPECTIVE_PARAMS, enabled: true })).toBe(false);
    });

    it('PERSP-T003: returns true when corner is moved and enabled', () => {
      const params: PerspectiveCorrectionParams = {
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
      };
      expect(isPerspectiveActive(params)).toBe(true);
    });

    it('returns false when corner is moved but disabled', () => {
      const params: PerspectiveCorrectionParams = {
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: false,
        topLeft: { x: 0.1, y: 0.1 },
      };
      expect(isPerspectiveActive(params)).toBe(false);
    });
  });

  describe('computeHomography', () => {
    it('PERSP-T004: identity for unit square to unit square', () => {
      const src = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const dst = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const H = computeHomography(src, dst);

      // Should be close to identity: [1,0,0, 0,1,0, 0,0,1]
      expect(H[0]).toBeCloseTo(1, 6);
      expect(H[1]).toBeCloseTo(0, 6);
      expect(H[2]).toBeCloseTo(0, 6);
      expect(H[3]).toBeCloseTo(0, 6);
      expect(H[4]).toBeCloseTo(1, 6);
      expect(H[5]).toBeCloseTo(0, 6);
      expect(H[6]).toBeCloseTo(0, 6);
      expect(H[7]).toBeCloseTo(0, 6);
      expect(H[8]).toBeCloseTo(1, 6);
    });

    it('PERSP-T005: correct for known transform', () => {
      // Map unit square to a known rectangle: (0,0)->(0,0), (1,0)->(2,0), (1,1)->(2,1), (0,1)->(0,1)
      // This is a 2x horizontal scale
      const src = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const dst = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ];
      const H = computeHomography(src, dst);

      // Verify: H * [0.5, 0.5, 1]^T should give [1.0, 0.5] after division
      const x = H[0]! * 0.5 + H[1]! * 0.5 + H[2]!;
      const y = H[3]! * 0.5 + H[4]! * 0.5 + H[5]!;
      const w = H[6]! * 0.5 + H[7]! * 0.5 + H[8]!;
      expect(x / w).toBeCloseTo(1.0, 4);
      expect(y / w).toBeCloseTo(0.5, 4);
    });
  });

  describe('invertHomography3x3', () => {
    it('PERSP-T006: round-trips correctly (H * H^-1 ≈ I)', () => {
      const src = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const dst = [
        { x: 0.1, y: 0.05 },
        { x: 0.9, y: 0.1 },
        { x: 0.95, y: 0.85 },
        { x: 0.05, y: 0.9 },
      ];
      const H = computeHomography(src, dst);
      const invH = invertHomography3x3(H);

      // Multiply H * invH should give identity (up to a scale factor)
      const product = new Float64Array(9);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          let sum = 0;
          for (let k = 0; k < 3; k++) {
            sum += H[i * 3 + k]! * invH[k * 3 + j]!;
          }
          product[i * 3 + j] = sum;
        }
      }

      // Normalize by bottom-right element
      const scale = product[8]!;
      expect(scale).not.toBe(0);

      expect(product[0]! / scale).toBeCloseTo(1, 5);
      expect(product[1]! / scale).toBeCloseTo(0, 5);
      expect(product[2]! / scale).toBeCloseTo(0, 5);
      expect(product[3]! / scale).toBeCloseTo(0, 5);
      expect(product[4]! / scale).toBeCloseTo(1, 5);
      expect(product[5]! / scale).toBeCloseTo(0, 5);
      expect(product[6]! / scale).toBeCloseTo(0, 5);
      expect(product[7]! / scale).toBeCloseTo(0, 5);
      expect(product[8]! / scale).toBeCloseTo(1, 5);
    });
  });

  describe('applyPerspectiveCorrection', () => {
    it('PERSP-T007: returns same ImageData when inactive', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 64, b: 32 });
      const result = applyPerspectiveCorrection(imageData, DEFAULT_PERSPECTIVE_PARAMS);
      // Should return the exact same object (no copy)
      expect(result).toBe(imageData);
    });

    it('PERSP-T008: returns new ImageData when active', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 64, b: 32 });
      const params: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.1, y: 0.1 },
        topRight: { x: 0.9, y: 0.0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.0, y: 0.9 },
        quality: 'bilinear',
      };
      const result = applyPerspectiveCorrection(imageData, params);
      expect(result).not.toBe(imageData);
      expect(result.width).toBe(imageData.width);
      expect(result.height).toBe(imageData.height);
    });

    it('PERSP-T009: center pixels approximately unchanged for small offsets', () => {
      const imageData = createTestImageData(20, 20, { r: 200, g: 100, b: 50 });
      const params: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.02, y: 0.02 },
        topRight: { x: 0.98, y: 0.02 },
        bottomRight: { x: 0.98, y: 0.98 },
        bottomLeft: { x: 0.02, y: 0.98 },
        quality: 'bilinear',
      };
      const result = applyPerspectiveCorrection(imageData, params);
      // Center pixel (10, 10) should be close to original color
      const cx = 10, cy = 10;
      const idx = (cy * result.width + cx) * 4;
      expect(result.data[idx]!).toBeCloseTo(200, -1);
      expect(result.data[idx + 1]!).toBeCloseTo(100, -1);
      expect(result.data[idx + 2]!).toBeCloseTo(50, -1);
    });

    it('PERSP-T010: out-of-bounds pixels are black+transparent', () => {
      const imageData = createTestImageData(20, 20, { r: 200, g: 100, b: 50 });
      // Extend the quad beyond [0,1] so output corners map outside source bounds
      const params: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: -0.3, y: -0.3 },
        topRight: { x: 1.3, y: -0.3 },
        bottomRight: { x: 1.3, y: 1.3 },
        bottomLeft: { x: -0.3, y: 1.3 },
        quality: 'bilinear',
      };
      const result = applyPerspectiveCorrection(imageData, params);
      // Top-left corner (0,0) maps to source (-0.3, -0.3) which is OOB
      const idx = 0;
      expect(result.data[idx]).toBe(0);
      expect(result.data[idx + 1]).toBe(0);
      expect(result.data[idx + 2]).toBe(0);
      expect(result.data[idx + 3]).toBe(0);
    });

    it('PERSP-T011: bicubic produces different output than bilinear', () => {
      // Create a gradient image so interpolation methods differ
      const imageData = new ImageData(20, 20);
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const i = (y * 20 + x) * 4;
          imageData.data[i] = Math.round(x * 12.75);
          imageData.data[i + 1] = Math.round(y * 12.75);
          imageData.data[i + 2] = 0;
          imageData.data[i + 3] = 255;
        }
      }
      const baseParams: Omit<PerspectiveCorrectionParams, 'quality'> = {
        enabled: true,
        topLeft: { x: 0.1, y: 0.05 },
        topRight: { x: 0.95, y: 0.1 },
        bottomRight: { x: 0.9, y: 0.95 },
        bottomLeft: { x: 0.05, y: 0.9 },
      };
      const bilinearResult = applyPerspectiveCorrection(imageData, { ...baseParams, quality: 'bilinear' });
      const bicubicResult = applyPerspectiveCorrection(imageData, { ...baseParams, quality: 'bicubic' });

      // At least some pixels should differ
      let diffCount = 0;
      for (let i = 0; i < bilinearResult.data.length; i++) {
        if (bilinearResult.data[i] !== bicubicResult.data[i]) diffCount++;
      }
      expect(diffCount).toBeGreaterThan(0);
    });

    it('PERSP-T012: degenerate corners (collapsed) returns gracefully', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 64, b: 32 });
      // All corners at same point — degenerate
      const params: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.5, y: 0.5 },
        topRight: { x: 0.5, y: 0.5 },
        bottomRight: { x: 0.5, y: 0.5 },
        bottomLeft: { x: 0.5, y: 0.5 },
        quality: 'bilinear',
      };
      // Should not throw
      const result = applyPerspectiveCorrection(imageData, params);
      expect(result).toBeInstanceOf(ImageData);
      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
    });
  });

  describe('generatePerspectiveGrid', () => {
    it('PERSP-T013: produces correct number of subdivisions', () => {
      const grid = generatePerspectiveGrid(DEFAULT_PERSPECTIVE_PARAMS, 8);
      expect(grid.length).toBe(9); // 8+1 rows
      for (const row of grid) {
        expect(row.length).toBe(9); // 8+1 columns
      }
    });

    it('grid corners match params for identity', () => {
      const params: PerspectiveCorrectionParams = {
        ...DEFAULT_PERSPECTIVE_PARAMS,
        enabled: true,
      };
      const grid = generatePerspectiveGrid(params, 4);
      // Top-left
      expect(grid[0]![0]!.x).toBeCloseTo(0, 4);
      expect(grid[0]![0]!.y).toBeCloseTo(0, 4);
      // Top-right
      expect(grid[0]![4]!.x).toBeCloseTo(1, 4);
      expect(grid[0]![4]!.y).toBeCloseTo(0, 4);
      // Bottom-right
      expect(grid[4]![4]!.x).toBeCloseTo(1, 4);
      expect(grid[4]![4]!.y).toBeCloseTo(1, 4);
      // Bottom-left
      expect(grid[4]![0]!.x).toBeCloseTo(0, 4);
      expect(grid[4]![0]!.y).toBeCloseTo(1, 4);
    });
  });

  describe('correction direction regression', () => {
    it('PERSP-T015: correction maps output to source quad (not inverted)', () => {
      // Create a horizontal gradient: R increases left-to-right
      const size = 20;
      const imageData = new ImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          imageData.data[i] = Math.round((x / (size - 1)) * 255); // R = x position
          imageData.data[i + 1] = Math.round((y / (size - 1)) * 255); // G = y position
          imageData.data[i + 2] = 0;
          imageData.data[i + 3] = 255;
        }
      }

      // Quad maps output rectangle → right half of source image
      // Output (0,0) → source (0.5, 0), Output (1,0) → source (1.0, 0)
      const params: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.5, y: 0 },
        topRight: { x: 1.0, y: 0 },
        bottomRight: { x: 1.0, y: 1.0 },
        bottomLeft: { x: 0.5, y: 1.0 },
        quality: 'bilinear',
      };

      const result = applyPerspectiveCorrection(imageData, params);

      // Center of output (10, 10) → source position ~(0.75, 0.5)
      // Source gradient R at x_norm=0.75 → R ≈ 191
      const cx = 10, cy = 10;
      const idx = (cy * result.width + cx) * 4;
      const rValue = result.data[idx]!;

      // Should sample from the RIGHT half of source (R > 127)
      // If direction were inverted, it would sample from the left half (R < 127)
      expect(rValue).toBeGreaterThan(150);
      expect(rValue).toBeLessThan(230);
    });

    it('PERSP-T016: computeInverseHomographyFloat32 maps output to source quad', () => {
      // Verify that the homography matrix maps output positions to source positions
      // (not the reverse). This catches the H vs H⁻¹ regression.
      const params: PerspectiveCorrectionParams = {
        enabled: true,
        topLeft: { x: 0.2, y: 0.1 },
        topRight: { x: 0.8, y: 0.1 },
        bottomRight: { x: 0.9, y: 0.9 },
        bottomLeft: { x: 0.1, y: 0.9 },
        quality: 'bilinear',
      };
      const mat = computeInverseHomographyFloat32(params);

      // Column-major mat3: mat[col*3+row]
      // Apply to output corner (0, 0, 1) → should give source topLeft (0.2, 0.1)
      // mat * [0, 0, 1]^T = [mat[6], mat[7], mat[8]] (3rd column)
      const hx = mat[6]!;
      const hy = mat[7]!;
      const hz = mat[8]!;
      expect(hz).not.toBe(0);
      expect(hx / hz).toBeCloseTo(0.2, 2);
      expect(hy / hz).toBeCloseTo(0.1, 2);
    });
  });

  describe('computeInverseHomographyFloat32', () => {
    it('PERSP-T014: returns 9-element Float32Array', () => {
      const result = computeInverseHomographyFloat32(DEFAULT_PERSPECTIVE_PARAMS);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(9);
    });

    it('returns identity for default params', () => {
      const result = computeInverseHomographyFloat32(DEFAULT_PERSPECTIVE_PARAMS);
      // Column-major identity
      expect(result[0]).toBeCloseTo(1, 5);
      expect(result[1]).toBeCloseTo(0, 5);
      expect(result[2]).toBeCloseTo(0, 5);
      expect(result[3]).toBeCloseTo(0, 5);
      expect(result[4]).toBeCloseTo(1, 5);
      expect(result[5]).toBeCloseTo(0, 5);
      expect(result[6]).toBeCloseTo(0, 5);
      expect(result[7]).toBeCloseTo(0, 5);
      expect(result[8]).toBeCloseTo(1, 5);
    });
  });
});
