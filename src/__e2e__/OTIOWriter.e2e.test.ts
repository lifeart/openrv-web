/**
 * OTIOWriter E2E Tests
 *
 * End-to-end tests verifying the OTIO export pipeline from PlaylistManager
 * clips through OTIOWriter conversion to JSON output and download trigger.
 *
 * Covers:
 * - Clip conversion from PlaylistManager to OTIOExportClip
 * - JSON output format (Timeline.1, Track.1, Clip.1, Gap.1)
 * - Download trigger
 * - PlaylistPanel.exportOTIO integration wiring
 * - Round-trip import/export
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportOTIO,
  buildExportClips,
  type OTIOExportClip,
} from '../utils/media/OTIOWriter';
import { parseOTIO } from '../utils/media/OTIOParser';
import { PlaylistManager } from '../core/session/PlaylistManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate what PlaylistPanel.exportOTIO does:
 * map PlaylistClip -> OTIOExportClip with empty sourceUrl.
 */
function playlistClipsToOTIOClips(
  manager: PlaylistManager,
  fps = 24,
): OTIOExportClip[] {
  return manager.getClips().map((clip) => ({
    sourceName: clip.sourceName,
    sourceUrl: '',
    inPoint: clip.inPoint,
    outPoint: clip.outPoint,
    globalStartFrame: clip.globalStartFrame,
    duration: clip.duration,
    fps,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OTIOWriter E2E', () => {
  // =========================================================================
  // Clip conversion from PlaylistManager
  // =========================================================================

  describe('PlaylistClip -> OTIOExportClip conversion', () => {
    let manager: PlaylistManager;

    beforeEach(() => {
      manager = new PlaylistManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('E2E-OTIO-001: single clip maps all fields correctly', () => {
      manager.addClip(0, 'shot_A.exr', 1, 48);
      const otioClips = playlistClipsToOTIOClips(manager, 24);

      expect(otioClips).toHaveLength(1);
      const clip = otioClips[0]!;
      expect(clip.sourceName).toBe('shot_A.exr');
      expect(clip.sourceUrl).toBe('');
      expect(clip.inPoint).toBe(1);
      expect(clip.outPoint).toBe(48);
      expect(clip.globalStartFrame).toBe(1);
      expect(clip.duration).toBe(48);
      expect(clip.fps).toBe(24);
    });

    it('E2E-OTIO-002: multiple clips have contiguous globalStartFrame', () => {
      manager.addClip(0, 'A', 1, 48);   // duration=48
      manager.addClip(1, 'B', 10, 33);  // duration=24
      manager.addClip(2, 'C', 1, 100);  // duration=100

      const otioClips = playlistClipsToOTIOClips(manager, 24);
      expect(otioClips).toHaveLength(3);

      expect(otioClips[0]!.globalStartFrame).toBe(1);
      expect(otioClips[1]!.globalStartFrame).toBe(49);
      expect(otioClips[2]!.globalStartFrame).toBe(73);
    });

    it('E2E-OTIO-003: empty sourceUrl is acceptable for export', () => {
      manager.addClip(0, 'shot', 1, 24);
      const otioClips = playlistClipsToOTIOClips(manager, 24);

      // Export with empty URL should still produce valid JSON
      const json = exportOTIO(otioClips, { fps: 24 });
      const parsed = JSON.parse(json);
      const clip = parsed.tracks.children[0].children[0];
      expect(clip.media_reference.target_url).toBe('');
      expect(clip.media_reference.OTIO_SCHEMA).toBe('ExternalReference.1');
    });

    it('E2E-OTIO-004: fps propagates to source_range rate', () => {
      manager.addClip(0, 'shot', 1, 48);
      const otioClips = playlistClipsToOTIOClips(manager, 30);

      const json = exportOTIO(otioClips, { fps: 30 });
      const parsed = JSON.parse(json);
      const clip = parsed.tracks.children[0].children[0];

      expect(clip.source_range.start_time.rate).toBe(30);
      expect(clip.source_range.duration.rate).toBe(30);
      expect(parsed.global_start_time.rate).toBe(30);
    });
  });

  // =========================================================================
  // JSON output format validation
  // =========================================================================

  describe('OTIO JSON format', () => {
    it('E2E-OTIO-010: output has correct top-level Timeline.1 schema', () => {
      const clips: OTIOExportClip[] = [
        {
          sourceName: 'shot',
          sourceUrl: '',
          inPoint: 1,
          outPoint: 48,
          globalStartFrame: 1,
          duration: 48,
          fps: 24,
        },
      ];
      const json = exportOTIO(clips, { name: 'Test', fps: 24 });
      const parsed = JSON.parse(json);

      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.name).toBe('Test');
      expect(parsed.global_start_time).toEqual({
        OTIO_SCHEMA: 'RationalTime.1',
        value: 0,
        rate: 24,
      });
    });

    it('E2E-OTIO-011: Stack and Track structure is correct', () => {
      const clips: OTIOExportClip[] = [
        {
          sourceName: 'A',
          sourceUrl: '',
          inPoint: 1,
          outPoint: 48,
          globalStartFrame: 1,
          duration: 48,
          fps: 24,
        },
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);

      expect(parsed.tracks.OTIO_SCHEMA).toBe('Stack.1');
      expect(parsed.tracks.children).toHaveLength(1);

      const track = parsed.tracks.children[0];
      expect(track.OTIO_SCHEMA).toBe('Track.1');
      expect(track.name).toBe('Video Track');
      expect(track.kind).toBe('Video');
    });

    it('E2E-OTIO-012: Clip.1 nodes have source_range and media_reference', () => {
      const clips: OTIOExportClip[] = [
        {
          sourceName: 'my_shot',
          sourceUrl: 'file:///path/to/shot.exr',
          inPoint: 100,
          outPoint: 200,
          globalStartFrame: 1,
          duration: 101,
          fps: 24,
        },
      ];
      const json = exportOTIO(clips);
      const parsed = JSON.parse(json);
      const clip = parsed.tracks.children[0].children[0];

      expect(clip.OTIO_SCHEMA).toBe('Clip.1');
      expect(clip.name).toBe('my_shot');
      expect(clip.source_range).toEqual({
        OTIO_SCHEMA: 'TimeRange.1',
        start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 100, rate: 24 },
        duration: { OTIO_SCHEMA: 'RationalTime.1', value: 101, rate: 24 },
      });
      expect(clip.media_reference).toEqual({
        OTIO_SCHEMA: 'ExternalReference.1',
        target_url: 'file:///path/to/shot.exr',
      });
    });

    it('E2E-OTIO-013: Gap.1 nodes inserted for non-contiguous clips', () => {
      const clips: OTIOExportClip[] = [
        {
          sourceName: 'A',
          sourceUrl: '',
          inPoint: 1,
          outPoint: 24,
          globalStartFrame: 1,
          duration: 24,
          fps: 24,
        },
        {
          sourceName: 'B',
          sourceUrl: '',
          inPoint: 1,
          outPoint: 24,
          globalStartFrame: 49, // 24-frame gap
          duration: 24,
          fps: 24,
        },
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);
      const children = parsed.tracks.children[0].children;

      expect(children).toHaveLength(3);
      expect(children[0].OTIO_SCHEMA).toBe('Clip.1');
      expect(children[1].OTIO_SCHEMA).toBe('Gap.1');
      expect(children[1].source_range.duration.value).toBe(24);
      expect(children[2].OTIO_SCHEMA).toBe('Clip.1');
    });

    it('E2E-OTIO-014: no Gap.1 for contiguous clips (from PlaylistManager)', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'A', 1, 48); // duration=48, globalStart=1
      manager.addClip(1, 'B', 1, 24); // duration=24, globalStart=49

      const otioClips = playlistClipsToOTIOClips(manager, 24);
      const json = exportOTIO(otioClips, { fps: 24 });
      const parsed = JSON.parse(json);
      const children = parsed.tracks.children[0].children;

      // PlaylistManager places clips contiguously, so no gaps
      expect(children).toHaveLength(2);
      expect(children.every((c: any) => c.OTIO_SCHEMA === 'Clip.1')).toBe(true);

      manager.dispose();
    });

    it('E2E-OTIO-015: output is pretty-printed JSON', () => {
      const clips: OTIOExportClip[] = [
        {
          sourceName: 'test',
          sourceUrl: '',
          inPoint: 1,
          outPoint: 24,
          globalStartFrame: 1,
          duration: 24,
          fps: 24,
        },
      ];
      const json = exportOTIO(clips);
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  // =========================================================================
  // Full pipeline: PlaylistManager -> OTIO JSON -> download
  // =========================================================================

  describe('full export pipeline', () => {
    let manager: PlaylistManager;

    beforeEach(() => {
      manager = new PlaylistManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('E2E-OTIO-020: full pipeline from PlaylistManager to valid OTIO JSON', () => {
      manager.addClip(0, 'shot_A.exr', 1, 48);
      manager.addClip(1, 'shot_B.mov', 10, 33);

      const otioClips = playlistClipsToOTIOClips(manager, 24);
      const json = exportOTIO(otioClips, {
        name: 'OpenRV Playlist',
        fps: 24,
      });

      // Should be valid JSON
      const parsed = JSON.parse(json);
      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.name).toBe('OpenRV Playlist');

      // Should have 2 clips on a single track
      const track = parsed.tracks.children[0];
      expect(track.children).toHaveLength(2);
      expect(track.children[0].name).toBe('shot_A.exr');
      expect(track.children[1].name).toBe('shot_B.mov');
    });

    it('E2E-OTIO-021: empty playlist produces valid OTIO with empty track', () => {
      const otioClips = playlistClipsToOTIOClips(manager, 24);
      expect(otioClips).toHaveLength(0);

      const json = exportOTIO(otioClips, {
        name: 'OpenRV Playlist',
        fps: 24,
      });
      const parsed = JSON.parse(json);

      expect(parsed.OTIO_SCHEMA).toBe('Timeline.1');
      expect(parsed.tracks.children[0].children).toHaveLength(0);
    });
  });

  // =========================================================================
  // Download trigger (simulating PlaylistPanel.exportOTIO)
  // =========================================================================

  describe('OTIO download trigger', () => {
    let mockClick: ReturnType<typeof vi.fn>;
    let capturedHref: string;
    let capturedDownload: string;

    beforeEach(() => {
      mockClick = vi.fn();
      capturedHref = '';
      capturedDownload = '';

      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(v: string) { capturedHref = v; },
        get href() { return capturedHref; },
        set download(v: string) { capturedDownload = v; },
        get download() { return capturedDownload; },
        click: mockClick,
      } as unknown as HTMLAnchorElement);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-otio-url');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('E2E-OTIO-030: download creates blob, triggers click, and cleans up', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'shot_A', 1, 48);

      const otioClips = playlistClipsToOTIOClips(manager, 24);
      const json = exportOTIO(otioClips, { name: 'OpenRV Playlist', fps: 24 });

      // Simulate PlaylistPanel.exportOTIO download logic
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'playlist.otio';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        URL.revokeObjectURL(url);
      }

      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(capturedDownload).toBe('playlist.otio');
      expect(URL.revokeObjectURL).toHaveBeenCalled();

      manager.dispose();
    });

    it('E2E-OTIO-031: blob type is application/json', () => {
      const json = exportOTIO([], { fps: 24 });
      const blob = new Blob([json], { type: 'application/json' });
      expect(blob.type).toBe('application/json');
    });
  });

  // =========================================================================
  // Round-trip: PlaylistManager -> export -> import
  // =========================================================================

  describe('round-trip export/import', () => {
    it('E2E-OTIO-040: exported OTIO can be parsed back', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'shot_A', 1, 48);
      manager.addClip(1, 'shot_B', 10, 33);

      const otioClips = playlistClipsToOTIOClips(manager, 24);
      const json = exportOTIO(otioClips, { name: 'Round Trip', fps: 24 });

      const result = parseOTIO(json);
      expect(result).not.toBeNull();
      expect(result!.clips).toHaveLength(2);

      expect(result!.clips[0]!.name).toBe('shot_A');
      expect(result!.clips[0]!.inFrame).toBe(1);
      expect(result!.clips[0]!.outFrame).toBe(48);

      expect(result!.clips[1]!.name).toBe('shot_B');
      expect(result!.clips[1]!.inFrame).toBe(10);
      expect(result!.clips[1]!.outFrame).toBe(33);

      manager.dispose();
    });

    it('E2E-OTIO-041: round-trip with fromOTIO re-imports correctly', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'clip_A', 1, 48);
      manager.addClip(1, 'clip_B', 10, 57);

      const otioClips = playlistClipsToOTIOClips(manager, 24);
      const json = exportOTIO(otioClips, { name: 'Test', fps: 24 });

      // Import into a new manager
      const importManager = new PlaylistManager();
      const imported = importManager.fromOTIO(json, (name) => {
        if (name === 'clip_A') return { index: 0, frameCount: 100 };
        if (name === 'clip_B') return { index: 1, frameCount: 100 };
        return null;
      });

      expect(imported).toBe(2);
      const clips = importManager.getClips();
      expect(clips[0]!.sourceName).toBe('clip_A');
      expect(clips[0]!.inPoint).toBe(1);
      expect(clips[0]!.outPoint).toBe(48);

      expect(clips[1]!.sourceName).toBe('clip_B');
      expect(clips[1]!.inPoint).toBe(10);
      expect(clips[1]!.outPoint).toBe(57);

      manager.dispose();
      importManager.dispose();
    });
  });

  // =========================================================================
  // buildExportClips bridge function
  // =========================================================================

  describe('buildExportClips integration', () => {
    it('E2E-OTIO-050: builds from PlaylistManager clips with source lookup', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'shot_A', 1, 48);
      manager.addClip(1, 'shot_B', 10, 33);

      const playlistClips = manager.getClips();
      const result = buildExportClips(
        playlistClips,
        (index) => {
          const sources: Record<number, { url: string; fps: number }> = {
            0: { url: 'file:///shot_A.exr', fps: 24 },
            1: { url: 'file:///shot_B.mov', fps: 30 },
          };
          return sources[index] ?? null;
        },
        24,
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.sourceUrl).toBe('file:///shot_A.exr');
      expect(result[0]!.fps).toBe(24);
      expect(result[1]!.sourceUrl).toBe('file:///shot_B.mov');
      expect(result[1]!.fps).toBe(30);

      manager.dispose();
    });

    it('E2E-OTIO-051: unknown sources get empty URL and default fps', () => {
      const manager = new PlaylistManager();
      manager.addClip(99, 'unknown', 1, 24);

      const playlistClips = manager.getClips();
      const result = buildExportClips(
        playlistClips,
        () => null,
        24,
      );

      expect(result[0]!.sourceUrl).toBe('');
      expect(result[0]!.fps).toBe(24);

      manager.dispose();
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('E2E-OTIO-060: single-frame clip', () => {
      const clips: OTIOExportClip[] = [
        {
          sourceName: 'single_frame',
          sourceUrl: '',
          inPoint: 50,
          outPoint: 50,
          globalStartFrame: 1,
          duration: 1,
          fps: 24,
        },
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);
      const clip = parsed.tracks.children[0].children[0];

      expect(clip.source_range.start_time.value).toBe(50);
      expect(clip.source_range.duration.value).toBe(1);
    });

    it('E2E-OTIO-061: large number of clips', () => {
      const clips: OTIOExportClip[] = Array.from({ length: 100 }, (_, i) => ({
        sourceName: `clip_${i}`,
        sourceUrl: '',
        inPoint: 1,
        outPoint: 24,
        globalStartFrame: i * 24 + 1,
        duration: 24,
        fps: 24,
      }));

      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);
      const children = parsed.tracks.children[0].children;

      expect(children).toHaveLength(100);
      // No gaps since contiguous
      expect(children.every((c: any) => c.OTIO_SCHEMA === 'Clip.1')).toBe(true);
    });

    it('E2E-OTIO-062: mixed fps clips', () => {
      const clips: OTIOExportClip[] = [
        {
          sourceName: 'clip24',
          sourceUrl: '',
          inPoint: 1,
          outPoint: 48,
          globalStartFrame: 1,
          duration: 48,
          fps: 24,
        },
        {
          sourceName: 'clip30',
          sourceUrl: '',
          inPoint: 1,
          outPoint: 60,
          globalStartFrame: 49,
          duration: 60,
          fps: 30,
        },
      ];
      const json = exportOTIO(clips, { fps: 24 });
      const parsed = JSON.parse(json);
      const children = parsed.tracks.children[0].children;

      expect(children[0].source_range.start_time.rate).toBe(24);
      expect(children[1].source_range.start_time.rate).toBe(30);
    });
  });
});
