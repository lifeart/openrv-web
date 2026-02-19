import { INTERACTION_QUALITY_FACTOR, INTERACTION_DEBOUNCE_MS } from '../../config/RenderConfig';

/**
 * Manages interaction quality tiering for the GL viewport.
 *
 * During active interactions (zoom, scrub), reduces the effective GL viewport
 * to a fraction of physical resolution for responsiveness. Restores full
 * quality after a debounce period when all interactions end.
 *
 * Uses reference counting so overlapping interactions (e.g., simultaneous
 * zoom + scrub) don't cause premature quality restoration.
 */
export class InteractionQualityManager {
  private _activeInteractions = 0;
  private _qualityFactor = 1.0;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _onQualityChange: (() => void) | null = null;

  /** Current quality factor (1.0 = full, 0.5 = interaction). */
  get qualityFactor(): number {
    return this._qualityFactor;
  }

  /** Whether any interaction is currently active. */
  get isInteracting(): boolean {
    return this._activeInteractions > 0;
  }

  /** Whether CPU effects should use half-resolution processing during interactions. */
  get cpuHalfRes(): boolean {
    return this._activeInteractions > 0;
  }

  /**
   * Set callback invoked when quality factor changes and a re-render is needed.
   */
  setOnQualityChange(cb: () => void): void {
    this._onQualityChange = cb;
  }

  /**
   * Signal that an interaction has started (zoom, scrub, etc.).
   * Multiple calls increment the reference count.
   */
  beginInteraction(): void {
    this._activeInteractions++;
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._qualityFactor !== INTERACTION_QUALITY_FACTOR) {
      this._qualityFactor = INTERACTION_QUALITY_FACTOR;
      // Don't trigger re-render here -- the interaction itself will schedule one
    }
  }

  /**
   * Signal that an interaction has ended. When all interactions end,
   * starts a debounce timer to restore full quality.
   */
  endInteraction(): void {
    this._activeInteractions = Math.max(0, this._activeInteractions - 1);
    if (this._activeInteractions === 0) {
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = null;
        if (this._qualityFactor !== 1.0) {
          this._qualityFactor = 1.0;
          this._onQualityChange?.();
        }
      }, INTERACTION_DEBOUNCE_MS);
    }
  }

  /**
   * Get the effective viewport dimensions for the current quality level.
   */
  getEffectiveViewport(physicalW: number, physicalH: number): { w: number; h: number } {
    const w = Math.max(1, Math.round(physicalW * this._qualityFactor));
    const h = Math.max(1, Math.round(physicalH * this._qualityFactor));
    return { w, h };
  }

  /**
   * Clean up any pending timers.
   */
  dispose(): void {
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    this._onQualityChange = null;
  }
}
