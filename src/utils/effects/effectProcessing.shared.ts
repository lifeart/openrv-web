/**
 * Shared types and constants for effect processing
 *
 * This file is imported by both:
 * - src/utils/EffectProcessor.ts (main thread)
 * - src/workers/effectProcessor.worker.ts (worker thread)
 *
 * IMPORTANT: The only allowed dependency is `../../config/RenderConfig`
 * (a pure-constant module with zero external dependencies) so that
 * this file remains safe for Web Worker import.
 */

// Re-export rendering constants from the centralized config.
// Kept here for backward compatibility so existing imports are unaffected.
export {
  HIGHLIGHT_SHADOW_RANGE,
  WHITES_BLACKS_RANGE,
  CLARITY_EFFECT_SCALE,
  SKIN_TONE_HUE_CENTER,
  SKIN_TONE_HUE_RANGE,
  SKIN_PROTECTION_MIN,
  COLOR_WHEEL_MASTER_FACTOR,
  COLOR_WHEEL_LIFT_FACTOR,
  COLOR_WHEEL_GAMMA_FACTOR,
  COLOR_WHEEL_GAIN_FACTOR,
  LUMA_R,
  LUMA_G,
  LUMA_B,
} from '../../config/RenderConfig';

// Local imports for constants used within this file
import { LUMA_R, LUMA_G, LUMA_B } from '../../config/RenderConfig';
import { clamp } from '../math';

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
 * Tone mapping state for worker processing
 */
export interface WorkerToneMappingState {
  enabled: boolean;
  operator: string; // 'off' | 'reinhard' | 'filmic' | 'aces' | 'agx' | 'pbrNeutral' | 'gt' | 'acesHill' | 'drago'
  reinhardWhitePoint?: number;    // Extended Reinhard white point (default 4.0)
  filmicExposureBias?: number;    // Filmic exposure bias (default 2.0)
  filmicWhitePoint?: number;      // Filmic white point (default 11.2)
  dragoBias?: number;             // Drago bias (default 0.85)
  dragoLwa?: number;              // Scene average luminance (from LuminanceAnalyzer)
  dragoLmax?: number;             // Scene max luminance (from LuminanceAnalyzer)
  dragoBrightness?: number;       // Post-Drago brightness multiplier (default 2.0)
}

export interface WorkerDeinterlaceParams {
  method: string;   // 'bob' | 'weave' | 'blend'
  fieldOrder: string; // 'tff' | 'bff'
  enabled: boolean;
}

export interface WorkerFilmEmulationParams {
  enabled: boolean;
  stock: string;
  intensity: number;       // 0-100
  grainIntensity: number;  // 0-100
  grainSeed: number;
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
  toneMappingState: WorkerToneMappingState;
  colorInversionEnabled: boolean;
  deinterlaceParams?: WorkerDeinterlaceParams;
  filmEmulationParams?: WorkerFilmEmulationParams;
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

/**
 * Monotonic cubic spline interpolation for curve evaluation.
 * Uses Catmull-Rom spline interpolation for smooth curves.
 * Ensures the result is clamped to 0-1.
 *
 * Shared between main thread (ColorCurves.ts) and worker
 * (effectProcessor.worker.ts) for parity.
 */
export function evaluateCurveAtPoint(points: WorkerCurvePoint[], x: number): number {
  if (points.length === 0) return x;
  if (points.length === 1) return points[0]!.y;

  // Sort points by x
  const sorted = [...points].sort((a, b) => a.x - b.x);

  // Clamp x to curve bounds
  if (x <= sorted[0]!.x) return sorted[0]!.y;
  if (x >= sorted[sorted.length - 1]!.x) return sorted[sorted.length - 1]!.y;

  // Find segment containing x
  let i = 0;
  while (i < sorted.length - 1 && sorted[i + 1]!.x < x) {
    i++;
  }

  const p0 = sorted[Math.max(0, i - 1)]!;
  const p1 = sorted[i]!;
  const p2 = sorted[Math.min(sorted.length - 1, i + 1)]!;
  const p3 = sorted[Math.min(sorted.length - 1, i + 2)]!;

  // Calculate t (position within segment)
  const t = (x - p1.x) / (p2.x - p1.x || 1);

  // Catmull-Rom spline interpolation
  const t2 = t * t;
  const t3 = t2 * t;

  // Catmull-Rom basis matrix coefficients
  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * t +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  );

