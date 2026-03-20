/**
 * Regression tests for issue #412: Auto-save, snapshot, and checkpoint labels
 * should derive from session displayName instead of source name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppPersistenceManager, type PersistenceManagerContext } from './AppPersistenceManager';
import { SessionSerializer } from './core/session/SessionSerializer';

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

interface MockContextOptions {
  displayName?: string;
  sourceName?: string | null;
}

function createMockContext(opts: MockContextOptions = {}): PersistenceManagerContext {
  const { displayName = '', sourceName = 'test.exr' } = opts;

  return {
    session: {
      currentSource: sourceName != null ? { name: sourceName, width: 1920, height: 1080, duration: 100 } : null,
      currentSourceIndex: 0,
      fps: 24,
      currentFrame: 1,
      allSources: [],
      gtoData: null,
      metadata: {
        displayName,
        comment: '',
        version: 2,
        origin: 'openrv-web',
        creationContext: 0,
        clipboard: 0,
        membershipContains: [],
        realtime: 0,
        bgColor: [0.18, 0.18, 0.18, 1.0],
      },
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
    } as any,
    autoSaveManager: {
      on: vi.fn(() => vi.fn()),
      initialize: vi.fn(async () => false),
      markDirty: vi.fn(),
      saveNow: vi.fn(),
      listAutoSaves: vi.fn(async () => []),
      getAutoSave: vi.fn(async () => null),
      deleteAutoSave: vi.fn(async () => {}),
      clearAll: vi.fn(async () => {}),
      dispose: vi.fn(),
    } as any,
    autoSaveIndicator: {
      markUnsaved: vi.fn(),
      markSaved: vi.fn(),
    } as any,
    snapshotManager: {
      initialize: vi.fn(async () => {}),
      createSnapshot: vi.fn(async () => {}),
      createAutoCheckpoint: vi.fn(async () => {}),
      getSnapshot: vi.fn(async () => null),
      getSnapshotMetadata: vi.fn(async () => null),
      dispose: vi.fn(),
    } as any,
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Issue #412 – session label derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- markAutoSaveDirty (auto-save) ----------------------------------------

  describe('markAutoSaveDirty', () => {
    it('ISS-412-001: uses session displayName when available', () => {
      const ctx = createMockContext({ displayName: 'My Review Session', sourceName: 'clip.exr' });
      const mgr = new AppPersistenceManager(ctx);

      mgr.markAutoSaveDirty();

      // markDirty receives a lazy getter; invoke it to trigger toJSON
      const getter = (ctx.autoSaveManager as any).markDirty.mock.calls[0][0];
      getter();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'My Review Session');
    });

    it('ISS-412-002: falls back to source name when no displayName', () => {
      const ctx = createMockContext({ displayName: '', sourceName: 'dailies_v03.exr' });
      const mgr = new AppPersistenceManager(ctx);

      mgr.markAutoSaveDirty();

      const getter = (ctx.autoSaveManager as any).markDirty.mock.calls[0][0];
      getter();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'dailies_v03.exr');
    });

    it('ISS-412-003: falls back to "Untitled" when neither displayName nor source', () => {
      const ctx = createMockContext({ displayName: '', sourceName: null });
      const mgr = new AppPersistenceManager(ctx);

      mgr.markAutoSaveDirty();

      const getter = (ctx.autoSaveManager as any).markDirty.mock.calls[0][0];
      getter();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'Untitled');
    });
  });

  // -- retryAutoSave --------------------------------------------------------

  describe('retryAutoSave', () => {
    it('ISS-412-004: uses session displayName when available', () => {
      const ctx = createMockContext({ displayName: 'Color Review', sourceName: 'shot_010.dpx' });
      const mgr = new AppPersistenceManager(ctx);

      mgr.retryAutoSave();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'Color Review');
    });

    it('ISS-412-005: falls back to source name when no displayName', () => {
      const ctx = createMockContext({ displayName: '', sourceName: 'shot_010.dpx' });
      const mgr = new AppPersistenceManager(ctx);

      mgr.retryAutoSave();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'shot_010.dpx');
    });

    it('ISS-412-006: falls back to "Untitled" when neither available', () => {
      const ctx = createMockContext({ displayName: '', sourceName: null });
      const mgr = new AppPersistenceManager(ctx);

      mgr.retryAutoSave();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'Untitled');
    });
  });

  // -- createQuickSnapshot --------------------------------------------------

  describe('createQuickSnapshot', () => {
    it('ISS-412-007: uses session displayName when available', async () => {
      const ctx = createMockContext({ displayName: 'VFX Dailies', sourceName: 'plate.exr' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.createQuickSnapshot();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'VFX Dailies');
    });

    it('ISS-412-008: falls back to source name when no displayName', async () => {
      const ctx = createMockContext({ displayName: '', sourceName: 'plate.exr' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.createQuickSnapshot();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'plate.exr');
    });

    it('ISS-412-009: falls back to "Untitled" when neither available', async () => {
      const ctx = createMockContext({ displayName: '', sourceName: null });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.createQuickSnapshot();

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'Untitled');
    });
  });

  // -- createAutoCheckpoint -------------------------------------------------

  describe('createAutoCheckpoint', () => {
    it('ISS-412-010: uses session displayName when available', async () => {
      const ctx = createMockContext({ displayName: 'Final Grade', sourceName: 'reel_a.mov' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.createAutoCheckpoint('Before Restore');

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'Final Grade');
    });

    it('ISS-412-011: falls back to source name when no displayName', async () => {
      const ctx = createMockContext({ displayName: '', sourceName: 'reel_a.mov' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.createAutoCheckpoint('Before Restore');

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'reel_a.mov');
    });

    it('ISS-412-012: falls back to "Untitled" when neither available', async () => {
      const ctx = createMockContext({ displayName: '', sourceName: null });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.createAutoCheckpoint('Before Restore');

      expect(SessionSerializer.toJSON).toHaveBeenCalledWith(expect.anything(), 'Untitled');
    });
  });
});
