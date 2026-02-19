/**
 * LUTPipeline - Multi-point LUT pipeline orchestrator
 *
 * Manages the four-point LUT pipeline:
 *   Pre-Cache (software, per-source) -> File (GPU, per-source) ->
 *   [Color Corrections] -> Look (GPU, per-source) -> Display (GPU, session-wide)
 *
 * Each source can have its own Pre-Cache, File, and Look LUT assignments.
 * The Display LUT is shared across all sources.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import type { LUT } from '../LUTLoader';
import type {
  LUTStageState,
  PreCacheStageState,
  SourceLUTConfig,
  LUTPipelineState,
  SerializableLUTPipelineState,
  SerializableLUTStageState,
  SerializablePreCacheStageState,
  SerializableSourceLUTConfig,
} from './LUTPipelineState';

// Re-export defaults and types for convenient imports
export type {
  LUTStageState,
  PreCacheStageState,
  SourceLUTConfig,
  LUTPipelineState,
  SerializableLUTPipelineState,
};

/** Default state for a single LUT stage */
export const DEFAULT_LUT_STAGE: LUTStageState = {
  enabled: true,
  lutName: null,
  lutData: null,
  intensity: 1.0,
  source: 'manual',
  inMatrix: null,
  outMatrix: null,
};

/** Default state for the pre-cache stage */
export const DEFAULT_PRECACHE_STAGE: PreCacheStageState = {
  ...DEFAULT_LUT_STAGE,
  bitDepth: 'auto',
};

/** Default per-source LUT configuration */
export const DEFAULT_SOURCE_LUT_CONFIG: SourceLUTConfig = {
  sourceId: '',
  preCacheLUT: { ...DEFAULT_PRECACHE_STAGE },
  fileLUT: { ...DEFAULT_LUT_STAGE },
  lookLUT: { ...DEFAULT_LUT_STAGE },
};

/** Default pipeline state */
export const DEFAULT_PIPELINE_STATE: LUTPipelineState = {
  sources: new Map(),
  displayLUT: { ...DEFAULT_LUT_STAGE },
  activeSourceId: null,
};

interface PipelineEventMap extends EventMap {
  stageChanged: { sourceId: string; stage: 'precache' | 'file' | 'look' };
  displayChanged: { stage: 'display' };
  activeSourceChanged: { previousSourceId: string | null; newSourceId: string };
  reset: undefined;
}

export class LUTPipeline extends EventEmitter<PipelineEventMap> {
  private sources: Map<string, SourceLUTConfig> = new Map();
  private displayLUT: LUTStageState = { ...DEFAULT_LUT_STAGE };
  private activeSourceId: string | null = null;

  // --- Source Registration ---

  /** Register a new source. If already registered, does not overwrite. */
  registerSource(sourceId: string): void {
    if (this.sources.has(sourceId)) return;
    this.sources.set(sourceId, {
      sourceId,
      preCacheLUT: { ...DEFAULT_PRECACHE_STAGE },
      fileLUT: { ...DEFAULT_LUT_STAGE },
      lookLUT: { ...DEFAULT_LUT_STAGE },
    });
  }

