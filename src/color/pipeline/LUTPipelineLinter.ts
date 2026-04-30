/**
 * LUTPipelineLinter — opt-in heuristics that flag implausible
 * declarations in the LUT pipeline (e.g. "output transfer matches input
 * transfer for an exotic transfer like PQ/HLG", which usually means the
 * user forgot to declare the EOTF the LUT actually maps into).
 *
 * The module is intentionally **opt-in** — nothing in the renderer or
 * the cascade applier (`Viewer.applyLUTMetadataCascade`) wires this in
 * automatically. Consumers (UI panels, dev tools, tests) instantiate
 * the linter explicitly when they want continuous reports.
 *
 * Two surfaces:
 *
 * - {@link lintLUTPipeline} — pure function. One-shot inspection. No
 *   subscriptions, no caching, no logging.
 * - {@link createLUTPipelineLinter} — event-driven controller that
 *   subscribes to {@link LUTPipeline} events and caches per-source
 *   reports. Cache invalidates on `stageChanged` / `displayChanged` /
 *   `reset` so callers always see post-change results without paying
 *   for re-computation on every frame.
 *
 * **Reset-event semantics (PR-0 follow-up, MED-51):** `LUTPipeline`
 * emits per-stage `stageChanged` for `resetAll()` (one per stage per
 * source plus a final `displayChanged`) and a single `'reset'` for
 * `loadSerializableState()`. The linter subscribes to **all three**
 * because both reset paths must invalidate cached reports — see
 * comments inline below.
 */

import type { ImageMetadata, TransferFunction } from '../../core/image/Image';
import type { LUTPipeline, StageKind } from './LUTPipeline';

export type LintSeverity = 'info' | 'warn' | 'error';

export interface LintReport {
  severity: LintSeverity;
  code: string;
  message: string;
  /** Stage that triggered the lint, if applicable */
  stage?: StageKind;
  /** Source id if relevant */
  sourceId?: string;
}

/**
 * Transfer functions that almost never round-trip identically through a
 * creative LUT. If a LUT declares one of these as its output **and** the
 * input is the same, it's almost certainly a misdeclaration — the
 * renderer will skip the EOTF decode and the user's image will look
 * wrong.
 *
 * Kept narrow on purpose. Legitimate cases that must NOT fire:
 * - HLG passthrough Display LUT (input HLG, output declared null —
 *   never reaches this heuristic, no declared output)
 * - PQ -> PQ creative LUT where the colorist explicitly preserves PQ
 *   (still flagged; the heuristic is informational and the warn message
 *   tells them to re-declare if intentional)
 * - Identity Display LUT (no declared output -> not flagged)
 * - Round-trip QC LUTs (no declared output -> not flagged)
 *
 * `srgb`, `linear`, `smpte240m` are excluded because matching declared
 * == input for these is common and harmless (e.g. SDR rec.709 sRGB
 * round-trips through a creative LUT all the time).
 */
const EXOTIC_TRANSFERS: ReadonlySet<TransferFunction> = new Set<TransferFunction>(['pq', 'hlg']);

const ALL_STAGES: readonly StageKind[] = ['precache', 'file', 'look', 'display'] as const;

/**
 * One-shot lint: walks every stage and reports implausible declarations
 * for the given source. Pure — no side effects, no subscriptions, no
 * logging, no caching. Use this when you only need a single inspection
 * (test asserts, debug panels that recompute on demand).
 *
 * For continuous (event-driven) linting see {@link createLUTPipelineLinter}.
 */
export function lintLUTPipeline(
  pipeline: LUTPipeline,
  sourceId: string,
  inputMetadata: ImageMetadata | undefined,
): LintReport[] {
  const reports: LintReport[] = [];

  for (const stage of ALL_STAGES) {
    const declaredTransfer: TransferFunction | null =
      stage === 'display'
        ? pipeline.getDisplayLUTOutputTransferFunction()
        : pipeline.getStageOutputTransferFunction(sourceId, stage);

    if (
      declaredTransfer !== null &&
      inputMetadata?.transferFunction !== undefined &&
      declaredTransfer === inputMetadata.transferFunction &&
      EXOTIC_TRANSFERS.has(declaredTransfer)
    ) {
      reports.push({
        severity: 'warn',
        code: 'OUTPUT_MATCHES_INPUT_EXOTIC',
        message:
          `Stage '${stage}' declares outputTransferFunction='${declaredTransfer}' which matches the input. ` +
          `The renderer will skip its EOTF decode. If your LUT actually maps to sRGB or another transfer, ` +
          `declare that instead.`,
        stage,
        sourceId,
      });
    }
  }

  return reports;
}

