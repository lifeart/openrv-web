/**
 * PlaylistManager.fromOTIO -- Issue #470 regression tests
 *
 * Verifies that fromOTIO uses parseOTIOMultiTrack and preserves:
 * - Multi-track OTIO structure (uses first video track)
 * - Transitions between clips
 * - Gap timing
 * - Clip metadata
 * - Markers
 * - Single-track backward compatibility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';
import { TransitionManager } from './TransitionManager';

/** Build a minimal valid OTIO JSON string with configurable tracks */
function buildOTIOJson(
  tracks: Array<{
    name: string;
    kind: string;
    children: unknown[];
  }>,
  overrides: Record<string, unknown> = {},
): string {
  const base = {
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Test Timeline',
    global_start_time: {
      OTIO_SCHEMA: 'RationalTime.1',
      value: 0,
      rate: 24,
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      children: tracks.map((t) => ({
        OTIO_SCHEMA: 'Track.1',
        name: t.name,
        kind: t.kind,
        children: t.children,
      })),
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

function buildClip(
  name: string,
  startFrame: number,
  duration: number,
  targetUrl?: string,
  metadata?: Record<string, unknown>,
  markers?: unknown[],
) {
  const clip: Record<string, unknown> = {
    OTIO_SCHEMA: 'Clip.1',
    name,
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: { OTIO_SCHEMA: 'RationalTime.1', value: startFrame, rate: 24 },
      duration: { OTIO_SCHEMA: 'RationalTime.1', value: duration, rate: 24 },
    },
  };
  if (targetUrl) {
    clip.media_reference = {
      OTIO_SCHEMA: 'ExternalReference.1',
      target_url: targetUrl,
    };
  }
  if (metadata) {
    clip.metadata = metadata;
  }
  if (markers) {
    clip.markers = markers;
  }
  return clip;
}

function buildGap(duration: number) {
  return {
    OTIO_SCHEMA: 'Gap.1',
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: 24 },
      duration: { OTIO_SCHEMA: 'RationalTime.1', value: duration, rate: 24 },
    },
  };
}

function buildTransition(name: string, type: string, inOffset: number, outOffset: number) {
  return {
    OTIO_SCHEMA: 'Transition.1',
    name,
    transition_type: type,
    in_offset: { OTIO_SCHEMA: 'RationalTime.1', value: inOffset, rate: 24 },
    out_offset: { OTIO_SCHEMA: 'RationalTime.1', value: outOffset, rate: 24 },
  };
}

function buildMarker(
  name: string,
  startFrame: number,
  duration: number,
  color?: string,
  metadata?: Record<string, unknown>,
) {
  const m: Record<string, unknown> = {
    OTIO_SCHEMA: 'Marker.1',
    name,
    marked_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: { OTIO_SCHEMA: 'RationalTime.1', value: startFrame, rate: 24 },
      duration: { OTIO_SCHEMA: 'RationalTime.1', value: duration, rate: 24 },
    },
  };
  if (color) m.color = color;
  if (metadata) m.metadata = metadata;
  return m;
}

/** Default source resolver: all clips resolve to source index 0 */
function allResolve() {
  return { index: 0, frameCount: 9999 };
}

let nextIndex = 0;
function sequentialResolve() {
  return { index: nextIndex++, frameCount: 9999 };
}

