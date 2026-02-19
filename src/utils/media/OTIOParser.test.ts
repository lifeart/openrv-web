/**
 * OTIOParser Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseOTIO,
  parseOTIOMultiTrack,
  rationalTimeToFrames,
  timeRangeDurationFrames,
  type OTIORationalTime,
  type OTIOTimeRange,
  type OTIOParseResult,
} from './OTIOParser';

/** Helper to build a minimal valid OTIO timeline JSON string */
function buildOTIOJson(overrides: Record<string, unknown> = {}): string {
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
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Video 1',
          kind: 'Video',
          children: [],
        },
      ],
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

/** Helper to build a clip object */
function buildClip(
  name: string,
  startFrame: number,
  duration: number,
  targetUrl?: string
) {
  const clip: Record<string, unknown> = {
    OTIO_SCHEMA: 'Clip.1',
    name,
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: {
        OTIO_SCHEMA: 'RationalTime.1',
        value: startFrame,
        rate: 24,
      },
      duration: {
        OTIO_SCHEMA: 'RationalTime.1',
        value: duration,
        rate: 24,
      },
    },
  };
  if (targetUrl) {
    clip.media_reference = {
      OTIO_SCHEMA: 'ExternalReference.1',
      target_url: targetUrl,
    };
  }
  return clip;
}

/** Helper to build a gap object */
function buildGap(duration: number) {
  return {
    OTIO_SCHEMA: 'Gap.1',
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 0,
        rate: 24,
      },
      duration: {
        OTIO_SCHEMA: 'RationalTime.1',
        value: duration,
        rate: 24,
      },
    },
  };
}

/** Helper to build a transition object */
function buildTransition(
  name: string,
  transitionType: string,
  inOffset: number,
  outOffset: number,
  rate = 24,
  metadata?: Record<string, unknown>
) {
  const t: Record<string, unknown> = {
    OTIO_SCHEMA: 'Transition.1',
    name,
    transition_type: transitionType,
    in_offset: {
      OTIO_SCHEMA: 'RationalTime.1',
      value: inOffset,
      rate,
    },
    out_offset: {
      OTIO_SCHEMA: 'RationalTime.1',
      value: outOffset,
      rate,
    },
  };
  if (metadata) {
    t.metadata = metadata;
  }
  return t;
}

