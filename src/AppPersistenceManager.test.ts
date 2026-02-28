import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      color: { exposure: 0 },
      cdl: null,
      filters: null,
      transform: null,
      crop: null,
      lens: null,
      noiseReduction: null,
      watermark: null,
    })),
    fromJSON: vi.fn(async () => ({ loadedMedia: 1, warnings: [] })),
    saveToFile: vi.fn(async () => {}),
    loadFromFile: vi.fn(async () => ({ version: 1, name: 'test' })),
  },
}));

vi.mock('./core/session/SessionGTOExporter', () => ({
  SessionGTOExporter: {
    saveToFile: vi.fn(async () => {}),
  },
}));

vi.mock('./core/session/SessionGTOStore', () => ({
  SessionGTOStore: vi.fn().mockImplementation((data: any) => ({
    _data: data,
    updateFromState: vi.fn(),
    saveToFile: vi.fn(async () => {}),
    toGTOData: vi.fn(() => data),
  })),
}));

vi.mock('./ui/components/shared/Modal', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(async () => false),
}));

import { SessionSerializer } from './core/session/SessionSerializer';
import { showAlert, showConfirm } from './ui/components/shared/Modal';

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

function createMockContext(): PersistenceManagerContext & {
  _autoSaveManager: ReturnType<typeof createMockAutoSaveManager>;
  _snapshotManager: ReturnType<typeof createMockSnapshotManager>;
} {
  const autoSaveManager = createMockAutoSaveManager();
  const snapshotManager = createMockSnapshotManager();

  const ctx: PersistenceManagerContext = {
    session: {
      currentSource: { name: 'test.exr', width: 1920, height: 1080, duration: 100 },
      currentSourceIndex: 0,
      fps: 24,
      currentFrame: 1,
      allSources: [],
      gtoData: null,
    } as any,
    viewer: {
      getColorAdjustments: vi.fn(() => ({})),
      getColorInversion: vi.fn(() => false),
      getCDL: vi.fn(() => null),
      getTransform: vi.fn(() => null),
      getLensParams: vi.fn(() => null),
      getCropState: vi.fn(() => null),
      getChannelMode: vi.fn(() => 'rgb'),
      getStereoState: vi.fn(() => null),
      getNoiseReductionParams: vi.fn(() => null),
    } as any,
    paintEngine: {
      toJSON: vi.fn(() => ({ nextId: 1, show: true, frames: {} })),
    } as any,
    autoSaveManager: autoSaveManager as any,
    autoSaveIndicator: {
      markUnsaved: vi.fn(),
      markSaved: vi.fn(),
    } as any,
    snapshotManager: snapshotManager as any,
    snapshotPanel: {
      hide: vi.fn(),
    } as any,
    scopesControl: {
      getState: vi.fn(() => ({ histogram: true, waveform: false, vectorscope: false, gamutDiagram: false })),
    } as any,
    colorControls: { setAdjustments: vi.fn() } as any,
    cdlControl: { setCDL: vi.fn() } as any,
    filterControl: { setSettings: vi.fn() } as any,
    transformControl: { setTransform: vi.fn() } as any,
    cropControl: { setState: vi.fn() } as any,
    lensControl: { setParams: vi.fn() } as any,
    noiseReductionControl: { setParams: vi.fn() } as any,
    watermarkControl: { setState: vi.fn() } as any,
  };

  return {
    ...ctx,
    _autoSaveManager: autoSaveManager,
    _snapshotManager: snapshotManager,
  };
}

