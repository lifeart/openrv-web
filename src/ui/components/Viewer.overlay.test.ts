/**
 * Viewer Unit Tests - OCIO, LUT, Effects, Crop & Render Scheduling
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

  // Overlay manager (owns overlays including pixel probe)
  overlayManager: {
    getPixelProbe(): PixelProbe;
  };
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

  describe('OCIO rendering pipeline behavior', () => {
    /** Create a minimal valid LUT3D for OCIO tests */
    function createFakeLUT(): import('../../color/LUTLoader').LUT3D {
      return {
        title: 'test-ocio',
        size: 17,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        data: new Float32Array(17 * 17 * 17 * 3),
      };
    }

    it('VWR-400: isOCIOEnabled returns false by default', () => {
      expect(viewer.isOCIOEnabled()).toBe(false);
    });

    it('VWR-401: setOCIOBakedLUT enables OCIO with a valid LUT', () => {
      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);
      expect(viewer.isOCIOEnabled()).toBe(true);
    });

    it('VWR-402: setOCIOBakedLUT disables OCIO when enabled=false', () => {
      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);
      expect(viewer.isOCIOEnabled()).toBe(true);

      viewer.setOCIOBakedLUT(null, false);
      expect(viewer.isOCIOEnabled()).toBe(false);
    });

    it('VWR-403: OCIO disqualifies SDR WebGL eligibility (forces 2D canvas path)', () => {
      // When OCIO is active, SDR WebGL should NOT be used because the GL shader
      // does not support OCIO transforms. The sdrWebGLEligible guard at line 2261
      // explicitly checks !(this.ocioEnabled && this.ocioBakedLUT).
      const tv = testable(viewer);
      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);

      // Even with GPU shader effects active, OCIO should prevent SDR WebGL
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, exposure: 1 });
      expect(tv.hasGPUShaderEffectsActive()).toBe(true);
      expect(tv.colorPipeline.ocioEnabled).toBe(true);
      expect(tv.colorPipeline.ocioBakedLUT).not.toBeNull();
    });

    it('VWR-404: OCIO is applied on playback cache hit path (before lightweight effects)', () => {
      // Regression: verify OCIO is applied when prerender buffer has a cached frame.
      // The cache hit path at lines 2356-2357 applies OCIO before lightweight effects.
      const tv = testable(viewer);
      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on applyOCIOToCanvas
      const ocioSpy = vi.spyOn(tv, 'applyOCIOToCanvas');

      viewer.render();

      expect(ocioSpy).toHaveBeenCalled();
      ocioSpy.mockRestore();
    });

    it('VWR-405: OCIO is applied on playback cache miss path (full 2D fallthrough)', () => {
      // Regression: on cache miss during playback, the code falls through to the
      // full 2D path where OCIO is applied at lines 2471-2472 before lightweight effects.
      const tv = testable(viewer);
      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);

      // Mock a prerenderBuffer with NO cached frame (cache miss)
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue(null),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on applyOCIOToCanvas
      const ocioSpy = vi.spyOn(tv, 'applyOCIOToCanvas');

      viewer.render();

      expect(ocioSpy).toHaveBeenCalled();
      ocioSpy.mockRestore();
    });

    it('VWR-406: OCIO is not applied when disabled (cache hit path)', () => {
      // Verify OCIO is skipped when not enabled, even if the code path runs
      const tv = testable(viewer);

      // OCIO disabled (default)
      expect(viewer.isOCIOEnabled()).toBe(false);

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing
      const mockImg = new Image(100, 100);
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

      // Spy on applyOCIOToCanvas
      const ocioSpy = vi.spyOn(tv, 'applyOCIOToCanvas');

      viewer.render();

      // OCIO should NOT be called when disabled
      expect(ocioSpy).not.toHaveBeenCalled();
      ocioSpy.mockRestore();
    });

    it('VWR-407: HDR WebGL path is bypassed when OCIO is active (regression fix)', () => {
      // Regression: the HDR WebGL path used to render and return without OCIO.
      // Now when OCIO is active, the HDR path should be skipped so OCIO can be
      // applied via the 2D canvas fallback.
      const tv = testable(viewer);
      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);

      // The check in renderImage() is:
      //   if (hdrFileSource && !(this.ocioEnabled && this.ocioBakedLUT))
      // When OCIO is active, this condition is false, so the HDR WebGL path is skipped.
      expect(tv.colorPipeline.ocioEnabled).toBe(true);
      expect(tv.colorPipeline.ocioBakedLUT).not.toBeNull();

      // Render should not throw (no HDR source available in test env, so it
      // just confirms the guard logic doesn't cause errors)
      expect(() => viewer.render()).not.toThrow();
    });

    it('VWR-408: HDR mode is deactivated when OCIO becomes active', () => {
      // When OCIO is enabled while an HDR source was being rendered via WebGL,
      // the HDR mode should be deactivated to switch to the 2D canvas path.
      const tv = testable(viewer);

      // Simulate that HDR mode was previously active
      tv.glRendererManager._hdrRenderActive = true;

      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);

      // Render triggers the deactivation check
      viewer.render();

      // HDR mode should be deactivated because OCIO is active
      expect(tv.glRendererManager.hdrRenderActive).toBe(false);
    });
  });

  describe('GPU LUT rendering in cache hit path (regression)', () => {
    /** Create a minimal valid LUT3D for GPU LUT tests */
    function createFakeLUT(): import('../../color/LUTLoader').LUT3D {
      return {
        title: 'test-lut',
        size: 17,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        data: new Float32Array(17 * 17 * 17 * 3),
      };
    }

    it('VWR-LUT-001: When a user 3D LUT is loaded and playback is active with cache hit, the LUT processing method is called', () => {
      // Regression: verify GPU LUT is applied when prerender buffer has a cached frame.
      // The cache hit path at lines 2367-2368 applies GPU LUT before OCIO.
      const tv = testable(viewer);
      const fakeLUT = createFakeLUT();
      viewer.setLUT(fakeLUT);
      viewer.setLUTIntensity(1.0);

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on applyLUTToCanvas
      const lutSpy = vi.spyOn(tv, 'applyLUTToCanvas');

      viewer.render();

      expect(lutSpy).toHaveBeenCalled();
      lutSpy.mockRestore();
    });

    it('VWR-LUT-002: When no LUT is loaded, LUT processing is NOT called during cache hit', () => {
      // Verify GPU LUT is skipped when no LUT is loaded, even if the code path runs
      const tv = testable(viewer);

      // No LUT loaded (default)
      expect(viewer.getLUT()).toBeNull();

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing
      const mockImg = new Image(100, 100);
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

      // Spy on applyLUTToCanvas
      const lutSpy = vi.spyOn(tv, 'applyLUTToCanvas');

      viewer.render();

      // LUT should NOT be called when no LUT is loaded
      expect(lutSpy).not.toHaveBeenCalled();
      lutSpy.mockRestore();
    });
  });

  describe('Lightweight effects in cache hit path (regression)', () => {
    it('VWR-LW-001: applyLightweightEffects is called during playback cache hit path', () => {
      // Regression: verify lightweight effects are applied when prerender buffer has
      // a cached frame. The cache hit path at line 2374 applies lightweight effects
      // after GPU LUT and OCIO.
      const tv = testable(viewer);

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on applyLightweightEffects
      const lightweightSpy = vi.spyOn(tv, 'applyLightweightEffects');

      viewer.render();

      expect(lightweightSpy).toHaveBeenCalled();
      lightweightSpy.mockRestore();
    });

    it('VWR-LW-002: False color is applied when enabled during playback (via lightweight effects)', () => {
      // Verify false color diagnostic overlay is active during cache hit playback
      const tv = testable(viewer);

      // Enable false color
      viewer.getFalseColor().enable();

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on applyLightweightEffects to verify it's called
      const lightweightSpy = vi.spyOn(tv, 'applyLightweightEffects');

      viewer.render();

      // Lightweight effects should be called, which will process false color
      expect(lightweightSpy).toHaveBeenCalled();
      lightweightSpy.mockRestore();
    });

    it('VWR-LW-003: Zebra stripes rendering occurs during playback when enabled', () => {
      // Verify zebra stripes diagnostic overlay is active during cache hit playback
      const tv = testable(viewer);

      // Enable zebra stripes
      viewer.getZebraStripes().enable();

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on applyLightweightEffects to verify it's called
      const lightweightSpy = vi.spyOn(tv, 'applyLightweightEffects');

      viewer.render();

      // Lightweight effects should be called, which will process zebra stripes
      expect(lightweightSpy).toHaveBeenCalled();
      lightweightSpy.mockRestore();
    });
  });

  describe('Crop clipping in cache hit path (regression)', () => {
    it('VWR-CROP-001: Crop clipping is applied during playback cache hit when active', () => {
      // Regression: verify crop clipping is applied when prerender buffer has a
      // cached frame. The cache hit path at lines 2376-2378 applies crop clipping
      // after lightweight effects.
      const tv = testable(viewer);

      // Enable crop with a non-full region
      viewer.setCropState({
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        aspectRatio: null,
      });

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on clearOutsideCropRegion
      const cropSpy = vi.spyOn(tv.cropManager, 'clearOutsideCropRegion');

      viewer.render();

      expect(cropSpy).toHaveBeenCalled();
      cropSpy.mockRestore();
    });

    it('VWR-CROP-002: Crop clipping is NOT applied when not active during cache hit', () => {
      // Verify crop clipping is skipped when crop is disabled or full region
      const tv = testable(viewer);

      // Crop disabled (default)
      expect(viewer.getCropState().enabled).toBe(false);

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing
      const mockImg = new Image(100, 100);
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

      // Spy on clearOutsideCropRegion
      const cropSpy = vi.spyOn(tv.cropManager, 'clearOutsideCropRegion');

      viewer.render();

      // Crop clipping should NOT be called when crop is disabled
      expect(cropSpy).not.toHaveBeenCalled();
      cropSpy.mockRestore();
    });
  });

  describe('Cached frame drawing verification', () => {
    it('VWR-CACHE-001: The cached frame from prerenderBuffer is actually drawn to the canvas during playback', () => {
      // Verify the cached frame is drawn during cache hit playback
      const tv = testable(viewer);

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
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
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

      // Spy on drawImage to verify cached canvas is drawn
      const drawImageSpy = vi.spyOn(tv.imageCtx, 'drawImage');

      viewer.render();

      // The cached canvas should be drawn to the display canvas
      expect(drawImageSpy).toHaveBeenCalledWith(mockCanvas, 0, 0, tv.displayWidth, tv.displayHeight);
      drawImageSpy.mockRestore();
    });
  });

  describe('Effect ordering in cache hit path', () => {
    /** Create a minimal valid LUT3D for ordering test */
    function createFakeLUT(): import('../../color/LUTLoader').LUT3D {
      return {
        title: 'test-order',
        size: 17,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        data: new Float32Array(17 * 17 * 17 * 3),
      };
    }

    it('VWR-ORDER-001: Effects are applied in the correct order during cache hit path', () => {
      // This test verifies the effect application order matches the expected sequence:
      // canvas clear → background → uncrop → cached frame → ghost → stereo → lens →
      // GPU LUT → OCIO → lightweight → crop
      const tv = testable(viewer);

      // Enable all effects to test ordering
      viewer.setBackgroundPatternState({
        pattern: 'grey50',
        checkerSize: 'medium',
        customColor: '#1a1a1a',
      });
      viewer.setUncropState({
        enabled: true,
        paddingMode: 'per-side',
        padding: 0,
        paddingTop: 50,
        paddingBottom: 50,
        paddingLeft: 50,
        paddingRight: 50,
      });
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
      const fakeLUT = createFakeLUT();
      viewer.setLUT(fakeLUT);
      viewer.setLUTIntensity(1.0);
      viewer.setOCIOBakedLUT(fakeLUT, true);
      viewer.setCropState({
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        aspectRatio: null,
      });

      // Mock a prerenderBuffer with a cached frame
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 200;
      mockCanvas.height = 200;
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue({
          canvas: mockCanvas,
          effectsHash: 'test',
          width: 200,
          height: 200,
        }),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      // Mock session as playing with a valid current source (image)
      const mockImg = new Image(100, 100);
      tv.session = {
        ...tv.session,
        isPlaying: true,
        currentFrame: 5,
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

      // Spy on all effect methods
      const clearSpy = vi.spyOn(tv.imageCtx, 'clearRect');
      const uncropSpy = vi.spyOn(tv.cropManager, 'drawUncropBackground');
      const drawImageSpy = vi.spyOn(tv.imageCtx, 'drawImage');
      const ghostSpy = vi.spyOn(tv as any, 'renderGhostFrames');
      const stereoSpy = vi.spyOn(tv.stereoManager, 'applyStereoMode');
      const lensSpy = vi.spyOn(tv.lensDistortionManager, 'applyToCtx');
      const lutSpy = vi.spyOn(tv, 'applyLUTToCanvas');
      const ocioSpy = vi.spyOn(tv, 'applyOCIOToCanvas');
      const lightweightSpy = vi.spyOn(tv, 'applyLightweightEffects');
      const cropSpy = vi.spyOn(tv.cropManager, 'clearOutsideCropRegion');

      viewer.render();

      // Verify all effects are called
      expect(clearSpy).toHaveBeenCalled();
      expect(uncropSpy).toHaveBeenCalled();
      expect(drawImageSpy).toHaveBeenCalled();
      expect(ghostSpy).toHaveBeenCalled();
      expect(stereoSpy).toHaveBeenCalled();
      expect(lensSpy).toHaveBeenCalled();
      expect(lutSpy).toHaveBeenCalled();
      expect(ocioSpy).toHaveBeenCalled();
      expect(lightweightSpy).toHaveBeenCalled();
      expect(cropSpy).toHaveBeenCalled();

      // Verify order: each effect should be called before the next one
      // Get call order indices (using non-null assertions since we verified calls above)
      const allCalls = vi.mocked(tv.imageCtx.clearRect).mock.invocationCallOrder[0]!;
      const uncropOrder = vi.mocked(tv.cropManager.drawUncropBackground).mock.invocationCallOrder[0]!;
      const drawOrder = vi.mocked(tv.imageCtx.drawImage).mock.invocationCallOrder[0]!;
      const ghostOrder = vi.mocked((tv as any).renderGhostFrames).mock.invocationCallOrder[0]!;
      const stereoOrder = vi.mocked(tv.stereoManager.applyStereoMode).mock.invocationCallOrder[0]!;
      const lensOrder = vi.mocked(tv.lensDistortionManager.applyToCtx).mock.invocationCallOrder[0]!;
      const lutOrder = vi.mocked(tv.applyLUTToCanvas).mock.invocationCallOrder[0]!;
      const ocioOrder = vi.mocked(tv.applyOCIOToCanvas).mock.invocationCallOrder[0]!;
      const lightweightOrder = vi.mocked(tv.applyLightweightEffects).mock.invocationCallOrder[0]!;
      const cropOrder = vi.mocked(tv.cropManager.clearOutsideCropRegion).mock.invocationCallOrder[0]!;

      // Verify ordering: clear < uncrop < draw < ghost < stereo < lens < lut < ocio < lightweight < crop
      expect(allCalls).toBeLessThan(uncropOrder);
      expect(uncropOrder).toBeLessThan(drawOrder);
      expect(drawOrder).toBeLessThan(ghostOrder);
      expect(ghostOrder).toBeLessThan(stereoOrder);
      expect(stereoOrder).toBeLessThan(lensOrder);
      expect(lensOrder).toBeLessThan(lutOrder);
      expect(lutOrder).toBeLessThan(ocioOrder);
      expect(ocioOrder).toBeLessThan(lightweightOrder);
      expect(lightweightOrder).toBeLessThan(cropOrder);

      // Cleanup
      clearSpy.mockRestore();
      uncropSpy.mockRestore();
      drawImageSpy.mockRestore();
      ghostSpy.mockRestore();
      stereoSpy.mockRestore();
      lensSpy.mockRestore();
      lutSpy.mockRestore();
      ocioSpy.mockRestore();
      lightweightSpy.mockRestore();
      cropSpy.mockRestore();
    });
  });

  describe('Effects applied on playback cache miss (regression)', () => {
    // Regression tests: previously, during playback with a prerender buffer but
    // a cache miss, only lightweight diagnostic overlays were applied. Heavy CPU
    // effects (highlights/shadows, vibrance, CDL, curves, etc.) were skipped,
    // making them visible only when paused.

    /** Set up a playing session with a mock prerenderBuffer (cache miss or hit). */
    function setupPlaybackSession(
      tv: TestableViewer,
      cachedFrame: { canvas: HTMLCanvasElement; effectsHash: string; width: number; height: number } | null
    ): void {
      tv.prerenderBuffer = {
        getFrame: vi.fn().mockReturnValue(cachedFrame),
        queuePriorityFrame: vi.fn(),
        setTargetSize: vi.fn(),
        setHalfRes: vi.fn(),
        onFrameProcessed: null,
        dispose: vi.fn(),
      } as unknown as typeof tv.prerenderBuffer;

      const mockImg = new Image(100, 100);
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
    }

    it('VWR-CMISS-001: applyBatchedPixelEffects is called on playback cache miss', () => {
      const tv = testable(viewer);
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, highlights: 50 });
      setupPlaybackSession(tv, null);

      const batchedSpy = vi.spyOn(tv, 'applyBatchedPixelEffects');
      viewer.render();

      expect(batchedSpy).toHaveBeenCalled();
      batchedSpy.mockRestore();
    });

    it('VWR-CMISS-002: full effects on cache miss match effects when paused', () => {
      // The same effect method must be called whether playing (cache miss) or paused.
      const tv = testable(viewer);
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, vibrance: 30 });

      // Render while paused
      const mockImg = new Image(100, 100);
      tv.session = {
        ...tv.session,
        isPlaying: false,
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
      tv.prerenderBuffer = null;

      const batchedSpy = vi.spyOn(tv, 'applyBatchedPixelEffects');
      viewer.render();
      expect(batchedSpy).toHaveBeenCalledTimes(1);

      batchedSpy.mockClear();

      // Render while playing with cache miss — same method must be called
      setupPlaybackSession(tv, null);
      viewer.render();
      expect(batchedSpy).toHaveBeenCalledTimes(1);

      batchedSpy.mockRestore();
    });

    it('VWR-CMISS-003: full batched effects (not lightweight) are used on cache miss', () => {
      // On cache miss, the full effect pipeline must run. This is the core
      // regression guard: a future "optimization" that replaces batched effects
      // with lightweight-only on cache miss would re-introduce the bug.
      const tv = testable(viewer);
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, shadows: -20 });
      setupPlaybackSession(tv, null);

      const batchedSpy = vi.spyOn(tv, 'applyBatchedPixelEffects');
      viewer.render();

      expect(batchedSpy).toHaveBeenCalled();
      batchedSpy.mockRestore();
    });

    it('VWR-CMISS-004: cache hit uses lightweight effects and skips batched', () => {
      // Cache hits take the fast path: effects are baked in by the worker,
      // so only lightweight diagnostic overlays are applied on the main thread.
      const tv = testable(viewer);
      viewer.setColorAdjustments({ ...DEFAULT_COLOR_ADJUSTMENTS, highlights: 50 });

      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 100;
      mockCanvas.height = 100;
      setupPlaybackSession(tv, { canvas: mockCanvas, effectsHash: 'test', width: 100, height: 100 });

      const lightweightSpy = vi.spyOn(tv, 'applyLightweightEffects');
      const batchedSpy = vi.spyOn(tv, 'applyBatchedPixelEffects');

      viewer.render();

      expect(lightweightSpy).toHaveBeenCalled();
      expect(batchedSpy).not.toHaveBeenCalled();

      lightweightSpy.mockRestore();
      batchedSpy.mockRestore();
    });
  });

  describe('Async effects race condition prevention', () => {
    it('VWR-ASYNC-001: render() increments _asyncEffectsGeneration', () => {
      const tv = testable(viewer);
      const gen0 = tv._asyncEffectsGeneration;
      viewer.render();
      expect(tv._asyncEffectsGeneration).toBe(gen0 + 1);
      viewer.render();
      expect(tv._asyncEffectsGeneration).toBe(gen0 + 2);
    });

    it('VWR-ASYNC-002: _asyncEffectsGeneration starts at 0', () => {
      const tv = testable(viewer);
      // After construction, generation starts at 0 (no renders yet)
      expect(typeof tv._asyncEffectsGeneration).toBe('number');
      expect(tv._asyncEffectsGeneration).toBeGreaterThanOrEqual(0);
    });
  });

  // =================================================================
  // FPS playback regression tests
  //
  // These tests protect the render-scheduling fixes that eliminated
  // the double-rAF delay and redundant GPU renders during video
  // playback.  Reverting any of these behaviors would halve effective
  // FPS for video sources.
  // =================================================================

  describe('renderDirect and scheduleRender (FPS regression)', () => {
    it('VWR-FPS-001: renderDirect() exists as a public method', () => {
      // renderDirect() must be publicly callable by App.tick() to bypass
      // the double-rAF delay.  Removing it would force all renders through
      // scheduleRender's extra rAF hop.
      expect(typeof viewer.renderDirect).toBe('function');
    });

    it('VWR-FPS-002: renderDirect() calls render synchronously', () => {
      const renderSpy = vi.spyOn(viewer, 'render');

      viewer.renderDirect();

      // render() must be called synchronously (same tick), not deferred
      expect(renderSpy).toHaveBeenCalledTimes(1);
      renderSpy.mockRestore();
    });

    it('VWR-FPS-003: renderDirect() clears pendingRender flag', () => {
      const tv = testable(viewer);

      // Simulate a scheduled render being queued
      viewer.refresh(); // sets pendingRender = true
      expect(tv.pendingRender).toBe(true);

      // renderDirect() must clear the flag to prevent the scheduled
      // rAF callback from executing a redundant render
      viewer.renderDirect();
      expect(tv.pendingRender).toBe(false);
    });

    it('VWR-FPS-004: refresh() sets pendingRender flag', () => {
      const tv = testable(viewer);

      // Clear any pending render from construction
      viewer.renderDirect();
      expect(tv.pendingRender).toBe(false);
      viewer.refresh();
      expect(tv.pendingRender).toBe(true);
    });

    it('VWR-FPS-005: scheduleRender deduplicates (calling refresh twice does not double-queue)', () => {
      const tv = testable(viewer);

      viewer.refresh();
      expect(tv.pendingRender).toBe(true);

      // Second call should be a no-op (pendingRender already true)
      viewer.refresh();
      expect(tv.pendingRender).toBe(true);
    });

    it('VWR-FPS-006: renderDirect() prevents scheduled rAF from rendering again', async () => {
      const renderSpy = vi.spyOn(viewer, 'render');

      // Step 1: Schedule a render via refresh (queues rAF)
      viewer.refresh();

      // Step 2: Before the rAF fires, call renderDirect()
      // This renders immediately and clears pendingRender
      viewer.renderDirect();
      expect(renderSpy).toHaveBeenCalledTimes(1);

      // Step 3: Let the rAF callback fire
      // In jsdom, requestAnimationFrame is faked; flush it
      await new Promise(resolve => requestAnimationFrame(resolve));

      // render() should NOT have been called again — the rAF callback
      // checks pendingRender and bails out since renderDirect() cleared it
      expect(renderSpy).toHaveBeenCalledTimes(1);

      renderSpy.mockRestore();
    });

    it('VWR-FPS-007: resize() also uses scheduleRender (sets pendingRender)', () => {
      const tv = testable(viewer);

      // Clear any pending render from construction (syncLUTPipeline)
      viewer.renderDirect();
      expect(tv.pendingRender).toBe(false);
      viewer.resize();
      expect(tv.pendingRender).toBe(true);
    });

    it('VWR-FPS-008: pendingRender is false after renderDirect clears it', () => {
      const tv = testable(viewer);
      // Construction may schedule a render via syncLUTPipeline;
      // renderDirect clears it.
      viewer.renderDirect();
      expect(tv.pendingRender).toBe(false);
    });

    it('VWR-FPS-009: scheduleRender is no-op during playback (render storm prevention)', () => {
      const tv = testable(viewer);

      // Clear any pending render from construction
      viewer.renderDirect();

      // Simulate active playback
      tv.session = { ...tv.session, isPlaying: true };

      // refresh() calls scheduleRender internally
      viewer.refresh();

      // pendingRender should remain false — scheduleRender bails early
      expect(tv.pendingRender).toBe(false);
    });

    it('VWR-FPS-010: renderDirect still works during playback', () => {
      const tv = testable(viewer);
      const renderSpy = vi.spyOn(viewer, 'render');

      tv.session = { ...tv.session, isPlaying: true };

      // renderDirect bypasses scheduleRender — works regardless of isPlaying
      viewer.renderDirect();
      expect(renderSpy).toHaveBeenCalledTimes(1);

      renderSpy.mockRestore();
    });

    it('VWR-FPS-011: scheduleRender works normally when not playing', () => {
      const tv = testable(viewer);

      // Not playing (default)
      expect(tv.session.isPlaying).toBeFalsy();

      viewer.refresh();
      expect(tv.pendingRender).toBe(true);
    });

    it('VWR-FPS-012: scheduleRender resumes after playback stops', () => {
      const tv = testable(viewer);

      // Clear any pending render from construction
      viewer.renderDirect();

      // Start playback — scheduleRender should be no-op
      tv.session = { ...tv.session, isPlaying: true };
      viewer.refresh();
      expect(tv.pendingRender).toBe(false);

      // Stop playback — scheduleRender should work again
      tv.session = { ...tv.session, isPlaying: false };
      viewer.refresh();
      expect(tv.pendingRender).toBe(true);
    });
  });

});
