/**
 * EXRHuffman - OpenEXR Huffman decoder (ImfHuf.cpp `hufUncompress`)
 *
 * Used by PIZ compression. The compressed stream layout is:
 *
 *   uint32 LE  im          minimum symbol index in the code table
 *   uint32 LE  iM          maximum symbol index (also the run-length symbol)
 *   uint32 LE  tableLength (unused by the decoder)
 *   uint32 LE  nBits       number of bits in the encoded data
 *   uint32 LE  reserved
 *   packed code-length table (6-bit entries, MSB first, with zero runs)
 *   encoded bitstream (MSB first)
 *
 * Code lengths can exceed 32 bits, so codes are held as plain numbers and
 * compared arithmetically rather than with 32-bit bitwise operators.
 */

import { DecoderError } from '../core/errors';

const HUF_ENCBITS = 16;
const HUF_DECBITS = 14;
const HUF_ENCSIZE = (1 << HUF_ENCBITS) + 1;
const HUF_DECSIZE = 1 << HUF_DECBITS;
const SHORT_ZEROCODE_RUN = 59;
const LONG_ZEROCODE_RUN = 63;
const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;
const MAX_CODE_LENGTH = 58;
const HEADER_SIZE = 20;

/** MSB-first bit reader addressed by absolute bit position. */
class BitStream {
  constructor(
    private readonly data: Uint8Array,
    private readonly start: number,
    private readonly end: number,
  ) {}

  /** Read `n` (<= 24) bits at `bitPos` without consuming; bits past the end read as zero. */
  peek(bitPos: number, n: number): number {
    let byteIdx = this.start + (bitPos >>> 3);
    const bitOff = bitPos & 7;
    // Gather 4 bytes (32 bits) — enough for bitOff (<= 7) + n (<= 24)
    let acc = 0;
    for (let i = 0; i < 4; i++, byteIdx++) {
      acc = acc * 256 + (byteIdx < this.end ? (this.data[byteIdx] ?? 0) : 0);
    }
    const shift = 32 - bitOff - n;
    return Math.floor(acc / 2 ** shift) % 2 ** n;
  }

  /** Read `n` (<= 53) bits at `bitPos` as a number. */
  peekLong(bitPos: number, n: number): number {
    let value = 0;
    let pos = bitPos;
    let remaining = n;
    while (remaining > 0) {
      const take = Math.min(remaining, 24);
      value = value * 2 ** take + this.peek(pos, take);
      pos += take;
      remaining -= take;
    }
    return value;
  }
}

/** Read the packed code-length table. Returns the lengths and the number of bytes consumed. */
function unpackEncTable(
  data: Uint8Array,
  start: number,
  end: number,
  im: number,
  iM: number,
): { lengths: Uint8Array; bytesRead: number } {
  const lengths = new Uint8Array(HUF_ENCSIZE);
  const bits = new BitStream(data, start, end);
  let bitPos = 0;
  const maxBits = (end - start) * 8;

  for (let i = im; i <= iM; i++) {
    if (bitPos + 6 > maxBits) throw new DecoderError('EXR', 'Huffman: truncated code table');
    const l = bits.peek(bitPos, 6);
    bitPos += 6;

    if (l === LONG_ZEROCODE_RUN) {
      if (bitPos + 8 > maxBits) throw new DecoderError('EXR', 'Huffman: truncated code table');
      const zerun = bits.peek(bitPos, 8) + SHORTEST_LONG_RUN;
      bitPos += 8;
      if (i + zerun > iM + 1) throw new DecoderError('EXR', 'Huffman: code table overrun');
      i += zerun - 1; // lengths already zero
    } else if (l >= SHORT_ZEROCODE_RUN) {
      const zerun = l - SHORT_ZEROCODE_RUN + 2;
      if (i + zerun > iM + 1) throw new DecoderError('EXR', 'Huffman: code table overrun');
      i += zerun - 1;
    } else {
      lengths[i] = l;
    }
  }

  return { lengths, bytesRead: Math.ceil(bitPos / 8) };
}

