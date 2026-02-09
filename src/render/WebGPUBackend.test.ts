/**
 * WebGPUBackend Tests
 *
 * Tests for the WebGPU rendering backend: initialization guards, state management,
 * HDR output mode, tone mapping fallback, resize, dispose, and applyRenderState.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebGPUBackend } from './WebGPUBackend';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../ui/components/ColorControls';
import { DEFAULT_TONE_MAPPING_STATE } from '../ui/components/ToneMappingControl';
import { DEFAULT_CDL } from '../color/CDL';
import { DEFAULT_COLOR_WHEELS_STATE } from '../ui/components/ColorWheels';
import { DEFAULT_ZEBRA_STATE } from '../ui/components/ZebraStripes';
import { DEFAULT_BACKGROUND_PATTERN_STATE } from '../ui/components/BackgroundPatternControl';
import { DEFAULT_HSL_QUALIFIER_STATE } from '../ui/components/HSLQualifier';
import { DEFAULT_CAPABILITIES } from '../color/DisplayCapabilities';
import type { RenderState } from './RenderState';

// =============================================================================
// Helpers
// =============================================================================

/** Create a mock WGPUCanvasContext */
function createMockGPUContext() {
  return {
    configure: vi.fn(),
    unconfigure: vi.fn(),
  };
}

/** Create a mock WGPUDevice */
function createMockDevice() {
  return {
    destroy: vi.fn(),
  };
}

/** Create a mock WGPUAdapter */
function createMockAdapter(device = createMockDevice()) {
  return {
    requestDevice: vi.fn().mockResolvedValue(device),
  };
}

/** Set up navigator.gpu with a mock adapter */
function setupNavigatorGPU(adapter = createMockAdapter()) {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      },
    },
    writable: true,
    configurable: true,
  });
}

/** Create a canvas that returns a webgpu context */
function createWebGPUCanvas(gpuCtx = createMockGPUContext()) {
  const canvas = document.createElement('canvas');
  const origGetContext = canvas.getContext.bind(canvas);
  canvas.getContext = vi.fn((id: string, ...args: unknown[]) => {
    if (id === 'webgpu') return gpuCtx as unknown as RenderingContext;
    return origGetContext(id, ...args);
  }) as typeof canvas.getContext;
  return canvas;
}

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

// =============================================================================
// Tests
// =============================================================================

