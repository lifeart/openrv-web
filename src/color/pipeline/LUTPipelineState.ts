/**
 * TypeScript interfaces for the multi-point LUT pipeline state.
 *
 * Defines the shape of LUT stage state, per-source configuration,
 * and session-wide pipeline state.
 */

import type { LUT } from '../LUTLoader';
import type { ColorPrimaries, TransferFunction } from '../../core/image/Image';

/** State for a single LUT stage */
export interface LUTStageState {
  enabled: boolean;
  lutName: string | null;
  lutData: LUT | null;
  intensity: number; // 0.0 to 1.0 blend factor
  source: 'manual' | 'ocio';
  /** 4x4 input matrix (row-major flat[16]) applied before LUT sampling */
  inMatrix: Float32Array | null;
  /** 4x4 output matrix (row-major flat[16]) applied after LUT sampling */
  outMatrix: Float32Array | null;
  /**
   * Color primaries the resulting pixels are encoded in after this stage runs.
   *
   * `null` means the stage is color-space-preserving — i.e., the output is in
   * the same primaries as the input. Set to a concrete value (e.g. `'bt709'`)
   * when the LUT is known to convert into a different space (for example, an
   * AP1 -> Rec.709 input transform). The downstream IPImage carries this value
   * forward as its `colorPrimaries` metadata.
   */
  outputColorPrimaries: ColorPrimaries | null;
  /**
   * Transfer function the resulting pixels are encoded in after this stage
   * runs. `null` means preserve the input's transfer function. Set when the
   * LUT itself encodes/decodes a transfer (e.g. PQ -> linear, Log-C -> linear).
   * The downstream IPImage carries this value forward as its `transferFunction`
   * metadata.
   */
  outputTransferFunction: TransferFunction | null;
}

/** Pre-Cache stage extends base with bit-depth option */
export interface PreCacheStageState extends LUTStageState {
  bitDepth: 'auto' | '8bit' | '16bit' | 'float';
}

/** Per-source LUT configuration */
export interface SourceLUTConfig {
  sourceId: string;
  preCacheLUT: PreCacheStageState;
  fileLUT: LUTStageState;
  lookLUT: LUTStageState;
}

/** Session-wide LUT pipeline state */
export interface LUTPipelineState {
  sources: Map<string, SourceLUTConfig>;
  displayLUT: LUTStageState;
  activeSourceId: string | null;
}

/** Serializable version of stage state (omits binary LUT data) */
export interface SerializableLUTStageState {
  enabled: boolean;
  lutName: string | null;
  intensity: number;
  source: 'manual' | 'ocio';
  lutData?: undefined;
  /** 4x4 input matrix as plain number array (row-major flat[16]) */
  inMatrix?: number[] | null;
  /** 4x4 output matrix as plain number array (row-major flat[16]) */
  outMatrix?: number[] | null;
  /** Output color primaries (or null/undefined to preserve input) */
  outputColorPrimaries?: ColorPrimaries | null;
  /** Output transfer function (or null/undefined to preserve input) */
  outputTransferFunction?: TransferFunction | null;
}

/** Serializable version of pre-cache stage state */
export interface SerializablePreCacheStageState extends SerializableLUTStageState {
  bitDepth: 'auto' | '8bit' | '16bit' | 'float';
}

/** Serializable per-source config */
export interface SerializableSourceLUTConfig {
  sourceId: string;
  preCacheLUT: SerializablePreCacheStageState;
  fileLUT: SerializableLUTStageState;
  lookLUT: SerializableLUTStageState;
}

/** Serializable pipeline state */
export interface SerializableLUTPipelineState {
  sources: Record<string, SerializableSourceLUTConfig>;
  displayLUT: SerializableLUTStageState;
  activeSourceId: string | null;
}

/** LUT pipeline event types */
export interface LUTPipelineEvents {
  stageChanged: { sourceId: string; stage: 'precache' | 'file' | 'look' };
  displayChanged: { stage: 'display' };
  activeSourceChanged: { previousSourceId: string | null; newSourceId: string };
  reset: void;
}
