/**
 * EXRWriter - minimal OpenEXR encoder for still export.
 *
 * Writes a single-part, scanline, uncompressed (NO_COMPRESSION) OpenEXR 2.0
 * file with HALF or FLOAT R/G/B(/A) channels and a `chromaticities`
 * attribute. Uncompressed keeps the writer small and dependency-free; any
 * OpenEXR reader (including EXRDecoder) accepts it.
 *
 * Pixel values are written as given: callers pass scene-linear light
 * (1.0 = SDR reference white) in the primaries named by `chromaticities`.
 */

/** Pixel type codes from the OpenEXR spec. */
const PIXEL_TYPE_HALF = 1;
const PIXEL_TYPE_FLOAT = 2;

/** CIE xy chromaticities: red, green, blue, white (8 values). */
export type EXRChromaticities = readonly [number, number, number, number, number, number, number, number];

/** BT.709 / sRGB primaries, D65 white. */
export const CHROMATICITIES_REC709: EXRChromaticities = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06, 0.3127, 0.329];
/** Display P3 primaries, D65 white. */
export const CHROMATICITIES_P3_D65: EXRChromaticities = [0.68, 0.32, 0.265, 0.69, 0.15, 0.06, 0.3127, 0.329];
/** BT.2020 primaries, D65 white. */
export const CHROMATICITIES_REC2020: EXRChromaticities = [0.708, 0.292, 0.17, 0.797, 0.131, 0.046, 0.3127, 0.329];

/** Chromaticities for an export color space. */
export function chromaticitiesForColorSpace(colorSpace: 'srgb' | 'display-p3' | 'rec2020'): EXRChromaticities {
  switch (colorSpace) {
    case 'rec2020':
      return CHROMATICITIES_REC2020;
    case 'display-p3':
      return CHROMATICITIES_P3_D65;
    default:
      return CHROMATICITIES_REC709;
  }
}

export interface EXRWriteOptions {
  width: number;
  height: number;
  /** Interleaved RGBA float pixels, rows top-to-bottom (width * height * 4 values). */
  data: Float32Array;
  /** Storage precision. Default 'half'. */
  pixelType?: 'half' | 'float';
  /** Write the alpha channel. Default true. */
  includeAlpha?: boolean;
  /** Primaries and white point of `data`. Default BT.709. */
  chromaticities?: EXRChromaticities;
}

// Shared scratch for float -> half bit conversion.
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/**
 * Convert a float to IEEE 754 half bits, rounding to nearest even.
 * Overflow becomes +/-Infinity; NaN stays NaN.
 */
export function floatToHalfBits(value: number): number {
  f32[0] = value;
  const x = u32[0] ?? 0;
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  const mant = x & 0x7fffff;

  if (exp === 0xff) {
    // Inf or NaN (keep a quiet-NaN bit so NaN does not become Inf)
    return sign | 0x7c00 | (mant ? 0x200 : 0);
  }
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00; // overflow
  if (e <= 0) {
    // Subnormal half (or zero)
    if (e < -10) return sign;
    const m = mant | 0x800000;
    const shift = 14 - e;
    let half = m >>> shift;
    const rem = m & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (rem > halfway || (rem === halfway && (half & 1) !== 0)) half++;
    return sign | half;
  }
  let half = (e << 10) | (mant >>> 13);
  const rem = mant & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (half & 1) !== 0)) half++; // may carry into exponent: still correct
  return sign | half;
}

class ByteWriter {
  private bytes: number[] = [];

  string(s: string): void {
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff);
    this.bytes.push(0);
  }
  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }
  i32(v: number): void {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }
  f32(v: number): void {
    f32[0] = v;
    this.i32(u32[0] ?? 0);
  }
  attribute(name: string, type: string, write: (w: ByteWriter) => void): void {
    const body = new ByteWriter();
    write(body);
    this.string(name);
    this.string(type);
    this.i32(body.bytes.length);
    for (const b of body.bytes) this.bytes.push(b);
  }
  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Encode RGBA float pixels as an uncompressed scanline OpenEXR file.
 */
export function encodeEXR(options: EXRWriteOptions): ArrayBuffer {
  const { width, height, data } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`EXRWriter: invalid dimensions ${width}x${height}`);
  }
  if (data.length < width * height * 4) {
    throw new Error(`EXRWriter: expected ${width * height * 4} values, got ${data.length}`);
  }
  const half = (options.pixelType ?? 'half') === 'half';
  const pixelType = half ? PIXEL_TYPE_HALF : PIXEL_TYPE_FLOAT;
  const bytesPerSample = half ? 2 : 4;
  const chroma = options.chromaticities ?? CHROMATICITIES_REC709;
  // Channels are stored in alphabetical order; value is the RGBA offset.
  const channels: Array<[string, number]> =
    options.includeAlpha === false
      ? [
          ['B', 2],
          ['G', 1],
          ['R', 0],
        ]
      : [
          ['A', 3],
          ['B', 2],
          ['G', 1],
          ['R', 0],
        ];

  // --- Header ---
  const header = new ByteWriter();
  header.i32(20000630); // magic
  header.i32(2); // version 2, single-part scanline, short names
  header.attribute('channels', 'chlist', (w) => {
    for (const [name] of channels) {
      w.string(name);
      w.i32(pixelType);
      w.u8(0); // pLinear
      w.u8(0);
      w.u8(0);
      w.u8(0); // reserved
      w.i32(1); // xSampling
      w.i32(1); // ySampling
    }
    w.u8(0);
  });
  header.attribute('compression', 'compression', (w) => w.u8(0));
  const box = (w: ByteWriter) => {
    w.i32(0);
    w.i32(0);
    w.i32(width - 1);
    w.i32(height - 1);
  };
  header.attribute('dataWindow', 'box2i', box);
  header.attribute('displayWindow', 'box2i', box);
  header.attribute('lineOrder', 'lineOrder', (w) => w.u8(0)); // INCREASING_Y
  header.attribute('pixelAspectRatio', 'float', (w) => w.f32(1));
  header.attribute('screenWindowCenter', 'v2f', (w) => {
    w.f32(0);
    w.f32(0);
  });
  header.attribute('screenWindowWidth', 'float', (w) => w.f32(1));
  header.attribute('chromaticities', 'chromaticities', (w) => {
    for (const c of chroma) w.f32(c);
  });
  header.u8(0); // end of header
  const headerBytes = header.toUint8Array();

  // --- Offset table + scanline blocks (one scanline per block) ---
  const rowBytes = width * channels.length * bytesPerSample;
  const blockBytes = 8 + rowBytes;
  const tableBytes = height * 8;
  const total = headerBytes.length + tableBytes + height * blockBytes;
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  bytes.set(headerBytes, 0);

  const firstBlock = headerBytes.length + tableBytes;
  for (let y = 0; y < height; y++) {
    const offset = firstBlock + y * blockBytes;
    // uint64 little-endian; files stay far below 2^53
    view.setUint32(headerBytes.length + y * 8, offset % 0x100000000, true);
    view.setUint32(headerBytes.length + y * 8 + 4, Math.floor(offset / 0x100000000), true);

    view.setInt32(offset, y, true);
    view.setInt32(offset + 4, rowBytes, true);
    let pos = offset + 8;
    const rowStart = y * width * 4;
    for (const [, c] of channels) {
      for (let x = 0; x < width; x++) {
        const v = data[rowStart + x * 4 + c] ?? 0;
        if (half) {
          view.setUint16(pos, floatToHalfBits(v), true);
          pos += 2;
        } else {
          view.setFloat32(pos, v, true);
          pos += 4;
        }
      }
    }
  }
  return buffer;
}