describe('WebGPUBackend', () => {
  let savedNavigator: unknown;

  beforeEach(() => {
    savedNavigator = globalThis.navigator;
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: savedNavigator,
      writable: true,
      configurable: true,
    });
  });

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  describe('initialize', () => {
    it('throws when navigator.gpu is not available', () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });
      const backend = new WebGPUBackend();
      const canvas = document.createElement('canvas');
      expect(() => backend.initialize(canvas)).toThrow('WebGPU is not available');
    });

    it('throws when webgpu context cannot be created', () => {
      setupNavigatorGPU();
      const backend = new WebGPUBackend();
      const canvas = document.createElement('canvas');
      // Default canvas.getContext('webgpu') returns null in test env
      expect(() => backend.initialize(canvas)).toThrow('WebGPU canvas context not available');
    });

    it('succeeds when webgpu context is available', () => {
      setupNavigatorGPU();
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas();
      expect(() => backend.initialize(canvas)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Async initialization
  // ---------------------------------------------------------------------------

  describe('initAsync', () => {
    it('throws if initialize() was not called first', async () => {
      const backend = new WebGPUBackend();
      await expect(backend.initAsync()).rejects.toThrow('initialize() must be called first');
    });

    it('throws if adapter is not available', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          gpu: {
            requestAdapter: vi.fn().mockResolvedValue(null),
          },
        },
        writable: true,
        configurable: true,
      });
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas();
      backend.initialize(canvas);
      await expect(backend.initAsync()).rejects.toThrow('WebGPU adapter not available');
    });

    it('configures context with extended tone mapping on success', async () => {
      const gpuCtx = createMockGPUContext();
      const device = createMockDevice();
      setupNavigatorGPU(createMockAdapter(device));
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas(gpuCtx);
      backend.initialize(canvas);
      await backend.initAsync();

      expect(gpuCtx.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'rgba16float',
          colorSpace: 'display-p3',
          toneMapping: { mode: 'extended' },
          alphaMode: 'opaque',
        }),
      );
      expect(backend.hasExtendedToneMapping()).toBe(true);
      expect(backend.getDevice()).toBe(device);
    });

    it('falls back to standard tone mapping when extended throws', async () => {
      const gpuCtx = createMockGPUContext();
      let callCount = 0;
      gpuCtx.configure.mockImplementation((config: { toneMapping?: { mode: string } }) => {
        callCount++;
        if (config.toneMapping?.mode === 'extended') {
          throw new Error('extended not supported');
        }
      });
      setupNavigatorGPU();
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas(gpuCtx);
      backend.initialize(canvas);
      await backend.initAsync();

      expect(callCount).toBe(2);
      expect(backend.hasExtendedToneMapping()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Color adjustments state
  // ---------------------------------------------------------------------------

  describe('color adjustments', () => {
    it('defaults to DEFAULT_COLOR_ADJUSTMENTS', () => {
      const backend = new WebGPUBackend();
      expect(backend.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('setColorAdjustments stores a copy', () => {
      const backend = new WebGPUBackend();
      const adj = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 2.5 };
      backend.setColorAdjustments(adj);
      adj.exposure = 999;
      expect(backend.getColorAdjustments().exposure).toBe(2.5);
    });

    it('getColorAdjustments returns a copy', () => {
      const backend = new WebGPUBackend();
      const a = backend.getColorAdjustments();
      a.exposure = 999;
      expect(backend.getColorAdjustments().exposure).toBe(0);
    });

    it('resetColorAdjustments restores defaults', () => {
      const backend = new WebGPUBackend();
      backend.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 5 });
      backend.resetColorAdjustments();
      expect(backend.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });
  });

  // ---------------------------------------------------------------------------
  // Color inversion
  // ---------------------------------------------------------------------------

  describe('color inversion', () => {
    it('defaults to false', () => {
      const backend = new WebGPUBackend();
      expect(backend.getColorInversion()).toBe(false);
    });

    it('setColorInversion toggles state', () => {
      const backend = new WebGPUBackend();
      backend.setColorInversion(true);
      expect(backend.getColorInversion()).toBe(true);
      backend.setColorInversion(false);
      expect(backend.getColorInversion()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Tone mapping state
  // ---------------------------------------------------------------------------

  describe('tone mapping', () => {
    it('defaults to DEFAULT_TONE_MAPPING_STATE', () => {
      const backend = new WebGPUBackend();
      expect(backend.getToneMappingState()).toEqual(DEFAULT_TONE_MAPPING_STATE);
    });

    it('setToneMappingState stores a copy', () => {
      const backend = new WebGPUBackend();
      const state = { enabled: true, operator: 'aces' as const };
      backend.setToneMappingState(state);
      (state as { enabled: boolean }).enabled = false;
      expect(backend.getToneMappingState().enabled).toBe(true);
    });

    it('resetToneMappingState restores defaults', () => {
      const backend = new WebGPUBackend();
      backend.setToneMappingState({ enabled: true, operator: 'aces' });
      backend.resetToneMappingState();
      expect(backend.getToneMappingState()).toEqual(DEFAULT_TONE_MAPPING_STATE);
    });
  });

  // ---------------------------------------------------------------------------
  // HDR output mode
  // ---------------------------------------------------------------------------

  describe('HDR output mode', () => {
    it('defaults to sdr', () => {
      const backend = new WebGPUBackend();
      expect(backend.getHDROutputMode()).toBe('sdr');
    });

    it('setHDROutputMode changes mode and returns true', () => {
      const backend = new WebGPUBackend();
      const result = backend.setHDROutputMode('hlg', DEFAULT_CAPABILITIES);
      expect(result).toBe(true);
      expect(backend.getHDROutputMode()).toBe('hlg');
    });

    it('supports pq mode', () => {
      const backend = new WebGPUBackend();
      backend.setHDROutputMode('pq', DEFAULT_CAPABILITIES);
      expect(backend.getHDROutputMode()).toBe('pq');
    });
  });

  // ---------------------------------------------------------------------------
  // Texture management stubs
  // ---------------------------------------------------------------------------

  describe('texture stubs', () => {
    it('createTexture returns null', () => {
      const backend = new WebGPUBackend();
      expect(backend.createTexture()).toBeNull();
    });

    it('deleteTexture does not throw', () => {
      const backend = new WebGPUBackend();
      expect(() => backend.deleteTexture(null)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Context access
  // ---------------------------------------------------------------------------

  describe('context', () => {
    it('getContext returns null (no WebGL2)', () => {
      const backend = new WebGPUBackend();
      expect(backend.getContext()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  describe('resize', () => {
    it('does nothing when canvas is not set', () => {
      const backend = new WebGPUBackend();
      expect(() => backend.resize(800, 600)).not.toThrow();
    });

    it('sets canvas width and height', () => {
      setupNavigatorGPU();
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas();
      backend.initialize(canvas);
      backend.resize(1920, 1080);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('cleans up context and device', async () => {
      const gpuCtx = createMockGPUContext();
      const device = createMockDevice();
      setupNavigatorGPU(createMockAdapter(device));
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas(gpuCtx);
      backend.initialize(canvas);
      await backend.initAsync();

      backend.dispose();
      expect(gpuCtx.unconfigure).toHaveBeenCalled();
      expect(device.destroy).toHaveBeenCalled();
      expect(backend.getDevice()).toBeNull();
    });

    it('does not throw when called without initialization', () => {
      const backend = new WebGPUBackend();
      expect(() => backend.dispose()).not.toThrow();
    });

    it('handles unconfigure throwing gracefully', async () => {
      const gpuCtx = createMockGPUContext();
      gpuCtx.unconfigure.mockImplementation(() => {
        throw new Error('context lost');
      });
      setupNavigatorGPU();
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas(gpuCtx);
      backend.initialize(canvas);
      await backend.initAsync();

      expect(() => backend.dispose()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Rendering stubs
  // ---------------------------------------------------------------------------

  describe('rendering stubs', () => {
    it('clear does not throw', () => {
      const backend = new WebGPUBackend();
      expect(() => backend.clear()).not.toThrow();
    });

    it('renderImage does not throw', () => {
      const backend = new WebGPUBackend();
      const image = { width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4), channels: 4 };
      expect(() => backend.renderImage(image as any)).not.toThrow();
    });

    it('renderSDRFrame returns null', () => {
      const backend = new WebGPUBackend();
      const canvas = document.createElement('canvas');
      expect(backend.renderSDRFrame(canvas)).toBeNull();
    });

    it('readPixelFloat returns null', () => {
      const backend = new WebGPUBackend();
      expect(backend.readPixelFloat(0, 0, 1, 1)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Effect setter stubs
  // ---------------------------------------------------------------------------

  describe('effect stubs do not throw', () => {
    let backend: WebGPUBackend;

    beforeEach(() => {
      backend = new WebGPUBackend();
    });

    it('setBackgroundPattern', () => {
      expect(() => backend.setBackgroundPattern(DEFAULT_BACKGROUND_PATTERN_STATE)).not.toThrow();
    });

    it('setCDL', () => {
      expect(() => backend.setCDL(DEFAULT_CDL)).not.toThrow();
    });

    it('setCurvesLUT', () => {
      expect(() => backend.setCurvesLUT(null)).not.toThrow();
    });

    it('setColorWheels', () => {
      expect(() => backend.setColorWheels(DEFAULT_COLOR_WHEELS_STATE)).not.toThrow();
    });

    it('setFalseColor', () => {
      expect(() => backend.setFalseColor(false, null)).not.toThrow();
    });

    it('setZebraStripes', () => {
      expect(() => backend.setZebraStripes(DEFAULT_ZEBRA_STATE)).not.toThrow();
    });

    it('setChannelMode', () => {
      expect(() => backend.setChannelMode('rgb')).not.toThrow();
    });

    it('setLUT', () => {
      expect(() => backend.setLUT(null, 0, 0)).not.toThrow();
    });

    it('setDisplayColorState', () => {
      expect(() => backend.setDisplayColorState({ transferFunction: 0, displayGamma: 0, displayBrightness: 1, customGamma: 2.2 })).not.toThrow();
    });

    it('setHighlightsShadows', () => {
      expect(() => backend.setHighlightsShadows(0, 0, 0, 0)).not.toThrow();
    });

    it('setVibrance', () => {
      expect(() => backend.setVibrance(0, true)).not.toThrow();
    });

    it('setClarity', () => {
      expect(() => backend.setClarity(0)).not.toThrow();
    });

    it('setSharpen', () => {
      expect(() => backend.setSharpen(0)).not.toThrow();
    });

    it('setHSLQualifier', () => {
      expect(() => backend.setHSLQualifier(DEFAULT_HSL_QUALIFIER_STATE)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // applyRenderState
  // ---------------------------------------------------------------------------

  describe('applyRenderState', () => {
    it('applies color adjustments from state', () => {
      const backend = new WebGPUBackend();
      const state = createDefaultRenderState();
      state.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1.5 };
      backend.applyRenderState(state);
      expect(backend.getColorAdjustments().exposure).toBe(1.5);
    });

    it('applies color inversion from state', () => {
      const backend = new WebGPUBackend();
      const state = createDefaultRenderState();
      state.colorInversion = true;
      backend.applyRenderState(state);
      expect(backend.getColorInversion()).toBe(true);
    });

    it('applies tone mapping from state', () => {
      const backend = new WebGPUBackend();
      const state = createDefaultRenderState();
      state.toneMappingState = { enabled: true, operator: 'aces' };
      backend.applyRenderState(state);
      expect(backend.getToneMappingState().enabled).toBe(true);
    });

    it('applies all state fields without throwing', () => {
      const backend = new WebGPUBackend();
      const state = createDefaultRenderState();
      expect(() => backend.applyRenderState(state)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getCanvasElement
  // ---------------------------------------------------------------------------

  describe('getCanvasElement', () => {
    it('returns null when no canvas is set', () => {
      const backend = new WebGPUBackend();
      expect(backend.getCanvasElement()).toBeNull();
    });

    it('returns the canvas when initialized with HTMLCanvasElement', () => {
      setupNavigatorGPU();
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas();
      backend.initialize(canvas);
      expect(backend.getCanvasElement()).toBe(canvas);
    });

    it('returns null after dispose', () => {
      setupNavigatorGPU();
      const backend = new WebGPUBackend();
      const canvas = createWebGPUCanvas();
      backend.initialize(canvas);
      backend.dispose();
      expect(backend.getCanvasElement()).toBeNull();
    });
  });
});
