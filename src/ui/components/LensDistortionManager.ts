/**
 * LensDistortionManager - Manages lens distortion correction state for the Viewer.
 *
 * Extracted from Viewer.ts to separate the lens distortion concern from the
 * monolithic Viewer class.
 *
 * The manager owns the state and applies lens distortion corrections to canvas
 * contexts. The Viewer is responsible for scheduling renders after state changes.
 */

import {
  LensDistortionParams,
  DEFAULT_LENS_PARAMS,
  isDefaultLensParams,
  applyLensDistortion,
} from '../../transform/LensDistortion';

export class LensDistortionManager {
  private _lensParams: LensDistortionParams = { ...DEFAULT_LENS_PARAMS };

  // =========================================================================
  // State Access
  // =========================================================================

  get lensParams(): LensDistortionParams {
    return this._lensParams;
  }

  setLensParams(params: LensDistortionParams): void {
    this._lensParams = { ...params };
  }

  getLensParams(): LensDistortionParams {
    return { ...this._lensParams };
  }

  resetLensParams(): void {
    this._lensParams = { ...DEFAULT_LENS_PARAMS };
  }

  isDefault(): boolean {
    return isDefaultLensParams(this._lensParams);
  }

  // =========================================================================
  // Apply Lens Distortion
  // =========================================================================

  /**
   * Apply lens distortion correction to the canvas.
   */
  applyToCtx(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (isDefaultLensParams(this._lensParams)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const correctedData = applyLensDistortion(imageData, this._lensParams);
    ctx.putImageData(correctedData, 0, 0);
  }
}
