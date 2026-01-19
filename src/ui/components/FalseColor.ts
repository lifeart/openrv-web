/**
 * FalseColor - Maps luminance values to colors for exposure analysis
 *
 * Features:
 * - Maps different luminance ranges to specific colors
 * - Helps identify overexposed and underexposed areas
 * - Shows mid-grey and skin tone ranges
 * - Standard IRE-based color mapping (broadcast standard)
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export interface FalseColorEvents extends EventMap {
  stateChanged: FalseColorState;
}

export interface FalseColorState {
  enabled: boolean;
  preset: FalseColorPreset;
}

export type FalseColorPreset = 'standard' | 'arri' | 'red' | 'custom';

/**
 * False Color Palette Documentation
 *
 * This implementation provides professional false color exposure analysis similar to
 * broadcast monitors and camera false color modes. The palettes map luminance values
 * (0-255, representing 0-100 IRE) to specific colors for quick exposure evaluation.
 *
 * IMPLEMENTATION NOTES vs FEATURES.md SPEC:
 *
 * The FEATURES.md specification suggests these IRE-to-color mappings:
 *   0-5 IRE:   Purple (black crush warning)
 *   5-20 IRE:  Blue (shadows)
 *   20-40 IRE: Cyan/Teal (lower midtones)
 *   40-50 IRE: Green (18% gray target)
 *   50-60 IRE: Light green (midtones)
 *   60-70 IRE: Yellow (upper midtones)
 *   70-85 IRE: Orange (highlights)
 *   85-95 IRE: Pink (near clipping)
 *   95-100+ IRE: Red (clipping warning)
 *
 * Our implementation differs slightly to better match professional monitor standards
 * and provide additional granularity for skin tone detection. Key differences:
 *
 * 1. STANDARD palette includes dedicated skin tone bands (~40-55 IRE range)
 *    which is valuable for cinematography and portrait work.
 *
 * 2. Middle grey (18%) is centered around 45-50 IRE (116-128 in 8-bit)
 *    rather than exactly at 40 IRE.
 *
 * 3. Clipping warnings use pink/magenta for overexposure (more visible than red)
 *    while red indicates approaching clipping.
 *
 * 4. Multiple presets (ARRI, RED) follow camera-specific conventions used
 *    in professional production environments.
 *
 * The pre-computed LUT approach ensures real-time performance even at 4K resolution.
 */

// IRE values are mapped to 0-255 range (0 IRE = 0, 100 IRE = 255)
interface ColorRange {
  min: number;     // Min luminance (0-255)
  max: number;     // Max luminance (0-255)
  color: [number, number, number]; // RGB color
  label: string;   // Description
}

/**
 * Standard false color palette (professional monitor style)
 *
 * IRE Mapping (8-bit value = IRE * 2.55):
 *   0-2 IRE (0-5):     Purple - crushed blacks, data loss
 *   2-10 IRE (6-25):   Navy - very underexposed
 *   10-20 IRE (26-51): Blue - underexposed, deep shadows
 *   20-30 IRE (52-76): Teal - dark tones
 *   30-40 IRE (77-102): Green - lower midtones
 *   40-45 IRE (103-115): Yellow-green - lower skin tones
 *   45-50 IRE (116-128): Grey - middle grey (18% reflectance)
 *   50-55 IRE (129-140): Peach - optimal skin tone range
 *   55-65 IRE (141-166): Yellow - bright midtones
 *   65-75 IRE (167-191): Orange - very bright
 *   75-90 IRE (192-230): Red - highlights, approaching clip
 *   90-100 IRE (231-255): Pink - clipped/overexposed
 */
const STANDARD_PALETTE: ColorRange[] = [
  { min: 0, max: 5, color: [128, 0, 128], label: 'Black crush' },      // Purple - crushed blacks
  { min: 6, max: 25, color: [0, 0, 128], label: 'Very dark' },         // Navy - very underexposed
  { min: 26, max: 51, color: [0, 0, 255], label: 'Underexposed' },     // Blue - underexposed
  { min: 52, max: 76, color: [0, 128, 128], label: 'Dark' },           // Teal - dark
  { min: 77, max: 102, color: [0, 128, 0], label: 'Low-mid' },         // Green - lower midtones
  { min: 103, max: 115, color: [170, 255, 0], label: 'Skin tone low' }, // Yellow-green - lower skin
  { min: 116, max: 128, color: [128, 128, 128], label: 'Mid grey' },   // Grey - middle grey (18%)
  { min: 129, max: 140, color: [255, 192, 128], label: 'Skin tone' },  // Peach - skin tones
  { min: 141, max: 166, color: [255, 255, 0], label: 'Bright' },       // Yellow - bright
  { min: 167, max: 191, color: [255, 165, 0], label: 'Very bright' },  // Orange - very bright
  { min: 192, max: 230, color: [255, 0, 0], label: 'Highlight' },      // Red - approaching clipping
  { min: 231, max: 255, color: [255, 128, 255], label: 'Clipped' },    // Pink - clipped/overexposed
];

