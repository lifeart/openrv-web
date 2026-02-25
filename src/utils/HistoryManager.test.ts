/**
 * HistoryManager Tests
 *
 * Tests for the centralized undo/redo history tracking system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HistoryManager,
  getGlobalHistoryManager,
  resetGlobalHistoryManager,
} from './HistoryManager';

describe('HistoryManager', () => {
  let manager: HistoryManager;

  beforeEach(() => {
    manager = new HistoryManager();
  });

  describe('initialization', () => {
    it('HM-U001: creates HistoryManager instance', () => {
      expect(manager).toBeInstanceOf(HistoryManager);
    });

    it('HM-U002: initial state has no entries', () => {
      const state = manager.getState();
      expect(state.entries.length).toBe(0);
    });

    it('HM-U003: initial currentIndex is -1', () => {
      expect(manager.getCurrentIndex()).toBe(-1);
    });

    it('HM-U004: initial canUndo is false', () => {
      expect(manager.canUndo()).toBe(false);
    });

    it('HM-U005: initial canRedo is false', () => {
      expect(manager.canRedo()).toBe(false);
    });
  });

  describe('recordAction', () => {
    it('HM-U010: recordAction adds entry to history', () => {
      manager.recordAction('Test action', 'color', () => {});
      expect(manager.getEntries().length).toBe(1);
    });

    it('HM-U011: recordAction returns the created entry', () => {
      const entry = manager.recordAction('Test action', 'color', () => {});
      expect(entry.description).toBe('Test action');
      expect(entry.category).toBe('color');
    });

    it('HM-U012: recordAction increments currentIndex', () => {
      manager.recordAction('Test 1', 'color', () => {});
      expect(manager.getCurrentIndex()).toBe(0);

      manager.recordAction('Test 2', 'color', () => {});
      expect(manager.getCurrentIndex()).toBe(1);
    });

    it('HM-U013: recordAction assigns unique ids', () => {
      const e1 = manager.recordAction('Test 1', 'color', () => {});
      const e2 = manager.recordAction('Test 2', 'color', () => {});
      expect(e1.id).not.toBe(e2.id);
    });

    it('HM-U014: recordAction sets timestamp', () => {
      const before = Date.now();
      const entry = manager.recordAction('Test', 'color', () => {});
      const after = Date.now();

      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });

    it('HM-U015: recordAction stores restore function', () => {
      const restore = vi.fn();
      const entry = manager.recordAction('Test', 'color', restore);
      expect(entry.restore).toBe(restore);
    });

    it('HM-U016: recordAction stores optional redo function', () => {
      const restore = vi.fn();
      const redo = vi.fn();
      const entry = manager.recordAction('Test', 'color', restore, redo);
      expect(entry.redo).toBe(redo);
    });

    it('HM-U017: recordAction emits historyChanged event', () => {
      const callback = vi.fn();
      manager.on('historyChanged', callback);

      manager.recordAction('Test', 'color', () => {});

      expect(callback).toHaveBeenCalled();
    });

    it('HM-U018: recordAction emits currentIndexChanged event', () => {
      const callback = vi.fn();
      manager.on('currentIndexChanged', callback);

      manager.recordAction('Test', 'color', () => {});

      expect(callback).toHaveBeenCalledWith(0);
    });
  });

  describe('undo', () => {
    it('HM-U020: undo returns false when nothing to undo', () => {
      expect(manager.undo()).toBe(false);
    });

    it('HM-U021: undo returns true when successful', () => {
      manager.recordAction('Test', 'color', () => {});
      expect(manager.undo()).toBe(true);
    });

    it('HM-U022: undo calls restore function of current entry', () => {
      const restore = vi.fn();
      manager.recordAction('Test', 'color', restore);

      manager.undo();

      expect(restore).toHaveBeenCalled();
    });

    it('HM-U023: undo decrements currentIndex', () => {
      manager.recordAction('Test', 'color', () => {});
      expect(manager.getCurrentIndex()).toBe(0);

      manager.undo();
      expect(manager.getCurrentIndex()).toBe(-1);
    });

    it('HM-U024: undo emits currentIndexChanged event', () => {
      manager.recordAction('Test', 'color', () => {});

      const callback = vi.fn();
      manager.on('currentIndexChanged', callback);

      manager.undo();

      expect(callback).toHaveBeenCalledWith(-1);
    });

    it('HM-U025: multiple undos work correctly', () => {
      const restore1 = vi.fn();
      const restore2 = vi.fn();
      manager.recordAction('Test 1', 'color', restore1);
      manager.recordAction('Test 2', 'color', restore2);

      manager.undo();
      expect(restore2).toHaveBeenCalled();
      expect(manager.getCurrentIndex()).toBe(0);

      manager.undo();
      expect(restore1).toHaveBeenCalled();
      expect(manager.getCurrentIndex()).toBe(-1);
    });
  });

  describe('redo', () => {
    it('HM-U030: redo returns false when nothing to redo', () => {
      expect(manager.redo()).toBe(false);
    });

    it('HM-U031: redo returns false when at end of history', () => {
      manager.recordAction('Test', 'color', () => {});
      expect(manager.redo()).toBe(false);
    });

    it('HM-U032: redo returns true after undo', () => {
      manager.recordAction('Test', 'color', () => {});
      manager.undo();
      expect(manager.redo()).toBe(true);
    });

    it('HM-U033: redo calls redo function if available', () => {
      const restore = vi.fn();
      const redo = vi.fn();
      manager.recordAction('Test', 'color', restore, redo);
      manager.undo();

      manager.redo();

      expect(redo).toHaveBeenCalled();
    });

    it('HM-U034: redo without redo function does NOT call restore (restore is undo)', () => {
      const restore = vi.fn();
      manager.recordAction('Test', 'color', restore);
      manager.undo();
      restore.mockClear(); // Clear the call from undo

      manager.redo();

      // restore is the undo callback — it should NOT be called as a redo fallback
      expect(restore).not.toHaveBeenCalled();
      // But redo should still succeed (advance the index)
      expect(manager.getCurrentIndex()).toBe(0);
    });

    it('HM-U035: redo increments currentIndex', () => {
      manager.recordAction('Test', 'color', () => {});
      manager.undo();
      expect(manager.getCurrentIndex()).toBe(-1);

      manager.redo();
      expect(manager.getCurrentIndex()).toBe(0);
    });

    it('HM-U036: redo emits currentIndexChanged event', () => {
      manager.recordAction('Test', 'color', () => {});
      manager.undo();

      const callback = vi.fn();
      manager.on('currentIndexChanged', callback);

      manager.redo();

      expect(callback).toHaveBeenCalledWith(0);
    });
  });

  describe('jumpTo', () => {
    it('HM-U040: jumpTo returns false for invalid index', () => {
      expect(manager.jumpTo(-2)).toBe(false);
      expect(manager.jumpTo(0)).toBe(false); // No entries
    });

    it('HM-U041: jumpTo returns true for valid index', () => {
      manager.recordAction('Test 1', 'color', () => {});
      manager.recordAction('Test 2', 'color', () => {});

      expect(manager.jumpTo(0)).toBe(true);
    });

    it('HM-U042: jumpTo sets currentIndex', () => {
      manager.recordAction('Test 1', 'color', () => {});
      manager.recordAction('Test 2', 'color', () => {});
      manager.recordAction('Test 3', 'color', () => {});

      manager.jumpTo(1);

      expect(manager.getCurrentIndex()).toBe(1);
    });

    it('HM-U043: jumpTo backwards calls restore functions', () => {
      const restore1 = vi.fn();
      const restore2 = vi.fn();
      const restore3 = vi.fn();
      manager.recordAction('Test 1', 'color', restore1);
      manager.recordAction('Test 2', 'color', restore2);
      manager.recordAction('Test 3', 'color', restore3);

      manager.jumpTo(0);

      expect(restore3).toHaveBeenCalled();
      expect(restore2).toHaveBeenCalled();
      expect(restore1).not.toHaveBeenCalled();
    });

    it('HM-U044: jumpTo forwards calls redo functions', () => {
      const restore1 = vi.fn();
      const redo1 = vi.fn();
      const restore2 = vi.fn();
      const redo2 = vi.fn();
      manager.recordAction('Test 1', 'color', restore1, redo1);
      manager.recordAction('Test 2', 'color', restore2, redo2);
      manager.jumpTo(-1); // Go to initial state

      manager.jumpTo(1);

      expect(redo1).toHaveBeenCalled();
      expect(redo2).toHaveBeenCalled();
    });

    it('HM-U045: jumpTo to same index does not call restore/redo', () => {
      const restore = vi.fn();
      const redo = vi.fn();
      manager.recordAction('Test', 'color', restore, redo);

      manager.jumpTo(0); // Jump to current index

      expect(restore).not.toHaveBeenCalled();
      expect(redo).not.toHaveBeenCalled();
      expect(manager.getCurrentIndex()).toBe(0);
    });

    it('HM-U046: jumpTo allows jumping to -1 (initial state)', () => {
      manager.recordAction('Test', 'color', () => {});

      expect(manager.jumpTo(-1)).toBe(true);
      expect(manager.getCurrentIndex()).toBe(-1);
    });

    it('HM-U047: jumpTo emits currentIndexChanged event', () => {
      manager.recordAction('Test 1', 'color', () => {});
      manager.recordAction('Test 2', 'color', () => {});

      const callback = vi.fn();
      manager.on('currentIndexChanged', callback);

      manager.jumpTo(0);

      expect(callback).toHaveBeenCalledWith(0);
    });
  });

  describe('canUndo/canRedo', () => {
    it('HM-U050: canUndo is true after recording action', () => {
      manager.recordAction('Test', 'color', () => {});
      expect(manager.canUndo()).toBe(true);
    });

    it('HM-U051: canUndo is false at initial state', () => {
      manager.recordAction('Test', 'color', () => {});
      manager.undo();
      expect(manager.canUndo()).toBe(false);
    });

    it('HM-U052: canRedo is false at end of history', () => {
      manager.recordAction('Test', 'color', () => {});
      expect(manager.canRedo()).toBe(false);
    });

    it('HM-U053: canRedo is true after undo', () => {
      manager.recordAction('Test', 'color', () => {});
      manager.undo();
      expect(manager.canRedo()).toBe(true);
    });
  });

  describe('history truncation on record', () => {
    it('HM-U060: recording after undo removes future entries', () => {
      manager.recordAction('Test 1', 'color', () => {});
      manager.recordAction('Test 2', 'color', () => {});
      manager.recordAction('Test 3', 'color', () => {});
      manager.undo();
      manager.undo(); // Now at index 0

      manager.recordAction('New action', 'color', () => {});

      expect(manager.getEntries().length).toBe(2);
      expect(manager.getEntries()[1]!.description).toBe('New action');
    });

    it('HM-U061: cannot redo after recording new action', () => {
      manager.recordAction('Test 1', 'color', () => {});
      manager.recordAction('Test 2', 'color', () => {});
      manager.undo();

      manager.recordAction('New action', 'color', () => {});

      expect(manager.canRedo()).toBe(false);
    });
  });

  describe('max history length', () => {
    it('HM-U070: respects custom max length', () => {
      const smallManager = new HistoryManager(3);

      smallManager.recordAction('Test 1', 'color', () => {});
      smallManager.recordAction('Test 2', 'color', () => {});
      smallManager.recordAction('Test 3', 'color', () => {});
      smallManager.recordAction('Test 4', 'color', () => {});

      expect(smallManager.getEntries().length).toBe(3);
    });

    it('HM-U071: removes oldest entries when exceeding max', () => {
      const smallManager = new HistoryManager(3);

      smallManager.recordAction('Test 1', 'color', () => {});
      smallManager.recordAction('Test 2', 'color', () => {});
      smallManager.recordAction('Test 3', 'color', () => {});
      smallManager.recordAction('Test 4', 'color', () => {});

      const entries = smallManager.getEntries();
      expect(entries[0]!.description).toBe('Test 2');
      expect(entries[2]!.description).toBe('Test 4');
    });

    it('HM-U072: adjusts currentIndex when trimming', () => {
      const smallManager = new HistoryManager(3);

      smallManager.recordAction('Test 1', 'color', () => {});
      smallManager.recordAction('Test 2', 'color', () => {});
      smallManager.recordAction('Test 3', 'color', () => {});
      smallManager.recordAction('Test 4', 'color', () => {});

      // currentIndex should be 2 (last entry in trimmed array)
      expect(smallManager.getCurrentIndex()).toBe(2);
    });
  });

  describe('clear', () => {
    it('HM-U080: clear removes all entries', () => {
      manager.recordAction('Test 1', 'color', () => {});
      manager.recordAction('Test 2', 'color', () => {});

      manager.clear();

      expect(manager.getEntries().length).toBe(0);
    });

    it('HM-U081: clear resets currentIndex to -1', () => {
      manager.recordAction('Test', 'color', () => {});

      manager.clear();

      expect(manager.getCurrentIndex()).toBe(-1);
    });

    it('HM-U082: clear emits historyChanged event', () => {
      manager.recordAction('Test', 'color', () => {});

      const callback = vi.fn();
      manager.on('historyChanged', callback);

      manager.clear();

      expect(callback).toHaveBeenCalledWith([]);
    });

    it('HM-U083: clear emits currentIndexChanged event', () => {
      manager.recordAction('Test', 'color', () => {});

      const callback = vi.fn();
      manager.on('currentIndexChanged', callback);

      manager.clear();

      expect(callback).toHaveBeenCalledWith(-1);
    });
  });

  describe('getState', () => {
    it('HM-U090: getState returns current state', () => {
      manager.recordAction('Test', 'color', () => {});

      const state = manager.getState();

      expect(state.entries.length).toBe(1);
      expect(state.currentIndex).toBe(0);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
    });

    it('HM-U091: getState returns copy of entries', () => {
      manager.recordAction('Test', 'color', () => {});

      const state1 = manager.getState();
      const state2 = manager.getState();

      expect(state1.entries).toEqual(state2.entries);
      expect(state1.entries).not.toBe(state2.entries);
    });
  });

  describe('getEntries', () => {
    it('HM-U100: getEntries returns copy of entries array', () => {
      manager.recordAction('Test', 'color', () => {});

      const entries1 = manager.getEntries();
      const entries2 = manager.getEntries();

      expect(entries1).toEqual(entries2);
      expect(entries1).not.toBe(entries2);
    });
  });

  describe('formatTimeSince static', () => {
    it('HM-U110: formats recent time as just now', () => {
      const recent = Date.now() - 2000; // 2 seconds ago
      expect(HistoryManager.formatTimeSince(recent)).toBe('just now');
    });

    it('HM-U111: formats seconds ago', () => {
      const time = Date.now() - 30000; // 30 seconds ago
      expect(HistoryManager.formatTimeSince(time)).toBe('30s ago');
    });

    it('HM-U112: formats minutes ago', () => {
      const time = Date.now() - 120000; // 2 minutes ago
      expect(HistoryManager.formatTimeSince(time)).toBe('2m ago');
    });

    it('HM-U113: formats hours ago', () => {
      const time = Date.now() - 7200000; // 2 hours ago
      expect(HistoryManager.formatTimeSince(time)).toBe('2h ago');
    });

    it('HM-U114: formats days ago', () => {
      const time = Date.now() - 172800000; // 2 days ago
      expect(HistoryManager.formatTimeSince(time)).toBe('2d ago');
    });
  });

  describe('getCategoryIcon static', () => {
    it('HM-U120: returns SVG for color category', () => {
      const icon = HistoryManager.getCategoryIcon('color');
      expect(icon).toContain('<svg');
    });

    it('HM-U121: returns SVG for paint category', () => {
      const icon = HistoryManager.getCategoryIcon('paint');
      expect(icon).toContain('<svg');
    });

    it('HM-U122: returns SVG for transform category', () => {
      const icon = HistoryManager.getCategoryIcon('transform');
      expect(icon).toContain('<svg');
    });

    it('HM-U123: returns SVG for view category', () => {
      const icon = HistoryManager.getCategoryIcon('view');
      expect(icon).toContain('<svg');
    });

    it('HM-U124: returns SVG for session category', () => {
      const icon = HistoryManager.getCategoryIcon('session');
      expect(icon).toContain('<svg');
    });
  });

  describe('categories', () => {
    const categories = ['color', 'paint', 'transform', 'view', 'session'] as const;

    categories.forEach((category) => {
      it(`HM-U130-${category}: ${category} category can be recorded`, () => {
        manager.recordAction(`${category} action`, category, () => {});
        const entry = manager.getEntries()[0]!;
        expect(entry.category).toBe(category);
      });
    });
  });

  describe('getGlobalHistoryManager', () => {
    afterEach(() => {
      resetGlobalHistoryManager();
    });

    it('HM-U140: returns HistoryManager instance', () => {
      const globalManager = getGlobalHistoryManager();
      expect(globalManager).toBeInstanceOf(HistoryManager);
    });

    it('HM-U141: returns same instance on multiple calls', () => {
      const manager1 = getGlobalHistoryManager();
      const manager2 = getGlobalHistoryManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe('resetGlobalHistoryManager', () => {
    afterEach(() => {
      resetGlobalHistoryManager();
    });

    it('HM-U142: creates fresh instance after reset', () => {
      const mgr1 = getGlobalHistoryManager();
      mgr1.recordAction('test action', 'session', () => {});
      expect(mgr1.getEntries().length).toBe(1);

      resetGlobalHistoryManager();

      const mgr2 = getGlobalHistoryManager();
      expect(mgr2).not.toBe(mgr1);
      expect(mgr2.getEntries().length).toBe(0);
    });

    it('HM-U143: is safe to call when no singleton exists', () => {
      resetGlobalHistoryManager();
      expect(() => resetGlobalHistoryManager()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('HM-U150: undo does not throw when entry has no restore', () => {
      // Create entry with undefined restore (edge case)
      manager.recordAction('Test', 'color', undefined as any);

      expect(() => manager.undo()).not.toThrow();
      expect(manager.getCurrentIndex()).toBe(-1);
    });

    it('HM-U151: redo without redo function and without restore does not throw', () => {
      manager.recordAction('Test', 'color', undefined as any, undefined);
      manager.undo();

      expect(() => manager.redo()).not.toThrow();
    });

    it('HM-U152: jumpTo backwards with missing restore functions', () => {
      manager.recordAction('Test 1', 'color', undefined as any);
      manager.recordAction('Test 2', 'color', undefined as any);

      expect(() => manager.jumpTo(0)).not.toThrow();
    });

    it('HM-U153: multiple rapid undo/redo cycles maintain correct state', () => {
      const values: number[] = [];
      manager.recordAction('Set 1', 'color', () => values.push(1));
      manager.recordAction('Set 2', 'color', () => values.push(2));
      manager.recordAction('Set 3', 'color', () => values.push(3));

      // Rapid undo/redo
      manager.undo();
      manager.undo();
      manager.redo();
      manager.undo();

      expect(manager.getCurrentIndex()).toBe(0);
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(true);
    });

    it('HM-U154: recording action at index 0 with future entries truncates correctly', () => {
      manager.recordAction('Test 1', 'color', () => {});
      manager.recordAction('Test 2', 'color', () => {});
      manager.recordAction('Test 3', 'color', () => {});
      manager.jumpTo(0);

      manager.recordAction('New', 'color', () => {});

      expect(manager.getEntries().length).toBe(2);
      expect(manager.getEntries()[0]!.description).toBe('Test 1');
      expect(manager.getEntries()[1]!.description).toBe('New');
    });

    it('HM-U155: jumpTo from -1 to middle index calls correct entries', () => {
      const redo1 = vi.fn();
      const redo2 = vi.fn();
      const redo3 = vi.fn();
      manager.recordAction('Test 1', 'color', () => {}, redo1);
      manager.recordAction('Test 2', 'color', () => {}, redo2);
      manager.recordAction('Test 3', 'color', () => {}, redo3);
      manager.jumpTo(-1);

      manager.jumpTo(1); // Jump to middle

      expect(redo1).toHaveBeenCalled();
      expect(redo2).toHaveBeenCalled();
      expect(redo3).not.toHaveBeenCalled();
    });

    it('HM-U156: undo at currentIndex 0 goes to -1', () => {
      manager.recordAction('Test', 'color', () => {});
      expect(manager.getCurrentIndex()).toBe(0);

      manager.undo();

      expect(manager.getCurrentIndex()).toBe(-1);
      expect(manager.canUndo()).toBe(false);
    });
  });

  describe('getCategoryLabel deprecated', () => {
    it('HM-U160: getCategoryLabel returns same as getCategoryIcon', () => {
      const categories = ['color', 'paint', 'transform', 'view', 'session'] as const;
      for (const cat of categories) {
        expect(HistoryManager.getCategoryLabel(cat)).toBe(
          HistoryManager.getCategoryIcon(cat)
        );
      }
    });
  });

  describe('redo/jumpTo semantics (regression)', () => {
    it('HM-R001: redo with explicit redo callback produces correct value', () => {
      let value = 0;

      value = 1;
      manager.recordAction('set to 1', 'session', () => { value = 0; }, () => { value = 1; });

      value = 2;
      manager.recordAction('set to 2', 'session', () => { value = 1; }, () => { value = 2; });

      manager.undo();
      expect(value).toBe(1);

      manager.redo();
      expect(value).toBe(2);
    });

    it('HM-R002: jumpTo forward calls redo callbacks, not restore', () => {
      let value = 0;

      value = 1;
      manager.recordAction('set to 1', 'session', () => { value = 0; }, () => { value = 1; });

      value = 2;
      manager.recordAction('set to 2', 'session', () => { value = 1; }, () => { value = 2; });

      manager.undo();
      manager.undo();
      expect(value).toBe(0);

      manager.jumpTo(1);
      expect(value).toBe(2);
    });

    it('HM-R003: redo without redo callback does not call restore', () => {
      let value = 0;

      value = 1;
      manager.recordAction('set to 1', 'session', () => { value = 0; });

      manager.undo();
      expect(value).toBe(0);

      const result = manager.redo();
      expect(result).toBe(true);
      // restore should NOT have been called again — value stays at 0
      expect(value).toBe(0);
      expect(manager.getCurrentIndex()).toBe(0);
    });
  });
});