/**
 * Controller returned by {@link createLUTPipelineLinter}. Wraps an
 * event-driven cache around {@link lintLUTPipeline}.
 */
export interface LUTPipelineLinterController {
  /**
   * Lint the pipeline for the given source. Cache hits return the same
   * `LintReport[]` instance until the cache is invalidated by a
   * pipeline event, so referential equality is a valid "reports
   * unchanged" signal for memoized consumers.
   */
  lint(sourceId: string, inputMetadata: ImageMetadata | undefined): LintReport[];
  /** Unsubscribe from pipeline events and drop the cache. */
  dispose(): void;
  /**
   * Subscribe to cache-invalidation events. Callback fires with the
   * `sourceId` whose entries were dropped, or `'*'` when display /
   * reset events drop the entire cache.
   * Returns an unsubscribe function.
   */
  onReportsChanged(callback: (sourceId: string) => void): () => void;
}

/**
 * Build a {@link LUTPipelineLinterController} that subscribes to
 * `pipeline` events and caches per-source reports.
 *
 * Subscriptions and cache-invalidation policy:
 *
 * - `stageChanged` — invalidates entries for the affected `sourceId`.
 *   This covers `LUTPipeline.resetAll()`, which emits a
 *   `stageChanged` per stage per source (incremental reset semantics,
 *   chosen over a single `'reset'` so per-source listeners don't have
 *   to re-discover which sources changed).
 * - `displayChanged` — clears the entire cache. Display LUT is
 *   session-wide, so any cached lint that referenced display state
 *   may be stale.
 * - `reset` — clears the entire cache. Emitted by
 *   `loadSerializableState()` (project file restore), where the
 *   pipeline state is replaced wholesale and per-source events are
 *   not emitted.
 */
export function createLUTPipelineLinter(pipeline: LUTPipeline): LUTPipelineLinterController {
  // Cache key: `${sourceId}:${transferFunction|none}:${colorPrimaries|none}`
  // We include the input metadata in the key so cached reports stay
  // valid when callers swap between sources with different input color
  // spaces without forcing a manual invalidation.
  const cache = new Map<string, LintReport[]>();
  const reportsChangedCallbacks = new Set<(sourceId: string) => void>();
  let disposed = false;

  const fireReportsChanged = (sourceId: string): void => {
    // Snapshot before iteration so unsubscribe-during-callback is safe.
    const snapshot = Array.from(reportsChangedCallbacks);
    for (const cb of snapshot) {
      try {
        cb(sourceId);
      } catch (err) {
        // Re-throwing would break other subscribers; logging is the
        // intended behavior per the EventEmitter pattern used elsewhere
        // in this codebase. (Not a silent swallow — surfaced via console.)
        console.error('[lutPipelineLinter] onReportsChanged callback error:', err);
      }
    }
  };

  const invalidateSource = (sourceId: string): void => {
    const prefix = `${sourceId}:`;
    const keysToDelete: string[] = [];
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) keysToDelete.push(key);
    }
    for (const k of keysToDelete) cache.delete(k);
    fireReportsChanged(sourceId);
  };

  const invalidateAll = (): void => {
    cache.clear();
    fireReportsChanged('*');
  };

  const stageChangedHandler = (e: { sourceId: string; stage: 'precache' | 'file' | 'look' }): void => {
    invalidateSource(e.sourceId);
  };
  const displayChangedHandler = (): void => {
    invalidateAll();
  };
  const resetHandler = (): void => {
    invalidateAll();
  };

  pipeline.on('stageChanged', stageChangedHandler);
  pipeline.on('displayChanged', displayChangedHandler);
  pipeline.on('reset', resetHandler);

  return {
    lint(sourceId, inputMetadata) {
      if (disposed) {
        // Defensive: if the controller has been disposed, fall back to
        // the pure path so tests and consumers don't see stale cache.
        return lintLUTPipeline(pipeline, sourceId, inputMetadata);
      }
      const tfKey = inputMetadata?.transferFunction ?? 'none';
      const cpKey = inputMetadata?.colorPrimaries ?? 'none';
      const cacheKey = `${sourceId}:${tfKey}:${cpKey}`;
      const cached = cache.get(cacheKey);
      if (cached) return cached;
      const reports = lintLUTPipeline(pipeline, sourceId, inputMetadata);
      cache.set(cacheKey, reports);
      return reports;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pipeline.off('stageChanged', stageChangedHandler);
      pipeline.off('displayChanged', displayChangedHandler);
      pipeline.off('reset', resetHandler);
      reportsChangedCallbacks.clear();
      cache.clear();
    },
    onReportsChanged(callback) {
      reportsChangedCallbacks.add(callback);
      return () => {
        reportsChangedCallbacks.delete(callback);
      };
    },
  };
}
