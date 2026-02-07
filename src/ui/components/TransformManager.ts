/**
 * TransformManager - Manages all pan/zoom/rotation/flip/transform state for the Viewer.
 *
 * Extracted from Viewer.ts to separate the spatial transform concern (pan, zoom,
 * 2D rotation/flip, zoom animation) from the monolithic Viewer class.
 *
 * The manager owns the state but does NOT own the canvas/DOM. The Viewer is
 * responsible for calling scheduleRender() after state changes, and for wiring
 * up pointer/wheel event handlers that mutate the transform state.
 */

import { Transform2D, DEFAULT_TRANSFORM } from './TransformControl';
import { interpolateZoom } from './ViewerInteraction';

/**
 * Snapshot of all spatial transform state.
 */
export interface TransformSnapshot {
  panX: number;
  panY: number;
  zoom: number;
  transform: Transform2D;
}

export class TransformManager {
  // --- Pan / Zoom ---
  private _panX = 0;
  private _panY = 0;
  private _zoom = 1;

  // --- Smooth zoom animation ---
  private _zoomAnimationId: number | null = null;
  private _zoomAnimationStartTime = 0;
  private _zoomAnimationStartZoom = 1;
  private _zoomAnimationTargetZoom = 1;
  private _zoomAnimationDuration = 0;
  private _zoomAnimationStartPanX = 0;
  private _zoomAnimationStartPanY = 0;
  private _zoomAnimationTargetPanX = 0;
  private _zoomAnimationTargetPanY = 0;

  // --- Pinch zoom ---
  private _initialPinchDistance = 0;
  private _initialZoom = 1;

  // --- 2D Transform (rotation, flip, scale, translate) ---
  private _transform: Transform2D = {
    ...DEFAULT_TRANSFORM,
    scale: { ...DEFAULT_TRANSFORM.scale },
    translate: { ...DEFAULT_TRANSFORM.translate },
  };

  // --- Callback for requesting a render from the Viewer ---
  private _scheduleRender: (() => void) | null = null;

  /**
   * Set the render callback. Called by the Viewer during construction so that
   * animation frames can request re-renders.
   */
  setScheduleRender(fn: () => void): void {
    this._scheduleRender = fn;
  }

  private requestRender(): void {
    if (this._scheduleRender) {
      this._scheduleRender();
    }
  }

  // =========================================================================
  // Pan
  // =========================================================================

  get panX(): number {
    return this._panX;
  }

  set panX(value: number) {
    this._panX = value;
  }

  get panY(): number {
    return this._panY;
  }

  set panY(value: number) {
    this._panY = value;
  }

  getPan(): { x: number; y: number } {
    return { x: this._panX, y: this._panY };
  }

  setPan(x: number, y: number): void {
    this._panX = x;
    this._panY = y;
  }

  // =========================================================================
  // Zoom
  // =========================================================================

  get zoom(): number {
    return this._zoom;
  }

  set zoom(value: number) {
    this._zoom = value;
  }

  getZoom(): number {
    return this._zoom;
  }

  setZoom(level: number): void {
    this.cancelZoomAnimation();
    this._zoom = level;
    this._panX = 0;
    this._panY = 0;
  }

  // =========================================================================
  // Pinch zoom helpers
  // =========================================================================

  get initialPinchDistance(): number {
    return this._initialPinchDistance;
  }

  set initialPinchDistance(value: number) {
    this._initialPinchDistance = value;
  }

  get initialZoom(): number {
    return this._initialZoom;
  }

  set initialZoom(value: number) {
    this._initialZoom = value;
  }

  // =========================================================================
  // Fit to window
  // =========================================================================

  fitToWindow(): void {
    this.cancelZoomAnimation();
    this._panX = 0;
    this._panY = 0;
    this._zoom = 1;
  }

  /**
   * Fit to window with a smooth animated transition.
   */
  smoothFitToWindow(): void {
    this.smoothZoomTo(1, 200, 0, 0);
  }

  /**
   * Set zoom with a smooth animated transition.
   */
  smoothSetZoom(level: number): void {
    this.smoothZoomTo(level, 200, 0, 0);
  }

  // =========================================================================
  // Smooth zoom animation
  // =========================================================================

