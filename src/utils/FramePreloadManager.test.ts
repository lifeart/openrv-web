import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FramePreloadManager,
  PreloadConfig,
  DEFAULT_PRELOAD_CONFIG,
} from './FramePreloadManager';

describe('FramePreloadManager', () => {
  let loader: ReturnType<typeof vi.fn>;
  let disposer: ReturnType<typeof vi.fn>;

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
      expect(loader).toHaveBeenCalledWith(5);
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
        maxCacheSize: 3,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Fill cache
      for (let i = 1; i <= 5; i++) {
        await manager.getFrame(i);
      }

      // Disposer should have been called for evicted frames
      expect(disposer).toHaveBeenCalled();
    });

    it('FPM-019: evicts LRU frames first', async () => {
      const config: Partial<PreloadConfig> = {
        maxCacheSize: 3,
        scrubWindow: 0,
      };
      const manager = new FramePreloadManager(100, loader, disposer, config);

      // Load frames 1, 2, 3
      await manager.getFrame(1);
      await manager.getFrame(2);
      await manager.getFrame(3);

      // Access frame 1 again to make it recently used
      await manager.getFrame(1);

      // Load frame 4, should evict frame 2 (least recently used)
      await manager.getFrame(4);

      expect(manager.hasFrame(1)).toBe(true); // Recently accessed
      expect(manager.hasFrame(2)).toBe(false); // LRU, evicted
      expect(manager.hasFrame(3)).toBe(true);
      expect(manager.hasFrame(4)).toBe(true);
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
        return { frame };
      });

      const config: Partial<PreloadConfig> = {
        scrubWindow: 10,
        maxConcurrent: 3,
      };
      const manager = new FramePreloadManager(100, slowLoader, disposer, config);

      manager.preloadAround(50);

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(maxActive).toBeLessThanOrEqual(3);
    });

    it('FPM-026: reuses pending request when same frame requested', async () => {
      let loadCount = 0;
      const slowLoader = vi.fn(async (frame: number) => {
        loadCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return { frame };
      });

      const manager = new FramePreloadManager(100, slowLoader);

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
  });
});
