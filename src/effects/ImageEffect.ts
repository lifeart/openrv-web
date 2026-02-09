/**
 * ImageEffect - Unified interface for all pixel-level CPU image effects.
 *
 * This interface abstracts the common pattern shared by color corrections,
 * tone adjustments, spatial filters, and diagnostic overlays throughout the
 * codebase (ViewerEffects, color/, filters/, workers/).
 *
 * Effects operate on ImageData in-place and declare their own activation
 * logic so the pipeline can skip inactive effects without the caller
 * needing to know each effect's default/identity state.
 *
 * Categories:
 * - color:      Per-pixel color transforms (inversion, CDL, hue rotation, curves)
 * - tone:       Luminance / dynamic-range adjustments (highlights/shadows, tone mapping, vibrance)
 * - spatial:    Effects with inter-pixel dependencies (clarity, sharpen, noise reduction)
 * - diagnostic: Non-destructive overlays for inspection (channel isolation, zebra)
 */

/**
 * Effect categories used for grouping and ordering in the pipeline.
 */
export type EffectCategory = 'color' | 'tone' | 'spatial' | 'diagnostic';

/**
 * A single image effect that can be applied to ImageData.
 *
 * Implementations should be thin adapters that delegate to the existing
 * effect functions rather than duplicating pixel-processing logic.
 */
export interface ImageEffect {
  /** Unique identifier for this effect (used as the registry key). */
  readonly name: string;

  /** Human-readable label for UI display. */
  readonly label: string;

  /** Pipeline category that determines grouping and default ordering. */
  readonly category: EffectCategory;

  /**
   * Apply the effect to the given ImageData in-place.
   *
   * @param imageData - The pixel buffer to modify.
   * @param params    - Arbitrary parameter bag. Each effect documents the
   *                    keys it reads. Unknown keys are ignored.
   */
  apply(imageData: ImageData, params: Record<string, unknown>): void;

  /**
   * Return true when the effect would actually change pixels for the
   * given parameters.  The pipeline uses this to skip no-op effects.
   *
   * @param params - Same parameter bag passed to `apply`.
   */
  isActive(params: Record<string, unknown>): boolean;
}
