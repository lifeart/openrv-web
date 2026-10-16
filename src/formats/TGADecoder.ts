/**
 * Truevision TGA (Targa) decoder.
 *
 * Supports:
 * - Color-mapped (types 1, 9), true-color (types 2, 10) and grayscale
 *   (types 3, 11) images, uncompressed or RLE
 * - 8-bit gray, 16-bit gray+alpha, 15/16-bit 5-5-5(+1), 24-bit BGR,
 *   32-bit BGRA pixels; 15/16/24/32-bit palettes
 * - Bottom-left and top-left origins, right-to-left rows
 * - The TGA 2.0 extension area's alpha type, so 32-bit files that declare
 *   "no alpha" stay opaque
 *
 * Output is RGBA float in [0, 1], display-referred (sRGB-encoded), like the
 * browser's own 8-bit image path. Browsers cannot decode TGA natively.
 */

import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';

const HEADER_SIZE = 18;
const FOOTER_SIZE = 26;
const FOOTER_SIGNATURE = 'TRUEVISION-XFILE.\0';
/** Offset of the attributes-type byte inside the TGA 2.0 extension area. */
const EXT_ATTRIBUTES_TYPE_OFFSET = 494;

const TYPE_COLOR_MAPPED = 1;
const TYPE_TRUE_COLOR = 2;
const TYPE_GRAYSCALE = 3;
const RLE_FLAG = 8;

export interface TGAInfo {
  width: number;
  height: number;
  imageType: number;
  pixelDepth: number;
  rle: boolean;
  hasAlpha: boolean;
  topToBottom: boolean;
  rightToLeft: boolean;
}

export interface TGADecodeResult {
  width: number;
  height: number;
  /** RGBA interleaved, [0, 1] */
  data: Float32Array;
  channels: 4;
  colorSpace: 'srgb';
  metadata: Record<string, unknown>;
}

interface TGAHeader {
  idLength: number;
  colorMapType: number;
  imageType: number;
  colorMapFirst: number;
  colorMapLength: number;
  colorMapEntrySize: number;
  width: number;
  height: number;
  pixelDepth: number;
  descriptor: number;
}

function readHeader(view: DataView): TGAHeader {
  return {
    idLength: view.getUint8(0),
    colorMapType: view.getUint8(1),
    imageType: view.getUint8(2),
    colorMapFirst: view.getUint16(3, true),
    colorMapLength: view.getUint16(5, true),
    colorMapEntrySize: view.getUint8(7),
    width: view.getUint16(12, true),
    height: view.getUint16(14, true),
    pixelDepth: view.getUint8(16),
    descriptor: view.getUint8(17),
  };
}

/** True when the header describes an image this decoder can read. */
function isValidHeader(h: TGAHeader): boolean {
  if (h.colorMapType > 1) return false;
  if (h.width === 0 || h.height === 0) return false;
  // Bits 6-7 (interleaving) are obsolete and must be zero in real files.
  if ((h.descriptor & 0xc0) !== 0) return false;

  switch (h.imageType & ~RLE_FLAG) {
    case TYPE_COLOR_MAPPED:
      return (
        h.colorMapType === 1 &&
        h.colorMapLength > 0 &&
        (h.pixelDepth === 8 || h.pixelDepth === 16) &&
        [15, 16, 24, 32].includes(h.colorMapEntrySize)
      );
    case TYPE_TRUE_COLOR:
      return [15, 16, 24, 32].includes(h.pixelDepth);
    case TYPE_GRAYSCALE:
      return h.pixelDepth === 8 || h.pixelDepth === 16;
    default:
      return false;
  }
}

function hasFooter(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE + FOOTER_SIZE) return false;
  const bytes = new Uint8Array(buffer, buffer.byteLength - FOOTER_SIGNATURE.length, FOOTER_SIGNATURE.length);
  for (let i = 0; i < FOOTER_SIGNATURE.length; i++) {
    if (bytes[i] !== FOOTER_SIGNATURE.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Check whether a buffer holds a TGA image.
 *
 * TGA has no magic number at the start, so this validates the header
 * fields strictly. The other formats the app reads all start with bytes
 * that fail these checks (PNG, JPEG, GIF, BMP, WebP, TIFF, EXR, DPX).
 */
export function isTGAFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < HEADER_SIZE) return false;
  return isValidHeader(readHeader(new DataView(buffer)));
}

