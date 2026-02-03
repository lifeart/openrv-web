/**
 * LuminanceVisualization Unit Tests
 *
 * Tests for the LuminanceVisualization component covering:
 * - Initialization and default state
 * - Mode control and cycling
 * - HSV visualization
 * - Random colorization
 * - Contour visualization
 * - State management
 * - FalseColor integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LuminanceVisualization,
  DEFAULT_LUMINANCE_VIS_STATE,
} from './LuminanceVisualization';
import { FalseColor } from './FalseColor';

// Helper to create test ImageData
function createTestImageData(
  width: number,
  height: number,
  fill?: { r: number; g: number; b: number; a: number }
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = fill.a;
    }
  }
  return new ImageData(data, width, height);
}

// Helper to create luminance gradient (horizontal)
function createLuminanceGradient(width: number, height: number = 1): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = Math.round((x / (width - 1)) * 255);
      const idx = (y * width + x) * 4;
      data[idx] = lum;
      data[idx + 1] = lum;
      data[idx + 2] = lum;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

// Helper to create a sharp-edge test image (left half dark, right half bright)
function createEdgeImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = x < width / 2 ? 50 : 200;
      data[idx] = lum;
      data[idx + 1] = lum;
      data[idx + 2] = lum;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('LuminanceVisualization', () => {
  let lumVis: LuminanceVisualization;
  let falseColor: FalseColor;

  beforeEach(() => {
    falseColor = new FalseColor();
    lumVis = new LuminanceVisualization(falseColor);
  });

  afterEach(() => {
    lumVis.dispose();
    falseColor.dispose();
  });

  describe('initialization', () => {
    it('LV-U001: default state is off', () => {
      expect(lumVis.getMode()).toBe('off');
    });

    it('LV-U002: default random band count is 16', () => {
      expect(lumVis.getState().randomBandCount).toBe(16);
    });

    it('LV-U003: default contour levels is 10', () => {
      expect(lumVis.getState().contourLevels).toBe(10);
    });

    it('LV-U004: default contour desaturate is true', () => {
      expect(lumVis.getState().contourDesaturate).toBe(true);
    });

    it('LV-U005: default contour line color is white', () => {
      expect(lumVis.getState().contourLineColor).toEqual([255, 255, 255]);
    });

    it('LV-U006: default state matches constant', () => {
      expect(lumVis.getState()).toEqual(DEFAULT_LUMINANCE_VIS_STATE);
    });
  });

  describe('mode control', () => {
    it('LV-U010: setMode changes mode', () => {
      lumVis.setMode('hsv');
      expect(lumVis.getMode()).toBe('hsv');
    });

    it('LV-U011: setMode emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setMode('hsv');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'hsv' })
      );
    });

    it('LV-U012: setMode emits modeChanged', () => {
      const handler = vi.fn();
      lumVis.on('modeChanged', handler);

      lumVis.setMode('contour');

      expect(handler).toHaveBeenCalledWith('contour');
    });

    it('LV-U013: setMode is idempotent', () => {
      lumVis.setMode('hsv');
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setMode('hsv');

      expect(handler).not.toHaveBeenCalled();
    });

    it('LV-U014: cycleMode goes Off -> FalseColor', () => {
      lumVis.cycleMode();
      expect(lumVis.getMode()).toBe('false-color');
    });

    it('LV-U015: cycleMode wraps Contour -> Off', () => {
      lumVis.setMode('contour');
      lumVis.cycleMode();
      expect(lumVis.getMode()).toBe('off');
    });

    it('LV-U016: cycleMode full cycle', () => {
      const modes = ['false-color', 'hsv', 'random-color', 'contour', 'off'] as const;
      for (const expected of modes) {
        lumVis.cycleMode();
        expect(lumVis.getMode()).toBe(expected);
      }
    });
  });

  describe('HSV visualization', () => {
    beforeEach(() => {
      lumVis.setMode('hsv');
    });

    it('LV-U020: black pixel maps to red hue region', () => {
      const img = createTestImageData(1, 1, { r: 0, g: 0, b: 0, a: 255 });
      lumVis.apply(img);
      // Hue 0 = red: expect high R, low G, low B
      expect(img.data[0]).toBeGreaterThan(200);
      expect(img.data[1]).toBeLessThan(50);
      expect(img.data[2]).toBeLessThan(50);
    });

    it('LV-U021: mid-grey maps to cyan hue region', () => {
      const img = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      // Luminance of (128,128,128) = ~128, so lum = 128/255 ~ 0.502
      // Hue = 0.502 * 300 ~ 150.6 degrees -> between green and cyan
      // At hue 150, we expect low R, high G, medium-high B
      expect(img.data[0]).toBeLessThan(50);
      expect(img.data[1]).toBeGreaterThan(200);
      expect(img.data[2]).toBeGreaterThan(100);
    });

    it('LV-U022: white pixel maps to magenta hue region', () => {
      const img = createTestImageData(1, 1, { r: 255, g: 255, b: 255, a: 255 });
      lumVis.apply(img);
      // Hue ~300 = magenta: expect high R, low G, high B
      expect(img.data[0]).toBeGreaterThan(200);
      expect(img.data[1]).toBeLessThan(50);
      expect(img.data[2]).toBeGreaterThan(200);
    });

    it('LV-U023: apply does nothing when mode is off', () => {
      lumVis.setMode('off');
      const img = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      expect(img.data[0]).toBe(128);
      expect(img.data[1]).toBe(128);
      expect(img.data[2]).toBe(128);
    });

    it('LV-U024: alpha channel preserved', () => {
      const img = createTestImageData(1, 1, { r: 100, g: 100, b: 100, a: 200 });
      lumVis.apply(img);
      expect(img.data[3]).toBe(200);
    });

    it('LV-U025: different luminances produce different hues', () => {
      const img = createLuminanceGradient(256);
      lumVis.apply(img);

      const colors = new Set<string>();
      for (let i = 0; i < 256; i++) {
        const idx = i * 4;
        colors.add(`${img.data[idx]},${img.data[idx + 1]},${img.data[idx + 2]}`);
      }
      expect(colors.size).toBeGreaterThan(50);
    });
  });

  describe('random colorization', () => {
    beforeEach(() => {
      lumVis.setMode('random-color');
    });

    it('LV-U030: same seed produces same palette', () => {
      const fc2 = new FalseColor();
      const lv2 = new LuminanceVisualization(fc2);
      lv2.setMode('random-color');

      const img1 = createLuminanceGradient(256);
      const img2 = createLuminanceGradient(256);

      lumVis.apply(img1);
      lv2.apply(img2);

      for (let i = 0; i < img1.data.length; i++) {
        expect(img1.data[i]).toBe(img2.data[i]);
      }

      lv2.dispose();
      fc2.dispose();
    });

    it('LV-U031: different seeds produce different palettes', () => {
      const img1 = createLuminanceGradient(256);
      lumVis.apply(img1);

      lumVis.reseedRandom();
      const img2 = createLuminanceGradient(256);
      lumVis.apply(img2);

      let differences = 0;
      for (let i = 0; i < img1.data.length; i += 4) {
        if (img1.data[i] !== img2.data[i] ||
            img1.data[i + 1] !== img2.data[i + 1] ||
            img1.data[i + 2] !== img2.data[i + 2]) {
          differences++;
        }
      }
      expect(differences).toBeGreaterThan(0);
    });

    it('LV-U033: band count clamps to 4-64', () => {
      lumVis.setRandomBandCount(2);
      expect(lumVis.getState().randomBandCount).toBe(4);

      lumVis.setRandomBandCount(100);
      expect(lumVis.getState().randomBandCount).toBe(64);
    });

    it('LV-U035: apply does nothing when mode is off', () => {
      lumVis.setMode('off');
      const img = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      expect(img.data[0]).toBe(128);
      expect(img.data[1]).toBe(128);
      expect(img.data[2]).toBe(128);
    });

    it('LV-U036: pixels in same band get same color', () => {
      lumVis.setRandomBandCount(16);
      // For 16 bands, each band covers 256/16 = 16 luminance values
      // Luminance 10 and 14 -> band floor(10/255*16) = band 0 and floor(14/255*16) = band 0
      const img1 = createTestImageData(1, 1, { r: 10, g: 10, b: 10, a: 255 });
      const img2 = createTestImageData(1, 1, { r: 14, g: 14, b: 14, a: 255 });
      lumVis.apply(img1);
      lumVis.apply(img2);

      expect(img1.data[0]).toBe(img2.data[0]);
      expect(img1.data[1]).toBe(img2.data[1]);
      expect(img1.data[2]).toBe(img2.data[2]);
    });

    it('LV-U037: adjacent bands have different colors', () => {
      lumVis.setRandomBandCount(16);
      // Band 0: lum near 0, Band 1: lum near 16/256
      // Use values that clearly fall into different bands
      const img1 = createTestImageData(1, 1, { r: 8, g: 8, b: 8, a: 255 });
      const img2 = createTestImageData(1, 1, { r: 24, g: 24, b: 24, a: 255 });
      lumVis.apply(img1);
      lumVis.apply(img2);

      const color1 = `${img1.data[0]},${img1.data[1]},${img1.data[2]}`;
      const color2 = `${img2.data[0]},${img2.data[1]},${img2.data[2]}`;
      expect(color1).not.toBe(color2);
    });
  });

  describe('contour visualization', () => {
    beforeEach(() => {
      lumVis.setMode('contour');
    });

    it('LV-U040: uniform image has no contour lines', () => {
      const img = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);

      // Interior pixel (5,5) should not be contour (uniform image)
      // With desaturate on, grey stays grey (mix of grey and grey)
      const idx = (5 * 10 + 5) * 4;
      expect(img.data[idx]).toBe(128);
      expect(img.data[idx + 1]).toBe(128);
      expect(img.data[idx + 2]).toBe(128);
    });

    it('LV-U041: sharp edge produces contour line', () => {
      const img = createEdgeImage(10, 10);
      lumVis.apply(img);

      // The pixel at the edge boundary (x=5, y=5)
      // should be the contour line color (white by default)
      const edgeIdx = (5 * 10 + 5) * 4; // x=5, right side of edge
      const interiorIdx = (5 * 10 + 8) * 4; // x=8, well inside right side

      // Edge pixel should be line color (white)
      const edgeColor = `${img.data[edgeIdx]},${img.data[edgeIdx + 1]},${img.data[edgeIdx + 2]}`;
      const interiorColor = `${img.data[interiorIdx]},${img.data[interiorIdx + 1]},${img.data[interiorIdx + 2]}`;

      expect(edgeColor).not.toBe(interiorColor);
    });

    it('LV-U043: level count clamps to 2-50', () => {
      lumVis.setContourLevels(1);
      expect(lumVis.getState().contourLevels).toBe(2);

      lumVis.setContourLevels(100);
      expect(lumVis.getState().contourLevels).toBe(50);
    });

    it('LV-U046: custom line color applies', () => {
      lumVis.setContourLineColor([255, 0, 0]);
      expect(lumVis.getState().contourLineColor).toEqual([255, 0, 0]);
    });

    it('LV-U047: more levels = more contour lines', () => {
      const img5 = createLuminanceGradient(256, 3);
      lumVis.setContourLevels(5);
      lumVis.apply(img5);

      let contourPixels5 = 0;
      for (let i = 0; i < img5.data.length; i += 4) {
        if (img5.data[i] === 255 && img5.data[i + 1] === 255 && img5.data[i + 2] === 255) {
          contourPixels5++;
        }
      }

      const img20 = createLuminanceGradient(256, 3);
      lumVis.setContourLevels(20);
      lumVis.apply(img20);

      let contourPixels20 = 0;
      for (let i = 0; i < img20.data.length; i += 4) {
        if (img20.data[i] === 255 && img20.data[i + 1] === 255 && img20.data[i + 2] === 255) {
          contourPixels20++;
        }
      }

      expect(contourPixels20).toBeGreaterThan(contourPixels5);
    });

    it('LV-U048: apply does nothing when mode is off', () => {
      lumVis.setMode('off');
      const img = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      lumVis.apply(img);
      expect(img.data[0]).toBe(128);
    });

    it('LV-U049: alpha channel preserved', () => {
      const img = createEdgeImage(10, 10);
      // Set alpha to non-255
      for (let i = 3; i < img.data.length; i += 4) {
        img.data[i] = 200;
      }
      lumVis.apply(img);

      for (let i = 3; i < img.data.length; i += 4) {
        expect(img.data[i]).toBe(200);
      }
    });

    it('LV-U044: desaturate reduces saturation of non-contour pixels', () => {
      // Create a colored image (red)
      const imgDesat = createTestImageData(3, 3, { r: 200, g: 50, b: 50, a: 255 });
      lumVis.setContourDesaturate(true);
      lumVis.apply(imgDesat);

      // Center pixel (1,1) is interior - should be desaturated
      const idx = (1 * 3 + 1) * 4;
      // With desaturate, pixel is mix of original and luminance-grey
      // Original: (200, 50, 50), luminance = 0.2126*200 + 0.7152*50 + 0.0722*50 ~ 81.9
      // Desaturated: ((200+82)/2, (50+82)/2, (50+82)/2) ~ (141, 66, 66)
      // The red channel should be pulled closer to the luminance
      expect(imgDesat.data[idx]).toBeLessThan(200);
    });

    it('LV-U045: desaturate=false preserves original color for non-contour pixels', () => {
      // Create uniform colored image (no edges, no contour lines)
      const img = createTestImageData(3, 3, { r: 200, g: 50, b: 50, a: 255 });
      lumVis.setContourDesaturate(false);
      lumVis.apply(img);

      // Center pixel should be unchanged (uniform, so no contour)
      const idx = (1 * 3 + 1) * 4;
      expect(img.data[idx]).toBe(200);
      expect(img.data[idx + 1]).toBe(50);
      expect(img.data[idx + 2]).toBe(50);
    });
  });

  describe('state management', () => {
    it('LV-U060: getState returns a copy', () => {
      const state = lumVis.getState();
      state.mode = 'hsv';
      expect(lumVis.getMode()).toBe('off');
    });

    it('LV-U061: setRandomBandCount emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setRandomBandCount(32);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ randomBandCount: 32 })
      );
    });

    it('LV-U062: setContourLevels emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setContourLevels(20);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ contourLevels: 20 })
      );
    });

    it('LV-U063: setContourDesaturate emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setContourDesaturate(false);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ contourDesaturate: false })
      );
    });

    it('LV-U064: setContourLineColor emits stateChanged', () => {
      const handler = vi.fn();
      lumVis.on('stateChanged', handler);

      lumVis.setContourLineColor([255, 0, 0]);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ contourLineColor: [255, 0, 0] })
      );
    });

    it('LV-U065: settings preserved across mode switches', () => {
      lumVis.setMode('random-color');
      lumVis.setRandomBandCount(32);

      lumVis.setMode('hsv');
      lumVis.setMode('random-color');

      expect(lumVis.getState().randomBandCount).toBe(32);
    });
  });

  describe('FalseColor integration', () => {
    it('LV-U070: false-color mode delegates to FalseColor component', () => {
      lumVis.setMode('false-color');

      const img = createTestImageData(1, 1, { r: 0, g: 0, b: 0, a: 255 });
      lumVis.apply(img);

      // Should match FalseColor standard palette for black (purple: 128, 0, 128)
      expect(img.data[0]).toBe(128);
      expect(img.data[1]).toBe(0);
      expect(img.data[2]).toBe(128);
    });

    it('LV-U071: switching to false-color enables FalseColor', () => {
      lumVis.setMode('false-color');
      expect(falseColor.isEnabled()).toBe(true);
    });

    it('LV-U072: switching away from false-color disables FalseColor', () => {
      lumVis.setMode('false-color');
      expect(falseColor.isEnabled()).toBe(true);

      lumVis.setMode('hsv');
      expect(falseColor.isEnabled()).toBe(false);
    });
  });
});
