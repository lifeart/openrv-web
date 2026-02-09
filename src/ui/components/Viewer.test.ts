/**
 * Viewer Unit Tests - Construction, Lifecycle & Basic API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Viewer } from './Viewer';
import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { DEFAULT_TRANSFORM } from './TransformControl';
import { DEFAULT_FILTER_SETTINGS } from './FilterControl';
import { DEFAULT_CDL, type LUT3D } from '../../color/ColorProcessingFacade';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';
import type { StackLayer } from './StackControl';
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

// Mock WebGLLUTProcessor
vi.mock('../../color/WebGLLUT', () => ({
  WebGLLUTProcessor: vi.fn().mockImplementation(() => ({
    setLUT: vi.fn(),
    hasLUT: vi.fn().mockReturnValue(false),
    applyToCanvas: vi.fn(),
    dispose: vi.fn(),
  })),
}));

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

  describe('initialization', () => {
    it('VWR-001: creates viewer element', () => {
      const element = viewer.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.className).toBe('viewer-container');
    });

    it('VWR-002: starts with default zoom level', () => {
      expect(viewer.getZoom()).toBe(1);
    });

    it('VWR-003: starts with default pan position', () => {
      const pan = viewer.getPan();
      expect(pan.x).toBe(0);
      expect(pan.y).toBe(0);
    });

    it('VWR-004: starts with default color adjustments', () => {
      const adjustments = viewer.getColorAdjustments();
      expect(adjustments).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('VWR-005: starts with default transform', () => {
      const transform = viewer.getTransform();
      expect(transform).toEqual(DEFAULT_TRANSFORM);
    });

    it('VWR-006: starts with default filter settings', () => {
      const settings = viewer.getFilterSettings();
      expect(settings).toEqual(DEFAULT_FILTER_SETTINGS);
    });

    it('VWR-007: starts with no LUT', () => {
      expect(viewer.getLUT()).toBeNull();
    });

    it('VWR-008: starts with default LUT intensity', () => {
      expect(viewer.getLUTIntensity()).toBe(1);
    });
  });

  describe('resize and render', () => {
    it('VWR-009: resize does not throw', () => {
      expect(() => {
        viewer.resize();
      }).not.toThrow();
    });

    it('VWR-010: refresh triggers render', () => {
      expect(() => {
        viewer.refresh();
      }).not.toThrow();
    });

    it('VWR-011: render does not throw', () => {
      expect(() => {
        viewer.render();
      }).not.toThrow();
    });
  });

  describe('setZoom', () => {
    it('VWR-012: setZoom changes zoom level', () => {
      viewer.setZoom(2);
      expect(viewer.getZoom()).toBe(2);
    });

    it('VWR-013: setZoom resets pan', () => {
      viewer.setPan(100, 100);
      viewer.setZoom(2);
      const pan = viewer.getPan();
      expect(pan.x).toBe(0);
      expect(pan.y).toBe(0);
    });
  });

  describe('setPan', () => {
    it('VWR-014: setPan changes pan position', () => {
      viewer.setPan(50, 75);
      const pan = viewer.getPan();
      expect(pan.x).toBe(50);
      expect(pan.y).toBe(75);
    });

    it('VWR-015: setPan accepts negative values', () => {
      viewer.setPan(-100, -200);
      const pan = viewer.getPan();
      expect(pan.x).toBe(-100);
      expect(pan.y).toBe(-200);
    });
  });

  describe('fitToWindow', () => {
    it('VWR-016: fitToWindow resets zoom to 1', () => {
      viewer.setZoom(3);
      viewer.fitToWindow();
      expect(viewer.getZoom()).toBe(1);
    });

    it('VWR-017: fitToWindow resets pan to 0', () => {
      viewer.setPan(100, 100);
      viewer.fitToWindow();
      const pan = viewer.getPan();
      expect(pan.x).toBe(0);
      expect(pan.y).toBe(0);
    });
  });

  describe('color adjustments', () => {
    it('VWR-018: setColorAdjustments updates values', () => {
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 1.5,
        gamma: 2.2,
      });
      const adjustments = viewer.getColorAdjustments();
      expect(adjustments.exposure).toBe(1.5);
      expect(adjustments.gamma).toBe(2.2);
    });

    it('VWR-019: getColorAdjustments returns copy', () => {
      const adj1 = viewer.getColorAdjustments();
      const adj2 = viewer.getColorAdjustments();
      expect(adj1).not.toBe(adj2);
      expect(adj1).toEqual(adj2);
    });

    it('VWR-020: resetColorAdjustments restores defaults', () => {
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        exposure: 2,
        saturation: 0,
      });
      viewer.resetColorAdjustments();
      expect(viewer.getColorAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });
  });

  describe('LUT handling', () => {
    it('VWR-021: setLUT stores LUT', () => {
      const mockLUT: LUT3D = { 
        title: 'Test', 
        size: 17, 
        data: new Float32Array(17 * 17 * 17 * 3),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1]
      };
      viewer.setLUT(mockLUT);
      expect(viewer.getLUT()).toBe(mockLUT);
    });

    it('VWR-022: setLUT accepts null', () => {
      const mockLUT: LUT3D = { 
        title: 'Test', 
        size: 17, 
        data: new Float32Array(17 * 17 * 17 * 3),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1]
      };
      viewer.setLUT(mockLUT);
      viewer.setLUT(null);
      expect(viewer.getLUT()).toBeNull();
    });

    it('VWR-023: setLUTIntensity clamps to 0-1', () => {
      viewer.setLUTIntensity(1.5);
      expect(viewer.getLUTIntensity()).toBe(1);

      viewer.setLUTIntensity(-0.5);
      expect(viewer.getLUTIntensity()).toBe(0);
    });

    it('VWR-024: setLUTIntensity accepts valid values', () => {
      viewer.setLUTIntensity(0.5);
      expect(viewer.getLUTIntensity()).toBe(0.5);
    });
  });

  describe('wipe state', () => {
    it('VWR-025: setWipeState updates state', () => {
      viewer.setWipeState({ mode: 'horizontal', position: 0.3, showOriginal: 'left' });
      const state = viewer.getWipeState();
      expect(state.mode).toBe('horizontal');
      expect(state.position).toBe(0.3);
    });

    it('VWR-026: getWipeState returns copy', () => {
      const state1 = viewer.getWipeState();
      const state2 = viewer.getWipeState();
      expect(state1).not.toBe(state2);
    });

    it('VWR-027: setWipeMode changes mode', () => {
      viewer.setWipeMode('vertical');
      expect(viewer.getWipeState().mode).toBe('vertical');
    });

    it('VWR-028: setWipePosition clamps to 0-1', () => {
      viewer.setWipePosition(1.5);
      expect(viewer.getWipeState().position).toBe(1);

      viewer.setWipePosition(-0.5);
      expect(viewer.getWipeState().position).toBe(0);
    });

    it('WIPE-001: wipe mode can be enabled', () => {
      expect(viewer.getWipeState().mode).toBe('off');
      viewer.setWipeMode('horizontal');
      expect(viewer.getWipeState().mode).toBe('horizontal');
    });

    it('WIPE-003: vertical/horizontal toggle works', () => {
      viewer.setWipeMode('horizontal');
      expect(viewer.getWipeState().mode).toBe('horizontal');

      viewer.setWipeMode('vertical');
      expect(viewer.getWipeState().mode).toBe('vertical');

      viewer.setWipeMode('off');
      expect(viewer.getWipeState().mode).toBe('off');
    });

    it('WIPE-005: source labels have default values', () => {
      const labels = viewer.getWipeLabels();
      expect(labels.labelA).toBe('Original');
      expect(labels.labelB).toBe('Graded');
    });

    it('WIPE-005b: setWipeLabels updates label text', () => {
      viewer.setWipeLabels('Source A', 'Source B');
      const labels = viewer.getWipeLabels();
      expect(labels.labelA).toBe('Source A');
      expect(labels.labelB).toBe('Source B');
    });

    it('WIPE-005c: wipe label elements exist', () => {
      const container = viewer.getContainer();
      const labelA = container.querySelector('[data-testid="wipe-label-a"]');
      const labelB = container.querySelector('[data-testid="wipe-label-b"]');
      expect(labelA).not.toBeNull();
      expect(labelB).not.toBeNull();
    });

    it('WIPE-005d: wipe labels hidden when wipe mode is off', () => {
      viewer.setWipeMode('off');
      const container = viewer.getContainer();
      const labelA = container.querySelector('[data-testid="wipe-label-a"]') as HTMLElement;
      const labelB = container.querySelector('[data-testid="wipe-label-b"]') as HTMLElement;
      expect(labelA.style.display).toBe('none');
      expect(labelB.style.display).toBe('none');
    });
  });

  describe('transform', () => {
    it('VWR-029: setTransform updates transform', () => {
      viewer.setTransform({ ...DEFAULT_TRANSFORM, rotation: 90, flipH: true, flipV: false });
      const transform = viewer.getTransform();
      expect(transform.rotation).toBe(90);
      expect(transform.flipH).toBe(true);
    });

    it('VWR-030: getTransform returns copy', () => {
      const t1 = viewer.getTransform();
      const t2 = viewer.getTransform();
      expect(t1).not.toBe(t2);
      expect(t1).toEqual(t2);
    });
  });

  describe('filter settings', () => {
    it('VWR-031: setFilterSettings updates settings', () => {
      viewer.setFilterSettings({ blur: 5, sharpen: 50 });
      const settings = viewer.getFilterSettings();
      expect(settings.blur).toBe(5);
      expect(settings.sharpen).toBe(50);
    });

    it('VWR-032: getFilterSettings returns copy', () => {
      const s1 = viewer.getFilterSettings();
      const s2 = viewer.getFilterSettings();
      expect(s1).not.toBe(s2);
      expect(s1).toEqual(s2);
    });

    it('VWR-033: resetFilterSettings restores defaults', () => {
      viewer.setFilterSettings({ blur: 10, sharpen: 80 });
      viewer.resetFilterSettings();
      expect(viewer.getFilterSettings()).toEqual(DEFAULT_FILTER_SETTINGS);
    });
  });

  describe('crop state', () => {
    it('VWR-034: setCropState updates state', () => {
      viewer.setCropState({
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        aspectRatio: '16:9',
      });
      const state = viewer.getCropState();
      expect(state.enabled).toBe(true);
      expect(state.aspectRatio).toBe('16:9');
    });

    it('VWR-035: getCropState returns copy', () => {
      const c1 = viewer.getCropState();
      const c2 = viewer.getCropState();
      expect(c1).not.toBe(c2);
      expect(c1.region).not.toBe(c2.region);
    });

    it('VWR-036: setCropRegion updates region', () => {
      viewer.setCropRegion({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
      const state = viewer.getCropState();
      expect(state.region.x).toBe(0.2);
      expect(state.region.width).toBe(0.6);
    });

    it('VWR-037: setCropEnabled toggles enabled', () => {
      viewer.setCropEnabled(true);
      expect(viewer.getCropState().enabled).toBe(true);

      viewer.setCropEnabled(false);
      expect(viewer.getCropState().enabled).toBe(false);
    });

    it('VWR-100: setCropPanelOpen stores panel state', () => {
      viewer.setCropPanelOpen(true);
      expect(testable(viewer).cropManager._isCropPanelOpen).toBe(true);

      viewer.setCropPanelOpen(false);
      expect(testable(viewer).cropManager._isCropPanelOpen).toBe(false);
    });

    it('VWR-101: setOnCropRegionChanged stores callback', () => {
      const callback = vi.fn();
      viewer.setOnCropRegionChanged(callback);
      expect(testable(viewer).cropManager.cropRegionChangedCallback).toBe(callback);
    });

    it('VWR-102: setOnCropRegionChanged(null) clears callback', () => {
      viewer.setOnCropRegionChanged(vi.fn());
      viewer.setOnCropRegionChanged(null);
      expect(testable(viewer).cropManager.cropRegionChangedCallback).toBeNull();
    });

    it('VWR-103: handleCropPointerUp invokes callback with region copy', () => {
      const callback = vi.fn();
      viewer.setOnCropRegionChanged(callback);

      // Setup crop state
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
      testable(viewer).cropManager._isDraggingCrop = true;

      testable(viewer).cropManager.handleCropPointerUp();

      expect(callback).toHaveBeenCalledWith({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
      // Should be a copy
      const callArg = callback.mock.calls[0][0];
      expect(callArg).not.toBe(testable(viewer).cropManager._cropState.region);
    });

    it('VWR-104: handleCropPointerUp does not invoke callback when not dragging', () => {
      const callback = vi.fn();
      viewer.setOnCropRegionChanged(callback);
      testable(viewer).cropManager._isDraggingCrop = false;

      testable(viewer).cropManager.handleCropPointerUp();

      expect(callback).not.toHaveBeenCalled();
    });

    it('VWR-105: handleCropPointerUp resets drag state', () => {
      viewer.setCropEnabled(true);
      testable(viewer).cropManager._isDraggingCrop = true;
      testable(viewer).cropManager.cropDragHandle = 'br';
      testable(viewer).cropManager.cropDragStart = { x: 0.5, y: 0.5, region: { x: 0, y: 0, width: 1, height: 1 } };

      testable(viewer).cropManager.handleCropPointerUp();

      expect(testable(viewer).cropManager._isDraggingCrop).toBe(false);
      expect(testable(viewer).cropManager.cropDragHandle).toBeNull();
      expect(testable(viewer).cropManager.cropDragStart).toBeNull();
    });

    it('VWR-106: getCropHandleAtPoint returns null when crop disabled', () => {
      viewer.setCropEnabled(false);
      viewer.setCropPanelOpen(true);
      const result = testable(viewer).cropManager.getCropHandleAtPoint(100, 100);
      expect(result).toBeNull();
    });

    it('VWR-107: getCropHandleAtPoint returns null when panel closed', () => {
      viewer.setCropEnabled(true);
      viewer.setCropPanelOpen(false);
      const result = testable(viewer).cropManager.getCropHandleAtPoint(100, 100);
      expect(result).toBeNull();
    });

    it('VWR-108: handleCropPointerDown returns false when crop disabled', () => {
      viewer.setCropEnabled(false);
      viewer.setCropPanelOpen(true);
      const event = { clientX: 50, clientY: 50, pointerId: 1 } as unknown as PointerEvent;
      const result = testable(viewer).cropManager.handleCropPointerDown(event);
      expect(result).toBe(false);
    });

    it('VWR-109: handleCropPointerDown returns false when panel closed', () => {
      viewer.setCropEnabled(true);
      viewer.setCropPanelOpen(false);
      const event = { clientX: 50, clientY: 50, pointerId: 1 } as unknown as PointerEvent;
      const result = testable(viewer).cropManager.handleCropPointerDown(event);
      expect(result).toBe(false);
    });

    it('VWR-110: updateCropCursor sets correct cursor for corners', () => {
      testable(viewer).cropManager.updateCropCursor('tl');
      expect(testable(viewer).container.style.cursor).toBe('nwse-resize');

      testable(viewer).cropManager.updateCropCursor('br');
      expect(testable(viewer).container.style.cursor).toBe('nwse-resize');

      testable(viewer).cropManager.updateCropCursor('tr');
      expect(testable(viewer).container.style.cursor).toBe('nesw-resize');

      testable(viewer).cropManager.updateCropCursor('bl');
      expect(testable(viewer).container.style.cursor).toBe('nesw-resize');
    });

    it('VWR-111: updateCropCursor sets correct cursor for edges', () => {
      testable(viewer).cropManager.updateCropCursor('top');
      expect(testable(viewer).container.style.cursor).toBe('ns-resize');

      testable(viewer).cropManager.updateCropCursor('bottom');
      expect(testable(viewer).container.style.cursor).toBe('ns-resize');

      testable(viewer).cropManager.updateCropCursor('left');
      expect(testable(viewer).container.style.cursor).toBe('ew-resize');

      testable(viewer).cropManager.updateCropCursor('right');
      expect(testable(viewer).container.style.cursor).toBe('ew-resize');
    });

    it('VWR-112: updateCropCursor sets move cursor for move handle', () => {
      testable(viewer).cropManager.updateCropCursor('move');
      expect(testable(viewer).container.style.cursor).toBe('move');
    });

    it('VWR-113: updateCropCursor sets default cursor for null', () => {
      testable(viewer).cropManager.updateCropCursor(null);
      expect(testable(viewer).container.style.cursor).toBe('default');
    });

    it('VWR-114: handleCropPointerMove updates region for br handle', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });
      viewer.setCropPanelOpen(true);

      // Simulate drag start state
      testable(viewer).cropManager._isDraggingCrop = true;
      testable(viewer).cropManager.cropDragHandle = 'br';
      testable(viewer).cropManager.cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropManager.cropDragStart = {
        x: 1.0,
        y: 1.0,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };

      // Simulate drag to shrink (move br corner inward by 0.2)
      const event = { clientX: 640, clientY: 480 } as unknown as PointerEvent;
      testable(viewer).cropManager.handleCropPointerMove(event);

      const region = testable(viewer).cropManager._cropState.region;
      expect(region.width).toBeCloseTo(0.8, 1);
      expect(region.height).toBeCloseTo(0.8, 1);
    });

    it('VWR-115: handleCropPointerMove clamps move to bounds', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0.5, y: 0.5, width: 0.3, height: 0.3 });
      viewer.setCropPanelOpen(true);

      testable(viewer).cropManager._isDraggingCrop = true;
      testable(viewer).cropManager.cropDragHandle = 'move';
      testable(viewer).cropManager.cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropManager.cropDragStart = {
        x: 0.65,
        y: 0.65,
        region: { x: 0.5, y: 0.5, width: 0.3, height: 0.3 },
      };

      // Try to drag way beyond bounds
      const event = { clientX: 800, clientY: 600 } as unknown as PointerEvent;
      testable(viewer).cropManager.handleCropPointerMove(event);

      const region = testable(viewer).cropManager._cropState.region;
      // x + width should not exceed 1
      expect(region.x + region.width).toBeLessThanOrEqual(1.001);
      expect(region.y + region.height).toBeLessThanOrEqual(1.001);
    });

    it('VWR-116: handleCropPointerMove enforces MIN_CROP_FRACTION', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 0.5, height: 0.5 });
      viewer.setCropPanelOpen(true);

      testable(viewer).cropManager._isDraggingCrop = true;
      testable(viewer).cropManager.cropDragHandle = 'br';
      testable(viewer).cropManager.cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropManager.cropDragStart = {
        x: 0.5,
        y: 0.5,
        region: { x: 0, y: 0, width: 0.5, height: 0.5 },
      };

      // Drag br corner to origin (try to make region 0-width)
      const event = { clientX: 0, clientY: 0 } as unknown as PointerEvent;
      testable(viewer).cropManager.handleCropPointerMove(event);

      const region = testable(viewer).cropManager._cropState.region;
      expect(region.width).toBeGreaterThanOrEqual(0.05);
      expect(region.height).toBeGreaterThanOrEqual(0.05);
    });

    it('VWR-117: handleCropPointerMove with tl handle adjusts position and size', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });
      viewer.setCropPanelOpen(true);

      testable(viewer).cropManager._isDraggingCrop = true;
      testable(viewer).cropManager.cropDragHandle = 'tl';
      testable(viewer).cropManager.cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropManager.cropDragStart = {
        x: 0,
        y: 0,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };

      // Drag tl corner inward by 0.2
      const event = { clientX: 160, clientY: 120 } as unknown as PointerEvent;
      testable(viewer).cropManager.handleCropPointerMove(event);

      const region = testable(viewer).cropManager._cropState.region;
      expect(region.x).toBeCloseTo(0.2, 1);
      expect(region.y).toBeCloseTo(0.2, 1);
      expect(region.width).toBeCloseTo(0.8, 1);
      expect(region.height).toBeCloseTo(0.8, 1);
    });

    it('VWR-118: handleCropPointerMove with right edge only changes width', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });
      viewer.setCropPanelOpen(true);

      testable(viewer).cropManager._isDraggingCrop = true;
      testable(viewer).cropManager.cropDragHandle = 'right';
      testable(viewer).cropManager.cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropManager.cropDragStart = {
        x: 1.0,
        y: 0.5,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };

      // Drag right edge inward by 0.3
      const event = { clientX: 560, clientY: 300 } as unknown as PointerEvent;
      testable(viewer).cropManager.handleCropPointerMove(event);

      const region = testable(viewer).cropManager._cropState.region;
      expect(region.width).toBeCloseTo(0.7, 1);
      expect(region.height).toBeCloseTo(1, 1); // height unchanged
    });

    it('VWR-119: constrainToAspectRatio preserves ratio during drag', () => {
      viewer.setCropEnabled(true);
      viewer.setCropState({
        enabled: true,
        region: { x: 0, y: 0, width: 0.8, height: 0.8 },
        aspectRatio: '1:1',
      });

      // Mock source
      testable(viewer).session = {
        ...session,
        currentSource: { type: 'image' as const, name: 'test', url: '', width: 1920, height: 1080, duration: 1, fps: 24 },
      };

      const input = { x: 0, y: 0, width: 0.6, height: 0.8 };
      const result = testable(viewer).cropManager.constrainToAspectRatio(input, 'br');

      // For 1:1 pixel ratio on 1920x1080, normalizedRatio = 1 / (1920/1080) ≈ 0.5625
      const sourceAspect = 1920 / 1080;
      const normalizedRatio = 1 / sourceAspect;
      const actualRatio = result.width / result.height;
      expect(actualRatio).toBeCloseTo(normalizedRatio, 2);
    });

    it('VWR-120: constrainToAspectRatio clamps to bounds', () => {
      viewer.setCropEnabled(true);
      viewer.setCropState({
        enabled: true,
        region: { x: 0.8, y: 0.8, width: 0.5, height: 0.5 },
        aspectRatio: '16:9',
      });

      testable(viewer).session = {
        ...session,
        currentSource: { type: 'image' as const, name: 'test', url: '', width: 1920, height: 1080, duration: 1, fps: 24 },
      };

      const input = { x: 0.8, y: 0.8, width: 0.5, height: 0.5 };
      const result = testable(viewer).cropManager.constrainToAspectRatio(input, 'br');

      // Result should be within bounds
      expect(result.x + result.width).toBeLessThanOrEqual(1.001);
      expect(result.y + result.height).toBeLessThanOrEqual(1.001);
    });

    it('VWR-121: constrainToAspectRatio returns input when no aspect ratio match', () => {
      viewer.setCropState({
        enabled: true,
        region: { x: 0, y: 0, width: 1, height: 1 },
        aspectRatio: 'invalid',
      });

      const input = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
      const result = testable(viewer).cropManager.constrainToAspectRatio(input, 'br');

      expect(result).toEqual(input);
    });

    it('VWR-122: constrainToAspectRatio returns input when no source', () => {
      viewer.setCropState({
        enabled: true,
        region: { x: 0, y: 0, width: 1, height: 1 },
        aspectRatio: '16:9',
      });

      testable(viewer).session = { ...session, currentSource: null };

      const input = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
      const result = testable(viewer).cropManager.constrainToAspectRatio(input, 'br');

      // sourceWidth/height defaults to ?? 1 so it should still work
      // but the logic handles null with ?? 1
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });
  });

  describe('CDL', () => {
    it('VWR-038: setCDL updates CDL values', () => {
      const cdl = {
        slope: { r: 1.2, g: 1.0, b: 0.9 },
        offset: { r: 0.1, g: 0, b: -0.05 },
        power: { r: 1, g: 1, b: 1 },
        saturation: 1.1,
      };
      viewer.setCDL(cdl);
      const result = viewer.getCDL();
      expect(result.slope.r).toBe(1.2);
      expect(result.saturation).toBe(1.1);
    });

    it('VWR-039: getCDL returns deep copy', () => {
      const cdl1 = viewer.getCDL();
      const cdl2 = viewer.getCDL();
      expect(cdl1).not.toBe(cdl2);
      expect(cdl1.slope).not.toBe(cdl2.slope);
    });

    it('VWR-040: resetCDL restores defaults', () => {
      viewer.setCDL({
        slope: { r: 2, g: 2, b: 2 },
        offset: { r: 0.5, g: 0.5, b: 0.5 },
        power: { r: 2, g: 2, b: 2 },
        saturation: 2,
      });
      viewer.resetCDL();
      const cdl = viewer.getCDL();
      expect(cdl.slope.r).toBe(DEFAULT_CDL.slope.r);
      expect(cdl.saturation).toBe(DEFAULT_CDL.saturation);
    });
  });

  describe('lens distortion', () => {
    it('VWR-041: setLensParams updates params', () => {
      viewer.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.2, k2: 0.05, centerX: 0.5, centerY: 0.5, scale: 1.1 });
      const params = viewer.getLensParams();
      expect(params.k1).toBe(0.2);
      expect(params.scale).toBe(1.1);
    });

    it('VWR-042: getLensParams returns copy', () => {
      const p1 = viewer.getLensParams();
      const p2 = viewer.getLensParams();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });

    it('VWR-043: resetLensParams restores defaults', () => {
      viewer.setLensParams({ ...DEFAULT_LENS_PARAMS, k1: 0.5, k2: 0.2, centerX: 0.4, centerY: 0.6, scale: 1.5 });
      viewer.resetLensParams();
      expect(viewer.getLensParams()).toEqual(DEFAULT_LENS_PARAMS);
    });
  });

  describe('stack layers', () => {
    it('VWR-044: setStackLayers updates layers', () => {
      const layers: StackLayer[] = [
        { id: '1', name: 'L1', sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true },
        { id: '2', name: 'L2', sourceIndex: 1, blendMode: 'multiply', opacity: 0.5, visible: true },
      ];
      viewer.setStackLayers(layers);
      const result = viewer.getStackLayers();
      expect(result.length).toBe(2);
    });

    it('VWR-045: getStackLayers returns copy', () => {
      const layers: StackLayer[] = [{ id: '1', name: 'L1', sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true }];
      viewer.setStackLayers(layers);
      const l1 = viewer.getStackLayers();
      const l2 = viewer.getStackLayers();
      expect(l1).not.toBe(l2);
    });

    it('VWR-046: setStackEnabled toggles stack mode', () => {
      viewer.setStackEnabled(true);
      // Stack requires multiple layers to be active
      expect(viewer.isStackEnabled()).toBe(false); // No layers yet

      viewer.setStackLayers([
        { id: '1', name: 'L1', sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true },
        { id: '2', name: 'L2', sourceIndex: 1, blendMode: 'normal', opacity: 1, visible: true },
      ]);
      viewer.setStackEnabled(true);
      expect(viewer.isStackEnabled()).toBe(true);
    });

    it('VWR-047: isStackEnabled requires multiple layers', () => {
      viewer.setStackEnabled(true);
      viewer.setStackLayers([{ id: '1', name: 'L1', sourceIndex: 0, blendMode: 'normal', opacity: 1, visible: true }]);
      expect(viewer.isStackEnabled()).toBe(false); // Only 1 layer
    });
  });

  describe('getPaintEngine', () => {
    it('VWR-048: returns paint engine instance', () => {
      expect(viewer.getPaintEngine()).toBe(paintEngine);
    });
  });

  describe('dispose', () => {
    it('VWR-049: dispose does not throw', () => {
      expect(() => {
        viewer.dispose();
      }).not.toThrow();
    });

    it('VWR-050: dispose can be called multiple times', () => {
      expect(() => {
        viewer.dispose();
        viewer.dispose();
      }).not.toThrow();
    });
  });

  describe('session events', () => {
    it('VWR-051: responds to sourceLoaded event', () => {
      expect(() => {
        session.emit('sourceLoaded', {} as MediaSource);
      }).not.toThrow();
    });

    it('VWR-052: responds to frameChanged event', () => {
      expect(() => {
        session.currentFrame = 10;
      }).not.toThrow();
    });
  });

  describe('paint events', () => {
    it('VWR-053: responds to annotationsChanged event', () => {
      expect(() => {
        paintEngine.emit('annotationsChanged', 0);
      }).not.toThrow();
    });

    it('VWR-054: responds to toolChanged event', () => {
      expect(() => {
        paintEngine.emit('toolChanged', 'pen');
      }).not.toThrow();
    });
  });

});