  /**
   * Animate zoom smoothly to a target level over a given duration.
   * Uses requestAnimationFrame with ease-out cubic interpolation.
   * Also animates pan position to the target values.
   * @param targetZoom - The target zoom level
   * @param duration - Animation duration in milliseconds (default 200)
   * @param targetPanX - Target pan X position (default: current panX)
   * @param targetPanY - Target pan Y position (default: current panY)
   */
  smoothZoomTo(
    targetZoom: number,
    duration: number = 200,
    targetPanX?: number,
    targetPanY?: number
  ): void {
    // Cancel any in-progress zoom animation
    this.cancelZoomAnimation();

    // If duration is 0 or negligible, apply instantly
    if (duration <= 0) {
      this._zoom = targetZoom;
      if (targetPanX !== undefined) this._panX = targetPanX;
      if (targetPanY !== undefined) this._panY = targetPanY;
      this.requestRender();
      return;
    }

    // If already at target, no animation needed
    const panXTarget = targetPanX !== undefined ? targetPanX : this._panX;
    const panYTarget = targetPanY !== undefined ? targetPanY : this._panY;
    if (
      Math.abs(this._zoom - targetZoom) < 0.001 &&
      Math.abs(this._panX - panXTarget) < 0.5 &&
      Math.abs(this._panY - panYTarget) < 0.5
    ) {
      this._zoom = targetZoom;
      this._panX = panXTarget;
      this._panY = panYTarget;
      this.requestRender();
      return;
    }

    this._zoomAnimationStartTime = performance.now();
    this._zoomAnimationStartZoom = this._zoom;
    this._zoomAnimationTargetZoom = targetZoom;
    this._zoomAnimationDuration = duration;
    this._zoomAnimationStartPanX = this._panX;
    this._zoomAnimationStartPanY = this._panY;
    this._zoomAnimationTargetPanX = panXTarget;
    this._zoomAnimationTargetPanY = panYTarget;

    const animate = (now: number): void => {
      const elapsed = now - this._zoomAnimationStartTime;
      const progress = Math.min(1, elapsed / this._zoomAnimationDuration);

      this._zoom = interpolateZoom(
        this._zoomAnimationStartZoom,
        this._zoomAnimationTargetZoom,
        progress
      );
      this._panX = interpolateZoom(
        this._zoomAnimationStartPanX,
        this._zoomAnimationTargetPanX,
        progress
      );
      this._panY = interpolateZoom(
        this._zoomAnimationStartPanY,
        this._zoomAnimationTargetPanY,
        progress
      );

      this.requestRender();

      if (progress < 1) {
        this._zoomAnimationId = requestAnimationFrame(animate);
      } else {
        // Ensure exact final values
        this._zoom = this._zoomAnimationTargetZoom;
        this._panX = this._zoomAnimationTargetPanX;
        this._panY = this._zoomAnimationTargetPanY;
        this._zoomAnimationId = null;
        this.requestRender();
      }
    };

    this._zoomAnimationId = requestAnimationFrame(animate);
  }

  /**
   * Cancel any in-progress smooth zoom animation.
   * The zoom remains at whatever intermediate value it reached.
   */
  cancelZoomAnimation(): void {
    if (this._zoomAnimationId !== null) {
      cancelAnimationFrame(this._zoomAnimationId);
      this._zoomAnimationId = null;
    }
  }

  /**
   * Check if a smooth zoom animation is currently in progress.
   */
  isZoomAnimating(): boolean {
    return this._zoomAnimationId !== null;
  }

  // =========================================================================
  // 2D Transform (rotation, flip, scale, translate)
  // =========================================================================

  get transform(): Transform2D {
    return this._transform;
  }

  setTransform(transform: Transform2D): void {
    this._transform = {
      ...transform,
      scale: { ...DEFAULT_TRANSFORM.scale, ...transform.scale },
      translate: { ...DEFAULT_TRANSFORM.translate, ...transform.translate },
    };
  }

  getTransform(): Transform2D {
    return {
      ...this._transform,
      scale: { ...this._transform.scale },
      translate: { ...this._transform.translate },
    };
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose(): void {
    this.cancelZoomAnimation();
    this._scheduleRender = null;
  }
}
