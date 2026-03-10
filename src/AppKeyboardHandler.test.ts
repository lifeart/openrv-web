/**
 * AppKeyboardHandler - Keyboard registration and binding tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { KeyboardHandlerContext } from './AppKeyboardHandler';
import { AppKeyboardHandler } from './AppKeyboardHandler';
import { KeyboardManager } from './utils/input/KeyboardManager';
import { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
import { closeModal } from './ui/components/shared/Modal';
import { DEFAULT_KEY_BINDINGS, describeKeyCombo } from './utils/input/KeyBindings';

// Stub localStorage so CustomKeyBindingsManager doesn't throw
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

function createHandler(): AppKeyboardHandler {
  const km = new KeyboardManager();
  const ckm = new CustomKeyBindingsManager();
  const ctx: KeyboardHandlerContext = {
    getActionHandlers: () => ({}),
    getContainer: () => document.body,
  };
  return new AppKeyboardHandler(km, ckm, ctx);
}

describe('Keyboard registration tests (M-25)', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('SK-M25j: context-managed KeyG actions are skipped from direct keyboard registration', () => {
    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    const actionHandlers = {
      'navigation.gotoFrame': () => undefined,
      'paint.toggleGhost': () => undefined,
      'panel.gamutDiagram': () => undefined,
    };
    const registrationHandler = new AppKeyboardHandler(km, ckm, {
      getActionHandlers: () => actionHandlers,
      getContainer: () => document.body,
    });

    registrationHandler.setup();

    const keyGBindings = km.getBindings().filter((binding) => binding.combo.code === 'KeyG');
    expect(keyGBindings).toHaveLength(0);
  });

  it('SK-M25k: context-managed KeyH actions (fitToHeight + histogram) are skipped from direct registration', () => {
    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    const actionHandlers = {
      'view.fitToHeight': () => undefined,
      'panel.histogram': () => undefined,
    };
    const registrationHandler = new AppKeyboardHandler(km, ckm, {
      getActionHandlers: () => actionHandlers,
      getContainer: () => document.body,
    });

    registrationHandler.setup();

    // Both KeyH actions should be skipped from direct registration
    // (they are managed by the contextual keyboard manager instead)
    const keyHBindings = km.getBindings().filter(
      (binding) => binding.combo.code === 'KeyH' && !binding.combo.shift && !binding.combo.alt && !binding.combo.ctrl,
    );
    expect(keyHBindings).toHaveLength(0);
  });

  it('SK-M25l: histogram shortcut hint in ScopesControl matches its binding key', () => {
    // Verify the histogram binding uses KeyH (same key shown in ScopesControl UI)
    const histogramBinding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(histogramBinding).toBeDefined();
    expect(histogramBinding!.code).toBe('KeyH');
    expect(histogramBinding!.context).toBe('panel');
    // The ScopesControl shows 'H' as the shortcut hint, which matches KeyH
    expect(describeKeyCombo({ code: histogramBinding!.code })).toBe('H');
  });

  it('SK-M25m: histogram and fitToHeight no longer share the same registration path', () => {
    // panel.histogram has context: 'panel', making it contextual
    const histogramBinding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(histogramBinding!.context).toBe('panel');
    // view.fitToHeight has no context (global), but is in CONTEXTUAL_DEFAULTS
    const fitToHeightBinding = DEFAULT_KEY_BINDINGS['view.fitToHeight'];
    expect(fitToHeightBinding!.code).toBe('KeyH');
    expect(fitToHeightBinding!.context).toBeUndefined();
  });

  it('SK-M25n: Shift+L channel.luminance and lut.togglePanel are skipped from direct registration', () => {
    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    const actionHandlers = {
      'channel.luminance': () => undefined,
      'lut.togglePanel': () => undefined,
    };
    const registrationHandler = new AppKeyboardHandler(km, ckm, {
      getActionHandlers: () => actionHandlers,
      getContainer: () => document.body,
    });

    registrationHandler.setup();

    // Both Shift+KeyL actions should be skipped from direct registration
    // (they are managed by the contextual keyboard manager instead)
    const shiftLBindings = km.getBindings().filter(
      (binding) => binding.combo.code === 'KeyL' && binding.combo.shift,
    );
    expect(shiftLBindings).toHaveLength(0);
  });

  it('SK-M25o: channel.luminance has viewer context and lut.togglePanel has global context', () => {
    const luminanceBinding = DEFAULT_KEY_BINDINGS['channel.luminance'];
    expect(luminanceBinding).toBeDefined();
    expect(luminanceBinding!.code).toBe('KeyL');
    expect(luminanceBinding!.shift).toBe(true);
    expect(luminanceBinding!.context).toBe('viewer');

    const lutBinding = DEFAULT_KEY_BINDINGS['lut.togglePanel'];
    expect(lutBinding).toBeDefined();
    expect(lutBinding!.code).toBe('KeyL');
    expect(lutBinding!.shift).toBe(true);
    expect(lutBinding!.context).toBe('global');
  });
});

describe('ShortcutEditor integration (Issue #57)', () => {
  let handler: AppKeyboardHandler;

  beforeEach(() => {
    localStorageMock.clear();
    handler = createHandler();
  });

  afterEach(() => {
    closeModal();
  });

  it('#57: showCustomBindingsDialog creates a ShortcutEditor in a modal', () => {
    handler.showCustomBindingsDialog();

    // ShortcutEditor renders a toolbar with class "shortcut-toolbar"
    const toolbar = document.querySelector('.shortcut-toolbar');
    expect(toolbar).not.toBeNull();
  });
});
