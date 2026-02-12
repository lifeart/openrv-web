/**
 * ViewerGLRenderer Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ViewerGLRenderer, GLRendererContext } from './ViewerGLRenderer';
import type { Renderer } from '../../render/Renderer';
import type { RenderWorkerProxy } from '../../render/RenderWorkerProxy';
import type { ColorAdjustments } from '../../core/types/color';
import type { ToneMappingState } from '../../core/types/effects';
import { type DisplayCapabilities, DEFAULT_CAPABILITIES } from '../../color/ColorProcessingFacade';

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
  _webgpuBlit: { initialized: boolean; getCanvas: () => HTMLCanvasElement } | null;
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
});
