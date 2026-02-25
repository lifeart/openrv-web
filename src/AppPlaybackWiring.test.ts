import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { wirePlaybackControls, type PlaybackWiringDeps } from './AppPlaybackWiring';
import type { AppWiringContext } from './AppWiringContext';
import * as Modal from './ui/components/shared/Modal';

// ---------------------------------------------------------------------------
// Module-level mocks for video export pipeline
// ---------------------------------------------------------------------------

// vi.hoisted creates variables available inside vi.mock factory functions
// (which are hoisted to the top of the file before all other code).
const {
  mockEncodeFn,
  mockCancelFn,
  mockExporterOnFn,
  mockDialogShow,
  mockDialogHide,
  mockDialogDispose,
  mockDialogUpdateProgress,
  mockDialogOnFn,
} = vi.hoisted(() => ({
  mockEncodeFn: vi.fn(),
  mockCancelFn: vi.fn(),
  mockExporterOnFn: vi.fn().mockReturnValue(() => {}),
  mockDialogShow: vi.fn(),
  mockDialogHide: vi.fn(),
  mockDialogDispose: vi.fn(),
  mockDialogUpdateProgress: vi.fn(),
  mockDialogOnFn: vi.fn().mockReturnValue(() => {}),
}));

vi.mock('./export/VideoExporter', () => {
  class MockVideoExporter {
    encode = mockEncodeFn;
    cancel = mockCancelFn;
    on = mockExporterOnFn;
  }

  return {
    VideoExporter: MockVideoExporter,
    ExportCancelledError: class ExportCancelledError extends Error {
      framesEncoded: number;
      constructor(n: number) {
        super(`cancelled after ${n}`);
        this.name = 'ExportCancelledError';
        this.framesEncoded = n;
      }
    },
    isVideoEncoderSupported: vi.fn().mockReturnValue(true),
    isCodecSupported: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('./export/MP4Muxer', () => ({
  muxToMP4Blob: vi.fn().mockReturnValue(new Blob(['fake-mp4'], { type: 'video/mp4' })),
}));

vi.mock('./ui/components/ExportProgress', () => ({
  ExportProgressDialog: vi.fn().mockImplementation(() => ({
    show: mockDialogShow,
    hide: mockDialogHide,
    dispose: mockDialogDispose,
    updateProgress: mockDialogUpdateProgress,
    on: mockDialogOnFn,
  })),
}));

const showAlertSpy = vi.spyOn(Modal, 'showAlert').mockReturnValue(Promise.resolve());

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
  const session = Object.assign(emitter, {
    volume: 1,
    muted: false,
    currentSource: null as { name: string } | null,
    currentSourceIndex: 0,
    currentFrame: 1,
    frameCount: 100,
    fps: 24,
    inPoint: 1,
    outPoint: 100,
    loopMode: 'loop',
    playDirection: 1,
    setCurrentSource: vi.fn((index: number) => {
      session.currentSourceIndex = index;
      session.currentFrame = 1;
      session.inPoint = 1;
      session.outPoint = 100;
    }),
    goToFrame: vi.fn((frame: number) => {
      session.currentFrame = frame;
      session.emit('frameChanged', frame);
    }),
    setInPoint: vi.fn((frame: number) => {
      session.inPoint = frame;
    }),
    setOutPoint: vi.fn((frame: number) => {
      session.outPoint = frame;
    }),
    resetInOutPoints: vi.fn(() => {
      session.inPoint = 1;
      session.outPoint = session.frameCount;
    }),
    pause: vi.fn(),
  });
  return session;
}

function createMockViewer() {
  return {
    exportFrame: vi.fn(),
    exportSourceFrame: vi.fn(),
    copyFrameToClipboard: vi.fn(),
    renderFrameToCanvas: vi.fn(),
  };
}

function createMockControls() {
  const playlistManager = Object.assign(new EventEmitter(), {
    addClip: vi.fn(),
    isEnabled: vi.fn(() => false),
    setEnabled: vi.fn(),
    getClipCount: vi.fn(() => 0),
    getClipByIndex: vi.fn(() => undefined),
    getClips: vi.fn(() => []),
    getClip: vi.fn(() => undefined),
    getCurrentFrame: vi.fn(() => 1),
    getTotalDuration: vi.fn(() => 0),
    getLoopMode: vi.fn(() => 'none'),
    setCurrentFrame: vi.fn(),
    getClipAtFrame: vi.fn(() => null),
    getNextFrame: vi.fn(() => ({ frame: 1, clipChanged: false })),
    getPreviousFrame: vi.fn(() => ({ frame: 1, clipChanged: false })),
    getTransitionAtFrame: vi.fn(() => null),
  });

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
    notePanel: new EventEmitter(),
    playlistPanel: Object.assign(new EventEmitter(), {
      setFps: vi.fn(),
    }),
    autoSaveManager: {},
    playlistManager,
    slateEditor: {
      generateConfig: vi.fn(() => ({
        width: 1920,
        height: 1080,
        fields: [],
        logoPosition: 'bottom-right',
        logoScale: 0.15,
      })),
      dispose: vi.fn(),
    },
  };
}

function createMockDeps(): PlaybackWiringDeps {
  return {
    getKeyboardHandler: vi.fn(() => ({
      showShortcutsDialog: vi.fn(),
      showCustomBindingsDialog: vi.fn(),
    })) as unknown as PlaybackWiringDeps['getKeyboardHandler'],
    getFullscreenManager: vi.fn(() => ({
      toggle: vi.fn(),
    })) as unknown as PlaybackWiringDeps['getFullscreenManager'],
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

  it('PW-006b: sourceExportRequested calls viewer.exportSourceFrame()', () => {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('sourceExportRequested', {
      format: 'jpeg',
      quality: 0.8,
    });
    expect(viewer.exportSourceFrame).toHaveBeenCalledWith('jpeg', 0.8);
  });

  it('PW-007: showShortcuts calls keyboardHandler.showShortcutsDialog()', () => {
    headerBar.emit('showShortcuts', undefined);
    const handler = (deps.getKeyboardHandler as ReturnType<typeof vi.fn>).mock.results[0]!.value;
    expect(handler.showShortcutsDialog).toHaveBeenCalled();
  });

  it('PW-008: fullscreenToggle calls fullscreenManager.toggle()', () => {
    headerBar.emit('fullscreenToggle', undefined);
    const manager = (deps.getFullscreenManager as ReturnType<typeof vi.fn>).mock.results[0]!.value;
    expect(manager.toggle).toHaveBeenCalled();
  });

  it('PW-009: clipSelected jumps to mapped local frame and clip range', () => {
    (controls.playlistManager.isEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (controls.playlistManager.getClipAtFrame as ReturnType<typeof vi.fn>).mockReturnValue({
      sourceIndex: 1,
      localFrame: 42,
      clip: { inPoint: 10, outPoint: 90 },
    });

    controls.playlistPanel.emit('clipSelected', { sourceIndex: 1, frame: 101 });

    expect(session.setCurrentSource).toHaveBeenCalledWith(1);
    expect(session.setInPoint).toHaveBeenCalledWith(10);
    expect(session.setOutPoint).toHaveBeenCalledWith(90);
    expect(session.goToFrame).toHaveBeenCalledWith(42);
    expect(controls.playlistManager.setCurrentFrame).toHaveBeenCalledWith(101);
  });

  it('PW-010: enabling playlist with no clips disables mode and shows warning', () => {
    controls.playlistManager.emit('enabledChanged', { enabled: true });

    expect(controls.playlistManager.setEnabled).toHaveBeenCalledWith(false);
    expect(showAlertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Add at least one clip'),
      expect.objectContaining({ type: 'warning' }),
    );
  });

  it('PW-011: wrapped playback frame advances to next clip when playlist mode is enabled', () => {
    const clipA = {
      id: 'clip-a',
      sourceIndex: 0,
      sourceName: 'A',
      inPoint: 1,
      outPoint: 10,
      globalStartFrame: 1,
      duration: 10,
    };
    const clipB = {
      id: 'clip-b',
      sourceIndex: 1,
      sourceName: 'B',
      inPoint: 5,
      outPoint: 15,
      globalStartFrame: 11,
      duration: 11,
    };
    const clips = [clipA, clipB];
    let currentGlobal = 10;

    (controls.playlistManager.isEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (controls.playlistManager.getClipCount as ReturnType<typeof vi.fn>).mockReturnValue(clips.length);
    (controls.playlistManager.getClips as ReturnType<typeof vi.fn>).mockReturnValue(clips);
    (controls.playlistManager.getClipByIndex as ReturnType<typeof vi.fn>).mockImplementation((i: number) => clips[i]);
    (controls.playlistManager.getClip as ReturnType<typeof vi.fn>).mockImplementation((id: string) => clips.find(c => c.id === id));
    (controls.playlistManager.getCurrentFrame as ReturnType<typeof vi.fn>).mockImplementation(() => currentGlobal);
    (controls.playlistManager.setCurrentFrame as ReturnType<typeof vi.fn>).mockImplementation((frame: number) => {
      currentGlobal = frame;
    });
    (controls.playlistManager.getClipAtFrame as ReturnType<typeof vi.fn>).mockImplementation((globalFrame: number) => {
      const clip = globalFrame <= 10 ? clipA : clipB;
      const clipIndex = clip === clipA ? 0 : 1;
      return {
        clip,
        clipIndex,
        sourceIndex: clip.sourceIndex,
        localFrame: clip.inPoint + (globalFrame - clip.globalStartFrame),
      };
    });
    (controls.playlistManager.getLoopMode as ReturnType<typeof vi.fn>).mockReturnValue('all');
    (controls.playlistManager.getNextFrame as ReturnType<typeof vi.fn>).mockImplementation((global: number) => {
      if (global === 10) return { frame: 11, clipChanged: true };
      return { frame: global + 1, clipChanged: false };
    });

    session.currentSourceIndex = 0;
    session.currentFrame = 10;
    session.playDirection = 1;

    session.emit('frameChanged', 10); // establish last frame at clip end
    session.currentFrame = 1; // source-level loop wrap
    session.emit('frameChanged', 1);

    expect(session.setCurrentSource).toHaveBeenCalledWith(1);
    expect(session.setInPoint).toHaveBeenCalledWith(5);
    expect(session.setOutPoint).toHaveBeenCalledWith(15);
    expect(session.goToFrame).toHaveBeenCalledWith(5);
  });

  it('PW-012: wrapped playback at playlist end with no loop pauses at clip boundary', () => {
    const clip = {
      id: 'clip-last',
      sourceIndex: 0,
      sourceName: 'A',
      inPoint: 1,
      outPoint: 10,
      globalStartFrame: 1,
      duration: 10,
    };
    let currentGlobal = 10;

    (controls.playlistManager.isEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (controls.playlistManager.getClipCount as ReturnType<typeof vi.fn>).mockReturnValue(1);
    (controls.playlistManager.getClips as ReturnType<typeof vi.fn>).mockReturnValue([clip]);
    (controls.playlistManager.getClip as ReturnType<typeof vi.fn>).mockReturnValue(clip);
    (controls.playlistManager.getCurrentFrame as ReturnType<typeof vi.fn>).mockImplementation(() => currentGlobal);
    (controls.playlistManager.setCurrentFrame as ReturnType<typeof vi.fn>).mockImplementation((frame: number) => {
      currentGlobal = frame;
    });
    (controls.playlistManager.getClipAtFrame as ReturnType<typeof vi.fn>).mockReturnValue({
      clip,
      clipIndex: 0,
      sourceIndex: 0,
      localFrame: 1,
    });
    (controls.playlistManager.getLoopMode as ReturnType<typeof vi.fn>).mockReturnValue('none');

    session.currentSourceIndex = 0;
    session.currentFrame = 10;
    session.playDirection = 1;

    session.emit('frameChanged', 10);
    session.currentFrame = 1;
    session.emit('frameChanged', 1);

    expect(session.pause).toHaveBeenCalled();
    expect(session.goToFrame).toHaveBeenCalledWith(10);
  });
});

// ---------------------------------------------------------------------------
// Video export e2e tests
// ---------------------------------------------------------------------------

describe('wirePlaybackControls — video export', () => {
  let session: ReturnType<typeof createMockSession>;
  let viewer: ReturnType<typeof createMockViewer>;
  let headerBar: ReturnType<typeof createMockHeaderBar>;
  let controls: ReturnType<typeof createMockControls>;
  let deps: PlaybackWiringDeps;
  let persistenceManager: ReturnType<typeof createMockPersistenceManager>;
  let mockCanvas: HTMLCanvasElement;

  beforeEach(async () => {
    vi.clearAllMocks();
    session = createMockSession();
    session.currentSource = { name: 'test-clip.mov' };
    session.frameCount = 100;
    session.inPoint = 10;
    session.outPoint = 40;
    session.fps = 24;

    viewer = createMockViewer();
    mockCanvas = document.createElement('canvas');
    mockCanvas.width = 320;
    mockCanvas.height = 240;
    viewer.renderFrameToCanvas.mockResolvedValue(mockCanvas);

    headerBar = createMockHeaderBar();
    controls = createMockControls();
    deps = createMockDeps();
    persistenceManager = createMockPersistenceManager();

    // Re-configure mocked module exports after clearAllMocks
    const VideoExporterMod = await import('./export/VideoExporter');
    (VideoExporterMod.isVideoEncoderSupported as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (VideoExporterMod.isCodecSupported as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockExporterOnFn.mockReturnValue(() => {});
    mockDialogOnFn.mockReturnValue(() => {});

    // Reset mock encode to default success
    mockEncodeFn.mockResolvedValue({
      chunks: [
        { data: new Uint8Array([0, 0, 0, 1, 0x65, 0x88]), type: 'key', timestamp: 0 },
        { data: new Uint8Array([0, 0, 0, 1, 0x41, 0x9a]), type: 'delta', timestamp: 41667 },
        { data: new Uint8Array([0, 0, 0, 1, 0x41, 0x9a]), type: 'delta', timestamp: 83333 },
      ],
      codec: 'avc1.42001f',
      width: 320,
      height: 240,
      fps: 24,
      totalFrames: 3,
      encodingTimeMs: 100,
    });

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

  afterEach(() => {
    document.querySelectorAll('a[download]').forEach((el) => el.remove());
  });

  function emitVideoExport(useInOutRange: boolean): void {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('videoExportRequested', {
      includeAnnotations: true,
      useInOutRange,
    });
  }

  it('PW-VE01: videoExportRequested shows progress dialog and calls encode', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockDialogShow).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(mockEncodeFn).toHaveBeenCalled();
    });
  });

  it('PW-VE02: encode receives correct frame range from in/out points', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockEncodeFn).toHaveBeenCalled();
    });

    const [config] = mockEncodeFn.mock.calls[0]!;
    expect(config.frameRange).toEqual({ start: 10, end: 40 });
    expect(config.width).toBe(320);
    expect(config.height).toBe(240);
  });

  it('PW-VE03: encode receives full frame range when useInOutRange is false', async () => {
    emitVideoExport(false);

    await vi.waitFor(() => {
      expect(mockEncodeFn).toHaveBeenCalled();
    });

    const [config] = mockEncodeFn.mock.calls[0]!;
    expect(config.frameRange).toEqual({ start: 1, end: 100 });
  });

  it('PW-VE04: pre-renders first frame via viewer.renderFrameToCanvas', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(viewer.renderFrameToCanvas).toHaveBeenCalledWith(10, true);
    });
  });

  it('PW-VE05: progress dialog is hidden and disposed after encode completes', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockDialogHide).toHaveBeenCalled();
    });
    expect(mockDialogDispose).toHaveBeenCalled();
  });

  it('PW-VE06: shows success alert after export completes', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('Exported'),
        expect.objectContaining({ type: 'success' }),
      );
    });
  });

  it('PW-VE07: shows warning when no source is loaded', async () => {
    session.currentSource = null;
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('No media loaded'),
        expect.objectContaining({ type: 'warning' }),
      );
    });
  });

  it('PW-VE08: shows error when VideoEncoder is unsupported', async () => {
    const { isVideoEncoderSupported } = await import('./export/VideoExporter');
    (isVideoEncoderSupported as ReturnType<typeof vi.fn>).mockReturnValue(false);

    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('not available'),
        expect.objectContaining({ type: 'error' }),
      );
    });
  });

  it('PW-VE09: shows error when no H.264 codec is supported', async () => {
    const { isVideoEncoderSupported, isCodecSupported } = await import('./export/VideoExporter');
    (isVideoEncoderSupported as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (isCodecSupported as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('No supported H.264'),
        expect.objectContaining({ type: 'error' }),
      );
    });
  });

  it('PW-VE10: concurrent videoExportRequested shows busy warning', async () => {
    mockEncodeFn.mockReturnValue(new Promise(() => {})); // never resolves
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockDialogShow).toHaveBeenCalled();
    });

    showAlertSpy.mockClear();
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('already in progress'),
        expect.objectContaining({ type: 'warning' }),
      );
    });
  });

  it('PW-VE11: shows cancel message when ExportCancelledError is thrown', async () => {
    const { ExportCancelledError } = await import('./export/VideoExporter');
    mockEncodeFn.mockRejectedValue(new ExportCancelledError(5));

    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('cancelled'),
        expect.objectContaining({ type: 'info' }),
      );
    });
  });

  it('PW-VE12: shows error message when encode throws unexpected error', async () => {
    mockEncodeFn.mockRejectedValue(new Error('GPU exploded'));

    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('GPU exploded'),
        expect.objectContaining({ type: 'error' }),
      );
    });
  });

  it('PW-VE13: frame provider returns non-null canvas for each frame', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockEncodeFn).toHaveBeenCalled();
    });

    const [, frameProvider] = mockEncodeFn.mock.calls[0]!;
    const canvas = await frameProvider(10);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas!.width).toBe(320);
    expect(canvas!.height).toBe(240);
  });

  it('PW-VE14: frame provider renders via viewer for non-first frames', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockEncodeFn).toHaveBeenCalled();
    });

    viewer.renderFrameToCanvas.mockClear();
    const [, frameProvider] = mockEncodeFn.mock.calls[0]!;

    await frameProvider(11);
    expect(viewer.renderFrameToCanvas).toHaveBeenCalledWith(11, true);
  });

  it('PW-VE15: registers cancel listener on progress dialog', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockDialogOnFn).toHaveBeenCalledWith('cancel', expect.any(Function));
    });
  });

  it('PW-VE16: registers progress listener on exporter', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockExporterOnFn).toHaveBeenCalledWith('progress', expect.any(Function));
    });
  });

  it('PW-VE17: frame provider returns cached first frame on startFrame', async () => {
    emitVideoExport(true);

    await vi.waitFor(() => {
      expect(mockEncodeFn).toHaveBeenCalled();
    });

    // Reset to track only the frame provider's calls
    viewer.renderFrameToCanvas.mockClear();
    const [, frameProvider] = mockEncodeFn.mock.calls[0]!;

    // First frame should use cached canvas, not re-render
    const canvas = await frameProvider(10);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(viewer.renderFrameToCanvas).not.toHaveBeenCalled();
  });
});
