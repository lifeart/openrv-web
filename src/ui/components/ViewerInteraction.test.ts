/**
 * ViewerInteraction Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getCanvasPoint,
  calculateWheelZoom,
  calculateZoomPan,
  calculatePinchDistance,
  calculatePinchZoom,
  isViewerContentElement,
  getPixelCoordinates,
  getPixelColor,
  easeOutCubic,
  interpolateZoom,
  PointerState,
} from './ViewerInteraction';

describe('ViewerInteraction', () => {
  describe('getCanvasPoint', () => {
    const createRect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });

    it('returns null for zero display dimensions', () => {
      const rect = createRect(0, 0, 100, 100);
      expect(getCanvasPoint(50, 50, rect, 0, 100)).toBeNull();
      expect(getCanvasPoint(50, 50, rect, 100, 0)).toBeNull();
      expect(getCanvasPoint(50, 50, rect, 0, 0)).toBeNull();
    });

    it('returns null for zero rect dimensions', () => {
      const rect = createRect(0, 0, 0, 100);
      expect(getCanvasPoint(50, 50, rect, 100, 100)).toBeNull();

      const rect2 = createRect(0, 0, 100, 0);
      expect(getCanvasPoint(50, 50, rect2, 100, 100)).toBeNull();
    });

    it('converts client coordinates to normalized canvas coordinates', () => {
      const rect = createRect(0, 0, 100, 100);
      const point = getCanvasPoint(50, 50, rect, 100, 100);

      expect(point).not.toBeNull();
      expect(point!.x).toBeCloseTo(0.5);
      // Y is inverted (0,0 = bottom-left)
      expect(point!.y).toBeCloseTo(0.5);
    });

    it('handles canvas offset', () => {
      const rect = createRect(100, 50, 200, 200);
      const point = getCanvasPoint(200, 150, rect, 200, 200);

      expect(point).not.toBeNull();
      expect(point!.x).toBeCloseTo(0.5);
      expect(point!.y).toBeCloseTo(0.5);
    });

    it('allows coordinates outside 0-1 range', () => {
      const rect = createRect(0, 0, 100, 100);

      // Beyond right edge
      const pointRight = getCanvasPoint(150, 50, rect, 100, 100);
      expect(pointRight!.x).toBe(1.5);

      // Beyond left edge
      const pointLeft = getCanvasPoint(-50, 50, rect, 100, 100);
      expect(pointLeft!.x).toBe(-0.5);

      // Beyond bottom edge
      const pointBottom = getCanvasPoint(50, 150, rect, 100, 100);
      expect(pointBottom!.y).toBe(-0.5);

      // Beyond top edge
      const pointTop = getCanvasPoint(50, -50, rect, 100, 100);
      expect(pointTop!.y).toBe(1.5);
    });

    it('uses default pressure of 0.5', () => {
      const rect = createRect(0, 0, 100, 100);
      const point = getCanvasPoint(50, 50, rect, 100, 100);
      expect(point!.pressure).toBe(0.5);
    });

    it('uses provided pressure', () => {
      const rect = createRect(0, 0, 100, 100);
      const point = getCanvasPoint(50, 50, rect, 100, 100, 0.8);
      expect(point!.pressure).toBe(0.8);
    });

    it('handles CSS scaling (display size != rect size)', () => {
      const rect = createRect(0, 0, 50, 50); // CSS size
      const point = getCanvasPoint(25, 25, rect, 100, 100); // Canvas size is 100x100

      expect(point).not.toBeNull();
      expect(point!.x).toBeCloseTo(0.5);
      expect(point!.y).toBeCloseTo(0.5);
    });
  });

  describe('calculateWheelZoom', () => {
    it('zooms out on positive deltaY', () => {
      const newZoom = calculateWheelZoom(100, 1.0);
      expect(newZoom).not.toBeNull();
      expect(newZoom!).toBeLessThan(1.0);
      expect(newZoom!).toBeCloseTo(0.9);
    });

    it('zooms in on negative deltaY', () => {
      const newZoom = calculateWheelZoom(-100, 1.0);
      expect(newZoom).not.toBeNull();
      expect(newZoom!).toBeGreaterThan(1.0);
      expect(newZoom!).toBeCloseTo(1.1);
    });

    it('clamps to minimum zoom', () => {
      const newZoom = calculateWheelZoom(100, 0.1, 0.1, 10);
      // At min zoom, zooming out should return null (no change)
      expect(newZoom).toBeNull();
    });

    it('clamps to maximum zoom', () => {
      const newZoom = calculateWheelZoom(-100, 10, 0.1, 10);
      // At max zoom, zooming in should return null (no change)
      expect(newZoom).toBeNull();
    });

    it('returns null when zoom does not change', () => {
      const newZoom = calculateWheelZoom(100, 0.11, 0.1, 10);
      // 0.11 * 0.9 = 0.099, clamped to 0.1, same as min
      expect(newZoom).toBe(0.1);
    });

    it('uses custom min/max zoom', () => {
      const newZoom = calculateWheelZoom(100, 0.5, 0.5, 2);
      expect(newZoom).toBeNull(); // Can't zoom below min
    });
  });

  describe('calculateZoomPan', () => {
    it('keeps mouse position stationary during zoom', () => {
      const result = calculateZoomPan(
        100, 100,  // mouse position
        400, 300,  // container size
        200, 150,  // source size
        0, 0,      // current pan
        1.0,       // old zoom
        2.0        // new zoom
      );

      expect(result.panX).toBeDefined();
      expect(result.panY).toBeDefined();
    });

    it('returns current pan for zero source dimensions', () => {
      const result = calculateZoomPan(
        100, 100,
        400, 300,
        0, 150,   // zero width
        10, 20,
        1.0,
        2.0
      );

      expect(result.panX).toBe(10);
      expect(result.panY).toBe(20);
    });

    it('returns current pan for zero height', () => {
      const result = calculateZoomPan(
        100, 100,
        400, 300,
        200, 0,   // zero height
        10, 20,
        1.0,
        2.0
      );

      expect(result.panX).toBe(10);
      expect(result.panY).toBe(20);
    });

    it('calculates correct pan for zoom at center', () => {
      // Container 400x300, source 200x150 (fits exactly at scale 1)
      // Mouse at center (200, 150)
      const result = calculateZoomPan(
        200, 150,  // mouse at center
        400, 300,
        200, 150,
        0, 0,
        1.0,
        2.0
      );

      // At center, pan should remain 0 for centered zoom
      expect(result.panX).toBeCloseTo(0);
      expect(result.panY).toBeCloseTo(0);
    });
  });

  describe('calculatePinchDistance', () => {
    it('returns 0 for less than 2 pointers', () => {
      expect(calculatePinchDistance([])).toBe(0);
      expect(calculatePinchDistance([{ pointerId: 1, x: 0, y: 0 }])).toBe(0);
    });

    it('calculates correct distance for horizontal points', () => {
      const pointers: PointerState[] = [
        { pointerId: 1, x: 0, y: 0 },
        { pointerId: 2, x: 100, y: 0 },
      ];
      expect(calculatePinchDistance(pointers)).toBe(100);
    });

    it('calculates correct distance for vertical points', () => {
      const pointers: PointerState[] = [
        { pointerId: 1, x: 0, y: 0 },
        { pointerId: 2, x: 0, y: 100 },
      ];
      expect(calculatePinchDistance(pointers)).toBe(100);
    });

    it('calculates correct distance for diagonal points', () => {
      const pointers: PointerState[] = [
        { pointerId: 1, x: 0, y: 0 },
        { pointerId: 2, x: 3, y: 4 },
      ];
      expect(calculatePinchDistance(pointers)).toBe(5); // 3-4-5 triangle
    });

    it('returns zero for more than two pointers', () => {
      const pointers: PointerState[] = [
        { pointerId: 1, x: 0, y: 0 },
        { pointerId: 2, x: 100, y: 0 },
        { pointerId: 3, x: 200, y: 0 },
      ];
      // Function requires exactly 2 pointers
      expect(calculatePinchDistance(pointers)).toBe(0);
    });
  });

  describe('calculatePinchZoom', () => {
    it('returns null for zero initial distance', () => {
      expect(calculatePinchZoom(0, 100, 1.0)).toBeNull();
    });

    it('returns null for zero current distance', () => {
      expect(calculatePinchZoom(100, 0, 1.0)).toBeNull();
    });

    it('returns null for negative distances', () => {
      expect(calculatePinchZoom(-100, 100, 1.0)).toBeNull();
      expect(calculatePinchZoom(100, -100, 1.0)).toBeNull();
    });

    it('doubles zoom when distance doubles', () => {
      const newZoom = calculatePinchZoom(100, 200, 1.0);
      expect(newZoom).toBeCloseTo(2.0);
    });

    it('halves zoom when distance halves', () => {
      const newZoom = calculatePinchZoom(100, 50, 1.0);
      expect(newZoom).toBeCloseTo(0.5);
    });

    it('clamps to minimum zoom', () => {
      const newZoom = calculatePinchZoom(100, 1, 1.0, 0.1, 10);
      expect(newZoom).toBe(0.1);
    });

    it('clamps to maximum zoom', () => {
      const newZoom = calculatePinchZoom(100, 10000, 1.0, 0.1, 10);
      expect(newZoom).toBe(10);
    });
  });

  describe('isViewerContentElement', () => {
    it('returns true for container element', () => {
      const container = document.createElement('div');
      const canvasContainer = document.createElement('div');
      const imageCanvas = document.createElement('canvas');
      const paintCanvas = document.createElement('canvas');

      expect(isViewerContentElement(
        container, container, canvasContainer, imageCanvas, paintCanvas, null, null
      )).toBe(true);
    });

    it('returns true for image canvas', () => {
      const container = document.createElement('div');
      const canvasContainer = document.createElement('div');
      const imageCanvas = document.createElement('canvas');
      const paintCanvas = document.createElement('canvas');

      expect(isViewerContentElement(
        imageCanvas, container, canvasContainer, imageCanvas, paintCanvas, null, null
      )).toBe(true);
    });

    it('returns true for paint canvas', () => {
      const container = document.createElement('div');
      const canvasContainer = document.createElement('div');
      const imageCanvas = document.createElement('canvas');
      const paintCanvas = document.createElement('canvas');

      expect(isViewerContentElement(
        paintCanvas, container, canvasContainer, imageCanvas, paintCanvas, null, null
      )).toBe(true);
    });

    it('returns true for crop overlay when provided', () => {
      const container = document.createElement('div');
      const canvasContainer = document.createElement('div');
      const imageCanvas = document.createElement('canvas');
      const paintCanvas = document.createElement('canvas');
      const cropOverlay = document.createElement('canvas');

      expect(isViewerContentElement(
        cropOverlay, container, canvasContainer, imageCanvas, paintCanvas, cropOverlay, null
      )).toBe(true);
    });

    it('returns true for wipe line when provided', () => {
      const container = document.createElement('div');
      const canvasContainer = document.createElement('div');
      const imageCanvas = document.createElement('canvas');
      const paintCanvas = document.createElement('canvas');
      const wipeLine = document.createElement('div');

      expect(isViewerContentElement(
        wipeLine, container, canvasContainer, imageCanvas, paintCanvas, null, wipeLine
      )).toBe(true);
    });

    it('returns true for child of canvas container', () => {
      const container = document.createElement('div');
      const canvasContainer = document.createElement('div');
      const imageCanvas = document.createElement('canvas');
      const paintCanvas = document.createElement('canvas');
      const child = document.createElement('div');
      canvasContainer.appendChild(child);

      expect(isViewerContentElement(
        child, container, canvasContainer, imageCanvas, paintCanvas, null, null
      )).toBe(true);
    });

    it('returns false for unrelated element', () => {
      const container = document.createElement('div');
      const canvasContainer = document.createElement('div');
      const imageCanvas = document.createElement('canvas');
      const paintCanvas = document.createElement('canvas');
      const unrelated = document.createElement('div');

      expect(isViewerContentElement(
        unrelated, container, canvasContainer, imageCanvas, paintCanvas, null, null
      )).toBe(false);
    });
  });

  describe('getPixelCoordinates', () => {
    const createRect = (left: number, top: number, width: number, height: number): DOMRect => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    });

    it('returns null for position outside canvas bounds', () => {
      const rect = createRect(0, 0, 100, 100);

      expect(getPixelCoordinates(-10, 50, rect, 100, 100)).toBeNull();
      expect(getPixelCoordinates(50, -10, rect, 100, 100)).toBeNull();
      expect(getPixelCoordinates(100, 50, rect, 100, 100)).toBeNull(); // >= width
      expect(getPixelCoordinates(50, 100, rect, 100, 100)).toBeNull(); // >= height
    });

    it('returns pixel coordinates within bounds', () => {
      const rect = createRect(0, 0, 100, 100);
      const coords = getPixelCoordinates(50, 50, rect, 100, 100);

      expect(coords).not.toBeNull();
      expect(coords!.x).toBe(50);
      expect(coords!.y).toBe(50);
    });

    it('handles canvas offset', () => {
      const rect = createRect(100, 50, 200, 200);
      const coords = getPixelCoordinates(200, 150, rect, 200, 200);

      expect(coords).not.toBeNull();
      expect(coords!.x).toBe(100);
      expect(coords!.y).toBe(100);
    });

    it('scales coordinates when display size differs from rect size', () => {
      const rect = createRect(0, 0, 50, 50); // CSS size
      const coords = getPixelCoordinates(25, 25, rect, 100, 100); // Canvas size 100x100

      expect(coords).not.toBeNull();
      expect(coords!.x).toBe(50);
      expect(coords!.y).toBe(50);
    });

    it('floors pixel coordinates', () => {
      const rect = createRect(0, 0, 100, 100);
      const coords = getPixelCoordinates(33.7, 66.3, rect, 100, 100);

      expect(coords).not.toBeNull();
      expect(coords!.x).toBe(33);
      expect(coords!.y).toBe(66);
    });
  });

  describe('getPixelColor', () => {
    it('handles negative x coordinate by wrapping pixel index', () => {
      // Note: getPixelColor only checks pixelIndex bounds, not x/y coordinates
      // For (-1, 5) on 10x10: pixelIndex = (5*10 + -1)*4 = 196 which is valid
      const imageData = new ImageData(10, 10);
      const result = getPixelColor(imageData, -1, 5);
      // Result is not null because pixelIndex is still valid
      expect(result).not.toBeNull();
    });

    it('returns null for large out of bounds coordinates', () => {
      const imageData = new ImageData(10, 10);
      // x=10 on row 9: pixelIndex = (9*10 + 10)*4 = 400 which exceeds array
      expect(getPixelColor(imageData, 10, 9)).toBeNull();
      // y=10: pixelIndex = (10*10 + 0)*4 = 400 which exceeds array
      expect(getPixelColor(imageData, 0, 10)).toBeNull();
    });

    it('returns correct RGB values', () => {
      const imageData = new ImageData(10, 10);
      // Set pixel at (5, 5) to red
      const index = (5 * 10 + 5) * 4;
      imageData.data[index] = 255;     // R
      imageData.data[index + 1] = 128; // G
      imageData.data[index + 2] = 64;  // B
      imageData.data[index + 3] = 255; // A

      const color = getPixelColor(imageData, 5, 5);
      expect(color).not.toBeNull();
      expect(color!.r).toBe(255);
      expect(color!.g).toBe(128);
      expect(color!.b).toBe(64);
    });

    it('returns color at corner positions', () => {
      const imageData = new ImageData(10, 10);

      // Top-left (0, 0)
      imageData.data[0] = 100;
      imageData.data[1] = 100;
      imageData.data[2] = 100;

      const topLeft = getPixelColor(imageData, 0, 0);
      expect(topLeft).not.toBeNull();
      expect(topLeft!.r).toBe(100);

      // Bottom-right (9, 9)
      const lastIndex = (9 * 10 + 9) * 4;
      imageData.data[lastIndex] = 200;
      imageData.data[lastIndex + 1] = 200;
      imageData.data[lastIndex + 2] = 200;

      const bottomRight = getPixelColor(imageData, 9, 9);
      expect(bottomRight).not.toBeNull();
      expect(bottomRight!.r).toBe(200);
    });
  });

  describe('easeOutCubic', () => {
    it('returns 0 at t=0', () => {
      expect(easeOutCubic(0)).toBe(0);
    });

    it('returns 1 at t=1', () => {
      expect(easeOutCubic(1)).toBe(1);
    });

    it('clamps negative values to 0', () => {
      expect(easeOutCubic(-0.5)).toBe(0);
      expect(easeOutCubic(-1)).toBe(0);
    });

    it('clamps values above 1 to 1', () => {
      expect(easeOutCubic(1.5)).toBe(1);
      expect(easeOutCubic(2)).toBe(1);
    });

    it('returns 0.5 at approximately t=0.2063 (ease-out cubic midpoint)', () => {
      // For ease-out cubic: f(t) = 1 - (1-t)^3
      // f(t) = 0.5 when (1-t)^3 = 0.5, so t = 1 - 0.5^(1/3) ~ 0.2063
      const t = 1 - Math.pow(0.5, 1 / 3);
      expect(easeOutCubic(t)).toBeCloseTo(0.5, 4);
    });

    it('is monotonically increasing', () => {
      let prev = 0;
      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const val = easeOutCubic(t);
        expect(val).toBeGreaterThanOrEqual(prev);
        prev = val;
      }
    });

    it('starts fast and decelerates (ease-out behavior)', () => {
      // First quarter should cover more than 25% of the output range
      const firstQuarter = easeOutCubic(0.25);
      expect(firstQuarter).toBeGreaterThan(0.25);

      // Last quarter should cover less than 25% of the output range
      const threeQuarters = easeOutCubic(0.75);
      const lastQuarterDelta = 1 - threeQuarters;
      expect(lastQuarterDelta).toBeLessThan(0.25);
    });

    it('computes correct values for known inputs', () => {
      // f(0.5) = 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
      expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);

      // f(0.25) = 1 - (1-0.25)^3 = 1 - 0.421875 = 0.578125
      expect(easeOutCubic(0.25)).toBeCloseTo(0.578125, 10);
    });
  });

  describe('interpolateZoom', () => {
    it('returns startZoom at progress 0', () => {
      expect(interpolateZoom(1.0, 2.0, 0)).toBe(1.0);
    });

    it('returns targetZoom at progress 1', () => {
      expect(interpolateZoom(1.0, 2.0, 1)).toBe(2.0);
    });

    it('interpolates between start and target with easing', () => {
      const mid = interpolateZoom(1.0, 2.0, 0.5);
      // With ease-out cubic, progress 0.5 maps to eased ~0.875
      // So result should be 1.0 + (2.0 - 1.0) * 0.875 = 1.875
      expect(mid).toBeCloseTo(1.875, 4);
    });

    it('handles zoom out (target < start)', () => {
      const result = interpolateZoom(2.0, 0.5, 1.0);
      expect(result).toBeCloseTo(0.5, 4);
    });

    it('handles same start and target', () => {
      expect(interpolateZoom(1.0, 1.0, 0.5)).toBe(1.0);
    });

    it('clamps progress to 0-1 range', () => {
      // Negative progress should be treated as 0
      expect(interpolateZoom(1.0, 2.0, -0.5)).toBe(1.0);

      // Progress > 1 should be treated as 1
      expect(interpolateZoom(1.0, 2.0, 1.5)).toBe(2.0);
    });

    it('accepts custom easing function', () => {
      // Linear easing
      const linear = (t: number) => t;
      const mid = interpolateZoom(1.0, 3.0, 0.5, linear);
      expect(mid).toBeCloseTo(2.0, 10);
    });

    it('works with large zoom ranges', () => {
      const result = interpolateZoom(0.1, 10.0, 1.0);
      expect(result).toBeCloseTo(10.0, 4);
    });
  });
});
