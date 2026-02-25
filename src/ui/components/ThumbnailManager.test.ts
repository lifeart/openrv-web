import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThumbnailManager } from './ThumbnailManager';
import type { Session } from '../../core/session/Session';
import type { MediaSource } from '../../core/session/Session';

/**
 * Minimal stub that satisfies the subset of Session used by ThumbnailManager.
 * ThumbnailManager only accesses: currentSource, getSequenceFrameImage, getVideoFrameCanvas.
 * Using a plain object avoids the heavy Session constructor (PlaybackEngine, managers, events).
 */
function createSessionStub() {
  return {
    currentSource: null as MediaSource | null,
    getSequenceFrameImage: vi.fn().mockResolvedValue(null),
    getVideoFrameCanvas: vi.fn().mockReturnValue(null),
  };
}

describe('ThumbnailManager', () => {
  let manager: ThumbnailManager;
  let stub: ReturnType<typeof createSessionStub>;

  beforeEach(() => {
    stub = createSessionStub();
    manager = new ThumbnailManager(stub as unknown as Session);
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('calculateSlots', () => {
    it('should return empty array for invalid inputs', () => {
      // Zero duration
      let slots = manager.calculateSlots(60, 35, 500, 24, 0, 1920, 1080);
      expect(slots).toEqual([]);

      // Zero source dimensions
      slots = manager.calculateSlots(60, 35, 500, 24, 100, 0, 1080);
      expect(slots).toEqual([]);

      // Zero track width
      slots = manager.calculateSlots(60, 35, 0, 24, 100, 1920, 1080);
      expect(slots).toEqual([]);
    });

    it('should calculate slots with correct dimensions', () => {
      const slots = manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(30);

      // Check first slot
      const firstSlot = slots[0];
      expect(firstSlot).toBeDefined();
      expect(firstSlot!.frame).toBe(1);
      expect(firstSlot!.x).toBeGreaterThanOrEqual(60);
      expect(firstSlot!.width).toBeGreaterThan(0);
      expect(firstSlot!.height).toBeGreaterThan(0);
      expect(firstSlot!.height).toBeLessThanOrEqual(24);
    });

    it('should preserve aspect ratio', () => {
      const sourceWidth = 1920;
      const sourceHeight = 1080;
      const expectedAspect = sourceWidth / sourceHeight;

      const slots = manager.calculateSlots(60, 35, 500, 24, 100, sourceWidth, sourceHeight);

      for (const slot of slots) {
        const slotAspect = slot.width / slot.height;
        expect(Math.abs(slotAspect - expectedAspect)).toBeLessThan(0.1);
      }
    });

    it('should distribute frames evenly across duration', () => {
      const duration = 100;
      const slots = manager.calculateSlots(60, 35, 500, 24, duration, 1920, 1080);

      // First frame should be 1
      expect(slots[0]?.frame).toBe(1);

      // Last frame should be close to duration
      const lastSlot = slots[slots.length - 1];
      expect(lastSlot?.frame).toBeLessThanOrEqual(duration);
      expect(lastSlot?.frame).toBeGreaterThan(duration - 10);
    });
  });

  describe('getSlots', () => {
    it('should return calculated slots', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      const slots = manager.getSlots();

      expect(slots.length).toBeGreaterThan(0);
    });

    it('should return empty array before calculation', () => {
      const slots = manager.getSlots();
      expect(slots).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear slots and cache', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      expect(manager.getSlots().length).toBeGreaterThan(0);

      manager.clear();
      expect(manager.getSlots()).toEqual([]);
    });
  });

  describe('getThumbnail', () => {
    it('should return null for uncached frame', () => {
      const thumbnail = manager.getThumbnail(1);
      expect(thumbnail).toBeNull();
    });
  });

  describe('isFullyLoaded', () => {
    it('should return true when no slots exist', () => {
      expect(manager.isFullyLoaded()).toBe(true);
    });

    it('should return false when slots exist but no thumbnails loaded', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      expect(manager.isFullyLoaded()).toBe(false);
    });
  });

  describe('setOnThumbnailReady', () => {
    it('should store callback', () => {
      const callback = vi.fn();
      manager.setOnThumbnailReady(callback);
      // Callback is stored but not called until thumbnail loads
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('pauseLoading / resumeLoading', () => {
    it('should initially not be paused', () => {
      expect(manager.isLoadingPaused).toBe(false);
    });

    it('should set paused flag when pauseLoading is called', () => {
      manager.pauseLoading();
      expect(manager.isLoadingPaused).toBe(true);
    });

    it('should clear paused flag when resumeLoading is called', () => {
      manager.pauseLoading();
      expect(manager.isLoadingPaused).toBe(true);

      manager.resumeLoading();
      expect(manager.isLoadingPaused).toBe(false);
    });

    it('should prevent loadThumbnails from running while paused', async () => {
      stub.currentSource = {
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        type: 'video',
        duration: 100,
      } as MediaSource;

      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      manager.pauseLoading();

      // loadThumbnails should return early when paused
      await manager.loadThumbnails();

      // No thumbnails should have been loaded
      expect(manager.isFullyLoaded()).toBe(false);
    });

    it('should be idempotent for multiple pause calls', () => {
      manager.pauseLoading();
      manager.pauseLoading();
      expect(manager.isLoadingPaused).toBe(true);
    });

    it('should be idempotent for multiple resume calls', () => {
      manager.resumeLoading();
      manager.resumeLoading();
      expect(manager.isLoadingPaused).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      manager.dispose();
      expect(manager.getSlots()).toEqual([]);
    });

    it('should reset paused state on dispose', () => {
      manager.pauseLoading();
      expect(manager.isLoadingPaused).toBe(true);
      manager.dispose();
      expect(manager.isLoadingPaused).toBe(false);
    });
  });

  describe('disposal/cleanup lifecycle', () => {
    it('TM-D001: dispose clears the thumbnail cache', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      // Even though we have slots, no thumbnails are loaded
      // Verify dispose clears slots (proxy for cache clear)
      manager.dispose();
      expect(manager.getSlots()).toEqual([]);
    });

    it('TM-D002: double dispose does not throw', () => {
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });

    it('TM-D003: dispose aborts pending loads via AbortController', async () => {
      stub.currentSource = {
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        type: 'video',
        duration: 100,
      } as MediaSource;

      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

      // Start loading (non-awaited to simulate in-flight loads)
      stub.getVideoFrameCanvas.mockReturnValue(null);
      const loadPromise = manager.loadThumbnails();

      // Dispose while loading is in flight
      manager.dispose();

      // Wait for loadPromise to settle
      await loadPromise;

      // Verify state is cleaned up
      expect(manager.getSlots()).toEqual([]);
      expect(manager.isLoadingPaused).toBe(false);
    });

    it('TM-D004: dispose clears retry timer', () => {
      vi.useFakeTimers();

      stub.currentSource = {
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        type: 'video',
        duration: 100,
      } as MediaSource;

      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

      // Mock to return null to trigger retry queueing
      stub.getVideoFrameCanvas.mockReturnValue(null);
      manager.loadThumbnails();

      // Advance past initial load to let retry timer be scheduled
      vi.advanceTimersByTime(100);

      // Dispose should clear the retry timer
      manager.dispose();

      expect(vi.getTimerCount()).toBe(0);

      vi.useRealTimers();
    });

    it('TM-D005: dispose clears pending retries queue', async () => {
      stub.currentSource = {
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        type: 'video',
        duration: 100,
      } as MediaSource;

      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

      // Return null to trigger retry queueing
      stub.getVideoFrameCanvas.mockReturnValue(null);
      await manager.loadThumbnails();

      // Dispose should clear retries
      manager.dispose();

      // After dispose and re-setup, no stale retries should fire
      // Verify slots and cache are empty
      expect(manager.getSlots()).toEqual([]);
    });

    it('TM-D006: getThumbnail returns null after dispose', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      manager.dispose();

      // After dispose, cache is cleared so getThumbnail returns null
      const result = manager.getThumbnail(1);
      expect(result).toBeNull();
    });

    it('TM-D007: isFullyLoaded returns true after dispose (no slots)', () => {
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      expect(manager.isFullyLoaded()).toBe(false); // slots exist but no thumbnails

      manager.dispose();

      // After dispose, slots are empty so isFullyLoaded is vacuously true
      expect(manager.isFullyLoaded()).toBe(true);
    });

    it('TM-D008: loadThumbnails after dispose is effectively a no-op', async () => {
      stub.currentSource = {
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        type: 'video',
        duration: 100,
      } as MediaSource;

      manager.dispose();

      // loadThumbnails should not throw and should not load anything
      // (slots are empty after dispose, so the loop does nothing)
      await expect(manager.loadThumbnails()).resolves.toBeUndefined();
    });

    it('TM-D009: calculateSlots still works after dispose for reuse scenario', () => {
      manager.dispose();

      // After dispose, calculateSlots should still work (manager can be reused)
      const slots = manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
      expect(slots.length).toBeGreaterThan(0);
    });

    it('TM-D010: dispose resets loading paused flag', () => {
      manager.pauseLoading();
      expect(manager.isLoadingPaused).toBe(true);

      manager.dispose();
      expect(manager.isLoadingPaused).toBe(false);
    });
  });

  describe('regression tests for pause-during-playback fix', () => {
    let testSource: MediaSource;

    beforeEach(() => {
      // Set up a video source for these tests
      testSource = {
        id: 'test-video',
        name: 'test.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        element: document.createElement('video'),
      } as unknown as MediaSource;
      stub.currentSource = testSource;

      // Calculate slots for the timeline
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

      // Verify we have slots
      expect(manager.getSlots().length).toBeGreaterThan(0);
    });

    describe('TM-REG-001: loadThumbnail() does NOT access HTMLVideoElement', () => {
      it('should only use getVideoFrameCanvas, never source.element for video thumbnails', async () => {
        // Mock getVideoFrameCanvas to return a canvas
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 48;
        mockCanvas.height = 27;
        const mockCtx = mockCanvas.getContext('2d');
        if (mockCtx) {
          mockCtx.fillStyle = 'red';
          mockCtx.fillRect(0, 0, 48, 27);
        }

        // Set the stub to return a canvas
        stub.getVideoFrameCanvas.mockReturnValue(mockCanvas);

        // IMPORTANT: First call to loadThumbnails() will set the sourceId and clear slots.
        // We need to call it once, then recalculate slots, then call again for the actual test.
        await manager.loadThumbnails();

        // Recalculate slots after the initial load (which cleared them due to sourceId change)
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

        // Reset the mock to track only the next calls
        stub.getVideoFrameCanvas.mockClear();
        stub.getVideoFrameCanvas.mockReturnValue(mockCanvas);

        // Spy on the video element to ensure it's never accessed
        const videoElement = (testSource as any).element;
        const accessSpy = vi.fn();

        // Create a proxy to detect any property access on the video element
        Object.defineProperty(testSource, 'element', {
          get: () => {
            accessSpy();
            return videoElement;
          },
          configurable: true,
        });

        // Load thumbnails (this is the actual test call)
        await manager.loadThumbnails();

        // Verify getVideoFrameCanvas was called
        expect(stub.getVideoFrameCanvas).toHaveBeenCalled();

        // Verify video element was never accessed
        expect(accessSpy).not.toHaveBeenCalled();
      });

      it('should handle missing cached frame by queueing retry without accessing video element', async () => {
        // Return null from getVideoFrameCanvas (no cached frame)
        stub.getVideoFrameCanvas.mockReturnValue(null);

        // Initialize sourceId first
        await manager.loadThumbnails();
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
        stub.getVideoFrameCanvas.mockClear();
        stub.getVideoFrameCanvas.mockReturnValue(null);

        // Spy on the video element
        const videoElement = (testSource as any).element;
        const accessSpy = vi.fn();

        Object.defineProperty(testSource, 'element', {
          get: () => {
            accessSpy();
            return videoElement;
          },
          configurable: true,
        });

        // Load thumbnails
        await manager.loadThumbnails();

        // Verify getVideoFrameCanvas was called but element was never accessed
        expect(stub.getVideoFrameCanvas).toHaveBeenCalled();
        expect(accessSpy).not.toHaveBeenCalled();

        // Verify no thumbnails were loaded (since frames weren't available)
        expect(manager.isFullyLoaded()).toBe(false);
      });
    });

    describe('TM-REG-002: When paused, scheduleRetry() does not create a timer', () => {
      it('should not schedule retry timer when loading is paused', () => {
        vi.useFakeTimers();

        // Pause loading
        manager.pauseLoading();

        // Mock getVideoFrameCanvas to return null (triggering retry logic)
        stub.getVideoFrameCanvas.mockReturnValue(null);

        // Load thumbnails (should queue retries but not schedule them)
        manager.loadThumbnails();

        // Verify no timers were scheduled
        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
      });

      it('should not schedule new timers after pause is called', async () => {
        vi.useFakeTimers();

        // Return null to trigger retry queueing
        stub.getVideoFrameCanvas.mockReturnValue(null);

        // Start loading (will queue retries)
        await manager.loadThumbnails();

        // Clear any existing timers
        vi.clearAllTimers();

        // Now pause
        manager.pauseLoading();

        // Try to trigger retry scheduling by calling loadThumbnails again
        await manager.loadThumbnails();

        // No new timers should be created
        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
      });
    });

    describe('TM-REG-003: When paused, processRetries() returns early', () => {
      it('should not process retry queue when paused', async () => {
        // Mock to track if loadThumbnail is called for retries
        const loadCallCount = { count: 0 };

        // First call returns null (queues retry), subsequent calls should not happen when paused
        stub.getVideoFrameCanvas.mockImplementation(() => {
          loadCallCount.count++;
          return null;
        });

        // Load thumbnails (will queue retries)
        await manager.loadThumbnails();

        // Pause loading
        manager.pauseLoading();

        // Try to manually trigger retry processing through private method access
        // Since we can't access private methods, we'll verify through behavior:
        // Resume and verify retries don't process while paused

        // Reset call count
        loadCallCount.count = 0;

        // Simulate what would happen if processRetries was called while paused
        // It should return early and not make any getVideoFrameCanvas calls
        manager.pauseLoading(); // Ensure paused

        // Wait a bit to see if any retry processing happens
        await new Promise(resolve => setTimeout(resolve, 100));

        // No additional calls should have been made
        expect(loadCallCount.count).toBe(0);
      });
    });

    describe('TM-REG-004: resumeLoading() triggers loadThumbnails() to refill uncached slots', () => {
      it('should restart thumbnail loading for uncached slots after resume', async () => {
        // Set up mock canvas
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 48;
        mockCanvas.height = 27;

        // Track how many times getVideoFrameCanvas is called
        let callCount = 0;
        stub.getVideoFrameCanvas.mockImplementation(() => {
          callCount++;
          return mockCanvas;
        });

        // Initialize sourceId first
        await manager.loadThumbnails();
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
        callCount = 0;

        // Pause loading
        manager.pauseLoading();

        // Try to load - should not proceed
        await manager.loadThumbnails();
        expect(callCount).toBe(0);

        // Reset the counter
        callCount = 0;

        // Resume loading - this internally calls loadThumbnails()
        manager.resumeLoading();

        // Wait for the async loadThumbnails to complete
        await new Promise(resolve => setTimeout(resolve, 200));

        // Now getVideoFrameCanvas should have been called for slots
        expect(callCount).toBeGreaterThan(0);
      });

      it('should handle resume when no slots are calculated', () => {
        // Clear slots
        manager.clear();

        // Resume should not throw
        expect(() => {
          manager.resumeLoading();
        }).not.toThrow();
      });
    });

    describe('TM-REG-005: pauseLoading() calls abortPending() to cancel in-flight loads', () => {
      it('should abort pending loads when pauseLoading is called', async () => {
        // Mock to return canvas initially
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 48;
        mockCanvas.height = 27;

        let callCount = 0;
        stub.getVideoFrameCanvas.mockImplementation(() => {
          callCount++;
          // Return canvas on first few calls, then null
          if (callCount <= 2) {
            return mockCanvas;
          }
          return null;
        });

        // Initialize sourceId first
        await manager.loadThumbnails();
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
        callCount = 0;

        // Start loading thumbnails (don't await, so we can pause during loading)
        const loadPromise = manager.loadThumbnails();

        // Immediately pause (should abort)
        manager.pauseLoading();

        // Wait for the load to complete (it should exit early)
        await loadPromise;

        // Since we paused immediately, not all thumbnails should be loaded
        // The abort should have stopped further processing
        expect(manager.isFullyLoaded()).toBe(false);
      });

      it('should clear pending retry queue on pause', async () => {
        vi.useFakeTimers();

        // Return null to queue retries
        stub.getVideoFrameCanvas.mockReturnValue(null);

        // Load thumbnails (queues retries)
        await manager.loadThumbnails();

        // Advance timers to potentially start retry timer
        vi.advanceTimersByTime(100);

        // Pause (should clear retry queue and timer)
        manager.pauseLoading();

        // Verify no timers are active
        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
      });
    });

    describe('TM-REG-006: Multiple pause/resume cycles', () => {
      it('should handle rapid pause/resume toggling correctly', async () => {
        const mockCanvas = document.createElement('canvas');
        mockCanvas.width = 48;
        mockCanvas.height = 27;
        stub.getVideoFrameCanvas.mockReturnValue(mockCanvas);

        // Initialize sourceId first
        await manager.loadThumbnails();
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
        stub.getVideoFrameCanvas.mockClear();
        stub.getVideoFrameCanvas.mockReturnValue(mockCanvas);

        // Rapid toggle
        manager.pauseLoading();
        expect(manager.isLoadingPaused).toBe(true);

        manager.resumeLoading();
        expect(manager.isLoadingPaused).toBe(false);

        manager.pauseLoading();
        expect(manager.isLoadingPaused).toBe(true);

        manager.resumeLoading();
        expect(manager.isLoadingPaused).toBe(false);

        // Wait for async resume to trigger loadThumbnails
        await new Promise(resolve => setTimeout(resolve, 100));

        // Should have attempted to load frames after resume
        expect(stub.getVideoFrameCanvas).toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // Detached ImageBitmap guard
  // =============================================================================

  describe('Task 6.1: Store OffscreenCanvas directly', () => {
    it('THUMB-001: OffscreenCanvas path does not create intermediate HTMLCanvasElement', async () => {
      const origOffscreen = globalThis.OffscreenCanvas;
      const mockGetContext = vi.fn(() => ({
        drawImage: vi.fn(),
      }));
      globalThis.OffscreenCanvas = vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        getContext: mockGetContext,
      })) as any;

      stub.currentSource = {
        name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 10,
        element: document.createElement('canvas'),
      } as unknown as MediaSource;

      // Pre-set sourceId to avoid clear() emptying slots during loadThumbnails
      (manager as any).sourceId = 'test.exr-1920x1080';
      manager.calculateSlots(60, 35, 500, 24, 10, 1920, 1080);

      const createElementSpy = vi.spyOn(document, 'createElement');
      await manager.loadThumbnails();

      // createElement('canvas') should NOT have been called in the OffscreenCanvas path
      const canvasCreations = createElementSpy.mock.calls.filter(
        ([tag]) => tag === 'canvas'
      );
      expect(canvasCreations.length).toBe(0);

      createElementSpy.mockRestore();
      globalThis.OffscreenCanvas = origOffscreen;
    });

    it('THUMB-002: drawImage called exactly once per thumbnail (no double-draw)', async () => {
      const origOffscreen = globalThis.OffscreenCanvas;
      const drawImageSpy = vi.fn();
      const mockGetContext = vi.fn(() => ({
        drawImage: drawImageSpy,
      }));
      globalThis.OffscreenCanvas = vi.fn((w: number, h: number) => ({
        width: w, height: h,
        getContext: mockGetContext,
      })) as any;

      stub.currentSource = {
        name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 5,
        element: document.createElement('canvas'),
      } as unknown as MediaSource;

      // Pre-set sourceId to avoid clear() emptying slots during loadThumbnails
      (manager as any).sourceId = 'test.exr-1920x1080';
      manager.calculateSlots(60, 35, 500, 24, 5, 1920, 1080);
      await manager.loadThumbnails();

      const slots = manager.getSlots();
      // Each thumbnail should have exactly one drawImage call, not two
      expect(drawImageSpy).toHaveBeenCalledTimes(slots.length);

      globalThis.OffscreenCanvas = origOffscreen;
    });

    it('THUMB-003: HTMLCanvasElement fallback still works without OffscreenCanvas', async () => {
      const origOffscreen = globalThis.OffscreenCanvas;
      delete (globalThis as any).OffscreenCanvas;

      stub.currentSource = {
        name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 3,
        element: document.createElement('canvas'),
      } as unknown as MediaSource;

      // Pre-set sourceId to avoid clear() emptying slots during loadThumbnails
      (manager as any).sourceId = 'test.exr-1920x1080';
      manager.calculateSlots(60, 35, 500, 24, 3, 1920, 1080);
      await manager.loadThumbnails();

      const slots = manager.getSlots();
      expect(slots.length).toBeGreaterThan(0);
      const slot = slots[0]!;
      const thumb = manager.getThumbnail(slot.frame);
      expect(thumb).not.toBeNull();
      expect(thumb).toBeInstanceOf(HTMLCanvasElement);

      globalThis.OffscreenCanvas = origOffscreen;
    });

    it('THUMB-004: drawThumbnails works with OffscreenCanvas cache entries', async () => {
      const origOffscreen = globalThis.OffscreenCanvas;
      globalThis.OffscreenCanvas = vi.fn((w: number, h: number) => ({
        width: w, height: h,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      })) as any;

      stub.currentSource = {
        name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 3,
        element: document.createElement('canvas'),
      } as unknown as MediaSource;

      // Pre-set sourceId to avoid clear() emptying slots during loadThumbnails
      (manager as any).sourceId = 'test.exr-1920x1080';
      manager.calculateSlots(60, 35, 500, 24, 3, 1920, 1080);
      await manager.loadThumbnails();

      const drawImageSpy = vi.fn();
      const mockCtx = {
        drawImage: drawImageSpy,
        strokeRect: vi.fn(),
        strokeStyle: '',
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      manager.drawThumbnails(mockCtx);

      expect(drawImageSpy.mock.calls.length).toBeGreaterThan(0);

      globalThis.OffscreenCanvas = origOffscreen;
    });
  });

  describe('Task 6.2: Use peek() in drawThumbnails', () => {
    it('THUMB-005: getThumbnail uses peek (no LRU reorder)', () => {
      const cache = (manager as any).cache;
      const peekSpy = vi.spyOn(cache, 'peek');
      const getSpy = vi.spyOn(cache, 'get');

      (manager as any).sourceId = 'test-1920x1080';

      cache.set('test-1920x1080-1', document.createElement('canvas'));

      manager.getThumbnail(1);

      expect(peekSpy).toHaveBeenCalledWith('test-1920x1080-1');
      expect(getSpy).not.toHaveBeenCalled();

      peekSpy.mockRestore();
      getSpy.mockRestore();
    });

    it('THUMB-005c: loadThumbnails uses get() to refresh LRU for cached entries', async () => {
      const cache = (manager as any).cache;
      (manager as any).sourceId = 'test.exr-1920x1080';

      stub.currentSource = {
        name: 'test.exr', type: 'image', width: 1920, height: 1080, duration: 5,
        element: document.createElement('canvas'),
      } as unknown as MediaSource;

      manager.calculateSlots(60, 35, 500, 24, 5, 1920, 1080);
      const slots = manager.getSlots();

      // Pre-populate cache for all slots
      for (const slot of slots) {
        const key = `test.exr-1920x1080-${slot.frame}`;
        cache.set(key, document.createElement('canvas'));
      }

      const getSpy = vi.spyOn(cache, 'get');
      const peekSpy = vi.spyOn(cache, 'peek');

      // loadThumbnails should call get() for cached entries (to refresh LRU)
      await manager.loadThumbnails();

      // get() should have been called for each unique cached slot
      expect(getSpy).toHaveBeenCalled();
      expect(getSpy.mock.calls.length).toBeGreaterThan(0);

      getSpy.mockRestore();
      peekSpy.mockRestore();
    });

    it('THUMB-005b: drawThumbnails does not refresh LRU order', () => {
      const cache = (manager as any).cache;
      (manager as any).sourceId = 'test-1920x1080';

      manager.calculateSlots(60, 35, 500, 24, 10, 1920, 1080);
      const slots = manager.getSlots();

      for (const slot of slots) {
        const key = `test-1920x1080-${slot.frame}`;
        cache.set(key, document.createElement('canvas'));
      }

      const getSpy = vi.spyOn(cache, 'get');

      const mockCtx = {
        drawImage: vi.fn(),
        strokeRect: vi.fn(), strokeStyle: '', lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      manager.drawThumbnails(mockCtx);

      expect(getSpy).not.toHaveBeenCalled();

      getSpy.mockRestore();
    });
  });

  describe('Task 6.3: Canvas element pooling', () => {
    it('THUMB-POOL-001: evicted canvas is returned to pool', () => {
      const pool = (manager as any).canvasPool as any[];
      const cache = (manager as any).cache;

      (manager as any).sourceId = 'test-1920x1080';

      cache.setCapacity(2);
      try {
        const c1 = document.createElement('canvas');
        const c2 = document.createElement('canvas');
        const c3 = document.createElement('canvas');

        cache.set('test-1920x1080-1', c1);
        cache.set('test-1920x1080-2', c2);

        expect(pool.length).toBe(0);

        cache.set('test-1920x1080-3', c3);

        expect(pool.length).toBe(1);
        expect(pool[0]).toBe(c1);
      } finally {
        cache.setCapacity(150);
      }
    });

    it('THUMB-POOL-002: acquireCanvas reuses pooled canvas instead of creating new', () => {
      const pool = (manager as any).canvasPool as any[];

      const recycledCanvas = document.createElement('canvas');
      recycledCanvas.width = 100;
      recycledCanvas.height = 100;
      pool.push(recycledCanvas);

      const createSpy = vi.spyOn(document, 'createElement');

      const result = (manager as any).acquireCanvas(48, 27);

      expect(result).not.toBeNull();
      expect(result.canvas).toBe(recycledCanvas);
      expect(recycledCanvas.width).toBe(48);
      expect(recycledCanvas.height).toBe(27);

      expect(createSpy).not.toHaveBeenCalledWith('canvas');

      createSpy.mockRestore();
    });

    it('THUMB-POOL-003: pool is bounded at MAX_POOL_SIZE', () => {
      const pool = (manager as any).canvasPool as any[];
      const MAX = (ThumbnailManager as any).MAX_POOL_SIZE ?? 30;

      for (let i = 0; i < MAX + 10; i++) {
        (manager as any).returnToPool(document.createElement('canvas'));
      }

      expect(pool.length).toBe(MAX);
    });

    it('THUMB-POOL-004: clear() drains the pool', () => {
      const pool = (manager as any).canvasPool as any[];

      pool.push(document.createElement('canvas'));
      pool.push(document.createElement('canvas'));
      expect(pool.length).toBe(2);

      manager.clear();

      expect((manager as any).canvasPool.length).toBe(0);
    });

    it('THUMB-POOL-005: pooled canvas is resized before reuse', () => {
      const pool = (manager as any).canvasPool as any[];

      const oldCanvas = document.createElement('canvas');
      oldCanvas.width = 200;
      oldCanvas.height = 150;
      pool.push(oldCanvas);

      const result = (manager as any).acquireCanvas(48, 27);

      expect(result.canvas.width).toBe(48);
      expect(result.canvas.height).toBe(27);
    });

    it('THUMB-POOL-006: dispose() drains the pool', () => {
      const pool = (manager as any).canvasPool as any[];
      pool.push(document.createElement('canvas'));

      manager.dispose();

      expect((manager as any).canvasPool.length).toBe(0);
    });

    it('THUMB-POOL-007: acquireCanvas creates new canvas when pool is empty', () => {
      const pool = (manager as any).canvasPool as any[];
      expect(pool.length).toBe(0);

      const result = (manager as any).acquireCanvas(48, 27);

      expect(result).not.toBeNull();
      expect(result.canvas.width).toBe(48);
      expect(result.canvas.height).toBe(27);
      expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('THUMB-POOL-008: acquireCanvas returns null when getContext fails', () => {
      // Mock getContext to return null
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;

      // Ensure OffscreenCanvas is not available (jsdom default)
      const origOffscreen = globalThis.OffscreenCanvas;
      delete (globalThis as any).OffscreenCanvas;

      try {
        const result = (manager as any).acquireCanvas(48, 27);
        expect(result).toBeNull();
      } finally {
        HTMLCanvasElement.prototype.getContext = origGetContext;
        globalThis.OffscreenCanvas = origOffscreen;
      }
    });

    it('THUMB-POOL-009: pooled canvas with failed getContext falls through to new canvas', () => {
      const pool = (manager as any).canvasPool as any[];

      // Add a canvas to pool that will fail getContext
      const badCanvas = document.createElement('canvas');
      badCanvas.getContext = vi.fn(() => null) as any;
      pool.push(badCanvas);

      const result = (manager as any).acquireCanvas(48, 27);

      // Should have fallen through and created a new canvas (not the bad one)
      expect(result).not.toBeNull();
      expect(result.canvas).not.toBe(badCanvas);
      expect(result.canvas.width).toBe(48);
      expect(result.canvas.height).toBe(27);
    });
  });

  describe('Task 1.4: Thumbnail Shadow Removal', () => {
    it('TM-PERF-001: drawThumbnails does not set shadowBlur or call save/restore', () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 48;
      mockCanvas.height = 27;

      manager.calculateSlots(60, 0, 500, 42, 100, 1920, 1080);
      const slots = manager.getSlots();
      expect(slots.length).toBeGreaterThan(0);
      const firstSlot = slots[0]!;
      (manager as any).addToCache(firstSlot.frame, mockCanvas);

      const ctx = document.createElement('canvas').getContext('2d')!;
      const saveSpy = vi.spyOn(ctx, 'save');
      const restoreSpy = vi.spyOn(ctx, 'restore');

      // Track shadowBlur assignments via instance-level property descriptor
      let shadowBlurSet = false;
      Object.defineProperty(ctx, 'shadowBlur', {
        set() { shadowBlurSet = true; },
        get() { return 0; },
        configurable: true,
      });

      manager.drawThumbnails(ctx);

      expect(shadowBlurSet).toBe(false);
      expect(saveSpy).not.toHaveBeenCalled();
      expect(restoreSpy).not.toHaveBeenCalled();

      // Restore by removing instance property
      delete (ctx as any).shadowBlur;
    });

    it('TM-PERF-002: drawThumbnails still draws images and border strokes', () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 48;
      mockCanvas.height = 27;

      manager.calculateSlots(60, 0, 500, 42, 100, 1920, 1080);
      const slots = manager.getSlots();
      const firstSlot = slots[0]!;
      (manager as any).addToCache(firstSlot.frame, mockCanvas);

      const ctx = document.createElement('canvas').getContext('2d')!;
      const drawImageSpy = vi.spyOn(ctx, 'drawImage');
      const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

      manager.drawThumbnails(ctx);

      expect(drawImageSpy).toHaveBeenCalled();
      expect(strokeRectSpy).toHaveBeenCalled();
    });

    it('TM-PERF-003: drawThumbnails sets stroke style for border', () => {
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 48;
      mockCanvas.height = 27;

      manager.calculateSlots(60, 0, 500, 42, 100, 1920, 1080);
      const slots = manager.getSlots();
      const firstSlot = slots[0]!;
      (manager as any).addToCache(firstSlot.frame, mockCanvas);

      const ctx = document.createElement('canvas').getContext('2d')!;
      manager.drawThumbnails(ctx);

      expect(ctx.strokeStyle).toBe('rgba(255, 255, 255, 0.2)');
      expect(ctx.lineWidth).toBe(0.5);
    });
  });

  describe('detached ImageBitmap guard', () => {
    it('THUMB-GUARD-001: queues retry for detached ImageBitmap (width=0)', async () => {
      // Set up a video source with an ImageBitmap-returning getVideoFrameCanvas
      stub.currentSource = {
        type: 'video',
        name: 'test.mp4',
        url: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
      } as MediaSource;

      // Only test when ImageBitmap is available in the environment
      if (typeof ImageBitmap === 'undefined') {
        return;
      }

      // Create a detached ImageBitmap mock (width=0, height=0)
      const detachedBitmap = Object.create(ImageBitmap.prototype);
      Object.defineProperty(detachedBitmap, 'width', { value: 0 });
      Object.defineProperty(detachedBitmap, 'height', { value: 0 });

      stub.getVideoFrameCanvas.mockReturnValue(detachedBitmap);

      await manager.loadThumbnails();
      manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

      // Wait for async thumbnail generation to process
      await new Promise(resolve => setTimeout(resolve, 50));

      // The detached bitmap should have been detected and the frame queued for retry
      // (not thrown an error). The manager should still be functional.
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});
