/**
 * EXR decoder tests against files written by the reference OpenEXR library.
 *
 * Covers the real on-disk formats of RLE, ZIPS, ZIP, PIZ and PXR24, the
 * DECREASING_Y line order (scanline, multi-part), tiles, and subsampled
 * luminance/chroma (Y, RY, BY) images.
 */

import { describe, it, expect } from 'vitest';
import { decodeEXR, computeLuminanceWeights, EXRLineOrder } from './EXRDecoder';
import { EXR_REFERENCE_FILES } from '../../test/fixtures/exrReferenceFiles';

function load(name: string): ArrayBuffer {
  const b64 = EXR_REFERENCE_FILES[name];
  if (!b64) throw new Error(`missing fixture ${name}`);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function expectRGBFormulas(data: Float32Array, width: number, height: number): void {
  let maxErr = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const exp = [x / 10, y / 37, 0.25 + ((x + y) % 3) * 0.25];
      for (let c = 0; c < 3; c++) {
        maxErr = Math.max(maxErr, Math.abs((data[i + c] ?? NaN) - (exp[c] ?? 0)));
      }
      expect(data[i + 3]).toBe(1);
    }
  }
  expect(maxErr).toBeLessThan(2e-3);
}

describe('EXR decoder vs OpenEXR reference files', () => {
  describe('RGB HALF scanline (10x37, partial last block)', () => {
    for (const name of [
      'rgb_none_dec',
      'rgb_rle_dec',
      'rgb_zips_dec',
      'rgb_zip_dec',
      'rgb_zip_inc',
      'rgb_piz_dec',
      'rgb_piz_inc',
      'rgb_pxr24_dec',
    ]) {
      it(`decodes ${name}`, async () => {
        const result = await decodeEXR(load(name));
        expect(result.width).toBe(10);
        expect(result.height).toBe(37);
        if (name.endsWith('_dec')) expect(result.header.lineOrder).toBe(EXRLineOrder.DECREASING_Y);
        expectRGBFormulas(result.data, 10, 37);
      });
    }
  });

  describe('tiled and multi-part', () => {
    for (const name of ['tiled_piz', 'tiled_zip']) {
      it(`decodes ${name}`, async () => {
        const result = await decodeEXR(load(name));
        expect(result.width).toBe(45);
        expect(result.height).toBe(37);
        expectRGBFormulas(result.data, 45, 37);
      });
    }

    for (const name of ['mp_piz', 'mp_zip']) {
      it(`decodes DECREASING_Y part 0 of ${name}`, async () => {
        const result = await decodeEXR(load(name), { partIndex: 0 });
        expect(result.header.lineOrder).toBe(EXRLineOrder.DECREASING_Y);
        expectRGBFormulas(result.data, 45, 37);
      });

      it(`decodes DECREASING_Y part 1 of ${name}`, async () => {
        const result = await decodeEXR(load(name), { partIndex: 1 });
        // Part 1 stores (B, R, G) of part 0's formulas in (R, G, B)
        const w = 45;
        for (const [x, y] of [
          [0, 0],
          [44, 36],
          [7, 20],
        ] as const) {
          const i = (y * w + x) * 4;
          expect(result.data[i]).toBeCloseTo(0.25 + ((x + y) % 3) * 0.25, 2);
          expect(result.data[i + 1]).toBeCloseTo(x / 10, 2);
          expect(result.data[i + 2]).toBeCloseTo(y / 37, 2);
        }
      });
    }
  });

  describe('noise content (long Huffman codes, 16-bit wavelet, FLOAT channels)', () => {
    for (const name of ['noise_piz_inc', 'noise_piz_dec', 'noise_zip_dec']) {
      it(`${name} matches the uncompressed file exactly`, async () => {
        const ref = await decodeEXR(load('noise_none_inc'));
        const result = await decodeEXR(load(name));
        expect(result.width).toBe(24);
        expect(result.height).toBe(40);
        expect(Array.from(result.data)).toEqual(Array.from(ref.data));
      });
    }
  });

  describe('luminance/chroma with 2x2 subsampled RY/BY', () => {
    const [yr, yg, yb] = computeLuminanceWeights();

    for (const name of ['yc_none_dec', 'yc_rle_dec', 'yc_zip_dec', 'yc_piz_dec', 'yc_piz_inc', 'yc_pxr24_dec']) {
      it(`converts ${name} to RGB`, async () => {
        const result = await decodeEXR(load(name));
        expect(result.width).toBe(10);
        expect(result.height).toBe(38);
        let maxErr = 0;
        for (let y = 0; y < 38; y++) {
          for (let x = 0; x < 10; x++) {
            const sx = x >> 1;
            const sy = y >> 1;
            const Y = 0.2 + x / 20 + y / 100;
            const ry = 0.1 + sx * 0.05 + sy * 0.002;
            const by = -0.05 + sy * 0.01 - sx * 0.003;
            const r = (ry + 1) * Y;
            const b = (by + 1) * Y;
            const g = (Y - r * yr - b * yb) / yg;
            const i = (y * 10 + x) * 4;
            maxErr = Math.max(
              maxErr,
              Math.abs((result.data[i] ?? NaN) - r),
              Math.abs((result.data[i + 1] ?? NaN) - g),
              Math.abs((result.data[i + 2] ?? NaN) - b),
            );
            expect(result.data[i + 3]).toBe(1);
          }
        }
        expect(maxErr).toBeLessThan(5e-3);
      });
    }
  });

  describe('computeLuminanceWeights', () => {
    it('defaults to Rec.709 weights', () => {
      const [r, g, b] = computeLuminanceWeights();
      expect(r).toBeCloseTo(0.2126, 3);
      expect(g).toBeCloseTo(0.7152, 3);
      expect(b).toBeCloseTo(0.0722, 3);
    });

    it('derives weights from custom chromaticities (Rec.2020)', () => {
      const [r, g, b] = computeLuminanceWeights(
        new Float32Array([0.708, 0.292, 0.17, 0.797, 0.131, 0.046, 0.3127, 0.329]),
      );
      expect(r).toBeCloseTo(0.2627, 3);
      expect(g).toBeCloseTo(0.678, 3);
      expect(b).toBeCloseTo(0.0593, 3);
    });
  });
});
