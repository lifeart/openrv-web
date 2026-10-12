/**
 * EXR PIZ Codec / Huffman Unit Tests
 *
 * End-to-end PIZ decoding of real OpenEXR output is covered by
 * EXRDecoder.reference.test.ts; these tests cover the building blocks.
 */

import { describe, it, expect } from 'vitest';
import { decompressPIZ, reverseLutFromBitmap, wav2Decode, BITMAP_SIZE } from './EXRPIZCodec';
import { hufUncompress } from './EXRHuffman';

// --- Test-side port of OpenEXR ImfWav.cpp encoder (wenc14/wenc16/wav2Encode) ---

function wenc14(a: number, b: number): [number, number] {
  const as = (a << 16) >> 16;
  const bs = (b << 16) >> 16;
  const ms = (as + bs) >> 1;
  const ds = as - bs;
  return [ms & 0xffff, ds & 0xffff];
}

function wenc16(a: number, b: number): [number, number] {
  const ao = (a + (1 << 15)) & 0xffff;
  let m = (ao + b) >> 1;
  let d = ao - b;
  if (d < 0) m = (m + (1 << 15)) & 0xffff;
  d &= 0xffff;
  return [m & 0xffff, d];
}

function wav2Encode(buf: Uint16Array, nx: number, ox: number, ny: number, oy: number, mx: number): void {
  const enc = mx < 1 << 14 ? wenc14 : wenc16;
  const n = nx > ny ? ny : nx;
  let p = 1;
  let p2 = 2;
  while (p2 <= n) {
    let py = 0;
    const ey = oy * (ny - p2);
    const oy1 = oy * p;
    const oy2 = oy * p2;
    const ox1 = ox * p;
    const ox2 = ox * p2;
    for (; py <= ey; py += oy2) {
      let px = py;
      const ex = py + ox * (nx - p2);
      for (; px <= ex; px += ox2) {
        const p01 = px + ox1;
        const p10 = px + oy1;
        const p11 = p10 + ox1;
        const [i00, i01] = enc(buf[px] ?? 0, buf[p01] ?? 0);
        const [i10, i11] = enc(buf[p10] ?? 0, buf[p11] ?? 0);
        const [a0, a1] = enc(i00, i10);
        const [b0, b1] = enc(i01, i11);
        buf[px] = a0;
        buf[p10] = a1;
        buf[p01] = b0;
        buf[p11] = b1;
      }
      if (nx & p) {
        const p10 = px + oy1;
        const [i00, i10] = enc(buf[px] ?? 0, buf[p10] ?? 0);
        buf[px] = i00;
        buf[p10] = i10;
      }
    }
    if (ny & p) {
      let px = py;
      const ex = py + ox * (nx - p2);
      for (; px <= ex; px += ox2) {
        const p01 = px + ox1;
        const [i00, i01] = enc(buf[px] ?? 0, buf[p01] ?? 0);
        buf[px] = i00;
        buf[p01] = i01;
      }
    }
    p = p2;
    p2 <<= 1;
  }
}

