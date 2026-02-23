/**
 * ICCProfile - Basic ICC profile parsing and application.
 *
 * Supports ICC v2/v4 display profiles with matrix/TRC (tone response curve)
 * model. Parses the profile header, extracts TRC curves and chromatic
 * adaptation matrices, and applies the profile to convert pixels from
 * the profile's device space to the CIEXYZ Profile Connection Space (PCS).
 *
 * Reference: ICC.1:2022 (ICC Profile Format Specification)
 */

import { clamp } from '../utils/math';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ICC profile signature ('acsp') */
const ICC_SIGNATURE = 0x61637370;

/** Tag signatures */
const TAG_RED_TRC = 0x72545243;   // 'rTRC'
const TAG_GREEN_TRC = 0x67545243; // 'gTRC'
const TAG_BLUE_TRC = 0x62545243;  // 'bTRC'
const TAG_RED_XYZ = 0x7258595A;   // 'rXYZ'
const TAG_GREEN_XYZ = 0x6758595A; // 'gXYZ'
const TAG_BLUE_XYZ = 0x6258595A;  // 'bXYZ'
const TAG_WTPT = 0x77747074;      // 'wtpt'
const TAG_CHAD = 0x63686164;      // 'chad'

/** Type signatures */
const TYPE_CURV = 0x63757276; // 'curv'
const TYPE_PARA = 0x70617261; // 'para'
const TYPE_XYZ = 0x58595A20;  // 'XYZ '
const TYPE_SF32 = 0x73663332; // 'sf32'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileClass =
  | 'input'    // 'scnr'
  | 'display'  // 'mntr'
  | 'output'   // 'prtr'
  | 'link'     // 'link'
  | 'colorspace' // 'spac'
  | 'abstract' // 'abst'
  | 'named'    // 'nmcl'
  | 'unknown';

export type ColorSpaceType =
  | 'XYZ' | 'Lab' | 'Luv' | 'YCbCr' | 'Yxy'
  | 'RGB' | 'Gray' | 'HSV' | 'HLS' | 'CMYK'
  | 'CMY' | 'unknown';

export type RenderingIntent =
  | 'perceptual'        // 0
  | 'relative'          // 1 (relative colorimetric)
  | 'saturation'        // 2
  | 'absolute';         // 3 (absolute colorimetric)

/** Parsed ICC profile header */
export interface ICCProfileHeader {
  /** Profile size in bytes */
  size: number;
  /** Preferred CMM type */
  preferredCMM: number;
  /** Profile version (major.minor) */
  version: string;
  /** Major version number */
  versionMajor: number;
  /** Minor version number */
  versionMinor: number;
  /** Profile/device class */
  profileClass: ProfileClass;
  /** Data color space */
  colorSpace: ColorSpaceType;
  /** Profile Connection Space */
  pcs: 'XYZ' | 'Lab';
  /** Rendering intent */
  renderingIntent: RenderingIntent;
  /** Profile signature (should be 'acsp') */
  signature: number;
}

/**
 * Tone Response Curve - can be:
 * - gamma: a single gamma exponent
 * - table: a lookup table of values
 * - parametric: ICC parametric curve (type 'para')
 */
export interface ToneCurve {
  type: 'gamma' | 'table' | 'parametric';
  /** For 'gamma' type: the exponent */
  gamma?: number;
  /** For 'table' type: the LUT values (normalized 0-1) */
  table?: Float32Array;
  /** For 'parametric' type: the function type and parameters */
  funcType?: number;
  params?: number[];
}

/** 3x3 matrix stored row-major */
export type Matrix3x3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** XYZ tristimulus value */
export interface XYZValue {
  X: number;
  Y: number;
  Z: number;
}

