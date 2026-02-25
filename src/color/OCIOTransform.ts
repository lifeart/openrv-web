/**
 * OCIOTransform - Color space transformation matrices and functions
 *
 * Implements mathematically accurate color space conversions using
 * standard XYZ-based transformations with chromatic adaptation.
 */

import { clamp } from '../utils/math';
import {
  pqEncode, pqDecode,
  hlgEncode, hlgDecode,
  logC3Encode, logC3Decode,
  logC4Encode, logC4Decode,
  log3G10Encode, log3G10Decode,
  slog3Encode, slog3Decode,
  gamma22Encode, gamma22Decode,
  gamma24Encode, gamma24Decode,
  gamma26Encode, gamma26Decode,
  acescctEncode, acescctDecode,
  smpte240mEncode, smpte240mDecode,
} from './TransferFunctions';

/**
 * 3x3 matrix type for color transforms
 */
export type Matrix3x3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

/**
 * RGB triplet
 */
export type RGB = [number, number, number];

// =============================================================================
// Standard Illuminant White Points (XYZ)
// =============================================================================

/** D65 white point (sRGB, Rec.709 standard) */
export const D65_WHITE: RGB = [0.95047, 1.0, 1.08883];

/** D60 white point (ACES standard) */
export const D60_WHITE: RGB = [0.95265, 1.0, 1.00883];

/** D50 white point (ICC Profile connection space) */
export const D50_WHITE: RGB = [0.96422, 1.0, 0.82521];

/** D55 white point */
export const D55_WHITE: RGB = [0.95682, 1.0, 0.92149];

/** Illuminant A (tungsten, ~2856K) */
export const A_WHITE: RGB = [1.09850, 1.0, 0.35585];

// =============================================================================
// Color Space to XYZ Matrices
// =============================================================================

/**
 * sRGB to XYZ (D65)
 * Standard sRGB primaries with D65 white point
 */
export const SRGB_TO_XYZ: Matrix3x3 = [
  0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.0721750, 0.0193339,
  0.1191920, 0.9503041,
];

/**
 * XYZ (D65) to sRGB
 * Inverse of SRGB_TO_XYZ
 */
export const XYZ_TO_SRGB: Matrix3x3 = [
  3.2404542, -1.5371385, -0.4985314, -0.9692660, 1.8760108, 0.0415560, 0.0556434,
  -0.2040259, 1.0572252,
];

/**
 * ACEScg (AP1) to XYZ (D60)
 * ACES CG working space with AP1 primaries
 */
export const ACESCG_TO_XYZ: Matrix3x3 = [
  0.6624542, 0.1340042, 0.1561877, 0.2722287, 0.6740818, 0.0536895, -0.0055746,
  0.0040607, 1.0103391,
];

/**
 * XYZ (D60) to ACEScg (AP1)
 * Inverse of ACESCG_TO_XYZ
 */
export const XYZ_TO_ACESCG: Matrix3x3 = [
  1.6410234, -0.3248033, -0.2364247, -0.6636629, 1.6153316, 0.0167563, 0.0117219,
  -0.0082844, 0.9883948,
];

/**
 * ACES2065-1 (AP0) to XYZ (D60)
 * ACES archival/interchange space
 */
export const ACES2065_TO_XYZ: Matrix3x3 = [
  0.9525524, 0.0, 0.0000937, 0.3439664, 0.7281661, -0.0721325, 0.0, 0.0,
  1.0088251,
];

/**
 * XYZ (D60) to ACES2065-1 (AP0)
 */
export const XYZ_TO_ACES2065: Matrix3x3 = [
  1.0498110, 0.0, -0.0000974, -0.4959030, 1.3733130, 0.0982400, 0.0, 0.0,
  0.9912520,
];

/**
 * Rec.709 to XYZ (D65)
 * Same primaries as sRGB, different transfer function
 */
export const REC709_TO_XYZ: Matrix3x3 = SRGB_TO_XYZ;

/**
 * XYZ (D65) to Rec.709
 */
export const XYZ_TO_REC709: Matrix3x3 = XYZ_TO_SRGB;

/**
 * DCI-P3 to XYZ (D65)
 * Digital Cinema P3 with D65 white
 */
export const DCIP3_TO_XYZ: Matrix3x3 = [
  0.4865709, 0.2656677, 0.1982173, 0.2289746, 0.6917385, 0.0792869, 0.0, 0.0451134,
  1.0439444,
];

/**
 * XYZ (D65) to DCI-P3
 */
export const XYZ_TO_DCIP3: Matrix3x3 = [
  2.4934969, -0.9313836, -0.4027108, -0.8294890, 1.7626641, 0.0236247, 0.0358458,
  -0.0761724, 0.9568845,
];

/**
 * Rec.2020 to XYZ (D65) - ITU-R BT.2020
 * Wide gamut HDR broadcast
 */
export const REC2020_TO_XYZ: Matrix3x3 = [
  0.6369580, 0.1446169, 0.1688810,
  0.2627002, 0.6779981, 0.0593017,
  0.0000000, 0.0280727, 1.0609851,
];

/**
 * XYZ (D65) to Rec.2020
 * Inverse of REC2020_TO_XYZ
 */
export const XYZ_TO_REC2020: Matrix3x3 = [
  1.7166512, -0.3556708, -0.2533663,
  -0.6666844, 1.6164812, 0.0157685,
  0.0176399, -0.0427706, 0.9421031,
];

/**
 * Adobe RGB to XYZ (D65)
 * Photography workflow
 */
