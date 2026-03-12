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
import { ScopesControl } from './ui/components/ScopesControl';

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
    };
    const registrationHandler = new AppKeyboardHandler(km, ckm, {
      getActionHandlers: () => actionHandlers,
      getContainer: () => document.body,
    });

    registrationHandler.setup();

    // Plain KeyG (no modifiers) should be skipped (context-managed)
    const keyGBindings = km.getBindings().filter(
      (binding) => binding.combo.code === 'KeyG' && !binding.combo.ctrl && !binding.combo.shift && !binding.combo.alt,
    );
    expect(keyGBindings).toHaveLength(0);
  });

  it('SK-M25k: fitToHeight (KeyH) is skipped but histogram (Ctrl+Shift+H) is directly registered', () => {
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

    // Plain KeyH (fitToHeight) should be skipped from direct registration
    // (it is managed by the contextual keyboard manager instead)
    const bareKeyHBindings = km.getBindings().filter(
      (binding) => binding.combo.code === 'KeyH' && !binding.combo.shift && !binding.combo.alt && !binding.combo.ctrl,
    );
    expect(bareKeyHBindings).toHaveLength(0);

    // Ctrl+Shift+H (histogram) should be directly registered since it doesn't conflict
    const ctrlShiftHBindings = km.getBindings().filter(
      (binding) => binding.combo.code === 'KeyH' && binding.combo.ctrl && binding.combo.shift,
    );
    expect(ctrlShiftHBindings).toHaveLength(1);
  });

  it('SK-M25l: histogram shortcut uses Ctrl+Shift+H and matches ScopesControl hint', () => {
    // Verify the histogram binding uses Ctrl+Shift+H (same combo shown in ScopesControl UI)
    const histogramBinding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(histogramBinding).toBeDefined();
    expect(histogramBinding!.code).toBe('KeyH');
    expect(histogramBinding!.ctrl).toBe(true);
    expect(histogramBinding!.shift).toBe(true);
    // No context needed since Ctrl+Shift+H is unique and doesn't conflict
    expect(histogramBinding!.context).toBeUndefined();
    expect(describeKeyCombo({ code: histogramBinding!.code, ctrl: true, shift: true })).toBe('Ctrl+Shift+H');
  });

  it('SK-M25m: histogram (Ctrl+Shift+H) and fitToHeight (H) no longer conflict', () => {
    // panel.histogram uses Ctrl+Shift+H — a unique combo
    const histogramBinding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(histogramBinding!.code).toBe('KeyH');
    expect(histogramBinding!.ctrl).toBe(true);
    expect(histogramBinding!.shift).toBe(true);
    // view.fitToHeight uses plain KeyH — no modifier overlap
    const fitToHeightBinding = DEFAULT_KEY_BINDINGS['view.fitToHeight'];
    expect(fitToHeightBinding!.code).toBe('KeyH');
    expect(fitToHeightBinding!.ctrl).toBeUndefined();
    expect(fitToHeightBinding!.shift).toBeUndefined();
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

describe('Scope shortcut regression tests (Issues #1, #2, #3)', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('SCOPE-REG01: histogram binding uses Ctrl+Shift+H with no context restriction', () => {
    const binding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyH');
    expect(binding!.ctrl).toBe(true);
    expect(binding!.shift).toBe(true);
    expect(binding!.context).toBeUndefined();
  });

  it('SCOPE-REG02: waveform binding uses Ctrl+Shift+W with no context restriction', () => {
    const binding = DEFAULT_KEY_BINDINGS['panel.waveform'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyW');
    expect(binding!.ctrl).toBe(true);
    expect(binding!.shift).toBe(true);
    expect(binding!.context).toBeUndefined();
  });

  it('SCOPE-REG03: gamut diagram binding uses Ctrl+Shift+G with no context restriction', () => {
    const binding = DEFAULT_KEY_BINDINGS['panel.gamutDiagram'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyG');
    expect(binding!.ctrl).toBe(true);
    expect(binding!.shift).toBe(true);
    expect(binding!.context).toBeUndefined();
  });

  it('SCOPE-REG04: histogram shortcut does not conflict with fitToHeight', () => {
    const histogram = DEFAULT_KEY_BINDINGS['panel.histogram']!;
    const fitToHeight = DEFAULT_KEY_BINDINGS['view.fitToHeight']!;
    // Both use KeyH but histogram has Ctrl+Shift modifiers
    expect(histogram.code).toBe('KeyH');
    expect(fitToHeight.code).toBe('KeyH');
    // They differ in modifiers, so no conflict
    const histHasCtrlShift = histogram.ctrl === true && histogram.shift === true;
    const fitHasCtrlShift = fitToHeight.ctrl === true && fitToHeight.shift === true;
    expect(histHasCtrlShift).toBe(true);
    expect(fitHasCtrlShift).toBe(false);
  });

  it('SCOPE-REG05: waveform shortcut does not conflict with fitToWidth', () => {
    const waveform = DEFAULT_KEY_BINDINGS['panel.waveform']!;
    const fitToWidth = DEFAULT_KEY_BINDINGS['view.fitToWidth']!;
    expect(waveform.code).toBe('KeyW');
    expect(fitToWidth.code).toBe('KeyW');
    const waveHasCtrlShift = waveform.ctrl === true && waveform.shift === true;
    const fitHasCtrlShift = fitToWidth.ctrl === true && fitToWidth.shift === true;
    expect(waveHasCtrlShift).toBe(true);
    expect(fitHasCtrlShift).toBe(false);
  });

  it('SCOPE-REG06: gamut diagram shortcut does not conflict with gotoFrame', () => {
    const gamut = DEFAULT_KEY_BINDINGS['panel.gamutDiagram']!;
    const gotoFrame = DEFAULT_KEY_BINDINGS['navigation.gotoFrame']!;
    expect(gamut.code).toBe('KeyG');
    expect(gotoFrame.code).toBe('KeyG');
    const gamutHasCtrlShift = gamut.ctrl === true && gamut.shift === true;
    const gotoHasCtrlShift = gotoFrame.ctrl === true && gotoFrame.shift === true;
    expect(gamutHasCtrlShift).toBe(true);
    expect(gotoHasCtrlShift).toBe(false);
  });

  it('SCOPE-REG07: scope shortcuts are directly registered (not skipped)', () => {
    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    const actionHandlers = {
      'panel.histogram': () => undefined,
      'panel.waveform': () => undefined,
      'panel.gamutDiagram': () => undefined,
    };
    const registrationHandler = new AppKeyboardHandler(km, ckm, {
      getActionHandlers: () => actionHandlers,
      getContainer: () => document.body,
    });

    registrationHandler.setup();

    const bindings = km.getBindings();
    // Ctrl+Shift+H should be registered for histogram
    const histogramBindings = bindings.filter(
      (b) => b.combo.code === 'KeyH' && b.combo.ctrl && b.combo.shift,
    );
    expect(histogramBindings).toHaveLength(1);

    // Ctrl+Shift+W should be registered for waveform
    const waveformBindings = bindings.filter(
      (b) => b.combo.code === 'KeyW' && b.combo.ctrl && b.combo.shift,
    );
    expect(waveformBindings).toHaveLength(1);

    // Ctrl+Shift+G should be registered for gamut diagram
    const gamutBindings = bindings.filter(
      (b) => b.combo.code === 'KeyG' && b.combo.ctrl && b.combo.shift,
    );
    expect(gamutBindings).toHaveLength(1);
  });

  it('SCOPE-REG08: describeKeyCombo produces correct labels for scope shortcuts', () => {
    expect(describeKeyCombo({ code: 'KeyH', ctrl: true, shift: true })).toBe('Ctrl+Shift+H');
    expect(describeKeyCombo({ code: 'KeyW', ctrl: true, shift: true })).toBe('Ctrl+Shift+W');
    expect(describeKeyCombo({ code: 'KeyG', ctrl: true, shift: true })).toBe('Ctrl+Shift+G');
  });
});

describe('Scope UI hint regression tests (Issues #1, #2, #3)', () => {
  it('SCOPE-UI01: ScopesControl shortcut hints match actual keybinding definitions', () => {
    const control = new ScopesControl();
    const el = control.render();
    const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;

    // The button title should reference the new Ctrl+Shift shortcuts
    expect(button.title).toContain('Ctrl+Shift+H');
    expect(button.title).toContain('Ctrl+Shift+W');
    expect(button.title).toContain('Ctrl+Shift+G');
    // Should NOT reference bare H, w, or G for scopes that were changed
    expect(button.title).not.toMatch(/[^+]H:/);
    expect(button.title).not.toMatch(/[^+]G:/);

    control.dispose();
  });

  it('SCOPE-UI02: ScopesControl dropdown shows correct shortcut hints', () => {
    const control = new ScopesControl();
    const el = control.render();

    // Open the dropdown
    const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;
    button.click();

    const dropdown = document.querySelector('[data-testid="scopes-dropdown"]') as HTMLElement;
    expect(dropdown).not.toBeNull();

    const options = dropdown.querySelectorAll('button');
    // histogram option
    expect(options[0].textContent).toContain('Ctrl+Shift+H');
    // waveform option
    expect(options[1].textContent).toContain('Ctrl+Shift+W');
    // vectorscope option (unchanged)
    expect(options[2].textContent).toContain('y');
    // gamut diagram option
    expect(options[3].textContent).toContain('Ctrl+Shift+G');

    control.dispose();
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
