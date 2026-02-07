/**
 * Centralized rendering and color-processing constants.
 *
 * Luminance coefficients, effect-processing parameters, and color-wheel
 * factors used by the renderer, effect processor, and channel views.
 *
 * NOTE: These constants are also re-exported by
 * `src/utils/effectProcessing.shared.ts` so that the Web Worker can
 * import them through a single self-contained module.
 */

// ---------------------------------------------------------------------------
// Rec. 709 Luminance Coefficients
// ---------------------------------------------------------------------------

/** Rec. 709 red luminance coefficient */
export const LUMA_R = 0.2126;

/** Rec. 709 green luminance coefficient */
export const LUMA_G = 0.7152;

/** Rec. 709 blue luminance coefficient */
export const LUMA_B = 0.0722;

/**
 * Rec. 709 luminance coefficients as a named object.
 * Convenient when a single import is preferred over three separate values.
 */
export const LUMINANCE_COEFFICIENTS = {
  r: LUMA_R,
  g: LUMA_G,
  b: LUMA_B,
} as const;

// ---------------------------------------------------------------------------
// Effect Processing — Tonal Ranges
// ---------------------------------------------------------------------------

/** Maximum adjustment range for highlights/shadows (pixel values 0-255) */
export const HIGHLIGHT_SHADOW_RANGE = 128;

/** Maximum adjustment range for whites/blacks clipping (pixel values 0-255) */
export const WHITES_BLACKS_RANGE = 55;

// ---------------------------------------------------------------------------
// Effect Processing — Clarity & Skin Protection
// ---------------------------------------------------------------------------

/** Clarity effect intensity scale factor */
export const CLARITY_EFFECT_SCALE = 0.7;

/** Skin tone hue center (degrees) for vibrance protection */
export const SKIN_TONE_HUE_CENTER = 35;

/** Skin tone hue range (degrees from center) for vibrance protection */
export const SKIN_TONE_HUE_RANGE = 15;

/** Minimum skin protection factor (0-1) */
export const SKIN_PROTECTION_MIN = 0.3;

// ---------------------------------------------------------------------------
// Effect Processing — Color Wheel Factors
// ---------------------------------------------------------------------------

/** Color wheel master adjustment factor */
export const COLOR_WHEEL_MASTER_FACTOR = 0.5;

/** Color wheel lift (shadows) adjustment factor */
export const COLOR_WHEEL_LIFT_FACTOR = 0.3;

/** Color wheel gamma (midtones) adjustment factor */
export const COLOR_WHEEL_GAMMA_FACTOR = 0.5;

/** Color wheel gain (highlights) adjustment factor */
export const COLOR_WHEEL_GAIN_FACTOR = 0.5;

// ---------------------------------------------------------------------------
// Half-Resolution Processing
// ---------------------------------------------------------------------------

/** Minimum image dimension (px) required to apply half-resolution optimization */
export const HALF_RES_MIN_DIMENSION = 256;
