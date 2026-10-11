/**
 * DPX packing / encoding / row-layout tests.
 *
 * Synthetic files are built from component code values with an encoder
 * written from the SMPTE 268M layout rules (independent of the decoder),
 * plus reference files written by FFmpeg.
 */

import { describe, it, expect } from 'vitest';
import { decodeDPX, getDPXInfo, unpackDPXPacked, DPXPacking } from './DPXDecoder';
import { DPX_REFERENCE_FILES } from '../../test/fixtures/dpxReferenceFiles';

interface BuildOptions {
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  bitDepth: 8 | 10 | 12 | 16;
  packing: number;
  bigEndian?: boolean;
  encoding?: number;
  eolPadding?: number;
  /** Image element data offset (808); the file header offset (4) is set to `headerOffset` */
  elementOffset?: number;
  headerOffset?: number;
  /** Code values, row-major, componentsPerRow * height entries */
  values: number[];
}

/** Write rows according to SMPTE 268M packing rules. */
function encodeRows(o: BuildOptions): Uint8Array {
  const { width, height, channels, bitDepth, packing } = o;
  const le = !o.bigEndian;
  const cpr = width * channels;
  const eol = o.eolPadding ?? 0;
  const rows: Uint8Array[] = [];

  for (let row = 0; row < height; row++) {
    const vals = o.values.slice(row * cpr, (row + 1) * cpr);
    let bytes: Uint8Array;
    if ((bitDepth === 10 || bitDepth === 12) && packing === DPXPacking.PACKED) {
      // Continuous bitstream, LSB-first within 32-bit words
      const words = new Uint32Array(Math.ceil((cpr * bitDepth) / 32));
      vals.forEach((v, i) => {
        for (let b = 0; b < bitDepth; b++) {
          if ((v >> b) & 1) {
            const bit = i * bitDepth + b;
            words[bit >> 5] = (words[bit >> 5]! | (1 << (bit & 31))) >>> 0;
          }
        }
      });
      bytes = new Uint8Array(words.length * 4);
      const v = new DataView(bytes.buffer);
      words.forEach((w, i) => v.setUint32(i * 4, w, le));
    } else if (bitDepth === 10) {
      const pad = packing === DPXPacking.FILLED_METHOD_B ? 0 : 2;
      const nWords = Math.ceil(cpr / 3);
      bytes = new Uint8Array(nWords * 4);
      const v = new DataView(bytes.buffer);
      for (let w = 0; w < nWords; w++) {
        let word = 0;
        for (let k = 0; k < 3; k++) {
          const val = vals[w * 3 + k] ?? 0;
          word |= val << ((2 - k) * 10 + pad);
        }
        v.setUint32(w * 4, word >>> 0, le);
      }
    } else if (bitDepth === 8) {
      bytes = new Uint8Array(vals);
    } else {
      bytes = new Uint8Array(cpr * 2);
      const v = new DataView(bytes.buffer);
      vals.forEach((val, i) => {
        const stored = bitDepth === 12 ? (packing === DPXPacking.FILLED_METHOD_B ? val : val << 4) : val;
        v.setUint16(i * 2, stored, le);
      });
    }
    const padded = new Uint8Array(bytes.length + eol);
    padded.set(bytes);
    rows.push(padded);
  }

  const total = rows.reduce((s, r) => s + r.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const r of rows) {
    out.set(r, p);
    p += r.length;
  }
  return out;
}

function buildDPX(o: BuildOptions): ArrayBuffer {
  const data = encodeRows(o);
  const elementOffset = o.elementOffset ?? 2048;
  const buffer = new ArrayBuffer(elementOffset + data.length);
  const view = new DataView(buffer);
  const le = !o.bigEndian;
  view.setUint32(0, o.bigEndian ? 0x53445058 : 0x58504453, false);
  view.setUint32(4, o.headerOffset ?? elementOffset, le);
  view.setUint16(768, 0, le);
  view.setUint16(770, 1, le);
  view.setUint32(772, o.width, le);
  view.setUint32(776, o.height, le);
  view.setUint8(800, o.channels === 1 ? 6 : o.channels === 4 ? 51 : 50);
  view.setUint8(801, 0);
  view.setUint8(803, o.bitDepth);
  view.setUint16(804, o.packing, le);
  view.setUint16(806, o.encoding ?? 0, le);
  view.setUint32(808, elementOffset, le);
  view.setUint32(812, o.eolPadding ?? 0xffffffff, le);
  new Uint8Array(buffer, elementOffset).set(data);
  return buffer;
}

function codeValues(n: number, max: number): number[] {
  return Array.from({ length: n }, (_, i) => (i * 389 + 17) % (max + 1));
}

function expectDecoded(data: Float32Array, o: BuildOptions): void {
  const max = 2 ** o.bitDepth - 1;
  const n = o.width * o.height;
  for (let p = 0; p < n; p++) {
    for (let c = 0; c < o.channels; c++) {
      const expected = (o.values[p * o.channels + c] ?? 0) / max;
      const outC = o.channels === 1 ? 0 : c;
      expect(data[p * 4 + outC]).toBeCloseTo(expected, 6);
    }
  }
}

