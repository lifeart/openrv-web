/**
 * Effect Processor Web Worker
 *
 * This worker handles CPU-intensive effect processing in a background thread.
 * It processes image data with various effects like highlights/shadows, vibrance,
 * clarity, color wheels, CDL, curves, HSL qualifier, sharpen, and channel isolation.
 *
 * Uses a merged single-pass approach for all per-pixel effects, keeping only
 * clarity (5x5 Gaussian) and sharpen (3x3 convolution) as separate passes
 * due to their inter-pixel dependencies.
 *
 * Message Protocol:
 * - Input: { type: 'process', id: number, imageData: Uint8ClampedArray, width: number, height: number, effectsState: AllEffectsState }
 * - Output: { type: 'result', id: number, imageData: Uint8ClampedArray } (with transferred buffer)
 * - Error: { type: 'error', id: number, error: string }
 * - Ready: { type: 'ready' } (sent on initialization)
 */

// Import shared constants and types from the file shared with EffectProcessor.ts
import {
  // Constants
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
  // Helper functions
  smoothstep,
  bellCurve,
  hueToRgb,
  rgbToHsl,
  hslToRgb,
  // Hue rotation
  getHueRotationMatrix,
  isIdentityHueRotation,
  // Tone mapping
  applyToneMappingToChannel,
  // Curve interpolation
  evaluateCurveAtPoint,
  // Types - main types
  type WorkerColorAdjustments as ColorAdjustments,
  type WorkerCDLValues as CDLValues,
  type WorkerColorCurvesData as ColorCurvesData,
  type WorkerColorWheelsState as ColorWheelsState,
  type WorkerEffectsState as AllEffectsState,
  type WorkerProcessMessage as ProcessMessage,
  // Types - nested types for function signatures
  type ColorWheelValue,
  type CurvePoint,
  type CurveChannel,
  type HSLRange,
  type HSLCorrection,
} from '../utils/effectProcessing.shared';

// ============================================================================
// Reusable clarity buffers - allocated once and reused across frames
// ============================================================================

let clarityOriginalBuffer: Uint8ClampedArray | null = null;
let clarityBlurTempBuffer: Uint8ClampedArray | null = null;
let clarityBlurResultBuffer: Uint8ClampedArray | null = null;
let clarityBufferSize = 0;

// ============================================================================
// Reusable sharpen buffer - allocated once and reused across frames
// ============================================================================

let sharpenOriginalBuffer: Uint8ClampedArray | null = null;
let sharpenBufferSize = 0;

function ensureSharpenBuffer(size: number): void {
  if (sharpenBufferSize !== size) {
    sharpenOriginalBuffer = new Uint8ClampedArray(size);
    sharpenBufferSize = size;
  }
}

// Cached midtone mask (never changes, 256 entries)
let midtoneMask: Float32Array | null = null;

function ensureClarityBuffers(size: number): void {
  if (clarityBufferSize !== size) {
    clarityOriginalBuffer = new Uint8ClampedArray(size);
    clarityBlurTempBuffer = new Uint8ClampedArray(size);
    clarityBlurResultBuffer = new Uint8ClampedArray(size);
    clarityBufferSize = size;
  }
}

function getMidtoneMask(): Float32Array {
  if (!midtoneMask) {
    midtoneMask = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const n = i / 255;
      const dev = Math.abs(n - 0.5) * 2;
      midtoneMask[i] = 1.0 - dev * dev;
    }
  }
  return midtoneMask;
}

// ============================================================================
// Vibrance 3D LUT Cache
// ============================================================================

const VIBRANCE_LUT_SIZE = 32;
let vibrance3DLUT: Float32Array | null = null;
let vibrance3DLUTParams: { vibrance: number; skinProtection: boolean } | null = null;

