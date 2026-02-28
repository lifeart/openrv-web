/**
 * ShaderStage - Stage descriptor interface for the multi-pass shader pipeline.
 *
 * Each stage represents a logical group of processing phases from the monolithic
 * viewer.frag.glsl. Stages can be skipped when their effect is identity (no-op),
 * avoiding unnecessary FBO passes and uniform uploads.
 */

import type { ShaderProgram } from './ShaderProgram';
import type { InternalShaderState, TextureCallbacks } from './ShaderStateManager';

/** Identifies a shader pipeline stage (11 stages total). */
export type StageId =
  | 'inputDecode'        // Phases 0a-0b2: deinterlace, perspective, spherical, swizzle, unpremultiply
  | 'linearize'          // Phases 0c-0e: log-to-linear, EOTF, input primaries
  | 'primaryGrade'       // Phases 1-5: exposure, scale/offset, inline LUT, temp/tint, brightness, contrast, saturation
  | 'secondaryGrade'     // Phases 5b-5d: highlights/shadows/whites/blacks, vibrance, hue rotation
  | 'spatialEffects'     // Phase 5e: clarity only (pre-tone-mapping, samples neighboring pixels)
  | 'colorPipeline'      // Phases 6a-6f: color wheels, CDL, curves, 3D LUT, HSL qualifier, film emulation
  | 'sceneAnalysis'      // Phases 6g-7a: out-of-range, tone mapping, gamut mapping
  | 'spatialEffectsPost' // Phase 7b: sharpen only (post-tone-mapping, samples neighboring pixels)
  | 'displayOutput'      // Phases 7c-9: output primaries, display transfer/gamma/brightness, inversion
  | 'diagnostics'        // Phases 10-12c: channel isolation, false color, zebra, dither/quantize
  | 'compositing';       // Phases SDR-13: SDR clamp, premultiply, background blend

/** Metadata for a single shader pipeline stage. */
export interface ShaderStageDescriptor {
  /** Unique stage identifier. */
  readonly id: StageId;

  /** Display name for debugging/profiling. */
  readonly name: string;

  /** GLSL fragment shader source (imported from separate .glsl file). */
  readonly fragmentSource: string;

  /**
   * Returns true when this stage has no effect and can be skipped.
   * Checked every frame BEFORE uploading any uniforms.
   */
  isIdentity: (state: Readonly<InternalShaderState>) => boolean;

  /**
   * Upload only this stage's uniforms to the given shader program.
   * Called only when the stage is NOT skipped.
   */
  applyUniforms: (
    shader: ShaderProgram,
    state: Readonly<InternalShaderState>,
    texCb: TextureCallbacks,
  ) => void;

  /**
   * Dirty flags that this stage depends on.
   * When none of these flags are dirty, uniform upload is skipped entirely.
   * @todo Wire up dirty-flag optimization in ShaderPipeline.execute() (Phase B+).
   */
  readonly dirtyFlags: ReadonlySet<string>;

  /**
   * Texture units this stage needs bound (e.g., curves LUT, 3D LUT).
   * Unit 0 is always reserved for u_inputTexture (the ping-pong read texture).
   */
  textureBindings?: ReadonlyArray<{
    unit: number;
    bindCallback: keyof TextureCallbacks;
  }>;

  /**
   * Whether this stage requires bilinear (LINEAR) texture filtering on its
   * input FBO texture. Stages that sample neighboring pixels (clarity, sharpen,
   * perspective bicubic) set this to true. All other stages use NEAREST
   * filtering to prevent sub-texel blending artifacts across FBO passes.
   * Default: false (NEAREST filtering).
   */
  needsBilinearInput?: boolean;
}