/**
 * Alpha type from the TGA 2.0 extension area: 0 none, 1-2 undefined/ignore,
 * 3 straight alpha, 4 premultiplied. Returns null without an extension area.
 */
function readExtensionAlphaType(buffer: ArrayBuffer, view: DataView): number | null {
  if (!hasFooter(buffer)) return null;
  const extOffset = view.getUint32(buffer.byteLength - FOOTER_SIZE, true);
  if (extOffset === 0 || extOffset + EXT_ATTRIBUTES_TYPE_OFFSET + 1 > buffer.byteLength) return null;
  return view.getUint8(extOffset + EXT_ATTRIBUTES_TYPE_OFFSET);
}

export function getTGAInfo(buffer: ArrayBuffer): TGAInfo | null {
  if (!isTGAFile(buffer)) return null;
  const view = new DataView(buffer);
  const h = readHeader(view);
  return {
    width: h.width,
    height: h.height,
    imageType: h.imageType,
    pixelDepth: h.pixelDepth,
    rle: (h.imageType & RLE_FLAG) !== 0,
    hasAlpha: resolveHasAlpha(h, buffer, view),
    topToBottom: (h.descriptor & 0x20) !== 0,
    rightToLeft: (h.descriptor & 0x10) !== 0,
  };
}

/** Whether the pixel (or palette entry) alpha bits carry real alpha. */
function resolveHasAlpha(h: TGAHeader, buffer: ArrayBuffer, view: DataView): boolean {
  const baseType = h.imageType & ~RLE_FLAG;
  const depth = baseType === TYPE_COLOR_MAPPED ? h.colorMapEntrySize : h.pixelDepth;
  // 32-bit BGRA, 16-bit 5-5-5-1 and 16-bit gray+alpha have alpha bits.
  if (depth !== 32 && depth !== 16) return false;
  const alphaType = readExtensionAlphaType(buffer, view);
  if (alphaType !== null) return alphaType === 3 || alphaType === 4;
  // Without an extension area, trust the descriptor's alpha bit count.
  // Many writers leave it at 0 for 16-bit, so only 32-bit and gray+alpha
  // fall back to treating the extra bits as alpha.
  const alphaBits = h.descriptor & 0x0f;
  if (alphaBits > 0) return true;
  return depth === 32 || baseType === TYPE_GRAYSCALE;
}

/** Decode one packed color (palette entry or true-color pixel) to RGBA. */
function readColor(
  bytes: Uint8Array,
  offset: number,
  depth: number,
  hasAlpha: boolean,
  out: Float32Array,
  outIdx: number,
): void {
  switch (depth) {
    case 15:
    case 16: {
      const v = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
      out[outIdx] = ((v >> 10) & 0x1f) / 31;
      out[outIdx + 1] = ((v >> 5) & 0x1f) / 31;
      out[outIdx + 2] = (v & 0x1f) / 31;
      out[outIdx + 3] = hasAlpha && depth === 16 ? (v >> 15) & 1 : 1;
      break;
    }
    case 24:
      out[outIdx] = (bytes[offset + 2] ?? 0) / 255;
      out[outIdx + 1] = (bytes[offset + 1] ?? 0) / 255;
      out[outIdx + 2] = (bytes[offset] ?? 0) / 255;
      out[outIdx + 3] = 1;
      break;
    default:
      // 32-bit BGRA
      out[outIdx] = (bytes[offset + 2] ?? 0) / 255;
      out[outIdx + 1] = (bytes[offset + 1] ?? 0) / 255;
      out[outIdx + 2] = (bytes[offset] ?? 0) / 255;
      out[outIdx + 3] = hasAlpha ? (bytes[offset + 3] ?? 0) / 255 : 1;
      break;
  }
}

/**
 * Expand RLE packets into raw pixel bytes. Packets may cross scanlines,
 * so the whole image is decoded as one stream.
 */
function decodeRLE(src: Uint8Array, start: number, pixelCount: number, bytesPerPixel: number): Uint8Array {
  const out = new Uint8Array(pixelCount * bytesPerPixel);
  let pos = start;
  let pixel = 0;
  while (pixel < pixelCount && pos < src.length) {
    const header = src[pos++] ?? 0;
    const count = Math.min((header & 0x7f) + 1, pixelCount - pixel);
    if (header & 0x80) {
      // Run-length packet: one pixel value repeated
      if (pos + bytesPerPixel > src.length) break;
      for (let i = 0; i < count; i++) {
        out.set(src.subarray(pos, pos + bytesPerPixel), (pixel + i) * bytesPerPixel);
      }
      pos += bytesPerPixel;
    } else {
      // Raw packet: count literal pixels
      const n = Math.min(count * bytesPerPixel, src.length - pos);
      out.set(src.subarray(pos, pos + n), pixel * bytesPerPixel);
      pos += count * bytesPerPixel;
    }
    pixel += count;
  }
  return out;
}

