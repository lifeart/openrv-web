/**
 * Worker-safe Deinterlace & Film Emulation function tests.
 *
 * Tests the pure functions exported from effectProcessing.shared.ts
 * that are used by the Web Worker during playback.
 */
import { describe, it, expect } from 'vitest';
import {
  applyDeinterlaceWorker,
  applyFilmEmulationWorker,
  type WorkerDeinterlaceParams,
  type WorkerFilmEmulationParams,
} from './effectProcessing.shared';

// Helper: create a Uint8ClampedArray image buffer with alternating row patterns
function createInterlacedImage(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const val = y % 2 === 0 ? 200 : 50; // even rows bright, odd rows dark
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  return data;
}

// Helper: create solid color image
function createSolidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return data;
}

describe('applyDeinterlaceWorker', () => {
  it('DW-001: weave mode is a no-op', () => {
    const data = createInterlacedImage(4, 4);
    const original = new Uint8ClampedArray(data);
    const params: WorkerDeinterlaceParams = { method: 'weave', fieldOrder: 'tff', enabled: true };
    applyDeinterlaceWorker(data, 4, 4, params);
    expect(data).toEqual(original);
  });

  it('DW-002: disabled is a no-op', () => {
    const data = createInterlacedImage(4, 4);
    const original = new Uint8ClampedArray(data);
    const params: WorkerDeinterlaceParams = { method: 'bob', fieldOrder: 'tff', enabled: false };
    applyDeinterlaceWorker(data, 4, 4, params);
    expect(data).toEqual(original);
  });

  it('DW-003: bob TFF interpolates odd rows', () => {
    const width = 4;
    const height = 4;
    const data = createInterlacedImage(width, height);
    const params: WorkerDeinterlaceParams = { method: 'bob', fieldOrder: 'tff', enabled: true };
    applyDeinterlaceWorker(data, width, height, params);

    // Even rows (0, 2) should be unchanged (200)
    expect(data[0]).toBe(200); // row 0 col 0 R
    expect(data[2 * width * 4]).toBe(200); // row 2 col 0 R

    // Odd rows (1, 3) should be interpolated: (200+200)/2 >> 1 = avg of neighbors
    // Row 1: avg(row0=200, row2=200) = 200
    expect(data[1 * width * 4]).toBe(200);
    // Row 3 (last): copies from row 2 = 200
    expect(data[3 * width * 4]).toBe(200);
  });

  it('DW-004: bob BFF interpolates even rows', () => {
    const width = 4;
    const height = 4;
    const data = createInterlacedImage(width, height);
    const params: WorkerDeinterlaceParams = { method: 'bob', fieldOrder: 'bff', enabled: true };
    applyDeinterlaceWorker(data, width, height, params);

    // Odd rows (1, 3) should be unchanged (50)
    expect(data[1 * width * 4]).toBe(50); // row 1 col 0 R
    expect(data[3 * width * 4]).toBe(50); // row 3 col 0 R

    // Even rows (0, 2) should be interpolated
    // Row 0 (first): copies from row 1 = 50
    expect(data[0]).toBe(50);
    // Row 2: avg(row1=50, row3=50) = 50
    expect(data[2 * width * 4]).toBe(50);
  });

  it('DW-005: bob correctly averages middle rows', () => {
    const width = 2;
    const height = 6;
    const data = new Uint8ClampedArray(width * height * 4);
    // Set specific values: row0=100, row1=0, row2=200, row3=0, row4=60, row5=0
    for (let x = 0; x < width; x++) {
      data[(0 * width + x) * 4] = 100;
      data[(2 * width + x) * 4] = 200;
      data[(4 * width + x) * 4] = 60;
      // Odd rows stay 0
    }
    // Set alpha to 255 for all pixels
    for (let i = 3; i < data.length; i += 4) data[i] = 255;

    const params: WorkerDeinterlaceParams = { method: 'bob', fieldOrder: 'tff', enabled: true };
    applyDeinterlaceWorker(data, width, height, params);

    // Row 1: avg(row0=100, row2=200) = 150
    expect(data[1 * width * 4]).toBe(150);
    // Row 3: avg(row2=200, row4=60) = 130
    expect(data[3 * width * 4]).toBe(130);
    // Row 5 (last): copies from row 4 = 60
    expect(data[5 * width * 4]).toBe(60);
  });

  it('DW-006: bob top row edge case copies from row below', () => {
    const width = 2;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    data[(1 * width + 0) * 4] = 77; // row 1, col 0, R
    data[(1 * width + 0) * 4 + 3] = 255;
    data[(0 * width + 0) * 4 + 3] = 255;

    const params: WorkerDeinterlaceParams = { method: 'bob', fieldOrder: 'bff', enabled: true };
    applyDeinterlaceWorker(data, width, height, params);

    // Row 0 (even, BFF interpolates even): copies from row 1
    expect(data[0]).toBe(77);
  });

  it('DW-007: blend mode averages each row with its neighbor', () => {
    const width = 2;
    const height = 4;
    const data = createInterlacedImage(width, height);
    // Row 0=200, Row 1=50, Row 2=200, Row 3=50
    const params: WorkerDeinterlaceParams = { method: 'blend', fieldOrder: 'tff', enabled: true };
    applyDeinterlaceWorker(data, width, height, params);

    // Blend: each row averaged with neighbor
    // Row 0 (even): avg(200, row1=50) = 125
    expect(data[0]).toBe(125);
    // Row 1 (odd): avg(50, row0=200) = 125
    expect(data[1 * width * 4]).toBe(125);
    // Row 2 (even): avg(200, row3=50) = 125
    expect(data[2 * width * 4]).toBe(125);
  });

  it('DW-008: alpha channel is preserved in bob mode', () => {
    const width = 2;
    const height = 4;
    const data = createSolidImage(width, height, 100, 100, 100, 128);
    const params: WorkerDeinterlaceParams = { method: 'bob', fieldOrder: 'tff', enabled: true };
    applyDeinterlaceWorker(data, width, height, params);

    // Alpha should be interpolated same as RGB (128 avg 128 = 128)
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(128);
    }
  });

  it('DW-009: single row image is handled safely', () => {
    const width = 4;
    const height = 1;
    const data = createSolidImage(width, height, 100, 150, 200, 255);
    const original = new Uint8ClampedArray(data);
    const params: WorkerDeinterlaceParams = { method: 'bob', fieldOrder: 'tff', enabled: true };
    // Should not crash
    applyDeinterlaceWorker(data, width, height, params);
    // Height=1, row 0 is even. TFF skips even rows => no change
    expect(data).toEqual(original);
  });
});

