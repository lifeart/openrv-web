import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';
import { TransitionManager } from './TransitionManager';

describe('PlaylistManager - issue #407: stale transitions after clip changes', () => {
  let playlist: PlaylistManager;
  let transitions: TransitionManager;

  beforeEach(() => {
    playlist = new PlaylistManager();
    transitions = new TransitionManager();
    playlist.setTransitionManager(transitions);
  });

  afterEach(() => {
    playlist.dispose();
    transitions.dispose();
  });

  describe('removeClip trims excess transitions', () => {
    it('should trim transitions when a clip is removed', () => {
      // 3 clips → 2 gaps (transitions[0], transitions[1])
      const clipA = playlist.addClip(0, 'A', 1, 50);
      const clipB = playlist.addClip(1, 'B', 1, 40);
      playlist.addClip(2, 'C', 1, 30);

      // Set crossfades at both gaps
      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });
      transitions.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      expect(transitions.getTransitions()).toHaveLength(2);

      // Remove middle clip → now 2 clips, 1 gap
      playlist.removeClip(clipB.id);

      expect(playlist.getClipCount()).toBe(2);
      expect(transitions.getTransitions()).toHaveLength(1);
      // The first transition should be preserved
      expect(transitions.getTransition(0)).toEqual({ type: 'dissolve', durationFrames: 10 });
      // The second transition (index 1) should be gone
      expect(transitions.getTransition(1)).toBeNull();
    });

    it('should clear all transitions when removing down to 1 clip', () => {
      const clipA = playlist.addClip(0, 'A', 1, 50);
      const clipB = playlist.addClip(1, 'B', 1, 40);

      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      playlist.removeClip(clipB.id);

      expect(playlist.getClipCount()).toBe(1);
      expect(transitions.getTransitions()).toHaveLength(0);
    });

    it('should clear all transitions when removing down to 0 clips', () => {
      const clipA = playlist.addClip(0, 'A', 1, 50);

      // Manually set a transition even though there's only 1 clip (stale data)
      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      playlist.removeClip(clipA.id);

      expect(playlist.getClipCount()).toBe(0);
      expect(transitions.getTransitions()).toHaveLength(0);
    });
  });

  describe('replaceClips resizes transitions', () => {
    it('should trim transitions when replacing with fewer clips', () => {
      // Start with 3 clips + 2 transitions
      playlist.addClip(0, 'A', 1, 50);
      playlist.addClip(1, 'B', 1, 40);
      playlist.addClip(2, 'C', 1, 30);

      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });
      transitions.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      // Replace with only 2 clips
      playlist.replaceClips([
        { sourceIndex: 0, sourceName: 'X', inPoint: 1, outPoint: 60 },
        { sourceIndex: 1, sourceName: 'Y', inPoint: 1, outPoint: 40 },
      ]);

      expect(playlist.getClipCount()).toBe(2);
      // Should now have exactly 1 gap
      expect(transitions.getTransitions()).toHaveLength(1);
      expect(transitions.getTransition(0)).toEqual({ type: 'dissolve', durationFrames: 10 });
    });

    it('should pad transitions when replacing with more clips', () => {
      playlist.addClip(0, 'A', 1, 50);
      playlist.addClip(1, 'B', 1, 40);

      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      // Replace with 3 clips
      playlist.replaceClips([
        { sourceIndex: 0, sourceName: 'X', inPoint: 1, outPoint: 60 },
        { sourceIndex: 1, sourceName: 'Y', inPoint: 1, outPoint: 40 },
        { sourceIndex: 2, sourceName: 'Z', inPoint: 1, outPoint: 30 },
      ]);

      expect(playlist.getClipCount()).toBe(3);
      // Should now have 2 gaps: first preserved, second null
      expect(transitions.getTransitions()).toHaveLength(2);
      expect(transitions.getTransition(0)).toEqual({ type: 'dissolve', durationFrames: 10 });
      expect(transitions.getTransition(1)).toBeNull();
    });
  });

  describe('duration calculation is correct after clip removal with transitions', () => {
    it('should not include stale transition overlap in duration after removing a clip', () => {
      // 3 clips: 50 + 40 + 30 = 120 raw frames
      playlist.addClip(0, 'A', 1, 50);
      const clipB = playlist.addClip(1, 'B', 1, 40);
      playlist.addClip(2, 'C', 1, 30);

      // Add transitions: 10 + 8 = 18 overlap → 120 - 18 = 102
      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });
      transitions.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      expect(playlist.getTotalDuration()).toBe(102);

      // Remove middle clip B → 2 clips: 50 + 30 = 80 raw frames
      // Transition at gap 0 still 10 → 80 - 10 = 70
      playlist.removeClip(clipB.id);

      expect(playlist.getClipCount()).toBe(2);
      // The stale transition[1] should be trimmed, so only transition[0] (10 frames) counts
      expect(transitions.getTotalOverlap()).toBe(10);
      expect(playlist.getTotalDuration()).toBe(70);
    });

    it('should have zero overlap after removing all but one clip', () => {
      const clipA = playlist.addClip(0, 'A', 1, 50);
      const clipB = playlist.addClip(1, 'B', 1, 40);

      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });

      expect(playlist.getTotalDuration()).toBe(80); // 90 - 10

      playlist.removeClip(clipB.id);

      expect(transitions.getTotalOverlap()).toBe(0);
      expect(playlist.getTotalDuration()).toBe(50);
    });
  });

  describe('addClip pads transitions', () => {
    it('should grow transitions array when adding a clip', () => {
      playlist.addClip(0, 'A', 1, 50);
      playlist.addClip(1, 'B', 1, 40);

      // Initially 1 gap
      expect(transitions.getTransitions()).toHaveLength(1);

      // Add a third clip → 2 gaps
      playlist.addClip(2, 'C', 1, 30);

      expect(transitions.getTransitions()).toHaveLength(2);
      // New gap should be null (cut)
      expect(transitions.getTransition(1)).toBeNull();
    });
  });

  describe('moveClip keeps transitions in sync', () => {
    it('should maintain correct transition count after moving a clip', () => {
      const clipA = playlist.addClip(0, 'A', 1, 50);
      playlist.addClip(1, 'B', 1, 40);
      playlist.addClip(2, 'C', 1, 30);

      transitions.setTransition(0, { type: 'dissolve', durationFrames: 10 });
      transitions.setTransition(1, { type: 'dissolve', durationFrames: 8 });

      // Move clip A from index 0 to index 2
      playlist.moveClip(clipA.id, 2);

      // Still 3 clips, 2 gaps
      expect(playlist.getClipCount()).toBe(3);
      expect(transitions.getTransitions()).toHaveLength(2);
    });
  });
});
