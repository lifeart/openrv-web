/**
 * LUTStage - Single LUT stage class
 *
 * Manages a single slot in the LUT pipeline (load, apply, bypass, intensity).
 * Supports both 1D and 3D LUTs.
 */

import type { LUT } from '../LUTLoader';
import type { LUTStageState } from './LUTPipelineState';

export class LUTStage {
  private enabled = true;
  private lutData: LUT | null = null;
  private lutName: string | null = null;
  private intensity = 1.0;
  private lutSource: 'manual' | 'ocio' = 'manual';

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

  /** Get a serializable snapshot of this stage's state */
  getState(): LUTStageState {
    return {
      enabled: this.enabled,
      lutName: this.lutName,
      lutData: this.lutData,
      intensity: this.intensity,
      source: this.lutSource,
    };
  }

  /** Reset stage to defaults */
  reset(): void {
    this.enabled = true;
    this.lutData = null;
    this.lutName = null;
    this.intensity = 1.0;
    this.lutSource = 'manual';
  }
}
