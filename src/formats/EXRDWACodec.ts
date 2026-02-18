/**
 * EXR DWA Codec - DWA/DWAB decompression for OpenEXR
 *
 * DWA uses DCT-based lossy compression for half-float channels
 * and zlib-based lossless compression for float channels.
 *
 * DWAA: 32 scanlines per block
 * DWAB: 256 scanlines per block
 *
 * Based on OpenEXR's DwaCompressor (IlmImf/ImfDwaCompressor.cpp)
 * and Huffman codec (IlmImf/ImfHuf.cpp).
 */

import { DecoderError } from '../core/errors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Standard JPEG zigzag scan order for 8x8 blocks */
export const ZIGZAG_ORDER: readonly number[] = [
  0,  1,  8, 16,  9,  2,  3, 10,
  17, 24, 32, 25, 18, 11,  4,  5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13,  6,  7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
];

/** Inverse zigzag: maps linear index → zigzag position */
const INV_ZIGZAG = new Uint8Array(64);
for (let i = 0; i < 64; i++) INV_ZIGZAG[ZIGZAG_ORDER[i]!] = i;

// Huffman constants (from OpenEXR ImfHuf.cpp)
const HUF_ENCBITS = 16;
const HUF_DECBITS = 14;
const HUF_ENCSIZE = (1 << HUF_ENCBITS) + 1;
const HUF_DECSIZE = 1 << HUF_DECBITS;
const HUF_DECMASK = HUF_DECSIZE - 1;
const SHORT_ZEROCODE_RUN = 59;
const LONG_ZEROCODE_RUN = 63;
const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;

// DWA AC compression types
// const AC_STATIC_HUFFMAN = 0;
const AC_DEFLATE = 1;