/** Parsed ICC profile data */
export interface ICCProfileData {
  header: ICCProfileHeader;
  /** Red channel TRC */
  redTRC: ToneCurve | null;
  /** Green channel TRC */
  greenTRC: ToneCurve | null;
  /** Blue channel TRC */
  blueTRC: ToneCurve | null;
  /** RGB to XYZ matrix (from rXYZ, gXYZ, bXYZ columns) */
  rgbToXYZMatrix: Matrix3x3 | null;
  /** Profile white point */
  whitePoint: XYZValue | null;
  /** Chromatic adaptation matrix (from 'chad' tag) */
  chromaticAdaptationMatrix: Matrix3x3 | null;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Read a 4-byte big-endian unsigned integer.
 */
function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

/**
 * Read a 2-byte big-endian unsigned integer.
 */
function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

/**
 * Read a 4-byte big-endian signed integer.
 */
function readS32(view: DataView, offset: number): number {
  return view.getInt32(offset, false);
}

/**
 * Read an s15Fixed16Number (ICC fixed-point: 16-bit integer + 16-bit fraction).
 */
function readS15Fixed16(view: DataView, offset: number): number {
  const raw = readS32(view, offset);
  return raw / 65536;
}

/**
 * Read a u8Fixed8Number (8-bit integer + 8-bit fraction).
 */
function readU8Fixed8(view: DataView, offset: number): number {
  return readU16(view, offset) / 256;
}

/**
 * Decode a 4-byte tag signature to a string.
 */
function sigToString(sig: number): string {
  return String.fromCharCode(
    (sig >> 24) & 0xFF,
    (sig >> 16) & 0xFF,
    (sig >> 8) & 0xFF,
    sig & 0xFF,
  );
}

/**
 * Map 4-byte profile class signature to enum.
 */
function parseProfileClass(sig: number): ProfileClass {
  const s = sigToString(sig);
  switch (s) {
    case 'scnr': return 'input';
    case 'mntr': return 'display';
    case 'prtr': return 'output';
    case 'link': return 'link';
    case 'spac': return 'colorspace';
    case 'abst': return 'abstract';
    case 'nmcl': return 'named';
    default: return 'unknown';
  }
}

/**
 * Map 4-byte color space signature to enum.
 */
function parseColorSpace(sig: number): ColorSpaceType {
  const s = sigToString(sig).trim();
  switch (s) {
    case 'XYZ': return 'XYZ';
    case 'Lab': return 'Lab';
    case 'Luv': return 'Luv';
    case 'YCbr': return 'YCbCr';
    case 'Yxy': return 'Yxy';
    case 'RGB': return 'RGB';
    case 'GRAY': return 'Gray';
    case 'HSV': return 'HSV';
    case 'HLS': return 'HLS';
    case 'CMYK': return 'CMYK';
    case 'CMY': return 'CMY';
    default: return 'unknown';
  }
}

/**
 * Map rendering intent number to enum.
 */
function parseRenderingIntent(value: number): RenderingIntent {
  switch (value & 0x3) {
    case 0: return 'perceptual';
    case 1: return 'relative';
    case 2: return 'saturation';
    case 3: return 'absolute';
    default: return 'perceptual';
  }
}

// ---------------------------------------------------------------------------
// Tag parsing
// ---------------------------------------------------------------------------

/**
 * Parse a 'curv' type TRC tag.
 */
function parseCurvTag(view: DataView, offset: number, _size: number): ToneCurve {
  const count = readU32(view, offset + 8);

  if (count === 0) {
    // Identity (gamma 1.0)
    return { type: 'gamma', gamma: 1.0 };
  }

  if (count === 1) {
    // Single gamma value stored as u8Fixed8Number
    const gamma = readU8Fixed8(view, offset + 12);
    return { type: 'gamma', gamma };
  }

  // Table of values
  const table = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    table[i] = readU16(view, offset + 12 + i * 2) / 65535;
  }
  return { type: 'table', table };
}

/**
 * Parse a 'para' type parametric curve tag.
 *
 * Parametric curve types:
 * 0: Y = X^g
 * 1: Y = (aX + b)^g, X >= -b/a; Y = 0, X < -b/a
 * 2: Y = (aX + b)^g + c, X >= -b/a; Y = c, X < -b/a
 * 3: Y = (aX + b)^g, X >= d; Y = cX, X < d
 * 4: Y = (aX + b)^g + e, X >= d; Y = cX + f, X < d
 */
function parseParaTag(view: DataView, offset: number, _size: number): ToneCurve {
  const funcType = readU16(view, offset + 8);

  // Number of parameters for each function type
  const paramCounts = [1, 3, 4, 5, 7];
  const numParams = paramCounts[funcType] ?? 1;

  const params: number[] = [];
  for (let i = 0; i < numParams; i++) {
    params.push(readS15Fixed16(view, offset + 12 + i * 4));
  }

  return { type: 'parametric', funcType, params };
}

/**
 * Parse a TRC tag (either 'curv' or 'para').
 */