function getVibrance3DLUT(vibrance: number, skinProtection: boolean): Float32Array {
  if (vibrance3DLUT && vibrance3DLUTParams &&
      vibrance3DLUTParams.vibrance === vibrance &&
      vibrance3DLUTParams.skinProtection === skinProtection) {
    return vibrance3DLUT;
  }

  const size = VIBRANCE_LUT_SIZE;
  const lut = new Float32Array(size * size * size * 3);
  const vibranceNorm = vibrance / 100;

  for (let ri = 0; ri < size; ri++) {
    for (let gi = 0; gi < size; gi++) {
      for (let bi = 0; bi < size; bi++) {
        const r = ri / (size - 1);
        const g = gi / (size - 1);
        const b = bi / (size - 1);

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        const l = (max + min) / 2;
        let s = 0;
        if (delta !== 0) {
          s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        }

        let h = 0;
        if (delta !== 0) {
          if (max === r) {
            h = ((g - b) / delta) % 6;
            if (h < 0) h += 6;
          } else if (max === g) {
            h = (b - r) / delta + 2;
          } else {
            h = (r - g) / delta + 4;
          }
          h = h * 60;
          if (h < 0) h += 360;
        }

        let skinProt = 1.0;
        if (skinProtection && h >= 20 && h <= 50 && s < 0.6 && l > 0.2 && l < 0.8) {
          const hueDist = Math.abs(h - SKIN_TONE_HUE_CENTER) / SKIN_TONE_HUE_RANGE;
          skinProt = SKIN_PROTECTION_MIN + hueDist * (1.0 - SKIN_PROTECTION_MIN);
        }

        const satFactor = 1.0 - s * 0.5;
        const adjustment = vibranceNorm * satFactor * skinProt;
        const newS = Math.max(0, Math.min(1, s + adjustment));

        let outR: number, outG: number, outB: number;
        if (Math.abs(newS - s) < 0.001) {
          outR = r; outG = g; outB = b;
        } else if (newS === 0) {
          outR = outG = outB = l;
        } else {
          const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
          const p = 2 * l - q;
          const hNorm = h / 360;
          outR = hueToRgb(p, q, hNorm + 1/3);
          outG = hueToRgb(p, q, hNorm);
          outB = hueToRgb(p, q, hNorm - 1/3);
        }

        const idx = (ri * size * size + gi * size + bi) * 3;
        lut[idx] = outR;
        lut[idx + 1] = outG;
        lut[idx + 2] = outB;
      }
    }
  }

  vibrance3DLUT = lut;
  vibrance3DLUTParams = { vibrance, skinProtection };
  return lut;
}

// ============================================================================
// Cached highlight/shadow LUTs
// ============================================================================

let cachedHighlightLUT: Float32Array | null = null;
let cachedShadowLUT: Float32Array | null = null;

function getHighlightShadowLUTs(): { highlightLUT: Float32Array; shadowLUT: Float32Array } {
  if (!cachedHighlightLUT || !cachedShadowLUT) {
    cachedHighlightLUT = new Float32Array(256);
    cachedShadowLUT = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const n = i / 255;
      cachedHighlightLUT[i] = smoothstep(0.5, 1.0, n);
      cachedShadowLUT[i] = 1.0 - smoothstep(0.0, 0.5, n);
    }
  }
  return { highlightLUT: cachedHighlightLUT, shadowLUT: cachedShadowLUT };
}

// ============================================================================
// Inter-pixel Effect Functions (cannot be merged)
// ============================================================================

function applyGaussianBlur5x5InPlace(
  data: Uint8ClampedArray,
  width: number,
  height: number
): void {
  const result = clarityBlurResultBuffer!;
  const temp = clarityBlurTempBuffer!;
  const kernel = [1, 4, 6, 4, 1];

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          weightSum = 0;
        for (let k = -2; k <= 2; k++) {
          const nx = Math.min(width - 1, Math.max(0, x + k));
          sum += data[(y * width + nx) * 4 + c]! * kernel[k + 2]!;
          weightSum += kernel[k + 2]!;
        }
        temp[idx + c] = sum / weightSum;
      }
      temp[idx + 3] = data[idx + 3]!;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          weightSum = 0;
        for (let k = -2; k <= 2; k++) {
          const ny = Math.min(height - 1, Math.max(0, y + k));
          sum += temp[(ny * width + x) * 4 + c]! * kernel[k + 2]!;
          weightSum += kernel[k + 2]!;
        }
        result[idx + c] = sum / weightSum;
      }
      result[idx + 3] = temp[idx + 3]!;
    }
  }
}

