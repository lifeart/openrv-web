import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameCacheController, type CacheSourceInfo } from './FrameCacheController';
import { MemoryBudgetManager } from './MemoryBudgetManager';
import { MB, GB } from '../config/CacheConfig';

/**
 * Helper to create a mock source with a simple in-memory frame set.
 */
function createMockSource(
  overrides?: Partial<CacheSourceInfo>,
): CacheSourceInfo & { _cachedFrames: Set<number>; _evictedFrames: number[] } {
  const cachedFrames = new Set<number>();
  const evictedFrames: number[] = [];

  return {
    sourceId: 'sourceA',
    width: 1920,
    height: 1080,
    isHDR: false,
    totalFrames: 300,
    hasFrame: (frame: number) => cachedFrames.has(frame),
    getCachedFrames: () => new Set(cachedFrames),
    preloadFrames: vi.fn((frames: number[]) => {
      // Simulate immediate caching for test purposes
      for (const f of frames) {
        cachedFrames.add(f);
      }
    }),
    evictFrames: vi.fn((frames: number[]) => {
      for (const f of frames) {
        cachedFrames.delete(f);
        evictedFrames.push(f);
      }
    }),
    getCachedFrameCount: () => cachedFrames.size,
    _cachedFrames: cachedFrames,
    _evictedFrames: evictedFrames,
    ...overrides,
  };
}

