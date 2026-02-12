/**
 * Histogram HDR Mode Tests
 *
 * Tests for Phase 3.2: Histogram bins extend beyond 1.0 in HDR mode.
 * When HDR mode is active, histogram bins cover [0, maxValue] instead of [0, 1.0].
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Histogram } from './Histogram';

// Type for mock processor
interface MockScopesProcessor {
  isReady: Mock;
  setPlaybackMode: Mock;
  setImage: Mock;
  renderHistogram: Mock;
}

// Mock WebGLScopes module
vi.mock('../../scopes/WebGLScopes', () => {
  const mockProcessor: MockScopesProcessor = {
    isReady: vi.fn(() => true),
    setPlaybackMode: vi.fn(),
    setImage: vi.fn(),
    renderHistogram: vi.fn(),
  };
  return {
    getSharedScopesProcessor: vi.fn(() => mockProcessor),
    __mockProcessor: mockProcessor,
  };
});

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

/**
 * Create a mock HDR ImageData with Float32Array backing.
 * In real browsers, HDR canvases with pixelFormat: 'float16' return Float32Array data.
 */
function createHDRImageData(
  width: number,
  height: number,
  pixels: Array<{ r: number; g: number; b: number; a: number }>
): ImageData {
  const floatData = new Float32Array(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i]!;
    floatData[i * 4] = p.r;
    floatData[i * 4 + 1] = p.g;
    floatData[i * 4 + 2] = p.b;
    floatData[i * 4 + 3] = p.a;
  }
  // Create a mock ImageData with Float32Array data (as browsers do in HDR mode)
  return {
    data: floatData,
    width,
    height,
    colorSpace: 'display-p3',
  } as unknown as ImageData;
}