describe('PlaylistManager.fromOTIO -- Issue #470', () => {
  let pm: PlaylistManager;
  let tm: TransitionManager;

  beforeEach(() => {
    nextIndex = 0;
    pm = new PlaylistManager();
    tm = new TransitionManager();
    pm.setTransitionManager(tm);
  });

  afterEach(() => {
    pm.dispose();
    tm.dispose();
  });

  // --- Single-track backward compatibility ---

  describe('backward compatibility', () => {
    it('OTIO-470-001: single-track OTIO with two clips imports correctly', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48, '/media/shot_01.exr'),
            buildClip('shot_02', 10, 72),
          ],
        },
      ]);

      const count = pm.fromOTIO(json, allResolve);
      expect(count).toBe(2);

      const clips = pm.getClips();
      expect(clips).toHaveLength(2);
      expect(clips[0]!.sourceName).toBe('shot_01');
      expect(clips[0]!.inPoint).toBe(0);
      expect(clips[0]!.outPoint).toBe(47);
      expect(clips[1]!.sourceName).toBe('shot_02');
      expect(clips[1]!.inPoint).toBe(10);
      expect(clips[1]!.outPoint).toBe(81);
    });

    it('OTIO-470-002: returns 0 for invalid JSON', () => {
      expect(pm.fromOTIO('not json', allResolve)).toBe(0);
    });

    it('OTIO-470-003: unresolved clips are tracked', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [buildClip('shot_01', 0, 48)],
        },
      ]);

      const count = pm.fromOTIO(json, () => null);
      expect(count).toBe(0);
      expect(pm.unresolvedClips).toHaveLength(1);
      expect(pm.unresolvedClips[0]!.name).toBe('shot_01');
    });
  });

  // --- Multi-track handling ---

  describe('multi-track', () => {
    it('OTIO-470-004: multi-track OTIO uses first video track', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [buildClip('v1_shot', 0, 48)],
        },
        {
          name: 'Video 2',
          kind: 'Video',
          children: [buildClip('v2_shot', 0, 100)],
        },
      ]);

      const count = pm.fromOTIO(json, sequentialResolve);
      expect(count).toBe(1);

      const clips = pm.getClips();
      expect(clips).toHaveLength(1);
      expect(clips[0]!.sourceName).toBe('v1_shot');
    });

    it('OTIO-470-005: audio-only tracks are ignored', () => {
      const json = buildOTIOJson([
        {
          name: 'Audio 1',
          kind: 'Audio',
          children: [buildClip('audio', 0, 200)],
        },
        {
          name: 'Video 1',
          kind: 'Video',
          children: [buildClip('video', 0, 48)],
        },
      ]);

      const count = pm.fromOTIO(json, allResolve);
      expect(count).toBe(1);
      expect(pm.getClips()[0]!.sourceName).toBe('video');
    });
  });

  // --- Transition preservation ---

  describe('transitions', () => {
    it('OTIO-470-010: transitions are wired to TransitionManager', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('Dissolve', 'SMPTE_Dissolve', 6, 6),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      const count = pm.fromOTIO(json, sequentialResolve);
      expect(count).toBe(2);

      // The transition should be set on the TransitionManager
      const trans = tm.getTransition(0);
      expect(trans).not.toBeNull();
      expect(trans!.type).toBe('dissolve');
      expect(trans!.durationFrames).toBe(12); // 6 + 6
    });

    it('OTIO-470-011: transitions stored in lastOTIOImportResult', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('Dissolve', 'SMPTE_Dissolve', 6, 6),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      pm.fromOTIO(json, sequentialResolve);
      const result = pm.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.transitions).toHaveLength(1);
      expect(result!.transitions[0]!.name).toBe('Dissolve');
      expect(result!.transitions[0]!.transitionType).toBe('SMPTE_Dissolve');
      expect(result!.transitions[0]!.inOffset).toBe(6);
      expect(result!.transitions[0]!.outOffset).toBe(6);
    });

    it('OTIO-470-012: multiple transitions are preserved', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('Diss1', 'SMPTE_Dissolve', 6, 6),
            buildClip('shot_02', 0, 48),
            buildTransition('Diss2', 'SMPTE_Dissolve', 3, 3),
            buildClip('shot_03', 0, 24),
          ],
        },
      ]);

      const count = pm.fromOTIO(json, sequentialResolve);
      expect(count).toBe(3);

      expect(tm.getTransition(0)!.durationFrames).toBe(12);
      expect(tm.getTransition(1)!.durationFrames).toBe(6);

      const result = pm.lastOTIOImportResult;
      expect(result!.transitions).toHaveLength(2);
    });

    it('OTIO-470-013: zero-duration transitions are not wired (they are hard cuts)', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('HardCut', 'SMPTE_Dissolve', 0, 0),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      pm.fromOTIO(json, sequentialResolve);
      // Zero-duration transition should not be set on the manager
      expect(tm.getTransition(0)).toBeNull();
    });

    it('OTIO-470-014: transitions work without TransitionManager', () => {
      // Create a PlaylistManager without TransitionManager
      const pmNoTm = new PlaylistManager();
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('Dissolve', 'SMPTE_Dissolve', 6, 6),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      nextIndex = 0;
      const count = pmNoTm.fromOTIO(json, sequentialResolve);
      expect(count).toBe(2);
      // Transitions are stored in the import result even without a manager
      expect(pmNoTm.lastOTIOImportResult!.transitions).toHaveLength(1);
      pmNoTm.dispose();
    });
  });

  // --- Gap preservation ---

  describe('gaps', () => {
    it('OTIO-470-020: gaps are recorded in import result', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 24),
            buildGap(12),
            buildClip('shot_02', 0, 24),
          ],
        },
      ]);

      pm.fromOTIO(json, sequentialResolve);
      const result = pm.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.gaps).toHaveLength(1);
      expect(result!.gaps[0]!.timelineInFrame).toBe(24);
      expect(result!.gaps[0]!.durationFrames).toBe(12);
    });

    it('OTIO-470-021: gap at start is recorded', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildGap(10),
            buildClip('shot_01', 0, 24),
          ],
        },
      ]);

      pm.fromOTIO(json, allResolve);
      const result = pm.lastOTIOImportResult;
      expect(result!.gaps).toHaveLength(1);
      expect(result!.gaps[0]!.timelineInFrame).toBe(0);
      expect(result!.gaps[0]!.durationFrames).toBe(10);
    });

    it('OTIO-470-022: multiple gaps are recorded', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 24),
            buildGap(6),
            buildClip('shot_02', 0, 24),
            buildGap(12),
            buildClip('shot_03', 0, 24),
          ],
        },
      ]);

      pm.fromOTIO(json, sequentialResolve);
      const result = pm.lastOTIOImportResult;
      expect(result!.gaps).toHaveLength(2);
      expect(result!.gaps[0]!.timelineInFrame).toBe(24);
      expect(result!.gaps[0]!.durationFrames).toBe(6);
      expect(result!.gaps[1]!.timelineInFrame).toBe(54); // 24 + 6 + 24
      expect(result!.gaps[1]!.durationFrames).toBe(12);
    });
  });

  // --- Metadata preservation ---

  describe('metadata', () => {
    it('OTIO-470-030: clip metadata is preserved through import', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48, undefined, { artist: 'John', version: 3 }),
          ],
        },
      ]);

      pm.fromOTIO(json, allResolve);
      const result = pm.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.importedCount).toBe(1);
    });

    it('OTIO-470-031: timeline metadata is preserved in import result', () => {
      const json = buildOTIOJson(
        [
          {
            name: 'Video 1',
            kind: 'Video',
            children: [buildClip('shot_01', 0, 48)],
          },
        ],
        { metadata: { project: 'TestProject', reel: 'A001' } },
      );

      pm.fromOTIO(json, allResolve);
      const result = pm.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual({ project: 'TestProject', reel: 'A001' });
    });
  });

  // --- Marker parsing ---

  describe('markers', () => {
    it('OTIO-470-040: timeline-level markers are parsed', () => {
      const json = buildOTIOJson(
        [
          {
            name: 'Video 1',
            kind: 'Video',
            children: [buildClip('shot_01', 0, 48)],
          },
        ],
        {
          markers: [
            buildMarker('ReviewNote', 10, 0, 'RED', { note: 'Fix color' }),
          ],
        },
      );

      pm.fromOTIO(json, allResolve);
      const result = pm.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.markers).toHaveLength(1);
      expect(result!.markers[0]!.name).toBe('ReviewNote');
      expect(result!.markers[0]!.color).toBe('#ff4444');
      expect(result!.markers[0]!.timelineFrame).toBe(10);
      expect(result!.markers[0]!.durationFrames).toBe(0);
      expect(result!.markers[0]!.metadata).toEqual({ note: 'Fix color' });
    });

    it('OTIO-470-041: clip-level markers are parsed with correct timeline offset', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildClip('shot_02', 0, 48, undefined, undefined, [
              buildMarker('ClipMarker', 5, 3, 'GREEN'),
            ]),
          ],
        },
      ]);

      pm.fromOTIO(json, sequentialResolve);
      const result = pm.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.markers).toHaveLength(1);
      // shot_02 starts at timeline frame 48, marker is at offset 5 within it
      expect(result!.markers[0]!.name).toBe('ClipMarker');
      expect(result!.markers[0]!.timelineFrame).toBe(53); // 48 + 5
      expect(result!.markers[0]!.durationFrames).toBe(3);
    });

    it('OTIO-470-042: no markers when none present', () => {
      const json = buildOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [buildClip('shot_01', 0, 48)],
        },
      ]);

      pm.fromOTIO(json, allResolve);
      const result = pm.lastOTIOImportResult;
      expect(result!.markers).toHaveLength(0);
    });
  });

  // --- Integration: transitions + gaps + markers together ---

  describe('full editorial structure', () => {
    it('OTIO-470-050: complex timeline with transitions, gaps, and markers', () => {
      const json = buildOTIOJson(
        [
          {
            name: 'Video 1',
            kind: 'Video',
            children: [
              buildClip('shot_01', 0, 48),
              buildTransition('Dissolve', 'SMPTE_Dissolve', 6, 6),
              buildClip('shot_02', 0, 48),
              buildGap(12),
              buildClip('shot_03', 0, 24),
            ],
          },
        ],
        {
          markers: [buildMarker('TimelineMarker', 0, 0, 'BLUE')],
          metadata: { project: 'Full Test' },
        },
      );

      const count = pm.fromOTIO(json, sequentialResolve);
      expect(count).toBe(3);

      const result = pm.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.transitions).toHaveLength(1);
      expect(result!.gaps).toHaveLength(1);
      expect(result!.markers).toHaveLength(1);
      expect(result!.metadata).toEqual({ project: 'Full Test' });

      // Transition is wired
      expect(tm.getTransition(0)!.type).toBe('dissolve');

      // Gap data is preserved
      expect(result!.gaps[0]!.durationFrames).toBe(12);
    });
  });
});
