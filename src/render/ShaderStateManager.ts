/**
 * ShaderStateManager - Centralized shader state and dirty-flag management.
 *
 * Owns the RenderState and dirty flags that were previously scattered across
 * ~86 private fields on the Renderer class. Provides:
 *
 * - `setState(partial)` — merge partial state and mark appropriate dirty flags
 * - `applyUniforms(shader, gl, canvas)` — push only dirty uniforms to the GPU,
 *   then clear the flags
 *
 * The Renderer class delegates all state storage and uniform upload to this
 * manager while keeping GPU resource management (textures, VAO, shaders) itself.
 */

import type { ManagerBase } from '../core/ManagerBase';
import type { ShaderProgram } from './ShaderProgram';
import type { ColorPrimaries } from '../core/image/Image';
import type {
  ColorAdjustments,
  ColorWheelsState,
  ChannelMode,
  HSLQualifierState,
  LinearizeState,
  ChannelSwizzle,
} from '../core/types/color';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../core/types/color';
import type {
  ToneMappingState,
  ZebraState,
  HighlightsShadowsState,
  VibranceState,
  ClarityState,
  SharpenState,
  FalseColorState,
  GamutMappingState,
  GamutIdentifier,
} from '../core/types/effects';
import { DEFAULT_TONE_MAPPING_STATE, DEFAULT_GAMUT_MAPPING_STATE } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import { PATTERN_COLORS } from '../core/types/background';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState, DisplayColorConfig } from './RenderState';
import { LUT_1D_SIZE, RGBA_CHANNELS } from '../config/RenderConfig';
import type { StateAccessor, CurvesLUTSnapshot, FalseColorLUTSnapshot, LUT3DSnapshot } from './StateAccessor';

// Re-export from extracted modules for backward compatibility
export {
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
  ALL_DIRTY_FLAGS,
  TONE_MAPPING_OPERATOR_CODES,
  BG_PATTERN_NONE,
  BG_PATTERN_SOLID,
  BG_PATTERN_CHECKER,
  BG_PATTERN_CROSSHATCH,
  CHANNEL_MODE_CODES,
  GAMUT_CODES,
  GAMUT_MODE_CODES,
  COLOR_PRIMARIES_MATRICES,
  DEFAULT_ZEBRA_HIGH_THRESHOLD,
  DEFAULT_ZEBRA_LOW_THRESHOLD,
  DEFAULT_CHECKER_SIZE,
} from './ShaderConstants';

export type { InternalShaderState, TextureCallbacks } from './ShaderStateTypes';
export { createDefaultInternalState } from './ShaderStateTypes';

import {
  ALL_DIRTY_FLAGS,
  DIRTY_COLOR,
  DIRTY_TONE_MAPPING,
  DIRTY_CDL,
  DIRTY_COLOR_WHEELS,
  DIRTY_CURVES,
  DIRTY_FALSE_COLOR,
  DIRTY_ZEBRA,
  DIRTY_CHANNELS,
  DIRTY_LUT3D,
  DIRTY_FILE_LUT3D,
  DIRTY_DISPLAY_LUT3D,
  DIRTY_DISPLAY,
  DIRTY_HIGHLIGHTS_SHADOWS,
  DIRTY_VIBRANCE,
  DIRTY_CLARITY,
  DIRTY_SHARPEN,
  DIRTY_HSL,
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
  DIRTY_INVERSION,
  DIRTY_BACKGROUND,
  BG_PATTERN_NONE,
  BG_PATTERN_SOLID,
  BG_PATTERN_CHECKER,
  BG_PATTERN_CROSSHATCH,
  CHANNEL_MODE_CODES,
  GAMUT_CODES,
  GAMUT_MODE_CODES,
  COLOR_PRIMARIES_MATRICES,
  DEFAULT_CHECKER_SIZE,
} from './ShaderConstants';

import type { InternalShaderState, TextureCallbacks } from './ShaderStateTypes';
import {
  createDefaultInternalState,
  hexToRgbInto,
  assignColorAdjustments,
  assignToneMappingState,
} from './ShaderStateTypes';

import { applyUniforms as applyUniformsFn } from './ShaderUniformUploader';
import type { UniformBuffers } from './ShaderUniformUploader';
import { applyRenderState as applyRenderStateFn } from './ShaderBatchApplicator';

// ---------------------------------------------------------------------------
// ShaderStateManager
// ---------------------------------------------------------------------------

export class ShaderStateManager implements ManagerBase, StateAccessor {
  /** Dirty-flag tracking: only update uniforms whose values have changed */
  private dirtyFlags: Set<string> = new Set(ALL_DIRTY_FLAGS);

  /** Internal flattened state */
  private state: InternalShaderState = createDefaultInternalState();

  /** Pre-allocated temp buffer for curves LUT packing */
  private curvesLUTBuffer: Uint8Array | null = null;

