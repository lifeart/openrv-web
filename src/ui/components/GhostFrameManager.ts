/**
 * GhostFrameManager - Manages ghost frame (onion skin) state and canvas pool.
 *
 * Extracted from Viewer.ts to separate the ghost frame concern from the
 * monolithic Viewer class.
 *
 * The manager owns the state and canvas pool. The Viewer provides session
 * context and the target canvas for rendering.
 */

import { GhostFrameState, DEFAULT_GHOST_FRAME_STATE } from './GhostFrameControl';
import { safeCanvasContext2D } from '../../color/ColorProcessingFacade';

export class GhostFrameManager {
  private _state: GhostFrameState = { ...DEFAULT_GHOST_FRAME_STATE };
  private _canvasPool: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];
  private _poolWidth = 0;
  private _poolHeight = 0;

  // =========================================================================
  // Pool Inspection (read-only)
  // =========================================================================

  get canvasPool(): readonly { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] {
    return this._canvasPool;
  }

  get poolWidth(): number {
    return this._poolWidth;
  }

  get poolHeight(): number {
    return this._poolHeight;
  }

  // =========================================================================
  // State Access
  // =========================================================================

  get state(): GhostFrameState {
    return this._state;
  }

  get enabled(): boolean {
    return this._state.enabled;
  }

  setState(state: GhostFrameState): void {
    this._state = { ...state };
    if (!state.enabled) {
      this.clearPool();
    }
  }

  getState(): GhostFrameState {
    return { ...this._state };
  }

  resetState(): void {
    this._state = { ...DEFAULT_GHOST_FRAME_STATE };
    this.clearPool();
  }

  // =========================================================================
  // Canvas Pool Management
  // =========================================================================

  /**
   * Get a canvas from the pool, creating one if needed.
   * All pooled canvases share the same dimensions; if the display size changes,
   * the pool is re-sized.
   */
  getPoolCanvas(
    index: number,
    width: number,
    height: number,
    canvasColorSpace?: 'display-p3',
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    // If display size changed, resize all existing pool entries
    if (this._poolWidth !== width || this._poolHeight !== height) {
      this._poolWidth = width;
      this._poolHeight = height;
      for (const entry of this._canvasPool) {
        entry.canvas.width = width;
        entry.canvas.height = height;
      }
    }

    // Create new entry if pool is not big enough
    if (index >= this._canvasPool.length) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      try {
        const ctx = safeCanvasContext2D(canvas, {}, canvasColorSpace);
        this._canvasPool.push({ canvas, ctx });
      } catch {
        return null;
      }
    }

    return this._canvasPool[index]!;
  }

  /**
   * Trim pool to the given size (removes excess entries).
   */
  trimPool(usedCount: number): void {
    if (usedCount < this._canvasPool.length) {
      this._canvasPool.length = usedCount;
    }
  }

  /**
   * Clear the canvas pool entirely.
   */
  clearPool(): void {
    this._canvasPool = [];
    this._poolWidth = 0;
    this._poolHeight = 0;
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.clearPool();
  }
}