describe('FrameCacheController', () => {
  let controller: FrameCacheController;
  let budgetManager: MemoryBudgetManager;

  beforeEach(() => {
    budgetManager = new MemoryBudgetManager({
      totalBudget: 512 * MB,
      highWaterMark: 0.8,
      criticalMark: 0.95,
      auditIntervalMs: 0,
    });

    controller = new FrameCacheController(
      {
        mode: 'lookahead',
        memoryBudgetBytes: 512 * MB,
        minPrerollFrames: 4,
        minEvictionGuard: 2,
      },
      budgetManager,
    );
  });

  afterEach(() => {
    controller.dispose();
  });

  // -------------------------------------------------------------------
  // Mode management
  // -------------------------------------------------------------------

  describe('mode management', () => {
    it('FCC-001: initializes with configured mode', () => {
      expect(controller.getMode()).toBe('lookahead');
    });

    it('FCC-002: setMode changes the mode', () => {
      controller.setMode('region');
      expect(controller.getMode()).toBe('region');
    });

    it('FCC-003: setMode emits modeChanged event', () => {
      const listener = vi.fn();
      controller.on('modeChanged', listener);
      controller.setMode('off');
      expect(listener).toHaveBeenCalledWith('off');
    });

    it('FCC-004: setMode does not emit when mode is same', () => {
      const listener = vi.fn();
      controller.on('modeChanged', listener);
      controller.setMode('lookahead'); // Same as initial
      expect(listener).not.toHaveBeenCalled();
    });

    it('FCC-005: cycleMode cycles through modes', () => {
      // Start at lookahead -> off -> region -> lookahead
      expect(controller.getMode()).toBe('lookahead');
      controller.cycleMode();
      expect(controller.getMode()).toBe('off');
      controller.cycleMode();
      expect(controller.getMode()).toBe('region');
      controller.cycleMode();
      expect(controller.getMode()).toBe('lookahead');
    });

    it('FCC-006: switching to off mode evicts to minimal buffer', () => {
      const source = createMockSource();
      controller.registerSource(source);

      // Add some cached frames
      source._cachedFrames.add(1);
      source._cachedFrames.add(2);
      source._cachedFrames.add(3);
      source._cachedFrames.add(10);
      source._cachedFrames.add(20);
      source._cachedFrames.add(50);

      controller.onPlaybackStateChange({ currentFrame: 2, inPoint: 1, outPoint: 300 });
      controller.setMode('off');

      // Frames far from current should be evicted
      expect(source.evictFrames).toHaveBeenCalled();
      // Frames 1, 2, 3 (within +/-1 of frame 2) should be kept
      expect(source._cachedFrames.has(1)).toBe(true);
      expect(source._cachedFrames.has(2)).toBe(true);
      expect(source._cachedFrames.has(3)).toBe(true);
      // Far frames should be evicted
      expect(source._cachedFrames.has(50)).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // Source registration
  // -------------------------------------------------------------------

  describe('source registration', () => {
    it('FCC-007: registers a source', () => {
      const source = createMockSource();
      controller.registerSource(source);
      expect(controller.getRegisteredSourceIds()).toContain('sourceA');
    });

    it('FCC-008: first registered source becomes active', () => {
      const source = createMockSource();
      controller.registerSource(source);
      expect(controller.getActiveSourceId()).toBe('sourceA');
    });

    it('FCC-009: unregisters a source', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.unregisterSource('sourceA');
      expect(controller.getRegisteredSourceIds()).not.toContain('sourceA');
    });

    it('FCC-010: unregistering active source picks next available', () => {
      const sourceA = createMockSource({ sourceId: 'sourceA' });
      const sourceB = createMockSource({ sourceId: 'sourceB' });
      controller.registerSource(sourceA);
      controller.registerSource(sourceB);
      controller.unregisterSource('sourceA');
      expect(controller.getActiveSourceId()).toBe('sourceB');
    });

    it('FCC-011: setActiveSource changes active source', () => {
      const sourceA = createMockSource({ sourceId: 'sourceA' });
      const sourceB = createMockSource({ sourceId: 'sourceB' });
      controller.registerSource(sourceA);
      controller.registerSource(sourceB);
      controller.setActiveSource('sourceB');
      expect(controller.getActiveSourceId()).toBe('sourceB');
    });

    it('FCC-012: setActiveSource ignores unregistered source', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setActiveSource('nonexistent');
      expect(controller.getActiveSourceId()).toBe('sourceA');
    });
  });

  // -------------------------------------------------------------------
  // Playback state
  // -------------------------------------------------------------------

  describe('playback state', () => {
    it('FCC-013: updates playback info', () => {
      controller.onPlaybackStateChange({
        isPlaying: true,
        direction: 1,
        speed: 2,
        currentFrame: 50,
      });

      const info = controller.getPlaybackInfo();
      expect(info.isPlaying).toBe(true);
      expect(info.direction).toBe(1);
      expect(info.speed).toBe(2);
      expect(info.currentFrame).toBe(50);
    });

    it('FCC-014: onPlaybackStart sets playing state', () => {
      controller.onPlaybackStart(1, 1, 10);
      const info = controller.getPlaybackInfo();
      expect(info.isPlaying).toBe(true);
      expect(info.currentFrame).toBe(10);
    });

    it('FCC-015: onPlaybackStop clears playing state', () => {
      controller.onPlaybackStart(1, 1, 10);
      controller.onPlaybackStop();
      expect(controller.getPlaybackInfo().isPlaying).toBe(false);
    });

    it('FCC-016: onSeek updates frame and resets scrub velocity', () => {
      controller.onSeek(100);
      expect(controller.getPlaybackInfo().currentFrame).toBe(100);
      expect(controller.getScrubVelocity()).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Region management
  // -------------------------------------------------------------------

  describe('region management', () => {
    it('FCC-017: region updates on frame change', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      const region = controller.getRegion();
      expect(region.start).toBeLessThanOrEqual(50);
      expect(region.end).toBeGreaterThanOrEqual(50);
    });

    it('FCC-018: region in off mode is 3-frame buffer', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('off');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      const region = controller.getRegion();
      expect(region.start).toBe(49);
      expect(region.end).toBe(51);
    });

    it('FCC-019: region respects inPoint boundary', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('off');
      controller.onPlaybackStateChange({ currentFrame: 1, inPoint: 1, outPoint: 300 });

      const region = controller.getRegion();
      expect(region.start).toBe(1);
    });

    it('FCC-020: region respects outPoint boundary', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('off');
      controller.onPlaybackStateChange({ currentFrame: 300, inPoint: 1, outPoint: 300 });

      const region = controller.getRegion();
      expect(region.end).toBe(300);
    });

    it('FCC-021: emits regionChanged event', () => {
      const source = createMockSource();
      controller.registerSource(source);
      const listener = vi.fn();
      controller.on('regionChanged', listener);
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });
      expect(listener).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Preloading
  // -------------------------------------------------------------------

  describe('preloading', () => {
    it('FCC-022: triggers preload when frame changes in region mode', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('region');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      expect(source.preloadFrames).toHaveBeenCalled();
    });

    it('FCC-023: preloads minimal buffer in off mode', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('off');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      // Should preload at most frames 49, 50, 51
      const preloaded = source._cachedFrames;
      expect(preloaded.has(50)).toBe(true); // current
    });

    it('FCC-024: does not preload without a registered source', () => {
      controller.setMode('region');
      // Should not throw
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });
    });
  });

  // -------------------------------------------------------------------
  // Eviction
  // -------------------------------------------------------------------

  describe('eviction', () => {
    it('FCC-025: getFramesToEvict returns frames outside region sorted by distance', () => {
      const source = createMockSource();
      controller.registerSource(source);

      // Set current frame and region
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      // Add frames far from playhead
      source._cachedFrames.add(1);
      source._cachedFrames.add(200);
      source._cachedFrames.add(250);

      const toEvict = controller.getFramesToEvict('sourceA');
      // Should include distant frames outside the region
      expect(toEvict.length).toBeGreaterThan(0);
      // Farthest should be first
      if (toEvict.length > 1) {
        const dist0 = Math.abs(toEvict[0]! - 50);
        const dist1 = Math.abs(toEvict[1]! - 50);
        expect(dist0).toBeGreaterThanOrEqual(dist1);
      }
    });

    it('FCC-026: getFramesToEvict respects eviction guard radius', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.onPlaybackStateChange({
        currentFrame: 50,
        speed: 1,
        inPoint: 1,
        outPoint: 300,
      });

      // Frames within guard radius (2 at 1x speed)
      source._cachedFrames.add(49);
      source._cachedFrames.add(50);
      source._cachedFrames.add(51);

      const toEvict = controller.getFramesToEvict('sourceA');
      expect(toEvict).not.toContain(49);
      expect(toEvict).not.toContain(50);
      expect(toEvict).not.toContain(51);
    });

    it('FCC-027: getFramesToEvict respects targetCount', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('off');
      controller.onPlaybackStateChange({
        currentFrame: 50,
        inPoint: 1,
        outPoint: 300,
      });

      // Add many frames
      for (let i = 1; i <= 100; i++) {
        source._cachedFrames.add(i);
      }

      const toEvict = controller.getFramesToEvict('sourceA', 5);
      expect(toEvict.length).toBeLessThanOrEqual(5);
    });

    it('FCC-028: emergencyEviction evicts 20% of frames', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('off'); // small region
      controller.onPlaybackStateChange({
        currentFrame: 50,
        inPoint: 1,
        outPoint: 300,
      });

      // Add 100 cached frames
      for (let i = 1; i <= 100; i++) {
        source._cachedFrames.add(i);
      }

      controller.emergencyEviction();

      // Should have evicted some frames
      expect(source.evictFrames).toHaveBeenCalled();
      expect(source._cachedFrames.size).toBeLessThan(100);
    });
  });

  // -------------------------------------------------------------------
  // Warm-up
  // -------------------------------------------------------------------

  describe('warm-up', () => {
    it('FCC-029: warmUp resolves immediately if already warm', async () => {
      const source = createMockSource();
      controller.registerSource(source);

      // Set inPoint/outPoint so the frame range is valid
      controller.onPlaybackStateChange({ inPoint: 1, outPoint: 300 });

      // Pre-fill cache
      for (let i = 10; i < 14; i++) {
        source._cachedFrames.add(i);
      }

      await controller.warmUp(10, 1, 4);
      // Should resolve without timeout
    });

    it('FCC-030: warmUp resolves when frames are cached', async () => {
      const source = createMockSource({
        sourceId: 'sourceA',
        width: 1920,
        height: 1080,
        isHDR: false,
        totalFrames: 300,
        preloadFrames: vi.fn((frames: number[]) => {
          // Simulate async caching
          for (const f of frames) {
            source._cachedFrames.add(f);
          }
          // Notify controller that frames were cached
          for (const f of frames) {
            controller.onFrameCached(f, 1920 * 1080 * 4);
          }
        }),
      });
      controller.registerSource(source);
      controller.onPlaybackStateChange({ inPoint: 1, outPoint: 300 });

      await controller.warmUp(10, 1, 4);
      // Should resolve
    });

    it('FCC-031: warmUp rejects on timeout', async () => {
      vi.useFakeTimers();

      const source = createMockSource({
        sourceId: 'sourceA',
        width: 1920,
        height: 1080,
        isHDR: false,
        totalFrames: 300,
        preloadFrames: vi.fn(), // Never actually caches
      });
      controller.registerSource(source);

      const warmUpPromise = controller.warmUp(10, 1, 4);

      // Advance past timeout
      vi.advanceTimersByTime(6000);

      await expect(warmUpPromise).rejects.toThrow('Warm-up timeout');

      vi.useRealTimers();
    });

    it('FCC-032: warmUp resolves immediately in off mode', async () => {
      controller.setMode('off');
      await controller.warmUp(10, 1, 4);
      // Should resolve immediately
    });

    it('FCC-033: cancelWarmUp resolves pending warmup', async () => {
      const source = createMockSource({
        sourceId: 'sourceA',
        width: 1920,
        height: 1080,
        isHDR: false,
        totalFrames: 300,
        preloadFrames: vi.fn(),
      });
      controller.registerSource(source);

      const warmUpPromise = controller.warmUp(10, 1, 4);
      controller.cancelWarmUp();

      // Should resolve (not reject)
      await warmUpPromise;
    });

    it('FCC-034: onPlaybackStop cancels warm-up', async () => {
      const source = createMockSource({
        sourceId: 'sourceA',
        width: 1920,
        height: 1080,
        isHDR: false,
        totalFrames: 300,
        preloadFrames: vi.fn(),
      });
      controller.registerSource(source);

      const warmUpPromise = controller.warmUp(10, 1, 4);
      controller.onPlaybackStop();

      await warmUpPromise; // Should resolve
    });
  });

  // -------------------------------------------------------------------
  // Frame cached/evicted notifications
  // -------------------------------------------------------------------

  describe('frame notifications', () => {
    it('FCC-035: onFrameCached reports allocation to budget manager', () => {
      const spy = vi.spyOn(budgetManager, 'reportAllocation');
      controller.onFrameCached(1, 8 * MB);
      expect(spy).toHaveBeenCalledWith(8 * MB);
    });

    it('FCC-036: onFrameEvicted reports deallocation to budget manager', () => {
      const spy = vi.spyOn(budgetManager, 'reportDeallocation');
      controller.onFrameEvicted(1, 8 * MB);
      expect(spy).toHaveBeenCalledWith(8 * MB);
    });

    it('FCC-037: onFrameCached emits stateChanged', () => {
      const listener = vi.fn();
      controller.on('stateChanged', listener);
      controller.onFrameCached(1, 8 * MB);
      expect(listener).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Cache state
  // -------------------------------------------------------------------

  describe('getCacheState', () => {
    it('FCC-038: returns complete cache state', () => {
      const source = createMockSource();
      controller.registerSource(source);
      source._cachedFrames.add(1);
      source._cachedFrames.add(2);

      const state = controller.getCacheState();
      expect(state.mode).toBe('lookahead');
      expect(state.totalBudgetBytes).toBe(512 * MB);
      expect(state.cachedFrameCount).toBe(2);
      expect(state.isWarming).toBe(false);
      expect(state.pressureLevel).toBe('normal');
    });

    it('FCC-039: aggregates frame counts across sources', () => {
      const sourceA = createMockSource({ sourceId: 'sourceA' });
      const sourceB = createMockSource({ sourceId: 'sourceB' });
      controller.registerSource(sourceA);
      controller.registerSource(sourceB);

      sourceA._cachedFrames.add(1);
      sourceA._cachedFrames.add(2);
      sourceB._cachedFrames.add(1);

      const state = controller.getCacheState();
      expect(state.cachedFrameCount).toBe(3);
    });
  });

  // -------------------------------------------------------------------
  // Pressure events
  // -------------------------------------------------------------------

  describe('pressure forwarding', () => {
    it('FCC-040: forwards pressure events from budget manager', () => {
      const listener = vi.fn();
      controller.on('pressureChanged', listener);

      budgetManager.reportAllocation(Math.ceil(512 * MB * 0.85));
      expect(listener).toHaveBeenCalledWith('high');
    });
  });

  // -------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------

  describe('configuration', () => {
    it('FCC-041: getConfig returns current config', () => {
      const config = controller.getConfig();
      expect(config.mode).toBe('lookahead');
      expect(config.memoryBudgetBytes).toBe(512 * MB);
    });

    it('FCC-042: updateConfig updates settings', () => {
      controller.updateConfig({ minPrerollFrames: 12 });
      expect(controller.getConfig().minPrerollFrames).toBe(12);
    });

    it('FCC-043: updateConfig with budget updates budget manager', () => {
      controller.updateConfig({ memoryBudgetBytes: 1 * GB });
      expect(budgetManager.getTotalBudget()).toBe(1 * GB);
    });
  });

  // -------------------------------------------------------------------
  // Visibility handling
  // -------------------------------------------------------------------

  describe('visibility handling', () => {
    it('FCC-044: onTabHidden evicts lookahead frames', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('lookahead');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      // Add distant frames
      source._cachedFrames.add(200);
      source._cachedFrames.add(250);

      controller.onTabHidden();

      // Far frames should be evicted
      expect(source.evictFrames).toHaveBeenCalled();
    });

    it('FCC-045: onTabVisible triggers preload', () => {
      const source = createMockSource({
        sourceId: 'sourceA',
        width: 1920,
        height: 1080,
        isHDR: false,
        totalFrames: 300,
        // Do not auto-cache so region frames remain uncached
        preloadFrames: vi.fn(),
      });
      controller.registerSource(source);
      controller.setMode('region');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      // Reset mock after initial preload trigger
      (source.preloadFrames as ReturnType<typeof vi.fn>).mockClear();

      controller.onTabVisible();

      expect(source.preloadFrames).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Multi-source coordination
  // -------------------------------------------------------------------

  describe('multi-source coordination', () => {
    it('FCC-046: both sources share same budget manager', () => {
      const sourceA = createMockSource({ sourceId: 'sourceA' });
      const sourceB = createMockSource({ sourceId: 'sourceB' });
      controller.registerSource(sourceA);
      controller.registerSource(sourceB);

      controller.onFrameCached(1, 100 * MB); // source A frame
      controller.onFrameCached(1, 100 * MB); // source B frame

      expect(budgetManager.getCurrentUsage()).toBe(200 * MB);
    });

    it('FCC-047: active source gets preload priority', () => {
      const sourceA = createMockSource({ sourceId: 'sourceA' });
      const sourceB = createMockSource({ sourceId: 'sourceB' });
      controller.registerSource(sourceA);
      controller.registerSource(sourceB);

      controller.setActiveSource('sourceB');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      // Source B should receive preload calls
      expect(sourceB.preloadFrames).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Throughput tracking
  // -------------------------------------------------------------------

  describe('throughput tracking', () => {
    it('FCC-048: getDecodeThroughput returns 0 with no data', () => {
      expect(controller.getDecodeThroughput()).toBe(0);
    });

    it('FCC-049: getDecodeThroughput calculates from decode timings', () => {
      // Simulate multiple frame decode notifications
      for (let i = 0; i < 5; i++) {
        controller.onFrameCached(i, 1000);
      }

      // Throughput should be non-negative (depends on timing)
      expect(controller.getDecodeThroughput()).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  describe('lifecycle', () => {
    it('FCC-050: dispose cleans up all state', () => {
      const source = createMockSource();
      controller.registerSource(source);

      controller.dispose();

      expect(controller.getRegisteredSourceIds()).toHaveLength(0);
      expect(controller.getDecodeThroughput()).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // Edge cases and integration scenarios
  // -------------------------------------------------------------------

  describe('edge cases', () => {
    it('FCC-051: handles rapid seek across entire timeline', () => {
      const source = createMockSource();
      controller.registerSource(source);

      // Set valid in/out range first
      controller.onPlaybackStateChange({ inPoint: 1, outPoint: 300 });

      // Rapid seeks
      for (let i = 0; i < 10; i++) {
        controller.onSeek(i * 30 + 1);
      }

      // Should not throw, region should be valid
      const region = controller.getRegion();
      expect(region.start).toBeLessThanOrEqual(region.end);
    });

    it('FCC-052: handles source with zero dimensions gracefully', () => {
      const source = createMockSource({ width: 0, height: 0 });
      controller.registerSource(source);
      controller.onPlaybackStateChange({ currentFrame: 1, inPoint: 1, outPoint: 10 });

      // Should not throw
      const region = controller.getRegion();
      expect(region.start).toBeDefined();
    });

    it('FCC-053: handles mode switch during playback', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.onPlaybackStart(1, 1, 50);

      // Switch modes rapidly
      controller.setMode('off');
      controller.setMode('region');
      controller.setMode('lookahead');

      expect(controller.getMode()).toBe('lookahead');
    });

    it('FCC-054: handles unregister during active preload', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.onPlaybackStart(1, 1, 50);

      // Unregister while preloading
      controller.unregisterSource('sourceA');

      // Should not throw
      controller.onPlaybackStateChange({ currentFrame: 51 });
    });

    it('FCC-055: stateChanged event contains valid snapshot', () => {
      const source = createMockSource();
      controller.registerSource(source);

      const states: ReturnType<typeof controller.getCacheState>[] = [];
      controller.on('stateChanged', (state) => {
        states.push(state);
      });

      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      expect(states.length).toBeGreaterThan(0);
      const lastState = states[states.length - 1]!;
      expect(lastState.playheadFrame).toBe(50);
      expect(lastState.mode).toBe('lookahead');
    });

    it('FCC-056: getBudgetManager returns the budget manager', () => {
      expect(controller.getBudgetManager()).toBe(budgetManager);
    });

    it('FCC-057: controller creates own budget manager if none provided', () => {
      const c = new FrameCacheController({ memoryBudgetBytes: 256 * MB });
      expect(c.getBudgetManager()).toBeDefined();
      expect(c.getBudgetManager().getTotalBudget()).toBe(256 * MB);
      c.dispose();
    });
  });
});
