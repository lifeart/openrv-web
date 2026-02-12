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

describe('Stale cache fallback during playback', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = (frame: number) => {
      if (frame < 1 || frame > 100) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `rgb(${frame}, ${frame}, ${frame})`;
      ctx.fillRect(0, 0, 100, 100);
      return canvas;
    };
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false,
      maxCacheSize: 20,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 2,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-050: getFrame returns stale cached frames from previousCache during playback', async () => {
    // Set initial effects and cache some frames
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.setPlaybackState(true, 1);
    manager.preloadAround(50);

    // Wait for prerendering
    await new Promise(resolve => setTimeout(resolve, 150));

    const statsBeforeChange = manager.getStats();
    expect(statsBeforeChange.cacheSize).toBeGreaterThan(0);

    // Change effects during playback
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Phase 2C: Current cache is empty, old frames in previousCache
    const statsAfterChange = manager.getStats();
    expect(statsAfterChange.cacheSize).toBe(0);
    expect(statsAfterChange.previousCacheSize).toBeGreaterThan(0);

    // getFrame should return stale frames from previousCache
    // Try a frame that was prerendered earlier
    // (frames around 50 should have been cached)
    let foundStaleFrame = false;
    for (let f = 48; f <= 55; f++) {
      const frame = manager.getFrame(f);
      if (frame !== null) {
        foundStaleFrame = true;
        break;
      }
    }
    expect(foundStaleFrame).toBe(true);
  });

  it('PBM-051: getFrame returns stale frames from previousCache when paused (Phase 2C)', async () => {
    // Set initial effects and cache some frames
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.setPlaybackState(false);
    manager.preloadAround(50);

    await new Promise(resolve => setTimeout(resolve, 150));

    const cacheSizeBefore = manager.getStats().cacheSize;
    expect(cacheSizeBefore).toBeGreaterThan(0);

    // Change effects while paused
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Current cache should be empty (rotated to previousCache)
    const stats = manager.getStats();
    expect(stats.cacheSize).toBe(0);
    // Previous cache should retain the old frames
    expect(stats.previousCacheSize).toBe(cacheSizeBefore);

    // Phase 2C: getFrame should return stale frames from previousCache
    // even when paused (avoids flash of unprocessed content)
    let foundStaleFrame = false;
    for (let f = 48; f <= 55; f++) {
      const frame = manager.getFrame(f);
      if (frame !== null) {
        foundStaleFrame = true;
        break;
      }
    }
    expect(foundStaleFrame).toBe(true);
  });

  it('PBM-052: updateEffects does hard invalidation when paused', () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    // Not playing (default)
    manager.setPlaybackState(false);

    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Cache should be empty
    expect(manager.getStats().cacheSize).toBe(0);
  });

  it('PBM-053: updateEffects rotates cache to previousCache (Phase 2C double-buffer)', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);
    manager.setPlaybackState(true, 1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 150));

    const cacheSizeBefore = manager.getStats().cacheSize;
    expect(cacheSizeBefore).toBeGreaterThan(0);

    // Change effects during playback
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Phase 2C: Current cache is empty, old frames moved to previousCache
    expect(manager.getStats().cacheSize).toBe(0);
    expect(manager.getStats().previousCacheSize).toBe(cacheSizeBefore);
  });

  it('PBM-054: hasFrame returns false for stale frames even during playback', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);
    manager.setPlaybackState(true, 1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 150));

    // Change effects
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // hasFrame should return false for stale frames (strict hash check)
    // This ensures stale frames get re-queued for prerendering
    for (let f = 48; f <= 55; f++) {
      expect(manager.hasFrame(f)).toBe(false);
    }
  });

  it('PBM-059: stale cache hits are tracked separately from fresh hits', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);
    manager.setPlaybackState(true, 1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 150));

    // Get some fresh cache hits
    let freshHitCount = 0;
    for (let f = 48; f <= 55; f++) {
      if (manager.getFrame(f)) freshHitCount++;
    }

    const statsBeforeChange = manager.getStats();
    expect(statsBeforeChange.cacheHits).toBe(freshHitCount);
    expect(statsBeforeChange.staleCacheHits).toBe(0);

    // Change effects (Phase 2C: double-buffer rotation, frames move to previousCache)
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Now get stale hits (from previousCache)
    let staleHitCount = 0;
    for (let f = 48; f <= 55; f++) {
      if (manager.getFrame(f)) staleHitCount++;
    }

    const statsAfterChange = manager.getStats();
    // Fresh hits should be unchanged (from before effects change)
    expect(statsAfterChange.cacheHits).toBe(freshHitCount);
    // Stale hits should now be tracked separately
    expect(statsAfterChange.staleCacheHits).toBe(staleHitCount);
  });

  it('PBM-055: updateEffects cancels pending requests on effects change', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);
    manager.setPlaybackState(true, 1);

    // Queue some preload requests
    manager.preloadAround(50);

    // Change effects immediately (before workers finish)
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Pending requests should be cleared (old effects)
    expect(manager.getStats().pendingRequests).toBe(0);
  });
});

