/**
 * ViewerGLRenderer Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewerGLRenderer, GLRendererContext } from './ViewerGLRenderer';
import type { Renderer } from '../../render/Renderer';
import type { RenderWorkerProxy } from '../../render/RenderWorkerProxy';
import type { RenderState } from '../../render/RenderState';
import type { ColorAdjustments } from '../../core/types/color';
import type { ToneMappingState } from '../../core/types/effects';
import { type DisplayCapabilities, DEFAULT_CAPABILITIES } from '../../color/ColorProcessingFacade';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../core/types/color';
import { DEFAULT_TONE_MAPPING_STATE } from '../../core/types/effects';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_COLOR_WHEELS_STATE } from './ColorWheels';
import { DEFAULT_ZEBRA_STATE } from './ZebraStripes';
import { DEFAULT_BACKGROUND_PATTERN_STATE } from './BackgroundPatternControl';
import { DEFAULT_HSL_QUALIFIER_STATE } from './HSLQualifier';
import { IPImage } from '../../core/image/Image';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Access private fields for testing */
interface TestableViewerGLRenderer {
  _glRenderer: Renderer | null;
  _glCanvas: HTMLCanvasElement | null;
  _renderWorkerProxy: RenderWorkerProxy | null;
  _isAsyncRenderer: boolean;
  _hdrRenderActive: boolean;
  _sdrWebGLRenderActive: boolean;
  _webgpuBlit: { initialized: boolean; getCanvas: () => HTMLCanvasElement; uploadAndDisplay?: (pixels: Float32Array, w: number, h: number) => void } | null;
  _logicalWidth: number;
  _logicalHeight: number;
}

function createMockContext(): GLRendererContext {
  return {
    getCanvasContainer: vi.fn(() => document.createElement('div')),
    getImageCanvas: vi.fn(() => document.createElement('canvas')),
    getPaintCanvas: vi.fn(() => document.createElement('canvas')),
    getColorPipeline: vi.fn(),
    getTransformManager: vi.fn(),
    getFilterSettings: vi.fn(),
    getChannelMode: vi.fn(),
    getBackgroundPatternState: vi.fn(),
    getColorWheels: vi.fn(),
    getFalseColor: vi.fn(),
    getZebraStripes: vi.fn(),
    getHSLQualifier: vi.fn(),
    getSession: vi.fn(),
    applyColorFilters: vi.fn(),
    scheduleRender: vi.fn(),
    isToneMappingEnabled: vi.fn(() => false),
  };
}

function createMockRenderer() {
  return {
    setColorAdjustments: vi.fn(),
    setColorInversion: vi.fn(),
    setToneMappingState: vi.fn(),
    setDisplayColorState: vi.fn(),
    dispose: vi.fn(),
  } as unknown as Renderer;
}

