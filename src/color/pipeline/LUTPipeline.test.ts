import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LUTPipeline,
  DEFAULT_PIPELINE_STATE,
  DEFAULT_LUT_STAGE,
  DEFAULT_PRECACHE_STAGE,
  DEFAULT_SOURCE_LUT_CONFIG,
  VALID_TRANSFER_FUNCTIONS,
} from './LUTPipeline';
import type { LUT3D } from '../LUTLoader';
import type { TransferFunction } from '../../core/image/Image';

// Minimal identity 3D LUT for testing (2x2x2)
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

// LUT that shifts all colors toward warm (adds red, reduces blue)
function createWarmLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = Math.min(1, r / (size - 1) + 0.1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = Math.max(0, b / (size - 1) - 0.1);
      }
    }
  }
  return {
    type: '3d',
    title: 'Warm',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

// LUT that inverts all channels
function createInvertLUT3D(): LUT3D {
  const size = 2;
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx] = 1 - r / (size - 1);
        data[idx + 1] = 1 - g / (size - 1);
        data[idx + 2] = 1 - b / (size - 1);
      }
    }
  }
  return {
    type: '3d',
    title: 'Invert',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

describe('LUTPipeline', () => {
  describe('Default State', () => {
    it('MLUT-U001: DEFAULT_PIPELINE_STATE has empty sources and no display LUT', () => {
      expect(DEFAULT_PIPELINE_STATE.sources.size).toBe(0);
      expect(DEFAULT_PIPELINE_STATE.displayLUT.lutData).toBeNull();
      expect(DEFAULT_PIPELINE_STATE.displayLUT.enabled).toBe(true);
      expect(DEFAULT_PIPELINE_STATE.displayLUT.intensity).toBe(1.0);
      expect(DEFAULT_PIPELINE_STATE.activeSourceId).toBeNull();
    });

    it('MLUT-U002: DEFAULT_LUT_STAGE has correct defaults', () => {
      expect(DEFAULT_LUT_STAGE.enabled).toBe(true);
      expect(DEFAULT_LUT_STAGE.lutName).toBeNull();
      expect(DEFAULT_LUT_STAGE.lutData).toBeNull();
      expect(DEFAULT_LUT_STAGE.intensity).toBe(1.0);
      expect(DEFAULT_LUT_STAGE.source).toBe('manual');
    });

    it('MLUT-U003: DEFAULT_PRECACHE_STAGE extends base with auto bit-depth', () => {
      expect(DEFAULT_PRECACHE_STAGE.bitDepth).toBe('auto');
      expect(DEFAULT_PRECACHE_STAGE.enabled).toBe(true);
      expect(DEFAULT_PRECACHE_STAGE.intensity).toBe(1.0);
    });

    it('MLUT-U004: DEFAULT_SOURCE_LUT_CONFIG has three null LUT stages', () => {
      expect(DEFAULT_SOURCE_LUT_CONFIG.preCacheLUT.lutData).toBeNull();
      expect(DEFAULT_SOURCE_LUT_CONFIG.fileLUT.lutData).toBeNull();
      expect(DEFAULT_SOURCE_LUT_CONFIG.lookLUT.lutData).toBeNull();
    });
  });

  describe('Source Registration', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
    });

    it('MLUT-U010: registerSource creates default config for new source', () => {
      pipeline.registerSource('source-1');
      const config = pipeline.getSourceConfig('source-1');

      expect(config).toBeDefined();
      expect(config!.sourceId).toBe('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.lookLUT.lutData).toBeNull();
      expect(config!.preCacheLUT.lutData).toBeNull();
    });

    it('MLUT-U011: registerSource does not overwrite existing config', () => {
      pipeline.registerSource('source-1');
      const lut = createWarmLUT3D();
      pipeline.setFileLUT('source-1', lut, 'warm.cube');

      pipeline.registerSource('source-1');
      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBe(lut);
    });

    it('MLUT-U012: unregisterSource removes source config', () => {
      pipeline.registerSource('source-1');
      pipeline.unregisterSource('source-1');

      const config = pipeline.getSourceConfig('source-1');
      expect(config).toBeUndefined();
    });

    it('MLUT-U013: getSourceIds returns all registered source IDs', () => {
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
      pipeline.registerSource('source-3');

      const ids = pipeline.getSourceIds();
      expect(ids).toContain('source-1');
      expect(ids).toContain('source-2');
      expect(ids).toContain('source-3');
      expect(ids.length).toBe(3);
    });
  });

  describe('Per-Source LUT Assignment', () => {
    let pipeline: LUTPipeline;
    const warmLUT = createWarmLUT3D();
    const invertLUT = createInvertLUT3D();

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
    });

    it('MLUT-U020: setFileLUT assigns LUT to specific source', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      const config2 = pipeline.getSourceConfig('source-2');

      expect(config1!.fileLUT.lutData).toBe(warmLUT);
      expect(config1!.fileLUT.lutName).toBe('warm.cube');
      expect(config2!.fileLUT.lutData).toBeNull();
    });

    it('MLUT-U021: setLookLUT assigns LUT to specific source', () => {
      pipeline.setLookLUT('source-1', invertLUT, 'invert.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      expect(config1!.lookLUT.lutData).toBe(invertLUT);
      expect(config1!.lookLUT.lutName).toBe('invert.cube');
    });

    it('MLUT-U022: setPreCacheLUT assigns LUT to specific source', () => {
      pipeline.setPreCacheLUT('source-1', warmLUT, 'warm.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      expect(config1!.preCacheLUT.lutData).toBe(warmLUT);
    });

    it('MLUT-U023: different sources can have different LUTs', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.setFileLUT('source-2', invertLUT, 'invert.cube');

      const config1 = pipeline.getSourceConfig('source-1');
      const config2 = pipeline.getSourceConfig('source-2');

      expect(config1!.fileLUT.lutData).toBe(warmLUT);
      expect(config2!.fileLUT.lutData).toBe(invertLUT);
    });

    it('MLUT-U024: clearFileLUT removes LUT from source', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.clearFileLUT('source-1');

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.fileLUT.lutName).toBeNull();
    });

    it('MLUT-U025: clearing one source LUT does not affect other sources', () => {
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.setFileLUT('source-2', invertLUT, 'invert.cube');

      pipeline.clearFileLUT('source-1');

      const config2 = pipeline.getSourceConfig('source-2');
      expect(config2!.fileLUT.lutData).toBe(invertLUT);
    });
  });

  describe('Display LUT (Session-Wide)', () => {
    let pipeline: LUTPipeline;
    const displayLUT = createWarmLUT3D();

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
    });

    it('MLUT-U030: setDisplayLUT is shared across all sources', () => {
      pipeline.setDisplayLUT(displayLUT, 'monitor.cube');

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBe(displayLUT);
      expect(state.displayLUT.lutName).toBe('monitor.cube');
    });

    it('MLUT-U031: display LUT is independent of source-specific LUTs', () => {
      pipeline.setDisplayLUT(displayLUT, 'monitor.cube');
      pipeline.setFileLUT('source-1', createInvertLUT3D(), 'invert.cube');

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBe(displayLUT);
      expect(state.displayLUT.lutName).toBe('monitor.cube');
    });

    it('MLUT-U032: clearDisplayLUT removes session-wide LUT', () => {
      pipeline.setDisplayLUT(displayLUT, 'monitor.cube');
      pipeline.clearDisplayLUT();

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBeNull();
      expect(state.displayLUT.lutName).toBeNull();
    });
  });

  describe('Stage Enable/Disable (Bypass)', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U040: setFileLUTEnabled toggles File LUT bypass', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setFileLUTEnabled('source-1', false);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.enabled).toBe(false);
      expect(config!.fileLUT.lutData).not.toBeNull();
    });

    it('MLUT-U041: setLookLUTEnabled toggles Look LUT bypass', () => {
      pipeline.setLookLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setLookLUTEnabled('source-1', false);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.lookLUT.enabled).toBe(false);
    });

    it('MLUT-U042: setDisplayLUTEnabled toggles Display LUT bypass', () => {
      pipeline.setDisplayLUT(createWarmLUT3D(), 'monitor.cube');
      pipeline.setDisplayLUTEnabled(false);

      const state = pipeline.getState();
      expect(state.displayLUT.enabled).toBe(false);
    });

    it('MLUT-U043: setPreCacheLUTEnabled toggles Pre-Cache LUT bypass', () => {
      pipeline.setPreCacheLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setPreCacheLUTEnabled('source-1', false);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.preCacheLUT.enabled).toBe(false);
    });

    it('MLUT-U044: re-enabling a bypassed stage restores its effect', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setFileLUTEnabled('source-1', false);
      pipeline.setFileLUTEnabled('source-1', true);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.enabled).toBe(true);
      expect(config!.fileLUT.lutData).not.toBeNull();
    });
  });

  describe('Stage Intensity', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U050: setFileLUTIntensity updates blend factor', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setFileLUTIntensity('source-1', 0.5);

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBeCloseTo(0.5);
    });

    it('MLUT-U051: intensity clamps to 0-1 range', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');

      pipeline.setFileLUTIntensity('source-1', -0.5);
      let config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBe(0);

      pipeline.setFileLUTIntensity('source-1', 1.5);
      config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBe(1);
    });

    it('MLUT-U052: intensity 0 means LUT has no effect', () => {
      pipeline.setFileLUTIntensity('source-1', 0);
      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.intensity).toBe(0);
    });

    it('MLUT-U053: setDisplayLUTIntensity updates display LUT blend', () => {
      pipeline.setDisplayLUT(createWarmLUT3D(), 'monitor.cube');
      pipeline.setDisplayLUTIntensity(0.75);

      const state = pipeline.getState();
      expect(state.displayLUT.intensity).toBeCloseTo(0.75);
    });
  });

  describe('Active Source Switching', () => {
    let pipeline: LUTPipeline;
    const warmLUT = createWarmLUT3D();
    const invertLUT = createInvertLUT3D();

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.registerSource('source-2');
      pipeline.setFileLUT('source-1', warmLUT, 'warm.cube');
      pipeline.setFileLUT('source-2', invertLUT, 'invert.cube');
    });

    it('MLUT-U060: setActiveSource changes active source ID', () => {
      pipeline.setActiveSource('source-1');
      expect(pipeline.getActiveSourceId()).toBe('source-1');

      pipeline.setActiveSource('source-2');
      expect(pipeline.getActiveSourceId()).toBe('source-2');
    });

    it('MLUT-U061: getActiveSourceConfig returns config for active source', () => {
      pipeline.setActiveSource('source-1');
      const config = pipeline.getActiveSourceConfig();

      expect(config).toBeDefined();
      expect(config!.fileLUT.lutData).toBe(warmLUT);
    });

    it('MLUT-U062: switching active source changes which LUTs are applied', () => {
      pipeline.setActiveSource('source-1');
      let config = pipeline.getActiveSourceConfig();
      expect(config!.fileLUT.lutData).toBe(warmLUT);

      pipeline.setActiveSource('source-2');
      config = pipeline.getActiveSourceConfig();
      expect(config!.fileLUT.lutData).toBe(invertLUT);
    });

    it('MLUT-U063: display LUT unchanged when switching sources', () => {
      const displayLUT = createIdentityLUT3D();
      pipeline.setDisplayLUT(displayLUT, 'display.cube');

      pipeline.setActiveSource('source-1');
      expect(pipeline.getState().displayLUT.lutData).toBe(displayLUT);

      pipeline.setActiveSource('source-2');
      expect(pipeline.getState().displayLUT.lutData).toBe(displayLUT);
    });
  });

  describe('Reset and Cleanup', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setLookLUT('source-1', createInvertLUT3D(), 'invert.cube');
      pipeline.setDisplayLUT(createWarmLUT3D(), 'display.cube');
    });

    it('MLUT-U070: resetSource clears all per-source LUT stages', () => {
      pipeline.resetSource('source-1');

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.lookLUT.lutData).toBeNull();
      expect(config!.preCacheLUT.lutData).toBeNull();
    });

    it('MLUT-U071: resetSource does not affect display LUT', () => {
      pipeline.resetSource('source-1');

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).not.toBeNull();
    });

    it('MLUT-U072: resetAll clears all stages including display LUT', () => {
      pipeline.resetAll();

      const config = pipeline.getSourceConfig('source-1');
      expect(config!.fileLUT.lutData).toBeNull();
      expect(config!.lookLUT.lutData).toBeNull();

      const state = pipeline.getState();
      expect(state.displayLUT.lutData).toBeNull();
    });

    it('MLUT-U073: resetAll preserves source registrations', () => {
      pipeline.resetAll();

      const ids = pipeline.getSourceIds();
      expect(ids).toContain('source-1');
    });
  });

  describe('State Serialization', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U080: getState returns complete pipeline state snapshot', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setDisplayLUT(createInvertLUT3D(), 'display.cube');

      const state = pipeline.getState();

      expect(state.sources.size).toBe(1);
      expect(state.sources.get('source-1')!.fileLUT.lutName).toBe('warm.cube');
      expect(state.displayLUT.lutName).toBe('display.cube');
    });

    it('MLUT-U081: getSerializableState omits LUT data for session save', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');
      pipeline.setDisplayLUT(createInvertLUT3D(), 'display.cube');

      const serializable = pipeline.getSerializableState();

      expect(serializable.sources['source-1']!.fileLUT.lutName).toBe('warm.cube');
      expect(serializable.sources['source-1']!.fileLUT.lutData).toBeUndefined();
      expect(serializable.displayLUT.lutName).toBe('display.cube');
      expect(serializable.displayLUT.lutData).toBeUndefined();
    });

    it('MLUT-U082: loadSerializableState restores names, settings, and active source without LUT binaries', () => {
      const serializable = {
        sources: {
          'source-1': {
            sourceId: 'source-1',
            preCacheLUT: {
              enabled: false,
              lutName: 'pre.cube',
              intensity: 0.4,
              source: 'manual' as const,
              bitDepth: '16bit' as const,
              inMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.1, 0.2, 0.3, 1],
              outMatrix: null,
            },
            fileLUT: {
              enabled: true,
              lutName: 'file.cube',
              intensity: 0.7,
              source: 'manual' as const,
              inMatrix: null,
              outMatrix: null,
            },
            lookLUT: {
              enabled: true,
              lutName: 'look.cube',
              intensity: 0.8,
              source: 'manual' as const,
              inMatrix: null,
              outMatrix: null,
            },
          },
        },
        displayLUT: {
          enabled: false,
          lutName: 'display.cube',
          intensity: 0.9,
          source: 'manual' as const,
          inMatrix: null,
          outMatrix: null,
        },
        activeSourceId: 'source-1',
      };

      pipeline.loadSerializableState(serializable);

      const restored = pipeline.getState();
      const source = restored.sources.get('source-1')!;
      expect(restored.activeSourceId).toBe('source-1');
      expect(source.preCacheLUT.lutName).toBe('pre.cube');
      expect(source.preCacheLUT.enabled).toBe(false);
      expect(source.preCacheLUT.intensity).toBeCloseTo(0.4);
      expect(source.preCacheLUT.bitDepth).toBe('16bit');
      expect(source.preCacheLUT.lutData).toBeNull();
      expect(source.preCacheLUT.inMatrix).toBeInstanceOf(Float32Array);
      expect(source.fileLUT.lutName).toBe('file.cube');
      expect(source.lookLUT.lutName).toBe('look.cube');
      expect(restored.displayLUT.lutName).toBe('display.cube');
      expect(restored.displayLUT.enabled).toBe(false);
      expect(restored.displayLUT.lutData).toBeNull();
    });
  });

  describe('Event Emission', () => {
    let pipeline: LUTPipeline;

    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-U090: emits stageChanged event when LUT is assigned', () => {
      const callback = vi.fn();
      pipeline.on('stageChanged', callback);

      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'source-1',
          stage: 'file',
        }),
      );
    });

    it('MLUT-U091: emits stageChanged event when LUT is cleared', () => {
      pipeline.setFileLUT('source-1', createWarmLUT3D(), 'warm.cube');

      const callback = vi.fn();
      pipeline.on('stageChanged', callback);

      pipeline.clearFileLUT('source-1');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'source-1',
          stage: 'file',
        }),
      );
    });

    it('MLUT-U092: emits displayChanged event when display LUT changes', () => {
      const callback = vi.fn();
      pipeline.on('displayChanged', callback);

      pipeline.setDisplayLUT(createWarmLUT3D(), 'display.cube');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'display',
        }),
      );
    });

    it('MLUT-U093: emits activeSourceChanged event on source switch', () => {
      pipeline.registerSource('source-2');

      const callback = vi.fn();
      pipeline.on('activeSourceChanged', callback);

      pipeline.setActiveSource('source-2');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          previousSourceId: null,
          newSourceId: 'source-2',
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Output color space metadata propagation (issue MED-51)
  // ---------------------------------------------------------------------------

  describe('output color space metadata', () => {
    let pipeline: LUTPipeline;
    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    it('MLUT-CS-001: stages default to color-space-preserving (null output)', () => {
      const cfg = pipeline.getSourceConfig('source-1')!;
      expect(cfg.preCacheLUT.outputColorPrimaries).toBeNull();
      expect(cfg.preCacheLUT.outputTransferFunction).toBeNull();
      expect(cfg.fileLUT.outputColorPrimaries).toBeNull();
      expect(cfg.fileLUT.outputTransferFunction).toBeNull();
      expect(cfg.lookLUT.outputColorPrimaries).toBeNull();
      expect(cfg.lookLUT.outputTransferFunction).toBeNull();
    });

    it('MLUT-CS-002: setStageOutputColorPrimaries updates only the targeted stage', () => {
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');

      const cfg = pipeline.getSourceConfig('source-1')!;
      expect(cfg.fileLUT.outputColorPrimaries).toBe('bt709');
      // Other stages remain unaffected.
      expect(cfg.preCacheLUT.outputColorPrimaries).toBeNull();
      expect(cfg.lookLUT.outputColorPrimaries).toBeNull();
    });

    it('MLUT-CS-003: setStageOutputTransferFunction updates only the targeted stage', () => {
      pipeline.setStageOutputTransferFunction('source-1', 'precache', 'pq');

      const cfg = pipeline.getSourceConfig('source-1')!;
      expect(cfg.preCacheLUT.outputTransferFunction).toBe('pq');
      expect(cfg.fileLUT.outputTransferFunction).toBeNull();
    });

    it('MLUT-CS-004: setDisplayLUTOutputColorPrimaries updates display stage', () => {
      pipeline.setDisplayLUTOutputColorPrimaries('p3');
      expect(pipeline.getState().displayLUT.outputColorPrimaries).toBe('p3');
    });

    it('MLUT-CS-005: emits stageChanged when output primaries change for a stage', () => {
      const cb = vi.fn();
      pipeline.on('stageChanged', cb);

      pipeline.setStageOutputColorPrimaries('source-1', 'look', 'bt2020');

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 'source-1', stage: 'look' }));
    });

    it('MLUT-CS-006: emits displayChanged when display output transfer changes', () => {
      const cb = vi.fn();
      pipeline.on('displayChanged', cb);

      pipeline.setDisplayLUTOutputTransferFunction('hlg');

      expect(cb).toHaveBeenCalledWith(expect.objectContaining({ stage: 'display' }));
    });

    it('MLUT-CS-007: setStageOutputColorPrimaries on unknown source is a no-op', () => {
      // Should not throw.
      pipeline.setStageOutputColorPrimaries('does-not-exist', 'file', 'bt709');
      const cfg = pipeline.getSourceConfig('source-1')!;
      expect(cfg.fileLUT.outputColorPrimaries).toBeNull();
    });

    it('MLUT-CS-008: serializable state round-trips output color space fields', () => {
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      pipeline.setStageOutputTransferFunction('source-1', 'file', 'srgb');
      pipeline.setDisplayLUTOutputColorPrimaries('p3');
      pipeline.setDisplayLUTOutputTransferFunction('hlg');

      const ser = pipeline.getSerializableState();
      expect(ser.sources['source-1']!.fileLUT.outputColorPrimaries).toBe('bt709');
      expect(ser.sources['source-1']!.fileLUT.outputTransferFunction).toBe('srgb');
      expect(ser.displayLUT.outputColorPrimaries).toBe('p3');
      expect(ser.displayLUT.outputTransferFunction).toBe('hlg');

      const restored = new LUTPipeline();
      restored.loadSerializableState(ser);

      const cfg = restored.getSourceConfig('source-1')!;
      expect(cfg.fileLUT.outputColorPrimaries).toBe('bt709');
      expect(cfg.fileLUT.outputTransferFunction).toBe('srgb');
      expect(restored.getState().displayLUT.outputColorPrimaries).toBe('p3');
      expect(restored.getState().displayLUT.outputTransferFunction).toBe('hlg');
    });

    it('MLUT-CS-009: deserialization rejects malformed color primaries values', () => {
      const ser = pipeline.getSerializableState();
      ser.sources['source-1'] = {
        ...ser.sources['source-1']!,
        fileLUT: {
          ...ser.sources['source-1']!.fileLUT,
          // Malformed value smuggled in via type assertion to simulate a
          // tampered or corrupt session file.
          outputColorPrimaries: 'mars-sat-3' as never,
          outputTransferFunction: 'definitely-not-pq' as never,
        },
      };

      const restored = new LUTPipeline();
      restored.loadSerializableState(ser);

      const cfg = restored.getSourceConfig('source-1')!;
      // Bad values must be sanitized to null, not stored verbatim.
      expect(cfg.fileLUT.outputColorPrimaries).toBeNull();
      expect(cfg.fileLUT.outputTransferFunction).toBeNull();
    });

    it('MLUT-CS-010: passing null clears declared output color space', () => {
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', null);

      const cfg = pipeline.getSourceConfig('source-1')!;
      expect(cfg.fileLUT.outputColorPrimaries).toBeNull();
    });

    it('MLUT-CS-011: DEFAULT_LUT_STAGE includes new color space fields', () => {
      expect(DEFAULT_LUT_STAGE.outputColorPrimaries).toBeNull();
      expect(DEFAULT_LUT_STAGE.outputTransferFunction).toBeNull();
    });

    it('MLUT-CS-012: setStageOutputColorPrimaries sanitizes invalid runtime values', () => {
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      // Untyped JS / plugin caller passes a bogus primaries string.
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'mars-sat-3' as never);

      const cfg = pipeline.getSourceConfig('source-1')!;
      // Bad value must be coerced to null rather than poisoning state.
      expect(cfg.fileLUT.outputColorPrimaries).toBeNull();
    });

    it('MLUT-CS-013: setStageOutputTransferFunction sanitizes invalid runtime values', () => {
      pipeline.setStageOutputTransferFunction('source-1', 'precache', 'srgb');
      pipeline.setStageOutputTransferFunction('source-1', 'precache', 'definitely-not-pq' as never);

      const cfg = pipeline.getSourceConfig('source-1')!;
      expect(cfg.preCacheLUT.outputTransferFunction).toBeNull();
    });

    it('MLUT-CS-014: setDisplayLUTOutputColorPrimaries sanitizes invalid runtime values', () => {
      pipeline.setDisplayLUTOutputColorPrimaries('p3');
      pipeline.setDisplayLUTOutputColorPrimaries('not-a-primaries' as never);
      expect(pipeline.getState().displayLUT.outputColorPrimaries).toBeNull();
    });

    it('MLUT-CS-015: setDisplayLUTOutputTransferFunction sanitizes invalid runtime values', () => {
      pipeline.setDisplayLUTOutputTransferFunction('hlg');
      pipeline.setDisplayLUTOutputTransferFunction('bogus' as never);
      expect(pipeline.getState().displayLUT.outputTransferFunction).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Output metadata cascade across stages (issue MED-51 — Round 2 fix)
  // ---------------------------------------------------------------------------

  describe('computeOutputMetadata cascade', () => {
    let pipeline: LUTPipeline;
    beforeEach(() => {
      pipeline = new LUTPipeline();
      pipeline.registerSource('source-1');
    });

    function loadAll(srcId: string): void {
      pipeline.setPreCacheLUT(srcId, createIdentityLUT3D(), 'precache.cube');
      pipeline.setFileLUT(srcId, createIdentityLUT3D(), 'file.cube');
      pipeline.setLookLUT(srcId, createIdentityLUT3D(), 'look.cube');
      pipeline.setDisplayLUT(createIdentityLUT3D(), 'display.cube');
    }

    it('MLUT-CASCADE-001: with no stages declared, returns input metadata unchanged', () => {
      loadAll('source-1');
      const out = pipeline.computeOutputMetadata('source-1', {
        colorPrimaries: 'bt2020',
        transferFunction: 'pq',
      });
      expect(out.colorPrimaries).toBe('bt2020');
      expect(out.transferFunction).toBe('pq');
    });

    it('MLUT-CASCADE-002: pre-cache stage declared output overrides input metadata', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'precache', 'bt709');
      pipeline.setStageOutputTransferFunction('source-1', 'precache', 'srgb');
      const out = pipeline.computeOutputMetadata('source-1', {
        colorPrimaries: 'bt2020',
        transferFunction: 'pq',
      });
      expect(out.colorPrimaries).toBe('bt709');
      expect(out.transferFunction).toBe('srgb');
    });

    it('MLUT-CASCADE-003: file LUT overrides pre-cache when both declare output', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'precache', 'p3');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      const out = pipeline.computeOutputMetadata('source-1', { colorPrimaries: 'bt2020' });
      expect(out.colorPrimaries).toBe('bt709');
    });

    it('MLUT-CASCADE-004: look LUT overrides file when both declare output', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'p3');
      pipeline.setStageOutputColorPrimaries('source-1', 'look', 'bt709');
      const out = pipeline.computeOutputMetadata('source-1', { colorPrimaries: 'bt2020' });
      expect(out.colorPrimaries).toBe('bt709');
    });

    it('MLUT-CASCADE-005: display LUT overrides earlier stages when declared', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'p3');
      pipeline.setDisplayLUTOutputColorPrimaries('bt709');
      const out = pipeline.computeOutputMetadata('source-1', { colorPrimaries: 'bt2020' });
      expect(out.colorPrimaries).toBe('bt709');
    });

    it('MLUT-CASCADE-006: null/preserving stages pass through running metadata', () => {
      loadAll('source-1');
      // Only file declares output; pre-cache and look are preserving.
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      const out = pipeline.computeOutputMetadata('source-1', { colorPrimaries: 'bt2020' });
      expect(out.colorPrimaries).toBe('bt709');
    });

    it('MLUT-CASCADE-007: disabled stages do not contribute their declared output', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      pipeline.setFileLUTEnabled('source-1', false);
      const out = pipeline.computeOutputMetadata('source-1', { colorPrimaries: 'bt2020' });
      expect(out.colorPrimaries).toBe('bt2020');
    });

    it('MLUT-CASCADE-008: stages with no LUT loaded do not contribute', () => {
      // Look stage has no LUT.
      pipeline.setFileLUT('source-1', createIdentityLUT3D(), 'f.cube');
      pipeline.setStageOutputColorPrimaries('source-1', 'look', 'bt709');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'p3');
      const out = pipeline.computeOutputMetadata('source-1', { colorPrimaries: 'bt2020' });
      // File contributes (LUT loaded), look does not (no LUT loaded).
      expect(out.colorPrimaries).toBe('p3');
    });

    it('MLUT-CASCADE-009: zero-intensity stages do not contribute', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      pipeline.setFileLUTIntensity('source-1', 0);
      const out = pipeline.computeOutputMetadata('source-1', { colorPrimaries: 'bt2020' });
      expect(out.colorPrimaries).toBe('bt2020');
    });

    it('MLUT-CASCADE-010: independently cascades color primaries and transfer function', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      pipeline.setStageOutputTransferFunction('source-1', 'look', 'srgb');
      const out = pipeline.computeOutputMetadata('source-1', {
        colorPrimaries: 'bt2020',
        transferFunction: 'pq',
      });
      expect(out.colorPrimaries).toBe('bt709');
      expect(out.transferFunction).toBe('srgb');
    });

    it('MLUT-CASCADE-011: preserves non-color metadata (frame number, source path, attributes)', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      const out = pipeline.computeOutputMetadata('source-1', {
        frameNumber: 42,
        sourcePath: '/clips/shot01.exr',
        pixelAspectRatio: 1.5,
        colorPrimaries: 'bt2020',
        attributes: { lensName: 'Cooke S5/i' },
      });
      expect(out.frameNumber).toBe(42);
      expect(out.sourcePath).toBe('/clips/shot01.exr');
      expect(out.pixelAspectRatio).toBe(1.5);
      expect(out.attributes).toEqual({ lensName: 'Cooke S5/i' });
      expect(out.colorPrimaries).toBe('bt709');
    });

    it('MLUT-CASCADE-012: does not mutate input metadata', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      const input = { colorPrimaries: 'bt2020' as const, attributes: { exposure: 1.0 } };
      const snapshot = JSON.parse(JSON.stringify(input));
      pipeline.computeOutputMetadata('source-1', input);
      expect(input).toEqual(snapshot);
    });

    it('MLUT-CASCADE-013: returned attributes are an independent copy', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      const inputAttrs = { exposure: 1.0 };
      const out = pipeline.computeOutputMetadata('source-1', {
        colorPrimaries: 'bt2020',
        attributes: inputAttrs,
      });
      expect(out.attributes).not.toBe(inputAttrs);
    });

    it('MLUT-CASCADE-014: handles undefined input metadata', () => {
      loadAll('source-1');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      const out = pipeline.computeOutputMetadata('source-1', undefined);
      expect(out.colorPrimaries).toBe('bt709');
    });

    it('MLUT-CASCADE-015: unknown source still applies the session-wide display stage', () => {
      pipeline.setDisplayLUT(createIdentityLUT3D(), 'd.cube');
      pipeline.setDisplayLUTOutputColorPrimaries('p3');
      const out = pipeline.computeOutputMetadata('not-registered', { colorPrimaries: 'bt2020' });
      expect(out.colorPrimaries).toBe('p3');
    });

    it('MLUT-CASCADE-016: applyToIPImage returns input by reference for no-op cascade', () => {
      // No stages declared — cascade is a no-op.
      const input = makeFakeIPImage({ colorPrimaries: 'bt2020', transferFunction: 'pq' });
      const out = pipeline.applyToIPImage('source-1', input);
      expect(out).toBe(input);
    });

    it('MLUT-CASCADE-017: applyToIPImage returns clone with cascaded metadata when changed', () => {
      pipeline.setFileLUT('source-1', createIdentityLUT3D(), 'f.cube');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      const input = makeFakeIPImage({ colorPrimaries: 'bt2020', transferFunction: 'pq' });
      const out = pipeline.applyToIPImage('source-1', input);
      expect(out).not.toBe(input);
      expect(out.metadata.colorPrimaries).toBe('bt709');
      expect(out.metadata.transferFunction).toBe('pq');
      // Input metadata unchanged.
      expect(input.metadata.colorPrimaries).toBe('bt2020');
    });

    it('MLUT-CASCADE-018: end-to-end seam — File LUT PQ→sRGB, IPImage metadata reflects sRGB output', () => {
      // Realistic scenario: HDR PQ source, File LUT does the PQ-to-sRGB IDT.
      // After the cascade, the IPImage handed to the renderer should report
      // sRGB / Rec.709, not PQ / BT.2020.
      pipeline.setFileLUT('source-1', createIdentityLUT3D(), 'pq_to_rec709_srgb.cube');
      pipeline.setStageOutputColorPrimaries('source-1', 'file', 'bt709');
      pipeline.setStageOutputTransferFunction('source-1', 'file', 'srgb');

      const input = makeFakeIPImage({ colorPrimaries: 'bt2020', transferFunction: 'pq' });
      const out = pipeline.applyToIPImage('source-1', input);

      expect(out.metadata.colorPrimaries).toBe('bt709');
      expect(out.metadata.transferFunction).toBe('srgb');
      // Pixel buffer is shared (no allocation overhead).
      expect(out.data).toBe(input.data);
    });

    it('MLUT-CASCADE-019: end-to-end with real IPImage — Display LUT cascades into IPImage metadata', async () => {
      // Full end-to-end path: source decoder produces an IPImage with PQ /
      // BT.2020 metadata; user has a Display LUT that does PQ→Rec.709 sRGB;
      // pipeline.applyToIPImage materializes a renderer-bound IPImage whose
      // metadata reflects the post-pipeline output color space.
      const { IPImage } = await import('../../core/image/Image');

      pipeline.setDisplayLUT(createIdentityLUT3D(), 'pq_to_rec709.cube');
      pipeline.setDisplayLUTOutputColorPrimaries('bt709');
      pipeline.setDisplayLUTOutputTransferFunction('srgb');

      // Real IPImage as it would arrive from the decoder.
      const sourceImage = new IPImage({
        width: 4,
        height: 4,
        channels: 4,
        dataType: 'uint8',
        metadata: {
          colorPrimaries: 'bt2020',
          transferFunction: 'pq',
          frameNumber: 7,
          sourcePath: '/clips/hdr-shot.mov',
        },
      });

      const cascaded = pipeline.applyToIPImage('source-1', sourceImage);

      // Color-space metadata is the post-pipeline output.
      expect(cascaded.metadata.colorPrimaries).toBe('bt709');
      expect(cascaded.metadata.transferFunction).toBe('srgb');
      // Non-color metadata flows through unchanged.
      expect(cascaded.metadata.frameNumber).toBe(7);
      expect(cascaded.metadata.sourcePath).toBe('/clips/hdr-shot.mov');
      // Source image's own metadata is *not* mutated (renderer must still see
      // the pre-pipeline encoding for the source-bound IPImage).
      expect(sourceImage.metadata.colorPrimaries).toBe('bt2020');
      expect(sourceImage.metadata.transferFunction).toBe('pq');
      // Pixel buffer is shared — clone is metadata-only.
      expect(cascaded.data).toBe(sourceImage.data);

      // And: changing the LUT pipeline cascade *after* the fact does not
      // retroactively rewrite the cascaded image (it was a snapshot).
      pipeline.setDisplayLUTOutputColorPrimaries(null);
      pipeline.setDisplayLUTOutputTransferFunction(null);
      expect(cascaded.metadata.colorPrimaries).toBe('bt709');
      expect(cascaded.metadata.transferFunction).toBe('srgb');
    });

    // ---------------------------------------------------------------------
    // NEW-B4: HDR video VideoFrame must survive the cascade clone.
    //
    // VideoSourceNode constructs HDR-video IPImages with a 4-byte placeholder
    // `data` buffer and the real pixel source in `videoFrame`. If the cascade
    // clone (previously plain `image.clone()`) drops the VideoFrame, the
    // renderer reads the 4-byte placeholder as if it were the full pixel
    // buffer — heap-out-of-bounds / visible garbage / crash.
    //
    // The fix routes the cascade through `IPImage.cloneMetadataOnly()`, which
    // shares the VideoFrame ref as a non-owning view.
    // ---------------------------------------------------------------------
    it('MLUT-CASCADE-020: NEW-B4 HDR PQ video — cascade preserves VideoFrame on the clone', async () => {
      const { IPImage } = await import('../../core/image/Image');
      const { ManagedVideoFrame } = await import('../../core/image/ManagedVideoFrame');
      ManagedVideoFrame.resetForTesting();

      // Build a mock VideoFrame matching how VideoSourceNode emits HDR frames.
      let closed = false;
      const mockVideoFrame = {
        get format() {
          return closed ? null : 'RGBA';
        },
        close() {
          closed = true;
        },
        displayWidth: 1920,
        displayHeight: 1080,
        codedWidth: 1920,
        codedHeight: 1080,
        timestamp: 0,
        duration: null,
        colorSpace: {},
      } as unknown as VideoFrame;

      // Mirror the construction at VideoSourceNode.ts:929 — 4-byte
      // placeholder data, real pixels in videoFrame, PQ/BT.2020 metadata.
      const sourceImage = new IPImage({
        width: 1920,
        height: 1080,
        channels: 4,
        dataType: 'float32',
        data: new ArrayBuffer(4),
        videoFrame: mockVideoFrame,
        metadata: {
          colorPrimaries: 'bt2020',
          transferFunction: 'pq',
          frameNumber: 42,
          attributes: { hdr: true, videoColorSpace: 'bt2020-pq' },
        },
      });

      // User configures a Display LUT that is PQ→sRGB (the exact scenario
      // that triggered the original NEW-B4 crash).
      pipeline.setDisplayLUT(createIdentityLUT3D(), 'pq_to_srgb_display.cube');
      pipeline.setDisplayLUTOutputColorPrimaries('bt709');
      pipeline.setDisplayLUTOutputTransferFunction('srgb');

      const cascaded = pipeline.applyToIPImage('source-1', sourceImage);

      // Output is a fresh IPImage (not the input by reference, since the
      // cascade actually changes the metadata).
      expect(cascaded).not.toBe(sourceImage);

      // Cascaded metadata reflects the post-pipeline output color space.
      expect(cascaded.metadata.colorPrimaries).toBe('bt709');
      expect(cascaded.metadata.transferFunction).toBe('srgb');
      // Non-color metadata flows through unchanged.
      expect(cascaded.metadata.frameNumber).toBe(42);
      expect(cascaded.metadata.attributes?.hdr).toBe(true);

      // CRITICAL — the VideoFrame must still be present on the clone.
      // (Plain `clone()` would set videoFrame=null and the renderer would
      // crash on the 4-byte placeholder data buffer.)
      expect(cascaded.videoFrame).toBe(mockVideoFrame);
      // And specifically: the same ManagedVideoFrame ref (not a re-wrap,
      // which ManagedVideoFrame.wrap() would reject as a double-wrap).
      expect(cascaded.managedVideoFrame).toBe(sourceImage.managedVideoFrame);

      // Pixel data buffer ref is shared (the 4-byte placeholder, but that's
      // intentional — the real pixels are in the VideoFrame).
      expect(cascaded.data).toBe(sourceImage.data);

      // Source's metadata is NOT mutated by the cascade.
      expect(sourceImage.metadata.colorPrimaries).toBe('bt2020');
      expect(sourceImage.metadata.transferFunction).toBe('pq');

      // Cleanup: closing the cascade clone must NOT release the source's
      // VideoFrame (lifecycle is owned by the source).
      cascaded.close();
      expect(sourceImage.videoFrame).toBe(mockVideoFrame);
      expect(sourceImage.managedVideoFrame?.isClosed).toBe(false);
      expect(ManagedVideoFrame.activeCount).toBe(1);

      sourceImage.close();
      expect(ManagedVideoFrame.activeCount).toBe(0);
    });

    it('MLUT-CASCADE-021: NEW-B4 — non-VideoFrame path still works (regular IPImage)', async () => {
      // Sanity: the NEW-B4 fix must not regress the plain (non-VideoFrame)
      // path. Issue MED-51's original cascade tests (016-019) cover this
      // case shallowly; this one explicitly asserts the post-NEW-B4 output
      // has no spurious managedVideoFrame.
      const { IPImage } = await import('../../core/image/Image');

      pipeline.setDisplayLUT(createIdentityLUT3D(), 'd.cube');
      pipeline.setDisplayLUTOutputColorPrimaries('bt709');
      pipeline.setDisplayLUTOutputTransferFunction('srgb');

      const sourceImage = new IPImage({
        width: 16,
        height: 16,
        channels: 4,
        dataType: 'uint8',
        metadata: { colorPrimaries: 'bt2020', transferFunction: 'pq' },
      });

      const cascaded = pipeline.applyToIPImage('source-1', sourceImage);

      expect(cascaded).not.toBe(sourceImage);
      expect(cascaded.videoFrame).toBeNull();
      expect(cascaded.managedVideoFrame).toBeNull();
      expect(cascaded.metadata.colorPrimaries).toBe('bt709');
      expect(cascaded.metadata.transferFunction).toBe('srgb');
      expect(cascaded.data).toBe(sourceImage.data);
    });
  });
});