  // Clamp result to 0-1
  return clamp(y, 0, 1);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
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

// Cache for hue rotation matrix - keyed by degrees value
let cachedHueRotationDegrees: number | null = null;
let cachedHueRotationMatrix: Float32Array | null = null;

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
 * Get a cached hue rotation matrix for the given angle.
 * Returns the same Float32Array reference if the angle hasn't changed.
 *
 * IMPORTANT: Callers must NOT modify the returned Float32Array.
 */
export function getHueRotationMatrix(degrees: number): Float32Array {
  // Normalize to handle equivalent angles
  const normalized = ((degrees % 360) + 360) % 360;

  if (cachedHueRotationMatrix !== null && cachedHueRotationDegrees === normalized) {
    return cachedHueRotationMatrix;
  }

  cachedHueRotationDegrees = normalized;
  cachedHueRotationMatrix = buildHueRotationMatrix(normalized);
  return cachedHueRotationMatrix;
}

/**
 * Clear the hue rotation matrix cache.
 * Primarily for testing purposes.
 */
export function clearHueRotationCache(): void {
  cachedHueRotationDegrees = null;
  cachedHueRotationMatrix = null;
}

/**
 * Check if hue rotation is at identity (no effect).
 */
export function isIdentityHueRotation(degrees: number): boolean {
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized === 0;
}

// ============================================================================
// Tone Mapping Operators (CPU fallback)
// ============================================================================

/**
 * Reinhard tone mapping operator (per-channel).
 * Extended Reinhard formula: L * (1 + L / (Lw^2)) / (1 + L)
 * where Lw is the white point parameter.
 * Maps [0, infinity) to [0, 1) with configurable highlight rolloff.
 * Matches GPU shader: color * (1.0 + color / wp2) / (1.0 + color)
 */
export function tonemapReinhardChannel(value: number, whitePoint = 4.0): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const wp2 = whitePoint * whitePoint;
  return value * (1.0 + value / wp2) / (1.0 + value);
}

/**
 * Filmic tone mapping curve (Hable / Uncharted 2).
 * Internal curve function used by tonemapFilmicChannel.
 */
export function filmicCurveShared(x: number): number {
  const A = 0.15; // Shoulder strength
  const B = 0.50; // Linear strength
  const C = 0.10; // Linear angle
  const D = 0.20; // Toe strength
  const E = 0.02; // Toe numerator
  const F = 0.30; // Toe denominator
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

/**
 * Filmic tone mapping operator (per-channel).
 * Uses Hable/Uncharted 2 curve with configurable exposure bias and white point.
 * Matches GPU shader: filmic(exposureBias * color) / filmic(whitePoint)
 */
export function tonemapFilmicChannel(value: number, exposureBias = 2.0, whitePoint = 11.2): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const curr = filmicCurveShared(exposureBias * value);
  const whiteScale = 1.0 / filmicCurveShared(whitePoint);
  return Math.max(0, curr * whiteScale);
}

/**
 * ACES tone mapping operator (per-channel).
 * Fitted approximation by Krzysztof Narkowicz.
 * Formula: (x * (2.51x + 0.03)) / (x * (2.43x + 0.59) + 0.14)
 */
export function tonemapACESChannel(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return clamp((value * (a * value + b)) / (value * (c * value + d) + e), 0, 1);
}

/**
 * AgX tone mapping (Troy Sobotka / Blender 4.x).
 * Cross-channel operation: matrix transform → log2 → polynomial sigmoid → inverse matrix.
 * Best hue preservation in saturated highlights.
 */
export function tonemapAgX(r: number, g: number, b: number): { r: number; g: number; b: number } {
  if (!Number.isFinite(r) || r < 0) r = 0;
  if (!Number.isFinite(g) || g < 0) g = 0;
  if (!Number.isFinite(b) || b < 0) b = 0;

  // AgX inset matrix (row-major interpretation of GLSL column-major mat3)
  let ir = 0.842479062253094 * r + 0.0784335999999992 * g + 0.0792237451477643 * b;
  let ig = 0.0423282422610123 * r + 0.878468636469772 * g + 0.0791661274605434 * b;
  let ib = 0.0423756549057051 * r + 0.0784336 * g + 0.879142973793104 * b;

  // Log2 encoding
  const AgxMinEv = -12.47393;
  const AgxMaxEv = 4.026069;
  const range = AgxMaxEv - AgxMinEv;

  ir = (Math.log2(Math.max(ir, 1e-10)) - AgxMinEv) / range;
  ig = (Math.log2(Math.max(ig, 1e-10)) - AgxMinEv) / range;
  ib = (Math.log2(Math.max(ib, 1e-10)) - AgxMinEv) / range;

  ir = clamp(ir, 0, 1);
  ig = clamp(ig, 0, 1);
  ib = clamp(ib, 0, 1);

  // Polynomial sigmoid approximation (6th order)
  const sigmoid = (x: number): number => {
    const x2 = x * x;
    const x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
           - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  };
  ir = sigmoid(ir);
  ig = sigmoid(ig);
  ib = sigmoid(ib);

  // AgX outset matrix (row-major interpretation)
  const or = 1.19687900512017 * ir + (-0.0980208811401368) * ig + (-0.0990297440797205) * ib;
  const og = (-0.0528968517574562) * ir + 1.15190312990417 * ig + (-0.0989611768448433) * ib;
  const ob = (-0.0529716355144438) * ir + (-0.0980434501171241) * ig + 1.15107367264116 * ib;

  return { r: clamp(or, 0, 1), g: clamp(og, 0, 1), b: clamp(ob, 0, 1) };
}

/**
 * PBR Neutral tone mapping (Khronos).
 * Cross-channel operation: offset → peak compress → desaturate.
 * Minimal hue/saturation shift, ideal for color-critical work.
 */
