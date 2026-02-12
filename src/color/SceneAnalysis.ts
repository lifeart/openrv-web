/**
 * SceneAnalysis - Pure math utilities for HDR scene analysis.
 *
 * Provides scene key estimation and exposure computation based on
 * scene luminance statistics. Used by AutoExposureController and
 * LuminanceAnalyzer.
 *
 * Reference: Reinhard et al., "Photographic Tone Reproduction for Digital Images"
 */

const MIN_LUMINANCE = 1e-6;
const MAX_LUMINANCE = 1e6;

/**
 * Clamp a luminance value to a safe range, handling NaN and Infinity.
 * Returns MIN_LUMINANCE for any non-finite or non-positive input.
 */
export function clampLuminance(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MIN_LUMINANCE;
  return Math.min(Math.max(value, MIN_LUMINANCE), MAX_LUMINANCE);
}

/**
 * Estimate the scene key (mid-gray target) from average log-luminance.
 *
 * Uses the Reinhard key estimation formula:
 *   key = 1.03 - 2 / (2 + log10(avgLuminance + 1))
 *
 * Bright scenes → higher key (closer to 1.0)
 * Dark scenes → lower key (closer to 0.18)
 *
 * @param avgLogLuminance - Average log-luminance (exp of mean log(L))
 * @returns Scene key value, typically in [0.09, 0.90]
 */
export function estimateSceneKey(avgLogLuminance: number): number {
  const avg = clampLuminance(avgLogLuminance);
  return 1.03 - 2.0 / (2.0 + Math.log10(avg + 1));
}

/**
 * Compute exposure (in stops) needed to map scene average luminance
 * to a target key value.
 *
 * @param avgLuminance - Scene average luminance
 * @param targetKey - Target key value (default 0.18 = photographic mid-gray)
 * @returns Exposure value in stops (log2 scale)
 */
export function computeExposureFromKey(avgLuminance: number, targetKey = 0.18): number {
  const avg = clampLuminance(avgLuminance);
  return Math.log2(targetKey / avg);
}

/**
 * Compute scene luminance statistics from pixel data (CPU path).
 *
 * Downsamples to a 16x16 grid (256 samples) for performance.
 * Used by PrerenderBufferManager workers that have no GL context.
 *
 * @param data - RGBA pixel data (Uint8ClampedArray, sRGB-encoded)
 * @param width - Image width
 * @param height - Image height
 * @returns Average log-luminance (exp of mean log(L)) and max luminance
 */
export function computeSceneLuminance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { avgLogLuminance: number; maxLuminance: number } {
  const GRID = 16;
  const stepX = Math.max(1, Math.floor(width / GRID));
  const stepY = Math.max(1, Math.floor(height / GRID));

  let sumLogLuminance = 0;
  let maxLuminance = 0;
  let sampleCount = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      // sRGB to linear approximation (gamma 2.2)
      const rLin = Math.pow((data[i]! / 255), 2.2);
      const gLin = Math.pow((data[i + 1]! / 255), 2.2);
      const bLin = Math.pow((data[i + 2]! / 255), 2.2);

      const luminance = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
      sumLogLuminance += Math.log(luminance + MIN_LUMINANCE);
      maxLuminance = Math.max(maxLuminance, luminance);
      sampleCount++;
    }
  }

  if (sampleCount === 0) {
    return { avgLogLuminance: MIN_LUMINANCE, maxLuminance: MIN_LUMINANCE };
  }

  const avgLogLum = Math.exp(sumLogLuminance / sampleCount);
  return {
    avgLogLuminance: clampLuminance(avgLogLum),
    maxLuminance: clampLuminance(maxLuminance),
  };
}