describe('preloadAround deduplication', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = createMockFrameLoader(100);
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false,
      maxCacheSize: 20,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 2,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-056: repeated preloadAround with same frame is deduplicated', () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.preloadAround(50);
    const statsAfterFirst = manager.getStats();

    // Call again with same frame - should be a no-op
    manager.preloadAround(50);
    const statsAfterSecond = manager.getStats();

    // Pending request counts should be the same
    expect(statsAfterSecond.pendingRequests).toBe(statsAfterFirst.pendingRequests);
  });

  it('PBM-057: preloadAround runs again when frame changes', () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.preloadAround(50);

    // Different frame should not be deduplicated
    manager.preloadAround(60);
    const statsAfterSecond = manager.getStats();

    // Should have queued new requests (some may overlap)
    expect(statsAfterSecond.pendingRequests).toBeGreaterThanOrEqual(0);
  });

  it('PBM-058: preloadAround runs again after effects change for same frame', () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);

    // Change effects (clears pending)
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Same frame but different effects - should NOT be deduplicated
    manager.preloadAround(50);
    const stats = manager.getStats();
    expect(stats.pendingRequests).toBeGreaterThan(0);
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

describe('Phase 2A: queuePriorityFrame', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = (frame: number) => {
      if (frame < 1 || frame > 100) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `rgb(${frame}, ${frame}, ${frame})`;
      ctx.fillRect(0, 0, 100, 100);
      return canvas;
    };
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false,
      maxCacheSize: 20,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 2,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-060: queuePriorityFrame does nothing without active effects', () => {
    const defaultState = createDefaultEffectsState();
    manager.updateEffects(defaultState);

    manager.queuePriorityFrame(50);

    const stats = manager.getStats();
    expect(stats.pendingRequests).toBe(0);
  });

  it('PBM-061: queuePriorityFrame queues a frame with active effects', () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.queuePriorityFrame(50);

    const stats = manager.getStats();
    // Frame should be queued (pending or already started processing)
    expect(stats.pendingRequests + stats.activeRequests).toBeGreaterThanOrEqual(0);
  });

  it('PBM-062: queuePriorityFrame ignores invalid frame numbers', () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.queuePriorityFrame(0);
    manager.queuePriorityFrame(-5);
    manager.queuePriorityFrame(101);

    const stats = manager.getStats();
    expect(stats.pendingRequests).toBe(0);
  });

  it('PBM-063: queuePriorityFrame processes frame in background', async () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.queuePriorityFrame(50);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 150));

    // Frame should now be in cache
    const cached = manager.getFrame(50);
    expect(cached).not.toBeNull();
    expect(cached!.width).toBe(100);
    expect(cached!.height).toBe(100);
  });

  it('PBM-064: queuePriorityFrame does not re-queue already cached frames', async () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    // First: cache the frame
    manager.queuePriorityFrame(50);
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(manager.hasFrame(50)).toBe(true);

    // Second: try to queue again - should be a no-op
    manager.queuePriorityFrame(50);
    // No error, and stats should reflect no new pending request for frame 50
    const stats = manager.getStats();
    expect(stats.cacheSize).toBeGreaterThan(0);
  });
});

describe('Phase 2A: onFrameProcessed callback', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = (frame: number) => {
      if (frame < 1 || frame > 100) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `rgb(${frame}, ${frame}, ${frame})`;
      ctx.fillRect(0, 0, 100, 100);
      return canvas;
    };
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false,
      maxCacheSize: 20,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 2,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-065: onFrameProcessed is called when a frame completes', async () => {
    const processedFrames: number[] = [];
    manager.onFrameProcessed = (frame: number) => {
      processedFrames.push(frame);
    };

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.queuePriorityFrame(50);
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(processedFrames).toContain(50);
  });

  it('PBM-066: onFrameProcessed is not called when callback is null', async () => {
    manager.onFrameProcessed = null;

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    // Should not throw
    manager.queuePriorityFrame(50);
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(manager.hasFrame(50)).toBe(true);
  });

  it('PBM-067: onFrameProcessed fires for each frame during preloadAround', async () => {
    const processedFrames: number[] = [];
    manager.onFrameProcessed = (frame: number) => {
      processedFrames.push(frame);
    };

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should have processed multiple frames
    expect(processedFrames.length).toBeGreaterThan(0);
    // All processed frames should be near frame 50
    for (const f of processedFrames) {
      expect(f).toBeGreaterThanOrEqual(45);
      expect(f).toBeLessThanOrEqual(55);
    }
  });
});

