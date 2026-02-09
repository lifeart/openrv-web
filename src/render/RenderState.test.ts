/**
 * RenderState + applyRenderState Tests
 *
 * Tests that applyRenderState correctly dispatches to individual setters,
 * and that the RenderState interface properly aggregates all render state.
 */

import { describe, it, expect, vi } from 'vitest';
import type { RenderState } from './RenderState';
import type { RendererBackend } from './RendererBackend';
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

/** Create a mock RendererBackend with spied setter methods */
function createMockRenderer(): RendererBackend {
  return {
    initialize: vi.fn(),
    initAsync: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    resize: vi.fn(),
    clear: vi.fn(),
    renderImage: vi.fn(),
    setColorAdjustments: vi.fn(),
    getColorAdjustments: vi.fn().mockReturnValue({ ...DEFAULT_COLOR_ADJUSTMENTS }),
    resetColorAdjustments: vi.fn(),
    setColorInversion: vi.fn(),
    getColorInversion: vi.fn().mockReturnValue(false),
    setToneMappingState: vi.fn(),
    getToneMappingState: vi.fn().mockReturnValue({ ...DEFAULT_TONE_MAPPING_STATE }),
    resetToneMappingState: vi.fn(),
    setHDROutputMode: vi.fn().mockReturnValue(true),
    getHDROutputMode: vi.fn().mockReturnValue('sdr'),
    createTexture: vi.fn().mockReturnValue(null),
    deleteTexture: vi.fn(),
    getContext: vi.fn().mockReturnValue(null),
    setBackgroundPattern: vi.fn(),
    readPixelFloat: vi.fn().mockReturnValue(null),
    setCDL: vi.fn(),
    setCurvesLUT: vi.fn(),
    setColorWheels: vi.fn(),
    setFalseColor: vi.fn(),
    setZebraStripes: vi.fn(),
    setChannelMode: vi.fn(),
    setLUT: vi.fn(),
    setDisplayColorState: vi.fn(),
    setHighlightsShadows: vi.fn(),
    setVibrance: vi.fn(),
    setClarity: vi.fn(),
    setSharpen: vi.fn(),
    setHSLQualifier: vi.fn(),
    applyRenderState: vi.fn(),
    isShaderReady: vi.fn().mockReturnValue(true),
    renderSDRFrame: vi.fn().mockReturnValue(null),
    getCanvasElement: vi.fn().mockReturnValue(null),
  };
}

/**
 * Standalone applyRenderState implementation for testing the dispatch pattern
 * (mirrors what Renderer.applyRenderState does)
 */
