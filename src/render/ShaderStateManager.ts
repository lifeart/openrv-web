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
import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState, LinearizeState, ChannelSwizzle } from '../core/types/color';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../core/types/color';
import type { ToneMappingState, ToneMappingOperator, ZebraState, HighlightsShadowsState, VibranceState, ClarityState, SharpenState, FalseColorState, GamutMappingState, GamutIdentifier } from '../core/types/effects';
import { DEFAULT_TONE_MAPPING_STATE, DEFAULT_GAMUT_MAPPING_STATE } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import { PATTERN_COLORS } from '../core/types/background';
import { getHueRotationMatrix, isIdentityHueRotation } from '../color/HueRotation';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState, DisplayColorConfig } from './RenderState';
import { DISPLAY_TRANSFER_SRGB, LUT_1D_SIZE, RGBA_CHANNELS } from '../config/RenderConfig';
import type { StateAccessor, CurvesLUTSnapshot, FalseColorLUTSnapshot, LUT3DSnapshot } from './StateAccessor';

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

/** All dirty flag names -- used to initialize on first render so all uniforms are set. */
export const ALL_DIRTY_FLAGS = [
  DIRTY_COLOR, DIRTY_TONE_MAPPING, DIRTY_CDL, DIRTY_COLOR_WHEELS,
  DIRTY_HSL, DIRTY_ZEBRA, DIRTY_CHANNELS, DIRTY_BACKGROUND,
  DIRTY_DISPLAY, DIRTY_CLARITY, DIRTY_SHARPEN, DIRTY_FALSE_COLOR,
  DIRTY_CURVES, DIRTY_VIBRANCE, DIRTY_HIGHLIGHTS_SHADOWS, DIRTY_INVERSION,
  DIRTY_LUT3D, DIRTY_GAMUT_MAPPING, DIRTY_DEINTERLACE, DIRTY_FILM_EMULATION,
  DIRTY_PERSPECTIVE,
  DIRTY_LINEARIZE,
  DIRTY_INLINE_LUT,
  DIRTY_OUT_OF_RANGE,
  DIRTY_CHANNEL_SWIZZLE,
  DIRTY_PREMULT,
] as const;

// ---------------------------------------------------------------------------
// Shader constant codes
// ---------------------------------------------------------------------------

/** Tone mapping operator integer codes for shader uniform */
export const TONE_MAPPING_OPERATOR_CODES: Record<ToneMappingOperator, number> = {
  'off': 0,
  'reinhard': 1,
  'filmic': 2,
  'aces': 3,
  'agx': 4,
  'pbrNeutral': 5,
  'gt': 6,
  'acesHill': 7,
  'drago': 8,
};

/** Gamut identifier integer codes for shader uniform */
const GAMUT_CODES: Record<GamutIdentifier, number> = {
  'srgb': 0,
  'rec2020': 1,
  'display-p3': 2,
};

/** Gamut mapping mode codes for shader uniform */
const GAMUT_MODE_CODES: Record<string, number> = {
  'clip': 0,
  'compress': 1,
};

/** Map ChannelMode string to shader integer */
const CHANNEL_MODE_CODES: Record<ChannelMode, number> = {
  'rgb': 0,
  'red': 1,
  'green': 2,
  'blue': 3,
  'alpha': 4,
  'luminance': 5,
};

// --- Background pattern shader codes ---
const BG_PATTERN_NONE = 0;
const BG_PATTERN_SOLID = 1;
const BG_PATTERN_CHECKER = 2;
const BG_PATTERN_CROSSHATCH = 3;

// --- Default thresholds and sizes ---
const DEFAULT_ZEBRA_HIGH_THRESHOLD = 0.95;
const DEFAULT_ZEBRA_LOW_THRESHOLD = 0.05;
const DEFAULT_CHECKER_SIZE = 16;

/** Compare two Float32Array instances element-by-element. */
function float32ArrayEquals(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Parse hex color into an existing tuple (avoids allocation). */
function hexToRgbInto(hex: string, out: [number, number, number]): void {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }
  const num = parseInt(h, 16);
  out[0] = (num >> 16) / 255;
  out[1] = ((num >> 8) & 0xff) / 255;
  out[2] = (num & 0xff) / 255;
}

/** Copy all properties from src to dst (shallow, same-shape objects). */
function assignColorAdjustments(dst: ColorAdjustments, src: Readonly<ColorAdjustments>): void {
  dst.exposure = src.exposure;
  dst.gamma = src.gamma;
  dst.saturation = src.saturation;
  dst.vibrance = src.vibrance;
  dst.vibranceSkinProtection = src.vibranceSkinProtection;
  dst.contrast = src.contrast;
  dst.clarity = src.clarity;
  dst.hueRotation = src.hueRotation;
  dst.temperature = src.temperature;
  dst.tint = src.tint;
  dst.brightness = src.brightness;
  dst.highlights = src.highlights;
  dst.shadows = src.shadows;
  dst.whites = src.whites;
  dst.blacks = src.blacks;
  dst.exposureRGB = src.exposureRGB;
  dst.gammaRGB = src.gammaRGB;
  dst.contrastRGB = src.contrastRGB;
  dst.scale = src.scale;
  dst.scaleRGB = src.scaleRGB;
  dst.offset = src.offset;
  dst.offsetRGB = src.offsetRGB;
  dst.inlineLUT = src.inlineLUT;
  dst.lutChannels = src.lutChannels;
}

/** Copy all properties from src to dst for ToneMappingState. */
function assignToneMappingState(dst: ToneMappingState, src: Readonly<ToneMappingState>): void {
  dst.enabled = src.enabled;
  dst.operator = src.operator;
  dst.reinhardWhitePoint = src.reinhardWhitePoint;
  dst.filmicExposureBias = src.filmicExposureBias;
  dst.filmicWhitePoint = src.filmicWhitePoint;
  dst.dragoBias = src.dragoBias;
  dst.dragoLwa = src.dragoLwa;
  dst.dragoLmax = src.dragoLmax;
  dst.dragoBrightness = src.dragoBrightness;
}

// ---------------------------------------------------------------------------
// Internal "flat" state mirroring what Renderer used to hold
// ---------------------------------------------------------------------------

/** Internal flattened state that maps 1:1 to shader uniforms. */
export interface InternalShaderState {
  // Color adjustments
  colorAdjustments: ColorAdjustments;

  // Color inversion
  colorInversionEnabled: boolean;

  // Tone mapping
  toneMappingState: ToneMappingState;

  // Background pattern
  bgPatternCode: number;
  bgColor1: [number, number, number];
  bgColor2: [number, number, number];
  bgCheckerSize: number;

