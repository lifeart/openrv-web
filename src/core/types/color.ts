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

export type NumericAdjustmentKey = Exclude<keyof ColorAdjustments, 'vibranceSkinProtection'>;

export type ChannelMode = 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance';

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
