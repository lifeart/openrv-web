export type RGB3 = [number, number, number];

export interface ColorAdjustments {
  exposure: number;
  gamma: number;
  saturation: number;
  vibrance: number;
  vibranceSkinProtection: boolean;
  contrast: number;
  clarity: number;
  hueRotation: number;
  temperature: number;
  tint: number;
  brightness: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  /** Per-channel exposure (R, G, B) in stops. When set, overrides scalar `exposure`. */
  exposureRGB?: RGB3;
  /** Per-channel gamma (R, G, B). When set, overrides scalar `gamma`. */
  gammaRGB?: RGB3;
  /** Per-channel contrast (R, G, B). When set, overrides scalar `contrast`. */
  contrastRGB?: RGB3;
  /** Multiplicative scale (R, G, B). Applied after exposure, before contrast.
   *  Default identity is [1,1,1]. When set, overrides scalar `scale`. */
  scale?: number;
  scaleRGB?: RGB3;
  /** Additive offset (R, G, B). Applied after scale, before contrast.
   *  Default identity is [0,0,0]. When set, overrides scalar `offset`. */
  offset?: number;
  offsetRGB?: RGB3;
  /**
   * Inline 1D LUT from RVColor luminanceLUT component.
   * For 1-channel LUTs, contains N float values mapping luminance.
   * For 3-channel LUTs, contains N*3 float values (R table, G table, B table interleaved per entry).
   */
  inlineLUT?: Float32Array;
  /** Number of channels in inlineLUT: 1 = luminance, 3 = per-channel RGB */
  lutChannels?: 1 | 3;
}

export const DEFAULT_COLOR_ADJUSTMENTS: ColorAdjustments = {
  exposure: 0,
  gamma: 1,
  saturation: 1,
  vibrance: 0,
  vibranceSkinProtection: true,
  contrast: 1,
  clarity: 0,
  hueRotation: 0,
  temperature: 0,
  tint: 0,
  brightness: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
};

export type NumericAdjustmentKey = Exclude<keyof ColorAdjustments, 'vibranceSkinProtection' | 'exposureRGB' | 'gammaRGB' | 'contrastRGB' | 'scaleRGB' | 'offsetRGB' | 'scale' | 'offset' | 'inlineLUT' | 'lutChannels'>;

export type ChannelMode = 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance';

/**
 * Channel swizzle indices for RVChannelMap remapping.
 *
 * Each element specifies which source channel feeds the corresponding output channel:
 *   [outputR, outputG, outputB, outputA]
 *
 * Values:
 *   0 = source R, 1 = source G, 2 = source B, 3 = source A
 *   4 = constant 0.0, 5 = constant 1.0
 *
 * Default identity: [0, 1, 2, 3] (R->R, G->G, B->B, A->A)
 */
export type ChannelSwizzle = [number, number, number, number];

/** Sentinel value: output constant 0.0 */
export const SWIZZLE_ZERO = 4;
/** Sentinel value: output constant 1.0 */
export const SWIZZLE_ONE = 5;

/** Identity channel swizzle (no remapping). */
export const DEFAULT_CHANNEL_SWIZZLE: ChannelSwizzle = [0, 1, 2, 3];

/**
 * Linearization state parsed from RVLinearize GTO nodes.
 *
 * Controls how log-encoded or gamma-encoded source media is converted to
 * linear light before entering the grading pipeline.
 */
export interface LinearizeState {
  /** Log curve type: 0=none, 1=cineon, 2=viper, 3=ARRI LogC3 */
  logType: 0 | 1 | 2 | 3;
  /** Apply sRGB-to-linear EOTF */
  sRGB2linear: boolean;
  /** Apply Rec.709-to-linear EOTF */
  rec709ToLinear: boolean;
  /** File gamma (1.0 = no-op, applies pow(v, fileGamma) before other operations) */
  fileGamma: number;
  /** Alpha handling: 0=normal, 1=premultiplied */
  alphaType: number;
}

export const DEFAULT_LINEARIZE_STATE: LinearizeState = {
  logType: 0,
  sRGB2linear: false,
  rec709ToLinear: false,
  fileGamma: 1.0,
  alphaType: 0,
};

export interface WheelValues {
  r: number;
  g: number;
  b: number;
  y: number;
}

export interface ColorWheelsState {
  lift: WheelValues;
  gamma: WheelValues;
  gain: WheelValues;
  master: WheelValues;
  linked: boolean;
}

export const DEFAULT_WHEEL_VALUES: WheelValues = { r: 0, g: 0, b: 0, y: 0 };

export const DEFAULT_COLOR_WHEELS_STATE: ColorWheelsState = {
  lift: { ...DEFAULT_WHEEL_VALUES },
  gamma: { ...DEFAULT_WHEEL_VALUES },
  gain: { ...DEFAULT_WHEEL_VALUES },
  master: { ...DEFAULT_WHEEL_VALUES },
  linked: false,
};

export interface HSLRange {
  center: number;
  width: number;
  softness: number;
}

export interface HSLCorrection {
  hueShift: number;
  saturationScale: number;
  luminanceScale: number;
}

export interface HSLQualifierState {
  enabled: boolean;
  hue: HSLRange;
  saturation: HSLRange;
  luminance: HSLRange;
  correction: HSLCorrection;
  invert: boolean;
  mattePreview: boolean;
}

export const DEFAULT_HSL_RANGE: HSLRange = { center: 0, width: 30, softness: 20 };

export const DEFAULT_HSL_CORRECTION: HSLCorrection = {
  hueShift: 0,
  saturationScale: 1,
  luminanceScale: 1,
};

export const DEFAULT_HSL_QUALIFIER_STATE: HSLQualifierState = {
  enabled: false,
  hue: { center: 0, width: 30, softness: 20 },
  saturation: { center: 50, width: 100, softness: 10 },
  luminance: { center: 50, width: 100, softness: 10 },
  correction: { ...DEFAULT_HSL_CORRECTION },
  invert: false,
  mattePreview: false,
};