export const ADOBERGB_TO_XYZ: Matrix3x3 = [
  0.5767309, 0.1855540, 0.1881852,
  0.2973769, 0.6273491, 0.0752741,
  0.0270343, 0.0706872, 0.9911085,
];

/**
 * XYZ (D65) to Adobe RGB
 * Computed inverse of ADOBERGB_TO_XYZ
 */
export const XYZ_TO_ADOBERGB: Matrix3x3 = invertMatrix(ADOBERGB_TO_XYZ);

/**
 * ProPhoto RGB to XYZ (D50)
 * Wide gamut photography - note: native white point is D50
 */
export const PROPHOTO_TO_XYZ_D50: Matrix3x3 = [
  0.7976749, 0.1351917, 0.0313534,
  0.2880402, 0.7118741, 0.0000857,
  0.0000000, 0.0000000, 0.8252100,
];

/**
 * XYZ (D50) to ProPhoto RGB
 * Computed inverse of PROPHOTO_TO_XYZ_D50
 */
export const XYZ_D50_TO_PROPHOTO: Matrix3x3 = invertMatrix(PROPHOTO_TO_XYZ_D50);

/**
 * ARRI Wide Gamut 3 to XYZ (D65)
 * ARRI ALEXA camera native color space
 */
export const ARRI_WIDE_GAMUT3_TO_XYZ: Matrix3x3 = [
  0.6380064, 0.2147038, 0.0975898,
  0.2919938, 0.8238408, -0.1158345,
  0.0027928, -0.0678150, 1.1530222,
];

/**
 * XYZ (D65) to ARRI Wide Gamut 3
 * Computed inverse of ARRI_WIDE_GAMUT3_TO_XYZ
 */
export const XYZ_TO_ARRI_WIDE_GAMUT3: Matrix3x3 = invertMatrix(ARRI_WIDE_GAMUT3_TO_XYZ);

/**
 * ARRI Wide Gamut 4 to XYZ (D65)
 * ARRI ALEXA 35 camera native color space
 */
export const ARRI_WIDE_GAMUT4_TO_XYZ: Matrix3x3 = [
  0.704858320407232, 0.129760295170463, 0.115837311473977,
  0.254524176404027, 0.781477732712002, -0.036001909116029,
  0.000000000000000, 0.000000000000000, 1.089057750759878,
];

/**
 * XYZ (D65) to ARRI Wide Gamut 4
 * Computed inverse of ARRI_WIDE_GAMUT4_TO_XYZ
 */
export const XYZ_TO_ARRI_WIDE_GAMUT4: Matrix3x3 = invertMatrix(ARRI_WIDE_GAMUT4_TO_XYZ);

/**
 * REDWideGamutRGB to XYZ (D65)
 * RED camera native color space
 */
export const REDWIDEGAMUT_TO_XYZ: Matrix3x3 = [
  0.7352752, 0.0684739, 0.1465509,
  0.2869164, 0.8429858, -0.1299022,
  -0.0797972, -0.0347107, 1.2025079,
];

/**
 * XYZ (D65) to REDWideGamutRGB
 * Computed inverse of REDWIDEGAMUT_TO_XYZ
 */
export const XYZ_TO_REDWIDEGAMUT: Matrix3x3 = invertMatrix(REDWIDEGAMUT_TO_XYZ);

/**
 * Sony S-Gamut3 to XYZ (D65)
 * Sony camera native color space
 */
export const SGAMUT3_TO_XYZ: Matrix3x3 = [
  0.7064827, 0.1288010, 0.1151722,
  0.2709797, 0.7866064, -0.0575861,
  -0.0096778, 0.0046000, 1.0941356,
];

/**
 * XYZ (D65) to Sony S-Gamut3
 * Computed inverse of SGAMUT3_TO_XYZ
 */
export const XYZ_TO_SGAMUT3: Matrix3x3 = invertMatrix(SGAMUT3_TO_XYZ);

/**
 * Sony S-Gamut3.Cine to XYZ (D65)
 * Sony cinema-optimized camera space
 */
export const SGAMUT3CINE_TO_XYZ: Matrix3x3 = [
  0.5990839, 0.2489255, 0.1024065,
  0.2150758, 0.8850685, -0.1001443,
  -0.0320658, -0.0276540, 1.1477198,
];

/**
 * XYZ (D65) to Sony S-Gamut3.Cine
 * Computed inverse of SGAMUT3CINE_TO_XYZ
 */
export const XYZ_TO_SGAMUT3CINE: Matrix3x3 = invertMatrix(SGAMUT3CINE_TO_XYZ);

// =============================================================================
// Bradford Chromatic Adaptation
// =============================================================================

/**
 * Bradford matrix for chromatic adaptation
 */
const BRADFORD: Matrix3x3 = [
  0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296,
];

/**
 * Inverse Bradford matrix
 */
const BRADFORD_INV: Matrix3x3 = [
  0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912, -0.0085287,
  0.0400428, 0.9684867,
];

/**
 * Von Kries cone response matrix
 */
const VON_KRIES: Matrix3x3 = [
  0.4002400, 0.7076000, -0.0808100,
  -0.2263000, 1.1653200, 0.0457000,
  0.0000000, 0.0000000, 0.9182200,
];

/**
 * Inverse Von Kries cone response matrix
 */
const VON_KRIES_INV: Matrix3x3 = [
  1.8599364, -1.1293816, 0.2198974,
  0.3611914, 0.6388125, -0.0000064,
  0.0000000, 0.0000000, 1.0890636,
];

