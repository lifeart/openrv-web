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
  // Fit Mode
  // ===========================================================================

  describe('fitMode', () => {
    it('defaults to "all"', () => {
      expect(tm.fitMode).toBe('all');
    });

    it('fitToWindow sets fitMode to "all"', () => {
      tm.fitMode = 'width';
      tm.fitToWindow();
      expect(tm.fitMode).toBe('all');
    });

    it('fitToWidth sets fitMode to "width" and resets pan/zoom', () => {
      tm.panX = 100;
      tm.panY = -50;
      tm.zoom = 3;
      tm.fitToWidth();
      expect(tm.fitMode).toBe('width');
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
      expect(tm.zoom).toBe(1);
    });

    it('fitToHeight sets fitMode to "height" and resets pan/zoom', () => {
      tm.panX = 100;
      tm.panY = -50;
      tm.zoom = 3;
      tm.fitToHeight();
      expect(tm.fitMode).toBe('height');
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
      expect(tm.zoom).toBe(1);
    });

    it('clearFitMode sets fitMode to null', () => {
      tm.fitToWidth();
      expect(tm.fitMode).toBe('width');
      tm.clearFitMode();
      expect(tm.fitMode).toBeNull();
    });

    it('setZoom clears fitMode', () => {
      tm.fitToWidth();
      expect(tm.fitMode).toBe('width');
      tm.setZoom(2);
      expect(tm.fitMode).toBeNull();
    });

    it('fitMode setter works directly', () => {
      tm.fitMode = 'height';
      expect(tm.fitMode).toBe('height');
      tm.fitMode = null;
      expect(tm.fitMode).toBeNull();
    });

    it('resetForSourceChange preserves fitMode while resetting pan/zoom', () => {
      tm.fitToWidth();
      tm.panX = 50;
      tm.panY = 30;
      tm.zoom = 2;
      tm.resetForSourceChange();
      expect(tm.fitMode).toBe('width');
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
      expect(tm.zoom).toBe(1);
    });

    it('resetForSourceChange defaults to fit-all when no fit mode is active', () => {
      tm.clearFitMode();
      tm.panX = 50;
      tm.panY = 30;
      tm.zoom = 2;
      tm.resetForSourceChange();
      expect(tm.fitMode).toBe('all');
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
      expect(tm.zoom).toBe(1);
    });

    it('resetForSourceChange preserves fit-height mode', () => {
      tm.fitToHeight();
      tm.panX = 100;
      tm.resetForSourceChange();
      expect(tm.fitMode).toBe('height');
      expect(tm.panX).toBe(0);
    });
  });

  describe('smoothFitToWidth', () => {
    it('sets fitMode to "width" and calls smoothZoomTo', () => {
      const spy = vi.spyOn(tm, 'smoothZoomTo');
      tm.smoothFitToWidth();
      expect(tm.fitMode).toBe('width');
      expect(spy).toHaveBeenCalledWith(1, 200, 0, 0);
    });
  });

  describe('smoothFitToHeight', () => {
    it('sets fitMode to "height" and calls smoothZoomTo', () => {
      const spy = vi.spyOn(tm, 'smoothZoomTo');
      tm.smoothFitToHeight();
      expect(tm.fitMode).toBe('height');
      expect(spy).toHaveBeenCalledWith(1, 200, 0, 0);
    });
  });

  // ===========================================================================
  // onZoomChanged callback
  // ===========================================================================

  describe('onZoomChanged callback', () => {
    it('setZoom fires onZoomChanged', () => {
      const callback = vi.fn();
      tm.setOnZoomChanged(callback);
      tm.setZoom(2);
      expect(callback).toHaveBeenCalledWith(2);
    });

    it('setZoom fires with correct value for each call', () => {
      const callback = vi.fn();
      tm.setOnZoomChanged(callback);
      tm.setZoom(0.5);
      tm.setZoom(3);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, 0.5);
      expect(callback).toHaveBeenNthCalledWith(2, 3);
    });

    it('smoothZoomTo with duration 0 fires onZoomChanged immediately', () => {
      const callback = vi.fn();
      tm.setOnZoomChanged(callback);
      tm.setScheduleRender(() => {});
      tm.smoothZoomTo(3, 0);
      expect(callback).toHaveBeenCalledWith(3);
    });

    it('smoothZoomTo when already at target fires onZoomChanged', () => {
      const callback = vi.fn();
      tm.setOnZoomChanged(callback);
      tm.setScheduleRender(() => {});
      // Already at zoom=1, pan=0,0
      tm.smoothZoomTo(1, 200, 0, 0);
      expect(callback).toHaveBeenCalledWith(1);
    });

    it('setting callback to null stops notifications', () => {
      const callback = vi.fn();
      tm.setOnZoomChanged(callback);
      tm.setZoom(2);
      expect(callback).toHaveBeenCalledOnce();

      tm.setOnZoomChanged(null);
      tm.setZoom(3);
      expect(callback).toHaveBeenCalledOnce(); // Not called again
    });

    it('no callback set does not throw', () => {
      expect(() => tm.setZoom(2)).not.toThrow();
    });

    it('smoothZoomTo animation completion fires onZoomChanged', () => {
      const callback = vi.fn();
      tm.setOnZoomChanged(callback);
      tm.setScheduleRender(() => {});

      const rafCallbacks: FrameRequestCallback[] = [];
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});

      // Start animation from zoom=1 to zoom=3
      tm.smoothZoomTo(3, 200);
      expect(callback).not.toHaveBeenCalled();

      // Simulate animation completion by calling the last RAF callback with a time
      // far past the duration (startTime + duration + extra)
      const startTime = performance.now();
      if (rafCallbacks.length > 0) {
        rafCallbacks[rafCallbacks.length - 1]!(startTime + 300);
      }
      // The completion callback may trigger another RAF frame or complete
      // Run all remaining callbacks to ensure completion
      while (rafCallbacks.length > 0) {
        const cb = rafCallbacks.pop();
        if (cb) cb(startTime + 500);
      }

      expect(callback).toHaveBeenCalledWith(3);

      vi.restoreAllMocks();
    });
  });

  // ===========================================================================
  // onViewChanged callback (notifyViewChanged)
  // ===========================================================================

  describe('onViewChanged callback', () => {
    it('zoom setter fires onViewChanged', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.zoom = 2.5;
      expect(callback).toHaveBeenCalledWith(0, 0, 2.5);
    });

    it('panX setter fires onViewChanged', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.panX = 42;
      expect(callback).toHaveBeenCalledWith(42, 0, 1);
    });

    it('panY setter fires onViewChanged', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.panY = -30;
      expect(callback).toHaveBeenCalledWith(0, -30, 1);
    });

    it('setPan fires onViewChanged once', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.setPan(10, 20);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(10, 20, 1);
    });

    it('setZoom fires onViewChanged', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.setZoom(3);
      expect(callback).toHaveBeenCalledWith(0, 0, 3);
    });

    it('setting callback to null stops notifications', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.zoom = 2;
      expect(callback).toHaveBeenCalledOnce();

      tm.setOnViewChanged(null);
      tm.zoom = 3;
      expect(callback).toHaveBeenCalledOnce(); // Not called again
    });

    it('dispose clears onViewChanged callback', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.dispose();
      tm.zoom = 5;
      expect(callback).not.toHaveBeenCalled();
    });

    it('smoothZoomTo with duration 0 fires onViewChanged', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.setScheduleRender(() => {});
      tm.smoothZoomTo(3, 0, 10, 20);
      expect(callback).toHaveBeenCalledWith(10, 20, 3);
    });

    it('fitToWindow fires onViewChanged with reset values', () => {
      const callback = vi.fn();
      tm.setOnViewChanged(callback);
      tm.zoom = 2;
      tm.panX = 50;
      callback.mockClear();

      tm.fitToWindow();
      // fitToWindow now notifies listeners so the bridge stays in sync
      expect(callback).toHaveBeenCalledWith(0, 0, 1);
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

    it('clears onZoomChanged callback', () => {
      const fn = vi.fn();
      tm.setOnZoomChanged(fn);
      tm.dispose();
      // After dispose, setZoom should not call the callback
      tm.setZoom(5);
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