function applyClarity(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ca: ColorAdjustments
): void {
  const clarity = ca.clarity / 100;
  const len = data.length;

  ensureClarityBuffers(len);

  const original = clarityOriginalBuffer!;
  original.set(data);

  applyGaussianBlur5x5InPlace(original, width, height);
  const blurred = clarityBlurResultBuffer!;

  const mask = getMidtoneMask();
  const effectScale = clarity * CLARITY_EFFECT_SCALE;

  for (let i = 0; i < len; i += 4) {
    const r = original[i]!,
      g = original[i + 1]!,
      b = original[i + 2]!;
    const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));
    const adj = mask[lumIndex]! * effectScale;

    data[i] = Math.max(0, Math.min(255, r + (r - blurred[i]!) * adj));
    data[i + 1] = Math.max(0, Math.min(255, g + (g - blurred[i + 1]!) * adj));
    data[i + 2] = Math.max(0, Math.min(255, b + (b - blurred[i + 2]!) * adj));
  }
}

function applySharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  ensureSharpenBuffer(data.length);
  const original = sharpenOriginalBuffer!;
  original.set(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0,
          ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum +=
              original[((y + ky) * width + (x + kx)) * 4 + c]! * kernel[ki++]!;
          }
        }
        const orig = original[idx + c]!;
        data[idx + c] = Math.round(
          orig + (Math.max(0, Math.min(255, sum)) - orig) * amount
        );
      }
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function hasColorWheelAdjustments(state: ColorWheelsState): boolean {
  const isDefault = (w: ColorWheelValue) =>
    w.r === 0 && w.g === 0 && w.b === 0 && w.y === 0;
  return (
    !isDefault(state.lift) ||
    !isDefault(state.gamma) ||
    !isDefault(state.gain) ||
    !isDefault(state.master)
  );
}

function isDefaultCDL(cdl: CDLValues): boolean {
  return (
    cdl.slope.r === 1 &&
    cdl.slope.g === 1 &&
    cdl.slope.b === 1 &&
    cdl.offset.r === 0 &&
    cdl.offset.g === 0 &&
    cdl.offset.b === 0 &&
    cdl.power.r === 1 &&
    cdl.power.g === 1 &&
    cdl.power.b === 1 &&
    cdl.saturation === 1
  );
}

function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  if (points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const y = evaluateCurveAtPoint(points, x);
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}

function buildIdentityLUT(): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = i;
  return lut;
}

function isDefaultCurves(curves: ColorCurvesData): boolean {
  const isDefaultChannel = (ch: CurveChannel) => {
    if (!ch.enabled) return true;
    if (ch.points.length !== 2) return false;
    return (
      ch.points[0]!.x === 0 &&
      ch.points[0]!.y === 0 &&
      ch.points[1]!.x === 1 &&
      ch.points[1]!.y === 1
    );
  };
  return (
    isDefaultChannel(curves.master) &&
    isDefaultChannel(curves.red) &&
    isDefaultChannel(curves.green) &&
    isDefaultChannel(curves.blue)
  );
}

function calculateHueMatch(hue: number, range: HSLRange): number {
  const { center, width, softness } = range;
  let distance = Math.abs(hue - center);
  if (distance > 180) distance = 360 - distance;
  const innerEdge = width / 2;
  const outerEdge = innerEdge + (softness * width) / 100;
  if (distance <= innerEdge) return 1;
  if (distance >= outerEdge) return 0;
  return smoothstep(outerEdge, innerEdge, distance);
}

function calculateLinearMatch(value: number, range: HSLRange): number {
  const { center, width, softness } = range;
  const distance = Math.abs(value - center);
  const innerEdge = width / 2;
  const outerEdge = innerEdge + (softness * width) / 100;
  if (distance <= innerEdge) return 1;
  if (distance >= outerEdge) return 0;
  return smoothstep(outerEdge, innerEdge, distance);
}

function calculateHSLMatte(
  h: number,
  s: number,
  l: number,
  hue: HSLRange,
  saturation: HSLRange,
  luminance: HSLRange
): number {
  return calculateHueMatch(h, hue) * calculateLinearMatch(s, saturation) * calculateLinearMatch(l, luminance);
}