export function tonemapPBRNeutral(r: number, g: number, b: number): { r: number; g: number; b: number } {
  if (!Number.isFinite(r) || r < 0) r = 0;
  if (!Number.isFinite(g) || g < 0) g = 0;
  if (!Number.isFinite(b) || b < 0) b = 0;

  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;

  const x = Math.min(r, g, b);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= offset;
  g -= offset;
  b -= offset;

  const peak = Math.max(r, g, b);
  if (peak < startCompression) return { r, g, b };

  const d = 1.0 - startCompression;
  const newPeak = 1.0 - d * d / (peak + d - startCompression);
  const scale = newPeak / peak;
  r *= scale;
  g *= scale;
  b *= scale;

  const gFactor = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  r = r * (1.0 - gFactor) + newPeak * gFactor;
  g = g * (1.0 - gFactor) + newPeak * gFactor;
  b = b * (1.0 - gFactor) + newPeak * gFactor;

  return { r, g, b };
}

/**
 * GT (Gran Turismo / Uchimura) tone mapping per-channel.
 * Smooth highlight rolloff with toe, linear, and shoulder regions.
 */
export function tonemapGTChannel(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;

  const P = 1.0;     // max display brightness
  const a = 1.0;     // contrast
  const m = 0.22;    // linear section start
  const l = 0.4;     // linear section length
  const c = 1.33;    // black tightness
  const b = 0.0;     // pedestal

  const l0 = ((P - m) * l) / a;
  const S0 = m + l0;
  const S1 = m + a * l0;
  const C2 = (a * P) / (P - S1);
  const CP = -C2 / P;

  const w0 = 1.0 - smoothstep(0.0, m, value);
  const w2 = value >= m + l0 ? 1.0 : 0.0;
  const w1 = 1.0 - w0 - w2;

  const T = m * Math.pow(value / m, c) + b;
  const L = m + a * (value - m);
  const S = P - (P - S1) * Math.exp(CP * (value - S0));

  return T * w0 + L * w1 + S * w2;
}

/**
 * ACES Hill tone mapping (Stephen Hill).
 * Cross-channel operation: sRGB→AP1 → RRT+ODT rational fit → AP1→sRGB.
 * More accurate RRT+ODT fit than Narkowicz.
 */
export function tonemapACESHill(r: number, g: number, b: number): { r: number; g: number; b: number } {
  if (!Number.isFinite(r) || r < 0) r = 0;
  if (!Number.isFinite(g) || g < 0) g = 0;
  if (!Number.isFinite(b) || b < 0) b = 0;

  // ACES input matrix (sRGB → AP1, row-major interpretation)
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.07600 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.02840 * r + 0.13383 * g + 0.83777 * b;

  // RRT+ODT fit
  const fitR = (ir * (ir + 0.0245786) - 0.000090537) / (ir * (0.983729 * ir + 0.4329510) + 0.238081);
  const fitG = (ig * (ig + 0.0245786) - 0.000090537) / (ig * (0.983729 * ig + 0.4329510) + 0.238081);
  const fitB = (ib * (ib + 0.0245786) - 0.000090537) / (ib * (0.983729 * ib + 0.4329510) + 0.238081);

  // ACES output matrix (AP1 → sRGB, row-major interpretation)
  const or = 1.60475 * fitR + (-0.53108) * fitG + (-0.07367) * fitB;
  const og = (-0.10208) * fitR + 1.10813 * fitG + (-0.00605) * fitB;
  const ob = (-0.00327) * fitR + (-0.07276) * fitG + 1.07602 * fitB;

  return { r: clamp(or, 0, 1), g: clamp(og, 0, 1), b: clamp(ob, 0, 1) };
}

/**
 * Drago adaptive logarithmic tone mapping (per-channel).
 * Reference: Drago et al., "Adaptive Logarithmic Mapping For Displaying High Contrast Scenes"
 * Matches GPU shader: tonemapDragoChannel()
 */
export function tonemapDragoChannel(value: number, bias = 0.85, Lwa = 0.2, Lmax = 1.5): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const safeWa = Math.max(Lwa, 1e-6);
  const safeMax = Math.max(Lmax, 1e-6);
  const Ln = value / safeWa;
  const biasP = Math.log(bias) / Math.log(0.5);
  const denom = Math.log2(1.0 + safeMax / safeWa);
  const num = Math.log(1.0 + Ln) / Math.log(2.0 + 8.0 * Math.pow(Ln / (safeMax / safeWa), biasP));
  const result = num / Math.max(denom, 1e-6);
  return Number.isFinite(result) ? Math.max(result, 0) : 0;
}

// ============================================================================
// Gamut Mapping (CPU path)
// ============================================================================

// Gamut conversion matrices (row-major for CPU matMul3: each group of 3 is one row)

/** Rec.2020 → sRGB */
const REC2020_TO_SRGB = [
   1.6605, -0.5876, -0.0728,
  -0.1246,  1.1329, -0.0083,
  -0.0182, -0.1006,  1.1187,
];

