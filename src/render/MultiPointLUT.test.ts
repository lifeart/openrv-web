/**
 * Multi-Point LUT Pipeline Tests
 *
 * Comprehensive tests for the four-point LUT pipeline: Pre-Cache (CPU),
 * File (GPU), Look (GPU), and Display (GPU). Tests cover:
 * - ShaderStateManager: setFileLUT/setLookLUT/setDisplayLUT, dirty flags, domain handling
 * - applyUniforms: correct uniform upload for each LUT slot with domain min/max
 * - Texture callback invocations for units 3/6/7
 * - RenderState integration for File/Look/Display LUT fields
 * - Backward compatibility: setLUT() delegates to setLookLUT()
 * - Snapshot methods: getFileLUT3DSnapshot/getDisplayLUT3DSnapshot
 * - bake1DTo3D: 1D-to-3D LUT baking utility
 * - WebGPUBackend/RenderWorkerProxy stub methods
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShaderStateManager,
  DIRTY_LUT3D,
  DIRTY_FILE_LUT3D,
  DIRTY_DISPLAY_LUT3D,
  ALL_DIRTY_FLAGS,
} from './ShaderStateManager';
import type { TextureCallbacks } from './ShaderStateManager';
import type { RenderState } from './RenderState';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';
import { DEFAULT_CDL } from '../color/CDL';
import { DEFAULT_COLOR_WHEELS_STATE } from '../ui/components/ColorWheels';
import { DEFAULT_ZEBRA_STATE } from '../ui/components/ZebraStripes';
import { DEFAULT_BACKGROUND_PATTERN_STATE } from '../ui/components/BackgroundPatternControl';
import { DEFAULT_HSL_QUALIFIER_STATE } from '../ui/components/HSLQualifier';
import { bake1DTo3D } from '../color/LUTUtils';

// =====================================================================
// Helpers
// =====================================================================

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

function createMockShaderAndTexCb() {
  const uniformCalls: Record<string, unknown> = {};
  const intCalls: Record<string, unknown> = {};
  const matCalls: Record<string, unknown> = {};
  const mockShader = {
    setUniform: (name: string, value: unknown) => {
      uniformCalls[name] = value;
    },
    setUniformInt: (name: string, value: number) => {
      intCalls[name] = value;
    },
    setUniformMatrix3: (name: string, value: unknown) => {
      matCalls[name] = value;
    },
  } as any;

  let lut3DBound = false;
  let fileLUTBound = false;
  let displayLUTBound = false;
  const mockTexCb: TextureCallbacks = {
    bindCurvesLUTTexture: () => {},
    bindFalseColorLUTTexture: () => {},
    bindLUT3DTexture: () => {
      lut3DBound = true;
    },
    bindFileLUT3DTexture: () => {
      fileLUTBound = true;
    },
    bindDisplayLUT3DTexture: () => {
      displayLUTBound = true;
    },
    bindFilmLUTTexture: () => {},
    bindInlineLUTTexture: () => {},
    getCanvasSize: () => ({ width: 100, height: 100 }),
  };

  return {
    uniformCalls,
    intCalls,
    matCalls,
    mockShader,
    mockTexCb,
    getBound: () => ({ lut3DBound, fileLUTBound, displayLUTBound }),
  };
}

/** Create a simple 2x2x2 identity-like 3D LUT (8 entries, 24 floats). */
function createTestLUT3D(size: number = 2): Float32Array {
  const data = new Float32Array(size * size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const idx = (r * size * size + g * size + b) * 3;
        data[idx + 0] = r / (size - 1);
        data[idx + 1] = g / (size - 1);
        data[idx + 2] = b / (size - 1);
      }
    }
  }
  return data;
}

// =====================================================================
// Test suites
// =====================================================================

