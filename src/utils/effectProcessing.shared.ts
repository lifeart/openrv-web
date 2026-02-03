/**
 * Shared types and constants for effect processing
 *
 * This file is imported by both:
 * - src/utils/EffectProcessor.ts (main thread)
 * - src/workers/effectProcessor.worker.ts (worker thread)
 *
 * IMPORTANT: Keep this file self-contained with no external dependencies
 * to ensure it can be imported by the Web Worker.
 */

// ============================================================================
// Effect Processing Constants
// ============================================================================

/** Maximum adjustment range for highlights/shadows (in pixel values 0-255) */
export const HIGHLIGHT_SHADOW_RANGE = 128;

/** Maximum adjustment range for whites/blacks clipping (in pixel values 0-255) */
export const WHITES_BLACKS_RANGE = 55;

/** Clarity effect intensity scale factor */
export const CLARITY_EFFECT_SCALE = 0.7;

/** Skin tone hue center (degrees) for vibrance protection */
export const SKIN_TONE_HUE_CENTER = 35;

/** Skin tone hue range (degrees from center) for vibrance protection */
export const SKIN_TONE_HUE_RANGE = 15;

/** Minimum skin protection factor (0-1) */
export const SKIN_PROTECTION_MIN = 0.3;

/** Color wheel adjustment factors */
export const COLOR_WHEEL_MASTER_FACTOR = 0.5;
export const COLOR_WHEEL_LIFT_FACTOR = 0.3;
export const COLOR_WHEEL_GAMMA_FACTOR = 0.5;
export const COLOR_WHEEL_GAIN_FACTOR = 0.5;

/** Luminance coefficients (Rec. 709) */
export const LUMA_R = 0.2126;
export const LUMA_G = 0.7152;
export const LUMA_B = 0.0722;

// ============================================================================
// Shared Types for Effect Processing
// ============================================================================

/**
 * Color adjustments interface
 * All properties included for type safety.
 */
export interface WorkerColorAdjustments {
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

export interface WorkerCDLValues {
  slope: { r: number; g: number; b: number };
  offset: { r: number; g: number; b: number };
  power: { r: number; g: number; b: number };
  saturation: number;
}

export interface WorkerCurvePoint {
  x: number;
  y: number;
}

// Alias for use in worker function signatures
export type CurvePoint = WorkerCurvePoint;

export interface WorkerCurveChannel {
  enabled: boolean;
  points: WorkerCurvePoint[];
}

// Alias for use in worker function signatures
export type CurveChannel = WorkerCurveChannel;

export interface WorkerColorCurvesData {
  master: WorkerCurveChannel;
  red: WorkerCurveChannel;
  green: WorkerCurveChannel;
  blue: WorkerCurveChannel;
}

export interface WorkerFilterSettings {
  sharpen: number;
}

export interface WorkerColorWheelValue {
  r: number;
  g: number;
  b: number;
  y: number;
}

// Alias for use in worker function signatures
export type ColorWheelValue = WorkerColorWheelValue;

export interface WorkerColorWheelsState {
  lift: WorkerColorWheelValue;
  gamma: WorkerColorWheelValue;
  gain: WorkerColorWheelValue;
  master: WorkerColorWheelValue;
}

export interface WorkerHSLRange {
  center: number;
  width: number;
  softness: number;
}

// Alias for use in worker function signatures
export type HSLRange = WorkerHSLRange;

export interface WorkerHSLCorrection {
  hueShift: number;
  saturationScale: number;
  luminanceScale: number;
}

// Alias for use in worker function signatures
export type HSLCorrection = WorkerHSLCorrection;

export interface WorkerHSLQualifierState {
  enabled: boolean;
  hue: WorkerHSLRange;
  saturation: WorkerHSLRange;
  luminance: WorkerHSLRange;
  correction: WorkerHSLCorrection;
  invert: boolean;
  mattePreview: boolean;
}

/**
 * All effects state bundled together for worker processing
 */
export interface WorkerEffectsState {
  colorAdjustments: WorkerColorAdjustments;
  cdlValues: WorkerCDLValues;
  curvesData: WorkerColorCurvesData;
  filterSettings: WorkerFilterSettings;
  channelMode: string;
  colorWheelsState: WorkerColorWheelsState;
  hslQualifierState: WorkerHSLQualifierState;
  colorInversionEnabled: boolean;
}

// ============================================================================
// Worker Message Types
// ============================================================================

export interface WorkerProcessMessage {
  type: 'process';
  id: number;
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  effectsState: WorkerEffectsState;
}

export interface WorkerResultMessage {
  type: 'result';
  id: number;
  imageData: Uint8ClampedArray;
}

export interface WorkerErrorMessage {
  type: 'error';
  id: number;
  error: string;
}

export interface WorkerReadyMessage {
  type: 'ready';
}

export type WorkerOutgoingMessage = WorkerResultMessage | WorkerErrorMessage | WorkerReadyMessage;

// ============================================================================
// Shared Helper Functions
// ============================================================================

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function bellCurve(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d * 2);
}

export function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }
  }

  return { h: h * 360, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hNorm = h / 360;

    r = hueToRgb(p, q, hNorm + 1 / 3);
    g = hueToRgb(p, q, hNorm);
    b = hueToRgb(p, q, hNorm - 1 / 3);
  }

  return { r, g, b };
}

// ============================================================================
// Hue Rotation (luminance-preserving)
// ============================================================================

/**
 * Build a 3x3 luminance-preserving hue rotation matrix.
 * Uses Rodrigues rotation around (1,1,1)/sqrt(3) with a luminance shear
 * correction to preserve Rec.709 luminance.
 * Returns a 9-element Float32Array in column-major order (for WebGL mat3).
 */
export function buildHueRotationMatrix(degrees: number): Float32Array {
  const rad = (degrees * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const sq3 = Math.sqrt(3);
  const oo = 1 / 3;
  const t = 1 - cosA;

  // Rodrigues rotation around (1,1,1)/sqrt(3) (row-major)
  const r00 = cosA + t * oo;
  const r01 = t * oo - sinA / sq3;
  const r02 = t * oo + sinA / sq3;
  const r10 = t * oo + sinA / sq3;
  const r11 = cosA + t * oo;
  const r12 = t * oo - sinA / sq3;
  const r20 = t * oo - sinA / sq3;
  const r21 = t * oo + sinA / sq3;
  const r22 = cosA + t * oo;

  // Luminance shear correction: M = TInv * rot * T
  const dR = LUMA_R - oo;
  const dG = LUMA_G - oo;
  const dB = LUMA_B - oo;

  // P = rot * T: P[i][j] = r[i][j] + dj (row sums of rot = 1)
  const p00 = r00 + dR, p01 = r01 + dG, p02 = r02 + dB;
  const p10 = r10 + dR, p11 = r11 + dG, p12 = r12 + dB;
  const p20 = r20 + dR, p21 = r21 + dG, p22 = r22 + dB;

  // M = TInv * P: M[i][j] = P[i][j] - (dR*P[0][j] + dG*P[1][j] + dB*P[2][j])
  const col0 = dR * p00 + dG * p10 + dB * p20;
  const col1 = dR * p01 + dG * p11 + dB * p21;
  const col2 = dR * p02 + dG * p12 + dB * p22;

  return new Float32Array([
    p00 - col0, p10 - col0, p20 - col0,
    p01 - col1, p11 - col1, p21 - col1,
    p02 - col2, p12 - col2, p22 - col2,
  ]);
}

/**
 * Check if hue rotation is at identity (no effect).
 */
export function isIdentityHueRotation(degrees: number): boolean {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 0;
}