/** Rec.2020 → Display-P3 (derived from ITU-R BT.2020 and DCI-P3 D65 chromaticity coordinates) */
const REC2020_TO_P3 = [
   1.3436, -0.2822, -0.0614,
  -0.0653,  1.0758, -0.0105,
   0.0028, -0.0196,  1.0168,
];

/** Display-P3 → sRGB */
const P3_TO_SRGB = [
   1.2249, -0.2247, -0.0002,
  -0.0420,  1.0419,  0.0001,
  -0.0197, -0.0786,  1.0983,
];

function matMul3(m: number[], r: number, g: number, b: number): [number, number, number] {
  return [
    m[0]! * r + m[1]! * g + m[2]! * b,
    m[3]! * r + m[4]! * g + m[5]! * b,
    m[6]! * r + m[7]! * g + m[8]! * b,
  ];
}

function softClipChannel(x: number): number {
  if (x <= 0.0) return 0.0;
  if (x <= 0.8) return x;
  return 0.8 + 0.2 * Math.tanh((x - 0.8) / 0.2);
}

/**
 * Gamut map an RGB triplet from source to target gamut.
 *
 * @param r - Red channel (linear)
 * @param g - Green channel (linear)
 * @param b - Blue channel (linear)
 * @param sourceGamut - Source gamut identifier
 * @param targetGamut - Target gamut identifier
 * @param mode - 'clip' for hard clamp, 'compress' for soft clip
 * @returns Mapped [r, g, b] tuple
 */
export function gamutMapRGB(
  r: number, g: number, b: number,
  sourceGamut: string, targetGamut: string,
  mode: 'clip' | 'compress',
): [number, number, number] {
  // Convert from source to target gamut
  let mapped: [number, number, number] = [r, g, b];
  if (sourceGamut === 'rec2020') {
    mapped = targetGamut === 'display-p3'
      ? matMul3(REC2020_TO_P3, r, g, b)
      : matMul3(REC2020_TO_SRGB, r, g, b);
  } else if (sourceGamut === 'display-p3' && targetGamut === 'srgb') {
    mapped = matMul3(P3_TO_SRGB, r, g, b);
  }

  // Apply clip or compress
  if (mode === 'compress') {
    return [softClipChannel(mapped[0]), softClipChannel(mapped[1]), softClipChannel(mapped[2])];
  }
  return [clamp(mapped[0], 0, 1), clamp(mapped[1], 0, 1), clamp(mapped[2], 0, 1)];
}

/**
 * Tone mapping parameters for CPU processing.
 * Matches the GPU uniforms: u_tmReinhardWhitePoint, u_tmFilmicExposureBias, u_tmFilmicWhitePoint.
 */
export interface ToneMappingParams {
  reinhardWhitePoint?: number;
  filmicExposureBias?: number;
  filmicWhitePoint?: number;
  dragoBias?: number;
  dragoLwa?: number;
  dragoLmax?: number;
  dragoBrightness?: number;
}

/**
 * Apply tone mapping to a single channel value using the specified operator.
 */
export function applyToneMappingToChannel(value: number, operator: string, params?: ToneMappingParams): number {
  switch (operator) {
    case 'reinhard':
      return tonemapReinhardChannel(value, params?.reinhardWhitePoint);
    case 'filmic':
      return tonemapFilmicChannel(value, params?.filmicExposureBias, params?.filmicWhitePoint);
    case 'aces':
      return tonemapACESChannel(value);
    case 'gt':
      return tonemapGTChannel(value);
    case 'drago': {
      const brightness = params?.dragoBrightness ?? 2.0;
      return tonemapDragoChannel(value, params?.dragoBias, params?.dragoLwa, params?.dragoLmax) * brightness;
    }
    default:
      return value;
  }
}

/**
 * Apply tone mapping to an RGB triplet using the specified operator.
 * Handles both per-channel operators (reinhard, filmic, aces, gt) and
 * cross-channel operators (agx, pbrNeutral, acesHill) that require all three channels.
 */
export function applyToneMappingToRGB(
  r: number, g: number, b: number,
  operator: string, params?: ToneMappingParams
): { r: number; g: number; b: number } {
  switch (operator) {
    case 'reinhard':
      return {
        r: tonemapReinhardChannel(r, params?.reinhardWhitePoint),
        g: tonemapReinhardChannel(g, params?.reinhardWhitePoint),
        b: tonemapReinhardChannel(b, params?.reinhardWhitePoint),
      };
    case 'filmic':
      return {
        r: tonemapFilmicChannel(r, params?.filmicExposureBias, params?.filmicWhitePoint),
        g: tonemapFilmicChannel(g, params?.filmicExposureBias, params?.filmicWhitePoint),
        b: tonemapFilmicChannel(b, params?.filmicExposureBias, params?.filmicWhitePoint),
      };
    case 'aces':
      return {
        r: tonemapACESChannel(r),
        g: tonemapACESChannel(g),
        b: tonemapACESChannel(b),
      };
    case 'agx':
      return tonemapAgX(r, g, b);
    case 'pbrNeutral':
      return tonemapPBRNeutral(r, g, b);
    case 'gt':
      return {
        r: tonemapGTChannel(r),
        g: tonemapGTChannel(g),
        b: tonemapGTChannel(b),
      };
    case 'acesHill':
      return tonemapACESHill(r, g, b);
    case 'drago': {
      const brightness = params?.dragoBrightness ?? 2.0;
      return {
        r: tonemapDragoChannel(r, params?.dragoBias, params?.dragoLwa, params?.dragoLmax) * brightness,
        g: tonemapDragoChannel(g, params?.dragoBias, params?.dragoLwa, params?.dragoLmax) * brightness,
        b: tonemapDragoChannel(b, params?.dragoBias, params?.dragoLwa, params?.dragoLmax) * brightness,
      };
    }
    default:
      return { r, g, b };
  }
}

