/**
 * PlaylistManager – transition-aware playback (review finding L6).
 *
 * With a transition between two clips:
 * - the incoming clip owns the overlap in clip lookup,
 * - playback advances monotonically from A through the overlap into B,
 * - total duration accounts for both transition overlaps and OTIO gaps.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';
import { TransitionManager } from './TransitionManager';

function rt(value: number) {
  return { OTIO_SCHEMA: 'RationalTime.1', value, rate: 24 };
}

function otioClip(name: string, duration: number) {
  return {
    OTIO_SCHEMA: 'Clip.1',
    name,
    source_range: { OTIO_SCHEMA: 'TimeRange.1', start_time: rt(0), duration: rt(duration) },
  };
}

function otioGap(duration: number) {
  return {
    OTIO_SCHEMA: 'Gap.1',
    source_range: { OTIO_SCHEMA: 'TimeRange.1', start_time: rt(0), duration: rt(duration) },
  };
}

function otioDissolve(inOffset: number, outOffset: number) {
  return {
    OTIO_SCHEMA: 'Transition.1',
    name: 'dissolve',
    transition_type: 'SMPTE_Dissolve',
    in_offset: rt(inOffset),
    out_offset: rt(outOffset),
  };
}

function otioTimeline(children: unknown[]): string {
  return JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'L6',
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      children: [{ OTIO_SCHEMA: 'Track.1', name: 'V1', kind: 'Video', children }],
    },
  });
}

/** Play forward from frame 1 with getNextFrame until the playlist ends. */
function playThrough(pm: PlaylistManager): { frames: number[]; clipIndices: number[] } {
  const frames: number[] = [1];
  const clipIndices: number[] = [pm.getClipAtFrame(1)?.clipIndex ?? -1];
  let ended = false;
  const off = pm.on('playlistEnded', () => {
    ended = true;
  });
  let current = 1;
  for (let guard = 0; guard < 10_000 && !ended; guard++) {
    const next = pm.getNextFrame(current);
    if (ended) break;
    frames.push(next.frame);
    clipIndices.push(pm.getClipAtFrame(next.frame)?.clipIndex ?? -1);
    current = next.frame;
  }
  off();
  return { frames, clipIndices };
}

