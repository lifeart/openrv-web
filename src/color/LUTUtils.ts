/**
 * LUT Utility Functions
 * Shared utilities for LUT format parsers
 */

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