/**
 * Apply tone mapping to a Uint8ClampedArray (RGBA pixel data) in-place.
 * Converts 8-bit [0-255] to normalized [0-1], applies tone mapping, converts back.
 * Alpha channel is preserved unchanged.
 */
export function applyToneMappingToData(data: Uint8ClampedArray, operator: string, params?: ToneMappingParams): void {
  if (operator === 'off') return;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;

    const tm = applyToneMappingToRGB(r, g, b, operator, params);

    data[i] = clamp(Math.round(Number.isFinite(tm.r) ? tm.r * 255 : 0), 0, 255);
    data[i + 1] = clamp(Math.round(Number.isFinite(tm.g) ? tm.g * 255 : 0), 0, 255);
    data[i + 2] = clamp(Math.round(Number.isFinite(tm.b) ? tm.b * 255 : 0), 0, 255);
    // Alpha unchanged
  }
}

// ============================================================================
// Half-Resolution Processing Helpers
// ============================================================================

export { HALF_RES_MIN_DIMENSION } from '../../config/RenderConfig';

/**
 * Downsample ImageData to half resolution using box filter (2x2 average).
 * Each 2x2 block of source pixels is averaged into a single destination pixel.
 * Handles odd dimensions by clamping to image bounds.
 *
 * @param data - Source pixel data (RGBA Uint8ClampedArray)
 * @param width - Source width
 * @param height - Source height
 * @returns Object with half-res data, halfW, and halfH
 */
export function downsample2x(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const halfW = Math.ceil(width / 2);
  const halfH = Math.ceil(height / 2);
  const result = new Uint8ClampedArray(halfW * halfH * 4);

  for (let y = 0; y < halfH; y++) {
    const sy = y * 2;
    // Clamp the second row for odd heights
    const sy1 = Math.min(sy + 1, height - 1);

    for (let x = 0; x < halfW; x++) {
      const sx = x * 2;
      // Clamp the second column for odd widths
      const sx1 = Math.min(sx + 1, width - 1);

      const dstIdx = (y * halfW + x) * 4;

      // Indices for the 2x2 block
      const i00 = (sy * width + sx) * 4;
      const i10 = (sy * width + sx1) * 4;
      const i01 = (sy1 * width + sx) * 4;
      const i11 = (sy1 * width + sx1) * 4;

      // Average each channel
      for (let c = 0; c < 4; c++) {
        result[dstIdx + c] = (
          data[i00 + c]! + data[i10 + c]! +
          data[i01 + c]! + data[i11 + c]!
        ) >> 2; // Integer divide by 4
      }
    }
  }

  return { data: result, width: halfW, height: halfH };
}

/**
 * Upsample half-resolution data to target resolution using bilinear interpolation.
 *
 * @param halfData - Half-resolution pixel data (RGBA Uint8ClampedArray)
 * @param halfW - Half-resolution width
 * @param halfH - Half-resolution height
 * @param targetW - Target (full) width
 * @param targetH - Target (full) height
 * @returns Full-resolution pixel data
 */
export function upsample2x(
  halfData: Uint8ClampedArray,
  halfW: number,
  halfH: number,
  targetW: number,
  targetH: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(targetW * targetH * 4);

  // Scale factors: map target pixel center to half-res coordinates
  const scaleX = halfW / targetW;
  const scaleY = halfH / targetH;

  for (let y = 0; y < targetH; y++) {
    // Map target y to half-res coordinates (center of target pixel)
    const srcY = y * scaleY;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, halfH - 1);
    const fy = srcY - y0;

    for (let x = 0; x < targetW; x++) {
      const srcX = x * scaleX;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, halfW - 1);
      const fx = srcX - x0;

      const dstIdx = (y * targetW + x) * 4;

      // Indices for 4 corners in half-res
      const i00 = (y0 * halfW + x0) * 4;
      const i10 = (y0 * halfW + x1) * 4;
      const i01 = (y1 * halfW + x0) * 4;
      const i11 = (y1 * halfW + x1) * 4;

      // Bilinear weights
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      for (let c = 0; c < 4; c++) {
        result[dstIdx + c] = Math.round(
          halfData[i00 + c]! * w00 +
          halfData[i10 + c]! * w10 +
          halfData[i01 + c]! * w01 +
          halfData[i11 + c]! * w11
        );
      }
    }
  }

  return result;
}

// ============================================================================
// SIMD-like Optimizations using TypedArray Views
// ============================================================================