  // CDL
  cdlEnabled: boolean;
  cdlSlope: [number, number, number];
  cdlOffset: [number, number, number];
  cdlPower: [number, number, number];
  cdlSaturation: number;
  cdlColorspace: number;  // 0=rec709/direct, 1=ACEScct

  // Curves
  curvesEnabled: boolean;
  curvesLUTData: Uint8Array | null;
  curvesLUTDirty: boolean;

  // Color Wheels
  colorWheelsEnabled: boolean;
  wheelLift: [number, number, number, number];
  wheelGamma: [number, number, number, number];
  wheelGain: [number, number, number, number];

  // False Color
  falseColorEnabled: boolean;
  falseColorLUTData: Uint8Array | null;
  falseColorLUTDirty: boolean;

  // Zebra
  zebraEnabled: boolean;
  zebraHighThreshold: number;
  zebraLowThreshold: number;
  zebraHighEnabled: boolean;
  zebraLowEnabled: boolean;
  zebraTime: number;

  // Channel mode
  channelModeCode: number;

  // 3D LUT
  lut3DEnabled: boolean;
  lut3DIntensity: number;
  lut3DSize: number;
  lut3DDirty: boolean;
  lut3DData: Float32Array | null;

  // Display color management
  displayTransferCode: number;
  displayGammaOverride: number;
  displayBrightnessMultiplier: number;
  displayCustomGamma: number;

  // Highlights/Shadows
  hsEnabled: boolean;
  highlightsValue: number;
  shadowsValue: number;
  whitesValue: number;
  blacksValue: number;

  // Vibrance
  vibranceEnabled: boolean;
  vibranceValue: number;
  vibranceSkinProtection: boolean;

  // Clarity
  clarityEnabled: boolean;
  clarityValue: number;

  // Sharpen
  sharpenEnabled: boolean;
  sharpenAmount: number;

  // Texel size (set by Renderer before applyUniforms)
  texelSize: [number, number];

  // HSL Qualifier
  hslQualifierEnabled: boolean;
  hslHueCenter: number;
  hslHueWidth: number;
  hslHueSoftness: number;
  hslSatCenter: number;
  hslSatWidth: number;
  hslSatSoftness: number;
  hslLumCenter: number;
  hslLumWidth: number;
  hslLumSoftness: number;
  hslCorrHueShift: number;
  hslCorrSatScale: number;
  hslCorrLumScale: number;
  hslInvert: boolean;
  hslMattePreview: boolean;

  // Gamut Mapping
  gamutMappingEnabled: boolean;
  gamutMappingModeCode: number;
  gamutSourceCode: number;
  gamutTargetCode: number;
  gamutHighlightEnabled: boolean;

  // Deinterlace
  deinterlaceEnabled: boolean;
  deinterlaceMethod: number;    // 0=bob, 1=weave, 2=blend
  deinterlaceFieldOrder: number; // 0=tff, 1=bff

  // Film Emulation
  filmEnabled: boolean;
  filmIntensity: number;
  filmSaturation: number;
  filmGrainIntensity: number;
  filmGrainSeed: number;
  filmLUTData: Uint8Array | null;
  filmLUTDirty: boolean;

  // Perspective Correction
  perspectiveEnabled: boolean;
  perspectiveInvH: Float32Array;
  perspectiveQuality: number;

  // Linearize (RVLinearize log-to-linear conversion)
  linearizeLogType: number;  // 0=none, 1=cineon, 2=viper, 3=logc3
  linearizeSRGB2linear: boolean;
  linearizeRec709ToLinear: boolean;
  linearizeFileGamma: number;
  linearizeAlphaType: number;

  // Inline 1D LUT (from RVColor luminanceLUT)
  inlineLUTEnabled: boolean;
  inlineLUTChannels: number;   // 1=luminance, 3=per-channel RGB
  inlineLUTSize: number;       // number of entries per channel
  inlineLUTData: Float32Array | null;
  inlineLUTDirty: boolean;

  // Out-of-range visualization mode
  outOfRange: number;  // 0=off, 1=clamp-to-black, 2=highlight

  // Channel swizzle (RVChannelMap remapping)
  channelSwizzle: [number, number, number, number]; // default [0,1,2,3] = identity

  // Premultiply/unpremultiply alpha mode
  premultMode: number;  // 0=off, 1=premultiply, 2=unpremultiply
}

function createDefaultInternalState(): InternalShaderState {
  return {
    colorAdjustments: { ...DEFAULT_COLOR_ADJUSTMENTS },
    colorInversionEnabled: false,
    toneMappingState: { ...DEFAULT_TONE_MAPPING_STATE },
    bgPatternCode: BG_PATTERN_NONE,
    bgColor1: [0, 0, 0],
    bgColor2: [0, 0, 0],
    bgCheckerSize: DEFAULT_CHECKER_SIZE,
    cdlEnabled: false,
    cdlSlope: [1, 1, 1],
    cdlOffset: [0, 0, 0],
    cdlPower: [1, 1, 1],
    cdlSaturation: 1,
    cdlColorspace: 0,
    curvesEnabled: false,
    curvesLUTData: null,
    curvesLUTDirty: true,
    colorWheelsEnabled: false,
    wheelLift: [0, 0, 0, 0],
    wheelGamma: [0, 0, 0, 0],
    wheelGain: [0, 0, 0, 0],
    falseColorEnabled: false,
    falseColorLUTData: null,
    falseColorLUTDirty: true,
    zebraEnabled: false,
    zebraHighThreshold: DEFAULT_ZEBRA_HIGH_THRESHOLD,
    zebraLowThreshold: DEFAULT_ZEBRA_LOW_THRESHOLD,
    zebraHighEnabled: true,
    zebraLowEnabled: false,
    zebraTime: 0,
    channelModeCode: CHANNEL_MODE_CODES['rgb'],
    lut3DEnabled: false,
    lut3DIntensity: 1.0,
    lut3DSize: 0,
    lut3DDirty: true,
    lut3DData: null,
    displayTransferCode: DISPLAY_TRANSFER_SRGB,
    displayGammaOverride: 1.0,
    displayBrightnessMultiplier: 1.0,
    displayCustomGamma: 2.2,
    hsEnabled: false,
    highlightsValue: 0,
    shadowsValue: 0,
    whitesValue: 0,
    blacksValue: 0,
    vibranceEnabled: false,
    vibranceValue: 0,
    vibranceSkinProtection: true,
    clarityEnabled: false,
    clarityValue: 0,
    sharpenEnabled: false,
    sharpenAmount: 0,
    texelSize: [0, 0],
    hslQualifierEnabled: false,
    hslHueCenter: 0,
    hslHueWidth: 30,
    hslHueSoftness: 20,
    hslSatCenter: 50,
    hslSatWidth: 100,
    hslSatSoftness: 10,
    hslLumCenter: 50,
    hslLumWidth: 100,
    hslLumSoftness: 10,
    hslCorrHueShift: 0,
    hslCorrSatScale: 1,
    hslCorrLumScale: 1,
    hslInvert: false,
    hslMattePreview: false,
    gamutMappingEnabled: false,
    gamutMappingModeCode: 0,
    gamutSourceCode: 0,
    gamutTargetCode: 0,
    gamutHighlightEnabled: false,
    deinterlaceEnabled: false,
    deinterlaceMethod: 0,
    deinterlaceFieldOrder: 0,
    filmEnabled: false,
    filmIntensity: 0,
    filmSaturation: 1,
    filmGrainIntensity: 0,
    filmGrainSeed: 0,
    filmLUTData: null,
    filmLUTDirty: false,
    perspectiveEnabled: false,
    perspectiveInvH: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    perspectiveQuality: 0,
    linearizeLogType: 0,
    linearizeSRGB2linear: false,
    linearizeRec709ToLinear: false,
    linearizeFileGamma: 1.0,
    linearizeAlphaType: 0,
    inlineLUTEnabled: false,
    inlineLUTChannels: 1,
    inlineLUTSize: 0,
    inlineLUTData: null,
    inlineLUTDirty: false,
    outOfRange: 0,
    channelSwizzle: [0, 1, 2, 3],
    premultMode: 0,
  };
}

