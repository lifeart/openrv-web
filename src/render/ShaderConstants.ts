/**
 * Shader constants — dirty flags, operator codes, color primaries matrices,
 * and background pattern codes used by ShaderStateManager and related modules.
 */

import type { ToneMappingOperator, GamutIdentifier } from '../core/types/effects';
import type { ChannelMode } from '../core/types/color';

// ---------------------------------------------------------------------------
// Dirty flag constants
// ---------------------------------------------------------------------------

export const DIRTY_COLOR = 'color';
export const DIRTY_TONE_MAPPING = 'toneMapping';
export const DIRTY_CDL = 'cdl';
export const DIRTY_COLOR_WHEELS = 'colorWheels';
export const DIRTY_HSL = 'hsl';
export const DIRTY_ZEBRA = 'zebra';
export const DIRTY_CHANNELS = 'channels';
export const DIRTY_BACKGROUND = 'background';
export const DIRTY_DISPLAY = 'display';
export const DIRTY_CLARITY = 'clarity';
export const DIRTY_SHARPEN = 'sharpen';
export const DIRTY_FALSE_COLOR = 'falseColor';
export const DIRTY_CURVES = 'curves';
export const DIRTY_VIBRANCE = 'vibrance';
export const DIRTY_HIGHLIGHTS_SHADOWS = 'highlightsShadows';
export const DIRTY_INVERSION = 'inversion';
export const DIRTY_LUT3D = 'lut3d';
export const DIRTY_GAMUT_MAPPING = 'gamutMapping';
export const DIRTY_DEINTERLACE = 'deinterlace';
export const DIRTY_FILM_EMULATION = 'filmEmulation';
export const DIRTY_PERSPECTIVE = 'perspective';
export const DIRTY_LINEARIZE = 'linearize';
export const DIRTY_INLINE_LUT = 'inlineLUT';
export const DIRTY_OUT_OF_RANGE = 'outOfRange';
export const DIRTY_CHANNEL_SWIZZLE = 'channelSwizzle';
export const DIRTY_PREMULT = 'premult';
export const DIRTY_DITHER = 'dither';
export const DIRTY_SPHERICAL = 'spherical';
export const DIRTY_COLOR_PRIMARIES = 'colorPrimaries';
export const DIRTY_CONTOUR = 'contour';
export const DIRTY_FILE_LUT3D = 'fileLut3d';
export const DIRTY_DISPLAY_LUT3D = 'displayLut3d';

/** All dirty flag names -- used to initialize on first render so all uniforms are set. */
export const ALL_DIRTY_FLAGS = [
  DIRTY_COLOR,
  DIRTY_TONE_MAPPING,
  DIRTY_CDL,
  DIRTY_COLOR_WHEELS,
  DIRTY_HSL,
  DIRTY_ZEBRA,
  DIRTY_CHANNELS,
  DIRTY_BACKGROUND,
  DIRTY_DISPLAY,
  DIRTY_CLARITY,
  DIRTY_SHARPEN,
  DIRTY_FALSE_COLOR,
  DIRTY_CURVES,
  DIRTY_VIBRANCE,
  DIRTY_HIGHLIGHTS_SHADOWS,
  DIRTY_INVERSION,
  DIRTY_LUT3D,
  DIRTY_GAMUT_MAPPING,
  DIRTY_DEINTERLACE,
  DIRTY_FILM_EMULATION,
  DIRTY_PERSPECTIVE,
  DIRTY_LINEARIZE,
  DIRTY_INLINE_LUT,
  DIRTY_OUT_OF_RANGE,
  DIRTY_CHANNEL_SWIZZLE,
  DIRTY_PREMULT,
  DIRTY_DITHER,
  DIRTY_SPHERICAL,
  DIRTY_COLOR_PRIMARIES,
  DIRTY_CONTOUR,
  DIRTY_FILE_LUT3D,
  DIRTY_DISPLAY_LUT3D,
] as const;

// ---------------------------------------------------------------------------
// Shader constant codes
// ---------------------------------------------------------------------------

/** Tone mapping operator integer codes for shader uniform */
export const TONE_MAPPING_OPERATOR_CODES: Record<ToneMappingOperator, number> = {
  off: 0,
  reinhard: 1,
  filmic: 2,
  aces: 3,
  agx: 4,
  pbrNeutral: 5,
  gt: 6,
  acesHill: 7,
  drago: 8,
};

/** Gamut identifier integer codes for shader uniform */
export const GAMUT_CODES: Record<GamutIdentifier, number> = {
  srgb: 0,
  rec2020: 1,
  'display-p3': 2,
};

/** Gamut mapping mode codes for shader uniform */
export const GAMUT_MODE_CODES: Record<string, number> = {
  clip: 0,
  compress: 1,
};

/**
 * Color primaries conversion matrices (column-major for GLSL mat3).
 * Derived from CIE xy chromaticity coordinates and the Bradford chromatic
 * adaptation transform.
 */
export const COLOR_PRIMARIES_MATRICES = {
  IDENTITY: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  // BT.2020 → BT.709/sRGB
  REC2020_TO_SRGB: new Float32Array([1.6605, -0.1246, -0.0182, -0.5877, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187]),
  // Display-P3 → BT.709/sRGB
  P3_TO_SRGB: new Float32Array([1.2249, -0.042, -0.0197, -0.2247, 1.0419, -0.0786, -0.0002, 0.0001, 1.0983]),
  // BT.709/sRGB → Display-P3
  SRGB_TO_P3: new Float32Array([0.8225, 0.0332, 0.0171, 0.1774, 0.9669, 0.0724, 0.0001, -0.0001, 0.9105]),
  // BT.709/sRGB → BT.2020
  SRGB_TO_REC2020: new Float32Array([0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.088, 0.0433, 0.0114, 0.8956]),
} as const;

/** Map ChannelMode string to shader integer */
export const CHANNEL_MODE_CODES: Record<ChannelMode, number> = {
  rgb: 0,
  red: 1,
  green: 2,
  blue: 3,
  alpha: 4,
  luminance: 5,
};

// --- Background pattern shader codes ---
export const BG_PATTERN_NONE = 0;
export const BG_PATTERN_SOLID = 1;
export const BG_PATTERN_CHECKER = 2;
export const BG_PATTERN_CROSSHATCH = 3;

// --- Default thresholds and sizes ---
export const DEFAULT_ZEBRA_HIGH_THRESHOLD = 0.95;
export const DEFAULT_ZEBRA_LOW_THRESHOLD = 0.05;
export const DEFAULT_CHECKER_SIZE = 16;