/**
 * Detect system endianness at module load time.
 * All modern browsers run on little-endian CPUs, but we detect to be safe.
 *
 * On little-endian systems, a Uint32Array view of RGBA pixel data
 * stores bytes as [R, G, B, A] at byte offsets 0,1,2,3 which reads
 * as 0xAABBGGRR in the 32-bit integer.
 */
export const IS_LITTLE_ENDIAN: boolean =
  new Uint8Array(new Uint32Array([0x12345678]).buffer)[0] === 0x78;

/**
 * XOR mask for color inversion (inverts R, G, B but preserves Alpha).
 *
 * Little-endian layout in Uint32: 0xAABBGGRR
 * To invert RGB but keep A: XOR with 0x00FFFFFF
 *   - Byte 0 (R): 0xFF XOR inverts
 *   - Byte 1 (G): 0xFF XOR inverts
 *   - Byte 2 (B): 0xFF XOR inverts
 *   - Byte 3 (A): 0x00 XOR preserves
 *
 * Big-endian layout in Uint32: 0xRRGGBBAA
 * To invert RGB but keep A: XOR with 0xFFFFFF00
 */
export const COLOR_INVERSION_XOR_MASK: number = IS_LITTLE_ENDIAN
  ? 0x00FFFFFF
  : 0xFFFFFF00;

/**
 * Channel isolation bitmasks for Uint32Array operations.
 * These masks zero out unwanted channels while preserving the target channel and alpha.
 *
 * Little-endian Uint32 layout: 0xAABBGGRR
 * Big-endian Uint32 layout: 0xRRGGBBAA
 */
export const CHANNEL_MASKS = IS_LITTLE_ENDIAN
  ? {
      // Little-endian: 0xAABBGGRR
      red:   0xFF0000FF,  // Keep R (byte 0) and A (byte 3)
      green: 0xFF00FF00,  // Keep G (byte 1) and A (byte 3)
      blue:  0xFFFF0000,  // Keep B (byte 2) and A (byte 3)
    }
  : {
      // Big-endian: 0xRRGGBBAA
      red:   0xFF0000FF,  // Keep R (byte 0) and A (byte 3)
      green: 0x00FF00FF,  // Keep G (byte 1) and A (byte 3)
      blue:  0x0000FFFF,  // Keep B (byte 2) and A (byte 3)
    };

/**
 * Apply color inversion using Uint32Array XOR trick.
 * Inverts R, G, B channels while preserving Alpha.
 * This is significantly faster than per-channel iteration for large images.
 *
 * @param data - The pixel data buffer (must be from ImageData.data or Uint8ClampedArray with aligned buffer)
 */
export function applyColorInversionSIMD(data: Uint8ClampedArray): void {
  const u32 = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  const mask = COLOR_INVERSION_XOR_MASK;
  const len = u32.length;
  for (let i = 0; i < len; i++) {
    u32[i] = u32[i]! ^ mask;
  }
}

/**
 * Scalar (reference) implementation of color inversion.
 * Kept for testing comparison and as a fallback.
 */
export function applyColorInversionScalar(data: Uint8ClampedArray): void {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    data[i]     = 255 - data[i]!;
    data[i + 1] = 255 - data[i + 1]!;
    data[i + 2] = 255 - data[i + 2]!;
    // Alpha unchanged
  }
}

/**
 * Apply channel isolation using Uint32Array bitmask.
 * Zeros out unwanted color channels while preserving the target channel and alpha.
 *
 * Note: This produces "true" channel isolation (non-target channels become 0),
 * which differs from the grayscale-style channel isolation used in the main
 * effect pipeline (where the target channel value is copied to all three channels).
 * Use applyChannelIsolationGrayscale() for the grayscale behavior.
 *
 * @param data - The pixel data buffer
 * @param channel - Which channel to isolate: 'red', 'green', or 'blue'
 */
export function applyChannelIsolationSIMD(
  data: Uint8ClampedArray,
  channel: 'red' | 'green' | 'blue'
): void {
  const u32 = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
  const mask = CHANNEL_MASKS[channel];
  const len = u32.length;
  for (let i = 0; i < len; i++) {
    u32[i] = u32[i]! & mask;
  }
}

/**
 * Apply channel isolation as grayscale: copy the selected channel's value to R, G, B.
 * This matches the behavior of the main effect pipeline's channel isolation
 * (where selecting "red" shows the red value as a grayscale image).
 *
 * Uses a Uint32Array view for efficient whole-pixel writes on little-endian systems.
 *
 * @param data - The pixel data buffer
 * @param channel - Which channel to show as grayscale: 'red', 'green', or 'blue'
 */
export function applyChannelIsolationGrayscale(
  data: Uint8ClampedArray,
  channel: 'red' | 'green' | 'blue'
): void {
  const len = data.length;

  // Channel byte offset within each RGBA quad
  const channelOffset = channel === 'red' ? 0 : channel === 'green' ? 1 : 2;

  if (IS_LITTLE_ENDIAN) {
    const u32 = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
    const pixelCount = u32.length;
    for (let i = 0; i < pixelCount; i++) {
      const byteIdx = i * 4 + channelOffset;
      const val = data[byteIdx]!;
      // Build 0xAA_val_val_val in little-endian: bytes are [val, val, val, alpha]
      u32[i] = val | (val << 8) | (val << 16) | (data[i * 4 + 3]! << 24);
    }
  } else {
    // Big-endian fallback: scalar approach
    for (let i = 0; i < len; i += 4) {
      const val = data[i + channelOffset]!;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      // Alpha unchanged
    }
  }
}

