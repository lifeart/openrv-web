/**
 * Unit tests for StereoAlignOverlay
 *
 * Tests alignment overlay rendering: grid, crosshair, difference, and edge detection.
 */

import { describe, it, expect } from 'vitest';
import {
  applyAlignmentOverlay,
  renderGrid,
  renderCrosshair,
  renderDifference,
  renderEdgeOverlay,
} from './StereoAlignOverlay';

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
        data[idx] = 100;
        data[idx + 1] = 100;
        data[idx + 2] = 100;
        data[idx + 3] = 255;
      }
    }
  }
  return new ImageData(data, width, height);
}

function getPixel(img: ImageData, x: number, y: number): [number, number, number, number] {
  const idx = (y * img.width + x) * 4;
  return [img.data[idx]!, img.data[idx + 1]!, img.data[idx + 2]!, img.data[idx + 3]!];
}

describe('StereoAlignOverlay', () => {
  describe('grid', () => {
    it('SAL-U001: Grid overlay adds lines at 64px intervals', () => {
      const source = createTestImageData(128, 128, () => [50, 50, 50, 255]);
      const result = renderGrid(source);

      // Pixel at x=64 should be brighter than source (grid line)
      const gridPixel = getPixel(result, 64, 10);
      const srcPixel = getPixel(source, 64, 10);
      expect(gridPixel[0]).toBeGreaterThan(srcPixel[0]);
    });

    it('SAL-U002: Grid lines have correct color (white 30% opacity)', () => {
      const source = createTestImageData(128, 128, () => [0, 0, 0, 255]);
      const result = renderGrid(source);

      // On black background, white at 30% = ~77
      const gridPixel = getPixel(result, 64, 10);
      expect(gridPixel[0]).toBeCloseTo(77, -1); // roughly 255 * 0.3
    });

    it('SAL-U003: Grid overlay does not modify non-grid pixel data', () => {
      const source = createTestImageData(128, 128, () => [100, 100, 100, 255]);
      const result = renderGrid(source);

      // Pixel not on a grid line should be unchanged
      const pixel = getPixel(result, 10, 10);
      expect(pixel).toEqual([100, 100, 100, 255]);
    });
  });

  describe('crosshair', () => {
    it('SAL-U004: Crosshair draws at image center', () => {
      const source = createTestImageData(100, 100, () => [0, 0, 0, 255]);
      const result = renderCrosshair(source);
      const cx = Math.floor(100 / 2);
      const cy = Math.floor(100 / 2);

      // Center pixel should have yellow component
      const centerPixel = getPixel(result, cx, cy);
      expect(centerPixel[0]).toBeGreaterThan(100); // R component (yellow)
      expect(centerPixel[1]).toBeGreaterThan(100); // G component (yellow)
    });

    it('SAL-U005: Crosshair uses yellow color', () => {
      const source = createTestImageData(100, 100, () => [0, 0, 0, 255]);
      const result = renderCrosshair(source);
      const cx = Math.floor(100 / 2);

      // Vertical line pixel (not at center intersection)
      const pixel = getPixel(result, cx, 10);
      // Yellow at 60% alpha on black: R=153, G=153, B=0
      expect(pixel[0]).toBeGreaterThan(100); // Red
      expect(pixel[1]).toBeGreaterThan(100); // Green
      expect(pixel[2]).toBeLessThan(50); // Blue should be low
    });

    it('SAL-U006: Crosshair extends full width and height', () => {
      const source = createTestImageData(100, 100, () => [0, 0, 0, 255]);
      const result = renderCrosshair(source);
      const cx = Math.floor(100 / 2);
      const cy = Math.floor(100 / 2);

      // Vertical line at x=cx, y=0 and y=99
      expect(getPixel(result, cx, 0)[0]).toBeGreaterThan(50);
      expect(getPixel(result, cx, 99)[0]).toBeGreaterThan(50);

      // Horizontal line at y=cy, x=0 and x=99
      expect(getPixel(result, 0, cy)[0]).toBeGreaterThan(50);
      expect(getPixel(result, 99, cy)[0]).toBeGreaterThan(50);
    });
  });

  describe('difference', () => {
    it('SAL-U010: Identical images produce all-black output', () => {
      const left = createTestImageData(10, 10, () => [100, 150, 200, 255]);
      const right = createTestImageData(10, 10, () => [100, 150, 200, 255]);
      const result = renderDifference(left, right);

      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          const p = getPixel(result, x, y);
          expect(p[0]).toBe(0);
          expect(p[1]).toBe(0);
          expect(p[2]).toBe(0);
          expect(p[3]).toBe(255);
        }
      }
    });

    it('SAL-U011: Different images produce non-zero output', () => {
      const left = createTestImageData(10, 10, () => [200, 100, 50, 255]);
      const right = createTestImageData(10, 10, () => [100, 200, 150, 255]);
      const result = renderDifference(left, right);

      const pixel = getPixel(result, 5, 5);
      expect(pixel[0]).toBe(100); // |200-100|
      expect(pixel[1]).toBe(100); // |100-200|
      expect(pixel[2]).toBe(100); // |50-150|
    });

    it('SAL-U012: Difference is per-channel absolute value', () => {
      const left = createTestImageData(4, 4, () => [50, 200, 30, 255]);
      const right = createTestImageData(4, 4, () => [100, 50, 90, 255]);
      const result = renderDifference(left, right);

      const pixel = getPixel(result, 0, 0);
      expect(pixel[0]).toBe(50);  // |50-100|
      expect(pixel[1]).toBe(150); // |200-50|
      expect(pixel[2]).toBe(60);  // |30-90|
    });

    it('SAL-U013: Result alpha is always 255', () => {
      const left = createTestImageData(4, 4, () => [0, 0, 0, 128]);
      const right = createTestImageData(4, 4, () => [0, 0, 0, 64]);
      const result = renderDifference(left, right);

      const pixel = getPixel(result, 0, 0);
      expect(pixel[3]).toBe(255);
    });
  });

  describe('edges', () => {
    it('SAL-U020: Edge detection produces output', () => {
      // Create image with a sharp edge
      const left = createTestImageData(20, 20, (x) =>
        x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      );
      const right = createTestImageData(20, 20, () => [100, 100, 100, 255]);
      const result = renderEdgeOverlay(left, right);

      expect(result.width).toBe(20);
      expect(result.height).toBe(20);
    });

    it('SAL-U021: Left eye edges shown in cyan', () => {
      // Strong vertical edge on left side
      const left = createTestImageData(20, 20, (x) =>
        x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      );
      const right = createTestImageData(20, 20, () => [100, 100, 100, 255]); // Uniform = no edges
      const result = renderEdgeOverlay(left, right);

      // Look for cyan pixels near the edge at x=10
      let foundCyan = false;
      for (let y = 2; y < 18; y++) {
        const p = getPixel(result, 10, y);
        if (p[0] === 0 && p[1] === 255 && p[2] === 255) {
          foundCyan = true;
          break;
        }
      }
      expect(foundCyan).toBe(true);
    });

    it('SAL-U022: Right eye edges shown in red', () => {
      const left = createTestImageData(20, 20, () => [100, 100, 100, 255]); // Uniform = no edges
      const right = createTestImageData(20, 20, (x) =>
        x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      );
      const result = renderEdgeOverlay(left, right);

      let foundRed = false;
      for (let y = 2; y < 18; y++) {
        const p = getPixel(result, 10, y);
        if (p[0] === 255 && p[1] === 0 && p[2] === 0) {
          foundRed = true;
          break;
        }
      }
      expect(foundRed).toBe(true);
    });

    it('SAL-U023: Overlapping edges shown in white', () => {
      // Both eyes have an edge at the same position
      const left = createTestImageData(20, 20, (x) =>
        x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      );
      const right = createTestImageData(20, 20, (x) =>
        x < 10 ? [0, 0, 0, 255] : [255, 255, 255, 255]
      );
      const result = renderEdgeOverlay(left, right);

      let foundWhite = false;
      for (let y = 2; y < 18; y++) {
        const p = getPixel(result, 10, y);
        if (p[0] === 255 && p[1] === 255 && p[2] === 255) {
          foundWhite = true;
          break;
        }
      }
      expect(foundWhite).toBe(true);
    });
  });

  describe('applyAlignmentOverlay', () => {
    it('SAL-U030: Off mode returns unmodified image', () => {
      const source = createTestImageData(10, 10);
      const result = applyAlignmentOverlay(source, 'off');
      expect(result).toBe(source); // Same reference
    });

    it('SAL-U031: All modes return ImageData with same dimensions', () => {
      const source = createTestImageData(128, 128);
      const left = createTestImageData(64, 128);
      const right = createTestImageData(64, 128);

      const gridResult = applyAlignmentOverlay(source, 'grid');
      expect(gridResult.width).toBe(128);
      expect(gridResult.height).toBe(128);

      const crosshairResult = applyAlignmentOverlay(source, 'crosshair');
      expect(crosshairResult.width).toBe(128);
      expect(crosshairResult.height).toBe(128);

      const diffResult = applyAlignmentOverlay(source, 'difference', left, right);
      expect(diffResult.width).toBe(64);
      expect(diffResult.height).toBe(128);

      const edgeResult = applyAlignmentOverlay(source, 'edges', left, right);
      expect(edgeResult.width).toBe(64);
      expect(edgeResult.height).toBe(128);
    });
  });
});
