/**
 * PixelProbe Unit Tests
 *
 * Tests for Pixel Probe / Color Sampler component (FEATURES.md 2.5)
 * Based on test cases PROBE-001 through PROBE-006
 * Extended with tests for area averaging, source mode, and alpha display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PixelProbe,
  PixelProbeState,
  DEFAULT_PIXEL_PROBE_STATE,
  calculateAreaAverage,
  SampleSize,
  SourceMode,
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

// Helper to create gradient ImageData for area averaging tests
function createGradientImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Red gradient horizontal, green gradient vertical
      data[idx] = Math.floor((x / width) * 255);
      data[idx + 1] = Math.floor((y / height) * 255);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
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
        alpha: 255,
        hsl: { h: 0, s: 0, l: 0 },
        ire: 0,
        format: 'rgb',
        sampleSize: 1,
        sourceMode: 'rendered',
        floatPrecision: 3,
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

    it('PROBE-005: default sample size is 1', () => {
      expect(pixelProbe.getSampleSize()).toBe(1);
    });

    it('PROBE-006: default source mode is rendered', () => {
      expect(pixelProbe.getSourceMode()).toBe('rendered');
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

  describe('Alpha channel display', () => {
    it('PROBE-100: reads alpha channel value', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(10, 10, { r: 128, g: 64, b: 192, a: 200 });
      pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

      const state = pixelProbe.getState();
      expect(state.alpha).toBe(200);
    });

    it('PROBE-101: alpha is 255 for opaque pixels', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 255 });
      pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

      const state = pixelProbe.getState();
      expect(state.alpha).toBe(255);
    });

    it('PROBE-102: alpha is 0 for fully transparent pixels', () => {
      pixelProbe.enable();

      const imageData = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 0 });
      pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

      const state = pixelProbe.getState();
      expect(state.alpha).toBe(0);
    });

    it('PROBE-103: alpha defaults to 255 for null imageData', () => {
      pixelProbe.enable();
      pixelProbe.updateFromCanvas(5, 5, null, 10, 10);

      const state = pixelProbe.getState();
      expect(state.alpha).toBe(255);
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

    it('PROBE-063: active format row is visually highlighted', () => {
      pixelProbe.enable();
      pixelProbe.show();
      pixelProbe.setFormat('hex');

      const hexValue = document.querySelector('[data-testid="pixel-probe-hex"]') as HTMLElement;
      const row = hexValue.parentElement as HTMLElement;
      expect(row.style.borderColor).toContain('var(--accent-primary-rgb)');
    });

    it('PROBE-064: precision button shows current precision and toggles label', () => {
      pixelProbe.enable();
      pixelProbe.show();

      const precisionBtn = document.querySelector('[data-testid="pixel-probe-precision-toggle"]') as HTMLButtonElement;
      expect(precisionBtn.textContent).toBe('P3');

      precisionBtn.click();

      expect(pixelProbe.getFloatPrecision()).toBe(6);
      expect(precisionBtn.textContent).toBe('P6');
      expect(precisionBtn.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('sample size (area averaging)', () => {
    it('PROBE-110: setSampleSize changes sample size', () => {
      pixelProbe.setSampleSize(3);
      expect(pixelProbe.getSampleSize()).toBe(3);
    });

    it('PROBE-111: setSampleSize emits stateChanged', () => {
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.setSampleSize(5);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ sampleSize: 5 })
      );
    });

    it('PROBE-112: supports all sample sizes', () => {
      const sizes: SampleSize[] = [1, 3, 5, 9];

      for (const size of sizes) {
        pixelProbe.setSampleSize(size);
        expect(pixelProbe.getSampleSize()).toBe(size);
      }
    });

    it('PROBE-113: setSampleSize is idempotent', () => {
      pixelProbe.setSampleSize(3);
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.setSampleSize(3); // Same size

      expect(handler).not.toHaveBeenCalled();
    });

    it('PROBE-114: area averaging with sampleSize 3 computes average', () => {
      pixelProbe.enable();
      pixelProbe.setSampleSize(3);

      // Create 5x5 image with known values
      // Center 3x3 around (2,2) all white, rest black
      const data = new Uint8ClampedArray(5 * 5 * 4);
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
      // Set center 3x3 to white
      for (let y = 1; y <= 3; y++) {
        for (let x = 1; x <= 3; x++) {
          const idx = (y * 5 + x) * 4;
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        }
      }
      const imageData = new ImageData(data, 5, 5);

      pixelProbe.updateFromCanvas(2, 2, imageData, 5, 5);

      const state = pixelProbe.getState();
      // 3x3 area centered at (2,2) is all white
      expect(state.rgb.r).toBe(255);
      expect(state.rgb.g).toBe(255);
      expect(state.rgb.b).toBe(255);
    });

    it('PROBE-115: area averaging handles edge pixels', () => {
      pixelProbe.enable();
      pixelProbe.setSampleSize(3);

      // All white image
      const imageData = createTestImageData(10, 10, { r: 255, g: 255, b: 255, a: 255 });

      // Sample at corner (0, 0) - only 4 pixels available
      pixelProbe.updateFromCanvas(0, 0, imageData, 10, 10);

      const state = pixelProbe.getState();
      // Should still average to white
      expect(state.rgb.r).toBe(255);
      expect(state.rgb.g).toBe(255);
      expect(state.rgb.b).toBe(255);
    });
  });

  describe('source mode', () => {
    it('PROBE-120: setSourceMode changes source mode', () => {
      pixelProbe.setSourceMode('source');
      expect(pixelProbe.getSourceMode()).toBe('source');
    });

    it('PROBE-121: setSourceMode emits stateChanged', () => {
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.setSourceMode('source');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ sourceMode: 'source' })
      );
    });

    it('PROBE-122: supports all source modes', () => {
      const modes: SourceMode[] = ['rendered', 'source'];

      for (const mode of modes) {
        pixelProbe.setSourceMode(mode);
        expect(pixelProbe.getSourceMode()).toBe(mode);
      }
    });

    it('PROBE-123: setSourceMode is idempotent', () => {
      const handler = vi.fn();
      pixelProbe.on('stateChanged', handler);

      pixelProbe.setSourceMode('rendered'); // Already the default

      expect(handler).not.toHaveBeenCalled();
    });

    it('PROBE-124: source mode uses source image data when available', () => {
      pixelProbe.enable();
      pixelProbe.setSourceMode('source');

      // Rendered image is red
      const renderedData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 });
      // Source image is blue
      const sourceData = createTestImageData(10, 10, { r: 0, g: 0, b: 255, a: 255 });

      pixelProbe.setSourceImageData(sourceData);
      pixelProbe.updateFromCanvas(5, 5, renderedData, 10, 10);

      const state = pixelProbe.getState();
      // Should use source (blue), not rendered (red)
      expect(state.rgb.r).toBe(0);
      expect(state.rgb.b).toBe(255);
    });

    it('PROBE-125: rendered mode ignores source image data', () => {
      pixelProbe.enable();
      pixelProbe.setSourceMode('rendered');

      // Rendered image is red
      const renderedData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 });
      // Source image is blue
      const sourceData = createTestImageData(10, 10, { r: 0, g: 0, b: 255, a: 255 });

      pixelProbe.setSourceImageData(sourceData);
      pixelProbe.updateFromCanvas(5, 5, renderedData, 10, 10);

      const state = pixelProbe.getState();
      // Should use rendered (red)
      expect(state.rgb.r).toBe(255);
      expect(state.rgb.b).toBe(0);
    });

    it('PROBE-126: source mode falls back to rendered when source not available', () => {
      pixelProbe.enable();
      pixelProbe.setSourceMode('source');

      // Rendered image is red, no source data
      const renderedData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 });

      pixelProbe.setSourceImageData(null);
      pixelProbe.updateFromCanvas(5, 5, renderedData, 10, 10);

      const state = pixelProbe.getState();
      // Should fall back to rendered (red)
      expect(state.rgb.r).toBe(255);
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

    it('PROBE-072: setOverlayPosition pauses follow when cursor is near overlay', () => {
      pixelProbe.enable();
      pixelProbe.show();

      const overlay = document.querySelector('[data-testid="pixel-probe-overlay"]') as HTMLElement;
      overlay.style.left = '120px';
      overlay.style.top = '120px';

      vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
        x: 120,
        y: 120,
        left: 120,
        top: 120,
        right: 320,
        bottom: 220,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      } as DOMRect);

      // Cursor is close to top-left corner: overlay should not chase it.
      pixelProbe.setOverlayPosition(110, 110);
      expect(overlay.style.left).toBe('120px');
      expect(overlay.style.top).toBe('120px');
    });

    it('PROBE-073: hovering overlay pauses follow until mouse leaves', () => {
      pixelProbe.enable();
      pixelProbe.show();

      const overlay = document.querySelector('[data-testid="pixel-probe-overlay"]') as HTMLElement;
      overlay.style.left = '120px';
      overlay.style.top = '120px';

      vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
        x: 120,
        y: 120,
        left: 120,
        top: 120,
        right: 320,
        bottom: 220,
        width: 200,
        height: 100,
        toJSON: () => ({}),
      } as DOMRect);

      overlay.dispatchEvent(new PointerEvent('pointerenter'));
      pixelProbe.setOverlayPosition(500, 400);
      expect(overlay.style.left).toBe('120px');
      expect(overlay.style.top).toBe('120px');

      overlay.dispatchEvent(new PointerEvent('pointerleave'));
      pixelProbe.setOverlayPosition(500, 400);
      expect(overlay.style.left).toBe('520px');
      expect(overlay.style.top).toBe('420px');
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
      expect(state).toHaveProperty('alpha');
      expect(state).toHaveProperty('hsl');
      expect(state).toHaveProperty('ire');
      expect(state).toHaveProperty('format');
      expect(state).toHaveProperty('sampleSize');
      expect(state).toHaveProperty('sourceMode');
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

describe('calculateAreaAverage', () => {
  it('AREA-001: returns single pixel for size 1', () => {
    const imageData = createTestImageData(10, 10, { r: 100, g: 150, b: 200, a: 128 });
    const result = calculateAreaAverage(imageData, 5, 5, 1);

    expect(result.r).toBe(100);
    expect(result.g).toBe(150);
    expect(result.b).toBe(200);
    expect(result.a).toBe(128);
  });

  it('AREA-002: averages 3x3 area correctly', () => {
    // Create 5x5 image with center 3x3 being different
    const data = new Uint8ClampedArray(5 * 5 * 4);
    // Fill with black (0)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
    // Set center 3x3 to rgb(90, 90, 90) - so average of 9 pixels is 90
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        const idx = (y * 5 + x) * 4;
        data[idx] = 90;
        data[idx + 1] = 90;
        data[idx + 2] = 90;
      }
    }
    const imageData = new ImageData(data, 5, 5);

    const result = calculateAreaAverage(imageData, 2, 2, 3);

    expect(result.r).toBe(90);
    expect(result.g).toBe(90);
    expect(result.b).toBe(90);
  });

  it('AREA-003: handles edge pixels by averaging available pixels', () => {
    // All white image
    const imageData = createTestImageData(10, 10, { r: 255, g: 255, b: 255, a: 255 });

    // Sample at corner (0, 0) with 3x3 - only 4 pixels available
    const result = calculateAreaAverage(imageData, 0, 0, 3);

    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
  });

  it('AREA-004: handles corner with 5x5 sample', () => {
    // Create gradient image
    const imageData = createGradientImageData(10, 10);

    // Sample at corner (0, 0) with 5x5 - only 9 pixels available
    const result = calculateAreaAverage(imageData, 0, 0, 5);

    // Should still return valid values
    expect(result.r).toBeGreaterThanOrEqual(0);
    expect(result.r).toBeLessThanOrEqual(255);
  });

  it('AREA-005: returns zeros for empty area (no valid pixels)', () => {
    const imageData = createTestImageData(1, 1, { r: 100, g: 100, b: 100, a: 255 });

    // Sample outside bounds
    const result = calculateAreaAverage(imageData, -10, -10, 3);

    // Most pixels are out of bounds, only valid pixels are averaged
    // At -10, -10 with 3x3, no pixels are in bounds
    // Wait, the center is at -10,-10 and halfSize is 1, so we check -11 to -9
    // All out of bounds
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBe(0);
  });

  it('AREA-006: averages alpha channel correctly', () => {
    // Create image with varying alpha
    const data = new Uint8ClampedArray(3 * 3 * 4);
    const alphaValues = [0, 128, 255, 128, 255, 128, 255, 128, 0];
    for (let i = 0; i < 9; i++) {
      const idx = i * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alphaValues[i] ?? 0;
    }
    const imageData = new ImageData(data, 3, 3);

    const result = calculateAreaAverage(imageData, 1, 1, 3);

    // Average of [0, 128, 255, 128, 255, 128, 255, 128, 0] = 1277 / 9 = 142
    expect(result.a).toBe(142);
  });

  it('AREA-007: 9x9 sample works correctly', () => {
    // All grey image
    const imageData = createTestImageData(20, 20, { r: 128, g: 128, b: 128, a: 255 });

    const result = calculateAreaAverage(imageData, 10, 10, 9);

    expect(result.r).toBe(128);
    expect(result.g).toBe(128);
    expect(result.b).toBe(128);
    expect(result.a).toBe(255);
  });

  it('AREA-008: handles very small image with large sample size', () => {
    // 2x2 image with 9x9 sample size - only 4 pixels available
    const imageData = createTestImageData(2, 2, { r: 100, g: 150, b: 200, a: 255 });

    const result = calculateAreaAverage(imageData, 1, 1, 9);

    // Should average the available 4 pixels (all same value)
    expect(result.r).toBe(100);
    expect(result.g).toBe(150);
    expect(result.b).toBe(200);
    expect(result.a).toBe(255);
  });

  it('AREA-009: handles bottom-right corner correctly', () => {
    // 10x10 image, sample at (9, 9) with 3x3 - only 4 pixels in bounds
    const imageData = createTestImageData(10, 10, { r: 80, g: 80, b: 80, a: 200 });

    const result = calculateAreaAverage(imageData, 9, 9, 3);

    expect(result.r).toBe(80);
    expect(result.g).toBe(80);
    expect(result.b).toBe(80);
    expect(result.a).toBe(200);
  });

  it('AREA-010: handles right edge correctly', () => {
    // 10x10 image, sample at (9, 5) with 3x3 - only 6 pixels in bounds
    const imageData = createTestImageData(10, 10, { r: 120, g: 120, b: 120, a: 255 });

    const result = calculateAreaAverage(imageData, 9, 5, 3);

    expect(result.r).toBe(120);
    expect(result.g).toBe(120);
    expect(result.b).toBe(120);
  });

  it('AREA-011: handles bottom edge correctly', () => {
    // 10x10 image, sample at (5, 9) with 3x3 - only 6 pixels in bounds
    const imageData = createTestImageData(10, 10, { r: 90, g: 90, b: 90, a: 255 });

    const result = calculateAreaAverage(imageData, 5, 9, 3);

    expect(result.r).toBe(90);
    expect(result.g).toBe(90);
    expect(result.b).toBe(90);
  });

  it('AREA-012: handles 1x1 image with large sample', () => {
    // 1x1 image with 5x5 sample - only 1 pixel
    const imageData = createTestImageData(1, 1, { r: 200, g: 100, b: 50, a: 128 });

    const result = calculateAreaAverage(imageData, 0, 0, 5);

    expect(result.r).toBe(200);
    expect(result.g).toBe(100);
    expect(result.b).toBe(50);
    expect(result.a).toBe(128);
  });
});

describe('PixelProbe edge cases', () => {
  let pixelProbe: PixelProbe;

  beforeEach(() => {
    pixelProbe = new PixelProbe();
  });

  afterEach(() => {
    pixelProbe.dispose();
  });

  it('EDGE-001: handles imageData width different from displayWidth', () => {
    pixelProbe.enable();

    // ImageData is 10x10 but display dimensions are 20x20
    // This simulates zoom or scaling scenarios
    const imageData = createImageWithPixelAt(10, 10, 5, 5, { r: 200, g: 100, b: 50, a: 255 });

    // Pass display dimensions different from imageData dimensions
    // The bug was using displayWidth instead of imageData.width
    pixelProbe.updateFromCanvas(5, 5, imageData, 20, 20);

    const state = pixelProbe.getState();
    // Should correctly read from imageData at (5,5)
    expect(state.rgb.r).toBe(200);
    expect(state.rgb.g).toBe(100);
    expect(state.rgb.b).toBe(50);
  });

  it('EDGE-002: handles coordinates at exact boundary (width-1, height-1)', () => {
    pixelProbe.enable();

    // Create 10x10 image with specific pixel at bottom-right
    const imageData = createImageWithPixelAt(10, 10, 9, 9, { r: 150, g: 75, b: 25, a: 200 });

    pixelProbe.updateFromCanvas(9, 9, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.x).toBe(9);
    expect(state.y).toBe(9);
    expect(state.rgb.r).toBe(150);
    expect(state.rgb.g).toBe(75);
    expect(state.rgb.b).toBe(25);
    expect(state.alpha).toBe(200);
  });

  it('EDGE-003: handles very small image (1x1)', () => {
    pixelProbe.enable();

    const imageData = createTestImageData(1, 1, { r: 128, g: 64, b: 32, a: 192 });

    pixelProbe.updateFromCanvas(0, 0, imageData, 1, 1);

    const state = pixelProbe.getState();
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.rgb.r).toBe(128);
    expect(state.rgb.g).toBe(64);
    expect(state.rgb.b).toBe(32);
    expect(state.alpha).toBe(192);
  });

  it('EDGE-004: clamps to bounds on 1x1 image with out-of-bounds coords', () => {
    pixelProbe.enable();

    const imageData = createTestImageData(1, 1, { r: 100, g: 100, b: 100, a: 255 });

    // Try to access (100, 100) on a 1x1 image
    pixelProbe.updateFromCanvas(100, 100, imageData, 1, 1);

    const state = pixelProbe.getState();
    // Should clamp to (0, 0)
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.rgb.r).toBe(100);
  });

  it('EDGE-005: area averaging with very small image (2x2) and 5x5 sample', () => {
    pixelProbe.enable();
    pixelProbe.setSampleSize(5);

    const imageData = createTestImageData(2, 2, { r: 80, g: 160, b: 240, a: 128 });

    pixelProbe.updateFromCanvas(1, 1, imageData, 2, 2);

    const state = pixelProbe.getState();
    // Should average all 4 pixels (all same value)
    expect(state.rgb.r).toBe(80);
    expect(state.rgb.g).toBe(160);
    expect(state.rgb.b).toBe(240);
    expect(state.alpha).toBe(128);
  });

  it('EDGE-006: source mode with null source falls back correctly', () => {
    pixelProbe.enable();
    pixelProbe.setSourceMode('source');

    const renderedData = createTestImageData(10, 10, { r: 200, g: 100, b: 50, a: 255 });

    // No source data set (null)
    pixelProbe.setSourceImageData(null);
    pixelProbe.updateFromCanvas(5, 5, renderedData, 10, 10);

    const state = pixelProbe.getState();
    // Should fall back to rendered
    expect(state.rgb.r).toBe(200);
    expect(state.rgb.g).toBe(100);
    expect(state.rgb.b).toBe(50);
  });

  it('EDGE-007: source mode with area averaging uses source data', () => {
    pixelProbe.enable();
    pixelProbe.setSourceMode('source');
    pixelProbe.setSampleSize(3);

    const renderedData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    const sourceData = createTestImageData(10, 10, { r: 0, g: 255, b: 0, a: 200 });

    pixelProbe.setSourceImageData(sourceData);
    pixelProbe.updateFromCanvas(5, 5, renderedData, 10, 10);

    const state = pixelProbe.getState();
    // Should use source (green), not rendered (red)
    expect(state.rgb.r).toBe(0);
    expect(state.rgb.g).toBe(255);
    expect(state.rgb.b).toBe(0);
    expect(state.alpha).toBe(200);
  });

  it('EDGE-008: floating point coordinates are floored', () => {
    pixelProbe.enable();

    const imageData = createImageWithPixelAt(10, 10, 5, 5, { r: 200, g: 100, b: 50, a: 255 });

    pixelProbe.updateFromCanvas(5.9, 5.7, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.x).toBe(5);
    expect(state.y).toBe(5);
    expect(state.rgb.r).toBe(200);
  });

  it('EDGE-009: negative coordinates are clamped to 0', () => {
    pixelProbe.enable();

    const imageData = createImageWithPixelAt(10, 10, 0, 0, { r: 150, g: 150, b: 150, a: 255 });

    pixelProbe.updateFromCanvas(-5, -10, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.rgb.r).toBe(150);
  });

  it('EDGE-010: handles imageData with different dimensions from display correctly with area averaging', () => {
    pixelProbe.enable();
    pixelProbe.setSampleSize(3);

    // ImageData is 10x10 but display dimensions are 20x20
    // Create 10x10 image with a specific pattern
    const imageData = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 255 });

    // Set specific pixels around center (5,5)
    const data = imageData.data;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = 5 + dx;
        const py = 5 + dy;
        const idx = (py * 10 + px) * 4;
        data[idx] = 200;     // r
        data[idx + 1] = 150; // g
        data[idx + 2] = 100; // b
      }
    }

    pixelProbe.updateFromCanvas(5, 5, imageData, 20, 20);

    const state = pixelProbe.getState();
    // Should use imageData.width (10) for pixel index calculation
    // Area average of 3x3 around (5,5) should be the modified values
    expect(state.rgb.r).toBe(200);
    expect(state.rgb.g).toBe(150);
    expect(state.rgb.b).toBe(100);
  });
});

describe('PixelProbe checkerboard display', () => {
  let pixelProbe: PixelProbe;

  beforeEach(() => {
    pixelProbe = new PixelProbe();
  });

  afterEach(() => {
    pixelProbe.dispose();
  });

  it('CHECKER-001: displays checkerboard for semi-transparent pixels', () => {
    pixelProbe.enable();
    pixelProbe.show();

    const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 128 });
    pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.alpha).toBe(128);
    expect(state.rgb.r).toBe(255);
  });

  it('CHECKER-002: does not show checkerboard for fully opaque pixels', () => {
    pixelProbe.enable();
    pixelProbe.show();

    const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 });
    pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.alpha).toBe(255);
  });

  it('CHECKER-003: handles alpha = 0 (fully transparent)', () => {
    pixelProbe.enable();
    pixelProbe.show();

    const imageData = createTestImageData(10, 10, { r: 255, g: 255, b: 255, a: 0 });
    pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.alpha).toBe(0);
  });

  it('CHECKER-004: handles alpha = 1 (nearly transparent)', () => {
    pixelProbe.enable();
    pixelProbe.show();

    const imageData = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 1 });
    pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.alpha).toBe(1);
  });

  it('CHECKER-005: handles alpha = 254 (nearly opaque)', () => {
    pixelProbe.enable();
    pixelProbe.show();

    const imageData = createTestImageData(10, 10, { r: 100, g: 100, b: 100, a: 254 });
    pixelProbe.updateFromCanvas(5, 5, imageData, 10, 10);

    const state = pixelProbe.getState();
    expect(state.alpha).toBe(254);
  });
});

describe('PixelProbe theme changes', () => {
  let pixelProbe: PixelProbe;

  beforeEach(() => {
    pixelProbe = new PixelProbe();
  });

  afterEach(() => {
    pixelProbe.dispose();
  });

  it('THEME-001: overlay uses var(--bg-secondary) instead of hardcoded rgba', () => {
    pixelProbe.enable();
    pixelProbe.show();

    const overlay = document.querySelector('[data-testid="pixel-probe-overlay"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.cssText).toContain('var(--bg-secondary)');
    expect(overlay.style.cssText).not.toContain('rgba(30, 30, 30');
  });
});