describe('PlaylistManager – transitions (L6)', () => {
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

  describe('clip lookup across a transition', () => {
    beforeEach(() => {
      pm.addClip(0, 'A', 1, 50); // global 1..50
      pm.addClip(1, 'B', 101, 140); // 40 frames
      tm.setTransition(0, { type: 'dissolve', durationFrames: 12 }); // B starts at 39
    });

    it('PL-TR-001: frames before the overlap belong to the outgoing clip', () => {
      const m = pm.getClipAtFrame(38)!;
      expect(m.clipIndex).toBe(0);
      expect(m.localFrame).toBe(38);
    });

    it('PL-TR-002: frames inside the overlap belong to the incoming clip', () => {
      for (let g = 39; g <= 50; g++) {
        const m = pm.getClipAtFrame(g)!;
        expect(m.clipIndex).toBe(1);
        expect(m.localFrame).toBe(101 + (g - 39));
      }
    });

    it('PL-TR-003: outgoing clip is the blend input inside the overlap', () => {
      const info = pm.getTransitionAtFrame(45)!;
      expect(info.outgoingClipIndex).toBe(0);
      expect(info.incomingClipIndex).toBe(1);
      expect(info.outgoingLocalFrame).toBe(45);
      expect(info.incomingLocalFrame).toBe(107);
      expect(pm.getTransitionAtFrame(39)!.progress).toBe(0);
      expect(pm.getTransitionAtFrame(50)!.progress).toBe(1);
      expect(pm.getTransitionAtFrame(38)).toBeNull();
      expect(pm.getTransitionAtFrame(51)).toBeNull();
    });
  });

  describe('monotonic advance through the overlap', () => {
    it('PL-TR-010: playback goes A -> overlap -> B and never jumps back into A', () => {
      pm.addClip(0, 'A', 1, 50);
      pm.addClip(1, 'B', 1, 40);
      tm.setTransition(0, { type: 'dissolve', durationFrames: 12 });

      const { frames, clipIndices } = playThrough(pm);

      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]!).toBe(frames[i - 1]! + 1);
        expect(clipIndices[i]!).toBeGreaterThanOrEqual(clipIndices[i - 1]!);
      }
      expect(frames[frames.length - 1]).toBe(78);
      expect(pm.getTotalDuration()).toBe(78);
    });

    it('PL-TR-011: three clips with two transitions advance monotonically to the end', () => {
      pm.addClip(0, 'A', 1, 30);
      pm.addClip(1, 'B', 1, 30);
      pm.addClip(2, 'C', 1, 30);
      tm.setTransition(0, { type: 'crossfade', durationFrames: 5 });
      tm.setTransition(1, { type: 'wipe-left', durationFrames: 8 });

      const { frames, clipIndices } = playThrough(pm);
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]!).toBeGreaterThan(frames[i - 1]!);
        expect(clipIndices[i]!).toBeGreaterThanOrEqual(clipIndices[i - 1]!);
      }
      expect(frames[frames.length - 1]).toBe(90 - 5 - 8);
    });

    it('PL-TR-012: loop "all" wraps from the end back to frame 1 only once per pass', () => {
      pm.addClip(0, 'A', 1, 20);
      pm.addClip(1, 'B', 1, 20);
      tm.setTransition(0, { type: 'dissolve', durationFrames: 4 });
      pm.setLoopMode('all');

      let current = 1;
      let wraps = 0;
      for (let i = 0; i < 2 * 36; i++) {
        const next = pm.getNextFrame(current);
        if (next.frame < current) {
          wraps++;
          expect(current).toBe(36);
          expect(next.frame).toBe(1);
        }
        current = next.frame;
      }
      expect(wraps).toBe(2);
    });

    it('PL-TR-013: stepping backward out of the incoming clip lands in the outgoing clip', () => {
      pm.addClip(0, 'A', 1, 50);
      pm.addClip(1, 'B', 1, 40);
      tm.setTransition(0, { type: 'dissolve', durationFrames: 12 });

      const prev = pm.getPreviousFrame(39);
      expect(prev).toEqual({ frame: 38, clipChanged: true });
      expect(pm.getClipAtFrame(38)!.clipIndex).toBe(0);
    });
  });

  describe('duration with transitions and gaps', () => {
    it('PL-TR-020: OTIO gaps survive transitions and count toward total duration', () => {
      const json = otioTimeline([
        otioClip('A', 50),
        otioGap(10),
        otioClip('B', 40),
        otioDissolve(6, 6),
        otioClip('C', 30),
      ]);
      const imported = pm.fromOTIO(json, () => ({ index: 0, frameCount: 1000 }));
      expect(imported).toBe(3);

      const clips = pm.getClips();
      expect(clips[0]!.globalStartFrame).toBe(1); // A: 1..50
      // OTIO transitions borrow media handles: B is extended by the 6-frame
      // out_offset. C starts at media frame 0, so it has no head handle and the
      // 12-frame overlap eats into its visible frames instead.
      expect(clips[1]!.globalStartFrame).toBe(61); // 10-frame gap, B: 61..106
      expect(clips[2]!.globalStartFrame).toBe(95); // 12-frame overlap, C: 95..124
      expect(pm.getTotalDuration()).toBe(124); // 50 + 10 + 46 + 30 - 12

      // Gap frames map to no clip; the overlap belongs to C
      expect(pm.getClipAtFrame(55)).toBeNull();
      expect(pm.getClipAtFrame(100)!.clipIndex).toBe(2);
    });

    it('PL-TR-021: gaps are preserved when a transition is added later and removed again', () => {
      const json = otioTimeline([otioClip('A', 20), otioGap(5), otioClip('B', 20), otioClip('C', 20)]);
      pm.fromOTIO(json, () => ({ index: 0, frameCount: 1000 }));
      expect(pm.getTotalDuration()).toBe(65);

      tm.setTransition(1, { type: 'crossfade', durationFrames: 4 });
      expect(pm.getClips().map((c) => c.globalStartFrame)).toEqual([1, 26, 42]);
      expect(pm.getTotalDuration()).toBe(61);

      tm.setTransition(1, null);
      expect(pm.getClips().map((c) => c.globalStartFrame)).toEqual([1, 26, 46]);
      expect(pm.getTotalDuration()).toBe(65);
    });

    it('PL-TR-022: removing a clip keeps the gap in front of the following clip', () => {
      const json = otioTimeline([otioClip('A', 20), otioClip('B', 20), otioGap(5), otioClip('C', 20)]);
      pm.fromOTIO(json, () => ({ index: 0, frameCount: 1000 }));
      const [, b] = pm.getClips();

      pm.removeClip(b!.id);
      expect(pm.getClips().map((c) => c.globalStartFrame)).toEqual([1, 26]);
      expect(pm.getTotalDuration()).toBe(45);
    });

    it('PL-TR-023: setState round-trips gap + overlap layout', () => {
      const json = otioTimeline([otioClip('A', 30), otioGap(7), otioClip('B', 30), otioClip('C', 30)]);
      pm.fromOTIO(json, () => ({ index: 0, frameCount: 1000 }));
      tm.setTransition(1, { type: 'dissolve', durationFrames: 6 });
      const state = JSON.parse(JSON.stringify(pm.getState()));
      const expectedStarts = pm.getClips().map((c) => c.globalStartFrame);
      const expectedTotal = pm.getTotalDuration();

      const pm2 = new PlaylistManager();
      const tm2 = new TransitionManager();
      pm2.setTransitionManager(tm2);
      pm2.setState(state);

      expect(pm2.getClips().map((c) => c.globalStartFrame)).toEqual(expectedStarts);
      expect(pm2.getTotalDuration()).toBe(expectedTotal);
      expect(expectedTotal).toBe(30 + 7 + 30 + 30 - 6);

      pm2.dispose();
      tm2.dispose();
    });
  });
});
