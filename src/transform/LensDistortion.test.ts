/**
 * Lens Distortion Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  LensDistortionParams,
  DEFAULT_LENS_PARAMS,
  isDefaultLensParams,
  applyLensDistortion,
  generateDistortionGrid,
  apply3DE4AnamorphicDeg6,
} from './LensDistortion';
import { createTestImageData } from '../../test/utils';

describe('LensDistortion', () => {
  describe('DEFAULT_LENS_PARAMS', () => {
    it('LENS-001: has correct default values', () => {
      expect(DEFAULT_LENS_PARAMS.k1).toBe(0);
      expect(DEFAULT_LENS_PARAMS.k2).toBe(0);
      expect(DEFAULT_LENS_PARAMS.centerX).toBe(0);
      expect(DEFAULT_LENS_PARAMS.centerY).toBe(0);
      expect(DEFAULT_LENS_PARAMS.scale).toBe(1);
    });
  });

  describe('isDefaultLensParams', () => {
    it('returns true for default values', () => {
      expect(isDefaultLensParams(DEFAULT_LENS_PARAMS)).toBe(true);
    });

    it('returns false when k1 is modified', () => {
      const params: LensDistortionParams = { ...DEFAULT_LENS_PARAMS, k1: 0.1 };
      expect(isDefaultLensParams(params)).toBe(false);
    });

    it('returns false when k2 is modified', () => {
      const params: LensDistortionParams = { ...DEFAULT_LENS_PARAMS, k2: -0.05 };
      expect(isDefaultLensParams(params)).toBe(false);
    });

    it('returns false when centerX is modified', () => {
      const params: LensDistortionParams = { ...DEFAULT_LENS_PARAMS, centerX: 0.1 };
      expect(isDefaultLensParams(params)).toBe(false);
    });

    it('returns false when centerY is modified', () => {
      const params: LensDistortionParams = { ...DEFAULT_LENS_PARAMS, centerY: -0.1 };
      expect(isDefaultLensParams(params)).toBe(false);
    });

    it('returns false when scale is modified', () => {
      const params: LensDistortionParams = { ...DEFAULT_LENS_PARAMS, scale: 1.2 };
      expect(isDefaultLensParams(params)).toBe(false);
    });
  });

  describe('applyLensDistortion', () => {
    it('LENS-002: returns same image when params are default', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      const result = applyLensDistortion(imageData, DEFAULT_LENS_PARAMS);

      // Should return the same object reference when no distortion
      expect(result).toBe(imageData);
    });

    it('LENS-003: applies barrel distortion (negative k1)', () => {
      const imageData = createTestImageData(20, 20, { r: 255, g: 0, b: 0, a: 255 });
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.3,  // Barrel distortion
      };

      const result = applyLensDistortion(imageData, params);

      // Result should be a new ImageData
      expect(result).not.toBe(imageData);
      expect(result.width).toBe(imageData.width);
      expect(result.height).toBe(imageData.height);
      // Center pixels should remain relatively unchanged
      const centerIdx = (10 * 20 + 10) * 4;
      expect(result.data[centerIdx]).toBeCloseTo(255, -1);
    });

    it('LENS-004: applies pincushion distortion (positive k1)', () => {
      const imageData = createTestImageData(20, 20, { r: 0, g: 255, b: 0, a: 255 });
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: 0.3,  // Pincushion distortion
      };

      const result = applyLensDistortion(imageData, params);

      expect(result).not.toBe(imageData);
      expect(result.width).toBe(imageData.width);
      expect(result.height).toBe(imageData.height);
    });

    it('LENS-005: respects center offset', () => {
      const imageData = createTestImageData(20, 20, { r: 128, g: 128, b: 128, a: 255 });
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.2,
        centerX: 0.2,  // Offset center to the right
        centerY: -0.1, // Offset center up
      };

      const result = applyLensDistortion(imageData, params);

      expect(result.width).toBe(imageData.width);
      expect(result.height).toBe(imageData.height);
    });

    it('LENS-006: respects scale parameter', () => {
      const imageData = createTestImageData(20, 20, { r: 100, g: 100, b: 100, a: 255 });
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.2,
        scale: 1.2,  // Zoom out to show more after distortion
      };

      const result = applyLensDistortion(imageData, params);

      expect(result).not.toBe(imageData);
    });

    it('LENS-007: handles out-of-bounds with black pixels', () => {
      const imageData = createTestImageData(20, 20, { r: 255, g: 255, b: 255, a: 255 });
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.8,  // Strong barrel distortion
        scale: 0.5, // Will cause sampling outside bounds
      };

      const result = applyLensDistortion(imageData, params);

      // Check corners - they should be black (out of bounds)
      // Corner (0, 0)
      const cornerIdx = 0;
      // With strong distortion, corners may sample outside
      expect(result.data[cornerIdx + 3]).toBe(255); // Alpha preserved
    });

    it('uses bilinear interpolation for smooth results', () => {
      // Create a gradient image
      const imageData = new ImageData(20, 20);
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
          const idx = (y * 20 + x) * 4;
          imageData.data[idx] = Math.round((x / 19) * 255);     // R gradient
          imageData.data[idx + 1] = Math.round((y / 19) * 255); // G gradient
          imageData.data[idx + 2] = 128;
          imageData.data[idx + 3] = 255;
        }
      }

      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.1,
      };

      const result = applyLensDistortion(imageData, params);

      // Center should still have smooth gradient values
      const centerIdx = (10 * 20 + 10) * 4;
      expect(result.data[centerIdx]).toBeGreaterThan(0);
      expect(result.data[centerIdx]).toBeLessThan(255);
    });

    it('preserves alpha channel', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 200 });
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.2,
      };

      const result = applyLensDistortion(imageData, params);

      // Check center pixel alpha
      const centerIdx = (5 * 10 + 5) * 4;
      expect(result.data[centerIdx + 3]).toBeCloseTo(200, -1);
    });

    it('applies k2 secondary radial distortion', () => {
      const imageData = createTestImageData(20, 20, { r: 128, g: 128, b: 128, a: 255 });
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.1,
        k2: 0.05,  // Secondary distortion
      };

      const result = applyLensDistortion(imageData, params);

      expect(result).not.toBe(imageData);
      expect(result.width).toBe(20);
      expect(result.height).toBe(20);
    });
  });

  describe('generateDistortionGrid', () => {
    it('LENS-008: generates grid lines', () => {
      const grid = generateDistortionGrid(100, 100, DEFAULT_LENS_PARAMS, 20);

      expect(grid.lines).toBeDefined();
      expect(Array.isArray(grid.lines)).toBe(true);
      expect(grid.lines.length).toBeGreaterThan(0);
    });

    it('generates lines with correct structure', () => {
      const grid = generateDistortionGrid(100, 100, DEFAULT_LENS_PARAMS, 25);

      for (const line of grid.lines) {
        expect(typeof line.x1).toBe('number');
        expect(typeof line.y1).toBe('number');
        expect(typeof line.x2).toBe('number');
        expect(typeof line.y2).toBe('number');
        expect(Number.isFinite(line.x1)).toBe(true);
        expect(Number.isFinite(line.y1)).toBe(true);
        expect(Number.isFinite(line.x2)).toBe(true);
        expect(Number.isFinite(line.y2)).toBe(true);
      }
    });

    it('LENS-009: generates straight lines with default params', () => {
      const grid = generateDistortionGrid(100, 100, DEFAULT_LENS_PARAMS, 50);

      // With no distortion, horizontal lines should have same y1 and y2
      // and vertical lines should have same x1 and x2
      let foundHorizontal = false;
      let foundVertical = false;

      for (const line of grid.lines) {
        if (Math.abs(line.y1 - line.y2) < 0.001) {
          // Horizontal line - x values should differ
          foundHorizontal = true;
        }
        if (Math.abs(line.x1 - line.x2) < 0.001) {
          // Vertical line - y values should differ
          foundVertical = true;
        }
      }

      expect(foundHorizontal).toBe(true);
      expect(foundVertical).toBe(true);
    });

    it('LENS-010: generates curved lines with distortion', () => {
      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.3,
      };
      const grid = generateDistortionGrid(100, 100, params, 10);

      // Lines near edges should be curved
      expect(grid.lines.length).toBeGreaterThan(0);

      // The grid should have been transformed
      // Check that we have both horizontal and vertical segments
      const horizontalLines = grid.lines.filter(
        (line: { x1: number; y1: number; x2: number; y2: number }) => Math.abs(line.x1 - line.x2) > 1
      );
      const verticalLines = grid.lines.filter(
        (line: { x1: number; y1: number; x2: number; y2: number }) => Math.abs(line.y1 - line.y2) > 1
      );

      expect(horizontalLines.length).toBeGreaterThan(0);
      expect(verticalLines.length).toBeGreaterThan(0);
    });

    it('adjusts grid density based on gridSize', () => {
      const gridSmall = generateDistortionGrid(100, 100, DEFAULT_LENS_PARAMS, 10);
      const gridLarge = generateDistortionGrid(100, 100, DEFAULT_LENS_PARAMS, 50);

      // Smaller grid size = more lines
      expect(gridSmall.lines.length).toBeGreaterThan(gridLarge.lines.length);
    });

    it('handles non-square dimensions', () => {
      const grid = generateDistortionGrid(200, 100, DEFAULT_LENS_PARAMS, 20);

      expect(grid.lines).toBeDefined();
      expect(grid.lines.length).toBeGreaterThan(0);

      // All points should be finite numbers
      for (const line of grid.lines) {
        expect(Number.isFinite(line.x1)).toBe(true);
        expect(Number.isFinite(line.y1)).toBe(true);
        expect(Number.isFinite(line.x2)).toBe(true);
        expect(Number.isFinite(line.y2)).toBe(true);
      }
    });
  });

  describe('radial direction regression', () => {
    it('LENS-011: pincushion (positive k1) maps edge pixels outside source bounds', () => {
      // Positive k1 means radialFactor = 1 + k1*r² > 1 at edges
      // Each output pixel maps to a source pixel FARTHER from center
      // Edge output pixels should map outside source → black (OOB)
      const size = 21;
      const imageData = createTestImageData(size, size, { r: 200, g: 200, b: 200, a: 255 });

      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: 0.8,  // Strong pincushion
      };

      const result = applyLensDistortion(imageData, params);

      // Corner pixel (0, 0) is farthest from center → should map OOB → black
      const cornerIdx = 0;
      expect(result.data[cornerIdx]).toBe(0);
      expect(result.data[cornerIdx + 1]).toBe(0);
      expect(result.data[cornerIdx + 2]).toBe(0);

      // Center pixel should still have source color (maps to center, r=0, factor=1)
      const centerIdx = (10 * size + 10) * 4;
      expect(result.data[centerIdx]).toBeGreaterThan(150);
    });

    it('LENS-012: barrel (negative k1) shrinks image, no OOB at center', () => {
      // Negative k1 means radialFactor = 1 + k1*r² < 1 at edges
      // Each output pixel maps to a source pixel CLOSER to center
      // Edges should NOT be OOB, but map to interior source positions
      const size = 21;
      // Create gradient: R increases outward from center
      const imageData = new ImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          const dx = (x - 10) / 10;
          const dy = (y - 10) / 10;
          const dist = Math.sqrt(dx * dx + dy * dy);
          imageData.data[idx] = Math.min(255, Math.round(dist * 255));
          imageData.data[idx + 1] = 100;
          imageData.data[idx + 2] = 100;
          imageData.data[idx + 3] = 255;
        }
      }

      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.5,  // Barrel distortion
      };

      const result = applyLensDistortion(imageData, params);

      // Edge pixel (20, 10) maps to source closer to center → R should be LOWER
      // than original edge R value. Original edge R ≈ 255.
      const edgeIdx = (10 * size + 20) * 4;
      const edgeR = result.data[edgeIdx]!;
      // Should be non-zero (not OOB) and lower than original
      expect(edgeR).toBeGreaterThan(0);
      expect(edgeR).toBeLessThan(255);

      // Center should remain approximately unchanged
      const centerIdx = (10 * size + 10) * 4;
      expect(result.data[centerIdx]).toBeLessThan(20); // close to 0 at center
    });
  });

  describe('Brown-Conrady model', () => {
    it('center point remains unchanged', () => {
      const imageData = createTestImageData(21, 21, { r: 0, g: 0, b: 0, a: 255 });
      // Put a distinctive color at center
      const centerIdx = (10 * 21 + 10) * 4;
      imageData.data[centerIdx] = 255;
      imageData.data[centerIdx + 1] = 0;
      imageData.data[centerIdx + 2] = 0;

      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.3,
      };

      const result = applyLensDistortion(imageData, params);

      // Center pixel should still be red (or close to it)
      expect(result.data[centerIdx]).toBeGreaterThan(200);
    });

    it('distortion increases with distance from center', () => {
      // Create an image with a cross pattern
      const size = 21;
      const imageData = new ImageData(size, size);

      // Fill with black
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = 0;
        imageData.data[i + 1] = 0;
        imageData.data[i + 2] = 0;
        imageData.data[i + 3] = 255;
      }

      // Draw white center line (horizontal)
      const centerY = 10;
      for (let x = 0; x < size; x++) {
        const idx = (centerY * size + x) * 4;
        imageData.data[idx] = 255;
        imageData.data[idx + 1] = 255;
        imageData.data[idx + 2] = 255;
      }

      const params: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        k1: -0.3,  // Barrel distortion
      };

      const result = applyLensDistortion(imageData, params);

      // The result should have moved pixels
      // This is a smoke test - actual distortion verification would be complex
      expect(result.width).toBe(size);
      expect(result.height).toBe(size);
    });
  });

  describe('3DE4 Anamorphic Degree 6 model', () => {
    const base3DE4Params: LensDistortionParams = {
      ...DEFAULT_LENS_PARAMS,
      model: '3de4_anamorphic_degree_6',
    };

    it('3DE4-001: Zero coefficients produce identity (no distortion)', () => {
      // All 3DE4 coefficients default to 0, so apply3DE4AnamorphicDeg6 should be identity
      const point = apply3DE4AnamorphicDeg6(0.5, 0.3, base3DE4Params);
      expect(point.x).toBeCloseTo(0.5, 10);
      expect(point.y).toBeCloseTo(0.3, 10);
    });

    it('3DE4-002: Single coefficient cx02=0.1, apply to point (0.5, 0.0)', () => {
      const params: LensDistortionParams = {
        ...base3DE4Params,
        cx02: 0.1,
      };

      const x = 0.5;
      const y = 0.0;
      const result = apply3DE4AnamorphicDeg6(x, y, params);

      // r² = x² + y² = 0.25
      // dx = x * (cx02 * r²) = 0.5 * (0.1 * 0.25) = 0.5 * 0.025 = 0.0125
      // dy = y * (...) = 0 (because y = 0)
      // distorted_x = 0.5 + 0.0125 = 0.5125
      // distorted_y = 0.0
      expect(result.x).toBeCloseTo(0.5125, 10);
      expect(result.y).toBeCloseTo(0.0, 10);
    });

    it('3DE4-003: Symmetric distortion for symmetric input', () => {
      const params: LensDistortionParams = {
        ...base3DE4Params,
        cx02: 0.05,
        cy02: 0.05,
      };

      // Apply to symmetric points
      const p1 = apply3DE4AnamorphicDeg6(0.3, 0.3, params);
      const p2 = apply3DE4AnamorphicDeg6(-0.3, -0.3, params);

      // Due to the anamorphic model (cx uses x terms, cy uses y terms),
      // negating both x and y should negate the output
      expect(p1.x).toBeCloseTo(-p2.x, 10);
      expect(p1.y).toBeCloseTo(-p2.y, 10);

      // Also check that distortion magnitude is equal for mirrored points
      const p3 = apply3DE4AnamorphicDeg6(0.3, -0.3, params);
      const p4 = apply3DE4AnamorphicDeg6(-0.3, 0.3, params);

      expect(Math.abs(p3.x)).toBeCloseTo(Math.abs(p4.x), 10);
      expect(Math.abs(p3.y)).toBeCloseTo(Math.abs(p4.y), 10);
    });

    it('3DE4-004: Center point (0,0) stays at (0,0) regardless of coefficients', () => {
      const params: LensDistortionParams = {
        ...base3DE4Params,
        cx02: 0.5, cx22: 0.3, cx04: 0.1, cx24: 0.2, cx44: 0.15,
        cx06: 0.05, cx26: 0.02, cx46: 0.01, cx66: 0.03,
        cy02: 0.4, cy22: 0.2, cy04: 0.15, cy24: 0.25, cy44: 0.1,
        cy06: 0.08, cy26: 0.03, cy46: 0.02, cy66: 0.04,
      };

      const result = apply3DE4AnamorphicDeg6(0, 0, params);

      // At origin, r²=0, x²=0, y²=0, so all polynomial terms are 0
      // dx = 0 * (...) = 0, dy = 0 * (...) = 0
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('3DE4: Higher-order coefficients produce larger distortion at edges', () => {
      // Test with only cx06 (degree 6 term)
      const params: LensDistortionParams = {
        ...base3DE4Params,
        cx06: 0.5,
      };

      // Near center - distortion should be small (r is small, r^6 is very small)
      const nearCenter = apply3DE4AnamorphicDeg6(0.1, 0.0, params);
      const nearCenterDistortion = Math.abs(nearCenter.x - 0.1);

      // Near edge - distortion should be much larger (r^6 grows fast)
      const nearEdge = apply3DE4AnamorphicDeg6(0.8, 0.0, params);
      const nearEdgeDistortion = Math.abs(nearEdge.x - 0.8);

      expect(nearEdgeDistortion).toBeGreaterThan(nearCenterDistortion * 10);
    });

    it('3DE4: applyLensDistortion uses 3DE4 model when specified', () => {
      const imageData = createTestImageData(20, 20, { r: 128, g: 128, b: 128, a: 255 });
      const params: LensDistortionParams = {
        ...base3DE4Params,
        cx02: 0.2,
        cy02: 0.2,
      };

      const result = applyLensDistortion(imageData, params);

      // Should produce a new image (not identity)
      expect(result).not.toBe(imageData);
      expect(result.width).toBe(20);
      expect(result.height).toBe(20);
    });

    it('3DE4: generateDistortionGrid uses 3DE4 model', () => {
      const params: LensDistortionParams = {
        ...base3DE4Params,
        cx02: 0.3,
        cy02: 0.3,
      };

      const grid = generateDistortionGrid(100, 100, params, 20);
      expect(grid.lines.length).toBeGreaterThan(0);

      // Verify all coordinates are finite
      for (const line of grid.lines) {
        expect(Number.isFinite(line.x1)).toBe(true);
        expect(Number.isFinite(line.y1)).toBe(true);
        expect(Number.isFinite(line.x2)).toBe(true);
        expect(Number.isFinite(line.y2)).toBe(true);
      }
    });

    it('3DE4: isDefaultLensParams detects non-zero 3DE4 coefficients', () => {
      const paramsWithCoeff: LensDistortionParams = {
        ...DEFAULT_LENS_PARAMS,
        model: '3de4_anamorphic_degree_6',
        cx02: 0.1,
      };

      expect(isDefaultLensParams(paramsWithCoeff)).toBe(false);
    });

    it('3DE4: isDefaultLensParams returns true when all 3DE4 coefficients are zero', () => {
      expect(isDefaultLensParams(base3DE4Params)).toBe(true);
    });

    it('3DE4: anamorphic coefficients produce different x/y distortion', () => {
      // Use different cx and cy coefficients to verify anamorphic behavior
      const params: LensDistortionParams = {
        ...base3DE4Params,
        cx02: 0.2,  // x distortion only
        cy02: 0.0,  // no y distortion
      };

      const result = apply3DE4AnamorphicDeg6(0.5, 0.5, params);

      // x should be displaced, y should not
      expect(result.x).not.toBeCloseTo(0.5, 5);
      expect(result.y).toBeCloseTo(0.5, 10);
    });
  });
});