/**
 * Apply luminance channel isolation: compute Rec.709 luminance and set R=G=B=luma.
 * Uses a Uint32Array view for efficient whole-pixel writes on little-endian systems.
 *
 * @param data - The pixel data buffer
 */
export function applyLuminanceIsolation(data: Uint8ClampedArray): void {
  if (IS_LITTLE_ENDIAN) {
    const u32 = new Uint32Array(data.buffer, data.byteOffset, data.byteLength >> 2);
    const pixelCount = u32.length;
    for (let i = 0; i < pixelCount; i++) {
      const byteIdx = i * 4;
      const luma = Math.round(
        LUMA_R * data[byteIdx]! + LUMA_G * data[byteIdx + 1]! + LUMA_B * data[byteIdx + 2]!
      );
      const val = clamp(luma, 0, 255);
      u32[i] = val | (val << 8) | (val << 16) | (data[byteIdx + 3]! << 24);
    }
  } else {
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const luma = Math.round(
        LUMA_R * data[i]! + LUMA_G * data[i + 1]! + LUMA_B * data[i + 2]!
      );
      const val = clamp(luma, 0, 255);
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  }
}

/**
 * Build a 256-entry brightness lookup table.
 * Each entry maps an input byte value (0-255) to the brightness-adjusted output.
 *
 * @param multiplier - Brightness multiplier (1.0 = no change, >1 = brighter, <1 = darker)
 * @returns A 256-entry Uint8Array lookup table
 */
export function buildBrightnessLUT(multiplier: number): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = clamp(Math.round(i * multiplier), 0, 255);
  }
  return lut;
}

/**
 * Apply a pre-computed LUT to all R, G, B channels (alpha preserved).
 *
 * @param data - The pixel data buffer
 * @param lut - A 256-entry lookup table
 */
export function applyLUTToRGB(data: Uint8ClampedArray, lut: Uint8Array): void {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    data[i]     = lut[data[i]!]!;
    data[i + 1] = lut[data[i + 1]!]!;
    data[i + 2] = lut[data[i + 2]!]!;
    // Alpha unchanged
  }
}

// ============================================================================
// Worker-safe Deinterlace
// ============================================================================

/**
 * Apply deinterlace to raw Uint8ClampedArray pixel data (worker-safe, no ImageData).
 * Bob: keep one field, interpolate the other by averaging neighbors.
 * Blend: average each line with its adjacent neighbor.
 */
export function applyDeinterlaceWorker(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: WorkerDeinterlaceParams,
): void {
  if (!params.enabled || params.method === 'weave') return;

  const stride = width * 4;

  if (params.method === 'bob') {
    const original = new Uint8ClampedArray(data);
    const interpolateEven = params.fieldOrder === 'bff';

    for (let y = 0; y < height; y++) {
      const isEvenLine = y % 2 === 0;
      if (interpolateEven ? !isEvenLine : isEvenLine) continue;

      const rowOffset = y * stride;
      if (y === 0) {
        const belowOffset = stride;
        for (let i = 0; i < stride; i++) data[rowOffset + i] = original[belowOffset + i]!;
      } else if (y === height - 1) {
        const aboveOffset = (height - 2) * stride;
        for (let i = 0; i < stride; i++) data[rowOffset + i] = original[aboveOffset + i]!;
      } else {
        const aboveOffset = (y - 1) * stride;
        const belowOffset = (y + 1) * stride;
        for (let i = 0; i < stride; i++) {
          data[rowOffset + i] = (original[aboveOffset + i]! + original[belowOffset + i]!) >> 1;
        }
      }
    }
  } else if (params.method === 'blend') {
    const original = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
      const rowOffset = y * stride;
      const neighborY = y % 2 === 0
        ? Math.min(y + 1, height - 1)
        : Math.max(y - 1, 0);
      const neighborOffset = neighborY * stride;
      for (let i = 0; i < stride; i++) {
        data[rowOffset + i] = (original[rowOffset + i]! + original[neighborOffset + i]!) >> 1;
      }
    }
  }
}

// ============================================================================
// Worker-safe Film Emulation
// ============================================================================