// ---------------------------------------------------------------------------
// Texture management callback interface
// ---------------------------------------------------------------------------

/**
 * Callbacks the ShaderStateManager uses to interact with GPU texture resources
 * owned by the Renderer. This keeps texture lifecycle in the Renderer while
 * allowing the state manager to trigger texture uploads.
 *
 * Each `bind*` callback is responsible for ensuring the texture exists,
 * uploading any dirty data, activating the correct texture unit, and
 * binding the texture.
 */
export interface TextureCallbacks {
  /** Ensure curves LUT texture exists, upload if dirty, activate TEXTURE1, bind. */
  bindCurvesLUTTexture(): void;
  /** Ensure false color LUT texture exists, upload if dirty, activate TEXTURE2, bind. */
  bindFalseColorLUTTexture(): void;
  /** Ensure 3D LUT texture exists, upload if dirty, activate TEXTURE3, bind. */
  bindLUT3DTexture(): void;
  /** Ensure film LUT texture exists, upload if dirty, activate TEXTURE4, bind. */
  bindFilmLUTTexture(): void;
  /** Ensure inline LUT texture exists, upload if dirty, activate TEXTURE5, bind. */
  bindInlineLUTTexture(): void;
  /** Get the current canvas dimensions for u_resolution. */
  getCanvasSize(): { width: number; height: number };
}

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

  // --- Cached getter copies (invalidated on change) ---
  private cachedColorAdjustments: ColorAdjustments | null = null;
  private cachedToneMappingState: ToneMappingState | null = null;

  /** Pre-allocated resolution array for applyUniforms */
  private readonly resolutionBuffer: [number, number] = [0, 0];

  // -----------------------------------------------------------------------
  // Public accessors
  // -----------------------------------------------------------------------

  /** Get current dirty flags (read-only for testing). */
  getDirtyFlags(): ReadonlySet<string> {
    return this.dirtyFlags;
  }

  /** Mark all flags dirty (e.g. after context restore). */
  markAllDirty(): void {
    for (const flag of ALL_DIRTY_FLAGS) {
      this.dirtyFlags.add(flag);
    }
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
  clearTextureDirtyFlag(flag: 'curvesLUTDirty' | 'falseColorLUTDirty' | 'lut3DDirty' | 'filmLUTDirty' | 'inlineLUTDirty'): void {
    this.state[flag] = false;
    // Invalidate the corresponding cached snapshot since dirty changed
    if (flag === 'curvesLUTDirty') {
      this.cachedCurvesSnapshot = null;
    } else if (flag === 'falseColorLUTDirty') {
      this.cachedFalseColorSnapshot = null;
    } else if (flag === 'lut3DDirty') {
      this.cachedLUT3DSnapshot = null;
    }
    // filmLUTDirty has no cached snapshot
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
      // Solid color patterns (grey18, grey50, white)
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
      cdl.slope.r === 1 && cdl.slope.g === 1 && cdl.slope.b === 1 &&
      cdl.offset.r === 0 && cdl.offset.g === 0 && cdl.offset.b === 0 &&
      cdl.power.r === 1 && cdl.power.g === 1 && cdl.power.b === 1 &&
      cdl.saturation === 1;
    this.state.cdlEnabled = !isDefault;
    const slope = this.state.cdlSlope;
    slope[0] = cdl.slope.r; slope[1] = cdl.slope.g; slope[2] = cdl.slope.b;
    const offset = this.state.cdlOffset;
    offset[0] = cdl.offset.r; offset[1] = cdl.offset.g; offset[2] = cdl.offset.b;
    const power = this.state.cdlPower;
    power[0] = cdl.power.r; power[1] = cdl.power.g; power[2] = cdl.power.b;
    this.state.cdlSaturation = cdl.saturation;
    this.dirtyFlags.add(DIRTY_CDL);
  }

  setCurvesLUT(luts: CurveLUTs | null): void {
    this.dirtyFlags.add(DIRTY_CURVES);
    this.cachedCurvesSnapshot = null;
    if (!luts) {
      this.state.curvesEnabled = false;
      return;
    }
    // Pack into LUT_1D_SIZEx1 RGBA: R=red channel, G=green channel, B=blue channel, A=master
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
    // Check if identity (no effect)
    let isIdentity = true;
    for (let i = 0; i < LUT_1D_SIZE; i++) {
      if (data[i * RGBA_CHANNELS] !== i || data[i * RGBA_CHANNELS + 1] !== i || data[i * RGBA_CHANNELS + 2] !== i || data[i * RGBA_CHANNELS + 3] !== i) {
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
      lift.r !== 0 || lift.g !== 0 || lift.b !== 0 || lift.y !== 0 ||
      gamma.r !== 0 || gamma.g !== 0 || gamma.b !== 0 || gamma.y !== 0 ||
      gain.r !== 0 || gain.g !== 0 || gain.b !== 0 || gain.y !== 0;
    this.state.colorWheelsEnabled = hasAdjustments;
    const wl = this.state.wheelLift;
    wl[0] = lift.r; wl[1] = lift.g; wl[2] = lift.b; wl[3] = lift.y;
    const wg = this.state.wheelGamma;
    wg[0] = gamma.r; wg[1] = gamma.g; wg[2] = gamma.b; wg[3] = gamma.y;
    const wn = this.state.wheelGain;
    wn[0] = gain.r; wn[1] = gain.g; wn[2] = gain.b; wn[3] = gain.y;
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
    this.state.gamutHighlightEnabled = enabled && (gmState.highlightOutOfGamut === true);
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

  setDeinterlace(diState: { enabled: boolean; method: number; fieldOrder: number }): void {
    this.state.deinterlaceEnabled = diState.enabled && diState.method !== 1; // not weave
    this.state.deinterlaceMethod = diState.method;
    this.state.deinterlaceFieldOrder = diState.fieldOrder;
    this.dirtyFlags.add(DIRTY_DEINTERLACE);
  }

  setFilmEmulation(feState: { enabled: boolean; intensity: number; saturation: number; grainIntensity: number; grainSeed: number; lutData: Uint8Array | null }): void {
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
    const clamped = (mode === 1 || mode === 2) ? mode : 0;
    if (clamped === this.state.premultMode) return;
    this.state.premultMode = clamped;
    this.dirtyFlags.add(DIRTY_PREMULT);
  }

  getPremultMode(): number {
    return this.state.premultMode;
  }

  setChannelSwizzle(swizzle: ChannelSwizzle): void {
    const s = this.state.channelSwizzle;
    s[0] = swizzle[0]; s[1] = swizzle[1]; s[2] = swizzle[2]; s[3] = swizzle[3];
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

  /**
   * Apply a full RenderState, marking only groups whose values actually changed.
   *
   * During steady-state playback (no user interaction), all comparisons
   * short-circuit → no dirty flags → applyUniforms() skips all GL calls.
   * This eliminates ~65 redundant uniform uploads per frame.
   */
  applyRenderState(renderState: RenderState): void {
    const s = this.state;

    // --- Color adjustments (8+ uniforms) ---
    {
      const a = renderState.colorAdjustments;
      const c = s.colorAdjustments;
      const rgbChanged = (aRGB: [number, number, number] | undefined, cRGB: [number, number, number] | undefined): boolean => {
        if (aRGB === cRGB) return false; // both undefined or same reference
        if (!aRGB || !cRGB) return true; // one is undefined
        return aRGB[0] !== cRGB[0] || aRGB[1] !== cRGB[1] || aRGB[2] !== cRGB[2];
      };
      if (a.exposure !== c.exposure || a.gamma !== c.gamma ||
          a.saturation !== c.saturation || a.contrast !== c.contrast ||
          a.brightness !== c.brightness || a.temperature !== c.temperature ||
          a.tint !== c.tint || a.hueRotation !== c.hueRotation ||
          a.scale !== c.scale || a.offset !== c.offset ||
          rgbChanged(a.exposureRGB, c.exposureRGB) ||
          rgbChanged(a.gammaRGB, c.gammaRGB) ||
          rgbChanged(a.contrastRGB, c.contrastRGB) ||
          rgbChanged(a.scaleRGB, c.scaleRGB) ||
          rgbChanged(a.offsetRGB, c.offsetRGB)) {
        this.setColorAdjustments(a);
      }

      // Inline LUT (part of color adjustments but uses separate texture)
      const newLUT = a.inlineLUT ?? null;
      const newChannels = a.lutChannels ?? 1;
      if (newLUT !== s.inlineLUTData || newChannels !== s.inlineLUTChannels) {
        this.setInlineLUT(newLUT, newChannels);
      }
    }

    // --- Color inversion (1 uniform) ---
    if (renderState.colorInversion !== s.colorInversionEnabled) {
      this.setColorInversion(renderState.colorInversion);
    }

    // --- Tone mapping (3+ uniforms) ---
    {
      const t = renderState.toneMappingState;
      const c = s.toneMappingState;
      if (t.enabled !== c.enabled || t.operator !== c.operator ||
          (t.reinhardWhitePoint ?? 4.0) !== (c.reinhardWhitePoint ?? 4.0) ||
          (t.filmicExposureBias ?? 2.0) !== (c.filmicExposureBias ?? 2.0) ||
          (t.filmicWhitePoint ?? 11.2) !== (c.filmicWhitePoint ?? 11.2) ||
          (t.dragoBias ?? 0.85) !== (c.dragoBias ?? 0.85) ||
          (t.dragoLwa ?? 0.2) !== (c.dragoLwa ?? 0.2) ||
          (t.dragoLmax ?? 1.5) !== (c.dragoLmax ?? 1.5) ||
          (t.dragoBrightness ?? 2.0) !== (c.dragoBrightness ?? 2.0)) {
        this.setToneMappingState(t);
      }
    }

    // --- Background pattern (4 uniforms) ---
    // Compare computed values before/after to avoid unconditional dirty marking.
    {
      const oldCode = s.bgPatternCode;
      const oldC1_0 = s.bgColor1[0], oldC1_1 = s.bgColor1[1], oldC1_2 = s.bgColor1[2];
      const oldC2_0 = s.bgColor2[0], oldC2_1 = s.bgColor2[1], oldC2_2 = s.bgColor2[2];
      const oldChecker = s.bgCheckerSize;
      this.setBackgroundPattern(renderState.backgroundPattern);
      if (s.bgPatternCode === oldCode &&
          s.bgColor1[0] === oldC1_0 && s.bgColor1[1] === oldC1_1 && s.bgColor1[2] === oldC1_2 &&
          s.bgColor2[0] === oldC2_0 && s.bgColor2[1] === oldC2_1 && s.bgColor2[2] === oldC2_2 &&
          s.bgCheckerSize === oldChecker) {
        this.dirtyFlags.delete(DIRTY_BACKGROUND);
      }
    }

    // --- CDL (6 uniforms) ---
    {
      const c = renderState.cdl;
      const newColorspace = renderState.cdlColorspace ?? 0;
      if (c.slope.r !== s.cdlSlope[0] || c.slope.g !== s.cdlSlope[1] || c.slope.b !== s.cdlSlope[2] ||
          c.offset.r !== s.cdlOffset[0] || c.offset.g !== s.cdlOffset[1] || c.offset.b !== s.cdlOffset[2] ||
          c.power.r !== s.cdlPower[0] || c.power.g !== s.cdlPower[1] || c.power.b !== s.cdlPower[2] ||
          c.saturation !== s.cdlSaturation || newColorspace !== s.cdlColorspace) {
        this.setCDL(c);
        this.state.cdlColorspace = newColorspace;
      }
    }

    // --- Curves LUT (1-2 uniforms) ---
    // Skip when null and already disabled (common case: curves not in use)
    if (renderState.curvesLUT !== null || s.curvesEnabled) {
      this.setCurvesLUT(renderState.curvesLUT);
    }

    // --- Color wheels (4 uniforms) ---
    {
      const cw = renderState.colorWheels;
      const wl = s.wheelLift; const wg = s.wheelGamma; const wn = s.wheelGain;
      if (cw.lift.r !== wl[0] || cw.lift.g !== wl[1] || cw.lift.b !== wl[2] || cw.lift.y !== wl[3] ||
          cw.gamma.r !== wg[0] || cw.gamma.g !== wg[1] || cw.gamma.b !== wg[2] || cw.gamma.y !== wg[3] ||
          cw.gain.r !== wn[0] || cw.gain.g !== wn[1] || cw.gain.b !== wn[2] || cw.gain.y !== wn[3]) {
        this.setColorWheels(cw);
      }
    }

    // --- False color (2 uniforms) ---
    if (renderState.falseColor.enabled !== s.falseColorEnabled) {
      this.setFalseColor(renderState.falseColor);
    }

    // --- Zebra stripes (5 uniforms, time animates when enabled) ---
    {
      const z = renderState.zebraStripes;
      const newEnabled = z.enabled && (z.highEnabled || z.lowEnabled);
      // Always call when enabled (zebraTime animates), skip when staying disabled
      if (newEnabled || newEnabled !== s.zebraEnabled) {
        this.setZebraStripes(z);
      }
    }

    // --- Channel mode (1 uniform) ---
    {
      const code = CHANNEL_MODE_CODES[renderState.channelMode] ?? 0;
      if (code !== s.channelModeCode) {
        this.setChannelMode(renderState.channelMode);
      }
    }

    // --- LUT 3D (3 uniforms) ---
    {
      const l = renderState.lut;
      if (l.data !== s.lut3DData || l.size !== s.lut3DSize || l.intensity !== s.lut3DIntensity) {
        this.setLUT(l.data, l.size, l.intensity);
      }
    }

    // --- Display color (4 uniforms) ---
    {
      const d = renderState.displayColor;
      if (d.transferFunction !== s.displayTransferCode || d.displayGamma !== s.displayGammaOverride ||
          d.displayBrightness !== s.displayBrightnessMultiplier || d.customGamma !== s.displayCustomGamma) {
        this.setDisplayColorState(d);
      }
    }

    // --- Highlights/shadows (5 uniforms) ---
    {
      const h = renderState.highlightsShadows;
      if (h.highlights / 100 !== s.highlightsValue || h.shadows / 100 !== s.shadowsValue ||
          h.whites / 100 !== s.whitesValue || h.blacks / 100 !== s.blacksValue) {
        this.setHighlightsShadows(h);
      }
    }

    // --- Vibrance (3 uniforms) ---
    {
      const v = renderState.vibrance;
      if (v.amount / 100 !== s.vibranceValue || v.skinProtection !== s.vibranceSkinProtection) {
        this.setVibrance({ vibrance: v.amount, skinProtection: v.skinProtection });
      }
    }

    // --- Clarity (2 uniforms) ---
    if (renderState.clarity / 100 !== s.clarityValue) {
      this.setClarity({ clarity: renderState.clarity });
    }

    // --- Sharpen (2 uniforms) ---
    if (renderState.sharpen / 100 !== s.sharpenAmount) {
      this.setSharpen({ amount: renderState.sharpen });
    }

    // --- HSL qualifier (14 uniforms) ---
    {
      const h = renderState.hslQualifier;
      if (h.enabled !== s.hslQualifierEnabled ||
          h.hue.center !== s.hslHueCenter || h.hue.width !== s.hslHueWidth || h.hue.softness !== s.hslHueSoftness ||
          h.saturation.center !== s.hslSatCenter || h.saturation.width !== s.hslSatWidth || h.saturation.softness !== s.hslSatSoftness ||
          h.luminance.center !== s.hslLumCenter || h.luminance.width !== s.hslLumWidth || h.luminance.softness !== s.hslLumSoftness ||
          h.correction.hueShift !== s.hslCorrHueShift || h.correction.saturationScale !== s.hslCorrSatScale ||
          h.correction.luminanceScale !== s.hslCorrLumScale ||
          h.invert !== s.hslInvert || h.mattePreview !== s.hslMattePreview) {
        this.setHSLQualifier(h);
      }
    }

    // --- Gamut mapping (5 uniforms) ---
    if (renderState.gamutMapping) {
      const gm = renderState.gamutMapping;
      const newEnabled = gm.mode !== 'off' && gm.sourceGamut !== gm.targetGamut;
      const newModeCode = newEnabled ? (GAMUT_MODE_CODES[gm.mode] ?? 0) : 0;
      const newSourceCode = GAMUT_CODES[gm.sourceGamut] ?? 0;
      const newTargetCode = GAMUT_CODES[gm.targetGamut] ?? 0;
      const newHighlight = newEnabled && (gm.highlightOutOfGamut === true);
      if (newEnabled !== s.gamutMappingEnabled ||
          newModeCode !== s.gamutMappingModeCode ||
          newSourceCode !== s.gamutSourceCode ||
          newTargetCode !== s.gamutTargetCode ||
          newHighlight !== s.gamutHighlightEnabled) {
        this.setGamutMapping(gm);
      }
    }

    // --- Deinterlace (3 uniforms) ---
    if (renderState.deinterlace) {
      const di = renderState.deinterlace;
      const newEnabled = di.enabled && di.method !== 1;
      if (newEnabled !== s.deinterlaceEnabled ||
          di.method !== s.deinterlaceMethod ||
          di.fieldOrder !== s.deinterlaceFieldOrder) {
        this.setDeinterlace(di);
      }
    } else if (s.deinterlaceEnabled) {
      this.setDeinterlace({ enabled: false, method: 1, fieldOrder: 0 });
    }

    // --- Film emulation (5 uniforms + LUT texture) ---
    if (renderState.filmEmulation) {
      const fe = renderState.filmEmulation;
      const newEnabled = fe.enabled && fe.intensity > 0;
      if (newEnabled !== s.filmEnabled ||
          fe.intensity !== s.filmIntensity ||
          fe.saturation !== s.filmSaturation ||
          fe.grainIntensity !== s.filmGrainIntensity ||
          fe.grainSeed !== s.filmGrainSeed ||
          fe.lutData !== s.filmLUTData) {
        this.setFilmEmulation(fe);
      }
    } else if (s.filmEnabled) {
      this.setFilmEmulation({ enabled: false, intensity: 0, saturation: 1, grainIntensity: 0, grainSeed: 0, lutData: null });
    }

    // --- Perspective correction (3 uniforms) ---
    if (renderState.perspective) {
      const pc = renderState.perspective;
      if (pc.enabled !== s.perspectiveEnabled ||
          pc.quality !== s.perspectiveQuality ||
          !float32ArrayEquals(pc.invH, s.perspectiveInvH)) {
        this.setPerspective(pc);
      }
    } else if (s.perspectiveEnabled) {
      this.setPerspective({ enabled: false, invH: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), quality: 0 });
    }

    // --- Linearize (log-to-linear conversion, 4 uniforms) ---
    if (renderState.linearize) {
      const lz = renderState.linearize;
      if (lz.logType !== s.linearizeLogType ||
          lz.sRGB2linear !== s.linearizeSRGB2linear ||
          lz.rec709ToLinear !== s.linearizeRec709ToLinear ||
          lz.fileGamma !== s.linearizeFileGamma ||
          lz.alphaType !== s.linearizeAlphaType) {
        this.setLinearize(lz);
      }
    } else if (s.linearizeLogType !== 0 || s.linearizeSRGB2linear || s.linearizeRec709ToLinear || s.linearizeFileGamma !== 1.0 || s.linearizeAlphaType !== 0) {
      this.setLinearize({ logType: 0, sRGB2linear: false, rec709ToLinear: false, fileGamma: 1.0, alphaType: 0 });
    }

    // --- Out-of-range visualization (1 uniform) ---
    {
      const newOutOfRange = renderState.outOfRange ?? 0;
      if (newOutOfRange !== s.outOfRange) {
        this.setOutOfRange(newOutOfRange);
      }
    }

    // --- Premultiply/unpremultiply alpha (1 uniform) ---
    {
      const newPremult = renderState.premultMode ?? 0;
      if (newPremult !== s.premultMode) {
        this.setPremultMode(newPremult);
      }
    }

    // --- Channel swizzle (1 uniform, ivec4) ---
    if (renderState.channelSwizzle) {
      const cs = renderState.channelSwizzle;
      if (cs[0] !== s.channelSwizzle[0] || cs[1] !== s.channelSwizzle[1] ||
          cs[2] !== s.channelSwizzle[2] || cs[3] !== s.channelSwizzle[3]) {
        this.setChannelSwizzle(cs);
      }
    } else if (s.channelSwizzle[0] !== 0 || s.channelSwizzle[1] !== 1 ||
               s.channelSwizzle[2] !== 2 || s.channelSwizzle[3] !== 3) {
      this.setChannelSwizzle([0, 1, 2, 3]);
    }
  }

  // -----------------------------------------------------------------------
  // Uniform upload
  // -----------------------------------------------------------------------

  /**
   * Push dirty uniforms to the shader, then clear dirty flags.
   *
   * Callers must set u_inputTransfer and u_outputMode BEFORE calling this,
   * since those differ between the two render paths (renderImage vs renderSDRFrame).
   *
   * @param shader  The compiled display shader program.
   * @param texCb   Callbacks for texture management (owned by Renderer).
   */
  applyUniforms(
    shader: ShaderProgram,
    texCb: TextureCallbacks,
  ): void {
    const dirty = this.dirtyFlags;
    const s = this.state;

    // Color adjustments
    if (dirty.has(DIRTY_COLOR)) {
      // Per-channel vec3 uniforms: broadcast scalar when per-channel data is absent
      const adj = s.colorAdjustments;
      const expRGB = adj.exposureRGB ?? [adj.exposure, adj.exposure, adj.exposure];
      const gamRGB = adj.gammaRGB ?? [adj.gamma, adj.gamma, adj.gamma];
      const conRGB = adj.contrastRGB ?? [adj.contrast, adj.contrast, adj.contrast];

      // Sanitize: clamp gamma to avoid division by zero in shader (1.0/0.0 = Inf)
      const safeGammaRGB: [number, number, number] = [
        gamRGB[0] <= 0 ? 1e-4 : gamRGB[0],
        gamRGB[1] <= 0 ? 1e-4 : gamRGB[1],
        gamRGB[2] <= 0 ? 1e-4 : gamRGB[2],
      ];

      // Sanitize exposure: replace non-finite values with 0
      const safeExposureRGB: [number, number, number] = [
        Number.isFinite(expRGB[0]) ? expRGB[0] : 0,
        Number.isFinite(expRGB[1]) ? expRGB[1] : 0,
        Number.isFinite(expRGB[2]) ? expRGB[2] : 0,
      ];

      // Per-channel scale: broadcast scalar when per-channel is absent; identity = [1,1,1]
      const scaleScalar = adj.scale ?? 1;
      const sclRGB = adj.scaleRGB ?? [scaleScalar, scaleScalar, scaleScalar];
      // Per-channel offset: broadcast scalar when per-channel is absent; identity = [0,0,0]
      const offsetScalar = adj.offset ?? 0;
      const offRGB = adj.offsetRGB ?? [offsetScalar, offsetScalar, offsetScalar];

      shader.setUniform('u_exposureRGB', safeExposureRGB);
      shader.setUniform('u_gammaRGB', safeGammaRGB);
      shader.setUniform('u_contrastRGB', conRGB);
      shader.setUniform('u_scaleRGB', sclRGB);
      shader.setUniform('u_offsetRGB', offRGB);
      shader.setUniform('u_saturation', adj.saturation);
      shader.setUniform('u_brightness', adj.brightness);
      shader.setUniform('u_temperature', adj.temperature);
      shader.setUniform('u_tint', adj.tint);

      // Hue rotation
      const hueRotationDegrees = adj.hueRotation;
      if (isIdentityHueRotation(hueRotationDegrees)) {
        shader.setUniformInt('u_hueRotationEnabled', 0);
      } else {
        shader.setUniformInt('u_hueRotationEnabled', 1);
        const hueMatrix = getHueRotationMatrix(hueRotationDegrees);
        shader.setUniformMatrix3('u_hueRotationMatrix', hueMatrix);
      }
    }

    // Tone mapping
    if (dirty.has(DIRTY_TONE_MAPPING)) {
      const toneMappingCode = s.toneMappingState.enabled
        ? TONE_MAPPING_OPERATOR_CODES[s.toneMappingState.operator]
        : 0;
      shader.setUniformInt('u_toneMappingOperator', toneMappingCode);
      shader.setUniform('u_tmReinhardWhitePoint', s.toneMappingState.reinhardWhitePoint ?? 4.0);
      shader.setUniform('u_tmFilmicExposureBias', s.toneMappingState.filmicExposureBias ?? 2.0);
      shader.setUniform('u_tmDragoBias', s.toneMappingState.dragoBias ?? 0.85);
      shader.setUniform('u_tmDragoLwa', s.toneMappingState.dragoLwa ?? 0.2);
      shader.setUniform('u_tmDragoLmax', s.toneMappingState.dragoLmax ?? 1.5);
      shader.setUniform('u_tmDragoBrightness', s.toneMappingState.dragoBrightness ?? 2.0);
      shader.setUniform('u_tmFilmicWhitePoint', s.toneMappingState.filmicWhitePoint ?? 11.2);
    }

    // Color inversion
    if (dirty.has(DIRTY_INVERSION)) {
      shader.setUniformInt('u_invert', s.colorInversionEnabled ? 1 : 0);
    }

    // CDL
    if (dirty.has(DIRTY_CDL)) {
      shader.setUniformInt('u_cdlEnabled', s.cdlEnabled ? 1 : 0);
      if (s.cdlEnabled) {
        shader.setUniform('u_cdlSlope', s.cdlSlope);
        shader.setUniform('u_cdlOffset', s.cdlOffset);
        shader.setUniform('u_cdlPower', s.cdlPower);
        shader.setUniform('u_cdlSaturation', s.cdlSaturation);
        shader.setUniformInt('u_cdlColorspace', s.cdlColorspace);
      }
    }

    // Curves LUT
    if (dirty.has(DIRTY_CURVES)) {
      shader.setUniformInt('u_curvesEnabled', s.curvesEnabled ? 1 : 0);
    }

    // Inline 1D LUT (from RVColor luminanceLUT)
    if (dirty.has(DIRTY_INLINE_LUT)) {
      shader.setUniformInt('u_inlineLUTEnabled', s.inlineLUTEnabled ? 1 : 0);
      if (s.inlineLUTEnabled) {
        shader.setUniformInt('u_inlineLUTChannels', s.inlineLUTChannels);
        shader.setUniform('u_inlineLUTSize', s.inlineLUTSize);
      }
    }

    // Color Wheels
    if (dirty.has(DIRTY_COLOR_WHEELS)) {
      shader.setUniformInt('u_colorWheelsEnabled', s.colorWheelsEnabled ? 1 : 0);
      if (s.colorWheelsEnabled) {
        shader.setUniform('u_wheelLift', s.wheelLift);
        shader.setUniform('u_wheelGamma', s.wheelGamma);
        shader.setUniform('u_wheelGain', s.wheelGain);
      }
    }

    // False Color
    if (dirty.has(DIRTY_FALSE_COLOR)) {
      shader.setUniformInt('u_falseColorEnabled', s.falseColorEnabled ? 1 : 0);
    }

    // Zebra Stripes
    if (dirty.has(DIRTY_ZEBRA)) {
      shader.setUniformInt('u_zebraEnabled', s.zebraEnabled ? 1 : 0);
      if (s.zebraEnabled) {
        shader.setUniform('u_zebraHighThreshold', s.zebraHighThreshold);
        shader.setUniform('u_zebraLowThreshold', s.zebraLowThreshold);
        shader.setUniform('u_zebraTime', s.zebraTime);
        shader.setUniformInt('u_zebraHighEnabled', s.zebraHighEnabled ? 1 : 0);
        shader.setUniformInt('u_zebraLowEnabled', s.zebraLowEnabled ? 1 : 0);
      }
    }

    // Channel mode
    if (dirty.has(DIRTY_CHANNELS)) {
      shader.setUniformInt('u_channelMode', s.channelModeCode);
    }

    // 3D LUT
    if (dirty.has(DIRTY_LUT3D)) {
      shader.setUniformInt('u_lut3DEnabled', s.lut3DEnabled ? 1 : 0);
      if (s.lut3DEnabled) {
        shader.setUniform('u_lut3DIntensity', s.lut3DIntensity);
        shader.setUniform('u_lut3DSize', s.lut3DSize);
      }
    }

    // Display transfer function
    if (dirty.has(DIRTY_DISPLAY)) {
      shader.setUniformInt('u_displayTransfer', s.displayTransferCode);
      shader.setUniform('u_displayGamma', s.displayGammaOverride);
      shader.setUniform('u_displayBrightness', s.displayBrightnessMultiplier);
      shader.setUniform('u_displayCustomGamma', s.displayCustomGamma);
    }

    // Background pattern
    if (dirty.has(DIRTY_BACKGROUND)) {
      shader.setUniformInt('u_backgroundPattern', s.bgPatternCode);
      if (s.bgPatternCode !== BG_PATTERN_NONE) {
        shader.setUniform('u_bgColor1', s.bgColor1);
        shader.setUniform('u_bgColor2', s.bgColor2);
        shader.setUniform('u_bgCheckerSize', s.bgCheckerSize);
      }
    }
    // Resolution is always needed for zebra stripes too and can change
    // without a setter (via resize()), so it is set unconditionally.
    // Reuse pre-allocated buffer to avoid per-frame allocation.
    const canvasSize = texCb.getCanvasSize();
    this.resolutionBuffer[0] = canvasSize.width;
    this.resolutionBuffer[1] = canvasSize.height;
    shader.setUniform('u_resolution', this.resolutionBuffer);

    // --- Phase 1B: New GPU shader effect uniforms ---

    // Highlights/Shadows/Whites/Blacks
    if (dirty.has(DIRTY_HIGHLIGHTS_SHADOWS)) {
      shader.setUniformInt('u_hsEnabled', s.hsEnabled ? 1 : 0);
      if (s.hsEnabled) {
        shader.setUniform('u_highlights', s.highlightsValue);
        shader.setUniform('u_shadows', s.shadowsValue);
        shader.setUniform('u_whites', s.whitesValue);
        shader.setUniform('u_blacks', s.blacksValue);
      }
    }

    // Vibrance
    if (dirty.has(DIRTY_VIBRANCE)) {
      shader.setUniformInt('u_vibranceEnabled', s.vibranceEnabled ? 1 : 0);
      if (s.vibranceEnabled) {
        shader.setUniform('u_vibrance', s.vibranceValue);
        shader.setUniformInt('u_vibranceSkinProtection', s.vibranceSkinProtection ? 1 : 0);
      }
    }

    // Clarity
    if (dirty.has(DIRTY_CLARITY)) {
      shader.setUniformInt('u_clarityEnabled', s.clarityEnabled ? 1 : 0);
      if (s.clarityEnabled) {
        shader.setUniform('u_clarity', s.clarityValue);
      }
    }

    // Sharpen
    if (dirty.has(DIRTY_SHARPEN)) {
      shader.setUniformInt('u_sharpenEnabled', s.sharpenEnabled ? 1 : 0);
      if (s.sharpenEnabled) {
        shader.setUniform('u_sharpenAmount', s.sharpenAmount);
      }
    }

    // Texel size (needed for clarity and sharpen)
    if ((dirty.has(DIRTY_CLARITY) || dirty.has(DIRTY_SHARPEN)) && (s.clarityEnabled || s.sharpenEnabled)) {
      shader.setUniform('u_texelSize', s.texelSize);
    }

    // HSL Qualifier
    if (dirty.has(DIRTY_HSL)) {
      shader.setUniformInt('u_hslQualifierEnabled', s.hslQualifierEnabled ? 1 : 0);
      if (s.hslQualifierEnabled) {
        shader.setUniform('u_hslHueCenter', s.hslHueCenter);
        shader.setUniform('u_hslHueWidth', s.hslHueWidth);
        shader.setUniform('u_hslHueSoftness', s.hslHueSoftness);
        shader.setUniform('u_hslSatCenter', s.hslSatCenter);
        shader.setUniform('u_hslSatWidth', s.hslSatWidth);
        shader.setUniform('u_hslSatSoftness', s.hslSatSoftness);
        shader.setUniform('u_hslLumCenter', s.hslLumCenter);
        shader.setUniform('u_hslLumWidth', s.hslLumWidth);
        shader.setUniform('u_hslLumSoftness', s.hslLumSoftness);
        shader.setUniform('u_hslCorrHueShift', s.hslCorrHueShift);
        shader.setUniform('u_hslCorrSatScale', s.hslCorrSatScale);
        shader.setUniform('u_hslCorrLumScale', s.hslCorrLumScale);
        shader.setUniformInt('u_hslInvert', s.hslInvert ? 1 : 0);
        shader.setUniformInt('u_hslMattePreview', s.hslMattePreview ? 1 : 0);
      }
    }

    // Gamut Mapping
    if (dirty.has(DIRTY_GAMUT_MAPPING)) {
      shader.setUniformInt('u_gamutMappingEnabled', s.gamutMappingEnabled ? 1 : 0);
      if (s.gamutMappingEnabled) {
        shader.setUniformInt('u_gamutMappingMode', s.gamutMappingModeCode);
        shader.setUniformInt('u_sourceGamut', s.gamutSourceCode);
        shader.setUniformInt('u_targetGamut', s.gamutTargetCode);
        shader.setUniformInt('u_gamutHighlightEnabled', s.gamutHighlightEnabled ? 1 : 0);
      } else {
        shader.setUniformInt('u_gamutHighlightEnabled', 0);
      }
    }

    // Deinterlace
    if (dirty.has(DIRTY_DEINTERLACE)) {
      shader.setUniformInt('u_deinterlaceEnabled', s.deinterlaceEnabled ? 1 : 0);
      if (s.deinterlaceEnabled) {
        shader.setUniformInt('u_deinterlaceMethod', s.deinterlaceMethod);
        shader.setUniformInt('u_deinterlaceFieldOrder', s.deinterlaceFieldOrder);
      }
    }

    // Texel size - also needed for deinterlace
    if ((dirty.has(DIRTY_DEINTERLACE)) && s.deinterlaceEnabled) {
      shader.setUniform('u_texelSize', s.texelSize);
    }

    // Film Emulation
    if (dirty.has(DIRTY_FILM_EMULATION)) {
      shader.setUniformInt('u_filmEnabled', s.filmEnabled ? 1 : 0);
      if (s.filmEnabled) {
        shader.setUniform('u_filmIntensity', s.filmIntensity);
        shader.setUniform('u_filmSaturation', s.filmSaturation);
        shader.setUniform('u_filmGrainIntensity', s.filmGrainIntensity);
        shader.setUniform('u_filmGrainSeed', s.filmGrainSeed);
      }
    }

    // Linearize (log-to-linear conversion)
    if (dirty.has(DIRTY_LINEARIZE)) {
      shader.setUniformInt('u_linearizeLogType', s.linearizeLogType);
      shader.setUniform('u_linearizeFileGamma', s.linearizeFileGamma);
      shader.setUniformInt('u_linearizeSRGB2linear', s.linearizeSRGB2linear ? 1 : 0);
      shader.setUniformInt('u_linearizeRec709ToLinear', s.linearizeRec709ToLinear ? 1 : 0);
    }

    // Out-of-range visualization
    if (dirty.has(DIRTY_OUT_OF_RANGE)) {
      shader.setUniformInt('u_outOfRange', s.outOfRange);
    }

    // Premultiply/unpremultiply alpha
    if (dirty.has(DIRTY_PREMULT)) {
      shader.setUniformInt('u_premult', s.premultMode);
    }

    // Channel swizzle (RVChannelMap remapping)
    if (dirty.has(DIRTY_CHANNEL_SWIZZLE)) {
      shader.setUniform('u_channelSwizzle', new Int32Array(s.channelSwizzle));
    }

    // Perspective Correction
    if (dirty.has(DIRTY_PERSPECTIVE)) {
      shader.setUniformInt('u_perspectiveEnabled', s.perspectiveEnabled ? 1 : 0);
      if (s.perspectiveEnabled) {
        shader.setUniformMatrix3('u_perspectiveInvH', s.perspectiveInvH);
        shader.setUniformInt('u_perspectiveQuality', s.perspectiveQuality);
        // Texel size needed for bicubic perspective interpolation
        if (s.perspectiveQuality === 1) {
          shader.setUniform('u_texelSize', s.texelSize);
        }
      }
    }

    // --- Bind effect textures ---
    // IMPORTANT: Always set sampler uniform-to-unit bindings unconditionally,
    // even when the effect is disabled. In WebGL2, all sampler uniforms default
    // to texture unit 0. If a sampler3D (u_lut3D) and a sampler2D (u_texture)
    // both point to unit 0, glDrawArrays fails with GL_INVALID_OPERATION:
    // "Two textures of different types use the same sampler location."

    // Texture unit 1: curves LUT
    shader.setUniformInt('u_curvesLUT', 1);
    if (s.curvesEnabled) {
      texCb.bindCurvesLUTTexture();
    }

    // Texture unit 2: false color LUT
    shader.setUniformInt('u_falseColorLUT', 2);
    if (s.falseColorEnabled) {
      texCb.bindFalseColorLUTTexture();
    }

    // Texture unit 3: 3D LUT
    shader.setUniformInt('u_lut3D', 3);
    if (s.lut3DEnabled) {
      texCb.bindLUT3DTexture();
    }

    // Texture unit 4: film emulation LUT
    shader.setUniformInt('u_filmLUT', 4);
    if (s.filmEnabled) {
      texCb.bindFilmLUTTexture();
    }

    // Texture unit 5: inline 1D LUT (RVColor luminanceLUT)
    shader.setUniformInt('u_inlineLUT', 5);
    if (s.inlineLUTEnabled) {
      texCb.bindInlineLUTTexture();
    }

    // Clear all dirty flags after uniforms have been set
    dirty.clear();
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
    this.cachedColorAdjustments = null;
    this.cachedToneMappingState = null;
  }
}
