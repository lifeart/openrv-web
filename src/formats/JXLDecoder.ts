/**
 * JPEG XL (.jxl) Format Decoder
 *
 * Supports:
 * - JXL codestream (bare, starts with 0xFF 0x0A)
 * - JXL ISOBMFF container (ftyp box with brand 'jxl ')
 * - SDR decode via @jsquash/jxl (libjxl WASM)
 * - Color space metadata extraction from both container colr(nclx) boxes
 *   and bare codestream image headers
 *
 * HDR JXL files are handled separately via the VideoFrame path in
 * FileSourceNode (createImageBitmap + VideoFrame, same as AVIF HDR).
 * This decoder handles the SDR WASM fallback path.
 */

import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';

export interface JXLDecodeResult {
  width: number;
  height: number;
  data: Float32Array;
  channels: number;
  colorSpace: string;
  metadata: Record<string, unknown>;
}

/**
 * Color space info extracted from a JXL file's metadata.
 */
export interface JXLColorSpaceInfo {
  /** Color space name (e.g. 'srgb', 'linear', 'display-p3', 'rec2020', 'rec2020-linear') */
  colorSpace: string;
  /** CICP color primaries code, if available */
  primaries?: number;
  /** CICP transfer characteristics code, if available */
  transfer?: number;
}

/**
 * JXL codestream magic: 0xFF 0x0A
 */
const JXL_CODESTREAM_MAGIC = [0xff, 0x0a] as const;

/**
 * Check if a buffer contains a JXL file.
 *
 * Detects two variants:
 * 1. Bare codestream: starts with [0xFF, 0x0A]
 * 2. ISOBMFF container: ftyp box with major brand 'jxl ' (0x6A786C20)
 */
export function isJXLFile(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false;

  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 12));

  // Check bare codestream magic
  if (bytes[0] === JXL_CODESTREAM_MAGIC[0] && bytes[1] === JXL_CODESTREAM_MAGIC[1]) {
    return true;
  }

  // Check ISOBMFF container: ftyp box with 'jxl ' brand
  if (buffer.byteLength >= 12) {
    const view = new DataView(buffer);
    const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
    if (boxType === 'ftyp') {
      const brand = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      return brand === 'jxl ';
    }
  }

  return false;
}

/**
 * Check if a JXL file uses ISOBMFF container format.
 * Container format files may have colr(nclx) boxes for HDR metadata.
 */
export function isJXLContainer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false;
  const view = new DataView(buffer);
  const boxType = String.fromCharCode(view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7));
  if (boxType !== 'ftyp') return false;
  const brand = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  return brand === 'jxl ';
}

// ---------------------------------------------------------------------------
// CICP → color-space mapping (shared by container and codestream parsers)
// ---------------------------------------------------------------------------

/**
 * Map CICP primaries + transfer codes to a human-readable color space string.
 *
 * CICP codes reference: ITU-T H.273 / ISO 23091-2.
 *   Primaries: 1 = BT.709/sRGB, 9 = BT.2020, 12 = Display P3
 *   Transfer:  1/6/14/15 = BT.709 (≈ sRGB curve), 8 = linear, 13 = sRGB,
 *              16 = PQ (ST 2084), 18 = HLG (ARIB STD-B67)
 */
export function mapCICPToColorSpace(primaries: number, transfer: number): string {
  const isLinear = transfer === 8;
  const isSRGBTransfer = transfer === 1 || transfer === 13 || transfer === 6 || transfer === 14 || transfer === 15;
  const isPQ = transfer === 16;
  const isHLG = transfer === 18;

  if (primaries === 9) {
    // BT.2020
    if (isLinear) return 'rec2020-linear';
    if (isPQ) return 'rec2020-pq';
    if (isHLG) return 'rec2020-hlg';
    return 'rec2020';
  }

  if (primaries === 12) {
    // Display P3
    if (isLinear) return 'display-p3-linear';
    if (isPQ) return 'display-p3-pq';
    if (isHLG) return 'display-p3-hlg';
    return 'display-p3';
  }

  // BT.709 / sRGB (primaries 1) or unrecognized primaries — fall back to sRGB family
  if (isLinear) return 'linear';
  if (isPQ) return 'srgb-pq';
  if (isHLG) return 'srgb-hlg';
  if (isSRGBTransfer || primaries === 1) return 'srgb';

  // Unknown combination — default to srgb
  return 'srgb';
}

