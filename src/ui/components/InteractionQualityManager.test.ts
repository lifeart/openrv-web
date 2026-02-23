/**
 * InteractionQualityManager Tests
 *
 * Tests for the adaptive proxy rendering quality manager that reduces
 * GL viewport resolution during interactions (zoom, scrub) and restores
 * full quality after a debounce period.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InteractionQualityManager } from './InteractionQualityManager';
import { INTERACTION_QUALITY_FACTOR, INTERACTION_DEBOUNCE_MS } from '../../config/RenderConfig';

describe('InteractionQualityManager', () => {
  let manager: InteractionQualityManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new InteractionQualityManager();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('IQM-U001: should have quality factor of 1.0', () => {
      expect(manager.qualityFactor).toBe(1.0);
    });

    it('IQM-U002: should not be interacting', () => {
      expect(manager.isInteracting).toBe(false);
    });

    it('IQM-U003: effective viewport should equal input dimensions', () => {
      const { w, h } = manager.getEffectiveViewport(1920, 1080);
      expect(w).toBe(1920);
      expect(h).toBe(1080);
    });
  });

  describe('beginInteraction', () => {
    it('IQM-U010: should set quality factor to interaction value', () => {
      manager.beginInteraction();
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);
    });

    it('IQM-U011: should mark as interacting', () => {
      manager.beginInteraction();
      expect(manager.isInteracting).toBe(true);
    });

    it('IQM-U012: should reduce effective viewport dimensions', () => {
      manager.beginInteraction();
      const { w, h } = manager.getEffectiveViewport(1920, 1080);
      expect(w).toBe(Math.round(1920 * INTERACTION_QUALITY_FACTOR));
      expect(h).toBe(Math.round(1080 * INTERACTION_QUALITY_FACTOR));
    });

    it('IQM-U013: quality factor should equal configured INTERACTION_QUALITY_FACTOR', () => {
      manager.beginInteraction();
      expect(manager.qualityFactor).toBe(0.5);
      expect(INTERACTION_QUALITY_FACTOR).toBe(0.5);
    });
  });

  describe('endInteraction', () => {
    it('IQM-U020: should restore quality factor to 1.0 after debounce', () => {
      manager.beginInteraction();
      manager.endInteraction();
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);

      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(manager.qualityFactor).toBe(1.0);
    });

    it('IQM-U021: should not restore quality before debounce completes', () => {
      manager.beginInteraction();
      manager.endInteraction();

      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS - 1);
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);
    });

    it('IQM-U022: should mark as not interacting immediately', () => {
      manager.beginInteraction();
      manager.endInteraction();
      expect(manager.isInteracting).toBe(false);
    });

    it('IQM-U023: should restore full viewport after debounce', () => {
      manager.beginInteraction();
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);

      const { w, h } = manager.getEffectiveViewport(1920, 1080);
      expect(w).toBe(1920);
      expect(h).toBe(1080);
    });

    it('IQM-U024: debounce delay should match configured INTERACTION_DEBOUNCE_MS', () => {
      expect(INTERACTION_DEBOUNCE_MS).toBe(200);
    });
  });

  describe('reference counting', () => {
    it('IQM-U030: multiple begins need equal ends before debounce starts', () => {
      manager.beginInteraction();
      manager.beginInteraction();
      manager.beginInteraction();

      expect(manager.isInteracting).toBe(true);

      // First end: still 2 active
      manager.endInteraction();
      expect(manager.isInteracting).toBe(true);
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      // Quality should NOT be restored because still interacting
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);

      // Second end: still 1 active
      manager.endInteraction();
      expect(manager.isInteracting).toBe(true);
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);

      // Third end: all done, debounce starts
      manager.endInteraction();
      expect(manager.isInteracting).toBe(false);
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(manager.qualityFactor).toBe(1.0);
    });

    it('IQM-U031: new begin cancels pending debounce timer', () => {
      manager.beginInteraction();
      manager.endInteraction();

      // Debounce is running, but a new interaction starts before it fires
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS - 50);
      manager.beginInteraction();

      // Advance past the original debounce time
      vi.advanceTimersByTime(100);
      // Quality should still be at interaction level, debounce was cancelled
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);
      expect(manager.isInteracting).toBe(true);
    });

    it('IQM-U032: overlapping interactions maintain reduced quality', () => {
      // Simulate zoom starting
      manager.beginInteraction();
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);

      // Simulate scrub starting while zoom is active
      manager.beginInteraction();
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);

      // Zoom ends, but scrub is still active
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      // Should NOT restore since scrub is still active
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);

      // Scrub ends, now debounce should start
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(manager.qualityFactor).toBe(1.0);
    });
  });

  describe('getEffectiveViewport', () => {
    it('IQM-U040: returns rounded integer dimensions', () => {
      manager.beginInteraction();
      // 1921 * 0.5 = 960.5 -> rounds to 961
      const { w, h } = manager.getEffectiveViewport(1921, 1081);
      expect(w).toBe(Math.round(1921 * INTERACTION_QUALITY_FACTOR));
      expect(h).toBe(Math.round(1081 * INTERACTION_QUALITY_FACTOR));
      expect(Number.isInteger(w)).toBe(true);
      expect(Number.isInteger(h)).toBe(true);
    });

    it('IQM-U041: clamps minimum dimension to 1', () => {
      manager.beginInteraction();
      // Very small dimensions: 1 * 0.5 = 0.5 -> rounds to 1 (clamped)
      const { w, h } = manager.getEffectiveViewport(1, 1);
      expect(w).toBe(1);
      expect(h).toBe(1);
    });

    it('IQM-U042: zero input dimensions produce minimum of 1', () => {
      manager.beginInteraction();
      const { w, h } = manager.getEffectiveViewport(0, 0);
      expect(w).toBe(1);
      expect(h).toBe(1);
    });

    it('IQM-U043: returns full dimensions when not interacting', () => {
      const { w, h } = manager.getEffectiveViewport(3840, 2160);
      expect(w).toBe(3840);
      expect(h).toBe(2160);
    });

    it('IQM-U044: returns reduced dimensions during interaction', () => {
      manager.beginInteraction();
      const { w, h } = manager.getEffectiveViewport(3840, 2160);
      expect(w).toBe(1920);
      expect(h).toBe(1080);
    });
  });

  describe('onQualityChange callback', () => {
    it('IQM-U050: callback fires when quality restores after debounce', () => {
      const callback = vi.fn();
      manager.setOnQualityChange(callback);

      manager.beginInteraction();
      manager.endInteraction();

      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('IQM-U051: callback does not fire on beginInteraction', () => {
      const callback = vi.fn();
      manager.setOnQualityChange(callback);

      manager.beginInteraction();
      expect(callback).not.toHaveBeenCalled();
    });

    it('IQM-U052: callback does not fire if quality is already 1.0', () => {
      const callback = vi.fn();
      manager.setOnQualityChange(callback);

      // End without begin -- counter is clamped to 0 but quality was already 1.0
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);

      expect(callback).not.toHaveBeenCalled();
    });

    it('IQM-U053: callback fires only once per quality restoration', () => {
      const callback = vi.fn();
      manager.setOnQualityChange(callback);

      // First interaction cycle
      manager.beginInteraction();
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second interaction cycle
      manager.beginInteraction();
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('dispose', () => {
    it('IQM-U060: should cancel pending debounce timer', () => {
      const callback = vi.fn();
      manager.setOnQualityChange(callback);

      manager.beginInteraction();
      manager.endInteraction();

      manager.dispose();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);

      // Callback should NOT fire because dispose cancelled the timer
      expect(callback).not.toHaveBeenCalled();
    });

    it('IQM-U061: should clear the onQualityChange callback', () => {
      const callback = vi.fn();
      manager.setOnQualityChange(callback);

      manager.dispose();

      // Even if we somehow trigger quality change after dispose, callback is null
      manager.beginInteraction();
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);

      expect(callback).not.toHaveBeenCalled();
    });

    it('IQM-U062: dispose is safe to call multiple times', () => {
      expect(() => {
        manager.dispose();
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('IQM-U070: endInteraction without beginInteraction does not go negative', () => {
      manager.endInteraction();
      expect(manager.isInteracting).toBe(false);
      // Quality was never reduced, so counter should be clamped at 0
      expect(manager.qualityFactor).toBe(1.0);
    });

    it('IQM-U071: multiple endInteraction calls without begin are safe', () => {
      manager.endInteraction();
      manager.endInteraction();
      manager.endInteraction();
      expect(manager.isInteracting).toBe(false);
    });

    it('IQM-U072: rapid begin/end cycles work correctly', () => {
      for (let i = 0; i < 10; i++) {
        manager.beginInteraction();
        manager.endInteraction();
      }
      // After all cycles, debounce should restore quality
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(manager.qualityFactor).toBe(1.0);
      expect(manager.isInteracting).toBe(false);
    });

    it('IQM-U073: begin after debounce restores reduces quality again', () => {
      manager.beginInteraction();
      manager.endInteraction();
      vi.advanceTimersByTime(INTERACTION_DEBOUNCE_MS);
      expect(manager.qualityFactor).toBe(1.0);

      // Start a new interaction
      manager.beginInteraction();
      expect(manager.qualityFactor).toBe(INTERACTION_QUALITY_FACTOR);
      expect(manager.isInteracting).toBe(true);
    });

    it('IQM-U074: large viewport dimensions scale correctly', () => {
      manager.beginInteraction();
      const { w, h } = manager.getEffectiveViewport(7680, 4320);
      expect(w).toBe(3840);
      expect(h).toBe(2160);
    });
  });

  describe('cpuHalfRes', () => {
    it('IQM-CPU-001: cpuHalfRes is false when no active interactions', () => {
      expect(manager.cpuHalfRes).toBe(false);
    });

    it('IQM-CPU-002: cpuHalfRes is true during active interaction', () => {
      manager.beginInteraction();
      expect(manager.cpuHalfRes).toBe(true);
    });

    it('IQM-CPU-003: cpuHalfRes is true with multiple overlapping interactions', () => {
      manager.beginInteraction();
      manager.beginInteraction();
      expect(manager.cpuHalfRes).toBe(true);
      manager.endInteraction();
      expect(manager.cpuHalfRes).toBe(true); // Still one active
    });

    it('IQM-CPU-004: cpuHalfRes returns to false after all interactions end', async () => {
      manager.beginInteraction();
      manager.endInteraction();
      // _activeInteractions drops to 0 immediately on endInteraction,
      // so cpuHalfRes (_activeInteractions > 0) is already false
      expect(manager.cpuHalfRes).toBe(false);
    });
  });
});
