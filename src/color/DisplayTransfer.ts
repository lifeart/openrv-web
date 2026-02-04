/**
 * DisplayTransfer - Display color management transfer functions and state
 *
 * Implements the final-stage display color management pipeline:
 * 1. Transfer function (sRGB, Rec.709, gamma, linear)
 * 2. Display gamma override
 * 3. Display brightness adjustment
 *
 * This module provides both CPU-side math functions and type definitions
 * used by the rendering pipeline.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Available display transfer functions
 */
export type DisplayTransferFunction =
  | 'linear'
  | 'srgb'
  | 'rec709'
  | 'gamma2.2'
  | 'gamma2.4'
  | 'custom';

/**
 * Integer codes for GLSL uniform communication
 */
export const DISPLAY_TRANSFER_CODES: Record<DisplayTransferFunction, number> = {
  'linear': 0,
  'srgb': 1,
  'rec709': 2,
  'gamma2.2': 3,
  'gamma2.4': 4,
  'custom': 5,
};

/**
 * Display color management state
 */
export interface DisplayColorState {
  transferFunction: DisplayTransferFunction;
  displayGamma: number;       // 0.1 to 4.0, default 1.0
  displayBrightness: number;  // 0.0 to 2.0, default 1.0
  customGamma: number;        // 0.1 to 10.0, default 2.2
  outputGamut?: 'auto' | 'srgb' | 'display-p3';  // default: 'auto'
}

/**
 * Default display color state (sRGB with no overrides)
 */
export const DEFAULT_DISPLAY_COLOR_STATE: DisplayColorState = {
  transferFunction: 'srgb',
  displayGamma: 1.0,
  displayBrightness: 1.0,
  customGamma: 2.2,
  outputGamut: 'auto',
};

/**
 * Profile cycle order for Shift+D keyboard shortcut.
 * Linear is skipped during cycling since sRGB is the default start.
 */
export const PROFILE_CYCLE_ORDER: DisplayTransferFunction[] = [
  'linear',
  'srgb',
  'rec709',
  'gamma2.2',
  'gamma2.4',
];

/**
 * Display labels for profiles
 */
export const PROFILE_LABELS: Record<DisplayTransferFunction, string> = {
  'linear': 'Linear',
  'srgb': 'sRGB',
  'rec709': '709',
  'gamma2.2': '2.2',
  'gamma2.4': '2.4',
  'custom': 'Custom',
};

/**
 * Full display labels for dropdown
 */
export const PROFILE_FULL_LABELS: Record<DisplayTransferFunction, string> = {
  'linear': 'Linear (Bypass)',
  'srgb': 'sRGB (IEC 61966-2-1)',
  'rec709': 'Rec. 709 OETF',
  'gamma2.2': 'Gamma 2.2',
  'gamma2.4': 'Gamma 2.4',
  'custom': 'Custom Gamma',
};

// =============================================================================
// Transfer Functions (CPU-side)
// =============================================================================

/**
 * sRGB EOTF inverse: linear -> sRGB encoded (per-channel)
 * IEC 61966-2-1 standard with linear segment near black
 */
export function linearToSRGB(c: number): number {
  if (c <= 0) return 0;
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
}

/**
 * Rec. 709 OETF: linear -> Rec. 709 encoded (per-channel)
 * ITU-R BT.709
 */
export function linearToRec709(c: number): number {
  if (c <= 0) return 0;
  if (c < 0.018) {
    return 4.5 * c;
  }
  return 1.099 * Math.pow(c, 0.45) - 0.099;
}

/**
 * Apply display transfer function to a single channel value
 */
export function applyDisplayTransfer(
  value: number,
  transferFunction: DisplayTransferFunction,
  customGamma: number,
): number {
  const c = Math.max(value, 0);
  switch (transferFunction) {
    case 'srgb':
      return linearToSRGB(c);
    case 'rec709':
      return linearToRec709(c);
    case 'gamma2.2':
      return Math.pow(c, 1.0 / 2.2);
    case 'gamma2.4':
      return Math.pow(c, 1.0 / 2.4);
    case 'custom':
      return Math.pow(c, 1.0 / customGamma);
    case 'linear':
    default:
      return c;
  }
}