function applyHSLCorrection(
  h: number,
  s: number,
  l: number,
  correction: HSLCorrection,
  matte: number
): { h: number; s: number; l: number } {
  let newH = h + correction.hueShift * matte;
  while (newH < 0) newH += 360;
  while (newH >= 360) newH -= 360;
  const newS = s * (1 - matte) + s * correction.saturationScale * matte;
  const newL = l * (1 - matte) + l * correction.luminanceScale * matte;
  return {
    h: newH,
    s: Math.max(0, Math.min(1, newS)),
    l: Math.max(0, Math.min(1, newL)),
  };
}

// ============================================================================
// Merged Per-Pixel Effects Loop
// ============================================================================

/**
 * Apply all per-pixel effects in a single merged loop.
 * Effects are applied in this order (matching the original separate-pass order):
 * 1. Highlights/Shadows/Whites/Blacks
 * 2. Vibrance (3D LUT with trilinear interpolation)
 * 3. Hue Rotation (3x3 matrix multiply)
 * 4. Color Wheels (zone weighting: lift/gamma/gain)
 * 5. CDL (Slope/Offset/Power/Saturation)
 * 6. Curves (1D LUT lookup)
 * 7. HSL Qualifier (RGB->HSL matte + correction)
 * 8. Tone Mapping (Reinhard/Filmic/ACES per-channel)
 * 9. Color Inversion (1.0 - value)
 * 10. Channel Isolation (channel select)
 */
