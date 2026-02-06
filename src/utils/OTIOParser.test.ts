/**
 * OTIOParser Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseOTIO,
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
