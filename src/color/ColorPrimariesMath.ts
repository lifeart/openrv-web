/**
 * ColorPrimariesMath - RGB primaries described by CIE xy chromaticities.
 *
 * Builds RGB→XYZ matrices from chromaticity coordinates (SMPTE RP 177),
 * adapts white points with the Bradford transform, and derives the 3x3
 * matrix that converts linear RGB in arbitrary primaries to the renderer's
 * BT.709 / D65 working space.
 *
 * White point policy: the working space is D65. Sources whose white differs
 * (ACES AP0/AP1 at the ACES ~D60 white, DCI-P3 at the DCI white, Radiance
 * XYZ at equal-energy white) are Bradford-adapted to D65, so their white
 * (1, 1, 1) lands on BT.709 (1, 1, 1). This matches what OCIO ACES configs
 * use for "ACEScg → Linear Rec.709 (sRGB)" display conversions.
 *
 * Chromaticities are stored as 8 numbers: [Rx, Ry, Gx, Gy, Bx, By, Wx, Wy]
 * (the OpenEXR `chromaticities` attribute layout).
 */

import type { ColorPrimaries } from '../core/image/Image';

/** [Rx, Ry, Gx, Gy, Bx, By, Wx, Wy] */
export type Chromaticities = readonly number[];

/** Row-major 3x3 matrix: [m00, m01, m02, m10, ...]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

const D65_XY = [0.3127, 0.329] as const;
const ACES_WHITE_XY = [0.32168, 0.33767] as const;

/** Reference chromaticities for primaries the app knows by name. */
export const CHROMATICITIES = {
  bt709: [0.64, 0.33, 0.3, 0.6, 0.15, 0.06, D65_XY[0], D65_XY[1]],
  bt2020: [0.708, 0.292, 0.17, 0.797, 0.131, 0.046, D65_XY[0], D65_XY[1]],
  /** Display P3 (P3 primaries, D65 white). */
  p3: [0.68, 0.32, 0.265, 0.69, 0.15, 0.06, D65_XY[0], D65_XY[1]],
  /** DCI-P3 (P3 primaries, DCI white). SMPTE RP 431-2. */
  dciP3: [0.68, 0.32, 0.265, 0.69, 0.15, 0.06, 0.314, 0.351],
  /** ACES2065-1 primaries. SMPTE ST 2065-1. */
  acesAP0: [0.7347, 0.2653, 0.0, 1.0, 0.0001, -0.077, ACES_WHITE_XY[0], ACES_WHITE_XY[1]],
  /** ACEScg / ACEScc / ACEScct primaries. S-2014-004. */
  acesAP1: [0.713, 0.293, 0.165, 0.83, 0.128, 0.044, ACES_WHITE_XY[0], ACES_WHITE_XY[1]],
  /** CIE XYZ as an "RGB" space (equal-energy white), e.g. Radiance XYZE. */
  cieXYZ: [1, 0, 0, 1, 0, 0, 1 / 3, 1 / 3],
} as const satisfies Record<string, Chromaticities>;

export type KnownChromaticitiesName = keyof typeof CHROMATICITIES;

/** Human-readable names, for metadata display. */
export const CHROMATICITIES_LABELS: Record<KnownChromaticitiesName, string> = {
  bt709: 'Rec.709',
  bt2020: 'Rec.2020',
  p3: 'Display P3',
  dciP3: 'DCI-P3',
  acesAP0: 'ACES AP0',
  acesAP1: 'ACES AP1',
  cieXYZ: 'CIE XYZ',
};

/** Bradford cone response matrix (row-major). */
const BRADFORD: Mat3 = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
// BRADFORD is fixed and well-conditioned, so its inverse always exists.
const BRADFORD_INV = invertMat3(BRADFORD) as Mat3;

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] =
        (a[i * 3] ?? 0) * (b[j] ?? 0) + (a[i * 3 + 1] ?? 0) * (b[3 + j] ?? 0) + (a[i * 3 + 2] ?? 0) * (b[6 + j] ?? 0);
    }
  }
  return r;
}

export function invertMat3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det || !Number.isFinite(det)) return null;
  const s = 1 / det;
  return [
    A * s,
    -(b * i - c * h) * s,
    (b * f - c * e) * s,
    B * s,
    (a * i - c * g) * s,
    -(a * f - c * d) * s,
    C * s,
    -(a * h - b * g) * s,
    (a * e - b * d) * s,
  ];
}

