/**
 * ViewHistory Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ViewHistory } from './ViewHistory';

describe('ViewHistory', () => {
  let history: ViewHistory;

  beforeEach(() => {
    history = new ViewHistory();
  });

  describe('push', () => {
    it('adds entries to the history', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      expect(history.size).toBe(1);
      expect(history.current()?.nodeId).toBe('a');
    });

    it('does not add duplicate of the current entry', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'a', timestamp: 2 });
      expect(history.size).toBe(1);
    });

    it('allows same nodeId after navigating away', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      history.push({ nodeId: 'a', timestamp: 3 });
      expect(history.size).toBe(3);
    });

    it('truncates forward history when pushing after going back', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      history.push({ nodeId: 'c', timestamp: 3 });

      history.back(); // -> b
      history.back(); // -> a

      history.push({ nodeId: 'd', timestamp: 4 });

      expect(history.size).toBe(2); // [a, d]
      expect(history.canGoForward).toBe(false);
    });

    it('respects maxSize by trimming oldest entries', () => {
      const small = new ViewHistory(3);

      small.push({ nodeId: 'a', timestamp: 1 });
      small.push({ nodeId: 'b', timestamp: 2 });
      small.push({ nodeId: 'c', timestamp: 3 });
      small.push({ nodeId: 'd', timestamp: 4 });

      expect(small.size).toBe(3);
      // Oldest entry 'a' should have been trimmed
      small.back();
      small.back();
      expect(small.current()?.nodeId).toBe('b');
    });
  });

  describe('back', () => {
    it('returns null when history is empty', () => {
      expect(history.back()).toBeNull();
    });

    it('returns null when at the beginning', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      expect(history.back()).toBeNull();
    });

    it('navigates to the previous entry', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });

      const entry = history.back();
      expect(entry?.nodeId).toBe('a');
    });

    it('can navigate multiple steps back', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      history.push({ nodeId: 'c', timestamp: 3 });

      history.back(); // -> b
      const entry = history.back(); // -> a
      expect(entry?.nodeId).toBe('a');
      expect(history.canGoBack).toBe(false);
    });
  });

  describe('forward', () => {
    it('returns null when history is empty', () => {
      expect(history.forward()).toBeNull();
    });

    it('returns null when at the end', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      expect(history.forward()).toBeNull();
    });

    it('navigates to the next entry after going back', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });

      history.back(); // -> a
      const entry = history.forward(); // -> b
      expect(entry?.nodeId).toBe('b');
    });
  });

  describe('canGoBack / canGoForward', () => {
    it('both false when empty', () => {
      expect(history.canGoBack).toBe(false);
      expect(history.canGoForward).toBe(false);
    });

    it('back is false with single entry', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      expect(history.canGoBack).toBe(false);
      expect(history.canGoForward).toBe(false);
    });

    it('back is true, forward is false after two pushes', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      expect(history.canGoBack).toBe(true);
      expect(history.canGoForward).toBe(false);
    });

    it('forward is true after going back', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      history.back();
      expect(history.canGoBack).toBe(false);
      expect(history.canGoForward).toBe(true);
    });
  });

  describe('current', () => {
    it('returns null when empty', () => {
      expect(history.current()).toBeNull();
    });

    it('returns the current entry', () => {
      history.push({ nodeId: 'a', timestamp: 100 });
      const entry = history.current();
      expect(entry).toEqual({ nodeId: 'a', timestamp: 100 });
    });

    it('updates after back/forward', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });

      expect(history.current()?.nodeId).toBe('b');
      history.back();
      expect(history.current()?.nodeId).toBe('a');
      history.forward();
      expect(history.current()?.nodeId).toBe('b');
    });
  });

  describe('clear', () => {
    it('resets the history', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });

      history.clear();

      expect(history.size).toBe(0);
      expect(history.current()).toBeNull();
      expect(history.canGoBack).toBe(false);
      expect(history.canGoForward).toBe(false);
    });
  });

  describe('toJSON / fromJSON', () => {
    it('round-trips correctly', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      history.push({ nodeId: 'c', timestamp: 3 });

      const json = history.toJSON();

      const restored = new ViewHistory();
      restored.fromJSON(json);

      expect(restored.size).toBe(3);
      expect(restored.current()?.nodeId).toBe('c');
      expect(restored.canGoBack).toBe(true);
      expect(restored.canGoForward).toBe(false);
    });

    it('serializes entries without nodeName', () => {
      history.push({ nodeId: 'x', timestamp: 42 });
      const json = history.toJSON();

      expect(json).toHaveLength(1);
      expect(json[0]).toEqual({ nodeId: 'x', timestamp: 42 });
      // Verify no unexpected properties
      expect(Object.keys(json[0]!)).toEqual(['nodeId', 'timestamp']);
    });

    it('restores empty history', () => {
      const restored = new ViewHistory();
      restored.fromJSON([]);

      expect(restored.size).toBe(0);
      expect(restored.current()).toBeNull();
    });
  });

  describe('removeNodeEntries', () => {
    it('removes all entries for a specific nodeId', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      history.push({ nodeId: 'a', timestamp: 3 });
      history.push({ nodeId: 'c', timestamp: 4 });

      history.removeNodeEntries('a');

      expect(history.size).toBe(2);
      const json = history.toJSON();
      expect(json.map((e) => e.nodeId)).toEqual(['b', 'c']);
    });

    it('handles removing the current entry', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });

      history.removeNodeEntries('b');

      expect(history.size).toBe(1);
      expect(history.current()?.nodeId).toBe('a');
    });

    it('handles clearing all entries', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.removeNodeEntries('a');

      expect(history.size).toBe(0);
      expect(history.current()).toBeNull();
    });
  });

  describe('boundary behavior', () => {
    it('handles full history and maxSize 1', () => {
      const tiny = new ViewHistory(1);
      tiny.push({ nodeId: 'a', timestamp: 1 });
      tiny.push({ nodeId: 'b', timestamp: 2 });

      expect(tiny.size).toBe(1);
      expect(tiny.current()?.nodeId).toBe('b');
      expect(tiny.canGoBack).toBe(false);
    });

    it('handles back then forward then push correctly', () => {
      history.push({ nodeId: 'a', timestamp: 1 });
      history.push({ nodeId: 'b', timestamp: 2 });
      history.push({ nodeId: 'c', timestamp: 3 });

      history.back(); // -> b
      history.forward(); // -> c
      history.push({ nodeId: 'd', timestamp: 4 });

      expect(history.size).toBe(4);
      expect(history.current()?.nodeId).toBe('d');
    });
  });
});