/** Helper to build a multi-track OTIO JSON string */
function buildMultiTrackOTIOJson(
  tracks: Array<{
    name: string;
    kind: string;
    children: unknown[];
  }>,
  overrides: Record<string, unknown> = {}
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

describe('OTIOParser', () => {
  describe('rationalTimeToFrames', () => {
    it('OTIO-U001: converts integer rational time to frames when rates match', () => {
      const rt: OTIORationalTime = {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 48,
        rate: 24,
      };
      expect(rationalTimeToFrames(rt, 24)).toBe(48);
    });

    it('OTIO-U002: rounds fractional values', () => {
      const rt: OTIORationalTime = {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 10.6,
        rate: 24,
      };
      expect(rationalTimeToFrames(rt, 24)).toBe(11);
    });

    it('OTIO-U003: handles zero value', () => {
      const rt: OTIORationalTime = {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 0,
        rate: 24,
      };
      expect(rationalTimeToFrames(rt, 24)).toBe(0);
    });

    it('OTIO-U003b: rescales when source rate differs from target rate', () => {
      // 30 frames at 30fps = 1 second = 24 frames at 24fps
      const rt: OTIORationalTime = {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 30,
        rate: 30,
      };
      expect(rationalTimeToFrames(rt, 24)).toBe(24);
    });

    it('OTIO-U003c: rescales 48fps source to 24fps timeline', () => {
      // 96 frames at 48fps = 2 seconds = 48 frames at 24fps
      const rt: OTIORationalTime = {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 96,
        rate: 48,
      };
      expect(rationalTimeToFrames(rt, 24)).toBe(48);
    });

    it('OTIO-U003d: rescales 24fps source to 30fps timeline', () => {
      // 24 frames at 24fps = 1 second = 30 frames at 30fps
      const rt: OTIORationalTime = {
        OTIO_SCHEMA: 'RationalTime.1',
        value: 24,
        rate: 24,
      };
      expect(rationalTimeToFrames(rt, 30)).toBe(30);
    });
  });

  describe('timeRangeDurationFrames', () => {
    it('OTIO-U004: returns duration frames from time range when rates match', () => {
      const range: OTIOTimeRange = {
        OTIO_SCHEMA: 'TimeRange.1',
        start_time: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: 10,
          rate: 24,
        },
        duration: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: 100,
          rate: 24,
        },
      };
      expect(timeRangeDurationFrames(range, 24)).toBe(100);
    });

    it('OTIO-U004b: rescales duration when source rate differs from target rate', () => {
      // Duration of 60 frames at 30fps = 2 seconds = 48 frames at 24fps
      const range: OTIOTimeRange = {
        OTIO_SCHEMA: 'TimeRange.1',
        start_time: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: 0,
          rate: 30,
        },
        duration: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: 60,
          rate: 30,
        },
      };
      expect(timeRangeDurationFrames(range, 24)).toBe(48);
    });
  });

  describe('parseOTIO - valid input', () => {
    it('OTIO-U005: parses a valid timeline with a single clip', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [buildClip('shot_01', 0, 48, '/media/shot_01.exr')],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(1);
      expect(result!.fps).toBe(24);
      expect(result!.totalFrames).toBe(48);

      const clip = result!.clips[0]!;
      expect(clip.name).toBe('shot_01');
      expect(clip.sourceUrl).toBe('/media/shot_01.exr');
      expect(clip.inFrame).toBe(0);
      expect(clip.outFrame).toBe(47);
      expect(clip.timelineInFrame).toBe(0);
      expect(clip.timelineOutFrame).toBe(47);
    });

    it('OTIO-U006: parses multiple clips and computes timeline positions', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [
                buildClip('shot_01', 0, 48),
                buildClip('shot_02', 10, 72),
              ],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(2);
      expect(result!.totalFrames).toBe(120); // 48 + 72

      const clip1 = result!.clips[0]!;
      expect(clip1.name).toBe('shot_01');
      expect(clip1.timelineInFrame).toBe(0);
      expect(clip1.timelineOutFrame).toBe(47);

      const clip2 = result!.clips[1]!;
      expect(clip2.name).toBe('shot_02');
      expect(clip2.inFrame).toBe(10);
      expect(clip2.outFrame).toBe(81); // 10 + 72 - 1
      expect(clip2.timelineInFrame).toBe(48);
      expect(clip2.timelineOutFrame).toBe(119);
    });

    it('OTIO-U007: uses global_start_time rate as fps', () => {
      const json = buildOTIOJson({
        global_start_time: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: 0,
          rate: 30,
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.fps).toBe(30);
    });

    it('OTIO-U008: defaults to 24 fps when global_start_time is absent', () => {
      const json = buildOTIOJson({
        global_start_time: undefined,
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.fps).toBe(24);
    });

    it('OTIO-U009: preserves clip metadata', () => {
      const clipWithMeta = buildClip('shot_meta', 0, 24);
      (clipWithMeta as Record<string, unknown>).metadata = {
        artist: 'John',
        version: 3,
      };

      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [clipWithMeta],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips[0]!.metadata).toEqual({
        artist: 'John',
        version: 3,
      });
    });
  });

  describe('parseOTIO - gap handling', () => {
    it('OTIO-U010: gaps advance timeline position', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [
                buildClip('shot_01', 0, 24),
                buildGap(12),
                buildClip('shot_02', 0, 24),
              ],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(2);
      expect(result!.totalFrames).toBe(60); // 24 + 12 (gap) + 24

      const clip2 = result!.clips[1]!;
      expect(clip2.timelineInFrame).toBe(36); // 24 + 12 gap
      expect(clip2.timelineOutFrame).toBe(59);
    });

    it('OTIO-U011: gap at start offsets first clip', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [buildGap(10), buildClip('shot_01', 0, 24)],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(1);
      expect(result!.clips[0]!.timelineInFrame).toBe(10);
      expect(result!.totalFrames).toBe(34); // 10 gap + 24
    });
  });

  describe('parseOTIO - transitions', () => {
    it('OTIO-U012: transitions do not advance timeline position', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [
                buildClip('shot_01', 0, 48),
                {
                  OTIO_SCHEMA: 'Transition.1',
                  name: 'Dissolve',
                  transition_type: 'SMPTE_Dissolve',
                  in_offset: {
                    OTIO_SCHEMA: 'RationalTime.1',
                    value: 6,
                    rate: 24,
                  },
                  out_offset: {
                    OTIO_SCHEMA: 'RationalTime.1',
                    value: 6,
                    rate: 24,
                  },
                },
                buildClip('shot_02', 0, 48),
              ],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(2);
      expect(result!.totalFrames).toBe(96); // 48 + 48, transition doesn't add

      expect(result!.clips[1]!.timelineInFrame).toBe(48);
    });
  });

  describe('parseOTIO - track filtering', () => {
    it('OTIO-U013: ignores audio tracks', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Audio 1',
              kind: 'Audio',
              children: [buildClip('audio_clip', 0, 100)],
            },
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [buildClip('video_clip', 0, 48)],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(1);
      expect(result!.clips[0]!.name).toBe('video_clip');
    });

    it('OTIO-U014: uses only the first video track', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [buildClip('v1_clip', 0, 24)],
            },
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 2',
              kind: 'Video',
              children: [buildClip('v2_clip', 0, 48)],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(1);
      expect(result!.clips[0]!.name).toBe('v1_clip');
    });
  });

  describe('parseOTIO - clip without source_range', () => {
    it('OTIO-U015: falls back to available_range from media_reference', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [
                {
                  OTIO_SCHEMA: 'Clip.1',
                  name: 'full_range_clip',
                  media_reference: {
                    OTIO_SCHEMA: 'ExternalReference.1',
                    target_url: '/media/clip.mov',
                    available_range: {
                      OTIO_SCHEMA: 'TimeRange.1',
                      start_time: {
                        OTIO_SCHEMA: 'RationalTime.1',
                        value: 5,
                        rate: 24,
                      },
                      duration: {
                        OTIO_SCHEMA: 'RationalTime.1',
                        value: 60,
                        rate: 24,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(1);

      const clip = result!.clips[0]!;
      expect(clip.inFrame).toBe(5);
      expect(clip.outFrame).toBe(64); // 5 + 60 - 1
      expect(clip.sourceUrl).toBe('/media/clip.mov');
    });
  });

  describe('parseOTIO - malformed input rejection', () => {
    it('OTIO-U016: returns null for invalid JSON', () => {
      expect(parseOTIO('not valid json {')).toBeNull();
    });

    it('OTIO-U017: returns null for non-object JSON', () => {
      expect(parseOTIO('"just a string"')).toBeNull();
    });

    it('OTIO-U018: returns null for wrong OTIO_SCHEMA', () => {
      expect(
        parseOTIO(
          JSON.stringify({
            OTIO_SCHEMA: 'Clip.1',
            name: 'not a timeline',
          })
        )
      ).toBeNull();
    });

    it('OTIO-U019: returns null when tracks are missing', () => {
      expect(
        parseOTIO(
          JSON.stringify({
            OTIO_SCHEMA: 'Timeline.1',
            name: 'No tracks',
          })
        )
      ).toBeNull();
    });

    it('OTIO-U020: returns null when tracks have wrong schema', () => {
      expect(
        parseOTIO(
          JSON.stringify({
            OTIO_SCHEMA: 'Timeline.1',
            name: 'Bad tracks',
            tracks: {
              OTIO_SCHEMA: 'Track.1',
              children: [],
            },
          })
        )
      ).toBeNull();
    });

    it('OTIO-U021: returns null for array input', () => {
      expect(parseOTIO('[]')).toBeNull();
    });

    it('OTIO-U022: returns null for null input', () => {
      expect(parseOTIO('null')).toBeNull();
    });
  });

  describe('parseOTIO - empty timeline', () => {
    it('OTIO-U023: handles timeline with no tracks', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(0);
      expect(result!.totalFrames).toBe(0);
    });

    it('OTIO-U024: handles video track with no children', () => {
      const json = buildOTIOJson();

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(0);
      expect(result!.totalFrames).toBe(0);
    });

    it('OTIO-U025: handles timeline with only audio tracks', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Audio 1',
              kind: 'Audio',
              children: [buildClip('audio', 0, 100)],
            },
          ],
        },
      });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(0);
      expect(result!.totalFrames).toBe(0);
    });
  });

  describe('parseOTIO - source resolution integration', () => {
    it('OTIO-U026: parsed clips contain data needed for source resolution', () => {
      const json = buildOTIOJson({
        tracks: {
          OTIO_SCHEMA: 'Stack.1',
          name: 'Tracks',
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'Video 1',
              kind: 'Video',
              children: [
                buildClip('shot_01', 10, 48, '/media/shot_01.exr'),
                buildClip('shot_02', 0, 72, '/media/shot_02.dpx'),
              ],
            },
          ],
        },
      });

      const result = parseOTIO(json) as OTIOParseResult;
      expect(result.clips).toHaveLength(2);

      // Verify each clip has the info needed by sourceResolver
      const clip1 = result.clips[0]!;
      expect(clip1.name).toBe('shot_01');
      expect(clip1.sourceUrl).toBe('/media/shot_01.exr');
      expect(clip1.inFrame).toBe(10);
      expect(clip1.outFrame).toBe(57);

      const clip2 = result.clips[1]!;
      expect(clip2.name).toBe('shot_02');
      expect(clip2.sourceUrl).toBe('/media/shot_02.dpx');
      expect(clip2.inFrame).toBe(0);
      expect(clip2.outFrame).toBe(71);
    });
  });
});

