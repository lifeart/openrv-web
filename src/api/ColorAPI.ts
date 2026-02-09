/**
 * ColorAPI - Public color adjustment methods for the OpenRV API
 *
 * Wraps ColorControls and CDLControl to expose color pipeline access.
 */

import type { ColorAdjustmentProvider, CDLProvider } from './types';
import type { ColorAdjustments } from '../core/types/color';
import type { CDLValues } from '../color/CDL';
import { ValidationError } from '../core/errors';

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
  private colorControls: ColorAdjustmentProvider;
  private cdlControl: CDLProvider;

  constructor(colorControls: ColorAdjustmentProvider, cdlControl: CDLProvider) {
    this.colorControls = colorControls;
    this.cdlControl = cdlControl;
  }

  /**
   * Set color adjustments (partial update - merges with current values).
   *
   * Only the provided keys are updated; the rest retain their current values.
   * Non-numeric or NaN values for a key are silently ignored.
   *
   * @param adjustments - An object with one or more color adjustment fields to update.
   *   Valid keys: exposure, gamma, saturation, contrast, hueRotation, temperature,
   *   tint, brightness, highlights, shadows, whites, blacks.
   * @throws {ValidationError} If `adjustments` is not a plain object.
   *
   * @example
   * ```ts
   * openrv.color.setAdjustments({ exposure: 1.5, saturation: 0.8 });
   * ```
   */
  setAdjustments(adjustments: Partial<PublicColorAdjustments>): void {
    if (typeof adjustments !== 'object' || adjustments === null || Array.isArray(adjustments)) {
      throw new ValidationError('setAdjustments() requires an object');
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
   * Get current color adjustments.
   *
   * @returns A snapshot of all current color adjustment values.
   *
   * @example
   * ```ts
   * const adj = openrv.color.getAdjustments();
   * console.log(adj.exposure, adj.gamma);
   * ```
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
   * Reset all color adjustments to their default values.
   *
   * @example
   * ```ts
   * openrv.color.reset();
   * ```
   */
  reset(): void {
    this.colorControls.reset();
  }

  /**
   * Validate that an RGB triplet has valid numeric r, g, b fields
   */
  private validateRGB(obj: unknown, name: string): asserts obj is { r: number; g: number; b: number } {
    if (typeof obj !== 'object' || obj === null) {
      throw new ValidationError(`setCDL() "${name}" must be an object with numeric r, g, b fields`);
    }
    const record = obj as Record<string, unknown>;
    if (
      typeof record.r !== 'number' || isNaN(record.r) ||
      typeof record.g !== 'number' || isNaN(record.g) ||
      typeof record.b !== 'number' || isNaN(record.b)
    ) {
      throw new ValidationError(`setCDL() "${name}" must be an object with numeric r, g, b fields`);
    }
  }

  /**
   * Set CDL (Color Decision List) values (partial update - merges with current values).
   *
   * Each of `slope`, `offset`, and `power` must be an object with numeric `r`, `g`, `b` fields.
   * `saturation` must be a number. Only provided keys are updated.
   *
   * @param cdl - An object with one or more CDL fields: slope, offset, power, saturation.
   * @throws {ValidationError} If `cdl` is not a plain object, or if slope/offset/power
   *   do not have numeric r, g, b fields, or if saturation is not a number.
   *
   * @example
   * ```ts
   * openrv.color.setCDL({ slope: { r: 1.1, g: 1.0, b: 0.9 }, saturation: 1.2 });
   * ```
   */
  setCDL(cdl: Partial<CDLValues>): void {
    if (typeof cdl !== 'object' || cdl === null || Array.isArray(cdl)) {
      throw new ValidationError('setCDL() requires an object');
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
      throw new ValidationError('setCDL() "saturation" must be a number');
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
   * Get current CDL values (returns a defensive copy).
   *
   * @returns A deep copy of the current CDL slope, offset, power, and saturation values.
   *
   * @example
   * ```ts
   * const cdl = openrv.color.getCDL();
   * console.log(cdl.slope.r, cdl.offset.g, cdl.saturation);
   * ```
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