describe('Histogram HDR Mode', () => {
  let histogram: Histogram;

  beforeEach(() => {
    histogram = new Histogram();
  });

  afterEach(() => {
    histogram.dispose();
  });

  describe('setHDRMode and getMaxValue', () => {
    it('P3-001: HDR mode is inactive by default', () => {
      expect(histogram.isHDRActive()).toBe(false);
    });

    it('P3-002: getMaxValue returns 1.0 when HDR mode is inactive', () => {
      expect(histogram.getMaxValue()).toBe(1.0);
    });

    it('P3-003: setHDRMode(true) activates HDR mode', () => {
      histogram.setHDRMode(true);
      expect(histogram.isHDRActive()).toBe(true);
    });

    it('P3-004: getMaxValue returns 4.0 (default headroom) when HDR active without headroom', () => {
      histogram.setHDRMode(true);
      expect(histogram.getMaxValue()).toBe(4.0);
    });

    it('P3-005: getMaxValue returns custom headroom when provided', () => {
      histogram.setHDRMode(true, 3.5);
      expect(histogram.getMaxValue()).toBe(3.5);
    });

    it('P3-006: setHDRMode(false) deactivates HDR mode', () => {
      histogram.setHDRMode(true, 3.5);
      histogram.setHDRMode(false);
      expect(histogram.isHDRActive()).toBe(false);
      expect(histogram.getMaxValue()).toBe(1.0);
    });

    it('P3-007: setHDRMode(true) with no headroom uses default 4.0', () => {
      histogram.setHDRMode(true);
      expect(histogram.getMaxValue()).toBe(4.0);
    });

    it('P3-008: setHDRMode can update headroom without toggling', () => {
      histogram.setHDRMode(true, 2.0);
      expect(histogram.getMaxValue()).toBe(2.0);

      histogram.setHDRMode(true, 6.0);
      expect(histogram.getMaxValue()).toBe(6.0);
    });
  });

  describe('SDR behavior unchanged when HDR inactive', () => {
    it('P3-010: calculate returns identical results when HDR is inactive', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 64, b: 192, a: 255 });

      // Calculate without HDR
      const sdrData = histogram.calculate(imageData);
      const sdrRed128 = sdrData.red[128];
      const sdrGreen64 = sdrData.green[64];
      const sdrBlue192 = sdrData.blue[192];

      // Calculate with HDR inactive (should be identical)
      histogram.setHDRMode(false);
      const data2 = histogram.calculate(imageData);

      expect(data2.red[128]).toBe(sdrRed128);
      expect(data2.green[64]).toBe(sdrGreen64);
      expect(data2.blue[192]).toBe(sdrBlue192);
    });

    it('P3-011: calculateHDR with SDR data delegates to calculate', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });

      const calcResult = histogram.calculate(imageData);
      const hdrResult = histogram.calculateHDR(imageData);

      // Both should produce the same results for SDR Uint8 data
      expect(hdrResult.red[128]).toBe(calcResult.red[128]);
      expect(hdrResult.pixelCount).toBe(calcResult.pixelCount);
      expect(hdrResult.maxValue).toBe(calcResult.maxValue);
    });

    it('P3-012: calculateHDR with HDR active but Uint8 data delegates to calculate', () => {
      histogram.setHDRMode(true, 4.0);
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });

      const hdrResult = histogram.calculateHDR(imageData);

      // Uint8ClampedArray data should use standard calculation even when HDR is active
      expect(hdrResult.red[128]).toBe(100);
      expect(hdrResult.pixelCount).toBe(100);
    });
  });

  describe('HDR bin extension with Float32Array data', () => {
    it('P3-020: HDR bins map values > 1.0 into upper bins', () => {
      histogram.setHDRMode(true, 4.0);

      // Create HDR pixels with values beyond 1.0
      // With maxValue=4.0, binScale = 255/4.0 = 63.75
      // A value of 2.0 maps to bin round(2.0 * 63.75) = round(127.5) = 128
      const hdrImage = createHDRImageData(1, 1, [
        { r: 2.0, g: 0.0, b: 0.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      const expectedBin = Math.round(2.0 * (255 / 4.0)); // 128
      expect(data.red[expectedBin]).toBe(1);
    });

    it('P3-021: HDR bins map value 0.0 to bin 0', () => {
      histogram.setHDRMode(true, 4.0);

      const hdrImage = createHDRImageData(1, 1, [
        { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      expect(data.red[0]).toBe(1);
      expect(data.green[0]).toBe(1);
      expect(data.blue[0]).toBe(1);
    });

    it('P3-022: HDR bins map maxValue to bin 255', () => {
      histogram.setHDRMode(true, 4.0);

      const hdrImage = createHDRImageData(1, 1, [
        { r: 4.0, g: 4.0, b: 4.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      expect(data.red[255]).toBe(1);
      expect(data.green[255]).toBe(1);
      expect(data.blue[255]).toBe(1);
    });

    it('P3-023: HDR bins clamp values beyond maxValue to bin 255', () => {
      histogram.setHDRMode(true, 4.0);

      const hdrImage = createHDRImageData(1, 1, [
        { r: 10.0, g: 8.0, b: 5.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      expect(data.red[255]).toBe(1);
      expect(data.green[255]).toBe(1);
      expect(data.blue[255]).toBe(1);
    });

    it('P3-024: HDR bins correctly distribute multiple pixels', () => {
      histogram.setHDRMode(true, 2.0);

      // With maxValue=2.0, binScale = 255/2.0 = 127.5
      // value 0.0 -> bin 0
      // value 1.0 -> bin round(127.5) = 128 (SDR peak is now at mid-range)
      // value 2.0 -> bin 255
      const hdrImage = createHDRImageData(3, 1, [
        { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
        { r: 2.0, g: 2.0, b: 2.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      expect(data.red[0]).toBe(1);
      expect(data.red[128]).toBe(1);   // 1.0 * 127.5 = 127.5 -> round to 128
      expect(data.red[255]).toBe(1);
      expect(data.pixelCount).toBe(3);
    });

    it('P3-025: HDR luminance bins use Rec.709 coefficients', () => {
      histogram.setHDRMode(true, 4.0);

      // Pure green at value 2.0
      // Luma = 0.7152 * 2.0 = 1.4304
      // binScale = 255/4.0 = 63.75
      // lumaBin = round(1.4304 * 63.75) = round(91.19) = 91
      const hdrImage = createHDRImageData(1, 1, [
        { r: 0.0, g: 2.0, b: 0.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      const expectedBin = Math.round(0.7152 * 2.0 * (255 / 4.0));
      expect(data.luminance[expectedBin]).toBe(1);
    });

    it('P3-026: custom headroom changes bin mapping', () => {
      // With headroom 2.0, a value of 1.0 maps to mid-range
      histogram.setHDRMode(true, 2.0);
      const hdrImage = createHDRImageData(1, 1, [
        { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
      ]);
      const data = histogram.calculateHDR(hdrImage);
      const expectedBin = Math.round(1.0 * (255 / 2.0)); // 128
      expect(data.red[expectedBin]).toBe(1);
    });

    it('P3-027: negative values clamp to bin 0', () => {
      histogram.setHDRMode(true, 4.0);

      const hdrImage = createHDRImageData(1, 1, [
        { r: -0.5, g: -1.0, b: -2.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      expect(data.red[0]).toBe(1);
      expect(data.green[0]).toBe(1);
      expect(data.blue[0]).toBe(1);
    });
  });

  describe('HDR scale labels', () => {
    it('P3-030: scale labels show 0/128/255 when HDR inactive', () => {
      const el = histogram.render();
      const spans = el.querySelectorAll('div > span');
      const labels: string[] = [];
      spans.forEach(span => labels.push(span.textContent ?? ''));

      // Default SDR labels should include 0, 128, 255
      expect(labels).toContain('0');
      expect(labels).toContain('128');
      expect(labels).toContain('255');
    });

    it('P3-031: scale labels update to HDR range when HDR active', () => {
      histogram.setHDRMode(true, 4.0);
      const el = histogram.render();
      const allSpans = el.querySelectorAll('div > span');
      const labels: string[] = [];
      allSpans.forEach(span => labels.push(span.textContent ?? ''));

      // HDR labels should include 0, 2.0 (midpoint), 4.0 (max)
      expect(labels).toContain('0');
      expect(labels).toContain('2.0');
      expect(labels).toContain('4.0');
    });

    it('P3-032: scale labels revert to SDR when HDR deactivated', () => {
      histogram.setHDRMode(true, 4.0);
      histogram.setHDRMode(false);

      const el = histogram.render();
      const spans = el.querySelectorAll('div > span');
      const labels: string[] = [];
      spans.forEach(span => labels.push(span.textContent ?? ''));

      expect(labels).toContain('0');
      expect(labels).toContain('128');
      expect(labels).toContain('255');
    });
  });

  describe('HDR mode with draw()', () => {
    it('P3-040: draw does not throw when HDR active with no data', () => {
      histogram.setHDRMode(true, 4.0);
      expect(() => histogram.draw()).not.toThrow();
    });

    it('P3-041: draw does not throw when HDR active with SDR data', () => {
      histogram.setHDRMode(true, 4.0);
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      histogram.calculate(imageData);
      expect(() => histogram.draw()).not.toThrow();
    });

    it('P3-042: setHDRMode triggers redraw when data is present', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 });
      histogram.calculate(imageData);

      const drawSpy = vi.spyOn(histogram, 'draw');
      histogram.setHDRMode(true);
      expect(drawSpy).toHaveBeenCalled();
      drawSpy.mockRestore();
    });

    it('P3-043: setHDRMode does not trigger redraw when no data', () => {
      const drawSpy = vi.spyOn(histogram, 'draw');
      histogram.setHDRMode(true);
      expect(drawSpy).not.toHaveBeenCalled();
      drawSpy.mockRestore();
    });
  });

  describe('HDR mode matches WebGLScopes API pattern', () => {
    it('P3-050: setHDRMode signature matches WebGLScopes', () => {
      // setHDRMode(active: boolean, headroom?: number): void
      expect(typeof histogram.setHDRMode).toBe('function');

      // Should accept both forms without throwing
      expect(() => histogram.setHDRMode(true)).not.toThrow();
      expect(() => histogram.setHDRMode(true, 3.5)).not.toThrow();
      expect(() => histogram.setHDRMode(false)).not.toThrow();
    });

    it('P3-051: getMaxValue signature matches WebGLScopes', () => {
      expect(typeof histogram.getMaxValue).toBe('function');

      // SDR default
      histogram.setHDRMode(false);
      expect(histogram.getMaxValue()).toBe(1.0);

      // HDR default headroom
      histogram.setHDRMode(true);
      expect(histogram.getMaxValue()).toBe(4.0);

      // HDR custom headroom
      histogram.setHDRMode(true, 2.5);
      expect(histogram.getMaxValue()).toBe(2.5);
    });
  });

  describe('HDR clipping statistics', () => {
    it('P3-060: clipping statistics are calculated for HDR data', () => {
      histogram.setHDRMode(true, 4.0);

      // All pixels at 0.0 (shadows) and maxValue (highlights)
      const hdrImage = createHDRImageData(2, 1, [
        { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // shadow
        { r: 4.0, g: 4.0, b: 4.0, a: 1.0 }, // highlight at max
      ]);

      const data = histogram.calculateHDR(hdrImage);
      expect(data.clipping.shadows).toBeGreaterThan(0);
      expect(data.clipping.highlights).toBeGreaterThan(0);
      expect(data.pixelCount).toBe(2);
    });

    it('P3-061: HDR mid-range values do not count as clipping', () => {
      histogram.setHDRMode(true, 4.0);

      const hdrImage = createHDRImageData(1, 1, [
        { r: 2.0, g: 2.0, b: 2.0, a: 1.0 },
      ]);

      const data = histogram.calculateHDR(hdrImage);
      expect(data.clipping.shadows).toBe(0);
      expect(data.clipping.highlights).toBe(0);
    });
  });

  describe('updateHDR method', () => {
    it('P3-070: updateHDR does not throw with valid float data', () => {
      histogram.setHDRMode(true, 4.0);
      const floatData = new Float32Array([
        0.5, 0.3, 0.1, 1.0,
        2.0, 1.5, 0.8, 1.0,
      ]);
      expect(() => histogram.updateHDR(floatData, 2, 1)).not.toThrow();
    });

    it('P3-071: updateHDR processes float data through calculateHDR', () => {
      histogram.setHDRMode(true, 4.0);
      const spy = vi.spyOn(histogram, 'calculateHDR');
      const floatData = new Float32Array([0.5, 0.3, 0.1, 1.0]);

      histogram.updateHDR(floatData, 1, 1);

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('P3-072: updateHDR bins HDR values > 1.0 correctly', () => {
      histogram.setHDRMode(true, 4.0);
      // Value 3.0 with maxValue=4.0: bin = round(3.0 * 255/4.0) = round(191.25) = 191
      const floatData = new Float32Array([3.0, 0.0, 0.0, 1.0]);

      histogram.updateHDR(floatData, 1, 1);

      const data = histogram.getData();
      expect(data).not.toBeNull();
      const expectedBin = Math.round(3.0 * (255 / 4.0));
      expect(data!.red[expectedBin]).toBe(1);
    });

    it('P3-073: updateHDR with zero-size data does not throw', () => {
      histogram.setHDRMode(true, 4.0);
      const floatData = new Float32Array(0);
      expect(() => histogram.updateHDR(floatData, 0, 0)).not.toThrow();
    });

    it('P3-074: updateHDR updates clipping display', () => {
      histogram.setHDRMode(true, 4.0);
      const floatData = new Float32Array([
        0.0, 0.0, 0.0, 1.0, // shadow pixel
        4.0, 4.0, 4.0, 1.0, // highlight at max
      ]);

      histogram.updateHDR(floatData, 2, 1);

      const data = histogram.getData();
      expect(data).not.toBeNull();
      expect(data!.clipping.shadows).toBeGreaterThan(0);
      expect(data!.clipping.highlights).toBeGreaterThan(0);
    });

    it('P3-075: updateHDR handles NaN values without throwing', () => {
      histogram.setHDRMode(true, 4.0);
      const floatData = new Float32Array([NaN, NaN, NaN, 1.0, 0.5, 0.5, 0.5, 1.0]);
      expect(() => histogram.updateHDR(floatData, 2, 1)).not.toThrow();
      const data = histogram.getData();
      expect(data).not.toBeNull();
      expect(data!.pixelCount).toBe(2);
    });

    it('P3-076: updateHDR handles Infinity values without throwing', () => {
      histogram.setHDRMode(true, 4.0);
      const floatData = new Float32Array([Infinity, -Infinity, 0.5, 1.0]);
      expect(() => histogram.updateHDR(floatData, 1, 1)).not.toThrow();
      const data = histogram.getData();
      expect(data).not.toBeNull();
    });

    it('P3-077: updateHDR clamps negative values to bin 0', () => {
      histogram.setHDRMode(true, 4.0);
      const floatData = new Float32Array([-0.5, -0.5, -0.5, 1.0]);
      histogram.updateHDR(floatData, 1, 1);
      const data = histogram.getData();
      expect(data).not.toBeNull();
      expect(data!.red[0]).toBe(1);
    });
  });
});