function applyMat3(m: Mat3, v: readonly [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** XYZ of a white point given by xy, normalised to Y = 1. */
export function whiteXYZ(x: number, y: number): [number, number, number] {
  return [x / y, 1, (1 - x - y) / y];
}

/** True when the 8 values are finite and describe a non-degenerate gamut. */
export function isValidChromaticities(c: ArrayLike<number> | undefined | null): c is Chromaticities {
  if (!c || c.length < 8) return false;
  for (let i = 0; i < 8; i++) if (!Number.isFinite(c[i])) return false;
  return (c[7] ?? 0) > 0 && rgbToXYZMatrix(c as Chromaticities) !== null;
}

/**
 * RGB→XYZ matrix (row-major) for the given chromaticities: RGB (1, 1, 1) maps
 * to the white point with Y = 1. Uses unnormalised (x, y, 1-x-y) primary
 * columns so primaries with y = 0 (e.g. CIE XYZ "red") stay well defined.
 */
export function rgbToXYZMatrix(c: Chromaticities): Mat3 | null {
  const [rx, ry, gx, gy, bx, by, wx, wy] = c as [number, number, number, number, number, number, number, number];
  if (!wy) return null;
  const P: Mat3 = [rx, gx, bx, ry, gy, by, 1 - rx - ry, 1 - gx - gy, 1 - bx - by];
  const inv = invertMat3(P);
  if (!inv) return null;
  const s = applyMat3(inv, whiteXYZ(wx, wy));
  return [
    P[0] * s[0],
    P[1] * s[1],
    P[2] * s[2],
    P[3] * s[0],
    P[4] * s[1],
    P[5] * s[2],
    P[6] * s[0],
    P[7] * s[1],
    P[8] * s[2],
  ];
}

/** Bradford chromatic adaptation (row-major XYZ→XYZ) between two white points given as XYZ. */
export function bradfordAdaptation(
  srcWhite: readonly [number, number, number],
  dstWhite: readonly [number, number, number],
): Mat3 {
  const src = applyMat3(BRADFORD, srcWhite);
  const dst = applyMat3(BRADFORD, dstWhite);
  const scale: Mat3 = [dst[0] / src[0], 0, 0, 0, dst[1] / src[1], 0, 0, 0, dst[2] / src[2]];
  return multiplyMat3(BRADFORD_INV, multiplyMat3(scale, BRADFORD));
}

const WHITE_EPSILON = 1e-5;

/**
 * Linear RGB in the given primaries → linear BT.709 (D65), row-major.
 * The source white is Bradford-adapted to D65 when it differs.
 */
export function chromaticitiesToBT709Matrix(c: Chromaticities): Mat3 | null {
  const toXYZ = rgbToXYZMatrix(c);
  const bt709ToXYZ = rgbToXYZMatrix(CHROMATICITIES.bt709);
  if (!toXYZ || !bt709ToXYZ) return null;
  const fromXYZ = invertMat3(bt709ToXYZ);
  if (!fromXYZ) return null;
  const wx = c[6] ?? 0;
  const wy = c[7] ?? 0;
  let m = toXYZ;
  if (Math.abs(wx - D65_XY[0]) > WHITE_EPSILON || Math.abs(wy - D65_XY[1]) > WHITE_EPSILON) {
    m = multiplyMat3(bradfordAdaptation(whiteXYZ(wx, wy), whiteXYZ(D65_XY[0], D65_XY[1])), m);
  }
  return multiplyMat3(fromXYZ, m);
}

/** Row-major → column-major Float32Array, the layout GLSL `mat3` uniforms use. */
export function toColumnMajor(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

/** True when the matrix is the identity within `tolerance`. */
export function isIdentityMat3(m: ArrayLike<number>, tolerance = 1e-4): boolean {
  for (let i = 0; i < 9; i++) {
    if (Math.abs((m[i] ?? 0) - (i % 4 === 0 ? 1 : 0)) > tolerance) return false;
  }
  return true;
}

/** Name of the reference chromaticities matching `c` within `tolerance`, if any. */
export function identifyChromaticities(c: ArrayLike<number>, tolerance = 0.005): KnownChromaticitiesName | undefined {
  if (c.length < 8) return undefined;
  for (const name of Object.keys(CHROMATICITIES) as KnownChromaticitiesName[]) {
    const ref = CHROMATICITIES[name];
    let match = true;
    for (let i = 0; i < 8; i++) {
      if (Math.abs((c[i] ?? NaN) - (ref[i] ?? NaN)) > tolerance) {
        match = false;
        break;
      }
    }
    if (match) return name;
  }
  return undefined;
}

/**
 * Named `ColorPrimaries` for chromaticities the renderer has a fast path for
 * (BT.709, BT.2020, Display P3); undefined for anything else, which callers
 * pass on as raw chromaticities.
 */
export function namedPrimariesForChromaticities(c: ArrayLike<number>, tolerance = 0.005): ColorPrimaries | undefined {
  const name = identifyChromaticities(c, tolerance);
  return name === 'bt709' || name === 'bt2020' || name === 'p3' ? name : undefined;
}

// Cache of shader matrices keyed by chromaticities so repeated per-frame calls
// return the same Float32Array (callers detect changes by reference).
const shaderMatrixCache = new Map<string, Float32Array | null>();
const SHADER_MATRIX_CACHE_LIMIT = 32;

/**
 * Column-major shader matrix for chromaticities → BT.709 (D65), cached.
 * Returns null for degenerate input.
 */
export function getChromaticitiesShaderMatrix(c: Chromaticities): Float32Array | null {
  const key = Array.from(c.slice(0, 8), (v) => v.toFixed(6)).join(',');
  const cached = shaderMatrixCache.get(key);
  if (cached !== undefined) return cached;
  const m = isValidChromaticities(c) ? chromaticitiesToBT709Matrix(c) : null;
  const result = m && m.every(Number.isFinite) ? toColumnMajor(m) : null;
  if (shaderMatrixCache.size >= SHADER_MATRIX_CACHE_LIMIT) shaderMatrixCache.clear();
  shaderMatrixCache.set(key, result);
  return result;
}

/**
 * Chromaticities of an ICC matrix/TRC profile's colorants. ICC rXYZ/gXYZ/bXYZ
 * are relative to the D50 PCS; the profile's own white is recovered from the
 * 'chad' tag when present (v4 / v2 with chad) and otherwise assumed D65, which
 * is what sRGB-family display profiles use.
 */
export function chromaticitiesFromICCMatrix(
  rgbToXYZD50: readonly number[],
  chad?: readonly number[] | null,
): Chromaticities | null {
  if (rgbToXYZD50.length < 9) return null;
  let m = rgbToXYZD50.slice(0, 9) as Mat3;
  const d50 = whiteXYZ(0.3457, 0.3585);
  if (chad && chad.length >= 9) {
    const inv = invertMat3(chad.slice(0, 9) as Mat3);
    if (!inv) return null;
    m = multiplyMat3(inv, m);
  } else {
    m = multiplyMat3(bradfordAdaptation(d50, whiteXYZ(D65_XY[0], D65_XY[1])), m);
  }
  const xy = (X: number, Y: number, Z: number): [number, number] => {
    const s = X + Y + Z;
    return s ? [X / s, Y / s] : [0, 0];
  };
  const r = xy(m[0], m[3], m[6]);
  const g = xy(m[1], m[4], m[7]);
  const b = xy(m[2], m[5], m[8]);
  const w = xy(m[0] + m[1] + m[2], m[3] + m[4] + m[5], m[6] + m[7] + m[8]);
  return [r[0], r[1], g[0], g[1], b[0], b[1], w[0], w[1]];
}

/**
 * Image metadata for source chromaticities: a named `colorPrimaries` when the
 * renderer has a fast path for them, raw `chromaticities` otherwise. BT.709
 * (the working space) and invalid input produce no tag.
 */
export function primariesMetadataFromChromaticities(c: ArrayLike<number> | undefined | null): {
  colorPrimaries?: ColorPrimaries;
  chromaticities?: number[];
} {
  if (!isValidChromaticities(c)) return {};
  const named = namedPrimariesForChromaticities(c);
  if (named) return named === 'bt709' ? {} : { colorPrimaries: named };
  return { chromaticities: Array.from(c.slice(0, 8)) };
}
