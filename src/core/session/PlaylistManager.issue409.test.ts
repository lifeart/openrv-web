/**
 * Regression tests for issue #409:
 * Timeline/EDL edits that rebuild the playlist ignore transition-adjusted clip start frames.
 *
 * Verifies that PlaylistManager.replaceClips() calls recalculateGlobalFrames()
 * so that transition overlap adjustments are applied to the rebuilt clips.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';
import { TransitionManager } from './TransitionManager';

describe('PlaylistManager – issue #409: replaceClips respects transition-adjusted frames', () => {
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

  it('should apply transition overlap adjustments after replaceClips', () => {
    // Add initial clips and set a transition
    pm.addClip(0, 'A', 1, 50);
    pm.addClip(1, 'B', 1, 40);
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    // Verify initial state with transitions
    let clips = pm.getClips();
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(41); // 1 + 50 - 10

    // Now replaceClips with the same clip data
    pm.replaceClips([
      { sourceIndex: 0, sourceName: 'A', inPoint: 1, outPoint: 50 },
      { sourceIndex: 1, sourceName: 'B', inPoint: 1, outPoint: 40 },
    ]);

    // After replaceClips, transitions are resized (preserved since same count).
    // The transition at gap 0 should still apply overlap adjustment.
    clips = pm.getClips();
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(41); // must be overlap-adjusted, not 51
  });

  it('should apply overlap adjustments with multiple transitions after replaceClips', () => {
    // Set up 3 clips with transitions on both gaps
    pm.addClip(0, 'A', 1, 50);
    pm.addClip(1, 'B', 1, 40);
    pm.addClip(2, 'C', 1, 30);
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });
    tm.setTransition(1, { type: 'crossfade', durationFrames: 5 });

    // Verify initial overlap-adjusted frames
    let clips = pm.getClips();
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(41); // 1 + 50 - 10
    expect(clips[2]!.globalStartFrame).toBe(76); // 41 + 40 - 5

    // Replace with same clips
    pm.replaceClips([
      { sourceIndex: 0, sourceName: 'A', inPoint: 1, outPoint: 50 },
      { sourceIndex: 1, sourceName: 'B', inPoint: 1, outPoint: 40 },
      { sourceIndex: 2, sourceName: 'C', inPoint: 1, outPoint: 30 },
    ]);

    clips = pm.getClips();
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(41);
    expect(clips[2]!.globalStartFrame).toBe(76);
  });

  it('should produce sequential frames when no transition manager is set', () => {
    // Create a fresh PlaylistManager without a TransitionManager
    const pmNoTm = new PlaylistManager();

    pmNoTm.replaceClips([
      { sourceIndex: 0, sourceName: 'A', inPoint: 1, outPoint: 50 },
      { sourceIndex: 1, sourceName: 'B', inPoint: 1, outPoint: 40 },
    ]);

    const clips = pmNoTm.getClips();
    expect(clips[0]!.globalStartFrame).toBe(1);
    expect(clips[1]!.globalStartFrame).toBe(51); // sequential, no overlap

    pmNoTm.dispose();
  });

  it('should report correct total duration after replaceClips with transitions', () => {
    pm.addClip(0, 'A', 1, 50);
    pm.addClip(1, 'B', 1, 40);
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    expect(pm.getTotalDuration()).toBe(80); // 50 + 40 - 10

    pm.replaceClips([
      { sourceIndex: 0, sourceName: 'A', inPoint: 1, outPoint: 50 },
      { sourceIndex: 1, sourceName: 'B', inPoint: 1, outPoint: 40 },
    ]);

    // Total duration should still account for overlap
    expect(pm.getTotalDuration()).toBe(80);
  });

  it('should clamp currentFrame correctly after replaceClips with transitions', () => {
    pm.addClip(0, 'A', 1, 50);
    pm.addClip(1, 'B', 1, 40);
    tm.setTransition(0, { type: 'crossfade', durationFrames: 10 });

    // Set current frame near the end of the overlap-adjusted timeline (80 frames)
    pm.setCurrentFrame(85);

    pm.replaceClips([
      { sourceIndex: 0, sourceName: 'A', inPoint: 1, outPoint: 50 },
      { sourceIndex: 1, sourceName: 'B', inPoint: 1, outPoint: 40 },
    ]);

    // Current frame should be clamped to total duration (80)
    expect(pm.getCurrentFrame()).toBeLessThanOrEqual(80);
  });
});
