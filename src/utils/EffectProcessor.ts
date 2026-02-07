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
import { CDLValues, DEFAULT_CDL, isDefaultCDL } from '../color/CDL';
import { ColorCurvesData, createDefaultCurvesData, isDefaultCurves, CurveLUTCache, CurveChannel, CurveLUTs } from '../color/ColorCurves';
import { FilterSettings, DEFAULT_FILTER_SETTINGS } from '../ui/components/FilterControl';
import { ChannelMode } from '../ui/components/ChannelSelect';
import { isIdentityHueRotation } from '../color/HueRotation';
import { ColorWheelsState, DEFAULT_COLOR_WHEELS_STATE } from '../ui/components/ColorWheels';
import { HSLQualifierState, DEFAULT_HSL_QUALIFIER_STATE } from '../ui/components/HSLQualifier';
import { ToneMappingState, DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';

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
  applyToneMappingToChannel,
  getHueRotationMatrix,
  HALF_RES_MIN_DIMENSION,
  downsample2x,
  upsample2x,
  // SIMD-like optimizations
  applyColorInversionSIMD,
  applyChannelIsolationGrayscale,
  applyLuminanceIsolation,
} from './effectProcessing.shared';

/**
 * Yield to the main event loop to avoid blocking for too long.
 * Uses the modern scheduler.yield() API when available, falling back
 * to setTimeout(0) for broader compatibility.
 */
export function yieldToMain(): Promise<void> {
  if (
    'scheduler' in globalThis &&
    typeof (globalThis as Record<string, unknown>).scheduler === 'object' &&
    (globalThis as Record<string, unknown>).scheduler !== null &&
    'yield' in ((globalThis as Record<string, unknown>).scheduler as Record<string, unknown>)
  ) {
    return ((globalThis as Record<string, unknown>).scheduler as { yield: () => Promise<void> }).yield();
  }
  return new Promise(resolve => setTimeout(resolve, 0));
}

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
  toneMappingState: ToneMappingState;
  colorInversionEnabled: boolean;
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
    toneMappingState: { ...DEFAULT_TONE_MAPPING_STATE },
    colorInversionEnabled: false,
  };
}

/**
 * Compute a hash/fingerprint of the effects state for cache invalidation.
 * Uses direct numeric hashing (djb2) over all effect properties instead of
 * JSON.stringify, avoiding large temporary string allocations every frame.
 */
