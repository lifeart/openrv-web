/**
 * StereoManager - Manages stereo/3D viewing state for the Viewer.
 *
 * Extracted from Viewer.ts to separate the stereo concern (stereo mode,
 * per-eye transforms, alignment overlay) from the monolithic Viewer class.
 *
 * The manager owns the state and applies stereo transformations to canvas
 * contexts. The Viewer is responsible for scheduling renders after state changes.
 */

import {
  StereoState,
  DEFAULT_STEREO_STATE,
  isDefaultStereoState,
  applyStereoMode as applyStereoModeUtil,
  applyStereoModeWithEyeTransforms as applyStereoModeWithEyeTransformsUtil,
  StereoEyeTransformState,
  StereoAlignMode,
  DEFAULT_STEREO_EYE_TRANSFORM_STATE,
  DEFAULT_STEREO_ALIGN_MODE,
  isDefaultStereoEyeTransformState,
} from '../../stereo/StereoRenderer';

export class StereoManager {
  private _stereoState: StereoState = { ...DEFAULT_STEREO_STATE };
  private _stereoEyeTransformState: StereoEyeTransformState = {
    ...DEFAULT_STEREO_EYE_TRANSFORM_STATE,
    left: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.left },
    right: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.right },
  };
  private _stereoAlignMode: StereoAlignMode = DEFAULT_STEREO_ALIGN_MODE;

  // =========================================================================
  // Stereo State
  // =========================================================================

  get stereoState(): StereoState {
    return this._stereoState;
  }

  setStereoState(state: StereoState): void {
    this._stereoState = { ...state };
  }

  getStereoState(): StereoState {
    return { ...this._stereoState };
  }

  resetStereoState(): void {
    this._stereoState = { ...DEFAULT_STEREO_STATE };
  }

  isDefaultStereo(): boolean {
    return isDefaultStereoState(this._stereoState);
  }

  // =========================================================================
  // Per-Eye Transforms
  // =========================================================================

  get stereoEyeTransformState(): StereoEyeTransformState {
    return this._stereoEyeTransformState;
  }

  setStereoEyeTransforms(state: StereoEyeTransformState): void {
    this._stereoEyeTransformState = {
      left: { ...state.left },
      right: { ...state.right },
      linked: state.linked,
    };
  }

  getStereoEyeTransforms(): StereoEyeTransformState {
    return {
      left: { ...this._stereoEyeTransformState.left },
      right: { ...this._stereoEyeTransformState.right },
      linked: this._stereoEyeTransformState.linked,
    };
  }

  resetStereoEyeTransforms(): void {
    this._stereoEyeTransformState = {
      left: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.left },
      right: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.right },
      linked: false,
    };
  }

  hasEyeTransforms(): boolean {
    return !isDefaultStereoEyeTransformState(this._stereoEyeTransformState);
  }

  // =========================================================================
  // Stereo Alignment Mode
  // =========================================================================

  get stereoAlignMode(): StereoAlignMode {
    return this._stereoAlignMode;
  }

  setStereoAlignMode(mode: StereoAlignMode): void {
    this._stereoAlignMode = mode;
  }

  getStereoAlignMode(): StereoAlignMode {
    return this._stereoAlignMode;
  }

  resetStereoAlignMode(): void {
    this._stereoAlignMode = DEFAULT_STEREO_ALIGN_MODE;
  }

  hasAlignOverlay(): boolean {
    return this._stereoAlignMode !== 'off';
  }

  // =========================================================================
  // Apply Stereo Transformations
  // =========================================================================

  /**
   * Whether stereo needs to be applied (non-default state with eye transforms
   * or alignment overlay).
   */
  needsEyeTransformApply(): boolean {
    return !this.isDefaultStereo() && (this.hasEyeTransforms() || this.hasAlignOverlay());
  }

  /**
   * Apply stereo viewing mode to the canvas (simple mode, no eye transforms).
   */
  applyStereoMode(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (isDefaultStereoState(this._stereoState)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const processedData = applyStereoModeUtil(imageData, this._stereoState);
    ctx.putImageData(processedData, 0, 0);
  }

  /**
   * Apply stereo viewing mode with per-eye transforms and alignment overlay.
   */
  applyStereoModeWithEyeTransforms(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (isDefaultStereoState(this._stereoState)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const processedData = applyStereoModeWithEyeTransformsUtil(
      imageData,
      this._stereoState,
      this._stereoEyeTransformState,
      this._stereoAlignMode,
    );
    ctx.putImageData(processedData, 0, 0);
  }
}
