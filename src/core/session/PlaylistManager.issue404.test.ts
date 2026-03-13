import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';
import { TransitionManager } from './TransitionManager';

/**
 * Regression tests for Issue #404:
 * Project/snapshot restore can leave stale playlist transitions active
 * when the incoming state has none.
 */
describe('PlaylistManager – Issue #404: stale transitions on restore', () => {
  let pm: PlaylistManager;
  let tm: TransitionManager;

  beforeEach(() => {
    pm = new PlaylistManager();
    tm = new TransitionManager();
    pm.setTransitionManager(tm);
  });

  afterEach(() => {
    pm.dispose();
    tm.dispose();
  });

  describe('clear() also clears transitions', () => {
    it('should clear transition manager when clear() is called', () => {
      pm.addClip(0, 'A', 1, 50);
      pm.addClip(1, 'B', 1, 50);
      tm.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      expect(tm.getTransition(0)).not.toBeNull();

      pm.clear();

      expect(pm.getClipCount()).toBe(0);
      expect(tm.getState()).toEqual([]);
    });
  });

  describe('setState() with no transitions clears existing transitions', () => {
    it('should clear stale transitions when incoming state has no transitions field', () => {
      // Set up existing state with transitions
      pm.addClip(0, 'A', 1, 50);
      pm.addClip(1, 'B', 1, 50);
      tm.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      expect(tm.getState().length).toBe(1);

      // Restore state without transitions field
      pm.setState({
        clips: [
          {
            id: 'clip-10',
            sourceIndex: 2,
            sourceName: 'C',
            inPoint: 1,
            outPoint: 30,
            duration: 30,
            globalStartFrame: 1,
          },
        ],
      });

      // Transitions should be cleared
      expect(tm.getState()).toEqual([]);
    });

    it('should clear stale transitions when incoming state has transitions undefined', () => {
      pm.addClip(0, 'A', 1, 50);
      pm.addClip(1, 'B', 1, 50);
      tm.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      pm.setState({
        clips: [
          {
            id: 'clip-20',
            sourceIndex: 0,
            sourceName: 'X',
            inPoint: 1,
            outPoint: 40,
            duration: 40,
            globalStartFrame: 1,
          },
          {
            id: 'clip-21',
            sourceIndex: 1,
            sourceName: 'Y',
            inPoint: 1,
            outPoint: 40,
            duration: 40,
            globalStartFrame: 41,
          },
        ],
        transitions: undefined,
      });

      expect(tm.getState()).toEqual([]);
    });
  });

  describe('setState() with transitions properly applies them', () => {
    it('should apply provided transitions from incoming state', () => {
      pm.addClip(0, 'A', 1, 50);
      pm.addClip(1, 'B', 1, 50);

      const newTransitions = [{ type: 'dissolve' as const, durationFrames: 15 }];

      pm.setState({
        clips: [
          {
            id: 'clip-30',
            sourceIndex: 0,
            sourceName: 'A',
            inPoint: 1,
            outPoint: 50,
            duration: 50,
            globalStartFrame: 1,
          },
          {
            id: 'clip-31',
            sourceIndex: 1,
            sourceName: 'B',
            inPoint: 1,
            outPoint: 50,
            duration: 50,
            globalStartFrame: 51,
          },
        ],
        transitions: newTransitions,
      });

      const restored = tm.getState();
      expect(restored).toHaveLength(1);
      expect(restored[0]?.type).toBe('dissolve');
      expect(restored[0]?.durationFrames).toBe(15);
    });

    it('should replace old transitions with new ones from incoming state', () => {
      pm.addClip(0, 'A', 1, 50);
      pm.addClip(1, 'B', 1, 50);
      tm.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      pm.setState({
        clips: [
          {
            id: 'clip-40',
            sourceIndex: 0,
            sourceName: 'A',
            inPoint: 1,
            outPoint: 50,
            duration: 50,
            globalStartFrame: 1,
          },
          {
            id: 'clip-41',
            sourceIndex: 1,
            sourceName: 'B',
            inPoint: 1,
            outPoint: 50,
            duration: 50,
            globalStartFrame: 51,
          },
        ],
        transitions: [{ type: 'wipe', durationFrames: 20 }],
      });

      const restored = tm.getState();
      expect(restored).toHaveLength(1);
      expect(restored[0]?.type).toBe('wipe');
      expect(restored[0]?.durationFrames).toBe(20);
    });
  });
});
