/**
 * AutoExposureController - Automatic exposure with EMA temporal smoothing.
 *
 * Paper's #1 recommendation for real-time video: smooth auto-exposure
 * provides temporal stability inherently.
 *
 * Algorithm:
 *   targetExposure = log2(targetKey / avgSceneLuminance)
 *   clamp(targetExposure, minExposure, maxExposure)
 *   currentExposure += adaptationSpeed * (targetExposure - currentExposure)
 *
 * Design: Auto-exposure does NOT modify colorAdjustments.exposure.
 * Instead, the final exposure = autoExposure + manual exposure (compensation).
 */

import { clampLuminance } from './SceneAnalysis';
import { TemporalSmoother } from './TemporalSmoother';
import type { AutoExposureState } from '../core/types/effects';

// Re-export so existing consumers (tests, etc.) can still import from here
export type { AutoExposureState } from '../core/types/effects';
export { DEFAULT_AUTO_EXPOSURE_STATE } from '../core/types/effects';

const EXPOSURE_SMOOTH_KEY = 'autoExposure';

export class AutoExposureController {
  private smoother = new TemporalSmoother();
  private _currentExposure = 0;
  private _initialized = false;

  /** Current smoothed auto-exposure value in stops. */
  get currentExposure(): number {
    return this._currentExposure;
  }

  /**
   * Update auto-exposure based on scene luminance.
   *
   * @param avgLuminance - Scene average luminance from LuminanceAnalyzer
   * @param config - Auto-exposure configuration
   */
  update(avgLuminance: number, config: AutoExposureState): void {
    if (!config.enabled) return;

    const safeLuminance = clampLuminance(avgLuminance);
    const targetExposure = Math.log2(config.targetKey / safeLuminance);
    const clampedTarget = Math.min(Math.max(targetExposure, config.minExposure), config.maxExposure);

    if (!this._initialized) {
      // First frame: instant convergence, no fade-in artifact
      this._currentExposure = clampedTarget;
      this.smoother.smooth(EXPOSURE_SMOOTH_KEY, clampedTarget, 1.0);
      this._initialized = true;
      return;
    }

    this._currentExposure = this.smoother.smooth(
      EXPOSURE_SMOOTH_KEY,
      clampedTarget,
      config.adaptationSpeed,
    );
  }

  /**
   * Compute auto-exposure for a sequence of frames (batch mode).
   * Used by PrerenderBufferManager for pre-computing per-frame exposure.
   *
   * @param luminances - Map of frame number → average luminance
   * @param config - Auto-exposure configuration
   * @returns Map of frame number → smoothed exposure value
   */
  computeBatch(
    luminances: Map<number, number>,
    config: AutoExposureState,
  ): Map<number, number> {
    const result = new Map<number, number>();
    if (!config.enabled) return result;

    const smoother = new TemporalSmoother();
    const sortedFrames = [...luminances.keys()].sort((a, b) => a - b);
    let initialized = false;

    for (const frame of sortedFrames) {
      const avgLuminance = luminances.get(frame)!;
      const safeLuminance = clampLuminance(avgLuminance);
      const targetExposure = Math.log2(config.targetKey / safeLuminance);
      const clampedTarget = Math.min(Math.max(targetExposure, config.minExposure), config.maxExposure);

      if (!initialized) {
        smoother.smooth(EXPOSURE_SMOOTH_KEY, clampedTarget, 1.0);
        result.set(frame, clampedTarget);
        initialized = true;
      } else {
        const smoothed = smoother.smooth(EXPOSURE_SMOOTH_KEY, clampedTarget, config.adaptationSpeed);
        result.set(frame, smoothed);
      }
    }

    return result;
  }

  /**
   * Reset the controller state. Next update will use instant convergence.
   */
  reset(): void {
    this.smoother.reset();
    this._currentExposure = 0;
    this._initialized = false;
  }
}
