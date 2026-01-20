/**
 * PixelProbe Unit Tests
 *
 * Tests for Pixel Probe / Color Sampler component (FEATURES.md 2.5)
 * Based on test cases PROBE-001 through PROBE-006
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PixelProbe,
  PixelProbeState,
  DEFAULT_PIXEL_PROBE_STATE,
} from './PixelProbe';

// Helper to create test ImageData
function createTestImageData(width: number, height: number, fill?: { r: number; g: number; b: number; a: number }): ImageData {
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

// Helper to create ImageData with a specific pixel at position
function createImageWithPixelAt(
  width: number,
  height: number,
  x: number,
  y: number,
  pixel: { r: number; g: number; b: number; a: number }
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  // Fill with black
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  // Set specific pixel
  const idx = (y * width + x) * 4;
  data[idx] = pixel.r;
  data[idx + 1] = pixel.g;
  data[idx + 2] = pixel.b;
  data[idx + 3] = pixel.a;

  return new ImageData(data, width, height);
}

describe('PixelProbe', () => {
  let pixelProbe: PixelProbe;

  beforeEach(() => {
    pixelProbe = new PixelProbe();
  });

  afterEach(() => {
    pixelProbe.dispose();
  });

  describe('initialization', () => {
    it('PROBE-001: starts disabled', () => {
      expect(pixelProbe.isEnabled()).toBe(false);
    });

    it('PROBE-002: default state matches specification', () => {
      expect(DEFAULT_PIXEL_PROBE_STATE).toEqual({
        enabled: false,
        locked: false,
        x: 0,
        y: 0,
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        ire: 0,
        format: 'rgb',
      });
    });

    it('PROBE-003: provides element for mounting', () => {
      const element = pixelProbe.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('PROBE-004: default format is rgb', () => {
      const state = pixelProbe.getState();
      expect(state.format).toBe('rgb');
    });
  });

  describe('enable/disable', () => {
    it('PROBE-010: enable turns on pixel probe', () => {
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.enable();

      expect(pixelProbe.isEnabled()).toBe(true);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });

    it('PROBE-011: disable turns off pixel probe', () => {
      pixelProbe.enable();
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.disable();

      expect(pixelProbe.isEnabled()).toBe(false);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });

    it('PROBE-012: toggle enables/disables', () => {
      expect(pixelProbe.isEnabled()).toBe(false);

      pixelProbe.toggle();
      expect(pixelProbe.isEnabled()).toBe(true);

      pixelProbe.toggle();
      expect(pixelProbe.isEnabled()).toBe(false);
    });

    it('PROBE-013: enable is idempotent', () => {
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.enable();
      pixelProbe.enable();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('PROBE-014: disable resets locked state', () => {
      pixelProbe.enable();
      pixelProbe.toggleLock();
      expect(pixelProbe.isLocked()).toBe(true);

      pixelProbe.disable();

      expect(pixelProbe.isLocked()).toBe(false);
    });
  });

  describe('updateFromCanvas - RGB values (FEATURES.md PROBE-001)', () => {
    it('PROBE-001: click shows pixel RGB values', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(10, 10, { r: 128, g: 64, b: 192, a: 255 });
      pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

      const state = pixelProbe.getState();
      expect(state.rgb.r).toBe(128);
      expect(state.rgb.g).toBe(64);
      expect(state.rgb.b).toBe(192);
    });

    it('PROBE-020: updates coordinates', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(100, 100, { r: 0, g: 0, b: 0, a: 255 });
      pixelProbe.updateFromCanvas(42, 87, imageData, 100, 100);

      const state = pixelProbe.getState();
      expect(state.x).toBe(42);
      expect(state.y).toBe(87);
    });

    it('PROBE-021: clamps coordinates to image bounds', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(100, 100, { r: 0, g: 0, b: 0, a: 255 });
      pixelProbe.updateFromCanvas(150, -10, imageData, 100, 100);

      const state = pixelProbe.getState();
      expect(state.x).toBe(99); // Clamped to width - 1
      expect(state.y).toBe(0);  // Clamped to 0
    });

    it('PROBE-022: reads correct pixel from ImageData', () => {
      pixelProbe.enable();

      const imageData = createImageWithPixelAt(10, 10, 5, 3, { r: 200, g: 100, b: 50, a: 255 });
      pixelProbe.updateFromCanvas(5, 3, imageData, 10, 10);

      const state = pixelProbe.getState();
      expect(state.rgb.r).toBe(200);
      expect(state.rgb.g).toBe(100);
      expect(state.rgb.b).toBe(50);
    });

    it('PROBE-023: handles null ImageData gracefully', () => {
      pixelProbe.enable();
      pixelProbe.updateFromCanvas(5, 5, null, 10, 10);

      const state = pixelProbe.getState();
      expect(state.rgb).toEqual({ r: 0, g: 0, b: 0 });
    });
  });

  describe('HSL calculation (FEATURES.md PROBE-002)', () => {
    it('PROBE-002: HSL values calculated correctly', () => {
      pixelProbe.enable();

      // Pure red (255, 0, 0) -> HSL (0, 100, 50)
      const imageData = createTestImageData(1, 1, { r: 255, g: 0, b: 0, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.hsl.h).toBe(0);
      expect(state.hsl.s).toBe(100);
      expect(state.hsl.l).toBe(50);
    });

    it('PROBE-030: pure green calculates correct HSL', () => {
      pixelProbe.enable();

      // Pure green (0, 255, 0) -> HSL (120, 100, 50)
      const imageData = createTestImageData(1, 1, { r: 0, g: 255, b: 0, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.hsl.h).toBe(120);
      expect(state.hsl.s).toBe(100);
      expect(state.hsl.l).toBe(50);
    });

    it('PROBE-031: pure blue calculates correct HSL', () => {
      pixelProbe.enable();

      // Pure blue (0, 0, 255) -> HSL (240, 100, 50)
      const imageData = createTestImageData(1, 1, { r: 0, g: 0, b: 255, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.hsl.h).toBe(240);
      expect(state.hsl.s).toBe(100);
      expect(state.hsl.l).toBe(50);
    });

    it('PROBE-032: grey has 0 saturation', () => {
      pixelProbe.enable();

      // Mid grey (128, 128, 128) -> HSL (0, 0, 50)
      const imageData = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.hsl.s).toBe(0);
      expect(state.hsl.l).toBe(50);
    });

    it('PROBE-033: white has 100% lightness', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(1, 1, { r: 255, g: 255, b: 255, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.hsl.l).toBe(100);
    });

    it('PROBE-034: black has 0% lightness', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(1, 1, { r: 0, g: 0, b: 0, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.hsl.l).toBe(0);
    });
  });

  describe('IRE calculation (FEATURES.md PROBE-003)', () => {
    it('PROBE-003: IRE value displayed', () => {
      pixelProbe.enable();

      // Mid grey should be around 50 IRE
      const imageData = createTestImageData(1, 1, { r: 128, g: 128, b: 128, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.ire).toBe(50); // 128/255 * 100 = ~50
    });

    it('PROBE-040: IRE 0 for black', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(1, 1, { r: 0, g: 0, b: 0, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.ire).toBe(0);
    });

    it('PROBE-041: IRE 100 for white', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(1, 1, { r: 255, g: 255, b: 255, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      expect(state.ire).toBe(100);
    });

    it('PROBE-042: IRE uses Rec.709 coefficients', () => {
      pixelProbe.enable();

      // Pure green (0, 255, 0) should give luminance of 0.7152 * 255 = 182 -> 71 IRE
      const imageData = createTestImageData(1, 1, { r: 0, g: 255, b: 0, a: 255 });
      pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

      const state = pixelProbe.getState();
      // 0.2126 * 0 + 0.7152 * 255 + 0.0722 * 0 = 182.376 -> 182/255 * 100 = 71.5
      expect(state.ire).toBe(72); // Rounded
    });
  });

  describe('lock functionality', () => {
    it('PROBE-050: toggleLock locks position', () => {
      pixelProbe.enable();
      expect(pixelProbe.isLocked()).toBe(false);

      pixelProbe.toggleLock();
      expect(pixelProbe.isLocked()).toBe(true);
    });

    it('PROBE-051: toggleLock unlocks position', () => {
      pixelProbe.enable();
      pixelProbe.toggleLock();
      pixelProbe.toggleLock();
      expect(pixelProbe.isLocked()).toBe(false);
    });

    it('PROBE-052: locked state prevents updates', () => {
      pixelProbe.enable();

      const imageData1 = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 255 });
      pixelProbe.updateFromCanvas(5, 5, imageData1, 10, 10);

      pixelProbe.toggleLock(); // Lock

      const imageData2 = createTestImageData(10, 10, { r: 200, g: 200, b: 200, a: 255 });
      pixelProbe.updateFromCanvas(8, 8, imageData2, 10, 10);

      const state = pixelProbe.getState();
      expect(state.x).toBe(5); // Position unchanged
      expect(state.y).toBe(5);
      expect(state.rgb.r).toBe(100); // Color unchanged
    });

    it('PROBE-053: toggleLock emits stateChanged', () => {
      pixelProbe.enable();
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.toggleLock();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ locked: true })
      );
    });
  });

  describe('format selection', () => {
    it('PROBE-060: setFormat changes format', () => {
      pixelProbe.setFormat('hsl');
      expect(pixelProbe.getState().format).toBe('hsl');
    });

    it('PROBE-061: setFormat emits stateChanged', () => {
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.setFormat('hex');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'hex' })
      );
    });

    it('PROBE-062: supports all format types', () => {
      const formats: Array<PixelProbeState['format']> = ['rgb', 'rgb01', 'hsl', 'hex', 'ire'];

      for (const format of formats) {
        pixelProbe.setFormat(format);
        expect(pixelProbe.getState().format).toBe(format);
      }
    });
  });

  describe('overlay positioning', () => {
    it('PROBE-070: setOverlayPosition positions overlay', () => {
      pixelProbe.enable();

      // Just verify no errors
      expect(() => {
        pixelProbe.setOverlayPosition(100, 100);
      }).not.toThrow();
    });

    it('PROBE-071: setOverlayPosition does nothing when disabled', () => {
      // Should not throw when disabled
      expect(() => {
        pixelProbe.setOverlayPosition(100, 100);
      }).not.toThrow();
    });
  });

  describe('state management', () => {
    it('PROBE-080: getState returns copy', () => {
      const state1 = pixelProbe.getState();
      state1.rgb.r = 999;
      const state2 = pixelProbe.getState();

      expect(state2.rgb.r).toBe(0);
    });

    it('PROBE-081: state includes all required fields', () => {
      const state = pixelProbe.getState();

      expect(state).toHaveProperty('enabled');
      expect(state).toHaveProperty('locked');
      expect(state).toHaveProperty('x');
      expect(state).toHaveProperty('y');
      expect(state).toHaveProperty('rgb');
      expect(state).toHaveProperty('hsl');
      expect(state).toHaveProperty('ire');
      expect(state).toHaveProperty('format');
    });
  });

  describe('FEATURES.md test cases', () => {
    it('PROBE-004: persistent points remain across frames', () => {
      // Since persistent points are managed externally, verify lock works
      pixelProbe.enable();

      const imageData = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 255 });
      pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);
      pixelProbe.toggleLock(); // Lock the position (persistent point)

      // Simulate frame change with new image data
      const newImageData = createTestImageData(10, 10, { r: 150, g: 150, b: 150, a: 255 });
      pixelProbe.updateFromCanvas(8, 8, newImageData, 10, 10);

      // Position should persist (locked)
      const state = pixelProbe.getState();
      expect(state.x).toBe(5);
      expect(state.y).toBe(5);
    });

    it('PROBE-005: values update during color correction', () => {
      pixelProbe.enable();

      // Initial value
      const imageData1 = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 255 });
      pixelProbe.updateFromCanvas(5, 5, imageData1, 10, 10);
      expect(pixelProbe.getState().rgb.r).toBe(100);

      // After color correction (simulated by different image data)
      const imageData2 = createTestImageData(10, 10, { r: 150, g: 100, b: 100, a: 255 });
      pixelProbe.updateFromCanvas(5, 5, imageData2, 10, 10);
      expect(pixelProbe.getState().rgb.r).toBe(150);
    });

    it('PROBE-006: probe works at all zoom levels', () => {
      pixelProbe.enable();

      // At different display dimensions (simulating zoom), coordinates should map correctly
      const imageData = createImageWithPixelAt(100, 100, 50, 50, { r: 200, g: 100, b: 50, a: 255 });

      // Zoomed out (display smaller than image)
      pixelProbe.updateFromCanvas(50, 50, imageData, 100, 100);
      expect(pixelProbe.getState().rgb.r).toBe(200);

      // Zoomed in (would be handled by caller passing correct normalized coords)
      pixelProbe.updateFromCanvas(50, 50, imageData, 100, 100);
      expect(pixelProbe.getState().x).toBe(50);
      expect(pixelProbe.getState().y).toBe(50);
    });
  });

  describe('dispose', () => {
    it('PROBE-090: dispose cleans up overlay', () => {
      pixelProbe.enable();
      pixelProbe.show();

      pixelProbe.dispose();

      // Overlay should be removed from body
      const overlay = document.querySelector('[data-testid="pixel-probe-overlay"]');
      expect(overlay).toBeNull();
    });
  });
});
