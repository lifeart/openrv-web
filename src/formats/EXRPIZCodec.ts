/**
 * EXRPIZCodec - PIZ wavelet compression codec for OpenEXR
 *
 * Follows OpenEXR's PizCompressor::uncompress:
 *   1. Read the value bitmap (minNonZero/maxNonZero byte range) and build the
 *      reverse LUT.
 *   2. Huffman-decode the 16-bit words (see EXRHuffman).
 *   3. Inverse 2D Haar wavelet per channel plane (and per 16-bit word of
 *      32-bit channels).
 *   4. Apply the reverse LUT.
 *   5. Re-interleave the channel planes into scanline order (respecting
 *      channel y-subsampling).
 *
 * The decompressed planes hold, for each channel in header order,
 * `nx * ny * (size / 2)` 16-bit words, where nx/ny are the number of samples
 * of that channel inside the block.
 */

import { DecoderError } from '../core/errors';
import { hufUncompress } from './EXRHuffman';

const USHORT_RANGE = 1 << 16;
const BITMAP_SIZE = USHORT_RANGE >> 3; // 8192 bytes

/** Per-channel sample layout of one PIZ block. */
export interface PIZChannelLayout {
  /** Bytes per sample: 2 (HALF) or 4 (FLOAT/UINT). */
  size: number;
  /** Samples per line in this block. */
  nx: number;
  /** Lines with samples in this block. */
  ny: number;
  /** Vertical subsampling factor. */
  ySampling: number;
}

/** Python-style modulo (result has the sign of the divisor). */
function modp(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * Build the reverse LUT from the bitmap (reverseLutFromBitmap).
 * Returns the LUT and the maximum LUT index.
 */
export function reverseLutFromBitmap(bitmap: Uint8Array): { lut: Uint16Array; maxValue: number } {
  const lut = new Uint16Array(USHORT_RANGE);
  let k = 0;
  for (let i = 0; i < USHORT_RANGE; i++) {
    if (i === 0 || (bitmap[i >> 3] ?? 0) & (1 << (i & 7))) {
      lut[k++] = i;
    }
  }
  return { lut, maxValue: k - 1 };
}

function wdec14(l: number, h: number): [number, number] {
  const ls = (l << 16) >> 16; // to signed short
  const hs = (h << 16) >> 16;
  const ai = ls + (hs & 1) + (hs >> 1);
  const as = (ai << 16) >> 16;
  const bs = ((ai - hs) << 16) >> 16;
  return [as & 0xffff, bs & 0xffff];
}

const A_OFFSET = 1 << 15;
const MOD_MASK = 0xffff;

function wdec16(l: number, h: number): [number, number] {
  const m = l;
  const d = h;
  const bb = (m - (d >> 1)) & MOD_MASK;
  const aa = (d + bb - A_OFFSET) & MOD_MASK;
  return [aa, bb];
}

/**
 * Inverse 2D Haar wavelet transform (OpenEXR ImfWav.cpp `wav2Decode`), in place.
 *
 * @param buf - Word buffer
 * @param start - Index of the first word of the plane
 * @param nx - Number of samples per row
 * @param ox - Stride between samples in a row
 * @param ny - Number of rows
 * @param oy - Stride between rows
 * @param mx - Maximum value (selects 14-bit vs 16-bit lifting)
 */
export function wav2Decode(
  buf: Uint16Array,
  start: number,
  nx: number,
  ox: number,
  ny: number,
  oy: number,
  mx: number,
): void {
  const w14 = mx < 1 << 14;
  const dec = w14 ? wdec14 : wdec16;
  const n = nx > ny ? ny : nx;
  let p = 1;
  while (p <= n) p <<= 1;
  p >>= 1;
  let p2 = p;
  p >>= 1;

  while (p >= 1) {
    let py = start;
    const ey = start + oy * (ny - p2);
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
        const [i00, i10] = dec(buf[px] ?? 0, buf[p10] ?? 0);
        const [i01, i11] = dec(buf[p01] ?? 0, buf[p11] ?? 0);
        const [a0, a1] = dec(i00, i01);
        const [b0, b1] = dec(i10, i11);
        buf[px] = a0;
        buf[p01] = a1;
        buf[p10] = b0;
        buf[p11] = b1;
      }
      // Odd column
      if (nx & p) {
        const p10 = px + oy1;
        const [i00, i10] = dec(buf[px] ?? 0, buf[p10] ?? 0);
        buf[p10] = i10;
        buf[px] = i00;
      }
    }

    // Odd line
    if (ny & p) {
      let px = py;
      const ex = py + ox * (nx - p2);
      for (; px <= ex; px += ox2) {
        const p01 = px + ox1;
        const [i00, i01] = dec(buf[px] ?? 0, buf[p01] ?? 0);
        buf[p01] = i01;
        buf[px] = i00;
      }
    }

    p2 = p;
    p >>= 1;
  }
}