  // --- Cached snapshot objects (avoid per-render allocations) ---
  private cachedCurvesSnapshot: CurvesLUTSnapshot | null = null;
  private cachedFalseColorSnapshot: FalseColorLUTSnapshot | null = null;
  private cachedLUT3DSnapshot: LUT3DSnapshot | null = null;
  private cachedFileLUT3DSnapshot: LUT3DSnapshot | null = null;
  private cachedDisplayLUT3DSnapshot: LUT3DSnapshot | null = null;

  // --- Cached getter copies (invalidated on change) ---
  private cachedColorAdjustments: ColorAdjustments | null = null;
  private cachedToneMappingState: ToneMappingState | null = null;

  /** Pre-allocated uniform buffers (passed to applyUniforms) */
  private readonly uniformBuffers: UniformBuffers = {
    resolutionBuffer: [0, 0],
    exposureRGBBuffer: [0, 0, 0],
    gammaRGBBuffer: [0, 0, 0],
    contrastRGBBuffer: [0, 0, 0],
    safeGammaRGBBuffer: [0, 0, 0],
    safeExposureRGBBuffer: [0, 0, 0],
    scaleRGBBuffer: [0, 0, 0],
    offsetRGBBuffer: [0, 0, 0],
    channelSwizzleBuffer: new Int32Array(4),
  };

  /**
   * Texture unit bindings (u_curvesLUT=1, u_falseColorLUT=2, etc.) are constant
   * after the first frame. We only set them once, then skip on subsequent frames.
   * Reset on context restore (markAllDirty) so they are re-sent after a new GL context.
   */
  private _textureUnitsInitialized = false;

  // -----------------------------------------------------------------------
  // Public accessors
  // -----------------------------------------------------------------------

  /** Get current dirty flags (read-only intent; prefer clearDirtyFlag() for removal). */
  getDirtyFlags(): ReadonlySet<string> {
    return this.dirtyFlags;
  }

  /** Remove a single dirty flag (e.g. when batch applicator determines no change). */
  clearDirtyFlag(flag: string): void {
    this.dirtyFlags.delete(flag);
  }

  /** Mark all flags dirty (e.g. after context restore). */
  markAllDirty(): void {
    for (const flag of ALL_DIRTY_FLAGS) {
      this.dirtyFlags.add(flag);
    }
    this._textureUnitsInitialized = false;
  }

  /** True if any setter has marked dirty flags not yet consumed by applyUniforms(). */
  hasPendingStateChanges(): boolean {
    return this.dirtyFlags.size > 0;
  }

  // -----------------------------------------------------------------------
  // State getters (for Renderer's public getters)
  // -----------------------------------------------------------------------

  getColorAdjustments(): ColorAdjustments {
    if (!this.cachedColorAdjustments) {
      this.cachedColorAdjustments = { ...this.state.colorAdjustments };
    }
    return this.cachedColorAdjustments;
  }

  getColorInversion(): boolean {
    return this.state.colorInversionEnabled;
  }

  getToneMappingState(): ToneMappingState {
    if (!this.cachedToneMappingState) {
      this.cachedToneMappingState = { ...this.state.toneMappingState };
    }
    return this.cachedToneMappingState;
  }

  /** Direct access to internal state (read-only intent). */
  getInternalState(): Readonly<InternalShaderState> {
    return this.state;
  }

  /**
   * Clear a texture-specific dirty flag after the Renderer has uploaded
   * the corresponding texture data to the GPU.
   */
  clearTextureDirtyFlag(
    flag:
      | 'curvesLUTDirty'
      | 'falseColorLUTDirty'
      | 'lut3DDirty'
      | 'filmLUTDirty'
      | 'inlineLUTDirty'
      | 'fileLUT3DDirty'
      | 'displayLUT3DDirty',
  ): void {
    this.state[flag] = false;
    if (flag === 'curvesLUTDirty') {
      this.cachedCurvesSnapshot = null;
    } else if (flag === 'falseColorLUTDirty') {
      this.cachedFalseColorSnapshot = null;
    } else if (flag === 'lut3DDirty') {
      this.cachedLUT3DSnapshot = null;
    } else if (flag === 'fileLUT3DDirty') {
      this.cachedFileLUT3DSnapshot = null;
    } else if (flag === 'displayLUT3DDirty') {
      this.cachedDisplayLUT3DSnapshot = null;
    }
  }

  // -----------------------------------------------------------------------
  // Texture data snapshots (StateAccessor interface)
  // -----------------------------------------------------------------------

  getCurvesLUTSnapshot(): CurvesLUTSnapshot {
    if (!this.cachedCurvesSnapshot) {
      this.cachedCurvesSnapshot = {
        dirty: this.state.curvesLUTDirty,
        data: this.state.curvesLUTData,
      };
    }
    return this.cachedCurvesSnapshot;
  }