// ---------------------------------------------------------------------------
// ISOBMFF container colr(nclx) parser
// ---------------------------------------------------------------------------

/**
 * Parse ISOBMFF container colr(nclx) box to extract color space info.
 * Scans top-level boxes after ftyp for a colr box with nclx colour type.
 */
function parseContainerColorSpace(buffer: ArrayBuffer): JXLColorSpaceInfo | null {
  const view = new DataView(buffer);
  const length = buffer.byteLength;
  if (length < 12) return null;

  const ftypSize = view.getUint32(0);
  if (ftypSize < 8 || ftypSize > length) return null;

  let offset = ftypSize;
  while (offset + 8 <= length) {
    const boxSize = view.getUint32(offset);
    if (boxSize < 8 || offset + boxSize > length) break;

    const boxType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7),
    );

    if (boxType === 'colr') {
      const cStart = offset + 8;
      const cEnd = offset + boxSize;
      if (cStart + 4 <= cEnd) {
        const colourType = String.fromCharCode(
          view.getUint8(cStart),
          view.getUint8(cStart + 1),
          view.getUint8(cStart + 2),
          view.getUint8(cStart + 3),
        );
        if (colourType === 'nclx' && cStart + 4 + 4 <= cEnd) {
          const primaries = view.getUint16(cStart + 4);
          const transfer = view.getUint16(cStart + 6);
          return {
            colorSpace: mapCICPToColorSpace(primaries, transfer),
            primaries,
            transfer,
          };
        }
      }
    }

    offset += boxSize;
  }

  return null;
}

// ---------------------------------------------------------------------------
// JXL bare-codestream color_encoding parser
// ---------------------------------------------------------------------------

/**
 * Minimal bit reader for parsing JXL codestream headers.
 * JXL uses little-endian bit packing (LSB first within each byte).
 */
class JXLBitReader {
  private bytes: Uint8Array;
  private bitPos: number = 0;

  constructor(bytes: Uint8Array, startBit: number = 0) {
    this.bytes = bytes;
    this.bitPos = startBit;
  }

  /** Read `n` bits as an unsigned integer (up to 32 bits). */
  readBits(n: number): number {
    if (n === 0) return 0;
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byteIndex = (this.bitPos + i) >>> 3;
      const bitIndex = (this.bitPos + i) & 7;
      if (byteIndex >= this.bytes.length) return value;
      if ((this.bytes[byteIndex]! >>> bitIndex) & 1) {
        value |= 1 << i;
      }
    }
    this.bitPos += n;
    return value;
  }

  /** Read a single bit as a boolean. */
  readBool(): boolean {
    return this.readBits(1) === 1;
  }

  /**
   * Read a JXL U32 value (variable-length encoding used throughout the spec).
   * Selector (2 bits) chooses from 4 distributions, each with a base + extra bits.
   */
  readU32(d0: [number, number], d1: [number, number], d2: [number, number], d3: [number, number]): number {
    const selector = this.readBits(2);
    const dist = [d0, d1, d2, d3][selector]!;
    return dist[0] + this.readBits(dist[1]);
  }

  /** Read a JXL enum value (uses U32 with standard enum distribution). */
  readEnum(): number {
    return this.readU32([0, 0], [1, 0], [2, 4], [18, 6]);
  }

  get position(): number {
    return this.bitPos;
  }
}

/**
 * Parse color space info from a JXL bare codestream.
 *
 * The codestream layout (ISO 18181-1, Section 4.1):
 *   Signature (2 bytes: 0xFF 0x0A)
 *   SizeHeader (variable, bit-packed)
 *   ImageMetadata (if not all_default):
 *     - extra_fields (Bool)
 *     - ... (if extra_fields: orientation, animation, etc.)
 *     - colour_encoding:
 *       - all_default (Bool) → if true, sRGB
 *       - want_icc (Bool) → if true, ICC profile (opaque to us)
 *       - colour_space (Enum: 0=RGB, 1=Grey, 2=XYB, 3=Unknown)
 *       - white_point (Enum) → may have extra data
 *       - primaries (Enum) → may have extra data
 *       - tf (custom encoding) → transfer function
 *       - rendering_intent (Enum)
 */
