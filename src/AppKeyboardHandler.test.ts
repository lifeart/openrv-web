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

  it('SK-M25k: fitToHeight (KeyH) and histogram (KeyH, panel context) are both skipped from direct registration', () => {
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

    // Both use bare KeyH — both are context-managed, so neither should be directly registered
    const bareKeyHBindings = km.getBindings().filter(
      (binding) => binding.combo.code === 'KeyH' && !binding.combo.shift && !binding.combo.alt && !binding.combo.ctrl,
    );
    expect(bareKeyHBindings).toHaveLength(0);
  });

  it('SK-M25l: histogram shortcut uses bare H with panel context', () => {
    // Verify the histogram binding uses bare KeyH with panel context
    const histogramBinding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(histogramBinding).toBeDefined();
    expect(histogramBinding!.code).toBe('KeyH');
    expect(histogramBinding!.ctrl).toBeUndefined();
    expect(histogramBinding!.shift).toBeUndefined();
    expect(histogramBinding!.context).toBe('panel');
    expect(describeKeyCombo({ code: histogramBinding!.code })).toBe('H');
  });

  it('SK-M25m: histogram (H, panel) and fitToHeight (H, global) are separated by context', () => {
    // panel.histogram uses bare KeyH with panel context
    const histogramBinding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(histogramBinding!.code).toBe('KeyH');
    expect(histogramBinding!.context).toBe('panel');
    // view.fitToHeight uses bare KeyH (global context, managed by contextual resolver)
    const fitToHeightBinding = DEFAULT_KEY_BINDINGS['view.fitToHeight'];
    expect(fitToHeightBinding!.code).toBe('KeyH');
    // They share the same key but are resolved by context (panel vs global)
    expect(histogramBinding!.context).not.toBe(fitToHeightBinding!.context ?? 'global');
  });

  it('SK-M25n: Shift+L is only registered for lut.togglePanel (no conflict with channel.luminance)', () => {
    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    const actionHandlers = {
      'lut.togglePanel': () => undefined,
    };
    const registrationHandler = new AppKeyboardHandler(km, ckm, {
      getActionHandlers: () => actionHandlers,
      getContainer: () => document.body,
    });

    registrationHandler.setup();

    // Shift+L should be registered exactly once for lut.togglePanel
    const shiftLBindings = km.getBindings().filter(
      (binding) => binding.combo.code === 'KeyL' && binding.combo.shift,
    );
    expect(shiftLBindings).toHaveLength(1);
  });

  it('SK-M25o: channel.luminance has no default binding; lut.togglePanel owns Shift+L', () => {
    const luminanceBinding = DEFAULT_KEY_BINDINGS['channel.luminance'];
    expect(luminanceBinding).toBeUndefined();

    const lutBinding = DEFAULT_KEY_BINDINGS['lut.togglePanel'];
    expect(lutBinding).toBeDefined();
    expect(lutBinding!.code).toBe('KeyL');
    expect(lutBinding!.shift).toBe(true);
  });

  it('SK-M25p: channel.grayscale (Shift+Y) is the working shortcut for luminance', () => {
    const grayscaleBinding = DEFAULT_KEY_BINDINGS['channel.grayscale'];
    expect(grayscaleBinding).toBeDefined();
    expect(grayscaleBinding!.code).toBe('KeyY');
    expect(grayscaleBinding!.shift).toBe(true);
  });
});

