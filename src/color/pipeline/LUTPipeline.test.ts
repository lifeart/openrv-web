import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LUTPipeline,
  DEFAULT_PIPELINE_STATE,
  DEFAULT_LUT_STAGE,
  DEFAULT_PRECACHE_STAGE,
  DEFAULT_SOURCE_LUT_CONFIG,
} from './LUTPipeline';
import type { LUT3D } from '../LUTLoader';

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
        })
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
        })
      );
    });

    it('MLUT-U092: emits displayChanged event when display LUT changes', () => {
      const callback = vi.fn();
      pipeline.on('displayChanged', callback);

      pipeline.setDisplayLUT(createWarmLUT3D(), 'display.cube');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'display',
        })
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
        })
      );
    });
  });
});
