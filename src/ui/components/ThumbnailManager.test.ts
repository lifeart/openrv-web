import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThumbnailManager } from './ThumbnailManager';
import { Session } from '../../core/session/Session';

// Mock Session
vi.mock('../../core/session/Session', () => ({
  Session: vi.fn().mockImplementation(() => ({
    currentSource: null,
    getSequenceFrameImage: vi.fn(),
    getVideoFrameCanvas: vi.fn(),
  })),
}));

describe('ThumbnailManager', () => {
  let manager: ThumbnailManager;
  let mockSession: Session;

  beforeEach(() => {
    mockSession = new Session() as unknown as Session;
    manager = new ThumbnailManager(mockSession);
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
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
      (mockSession as any).currentSource = {
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        type: 'video',
        duration: 100,
      };

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

  describe('regression tests for pause-during-playback fix', () => {
    let testSource: any;

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
      };
      (mockSession as any).currentSource = testSource;

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

        // Recreate the mock function with implementation
        const getVideoFrameCanvasMock = vi.fn().mockReturnValue(mockCanvas);
        mockSession.getVideoFrameCanvas = getVideoFrameCanvasMock;

        // IMPORTANT: First call to loadThumbnails() will set the sourceId and clear slots.
        // We need to call it once, then recalculate slots, then call again for the actual test.
        await manager.loadThumbnails();

        // Recalculate slots after the initial load (which cleared them due to sourceId change)
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);

        // Reset the mock to track only the next calls
        getVideoFrameCanvasMock.mockClear();

        // Spy on the video element to ensure it's never accessed
        const videoElement = testSource.element;
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
        expect(getVideoFrameCanvasMock).toHaveBeenCalled();

        // Verify video element was never accessed
        expect(accessSpy).not.toHaveBeenCalled();
      });

      it('should handle missing cached frame by queueing retry without accessing video element', async () => {
        // Return null from getVideoFrameCanvas (no cached frame)
        const getVideoFrameCanvasMock = vi.fn().mockReturnValue(null);
        mockSession.getVideoFrameCanvas = getVideoFrameCanvasMock;

        // Initialize sourceId first
        await manager.loadThumbnails();
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
        getVideoFrameCanvasMock.mockClear();

        // Spy on the video element
        const videoElement = testSource.element;
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
        expect(getVideoFrameCanvasMock).toHaveBeenCalled();
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
        vi.mocked(mockSession.getVideoFrameCanvas).mockReturnValue(null);

        // Load thumbnails (should queue retries but not schedule them)
        manager.loadThumbnails();

        // Verify no timers were scheduled
        expect(vi.getTimerCount()).toBe(0);

        vi.useRealTimers();
      });

      it('should not schedule new timers after pause is called', async () => {
        vi.useFakeTimers();

        // Return null to trigger retry queueing
        vi.mocked(mockSession.getVideoFrameCanvas).mockReturnValue(null);

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
        const originalGetCanvas = mockSession.getVideoFrameCanvas;

        // First call returns null (queues retry), subsequent calls should not happen when paused
        vi.mocked(mockSession.getVideoFrameCanvas).mockImplementation(() => {
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

        // Restore
        vi.mocked(mockSession.getVideoFrameCanvas).mockImplementation(originalGetCanvas);
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
        const getVideoFrameCanvasMock = vi.fn().mockImplementation(() => {
          callCount++;
          return mockCanvas;
        });
        mockSession.getVideoFrameCanvas = getVideoFrameCanvasMock;

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
        const getVideoFrameCanvasMock = vi.fn().mockImplementation(() => {
          callCount++;
          // Return canvas on first few calls, then null
          if (callCount <= 2) {
            return mockCanvas;
          }
          return null;
        });
        mockSession.getVideoFrameCanvas = getVideoFrameCanvasMock;

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
        const getVideoFrameCanvasMock = vi.fn().mockReturnValue(null);
        mockSession.getVideoFrameCanvas = getVideoFrameCanvasMock;

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
        const getVideoFrameCanvasMock = vi.fn().mockReturnValue(mockCanvas);
        mockSession.getVideoFrameCanvas = getVideoFrameCanvasMock;

        // Initialize sourceId first
        await manager.loadThumbnails();
        manager.calculateSlots(60, 35, 500, 24, 100, 1920, 1080);
        getVideoFrameCanvasMock.mockClear();

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
        expect(getVideoFrameCanvasMock).toHaveBeenCalled();
      });
    });
  });
});