  getFalseColorLUTSnapshot(): FalseColorLUTSnapshot {
    if (!this.cachedFalseColorSnapshot) {
      this.cachedFalseColorSnapshot = {
        dirty: this.state.falseColorLUTDirty,
        data: this.state.falseColorLUTData,
      };
    }
    return this.cachedFalseColorSnapshot;
  }

  getLUT3DSnapshot(): LUT3DSnapshot {
    if (!this.cachedLUT3DSnapshot) {
      this.cachedLUT3DSnapshot = {
        dirty: this.state.lut3DDirty,
        data: this.state.lut3DData,
        size: this.state.lut3DSize,
      };
    }
    return this.cachedLUT3DSnapshot;
  }

  getFileLUT3DSnapshot(): LUT3DSnapshot {
    if (!this.cachedFileLUT3DSnapshot) {
      this.cachedFileLUT3DSnapshot = {
        dirty: this.state.fileLUT3DDirty,
        data: this.state.fileLUT3DData,
        size: this.state.fileLUT3DSize,
      };
    }
    return this.cachedFileLUT3DSnapshot;
  }

  getDisplayLUT3DSnapshot(): LUT3DSnapshot {
    if (!this.cachedDisplayLUT3DSnapshot) {
      this.cachedDisplayLUT3DSnapshot = {
        dirty: this.state.displayLUT3DDirty,
        data: this.state.displayLUT3DData,
        size: this.state.displayLUT3DSize,
      };
    }
    return this.cachedDisplayLUT3DSnapshot;
  }

  // -----------------------------------------------------------------------
  // Individual setters (mirror the Renderer public API)
  // -----------------------------------------------------------------------

  setColorAdjustments(adjustments: ColorAdjustments): void {
    assignColorAdjustments(this.state.colorAdjustments, adjustments);
    this.cachedColorAdjustments = null;
    this.dirtyFlags.add(DIRTY_COLOR);
  }

  resetColorAdjustments(): void {
    assignColorAdjustments(this.state.colorAdjustments, DEFAULT_COLOR_ADJUSTMENTS);
    this.cachedColorAdjustments = null;
    this.dirtyFlags.add(DIRTY_COLOR);
  }

  setColorInversion(enabled: boolean): void {
    this.state.colorInversionEnabled = enabled;
    this.dirtyFlags.add(DIRTY_INVERSION);
  }

  setToneMappingState(tmState: ToneMappingState): void {
    assignToneMappingState(this.state.toneMappingState, tmState);
    this.cachedToneMappingState = null;
    this.dirtyFlags.add(DIRTY_TONE_MAPPING);
  }

  resetToneMappingState(): void {
    assignToneMappingState(this.state.toneMappingState, DEFAULT_TONE_MAPPING_STATE);
    this.cachedToneMappingState = null;
    this.dirtyFlags.add(DIRTY_TONE_MAPPING);
  }

  setBackgroundPattern(bgState: BackgroundPatternState): void {
    this.dirtyFlags.add(DIRTY_BACKGROUND);
    const pattern = bgState.pattern;
    if (pattern === 'black') {
      this.state.bgPatternCode = BG_PATTERN_NONE;
      return;
    }

    const checkerSizes: Record<string, number> = { small: 8, medium: DEFAULT_CHECKER_SIZE, large: 32 };

    if (pattern === 'checker') {
      this.state.bgPatternCode = BG_PATTERN_CHECKER;
      hexToRgbInto(PATTERN_COLORS.checkerLight!, this.state.bgColor1);
      hexToRgbInto(PATTERN_COLORS.checkerDark!, this.state.bgColor2);
      this.state.bgCheckerSize = checkerSizes[bgState.checkerSize] ?? DEFAULT_CHECKER_SIZE;
    } else if (pattern === 'crosshatch') {
      this.state.bgPatternCode = BG_PATTERN_CROSSHATCH;
      hexToRgbInto(PATTERN_COLORS.crosshatchBg!, this.state.bgColor1);
      hexToRgbInto(PATTERN_COLORS.crosshatchLine!, this.state.bgColor2);
    } else if (pattern === 'custom') {
      this.state.bgPatternCode = BG_PATTERN_SOLID;
      hexToRgbInto(bgState.customColor, this.state.bgColor1);
    } else {
      this.state.bgPatternCode = BG_PATTERN_SOLID;
      const color = PATTERN_COLORS[pattern];
      if (color) {
        hexToRgbInto(color, this.state.bgColor1);
      } else {
        this.state.bgColor1[0] = 0;
        this.state.bgColor1[1] = 0;
        this.state.bgColor1[2] = 0;
      }
    }
  }

