/**
 * Regression tests for issue #191: Pre-restore and pre-load auto-checkpoints
 * can fail silently while destructive operations still proceed.
 *
 * Verifies:
 * - createAutoCheckpoint returns boolean success/failure
 * - Checkpoint failure shows a user-visible warning
 * - Restore/load still proceeds despite checkpoint failure
 * - Successful checkpoint does NOT show a warning
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
    loadFromFile: vi.fn(async () => ({
      version: 1,
      name: 'test',
      savedAt: new Date().toISOString(),
      color: { exposure: 0 },
    })),
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

import { SessionSerializer } from './core/session/SessionSerializer';
import { showAlert } from './ui/components/shared/Modal';

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

function createMockContext(overrides?: {
  checkpointShouldFail?: boolean;
}): PersistenceManagerContext {
  const shouldFail = overrides?.checkpointShouldFail ?? false;

  return {
    session: {
      currentSource: { name: 'test.exr' },
      allSources: [],
      clearSources: vi.fn(),
      loadFile: vi.fn(async () => {}),
      loadFromGTO: vi.fn(async () => {}),
      loadEDL: vi.fn(() => []),
    } as any,
    viewer: {
      getColorAdjustments: vi.fn(() => ({})),
      getWipeState: vi.fn(() => ({ mode: 'off', position: 0.5, showOriginal: 'left' })),
      getWatermarkState: vi.fn(() => null),
      getPARState: vi.fn(() => null),
      getBackgroundPatternState: vi.fn(() => null),
      getToneMappingState: vi.fn(() => ({})),
      getGhostFrameState: vi.fn(() => ({})),
      getDisplayColorState: vi.fn(() => ({})),
      getGamutMappingState: vi.fn(() => ({})),
      getColorInversion: vi.fn(() => false),
      getCurves: vi.fn(() => ({})),
      getChannelMode: vi.fn(() => 'rgb'),
      getStereoState: vi.fn(() => ({})),
      getStereoEyeTransforms: vi.fn(() => ({})),
      getStereoAlignMode: vi.fn(() => 'none'),
      getDifferenceMatteState: vi.fn(() => ({})),
      getBlendModeState: vi.fn(() => ({})),
      getDeinterlaceParams: vi.fn(() => ({})),
      getFilmEmulationParams: vi.fn(() => ({})),
      getPerspectiveParams: vi.fn(() => ({})),
      getStabilizationParams: vi.fn(() => ({})),
      getUncropState: vi.fn(() => ({})),
    } as any,
    paintEngine: {
      toJSON: vi.fn(() => ({ nextId: 1, show: true, frames: {} })),
    } as any,
    autoSaveManager: {
      initialize: vi.fn(async () => false),
      markDirty: vi.fn(),
      on: vi.fn(),
    } as any,
    autoSaveIndicator: {
      markUnsaved: vi.fn(),
    } as any,
    snapshotManager: {
      initialize: vi.fn(async () => {}),
      createSnapshot: vi.fn(async () => {}),
      createAutoCheckpoint: shouldFail
        ? vi.fn(async () => {
            throw new Error('Storage full');
          })
        : vi.fn(async () => {}),
      getSnapshot: vi.fn(async () => ({
        version: 1,
        name: 'snap',
        savedAt: new Date().toISOString(),
        color: {},
      })),
      getSnapshotMetadata: vi.fn(async () => ({ name: 'My Snapshot' })),
    } as any,
    snapshotPanel: {
      hide: vi.fn(),
    } as any,
    scopesControl: {
      getState: vi.fn(() => ({})),
    } as any,
    colorControls: { setAdjustments: vi.fn() } as any,
    cdlControl: { setCDL: vi.fn() } as any,
    filterControl: { setSettings: vi.fn() } as any,
    transformControl: { setTransform: vi.fn() } as any,
    cropControl: { setState: vi.fn() } as any,
    lensControl: { setParams: vi.fn() } as any,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppPersistenceManager - issue #191: checkpoint failure warns user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createAutoCheckpoint return value
  // -------------------------------------------------------------------------

  describe('createAutoCheckpoint returns boolean', () => {
    it('returns true on success', async () => {
      const ctx = createMockContext({ checkpointShouldFail: false });
      const manager = new AppPersistenceManager(ctx);

      const result = await manager.createAutoCheckpoint('test');
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      const ctx = createMockContext({ checkpointShouldFail: true });
      const manager = new AppPersistenceManager(ctx);

      const result = await manager.createAutoCheckpoint('test');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // restoreSnapshot
  // -------------------------------------------------------------------------

  describe('restoreSnapshot', () => {
    it('shows checkpoint warning when checkpoint fails, but still restores', async () => {
      const ctx = createMockContext({ checkpointShouldFail: true });
      const manager = new AppPersistenceManager(ctx);

      await manager.restoreSnapshot('snap-1');

      // Should have shown a checkpoint warning
      const alertFn = showAlert as ReturnType<typeof vi.fn>;
      const checkpointWarnings = alertFn.mock.calls.filter(
        (call: any[]) => call[1]?.title === 'Checkpoint Warning' && call[1]?.type === 'warning',
      );
      expect(checkpointWarnings.length).toBe(1);
      expect(checkpointWarnings[0]![0]).toContain('No rollback');

      // Should still have proceeded with restore (fromJSON called)
      expect(SessionSerializer.fromJSON).toHaveBeenCalled();

      // Should also show restore success alert
      const restoreAlerts = alertFn.mock.calls.filter(
        (call: any[]) => call[1]?.title === 'Snapshot Restored',
      );
      expect(restoreAlerts.length).toBe(1);
    });

    it('does not show checkpoint warning when checkpoint succeeds', async () => {
      const ctx = createMockContext({ checkpointShouldFail: false });
      const manager = new AppPersistenceManager(ctx);

      await manager.restoreSnapshot('snap-1');

      const alertFn = showAlert as ReturnType<typeof vi.fn>;
      const checkpointWarnings = alertFn.mock.calls.filter(
        (call: any[]) => call[1]?.title === 'Checkpoint Warning',
      );
      expect(checkpointWarnings.length).toBe(0);

      // Restore should still proceed
      expect(SessionSerializer.fromJSON).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // openProject (.orvproject)
  // -------------------------------------------------------------------------

  describe('openProject (.orvproject)', () => {
    it('shows checkpoint warning when checkpoint fails, but still loads', async () => {
      const ctx = createMockContext({ checkpointShouldFail: true });
      const manager = new AppPersistenceManager(ctx);

      const file = new File(['{}'], 'project.orvproject', {
        type: 'application/octet-stream',
      });

      await manager.openProject(file);

      const alertFn = showAlert as ReturnType<typeof vi.fn>;
      const checkpointWarnings = alertFn.mock.calls.filter(
        (call: any[]) => call[1]?.title === 'Checkpoint Warning' && call[1]?.type === 'warning',
      );
      expect(checkpointWarnings.length).toBe(1);
      expect(checkpointWarnings[0]![0]).toContain('No rollback');

      // Should still have proceeded with load
      expect(SessionSerializer.loadFromFile).toHaveBeenCalled();
      expect(SessionSerializer.fromJSON).toHaveBeenCalled();
    });

    it('does not show checkpoint warning when checkpoint succeeds', async () => {
      const ctx = createMockContext({ checkpointShouldFail: false });
      const manager = new AppPersistenceManager(ctx);

      const file = new File(['{}'], 'project.orvproject', {
        type: 'application/octet-stream',
      });

      await manager.openProject(file);

      const alertFn = showAlert as ReturnType<typeof vi.fn>;
      const checkpointWarnings = alertFn.mock.calls.filter(
        (call: any[]) => call[1]?.title === 'Checkpoint Warning',
      );
      expect(checkpointWarnings.length).toBe(0);

      // Load should still proceed
      expect(SessionSerializer.fromJSON).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // openProject (.gto / .rv)
  // -------------------------------------------------------------------------

  describe('openProject (.gto)', () => {
    it('shows checkpoint warning when checkpoint fails, but still loads GTO', async () => {
      const ctx = createMockContext({ checkpointShouldFail: true });
      const manager = new AppPersistenceManager(ctx);

      const file = new File([new ArrayBuffer(8)], 'session.gto', {
        type: 'application/octet-stream',
      });

      await manager.openProject(file);

      const alertFn = showAlert as ReturnType<typeof vi.fn>;
      const checkpointWarnings = alertFn.mock.calls.filter(
        (call: any[]) => call[1]?.title === 'Checkpoint Warning' && call[1]?.type === 'warning',
      );
      expect(checkpointWarnings.length).toBe(1);
      expect(checkpointWarnings[0]![0]).toContain('No rollback');

      // Should still have proceeded with GTO load
      expect(ctx.session.loadFromGTO).toHaveBeenCalled();
    });

    it('does not show checkpoint warning when checkpoint succeeds for GTO', async () => {
      const ctx = createMockContext({ checkpointShouldFail: false });
      const manager = new AppPersistenceManager(ctx);

      const file = new File([new ArrayBuffer(8)], 'session.gto', {
        type: 'application/octet-stream',
      });

      await manager.openProject(file);

      const alertFn = showAlert as ReturnType<typeof vi.fn>;
      const checkpointWarnings = alertFn.mock.calls.filter(
        (call: any[]) => call[1]?.title === 'Checkpoint Warning',
      );
      expect(checkpointWarnings.length).toBe(0);

      // Load should still proceed
      expect(ctx.session.loadFromGTO).toHaveBeenCalled();
    });
  });
});