/**
 * Apply full display color management to an RGB triplet [0-1]
 *
 * Pipeline order:
 * 1. Transfer function (sRGB / Rec.709 / gamma / linear)
 * 2. Display gamma override (additional compensation)
 * 3. Display brightness (multiplicative, hue-preserving)
 * 4. Clamp to [0, 1]
 */
export function applyDisplayColorManagement(
  r: number,
  g: number,
  b: number,
  state: DisplayColorState,
): [number, number, number] {
  // 1. Transfer function
  r = applyDisplayTransfer(r, state.transferFunction, state.customGamma);
  g = applyDisplayTransfer(g, state.transferFunction, state.customGamma);
  b = applyDisplayTransfer(b, state.transferFunction, state.customGamma);

  // 2. Display gamma override
  if (state.displayGamma !== 1.0) {
    const invGamma = 1.0 / state.displayGamma;
    r = Math.pow(Math.max(r, 0), invGamma);
    g = Math.pow(Math.max(g, 0), invGamma);
    b = Math.pow(Math.max(b, 0), invGamma);
  }

  // 3. Display brightness (multiplicative, preserves hue)
  r = Math.min(Math.max(r * state.displayBrightness, 0), 1);
  g = Math.min(Math.max(g * state.displayBrightness, 0), 1);
  b = Math.min(Math.max(b * state.displayBrightness, 0), 1);

  return [r, g, b];
}

/**
 * Apply display color management to ImageData (CPU fallback, in-place)
 */
export function applyDisplayColorManagementToImageData(
  imageData: ImageData,
  state: DisplayColorState,
): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]! / 255;
    let g = data[i + 1]! / 255;
    let b = data[i + 2]! / 255;

    [r, g, b] = applyDisplayColorManagement(r, g, b, state);

    data[i] = Math.round(r * 255);
    data[i + 1] = Math.round(g * 255);
    data[i + 2] = Math.round(b * 255);
    // Alpha unchanged
  }
}

/**
 * Check whether the display state represents a non-default (active) configuration
 */
export function isDisplayStateActive(state: DisplayColorState): boolean {
  return (
    state.transferFunction !== 'srgb' ||
    state.displayGamma !== 1.0 ||
    state.displayBrightness !== 1.0
  );
}

// =============================================================================
// Persistence
// =============================================================================

const STORAGE_KEY = 'openrv-display-profile';

/**
 * Save display profile to localStorage
 */
export function saveDisplayProfile(state: DisplayColorState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded)
  }
}

/**
 * Load display profile from localStorage
 */
const VALID_TRANSFER_FUNCTIONS: ReadonlySet<string> = new Set([
  'linear', 'srgb', 'rec709', 'gamma2.2', 'gamma2.4', 'custom',
]);

export function loadDisplayProfile(): DisplayColorState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate deserialized data
      if (
        typeof parsed !== 'object' || parsed === null ||
        !VALID_TRANSFER_FUNCTIONS.has(parsed.transferFunction) ||
        typeof parsed.displayGamma !== 'number' || !Number.isFinite(parsed.displayGamma) ||
        typeof parsed.displayBrightness !== 'number' || !Number.isFinite(parsed.displayBrightness) ||
        typeof parsed.customGamma !== 'number' || !Number.isFinite(parsed.customGamma)
      ) {
        return null;
      }
      return {
        transferFunction: parsed.transferFunction as DisplayTransferFunction,
        displayGamma: Math.max(0.1, Math.min(4.0, parsed.displayGamma)),
        displayBrightness: Math.max(0.0, Math.min(2.0, parsed.displayBrightness)),
        customGamma: Math.max(0.1, Math.min(10.0, parsed.customGamma)),
        outputGamut: ['auto', 'srgb', 'display-p3'].includes(parsed.outputGamut) ? parsed.outputGamut : undefined,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}
