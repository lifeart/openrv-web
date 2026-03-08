/**
 * ScalePresets - Pixel-ratio-based zoom presets
 *
 * Converts between pixel ratios (1:1, 2:1, etc.) and the internal zoom
 * multiplier used by TransformManager. The zoom multiplier is relative to
 * fit-to-window scale, so 1:1 pixel ratio requires zoom = 1/fitScale.
 */

export interface ScalePreset {
  ratio: number; // e.g. 1.0 for 1:1, 2.0 for 2:1, 0.5 for 1:2
  label: string; // e.g. "1:1", "2:1", "1:2"
  percentage: string; // e.g. "100%", "200%", "50%"
}

export const MAGNIFICATION_PRESETS: ScalePreset[] = [
  { ratio: 1, label: '1:1', percentage: '100%' },
  { ratio: 2, label: '2:1', percentage: '200%' },
  { ratio: 3, label: '3:1', percentage: '300%' },
  { ratio: 4, label: '4:1', percentage: '400%' },
  { ratio: 5, label: '5:1', percentage: '500%' },
  { ratio: 6, label: '6:1', percentage: '600%' },
  { ratio: 7, label: '7:1', percentage: '700%' },
  { ratio: 8, label: '8:1', percentage: '800%' },
];

export const REDUCTION_PRESETS: ScalePreset[] = [
  { ratio: 0.5, label: '1:2', percentage: '50%' },
  { ratio: 1 / 3, label: '1:3', percentage: '33.3%' },
  { ratio: 0.25, label: '1:4', percentage: '25%' },
  { ratio: 0.2, label: '1:5', percentage: '20%' },
  { ratio: 1 / 6, label: '1:6', percentage: '16.7%' },
  { ratio: 1 / 7, label: '1:7', percentage: '14.3%' },
  { ratio: 0.125, label: '1:8', percentage: '12.5%' },
];

// IMPORTANT: Use spread+reverse to avoid mutating REDUCTION_PRESETS.
// Array.prototype.reverse() mutates in place, which would corrupt REDUCTION_PRESETS.
export const ALL_PRESETS: ScalePreset[] = [...[...REDUCTION_PRESETS].reverse(), ...MAGNIFICATION_PRESETS];

/**
 * Maximum canvas dimension (CSS pixels) to prevent GPU buffer overflow.
 * Most GPUs support 16384; some support 32768. We use a conservative value.
 * At high zoom, display dimensions beyond this cap are achieved via CSS scaling.
 */
export const MAX_CANVAS_DIMENSION = 16384;

/**
 * Calculate the fitScale for a given source and container size.
 * This is the base scale at zoom=1 (fit to window).
 *
 * IMPORTANT: For rotated images, pass the effective (post-rotation) source
 * dimensions, not the raw source dimensions. When the image is rotated
 * 90 or 270 degrees, sourceWidth and sourceHeight should be swapped.
 */
export function calculateFitScale(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  if (sourceWidth <= 0 || sourceHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return 1;
  }
  return Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight, 1);
}

/**
 * Convert a pixel ratio to the internal zoom multiplier.
 * zoom = ratio / fitScale
 */
export function ratioToZoom(ratio: number, fitScale: number): number {
  if (fitScale <= 0) return ratio;
  return ratio / fitScale;
}

/**
 * Convert the internal zoom multiplier to an approximate pixel ratio.
 * ratio = zoom * fitScale
 */
export function zoomToRatio(zoom: number, fitScale: number): number {
  return zoom * fitScale;
}

/**
 * Format a pixel ratio as a human-readable label (e.g. "1:1", "2:1", "1:4").
 * For ratios >= 1, format as "N:1". For ratios < 1, format as "1:N".
 * Falls back to percentage for non-integer ratios.
 */
export function formatRatio(ratio: number): string {
  if (ratio >= 1) {
    if (Number.isInteger(ratio)) {
      return ratio === 1 ? '1:1' : `${ratio}:1`;
    }
    return `${Math.round(ratio * 100)}%`;
  }
  const inverse = 1 / ratio;
  if (Number.isInteger(inverse)) {
    return `1:${inverse}`;
  }
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Find the matching scale preset for a given ratio, if any.
 * Uses an epsilon tolerance for floating-point comparison.
 */
export function findPresetForRatio(ratio: number, epsilon = 0.01): ScalePreset | null {
  for (const preset of ALL_PRESETS) {
    if (Math.abs(preset.ratio - ratio) < epsilon) {
      return preset;
    }
  }
  return null;
}
