/**
 * Regression tests for Issue #310:
 * PlaylistManager pingpong loop mode support.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';

describe('PlaylistManager — pingpong loop mode (Issue #310)', () => {
  let manager: PlaylistManager;

  beforeEach(() => {
    manager = new PlaylistManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('setLoopMode accepts pingpong and getLoopMode returns it', () => {
    manager.setLoopMode('pingpong');
    expect(manager.getLoopMode()).toBe('pingpong');
  });

  it('emits loopModeChanged with pingpong', () => {
    const callback = vi.fn();
    manager.on('loopModeChanged', callback);

    manager.setLoopMode('pingpong');

    expect(callback).toHaveBeenCalledWith({ mode: 'pingpong' });
  });

  it('pingpong direction starts at 1 (forward)', () => {
    manager.setLoopMode('pingpong');
    expect(manager.getPingpongDirection()).toBe(1);
  });

  describe('getNextFrame with pingpong at end of playlist', () => {
    beforeEach(() => {
      manager.addClip(0, 'Source 1', 1, 5); // frames 1-5
      manager.addClip(1, 'Source 2', 1, 5); // frames 6-10
      manager.setLoopMode('pingpong');
    });

    it('reverses direction at end of playlist instead of wrapping', () => {
      // At the last frame of the playlist (frame 10)
      const result = manager.getNextFrame(10);

      // Should go backward (frame 9), not wrap to 1
      expect(result.frame).toBe(9);
      expect(manager.getPingpongDirection()).toBe(-1);
    });

    it('does not emit playlistEnded at end of playlist', () => {
      const callback = vi.fn();
      manager.on('playlistEnded', callback);

      manager.getNextFrame(10);

      expect(callback).not.toHaveBeenCalled();
    });

    it('normal advance works before reaching the end', () => {
      const result = manager.getNextFrame(3);
      expect(result.frame).toBe(4);
      expect(result.clipChanged).toBe(false);
    });

    it('crosses clip boundary normally during forward play', () => {
      const result = manager.getNextFrame(5);
      // At end of clip 1, should move to clip 2
      expect(result.frame).toBe(6);
      expect(result.clipChanged).toBe(true);
    });
  });

  describe('getPreviousFrame with pingpong at start of playlist', () => {
    beforeEach(() => {
      manager.addClip(0, 'Source 1', 1, 5); // frames 1-5
      manager.addClip(1, 'Source 2', 1, 5); // frames 6-10
      manager.setLoopMode('pingpong');
    });

    it('reverses direction at start of playlist instead of wrapping', () => {
      // At the first frame of the playlist
      const result = manager.getPreviousFrame(1);

      // Should go forward (frame 2), not wrap to 10
      expect(result.frame).toBe(2);
      expect(manager.getPingpongDirection()).toBe(1);
    });
  });

  describe('goToNextClip with pingpong wraps like all', () => {
    beforeEach(() => {
      manager.addClip(0, 'Source 1', 1, 5);
      manager.addClip(1, 'Source 2', 1, 5);
      manager.setLoopMode('pingpong');
    });

    it('wraps to first clip when at last clip', () => {
      const result = manager.goToNextClip(8); // in clip 2
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(1);
    });
  });

  describe('goToPreviousClip with pingpong wraps like all', () => {
    beforeEach(() => {
      manager.addClip(0, 'Source 1', 1, 5);
      manager.addClip(1, 'Source 2', 1, 5);
      manager.setLoopMode('pingpong');
    });

    it('wraps to last clip when at first clip start', () => {
      const result = manager.goToPreviousClip(1);
      expect(result).not.toBeNull();
      expect(result!.frame).toBe(6); // start of clip 2
    });
  });

  describe('state serialization with pingpong', () => {
    it('getState includes pingpong loop mode', () => {
      manager.setLoopMode('pingpong');
      const state = manager.getState();
      expect(state.loopMode).toBe('pingpong');
    });

    it('setState restores pingpong loop mode', () => {
      manager.setState({ loopMode: 'pingpong' });
      expect(manager.getLoopMode()).toBe('pingpong');
    });
  });

  describe('switching away from pingpong resets direction', () => {
    it('resets pingpong direction when switching to all', () => {
      manager.addClip(0, 'Source 1', 1, 5);
      manager.addClip(1, 'Source 2', 1, 5);
      manager.setLoopMode('pingpong');

      // Trigger direction reversal
      manager.getNextFrame(10);
      expect(manager.getPingpongDirection()).toBe(-1);

      // Switch to a different mode
      manager.setLoopMode('all');
      expect(manager.getPingpongDirection()).toBe(1);
    });
  });
});
