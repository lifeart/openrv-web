/**
 * Adapter: wraps motion estimation, path smoothing, and pixel-shifting
 * from `src/filters/StabilizeMotion.ts` as a unified ImageEffect.
 *
 * The stateless `stabilizationEffect` export applies a single-frame shift
 * (backward compatible).
 *
 * The stateful `StabilizationAdapter` class computes inter-frame motion
 * vectors, smooths the camera path, and applies the correction — all in
 * one `apply()` call.
 *
 * Expected params keys (flat primitives):
 *   stabilizationEnabled:        boolean  (default false)
 *   stabilizationDx:             number   (default 0) — manual horizontal correction
 *   stabilizationDy:             number   (default 0) — manual vertical correction
 *   stabilizationCropAmount:     number   (default 0) — border crop in pixels
 *   stabilizationSmoothingStrength: number (default 50) — 0–100 smoothing
 *   stabilizationAutoMotion:     boolean  (default false) — enable auto motion estimation
 */

import type { ImageEffect } from '../ImageEffect';
import {
  applyStabilization,
  computeMotionVector,
  smoothMotionPath,
  type MotionVector,
} from '../../filters/StabilizeMotion';

// ---------------------------------------------------------------------------
// Stateless single-frame effect (backward compatible)
// ---------------------------------------------------------------------------

export const stabilizationEffect: ImageEffect = {
  name: 'stabilization',
  label: 'Stabilization',
  category: 'spatial',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    applyStabilization(imageData, {
      dx: (params['stabilizationDx'] as number) ?? 0,
      dy: (params['stabilizationDy'] as number) ?? 0,
      cropAmount: (params['stabilizationCropAmount'] as number) ?? 0,
    });
  },

  isActive(params: Record<string, unknown>): boolean {
    const enabled = (params['stabilizationEnabled'] as boolean) ?? false;
    if (!enabled) return false;
    const dx = (params['stabilizationDx'] as number) ?? 0;
    const dy = (params['stabilizationDy'] as number) ?? 0;
    const cropAmount = (params['stabilizationCropAmount'] as number) ?? 0;
    return dx !== 0 || dy !== 0 || cropAmount > 0;
  },
};

// ---------------------------------------------------------------------------
// Stateful adapter: motion estimation + smoothing + application
// ---------------------------------------------------------------------------

/**
 * Stateful stabilization adapter that tracks inter-frame motion and
 * smooths the camera path over a sequence of frames.
 *
 * Usage:
 * ```ts
 * const adapter = new StabilizationAdapter();
 * // For each frame in sequence:
 * adapter.apply(frameImageData, params);
 * ```
 */
export class StabilizationAdapter implements ImageEffect {
  readonly name = 'stabilization';
  readonly label = 'Stabilization';
  readonly category = 'spatial' as const;

  /** Previous frame kept for inter-frame motion estimation. */
  private referenceFrame: ImageData | null = null;

  /** Raw per-frame motion vectors accumulated so far. */
  private rawVectors: MotionVector[] = [];

  /** Index of the frame currently being processed (0-based). */
  private frameIndex = 0;

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    const autoMotion = (params['stabilizationAutoMotion'] as boolean) ?? false;
    const smoothingStrength =
      (params['stabilizationSmoothingStrength'] as number) ?? 50;
    const cropAmount = (params['stabilizationCropAmount'] as number) ?? 0;

    if (autoMotion) {
      // --- Auto motion estimation path ---
      let rawVector: MotionVector = { dx: 0, dy: 0, confidence: 0 };

      if (this.referenceFrame) {
        rawVector = computeMotionVector(imageData, this.referenceFrame);
      }

      this.rawVectors.push(rawVector);

      // Store a copy of the current frame as the next reference
      this.referenceFrame = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height,
      );

      // Smooth the full accumulated path and take the correction for the
      // current frame.
      const corrections = smoothMotionPath(this.rawVectors, smoothingStrength);
      const correction = corrections[this.frameIndex];

      if (correction) {
        applyStabilization(imageData, {
          dx: correction.dx,
          dy: correction.dy,
          cropAmount,
        });
      }

      this.frameIndex++;
    } else {
      // --- Manual dx/dy path (backward compatible) ---
      applyStabilization(imageData, {
        dx: (params['stabilizationDx'] as number) ?? 0,
        dy: (params['stabilizationDy'] as number) ?? 0,
        cropAmount,
      });
    }
  }

  isActive(params: Record<string, unknown>): boolean {
    const enabled = (params['stabilizationEnabled'] as boolean) ?? false;
    if (!enabled) return false;

    const autoMotion = (params['stabilizationAutoMotion'] as boolean) ?? false;
    if (autoMotion) return true;

    const dx = (params['stabilizationDx'] as number) ?? 0;
    const dy = (params['stabilizationDy'] as number) ?? 0;
    const cropAmount = (params['stabilizationCropAmount'] as number) ?? 0;
    return dx !== 0 || dy !== 0 || cropAmount > 0;
  }

  /**
   * Reset all accumulated state (reference frame, motion vectors).
   * Call when the clip or sequence changes.
   */
  reset(): void {
    this.referenceFrame = null;
    this.rawVectors = [];
    this.frameIndex = 0;
  }

  /** Get the raw motion vectors collected so far (for debugging / UI). */
  getRawVectors(): readonly MotionVector[] {
    return this.rawVectors;
  }

  /** Get the current frame index. */
  getFrameIndex(): number {
    return this.frameIndex;
  }
}