/**
 * Decompress one PIZ block.
 *
 * @param compressedData - The compressed block bytes
 * @param uncompressedSize - Expected size of the block in scanline layout (bytes)
 * @param channels - Per-channel sample layout of the block, in header order
 * @param y0 - Absolute y coordinate of the first line of the block
 * @param numLines - Number of lines in the block
 * @returns Decompressed data in standard EXR scanline layout (little-endian)
 */
export function decompressPIZ(
  compressedData: Uint8Array,
  uncompressedSize: number,
  channels: PIZChannelLayout[],
  y0: number,
  numLines: number,
): Uint8Array {
  const result = new Uint8Array(uncompressedSize);
  if (compressedData.length === 0 || uncompressedSize === 0) {
    return result;
  }

  const view = new DataView(compressedData.buffer, compressedData.byteOffset, compressedData.byteLength);
  if (compressedData.length < 4) throw new DecoderError('EXR', 'PIZ: block too short');

  // 1. Bitmap
  const minNonZero = view.getUint16(0, true);
  const maxNonZero = view.getUint16(2, true);
  let pos = 4;
  if (maxNonZero >= BITMAP_SIZE) throw new DecoderError('EXR', 'PIZ: invalid bitmap range');

  const bitmap = new Uint8Array(BITMAP_SIZE);
  if (minNonZero <= maxNonZero) {
    const len = maxNonZero - minNonZero + 1;
    if (pos + len > compressedData.length) throw new DecoderError('EXR', 'PIZ: truncated bitmap');
    bitmap.set(compressedData.subarray(pos, pos + len), minNonZero);
    pos += len;
  }
  const { lut, maxValue } = reverseLutFromBitmap(bitmap);

  // 2. Huffman
  if (pos + 4 > compressedData.length) throw new DecoderError('EXR', 'PIZ: truncated data length');
  const length = view.getInt32(pos, true);
  pos += 4;
  if (length < 0 || pos + length > compressedData.length) {
    throw new DecoderError('EXR', 'PIZ: invalid compressed data length');
  }

  let totalWords = 0;
  for (const ch of channels) totalWords += ch.nx * ch.ny * (ch.size / 2);
  if (totalWords * 2 !== uncompressedSize) {
    throw new DecoderError('EXR', 'PIZ: channel layout does not match block size');
  }

  const words = hufUncompress(compressedData.subarray(pos, pos + length), totalWords);

  // 3. Wavelet decode per channel plane
  const planeStarts: number[] = [];
  let start = 0;
  for (const ch of channels) {
    planeStarts.push(start);
    const wordsPerSample = ch.size / 2;
    for (let j = 0; j < wordsPerSample; j++) {
      wav2Decode(words, start + j, ch.nx, wordsPerSample, ch.ny, ch.nx * wordsPerSample, maxValue);
    }
    start += ch.nx * ch.ny * wordsPerSample;
  }

  // 4. Reverse LUT
  for (let i = 0; i < words.length; i++) {
    words[i] = lut[words[i] ?? 0] ?? 0;
  }

  // 5. Re-interleave planes into scanlines
  const out = new DataView(result.buffer);
  let outPos = 0;
  const cursors = planeStarts.slice();
  for (let line = 0; line < numLines; line++) {
    const y = y0 + line;
    for (const [c, ch] of channels.entries()) {
      if (modp(y, ch.ySampling) !== 0) continue;
      const n = ch.nx * (ch.size / 2);
      let cur = cursors[c] ?? 0;
      for (let i = 0; i < n; i++) {
        out.setUint16(outPos, words[cur++] ?? 0, true);
        outPos += 2;
      }
      cursors[c] = cur;
    }
  }

  return result;
}

export { USHORT_RANGE, BITMAP_SIZE };
