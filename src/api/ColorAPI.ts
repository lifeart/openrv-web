/**
 * ColorAPI - Public color adjustment methods for the OpenRV API
 *
 * Wraps ColorControls, CDLControl, and CurvesControl to expose color pipeline access.
 */

import type {
  ColorAdjustmentProvider,
  CDLProvider,
  CurvesProvider,
  LUTProvider,
  ToneMappingProvider,
  DisplayProvider,
  DisplayCapabilitiesProvider,
  OCIOProvider,
} from './types';
import type { ColorAdjustments } from '../core/types/color';
import type { CDLValues } from '../color/CDL';
import { DEFAULT_CDL } from '../color/CDL';
import type { ColorCurvesData, CurveChannel, CurvePoint } from '../color/ColorCurves';
import { createDefaultCurvesData, exportCurvesJSON, importCurvesJSON } from '../color/ColorCurves';
import type { LUT } from '../color/LUTLoader';
import { generatePresetLUT, LUT_PRESETS } from '../color/LUTPresets';
import type { ToneMappingState, ToneMappingOperator } from '../core/types/effects';
import { TONE_MAPPING_OPERATORS } from '../core/types/effects';
import type { DisplayColorState } from '../color/DisplayTransfer';
import type { DisplayCapabilities } from '../color/DisplayCapabilities';
import type { OCIOState } from '../color/OCIOConfig';
import { getAvailableConfigs as getOCIOAvailableConfigs } from '../color/OCIOConfig';
import { ValidationError, APIError } from '../core/errors';
import { DisposableAPI } from './Disposable';

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

export class ColorAPI extends DisposableAPI {
  private colorControls: ColorAdjustmentProvider;
  private cdlControl: CDLProvider;
  private curvesControl: CurvesProvider;
  private lutProvider: LUTProvider | undefined;
  private toneMappingProvider: ToneMappingProvider | undefined;
  private displayProvider: DisplayProvider | undefined;
  private displayCapabilitiesProvider: DisplayCapabilitiesProvider | undefined;
  private ocioProvider: OCIOProvider | undefined;

  constructor(
    colorControls: ColorAdjustmentProvider,
    cdlControl: CDLProvider,
    curvesControl: CurvesProvider,
    lutProvider?: LUTProvider,
    toneMappingProvider?: ToneMappingProvider,
    displayProvider?: DisplayProvider,
    displayCapabilitiesProvider?: DisplayCapabilitiesProvider,
    ocioProvider?: OCIOProvider,
  ) {
    super();
    this.colorControls = colorControls;
    this.cdlControl = cdlControl;
    this.curvesControl = curvesControl;
    this.lutProvider = lutProvider;
    this.toneMappingProvider = toneMappingProvider;
    this.displayProvider = displayProvider;
    this.displayCapabilitiesProvider = displayCapabilitiesProvider;
    this.ocioProvider = ocioProvider;
  }

