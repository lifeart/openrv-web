/**
 * LUTStage - Single LUT stage class
 *
 * Manages a single slot in the LUT pipeline (load, apply, bypass, intensity).
 * Supports both 1D and 3D LUTs.
 * Supports optional inMatrix/outMatrix for pre/post LUT color transformation.
 */

import type { LUT } from '../LUTLoader';
import type { ColorPrimaries, TransferFunction } from '../../core/image/Image';
import type { LUTStageState } from './LUTPipelineState';
import { sanitizeLUTMatrix } from '../LUTUtils';

export class LUTStage {
  private enabled = true;
  private lutData: LUT | null = null;
  private lutName: string | null = null;
  private intensity = 1.0;
  private lutSource: 'manual' | 'ocio' = 'manual';
  private _inMatrix: Float32Array | null = null;
  private _outMatrix: Float32Array | null = null;
  private _outputColorPrimaries: ColorPrimaries | null = null;
  private _outputTransferFunction: TransferFunction | null = null;

  /** Check if a LUT is loaded */
  hasLUT(): boolean {
    return this.lutData !== null;
  }

  /** Check if the stage is enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Check if the stage is active (has LUT and is enabled) */
  isActive(): boolean {
    return this.hasLUT() && this.enabled;
  }

  /** Get the current LUT data */
  getLUTData(): LUT | null {
    return this.lutData;
  }

  /** Get the display name of the loaded LUT */
  getLUTName(): string | null {
    return this.lutName;
  }

  /** Get the current intensity/blend factor */
  getIntensity(): number {
    return this.intensity;
  }

  /** Get the LUT source (manual or ocio) */
  getSource(): 'manual' | 'ocio' {
    return this.lutSource;
  }

  /** Get the input matrix (row-major flat[16]), or null if identity */
  getInMatrix(): Float32Array | null {
    return this._inMatrix;
  }

  /** Get the output matrix (row-major flat[16]), or null if identity */
  getOutMatrix(): Float32Array | null {
    return this._outMatrix;
  }

  /** Load a LUT into this stage */
  setLUT(lut: LUT, name: string): void {
    this.lutData = lut;
    this.lutName = name;
  }

  /** Clear the LUT from this stage */
  clearLUT(): void {
    this.lutData = null;
    this.lutName = null;
  }

  /** Enable or disable this stage (bypass) */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Set the intensity/blend factor (clamped to 0-1) */
  setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  /** Set the LUT source type */
  setSource(source: 'manual' | 'ocio'): void {
    this.lutSource = source;
  }

  /**
   * Set the input transformation matrix (applied before LUT sampling).
   * Accepts a row-major flat[16] array. NaN/Infinity entries are sanitized to identity.
   * Pass null to clear.
   */
  setInMatrix(matrix: Float32Array | number[] | null): void {
    this._inMatrix = sanitizeLUTMatrix(matrix);
  }

  /**
   * Set the output transformation matrix (applied after LUT sampling).
   * Accepts a row-major flat[16] array. NaN/Infinity entries are sanitized to identity.
   * Pass null to clear.
   */
  setOutMatrix(matrix: Float32Array | number[] | null): void {
    this._outMatrix = sanitizeLUTMatrix(matrix);
  }

  /**
   * The color primaries that pixels are encoded in *after* this stage runs.
   *
   * Returns `null` (the default) when the stage is color-space-preserving.
   * In that case downstream `IPImage`s carry the input's primaries through.
   * When non-null, this value overrides the input's primaries on the output.
   */
  getOutputColorPrimaries(): ColorPrimaries | null {
    return this._outputColorPrimaries;
  }

  /**
   * Declare the color primaries the LUT writes its output in. Pass `null`
   * (the default) for color-space-preserving stages.
   */
  setOutputColorPrimaries(primaries: ColorPrimaries | null): void {
    this._outputColorPrimaries = primaries ?? null;
  }

  /**
   * The transfer function that pixels are encoded in *after* this stage runs.
   *
   * Returns `null` (the default) when the stage preserves its input transfer
   * function. When non-null, this value overrides the input's transfer
   * function on the output (e.g. a shaper LUT marks output as `'srgb'`).
   *
   * Note on linear-light output: the IPImage `TransferFunction` enum only
   * encodes named non-linear transfers (`'srgb' | 'hlg' | 'pq' | 'smpte240m'`).
   * Linear-light is represented by the *absence* of any transfer function on
   * the IPImage — i.e. `metadata.transferFunction === undefined`. To mark a
   * stage as decoding into linear (e.g. PQ -> linear), the recommended
   * pattern is to leave `outputTransferFunction` as `null` (preserve) when
   * the stage runs after another stage that already produced linear output,
   * OR to follow the LUT with a downstream stage that re-encodes into a
   * named transfer. There is no enum value to *explicitly* re-mark output as
   * linear; callers expressing that intent must either downgrade the metadata
   * elsewhere or extend the {@link TransferFunction} type.
   */
  getOutputTransferFunction(): TransferFunction | null {
    return this._outputTransferFunction;
  }

  /**
   * Declare the transfer function the LUT writes its output in. Pass `null`
   * (the default) for transfer-preserving stages.
   *
   * See {@link getOutputTransferFunction} for the linear-light caveat.
   */
  setOutputTransferFunction(transfer: TransferFunction | null): void {
    this._outputTransferFunction = transfer ?? null;
  }

  /** Get a serializable snapshot of this stage's state */
  getState(): LUTStageState {
    return {
      enabled: this.enabled,
      lutName: this.lutName,
      lutData: this.lutData,
      intensity: this.intensity,
      source: this.lutSource,
      inMatrix: this._inMatrix,
      outMatrix: this._outMatrix,
      outputColorPrimaries: this._outputColorPrimaries,
      outputTransferFunction: this._outputTransferFunction,
    };
  }

  /** Reset stage to defaults */
  reset(): void {
    this.enabled = true;
    this.lutData = null;
    this.lutName = null;
    this.intensity = 1.0;
    this.lutSource = 'manual';
    this._inMatrix = null;
    this._outMatrix = null;
    this._outputColorPrimaries = null;
    this._outputTransferFunction = null;
  }
}