/**
 * Chromatic adaptation method
 */
export type AdaptationMethod = 'bradford' | 'vonKries';

/**
 * Compute chromatic adaptation matrix from source to destination white point
 * @param srcWhite - Source illuminant white point in XYZ
 * @param dstWhite - Destination illuminant white point in XYZ
 * @param method - Adaptation method ('bradford' or 'vonKries'), defaults to 'bradford'
 */
export function chromaticAdaptationMatrix(
  srcWhite: RGB,
  dstWhite: RGB,
  method: AdaptationMethod = 'bradford'
): Matrix3x3 {
  // Select cone response matrices based on method
  const coneMatrix = method === 'vonKries' ? VON_KRIES : BRADFORD;
  const coneMatrixInv = method === 'vonKries' ? VON_KRIES_INV : BRADFORD_INV;

  // Convert white points to cone response
  const srcCone = multiplyMatrixVector(coneMatrix, srcWhite);
  const dstCone = multiplyMatrixVector(coneMatrix, dstWhite);

  // Protect against division by zero with a small epsilon
  const EPSILON = 1e-10;
  const safeDivide = (a: number, b: number): number => {
    if (Math.abs(b) < EPSILON) {
      return a >= 0 ? 1e10 : -1e10; // Return large value preserving sign
    }
    return a / b;
  };

  // Diagonal scaling matrix
  const scale: Matrix3x3 = [
    safeDivide(dstCone[0], srcCone[0]),
    0,
    0,
    0,
    safeDivide(dstCone[1], srcCone[1]),
    0,
    0,
    0,
    safeDivide(dstCone[2], srcCone[2]),
  ];

  // M_adapt = ConeInv * Scale * Cone
  const temp = multiplyMatrices(scale, coneMatrix);
  return multiplyMatrices(coneMatrixInv, temp);
}

/**
 * Pre-computed D60 to D65 adaptation matrix
 */
export const D60_TO_D65: Matrix3x3 = chromaticAdaptationMatrix(D60_WHITE, D65_WHITE);

/**
 * Pre-computed D65 to D60 adaptation matrix
 */
export const D65_TO_D60: Matrix3x3 = chromaticAdaptationMatrix(D65_WHITE, D60_WHITE);

/**
 * Pre-computed D50 to D65 adaptation matrix (for ProPhoto RGB)
 */
export const D50_TO_D65: Matrix3x3 = chromaticAdaptationMatrix(D50_WHITE, D65_WHITE);

/**
 * Pre-computed D65 to D50 adaptation matrix
 */
export const D65_TO_D50: Matrix3x3 = chromaticAdaptationMatrix(D65_WHITE, D50_WHITE);

/**
 * Pre-computed D55 to D65 adaptation matrix
 */
export const D55_TO_D65: Matrix3x3 = chromaticAdaptationMatrix(D55_WHITE, D65_WHITE);

/**
 * Pre-computed D65 to D55 adaptation matrix
 */
export const D65_TO_D55: Matrix3x3 = chromaticAdaptationMatrix(D65_WHITE, D55_WHITE);

/**
 * Pre-computed A to D65 adaptation matrix (tungsten to daylight)
 */
export const A_TO_D65: Matrix3x3 = chromaticAdaptationMatrix(A_WHITE, D65_WHITE);

/**
 * Pre-computed D65 to A adaptation matrix
 */
export const D65_TO_A: Matrix3x3 = chromaticAdaptationMatrix(D65_WHITE, A_WHITE);

// =============================================================================
// Matrix Operations
// =============================================================================

/**
 * Multiply two 3x3 matrices
 */
