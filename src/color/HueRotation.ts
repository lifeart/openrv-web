/**
 * Luminance-preserving hue rotation matrix construction.
 *
 * This module re-exports the canonical hue rotation caching and identity
 * functions from effectProcessing.shared.ts (the single source of truth,
 * designed for worker import) and adds a CPU pixel-application helper.
 *
 * It also keeps a local `buildHueRotationMatrixMul` that uses an explicit
 * matrix-multiplication approach (used by tests to cross-validate).
 *
 * Properties of the hue rotation matrix:
 * - Each row sums to 1 (grays are invariant)
 * - Luminance L = 0.2126*R + 0.7152*G + 0.0722*B is preserved
 * - At 0/360 degrees, the matrix is the identity
 */

// Re-export canonical implementations from the shared module (single source of truth)
export {
  buildHueRotationMatrix,
  getHueRotationMatrix,
  clearHueRotationCache,
  isIdentityHueRotation,
} from '../utils/effectProcessing.shared';

import { getHueRotationMatrix } from '../utils/effectProcessing.shared';

// ============================================================================
// Alternative matrix builder (matrix-multiplication approach)
// Kept for cross-validation in tests; not used at runtime.
// ============================================================================

/** Rec. 709 luminance weights */
const Wr = 0.2126;
const Wg = 0.7152;
const Wb = 0.0722;

type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Multiply two 3x3 matrices (row-major) */
function mul3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0]*b[0] + a[1]*b[3] + a[2]*b[6], a[0]*b[1] + a[1]*b[4] + a[2]*b[7], a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
    a[3]*b[0] + a[4]*b[3] + a[5]*b[6], a[3]*b[1] + a[4]*b[4] + a[5]*b[7], a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
    a[6]*b[0] + a[7]*b[3] + a[8]*b[6], a[6]*b[1] + a[7]*b[4] + a[8]*b[7], a[6]*b[2] + a[7]*b[5] + a[8]*b[8],
  ];
}

/**
 * Build a 3x3 luminance-preserving hue rotation matrix using explicit
 * matrix multiplication (alternative algorithm for cross-validation).
 *
 * NOTE: The canonical builder used at runtime is `buildHueRotationMatrix`
 * from effectProcessing.shared.ts.
 *
 * @param degrees - Hue rotation in degrees
 * @returns A 9-element Float32Array in column-major order (for WebGL mat3)
 */
export function buildHueRotationMatrixMul(degrees: number): Float32Array {
  const rad = (degrees * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const sq3 = Math.sqrt(3);
  const oo = 1 / 3;
  const c = cosA;
  const s = sinA;
  const t = 1 - cosA;

  const rot: Mat3 = [
    c + t * oo,                t * oo - s / sq3,          t * oo + s / sq3,
    t * oo + s / sq3,          c + t * oo,                t * oo - s / sq3,
    t * oo - s / sq3,          t * oo + s / sq3,          c + t * oo,
  ];

  const dR = Wr - 1 / 3;
  const dG = Wg - 1 / 3;
  const dB = Wb - 1 / 3;

  const T: Mat3 = [
    1 + dR, dG,     dB,
    dR,     1 + dG, dB,
    dR,     dG,     1 + dB,
  ];

  const TInv: Mat3 = [
    1 - dR, -dG,    -dB,
    -dR,    1 - dG, -dB,
    -dR,    -dG,    1 - dB,
  ];

  const M = mul3(mul3(TInv, rot), T);

  // Convert to column-major for WebGL
  return new Float32Array([
    M[0], M[3], M[6],  // Column 0
    M[1], M[4], M[7],  // Column 1
    M[2], M[5], M[8],  // Column 2
  ]);
}

/**
 * Apply hue rotation to an RGB pixel (CPU path).
 *
 * Uses the canonical cached matrix from effectProcessing.shared.ts.
 *
 * @param r - Red channel [0, 1]
 * @param g - Green channel [0, 1]
 * @param b - Blue channel [0, 1]
 * @param degrees - Hue rotation in degrees
 * @returns [r, g, b] rotated pixel values, clamped to [0, 1]
 */
export function applyHueRotation(
  r: number, g: number, b: number, degrees: number
): [number, number, number] {
  const mat = getHueRotationMatrix(degrees);
  // mat is column-major: mat[0]=m00, mat[1]=m10, mat[2]=m20, etc.
  const outR = mat[0]! * r + mat[3]! * g + mat[6]! * b;
  const outG = mat[1]! * r + mat[4]! * g + mat[7]! * b;
  const outB = mat[2]! * r + mat[5]! * g + mat[8]! * b;
  return [
    Math.max(0, Math.min(1, outR)),
    Math.max(0, Math.min(1, outG)),
    Math.max(0, Math.min(1, outB)),
  ];
}
