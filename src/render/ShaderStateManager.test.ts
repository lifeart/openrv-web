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
  DIRTY_OUT_OF_RANGE,
  DIRTY_CHANNEL_SWIZZLE,
  DIRTY_PREMULT,
  DIRTY_DITHER,
  DIRTY_COLOR_PRIMARIES,
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

  // =================================================================
  // Per-channel scale and offset (Item 2.3)
  // =================================================================

  describe('per-channel scale and offset', () => {
    function createMockShaderAndTexCb() {
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

      return { uniformCalls, intCalls, mockShader, mockTexCb };
    }

    it('SCOF-SM-001: Per-channel scale sets u_scaleRGB uniform', () => {
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        scale: 1.0,
        scaleRGB: [1.0, 0.5, 1.5],
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_scaleRGB']).toEqual([1.0, 0.5, 1.5]);
    });

    it('SCOF-SM-002: Per-channel offset sets u_offsetRGB uniform', () => {
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        offset: 0.1,
        offsetRGB: [0.1, 0, -0.1],
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_offsetRGB']).toEqual([0.1, 0, -0.1]);
    });

    it('SCOF-SM-003: Default scale is [1,1,1], default offset is [0,0,0]', () => {
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();

      // Use default color adjustments (no scale/offset set)
      mgr.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_scaleRGB']).toEqual([1, 1, 1]);
      expect(uniformCalls['u_offsetRGB']).toEqual([0, 0, 0]);
    });

    it('SCOF-SM-004: Scalar scale broadcasts to vec3', () => {
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        scale: 2.0,
        // no scaleRGB -> broadcasts scalar
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_scaleRGB']).toEqual([2.0, 2.0, 2.0]);
    });

    it('SCOF-SM-005: applyRenderState with scaleRGB/offsetRGB updates uniforms', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change scaleRGB and offsetRGB
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        scale: 1.0,
        scaleRGB: [2.0, 1.5, 0.5],
        offset: 0.0,
        offsetRGB: [0.1, -0.1, 0.0],
      };
      mgr.applyRenderState(rs);
      expect(flags.has('color')).toBe(true);

      // Verify the uniforms via applyUniforms
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_scaleRGB']).toEqual([2.0, 1.5, 0.5]);
      expect(uniformCalls['u_offsetRGB']).toEqual([0.1, -0.1, 0.0]);
    });

    it('SCOF-SM-006: Scalar offset broadcasts to vec3', () => {
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();

      mgr.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        offset: 0.5,
        // no offsetRGB -> broadcasts scalar
      });

      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_offsetRGB']).toEqual([0.5, 0.5, 0.5]);
    });

    it('SCOF-SM-007: applyRenderState detects scale change from undefined to defined', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Add scale (which was previously undefined)
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        scale: 2.0,
      };
      mgr.applyRenderState(rs);
      expect(flags.has('color')).toBe(true);
    });

    it('SCOF-SM-008: applyRenderState detects offsetRGB change', () => {
      const rs = createDefaultRenderState();
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        offsetRGB: [0.1, 0.2, 0.3],
      };
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Change offsetRGB
      rs.colorAdjustments = {
        ...rs.colorAdjustments,
        offsetRGB: [0.1, 0.2, 0.4], // changed B channel
      };
      mgr.applyRenderState(rs);
      expect(flags.has('color')).toBe(true);
    });
  });

  // =================================================================
  // Out-of-range visualization
  // =================================================================

  describe('outOfRange', () => {
    it('OOR-SM-001: Setting outOfRange=2 sets u_outOfRange uniform to 2', () => {
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

      mgr.setOutOfRange(2);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_outOfRange']).toBe(2);
    });

    it('OOR-SM-002: Setting outOfRange=0 sets u_outOfRange uniform to 0', () => {
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

      mgr.setOutOfRange(0);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_outOfRange']).toBe(0);
    });

    it('OOR-SM-003: Default outOfRange is 0', () => {
      expect(mgr.getOutOfRange()).toBe(0);
    });

    it('OOR-SM-004: applyRenderState with outOfRange updates uniform', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Set outOfRange on render state
      rs.outOfRange = 2;
      mgr.applyRenderState(rs);

      expect(flags.has(DIRTY_OUT_OF_RANGE)).toBe(true);
      expect(mgr.getOutOfRange()).toBe(2);
    });

    it('OOR-SM-005: setOutOfRange marks DIRTY_OUT_OF_RANGE flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setOutOfRange(1);
      expect(flags.has(DIRTY_OUT_OF_RANGE)).toBe(true);
    });

    it('OOR-SM-006: DIRTY_OUT_OF_RANGE is included in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_OUT_OF_RANGE);
    });

    it('OOR-SM-007: applyRenderState does not mark dirty when outOfRange is unchanged', () => {
      const rs = createDefaultRenderState();
      rs.outOfRange = 2;
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply again with same value
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_OUT_OF_RANGE)).toBe(false);
    });

    it('OOR-SM-008: applyRenderState defaults outOfRange to 0 when not specified', () => {
      // First set to 2
      mgr.setOutOfRange(2);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply state without outOfRange (undefined)
      const rs = createDefaultRenderState();
      // rs.outOfRange is undefined -> defaults to 0
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_OUT_OF_RANGE)).toBe(true);
      expect(mgr.getOutOfRange()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Channel Swizzle (RVChannelMap full remapping)
  // -------------------------------------------------------------------------
  describe('Channel Swizzle', () => {
    it('CHMAP-005: setChannelSwizzle stores values and marks dirty', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Default should be identity [0, 1, 2, 3]
      expect(mgr.getChannelSwizzle()).toEqual([0, 1, 2, 3]);

      // Set BGR swizzle
      mgr.setChannelSwizzle([2, 1, 0, 3]);
      expect(flags.has(DIRTY_CHANNEL_SWIZZLE)).toBe(true);
      expect(mgr.getChannelSwizzle()).toEqual([2, 1, 0, 3]);

      // getChannelSwizzle should return a copy, not a reference
      const result = mgr.getChannelSwizzle();
      result[0] = 99;
      expect(mgr.getChannelSwizzle()).toEqual([2, 1, 0, 3]);
    });

    it('CHMAP-005b: setChannelSwizzle with constant channels (zero/one)', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // 4=SWIZZLE_ZERO, 5=SWIZZLE_ONE
      mgr.setChannelSwizzle([0, 0, 0, 5]);
      expect(flags.has(DIRTY_CHANNEL_SWIZZLE)).toBe(true);
      expect(mgr.getChannelSwizzle()).toEqual([0, 0, 0, 5]);
    });

    it('CHMAP-006: applyRenderState with channelSwizzle updates state and marks dirty', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply BGR swizzle via RenderState
      const rs = createDefaultRenderState();
      rs.channelSwizzle = [2, 1, 0, 3];
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_CHANNEL_SWIZZLE)).toBe(true);
      expect(mgr.getChannelSwizzle()).toEqual([2, 1, 0, 3]);
    });

    it('CHMAP-006b: applyRenderState skips dirty flag when swizzle is unchanged', () => {
      // Set a non-identity swizzle first
      mgr.setChannelSwizzle([2, 1, 0, 3]);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply same swizzle again
      const rs = createDefaultRenderState();
      rs.channelSwizzle = [2, 1, 0, 3];
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_CHANNEL_SWIZZLE)).toBe(false);
    });

    it('CHMAP-006c: applyRenderState resets to identity when channelSwizzle is absent', () => {
      // Set a non-identity swizzle
      mgr.setChannelSwizzle([2, 1, 0, 3]);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply state without channelSwizzle (undefined -> resets to identity)
      const rs = createDefaultRenderState();
      // rs.channelSwizzle is undefined
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_CHANNEL_SWIZZLE)).toBe(true);
      expect(mgr.getChannelSwizzle()).toEqual([0, 1, 2, 3]);
    });

    it('CHMAP-006d: applyRenderState does not dirty when already identity and no swizzle provided', () => {
      // Manager starts at identity, no swizzle in RenderState
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_CHANNEL_SWIZZLE)).toBe(false);
      expect(mgr.getChannelSwizzle()).toEqual([0, 1, 2, 3]);
    });
  });

  // =================================================================
  // Premultiply/Unpremultiply Alpha
  // =================================================================

  describe('premultMode', () => {
    it('PREMULT-SM-001: Setting premultMode=1 sets u_premult uniform to 1', () => {
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

      mgr.setPremultMode(1);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_premult']).toBe(1);
    });

    it('PREMULT-SM-002: Setting premultMode=2 sets u_premult uniform to 2', () => {
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

      mgr.setPremultMode(2);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_premult']).toBe(2);
    });

    it('PREMULT-SM-003: Setting premultMode=0 sets u_premult uniform to 0', () => {
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

      mgr.setPremultMode(0);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_premult']).toBe(0);
    });

    it('PREMULT-SM-004: Default premultMode is 0', () => {
      expect(mgr.getPremultMode()).toBe(0);
    });

    it('PREMULT-SM-005: setPremultMode marks DIRTY_PREMULT flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setPremultMode(1);
      expect(flags.has(DIRTY_PREMULT)).toBe(true);
    });

    it('PREMULT-SM-006: DIRTY_PREMULT is included in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_PREMULT);
    });

    it('PREMULT-SM-007: applyRenderState with premultMode updates uniform', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      rs.premultMode = 2;
      mgr.applyRenderState(rs);

      expect(flags.has(DIRTY_PREMULT)).toBe(true);
      expect(mgr.getPremultMode()).toBe(2);
    });

    it('PREMULT-SM-008: applyRenderState does not mark dirty when premultMode is unchanged', () => {
      const rs = createDefaultRenderState();
      rs.premultMode = 1;
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply again with same value
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_PREMULT)).toBe(false);
    });

    it('PREMULT-SM-009: applyRenderState defaults premultMode to 0 when not specified', () => {
      // First set to 1
      mgr.setPremultMode(1);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply state without premultMode (undefined)
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_PREMULT)).toBe(true);
      expect(mgr.getPremultMode()).toBe(0);
    });

    it('PREMULT-SM-010: setPremultMode clamps invalid value -1 to 0', () => {
      mgr.setPremultMode(-1);
      expect(mgr.getPremultMode()).toBe(0);
    });

    it('PREMULT-SM-011: setPremultMode clamps invalid value 3 to 0', () => {
      mgr.setPremultMode(3);
      expect(mgr.getPremultMode()).toBe(0);
    });

    it('PREMULT-SM-012: setPremultMode clamps invalid value 99 to 0', () => {
      mgr.setPremultMode(99);
      expect(mgr.getPremultMode()).toBe(0);
    });

    it('PREMULT-SM-013: setPremultMode does not mark dirty when clamped value equals current', () => {
      // Default is 0, setting invalid value clamps to 0 = no change
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setPremultMode(5);
      expect(flags.has(DIRTY_PREMULT)).toBe(false);
      expect(mgr.getPremultMode()).toBe(0);
    });

    it('PREMULT-SM-014: setPremultMode does not mark dirty when setting same valid value', () => {
      mgr.setPremultMode(1);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setPremultMode(1);
      expect(flags.has(DIRTY_PREMULT)).toBe(false);
    });
  });

  // =================================================================
  // Dither + Quantize visualization
  // =================================================================

  describe('ditherMode and quantizeBits', () => {
    it('DITHER-SM-001: setDitherMode sets u_ditherMode uniform', () => {
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

      mgr.setDitherMode(1);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_ditherMode']).toBe(1);
    });

    it('DITHER-SM-002: getDitherMode returns current mode', () => {
      expect(mgr.getDitherMode()).toBe(0);
      mgr.setDitherMode(1);
      expect(mgr.getDitherMode()).toBe(1);
      mgr.setDitherMode(2);
      expect(mgr.getDitherMode()).toBe(2);
    });

    it('DITHER-SM-003: setDitherMode validates input (clamp 0-2)', () => {
      mgr.setDitherMode(-1);
      expect(mgr.getDitherMode()).toBe(0);

      mgr.setDitherMode(3);
      expect(mgr.getDitherMode()).toBe(2);

      mgr.setDitherMode(99);
      expect(mgr.getDitherMode()).toBe(2);
    });

    it('DITHER-SM-004: setQuantizeBits sets u_quantizeBits uniform', () => {
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

      mgr.setQuantizeBits(8);
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(intCalls['u_quantizeBits']).toBe(8);
    });

    it('DITHER-SM-005: getQuantizeBits returns bits', () => {
      expect(mgr.getQuantizeBits()).toBe(0);
      mgr.setQuantizeBits(4);
      expect(mgr.getQuantizeBits()).toBe(4);
      mgr.setQuantizeBits(16);
      expect(mgr.getQuantizeBits()).toBe(16);
    });

    it('DITHER-SM-006: setQuantizeBits validates (0 or 2-16)', () => {
      // 0 means off
      mgr.setQuantizeBits(0);
      expect(mgr.getQuantizeBits()).toBe(0);

      // 1 should clamp to 2
      mgr.setQuantizeBits(1);
      expect(mgr.getQuantizeBits()).toBe(2);

      // 17 should clamp to 16
      mgr.setQuantizeBits(17);
      expect(mgr.getQuantizeBits()).toBe(16);

      // negative should clamp to 0
      mgr.setQuantizeBits(-5);
      expect(mgr.getQuantizeBits()).toBe(0);

      // valid values pass through
      mgr.setQuantizeBits(8);
      expect(mgr.getQuantizeBits()).toBe(8);
    });

    it('DITHER-SM-007: dirty flag set on change', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setDitherMode(1);
      expect(flags.has(DIRTY_DITHER)).toBe(true);

      flags.clear();

      mgr.setQuantizeBits(8);
      expect(flags.has(DIRTY_DITHER)).toBe(true);
    });

    it('DITHER-SM-008: no dirty flag when value unchanged', () => {
      mgr.setDitherMode(1);
      mgr.setQuantizeBits(8);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setDitherMode(1);
      expect(flags.has(DIRTY_DITHER)).toBe(false);

      mgr.setQuantizeBits(8);
      expect(flags.has(DIRTY_DITHER)).toBe(false);
    });

    it('DITHER-SM-009: NaN input defaults to 0 for ditherMode', () => {
      mgr.setDitherMode(1);
      expect(mgr.getDitherMode()).toBe(1);

      mgr.setDitherMode(NaN);
      expect(mgr.getDitherMode()).toBe(0);
    });

    it('DITHER-SM-010: NaN input defaults to 0 for quantizeBits', () => {
      mgr.setQuantizeBits(8);
      expect(mgr.getQuantizeBits()).toBe(8);

      mgr.setQuantizeBits(NaN);
      expect(mgr.getQuantizeBits()).toBe(0);
    });

    it('DITHER-SM-011: applyRenderState marks dirty on dither change', () => {
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      rs.ditherMode = 1;
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_DITHER)).toBe(true);
    });

    it('DITHER-SM-012: applyRenderState no dirty when unchanged (steady state)', () => {
      const rs = createDefaultRenderState();
      rs.ditherMode = 1;
      rs.quantizeBits = 8;
      mgr.applyRenderState(rs);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply same state again
      mgr.applyRenderState(rs);
      expect(flags.has(DIRTY_DITHER)).toBe(false);
    });

    it('DITHER-SM-013: applyRenderState resets to 0 when field absent', () => {
      // First set non-default values
      mgr.setDitherMode(1);
      mgr.setQuantizeBits(8);
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      // Apply state without ditherMode/quantizeBits (undefined -> defaults to 0)
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);
      expect(mgr.getDitherMode()).toBe(0);
      expect(mgr.getQuantizeBits()).toBe(0);
      expect(flags.has(DIRTY_DITHER)).toBe(true);
    });

    it('DITHER-SM-014: DIRTY_DITHER is in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_DITHER);
    });
  });

  // =========================================================================
  // Color Primaries Conversion
  // =========================================================================

  describe('Color Primaries', () => {
    it('CP-SM-001: SDR BT.709 on sRGB display — both disabled', () => {
      const mgr = new ShaderStateManager();
      mgr.setColorPrimaries(undefined, 'srgb');
      const flags = (mgr as unknown as { dirtyFlags: Set<string> }).dirtyFlags;
      expect(flags.has(DIRTY_COLOR_PRIMARIES)).toBe(true);
      // Access state indirectly via applyUniforms
      const uploaded: Record<string, unknown> = {};
      const shader = {
        setUniform: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformInt: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformMatrix3: (name: string, val: unknown) => { uploaded[name] = val; },
      };
      mgr.applyUniforms(shader as never, { bindCurvesLUTTexture: () => {}, bindFalseColorLUTTexture: () => {}, bindLUT3DTexture: () => {}, bindFilmLUTTexture: () => {}, bindInlineLUTTexture: () => {}, getCanvasSize: () => ({ width: 100, height: 100 }) });
      expect(uploaded['u_inputPrimariesEnabled']).toBe(0);
      expect(uploaded['u_outputPrimariesEnabled']).toBe(0);
    });

    it('CP-SM-002: BT.2020 input — correct input matrix selected', () => {
      const mgr = new ShaderStateManager();
      mgr.setColorPrimaries('bt2020', 'srgb');
      const uploaded: Record<string, unknown> = {};
      const shader = {
        setUniform: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformInt: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformMatrix3: (name: string, val: unknown) => { uploaded[name] = val; },
      };
      mgr.applyUniforms(shader as never, { bindCurvesLUTTexture: () => {}, bindFalseColorLUTTexture: () => {}, bindLUT3DTexture: () => {}, bindFilmLUTTexture: () => {}, bindInlineLUTTexture: () => {}, getCanvasSize: () => ({ width: 100, height: 100 }) });
      expect(uploaded['u_inputPrimariesEnabled']).toBe(1);
      const mat = uploaded['u_inputPrimariesMatrix'] as Float32Array;
      expect(mat).toBeInstanceOf(Float32Array);
      expect(mat.length).toBe(9);
      // First element should be ~1.66 (REC2020_TO_SRGB[0])
      expect(mat[0]).toBeCloseTo(1.6605, 3);
    });

    it('CP-SM-003: P3 display output — correct output matrix selected', () => {
      const mgr = new ShaderStateManager();
      mgr.setColorPrimaries(undefined, 'display-p3');
      const uploaded: Record<string, unknown> = {};
      const shader = {
        setUniform: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformInt: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformMatrix3: (name: string, val: unknown) => { uploaded[name] = val; },
      };
      mgr.applyUniforms(shader as never, { bindCurvesLUTTexture: () => {}, bindFalseColorLUTTexture: () => {}, bindLUT3DTexture: () => {}, bindFilmLUTTexture: () => {}, bindInlineLUTTexture: () => {}, getCanvasSize: () => ({ width: 100, height: 100 }) });
      expect(uploaded['u_inputPrimariesEnabled']).toBe(0);
      expect(uploaded['u_outputPrimariesEnabled']).toBe(1);
      const mat = uploaded['u_outputPrimariesMatrix'] as Float32Array;
      expect(mat[0]).toBeCloseTo(0.8225, 3);
    });

    it('CP-SM-004: HDR output (rec2020) — output matrix is SRGB_TO_REC2020', () => {
      const mgr = new ShaderStateManager();
      mgr.setColorPrimaries(undefined, 'rec2020');
      const uploaded: Record<string, unknown> = {};
      const shader = {
        setUniform: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformInt: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformMatrix3: (name: string, val: unknown) => { uploaded[name] = val; },
      };
      mgr.applyUniforms(shader as never, { bindCurvesLUTTexture: () => {}, bindFalseColorLUTTexture: () => {}, bindLUT3DTexture: () => {}, bindFilmLUTTexture: () => {}, bindInlineLUTTexture: () => {}, getCanvasSize: () => ({ width: 100, height: 100 }) });
      expect(uploaded['u_outputPrimariesEnabled']).toBe(1);
      const mat = uploaded['u_outputPrimariesMatrix'] as Float32Array;
      expect(mat[0]).toBeCloseTo(0.6274, 3);
    });

    it('CP-SM-005: DIRTY_COLOR_PRIMARIES is in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_COLOR_PRIMARIES);
    });

    it('CP-SM-006: P3 input primaries — input matrix is P3_TO_SRGB', () => {
      const mgr = new ShaderStateManager();
      mgr.setColorPrimaries('p3', 'srgb');
      const uploaded: Record<string, unknown> = {};
      const shader = {
        setUniform: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformInt: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformMatrix3: (name: string, val: unknown) => { uploaded[name] = val; },
      };
      mgr.applyUniforms(shader as never, { bindCurvesLUTTexture: () => {}, bindFalseColorLUTTexture: () => {}, bindLUT3DTexture: () => {}, bindFilmLUTTexture: () => {}, bindInlineLUTTexture: () => {}, getCanvasSize: () => ({ width: 100, height: 100 }) });
      expect(uploaded['u_inputPrimariesEnabled']).toBe(1);
      const mat = uploaded['u_inputPrimariesMatrix'] as Float32Array;
      expect(mat).toBeInstanceOf(Float32Array);
      expect(mat.length).toBe(9);
      // First element should be ~1.2249 (P3_TO_SRGB[0])
      expect(mat[0]).toBeCloseTo(1.2249, 3);
      // Output should remain disabled for sRGB display
      expect(uploaded['u_outputPrimariesEnabled']).toBe(0);
    });

    it('CP-SM-007: Combined bt2020 input + display-p3 output — both matrices enabled', () => {
      const mgr = new ShaderStateManager();
      mgr.setColorPrimaries('bt2020', 'display-p3');
      const uploaded: Record<string, unknown> = {};
      const shader = {
        setUniform: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformInt: (name: string, val: unknown) => { uploaded[name] = val; },
        setUniformMatrix3: (name: string, val: unknown) => { uploaded[name] = val; },
      };
      mgr.applyUniforms(shader as never, { bindCurvesLUTTexture: () => {}, bindFalseColorLUTTexture: () => {}, bindLUT3DTexture: () => {}, bindFilmLUTTexture: () => {}, bindInlineLUTTexture: () => {}, getCanvasSize: () => ({ width: 100, height: 100 }) });
      // Input: bt2020 → sRGB (REC2020_TO_SRGB)
      expect(uploaded['u_inputPrimariesEnabled']).toBe(1);
      const inMat = uploaded['u_inputPrimariesMatrix'] as Float32Array;
      expect(inMat[0]).toBeCloseTo(1.6605, 3);
      // Output: sRGB → display-p3 (SRGB_TO_P3)
      expect(uploaded['u_outputPrimariesEnabled']).toBe(1);
      const outMat = uploaded['u_outputPrimariesMatrix'] as Float32Array;
      expect(outMat[0]).toBeCloseTo(0.8225, 3);
    });
  });
});
