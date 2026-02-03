/**
 * Log-Linear Conversion Utilities
 *
 * Shared log-to-linear conversion functions for DPX and Cineon formats.
 * These formats store pixel data in logarithmic (printing density) space,
 * and need to be converted to linear light for compositing and display.
 */

export interface LogLinearOptions {
  /** Reference white code value (default: 685) */
  refWhite?: number;
  /** Reference black code value (default: 95) */
  refBlack?: number;
  /** Film gamma (default: 0.6) */
  filmGamma?: number;
  /** Soft clip value (default: 0) */
  softClip?: number;
}

const DEFAULT_REF_WHITE = 685;
const DEFAULT_REF_BLACK = 95;
const DEFAULT_FILM_GAMMA = 0.6;
const DENSITY_PER_CODE_VALUE = 0.002;

/**
 * Convert a Cineon/DPX log code value to linear light.
 *
 * The standard Cineon log-to-linear conversion:
 *   1. density = codeValue * 0.002 (each code value = 0.002 density units)
 *   2. relativeLogExposure = density / negativeGamma - (refWhite * 0.002 / negativeGamma)
 *   3. linear = pow(10, relativeLogExposure)
 *
 * This maps refWhite (685) to exactly 1.0 and refBlack (95) to near 0.
 *
 * Edge cases:
 *   - Code values at or below refBlack return 0 (avoids negative/tiny results)
 *   - Non-finite results are clamped to 0
 */
function logToLinear(codeValue: number, options?: LogLinearOptions): number {
  const refWhite = options?.refWhite ?? DEFAULT_REF_WHITE;
  const refBlack = options?.refBlack ?? DEFAULT_REF_BLACK;
  const filmGamma = options?.filmGamma ?? DEFAULT_FILM_GAMMA;

  // Clamp code values at or below refBlack to zero
  if (codeValue <= refBlack) {
    return 0;
  }

  if (filmGamma <= 0) {
    return 0;
  }

  // Standard Cineon log-to-linear conversion:
  // density = codeValue * densityPerCodeValue
  // relativeLogExposure = density / filmGamma - refWhiteOffset
  // where refWhiteOffset = refWhite * densityPerCodeValue / filmGamma
  const density = codeValue * DENSITY_PER_CODE_VALUE;
  const refWhiteOffset = refWhite * DENSITY_PER_CODE_VALUE / filmGamma;
  const relativeLogExposure = density / filmGamma - refWhiteOffset;
  const linear = Math.pow(10, relativeLogExposure);

  // Ensure result is finite
  if (!isFinite(linear)) {
    return 0;
  }

  return linear;
}

/**
 * Convert a Cineon log code value to linear light.
 * Uses the standard Cineon log-to-linear conversion formula.
 */
export function cineonLogToLinear(codeValue: number, options?: LogLinearOptions): number {
  return logToLinear(codeValue, options);
}

/**
 * Convert a DPX log code value to linear light.
 * Uses the same formula as Cineon (both follow the same density encoding).
 */
export function dpxLogToLinear(codeValue: number, options?: LogLinearOptions): number {
  return logToLinear(codeValue, options);
}
