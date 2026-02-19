import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ShortcutEditor,
  buildActionGroups,
  getActionCategory,
  keyEventToCombo,
  checkConflict,
  exportBindings,
  importBindings,
  type ShortcutEditorManager,
} from './ShortcutEditor';
import type { KeyCombination } from '../../utils/input/KeyboardManager';

// ---------------------------------------------------------------------------
// Mock Manager
// ---------------------------------------------------------------------------

function createMockManager(): ShortcutEditorManager & {
  _customBindings: Map<string, KeyCombination>;
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

  const manager: ShortcutEditorManager & { _customBindings: Map<string, KeyCombination> } = {
    _customBindings: customBindings,

    getAvailableActions: vi.fn(() =>
      actions.map(a => ({
        ...a,
        currentCombo: customBindings.get(a.action) ?? a.currentCombo,
      }))
    ),

    getEffectiveCombo: vi.fn((action: string) => {
      const custom = customBindings.get(action);
      if (custom) return custom;
      return actions.find(a => a.action === action)?.currentCombo ?? { code: '' };
    }),

    setCustomBinding: vi.fn((action: string, combo: KeyCombination) => {
      customBindings.set(action, combo);
    }),

    findConflictingAction: vi.fn((combo: KeyCombination, excludeAction?: string) => {
      for (const a of actions) {
        if (a.action === excludeAction) continue;
        const effective = customBindings.get(a.action) ?? a.currentCombo;
        if (effective.code === combo.code &&
            !!effective.ctrl === !!combo.ctrl &&
            !!effective.shift === !!combo.shift &&
            !!effective.alt === !!combo.alt) {
          return a.action;
        }
      }
      return null;
    }),

    hasCustomBinding: vi.fn((action: string) => customBindings.has(action)),

    removeCustomBinding: vi.fn((action: string) => {
      customBindings.delete(action);
    }),

    resetAll: vi.fn(() => {
      customBindings.clear();
    }),

    getCustomBindings: vi.fn(() =>
      [...customBindings.entries()].map(([action, customCombo]) => ({ action, customCombo }))
    ),
  };

  return manager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShortcutEditor', () => {
  describe('getActionCategory', () => {
    it('extracts category from dot-notation action', () => {
      expect(getActionCategory('playback.toggle')).toBe('playback');
      expect(getActionCategory('view.fitToWindow')).toBe('view');
    });

    it('returns "other" for actions without a dot', () => {
      expect(getActionCategory('somethingPlain')).toBe('other');
    });
  });

  describe('buildActionGroups', () => {
    it('SHORTCUT-U001: renders all actions grouped by category', () => {
      const manager = createMockManager();
      const groups = buildActionGroups(manager);

      // Should have groups for playback, view, edit, panel
      const categories = groups.map(g => g.category);
      expect(categories).toContain('playback');
      expect(categories).toContain('view');
      expect(categories).toContain('edit');
      expect(categories).toContain('panel');

      // Playback group should have 2 actions
      const playbackGroup = groups.find(g => g.category === 'playback')!;
      expect(playbackGroup.actions).toHaveLength(2);
      expect(playbackGroup.label).toBe('Playback');

      // View group should have 2 actions
      const viewGroup = groups.find(g => g.category === 'view')!;
      expect(viewGroup.actions).toHaveLength(2);
    });

    it('SHORTCUT-U002: shows current key combo for each action', () => {
      const manager = createMockManager();
      const groups = buildActionGroups(manager);

      const playbackGroup = groups.find(g => g.category === 'playback')!;
      const toggleEntry = playbackGroup.actions.find(a => a.action === 'playback.toggle')!;
      expect(toggleEntry.comboLabel).toBe('Space');
      expect(toggleEntry.description).toBe('Play/Pause');
    });

    it('SHORTCUT-U008: shows "modified" indicator for customized bindings', () => {
      const manager = createMockManager();
      // Set a custom binding
      manager._customBindings.set('playback.toggle', { code: 'KeyP' });

      const groups = buildActionGroups(manager);
      const playbackGroup = groups.find(g => g.category === 'playback')!;
      const toggleEntry = playbackGroup.actions.find(a => a.action === 'playback.toggle')!;

      expect(toggleEntry.isCustomized).toBe(true);
      // Step forward should NOT be customized
      const stepEntry = playbackGroup.actions.find(a => a.action === 'playback.stepForward')!;
      expect(stepEntry.isCustomized).toBe(false);
    });
  });

  describe('keyEventToCombo', () => {
    it('converts a simple key press to a combo', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyA' });
      const combo = keyEventToCombo(event);
      expect(combo).toEqual({ code: 'KeyA' });
    });

    it('includes modifiers', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyS', ctrlKey: true, shiftKey: true });
      const combo = keyEventToCombo(event);
      expect(combo).toEqual({ code: 'KeyS', ctrl: true, shift: true });
    });

    it('returns null for modifier-only keys', () => {
      const event = new KeyboardEvent('keydown', { code: 'ShiftLeft' });
      expect(keyEventToCombo(event)).toBeNull();
    });

    it('maps metaKey to ctrl', () => {
      const event = new KeyboardEvent('keydown', { code: 'KeyZ', metaKey: true });
      const combo = keyEventToCombo(event);
      expect(combo).toEqual({ code: 'KeyZ', ctrl: true });
    });
  });

  describe('checkConflict', () => {
    it('SHORTCUT-U005: shows conflict warning when combo already used', () => {
      const manager = createMockManager();
      // Space is used by playback.toggle
      const conflict = checkConflict(manager, 'view.fitToWindow', { code: 'Space' });
      expect(conflict).not.toBeNull();
      expect(conflict!.existingAction).toBe('playback.toggle');
      expect(conflict!.existingDescription).toBe('Play/Pause');
    });

    it('returns null when no conflict exists', () => {
      const manager = createMockManager();
      const conflict = checkConflict(manager, 'view.fitToWindow', { code: 'KeyQ' });
      expect(conflict).toBeNull();
    });

    it('excludes the action being rebound from conflict check', () => {
      const manager = createMockManager();
      // Rebinding Space to playback.toggle (same action) should not conflict
      const conflict = checkConflict(manager, 'playback.toggle', { code: 'Space' });
      expect(conflict).toBeNull();
    });
  });

  describe('export / import', () => {
    it('exportBindings produces valid JSON with version', () => {
      const manager = createMockManager();
      manager._customBindings.set('playback.toggle', { code: 'KeyP' });

      const json = exportBindings(manager);
      const data = JSON.parse(json);
      expect(data.version).toBe(1);
      expect(data.bindings).toHaveLength(1);
      expect(data.bindings[0].action).toBe('playback.toggle');
      expect(data.bindings[0].combo.code).toBe('KeyP');
    });

    it('importBindings restores bindings', () => {
      const manager = createMockManager();
      const json = JSON.stringify({
        version: 1,
        bindings: [
          { action: 'playback.toggle', combo: { code: 'KeyP' } },
          { action: 'view.fitToWindow', combo: { code: 'KeyW', ctrl: true } },
        ],
      });

      const count = importBindings(manager, json);
      expect(count).toBe(2);
      expect(manager.setCustomBinding).toHaveBeenCalledTimes(2);
    });

    it('importBindings throws on invalid format', () => {
      const manager = createMockManager();
      expect(() => importBindings(manager, '{ "bad": true }')).toThrow('Invalid bindings format');
    });

    it('importBindings sanitizes combo properties to booleans only', () => {
      const manager = createMockManager();
      const json = JSON.stringify({
        version: 1,
        bindings: [
          { action: 'playback.toggle', combo: { code: 'KeyP', ctrl: 'yes', extra: 123 } },
        ],
      });

      importBindings(manager, json);
      // ctrl should be stripped (string "yes" !== true), extra should be stripped
      expect(manager.setCustomBinding).toHaveBeenCalledWith(
        'playback.toggle',
        { code: 'KeyP' },
        true,
      );
    });
  });

  describe('ShortcutEditor component', () => {
    let container: HTMLElement;
    let manager: ReturnType<typeof createMockManager>;
    let editor: ShortcutEditor;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      manager = createMockManager();
      editor = new ShortcutEditor(container, manager);
    });

    afterEach(() => {
      editor.dispose();
      document.body.removeChild(container);
    });

    it('renders action rows with descriptions', () => {
      const rows = container.querySelectorAll('.shortcut-row');
      expect(rows.length).toBe(6); // 6 mock actions

      const firstRow = rows[0]!;
      expect(firstRow.querySelector('.shortcut-description')!.textContent).toBe('Play/Pause');
      expect(firstRow.querySelector('.shortcut-combo')!.textContent).toBe('Space');
    });

    it('renders category group headers', () => {
      const headers = container.querySelectorAll('.shortcut-group-header');
      expect(headers.length).toBeGreaterThan(0);

      const texts = [...headers].map(h => h.textContent);
      expect(texts).toContain('Playback');
      expect(texts).toContain('View');
    });

    it('SHORTCUT-U003: click enters listening mode', () => {
      const comboBtn = container.querySelector('.shortcut-combo') as HTMLButtonElement;
      comboBtn.click();

      expect(editor.getListeningAction()).toBe('playback.toggle');
      expect(comboBtn.textContent).toBe('Press key...');
      expect(comboBtn.classList.contains('shortcut-listening')).toBe(true);
    });

    it('SHORTCUT-U004: captures keystroke and updates binding', () => {
      const comboBtn = container.querySelector('.shortcut-combo') as HTMLButtonElement;
      comboBtn.click();

      // Simulate keydown
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));

      expect(manager.setCustomBinding).toHaveBeenCalledWith(
        'playback.toggle',
        { code: 'KeyP' },
        true,
      );
      expect(editor.getListeningAction()).toBeNull();
    });

    it('SHORTCUT-U006: reset button restores default combo', () => {
      // Set a custom binding first
      manager._customBindings.set('playback.toggle', { code: 'KeyP' });
      editor.render();

      // Find the reset button
      const resetBtn = container.querySelector('.shortcut-modified .shortcut-reset') as HTMLButtonElement;
      expect(resetBtn).not.toBeNull();
      resetBtn.click();

      expect(manager.removeCustomBinding).toHaveBeenCalledWith('playback.toggle');
    });

    it('SHORTCUT-U007: "Reset All" calls manager.resetAll()', () => {
      const resetAllBtn = container.querySelector('.shortcut-reset-all') as HTMLButtonElement;
      expect(resetAllBtn).not.toBeNull();
      resetAllBtn.click();

      expect(manager.resetAll).toHaveBeenCalledTimes(1);
    });

    it('escape cancels listening mode', () => {
      const comboBtn = container.querySelector('.shortcut-combo') as HTMLButtonElement;
      comboBtn.click();
      expect(editor.getListeningAction()).toBe('playback.toggle');

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
      expect(editor.getListeningAction()).toBeNull();
      expect(manager.setCustomBinding).not.toHaveBeenCalled();
    });

    it('renders modified class for customized bindings', () => {
      manager._customBindings.set('playback.toggle', { code: 'KeyP' });
      editor.render();

      const modifiedRows = container.querySelectorAll('.shortcut-modified');
      expect(modifiedRows.length).toBe(1);
      expect((modifiedRows[0] as HTMLElement).dataset.action).toBe('playback.toggle');
    });

    it('SHORTCUT-U009: toolbar is not duplicated on re-render', () => {
      // Initial render happens in constructor, then call render() multiple times
      editor.render();
      editor.render();
      editor.render();

      const toolbars = container.querySelectorAll('.shortcut-toolbar');
      expect(toolbars.length).toBe(1);
    });

    it('SHORTCUT-U010: rapid re-click does not leak event listeners', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');

      // Click first combo button to start listening
      const comboBtn = container.querySelector('.shortcut-combo') as HTMLButtonElement;
      comboBtn.click();
      expect(editor.getListeningAction()).toBe('playback.toggle');

      // Click a different combo button while still listening
      const allCombos = container.querySelectorAll('.shortcut-combo');
      const secondCombo = allCombos[1] as HTMLButtonElement;
      secondCombo.click();

      // Should have removed the previous keydown listener before adding new one
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      expect(editor.getListeningAction()).toBe('playback.stepForward');

      removeSpy.mockRestore();
    });
  });
});