function createMockAutoSaveManager() {
  return {
    on: vi.fn(() => vi.fn()),
    initialize: vi.fn(async () => false),
    markDirty: vi.fn(),
    saveNow: vi.fn(),
    listAutoSaves: vi.fn(async () => [] as any[]),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppPersistenceManager', () => {
  let fullCtx: ReturnType<typeof createMockContext>;
  let manager: AppPersistenceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    fullCtx = createMockContext();
    // Extract pure PersistenceManagerContext for the constructor
    const { _autoSaveManager: _a, _snapshotManager: _s, ...ctx } = fullCtx;
    manager = new AppPersistenceManager(ctx);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // GTO Store management
  // -----------------------------------------------------------------------
  describe('GTO store', () => {
    it('APM-001: getGTOStore returns null initially', () => {
      expect(manager.getGTOStore()).toBeNull();
    });

    it('APM-002: setGTOStore / getGTOStore round-trips', () => {
      const store = { updateFromState: vi.fn(), toGTOData: vi.fn() } as any;
      manager.setGTOStore(store);
      expect(manager.getGTOStore()).toBe(store);
    });

    it('APM-003: setGTOStore(null) clears the store', () => {
      const store = { updateFromState: vi.fn() } as any;
      manager.setGTOStore(store);
      manager.setGTOStore(null);
      expect(manager.getGTOStore()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // syncGTOStore
  // -----------------------------------------------------------------------
  describe('syncGTOStore', () => {
    it('APM-010: syncGTOStore with no store is a no-op', () => {
      // Should not throw when gtoStore is null
      expect(() => manager.syncGTOStore()).not.toThrow();
    });

    it('APM-011: syncGTOStore calls updateFromState on the store with correct context', () => {
      const store = { updateFromState: vi.fn() } as any;
      manager.setGTOStore(store);

      manager.syncGTOStore();

      expect(store.updateFromState).toHaveBeenCalledTimes(1);
      expect(store.updateFromState).toHaveBeenCalledWith({
        session: fullCtx.session,
        viewer: fullCtx.viewer,
        paintEngine: fullCtx.paintEngine,
        scopesState: expect.anything(),
      });
    });

    it('APM-012: syncGTOStore calls markAutoSaveDirty after syncing', () => {
      const store = { updateFromState: vi.fn() } as any;
      manager.setGTOStore(store);

      manager.syncGTOStore();

      // markAutoSaveDirty calls autoSaveManager.markDirty and autoSaveIndicator.markUnsaved
      expect(fullCtx._autoSaveManager.markDirty).toHaveBeenCalledTimes(1);
      expect(fullCtx.autoSaveIndicator.markUnsaved).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // markAutoSaveDirty
  // -----------------------------------------------------------------------
  describe('markAutoSaveDirty', () => {
    it('APM-020: markAutoSaveDirty passes a lazy getter function to autoSaveManager', () => {
      manager.markAutoSaveDirty();

      expect(fullCtx._autoSaveManager.markDirty).toHaveBeenCalledTimes(1);
      expect(fullCtx._autoSaveManager.markDirty).toHaveBeenCalledWith(expect.any(Function));

      // The getter should call SessionSerializer.toJSON when invoked
      const getter = fullCtx._autoSaveManager.markDirty.mock.calls[0]![0] as () => any;
      const result = getter();
      expect(SessionSerializer.toJSON).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('APM-021: markAutoSaveDirty marks indicator as unsaved', () => {
      manager.markAutoSaveDirty();

      expect(fullCtx.autoSaveIndicator.markUnsaved).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // init
  // -----------------------------------------------------------------------
  describe('init', () => {
    it('APM-030: init() initializes autoSaveManager', async () => {
      await manager.init();

      expect(fullCtx._autoSaveManager.initialize).toHaveBeenCalledTimes(1);
    });

    it('APM-031: init() initializes snapshotManager', async () => {
      await manager.init();

      expect(fullCtx._snapshotManager.initialize).toHaveBeenCalledTimes(1);
    });

    it('APM-032: init() registers storageWarning listener on autoSaveManager', async () => {
      await manager.init();

      expect(fullCtx._autoSaveManager.on).toHaveBeenCalledWith(
        'storageWarning',
        expect.any(Function)
      );
    });

    it('APM-033: init() shows recovery prompt when auto-save data exists', async () => {
      fullCtx._autoSaveManager.initialize.mockResolvedValue(true);
      fullCtx._autoSaveManager.listAutoSaves.mockResolvedValue([
        { id: 'save-1', name: 'Test Session', savedAt: new Date().toISOString(), cleanShutdown: false, version: 1, size: 1024 } as any,
      ]);
      vi.mocked(showConfirm).mockResolvedValue(false);

      await manager.init();

      expect(showConfirm).toHaveBeenCalledWith(
        expect.stringContaining('Test Session'),
        expect.objectContaining({ title: 'Recover Session' })
      );
    });

    it('APM-034: init() handles snapshot initialization failure gracefully', async () => {
      fullCtx._snapshotManager.initialize.mockRejectedValue(new Error('IndexedDB not available'));

      await expect(manager.init()).resolves.not.toThrow();
    });

    it('APM-035: init() handles autoSave initialization failure gracefully', async () => {
      fullCtx._autoSaveManager.initialize.mockRejectedValue(new Error('DB error'));

      await expect(manager.init()).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // createQuickSnapshot
  // -----------------------------------------------------------------------
  describe('createQuickSnapshot', () => {
    it('APM-040: createQuickSnapshot serializes state and creates snapshot', async () => {
      await manager.createQuickSnapshot();

      expect(SessionSerializer.toJSON).toHaveBeenCalledTimes(1);
      expect(fullCtx._snapshotManager.createSnapshot).toHaveBeenCalledTimes(1);
      expect(fullCtx._snapshotManager.createSnapshot).toHaveBeenCalledWith(
        expect.stringContaining('Snapshot'),
        expect.anything()
      );
    });

    it('APM-041: createQuickSnapshot shows success alert', async () => {
      await manager.createQuickSnapshot();

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Snapshot'),
        expect.objectContaining({ type: 'success' })
      );
    });

    it('APM-042: createQuickSnapshot shows error alert on failure', async () => {
      fullCtx._snapshotManager.createSnapshot.mockRejectedValue(new Error('Storage full'));

      await manager.createQuickSnapshot();

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Failed'),
        expect.objectContaining({ type: 'error' })
      );
    });

    it('APM-043: createQuickSnapshot uses Untitled when no source name', async () => {
      (fullCtx.session as any).currentSource = null;

      await manager.createQuickSnapshot();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(
        expect.anything(),
        'Untitled'
      );
    });
  });

  // -----------------------------------------------------------------------
  // createAutoCheckpoint
  // -----------------------------------------------------------------------
  describe('createAutoCheckpoint', () => {
    it('APM-050: createAutoCheckpoint serializes state and creates checkpoint', async () => {
      await manager.createAutoCheckpoint('Before Restore');

      expect(SessionSerializer.toJSON).toHaveBeenCalledTimes(1);
      expect(fullCtx._snapshotManager.createAutoCheckpoint).toHaveBeenCalledWith(
        'Before Restore',
        expect.anything()
      );
    });

    it('APM-051: createAutoCheckpoint handles errors gracefully', async () => {
      fullCtx._snapshotManager.createAutoCheckpoint.mockRejectedValue(new Error('DB error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(manager.createAutoCheckpoint('test')).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to create auto-checkpoint:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // retryAutoSave
  // -----------------------------------------------------------------------
  describe('retryAutoSave', () => {
    it('APM-060: retryAutoSave serializes state and calls saveNow', () => {
      manager.retryAutoSave();

      expect(SessionSerializer.toJSON).toHaveBeenCalledTimes(1);
      expect(fullCtx._autoSaveManager.saveNow).toHaveBeenCalledTimes(1);
    });

    it('APM-061: retryAutoSave handles serialization errors gracefully', () => {
      vi.mocked(SessionSerializer.toJSON).mockImplementation(() => { throw new Error('Serialize error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => manager.retryAutoSave()).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to retry auto-save:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // restoreSnapshot
  // -----------------------------------------------------------------------
  describe('restoreSnapshot', () => {
    it('APM-080: restoreSnapshot happy path restores state and shows success alert', async () => {
      const mockState = {
        version: 1,
        name: 'test',
        savedAt: new Date().toISOString(),
        color: { exposure: 0.5 },
        cdl: { slope: [1, 1, 1] },
        filters: { sharpen: 1 },
        transform: { rotation: 90 },
        crop: { x: 0, y: 0 },
        lens: { distortion: 0.1 },
        noiseReduction: { strength: 0.5 },
        watermark: { text: 'test' },
      };
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(mockState as any);
      fullCtx._snapshotManager.getSnapshotMetadata.mockResolvedValue({ name: 'My Snapshot' } as any);

      await manager.restoreSnapshot('snap-1');

      expect(fullCtx._snapshotManager.getSnapshot).toHaveBeenCalledWith('snap-1');
      expect(SessionSerializer.fromJSON).toHaveBeenCalledTimes(1);
      expect(fullCtx.colorControls.setAdjustments).toHaveBeenCalledWith(mockState.color);
      expect(fullCtx.cdlControl.setCDL).toHaveBeenCalledWith(mockState.cdl);
      expect(fullCtx.filterControl.setSettings).toHaveBeenCalledWith(mockState.filters);
      expect(fullCtx.transformControl.setTransform).toHaveBeenCalledWith(mockState.transform);
      expect(fullCtx.cropControl.setState).toHaveBeenCalledWith(mockState.crop);
      expect(fullCtx.lensControl.setParams).toHaveBeenCalledWith(mockState.lens);
      expect(fullCtx.snapshotPanel.hide).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('My Snapshot'),
        expect.objectContaining({ type: 'success' })
      );
    });

    it('APM-081: restoreSnapshot shows error when snapshot not found', async () => {
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(null);

      await manager.restoreSnapshot('missing-id');

      expect(showAlert).toHaveBeenCalledWith(
        'Snapshot not found',
        expect.objectContaining({ type: 'error' })
      );
      // Should not attempt to restore
      expect(SessionSerializer.fromJSON).not.toHaveBeenCalled();
    });

    it('APM-082: restoreSnapshot shows error alert on failure', async () => {
      fullCtx._snapshotManager.getSnapshot.mockRejectedValue(new Error('DB read error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await manager.restoreSnapshot('snap-err');

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restore snapshot'),
        expect.objectContaining({ type: 'error' })
      );
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // saveRvSession
  // -----------------------------------------------------------------------
  describe('saveRvSession', () => {
    it('APM-090: saveRvSession with GTO store delegates to gtoStore.saveToFile', async () => {
      const gtoStore = {
        updateFromState: vi.fn(),
        saveToFile: vi.fn(async () => {}),
        toGTOData: vi.fn(),
      } as any;
      manager.setGTOStore(gtoStore);

      await manager.saveRvSession('rv');

      expect(gtoStore.saveToFile).toHaveBeenCalledWith('test.exr.rv', { binary: false });
    });

    it('APM-091: saveRvSession with GTO store in gto format uses binary', async () => {
      const gtoStore = {
        updateFromState: vi.fn(),
        saveToFile: vi.fn(async () => {}),
        toGTOData: vi.fn(),
      } as any;
      manager.setGTOStore(gtoStore);

      await manager.saveRvSession('gto');

      expect(gtoStore.saveToFile).toHaveBeenCalledWith('test.exr.gto', { binary: true });
    });

    it('APM-092: saveRvSession without GTO store delegates to SessionGTOExporter', async () => {
      // No GTO store set (default)
      await manager.saveRvSession('rv');

      // SessionGTOExporter.saveToFile is mocked at module level
      const { SessionGTOExporter } = await import('./core/session/SessionGTOExporter');
      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(
        fullCtx.session,
        fullCtx.paintEngine,
        'test.exr.rv',
        { binary: false }
      );
    });

    it('APM-093: saveRvSession uses "session" as basename when no source', async () => {
      (fullCtx.session as any).currentSource = null;

      await manager.saveRvSession('gto');

      const { SessionGTOExporter } = await import('./core/session/SessionGTOExporter');
      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(
        fullCtx.session,
        fullCtx.paintEngine,
        'session.gto',
        { binary: true }
      );
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------
  describe('dispose', () => {
    it('APM-070: dispose() does not throw', () => {
      expect(() => manager.dispose()).not.toThrow();
    });

    it('APM-071: dispose() is idempotent', () => {
      expect(() => {
        manager.dispose();
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });
});