  /**
   * Set color adjustments (partial update - merges with current values).
   *
   * Only the provided keys are updated; the rest retain their current values.
   *
   * @param adjustments - An object with one or more color adjustment fields to update.
   *   Valid keys: exposure, gamma, saturation, contrast, hueRotation, temperature,
   *   tint, brightness, highlights, shadows, whites, blacks.
   * @throws {ValidationError} If `adjustments` is not a plain object, or if any
   *   provided numeric field is not a finite number.
   *
   * @example
   * ```ts
   * openrv.color.setAdjustments({ exposure: 1.5, saturation: 0.8 });
   * ```
   */
  setAdjustments(adjustments: Partial<PublicColorAdjustments>): void {
    this.assertNotDisposed();
    if (typeof adjustments !== 'object' || adjustments === null || Array.isArray(adjustments)) {
      throw new ValidationError('setAdjustments() requires an object');
    }

    const current = this.colorControls.getAdjustments();
    const merged: ColorAdjustments = { ...current };

    // Only allow valid numeric keys - use hasOwnProperty to prevent prototype pollution
    const validKeys: Array<keyof PublicColorAdjustments> = [
      'exposure',
      'gamma',
      'saturation',
      'contrast',
      'hueRotation',
      'temperature',
      'tint',
      'brightness',
      'highlights',
      'shadows',
      'whites',
      'blacks',
    ];

    for (const key of validKeys) {
      if (Object.prototype.hasOwnProperty.call(adjustments, key)) {
        const value = adjustments[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new ValidationError(`setAdjustments() "${key}" must be a finite number`);
        }
        (merged as unknown as Record<string, unknown>)[key] = value;
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
    this.assertNotDisposed();
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
    this.assertNotDisposed();
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
      typeof record.r !== 'number' ||
      !Number.isFinite(record.r) ||
      typeof record.g !== 'number' ||
      !Number.isFinite(record.g) ||
      typeof record.b !== 'number' ||
      !Number.isFinite(record.b)
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
    this.assertNotDisposed();
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
    if (cdl.saturation !== undefined && (typeof cdl.saturation !== 'number' || !Number.isFinite(cdl.saturation))) {
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
    this.assertNotDisposed();
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
    this.assertNotDisposed();
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
    this.assertNotDisposed();
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
    this.assertNotDisposed();
    this.curvesControl.setCurves(createDefaultCurvesData());
  }

  // =========================================================================
  // CDL Reset
  // =========================================================================

  /**
   * Reset CDL values to their defaults (slope 1.0, offset 0.0, power 1.0, saturation 1.0).
   *
   * @example
   * ```ts
   * openrv.color.resetCDL();
   * ```
   */
  resetCDL(): void {
    this.assertNotDisposed();
    this.cdlControl.setCDL({
      slope: { r: DEFAULT_CDL.slope.r, g: DEFAULT_CDL.slope.g, b: DEFAULT_CDL.slope.b },
      offset: { r: DEFAULT_CDL.offset.r, g: DEFAULT_CDL.offset.g, b: DEFAULT_CDL.offset.b },
      power: { r: DEFAULT_CDL.power.r, g: DEFAULT_CDL.power.g, b: DEFAULT_CDL.power.b },
      saturation: DEFAULT_CDL.saturation,
    });
  }

  // =========================================================================
  // Curves Export / Import
  // =========================================================================

  /**
   * Export current curves as a JSON string.
   *
   * @returns A JSON string representation of the current curves data.
   *
   * @example
   * ```ts
   * const json = openrv.color.exportCurvesJSON();
   * localStorage.setItem('myCurves', json);
   * ```
   */
  exportCurvesJSON(): string {
    this.assertNotDisposed();
    const curves = this.curvesControl.getCurves();
    return exportCurvesJSON(curves);
  }

  /**
   * Import curves from a JSON string.
   *
   * The JSON must contain valid master, red, green, and blue channel data.
   *
   * @param json - A JSON string previously obtained from exportCurvesJSON().
   * @throws {ValidationError} If the JSON string is not valid or does not contain valid curves data.
   *
   * @example
   * ```ts
   * const json = localStorage.getItem('myCurves');
   * if (json) openrv.color.importCurvesJSON(json);
   * ```
   */
  importCurvesJSON(json: string): void {
    this.assertNotDisposed();
    if (typeof json !== 'string') {
      throw new ValidationError('importCurvesJSON() requires a string argument');
    }
    const curves = importCurvesJSON(json);
    if (!curves) {
      throw new ValidationError('importCurvesJSON() received invalid curves JSON');
    }
    this.curvesControl.setCurves(curves);
  }

  // =========================================================================
  // LUT Methods
  // =========================================================================

  /**
   * Assert that a LUT provider is available.
   */
  private assertLUTProvider(): LUTProvider {
    if (!this.lutProvider) {
      throw new APIError('LUT operations are not available (no LUT provider configured)');
    }
    return this.lutProvider;
  }

  /**
   * Load a LUT (Look-Up Table) directly from a parsed LUT object.
   *
   * @param lut - A parsed LUT object (1D or 3D). Pass `null` to clear.
   *
   * @example
   * ```ts
   * openrv.color.loadLUT(parsedLut);
   * ```
   */
  loadLUT(lut: LUT | null): void {
    this.assertNotDisposed();
    const provider = this.assertLUTProvider();
    provider.setLUT(lut);
  }

  /**
   * Set the LUT blending intensity (0 = bypass, 1 = full effect).
   *
   * @param value - Intensity in [0, 1].
   * @throws {ValidationError} If value is not a finite number.
   *
   * @example
   * ```ts
   * openrv.color.setLUTIntensity(0.75);
   * ```
   */
  setLUTIntensity(value: number): void {
    this.assertNotDisposed();
    const provider = this.assertLUTProvider();
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError('setLUTIntensity() requires a finite number');
    }
    provider.setLUTIntensity(Math.max(0, Math.min(1, value)));
  }

  /**
   * Clear the currently active LUT.
   *
   * @example
   * ```ts
   * openrv.color.clearLUT();
   * ```
   */
  clearLUT(): void {
    this.assertNotDisposed();
    const provider = this.assertLUTProvider();
    provider.setLUT(null);
  }

  /**
   * Apply a built-in LUT preset by name.
   *
   * @param name - Preset identifier (e.g. 'warm-film', 'bleach-bypass', 'identity').
   * @throws {ValidationError} If the preset name is not recognized.
   *
   * @example
   * ```ts
   * openrv.color.applyLUTPreset('warm-film');
   * ```
   */
  applyLUTPreset(name: string): void {
    this.assertNotDisposed();
    const provider = this.assertLUTProvider();
    if (typeof name !== 'string' || !name) {
      throw new ValidationError('applyLUTPreset() requires a non-empty string');
    }
    const lut = generatePresetLUT(name);
    if (!lut) {
      const available = LUT_PRESETS.map((p) => p.id).join(', ');
      throw new ValidationError(`applyLUTPreset() unknown preset "${name}". Available: ${available}`);
    }
    provider.setLUT(lut);
  }

  // =========================================================================
  // Tone Mapping
  // =========================================================================

  /**
   * Assert that a tone mapping provider is available.
   */
  private assertToneMappingProvider(): ToneMappingProvider {
    if (!this.toneMappingProvider) {
      throw new APIError('Tone mapping operations are not available (no tone mapping provider configured)');
    }
    return this.toneMappingProvider;
  }

  /**
   * Set tone mapping options.
   *
   * @param options - Partial tone mapping state. At minimum, provide `enabled` and/or `operator`.
   * @throws {ValidationError} If options is not a plain object or contains invalid values.
   *
   * @example
   * ```ts
   * openrv.color.setToneMapping({ operator: 'aces', enabled: true });
   * openrv.color.setToneMapping({ enabled: false });
   * ```
   */
  setToneMapping(options: Partial<ToneMappingState>): void {
    this.assertNotDisposed();
    const provider = this.assertToneMappingProvider();
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
      throw new ValidationError('setToneMapping() requires an object');
    }

    const current = provider.getToneMappingState();
    const merged: ToneMappingState = { ...current };

    if (Object.prototype.hasOwnProperty.call(options, 'enabled')) {
      if (typeof options.enabled !== 'boolean') {
        throw new ValidationError('setToneMapping() "enabled" must be a boolean');
      }
      merged.enabled = options.enabled;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'operator')) {
      const validOperators = TONE_MAPPING_OPERATORS.map((op) => op.key);
      if (!validOperators.includes(options.operator as ToneMappingOperator)) {
        throw new ValidationError(
          `setToneMapping() "operator" must be one of: ${validOperators.join(', ')}`,
        );
      }
      merged.operator = options.operator as ToneMappingOperator;
    }

    // Numeric optional parameters
    const numericKeys: Array<keyof ToneMappingState> = [
      'reinhardWhitePoint',
      'filmicExposureBias',
      'filmicWhitePoint',
      'dragoBias',
      'dragoLwa',
      'dragoLmax',
      'dragoBrightness',
    ];

    for (const key of numericKeys) {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        const value = options[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          (merged as unknown as Record<string, unknown>)[key] = value;
        }
      }
    }

