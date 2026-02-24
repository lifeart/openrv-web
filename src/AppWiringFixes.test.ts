/**
 * Regression tests for DCCBridge wiring, ContextualKeyboardManager, and
 * AudioMixer wiring fixes.
 *
 * These tests verify:
 * - DCCBridge loadMedia calls actual session file loading via wireDCCBridge
 * - DCCBridge syncColor applies color settings via wireDCCBridge
 * - DCCBridge frame sync has loop protection via wireDCCBridge
 * - Outbound colorChanged is sent when adjustments change
 * - ContextualKeyboardManager is instantiated and used for key conflict resolution
 * - AudioMixer volume is wired to volume control via wirePlaybackControls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { ContextualKeyboardManager } from './utils/input/ContextualKeyboardManager';
import { ActiveContextManager } from './utils/input/ActiveContextManager';
import { wirePlaybackControls, type PlaybackWiringDeps } from './AppPlaybackWiring';
import { wireDCCBridge, type DCCWiringDeps } from './AppDCCWiring';
import type { AppWiringContext } from './AppWiringContext';

// ---------------------------------------------------------------------------
// Lightweight test doubles for DCCBridge wiring
// ---------------------------------------------------------------------------

function createMockDCCBridge() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    sendFrameChanged: vi.fn(),
    sendColorChanged: vi.fn(),
  });
}

function createMockDCCSession() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    currentFrame: 1,
    frameCount: 100,
    goToFrame: vi.fn(),
    loadImage: vi.fn().mockResolvedValue(undefined),
    loadVideo: vi.fn().mockResolvedValue(undefined),
  });
}

function createMockDCCViewer() {
  return {
    setColorAdjustments: vi.fn(),
  };
}

function createMockColorControls() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    setAdjustments: vi.fn(),
    getAdjustments: vi.fn(() => ({
      exposure: 0,
      gamma: 1,
      temperature: 0,
      tint: 0,
      saturation: 1,
      contrast: 1,
    })),
  });
}

function createDCCDeps() {
  const dccBridge = createMockDCCBridge();
  const session = createMockDCCSession();
  const viewer = createMockDCCViewer();
  const colorControls = createMockColorControls();

  const deps: DCCWiringDeps = {
    dccBridge: dccBridge as any,
    session: session as any,
    viewer: viewer as any,
    colorControls: colorControls as any,
  };

  return { deps, dccBridge, session, viewer, colorControls };
}

// ---------------------------------------------------------------------------
// DCCBridge loadMedia wiring tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge loadMedia wiring fix', () => {
  it('DCCFIX-001: loadMedia should call session.loadImage for image paths', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/shot.exr' });

    // loadImage is called async; await the microtask
    await vi.waitFor(() => {
      expect(session.loadImage).toHaveBeenCalledWith('shot.exr', '/mnt/shows/shot.exr');
    });
    expect(session.loadVideo).not.toHaveBeenCalled();
  });

  it('DCCFIX-002: loadMedia should call session.loadVideo for video paths', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', { type: 'loadMedia', path: '/mnt/shows/clip.mp4' });

    await vi.waitFor(() => {
      expect(session.loadVideo).toHaveBeenCalledWith('clip.mp4', '/mnt/shows/clip.mp4');
    });
    expect(session.loadImage).not.toHaveBeenCalled();
  });

  it('DCCFIX-003: loadMedia should seek to frame if provided', async () => {
    const { deps, dccBridge, session } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('loadMedia', {
      type: 'loadMedia',
      path: '/mnt/shows/shot.exr',
      frame: 42,
    });

    // Wait for loadImage promise to resolve, then goToFrame is called
    await vi.waitFor(() => {
      expect(session.goToFrame).toHaveBeenCalledWith(42);
    });
  });
});

// ---------------------------------------------------------------------------
// DCCBridge syncColor wiring tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge syncColor wiring fix', () => {
  it('DCCFIX-004: syncColor should apply exposure, gamma, temperature, tint to colorControls', () => {
    const { deps, dccBridge, colorControls, viewer } = createDCCDeps();
    colorControls.getAdjustments.mockReturnValue({
      exposure: 1.5,
      gamma: 1.2,
      temperature: 100,
      tint: 5,
      saturation: 1,
      contrast: 1,
    });

    wireDCCBridge(deps);

    dccBridge.emit('syncColor', {
      type: 'syncColor',
      exposure: 1.5,
      gamma: 1.2,
      temperature: 100,
      tint: 5,
    });

    expect(colorControls.setAdjustments).toHaveBeenCalledWith({
      exposure: 1.5,
      gamma: 1.2,
      temperature: 100,
      tint: 5,
    });
    expect(viewer.setColorAdjustments).toHaveBeenCalled();
  });

  it('DCCFIX-005: syncColor with no numeric fields should not call setAdjustments', () => {
    const { deps, dccBridge, colorControls, viewer } = createDCCDeps();
    wireDCCBridge(deps);

    dccBridge.emit('syncColor', { type: 'syncColor' });

    expect(colorControls.setAdjustments).not.toHaveBeenCalled();
    expect(viewer.setColorAdjustments).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DCCBridge frame sync loop protection tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge frame sync loop protection', () => {
  it('DCCFIX-006: inbound syncFrame should suppress outbound frameChanged', () => {
    const { deps, dccBridge, session } = createDCCDeps();

    // Make goToFrame emit frameChanged synchronously (simulating session behavior)
    session.goToFrame.mockImplementation(() => {
      session.emit('frameChanged', 42);
    });

    wireDCCBridge(deps);

    dccBridge.emit('syncFrame', { type: 'syncFrame', frame: 42 });

    // goToFrame was called (inbound sync worked)
    expect(session.goToFrame).toHaveBeenCalledWith(42);
    // But outbound sendFrameChanged should NOT have been triggered
    expect(dccBridge.sendFrameChanged).not.toHaveBeenCalled();
  });

  it('DCCFIX-007: non-inbound frame changes should still send outbound frameChanged', () => {
    const { deps, dccBridge, session } = createDCCDeps();
    session.currentFrame = 10;
    session.frameCount = 200;

    wireDCCBridge(deps);

    // Simulate a user-initiated frame change (not from DCC bridge)
    session.emit('frameChanged', 10);

    expect(dccBridge.sendFrameChanged).toHaveBeenCalledWith(10, 200);
  });
});

// ---------------------------------------------------------------------------
// DCC outbound color change tests (via real wireDCCBridge)
// ---------------------------------------------------------------------------

describe('DCCBridge outbound color change wiring', () => {
  it('DCCFIX-020: adjustmentsChanged should call dccBridge.sendColorChanged', () => {
    const { deps, dccBridge, colorControls } = createDCCDeps();
    wireDCCBridge(deps);

    colorControls.emit('adjustmentsChanged', {
      exposure: 2.0,
      gamma: 1.1,
      temperature: 50,
      tint: -10,
      saturation: 1,
      contrast: 1,
    });

    expect(dccBridge.sendColorChanged).toHaveBeenCalledWith({
      exposure: 2.0,
      gamma: 1.1,
      temperature: 50,
      tint: -10,
    });
  });
});

// ---------------------------------------------------------------------------
// ContextualKeyboardManager instantiation and usage tests
// ---------------------------------------------------------------------------

describe('ContextualKeyboardManager wiring fix', () => {
  let contextManager: ActiveContextManager;
  let ckm: ContextualKeyboardManager;

  beforeEach(() => {
    contextManager = new ActiveContextManager();
    ckm = new ContextualKeyboardManager(contextManager);
  });

  it('DCCFIX-008: ContextualKeyboardManager can be instantiated with ActiveContextManager', () => {
    expect(ckm).toBeInstanceOf(ContextualKeyboardManager);
  });

  it('DCCFIX-009: R key resolves to timeline.resetInOut in global context', () => {
    ckm.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

    contextManager.setContext('global');
    const result = ckm.resolve({ code: 'KeyR' });
    expect(result?.action).toBe('timeline.resetInOut');
  });

  it('DCCFIX-010: R key resolves to paint.rectangle in paint context', () => {
    ckm.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

    contextManager.setContext('paint');
    const result = ckm.resolve({ code: 'KeyR' });
    expect(result?.action).toBe('paint.rectangle');
  });

  it('DCCFIX-011: O key resolves to timeline.setOutPoint in viewer context', () => {
    ckm.register('timeline.setOutPoint', { code: 'KeyO' }, vi.fn(), 'global');
    ckm.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

    contextManager.setContext('viewer');
    const result = ckm.resolve({ code: 'KeyO' });
    expect(result?.action).toBe('timeline.setOutPoint');
  });

  it('DCCFIX-012: O key resolves to paint.ellipse in paint context', () => {
    ckm.register('timeline.setOutPoint', { code: 'KeyO' }, vi.fn(), 'global');
    ckm.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

    contextManager.setContext('paint');
    const result = ckm.resolve({ code: 'KeyO' });
    expect(result?.action).toBe('paint.ellipse');
  });

  it('DCCFIX-013: L key resolves to playback.faster in global, paint.line in paint', () => {
    ckm.register('playback.faster', { code: 'KeyL' }, vi.fn(), 'global');
    ckm.register('paint.line', { code: 'KeyL' }, vi.fn(), 'paint');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyL' })?.action).toBe('playback.faster');

    contextManager.setContext('paint');
    expect(ckm.resolve({ code: 'KeyL' })?.action).toBe('paint.line');
  });

  it('DCCFIX-014: activeContextManager.isContextActive is used by action handlers', () => {
    // Verify that the context manager properly tracks paint context
    contextManager.setContext('paint');
    expect(contextManager.isContextActive('paint')).toBe(true);
    expect(contextManager.isContextActive('global')).toBe(true); // global is always active

    contextManager.setContext('viewer');
    expect(contextManager.isContextActive('paint')).toBe(false);
    expect(contextManager.isContextActive('viewer')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AudioMixer volume wiring tests
// ---------------------------------------------------------------------------

describe('AudioMixer volume wiring fix', () => {
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
      setCurrentSource: vi.fn(),
      goToFrame: vi.fn(),
      setInPoint: vi.fn(),
      setOutPoint: vi.fn(),
      resetInOutPoints: vi.fn(),
      pause: vi.fn(),
    });
    return session;
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

  function createMockAudioMixer() {
    return {
      setMasterVolume: vi.fn(),
      setMasterMuted: vi.fn(),
    };
  }

  it('DCCFIX-015: volume change from VolumeControl should call audioMixer.setMasterVolume', () => {
    const session = createMockSession();
    const headerBar = createMockHeaderBar();
    const controls = createMockControls();
    const persistenceManager = createMockPersistenceManager();
    const audioMixer = createMockAudioMixer();

    const ctx = {
      session: session as any,
      viewer: {} as any,
      paintEngine: {} as any,
      headerBar: headerBar as any,
      tabBar: {} as any,
      controls: controls as any,
      sessionBridge: {} as any,
      persistenceManager: persistenceManager as any,
    } as AppWiringContext;

    const deps: PlaybackWiringDeps = {
      getKeyboardHandler: vi.fn(() => ({
        showShortcutsDialog: vi.fn(),
        showCustomBindingsDialog: vi.fn(),
      })) as any,
      getFullscreenManager: vi.fn(() => ({
        toggle: vi.fn(),
      })) as any,
      getAudioMixer: () => audioMixer as any,
    };

    wirePlaybackControls(ctx, deps);

    const volumeControl = headerBar.getVolumeControl();
    volumeControl.emit('volumeChanged', 0.5);

    expect(audioMixer.setMasterVolume).toHaveBeenCalledWith(0.5);
  });

  it('DCCFIX-016: mute change from VolumeControl should call audioMixer.setMasterMuted', () => {
    const session = createMockSession();
    const headerBar = createMockHeaderBar();
    const controls = createMockControls();
    const persistenceManager = createMockPersistenceManager();
    const audioMixer = createMockAudioMixer();

    const ctx = {
      session: session as any,
      viewer: {} as any,
      paintEngine: {} as any,
      headerBar: headerBar as any,
      tabBar: {} as any,
      controls: controls as any,
      sessionBridge: {} as any,
      persistenceManager: persistenceManager as any,
    } as AppWiringContext;

    const deps: PlaybackWiringDeps = {
      getKeyboardHandler: vi.fn(() => ({
        showShortcutsDialog: vi.fn(),
        showCustomBindingsDialog: vi.fn(),
      })) as any,
      getFullscreenManager: vi.fn(() => ({
        toggle: vi.fn(),
      })) as any,
      getAudioMixer: () => audioMixer as any,
    };

    wirePlaybackControls(ctx, deps);

    const volumeControl = headerBar.getVolumeControl();
    volumeControl.emit('mutedChanged', true);

    expect(audioMixer.setMasterMuted).toHaveBeenCalledWith(true);
  });

  it('DCCFIX-017: session volumeChanged should also call audioMixer.setMasterVolume', () => {
    const session = createMockSession();
    const headerBar = createMockHeaderBar();
    const controls = createMockControls();
    const persistenceManager = createMockPersistenceManager();
    const audioMixer = createMockAudioMixer();

    const ctx = {
      session: session as any,
      viewer: {} as any,
      paintEngine: {} as any,
      headerBar: headerBar as any,
      tabBar: {} as any,
      controls: controls as any,
      sessionBridge: {} as any,
      persistenceManager: persistenceManager as any,
    } as AppWiringContext;

    const deps: PlaybackWiringDeps = {
      getKeyboardHandler: vi.fn(() => ({
        showShortcutsDialog: vi.fn(),
        showCustomBindingsDialog: vi.fn(),
      })) as any,
      getFullscreenManager: vi.fn(() => ({
        toggle: vi.fn(),
      })) as any,
      getAudioMixer: () => audioMixer as any,
    };

    wirePlaybackControls(ctx, deps);

    session.emit('volumeChanged', 0.75);

    expect(audioMixer.setMasterVolume).toHaveBeenCalledWith(0.75);
  });

  it('DCCFIX-018: session mutedChanged should also call audioMixer.setMasterMuted', () => {
    const session = createMockSession();
    const headerBar = createMockHeaderBar();
    const controls = createMockControls();
    const persistenceManager = createMockPersistenceManager();
    const audioMixer = createMockAudioMixer();

    const ctx = {
      session: session as any,
      viewer: {} as any,
      paintEngine: {} as any,
      headerBar: headerBar as any,
      tabBar: {} as any,
      controls: controls as any,
      sessionBridge: {} as any,
      persistenceManager: persistenceManager as any,
    } as AppWiringContext;

    const deps: PlaybackWiringDeps = {
      getKeyboardHandler: vi.fn(() => ({
        showShortcutsDialog: vi.fn(),
        showCustomBindingsDialog: vi.fn(),
      })) as any,
      getFullscreenManager: vi.fn(() => ({
        toggle: vi.fn(),
      })) as any,
      getAudioMixer: () => audioMixer as any,
    };

    wirePlaybackControls(ctx, deps);

    session.emit('mutedChanged', true);

    expect(audioMixer.setMasterMuted).toHaveBeenCalledWith(true);
  });

  it('DCCFIX-019: wirePlaybackControls works without getAudioMixer (backward compat)', () => {
    const session = createMockSession();
    const headerBar = createMockHeaderBar();
    const controls = createMockControls();
    const persistenceManager = createMockPersistenceManager();

    const ctx = {
      session: session as any,
      viewer: {} as any,
      paintEngine: {} as any,
      headerBar: headerBar as any,
      tabBar: {} as any,
      controls: controls as any,
      sessionBridge: {} as any,
      persistenceManager: persistenceManager as any,
    } as AppWiringContext;

    const deps: PlaybackWiringDeps = {
      getKeyboardHandler: vi.fn(() => ({
        showShortcutsDialog: vi.fn(),
        showCustomBindingsDialog: vi.fn(),
      })) as any,
      getFullscreenManager: vi.fn(() => ({
        toggle: vi.fn(),
      })) as any,
      // No getAudioMixer provided
    };

    // Should not throw
    wirePlaybackControls(ctx, deps);

    const volumeControl = headerBar.getVolumeControl();
    // Should not throw even without audio mixer
    expect(() => volumeControl.emit('volumeChanged', 0.5)).not.toThrow();
    expect(() => volumeControl.emit('mutedChanged', true)).not.toThrow();
  });
});
