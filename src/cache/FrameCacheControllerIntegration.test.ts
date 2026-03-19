/**
 * Integration tests for FrameCacheController production wiring.
 *
 * Verifies that FrameCacheController is properly instantiated and wired
 * to the session, keyboard shortcuts, and visibility events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameCacheController, type CacheSourceInfo } from './FrameCacheController';
import { MemoryBudgetManager } from './MemoryBudgetManager';
import { MB, CACHE_MODE_CYCLE, CACHE_MODE_LABELS } from '../config/CacheConfig';
import { buildActionHandlers, type KeyboardActionDeps } from '../services/KeyboardActionMap';

// Mock getThemeManager for buildActionHandlers
const mockThemeManager = { cycleMode: vi.fn() };
vi.mock('../utils/ui/ThemeManager', () => ({
  getThemeManager: () => mockThemeManager,
}));
// Mock getGlobalHistoryManager for buildActionHandlers
vi.mock('../utils/HistoryManager', () => ({
  getGlobalHistoryManager: () => ({
    canUndo: () => false,
    canRedo: () => false,
    undo: vi.fn(),
    redo: vi.fn(),
  }),
}));

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

// ---------------------------------------------------------------------------
// Helpers for KeyboardActionDeps
// ---------------------------------------------------------------------------

function createMinimalDeps(
  frameCacheController: FrameCacheController,
): KeyboardActionDeps {
  const noop = vi.fn();
  return {
    session: {
      currentFrame: 10,
      currentSourceIndex: 0,
      loopMode: 'once' as const,
      togglePlayback: noop, stepForward: noop, stepBackward: noop,
      togglePlayDirection: noop, goToStart: noop, goToEnd: noop,
      decreaseSpeed: noop, increaseSpeed: noop, pause: noop,
      setInPoint: noop, setOutPoint: noop, toggleMark: noop,
      resetInOutPoints: noop, goToFrame: noop, toggleAB: noop,
      toggleMute: noop, togglePlaybackMode: noop,
      noteManager: { getNextNoteFrame: noop, getPreviousNoteFrame: noop },
    },
    viewer: {
      smoothFitToWindow: noop, smoothFitToWidth: noop, smoothFitToHeight: noop,
      smoothSetZoom: noop, smoothSetPixelRatio: noop, refresh: noop,
      copyFrameToClipboard: noop,
      getPixelProbe: () => ({ toggle: noop }),
      getFalseColor: () => ({ toggle: noop }),
      getTimecodeOverlay: () => ({ toggle: noop }),
      getInfoStripOverlay: () => ({ toggle: noop, togglePathMode: noop }),
      getFPSIndicator: () => ({ toggle: noop }),
      getZebraStripes: () => ({ toggle: noop }),
      getColorWheels: () => ({ toggle: noop }),
      getSpotlightOverlay: () => ({ toggle: noop }),
      getHSLQualifier: () => ({ toggle: noop }),
      getLuminanceVisualization: () => ({ cycleMode: noop }),
      getImageData: () => null,
      toggleFilterMode: noop,
    },
    paintEngine: { undo: noop, redo: noop },
    tabBar: { activeTab: 'view', setActiveTab: noop },
    controls: {
      playlistManager: { isEnabled: () => false },
      paintToolbar: { handleKeyboard: noop },
      channelSelect: { handleKeyboard: noop },
      compareControl: { cycleWipeMode: noop, toggleDifferenceMatte: noop, toggleSplitScreen: noop, isDropdownVisible: () => false, close: noop },
      scopesControl: { toggleScope: noop },
      ghostFrameControl: { toggle: noop },
      parControl: { toggle: noop },
      backgroundPatternControl: { cyclePattern: noop, toggleCheckerboard: noop },
      colorControls: { toggle: noop, hide: noop },
      filterControl: { toggle: noop, isOpen: false, hide: noop },
      curvesControl: { toggle: noop, hide: noop },
      cropControl: { toggle: noop, hidePanel: noop },
      ocioControl: { toggle: noop, hide: noop },
      displayProfileControl: { cycleProfile: noop, isDropdownVisible: () => false, closeDropdown: noop },
      transformControl: { rotateLeft: noop, rotateRight: noop, toggleFlipH: noop, toggleFlipV: noop, setRotation: noop },
      toneMappingControl: { toggle: noop },
      colorInversionToggle: { toggle: noop },
      historyPanel: { toggle: noop },
      markerListPanel: { toggle: noop },
      infoPanel: { toggle: noop, isEnabled: () => false },
      snapshotPanel: { toggle: noop },
      playlistPanel: { toggle: noop },
      notePanel: { toggle: noop, addNoteAtCurrentFrame: noop, isVisible: () => false, hide: noop },
      presentationMode: { toggle: noop, getState: () => ({ enabled: false }) },
      networkControl: { togglePanel: noop, closePanel: noop },
      networkSyncManager: { isConnected: false, leaveRoom: noop },
      stereoControl: { handleKeyboard: noop },
      stereoEyeTransformControl: { handleKeyboard: noop, isPanelVisible: () => false, hidePanel: noop },
      stereoAlignControl: { handleKeyboard: noop },
      safeAreasControl: { getOverlay: () => ({ toggle: noop }) },
      lutPipelinePanel: { toggle: noop, getIsVisible: () => false, hide: noop },
      shotGridPanel: { isOpen: () => false, hide: noop },
      referenceManager: { captureReference: noop, enable: noop, toggle: noop },
      isNoiseReductionPanelVisible: () => false,
      hideNoiseReductionPanel: noop,
      isWatermarkPanelVisible: () => false,
      hideWatermarkPanel: noop,
      isTimelineEditorPanelVisible: () => false,
      hideTimelineEditorPanel: noop,
      isSlateEditorPanelVisible: () => false,
      hideSlateEditorPanel: noop,
      timelineMagnifier: { toggle: noop },
      gotoFrameOverlay: { show: noop },
    },
    activeContextManager: { isContextActive: () => false },
    fullscreenManager: { toggle: noop },
    focusManager: { focusNextZone: noop, focusPreviousZone: noop },
    shortcutCheatSheet: { toggle: noop, isVisible: () => false, hide: noop },
    persistenceManager: { createQuickSnapshot: noop },
    sessionBridge: { updateInfoPanel: noop },
    layoutStore: { applyPreset: noop },
    externalPresentation: { openWindow: noop },
    headerBar: { getExportControl: () => ({ quickExport: noop }), navigateVersion: noop },
    frameNavigation: {
      goToNextAnnotation: noop, goToPreviousAnnotation: noop,
      goToPlaylistStart: noop, goToPlaylistEnd: noop,
      goToNextMarkOrBoundary: noop, goToPreviousMarkOrBoundary: noop,
      goToNextShot: noop, goToPreviousShot: noop,
      shiftRangeToNext: () => null, shiftRangeToPrevious: () => null,
    },
    frameCacheController,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FrameCacheController Production Integration', () => {
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
  // Instantiation
  // -------------------------------------------------------------------

  describe('instantiation', () => {
    it('FCCI-001: FrameCacheController can be instantiated with default config', () => {
      const c = new FrameCacheController();
      expect(c.getMode()).toBe('lookahead'); // DEFAULT_CACHE_CONFIG.mode
      expect(c.getBudgetManager()).toBeDefined();
      c.dispose();
    });

    it('FCCI-002: FrameCacheController can be instantiated with custom config', () => {
      expect(controller.getMode()).toBe('lookahead');
      expect(controller.getBudgetManager()).toBe(budgetManager);
      expect(controller.getConfig().memoryBudgetBytes).toBe(512 * MB);
    });

    it('FCCI-003: FrameCacheController is properly wired to budget manager', () => {
      const pressureListener = vi.fn();
      controller.on('pressureChanged', pressureListener);

      // Push budget to high pressure
      budgetManager.reportAllocation(Math.ceil(512 * MB * 0.85));
      expect(pressureListener).toHaveBeenCalledWith('high');
    });
  });

  // -------------------------------------------------------------------
  // Cache mode cycling (Shift+C keyboard shortcut)
  // -------------------------------------------------------------------

  describe('cache mode cycling via keyboard action', () => {
    it('FCCI-004: cache.cycleCacheMode action is registered in action handlers', () => {
      const deps = createMinimalDeps(controller);
      const handlers = buildActionHandlers(deps);

      expect(handlers['cache.cycleCacheMode']).toBeDefined();
      expect(typeof handlers['cache.cycleCacheMode']).toBe('function');
    });

    it('FCCI-005: cache.cycleCacheMode cycles through all modes', () => {
      const deps = createMinimalDeps(controller);
      const handlers = buildActionHandlers(deps);

      // Start at lookahead
      expect(controller.getMode()).toBe('lookahead');

      // Cycle: lookahead -> off
      handlers['cache.cycleCacheMode']!();
      expect(controller.getMode()).toBe('off');

      // Cycle: off -> region
      handlers['cache.cycleCacheMode']!();
      expect(controller.getMode()).toBe('region');

      // Cycle: region -> lookahead
      handlers['cache.cycleCacheMode']!();
      expect(controller.getMode()).toBe('lookahead');
    });

    it('FCCI-006: cache.cycleCacheMode emits modeChanged event', () => {
      const deps = createMinimalDeps(controller);
      const handlers = buildActionHandlers(deps);
      const listener = vi.fn();
      controller.on('modeChanged', listener);

      handlers['cache.cycleCacheMode']!();

      expect(listener).toHaveBeenCalledWith('off');
    });

    it('FCCI-007: CACHE_MODE_CYCLE covers all modes in order', () => {
      expect(CACHE_MODE_CYCLE).toEqual(['off', 'region', 'lookahead']);
    });

    it('FCCI-008: CACHE_MODE_LABELS provides labels for all modes', () => {
      for (const mode of CACHE_MODE_CYCLE) {
        expect(CACHE_MODE_LABELS[mode]).toBeDefined();
        expect(typeof CACHE_MODE_LABELS[mode]).toBe('string');
      }
    });

    it('FCCI-009: cache.cycleCacheMode is safe when frameCacheController is null', () => {
      const deps = createMinimalDeps(controller);
      deps.frameCacheController = null;
      const handlers = buildActionHandlers(deps);

      // Should not throw
      expect(() => handlers['cache.cycleCacheMode']!()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------
  // Session frame cache integration
  // -------------------------------------------------------------------

  describe('session integration', () => {
    it('FCCI-010: controller tracks playback state changes', () => {
      controller.onPlaybackStateChange({
        currentFrame: 50,
        inPoint: 1,
        outPoint: 300,
        isPlaying: true,
        direction: 1,
        speed: 1,
      });

      const info = controller.getPlaybackInfo();
      expect(info.currentFrame).toBe(50);
      expect(info.inPoint).toBe(1);
      expect(info.outPoint).toBe(300);
      expect(info.isPlaying).toBe(true);
    });

    it('FCCI-011: controller responds to playback start', () => {
      const source = createMockSource();
      controller.registerSource(source);

      controller.onPlaybackStart(1, 1, 10);

      const info = controller.getPlaybackInfo();
      expect(info.isPlaying).toBe(true);
      expect(info.currentFrame).toBe(10);
      expect(info.direction).toBe(1);
    });

    it('FCCI-012: controller responds to playback stop', () => {
      controller.onPlaybackStart(1, 1, 10);
      controller.onPlaybackStop();

      expect(controller.getPlaybackInfo().isPlaying).toBe(false);
    });

    it('FCCI-013: controller responds to seek', () => {
      controller.onSeek(100);
      expect(controller.getPlaybackInfo().currentFrame).toBe(100);
    });

    it('FCCI-014: controller tracks speed changes', () => {
      controller.onPlaybackStateChange({ speed: 2 });
      expect(controller.getPlaybackInfo().speed).toBe(2);
    });

    it('FCCI-015: controller emits stateChanged on frame changes', () => {
      const source = createMockSource();
      controller.registerSource(source);
      const stateListener = vi.fn();
      controller.on('stateChanged', stateListener);

      controller.onPlaybackStateChange({ currentFrame: 42, inPoint: 1, outPoint: 300 });

      expect(stateListener).toHaveBeenCalled();
      const state = stateListener.mock.calls[0]![0];
      expect(state.playheadFrame).toBe(42);
    });
  });

  // -------------------------------------------------------------------
  // Memory pressure management
  // -------------------------------------------------------------------

  describe('memory pressure management', () => {
    it('FCCI-016: pressure level changes from normal to high', () => {
      const pressureListener = vi.fn();
      controller.on('pressureChanged', pressureListener);

      // Allocate 85% of budget -> high pressure
      budgetManager.reportAllocation(Math.ceil(512 * MB * 0.85));

      expect(pressureListener).toHaveBeenCalledWith('high');
    });

    it('FCCI-017: pressure level changes from high to critical', () => {
      const pressureListener = vi.fn();
      controller.on('pressureChanged', pressureListener);

      // Allocate 96% of budget -> critical
      budgetManager.reportAllocation(Math.ceil(512 * MB * 0.96));

      expect(pressureListener).toHaveBeenCalledWith('critical');
    });

    it('FCCI-018: emergency eviction fires under critical pressure', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('off'); // small region
      controller.onPlaybackStateChange({
        currentFrame: 50,
        inPoint: 1,
        outPoint: 300,
      });

      // Fill cache with many frames
      for (let i = 1; i <= 100; i++) {
        source._cachedFrames.add(i);
      }

      controller.emergencyEviction();

      expect(source.evictFrames).toHaveBeenCalled();
      expect(source._cachedFrames.size).toBeLessThan(100);
    });

    it('FCCI-019: budget manager tracks allocations and deallocations', () => {
      controller.onFrameCached(1, 8 * MB);
      expect(budgetManager.getCurrentUsage()).toBe(8 * MB);

      controller.onFrameEvicted(1, 8 * MB);
      expect(budgetManager.getCurrentUsage()).toBe(0);
    });

    it('FCCI-020: getCacheState reflects current pressure level', () => {
      budgetManager.reportAllocation(Math.ceil(512 * MB * 0.85));
      const state = controller.getCacheState();
      expect(state.pressureLevel).toBe('high');
    });
  });

  // -------------------------------------------------------------------
  // Visibility handling integration
  // -------------------------------------------------------------------

  describe('visibility handling', () => {
    it('FCCI-021: onTabHidden evicts lookahead frames outside region', () => {
      const source = createMockSource();
      controller.registerSource(source);
      controller.setMode('lookahead');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      // Add distant frames
      source._cachedFrames.add(200);
      source._cachedFrames.add(250);

      controller.onTabHidden();

      expect(source.evictFrames).toHaveBeenCalled();
    });

    it('FCCI-022: onTabVisible triggers preload in region mode', () => {
      const source = createMockSource({
        sourceId: 'sourceA',
        width: 1920,
        height: 1080,
        isHDR: false,
        totalFrames: 300,
        preloadFrames: vi.fn(),
      });
      controller.registerSource(source);
      controller.setMode('region');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      (source.preloadFrames as ReturnType<typeof vi.fn>).mockClear();

      controller.onTabVisible();

      expect(source.preloadFrames).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Multi-source coordination
  // -------------------------------------------------------------------

  describe('multi-source with shared budget', () => {
    it('FCCI-023: multiple sources share the same budget', () => {
      const sourceA = createMockSource({ sourceId: 'sourceA' });
      const sourceB = createMockSource({ sourceId: 'sourceB' });
      controller.registerSource(sourceA);
      controller.registerSource(sourceB);

      controller.onFrameCached(1, 50 * MB);
      controller.onFrameCached(1, 50 * MB);

      expect(budgetManager.getCurrentUsage()).toBe(100 * MB);
    });

    it('FCCI-024: active source switch is tracked', () => {
      const sourceA = createMockSource({ sourceId: 'sourceA' });
      const sourceB = createMockSource({ sourceId: 'sourceB' });
      controller.registerSource(sourceA);
      controller.registerSource(sourceB);

      controller.setActiveSource('sourceB');
      expect(controller.getActiveSourceId()).toBe('sourceB');
    });
  });

  // -------------------------------------------------------------------
  // Mode transition effects
  // -------------------------------------------------------------------

  describe('mode transition effects', () => {
    it('FCCI-025: switching to off mode evicts all but minimal buffer', () => {
      const source = createMockSource();
      controller.registerSource(source);

      // Add many cached frames
      for (let i = 1; i <= 50; i++) {
        source._cachedFrames.add(i);
      }

      controller.onPlaybackStateChange({ currentFrame: 25, inPoint: 1, outPoint: 300 });
      controller.setMode('off');

      // Only frames near playhead (24, 25, 26) should remain
      expect(source._cachedFrames.has(25)).toBe(true);
      expect(source._cachedFrames.has(1)).toBe(false);
      expect(source._cachedFrames.has(50)).toBe(false);
    });

    it('FCCI-026: switching from off to region triggers preload', () => {
      const source = createMockSource({
        sourceId: 'sourceA',
        width: 1920,
        height: 1080,
        isHDR: false,
        totalFrames: 300,
        preloadFrames: vi.fn(),
      });
      controller.registerSource(source);
      controller.setMode('off');
      controller.onPlaybackStateChange({ currentFrame: 50, inPoint: 1, outPoint: 300 });

      (source.preloadFrames as ReturnType<typeof vi.fn>).mockClear();

      controller.setMode('region');
      // Trigger a frame change to cause preloading
      controller.onPlaybackStateChange({ currentFrame: 50 });

      expect(source.preloadFrames).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  describe('lifecycle', () => {
    it('FCCI-027: dispose cleans up all resources', () => {
      const source = createMockSource();
      controller.registerSource(source);

      controller.dispose();

      expect(controller.getRegisteredSourceIds()).toHaveLength(0);
      expect(controller.getDecodeThroughput()).toBe(0);
    });

    it('FCCI-028: dispose is safe to call multiple times', () => {
      controller.dispose();
      expect(() => controller.dispose()).not.toThrow();
    });
  });
});
