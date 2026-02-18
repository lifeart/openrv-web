import { describe, it, expect } from 'vitest';
import {
  exportOTIO,
  buildExportClips,
  type OTIOExportClip,
} from './OTIOWriter';
import { parseOTIO } from './OTIOParser';

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
});
