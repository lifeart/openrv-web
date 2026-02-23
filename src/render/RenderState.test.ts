/**
 * RenderState + applyRenderState Tests
 *
 * Tests that applyRenderState correctly dispatches to individual setters,
 * and that the RenderState interface properly aggregates all render state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RenderState } from './RenderState';
import { ShaderStateManager } from './ShaderStateManager';
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

/**
 * Create a ShaderStateManager primed to default state with dirty flags cleared,
 * so that subsequent applyRenderState calls trigger setters only for changed values.
 */
function createPrimedManager(): ShaderStateManager {
  const mgr = new ShaderStateManager();
  // Apply default state once to seed all internal values
  mgr.applyRenderState(createDefaultRenderState());
  // Clear dirty flags so we can track which setters fire on the next call
  (mgr.getDirtyFlags() as Set<string>).clear();
  return mgr;
}

describe('RenderState', () => {
  describe('createDefaultRenderState', () => {
    it('creates a valid default state', () => {
      const state = createDefaultRenderState();
      expect(state.colorAdjustments.exposure).toBe(0);
      expect(state.colorAdjustments.gamma).toBe(1);
      expect(state.colorInversion).toBe(false);
      expect(state.toneMappingState.enabled).toBe(false);
      expect(state.channelMode).toBe('rgb');
      expect(state.clarity).toBe(0);
      expect(state.sharpen).toBe(0);
    });

    it('has independent copies of nested objects', () => {
      const state1 = createDefaultRenderState();
      const state2 = createDefaultRenderState();
      state1.colorAdjustments.exposure = 1.5;
      expect(state2.colorAdjustments.exposure).toBe(0);
    });

    it('has correct default lut state', () => {
      const state = createDefaultRenderState();
      expect(state.lut.data).toBeNull();
      expect(state.lut.size).toBe(0);
      expect(state.lut.intensity).toBe(0);
    });

    it('has correct default false color state', () => {
      const state = createDefaultRenderState();
      expect(state.falseColor.enabled).toBe(false);
      expect(state.falseColor.lut).toBeNull();
    });

    it('has correct default display color config', () => {
      const state = createDefaultRenderState();
      expect(state.displayColor.transferFunction).toBe(0);
      expect(state.displayColor.displayBrightness).toBe(1);
    });

    it('has correct default highlights/shadows', () => {
      const state = createDefaultRenderState();
      expect(state.highlightsShadows.highlights).toBe(0);
      expect(state.highlightsShadows.shadows).toBe(0);
      expect(state.highlightsShadows.whites).toBe(0);
      expect(state.highlightsShadows.blacks).toBe(0);
    });

    it('has correct default vibrance', () => {
      const state = createDefaultRenderState();
      expect(state.vibrance.amount).toBe(0);
      expect(state.vibrance.skinProtection).toBe(true);
    });
  });

  describe('applyRenderState dispatch', () => {
    let mgr: ShaderStateManager;

    beforeEach(() => {
      mgr = createPrimedManager();
    });

    it('dispatches to all relevant setters when every field changes', () => {
      const spies = {
        setColorAdjustments: vi.spyOn(mgr, 'setColorAdjustments'),
        setColorInversion: vi.spyOn(mgr, 'setColorInversion'),
        setToneMappingState: vi.spyOn(mgr, 'setToneMappingState'),
        setBackgroundPattern: vi.spyOn(mgr, 'setBackgroundPattern'),
        setCDL: vi.spyOn(mgr, 'setCDL'),
        setCurvesLUT: vi.spyOn(mgr, 'setCurvesLUT'),
        setColorWheels: vi.spyOn(mgr, 'setColorWheels'),
        setFalseColor: vi.spyOn(mgr, 'setFalseColor'),
        setZebraStripes: vi.spyOn(mgr, 'setZebraStripes'),
        setChannelMode: vi.spyOn(mgr, 'setChannelMode'),
        setLUT: vi.spyOn(mgr, 'setLUT'),
        setDisplayColorState: vi.spyOn(mgr, 'setDisplayColorState'),
        setHighlightsShadows: vi.spyOn(mgr, 'setHighlightsShadows'),
        setVibrance: vi.spyOn(mgr, 'setVibrance'),
        setClarity: vi.spyOn(mgr, 'setClarity'),
        setSharpen: vi.spyOn(mgr, 'setSharpen'),
        setHSLQualifier: vi.spyOn(mgr, 'setHSLQualifier'),
      };

      // Build a state where every field differs from defaults
      const state = createDefaultRenderState();
      state.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.0 };
      state.colorInversion = true;
      state.toneMappingState = { enabled: true, operator: 'aces' };
      state.backgroundPattern = { ...DEFAULT_BACKGROUND_PATTERN_STATE, pattern: 'checker' };
      state.cdl = { slope: { r: 2, g: 2, b: 2 }, offset: { r: 0.1, g: 0.1, b: 0.1 }, power: { r: 1, g: 1, b: 1 }, saturation: 1 };
      state.curvesLUT = { red: new Uint8Array(256), green: new Uint8Array(256), blue: new Uint8Array(256), master: new Uint8Array(256) };
      state.colorWheels = { lift: { r: 0.1, g: 0, b: 0, y: 0 }, gamma: { r: 0, g: 0, b: 0, y: 0 }, gain: { r: 0, g: 0, b: 0, y: 0 }, master: { r: 0, g: 0, b: 0, y: 0 }, linked: false };
      state.falseColor = { enabled: true, lut: new Uint8Array(256 * 3) };
      state.zebraStripes = { ...DEFAULT_ZEBRA_STATE, enabled: true, highEnabled: true };
      state.channelMode = 'red';
      state.lut = { data: new Float32Array(17 * 17 * 17 * 3), size: 17, intensity: 0.5 };
      state.displayColor = { transferFunction: 1, displayGamma: 2.4, displayBrightness: 1.2, customGamma: 2.6 };
      state.highlightsShadows = { highlights: 25, shadows: -30, whites: 10, blacks: -5 };
      state.vibrance = { amount: 50, skinProtection: false };
      state.clarity = 42;
      state.sharpen = 75;
      state.hslQualifier = { ...JSON.parse(JSON.stringify(DEFAULT_HSL_QUALIFIER_STATE)), enabled: true };

      mgr.applyRenderState(state);

      expect(spies.setColorAdjustments).toHaveBeenCalledOnce();
      expect(spies.setColorInversion).toHaveBeenCalledOnce();
      expect(spies.setToneMappingState).toHaveBeenCalledOnce();
      expect(spies.setBackgroundPattern).toHaveBeenCalledOnce();
      expect(spies.setCDL).toHaveBeenCalledOnce();
      expect(spies.setCurvesLUT).toHaveBeenCalledOnce();
      expect(spies.setColorWheels).toHaveBeenCalledOnce();
      expect(spies.setFalseColor).toHaveBeenCalledOnce();
      expect(spies.setZebraStripes).toHaveBeenCalledOnce();
      expect(spies.setChannelMode).toHaveBeenCalledOnce();
      expect(spies.setLUT).toHaveBeenCalledOnce();
      expect(spies.setDisplayColorState).toHaveBeenCalledOnce();
      expect(spies.setHighlightsShadows).toHaveBeenCalledOnce();
      expect(spies.setVibrance).toHaveBeenCalledOnce();
      expect(spies.setClarity).toHaveBeenCalledOnce();
      expect(spies.setSharpen).toHaveBeenCalledOnce();
      expect(spies.setHSLQualifier).toHaveBeenCalledOnce();
    });

    it('passes color adjustments correctly', () => {
      const spy = vi.spyOn(mgr, 'setColorAdjustments');
      const state = createDefaultRenderState();
      state.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 2.5, gamma: 0.8 };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ exposure: 2.5, gamma: 0.8 }),
      );
    });

    it('passes color inversion correctly', () => {
      const spy = vi.spyOn(mgr, 'setColorInversion');
      const state = createDefaultRenderState();
      state.colorInversion = true;
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith(true);
    });

    it('passes tone mapping state correctly', () => {
      const spy = vi.spyOn(mgr, 'setToneMappingState');
      const state = createDefaultRenderState();
      state.toneMappingState = { enabled: true, operator: 'aces' };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, operator: 'aces' }),
      );
    });

    it('passes false color as state object', () => {
      const spy = vi.spyOn(mgr, 'setFalseColor');
      const state = createDefaultRenderState();
      const lut = new Uint8Array(256 * 3);
      state.falseColor = { enabled: true, lut };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith({ enabled: true, lut });
    });

    it('passes LUT as separate arguments', () => {
      const spy = vi.spyOn(mgr, 'setLUT');
      const state = createDefaultRenderState();
      const lutData = new Float32Array(17 * 17 * 17 * 3);
      state.lut = { data: lutData, size: 17, intensity: 0.8 };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith(lutData, 17, 0.8);
    });

    it('passes highlights/shadows as state object', () => {
      const spy = vi.spyOn(mgr, 'setHighlightsShadows');
      const state = createDefaultRenderState();
      state.highlightsShadows = { highlights: 25, shadows: -30, whites: 10, blacks: -5 };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith({ highlights: 25, shadows: -30, whites: 10, blacks: -5 });
    });

    it('passes vibrance as state object', () => {
      const spy = vi.spyOn(mgr, 'setVibrance');
      const state = createDefaultRenderState();
      state.vibrance = { amount: 50, skinProtection: false };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith({ vibrance: 50, skinProtection: false });
    });

    it('passes channel mode correctly', () => {
      const spy = vi.spyOn(mgr, 'setChannelMode');
      const state = createDefaultRenderState();
      state.channelMode = 'red';
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith('red');
    });

    it('passes clarity as state object', () => {
      const spy = vi.spyOn(mgr, 'setClarity');
      const state = createDefaultRenderState();
      state.clarity = 42;
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith({ clarity: 42 });
    });

    it('passes sharpen as state object', () => {
      const spy = vi.spyOn(mgr, 'setSharpen');
      const state = createDefaultRenderState();
      state.sharpen = 75;
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith({ amount: 75 });
    });

    it('passes display color config correctly', () => {
      const spy = vi.spyOn(mgr, 'setDisplayColorState');
      const state = createDefaultRenderState();
      state.displayColor = { transferFunction: 1, displayGamma: 2.4, displayBrightness: 1.2, customGamma: 2.6 };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith({
        transferFunction: 1,
        displayGamma: 2.4,
        displayBrightness: 1.2,
        customGamma: 2.6,
      });
    });
  });

  describe('HDR override pattern', () => {
    it('supports mutating state for HDR overrides before applying', () => {
      const mgr = createPrimedManager();
      const setColorAdj = vi.spyOn(mgr, 'setColorAdjustments');
      const setToneMap = vi.spyOn(mgr, 'setToneMappingState');

      const state = createDefaultRenderState();
      state.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.5, gamma: 2.2 };
      state.toneMappingState = { enabled: true, operator: 'aces' };

      // Apply HDR overrides (as Viewer.renderHDRWithWebGL does):
      // gamma overridden to 1, tone mapping switched to reinhard
      state.colorAdjustments = { ...state.colorAdjustments, gamma: 1 };
      state.toneMappingState = { enabled: true, operator: 'reinhard' };

      mgr.applyRenderState(state);

      // Gamma should be overridden to 1, but exposure preserved
      expect(setColorAdj).toHaveBeenCalledWith(
        expect.objectContaining({ exposure: 1.5, gamma: 1 }),
      );
      // Tone mapping should reflect the final override value
      expect(setToneMap).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, operator: 'reinhard' }),
      );
    });
  });

  describe('gamutMapping forwarding', () => {
    it('calls setGamutMapping when gamutMapping is present in state', () => {
      const mgr = createPrimedManager();
      const spy = vi.spyOn(mgr, 'setGamutMapping');
      const state = createDefaultRenderState();
      state.gamutMapping = { mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb' };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith({
        mode: 'clip', sourceGamut: 'rec2020', targetGamut: 'srgb',
      });
    });

    it('does not call setGamutMapping when gamutMapping is undefined', () => {
      const mgr = createPrimedManager();
      const spy = vi.spyOn(mgr, 'setGamutMapping');
      const state = createDefaultRenderState();
      // gamutMapping is optional and not set in default
      mgr.applyRenderState(state);

      expect(spy).not.toHaveBeenCalled();
    });

    it('passes compress mode gamut mapping correctly', () => {
      const mgr = createPrimedManager();
      const spy = vi.spyOn(mgr, 'setGamutMapping');
      const state = createDefaultRenderState();
      state.gamutMapping = { mode: 'compress', sourceGamut: 'rec2020', targetGamut: 'display-p3' };
      mgr.applyRenderState(state);

      expect(spy).toHaveBeenCalledWith({
        mode: 'compress', sourceGamut: 'rec2020', targetGamut: 'display-p3',
      });
    });
  });

  describe('RenderState interface completeness', () => {
    it('covers all effect state fields', () => {
      const state = createDefaultRenderState();
      const keys = Object.keys(state);
      expect(keys).toContain('colorAdjustments');
      expect(keys).toContain('colorInversion');
      expect(keys).toContain('toneMappingState');
      expect(keys).toContain('backgroundPattern');
      expect(keys).toContain('cdl');
      expect(keys).toContain('curvesLUT');
      expect(keys).toContain('colorWheels');
      expect(keys).toContain('falseColor');
      expect(keys).toContain('zebraStripes');
      expect(keys).toContain('channelMode');
      expect(keys).toContain('lut');
      expect(keys).toContain('displayColor');
      expect(keys).toContain('highlightsShadows');
      expect(keys).toContain('vibrance');
      expect(keys).toContain('clarity');
      expect(keys).toContain('sharpen');
      expect(keys).toContain('hslQualifier');
      expect(keys).toHaveLength(17);
    });
  });
});