describe('Multi-Point LUT Pipeline', () => {
  let mgr: ShaderStateManager;

  beforeEach(() => {
    mgr = new ShaderStateManager();
  });

  // =================================================================
  // 1. Dirty flags
  // =================================================================

  describe('Dirty flags', () => {
    it('MPLUT-001: DIRTY_FILE_LUT3D is in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_FILE_LUT3D);
    });

    it('MPLUT-002: DIRTY_DISPLAY_LUT3D is in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_DISPLAY_LUT3D);
    });

    it('MPLUT-003: DIRTY_LUT3D is in ALL_DIRTY_FLAGS', () => {
      expect(ALL_DIRTY_FLAGS).toContain(DIRTY_LUT3D);
    });

    it('MPLUT-004: setFileLUT adds DIRTY_FILE_LUT3D flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      expect(flags.has(DIRTY_FILE_LUT3D)).toBe(true);
    });

    it('MPLUT-005: setLookLUT adds DIRTY_LUT3D flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      expect(flags.has(DIRTY_LUT3D)).toBe(true);
    });

    it('MPLUT-006: setDisplayLUT adds DIRTY_DISPLAY_LUT3D flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      expect(flags.has(DIRTY_DISPLAY_LUT3D)).toBe(true);
    });

    it('MPLUT-007: each LUT setter only adds its own dirty flag', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      expect(flags.has(DIRTY_FILE_LUT3D)).toBe(true);
      expect(flags.has(DIRTY_LUT3D)).toBe(false);
      expect(flags.has(DIRTY_DISPLAY_LUT3D)).toBe(false);

      flags.clear();
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      expect(flags.has(DIRTY_LUT3D)).toBe(true);
      expect(flags.has(DIRTY_FILE_LUT3D)).toBe(false);
      expect(flags.has(DIRTY_DISPLAY_LUT3D)).toBe(false);

      flags.clear();
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      expect(flags.has(DIRTY_DISPLAY_LUT3D)).toBe(true);
      expect(flags.has(DIRTY_FILE_LUT3D)).toBe(false);
      expect(flags.has(DIRTY_LUT3D)).toBe(false);
    });
  });

  // =================================================================
  // 2. setLookLUT (state management)
  // =================================================================

  describe('setLookLUT', () => {
    it('MPLUT-010: setLookLUT enables state when data is provided', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 0.8);
      const state = mgr.getInternalState();
      expect(state.lut3DEnabled).toBe(true);
      expect(state.lut3DSize).toBe(2);
      expect(state.lut3DIntensity).toBe(0.8);
      expect(state.lut3DDirty).toBe(true);
    });

    it('MPLUT-011: setLookLUT disables state when null data', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      mgr.setLookLUT(null, 0, 0);
      const state = mgr.getInternalState();
      expect(state.lut3DEnabled).toBe(false);
      expect(state.lut3DData).toBeNull();
    });

    it('MPLUT-012: setLookLUT with domain min/max stores domain values', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0, [-0.1, -0.1, -0.1], [1.5, 1.5, 1.5]);
      const state = mgr.getInternalState();
      expect(state.lookLUT3DDomainMin).toEqual([-0.1, -0.1, -0.1]);
      expect(state.lookLUT3DDomainMax).toEqual([1.5, 1.5, 1.5]);
    });

    it('MPLUT-013: setLookLUT without domain uses [0,0,0] and [1,1,1] defaults', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      const state = mgr.getInternalState();
      expect(state.lookLUT3DDomainMin).toEqual([0, 0, 0]);
      expect(state.lookLUT3DDomainMax).toEqual([1, 1, 1]);
    });

    it('MPLUT-014: setLookLUT invalidates cached snapshot', () => {
      // Get first snapshot to cache it
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      const snap1 = mgr.getLUT3DSnapshot();
      // Modify
      mgr.setLookLUT(createTestLUT3D(4), 4, 0.5);
      const snap2 = mgr.getLUT3DSnapshot();
      expect(snap2.size).toBe(4);
      expect(snap1).not.toBe(snap2);
    });
  });

  // =================================================================
  // 3. setFileLUT (state management)
  // =================================================================

  describe('setFileLUT', () => {
    it('MPLUT-020: setFileLUT enables state when data is provided', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 0.9);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DEnabled).toBe(true);
      expect(state.fileLUT3DSize).toBe(2);
      expect(state.fileLUT3DIntensity).toBe(0.9);
      expect(state.fileLUT3DDirty).toBe(true);
    });

    it('MPLUT-021: setFileLUT disables state when null data', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      mgr.setFileLUT(null, 0, 0);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DEnabled).toBe(false);
      expect(state.fileLUT3DData).toBeNull();
    });

    it('MPLUT-022: setFileLUT with domain min/max stores custom domain', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0, [-0.2, -0.2, -0.2], [2.0, 2.0, 2.0]);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DDomainMin).toEqual([-0.2, -0.2, -0.2]);
      expect(state.fileLUT3DDomainMax).toEqual([2.0, 2.0, 2.0]);
    });

    it('MPLUT-023: setFileLUT without domain uses [0,0,0] and [1,1,1] defaults', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DDomainMin).toEqual([0, 0, 0]);
      expect(state.fileLUT3DDomainMax).toEqual([1, 1, 1]);
    });

    it('MPLUT-024: setFileLUT preserves data reference', () => {
      const data = createTestLUT3D();
      mgr.setFileLUT(data, 2, 1.0);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DData).toBe(data);
    });

    it('MPLUT-025: setFileLUT invalidates cached snapshot', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      const snap1 = mgr.getFileLUT3DSnapshot();
      mgr.setFileLUT(createTestLUT3D(4), 4, 0.7);
      const snap2 = mgr.getFileLUT3DSnapshot();
      expect(snap2.size).toBe(4);
      expect(snap1).not.toBe(snap2);
    });
  });

  // =================================================================
  // 4. setDisplayLUT (state management)
  // =================================================================

  describe('setDisplayLUT', () => {
    it('MPLUT-030: setDisplayLUT enables state when data is provided', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 0.7);
      const state = mgr.getInternalState();
      expect(state.displayLUT3DEnabled).toBe(true);
      expect(state.displayLUT3DSize).toBe(2);
      expect(state.displayLUT3DIntensity).toBe(0.7);
      expect(state.displayLUT3DDirty).toBe(true);
    });

    it('MPLUT-031: setDisplayLUT disables state when null data', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      mgr.setDisplayLUT(null, 0, 0);
      const state = mgr.getInternalState();
      expect(state.displayLUT3DEnabled).toBe(false);
      expect(state.displayLUT3DData).toBeNull();
    });

    it('MPLUT-032: setDisplayLUT with domain min/max stores custom domain', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0, [0.0, 0.0, 0.0], [0.9, 0.9, 0.9]);
      const state = mgr.getInternalState();
      expect(state.displayLUT3DDomainMin).toEqual([0.0, 0.0, 0.0]);
      expect(state.displayLUT3DDomainMax).toEqual([0.9, 0.9, 0.9]);
    });

    it('MPLUT-033: setDisplayLUT without domain uses [0,0,0] and [1,1,1] defaults', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      const state = mgr.getInternalState();
      expect(state.displayLUT3DDomainMin).toEqual([0, 0, 0]);
      expect(state.displayLUT3DDomainMax).toEqual([1, 1, 1]);
    });

    it('MPLUT-034: setDisplayLUT invalidates cached snapshot', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      const snap1 = mgr.getDisplayLUT3DSnapshot();
      mgr.setDisplayLUT(createTestLUT3D(4), 4, 0.3);
      const snap2 = mgr.getDisplayLUT3DSnapshot();
      expect(snap2.size).toBe(4);
      expect(snap1).not.toBe(snap2);
    });

    it('MPLUT-035: setDisplayLUT with per-channel domain', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0, [0.0, 0.1, 0.2], [0.8, 0.9, 1.0]);
      const state = mgr.getInternalState();
      expect(state.displayLUT3DDomainMin).toEqual([0.0, 0.1, 0.2]);
      expect(state.displayLUT3DDomainMax).toEqual([0.8, 0.9, 1.0]);
    });
  });

  // =================================================================
  // 5. setLUT backward compatibility
  // =================================================================

  describe('setLUT backward compatibility', () => {
    it('MPLUT-040: setLUT delegates to setLookLUT', () => {
      const data = createTestLUT3D();
      mgr.setLUT(data, 2, 0.6);
      const state = mgr.getInternalState();
      expect(state.lut3DEnabled).toBe(true);
      expect(state.lut3DData).toBe(data);
      expect(state.lut3DSize).toBe(2);
      expect(state.lut3DIntensity).toBe(0.6);
    });

    it('MPLUT-041: setLUT null disables Look LUT', () => {
      mgr.setLUT(createTestLUT3D(), 2, 1.0);
      mgr.setLUT(null, 0, 0);
      const state = mgr.getInternalState();
      expect(state.lut3DEnabled).toBe(false);
    });

    it('MPLUT-042: setLUT sets default domain (no domain params)', () => {
      mgr.setLUT(createTestLUT3D(), 2, 1.0);
      const state = mgr.getInternalState();
      expect(state.lookLUT3DDomainMin).toEqual([0, 0, 0]);
      expect(state.lookLUT3DDomainMax).toEqual([1, 1, 1]);
    });
  });

  // =================================================================
  // 6. clearTextureDirtyFlag
  // =================================================================

  describe('clearTextureDirtyFlag', () => {
    it('MPLUT-050: clearTextureDirtyFlag("fileLUT3DDirty") clears File LUT dirty', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.getInternalState().fileLUT3DDirty).toBe(true);
      mgr.clearTextureDirtyFlag('fileLUT3DDirty');
      expect(mgr.getInternalState().fileLUT3DDirty).toBe(false);
    });

    it('MPLUT-051: clearTextureDirtyFlag("displayLUT3DDirty") clears Display LUT dirty', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.getInternalState().displayLUT3DDirty).toBe(true);
      mgr.clearTextureDirtyFlag('displayLUT3DDirty');
      expect(mgr.getInternalState().displayLUT3DDirty).toBe(false);
    });

    it('MPLUT-052: clearTextureDirtyFlag("lut3DDirty") clears Look LUT dirty', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.getInternalState().lut3DDirty).toBe(true);
      mgr.clearTextureDirtyFlag('lut3DDirty');
      expect(mgr.getInternalState().lut3DDirty).toBe(false);
    });
  });

  // =================================================================
  // 7. Snapshot methods
  // =================================================================

  describe('Snapshot methods', () => {
    it('MPLUT-060: getFileLUT3DSnapshot returns correct data', () => {
      const data = createTestLUT3D();
      mgr.setFileLUT(data, 2, 1.0);
      const snap = mgr.getFileLUT3DSnapshot();
      expect(snap.dirty).toBe(true);
      expect(snap.data).toBe(data);
      expect(snap.size).toBe(2);
    });

    it('MPLUT-061: getDisplayLUT3DSnapshot returns correct data', () => {
      const data = createTestLUT3D(4);
      mgr.setDisplayLUT(data, 4, 0.5);
      const snap = mgr.getDisplayLUT3DSnapshot();
      expect(snap.dirty).toBe(true);
      expect(snap.data).toBe(data);
      expect(snap.size).toBe(4);
    });

    it('MPLUT-062: getLUT3DSnapshot returns Look LUT data', () => {
      const data = createTestLUT3D();
      mgr.setLookLUT(data, 2, 0.9);
      const snap = mgr.getLUT3DSnapshot();
      expect(snap.data).toBe(data);
      expect(snap.size).toBe(2);
    });

    it('MPLUT-063: snapshots are cached (same object returned on repeat calls)', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      const s1 = mgr.getFileLUT3DSnapshot();
      const s2 = mgr.getFileLUT3DSnapshot();
      expect(s1).toBe(s2);
    });

    it('MPLUT-064: clearTextureDirtyFlag invalidates cached snapshot', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      const s1 = mgr.getFileLUT3DSnapshot();
      mgr.clearTextureDirtyFlag('fileLUT3DDirty');
      const s2 = mgr.getFileLUT3DSnapshot();
      expect(s1).not.toBe(s2);
      expect(s2.dirty).toBe(false);
    });
  });

  // =================================================================
  // 8. applyUniforms - Look LUT
  // =================================================================

  describe('applyUniforms - Look LUT', () => {
    it('MPLUT-070: Look LUT enabled sets u_lookLUT3DEnabled=1', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      const { intCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(intCalls['u_lookLUT3DEnabled']).toBe(1);
    });

    it('MPLUT-071: Look LUT disabled sets u_lookLUT3DEnabled=0', () => {
      mgr.setLookLUT(null, 0, 0);
      const { intCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(intCalls['u_lookLUT3DEnabled']).toBe(0);
    });

    it('MPLUT-072: Look LUT uploads intensity, size, domain uniforms', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 0.75, [-0.1, -0.1, -0.1], [1.2, 1.2, 1.2]);
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(uniformCalls['u_lookLUT3DIntensity']).toBe(0.75);
      expect(uniformCalls['u_lookLUT3DSize']).toBe(2);
      expect(uniformCalls['u_lookLUT3DDomainMin']).toEqual([-0.1, -0.1, -0.1]);
      expect(uniformCalls['u_lookLUT3DDomainMax']).toEqual([1.2, 1.2, 1.2]);
    });

    it('MPLUT-073: Look LUT enabled binds texture unit 3', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      const { mockShader, mockTexCb, getBound } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(getBound().lut3DBound).toBe(true);
    });

    it('MPLUT-074: Look LUT disabled does NOT bind texture', () => {
      mgr.setLookLUT(null, 0, 0);
      const { mockShader, mockTexCb, getBound } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(getBound().lut3DBound).toBe(false);
    });
  });

  // =================================================================
  // 9. applyUniforms - File LUT
  // =================================================================

  describe('applyUniforms - File LUT', () => {
    it('MPLUT-080: File LUT enabled sets u_fileLUT3DEnabled=1', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      const { intCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(intCalls['u_fileLUT3DEnabled']).toBe(1);
    });

    it('MPLUT-081: File LUT disabled sets u_fileLUT3DEnabled=0', () => {
      mgr.setFileLUT(null, 0, 0);
      const { intCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(intCalls['u_fileLUT3DEnabled']).toBe(0);
    });

    it('MPLUT-082: File LUT uploads intensity, size, domain uniforms', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 0.5, [-0.2, -0.2, -0.2], [1.8, 1.8, 1.8]);
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(uniformCalls['u_fileLUT3DIntensity']).toBe(0.5);
      expect(uniformCalls['u_fileLUT3DSize']).toBe(2);
      expect(uniformCalls['u_fileLUT3DDomainMin']).toEqual([-0.2, -0.2, -0.2]);
      expect(uniformCalls['u_fileLUT3DDomainMax']).toEqual([1.8, 1.8, 1.8]);
    });

    it('MPLUT-083: File LUT enabled binds texture unit 6', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      const { mockShader, mockTexCb, getBound } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(getBound().fileLUTBound).toBe(true);
    });

    it('MPLUT-084: File LUT disabled does NOT bind texture', () => {
      mgr.setFileLUT(null, 0, 0);
      const { mockShader, mockTexCb, getBound } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(getBound().fileLUTBound).toBe(false);
    });

    it('MPLUT-085: File LUT does not upload intensity/size/domain when disabled', () => {
      mgr.setFileLUT(null, 0, 0);
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(uniformCalls['u_fileLUT3DIntensity']).toBeUndefined();
      expect(uniformCalls['u_fileLUT3DSize']).toBeUndefined();
    });
  });

  // =================================================================
  // 10. applyUniforms - Display LUT
  // =================================================================

  describe('applyUniforms - Display LUT', () => {
    it('MPLUT-090: Display LUT enabled sets u_displayLUT3DEnabled=1', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      const { intCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(intCalls['u_displayLUT3DEnabled']).toBe(1);
    });

    it('MPLUT-091: Display LUT disabled sets u_displayLUT3DEnabled=0', () => {
      mgr.setDisplayLUT(null, 0, 0);
      const { intCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(intCalls['u_displayLUT3DEnabled']).toBe(0);
    });

    it('MPLUT-092: Display LUT uploads intensity, size, domain uniforms', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 0.3, [0.0, 0.0, 0.0], [0.8, 0.8, 0.8]);
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(uniformCalls['u_displayLUT3DIntensity']).toBe(0.3);
      expect(uniformCalls['u_displayLUT3DSize']).toBe(2);
      expect(uniformCalls['u_displayLUT3DDomainMin']).toEqual([0.0, 0.0, 0.0]);
      expect(uniformCalls['u_displayLUT3DDomainMax']).toEqual([0.8, 0.8, 0.8]);
    });

    it('MPLUT-093: Display LUT enabled binds texture unit 7', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      const { mockShader, mockTexCb, getBound } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(getBound().displayLUTBound).toBe(true);
    });

    it('MPLUT-094: Display LUT disabled does NOT bind texture', () => {
      mgr.setDisplayLUT(null, 0, 0);
      const { mockShader, mockTexCb, getBound } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(getBound().displayLUTBound).toBe(false);
    });
  });

  // =================================================================
  // 11. All three LUTs simultaneously
  // =================================================================

  describe('All three LUTs simultaneously', () => {
    it('MPLUT-100: All three LUTs can be enabled at once', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 0.8);
      mgr.setLookLUT(createTestLUT3D(4), 4, 0.9);
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);

      const state = mgr.getInternalState();
      expect(state.fileLUT3DEnabled).toBe(true);
      expect(state.lut3DEnabled).toBe(true);
      expect(state.displayLUT3DEnabled).toBe(true);
    });

    it('MPLUT-101: All three LUTs bind their respective textures', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      mgr.setLookLUT(createTestLUT3D(4), 4, 1.0);
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);

      const { mockShader, mockTexCb, getBound } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);

      const bound = getBound();
      expect(bound.fileLUTBound).toBe(true);
      expect(bound.lut3DBound).toBe(true);
      expect(bound.displayLUTBound).toBe(true);
    });

    it('MPLUT-102: Disabling one LUT does not affect others', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      mgr.setLookLUT(createTestLUT3D(4), 4, 1.0);
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);

      // Disable File LUT
      mgr.setFileLUT(null, 0, 0);

      const state = mgr.getInternalState();
      expect(state.fileLUT3DEnabled).toBe(false);
      expect(state.lut3DEnabled).toBe(true);
      expect(state.displayLUT3DEnabled).toBe(true);
    });

    it('MPLUT-103: Each LUT has independent domain values', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0, [-0.1, -0.1, -0.1], [1.5, 1.5, 1.5]);
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0, [0.0, 0.1, 0.2], [0.8, 0.9, 1.0]);

      const state = mgr.getInternalState();
      expect(state.fileLUT3DDomainMin).toEqual([-0.1, -0.1, -0.1]);
      expect(state.lookLUT3DDomainMin).toEqual([0.0, 0.0, 0.0]);
      expect(state.displayLUT3DDomainMin).toEqual([0.0, 0.1, 0.2]);
    });

    it('MPLUT-104: Each LUT has independent intensity values', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 0.3);
      mgr.setLookLUT(createTestLUT3D(), 2, 0.5);
      mgr.setDisplayLUT(createTestLUT3D(), 2, 0.7);

      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);

      expect(uniformCalls['u_fileLUT3DIntensity']).toBe(0.3);
      expect(uniformCalls['u_lookLUT3DIntensity']).toBe(0.5);
      expect(uniformCalls['u_displayLUT3DIntensity']).toBe(0.7);
    });
  });

  // =================================================================
  // 12. applyRenderState with LUT fields
  // =================================================================

  describe('applyRenderState with LUT fields', () => {
    it('MPLUT-110: applyRenderState with fileLUT sets File LUT state', () => {
      const rs = createDefaultRenderState();
      const data = createTestLUT3D();
      rs.fileLUT = {
        data,
        size: 2,
        intensity: 0.9,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
      };
      mgr.applyRenderState(rs);

      const state = mgr.getInternalState();
      expect(state.fileLUT3DEnabled).toBe(true);
      expect(state.fileLUT3DData).toBe(data);
      expect(state.fileLUT3DSize).toBe(2);
      expect(state.fileLUT3DIntensity).toBe(0.9);
    });

    it('MPLUT-111: applyRenderState with lookLUT sets Look LUT state', () => {
      const rs = createDefaultRenderState();
      const data = createTestLUT3D(4);
      rs.lookLUT = {
        data,
        size: 4,
        intensity: 0.8,
        domainMin: [-0.1, -0.1, -0.1],
        domainMax: [1.5, 1.5, 1.5],
      };
      mgr.applyRenderState(rs);

      const state = mgr.getInternalState();
      expect(state.lut3DEnabled).toBe(true);
      expect(state.lut3DSize).toBe(4);
      expect(state.lookLUT3DDomainMin).toEqual([-0.1, -0.1, -0.1]);
    });

    it('MPLUT-112: applyRenderState with displayLUT sets Display LUT state', () => {
      const rs = createDefaultRenderState();
      const data = createTestLUT3D();
      rs.displayLUT = {
        data,
        size: 2,
        intensity: 0.6,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
      };
      mgr.applyRenderState(rs);

      const state = mgr.getInternalState();
      expect(state.displayLUT3DEnabled).toBe(true);
      expect(state.displayLUT3DIntensity).toBe(0.6);
    });

    it('MPLUT-113: applyRenderState without fileLUT clears previously set File LUT', () => {
      // First enable
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.getInternalState().fileLUT3DEnabled).toBe(true);

      // Apply state without fileLUT
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);

      expect(mgr.getInternalState().fileLUT3DEnabled).toBe(false);
    });

    it('MPLUT-114: applyRenderState without displayLUT clears previously set Display LUT', () => {
      // First enable
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.getInternalState().displayLUT3DEnabled).toBe(true);

      // Apply state without displayLUT
      const rs = createDefaultRenderState();
      mgr.applyRenderState(rs);

      expect(mgr.getInternalState().displayLUT3DEnabled).toBe(false);
    });

    it('MPLUT-115: applyRenderState with legacy lut field still works', () => {
      const rs = createDefaultRenderState();
      const data = createTestLUT3D();
      rs.lut = { data, size: 2, intensity: 0.5 };
      mgr.applyRenderState(rs);

      const state = mgr.getInternalState();
      expect(state.lut3DEnabled).toBe(true);
      expect(state.lut3DIntensity).toBe(0.5);
    });

    it('MPLUT-116: applyRenderState with lookLUT takes priority over legacy lut', () => {
      const rs = createDefaultRenderState();
      const lookData = createTestLUT3D(4);
      rs.lookLUT = {
        data: lookData,
        size: 4,
        intensity: 0.8,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
      };
      // Legacy lut also set (should be ignored when lookLUT is present)
      rs.lut = { data: createTestLUT3D(), size: 2, intensity: 0.1 };
      mgr.applyRenderState(rs);

      const state = mgr.getInternalState();
      expect(state.lut3DSize).toBe(4);
      expect(state.lut3DIntensity).toBe(0.8);
    });

    it('MPLUT-117: applyRenderState marks dirty flags for new LUT fields', () => {
      const flags = mgr.getDirtyFlags() as Set<string>;
      flags.clear();

      const rs = createDefaultRenderState();
      rs.fileLUT = { data: createTestLUT3D(), size: 2, intensity: 1.0, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
      rs.displayLUT = { data: createTestLUT3D(), size: 2, intensity: 1.0, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
      mgr.applyRenderState(rs);

      expect(flags.has(DIRTY_FILE_LUT3D)).toBe(true);
      expect(flags.has(DIRTY_DISPLAY_LUT3D)).toBe(true);
    });
  });

  // =================================================================
  // 13. Default state
  // =================================================================

  describe('Default state', () => {
    it('MPLUT-120: File LUT is disabled by default', () => {
      const state = mgr.getInternalState();
      expect(state.fileLUT3DEnabled).toBe(false);
      expect(state.fileLUT3DData).toBeNull();
      expect(state.fileLUT3DSize).toBe(0);
      expect(state.fileLUT3DIntensity).toBe(1.0);
    });

    it('MPLUT-121: Display LUT is disabled by default', () => {
      const state = mgr.getInternalState();
      expect(state.displayLUT3DEnabled).toBe(false);
      expect(state.displayLUT3DData).toBeNull();
      expect(state.displayLUT3DSize).toBe(0);
      expect(state.displayLUT3DIntensity).toBe(1.0);
    });

    it('MPLUT-122: Look LUT domain defaults to [0,0,0]-[1,1,1]', () => {
      const state = mgr.getInternalState();
      expect(state.lookLUT3DDomainMin).toEqual([0, 0, 0]);
      expect(state.lookLUT3DDomainMax).toEqual([1, 1, 1]);
    });

    it('MPLUT-123: File LUT domain defaults to [0,0,0]-[1,1,1]', () => {
      const state = mgr.getInternalState();
      expect(state.fileLUT3DDomainMin).toEqual([0, 0, 0]);
      expect(state.fileLUT3DDomainMax).toEqual([1, 1, 1]);
    });

    it('MPLUT-124: Display LUT domain defaults to [0,0,0]-[1,1,1]', () => {
      const state = mgr.getInternalState();
      expect(state.displayLUT3DDomainMin).toEqual([0, 0, 0]);
      expect(state.displayLUT3DDomainMax).toEqual([1, 1, 1]);
    });
  });

  // =================================================================
  // 14. bake1DTo3D utility
  // =================================================================

  describe('bake1DTo3D', () => {
    it('MPLUT-130: bake1DTo3D produces correct output size', () => {
      // Simple identity 1D LUT: 4 entries, interleaved RGB
      const lut1D = new Float32Array([0, 0, 0, 0.333, 0.333, 0.333, 0.667, 0.667, 0.667, 1, 1, 1]);
      const result = bake1DTo3D(lut1D, 4, [0, 0, 0], [1, 1, 1], 4);
      expect(result.size).toBe(4);
      expect(result.data.length).toBe(4 * 4 * 4 * 3);
    });

    it('MPLUT-131: bake1DTo3D identity LUT preserves colors', () => {
      // Build a proper identity 1D LUT with 256 entries
      const size1D = 256;
      const lut1D = new Float32Array(size1D * 3);
      for (let i = 0; i < size1D; i++) {
        const t = i / (size1D - 1);
        lut1D[i * 3 + 0] = t;
        lut1D[i * 3 + 1] = t;
        lut1D[i * 3 + 2] = t;
      }
      const result = bake1DTo3D(lut1D, size1D, [0, 0, 0], [1, 1, 1], 5);
      // Check corners of the 3D LUT
      // (0,0,0) should map to (0,0,0)
      expect(result.data[0]).toBeCloseTo(0, 5);
      expect(result.data[1]).toBeCloseTo(0, 5);
      expect(result.data[2]).toBeCloseTo(0, 5);
      // (4,4,4) in 5^3 = (1,1,1) should map to (1,1,1)
      const maxIdx = (4 * 25 + 4 * 5 + 4) * 3;
      expect(result.data[maxIdx + 0]).toBeCloseTo(1, 5);
      expect(result.data[maxIdx + 1]).toBeCloseTo(1, 5);
      expect(result.data[maxIdx + 2]).toBeCloseTo(1, 5);
    });

    it('MPLUT-132: bake1DTo3D with gamma 2.0 LUT applies channel-independently', () => {
      // Create a 1D LUT that squares input (gamma 2.0)
      const size1D = 256;
      const lut1D = new Float32Array(size1D * 3);
      for (let i = 0; i < size1D; i++) {
        const t = i / (size1D - 1);
        lut1D[i * 3 + 0] = t * t; // R = in^2
        lut1D[i * 3 + 1] = t * t; // G = in^2
        lut1D[i * 3 + 2] = t * t; // B = in^2
      }
      const result = bake1DTo3D(lut1D, size1D, [0, 0, 0], [1, 1, 1], 5);
      // Check midpoint: r=2, g=2, b=2 -> normalized 0.5
      // Expected: 0.5^2 = 0.25
      const midIdx = (2 * 25 + 2 * 5 + 2) * 3;
      expect(result.data[midIdx + 0]).toBeCloseTo(0.25, 2);
      expect(result.data[midIdx + 1]).toBeCloseTo(0.25, 2);
      expect(result.data[midIdx + 2]).toBeCloseTo(0.25, 2);
    });

    it('MPLUT-133: bake1DTo3D default output size is 33', () => {
      const lut1D = new Float32Array([0, 0, 0, 1, 1, 1]);
      const result = bake1DTo3D(lut1D, 2);
      expect(result.size).toBe(33);
      expect(result.data.length).toBe(33 * 33 * 33 * 3);
    });

    it('MPLUT-134: bake1DTo3D propagates domain values', () => {
      const lut1D = new Float32Array([0, 0, 0, 1, 1, 1]);
      const result = bake1DTo3D(lut1D, 2, [-0.1, -0.1, -0.1], [1.5, 1.5, 1.5], 4);
      expect(result.domainMin).toEqual([-0.1, -0.1, -0.1]);
      expect(result.domainMax).toEqual([1.5, 1.5, 1.5]);
    });

    it('MPLUT-135: bake1DTo3D with per-channel 1D LUT', () => {
      // R = identity, G = inverted, B = constant 0.5
      const size1D = 256;
      const lut1D = new Float32Array(size1D * 3);
      for (let i = 0; i < size1D; i++) {
        const t = i / (size1D - 1);
        lut1D[i * 3 + 0] = t; // R = identity
        lut1D[i * 3 + 1] = 1 - t; // G = inverted
        lut1D[i * 3 + 2] = 0.5; // B = constant
      }
      const result = bake1DTo3D(lut1D, size1D, [0, 0, 0], [1, 1, 1], 5);
      // Check (r=4, g=0, b=2) -> normalized r=1, g=0, b=0.5
      // Expected: R=1 (identity), G=1(inverted 0), B=0.5(constant)
      const idx = (4 * 25 + 0 * 5 + 2) * 3;
      expect(result.data[idx + 0]).toBeCloseTo(1, 2); // R channel
      expect(result.data[idx + 1]).toBeCloseTo(1, 2); // G channel (1-0 = 1)
      expect(result.data[idx + 2]).toBeCloseTo(0.5, 2); // B channel (constant)
    });
  });

  // =================================================================
  // 15. Intensity blending edge cases
  // =================================================================

  describe('Intensity edge cases', () => {
    it('MPLUT-140: intensity 0 is stored correctly', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 0);
      const state = mgr.getInternalState();
      expect(state.lut3DIntensity).toBe(0);
      expect(state.lut3DEnabled).toBe(true);
    });

    it('MPLUT-141: intensity 1 is stored correctly', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DIntensity).toBe(1);
    });

    it('MPLUT-142: fractional intensity 0.37 is stored correctly', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 0.37);
      const state = mgr.getInternalState();
      expect(state.displayLUT3DIntensity).toBeCloseTo(0.37, 10);
    });
  });

  // =================================================================
  // 16. Size=0 treated as disable
  // =================================================================

  describe('Size zero disable behavior', () => {
    it('MPLUT-150: setFileLUT with size=0 and non-null data disables', () => {
      mgr.setFileLUT(createTestLUT3D(), 0, 1.0);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DEnabled).toBe(false);
    });

    it('MPLUT-151: setLookLUT with size=0 and non-null data disables', () => {
      mgr.setLookLUT(createTestLUT3D(), 0, 1.0);
      const state = mgr.getInternalState();
      expect(state.lut3DEnabled).toBe(false);
    });

    it('MPLUT-152: setDisplayLUT with size=0 and non-null data disables', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 0, 1.0);
      const state = mgr.getInternalState();
      expect(state.displayLUT3DEnabled).toBe(false);
    });
  });

  // =================================================================
  // 17. Domain with per-channel values
  // =================================================================

  describe('Per-channel domain values', () => {
    it('MPLUT-160: Look LUT with asymmetric per-channel domain', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0, [-0.1, 0.0, 0.1], [1.0, 1.2, 1.5]);
      const { uniformCalls, mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(uniformCalls['u_lookLUT3DDomainMin']).toEqual([-0.1, 0.0, 0.1]);
      expect(uniformCalls['u_lookLUT3DDomainMax']).toEqual([1.0, 1.2, 1.5]);
    });

    it('MPLUT-161: File LUT with negative domain', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0, [-1.0, -1.0, -1.0], [2.0, 2.0, 2.0]);
      const state = mgr.getInternalState();
      expect(state.fileLUT3DDomainMin).toEqual([-1.0, -1.0, -1.0]);
      expect(state.fileLUT3DDomainMax).toEqual([2.0, 2.0, 2.0]);
    });
  });

  // =================================================================
  // 18. hasPendingStateChanges
  // =================================================================

  describe('hasPendingStateChanges', () => {
    it('MPLUT-170: setFileLUT marks pending changes', () => {
      // Consume initial dirty flags
      const { mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(mgr.hasPendingStateChanges()).toBe(false);

      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.hasPendingStateChanges()).toBe(true);
    });

    it('MPLUT-171: setDisplayLUT marks pending changes', () => {
      const { mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(mgr.hasPendingStateChanges()).toBe(false);

      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.hasPendingStateChanges()).toBe(true);
    });

    it('MPLUT-172: applyUniforms clears pending state changes', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      expect(mgr.hasPendingStateChanges()).toBe(true);

      const { mockShader, mockTexCb } = createMockShaderAndTexCb();
      mgr.applyUniforms(mockShader, mockTexCb);
      expect(mgr.hasPendingStateChanges()).toBe(false);
    });
  });

  // =================================================================
  // 19. dispose
  // =================================================================

  describe('dispose', () => {
    it('MPLUT-180: dispose clears File LUT data', () => {
      mgr.setFileLUT(createTestLUT3D(), 2, 1.0);
      mgr.dispose();
      const state = mgr.getInternalState();
      expect(state.fileLUT3DData).toBeNull();
    });

    it('MPLUT-181: dispose clears Display LUT data', () => {
      mgr.setDisplayLUT(createTestLUT3D(), 2, 1.0);
      mgr.dispose();
      const state = mgr.getInternalState();
      expect(state.displayLUT3DData).toBeNull();
    });

    it('MPLUT-182: dispose clears Look LUT data', () => {
      mgr.setLookLUT(createTestLUT3D(), 2, 1.0);
      mgr.dispose();
      const state = mgr.getInternalState();
      expect(state.lut3DData).toBeNull();
    });
  });
});
