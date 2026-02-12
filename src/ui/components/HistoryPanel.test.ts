/**
 * HistoryPanel Component Tests
 *
 * Tests for the history panel showing undo/redo entries.
 * Uses a real HistoryManager (not mocked) since it is lightweight.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HistoryPanel } from './HistoryPanel';
import { HistoryManager } from '../../utils/HistoryManager';
import { getThemeManager } from '../../utils/ui/ThemeManager';

describe('HistoryPanel', () => {
  let panel: HistoryPanel;
  let historyManager: HistoryManager;

  beforeEach(() => {
    historyManager = new HistoryManager();
    panel = new HistoryPanel(historyManager);
    // Attach to the document so container.remove() has an effect
    document.body.appendChild(panel.getElement());
  });

  afterEach(() => {
    // Clean up DOM in case dispose was not called during the test
    panel.getElement().remove();
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------
  describe('constructor', () => {
    it('HP-001: creates container element with data-testid "history-panel"', () => {
      const el = panel.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.dataset.testid).toBe('history-panel');
    });

    it('HP-002: subscribes to historyManager events (historyChanged, currentIndexChanged)', () => {
      // After construction the panel should react to historyManager events.
      // Record an action and verify the panel re-renders with the new entry.
      panel.show();
      expect(panel.getElement().textContent).toContain('No history yet');

      historyManager.recordAction('Subscribed action', 'color', () => {});

      // The panel should have re-rendered automatically via the subscription
      expect(panel.getElement().textContent).toContain('Subscribed action');
    });
  });

  // ---------------------------------------------------------------------------
  // show / hide / toggle / isVisible
  // ---------------------------------------------------------------------------
  describe('show/hide/toggle', () => {
    it('HP-010: show() sets container display to flex', () => {
      panel.show();
      expect(panel.getElement().style.display).toBe('flex');
    });

    it('HP-011: show() emits visibilityChanged with true', () => {
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);

      panel.show();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('HP-012: hide() sets container display to none and emits visibilityChanged false', () => {
      panel.show();

      const callback = vi.fn();
      panel.on('visibilityChanged', callback);

      panel.hide();

      expect(panel.getElement().style.display).toBe('none');
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('HP-013: toggle() shows a hidden panel', () => {
      expect(panel.isVisible()).toBe(false);

      panel.toggle();

      expect(panel.isVisible()).toBe(true);
      expect(panel.getElement().style.display).toBe('flex');
    });

    it('HP-014: toggle() hides a visible panel', () => {
      panel.show();
      expect(panel.isVisible()).toBe(true);

      panel.toggle();

      expect(panel.isVisible()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('HP-015: isVisible() returns correct state after show and hide', () => {
      expect(panel.isVisible()).toBe(false);

      panel.show();
      expect(panel.isVisible()).toBe(true);

      panel.hide();
      expect(panel.isVisible()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------
  describe('dispose', () => {
    it('HP-020: dispose() calls all unsubscribers (historyChanged and currentIndexChanged handlers are disconnected)', () => {
      panel.show();

      // Record an action so the panel has rendered content
      historyManager.recordAction('Before dispose', 'color', () => {});
      expect(panel.getElement().textContent).toContain('Before dispose');

      panel.dispose();

      // Capture the current innerHTML to compare after a new action
      const htmlAfterDispose = panel.getElement().innerHTML;

      // Recording another action should NOT trigger re-render because the
      // event subscriptions have been removed
      historyManager.recordAction('After dispose', 'paint', () => {});

      expect(panel.getElement().innerHTML).toBe(htmlAfterDispose);
      expect(panel.getElement().textContent).not.toContain('After dispose');
    });

    it('HP-021: after dispose, historyManager events no longer trigger panel re-render', () => {
      panel.show();
      panel.dispose();

      const htmlBeforeAction = panel.getElement().innerHTML;

      historyManager.recordAction('Should not appear', 'view', () => {});
      historyManager.recordAction('Also invisible', 'session', () => {});

      expect(panel.getElement().innerHTML).toBe(htmlBeforeAction);
    });

    it('HP-022: dispose() removes container from DOM', () => {
      const el = panel.getElement();
      expect(document.body.contains(el)).toBe(true);

      panel.dispose();

      expect(document.body.contains(el)).toBe(false);
    });

    it('HP-023: dispose() empties unsubscribers array', () => {
      // We cannot inspect the private array directly, but we can verify the
      // effect: after dispose, recording actions should not re-render.
      // Additionally, calling dispose a second time should not throw.
      panel.dispose();

      // If unsubscribers were not emptied, a second dispose would attempt to
      // call already-called unsubscribe functions. This should be safe.
      expect(() => panel.dispose()).not.toThrow();
    });

    it('HP-024: dispose() is idempotent', () => {
      panel.dispose();
      // Second call should not throw or produce side effects
      expect(() => panel.dispose()).not.toThrow();
      // Third call for good measure
      expect(() => panel.dispose()).not.toThrow();
    });

    it('HP-025: after dispose, currentIndexChanged from jumpTo does not re-render', () => {
      historyManager.recordAction('Action 1', 'color', () => {});
      historyManager.recordAction('Action 2', 'paint', () => {});
      panel.show();

      panel.dispose();

      const htmlAfterDispose = panel.getElement().innerHTML;

      historyManager.jumpTo(0);

      expect(panel.getElement().innerHTML).toBe(htmlAfterDispose);
    });
  });

  // ---------------------------------------------------------------------------
  // getState
  // ---------------------------------------------------------------------------
  describe('getState', () => {
    it('HP-030: returns correct visible state and history info', () => {
      // Initially hidden, no entries
      let state = panel.getState();
      expect(state.visible).toBe(false);
      expect(state.entryCount).toBe(0);
      expect(state.currentIndex).toBe(-1);

      // Show the panel
      panel.show();
      state = panel.getState();
      expect(state.visible).toBe(true);

      // Record some actions
      historyManager.recordAction('Action A', 'color', () => {});
      historyManager.recordAction('Action B', 'paint', () => {});
      state = panel.getState();
      expect(state.entryCount).toBe(2);
      expect(state.currentIndex).toBe(1);

      // Jump back
      historyManager.jumpTo(0);
      state = panel.getState();
      expect(state.currentIndex).toBe(0);
      expect(state.entryCount).toBe(2);

      // Hide the panel
      panel.hide();
      state = panel.getState();
      expect(state.visible).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // clearHistory
  // ---------------------------------------------------------------------------
  describe('clearHistory', () => {
    it('HP-035: delegates to historyManager.clear()', () => {
      historyManager.recordAction('Action 1', 'color', () => {});
      historyManager.recordAction('Action 2', 'paint', () => {});
      expect(panel.getState().entryCount).toBe(2);

      const clearSpy = vi.spyOn(historyManager, 'clear');

      panel.clearHistory();

      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(panel.getState().entryCount).toBe(0);
      expect(panel.getState().currentIndex).toBe(-1);
    });
  });

  // ---------------------------------------------------------------------------
  // theme changes
  // ---------------------------------------------------------------------------
  describe('theme changes', () => {
    it('HP-040: re-renders entries when theme changes', () => {
      panel.show();
      historyManager.recordAction('Theme test action', 'color', () => {});

      const entriesEl = panel.getElement().querySelector('.history-entries')!;
      // Grab a reference to the first child node before theme change
      const oldChild = entriesEl.firstElementChild!;
      expect(oldChild).toBeTruthy();

      getThemeManager().emit('themeChanged', 'light');

      // render() clears innerHTML and rebuilds — the old child is now detached
      expect(entriesEl.contains(oldChild)).toBe(false);
      // But the content is re-created with the same data
      expect(entriesEl.textContent).toContain('Theme test action');
    });

    it('HP-041: uses CSS variables instead of hardcoded colors for container', () => {
      const style = panel.getElement().style.cssText;
      expect(style).toContain('var(--bg-secondary)');
      expect(style).toContain('var(--border-primary)');
      expect(style).not.toContain('rgba(30, 30, 30');
      expect(style).not.toContain('rgba(255, 255, 255, 0.1)');
    });

    it('HP-042: uses CSS variables for header background and border', () => {
      const header = panel.getElement().querySelector('.history-panel-header') as HTMLElement;
      expect(header.style.cssText).toContain('var(--bg-tertiary)');
      expect(header.style.cssText).toContain('var(--border-primary)');
      expect(header.style.cssText).not.toContain('rgba(40, 40, 40');
    });

    it('HP-043: does not re-render on theme change after dispose', () => {
      panel.show();
      historyManager.recordAction('Action before dispose', 'color', () => {});
      panel.dispose();

      const htmlAfterDispose = panel.getElement().innerHTML;

      getThemeManager().emit('themeChanged', 'light');

      expect(panel.getElement().innerHTML).toBe(htmlAfterDispose);
    });

    it('HP-044: dispose unsubscribes theme listener (no re-render on subsequent theme changes)', () => {
      panel.show();
      historyManager.recordAction('Persistent action', 'paint', () => {});
      panel.dispose();

      const htmlAfterDispose = panel.getElement().innerHTML;

      // Multiple theme changes should have no effect
      getThemeManager().emit('themeChanged', 'dark');
      getThemeManager().emit('themeChanged', 'light');

      expect(panel.getElement().innerHTML).toBe(htmlAfterDispose);
    });
  });
});
