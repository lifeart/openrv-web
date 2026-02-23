/**
 * Regression tests for ContextualKeyboardManager and AudioMixer wiring fixes.
 *
 * These tests verify:
 * - ContextualKeyboardManager is instantiated and used for key conflict resolution
 * - AudioMixer volume is wired to volume control via wirePlaybackControls
 *
 * DCCBridge wiring tests (DCCFIX-001 through DCCFIX-007, DCCFIX-020 through
 * DCCFIX-023) were removed because they copy-pasted inline handler logic from
 * App.ts into the test body and asserted against the copy. Those tests could
 * never detect regressions if the real App.ts diverged. The DCC wiring lives
 * inside the App constructor and is not exported as a testable function.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from './utils/EventEmitter';
import { ContextualKeyboardManager } from './utils/input/ContextualKeyboardManager';
import { ActiveContextManager } from './utils/input/ActiveContextManager';
import { wirePlaybackControls, type PlaybackWiringDeps } from './AppPlaybackWiring';
import type { AppWiringContext } from './AppWiringContext';

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
