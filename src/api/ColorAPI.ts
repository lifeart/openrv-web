/**
 * ColorAPI - Public color adjustment methods for the OpenRV API
 *
 * Wraps ColorControls, CDLControl, and CurvesControl to expose color pipeline access.
 */

import type { ColorAdjustmentProvider, CDLProvider, CurvesProvider } from './types';
import type { ColorAdjustments } from '../core/types/color';
import type { CDLValues } from '../color/CDL';
import type { ColorCurvesData, CurveChannel, CurvePoint } from '../color/ColorCurves';
import { createDefaultCurvesData } from '../color/ColorCurves';
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

export interface PublicCurvePoint {
  x: number;
  y: number;
}

export interface PublicCurveChannel {
  points: PublicCurvePoint[];
  enabled: boolean;
}

export interface PublicColorCurvesData {
  master: PublicCurveChannel;
  red: PublicCurveChannel;
  green: PublicCurveChannel;
  blue: PublicCurveChannel;
}

export interface PublicCurveChannelUpdate {
  points?: PublicCurvePoint[];
  enabled?: boolean;
}

export interface PublicColorCurvesUpdate {
  master?: PublicCurveChannelUpdate;
  red?: PublicCurveChannelUpdate;
  green?: PublicCurveChannelUpdate;
  blue?: PublicCurveChannelUpdate;
}

const CURVE_CHANNELS: Array<keyof ColorCurvesData> = ['master', 'red', 'green', 'blue'];

export class ColorAPI {
  private colorControls: ColorAdjustmentProvider;
  private cdlControl: CDLProvider;
  private curvesControl: CurvesProvider;

  constructor(colorControls: ColorAdjustmentProvider, cdlControl: CDLProvider, curvesControl: CurvesProvider) {
    this.colorControls = colorControls;
    this.cdlControl = cdlControl;
    this.curvesControl = curvesControl;
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

  /**
   * Set color curves with support for per-channel partial updates.
   *
   * Any subset of channels can be provided. Within each channel update,
   * `enabled` and/or `points` may be provided.
   *
   * @example
   * ```ts
   * openrv.color.setCurves({
   *   red: { points: [{ x: 0, y: 0.05 }, { x: 1, y: 0.95 }] },
   *   blue: { enabled: false }
   * });
   * ```
   */
  setCurves(curves: PublicColorCurvesUpdate): void {
    if (typeof curves !== 'object' || curves === null || Array.isArray(curves)) {
      throw new ValidationError('setCurves() requires an object');
    }

    const merged = this.curvesControl.getCurves();

    for (const channel of CURVE_CHANNELS) {
      if (!Object.prototype.hasOwnProperty.call(curves, channel)) {
        continue;
      }

      const update = curves[channel];
      if (typeof update !== 'object' || update === null || Array.isArray(update)) {
        throw new ValidationError(`setCurves() "${channel}" must be an object`);
      }

      this.applyCurveChannelUpdate(merged[channel], channel, update);
    }

    this.curvesControl.setCurves(merged);
  }

  /**
   * Get current curves.
   *
   * Returns a defensive deep copy of master/red/green/blue channels.
   */
  getCurves(): PublicColorCurvesData {
    const curves = this.curvesControl.getCurves();
    return {
      master: this.copyCurveChannel(curves.master),
      red: this.copyCurveChannel(curves.red),
      green: this.copyCurveChannel(curves.green),
      blue: this.copyCurveChannel(curves.blue),
    };
  }

  /**
   * Reset all curves to the default identity state.
   */
  resetCurves(): void {
    this.curvesControl.setCurves(createDefaultCurvesData());
  }

  private applyCurveChannelUpdate(
    channelState: CurveChannel,
    channelName: keyof ColorCurvesData,
    update: PublicCurveChannelUpdate
  ): void {
    if (Object.prototype.hasOwnProperty.call(update, 'enabled')) {
      if (typeof update.enabled !== 'boolean') {
        throw new ValidationError(`setCurves() "${channelName}.enabled" must be a boolean`);
      }
      channelState.enabled = update.enabled;
    }

    if (Object.prototype.hasOwnProperty.call(update, 'points')) {
      if (!Array.isArray(update.points) || update.points.length < 2) {
        throw new ValidationError(`setCurves() "${channelName}.points" must be an array with at least 2 points`);
      }

      const normalizedPoints = update.points
        .map((point, index) => this.validateCurvePoint(point, channelName, index))
        .sort((a, b) => a.x - b.x);

      channelState.points = normalizedPoints;
    }
  }

  private validateCurvePoint(
    point: unknown,
    channelName: keyof ColorCurvesData,
    index: number
  ): CurvePoint {
    if (typeof point !== 'object' || point === null || Array.isArray(point)) {
      throw new ValidationError(`setCurves() "${channelName}.points[${index}]" must be an object`);
    }

    const record = point as Record<string, unknown>;
    const x = record.x;
    const y = record.y;
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      throw new ValidationError(`setCurves() "${channelName}.points[${index}]" must have finite numeric x/y`);
    }
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      throw new ValidationError(`setCurves() "${channelName}.points[${index}]" x/y must be in [0, 1]`);
    }

    return { x, y };
  }

  private copyCurveChannel(channel: CurveChannel): PublicCurveChannel {
    return {
      enabled: channel.enabled,
      points: channel.points.map((point) => ({ x: point.x, y: point.y })),
    };
  }
}
