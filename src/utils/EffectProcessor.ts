/**
 * EffectProcessor - Extracted effect application logic from Viewer.ts
 *
 * This class encapsulates all pixel-level effect processing including:
 * - Highlight/Shadow recovery
 * - Vibrance
 * - Clarity (local contrast)
 * - CDL color correction
 * - Color curves
 * - Sharpen filter
 * - Channel isolation
 *
 * Used by both Viewer (live rendering) and PrerenderBufferManager (background pre-rendering)
 */

import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { CDLValues, DEFAULT_CDL, isDefaultCDL, applyCDLToImageData } from '../color/CDL';
import { ColorCurvesData, createDefaultCurvesData, isDefaultCurves, CurveLUTCache } from '../color/ColorCurves';
import { FilterSettings, DEFAULT_FILTER_SETTINGS } from '../ui/components/FilterControl';
import { ChannelMode, applyChannelIsolation } from '../ui/components/ChannelSelect';
import { ColorWheelsState, DEFAULT_COLOR_WHEELS_STATE } from '../ui/components/ColorWheels';
import { HSLQualifierState, DEFAULT_HSL_QUALIFIER_STATE } from '../ui/components/HSLQualifier';

// Import shared constants and helpers from the file shared with the worker
import {
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
  smoothstep as sharedSmoothstep,
  bellCurve as sharedBellCurve,
  hueToRgb as sharedHueToRgb,
  rgbToHsl as sharedRgbToHsl,
  hslToRgb as sharedHslToRgb,
} from './effectProcessing.shared';

/**
 * All effect state bundled together for fingerprinting and processing
 */
export interface AllEffectsState {
  colorAdjustments: ColorAdjustments;
  cdlValues: CDLValues;
  curvesData: ColorCurvesData;
  filterSettings: FilterSettings;
  channelMode: ChannelMode;
  colorWheelsState: ColorWheelsState;
  hslQualifierState: HSLQualifierState;
}

/**
 * Create default effects state
 */
export function createDefaultEffectsState(): AllEffectsState {
  return {
    colorAdjustments: { ...DEFAULT_COLOR_ADJUSTMENTS },
    cdlValues: JSON.parse(JSON.stringify(DEFAULT_CDL)),
    curvesData: createDefaultCurvesData(),
    filterSettings: { ...DEFAULT_FILTER_SETTINGS },
    channelMode: 'rgb',
    colorWheelsState: JSON.parse(JSON.stringify(DEFAULT_COLOR_WHEELS_STATE)),
    hslQualifierState: JSON.parse(JSON.stringify(DEFAULT_HSL_QUALIFIER_STATE)),
  };
}

/**
 * Compute a hash/fingerprint of the effects state for cache invalidation
 */
export function computeEffectsHash(state: AllEffectsState): string {
  // Use a simple string representation for hashing
  // This is fast enough for our use case
  const str = JSON.stringify({
    ca: state.colorAdjustments,
    cdl: state.cdlValues,
    curves: state.curvesData,
    filter: state.filterSettings,
    channel: state.channelMode,
    wheels: state.colorWheelsState,
    hsl: state.hslQualifierState,
  });

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit signed integer
  }
  return (hash >>> 0).toString(36); // Convert to unsigned for consistent string
}

/**
 * Check if any pixel-level effects are active
 */
export function hasActiveEffects(state: AllEffectsState): boolean {
  const hasCDL = !isDefaultCDL(state.cdlValues);
  const hasCurves = !isDefaultCurves(state.curvesData);
  const hasSharpen = state.filterSettings.sharpen > 0;
  const hasChannel = state.channelMode !== 'rgb';
  const hasHighlightsShadows = state.colorAdjustments.highlights !== 0 ||
                               state.colorAdjustments.shadows !== 0 ||
                               state.colorAdjustments.whites !== 0 ||
                               state.colorAdjustments.blacks !== 0;
  const hasVibrance = state.colorAdjustments.vibrance !== 0;
  const hasClarity = state.colorAdjustments.clarity !== 0;
  const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
  const hasHSLQualifier = state.hslQualifierState.enabled;

  return hasCDL || hasCurves || hasSharpen || hasChannel ||
         hasHighlightsShadows || hasVibrance || hasClarity ||
         hasColorWheels || hasHSLQualifier;
}

