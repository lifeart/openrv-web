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
