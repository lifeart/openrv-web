/**
 * Regression tests for issue #360: Wire the `recoveryAvailable` event
 *
 * Verifies that AppPersistenceManager subscribes to the `recoveryAvailable`
 * event emitted by AutoSaveManager during startup recovery detection, and
 * that the restore/dismiss flows work correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppPersistenceManager, type PersistenceManagerContext } from './AppPersistenceManager';

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
import { showConfirm } from './ui/components/shared/Modal';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockAutoSaveManager() {
  const handlers: Record<string, Array<(data: any) => void>> = {};
  return {
    on: vi.fn((event: string, handler: (data: any) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event]!.push(handler);
      return vi.fn();
    }),
    initialize: vi.fn(async () => false),
    markDirty: vi.fn(),
    saveNow: vi.fn(),
    listAutoSaves: vi.fn(async () => [] as any[]),
    getAutoSave: vi.fn(async () => null),
    deleteAutoSave: vi.fn(async () => {}),
    clearAll: vi.fn(async () => {}),
    dispose: vi.fn(),
    _emit(event: string, data: any) {
      for (const h of handlers[event] ?? []) h(data);
    },
    _handlers: handlers,
  };
}

function createMockContext() {
  const autoSaveManager = createMockAutoSaveManager();
  const snapshotManager = {
    initialize: vi.fn(async () => {}),
    createSnapshot: vi.fn(async () => {}),
    createAutoCheckpoint: vi.fn(async () => {}),
    getSnapshot: vi.fn(async () => null),
    getSnapshotMetadata: vi.fn(async () => null),
    dispose: vi.fn(),
  };

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
      setStatus: vi.fn(),
    } as any,
    snapshotManager: snapshotManager as any,
    snapshotPanel: {
      hide: vi.fn(),
      setDisabled: vi.fn(),
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

  return { ctx, autoSaveManager, snapshotManager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Issue #360 – recoveryAvailable event is wired in production', () => {
  let ctx: PersistenceManagerContext;
  let autoSaveManager: ReturnType<typeof createMockAutoSaveManager>;
  let manager: AppPersistenceManager;

  const recoveryEntry = {
    id: 'autosave-crash-1',
    name: 'Dailies Review',
    savedAt: new Date('2026-03-12T14:30:00Z').toISOString(),
    cleanShutdown: false,
    version: 1,
    size: 2048,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockContext();
    ctx = mocks.ctx;
    autoSaveManager = mocks.autoSaveManager;
    manager = new AppPersistenceManager(ctx);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ISS-360-001: subscribes to recoveryAvailable event before calling initialize', async () => {
    await manager.init();

    // Verify that on('recoveryAvailable', ...) was called
    const recoveryCall = autoSaveManager.on.mock.calls.find(
      (call) => call[0] === 'recoveryAvailable',
    );
    expect(recoveryCall).toBeDefined();

    // Verify the subscription was registered before initialize was called
    const onCallOrder = autoSaveManager.on.mock.invocationCallOrder;
    const initCallOrder = autoSaveManager.initialize.mock.invocationCallOrder;
    const recoveryOnIdx = autoSaveManager.on.mock.calls.findIndex(
      (call) => call[0] === 'recoveryAvailable',
    );
    expect(onCallOrder[recoveryOnIdx]).toBeLessThan(initCallOrder[0]!);
  });

  it('ISS-360-002: shows restore prompt when recoveryAvailable event fires', async () => {
    autoSaveManager.initialize.mockImplementation(async () => {
      autoSaveManager._emit('recoveryAvailable', { entries: [recoveryEntry] });
      return true;
    });
    vi.mocked(showConfirm).mockResolvedValue(false);

    await manager.init();

    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Dailies Review'),
      expect.objectContaining({
        title: 'Recover Session',
        confirmText: 'Recover',
        cancelText: 'Discard',
      }),
    );
  });

  it('ISS-360-003: restores session when user accepts recovery prompt', async () => {
    const mockState = {
      version: 1,
      name: 'Dailies Review',
      color: { exposure: 0.5 },
      cdl: { slope: [1, 1, 1] },
      filters: { sharpen: 1 },
      transform: { rotation: 0 },
      crop: { x: 0, y: 0 },
      lens: { distortion: 0 },
      noiseReduction: null,
      watermark: null,
    };
    autoSaveManager.initialize.mockImplementation(async () => {
      autoSaveManager._emit('recoveryAvailable', { entries: [recoveryEntry] });
      return true;
    });
    autoSaveManager.getAutoSave.mockResolvedValue(mockState as any);
    vi.mocked(showConfirm).mockResolvedValue(true);

    await manager.init();

    expect(autoSaveManager.getAutoSave).toHaveBeenCalledWith('autosave-crash-1');
    expect(SessionSerializer.fromJSON).toHaveBeenCalledTimes(1);
    expect(autoSaveManager.deleteAutoSave).toHaveBeenCalledWith('autosave-crash-1');
  });

  it('ISS-360-004: clears auto-saves when user declines recovery', async () => {
    autoSaveManager.initialize.mockImplementation(async () => {
      autoSaveManager._emit('recoveryAvailable', { entries: [recoveryEntry] });
      return true;
    });
    vi.mocked(showConfirm).mockResolvedValue(false);

    await manager.init();

    expect(autoSaveManager.clearAll).toHaveBeenCalledTimes(1);
    expect(autoSaveManager.getAutoSave).not.toHaveBeenCalled();
    expect(SessionSerializer.fromJSON).not.toHaveBeenCalled();
  });

  it('ISS-360-005: does not show prompt when no recovery data is available', async () => {
    // initialize returns false and does not emit recoveryAvailable
    autoSaveManager.initialize.mockResolvedValue(false);

    await manager.init();

    expect(showConfirm).not.toHaveBeenCalled();
    expect(autoSaveManager.getAutoSave).not.toHaveBeenCalled();
  });

  it('ISS-360-006: uses the most recent entry from recoveryAvailable event entries', async () => {
    const olderEntry = {
      id: 'autosave-old',
      name: 'Old Session',
      savedAt: new Date('2026-03-11T10:00:00Z').toISOString(),
      cleanShutdown: false,
      version: 1,
      size: 1024,
    };
    // The event provides entries with the most recent first (sorted by AutoSaveManager)
    autoSaveManager.initialize.mockImplementation(async () => {
      autoSaveManager._emit('recoveryAvailable', { entries: [recoveryEntry, olderEntry] });
      return true;
    });
    vi.mocked(showConfirm).mockResolvedValue(false);

    await manager.init();

    // Should prompt with the first (most recent) entry
    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Dailies Review'),
      expect.anything(),
    );
  });
});
