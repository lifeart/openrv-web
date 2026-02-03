/**
 * TypeScript interfaces for the multi-point LUT pipeline state.
 *
 * Defines the shape of LUT stage state, per-source configuration,
 * and session-wide pipeline state.
 */

import type { LUT } from '../LUTLoader';

/** State for a single LUT stage */
export interface LUTStageState {
  enabled: boolean;
  lutName: string | null;
  lutData: LUT | null;
  intensity: number; // 0.0 to 1.0 blend factor
  source: 'manual' | 'ocio';
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
