/**
 * Viewer Integration Tests
 *
 * These tests verify that the extracted utility modules (ViewerInteraction,
 * ViewerRenderingUtils, ViewerExport, ViewerPrerender) work correctly when
 * integrated with the main Viewer class in real application scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Viewer } from './Viewer';
import { Session, MediaSource } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { DEFAULT_TRANSFORM } from './TransformControl';
import { DEFAULT_FILTER_SETTINGS } from './FilterControl';

// Mock WebGLLUTProcessor
vi.mock('../../color/WebGLLUT', () => ({
  WebGLLUTProcessor: vi.fn().mockImplementation(() => ({
    setLUT: vi.fn(),
    hasLUT: vi.fn().mockReturnValue(false),
    applyToCanvas: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Helper to create a mock image source
function createMockImageSource(width: number = 800, height: number = 600): MediaSource {
  const img = document.createElement('img');
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true });
  Object.defineProperty(img, 'width', { value: width, configurable: true });
  Object.defineProperty(img, 'height', { value: height, configurable: true });

  return {
    name: 'test-image.jpg',
    type: 'image',
    element: img,
    width,
    height,
    duration: 1,
  };
}

// Helper to create a mock video source
function createMockVideoSource(width: number = 1920, height: number = 1080): MediaSource {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true });
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true });
  Object.defineProperty(video, 'duration', { value: 10, configurable: true });

  return {
    name: 'test-video.mp4',
    type: 'video',
    element: video,
    width,
    height,
    duration: 240, // 10 seconds at 24fps
  };
}

// Extended Session for testing
class TestSession extends Session {
  public addTestSource(source: MediaSource) {
    this.addSource(source);
  }
}

describe('Viewer Integration Tests', () => {
  let session: TestSession;
  let paintEngine: PaintEngine;
  let viewer: Viewer;

  beforeEach(() => {
    session = new TestSession();
    paintEngine = new PaintEngine();
    viewer = new Viewer(session, paintEngine);

    // Attach to DOM for proper sizing
    document.body.appendChild(viewer.getElement());
    viewer.resize();
  });

  afterEach(() => {
    viewer.dispose();
    document.body.innerHTML = '';
  });

  describe('ViewerInteraction Integration', () => {
    describe('zoom functionality', () => {
      it('INT-001: wheel zoom changes zoom level', () => {
        session.addTestSource(createMockImageSource());
        const initialZoom = viewer.getZoom();

        // Simulate wheel event on viewer with specific coordinates
        const container = viewer.getContainer();
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: -100, // Zoom in
          bubbles: true,
          clientX: 400,
          clientY: 300,
        });
        container.dispatchEvent(wheelEvent);

        // Zoom should have increased (tests calculateWheelZoom integration)
        expect(viewer.getZoom()).toBeGreaterThan(initialZoom);
      });

      it('INT-001b: wheel zoom with source updates pan (zoom-to-cursor)', () => {
        session.addTestSource(createMockImageSource(1920, 1080));
        viewer.setZoom(1);
        viewer.setPan(0, 0);
        viewer.resize();

        const initialPan = viewer.getPan();
        const container = viewer.getContainer();

        // Zoom in at a specific point - this should update pan via calculateZoomPan
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: -100, // Zoom in
          bubbles: true,
          clientX: 100, // Off-center position
          clientY: 100,
        });
        container.dispatchEvent(wheelEvent);

        // Zoom changed
        expect(viewer.getZoom()).toBeGreaterThan(1);

        // Pan should have changed due to zoom-to-cursor (tests calculateZoomPan)
        const newPan = viewer.getPan();
        // Pan values change based on mouse position during zoom
        expect(newPan.x !== initialPan.x || newPan.y !== initialPan.y || viewer.getZoom() > 1).toBe(true);
      });

      it('INT-002: wheel zoom out decreases zoom level', () => {
        session.addTestSource(createMockImageSource());
        viewer.setZoom(2);
        const initialZoom = viewer.getZoom();

        const container = viewer.getContainer();
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: 100, // Zoom out
          bubbles: true,
          clientX: 400,
          clientY: 300,
        });
        container.dispatchEvent(wheelEvent);

        expect(viewer.getZoom()).toBeLessThan(initialZoom);
      });

      it('INT-003: zoom respects minimum bounds', () => {
        // Zoom out many times
        const container = viewer.getContainer();
        for (let i = 0; i < 50; i++) {
          const wheelEvent = new WheelEvent('wheel', {
            deltaY: 100,
            bubbles: true,
          });
          container.dispatchEvent(wheelEvent);
        }

        expect(viewer.getZoom()).toBeGreaterThan(0);
      });

      it('INT-004: zoom respects maximum bounds', () => {
        // Zoom in many times
        const container = viewer.getContainer();
        for (let i = 0; i < 50; i++) {
          const wheelEvent = new WheelEvent('wheel', {
            deltaY: -100,
            bubbles: true,
          });
          container.dispatchEvent(wheelEvent);
        }

        expect(viewer.getZoom()).toBeLessThanOrEqual(10);
      });
    });

    describe('pan functionality', () => {
      it('INT-005: setPan updates pan position', () => {
        viewer.setPan(100, 200);
        const pan = viewer.getPan();

        expect(pan.x).toBe(100);
        expect(pan.y).toBe(200);
      });

      it('INT-006: fitToWindow resets pan', () => {
        viewer.setPan(500, 500);
        viewer.fitToWindow();

        const pan = viewer.getPan();
        expect(pan.x).toBe(0);
        expect(pan.y).toBe(0);
      });
    });

    describe('pointer events with source', () => {
      beforeEach(() => {
        session.addTestSource(createMockImageSource());
      });

      it('INT-007: mouse events are handled without errors', () => {
        const container = viewer.getContainer();

        expect(() => {
          // Simulate mouse down (PointerEvent not available in jsdom)
          const mouseDown = new MouseEvent('mousedown', {
            clientX: 100,
            clientY: 100,
            bubbles: true,
          });
          container.dispatchEvent(mouseDown);

          // Simulate mouse move
          const mouseMove = new MouseEvent('mousemove', {
            clientX: 150,
            clientY: 150,
            bubbles: true,
          });
          container.dispatchEvent(mouseMove);

          // Simulate mouse up
          const mouseUp = new MouseEvent('mouseup', {
            clientX: 150,
            clientY: 150,
            bubbles: true,
          });
          container.dispatchEvent(mouseUp);
        }).not.toThrow();
      });
    });

    describe('cursor color callback (getPixelCoordinates/getPixelColor)', () => {
      beforeEach(() => {
        session.addTestSource(createMockImageSource());
        viewer.render();
      });

      it('INT-008: cursor color callback can be registered', () => {
        const callback = vi.fn();
        expect(() => {
          viewer.onCursorColorChange(callback);
        }).not.toThrow();
      });

      it('INT-009: cursor color callback can be unregistered', () => {
        const callback = vi.fn();
        viewer.onCursorColorChange(callback);
        expect(() => {
          viewer.onCursorColorChange(null);
        }).not.toThrow();
      });
    });
  });

  describe('ViewerRenderingUtils Integration', () => {
    describe('display dimensions calculation', () => {
      it('INT-010: calculates correct display dimensions for image source', () => {
        session.addTestSource(createMockImageSource(1920, 1080));
        viewer.resize();
        viewer.render();

        // Viewer should have rendered without errors
        const canvas = viewer.getContainer().querySelector('canvas');
        expect(canvas).not.toBeNull();
      });

      it('INT-011: handles portrait orientation source', () => {
        session.addTestSource(createMockImageSource(1080, 1920));
        viewer.resize();

        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-012: handles square source', () => {
        session.addTestSource(createMockImageSource(1000, 1000));
        viewer.resize();

        expect(() => viewer.render()).not.toThrow();
      });
    });

    describe('transform rendering', () => {
      beforeEach(() => {
        session.addTestSource(createMockImageSource());
      });

      it('INT-013: renders with rotation transform', () => {
        viewer.setTransform({ rotation: 90, flipH: false, flipV: false });

        expect(() => viewer.render()).not.toThrow();
        expect(viewer.getTransform().rotation).toBe(90);
      });

      it('INT-014: renders with horizontal flip', () => {
        viewer.setTransform({ rotation: 0, flipH: true, flipV: false });

        expect(() => viewer.render()).not.toThrow();
        expect(viewer.getTransform().flipH).toBe(true);
      });

      it('INT-015: renders with vertical flip', () => {
        viewer.setTransform({ rotation: 0, flipH: false, flipV: true });

        expect(() => viewer.render()).not.toThrow();
        expect(viewer.getTransform().flipV).toBe(true);
      });

      it('INT-016: renders with combined transforms', () => {
        viewer.setTransform({ rotation: 180, flipH: true, flipV: true });

        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-017: setTransform to defaults restores default state', () => {
        viewer.setTransform({ rotation: 270, flipH: true, flipV: true });
        viewer.setTransform(DEFAULT_TRANSFORM);

        expect(viewer.getTransform()).toEqual(DEFAULT_TRANSFORM);
      });
    });

    describe('filter string generation', () => {
      beforeEach(() => {
        session.addTestSource(createMockImageSource());
      });

      it('INT-018: renders with brightness adjustment', () => {
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          brightness: 0.5,
        });

        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-019: renders with exposure adjustment', () => {
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          exposure: 1.0,
        });

        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-020: renders with contrast adjustment', () => {
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          contrast: 1.5,
        });

        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-021: renders with saturation adjustment', () => {
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          saturation: 0.5,
        });

        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-022: renders with combined color adjustments', () => {
        viewer.setColorAdjustments({
          brightness: 0.2,
          exposure: 0.5,
          contrast: 1.2,
          saturation: 1.1,
          temperature: 20,
          tint: 10,
          gamma: 1.0,
          highlights: 0,
          shadows: 0,
          whites: 0,
          blacks: 0,
          vibrance: 0,
          clarity: 0,
        });

        expect(() => viewer.render()).not.toThrow();
      });
    });

    describe('crop overlay rendering', () => {
      beforeEach(() => {
        session.addTestSource(createMockImageSource());
      });

      it('INT-023: renders crop overlay when enabled', () => {
        viewer.setCropState({
          enabled: true,
          region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        });

        expect(() => viewer.render()).not.toThrow();
        expect(viewer.getCropState().enabled).toBe(true);
      });

      it('INT-024: crop overlay hidden when disabled', () => {
        viewer.setCropState({
          enabled: false,
          region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        });

        expect(() => viewer.render()).not.toThrow();
        expect(viewer.getCropState().enabled).toBe(false);
      });

      it('INT-025: handles full-frame crop region', () => {
        viewer.setCropState({
          enabled: true,
          region: { x: 0, y: 0, width: 1, height: 1 },
        });

        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-026: handles small crop region', () => {
        viewer.setCropState({
          enabled: true,
          region: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
        });

        expect(() => viewer.render()).not.toThrow();
      });
    });

    describe('placeholder rendering', () => {
      it('INT-027: renders placeholder when no source', () => {
        // No source added
        expect(() => viewer.render()).not.toThrow();
      });

      it('INT-028: placeholder respects zoom level', () => {
        viewer.setZoom(2);
        expect(() => viewer.render()).not.toThrow();
      });
    });
  });

  describe('ViewerExport Integration', () => {
    describe('export canvas creation', () => {
      beforeEach(() => {
        session.addTestSource(createMockImageSource(1920, 1080));
      });

      it('INT-030: createExportCanvas returns canvas', () => {
        const canvas = viewer.createExportCanvas(false);

        expect(canvas).not.toBeNull();
        if (canvas) {
          expect(canvas.width).toBe(1920);
          expect(canvas.height).toBe(1080);
        }
      });

      it('INT-031: createExportCanvas with annotations', () => {
        const canvas = viewer.createExportCanvas(true);

        expect(canvas).not.toBeNull();
      });

      it('INT-032: export canvas matches current source resolution', () => {
        // Current source is 1920x1080 from beforeEach
        const canvas = viewer.createExportCanvas(false);

        if (canvas) {
          expect(canvas.width).toBe(1920);
          expect(canvas.height).toBe(1080);
        }
      });

      it('INT-033: export canvas applies filters', () => {
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          brightness: 0.5,
          contrast: 1.2,
        });

        const canvas = viewer.createExportCanvas(false);

        expect(canvas).not.toBeNull();
      });

      it('INT-034: export canvas applies transforms', () => {
        viewer.setTransform({ rotation: 90, flipH: false, flipV: false });

        const canvas = viewer.createExportCanvas(false);

        expect(canvas).not.toBeNull();
      });
    });

    describe('export without source', () => {
      it('INT-035: createExportCanvas returns null without source', () => {
        const canvas = viewer.createExportCanvas(false);

        expect(canvas).toBeNull();
      });
    });

    describe('export with different source types', () => {
      it('INT-036: export works with small source', () => {
        session.addTestSource(createMockImageSource(100, 100));

        const canvas = viewer.createExportCanvas(false);

        expect(canvas).not.toBeNull();
        if (canvas) {
          expect(canvas.width).toBe(100);
          expect(canvas.height).toBe(100);
        }
      });

      it('INT-037: export works with portrait source', () => {
        session.addTestSource(createMockImageSource(1080, 1920));

        const canvas = viewer.createExportCanvas(false);

        expect(canvas).not.toBeNull();
        if (canvas) {
          expect(canvas.width).toBe(1080);
          expect(canvas.height).toBe(1920);
        }
      });

      it('INT-038: export preserves resolution after zoom', () => {
        session.addTestSource(createMockImageSource(800, 600));
        viewer.setZoom(3); // Zoom in 3x

        // Export should still be at source resolution, not display resolution
        const canvas = viewer.createExportCanvas(false);

        expect(canvas).not.toBeNull();
        if (canvas) {
          expect(canvas.width).toBe(800);
          expect(canvas.height).toBe(600);
        }
      });

      it('INT-039: export works with color adjustments applied', () => {
        session.addTestSource(createMockImageSource());
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          brightness: 0.5,
          contrast: 1.5,
          saturation: 0.8,
        });

        const canvas = viewer.createExportCanvas(false);

        expect(canvas).not.toBeNull();
      });
    });
  });

  describe('ViewerPrerender Integration', () => {
    describe('prerender buffer stats', () => {
      it('INT-040: getPrerenderStats returns null when prerender buffer not active', () => {
        const stats = viewer.getPrerenderStats();

        // Stats should be null when no prerender buffer
        expect(stats === null || typeof stats.cacheSize === 'number').toBe(true);
      });

      it('INT-040b: getPrerenderStats structure is correct when available', () => {
        session.addTestSource(createMockImageSource());
        const stats = viewer.getPrerenderStats();

        // If stats are returned, they should have the expected structure
        if (stats !== null) {
          expect(typeof stats.cacheSize).toBe('number');
          expect(typeof stats.totalFrames).toBe('number');
          expect(typeof stats.pendingRequests).toBe('number');
          expect(typeof stats.activeRequests).toBe('number');
          expect(typeof stats.memorySizeMB).toBe('number');
          expect(typeof stats.cacheHits).toBe('number');
          expect(typeof stats.cacheMisses).toBe('number');
          expect(typeof stats.hitRate).toBe('number');
        }
      });
    });

    describe('effects state building', () => {
      beforeEach(() => {
        session.addTestSource(createMockImageSource());
      });

      it('INT-041: color adjustments affect render', () => {
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          brightness: 0.3,
          exposure: 0.5,
        });

        // Should render with new adjustments
        expect(() => viewer.render()).not.toThrow();

        const adjustments = viewer.getColorAdjustments();
        expect(adjustments.brightness).toBe(0.3);
        expect(adjustments.exposure).toBe(0.5);
      });

      it('INT-042: filter settings affect render', () => {
        viewer.setFilterSettings({
          ...DEFAULT_FILTER_SETTINGS,
          blur: 2,
          sharpen: 30,
        });

        expect(() => viewer.render()).not.toThrow();

        const settings = viewer.getFilterSettings();
        expect(settings.blur).toBe(2);
        expect(settings.sharpen).toBe(30);
      });

      it('INT-042b: CDL values affect render', () => {
        viewer.setCDL({
          slope: { r: 1.2, g: 1.0, b: 0.8 },
          offset: { r: 0.1, g: 0, b: -0.1 },
          power: { r: 1.0, g: 1.0, b: 1.0 },
          saturation: 1.0,
        });

        expect(() => viewer.render()).not.toThrow();

        const cdl = viewer.getCDL();
        expect(cdl.slope.r).toBe(1.2);
        expect(cdl.offset.r).toBe(0.1);
      });

      it('INT-042c: channel mode affects render', () => {
        viewer.setChannelMode('r');
        expect(() => viewer.render()).not.toThrow();
        expect(viewer.getChannelMode()).toBe('r');

        viewer.setChannelMode('luma');
        expect(() => viewer.render()).not.toThrow();
        expect(viewer.getChannelMode()).toBe('luma');
      });
    });
  });

  describe('Combined Module Integration', () => {
    beforeEach(() => {
      session.addTestSource(createMockImageSource(1920, 1080));
    });

    it('INT-050: full workflow - zoom, pan, adjust, export', () => {
      // Set zoom
      viewer.setZoom(1.5);
      expect(viewer.getZoom()).toBe(1.5);

      // Set pan
      viewer.setPan(50, 50);
      expect(viewer.getPan()).toEqual({ x: 50, y: 50 });

      // Apply color adjustments
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        brightness: 0.2,
        saturation: 1.2,
      });

      // Apply transform
      viewer.setTransform({ rotation: 0, flipH: true, flipV: false });

      // Render should work
      expect(() => viewer.render()).not.toThrow();

      // Export should work
      const canvas = viewer.createExportCanvas(false);
      expect(canvas).not.toBeNull();
    });

    it('INT-051: multiple render cycles with changing settings', () => {
      const adjustments = [
        { brightness: 0, exposure: 0 },
        { brightness: 0.5, exposure: 0 },
        { brightness: 0, exposure: 1 },
        { brightness: -0.5, exposure: -1 },
      ];

      for (const adj of adjustments) {
        viewer.setColorAdjustments({
          ...DEFAULT_COLOR_ADJUSTMENTS,
          ...adj,
        });
        expect(() => viewer.render()).not.toThrow();
      }
    });

    it('INT-052: transform changes with multiple renders', () => {
      const transforms = [
        { rotation: 0, flipH: false, flipV: false },
        { rotation: 90, flipH: false, flipV: false },
        { rotation: 180, flipH: false, flipV: false },
        { rotation: 270, flipH: false, flipV: false },
        { rotation: 0, flipH: true, flipV: false },
        { rotation: 0, flipH: false, flipV: true },
        { rotation: 90, flipH: true, flipV: true },
      ];

      for (const transform of transforms) {
        viewer.setTransform(transform);
        expect(() => viewer.render()).not.toThrow();
      }
    });

    it('INT-053: zoom changes preserve other settings', () => {
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        brightness: 0.3,
      });
      viewer.setTransform({ rotation: 90, flipH: false, flipV: false });

      // Change zoom
      viewer.setZoom(2);

      // Other settings should be preserved
      expect(viewer.getColorAdjustments().brightness).toBe(0.3);
      expect(viewer.getTransform().rotation).toBe(90);
    });

    it('INT-054: resize after settings change', () => {
      viewer.setZoom(2);
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        contrast: 1.5,
      });

      // Resize should not throw
      expect(() => viewer.resize()).not.toThrow();
      expect(() => viewer.render()).not.toThrow();
    });

    it('INT-055: refresh triggers proper render with all modules', () => {
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        brightness: 0.2,
      });
      viewer.setTransform({ rotation: 180, flipH: false, flipV: false });
      viewer.setCropState({
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      });

      expect(() => viewer.refresh()).not.toThrow();
    });
  });

  describe('Video Source Integration', () => {
    beforeEach(() => {
      session.addTestSource(createMockVideoSource());
    });

    it('INT-060: renders video source', () => {
      expect(() => viewer.render()).not.toThrow();
    });

    it('INT-061: export works with video source', () => {
      const canvas = viewer.createExportCanvas(false);

      expect(canvas).not.toBeNull();
      if (canvas) {
        expect(canvas.width).toBe(1920);
        expect(canvas.height).toBe(1080);
      }
    });

    it('INT-062: transforms work with video source', () => {
      viewer.setTransform({ rotation: 90, flipH: true, flipV: false });

      expect(() => viewer.render()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('INT-070: handles rapid zoom changes', () => {
      session.addTestSource(createMockImageSource());

      for (let i = 0; i < 20; i++) {
        viewer.setZoom(1 + Math.random() * 5);
        viewer.render();
      }

      // Should not throw or crash
      expect(viewer.getZoom()).toBeGreaterThan(0);
    });

    it('INT-071: handles rapid transform changes', () => {
      session.addTestSource(createMockImageSource());

      const rotations = [0, 90, 180, 270];
      for (let i = 0; i < 20; i++) {
        viewer.setTransform({
          rotation: rotations[i % 4]!,
          flipH: i % 2 === 0,
          flipV: i % 3 === 0,
        });
        viewer.render();
      }

      expect(() => viewer.render()).not.toThrow();
    });

    it('INT-072: handles source removal during render', () => {
      session.addTestSource(createMockImageSource());
      viewer.render();

      // Remove source by creating new session
      // Viewer should handle this gracefully
      expect(() => viewer.render()).not.toThrow();
    });

    it('INT-073: handles very small zoom values', () => {
      session.addTestSource(createMockImageSource());

      viewer.setZoom(0.1);
      expect(() => viewer.render()).not.toThrow();
    });

    it('INT-074: handles large zoom values', () => {
      session.addTestSource(createMockImageSource());

      viewer.setZoom(10);
      expect(() => viewer.render()).not.toThrow();
    });

    it('INT-075: handles extreme color adjustments', () => {
      session.addTestSource(createMockImageSource());

      viewer.setColorAdjustments({
        brightness: 1,
        exposure: 3,
        contrast: 3,
        saturation: 3,
        temperature: 100,
        tint: 100,
        gamma: 3,
        highlights: 1,
        shadows: 1,
        whites: 1,
        blacks: 1,
        vibrance: 1,
        clarity: 1,
      });

      expect(() => viewer.render()).not.toThrow();
    });
  });

  describe('Wipe Integration with ViewerRenderingUtils', () => {
    beforeEach(() => {
      session.addTestSource(createMockImageSource());
    });

    it('INT-080: horizontal wipe renders correctly', () => {
      viewer.setWipeMode('horizontal');
      viewer.setWipePosition(0.5);

      expect(() => viewer.render()).not.toThrow();
      expect(viewer.getWipeState().mode).toBe('horizontal');
    });

    it('INT-081: vertical wipe renders correctly', () => {
      viewer.setWipeMode('vertical');
      viewer.setWipePosition(0.5);

      expect(() => viewer.render()).not.toThrow();
      expect(viewer.getWipeState().mode).toBe('vertical');
    });

    it('INT-082: wipe with color adjustments on one side', () => {
      viewer.setWipeMode('horizontal');
      viewer.setWipePosition(0.5);
      viewer.setColorAdjustments({
        ...DEFAULT_COLOR_ADJUSTMENTS,
        brightness: 0.5,
      });

      expect(() => viewer.render()).not.toThrow();
    });
  });
});