describe('DPX packing and layout', () => {
  const variants: Array<{ bitDepth: 10 | 12; packing: DPXPacking; name: string }> = [
    { bitDepth: 10, packing: DPXPacking.FILLED_METHOD_A, name: '10-bit Method A' },
    { bitDepth: 10, packing: DPXPacking.FILLED_METHOD_B, name: '10-bit Method B' },
    { bitDepth: 10, packing: DPXPacking.PACKED, name: '10-bit packed' },
    { bitDepth: 12, packing: DPXPacking.FILLED_METHOD_A, name: '12-bit Method A' },
    { bitDepth: 12, packing: DPXPacking.FILLED_METHOD_B, name: '12-bit Method B' },
    { bitDepth: 12, packing: DPXPacking.PACKED, name: '12-bit packed' },
  ];

  for (const { bitDepth, packing, name } of variants) {
    for (const bigEndian of [true, false]) {
      it(`DPX-PK: decodes ${name} (${bigEndian ? 'BE' : 'LE'}, odd width, RGB)`, async () => {
        const o: BuildOptions = {
          width: 5,
          height: 3,
          channels: 3,
          bitDepth,
          packing,
          bigEndian,
          values: codeValues(5 * 3 * 3, 2 ** bitDepth - 1),
        };
        const result = await decodeDPX(buildDPX(o));
        expectDecoded(result.data, o);
        expect(result.metadata.packing).toBe(packing);
      });
    }
  }

  it('DPX-PK: 10-bit Method B differs from Method A on the same words', async () => {
    const o: BuildOptions = {
      width: 1,
      height: 1,
      channels: 3,
      bitDepth: 10,
      packing: DPXPacking.FILLED_METHOD_B,
      values: [1023, 0, 512],
    };
    const result = await decodeDPX(buildDPX(o));
    expect(result.data[0]).toBeCloseTo(1, 6);
    expect(result.data[1]).toBeCloseTo(0, 6);
    expect(result.data[2]).toBeCloseTo(512 / 1023, 6);
  });

  it('DPX-PK: honours end-of-line padding', async () => {
    const o: BuildOptions = {
      width: 3,
      height: 4,
      channels: 3,
      bitDepth: 10,
      packing: DPXPacking.FILLED_METHOD_A,
      eolPadding: 12,
      values: codeValues(3 * 4 * 3, 1023),
    };
    const result = await decodeDPX(buildDPX(o));
    expectDecoded(result.data, o);
  });

  it('DPX-PK: uses the image element data offset (808)', async () => {
    const o: BuildOptions = {
      width: 2,
      height: 2,
      channels: 3,
      bitDepth: 16,
      packing: 0,
      elementOffset: 4096,
      headerOffset: 2048,
      values: codeValues(2 * 2 * 3, 65535),
    };
    expect(getDPXInfo(buildDPX(o))?.dataOffset).toBe(4096);
    const result = await decodeDPX(buildDPX(o));
    expectDecoded(result.data, o);
  });

  it('DPX-PK: 8-bit luma rows padded to 4 bytes (FFmpeg layout)', async () => {
    // 5 bytes per row, padded to 8; eol field 0
    const width = 5;
    const height = 3;
    const values = codeValues(width * height, 255);
    const elementOffset = 2048;
    const buffer = new ArrayBuffer(elementOffset + 8 * height);
    const v = new DataView(buffer);
    v.setUint32(0, 0x53445058, false);
    v.setUint32(4, elementOffset, false);
    v.setUint16(770, 1, false);
    v.setUint32(772, width, false);
    v.setUint32(776, height, false);
    v.setUint8(800, 6);
    v.setUint8(803, 8);
    v.setUint32(808, elementOffset, false);
    v.setUint32(812, 0, false);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) v.setUint8(elementOffset + y * 8 + x, values[y * width + x] ?? 0);
    }
    const result = await decodeDPX(buffer);
    for (let i = 0; i < width * height; i++) {
      expect(result.data[i * 4]).toBeCloseTo((values[i] ?? 0) / 255, 6);
    }
  });

  it('DPX-PK: rejects run-length encoded data with a clear error', async () => {
    const o: BuildOptions = {
      width: 2,
      height: 2,
      channels: 3,
      bitDepth: 10,
      packing: 1,
      encoding: 1,
      values: codeValues(12, 1023),
    };
    await expect(decodeDPX(buildDPX(o))).rejects.toThrow(/run-length/);
  });

  it('DPX-PK: unpackDPXPacked reads components spanning word boundaries', () => {
    // Three 12-bit values packed LSB-first: 0xABC, 0x123, 0xFFF -> 36 bits over 2 words
    const words = new Uint32Array([(0xabc | (0x123 << 12) | (0xff << 24)) >>> 0, 0xf]);
    const view = new DataView(new ArrayBuffer(8));
    view.setUint32(0, words[0]!, false);
    view.setUint32(4, words[1]!, false);
    const out = unpackDPXPacked(view, 3, 1, 1, 12, true);
    expect(Math.round(out[0]! * 4095)).toBe(0xabc);
    expect(Math.round(out[1]! * 4095)).toBe(0x123);
    expect(Math.round(out[2]! * 4095)).toBe(0xfff);
  });
});

describe('DPX vs FFmpeg reference files', () => {
  function b64(s: string): Uint8Array {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }

  for (const [tag, files] of Object.entries(DPX_REFERENCE_FILES)) {
    it(`decodes FFmpeg ${tag} DPX like FFmpeg`, async () => {
      const result = await decodeDPX(b64(files.dpx).buffer as ArrayBuffer);
      const refBytes = b64(files.rgba64le);
      const ref = new DataView(refBytes.buffer);
      expect(result.width).toBe(13);
      expect(result.height).toBe(7);
      // 8-bit references went through swscale, allow one code value of slack
      const tolerance = tag === '8' ? 1.5 / 255 : 1e-4;
      let maxErr = 0;
      for (let i = 0; i < 13 * 7 * 3; i++) {
        const px = Math.floor(i / 3);
        const c = i % 3;
        const expected = ref.getUint16((px * 4 + c) * 2, true) / 65535;
        maxErr = Math.max(maxErr, Math.abs((result.data[px * 4 + c] ?? NaN) - expected));
      }
      expect(maxErr).toBeLessThan(tolerance);
    });
  }
});