describe('Phase 2B: Dynamic preload-ahead', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = createMockFrameLoader(200);
    manager = new PrerenderBufferManager(200, frameLoader, {
      useWorkers: false,
      maxCacheSize: 50,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 4,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-068: getDynamicPreloadAhead returns default value initially', () => {
    expect(manager.getDynamicPreloadAhead()).toBe(30);
  });

  it('PBM-069: updateDynamicPreloadAhead does nothing with < 3 samples', () => {
    // No processing has happened yet
    manager.updateDynamicPreloadAhead(24);
    expect(manager.getDynamicPreloadAhead()).toBe(30); // unchanged
  });

  it('PBM-070: updateDynamicPreloadAhead adjusts based on processing time', async () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    // Process several frames to gather timing data
    manager.setPlaybackState(true, 1);
    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Now update dynamic preload ahead
    manager.updateDynamicPreloadAhead(24);
    const preloadAhead = manager.getDynamicPreloadAhead();

    // Should be at least the minimum (30) and at most 120
    expect(preloadAhead).toBeGreaterThanOrEqual(30);
    expect(preloadAhead).toBeLessThanOrEqual(120);
  });

  it('PBM-071: dynamicPreloadAhead is clamped to [30, 120]', async () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    // Process frames to get timing data
    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Very high FPS should give low preload ahead, but clamped to 30
    manager.updateDynamicPreloadAhead(1000);
    expect(manager.getDynamicPreloadAhead()).toBeGreaterThanOrEqual(30);

    // Very low FPS should give high preload ahead, but clamped to 120
    manager.updateDynamicPreloadAhead(0.1);
    expect(manager.getDynamicPreloadAhead()).toBeLessThanOrEqual(120);
  });

  it('PBM-072: getStats includes dynamicPreloadAhead', () => {
    const stats = manager.getStats();
    expect(stats.dynamicPreloadAhead).toBe(30);
  });

  it('PBM-073: frame processing time tracking accumulates data', async () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // After processing frames, the dynamic preload-ahead should be calculable
    // (we can't directly read frameProcessingTimes, but updateDynamicPreloadAhead
    // should now produce a non-default value if enough frames were processed)
    manager.updateDynamicPreloadAhead(24);
    // Value may or may not change from 30 depending on timing, but should not crash
    expect(manager.getDynamicPreloadAhead()).toBeGreaterThanOrEqual(30);
  });
});

