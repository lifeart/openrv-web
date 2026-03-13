/**
 * Regression tests for issue #437: The auto-save failure alert points users
 * to a nonexistent `File > Save Project` path.
 *
 * Verifies that:
 * 1. When auto-save initialization fails, a user-facing alert is shown.
 * 2. The alert references the toolbar Save button, NOT "File > Save Project".
 * 3. The alert includes the error details.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppPersistenceManager, type PersistenceManagerContext } from './AppPersistenceManager';
import { showAlert } from './ui/components/shared/Modal';

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

function createMockContext(
  overrides: { initializeError?: Error } = {},
): PersistenceManagerContext {
  const { initializeError } = overrides;

  return {
    session: {
      currentSource: { name: 'test.exr', width: 1920, height: 1080, duration: 100 },
      currentSourceIndex: 0,
      fps: 24,
      currentFrame: 1,
      allSources: [],
      gtoData: null,
      metadata: {
        displayName: '',
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
      initialize: initializeError
        ? vi.fn(async () => { throw initializeError; })
        : vi.fn(async () => false),
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
      setStatus: vi.fn(),
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

describe('Issue #437 – auto-save failure alert references correct save mechanism', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ISS-437-001: shows user-facing alert when auto-save initialization fails', async () => {
    const ctx = createMockContext({
      initializeError: new Error('IndexedDB not available'),
    });
    const mgr = new AppPersistenceManager(ctx);

    await mgr.init();

    expect(showAlert).toHaveBeenCalledWith(
      expect.stringContaining('Auto-save could not be initialized'),
      expect.objectContaining({ type: 'warning', title: 'Auto-Save Unavailable' }),
    );
  });

  it('ISS-437-002: alert includes the error message', async () => {
    const ctx = createMockContext({
      initializeError: new Error('IndexedDB not available'),
    });
    const mgr = new AppPersistenceManager(ctx);

    await mgr.init();

    expect(showAlert).toHaveBeenCalledWith(
      expect.stringContaining('IndexedDB not available'),
      expect.anything(),
    );
  });

  it('ISS-437-003: alert references toolbar Save button, not File > Save Project', async () => {
    const ctx = createMockContext({
      initializeError: new Error('quota exceeded'),
    });
    const mgr = new AppPersistenceManager(ctx);

    await mgr.init();

    const alertMessage = (showAlert as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Auto-save could not be initialized'),
    );
    expect(alertMessage).toBeDefined();
    const message = alertMessage![0] as string;

    // Must reference the toolbar Save button
    expect(message).toContain('Save button');
    expect(message).toContain('toolbar');

    // Must NOT reference the nonexistent File > Save Project menu
    expect(message).not.toContain('File >');
    expect(message).not.toContain('File > Save Project');
  });

  it('ISS-437-004: no alert is shown when auto-save initializes successfully', async () => {
    const ctx = createMockContext(); // no error
    const mgr = new AppPersistenceManager(ctx);

    await mgr.init();

    // showAlert may be called for other reasons (snapshot init, etc.)
    // but NOT for auto-save failure
    const autoSaveAlerts = (showAlert as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Auto-save could not be initialized'),
    );
    expect(autoSaveAlerts).toHaveLength(0);
  });

  it('ISS-437-005: handles non-Error throw values gracefully', async () => {
    const ctx = createMockContext();
    // Override initialize to throw a string instead of Error
    (ctx.autoSaveManager as any).initialize = vi.fn(async () => {
      throw 'storage blocked';
    });
    const mgr = new AppPersistenceManager(ctx);

    await mgr.init();

    expect(showAlert).toHaveBeenCalledWith(
      expect.stringContaining('storage blocked'),
      expect.objectContaining({ type: 'warning' }),
    );
  });
});