  setCDL(cdl: CDLValues): void {
    const isDefault =
      cdl.slope.r === 1 &&
      cdl.slope.g === 1 &&
      cdl.slope.b === 1 &&
      cdl.offset.r === 0 &&
      cdl.offset.g === 0 &&
      cdl.offset.b === 0 &&
      cdl.power.r === 1 &&
      cdl.power.g === 1 &&
      cdl.power.b === 1 &&
      cdl.saturation === 1;
    this.state.cdlEnabled = !isDefault;
    const slope = this.state.cdlSlope;
    slope[0] = cdl.slope.r;
    slope[1] = cdl.slope.g;
    slope[2] = cdl.slope.b;
    const offset = this.state.cdlOffset;
    offset[0] = cdl.offset.r;
    offset[1] = cdl.offset.g;
    offset[2] = cdl.offset.b;
    const power = this.state.cdlPower;
    power[0] = cdl.power.r;
    power[1] = cdl.power.g;
    power[2] = cdl.power.b;
    this.state.cdlSaturation = cdl.saturation;
    this.dirtyFlags.add(DIRTY_CDL);
  }

  setCDLColorspace(colorspace: number): void {
    this.state.cdlColorspace = colorspace;
    this.dirtyFlags.add(DIRTY_CDL);
  }

  setContour(state: {
    enabled: boolean;
    levels: number;
    desaturate: boolean;
    lineColor: [number, number, number];
  }): void {
    this.state.contourEnabled = state.enabled;
    this.state.contourLevels = state.levels;
    this.state.contourDesaturate = state.desaturate;
    this.state.contourLineColor = [...state.lineColor];
    this.dirtyFlags.add(DIRTY_CONTOUR);
  }

  disableContour(): void {
    this.state.contourEnabled = false;
    this.dirtyFlags.add(DIRTY_CONTOUR);
  }

  setCurvesLUT(luts: CurveLUTs | null): void {
    this.dirtyFlags.add(DIRTY_CURVES);
    this.cachedCurvesSnapshot = null;
    if (!luts) {
      this.state.curvesEnabled = false;
      return;
    }
    if (!this.curvesLUTBuffer) {
      this.curvesLUTBuffer = new Uint8Array(LUT_1D_SIZE * RGBA_CHANNELS);
    }
    const data = this.curvesLUTBuffer;
    for (let i = 0; i < LUT_1D_SIZE; i++) {
      data[i * RGBA_CHANNELS] = luts.red[i]!;
      data[i * RGBA_CHANNELS + 1] = luts.green[i]!;
      data[i * RGBA_CHANNELS + 2] = luts.blue[i]!;
      data[i * RGBA_CHANNELS + 3] = luts.master[i]!;
    }
    let isIdentity = true;
    for (let i = 0; i < LUT_1D_SIZE; i++) {
      if (
        data[i * RGBA_CHANNELS] !== i ||
        data[i * RGBA_CHANNELS + 1] !== i ||
        data[i * RGBA_CHANNELS + 2] !== i ||
        data[i * RGBA_CHANNELS + 3] !== i
      ) {
        isIdentity = false;
        break;
      }
    }
    this.state.curvesEnabled = !isIdentity;
    this.state.curvesLUTData = data;
    this.state.curvesLUTDirty = true;
  }

  setColorWheels(cwState: ColorWheelsState): void {
    const { lift, gamma, gain } = cwState;
    const hasAdjustments =
      lift.r !== 0 ||
      lift.g !== 0 ||
      lift.b !== 0 ||
      lift.y !== 0 ||
      gamma.r !== 0 ||
      gamma.g !== 0 ||
      gamma.b !== 0 ||
      gamma.y !== 0 ||
      gain.r !== 0 ||
      gain.g !== 0 ||
      gain.b !== 0 ||
      gain.y !== 0;
    this.state.colorWheelsEnabled = hasAdjustments;
    const wl = this.state.wheelLift;
    wl[0] = lift.r;
    wl[1] = lift.g;
    wl[2] = lift.b;
    wl[3] = lift.y;
    const wg = this.state.wheelGamma;
    wg[0] = gamma.r;
    wg[1] = gamma.g;
    wg[2] = gamma.b;
    wg[3] = gamma.y;
    const wn = this.state.wheelGain;
    wn[0] = gain.r;
    wn[1] = gain.g;
    wn[2] = gain.b;
    wn[3] = gain.y;
    this.dirtyFlags.add(DIRTY_COLOR_WHEELS);
  }

  setFalseColor(fcState: FalseColorState): void {
    this.state.falseColorEnabled = fcState.enabled;
    if (fcState.lut) {
      this.state.falseColorLUTData = fcState.lut;
      this.state.falseColorLUTDirty = true;
      this.cachedFalseColorSnapshot = null;
    }
    this.dirtyFlags.add(DIRTY_FALSE_COLOR);
  }

