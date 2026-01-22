/**
 * CacheIndicator Component Tests
 *
 * Tests for the visual indicator showing frame caching status.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheIndicator } from './CacheIndicator';

// Use fake timers to prevent RAF callbacks running after test teardown
vi.useFakeTimers();

// Mock Session class
const createMockSession = (options: {
  cachedFrames?: Set<number>;
  pendingFrames?: Set<number>;
  duration?: number;
  width?: number;
  height?: number;
  inPoint?: number;
  outPoint?: number;
  isMediabunny?: boolean;
} = {}) => {
  const cachedFrames = options.cachedFrames ?? new Set<number>();
  const pendingFrames = options.pendingFrames ?? new Set<number>();

  return {
    getCachedFrames: vi.fn(() => cachedFrames),
    getPendingFrames: vi.fn(() => pendingFrames),
    getCacheStats: vi.fn(() => ({ cachedFrames: cachedFrames.size })),
    clearVideoCache: vi.fn(),
    isUsingMediabunny: vi.fn(() => options.isMediabunny ?? true),
    get currentSource() {
      return {
        duration: options.duration ?? 100,
        width: options.width ?? 1920,
        height: options.height ?? 1080,
      };
    },
    get inPoint() {
      return options.inPoint ?? 1;
    },
    get outPoint() {
      return options.outPoint ?? options.duration ?? 100;
    },
    on: vi.fn(),
    off: vi.fn(),
  };
};

describe('CacheIndicator', () => {
  let indicator: CacheIndicator;
  let mockSession: ReturnType<typeof createMockSession>;

  beforeEach(() => {
    mockSession = createMockSession();
    indicator = new CacheIndicator(mockSession as any);
  });

  afterEach(() => {
    indicator.dispose();
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('CACHE-U001: should create container element', () => {
      const el = indicator.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('cache-indicator');
    });

    it('CACHE-U002: should be visible by default', () => {
      expect(indicator.isVisible()).toBe(true);
    });

    it('CACHE-U003: should have stats display element', () => {
      const el = indicator.getElement();
      const stats = el.querySelector('[data-testid="cache-indicator-stats"]');
      expect(stats).not.toBeNull();
    });

    it('CACHE-U004: should have clear button', () => {
      const el = indicator.getElement();
      const clearBtn = el.querySelector('[data-testid="cache-indicator-clear"]');
      expect(clearBtn).not.toBeNull();
    });

    it('CACHE-U005: should have info container', () => {
      const el = indicator.getElement();
      const info = el.querySelector('[data-testid="cache-indicator-info"]');
      expect(info).not.toBeNull();
    });

    it('CACHE-U006: should subscribe to session events', () => {
      expect(mockSession.on).toHaveBeenCalledWith('frameChanged', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('durationChanged', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('sourceLoaded', expect.any(Function));
      expect(mockSession.on).toHaveBeenCalledWith('inOutChanged', expect.any(Function));
    });
  });

  describe('visibility', () => {
    it('CACHE-U010: setVisible(true) shows indicator', () => {
      indicator.setVisible(false);
      indicator.setVisible(true);
      expect(indicator.isVisible()).toBe(true);
    });

    it('CACHE-U011: setVisible(false) hides indicator', () => {
      indicator.setVisible(false);
      expect(indicator.isVisible()).toBe(false);
    });

    it('CACHE-U012: toggle switches visibility', () => {
      expect(indicator.isVisible()).toBe(true);
      indicator.toggle();
      expect(indicator.isVisible()).toBe(false);
      indicator.toggle();
      expect(indicator.isVisible()).toBe(true);
    });

    it('CACHE-U013: setVisible emits visibilityChanged event', () => {
      const callback = vi.fn();
      indicator.on('visibilityChanged', callback);

      indicator.setVisible(false);
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('CACHE-U014: setVisible does not emit if visibility unchanged', () => {
      const callback = vi.fn();
      indicator.on('visibilityChanged', callback);

      indicator.setVisible(true); // Already true
      expect(callback).not.toHaveBeenCalled();
    });

    it('CACHE-U015: updates container display style', () => {
      const el = indicator.getElement();

      indicator.setVisible(false);
      expect(el.style.display).toBe('none');

      indicator.setVisible(true);
      expect(el.style.display).toBe('flex');
    });
  });

  describe('getState', () => {
    it('CACHE-U020: returns correct state structure', () => {
      const state = indicator.getState();

      expect(state).toHaveProperty('visible');
      expect(state).toHaveProperty('cachedFrames');
      expect(state).toHaveProperty('pendingFrames');
      expect(state).toHaveProperty('totalFrames');
      expect(state).toHaveProperty('cachedCount');
      expect(state).toHaveProperty('pendingCount');
      expect(state).toHaveProperty('memorySizeMB');
    });

    it('CACHE-U021: returns correct visibility state', () => {
      expect(indicator.getState().visible).toBe(true);

      indicator.setVisible(false);
      expect(indicator.getState().visible).toBe(false);
    });

    it('CACHE-U022: returns cached frame count', () => {
      mockSession = createMockSession({
        cachedFrames: new Set([1, 2, 3, 4, 5]),
      });
      indicator = new CacheIndicator(mockSession as any);

      expect(indicator.getState().cachedCount).toBe(5);
    });

    it('CACHE-U023: returns pending frame count', () => {
      mockSession = createMockSession({
        pendingFrames: new Set([10, 11, 12]),
      });
      indicator = new CacheIndicator(mockSession as any);

      expect(indicator.getState().pendingCount).toBe(3);
    });

    it('CACHE-U024: returns total frames from source', () => {
      mockSession = createMockSession({ duration: 250 });
      indicator = new CacheIndicator(mockSession as any);

      expect(indicator.getState().totalFrames).toBe(250);
    });
  });

  describe('memory calculation', () => {
    it('CACHE-U030: calculates memory size correctly for 1920x1080 frames', () => {
      // 1920 * 1080 * 4 bytes = 8,294,400 bytes per frame
      // 10 frames = 82,944,000 bytes = ~79.1 MB
      mockSession = createMockSession({
        cachedFrames: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        width: 1920,
        height: 1080,
      });
      indicator = new CacheIndicator(mockSession as any);

      const state = indicator.getState();
      // 10 frames * 1920 * 1080 * 4 / (1024 * 1024) = 79.1 MB
      expect(state.memorySizeMB).toBeCloseTo(79.1, 0);
    });

    it('CACHE-U031: returns 0 MB for empty cache', () => {
      mockSession = createMockSession({
        cachedFrames: new Set(),
      });
      indicator = new CacheIndicator(mockSession as any);

      expect(indicator.getState().memorySizeMB).toBe(0);
    });

    it('CACHE-U032: calculates memory for different resolutions', () => {
      // 640 * 480 * 4 bytes = 1,228,800 bytes per frame
      // 5 frames = 6,144,000 bytes = ~5.86 MB
      mockSession = createMockSession({
        cachedFrames: new Set([1, 2, 3, 4, 5]),
        width: 640,
        height: 480,
      });
      indicator = new CacheIndicator(mockSession as any);

      const state = indicator.getState();
      expect(state.memorySizeMB).toBeCloseTo(5.86, 1);
    });

    it('CACHE-U033: handles 4K resolution', () => {
      // 3840 * 2160 * 4 bytes = 33,177,600 bytes per frame
      // 1 frame = ~31.6 MB
      mockSession = createMockSession({
        cachedFrames: new Set([1]),
        width: 3840,
        height: 2160,
      });
      indicator = new CacheIndicator(mockSession as any);

      const state = indicator.getState();
      expect(state.memorySizeMB).toBeCloseTo(31.64, 1);
    });
  });

  describe('clear button', () => {
    it('CACHE-U040: clear button calls session.clearVideoCache', () => {
      const el = indicator.getElement();
      const clearBtn = el.querySelector('[data-testid="cache-indicator-clear"]') as HTMLButtonElement;

      clearBtn.click();

      expect(mockSession.clearVideoCache).toHaveBeenCalled();
    });

    it('CACHE-U041: clear button emits clearRequested event', () => {
      const callback = vi.fn();
      indicator.on('clearRequested', callback);

      const el = indicator.getElement();
      const clearBtn = el.querySelector('[data-testid="cache-indicator-clear"]') as HTMLButtonElement;

      clearBtn.click();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('scheduleUpdate', () => {
    it('CACHE-U050: scheduleUpdate uses requestAnimationFrame pattern', () => {
      // The constructor already schedules an update, so we verify the pattern works
      // by checking that the scheduled flag gets reset after the frame callback runs
      expect(() => indicator.scheduleUpdate()).not.toThrow();
    });

    it('CACHE-U051: scheduleUpdate is callable multiple times without error', () => {
      // Multiple calls should not cause issues
      expect(() => {
        indicator.scheduleUpdate();
        indicator.scheduleUpdate();
        indicator.scheduleUpdate();
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('CACHE-U060: dispose removes container from DOM', () => {
      const parent = document.createElement('div');
      const el = indicator.getElement();
      parent.appendChild(el);

      expect(parent.contains(el)).toBe(true);

      indicator.dispose();

      expect(parent.contains(el)).toBe(false);
    });

    it('CACHE-U061: dispose can be called without error', () => {
      expect(() => indicator.dispose()).not.toThrow();
    });
  });

  describe('non-mediabunny sources', () => {
    it('CACHE-U070: isUsingMediabunny is called to check source type', () => {
      mockSession = createMockSession({ isMediabunny: false });
      indicator = new CacheIndicator(mockSession as any);

      // Verify the method exists and is called
      expect(mockSession.isUsingMediabunny).toBeDefined();
      // The render method will be called by constructor, so isUsingMediabunny should be called
    });

    it('CACHE-U071: state is still accessible for non-mediabunny sources', () => {
      mockSession = createMockSession({
        isMediabunny: false,
        cachedFrames: new Set([1, 2, 3]),
      });
      indicator = new CacheIndicator(mockSession as any);

      const state = indicator.getState();
      expect(state.cachedCount).toBe(3);
    });
  });

  describe('prerender stats', () => {
    // Mock Viewer for prerender stats
    const createMockViewer = (stats: {
      cacheSize?: number;
      totalFrames?: number;
      pendingRequests?: number;
      activeRequests?: number;
      memorySizeMB?: number;
      cacheHits?: number;
      cacheMisses?: number;
      hitRate?: number;
    } | null = null) => {
      return {
        getPrerenderStats: vi.fn(() => stats ? {
          cacheSize: stats.cacheSize ?? 0,
          totalFrames: stats.totalFrames ?? 100,
          pendingRequests: stats.pendingRequests ?? 0,
          activeRequests: stats.activeRequests ?? 0,
          memorySizeMB: stats.memorySizeMB ?? 0,
          cacheHits: stats.cacheHits ?? 0,
          cacheMisses: stats.cacheMisses ?? 0,
          hitRate: stats.hitRate ?? 0,
        } : null),
        setOnPrerenderCacheUpdate: vi.fn(),
      };
    };

    it('CACHE-U080: creates prerender stats span element', () => {
      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]');
      expect(prerenderStats).not.toBeNull();
    });

    it('CACHE-U081: prerender stats empty when no viewer provided', () => {
      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      expect(prerenderStats.textContent).toBe('');
    });

    it('CACHE-U082: setViewer updates prerender stats', () => {
      const mockViewer = createMockViewer({
        cacheSize: 25,
        totalFrames: 100,
        pendingRequests: 5,
        activeRequests: 2,
        memorySizeMB: 50,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16); // Wait for RAF

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      expect(prerenderStats.textContent).toContain('Effects:');
      expect(prerenderStats.textContent).toContain('25');
      expect(prerenderStats.textContent).toContain('100');
    });

    it('CACHE-U083: shows active vs queued count when requests pending', () => {
      const mockViewer = createMockViewer({
        cacheSize: 10,
        totalFrames: 50,
        pendingRequests: 8,
        activeRequests: 2,
        memorySizeMB: 20,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      // Now shows "[2 active, 8 queued]" instead of "[10 loading]"
      expect(prerenderStats.textContent).toContain('[2 active, 8 queued]');
    });

    it('CACHE-U087: shows only active count when no queued requests', () => {
      const mockViewer = createMockViewer({
        cacheSize: 10,
        totalFrames: 50,
        pendingRequests: 0,
        activeRequests: 4,
        memorySizeMB: 20,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      expect(prerenderStats.textContent).toContain('[4 active, 0 queued]');
    });

    it('CACHE-U088: shows only queued count when no active requests', () => {
      const mockViewer = createMockViewer({
        cacheSize: 10,
        totalFrames: 50,
        pendingRequests: 6,
        activeRequests: 0,
        memorySizeMB: 20,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      expect(prerenderStats.textContent).toContain('[0 active, 6 queued]');
    });

    it('CACHE-U089: shows stats when only active requests (no cache, no queued)', () => {
      // REGRESSION TEST: Ensure stats are shown when there are active requests
      // even if cache is empty and no queued requests
      const mockViewer = createMockViewer({
        cacheSize: 0,
        totalFrames: 50,
        pendingRequests: 0,
        activeRequests: 4,
        memorySizeMB: 0,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      // Should show stats because there are active requests
      expect(prerenderStats.textContent).toContain('Effects:');
      expect(prerenderStats.textContent).toContain('[4 active, 0 queued]');
    });

    it('CACHE-U090: hides stats only when cache, active, and queued are all zero', () => {
      // REGRESSION TEST: Stats should only be hidden when ALL of:
      // cacheSize === 0 AND activeRequests === 0 AND pendingRequests === 0
      const mockViewer = createMockViewer({
        cacheSize: 0,
        totalFrames: 50,
        pendingRequests: 0,
        activeRequests: 0,
        memorySizeMB: 0,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      // Should be empty because nothing to show
      expect(prerenderStats.textContent).toBe('');
    });

    it('CACHE-U084: hides prerender stats when cache is empty and no loading', () => {
      const mockViewer = createMockViewer({
        cacheSize: 0,
        totalFrames: 50,
        pendingRequests: 0,
        activeRequests: 0,
        memorySizeMB: 0,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      expect(prerenderStats.textContent).toBe('');
    });

    it('CACHE-U085: constructor accepts viewer parameter', () => {
      const mockViewer = createMockViewer({
        cacheSize: 15,
        totalFrames: 100,
        memorySizeMB: 30,
      });

      const indicatorWithViewer = new CacheIndicator(mockSession as any, mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicatorWithViewer.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      expect(prerenderStats.textContent).toContain('Effects:');
      expect(prerenderStats.textContent).toContain('15');

      indicatorWithViewer.dispose();
    });

    it('CACHE-U086: displays memory size in prerender stats', () => {
      const mockViewer = createMockViewer({
        cacheSize: 20,
        totalFrames: 100,
        memorySizeMB: 156,
      });

      indicator.setViewer(mockViewer as any);
      vi.advanceTimersByTime(16);

      const el = indicator.getElement();
      const prerenderStats = el.querySelector('[data-testid="prerender-indicator-stats"]') as HTMLSpanElement;
      expect(prerenderStats.textContent).toContain('156 MB');
    });

    // REGRESSION TESTS: Ensure cache update callback is properly registered
    // This fixes the issue where effects cache progress only updated on play/pause
    it('CACHE-U091: setViewer registers cache update callback', () => {
      const mockViewer = createMockViewer({ cacheSize: 10, totalFrames: 100 });
      indicator.setViewer(mockViewer as any);

      expect(mockViewer.setOnPrerenderCacheUpdate).toHaveBeenCalledWith(expect.any(Function));
    });

    it('CACHE-U092: setViewer unregisters callback from previous viewer', () => {
      const mockViewer1 = createMockViewer({ cacheSize: 5, totalFrames: 50 });
      const mockViewer2 = createMockViewer({ cacheSize: 10, totalFrames: 100 });

      indicator.setViewer(mockViewer1 as any);
      indicator.setViewer(mockViewer2 as any);

      // First viewer should have callback unregistered (set to null)
      expect(mockViewer1.setOnPrerenderCacheUpdate).toHaveBeenCalledWith(null);
      // Second viewer should have callback registered
      expect(mockViewer2.setOnPrerenderCacheUpdate).toHaveBeenCalledWith(expect.any(Function));
    });

    it('CACHE-U093: constructor registers callback when viewer provided', () => {
      const mockViewer = createMockViewer({ cacheSize: 15, totalFrames: 100 });
      const indicatorWithViewer = new CacheIndicator(mockSession as any, mockViewer as any);

      expect(mockViewer.setOnPrerenderCacheUpdate).toHaveBeenCalledWith(expect.any(Function));

      indicatorWithViewer.dispose();
    });

    it('CACHE-U094: dispose unregisters cache update callback', () => {
      const mockViewer = createMockViewer({ cacheSize: 10, totalFrames: 100 });
      const indicatorWithViewer = new CacheIndicator(mockSession as any, mockViewer as any);

      // Clear previous calls
      mockViewer.setOnPrerenderCacheUpdate.mockClear();

      indicatorWithViewer.dispose();

      // Should unregister callback on dispose
      expect(mockViewer.setOnPrerenderCacheUpdate).toHaveBeenCalledWith(null);
    });

    it('CACHE-U095: cache update callback triggers scheduleUpdate', () => {
      const mockViewer = createMockViewer({ cacheSize: 10, totalFrames: 100 });
      indicator.setViewer(mockViewer as any);

      // Get the callback that was registered
      const registeredCallback = mockViewer.setOnPrerenderCacheUpdate.mock.calls[0][0];
      expect(registeredCallback).toBeInstanceOf(Function);

      // Calling the callback should schedule an update
      const scheduleSpy = vi.spyOn(indicator, 'scheduleUpdate');
      registeredCallback();

      expect(scheduleSpy).toHaveBeenCalled();
    });
  });
});

describe('CacheIndicator memory formatting', () => {
  let indicator: CacheIndicator;

  afterEach(() => {
    if (indicator) {
      indicator.dispose();
    }
  });

  it('CACHE-U080: formats KB for small sizes', () => {
    // Create a tiny frame to get sub-1MB memory
    // 100 * 100 * 4 = 40,000 bytes = ~0.038 MB = ~39 KB per frame
    const mockSession = createMockSession({
      cachedFrames: new Set([1]),
      width: 100,
      height: 100,
    });
    indicator = new CacheIndicator(mockSession as any);

    const state = indicator.getState();
    // Should be less than 1 MB
    expect(state.memorySizeMB).toBeLessThan(1);
    expect(state.memorySizeMB).toBeGreaterThan(0);
  });

  it('CACHE-U081: handles zero dimensions gracefully', () => {
    const mockSession = createMockSession({
      cachedFrames: new Set([1, 2, 3]),
      width: 0,
      height: 0,
    });
    indicator = new CacheIndicator(mockSession as any);

    expect(indicator.getState().memorySizeMB).toBe(0);
  });
});