export function computeEffectsHash(state: AllEffectsState): string {
  let hash = 5381;

  // Hash helper for numbers - converts to fixed-point integer then mixes into hash
  const hashNum = (n: number): void => {
    const bits = (n * 1000000) | 0; // Fixed-point to integer
    hash = ((hash << 5) + hash + bits) | 0;
  };

  // Hash helper for booleans
  const hashBool = (b: boolean): void => {
    hash = ((hash << 5) + hash + (b ? 1 : 0)) | 0;
  };

  // Hash helper for strings (channel mode, tone mapping operator, etc.)
  const hashStr = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
    }
  };

  // Hash helper for a curve channel
  const hashCurveChannel = (ch: CurveChannel): void => {
    hashBool(ch.enabled);
    hashNum(ch.points.length);
    for (const p of ch.points) {
      hashNum(p.x);
      hashNum(p.y);
    }
  };

  // Color adjustments (all fields from ColorAdjustments interface)
  const ca = state.colorAdjustments;
  hashNum(ca.exposure);
  hashNum(ca.gamma);
  hashNum(ca.saturation);
  hashNum(ca.vibrance);
  hashBool(ca.vibranceSkinProtection);
  hashNum(ca.contrast);
  hashNum(ca.clarity);
  hashNum(ca.hueRotation);
  hashNum(ca.temperature);
  hashNum(ca.tint);
  hashNum(ca.brightness);
  hashNum(ca.highlights);
  hashNum(ca.shadows);
  hashNum(ca.whites);
  hashNum(ca.blacks);

  // CDL values
  const cdl = state.cdlValues;
  hashNum(cdl.slope.r); hashNum(cdl.slope.g); hashNum(cdl.slope.b);
  hashNum(cdl.offset.r); hashNum(cdl.offset.g); hashNum(cdl.offset.b);
  hashNum(cdl.power.r); hashNum(cdl.power.g); hashNum(cdl.power.b);
  hashNum(cdl.saturation);

  // Curves data
  hashCurveChannel(state.curvesData.master);
  hashCurveChannel(state.curvesData.red);
  hashCurveChannel(state.curvesData.green);
  hashCurveChannel(state.curvesData.blue);

  // Filter settings
  hashNum(state.filterSettings.blur);
  hashNum(state.filterSettings.sharpen);

  // Channel mode (string)
  hashStr(state.channelMode);

  // Color wheels
  const wheels = state.colorWheelsState;
  for (const wheel of [wheels.lift, wheels.gamma, wheels.gain, wheels.master] as const) {
    hashNum(wheel.r); hashNum(wheel.g); hashNum(wheel.b); hashNum(wheel.y);
  }
  hashBool(wheels.linked);

  // HSL qualifier
  const hsl = state.hslQualifierState;
  hashBool(hsl.enabled);
  // Hue range
  hashNum(hsl.hue.center); hashNum(hsl.hue.width); hashNum(hsl.hue.softness);
  // Saturation range
  hashNum(hsl.saturation.center); hashNum(hsl.saturation.width); hashNum(hsl.saturation.softness);
  // Luminance range
  hashNum(hsl.luminance.center); hashNum(hsl.luminance.width); hashNum(hsl.luminance.softness);
  // Correction
  hashNum(hsl.correction.hueShift);
  hashNum(hsl.correction.saturationScale);
  hashNum(hsl.correction.luminanceScale);
  hashBool(hsl.invert);
  hashBool(hsl.mattePreview);

  // Tone mapping
  const tm = state.toneMappingState;
  hashBool(tm.enabled);
  hashStr(tm.operator);
  hashNum(tm.reinhardWhitePoint ?? 4.0);
  hashNum(tm.filmicExposureBias ?? 2.0);
  hashNum(tm.filmicWhitePoint ?? 11.2);

  // Color inversion
  hashBool(state.colorInversionEnabled);

  return (hash >>> 0).toString(36);
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
  const hasHueRotation = !isIdentityHueRotation(state.colorAdjustments.hueRotation);
  const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
  const hasHSLQualifier = state.hslQualifierState.enabled;
  const hasToneMapping = state.toneMappingState.enabled && state.toneMappingState.operator !== 'off';
  const hasInversion = state.colorInversionEnabled;

  return hasCDL || hasCurves || hasSharpen || hasChannel ||
         hasHighlightsShadows || hasVibrance || hasClarity || hasHueRotation ||
         hasColorWheels || hasHSLQualifier || hasToneMapping || hasInversion;
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

  // Vibrance 3D LUT cache (static - shared across instances for same parameters)
  private static vibrance3DLUT: Float32Array | null = null;
  private static vibrance3DLUTParams: { vibrance: number; skinProtection: boolean } | null = null;
  static readonly VIBRANCE_LUT_SIZE = 32; // 32x32x32 = 32K entries

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
   * Get cached vibrance 3D LUT. Builds/rebuilds if parameters change.
   */
  static getVibrance3DLUT(vibrance: number, skinProtection: boolean): Float32Array {
    if (EffectProcessor.vibrance3DLUT && EffectProcessor.vibrance3DLUTParams &&
        EffectProcessor.vibrance3DLUTParams.vibrance === vibrance &&
        EffectProcessor.vibrance3DLUTParams.skinProtection === skinProtection) {
      return EffectProcessor.vibrance3DLUT;
    }

    const size = EffectProcessor.VIBRANCE_LUT_SIZE;
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
            outR = sharedHueToRgb(p, q, hNorm + 1/3);
            outG = sharedHueToRgb(p, q, hNorm);
            outB = sharedHueToRgb(p, q, hNorm - 1/3);
          }

          const idx = (ri * size * size + gi * size + bi) * 3;
          lut[idx] = outR;
          lut[idx + 1] = outG;
          lut[idx + 2] = outB;
        }
      }
    }

    EffectProcessor.vibrance3DLUT = lut;
    EffectProcessor.vibrance3DLUTParams = { vibrance, skinProtection };
    return lut;
  }

  /**
   * Apply all effects to ImageData in-place
   * This is the main entry point for effect processing.
   *
   * Uses a merged single-pass approach for all per-pixel effects,
   * keeping only clarity (5x5 Gaussian) and sharpen (3x3 convolution)
   * as separate passes due to their inter-pixel dependencies.
   */
  applyEffects(
    imageData: ImageData,
    width: number,
    height: number,
    state: AllEffectsState,
    halfRes = false
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
    const hasHueRotation = !isIdentityHueRotation(state.colorAdjustments.hueRotation);
    const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
    const hasHSLQualifier = state.hslQualifierState.enabled;
    const hasToneMapping = state.toneMappingState.enabled && state.toneMappingState.operator !== 'off';
    const hasInversion = state.colorInversionEnabled;

    // Check if any per-pixel effects are active
    const hasPerPixelEffects = hasHighlightsShadows || hasVibrance || hasHueRotation ||
      hasColorWheels || hasCDL || hasCurves || hasHSLQualifier || hasToneMapping ||
      hasInversion || hasChannel;

    // Early return if no pixel effects are active
    if (!hasPerPixelEffects && !hasSharpen && !hasClarity) {
      return;
    }

    // ---- SIMD fast-path: when only simple bitwise operations are needed ----
    // When the only active per-pixel effects are color inversion and/or channel
    // isolation (without clarity or sharpen), we can use optimized Uint32Array
    // operations that avoid the expensive per-pixel float conversion loop.
    const hasComplexEffects = hasHighlightsShadows || hasVibrance || hasHueRotation ||
      hasColorWheels || hasCDL || hasCurves || hasHSLQualifier || hasToneMapping;

    if (!hasComplexEffects && !hasClarity && !hasSharpen && (hasInversion || hasChannel)) {
      // Apply inversion first (step 9 in pipeline order)
      if (hasInversion) {
        applyColorInversionSIMD(imageData.data);
      }
      // Apply channel isolation (step 10 in pipeline order)
      if (hasChannel) {
        const channelMode = state.channelMode;
        if (channelMode === 'red' || channelMode === 'green' || channelMode === 'blue') {
          applyChannelIsolationGrayscale(imageData.data, channelMode);
        } else if (channelMode === 'luminance') {
          applyLuminanceIsolation(imageData.data);
        } else if (channelMode === 'alpha') {
          // Alpha isolation: show alpha as grayscale, set alpha to 255
          const data = imageData.data;
          const len = data.length;
          for (let i = 0; i < len; i += 4) {
            const a = data[i + 3]!;
            data[i] = a;
            data[i + 1] = a;
            data[i + 2] = a;
            data[i + 3] = 255;
          }
        }
      }
      return;
    }

    // Pass 1: Clarity (inter-pixel dependency - must be separate, applied first)
    if (hasClarity) {
      this.applyClarity(imageData, width, height, state.colorAdjustments, halfRes);
    }

    // Pass 2: All per-pixel effects merged into a single loop
    if (hasPerPixelEffects) {
      this.applyMergedPerPixelEffects(imageData, width, height, state);
    }

    // Pass 3: Sharpen (inter-pixel dependency - must be separate, applied last)
    if (hasSharpen) {
      this.applySharpenCPU(imageData, width, height, state.filterSettings.sharpen / 100, halfRes);
    }
  }

  /**
   * Async version of applyEffects that yields to the event loop between
   * effect passes. This keeps each blocking period under ~16ms, preventing
   * janky UI during paused frame updates, export rendering, or interactive
   * slider dragging on CPU fallback.
   *
   * Produces identical pixel output to the sync applyEffects().
   * Workers should continue using the sync version (no event loop to yield to).
   */
  async applyEffectsAsync(
    imageData: ImageData,
    width: number,
    height: number,
    state: AllEffectsState,
    halfRes = false
  ): Promise<void> {
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
    const hasHueRotation = !isIdentityHueRotation(state.colorAdjustments.hueRotation);
    const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
    const hasHSLQualifier = state.hslQualifierState.enabled;
    const hasToneMapping = state.toneMappingState.enabled && state.toneMappingState.operator !== 'off';
    const hasInversion = state.colorInversionEnabled;

    // Check if any per-pixel effects are active
    const hasPerPixelEffects = hasHighlightsShadows || hasVibrance || hasHueRotation ||
      hasColorWheels || hasCDL || hasCurves || hasHSLQualifier || hasToneMapping ||
      hasInversion || hasChannel;

    // Early return if no pixel effects are active
    if (!hasPerPixelEffects && !hasSharpen && !hasClarity) {
      return;
    }

    // ---- SIMD fast-path (same as sync version) ----
    const hasComplexEffects = hasHighlightsShadows || hasVibrance || hasHueRotation ||
      hasColorWheels || hasCDL || hasCurves || hasHSLQualifier || hasToneMapping;

    if (!hasComplexEffects && !hasClarity && !hasSharpen && (hasInversion || hasChannel)) {
      if (hasInversion) {
        applyColorInversionSIMD(imageData.data);
      }
      if (hasChannel) {
        const channelMode = state.channelMode;
        if (channelMode === 'red' || channelMode === 'green' || channelMode === 'blue') {
          applyChannelIsolationGrayscale(imageData.data, channelMode);
        } else if (channelMode === 'luminance') {
          applyLuminanceIsolation(imageData.data);
        } else if (channelMode === 'alpha') {
          const data = imageData.data;
          const len = data.length;
          for (let i = 0; i < len; i += 4) {
            const a = data[i + 3]!;
            data[i] = a;
            data[i + 1] = a;
            data[i + 2] = a;
            data[i + 3] = 255;
          }
        }
      }
      return;
    }

    // Pass 1: Clarity (inter-pixel dependency - most expensive, 5x5 blur)
    // Uses row-based chunking to keep individual blocking periods under ~16ms.
    if (hasClarity) {
      await this.applyClarityChunked(imageData, width, height, state.colorAdjustments, halfRes);
      await yieldToMain();
    }

    // Pass 2: All per-pixel effects merged into a single loop
    if (hasPerPixelEffects) {
      this.applyMergedPerPixelEffects(imageData, width, height, state);
      await yieldToMain();
    }

    // Pass 3: Sharpen (inter-pixel dependency - 3x3 kernel)
    // Uses row-based chunking to keep individual blocking periods under ~16ms.
    if (hasSharpen) {
      await this.applySharpenCPUChunked(imageData, width, height, state.filterSettings.sharpen / 100, halfRes);
      // No yield needed after last pass
    }
  }

  /**
   * Apply all per-pixel effects in a single merged loop.
   *
   * Effects are applied in this order (matching the original separate-pass order):
   * 1. Highlights/Shadows/Whites/Blacks
   * 2. Vibrance (using 3D LUT with trilinear interpolation)
   * 3. Hue Rotation (3x3 matrix multiply)
   * 4. Color Wheels (zone weighting: lift/gamma/gain)
   * 5. CDL (Slope/Offset/Power/Saturation)
   * 6. Curves (1D LUT lookup)
   * 7. HSL Qualifier (RGB->HSL matte + correction)
   * 8. Tone Mapping (Reinhard/Filmic/ACES per-channel)
   * 9. Color Inversion (1.0 - value)
   * 10. Channel Isolation (channel select)
   */
  private applyMergedPerPixelEffects(
    imageData: ImageData,
    _width: number,
    _height: number,
    state: AllEffectsState
  ): void {
    const data = imageData.data;
    const len = data.length;

    // ---- Pre-compute flags ----
    const ca = state.colorAdjustments;
    const hasHS = ca.highlights !== 0 || ca.shadows !== 0 ||
                  ca.whites !== 0 || ca.blacks !== 0;
    const hasVibrance = ca.vibrance !== 0;
    const hasHueRotation = !isIdentityHueRotation(ca.hueRotation);
    const hasColorWheels = hasColorWheelAdjustments(state.colorWheelsState);
    const hasCDL = !isDefaultCDL(state.cdlValues);
    const hasCurves = !isDefaultCurves(state.curvesData);
    const hasHSLQualifier = state.hslQualifierState.enabled;
    const hasToneMapping = state.toneMappingState.enabled && state.toneMappingState.operator !== 'off';
    const hasInversion = state.colorInversionEnabled;
    const hasChannelIsolation = state.channelMode !== 'rgb';

    // ---- Pre-compute values for highlights/shadows ----
    const highlights = ca.highlights / 100;
    const shadows = ca.shadows / 100;
    const whites = ca.whites / 100;
    const blacks = ca.blacks / 100;
    const hsLUTs = hasHS ? this.getHighlightShadowLUTs() : null;
    const whitePoint = hasHS ? 255 - whites * WHITES_BLACKS_RANGE : 0;
    const blackPoint = hasHS ? blacks * WHITES_BLACKS_RANGE : 0;
    const hasWhitesBlacks = whites !== 0 || blacks !== 0;
    const hsRange = hasWhitesBlacks ? whitePoint - blackPoint : 0;

    // ---- Pre-compute vibrance 3D LUT ----
    const vibrance3DLUT = hasVibrance ?
      EffectProcessor.getVibrance3DLUT(ca.vibrance, ca.vibranceSkinProtection) : null;
    const lutSize = EffectProcessor.VIBRANCE_LUT_SIZE;
    const lutScale = lutSize - 1;

    // ---- Pre-compute hue rotation matrix ----
    const hueMatrix = hasHueRotation ? getHueRotationMatrix(ca.hueRotation) : null;

    // ---- Pre-compute color wheels state ----
    const wheels = state.colorWheelsState;
    const hasMaster = hasColorWheels && (wheels.master.r !== 0 || wheels.master.g !== 0 ||
                      wheels.master.b !== 0 || wheels.master.y !== 0);
    const hasLift = hasColorWheels && (wheels.lift.r !== 0 || wheels.lift.g !== 0 ||
                    wheels.lift.b !== 0 || wheels.lift.y !== 0);
    const hasGamma = hasColorWheels && (wheels.gamma.r !== 0 || wheels.gamma.g !== 0 ||
                     wheels.gamma.b !== 0 || wheels.gamma.y !== 0);
    const hasGain = hasColorWheels && (wheels.gain.r !== 0 || wheels.gain.g !== 0 ||
                    wheels.gain.b !== 0 || wheels.gain.y !== 0);

    // Pre-compute gamma exponents (only if gamma wheel is active)
    const gammaR = hasGamma ? 1.0 - wheels.gamma.r * COLOR_WHEEL_GAMMA_FACTOR - wheels.gamma.y * COLOR_WHEEL_LIFT_FACTOR : 1.0;
    const gammaG = hasGamma ? 1.0 - wheels.gamma.g * COLOR_WHEEL_GAMMA_FACTOR - wheels.gamma.y * COLOR_WHEEL_LIFT_FACTOR : 1.0;
    const gammaB = hasGamma ? 1.0 - wheels.gamma.b * COLOR_WHEEL_GAMMA_FACTOR - wheels.gamma.y * COLOR_WHEEL_LIFT_FACTOR : 1.0;

    // Pre-compute gain multipliers
    const gainR = hasGain ? 1.0 + wheels.gain.r * COLOR_WHEEL_GAIN_FACTOR + wheels.gain.y * COLOR_WHEEL_GAIN_FACTOR : 1.0;
    const gainG = hasGain ? 1.0 + wheels.gain.g * COLOR_WHEEL_GAIN_FACTOR + wheels.gain.y * COLOR_WHEEL_GAIN_FACTOR : 1.0;
    const gainB = hasGain ? 1.0 + wheels.gain.b * COLOR_WHEEL_GAIN_FACTOR + wheels.gain.y * COLOR_WHEEL_GAIN_FACTOR : 1.0;

    // ---- Pre-compute CDL values ----
    const cdl = state.cdlValues;
    const cdlHasSat = hasCDL && cdl.saturation !== 1;

    // ---- Pre-compute curves LUTs ----
    const curvesLUTs: CurveLUTs | null = hasCurves ? this.curveLUTCache.getLUTs(state.curvesData) : null;

    // ---- Pre-compute HSL qualifier state ----
    const hslState = state.hslQualifierState;

    // ---- Pre-compute tone mapping params ----
    const tmOperator = hasToneMapping ? state.toneMappingState.operator : '';
    const tmParams = hasToneMapping ? {
      reinhardWhitePoint: state.toneMappingState.reinhardWhitePoint,
      filmicExposureBias: state.toneMappingState.filmicExposureBias,
      filmicWhitePoint: state.toneMappingState.filmicWhitePoint,
    } : undefined;

    // ---- Pre-compute channel mode ----
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
        // Work in 0-255 range for compatibility with LUT indices
        let r255 = r * 255;
        let g255 = g * 255;
        let b255 = b * 255;

        // Apply whites/blacks clipping first
        if (hasWhitesBlacks && hsRange > 0) {
          r255 = Math.max(0, Math.min(255, ((r255 - blackPoint) / hsRange) * 255));
          g255 = Math.max(0, Math.min(255, ((g255 - blackPoint) / hsRange) * 255));
          b255 = Math.max(0, Math.min(255, ((b255 - blackPoint) / hsRange) * 255));
        }

        const lum = LUMA_R * r255 + LUMA_G * g255 + LUMA_B * b255;
        const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));

        if (highlights !== 0) {
          const highlightAdjust = highlights * hsLUTs!.highlightLUT[lumIndex]! * HIGHLIGHT_SHADOW_RANGE;
          r255 = Math.max(0, Math.min(255, r255 - highlightAdjust));
          g255 = Math.max(0, Math.min(255, g255 - highlightAdjust));
          b255 = Math.max(0, Math.min(255, b255 - highlightAdjust));
        }

        if (shadows !== 0) {
          const shadowAdjust = shadows * hsLUTs!.shadowLUT[lumIndex]! * HIGHLIGHT_SHADOW_RANGE;
          r255 = Math.max(0, Math.min(255, r255 + shadowAdjust));
          g255 = Math.max(0, Math.min(255, g255 + shadowAdjust));
          b255 = Math.max(0, Math.min(255, b255 + shadowAdjust));
        }

        r = r255 / 255;
        g = g255 / 255;
        b = b255 / 255;
      }

      // ---- 2. Vibrance (3D LUT with trilinear interpolation) ----
      if (hasVibrance && vibrance3DLUT) {
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

        // 8 corner indices
        const c000 = (ir0 * lutSize * lutSize + ig0 * lutSize + ib0) * 3;
        const c001 = (ir0 * lutSize * lutSize + ig0 * lutSize + ib1) * 3;
        const c010 = (ir0 * lutSize * lutSize + ig1 * lutSize + ib0) * 3;
        const c011 = (ir0 * lutSize * lutSize + ig1 * lutSize + ib1) * 3;
        const c100 = (ir1 * lutSize * lutSize + ig0 * lutSize + ib0) * 3;
        const c101 = (ir1 * lutSize * lutSize + ig0 * lutSize + ib1) * 3;
        const c110 = (ir1 * lutSize * lutSize + ig1 * lutSize + ib0) * 3;
        const c111 = (ir1 * lutSize * lutSize + ig1 * lutSize + ib1) * 3;

        // Trilinear interpolation for each channel
        for (let ch = 0; ch < 3; ch++) {
          const v00 = vibrance3DLUT[c000 + ch]! * (1 - db) + vibrance3DLUT[c001 + ch]! * db;
          const v01 = vibrance3DLUT[c010 + ch]! * (1 - db) + vibrance3DLUT[c011 + ch]! * db;
          const v10 = vibrance3DLUT[c100 + ch]! * (1 - db) + vibrance3DLUT[c101 + ch]! * db;
          const v11 = vibrance3DLUT[c110 + ch]! * (1 - db) + vibrance3DLUT[c111 + ch]! * db;
          const v0 = v00 * (1 - dg) + v01 * dg;
          const v1 = v10 * (1 - dg) + v11 * dg;
          const result = v0 * (1 - dr) + v1 * dr;
          if (ch === 0) r = result;
          else if (ch === 1) g = result;
          else b = result;
        }
      }

      // ---- 3. Hue Rotation (3x3 matrix multiply) ----
      if (hasHueRotation && hueMatrix) {
        // hueMatrix is column-major: mat[0]=m00, mat[1]=m10, mat[2]=m20, etc.
        const nr = hueMatrix[0]! * r + hueMatrix[3]! * g + hueMatrix[6]! * b;
        const ng = hueMatrix[1]! * r + hueMatrix[4]! * g + hueMatrix[7]! * b;
        const nb = hueMatrix[2]! * r + hueMatrix[5]! * g + hueMatrix[8]! * b;
        r = Math.max(0, Math.min(1, nr));
        g = Math.max(0, Math.min(1, ng));
        b = Math.max(0, Math.min(1, nb));
      }

      // ---- 4. Color Wheels (zone weighting) ----
      if (hasColorWheels) {
        const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;

        // Apply Master
        if (hasMaster) {
          r = r + wheels.master.r * COLOR_WHEEL_MASTER_FACTOR + wheels.master.y;
          g = g + wheels.master.g * COLOR_WHEEL_MASTER_FACTOR + wheels.master.y;
          b = b + wheels.master.b * COLOR_WHEEL_MASTER_FACTOR + wheels.master.y;
        }

        // Calculate zone weights
        const liftWeight = sharedSmoothstep(0.5, 0.33, luma) * sharedSmoothstep(0, 0.15, luma);
        const gammaWeight = sharedBellCurve(luma, 0.5, 0.25);
        const gainWeight = sharedSmoothstep(0.5, 0.67, luma) * sharedSmoothstep(1.0, 0.85, luma);

        // Apply Lift (shadows)
        if (hasLift && liftWeight > 0) {
          r += (wheels.lift.r * COLOR_WHEEL_LIFT_FACTOR + wheels.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
          g += (wheels.lift.g * COLOR_WHEEL_LIFT_FACTOR + wheels.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
          b += (wheels.lift.b * COLOR_WHEEL_LIFT_FACTOR + wheels.lift.y * COLOR_WHEEL_LIFT_FACTOR) * liftWeight;
        }

        // Apply Gamma (midtones)
        if (hasGamma && gammaWeight > 0) {
          r = r * (1 - gammaWeight) + Math.pow(Math.max(0, r), gammaR) * gammaWeight;
          g = g * (1 - gammaWeight) + Math.pow(Math.max(0, g), gammaG) * gammaWeight;
          b = b * (1 - gammaWeight) + Math.pow(Math.max(0, b), gammaB) * gammaWeight;
        }

        // Apply Gain (highlights)
        if (hasGain && gainWeight > 0) {
          r = r * (1 - gainWeight) + r * gainR * gainWeight;
          g = g * (1 - gainWeight) + g * gainG * gainWeight;
          b = b * (1 - gainWeight) + b * gainB * gainWeight;
        }
      }

      // ---- 5. CDL (Slope/Offset/Power/Saturation) ----
      if (hasCDL) {
        // CDL formula: out = clamp(max(0, in * slope + offset) ^ power)
        r = Math.max(0, Math.min(1, r * cdl.slope.r + cdl.offset.r));
        g = Math.max(0, Math.min(1, g * cdl.slope.g + cdl.offset.g));
        b = Math.max(0, Math.min(1, b * cdl.slope.b + cdl.offset.b));

        if (cdl.power.r !== 1.0 && r > 0) r = Math.pow(r, cdl.power.r);
        if (cdl.power.g !== 1.0 && g > 0) g = Math.pow(g, cdl.power.g);
        if (cdl.power.b !== 1.0 && b > 0) b = Math.pow(b, cdl.power.b);

        r = Math.max(0, Math.min(1, r));
        g = Math.max(0, Math.min(1, g));
        b = Math.max(0, Math.min(1, b));

        // Saturation adjustment
        if (cdlHasSat) {
          const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
          r = luma + (r - luma) * cdl.saturation;
          g = luma + (g - luma) * cdl.saturation;
          b = luma + (b - luma) * cdl.saturation;
        }
      }

      // ---- 6. Curves (1D LUT lookup) ----
      if (hasCurves && curvesLUTs) {
        // Convert to 0-255 for LUT lookup
        let ri = Math.round(Math.min(255, Math.max(0, r * 255)));
        let gi = Math.round(Math.min(255, Math.max(0, g * 255)));
        let bi = Math.round(Math.min(255, Math.max(0, b * 255)));

        // Apply channel-specific curves first, then master
        ri = curvesLUTs.red[ri]!;
        gi = curvesLUTs.green[gi]!;
        bi = curvesLUTs.blue[bi]!;

        ri = curvesLUTs.master[ri]!;
        gi = curvesLUTs.master[gi]!;
        bi = curvesLUTs.master[bi]!;

        r = ri / 255;
        g = gi / 255;
        b = bi / 255;
      }

      // ---- 7. HSL Qualifier ----
      if (hasHSLQualifier) {
        const hsl = sharedRgbToHsl(r, g, b);

        let matte = this.calculateHSLMatte(
          hsl.h, hsl.s * 100, hsl.l * 100,
          hslState.hue, hslState.saturation, hslState.luminance
        );

        if (hslState.invert) {
          matte = 1 - matte;
        }

        if (hslState.mattePreview) {
          r = g = b = matte;
        } else if (matte > 0.001) {
          const correctedHsl = this.applyHSLCorrection(
            hsl.h, hsl.s, hsl.l, hslState.correction, matte
          );
          const corrected = sharedHslToRgb(correctedHsl.h, correctedHsl.s, correctedHsl.l);
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
            // Alpha channel isolation: show alpha as grayscale
            const a = data[i + 3]! / 255;
            r = g = b = a;
            data[i + 3] = 255; // Make fully opaque
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
   *
   * When halfRes is true and the image is large enough (> HALF_RES_MIN_DIMENSION),
   * processes at half resolution for ~4x speedup with minimal quality loss.
   */
  private applyClarity(imageData: ImageData, width: number, height: number, colorAdjustments: ColorAdjustments, halfRes = false): void {
    // Half-resolution path: downsample, apply clarity at half-res, blend result
    if (halfRes && width > HALF_RES_MIN_DIMENSION && height > HALF_RES_MIN_DIMENSION) {
      this.applyClarityHalfRes(imageData, width, height, colorAdjustments);
      return;
    }

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
   * Half-resolution clarity: downsample, compute blur at half-res,
   * upsample the blurred result, then apply high-pass blend at full-res.
   * This gives ~4x speedup for the expensive Gaussian blur pass.
   */
  private applyClarityHalfRes(imageData: ImageData, width: number, height: number, colorAdjustments: ColorAdjustments): void {
    const data = imageData.data;
    const clarity = colorAdjustments.clarity / 100;
    const len = data.length;

    // Downsample to half resolution
    const half = downsample2x(data, width, height);
    const halfW = half.width;
    const halfH = half.height;
    const halfLen = half.data.length;

    // Ensure clarity buffers are sized for half-res
    this.ensureClarityBuffers(halfLen);
    const halfOriginal = this.clarityOriginalBuffer!;
    halfOriginal.set(half.data);

    // Apply Gaussian blur at half resolution (much faster, ~4x fewer pixels)
    this.applyGaussianBlur5x5InPlace(halfOriginal, halfW, halfH);
    const halfBlurred = this.clarityBlurResultBuffer!;

    // Upsample the blurred result back to full resolution
    const upsampled = upsample2x(halfBlurred, halfW, halfH, width, height);

    // Use cached midtone mask
    const midtoneMask = this.getMidtoneMask();
    const effectScale = clarity * CLARITY_EFFECT_SCALE;

    // Apply high-pass blend at full resolution: original + (original - upsampled_blur) * mask
    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      const blurredR = upsampled[i]!;
      const blurredG = upsampled[i + 1]!;
      const blurredB = upsampled[i + 2]!;

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
   * CPU-based sharpen filter.
   *
   * When halfRes is true and the image is large enough (> HALF_RES_MIN_DIMENSION),
   * processes at half resolution for ~4x speedup. The sharpened detail is upsampled
   * and blended with the original at full resolution.
   */
  private applySharpenCPU(imageData: ImageData, width: number, height: number, amount: number, halfRes = false): void {
    // Half-resolution path
    if (halfRes && width > HALF_RES_MIN_DIMENSION && height > HALF_RES_MIN_DIMENSION) {
      this.applySharpenHalfRes(imageData, width, height, amount);
      return;
    }

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

  /**
   * Half-resolution sharpen: downsample, apply sharpen at half-res,
   * upsample the result, then blend with original at full-res.
   * This gives ~4x speedup for the expensive convolution pass.
   */
  private applySharpenHalfRes(imageData: ImageData, width: number, height: number, amount: number): void {
    const data = imageData.data;
    const len = data.length;

    // Downsample to half resolution
    const half = downsample2x(data, width, height);
    const halfW = half.width;
    const halfH = half.height;

    // Apply sharpen kernel at half-res
    const halfOriginal = new Uint8ClampedArray(half.data);
    const halfData = half.data;

    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    for (let y = 1; y < halfH - 1; y++) {
      for (let x = 1; x < halfW - 1; x++) {
        const idx = (y * halfW + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let ki = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pidx = ((y + ky) * halfW + (x + kx)) * 4 + c;
              sum += halfOriginal[pidx]! * kernel[ki]!;
              ki++;
            }
          }

          const originalValue = halfOriginal[idx + c]!;
          const sharpenedValue = Math.max(0, Math.min(255, sum));
          halfData[idx + c] = Math.round(originalValue + (sharpenedValue - originalValue) * amount);
        }
      }
    }

    // Upsample the sharpened half-res back to full resolution
    const upsampled = upsample2x(halfData, halfW, halfH, width, height);

    // Copy upsampled result to output, preserving alpha
    for (let i = 0; i < len; i += 4) {
      data[i] = upsampled[i]!;
      data[i + 1] = upsampled[i + 1]!;
      data[i + 2] = upsampled[i + 2]!;
      // Alpha unchanged
    }
  }

  /**
   * Number of rows to process per chunk in the async (chunked) clarity/sharpen path.
   * Chosen to keep each chunk under ~16ms for 1080p images (~128 rows at 1920px wide).
   */
  static readonly CHUNK_ROWS = 128;

  /**
   * Async chunked version of applyClarity.
   * Runs the Gaussian blur synchronously (it uses pre-allocated buffers and is a
   * separable two-pass filter that needs the full image), then processes the
   * high-pass blend step in row-based chunks, yielding between chunks.
   *
   * Produces identical pixel output to the sync applyClarity().
   */
  private async applyClarityChunked(
    imageData: ImageData,
    width: number,
    height: number,
    colorAdjustments: ColorAdjustments,
    halfRes = false
  ): Promise<void> {
    // For half-res or small images, fall back to the sync version (fast enough)
    if (halfRes && width > HALF_RES_MIN_DIMENSION && height > HALF_RES_MIN_DIMENSION) {
      this.applyClarityHalfRes(imageData, width, height, colorAdjustments);
      return;
    }

    const data = imageData.data;
    const clarity = colorAdjustments.clarity / 100;
    const len = data.length;

    // Ensure buffers are the right size (reuses if already correct)
    this.ensureClarityBuffers(len);
    const original = this.clarityOriginalBuffer!;
    original.set(data);

    // Apply blur using reusable buffers (synchronous - needs full image)
    this.applyGaussianBlur5x5InPlace(original, width, height);
    const blurred = this.clarityBlurResultBuffer!;

    // Use cached midtone mask
    const midtoneMask = this.getMidtoneMask();
    const effectScale = clarity * CLARITY_EFFECT_SCALE;

    // Process the high-pass blend in row-based chunks
    const chunkRows = EffectProcessor.CHUNK_ROWS;
    for (let startRow = 0; startRow < height; startRow += chunkRows) {
      const endRow = Math.min(startRow + chunkRows, height);
      const startIdx = startRow * width * 4;
      const endIdx = endRow * width * 4;

      for (let i = startIdx; i < endIdx; i += 4) {
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

      // Yield between chunks (but not after the last chunk)
      if (endRow < height) {
        await yieldToMain();
      }
    }
  }

  /**
   * Async chunked version of applySharpenCPU.
   * Copies the original image data, then processes the 3x3 sharpen convolution
   * in row-based chunks, yielding between chunks.
   *
   * Produces identical pixel output to the sync applySharpenCPU().
   */
  private async applySharpenCPUChunked(
    imageData: ImageData,
    width: number,
    height: number,
    amount: number,
    halfRes = false
  ): Promise<void> {
    // For half-res, fall back to the sync version (already fast enough)
    if (halfRes && width > HALF_RES_MIN_DIMENSION && height > HALF_RES_MIN_DIMENSION) {
      this.applySharpenHalfRes(imageData, width, height, amount);
      return;
    }

    const data = imageData.data;
    const original = new Uint8ClampedArray(data);

    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    // Process in row-based chunks (skip first and last rows as they have no neighbors)
    const chunkRows = EffectProcessor.CHUNK_ROWS;
    for (let startRow = 1; startRow < height - 1; startRow += chunkRows) {
      const endRow = Math.min(startRow + chunkRows, height - 1);

      for (let y = startRow; y < endRow; y++) {
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

      // Yield between chunks (but not after the last chunk)
      if (endRow < height - 1) {
        await yieldToMain();
      }
    }
  }

  // Helper functions - delegate to shared implementations to avoid duplication with worker

  private smoothstep(edge0: number, edge1: number, x: number): number {
    return sharedSmoothstep(edge0, edge1, x);
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