  setZebraStripes(zState: ZebraState): void {
    this.state.zebraEnabled = zState.enabled && (zState.highEnabled || zState.lowEnabled);
    this.state.zebraHighThreshold = zState.highThreshold / 100;
    this.state.zebraLowThreshold = zState.lowThreshold / 100;
    this.state.zebraHighEnabled = zState.highEnabled;
    this.state.zebraLowEnabled = zState.lowEnabled;
    this.state.zebraTime = (Date.now() / 50) % 1000;
    this.dirtyFlags.add(DIRTY_ZEBRA);
  }

  setChannelMode(mode: ChannelMode): void {
    this.state.channelModeCode = CHANNEL_MODE_CODES[mode] ?? 0;
    this.dirtyFlags.add(DIRTY_CHANNELS);
  }

  setLUT(lutData: Float32Array | null, lutSize: number, intensity: number): void {
    this.setLookLUT(lutData, lutSize, intensity);
  }

  setLookLUT(
    lutData: Float32Array | null,
    lutSize: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.dirtyFlags.add(DIRTY_LUT3D);
    this.cachedLUT3DSnapshot = null;
    if (!lutData || lutSize === 0) {
      this.state.lut3DEnabled = false;
      this.state.lut3DData = null;
      this.state.lut3DSize = 0;
      this.state.lut3DIntensity = intensity;
      return;
    }
    this.state.lut3DEnabled = true;
    this.state.lut3DData = lutData;
    this.state.lut3DSize = lutSize;
    this.state.lut3DIntensity = intensity;
    this.state.lut3DDirty = true;
    if (domainMin) {
      this.state.lookLUT3DDomainMin[0] = domainMin[0];
      this.state.lookLUT3DDomainMin[1] = domainMin[1];
      this.state.lookLUT3DDomainMin[2] = domainMin[2];
    } else {
      this.state.lookLUT3DDomainMin[0] = 0;
      this.state.lookLUT3DDomainMin[1] = 0;
      this.state.lookLUT3DDomainMin[2] = 0;
    }
    if (domainMax) {
      this.state.lookLUT3DDomainMax[0] = domainMax[0];
      this.state.lookLUT3DDomainMax[1] = domainMax[1];
      this.state.lookLUT3DDomainMax[2] = domainMax[2];
    } else {
      this.state.lookLUT3DDomainMax[0] = 1;
      this.state.lookLUT3DDomainMax[1] = 1;
      this.state.lookLUT3DDomainMax[2] = 1;
    }
  }

  setFileLUT(
    lutData: Float32Array | null,
    lutSize: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.dirtyFlags.add(DIRTY_FILE_LUT3D);
    this.cachedFileLUT3DSnapshot = null;
    if (!lutData || lutSize === 0) {
      this.state.fileLUT3DEnabled = false;
      this.state.fileLUT3DData = null;
      this.state.fileLUT3DSize = 0;
      this.state.fileLUT3DIntensity = intensity;
      return;
    }
    this.state.fileLUT3DEnabled = true;
    this.state.fileLUT3DData = lutData;
    this.state.fileLUT3DSize = lutSize;
    this.state.fileLUT3DIntensity = intensity;
    this.state.fileLUT3DDirty = true;
    if (domainMin) {
      this.state.fileLUT3DDomainMin[0] = domainMin[0];
      this.state.fileLUT3DDomainMin[1] = domainMin[1];
      this.state.fileLUT3DDomainMin[2] = domainMin[2];
    } else {
      this.state.fileLUT3DDomainMin[0] = 0;
      this.state.fileLUT3DDomainMin[1] = 0;
      this.state.fileLUT3DDomainMin[2] = 0;
    }
    if (domainMax) {
      this.state.fileLUT3DDomainMax[0] = domainMax[0];
      this.state.fileLUT3DDomainMax[1] = domainMax[1];
      this.state.fileLUT3DDomainMax[2] = domainMax[2];
    } else {
      this.state.fileLUT3DDomainMax[0] = 1;
      this.state.fileLUT3DDomainMax[1] = 1;
      this.state.fileLUT3DDomainMax[2] = 1;
    }
  }

  setDisplayLUT(
    lutData: Float32Array | null,
    lutSize: number,
    intensity: number,
    domainMin?: [number, number, number],
    domainMax?: [number, number, number],
  ): void {
    this.dirtyFlags.add(DIRTY_DISPLAY_LUT3D);
    this.cachedDisplayLUT3DSnapshot = null;
    if (!lutData || lutSize === 0) {
      this.state.displayLUT3DEnabled = false;
      this.state.displayLUT3DData = null;
      this.state.displayLUT3DSize = 0;
      this.state.displayLUT3DIntensity = intensity;
      return;
    }
    this.state.displayLUT3DEnabled = true;
    this.state.displayLUT3DData = lutData;
    this.state.displayLUT3DSize = lutSize;
    this.state.displayLUT3DIntensity = intensity;
    this.state.displayLUT3DDirty = true;
    if (domainMin) {
      this.state.displayLUT3DDomainMin[0] = domainMin[0];
      this.state.displayLUT3DDomainMin[1] = domainMin[1];
      this.state.displayLUT3DDomainMin[2] = domainMin[2];
    } else {
      this.state.displayLUT3DDomainMin[0] = 0;
      this.state.displayLUT3DDomainMin[1] = 0;
      this.state.displayLUT3DDomainMin[2] = 0;
    }
    if (domainMax) {
      this.state.displayLUT3DDomainMax[0] = domainMax[0];
      this.state.displayLUT3DDomainMax[1] = domainMax[1];
      this.state.displayLUT3DDomainMax[2] = domainMax[2];
    } else {
      this.state.displayLUT3DDomainMax[0] = 1;
      this.state.displayLUT3DDomainMax[1] = 1;
      this.state.displayLUT3DDomainMax[2] = 1;
    }
  }