/**
 * Check if color wheels have non-default values
 */
function hasColorWheelAdjustments(state: ColorWheelsState): boolean {
  const isDefault = (w: { r: number; g: number; b: number; y: number }) =>
    w.r === 0 && w.g === 0 && w.b === 0 && w.y === 0;
  return !isDefault(state.lift) || !isDefault(state.gamma) ||
         !isDefault(state.gain) || !isDefault(state.master);
}

/**
 * EffectProcessor class that can apply all effects to ImageData
 */
export class EffectProcessor {
  private curveLUTCache = new CurveLUTCache();

  // Cached LUTs for highlight/shadow processing (static since they don't change)
  private static highlightLUT: Float32Array | null = null;
  private static shadowLUT: Float32Array | null = null;

  // Cached midtone mask for clarity (static since it never changes)
  private static midtoneMask: Float32Array | null = null;

  // Reusable buffers for clarity blur to avoid repeated allocations
  // These are instance-level to allow multiple processors with different image sizes
  private clarityOriginalBuffer: Uint8ClampedArray | null = null;
  private clarityBlurTempBuffer: Uint8ClampedArray | null = null;
  private clarityBlurResultBuffer: Uint8ClampedArray | null = null;
  private clarityBufferSize: number = 0;

  /**
   * Get cached highlight/shadow LUTs (lazily initialized)
   */
  private getHighlightShadowLUTs(): { highlightLUT: Float32Array; shadowLUT: Float32Array } {
    if (!EffectProcessor.highlightLUT || !EffectProcessor.shadowLUT) {
      EffectProcessor.highlightLUT = new Float32Array(256);
      EffectProcessor.shadowLUT = new Float32Array(256);

      for (let i = 0; i < 256; i++) {
        const normalized = i / 255;
        EffectProcessor.highlightLUT[i] = this.smoothstep(0.5, 1.0, normalized);
        EffectProcessor.shadowLUT[i] = 1.0 - this.smoothstep(0.0, 0.5, normalized);
      }
    }

    return {
      highlightLUT: EffectProcessor.highlightLUT,
      shadowLUT: EffectProcessor.shadowLUT,
    };
  }

  /**
   * Apply all effects to ImageData in-place
   * This is the main entry point for effect processing
   */
  applyEffects(
    imageData: ImageData,
    width: number,
    height: number,
    state: AllEffectsState
  ): void {
    const hasCDL = !isDefaultCDL(state.cdlValues);
    const hasCurves = !isDefaultCurves(state.curvesData);
    const hasSharpen = state.filterSettings.sharpen > 0;
    const hasChannel = state.channelMode !== 'rgb';
    const hasHighlightsShadows = state.colorAdjustments.highlights !== 0 ||
                                 state.colorAdjustments.shadows !== 0 ||
                                 state.colorAdjustments.whites !== 0 ||
                                 state.colorAdjustments.blacks !== 0;
    const hasVibrance = state.colorAdjustments.vibrance !== 0;
    const hasClarity = state.colorAdjustments.clarity !== 0;
    const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
    const hasHSLQualifier = state.hslQualifierState.enabled;

    // Early return if no pixel effects are active
    if (!hasCDL && !hasCurves && !hasSharpen && !hasChannel &&
        !hasHighlightsShadows && !hasVibrance && !hasClarity &&
        !hasColorWheels && !hasHSLQualifier) {
      return;
    }

    // Apply highlight/shadow recovery (before other adjustments for best results)
    if (hasHighlightsShadows) {
      this.applyHighlightsShadows(imageData, state.colorAdjustments);
    }

    // Apply vibrance (intelligent saturation - before CDL/curves for natural results)
    if (hasVibrance) {
      this.applyVibrance(imageData, state.colorAdjustments);
    }

    // Apply clarity (local contrast enhancement in midtones)
    if (hasClarity) {
      this.applyClarity(imageData, width, height, state.colorAdjustments);
    }

    // Apply color wheels (Lift/Gamma/Gain - after basic adjustments, before CDL)
    if (hasColorWheels) {
      this.applyColorWheels(imageData, state.colorWheelsState);
    }

    // Apply CDL color correction
    if (hasCDL) {
      applyCDLToImageData(imageData, state.cdlValues);
    }

    // Apply color curves
    if (hasCurves) {
      this.curveLUTCache.apply(imageData, state.curvesData);
    }

    // Apply HSL Qualifier (secondary color correction - after primary corrections)
    if (hasHSLQualifier) {
      this.applyHSLQualifier(imageData, state.hslQualifierState);
    }

    // Apply sharpen filter
    if (hasSharpen) {
      this.applySharpenCPU(imageData, width, height, state.filterSettings.sharpen / 100);
    }

    // Apply channel isolation
    if (hasChannel) {
      applyChannelIsolation(imageData, state.channelMode);
    }
  }

