/**
 * Regression tests for issue #192: Auto-save can fail to initialize while
 * the header indicator still makes it look active.
 *
 * Verifies:
 * - Init failure shows a user-visible warning
 * - Init failure sets indicator to disabled state
 * - Successful init does NOT show a warning or disable indicator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppPersistenceManager, type PersistenceManagerContext } from './AppPersistenceManager';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./core/session/SessionSerializer', () => ({
  SessionSerializer: {
    toJSON: vi.fn(() => ({
      version: 1,
      name: 'test',
      savedAt: new Date().toISOString(),
    })),
    fromJSON: vi.fn(async () => ({ loadedMedia: 0, warnings: [] })),
    saveToFile: vi.fn(async () => {}),
    loadFromFile: vi.fn(async () => ({ version: 1, name: 'test' })),
  },
}));

vi.mock('./core/session/SessionGTOExporter', () => ({
  SessionGTOExporter: {
    saveToFile: vi.fn(async () => {}),
  },
}));

vi.mock('./ui/components/shared/Modal', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(async () => false),
}));

import { showAlert } from './ui/components/shared/Modal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAutoSaveManager(initBehavior: 'success' | 'throw') {
  return {
    on: vi.fn(() => vi.fn()),
    initialize:
      initBehavior === 'success'
        ? vi.fn(async () => false)
        : vi.fn(async () => {
            throw new Error('IndexedDB unavailable');
          }),
    markDirty: vi.fn(),
    saveNow: vi.fn(),
    listAutoSaves: vi.fn(async () => []),
    getAutoSave: vi.fn(async () => null),
    deleteAutoSave: vi.fn(async () => {}),
    clearAll: vi.fn(async () => {}),
    dispose: vi.fn(),
  };
}

function createMockSnapshotManager() {
  return {
    initialize: vi.fn(async () => {}),
    createSnapshot: vi.fn(async () => {}),
    createAutoCheckpoint: vi.fn(async () => {}),
    getSnapshot: vi.fn(async () => null),
    getSnapshotMetadata: vi.fn(async () => null),
    dispose: vi.fn(),
  };
}

function createMockContext(initBehavior: 'success' | 'throw') {
  const autoSaveManager = createMockAutoSaveManager(initBehavior);
  const snapshotManager = createMockSnapshotManager();
  const autoSaveIndicator = {
    markUnsaved: vi.fn(),
    markSaved: vi.fn(),
    setStatus: vi.fn(),
    getStatus: vi.fn(() => 'idle'),
  };

  const ctx: PersistenceManagerContext = {
    session: {
      currentSource: { name: 'test.exr' },
      metadata: { displayName: '' },
    } as any,
    viewer: {} as any,
    paintEngine: {} as any,
    autoSaveManager: autoSaveManager as any,
    autoSaveIndicator: autoSaveIndicator as any,
    snapshotManager: snapshotManager as any,
    snapshotPanel: { hide: vi.fn() } as any,
    scopesControl: { getState: vi.fn(() => ({})) } as any,
    colorControls: { setAdjustments: vi.fn() } as any,
    cdlControl: { setCDL: vi.fn() } as any,
    filterControl: { setSettings: vi.fn() } as any,
    transformControl: { setTransform: vi.fn() } as any,
    cropControl: { setState: vi.fn() } as any,
    lensControl: { setParams: vi.fn() } as any,
  };

  return { ctx, autoSaveManager, autoSaveIndicator, snapshotManager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppPersistenceManager – issue #192: auto-save init failure visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PERSIST-192-001: init failure shows a user-visible warning', async () => {
    const { ctx } = createMockContext('throw');
    const manager = new AppPersistenceManager(ctx);
    await manager.init();

    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(
      expect.stringContaining('Auto-save could not be initialized'),
      expect.objectContaining({ type: 'warning', title: 'Auto-Save Unavailable' }),
    );
  });

  it('PERSIST-192-002: init failure sets indicator to disabled state', async () => {
    const { ctx, autoSaveIndicator } = createMockContext('throw');
    const manager = new AppPersistenceManager(ctx);
    await manager.init();

    expect(autoSaveIndicator.setStatus).toHaveBeenCalledWith('disabled');
  });

  it('PERSIST-192-003: successful init does NOT show a warning', async () => {
    const { ctx, autoSaveIndicator } = createMockContext('success');
    const manager = new AppPersistenceManager(ctx);
    await manager.init();

    // showAlert should not have been called for auto-save init
    expect(showAlert).not.toHaveBeenCalled();
    // Indicator should not be set to disabled
    expect(autoSaveIndicator.setStatus).not.toHaveBeenCalledWith('disabled');
  });

  it('PERSIST-192-004: init failure does not prevent snapshot initialization', async () => {
    const { ctx, snapshotManager } = createMockContext('throw');
    const manager = new AppPersistenceManager(ctx);
    await manager.init();

    // Snapshots should still be initialized even when auto-save fails
    expect(snapshotManager.initialize).toHaveBeenCalled();
  });
});
