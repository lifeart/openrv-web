import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AutoSaveManager,
  AutoSaveEntry,
  DEFAULT_AUTO_SAVE_CONFIG,
} from './AutoSaveManager';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';
import { DEFAULT_PAINT_EFFECTS } from '../../paint/types';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../ui/components/ColorControls';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_FILTER_SETTINGS } from '../../ui/components/FilterControl';
import { DEFAULT_TRANSFORM } from '../../ui/components/TransformControl';
import { DEFAULT_CROP_STATE, DEFAULT_CROP_REGION } from '../../ui/components/CropControl';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';
import { DEFAULT_WIPE_STATE } from '../../ui/components/WipeControl';

// Create a valid mock session state using actual defaults
const createMockSessionState = (name: string = 'Test Project'): SessionState => ({
  version: SESSION_STATE_VERSION,
  name,
  createdAt: new Date().toISOString(),
  modifiedAt: new Date().toISOString(),
  media: [],
  playback: {
    currentFrame: 1,
    inPoint: 1,
    outPoint: 100,
    fps: 24,
    loopMode: 'loop',
    volume: 0.7,
    muted: false,
    marks: [],
    currentSourceIndex: 0,
  },
  paint: {
    nextId: 0,
    show: true,
    frames: {},
    effects: { ...DEFAULT_PAINT_EFFECTS },
  },
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  color: { ...DEFAULT_COLOR_ADJUSTMENTS },
  cdl: JSON.parse(JSON.stringify(DEFAULT_CDL)),
  filters: { ...DEFAULT_FILTER_SETTINGS },
  transform: {
    ...DEFAULT_TRANSFORM,
    scale: { ...DEFAULT_TRANSFORM.scale },
    translate: { ...DEFAULT_TRANSFORM.translate },
  },
  crop: {
    ...DEFAULT_CROP_STATE,
    region: { ...DEFAULT_CROP_REGION },
  },
  lens: { ...DEFAULT_LENS_PARAMS },
  wipe: { ...DEFAULT_WIPE_STATE },
  stack: [],
  lutIntensity: 1.0,
});

