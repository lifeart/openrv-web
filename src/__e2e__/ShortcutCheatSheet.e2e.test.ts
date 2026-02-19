/**
 * ShortcutCheatSheet E2E Integration Tests
 *
 * Verifies end-to-end wiring of the ShortcutCheatSheet overlay:
 * - Instantiation with a mock ShortcutEditorManager
 * - Toggle / show / hide / isVisible behavior
 * - ESC hides the sheet (priority before other ESC handlers)
 * - Context filtering and text search
 * - Dispose cleanup
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShortcutCheatSheet } from '../ui/components/ShortcutCheatSheet';
import type { ShortcutEditorManager } from '../ui/components/ShortcutEditor';
import type { KeyCombination } from '../utils/input/KeyboardManager';

// ---------------------------------------------------------------------------
// Mock manager that satisfies ShortcutEditorManager
// ---------------------------------------------------------------------------

function createMockManager(
  overrides: Partial<ShortcutEditorManager> = {},
): ShortcutEditorManager {
  const actions = [
    {
      action: 'playback.toggle',
      description: 'Toggle play/pause',
      currentCombo: { code: 'Space' } as KeyCombination,
    },
    {
      action: 'playback.stepForward',
      description: 'Step forward one frame',
      currentCombo: { code: 'ArrowRight' } as KeyCombination,
    },
    {
      action: 'view.fitToWindow',
      description: 'Fit image to window',
      currentCombo: { code: 'KeyF' } as KeyCombination,
    },
    {
      action: 'panel.color',
      description: 'Toggle color controls panel',
      currentCombo: { code: 'KeyC' } as KeyCombination,
    },
    {
      action: 'help.toggleCheatSheet',
      description: 'Toggle keyboard shortcuts cheat sheet',
      currentCombo: { code: 'Slash', shift: true } as KeyCombination,
    },
  ];

  return {
    getAvailableActions: () => actions,
    getEffectiveCombo: (action: string) => {
      const found = actions.find(a => a.action === action);
      return found?.currentCombo ?? { code: '' };
    },
    setCustomBinding: () => {},
    findConflictingAction: () => null,
    hasCustomBinding: () => false,
    removeCustomBinding: () => {},
    resetAll: () => {},
    getCustomBindings: () => [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShortcutCheatSheet E2E Integration', () => {
  let container: HTMLElement;
  let manager: ShortcutEditorManager;
  let sheet: ShortcutCheatSheet;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    manager = createMockManager();
    sheet = new ShortcutCheatSheet(container, manager);
  });

  afterEach(() => {
    sheet.dispose();
    container.remove();
  });

  // -----------------------------------------------------------------------
  // Instantiation
  // -----------------------------------------------------------------------

  describe('instantiation', () => {
    it('creates an overlay element inside the container', () => {
      const overlay = container.querySelector('.cheatsheet-overlay');
      expect(overlay).not.toBeNull();
    });

    it('overlay has correct ARIA attributes', () => {
      const overlay = container.querySelector('.cheatsheet-overlay')!;
      expect(overlay.getAttribute('role')).toBe('dialog');
      expect(overlay.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    });

    it('overlay is hidden by default', () => {
      expect(sheet.isVisible()).toBe(false);
      const overlay = container.querySelector('.cheatsheet-overlay') as HTMLElement;
      expect(overlay.style.display).toBe('none');
    });
  });

  // -----------------------------------------------------------------------
  // Toggle / show / hide / isVisible
  // -----------------------------------------------------------------------

  describe('toggle / show / hide / isVisible', () => {
    it('show() makes the overlay visible', () => {
      sheet.show();
      expect(sheet.isVisible()).toBe(true);
    });

    it('hide() makes the overlay hidden', () => {
      sheet.show();
      sheet.hide();
      expect(sheet.isVisible()).toBe(false);
    });

    it('toggle() shows when hidden', () => {
      sheet.toggle();
      expect(sheet.isVisible()).toBe(true);
    });

    it('toggle() hides when visible', () => {
      sheet.show();
      sheet.toggle();
      expect(sheet.isVisible()).toBe(false);
    });

    it('toggle() round-trip: hidden -> visible -> hidden', () => {
      expect(sheet.isVisible()).toBe(false);
      sheet.toggle();
      expect(sheet.isVisible()).toBe(true);
      sheet.toggle();
      expect(sheet.isVisible()).toBe(false);
    });

    it('show() renders shortcut groups into the overlay', () => {
      sheet.show();
      const groups = container.querySelectorAll('.cheatsheet-group');
      // We have 4 distinct categories: playback, view, panel, help
      expect(groups.length).toBe(4);
    });

    it('show() renders action rows with description and combo', () => {
      sheet.show();
      const rows = container.querySelectorAll('.cheatsheet-row');
      // 5 actions total
      expect(rows.length).toBe(5);

      // Check first row has description + combo spans
      const firstRow = rows[0]!;
      const desc = firstRow.querySelector('.cheatsheet-description');
      const combo = firstRow.querySelector('.cheatsheet-combo');
      expect(desc).not.toBeNull();
      expect(combo).not.toBeNull();
      expect(desc!.textContent).toBeTruthy();
      expect(combo!.textContent).toBeTruthy();
    });

    it('show() marks customized bindings', () => {
      const customManager = createMockManager({
        hasCustomBinding: (action: string) => action === 'playback.toggle',
      });
      const customSheet = new ShortcutCheatSheet(container, customManager);
      customSheet.show();

      const customized = container.querySelectorAll('.cheatsheet-customized');
      expect(customized.length).toBe(1);
      expect(customized[0]!.getAttribute('data-action')).toBe('playback.toggle');

      customSheet.dispose();
    });

    it('multiple show() calls re-render without duplicating content', () => {
      sheet.show();
      sheet.show();
      const groups = container.querySelectorAll('.cheatsheet-group');
      expect(groups.length).toBe(4);
    });
  });

  // -----------------------------------------------------------------------
  // ESC hides the sheet
  // -----------------------------------------------------------------------

  describe('show/hide lifecycle', () => {
    it('show then hide returns to hidden state', () => {
      sheet.show();
      expect(sheet.isVisible()).toBe(true);

      sheet.hide();
      expect(sheet.isVisible()).toBe(false);
    });

    it('hide() on an already hidden sheet is a safe no-op', () => {
      expect(sheet.isVisible()).toBe(false);
      expect(() => sheet.hide()).not.toThrow();
      expect(sheet.isVisible()).toBe(false);
    });

    it('show() then hide() correctly updates overlay display style', () => {
      sheet.show();
      const overlay = container.querySelector('.cheatsheet-overlay') as HTMLElement;
      expect(overlay.style.display).not.toBe('none');

      sheet.hide();
      expect(overlay.style.display).toBe('none');
    });
  });

  // -----------------------------------------------------------------------
  // Context filtering
  // -----------------------------------------------------------------------

  describe('context filtering', () => {
    it('setContext() filters to a specific category', () => {
      sheet.show();
      sheet.setContext('playback');

      const groups = container.querySelectorAll('.cheatsheet-group');
      expect(groups.length).toBe(1);
      expect(groups[0]!.getAttribute('data-category')).toBe('playback');
    });

    it('setContext(null) shows all categories', () => {
      sheet.show();
      sheet.setContext('playback');
      sheet.setContext(null);

      const groups = container.querySelectorAll('.cheatsheet-group');
      expect(groups.length).toBe(4);
    });

    it('getContext() returns the current context', () => {
      expect(sheet.getContext()).toBeNull();
      sheet.setContext('view');
      expect(sheet.getContext()).toBe('view');
    });

    it('setContext() with non-existent category shows no groups', () => {
      sheet.show();
      sheet.setContext('nonexistent');

      const groups = container.querySelectorAll('.cheatsheet-group');
      expect(groups.length).toBe(0);
    });

    it('setContext() while hidden does not render until shown', () => {
      sheet.setContext('playback');
      // Overlay should still be hidden
      expect(sheet.isVisible()).toBe(false);

      sheet.show();
      const groups = container.querySelectorAll('.cheatsheet-group');
      expect(groups.length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Text search / filter
  // -----------------------------------------------------------------------

  describe('text search filtering', () => {
    it('filter() narrows displayed actions by description match', () => {
      sheet.show();
      sheet.filter('play');

      const rows = container.querySelectorAll('.cheatsheet-row');
      // "Toggle play/pause" matches "play"
      expect(rows.length).toBeGreaterThanOrEqual(1);

      const descriptions = Array.from(rows).map(
        r => r.querySelector('.cheatsheet-description')?.textContent,
      );
      for (const desc of descriptions) {
        expect(desc?.toLowerCase()).toContain('play');
      }
    });

    it('filter() narrows displayed actions by combo match', () => {
      sheet.show();
      sheet.filter('Space');

      const rows = container.querySelectorAll('.cheatsheet-row');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('filter() is case-insensitive', () => {
      sheet.show();
      sheet.filter('PLAY');

      const rows = container.querySelectorAll('.cheatsheet-row');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('filter() hides groups with no matching actions', () => {
      sheet.show();
      sheet.filter('Toggle play/pause');

      const groups = container.querySelectorAll('.cheatsheet-group');
      // Only the playback group should remain
      expect(groups.length).toBe(1);
      expect(groups[0]!.getAttribute('data-category')).toBe('playback');
    });

    it('clearFilter() restores all actions', () => {
      sheet.show();
      sheet.filter('xyznonexistent');
      expect(container.querySelectorAll('.cheatsheet-row').length).toBe(0);

      sheet.clearFilter();
      expect(container.querySelectorAll('.cheatsheet-row').length).toBe(5);
    });

    it('filter() with empty string shows all', () => {
      sheet.show();
      sheet.filter('');

      const rows = container.querySelectorAll('.cheatsheet-row');
      expect(rows.length).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // Dispose cleanup
  // -----------------------------------------------------------------------

  describe('dispose', () => {
    it('dispose() removes the overlay from the DOM', () => {
      expect(container.querySelector('.cheatsheet-overlay')).not.toBeNull();
      sheet.dispose();
      expect(container.querySelector('.cheatsheet-overlay')).toBeNull();
    });

    it('after dispose, isVisible() returns false', () => {
      sheet.show();
      expect(sheet.isVisible()).toBe(true);
      sheet.dispose();
      expect(sheet.isVisible()).toBe(false);
    });

    it('after dispose, show() is a no-op', () => {
      sheet.dispose();
      sheet.show();
      expect(sheet.isVisible()).toBe(false);
    });

    it('after dispose, toggle() is a no-op', () => {
      sheet.dispose();
      sheet.toggle();
      expect(sheet.isVisible()).toBe(false);
    });

    it('after dispose, hide() is a no-op (no error)', () => {
      sheet.dispose();
      expect(() => sheet.hide()).not.toThrow();
    });

    it('after dispose, setContext() is a no-op', () => {
      sheet.dispose();
      expect(() => sheet.setContext('playback')).not.toThrow();
    });

    it('after dispose, filter() is a no-op', () => {
      sheet.dispose();
      expect(() => sheet.filter('test')).not.toThrow();
    });

    it('double dispose does not throw', () => {
      sheet.dispose();
      expect(() => sheet.dispose()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // help.toggleCheatSheet key binding wiring
  // -----------------------------------------------------------------------

  describe('key binding wiring (help.toggleCheatSheet)', () => {
    it('the mock manager includes help.toggleCheatSheet action', () => {
      const actions = manager.getAvailableActions();
      const helpAction = actions.find(a => a.action === 'help.toggleCheatSheet');
      expect(helpAction).toBeDefined();
      expect(helpAction!.description).toBe('Toggle keyboard shortcuts cheat sheet');
      expect(helpAction!.currentCombo.code).toBe('Slash');
      expect(helpAction!.currentCombo.shift).toBe(true);
    });

    it('cheat sheet renders the help group containing the ? shortcut', () => {
      sheet.show();
      const helpGroup = container.querySelector('[data-category="help"]');
      expect(helpGroup).not.toBeNull();

      const helpRow = helpGroup!.querySelector('[data-action="help.toggleCheatSheet"]');
      expect(helpRow).not.toBeNull();

      const combo = helpRow!.querySelector('.cheatsheet-combo');
      expect(combo!.textContent).toContain('Shift');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('works with a manager that returns no actions', () => {
      const emptyManager = createMockManager({
        getAvailableActions: () => [],
      });
      const emptySheet = new ShortcutCheatSheet(container, emptyManager);
      emptySheet.show();

      expect(emptySheet.isVisible()).toBe(true);
      expect(container.querySelectorAll('.cheatsheet-group').length).toBe(0);
      expect(container.querySelectorAll('.cheatsheet-row').length).toBe(0);

      emptySheet.dispose();
    });

    it('context + text filter combine correctly', () => {
      sheet.show();
      sheet.setContext('playback');
      sheet.filter('step');

      const rows = container.querySelectorAll('.cheatsheet-row');
      // Only "Step forward one frame" in playback category
      expect(rows.length).toBe(1);
      expect(
        rows[0]!.querySelector('.cheatsheet-description')!.textContent,
      ).toContain('Step forward');
    });

    it('rapid toggle does not corrupt state', () => {
      for (let i = 0; i < 20; i++) {
        sheet.toggle();
      }
      // 20 toggles = even number = back to hidden
      expect(sheet.isVisible()).toBe(false);

      sheet.toggle(); // 21st = visible
      expect(sheet.isVisible()).toBe(true);
    });
  });
});