export function multiplyMatrices(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/**
 * Multiply a 3x3 matrix by a 3-element vector
 */
export function multiplyMatrixVector(m: Matrix3x3, v: RGB): RGB {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * Identity matrix
 */
export const IDENTITY: Matrix3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Compute the inverse of a 3x3 matrix
 * @throws Error if the matrix is singular (determinant is zero)
 */
export function invertMatrix(m: Matrix3x3): Matrix3x3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-15) {
    throw new Error('Matrix is singular and cannot be inverted');
  }
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

/**
 * Compose multiple 3x3 matrices into a single matrix.
 * Applies matrices in order: result = matrices[n-1] * ... * matrices[1] * matrices[0]
 * This means matrices[0] is applied first to a vector.
 *
 * @param matrices - Array of matrices to compose (applied left to right on vectors)
 * @returns Single composed matrix
 */
export function composeMatrices(...matrices: Matrix3x3[]): Matrix3x3 {
  if (matrices.length === 0) {
    return IDENTITY;
  }
  let result = matrices[0]!;
  for (let i = 1; i < matrices.length; i++) {
    result = multiplyMatrices(matrices[i]!, result);
  }
  return result;
}

// =============================================================================
// Transfer Functions (Gamma)
// =============================================================================

/**
 * sRGB OETF (gamma encode) - linear to sRGB
 * IEC 61966-2-1:1999
 */
export function srgbEncode(linear: number): number {
  // Handle NaN and Infinity
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  // Handle negative values (extended range) - mirror around zero
  if (linear < 0) {
    return -srgbEncode(-linear);
  }
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * Math.pow(linear, 1.0 / 2.4) - 0.055;
}

/**
 * sRGB EOTF (gamma decode) - sRGB to linear
 */
export function srgbDecode(encoded: number): number {
  // Handle NaN and Infinity
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  // Handle negative values (extended range) - mirror around zero
  if (encoded < 0) {
    return -srgbDecode(-encoded);
  }
  if (encoded <= 0.04045) {
    return encoded / 12.92;
  }
  return Math.pow((encoded + 0.055) / 1.055, 2.4);
}

/**
 * Rec.709 OETF (gamma encode)
 * ITU-R BT.709
 */
export function rec709Encode(linear: number): number {
  // Handle NaN and Infinity
  if (!Number.isFinite(linear)) {
    return Number.isNaN(linear) ? 0 : (linear > 0 ? 1 : 0);
  }
  // Handle negative values (extended range) - mirror around zero
  if (linear < 0) {
    return -rec709Encode(-linear);
  }
  if (linear < 0.018) {
    return 4.5 * linear;
  }
  return 1.099 * Math.pow(linear, 0.45) - 0.099;
}

/**
 * Rec.709 EOTF (gamma decode)
 */
export function rec709Decode(encoded: number): number {
  // Handle NaN and Infinity
  if (!Number.isFinite(encoded)) {
    return Number.isNaN(encoded) ? 0 : (encoded > 0 ? 1 : 0);
  }
  // Handle negative values (extended range) - mirror around zero
  if (encoded < 0) {
    return -rec709Decode(-encoded);
  }
  if (encoded < 0.081) {
    return encoded / 4.5;
  }
  return Math.pow((encoded + 0.099) / 1.099, 1.0 / 0.45);
}

/**
 * Apply sRGB encode to RGB triplet
 */
export function srgbEncodeRGB(rgb: RGB): RGB {
  return [srgbEncode(rgb[0]), srgbEncode(rgb[1]), srgbEncode(rgb[2])];
}

/**
 * Apply sRGB decode to RGB triplet
 */
export function srgbDecodeRGB(rgb: RGB): RGB {
  return [srgbDecode(rgb[0]), srgbDecode(rgb[1]), srgbDecode(rgb[2])];
}

/**
 * Apply Rec.709 encode to RGB triplet
 */
export function rec709EncodeRGB(rgb: RGB): RGB {
  return [rec709Encode(rgb[0]), rec709Encode(rgb[1]), rec709Encode(rgb[2])];
}

/**
 * Apply Rec.709 decode to RGB triplet
 */
export function rec709DecodeRGB(rgb: RGB): RGB {
  return [rec709Decode(rgb[0]), rec709Decode(rgb[1]), rec709Decode(rgb[2])];
}

// =============================================================================
// Transfer Function Dispatch (connects to TransferFunctions.ts)
// =============================================================================

/** Map of transfer function name to encode function */
const ENCODE_FUNCTIONS: Record<string, (v: number) => number> = {
  pq: pqEncode,
  hlg: hlgEncode,
  logC3: logC3Encode,
  logC4: logC4Encode,
  log3G10: log3G10Encode,
  slog3: slog3Encode,
  gamma22: gamma22Encode,
  gamma24: gamma24Encode,
  gamma26: gamma26Encode,
  acescct: acescctEncode,
  smpte240m: smpte240mEncode,
};

/** Map of transfer function name to decode function */
const DECODE_FUNCTIONS: Record<string, (v: number) => number> = {
  pq: pqDecode,
  hlg: hlgDecode,
  logC3: logC3Decode,
  logC4: logC4Decode,
  log3G10: log3G10Decode,
  slog3: slog3Decode,
  gamma22: gamma22Decode,
  gamma24: gamma24Decode,
  gamma26: gamma26Decode,
  acescct: acescctDecode,
  smpte240m: smpte240mDecode,
};

/**
 * Apply transfer function encode to an RGB triplet by name.
 */
function applyTransferEncodeRGB(func: TransferFunctionName, rgb: RGB): RGB {
  switch (func) {
    case 'srgb':
      return srgbEncodeRGB(rgb);
    case 'rec709':
      return rec709EncodeRGB(rgb);
    default: {
      const encodeFn = ENCODE_FUNCTIONS[func];
      if (encodeFn) {
        return [encodeFn(rgb[0]), encodeFn(rgb[1]), encodeFn(rgb[2])];
      }
      return rgb;
    }
  }
}

/**
 * Apply transfer function decode to an RGB triplet by name.
 */
function applyTransferDecodeRGB(func: TransferFunctionName, rgb: RGB): RGB {
  switch (func) {
    case 'srgb':
      return srgbDecodeRGB(rgb);
    case 'rec709':
      return rec709DecodeRGB(rgb);
    default: {
      const decodeFn = DECODE_FUNCTIONS[func];
      if (decodeFn) {
        return [decodeFn(rgb[0]), decodeFn(rgb[1]), decodeFn(rgb[2])];
      }
      return rgb;
    }
  }
}

// =============================================================================
// ACES Tone Mapping (RRT + ODT approximation)
// =============================================================================

/**
 * Simple ACES-style S-curve tone mapping
 * Approximates the ACES Reference Rendering Transform
 *
 * Based on Narkowicz 2015 ACES Filmic Tone Mapping Curve
 */
export function acesToneMap(x: number): number {
  // Handle NaN and Infinity
  if (!Number.isFinite(x)) {
    return Number.isNaN(x) ? 0 : (x > 0 ? 1 : 0);
  }
  // Handle negative values - clamp to 0
  if (x < 0) {
    return 0;
  }
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1);
}

/**
 * Apply ACES tone mapping to RGB
 */
