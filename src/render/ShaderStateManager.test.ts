/**
 * ShaderStateManager Tests
 *
 * Tests for dirty-flag management, setLUT intensity on disable path,
 * background pattern comparison guard in applyRenderState, and
 * hasPendingStateChanges.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShaderStateManager,
  DIRTY_LUT3D,
  DIRTY_BACKGROUND,
  DIRTY_DISPLAY,
  DIRTY_GAMUT_MAPPING,
  DIRTY_LINEARIZE,
  DIRTY_INLINE_LUT,
  DIRTY_CDL,
  ALL_DIRTY_FLAGS,
} from './ShaderStateManager';
import type { RenderState } from './RenderState';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';
import { DEFAULT_CDL } from '../color/CDL';
import { DEFAULT_COLOR_WHEELS_STATE } from '../ui/components/ColorWheels';
import { DEFAULT_ZEBRA_STATE } from '../ui/components/ZebraStripes';
import { DEFAULT_BACKGROUND_PATTERN_STATE } from '../ui/components/BackgroundPatternControl';
import { DEFAULT_HSL_QUALIFIER_STATE } from '../ui/components/HSLQualifier';

function createDefaultRenderState(): RenderState {
  return {
    colorAdjustments: { ...DEFAULT_COLOR_ADJUSTMENTS },
    colorInversion: false,
    toneMappingState: { ...DEFAULT_TONE_MAPPING_STATE },
    backgroundPattern: { ...DEFAULT_BACKGROUND_PATTERN_STATE },
    cdl: JSON.parse(JSON.stringify(DEFAULT_CDL)),
    curvesLUT: null,
    colorWheels: JSON.parse(JSON.stringify(DEFAULT_COLOR_WHEELS_STATE)),
    falseColor: { enabled: false, lut: null },
    zebraStripes: { ...DEFAULT_ZEBRA_STATE },
    channelMode: 'rgb',
    lut: { data: null, size: 0, intensity: 0 },
    displayColor: { transferFunction: 0, displayGamma: 0, displayBrightness: 1, customGamma: 2.2 },
    highlightsShadows: { highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    vibrance: { amount: 0, skinProtection: true },
    clarity: 0,
    sharpen: 0,
    hslQualifier: JSON.parse(JSON.stringify(DEFAULT_HSL_QUALIFIER_STATE)),
  };
}

describe('ShaderStateManager', () => {
  let mgr: ShaderStateManager;

  beforeEach(() => {
    mgr = new ShaderStateManager();
  });

  // =================================================================
  // hasPendingStateChanges
  // =================================================================

  describe('hasPendingStateChanges', () => {
    it('SSM-001: returns true after construction (all flags dirty)', () => {
      expect(mgr.hasPendingStateChanges()).toBe(true);
      expect(mgr.getDirtyFlags().size).toBe(ALL_DIRTY_FLAGS.length);
    });

    it('SSM-002: returns false after all dirty flags are cleared', () => {
      // Clear all flags manually
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();
      expect(mgr.hasPendingStateChanges()).toBe(false);
    });

    it('SSM-003: returns true after a setter marks a flag dirty', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();
      expect(mgr.hasPendingStateChanges()).toBe(false);

      mgr.setColorInversion(true);
      expect(mgr.hasPendingStateChanges()).toBe(true);
    });
  });

  // =================================================================
  // setLUT - intensity stored on disable path
  // =================================================================

  describe('setLUT intensity on disable path', () => {
    it('SSM-010: setLUT(null, 0, 0) stores intensity=0 (verified via applyRenderState comparison)', () => {
      // The bug: setLUT(null) didn't store intensity on disable path,
      // leaving it at default 1.0. This caused DIRTY_LUT3D to be set
      // every frame because applyRenderState compared 0 !== 1.0.
      //
      // Fix: setLUT stores intensity even on the disable (null) path.
      // Verify: after setLUT(null, 0, 0), a subsequent applyRenderState
      // with lut.intensity=0 should NOT mark DIRTY_LUT3D.
      const rs = createDefaultRenderState();
      // rs.lut = { data: null, size: 0, intensity: 0 }

      // Apply once to seed internal state
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply again — if intensity was stored correctly, comparison matches → no dirty
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LUT3D)).toBe(false);
    });

    it('SSM-011: setLUT(null, 0, 0.5) stores intensity=0.5 (subsequent match is clean)', () => {
      // Seed with intensity 0.5
      mgr.setLUT(null, 0, 0.5);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // applyRenderState with matching intensity — should skip
      const rs = createDefaultRenderState();
      rs.lut.intensity = 0.5;
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LUT3D)).toBe(false);
    });

    it('SSM-012: setLUT(null, 0, 0.5) followed by mismatch intensity marks dirty', () => {
      mgr.setLUT(null, 0, 0.5);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Different intensity triggers DIRTY_LUT3D
      const rs = createDefaultRenderState();
      rs.lut.intensity = 0.75;
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LUT3D)).toBe(true);
    });

    it('SSM-013: setLUT(null) marks DIRTY_LUT3D', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setLUT(null, 0, 0);
      expect(flags.has(DIRTY_LUT3D)).toBe(true);
    });

    it('SSM-014: setLUT(null) disables LUT', () => {
      // First enable
      const data = new Float32Array(4 * 4 * 4 * 3);
      mgr.setLUT(data, 4, 1.0);

      // Then disable
      mgr.setLUT(null, 0, 0);
      expect(mgr.getLUT3DSnapshot().data).toBeNull();
      expect(mgr.getLUT3DSnapshot().size).toBe(0);
    });

    it('SSM-015: setLUT with valid data stores data and size in snapshot', () => {
      const data = new Float32Array(4 * 4 * 4 * 3);
      mgr.setLUT(data, 4, 0.75);
      const snapshot = mgr.getLUT3DSnapshot();
      expect(snapshot.data).toBe(data);
      expect(snapshot.size).toBe(4);
    });
  });

  // =================================================================
  // applyRenderState - LUT comparison uses intensity
  // =================================================================

  describe('applyRenderState LUT intensity comparison', () => {
    it('SSM-020: applyRenderState skips setLUT when intensity matches', () => {
      // Apply once to set initial state
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply again with same state — should NOT mark DIRTY_LUT3D
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LUT3D)).toBe(false);
    });

    it('SSM-021: applyRenderState marks DIRTY_LUT3D when intensity changes', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change intensity
      rs.lut.intensity = 0.5;
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LUT3D)).toBe(true);
    });
  });

  // =================================================================
  // applyRenderState - background pattern comparison guard
  // =================================================================

  describe('applyRenderState background pattern comparison guard', () => {
    it('SSM-030: identical background pattern does not leave DIRTY_BACKGROUND', () => {
      const rs = createDefaultRenderState();
      // Apply once to initialize
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply again with same background — guard should delete DIRTY_BACKGROUND
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_BACKGROUND)).toBe(false);
    });

    it('SSM-031: changed background pattern leaves DIRTY_BACKGROUND set', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change to checker pattern
      rs.backgroundPattern = { ...rs.backgroundPattern, pattern: 'checker' };
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_BACKGROUND)).toBe(true);
    });

    it('SSM-032: repeated identical calls produce no dirty flags (steady state)', () => {
      const rs = createDefaultRenderState();
      // Apply twice to reach steady state
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.applyRenderState(rs);
      // In steady state with no changes, no flags should be dirty
      expect(flags.size).toBe(0);
    });
  });

  // =================================================================
  // markAllDirty
  // =================================================================

  describe('markAllDirty', () => {
    it('SSM-040: markAllDirty sets all flags', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();
      expect(mgr.hasPendingStateChanges()).toBe(false);

      mgr.markAllDirty();
      expect(mgr.hasPendingStateChanges()).toBe(true);
      expect(flags.size).toBe(ALL_DIRTY_FLAGS.length);
    });
  });

  // =================================================================
  // getDirtyFlags
  // =================================================================

  describe('getDirtyFlags', () => {
    it('SSM-050: returns the actual set (not a copy)', () => {
      const flags1 = mgr.getDirtyFlags();
      const flags2 = mgr.getDirtyFlags();
      // Same reference
      expect(flags1).toBe(flags2);
    });

    it('SSM-051: individual setters add their specific flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setColorInversion(true);
      expect(flags.has('inversion')).toBe(true);
      expect(flags.size).toBe(1);
    });
  });

  describe('setGamutMapping', () => {
    it('SSM-060: marks gamut mapping dirty flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setGamutMapping({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      expect(flags.has(DIRTY_GAMUT_MAPPING)).toBe(true);
    });

    it('SSM-061: disables gamut mapping when mode is off', () => {
      mgr.setGamutMapping({ mode: 'off', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      const state = mgr.getGamutMapping();
      expect(state.mode).toBe('off');
    });

    it('SSM-062: disables gamut mapping when source equals target', () => {
      mgr.setGamutMapping({ mode: 'clip', sourceGamut: 'srgb', targetGamut: 'srgb' });
      const state = mgr.getGamutMapping();
      expect(state.mode).toBe('off');
    });

    it('SSM-063: enables gamut mapping for rec2020 to srgb clip', () => {
      mgr.setGamutMapping({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      const state = mgr.getGamutMapping();
      expect(state.mode).toBe('clip');
      expect(state.sourceGamut).toBe('rec2020');
      expect(state.targetGamut).toBe('srgb');
    });

    it('SSM-064: enables gamut mapping for rec2020 to display-p3 compress', () => {
      mgr.setGamutMapping({ mode: 'compress', sourceGamut: 'rec2020', targetGamut: 'display-p3' });
      const state = mgr.getGamutMapping();
      expect(state.mode).toBe('compress');
      expect(state.sourceGamut).toBe('rec2020');
      expect(state.targetGamut).toBe('display-p3');
    });

    it('SSM-065: DIRTY_GAMUT_MAPPING is included in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_GAMUT_MAPPING);
    });

    it('SSM-066: applyRenderState with gamutMapping marks gamut dirty', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      const state = createDefaultRenderState();
      state.gamutMapping = { mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' };
      mgr.applyRenderState(state);

      expect(flags.has(DIRTY_GAMUT_MAPPING)).toBe(true);
    });

    it('SSM-067: highlightOutOfGamut defaults to false when not specified', () => {
      mgr.setGamutMapping({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' });
      const state = mgr.getGamutMapping();
      expect(state.highlightOutOfGamut).toBe(false);
    });

    it('SSM-068: highlightOutOfGamut is true when enabled and gamut mapping active', () => {
      mgr.setGamutMapping({ mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb', highlightOutOfGamut: true });
      const state = mgr.getGamutMapping();
      expect(state.highlightOutOfGamut).toBe(true);
    });

    it('SSM-069: highlightOutOfGamut is false when gamut mapping disabled (mode off)', () => {
      mgr.setGamutMapping({ mode: 'off', sourceGamut: 'rec2020', targetGamut: 'srgb', highlightOutOfGamut: true });
      const state = mgr.getGamutMapping();
      // When mode is off, gamut mapping is disabled, so default state is returned
      expect(state.highlightOutOfGamut).toBeUndefined();
    });

    it('SSM-069b: highlightOutOfGamut is false when source equals target', () => {
      mgr.setGamutMapping({ mode: 'clip', sourceGamut: 'srgb', targetGamut: 'srgb', highlightOutOfGamut: true });
      const state = mgr.getGamutMapping();
      // When source == target, gamut mapping is disabled
      expect(state.highlightOutOfGamut).toBeUndefined();
    });

    it('SSM-069c: applyRenderState marks dirty when highlightOutOfGamut changes', () => {
      const rs = createDefaultRenderState();
      rs.gamutMapping = { mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb', highlightOutOfGamut: false };
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change only highlightOutOfGamut
      rs.gamutMapping = { mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb', highlightOutOfGamut: true };
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_GAMUT_MAPPING)).toBe(true);
    });

    it('SSM-069d: applyRenderState does not mark dirty when highlightOutOfGamut is unchanged', () => {
      const rs = createDefaultRenderState();
      rs.gamutMapping = { mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb', highlightOutOfGamut: true };
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply same state again
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_GAMUT_MAPPING)).toBe(false);
    });
  });

  // =================================================================
  // getDisplayColorState
  // =================================================================

  // =================================================================
  // Per-channel RGB uniforms (exposure, gamma, contrast)
  // =================================================================

  describe('per-channel RGB uniforms', () => {
    it('SSM-080: per-channel exposureRGB [0.5, 1.0, 1.5] produces correct vec3 uniform', () => {
      const uniformCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (_name: string, _value: number) => {},
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 0.5,
        exposureRGB: [0.5, 1.0, 1.5],
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_exposureRGB']).toEqual([0.5, 1.0, 1.5]);
    });

    it('SSM-081: scalar exposure 2.0 produces uniform vec3(2.0, 2.0, 2.0)', () => {
      const uniformCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (_name: string, _value: number) => {},
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 2.0,
        // no exposureRGB -> broadcasts scalar
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_exposureRGB']).toEqual([2.0, 2.0, 2.0]);
    });

    it('SSM-082: gammaRGB = [0, 0, 0] does not produce NaN (clamped to epsilon)', () => {
      const uniformCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (_name: string, _value: number) => {},
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        gamma: 0,
        gammaRGB: [0, 0, 0],
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      const gammaRGB = uniformCalls['u_gammaRGB'] as number[];
      expect(gammaRGB).toBeDefined();
      // All values should be clamped to a small positive epsilon, not 0 or NaN
      for (const v of gammaRGB) {
        expect(v).toBeGreaterThan(0);
        expect(Number.isFinite(v)).toBe(true);
      }
    });

    it('SSM-083: exposureRGB = [Infinity, -Infinity, NaN] is sanitized to [0, 0, 0]', () => {
      const uniformCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (_name: string, _value: number) => {},
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 0,
        exposureRGB: [Infinity, -Infinity, NaN],
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      const expRGB = uniformCalls['u_exposureRGB'] as number[];
      expect(expRGB).toBeDefined();
      // All non-finite values sanitized to 0
      expect(expRGB).toEqual([0, 0, 0]);
    });

    it('SSM-084: per-channel contrastRGB is sent as vec3', () => {
      const uniformCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (_name: string, _value: number) => {},
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        contrast: 1.0,
        contrastRGB: [0.8, 1.0, 1.2],
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_contrastRGB']).toEqual([0.8, 1.0, 1.2]);
    });

    it('SSM-085: scalar gamma broadcasts to vec3', () => {
      const uniformCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (_name: string, _value: number) => {},
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        gamma: 2.2,
        // no gammaRGB -> broadcasts scalar
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_gammaRGB']).toEqual([2.2, 2.2, 2.2]);
    });

    it('SSM-086: applyRenderState detects per-channel changes', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change only exposureRGB
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        exposureRGB: [0.1, 0.2, 0.3],
      };
      mgr.applyRenderState(rs);
      expect(flags.has('color')).toBe(true);
    });
  });

  describe('getDisplayColorState', () => {
    it('SSM-070: getDisplayColorState returns initial defaults', () => {
      const dc = mgr.getDisplayColorState();
      // Default displayTransferCode is DISPLAY_TRANSFER_SRGB = 1
      expect(dc.transferFunction).toBe(1);
      expect(dc.displayGamma).toBe(1.0);
      expect(dc.displayBrightness).toBe(1.0);
      expect(dc.customGamma).toBe(2.2);
    });

    it('SSM-071: getDisplayColorState reflects values after setDisplayColorState', () => {
      mgr.setDisplayColorState({
        transferFunction: 3,
        displayGamma: 2.4,
        displayBrightness: 1.5,
        customGamma: 1.8,
      });
      const dc = mgr.getDisplayColorState();
      expect(dc.transferFunction).toBe(3);
      expect(dc.displayGamma).toBe(2.4);
      expect(dc.displayBrightness).toBe(1.5);
      expect(dc.customGamma).toBe(1.8);
    });

    it('SSM-072: getDisplayColorState round-trips all four fields', () => {
      const config = {
        transferFunction: 2,
        displayGamma: 0.5,
        displayBrightness: 2.0,
        customGamma: 3.0,
      };
      mgr.setDisplayColorState(config);
      const result = mgr.getDisplayColorState();
      expect(result).toEqual(config);
    });

    it('SSM-073: setDisplayColorState marks DIRTY_DISPLAY flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();
      expect(flags.has(DIRTY_DISPLAY)).toBe(false);

      mgr.setDisplayColorState({
        transferFunction: 1,
        displayGamma: 1.0,
        displayBrightness: 1.0,
        customGamma: 2.2,
      });
      expect(flags.has(DIRTY_DISPLAY)).toBe(true);
    });
  });

  // =================================================================
  // setLinearize / getLinearize
  // =================================================================

  describe('setLinearize / getLinearize', () => {
    it('SSM-090: setLinearize marks DIRTY_LINEARIZE flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();
      expect(flags.has(DIRTY_LINEARIZE)).toBe(false);

      mgr.setLinearize({
        logType: 1,
        sRGB2linear: false,
        rec709ToLinear: false,
        fileGamma: 1.0,
        alphaType: 0,
      });
      expect(flags.has(DIRTY_LINEARIZE)).toBe(true);
    });

    it('SSM-091: getLinearize returns correct state after setLinearize', () => {
      mgr.setLinearize({
        logType: 3,
        sRGB2linear: true,
        rec709ToLinear: false,
        fileGamma: 2.2,
        alphaType: 1,
      });

      const state = mgr.getLinearize();
      expect(state.logType).toBe(3);
      expect(state.sRGB2linear).toBe(true);
      expect(state.rec709ToLinear).toBe(false);
      expect(state.fileGamma).toBe(2.2);
      expect(state.alphaType).toBe(1);
    });

    it('SSM-092: getLinearize returns defaults before any setLinearize call', () => {
      const state = mgr.getLinearize();
      expect(state.logType).toBe(0);
      expect(state.sRGB2linear).toBe(false);
      expect(state.rec709ToLinear).toBe(false);
      expect(state.fileGamma).toBe(1.0);
      expect(state.alphaType).toBe(0);
    });

    it('SSM-093: DIRTY_LINEARIZE is included in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_LINEARIZE);
    });

    it('SSM-094: setLinearize uploads correct uniforms via applyUniforms', () => {
      const uniformCalls: Record<string, unknown> = {};
      const intCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (name: string, value: number) => { intCalls[name] = value; },
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setLinearize({
        logType: 1,
        sRGB2linear: true,
        rec709ToLinear: false,
        fileGamma: 2.2,
        alphaType: 0,
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_linearizeLogType']).toBe(1);
      expect(uniformCalls['u_linearizeFileGamma']).toBe(2.2);
      expect(intCalls['u_linearizeSRGB2linear']).toBe(1);
      expect(intCalls['u_linearizeRec709ToLinear']).toBe(0);
    });

    it('SSM-095: setLinearize with rec709ToLinear=true uploads 1', () => {
      const intCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: () => {},
        setUniformInt: (name: string, value: number) => { intCalls[name] = value; },
        setUniformMatrix3: () => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setLinearize({
        logType: 0,
        sRGB2linear: false,
        rec709ToLinear: true,
        fileGamma: 1.0,
        alphaType: 0,
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_linearizeRec709ToLinear']).toBe(1);
    });

    it('SSM-096: getLinearize round-trips all fields', () => {
      const input = {
        logType: 2 as const,
        sRGB2linear: true,
        rec709ToLinear: true,
        fileGamma: 0.4545,
        alphaType: 1,
      };
      mgr.setLinearize(input);
      const output = mgr.getLinearize();
      expect(output).toEqual(input);
    });
  });

  // =================================================================
  // applyRenderState - linearize handling
  // =================================================================

  describe('applyRenderState linearize', () => {
    it('SSM-100: applyRenderState with linearize field marks DIRTY_LINEARIZE and sets state', () => {
      const rs = createDefaultRenderState();
      rs.linearize = {
        logType: 1,
        sRGB2linear: false,
        rec709ToLinear: false,
        fileGamma: 2.2,
        alphaType: 0,
      };

      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LINEARIZE)).toBe(true);

      // Verify the state was actually set
      const lz = mgr.getLinearize();
      expect(lz.logType).toBe(1);
      expect(lz.fileGamma).toBe(2.2);
    });

    it('SSM-101: applyRenderState with same linearize state does NOT mark dirty (steady-state)', () => {
      const rs = createDefaultRenderState();
      rs.linearize = {
        logType: 3,
        sRGB2linear: true,
        rec709ToLinear: false,
        fileGamma: 1.5,
        alphaType: 1,
      };

      // First apply to seed the state
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Second apply with identical linearize -> should NOT mark dirty
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LINEARIZE)).toBe(false);
    });

    it('SSM-102: applyRenderState resets linearize when field is absent and state is non-default', () => {
      // First set a non-default linearize
      mgr.setLinearize({
        logType: 1,
        sRGB2linear: true,
        rec709ToLinear: false,
        fileGamma: 2.2,
        alphaType: 0,
      });

      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply render state without linearize field
      const rs = createDefaultRenderState();
      // rs.linearize is undefined
      mgr.applyRenderState(rs);

      expect(flags.has(DIRTY_LINEARIZE)).toBe(true);
      const lz = mgr.getLinearize();
      expect(lz.logType).toBe(0);
      expect(lz.sRGB2linear).toBe(false);
      expect(lz.fileGamma).toBe(1.0);
    });

    it('SSM-103: applyRenderState without linearize does NOT mark dirty when already at defaults', () => {
      const rs = createDefaultRenderState();
      // First apply to consume initial dirty flags
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply again without linearize (already at defaults) -> no dirty
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_LINEARIZE)).toBe(false);
    });
  });

  // =================================================================
  // setInlineLUT / inline LUT state management
  // =================================================================

  describe('setInlineLUT', () => {
    it('SSM-110: setInlineLUT marks DIRTY_INLINE_LUT flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      const lutData = new Float32Array(256);
      mgr.setInlineLUT(lutData, 1);
      expect(flags.has(DIRTY_INLINE_LUT)).toBe(true);
    });

    it('SSM-111: setInlineLUT with 3-channel data sets correct state', () => {
      const lutData = new Float32Array(768);
      mgr.setInlineLUT(lutData, 3);

      const state = mgr.getInternalState();
      expect(state.inlineLUTEnabled).toBe(true);
      expect(state.inlineLUTChannels).toBe(3);
      expect(state.inlineLUTSize).toBe(256); // 768 / 3
      expect(state.inlineLUTData).toBe(lutData);
      expect(state.inlineLUTDirty).toBe(true);
    });

    it('SSM-112: setInlineLUT with 1-channel data sets correct state', () => {
      const lutData = new Float32Array(256);
      mgr.setInlineLUT(lutData, 1);

      const state = mgr.getInternalState();
      expect(state.inlineLUTEnabled).toBe(true);
      expect(state.inlineLUTChannels).toBe(1);
      expect(state.inlineLUTSize).toBe(256);
      expect(state.inlineLUTData).toBe(lutData);
    });

    it('SSM-113: setInlineLUT(null) disables inline LUT', () => {
      // First enable
      mgr.setInlineLUT(new Float32Array(256), 1);
      // Then disable
      mgr.setInlineLUT(null, 1);

      const state = mgr.getInternalState();
      expect(state.inlineLUTEnabled).toBe(false);
      expect(state.inlineLUTData).toBeNull();
      expect(state.inlineLUTSize).toBe(0);
    });

    it('SSM-114: setInlineLUT with empty Float32Array disables LUT', () => {
      mgr.setInlineLUT(new Float32Array(0), 1);

      const state = mgr.getInternalState();
      expect(state.inlineLUTEnabled).toBe(false);
    });

    it('SSM-115: DIRTY_INLINE_LUT is included in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_INLINE_LUT);
    });
  });

  describe('getColorAdjustments with inlineLUT', () => {
    it('SSM-120: getColorAdjustments returns inlineLUT data after setColorAdjustments', () => {
      const lutData = new Float32Array(768);
      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        inlineLUT: lutData,
        lutChannels: 3,
      });

      const result = mgr.getColorAdjustments();
      expect(result.inlineLUT).toBe(lutData);
      expect(result.lutChannels).toBe(3);
    });

    it('SSM-121: getColorAdjustments returns undefined inlineLUT when not set', () => {
      const result = mgr.getColorAdjustments();
      expect(result.inlineLUT).toBeUndefined();
      expect(result.lutChannels).toBeUndefined();
    });
  });

  describe('applyUniforms with inline LUT', () => {
    it('SSM-130: applyUniforms sets u_inlineLUTEnabled=1 when LUT is active', () => {
      const intCalls: Record<string, unknown> = {};
      const uniformCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (name: string, value: unknown) => { uniformCalls[name] = value; },
        setUniformInt: (name: string, value: number) => { intCalls[name] = value; },
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      let inlineLUTBound = false;
      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => { inlineLUTBound = true; },
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setInlineLUT(new Float32Array(768), 3);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_inlineLUTEnabled']).toBe(1);
      expect(intCalls['u_inlineLUTChannels']).toBe(3);
      expect(uniformCalls['u_inlineLUTSize']).toBe(256);
      expect(inlineLUTBound).toBe(true);
    });

    it('SSM-131: applyUniforms sets u_inlineLUTEnabled=0 when LUT is disabled', () => {
      const intCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (_name: string, _value: unknown) => {},
        setUniformInt: (name: string, value: number) => { intCalls[name] = value; },
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      let inlineLUTBound = false;
      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => { inlineLUTBound = true; },
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      mgr.setInlineLUT(null, 1);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_inlineLUTEnabled']).toBe(0);
      expect(inlineLUTBound).toBe(false);
    });
  });

  describe('applyRenderState with inlineLUT', () => {
    it('SSM-140: applyRenderState detects inlineLUT change and marks DIRTY_INLINE_LUT', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Add inlineLUT to color adjustments
      const lutData = new Float32Array(256);
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        inlineLUT: lutData,
        lutChannels: 1,
      };
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_INLINE_LUT)).toBe(true);
    });

    it('SSM-141: applyRenderState does NOT mark DIRTY_INLINE_LUT when LUT is unchanged', () => {
      const lutData = new Float32Array(256);
      const rs = createDefaultRenderState();
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        inlineLUT: lutData,
        lutChannels: 1,
      };

      // First apply to seed state
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply again with same reference -> should NOT mark dirty
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_INLINE_LUT)).toBe(false);
    });

    it('SSM-142: applyRenderState detects channel change on same LUT data', () => {
      const lutData = new Float32Array(768);
      const rs = createDefaultRenderState();
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        inlineLUT: lutData,
        lutChannels: 3,
      };

      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change only channels (same LUT data reference but different channels)
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        inlineLUT: lutData,
        lutChannels: 1,
      };
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_INLINE_LUT)).toBe(true);
    });
  });

  // =================================================================
  // cdlColorspace
  // =================================================================

  describe('cdlColorspace', () => {
    it('SSM-150: setting cdlColorspace via applyRenderState marks DIRTY_CDL flag', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change cdlColorspace from default 0 to 1 (ACEScct)
      rs.cdlColorspace = 1;
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_CDL)).toBe(true);
    });

    it('SSM-151: cdlColorspace=0 sets uniform u_cdlColorspace to 0', () => {
      const intCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (_name: string, _value: unknown) => {},
        setUniformInt: (name: string, value: number) => { intCalls[name] = value; },
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      // Set a non-default CDL to ensure cdlEnabled=true so uniforms are uploaded
      mgr.setCDL({
        slope: { r: 1.2, g: 1.0, b: 1.0 },
        offset: { r: 0, g: 0, b: 0 },
        power: { r: 1, g: 1, b: 1 },
        saturation: 1,
      });
      // cdlColorspace defaults to 0
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_cdlColorspace']).toBe(0);
    });

    it('SSM-152: cdlColorspace=1 sets uniform u_cdlColorspace to 1', () => {
      const intCalls: Record<string, unknown> = {};
      const mockShader = {
        setUniform: (_name: string, _value: unknown) => {},
        setUniformInt: (name: string, value: number) => { intCalls[name] = value; },
        setUniformMatrix3: (_name: string, _value: unknown) => {},
      } as any;

      const mockTexCb = {
        bindCurvesLUTTexture: () => {},
        bindFalseColorLUTTexture: () => {},
        bindLUT3DTexture: () => {},
        bindFilmLUTTexture: () => {},
        bindInlineLUTTexture: () => {},
        getCanvasSize: () => ({ width: 100, height: 100 }),
      };

      // Set a non-default CDL to ensure cdlEnabled=true
      mgr.setCDL({
        slope: { r: 1.2, g: 1.0, b: 1.0 },
        offset: { r: 0, g: 0, b: 0 },
        power: { r: 1, g: 1, b: 1 },
        saturation: 1,
      });
      // Set colorspace to ACEScct via applyRenderState
      const rs = createDefaultRenderState();
      rs.cdl = {
        slope: { r: 1.2, g: 1.0, b: 1.0 },
        offset: { r: 0, g: 0, b: 0 },
        power: { r: 1, g: 1, b: 1 },
        saturation: 1,
      };
      rs.cdlColorspace = 1;
      mgr.applyRenderState(rs);

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_cdlColorspace']).toBe(1);
    });
  });
});