  /** Unregister a source and remove its config */
  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId);
    if (this.activeSourceId === sourceId) {
      this.activeSourceId = null;
    }
  }

  /** Get config for a specific source */
  getSourceConfig(sourceId: string): SourceLUTConfig | undefined {
    return this.sources.get(sourceId);
  }

  /** Get all registered source IDs */
  getSourceIds(): string[] {
    return Array.from(this.sources.keys());
  }

  // --- Active Source ---

  /** Set the active source (for UI display and rendering) */
  setActiveSource(sourceId: string): void {
    const prev = this.activeSourceId;
    this.activeSourceId = sourceId;
    this.emit('activeSourceChanged', { previousSourceId: prev, newSourceId: sourceId });
  }

  /** Get the active source ID */
  getActiveSourceId(): string | null {
    return this.activeSourceId;
  }

  /** Get the config for the active source */
  getActiveSourceConfig(): SourceLUTConfig | undefined {
    if (!this.activeSourceId) return undefined;
    return this.sources.get(this.activeSourceId);
  }

  // --- Pre-Cache LUT (per-source) ---

  setPreCacheLUT(sourceId: string, lut: LUT, name: string): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.preCacheLUT = {
      ...config.preCacheLUT,
      lutData: lut,
      lutName: name,
    };
    this.emit('stageChanged', { sourceId, stage: 'precache' });
  }

  clearPreCacheLUT(sourceId: string): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.preCacheLUT = {
      ...config.preCacheLUT,
      lutData: null,
      lutName: null,
    };
    this.emit('stageChanged', { sourceId, stage: 'precache' });
  }

  setPreCacheLUTEnabled(sourceId: string, enabled: boolean): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.preCacheLUT = { ...config.preCacheLUT, enabled };
    this.emit('stageChanged', { sourceId, stage: 'precache' });
  }

  setPreCacheLUTIntensity(sourceId: string, intensity: number): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.preCacheLUT = {
      ...config.preCacheLUT,
      intensity: Math.max(0, Math.min(1, intensity)),
    };
    this.emit('stageChanged', { sourceId, stage: 'precache' });
  }

  // --- File LUT (per-source) ---

  setFileLUT(sourceId: string, lut: LUT, name: string): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.fileLUT = {
      ...config.fileLUT,
      lutData: lut,
      lutName: name,
    };
    this.emit('stageChanged', { sourceId, stage: 'file' });
  }

  clearFileLUT(sourceId: string): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.fileLUT = {
      ...config.fileLUT,
      lutData: null,
      lutName: null,
    };
    this.emit('stageChanged', { sourceId, stage: 'file' });
  }

  setFileLUTEnabled(sourceId: string, enabled: boolean): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.fileLUT = { ...config.fileLUT, enabled };
    this.emit('stageChanged', { sourceId, stage: 'file' });
  }

  setFileLUTIntensity(sourceId: string, intensity: number): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.fileLUT = {
      ...config.fileLUT,
      intensity: Math.max(0, Math.min(1, intensity)),
    };
    this.emit('stageChanged', { sourceId, stage: 'file' });
  }

  // --- Look LUT (per-source) ---

  setLookLUT(sourceId: string, lut: LUT, name: string): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.lookLUT = {
      ...config.lookLUT,
      lutData: lut,
      lutName: name,
    };
    this.emit('stageChanged', { sourceId, stage: 'look' });
  }

  clearLookLUT(sourceId: string): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.lookLUT = {
      ...config.lookLUT,
      lutData: null,
      lutName: null,
    };
    this.emit('stageChanged', { sourceId, stage: 'look' });
  }

  setLookLUTEnabled(sourceId: string, enabled: boolean): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.lookLUT = { ...config.lookLUT, enabled };
    this.emit('stageChanged', { sourceId, stage: 'look' });
  }

  setLookLUTIntensity(sourceId: string, intensity: number): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.lookLUT = {
      ...config.lookLUT,
      intensity: Math.max(0, Math.min(1, intensity)),
    };
    this.emit('stageChanged', { sourceId, stage: 'look' });
  }

  // --- Display LUT (session-wide) ---

  setDisplayLUT(lut: LUT, name: string): void {
    this.displayLUT = {
      ...this.displayLUT,
      lutData: lut,
      lutName: name,
    };
    this.emit('displayChanged', { stage: 'display' });
  }

  clearDisplayLUT(): void {
    this.displayLUT = {
      ...this.displayLUT,
      lutData: null,
      lutName: null,
    };
    this.emit('displayChanged', { stage: 'display' });
  }

  setDisplayLUTEnabled(enabled: boolean): void {
    this.displayLUT = { ...this.displayLUT, enabled };
    this.emit('displayChanged', { stage: 'display' });
  }

  setDisplayLUTIntensity(intensity: number): void {
    this.displayLUT = {
      ...this.displayLUT,
      intensity: Math.max(0, Math.min(1, intensity)),
    };
    this.emit('displayChanged', { stage: 'display' });
  }

  // --- Reset ---

  /** Reset all LUT stages for a single source (preserves display LUT) */
  resetSource(sourceId: string): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    config.preCacheLUT = { ...DEFAULT_PRECACHE_STAGE };
    config.fileLUT = { ...DEFAULT_LUT_STAGE };
    config.lookLUT = { ...DEFAULT_LUT_STAGE };
    this.emit('stageChanged', { sourceId, stage: 'precache' });
    this.emit('stageChanged', { sourceId, stage: 'file' });
    this.emit('stageChanged', { sourceId, stage: 'look' });
  }

  /** Reset all stages including display LUT (preserves source registrations) */
  resetAll(): void {
    for (const sourceId of this.sources.keys()) {
      this.resetSource(sourceId);
    }
    this.displayLUT = { ...DEFAULT_LUT_STAGE };
    this.emit('displayChanged', { stage: 'display' });
  }

  // --- State ---

  /** Get the full pipeline state */
  getState(): LUTPipelineState {
    return {
      sources: new Map(this.sources),
      displayLUT: { ...this.displayLUT },
      activeSourceId: this.activeSourceId,
    };
  }

  /** Get a serializable state (omits binary LUT data) for session save */
  getSerializableState(): SerializableLUTPipelineState {
    const sources: Record<string, SerializableSourceLUTConfig> = {};
    for (const [id, config] of this.sources) {
      sources[id] = {
        sourceId: config.sourceId,
        preCacheLUT: serializePreCacheStage(config.preCacheLUT),
        fileLUT: serializeStage(config.fileLUT),
        lookLUT: serializeStage(config.lookLUT),
      };
    }
    return {
      sources,
      displayLUT: serializeStage(this.displayLUT),
      activeSourceId: this.activeSourceId,
    };
  }
}

function serializeStage(stage: LUTStageState): SerializableLUTStageState {
  return {
    enabled: stage.enabled,
    lutName: stage.lutName,
    intensity: stage.intensity,
    source: stage.source,
    lutData: undefined,
    inMatrix: stage.inMatrix ? Array.from(stage.inMatrix) : null,
    outMatrix: stage.outMatrix ? Array.from(stage.outMatrix) : null,
  };
}

function serializePreCacheStage(stage: PreCacheStageState): SerializablePreCacheStageState {
  return {
    ...serializeStage(stage),
    bitDepth: stage.bitDepth,
  };
}