export async function decodeTGA(buffer: ArrayBuffer): Promise<TGADecodeResult> {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new DecoderError('TGA', 'Invalid TGA file: shorter than the 18-byte header');
  }
  const view = new DataView(buffer);
  const h = readHeader(view);
  if (!isValidHeader(h)) {
    throw new DecoderError(
      'TGA',
      `Unsupported TGA: image type ${h.imageType}, ${h.pixelDepth}-bit, color map type ${h.colorMapType}`,
    );
  }
  validateImageDimensions(h.width, h.height, 'TGA');

  const { width, height } = h;
  const baseType = h.imageType & ~RLE_FLAG;
  const rle = (h.imageType & RLE_FLAG) !== 0;
  const hasAlpha = resolveHasAlpha(h, buffer, view);
  const topToBottom = (h.descriptor & 0x20) !== 0;
  const rightToLeft = (h.descriptor & 0x10) !== 0;
  const bytes = new Uint8Array(buffer);

  // Palette follows the image ID
  const colorMapStart = HEADER_SIZE + h.idLength;
  const colorMapEntryBytes = Math.ceil(h.colorMapEntrySize / 8);
  const colorMapBytes = h.colorMapType === 1 ? h.colorMapLength * colorMapEntryBytes : 0;
  const dataStart = colorMapStart + colorMapBytes;
  if (dataStart > buffer.byteLength) {
    throw new DecoderError('TGA', 'Invalid TGA file: color map extends past the end of the file');
  }

  let palette: Float32Array | null = null;
  if (baseType === TYPE_COLOR_MAPPED) {
    palette = new Float32Array(h.colorMapLength * 4);
    for (let i = 0; i < h.colorMapLength; i++) {
      readColor(bytes, colorMapStart + i * colorMapEntryBytes, h.colorMapEntrySize, hasAlpha, palette, i * 4);
    }
  }

  const bytesPerPixel = Math.ceil(h.pixelDepth / 8);
  const pixelCount = width * height;
  const pixels = rle
    ? decodeRLE(bytes, dataStart, pixelCount, bytesPerPixel)
    : bytes.subarray(dataStart, Math.min(buffer.byteLength, dataStart + pixelCount * bytesPerPixel));
  const availablePixels = Math.floor(pixels.length / bytesPerPixel);

  const out = new Float32Array(pixelCount * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 1;

  for (let p = 0; p < availablePixels; p++) {
    const srcRow = Math.floor(p / width);
    const srcCol = p % width;
    const row = topToBottom ? srcRow : height - 1 - srcRow;
    const col = rightToLeft ? width - 1 - srcCol : srcCol;
    const outIdx = (row * width + col) * 4;
    const off = p * bytesPerPixel;

    if (baseType === TYPE_COLOR_MAPPED && palette) {
      const raw = bytesPerPixel === 1 ? (pixels[off] ?? 0) : (pixels[off] ?? 0) | ((pixels[off + 1] ?? 0) << 8);
      const entry = raw - h.colorMapFirst;
      if (entry >= 0 && entry < h.colorMapLength) {
        out.set(palette.subarray(entry * 4, entry * 4 + 4), outIdx);
      }
    } else if (baseType === TYPE_GRAYSCALE) {
      const v = (pixels[off] ?? 0) / 255;
      out[outIdx] = v;
      out[outIdx + 1] = v;
      out[outIdx + 2] = v;
      if (bytesPerPixel === 2 && hasAlpha) out[outIdx + 3] = (pixels[off + 1] ?? 0) / 255;
    } else {
      readColor(pixels, off, h.pixelDepth, hasAlpha, out, outIdx);
    }
  }

  return {
    width,
    height,
    data: out,
    channels: 4,
    colorSpace: 'srgb',
    metadata: {
      format: 'tga',
      imageType: h.imageType,
      pixelDepth: h.pixelDepth,
      rle,
      hasAlpha,
    },
  };
}