describe('Scope shortcut regression tests (Issues #1, #2, #3)', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('SCOPE-REG01: histogram binding uses bare H with panel context', () => {
    const binding = DEFAULT_KEY_BINDINGS['panel.histogram'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyH');
    expect(binding!.ctrl).toBeUndefined();
    expect(binding!.shift).toBeUndefined();
    expect(binding!.context).toBe('panel');
  });

  it('SCOPE-REG02: waveform binding uses bare W with panel context', () => {
    const binding = DEFAULT_KEY_BINDINGS['panel.waveform'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyW');
    expect(binding!.ctrl).toBeUndefined();
    expect(binding!.shift).toBeUndefined();
    expect(binding!.context).toBe('panel');
  });

  it('SCOPE-REG03: gamut diagram binding uses bare G with panel context', () => {
    const binding = DEFAULT_KEY_BINDINGS['panel.gamutDiagram'];
    expect(binding).toBeDefined();
    expect(binding!.code).toBe('KeyG');
    expect(binding!.ctrl).toBeUndefined();
    expect(binding!.shift).toBeUndefined();
    expect(binding!.context).toBe('panel');
  });

  it('SCOPE-REG04: histogram and fitToHeight share KeyH but differ by context', () => {
    const histogram = DEFAULT_KEY_BINDINGS['panel.histogram']!;
    const fitToHeight = DEFAULT_KEY_BINDINGS['view.fitToHeight']!;
    expect(histogram.code).toBe('KeyH');
    expect(fitToHeight.code).toBe('KeyH');
    // histogram is panel-context, fitToHeight is global (no context = global)
    expect(histogram.context).toBe('panel');
    expect(fitToHeight.context).toBeUndefined();
  });

  it('SCOPE-REG05: waveform and fitToWidth share KeyW but differ by context', () => {
    const waveform = DEFAULT_KEY_BINDINGS['panel.waveform']!;
    const fitToWidth = DEFAULT_KEY_BINDINGS['view.fitToWidth']!;
    expect(waveform.code).toBe('KeyW');
    expect(fitToWidth.code).toBe('KeyW');
    expect(waveform.context).toBe('panel');
    expect(fitToWidth.context).toBeUndefined();
  });

  it('SCOPE-REG06: gamut diagram and gotoFrame share KeyG but differ by context', () => {
    const gamut = DEFAULT_KEY_BINDINGS['panel.gamutDiagram']!;
    const gotoFrame = DEFAULT_KEY_BINDINGS['navigation.gotoFrame']!;
    expect(gamut.code).toBe('KeyG');
    expect(gotoFrame.code).toBe('KeyG');
    expect(gamut.context).toBe('panel');
    expect(gotoFrame.context).toBeUndefined();
  });

  it('SCOPE-REG07: scope shortcuts are context-managed (skipped from direct registration)', () => {
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
    // Bare KeyH should NOT be directly registered (context-managed)
    const hBindings = bindings.filter(
      (b) => b.combo.code === 'KeyH' && !b.combo.ctrl && !b.combo.shift,
    );
    expect(hBindings).toHaveLength(0);

    // Bare KeyW should NOT be directly registered (context-managed)
    const wBindings = bindings.filter(
      (b) => b.combo.code === 'KeyW' && !b.combo.ctrl && !b.combo.shift,
    );
    expect(wBindings).toHaveLength(0);

    // Bare KeyG should NOT be directly registered (context-managed)
    const gBindings = bindings.filter(
      (b) => b.combo.code === 'KeyG' && !b.combo.ctrl && !b.combo.shift,
    );
    expect(gBindings).toHaveLength(0);
  });

  it('SCOPE-REG08: describeKeyCombo produces correct labels for scope shortcuts', () => {
    expect(describeKeyCombo({ code: 'KeyH' })).toBe('H');
    expect(describeKeyCombo({ code: 'KeyW' })).toBe('W');
    expect(describeKeyCombo({ code: 'KeyG' })).toBe('G');
  });
});

describe('Scope UI hint regression tests (Issues #1, #2, #3)', () => {
  it('SCOPE-UI01: ScopesControl shortcut hints show bare keys for context-managed scopes', () => {
    const control = new ScopesControl();
    const el = control.render();
    const button = el.querySelector('[data-testid="scopes-control-button"]') as HTMLButtonElement;

    // The button title should reference bare keys (context-managed via panel context)
    expect(button.title).toContain('h: histogram');
    expect(button.title).toContain('w: waveform');
    expect(button.title).toContain('g: CIE diagram');
    expect(button.title).toContain('QC tab');

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
    // histogram option — bare h
    expect(options[0]!.textContent).toContain('h');
    // waveform option — bare w
    expect(options[1]!.textContent).toContain('w');
    // vectorscope option (unchanged)
    expect(options[2]!.textContent).toContain('y');
    // gamut diagram option — bare g
    expect(options[3]!.textContent).toContain('g');

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