function parseCodestreamColorSpace(buffer: ArrayBuffer, codestreamOffset: number = 0): JXLColorSpaceInfo | null {
  const bytes = new Uint8Array(buffer, codestreamOffset);
  if (bytes.length < 4) return null;

  // Verify signature
  if (bytes[0] !== 0xff || bytes[1] !== 0x0a) return null;

  const reader = new JXLBitReader(bytes, 16); // skip 2-byte signature (16 bits)

  // --- SizeHeader ---
  // small (1 bit)
  const small = reader.readBool();
  if (small) {
    // height_m1 (5 bits), ratio (3 bits)
    reader.readBits(5); // height_m1
    const ratio = reader.readBits(3);
    if (ratio === 0) {
      reader.readBits(5); // width_m1
    }
  } else {
    // height_m1: U32(1+u(9), 1+u(13), 1+u(18), 1+u(30))
    reader.readU32([1, 9], [1, 13], [1, 18], [1, 30]);
    const ratio = reader.readBits(3);
    if (ratio === 0) {
      reader.readU32([1, 9], [1, 13], [1, 18], [1, 30]); // width_m1
    }
  }

  // --- ImageMetadata ---
  // all_default (1 bit) — if true, everything is default (sRGB, 8-bit, etc.)
  const allDefault = reader.readBool();
  if (allDefault) {
    return { colorSpace: 'srgb' };
  }

  // extra_fields (1 bit)
  const extraFields = reader.readBool();
  if (extraFields) {
    // orientation: 1 + u(3)
    reader.readBits(3);

    // have_intrinsic_size (Bool)
    const haveIntrinsicSize = reader.readBool();
    if (haveIntrinsicSize) {
      // SizeHeader again (skip it)
      const small2 = reader.readBool();
      if (small2) {
        reader.readBits(5); // height_m1
        const ratio2 = reader.readBits(3);
        if (ratio2 === 0) reader.readBits(5);
      } else {
        reader.readU32([1, 9], [1, 13], [1, 18], [1, 30]);
        const ratio2 = reader.readBits(3);
        if (ratio2 === 0) reader.readU32([1, 9], [1, 13], [1, 18], [1, 30]);
      }
    }

    // have_preview (Bool)
    const havePreview = reader.readBool();
    if (havePreview) {
      // PreviewHeader: SizeHeader variant (div8/div16 encoding)
      const previewSmall = reader.readBool();
      if (previewSmall) {
        reader.readBits(5);
        const ratio3 = reader.readBits(3);
        if (ratio3 === 0) reader.readBits(5);
      } else {
        reader.readU32([1, 9], [1, 13], [1, 18], [1, 30]);
        const ratio3 = reader.readBits(3);
        if (ratio3 === 0) reader.readU32([1, 9], [1, 13], [1, 18], [1, 30]);
      }
    }

    // have_animation (Bool)
    const haveAnimation = reader.readBool();
    if (haveAnimation) {
      // AnimationHeader:
      // tps_numerator: U32(100, 1000, 1+u(10), 1+u(30))
      reader.readU32([100, 0], [1000, 0], [1, 10], [1, 30]);
      // tps_denominator: U32(1, 1001, 1+u(8), 1+u(10))
      reader.readU32([1, 0], [1001, 0], [1, 8], [1, 10]);
      // num_loops: U32(0, u(3), u(16), u(32))
      reader.readU32([0, 0], [0, 3], [0, 16], [0, 32]);
      // have_timecodes (Bool)
      reader.readBool();
    }
  }

  // --- BitDepth ---
  // float_sample (Bool)
  const floatSample = reader.readBool();
  if (floatSample) {
    // bits_per_sample: U32(32, 16, 24, 1+u(6))
    reader.readU32([32, 0], [16, 0], [24, 0], [1, 6]);
    // exp_bits: 1 + u(4)
    reader.readBits(4);
  } else {
    // bits_per_sample: U32(8, 10, 12, 1+u(6))
    reader.readU32([8, 0], [10, 0], [12, 0], [1, 6]);
  }

  // --- Modular16bitSufficientness ---
  // modular_16bit_buffer_sufficient (1 bit) — since JXL spec revision
  // Note: This field was removed in final spec; it's not present.
  // We skip it only if we detect the revision that had it. In practice,
  // the current spec does NOT have this field. We proceed directly.

  // --- num_extra_channels: U32(0, 1, 2+u(4), 12+u(8)) ---
  const numExtra = reader.readU32([0, 0], [1, 0], [2, 4], [12, 8]);

  // Skip ExtraChannelInfo for each extra channel
  for (let i = 0; i < numExtra; i++) {
    // d_alpha (Bool)
    const dAlpha = reader.readBool();
    if (!dAlpha) {
      // ExtraChannelInfo type: Enum
      const ecType = reader.readEnum();
      // bit_depth
      const ecFloat = reader.readBool();
      if (ecFloat) {
        reader.readU32([32, 0], [16, 0], [24, 0], [1, 6]);
        reader.readBits(4);
      } else {
        reader.readU32([8, 0], [10, 0], [12, 0], [1, 6]);
      }
      // dim_shift: U32(0, 3, 4, 1+u(3))
      reader.readU32([0, 0], [3, 0], [4, 0], [1, 3]);
      // name_len: U32(0, u(4), 16+u(5), 48+u(10))
      const nameLen = reader.readU32([0, 0], [0, 4], [16, 5], [48, 10]);
      // skip name bytes (each 8 bits)
      reader.readBits(nameLen * 8);
      // alpha_associated (Bool) — only present for kAlpha (type 0)
      if (ecType === 0) {
        reader.readBool();
      } else {
        // Non-alpha extra channels have no alpha_associated field.
        // We cannot reliably skip further type-specific fields,
        // so bail out and return null for these cases.
        return null;
      }
    }
  }

  // --- colour_encoding ---
  // all_default (Bool)
  const ceAllDefault = reader.readBool();
  if (ceAllDefault) {
    return { colorSpace: 'srgb' };
  }

  // want_icc (Bool)
  const wantICC = reader.readBool();
  if (wantICC) {
    // ICC profile is embedded — we can't easily determine the color space
    // without parsing the full ICC profile. Return 'icc' to indicate this.
    return { colorSpace: 'icc' };
  }

  // colour_space: Enum (0=RGB, 1=Grey, 2=XYB, 3=Unknown)
  const colourSpace = reader.readEnum();

  // white_point: Enum (0=D65 default, 1=custom, 10=E, 11=DCI)
  const whitePoint = reader.readEnum();
  if (whitePoint === 1) {
    // custom white point: 2 × u(19) + u(19) for ux, uy
    reader.readBits(19);
    reader.readBits(19);
  }

  // primaries: Enum — only for RGB (colourSpace == 0)
  let primariesEnum = -1;
  if (colourSpace === 0) {
    primariesEnum = reader.readEnum();
    if (primariesEnum === 2) {
      // Custom primaries: 6 × u(19) for rx,ry, gx,gy, bx,by
      reader.readBits(19 * 6);
    }
  }

  // tf (transfer function) — custom encoding:
  //   use_gamma (1 bit)
  //   if use_gamma: gamma = u(24) (fixed-point, /10^7)
  //   else: transfer_function Enum
  const useGamma = reader.readBool();
  let transferEnum = -1;
  if (useGamma) {
    reader.readBits(24); // gamma value — treat as sRGB-like
  } else {
    transferEnum = reader.readEnum();
  }

  // Map JXL-internal enums to CICP-style codes for our shared mapper.
  //
  // JXL primaries enum (ISO 18181-1 Table B.2):
  //   1 = sRGB/BT.709, 2 = custom, 3 = BT.2100 (BT.2020), 4 = P3
  //
  // JXL transfer function enum (ISO 18181-1 Table B.3):
  //   1 = BT.709, 3 = Linear, 8 = sRGB, 13 = PQ, 16 = DCI,
  //   17 = HLG, 18 = 709 (same as 1)

  let cicpPrimaries: number;
  switch (primariesEnum) {
    case 3: cicpPrimaries = 9; break;   // BT.2020
    case 4: cicpPrimaries = 12; break;  // Display P3
    default: cicpPrimaries = 1; break;  // BT.709/sRGB (1 or unknown)
  }

  let cicpTransfer: number;
  if (useGamma) {
    cicpTransfer = 13; // approximate as sRGB
  } else {
    switch (transferEnum) {
      case 3: cicpTransfer = 8; break;   // Linear
      case 13: cicpTransfer = 16; break; // PQ
      case 17: cicpTransfer = 18; break; // HLG
      case 8: cicpTransfer = 13; break;  // sRGB
      case 1:
      case 18: cicpTransfer = 1; break;  // BT.709
      case 16: cicpTransfer = 13; break; // DCI → treat as sRGB-like
      default: cicpTransfer = 13; break; // Default to sRGB
    }
  }

  return {
    colorSpace: mapCICPToColorSpace(cicpPrimaries, cicpTransfer),
    primaries: cicpPrimaries,
    transfer: cicpTransfer,
  };
}

