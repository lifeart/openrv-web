/**
 * Histogram Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Histogram,
  calculateHistogram,
} from './Histogram';

describe('Histogram', () => {
  let histogram: Histogram;

  beforeEach(() => {
    histogram = new Histogram();
  });

  afterEach(() => {
    histogram.dispose();
  });

  describe('initialization', () => {
    it('HG-001: starts hidden', () => {
      expect(histogram.isVisible()).toBe(false);
    });

    it('HG-002: default mode is RGB', () => {
      expect(histogram.getMode()).toBe('rgb');
    });

    it('HG-003: default log scale is disabled', () => {
      expect(histogram.isLogScale()).toBe(false);
    });

    it('HG-004: getData returns null before calculation', () => {
      expect(histogram.getData()).toBeNull();
    });

    it('HG-005: renders container element', () => {
      const element = histogram.render();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('histogram-container');
    });
  });

  describe('visibility', () => {
    it('HG-010: show makes histogram visible', () => {
      const handler = vi.fn();
      histogram.on('visibilityChanged', handler);

      histogram.show();

      expect(histogram.isVisible()).toBe(true);
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('HG-011: hide makes histogram hidden', () => {
      histogram.show();
      const handler = vi.fn();
      histogram.on('visibilityChanged', handler);

      histogram.hide();

      expect(histogram.isVisible()).toBe(false);
      expect(handler).toHaveBeenCalledWith(false);
    });

    it('HG-012: toggle shows when hidden', () => {
      histogram.toggle();
      expect(histogram.isVisible()).toBe(true);
    });

    it('HG-013: toggle hides when visible', () => {
      histogram.show();
      histogram.toggle();
      expect(histogram.isVisible()).toBe(false);
    });

    it('HG-014: show is idempotent', () => {
      const handler = vi.fn();
      histogram.on('visibilityChanged', handler);

      histogram.show();
      histogram.show();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('HG-015: hide is idempotent', () => {
      const handler = vi.fn();
      histogram.on('visibilityChanged', handler);

      histogram.hide();
      histogram.hide();

      expect(handler).toHaveBeenCalledTimes(0);
    });
  });

  describe('mode', () => {
    it('HG-020: setMode changes mode', () => {
      histogram.setMode('luminance');
      expect(histogram.getMode()).toBe('luminance');
    });

    it('HG-021: setMode emits event', () => {
      const handler = vi.fn();
      histogram.on('modeChanged', handler);

      histogram.setMode('luminance');

      expect(handler).toHaveBeenCalledWith('luminance');
    });

    it('HG-022: setMode does not emit if unchanged', () => {
      const handler = vi.fn();
      histogram.on('modeChanged', handler);

      histogram.setMode('rgb'); // Already rgb

      expect(handler).not.toHaveBeenCalled();
    });

    it('HG-023: cycleMode cycles through modes', () => {
      expect(histogram.getMode()).toBe('rgb');

      histogram.cycleMode();
      expect(histogram.getMode()).toBe('luminance');

      histogram.cycleMode();
      expect(histogram.getMode()).toBe('separate');

      histogram.cycleMode();
      expect(histogram.getMode()).toBe('rgb');
    });
  });

  describe('logScale', () => {
    it('HG-030: setLogScale enables log scale', () => {
      histogram.setLogScale(true);
      expect(histogram.isLogScale()).toBe(true);
    });

    it('HG-031: setLogScale emits event', () => {
      const handler = vi.fn();
      histogram.on('logScaleChanged', handler);

      histogram.setLogScale(true);

      expect(handler).toHaveBeenCalledWith(true);
    });

    it('HG-032: setLogScale does not emit if unchanged', () => {
      const handler = vi.fn();
      histogram.on('logScaleChanged', handler);

      histogram.setLogScale(false); // Already false

      expect(handler).not.toHaveBeenCalled();
    });

    it('HG-033: toggleLogScale toggles state', () => {
      expect(histogram.isLogScale()).toBe(false);

      histogram.toggleLogScale();
      expect(histogram.isLogScale()).toBe(true);

      histogram.toggleLogScale();
      expect(histogram.isLogScale()).toBe(false);
    });
  });
});

describe('Histogram calculation', () => {
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

  describe('calculate method', () => {
    let histogram: Histogram;

    beforeEach(() => {
      histogram = new Histogram();
    });

    afterEach(() => {
      histogram.dispose();
    });

    it('HG-040: calculate returns histogram data', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      const data = histogram.calculate(imageData);

      expect(data).toBeDefined();
      expect(data.red).toBeInstanceOf(Uint32Array);
      expect(data.green).toBeInstanceOf(Uint32Array);
      expect(data.blue).toBeInstanceOf(Uint32Array);
      expect(data.luminance).toBeInstanceOf(Uint32Array);
      expect(data.red.length).toBe(256);
    });

    it('HG-041: uniform gray image has single bin populated', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      const data = histogram.calculate(imageData);

      expect(data.red[128]).toBe(100);
      expect(data.green[128]).toBe(100);
      expect(data.blue[128]).toBe(100);
      expect(data.luminance[128]).toBe(100);
    });

    it('HG-042: pure red image has only red channel populated', () => {
      const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 });
      const data = histogram.calculate(imageData);

      expect(data.red[255]).toBe(100);
      expect(data.red[0]).toBe(0);
      expect(data.green[0]).toBe(100);
      expect(data.green[255]).toBe(0);
      expect(data.blue[0]).toBe(100);
      expect(data.blue[255]).toBe(0);
    });

    it('HG-043: pixelCount is correct', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      const data = histogram.calculate(imageData);

      expect(data.pixelCount).toBe(100);
    });

    it('HG-044: maxValue is correct', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      const data = histogram.calculate(imageData);

      expect(data.maxValue).toBe(100);
    });

    it('HG-045: luminance is calculated with Rec.709 coefficients', () => {
      // Pure green (255) should give luminance of 0.7152 * 255 = 182
      const imageData = createTestImageData(1, 1, { r: 0, g: 255, b: 0, a: 255 });
      const data = histogram.calculate(imageData);

      const expectedLuma = Math.round(0.7152 * 255);
      expect(data.luminance[expectedLuma]).toBe(1);
    });

    it('HG-046: getData returns calculated data', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      histogram.calculate(imageData);

      const data = histogram.getData();
      expect(data).not.toBeNull();
      expect(data!.pixelCount).toBe(100);
    });
  });

  describe('calculateHistogram function', () => {
    it('HG-050: standalone function calculates histogram', () => {
      const imageData = createTestImageData(10, 10, { r: 64, g: 128, b: 192, a: 255 });
      const data = calculateHistogram(imageData);

      expect(data.red[64]).toBe(100);
      expect(data.green[128]).toBe(100);
      expect(data.blue[192]).toBe(100);
    });

    it('HG-051: handles varied pixel values', () => {
      const imageData = createTestImageData(3, 1);
      const pixels = imageData.data;

      // Pixel 0: R=0
      pixels[0] = 0; pixels[1] = 0; pixels[2] = 0; pixels[3] = 255;
      // Pixel 1: R=128
      pixels[4] = 128; pixels[5] = 0; pixels[6] = 0; pixels[7] = 255;
      // Pixel 2: R=255
      pixels[8] = 255; pixels[9] = 0; pixels[10] = 0; pixels[11] = 255;

      const data = calculateHistogram(imageData);

      expect(data.red[0]).toBe(1);
      expect(data.red[128]).toBe(1);
      expect(data.red[255]).toBe(1);
      expect(data.pixelCount).toBe(3);
    });
  });
});

describe('Histogram stats', () => {
  let histogram: Histogram;

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

  beforeEach(() => {
    histogram = new Histogram();
  });

  afterEach(() => {
    histogram.dispose();
  });

  it('HG-060: getStats returns null before calculation', () => {
    expect(histogram.getStats()).toBeNull();
  });

  it('HG-061: getStats returns correct min/max for uniform image', () => {
    const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
    histogram.calculate(imageData);

    const stats = histogram.getStats();
    expect(stats).not.toBeNull();
    expect(stats!.min).toBe(128);
    expect(stats!.max).toBe(128);
  });

  it('HG-062: getStats returns correct mean for uniform image', () => {
    const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
    histogram.calculate(imageData);

    const stats = histogram.getStats();
    expect(stats!.mean).toBe(128);
  });

  it('HG-063: getStats returns correct median for uniform image', () => {
    const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
    histogram.calculate(imageData);

    const stats = histogram.getStats();
    expect(stats!.median).toBe(128);
  });

  it('HG-064: getStats calculates correct min/max for varied image', () => {
    const imageData = createTestImageData(3, 1);
    const pixels = imageData.data;

    // Pixel 0: Gray 50
    pixels[0] = 50; pixels[1] = 50; pixels[2] = 50; pixels[3] = 255;
    // Pixel 1: Gray 100
    pixels[4] = 100; pixels[5] = 100; pixels[6] = 100; pixels[7] = 255;
    // Pixel 2: Gray 200
    pixels[8] = 200; pixels[9] = 200; pixels[10] = 200; pixels[11] = 255;

    histogram.calculate(imageData);

    const stats = histogram.getStats();
    expect(stats!.min).toBe(50);
    expect(stats!.max).toBe(200);
  });
});
