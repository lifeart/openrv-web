/**
 * ColorPipelineManager Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { ColorPipelineManager } from './ColorPipelineManager';
import { DEFAULT_COLOR_ADJUSTMENTS, ColorAdjustments } from './ColorControls';
import {
  DEFAULT_CDL,
  type CDLValues,
  createDefaultCurvesData,
  type ColorCurvesData,
  DEFAULT_DISPLAY_COLOR_STATE,
  type DisplayColorState,
  type LUT3D,
} from '../../color/ColorProcessingFacade';
import { DEFAULT_TONE_MAPPING_STATE, ToneMappingState } from './ToneMappingControl';

/** Helper: create a minimal LUT3D for testing */
function createMockLUT(title = 'TestLUT'): LUT3D {
  const size = 2;
  return {
    title,
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: new Float32Array(size * size * size * 3),
  };
}

describe('ColorPipelineManager', () => {
  // ===========================================================================
  // Color Adjustments
  // ===========================================================================
  describe('Color Adjustments', () => {
    it('CPM-U001: getColorAdjustments() returns a copy, not a reference', () => {
      const manager = new ColorPipelineManager();
      const a = manager.getColorAdjustments();
      const b = manager.getColorAdjustments();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it('CPM-U002: setColorAdjustments() stores a copy of the input', () => {
      const manager = new ColorPipelineManager();
      const adjustments: ColorAdjustments = {
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 2.5,
        gamma: 1.8,
      };
      manager.setColorAdjustments(adjustments);

      // Mutating original should not affect stored state
      adjustments.exposure = -1;
      expect(manager.getColorAdjustments().exposure).toBe(2.5);
    });

    it('CPM-U003: resetColorAdjustments() restores defaults', () => {
      const manager = new ColorPipelineManager();
      manager.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 3.0,
        saturation: 0.5,
      });
      manager.resetColorAdjustments();
      expect(manager.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('CPM-U004: colorAdjustments getter returns current state', () => {
      const manager = new ColorPipelineManager();
      manager.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        brightness: 0.7,
      });
      expect(manager.colorAdjustments.brightness).toBe(0.7);
    });

    it('CPM-U005: initial colorAdjustments equal DEFAULT_COLOR_ADJUSTMENTS', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });
  });

  // ===========================================================================
  // Color Inversion
  // ===========================================================================
  describe('Color Inversion', () => {
    it('CPM-U006: setColorInversion(true) returns true (changed)', () => {
      const manager = new ColorPipelineManager();
      expect(manager.setColorInversion(true)).toBe(true);
    });

    it('CPM-U007: setColorInversion(same_value) returns false (no change)', () => {
      const manager = new ColorPipelineManager();
      // Initially false, setting false again should return false
      expect(manager.setColorInversion(false)).toBe(false);
    });

    it('CPM-U008: setColorInversion(true) then setColorInversion(true) returns false', () => {
      const manager = new ColorPipelineManager();
      manager.setColorInversion(true);
      expect(manager.setColorInversion(true)).toBe(false);
    });

    it('CPM-U009: getColorInversion() returns current state', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getColorInversion()).toBe(false);
      manager.setColorInversion(true);
      expect(manager.getColorInversion()).toBe(true);
    });

    it('CPM-U010: colorInversionEnabled getter reflects state', () => {
      const manager = new ColorPipelineManager();
      expect(manager.colorInversionEnabled).toBe(false);
      manager.setColorInversion(true);
      expect(manager.colorInversionEnabled).toBe(true);
    });
  });

  // ===========================================================================
  // LUT Management
  // ===========================================================================
  describe('LUT Management', () => {
    it('CPM-U011: initial LUT is null', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getLUT()).toBeNull();
    });

    it('CPM-U012: initial lutIntensity is 1.0', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getLUTIntensity()).toBe(1.0);
    });

    it('CPM-U013: setLUT(lut) stores the LUT', () => {
      const manager = new ColorPipelineManager();
      const lut = createMockLUT();
      manager.setLUT(lut);
      expect(manager.getLUT()).toBe(lut);
    });

    it('CPM-U014: setLUT(null) clears the LUT', () => {
      const manager = new ColorPipelineManager();
      manager.setLUT(createMockLUT());
      manager.setLUT(null);
      expect(manager.getLUT()).toBeNull();
    });

    it('CPM-U015: getLUT() returns the current LUT reference', () => {
      const manager = new ColorPipelineManager();
      const lut = createMockLUT('MyLUT');
      manager.setLUT(lut);
      expect(manager.getLUT()!.title).toBe('MyLUT');
    });

    it('CPM-U016: setLUTIntensity() clamps to [0, 1] - above 1', () => {
      const manager = new ColorPipelineManager();
      manager.setLUTIntensity(1.5);
      expect(manager.getLUTIntensity()).toBe(1.0);
    });

    it('CPM-U017: setLUTIntensity() clamps to [0, 1] - below 0', () => {
      const manager = new ColorPipelineManager();
      manager.setLUTIntensity(-0.5);
      expect(manager.getLUTIntensity()).toBe(0);
    });

    it('CPM-U018: setLUTIntensity() accepts values within [0, 1]', () => {
      const manager = new ColorPipelineManager();
      manager.setLUTIntensity(0.75);
      expect(manager.getLUTIntensity()).toBe(0.75);
    });

    it('CPM-U019: setLUTIntensity(0) sets intensity to zero', () => {
      const manager = new ColorPipelineManager();
      manager.setLUTIntensity(0);
      expect(manager.getLUTIntensity()).toBe(0);
    });

    it('CPM-U020: currentLUT getter returns current LUT', () => {
      const manager = new ColorPipelineManager();
      const lut = createMockLUT();
      manager.setLUT(lut);
      expect(manager.currentLUT).toBe(lut);
    });

    it('CPM-U021: lutIntensity getter returns current intensity', () => {
      const manager = new ColorPipelineManager();
      manager.setLUTIntensity(0.3);
      expect(manager.lutIntensity).toBe(0.3);
    });

    it('CPM-U022: lutProcessor is null without WebGL init', () => {
      const manager = new ColorPipelineManager();
      expect(manager.lutProcessor).toBeNull();
    });
  });

  // ===========================================================================
  // CDL
  // ===========================================================================
  describe('CDL', () => {
    it('CPM-U023: initial CDL equals DEFAULT_CDL', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getCDL()).toEqual(DEFAULT_CDL);
    });

    it('CPM-U024: setCDL() stores a deep copy', () => {
      const manager = new ColorPipelineManager();
      const cdl: CDLValues = {
        slope: { r: 1.2, g: 0.9, b: 1.1 },
        offset: { r: 0.01, g: -0.02, b: 0.03 },
        power: { r: 1.0, g: 1.0, b: 1.0 },
        saturation: 1.2,
      };
      manager.setCDL(cdl);

      // Mutating original should not affect internal state
      cdl.slope.r = 999;
      expect(manager.getCDL().slope.r).toBe(1.2);
    });

    it('CPM-U025: getCDL() returns a deep copy (mutation does not affect internal state)', () => {
      const manager = new ColorPipelineManager();
      const cdl: CDLValues = {
        slope: { r: 1.5, g: 1.5, b: 1.5 },
        offset: { r: 0, g: 0, b: 0 },
        power: { r: 1.0, g: 1.0, b: 1.0 },
        saturation: 1.0,
      };
      manager.setCDL(cdl);

      const retrieved = manager.getCDL();
      retrieved.slope.r = 0;
      expect(manager.getCDL().slope.r).toBe(1.5);
    });

    it('CPM-U026: resetCDL() restores DEFAULT_CDL', () => {
      const manager = new ColorPipelineManager();
      manager.setCDL({
        slope: { r: 2.0, g: 2.0, b: 2.0 },
        offset: { r: 0.1, g: 0.1, b: 0.1 },
        power: { r: 0.8, g: 0.8, b: 0.8 },
        saturation: 0.5,
      });
      manager.resetCDL();
      expect(manager.getCDL()).toEqual(DEFAULT_CDL);
    });

    it('CPM-U027: cdlValues getter returns internal reference', () => {
      const manager = new ColorPipelineManager();
      manager.setCDL({
        slope: { r: 1.3, g: 1.3, b: 1.3 },
        offset: { r: 0, g: 0, b: 0 },
        power: { r: 1, g: 1, b: 1 },
        saturation: 0.9,
      });
      expect(manager.cdlValues.saturation).toBe(0.9);
    });
  });

  // ===========================================================================
  // Curves
  // ===========================================================================
  describe('Curves', () => {
    it('CPM-U028: initial curves equal default curves data', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getCurves()).toEqual(createDefaultCurvesData());
    });

    it('CPM-U029: setCurves() stores a deep copy with point arrays', () => {
      const manager = new ColorPipelineManager();
      const curves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }] },
        red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        blue: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      };
      manager.setCurves(curves);

      // Mutate original points array
      curves.master.points.push({ x: 0.75, y: 0.8 });
      // The stored curves should not be affected
      expect(manager.getCurves().master.points).toHaveLength(3);
    });

    it('CPM-U030: getCurves() returns a deep copy', () => {
      const manager = new ColorPipelineManager();
      const curves: ColorCurvesData = {
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }] },
        red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      };
      manager.setCurves(curves);

      const retrieved = manager.getCurves();
      retrieved.master.points.push({ x: 0.25, y: 0.3 });
      expect(manager.getCurves().master.points).toHaveLength(3);
    });

    it('CPM-U031: resetCurves() restores defaults', () => {
      const manager = new ColorPipelineManager();
      manager.setCurves({
        master: { enabled: true, points: [{ x: 0, y: 0.1 }, { x: 1, y: 0.9 }] },
        red: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        green: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        blue: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      });
      manager.resetCurves();
      expect(manager.getCurves()).toEqual(createDefaultCurvesData());
    });

    it('CPM-U032: setCurves() preserves enabled flag per channel', () => {
      const manager = new ColorPipelineManager();
      manager.setCurves({
        master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        red: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        blue: { enabled: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      });
      const result = manager.getCurves();
      expect(result.master.enabled).toBe(true);
      expect(result.red.enabled).toBe(false);
      expect(result.green.enabled).toBe(true);
      expect(result.blue.enabled).toBe(false);
    });

    it('CPM-U033: curvesData getter returns internal reference', () => {
      const manager = new ColorPipelineManager();
      expect(manager.curvesData).toBeDefined();
      expect(manager.curvesData.master).toBeDefined();
    });

    it('CPM-U034: curveLUTCache getter is available', () => {
      const manager = new ColorPipelineManager();
      expect(manager.curveLUTCache).toBeDefined();
    });
  });

  // ===========================================================================
  // Tone Mapping
  // ===========================================================================
  describe('Tone Mapping', () => {
    it('CPM-U035: initial tone mapping state equals DEFAULT_TONE_MAPPING_STATE', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getToneMappingState()).toEqual(DEFAULT_TONE_MAPPING_STATE);
    });

    it('CPM-U036: setToneMappingState() stores a copy', () => {
      const manager = new ColorPipelineManager();
      const state: ToneMappingState = {
        enabled: true,
        operator: 'aces',
      };
      manager.setToneMappingState(state);

      // Mutate original
      state.operator = 'filmic';
      expect(manager.getToneMappingState().operator).toBe('aces');
    });

    it('CPM-U037: getToneMappingState() returns a copy', () => {
      const manager = new ColorPipelineManager();
      manager.setToneMappingState({ enabled: true, operator: 'reinhard', reinhardWhitePoint: 5.0 });
      const retrieved = manager.getToneMappingState();
      retrieved.operator = 'off';
      expect(manager.getToneMappingState().operator).toBe('reinhard');
    });

    it('CPM-U038: resetToneMappingState() restores defaults', () => {
      const manager = new ColorPipelineManager();
      manager.setToneMappingState({ enabled: true, operator: 'filmic' });
      manager.resetToneMappingState();
      expect(manager.getToneMappingState()).toEqual(DEFAULT_TONE_MAPPING_STATE);
    });

    it('CPM-U039: isToneMappingEnabled() checks both enabled flag and operator', () => {
      const manager = new ColorPipelineManager();
      // Default: enabled=false, operator='off' -> not enabled
      expect(manager.isToneMappingEnabled()).toBe(false);
    });

    it('CPM-U040: isToneMappingEnabled() returns true when enabled=true and operator is not off', () => {
      const manager = new ColorPipelineManager();
      manager.setToneMappingState({ enabled: true, operator: 'aces' });
      expect(manager.isToneMappingEnabled()).toBe(true);
    });

    it('CPM-U041: isToneMappingEnabled() returns false when enabled=true but operator=off', () => {
      const manager = new ColorPipelineManager();
      manager.setToneMappingState({ enabled: true, operator: 'off' });
      expect(manager.isToneMappingEnabled()).toBe(false);
    });

    it('CPM-U042: isToneMappingEnabled() returns false when enabled=false and operator=aces', () => {
      const manager = new ColorPipelineManager();
      manager.setToneMappingState({ enabled: false, operator: 'aces' });
      expect(manager.isToneMappingEnabled()).toBe(false);
    });

    it('CPM-U043: toneMappingState getter returns internal reference', () => {
      const manager = new ColorPipelineManager();
      manager.setToneMappingState({ enabled: true, operator: 'reinhard' });
      expect(manager.toneMappingState.operator).toBe('reinhard');
    });
  });

  // ===========================================================================
  // Display Color
  // ===========================================================================
  describe('Display Color', () => {
    it('CPM-U044: initial display color state equals DEFAULT_DISPLAY_COLOR_STATE', () => {
      const manager = new ColorPipelineManager();
      expect(manager.getDisplayColorState()).toEqual(DEFAULT_DISPLAY_COLOR_STATE);
    });

    it('CPM-U045: setDisplayColorState() stores a copy', () => {
      const manager = new ColorPipelineManager();
      const state: DisplayColorState = {
        transferFunction: 'rec709',
        displayGamma: 2.2,
        displayBrightness: 1.5,
        customGamma: 2.4,
      };
      manager.setDisplayColorState(state);

      // Mutate original
      state.displayGamma = 0.5;
      expect(manager.getDisplayColorState().displayGamma).toBe(2.2);
    });

    it('CPM-U046: getDisplayColorState() returns a copy', () => {
      const manager = new ColorPipelineManager();
      manager.setDisplayColorState({
        transferFunction: 'gamma2.4',
        displayGamma: 1.0,
        displayBrightness: 1.0,
        customGamma: 2.2,
      });
      const retrieved = manager.getDisplayColorState();
      retrieved.transferFunction = 'linear';
      expect(manager.getDisplayColorState().transferFunction).toBe('gamma2.4');
    });

    it('CPM-U047: resetDisplayColorState() restores defaults', () => {
      const manager = new ColorPipelineManager();
      manager.setDisplayColorState({
        transferFunction: 'custom',
        displayGamma: 3.0,
        displayBrightness: 0.5,
        customGamma: 3.5,
      });
      manager.resetDisplayColorState();
      expect(manager.getDisplayColorState()).toEqual(DEFAULT_DISPLAY_COLOR_STATE);
    });

    it('CPM-U048: displayColorState getter returns internal reference', () => {
      const manager = new ColorPipelineManager();
      manager.setDisplayColorState({
        transferFunction: 'srgb',
        displayGamma: 1.2,
        displayBrightness: 0.8,
        customGamma: 2.2,
      });
      expect(manager.displayColorState.displayGamma).toBe(1.2);
    });
  });

  // ===========================================================================
  // OCIO
  // ===========================================================================
  describe('OCIO', () => {
    it('CPM-U049: initial OCIO is disabled with null LUT', () => {
      const manager = new ColorPipelineManager();
      expect(manager.isOCIOEnabled()).toBe(false);
      expect(manager.ocioEnabled).toBe(false);
      expect(manager.ocioBakedLUT).toBeNull();
    });

    it('CPM-U050: setOCIOBakedLUT(lut, true) enables OCIO', () => {
      const manager = new ColorPipelineManager();
      const lut = createMockLUT('OCIO-LUT');
      manager.setOCIOBakedLUT(lut, true);
      expect(manager.isOCIOEnabled()).toBe(true);
      expect(manager.ocioEnabled).toBe(true);
      expect(manager.ocioBakedLUT).toBe(lut);
    });

    it('CPM-U051: isOCIOEnabled() requires both enabled flag and non-null LUT', () => {
      const manager = new ColorPipelineManager();
      // enabled=true but LUT=null -> not enabled
      manager.setOCIOBakedLUT(null, true);
      expect(manager.isOCIOEnabled()).toBe(false);
      expect(manager.ocioEnabled).toBe(true);
    });

    it('CPM-U052: setOCIOBakedLUT(null, false) disables OCIO', () => {
      const manager = new ColorPipelineManager();
      const lut = createMockLUT();
      manager.setOCIOBakedLUT(lut, true);
      expect(manager.isOCIOEnabled()).toBe(true);

      manager.setOCIOBakedLUT(null, false);
      expect(manager.isOCIOEnabled()).toBe(false);
      expect(manager.ocioEnabled).toBe(false);
      expect(manager.ocioBakedLUT).toBeNull();
    });

    it('CPM-U053: isOCIOEnabled() returns false when LUT is set but enabled is false', () => {
      const manager = new ColorPipelineManager();
      manager.setOCIOBakedLUT(createMockLUT(), false);
      expect(manager.isOCIOEnabled()).toBe(false);
    });

    it('CPM-U054: ocioLUTProcessor is null without WebGL init', () => {
      const manager = new ColorPipelineManager();
      expect(manager.ocioLUTProcessor).toBeNull();
    });
  });

  // ===========================================================================
  // Snapshot
  // ===========================================================================
  describe('Snapshot', () => {
    it('CPM-U055: getColorState() returns complete snapshot with all fields', () => {
      const manager = new ColorPipelineManager();
      const snapshot = manager.getColorState();

      expect(snapshot).toHaveProperty('colorAdjustments');
      expect(snapshot).toHaveProperty('colorInversionEnabled');
      expect(snapshot).toHaveProperty('cdlValues');
      expect(snapshot).toHaveProperty('curvesData');
      expect(snapshot).toHaveProperty('currentLUT');
      expect(snapshot).toHaveProperty('lutIntensity');
      expect(snapshot).toHaveProperty('toneMappingState');
      expect(snapshot).toHaveProperty('displayColorState');
      expect(snapshot).toHaveProperty('ocioEnabled');
      expect(snapshot).toHaveProperty('ocioBakedLUT');
    });

    it('CPM-U056: getColorState() returns deep copies of complex objects', () => {
      const manager = new ColorPipelineManager();
      manager.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 2.0 });
      manager.setCDL({
        slope: { r: 1.5, g: 1.5, b: 1.5 },
        offset: { r: 0, g: 0, b: 0 },
        power: { r: 1, g: 1, b: 1 },
        saturation: 1.0,
      });

      const snapshot = manager.getColorState();

      // Mutating snapshot should not affect internal state
      snapshot.colorAdjustments.exposure = -5;
      snapshot.cdlValues.slope.r = 999;
      snapshot.toneMappingState.operator = 'filmic';
      snapshot.displayColorState.transferFunction = 'linear';
      snapshot.curvesData.master.points.push({ x: 0.5, y: 0.5 });

      expect(manager.getColorAdjustments().exposure).toBe(2.0);
      expect(manager.getCDL().slope.r).toBe(1.5);
      expect(manager.getToneMappingState().operator).toBe('off');
      expect(manager.getDisplayColorState().transferFunction).toBe('srgb');
      expect(manager.getCurves().master.points).toHaveLength(2);
    });

    it('CPM-U057: getColorState() reflects current state after modifications', () => {
      const manager = new ColorPipelineManager();
      manager.setColorInversion(true);
      manager.setLUTIntensity(0.5);
      const lut = createMockLUT();
      manager.setLUT(lut);
      manager.setOCIOBakedLUT(createMockLUT('OCIO'), true);
      manager.setToneMappingState({ enabled: true, operator: 'aces' });

      const snapshot = manager.getColorState();
      expect(snapshot.colorInversionEnabled).toBe(true);
      expect(snapshot.lutIntensity).toBe(0.5);
      expect(snapshot.currentLUT).toBe(lut);
      expect(snapshot.ocioEnabled).toBe(true);
      expect(snapshot.ocioBakedLUT!.title).toBe('OCIO');
      expect(snapshot.toneMappingState.enabled).toBe(true);
      expect(snapshot.toneMappingState.operator).toBe('aces');
    });

    it('CPM-U058: getColorState() snapshot has correct defaults for fresh manager', () => {
      const manager = new ColorPipelineManager();
      const snapshot = manager.getColorState();

      expect(snapshot.colorAdjustments).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
      expect(snapshot.colorInversionEnabled).toBe(false);
      expect(snapshot.cdlValues).toEqual(DEFAULT_CDL);
      expect(snapshot.curvesData).toEqual(createDefaultCurvesData());
      expect(snapshot.currentLUT).toBeNull();
      expect(snapshot.lutIntensity).toBe(1.0);
      expect(snapshot.toneMappingState).toEqual(DEFAULT_TONE_MAPPING_STATE);
      expect(snapshot.displayColorState).toEqual(DEFAULT_DISPLAY_COLOR_STATE);
      expect(snapshot.ocioEnabled).toBe(false);
      expect(snapshot.ocioBakedLUT).toBeNull();
    });
  });

  // ===========================================================================
  // Dispose
  // ===========================================================================
  describe('Dispose', () => {
    it('CPM-U059: dispose() sets processors to null', () => {
      const manager = new ColorPipelineManager();
      manager.dispose();
      expect(manager.lutProcessor).toBeNull();
      expect(manager.gpuLUTChain).toBeNull();
      expect(manager.ocioLUTProcessor).toBeNull();
    });

    it('CPM-U060: dispose() is safe to call multiple times', () => {
      const manager = new ColorPipelineManager();
      manager.dispose();
      manager.dispose();
      expect(manager.lutProcessor).toBeNull();
      expect(manager.gpuLUTChain).toBeNull();
      expect(manager.ocioLUTProcessor).toBeNull();
    });
  });

  // ===========================================================================
  // Initialization (null paths without WebGL)
  // ===========================================================================
  describe('Initialization (no WebGL)', () => {
    it('CPM-U061: initLUTProcessor() returns null without WebGL', () => {
      const manager = new ColorPipelineManager();
      const result = manager.initLUTProcessor();
      expect(result).toBeNull();
    });

    it('CPM-U062: initGPULUTChain() returns null without WebGL2', () => {
      const manager = new ColorPipelineManager();
      const result = manager.initGPULUTChain();
      expect(result).toBeNull();
    });

    it('CPM-U063: initOCIOProcessor() returns null without WebGL', () => {
      const manager = new ColorPipelineManager();
      const result = manager.initOCIOProcessor();
      expect(result).toBeNull();
    });

    it('CPM-U064: initLUTPipelineDefaults() sets up default source', () => {
      const manager = new ColorPipelineManager();
      // Should not throw
      manager.initLUTPipelineDefaults();
      expect(manager.lutPipeline).toBeDefined();
    });
  });

  // ===========================================================================
  // Multi-point LUT Pipeline
  // ===========================================================================
  describe('Multi-point LUT Pipeline', () => {
    it('CPM-U065: lutPipeline getter returns a LUTPipeline instance', () => {
      const manager = new ColorPipelineManager();
      expect(manager.lutPipeline).toBeDefined();
      expect(manager.getLUTPipeline()).toBeDefined();
    });

    it('CPM-U066: gpuLUTChain is null without WebGL init', () => {
      const manager = new ColorPipelineManager();
      expect(manager.gpuLUTChain).toBeNull();
      expect(manager.getGPULUTChain()).toBeNull();
    });
  });
});
