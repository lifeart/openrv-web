/**
 * 16-bit PNG Decoder
 *
 * Browsers decode PNG through <img>/createImageBitmap into 8-bit canvases,
 * which truncates 16-bit-per-channel PNGs. This decoder keeps the full
 * precision for 16-bit images only (8-bit PNGs keep the native browser path):
 *
 * - Color types 0 (gray), 2 (RGB), 4 (gray + alpha), 6 (RGBA) at bit depth 16
 * - Non-interlaced and Adam7-interlaced images
 * - tRNS single-color transparency
 * - zlib inflate via DecompressionStream('deflate') (browsers, Node 18+)
 *
 * Output is RGBA Float32 in [0, 1] holding the stored (display-referred,
 * usually sRGB-encoded) values, like the 8-bit path. gAMA/iCCP/cHRM are not
 * applied.
 */

import { DecoderError } from '../core/errors';
import { validateImageDimensions } from './shared';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Channels per color type (16-bit capable types only). */
const CHANNELS_BY_COLOR_TYPE: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export interface PNG16Info {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

export interface PNG16DecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: 4;
  colorSpace: 'srgb';
  metadata: Record<string, unknown>;
}

function hasPNGSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * Read the IHDR fields of a PNG (IHDR must be the first chunk).
 * Returns null when the buffer is not a PNG.
 */
export function getPNGInfo(buffer: ArrayBuffer): PNG16Info | null {
  if (buffer.byteLength < 33) return null;
  const bytes = new Uint8Array(buffer, 0, 33);
  if (!hasPNGSignature(bytes)) return null;
  const view = new DataView(buffer);
  // Chunk length (13) + "IHDR"
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: view.getUint8(24),
    colorType: view.getUint8(25),
    interlace: view.getUint8(28),
  };
}

/** True for PNGs with 16 bits per sample. */
export function isPNG16File(buffer: ArrayBuffer): boolean {
  const info = getPNGInfo(buffer);
  return info !== null && info.bitDepth === 16;
}

async function inflateZlib(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new DecoderError('PNG', 'Decompression requires DecompressionStream support');
  }
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const chunks: Uint8Array[] = [];
  let total = 0;
  const readAll = async (): Promise<void> => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      chunks.push(value);
      total += value.length;
    }
  };
  // Await both sides together so a corrupt stream rejects once, with no
  // unhandled rejection left on the writer.
  await Promise.all([writer.write(data).then(() => writer.close()), readAll()]);

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Undo PNG scanline filters in place for one (sub)image.
 * Returns the offset just past the consumed data.
 */
function unfilter(
  data: Uint8Array,
  offset: number,
  out: Uint8Array,
  rowBytes: number,
  rows: number,
  bpp: number,
): number {
  let pos = offset;
  for (let y = 0; y < rows; y++) {
    if (pos + 1 + rowBytes > data.length) throw new DecoderError('PNG', 'Truncated image data');
    const filter = data[pos++] ?? 0;
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = data[pos + i] ?? 0;
      const a = i >= bpp ? (out[row + i - bpp] ?? 0) : 0;
      const b = y > 0 ? (out[prev + i] ?? 0) : 0;
      const c = y > 0 && i >= bpp ? (out[prev + i - bpp] ?? 0) : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4:
          v = x + paeth(a, b, c);
          break;
        default:
          throw new DecoderError('PNG', `Invalid PNG filter type ${filter}`);
      }
      out[row + i] = v & 0xff;
    }
    pos += rowBytes;
  }
  return pos;
}

/** Adam7 passes: [xStart, yStart, xStep, yStep] */
const ADAM7: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/**
 * Decode a 16-bit PNG to RGBA Float32.
 */