  /**
   * Apply highlight/shadow recovery and whites/blacks clipping to ImageData.
   */
  private applyHighlightsShadows(imageData: ImageData, colorAdjustments: ColorAdjustments): void {
    const data = imageData.data;
    const highlights = colorAdjustments.highlights / 100;
    const shadows = colorAdjustments.shadows / 100;
    const whites = colorAdjustments.whites / 100;
    const blacks = colorAdjustments.blacks / 100;

    // Use cached LUTs for performance
    const { highlightLUT, shadowLUT } = this.getHighlightShadowLUTs();

    const whitePoint = 255 - whites * WHITES_BLACKS_RANGE;
    const blackPoint = blacks * WHITES_BLACKS_RANGE;

    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      let r = data[i]!;
      let g = data[i + 1]!;
      let b = data[i + 2]!;

      // Apply whites/blacks clipping first
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

      const highlightMask = highlightLUT[lumIndex]!;
      const shadowMask = shadowLUT[lumIndex]!;

      if (highlights !== 0) {
        const highlightAdjust = highlights * highlightMask * HIGHLIGHT_SHADOW_RANGE;
        r = Math.max(0, Math.min(255, r - highlightAdjust));
        g = Math.max(0, Math.min(255, g - highlightAdjust));
        b = Math.max(0, Math.min(255, b - highlightAdjust));
      }

      if (shadows !== 0) {
        const shadowAdjust = shadows * shadowMask * HIGHLIGHT_SHADOW_RANGE;
        r = Math.max(0, Math.min(255, r + shadowAdjust));
        g = Math.max(0, Math.min(255, g + shadowAdjust));
        b = Math.max(0, Math.min(255, b + shadowAdjust));
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  /**
   * Apply vibrance effect to ImageData.
   */
  private applyVibrance(imageData: ImageData, colorAdjustments: ColorAdjustments): void {
    const data = imageData.data;
    const vibrance = colorAdjustments.vibrance / 100;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

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
          if (h < 0) h += 6; // Fix negative modulo
        } else if (max === g) {
          h = (b - r) / delta + 2;
        } else {
          h = (r - g) / delta + 4;
        }
        h = h * 60;
        if (h < 0) h += 360;
      }

      // Skin tone protection
      let skinProtection = 1.0;
      if (colorAdjustments.vibranceSkinProtection && h >= 20 && h <= 50 && s < 0.6 && l > 0.2 && l < 0.8) {
        const hueDistance = Math.abs(h - SKIN_TONE_HUE_CENTER) / SKIN_TONE_HUE_RANGE;
        skinProtection = SKIN_PROTECTION_MIN + (hueDistance * (1.0 - SKIN_PROTECTION_MIN));
      }

      const satFactor = 1.0 - (s * 0.5);
      const adjustment = vibrance * satFactor * skinProtection;

      let newS = s + adjustment;
      newS = Math.max(0, Math.min(1, newS));

      if (Math.abs(newS - s) < 0.001) continue;

      let newR: number, newG: number, newB: number;

      if (newS === 0) {
        newR = newG = newB = l;
      } else {
        const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
        const p = 2 * l - q;
        const hNorm = h / 360;

        newR = this.hueToRgb(p, q, hNorm + 1/3);
        newG = this.hueToRgb(p, q, hNorm);
        newB = this.hueToRgb(p, q, hNorm - 1/3);
      }

      data[i] = Math.round(newR * 255);
      data[i + 1] = Math.round(newG * 255);
      data[i + 2] = Math.round(newB * 255);
    }
  }

  /**
   * Get cached midtone mask for clarity (lazily initialized)
   */
  private getMidtoneMask(): Float32Array {
    if (!EffectProcessor.midtoneMask) {
      EffectProcessor.midtoneMask = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const normalized = i / 255;
        const deviation = Math.abs(normalized - 0.5) * 2;
        EffectProcessor.midtoneMask[i] = 1.0 - deviation * deviation;
      }
    }
    return EffectProcessor.midtoneMask;
  }

  /**
   * Ensure clarity buffers are allocated and sized correctly.
   * Reuses existing buffers if size matches, otherwise reallocates.
   */
  private ensureClarityBuffers(size: number): void {
    if (this.clarityBufferSize !== size) {
      this.clarityOriginalBuffer = new Uint8ClampedArray(size);
      this.clarityBlurTempBuffer = new Uint8ClampedArray(size);
      this.clarityBlurResultBuffer = new Uint8ClampedArray(size);
      this.clarityBufferSize = size;
    }
  }

  /**
   * Apply clarity (local contrast) effect to ImageData.
   * Uses reusable buffers to minimize memory allocations.
   */
  private applyClarity(imageData: ImageData, width: number, height: number, colorAdjustments: ColorAdjustments): void {
    const data = imageData.data;
    const clarity = colorAdjustments.clarity / 100;
    const len = data.length;

    // Ensure buffers are the right size (reuses if already correct)
    this.ensureClarityBuffers(len);
    const original = this.clarityOriginalBuffer!;
    original.set(data);

    // Apply blur using reusable buffers
    this.applyGaussianBlur5x5InPlace(original, width, height);
    const blurred = this.clarityBlurResultBuffer!;

    // Use cached midtone mask
    const midtoneMask = this.getMidtoneMask();
    const effectScale = clarity * CLARITY_EFFECT_SCALE;

    for (let i = 0; i < len; i += 4) {
      const r = original[i]!;
      const g = original[i + 1]!;
      const b = original[i + 2]!;

      const blurredR = blurred[i]!;
      const blurredG = blurred[i + 1]!;
      const blurredB = blurred[i + 2]!;

      const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));
      const mask = midtoneMask[lumIndex]!;

      const highR = r - blurredR;
      const highG = g - blurredG;
      const highB = b - blurredB;

      const adjustedMask = mask * effectScale;
      data[i] = Math.max(0, Math.min(255, r + highR * adjustedMask));
      data[i + 1] = Math.max(0, Math.min(255, g + highG * adjustedMask));
      data[i + 2] = Math.max(0, Math.min(255, b + highB * adjustedMask));
    }
  }

  /**
   * Apply 5x5 Gaussian blur using pre-allocated buffers.
   * Result is written to this.clarityBlurResultBuffer.
   */
  private applyGaussianBlur5x5InPlace(data: Uint8ClampedArray, width: number, height: number): void {
    const result = this.clarityBlurResultBuffer!;
    const temp = this.clarityBlurTempBuffer!;

    const kernel = [1, 4, 6, 4, 1];

    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let weightSum = 0;

          for (let k = -2; k <= 2; k++) {
            const nx = Math.min(width - 1, Math.max(0, x + k));
            const nidx = (y * width + nx) * 4 + c;
            const weight = kernel[k + 2]!;
            sum += data[nidx]! * weight;
            weightSum += weight;
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
          let sum = 0;
          let weightSum = 0;

          for (let k = -2; k <= 2; k++) {
            const ny = Math.min(height - 1, Math.max(0, y + k));
            const nidx = (ny * width + x) * 4 + c;
            const weight = kernel[k + 2]!;
            sum += temp[nidx]! * weight;
            weightSum += weight;
          }

          result[idx + c] = sum / weightSum;
        }
        result[idx + 3] = temp[idx + 3]!;
      }
    }
  }

  /**
   * Apply color wheel adjustments to ImageData
   */
  private applyColorWheels(imageData: ImageData, state: ColorWheelsState): void {
    const data = imageData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      let r = data[i]! / 255;
      let g = data[i + 1]! / 255;
      let b = data[i + 2]! / 255;

      const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

      // Apply Master
      if (state.master.r !== 0 || state.master.g !== 0 ||
          state.master.b !== 0 || state.master.y !== 0) {
        r = r + state.master.r * COLOR_WHEEL_MASTER_FACTOR + state.master.y;
        g = g + state.master.g * COLOR_WHEEL_MASTER_FACTOR + state.master.y;
        b = b + state.master.b * COLOR_WHEEL_MASTER_FACTOR + state.master.y;
      }

      // Calculate zone weights
      const liftWeight = this.smoothstep(0.5, 0.33, luma) * this.smoothstep(0, 0.15, luma);
      const gammaWeight = this.bellCurve(luma, 0.5, 0.25);
      const gainWeight = this.smoothstep(0.5, 0.67, luma) * this.smoothstep(1.0, 0.85, luma);

      // Apply Lift (shadows)
      if (liftWeight > 0 && (state.lift.r !== 0 || state.lift.g !== 0 ||
          state.lift.b !== 0 || state.lift.y !== 0)) {
        r += (state.lift.r * COLOR_WHEEL_LIFT_FACTOR + state.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
        g += (state.lift.g * COLOR_WHEEL_LIFT_FACTOR + state.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
        b += (state.lift.b * COLOR_WHEEL_LIFT_FACTOR + state.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
      }

      // Apply Gamma (midtones)
      if (gammaWeight > 0 && (state.gamma.r !== 0 || state.gamma.g !== 0 ||
          state.gamma.b !== 0 || state.gamma.y !== 0)) {
        const gammaR = 1.0 - state.gamma.r * COLOR_WHEEL_GAMMA_FACTOR - state.gamma.y * COLOR_WHEEL_LIFT_FACTOR;
        const gammaG = 1.0 - state.gamma.g * COLOR_WHEEL_GAMMA_FACTOR - state.gamma.y * COLOR_WHEEL_LIFT_FACTOR;
        const gammaB = 1.0 - state.gamma.b * COLOR_WHEEL_GAMMA_FACTOR - state.gamma.y * COLOR_WHEEL_LIFT_FACTOR;

        // Use Math.max(0, x) to prevent NaN from negative values after master adjustment
        r = r * (1 - gammaWeight) + Math.pow(Math.max(0, r), gammaR) * gammaWeight;
        g = g * (1 - gammaWeight) + Math.pow(Math.max(0, g), gammaG) * gammaWeight;
        b = b * (1 - gammaWeight) + Math.pow(Math.max(0, b), gammaB) * gammaWeight;
      }

      // Apply Gain (highlights)
      if (gainWeight > 0 && (state.gain.r !== 0 || state.gain.g !== 0 ||
          state.gain.b !== 0 || state.gain.y !== 0)) {
        const gainR = 1.0 + state.gain.r * COLOR_WHEEL_GAIN_FACTOR + state.gain.y * COLOR_WHEEL_GAIN_FACTOR;
        const gainG = 1.0 + state.gain.g * COLOR_WHEEL_GAIN_FACTOR + state.gain.y * COLOR_WHEEL_GAIN_FACTOR;
        const gainB = 1.0 + state.gain.b * COLOR_WHEEL_GAIN_FACTOR + state.gain.y * COLOR_WHEEL_GAIN_FACTOR;

        r = r * (1 - gainWeight) + r * gainR * gainWeight;
        g = g * (1 - gainWeight) + g * gainG * gainWeight;
        b = b * (1 - gainWeight) + b * gainB * gainWeight;
      }

      data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    }
  }

  /**
   * Apply HSL Qualifier to ImageData
   */
  private applyHSLQualifier(imageData: ImageData, state: HSLQualifierState): void {
    if (!state.enabled) return;

    const data = imageData.data;
    const len = data.length;
    const { hue, saturation, luminance, correction, invert, mattePreview } = state;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      const { h, s, l } = this.rgbToHsl(r, g, b);

      let matte = this.calculateHSLMatte(h, s * 100, l * 100, hue, saturation, luminance);

      if (invert) {
        matte = 1 - matte;
      }

      if (mattePreview) {
        const gray = Math.round(matte * 255);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      } else if (matte > 0.001) {
        const correctedHsl = this.applyHSLCorrection(h, s, l, correction, matte);
        const corrected = this.hslToRgb(correctedHsl.h, correctedHsl.s, correctedHsl.l);

        data[i] = Math.round(corrected.r * 255);
        data[i + 1] = Math.round(corrected.g * 255);
        data[i + 2] = Math.round(corrected.b * 255);
      }
    }
  }

  /**
   * CPU-based sharpen filter
   */
  private applySharpenCPU(imageData: ImageData, width: number, height: number, amount: number): void {
    const data = imageData.data;
    const original = new Uint8ClampedArray(data);

    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let ki = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pidx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += original[pidx]! * kernel[ki]!;
              ki++;
            }
          }

          const originalValue = original[idx + c]!;
          const sharpenedValue = Math.max(0, Math.min(255, sum));
          data[idx + c] = Math.round(originalValue + (sharpenedValue - originalValue) * amount);
        }
      }
    }
  }

  // Helper functions - delegate to shared implementations to avoid duplication with worker

  private smoothstep(edge0: number, edge1: number, x: number): number {
    return sharedSmoothstep(edge0, edge1, x);
  }

  private bellCurve(x: number, center: number, width: number): number {
    return sharedBellCurve(x, center, width);
  }

  private hueToRgb(p: number, q: number, t: number): number {
    return sharedHueToRgb(p, q, t);
  }

  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    return sharedRgbToHsl(r, g, b);
  }

  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    return sharedHslToRgb(h, s, l);
  }

  private calculateHSLMatte(
    h: number,
    s: number,
    l: number,
    hueRange: { center: number; width: number; softness: number },
    satRange: { center: number; width: number; softness: number },
    lumRange: { center: number; width: number; softness: number }
  ): number {
    const hueMatch = this.calculateHueMatch(h, hueRange);
    const satMatch = this.calculateLinearMatch(s, satRange);
    const lumMatch = this.calculateLinearMatch(l, lumRange);
    return hueMatch * satMatch * lumMatch;
  }

  private calculateHueMatch(hue: number, range: { center: number; width: number; softness: number }): number {
    const { center, width, softness } = range;

    let distance = Math.abs(hue - center);
    if (distance > 180) {
      distance = 360 - distance;
    }

    const innerEdge = width / 2;
    const outerEdge = innerEdge + (softness * width) / 100;

    if (distance <= innerEdge) {
      return 1;
    } else if (distance >= outerEdge) {
      return 0;
    } else {
      return this.smoothstep(outerEdge, innerEdge, distance);
    }
  }

  private calculateLinearMatch(value: number, range: { center: number; width: number; softness: number }): number {
    const { center, width, softness } = range;

    const distance = Math.abs(value - center);
    const innerEdge = width / 2;
    const outerEdge = innerEdge + (softness * width) / 100;

    if (distance <= innerEdge) {
      return 1;
    } else if (distance >= outerEdge) {
      return 0;
    } else {
      return this.smoothstep(outerEdge, innerEdge, distance);
    }
  }

  private applyHSLCorrection(
    h: number,
    s: number,
    l: number,
    correction: { hueShift: number; saturationScale: number; luminanceScale: number },
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
}
