/**
 * Pixel comparison utilities for A/B rendering verification.
 *
 * Used to compare pixel output between the monolithic shader and the
 * multi-pass pipeline. All functions operate on flat Float32Array or
 * Uint8Array pixel buffers (RGBA layout).
 */

/**
 * Compute Root Mean Square Error between two pixel buffers.
 * Both arrays must have the same length.
 *
 * @param a First pixel buffer
 * @param b Second pixel buffer
 * @returns RMSE value (0 = identical)
 */
export function computeRMSE(a: Float32Array | Uint8Array, b: Float32Array | Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error(`Buffer length mismatch: ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return 0;

  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares / a.length);
}

/**
 * Compute Peak Signal-to-Noise Ratio from RMSE.
 * Returns Infinity when RMSE === 0 (identical buffers).
 *
 * @param rmse Root Mean Square Error
 * @param maxValue Maximum signal value (1.0 for float, 255 for uint8)
 * @returns PSNR in decibels
 */
export function computePSNR(rmse: number, maxValue: number = 1.0): number {
  if (rmse === 0) return Infinity;
  return 20 * Math.log10(maxValue / rmse);
}

/**
 * Assert that two pixel buffers are within tolerance.
 * Throws with detailed diagnostics (max channel error, error location) on failure.
 *
 * @param actual Actual pixel buffer
 * @param expected Expected pixel buffer
 * @param thresholdRMSE Maximum allowed RMSE
 */
export function assertPixelParity(
  actual: Float32Array | Uint8Array,
  expected: Float32Array | Uint8Array,
  thresholdRMSE: number,
): void {
  if (actual.length !== expected.length) {
    throw new Error(`Buffer length mismatch: actual=${actual.length}, expected=${expected.length}`);
  }

  const rmse = computeRMSE(actual, expected);

  if (Number.isNaN(rmse) || rmse > thresholdRMSE) {
    // Find the location and magnitude of the max error for diagnostics
    let maxError = 0;
    let maxErrorIndex = 0;
    for (let i = 0; i < actual.length; i++) {
      const err = Math.abs(actual[i]! - expected[i]!);
      if (err > maxError) {
        maxError = err;
        maxErrorIndex = i;
      }
    }

    const pixelIndex = Math.floor(maxErrorIndex / 4);
    const channel = ['R', 'G', 'B', 'A'][maxErrorIndex % 4];

    throw new Error(
      `Pixel parity failed: RMSE=${rmse.toFixed(6)} exceeds threshold=${thresholdRMSE}. ` +
      `Max error: ${maxError.toFixed(6)} at pixel ${pixelIndex} channel ${channel} ` +
      `(actual=${actual[maxErrorIndex]}, expected=${expected[maxErrorIndex]})`
    );
  }
}
