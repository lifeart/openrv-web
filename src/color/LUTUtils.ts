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

/**
 * Sample a 1D LUT channel with linear interpolation.
 *
 * @param channelData - Float32Array of interleaved RGB values
 * @param channelOffset - 0=R, 1=G, 2=B
 * @param t - normalized input in [0, 1]
 * @param lutSize - number of entries in the 1D LUT
 */
function sampleLUT1DChannel(
  channelData: Float32Array,
  channelOffset: number,
  t: number,
  lutSize: number,
): number {
  const clamped = Math.max(0, Math.min(1, t));
  const maxIdx = lutSize - 1;
  const idx = clamped * maxIdx;
  const idx0 = Math.floor(idx);
  const idx1 = Math.min(idx0 + 1, maxIdx);
  const frac = idx - idx0;
  const val0 = channelData[idx0 * 3 + channelOffset]!;
  const val1 = channelData[idx1 * 3 + channelOffset]!;
  return val0 + (val1 - val0) * frac;
}

/**
 * Bake a 1D LUT into a 3D LUT.
 *
 * When a 1D LUT is assigned to a GPU slot (File, Look, or Display), this
 * function converts it to a 3D LUT by applying the 1D transform along each
 * axis independently. This matches how Resolve, Nuke, and OCIO handle mixed
 * LUT types internally.
 *
 * @param lut1DData - Interleaved RGB Float32Array (R0,G0,B0,R1,G1,B1,...)
 * @param lut1DSize - Number of entries in the 1D LUT
 * @param domainMin - 1D LUT domain minimum per channel
 * @param domainMax - 1D LUT domain maximum per channel
 * @param outputSize - 3D LUT cube dimension (default 33)
 * @returns Object with data (Float32Array), size, domainMin, domainMax for the 3D LUT
 */
export function bake1DTo3D(
  lut1DData: Float32Array,
  lut1DSize: number,
  domainMin: [number, number, number] = [0, 0, 0],
  domainMax: [number, number, number] = [1, 1, 1],
  outputSize: number = 33,
): { data: Float32Array; size: number; domainMin: [number, number, number]; domainMax: [number, number, number] } {
  const data = new Float32Array(outputSize * outputSize * outputSize * 3);
  for (let b = 0; b < outputSize; b++) {
    for (let g = 0; g < outputSize; g++) {
      for (let r = 0; r < outputSize; r++) {
        const idx = (r * outputSize * outputSize + g * outputSize + b) * 3;
        // Normalize to [0, 1] in the 3D LUT's domain
        const rNorm = r / (outputSize - 1);
        const gNorm = g / (outputSize - 1);
        const bNorm = b / (outputSize - 1);
        // Map from [0,1] to the 1D LUT's domain for sampling
        const rInput = domainMin[0] + rNorm * (domainMax[0] - domainMin[0]);
        const gInput = domainMin[1] + gNorm * (domainMax[1] - domainMin[1]);
        const bInput = domainMin[2] + bNorm * (domainMax[2] - domainMin[2]);
        // Normalize to [0,1] for LUT sampling
        const rT = (domainMax[0] - domainMin[0]) !== 0 ? (rInput - domainMin[0]) / (domainMax[0] - domainMin[0]) : 0;
        const gT = (domainMax[1] - domainMin[1]) !== 0 ? (gInput - domainMin[1]) / (domainMax[1] - domainMin[1]) : 0;
        const bT = (domainMax[2] - domainMin[2]) !== 0 ? (bInput - domainMin[2]) / (domainMax[2] - domainMin[2]) : 0;
        data[idx + 0] = sampleLUT1DChannel(lut1DData, 0, rT, lut1DSize);
        data[idx + 1] = sampleLUT1DChannel(lut1DData, 1, gT, lut1DSize);
        data[idx + 2] = sampleLUT1DChannel(lut1DData, 2, bT, lut1DSize);
      }
    }
  }
  return { data, size: outputSize, domainMin: [...domainMin], domainMax: [...domainMax] };
}
