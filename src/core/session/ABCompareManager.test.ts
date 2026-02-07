import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ABCompareManager, type ABCompareManagerCallbacks } from './ABCompareManager';

describe('ABCompareManager', () => {
  let manager: ABCompareManager;
  let callbacks: ABCompareManagerCallbacks;
  let onABSourceChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new ABCompareManager();
    onABSourceChanged = vi.fn();
    callbacks = { onABSourceChanged };
    manager.setCallbacks(callbacks);
  });

  describe('initialization', () => {
    it('ABC-001: starts with A selected', () => {
      expect(manager.currentAB).toBe('A');
    });

    it('ABC-002: starts with source A at index 0', () => {
      expect(manager.sourceAIndex).toBe(0);
    });

    it('ABC-003: starts with source B not assigned (-1)', () => {
      expect(manager.sourceBIndex).toBe(-1);
    });

    it('ABC-004: starts with sync playhead enabled', () => {
      expect(manager.syncPlayhead).toBe(true);
    });

    it('ABC-005: starts with A/B not available (no sources)', () => {
      expect(manager.isAvailable(0)).toBe(false);
      expect(manager.isAvailable(1)).toBe(false);
    });
  });

  describe('onSourceAdded', () => {
    it('ABC-006: first source does not trigger auto-assign', () => {
      const result = manager.onSourceAdded(1);
      expect(result.emitEvent).toBe(false);
      expect(result.currentSourceIndex).toBe(0); // latest source index
      expect(manager.sourceBIndex).toBe(-1);
    });

    it('ABC-007: second source auto-assigns source B', () => {
      manager.onSourceAdded(1); // first source
      const result = manager.onSourceAdded(2); // second source
      expect(result.emitEvent).toBe(true);
      expect(result.currentSourceIndex).toBe(0); // stays on A
      expect(manager.sourceAIndex).toBe(0);
      expect(manager.sourceBIndex).toBe(1);
    });

    it('ABC-008: third source does not change auto-assign', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      const result = manager.onSourceAdded(3);
      expect(result.emitEvent).toBe(false);
      expect(result.currentSourceIndex).toBe(2); // latest source index
    });

    it('ABC-009: A/B becomes available after second source', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      expect(manager.isAvailable(2)).toBe(true);
    });
  });

  describe('setSourceA', () => {
    it('ABC-010: updates source A index', () => {
      manager.setSourceA(1, 3);
      expect(manager.sourceAIndex).toBe(1);
    });

    it('ABC-011: does not update if index out of range', () => {
      manager.setSourceA(5, 3);
      expect(manager.sourceAIndex).toBe(0);
    });

    it('ABC-012: does not update if same as current', () => {
      manager.setSourceA(0, 3);
      expect(manager.sourceAIndex).toBe(0);
    });
  });

  describe('setSourceB', () => {
    it('ABC-013: updates source B index', () => {
      manager.setSourceB(2, 3);
      expect(manager.sourceBIndex).toBe(2);
    });

    it('ABC-014: does not update if index out of range', () => {
      manager.setSourceB(5, 3);
      expect(manager.sourceBIndex).toBe(-1);
    });
  });

  describe('clearSourceB', () => {
    it('ABC-015: resets source B to -1', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2); // auto-assigns B=1
      manager.clearSourceB();
      expect(manager.sourceBIndex).toBe(-1);
    });

    it('ABC-016: switches to A if currently on B', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      manager.toggle(2); // switch to B
      const needsSwitch = manager.clearSourceB();
      expect(needsSwitch).toBe(true);
      expect(manager.currentAB).toBe('A');
    });

    it('ABC-017: does not switch if currently on A', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      const needsSwitch = manager.clearSourceB();
      expect(needsSwitch).toBe(false);
      expect(manager.currentAB).toBe('A');
    });
  });

  describe('toggle', () => {
    it('ABC-018: returns null when A/B not available', () => {
      expect(manager.toggle(1)).toBeNull();
    });

    it('ABC-019: toggles from A to B', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      const result = manager.toggle(2);
      expect(result).not.toBeNull();
      expect(result!.newSourceIndex).toBe(1); // source B index
      expect(manager.currentAB).toBe('B');
    });

    it('ABC-020: toggles from B back to A', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      manager.toggle(2); // A -> B
      const result = manager.toggle(2); // B -> A
      expect(result!.newSourceIndex).toBe(0);
      expect(manager.currentAB).toBe('A');
    });

    it('ABC-021: reports shouldRestoreFrame based on syncPlayhead', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      const result1 = manager.toggle(2);
      expect(result1!.shouldRestoreFrame).toBe(true);

      manager.syncPlayhead = false;
      const result2 = manager.toggle(2);
      expect(result2!.shouldRestoreFrame).toBe(false);
    });
  });

  describe('shouldToggle', () => {
    it('ABC-022: returns false for same AB state', () => {
      expect(manager.shouldToggle('A', 2)).toBe(false);
    });

    it('ABC-023: returns false for B when not available', () => {
      expect(manager.shouldToggle('B', 1)).toBe(false);
    });

    it('ABC-024: returns true for valid toggle', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      expect(manager.shouldToggle('B', 2)).toBe(true);
    });
  });

  describe('emitChanged', () => {
    it('ABC-025: emits through callbacks', () => {
      manager.emitChanged(1);
      expect(onABSourceChanged).toHaveBeenCalledWith({
        current: 'A',
        sourceIndex: 1,
      });
    });

    it('ABC-026: reflects current AB state', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      manager.toggle(2);
      manager.emitChanged(1);
      expect(onABSourceChanged).toHaveBeenCalledWith({
        current: 'B',
        sourceIndex: 1,
      });
    });
  });

  describe('activeSourceIndex', () => {
    it('ABC-027: returns source A index when on A', () => {
      expect(manager.activeSourceIndex).toBe(0);
    });

    it('ABC-028: returns source B index when on B', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      manager.toggle(2);
      expect(manager.activeSourceIndex).toBe(1);
    });
  });

  describe('syncPlayhead', () => {
    it('ABC-029: can be toggled', () => {
      manager.syncPlayhead = false;
      expect(manager.syncPlayhead).toBe(false);
      manager.syncPlayhead = true;
      expect(manager.syncPlayhead).toBe(true);
    });
  });

  describe('isSourceB', () => {
    it('ABC-030: returns false initially', () => {
      expect(manager.isSourceB(0)).toBe(false);
      expect(manager.isSourceB(1)).toBe(false);
    });

    it('ABC-031: returns true for source B index after assignment', () => {
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      expect(manager.isSourceB(1)).toBe(true);
      expect(manager.isSourceB(0)).toBe(false);
    });
  });

  describe('callbacks not set', () => {
    it('ABC-032: works without callbacks', () => {
      const mgr = new ABCompareManager();
      mgr.onSourceAdded(1);
      mgr.onSourceAdded(2);
      mgr.toggle(2);
      mgr.emitChanged(0);
      expect(mgr.currentAB).toBe('B');
    });
  });

  describe('dispose', () => {
    it('ABC-033: dispose nulls callbacks', () => {
      manager.dispose();
      // emitChanged should not fire callback after dispose
      manager.onSourceAdded(1);
      manager.onSourceAdded(2);
      manager.emitChanged(0);
      expect(onABSourceChanged).not.toHaveBeenCalled();
    });
  });
});