function applyMergedPerPixelEffects(
  data: Uint8ClampedArray,
  state: AllEffectsState
): void {
  const len = data.length;
  const ca = state.colorAdjustments;

  // ---- Pre-compute flags ----
  const hasHS = ca.highlights !== 0 || ca.shadows !== 0 ||
                ca.whites !== 0 || ca.blacks !== 0;
  const hasVibrance = ca.vibrance !== 0;
  const hasHueRotation = !isIdentityHueRotation(ca.hueRotation);
  const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
  const hasCDL = !isDefaultCDL(state.cdlValues);
  const hasCurves = !isDefaultCurves(state.curvesData);
  const hasHSLQualifier = state.hslQualifierState && state.hslQualifierState.enabled;
  const hasToneMapping = state.toneMappingState &&
    state.toneMappingState.enabled &&
    state.toneMappingState.operator !== 'off';
  const hasInversion = state.colorInversionEnabled;
  const hasChannelIsolation = state.channelMode !== 'rgb';

  // ---- Pre-compute highlights/shadows values ----
  const highlights = ca.highlights / 100;
  const shadows = ca.shadows / 100;
  const whites = ca.whites / 100;
  const blacks = ca.blacks / 100;
  const hsLUTs = hasHS ? getHighlightShadowLUTs() : null;
  const whitePoint = hasHS ? 255 - whites * WHITES_BLACKS_RANGE : 0;
  const blackPoint = hasHS ? blacks * WHITES_BLACKS_RANGE : 0;
  const hasWhitesBlacks = whites !== 0 || blacks !== 0;
  const hsRange = hasWhitesBlacks ? whitePoint - blackPoint : 0;

  // ---- Pre-compute vibrance 3D LUT ----
  const vLUT = hasVibrance ? getVibrance3DLUT(ca.vibrance, ca.vibranceSkinProtection) : null;
  const lutSize = VIBRANCE_LUT_SIZE;
  const lutScale = lutSize - 1;

  // ---- Pre-compute hue rotation matrix ----
  const hueMatrix = hasHueRotation ? getHueRotationMatrix(ca.hueRotation) : null;

  // ---- Pre-compute color wheels ----
  const wheels = state.colorWheelsState;
  const hasMaster = hasColorWheels && (wheels.master.r !== 0 || wheels.master.g !== 0 ||
                    wheels.master.b !== 0 || wheels.master.y !== 0);
  const hasLift = hasColorWheels && (wheels.lift.r !== 0 || wheels.lift.g !== 0 ||
                  wheels.lift.b !== 0 || wheels.lift.y !== 0);
  const hasGamma = hasColorWheels && (wheels.gamma.r !== 0 || wheels.gamma.g !== 0 ||
                   wheels.gamma.b !== 0 || wheels.gamma.y !== 0);
  const hasGain = hasColorWheels && (wheels.gain.r !== 0 || wheels.gain.g !== 0 ||
                  wheels.gain.b !== 0 || wheels.gain.y !== 0);

  const gammaR = hasGamma ? 1.0 - wheels.gamma.r * COLOR_WHEEL_GAMMA_FACTOR - wheels.gamma.y * COLOR_WHEEL_LIFT_FACTOR : 1.0;
  const gammaG = hasGamma ? 1.0 - wheels.gamma.g * COLOR_WHEEL_GAMMA_FACTOR - wheels.gamma.y * COLOR_WHEEL_LIFT_FACTOR : 1.0;
  const gammaB = hasGamma ? 1.0 - wheels.gamma.b * COLOR_WHEEL_GAMMA_FACTOR - wheels.gamma.y * COLOR_WHEEL_LIFT_FACTOR : 1.0;

  const gainR = hasGain ? 1.0 + wheels.gain.r * COLOR_WHEEL_GAIN_FACTOR + wheels.gain.y * COLOR_WHEEL_GAIN_FACTOR : 1.0;
  const gainG = hasGain ? 1.0 + wheels.gain.g * COLOR_WHEEL_GAIN_FACTOR + wheels.gain.y * COLOR_WHEEL_GAIN_FACTOR : 1.0;
  const gainB = hasGain ? 1.0 + wheels.gain.b * COLOR_WHEEL_GAIN_FACTOR + wheels.gain.y * COLOR_WHEEL_GAIN_FACTOR : 1.0;

  // ---- Pre-compute CDL ----
  const cdl = state.cdlValues;
  const cdlHasSat = hasCDL && cdl.saturation !== 1;

  // ---- Pre-compute curves LUTs ----
  let masterLUT: Uint8Array | null = null;
  let redLUT: Uint8Array | null = null;
  let greenLUT: Uint8Array | null = null;
  let blueLUT: Uint8Array | null = null;
  if (hasCurves) {
    const curves = state.curvesData;
    masterLUT = curves.master.enabled ? buildCurveLUT(curves.master.points) : buildIdentityLUT();
    redLUT = curves.red.enabled ? buildCurveLUT(curves.red.points) : buildIdentityLUT();
    greenLUT = curves.green.enabled ? buildCurveLUT(curves.green.points) : buildIdentityLUT();
    blueLUT = curves.blue.enabled ? buildCurveLUT(curves.blue.points) : buildIdentityLUT();
  }

  // ---- Pre-compute HSL qualifier ----
  const hslState = state.hslQualifierState;

  // ---- Pre-compute tone mapping ----
  const tmOperator = hasToneMapping ? state.toneMappingState.operator : '';
  const tmParams = hasToneMapping ? {
    reinhardWhitePoint: state.toneMappingState.reinhardWhitePoint,
    filmicExposureBias: state.toneMappingState.filmicExposureBias,
    filmicWhitePoint: state.toneMappingState.filmicWhitePoint,
  } : undefined;

  const channelMode = state.channelMode;

  // ============================================================
  // Main pixel loop
  // ============================================================
  for (let i = 0; i < len; i += 4) {
    let r = data[i]! / 255;
    let g = data[i + 1]! / 255;
    let b = data[i + 2]! / 255;

    // ---- 1. Highlights/Shadows/Whites/Blacks ----
    if (hasHS) {
      let r255 = r * 255;
      let g255 = g * 255;
      let b255 = b * 255;

      if (hasWhitesBlacks && hsRange > 0) {
        r255 = Math.max(0, Math.min(255, ((r255 - blackPoint) / hsRange) * 255));
        g255 = Math.max(0, Math.min(255, ((g255 - blackPoint) / hsRange) * 255));
        b255 = Math.max(0, Math.min(255, ((b255 - blackPoint) / hsRange) * 255));
      }

      const lum = LUMA_R * r255 + LUMA_G * g255 + LUMA_B * b255;
      const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));

      if (highlights !== 0) {
        const adj = highlights * hsLUTs!.highlightLUT[lumIndex]! * HIGHLIGHT_SHADOW_RANGE;
        r255 = Math.max(0, Math.min(255, r255 - adj));
        g255 = Math.max(0, Math.min(255, g255 - adj));
        b255 = Math.max(0, Math.min(255, b255 - adj));
      }

      if (shadows !== 0) {
        const adj = shadows * hsLUTs!.shadowLUT[lumIndex]! * HIGHLIGHT_SHADOW_RANGE;
        r255 = Math.max(0, Math.min(255, r255 + adj));
        g255 = Math.max(0, Math.min(255, g255 + adj));
        b255 = Math.max(0, Math.min(255, b255 + adj));
      }

      r = r255 / 255;
      g = g255 / 255;
      b = b255 / 255;
    }

    // ---- 2. Vibrance (3D LUT with trilinear interpolation) ----
    if (hasVibrance && vLUT) {
      const fr = Math.min(1, Math.max(0, r)) * lutScale;
      const fg = Math.min(1, Math.max(0, g)) * lutScale;
      const fb = Math.min(1, Math.max(0, b)) * lutScale;

      const ir0 = Math.floor(fr);
      const ig0 = Math.floor(fg);
      const ib0 = Math.floor(fb);
      const ir1 = Math.min(ir0 + 1, lutScale);
      const ig1 = Math.min(ig0 + 1, lutScale);
      const ib1 = Math.min(ib0 + 1, lutScale);

      const dr = fr - ir0;
      const dg = fg - ig0;
      const db = fb - ib0;

      const c000 = (ir0 * lutSize * lutSize + ig0 * lutSize + ib0) * 3;
      const c001 = (ir0 * lutSize * lutSize + ig0 * lutSize + ib1) * 3;
      const c010 = (ir0 * lutSize * lutSize + ig1 * lutSize + ib0) * 3;
      const c011 = (ir0 * lutSize * lutSize + ig1 * lutSize + ib1) * 3;
      const c100 = (ir1 * lutSize * lutSize + ig0 * lutSize + ib0) * 3;
      const c101 = (ir1 * lutSize * lutSize + ig0 * lutSize + ib1) * 3;
      const c110 = (ir1 * lutSize * lutSize + ig1 * lutSize + ib0) * 3;
      const c111 = (ir1 * lutSize * lutSize + ig1 * lutSize + ib1) * 3;

      for (let ch = 0; ch < 3; ch++) {
        const v00 = vLUT[c000 + ch]! * (1 - db) + vLUT[c001 + ch]! * db;
        const v01 = vLUT[c010 + ch]! * (1 - db) + vLUT[c011 + ch]! * db;
        const v10 = vLUT[c100 + ch]! * (1 - db) + vLUT[c101 + ch]! * db;
        const v11 = vLUT[c110 + ch]! * (1 - db) + vLUT[c111 + ch]! * db;
        const v0 = v00 * (1 - dg) + v01 * dg;
        const v1 = v10 * (1 - dg) + v11 * dg;
        const result = v0 * (1 - dr) + v1 * dr;
        if (ch === 0) r = result;
        else if (ch === 1) g = result;
        else b = result;
      }
    }

    // ---- 3. Hue Rotation ----
    if (hasHueRotation && hueMatrix) {
      const nr = hueMatrix[0]! * r + hueMatrix[3]! * g + hueMatrix[6]! * b;
      const ng = hueMatrix[1]! * r + hueMatrix[4]! * g + hueMatrix[7]! * b;
      const nb = hueMatrix[2]! * r + hueMatrix[5]! * g + hueMatrix[8]! * b;
      r = Math.max(0, Math.min(1, nr));
      g = Math.max(0, Math.min(1, ng));
      b = Math.max(0, Math.min(1, nb));
    }

    // ---- 4. Color Wheels ----
    if (hasColorWheels) {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

      if (hasMaster) {
        r = r + wheels.master.r * COLOR_WHEEL_MASTER_FACTOR + wheels.master.y;
        g = g + wheels.master.g * COLOR_WHEEL_MASTER_FACTOR + wheels.master.y;
        b = b + wheels.master.b * COLOR_WHEEL_MASTER_FACTOR + wheels.master.y;
      }

      const liftWeight = smoothstep(0.5, 0.33, luma) * smoothstep(0, 0.15, luma);
      const gammaWeight = bellCurve(luma, 0.5, 0.25);
      const gainWeight = smoothstep(0.5, 0.67, luma) * smoothstep(1.0, 0.85, luma);

      if (hasLift && liftWeight > 0) {
        r += (wheels.lift.r * COLOR_WHEEL_LIFT_FACTOR + wheels.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
        g += (wheels.lift.g * COLOR_WHEEL_LIFT_FACTOR + wheels.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
        b += (wheels.lift.b * COLOR_WHEEL_LIFT_FACTOR + wheels.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
      }

      if (hasGamma && gammaWeight > 0) {
        r = r * (1 - gammaWeight) + Math.pow(Math.max(0, r), gammaR) * gammaWeight;
        g = g * (1 - gammaWeight) + Math.pow(Math.max(0, g), gammaG) * gammaWeight;
        b = b * (1 - gammaWeight) + Math.pow(Math.max(0, b), gammaB) * gammaWeight;
      }

      if (hasGain && gainWeight > 0) {
        r = r * (1 - gainWeight) + r * gainR * gainWeight;
        g = g * (1 - gainWeight) + g * gainG * gainWeight;
        b = b * (1 - gainWeight) + b * gainB * gainWeight;
      }
    }

    // ---- 5. CDL ----
    if (hasCDL) {
      r = Math.max(0, Math.min(1, r * cdl.slope.r + cdl.offset.r));
      g = Math.max(0, Math.min(1, g * cdl.slope.g + cdl.offset.g));
      b = Math.max(0, Math.min(1, b * cdl.slope.b + cdl.offset.b));

      if (cdl.power.r !== 1.0 && r > 0) r = Math.pow(r, cdl.power.r);
      if (cdl.power.g !== 1.0 && g > 0) g = Math.pow(g, cdl.power.g);
      if (cdl.power.b !== 1.0 && b > 0) b = Math.pow(b, cdl.power.b);

      r = Math.max(0, Math.min(1, r));
      g = Math.max(0, Math.min(1, g));
      b = Math.max(0, Math.min(1, b));

      if (cdlHasSat) {
        const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        r = luma + (r - luma) * cdl.saturation;
        g = luma + (g - luma) * cdl.saturation;
        b = luma + (b - luma) * cdl.saturation;
      }
    }

    // ---- 6. Curves ----
    if (hasCurves && masterLUT && redLUT && greenLUT && blueLUT) {
      let ri = Math.round(Math.min(255, Math.max(0, r * 255)));
      let gi = Math.round(Math.min(255, Math.max(0, g * 255)));
      let bi = Math.round(Math.min(255, Math.max(0, b * 255)));

      ri = redLUT[ri]!;
      gi = greenLUT[gi]!;
      bi = blueLUT[bi]!;

      ri = masterLUT[ri]!;
      gi = masterLUT[gi]!;
      bi = masterLUT[bi]!;

      r = ri / 255;
      g = gi / 255;
      b = bi / 255;
    }

    // ---- 7. HSL Qualifier ----
    if (hasHSLQualifier) {
      const hsl = rgbToHsl(r, g, b);

      let matte = calculateHSLMatte(
        hsl.h, hsl.s * 100, hsl.l * 100,
        hslState.hue, hslState.saturation, hslState.luminance
      );

      if (hslState.invert) {
        matte = 1 - matte;
      }

      if (hslState.mattePreview) {
        r = g = b = matte;
      } else if (matte > 0.001) {
        const correctedHsl = applyHSLCorrection(hsl.h, hsl.s, hsl.l, hslState.correction, matte);
        const corrected = hslToRgb(correctedHsl.h, correctedHsl.s, correctedHsl.l);
        r = corrected.r;
        g = corrected.g;
        b = corrected.b;
      }
    }

    // ---- 8. Tone Mapping ----
    if (hasToneMapping) {
      r = applyToneMappingToChannel(r, tmOperator, tmParams);
      g = applyToneMappingToChannel(g, tmOperator, tmParams);
      b = applyToneMappingToChannel(b, tmOperator, tmParams);
    }

    // ---- 9. Color Inversion ----
    if (hasInversion) {
      r = 1.0 - r;
      g = 1.0 - g;
      b = 1.0 - b;
    }

    // ---- 10. Channel Isolation ----
    if (hasChannelIsolation) {
      switch (channelMode) {
        case 'red': {
          const val = r;
          r = g = b = val;
          break;
        }
        case 'green': {
          const val = g;
          r = g = b = val;
          break;
        }
        case 'blue': {
          const val = b;
          r = g = b = val;
          break;
        }
        case 'luminance': {
          const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
          r = g = b = luma;
          break;
        }
        case 'alpha': {
          const a = data[i + 3]! / 255;
          r = g = b = a;
          data[i + 3] = 255;
          break;
        }
      }
    }

    // ---- Store result ----
    data[i] = Math.round(Math.min(255, Math.max(0, r * 255)));
    data[i + 1] = Math.round(Math.min(255, Math.max(0, g * 255)));
    data[i + 2] = Math.round(Math.min(255, Math.max(0, b * 255)));
  }
}

// ============================================================================
// Main Processing Function
// ============================================================================

function processEffects(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  state: AllEffectsState
): void {
  const ca = state.colorAdjustments;
  const hasCDL = !isDefaultCDL(state.cdlValues);
  const hasCurves = !isDefaultCurves(state.curvesData);
  const hasSharpen = state.filterSettings.sharpen > 0;
  const hasChannel = state.channelMode !== 'rgb';
  const hasHS =
    ca.highlights !== 0 ||
    ca.shadows !== 0 ||
    ca.whites !== 0 ||
    ca.blacks !== 0;
  const hasVibrance = ca.vibrance !== 0;
  const hasClarity = ca.clarity !== 0;
  const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
  const hasHSLQualifier =
    state.hslQualifierState && state.hslQualifierState.enabled;
  const hasHueRotation = !isIdentityHueRotation(ca.hueRotation);
  const hasToneMapping = state.toneMappingState &&
    state.toneMappingState.enabled &&
    state.toneMappingState.operator !== 'off';
  const hasInversion = state.colorInversionEnabled;

  const hasPerPixelEffects = hasHS || hasVibrance || hasHueRotation ||
    hasColorWheels || hasCDL || hasCurves || hasHSLQualifier || hasToneMapping ||
    hasInversion || hasChannel;

  // Pass 1: Clarity (inter-pixel dependency - must be separate, applied first)
  if (hasClarity) {
    applyClarity(data, width, height, ca);
  }

  // Pass 2: All per-pixel effects merged into a single loop
  if (hasPerPixelEffects) {
    applyMergedPerPixelEffects(data, state);
  }

  // Pass 3: Sharpen (inter-pixel dependency - must be separate, applied last)
  if (hasSharpen) {
    applySharpen(data, width, height, state.filterSettings.sharpen / 100);
  }
}

// ============================================================================
// Worker Message Handler
// ============================================================================

// Type assertion for Worker context - postMessage has different signature than window.postMessage
const workerSelf = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
};

