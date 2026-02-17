/**
 * LUT Utility Functions
 * Shared utilities for LUT format parsers and matrix operations
 */

/** Identity 4x4 matrix in row-major flat layout */
export const IDENTITY_MATRIX_4X4 = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

/**
 * Check if a 4x4 matrix (flat[16]) is the identity matrix.
 */
export function isIdentityMatrix(m: Float32Array): boolean {
  for (let i = 0; i < 16; i++) {
    const expected = (i % 5 === 0) ? 1 : 0;
    if (m[i] !== expected) return false;
  }
  return true;
}

/**
 * Sanitize a LUT matrix: validate it is a 16-element array with all finite values.
 * If any entry is NaN or Infinity, the entire matrix is replaced with identity.
 * Returns null if the input is null/undefined or is an identity matrix (for optimization).
 *
 * Accepts either a flat number[], a nested number[][] (row-major 4x4), or Float32Array.
 */
export function sanitizeLUTMatrix(
  matrix: Float32Array | number[] | number[][] | null | undefined,
): Float32Array | null {
  if (matrix == null) return null;

  let flat: Float32Array;

  // Handle nested array (e.g., [[1,0,0,0],[0,1,0,0],...])
  if (Array.isArray(matrix) && matrix.length > 0 && Array.isArray(matrix[0])) {
    const nested = matrix as number[][];
    const arr = new Float32Array(16);
    let idx = 0;
    for (const row of nested) {
      for (const val of row) {
        if (idx < 16) arr[idx++] = val;
      }
    }
    flat = arr;
  } else if (matrix instanceof Float32Array) {
    if (matrix.length !== 16) return null;
    flat = matrix;
  } else if (Array.isArray(matrix)) {
    if (matrix.length !== 16) return null;
    flat = new Float32Array(matrix as number[]);
  } else {
    return null;
  }

  // Check for NaN/Infinity — sanitize to identity if found
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(flat[i])) {
      return new Float32Array(IDENTITY_MATRIX_4X4);
    }
  }

  // Return null if identity (no-op optimization)
  if (isIdentityMatrix(flat)) return null;

  return flat;
}

/**
 * Apply a 4x4 row-major matrix to an RGB color using homogeneous coordinates.
 * [r', g', b', w'] = [r, g, b, 1] * M
 * Returns [r'/w', g'/w', b'/w'] (perspective divide, though typically w'=1).
 *
 * GTO convention: row vector * matrix (post-multiply), row-major storage.
 */
export function applyColorMatrix(
  r: number, g: number, b: number,
  m: Float32Array,
): [number, number, number] {
  // Row vector [r, g, b, 1] * row-major M
  // result[j] = r*M[0*4+j] + g*M[1*4+j] + b*M[2*4+j] + 1*M[3*4+j]
  const outR = r * m[0]! + g * m[4]! + b * m[8]!  + m[12]!;
  const outG = r * m[1]! + g * m[5]! + b * m[9]!  + m[13]!;
  const outB = r * m[2]! + g * m[6]! + b * m[10]! + m[14]!;
  return [outR, outG, outB];
}

/**
 * Reorder 3D LUT data from R-fastest to B-fastest order.
 *
 * Many formats (3dl, csp, itx, look, nk, mga) store data with R varying fastest:
 *   for b in [0..N): for g in [0..N): for r in [0..N): data[b][g][r]
 *
 * The internal representation (matching .cube convention) uses B varying fastest:
 *   for r in [0..N): for g in [0..N): for b in [0..N): data[r][g][b]
 */
export function reorderRFastestToBFastest(data: Float32Array, size: number): Float32Array {
  const result = new Float32Array(data.length);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const srcIdx = (b * size * size + g * size + r) * 3;
        const dstIdx = (r * size * size + g * size + b) * 3;
        result[dstIdx] = data[srcIdx]!;
        result[dstIdx + 1] = data[srcIdx + 1]!;
        result[dstIdx + 2] = data[srcIdx + 2]!;
      }
    }
  }
  return result;
}

/**
 * Normalize an array of integer values to the 0.0-1.0 range
 * by dividing by maxValue.
 */
export function normalizeIntegers(data: Float32Array, maxValue: number): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i]! / maxValue;
  }
  return result;
}