describe('applyFilmEmulationWorker', () => {
  it('FEW-001: disabled is a no-op', () => {
    const data = createSolidImage(2, 2, 128, 128, 128);
    const original = new Uint8ClampedArray(data);
    const params: WorkerFilmEmulationParams = {
      enabled: false, stock: 'kodak-portra-400', intensity: 100, grainIntensity: 0, grainSeed: 1,
    };
    applyFilmEmulationWorker(data, 2, 2, params);
    expect(data).toEqual(original);
  });

  it('FEW-002: zero intensity is a no-op', () => {
    const data = createSolidImage(2, 2, 128, 128, 128);
    const original = new Uint8ClampedArray(data);
    const params: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-portra-400', intensity: 0, grainIntensity: 0, grainSeed: 1,
    };
    applyFilmEmulationWorker(data, 2, 2, params);
    expect(data).toEqual(original);
  });

  it('FEW-003: unknown stock is a no-op', () => {
    const data = createSolidImage(2, 2, 128, 128, 128);
    const original = new Uint8ClampedArray(data);
    const params: WorkerFilmEmulationParams = {
      enabled: true, stock: 'nonexistent-stock', intensity: 100, grainIntensity: 0, grainSeed: 1,
    };
    applyFilmEmulationWorker(data, 2, 2, params);
    expect(data).toEqual(original);
  });

  it('FEW-004: enabled stock modifies pixel values', () => {
    const data = createSolidImage(2, 2, 128, 128, 128);
    const original = new Uint8ClampedArray(data);
    const params: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-portra-400', intensity: 100, grainIntensity: 0, grainSeed: 1,
    };
    applyFilmEmulationWorker(data, 2, 2, params);
    // At least some channel should differ (tone curve applied)
    let changed = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== original[i] || data[i + 1] !== original[i + 1] || data[i + 2] !== original[i + 2]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('FEW-005: lower intensity produces output closer to original', () => {
    const dataFull = createSolidImage(2, 2, 100, 150, 200);
    const dataHalf = createSolidImage(2, 2, 100, 150, 200);
    const original = createSolidImage(2, 2, 100, 150, 200);

    const full: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-ektar-100', intensity: 100, grainIntensity: 0, grainSeed: 1,
    };
    const half: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-ektar-100', intensity: 50, grainIntensity: 0, grainSeed: 1,
    };

    applyFilmEmulationWorker(dataFull, 2, 2, full);
    applyFilmEmulationWorker(dataHalf, 2, 2, half);

    // Half intensity should be closer to original than full intensity
    const diffFull = Math.abs(dataFull[0]! - original[0]!);
    const diffHalf = Math.abs(dataHalf[0]! - original[0]!);
    expect(diffHalf).toBeLessThanOrEqual(diffFull);
  });

  it('FEW-006: same grain seed produces identical output', () => {
    const data1 = createSolidImage(4, 4, 128, 128, 128);
    const data2 = createSolidImage(4, 4, 128, 128, 128);

    const params: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-portra-400', intensity: 100, grainIntensity: 80, grainSeed: 42,
    };

    applyFilmEmulationWorker(data1, 4, 4, params);
    applyFilmEmulationWorker(data2, 4, 4, params);

    expect(data1).toEqual(data2);
  });

  it('FEW-007: different grain seed produces different output', () => {
    const data1 = createSolidImage(4, 4, 128, 128, 128);
    const data2 = createSolidImage(4, 4, 128, 128, 128);

    const params1: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-portra-400', intensity: 100, grainIntensity: 80, grainSeed: 42,
    };
    const params2: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-portra-400', intensity: 100, grainIntensity: 80, grainSeed: 99,
    };

    applyFilmEmulationWorker(data1, 4, 4, params1);
    applyFilmEmulationWorker(data2, 4, 4, params2);

    // At least some pixels should differ due to different grain
    let differs = false;
    for (let i = 0; i < data1.length; i++) {
      if (data1[i] !== data2[i]) { differs = true; break; }
    }
    expect(differs).toBe(true);
  });

  it('FEW-008: alpha channel is preserved', () => {
    const data = createSolidImage(2, 2, 100, 150, 200, 128);
    const params: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-portra-400', intensity: 100, grainIntensity: 50, grainSeed: 1,
    };
    applyFilmEmulationWorker(data, 2, 2, params);
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(128);
    }
  });

  it('FEW-009: B&W stock desaturates output', () => {
    const data = createSolidImage(2, 2, 100, 150, 200);
    const params: WorkerFilmEmulationParams = {
      enabled: true, stock: 'kodak-tri-x-400', intensity: 100, grainIntensity: 0, grainSeed: 1,
    };
    applyFilmEmulationWorker(data, 2, 2, params);

    // B&W stock (saturation=0) should produce R=G=B for each pixel
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 1]).toBe(data[i + 2]);
    }
  });

  it('FEW-010: all known stocks are recognized', () => {
    const stocks = [
      'kodak-portra-400', 'kodak-ektar-100', 'fuji-pro-400h',
      'fuji-velvia-50', 'kodak-tri-x-400', 'ilford-hp5',
    ];
    for (const stock of stocks) {
      const data = createSolidImage(2, 2, 128, 128, 128);
      const original = new Uint8ClampedArray(data);
      const params: WorkerFilmEmulationParams = {
        enabled: true, stock, intensity: 100, grainIntensity: 0, grainSeed: 1,
      };
      applyFilmEmulationWorker(data, 2, 2, params);
      // Each stock should modify at least one pixel
      let changed = false;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== original[i] || data[i + 1] !== original[i + 1] || data[i + 2] !== original[i + 2]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    }
  });

  it('FEW-011: output values are clamped to valid range', () => {
    // Use extreme input values to test clamping
    const data = createSolidImage(2, 2, 255, 255, 255);
    const params: WorkerFilmEmulationParams = {
      enabled: true, stock: 'fuji-velvia-50', intensity: 100, grainIntensity: 100, grainSeed: 1,
    };
    applyFilmEmulationWorker(data, 2, 2, params);

    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });
});
