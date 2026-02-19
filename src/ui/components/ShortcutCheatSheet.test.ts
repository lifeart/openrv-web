import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShortcutCheatSheet } from './ShortcutCheatSheet';
import type { ShortcutEditorManager } from './ShortcutEditor';
import type { KeyCombination } from '../../utils/input/KeyboardManager';

// ---------------------------------------------------------------------------
// Mock Manager
// ---------------------------------------------------------------------------

function createMockManager(): ShortcutEditorManager & {
  _customBindings: Map<string, KeyCombination>;
  _actions: Array<{ action: string; description: string; currentCombo: KeyCombination }>;
} {
  const customBindings = new Map<string, KeyCombination>();

  const actions = [
    { action: 'playback.toggle', description: 'Play/Pause', currentCombo: { code: 'Space' } as KeyCombination },
    { action: 'playback.stepForward', description: 'Step Forward', currentCombo: { code: 'ArrowRight' } as KeyCombination },
    { action: 'view.fitToWindow', description: 'Fit to Window', currentCombo: { code: 'KeyF' } as KeyCombination },
    { action: 'view.toggleFullscreen', description: 'Fullscreen', currentCombo: { code: 'KeyF', ctrl: true } as KeyCombination },
    { action: 'edit.undo', description: 'Undo', currentCombo: { code: 'KeyZ', ctrl: true } as KeyCombination },
    { action: 'panel.color', description: 'Color Panel', currentCombo: { code: 'KeyC' } as KeyCombination },
  ];

  const manager: ShortcutEditorManager & {
    _customBindings: Map<string, KeyCombination>;
    _actions: typeof actions;
  } = {
    _customBindings: customBindings,
    _actions: actions,

    getAvailableActions: vi.fn(() =>
      actions.map(a => ({
        ...a,
        currentCombo: customBindings.get(a.action) ?? a.currentCombo,
      })),
    ),

    getEffectiveCombo: vi.fn((action: string) => {
      const custom = customBindings.get(action);
      if (custom) return custom;
      return actions.find(a => a.action === action)?.currentCombo ?? { code: '' };
    }),

    setCustomBinding: vi.fn((action: string, combo: KeyCombination) => {
      customBindings.set(action, combo);
    }),

    findConflictingAction: vi.fn((_combo: KeyCombination, _excludeAction?: string) => null),

    hasCustomBinding: vi.fn((action: string) => customBindings.has(action)),

    removeCustomBinding: vi.fn((action: string) => {
      customBindings.delete(action);
    }),

    resetAll: vi.fn(() => {
      customBindings.clear();
    }),

    getCustomBindings: vi.fn(() =>
      [...customBindings.entries()].map(([action, customCombo]) => ({ action, customCombo })),
    ),
  };

  return manager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShortcutCheatSheet', () => {
  let container: HTMLElement;
  let manager: ReturnType<typeof createMockManager>;
  let sheet: ShortcutCheatSheet;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    manager = createMockManager();
    sheet = new ShortcutCheatSheet(container, manager);
  });

  afterEach(() => {
    sheet.dispose();
    document.body.removeChild(container);
  });

  it('CS-001: constructor creates overlay element', () => {
    const overlay = container.querySelector('.cheatsheet-overlay');
    expect(overlay).not.toBeNull();
    // Overlay should be initially hidden
    expect((overlay as HTMLElement).style.display).toBe('none');
  });

  it('CS-002: show/hide/toggle/isVisible work correctly', () => {
    expect(sheet.isVisible()).toBe(false);

    sheet.show();
    expect(sheet.isVisible()).toBe(true);

    sheet.hide();
    expect(sheet.isVisible()).toBe(false);

    sheet.toggle();
    expect(sheet.isVisible()).toBe(true);

    sheet.toggle();
    expect(sheet.isVisible()).toBe(false);
  });

  it('CS-003: renders all shortcut categories from manager', () => {
    sheet.show();

    const groups = container.querySelectorAll('.cheatsheet-group');
    const categories = [...groups].map(g => (g as HTMLElement).dataset.category);

    // Mock manager has: playback, view, edit, panel
    expect(categories).toContain('playback');
    expect(categories).toContain('view');
    expect(categories).toContain('edit');
    expect(categories).toContain('panel');
    expect(groups.length).toBe(4);

    // Check that headers are present
    const headers = container.querySelectorAll('.cheatsheet-group-header');
    const headerTexts = [...headers].map(h => h.textContent);
    expect(headerTexts).toContain('Playback');
    expect(headerTexts).toContain('View');
    expect(headerTexts).toContain('Edit');
    expect(headerTexts).toContain('Panels');
  });

  it('CS-004: renders correct key combo labels', () => {
    sheet.show();

    const rows = container.querySelectorAll('.cheatsheet-row');
    expect(rows.length).toBe(6);

    // Find playback.toggle row
    const toggleRow = [...rows].find(r => (r as HTMLElement).dataset.action === 'playback.toggle') as HTMLElement;
    expect(toggleRow).not.toBeNull();
    expect(toggleRow.querySelector('.cheatsheet-description')!.textContent).toBe('Play/Pause');
    expect(toggleRow.querySelector('.cheatsheet-combo')!.textContent).toBe('Space');

    // Find view.toggleFullscreen row (has Ctrl modifier)
    const fullscreenRow = [...rows].find(r => (r as HTMLElement).dataset.action === 'view.toggleFullscreen') as HTMLElement;
    expect(fullscreenRow).not.toBeNull();
    expect(fullscreenRow.querySelector('.cheatsheet-combo')!.textContent).toBe('Ctrl+F');
  });

  it('CS-005: marks customized bindings with CSS class', () => {
    manager._customBindings.set('playback.toggle', { code: 'KeyP' });

    sheet.show();

    const customizedRows = container.querySelectorAll('.cheatsheet-customized');
    expect(customizedRows.length).toBe(1);
    expect((customizedRows[0] as HTMLElement).dataset.action).toBe('playback.toggle');

    // Non-customized rows should NOT have the class
    const normalRow = [...container.querySelectorAll('.cheatsheet-row')]
      .find(r => (r as HTMLElement).dataset.action === 'playback.stepForward') as HTMLElement;
    expect(normalRow.classList.contains('cheatsheet-customized')).toBe(false);
  });

  it('CS-006: setContext filters to matching category', () => {
    sheet.show();
    sheet.setContext('playback');

    const groups = container.querySelectorAll('.cheatsheet-group');
    expect(groups.length).toBe(1);
    expect((groups[0] as HTMLElement).dataset.category).toBe('playback');

    const rows = container.querySelectorAll('.cheatsheet-row');
    expect(rows.length).toBe(2); // playback.toggle + playback.stepForward
  });

  it('CS-007: setContext(null) shows all categories', () => {
    sheet.show();
    sheet.setContext('playback');

    // Verify only one group
    expect(container.querySelectorAll('.cheatsheet-group').length).toBe(1);

    // Reset context
    sheet.setContext(null);

    // All groups should be visible again
    const groups = container.querySelectorAll('.cheatsheet-group');
    expect(groups.length).toBe(4);
  });

  it('CS-008: filter by description text', () => {
    sheet.show();
    sheet.filter('undo');

    const rows = container.querySelectorAll('.cheatsheet-row');
    expect(rows.length).toBe(1);
    expect((rows[0] as HTMLElement).dataset.action).toBe('edit.undo');
  });

  it('CS-009: filter by key combo text', () => {
    sheet.show();
    sheet.filter('Ctrl+F');

    const rows = container.querySelectorAll('.cheatsheet-row');
    expect(rows.length).toBe(1);
    expect((rows[0] as HTMLElement).dataset.action).toBe('view.toggleFullscreen');
  });

  it('CS-010: clearFilter restores all shortcuts', () => {
    sheet.show();
    sheet.filter('undo');

    // Only one match
    expect(container.querySelectorAll('.cheatsheet-row').length).toBe(1);

    sheet.clearFilter();

    // All rows restored
    expect(container.querySelectorAll('.cheatsheet-row').length).toBe(6);
  });

  it('CS-011: re-renders on show() to pick up changes', () => {
    sheet.show();

    // Initially no customized rows
    expect(container.querySelectorAll('.cheatsheet-customized').length).toBe(0);

    sheet.hide();

    // Change a binding while hidden
    manager._customBindings.set('edit.undo', { code: 'KeyU', ctrl: true });

    sheet.show();

    // Should now reflect the change
    const customizedRows = container.querySelectorAll('.cheatsheet-customized');
    expect(customizedRows.length).toBe(1);
    expect((customizedRows[0] as HTMLElement).dataset.action).toBe('edit.undo');
  });

  it('CS-012: dispose cleans up DOM', () => {
    expect(container.querySelector('.cheatsheet-overlay')).not.toBeNull();

    sheet.dispose();

    expect(container.querySelector('.cheatsheet-overlay')).toBeNull();
  });

  it('CS-013: getContext returns current context', () => {
    expect(sheet.getContext()).toBeNull();

    sheet.setContext('view');
    expect(sheet.getContext()).toBe('view');

    sheet.setContext(null);
    expect(sheet.getContext()).toBeNull();
  });

  it('CS-014: toggle cycles visibility', () => {
    // Start hidden
    expect(sheet.isVisible()).toBe(false);

    // Toggle on
    sheet.toggle();
    expect(sheet.isVisible()).toBe(true);

    // Toggle off
    sheet.toggle();
    expect(sheet.isVisible()).toBe(false);

    // Toggle on again
    sheet.toggle();
    expect(sheet.isVisible()).toBe(true);
  });

  it('CS-015: setContext with unknown category renders empty overlay', () => {
    sheet.show();
    sheet.setContext('nonexistent');

    const groups = container.querySelectorAll('.cheatsheet-group');
    expect(groups.length).toBe(0);

    const rows = container.querySelectorAll('.cheatsheet-row');
    expect(rows.length).toBe(0);
  });

  it('CS-016: context and filter compose correctly', () => {
    sheet.show();
    sheet.setContext('view');
    sheet.filter('full');

    const rows = container.querySelectorAll('.cheatsheet-row');
    expect(rows.length).toBe(1);
    expect((rows[0] as HTMLElement).dataset.action).toBe('view.toggleFullscreen');
  });

  it('CS-017: filter with no matches shows empty overlay', () => {
    sheet.show();
    sheet.filter('xyznonexistent');

    expect(container.querySelectorAll('.cheatsheet-row').length).toBe(0);
    expect(container.querySelectorAll('.cheatsheet-group').length).toBe(0);
  });

  it('CS-018: show after dispose is a no-op', () => {
    sheet.dispose();

    // Should not throw
    expect(() => sheet.show()).not.toThrow();

    // Overlay should not be in DOM
    expect(container.querySelector('.cheatsheet-overlay')).toBeNull();
    expect(sheet.isVisible()).toBe(false);
  });

  it('CS-019: overlay has ARIA attributes', () => {
    const overlay = container.querySelector('.cheatsheet-overlay') as HTMLElement;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-label')).toBe('Keyboard shortcuts');
  });

  it('CS-020: double dispose is safe', () => {
    sheet.dispose();
    expect(() => sheet.dispose()).not.toThrow();
  });

  it('CS-021: isVisible returns false after show-then-dispose', () => {
    sheet.show();
    expect(sheet.isVisible()).toBe(true);
    sheet.dispose();
    expect(sheet.isVisible()).toBe(false);
  });

  it('CS-022: toggle after dispose is a no-op', () => {
    sheet.dispose();
    expect(() => sheet.toggle()).not.toThrow();
    expect(sheet.isVisible()).toBe(false);
  });
});
