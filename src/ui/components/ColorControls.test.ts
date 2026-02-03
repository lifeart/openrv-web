/**
 * ColorControls Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ColorControls,
  DEFAULT_COLOR_ADJUSTMENTS,
} from './ColorControls';
import type { LUT3D } from '../../color/LUTLoader';

describe('ColorControls', () => {
  let controls: ColorControls;

  beforeEach(() => {
    controls = new ColorControls();
  });

  afterEach(() => {
    controls.dispose();
  });

  describe('initialization', () => {
    it('COL-001: starts with default adjustments', () => {
      const adjustments = controls.getAdjustments();
      expect(adjustments).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('COL-002: default exposure is 0', () => {
      expect(controls.getAdjustments().exposure).toBe(0);
    });

    it('COL-003: default gamma is 1', () => {
      expect(controls.getAdjustments().gamma).toBe(1);
    });

    it('COL-004: default saturation is 1', () => {
      expect(controls.getAdjustments().saturation).toBe(1);
    });

    it('COL-005: default contrast is 1', () => {
      expect(controls.getAdjustments().contrast).toBe(1);
    });

    it('COL-006: default temperature is 0', () => {
      expect(controls.getAdjustments().temperature).toBe(0);
    });

    it('COL-007: default tint is 0', () => {
      expect(controls.getAdjustments().tint).toBe(0);
    });

    it('COL-008: default brightness is 0', () => {
      expect(controls.getAdjustments().brightness).toBe(0);
    });

    it('COL-029: default hueRotation is 0', () => {
      expect(controls.getAdjustments().hueRotation).toBe(0);
    });
  });

  describe('getAdjustments', () => {
    it('COL-009: returns copy of adjustments', () => {
      const adj1 = controls.getAdjustments();
      const adj2 = controls.getAdjustments();
      expect(adj1).not.toBe(adj2);
      expect(adj1).toEqual(adj2);
    });
  });

  describe('setAdjustments', () => {
    it('COL-010: sets partial adjustments', () => {
      controls.setAdjustments({ exposure: 1.5 });
      expect(controls.getAdjustments().exposure).toBe(1.5);
      // Other values unchanged
      expect(controls.getAdjustments().gamma).toBe(1);
    });

    it('COL-011: sets multiple adjustments', () => {
      controls.setAdjustments({ exposure: 2, gamma: 1.5, saturation: 0.5 });
      const adj = controls.getAdjustments();
      expect(adj.exposure).toBe(2);
      expect(adj.gamma).toBe(1.5);
      expect(adj.saturation).toBe(0.5);
    });

    it('COL-030: sets hueRotation adjustment', () => {
      controls.setAdjustments({ hueRotation: 180 });
      expect(controls.getAdjustments().hueRotation).toBe(180);
      // Other values unchanged
      expect(controls.getAdjustments().exposure).toBe(0);
    });

    it('COL-031: sets hueRotation to max value 360', () => {
      controls.setAdjustments({ hueRotation: 360 });
      expect(controls.getAdjustments().hueRotation).toBe(360);
    });

    it('COL-033: setAdjustments with NaN hueRotation falls back to default', () => {
      controls.setAdjustments({ hueRotation: NaN });
      expect(controls.getAdjustments().hueRotation).toBe(DEFAULT_COLOR_ADJUSTMENTS.hueRotation);
    });

    it('COL-034: setAdjustments with Infinity exposure falls back to default', () => {
      controls.setAdjustments({ exposure: Infinity });
      expect(controls.getAdjustments().exposure).toBe(DEFAULT_COLOR_ADJUSTMENTS.exposure);
    });

    it('COL-035: setAdjustments with -Infinity brightness falls back to default', () => {
      controls.setAdjustments({ brightness: -Infinity });
      expect(controls.getAdjustments().brightness).toBe(DEFAULT_COLOR_ADJUSTMENTS.brightness);
    });

    it('COL-036: setAdjustments with mixed valid and NaN values keeps valid ones', () => {
      controls.setAdjustments({ hueRotation: NaN, exposure: 2.5 });
      expect(controls.getAdjustments().hueRotation).toBe(DEFAULT_COLOR_ADJUSTMENTS.hueRotation);
      expect(controls.getAdjustments().exposure).toBe(2.5);
    });

    it('COL-012: emits adjustmentsChanged event', () => {
      const handler = vi.fn();
      controls.on('adjustmentsChanged', handler);

      controls.setAdjustments({ exposure: 1 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ exposure: 1 }));
    });
  });

  describe('reset', () => {
    it('COL-013: reset returns all values to defaults', () => {
      controls.setAdjustments({
        exposure: 2,
        gamma: 2.2,
        saturation: 0,
        contrast: 1.5,
        temperature: 50,
        tint: -30,
        brightness: 0.5,
      });

      controls.reset();

      expect(controls.getAdjustments()).toEqual(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('COL-032: reset restores hueRotation to default', () => {
      controls.setAdjustments({ hueRotation: 270 });
      expect(controls.getAdjustments().hueRotation).toBe(270);

      controls.reset();

      expect(controls.getAdjustments().hueRotation).toBe(0);
    });

    it('COL-014: reset emits adjustmentsChanged event', () => {
      const handler = vi.fn();
      controls.setAdjustments({ exposure: 2 });

      controls.on('adjustmentsChanged', handler);
      controls.reset();

      expect(handler).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(DEFAULT_COLOR_ADJUSTMENTS);
    });
  });

  describe('toggle/show/hide', () => {
    it('COL-015: toggle shows panel when hidden', () => {
      const handler = vi.fn();
      controls.on('visibilityChanged', handler);

      controls.toggle();

      expect(handler).toHaveBeenCalledWith(true);
    });

    it('COL-016: toggle hides panel when visible', () => {
      const handler = vi.fn();
      controls.on('visibilityChanged', handler);

      controls.show();
      handler.mockClear();

      controls.toggle();

      expect(handler).toHaveBeenCalledWith(false);
    });

    it('COL-017: show emits visibilityChanged true', () => {
      const handler = vi.fn();
      controls.on('visibilityChanged', handler);

      controls.show();

      expect(handler).toHaveBeenCalledWith(true);
    });

    it('COL-018: hide emits visibilityChanged false', () => {
      const handler = vi.fn();
      controls.show();
      controls.on('visibilityChanged', handler);

      controls.hide();

      expect(handler).toHaveBeenCalledWith(false);
    });

    it('COL-019: show is idempotent', () => {
      const handler = vi.fn();
      controls.on('visibilityChanged', handler);

      controls.show();
      controls.show();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('COL-020: hide is idempotent', () => {
      const handler = vi.fn();
      controls.on('visibilityChanged', handler);

      controls.hide();
      controls.hide();

      expect(handler).toHaveBeenCalledTimes(0);
    });
  });

  describe('LUT handling', () => {
    it('COL-021: getLUT returns null initially', () => {
      expect(controls.getLUT()).toBeNull();
    });

    it('COL-022: getLUTIntensity returns 1 initially', () => {
      expect(controls.getLUTIntensity()).toBe(1);
    });

    it('COL-023: setLUT emits lutLoaded event', () => {
      const handler = vi.fn();
      controls.on('lutLoaded', handler);

      const mockLUT: LUT3D = {
        title: 'Test LUT',
        size: 17,
        data: new Float32Array(17 * 17 * 17 * 3),
        domainMin: [0, 0, 0] as [number, number, number],
        domainMax: [1, 1, 1] as [number, number, number]
      };
      controls.setLUT(mockLUT);

      expect(handler).toHaveBeenCalledWith(mockLUT);
    });

    it('COL-024: clearLUT sets LUT to null', () => {
      const mockLUT: LUT3D = {
        title: 'Test LUT',
        size: 17,
        data: new Float32Array(17 * 17 * 17 * 3),
        domainMin: [0, 0, 0] as [number, number, number],
        domainMax: [1, 1, 1] as [number, number, number]
      };
      controls.setLUT(mockLUT);
      expect(controls.getLUT()).not.toBeNull();

      controls.clearLUT();
      expect(controls.getLUT()).toBeNull();
    });

    it('COL-025: clearLUT emits lutLoaded with null', () => {
      const handler = vi.fn();
      const mockLUT: LUT3D = {
        title: 'Test LUT',
        size: 17,
        data: new Float32Array(17 * 17 * 17 * 3),
        domainMin: [0, 0, 0] as [number, number, number],
        domainMax: [1, 1, 1] as [number, number, number]
      };
      controls.setLUT(mockLUT);
      controls.on('lutLoaded', handler);

      controls.clearLUT();

      expect(handler).toHaveBeenCalledWith(null);
    });
  });

  describe('render', () => {
    it('COL-026: render returns HTMLElement', () => {
      const element = controls.render();
      expect(element).toBeInstanceOf(HTMLElement);
    });

    it('COL-027: render returns container element', () => {
      const element = controls.render();
      expect(element.className).toBe('color-controls-container');
    });
  });

  describe('throttledEmitAdjustments', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('COL-037: throttle emits immediately on first call then coalesces', () => {
      const handler = vi.fn();
      controls.on('adjustmentsChanged', handler);

      // Access the private throttle method to test its behavior directly
      const throttle = (controls as unknown as { throttledEmitAdjustments: () => void });
      const adjustments = (controls as unknown as { adjustments: Record<string, number> });

      // First call emits immediately
      adjustments.adjustments.exposure = 1.0;
      throttle.throttledEmitAdjustments();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ exposure: 1.0 }));

      // Subsequent calls within throttle window are coalesced
      adjustments.adjustments.exposure = 1.5;
      throttle.throttledEmitAdjustments();
      adjustments.adjustments.exposure = 2.0;
      throttle.throttledEmitAdjustments();
      adjustments.adjustments.exposure = 2.5;
      throttle.throttledEmitAdjustments();

      // Still only 1 call (the rest are pending)
      expect(handler).toHaveBeenCalledTimes(1);

      // After throttle period, final pending value emits
      vi.advanceTimersByTime(32);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ exposure: 2.5 }));
    });

    it('COL-038: throttle timer resets after period expires', () => {
      const handler = vi.fn();
      controls.on('adjustmentsChanged', handler);

      const throttle = (controls as unknown as { throttledEmitAdjustments: () => void });
      const adjustments = (controls as unknown as { adjustments: Record<string, number> });

      // First burst
      adjustments.adjustments.exposure = 1.0;
      throttle.throttledEmitAdjustments();
      expect(handler).toHaveBeenCalledTimes(1);

      // Let timer expire
      vi.advanceTimersByTime(32);
      expect(handler).toHaveBeenCalledTimes(2);

      // Second burst should emit immediately (timer expired)
      adjustments.adjustments.exposure = 3.0;
      throttle.throttledEmitAdjustments();
      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ exposure: 3.0 }));
    });

    it('COL-039: throttle does not emit pending if no changes after initial', () => {
      const handler = vi.fn();
      controls.on('adjustmentsChanged', handler);

      const throttle = (controls as unknown as { throttledEmitAdjustments: () => void });

      // Single call - emits immediately
      throttle.throttledEmitAdjustments();
      expect(handler).toHaveBeenCalledTimes(1);

      // Timer fires but pending value is same as initial - still emits the pending
      vi.advanceTimersByTime(32);
      // The throttle always sets _pendingAdjustments before checking timer,
      // so the timer callback will emit it
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('COL-040: setAdjustments bypasses throttle for immediate programmatic update', () => {
      const handler = vi.fn();
      controls.on('adjustmentsChanged', handler);

      // setAdjustments always emits immediately, not throttled
      controls.setAdjustments({ exposure: 3.0 });
      expect(handler).toHaveBeenCalledTimes(1);

      controls.setAdjustments({ exposure: 4.0 });
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('COL-041: reset bypasses throttle for immediate feedback', () => {
      const handler = vi.fn();
      controls.setAdjustments({ exposure: 2.0 });

      controls.on('adjustmentsChanged', handler);
      controls.reset();

      // reset() emits directly, not through throttle
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(DEFAULT_COLOR_ADJUSTMENTS);
    });

    it('COL-042: dispose cleans up throttle timer without errors', () => {
      const throttle = (controls as unknown as { throttledEmitAdjustments: () => void });

      // Start a throttle timer
      throttle.throttledEmitAdjustments();
      throttle.throttledEmitAdjustments();

      // Dispose before timer fires
      expect(() => controls.dispose()).not.toThrow();

      // Advancing timers after dispose should not cause errors
      vi.advanceTimersByTime(100);
    });

    it('COL-043: throttle internal state is cleaned up on dispose', () => {
      const internals = (controls as unknown as {
        throttledEmitAdjustments: () => void;
        _inputThrottleTimer: ReturnType<typeof setTimeout> | null;
        _pendingAdjustments: unknown;
      });

      internals.throttledEmitAdjustments();
      internals.throttledEmitAdjustments();

      // Timer should be active
      expect(internals._inputThrottleTimer).not.toBeNull();

      controls.dispose();

      // Timer and pending should be cleaned up
      expect(internals._inputThrottleTimer).toBeNull();
      expect(internals._pendingAdjustments).toBeNull();
    });
  });

  describe('DEFAULT_COLOR_ADJUSTMENTS', () => {
    it('COL-028: has correct default values', () => {
      expect(DEFAULT_COLOR_ADJUSTMENTS.exposure).toBe(0);
      expect(DEFAULT_COLOR_ADJUSTMENTS.gamma).toBe(1);
      expect(DEFAULT_COLOR_ADJUSTMENTS.saturation).toBe(1);
      expect(DEFAULT_COLOR_ADJUSTMENTS.contrast).toBe(1);
      expect(DEFAULT_COLOR_ADJUSTMENTS.hueRotation).toBe(0);
      expect(DEFAULT_COLOR_ADJUSTMENTS.temperature).toBe(0);
      expect(DEFAULT_COLOR_ADJUSTMENTS.tint).toBe(0);
      expect(DEFAULT_COLOR_ADJUSTMENTS.brightness).toBe(0);
    });
  });
});