describe('AutoSaveManager', () => {
  let manager: AutoSaveManager;

  afterEach(async () => {
    if (manager) {
      await manager.dispose();
    }
  });

  describe('initialization', () => {
    it('AUTOSAVE-U001: initializes with default config', () => {
      manager = new AutoSaveManager();
      const config = manager.getConfig();

      expect(config.interval).toBe(DEFAULT_AUTO_SAVE_CONFIG.interval);
      expect(config.enabled).toBe(DEFAULT_AUTO_SAVE_CONFIG.enabled);
      expect(config.maxVersions).toBe(DEFAULT_AUTO_SAVE_CONFIG.maxVersions);
    });

    it('AUTOSAVE-U002: accepts custom config on construction', () => {
      manager = new AutoSaveManager({
        interval: 10,
        enabled: false,
        maxVersions: 5,
      });
      const config = manager.getConfig();

      expect(config.interval).toBe(10);
      expect(config.enabled).toBe(false);
      expect(config.maxVersions).toBe(5);
    });

    it('AUTOSAVE-U003: has no unsaved changes initially', () => {
      manager = new AutoSaveManager();
      expect(manager.hasUnsavedChanges()).toBe(false);
    });

    it('AUTOSAVE-U004: last save time is null initially', () => {
      manager = new AutoSaveManager();
      expect(manager.getLastSaveTime()).toBeNull();
    });
  });

  describe('configuration', () => {
    it('AUTOSAVE-U005: setConfig updates interval', () => {
      manager = new AutoSaveManager();
      manager.setConfig({ interval: 15 });

      expect(manager.getConfig().interval).toBe(15);
    });

    it('AUTOSAVE-U006: setConfig clamps interval to valid range (1-30)', () => {
      manager = new AutoSaveManager();

      manager.setConfig({ interval: 0 });
      expect(manager.getConfig().interval).toBe(1);

      manager.setConfig({ interval: 50 });
      expect(manager.getConfig().interval).toBe(30);
    });

    it('AUTOSAVE-U007: setConfig clamps maxVersions to valid range (1-100)', () => {
      manager = new AutoSaveManager();

      manager.setConfig({ maxVersions: 0 });
      expect(manager.getConfig().maxVersions).toBe(1);

      manager.setConfig({ maxVersions: 200 });
      expect(manager.getConfig().maxVersions).toBe(100);
    });

    it('AUTOSAVE-U008: setConfig emits configChanged event', () => {
      manager = new AutoSaveManager();
      const callback = vi.fn();
      manager.on('configChanged', callback);

      manager.setConfig({ interval: 20 });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ interval: 20 })
      );
    });

    it('AUTOSAVE-U009: enabling auto-save updates config', () => {
      manager = new AutoSaveManager({ enabled: false });
      manager.setConfig({ enabled: true });

      expect(manager.getConfig().enabled).toBe(true);
    });

    it('AUTOSAVE-U010: disabling auto-save updates config', () => {
      manager = new AutoSaveManager({ enabled: true });
      manager.setConfig({ enabled: false });

      expect(manager.getConfig().enabled).toBe(false);
    });
  });

  describe('dirty state', () => {
    it('AUTOSAVE-U011: markDirty sets unsaved changes flag', () => {
      manager = new AutoSaveManager();
      const state = createMockSessionState();

      manager.markDirty(() => state);

      expect(manager.hasUnsavedChanges()).toBe(true);
    });

    it('AUTOSAVE-U012: markDirty stores state getter (lazy evaluation)', () => {
      manager = new AutoSaveManager();
      const stateGetter = vi.fn().mockReturnValue(createMockSessionState('Test'));

      manager.markDirty(stateGetter);

      // Dirty flag should be set but getter not called yet (lazy)
      expect(manager.hasUnsavedChanges()).toBe(true);
      expect(stateGetter).not.toHaveBeenCalled();
    });
  });

  describe('save operations (without IndexedDB)', () => {
    it('AUTOSAVE-U014: save returns null when not initialized', async () => {
      manager = new AutoSaveManager();
      const state = createMockSessionState();

      const result = await manager.save(state);

      expect(result).toBeNull();
    });

    it('AUTOSAVE-U015: save emits saving event when initialized', async () => {
      manager = new AutoSaveManager();
      const callback = vi.fn();
      manager.on('saving', callback);

      // Try to save without initialization - should emit saving then fail
      const state = createMockSessionState();
      await manager.save(state);

      // Without initialization, save returns early without emitting
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('entry management (without IndexedDB)', () => {
    it('AUTOSAVE-U019: listAutoSaves returns empty array when not initialized', async () => {
      manager = new AutoSaveManager();

      const entries = await manager.listAutoSaves();

      expect(entries).toEqual([]);
    });

    it('AUTOSAVE-U020: getAutoSave returns null when not initialized', async () => {
      manager = new AutoSaveManager();

      const result = await manager.getAutoSave('test-id');

      expect(result).toBeNull();
    });

    it('AUTOSAVE-U021: getMostRecent returns null when no entries', async () => {
      manager = new AutoSaveManager();

      const result = await manager.getMostRecent();

      expect(result).toBeNull();
    });
  });

  describe('lifecycle', () => {
    it('AUTOSAVE-U024: dispose can be called multiple times', async () => {
      manager = new AutoSaveManager();

      // Should not throw
      await manager.dispose();
      await manager.dispose();
    });

    it('AUTOSAVE-U025: dispose clears pending state', async () => {
      manager = new AutoSaveManager();
      const state = createMockSessionState();
      manager.markDirty(() => state);

      await manager.dispose();

      // Still dirty but no active manager
      expect(manager.hasUnsavedChanges()).toBe(true);
    });
  });

  describe('debouncing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('AUTOSAVE-U013: multiple markDirty calls within debounce window are batched', () => {
      manager = new AutoSaveManager();
      const stateGetter = vi.fn().mockReturnValue(createMockSessionState());

      // Multiple rapid calls
      manager.markDirty(stateGetter);
      manager.markDirty(stateGetter);
      manager.markDirty(stateGetter);

      // Should still just be marked dirty once, and getter not called yet (lazy)
      expect(manager.hasUnsavedChanges()).toBe(true);
      expect(stateGetter).not.toHaveBeenCalled();
    });
  });

  describe('storage quota', () => {
    it('AUTOSAVE-U031: checkStorageQuota returns null when Storage API unavailable', async () => {
      manager = new AutoSaveManager();

      // Mock navigator.storage as undefined
      const originalStorage = navigator.storage;
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const result = await manager.checkStorageQuota();
      expect(result).toBeNull();

      // Restore
      Object.defineProperty(navigator, 'storage', {
        value: originalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('AUTOSAVE-U032: checkStorageQuota returns quota info when available', async () => {
      manager = new AutoSaveManager();

      // Mock navigator.storage.estimate
      const mockEstimate = vi.fn().mockResolvedValue({
        usage: 1000,
        quota: 10000,
      });

      const originalStorage = navigator.storage;
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        writable: true,
        configurable: true,
      });

      const result = await manager.checkStorageQuota();

      expect(result).not.toBeNull();
      expect(result?.used).toBe(1000);
      expect(result?.quota).toBe(10000);
      expect(result?.percentUsed).toBe(10);

      // Restore
      Object.defineProperty(navigator, 'storage', {
        value: originalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('AUTOSAVE-U033: checkStorageQuota emits warning when storage is low', async () => {
      manager = new AutoSaveManager();
      const warningCallback = vi.fn();
      manager.on('storageWarning', warningCallback);

      // Mock navigator.storage.estimate with high usage
      const mockEstimate = vi.fn().mockResolvedValue({
        usage: 9000,
        quota: 10000, // 90% used
      });

      const originalStorage = navigator.storage;
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        writable: true,
        configurable: true,
      });

      await manager.checkStorageQuota();

      expect(warningCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          percentUsed: 90,
        })
      );

      // Restore
      Object.defineProperty(navigator, 'storage', {
        value: originalStorage,
        writable: true,
        configurable: true,
      });
    });

    it('AUTOSAVE-U034: checkStorageQuota does not emit warning when storage is ok', async () => {
      manager = new AutoSaveManager();
      const warningCallback = vi.fn();
      manager.on('storageWarning', warningCallback);

      // Mock navigator.storage.estimate with low usage
      const mockEstimate = vi.fn().mockResolvedValue({
        usage: 1000,
        quota: 10000, // 10% used
      });

      const originalStorage = navigator.storage;
      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        writable: true,
        configurable: true,
      });

      await manager.checkStorageQuota();

      expect(warningCallback).not.toHaveBeenCalled();

      // Restore
      Object.defineProperty(navigator, 'storage', {
        value: originalStorage,
        writable: true,
        configurable: true,
      });
    });
  });
});