// Precomputed cosine table for 8x8 IDCT
const IDCT_COS = new Float64Array(64);
for (let x = 0; x < 8; x++) {
  for (let u = 0; u < 8; u++) {
    IDCT_COS[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

const SQRT2_INV = 1 / Math.SQRT2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DWABlockHeader {
  version: number;
  unknownUncompressedSize: number;
  unknownCompressedSize: number;
  acCompressedSize: number;
  dcCompressedSize: number;
  rleCompressedSize: number;
  rleUncompressedSize: number;
  rleRawSize: number;
  totalAcUncompressedCount: number;
  totalDcUncompressedCount: number;
  acCompression: number;
}

// ---------------------------------------------------------------------------
// Bit Reader (MSB-first, like OpenEXR Huf)
// ---------------------------------------------------------------------------

class BitReader {
  private buffer = 0;
  private bitsInBuffer = 0;
  private pos = 0;

  constructor(private data: Uint8Array) {}

  readBits(n: number): number {
    while (this.bitsInBuffer < n && this.pos < this.data.length) {
      this.buffer = ((this.buffer & 0xffffff) << 8) | this.data[this.pos++]!;
      this.bitsInBuffer += 8;
    }
    if (this.bitsInBuffer < n) return 0;
    this.bitsInBuffer -= n;
    return (this.buffer >>> this.bitsInBuffer) & ((1 << n) - 1);
  }

  get bitsRemaining(): number {
    return this.bitsInBuffer + (this.data.length - this.pos) * 8;
  }
}

// ---------------------------------------------------------------------------
// Half-float conversion
// ---------------------------------------------------------------------------

function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15;
  const exponent = (h & 0x7c00) >> 10;
  const fraction = h & 0x03ff;

  if (exponent === 0) {
    if (fraction === 0) return sign === 0 ? 0 : -0;
    const v = fraction / 1024;
    return sign === 0 ? v * Math.pow(2, -14) : -v * Math.pow(2, -14);
  }
  if (exponent === 31) {
    if (fraction === 0) return sign === 0 ? Infinity : -Infinity;
    return NaN;
  }
  const v = 1 + fraction / 1024;
  const r = v * Math.pow(2, exponent - 15);
  return sign === 0 ? r : -r;
}

export function floatToHalf(value: number): number {
  const buf = new Float32Array(1);
  const int32 = new Int32Array(buf.buffer);
  buf[0] = value;
  const f = int32[0]!;

  const sign = (f >> 16) & 0x8000;
  let exponent = ((f >> 23) & 0xff) - 127 + 15;
  let mantissa = (f >> 13) & 0x3ff;

  if (exponent <= 0) {
    if (exponent < -10) return sign;
    mantissa = ((f & 0x7fffff) | 0x800000) >> (1 - exponent);
    return sign | mantissa;
  }
  if (exponent >= 31) return sign | 0x7c00;
  return sign | (exponent << 10) | mantissa;
}

// ---------------------------------------------------------------------------
// Huffman Decoder (OpenEXR ImfHuf format)
// ---------------------------------------------------------------------------

interface HufDecEntry {
  len: number;  // code length (0 = not in fast table)
  sym: number;  // decoded symbol
}

/**
 * Unpack the Huffman encoding table from packed 6-bit entries.
 * Returns code lengths for symbols im..iM.
 */
function hufUnpackEncTable(
  tableData: Uint8Array,
  im: number,
  iM: number,
): number[] {
  const lengths = new Array(HUF_ENCSIZE).fill(0);
  const reader = new BitReader(tableData);

  let i = im;
  while (i <= iM) {
    const l = reader.readBits(6);

    if (l === LONG_ZEROCODE_RUN) {
      const extra = reader.readBits(8);
      i += extra + SHORTEST_LONG_RUN;
    } else if (l >= SHORT_ZEROCODE_RUN) {
      i += l - SHORT_ZEROCODE_RUN + 2;
    } else {
      lengths[i] = l;
      i++;
    }
  }

  return lengths;
}

/**
 * Compute canonical Huffman codes from code lengths.
 * Returns array where entry[i] = (code << 6) | length.
 */
function hufCanonicalCodes(lengths: number[]): number[] {
  const maxLen = 58;
  const codes = new Array(HUF_ENCSIZE).fill(0);

  // Count symbols per code length
  const count = new Array(maxLen + 1).fill(0);
  for (let i = 0; i < HUF_ENCSIZE; i++) {
    if (lengths[i]! > 0 && lengths[i]! <= maxLen) count[lengths[i]!]++;
  }

  // Compute first code for each length (from longest to shortest)
  const firstCode = new Array(maxLen + 1).fill(0);
  let c = 0;
  for (let l = maxLen; l > 0; l--) {
    firstCode[l] = c;
    c = (c + count[l]!) >> 1;
  }

  // Assign canonical codes
  const nextCode = [...firstCode];
  for (let i = 0; i < HUF_ENCSIZE; i++) {
    const l = lengths[i]!;
    if (l > 0 && l <= maxLen) {
      codes[i] = (nextCode[l]! << 6) | l;
      nextCode[l]!++;
    }
  }

  return codes;
}

/**
 * Build fast decode table (14-bit lookup) and overflow tree.
 */
function hufBuildDecTable(
  codes: number[],
  im: number,
  iM: number,
): { fast: HufDecEntry[]; tree: Map<number, Map<number, number>> } {
  // Fast table: indexed by top 14 bits of code
  const fast: HufDecEntry[] = new Array(HUF_DECSIZE);
  for (let i = 0; i < HUF_DECSIZE; i++) {
    fast[i] = { len: 0, sym: 0 };
  }

  // Overflow tree: length -> (code -> symbol)
  const tree = new Map<number, Map<number, number>>();

  for (let i = im; i <= iM; i++) {
    if (codes[i] === 0) continue;
    const codeVal = codes[i]! >> 6;
    const codeLen = codes[i]! & 63;

    if (codeLen === 0) continue;

    if (codeLen <= HUF_DECBITS) {
      // Short code: fill fast table entries
      const shift = HUF_DECBITS - codeLen;
      const base = codeVal << shift;
      const count = 1 << shift;
      for (let j = 0; j < count; j++) {
        fast[base + j] = { len: codeLen, sym: i };
      }
    } else {
      // Long code: add to overflow tree
      if (!tree.has(codeLen)) tree.set(codeLen, new Map());
      tree.get(codeLen)!.set(codeVal, i);
    }
  }

  return { fast, tree };
}

/**
 * Decode Huffman-coded data using OpenEXR Huf format.
 */
export function hufDecode(
  data: Uint8Array,
  offset: number,
  compressedSize: number,
  nRaw: number,
): Uint16Array {
  if (compressedSize < 20 || nRaw === 0) {
    return new Uint16Array(nRaw);
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, compressedSize);
  let pos = 0;

  // Read header (big-endian int32)
  const im = view.getInt32(pos, false); pos += 4;
  const iM = view.getInt32(pos, false); pos += 4;
  const tableSize = view.getInt32(pos, false); pos += 4;
  const nBits = view.getInt32(pos, false); pos += 4;

  if (im < 0 || im >= HUF_ENCSIZE || iM < 0 || iM >= HUF_ENCSIZE || im > iM) {
    throw new DecoderError('EXR', 'Invalid DWA Huffman table bounds');
  }
  if (tableSize < 0 || pos + tableSize > compressedSize) {
    throw new DecoderError('EXR', 'Invalid DWA Huffman table size');
  }

  // Unpack encoding table
  const tableData = new Uint8Array(data.buffer, data.byteOffset + offset + pos, tableSize);
  const lengths = hufUnpackEncTable(tableData, im, iM);
  pos += tableSize;

  // Build canonical codes and decode table
  const codes = hufCanonicalCodes(lengths);
  const { fast, tree } = hufBuildDecTable(codes, im, iM);

  // rlc = im (run-length code marker, per OpenEXR convention)
  const rlc = im;

  // Decode bitstream
  const bitstreamData = new Uint8Array(data.buffer, data.byteOffset + offset + pos);
  const reader = new BitReader(bitstreamData);
  const output = new Uint16Array(nRaw);
  let outIdx = 0;
  let prevSym = 0;
  let bitsConsumed = 0;

  while (outIdx < nRaw && bitsConsumed < nBits) {
    // Try fast table lookup
    if (reader.bitsRemaining < HUF_DECBITS) break;

    const peek = reader.readBits(HUF_DECBITS);
    bitsConsumed += HUF_DECBITS;
    const entry = fast[peek & HUF_DECMASK]!;

    let sym: number;
    if (entry.len > 0) {
      // Found in fast table — put back unused bits
      const unused = HUF_DECBITS - entry.len;
      // We can't "put back" bits easily, so we account for consumed
      bitsConsumed -= unused;
      sym = entry.sym;
    } else {
      // Long code: try overflow tree
      let found = false;
      sym = 0;
      // We already consumed HUF_DECBITS bits; try longer codes
      let code = peek;
      for (let tryLen = HUF_DECBITS + 1; tryLen <= 58; tryLen++) {
        const nextBit = reader.readBits(1);
        bitsConsumed++;
        code = (code << 1) | nextBit;
        const treeLevel = tree.get(tryLen);
        if (treeLevel) {
          const s = treeLevel.get(code);
          if (s !== undefined) {
            sym = s;
            found = true;
            break;
          }
        }
      }
      if (!found) break; // Can't decode — stop
    }

    // Handle run-length coding
    if (sym === rlc && outIdx > 0) {
      const runLen = reader.readBits(8);
      bitsConsumed += 8;
      for (let r = 0; r < runLen && outIdx < nRaw; r++) {
        output[outIdx++] = prevSym;
      }
    } else {
      prevSym = sym;
      output[outIdx++] = sym;
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// Inverse DCT 8x8 (Type-II, separable)
// ---------------------------------------------------------------------------

/**
 * Compute inverse 8x8 DCT on a block of frequency-domain coefficients.
 * Input and output are 64-element arrays in row-major order.
 */
export function inverseDCT8x8(coeffs: Float32Array): Float32Array {
  const temp = new Float64Array(64);
  const result = new Float32Array(64);

  // Row IDCT
  for (let row = 0; row < 8; row++) {
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let u = 0; u < 8; u++) {
        const c = u === 0 ? SQRT2_INV : 1;
        sum += c * coeffs[row * 8 + u]! * IDCT_COS[x * 8 + u]!;
      }
      temp[row * 8 + x] = sum * 0.5;
    }
  }

  // Column IDCT
  for (let col = 0; col < 8; col++) {
    for (let y = 0; y < 8; y++) {
      let sum = 0;
      for (let v = 0; v < 8; v++) {
        const c = v === 0 ? SQRT2_INV : 1;
        sum += c * temp[v * 8 + col]! * IDCT_COS[y * 8 + v]!;
      }
      result[y * 8 + col] = sum * 0.5;
    }
  }

  return result;
}

/**
 * Forward 8x8 DCT (for testing round-trip)
 */
export function forwardDCT8x8(spatial: Float32Array): Float32Array {
  const temp = new Float64Array(64);
  const result = new Float32Array(64);

  // Row DCT
  for (let row = 0; row < 8; row++) {
    for (let u = 0; u < 8; u++) {
      const c = u === 0 ? SQRT2_INV : 1;
      let sum = 0;
      for (let x = 0; x < 8; x++) {
        sum += spatial[row * 8 + x]! * IDCT_COS[x * 8 + u]!;
      }
      temp[row * 8 + u] = c * sum * 0.5;
    }
  }

  // Column DCT
  for (let col = 0; col < 8; col++) {
    for (let v = 0; v < 8; v++) {
      const c = v === 0 ? SQRT2_INV : 1;
      let sum = 0;
      for (let y = 0; y < 8; y++) {
        sum += temp[y * 8 + col]! * IDCT_COS[y * 8 + v]!;
      }
      result[v * 8 + col] = c * sum * 0.5;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Zigzag reorder
// ---------------------------------------------------------------------------

/** Convert 64 values from zigzag order to natural (row-major) order */
export function unzigzag(zigzagged: Uint16Array | Float32Array, output: Float32Array): void {
  for (let i = 0; i < 64; i++) {
    output[ZIGZAG_ORDER[i]!] = zigzagged[i] ?? 0;
  }
}

// ---------------------------------------------------------------------------
// DWA Block Header
// ---------------------------------------------------------------------------

/** Read a big-endian int64 as a number (clamped to safe integer range) */
function readBEInt64(view: DataView, offset: number): number {
  const hi = view.getInt32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  return hi * 0x100000000 + lo;
}

export function parseDWABlockHeader(data: Uint8Array): {
  header: DWABlockHeader;
  dataOffset: number;
} {
  if (data.length < 88) {
    throw new DecoderError('EXR', 'DWA block too small for header');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;

  const version = readBEInt64(view, off); off += 8;
  const unknownUncompressedSize = readBEInt64(view, off); off += 8;
  const unknownCompressedSize = readBEInt64(view, off); off += 8;
  const acCompressedSize = readBEInt64(view, off); off += 8;
  const dcCompressedSize = readBEInt64(view, off); off += 8;
  const rleCompressedSize = readBEInt64(view, off); off += 8;
  const rleUncompressedSize = readBEInt64(view, off); off += 8;
  const rleRawSize = readBEInt64(view, off); off += 8;
  const totalAcUncompressedCount = readBEInt64(view, off); off += 8;
  const totalDcUncompressedCount = readBEInt64(view, off); off += 8;
  const acCompression = readBEInt64(view, off); off += 8;

  const header: DWABlockHeader = {
    version,
    unknownUncompressedSize,
    unknownCompressedSize,
    acCompressedSize,
    dcCompressedSize,
    rleCompressedSize,
    rleUncompressedSize,
    rleRawSize,
    totalAcUncompressedCount,
    totalDcUncompressedCount,
    acCompression,
  };

  if (header.version < 2) {
    throw new DecoderError('EXR', `Unsupported DWA version: ${header.version}`);
  }

  return { header, dataOffset: 88 };
}

// ---------------------------------------------------------------------------
// zlib helper
// ---------------------------------------------------------------------------

async function zlibDecompress(data: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0) return new Uint8Array(0);

  if (typeof DecompressionStream === 'undefined') {
    throw new DecoderError('EXR', 'DWA decompression requires DecompressionStream support');
  }

  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(new Uint8Array(data));
  writer.close();

  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Predictor reconstruction (same as ZIP compression in EXR)
// ---------------------------------------------------------------------------

function reconstructPredictor(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = i === 0 ? data[i]! : ((data[i]! + result[i - 1]!) & 0xff);
  }

  const half = Math.floor(result.length / 2);
  const final = new Uint8Array(result.length);
  for (let i = 0; i < half; i++) {
    final[i * 2] = result[i]!;
    final[i * 2 + 1] = result[half + i]!;
  }
  if (result.length % 2 === 1) {
    final[final.length - 1] = result[result.length - 1]!;
  }

  return final;
}

// ---------------------------------------------------------------------------
// Main DWA decompression
// ---------------------------------------------------------------------------

/**
 * Decompress a DWA/DWAB compressed block.
 *
 * @param compressedData - The raw compressed block data
 * @param uncompressedSize - Expected uncompressed size in bytes
 * @param width - Image width in pixels
 * @param numLines - Number of scanlines in this block
 * @param channelSizes - Bytes per pixel per channel (2=HALF, 4=FLOAT)
 * @returns Uint8Array in standard EXR scanline format
 */
export async function decompressDWA(
  compressedData: Uint8Array,
  uncompressedSize: number,
  width: number,
  numLines: number,
  channelSizes: number[],
): Promise<Uint8Array> {
  if (compressedData.length === 0 || uncompressedSize === 0) {
    return new Uint8Array(uncompressedSize);
  }

  // 1. Parse DWA block header
  const { header, dataOffset } = parseDWABlockHeader(compressedData);

  let pos = dataOffset;

  // 2. Extract sub-blocks
  const acData = compressedData.subarray(pos, pos + header.acCompressedSize);
  pos += header.acCompressedSize;

  const dcData = compressedData.subarray(pos, pos + header.dcCompressedSize);
  pos += header.dcCompressedSize;

  const rleData = compressedData.subarray(pos, pos + header.rleCompressedSize);
  pos += header.rleCompressedSize;

  // Classification/unknown data (remaining bytes)
  // const unknownData = compressedData.subarray(pos, pos + header.unknownCompressedSize);

  // 3. Decompress sub-blocks
  let acValues: Uint16Array;
  if (header.acCompressedSize > 0 && header.totalAcUncompressedCount > 0) {
    if (header.acCompression === AC_DEFLATE) {
      // AC data is zlib compressed
      const inflated = await zlibDecompress(acData);
      acValues = new Uint16Array(inflated.buffer, inflated.byteOffset,
        Math.floor(inflated.byteLength / 2));
    } else {
      // AC data is Huffman encoded (STATIC_HUFFMAN or other)
      acValues = hufDecode(acData, 0, acData.length, header.totalAcUncompressedCount);
    }
  } else {
    acValues = new Uint16Array(0);
  }

  let dcBytes: Uint8Array;
  if (header.dcCompressedSize > 0 && header.totalDcUncompressedCount > 0) {
    dcBytes = await zlibDecompress(dcData);
  } else {
    dcBytes = new Uint8Array(0);
  }

  let rleBytes: Uint8Array;
  if (header.rleCompressedSize > 0 && header.rleUncompressedSize > 0) {
    const inflated = await zlibDecompress(rleData);
    rleBytes = reconstructPredictor(inflated);
  } else {
    rleBytes = new Uint8Array(0);
  }

  // 4. Classify channels: HALF(2) → DCT, FLOAT(4) → RLE
  const dctChannelIndices: number[] = [];
  const rleChannelIndices: number[] = [];
  for (let i = 0; i < channelSizes.length; i++) {
    if (channelSizes[i] === 2) {
      dctChannelIndices.push(i);
    } else {
      rleChannelIndices.push(i);
    }
  }

  // 5. Reconstruct DCT channels
  const blocksX = Math.ceil(width / 8);
  const blocksY = Math.ceil(numLines / 8);
  // DCT channel pixel data: one Float32Array per channel, width * numLines
  const dctChannelData: Float32Array[] = [];
  let dcOffset = 0;
  let acOffset = 0;

  for (let ch = 0; ch < dctChannelIndices.length; ch++) {
    const pixels = new Float32Array(width * numLines);
    const coeffs = new Float32Array(64);
    const zigzagged = new Float32Array(64);

    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        // Get DC value (big-endian uint16 from dcBytes)
        let dcHalf = 0;
        if (dcOffset + 1 < dcBytes.length) {
          dcHalf = (dcBytes[dcOffset]! << 8) | dcBytes[dcOffset + 1]!;
          dcOffset += 2;
        }

        // Get 63 AC values
        zigzagged[0] = dcHalf;
        for (let k = 1; k < 64; k++) {
          zigzagged[k] = acOffset < acValues.length ? acValues[acOffset++]! : 0;
        }

        // Un-zigzag and convert from half-float to float
        for (let k = 0; k < 64; k++) {
          coeffs[ZIGZAG_ORDER[k]!] = halfToFloat(zigzagged[k]!);
        }

        // Inverse DCT
        const spatial = inverseDCT8x8(coeffs);

        // Copy to output (trim to actual dimensions)
        for (let dy = 0; dy < 8; dy++) {
          const y = by * 8 + dy;
          if (y >= numLines) break;
          for (let dx = 0; dx < 8; dx++) {
            const x = bx * 8 + dx;
            if (x >= width) break;
            pixels[y * width + x] = spatial[dy * 8 + dx]!;
          }
        }
      }
    }

    dctChannelData.push(pixels);
  }

  // 6. Assemble output in standard EXR scanline format
  const output = new Uint8Array(uncompressedSize);
  const outView = new DataView(output.buffer);

  // Calculate per-scanline size
  const scanlineBytes = channelSizes.reduce((sum, s) => sum + s * width, 0);

  let rleByteOffset = 0;
  let dctChIdx = 0;

  for (let line = 0; line < numLines; line++) {
    let channelByteOffset = line * scanlineBytes;
    dctChIdx = 0;
    let rleChIdx = 0;

    for (let ch = 0; ch < channelSizes.length; ch++) {
      const chBytes = channelSizes[ch]!;
      const isDCT = chBytes === 2;

      if (isDCT) {
        // Write half-float values from DCT reconstructed data
        const chData = dctChannelData[dctChIdx];
        if (chData) {
          for (let x = 0; x < width; x++) {
            const floatVal = chData[line * width + x]!;
            const halfVal = floatToHalf(floatVal);
            if (channelByteOffset + 1 < output.length) {
              outView.setUint16(channelByteOffset, halfVal, true); // little-endian
            }
            channelByteOffset += 2;
          }
        }
        dctChIdx++;
      } else {
        // Copy from RLE decompressed data
        const byteCount = chBytes * width;
        if (rleByteOffset + byteCount <= rleBytes.length &&
            channelByteOffset + byteCount <= output.length) {
          output.set(
            rleBytes.subarray(rleByteOffset, rleByteOffset + byteCount),
            channelByteOffset,
          );
        }
        rleByteOffset += byteCount;
        channelByteOffset += byteCount;
        rleChIdx++;
      }
    }
  }

  return output;
}