// ARRI-style false color palette
const ARRI_PALETTE: ColorRange[] = [
  { min: 0, max: 8, color: [128, 0, 255], label: 'Black' },
  { min: 9, max: 20, color: [0, 0, 192], label: 'Near black' },
  { min: 21, max: 51, color: [0, 64, 255], label: 'Shadows' },
  { min: 52, max: 77, color: [0, 192, 255], label: 'Dark tones' },
  { min: 78, max: 102, color: [0, 255, 128], label: 'Low-mid' },
  { min: 103, max: 128, color: [128, 128, 128], label: 'Middle grey' },
  { min: 129, max: 153, color: [255, 255, 0], label: 'High-mid' },
  { min: 154, max: 179, color: [255, 192, 0], label: 'Bright' },
  { min: 180, max: 204, color: [255, 128, 0], label: 'Very bright' },
  { min: 205, max: 230, color: [255, 64, 0], label: 'Highlight' },
  { min: 231, max: 255, color: [255, 0, 128], label: 'Clipped' },
];

// RED-style false color palette
const RED_PALETTE: ColorRange[] = [
  { min: 0, max: 12, color: [64, 0, 128], label: 'Crushed' },
  { min: 13, max: 38, color: [0, 0, 255], label: 'Underexposed' },
  { min: 39, max: 64, color: [0, 128, 255], label: 'Dark' },
  { min: 65, max: 89, color: [0, 255, 255], label: 'Low-mid' },
  { min: 90, max: 115, color: [0, 255, 0], label: 'Proper exposure' },
  { min: 116, max: 140, color: [128, 128, 128], label: 'Middle grey' },
  { min: 141, max: 166, color: [255, 255, 0], label: 'High-mid' },
  { min: 167, max: 191, color: [255, 192, 0], label: 'Bright' },
  { min: 192, max: 217, color: [255, 128, 0], label: 'Very bright' },
  { min: 218, max: 242, color: [255, 0, 0], label: 'Near clipping' },
  { min: 243, max: 255, color: [255, 0, 255], label: 'Clipped' },
];

const PALETTES: Record<FalseColorPreset, ColorRange[]> = {
  standard: STANDARD_PALETTE,
  arri: ARRI_PALETTE,
  red: RED_PALETTE,
  custom: STANDARD_PALETTE, // Use standard as default for custom
};

export const DEFAULT_FALSE_COLOR_STATE: FalseColorState = {
  enabled: false,
  preset: 'standard',
};

export class FalseColor extends EventEmitter<FalseColorEvents> {
  private state: FalseColorState = { ...DEFAULT_FALSE_COLOR_STATE };

  // Pre-computed LUT for fast lookup (256 entries, each [R, G, B])
  private colorLUT: Uint8Array = new Uint8Array(256 * 3);

  constructor() {
    super();
    this.buildColorLUT();
  }

  /**
   * Build the color lookup table from the current palette
   */
  private buildColorLUT(): void {
    const palette = PALETTES[this.state.preset];

    for (let i = 0; i < 256; i++) {
      // Find the color range for this luminance value
      let color: [number, number, number] = [128, 128, 128]; // default grey

      for (const range of palette) {
        if (i >= range.min && i <= range.max) {
          color = range.color;
          break;
        }
      }

      // Store in LUT
      this.colorLUT[i * 3] = color[0];
      this.colorLUT[i * 3 + 1] = color[1];
      this.colorLUT[i * 3 + 2] = color[2];
    }
  }

  /**
   * Apply false color effect to ImageData in-place
   */
  apply(imageData: ImageData): void {
    if (!this.state.enabled) return;

    const data = imageData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;

      // Calculate luminance using Rec. 709 coefficients
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const lutIndex = lum * 3;

      // Map to false color
      data[i] = this.colorLUT[lutIndex]!;
      data[i + 1] = this.colorLUT[lutIndex + 1]!;
      data[i + 2] = this.colorLUT[lutIndex + 2]!;
      // Alpha unchanged
    }
  }

  /**
   * Enable false color
   */
  enable(): void {
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Disable false color
   */
  disable(): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Toggle enabled state
   */
  toggle(): void {
    if (this.state.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Set the color preset
   */
  setPreset(preset: FalseColorPreset): void {
    if (this.state.preset === preset) return;
    this.state.preset = preset;
    this.buildColorLUT();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current state
   */
  getState(): FalseColorState {
    return { ...this.state };
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Get available presets
   */
  getPresets(): Array<{ key: FalseColorPreset; label: string }> {
    return [
      { key: 'standard', label: 'Standard' },
      { key: 'arri', label: 'ARRI' },
      { key: 'red', label: 'RED' },
    ];
  }

  /**
   * Get color legend for UI display
   */
  getLegend(): Array<{ color: string; label: string }> {
    const palette = PALETTES[this.state.preset];
    return palette.map(range => ({
      color: `rgb(${range.color[0]}, ${range.color[1]}, ${range.color[2]})`,
      label: range.label,
    }));
  }

  /**
   * Dispose
   */
  dispose(): void {
    // No cleanup needed
  }
}