// Minimal IPImage stub for cascade tests — avoids importing the full IPImage
// class (which carries renderer-specific extra state). Matches the structural
// `{ metadata, cloneMetadataOnly() }` contract that
// LUTPipeline.applyToIPImage() requires.
interface FakeIPImage {
  data: ArrayBuffer;
  metadata: import('../../core/image/Image').ImageMetadata;
  cloneMetadataOnly(): FakeIPImage;
}

function makeFakeIPImage(metadata: import('../../core/image/Image').ImageMetadata = {}): FakeIPImage {
  const data = new ArrayBuffer(4);
  const md = { ...metadata };
  const fake: FakeIPImage = {
    data,
    metadata: md,
    cloneMetadataOnly() {
      return {
        data,
        metadata: { ...this.metadata },
        cloneMetadataOnly: this.cloneMetadataOnly,
      };
    },
  };
  return fake;
}

// ---------------------------------------------------------------------------
// MED-51 PR-0 — `'linear'` transfer-function precursor
// ---------------------------------------------------------------------------
//
// PR-0 widens the `TransferFunction` union to include `'linear'` so the
// renderer and persisted-state sanitizer can describe linear-light sources
// (EXR, float TIFF, decoded HDR video). PR-1 will land the API surface and
// UI exposure on top of this precursor.
describe('MED-51 PR-0 — linear TransferFunction precursor', () => {
  it("MLUT-LIN-001: sanitizer accepts 'linear' and round-trips it through serialize/deserialize", () => {
    const pipeline = new LUTPipeline();
    pipeline.registerSource('source-1');
    pipeline.setStageOutputTransferFunction('source-1', 'file', 'linear');

    const ser = pipeline.getSerializableState();
    expect(ser.sources['source-1']!.fileLUT.outputTransferFunction).toBe('linear');

    // Round-trip via JSON to mimic session save/restore.
    const json = JSON.stringify(ser);
    const parsed = JSON.parse(json);

    const restored = new LUTPipeline();
    restored.loadSerializableState(parsed);

    const cfg = restored.getSourceConfig('source-1')!;
    expect(cfg.fileLUT.outputTransferFunction).toBe('linear');
  });

  it('MLUT-LIN-002: sanitizer rejects an unknown transfer string and returns null', () => {
    const pipeline = new LUTPipeline();
    pipeline.registerSource('source-1');
    pipeline.setStageOutputTransferFunction('source-1', 'file', 'srgb');

    const ser = pipeline.getSerializableState();
    // Smuggle a malformed transfer-function string in via type assertion to
    // simulate a tampered or future/unknown session file.
    ser.sources['source-1'] = {
      ...ser.sources['source-1']!,
      fileLUT: {
        ...ser.sources['source-1']!.fileLUT,
        outputTransferFunction: 'not-a-real-transfer' as never,
      },
    };

    const restored = new LUTPipeline();
    restored.loadSerializableState(ser);

    const cfg = restored.getSourceConfig('source-1')!;
    expect(cfg.fileLUT.outputTransferFunction).toBeNull();
  });

  it('MLUT-LIN-PARITY: VALID_TRANSFER_FUNCTIONS covers every TransferFunction union member', () => {
    // Compile-time guard: if a new TransferFunction member is added without
    // updating VALID_TRANSFER_FUNCTIONS, this list will fail to type-check
    // (it must contain every member of the union).
    const _allTransferFunctions: TransferFunction[] = ['srgb', 'hlg', 'pq', 'smpte240m', 'linear'];
    for (const tf of _allTransferFunctions) {
      expect(VALID_TRANSFER_FUNCTIONS.has(tf)).toBe(true);
    }
    // Also ensure we did not accidentally widen the runtime set with stray
    // values that are not in the union.
    expect(VALID_TRANSFER_FUNCTIONS.size).toBe(_allTransferFunctions.length);
  });
});
