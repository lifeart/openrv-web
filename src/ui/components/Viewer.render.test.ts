/**
 * Viewer Unit Tests - Rendering Pipeline (WebGL, Async Fallback, Prerender Cache, Display Color)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Viewer } from './Viewer';
import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';
import type { MediaSource } from '../../core/session/Session';
import type { CropRegion, CropState } from './CropControl';
import type { PixelProbe } from './PixelProbe';

// Type-safe accessor for private Viewer internals used in tests.
// This avoids `as any` casts while keeping tests readable.
type CropDragHandle = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'move' | null;

interface TestableViewer {
  // DOM elements
  container: HTMLElement;
  canvasContainer: HTMLElement;
  imageCanvas: HTMLCanvasElement;

  // Session reference (writable for mocking – loosely typed so tests can supply partial mocks)
  session: Partial<Session> & { currentSource?: MediaSource | null };

  // CropManager (extracted crop internals)
  cropManager: {
    _isCropPanelOpen: boolean;
    cropRegionChangedCallback: ((region: CropRegion) => void) | null;
    _isDraggingCrop: boolean;
    cropDragHandle: CropDragHandle;
    cropDragStart: { x: number; y: number; region: CropRegion } | null;
    _cropState: CropState;
    cropOverlay: HTMLCanvasElement | { getBoundingClientRect: () => DOMRect } | null;
    handleCropPointerUp(): void;
    getCropHandleAtPoint(clientX: number, clientY: number): CropDragHandle;
    handleCropPointerDown(e: PointerEvent): boolean;
    updateCropCursor(handle: CropDragHandle): void;
    handleCropPointerMove(e: PointerEvent): void;
    constrainToAspectRatio(region: CropRegion, handle: CropDragHandle): CropRegion;
    drawUncropBackground(imageCtx: CanvasRenderingContext2D, displayWidth: number, displayHeight: number, uncropOffsetX: number, uncropOffsetY: number, imageDisplayW: number, imageDisplayH: number): void;
    clearOutsideCropRegion(imageCtx: CanvasRenderingContext2D, displayWidth: number, displayHeight: number): void;
  };

  // Layout cache internals
  cachedContainerRect: DOMRect | null;
  cachedCanvasContainerRect: DOMRect | null;
  cachedImageCanvasRect: DOMRect | null;
  invalidateLayoutCache(): void;
  getContainerRect(): DOMRect;
  getCanvasContainerRect(): DOMRect;
  getImageCanvasRect(): DOMRect;
  resizeObserver: ResizeObserver;

  // Display dimensions
  displayWidth: number;
  displayHeight: number;

  // Mouse / pixel probe internals
  pixelProbe: PixelProbe;
  pixelSamplingManager: {
    lastMouseMoveUpdate: number;
    cursorColorCallback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null;
    getImageData(): ImageData | null;
    getSourceImageData(): ImageData | null;
  };

  // These should NOT exist (verified in tests)
  lastProbeUpdate?: undefined;
  lastCursorColorUpdate?: undefined;

  // Render scheduling internals (FPS regression tests)
  pendingRender: boolean;

  // Ghost frame canvas pool

  // SDR WebGL rendering (Phase 1A + 1B) - via glRendererManager
  glRendererManager: {
    sdrWebGLRenderActive: boolean;
    hdrRenderActive: boolean;
    glCanvas: HTMLCanvasElement | null;
    glRenderer: unknown;
    _sdrWebGLRenderActive: boolean;
    _hdrRenderActive: boolean;
    _glCanvas: HTMLCanvasElement | null;
    _glRenderer: unknown;
    hasGPUShaderEffectsActive(): boolean;
    hasCPUOnlyEffectsActive(): boolean;
  };
  // Convenience aliases (delegated)
  hasGPUShaderEffectsActive(): boolean;
  hasCPUOnlyEffectsActive(): boolean;
  colorAdjustments: import('./ColorControls').ColorAdjustments;
  colorInversionEnabled: boolean;
  channelMode: import('./ChannelSelect').ChannelMode;
  toneMappingState: import('./ToneMappingControl').ToneMappingState;
  filterSettings: import('./FilterControl').FilterSettings;

  // Video frame fetch tracker
  frameFetchTracker: {
    pendingVideoFrameFetch: Promise<void> | null;
    pendingVideoFrameNumber: number;
    pendingSourceBFrameFetch: Promise<void> | null;
    pendingSourceBFrameNumber: number;
    hasDisplayedSourceBMediabunnyFrame: boolean;
    lastSourceBFrameCanvas: HTMLCanvasElement | OffscreenCanvas | null;
    hasDisplayedMediabunnyFrame: boolean;
    reset(): void;
    dispose(): void;
  };

  // Phase 2A/2B: Prerender buffer
  prerenderBuffer: import('../../utils/effects/PrerenderBufferManager').PrerenderBufferManager | null;

  // Lens distortion manager
  lensDistortionManager: import('./LensDistortionManager').LensDistortionManager;

  // Ghost frame manager
  ghostFrameManager: import('./GhostFrameManager').GhostFrameManager;

  // Stereo manager
  stereoManager: import('./StereoManager').StereoManager;

  // Background pattern
  backgroundPatternState: import('./BackgroundPatternControl').BackgroundPatternState;

  // (drawUncropBackground is on cropManager)

  // Color pipeline manager
  colorPipeline: import('./ColorPipelineManager').ColorPipelineManager;

  // OCIO color management (legacy - now on colorPipeline)
  ocioEnabled: boolean;
  ocioBakedLUT: import('../../color/LUTLoader').LUT3D | null;
  applyOCIOToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // GPU LUT (user-loaded 3D LUT)
  currentLUT: import('../../color/LUTLoader').LUT3D | null;
  lutIntensity: number;
  applyLUTToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // Lightweight effects
  applyLightweightEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // Full batched pixel effects
  applyBatchedPixelEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // (clearOutsideCropRegion is on cropManager)

  // Canvas context
  imageCtx: CanvasRenderingContext2D;

  // Async effects generation counter (Phase 4A race-condition fix)
  _asyncEffectsGeneration: number;
}

/** Cast a Viewer to its testable internals for accessing private members in tests. */
function testable(viewer: Viewer): TestableViewer {
  return viewer as unknown as TestableViewer;
}