function parseTRC(view: DataView, offset: number, size: number): ToneCurve | null {
  if (size < 8) return null;

  const typeSig = readU32(view, offset);
  if (typeSig === TYPE_CURV) {
    return parseCurvTag(view, offset, size);
  }
  if (typeSig === TYPE_PARA) {
    return parseParaTag(view, offset, size);
  }
  return null;
}

/**
 * Parse an XYZ type tag.
 */
function parseXYZ(view: DataView, offset: number, _size: number): XYZValue | null {
  const typeSig = readU32(view, offset);
  if (typeSig !== TYPE_XYZ) return null;

  return {
    X: readS15Fixed16(view, offset + 8),
    Y: readS15Fixed16(view, offset + 12),
    Z: readS15Fixed16(view, offset + 16),
  };
}

/**
 * Parse an sf32 (s15Fixed16Array) tag as a 3x3 matrix.
 */
function parseSF32Matrix(view: DataView, offset: number, _size: number): Matrix3x3 | null {
  const typeSig = readU32(view, offset);
  if (typeSig !== TYPE_SF32) return null;

  const matrix: number[] = [];
  for (let i = 0; i < 9; i++) {
    matrix.push(readS15Fixed16(view, offset + 8 + i * 4));
  }
  return matrix as Matrix3x3;
}

// ---------------------------------------------------------------------------
// Profile parsing
// ---------------------------------------------------------------------------

/**
 * Parse an ICC profile from a binary buffer.
 *
 * @param buffer - The raw ICC profile data
 * @returns Parsed profile data, or null if the buffer is invalid
 */
export function parseICCProfile(buffer: ArrayBuffer): ICCProfileData | null {
  if (buffer.byteLength < 132) return null; // Minimum header size

  const view = new DataView(buffer);

  // Verify signature at offset 36
  const signature = readU32(view, 36);
  if (signature !== ICC_SIGNATURE) return null;

  // Parse header
  const size = readU32(view, 0);
  const preferredCMM = readU32(view, 4);
  const versionRaw = readU32(view, 8);
  const versionMajor = (versionRaw >> 24) & 0xFF;
  const versionMinor = ((versionRaw >> 20) & 0xF);
  const profileClassSig = readU32(view, 12);
  const colorSpaceSig = readU32(view, 16);
  const pcsSig = readU32(view, 20);
  const intentRaw = readU32(view, 64);

  const header: ICCProfileHeader = {
    size,
    preferredCMM,
    version: `${versionMajor}.${versionMinor}`,
    versionMajor,
    versionMinor,
    profileClass: parseProfileClass(profileClassSig),
    colorSpace: parseColorSpace(colorSpaceSig),
    pcs: sigToString(pcsSig).trim() === 'Lab' ? 'Lab' : 'XYZ',
    renderingIntent: parseRenderingIntent(intentRaw),
    signature,
  };

  // Parse tag table
  const tagCount = readU32(view, 128);
  const tags = new Map<number, { offset: number; size: number }>();

  for (let i = 0; i < tagCount; i++) {
    const tagOffset = 132 + i * 12;
    if (tagOffset + 12 > buffer.byteLength) break;

    const tagSig = readU32(view, tagOffset);
    const tagDataOffset = readU32(view, tagOffset + 4);
    const tagDataSize = readU32(view, tagOffset + 8);

    // Validate tag bounds
    if (tagDataOffset + tagDataSize <= buffer.byteLength) {
      tags.set(tagSig, { offset: tagDataOffset, size: tagDataSize });
    }
  }

  // Extract TRCs
  const redTRCTag = tags.get(TAG_RED_TRC);
  const greenTRCTag = tags.get(TAG_GREEN_TRC);
  const blueTRCTag = tags.get(TAG_BLUE_TRC);

  const redTRC = redTRCTag ? parseTRC(view, redTRCTag.offset, redTRCTag.size) : null;
  const greenTRC = greenTRCTag ? parseTRC(view, greenTRCTag.offset, greenTRCTag.size) : null;
  const blueTRC = blueTRCTag ? parseTRC(view, blueTRCTag.offset, blueTRCTag.size) : null;

  // Extract RGB to XYZ matrix from individual column tags
  const redXYZTag = tags.get(TAG_RED_XYZ);
  const greenXYZTag = tags.get(TAG_GREEN_XYZ);
  const blueXYZTag = tags.get(TAG_BLUE_XYZ);

  let rgbToXYZMatrix: Matrix3x3 | null = null;
  if (redXYZTag && greenXYZTag && blueXYZTag) {
    const rXYZ = parseXYZ(view, redXYZTag.offset, redXYZTag.size);
    const gXYZ = parseXYZ(view, greenXYZTag.offset, greenXYZTag.size);
    const bXYZ = parseXYZ(view, blueXYZTag.offset, blueXYZTag.size);

    if (rXYZ && gXYZ && bXYZ) {
      // Matrix rows: X = rX*R + gX*G + bX*B, etc.
      rgbToXYZMatrix = [
        rXYZ.X, gXYZ.X, bXYZ.X,
        rXYZ.Y, gXYZ.Y, bXYZ.Y,
        rXYZ.Z, gXYZ.Z, bXYZ.Z,
      ];
    }
  }

  // Extract white point
  const wtptTag = tags.get(TAG_WTPT);
  const whitePoint = wtptTag ? parseXYZ(view, wtptTag.offset, wtptTag.size) : null;

  // Extract chromatic adaptation matrix
  const chadTag = tags.get(TAG_CHAD);
  const chromaticAdaptationMatrix = chadTag
    ? parseSF32Matrix(view, chadTag.offset, chadTag.size)
    : null;

  return {
    header,
    redTRC,
    greenTRC,
    blueTRC,
    rgbToXYZMatrix,
    whitePoint,
    chromaticAdaptationMatrix,
  };
}