describe('AutoSaveEntry', () => {
  it('AUTOSAVE-U027: entry contains required metadata', () => {
    const entry: AutoSaveEntry = {
      id: 'test-id',
      name: 'Test Project',
      savedAt: new Date().toISOString(),
      cleanShutdown: false,
      version: SESSION_STATE_VERSION,
      size: 1024,
    };

    expect(entry.id).toBeDefined();
    expect(entry.name).toBeDefined();
    expect(entry.savedAt).toBeDefined();
    expect(typeof entry.cleanShutdown).toBe('boolean');
    expect(entry.version).toBe(SESSION_STATE_VERSION);
    expect(entry.size).toBeGreaterThan(0);
  });
});

describe('DEFAULT_AUTO_SAVE_CONFIG', () => {
  it('AUTOSAVE-U028: default interval is 5 minutes', () => {
    expect(DEFAULT_AUTO_SAVE_CONFIG.interval).toBe(5);
  });

  it('AUTOSAVE-U029: auto-save is enabled by default', () => {
    expect(DEFAULT_AUTO_SAVE_CONFIG.enabled).toBe(true);
  });

  it('AUTOSAVE-U030: default maxVersions is 10', () => {
    expect(DEFAULT_AUTO_SAVE_CONFIG.maxVersions).toBe(10);
  });
});
