/**
 * PerspectiveCorrectionManager - Manages perspective correction state for the Viewer.
 *
 * Follows the same pattern as LensDistortionManager. Owns the state and applies
 * perspective correction to canvas contexts. The Viewer schedules renders after changes.
 */

import {
  PerspectiveCorrectionParams,
  DEFAULT_PERSPECTIVE_PARAMS,
  isPerspectiveActive,
  applyPerspectiveCorrection,
} from '../../transform/PerspectiveCorrection';

export class PerspectiveCorrectionManager {
  private _params: PerspectiveCorrectionParams = {
    ...DEFAULT_PERSPECTIVE_PARAMS,
    topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
    topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
    bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
    bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
  };

  get params(): PerspectiveCorrectionParams {
    return this._params;
  }

  setParams(params: PerspectiveCorrectionParams): void {
    this._params = {
      ...params,
      topLeft: { ...params.topLeft },
      topRight: { ...params.topRight },
      bottomRight: { ...params.bottomRight },
      bottomLeft: { ...params.bottomLeft },
    };
  }

  getParams(): PerspectiveCorrectionParams {
    return {
      ...this._params,
      topLeft: { ...this._params.topLeft },
      topRight: { ...this._params.topRight },
      bottomRight: { ...this._params.bottomRight },
      bottomLeft: { ...this._params.bottomLeft },
    };
  }

  resetParams(): void {
    this._params = {
      ...DEFAULT_PERSPECTIVE_PARAMS,
      topLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.topLeft },
      topRight: { ...DEFAULT_PERSPECTIVE_PARAMS.topRight },
      bottomRight: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomRight },
      bottomLeft: { ...DEFAULT_PERSPECTIVE_PARAMS.bottomLeft },
    };
  }

  isDefault(): boolean {
    return !isPerspectiveActive(this._params);
  }

  /**
   * Apply perspective correction to the canvas (CPU path).
   */
  applyToCtx(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!isPerspectiveActive(this._params)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const correctedData = applyPerspectiveCorrection(imageData, this._params);
    ctx.putImageData(correctedData, 0, 0);
  }
}