export function acesToneMapRGB(rgb: RGB): RGB {
  return [acesToneMap(rgb[0]), acesToneMap(rgb[1]), acesToneMap(rgb[2])];
}

// =============================================================================
// Look Transforms (built-in approximations)
// =============================================================================

/**
 * Filmic S-curve look transform.
 * Applies an increased contrast S-curve with slightly warmer shadows
 * and cooler highlights to simulate a classic filmic look.
 */
function filmicLookChannel(x: number): number {
  // Handle edge cases
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // S-curve: steeper midtones, lifted shadows, compressed highlights
  // Using a cubic Bezier-like S-curve approximation
  const t = x;
  const result = t * t * (3.0 - 2.0 * t) * 1.05 - 0.025;
  return clamp(result, 0, 1);
}

/**
 * Apply a built-in look transform to an RGB triplet.
 *
 * Built-in looks:
 * - 'ACES 1.0': Reference rendering (passthrough - ACES RRT is handled by tonemap)
 * - 'Filmic': Increased contrast S-curve for a cinematic look
 * - 'None': Passthrough
 *
 * @param rgb - Input RGB triplet
 * @param lookName - Name of the look to apply
 * @param direction - 'forward' or 'inverse'
 * @returns Transformed RGB triplet
 */
function applyLookTransform(rgb: RGB, lookName: string, direction: 'forward' | 'inverse'): RGB {
  switch (lookName) {
    case 'None':
      return rgb;

    case 'ACES 1.0':
      // ACES reference rendering - the tone mapping is handled by the
      // 'aces' tonemap step in the transform chain, so this is a passthrough
      return rgb;

    case 'Filmic': {
      if (direction === 'forward') {
        // Apply filmic S-curve with slight warm/cool split
        return [
          filmicLookChannel(rgb[0] * 1.02), // Slightly warm reds
          filmicLookChannel(rgb[1]),
          filmicLookChannel(rgb[2] * 0.98), // Slightly cool blues
        ];
      } else {
        // Inverse is approximate (S-curve doesn't have a clean analytical inverse)
        // Use a simple inverse approximation
        const invFilmic = (x: number): number => {
          if (x <= 0) return 0;
          if (x >= 1) return 1;
          // Newton's method approximate inverse of the S-curve
          let t = x;
          for (let iter = 0; iter < 4; iter++) {
            const f = t * t * (3.0 - 2.0 * t) * 1.05 - 0.025 - x;
            const df = (6.0 * t - 6.0 * t * t) * 1.05;
            if (Math.abs(df) < 1e-10) break;
            t -= f / df;
            t = clamp(t, 0, 1);
          }
          return t;
        };
        return [
          invFilmic(rgb[0]) / 1.02,
          invFilmic(rgb[1]),
          invFilmic(rgb[2]) / 0.98,
        ];
      }
    }

    default:
      // Unknown look - passthrough
      return rgb;
  }
}

// =============================================================================
// Gamut Clipping
// =============================================================================

/**
 * Hue-preserving gamut clip.
 *
 * When converting from a wide gamut (P3, Rec.2020) to a narrow gamut (sRGB/Rec.709),
 * out-of-gamut colors may have negative or >1 RGB components. Simple `clamp(0,1)`
 * shifts hue. This function desaturates toward the achromatic axis instead,
 * preserving hue direction and approximate luminance.
 */
export function gamutClip(r: number, g: number, b: number): [number, number, number] {
  if (r >= 0 && r <= 1 && g >= 0 && g <= 1 && b >= 0 && b <= 1) {
    return [r, g, b];
  }
  // Rec.709 luminance
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Lc = Math.max(0, Math.min(1, L));
  if (Lc <= 0) return [0, 0, 0];
  if (Lc >= 1) return [1, 1, 1];
  let t = 1;
  for (const c of [r, g, b]) {
    if (c > 1) t = Math.min(t, (1 - Lc) / (c - Lc));
    else if (c < 0) t = Math.min(t, Lc / (Lc - c));
  }
  return [Lc + t * (r - Lc), Lc + t * (g - Lc), Lc + t * (b - Lc)];
}

// =============================================================================
// OCIOTransform Class
// =============================================================================

/**
 * Supported transfer function names
 */
export type TransferFunctionName =
  | 'srgb'
  | 'rec709'
  | 'pq'
  | 'hlg'
  | 'logC3'
  | 'logC4'
  | 'log3G10'
  | 'slog3'
  | 'gamma22'
  | 'gamma24'
  | 'gamma26'
  | 'acescct'
  | 'smpte240m';

/**
 * Transform step type
 */
type TransformStep =
  | { type: 'matrix'; matrix: Matrix3x3 }
  | { type: 'gamma_encode'; func: TransferFunctionName }
  | { type: 'gamma_decode'; func: TransferFunctionName }
  | { type: 'tonemap'; func: 'aces' }
  | { type: 'look'; name: string; direction: 'forward' | 'inverse' }
  | { type: 'gamut_clip' };

/**
 * Color space transform chain
 */
export class OCIOTransform {
  private steps: TransformStep[] = [];
  private _inputSpace: string;
  private _outputSpace: string;

  constructor(inputSpace: string, outputSpace: string) {
    this._inputSpace = inputSpace;
    this._outputSpace = outputSpace;
    this.buildTransformChain();
  }

  get inputSpace(): string {
    return this._inputSpace;
  }

  get outputSpace(): string {
    return this._outputSpace;
  }

