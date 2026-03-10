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
  mockDownloadAnnotationsJSON,
  mockParseAnnotationsJSON,
  mockApplyAnnotationsJSON,
  mockExportAnnotationsPDF,
  mockExportSequence,
} = vi.hoisted(() => ({
  mockEncodeFn: vi.fn(),
  mockCancelFn: vi.fn(),
  mockExporterOnFn: vi.fn().mockReturnValue(() => {}),
  mockDialogShow: vi.fn(),
  mockDialogHide: vi.fn(),
  mockDialogDispose: vi.fn(),
  mockDialogUpdateProgress: vi.fn(),
  mockDialogOnFn: vi.fn().mockReturnValue(() => {}),
  mockDownloadAnnotationsJSON: vi.fn(),
  mockParseAnnotationsJSON: vi.fn(),
  mockApplyAnnotationsJSON: vi.fn(),
  mockExportAnnotationsPDF: vi.fn().mockResolvedValue(undefined),
  mockExportSequence: vi.fn(),
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
  ExportProgressDialog: class MockExportProgressDialog {
    show = mockDialogShow;
    hide = mockDialogHide;
    dispose = mockDialogDispose;
    updateProgress = mockDialogUpdateProgress;
    on = mockDialogOnFn;
  },
}));

vi.mock('./utils/export/SequenceExporter', () => ({
  exportSequence: mockExportSequence,
}));

vi.mock('./utils/export/AnnotationJSONExporter', () => ({
  downloadAnnotationsJSON: mockDownloadAnnotationsJSON,
  parseAnnotationsJSON: mockParseAnnotationsJSON,
  applyAnnotationsJSON: mockApplyAnnotationsJSON,
}));

vi.mock('./utils/export/AnnotationPDFExporter', () => ({
  exportAnnotationsPDF: mockExportAnnotationsPDF,
}));

const showAlertSpy = vi.spyOn(Modal, 'showAlert').mockReturnValue(Promise.resolve());
const showConfirmSpy = vi.spyOn(Modal, 'showConfirm').mockResolvedValue(true);

const mockPreferencesManager = {
  exportAll: vi.fn(() => '{"version":1}'),
  importAll: vi.fn(),
  resetAll: vi.fn(),
};

vi.mock('./core/PreferencesManager', () => ({
  getCorePreferencesManager: () => mockPreferencesManager,
}));

function createMockVolumeControl() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    syncVolume: vi.fn(),
    syncMuted: vi.fn(),
    syncAudioScrub: vi.fn(),
    setScrubAudioAvailable: vi.fn(),
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
    currentSource: null as { name?: string; type?: string } | null,
    currentSourceIndex: 0,
    currentFrame: 1,
    frameCount: 100,
    fps: 24,
    inPoint: 1,
    outPoint: 100,
    loopMode: 'loop',
    playDirection: 1,
    metadata: { displayName: 'Test Session' },
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
    audioPlaybackManager: {
      isUsingWebAudio: false,
    },
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
      toggle: vi.fn().mockResolvedValue(undefined),
    })) as unknown as PlaybackWiringDeps['getFullscreenManager'],
  };
}

