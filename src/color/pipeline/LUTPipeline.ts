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

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { LUT } from '../LUTLoader';
import type { ColorPrimaries, ImageMetadata, TransferFunction } from '../../core/image/Image';
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

/**
 * Identifier for the four pipeline stages. Matches the public stage labels
 * exposed in the Pre-Cache / File / Look / Display pipeline.
 */
export type StageKind = 'precache' | 'file' | 'look' | 'display';

// Re-export defaults and types for convenient imports
export type { LUTStageState, PreCacheStageState, SourceLUTConfig, LUTPipelineState, SerializableLUTPipelineState };

/** Default state for a single LUT stage */
export const DEFAULT_LUT_STAGE: LUTStageState = {
  enabled: true,
  lutName: null,
  lutData: null,
  intensity: 1.0,
  source: 'manual',
  inMatrix: null,
  outMatrix: null,
  outputColorPrimaries: null,
  outputTransferFunction: null,
};

/**
 * Allowed color primaries values. Mirrors `ColorPrimaries` from `IPImage`
 * — kept as a runtime guard so deserialization can reject malformed
 * persisted state without losing the rest of the stage.
 */
const VALID_COLOR_PRIMARIES = new Set(['bt709', 'bt2020', 'p3'] as const);
/**
 * Allowed transfer-function values. Mirrors `TransferFunction` from
 * `IPImage`. Exported so tests can assert parity with the union type
 * (see `MLUT-LIN-PARITY` in `LUTPipeline.test.ts`).
 */