  getDisplayColorState(): DisplayColorConfig {
    return {
      transferFunction: this.state.displayTransferCode,
      displayGamma: this.state.displayGammaOverride,
      displayBrightness: this.state.displayBrightnessMultiplier,
      customGamma: this.state.displayCustomGamma,
    };
  }

  setDisplayColorState(dcState: DisplayColorConfig): void {
    this.state.displayTransferCode = dcState.transferFunction;
    this.state.displayGammaOverride = dcState.displayGamma;
    this.state.displayBrightnessMultiplier = dcState.displayBrightness;
    this.state.displayCustomGamma = dcState.customGamma;
    this.dirtyFlags.add(DIRTY_DISPLAY);
  }

  setHighlightsShadows(hsState: HighlightsShadowsState): void {
    const { highlights, shadows, whites, blacks } = hsState;
    const hasAdjustments = highlights !== 0 || shadows !== 0 || whites !== 0 || blacks !== 0;
    this.state.hsEnabled = hasAdjustments;
    this.state.highlightsValue = highlights / 100;
    this.state.shadowsValue = shadows / 100;
    this.state.whitesValue = whites / 100;
    this.state.blacksValue = blacks / 100;
    this.dirtyFlags.add(DIRTY_HIGHLIGHTS_SHADOWS);
  }

  setVibrance(vState: VibranceState): void {
    const { vibrance, skinProtection } = vState;
    this.state.vibranceEnabled = vibrance !== 0;
    this.state.vibranceValue = vibrance / 100;
    this.state.vibranceSkinProtection = skinProtection;
    this.dirtyFlags.add(DIRTY_VIBRANCE);
  }

  setClarity(cState: ClarityState): void {
    const { clarity } = cState;
    this.state.clarityEnabled = clarity !== 0;
    this.state.clarityValue = clarity / 100;
    this.dirtyFlags.add(DIRTY_CLARITY);
  }

  setSharpen(sState: SharpenState): void {
    const { amount } = sState;
    this.state.sharpenEnabled = amount > 0;
    this.state.sharpenAmount = amount / 100;
    this.dirtyFlags.add(DIRTY_SHARPEN);
  }

  setHSLQualifier(hslState: HSLQualifierState): void {
    this.state.hslQualifierEnabled = hslState.enabled;
    this.state.hslHueCenter = hslState.hue.center;
    this.state.hslHueWidth = hslState.hue.width;
    this.state.hslHueSoftness = hslState.hue.softness;
    this.state.hslSatCenter = hslState.saturation.center;
    this.state.hslSatWidth = hslState.saturation.width;
    this.state.hslSatSoftness = hslState.saturation.softness;
    this.state.hslLumCenter = hslState.luminance.center;
    this.state.hslLumWidth = hslState.luminance.width;
    this.state.hslLumSoftness = hslState.luminance.softness;
    this.state.hslCorrHueShift = hslState.correction.hueShift;
    this.state.hslCorrSatScale = hslState.correction.saturationScale;
    this.state.hslCorrLumScale = hslState.correction.luminanceScale;
    this.state.hslInvert = hslState.invert;
    this.state.hslMattePreview = hslState.mattePreview;
    this.dirtyFlags.add(DIRTY_HSL);
  }

  setGamutMapping(gmState: GamutMappingState): void {
    const enabled = gmState.mode !== 'off' && gmState.sourceGamut !== gmState.targetGamut;
    this.state.gamutMappingEnabled = enabled;
    this.state.gamutMappingModeCode = enabled ? (GAMUT_MODE_CODES[gmState.mode] ?? 0) : 0;
    this.state.gamutSourceCode = GAMUT_CODES[gmState.sourceGamut] ?? 0;
    this.state.gamutTargetCode = GAMUT_CODES[gmState.targetGamut] ?? 0;
    this.state.gamutHighlightEnabled = enabled && gmState.highlightOutOfGamut === true;
    this.dirtyFlags.add(DIRTY_GAMUT_MAPPING);
  }