describe('EXRPIZCodec', () => {
  describe('reverseLutFromBitmap', () => {
    it('PIZ-U030: empty bitmap maps only zero', () => {
      const { lut, maxValue } = reverseLutFromBitmap(new Uint8Array(BITMAP_SIZE));
      expect(maxValue).toBe(0);
      expect(lut[0]).toBe(0);
    });

    it('PIZ-U031: lists set values in ascending order after zero', () => {
      const bitmap = new Uint8Array(BITMAP_SIZE);
      for (const v of [5, 300, 65535]) bitmap[v >> 3]! |= 1 << (v & 7);
      const { lut, maxValue } = reverseLutFromBitmap(bitmap);
      expect(maxValue).toBe(3);
      expect(Array.from(lut.subarray(0, 4))).toEqual([0, 5, 300, 65535]);
    });
  });

  describe('wav2Decode', () => {
    const cases: Array<[number, number, number]> = [
      [1, 1, 100],
      [2, 2, 100],
      [5, 3, 1000],
      [8, 8, 16000],
      [7, 13, 65535],
      [16, 4, 65535],
    ];
    for (const [nx, ny, mx] of cases) {
      it(`PIZ-U050: inverts the OpenEXR encoder (${nx}x${ny}, max ${mx})`, () => {
        const original = new Uint16Array(nx * ny);
        let seed = nx * 31 + ny;
        for (let i = 0; i < original.length; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          original[i] = seed % (mx + 1);
        }
        const buf = new Uint16Array(original);
        wav2Encode(buf, nx, 1, ny, nx, mx);
        wav2Decode(buf, 0, nx, 1, ny, nx, mx);
        expect(Array.from(buf)).toEqual(Array.from(original));
      });
    }

    it('PIZ-U051: respects the start offset and sample stride (32-bit channels)', () => {
      const nx = 4;
      const ny = 3;
      const original = new Uint16Array(2 + nx * ny * 2);
      for (let i = 0; i < original.length; i++) original[i] = (i * 977) % 60000;
      const buf = new Uint16Array(original);
      // Encode the two interleaved word planes starting at index 2
      for (let j = 0; j < 2; j++) {
        const plane = new Uint16Array(nx * ny);
        for (let k = 0; k < plane.length; k++) plane[k] = buf[2 + k * 2 + j]!;
        wav2Encode(plane, nx, 1, ny, nx, 65535);
        for (let k = 0; k < plane.length; k++) buf[2 + k * 2 + j] = plane[k]!;
      }
      for (let j = 0; j < 2; j++) wav2Decode(buf, 2 + j, nx, 2, ny, nx * 2, 65535);
      expect(Array.from(buf)).toEqual(Array.from(original));
    });
  });

  describe('hufUncompress', () => {
    function header(im: number, iM: number, tableLength: number, nBits: number): number[] {
      const out = new Uint8Array(20);
      const v = new DataView(out.buffer);
      v.setUint32(0, im, true);
      v.setUint32(4, iM, true);
      v.setUint32(8, tableLength, true);
      v.setUint32(12, nBits, true);
      return Array.from(out);
    }

    it('HUF-U001: decodes a hand-built stream with a run-length code', () => {
      // Symbols 0 (len 1, code "1"), 1 (len 2, code "00"), 2 = run-length code (len 2, code "01").
      // Table: 6-bit lengths 1, 2, 2 -> 000001 000010 000010 -> 0x04 0x20 0x80
      // Data: 0 1 [rl 3] 0 -> "1" "00" "01" "00000011" "1" = 14 bits -> 0x88 0x1C
      const stream = new Uint8Array([...header(0, 2, 3, 14), 0x04, 0x20, 0x80, 0x88, 0x1c]);
      expect(Array.from(hufUncompress(stream, 6))).toEqual([0, 1, 1, 1, 1, 0]);
    });

    it('HUF-U002: rejects a truncated stream', () => {
      expect(() => hufUncompress(new Uint8Array(10), 4)).toThrow();
    });

    it('HUF-U003: rejects a stream that decodes to the wrong length', () => {
      const stream = new Uint8Array([...header(0, 2, 3, 14), 0x04, 0x20, 0x80, 0x88, 0x1c]);
      expect(() => hufUncompress(stream, 7)).toThrow();
    });

    it('HUF-U004: returns an empty array for nRaw = 0', () => {
      expect(hufUncompress(new Uint8Array(0), 0).length).toBe(0);
    });
  });

  describe('decompressPIZ', () => {
    it('PIZ-U001: returns zero-filled output for empty input', () => {
      const result = decompressPIZ(new Uint8Array(0), 8, [{ size: 2, nx: 4, ny: 1, ySampling: 1 }], 0, 1);
      expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('PIZ-U002: rejects a layout that does not match the block size', () => {
      const data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(() => decompressPIZ(data, 10, [{ size: 2, nx: 4, ny: 1, ySampling: 1 }], 0, 1)).toThrow();
    });

    it('PIZ-U003: rejects a truncated bitmap', () => {
      const data = new Uint8Array([0, 0, 10, 0, 1]);
      expect(() => decompressPIZ(data, 8, [{ size: 2, nx: 4, ny: 1, ySampling: 1 }], 0, 1)).toThrow();
    });
  });
});