// ---------------------------------------------------------------------------
// TRC application
// ---------------------------------------------------------------------------

/**
 * Apply a tone response curve to linearize a value.
 * Converts from device-encoded value to linear light.
 *
 * @param value - Encoded value (0-1)
 * @param curve - The TRC to apply
 * @returns Linearized value
 */
export function applyTRC(value: number, curve: ToneCurve): number {
  const v = clamp(value, 0, 1);

  switch (curve.type) {
    case 'gamma':
      return Math.pow(v, curve.gamma ?? 2.2);

    case 'table': {
      if (!curve.table || curve.table.length === 0) return v;
      const table = curve.table;
      const maxIdx = table.length - 1;
      const idx = v * maxIdx;
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, maxIdx);
      const frac = idx - lo;
      return table[lo]! * (1 - frac) + table[hi]! * frac;
    }

    case 'parametric': {
      if (!curve.params || curve.params.length === 0) return v;
      return applyParametricCurve(v, curve.funcType ?? 0, curve.params);
    }

    default:
      return v;
  }
}

/**
 * Apply a parametric curve function.
 */
function applyParametricCurve(x: number, funcType: number, params: number[]): number {
  const g = params[0] ?? 1;

  switch (funcType) {
    case 0:
      // Y = X^g
      return Math.pow(x, g);

    case 1: {
      // Y = (aX + b)^g if X >= -b/a, else 0
      const a = params[1] ?? 1;
      const b = params[2] ?? 0;
      const threshold = a !== 0 ? -b / a : 0;
      return x >= threshold ? Math.pow(a * x + b, g) : 0;
    }

    case 2: {
      // Y = (aX + b)^g + c if X >= -b/a, else c
      const a = params[1] ?? 1;
      const b = params[2] ?? 0;
      const c = params[3] ?? 0;
      const threshold = a !== 0 ? -b / a : 0;
      return x >= threshold ? Math.pow(a * x + b, g) + c : c;
    }

    case 3: {
      // Y = (aX + b)^g if X >= d, else cX
      const a = params[1] ?? 1;
      const b = params[2] ?? 0;
      const c = params[3] ?? 0;
      const d = params[4] ?? 0;
      return x >= d ? Math.pow(a * x + b, g) : c * x;
    }

    case 4: {
      // Y = (aX + b)^g + e if X >= d, else cX + f
      const a = params[1] ?? 1;
      const b = params[2] ?? 0;
      const c = params[3] ?? 0;
      const d = params[4] ?? 0;
      const e = params[5] ?? 0;
      const f = params[6] ?? 0;
      return x >= d ? Math.pow(a * x + b, g) + e : c * x + f;
    }

    default:
      return Math.pow(x, g);
  }
}

// ---------------------------------------------------------------------------
// Matrix application
// ---------------------------------------------------------------------------

/**
 * Apply a 3x3 matrix to an RGB triplet.
 *
 * @param r - Red component
 * @param g - Green component
 * @param b - Blue component
 * @param matrix - 3x3 row-major matrix
 * @returns Transformed [X, Y, Z] values
 */
