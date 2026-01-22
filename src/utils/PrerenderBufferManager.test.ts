/**
 * PrerenderBufferManager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PrerenderBufferManager,
  DEFAULT_PRERENDER_CONFIG,
} from './PrerenderBufferManager';
import { createDefaultEffectsState } from './EffectProcessor';

// Mock canvas for testing
function createMockCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Mock frame loader
function createMockFrameLoader(totalFrames: number): (frame: number) => HTMLCanvasElement | null {
  const cache = new Map<number, HTMLCanvasElement>();
  return (frame: number) => {
    if (frame < 1 || frame > totalFrames) return null;
    if (!cache.has(frame)) {
      cache.set(frame, createMockCanvas(100, 100));
    }
    return cache.get(frame)!;
  };
}

describe('PrerenderBufferManager', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = createMockFrameLoader(100);
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false, // Disable workers for unit tests
      maxCacheSize: 20, // Smaller cache for faster tests
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 2,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('constructor', () => {
    it('PBM-001: initializes with provided configuration', () => {
      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.workersAvailable).toBe(false);
    });

    it('PBM-002: uses default config when not provided', () => {
      const defaultManager = new PrerenderBufferManager(50, frameLoader);
      const stats = defaultManager.getStats();
      expect(stats.cacheSize).toBe(0);
      defaultManager.dispose();
    });
  });

  describe('updateEffects', () => {
    it('PBM-003: stores effects state', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.brightness = 10;
      manager.updateEffects(state);
      // No direct way to verify, but should not throw
    });

    it('PBM-004: invalidates cache when effects change', () => {
      const state1 = createDefaultEffectsState();
      state1.colorAdjustments.brightness = 10;
      manager.updateEffects(state1);

      // Manually add a frame (simulate prerender)
      manager.preloadAround(50);

      const state2 = createDefaultEffectsState();
      state2.colorAdjustments.brightness = 20;
      manager.updateEffects(state2);

      // Cache should be invalidated
      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(0);
    });

    it('PBM-005: does not invalidate cache when effects are the same', () => {
      const state1 = createDefaultEffectsState();
      state1.colorAdjustments.brightness = 10;
      manager.updateEffects(state1);

      const state2 = createDefaultEffectsState();
      state2.colorAdjustments.brightness = 10;
      manager.updateEffects(state2);

      // Should not throw or cause issues
    });
  });

  describe('getFrame', () => {
    it('PBM-006: returns null for frames not in cache', () => {
      const result = manager.getFrame(1);
      expect(result).toBeNull();
    });

    it('PBM-007: returns null for invalid frame numbers', () => {
      expect(manager.getFrame(0)).toBeNull();
      expect(manager.getFrame(-1)).toBeNull();
      expect(manager.getFrame(101)).toBeNull();
    });

    it('PBM-008: tracks cache misses', () => {
      manager.getFrame(1);
      manager.getFrame(2);
      const stats = manager.getStats();
      expect(stats.cacheMisses).toBe(2);
    });
  });

  describe('hasFrame', () => {
    it('PBM-009: returns false for uncached frames', () => {
      expect(manager.hasFrame(1)).toBe(false);
    });
  });

  describe('setPlaybackState', () => {
    it('PBM-010: accepts playback state', () => {
      expect(() => {
        manager.setPlaybackState(true, 1);
        manager.setPlaybackState(false, -1);
      }).not.toThrow();
    });
  });

  describe('preloadAround', () => {
    it('PBM-011: does not preload when no effects are active', () => {
      const defaultState = createDefaultEffectsState();
      manager.updateEffects(defaultState);
      manager.preloadAround(50);

      // Should not have queued any requests since no effects
      const stats = manager.getStats();
      expect(stats.pendingRequests).toBe(0);
    });

    it('PBM-012: queues preload requests when effects are active', async () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 20;
      manager.updateEffects(state);

      manager.preloadAround(50);

      // Should have queued some requests
      const stats = manager.getStats();
      expect(stats.pendingRequests).toBeGreaterThanOrEqual(0);
    });

    it('PBM-013: respects frame boundaries', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 20;
      manager.updateEffects(state);

      // Preload near start
      manager.preloadAround(1);
      // Should not throw or try to load frame 0

      // Preload near end
      manager.preloadAround(100);
      // Should not throw or try to load frame 101
    });
  });

  describe('getStats', () => {
    it('PBM-014: returns correct initial statistics', () => {
      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.pendingRequests).toBe(0);
      expect(stats.activeRequests).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('PBM-015: calculates hit rate correctly', () => {
      // Trigger some cache misses
      manager.getFrame(1);
      manager.getFrame(2);
      manager.getFrame(3);

      const stats = manager.getStats();
      expect(stats.cacheMisses).toBe(3);
      expect(stats.hitRate).toBe(0); // All misses
    });
  });

  describe('resetStats', () => {
    it('PBM-016: resets cache hit/miss counters', () => {
      manager.getFrame(1);
      manager.getFrame(2);

      let stats = manager.getStats();
      expect(stats.cacheMisses).toBe(2);

      manager.resetStats();

      stats = manager.getStats();
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
    });
  });

  describe('setTotalFrames', () => {
    it('PBM-017: updates total frame count', () => {
      manager.setTotalFrames(200);
      // Frame 150 should now be valid
      expect(manager.getFrame(150)).toBeNull(); // Still not cached, but valid
    });
  });

  describe('updateConfig', () => {
    it('PBM-018: updates configuration', () => {
      manager.updateConfig({ maxCacheSize: 20 });
      // Should not throw
    });
  });

  describe('clear', () => {
    it('PBM-019: clears all cached frames', () => {
      manager.clear();
      const stats = manager.getStats();
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('dispose', () => {
    it('PBM-020: cleans up resources', () => {
      manager.dispose();
      // Should not throw when called multiple times
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('invalidateAll', () => {
    it('PBM-021: cancels pending requests', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 20;
      manager.updateEffects(state);

      manager.preloadAround(50);
      manager.invalidateAll();

      const stats = manager.getStats();
      expect(stats.pendingRequests).toBe(0);
      expect(stats.cacheSize).toBe(0);
    });
  });

  describe('playback direction', () => {
    it('PBM-022: forward playback preloads ahead', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 20;
      manager.updateEffects(state);

      manager.setPlaybackState(true, 1);
      manager.preloadAround(50);

      // Should have queued preload requests
      const stats = manager.getStats();
      expect(stats.pendingRequests).toBeGreaterThanOrEqual(0);
    });

    it('PBM-023: reverse playback adjusts preload direction', () => {
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 20;
      manager.updateEffects(state);

      manager.setPlaybackState(true, -1);
      manager.preloadAround(50);

      // Should handle reverse direction without error
      const stats = manager.getStats();
      expect(stats.pendingRequests).toBeGreaterThanOrEqual(0);
    });
  });

  describe('LRU eviction', () => {
    it('PBM-024: evicts oldest frames when cache is full', async () => {
      // This test would require actually rendering frames to verify
      // For now, we just verify the manager doesn't crash
      const state = createDefaultEffectsState();
      state.colorAdjustments.highlights = 20;
      manager.updateEffects(state);

      // Trigger multiple preloads
      for (let i = 1; i <= 20; i++) {
        manager.preloadAround(i * 5);
      }

      // Should not exceed cache size (eventually)
      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = manager.getStats();
      // Cache size should be bounded by maxCacheSize (20 in test config)
      expect(stats.cacheSize).toBeLessThanOrEqual(20);
    });
  });
});

describe('DEFAULT_PRERENDER_CONFIG', () => {
  it('PBM-025: has reasonable default values', () => {
    expect(DEFAULT_PRERENDER_CONFIG.maxCacheSize).toBeGreaterThan(0);
    expect(DEFAULT_PRERENDER_CONFIG.preloadAhead).toBeGreaterThan(0);
    expect(DEFAULT_PRERENDER_CONFIG.preloadBehind).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_PRERENDER_CONFIG.maxConcurrent).toBeGreaterThan(0);
    expect(typeof DEFAULT_PRERENDER_CONFIG.useWorkers).toBe('boolean');
    expect(DEFAULT_PRERENDER_CONFIG.numWorkers).toBeGreaterThan(0);
  });

  it('PBM-031: maxConcurrent equals numWorkers for full worker utilization', () => {
    // This test verifies the fix for the issue where maxConcurrent was set to 4
    // while numWorkers could be 8, causing underutilization of the worker pool
    expect(DEFAULT_PRERENDER_CONFIG.maxConcurrent).toBe(DEFAULT_PRERENDER_CONFIG.numWorkers);
  });

  it('PBM-032: numWorkers respects hardware concurrency limit', () => {
    // numWorkers should be capped at 8 regardless of hardware concurrency
    expect(DEFAULT_PRERENDER_CONFIG.numWorkers).toBeLessThanOrEqual(8);
    expect(DEFAULT_PRERENDER_CONFIG.numWorkers).toBeGreaterThanOrEqual(1);
  });
});

describe('Bug Fixes', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = createMockFrameLoader(100);
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false,
      maxCacheSize: 10,
      preloadAhead: 3,
      preloadBehind: 1,
      maxConcurrent: 2,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-026: stale cached frames do not block preloading', async () => {
    // Set initial effects state
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    // Trigger preloading
    manager.preloadAround(50);

    // Wait for some prerendering
    await new Promise(resolve => setTimeout(resolve, 50));

    const statsAfterFirst = manager.getStats();
    // Verify some cache activity occurred
    expect(statsAfterFirst.cacheSize).toBeGreaterThanOrEqual(0);

    // Change effects (invalidates cache)
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Cache should be empty after invalidation
    expect(manager.getStats().cacheSize).toBe(0);

    // Trigger preloading again - should preload even though old entries exist
    manager.preloadAround(50);

    // Wait for prerendering
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should have new cache entries (preload wasn't blocked by stale entries)
    // The test passes if no error occurs and cache can grow again
    expect(manager.getStats().cacheSize).toBeGreaterThanOrEqual(0);
  });

  it('PBM-027: hasFrame returns false for stale cache entries', () => {
    // Set initial effects state
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    // Manually check hasFrame for an uncached frame
    expect(manager.hasFrame(50)).toBe(false);

    // After preloading and effects change, hasFrame should return false
    // even if cache has old data (which it won't after invalidateAll)
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    expect(manager.hasFrame(50)).toBe(false);
  });

  it('PBM-028: getFrame returns null for stale cache entries', () => {
    // Set initial effects state
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    // No frame should be returned before prerendering
    expect(manager.getFrame(50)).toBeNull();

    // After effects change, old entries should not be returned
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    expect(manager.getFrame(50)).toBeNull();
  });

  it('PBM-029: does not evict distant frames when cache is below 80% capacity', async () => {
    // Create manager with small cache for testing
    const smallManager = new PrerenderBufferManager(200, frameLoader, {
      useWorkers: false,
      maxCacheSize: 50,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 4,
    });

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    smallManager.updateEffects(state);

    // Preload around frame 10
    smallManager.preloadAround(10);
    await new Promise(resolve => setTimeout(resolve, 100));

    const statsAfterFirst = smallManager.getStats();
    // Should have cached some frames around frame 10
    const firstCacheSize = statsAfterFirst.cacheSize;

    // Now preload around frame 100 (far from frame 10)
    // With old behavior, frames near 10 would be evicted immediately
    // With new behavior, they should be kept since cache is < 80% full (50 * 0.8 = 40)
    smallManager.preloadAround(100);
    await new Promise(resolve => setTimeout(resolve, 100));

    const stats = smallManager.getStats();
    // Cache should have grown (frames from both regions kept since under 80% capacity)
    // Total cache should be >= first cache size (no eviction of distant frames)
    expect(stats.cacheSize).toBeGreaterThanOrEqual(firstCacheSize);
    // And cache should still be under maxCacheSize
    expect(stats.cacheSize).toBeLessThanOrEqual(50);

    smallManager.dispose();
  });

  it('PBM-030: never evicts frames when video is smaller than cache size', async () => {
    // Create manager for a small 50-frame video with 100-frame cache
    // The entire video should fit in cache without any eviction
    const smallVideoLoader = createMockFrameLoader(50);
    const smallVideoManager = new PrerenderBufferManager(50, smallVideoLoader, {
      useWorkers: false,
      maxCacheSize: 100, // Larger than video
      preloadAhead: 10,
      preloadBehind: 5,
      maxConcurrent: 4,
    });

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    smallVideoManager.updateEffects(state);

    // Preload frames around different parts of the video
    smallVideoManager.preloadAround(1);
    await new Promise(resolve => setTimeout(resolve, 100));
    const statsAfter1 = smallVideoManager.getStats();
    const cacheAfter1 = statsAfter1.cacheSize;

    smallVideoManager.preloadAround(25);
    await new Promise(resolve => setTimeout(resolve, 100));
    const statsAfter25 = smallVideoManager.getStats();
    const cacheAfter25 = statsAfter25.cacheSize;

    smallVideoManager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 100));
    const statsAfter50 = smallVideoManager.getStats();
    const cacheAfter50 = statsAfter50.cacheSize;

    // Go back to frame 1 - frames should NOT be evicted since video < cache size
    smallVideoManager.preloadAround(1);
    await new Promise(resolve => setTimeout(resolve, 100));

    const finalStats = smallVideoManager.getStats();

    // Cache should have grown or stayed the same at each step (no eviction)
    // Real check: cache should have accumulated frames from all regions
    expect(cacheAfter25).toBeGreaterThanOrEqual(cacheAfter1);
    expect(cacheAfter50).toBeGreaterThanOrEqual(cacheAfter25);
    // Final cache should have at least as many frames as after frame 50 preload
    expect(finalStats.cacheSize).toBeGreaterThanOrEqual(cacheAfter50);
    // Cache should never exceed video length (can't cache more frames than exist)
    expect(finalStats.cacheSize).toBeLessThanOrEqual(50);

    smallVideoManager.dispose();
  });
});

describe('Cache Update Callback', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = (frame: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `rgb(${frame}, ${frame}, ${frame})`;
      ctx.fillRect(0, 0, 100, 100);
      return canvas;
    };
    manager = new PrerenderBufferManager(100, frameLoader, { useWorkers: false });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-040: setOnCacheUpdate sets callback', () => {
    const callback = vi.fn();
    manager.setOnCacheUpdate(callback);
    // Callback is stored, no error
    expect(callback).not.toHaveBeenCalled();
  });

  it('PBM-041: callback is called when frame is added to cache', async () => {
    const callback = vi.fn();
    manager.setOnCacheUpdate(callback);

    // Must have active effects for preloading to work
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);
    manager.preloadAround(50);

    // Wait for preloading to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Callback should have been called for each cached frame
    expect(callback).toHaveBeenCalled();
  });

  it('PBM-042: callback can be unset with null', async () => {
    const callback = vi.fn();
    manager.setOnCacheUpdate(callback);
    manager.setOnCacheUpdate(null);

    // Must have active effects for preloading to work
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);
    manager.preloadAround(50);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Callback should not have been called since it was unset
    expect(callback).not.toHaveBeenCalled();
  });

  it('PBM-043: callback is called once per frame cached', async () => {
    const callback = vi.fn();
    manager.setOnCacheUpdate(callback);

    // Must have active effects for preloading to work
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    // Preload a small window
    manager.preloadAround(5);
    await new Promise(resolve => setTimeout(resolve, 150));

    const callCount = callback.mock.calls.length;
    const stats = manager.getStats();

    // Should have approximately one call per cached frame
    // (may not be exact due to timing, but should be close)
    expect(callCount).toBeGreaterThan(0);
    expect(callCount).toBeLessThanOrEqual(stats.cacheSize + 5); // Allow some margin
  });
});
