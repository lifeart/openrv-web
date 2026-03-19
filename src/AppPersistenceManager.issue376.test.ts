/**
 * Issue #376 regression tests: auto-checkpoints before destructive operations.
 *
 * Verifies that createAutoCheckpoint is called before:
 * - Loading new media (when sources already exist)
 * - Clearing all annotations (when annotations exist)
 * - Clearing all sources (when sources exist)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
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

vi.mock('./ui/components/shared/Modal', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(async () => false),
}));

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

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

function createMockContext(
  overrides?: Partial<{
    allSources: any[];
    annotatedFrames: Set<number>;
  }>,
): {
  ctx: PersistenceManagerContext;
  snapshotManager: ReturnType<typeof createMockSnapshotManager>;
} {
  const snapshotManager = createMockSnapshotManager();
  const autoSaveManager = createMockAutoSaveManager();
  const allSources = overrides?.allSources ?? [];
  const annotatedFrames = overrides?.annotatedFrames ?? new Set<number>();

  const ctx: PersistenceManagerContext = {
    session: {
      currentSource: allSources.length > 0 ? { name: 'test.exr' } : null,
      currentSourceIndex: 0,
      fps: 24,
      currentFrame: 1,
      allSources,
      gtoData: null,
      loadFile: vi.fn(async () => {}),
      loadFromGTO: vi.fn(async () => {}),
      loadEDL: vi.fn(() => []),
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
      getAnnotatedFrames: vi.fn(() => annotatedFrames),
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

  return { ctx, snapshotManager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Issue #376: auto-checkpoints before destructive operations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // checkpointBeforeMediaLoad
  // -----------------------------------------------------------------------
  describe('checkpointBeforeMediaLoad', () => {
    it('I376-001: creates checkpoint when sources already exist', async () => {
      const { ctx, snapshotManager } = createMockContext({
        allSources: [{ name: 'existing.exr' }],
      });
      const manager = new AppPersistenceManager(ctx);

      await manager.checkpointBeforeMediaLoad();

      expect(snapshotManager.createAutoCheckpoint).toHaveBeenCalledTimes(1);
      expect(snapshotManager.createAutoCheckpoint).toHaveBeenCalledWith('Before Media Load', expect.any(Object));
    });

    it('I376-002: does NOT create checkpoint when no sources exist (empty session)', async () => {
      const { ctx, snapshotManager } = createMockContext({
        allSources: [],
      });
      const manager = new AppPersistenceManager(ctx);

      await manager.checkpointBeforeMediaLoad();

      expect(snapshotManager.createAutoCheckpoint).not.toHaveBeenCalled();
    });

    it('I376-003: does NOT create checkpoint when allSources is undefined', async () => {
      const { ctx, snapshotManager } = createMockContext();
      (ctx.session as any).allSources = undefined;
      const manager = new AppPersistenceManager(ctx);

      await manager.checkpointBeforeMediaLoad();

      expect(snapshotManager.createAutoCheckpoint).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // checkpointBeforeClearAnnotations
  // -----------------------------------------------------------------------
  describe('checkpointBeforeClearAnnotations', () => {
    it('I376-010: creates checkpoint when annotations exist', async () => {
      const { ctx, snapshotManager } = createMockContext({
        annotatedFrames: new Set([1, 5, 10]),
      });
      const manager = new AppPersistenceManager(ctx);

      await manager.checkpointBeforeClearAnnotations();

      expect(snapshotManager.createAutoCheckpoint).toHaveBeenCalledTimes(1);
      expect(snapshotManager.createAutoCheckpoint).toHaveBeenCalledWith('Before Clear Annotations', expect.any(Object));
    });

    it('I376-011: does NOT create checkpoint when no annotations exist', async () => {
      const { ctx, snapshotManager } = createMockContext({
        annotatedFrames: new Set(),
      });
      const manager = new AppPersistenceManager(ctx);

      await manager.checkpointBeforeClearAnnotations();

      expect(snapshotManager.createAutoCheckpoint).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // checkpointBeforeClearSources
  // -----------------------------------------------------------------------
  describe('checkpointBeforeClearSources', () => {
    it('I376-020: creates checkpoint when sources exist', async () => {
      const { ctx, snapshotManager } = createMockContext({
        allSources: [{ name: 'clip.mov' }, { name: 'plate.exr' }],
      });
      const manager = new AppPersistenceManager(ctx);

      await manager.checkpointBeforeClearSources();

      expect(snapshotManager.createAutoCheckpoint).toHaveBeenCalledTimes(1);
      expect(snapshotManager.createAutoCheckpoint).toHaveBeenCalledWith('Before Clear Sources', expect.any(Object));
    });

    it('I376-021: does NOT create checkpoint when no sources exist', async () => {
      const { ctx, snapshotManager } = createMockContext({
        allSources: [],
      });
      const manager = new AppPersistenceManager(ctx);

      await manager.checkpointBeforeClearSources();

      expect(snapshotManager.createAutoCheckpoint).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Checkpoint failure resilience
  // -----------------------------------------------------------------------
  describe('checkpoint failure resilience', () => {
    it('I376-030: checkpointBeforeMediaLoad does not throw if checkpoint creation fails', async () => {
      const { ctx, snapshotManager } = createMockContext({
        allSources: [{ name: 'existing.exr' }],
      });
      snapshotManager.createAutoCheckpoint.mockRejectedValue(new Error('Storage full'));
      const manager = new AppPersistenceManager(ctx);

      // Should not throw
      await expect(manager.checkpointBeforeMediaLoad()).resolves.toBeUndefined();
    });

    it('I376-031: checkpointBeforeClearAnnotations does not throw if checkpoint creation fails', async () => {
      const { ctx, snapshotManager } = createMockContext({
        annotatedFrames: new Set([1]),
      });
      snapshotManager.createAutoCheckpoint.mockRejectedValue(new Error('Storage full'));
      const manager = new AppPersistenceManager(ctx);

      await expect(manager.checkpointBeforeClearAnnotations()).resolves.toBeUndefined();
    });

    it('I376-032: checkpointBeforeClearSources does not throw if checkpoint creation fails', async () => {
      const { ctx, snapshotManager } = createMockContext({
        allSources: [{ name: 'clip.mov' }],
      });
      snapshotManager.createAutoCheckpoint.mockRejectedValue(new Error('Storage full'));
      const manager = new AppPersistenceManager(ctx);

      await expect(manager.checkpointBeforeClearSources()).resolves.toBeUndefined();
    });
  });
});