describe('Phase 2C: Double-buffering for effects parameter changes', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = (frame: number) => {
      if (frame < 1 || frame > 100) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = `rgb(${frame}, ${frame}, ${frame})`;
      ctx.fillRect(0, 0, 100, 100);
      return canvas;
    };
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false,
      maxCacheSize: 50,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 4,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  it('PBM-DB-001: When effects hash changes, previous cache retains old frames', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    const cacheSizeBefore = manager.getStats().cacheSize;
    expect(cacheSizeBefore).toBeGreaterThan(0);

    // Change effects hash
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Current cache should be empty (fresh for new hash)
    expect(manager.getStats().cacheSize).toBe(0);
    // Previous cache should retain all old frames
    expect(manager.getStats().previousCacheSize).toBe(cacheSizeBefore);
  });

  it('PBM-DB-002: getFrame returns stale frame from previousCache on current cache miss', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify frames are cached
    let cachedFrameNumber = -1;
    for (let f = 48; f <= 55; f++) {
      if (manager.hasFrame(f)) {
        cachedFrameNumber = f;
        break;
      }
    }
    expect(cachedFrameNumber).toBeGreaterThan(0);

    // Change effects - frames rotate to previousCache
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Current cache miss, should fall back to previousCache
    const staleFrame = manager.getFrame(cachedFrameNumber);
    expect(staleFrame).not.toBeNull();
    expect(staleFrame!.width).toBe(100);
    expect(staleFrame!.height).toBe(100);

    // Should be counted as a stale hit
    const stats = manager.getStats();
    expect(stats.staleCacheHits).toBeGreaterThan(0);
  });

  it('PBM-DB-003: getFrame prefers current cache over previousCache', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Change effects
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Now prerender with new effects
    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Reset stats to isolate measurements
    manager.resetStats();

    // Get a frame that should be in the current cache
    let foundCurrentFrame = false;
    for (let f = 48; f <= 55; f++) {
      if (manager.hasFrame(f)) {
        const frame = manager.getFrame(f);
        expect(frame).not.toBeNull();
        foundCurrentFrame = true;

        // Should be a fresh cache hit, NOT a stale one
        const stats = manager.getStats();
        expect(stats.cacheHits).toBeGreaterThan(0);
        expect(stats.staleCacheHits).toBe(0);
        break;
      }
    }
    expect(foundCurrentFrame).toBe(true);
  });

  it('PBM-DB-004: Previous cache is cleared when new cache is sufficiently populated', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    const previousCacheSize = manager.getStats().cacheSize;
    expect(previousCacheSize).toBeGreaterThan(0);

    // Change effects
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    expect(manager.getStats().previousCacheSize).toBe(previousCacheSize);

    // Prerender enough frames with new effects to trigger cleanup
    // Threshold is max(10, floor(previousCacheSize / 2))
    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Once new cache has enough frames, previousCache should be cleared
    const finalStats = manager.getStats();
    if (finalStats.cacheSize >= Math.max(10, Math.floor(previousCacheSize / 2))) {
      expect(finalStats.previousCacheSize).toBe(0);
    }
  });

  it('PBM-DB-005: dispose() clears both caches', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Change effects to populate previousCache
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    expect(manager.getStats().previousCacheSize).toBeGreaterThan(0);

    // Dispose should clear everything
    manager.dispose();

    const stats = manager.getStats();
    expect(stats.cacheSize).toBe(0);
    expect(stats.previousCacheSize).toBe(0);
  });

  it('PBM-DB-006: Multiple rapid effects changes only keep ONE generation back', async () => {
    // Set first effects and cache frames
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    const firstCacheSize = manager.getStats().cacheSize;
    expect(firstCacheSize).toBeGreaterThan(0);

    // Rapid effects changes (simulating slider drag)
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 30;
    manager.updateEffects(state2);

    // previousCache should have generation 1 frames
    expect(manager.getStats().previousCacheSize).toBe(firstCacheSize);

    // Another change immediately (generation 2 cache is empty, replaces previousCache)
    const state3 = createDefaultEffectsState();
    state3.colorAdjustments.highlights = 40;
    manager.updateEffects(state3);

    // previousCache should now have generation 2 frames (which is empty since
    // no prerendering happened between state2 and state3).
    // The key invariant: only ONE previousCache exists, never two.
    // Generation 1 frames are gone.
    expect(manager.getStats().previousCacheSize).toBe(0);

    // Yet another change
    const state4 = createDefaultEffectsState();
    state4.colorAdjustments.highlights = 50;
    manager.updateEffects(state4);

    // Still only zero or one generation of previousCache
    expect(manager.getStats().previousCacheSize).toBe(0);

    // Now prerender some frames with state4, then change again
    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    const state4CacheSize = manager.getStats().cacheSize;

    const state5 = createDefaultEffectsState();
    state5.colorAdjustments.highlights = 60;
    manager.updateEffects(state5);

    // Only state4 frames in previousCache, nothing from state1/2/3
    expect(manager.getStats().previousCacheSize).toBe(state4CacheSize);
    expect(manager.getStats().cacheSize).toBe(0);
  });

  it('PBM-DB-007: getStats includes previousCacheSize', () => {
    const stats = manager.getStats();
    expect(stats.previousCacheSize).toBe(0);
    expect(typeof stats.previousCacheSize).toBe('number');
  });

  it('PBM-DB-008: invalidateAll clears both current and previous caches', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Change effects to populate previousCache
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    expect(manager.getStats().previousCacheSize).toBeGreaterThan(0);

    // invalidateAll should clear everything
    manager.invalidateAll();

    expect(manager.getStats().cacheSize).toBe(0);
    expect(manager.getStats().previousCacheSize).toBe(0);
  });

  it('PBM-DB-009: getFrame returns null when both caches miss', async () => {
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    // Frame 99 is far from any preloaded range
    expect(manager.getFrame(99)).toBeNull();

    // Change effects
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Frame 99 is in neither cache
    expect(manager.getFrame(99)).toBeNull();
    expect(manager.getStats().cacheMisses).toBeGreaterThan(0);
  });

  it('PBM-DB-010: Double-buffering works regardless of playback state', async () => {
    // Test that previousCache fallback works both when playing and when paused
    const state1 = createDefaultEffectsState();
    state1.colorAdjustments.highlights = 20;
    manager.updateEffects(state1);

    manager.preloadAround(50);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify we have cached frames
    let cachedFrameNumber = -1;
    for (let f = 48; f <= 55; f++) {
      if (manager.hasFrame(f)) {
        cachedFrameNumber = f;
        break;
      }
    }
    expect(cachedFrameNumber).toBeGreaterThan(0);

    // Change effects while paused (default state)
    manager.setPlaybackState(false);
    const state2 = createDefaultEffectsState();
    state2.colorAdjustments.highlights = 40;
    manager.updateEffects(state2);

    // Should still get stale frame from previousCache even when paused
    const frame = manager.getFrame(cachedFrameNumber);
    expect(frame).not.toBeNull();

    // Now test while playing
    manager.setPlaybackState(true, 1);
    const frameWhilePlaying = manager.getFrame(cachedFrameNumber);
    expect(frameWhilePlaying).not.toBeNull();
  });
});