    provider.setToneMappingState(merged);
  }

  /**
   * Get the current tone mapping state.
   *
   * @returns A snapshot of the current tone mapping configuration.
   *
   * @example
   * ```ts
   * const tm = openrv.color.getToneMapping();
   * console.log(tm.operator, tm.enabled);
   * ```
   */
  getToneMapping(): ToneMappingState {
    this.assertNotDisposed();
    const provider = this.assertToneMappingProvider();
    return { ...provider.getToneMappingState() };
  }

  // =========================================================================
  // Display Profile
  // =========================================================================

  /**
   * Assert that a display provider is available.
   */
  private assertDisplayProvider(): DisplayProvider {
    if (!this.displayProvider) {
      throw new APIError('Display profile operations are not available (no display provider configured)');
    }
    return this.displayProvider;
  }

  /**
   * Set the display color profile.
   *
   * @param profile - Display color state including transfer function, gamma, brightness.
   * @throws {ValidationError} If profile is not a plain object.
   *
   * @example
   * ```ts
   * openrv.color.setDisplayProfile({
   *   transferFunction: 'rec709',
   *   displayGamma: 1.0,
   *   displayBrightness: 1.0,
   *   customGamma: 2.2,
   * });
   * ```
   */
  setDisplayProfile(profile: Partial<DisplayColorState>): void {
    this.assertNotDisposed();
    const provider = this.assertDisplayProvider();
    if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
      throw new ValidationError('setDisplayProfile() requires an object');
    }
    const current = provider.getDisplayColorState();
    const merged: DisplayColorState = { ...current, ...profile };
    provider.setDisplayColorState(merged);
  }

  /**
   * Get the current display color profile.
   *
   * @returns A snapshot of the current display color state.
   */
  getDisplayProfile(): DisplayColorState {
    this.assertNotDisposed();
    const provider = this.assertDisplayProvider();
    return { ...provider.getDisplayColorState() };
  }

  // =========================================================================
  // Display Capabilities
  // =========================================================================

  /**
   * Get the probed display capabilities.
   *
   * @returns A snapshot of the display capability detection results.
   *
   * @example
   * ```ts
   * const caps = openrv.color.getDisplayCapabilities();
   * console.log(caps.displayGamut, caps.displayHDR);
   * ```
   */
  getDisplayCapabilities(): DisplayCapabilities {
    this.assertNotDisposed();
    if (!this.displayCapabilitiesProvider) {
      throw new APIError('Display capabilities are not available (no capabilities provider configured)');
    }
    return { ...this.displayCapabilitiesProvider.getDisplayCapabilities() };
  }

  // =========================================================================
  // OCIO
  // =========================================================================

  /**
   * Assert that an OCIO provider is available.
   */
  private assertOCIOProvider(): OCIOProvider {
    if (!this.ocioProvider) {
      throw new APIError('OCIO operations are not available (no OCIO provider configured)');
    }
    return this.ocioProvider;
  }

  /**
   * Set OCIO pipeline state (partial update - merges with current values).
   *
   * @param state - Partial OCIO state to merge.
   * @throws {ValidationError} If state is not a plain object.
   *
   * @example
   * ```ts
   * openrv.color.setOCIOState({
   *   enabled: true,
   *   configName: 'aces_1.2',
   *   inputColorSpace: 'ARRI LogC3 (EI 800)',
   * });
   * ```
   */
  setOCIOState(state: Partial<OCIOState>): void {
    this.assertNotDisposed();
    const provider = this.assertOCIOProvider();
    if (typeof state !== 'object' || state === null || Array.isArray(state)) {
      throw new ValidationError('setOCIOState() requires an object');
    }
    provider.setOCIOState(state);
  }

  /**
   * Get current OCIO pipeline state.
   *
   * @returns A snapshot of the current OCIO configuration.
   *
   * @example
   * ```ts
   * const state = openrv.color.getOCIOState();
   * console.log(state.configName, state.inputColorSpace);
   * ```
   */
  getOCIOState(): OCIOState {
    this.assertNotDisposed();
    const provider = this.assertOCIOProvider();
    return { ...provider.getOCIOState() };
  }

  /**
   * Get the list of available OCIO configurations (both built-in and custom).
   *
   * This is a static query that does not require an OCIO provider.
   *
   * @returns An array of configuration descriptors with name and description.
   *
   * @example
   * ```ts
   * const configs = openrv.color.getAvailableConfigs();
   * configs.forEach(c => console.log(c.name, c.description));
   * ```
   */
  getAvailableConfigs(): Array<{ name: string; description: string }> {
    this.assertNotDisposed();
    return getOCIOAvailableConfigs();
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private applyCurveChannelUpdate(
    channelState: CurveChannel,
    channelName: keyof ColorCurvesData,
    update: PublicCurveChannelUpdate,
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

  private validateCurvePoint(point: unknown, channelName: keyof ColorCurvesData, index: number): CurvePoint {
    if (typeof point !== 'object' || point === null || Array.isArray(point)) {
      throw new ValidationError(`setCurves() "${channelName}.points[${index}]" must be an object`);
    }

    const record = point as Record<string, unknown>;
    const x = record.x;
    const y = record.y;
    if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
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
