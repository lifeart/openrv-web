/**
 * AppKeyboardHandler - Shortcuts dialog search/filter tests (M-25)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppKeyboardHandler, KeyboardHandlerContext } from './AppKeyboardHandler';
import { KeyboardManager } from './utils/input/KeyboardManager';
import { CustomKeyBindingsManager } from './utils/input/CustomKeyBindingsManager';
import { closeModal } from './ui/components/shared/Modal';

// Stub localStorage so CustomKeyBindingsManager doesn't throw
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

function createHandler(): AppKeyboardHandler {
  const km = new KeyboardManager();
  const ckm = new CustomKeyBindingsManager();
  const ctx: KeyboardHandlerContext = {
    getActionHandlers: () => ({}),
    getContainer: () => document.body,
  };
  return new AppKeyboardHandler(km, ckm, ctx);
}

/** Helper: dispatch a native `input` event on the given element */
function fireInput(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Shortcuts dialog search/filter (M-25)', () => {
  let handler: AppKeyboardHandler;

  beforeEach(() => {
    localStorageMock.clear();
    handler = createHandler();
  });

  afterEach(() => {
    closeModal();
  });

  it('SK-M25a: Shortcuts dialog should contain a search/filter input', () => {
    handler.showShortcutsDialog();

    const searchInput = document.querySelector<HTMLInputElement>('[data-testid="shortcuts-search"]');
    expect(searchInput).not.toBeNull();
    expect(searchInput!.tagName).toBe('INPUT');
    expect(searchInput!.type).toBe('text');
    expect(searchInput!.placeholder).toMatch(/search/i);
  });

  it('SK-M25b: Typing in the search input should filter displayed shortcuts by description', () => {
    handler.showShortcutsDialog();

    const searchInput = document.querySelector<HTMLInputElement>('[data-testid="shortcuts-search"]')!;
    const allRows = document.querySelectorAll<HTMLElement>('[data-shortcut-row]');
    expect(allRows.length).toBeGreaterThan(0);

    // Search for "toggle play" which matches "Toggle play/pause"
    fireInput(searchInput, 'toggle play');

    const visibleRows = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'))
      .filter(r => r.style.display !== 'none');

    // Should have at least one match and fewer than all rows
    expect(visibleRows.length).toBeGreaterThan(0);
    expect(visibleRows.length).toBeLessThan(allRows.length);

    // Every visible row should contain "toggle play" in its description
    for (const row of visibleRows) {
      const desc = row.getAttribute('data-shortcut-desc') || '';
      expect(desc).toContain('toggle play');
    }
  });

  it('SK-M25c: Typing a key name (e.g., "Shift") should filter shortcuts containing that modifier', () => {
    handler.showShortcutsDialog();

    const searchInput = document.querySelector<HTMLInputElement>('[data-testid="shortcuts-search"]')!;
    const allRows = document.querySelectorAll<HTMLElement>('[data-shortcut-row]');

    fireInput(searchInput, 'shift');

    const visibleRows = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'))
      .filter(r => r.style.display !== 'none');

    expect(visibleRows.length).toBeGreaterThan(0);
    expect(visibleRows.length).toBeLessThan(allRows.length);

    // Every visible row should contain "shift" in key or description
    for (const row of visibleRows) {
      const key = row.getAttribute('data-shortcut-key') || '';
      const desc = row.getAttribute('data-shortcut-desc') || '';
      expect(key.includes('shift') || desc.includes('shift')).toBe(true);
    }
  });

  it('SK-M25d: Clearing the search input should show all shortcuts', () => {
    handler.showShortcutsDialog();

    const searchInput = document.querySelector<HTMLInputElement>('[data-testid="shortcuts-search"]')!;
    const allRowsBefore = document.querySelectorAll<HTMLElement>('[data-shortcut-row]');
    const totalCount = allRowsBefore.length;

    // First filter down
    fireInput(searchInput, 'toggle play');
    const visibleAfterFilter = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'))
      .filter(r => r.style.display !== 'none');
    expect(visibleAfterFilter.length).toBeLessThan(totalCount);

    // Clear the search input
    fireInput(searchInput, '');

    const visibleAfterClear = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'))
      .filter(r => r.style.display !== 'none');
    expect(visibleAfterClear.length).toBe(totalCount);
  });

  it('SK-M25e: The search input should be auto-focused when the dialog opens', () => {
    handler.showShortcutsDialog();

    const searchInput = document.querySelector<HTMLInputElement>('[data-testid="shortcuts-search"]')!;
    expect(document.activeElement).toBe(searchInput);
  });

  it('SK-M25f: conflicting default scope shortcuts are hidden when not actually registered', () => {
    handler.showShortcutsDialog();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'));
    const descriptions = rows.map((row) => row.getAttribute('data-shortcut-desc'));

    expect(descriptions).not.toContain('toggle waveform scope');
    expect(descriptions).not.toContain('toggle histogram');
  });

  it('SK-M25g: conflicting shortcuts reappear once the user sets a custom binding', () => {
    const km = new KeyboardManager();
    const ckm = new CustomKeyBindingsManager();
    ckm.setCustomBinding('panel.waveform', { code: 'KeyU', ctrl: true });

    const customHandler = new AppKeyboardHandler(km, ckm, {
      getActionHandlers: () => ({}),
      getContainer: () => document.body,
    });

    customHandler.showShortcutsDialog();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'));
    const waveformRow = rows.find((row) => row.getAttribute('data-shortcut-desc') === 'toggle waveform scope');

    expect(waveformRow).toBeTruthy();
    expect(waveformRow?.getAttribute('data-shortcut-key')).toContain('ctrl');
    expect(waveformRow?.getAttribute('data-shortcut-key')).toContain('u');
  });

  it('SK-M25h: context-managed KeyG actions remain visible in the shortcut dialog', () => {
    handler.showShortcutsDialog();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'));
    const descriptions = rows.map((row) => row.getAttribute('data-shortcut-desc'));

    expect(descriptions).toContain('go to frame (open frame entry)');
    expect(descriptions).toContain('toggle ghost mode');
    expect(descriptions).toContain('toggle cie gamut diagram');
  });

  it('SK-M25i: newly added playback and transform shortcuts are listed', () => {
    handler.showShortcutsDialog();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut-row]'));
    const descriptions = rows.map((row) => row.getAttribute('data-shortcut-desc'));

    expect(descriptions).toContain('toggle between realtime and play all frames');
    expect(descriptions).toContain('reset rotation to 0');
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
});
