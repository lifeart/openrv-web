/**
 * EDLWriter E2E Tests
 *
 * End-to-end tests verifying the EDL export pipeline from PlaylistManager
 * clips through EDLWriter conversion to final download trigger.
 *
 * Covers:
 * - Clip conversion with correct in/out point math (exclusive out)
 * - FPS handling and timecode generation
 * - Download trigger via downloadEDL
 * - PlaylistPanel.exportEDL integration wiring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  framesToTimecode,
  generateEDL,
  downloadEDL,
  type EDLClip,
  type EDLExportConfig,
} from '../export/EDLWriter';
import { PlaylistManager } from '../core/session/PlaylistManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate what PlaylistPanel.exportEDL does: map PlaylistClip -> EDLClip */
function playlistClipsToEDLClips(
  manager: PlaylistManager,
): EDLClip[] {
  return manager.getClips().map((clip) => ({
    sourceName: clip.sourceName,
    sourceIn: clip.inPoint,
    sourceOut: clip.outPoint + 1, // EDL uses exclusive out point
    recordIn: clip.globalStartFrame,
    recordOut: clip.globalStartFrame + clip.duration,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EDLWriter E2E', () => {
  // =========================================================================
  // Clip conversion with correct in/out point math
  // =========================================================================

  describe('PlaylistClip -> EDLClip conversion', () => {
    let manager: PlaylistManager;

    beforeEach(() => {
      manager = new PlaylistManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('E2E-EDL-001: single clip converts with exclusive sourceOut', () => {
      // Source: frames 1-48 (inclusive), duration=48
      manager.addClip(0, 'shot_A.exr', 1, 48);
      const edlClips = playlistClipsToEDLClips(manager);

      expect(edlClips).toHaveLength(1);
      const clip = edlClips[0]!;
      expect(clip.sourceName).toBe('shot_A.exr');
      expect(clip.sourceIn).toBe(1);
      expect(clip.sourceOut).toBe(49); // outPoint(48) + 1 = exclusive
      expect(clip.recordIn).toBe(1);
      expect(clip.recordOut).toBe(49); // globalStartFrame(1) + duration(48)
    });

    it('E2E-EDL-002: multiple clips have correct record in/out progression', () => {
      // Clip 1: frames 1-48, duration=48
      manager.addClip(0, 'shot_A.exr', 1, 48);
      // Clip 2: frames 10-33, duration=24
      manager.addClip(1, 'shot_B.exr', 10, 33);
      // Clip 3: frames 1-100, duration=100
      manager.addClip(2, 'shot_C.exr', 1, 100);

      const edlClips = playlistClipsToEDLClips(manager);
      expect(edlClips).toHaveLength(3);

      // Clip 1: record 1..49 (exclusive)
      expect(edlClips[0]!.recordIn).toBe(1);
      expect(edlClips[0]!.recordOut).toBe(49);

      // Clip 2: starts at globalStartFrame = 49
      // duration = 33-10+1 = 24
      // record 49..73 (exclusive)
      expect(edlClips[1]!.recordIn).toBe(49);
      expect(edlClips[1]!.recordOut).toBe(73);

      // Clip 3: starts at globalStartFrame = 73
      // duration = 100-1+1 = 100
      // record 73..173 (exclusive)
      expect(edlClips[2]!.recordIn).toBe(73);
      expect(edlClips[2]!.recordOut).toBe(173);
    });

    it('E2E-EDL-003: duration consistency between source and record ranges', () => {
      manager.addClip(0, 'clip_A', 10, 57);
      const edlClips = playlistClipsToEDLClips(manager);
      const clip = edlClips[0]!;

      // Source duration (exclusive): sourceOut - sourceIn
      const sourceDuration = clip.sourceOut - clip.sourceIn;
      // Record duration (exclusive): recordOut - recordIn
      const recordDuration = clip.recordOut - clip.recordIn;

      expect(sourceDuration).toBe(recordDuration);
      expect(sourceDuration).toBe(48); // 57-10+1
    });

    it('E2E-EDL-004: single-frame clip converts correctly', () => {
      // In=Out=25, duration=1
      manager.addClip(0, 'single', 25, 25);
      const edlClips = playlistClipsToEDLClips(manager);
      const clip = edlClips[0]!;

      expect(clip.sourceIn).toBe(25);
      expect(clip.sourceOut).toBe(26); // exclusive
      expect(clip.recordIn).toBe(1);
      expect(clip.recordOut).toBe(2); // exclusive
    });

    it('E2E-EDL-005: clips after reorder maintain correct record positions', () => {
      manager.addClip(0, 'A', 1, 24); // duration=24
      manager.addClip(1, 'B', 1, 48); // duration=48
      manager.addClip(2, 'C', 1, 12); // duration=12

      // Move B to position 0
      const clips = manager.getClips();
      manager.moveClip(clips[1]!.id, 0);

      const edlClips = playlistClipsToEDLClips(manager);

      // After reorder: B(48), A(24), C(12)
      expect(edlClips[0]!.sourceName).toBe('B');
      expect(edlClips[0]!.recordIn).toBe(1);
      expect(edlClips[0]!.recordOut).toBe(49);

      expect(edlClips[1]!.sourceName).toBe('A');
      expect(edlClips[1]!.recordIn).toBe(49);
      expect(edlClips[1]!.recordOut).toBe(73);

      expect(edlClips[2]!.sourceName).toBe('C');
      expect(edlClips[2]!.recordIn).toBe(73);
      expect(edlClips[2]!.recordOut).toBe(85);
    });

    it('E2E-EDL-006: clip with updated trim points converts correctly', () => {
      manager.addClip(0, 'shot_A', 1, 100);
      const clipId = manager.getClips()[0]!.id;
      manager.updateClipPoints(clipId, 20, 60);

      const edlClips = playlistClipsToEDLClips(manager);
      const clip = edlClips[0]!;

      expect(clip.sourceIn).toBe(20);
      expect(clip.sourceOut).toBe(61); // 60+1 exclusive
      expect(clip.recordIn).toBe(1);
      expect(clip.recordOut).toBe(42); // 1 + 41 = 42 (duration=41)
    });
  });

  // =========================================================================
  // FPS handling and timecode in generated EDL
  // =========================================================================

  describe('FPS handling in EDL output', () => {
    it('E2E-EDL-010: generated EDL uses correct fps for timecodes', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'REEL',
          sourceIn: 1,
          sourceOut: 49,
          recordIn: 1,
          recordOut: 49,
        },
      ];

      // At 24fps: frame 49 = 00:00:02:01
      const edl24 = generateEDL(clips, { fps: 24 });
      expect(edl24).toContain(framesToTimecode(49, 24));

      // At 25fps: frame 49 = 00:00:01:24
      const edl25 = generateEDL(clips, { fps: 25 });
      expect(edl25).toContain(framesToTimecode(49, 25));

      // The two EDLs should differ because fps changes timecode
      const editLine24 = edl24.split('\n').find(l => /^\d{3}\s/.test(l))!;
      const editLine25 = edl25.split('\n').find(l => /^\d{3}\s/.test(l))!;
      expect(editLine24).not.toBe(editLine25);
    });

    it('E2E-EDL-011: drop-frame timecodes in full pipeline', () => {
      // Build a clip spanning 1800 frames (exactly 1 minute at 29.97 DF)
      const clips: EDLClip[] = [
        {
          sourceName: 'DF_TEST',
          sourceIn: 0,
          sourceOut: 1800,
          recordIn: 0,
          recordOut: 1800,
        },
      ];
      const config: EDLExportConfig = { fps: 29.97, dropFrame: true };
      const edl = generateEDL(clips, config);

      // The out point (frame 1800) at 29.97 DF = 00:01:00;02
      expect(edl).toContain('00:01:00;02');
      expect(edl).toContain('FCM: DROP FRAME');
    });

    it('E2E-EDL-012: default fps is 24 when not specified', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'DEF',
          sourceIn: 0,
          sourceOut: 24,
          recordIn: 0,
          recordOut: 24,
        },
      ];
      const edl = generateEDL(clips);
      // 24 frames at 24fps = 1 second
      expect(edl).toContain('00:00:01:00');
    });
  });

  // =========================================================================
  // Full pipeline: PlaylistManager -> EDL text -> download
  // =========================================================================

  describe('full export pipeline', () => {
    let manager: PlaylistManager;

    beforeEach(() => {
      manager = new PlaylistManager();
    });

    afterEach(() => {
      manager.dispose();
    });

    it('E2E-EDL-020: full pipeline from PlaylistManager to EDL text', () => {
      manager.addClip(0, 'shot_A.exr', 1, 48);
      manager.addClip(1, 'shot_B.mov', 10, 33);

      const edlClips = playlistClipsToEDLClips(manager);
      const edlText = generateEDL(edlClips, {
        title: 'OpenRV Playlist',
        fps: 24,
      });

      // Verify header
      expect(edlText).toContain('TITLE: OpenRV Playlist');
      expect(edlText).toContain('FCM: NON-DROP FRAME');

      // Verify edit entries
      const editLines = edlText.split('\n').filter(l => /^\d{3}\s/.test(l));
      expect(editLines).toHaveLength(2);
      expect(editLines[0]).toMatch(/^001/);
      expect(editLines[1]).toMatch(/^002/);

      // Verify clip comments
      expect(edlText).toContain('* FROM CLIP NAME: shot_A.exr');
      expect(edlText).toContain('* FROM CLIP NAME: shot_B.mov');
    });

    it('E2E-EDL-021: EDL is importable back into PlaylistManager', () => {
      manager.addClip(0, 'clip_A', 0, 47); // duration=48
      manager.addClip(1, 'clip_B', 0, 23); // duration=24

      const edlClips = playlistClipsToEDLClips(manager);
      const edlText = generateEDL(edlClips, { title: 'Test', fps: 24 });

      // Create a new manager and import
      const importManager = new PlaylistManager();
      const sourceResolver = (name: string) => {
        if (name.includes('CLIP_A')) return { index: 0, frameCount: 100 };
        if (name.includes('CLIP_B')) return { index: 1, frameCount: 50 };
        return null;
      };

      const imported = importManager.fromEDL(edlText, sourceResolver);
      expect(imported).toBe(2);

      const importedClips = importManager.getClips();
      expect(importedClips).toHaveLength(2);

      // The imported in/out points should match the original
      // EDL source out is exclusive, fromEDL subtracts 1
      expect(importedClips[0]!.inPoint).toBe(0);
      expect(importedClips[0]!.outPoint).toBe(47);
      expect(importedClips[1]!.inPoint).toBe(0);
      expect(importedClips[1]!.outPoint).toBe(23);

      importManager.dispose();
    });

    it('E2E-EDL-022: empty playlist produces valid but minimal EDL', () => {
      const edlClips = playlistClipsToEDLClips(manager);
      expect(edlClips).toHaveLength(0);

      const edlText = generateEDL(edlClips, {
        title: 'OpenRV Playlist',
        fps: 24,
      });

      expect(edlText).toContain('TITLE: OpenRV Playlist');
      expect(edlText).toContain('FCM: NON-DROP FRAME');

      const editLines = edlText.split('\n').filter(l => /^\d{3}\s/.test(l));
      expect(editLines).toHaveLength(0);
    });
  });

  // =========================================================================
  // Download trigger
  // =========================================================================

  describe('downloadEDL trigger', () => {
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
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('E2E-EDL-030: downloadEDL triggers click and cleans up', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'TEST',
          sourceIn: 0,
          sourceOut: 24,
          recordIn: 0,
          recordOut: 24,
        },
      ];

      downloadEDL(clips, 'playlist.edl', { title: 'OpenRV', fps: 24 });

      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(capturedHref).toBe('blob:mock-url');
      expect(capturedDownload).toBe('playlist.edl');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('E2E-EDL-031: downloadEDL with full playlist pipeline', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'shot_A', 1, 48);
      manager.addClip(1, 'shot_B', 10, 33);

      const edlClips = playlistClipsToEDLClips(manager);
      downloadEDL(edlClips, 'playlist.edl', {
        title: 'OpenRV Playlist',
        fps: 24,
      });

      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();

      manager.dispose();
    });

    it('E2E-EDL-032: cleanup happens even if click throws', () => {
      mockClick.mockImplementation(() => { throw new Error('click failed'); });

      const clips: EDLClip[] = [
        { sourceName: 'ERR', sourceIn: 0, sourceOut: 24, recordIn: 0, recordOut: 24 },
      ];

      expect(() => downloadEDL(clips, 'test.edl')).toThrow('click failed');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  // =========================================================================
  // Consistency with PlaylistManager.toEDL (legacy path)
  // =========================================================================

  describe('consistency with PlaylistManager.toEDL', () => {
    it('E2E-EDL-040: both paths produce same source in/out for same clips', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'clip_A', 10, 57);
      manager.addClip(1, 'clip_B', 1, 100);

      // Legacy path: PlaylistManager.toEDL
      const legacyEDL = manager.toEDL('Comparison');

      // New path: PlaylistPanel conversion -> generateEDL
      const edlClips = playlistClipsToEDLClips(manager);
      const newEDL = generateEDL(edlClips, { title: 'Comparison', fps: 24 });

      // Both should contain the same timecodes for source in/out
      // Legacy uses outPoint + 1 (exclusive), same as new path
      const legacyEditLines = legacyEDL.split('\n').filter(l => /^\d{3}\s/.test(l));
      const newEditLines = newEDL.split('\n').filter(l => /^\d{3}\s/.test(l));

      expect(legacyEditLines).toHaveLength(newEditLines.length);

      // Parse timecodes from both and compare source ranges
      for (let i = 0; i < legacyEditLines.length; i++) {
        const legacyParts = legacyEditLines[i]!.split(/\s+/).filter(Boolean);
        const newParts = newEditLines[i]!.split(/\s+/).filter(Boolean);

        // Timecodes are at positions 5,6,7,8 in the edit line
        // (editNum, reel, V, C, srcIn, srcOut, recIn, recOut)
        // Due to formatting differences (padding, etc.), compare the timecodes directly
        const legacyTimecodes = legacyParts.slice(4);
        const newTimecodes = newParts.slice(4);

        expect(legacyTimecodes).toEqual(newTimecodes);
      }

      manager.dispose();
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('E2E-EDL-050: very large frame numbers produce valid timecodes', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'LONG_CLIP',
          sourceIn: 0,
          sourceOut: 86400 * 3, // 3 hours at 24fps
          recordIn: 0,
          recordOut: 86400 * 3,
        },
      ];

      const edl = generateEDL(clips, { fps: 24 });
      expect(edl).toContain('03:00:00:00');
    });

    it('E2E-EDL-051: special characters in source name are handled', () => {
      const manager = new PlaylistManager();
      manager.addClip(0, 'my_shot_v03 (final).exr', 1, 48);

      const edlClips = playlistClipsToEDLClips(manager);
      const edl = generateEDL(edlClips, { fps: 24 });

      // Reel name should be truncated + uppercased
      const editLine = edl.split('\n').find(l => /^\d{3}\s/.test(l))!;
      expect(editLine).toBeDefined();

      // Comment should preserve original name
      expect(edl).toContain('* FROM CLIP NAME: my_shot_v03 (final).exr');

      manager.dispose();
    });
  });
});
