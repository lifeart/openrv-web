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
  DIRTY_GAMUT_MAPPING,
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
  });
});
