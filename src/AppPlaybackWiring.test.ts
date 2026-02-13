import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { wirePlaybackControls, type PlaybackWiringDeps } from './AppPlaybackWiring';
import type { AppWiringContext } from './AppWiringContext';

vi.mock('./utils/export/SequenceExporter', () => ({ exportSequence: vi.fn() }));
vi.mock('./ui/components/shared/Modal', () => ({ showAlert: vi.fn() }));

function createMockVolumeControl() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    syncVolume: vi.fn(),
    syncMuted: vi.fn(),
  });
}

function createMockExportControl() {
  return new EventEmitter();
}

function createMockHeaderBar() {
  const emitter = new EventEmitter();
  const volumeControl = createMockVolumeControl();
  const exportControl = createMockExportControl();
  return Object.assign(emitter, {
    getVolumeControl: vi.fn(() => volumeControl),
    getExportControl: vi.fn(() => exportControl),
    setAutoSaveIndicator: vi.fn(),
  });
}

function createMockSession() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    volume: 1,
    muted: false,
    currentSource: null,
    currentSourceIndex: 0,
    currentFrame: 0,
    frameCount: 0,
    inPoint: 0,
    outPoint: 0,
    goToFrame: vi.fn(),
    setCurrentSource: vi.fn(),
  });
}

function createMockViewer() {
  return {
    exportFrame: vi.fn(),
    copyFrameToClipboard: vi.fn(),
    renderFrameToCanvas: vi.fn(),
  };
}

function createMockControls() {
  return {
    autoSaveIndicator: {
      connect: vi.fn(),
      setRetryCallback: vi.fn(),
      render: vi.fn(),
    },
    presentationMode: Object.assign(new EventEmitter(), {
      toggle: vi.fn(),
    }),
    snapshotPanel: new EventEmitter(),
    playlistPanel: new EventEmitter(),
    autoSaveManager: {},
    playlistManager: {
      addClip: vi.fn(),
      isEnabled: vi.fn(() => false),
      setCurrentFrame: vi.fn(),
      getClipAtFrame: vi.fn(),
    },
  };
}

function createMockDeps(): PlaybackWiringDeps {
  return {
    getKeyboardHandler: vi.fn(() => ({
      showShortcutsDialog: vi.fn(),
      showCustomBindingsDialog: vi.fn(),
    })),
    getFullscreenManager: vi.fn(() => ({
      toggle: vi.fn(),
    })),
  };
}

function createMockPersistenceManager() {
  return {
    saveProject: vi.fn(),
    openProject: vi.fn(),
    retryAutoSave: vi.fn(),
    restoreSnapshot: vi.fn(),
    saveRvSession: vi.fn(),
  };
}

describe('wirePlaybackControls', () => {
  let session: ReturnType<typeof createMockSession>;
  let viewer: ReturnType<typeof createMockViewer>;
  let headerBar: ReturnType<typeof createMockHeaderBar>;
  let controls: ReturnType<typeof createMockControls>;
  let deps: PlaybackWiringDeps;
  let persistenceManager: ReturnType<typeof createMockPersistenceManager>;

  beforeEach(() => {
    session = createMockSession();
    viewer = createMockViewer();
    headerBar = createMockHeaderBar();
    controls = createMockControls();
    deps = createMockDeps();
    persistenceManager = createMockPersistenceManager();

    const ctx = {
      session,
      viewer,
      headerBar,
      controls,
      persistenceManager,
      paintEngine: {},
      tabBar: {},
      sessionBridge: {},
    } as unknown as AppWiringContext;

    wirePlaybackControls(ctx, deps);
  });

  it('PW-001: volumeChanged on volumeControl sets session.volume', () => {
    const volumeControl = headerBar.getVolumeControl();
    volumeControl.emit('volumeChanged', 0.42);
    expect(session.volume).toBe(0.42);
  });

  it('PW-002: mutedChanged on volumeControl sets session.muted', () => {
    const volumeControl = headerBar.getVolumeControl();
    volumeControl.emit('mutedChanged', true);
    expect(session.muted).toBe(true);
  });

  it('PW-003: session volumeChanged calls volumeControl.syncVolume()', () => {
    const volumeControl = headerBar.getVolumeControl();
    session.emit('volumeChanged', 0.75);
    expect(volumeControl.syncVolume).toHaveBeenCalledWith(0.75);
  });

  it('PW-004: session mutedChanged calls volumeControl.syncMuted()', () => {
    const volumeControl = headerBar.getVolumeControl();
    session.emit('mutedChanged', true);
    expect(volumeControl.syncMuted).toHaveBeenCalledWith(true);
  });

  it('PW-005: exportRequested calls viewer.exportFrame()', () => {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('exportRequested', {
      format: 'png',
      includeAnnotations: false,
      quality: 0.9,
    });
    expect(viewer.exportFrame).toHaveBeenCalledWith('png', false, 0.9);
  });

  it('PW-006: copyRequested calls viewer.copyFrameToClipboard(true)', () => {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('copyRequested', undefined);
    expect(viewer.copyFrameToClipboard).toHaveBeenCalledWith(true);
  });

  it('PW-007: showShortcuts calls keyboardHandler.showShortcutsDialog()', () => {
    headerBar.emit('showShortcuts', undefined);
    const handler = (deps.getKeyboardHandler as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(handler.showShortcutsDialog).toHaveBeenCalled();
  });

  it('PW-008: fullscreenToggle calls fullscreenManager.toggle()', () => {
    headerBar.emit('fullscreenToggle', undefined);
    const manager = (deps.getFullscreenManager as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(manager.toggle).toHaveBeenCalled();
  });
});
