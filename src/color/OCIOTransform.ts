/**
 * OCIOTransform - Color space transformation matrices and functions
 *
 * Implements mathematically accurate color space conversions using
 * standard XYZ-based transformations with chromatic adaptation.
 */

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
 * Compute chromatic adaptation matrix from source to destination white point
 */
export function chromaticAdaptationMatrix(
  srcWhite: RGB,
  dstWhite: RGB
): Matrix3x3 {
  // Convert white points to cone response (Bradford)
  const srcCone = multiplyMatrixVector(BRADFORD, srcWhite);
  const dstCone = multiplyMatrixVector(BRADFORD, dstWhite);

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

  // M_adapt = Bradford_inv * Scale * Bradford
  const temp = multiplyMatrices(scale, BRADFORD);
  return multiplyMatrices(BRADFORD_INV, temp);
}

/**
 * Pre-computed D60 to D65 adaptation matrix
 */
export const D60_TO_D65: Matrix3x3 = chromaticAdaptationMatrix(D60_WHITE, D65_WHITE);

/**
 * Pre-computed D65 to D60 adaptation matrix
 */
export const D65_TO_D60: Matrix3x3 = chromaticAdaptationMatrix(D65_WHITE, D60_WHITE);

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
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (c * x + d) + e)));
}

/**
 * Apply ACES tone mapping to RGB
 */
export function acesToneMapRGB(rgb: RGB): RGB {
  return [acesToneMap(rgb[0]), acesToneMap(rgb[1]), acesToneMap(rgb[2])];
}

// =============================================================================
// OCIOTransform Class
// =============================================================================

/**
 * Transform step type
 */
type TransformStep =
  | { type: 'matrix'; matrix: Matrix3x3 }
  | { type: 'gamma_encode'; func: 'srgb' | 'rec709' }
  | { type: 'gamma_decode'; func: 'srgb' | 'rec709' }
  | { type: 'tonemap'; func: 'aces' };

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
      // Already in same white point (D65)
      this.steps.push({ type: 'matrix', matrix: DCIP3_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_SRGB });
      this.steps.push({ type: 'gamma_encode', func: 'srgb' });
      return;
    }

    // sRGB to DCI-P3
    if (input === 'sRGB' && output === 'DCI-P3') {
      this.steps.push({ type: 'gamma_decode', func: 'srgb' });
      this.steps.push({ type: 'matrix', matrix: SRGB_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_DCIP3 });
      return;
    }

    // ACEScg to DCI-P3
    if (input === 'ACEScg' && output === 'DCI-P3') {
      this.steps.push({ type: 'matrix', matrix: ACESCG_TO_XYZ });
      this.steps.push({ type: 'matrix', matrix: D60_TO_D65 });
      this.steps.push({ type: 'matrix', matrix: XYZ_TO_DCIP3 });
      this.steps.push({ type: 'tonemap', func: 'aces' });
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
          rgb = step.func === 'srgb' ? srgbEncodeRGB(rgb) : rec709EncodeRGB(rgb);
          break;
        case 'gamma_decode':
          rgb = step.func === 'srgb' ? srgbDecodeRGB(rgb) : rec709DecodeRGB(rgb);
          break;
        case 'tonemap':
          rgb = acesToneMapRGB(rgb);
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
      data[i] = Math.round(Math.max(0, Math.min(1, outR)) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, outG)) * 255);
      data[i + 2] = Math.round(Math.max(0, Math.min(1, outB)) * 255);
      // Alpha unchanged
    }

    return imageData;
  }

  /**
   * Create a display transform (input -> working -> display with view)
   */
  static createDisplayTransform(
    inputSpace: string,
    _workingSpace: string,
    display: string,
    _view: string
  ): OCIOTransform {
    // For now, create a simple input -> display transform
    // A full implementation would chain: input -> working -> look -> display+view
    // Working space and view are stored for future use when we implement
    // the full OCIO pipeline with grading operations
    return new OCIOTransform(inputSpace, display);
  }

  /**
   * Create a transform with an optional look
   */
  static createWithLook(
    inputSpace: string,
    display: string,
    _view: string,
    _look: string,
    _direction: 'forward' | 'inverse'
  ): OCIOTransform {
    // Simplified: looks are not yet implemented
    // Just create the base transform
    // View, look, and direction are stored for future implementation
    return new OCIOTransform(inputSpace, display);
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
