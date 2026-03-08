/**
 * Shader state types, factory, and utility functions.
 */

import type { ColorAdjustments } from '../core/types/color';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../core/types/color';
import type { ToneMappingState } from '../core/types/effects';
import { DEFAULT_TONE_MAPPING_STATE } from '../core/types/effects';
import { DISPLAY_TRANSFER_SRGB } from '../config/RenderConfig';
import {
  BG_PATTERN_NONE,
  CHANNEL_MODE_CODES,
  DEFAULT_CHECKER_SIZE,
  DEFAULT_ZEBRA_HIGH_THRESHOLD,
  DEFAULT_ZEBRA_LOW_THRESHOLD,
} from './ShaderConstants';

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
  cdlColorspace: number; // 0=rec709/direct, 1=ACEScct

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

  // Look LUT (renamed from lut3D -- per-source creative grade)
  lut3DEnabled: boolean;
  lut3DIntensity: number;
  lut3DSize: number;
  lut3DDirty: boolean;
  lut3DData: Float32Array | null;
  lookLUT3DDomainMin: [number, number, number];
  lookLUT3DDomainMax: [number, number, number];

  // File LUT (per-source, applied after EOTF, before input primaries)
  fileLUT3DEnabled: boolean;
  fileLUT3DIntensity: number;
  fileLUT3DSize: number;
  fileLUT3DDirty: boolean;
  fileLUT3DData: Float32Array | null;
  fileLUT3DDomainMin: [number, number, number];
  fileLUT3DDomainMax: [number, number, number];

  // Display LUT (session-wide, after output primaries, before display transfer)
  displayLUT3DEnabled: boolean;
  displayLUT3DIntensity: number;
  displayLUT3DSize: number;
  displayLUT3DDirty: boolean;
  displayLUT3DData: Float32Array | null;
  displayLUT3DDomainMin: [number, number, number];
  displayLUT3DDomainMax: [number, number, number];

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
  deinterlaceMethod: number; // 0=bob, 1=weave, 2=blend
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
  linearizeLogType: number; // 0=none, 1=cineon, 2=viper, 3=logc3
  linearizeSRGB2linear: boolean;
  linearizeRec709ToLinear: boolean;
  linearizeFileGamma: number;
  linearizeInputTransfer: number; // 0=sRGB/linear, 1=HLG, 2=PQ, 7=SMPTE240M
  linearizeAlphaType: number;

  // Inline 1D LUT (from RVColor luminanceLUT)
  inlineLUTEnabled: boolean;
  inlineLUTChannels: number; // 1=luminance, 3=per-channel RGB
  inlineLUTSize: number; // number of entries per channel
  inlineLUTData: Float32Array | null;
  inlineLUTDirty: boolean;

  // Out-of-range visualization mode
  outOfRange: number; // 0=off, 1=clamp-to-black, 2=highlight

  // Spherical (equirectangular 360) projection
  sphericalEnabled: boolean;
  sphericalFov: number; // horizontal FOV in radians
  sphericalAspect: number; // canvas width / height
  sphericalYaw: number; // yaw in radians
  sphericalPitch: number; // pitch in radians

  // Channel swizzle (RVChannelMap remapping)
  channelSwizzle: [number, number, number, number]; // default [0,1,2,3] = identity

  // Premultiply/unpremultiply alpha mode
  premultMode: number; // 0=off, 1=premultiply, 2=unpremultiply

  // Dither + Quantize visualization
  ditherMode: number; // 0=off, 1=ordered Bayer 8x8, 2=blue noise (future)
  quantizeBits: number; // 0=off, 2-16 = target bit depth for quantize/posterize

  // Contour visualization (luminance iso-lines)
  contourEnabled: boolean;
  contourLevels: number;
  contourDesaturate: boolean;
  contourLineColor: [number, number, number];

  // Automatic color primaries conversion
  inputPrimariesEnabled: boolean;
  inputPrimariesMatrix: Float32Array; // 9 floats, column-major mat3
  outputPrimariesEnabled: boolean;
  outputPrimariesMatrix: Float32Array; // 9 floats, column-major mat3
}

export function createDefaultInternalState(): InternalShaderState {
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
    lookLUT3DDomainMin: [0, 0, 0],
    lookLUT3DDomainMax: [1, 1, 1],
    fileLUT3DEnabled: false,
    fileLUT3DIntensity: 1.0,
    fileLUT3DSize: 0,
    fileLUT3DDirty: true,
    fileLUT3DData: null,
    fileLUT3DDomainMin: [0, 0, 0],
    fileLUT3DDomainMax: [1, 1, 1],
    displayLUT3DEnabled: false,
    displayLUT3DIntensity: 1.0,
    displayLUT3DSize: 0,
    displayLUT3DDirty: true,
    displayLUT3DData: null,
    displayLUT3DDomainMin: [0, 0, 0],
    displayLUT3DDomainMax: [1, 1, 1],
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
    linearizeInputTransfer: 0,
    linearizeAlphaType: 0,
    inlineLUTEnabled: false,
    inlineLUTChannels: 1,
    inlineLUTSize: 0,
    inlineLUTData: null,
    inlineLUTDirty: false,
    outOfRange: 0,
    sphericalEnabled: false,
    sphericalFov: Math.PI / 2,
    sphericalAspect: 1,
    sphericalYaw: 0,
    sphericalPitch: 0,
    channelSwizzle: [0, 1, 2, 3],
    premultMode: 0,
    ditherMode: 0,
    quantizeBits: 0,
    contourEnabled: false,
    contourLevels: 10,
    contourDesaturate: true,
    contourLineColor: [1.0, 1.0, 1.0],
    inputPrimariesEnabled: false,
    inputPrimariesMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    outputPrimariesEnabled: false,
    outputPrimariesMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
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
  /** Ensure 3D LUT (Look) texture exists, upload if dirty, activate TEXTURE3, bind. */
  bindLUT3DTexture(): void;
  /** Ensure film LUT texture exists, upload if dirty, activate TEXTURE4, bind. */
  bindFilmLUTTexture(): void;
  /** Ensure inline LUT texture exists, upload if dirty, activate TEXTURE5, bind. */
  bindInlineLUTTexture(): void;
  /** Ensure File LUT 3D texture exists, upload if dirty, activate TEXTURE6, bind. */
  bindFileLUT3DTexture(): void;
  /** Ensure Display LUT 3D texture exists, upload if dirty, activate TEXTURE7, bind. */
  bindDisplayLUT3DTexture(): void;
  /** Get the current canvas dimensions for u_resolution. */
  getCanvasSize(): { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Compare two Float32Array instances element-by-element. */
export function float32ArrayEquals(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Parse hex color into an existing tuple (avoids allocation). */
export function hexToRgbInto(hex: string, out: [number, number, number]): void {
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
export function assignColorAdjustments(dst: ColorAdjustments, src: Readonly<ColorAdjustments>): void {
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
export function assignToneMappingState(dst: ToneMappingState, src: Readonly<ToneMappingState>): void {
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