  getGamutMapping(): GamutMappingState {
    const s = this.state;
    if (!s.gamutMappingEnabled) return { ...DEFAULT_GAMUT_MAPPING_STATE };
    const sourceEntries = Object.entries(GAMUT_CODES);
    const targetEntries = Object.entries(GAMUT_CODES);
    const source = (sourceEntries.find(([, v]) => v === s.gamutSourceCode)?.[0] ?? 'srgb') as GamutIdentifier;
    const target = (targetEntries.find(([, v]) => v === s.gamutTargetCode)?.[0] ?? 'srgb') as GamutIdentifier;
    const mode = s.gamutMappingModeCode === 1 ? 'compress' : 'clip';
    return { mode, sourceGamut: source, targetGamut: target, highlightOutOfGamut: s.gamutHighlightEnabled };
  }

  setColorPrimaries(
    inputPrimaries: ColorPrimaries | undefined,
    outputColorSpace: 'srgb' | 'display-p3' | 'rec2020',
  ): void {
    if (inputPrimaries === 'bt2020') {
      this.state.inputPrimariesEnabled = true;
      this.state.inputPrimariesMatrix = COLOR_PRIMARIES_MATRICES.REC2020_TO_SRGB;
    } else if (inputPrimaries === 'p3') {
      this.state.inputPrimariesEnabled = true;
      this.state.inputPrimariesMatrix = COLOR_PRIMARIES_MATRICES.P3_TO_SRGB;
    } else {
      this.state.inputPrimariesEnabled = false;
      this.state.inputPrimariesMatrix = COLOR_PRIMARIES_MATRICES.IDENTITY;
    }

    if (outputColorSpace === 'display-p3') {
      this.state.outputPrimariesEnabled = true;
      this.state.outputPrimariesMatrix = COLOR_PRIMARIES_MATRICES.SRGB_TO_P3;
    } else if (outputColorSpace === 'rec2020') {
      this.state.outputPrimariesEnabled = true;
      this.state.outputPrimariesMatrix = COLOR_PRIMARIES_MATRICES.SRGB_TO_REC2020;
    } else {
      this.state.outputPrimariesEnabled = false;
      this.state.outputPrimariesMatrix = COLOR_PRIMARIES_MATRICES.IDENTITY;
    }

    this.dirtyFlags.add(DIRTY_COLOR_PRIMARIES);
  }

  setDeinterlace(diState: { enabled: boolean; method: number; fieldOrder: number }): void {
    this.state.deinterlaceEnabled = diState.enabled && diState.method !== 1;
    this.state.deinterlaceMethod = diState.method;
    this.state.deinterlaceFieldOrder = diState.fieldOrder;
    this.dirtyFlags.add(DIRTY_DEINTERLACE);
  }

  setFilmEmulation(feState: {
    enabled: boolean;
    intensity: number;
    saturation: number;
    grainIntensity: number;
    grainSeed: number;
    lutData: Uint8Array | null;
  }): void {
    this.state.filmEnabled = feState.enabled && feState.intensity > 0;
    this.state.filmIntensity = feState.intensity;
    this.state.filmSaturation = feState.saturation;
    this.state.filmGrainIntensity = feState.grainIntensity;
    this.state.filmGrainSeed = feState.grainSeed;
    if (feState.lutData) {
      this.state.filmLUTData = feState.lutData;
      this.state.filmLUTDirty = true;
    }
    this.dirtyFlags.add(DIRTY_FILM_EMULATION);
  }

  setPerspective(pState: { enabled: boolean; invH: Float32Array; quality: number }): void {
    this.state.perspectiveEnabled = pState.enabled;
    this.state.perspectiveInvH = pState.invH;
    this.state.perspectiveQuality = pState.quality;
    this.dirtyFlags.add(DIRTY_PERSPECTIVE);
  }

  setSphericalProjection(sState: { enabled: boolean; fov: number; aspect: number; yaw: number; pitch: number }): void {
    this.state.sphericalEnabled = sState.enabled;
    this.state.sphericalFov = sState.fov;
    this.state.sphericalAspect = sState.aspect;
    this.state.sphericalYaw = sState.yaw;
    this.state.sphericalPitch = sState.pitch;
    this.dirtyFlags.add(DIRTY_SPHERICAL);
  }

  isSphericalEnabled(): boolean {
    return this.state.sphericalEnabled;
  }

  setLinearize(lzState: LinearizeState): void {
    this.state.linearizeLogType = lzState.logType;
    this.state.linearizeSRGB2linear = lzState.sRGB2linear;
    this.state.linearizeRec709ToLinear = lzState.rec709ToLinear;
    this.state.linearizeFileGamma = lzState.fileGamma;
    this.state.linearizeAlphaType = lzState.alphaType;
    this.dirtyFlags.add(DIRTY_LINEARIZE);
  }