  /**
   * Build the transform chain based on input/output color spaces
   */
  private buildTransformChain(): void {
    this.steps = [];

    // Handle identity transform
    if (this._inputSpace === this._outputSpace) {
      return;
    }

    // Handle Raw/passthrough
    if (this._inputSpace === 'Raw' || this._outputSpace === 'Raw') {
      return;
    }

    // Build transform based on known spaces
    const input = this._inputSpace;
    const output = this._outputSpace;

    // sRGB to Linear sRGB
    if (input === 'sRGB' && output === 'Linear sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      return;
    }

    // Linear sRGB to sRGB
    if (input === 'Linear sRGB' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // sRGB to Rec.709 (same primaries, different OETF)
    if (input === 'sRGB' && output === 'Rec.709') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'gamma_encode', func: 'rec709' });
      return;
    }

    // Rec.709 to sRGB (same primaries, different OETF)
    if (input === 'Rec.709' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'rec709' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // Rec.709 to Linear (Rec.709)
    if (input === 'Rec.709' && output === 'Linear sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'rec709' });
      return;
    }

    // Linear to Rec.709
    if (input === 'Linear sRGB' && output === 'Rec.709') {
      this.steps.push({ type: 'gamma_encode', func: 'rec709' });
      return;
    }

    // ACEScg to sRGB (with tone mapping for display)
    if (input === 'ACEScg' && output === 'sRGB') {
      // ACEScg -> XYZ (D60)
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      // D60 -> D65 chromatic adaptation
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      // XYZ -> sRGB linear
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      // Tone map for display
      this.steps.push({ type: 'tonemap', func: 'aces' });
      // sRGB gamma encode
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // sRGB to ACEScg
    if (input === 'sRGB' && output === 'ACEScg') {
      // Decode sRGB gamma
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      // sRGB linear -> XYZ (D65)
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      // D65 -> D60 chromatic adaptation
      this.steps.push({ type: 'matrix', matrix: D65_TO_D60 });
      // XYZ -> ACEScg
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ACESCG });
      return;
    }

    // ACEScg to Rec.709
    if (input === 'ACEScg' && output === 'Rec.709') {
      // ACEScg -> XYZ (D60)
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      // D60 -> D65
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      // XYZ -> Rec.709 linear
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_REC709 });
      // Tone map
      this.steps.push({ type: 'tonemap', func: 'aces' });
      // Rec.709 gamma
      this.steps.push({ type: 'gamma_encode', func: 'rec709' });
      return;
    }

    // Linear sRGB to ACEScg
    if (input === 'Linear sRGB' && output === 'ACEScg') {
      // Linear sRGB -> XYZ (D65)
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      // D65 -> D60
      this.steps.push({ type: 'matrix', matrix: D65_TO_D60 });
      // XYZ -> ACEScg
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ACESCG });
      return;
    }

    // ACEScg to Linear sRGB
    if (input === 'ACEScg' && output === 'Linear sRGB') {
      // ACEScg -> XYZ (D60)
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      // D60 -> D65
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      // XYZ -> Linear sRGB
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      return;
    }

    // DCI-P3 to sRGB
    if (input === 'DCI-P3' && output === 'sRGB') {
      // Correct order: gamma 2.6 decode MUST happen BEFORE the matrix transform.
      // DCI-P3 signal is encoded with a pure 2.6 power function. We first
      // linearize (decode gamma 2.6), then apply the color-space matrix to
      // convert from linear DCI-P3 primaries through XYZ to linear sRGB.
      // Reversing this order would apply the matrix to non-linear (gamma-encoded)
      // values, producing incorrect colors.
      this.steps.push({ type: 'gamma_decode', func: 'gamma26' });
      // Both DCI-P3 (D65 variant) and sRGB share the D65 white point,
      // so no chromatic adaptation is needed.
      this.steps.push({ type: 'matrix', matrix: DCIP3_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'gamut_clip' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // sRGB to DCI-P3
    if (input === 'sRGB' && output === 'DCI-P3') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_DCIP3 });
      this.steps.push({ type: 'gamut_clip' });
      this.steps.push({ type: 'gamma_encode', func: 'gamma26' });
      return;
    }

    // ACEScg to DCI-P3
    if (input === 'ACEScg' && output === 'DCI-P3') {
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_DCIP3 });
      this.steps.push({ type: 'tonemap', func: 'aces' });
      this.steps.push({ type: 'gamma_encode', func: 'gamma26' });
      return;
    }

    // Rec.2020 to sRGB (Rec.2020 uses BT.1886 gamma ~2.4, approximated as gamma22)
    if (input === 'Rec.2020' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'gamma22' });
      this.steps.push({ type: 'matrix', matrix: REC2020_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'gamut_clip' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // sRGB to Rec.2020
    if (input === 'sRGB' && output === 'Rec.2020') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_REC2020 });
      this.steps.push({ type: 'gamma_encode', func: 'gamma22' });
      return;
    }

    // Adobe RGB to sRGB
    if (input === 'Adobe RGB' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'gamma22' });
      this.steps.push({ type: 'matrix', matrix: ADOBERGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // sRGB to Adobe RGB
    if (input === 'sRGB' && output === 'Adobe RGB') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ADOBERGB });
      this.steps.push({ type: 'gamma_encode', func: 'gamma22' });
      return;
    }

    // ProPhoto RGB to sRGB (with D50->D65 adaptation)
    if (input === 'ProPhoto RGB' && output === 'sRGB') {
      this.steps.push({ type: 'matrix', matrix: PROPHOTO_TO_XYZ_D50 });
      this.steps.push({ type: 'matrix', matrix: D50_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'gamut_clip' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // sRGB to ProPhoto RGB
    if (input === 'sRGB' && output === 'ProPhoto RGB') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D65_TO_D50 });
      this.steps.push({ type: 'matrix', matrix: XYZ_D50_TO_PROPHOTO });
      return;
    }

    // ARRI LogC3 to sRGB
    if (input === 'ARRI LogC3 (EI 800)' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'logC3' });
      this.steps.push({ type: 'matrix', matrix: ARRI_WIDE_GAMUT3_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'tonemap', func: 'aces' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // ARRI LogC4 to sRGB
    if (input === 'ARRI LogC4' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'logC4' });
      this.steps.push({ type: 'matrix', matrix: ARRI_WIDE_GAMUT4_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'tonemap', func: 'aces' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // Sony S-Log3 to sRGB
    if (input === 'Sony S-Log3' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'slog3' });
      this.steps.push({ type: 'matrix', matrix: SGAMUT3CINE_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'tonemap', func: 'aces' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // RED Log3G10 to sRGB
    if (input === 'RED Log3G10' && output === 'sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'log3G10' });
      this.steps.push({ type: 'matrix', matrix: REDWIDEGAMUT_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'tonemap', func: 'aces' });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // =========================================================================
    // Reverse transforms: sRGB -> camera spaces
    // =========================================================================

    // sRGB to ARRI LogC3
    if (input === 'sRGB' && output === 'ARRI LogC3 (EI 800)') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ARRI_WIDE_GAMUT3 });
      this.steps.push({ type: 'gamma_encode', func: 'logC3' });
      return;
    }

    // sRGB to ARRI LogC4
    if (input === 'sRGB' && output === 'ARRI LogC4') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ARRI_WIDE_GAMUT4 });
      this.steps.push({ type: 'gamma_encode', func: 'logC4' });
      return;
    }

    // sRGB to Sony S-Log3
    if (input === 'sRGB' && output === 'Sony S-Log3') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SGAMUT3CINE });
      this.steps.push({ type: 'gamma_encode', func: 'slog3' });
      return;
    }

    // sRGB to RED Log3G10
    if (input === 'sRGB' && output === 'RED Log3G10') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_REDWIDEGAMUT });
      this.steps.push({ type: 'gamma_encode', func: 'log3G10' });
      return;
    }

    // =========================================================================
    // Cross-space transforms: ACEScg <-> camera spaces
    // =========================================================================

    // ACEScg to ARRI LogC3
    if (input === 'ACEScg' && output === 'ARRI LogC3 (EI 800)') {
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ARRI_WIDE_GAMUT3 });
      this.steps.push({ type: 'gamma_encode', func: 'logC3' });
      return;
    }

    // ARRI LogC3 to ACEScg
    if (input === 'ARRI LogC3 (EI 800)' && output === 'ACEScg') {
      this.steps.push({ type: 'gamma_decode', func: 'logC3' });
      this.steps.push({ type: 'matrix', matrix: ARRI_WIDE_GAMUT3_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D65_TO_D60 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ACESCG });
      return;
    }

    // ACEScg to ARRI LogC4
    if (input === 'ACEScg' && output === 'ARRI LogC4') {
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ARRI_WIDE_GAMUT4 });
      this.steps.push({ type: 'gamma_encode', func: 'logC4' });
      return;
    }

    // ARRI LogC4 to ACEScg
    if (input === 'ARRI LogC4' && output === 'ACEScg') {
      this.steps.push({ type: 'gamma_decode', func: 'logC4' });
      this.steps.push({ type: 'matrix', matrix: ARRI_WIDE_GAMUT4_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D65_TO_D60 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ACESCG });
      return;
    }

    // ACEScg to Sony S-Log3
    if (input === 'ACEScg' && output === 'Sony S-Log3') {
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SGAMUT3CINE });
      this.steps.push({ type: 'gamma_encode', func: 'slog3' });
      return;
    }

    // Sony S-Log3 to ACEScg
    if (input === 'Sony S-Log3' && output === 'ACEScg') {
      this.steps.push({ type: 'gamma_decode', func: 'slog3' });
      this.steps.push({ type: 'matrix', matrix: SGAMUT3CINE_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D65_TO_D60 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ACESCG });
      return;
    }

    // ACEScg to RED Log3G10
    if (input === 'ACEScg' && output === 'RED Log3G10') {
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_REDWIDEGAMUT });
      this.steps.push({ type: 'gamma_encode', func: 'log3G10' });
      return;
    }

    // RED Log3G10 to ACEScg
    if (input === 'RED Log3G10' && output === 'ACEScg') {
      this.steps.push({ type: 'gamma_decode', func: 'log3G10' });
      this.steps.push({ type: 'matrix', matrix: REDWIDEGAMUT_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D65_TO_D60 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ACESCG });
      return;
    }

    // =========================================================================
    // Rec.2020 cross-space transforms
    // =========================================================================

    // Rec.2020 to ACEScg (decode Rec.2020 gamma first, ACEScg is linear)
    if (input === 'Rec.2020' && output === 'ACEScg') {
      this.steps.push({ type: 'gamma_decode', func: 'gamma22' });
      this.steps.push({ type: 'matrix', matrix: REC2020_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D65_TO_D60 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_ACESCG });
      return;
    }

    // ACEScg to Rec.2020 (encode Rec.2020 gamma on output)
    if (input === 'ACEScg' && output === 'Rec.2020') {
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_REC2020 });
      this.steps.push({ type: 'gamma_encode', func: 'gamma22' });
      return;
    }

    // Rec.2020 to Linear sRGB (decode Rec.2020 gamma first)
    if (input === 'Rec.2020' && output === 'Linear sRGB') {
      this.steps.push({ type: 'gamma_decode', func: 'gamma22' });
      this.steps.push({ type: 'matrix', matrix: REC2020_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      return;
    }

    // Linear sRGB to Rec.2020 (encode Rec.2020 gamma on output)
    if (input === 'Linear sRGB' && output === 'Rec.2020') {
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_REC2020 });
      this.steps.push({ type: 'gamma_encode', func: 'gamma22' });
      return;
    }

    // Default: no transform (identity)
    // In a full implementation, we would have more transforms
  }

  /**
   * Apply the transform to an RGB color
   */
  apply(r: number, g: number, b: number): RGB {
    // Sanitize input - replace NaN with 0, Infinity with clamped values
    const sanitize = (v: number): number => {
      if (Number.isNaN(v)) return 0;
      if (v === Infinity) return 1e10;
      if (v === -Infinity) return -1e10;
      return v;
    };

    let rgb: RGB = [sanitize(r), sanitize(g), sanitize(b)];

    for (const step of this.steps) {
      switch (step.type) {
        case 'matrix':
          rgb = multiplyMatrixVector(step.matrix, rgb);
          break;
        case 'gamma_encode':
          rgb = applyTransferEncodeRGB(step.func, rgb);
          break;
        case 'gamma_decode':
          rgb = applyTransferDecodeRGB(step.func, rgb);
          break;
        case 'tonemap':
          rgb = acesToneMapRGB(rgb);
          break;
        case 'look':
          rgb = applyLookTransform(rgb, step.name, step.direction);
          break;
        case 'gamut_clip':
          rgb = gamutClip(rgb[0], rgb[1], rgb[2]);
          break;
      }
    }

    return rgb;
  }

  /**
   * Apply the transform to an ImageData (in-place modification)
   */
  applyToImageData(imageData: ImageData): ImageData {
    const data = imageData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      // Normalize to 0-1 range
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      // Apply transform
      const [outR, outG, outB] = this.apply(r, g, b);

      // Clamp and convert back to 8-bit
      data[i] = Math.round(clamp(outR, 0, 1) * 255);
      data[i + 1] = Math.round(clamp(outG, 0, 1) * 255);
      data[i + 2] = Math.round(clamp(outB, 0, 1) * 255);
      // Alpha unchanged
    }

    return imageData;
  }

  /**
   * Create a display transform (input -> working -> [look] -> display with view)
   *
   * Builds a full transform chain:
   * 1. Input color space decode/linearize
   * 2. Convert to working space (where grading/CDL operations happen)
   * 3. Apply look transform (if any)
   * 4. Convert from working space to display
   * 5. Apply display gamma/tone mapping
   */
  static createDisplayTransform(
    inputSpace: string,
    workingSpace: string,
    display: string,
    _view: string,
    look?: string,
    lookDirection?: 'forward' | 'inverse'
  ): OCIOTransform {
    // If input and display are the same (identity), use simple path
    // Also if working space matches input, skip the intermediate step
    if (
      !workingSpace ||
      inputSpace === display ||
      workingSpace === inputSpace
    ) {
      // Simple path: input -> display (possibly with look)
      if (look && look !== 'None') {
        return OCIOTransform.createWithLook(inputSpace, display, _view, look, lookDirection ?? 'forward');
      }
      return new OCIOTransform(inputSpace, display);
    }

    // Full pipeline: input -> working -> [look] -> display
    // Build a composite transform by chaining sub-transforms
    const transform = new OCIOTransform(inputSpace, display);
    transform.steps = []; // Clear auto-built steps

    // Step 1: Input -> Working space
    const inputToWorking = new OCIOTransform(inputSpace, workingSpace);
    transform.steps.push(...inputToWorking.steps);

    // Step 2: Apply look transform in working space
    if (look && look !== 'None') {
      transform.steps.push({ type: 'look', name: look, direction: lookDirection ?? 'forward' });
    }

    // Step 3: Working -> Display space
    const workingToDisplay = new OCIOTransform(workingSpace, display);
    transform.steps.push(...workingToDisplay.steps);

    return transform;
  }

  /**
   * Create a transform with an optional look
   */
  static createWithLook(
    inputSpace: string,
    display: string,
    _view: string,
    look: string,
    direction: 'forward' | 'inverse'
  ): OCIOTransform {
    const transform = new OCIOTransform(inputSpace, display);

    // Insert look step before the final display encode (tonemap + gamma)
    // Find the insertion point: before any tonemap or gamma_encode step
    if (look && look !== 'None') {
      let insertIdx = transform.steps.length;
      for (let i = 0; i < transform.steps.length; i++) {
        const step = transform.steps[i]!;
        if (step.type === 'tonemap' || step.type === 'gamma_encode') {
          insertIdx = i;
          break;
        }
      }
      transform.steps.splice(insertIdx, 0, { type: 'look', name: look, direction });
    }

    return transform;
  }
}

/**
 * Convert color space name to a simpler identifier for transform lookup
 */
export function normalizeColorSpaceName(name: string): string {
  // Handle common variations
  const normalized = name
    .replace(/\s*\(.*\)$/, '') // Remove parenthetical info like "(EI 800)"
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}
