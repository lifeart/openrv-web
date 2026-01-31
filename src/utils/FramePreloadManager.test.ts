import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  FramePreloadManager,
  PreloadConfig,
  DEFAULT_PRELOAD_CONFIG,
} from './FramePreloadManager';

interface TestFrame {
  frame: number;
  data: string;
}

describe('FramePreloadManager', () => {
  let loader: Mock<[frame: number], Promise<TestFrame>>;
  let disposer: Mock<[frame: number, data: TestFrame], void>;

  beforeEach(() => {
    loader = vi.fn((frame: number) => Promise.resolve({ frame, data: `frame-${frame}` }));
    disposer = vi.fn();
  });

  describe('constructor', () => {
    it('FPM-001: initializes with default config', () => {
      const manager = new FramePreloadManager(100, loader);
      const stats = manager.getStats();

      expect(stats.cacheSize).toBe(0);
      expect(stats.pendingRequests).toBe(0);
      expect(stats.activeRequests).toBe(0);
    });

    it('FPM-002: accepts custom config', () => {
      const customConfig: Partial<PreloadConfig> = {
        maxCacheSize: 50,
        preloadAhead: 10,
      };

      const manager = new FramePreloadManager(100, loader, disposer, customConfig);
      expect(manager).toBeDefined();
    });
  });

  describe('getFrame', () => {
    it('FPM-003: loads frame when not in cache', async () => {
      const manager = new FramePreloadManager(100, loader);

      const result = await manager.getFrame(5);

      expect(result).toEqual({ frame: 5, data: 'frame-5' });
      // Loader now receives frame number and optional AbortSignal
      expect(loader).toHaveBeenCalledWith(5, expect.any(AbortSignal));
    });

    it('FPM-004: returns cached frame without loading', async () => {
      const manager = new FramePreloadManager(100, loader);

      // First load
      await manager.getFrame(5);
      loader.mockClear();

      // Second load should use cache
      const result = await manager.getFrame(5);

      expect(result).toEqual({ frame: 5, data: 'frame-5' });
      expect(loader).not.toHaveBeenCalled();
    });

    it('FPM-005: returns null for out of range frames', async () => {
      const manager = new FramePreloadManager(100, loader);

      expect(await manager.getFrame(0)).toBeNull();
      expect(await manager.getFrame(101)).toBeNull();
      expect(await manager.getFrame(-1)).toBeNull();
    });

    it('FPM-006: handles loader errors gracefully', async () => {
      loader.mockRejectedValueOnce(new Error('Load failed'));
      const manager = new FramePreloadManager(100, loader);

      const result = await manager.getFrame(5);

      expect(result).toBeNull();
    });
  });

  describe('hasFrame', () => {
    it('FPM-007: returns false for uncached frames', () => {
      const manager = new FramePreloadManager(100, loader);

      expect(manager.hasFrame(5)).toBe(false);
    });

    it('FPM-008: returns true for cached frames', async () => {
      const manager = new FramePreloadManager(100, loader);
      await manager.getFrame(5);

      expect(manager.hasFrame(5)).toBe(true);
    });
  });

  describe('getCachedFrame', () => {
    it('FPM-009: returns null for uncached frames', () => {
      const manager = new FramePreloadManager(100, loader);

      expect(manager.getCachedFrame(5)).toBeNull();
    });

    it('FPM-010: returns cached frame without triggering load', async () => {
      const manager = new FramePreloadManager(100, loader);
      await manager.getFrame(5);
      loader.mockClear();

      const result = manager.getCachedFrame(5);

      expect(result).toEqual({ frame: 5, data: 'frame-5' });
      expect(loader).not.toHaveBeenCalled();
    });
  });

  describe('setPlaybackState', () => {
    it('FPM-011: sets playback state for forward playback', () => {
      const manager = new FramePreloadManager(100, loader);

      manager.setPlaybackState(true, 1);
      // State is internal, test through preloadAround behavior
      expect(manager).toBeDefined();
    });

    it('FPM-012: sets playback state for reverse playback', () => {
      const manager = new FramePreloadManager(100, loader);

      manager.setPlaybackState(true, -1);
      expect(manager).toBeDefined();
    });
  });

  describe('preloadAround', () => {
    it('FPM-013: preloads frames around center during scrubbing', async () => {
      const config: Partial<PreloadConfig> = {
        scrubWindow: 3,
        maxConcurrent: 10,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      manager.preloadAround(50);

      // Wait for preloads to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have preloaded 3 frames in each direction
      expect(manager.hasFrame(49)).toBe(true);
      expect(manager.hasFrame(51)).toBe(true);
    });

    it('FPM-014: preloads more ahead during forward playback', async () => {
      const config: Partial<PreloadConfig> = {
        preloadAhead: 5,
        preloadBehind: 2,
        maxConcurrent: 10,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      manager.setPlaybackState(true, 1);
      manager.preloadAround(50);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have more frames ahead
      expect(manager.hasFrame(51)).toBe(true);
      expect(manager.hasFrame(55)).toBe(true);
    });

    it('FPM-015: respects frame bounds', async () => {
      const config: Partial<PreloadConfig> = {
        scrubWindow: 10,
        maxConcurrent: 10,
      };
      const manager = new FramePreloadManager(10, loader, disposer, config);

      manager.preloadAround(1);

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not try to load frame 0 or negative
      expect(loader).not.toHaveBeenCalledWith(0);
      expect(loader).not.toHaveBeenCalledWith(-1);
    });

    it('FPM-016: skips already cached frames', async () => {
      const config: Partial<PreloadConfig> = {
        scrubWindow: 3,
        maxConcurrent: 10,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Pre-cache frame 51
      await manager.getFrame(51);
      loader.mockClear();

      manager.preloadAround(50);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not reload frame 51
      expect(loader).not.toHaveBeenCalledWith(51);
    });
  });

  describe('cache management', () => {
    it('FPM-017: enforces max cache size', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Load more than max cache size
      for (let i = 1; i <= 10; i++) {
        await manager.getFrame(i);
      }

      const stats = manager.getStats();
      expect(stats.cacheSize).toBeLessThanOrEqual(5);
    });

    it('FPM-018: calls disposer when evicting frames', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Fill cache beyond maxCacheSize to trigger eviction
      for (let i = 1; i <= 7; i++) {
        await manager.getFrame(i);
      }

      // Disposer should have been called for evicted frames
      expect(disposer).toHaveBeenCalled();
    });

    it('FPM-019: evicts LRU frames first', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Load frames 1, 2, 3, 4, 5
      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);
      await manager.getFrame(4);
      await manager.getFrame(5);

      // Access frame 1 again to make it recently used
      await manager.getFrame(1);

      // Load frame 6, should evict frame 2 (least recently used)
      await manager.getFrame(6);

      expect(manager.hasFrame(1)).toBe(true); // Recently accessed
      expect(manager.hasFrame(2)).toBe(false); // LRU, evicted
      expect(manager.hasFrame(3)).toBe(true);
      expect(manager.hasFrame(4)).toBe(true);
      expect(manager.hasFrame(5)).toBe(true);
      expect(manager.hasFrame(6)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('FPM-020: returns accurate statistics', async () => {
      const manager = new FramePreloadManager(100, loader);

      await manager.getFrame(1);
      await manager.getFrame(2);

      const stats = manager.getStats();

      expect(stats.cacheSize).toBe(2);
      expect(stats.pendingRequests).toBe(0);
      expect(stats.activeRequests).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('FPM-021: updates configuration', () => {
      const manager = new FramePreloadManager(100, loader);

      manager.updateConfig({ maxCacheSize: 200 });

      // Config is internal, test indirectly through behavior
      expect(manager).toBeDefined();
    });
  });

  describe('clear', () => {
    it('FPM-022: clears all cached frames', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);

      manager.clear();

      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.pendingRequests).toBe(0);
    });

    it('FPM-023: calls disposer for all frames when clearing', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);

      manager.clear();

      expect(disposer).toHaveBeenCalledTimes(3);
    });
  });

  describe('dispose', () => {
    it('FPM-024: cleans up all resources', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      await manager.getFrame(1);
      await manager.getFrame(2);

      manager.dispose();

      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('concurrent loading', () => {
    it('FPM-025: respects max concurrent requests', async () => {
      let activeCount = 0;
      let maxActive = 0;

      const slowLoader = vi.fn(async (frame: number) => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await new Promise(resolve => setTimeout(resolve, 20));
        activeCount--;
        return { frame, data: `frame-${frame}` };
      });

      const config: Partial<PreloadConfig> = {
        scrubWindow: 10,
        maxConcurrent: 3,
      };
      const manager = new FramePreloadManager<TestFrame>(100, slowLoader, disposer, config);

      manager.preloadAround(50);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(maxActive).toBeLessThanOrEqual(3);
    });

    it('FPM-026: reuses pending request when same frame requested', async () => {
      let loadCount = 0;
      const slowLoader = vi.fn(async (frame: number) => {
        loadCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return { frame, data: `frame-${frame}` };
      });

      const manager = new FramePreloadManager<TestFrame>(100, slowLoader);

      // Request same frame twice concurrently
      const promise1 = manager.getFrame(5);
      const promise2 = manager.getFrame(5);

      await Promise.all([promise1, promise2]);

      // Should only load once
      expect(loadCount).toBe(1);
    });
  });

  describe('DEFAULT_PRELOAD_CONFIG', () => {
    it('FPM-027: has sensible defaults', () => {
      expect(DEFAULT_PRELOAD_CONFIG.maxCacheSize).toBeGreaterThan(0);
      expect(DEFAULT_PRELOAD_CONFIG.preloadAhead).toBeGreaterThan(0);
      expect(DEFAULT_PRELOAD_CONFIG.preloadBehind).toBeGreaterThan(0);
      expect(DEFAULT_PRELOAD_CONFIG.scrubWindow).toBeGreaterThan(0);
      expect(DEFAULT_PRELOAD_CONFIG.maxConcurrent).toBeGreaterThan(0);
    });

    // REGRESSION TEST: Ensure config values don't accidentally change
    // These values were incorrectly overridden in VideoSourceNode causing
    // 70-frame videos to only cache 60 frames instead of all frames
    it('FPM-047: maxCacheSize must be at least 100 to cache typical short videos', () => {
      // Videos up to 100 frames should be fully cacheable
      // This was broken when VideoSourceNode hardcoded maxCacheSize: 60
      expect(DEFAULT_PRELOAD_CONFIG.maxCacheSize).toBeGreaterThanOrEqual(100);
    });

    it('FPM-048: preloadAhead must be at least 20 for smooth playback', () => {
      // At 24fps, 20 frames = ~0.8s buffer which is minimum for smooth playback
      // This was broken when VideoSourceNode hardcoded preloadAhead: 15
      expect(DEFAULT_PRELOAD_CONFIG.preloadAhead).toBeGreaterThanOrEqual(20);
    });

    it('FPM-049: exact default config values for regression detection', () => {
      // If these values need to change, update both the defaults AND this test
      // This prevents accidental config changes that break caching behavior
      expect(DEFAULT_PRELOAD_CONFIG).toEqual({
        maxCacheSize: 100,
        preloadAhead: 20,
        preloadBehind: 5,
        scrubWindow: 10,
        maxConcurrent: 4,
        priorityDecayRate: 1.0,
      });
    });
  });

  describe('LRU optimization', () => {
    it('FPM-028: LRU updates are O(1) with Map-based tracking', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 100,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(1000, loader, disposer, config);

      // Load many frames
      for (let i = 1; i <= 50; i++) {
        await manager.getFrame(i);
      }

      // Access frames in random order - should be fast
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const frame = (i % 50) + 1;
        manager.getCachedFrame(frame);
      }
      const elapsed = performance.now() - start;

      // Should complete in reasonable time (Map operations are O(1))
      expect(elapsed).toBeLessThan(100);
    });

    it('FPM-029: eviction maintains correct LRU order after multiple accesses', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Load frames 1, 2, 3, 4, 5
      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);
      await manager.getFrame(4);
      await manager.getFrame(5);

      // Access in order: 3, 1, 2 (making 2 most recent, then 1, then 3, and 4,5 least recent)
      manager.getCachedFrame(3);
      manager.getCachedFrame(1);
      manager.getCachedFrame(2);

      // Load frame 6 and 7 - should evict 4 then 5 (least recently used)
      await manager.getFrame(6);
      await manager.getFrame(7);

      expect(manager.hasFrame(2)).toBe(true); // Most recent
      expect(manager.hasFrame(1)).toBe(true); // Recently accessed
      expect(manager.hasFrame(3)).toBe(true); // Recently accessed
      expect(manager.hasFrame(6)).toBe(true);
      expect(manager.hasFrame(7)).toBe(true);
      expect(manager.hasFrame(4)).toBe(false); // Evicted first
      expect(manager.hasFrame(5)).toBe(false); // Evicted second
    });
  });

  describe('request coalescing edge cases', () => {
    it('FPM-030: multiple concurrent requests to different frames load independently', async () => {
      let loadCount = 0;
      const slowLoader = vi.fn(async (frame: number) => {
        loadCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return { frame, data: `frame-${frame}` };
      });

      const manager = new FramePreloadManager<TestFrame>(100, slowLoader);

      // Request different frames concurrently
      const promises = [
        manager.getFrame(1),
        manager.getFrame(2),
        manager.getFrame(3),
        manager.getFrame(4),
      ];

      await Promise.all(promises);

      // Each frame should load once
      expect(loadCount).toBe(4);
    });

    it('FPM-031: request during pending load returns same promise result', async () => {
      const slowLoader = vi.fn(async (frame: number) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { frame, data: `frame-${frame}` };
      });

      const manager = new FramePreloadManager<TestFrame>(100, slowLoader);

      // Start a load
      const promise1 = manager.getFrame(5);

      // Wait a bit, then request same frame while still loading
      await new Promise(resolve => setTimeout(resolve, 10));
      const promise2 = manager.getFrame(5);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should return the same result
      expect(result1).toEqual(result2);
      expect(result1).toEqual({ frame: 5, data: 'frame-5' });
      expect(slowLoader).toHaveBeenCalledTimes(1);
    });

    it('FPM-032: cancelled requests do not add to cache when not yet started', async () => {
      const slowLoader = vi.fn(async (frame: number) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { frame, data: `frame-${frame}` };
      });

      const config: Partial<PreloadConfig> = {
        maxCacheSize: 100,
        scrubWindow: 20, // Large window to create many pending requests
        maxConcurrent: 2, // Low concurrency so most requests stay pending
      };
      const manager = new FramePreloadManager<TestFrame>(100, slowLoader, disposer, config);

      // Start preloading around frame 50 - will queue frames 30-70
      manager.preloadAround(50);

      // Immediately jump far away - should cancel pending (not-started) requests
      // Frames far from position 1 should be cancelled
      manager.preloadAround(1);

      await new Promise(resolve => setTimeout(resolve, 300));

      // Frames very far from position 1 should not be cached
      // (they were cancelled before starting due to low concurrency)
      expect(manager.hasFrame(70)).toBe(false);
    });
  });

  describe('playback direction preloading', () => {
    it('FPM-033: reverse playback preloads more frames behind', async () => {
      const config: Partial<PreloadConfig> = {
        preloadAhead: 5,
        preloadBehind: 2,
        maxConcurrent: 10,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      manager.setPlaybackState(true, -1); // Reverse playback
      manager.preloadAround(50);

      await new Promise(resolve => setTimeout(resolve, 50));

      // In reverse, "ahead" means lower frame numbers
      expect(manager.hasFrame(49)).toBe(true); // Ahead in reverse
      expect(manager.hasFrame(45)).toBe(true); // More ahead
    });

    it('FPM-034: switching from playback to scrub changes preload pattern', async () => {
      const config: Partial<PreloadConfig> = {
        preloadAhead: 5,
        preloadBehind: 1,
        scrubWindow: 3,
        maxConcurrent: 10,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Start in playback mode
      manager.setPlaybackState(true, 1);
      manager.preloadAround(50);
      await new Promise(resolve => setTimeout(resolve, 30));

      // Switch to scrub mode
      manager.setPlaybackState(false);
      loader.mockClear();
      manager.clear();

      // Preload in scrub mode
      manager.preloadAround(50);
      await new Promise(resolve => setTimeout(resolve, 30));

      // Scrub mode should have symmetric preloading
      expect(manager.hasFrame(49)).toBe(true);
      expect(manager.hasFrame(51)).toBe(true);
    });
  });

  describe('cache statistics', () => {
    it('FPM-035: tracks cache hits correctly', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      // Load frame 1
      await manager.getFrame(1);

      // Access same frame multiple times
      await manager.getFrame(1);
      await manager.getFrame(1);
      manager.getCachedFrame(1);

      const stats = manager.getStats();
      // First getFrame is a miss (1), subsequent calls are hits (3)
      expect(stats.cacheHits).toBe(3);
      expect(stats.cacheMisses).toBe(1);
    });

    it('FPM-036: tracks cache misses correctly', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      // Request different frames (all misses, then cached)
      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);

      const stats = manager.getStats();
      expect(stats.cacheMisses).toBe(3);
      expect(stats.cacheHits).toBe(0);
    });

    it('FPM-037: calculates hit rate correctly', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      // 1 miss + 3 hits = 75% hit rate
      await manager.getFrame(1); // miss
      await manager.getFrame(1); // hit
      await manager.getFrame(1); // hit
      await manager.getFrame(1); // hit

      const stats = manager.getStats();
      expect(stats.hitRate).toBeCloseTo(0.75, 2);
    });

    it('FPM-038: tracks evictions correctly', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Fill cache
      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);
      await manager.getFrame(4);
      await manager.getFrame(5);

      // Trigger evictions
      await manager.getFrame(6); // evicts 1
      await manager.getFrame(7); // evicts 2

      const stats = manager.getStats();
      expect(stats.evictionCount).toBe(2);
    });

    it('FPM-039: resetStats clears all counters', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      await manager.getFrame(1); // miss
      await manager.getFrame(1); // hit

      manager.resetStats();
      const stats = manager.getStats();

      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
      expect(stats.evictionCount).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('FPM-040: getStats returns all expected fields', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);
      await manager.getFrame(1);

      const stats = manager.getStats();

      expect(stats).toHaveProperty('cacheSize');
      expect(stats).toHaveProperty('pendingRequests');
      expect(stats).toHaveProperty('activeRequests');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
      expect(stats).toHaveProperty('evictionCount');
      expect(stats).toHaveProperty('hitRate');
    });
  });

  describe('batch eviction efficiency', () => {
    it('FPM-041: batch eviction handles multiple evictions efficiently', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Fill cache with 5 frames
      for (let i = 1; i <= 5; i++) {
        await manager.getFrame(i);
      }

      // Add 3 more frames, triggering 3 evictions
      await manager.getFrame(6);
      await manager.getFrame(7);
      await manager.getFrame(8);

      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(5);
      expect(stats.evictionCount).toBe(3);

      // Oldest frames should be evicted (1, 2, 3)
      expect(manager.hasFrame(1)).toBe(false);
      expect(manager.hasFrame(2)).toBe(false);
      expect(manager.hasFrame(3)).toBe(false);

      // Newer frames should remain
      expect(manager.hasFrame(4)).toBe(true);
      expect(manager.hasFrame(5)).toBe(true);
      expect(manager.hasFrame(6)).toBe(true);
      expect(manager.hasFrame(7)).toBe(true);
      expect(manager.hasFrame(8)).toBe(true);
    });

    it('FPM-042: eviction respects LRU order after access', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Load frames 1, 2, 3, 4, 5
      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);
      await manager.getFrame(4);
      await manager.getFrame(5);

      // Access frame 1 to make it most recent
      manager.getCachedFrame(1);

      // Add frame 6 - should evict frame 2 (oldest unused)
      await manager.getFrame(6);

      expect(manager.hasFrame(1)).toBe(true); // recently accessed
      expect(manager.hasFrame(2)).toBe(false); // evicted
      expect(manager.hasFrame(3)).toBe(true);
      expect(manager.hasFrame(4)).toBe(true);
      expect(manager.hasFrame(5)).toBe(true);
      expect(manager.hasFrame(6)).toBe(true);
    });

    it('FPM-043: large batch eviction does not cause performance issues', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 10,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(1000, loader, disposer, config);

      // Fill cache with 10 frames
      for (let i = 1; i <= 10; i++) {
        await manager.getFrame(i);
      }

      const start = performance.now();

      // Trigger eviction of all 10 frames by loading 10 new ones
      for (let i = 11; i <= 20; i++) {
        await manager.getFrame(i);
      }

      const elapsed = performance.now() - start;

      // Should complete quickly (batch eviction is efficient)
      expect(elapsed).toBeLessThan(500);
      expect(manager.getStats().evictionCount).toBe(10);
    });
  });

  // REGRESSION TEST: Small videos should cache ALL frames
  // This was broken when VideoSourceNode had hardcoded maxCacheSize: 60,
  // causing 70-frame videos to only cache 60 frames
  describe('small video full caching', () => {
    it('FPM-050: video with frames <= maxCacheSize caches all frames without eviction', async () => {
      // Simulate a 70-frame video with default config (maxCacheSize: 100)
      const totalFrames = 70;
      const manager = new FramePreloadManager(totalFrames, loader, disposer);

      // Load all 70 frames
      for (let i = 1; i <= totalFrames; i++) {
        await manager.getFrame(i);
      }

      const stats = manager.getStats();

      // ALL 70 frames should be cached - no eviction
      expect(stats.cacheSize).toBe(70);
      expect(stats.evictionCount).toBe(0);

      // Verify each frame is actually cached
      for (let i = 1; i <= totalFrames; i++) {
        expect(manager.hasFrame(i)).toBe(true);
      }
    });

    it('FPM-051: preloadAround does not evict frames when video fits in cache', async () => {
      // 70-frame video should fit entirely in default 100-frame cache
      const totalFrames = 70;
      const manager = new FramePreloadManager(totalFrames, loader, disposer, {
        maxConcurrent: 10, // Fast loading
      });

      // Pre-cache all frames
      for (let i = 1; i <= totalFrames; i++) {
        await manager.getFrame(i);
      }

      // Scrubbing around should NOT evict any frames
      manager.preloadAround(1);
      manager.preloadAround(35);
      manager.preloadAround(70);

      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(70);
      expect(stats.evictionCount).toBe(0);
    });

    it('FPM-052: 100-frame video fully cacheable with default config', async () => {
      // Edge case: exactly maxCacheSize frames
      const totalFrames = 100;
      const manager = new FramePreloadManager(totalFrames, loader, disposer);

      for (let i = 1; i <= totalFrames; i++) {
        await manager.getFrame(i);
      }

      expect(manager.getStats().cacheSize).toBe(100);
      expect(manager.getStats().evictionCount).toBe(0);
    });

    it('FPM-053: 101-frame video triggers eviction (boundary test)', async () => {
      // Just over maxCacheSize - should evict 1 frame
      const totalFrames = 101;
      const manager = new FramePreloadManager(totalFrames, loader, disposer);

      for (let i = 1; i <= totalFrames; i++) {
        await manager.getFrame(i);
      }

      expect(manager.getStats().cacheSize).toBe(100);
      expect(manager.getStats().evictionCount).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('FPM-044: getCachedFrame returns null without tracking miss', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      // getCachedFrame for non-existent frame should not track as miss
      const result = manager.getCachedFrame(999);

      expect(result).toBeNull();
      // getCachedFrame does not track misses (it's just a cache lookup)
      const stats = manager.getStats();
      expect(stats.cacheMisses).toBe(0);
    });

    it('FPM-045: out-of-range frames do not affect statistics', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      await manager.getFrame(0); // out of range
      await manager.getFrame(101); // out of range

      const stats = manager.getStats();
      expect(stats.cacheMisses).toBe(0);
      expect(stats.cacheHits).toBe(0);
    });

    it('FPM-046: disposer called exactly once per eviction', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 5,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager<TestFrame>(100, loader, disposer, config);

      // Fill cache to capacity
      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);
      await manager.getFrame(4);
      await manager.getFrame(5);
      await manager.getFrame(6); // evicts 1

      expect(disposer).toHaveBeenCalledTimes(1);
      expect(disposer).toHaveBeenCalledWith(1, { frame: 1, data: 'frame-1' });
    });
  });

  describe('AbortController support', () => {
    it('FPM-060: abortPendingOperations cancels pending requests', async () => {
      const slowLoader = vi.fn(async (frame: number, signal?: AbortSignal) => {
        return new Promise<TestFrame>((resolve) => {
          const timeout = setTimeout(() => resolve({ frame, data: `frame-${frame}` }), 100);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            // Resolve immediately on abort to speed up cleanup
            resolve({ frame, data: 'aborted' } as TestFrame);
          });
        });
      });

      const config: Partial<PreloadConfig> = {
        scrubWindow: 5,
        maxConcurrent: 2,
      };
      const manager = new FramePreloadManager<TestFrame>(100, slowLoader, disposer, config);

      // Start preloading
      manager.preloadAround(50);

      // Immediately abort
      manager.abortPendingOperations();

      // Wait for active requests to complete via .finally() handlers
      // Active requests will resolve quickly due to abort signal
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStats();
      // All pending requests should be cleared immediately
      expect(stats.pendingRequests).toBe(0);
      // Active requests clean up via .finally() after abort signal triggers resolution
      expect(stats.activeRequests).toBe(0);
    });

    it('FPM-061: setPlaybackState(false) aborts pending when stopping playback', async () => {
      const slowLoader = vi.fn(async (frame: number, signal?: AbortSignal) => {
        return new Promise<TestFrame>((resolve) => {
          const timeout = setTimeout(() => resolve({ frame, data: `frame-${frame}` }), 100);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            // Return null instead of rejecting to avoid unhandled rejection
            resolve({ frame, data: 'aborted' } as TestFrame);
          });
        });
      });

      const config: Partial<PreloadConfig> = {
        preloadAhead: 5,
        maxConcurrent: 2,
      };
      const manager = new FramePreloadManager<TestFrame>(100, slowLoader, disposer, config);

      // Start playback mode and preload
      manager.setPlaybackState(true, 1);
      manager.preloadAround(50);

      // Wait a bit for requests to start
      await new Promise(resolve => setTimeout(resolve, 20));

      // Stop playback - should abort pending operations
      manager.setPlaybackState(false);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = manager.getStats();
      // Pending requests should be cleared when stopping playback
      expect(stats.pendingRequests).toBe(0);
    });

    it('FPM-061b: setPlaybackState aborts on direction change', async () => {
      const slowLoader = vi.fn(async (frame: number, signal?: AbortSignal) => {
        return new Promise<TestFrame>((resolve) => {
          const timeout = setTimeout(() => resolve({ frame, data: `frame-${frame}` }), 100);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            resolve({ frame, data: 'aborted' } as TestFrame);
          });
        });
      });

      const config: Partial<PreloadConfig> = {
        preloadAhead: 5,
        maxConcurrent: 2,
      };
      const manager = new FramePreloadManager<TestFrame>(100, slowLoader, disposer, config);

      // Start forward playback and preload
      manager.setPlaybackState(true, 1);
      manager.preloadAround(50);

      // Wait for requests to start
      await new Promise(resolve => setTimeout(resolve, 20));

      // Get signal before direction change
      const signalBefore = manager.getAbortSignal();

      // Change direction while playing - should abort old preloads
      manager.setPlaybackState(true, -1);

      // Old signal should be aborted
      expect(signalBefore.aborted).toBe(true);

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStats();
      expect(stats.pendingRequests).toBe(0);
    });

    it('FPM-061c: setPlaybackState aborts on play start', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      // Queue some scrub-mode preloads
      manager.preloadAround(50);

      // Get signal before starting playback
      const signalBefore = manager.getAbortSignal();

      // Start playback - should abort scrub preloads for fresh start
      manager.setPlaybackState(true, 1);

      // Old signal should be aborted
      expect(signalBefore.aborted).toBe(true);
    });

    it('FPM-062: getAbortSignal returns current abort signal', () => {
      const manager = new FramePreloadManager(100, loader);

      const signal1 = manager.getAbortSignal();
      expect(signal1).toBeInstanceOf(AbortSignal);
      expect(signal1.aborted).toBe(false);

      // After abort, new signal should be available
      manager.abortPendingOperations();
      const signal2 = manager.getAbortSignal();
      expect(signal2).toBeInstanceOf(AbortSignal);
      expect(signal2.aborted).toBe(false);

      // Old signal should be aborted
      expect(signal1.aborted).toBe(true);
    });

    it('FPM-063: clear() aborts pending operations', async () => {
      const slowLoader = vi.fn(async (frame: number, signal?: AbortSignal) => {
        return new Promise<TestFrame>((resolve) => {
          const timeout = setTimeout(() => resolve({ frame, data: `frame-${frame}` }), 100);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            // Resolve instead of reject to avoid unhandled rejection
            resolve({ frame, data: 'aborted' } as TestFrame);
          });
        });
      });

      const manager = new FramePreloadManager<TestFrame>(100, slowLoader, disposer);

      // Start loading
      manager.preloadAround(50);

      // Wait for requests to start
      await new Promise(resolve => setTimeout(resolve, 20));

      // Clear should abort everything
      manager.clear();

      const stats = manager.getStats();
      expect(stats.pendingRequests).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });

    it('FPM-064: aborted loader does not add to cache', async () => {
      // Use a container object to capture the resolve function
      const resolveContainer: { resolve: ((value: TestFrame) => void) | null } = { resolve: null };
      const controlledLoader = vi.fn((_frame: number, signal?: AbortSignal): Promise<TestFrame> => {
        return new Promise((resolve, reject) => {
          resolveContainer.resolve = resolve;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const manager = new FramePreloadManager<TestFrame>(100, controlledLoader);

      // Start loading frame 5
      const loadPromise = manager.getFrame(5);

      // Abort before it completes
      manager.abortPendingOperations();

      // Try to resolve anyway (simulates race condition)
      if (resolveContainer.resolve) {
        resolveContainer.resolve({ frame: 5, data: 'frame-5' });
      }

      // Wait for promise to settle
      await loadPromise.catch(() => {});

      // Frame should not be in cache because it was aborted
      expect(manager.hasFrame(5)).toBe(false);
    });

    it('FPM-065: new operations work after abort', async () => {
      const manager = new FramePreloadManager(100, loader, disposer);

      // Load a frame
      await manager.getFrame(1);
      expect(manager.hasFrame(1)).toBe(true);

      // Abort (clears pending but not cache)
      manager.abortPendingOperations();

      // Should still be able to use cached frames
      expect(manager.hasFrame(1)).toBe(true);

      // Should be able to load new frames
      await manager.getFrame(2);
      expect(manager.hasFrame(2)).toBe(true);
    });
  });
});