/**
 * Extract color space information from a JXL file.
 *
 * For ISOBMFF containers: parses colr(nclx) box.
 * For bare codestreams: parses the codestream image header's colour_encoding.
 * Returns null only if parsing fails entirely.
 */
export function parseJXLColorSpace(buffer: ArrayBuffer): JXLColorSpaceInfo | null {
  if (isJXLContainer(buffer)) {
    // Try container colr(nclx) box first
    const containerInfo = parseContainerColorSpace(buffer);
    if (containerInfo) return containerInfo;

    // Fall back: find jxlc or jxlp box containing the codestream and parse it
    const view = new DataView(buffer);
    const length = buffer.byteLength;
    const ftypSize = view.getUint32(0);
    if (ftypSize >= 8 && ftypSize <= length) {
      let offset = ftypSize;
      while (offset + 8 <= length) {
        const boxSize = view.getUint32(offset);
        if (boxSize < 8 || offset + boxSize > length) break;
        const boxType = String.fromCharCode(
          view.getUint8(offset + 4),
          view.getUint8(offset + 5),
          view.getUint8(offset + 6),
          view.getUint8(offset + 7),
        );
        if (boxType === 'jxlc' || boxType === 'jxlp') {
          // The codestream starts at offset + 8 (after box header)
          // For jxlp, skip the 4-byte sequence number
          const csOffset = offset + 8 + (boxType === 'jxlp' ? 4 : 0);
          const result = parseCodestreamColorSpace(buffer, csOffset);
          if (result) return result;
        }
        offset += boxSize;
      }
    }

    return null;
  }

  // Bare codestream
  return parseCodestreamColorSpace(buffer);
}

