/**
 * Regression tests for issue #377:
 * Crash-recovery detection leaves auto-save half-initialized.
 *
 * After recovery data is found, the auto-save system must still be
 * fully armed (session marked active, timer started, beforeunload
 * handler installed) so that subsequent work is protected.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { AutoSaveManager } from './AutoSaveManager';
import type { SessionState } from './SessionState';
import { SESSION_STATE_VERSION } from './SessionState';
import { DEFAULT_PAINT_EFFECTS } from '../../paint/types';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../ui/components/ColorControls';
import { DEFAULT_CDL } from '../../color/CDL';
import { DEFAULT_FILTER_SETTINGS } from '../../ui/components/FilterControl';
import { DEFAULT_TRANSFORM } from '../../ui/components/TransformControl';
import { DEFAULT_CROP_STATE, DEFAULT_CROP_REGION } from '../../ui/components/CropControl';
import { DEFAULT_LENS_PARAMS } from '../../transform/LensDistortion';
import { DEFAULT_WIPE_STATE } from '../types/wipe';

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

/**
 * Simulate a crash scenario: initialize a manager, save data, then
 * close the DB without marking a clean shutdown (simulating a crash).
 */
async function simulateCrash(): Promise<void> {
  const crashManager = new AutoSaveManager({ enabled: true, interval: 5 });
  await crashManager.initialize();

  // Save a session
  const state = createMockSessionState('Crash Session');
  const entry = await crashManager.save(state);
  expect(entry).not.toBeNull();

  // Simulate crash: close DB without marking clean shutdown.
  // dispose() would mark clean shutdown, so we bypass it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mgr = crashManager as any;
  const db = mgr.db as IDBDatabase;
  // Stop the timer so it doesn't leak
  if (mgr.saveTimer) clearInterval(mgr.saveTimer);
  window.removeEventListener('beforeunload', mgr.handleBeforeUnload);
  db.close();
  mgr.db = null;
  mgr.isInitialized = false;
}

describe('AutoSaveManager issue #377 — auto-save armed after recovery', () => {
  let manager: AutoSaveManager;
  const managers: AutoSaveManager[] = [];

  afterEach(async () => {
    for (const m of managers) {
      try {
        await m.dispose();
      } catch {
        // ignore
      }
    }
    managers.length = 0;

    // Clear fake-indexeddb databases between tests
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });

  function createManager(opts: Partial<{ enabled: boolean; interval: number }> = {}): AutoSaveManager {
    const m = new AutoSaveManager({ enabled: true, interval: 5, ...opts });
    managers.push(m);
    return m;
  }

  it('AUTOSAVE-377-001: initialize returns true AND starts the timer when recovery data exists', async () => {
    await simulateCrash();

    manager = createManager();
    const hasRecovery = await manager.initialize();

    expect(hasRecovery).toBe(true);

    // The timer should be running (fix #377: previously skipped on early return).
    // Access private saveTimer to verify it was started.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((manager as any).saveTimer).not.toBeNull();
  });

  it('AUTOSAVE-377-002: initialize installs beforeunload handler when recovery data exists', async () => {
    await simulateCrash();

    const addSpy = vi.spyOn(window, 'addEventListener');
    try {
      manager = createManager();
      await manager.initialize();

      const beforeUnloadCalls = addSpy.mock.calls.filter((call) => call[0] === 'beforeunload');
      expect(beforeUnloadCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      addSpy.mockRestore();
    }
  });

  it('AUTOSAVE-377-003: save works after recovery-path initialization', async () => {
    await simulateCrash();

    manager = createManager();
    const hasRecovery = await manager.initialize();
    expect(hasRecovery).toBe(true);

    // Saving new work should succeed (fix #377: previously half-initialized)
    const state = createMockSessionState('Post-Recovery Work');
    const entry = await manager.save(state);
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('Post-Recovery Work');
  });

  it('AUTOSAVE-377-004: markDirty triggers save via interval after recovery initialization', async () => {
    await simulateCrash();

    manager = createManager({ interval: 1 }); // 1-minute interval
    await manager.initialize();

    const saveSpy = vi.spyOn(manager, 'save');

    // After initialization the interval timer is running with real timers.
    // Re-arm with fake timers so we can advance time deterministically.
    vi.useFakeTimers();
    try {
      // Restart the timer under fake-timer control
      await manager.armSession();

      // markDirty flags session as dirty; the interval timer will pick it up
      manager.markDirty(() => createMockSessionState('Dirty State'));

      // Advance past the 1-minute interval so the timer fires
      vi.advanceTimersByTime(60_000);

      // The interval callback calls saveWithGetter which calls save
      expect(saveSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('AUTOSAVE-377-005: recoveryAvailable event is still emitted when recovery data exists', async () => {
    await simulateCrash();

    manager = createManager();
    const recoverySpy = vi.fn();
    manager.on('recoveryAvailable', recoverySpy);

    await manager.initialize();

    expect(recoverySpy).toHaveBeenCalledTimes(1);
    expect(recoverySpy.mock.calls[0]![0].entries.length).toBeGreaterThan(0);
  });

  it('AUTOSAVE-377-006: no-recovery path still works correctly (timer + beforeunload)', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    try {
      manager = createManager();
      const hasRecovery = await manager.initialize();

      expect(hasRecovery).toBe(false);

      // Timer should be running
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((manager as any).saveTimer).not.toBeNull();

      // beforeunload should be registered
      const beforeUnloadCalls = addSpy.mock.calls.filter((call) => call[0] === 'beforeunload');
      expect(beforeUnloadCalls.length).toBeGreaterThanOrEqual(1);
    } finally {
      addSpy.mockRestore();
    }
  });

  it('AUTOSAVE-377-007: armSession is idempotent — no duplicate listeners on double call', async () => {
    manager = createManager();
    await manager.initialize();

    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    try {
      await manager.armSession();

      // Should remove before adding to avoid duplicates
      const removeCalls = removeSpy.mock.calls.filter((call) => call[0] === 'beforeunload');
      const addCalls = addSpy.mock.calls.filter((call) => call[0] === 'beforeunload');
      expect(removeCalls.length).toBe(1);
      expect(addCalls.length).toBe(1);
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });
});