  getLinearize(): LinearizeState {
    return {
      logType: this.state.linearizeLogType as 0 | 1 | 2 | 3,
      sRGB2linear: this.state.linearizeSRGB2linear,
      rec709ToLinear: this.state.linearizeRec709ToLinear,
      fileGamma: this.state.linearizeFileGamma,
      alphaType: this.state.linearizeAlphaType,
    };
  }

  setInlineLUT(lutData: Float32Array | null, channels: 1 | 3): void {
    this.dirtyFlags.add(DIRTY_INLINE_LUT);
    if (!lutData || lutData.length === 0) {
      this.state.inlineLUTEnabled = false;
      this.state.inlineLUTData = null;
      this.state.inlineLUTSize = 0;
      this.state.inlineLUTChannels = 1;
      return;
    }
    this.state.inlineLUTEnabled = true;
    this.state.inlineLUTChannels = channels;
    this.state.inlineLUTSize = channels === 3 ? lutData.length / 3 : lutData.length;
    this.state.inlineLUTData = lutData;
    this.state.inlineLUTDirty = true;
  }

  setOutOfRange(mode: number): void {
    this.state.outOfRange = mode;
    this.dirtyFlags.add(DIRTY_OUT_OF_RANGE);
  }

  getOutOfRange(): number {
    return this.state.outOfRange;
  }

  setPremultMode(mode: number): void {
    const clamped = mode === 1 || mode === 2 ? mode : 0;
    if (clamped === this.state.premultMode) return;
    this.state.premultMode = clamped;
    this.dirtyFlags.add(DIRTY_PREMULT);
  }

  getPremultMode(): number {
    return this.state.premultMode;
  }

  setDitherMode(mode: number): void {
    const n = Number(mode);
    const clamped = !Number.isFinite(n) ? 0 : Math.max(0, Math.min(2, Math.floor(n)));
    if (clamped === this.state.ditherMode) return;
    this.state.ditherMode = clamped;
    this.dirtyFlags.add(DIRTY_DITHER);
  }

  getDitherMode(): number {
    return this.state.ditherMode;
  }

  setQuantizeBits(bits: number): void {
    const n = Number(bits);
    if (!Number.isFinite(n) || n <= 0) {
      if (this.state.quantizeBits === 0) return;
      this.state.quantizeBits = 0;
      this.dirtyFlags.add(DIRTY_DITHER);
      return;
    }
    const b = Math.floor(n);
    const clamped = b < 2 ? 2 : b > 16 ? 16 : b;
    if (clamped === this.state.quantizeBits) return;
    this.state.quantizeBits = clamped;
    this.dirtyFlags.add(DIRTY_DITHER);
  }

  getQuantizeBits(): number {
    return this.state.quantizeBits;
  }

  setChannelSwizzle(swizzle: ChannelSwizzle): void {
    const s = this.state.channelSwizzle;
    s[0] = swizzle[0];
    s[1] = swizzle[1];
    s[2] = swizzle[2];
    s[3] = swizzle[3];
    this.dirtyFlags.add(DIRTY_CHANNEL_SWIZZLE);
  }

  getChannelSwizzle(): ChannelSwizzle {
    return [...this.state.channelSwizzle] as ChannelSwizzle;
  }

  /** Set texel size (called by Renderer before applyUniforms, based on image dimensions). */
  setTexelSize(w: number, h: number): void {
    this.state.texelSize[0] = w;
    this.state.texelSize[1] = h;
  }

  // -----------------------------------------------------------------------
  // Batch state application (from RenderState)
  // -----------------------------------------------------------------------

  applyRenderState(renderState: RenderState): void {
    applyRenderStateFn(this, renderState);
  }

  // -----------------------------------------------------------------------
  // Uniform upload
  // -----------------------------------------------------------------------

  /**
   * Push dirty uniforms to the shader, then clear dirty flags.
   *
   * Callers must set u_inputTransfer and u_outputMode BEFORE calling this,
   * since those differ between the two render paths (renderImage vs renderSDRFrame).
   */
  applyUniforms(shader: ShaderProgram, texCb: TextureCallbacks): void {
    this._textureUnitsInitialized = applyUniformsFn(
      this.state,
      this.dirtyFlags,
      shader,
      texCb,
      this.uniformBuffers,
      this._textureUnitsInitialized,
    );
  }

  /**
   * Release all held state and buffers.
   */
  dispose(): void {
    this.dirtyFlags.clear();
    this.state = createDefaultInternalState();
    this.curvesLUTBuffer = null;
    this.cachedCurvesSnapshot = null;
    this.cachedFalseColorSnapshot = null;
    this.cachedLUT3DSnapshot = null;
    this.cachedFileLUT3DSnapshot = null;
    this.cachedDisplayLUT3DSnapshot = null;
    this.cachedColorAdjustments = null;
    this.cachedToneMappingState = null;
    this._textureUnitsInitialized = false;
  }
}
