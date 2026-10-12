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

// ---------------------------------------------------------------------------
// Render Pipeline — LUT & Channel Sizes
// ---------------------------------------------------------------------------

/** LUT texture width (number of entries in 1D LUT) */
export const LUT_1D_SIZE = 256;

/** Number of RGBA channels */
export const RGBA_CHANNELS = 4;

/** Number of RGB channels */
export const RGB_CHANNELS = 3;

// ---------------------------------------------------------------------------
// Render Pipeline — Input Transfer Function Shader Codes
// ---------------------------------------------------------------------------

/** sRGB / linear input (default) */
export const INPUT_TRANSFER_SRGB = 0;

/** HLG (Hybrid Log-Gamma) input */
export const INPUT_TRANSFER_HLG = 1;

/** PQ (Perceptual Quantizer) input */
export const INPUT_TRANSFER_PQ = 2;

/** Cineon log input (RVLinearize logtype=1 or 2) */
export const INPUT_TRANSFER_CINEON = 3;

/** ARRI LogC3 input (RVLinearize logtype=3) */
export const INPUT_TRANSFER_LOGC3 = 4;

/** sRGB-to-linear EOTF (RVLinearize sRGB2linear=1) */
export const INPUT_TRANSFER_SRGB_TO_LINEAR = 5;

/** Rec.709-to-linear EOTF (RVLinearize Rec709ToLinear=1) */
export const INPUT_TRANSFER_REC709_TO_LINEAR = 6;

/** SMPTE 240M input (early HDTV standard) */
export const INPUT_TRANSFER_SMPTE240M = 7;

// ---------------------------------------------------------------------------
// Render Pipeline — Output Mode Shader Codes
// ---------------------------------------------------------------------------

/** SDR output: clamp to [0,1] */
export const OUTPUT_MODE_SDR = 0;

/** HDR output: allow values > 1.0 */
export const OUTPUT_MODE_HDR = 1;

// ---------------------------------------------------------------------------
// Render Pipeline — Output Encoding Shader Codes (u_outputEncoding)
//
// One contract for every surface the viewer shader writes to. Linear working
// values use 1.0 = HDR reference white (203 cd/m², ITU-R BT.2408).
// ---------------------------------------------------------------------------

/** SDR: apply the user's display transfer (u_displayTransfer) */
export const OUTPUT_ENCODING_DISPLAY = 0;

/** Linear light, for 'srgb-linear' canvases and float readbacks that stay linear */
export const OUTPUT_ENCODING_LINEAR = 1;

/** Extended-range sRGB encoding, for float16 'srgb' / 'display-p3' canvases in extended mode */
export const OUTPUT_ENCODING_EXTENDED_SRGB = 2;

/** SMPTE ST 2084 (PQ), for 'rec2100-pq' surfaces */
export const OUTPUT_ENCODING_PQ = 3;

/** BT.2100 HLG, for 'rec2100-hlg' surfaces */
export const OUTPUT_ENCODING_HLG = 4;

export type OutputEncodingCode =
  | typeof OUTPUT_ENCODING_DISPLAY
  | typeof OUTPUT_ENCODING_LINEAR
  | typeof OUTPUT_ENCODING_EXTENDED_SRGB
  | typeof OUTPUT_ENCODING_PQ
  | typeof OUTPUT_ENCODING_HLG;

/** Output encoding the shader must produce for a WebGL drawing-buffer HDR mode. */
export function outputEncodingForHDRMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended'): OutputEncodingCode {
  switch (mode) {
    case 'hlg':
      return OUTPUT_ENCODING_HLG;
    case 'pq':
      return OUTPUT_ENCODING_PQ;
    case 'extended':
      return OUTPUT_ENCODING_EXTENDED_SRGB;
    default:
      return OUTPUT_ENCODING_DISPLAY;
  }
}

/** Output encoding the shader must produce for a canvas of the given color space. */
export function outputEncodingForCanvasColorSpace(colorSpace: string): OutputEncodingCode {
  switch (colorSpace) {
    case 'srgb-linear':
    case 'rec2100-linear':
      return OUTPUT_ENCODING_LINEAR;
    case 'rec2100-hlg':
      return OUTPUT_ENCODING_HLG;
    case 'rec2100-pq':
      return OUTPUT_ENCODING_PQ;
    default:
      // 'srgb' and 'display-p3' carry the sRGB transfer curve, extended above 1.0
      // on float16 canvases.
      return OUTPUT_ENCODING_EXTENDED_SRGB;
  }
}

// ---------------------------------------------------------------------------
// Render Pipeline — Display Transfer Function Shader Codes
// ---------------------------------------------------------------------------

/** Linear (no transfer function) */
export const DISPLAY_TRANSFER_LINEAR = 0;

/** sRGB transfer function */
export const DISPLAY_TRANSFER_SRGB = 1;

// ---------------------------------------------------------------------------
// Interaction Quality Tiering
// ---------------------------------------------------------------------------

/** Quality factor during active interactions (zoom, scrub). 1.0 = full, 0.5 = half resolution. */
export const INTERACTION_QUALITY_FACTOR = 0.5;

/** Debounce delay (ms) before restoring full quality after interaction ends. */
export const INTERACTION_DEBOUNCE_MS = 200;