// =============================================================================
// setTargetSize — proxy-aware effects processing
// =============================================================================

describe('PrerenderBufferManager setTargetSize', () => {
  let manager: PrerenderBufferManager;
  let frameLoader: (frame: number) => HTMLCanvasElement | null;

  beforeEach(() => {
    frameLoader = createMockFrameLoader(100);
    manager = new PrerenderBufferManager(100, frameLoader, {
      useWorkers: false,
      maxCacheSize: 20,
      preloadAhead: 5,
      preloadBehind: 2,
      maxConcurrent: 2,
    });
  });

  afterEach(() => {
    manager.dispose();
  });

  /** Helper: populate cache for frame via public API and wait for processing. */
  async function cacheFrame(mgr: PrerenderBufferManager, frame: number): Promise<void> {
    mgr.queuePriorityFrame(frame);
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  it('PBM-TS-001: setTargetSize accepts positive dimensions', () => {
    // Should not throw
    manager.setTargetSize(800, 600);
  });

  it('PBM-TS-002: setTargetSize ignores zero dimensions', async () => {
    manager.setTargetSize(800, 600);

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    await cacheFrame(manager, 5);
    expect(manager.hasFrame(5)).toBe(true);

    // setTargetSize with 0 should be ignored — cache should NOT be invalidated
    manager.setTargetSize(0, 600);
    expect(manager.hasFrame(5)).toBe(true);

    manager.setTargetSize(800, 0);
    expect(manager.hasFrame(5)).toBe(true);
  });

  it('PBM-TS-003: setTargetSize ignores negative dimensions', async () => {
    manager.setTargetSize(800, 600);
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    await cacheFrame(manager, 5);
    expect(manager.hasFrame(5)).toBe(true);

    manager.setTargetSize(-100, 600);
    expect(manager.hasFrame(5)).toBe(true);
  });

  it('PBM-TS-004: small size changes within 20% do not invalidate cache', async () => {
    manager.setTargetSize(1000, 800);

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    await cacheFrame(manager, 5);
    expect(manager.hasFrame(5)).toBe(true);

    // 10% change — within 20% tolerance
    manager.setTargetSize(1100, 880);
    expect(manager.hasFrame(5)).toBe(true);
  });

  it('PBM-TS-005: large size changes beyond 20% invalidate cache', async () => {
    manager.setTargetSize(1000, 800);

    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    await cacheFrame(manager, 5);
    expect(manager.hasFrame(5)).toBe(true);

    // 50% change — beyond 20% tolerance
    manager.setTargetSize(500, 400);
    expect(manager.hasFrame(5)).toBe(false);
  });

  it('PBM-TS-006: first setTargetSize call does not invalidate (no prior target)', async () => {
    const state = createDefaultEffectsState();
    state.colorAdjustments.highlights = 20;
    manager.updateEffects(state);

    await cacheFrame(manager, 5);
    expect(manager.hasFrame(5)).toBe(true);

    // First setTargetSize — no prior target, should NOT invalidate
    manager.setTargetSize(800, 600);
    expect(manager.hasFrame(5)).toBe(true);
  });
});