// ==========================================================================
// parseOTIOMultiTrack tests
// ==========================================================================

describe('parseOTIOMultiTrack', () => {
  describe('validation', () => {
    it('OTIO-M001: returns null for invalid JSON', () => {
      expect(parseOTIOMultiTrack('not valid json {')).toBeNull();
    });

    it('OTIO-M002: returns null for wrong schema', () => {
      expect(
        parseOTIOMultiTrack(JSON.stringify({ OTIO_SCHEMA: 'Clip.1', name: 'x' }))
      ).toBeNull();
    });

    it('OTIO-M003: returns null when tracks stack is missing', () => {
      expect(
        parseOTIOMultiTrack(JSON.stringify({ OTIO_SCHEMA: 'Timeline.1', name: 'x' }))
      ).toBeNull();
    });
  });

  describe('single track', () => {
    it('OTIO-M004: parses single video track with clips', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48, '/media/shot_01.exr'),
            buildClip('shot_02', 10, 72),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json);
      expect(result).not.toBeNull();
      expect(result!.tracks).toHaveLength(1);
      expect(result!.tracks[0]!.name).toBe('Video 1');
      expect(result!.tracks[0]!.clips).toHaveLength(2);
      expect(result!.clips).toHaveLength(2);
      expect(result!.totalFrames).toBe(120); // 48 + 72
      expect(result!.transitions).toHaveLength(0);
    });
  });

  describe('multiple video tracks', () => {
    it('OTIO-M005: parses two video tracks independently', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [buildClip('v1_clip_a', 0, 48), buildClip('v1_clip_b', 0, 24)],
        },
        {
          name: 'Video 2',
          kind: 'Video',
          children: [buildClip('v2_clip_a', 0, 100)],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.tracks).toHaveLength(2);

      // Track 1
      expect(result.tracks[0]!.name).toBe('Video 1');
      expect(result.tracks[0]!.clips).toHaveLength(2);
      expect(result.tracks[0]!.totalFrames).toBe(72); // 48 + 24

      // Track 2
      expect(result.tracks[1]!.name).toBe('Video 2');
      expect(result.tracks[1]!.clips).toHaveLength(1);
      expect(result.tracks[1]!.totalFrames).toBe(100);

      // Flattened clips
      expect(result.clips).toHaveLength(3);
      expect(result.clips[0]!.name).toBe('v1_clip_a');
      expect(result.clips[1]!.name).toBe('v1_clip_b');
      expect(result.clips[2]!.name).toBe('v2_clip_a');

      // Total frames = max(72, 100) = 100
      expect(result.totalFrames).toBe(100);
    });

    it('OTIO-M006: ignores audio tracks in multi-track parse', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Audio 1',
          kind: 'Audio',
          children: [buildClip('audio_clip', 0, 200)],
        },
        {
          name: 'Video 1',
          kind: 'Video',
          children: [buildClip('video_clip', 0, 48)],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0]!.name).toBe('Video 1');
      expect(result.clips).toHaveLength(1);
      expect(result.clips[0]!.name).toBe('video_clip');
    });

    it('OTIO-M007: handles three video tracks', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'V1',
          kind: 'Video',
          children: [buildClip('v1', 0, 24)],
        },
        {
          name: 'V2',
          kind: 'Video',
          children: [buildClip('v2', 0, 48)],
        },
        {
          name: 'V3',
          kind: 'Video',
          children: [buildClip('v3', 0, 72)],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.tracks).toHaveLength(3);
      expect(result.clips).toHaveLength(3);
      expect(result.totalFrames).toBe(72); // max(24, 48, 72)
    });

    it('OTIO-M008: empty timeline returns zero tracks', () => {
      const json = buildMultiTrackOTIOJson([]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.tracks).toHaveLength(0);
      expect(result.clips).toHaveLength(0);
      expect(result.transitions).toHaveLength(0);
      expect(result.totalFrames).toBe(0);
    });

    it('OTIO-M009: each track has independent timeline positions', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildGap(10),
            buildClip('v1_clip', 0, 24),
          ],
        },
        {
          name: 'Video 2',
          kind: 'Video',
          children: [buildClip('v2_clip', 0, 48)],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      // Track 1: gap(10) + clip(24) = 34 total, clip starts at frame 10
      expect(result.tracks[0]!.clips[0]!.timelineInFrame).toBe(10);
      expect(result.tracks[0]!.totalFrames).toBe(34);

      // Track 2: clip starts at frame 0
      expect(result.tracks[1]!.clips[0]!.timelineInFrame).toBe(0);
      expect(result.tracks[1]!.totalFrames).toBe(48);
    });
  });

  describe('transition parsing', () => {
    it('OTIO-M010: parses SMPTE_Dissolve transition between two clips', () => {
      const json = buildMultiTrackOTIOJson([
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

      const result = parseOTIOMultiTrack(json)!;
      expect(result.clips).toHaveLength(2);
      expect(result.transitions).toHaveLength(1);

      const trans = result.transitions[0]!;
      expect(trans.name).toBe('Dissolve');
      expect(trans.transitionType).toBe('SMPTE_Dissolve');
      expect(trans.inOffset).toBe(6);
      expect(trans.outOffset).toBe(6);
      expect(trans.duration).toBe(12); // 6 + 6
      expect(trans.outgoingClipIndex).toBe(0);
      expect(trans.incomingClipIndex).toBe(1);
    });

    it('OTIO-M011: transition timeline frames are computed correctly', () => {
      // shot_01: frames 0-47 on timeline
      // transition: in_offset=6 means it starts 6 frames before the cut point (frame 48)
      //             out_offset=6 means it ends 6 frames after the cut point
      // shot_02: frames 48-95 on timeline
      const json = buildMultiTrackOTIOJson([
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

      const result = parseOTIOMultiTrack(json)!;
      const trans = result.transitions[0]!;

      // Cut point is at frame 48 (where shot_01 ends and shot_02 begins)
      // Transition starts at 48 - 6 = 42
      expect(trans.timelineInFrame).toBe(42);
      // Transition ends at 42 + 12 - 1 = 53
      expect(trans.timelineOutFrame).toBe(53);
    });

    it('OTIO-M012: transition does not advance timeline position', () => {
      const json = buildMultiTrackOTIOJson([
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

      const result = parseOTIOMultiTrack(json)!;
      // Total frames should be 48 + 48 = 96 (transition doesn't add)
      expect(result.totalFrames).toBe(96);
      expect(result.clips[1]!.timelineInFrame).toBe(48);
    });

    it('OTIO-M013: asymmetric transition offsets (larger in_offset)', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('AsymDiss', 'SMPTE_Dissolve', 12, 4),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      const trans = result.transitions[0]!;
      expect(trans.inOffset).toBe(12);
      expect(trans.outOffset).toBe(4);
      expect(trans.duration).toBe(16);
      // Transition starts at 48 - 12 = 36
      expect(trans.timelineInFrame).toBe(36);
      expect(trans.timelineOutFrame).toBe(51); // 36 + 16 - 1
    });

    it('OTIO-M014: multiple transitions in one track', () => {
      const json = buildMultiTrackOTIOJson([
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

      const result = parseOTIOMultiTrack(json)!;
      expect(result.clips).toHaveLength(3);
      expect(result.transitions).toHaveLength(2);

      // First transition
      const t1 = result.transitions[0]!;
      expect(t1.name).toBe('Diss1');
      expect(t1.outgoingClipIndex).toBe(0);
      expect(t1.incomingClipIndex).toBe(1);
      expect(t1.timelineInFrame).toBe(42); // 48 - 6

      // Second transition
      const t2 = result.transitions[1]!;
      expect(t2.name).toBe('Diss2');
      expect(t2.outgoingClipIndex).toBe(1);
      expect(t2.incomingClipIndex).toBe(2);
      expect(t2.timelineInFrame).toBe(93); // 96 - 3
    });

    it('OTIO-M015: transition with Custom_Transition type', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('Wipe', 'Custom_Transition', 8, 8),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.transitions[0]!.transitionType).toBe('Custom_Transition');
    });

    it('OTIO-M016: unknown transition type defaults to SMPTE_Dissolve', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('UnknownTrans', 'SomeUnknownType', 6, 6),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.transitions[0]!.transitionType).toBe('SMPTE_Dissolve');
    });

    it('OTIO-M017: transition preserves metadata', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('Dissolve', 'SMPTE_Dissolve', 6, 6, 24, {
              artist: 'Jane',
              version: 2,
            }),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.transitions[0]!.metadata).toEqual({
        artist: 'Jane',
        version: 2,
      });
    });

    it('OTIO-M018: transition with zero offsets', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('ZeroDiss', 'SMPTE_Dissolve', 0, 0),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      const trans = result.transitions[0]!;
      expect(trans.inOffset).toBe(0);
      expect(trans.outOffset).toBe(0);
      expect(trans.duration).toBe(0);
      expect(trans.timelineInFrame).toBe(48);
      // timelineOutFrame = 48 + 0 - 1 = 47, which is before timelineInFrame
      // This is valid for a zero-duration transition (a hard cut)
      expect(trans.timelineOutFrame).toBe(47);
    });

    it('OTIO-M019: transition at the start of track (no preceding clip) is dropped', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildTransition('OrphanDiss', 'SMPTE_Dissolve', 6, 6),
            buildClip('shot_01', 0, 48),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.clips).toHaveLength(1);
      // A transition with no outgoing clip (index -1) is dropped as invalid
      expect(result.transitions).toHaveLength(0);
    });

    it('OTIO-M020: transition after the last clip (no following clip) is dropped', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('TrailingDiss', 'SMPTE_Dissolve', 6, 6),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.clips).toHaveLength(1);
      // No incoming clip to resolve the transition, so it's dropped
      expect(result.transitions).toHaveLength(0);
    });

    it('OTIO-M021: transitions in different tracks are independent', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('v1_a', 0, 48),
            buildTransition('V1Diss', 'SMPTE_Dissolve', 6, 6),
            buildClip('v1_b', 0, 48),
          ],
        },
        {
          name: 'Video 2',
          kind: 'Video',
          children: [
            buildClip('v2_a', 0, 100),
            buildTransition('V2Diss', 'SMPTE_Dissolve', 10, 10),
            buildClip('v2_b', 0, 50),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.tracks).toHaveLength(2);

      // Track 1 transitions
      expect(result.tracks[0]!.transitions).toHaveLength(1);
      expect(result.tracks[0]!.transitions[0]!.name).toBe('V1Diss');

      // Track 2 transitions
      expect(result.tracks[1]!.transitions).toHaveLength(1);
      expect(result.tracks[1]!.transitions[0]!.name).toBe('V2Diss');

      // Flattened transitions
      expect(result.transitions).toHaveLength(2);
      expect(result.transitions[0]!.name).toBe('V1Diss');
      expect(result.transitions[1]!.name).toBe('V2Diss');
    });
  });

  describe('gaps with transitions', () => {
    it('OTIO-M022: gap before transition is handled', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildGap(12),
            buildClip('shot_02', 0, 24),
            buildTransition('Diss', 'SMPTE_Dissolve', 4, 4),
            buildClip('shot_03', 0, 36),
          ],
        },
      ]);

      const result = parseOTIOMultiTrack(json)!;
      expect(result.clips).toHaveLength(3);
      expect(result.transitions).toHaveLength(1);

      // shot_01: 0-47, gap: 12 frames, shot_02: 60-83, shot_03: 84-119
      expect(result.clips[0]!.timelineInFrame).toBe(0);
      expect(result.clips[1]!.timelineInFrame).toBe(60);
      expect(result.clips[2]!.timelineInFrame).toBe(84);

      // Transition between shot_02 and shot_03
      const trans = result.transitions[0]!;
      expect(trans.outgoingClipIndex).toBe(1);
      expect(trans.incomingClipIndex).toBe(2);
      // cut point is at 84, inOffset=4, so transition starts at 80
      expect(trans.timelineInFrame).toBe(80);
    });
  });

  describe('fps handling', () => {
    it('OTIO-M023: uses global_start_time rate for multi-track', () => {
      const json = buildMultiTrackOTIOJson(
        [
          {
            name: 'Video 1',
            kind: 'Video',
            children: [buildClip('clip', 0, 30)],
          },
        ],
        {
          global_start_time: {
            OTIO_SCHEMA: 'RationalTime.1',
            value: 0,
            rate: 30,
          },
        }
      );

      const result = parseOTIOMultiTrack(json)!;
      expect(result.fps).toBe(30);
    });

    it('OTIO-M024: defaults to 24fps when global_start_time absent', () => {
      const json = buildMultiTrackOTIOJson(
        [
          {
            name: 'Video 1',
            kind: 'Video',
            children: [buildClip('clip', 0, 48)],
          },
        ],
        { global_start_time: undefined }
      );

      const result = parseOTIOMultiTrack(json)!;
      expect(result.fps).toBe(24);
    });
  });

  describe('backward compatibility', () => {
    it('OTIO-M025: parseOTIO still returns only first track clips', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [buildClip('v1_clip', 0, 24)],
        },
        {
          name: 'Video 2',
          kind: 'Video',
          children: [buildClip('v2_clip', 0, 48)],
        },
      ]);

      const singleResult = parseOTIO(json)!;
      expect(singleResult.clips).toHaveLength(1);
      expect(singleResult.clips[0]!.name).toBe('v1_clip');

      const multiResult = parseOTIOMultiTrack(json)!;
      expect(multiResult.clips).toHaveLength(2);
    });

    it('OTIO-M026: parseOTIOMultiTrack transitions match parseOTIO clip positions', () => {
      const json = buildMultiTrackOTIOJson([
        {
          name: 'Video 1',
          kind: 'Video',
          children: [
            buildClip('shot_01', 0, 48),
            buildTransition('Diss', 'SMPTE_Dissolve', 6, 6),
            buildClip('shot_02', 0, 48),
          ],
        },
      ]);

      const singleResult = parseOTIO(json)!;
      const multiResult = parseOTIOMultiTrack(json)!;

      // Clip positions should be identical
      expect(multiResult.tracks[0]!.clips).toEqual(singleResult.clips);
    });
  });
});
