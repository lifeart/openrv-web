import { describe, it, expect } from 'vitest';
import {
  encodeEXR,
  floatToHalfBits,
  chromaticitiesForColorSpace,
  CHROMATICITIES_REC709,
  CHROMATICITIES_REC2020,
  CHROMATICITIES_P3_D65,
} from './EXRWriter';
import { decodeEXR, EXRCompression, EXRPixelType } from '../formats/EXRDecoder';

/** Reference IEEE 754 half -> float decode. */
function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 31) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

function rgbaRamp(width: number, height: number): Float32Array {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x * 0.5; // up to well above 1.0
      data[i + 1] = y * 0.25;
      data[i + 2] = 0.18 + x + y;
      data[i + 3] = x === 0 ? 0.5 : 1;
    }
  }
  return data;
}

describe('floatToHalfBits', () => {
  it('EXRW-001: encodes exact values', () => {
    expect(floatToHalfBits(0)).toBe(0);
    expect(floatToHalfBits(-0)).toBe(0x8000);
    expect(floatToHalfBits(1)).toBe(0x3c00);
    expect(floatToHalfBits(-2)).toBe(0xc000);
    expect(floatToHalfBits(65504)).toBe(0x7bff);
    expect(floatToHalfBits(2 ** -24)).toBe(0x0001); // smallest subnormal
  });

  it('EXRW-002: rounds to nearest and saturates to infinity', () => {
    expect(halfToFloat(floatToHalfBits(0.1))).toBeCloseTo(0.1, 4);
    expect(floatToHalfBits(1 + 2 ** -11)).toBe(0x3c00); // halfway, ties to even
    expect(floatToHalfBits(1 + 3 * 2 ** -11)).toBe(0x3c02); // halfway, ties to even (up)
    expect(floatToHalfBits(1e6)).toBe(0x7c00);
    expect(floatToHalfBits(Infinity)).toBe(0x7c00);
    expect(floatToHalfBits(-Infinity)).toBe(0xfc00);
    expect(Number.isNaN(halfToFloat(floatToHalfBits(NaN)))).toBe(true);
  });

  it('EXRW-003: round trips sampled finite halves exactly', () => {
    for (let h = 0; h < 0x7c00; h += 37) {
      const f = halfToFloat(h);
      expect(floatToHalfBits(f)).toBe(h);
    }
  });
});

describe('encodeEXR', () => {
  it('EXRW-010: half RGBA round trips through EXRDecoder', async () => {
    const width = 5;
    const height = 3;
    const data = rgbaRamp(width, height);
    const buffer = encodeEXR({ width, height, data });
    const decoded = await decodeEXR(buffer);

    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.channels).toBe(4);
    expect(decoded.header.compression).toBe(EXRCompression.NONE);
    expect(decoded.header.channels.map((c) => c.name)).toEqual(['A', 'B', 'G', 'R']);
    expect(decoded.header.channels.every((c) => c.pixelType === EXRPixelType.HALF)).toBe(true);
    for (let i = 0; i < data.length; i++) {
      expect(decoded.data[i]).toBeCloseTo(data[i]!, 2);
    }
    // Values above SDR white survive (scene-linear HDR)
    expect(decoded.data[(0 * width + 4) * 4]).toBeCloseTo(2, 3);
  });

  it('EXRW-011: float RGB is lossless and drops alpha', async () => {
    const width = 3;
    const height = 2;
    const data = rgbaRamp(width, height);
    data[0] = 123.456;
    const decoded = await decodeEXR(encodeEXR({ width, height, data, pixelType: 'float', includeAlpha: false }));
    expect(decoded.header.channels.map((c) => c.name)).toEqual(['B', 'G', 'R']);
    expect(decoded.header.channels.every((c) => c.pixelType === EXRPixelType.FLOAT)).toBe(true);
    expect(decoded.data[0]).toBeCloseTo(123.456, 3);
    expect(decoded.data[1]).toBe(data[1]);
  });

  it('EXRW-012: writes the chromaticities attribute', async () => {
    const data = rgbaRamp(2, 2);
    const decoded = await decodeEXR(encodeEXR({ width: 2, height: 2, data, chromaticities: CHROMATICITIES_REC2020 }));
    expect(Array.from(decoded.header.chromaticities!)).toEqual(CHROMATICITIES_REC2020.map((v) => Math.fround(v)));
  });

  it('EXRW-013: rows are stored top-to-bottom (first data row is y = 0)', async () => {
    const data = new Float32Array(1 * 2 * 4);
    data.set([1, 0, 0, 1], 0); // top: red
    data.set([0, 0, 1, 1], 4); // bottom: blue
    const decoded = await decodeEXR(encodeEXR({ width: 1, height: 2, data }));
    expect(Array.from(decoded.data.subarray(0, 4))).toEqual([1, 0, 0, 1]);
    expect(Array.from(decoded.data.subarray(4, 8))).toEqual([0, 0, 1, 1]);
  });

  it('EXRW-014: rejects bad sizes', () => {
    expect(() => encodeEXR({ width: 0, height: 1, data: new Float32Array(4) })).toThrow();
    expect(() => encodeEXR({ width: 2, height: 2, data: new Float32Array(4) })).toThrow();
  });
});

describe('chromaticitiesForColorSpace', () => {
  it('EXRW-020: maps export color spaces to primaries', () => {
    expect(chromaticitiesForColorSpace('srgb')).toBe(CHROMATICITIES_REC709);
    expect(chromaticitiesForColorSpace('display-p3')).toBe(CHROMATICITIES_P3_D65);
    expect(chromaticitiesForColorSpace('rec2020')).toBe(CHROMATICITIES_REC2020);
  });
});