export async function decodePNG16(buffer: ArrayBuffer): Promise<PNG16DecodeResult> {
  const info = getPNGInfo(buffer);
  if (!info) throw new DecoderError('PNG', 'Invalid PNG file');
  const { width, height, bitDepth, colorType, interlace } = info;
  if (bitDepth !== 16) throw new DecoderError('PNG', `Expected a 16-bit PNG, got bit depth ${bitDepth}`);
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (channels === undefined) throw new DecoderError('PNG', `Unsupported 16-bit PNG color type ${colorType}`);
  if (interlace !== 0 && interlace !== 1) throw new DecoderError('PNG', `Invalid interlace method ${interlace}`);
  validateImageDimensions(width, height, 'PNG');

  // Collect IDAT data and tRNS
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const idat: Uint8Array[] = [];
  let transparent: number[] | null = null;
  let pos = 8;
  while (pos + 12 <= buffer.byteLength) {
    const length = view.getUint32(pos);
    const type = view.getUint32(pos + 4);
    const dataStart = pos + 8;
    if (dataStart + length + 4 > buffer.byteLength) throw new DecoderError('PNG', 'Truncated PNG chunk');
    if (type === 0x49444154) {
      // IDAT
      idat.push(bytes.subarray(dataStart, dataStart + length));
    } else if (type === 0x74524e53) {
      // tRNS: one 16-bit sample per color channel (gray or RGB)
      const n = colorType === 0 ? 1 : colorType === 2 ? 3 : 0;
      if (n > 0 && length >= n * 2) {
        transparent = [];
        for (let i = 0; i < n; i++) transparent.push(view.getUint16(dataStart + i * 2));
      }
    } else if (type === 0x49454e44) {
      // IEND
      break;
    }
    pos = dataStart + length + 4; // skip CRC
  }
  if (idat.length === 0) throw new DecoderError('PNG', 'PNG has no image data');

  const compressedLength = idat.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let o = 0;
  for (const c of idat) {
    compressed.set(c, o);
    o += c.length;
  }
  const raw = await inflateZlib(compressed);

  const bpp = channels * 2;
  const samples = new Uint8Array(width * height * bpp);

  if (interlace === 0) {
    unfilter(raw, 0, samples, width * bpp, height, bpp);
  } else {
    let offset = 0;
    for (const [x0, y0, dx, dy] of ADAM7) {
      const passW = Math.ceil((width - x0) / dx);
      const passH = Math.ceil((height - y0) / dy);
      if (passW <= 0 || passH <= 0) continue;
      const pass = new Uint8Array(passW * passH * bpp);
      offset = unfilter(raw, offset, pass, passW * bpp, passH, bpp);
      for (let py = 0; py < passH; py++) {
        for (let px = 0; px < passW; px++) {
          const src = (py * passW + px) * bpp;
          const dst = ((y0 + py * dy) * width + (x0 + px * dx)) * bpp;
          samples.set(pass.subarray(src, src + bpp), dst);
        }
      }
    }
  }

  // Expand to RGBA float
  const data = new Float32Array(width * height * 4);
  const sv = new DataView(samples.buffer);
  const scale = 1 / 65535;
  for (let p = 0; p < width * height; p++) {
    const base = p * bpp;
    const s0 = sv.getUint16(base);
    let r: number;
    let g: number;
    let b: number;
    let a = 65535;
    if (channels === 1 || channels === 2) {
      r = g = b = s0;
      if (channels === 2) a = sv.getUint16(base + 2);
      else if (transparent && s0 === transparent[0]) a = 0;
    } else {
      r = s0;
      g = sv.getUint16(base + 2);
      b = sv.getUint16(base + 4);
      if (channels === 4) a = sv.getUint16(base + 6);
      else if (transparent && r === transparent[0] && g === transparent[1] && b === transparent[2]) a = 0;
    }
    data[p * 4] = r * scale;
    data[p * 4 + 1] = g * scale;
    data[p * 4 + 2] = b * scale;
    data[p * 4 + 3] = a * scale;
  }

  return {
    width,
    height,
    data,
    channels: 4,
    colorSpace: 'srgb',
    metadata: {
      formatName: 'png16',
      bitDepth: 16,
      colorType,
      interlaced: interlace === 1,
      originalChannels: channels,
    },
  };
}
