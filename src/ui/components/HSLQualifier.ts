/**
 * HSLQualifier - Secondary Color Correction
 *
 * Features:
 * - Select specific colors by Hue, Saturation, and Luminance ranges
 * - Apply corrections only to selected regions
 * - HSL range sliders with soft falloff
 * - Hue wrap-around support for red (around 0/360 degrees)
 * - Matte preview mode
 * - Invert selection option
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { clamp } from '../../utils/math';

export type { HSLRange, HSLCorrection, HSLQualifierState } from '../../core/types/color';
export { DEFAULT_HSL_RANGE, DEFAULT_HSL_CORRECTION, DEFAULT_HSL_QUALIFIER_STATE } from '../../core/types/color';

import type { HSLRange, HSLCorrection, HSLQualifierState } from '../../core/types/color';
import { DEFAULT_HSL_QUALIFIER_STATE } from '../../core/types/color';

export interface HSLQualifierEvents extends EventMap {
  stateChanged: HSLQualifierState;
}

export class HSLQualifier extends EventEmitter<HSLQualifierEvents> {
  private state: HSLQualifierState = JSON.parse(JSON.stringify(DEFAULT_HSL_QUALIFIER_STATE));

  constructor() {
    super();
  }

  /**
   * Apply HSL Qualifier to ImageData
   * Creates a matte from HSL ranges and applies corrections to selected pixels
   */
  apply(imageData: ImageData): void {
    if (!this.state.enabled) return;

    const data = imageData.data;
    const len = data.length;
    const { hue, saturation, luminance, correction, invert, mattePreview } = this.state;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      // Convert RGB to HSL
      const { h, s, l } = this.rgbToHsl(r, g, b);

      // Calculate matte value (0-1) based on how well pixel matches the HSL ranges
      let matte = this.calculateMatte(h, s * 100, l * 100, hue, saturation, luminance);

      // Invert matte if needed
      if (invert) {
        matte = 1 - matte;
      }

      if (mattePreview) {
        // Show matte as grayscale
        const gray = Math.round(matte * 255);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      } else if (matte > 0.001) {
        // Apply corrections based on matte strength
        const correctedHsl = this.applyCorrection(h, s, l, correction, matte);
        const corrected = this.hslToRgb(correctedHsl.h, correctedHsl.s, correctedHsl.l);

        data[i] = Math.round(corrected.r * 255);
        data[i + 1] = Math.round(corrected.g * 255);
        data[i + 2] = Math.round(corrected.b * 255);
      }
    }
  }

  /**
   * Calculate matte value from HSL distance
   * Returns 0-1 where 1 means pixel fully matches the selection
   */
  private calculateMatte(
    h: number,
    s: number,
    l: number,
    hueRange: HSLRange,
    satRange: HSLRange,
    lumRange: HSLRange
  ): number {
    // Calculate hue match (with wrap-around for red)
    const hueMatch = this.calculateHueMatch(h, hueRange);

    // Calculate saturation match
    const satMatch = this.calculateLinearMatch(s, satRange);

    // Calculate luminance match
    const lumMatch = this.calculateLinearMatch(l, lumRange);

    // Combine matches (multiply for AND logic)
    return hueMatch * satMatch * lumMatch;
  }

  /**
   * Calculate hue match with wrap-around support
   * Handles the case where red spans across 0/360 boundary
   */
  private calculateHueMatch(hue: number, range: HSLRange): number {
    const { center, width, softness } = range;

    // Calculate shortest distance considering wrap-around
    let distance = Math.abs(hue - center);
    if (distance > 180) {
      distance = 360 - distance;
    }

    // Inner and outer edges
    const innerEdge = width / 2;
    const outerEdge = innerEdge + (softness * width) / 100;

    if (distance <= innerEdge) {
      return 1;
    } else if (distance >= outerEdge) {
      return 0;
    } else {
      // Smoothstep falloff
      return this.smoothstep(outerEdge, innerEdge, distance);
    }
  }

  /**
   * Calculate linear match (for saturation and luminance)
   */
  private calculateLinearMatch(value: number, range: HSLRange): number {
    const { center, width, softness } = range;

    const distance = Math.abs(value - center);
    const innerEdge = width / 2;
    const outerEdge = innerEdge + (softness * width) / 100;

    if (distance <= innerEdge) {
      return 1;
    } else if (distance >= outerEdge) {
      return 0;
    } else {
      return this.smoothstep(outerEdge, innerEdge, distance);
    }
  }

  /**
   * Apply correction to HSL values with matte blending
   */
  private applyCorrection(
    h: number,
    s: number,
    l: number,
    correction: HSLCorrection,
    matte: number
  ): { h: number; s: number; l: number } {
    // Apply hue shift
    let newH = h + correction.hueShift * matte;
    // Wrap hue to 0-360
    while (newH < 0) newH += 360;
    while (newH >= 360) newH -= 360;

    // Apply saturation scale (blend with original based on matte)
    const newS = s * (1 - matte) + s * correction.saturationScale * matte;

    // Apply luminance scale (blend with original based on matte)
    const newL = l * (1 - matte) + l * correction.luminanceScale * matte;

    return {
      h: newH,
      s: clamp(newS, 0, 1),
      l: clamp(newL, 0, 1),
    };
  }

  /**
   * Smoothstep function for soft transitions
   */
  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /**
   * Convert RGB to HSL
   * R, G, B in range 0-1
   * Returns H in 0-360, S and L in 0-1
   */
  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
      return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      h = ((b - r) / d + 2) * 60;
    } else {
      h = ((r - g) / d + 4) * 60;
    }

    return { h, s, l };
  }

  /**
   * Convert HSL to RGB
   * H in 0-360, S and L in 0-1
   * Returns R, G, B in 0-1
   */
  private hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
    if (s === 0) {
      return { r: l, g: l, b: l };
    }

    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hNorm = h / 360;

    return {
      r: hue2rgb(p, q, hNorm + 1 / 3),
      g: hue2rgb(p, q, hNorm),
      b: hue2rgb(p, q, hNorm - 1 / 3),
    };
  }

  /**
   * Enable HSL Qualifier
   */
  enable(): void {
    if (this.state.enabled) return;
    this.state.enabled = true;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Disable HSL Qualifier
   */
  disable(): void {
    if (!this.state.enabled) return;
    this.state.enabled = false;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Toggle HSL Qualifier
   */
  toggle(): void {
    this.state.enabled = !this.state.enabled;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Set full state
   */
  setState(state: Partial<HSLQualifierState>): void {
    this.state = { ...this.state, ...state };
    // Deep merge nested objects
    if (state.hue) {
      this.state.hue = { ...this.state.hue, ...state.hue };
    }
    if (state.saturation) {
      this.state.saturation = { ...this.state.saturation, ...state.saturation };
    }
    if (state.luminance) {
      this.state.luminance = { ...this.state.luminance, ...state.luminance };
    }
    if (state.correction) {
      this.state.correction = { ...this.state.correction, ...state.correction };
    }
    this.emit('stateChanged', this.getState());
  }

  /**
   * Get current state (deep copy)
   */
  getState(): HSLQualifierState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Set hue range
   */
  setHueRange(range: Partial<HSLRange>): void {
    this.state.hue = { ...this.state.hue, ...range };
    // Ensure hue center stays in 0-360 range
    while (this.state.hue.center < 0) this.state.hue.center += 360;
    while (this.state.hue.center >= 360) this.state.hue.center -= 360;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Set saturation range
   */
  setSaturationRange(range: Partial<HSLRange>): void {
    this.state.saturation = { ...this.state.saturation, ...range };
    // Clamp center to 0-100
    this.state.saturation.center = clamp(this.state.saturation.center, 0, 100);
    this.emit('stateChanged', this.getState());
  }

  /**
   * Set luminance range
   */
  setLuminanceRange(range: Partial<HSLRange>): void {
    this.state.luminance = { ...this.state.luminance, ...range };
    // Clamp center to 0-100
    this.state.luminance.center = clamp(this.state.luminance.center, 0, 100);
    this.emit('stateChanged', this.getState());
  }

  /**
   * Set correction values
   */
  setCorrection(correction: Partial<HSLCorrection>): void {
    this.state.correction = { ...this.state.correction, ...correction };
    // Clamp values
    this.state.correction.hueShift = clamp(this.state.correction.hueShift, -180, 180);
    this.state.correction.saturationScale = clamp(this.state.correction.saturationScale, 0, 2);
    this.state.correction.luminanceScale = clamp(this.state.correction.luminanceScale, 0, 2);
    this.emit('stateChanged', this.getState());
  }

  /**
   * Set invert mode
   */
  setInvert(invert: boolean): void {
    if (this.state.invert === invert) return;
    this.state.invert = invert;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Toggle invert mode
   */
  toggleInvert(): void {
    this.state.invert = !this.state.invert;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Set matte preview mode
   */
  setMattePreview(preview: boolean): void {
    if (this.state.mattePreview === preview) return;
    this.state.mattePreview = preview;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Toggle matte preview
   */
  toggleMattePreview(): void {
    this.state.mattePreview = !this.state.mattePreview;
    this.emit('stateChanged', this.getState());
  }

  /**
   * Check if any corrections are active (non-default values)
   */
  hasCorrections(): boolean {
    const { correction } = this.state;
    return (
      correction.hueShift !== 0 ||
      correction.saturationScale !== 1 ||
      correction.luminanceScale !== 1
    );
  }

  /**
   * Reset to default state
   */
  reset(): void {
    this.state = JSON.parse(JSON.stringify(DEFAULT_HSL_QUALIFIER_STATE));
    this.emit('stateChanged', this.getState());
  }

  /**
   * Set hue center from color picker / eyedropper
   * Converts RGB color to hue and sets it as center
   */
  pickColor(r: number, g: number, b: number): void {
    const { h, s, l } = this.rgbToHsl(r / 255, g / 255, b / 255);
    this.state.hue.center = h;
    this.state.saturation.center = s * 100;
    this.state.luminance.center = l * 100;
    this.emit('stateChanged', this.getState());
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
