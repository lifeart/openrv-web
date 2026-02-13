/**
 * StateAccessor - Interface decoupling the Renderer from concrete state management.
 *
 * The Renderer only depends on this interface, not on ShaderStateManager directly.
 * This enables swapping state management implementations (e.g., for a WebGPU backend)
 * without modifying the Renderer.
 *
 * Methods fall into three categories:
 * 1. State setters (delegated from Renderer's public API)
 * 2. State getters (for Renderer's public getters)
 * 3. Uniform/texture lifecycle (applyUniforms, texture dirty tracking)
 */

import type { ShaderProgram } from './ShaderProgram';
import type { ColorAdjustments, ColorWheelsState, ChannelMode, HSLQualifierState } from '../core/types/color';
import type { ToneMappingState, ZebraState, HighlightsShadowsState, VibranceState, ClarityState, SharpenState, FalseColorState, GamutMappingState } from '../core/types/effects';
import type { BackgroundPatternState } from '../core/types/background';
import type { CDLValues } from '../color/CDL';
import type { CurveLUTs } from '../color/ColorCurves';
import type { RenderState, DisplayColorConfig } from './RenderState';
import type { TextureCallbacks } from './ShaderStateManager';

// ---------------------------------------------------------------------------
// Texture data snapshots (replacements for getInternalState() coupling)
// ---------------------------------------------------------------------------

/** Read-only snapshot of curves LUT texture data needed by the Renderer. */
export interface CurvesLUTSnapshot {
  readonly dirty: boolean;
  readonly data: Uint8Array | null;
}

/** Read-only snapshot of false color LUT texture data needed by the Renderer. */
export interface FalseColorLUTSnapshot {
  readonly dirty: boolean;
  readonly data: Uint8Array | null;
}

/** Read-only snapshot of 3D LUT texture data needed by the Renderer. */
export interface LUT3DSnapshot {
  readonly dirty: boolean;
  readonly data: Float32Array | null;
  readonly size: number;
}

// ---------------------------------------------------------------------------
// StateAccessor interface
// ---------------------------------------------------------------------------

export interface StateAccessor {
  // --- State getters ---

  /** Get a copy of the current color adjustments. */
  getColorAdjustments(): ColorAdjustments;

  /** Get the current color inversion state. */
  getColorInversion(): boolean;

  /** Get a copy of the current tone mapping state. */
  getToneMappingState(): ToneMappingState;

  // --- State setters ---

  /** Set color adjustments (exposure, gamma, saturation, etc.). */
  setColorAdjustments(adjustments: ColorAdjustments): void;

  /** Reset color adjustments to defaults. */
  resetColorAdjustments(): void;

  /** Enable or disable color inversion. */
  setColorInversion(enabled: boolean): void;

  /** Set tone mapping state. */
  setToneMappingState(state: ToneMappingState): void;

  /** Reset tone mapping to defaults. */
  resetToneMappingState(): void;

  /** Set the background pattern state. */
  setBackgroundPattern(state: BackgroundPatternState): void;

  /** Set CDL (Color Decision List) values. */
  setCDL(cdl: CDLValues): void;

  /** Set curves LUT data. Null disables curves. */
  setCurvesLUT(luts: CurveLUTs | null): void;

  /** Set color wheels (Lift/Gamma/Gain) state. */
  setColorWheels(state: ColorWheelsState): void;

  /** Set false color state. */
  setFalseColor(state: FalseColorState): void;

  /** Set zebra stripes state. */
  setZebraStripes(state: ZebraState): void;

  /** Set channel isolation mode. */
  setChannelMode(mode: ChannelMode): void;

  /** Set 3D LUT data, size, and intensity. Null data disables. */
  setLUT(lutData: Float32Array | null, lutSize: number, intensity: number): void;

  /** Get the current display color management state. */
  getDisplayColorState(): DisplayColorConfig;

  /** Set display color management state. */
  setDisplayColorState(state: DisplayColorConfig): void;

  /** Set highlights/shadows/whites/blacks. */
  setHighlightsShadows(state: HighlightsShadowsState): void;

  /** Set vibrance amount and skin protection. */
  setVibrance(state: VibranceState): void;

  /** Set clarity (local contrast). */
  setClarity(state: ClarityState): void;

  /** Set sharpen (unsharp mask). */
  setSharpen(state: SharpenState): void;

  /** Set HSL qualifier (secondary color correction). */
  setHSLQualifier(state: HSLQualifierState): void;

  /** Set gamut mapping state. */
  setGamutMapping(state: GamutMappingState): void;

  /** Get the current gamut mapping state. */
  getGamutMapping(): GamutMappingState;

  /** Set deinterlace state for GPU shader. */
  setDeinterlace(state: { enabled: boolean; method: number; fieldOrder: number }): void;

  /** Set film emulation state for GPU shader. */
  setFilmEmulation(state: { enabled: boolean; intensity: number; saturation: number; grainIntensity: number; grainSeed: number; lutData: Uint8Array | null }): void;

  /** Set texel size (called before applyUniforms based on image dimensions). */
  setTexelSize(w: number, h: number): void;

  // --- Batch state ---

  /** Apply all render state from a RenderState object. */
  applyRenderState(renderState: RenderState): void;

  /**
   * Returns true if applyRenderState() (or any setter) has marked dirty flags
   * that haven't been pushed to the GPU yet via applyUniforms().
   * Used to detect whether a re-render is actually needed.
   */
  hasPendingStateChanges(): boolean;

  // --- Uniform upload ---

  /**
   * Push dirty uniforms to the shader and bind textures.
   *
   * Callers must set u_inputTransfer and u_outputMode BEFORE calling this.
   */
  applyUniforms(shader: ShaderProgram, texCb: TextureCallbacks): void;

  // --- Texture data access (replaces getInternalState() coupling) ---

  /** Get the current curves LUT texture data and dirty state. */
  getCurvesLUTSnapshot(): CurvesLUTSnapshot;

  /** Get the current false color LUT texture data and dirty state. */
  getFalseColorLUTSnapshot(): FalseColorLUTSnapshot;

  /** Get the current 3D LUT texture data and dirty state. */
  getLUT3DSnapshot(): LUT3DSnapshot;

  /**
   * Clear a texture-specific dirty flag after the Renderer has uploaded
   * the corresponding texture data to the GPU.
   */
  clearTextureDirtyFlag(flag: 'curvesLUTDirty' | 'falseColorLUTDirty' | 'lut3DDirty' | 'filmLUTDirty'): void;
}