export function applyMatrix3x3(
  r: number,
  g: number,
  b: number,
  matrix: Matrix3x3,
): [number, number, number] {
  return [
    matrix[0] * r + matrix[1] * g + matrix[2] * b,
    matrix[3] * r + matrix[4] * g + matrix[5] * b,
    matrix[6] * r + matrix[7] * g + matrix[8] * b,
  ];
}

/**
 * Invert a 3x3 matrix. Returns null if singular.
 */
export function invertMatrix3x3(m: Matrix3x3): Matrix3x3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;

  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

// ---------------------------------------------------------------------------
// Profile application
// ---------------------------------------------------------------------------

/**
 * Apply an ICC profile to convert device RGB to CIEXYZ PCS.
 *
 * Pipeline: decode TRC (linearize) -> apply RGB-to-XYZ matrix -> PCS
 *
 * @param r - Red device value (0-1)
 * @param g - Green device value (0-1)
 * @param b - Blue device value (0-1)
 * @param profile - Parsed ICC profile
 * @returns XYZ tristimulus values, or null if profile lacks required data
 */
export function applyProfileToXYZ(
  r: number,
  g: number,
  b: number,
  profile: ICCProfileData,
): XYZValue | null {
  if (!profile.rgbToXYZMatrix) return null;

  // Step 1: Decode TRC (linearize device values)
  const linearR = profile.redTRC ? applyTRC(r, profile.redTRC) : r;
  const linearG = profile.greenTRC ? applyTRC(g, profile.greenTRC) : g;
  const linearB = profile.blueTRC ? applyTRC(b, profile.blueTRC) : b;

  // Step 2: Apply RGB-to-XYZ matrix
  const [X, Y, Z] = applyMatrix3x3(linearR, linearG, linearB, profile.rgbToXYZMatrix);

  return { X, Y, Z };
}

/**
 * Apply an ICC profile to convert device RGB to linear RGB
 * (by applying TRC linearization only, without the matrix transform).
 *
 * Useful for monitor profiles where you want to get linear-light values
 * in the profile's native RGB primaries.
 *
 * @param r - Red device value (0-1)
 * @param g - Green device value (0-1)
 * @param b - Blue device value (0-1)
 * @param profile - Parsed ICC profile
 * @returns Linearized RGB values
 */
export function linearizeRGB(
  r: number,
  g: number,
  b: number,
  profile: ICCProfileData,
): [number, number, number] {
  const linearR = profile.redTRC ? applyTRC(r, profile.redTRC) : r;
  const linearG = profile.greenTRC ? applyTRC(g, profile.greenTRC) : g;
  const linearB = profile.blueTRC ? applyTRC(b, profile.blueTRC) : b;
  return [linearR, linearG, linearB];
}

/**
 * Apply an ICC profile to a pixel buffer (in-place, Float32Array RGBA).
 *
 * Converts from device RGB to linear RGB using the profile's TRC curves.
 * The matrix transform is not applied (use applyProfileToXYZ for full conversion).
 *
 * @param data - RGBA Float32Array (4 values per pixel)
 * @param profile - Parsed ICC profile
 */
export function linearizeBuffer(data: Float32Array, profile: ICCProfileData): void {
  if (!profile.redTRC && !profile.greenTRC && !profile.blueTRC) return;

  for (let i = 0; i < data.length; i += 4) {
    if (profile.redTRC) data[i] = applyTRC(data[i]!, profile.redTRC);
    if (profile.greenTRC) data[i + 1] = applyTRC(data[i + 1]!, profile.greenTRC);
    if (profile.blueTRC) data[i + 2] = applyTRC(data[i + 2]!, profile.blueTRC);
    // Alpha unchanged
  }
}

// ---------------------------------------------------------------------------
// Well-known profiles
// ---------------------------------------------------------------------------

/** sRGB TRC (IEC 61966-2-1) as a parametric curve */
export const SRGB_TRC: ToneCurve = {
  type: 'parametric',
  funcType: 3,
  params: [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045],
};

/** sRGB to XYZ matrix (D65 adapted) */
export const SRGB_TO_XYZ_MATRIX: Matrix3x3 = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041,
];

/** D50 white point (ICC PCS illuminant) */
export const D50_WHITE: XYZValue = { X: 0.9642, Y: 1.0000, Z: 0.8249 };

/** D65 white point */
export const D65_WHITE: XYZValue = { X: 0.95047, Y: 1.00000, Z: 1.08883 };
