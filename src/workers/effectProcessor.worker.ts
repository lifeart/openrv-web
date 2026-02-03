/**
 * Effect Processor Web Worker
 *
 * This worker handles CPU-intensive effect processing in a background thread.
 * It processes image data with various effects like highlights/shadows, vibrance,
 * clarity, color wheels, CDL, curves, HSL qualifier, sharpen, and channel isolation.
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
  applyToneMappingToData,
  // Types - main types
  type WorkerColorAdjustments as ColorAdjustments,
  type WorkerCDLValues as CDLValues,
  type WorkerColorCurvesData as ColorCurvesData,
  type WorkerColorWheelsState as ColorWheelsState,
  type WorkerHSLQualifierState as HSLQualifierState,
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
// Effect Processing Functions
// ============================================================================

function applyHighlightsShadows(
  data: Uint8ClampedArray,
  ca: ColorAdjustments
): void {
  const highlights = ca.highlights / 100;
  const shadows = ca.shadows / 100;
  const whites = ca.whites / 100;
  const blacks = ca.blacks / 100;

  const highlightLUT = new Float32Array(256);
  const shadowLUT = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const n = i / 255;
    highlightLUT[i] = smoothstep(0.5, 1.0, n);
    shadowLUT[i] = 1.0 - smoothstep(0.0, 0.5, n);
  }

  const whitePoint = 255 - whites * WHITES_BLACKS_RANGE;
  const blackPoint = blacks * WHITES_BLACKS_RANGE;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    let r = data[i]!,
      g = data[i + 1]!,
      b = data[i + 2]!;

    if (whites !== 0 || blacks !== 0) {
      const range = whitePoint - blackPoint;
      if (range > 0) {
        r = Math.max(0, Math.min(255, ((r - blackPoint) / range) * 255));
        g = Math.max(0, Math.min(255, ((g - blackPoint) / range) * 255));
        b = Math.max(0, Math.min(255, ((b - blackPoint) / range) * 255));
      }
    }

    const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));

    if (highlights !== 0) {
      const adj = highlights * highlightLUT[lumIndex]! * HIGHLIGHT_SHADOW_RANGE;
      r = Math.max(0, Math.min(255, r - adj));
      g = Math.max(0, Math.min(255, g - adj));
      b = Math.max(0, Math.min(255, b - adj));
    }

    if (shadows !== 0) {
      const adj = shadows * shadowLUT[lumIndex]! * HIGHLIGHT_SHADOW_RANGE;
      r = Math.max(0, Math.min(255, r + adj));
      g = Math.max(0, Math.min(255, g + adj));
      b = Math.max(0, Math.min(255, b + adj));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

function applyVibrance(data: Uint8ClampedArray, ca: ColorAdjustments): void {
  const vibrance = ca.vibrance / 100;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i]! / 255,
      g = data[i + 1]! / 255,
      b = data[i + 2]! / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const delta = max - min;
    const l = (max + min) / 2;
    let s = 0;
    if (delta !== 0)
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    let h = 0;
    if (delta !== 0) {
      if (max === r) {
        h = ((g - b) / delta) % 6;
        if (h < 0) h += 6; // Fix negative modulo
      } else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = h * 60;
      if (h < 0) h += 360;
    }

    let skinProtection = 1.0;
    if (
      ca.vibranceSkinProtection &&
      h >= 20 &&
      h <= 50 &&
      s < 0.6 &&
      l > 0.2 &&
      l < 0.8
    ) {
      skinProtection =
        SKIN_PROTECTION_MIN +
        (Math.abs(h - SKIN_TONE_HUE_CENTER) / SKIN_TONE_HUE_RANGE) *
          (1.0 - SKIN_PROTECTION_MIN);
    }

    const satFactor = 1.0 - s * 0.5;
    const newS = Math.max(0, Math.min(1, s + vibrance * satFactor * skinProtection));
    if (Math.abs(newS - s) < 0.001) continue;

    let newR: number, newG: number, newB: number;
    if (newS === 0) {
      newR = newG = newB = l;
    } else {
      const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
      const p = 2 * l - q;
      const hNorm = h / 360;
      newR = hueToRgb(p, q, hNorm + 1 / 3);
      newG = hueToRgb(p, q, hNorm);
      newB = hueToRgb(p, q, hNorm - 1 / 3);
    }

    data[i] = Math.round(newR * 255);
    data[i + 1] = Math.round(newG * 255);
    data[i + 2] = Math.round(newB * 255);
  }
}

function applyGaussianBlur5x5(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  const temp = new Uint8ClampedArray(data.length);
  const kernel = [1, 4, 6, 4, 1];

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
  return result;
}

function applyClarity(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  ca: ColorAdjustments
): void {
  const clarity = ca.clarity / 100;
  const original = new Uint8ClampedArray(data);
  const blurred = applyGaussianBlur5x5(original, width, height);

  const midtoneMask = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const n = i / 255;
    const dev = Math.abs(n - 0.5) * 2;
    midtoneMask[i] = 1.0 - dev * dev;
  }

  const effectScale = clarity * CLARITY_EFFECT_SCALE;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = original[i]!,
      g = original[i + 1]!,
      b = original[i + 2]!;
    const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
    const mask = midtoneMask[Math.min(255, Math.max(0, Math.round(lum)))]!;
    const adj = mask * effectScale;

    data[i] = Math.max(0, Math.min(255, r + (r - blurred[i]!) * adj));
    data[i + 1] = Math.max(0, Math.min(255, g + (g - blurred[i + 1]!) * adj));
    data[i + 2] = Math.max(0, Math.min(255, b + (b - blurred[i + 2]!) * adj));
  }
}

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

function applyColorWheels(
  data: Uint8ClampedArray,
  state: ColorWheelsState
): void {
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = data[i]! / 255,
      g = data[i + 1]! / 255,
      b = data[i + 2]! / 255;
    const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

    if (
      state.master.r !== 0 ||
      state.master.g !== 0 ||
      state.master.b !== 0 ||
      state.master.y !== 0
    ) {
      r = r + state.master.r * COLOR_WHEEL_MASTER_FACTOR + state.master.y;
      g = g + state.master.g * COLOR_WHEEL_MASTER_FACTOR + state.master.y;
      b = b + state.master.b * COLOR_WHEEL_MASTER_FACTOR + state.master.y;
    }

    const liftWeight = smoothstep(0.5, 0.33, luma) * smoothstep(0, 0.15, luma);
    const gammaWeight = bellCurve(luma, 0.5, 0.25);
    const gainWeight = smoothstep(0.5, 0.67, luma) * smoothstep(1.0, 0.85, luma);

    if (
      liftWeight > 0 &&
      (state.lift.r !== 0 ||
        state.lift.g !== 0 ||
        state.lift.b !== 0 ||
        state.lift.y !== 0)
    ) {
      r +=
        (state.lift.r * COLOR_WHEEL_LIFT_FACTOR +
          state.lift.y * COLOR_WHEEL_LIFT_FACTOR) *
        liftWeight;
      g +=
        (state.lift.g * COLOR_WHEEL_LIFT_FACTOR +
          state.lift.y * COLOR_WHEEL_LIFT_FACTOR) *
        liftWeight;
      b +=
        (state.lift.b * COLOR_WHEEL_LIFT_FACTOR +
          state.lift.y * COLOR_WHEEL_LIFT_FACTOR) *
        liftWeight;
    }

    if (
      gammaWeight > 0 &&
      (state.gamma.r !== 0 ||
        state.gamma.g !== 0 ||
        state.gamma.b !== 0 ||
        state.gamma.y !== 0)
    ) {
      const gammaR =
        1.0 -
        state.gamma.r * COLOR_WHEEL_GAMMA_FACTOR -
        state.gamma.y * COLOR_WHEEL_LIFT_FACTOR;
      const gammaG =
        1.0 -
        state.gamma.g * COLOR_WHEEL_GAMMA_FACTOR -
        state.gamma.y * COLOR_WHEEL_LIFT_FACTOR;
      const gammaB =
        1.0 -
        state.gamma.b * COLOR_WHEEL_GAMMA_FACTOR -
        state.gamma.y * COLOR_WHEEL_LIFT_FACTOR;
      r = r * (1 - gammaWeight) + Math.pow(Math.max(0, r), gammaR) * gammaWeight;
      g = g * (1 - gammaWeight) + Math.pow(Math.max(0, g), gammaG) * gammaWeight;
      b = b * (1 - gammaWeight) + Math.pow(Math.max(0, b), gammaB) * gammaWeight;
    }

    if (
      gainWeight > 0 &&
      (state.gain.r !== 0 ||
        state.gain.g !== 0 ||
        state.gain.b !== 0 ||
        state.gain.y !== 0)
    ) {
      const gainR =
        1.0 +
        state.gain.r * COLOR_WHEEL_GAIN_FACTOR +
        state.gain.y * COLOR_WHEEL_GAIN_FACTOR;
      const gainG =
        1.0 +
        state.gain.g * COLOR_WHEEL_GAIN_FACTOR +
        state.gain.y * COLOR_WHEEL_GAIN_FACTOR;
      const gainB =
        1.0 +
        state.gain.b * COLOR_WHEEL_GAIN_FACTOR +
        state.gain.y * COLOR_WHEEL_GAIN_FACTOR;
      r = r * (1 - gainWeight) + r * gainR * gainWeight;
      g = g * (1 - gainWeight) + g * gainG * gainWeight;
      b = b * (1 - gainWeight) + b * gainB * gainWeight;
    }

    data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
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

function applyCDL(data: Uint8ClampedArray, cdl: CDLValues): void {
  const { slope, offset, power, saturation } = cdl;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    let r = data[i]! / 255,
      g = data[i + 1]! / 255,
      b = data[i + 2]! / 255;
    r = Math.pow(Math.max(0, r * slope.r + offset.r), power.r);
    g = Math.pow(Math.max(0, g * slope.g + offset.g), power.g);
    b = Math.pow(Math.max(0, b * slope.b + offset.b), power.b);

    if (saturation !== 1) {
      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
    }

    data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
}

function buildCurveLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  if (points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let p0 = sorted[0]!,
      p1 = sorted[sorted.length - 1]!;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (x >= sorted[j]!.x && x <= sorted[j + 1]!.x) {
        p0 = sorted[j]!;
        p1 = sorted[j + 1]!;
        break;
      }
    }
    const y =
      p1.x !== p0.x ? p0.y + ((x - p0.x) / (p1.x - p0.x)) * (p1.y - p0.y) : p0.y;
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
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

function applyCurves(data: Uint8ClampedArray, curves: ColorCurvesData): void {
  const masterLUT = curves.master.enabled
    ? buildCurveLUT(curves.master.points)
    : null;
  const redLUT = curves.red.enabled ? buildCurveLUT(curves.red.points) : null;
  const greenLUT = curves.green.enabled
    ? buildCurveLUT(curves.green.points)
    : null;
  const blueLUT = curves.blue.enabled
    ? buildCurveLUT(curves.blue.points)
    : null;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = data[i]!,
      g = data[i + 1]!,
      b = data[i + 2]!;
    if (masterLUT) {
      r = masterLUT[r]!;
      g = masterLUT[g]!;
      b = masterLUT[b]!;
    }
    if (redLUT) r = redLUT[r]!;
    if (greenLUT) g = greenLUT[g]!;
    if (blueLUT) b = blueLUT[b]!;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

function applySharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number
): void {
  const original = new Uint8ClampedArray(data);
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

function applyChannelIsolation(data: Uint8ClampedArray, mode: string): void {
  if (mode === 'rgb') return;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i]!,
      g = data[i + 1]!,
      b = data[i + 2]!;
    let val: number;
    switch (mode) {
      case 'red':
        val = r;
        break;
      case 'green':
        val = g;
        break;
      case 'blue':
        val = b;
        break;
      case 'luminance':
        val = Math.round(LUMA_R * r + LUMA_G * g + LUMA_B * b);
        break;
      case 'alpha':
        val = data[i + 3]!;
        break;
      default:
        continue;
    }
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }
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
  const hueMatch = calculateHueMatch(h, hue);
  const satMatch = calculateLinearMatch(s, saturation);
  const lumMatch = calculateLinearMatch(l, luminance);
  return hueMatch * satMatch * lumMatch;
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

function applyHSLQualifier(
  data: Uint8ClampedArray,
  state: HSLQualifierState
): void {
  if (!state.enabled) return;
  const len = data.length;
  const { hue, saturation, luminance, correction, invert, mattePreview } = state;

  for (let i = 0; i < len; i += 4) {
    const r = data[i]! / 255,
      g = data[i + 1]! / 255,
      b = data[i + 2]! / 255;
    const hsl = rgbToHsl(r, g, b);
    let matte = calculateHSLMatte(
      hsl.h,
      hsl.s * 100,
      hsl.l * 100,
      hue,
      saturation,
      luminance
    );
    if (invert) matte = 1 - matte;

    if (mattePreview) {
      const gray = Math.round(matte * 255);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    } else if (matte > 0.001) {
      const correctedHsl = applyHSLCorrection(
        hsl.h,
        hsl.s,
        hsl.l,
        correction,
        matte
      );
      const corrected = hslToRgb(correctedHsl.h, correctedHsl.s, correctedHsl.l);
      data[i] = Math.round(corrected.r * 255);
      data[i + 1] = Math.round(corrected.g * 255);
      data[i + 2] = Math.round(corrected.b * 255);
    }
  }
}

function applyWorkerHueRotation(data: Uint8ClampedArray, degrees: number): void {
  const mat = getHueRotationMatrix(degrees);
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;

    // mat is column-major: mat[0]=m00, mat[1]=m10, mat[2]=m20, etc.
    const outR = mat[0]! * r + mat[3]! * g + mat[6]! * b;
    const outG = mat[1]! * r + mat[4]! * g + mat[7]! * b;
    const outB = mat[2]! * r + mat[5]! * g + mat[8]! * b;

    data[i] = Math.max(0, Math.min(255, Math.round(outR * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(outG * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(outB * 255)));
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

  if (hasHS) applyHighlightsShadows(data, ca);
  if (hasVibrance) applyVibrance(data, ca);
  if (hasClarity) applyClarity(data, width, height, ca);
  if (hasHueRotation) applyWorkerHueRotation(data, ca.hueRotation);
  if (hasColorWheels) applyColorWheels(data, state.colorWheelsState);
  if (hasCDL) applyCDL(data, state.cdlValues);
  if (hasCurves) applyCurves(data, state.curvesData);
  if (hasHSLQualifier) applyHSLQualifier(data, state.hslQualifierState);
  if (hasToneMapping) applyToneMappingToData(data, state.toneMappingState.operator);
  if (state.colorInversionEnabled) applyWorkerColorInversion(data);
  if (hasSharpen)
    applySharpen(data, width, height, state.filterSettings.sharpen / 100);
  if (hasChannel) applyChannelIsolation(data, state.channelMode);
}

/**
 * Apply color inversion (255 - value) to RGB channels, preserving alpha.
 */
function applyWorkerColorInversion(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = 255 - data[i]!;     // R
    data[i + 1] = 255 - data[i + 1]!; // G
    data[i + 2] = 255 - data[i + 2]!; // B
    // alpha unchanged
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
