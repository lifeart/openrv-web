/**
 * TransformManager Tests
 *
 * Tests for pan/zoom/rotation/flip state management, smooth zoom animation,
 * pinch zoom helpers, fit-to-window, and cleanup.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TransformManager } from './TransformManager';

describe('TransformManager', () => {
  let tm: TransformManager;

  beforeEach(() => {
    tm = new TransformManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    tm.dispose();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Pan
  // ===========================================================================

  describe('pan', () => {
    it('defaults to 0, 0', () => {
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
    });

    it('sets panX and panY via property setters', () => {
      tm.panX = 100;
      tm.panY = -50;
      expect(tm.panX).toBe(100);
      expect(tm.panY).toBe(-50);
    });

    it('getPan returns current pan as object', () => {
      tm.panX = 10;
      tm.panY = 20;
      expect(tm.getPan()).toEqual({ x: 10, y: 20 });
    });

    it('setPan sets both x and y', () => {
      tm.setPan(30, 40);
      expect(tm.panX).toBe(30);
      expect(tm.panY).toBe(40);
    });
  });

  // ===========================================================================
  // Zoom
  // ===========================================================================

  describe('zoom', () => {
    it('defaults to 1', () => {
      expect(tm.zoom).toBe(1);
    });

    it('sets zoom via property setter', () => {
      tm.zoom = 2.5;
      expect(tm.zoom).toBe(2.5);
    });

    it('getZoom returns current zoom', () => {
      tm.zoom = 3;
      expect(tm.getZoom()).toBe(3);
    });

    it('setZoom resets pan to 0, 0 and cancels animation', () => {
      tm.panX = 100;
      tm.panY = 200;
      tm.setZoom(2);
      expect(tm.zoom).toBe(2);
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
    });
  });

  // ===========================================================================
  // Pinch zoom helpers
  // ===========================================================================

  describe('pinch zoom', () => {
    it('initialPinchDistance defaults to 0', () => {
      expect(tm.initialPinchDistance).toBe(0);
    });

    it('sets and gets initialPinchDistance', () => {
      tm.initialPinchDistance = 150;
      expect(tm.initialPinchDistance).toBe(150);
    });

    it('initialZoom defaults to 1', () => {
      expect(tm.initialZoom).toBe(1);
    });

    it('sets and gets initialZoom', () => {
      tm.initialZoom = 2;
      expect(tm.initialZoom).toBe(2);
    });
  });

  // ===========================================================================
  // Fit to window
  // ===========================================================================

  describe('fitToWindow', () => {
    it('resets pan and zoom to defaults', () => {
      tm.panX = 100;
      tm.panY = -50;
      tm.zoom = 3;
      tm.fitToWindow();
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
      expect(tm.zoom).toBe(1);
    });

    it('cancels in-progress zoom animation', () => {
      const renderFn = vi.fn();
      tm.setScheduleRender(renderFn);
      // Start an animation
      tm.smoothZoomTo(5, 500);
      expect(tm.isZoomAnimating()).toBe(true);
      // fitToWindow should cancel it
      tm.fitToWindow();
      expect(tm.isZoomAnimating()).toBe(false);
    });
  });

  // ===========================================================================
  // 2D Transform (rotation, flip, scale, translate)
  // ===========================================================================

  describe('transform', () => {
    it('defaults to DEFAULT_TRANSFORM', () => {
      const t = tm.transform;
      expect(t.rotation).toBe(0);
      expect(t.flipH).toBe(false);
      expect(t.flipV).toBe(false);
      expect(t.scale).toEqual({ x: 1, y: 1 });
      expect(t.translate).toEqual({ x: 0, y: 0 });
    });

    it('setTransform stores the transform', () => {
      tm.setTransform({ rotation: 90, flipH: true, flipV: false, scale: { x: 2, y: 2 }, translate: { x: 10, y: 20 } });
      expect(tm.transform.rotation).toBe(90);
      expect(tm.transform.flipH).toBe(true);
    });

    it('getTransform returns a deep copy', () => {
      tm.setTransform({ rotation: 180, flipH: false, flipV: true, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } });
      const copy = tm.getTransform();
      copy.scale.x = 999;
      expect(tm.transform.scale.x).not.toBe(999);
    });

    it('setTransform deep copies scale and translate with defaults', () => {
      tm.setTransform({ rotation: 270, flipH: false, flipV: false, scale: { x: 3, y: 4 }, translate: { x: 5, y: 6 } });
      const t = tm.getTransform();
      expect(t.scale).toEqual({ x: 3, y: 4 });
      expect(t.translate).toEqual({ x: 5, y: 6 });
    });
  });

  // ===========================================================================
  // Smooth zoom animation
  // ===========================================================================

  describe('smoothZoomTo', () => {
    it('applies instantly when duration is 0', () => {
      const renderFn = vi.fn();
      tm.setScheduleRender(renderFn);
      tm.smoothZoomTo(3, 0, 10, 20);
      expect(tm.zoom).toBe(3);
      expect(tm.panX).toBe(10);
      expect(tm.panY).toBe(20);
      expect(renderFn).toHaveBeenCalled();
    });

    it('applies instantly when already at target (within threshold)', () => {
      const renderFn = vi.fn();
      tm.setScheduleRender(renderFn);
      tm.smoothZoomTo(1, 200, 0, 0);
      // Already at zoom=1, pan=0,0 — should snap immediately
      expect(tm.zoom).toBe(1);
      expect(tm.isZoomAnimating()).toBe(false);
      expect(renderFn).toHaveBeenCalled();
    });

    it('starts animation for non-trivial zoom change', () => {
      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

      tm.smoothZoomTo(3, 200);
      expect(tm.isZoomAnimating()).toBe(true);

      vi.restoreAllMocks();
    });

    it('cancelZoomAnimation stops animation', () => {
      const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 42);

      tm.smoothZoomTo(5, 300);
      expect(tm.isZoomAnimating()).toBe(true);

      tm.cancelZoomAnimation();
      expect(tm.isZoomAnimating()).toBe(false);
      expect(cancelSpy).toHaveBeenCalledWith(42);

      vi.restoreAllMocks();
    });

    it('isZoomAnimating returns false when no animation running', () => {
      expect(tm.isZoomAnimating()).toBe(false);
    });

    it('uses current pan when targetPan is undefined', () => {
      const renderFn = vi.fn();
      tm.setScheduleRender(renderFn);
      tm.panX = 50;
      tm.panY = 60;
      tm.smoothZoomTo(2, 0); // duration=0, no pan targets
      expect(tm.panX).toBe(50);
      expect(tm.panY).toBe(60);
    });
  });

  describe('smoothFitToWindow', () => {
    it('calls smoothZoomTo with zoom=1 and pan=0,0', () => {
      const spy = vi.spyOn(tm, 'smoothZoomTo');
      tm.smoothFitToWindow();
      expect(spy).toHaveBeenCalledWith(1, 200, 0, 0);
    });
  });

  describe('smoothSetZoom', () => {
    it('calls smoothZoomTo with given level and pan=0,0', () => {
      const spy = vi.spyOn(tm, 'smoothZoomTo');
      tm.smoothSetZoom(4);
      expect(spy).toHaveBeenCalledWith(4, 200, 0, 0);
    });
  });

  // ===========================================================================
  // scheduleRender callback
  // ===========================================================================

  describe('scheduleRender', () => {
    it('setScheduleRender stores callback', () => {
      const fn = vi.fn();
      tm.setScheduleRender(fn);
      // Trigger via smoothZoomTo with duration=0
      tm.smoothZoomTo(2, 0);
      expect(fn).toHaveBeenCalled();
    });

    it('does not throw when no scheduleRender is set', () => {
      expect(() => tm.smoothZoomTo(2, 0)).not.toThrow();
    });
  });

  // ===========================================================================
  // Dispose
  // ===========================================================================

  describe('dispose', () => {
    it('cancels zoom animation', () => {
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 99);

      tm.smoothZoomTo(5, 300);
      tm.dispose();
      expect(tm.isZoomAnimating()).toBe(false);

      vi.restoreAllMocks();
    });

    it('clears scheduleRender callback', () => {
      const fn = vi.fn();
      tm.setScheduleRender(fn);
      tm.dispose();
      // After dispose, smoothZoomTo should not call the callback
      tm.smoothZoomTo(2, 0);
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
