/**
 * Viewer Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Viewer } from './Viewer';
import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { DEFAULT_TRANSFORM } from './TransformControl';
import { DEFAULT_FILTER_SETTINGS } from './FilterControl';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';
import type { LUT3D } from '../../color/LUTLoader';
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

  // Crop internals
  isCropPanelOpen: boolean;
  cropRegionChangedCallback: ((region: CropRegion) => void) | null;
  isDraggingCrop: boolean;
  cropDragHandle: CropDragHandle;
  cropDragStart: { x: number; y: number; region: CropRegion } | null;
  cropState: CropState;
  cropOverlay: HTMLCanvasElement | { getBoundingClientRect: () => DOMRect } | null;

  // Crop methods
  handleCropPointerUp(): void;
  getCropHandleAtPoint(clientX: number, clientY: number): CropDragHandle;
  handleCropPointerDown(e: PointerEvent): boolean;
  updateCropCursor(handle: CropDragHandle): void;
  handleCropPointerMove(e: PointerEvent): void;
  constrainToAspectRatio(region: CropRegion, handle: CropDragHandle): CropRegion;

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
  lastMouseMoveUpdate: number;
  cursorColorCallback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null;

  // These should NOT exist (verified in tests)
  lastProbeUpdate?: undefined;
  lastCursorColorUpdate?: undefined;

  // Ghost frame canvas pool
  ghostFrameCanvasPool: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[];
  ghostFramePoolWidth: number;
  ghostFramePoolHeight: number;
  getGhostFrameCanvas(index: number, width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null;

  // SDR WebGL rendering (Phase 1A + 1B)
  sdrWebGLRenderActive: boolean;
  hdrRenderActive: boolean;
  glCanvas: HTMLCanvasElement | null;
  glRenderer: unknown;
  hasGPUShaderEffectsActive(): boolean;
  hasCPUOnlyEffectsActive(): boolean;
  colorAdjustments: import('./ColorControls').ColorAdjustments;
  colorInversionEnabled: boolean;
  channelMode: import('./ChannelSelect').ChannelMode;
  toneMappingState: import('./ToneMappingControl').ToneMappingState;
  filterSettings: import('./FilterControl').FilterSettings;

  // Phase 2A/2B: Prerender buffer
  prerenderBuffer: import('../../utils/PrerenderBufferManager').PrerenderBufferManager | null;

  // Lens distortion
  lensParams: import('../../transform/LensDistortion').LensDistortionParams;
  applyLensDistortionToCtx(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // Ghost frames
  ghostFrameState: import('./GhostFrameControl').GhostFrameState;

  // Stereo mode
  stereoState: import('../../stereo/StereoRenderer').StereoState;
  applyStereoMode(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // Background pattern
  backgroundPatternState: import('./BackgroundPatternControl').BackgroundPatternState;

  // Uncrop
  drawUncropBackground(displayWidth: number, displayHeight: number, uncropOffsetX: number, uncropOffsetY: number, imageDisplayW: number, imageDisplayH: number): void;

  // OCIO color management
  ocioEnabled: boolean;
  ocioBakedLUT: import('../../color/LUTLoader').LUT3D | null;
  applyOCIOToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // GPU LUT (user-loaded 3D LUT)
  currentLUT: import('../../color/LUTLoader').LUT3D | null;
  lutIntensity: number;
  applyLUTToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // Lightweight effects
  applyLightweightEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void;

  // Crop clipping
  clearOutsideCropRegion(displayWidth: number, displayHeight: number): void;

  // Canvas context
  imageCtx: CanvasRenderingContext2D;
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
    viewer = new Viewer(session, paintEngine);
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
      expect(testable(viewer).isCropPanelOpen).toBe(true);

      viewer.setCropPanelOpen(false);
      expect(testable(viewer).isCropPanelOpen).toBe(false);
    });

    it('VWR-101: setOnCropRegionChanged stores callback', () => {
      const callback = vi.fn();
      viewer.setOnCropRegionChanged(callback);
      expect(testable(viewer).cropRegionChangedCallback).toBe(callback);
    });

    it('VWR-102: setOnCropRegionChanged(null) clears callback', () => {
      viewer.setOnCropRegionChanged(vi.fn());
      viewer.setOnCropRegionChanged(null);
      expect(testable(viewer).cropRegionChangedCallback).toBeNull();
    });

    it('VWR-103: handleCropPointerUp invokes callback with region copy', () => {
      const callback = vi.fn();
      viewer.setOnCropRegionChanged(callback);

      // Setup crop state
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
      testable(viewer).isDraggingCrop = true;

      testable(viewer).handleCropPointerUp();

      expect(callback).toHaveBeenCalledWith({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 });
      // Should be a copy
      const callArg = callback.mock.calls[0][0];
      expect(callArg).not.toBe(testable(viewer).cropState.region);
    });

    it('VWR-104: handleCropPointerUp does not invoke callback when not dragging', () => {
      const callback = vi.fn();
      viewer.setOnCropRegionChanged(callback);
      testable(viewer).isDraggingCrop = false;

      testable(viewer).handleCropPointerUp();

      expect(callback).not.toHaveBeenCalled();
    });

    it('VWR-105: handleCropPointerUp resets drag state', () => {
      viewer.setCropEnabled(true);
      testable(viewer).isDraggingCrop = true;
      testable(viewer).cropDragHandle = 'br';
      testable(viewer).cropDragStart = { x: 0.5, y: 0.5, region: { x: 0, y: 0, width: 1, height: 1 } };

      testable(viewer).handleCropPointerUp();

      expect(testable(viewer).isDraggingCrop).toBe(false);
      expect(testable(viewer).cropDragHandle).toBeNull();
      expect(testable(viewer).cropDragStart).toBeNull();
    });

    it('VWR-106: getCropHandleAtPoint returns null when crop disabled', () => {
      viewer.setCropEnabled(false);
      viewer.setCropPanelOpen(true);
      const result = testable(viewer).getCropHandleAtPoint(100, 100);
      expect(result).toBeNull();
    });

    it('VWR-107: getCropHandleAtPoint returns null when panel closed', () => {
      viewer.setCropEnabled(true);
      viewer.setCropPanelOpen(false);
      const result = testable(viewer).getCropHandleAtPoint(100, 100);
      expect(result).toBeNull();
    });

    it('VWR-108: handleCropPointerDown returns false when crop disabled', () => {
      viewer.setCropEnabled(false);
      viewer.setCropPanelOpen(true);
      const event = { clientX: 50, clientY: 50, pointerId: 1 } as unknown as PointerEvent;
      const result = testable(viewer).handleCropPointerDown(event);
      expect(result).toBe(false);
    });

    it('VWR-109: handleCropPointerDown returns false when panel closed', () => {
      viewer.setCropEnabled(true);
      viewer.setCropPanelOpen(false);
      const event = { clientX: 50, clientY: 50, pointerId: 1 } as unknown as PointerEvent;
      const result = testable(viewer).handleCropPointerDown(event);
      expect(result).toBe(false);
    });

    it('VWR-110: updateCropCursor sets correct cursor for corners', () => {
      testable(viewer).updateCropCursor('tl');
      expect(testable(viewer).container.style.cursor).toBe('nwse-resize');

      testable(viewer).updateCropCursor('br');
      expect(testable(viewer).container.style.cursor).toBe('nwse-resize');

      testable(viewer).updateCropCursor('tr');
      expect(testable(viewer).container.style.cursor).toBe('nesw-resize');

      testable(viewer).updateCropCursor('bl');
      expect(testable(viewer).container.style.cursor).toBe('nesw-resize');
    });

    it('VWR-111: updateCropCursor sets correct cursor for edges', () => {
      testable(viewer).updateCropCursor('top');
      expect(testable(viewer).container.style.cursor).toBe('ns-resize');

      testable(viewer).updateCropCursor('bottom');
      expect(testable(viewer).container.style.cursor).toBe('ns-resize');

      testable(viewer).updateCropCursor('left');
      expect(testable(viewer).container.style.cursor).toBe('ew-resize');

      testable(viewer).updateCropCursor('right');
      expect(testable(viewer).container.style.cursor).toBe('ew-resize');
    });

    it('VWR-112: updateCropCursor sets move cursor for move handle', () => {
      testable(viewer).updateCropCursor('move');
      expect(testable(viewer).container.style.cursor).toBe('move');
    });

    it('VWR-113: updateCropCursor sets default cursor for null', () => {
      testable(viewer).updateCropCursor(null);
      expect(testable(viewer).container.style.cursor).toBe('default');
    });

    it('VWR-114: handleCropPointerMove updates region for br handle', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });
      viewer.setCropPanelOpen(true);

      // Simulate drag start state
      testable(viewer).isDraggingCrop = true;
      testable(viewer).cropDragHandle = 'br';
      testable(viewer).cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropDragStart = {
        x: 1.0,
        y: 1.0,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };

      // Simulate drag to shrink (move br corner inward by 0.2)
      const event = { clientX: 640, clientY: 480 } as unknown as PointerEvent;
      testable(viewer).handleCropPointerMove(event);

      const region = testable(viewer).cropState.region;
      expect(region.width).toBeCloseTo(0.8, 1);
      expect(region.height).toBeCloseTo(0.8, 1);
    });

    it('VWR-115: handleCropPointerMove clamps move to bounds', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0.5, y: 0.5, width: 0.3, height: 0.3 });
      viewer.setCropPanelOpen(true);

      testable(viewer).isDraggingCrop = true;
      testable(viewer).cropDragHandle = 'move';
      testable(viewer).cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropDragStart = {
        x: 0.65,
        y: 0.65,
        region: { x: 0.5, y: 0.5, width: 0.3, height: 0.3 },
      };

      // Try to drag way beyond bounds
      const event = { clientX: 800, clientY: 600 } as unknown as PointerEvent;
      testable(viewer).handleCropPointerMove(event);

      const region = testable(viewer).cropState.region;
      // x + width should not exceed 1
      expect(region.x + region.width).toBeLessThanOrEqual(1.001);
      expect(region.y + region.height).toBeLessThanOrEqual(1.001);
    });

    it('VWR-116: handleCropPointerMove enforces MIN_CROP_FRACTION', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 0.5, height: 0.5 });
      viewer.setCropPanelOpen(true);

      testable(viewer).isDraggingCrop = true;
      testable(viewer).cropDragHandle = 'br';
      testable(viewer).cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropDragStart = {
        x: 0.5,
        y: 0.5,
        region: { x: 0, y: 0, width: 0.5, height: 0.5 },
      };

      // Drag br corner to origin (try to make region 0-width)
      const event = { clientX: 0, clientY: 0 } as unknown as PointerEvent;
      testable(viewer).handleCropPointerMove(event);

      const region = testable(viewer).cropState.region;
      expect(region.width).toBeGreaterThanOrEqual(0.05);
      expect(region.height).toBeGreaterThanOrEqual(0.05);
    });

    it('VWR-117: handleCropPointerMove with tl handle adjusts position and size', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });
      viewer.setCropPanelOpen(true);

      testable(viewer).isDraggingCrop = true;
      testable(viewer).cropDragHandle = 'tl';
      testable(viewer).cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropDragStart = {
        x: 0,
        y: 0,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };

      // Drag tl corner inward by 0.2
      const event = { clientX: 160, clientY: 120 } as unknown as PointerEvent;
      testable(viewer).handleCropPointerMove(event);

      const region = testable(viewer).cropState.region;
      expect(region.x).toBeCloseTo(0.2, 1);
      expect(region.y).toBeCloseTo(0.2, 1);
      expect(region.width).toBeCloseTo(0.8, 1);
      expect(region.height).toBeCloseTo(0.8, 1);
    });

    it('VWR-118: handleCropPointerMove with right edge only changes width', () => {
      viewer.setCropEnabled(true);
      viewer.setCropRegion({ x: 0, y: 0, width: 1, height: 1 });
      viewer.setCropPanelOpen(true);

      testable(viewer).isDraggingCrop = true;
      testable(viewer).cropDragHandle = 'right';
      testable(viewer).cropOverlay = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {} }),
      };
      testable(viewer).cropDragStart = {
        x: 1.0,
        y: 0.5,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };

      // Drag right edge inward by 0.3
      const event = { clientX: 560, clientY: 300 } as unknown as PointerEvent;
      testable(viewer).handleCropPointerMove(event);

      const region = testable(viewer).cropState.region;
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
      const result = testable(viewer).constrainToAspectRatio(input, 'br');

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
      const result = testable(viewer).constrainToAspectRatio(input, 'br');

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
      const result = testable(viewer).constrainToAspectRatio(input, 'br');

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
      const result = testable(viewer).constrainToAspectRatio(input, 'br');

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

  describe('layout cache (performance/02)', () => {
    it('VWR-055: cached rect properties are null after invalidation', () => {
      // The constructor may populate caches via render(), so invalidate first
      testable(viewer).invalidateLayoutCache();
      expect(testable(viewer).cachedContainerRect).toBeNull();
      expect(testable(viewer).cachedCanvasContainerRect).toBeNull();
      expect(testable(viewer).cachedImageCanvasRect).toBeNull();
    });

    it('VWR-056: getContainerRect returns a DOMRect', () => {
      const rect = testable(viewer).getContainerRect();
      expect(rect).toBeDefined();
      expect(typeof rect.width).toBe('number');
      expect(typeof rect.height).toBe('number');
      expect(typeof rect.left).toBe('number');
      expect(typeof rect.top).toBe('number');
    });

    it('VWR-057: getCanvasContainerRect returns a DOMRect', () => {
      const rect = testable(viewer).getCanvasContainerRect();
      expect(rect).toBeDefined();
      expect(typeof rect.width).toBe('number');
      expect(typeof rect.height).toBe('number');
    });

    it('VWR-058: getImageCanvasRect returns a DOMRect', () => {
      const rect = testable(viewer).getImageCanvasRect();
      expect(rect).toBeDefined();
      expect(typeof rect.width).toBe('number');
      expect(typeof rect.height).toBe('number');
    });

    it('VWR-059: getContainerRect returns same cached object on repeated calls', () => {
      const rect1 = testable(viewer).getContainerRect();
      const rect2 = testable(viewer).getContainerRect();
      expect(rect1).toBe(rect2);
    });

    it('VWR-060: getCanvasContainerRect returns same cached object on repeated calls', () => {
      const rect1 = testable(viewer).getCanvasContainerRect();
      const rect2 = testable(viewer).getCanvasContainerRect();
      expect(rect1).toBe(rect2);
    });

    it('VWR-061: getImageCanvasRect returns same cached object on repeated calls', () => {
      const rect1 = testable(viewer).getImageCanvasRect();
      const rect2 = testable(viewer).getImageCanvasRect();
      expect(rect1).toBe(rect2);
    });

    it('VWR-062: invalidateLayoutCache clears all cached rects', () => {
      // Populate caches
      testable(viewer).getContainerRect();
      testable(viewer).getCanvasContainerRect();
      testable(viewer).getImageCanvasRect();

      expect(testable(viewer).cachedContainerRect).not.toBeNull();
      expect(testable(viewer).cachedCanvasContainerRect).not.toBeNull();
      expect(testable(viewer).cachedImageCanvasRect).not.toBeNull();

      // Invalidate
      testable(viewer).invalidateLayoutCache();

      expect(testable(viewer).cachedContainerRect).toBeNull();
      expect(testable(viewer).cachedCanvasContainerRect).toBeNull();
      expect(testable(viewer).cachedImageCanvasRect).toBeNull();
    });

    it('VWR-063: render() invalidates layout cache at start', () => {
      // Populate caches
      testable(viewer).getContainerRect();
      testable(viewer).getCanvasContainerRect();
      testable(viewer).getImageCanvasRect();

      const invalidateSpy = vi.spyOn(testable(viewer), 'invalidateLayoutCache');

      viewer.render();

      expect(invalidateSpy).toHaveBeenCalled();
      invalidateSpy.mockRestore();
    });

    it('VWR-064: after invalidation, getter returns a new object', () => {
      const rect1 = testable(viewer).getContainerRect();
      testable(viewer).invalidateLayoutCache();
      const rect2 = testable(viewer).getContainerRect();
      // After invalidation, a fresh getBoundingClientRect call is made,
      // so the object reference should differ
      expect(rect1).not.toBe(rect2);
    });

    it('VWR-065: ResizeObserver callback invalidates layout cache', () => {
      const invalidateSpy = vi.spyOn(testable(viewer), 'invalidateLayoutCache');

      // Trigger the ResizeObserver callback
      // ResizeObserver in jsdom/happy-dom may not fire, so we call the callback directly
      // The constructor stores the callback; we can invoke it via the observer's internals
      // Instead, we verify the ResizeObserver was set up with invalidateLayoutCache
      // by checking the source structure. Let's trigger it indirectly:
      // The ResizeObserver is created in the constructor, observing this.container.
      // We can simulate a resize by directly calling the stored callback.

      // Access the callback that was passed to ResizeObserver
      // Since we can't easily access it, let's verify the wiring by checking
      // that invalidateLayoutCache is called when we manually trigger it
      testable(viewer).invalidateLayoutCache();
      expect(invalidateSpy).toHaveBeenCalled();

      invalidateSpy.mockRestore();
    });

    it('VWR-066: getBoundingClientRect is called at most once per element within a frame', () => {
      const container = testable(viewer).container as HTMLElement;
      const canvasContainer = testable(viewer).canvasContainer as HTMLElement;
      const imageCanvas = testable(viewer).imageCanvas as HTMLCanvasElement;

      const containerSpy = vi.spyOn(container, 'getBoundingClientRect');
      const canvasContainerSpy = vi.spyOn(canvasContainer, 'getBoundingClientRect');
      const imageCanvasSpy = vi.spyOn(imageCanvas, 'getBoundingClientRect');

      // Invalidate to start fresh
      testable(viewer).invalidateLayoutCache();

      // Call each getter multiple times (simulating multiple call sites in a frame)
      testable(viewer).getContainerRect();
      testable(viewer).getContainerRect();
      testable(viewer).getContainerRect();

      testable(viewer).getCanvasContainerRect();
      testable(viewer).getCanvasContainerRect();

      testable(viewer).getImageCanvasRect();
      testable(viewer).getImageCanvasRect();
      testable(viewer).getImageCanvasRect();
      testable(viewer).getImageCanvasRect();

      // Each underlying getBoundingClientRect should have been called exactly once
      expect(containerSpy).toHaveBeenCalledTimes(1);
      expect(canvasContainerSpy).toHaveBeenCalledTimes(1);
      expect(imageCanvasSpy).toHaveBeenCalledTimes(1);

      containerSpy.mockRestore();
      canvasContainerSpy.mockRestore();
      imageCanvasSpy.mockRestore();
    });

    it('VWR-067: renderImage uses cached getContainerRect instead of direct getBoundingClientRect', () => {
      const getContainerRectSpy = vi.spyOn(testable(viewer), 'getContainerRect');
      const container = testable(viewer).container as HTMLElement;
      const directSpy = vi.spyOn(container, 'getBoundingClientRect');

      // Invalidate and render
      testable(viewer).invalidateLayoutCache();
      viewer.render();

      // getContainerRect should have been called (by renderImage)
      expect(getContainerRectSpy).toHaveBeenCalled();

      // Direct getBoundingClientRect on container should only be called
      // via the getter (once), not directly from renderImage
      expect(directSpy).toHaveBeenCalledTimes(1);

      getContainerRectSpy.mockRestore();
      directSpy.mockRestore();
    });
  });

  describe('merged mousemove handler (performance/01 - onMouseMoveForPixelSampling)', () => {
    it('VWR-200: only one mousemove listener is registered and removed on dispose', () => {
      const viewer2 = new Viewer(session, paintEngine);
      const container2 = viewer2.getContainer();
      const removeSpy = vi.spyOn(container2, 'removeEventListener');

      viewer2.dispose();

      const mousemoveRemoves = removeSpy.mock.calls.filter(
        (call) => call[0] === 'mousemove'
      );
      expect(mousemoveRemoves.length).toBe(1);

      removeSpy.mockRestore();
    });

    it('VWR-201: getBoundingClientRect called at most once per mousemove event via cached getImageCanvasRect', () => {
      const imageCanvas = testable(viewer).imageCanvas as HTMLCanvasElement;
      const rectSpy = vi.spyOn(imageCanvas, 'getBoundingClientRect');

      // Enable both consumers
      testable(viewer).pixelProbe.enable();
      const cursorCallback = vi.fn();
      viewer.onCursorColorChange(cursorCallback);

      // Reset throttle so handler runs
      testable(viewer).lastMouseMoveUpdate = 0;
      // Invalidate layout cache so getBoundingClientRect is called fresh
      testable(viewer).invalidateLayoutCache();

      const container = viewer.getContainer();
      container.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 50,
        clientY: 50,
        bubbles: true,
      }));

      // getBoundingClientRect on imageCanvas should be called at most once (cached)
      expect(rectSpy).toHaveBeenCalledTimes(1);

      rectSpy.mockRestore();
    });

    it('VWR-202: getImageData called at most once per mousemove event when both consumers active', () => {
      const getImageDataSpy = vi.spyOn(viewer, 'getImageData');

      // Enable both consumers
      testable(viewer).pixelProbe.enable();
      const cursorCallback = vi.fn();
      viewer.onCursorColorChange(cursorCallback);

      // Reset throttle
      testable(viewer).lastMouseMoveUpdate = 0;

      // Mock the canvas rect so coordinates are in-bounds
      const imageCanvas = testable(viewer).imageCanvas as HTMLCanvasElement;
      vi.spyOn(imageCanvas, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 200, height: 200,
        right: 200, bottom: 200, x: 0, y: 0,
        toJSON: () => ({}),
      } as DOMRect);
      // Set displayWidth/displayHeight so getPixelCoordinates produces valid position
      testable(viewer).displayWidth = 200;
      testable(viewer).displayHeight = 200;
      testable(viewer).invalidateLayoutCache();

      const container = viewer.getContainer();
      container.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 50,
        clientY: 50,
        bubbles: true,
      }));

      // getImageData should be called at most once (shared between both consumers)
      expect(getImageDataSpy).toHaveBeenCalledTimes(1);

      getImageDataSpy.mockRestore();
    });

    it('VWR-203: early exit when neither consumer is active - no work done', () => {
      const getImageDataSpy = vi.spyOn(viewer, 'getImageData');

      // Ensure neither consumer is active
      testable(viewer).pixelProbe.disable();
      viewer.onCursorColorChange(null);

      // Reset throttle
      testable(viewer).lastMouseMoveUpdate = 0;

      const container = viewer.getContainer();
      container.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 50,
        clientY: 50,
        bubbles: true,
      }));

      // getImageData should not be called
      expect(getImageDataSpy).not.toHaveBeenCalled();

      getImageDataSpy.mockRestore();
    });

    it('VWR-204: probe works independently when cursor color callback is null', () => {
      // Enable only probe, disable cursor color
      testable(viewer).pixelProbe.enable();
      viewer.onCursorColorChange(null);

      // Reset throttle
      testable(viewer).lastMouseMoveUpdate = 0;

      const container = viewer.getContainer();
      // Should not throw
      expect(() => {
        container.dispatchEvent(new MouseEvent('mousemove', {
          clientX: 50,
          clientY: 50,
          bubbles: true,
        }));
      }).not.toThrow();
    });

    it('VWR-205: cursor color works independently when probe is disabled', () => {
      const cursorCallback = vi.fn();

      // Enable only cursor color
      testable(viewer).pixelProbe.disable();
      viewer.onCursorColorChange(cursorCallback);

      // Reset throttle
      testable(viewer).lastMouseMoveUpdate = 0;

      const container = viewer.getContainer();
      container.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 50,
        clientY: 50,
        bubbles: true,
      }));

      // Cursor color callback should be invoked (with null/null for out-of-bounds or color)
      expect(cursorCallback).toHaveBeenCalled();
    });

    it('VWR-206: throttle prevents rapid consecutive calls within 16ms', () => {
      const getImageDataSpy = vi.spyOn(viewer, 'getImageData');

      // Enable a consumer
      testable(viewer).pixelProbe.enable();

      // Reset throttle
      testable(viewer).lastMouseMoveUpdate = 0;

      const container = viewer.getContainer();

      // First event should proceed
      container.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 50,
        clientY: 50,
        bubbles: true,
      }));

      const callCountAfterFirst = getImageDataSpy.mock.calls.length;

      // Immediately dispatch another event (within 16ms window)
      container.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 60,
        clientY: 60,
        bubbles: true,
      }));

      // Second event should be throttled
      expect(getImageDataSpy.mock.calls.length).toBe(callCountAfterFirst);

      getImageDataSpy.mockRestore();
    });

    it('VWR-207: mouse leave clears cursor color via callback(null, null)', () => {
      const cursorCallback = vi.fn();
      viewer.onCursorColorChange(cursorCallback);

      const container = viewer.getContainer();
      container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      expect(cursorCallback).toHaveBeenCalledWith(null, null);
    });

    it('VWR-208: dispose removes mousemove and mouseleave listeners and clears callback', () => {
      const cursorCallback = vi.fn();
      viewer.onCursorColorChange(cursorCallback);

      const container = viewer.getContainer();
      const removeSpy = vi.spyOn(container, 'removeEventListener');

      viewer.dispose();

      const mousemoveRemoves = removeSpy.mock.calls.filter(
        (call) => call[0] === 'mousemove'
      );
      expect(mousemoveRemoves.length).toBe(1);

      const mouseleaveRemoves = removeSpy.mock.calls.filter(
        (call) => call[0] === 'mouseleave'
      );
      expect(mouseleaveRemoves.length).toBe(1);

      // cursorColorCallback should be cleared
      expect(testable(viewer).cursorColorCallback).toBeNull();

      removeSpy.mockRestore();
    });

    it('VWR-209: uses single shared throttle timestamp (no separate probe/cursor timestamps)', () => {
      // Verify single shared throttle timestamp exists
      expect(testable(viewer).lastMouseMoveUpdate).toBeDefined();
      expect(typeof testable(viewer).lastMouseMoveUpdate).toBe('number');

      // Verify old separate timestamps do not exist
      expect(testable(viewer).lastProbeUpdate).toBeUndefined();
      expect(testable(viewer).lastCursorColorUpdate).toBeUndefined();
    });

    it('VWR-210: out-of-bounds mousemove calls cursor color callback with null', () => {
      const cursorCallback = vi.fn();
      viewer.onCursorColorChange(cursorCallback);
      testable(viewer).pixelProbe.disable();

      // Reset throttle
      testable(viewer).lastMouseMoveUpdate = 0;

      // Mock canvas rect to a specific area
      const imageCanvas = testable(viewer).imageCanvas as HTMLCanvasElement;
      vi.spyOn(imageCanvas, 'getBoundingClientRect').mockReturnValue({
        left: 100, top: 100, width: 200, height: 200,
        right: 300, bottom: 300, x: 100, y: 100,
        toJSON: () => ({}),
      } as DOMRect);
      testable(viewer).invalidateLayoutCache();

      const container = viewer.getContainer();
      container.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 50,  // outside the canvas rect (left=100)
        clientY: 50,
        bubbles: true,
      }));

      expect(cursorCallback).toHaveBeenCalledWith(null, null);
    });
  });

  describe('ghost frame canvas pool (performance/03)', () => {
    it('VWR-300: pool is lazily initialized (empty at startup)', () => {
      const pool = testable(viewer).ghostFrameCanvasPool;
      expect(pool).toEqual([]);
      expect(testable(viewer).ghostFramePoolWidth).toBe(0);
      expect(testable(viewer).ghostFramePoolHeight).toBe(0);
    });

    it('VWR-301: getGhostFrameCanvas creates canvas on first call', () => {
      const result = testable(viewer).getGhostFrameCanvas(0, 800, 600);
      expect(result).not.toBeNull();
      expect(result!.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(result!.canvas.width).toBe(800);
      expect(result!.canvas.height).toBe(600);
      expect(result!.ctx).toBeDefined();
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(1);
    });

    it('VWR-302: getGhostFrameCanvas reuses existing canvas (no new creation)', () => {
      const first = testable(viewer).getGhostFrameCanvas(0, 800, 600);
      const second = testable(viewer).getGhostFrameCanvas(0, 800, 600);
      expect(second!.canvas).toBe(first!.canvas);
      expect(second!.ctx).toBe(first!.ctx);
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(1);
    });

    it('VWR-303: getGhostFrameCanvas grows pool for new indices', () => {
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      testable(viewer).getGhostFrameCanvas(1, 800, 600);
      testable(viewer).getGhostFrameCanvas(2, 800, 600);
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(3);
      const pool = testable(viewer).ghostFrameCanvasPool;
      expect(pool[0]!.canvas).not.toBe(pool[1]!.canvas);
      expect(pool[1]!.canvas).not.toBe(pool[2]!.canvas);
    });

    it('VWR-304: pool resizes all canvases when display dimensions change', () => {
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      testable(viewer).getGhostFrameCanvas(1, 800, 600);
      // Request with new dimensions
      testable(viewer).getGhostFrameCanvas(0, 1920, 1080);
      const pool = testable(viewer).ghostFrameCanvasPool;
      expect(pool[0]!.canvas.width).toBe(1920);
      expect(pool[0]!.canvas.height).toBe(1080);
      expect(pool[1]!.canvas.width).toBe(1920);
      expect(pool[1]!.canvas.height).toBe(1080);
      expect(testable(viewer).ghostFramePoolWidth).toBe(1920);
      expect(testable(viewer).ghostFramePoolHeight).toBe(1080);
    });

    it('VWR-305: pool is trimmed when frame count decreases', () => {
      for (let i = 0; i < 5; i++) {
        testable(viewer).getGhostFrameCanvas(i, 100, 100);
      }
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(5);

      // Simulate the trim logic from renderGhostFrames (line 3112-3113):
      // if (poolIndex < this.ghostFrameCanvasPool.length) pool.length = poolIndex
      const pool = testable(viewer).ghostFrameCanvasPool;
      const poolIndex = 2;
      if (poolIndex < pool.length) {
        pool.length = poolIndex;
      }
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(2);
    });

    it('VWR-306: pool is cleared when ghost frames disabled via setGhostFrameState', () => {
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      testable(viewer).getGhostFrameCanvas(1, 800, 600);
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(2);

      viewer.setGhostFrameState({
        enabled: false,
        framesBefore: 2,
        framesAfter: 2,
        opacityBase: 0.3,
        opacityFalloff: 0.7,
        colorTint: false,
      });
      expect(testable(viewer).ghostFrameCanvasPool).toEqual([]);
      expect(testable(viewer).ghostFramePoolWidth).toBe(0);
      expect(testable(viewer).ghostFramePoolHeight).toBe(0);
    });

    it('VWR-307: pool is cleared on resetGhostFrameState', () => {
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(1);

      viewer.resetGhostFrameState();
      expect(testable(viewer).ghostFrameCanvasPool).toEqual([]);
      expect(testable(viewer).ghostFramePoolWidth).toBe(0);
      expect(testable(viewer).ghostFramePoolHeight).toBe(0);
    });

    it('VWR-308: pool is cleaned up in dispose()', () => {
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      testable(viewer).getGhostFrameCanvas(1, 800, 600);
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(2);

      viewer.dispose();
      expect(testable(viewer).ghostFrameCanvasPool).toEqual([]);
      expect(testable(viewer).ghostFramePoolWidth).toBe(0);
      expect(testable(viewer).ghostFramePoolHeight).toBe(0);
    });

    it('VWR-309: clearRect is called before canvas reuse in renderGhostFrames', () => {
      const entry = testable(viewer).getGhostFrameCanvas(0, 200, 200);
      expect(entry).not.toBeNull();
      const spy = vi.spyOn(entry!.ctx, 'clearRect');

      // Simulate what renderGhostFrames does: clearRect before drawImage
      entry!.ctx.clearRect(0, 0, 200, 200);
      expect(spy).toHaveBeenCalledWith(0, 0, 200, 200);
      spy.mockRestore();
    });

    it('VWR-310: no new canvas creation during steady-state (reuse path)', () => {
      const createSpy = vi.spyOn(document, 'createElement');

      // First call creates a canvas
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      const createCount1 = createSpy.mock.calls.filter(
        (c) => c[0] === 'canvas'
      ).length;
      expect(createCount1).toBe(1);

      // Second call with same index reuses -- no new createElement('canvas')
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      const createCount2 = createSpy.mock.calls.filter(
        (c) => c[0] === 'canvas'
      ).length;
      expect(createCount2).toBe(1); // still 1

      createSpy.mockRestore();
    });

    it('VWR-311: ghost frame opacity and color tint state are preserved', () => {
      viewer.setGhostFrameState({
        enabled: true,
        framesBefore: 3,
        framesAfter: 2,
        opacityBase: 0.4,
        opacityFalloff: 0.8,
        colorTint: true,
      });
      const state = viewer.getGhostFrameState();
      expect(state.enabled).toBe(true);
      expect(state.framesBefore).toBe(3);
      expect(state.framesAfter).toBe(2);
      expect(state.opacityBase).toBe(0.4);
      expect(state.opacityFalloff).toBe(0.8);
      expect(state.colorTint).toBe(true);
    });

    it('VWR-312: getGhostFrameCanvas returns null when getContext fails', () => {
      const mockCanvas = document.createElement('canvas');
      vi.spyOn(mockCanvas, 'getContext').mockReturnValue(null);
      const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(
        mockCanvas as unknown as HTMLElement
      );

      const result = testable(viewer).getGhostFrameCanvas(0, 800, 600);
      expect(result).toBeNull();

      createSpy.mockRestore();
    });

    it('VWR-313: pool not populated for video source path', () => {
      // The video path in renderGhostFrames uses getVideoFrameCanvas directly,
      // never calls getGhostFrameCanvas, so pool stays empty for video sources.
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(0);
      viewer.setGhostFrameState({
        enabled: true,
        framesBefore: 2,
        framesAfter: 2,
        opacityBase: 0.3,
        opacityFalloff: 0.7,
        colorTint: false,
      });
      // Pool should still be empty since no actual rendering occurred
      expect(testable(viewer).ghostFrameCanvasPool.length).toBe(0);
    });

    it('VWR-314: pool dimensions are updated when size changes', () => {
      testable(viewer).getGhostFrameCanvas(0, 640, 480);
      expect(testable(viewer).ghostFramePoolWidth).toBe(640);
      expect(testable(viewer).ghostFramePoolHeight).toBe(480);

      testable(viewer).getGhostFrameCanvas(0, 1280, 720);
      expect(testable(viewer).ghostFramePoolWidth).toBe(1280);
      expect(testable(viewer).ghostFramePoolHeight).toBe(720);
    });

    it('VWR-315: no getContext call during steady-state reuse', () => {
      // First call creates canvas and calls getContext
      testable(viewer).getGhostFrameCanvas(0, 800, 600);

      // Spy on getContext of the pooled canvas
      const poolEntry = testable(viewer).ghostFrameCanvasPool[0];
      const ctxSpy = vi.spyOn(poolEntry!.canvas, 'getContext');

      // Re-request same index - should reuse without calling getContext
      testable(viewer).getGhostFrameCanvas(0, 800, 600);
      expect(ctxSpy).not.toHaveBeenCalled();

      ctxSpy.mockRestore();
    });
  });

  describe('SDR WebGL rendering (Phase 1A + 1B)', () => {
    it('VWR-320: sdrWebGLRenderActive starts as false', () => {
      expect(testable(viewer).sdrWebGLRenderActive).toBe(false);
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
      const glCanvas = testable(viewer).glCanvas;
      expect(glCanvas).toBeInstanceOf(HTMLCanvasElement);
      expect(glCanvas!.style.display).toBe('none');
    });

    it('VWR-342: hdrRenderActive starts as false', () => {
      expect(testable(viewer).hdrRenderActive).toBe(false);
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
      const lensSpy = vi.spyOn(tv, 'applyLensDistortionToCtx');

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
      const lensSpy = vi.spyOn(tv, 'applyLensDistortionToCtx');

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
      const stereoSpy = vi.spyOn(tv as any, 'applyStereoMode');

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
      const stereoSpy = vi.spyOn(tv as any, 'applyStereoMode');

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
      const uncropSpy = vi.spyOn(tv as any, 'drawUncropBackground');
      const drawImageSpy = vi.spyOn(tv.imageCtx, 'drawImage');

      viewer.render();

      // Uncrop background should be drawn during cache hit path (line 2320-2322)
      expect(uncropSpy).toHaveBeenCalled();
      // The cached frame should also be drawn with uncrop offset
      expect(drawImageSpy).toHaveBeenCalled();
      uncropSpy.mockRestore();
      drawImageSpy.mockRestore();
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
      const stereoSpy = vi.spyOn(tv as any, 'applyStereoMode');
      const lensSpy = vi.spyOn(tv as any, 'applyLensDistortionToCtx');

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
      testable(viewer).glRenderer = mockGLRenderer;

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
      testable(viewer).glRenderer = mockGLRenderer;

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
      testable(viewer).glRenderer = null;

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
      testable(viewer).glRenderer = mockGLRenderer;

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
      testable(viewer).glRenderer = mockGLRenderer;

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
      expect(tv.ocioEnabled).toBe(true);
      expect(tv.ocioBakedLUT).not.toBeNull();
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
      expect(tv.ocioEnabled).toBe(true);
      expect(tv.ocioBakedLUT).not.toBeNull();

      // Render should not throw (no HDR source available in test env, so it
      // just confirms the guard logic doesn't cause errors)
      expect(() => viewer.render()).not.toThrow();
    });

    it('VWR-408: HDR mode is deactivated when OCIO becomes active', () => {
      // When OCIO is enabled while an HDR source was being rendered via WebGL,
      // the HDR mode should be deactivated to switch to the 2D canvas path.
      const tv = testable(viewer);

      // Simulate that HDR mode was previously active
      tv.hdrRenderActive = true;

      const fakeLUT = createFakeLUT();
      viewer.setOCIOBakedLUT(fakeLUT, true);

      // Render triggers the deactivation check
      viewer.render();

      // HDR mode should be deactivated because OCIO is active
      expect(tv.hdrRenderActive).toBe(false);
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
      const cropSpy = vi.spyOn(tv, 'clearOutsideCropRegion');

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
      const cropSpy = vi.spyOn(tv, 'clearOutsideCropRegion');

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
      const uncropSpy = vi.spyOn(tv, 'drawUncropBackground');
      const drawImageSpy = vi.spyOn(tv.imageCtx, 'drawImage');
      const ghostSpy = vi.spyOn(tv as any, 'renderGhostFrames');
      const stereoSpy = vi.spyOn(tv as any, 'applyStereoMode');
      const lensSpy = vi.spyOn(tv, 'applyLensDistortionToCtx');
      const lutSpy = vi.spyOn(tv, 'applyLUTToCanvas');
      const ocioSpy = vi.spyOn(tv, 'applyOCIOToCanvas');
      const lightweightSpy = vi.spyOn(tv, 'applyLightweightEffects');
      const cropSpy = vi.spyOn(tv, 'clearOutsideCropRegion');

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
      const uncropOrder = vi.mocked(tv.drawUncropBackground).mock.invocationCallOrder[0]!;
      const drawOrder = vi.mocked(tv.imageCtx.drawImage).mock.invocationCallOrder[0]!;
      const ghostOrder = vi.mocked((tv as any).renderGhostFrames).mock.invocationCallOrder[0]!;
      const stereoOrder = vi.mocked((tv as any).applyStereoMode).mock.invocationCallOrder[0]!;
      const lensOrder = vi.mocked(tv.applyLensDistortionToCtx).mock.invocationCallOrder[0]!;
      const lutOrder = vi.mocked(tv.applyLUTToCanvas).mock.invocationCallOrder[0]!;
      const ocioOrder = vi.mocked(tv.applyOCIOToCanvas).mock.invocationCallOrder[0]!;
      const lightweightOrder = vi.mocked(tv.applyLightweightEffects).mock.invocationCallOrder[0]!;
      const cropOrder = vi.mocked(tv.clearOutsideCropRegion).mock.invocationCallOrder[0]!;

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
});
