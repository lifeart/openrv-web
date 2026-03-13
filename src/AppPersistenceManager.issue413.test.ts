/**
 * Regression tests for issue #413: RV/GTO export filenames should derive
 * from session displayName, not the current source name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('./ui/components/shared/Modal', () => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(async () => false),
}));

import { SessionGTOExporter } from './core/session/SessionGTOExporter';

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

describe('Issue #413 – RV/GTO export filename derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveRvSession', () => {
    it('ISS-413-001: uses session displayName for .rv filename when available', async () => {
      const ctx = createMockContext({ displayName: 'My Review Session', sourceName: 'clip.exr' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.saveRvSession('rv');

      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(
        ctx.session,
        ctx.paintEngine,
        'My Review Session.rv',
        { binary: false },
      );
    });

    it('ISS-413-002: uses session displayName for .gto filename when available', async () => {
      const ctx = createMockContext({ displayName: 'Color Dailies', sourceName: 'shot_010.dpx' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.saveRvSession('gto');

      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(
        ctx.session,
        ctx.paintEngine,
        'Color Dailies.gto',
        { binary: true },
      );
    });

    it('ISS-413-003: falls back to source name when no displayName', async () => {
      const ctx = createMockContext({ displayName: '', sourceName: 'dailies_v03.exr' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.saveRvSession('rv');

      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(
        ctx.session,
        ctx.paintEngine,
        'dailies_v03.exr.rv',
        { binary: false },
      );
    });

    it('ISS-413-004: falls back to "session" when neither displayName nor source', async () => {
      const ctx = createMockContext({ displayName: '', sourceName: null });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.saveRvSession('gto');

      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(
        ctx.session,
        ctx.paintEngine,
        'session.gto',
        { binary: true },
      );
    });

    it('ISS-413-005: prefers displayName over source name in multi-source scenario', async () => {
      const ctx = createMockContext({ displayName: 'Final Review', sourceName: 'random_active_source.exr' });
      const mgr = new AppPersistenceManager(ctx);

      await mgr.saveRvSession('rv');

      // The filename should reflect the session identity, not the active source
      expect(SessionGTOExporter.saveToFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'Final Review.rv',
        expect.anything(),
      );
    });
  });
});
