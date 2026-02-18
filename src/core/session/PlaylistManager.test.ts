import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaylistManager, PlaylistState } from './PlaylistManager';

describe('PlaylistManager', () => {
  let manager: PlaylistManager;

  beforeEach(() => {
    manager = new PlaylistManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('addClip', () => {
    it('should add a clip with correct properties', () => {
      const clip = manager.addClip(0, 'Source 1', 1, 100);

      expect(clip.id).toMatch(/^clip-\d+$/);
      expect(clip.sourceIndex).toBe(0);
      expect(clip.sourceName).toBe('Source 1');
      expect(clip.inPoint).toBe(1);
      expect(clip.outPoint).toBe(100);
      expect(clip.duration).toBe(100);
      expect(clip.globalStartFrame).toBe(1);
    });

    it('should calculate globalStartFrame based on existing clips', () => {
      manager.addClip(0, 'Source 1', 1, 50); // 50 frames
      const clip2 = manager.addClip(1, 'Source 2', 1, 30); // 30 frames

      expect(clip2.globalStartFrame).toBe(51);
    });

    it('should emit clipsChanged event', () => {
      const callback = vi.fn();
      manager.on('clipsChanged', callback);

      manager.addClip(0, 'Source 1', 1, 100);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ clips: expect.any(Array) });
    });
  });

  describe('removeClip', () => {
    it('should remove a clip by ID', () => {
      const clip = manager.addClip(0, 'Source 1', 1, 100);
      expect(manager.getClipCount()).toBe(1);

      const result = manager.removeClip(clip.id);

      expect(result).toBe(true);
      expect(manager.getClipCount()).toBe(0);
    });

    it('should return false for non-existent clip', () => {
      const result = manager.removeClip('non-existent');
      expect(result).toBe(false);
    });

    it('should recalculate global frames after removal', () => {
      const clip1 = manager.addClip(0, 'Source 1', 1, 50);
      manager.addClip(1, 'Source 2', 1, 30);
      manager.addClip(2, 'Source 3', 1, 20);

      manager.removeClip(clip1.id);

      const clips = manager.getClips();
      expect(clips[0]?.globalStartFrame).toBe(1);
      expect(clips[1]?.globalStartFrame).toBe(31);
    });
  });

  describe('moveClip', () => {
    it('should move a clip to a new position', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      const clip2 = manager.addClip(1, 'Source 2', 1, 30);
      manager.addClip(2, 'Source 3', 1, 20);

      const result = manager.moveClip(clip2.id, 0);

      expect(result).toBe(true);
      const clips = manager.getClips();
      expect(clips[0]?.sourceName).toBe('Source 2');
      expect(clips[1]?.sourceName).toBe('Source 1');
    });

    it('should return false for non-existent clip', () => {
      const result = manager.moveClip('non-existent', 0);
      expect(result).toBe(false);
    });

    it('should clamp new index to valid range', () => {
      const clip1 = manager.addClip(0, 'Source 1', 1, 50);
      manager.addClip(1, 'Source 2', 1, 30);

      manager.moveClip(clip1.id, 100); // Way out of bounds

      const clips = manager.getClips();
      expect(clips[1]?.sourceName).toBe('Source 1');
    });
  });

  describe('getClipAtFrame', () => {
    it('should return correct clip and local frame', () => {
      manager.addClip(0, 'Source 1', 10, 59); // 50 frames, global 1-50
      manager.addClip(1, 'Source 2', 1, 30);  // 30 frames, global 51-80

      // Frame 25 is in first clip
      let mapping = manager.getClipAtFrame(25);
      expect(mapping?.clipIndex).toBe(0);
      expect(mapping?.localFrame).toBe(34); // 10 + (25 - 1)

      // Frame 60 is in second clip
      mapping = manager.getClipAtFrame(60);
      expect(mapping?.clipIndex).toBe(1);
      expect(mapping?.localFrame).toBe(10); // 1 + (60 - 51)
    });

    it('should return null for frame outside playlist', () => {
      manager.addClip(0, 'Source 1', 1, 50);

      const mapping = manager.getClipAtFrame(100);
      expect(mapping).toBeNull();
    });
  });

  describe('getNextFrame', () => {
    beforeEach(() => {
      manager.addClip(0, 'Source 1', 1, 50); // Global 1-50
      manager.addClip(1, 'Source 2', 1, 30); // Global 51-80
    });

    it('should advance within a clip', () => {
      const result = manager.getNextFrame(25);
      expect(result.frame).toBe(26);
      expect(result.clipChanged).toBe(false);
    });

    it('should transition to next clip at boundary', () => {
      const result = manager.getNextFrame(50);
      expect(result.frame).toBe(51);
      expect(result.clipChanged).toBe(true);
    });

    it('should loop single clip when loopMode is single', () => {
      manager.setLoopMode('single');
      const result = manager.getNextFrame(50);
      expect(result.frame).toBe(1);
      expect(result.clipChanged).toBe(false);
    });

    it('should loop all clips when loopMode is all', () => {
      manager.setLoopMode('all');
      const result = manager.getNextFrame(80); // End of playlist
      expect(result.frame).toBe(1);
      expect(result.clipChanged).toBe(true);
    });

    it('should emit playlistEnded when reaching end with no loop', () => {
      const callback = vi.fn();
      manager.on('playlistEnded', callback);
      manager.setLoopMode('none');

      manager.getNextFrame(80);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPreviousFrame', () => {
    beforeEach(() => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.addClip(1, 'Source 2', 1, 30);
    });

    it('should go back within a clip', () => {
      const result = manager.getPreviousFrame(60);
      expect(result.frame).toBe(59);
      expect(result.clipChanged).toBe(false);
    });

    it('should transition to previous clip at boundary', () => {
      const result = manager.getPreviousFrame(51);
      expect(result.frame).toBe(50);
      expect(result.clipChanged).toBe(true);
    });

    it('should stay at frame 1 at beginning with no loop', () => {
      const result = manager.getPreviousFrame(1);
      expect(result.frame).toBe(1);
      expect(result.clipChanged).toBe(false);
    });

    it('should loop to end when at frame 1 with loop all', () => {
      manager.setLoopMode('all');
      const result = manager.getPreviousFrame(1);
      expect(result.frame).toBe(80);
      expect(result.clipChanged).toBe(true);
    });
  });

  describe('getTotalDuration', () => {
    it('should return 0 for empty playlist', () => {
      expect(manager.getTotalDuration()).toBe(0);
    });

    it('should sum all clip durations', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // 50 frames
      manager.addClip(1, 'Source 2', 1, 30);  // 30 frames
      manager.addClip(2, 'Source 3', 10, 29); // 20 frames

      expect(manager.getTotalDuration()).toBe(100);
    });
  });

  describe('setEnabled / isEnabled', () => {
    it('should toggle enabled state', () => {
      expect(manager.isEnabled()).toBe(false);

      manager.setEnabled(true);
      expect(manager.isEnabled()).toBe(true);

      manager.setEnabled(false);
      expect(manager.isEnabled()).toBe(false);
    });

    it('should emit enabledChanged event', () => {
      const callback = vi.fn();
      manager.on('enabledChanged', callback);

      manager.setEnabled(true);

      expect(callback).toHaveBeenCalledWith({ enabled: true });
    });
  });

  describe('setLoopMode / getLoopMode', () => {
    it('should set and get loop mode', () => {
      expect(manager.getLoopMode()).toBe('none');

      manager.setLoopMode('single');
      expect(manager.getLoopMode()).toBe('single');

      manager.setLoopMode('all');
      expect(manager.getLoopMode()).toBe('all');
    });

    it('should emit loopModeChanged event', () => {
      const callback = vi.fn();
      manager.on('loopModeChanged', callback);

      manager.setLoopMode('all');

      expect(callback).toHaveBeenCalledWith({ mode: 'all' });
    });
  });

  describe('getState / setState', () => {
    it('should get current state', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.setEnabled(true);
      manager.setLoopMode('all');

      const state = manager.getState();

      expect(state.clips.length).toBe(1);
      expect(state.enabled).toBe(true);
      expect(state.loopMode).toBe('all');
    });

    it('should restore state', () => {
      const savedState: PlaylistState = {
        clips: [
          { id: 'clip-1', sourceIndex: 0, sourceName: 'Test', inPoint: 1, outPoint: 100, globalStartFrame: 1, duration: 100 },
        ],
        enabled: true,
        currentFrame: 50,
        loopMode: 'single',
      };

      manager.setState(savedState);

      expect(manager.getClipCount()).toBe(1);
      expect(manager.isEnabled()).toBe(true);
      expect(manager.getLoopMode()).toBe('single');
      expect(manager.getCurrentFrame()).toBe(50);
    });
  });

  describe('toEDL', () => {
    it('should export empty EDL for empty playlist', () => {
      const edl = manager.toEDL();
      expect(edl).toContain('TITLE:');
      expect(edl).toContain('FCM: NON-DROP FRAME');
      // No edit entries
      expect(edl.split('\n').filter(l => l.match(/^\d{3}/))).toHaveLength(0);
    });

    it('should export clips in EDL format', () => {
      manager.addClip(0, 'SourceA', 1, 48);
      manager.addClip(1, 'SourceB', 25, 72);

      const edl = manager.toEDL('My Playlist');

      expect(edl).toContain('TITLE: My Playlist');
      expect(edl).toContain('001');
      expect(edl).toContain('002');
      expect(edl).toContain('SourceA');
      expect(edl).toContain('SourceB');
    });

    it('should format timecodes correctly', () => {
      // Add clip with known frame numbers
      manager.addClip(0, 'Source', 1, 24); // 24 frames = 1 second at 24fps

      const edl = manager.toEDL();

      // Source in should be frame 1 = 00:00:00:01
      expect(edl).toContain('00:00:00:01');
      // Source out should be frame 25 = 00:00:01:01 (exclusive)
      expect(edl).toContain('00:00:01:01');
    });
  });

  describe('fromEDL', () => {
    it('should parse EDL format', () => {
      const edl = `TITLE: Test
FCM: NON-DROP FRAME

001  SourceA  V     C        00:00:00:01 00:00:02:01 00:00:00:01 00:00:02:01
* FROM CLIP NAME: SourceA

002  SourceB  V     C        00:00:00:01 00:00:01:01 00:00:02:01 00:00:03:01
* FROM CLIP NAME: SourceB
`;

      const resolver = vi.fn((name: string) => {
        if (name === 'SourceA') return { index: 0, frameCount: 100 };
        if (name === 'SourceB') return { index: 1, frameCount: 50 };
        return null;
      });

      const count = manager.fromEDL(edl, resolver);

      expect(count).toBe(2);
      expect(manager.getClipCount()).toBe(2);
    });

    it('should skip unresolved sources', () => {
      const edl = `001  Unknown  V     C        00:00:00:01 00:00:01:01 00:00:00:01 00:00:01:01`;

      const resolver = vi.fn(() => null);

      const count = manager.fromEDL(edl, resolver);

      expect(count).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all clips', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.addClip(1, 'Source 2', 1, 30);

      manager.clear();

      expect(manager.getClipCount()).toBe(0);
      expect(manager.getTotalDuration()).toBe(0);
    });
  });

  describe('goToNextClip', () => {
    it('NAV-001: returns next clip start frame', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50
      manager.addClip(1, 'Source 2', 1, 30);  // Global 51-80
      manager.addClip(2, 'Source 3', 1, 20);  // Global 81-100

      // From middle of first clip -> second clip
      const result = manager.goToNextClip(25);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(51);
      expect(result!.clip.sourceIndex).toBe(1);

      // From middle of second clip -> third clip
      const result2 = manager.goToNextClip(60);
      expect(result2).not.toBeNull();
      expect(result2!.frame).toBe(81);
      expect(result2!.clip.sourceIndex).toBe(2);
    });

    it('NAV-002: wraps to first clip when loopMode=all', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50
      manager.addClip(1, 'Source 2', 1, 30);  // Global 51-80
      manager.setLoopMode('all');

      // From last clip -> should wrap to first
      const result = manager.goToNextClip(60);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(1);
      expect(result!.clip.sourceIndex).toBe(0);
    });

    it('NAV-003: returns null at end when loopMode=none', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50
      manager.addClip(1, 'Source 2', 1, 30);  // Global 51-80
      manager.setLoopMode('none');

      // From last clip -> null
      const result = manager.goToNextClip(60);
      expect(result).toBeNull();
    });

    it('NAV-007: single clip with loopMode=all wraps to itself', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50
      manager.setLoopMode('all');

      const result = manager.goToNextClip(25);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(1);
      expect(result!.clip.sourceIndex).toBe(0);
    });

    it('NAV-007b: single clip with loopMode=none returns null', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.setLoopMode('none');

      const result = manager.goToNextClip(25);
      expect(result).toBeNull();
    });

    it('NAV-007c: single clip with loopMode=single returns null (single loops clip playback, not navigation)', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.setLoopMode('single');

      const nextResult = manager.goToNextClip(25);
      expect(nextResult).toBeNull();
    });

    it('NAV-008: empty playlist returns null', () => {
      const result = manager.goToNextClip(1);
      expect(result).toBeNull();
    });

    it('returns first clip when frame is outside any clip', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50

      const result = manager.goToNextClip(999);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(1);
    });
  });

  describe('goToPreviousClip', () => {
    it('NAV-004: returns current clip start when mid-clip', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50
      manager.addClip(1, 'Source 2', 1, 30);  // Global 51-80

      // Mid-way through second clip -> start of second clip
      const result = manager.goToPreviousClip(65);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(51);
      expect(result!.clip.sourceIndex).toBe(1);
    });

    it('NAV-005: returns previous clip when at start of clip', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50
      manager.addClip(1, 'Source 2', 1, 30);  // Global 51-80

      // At start of second clip (within 1 frame) -> previous clip
      const result = manager.goToPreviousClip(51);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(1);
      expect(result!.clip.sourceIndex).toBe(0);

      // Also at globalStartFrame + 1 -> still goes to previous
      const result2 = manager.goToPreviousClip(52);
      expect(result2).not.toBeNull();
      expect(result2!.frame).toBe(1);
      expect(result2!.clip.sourceIndex).toBe(0);
    });

    it('NAV-006: wraps to last clip when loopMode=all', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50
      manager.addClip(1, 'Source 2', 1, 30);  // Global 51-80
      manager.setLoopMode('all');

      // At start of first clip -> wrap to last clip
      const result = manager.goToPreviousClip(1);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(51);
      expect(result!.clip.sourceIndex).toBe(1);
    });

    it('returns null at beginning when loopMode=none', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.addClip(1, 'Source 2', 1, 30);
      manager.setLoopMode('none');

      // At start of first clip -> null
      const result = manager.goToPreviousClip(1);
      expect(result).toBeNull();
    });

    it('NAV-006b: single clip with loopMode=single at start returns null', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.setLoopMode('single');

      // At start of only clip -> null (single loops playback, not navigation)
      const result = manager.goToPreviousClip(1);
      expect(result).toBeNull();
    });

    it('single clip with loopMode=single mid-clip returns clip start', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.setLoopMode('single');

      // Mid-clip -> returns start of current clip
      const result = manager.goToPreviousClip(25);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(1);
    });

    it('returns last clip when frame is outside any clip', () => {
      manager.addClip(0, 'Source 1', 1, 50);  // Global 1-50

      const result = manager.goToPreviousClip(999);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(1);
    });
  });

  describe('getClipForSource', () => {
    it('returns the clip matching the source index', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.addClip(1, 'Source 2', 1, 30);
      manager.addClip(2, 'Source 3', 1, 20);

      const clip = manager.getClipForSource(1);
      expect(clip).not.toBeNull();
      expect(clip!.sourceIndex).toBe(1);
      expect(clip!.sourceName).toBe('Source 2');
    });

    it('returns first matching clip when source appears multiple times', () => {
      manager.addClip(0, 'Source 1', 1, 50);
      manager.addClip(0, 'Source 1 (copy)', 10, 30);

      const clip = manager.getClipForSource(0);
      expect(clip).not.toBeNull();
      expect(clip!.sourceName).toBe('Source 1');
    });

    it('returns null for non-existent source index', () => {
      manager.addClip(0, 'Source 1', 1, 50);

      expect(manager.getClipForSource(99)).toBeNull();
    });

    it('returns null on empty playlist', () => {
      expect(manager.getClipForSource(0)).toBeNull();
    });
  });
});