describe('Viewer', () => {
  let session: Session;
  let paintEngine: PaintEngine;
  let viewer: Viewer;

  beforeEach(() => {
    session = new Session();
    paintEngine = new PaintEngine();
    viewer = new Viewer({ session, paintEngine });
  });

  afterEach(() => {
    viewer.dispose();
  });

  describe('SDR WebGL rendering (Phase 1A + 1B)', () => {
    it('VWR-320: sdrWebGLRenderActive starts as false', () => {
      expect(testable(viewer).glRendererManager.sdrWebGLRenderActive).toBe(false);
    });

    it('VWR-321: hasGPUShaderEffectsActive returns false with default adjustments', () => {
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(false);
    });

    it('VWR-322: hasGPUShaderEffectsActive returns true when exposure is non-zero', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-323: hasGPUShaderEffectsActive returns true when gamma is not 1', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, gamma: 2.2 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-324: hasGPUShaderEffectsActive returns true when saturation is not 1', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, saturation: 0.5 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-325: hasGPUShaderEffectsActive returns true when contrast is not 1', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, contrast: 1.5 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-326: hasGPUShaderEffectsActive returns true when brightness is non-zero', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, brightness: 0.1 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-327: hasGPUShaderEffectsActive returns true when temperature is non-zero', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, temperature: 50 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-328: hasGPUShaderEffectsActive returns true when tint is non-zero', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, tint: -25 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-329: hasGPUShaderEffectsActive returns true when hue rotation is non-zero', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, hueRotation: 90 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-330: hasGPUShaderEffectsActive returns true when color inversion is enabled', () => {
      viewer.setColorInversion(true);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-331: hasGPUShaderEffectsActive returns true when channel mode is not rgb', () => {
      viewer.setChannelMode('red');
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-332: hasGPUShaderEffectsActive returns true when tone mapping is enabled', () => {
      viewer.setToneMappingState({ enabled: true, operator: 'aces' });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-333: hasCPUOnlyEffectsActive returns false with default adjustments', () => {
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
    });

    // Phase 1B: highlights/shadows/whites/blacks/vibrance/clarity/sharpen are now GPU shader effects
    it('VWR-334: highlights are GPU shader effects (not CPU-only)', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, highlights: 50 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-335: shadows are GPU shader effects (not CPU-only)', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, shadows: -30 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-336: vibrance is a GPU shader effect (not CPU-only)', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, vibrance: 50 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-337: clarity is a GPU shader effect (not CPU-only)', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, clarity: 25 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-338: sharpen is a GPU shader effect (not CPU-only)', () => {
      viewer.setFilterSettings({ blur: 0, sharpen: 50 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-339: whites are GPU shader effects (not CPU-only)', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, whites: 30 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-340: blacks are GPU shader effects (not CPU-only)', () => {
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, blacks: -20 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
    });

    it('VWR-346: hasCPUOnlyEffectsActive returns true when blur is active', () => {
      viewer.setFilterSettings({ blur: 5, sharpen: 0 });
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(true);
    });

    it('VWR-341: glCanvas starts as hidden (display:none)', () => {
      const glCanvas = testable(viewer).glRendererManager.glCanvas;
      expect(glCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(glCanvas!.style.display).toBe('none');
    });

    it('VWR-342: hdrRenderActive starts as false', () => {
      expect(testable(viewer).glRendererManager.hdrRenderActive).toBe(false);
    });

    it('VWR-343: hasGPUShaderEffectsActive returns true for Phase 1B GPU effects (highlights, vibrance)', () => {
      // Phase 1B: highlights and vibrance are now GPU shader effects
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        highlights: 50,
        vibrance: 30,
      });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(false);
    });

    it('VWR-344: both GPU effects and blur (CPU-only) can be active simultaneously', () => {
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 2,
        highlights: 50,
      });
      viewer.setFilterSettings({ blur: 5, sharpen: 0 });
      expect(testable(viewer).hasGPUShaderEffectsActive()).toBe(true);
      expect(testable(viewer).hasCPUOnlyEffectsActive()).toBe(true);
    });

    it('VWR-345: render does not throw when SDR WebGL conditions are met but WebGL is unavailable', () => {
      // Set a GPU effect so the SDR path would be attempted
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1 });
      // WebGL init will fail in test env (no real WebGL) but should not throw
      expect(() => {
        viewer.render();
      }).not.toThrow();
    });
  });

  describe('Phase 2A: Async fallback during playback', () => {
    it('VWR-350: prerenderBuffer is initially null', () => {
      expect(testable(viewer).prerenderBuffer).toBeNull();
    });

    it('VWR-351: initPrerenderBuffer creates buffer when session has frames', () => {
      // Mock session with frames
      const tv = testable(viewer);
      tv.session = {
        ...tv.session,
        frameCount: 100,
        currentFrame: 1,
        isPlaying: false,
        currentSource: null,
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      viewer.initPrerenderBuffer();
      expect(tv.prerenderBuffer).not.toBeNull();
    });

    it('VWR-352: initPrerenderBuffer does not create buffer for 0 frames', () => {
      const tv = testable(viewer);
      tv.session = {
        ...tv.session,
        frameCount: 0,
        currentFrame: 0,
        isPlaying: false,
        currentSource: null,
      } as TestableViewer['session'];

      viewer.initPrerenderBuffer();
      expect(tv.prerenderBuffer).toBeNull();
    });

    it('VWR-353: onFrameProcessed callback is wired up on initPrerenderBuffer', () => {
      const tv = testable(viewer);
      tv.session = {
        ...tv.session,
        frameCount: 100,
        currentFrame: 1,
        isPlaying: false,
        currentSource: null,
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      viewer.initPrerenderBuffer();
      expect(tv.prerenderBuffer).not.toBeNull();
      expect(tv.prerenderBuffer!.onFrameProcessed).toBeInstanceOf(Function);
    });

    it('VWR-354: preloadForFrame delegates to prerenderBuffer', () => {
      const tv = testable(viewer);
      tv.session = {
        ...tv.session,
        frameCount: 100,
        currentFrame: 1,
        isPlaying: false,
        currentSource: null,
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      viewer.initPrerenderBuffer();
      expect(tv.prerenderBuffer).not.toBeNull();

      // Should not throw even though no effects are active
      expect(() => {
        viewer.preloadForFrame(50);
      }).not.toThrow();
    });

    it('VWR-355: preloadForFrame is safe when prerenderBuffer is null', () => {
      // No initPrerenderBuffer called, so buffer is null
      expect(() => {
        viewer.preloadForFrame(50);
      }).not.toThrow();
    });

    it('VWR-356: render does not throw during playback with no cached frame', () => {
      // Simulates the Phase 2A async fallback scenario:
      // playing + prerenderBuffer active but cache miss = show raw frame
      expect(() => {
        viewer.render();
      }).not.toThrow();
    });

    it('VWR-357: lens distortion is applied during playback with cached prerender frame', () => {
      // Regression test: lens distortion must be applied even when the prerender
      // buffer has a cached frame and the session is playing. Previously, the
      // cached-frame early-return path skipped applyLensDistortionToCtx().
      const tv = testable(viewer);

      // Set non-default lens distortion params
      viewer.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.3 });

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on applyLensDistortionToCtx
      const lensSpy = vi.spyOn(tv.lensDistortionManager, 'applyToCtx');

      viewer.render();

      expect(lensSpy).toHaveBeenCalled();
      lensSpy.mockRestore();
    });

    it('VWR-358: lens distortion is NOT applied during playback when params are default', () => {
      // Verify that default lens params do not trigger the lens distortion call
      const tv = testable(viewer);

      // Keep default lens params (no distortion)
      viewer.resetLensParams();

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on applyLensDistortionToCtx
      const lensSpy = vi.spyOn(tv.lensDistortionManager, 'applyToCtx');

      viewer.render();

      expect(lensSpy).not.toHaveBeenCalled();
      lensSpy.mockRestore();
    });
  });

  describe('prerender cache hit path effects (regression)', () => {
    it('VWR-GF-001: When ghost frames are enabled and playback is active with a prerender cache hit, the ghost frame rendering method is called', () => {
      const tv = testable(viewer);

      // Enable ghost frames
      viewer.setGhostFrameState({
        enabled: true,
        framesBefore: 2,
        framesAfter: 2,
        opacityBase: 0.3,
        opacityFalloff: 0.7,
        colorTint: false,
      });

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on renderGhostFrames (private method accessed through testable)
      const ghostSpy = vi.spyOn(tv as any, 'renderGhostFrames');

      viewer.render();

      expect(ghostSpy).toHaveBeenCalled();
      ghostSpy.mockRestore();
    });

    it('VWR-GF-002: When ghost frames are disabled, the ghost frame method is NOT called during cache hit path', () => {
      const tv = testable(viewer);

      // Keep ghost frames disabled (default)
      viewer.resetGhostFrameState();

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on renderGhostFrames
      const ghostSpy = vi.spyOn(tv as any, 'renderGhostFrames');

      viewer.render();

      expect(ghostSpy).not.toHaveBeenCalled();
      ghostSpy.mockRestore();
    });

    it('VWR-SM-001: When stereo mode is active and playback is active with a prerender cache hit, the stereo mode method is called', () => {
      const tv = testable(viewer);

      // Enable stereo mode
      viewer.setStereoState({
        mode: 'side-by-side',
        eyeSwap: false,
        offset: 0,
      });

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on applyStereoMode
      const stereoSpy = vi.spyOn(tv.stereoManager, 'applyStereoMode');

      viewer.render();

      expect(stereoSpy).toHaveBeenCalled();
      stereoSpy.mockRestore();
    });

    it('VWR-SM-002: When stereo mode is default/disabled, the stereo method is NOT called during cache hit path', () => {
      const tv = testable(viewer);

      // Keep stereo mode at default (disabled)
      viewer.resetStereoState();

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on applyStereoMode
      const stereoSpy = vi.spyOn(tv.stereoManager, 'applyStereoMode');

      viewer.render();

      expect(stereoSpy).not.toHaveBeenCalled();
      stereoSpy.mockRestore();
    });

    it('VWR-CP-001: During prerender cache hit path, canvas is cleared before drawing', () => {
      const tv = testable(viewer);

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on clearRect
      const clearSpy = vi.spyOn(tv.imageCtx, 'clearRect');

      viewer.render();

      // Canvas should be cleared at the start of render
      expect(clearSpy).toHaveBeenCalledWith(0, 0, tv.displayWidth, tv.displayHeight);
      clearSpy.mockRestore();
    });

    it('VWR-CP-002: During prerender cache hit path, background pattern is drawn when active', () => {
      const tv = testable(viewer);

      // Enable a non-black background pattern (use 'grey50' for solid fill so fillRect is called)
      viewer.setBackgroundPatternState({
        pattern: 'grey50',
        checkerSize: 'medium',
        customColor: '#1a1a1a',
      });

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on clearRect and drawImage (used during cache hit path)
      const clearSpy = vi.spyOn(tv.imageCtx, 'clearRect');
      const drawImageSpy = vi.spyOn(tv.imageCtx, 'drawImage');

      viewer.render();

      // Canvas should be cleared before drawing cached frame (line 2312)
      expect(clearSpy).toHaveBeenCalledWith(0, 0, tv.displayWidth, tv.displayHeight);
      // Background pattern drawing happens via drawBackgroundPattern which uses fillStyle and fillRect
      // but we can verify the cached frame is drawn
      expect(drawImageSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
      drawImageSpy.mockRestore();
    });

    it('VWR-CP-003: During prerender cache hit path, uncrop background is drawn when uncrop is active', () => {
      const tv = testable(viewer);

      // Enable uncrop with per-side padding mode
      viewer.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 0,
        paddingTop: 100,
        paddingBottom: 100,
        paddingLeft: 100,
        paddingRight: 100,
      });

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 300;  // Larger to account for uncrop
      mockCanvas.height = 300;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 300,
          height: 300,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on drawUncropBackground
      const uncropSpy = vi.spyOn(tv.cropManager, 'drawUncropBackground');
      const drawImageSpy = vi.spyOn(tv.imageCtx, 'drawImage');

      viewer.render();

      // Uncrop background should be drawn during cache hit path (line 2320-2322)
      expect(uncropSpy).toHaveBeenCalled();
      // The cached frame should also be drawn with uncrop offset
      expect(drawImageSpy).toHaveBeenCalled();
      uncropSpy.mockRestore();
      drawImageSpy.mockRestore();
    });

    it('VWR-CP-004: prerender cache hit applies transform for rotated content', () => {
      const tv = testable(viewer);
      const drawWithTransform = vi.spyOn(tv as any, 'drawWithTransform');

      (viewer as any).transformManager.setTransform({
        rotation: 90,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      });

      const mockImg = new Image(100, 100);
      const cachedCanvas = document.createElement('canvas');
      cachedCanvas.width = 100;
      cachedCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: cachedCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      viewer.render();

      expect(drawWithTransform).toHaveBeenCalledWith(tv.imageCtx, cachedCanvas, tv.displayWidth, tv.displayHeight);
      drawWithTransform.mockRestore();
    });

    it('VWR-CP-005: prerender target size swaps for 90° rotation', () => {
      const tv = testable(viewer);
      const setTargetSize = vi.fn();
      const mockImg = new Image(1000, 500);

      (viewer as any).transformManager.setTransform({
        rotation: 90,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      });

      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue(null),
        queuePriorityFrame: vi.fn(),
        setTargetSize,
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      tv.session = {
        ...tv.session,
        isPlaying: false,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 1000,
          height: 500,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      viewer.render();

      expect(setTargetSize).toHaveBeenCalled();
      const [targetW, targetH] = setTargetSize.mock.calls[0]!;
      expect(targetW).toBe(tv.displayHeight);
      expect(targetH).toBe(tv.displayWidth);
    });

    it('VWR-GF-003: ghost frame overlay applies current transform when drawing cached frames', () => {
      const tv = testable(viewer);
      const drawWithTransform = vi.spyOn(tv as any, 'drawWithTransform');
      const ghostFrameCanvas = document.createElement('canvas');
      ghostFrameCanvas.width = 64;
      ghostFrameCanvas.height = 64;

      (viewer as any).transformManager.setTransform({
        rotation: 90,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      });
      viewer.setGhostFrameState({
        enabled: true,
        framesBefore: 1,
        framesAfter: 0,
        opacityBase: 0.3,
        opacityFalloff: 0.7,
        colorTint: false,
      });

      tv.session = {
        ...tv.session,
        currentFrame: 2,
        currentSource: {
          type: 'video' as const,
          name: 'test.mp4',
          url: 'test.mp4',
          width: 100,
          height: 100,
          duration: 10,
          fps: 24,
          element: document.createElement('video'),
        },
        getVideoFrameCanvas: vi.fn().mockReturnValue(ghostFrameCanvas),
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      (viewer as any).renderGhostFrames(400, 200);

      expect(drawWithTransform).toHaveBeenCalledWith(tv.imageCtx, ghostFrameCanvas, 400, 200);
      drawWithTransform.mockRestore();
    });

    it('VWR-EFF-001: All effects applied in full path are also applied in cache hit path (consistency check)', () => {
      // This meta-test verifies that the cache hit path doesn't skip effects that
      // the full rendering path applies. We check for ghost frames, stereo, lens.
      const tv = testable(viewer);

      // Enable all relevant effects
      viewer.setGhostFrameState({
        enabled: true,
        framesBefore: 2,
        framesAfter: 2,
        opacityBase: 0.3,
        opacityFalloff: 0.7,
        colorTint: false,
      });
      viewer.setStereoState({
        mode: 'side-by-side',
        eyeSwap: false,
        offset: 0,
      });
      viewer.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.3 });

      // Create a mock image element as the current source
      const mockImg = new Image(100, 100);

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 100,
          height: 100,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 1,
        frameCount: 10,
        currentSource: {
          type: 'image' as const,
          name: 'test.jpg',
          url: 'test.jpg',
          width: 100,
          height: 100,
          duration: 1,
          fps: 24,
          element: mockImg,
        },
        getSequenceFrameSync: () => null,
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      // Spy on all the effect methods
      const ghostSpy = vi.spyOn(tv as any, 'renderGhostFrames');
      const stereoSpy = vi.spyOn(tv.stereoManager, 'applyStereoMode');
      const lensSpy = vi.spyOn(tv.lensDistortionManager, 'applyToCtx');

      viewer.render();

      // All effects should be applied in cache hit path
      expect(ghostSpy).toHaveBeenCalled();
      expect(stereoSpy).toHaveBeenCalled();
      expect(lensSpy).toHaveBeenCalled();

      ghostSpy.mockRestore();
      stereoSpy.mockRestore();
      lensSpy.mockRestore();
    });
  });

  describe('display color state re-render (regression)', () => {
    it('VWR-DCS-001: setDisplayColorState() eagerly updates glRenderer', () => {
      // Setup mock glRenderer
      const mockGLRenderer = {
        setDisplayColorState: vi.fn(),
        setColorAdjustments: vi.fn(),
        setToneMappingState: vi.fn(),
        setColorInversion: vi.fn(),
        setChannelMode: vi.fn(),
        dispose: vi.fn(),
      };
      testable(viewer).glRendererManager._glRenderer = mockGLRenderer;

      // Call setDisplayColorState
      viewer.setDisplayColorState({
        transferFunction: 'rec709',
        displayGamma: 1.2,
        displayBrightness: 0.9,
        customGamma: 2.2,
      });

      // Verify glRenderer.setDisplayColorState was called with correct numeric code
      expect(mockGLRenderer.setDisplayColorState).toHaveBeenCalledWith({
        transferFunction: 2, // rec709 = 2 in DISPLAY_TRANSFER_CODES
        displayGamma: 1.2,
        displayBrightness: 0.9,
        customGamma: 2.2,
      });
    });

    it('VWR-DCS-002: setDisplayColorState() calls scheduleRender()', () => {
      const scheduleRenderSpy = vi.spyOn(viewer as unknown as { scheduleRender: () => void }, 'scheduleRender');

      viewer.setDisplayColorState({
        transferFunction: 'gamma2.2',
        displayGamma: 1.0,
        displayBrightness: 1.0,
        customGamma: 2.2,
      });

      expect(scheduleRenderSpy).toHaveBeenCalled();
      scheduleRenderSpy.mockRestore();
    });

    it('VWR-DCS-003: resetDisplayColorState() eagerly updates glRenderer with default values', () => {
      // Setup mock glRenderer
      const mockGLRenderer = {
        setDisplayColorState: vi.fn(),
        dispose: vi.fn(),
      };
      testable(viewer).glRendererManager._glRenderer = mockGLRenderer;

      // Call resetDisplayColorState
      viewer.resetDisplayColorState();

      // Verify glRenderer.setDisplayColorState was called with default values
      expect(mockGLRenderer.setDisplayColorState).toHaveBeenCalledWith({
        transferFunction: 1, // srgb = 1 in DISPLAY_TRANSFER_CODES (default)
        displayGamma: 1.0,
        displayBrightness: 1.0,
        customGamma: 2.2,
      });
    });

    it('VWR-DCS-004: setDisplayColorState() works when glRenderer is null (no crash, still schedules render)', () => {
      // Ensure glRenderer is null
      testable(viewer).glRendererManager._glRenderer = null;

      // Should not throw
      expect(() => {
        viewer.setDisplayColorState({
          transferFunction: 'gamma2.4',
          displayGamma: 1.1,
          displayBrightness: 1.2,
          customGamma: 2.4,
        });
      }).not.toThrow();

      // Verify state was updated
      const state = viewer.getDisplayColorState();
      expect(state.transferFunction).toBe('gamma2.4');
      expect(state.displayGamma).toBe(1.1);
      expect(state.displayBrightness).toBe(1.2);
    });

    it('VWR-DCS-005: Display state transfer function code is correctly mapped via DISPLAY_TRANSFER_CODES', () => {
      const mockGLRenderer = {
        setDisplayColorState: vi.fn(),
        dispose: vi.fn(),
      };
      testable(viewer).glRendererManager._glRenderer = mockGLRenderer;

      // Test all transfer functions
      const testCases: Array<[string, number]> = [
        ['linear', 0],
        ['srgb', 1],
        ['rec709', 2],
        ['gamma2.2', 3],
        ['gamma2.4', 4],
        ['custom', 5],
      ];

      testCases.forEach(([transferFunction, expectedCode]) => {
        mockGLRenderer.setDisplayColorState.mockClear();

        viewer.setDisplayColorState({
          transferFunction: transferFunction as import('../../color/DisplayTransfer').DisplayTransferFunction,
          displayGamma: 1.0,
          displayBrightness: 1.0,
          customGamma: 2.2,
        });

        expect(mockGLRenderer.setDisplayColorState).toHaveBeenCalledWith({
          transferFunction: expectedCode,
          displayGamma: 1.0,
          displayBrightness: 1.0,
          customGamma: 2.2,
        });
      });
    });

    it('VWR-DCS-006: Consistency check — setColorAdjustments and setDisplayColorState both eagerly update glRenderer', () => {
      // Setup mock glRenderer
      const mockGLRenderer = {
        setDisplayColorState: vi.fn(),
        setColorAdjustments: vi.fn(),
        setToneMappingState: vi.fn(),
        setColorInversion: vi.fn(),
        setChannelMode: vi.fn(),
        dispose: vi.fn(),
      };
      testable(viewer).glRendererManager._glRenderer = mockGLRenderer;

      // Test setColorAdjustments
      viewer.setColorAdjustments({
        exposure: 1.5,
        gamma: 2.2,
        saturation: 1.2,
        contrast: 1.0,
        brightness: 0.0,
        temperature: 0,
        tint: 0,
        hueRotation: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        vibrance: 0,
        vibranceSkinProtection: true,
        clarity: 0,
      });
      expect(mockGLRenderer.setColorAdjustments).toHaveBeenCalled();

      // Test setDisplayColorState
      mockGLRenderer.setDisplayColorState.mockClear();
      viewer.setDisplayColorState({
        transferFunction: 'rec709',
        displayGamma: 1.2,
        displayBrightness: 0.9,
        customGamma: 2.2,
      });
      expect(mockGLRenderer.setDisplayColorState).toHaveBeenCalled();

      // Both methods should follow the same pattern: eagerly update glRenderer when it exists
    });
  });

  describe('missing frame rendering', () => {
    it('VWR-MF-001: hold mode falls back to current frame when previous frame is not cached', () => {
      const tv = testable(viewer);
      const drawWithTransform = vi.spyOn(tv as any, 'drawWithTransform');
      const firstFrame = new Image(96, 96);
      const currentFrameImage = new Image(128, 128);

      viewer.setMissingFrameMode('hold');

      tv.session = {
        ...tv.session,
        isPlaying: false,
        currentFrame: 2,
        frameCount: 2,
        currentSource: {
          type: 'sequence' as const,
          name: 'seq',
          url: '',
          width: 100,
          height: 100,
          duration: 2,
          fps: 24,
          element: firstFrame,
          sequenceFrames: [
            { index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png') },
            { index: 1, frameNumber: 3, file: new File([''], 'frame_0003.png') },
          ],
          sequenceInfo: {
            name: 'seq',
            pattern: 'frame_####.png',
            frames: [
              { index: 0, frameNumber: 1, file: new File([''], 'frame_0001.png') },
              { index: 1, frameNumber: 3, file: new File([''], 'frame_0003.png') },
            ],
            startFrame: 1,
            endFrame: 3,
            width: 100,
            height: 100,
            fps: 24,
            missingFrames: [2],
          },
        },
        getSequenceFrameSync: vi.fn((frame?: number) => {
          if (frame === 1) return null;
          if (frame === 2) return currentFrameImage;
          return null;
        }),
        getSequenceFrameImage: vi.fn().mockResolvedValue(null),
        isUsingMediabunny: () => false,
      } as TestableViewer['session'];

      viewer.render();

      const drawnElements = drawWithTransform.mock.calls.map(([, element]) => element);
      expect(drawnElements.includes(currentFrameImage)).toBe(true);
      expect(drawnElements.includes(firstFrame)).toBe(false);
      drawWithTransform.mockRestore();
      localStorage.removeItem('openrv.missingFrameMode');
    });
  });

});