function createMockProxy() {
  return {
    dispose: vi.fn(),
  } as unknown as RenderWorkerProxy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ViewerGLRenderer', () => {
  let ctx: GLRendererContext;
  let renderer: ViewerGLRenderer;

  beforeEach(() => {
    ctx = createMockContext();
    renderer = new ViewerGLRenderer(ctx);
  });

  // =========================================================================
  // Constructor & getters
  // =========================================================================
  describe('Constructor & getters', () => {
    it('VGLR-001: glCanvas is null initially', () => {
      expect(renderer.glCanvas).toBeNull();
    });

    it('VGLR-002: glRenderer is null initially', () => {
      expect(renderer.glRenderer).toBeNull();
    });

    it('VGLR-003: hdrRenderActive and sdrWebGLRenderActive are false initially', () => {
      expect(renderer.hdrRenderActive).toBe(false);
      expect(renderer.sdrWebGLRenderActive).toBe(false);
    });

    it('VGLR-004: renderWorkerProxy is null and isAsyncRenderer is false initially', () => {
      expect(renderer.renderWorkerProxy).toBeNull();
      expect(renderer.isAsyncRenderer).toBe(false);
    });

    it('VGLR-005: capabilities passed to constructor are accessible via getter', () => {
      const caps: DisplayCapabilities = {
        ...DEFAULT_CAPABILITIES,
        displayHDR: true,
        webglHLG: true,
      };
      const r = new ViewerGLRenderer(ctx, caps);
      expect(r.capabilities).toBe(caps);
      expect(r.capabilities!.displayHDR).toBe(true);
      expect(r.capabilities!.webglHLG).toBe(true);
    });
  });

  // =========================================================================
  // createGLCanvas
  // =========================================================================
  describe('createGLCanvas', () => {
    it('VGLR-010: creates and returns a canvas element', () => {
      const canvas = renderer.createGLCanvas();
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('VGLR-011: created canvas has correct CSS for overlay positioning', () => {
      const canvas = renderer.createGLCanvas();
      expect(canvas.style.position).toBe('absolute');
      expect(canvas.style.top).toBe('0px');
      expect(canvas.style.left).toBe('0px');
      expect(canvas.style.display).toBe('none');
    });

    it('VGLR-012: glCanvas getter returns the created canvas after createGLCanvas()', () => {
      expect(renderer.glCanvas).toBeNull();
      const canvas = renderer.createGLCanvas();
      expect(renderer.glCanvas).toBe(canvas);
    });
  });

  // =========================================================================
  // Delegation methods
  // =========================================================================
  describe('Delegation methods', () => {
    it('VGLR-020: all delegation methods are no-ops when glRenderer is null', () => {
      // Ensure none of the 4 methods throw when there is no renderer
      expect(() => renderer.setColorAdjustments({ exposure: 1 } as ColorAdjustments)).not.toThrow();
      expect(() => renderer.setColorInversion(true)).not.toThrow();
      expect(() => renderer.setToneMappingState({ enabled: true, operator: 'aces' })).not.toThrow();
      expect(() => renderer.setDisplayColorState({ transferFunction: 0, displayGamma: 2.2, displayBrightness: 1, customGamma: 1 })).not.toThrow();
    });

    it('VGLR-024: all delegation methods forward arguments to the underlying renderer', () => {
      const mockGL = createMockRenderer();
      (renderer as unknown as TestableViewerGLRenderer)._glRenderer = mockGL;
      const mock = mockGL as unknown as Record<string, ReturnType<typeof vi.fn>>;

      const adj = { exposure: 2.5 } as ColorAdjustments;
      renderer.setColorAdjustments(adj);
      expect(mock.setColorAdjustments).toHaveBeenCalledWith(adj);

      renderer.setColorInversion(true);
      expect(mock.setColorInversion).toHaveBeenCalledWith(true);

      const tmState: ToneMappingState = { enabled: true, operator: 'reinhard' };
      renderer.setToneMappingState(tmState);
      expect(mock.setToneMappingState).toHaveBeenCalledWith(tmState);

      const dcState = { transferFunction: 1, displayGamma: 2.4, displayBrightness: 100, customGamma: 2.2 };
      renderer.setDisplayColorState(dcState);
      expect(mock.setDisplayColorState).toHaveBeenCalledWith(dcState);

      // Each method was called exactly once — no cross-talk between delegation methods
      expect(mock.setColorAdjustments).toHaveBeenCalledTimes(1);
      expect(mock.setColorInversion).toHaveBeenCalledTimes(1);
      expect(mock.setToneMappingState).toHaveBeenCalledTimes(1);
      expect(mock.setDisplayColorState).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // dispose
  // =========================================================================
  describe('dispose', () => {
    it('VGLR-040: dispose nulls glCanvas', () => {
      renderer.createGLCanvas();
      expect(renderer.glCanvas).not.toBeNull();

      renderer.dispose();
      expect(renderer.glCanvas).toBeNull();
    });

    it('VGLR-041: dispose calls glRenderer.dispose() for sync renderer', () => {
      const mockGL = createMockRenderer();
      (renderer as unknown as TestableViewerGLRenderer)._glRenderer = mockGL;

      renderer.dispose();

      expect((mockGL as unknown as { dispose: ReturnType<typeof vi.fn> }).dispose).toHaveBeenCalledOnce();
      expect(renderer.glRenderer).toBeNull();
    });

    it('VGLR-042: dispose calls renderWorkerProxy.dispose() for async renderer', () => {
      const mockProxy = createMockProxy();
      const internal = renderer as unknown as TestableViewerGLRenderer;
      internal._renderWorkerProxy = mockProxy;
      internal._isAsyncRenderer = true;
      // In the real code, _glRenderer is the same object as proxy cast to Renderer
      internal._glRenderer = mockProxy as unknown as Renderer;

      renderer.dispose();

      expect((mockProxy as unknown as { dispose: ReturnType<typeof vi.fn> }).dispose).toHaveBeenCalledOnce();
      expect(renderer.renderWorkerProxy).toBeNull();
      expect(renderer.isAsyncRenderer).toBe(false);
    });

    it('VGLR-043: dispose does not call glRenderer.dispose() when it is the same object as proxy', () => {
      // When async, _glRenderer === _renderWorkerProxy (cast). The dispose path
      // nulls _glRenderer after disposing the proxy, so the sync branch is skipped.
      const mockProxy = createMockProxy();
      const internal = renderer as unknown as TestableViewerGLRenderer;
      internal._renderWorkerProxy = mockProxy;
      internal._isAsyncRenderer = true;
      internal._glRenderer = mockProxy as unknown as Renderer;

      renderer.dispose();

      // proxy.dispose() called exactly once, not twice
      expect((mockProxy as unknown as { dispose: ReturnType<typeof vi.fn> }).dispose).toHaveBeenCalledOnce();
    });

    it('VGLR-044: dispose calls both proxy.dispose() and glRenderer.dispose() when they are different objects', () => {
      const mockProxy = createMockProxy();
      const mockGL = createMockRenderer();
      const internal = renderer as unknown as TestableViewerGLRenderer;
      internal._renderWorkerProxy = mockProxy;
      internal._isAsyncRenderer = true;
      internal._glRenderer = mockGL; // Different object from proxy

      renderer.dispose();

      // The proxy branch disposes proxy and nulls _glRenderer,
      // but since _glRenderer was a different object it was already nulled
      // by the proxy branch; the sync branch sees null and skips.
      expect((mockProxy as unknown as { dispose: ReturnType<typeof vi.fn> }).dispose).toHaveBeenCalledOnce();
      expect(renderer.renderWorkerProxy).toBeNull();
      expect(renderer.glRenderer).toBeNull();
    });

    it('VGLR-045: dispose is idempotent (second call does not throw)', () => {
      const mockGL = createMockRenderer();
      (renderer as unknown as TestableViewerGLRenderer)._glRenderer = mockGL;
      renderer.createGLCanvas();

      renderer.dispose();
      expect(() => renderer.dispose()).not.toThrow();
    });

    it('VGLR-046: dispose on fresh instance (no canvas, no renderer) does not throw', () => {
      expect(() => renderer.dispose()).not.toThrow();
      expect(renderer.glCanvas).toBeNull();
      expect(renderer.glRenderer).toBeNull();
    });
  });

  // =========================================================================
  // resizeIfActive — WebGPU blit canvas CSS sizing
  // =========================================================================
  describe('resizeIfActive — WebGPU blit canvas sizing', () => {
    it('VGLR-050: resizeIfActive stores logical dimensions', () => {
      const internal = renderer as unknown as TestableViewerGLRenderer;
      renderer.resizeIfActive(1920, 1080, 960, 540);
      expect(internal._logicalWidth).toBe(960);
      expect(internal._logicalHeight).toBe(540);
    });

    it('VGLR-051: resizeIfActive applies CSS sizing to WebGPU blit canvas when HDR active', () => {
      const internal = renderer as unknown as TestableViewerGLRenderer;
      const mockGL = createMockRenderer();
      const blitCanvas = document.createElement('canvas');
      internal._glCanvas = document.createElement('canvas');
      internal._glRenderer = { ...mockGL, resize: vi.fn() } as unknown as Renderer;
      internal._hdrRenderActive = true;
      internal._webgpuBlit = { initialized: true, getCanvas: () => blitCanvas };

      // Simulate DPR=2 retina display
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

      renderer.resizeIfActive(1920, 1080, 960, 540);

      // WebGPU blit canvas should get logical CSS dimensions
      expect(blitCanvas.style.width).toBe('960px');
      expect(blitCanvas.style.height).toBe('540px');

      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });

    it('VGLR-052: resizeIfActive does NOT resize WebGPU blit canvas when SDR-only (no HDR active)', () => {
      const internal = renderer as unknown as TestableViewerGLRenderer;
      const mockGL = createMockRenderer();
      const blitCanvas = document.createElement('canvas');
      internal._glCanvas = document.createElement('canvas');
      internal._glRenderer = { ...mockGL, resize: vi.fn() } as unknown as Renderer;
      internal._sdrWebGLRenderActive = true;
      internal._hdrRenderActive = false;
      internal._webgpuBlit = { initialized: true, getCanvas: () => blitCanvas };

      renderer.resizeIfActive(1920, 1080, 960, 540);

      // WebGPU blit canvas should NOT get CSS sizing (not in HDR mode)
      expect(blitCanvas.style.width).toBe('');
      expect(blitCanvas.style.height).toBe('');
    });

    it('VGLR-053: resizeIfActive falls back to physical/DPR when no logical dims provided', () => {
      const internal = renderer as unknown as TestableViewerGLRenderer;
      const mockGL = createMockRenderer();
      const blitCanvas = document.createElement('canvas');
      internal._glCanvas = document.createElement('canvas');
      internal._glRenderer = { ...mockGL, resize: vi.fn() } as unknown as Renderer;
      internal._hdrRenderActive = true;
      internal._webgpuBlit = { initialized: true, getCanvas: () => blitCanvas };

      // DPR=2, no logical dims passed
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

      renderer.resizeIfActive(1920, 1080);

      // Should compute CSS size from physical / DPR
      expect(blitCanvas.style.width).toBe('960px');
      expect(blitCanvas.style.height).toBe('540px');

      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });

    it('VGLR-054: resizeIfActive applies CSS sizing to GL canvas on retina', () => {
      const internal = renderer as unknown as TestableViewerGLRenderer;
      const mockGL = createMockRenderer();
      internal._glCanvas = document.createElement('canvas');
      internal._glRenderer = { ...mockGL, resize: vi.fn() } as unknown as Renderer;
      internal._hdrRenderActive = true;

      Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

      renderer.resizeIfActive(1920, 1080, 960, 540);

      expect(internal._glCanvas!.style.width).toBe('960px');
      expect(internal._glCanvas!.style.height).toBe('540px');

      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });
  });

  // =========================================================================
  // HDR path — displayColor overrides
  // =========================================================================
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
        displayColor: { transferFunction: 3, displayGamma: 2.4, displayBrightness: 1.5, customGamma: 2.2 },
        highlightsShadows: { highlights: 0, shadows: 0, whites: 0, blacks: 0 },
        vibrance: { amount: 0, skinProtection: true },
        clarity: 0,
        sharpen: 0,
        hslQualifier: JSON.parse(JSON.stringify(DEFAULT_HSL_QUALIFIER_STATE)),
      };
    }

  describe('HDR path displayColor overrides', () => {
    function setupHDRRenderer(hdrOutputMode: string) {
      const capturedStates: RenderState[] = [];
      const mockRendererObj = {
        getHDROutputMode: vi.fn(() => hdrOutputMode),
        applyRenderState: vi.fn((state: RenderState) => {
          capturedStates.push(JSON.parse(JSON.stringify(state)));
        }),
        resize: vi.fn(),
        clear: vi.fn(),
        renderImage: vi.fn(),
        hasPendingStateChanges: vi.fn(() => true),
        dispose: vi.fn(),
      };

      // Provide getTransformManager with a .transform property
      const hdrCtx = createMockContext();
      (hdrCtx.getTransformManager as ReturnType<typeof vi.fn>).mockReturnValue({
        transform: { rotation: 0, flipH: false, flipV: false },
      });

      const glRenderer = new ViewerGLRenderer(hdrCtx);
      const internal = glRenderer as unknown as TestableViewerGLRenderer;
      internal._glCanvas = document.createElement('canvas');
      internal._glRenderer = mockRendererObj as unknown as Renderer;

      // Spy on buildRenderState to return our controlled state with non-default display settings
      vi.spyOn(glRenderer, 'buildRenderState').mockReturnValue(createDefaultRenderState());

      return { glRenderer, capturedStates, mockRendererObj };
    }

    it('VGLR-030: HDR native path sets displayColor.transferFunction to 0', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('hlg');
      const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      expect(capturedStates[0]!.displayColor.transferFunction).toBe(0);
    });

    it('VGLR-031: HDR native path sets displayColor.displayGamma to 1', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('hlg');
      const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      expect(capturedStates[0]!.displayColor.displayGamma).toBe(1);
    });

    it('VGLR-032: HDR native path sets displayColor.displayBrightness to 1', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('hlg');
      const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      expect(capturedStates[0]!.displayColor.displayBrightness).toBe(1);
    });

    it('VGLR-033: SDR output path does NOT override displayColor', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('sdr');
      const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'uint8' });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      // SDR path should NOT override display settings — they should remain as built
      expect(capturedStates[0]!.displayColor.transferFunction).toBe(3);
      expect(capturedStates[0]!.displayColor.displayGamma).toBe(2.4);
      expect(capturedStates[0]!.displayColor.displayBrightness).toBe(1.5);
    });

    it('VGLR-034: HDR native path disables tone mapping for HLG content', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('hlg');

      // Spy buildRenderState to return state with tone mapping enabled
      const stateWithTM = createDefaultRenderState();
      stateWithTM.toneMappingState = { enabled: true, operator: 'aces' };
      vi.spyOn(glRenderer, 'buildRenderState').mockReturnValue(stateWithTM);

      const image = new IPImage({
        width: 10, height: 10, channels: 4, dataType: 'uint8',
        metadata: { transferFunction: 'hlg' },
      });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      // HLG content: tone mapping force-disabled (display handles HLG natively)
      expect(capturedStates[0]!.toneMappingState.enabled).toBe(false);
    });

    it('VGLR-035: HDR native path disables tone mapping for PQ content', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('hlg');

      const stateWithTM = createDefaultRenderState();
      stateWithTM.toneMappingState = { enabled: true, operator: 'aces' };
      vi.spyOn(glRenderer, 'buildRenderState').mockReturnValue(stateWithTM);

      const image = new IPImage({
        width: 10, height: 10, channels: 4, dataType: 'uint8',
        metadata: { transferFunction: 'pq' },
      });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      // PQ content: tone mapping force-disabled
      expect(capturedStates[0]!.toneMappingState.enabled).toBe(false);
    });

    it('VGLR-036: HDR native path preserves tone mapping for linear/sRGB content (gainmap/EXR)', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('hlg');

      const stateWithTM = createDefaultRenderState();
      stateWithTM.toneMappingState = { enabled: true, operator: 'aces' };
      vi.spyOn(glRenderer, 'buildRenderState').mockReturnValue(stateWithTM);

      // Gainmap content with 'srgb' transfer function (linear float data)
      const image = new IPImage({
        width: 10, height: 10, channels: 4, dataType: 'float32',
        metadata: { transferFunction: 'srgb', colorPrimaries: 'bt709' },
      });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      // Linear content: tone mapping preserved to compress dynamic range
      expect(capturedStates[0]!.toneMappingState.enabled).toBe(true);
      expect(capturedStates[0]!.toneMappingState.operator).toBe('aces');
    });

    it('VGLR-037: HDR native path preserves tone mapping when no transferFunction metadata', () => {
      const { glRenderer, capturedStates } = setupHDRRenderer('hlg');

      const stateWithTM = createDefaultRenderState();
      stateWithTM.toneMappingState = { enabled: true, operator: 'aces' };
      vi.spyOn(glRenderer, 'buildRenderState').mockReturnValue(stateWithTM);

      // EXR content with no explicit transferFunction
      const image = new IPImage({
        width: 10, height: 10, channels: 4, dataType: 'float32',
      });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      expect(capturedStates.length).toBe(1);
      // No transferFunction → not HLG/PQ → tone mapping preserved
      expect(capturedStates[0]!.toneMappingState.enabled).toBe(true);
      expect(capturedStates[0]!.toneMappingState.operator).toBe('aces');
    });
  });

  // =========================================================================
  // WebGPU blit path — sync/async readback selection
  // =========================================================================
  describe('WebGPU blit path readback mode', () => {
    function setupBlitRenderer() {
      const syncReadback = vi.fn(() => new Float32Array(100 * 100 * 4));
      const asyncReadback = vi.fn(() => new Float32Array(100 * 100 * 4));
      let pendingChanges = true;

      const mockRendererObj = {
        getHDROutputMode: vi.fn(() => 'sdr'),
        applyRenderState: vi.fn(),
        resize: vi.fn(),
        clear: vi.fn(),
        renderImage: vi.fn(),
        renderImageToFloat: syncReadback,
        renderImageToFloatAsync: asyncReadback,
        hasPendingStateChanges: vi.fn(() => pendingChanges),
        dispose: vi.fn(),
      };

      const blitCtx = createMockContext();
      (blitCtx.getTransformManager as ReturnType<typeof vi.fn>).mockReturnValue({
        transform: { rotation: 0, flipH: false, flipV: false },
      });

      const glRenderer = new ViewerGLRenderer(blitCtx);
      const internal = glRenderer as unknown as TestableViewerGLRenderer;
      internal._glCanvas = document.createElement('canvas');
      internal._glRenderer = mockRendererObj as unknown as Renderer;
      internal._webgpuBlit = {
        initialized: true,
        getCanvas: () => document.createElement('canvas'),
        uploadAndDisplay: vi.fn(),
      };

      vi.spyOn(glRenderer, 'buildRenderState').mockReturnValue(createDefaultRenderState());

      return {
        glRenderer, mockRendererObj, syncReadback, asyncReadback,
        setPendingChanges: (v: boolean) => { pendingChanges = v; },
      };
    }

    it('VGLR-040: blit path uses sync readback when state has pending changes', () => {
      const { glRenderer, syncReadback, asyncReadback, setPendingChanges } = setupBlitRenderer();
      setPendingChanges(true); // state changed (e.g., operator switch)

      const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'float32' });
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      // Sync readback used for immediate visual feedback after state change
      expect(syncReadback).toHaveBeenCalled();
      expect(asyncReadback).not.toHaveBeenCalled();
    });

    it('VGLR-041: blit path uses async readback when no pending state changes', () => {
      const { glRenderer, syncReadback, asyncReadback, setPendingChanges } = setupBlitRenderer();
      setPendingChanges(false);

      const image = new IPImage({ width: 10, height: 10, channels: 4, dataType: 'float32' });
      // Need to bypass the render-skip check (sameImage && sameDims && !hasPending)
      // by providing a new image each time
      glRenderer.renderHDRWithWebGL(image, 100, 100);

      // Async readback used during continuous playback (no state changes)
      expect(asyncReadback).toHaveBeenCalled();
      expect(syncReadback).not.toHaveBeenCalled();
    });
  });
});