export const VALID_TRANSFER_FUNCTIONS: ReadonlySet<TransferFunction> = new Set<TransferFunction>([
  'srgb',
  'hlg',
  'pq',
  'smpte240m',
  'linear',
]);

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

  // --- Output color space metadata (per-source per-stage and display) ---

  /**
   * Set the color primaries that the named stage's output is encoded in.
   *
   * Pass `null` to mark the stage as color-space-preserving (the default), in
   * which case the input image's `colorPrimaries` flow through unchanged.
   * Pass a concrete primary set (e.g. `'bt709'`) when the LUT is known to
   * convert into that space (such as an AP1 -> Rec.709 input transform); the
   * resulting IPImage's metadata will be updated accordingly.
   */
  setStageOutputColorPrimaries(
    sourceId: string,
    stage: 'precache' | 'file' | 'look',
    primaries: ColorPrimaries | null,
  ): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    // Sanitize at runtime — TS types don't protect against untyped JS callers
    // (plugins, deserialized JSON) passing invalid strings.
    const sanitized = sanitizeColorPrimaries(primaries);
    // Discriminated update preserves PreCacheStageState's bitDepth field
    // without leaning on a structural cast.
    switch (stage) {
      case 'precache':
        config.preCacheLUT = { ...config.preCacheLUT, outputColorPrimaries: sanitized };
        break;
      case 'file':
        config.fileLUT = { ...config.fileLUT, outputColorPrimaries: sanitized };
        break;
      case 'look':
        config.lookLUT = { ...config.lookLUT, outputColorPrimaries: sanitized };
        break;
    }
    this.emit('stageChanged', { sourceId, stage });
  }

  /**
   * Set the transfer function that the named stage's output is encoded in.
   *
   * Pass `null` to mark the stage as color-space-preserving (the default).
   * Set a concrete value (e.g. `'srgb'`) when the LUT applies an EOTF/OETF
   * transformation; the resulting IPImage's `transferFunction` metadata is
   * updated to match so downstream renderers pick the correct shader path.
   */
  setStageOutputTransferFunction(
    sourceId: string,
    stage: 'precache' | 'file' | 'look',
    transfer: TransferFunction | null,
  ): void {
    const config = this.sources.get(sourceId);
    if (!config) return;
    // Sanitize at runtime — TS types don't protect against untyped JS callers
    // (plugins, deserialized JSON) passing invalid strings.
    const sanitized = sanitizeTransferFunction(transfer);
    // Discriminated update preserves PreCacheStageState's bitDepth field
    // without leaning on a structural cast.
    switch (stage) {
      case 'precache':
        config.preCacheLUT = { ...config.preCacheLUT, outputTransferFunction: sanitized };
        break;
      case 'file':
        config.fileLUT = { ...config.fileLUT, outputTransferFunction: sanitized };
        break;
      case 'look':
        config.lookLUT = { ...config.lookLUT, outputTransferFunction: sanitized };
        break;
    }
    this.emit('stageChanged', { sourceId, stage });
  }

  /** Set the color primaries that the display LUT's output is encoded in. */
  setDisplayLUTOutputColorPrimaries(primaries: ColorPrimaries | null): void {
    // Sanitize at runtime — see `setStageOutputColorPrimaries` for rationale.
    const sanitized = sanitizeColorPrimaries(primaries);
    this.displayLUT = { ...this.displayLUT, outputColorPrimaries: sanitized };
    this.emit('displayChanged', { stage: 'display' });
  }

  /** Set the transfer function that the display LUT's output is encoded in. */
  setDisplayLUTOutputTransferFunction(transfer: TransferFunction | null): void {
    // Sanitize at runtime — see `setStageOutputTransferFunction` for rationale.
    const sanitized = sanitizeTransferFunction(transfer);
    this.displayLUT = { ...this.displayLUT, outputTransferFunction: sanitized };
    this.emit('displayChanged', { stage: 'display' });
  }

  // --- Stage-state read accessors (mirror the setters so UI/observability
  //     code can reflect the declared output color space) ---

  /**
   * Read the current state of a per-source LUT stage. Returns a snapshot
   * (defensive copy) so callers can compare across frames without aliasing.
   */
  getStageState(sourceId: string, stage: 'precache' | 'file' | 'look'): LUTStageState | undefined {
    const config = this.sources.get(sourceId);
    if (!config) return undefined;
    switch (stage) {
      case 'precache':
        return { ...config.preCacheLUT };
      case 'file':
        return { ...config.fileLUT };
      case 'look':
        return { ...config.lookLUT };
    }
  }

  /** Read the current state of the session-wide display stage. */
  getDisplayLUTState(): LUTStageState {
    return { ...this.displayLUT };
  }

  /**
   * Read the declared output color primaries for a given stage, or `null`
   * if the stage is color-space-preserving.
   */
  getStageOutputColorPrimaries(sourceId: string, stage: 'precache' | 'file' | 'look'): ColorPrimaries | null {
    return this.getStageState(sourceId, stage)?.outputColorPrimaries ?? null;
  }

  /**
   * Read the declared output transfer function for a given stage, or `null`
   * if the stage is color-space-preserving.
   */
  getStageOutputTransferFunction(sourceId: string, stage: 'precache' | 'file' | 'look'): TransferFunction | null {
    return this.getStageState(sourceId, stage)?.outputTransferFunction ?? null;
  }

  /** Read the declared output color primaries for the display stage. */
  getDisplayLUTOutputColorPrimaries(): ColorPrimaries | null {
    return this.displayLUT.outputColorPrimaries;
  }

  /** Read the declared output transfer function for the display stage. */
  getDisplayLUTOutputTransferFunction(): TransferFunction | null {
    return this.displayLUT.outputTransferFunction;
  }

  // --- Output metadata cascade (consumed by the renderer / IPImage seam) ---

  /**
   * Compute the cascaded output metadata for a source by walking every
   * enabled stage in pipeline order — Pre-Cache, File, Look, then the
   * session-wide Display stage — and applying each stage's declared output
   * color space (color primaries / transfer function) on top of the running
   * metadata.
   *
   * Each stage follows "null = preserve, non-null = override":
   * - When a stage's `outputColorPrimaries` / `outputTransferFunction` is
   *   `null` the running metadata's corresponding field flows through
   *   unchanged.
   * - When non-null, the stage's declared value overrides the running field.
   *
   * Disabled stages, stages with no LUT loaded, and zero-intensity stages
   * are treated as passthrough — they do **not** contribute their declared
   * output color space, because they are bypassed at render time and the
   * pixels never see the stage's transform.
   *
   * Non-color metadata (frame number, source path, attributes, etc.) is
   * carried through unchanged from the input.
   *
   * This is the single source of truth for "what color space does the
   * pixel data represent **after** the LUT chain has run" (issue MED-51
   * fix). It is consumed by:
   *
   * - {@link applyToIPImage} — to materialize a cascaded-metadata IPImage
   *   for downstream consumers (scopes, tests, panels) that need to know
   *   the post-pipeline state.
   * - The Viewer's `syncLUTPipeline` — to expose the effective output
   *   metadata to UI/observability code without mutating the source's
   *   pre-pipeline IPImage.
   *
   * It is intentionally pure — it never mutates input metadata or
   * pipeline state.
   *
   * If the source is unknown, the input metadata is returned with only
   * the display stage applied (display LUT is session-wide and applies
   * to all sources).
   */
  computeOutputMetadata(sourceId: string, input: ImageMetadata | undefined): ImageMetadata {
    const config = this.sources.get(sourceId);
    const base: ImageMetadata = input ? { ...input } : {};
    if (base.attributes) {
      base.attributes = { ...base.attributes };
    }

    // Helper: a stage contributes its declared output only when active *and*
    // not at zero intensity (zero-intensity = bypass at render time).
    const stageContributes = (stage: LUTStageState): boolean => {
      if (!stage.enabled) return false;
      if (stage.lutData === null) return false;
      if (stage.intensity <= 0) return false;
      return true;
    };

    const applyStage = (stage: LUTStageState): void => {
      if (!stageContributes(stage)) return;
      if (stage.outputColorPrimaries !== null) {
        base.colorPrimaries = stage.outputColorPrimaries;
      }
      if (stage.outputTransferFunction !== null) {
        base.transferFunction = stage.outputTransferFunction;
      }
    };

    if (config) {
      applyStage(config.preCacheLUT);
      applyStage(config.fileLUT);
      applyStage(config.lookLUT);
    }
    applyStage(this.displayLUT);

    return base;
  }

  /**
   * Materialize a {@link IPImage} that carries the cascaded post-pipeline
   * metadata. The pixel buffer is shared with `image` (no copy) so this is
   * cheap to call per-frame; only metadata is freshly allocated.
   *
   * Returns the input `image` by reference when the cascade is a no-op
   * (every enabled stage is metadata-preserving), so the common "no LUTs
   * loaded" case stays allocation-free.
   *
   * Used by the Viewer's `syncLUTPipeline` and by the GPU LUT seam (issue
   * MED-51) to make sure downstream consumers see the effective output
   * color space — File / Look / Display stages no longer drop the metadata
   * silently.
   *
   * **HDR video safety (issue MED-51 / NEW-B4):** Uses
   * `IPImage.cloneMetadataOnly()` rather than `clone()`. For HDR video
   * frames the IPImage holds a 4-byte placeholder `data` buffer with the
   * real pixel source in `managedVideoFrame`. The plain `clone()` would
   * drop the VideoFrame reference and the renderer would read the 4-byte
   * placeholder as if it were the full pixel buffer — heap-out-of-bounds
   * or visible garbage. `cloneMetadataOnly()` shares the VideoFrame ref as
   * a non-owning view, so the renderer still sees the real GPU resource.
   *
   * Note: this does **not** transform pixels. The GPU LUT chain runs the
   * actual color transform inside the shader. This method only annotates
   * an IPImage with what its pixels represent after that chain runs.
   */
  applyToIPImage<T extends { metadata: ImageMetadata; cloneMetadataOnly: () => T }>(sourceId: string, image: T): T {
    const cascaded = this.computeOutputMetadata(sourceId, image.metadata);
    if (metadataEquivalent(image.metadata, cascaded)) {
      return image;
    }
    const out = image.cloneMetadataOnly();
    // `cloneMetadataOnly()` already copies metadata, but we want the
    // cascaded values to win. Replace metadata fields via a non-mutating
    // assign onto the freshly-allocated metadata object.
    Object.assign(out.metadata, cascaded);
    return out;
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
    // Reset event semantics (resolved in PR-1 Phase 3, MED-51):
    //
    // `resetAll()` deliberately emits **per-stage** `stageChanged` events
    // (one per stage per source) plus a `displayChanged`, NOT a single
    // `'reset'` event. Rationale:
    //
    // - Per-source listeners (UI panels, the LUT linter cache, the GPU
    //   chain rebuilder) are already wired to `stageChanged` /
    //   `displayChanged` for incremental updates. Reusing the same
    //   events for `resetAll()` lets them invalidate the right slice of
    //   their state without a special "reset" code path.
    // - `loadSerializableState()` is structurally different — it
    //   wholesale replaces the source map and the active source pointer,
    //   so per-source events would be misleading. It emits a single
    //   `'reset'` event so listeners can fully rebuild.
    //
    // Listeners that need to handle both should subscribe to
    // `stageChanged` + `displayChanged` + `'reset'` (see
    // `LUTPipelineLinter` for the canonical pattern).
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

  /** Restore serializable state saved in a project file (LUT names/settings only, no binary data). */
  loadSerializableState(state: SerializableLUTPipelineState | null | undefined): void {
    this.sources.clear();

    if (!state) {
      this.displayLUT = { ...DEFAULT_LUT_STAGE };
      this.activeSourceId = null;
      this.emit('reset', undefined);
      return;
    }

    for (const [id, config] of Object.entries(state.sources)) {
      this.sources.set(id, {
        sourceId: config.sourceId || id,
        preCacheLUT: deserializePreCacheStage(config.preCacheLUT),
        fileLUT: deserializeStage(config.fileLUT),
        lookLUT: deserializeStage(config.lookLUT),
      });
    }

    this.displayLUT = deserializeStage(state.displayLUT);
    this.activeSourceId =
      state.activeSourceId && this.sources.has(state.activeSourceId)
        ? state.activeSourceId
        : (this.sources.keys().next().value ?? null);
    this.emit('reset', undefined);
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
    outputColorPrimaries: stage.outputColorPrimaries,
    outputTransferFunction: stage.outputTransferFunction,
  };
}