workerSelf.onmessage = function (event: MessageEvent<ProcessMessage>) {
  const { type, id, imageData, width, height, effectsState } = event.data;
  if (type !== 'process') return;

  try {
    processEffects(imageData, width, height, effectsState);
    workerSelf.postMessage({ type: 'result', id, imageData }, [imageData.buffer]);
  } catch (error) {
    workerSelf.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

// Signal ready
workerSelf.postMessage({ type: 'ready' });

// ============================================================================
// Test-only exports for verifying buffer reuse behavior
// ============================================================================

export const __test__ = {
  ensureClarityBuffers,
  ensureSharpenBuffer,
  getMidtoneMask,
  applyClarity,
  applySharpen,
  applyGaussianBlur5x5InPlace,
  processEffects,
  getBufferState: () => ({
    clarityOriginalBuffer,
    clarityBlurTempBuffer,
    clarityBlurResultBuffer,
    clarityBufferSize,
    sharpenOriginalBuffer,
    sharpenBufferSize,
    midtoneMask,
  }),
  resetBuffers: () => {
    clarityOriginalBuffer = null;
    clarityBlurTempBuffer = null;
    clarityBlurResultBuffer = null;
    clarityBufferSize = 0;
    sharpenOriginalBuffer = null;
    sharpenBufferSize = 0;
    midtoneMask = null;
    vibrance3DLUT = null;
    vibrance3DLUTParams = null;
    cachedHighlightLUT = null;
    cachedShadowLUT = null;
  },
};