// Inline film stock profiles (worker-safe: no external deps beyond LUMA constants)
function softSCurveWorker(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function strongSCurveWorker(x: number): number {
  return softSCurveWorker(softSCurveWorker(x));
}

function liftGammaWorker(x: number, lift: number, gamma: number): number {
  return clamp(lift + (1 - lift) * Math.pow(clamp(x, 0, 1), gamma), 0, 1);
}

interface WorkerFilmStockProfile {
  id: string;
  toneCurve: (r: number, g: number, b: number) => [number, number, number];
  saturation: number;
  grainAmount: number;
}

const WORKER_FILM_STOCKS: WorkerFilmStockProfile[] = [
  {
    id: 'kodak-portra-400',
    toneCurve(r, g, b) {
      const cr = liftGammaWorker(r * 1.03 + 0.01, 0.03, 0.95);
      const cg = liftGammaWorker(g * 1.00, 0.02, 0.97);
      const cb = liftGammaWorker(b * 0.95, 0.01, 1.02);
      return [softSCurveWorker(cr), softSCurveWorker(cg), softSCurveWorker(cb)];
    },
    saturation: 0.85,
    grainAmount: 0.35,
  },
  {
    id: 'kodak-ektar-100',
    toneCurve(r, g, b) {
      const cr = strongSCurveWorker(r * 1.05);
      const cg = strongSCurveWorker(g * 1.02);
      const cb = strongSCurveWorker(b * 1.06);
      return [clamp(cr, 0, 1), clamp(cg, 0, 1), clamp(cb, 0, 1)];
    },
    saturation: 1.3,
    grainAmount: 0.15,
  },
  {
    id: 'fuji-pro-400h',
    toneCurve(r, g, b) {
      const cr = liftGammaWorker(r * 0.97, 0.02, 0.98);
      const cg = liftGammaWorker(g * 1.01 + 0.01, 0.02, 0.96);
      const cb = liftGammaWorker(b * 1.04 + 0.02, 0.03, 0.95);
      return [softSCurveWorker(cr), softSCurveWorker(cg), softSCurveWorker(cb)];
    },
    saturation: 0.88,
    grainAmount: 0.3,
  },
  {
    id: 'fuji-velvia-50',
    toneCurve(r, g, b) {
      const cr = strongSCurveWorker(r * 1.08);
      const cg = strongSCurveWorker(g * 1.06);
      const cb = strongSCurveWorker(b * 1.1);
      return [clamp(cr, 0, 1), clamp(cg, 0, 1), clamp(cb, 0, 1)];
    },
    saturation: 1.5,
    grainAmount: 0.1,
  },
  {
    id: 'kodak-tri-x-400',
    toneCurve(r, g, b) {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      const curved = liftGammaWorker(luma, 0.02, 0.9);
      const v = softSCurveWorker(curved);
      return [v, v, v];
    },
    saturation: 0,
    grainAmount: 0.55,
  },
  {
    id: 'ilford-hp5',
    toneCurve(r, g, b) {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      const curved = liftGammaWorker(luma, 0.03, 0.95);
      const v = softSCurveWorker(curved);
      return [v, v, v];
    },
    saturation: 0,
    grainAmount: 0.3,
  },
];

function getWorkerFilmStock(id: string): WorkerFilmStockProfile | undefined {
  return WORKER_FILM_STOCKS.find(s => s.id === id);
}

/**
 * Apply film emulation to raw Uint8ClampedArray pixel data (worker-safe).
 * Applies tone curves, saturation, grain, and intensity blending.
 */
export function applyFilmEmulationWorker(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: WorkerFilmEmulationParams,
): void {
  if (!params.enabled || params.intensity <= 0) return;

  const stock = getWorkerFilmStock(params.stock);
  if (!stock) return;

  const intensity = clamp(params.intensity, 0, 100) / 100;
  const grainStrength = (clamp(params.grainIntensity, 0, 100) / 100) * stock.grainAmount;

  // Deterministic PRNG (xorshift32) for grain
  let rngState = (params.grainSeed | 0) || 1;
  function nextRng(): number {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 17;
    rngState ^= rngState << 5;
    return ((rngState & 0xffff) / 0x8000) - 1;
  }

  const totalPixels = width * height;
  for (let p = 0; p < totalPixels; p++) {
    const i = p * 4;
    const origR = data[i]!;
    const origG = data[i + 1]!;
    const origB = data[i + 2]!;

    let r = origR / 255;
    let g = origG / 255;
    let b = origB / 255;

    // Apply tone curve
    const [cr, cg, cb] = stock.toneCurve(r, g, b);

    // Apply saturation
    const luma = LUMA_R * cr + LUMA_G * cg + LUMA_B * cb;
    const sat = stock.saturation;
    r = luma + (cr - luma) * sat;
    g = luma + (cg - luma) * sat;
    b = luma + (cb - luma) * sat;

    // Apply grain
    if (grainStrength > 0) {
      const grainEnvelope = 4 * luma * (1 - luma);
      const grainAmount = grainStrength * grainEnvelope;
      const noise = nextRng() * grainAmount;
      r += noise;
      g += noise;
      b += noise;
    }

    // Blend with original
    r = origR / 255 * (1 - intensity) + clamp(r, 0, 1) * intensity;
    g = origG / 255 * (1 - intensity) + clamp(g, 0, 1) * intensity;
    b = origB / 255 * (1 - intensity) + clamp(b, 0, 1) * intensity;

    data[i] = Math.round(clamp(r, 0, 1) * 255);
    data[i + 1] = Math.round(clamp(g, 0, 1) * 255);
    data[i + 2] = Math.round(clamp(b, 0, 1) * 255);
  }
}
