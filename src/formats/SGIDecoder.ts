/**
 * SGI image (.sgi, .rgb, .rgba, .bw) decoder.
 *
 * Supports:
 * - 8- and 16-bit channels
 * - 1 to 4 channels (gray, gray+alpha, RGB, RGBA); extra channels are ignored
 * - Verbatim and RLE storage
 *
 * Only the "normal" colormap mode (0) is supported; the obsolete dithered,
 * screen and colormap modes are rejected.
 *
 * Output is RGBA float in [0, 1], display-referred (sRGB-encoded), like the
 * browser's own 8-bit image path. Browsers cannot decode SGI natively.
 */

import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';

const SGI_MAGIC = 474;
const HEADER_SIZE = 512;
const STORAGE_VERBATIM = 0;
const STORAGE_RLE = 1;
const COLORMAP_NORMAL = 0;

export interface SGIInfo {
  width: number;
  height: number;
  channels: number;
  bytesPerChannel: number;
  rle: boolean;
}

export interface SGIDecodeResult {
  width: number;
  height: number;
  /** RGBA interleaved, [0, 1] */
  data: Float32Array;
  channels: 4;
  colorSpace: 'srgb';
  metadata: Record<string, unknown>;
}

interface SGIHeader {
  storage: number;
  bpc: number;
  dimension: number;
  xsize: number;
  ysize: number;
  zsize: number;
  colormap: number;
  name: string;
}

function readHeader(view: DataView): SGIHeader {
  const nameBytes = new Uint8Array(view.buffer, view.byteOffset + 24, 80);
  const nul = nameBytes.indexOf(0);
  const name = String.fromCharCode(...nameBytes.subarray(0, nul === -1 ? 80 : nul));
  const dimension = view.getUint16(4, false);
  return {
    storage: view.getUint8(2),
    bpc: view.getUint8(3),
    dimension,
    xsize: view.getUint16(6, false),
    // Dimension 1 images are a single row; dimension 1-2 images one channel.
    ysize: dimension === 1 ? 1 : view.getUint16(8, false),
    zsize: dimension < 3 ? 1 : view.getUint16(10, false),
    colormap: view.getUint32(104, false),
    name,
  };
}

function isValidHeader(h: SGIHeader): boolean {
  return (
    (h.storage === STORAGE_VERBATIM || h.storage === STORAGE_RLE) &&
    (h.bpc === 1 || h.bpc === 2) &&
    h.dimension >= 1 &&
    h.dimension <= 3 &&
    h.xsize > 0 &&
    h.ysize > 0 &&
    h.zsize > 0
  );
}

/** Check whether a buffer holds an SGI image (magic 474 plus a sane header). */
export function isSGIFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;
  const view = new DataView(buffer);
  if (view.getUint16(0, false) !== SGI_MAGIC) return false;
  return isValidHeader(readHeader(view));
}

export function getSGIInfo(buffer: ArrayBuffer): SGIInfo | null {
  if (!isSGIFile(buffer)) return null;
  const h = readHeader(new DataView(buffer));
  return {
    width: h.xsize,
    height: h.ysize,
    channels: h.zsize,
    bytesPerChannel: h.bpc,
    rle: h.storage === STORAGE_RLE,
  };
}

/**
 * Expand one RLE scanline into `out` (xsize values). Each packet header's
 * low 7 bits are a count; the high bit selects a literal run (count values
 * follow) or a repeat (one value follows). A zero count ends the line.
 */
function decodeRLEScanline(
  view: DataView,
  start: number,
  length: number,
  bpc: number,
  out: Uint16Array,
  xsize: number,
): void {
  const end = Math.min(view.byteLength, start + length);
  const read = (pos: number): number => (bpc === 1 ? view.getUint8(pos) : view.getUint16(pos, false));
  let pos = start;
  let x = 0;
  while (pos + bpc <= end && x < xsize) {
    const header = read(pos);
    pos += bpc;
    const count = header & 0x7f;
    if (count === 0) break;
    const n = Math.min(count, xsize - x);
    if (header & 0x80) {
      for (let i = 0; i < n && pos + bpc <= end; i++) {
        out[x++] = read(pos);
        pos += bpc;
      }
      pos += (count - n) * bpc;
    } else {
      if (pos + bpc > end) break;
      const value = read(pos);
      pos += bpc;
      out.fill(value, x, x + n);
      x += n;
    }
  }
}

export async function decodeSGI(buffer: ArrayBuffer): Promise<SGIDecodeResult> {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new DecoderError('SGI', 'Invalid SGI file: shorter than the 512-byte header');
  }
  const view = new DataView(buffer);
  if (view.getUint16(0, false) !== SGI_MAGIC) {
    throw new DecoderError('SGI', 'Invalid SGI file: wrong magic number');
  }
  const h = readHeader(view);
  if (!isValidHeader(h)) {
    throw new DecoderError(
      'SGI',
      `Unsupported SGI: storage ${h.storage}, ${h.bpc * 8}-bit, dimension ${h.dimension}, ${h.zsize} channels`,
    );
  }
  if (h.colormap !== COLORMAP_NORMAL) {
    throw new DecoderError('SGI', `Unsupported SGI colormap mode ${h.colormap}; only normal images (0) are supported`);
  }
  validateImageDimensions(h.xsize, h.ysize, 'SGI');

  const { xsize: width, ysize: height, zsize, bpc } = h;
  const channels = Math.min(zsize, 4);
  const maxValue = bpc === 1 ? 255 : 65535;
  const out = new Float32Array(width * height * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 1;

  const line = new Uint16Array(width);
  const tableEntries = height * zsize;
  const rle = h.storage === STORAGE_RLE;
  if (rle && HEADER_SIZE + tableEntries * 8 > buffer.byteLength) {
    throw new DecoderError('SGI', 'Invalid SGI file: RLE offset tables extend past the end of the file');
  }

  for (let z = 0; z < channels; z++) {
    for (let y = 0; y < height; y++) {
      if (rle) {
        const tableIdx = z * height + y;
        const start = view.getUint32(HEADER_SIZE + tableIdx * 4, false);
        const length = view.getUint32(HEADER_SIZE + tableEntries * 4 + tableIdx * 4, false);
        line.fill(0);
        decodeRLEScanline(view, start, length, bpc, line, width);
      } else {
        const rowStart = HEADER_SIZE + (z * height + y) * width * bpc;
        for (let x = 0; x < width; x++) {
          const pos = rowStart + x * bpc;
          line[x] = pos + bpc > buffer.byteLength ? 0 : bpc === 1 ? view.getUint8(pos) : view.getUint16(pos, false);
        }
      }

      // Scanlines are stored bottom to top.
      const outRow = height - 1 - y;
      for (let x = 0; x < width; x++) {
        const v = (line[x] ?? 0) / maxValue;
        const idx = (outRow * width + x) * 4;
        if (channels <= 2) {
          if (z === 0) {
            out[idx] = v;
            out[idx + 1] = v;
            out[idx + 2] = v;
          } else {
            out[idx + 3] = v;
          }
        } else {
          out[idx + z] = v;
        }
      }
    }
  }

  return {
    width,
    height,
    data: out,
    channels: 4,
    colorSpace: 'srgb',
    metadata: {
      format: 'sgi',
      bitsPerChannel: bpc * 8,
      originalChannels: zsize,
      rle,
      ...(h.name ? { imageName: h.name } : {}),
    },
  };
}
