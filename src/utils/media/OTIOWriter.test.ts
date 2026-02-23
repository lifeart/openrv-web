import { describe, it, expect } from 'vitest';
import {
  exportOTIO,
  exportOTIOMultiTrack,
  buildExportClips,
  type OTIOExportClip,
  type OTIOExportTransition,
} from './OTIOWriter';
import { parseOTIO, parseOTIOMultiTrack } from './OTIOParser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClip(
  name: string,
  sourceUrl: string,
  inPoint: number,
  outPoint: number,
  globalStartFrame: number,
  fps = 24,
): OTIOExportClip {
  return {
    sourceName: name,
    sourceUrl,
    inPoint,
    outPoint,
    globalStartFrame,
    duration: outPoint - inPoint + 1,
    fps,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OTIOWriter', () => {
  describe('exportOTIO', () => {
    it('OTIO-W001: produces valid JSON with Timeline.1 schema', () => {
      const clips = [createClip('shot_A', 'file:///shot_A.exr', 1, 48, 1)];
      const json = exportOTIO(clips, { name: 'Test Timeline', fps: 24 });

      const parsed = JSON.parse(json);
      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.name).toBe('Test Timeline');
      expect(parsed.global_start_time.OTIO_SCHEMA).toBe('RationalTime.1');
      expect(parsed.global_start_time.rate).toBe(24);
      expect(parsed.tracks.OTIO_SCHEMA).toBe('Stack.1');
      expect(parsed.tracks.children).toHaveLength(1);
      expect(parsed.tracks.children[0].OTIO_SCHEMA).toBe('Track.1');
      expect(parsed.tracks.children[0].kind).toBe('Video');
    });

    it('OTIO-W002: clips map to Clip.1 with correct source_range', () => {
      const clips = [
        createClip('shot_A', 'file:///shot_A.exr', 1001, 1048, 1),
        createClip('shot_B', 'file:///shot_B.exr', 1, 120, 49),
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);

      const trackChildren = parsed.tracks.children[0].children;
      expect(trackChildren).toHaveLength(2);

      // First clip
      const clip1 = trackChildren[0];
      expect(clip1.OTIO_SCHEMA).toBe('Clip.1');
      expect(clip1.name).toBe('shot_A');
      expect(clip1.source_range.start_time.value).toBe(1001);
      expect(clip1.source_range.duration.value).toBe(48);
      expect(clip1.source_range.duration.rate).toBe(24);

      // Second clip
      const clip2 = trackChildren[1];
      expect(clip2.OTIO_SCHEMA).toBe('Clip.1');
      expect(clip2.name).toBe('shot_B');
      expect(clip2.source_range.start_time.value).toBe(1);
      expect(clip2.source_range.duration.value).toBe(120);
    });

    it('OTIO-W003: gaps between clips produce Gap.1 entries', () => {
      const clips = [
        createClip('shot_A', 'file:///A.exr', 1, 48, 1),      // frames 1-48
        createClip('shot_B', 'file:///B.exr', 1, 24, 73),      // frames 73-96 (gap at 49-72 = 24 frames)
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);

      const trackChildren = parsed.tracks.children[0].children;
      expect(trackChildren).toHaveLength(3); // clip, gap, clip

      expect(trackChildren[0].OTIO_SCHEMA).toBe('Clip.1');
      expect(trackChildren[1].OTIO_SCHEMA).toBe('Gap.1');
      expect(trackChildren[1].source_range.duration.value).toBe(24);
      expect(trackChildren[2].OTIO_SCHEMA).toBe('Clip.1');
    });

    it('OTIO-W004: round-trip export → import produces equivalent clips', () => {
      const clips = [
        createClip('shot_A', 'file:///A.exr', 1, 48, 1),
        createClip('shot_B', 'file:///B.exr', 1, 120, 49),
      ];
      const json = exportOTIO(clips, { name: 'Round Trip', fps: 24 });

      // Parse back
      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(2);

      // Verify clip A
      expect(result!.clips[0]!.name).toBe('shot_A');
      expect(result!.clips[0]!.sourceUrl).toBe('file:///A.exr');
      expect(result!.clips[0]!.inFrame).toBe(1);
      expect(result!.clips[0]!.outFrame).toBe(48);

      // Verify clip B
      expect(result!.clips[1]!.name).toBe('shot_B');
      expect(result!.clips[1]!.sourceUrl).toBe('file:///B.exr');
      expect(result!.clips[1]!.inFrame).toBe(1);
      expect(result!.clips[1]!.outFrame).toBe(120);
    });

    it('OTIO-W005: handles empty playlist', () => {
      const json = exportOTIO([], { name: 'Empty', fps: 24 });
      const parsed = JSON.parse(json);

      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.name).toBe('Empty');
      const trackChildren = parsed.tracks.children[0].children;
      expect(trackChildren).toHaveLength(0);
    });

    it('OTIO-W006: handles single clip', () => {
      const clips = [createClip('solo', 'file:///solo.exr', 1, 100, 1)];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);

      const trackChildren = parsed.tracks.children[0].children;
      expect(trackChildren).toHaveLength(1);
      expect(trackChildren[0].OTIO_SCHEMA).toBe('Clip.1');
      expect(trackChildren[0].name).toBe('solo');
      expect(trackChildren[0].source_range.duration.value).toBe(100);
    });

    it('OTIO-W007: frame rates preserved correctly', () => {
      const clips = [
        createClip('clip_24fps', 'file:///a.exr', 1, 48, 1, 24),
        createClip('clip_30fps', 'file:///b.exr', 1, 60, 49, 30),
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);

      const trackChildren = parsed.tracks.children[0].children;
      // First clip at 24fps
      expect(trackChildren[0].source_range.start_time.rate).toBe(24);
      expect(trackChildren[0].source_range.duration.rate).toBe(24);
      // Second clip at 30fps
      expect(trackChildren[1].source_range.start_time.rate).toBe(30);
      expect(trackChildren[1].source_range.duration.rate).toBe(30);
    });

    it('OTIO-W008: media_reference uses source URL', () => {
      const clips = [
        createClip('shot', 'file:///path/to/shot_v3.exr', 1, 48, 1),
      ];
      const json = exportOTIO(clips);
      const parsed = JSON.parse(json);

      const clip = parsed.tracks.children[0].children[0];
      expect(clip.media_reference).toBeDefined();
      expect(clip.media_reference.OTIO_SCHEMA).toBe('ExternalReference.1');
      expect(clip.media_reference.target_url).toBe('file:///path/to/shot_v3.exr');
    });

    it('uses default name and fps when options not provided', () => {
      const clips = [createClip('clip', 'file:///c.exr', 1, 24, 1)];
      const json = exportOTIO(clips);
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe('Untitled Timeline');
      expect(parsed.global_start_time.rate).toBe(24);
    });

    it('produces pretty-printed JSON', () => {
      const clips = [createClip('clip', 'file:///c.exr', 1, 24, 1)];
      const json = exportOTIO(clips);
      // Should contain indentation
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('no gap emitted when clips are contiguous', () => {
      const clips = [
        createClip('A', 'file:///a.exr', 1, 48, 1),
        createClip('B', 'file:///b.exr', 1, 24, 49), // starts right after A
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);

      const trackChildren = parsed.tracks.children[0].children;
      expect(trackChildren).toHaveLength(2);
      expect(trackChildren.every((c: any) => c.OTIO_SCHEMA === 'Clip.1')).toBe(true);
    });
  });

  describe('buildExportClips', () => {
    it('builds export clips from playlist data and source lookup', () => {
      const playlistClips = [
        { sourceName: 'shot_A', sourceIndex: 0, inPoint: 1, outPoint: 48, globalStartFrame: 1, duration: 48 },
        { sourceName: 'shot_B', sourceIndex: 1, inPoint: 1, outPoint: 120, globalStartFrame: 49, duration: 120 },
      ];

      const sources: Record<number, { url: string; fps: number }> = {
        0: { url: 'file:///shot_A.exr', fps: 24 },
        1: { url: 'file:///shot_B.exr', fps: 24 },
      };

      const result = buildExportClips(playlistClips, (i) => sources[i] ?? null, 24);

      expect(result).toHaveLength(2);
      expect(result[0]!.sourceName).toBe('shot_A');
      expect(result[0]!.sourceUrl).toBe('file:///shot_A.exr');
      expect(result[0]!.fps).toBe(24);
      expect(result[1]!.sourceName).toBe('shot_B');
      expect(result[1]!.sourceUrl).toBe('file:///shot_B.exr');
    });

    it('falls back to empty URL when source not found', () => {
      const playlistClips = [
        { sourceName: 'lost', sourceIndex: 99, inPoint: 1, outPoint: 24, globalStartFrame: 1, duration: 24 },
      ];

      const result = buildExportClips(playlistClips, () => null, 24);

      expect(result).toHaveLength(1);
      expect(result[0]!.sourceUrl).toBe('');
      expect(result[0]!.fps).toBe(24); // uses defaultFps
    });

    it('uses per-source fps when available', () => {
      const playlistClips = [
        { sourceName: 'clip30', sourceIndex: 0, inPoint: 1, outPoint: 60, globalStartFrame: 1, duration: 60 },
      ];

      const result = buildExportClips(
        playlistClips,
        () => ({ url: 'file:///clip.mov', fps: 30 }),
        24,
      );

      expect(result[0]!.fps).toBe(30);
    });
  });

  // =========================================================================
  // exportOTIOMultiTrack
  // =========================================================================

  describe('exportOTIOMultiTrack', () => {
    it('OTIO-MW001: produces valid Timeline.1 with multiple video tracks', () => {
      const json = exportOTIOMultiTrack({
        name: 'Multi-Track Timeline',
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [createClip('v1_a', 'file:///v1a.exr', 1, 48, 1)],
          },
          {
            name: 'V2',
            clips: [createClip('v2_a', 'file:///v2a.exr', 1, 100, 1)],
          },
        ],
      });

      const parsed = JSON.parse(json);
      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.name).toBe('Multi-Track Timeline');
      expect(parsed.tracks.OTIO_SCHEMA).toBe('Stack.1');
      expect(parsed.tracks.children).toHaveLength(2);
      expect(parsed.tracks.children[0].name).toBe('V1');
      expect(parsed.tracks.children[0].kind).toBe('Video');
      expect(parsed.tracks.children[1].name).toBe('V2');
      expect(parsed.tracks.children[1].kind).toBe('Video');
    });

    it('OTIO-MW002: clips on each track are correct', () => {
      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'Video 1',
            clips: [
              createClip('shot_A', 'file:///A.exr', 1, 48, 1),
              createClip('shot_B', 'file:///B.exr', 1, 24, 49),
            ],
          },
          {
            name: 'Video 2',
            clips: [createClip('overlay', 'file:///overlay.exr', 1, 100, 1)],
          },
        ],
      });

      const parsed = JSON.parse(json);
      const track1 = parsed.tracks.children[0];
      const track2 = parsed.tracks.children[1];

      expect(track1.children).toHaveLength(2);
      expect(track1.children[0].name).toBe('shot_A');
      expect(track1.children[1].name).toBe('shot_B');

      expect(track2.children).toHaveLength(1);
      expect(track2.children[0].name).toBe('overlay');
    });

    it('OTIO-MW003: gaps are generated on each track independently', () => {
      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [
              createClip('A', 'file:///A.exr', 1, 24, 1),
              createClip('B', 'file:///B.exr', 1, 24, 49), // gap at 25-48 = 24 frames
            ],
          },
        ],
      });

      const parsed = JSON.parse(json);
      const children = parsed.tracks.children[0].children;
      expect(children).toHaveLength(3); // clip, gap, clip
      expect(children[0].OTIO_SCHEMA).toBe('Clip.1');
      expect(children[1].OTIO_SCHEMA).toBe('Gap.1');
      expect(children[1].source_range.duration.value).toBe(24);
      expect(children[2].OTIO_SCHEMA).toBe('Clip.1');
    });

    it('OTIO-MW004: transition between clips is emitted as Transition.1', () => {
      const transitions = new Map<number, OTIOExportTransition>();
      transitions.set(0, {
        name: 'Dissolve',
        transitionType: 'SMPTE_Dissolve',
        inOffset: 6,
        outOffset: 6,
        fps: 24,
      });

      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [
              createClip('A', 'file:///A.exr', 1, 48, 1),
              createClip('B', 'file:///B.exr', 1, 48, 49),
            ],
            transitions,
          },
        ],
      });

      const parsed = JSON.parse(json);
      const children = parsed.tracks.children[0].children;
      expect(children).toHaveLength(3); // clip, transition, clip

      expect(children[0].OTIO_SCHEMA).toBe('Clip.1');
      expect(children[0].name).toBe('A');

      expect(children[1].OTIO_SCHEMA).toBe('Transition.1');
      expect(children[1].name).toBe('Dissolve');
      expect(children[1].transition_type).toBe('SMPTE_Dissolve');
      expect(children[1].in_offset.value).toBe(6);
      expect(children[1].in_offset.rate).toBe(24);
      expect(children[1].out_offset.value).toBe(6);
      expect(children[1].out_offset.rate).toBe(24);

      expect(children[2].OTIO_SCHEMA).toBe('Clip.1');
      expect(children[2].name).toBe('B');
    });

    it('OTIO-MW005: multiple transitions in one track', () => {
      const transitions = new Map<number, OTIOExportTransition>();
      transitions.set(0, {
        name: 'Diss1',
        transitionType: 'SMPTE_Dissolve',
        inOffset: 4,
        outOffset: 4,
        fps: 24,
      });
      transitions.set(1, {
        name: 'Diss2',
        transitionType: 'Custom_Transition',
        inOffset: 8,
        outOffset: 8,
        fps: 24,
      });

      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [
              createClip('A', 'file:///A.exr', 1, 48, 1),
              createClip('B', 'file:///B.exr', 1, 48, 49),
              createClip('C', 'file:///C.exr', 1, 24, 97),
            ],
            transitions,
          },
        ],
      });

      const parsed = JSON.parse(json);
      const children = parsed.tracks.children[0].children;
      // clip, transition, clip, transition, clip
      expect(children).toHaveLength(5);
      expect(children[0].OTIO_SCHEMA).toBe('Clip.1');
      expect(children[1].OTIO_SCHEMA).toBe('Transition.1');
      expect(children[1].name).toBe('Diss1');
      expect(children[2].OTIO_SCHEMA).toBe('Clip.1');
      expect(children[3].OTIO_SCHEMA).toBe('Transition.1');
      expect(children[3].name).toBe('Diss2');
      expect(children[3].transition_type).toBe('Custom_Transition');
      expect(children[4].OTIO_SCHEMA).toBe('Clip.1');
    });

    it('OTIO-MW006: transition metadata is preserved', () => {
      const transitions = new Map<number, OTIOExportTransition>();
      transitions.set(0, {
        name: 'MetaDiss',
        transitionType: 'SMPTE_Dissolve',
        inOffset: 6,
        outOffset: 6,
        fps: 24,
        metadata: { curve: 'ease-in-out', version: 1 },
      });

      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [
              createClip('A', 'file:///A.exr', 1, 48, 1),
              createClip('B', 'file:///B.exr', 1, 48, 49),
            ],
            transitions,
          },
        ],
      });

      const parsed = JSON.parse(json);
      const trans = parsed.tracks.children[0].children[1];
      expect(trans.metadata).toEqual({ curve: 'ease-in-out', version: 1 });
    });

    it('OTIO-MW007: transition without metadata omits metadata field', () => {
      const transitions = new Map<number, OTIOExportTransition>();
      transitions.set(0, {
        name: 'Diss',
        transitionType: 'SMPTE_Dissolve',
        inOffset: 6,
        outOffset: 6,
        fps: 24,
      });

      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [
              createClip('A', 'file:///A.exr', 1, 48, 1),
              createClip('B', 'file:///B.exr', 1, 48, 49),
            ],
            transitions,
          },
        ],
      });

      const parsed = JSON.parse(json);
      const trans = parsed.tracks.children[0].children[1];
      expect(trans.metadata).toBeUndefined();
    });

    it('OTIO-MW008: default track names when not provided', () => {
      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          { clips: [createClip('A', 'file:///A.exr', 1, 24, 1)] },
          { clips: [createClip('B', 'file:///B.exr', 1, 24, 1)] },
        ],
      });

      const parsed = JSON.parse(json);
      expect(parsed.tracks.children[0].name).toBe('Video Track 1');
      expect(parsed.tracks.children[1].name).toBe('Video Track 2');
    });

    it('OTIO-MW009: empty tracks array produces empty stack', () => {
      const json = exportOTIOMultiTrack({
        name: 'Empty Multi',
        fps: 24,
        tracks: [],
      });

      const parsed = JSON.parse(json);
      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.tracks.children).toHaveLength(0);
    });

    it('OTIO-MW010: default name and fps when not specified', () => {
      const json = exportOTIOMultiTrack({
        tracks: [
          { clips: [createClip('A', 'file:///A.exr', 1, 24, 1)] },
        ],
      });

      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('Untitled Timeline');
      expect(parsed.global_start_time.rate).toBe(24);
    });

    it('OTIO-MW011: produces pretty-printed JSON', () => {
      const json = exportOTIOMultiTrack({
        tracks: [
          { clips: [createClip('A', 'file:///A.exr', 1, 24, 1)] },
        ],
      });

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  // =========================================================================
  // Round-trip: exportOTIOMultiTrack -> parseOTIOMultiTrack
  // =========================================================================

  describe('multi-track round-trip', () => {
    it('OTIO-RT001: round-trip multi-track export/import preserves clips', () => {
      const json = exportOTIOMultiTrack({
        name: 'Round Trip Multi',
        fps: 24,
        tracks: [
          {
            name: 'Video 1',
            clips: [
              createClip('v1_a', 'file:///v1a.exr', 1, 48, 1),
              createClip('v1_b', 'file:///v1b.exr', 1, 24, 49),
            ],
          },
          {
            name: 'Video 2',
            clips: [createClip('v2_a', 'file:///v2a.exr', 1, 100, 1)],
          },
        ],
      });

      const result = parseOTIOMultiTrack(json)!;
      expect(result).not.toBeNull();
      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[0]!.clips).toHaveLength(2);
      expect(result.tracks[0]!.clips[0]!.name).toBe('v1_a');
      expect(result.tracks[0]!.clips[0]!.sourceUrl).toBe('file:///v1a.exr');
      expect(result.tracks[0]!.clips[1]!.name).toBe('v1_b');
      expect(result.tracks[1]!.clips).toHaveLength(1);
      expect(result.tracks[1]!.clips[0]!.name).toBe('v2_a');
    });

    it('OTIO-RT002: round-trip preserves transitions', () => {
      const transitions = new Map<number, OTIOExportTransition>();
      transitions.set(0, {
        name: 'Dissolve',
        transitionType: 'SMPTE_Dissolve',
        inOffset: 6,
        outOffset: 6,
        fps: 24,
      });

      const json = exportOTIOMultiTrack({
        name: 'Transition Round Trip',
        fps: 24,
        tracks: [
          {
            name: 'Video 1',
            clips: [
              createClip('A', 'file:///A.exr', 0, 47, 1),
              createClip('B', 'file:///B.exr', 0, 47, 49),
            ],
            transitions,
          },
        ],
      });

      const result = parseOTIOMultiTrack(json)!;
      expect(result.transitions).toHaveLength(1);

      const trans = result.transitions[0]!;
      expect(trans.name).toBe('Dissolve');
      expect(trans.transitionType).toBe('SMPTE_Dissolve');
      expect(trans.inOffset).toBe(6);
      expect(trans.outOffset).toBe(6);
      expect(trans.duration).toBe(12);
      expect(trans.outgoingClipIndex).toBe(0);
      expect(trans.incomingClipIndex).toBe(1);
    });

    it('OTIO-RT003: round-trip with gaps and transitions', () => {
      const transitions = new Map<number, OTIOExportTransition>();
      transitions.set(1, {
        name: 'CrossFade',
        transitionType: 'SMPTE_Dissolve',
        inOffset: 4,
        outOffset: 4,
        fps: 24,
      });

      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [
              createClip('A', 'file:///A.exr', 1, 24, 1),      // 24 frames
              createClip('B', 'file:///B.exr', 1, 48, 49),      // gap of 24 frames before, then 48 frames
              createClip('C', 'file:///C.exr', 1, 24, 97),      // 24 frames
            ],
            transitions,
          },
        ],
      });

      const result = parseOTIOMultiTrack(json)!;
      expect(result.clips).toHaveLength(3);
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0]!.name).toBe('CrossFade');
      expect(result.transitions[0]!.outgoingClipIndex).toBe(1);
      expect(result.transitions[0]!.incomingClipIndex).toBe(2);
    });

    it('OTIO-RT004: round-trip with Custom_Transition type', () => {
      const transitions = new Map<number, OTIOExportTransition>();
      transitions.set(0, {
        name: 'Wipe',
        transitionType: 'Custom_Transition',
        inOffset: 10,
        outOffset: 10,
        fps: 24,
      });

      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'V1',
            clips: [
              createClip('A', 'file:///A.exr', 1, 48, 1),
              createClip('B', 'file:///B.exr', 1, 48, 49),
            ],
            transitions,
          },
        ],
      });

      const result = parseOTIOMultiTrack(json)!;
      expect(result.transitions[0]!.transitionType).toBe('Custom_Transition');
    });

    it('OTIO-RT005: round-trip multi-track with transitions on different tracks', () => {
      const t1 = new Map<number, OTIOExportTransition>();
      t1.set(0, {
        name: 'Track1Diss',
        transitionType: 'SMPTE_Dissolve',
        inOffset: 4,
        outOffset: 4,
        fps: 24,
      });

      const t2 = new Map<number, OTIOExportTransition>();
      t2.set(0, {
        name: 'Track2Diss',
        transitionType: 'Custom_Transition',
        inOffset: 8,
        outOffset: 8,
        fps: 24,
      });

      const json = exportOTIOMultiTrack({
        fps: 24,
        tracks: [
          {
            name: 'Video 1',
            clips: [
              createClip('v1_a', 'file:///v1a.exr', 1, 48, 1),
              createClip('v1_b', 'file:///v1b.exr', 1, 48, 49),
            ],
            transitions: t1,
          },
          {
            name: 'Video 2',
            clips: [
              createClip('v2_a', 'file:///v2a.exr', 1, 100, 1),
              createClip('v2_b', 'file:///v2b.exr', 1, 50, 101),
            ],
            transitions: t2,
          },
        ],
      });

      const result = parseOTIOMultiTrack(json)!;
      expect(result.tracks).toHaveLength(2);
      expect(result.transitions).toHaveLength(2);

      // Track 1 transition
      expect(result.tracks[0]!.transitions[0]!.name).toBe('Track1Diss');
      expect(result.tracks[0]!.transitions[0]!.transitionType).toBe('SMPTE_Dissolve');

      // Track 2 transition
      expect(result.tracks[1]!.transitions[0]!.name).toBe('Track2Diss');
      expect(result.tracks[1]!.transitions[0]!.transitionType).toBe('Custom_Transition');
    });
  });
});