function createMockPersistenceManager() {
  return {
    saveProject: vi.fn(),
    openProject: vi.fn(),
    retryAutoSave: vi.fn(),
    restoreSnapshot: vi.fn(),
    createQuickSnapshot: vi.fn(),
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
  let subs: ReturnType<typeof wirePlaybackControls>;

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

    subs = wirePlaybackControls(ctx, deps);
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

  it('PW-004b: initial wiring disables audio scrub when decoded audio is unavailable', () => {
    const volumeControl = headerBar.getVolumeControl();
    expect(volumeControl.setScrubAudioAvailable).toHaveBeenCalledWith(false);
  });

  it('PW-004c: audio scrub availability follows session source and decode state', () => {
    const volumeControl = headerBar.getVolumeControl();
    volumeControl.setScrubAudioAvailable.mockClear();

    session.currentSource = { name: 'shot.mov', type: 'video' };
    session.audioPlaybackManager.isUsingWebAudio = true;
    session.emit('audioScrubAvailabilityChanged', true);
    expect(volumeControl.setScrubAudioAvailable).toHaveBeenLastCalledWith(true);

    session.currentSource = { name: 'plate.exr', type: 'image' };
    session.emit('durationChanged', 100);
    expect(volumeControl.setScrubAudioAvailable).toHaveBeenLastCalledWith(false);
  });

  // ---- Audio error surfacing (fix #189) ----

  it('PW-004d: audioError event shows a warning alert to the user', () => {
    showAlertSpy.mockClear();

    session.emit('audioError', {
      type: 'decode',
      message: 'Failed to decode audio',
    });

    expect(showAlertSpy).toHaveBeenCalledTimes(1);
    expect(showAlertSpy).toHaveBeenCalledWith('Audio playback error: Failed to decode audio', {
      type: 'warning',
      title: 'Audio Error',
    });
  });

  it('PW-004e: audioError event surfaces autoplay errors', () => {
    showAlertSpy.mockClear();

    session.emit('audioError', {
      type: 'autoplay',
      message: 'Playback blocked by browser autoplay policy. Click to enable audio.',
    });

    expect(showAlertSpy).toHaveBeenCalledTimes(1);
    expect(showAlertSpy).toHaveBeenCalledWith(
      'Audio playback error: Playback blocked by browser autoplay policy. Click to enable audio.',
      { type: 'warning', title: 'Audio Error' },
    );
  });

  it('PW-004f: normal volume/mute operations do not trigger audio error alerts', () => {
    showAlertSpy.mockClear();

    const volumeControl = headerBar.getVolumeControl();
    volumeControl.emit('volumeChanged', 0.5);
    volumeControl.emit('mutedChanged', true);
    volumeControl.emit('mutedChanged', false);
    session.emit('volumeChanged', 0.8);
    session.emit('mutedChanged', false);

    expect(showAlertSpy).not.toHaveBeenCalled();
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

  it('PW-006: copyRequested with annotations passes true to viewer.copyFrameToClipboard', () => {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('copyRequested', { includeAnnotations: true });
    expect(viewer.copyFrameToClipboard).toHaveBeenCalledWith(true);
  });

  it('PW-006c: copyRequested with annotations unchecked passes false to viewer.copyFrameToClipboard (#176)', () => {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('copyRequested', { includeAnnotations: false });
    expect(viewer.copyFrameToClipboard).toHaveBeenCalledWith(false);
  });

  it('PW-006d: copyRequested shows alert when clipboard copy fails (#196)', async () => {
    showAlertSpy.mockClear();
    viewer.copyFrameToClipboard.mockResolvedValue(false);
    const exportControl = headerBar.getExportControl();
    exportControl.emit('copyRequested', { includeAnnotations: true });
    // Wait for the async handler to complete
    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        'Failed to copy frame to clipboard. Your browser may have denied clipboard access.',
        { type: 'warning', title: 'Clipboard Unavailable' },
      );
    });
  });

  it('PW-006e: copyRequested does not show alert when clipboard copy succeeds (#196)', async () => {
    showAlertSpy.mockClear();
    viewer.copyFrameToClipboard.mockResolvedValue(true);
    const exportControl = headerBar.getExportControl();
    exportControl.emit('copyRequested', { includeAnnotations: true });
    await vi.waitFor(() => {
      expect(viewer.copyFrameToClipboard).toHaveBeenCalled();
    });
    expect(showAlertSpy).not.toHaveBeenCalled();
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

  it('PW-008b: fullscreenToggle failure shows user alert (#182)', async () => {
    const mockManager = {
      toggle: vi.fn().mockRejectedValue(new Error('blocked by browser')),
    };
    (deps.getFullscreenManager as ReturnType<typeof vi.fn>).mockReturnValue(mockManager);
    showAlertSpy.mockClear();

    headerBar.emit('fullscreenToggle', undefined);
    // Wait for the rejected promise to be caught and showAlert to fire
    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        'Fullscreen is not available. Your browser may be blocking it.',
        expect.objectContaining({ type: 'warning', title: 'Fullscreen Unavailable' }),
      );
    });
  });

  it('PW-008c: successful fullscreenToggle does not show error alert (#182)', async () => {
    showAlertSpy.mockClear();
    headerBar.emit('fullscreenToggle', undefined);
    // Give async chain time to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(showAlertSpy).not.toHaveBeenCalled();
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
    (controls.playlistManager.getClip as ReturnType<typeof vi.fn>).mockImplementation((id: string) =>
      clips.find((c) => c.id === id),
    );
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

  it('PW-013: annotationsJSONExportRequested calls downloadAnnotationsJSON with paint engine', () => {
    session.currentSource = { name: 'shot_v001.mov' };
    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsJSONExportRequested', undefined);
    expect(mockDownloadAnnotationsJSON).toHaveBeenCalledWith(
      expect.anything(), // paintEngine
      'shot_v001', // filename without extension
    );
  });

  it('PW-014: annotationsJSONExportRequested uses fallback name when no source loaded', () => {
    session.currentSource = null;
    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsJSONExportRequested', undefined);
    expect(mockDownloadAnnotationsJSON).toHaveBeenCalledWith(expect.anything(), 'annotations');
  });

  it('PW-015: annotationsPDFExportRequested calls exportAnnotationsPDF', () => {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsPDFExportRequested', undefined);
    expect(mockExportAnnotationsPDF).toHaveBeenCalledWith(
      expect.anything(), // paintEngine
      expect.anything(), // session
      expect.any(Function), // renderFrame callback
      expect.objectContaining({ title: 'Test Session' }),
    );
  });

  it('PW-015b: annotationsPDFExportRequested shows alert when popup is blocked', async () => {
    mockExportAnnotationsPDF.mockRejectedValueOnce(new Error('Failed to open print window. Please allow popups for this site.'));
    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsPDFExportRequested', undefined);
    // Allow the microtask (.catch handler) to run
    await new Promise((r) => setTimeout(r, 0));
    expect(showAlertSpy).toHaveBeenCalledWith(
      expect.stringContaining('PDF export failed'),
      expect.objectContaining({ type: 'error', title: 'PDF Export Error' }),
    );
  });

  it('PW-015c: annotationsPDFExportRequested shows alert on other export errors', async () => {
    mockExportAnnotationsPDF.mockRejectedValueOnce(new Error('Some unexpected error'));
    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsPDFExportRequested', undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(showAlertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Some unexpected error'),
      expect.objectContaining({ type: 'error', title: 'PDF Export Error' }),
    );
  });

  it('PW-015d: annotationsPDFExportRequested does not show alert on success', async () => {
    mockExportAnnotationsPDF.mockResolvedValueOnce(undefined);
    showAlertSpy.mockClear();
    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsPDFExportRequested', undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(showAlertSpy).not.toHaveBeenCalled();
  });

  it('PW-018: annotationsJSONImportRequested opens file picker', () => {
    const clickSpy = vi.fn();
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'input') {
        el.click = clickSpy;
      }
      return el;
    });

    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsJSONImportRequested', undefined);

    expect(clickSpy).toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  it('PW-019: annotationsJSONImportRequested calls parseAnnotationsJSON and applyAnnotationsJSON on valid file', async () => {
    const parsedData = { version: 1, source: 'openrv-web', frames: { '1': [] } };
    mockParseAnnotationsJSON.mockReturnValue(parsedData);
    mockApplyAnnotationsJSON.mockReturnValue(3);

    let changeHandler: (() => void) | null = null;
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'input') {
        const origAddEventListener = el.addEventListener.bind(el);
        el.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject) => {
          if (type === 'change') {
            changeHandler = handler as () => void;
          }
          origAddEventListener(type, handler);
        }) as typeof el.addEventListener;
        Object.defineProperty(el, 'files', {
          get: () => [new File(['{"version":1}'], 'annotations.json', { type: 'application/json' })],
        });
        el.click = vi.fn();
      }
      return el;
    });

    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsJSONImportRequested', undefined);
    expect(changeHandler).not.toBeNull();
    changeHandler!();

    await vi.waitFor(() => {
      expect(mockParseAnnotationsJSON).toHaveBeenCalledWith('{"version":1}');
    });
    expect(mockApplyAnnotationsJSON).toHaveBeenCalledWith(
      expect.anything(), // paintEngine
      parsedData,
      { mode: 'replace' },
    );
    expect(showAlertSpy).toHaveBeenCalledWith(
      expect.stringContaining('Successfully imported 3 annotations'),
      expect.objectContaining({ type: 'success' }),
    );

    createElementSpy.mockRestore();
  });

  it('PW-020: annotationsJSONImportRequested shows error for invalid JSON', async () => {
    mockParseAnnotationsJSON.mockReturnValue(null);

    let changeHandler: (() => void) | null = null;
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'input') {
        const origAddEventListener = el.addEventListener.bind(el);
        el.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject) => {
          if (type === 'change') {
            changeHandler = handler as () => void;
          }
          origAddEventListener(type, handler);
        }) as typeof el.addEventListener;
        Object.defineProperty(el, 'files', {
          get: () => [new File(['not-valid'], 'bad.json', { type: 'application/json' })],
        });
        el.click = vi.fn();
      }
      return el;
    });

    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsJSONImportRequested', undefined);
    changeHandler!();

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid annotation JSON file'),
        expect.objectContaining({ title: 'Import Error' }),
      );
    });

    createElementSpy.mockRestore();
  });

  it('PW-021: annotationsJSONImportRequested shows error when applyAnnotationsJSON throws', async () => {
    const parsedData = { version: 1, source: 'openrv-web', frames: {} };
    mockParseAnnotationsJSON.mockReturnValue(parsedData);
    mockApplyAnnotationsJSON.mockImplementation(() => {
      throw new Error('Paint engine exploded');
    });

    let changeHandler: (() => void) | null = null;
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'input') {
        const origAddEventListener = el.addEventListener.bind(el);
        el.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject) => {
          if (type === 'change') {
            changeHandler = handler as () => void;
          }
          origAddEventListener(type, handler);
        }) as typeof el.addEventListener;
        Object.defineProperty(el, 'files', {
          get: () => [new File(['{"version":1}'], 'annotations.json', { type: 'application/json' })],
        });
        el.click = vi.fn();
      }
      return el;
    });

    const exportControl = headerBar.getExportControl();
    exportControl.emit('annotationsJSONImportRequested', undefined);
    changeHandler!();

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import annotations: Paint engine exploded'),
        expect.objectContaining({ title: 'Import Error' }),
      );
    });

    createElementSpy.mockRestore();
  });

  it('PW-016: snapshotPanel createRequested calls persistenceManager.createQuickSnapshot()', () => {
    controls.snapshotPanel.emit('createRequested', undefined);
    expect(persistenceManager.createQuickSnapshot).toHaveBeenCalled();
  });

  it('PW-017: snapshotPanel restoreRequested calls persistenceManager.restoreSnapshot()', () => {
    controls.snapshotPanel.emit('restoreRequested', { id: 'snap-42' });
    expect(persistenceManager.restoreSnapshot).toHaveBeenCalledWith('snap-42');
  });

  describe('disposal', () => {
    it('PW-DISP-001: callbacks fire before dispose', () => {
      const volumeControl = headerBar.getVolumeControl();
      volumeControl.emit('volumeChanged', 0.6);
      expect(session.volume).toBe(0.6);
    });

    it('PW-DISP-002: callbacks do not fire after dispose', () => {
      subs.subscriptions.dispose();

      session.volume = 1; // reset
      const volumeControl = headerBar.getVolumeControl();
      volumeControl.emit('volumeChanged', 0.3);
      expect(session.volume).toBe(1); // unchanged
    });
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

// ---------------------------------------------------------------------------
// Sequence export tests
// ---------------------------------------------------------------------------

describe('wirePlaybackControls — sequence export', () => {
  let session: ReturnType<typeof createMockSession>;
  let viewer: ReturnType<typeof createMockViewer>;
  let headerBar: ReturnType<typeof createMockHeaderBar>;
  let controls: ReturnType<typeof createMockControls>;
  let deps: PlaybackWiringDeps;
  let persistenceManager: ReturnType<typeof createMockPersistenceManager>;

  beforeEach(async () => {
    vi.clearAllMocks();
    session = createMockSession();
    session.currentSource = { name: 'test-clip.exr' };
    session.frameCount = 50;
    session.inPoint = 5;
    session.outPoint = 15;
    session.fps = 24;

    viewer = createMockViewer();
    const mockCanvas = document.createElement('canvas');
    mockCanvas.width = 320;
    mockCanvas.height = 240;
    viewer.renderFrameToCanvas.mockResolvedValue(mockCanvas);

    headerBar = createMockHeaderBar();
    controls = createMockControls();
    deps = createMockDeps();
    persistenceManager = createMockPersistenceManager();

    mockDialogOnFn.mockReturnValue(() => {});

    // Default: exportSequence resolves successfully
    mockExportSequence.mockResolvedValue({
      success: true,
      exportedFrames: 11,
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

  function emitSequenceExport(useInOutRange: boolean): void {
    const exportControl = headerBar.getExportControl();
    exportControl.emit('sequenceExportRequested', {
      format: 'png',
      includeAnnotations: false,
      quality: 0.9,
      useInOutRange,
    });
  }

  it('PW-SE01: sequence export uses ExportProgressDialog, not inline div', async () => {
    emitSequenceExport(true);

    await vi.waitFor(() => {
      expect(mockDialogShow).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(mockExportSequence).toHaveBeenCalled();
    });
  });

  it('PW-SE02: sequence export shows progress updates via dialog', async () => {
    // Make exportSequence call the onProgress callback
    mockExportSequence.mockImplementation(
      async (
        _options: unknown,
        _renderFrame: unknown,
        onProgress?: (progress: { currentFrame: number; totalFrames: number; percent: number; cancelled: boolean }) => void,
      ) => {
        if (onProgress) {
          onProgress({ currentFrame: 7, totalFrames: 11, percent: 27, cancelled: false });
          onProgress({ currentFrame: 10, totalFrames: 11, percent: 55, cancelled: false });
        }
        return { success: true, exportedFrames: 11 };
      },
    );

    emitSequenceExport(true);

    await vi.waitFor(() => {
      expect(mockDialogUpdateProgress).toHaveBeenCalled();
    });

    // Verify progress was forwarded to ExportProgressDialog.updateProgress
    const calls = mockDialogUpdateProgress.mock.calls as Array<[{ percentage: number; status: string }]>;
    // Find a call with percentage 27
    const call27 = calls.find((c) => c[0].percentage === 27);
    expect(call27).toBeDefined();
    expect(call27![0]).toMatchObject({
      percentage: 27,
      status: 'encoding',
    });

    const call55 = calls.find((c) => c[0].percentage === 55);
    expect(call55).toBeDefined();
  });

  it('PW-SE03: cancel via dialog sets cancellation token', async () => {
    let capturedCancelToken: { cancelled: boolean } | undefined;

    mockExportSequence.mockImplementation(
      async (
        _options: unknown,
        _renderFrame: unknown,
        _onProgress: unknown,
        cancellationToken?: { cancelled: boolean },
      ) => {
        capturedCancelToken = cancellationToken;
        // Simulate waiting so cancel can fire
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { success: false, exportedFrames: 0, error: 'Export cancelled by user' };
      },
    );

    // Make the dialog's on('cancel') capture the handler and call it
    let cancelHandler: (() => void) | undefined;
    mockDialogOnFn.mockImplementation((event: string, handler: () => void) => {
      if (event === 'cancel') {
        cancelHandler = handler;
      }
      return () => {};
    });

    emitSequenceExport(true);

    await vi.waitFor(() => {
      expect(cancelHandler).toBeDefined();
    });

    // Trigger cancel
    cancelHandler!();

    expect(capturedCancelToken!.cancelled).toBe(true);
  });

  it('PW-SE04: dialog is hidden and disposed after export completes', async () => {
    emitSequenceExport(true);

    await vi.waitFor(() => {
      expect(mockDialogHide).toHaveBeenCalled();
    });

    expect(mockDialogDispose).toHaveBeenCalled();
  });

  it('PW-SE05: dialog is hidden and disposed even when export throws', async () => {
    mockExportSequence.mockRejectedValue(new Error('render failure'));

    emitSequenceExport(true);

    await vi.waitFor(() => {
      expect(mockDialogHide).toHaveBeenCalled();
    });

    expect(mockDialogDispose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Preferences management (export / import / reset)
// ---------------------------------------------------------------------------

describe('preferences management wiring', () => {
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

    mockPreferencesManager.exportAll.mockClear();
    mockPreferencesManager.importAll.mockClear();
    mockPreferencesManager.resetAll.mockClear();
    showAlertSpy.mockClear();
    showConfirmSpy.mockClear();
  });

  it('PW-PREF01: exportPreferences triggers JSON download', () => {
    const clickSpy = vi.fn();
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });
    const revokeURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    headerBar.emit('exportPreferences', undefined);

    expect(mockPreferencesManager.exportAll).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeURL).toHaveBeenCalled();

    createElementSpy.mockRestore();
    revokeURL.mockRestore();
  });

  it('PW-PREF02: importPreferences opens file picker', () => {
    const clickSpy = vi.fn();
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'input') {
        el.click = clickSpy;
      }
      return el;
    });

    headerBar.emit('importPreferences', undefined);

    expect(clickSpy).toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  it('PW-PREF03: importPreferences calls importAll on file read', async () => {
    let changeHandler: (() => void) | null = null;
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'input') {
        const origAddEventListener = el.addEventListener.bind(el);
        el.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject) => {
          if (type === 'change') {
            changeHandler = handler as () => void;
          }
          origAddEventListener(type, handler);
        }) as typeof el.addEventListener;
        Object.defineProperty(el, 'files', {
          get: () => [new File(['{"version":1}'], 'prefs.json', { type: 'application/json' })],
        });
        el.click = vi.fn();
      }
      return el;
    });

    headerBar.emit('importPreferences', undefined);
    expect(changeHandler).not.toBeNull();
    changeHandler!();

    // Wait for FileReader to complete
    await vi.waitFor(() => {
      expect(mockPreferencesManager.importAll).toHaveBeenCalledWith('{"version":1}');
    });

    createElementSpy.mockRestore();
  });

  it('PW-PREF04: importPreferences shows error on invalid JSON', async () => {
    mockPreferencesManager.importAll.mockImplementation(() => {
      throw new Error('Invalid preferences JSON payload');
    });

    let changeHandler: (() => void) | null = null;
    const createElementOrig = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElementOrig(tag);
      if (tag === 'input') {
        const origAddEventListener = el.addEventListener.bind(el);
        el.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject) => {
          if (type === 'change') {
            changeHandler = handler as () => void;
          }
          origAddEventListener(type, handler);
        }) as typeof el.addEventListener;
        Object.defineProperty(el, 'files', {
          get: () => [new File(['not-json'], 'prefs.json', { type: 'application/json' })],
        });
        el.click = vi.fn();
      }
      return el;
    });

    headerBar.emit('importPreferences', undefined);
    changeHandler!();

    await vi.waitFor(() => {
      expect(showAlertSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import preferences'),
        expect.objectContaining({ title: 'Import Error' }),
      );
    });

    createElementSpy.mockRestore();
  });

  it('PW-PREF05: resetPreferences shows confirmation before resetting', async () => {
    showConfirmSpy.mockResolvedValue(true);

    headerBar.emit('resetPreferences', undefined);

    await vi.waitFor(() => {
      expect(showConfirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('reset all preferences'),
        expect.objectContaining({ title: 'Reset All Preferences', confirmText: 'Reset' }),
      );
      expect(mockPreferencesManager.resetAll).toHaveBeenCalled();
    });
  });

  it('PW-PREF06: resetPreferences does not reset when user cancels', async () => {
    showConfirmSpy.mockResolvedValue(false);

    headerBar.emit('resetPreferences', undefined);

    await vi.waitFor(() => {
      expect(showConfirmSpy).toHaveBeenCalled();
    });

    expect(mockPreferencesManager.resetAll).not.toHaveBeenCalled();
  });
});
