/**
 * HistoryPanel Component Tests
 *
 * Tests for the history panel showing undo/redo entries.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoryPanel } from './HistoryPanel';
import { HistoryManager } from '../../utils/HistoryManager';

describe('HistoryPanel', () => {
  let panel: HistoryPanel;
  let historyManager: HistoryManager;

  beforeEach(() => {
    historyManager = new HistoryManager();
    panel = new HistoryPanel(historyManager);
  });

  describe('initialization', () => {
    it('HIST-U001: creates HistoryPanel instance', () => {
      expect(panel).toBeInstanceOf(HistoryPanel);
    });

    it('HIST-U002: panel is hidden by default', () => {
      expect(panel.isVisible()).toBe(false);
    });
  });

  describe('getElement', () => {
    it('HIST-U010: getElement returns container element', () => {
      const el = panel.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
    });

    it('HIST-U011: container has data-testid', () => {
      const el = panel.getElement();
      expect(el.dataset.testid).toBe('history-panel');
    });

    it('HIST-U012: container has history-panel class', () => {
      const el = panel.getElement();
      expect(el.className).toBe('history-panel');
    });

    it('HIST-U013: container is hidden by default', () => {
      const el = panel.getElement();
      expect(el.style.display).toBe('none');
    });
  });

  describe('show/hide', () => {
    it('HIST-U020: show makes panel visible', () => {
      panel.show();
      expect(panel.isVisible()).toBe(true);
      expect(panel.getElement().style.display).toBe('flex');
    });

    it('HIST-U021: hide makes panel invisible', () => {
      panel.show();
      panel.hide();
      expect(panel.isVisible()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('HIST-U022: toggle shows hidden panel', () => {
      panel.toggle();
      expect(panel.isVisible()).toBe(true);
    });

    it('HIST-U023: toggle hides visible panel', () => {
      panel.show();
      panel.toggle();
      expect(panel.isVisible()).toBe(false);
    });

    it('HIST-U024: show emits visibilityChanged event', () => {
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);

      panel.show();

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('HIST-U025: hide emits visibilityChanged event', () => {
      panel.show();
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);

      panel.hide();

      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('header', () => {
    it('HIST-U030: has header with title', () => {
      const el = panel.getElement();
      expect(el.textContent).toContain('History');
    });

    it('HIST-U031: has clear button', () => {
      const el = panel.getElement();
      const clearBtn = el.querySelector('[data-testid="history-clear-btn"]');
      expect(clearBtn).not.toBeNull();
    });

    it('HIST-U032: has close button', () => {
      const el = panel.getElement();
      const buttons = el.querySelectorAll('button');
      const closeBtn = Array.from(buttons).find(btn => btn.textContent === '×');
      expect(closeBtn).not.toBeNull();
    });

    it('HIST-U033: close button hides panel', () => {
      panel.show();
      const el = panel.getElement();
      const buttons = el.querySelectorAll('button');
      const closeBtn = Array.from(buttons).find(btn => btn.textContent === '×') as HTMLButtonElement;

      closeBtn.click();

      expect(panel.isVisible()).toBe(false);
    });
  });

  describe('entries container', () => {
    it('HIST-U040: has entries container', () => {
      const el = panel.getElement();
      const entries = el.querySelector('[data-testid="history-entries"]');
      expect(entries).not.toBeNull();
    });

    it('HIST-U041: shows empty message when no history', () => {
      panel.show();
      const el = panel.getElement();
      expect(el.textContent).toContain('No history yet');
    });
  });

  describe('history entries', () => {
    it('HIST-U050: displays history entry after recording', () => {
      historyManager.recordAction('Test action', 'color', () => {});
      panel.show();

      const el = panel.getElement();
      expect(el.textContent).toContain('Test action');
    });

    it('HIST-U051: displays multiple entries', () => {
      historyManager.recordAction('Action 1', 'color', () => {});
      historyManager.recordAction('Action 2', 'paint', () => {});
      historyManager.recordAction('Action 3', 'transform', () => {});
      panel.show();

      const el = panel.getElement();
      expect(el.textContent).toContain('Action 1');
      expect(el.textContent).toContain('Action 2');
      expect(el.textContent).toContain('Action 3');
    });

    it('HIST-U052: entry elements have data-testid', () => {
      historyManager.recordAction('Test', 'color', () => {});
      panel.show();

      const el = panel.getElement();
      const entry = el.querySelector('[data-testid="history-entry-0"]');
      expect(entry).not.toBeNull();
    });

    it('HIST-U053: clicking entry calls historyManager.jumpTo', () => {
      const restore1 = vi.fn();
      const restore2 = vi.fn();
      historyManager.recordAction('Action 1', 'color', restore1);
      historyManager.recordAction('Action 2', 'paint', restore2);
      panel.show();

      const el = panel.getElement();
      const entry = el.querySelector('[data-testid="history-entry-0"]') as HTMLElement;
      entry.click();

      // After clicking entry 0, current index should be 0
      const state = panel.getState();
      expect(state.currentIndex).toBe(0);
    });

    it('HIST-U054: clicking entry emits entrySelected event', () => {
      historyManager.recordAction('Action', 'color', () => {});
      panel.show();

      const callback = vi.fn();
      panel.on('entrySelected', callback);

      const el = panel.getElement();
      const entry = el.querySelector('[data-testid="history-entry-0"]') as HTMLElement;
      entry.click();

      expect(callback).toHaveBeenCalledWith(0);
    });
  });

  describe('clear history', () => {
    it('HIST-U060: clear button clears history', () => {
      historyManager.recordAction('Action', 'color', () => {});
      panel.show();

      const el = panel.getElement();
      const clearBtn = el.querySelector('[data-testid="history-clear-btn"]') as HTMLButtonElement;
      clearBtn.click();

      expect(panel.getState().entryCount).toBe(0);
    });

    it('HIST-U061: clearHistory method clears history', () => {
      historyManager.recordAction('Action', 'color', () => {});

      panel.clearHistory();

      expect(panel.getState().entryCount).toBe(0);
    });
  });

  describe('getState', () => {
    it('HIST-U070: getState returns visibility', () => {
      panel.show();
      const state = panel.getState();
      expect(state.visible).toBe(true);
    });

    it('HIST-U071: getState returns entry count', () => {
      historyManager.recordAction('A1', 'color', () => {});
      historyManager.recordAction('A2', 'color', () => {});
      const state = panel.getState();
      expect(state.entryCount).toBe(2);
    });

    it('HIST-U072: getState returns current index', () => {
      historyManager.recordAction('Action', 'color', () => {});
      const state = panel.getState();
      expect(state.currentIndex).toBe(0);
    });
  });

  describe('entry hover effects', () => {
    it('HIST-U080: entry changes on mouseenter', () => {
      historyManager.recordAction('Action 1', 'color', () => {});
      historyManager.recordAction('Action 2', 'paint', () => {});
      panel.show();

      const el = panel.getElement();
      // Entry 0 is not current (entry 1 is), so it should change on hover
      const entry = el.querySelector('[data-testid="history-entry-0"]') as HTMLElement;
      entry.dispatchEvent(new MouseEvent('mouseenter'));

      expect(entry.style.cssText).toContain('rgba(255, 255, 255, 0.05)');
    });

    it('HIST-U081: entry restores on mouseleave', () => {
      historyManager.recordAction('Action 1', 'color', () => {});
      historyManager.recordAction('Action 2', 'paint', () => {});
      panel.show();

      const el = panel.getElement();
      const entry = el.querySelector('[data-testid="history-entry-0"]') as HTMLElement;
      entry.dispatchEvent(new MouseEvent('mouseenter'));
      entry.dispatchEvent(new MouseEvent('mouseleave'));

      // Should restore to no background
      expect(entry.style.background).toBe('');
    });
  });

  describe('styling', () => {
    it('HIST-U090: panel has absolute positioning', () => {
      const el = panel.getElement();
      expect(el.style.position).toBe('absolute');
    });

    it('HIST-U091: panel has high z-index', () => {
      const el = panel.getElement();
      expect(parseInt(el.style.zIndex, 10)).toBeGreaterThan(100);
    });

    it('HIST-U092: panel has fixed width', () => {
      const el = panel.getElement();
      expect(el.style.width).toBe('280px');
    });

    it('HIST-U093: panel has max-height', () => {
      const el = panel.getElement();
      expect(el.style.maxHeight).toBe('400px');
    });
  });

  describe('history manager events', () => {
    it('HIST-U100: renders when historyChanged event fires', () => {
      panel.show();

      // Initially shows empty message
      expect(panel.getElement().textContent).toContain('No history yet');

      // Add entry - should trigger re-render
      historyManager.recordAction('New action', 'color', () => {});

      // Should now show the action
      expect(panel.getElement().textContent).toContain('New action');
    });

    it('HIST-U101: renders when currentIndexChanged event fires', () => {
      historyManager.recordAction('Action 1', 'color', () => {});
      historyManager.recordAction('Action 2', 'paint', () => {});
      panel.show();

      // Jump to previous entry
      historyManager.jumpTo(0);

      // Current indicator should be at entry 0
      const state = panel.getState();
      expect(state.currentIndex).toBe(0);
    });
  });

  describe('entry categories', () => {
    const categories = ['color', 'paint', 'transform', 'view', 'session'] as const;

    categories.forEach(category => {
      it(`HIST-U110-${category}: ${category} category entry renders`, () => {
        historyManager.recordAction(`${category} action`, category, () => {});
        panel.show();

        const el = panel.getElement();
        expect(el.textContent).toContain(`${category} action`);
      });
    });
  });
});
