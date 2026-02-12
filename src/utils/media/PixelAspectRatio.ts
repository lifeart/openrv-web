/**
 * Pixel Aspect Ratio (PAR) Utilities
 *
 * Handles detection, calculation, and correction of non-square pixel formats
 * common in film and broadcast media (anamorphic, DV, etc.).
 */

/**
 * A known PAR preset with label and numeric value.
 */
export interface PARPreset {
  label: string;
  value: string;
  par: number;
}

/**
 * State for PAR correction in the viewer.
 */
export interface PARState {
  /** Whether PAR correction is currently applied */
  enabled: boolean;
  /** Current pixel aspect ratio value (1.0 = square pixels) */
  par: number;
  /** Active preset value, or 'custom' for manual entry */
  preset: string;
}

/**
 * Default PAR state: correction disabled, square pixels.
 */
export const DEFAULT_PAR_STATE: PARState = {
  enabled: false,
  par: 1.0,
  preset: 'square',
};

/**
 * Common PAR presets used in film and broadcast.
 */
export const PAR_PRESETS: PARPreset[] = [
  { label: 'Square Pixels (1:1)', value: 'square', par: 1.0 },
  { label: 'NTSC DV (0.91:1)', value: 'ntsc-dv', par: 0.9091 },
  { label: 'PAL DV (1.09:1)', value: 'pal-dv', par: 1.0926 },
  { label: 'NTSC DV Wide (1.21:1)', value: 'ntsc-dv-wide', par: 1.2121 },
  { label: 'PAL DV Wide (1.46:1)', value: 'pal-dv-wide', par: 1.4568 },
  { label: 'Anamorphic 2:1', value: 'anamorphic-2x', par: 2.0 },
  { label: 'Anamorphic 1.33:1', value: 'anamorphic-1.33x', par: 1.3333 },
  { label: 'HD Anamorphic (1.5:1)', value: 'hd-anamorphic', par: 1.5 },
];

/**
 * Detect PAR from common resolution + display aspect ratio combinations.
 * Returns 1.0 (square pixels) if no match is found.
 *
 * @param width - Source pixel width
 * @param height - Source pixel height
 * @param displayAspectRatio - Optional known display aspect ratio (e.g., 16/9)
 * @returns Detected pixel aspect ratio
 */
export function detectPAR(
  width: number,
  height: number,
  displayAspectRatio?: number,
): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1.0;

  // If a display aspect ratio is provided, compute PAR from it
  if (
    displayAspectRatio !== undefined &&
    Number.isFinite(displayAspectRatio) &&
    displayAspectRatio > 0
  ) {
    const storageAspect = width / height;
    return displayAspectRatio / storageAspect;
  }

  // Auto-detect common formats by resolution
  // NTSC DV 4:3 (720x480 displayed at 4:3)
  if (width === 720 && height === 480) return 0.9091;
  // PAL DV 4:3 (720x576 displayed at 4:3)
  if (width === 720 && height === 576) return 1.0926;
  // NTSC D1 (720x486 displayed at 4:3)
  if (width === 720 && height === 486) return 0.9;

  // Square pixels for most modern formats
  return 1.0;
}

/**
 * Calculate the display-corrected width after applying PAR.
 * The height remains unchanged; width is scaled by PAR.
 *
 * @param sourceWidth - Original pixel width
 * @param par - Pixel aspect ratio
 * @returns Corrected display width
 */
export function calculatePARCorrectedWidth(
  sourceWidth: number,
  par: number,
): number {
  if (!Number.isFinite(par) || par <= 0) return sourceWidth;
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) return sourceWidth;
  return Math.round(sourceWidth * par);
}

/**
 * Calculate the effective display aspect ratio considering PAR.
 *
 * @param width - Source pixel width
 * @param height - Source pixel height
 * @param par - Pixel aspect ratio
 * @returns Display aspect ratio
 */
export function calculateDisplayAspectRatio(
  width: number,
  height: number,
  par: number,
): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(par)) return 1.0;
  if (height <= 0 || par <= 0 || width <= 0) return 1.0;
  return (width * par) / height;
}

/**
 * Find the best matching preset for a given PAR value.
 * Returns 'custom' if no preset is close enough.
 *
 * @param par - Pixel aspect ratio value
 * @param tolerance - Maximum difference to consider a match (default 0.01)
 * @returns Preset value string or 'custom'
 */
export function findPresetForPAR(par: number, tolerance: number = 0.01): string {
  if (!Number.isFinite(par) || !Number.isFinite(tolerance) || tolerance < 0) return 'custom';
  for (const preset of PAR_PRESETS) {
    if (Math.abs(preset.par - par) < tolerance) {
      return preset.value;
    }
  }
  return 'custom';
}

/**
 * Get PAR value for a named preset.
 * Returns 1.0 for unknown presets.
 */
export function getPARForPreset(presetValue: string): number {
  const preset = PAR_PRESETS.find((p) => p.value === presetValue);
  return preset?.par ?? 1.0;
}

/**
 * Check if PAR state represents a non-trivial correction
 * (i.e., enabled and not square pixels).
 */
export function isPARActive(state: PARState): boolean {
  if (!Number.isFinite(state.par) || state.par <= 0) return false;
  return state.enabled && Math.abs(state.par - 1.0) > 0.001;
}
