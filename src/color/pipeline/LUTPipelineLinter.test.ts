import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LUTPipeline } from './LUTPipeline';
import { lintLUTPipeline, createLUTPipelineLinter } from './LUTPipelineLinter';
import type { LUT3D } from '../LUTLoader';
import type { ImageMetadata } from '../../core/image/Image';

// --- Test fixtures -------------------------------------------------------

function createIdentityLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return {
    type: '3d',
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

const SOURCE_ID = 'test-src';

function makePipeline(): LUTPipeline {
  const p = new LUTPipeline();
  p.registerSource(SOURCE_ID);
  return p;
}

describe('LUTPipelineLinter', () => {
  let pipeline: LUTPipeline;
  beforeEach(() => {
    pipeline = makePipeline();
  });

  // --- Pure lintLUTPipeline ----------------------------------------------

  describe('lintLUTPipeline (pure)', () => {
    it('LINT-001: returns empty array when no declarations', () => {
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'pq' });
      expect(reports).toEqual([]);
    });

    it('LINT-002: declared transfer matches input transfer for exotic (PQ) -> warns', () => {
      // Need a LUT loaded for the stage to "be active" — but the linter
      // doesn't require this; it inspects declarations regardless of
      // whether a LUT is loaded. The heuristic is about declared output.
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'pq' });
      expect(reports).toHaveLength(1);
      const r0 = reports[0]!;
      expect(r0).toMatchObject({
        severity: 'warn',
        code: 'OUTPUT_MATCHES_INPUT_EXOTIC',
        stage: 'file',
        sourceId: SOURCE_ID,
      });
      expect(r0.message).toContain("'pq'");
    });

    it('LINT-002b: HLG declared == HLG input -> warns', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'look', 'hlg');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'hlg' });
      expect(reports).toHaveLength(1);
      const r0 = reports[0]!;
      expect(r0.stage).toBe('look');
      expect(r0.code).toBe('OUTPUT_MATCHES_INPUT_EXOTIC');
    });

    it('LINT-003: declared transfer matches input but is NOT exotic (srgb=srgb) -> no warn', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'srgb');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'srgb' });
      expect(reports).toEqual([]);
    });

    it('LINT-003b: linear=linear -> no warn (heuristic narrow on purpose)', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'linear');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'linear' });
      expect(reports).toEqual([]);
    });

    it('LINT-004: declared transfer differs from input (PQ->sRGB Display LUT) -> no warn', () => {
      pipeline.setDisplayLUTOutputTransferFunction('srgb');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'pq' });
      expect(reports).toEqual([]);
    });

    it('LINT-004b: declared transfer set, input transfer undefined -> no warn (cannot compare)', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, {});
      expect(reports).toEqual([]);
    });

    it('LINT-004c: display stage flagged correctly', () => {
      pipeline.setDisplayLUTOutputTransferFunction('pq');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'pq' });
      expect(reports).toHaveLength(1);
      expect(reports[0]!.stage).toBe('display');
    });
  });

  // --- createLUTPipelineLinter -------------------------------------------

  describe('createLUTPipelineLinter (event-driven)', () => {
    it('LINT-005: cache hits are stable across no-event reads (referential equality)', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      const linter = createLUTPipelineLinter(pipeline);
      const inputMeta: ImageMetadata = { transferFunction: 'pq' };
      const a = linter.lint(SOURCE_ID, inputMeta);
      const b = linter.lint(SOURCE_ID, inputMeta);
      expect(a).toBe(b); // referential equality from cache
      expect(a).toHaveLength(1);
      linter.dispose();
    });

    it('LINT-006: cache invalidates on stageChanged event', () => {
      const linter = createLUTPipelineLinter(pipeline);
      const inputMeta: ImageMetadata = { transferFunction: 'pq' };

      // Initially clean -> empty
      const a = linter.lint(SOURCE_ID, inputMeta);
      expect(a).toEqual([]);

      // Mutating via setter emits stageChanged -> invalidates cache
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      const b = linter.lint(SOURCE_ID, inputMeta);
      expect(b).not.toBe(a);
      expect(b).toHaveLength(1);
      expect(b[0]!.stage).toBe('file');
      linter.dispose();
    });

    it('LINT-007: cache invalidates on displayChanged event', () => {
      const linter = createLUTPipelineLinter(pipeline);
      const inputMeta: ImageMetadata = { transferFunction: 'pq' };

      const a = linter.lint(SOURCE_ID, inputMeta);
      expect(a).toEqual([]);

      // Display setter emits displayChanged -> clears whole cache
      pipeline.setDisplayLUTOutputTransferFunction('pq');
      const b = linter.lint(SOURCE_ID, inputMeta);
      expect(b).not.toBe(a);
      expect(b).toHaveLength(1);
      expect(b[0]!.stage).toBe('display');
      linter.dispose();
    });

    it('LINT-008: cache invalidates on reset event (loadSerializableState path)', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      const linter = createLUTPipelineLinter(pipeline);
      const inputMeta: ImageMetadata = { transferFunction: 'pq' };

      const a = linter.lint(SOURCE_ID, inputMeta);
      expect(a).toHaveLength(1);

      // loadSerializableState(null) clears state and emits 'reset'
      pipeline.loadSerializableState(null);
      // After reset, the source no longer exists; lint on a clean
      // pipeline returns no warnings
      pipeline.registerSource(SOURCE_ID);
      const b = linter.lint(SOURCE_ID, inputMeta);
      expect(b).not.toBe(a);
      expect(b).toEqual([]);
      linter.dispose();
    });

    it('LINT-009: onReportsChanged callback fires after invalidation', () => {
      const linter = createLUTPipelineLinter(pipeline);
      const cb = vi.fn();
      linter.onReportsChanged(cb);

      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(SOURCE_ID);

      // displayChanged fires with '*' (whole-cache invalidation)
      pipeline.setDisplayLUTOutputTransferFunction('srgb');
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenLastCalledWith('*');

      // reset fires with '*'
      pipeline.loadSerializableState(null);
      expect(cb).toHaveBeenCalledTimes(3);
      expect(cb).toHaveBeenLastCalledWith('*');

      linter.dispose();
    });

    it('LINT-009b: onReportsChanged returns unsubscribe function', () => {
      const linter = createLUTPipelineLinter(pipeline);
      const cb = vi.fn();
      const off = linter.onReportsChanged(cb);

      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      expect(cb).toHaveBeenCalledTimes(1);

      off();
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'hlg');
      expect(cb).toHaveBeenCalledTimes(1); // not fired again

      linter.dispose();
    });

    it('LINT-010: dispose() unsubscribes — subsequent events do not fire callbacks', () => {
      const linter = createLUTPipelineLinter(pipeline);
      const cb = vi.fn();
      linter.onReportsChanged(cb);

      linter.dispose();

      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      pipeline.setDisplayLUTOutputTransferFunction('pq');
      pipeline.loadSerializableState(null);

      expect(cb).not.toHaveBeenCalled();
    });

    it('LINT-010b: dispose() also detaches pipeline listeners (listenerCount drops)', () => {
      const before = {
        stageChanged: pipeline.listenerCount('stageChanged'),
        displayChanged: pipeline.listenerCount('displayChanged'),
        reset: pipeline.listenerCount('reset'),
      };
      const linter = createLUTPipelineLinter(pipeline);
      expect(pipeline.listenerCount('stageChanged')).toBe(before.stageChanged + 1);
      expect(pipeline.listenerCount('displayChanged')).toBe(before.displayChanged + 1);
      expect(pipeline.listenerCount('reset')).toBe(before.reset + 1);

      linter.dispose();
      expect(pipeline.listenerCount('stageChanged')).toBe(before.stageChanged);
      expect(pipeline.listenerCount('displayChanged')).toBe(before.displayChanged);
      expect(pipeline.listenerCount('reset')).toBe(before.reset);
    });

    it('LINT-010c: dispose() is idempotent', () => {
      const linter = createLUTPipelineLinter(pipeline);
      linter.dispose();
      expect(() => linter.dispose()).not.toThrow();
    });

    it('LINT-010d: lint() after dispose falls back to pure path (no caching)', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      const linter = createLUTPipelineLinter(pipeline);
      linter.dispose();
      const reports = linter.lint(SOURCE_ID, { transferFunction: 'pq' });
      expect(reports).toHaveLength(1);
      // Two calls after dispose return fresh arrays (cache cleared)
      const reports2 = linter.lint(SOURCE_ID, { transferFunction: 'pq' });
      expect(reports2).not.toBe(reports);
    });
  });

  // --- resetAll path ------------------------------------------------------

  describe('resetAll (per-stage stageChanged path)', () => {
    it('resetAll invalidates cache via per-stage stageChanged emissions', () => {
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      pipeline.setDisplayLUTOutputTransferFunction('pq');

      const linter = createLUTPipelineLinter(pipeline);
      const cb = vi.fn();
      linter.onReportsChanged(cb);

      const a = linter.lint(SOURCE_ID, { transferFunction: 'pq' });
      expect(a.length).toBeGreaterThan(0);

      pipeline.resetAll();
      // resetAll emits 3 stageChanged (per stage per source) + 1 displayChanged
      expect(cb).toHaveBeenCalledTimes(4);

      const b = linter.lint(SOURCE_ID, { transferFunction: 'pq' });
      expect(b).toEqual([]);

      linter.dispose();
    });
  });

  // --- LUT-loaded smoke (heuristic ignores LUT presence) -----------------

  describe('LUT-loaded does not change verdict', () => {
    it('warns regardless of whether a LUT is actually loaded', () => {
      const lut = createIdentityLUT3D();
      pipeline.setFileLUT(SOURCE_ID, lut, 'identity');
      pipeline.setStageOutputTransferFunction(SOURCE_ID, 'file', 'pq');
      const reports = lintLUTPipeline(pipeline, SOURCE_ID, { transferFunction: 'pq' });
      expect(reports).toHaveLength(1);
    });
  });
});