/**
 * Decode a JXL file to RGBA Float32Array using @jsquash/jxl (libjxl WASM).
 *
 * This is the SDR decode path. HDR JXL files should use the VideoFrame
 * path in FileSourceNode instead.
 *
 * Extracts the original color space from the JXL container or codestream
 * metadata rather than hardcoding sRGB.
 */
export async function decodeJXL(buffer: ArrayBuffer): Promise<JXLDecodeResult> {
  if (!isJXLFile(buffer)) {
    throw new DecoderError('JXL', 'Invalid JXL file: wrong magic signature');
  }

  // Extract color space from the JXL metadata before decoding
  const colorInfo = parseJXLColorSpace(buffer);
  const colorSpace = colorInfo?.colorSpace ?? 'srgb';

  // Lazy-load the WASM decoder
  const { decode } = await import('@jsquash/jxl');
  const imageData: ImageData = await decode(buffer);

  const { width, height, data } = imageData;
  validateImageDimensions(width, height, 'JXL');

  // Convert Uint8ClampedArray RGBA to Float32Array RGBA (0-255 → 0.0-1.0)
  const totalPixels = width * height;
  const float32 = new Float32Array(totalPixels * 4);
  const scale = 1.0 / 255.0;
  for (let i = 0; i < totalPixels * 4; i++) {
    float32[i] = (data[i] ?? 0) * scale;
  }

  const container = isJXLContainer(buffer) ? 'isobmff' : 'codestream';

  return {
    width,
    height,
    data: float32,
    channels: 4,
    colorSpace,
    metadata: {
      format: 'jxl',
      container,
      colorSpace,
      ...(colorInfo?.primaries !== undefined && { primaries: colorInfo.primaries }),
      ...(colorInfo?.transfer !== undefined && { transfer: colorInfo.transfer }),
    },
  };
}
