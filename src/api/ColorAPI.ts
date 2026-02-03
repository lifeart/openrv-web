/**
 * ColorAPI - Public color adjustment methods for the OpenRV API
 *
 * Wraps ColorControls and CDLControl to expose color pipeline access.
 */

import type { ColorControls, ColorAdjustments } from '../ui/components/ColorControls';
import type { CDLControl } from '../ui/components/CDLControl';
import type { CDLValues } from '../color/CDL';

/**
 * Subset of ColorAdjustments exposed via the public API
 * (all numeric fields, excluding internal boolean flags)
 */
export interface PublicColorAdjustments {
  exposure: number;
  gamma: number;
  saturation: number;
  contrast: number;
  hueRotation: number;
  temperature: number;
  tint: number;
  brightness: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

export class ColorAPI {
  private colorControls: ColorControls;
  private cdlControl: CDLControl;

  constructor(colorControls: ColorControls, cdlControl: CDLControl) {
    this.colorControls = colorControls;
    this.cdlControl = cdlControl;
  }

  /**
   * Set color adjustments (partial update - merges with current values)
   */
  setAdjustments(adjustments: Partial<PublicColorAdjustments>): void {
    if (typeof adjustments !== 'object' || adjustments === null || Array.isArray(adjustments)) {
      throw new Error('setAdjustments() requires an object');
    }

    const current = this.colorControls.getAdjustments();
    const merged: ColorAdjustments = { ...current };

    // Only allow valid numeric keys - use hasOwnProperty to prevent prototype pollution
    const validKeys: Array<keyof PublicColorAdjustments> = [
      'exposure', 'gamma', 'saturation', 'contrast',
      'hueRotation', 'temperature', 'tint', 'brightness',
      'highlights', 'shadows', 'whites', 'blacks',
    ];

    for (const key of validKeys) {
      if (Object.prototype.hasOwnProperty.call(adjustments, key)) {
        const value = adjustments[key];
        if (typeof value === 'number' && !isNaN(value)) {
          (merged as unknown as Record<string, unknown>)[key] = value;
        }
      }
    }

    this.colorControls.setAdjustments(merged);
  }

  /**
   * Get current color adjustments
   */
  getAdjustments(): PublicColorAdjustments {
    const adj = this.colorControls.getAdjustments();
    return {
      exposure: adj.exposure,
      gamma: adj.gamma,
      saturation: adj.saturation,
      contrast: adj.contrast,
      hueRotation: adj.hueRotation,
      temperature: adj.temperature,
      tint: adj.tint,
      brightness: adj.brightness,
      highlights: adj.highlights,
      shadows: adj.shadows,
      whites: adj.whites,
      blacks: adj.blacks,
    };
  }

  /**
   * Reset all color adjustments to defaults
   */
  reset(): void {
    this.colorControls.reset();
  }

  /**
   * Validate that an RGB triplet has valid numeric r, g, b fields
   */
  private validateRGB(obj: unknown, name: string): asserts obj is { r: number; g: number; b: number } {
    if (
      typeof obj !== 'object' || obj === null ||
      typeof (obj as any).r !== 'number' || isNaN((obj as any).r) ||
      typeof (obj as any).g !== 'number' || isNaN((obj as any).g) ||
      typeof (obj as any).b !== 'number' || isNaN((obj as any).b)
    ) {
      throw new Error(`setCDL() "${name}" must be an object with numeric r, g, b fields`);
    }
  }

  /**
   * Set CDL (Color Decision List) values
   */
  setCDL(cdl: Partial<CDLValues>): void {
    if (typeof cdl !== 'object' || cdl === null || Array.isArray(cdl)) {
      throw new Error('setCDL() requires an object');
    }

    const current = this.cdlControl.getCDL();

    if (cdl.slope !== undefined) {
      this.validateRGB(cdl.slope, 'slope');
    }
    if (cdl.offset !== undefined) {
      this.validateRGB(cdl.offset, 'offset');
    }
    if (cdl.power !== undefined) {
      this.validateRGB(cdl.power, 'power');
    }
    if (cdl.saturation !== undefined && (typeof cdl.saturation !== 'number' || isNaN(cdl.saturation))) {
      throw new Error('setCDL() "saturation" must be a number');
    }

    const merged: CDLValues = {
      slope: cdl.slope ? { r: cdl.slope.r, g: cdl.slope.g, b: cdl.slope.b } : { ...current.slope },
      offset: cdl.offset ? { r: cdl.offset.r, g: cdl.offset.g, b: cdl.offset.b } : { ...current.offset },
      power: cdl.power ? { r: cdl.power.r, g: cdl.power.g, b: cdl.power.b } : { ...current.power },
      saturation: typeof cdl.saturation === 'number' ? cdl.saturation : current.saturation,
    };

    this.cdlControl.setCDL(merged);
  }

  /**
   * Get current CDL values (returns a defensive copy)
   */
  getCDL(): CDLValues {
    const cdl = this.cdlControl.getCDL();
    return {
      slope: { r: cdl.slope.r, g: cdl.slope.g, b: cdl.slope.b },
      offset: { r: cdl.offset.r, g: cdl.offset.g, b: cdl.offset.b },
      power: { r: cdl.power.r, g: cdl.power.g, b: cdl.power.b },
      saturation: cdl.saturation,
    };
  }
}