function sanitizeColorPrimaries(value: unknown): ColorPrimaries | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return VALID_COLOR_PRIMARIES.has(value as ColorPrimaries) ? (value as ColorPrimaries) : null;
}

function sanitizeTransferFunction(value: unknown): TransferFunction | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return VALID_TRANSFER_FUNCTIONS.has(value as TransferFunction) ? (value as TransferFunction) : null;
}

function serializePreCacheStage(stage: PreCacheStageState): SerializablePreCacheStageState {
  return {
    ...serializeStage(stage),
    bitDepth: stage.bitDepth,
  };
}

function deserializeStage(stage: SerializableLUTStageState | undefined): LUTStageState {
  return {
    ...DEFAULT_LUT_STAGE,
    enabled: stage?.enabled ?? DEFAULT_LUT_STAGE.enabled,
    lutName: stage?.lutName ?? null,
    lutData: null,
    intensity: clampUnit(stage?.intensity),
    source: stage?.source ?? DEFAULT_LUT_STAGE.source,
    inMatrix: stage?.inMatrix ? new Float32Array(stage.inMatrix) : null,
    outMatrix: stage?.outMatrix ? new Float32Array(stage.outMatrix) : null,
    outputColorPrimaries: sanitizeColorPrimaries(stage?.outputColorPrimaries),
    outputTransferFunction: sanitizeTransferFunction(stage?.outputTransferFunction),
  };
}

function deserializePreCacheStage(stage: SerializablePreCacheStageState | undefined): PreCacheStageState {
  return {
    ...DEFAULT_PRECACHE_STAGE,
    ...deserializeStage(stage),
    bitDepth: stage?.bitDepth ?? DEFAULT_PRECACHE_STAGE.bitDepth,
  };
}

function clampUnit(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

/**
 * Are two metadata snapshots equivalent for cascade purposes?
 *
 * The cascade only ever rewrites `colorPrimaries` and `transferFunction`.
 * If those two fields match, no clone is needed — the input image already
 * carries cascade-correct metadata.
 */
function metadataEquivalent(a: ImageMetadata, b: ImageMetadata): boolean {
  return a.colorPrimaries === b.colorPrimaries && a.transferFunction === b.transferFunction;
}
