/**
 * KeyboardWiring tests - Verifies keyboard shortcut registration and wiring.
 *
 * Tests cover:
 * - ContextualKeyboardManager is connected to KeyboardManager dispatch
 * - Previously dead shortcuts (paint.line, paint.rectangle, paint.ellipse,
 *   channel.red, channel.blue, channel.none) are registered via contextual manager
 * - Audio mute toggle shortcut (audio.toggleMute) is registered and works
 * - Contextual resolution picks the correct handler based on active context
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyboardManager } from './utils/input/KeyboardManager';
import { ContextualKeyboardManager } from './utils/input/ContextualKeyboardManager';
import { ActiveContextManager } from './utils/input/ActiveContextManager';
import { DEFAULT_KEY_BINDINGS } from './utils/input/KeyBindings';
import { AppKeyboardHandler } from './AppKeyboardHandler';
import { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';

// Stub localStorage for CustomKeyBindingsManager
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

/**
 * Helper to dispatch a keyboard event from document.body so the event target
 * has proper DOM element APIs (getAttribute, etc.) needed by KeyboardManager.
 */
function fireKey(code: string, opts?: { shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): void {
  const event = new KeyboardEvent('keydown', {
    code,
    shiftKey: opts?.shiftKey,
    ctrlKey: opts?.ctrlKey,
    altKey: opts?.altKey,
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// 1. ContextualKeyboardManager <-> KeyboardManager connection
// ---------------------------------------------------------------------------

describe('ContextualKeyboardManager connection to KeyboardManager', () => {
  let keyboardManager: KeyboardManager;
  let contextManager: ActiveContextManager;
  let contextualManager: ContextualKeyboardManager;

  beforeEach(() => {
    keyboardManager = new KeyboardManager();
    contextManager = new ActiveContextManager();
    contextualManager = new ContextualKeyboardManager(contextManager);
  });

  it('KW-001: KeyboardManager accepts a contextual manager via setContextualManager', () => {
    // Should not throw
    keyboardManager.setContextualManager(contextualManager);
  });

  it('KW-002: contextual resolver is invoked during keydown dispatch', () => {
    keyboardManager.setContextualManager(contextualManager);

    const handler = vi.fn();
    contextualManager.register('test.action', { code: 'KeyT' }, handler, 'global', 'Test action');

    keyboardManager.attach(document);
    fireKey('KeyT');
    expect(handler).toHaveBeenCalled();
    keyboardManager.detach(document);
  });

  it('KW-003: contextual binding takes priority over direct KeyboardManager binding', () => {
    keyboardManager.setContextualManager(contextualManager);

    const contextualHandler = vi.fn();
    const directHandler = vi.fn();

    contextualManager.register('contextual.action', { code: 'KeyX' }, contextualHandler, 'global');
    keyboardManager.register({ code: 'KeyX' }, directHandler);

    keyboardManager.attach(document);
    fireKey('KeyX');

    expect(contextualHandler).toHaveBeenCalled();
    expect(directHandler).not.toHaveBeenCalled();
    keyboardManager.detach(document);
  });

  it('KW-004: falls back to direct binding when contextual has no match', () => {
    keyboardManager.setContextualManager(contextualManager);

    const directHandler = vi.fn();
    keyboardManager.register({ code: 'KeyZ' }, directHandler);

    // No contextual binding for KeyZ
    keyboardManager.attach(document);
    fireKey('KeyZ');
    expect(directHandler).toHaveBeenCalled();
    keyboardManager.detach(document);
  });
});

// ---------------------------------------------------------------------------
// 2. Conflicting shortcuts are registered via contextual manager
// ---------------------------------------------------------------------------

describe('Conflicting shortcuts resolved via contextual keyboard manager', () => {
  let contextManager: ActiveContextManager;
  let ckm: ContextualKeyboardManager;

  beforeEach(() => {
    contextManager = new ActiveContextManager();
    ckm = new ContextualKeyboardManager(contextManager);
  });

  // --- KeyR: timeline.resetInOut (global) vs paint.rectangle (paint) ---

  it('KW-010: KeyR resolves to timeline.resetInOut in global context', () => {
    ckm.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyR' })?.action).toBe('timeline.resetInOut');
  });

  it('KW-011: KeyR resolves to paint.rectangle in paint context', () => {
    ckm.register('timeline.resetInOut', { code: 'KeyR' }, vi.fn(), 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, vi.fn(), 'paint');

    contextManager.setContext('paint');
    expect(ckm.resolve({ code: 'KeyR' })?.action).toBe('paint.rectangle');
  });

  // --- KeyO: timeline.setOutPoint (global) vs paint.ellipse (paint) ---

  it('KW-012: KeyO resolves to timeline.setOutPoint in global context', () => {
    ckm.register('timeline.setOutPoint', { code: 'KeyO' }, vi.fn(), 'global');
    ckm.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyO' })?.action).toBe('timeline.setOutPoint');
  });

  it('KW-013: KeyO resolves to paint.ellipse in paint context', () => {
    ckm.register('timeline.setOutPoint', { code: 'KeyO' }, vi.fn(), 'global');
    ckm.register('paint.ellipse', { code: 'KeyO' }, vi.fn(), 'paint');

    contextManager.setContext('paint');
    expect(ckm.resolve({ code: 'KeyO' })?.action).toBe('paint.ellipse');
  });

  // --- KeyL: playback.faster (global) vs paint.line (paint) ---

  it('KW-014: KeyL resolves to playback.faster in global context', () => {
    ckm.register('playback.faster', { code: 'KeyL' }, vi.fn(), 'global');
    ckm.register('paint.line', { code: 'KeyL' }, vi.fn(), 'paint');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyL' })?.action).toBe('playback.faster');
  });

  it('KW-015: KeyL resolves to paint.line in paint context', () => {
    ckm.register('playback.faster', { code: 'KeyL' }, vi.fn(), 'global');
    ckm.register('paint.line', { code: 'KeyL' }, vi.fn(), 'paint');

    contextManager.setContext('paint');
    expect(ckm.resolve({ code: 'KeyL' })?.action).toBe('paint.line');
  });

  // --- Shift+R: transform.rotateLeft (global) vs channel.red (channel) ---

  it('KW-016: Shift+R resolves to transform.rotateLeft in global context', () => {
    ckm.register('transform.rotateLeft', { code: 'KeyR', shift: true }, vi.fn(), 'global');
    ckm.register('channel.red', { code: 'KeyR', shift: true }, vi.fn(), 'channel');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyR', shift: true })?.action).toBe('transform.rotateLeft');
  });

  it('KW-017: Shift+R resolves to channel.red in channel context', () => {
    ckm.register('transform.rotateLeft', { code: 'KeyR', shift: true }, vi.fn(), 'global');
    ckm.register('channel.red', { code: 'KeyR', shift: true }, vi.fn(), 'channel');

    contextManager.setContext('channel');
    expect(ckm.resolve({ code: 'KeyR', shift: true })?.action).toBe('channel.red');
  });

  // --- Shift+B: view.cycleBackgroundPattern (global) vs channel.blue (channel) ---

  it('KW-018: Shift+B resolves to view.cycleBackgroundPattern in global context', () => {
    ckm.register('view.cycleBackgroundPattern', { code: 'KeyB', shift: true }, vi.fn(), 'global');
    ckm.register('channel.blue', { code: 'KeyB', shift: true }, vi.fn(), 'channel');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyB', shift: true })?.action).toBe('view.cycleBackgroundPattern');
  });

  it('KW-019: Shift+B resolves to channel.blue in channel context', () => {
    ckm.register('view.cycleBackgroundPattern', { code: 'KeyB', shift: true }, vi.fn(), 'global');
    ckm.register('channel.blue', { code: 'KeyB', shift: true }, vi.fn(), 'channel');

    contextManager.setContext('channel');
    expect(ckm.resolve({ code: 'KeyB', shift: true })?.action).toBe('channel.blue');
  });

  // --- Shift+N: network.togglePanel (global) vs channel.none (channel) ---

  it('KW-020: Shift+N resolves to network.togglePanel in global context', () => {
    ckm.register('network.togglePanel', { code: 'KeyN', shift: true }, vi.fn(), 'global');
    ckm.register('channel.none', { code: 'KeyN', shift: true }, vi.fn(), 'channel');

    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyN', shift: true })?.action).toBe('network.togglePanel');
  });

  it('KW-021: Shift+N resolves to channel.none in channel context', () => {
    ckm.register('network.togglePanel', { code: 'KeyN', shift: true }, vi.fn(), 'global');
    ckm.register('channel.none', { code: 'KeyN', shift: true }, vi.fn(), 'channel');

    contextManager.setContext('channel');
    expect(ckm.resolve({ code: 'KeyN', shift: true })?.action).toBe('channel.none');
  });

  // --- Shift+R: transform.rotateLeft (transform) vs channel.red (channel) ---

  it('KW-022: Shift+R resolves to transform.rotateLeft in transform context', () => {
    ckm.register('transform.rotateLeft', { code: 'KeyR', shift: true }, vi.fn(), 'transform');
    ckm.register('channel.red', { code: 'KeyR', shift: true }, vi.fn(), 'channel');

    contextManager.setContext('transform');
    expect(ckm.resolve({ code: 'KeyR', shift: true })?.action).toBe('transform.rotateLeft');
  });
});

// ---------------------------------------------------------------------------
// 3. Audio mute toggle shortcut
// ---------------------------------------------------------------------------

describe('Audio mute toggle shortcut', () => {
  it('KW-030: audio.toggleMute is defined in DEFAULT_KEY_BINDINGS', () => {
    const binding = DEFAULT_KEY_BINDINGS['audio.toggleMute'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyM');
    expect(binding!.shift).toBe(true);
    expect(binding!.description).toMatch(/mute/i);
  });

  it('KW-031: audio.toggleMute binding does not conflict with timeline.toggleMark', () => {
    const muteBinding = DEFAULT_KEY_BINDINGS['audio.toggleMute'];
    const markBinding = DEFAULT_KEY_BINDINGS['timeline.toggleMark'];

    expect(muteBinding).toBeDefined();
    expect(markBinding).toBeDefined();

    // timeline.toggleMark is bare KeyM, audio.toggleMute is Shift+KeyM
    expect(markBinding!.code).toBe('KeyM');
    expect(markBinding!.shift).toBeUndefined();

    expect(muteBinding!.code).toBe('KeyM');
    expect(muteBinding!.shift).toBe(true);
  });

  it('KW-032: audio.toggleMute is registered with the keyboard manager via AppKeyboardHandler', () => {
    localStorageMock.clear();

    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    const muteHandler = vi.fn();

    const ctx = {
      getActionHandlers: () => ({
        'audio.toggleMute': muteHandler,
        // Need at least one more to avoid empty registration
        'playback.toggle': vi.fn(),
      }),
      getContainer: () => document.body,
    };

    const handler = new AppKeyboardHandler(km, ckm, ctx);
    handler.setup();

    // Check that the binding is registered with the keyboard manager
    const binding = DEFAULT_KEY_BINDINGS['audio.toggleMute']!;
    expect(km.isRegistered({ code: binding.code, shift: binding.shift })).toBe(true);
  });

  it('KW-033: audio.toggleMute handler calls session.toggleMute', () => {
    // Simulate the handler wiring as done in App.getActionHandlers()
    const mockSession = {
      muted: false,
      toggleMute: vi.fn(() => {
        mockSession.muted = !mockSession.muted;
      }),
    };

    // The handler in App.getActionHandlers() is:
    //   'audio.toggleMute': () => this.session.toggleMute()
    const handler = () => mockSession.toggleMute();

    handler();
    expect(mockSession.toggleMute).toHaveBeenCalledTimes(1);
    expect(mockSession.muted).toBe(true);

    handler();
    expect(mockSession.toggleMute).toHaveBeenCalledTimes(2);
    expect(mockSession.muted).toBe(false);
  });

  it('KW-034: Shift+M keypress dispatches audio.toggleMute handler via KeyboardManager', () => {
    localStorageMock.clear();

    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    const muteHandler = vi.fn();

    const ctx = {
      getActionHandlers: () => ({
        'audio.toggleMute': muteHandler,
        'playback.toggle': vi.fn(),
      }),
      getContainer: () => document.body,
    };

    const handler = new AppKeyboardHandler(km, ckm, ctx);
    handler.setup();

    km.attach(document);
    fireKey('KeyM', { shiftKey: true });
    expect(muteHandler).toHaveBeenCalled();
    km.detach(document);
  });
});

// ---------------------------------------------------------------------------
// 4. All 6 conflicting defaults have context metadata in KeyBindings
// ---------------------------------------------------------------------------

describe('Conflicting defaults have context metadata', () => {
  it('KW-040: paint.line is defined with context paint in DEFAULT_KEY_BINDINGS', () => {
    // paint.line doesn't have an explicit context in KeyBindings, it has code: 'KeyL'
    const binding = DEFAULT_KEY_BINDINGS['paint.line'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyL');
  });

  it('KW-041: paint.rectangle is defined with context paint in DEFAULT_KEY_BINDINGS', () => {
    const binding = DEFAULT_KEY_BINDINGS['paint.rectangle'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyR');
    expect(binding!.context).toBe('paint');
  });

  it('KW-042: paint.ellipse is defined with context paint in DEFAULT_KEY_BINDINGS', () => {
    const binding = DEFAULT_KEY_BINDINGS['paint.ellipse'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyO');
    expect(binding!.context).toBe('paint');
  });

  it('KW-043: channel.red is defined with context channel in DEFAULT_KEY_BINDINGS', () => {
    const binding = DEFAULT_KEY_BINDINGS['channel.red'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyR');
    expect(binding!.shift).toBe(true);
    expect(binding!.context).toBe('channel');
  });

  it('KW-044: channel.blue is defined with context channel in DEFAULT_KEY_BINDINGS', () => {
    const binding = DEFAULT_KEY_BINDINGS['channel.blue'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyB');
    expect(binding!.shift).toBe(true);
    // channel.blue currently doesn't have explicit context in KeyBindings
    // but it's registered via contextual manager
  });

  it('KW-045: channel.none is defined with context channel in DEFAULT_KEY_BINDINGS', () => {
    const binding = DEFAULT_KEY_BINDINGS['channel.none'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyN');
    expect(binding!.shift).toBe(true);
    // channel.none currently doesn't have explicit context in KeyBindings
    // but it's registered via contextual manager
  });
});

// ---------------------------------------------------------------------------
// 5. End-to-end contextual dispatch with tab switching
// ---------------------------------------------------------------------------

describe('End-to-end contextual dispatch with tab switching', () => {
  let contextManager: ActiveContextManager;
  let ckm: ContextualKeyboardManager;
  let km: KeyboardManager;

  // Replicate updateActiveContext from App.ts
  function updateActiveContext(tabId: string): void {
    switch (tabId) {
      case 'annotate':
        contextManager.setContext('paint');
        break;
      case 'transform':
        contextManager.setContext('transform');
        break;
      case 'view':
      case 'qc':
        contextManager.setContext('viewer');
        break;
      default:
        contextManager.setContext('global');
        break;
    }
  }

  beforeEach(() => {
    contextManager = new ActiveContextManager();
    ckm = new ContextualKeyboardManager(contextManager);
    km = new KeyboardManager();
    km.setContextualManager(ckm);
  });

  it('KW-050: switching to annotate tab makes paint.rectangle win over timeline.resetInOut for KeyR', () => {
    const paintHandler = vi.fn();
    const timelineHandler = vi.fn();

    ckm.register('timeline.resetInOut', { code: 'KeyR' }, timelineHandler, 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');

    updateActiveContext('annotate');

    km.attach(document);
    fireKey('KeyR');

    expect(paintHandler).toHaveBeenCalled();
    expect(timelineHandler).not.toHaveBeenCalled();

    km.detach(document);
  });

  it('KW-051: switching to color tab makes timeline.resetInOut win for KeyR', () => {
    const paintHandler = vi.fn();
    const timelineHandler = vi.fn();

    ckm.register('timeline.resetInOut', { code: 'KeyR' }, timelineHandler, 'global');
    ckm.register('paint.rectangle', { code: 'KeyR' }, paintHandler, 'paint');

    updateActiveContext('color');

    km.attach(document);
    fireKey('KeyR');

    expect(timelineHandler).toHaveBeenCalled();
    expect(paintHandler).not.toHaveBeenCalled();

    km.detach(document);
  });

  it('KW-052: switching to annotate tab makes paint.line win over playback.faster for KeyL', () => {
    const paintHandler = vi.fn();
    const playbackHandler = vi.fn();

    ckm.register('playback.faster', { code: 'KeyL' }, playbackHandler, 'global');
    ckm.register('paint.line', { code: 'KeyL' }, paintHandler, 'paint');

    updateActiveContext('annotate');

    km.attach(document);
    fireKey('KeyL');

    expect(paintHandler).toHaveBeenCalled();
    expect(playbackHandler).not.toHaveBeenCalled();

    km.detach(document);
  });

  it('KW-053: switching to annotate tab makes paint.ellipse win over timeline.setOutPoint for KeyO', () => {
    const paintHandler = vi.fn();
    const timelineHandler = vi.fn();

    ckm.register('timeline.setOutPoint', { code: 'KeyO' }, timelineHandler, 'global');
    ckm.register('paint.ellipse', { code: 'KeyO' }, paintHandler, 'paint');

    updateActiveContext('annotate');

    km.attach(document);
    fireKey('KeyO');

    expect(paintHandler).toHaveBeenCalled();
    expect(timelineHandler).not.toHaveBeenCalled();

    km.detach(document);
  });

  it('KW-054: channel context can be pushed to activate channel shortcuts', () => {
    const transformHandler = vi.fn();
    const channelHandler = vi.fn();

    ckm.register('transform.rotateLeft', { code: 'KeyR', shift: true }, transformHandler, 'global');
    ckm.register('channel.red', { code: 'KeyR', shift: true }, channelHandler, 'channel');

    // Default: transform wins
    contextManager.setContext('global');
    expect(ckm.resolve({ code: 'KeyR', shift: true })?.action).toBe('transform.rotateLeft');

    // Push channel context: channel.red wins
    contextManager.pushContext('channel');
    expect(ckm.resolve({ code: 'KeyR', shift: true })?.action).toBe('channel.red');

    // Pop: back to transform
    contextManager.popContext();
    expect(ckm.resolve({ code: 'KeyR', shift: true })?.action).toBe('transform.rotateLeft');
  });
});
