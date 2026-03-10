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
  SessionGTOStore: class {
    _data: any;
    updateFromState = vi.fn();
    saveToFile = vi.fn(async () => {});
    toGTOData: any;
    constructor(data: any) {
      this._data = data;
      this.toGTOData = vi.fn(() => data);
    }
  },
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
      loadFile: vi.fn(async () => {}),
      loadFromGTO: vi.fn(async () => {}),
      loadEDL: vi.fn(() => []),
      clearSources: vi.fn(),
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
      getFilterSettings: vi.fn(() => null),
      getWipeState: vi.fn(() => ({ mode: 'off', position: 0.5, showOriginal: 'left' })),
      getWatermarkState: vi.fn(() => null),
      getPARState: vi.fn(() => null),
      getBackgroundPatternState: vi.fn(() => null),
    } as any,
    paintEngine: {
      toJSON: vi.fn(() => ({ nextId: 1, show: true, frames: {} })),
    } as any,
    autoSaveManager: autoSaveManager as any,
    autoSaveIndicator: {
      markUnsaved: vi.fn(),
      markSaved: vi.fn(),
      setStatus: vi.fn(),
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
    compareControl: { setWipeMode: vi.fn(), setWipePosition: vi.fn() } as any,
    stackControl: { setLayers: vi.fn(), clearLayers: vi.fn(), getLayers: vi.fn(() => []) } as any,
    parControl: { setState: vi.fn() } as any,
    backgroundPatternControl: { setState: vi.fn() } as any,
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

      expect(fullCtx._autoSaveManager.on).toHaveBeenCalledWith('storageWarning', expect.any(Function));
    });

    it('APM-033: init() shows recovery prompt when auto-save data exists', async () => {
      fullCtx._autoSaveManager.initialize.mockResolvedValue(true);
      fullCtx._autoSaveManager.listAutoSaves.mockResolvedValue([
        {
          id: 'save-1',
          name: 'Test Session',
          savedAt: new Date().toISOString(),
          cleanShutdown: false,
          version: 1,
          size: 1024,
        } as any,
      ]);
      vi.mocked(showConfirm).mockResolvedValue(false);

      await manager.init();

      expect(showConfirm).toHaveBeenCalledWith(
        expect.stringContaining('Test Session'),
        expect.objectContaining({ title: 'Recover Session' }),
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
        expect.anything(),
      );
    });

    it('APM-041: createQuickSnapshot shows success alert', async () => {
      await manager.createQuickSnapshot();

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Snapshot'),
        expect.objectContaining({ type: 'success' }),
      );
    });

    it('APM-042: createQuickSnapshot shows error alert on failure', async () => {
      fullCtx._snapshotManager.createSnapshot.mockRejectedValue(new Error('Storage full'));

      await manager.createQuickSnapshot();

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Failed'),
        expect.objectContaining({ type: 'error' }),
      );
    });

    it('APM-043: createQuickSnapshot uses Untitled when no source name', async () => {
      (fullCtx.session as any).currentSource = null;

      await manager.createQuickSnapshot();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'Untitled');
    });
  });

  // -----------------------------------------------------------------------
  // createAutoCheckpoint
  // -----------------------------------------------------------------------
  describe('createAutoCheckpoint', () => {
    it('APM-050: createAutoCheckpoint serializes state and creates checkpoint', async () => {
      await manager.createAutoCheckpoint('Before Restore');

      expect(SessionSerializer.toJSON).toHaveBeenCalledTimes(1);
      expect(fullCtx._snapshotManager.createAutoCheckpoint).toHaveBeenCalledWith('Before Restore', expect.anything());
    });

    it('APM-051: createAutoCheckpoint handles errors gracefully', async () => {
      fullCtx._snapshotManager.createAutoCheckpoint.mockRejectedValue(new Error('DB error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(manager.createAutoCheckpoint('test')).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to create auto-checkpoint:', expect.any(Error));
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
      vi.mocked(SessionSerializer.toJSON).mockImplementation(() => {
        throw new Error('Serialize error');
      });
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
        wipe: { mode: 'horizontal', position: 0.3, showOriginal: 'left' },
        stack: [
          { id: 'layer_1', name: 'BG', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 },
          { id: 'layer_2', name: 'FG', visible: true, opacity: 0.8, blendMode: 'multiply', sourceIndex: 1 },
        ],
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
      // Compare / wipe control sync
      expect(fullCtx.compareControl!.setWipeMode).toHaveBeenCalledWith('horizontal');
      expect(fullCtx.compareControl!.setWipePosition).toHaveBeenCalledWith(0.3);
      // Stack control sync
      expect(fullCtx.stackControl!.setLayers).toHaveBeenCalledWith(mockState.stack);
      expect(fullCtx.snapshotPanel.hide).toHaveBeenCalledTimes(1);
      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('My Snapshot'),
        expect.objectContaining({ type: 'success' }),
      );
    });

    it('APM-081: restoreSnapshot shows error when snapshot not found', async () => {
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(null);

      await manager.restoreSnapshot('missing-id');

      expect(showAlert).toHaveBeenCalledWith('Snapshot not found', expect.objectContaining({ type: 'error' }));
      // Should not attempt to restore
      expect(SessionSerializer.fromJSON).not.toHaveBeenCalled();
    });

    it('APM-082: restoreSnapshot shows error alert on failure', async () => {
      fullCtx._snapshotManager.getSnapshot.mockRejectedValue(new Error('DB read error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await manager.restoreSnapshot('snap-err');

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Failed to restore snapshot'),
        expect.objectContaining({ type: 'error' }),
      );
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // openProject
  // -----------------------------------------------------------------------
  describe('openProject', () => {
    it('APM-085: openProject loads .orvproject files via SessionSerializer', async () => {
      const file = new File(['{"version":1}'], 'test.orvproject', { type: 'application/json' });

      await manager.openProject(file);

      expect(SessionSerializer.loadFromFile).toHaveBeenCalledWith(file);
      expect(SessionSerializer.fromJSON).toHaveBeenCalledTimes(1);
      expect(fullCtx.session.loadFile).not.toHaveBeenCalled();
    });

    it('APM-086: openProject shows warning for non-project media files', async () => {
      const file = new File(['image-data'], 'IMG_1234.HEIC', { type: 'image/heic' });

      await manager.openProject(file);

      expect(fullCtx.session.loadFile).not.toHaveBeenCalled();
      expect(SessionSerializer.loadFromFile).not.toHaveBeenCalled();
      expect(SessionSerializer.fromJSON).not.toHaveBeenCalled();
      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('Unable to open as project'),
        expect.objectContaining({ type: 'warning' }),
      );
    });

    it('APM-087: openProject loads .rv file via session.loadFromGTO', async () => {
      const file = new File(['rv-data'], 'session.rv');

      await manager.openProject(file);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalledWith(expect.any(ArrayBuffer), undefined);
      expect(SessionSerializer.loadFromFile).not.toHaveBeenCalled();
      expect(fullCtx.session.loadFile).not.toHaveBeenCalled();
    });

    it('APM-088: openProject loads .gto file via session.loadFromGTO', async () => {
      const file = new File(['gto-data'], 'session.gto');

      await manager.openProject(file);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalledWith(expect.any(ArrayBuffer), undefined);
      expect(fullCtx.session.loadFile).not.toHaveBeenCalled();
    });

    it('APM-089: openProject handles uppercase .GTO case-insensitively', async () => {
      const file = new File(['gto-data'], 'SESSION.GTO');

      await manager.openProject(file);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalledWith(expect.any(ArrayBuffer), undefined);
    });

    it('APM-090a: openProject loads .rvedl file via session.loadEDL', async () => {
      const file = new File(['edl-text'], 'cut.rvedl');

      await manager.openProject(file);

      expect(fullCtx.session.loadEDL).toHaveBeenCalledWith('edl-text');
      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('EDL loaded'),
        expect.objectContaining({ type: 'success' }),
      );
    });

    it('APM-090b: openProject shows warning with extension for unknown file types', async () => {
      const file = new File(['data'], 'document.xyz');

      await manager.openProject(file);

      expect(fullCtx.session.loadFile).not.toHaveBeenCalled();
      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('.xyz'),
        expect.objectContaining({ type: 'warning' }),
      );
    });

    it('APM-161a: openProject creates auto-checkpoint for .orvproject files', async () => {
      const spy = vi.spyOn(manager, 'createAutoCheckpoint').mockResolvedValue(true);
      const file = new File(['{}'], 'scene.orvproject');
      await manager.openProject(file);

      expect(spy).toHaveBeenCalledWith('Before Project Load');
    });

    it('APM-161b: openProject creates auto-checkpoint for .rv files', async () => {
      const spy = vi.spyOn(manager, 'createAutoCheckpoint').mockResolvedValue(true);
      const file = new File([new ArrayBuffer(8)], 'scene.rv');
      await manager.openProject(file);

      expect(spy).toHaveBeenCalledWith('Before Project Load');
    });

    it('APM-161c: openProject creates auto-checkpoint for .gto files', async () => {
      const spy = vi.spyOn(manager, 'createAutoCheckpoint').mockResolvedValue(true);
      const file = new File([new ArrayBuffer(8)], 'scene.gto');
      await manager.openProject(file);

      expect(spy).toHaveBeenCalledWith('Before Project Load');
    });

    it('APM-161d: openProject does NOT create auto-checkpoint for .rvedl import', async () => {
      const spy = vi.spyOn(manager, 'createAutoCheckpoint').mockResolvedValue(true);
      const file = new File(['EDL content'], 'timeline.rvedl');
      await manager.openProject(file);

      expect(spy).not.toHaveBeenCalled();
    });

    it('APM-161e: openProject does NOT create auto-checkpoint for unsupported file types', async () => {
      const spy = vi.spyOn(manager, 'createAutoCheckpoint').mockResolvedValue(true);
      const file = new File(['data'], 'image.png');
      await manager.openProject(file);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Issue #160: GTO load syncs controls
  // -----------------------------------------------------------------------
  describe('issue #160: GTO load syncs compare/stack controls', () => {
    it('APM-160a: openProject .rv file syncs compare control from viewer wipe state', async () => {
      (fullCtx.viewer as any).getWipeState.mockReturnValue({
        mode: 'horizontal',
        position: 0.3,
        showOriginal: 'left',
      });
      const file = new File(['rv-data'], 'session.rv');

      await manager.openProject(file);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalled();
      expect(fullCtx.compareControl!.setWipeMode).toHaveBeenCalledWith('horizontal');
      expect(fullCtx.compareControl!.setWipePosition).toHaveBeenCalledWith(0.3);
    });

    it('APM-160b: openProject .gto file syncs compare control from viewer wipe state', async () => {
      (fullCtx.viewer as any).getWipeState.mockReturnValue({
        mode: 'vertical',
        position: 0.7,
        showOriginal: 'right',
      });
      const file = new File(['gto-data'], 'session.gto');

      await manager.openProject(file);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalled();
      expect(fullCtx.compareControl!.setWipeMode).toHaveBeenCalledWith('vertical');
      expect(fullCtx.compareControl!.setWipePosition).toHaveBeenCalledWith(0.7);
    });

    it('APM-160c: openProject .rv file does NOT re-sync color controls (handled by settingsLoaded)', async () => {
      const mockColor = { exposure: 1.5, brightness: 0.2 };
      (fullCtx.viewer as any).getColorAdjustments.mockReturnValue(mockColor);
      const file = new File(['rv-data'], 'session.rv');

      await manager.openProject(file);

      // Color controls are synced by the settingsLoaded event handler, not by openProject
      expect(fullCtx.colorControls.setAdjustments).not.toHaveBeenCalled();
    });

    it('APM-160d: openProject .gto file only syncs controls not covered by settingsLoaded', async () => {
      const mockWatermark = { text: 'DRAFT' };
      const mockPAR = { ratio: 2.0 };
      const mockBgPattern = { type: 'checkerboard' };

      (fullCtx.viewer as any).getWatermarkState.mockReturnValue(mockWatermark);
      (fullCtx.viewer as any).getWipeState.mockReturnValue({ mode: 'horizontal', position: 0.4, showOriginal: 'left' });
      (fullCtx.viewer as any).getPARState.mockReturnValue(mockPAR);
      (fullCtx.viewer as any).getBackgroundPatternState.mockReturnValue(mockBgPattern);

      const file = new File(['gto-data'], 'session.gto');
      await manager.openProject(file);

      // Controls synced by openProject (settingsLoaded does NOT handle these)
      expect(fullCtx.watermarkControl!.setState).toHaveBeenCalledWith(mockWatermark);
      expect(fullCtx.compareControl!.setWipeMode).toHaveBeenCalledWith('horizontal');
      expect(fullCtx.compareControl!.setWipePosition).toHaveBeenCalledWith(0.4);
      expect(fullCtx.parControl!.setState).toHaveBeenCalledWith(mockPAR);
      expect(fullCtx.backgroundPatternControl!.setState).toHaveBeenCalledWith(mockBgPattern);

      // Controls NOT synced by openProject (handled by settingsLoaded event)
      expect(fullCtx.colorControls.setAdjustments).not.toHaveBeenCalled();
      expect(fullCtx.cdlControl.setCDL).not.toHaveBeenCalled();
      expect(fullCtx.filterControl.setSettings).not.toHaveBeenCalled();
      expect(fullCtx.transformControl.setTransform).not.toHaveBeenCalled();
      expect(fullCtx.cropControl.setState).not.toHaveBeenCalled();
      expect(fullCtx.lensControl.setParams).not.toHaveBeenCalled();
      expect(fullCtx.noiseReductionControl!.setParams).not.toHaveBeenCalled();
    });

    it('APM-160e: openProject .rv file works when compareControl is not provided', async () => {
      const { _autoSaveManager: _a, _snapshotManager: _s, ...ctx } = fullCtx;
      const minCtx = { ...ctx, compareControl: undefined, stackControl: undefined };
      const minManager = new AppPersistenceManager(minCtx);

      const file = new File(['rv-data'], 'session.rv');

      // Should not throw even without compare/stack controls
      await expect(minManager.openProject(file)).resolves.not.toThrow();
      expect(fullCtx.session.loadFromGTO).toHaveBeenCalled();
    });

  });

  // -----------------------------------------------------------------------
  // Issue #162: openProject passes companion files for .rv/.gto
  // -----------------------------------------------------------------------
  describe('issue #162: openProject companion files for .rv/.gto', () => {
    it('APM-162a: openProject .rv with companion files builds availableFiles map', async () => {
      const sessionFile = new File(['rv-data'], 'session.rv');
      const mediaFile1 = new File(['img1'], 'shot01.exr');
      const mediaFile2 = new File(['cdl1'], 'grade.cdl');

      await manager.openProject(sessionFile, [mediaFile1, mediaFile2]);

      const expectedMap = new Map<string, File>();
      expectedMap.set('shot01.exr', mediaFile1);
      expectedMap.set('grade.cdl', mediaFile2);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalledWith(expect.any(ArrayBuffer), expectedMap);
    });

    it('APM-162b: openProject .gto with companion files builds availableFiles map', async () => {
      const sessionFile = new File(['gto-data'], 'session.gto');
      const mediaFile = new File(['img'], 'plate.dpx');

      await manager.openProject(sessionFile, [mediaFile]);

      const expectedMap = new Map<string, File>();
      expectedMap.set('plate.dpx', mediaFile);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalledWith(expect.any(ArrayBuffer), expectedMap);
    });

    it('APM-162c: openProject .rv with no companion files passes undefined', async () => {
      const sessionFile = new File(['rv-data'], 'session.rv');

      await manager.openProject(sessionFile);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalledWith(expect.any(ArrayBuffer), undefined);
    });

    it('APM-162d: openProject .rv with empty companion array passes undefined', async () => {
      const sessionFile = new File(['rv-data'], 'session.rv');

      await manager.openProject(sessionFile, []);

      expect(fullCtx.session.loadFromGTO).toHaveBeenCalledWith(expect.any(ArrayBuffer), undefined);
    });

    it('APM-162e: openProject .orvproject ignores companion files', async () => {
      const projectFile = new File(['{"version":1}'], 'test.orvproject', { type: 'application/json' });
      const companionFile = new File(['media'], 'shot.exr');

      await manager.openProject(projectFile, [companionFile]);

      expect(SessionSerializer.loadFromFile).toHaveBeenCalledWith(projectFile);
      expect(fullCtx.session.loadFromGTO).not.toHaveBeenCalled();
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
      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(fullCtx.session, fullCtx.paintEngine, 'test.exr.rv', {
        binary: false,
      });
    });

    it('APM-093: saveRvSession uses "session" as basename when no source', async () => {
      (fullCtx.session as any).currentSource = null;

      await manager.saveRvSession('gto');

      const { SessionGTOExporter } = await import('./core/session/SessionGTOExporter');
      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(fullCtx.session, fullCtx.paintEngine, 'session.gto', {
        binary: true,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Control sync regression tests (Issue #26)
  // -----------------------------------------------------------------------
  describe('control sync on restore', () => {
    const fullState = {
      version: 1,
      name: 'sync-test',
      savedAt: new Date().toISOString(),
      color: { exposure: 1.5 },
      cdl: { slope: [1.1, 1, 1] },
      filters: { sharpen: 2 },
      transform: { rotation: 180 },
      crop: { x: 10, y: 20 },
      lens: { distortion: 0.5 },
      noiseReduction: { strength: 0.8 },
      watermark: { text: 'DRAFT' },
      wipe: { mode: 'vertical', position: 0.7, showOriginal: 'right' },
      stack: [
        { id: 'layer_1', name: 'Base', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 },
      ],
    };

    it('APM-100: openProject syncs compare control wipe state', async () => {
      vi.mocked(SessionSerializer.loadFromFile).mockResolvedValue(fullState as any);
      const file = new File(['{}'], 'test.orvproject', { type: 'application/json' });

      await manager.openProject(file);

      expect(fullCtx.compareControl!.setWipeMode).toHaveBeenCalledWith('vertical');
      expect(fullCtx.compareControl!.setWipePosition).toHaveBeenCalledWith(0.7);
    });

    it('APM-101: openProject syncs stack control layers', async () => {
      vi.mocked(SessionSerializer.loadFromFile).mockResolvedValue(fullState as any);
      const file = new File(['{}'], 'test.orvproject', { type: 'application/json' });

      await manager.openProject(file);

      expect(fullCtx.stackControl!.setLayers).toHaveBeenCalledWith(fullState.stack);
    });

    it('APM-102: openProject clears stack control when state has empty stack', async () => {
      const stateNoStack = { ...fullState, stack: [] };
      vi.mocked(SessionSerializer.loadFromFile).mockResolvedValue(stateNoStack as any);
      const file = new File(['{}'], 'test.orvproject', { type: 'application/json' });

      await manager.openProject(file);

      expect(fullCtx.stackControl!.clearLayers).toHaveBeenCalled();
      expect(fullCtx.stackControl!.setLayers).not.toHaveBeenCalled();
    });

    it('APM-103: auto-save recovery syncs compare and stack controls', async () => {
      // Set up auto-save with recovery data
      fullCtx._autoSaveManager.initialize.mockResolvedValue(true);
      fullCtx._autoSaveManager.listAutoSaves.mockResolvedValue([
        { id: 'save-1', name: 'Session', savedAt: new Date().toISOString() } as any,
      ]);
      fullCtx._autoSaveManager.getAutoSave.mockResolvedValue(fullState as any);
      vi.mocked(showConfirm).mockResolvedValue(true);

      await manager.init();

      expect(fullCtx.compareControl!.setWipeMode).toHaveBeenCalledWith('vertical');
      expect(fullCtx.compareControl!.setWipePosition).toHaveBeenCalledWith(0.7);
      expect(fullCtx.stackControl!.setLayers).toHaveBeenCalledWith(fullState.stack);
    });

    it('APM-104: snapshot restore syncs all controls including compare and stack', async () => {
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(fullState as any);
      fullCtx._snapshotManager.getSnapshotMetadata.mockResolvedValue({ name: 'Test' } as any);

      await manager.restoreSnapshot('snap-1');

      // Verify all controls are synced
      expect(fullCtx.colorControls.setAdjustments).toHaveBeenCalledWith(fullState.color);
      expect(fullCtx.cdlControl.setCDL).toHaveBeenCalledWith(fullState.cdl);
      expect(fullCtx.filterControl.setSettings).toHaveBeenCalledWith(fullState.filters);
      expect(fullCtx.transformControl.setTransform).toHaveBeenCalledWith(fullState.transform);
      expect(fullCtx.cropControl.setState).toHaveBeenCalledWith(fullState.crop);
      expect(fullCtx.lensControl.setParams).toHaveBeenCalledWith(fullState.lens);
      expect(fullCtx.noiseReductionControl!.setParams).toHaveBeenCalledWith(fullState.noiseReduction);
      expect(fullCtx.watermarkControl!.setState).toHaveBeenCalledWith(fullState.watermark);
      expect(fullCtx.compareControl!.setWipeMode).toHaveBeenCalledWith('vertical');
      expect(fullCtx.compareControl!.setWipePosition).toHaveBeenCalledWith(0.7);
      expect(fullCtx.stackControl!.setLayers).toHaveBeenCalledWith(fullState.stack);
    });

    it('APM-105: restore works gracefully when compareControl is not provided', async () => {
      // Create manager without compareControl or stackControl
      const { _autoSaveManager: _a, _snapshotManager: _s, ...ctx } = fullCtx;
      const minCtx = { ...ctx, compareControl: undefined, stackControl: undefined };
      const minManager = new AppPersistenceManager(minCtx);

      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(fullState as any);
      fullCtx._snapshotManager.getSnapshotMetadata.mockResolvedValue({ name: 'Test' } as any);

      // Should not throw
      await minManager.restoreSnapshot('snap-1');

      // Other controls still synced
      expect(fullCtx.colorControls.setAdjustments).toHaveBeenCalledWith(fullState.color);
    });

    it('APM-106: restore with no wipe state does not call compareControl', async () => {
      const stateNoWipe = { ...fullState, wipe: undefined };
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(stateNoWipe as any);
      fullCtx._snapshotManager.getSnapshotMetadata.mockResolvedValue({ name: 'Test' } as any);

      await manager.restoreSnapshot('snap-1');

      expect(fullCtx.compareControl!.setWipeMode).not.toHaveBeenCalled();
      expect(fullCtx.compareControl!.setWipePosition).not.toHaveBeenCalled();
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

  // -----------------------------------------------------------------------
  // Issue #138: snapshot/auto-save use lossy serializer
  // -----------------------------------------------------------------------
  describe('issue #138: lossy serializer documentation', () => {
    it('APM-138: createQuickSnapshot uses SessionSerializer.toJSON (lossy)', async () => {
      await manager.createQuickSnapshot();
      expect(SessionSerializer.toJSON).toHaveBeenCalledTimes(1);
      // The TODO(#138) comment documents that this is lossy
    });
  });

  // -----------------------------------------------------------------------
  // Issue #139: snapshot restore clears session first
  // -----------------------------------------------------------------------
  describe('issue #139: snapshot restore clears session', () => {
    it('APM-139: restoreSnapshot calls clearSources before fromJSON', async () => {
      const mockState = { version: 1, name: 'test', color: {} };
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(mockState as any);
      fullCtx._snapshotManager.getSnapshotMetadata.mockResolvedValue({ name: 'Test' } as any);

      // Add clearSources to the session mock
      (fullCtx.session as any).clearSources = vi.fn();

      // Re-create manager with updated context
      const { _autoSaveManager: _a, _snapshotManager: _s, ...ctx } = fullCtx;
      const mgr = new AppPersistenceManager(ctx);

      await mgr.restoreSnapshot('snap-1');

      expect((fullCtx.session as any).clearSources).toHaveBeenCalled();
      expect(SessionSerializer.fromJSON).toHaveBeenCalled();

      // Verify clearSources was called before fromJSON
      const clearOrder = (fullCtx.session as any).clearSources.mock.invocationCallOrder[0];
      const fromJSONOrder = vi.mocked(SessionSerializer.fromJSON).mock.invocationCallOrder[0];
      expect(clearOrder).toBeLessThan(fromJSONOrder!);
    });
  });

  // -----------------------------------------------------------------------
  // Issue #140: snapshot restore surfaces warnings
  // -----------------------------------------------------------------------
  describe('issue #140: snapshot restore surfaces warnings', () => {
    it('APM-140: restoreSnapshot shows warning alert when fromJSON returns warnings', async () => {
      const mockState = { version: 1, name: 'test', color: {} };
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(mockState as any);
      fullCtx._snapshotManager.getSnapshotMetadata.mockResolvedValue({ name: 'Snap' } as any);
      vi.mocked(SessionSerializer.fromJSON).mockResolvedValue({
        loadedMedia: 1,
        warnings: ['LUT "test" needs reload'],
      });

      await manager.restoreSnapshot('snap-1');

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('warning'),
        expect.objectContaining({ type: 'warning' }),
      );
    });

    it('APM-140b: restoreSnapshot shows info when loadedMedia is 0', async () => {
      const mockState = { version: 1, name: 'test', color: {} };
      fullCtx._snapshotManager.getSnapshot.mockResolvedValue(mockState as any);
      fullCtx._snapshotManager.getSnapshotMetadata.mockResolvedValue({ name: 'Snap' } as any);
      vi.mocked(SessionSerializer.fromJSON).mockResolvedValue({
        loadedMedia: 0,
        warnings: [],
      });

      await manager.restoreSnapshot('snap-1');

      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('no media'),
        expect.objectContaining({ type: 'info' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Issue #141: auto-save recovery preserves entry on warnings
  // -----------------------------------------------------------------------
  describe('issue #141: auto-save recovery entry preservation', () => {
    it('APM-141: recovery with warnings keeps auto-save entry', async () => {
      fullCtx._autoSaveManager.initialize.mockResolvedValue(true);
      fullCtx._autoSaveManager.listAutoSaves.mockResolvedValue([
        { id: 'save-1', name: 'Session', savedAt: new Date().toISOString() } as any,
      ]);
      fullCtx._autoSaveManager.getAutoSave.mockResolvedValue({
        version: 1, name: 'test', color: {},
      } as any);
      vi.mocked(showConfirm).mockResolvedValue(true);
      vi.mocked(SessionSerializer.fromJSON).mockResolvedValue({
        loadedMedia: 1,
        warnings: ['Skipped reload: file.exr'],
      });

      await manager.init();

      // Entry should NOT be deleted when there are warnings
      expect(fullCtx._autoSaveManager.deleteAutoSave).not.toHaveBeenCalled();
      expect(showAlert).toHaveBeenCalledWith(
        expect.stringContaining('preserved'),
        expect.objectContaining({ type: 'warning' }),
      );
    });

    it('APM-141b: recovery without warnings deletes auto-save entry', async () => {
      fullCtx._autoSaveManager.initialize.mockResolvedValue(true);
      fullCtx._autoSaveManager.listAutoSaves.mockResolvedValue([
        { id: 'save-1', name: 'Session', savedAt: new Date().toISOString() } as any,
      ]);
      fullCtx._autoSaveManager.getAutoSave.mockResolvedValue({
        version: 1, name: 'test', color: {},
      } as any);
      vi.mocked(showConfirm).mockResolvedValue(true);
      vi.mocked(SessionSerializer.fromJSON).mockResolvedValue({
        loadedMedia: 1,
        warnings: [],
      });

      await manager.init();

      // Entry should be deleted when recovery is clean
      expect(fullCtx._autoSaveManager.deleteAutoSave).toHaveBeenCalledWith('save-1');
    });
  });
});