function applyRenderState(renderer: RendererBackend, state: RenderState): void {
  renderer.setColorAdjustments(state.colorAdjustments);
  renderer.setColorInversion(state.colorInversion);
  renderer.setToneMappingState(state.toneMappingState);
  renderer.setBackgroundPattern(state.backgroundPattern);
  renderer.setCDL(state.cdl);
  renderer.setCurvesLUT(state.curvesLUT);
  renderer.setColorWheels(state.colorWheels);
  renderer.setFalseColor(state.falseColor);
  renderer.setZebraStripes(state.zebraStripes);
  renderer.setChannelMode(state.channelMode);
  renderer.setLUT(state.lut.data, state.lut.size, state.lut.intensity);
  renderer.setDisplayColorState(state.displayColor);
  renderer.setHighlightsShadows(state.highlightsShadows);
  renderer.setVibrance({ vibrance: state.vibrance.amount, skinProtection: state.vibrance.skinProtection });
  renderer.setClarity({ clarity: state.clarity });
  renderer.setSharpen({ amount: state.sharpen });
  renderer.setHSLQualifier(state.hslQualifier);
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
    it('calls all 17 setter methods on the renderer', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      applyRenderState(renderer, state);

      expect(renderer.setColorAdjustments).toHaveBeenCalledOnce();
      expect(renderer.setColorInversion).toHaveBeenCalledOnce();
      expect(renderer.setToneMappingState).toHaveBeenCalledOnce();
      expect(renderer.setBackgroundPattern).toHaveBeenCalledOnce();
      expect(renderer.setCDL).toHaveBeenCalledOnce();
      expect(renderer.setCurvesLUT).toHaveBeenCalledOnce();
      expect(renderer.setColorWheels).toHaveBeenCalledOnce();
      expect(renderer.setFalseColor).toHaveBeenCalledOnce();
      expect(renderer.setZebraStripes).toHaveBeenCalledOnce();
      expect(renderer.setChannelMode).toHaveBeenCalledOnce();
      expect(renderer.setLUT).toHaveBeenCalledOnce();
      expect(renderer.setDisplayColorState).toHaveBeenCalledOnce();
      expect(renderer.setHighlightsShadows).toHaveBeenCalledOnce();
      expect(renderer.setVibrance).toHaveBeenCalledOnce();
      expect(renderer.setClarity).toHaveBeenCalledOnce();
      expect(renderer.setSharpen).toHaveBeenCalledOnce();
      expect(renderer.setHSLQualifier).toHaveBeenCalledOnce();
    });

    it('passes color adjustments correctly', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 2.5, gamma: 0.8 };
      applyRenderState(renderer, state);

      expect(renderer.setColorAdjustments).toHaveBeenCalledWith(
        expect.objectContaining({ exposure: 2.5, gamma: 0.8 }),
      );
    });

    it('passes color inversion correctly', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.colorInversion = true;
      applyRenderState(renderer, state);

      expect(renderer.setColorInversion).toHaveBeenCalledWith(true);
    });

    it('passes tone mapping state correctly', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.toneMappingState = { enabled: true, operator: 'aces' };
      applyRenderState(renderer, state);

      expect(renderer.setToneMappingState).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, operator: 'aces' }),
      );
    });

    it('passes false color as state object', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      const lut = new Uint8Array(256 * 3);
      state.falseColor = { enabled: true, lut };
      applyRenderState(renderer, state);

      expect(renderer.setFalseColor).toHaveBeenCalledWith({ enabled: true, lut });
    });

    it('passes LUT as separate arguments', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      const lutData = new Float32Array(17 * 17 * 17 * 3);
      state.lut = { data: lutData, size: 17, intensity: 0.8 };
      applyRenderState(renderer, state);

      expect(renderer.setLUT).toHaveBeenCalledWith(lutData, 17, 0.8);
    });

    it('passes highlights/shadows as state object', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.highlightsShadows = { highlights: 25, shadows: -30, whites: 10, blacks: -5 };
      applyRenderState(renderer, state);

      expect(renderer.setHighlightsShadows).toHaveBeenCalledWith({ highlights: 25, shadows: -30, whites: 10, blacks: -5 });
    });

    it('passes vibrance as state object', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.vibrance = { amount: 50, skinProtection: false };
      applyRenderState(renderer, state);

      expect(renderer.setVibrance).toHaveBeenCalledWith({ vibrance: 50, skinProtection: false });
    });

    it('passes channel mode correctly', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.channelMode = 'red';
      applyRenderState(renderer, state);

      expect(renderer.setChannelMode).toHaveBeenCalledWith('red');
    });

    it('passes clarity as state object', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.clarity = 42;
      applyRenderState(renderer, state);

      expect(renderer.setClarity).toHaveBeenCalledWith({ clarity: 42 });
    });

    it('passes sharpen as state object', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.sharpen = 75;
      applyRenderState(renderer, state);

      expect(renderer.setSharpen).toHaveBeenCalledWith({ amount: 75 });
    });

    it('passes display color config correctly', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.displayColor = { transferFunction: 1, displayGamma: 2.4, displayBrightness: 1.2, customGamma: 2.6 };
      applyRenderState(renderer, state);

      expect(renderer.setDisplayColorState).toHaveBeenCalledWith({
        transferFunction: 1,
        displayGamma: 2.4,
        displayBrightness: 1.2,
        customGamma: 2.6,
      });
    });
  });

  describe('HDR override pattern', () => {
    it('supports mutating state for HDR overrides before applying', () => {
      const renderer = createMockRenderer();
      const state = createDefaultRenderState();
      state.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.5, gamma: 2.2 };
      state.toneMappingState = { enabled: true, operator: 'aces' };

      // Apply HDR overrides (as Viewer.renderHDRWithWebGL does)
      state.colorAdjustments = { ...state.colorAdjustments, gamma: 1 };
      state.toneMappingState = { enabled: false, operator: 'off' };

      applyRenderState(renderer, state);

      // Gamma should be overridden to 1, but exposure preserved
      expect(renderer.setColorAdjustments).toHaveBeenCalledWith(
        expect.objectContaining({ exposure: 1.5, gamma: 1 }),
      );
      // Tone mapping should be disabled
      expect(renderer.setToneMappingState).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false, operator: 'off' }),
      );
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
