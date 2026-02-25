/**
 * VideoFrameFetchTracker Unit Tests
 *
 * Tests for the state container that tracks pending video frame fetch state.
 * Based on test ID naming convention: VFFT-NNN
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VideoFrameFetchTracker } from './VideoFrameFetchTracker';

describe('VideoFrameFetchTracker', () => {
  let tracker: VideoFrameFetchTracker;

  beforeEach(() => {
    tracker = new VideoFrameFetchTracker();
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------
  describe('initial state', () => {
    it('VFFT-001: pendingVideoFrameFetch is null initially', () => {
      expect(tracker.pendingVideoFrameFetch).toBeNull();
    });

    it('VFFT-002: pendingVideoFrameNumber is 0 initially', () => {
      expect(tracker.pendingVideoFrameNumber).toBe(0);
    });

    it('VFFT-003: pendingSourceBFrameFetch is null initially', () => {
      expect(tracker.pendingSourceBFrameFetch).toBeNull();
    });

    it('VFFT-004: pendingSourceBFrameNumber is 0 initially', () => {
      expect(tracker.pendingSourceBFrameNumber).toBe(0);
    });

    it('VFFT-005: hasDisplayedSourceBMediabunnyFrame is false initially', () => {
      expect(tracker.hasDisplayedSourceBMediabunnyFrame).toBe(false);
    });

    it('VFFT-006: lastSourceBFrameCanvas is null initially', () => {
      expect(tracker.lastSourceBFrameCanvas).toBeNull();
    });

    it('VFFT-007: hasDisplayedMediabunnyFrame is false initially', () => {
      expect(tracker.hasDisplayedMediabunnyFrame).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // State mutation
  // ---------------------------------------------------------------------------
  describe('state mutation', () => {
    it('VFFT-010: pendingVideoFrameFetch can be set to a Promise', () => {
      const promise = Promise.resolve();
      tracker.pendingVideoFrameFetch = promise;
      expect(tracker.pendingVideoFrameFetch).toBe(promise);
    });

    it('VFFT-011: pendingVideoFrameNumber can be set to positive value', () => {
      tracker.pendingVideoFrameNumber = 42;
      expect(tracker.pendingVideoFrameNumber).toBe(42);
    });

    it('VFFT-012: pendingSourceBFrameFetch can be set to a Promise', () => {
      const promise = Promise.resolve();
      tracker.pendingSourceBFrameFetch = promise;
      expect(tracker.pendingSourceBFrameFetch).toBe(promise);
    });

    it('VFFT-013: pendingSourceBFrameNumber can be set', () => {
      tracker.pendingSourceBFrameNumber = 100;
      expect(tracker.pendingSourceBFrameNumber).toBe(100);
    });

    it('VFFT-014: hasDisplayedSourceBMediabunnyFrame can be set to true', () => {
      tracker.hasDisplayedSourceBMediabunnyFrame = true;
      expect(tracker.hasDisplayedSourceBMediabunnyFrame).toBe(true);
    });

    it('VFFT-015: lastSourceBFrameCanvas can be set to HTMLCanvasElement', () => {
      const canvas = document.createElement('canvas');
      tracker.lastSourceBFrameCanvas = canvas;
      expect(tracker.lastSourceBFrameCanvas).toBe(canvas);
    });

    it('VFFT-016: hasDisplayedMediabunnyFrame can be set to true', () => {
      tracker.hasDisplayedMediabunnyFrame = true;
      expect(tracker.hasDisplayedMediabunnyFrame).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------
  describe('reset', () => {
    it('VFFT-020: reset clears pendingVideoFrameFetch to null', () => {
      tracker.pendingVideoFrameFetch = Promise.resolve();
      tracker.reset();
      expect(tracker.pendingVideoFrameFetch).toBeNull();
    });

    it('VFFT-021: reset clears pendingVideoFrameNumber to 0', () => {
      tracker.pendingVideoFrameNumber = 42;
      tracker.reset();
      expect(tracker.pendingVideoFrameNumber).toBe(0);
    });

    it('VFFT-022: reset clears pendingSourceBFrameFetch to null', () => {
      tracker.pendingSourceBFrameFetch = Promise.resolve();
      tracker.reset();
      expect(tracker.pendingSourceBFrameFetch).toBeNull();
    });

    it('VFFT-023: reset clears pendingSourceBFrameNumber to 0', () => {
      tracker.pendingSourceBFrameNumber = 100;
      tracker.reset();
      expect(tracker.pendingSourceBFrameNumber).toBe(0);
    });

    it('VFFT-024: reset clears hasDisplayedSourceBMediabunnyFrame to false', () => {
      tracker.hasDisplayedSourceBMediabunnyFrame = true;
      tracker.reset();
      expect(tracker.hasDisplayedSourceBMediabunnyFrame).toBe(false);
    });

    it('VFFT-025: reset clears lastSourceBFrameCanvas to null', () => {
      tracker.lastSourceBFrameCanvas = document.createElement('canvas');
      tracker.reset();
      expect(tracker.lastSourceBFrameCanvas).toBeNull();
    });

    it('VFFT-026: reset clears hasDisplayedMediabunnyFrame to false', () => {
      tracker.hasDisplayedMediabunnyFrame = true;
      tracker.reset();
      expect(tracker.hasDisplayedMediabunnyFrame).toBe(false);
    });

    it('VFFT-027: reset restores all properties to initial state at once', () => {
      // Set all properties to non-default values
      tracker.pendingVideoFrameFetch = Promise.resolve();
      tracker.pendingVideoFrameNumber = 42;
      tracker.pendingSourceBFrameFetch = Promise.resolve();
      tracker.pendingSourceBFrameNumber = 100;
      tracker.hasDisplayedSourceBMediabunnyFrame = true;
      tracker.lastSourceBFrameCanvas = document.createElement('canvas');
      tracker.hasDisplayedMediabunnyFrame = true;

      tracker.reset();

      expect(tracker.pendingVideoFrameFetch).toBeNull();
      expect(tracker.pendingVideoFrameNumber).toBe(0);
      expect(tracker.pendingSourceBFrameFetch).toBeNull();
      expect(tracker.pendingSourceBFrameNumber).toBe(0);
      expect(tracker.hasDisplayedSourceBMediabunnyFrame).toBe(false);
      expect(tracker.lastSourceBFrameCanvas).toBeNull();
      expect(tracker.hasDisplayedMediabunnyFrame).toBe(false);
    });

    it('VFFT-028: reset is idempotent', () => {
      tracker.pendingVideoFrameNumber = 42;
      tracker.reset();
      tracker.reset();
      expect(tracker.pendingVideoFrameNumber).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose()
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('VFFT-030: dispose resets all state', () => {
      tracker.pendingVideoFrameFetch = Promise.resolve();
      tracker.pendingVideoFrameNumber = 42;
      tracker.hasDisplayedMediabunnyFrame = true;
      tracker.lastSourceBFrameCanvas = document.createElement('canvas');

      tracker.dispose();

      expect(tracker.pendingVideoFrameFetch).toBeNull();
      expect(tracker.pendingVideoFrameNumber).toBe(0);
      expect(tracker.hasDisplayedMediabunnyFrame).toBe(false);
      expect(tracker.lastSourceBFrameCanvas).toBeNull();
    });

    it('VFFT-031: dispose is idempotent', () => {
      tracker.dispose();
      expect(() => tracker.dispose()).not.toThrow();
    });

    it('VFFT-032: state can be set again after dispose', () => {
      tracker.dispose();
      tracker.pendingVideoFrameNumber = 10;
      expect(tracker.pendingVideoFrameNumber).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple instances
  // ---------------------------------------------------------------------------
  describe('multiple instances', () => {
    it('VFFT-040: separate instances have independent state', () => {
      const tracker2 = new VideoFrameFetchTracker();

      tracker.pendingVideoFrameNumber = 42;
      tracker2.pendingVideoFrameNumber = 100;

      expect(tracker.pendingVideoFrameNumber).toBe(42);
      expect(tracker2.pendingVideoFrameNumber).toBe(100);

      tracker.reset();
      expect(tracker.pendingVideoFrameNumber).toBe(0);
      expect(tracker2.pendingVideoFrameNumber).toBe(100);
    });
  });
});