/** Assign canonical codes (hufCanonicalCodeTable). Codes may exceed 32 bits. */
function canonicalCodes(lengths: Uint8Array): Float64Array {
  const counts = new Float64Array(MAX_CODE_LENGTH + 1);
  for (let i = 0; i < HUF_ENCSIZE; i++) {
    const l = lengths[i] ?? 0;
    counts[l] = (counts[l] ?? 0) + 1;
  }

  let c = 0;
  for (let l = MAX_CODE_LENGTH; l > 0; l--) {
    const nc = Math.floor((c + (counts[l] ?? 0)) / 2);
    counts[l] = c;
    c = nc;
  }

  const codes = new Float64Array(HUF_ENCSIZE);
  for (let i = 0; i < HUF_ENCSIZE; i++) {
    const l = lengths[i] ?? 0;
    if (l > 0) {
      codes[i] = counts[l] ?? 0;
      counts[l] = (counts[l] ?? 0) + 1;
    }
  }
  return codes;
}

/**
 * Decode an OpenEXR Huffman stream into `nRaw` 16-bit symbols.
 */
export function hufUncompress(data: Uint8Array, nRaw: number): Uint16Array {
  const out = new Uint16Array(nRaw);
  if (nRaw === 0) return out;
  if (data.length < HEADER_SIZE) throw new DecoderError('EXR', 'Huffman: stream too short');

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const im = view.getUint32(0, true);
  const iM = view.getUint32(4, true);
  const nBits = view.getUint32(12, true);

  if (im >= HUF_ENCSIZE || iM >= HUF_ENCSIZE || im > iM) {
    throw new DecoderError('EXR', 'Huffman: invalid code table bounds');
  }

  const { lengths, bytesRead } = unpackEncTable(data, HEADER_SIZE, data.length, im, iM);
  const codes = canonicalCodes(lengths);

  const streamStart = HEADER_SIZE + bytesRead;
  if (streamStart + Math.ceil(nBits / 8) > data.length) {
    throw new DecoderError('EXR', 'Huffman: encoded data exceeds stream');
  }

  // Fast table for codes of length <= HUF_DECBITS; long codes are listed per 14-bit prefix
  const fastLen = new Uint8Array(HUF_DECSIZE);
  const fastSym = new Uint32Array(HUF_DECSIZE);
  const longCodes = new Map<number, number[]>();

  for (let sym = im; sym <= iM; sym++) {
    const l = lengths[sym] ?? 0;
    if (l === 0) continue;
    const code = codes[sym] ?? 0;
    if (code >= 2 ** l) throw new DecoderError('EXR', 'Huffman: invalid code');
    if (l <= HUF_DECBITS) {
      const shift = HUF_DECBITS - l;
      const base = code * 2 ** shift;
      for (let j = 0; j < 1 << shift; j++) {
        if (fastLen[base + j] !== 0) throw new DecoderError('EXR', 'Huffman: overlapping codes');
        fastLen[base + j] = l;
        fastSym[base + j] = sym;
      }
    } else {
      const prefix = Math.floor(code / 2 ** (l - HUF_DECBITS));
      let list = longCodes.get(prefix);
      if (!list) {
        list = [];
        longCodes.set(prefix, list);
      }
      list.push(sym);
    }
  }

  const bits = new BitStream(data, streamStart, data.length);
  const rlc = iM;
  let bitPos = 0;
  let o = 0;

  while (bitPos < nBits) {
    const prefix = bits.peek(bitPos, HUF_DECBITS);
    let sym: number;
    const l = fastLen[prefix] ?? 0;
    if (l > 0) {
      if (bitPos + l > nBits) throw new DecoderError('EXR', 'Huffman: truncated code');
      sym = fastSym[prefix] ?? 0;
      bitPos += l;
    } else {
      const candidates = longCodes.get(prefix);
      let found = -1;
      if (candidates) {
        for (const cand of candidates) {
          const cl = lengths[cand] ?? 0;
          if (bitPos + cl <= nBits && bits.peekLong(bitPos, cl) === codes[cand]) {
            found = cand;
            bitPos += cl;
            break;
          }
        }
      }
      if (found < 0) throw new DecoderError('EXR', 'Huffman: invalid code in stream');
      sym = found;
    }

    if (sym === rlc) {
      if (bitPos + 8 > nBits) throw new DecoderError('EXR', 'Huffman: truncated run length');
      const run = bits.peek(bitPos, 8);
      bitPos += 8;
      if (o === 0 || o + run > nRaw) throw new DecoderError('EXR', 'Huffman: invalid run length');
      const prev = out[o - 1] ?? 0;
      out.fill(prev, o, o + run);
      o += run;
    } else {
      if (o >= nRaw) throw new DecoderError('EXR', 'Huffman: too much decoded data');
      out[o++] = sym;
    }
  }

  if (o !== nRaw) throw new DecoderError('EXR', `Huffman: decoded ${o} values, expected ${nRaw}`);
  return out;
}
