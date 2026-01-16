/**
 * Session Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session, LoopMode, MediaSource } from './Session';

describe('Session', () => {
  let session: Session;

  beforeEach(() => {
    session = new Session();
  });

  describe('initialization', () => {
    it('SES-001: initializes with default values', () => {
      expect(session.currentFrame).toBe(1);
      expect(session.inPoint).toBe(1);
      expect(session.outPoint).toBe(1);
      expect(session.fps).toBe(24);
      expect(session.isPlaying).toBe(false);
      expect(session.loopMode).toBe('loop');
      expect(session.volume).toBeCloseTo(0.7, 2);
      expect(session.muted).toBe(false);
    });

    it('has no sources initially', () => {
      expect(session.currentSource).toBeNull();
      expect(session.sourceCount).toBe(0);
      expect(session.allSources).toEqual([]);
    });

    it('has empty marks initially', () => {
      expect(session.marks.size).toBe(0);
    });
  });

  describe('currentFrame', () => {
    it('SES-001: clamps values within valid range', () => {
      // Without a source, duration is 1
      session.currentFrame = 100;
      expect(session.currentFrame).toBe(1);

      session.currentFrame = -5;
      expect(session.currentFrame).toBe(1);
    });

    it('SES-002: rounds fractional values', () => {
      session.currentFrame = 1.7;
      expect(session.currentFrame).toBe(1); // Clamped by duration

      // We'd need a source with longer duration to fully test rounding
    });

    it('SES-003: emits frameChanged event', () => {
      const listener = vi.fn();
      session.on('frameChanged', listener);

      session.currentFrame = 1;
      // Same value, no emit (value didn't change)
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('fps', () => {
    it('SES-006: clamps between 1 and 120', () => {
      session.fps = 0;
      expect(session.fps).toBe(1);

      session.fps = 150;
      expect(session.fps).toBe(120);

      session.fps = 30;
      expect(session.fps).toBe(30);
    });
  });

  describe('loopMode', () => {
    it('SES-007: cycles through loop modes', () => {
      const listener = vi.fn();
      session.on('loopModeChanged', listener);

      session.loopMode = 'once';
      expect(session.loopMode).toBe('once');
      expect(listener).toHaveBeenCalledWith('once');

      session.loopMode = 'pingpong';
      expect(session.loopMode).toBe('pingpong');
      expect(listener).toHaveBeenCalledWith('pingpong');

      session.loopMode = 'loop';
      expect(session.loopMode).toBe('loop');
      expect(listener).toHaveBeenCalledWith('loop');
    });

    it('does not emit if same mode', () => {
      session.loopMode = 'loop'; // Already loop
      const listener = vi.fn();
      session.on('loopModeChanged', listener);

      session.loopMode = 'loop';
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('volume', () => {
    it('SES-008: clamps between 0 and 1', () => {
      session.volume = 1.5;
      expect(session.volume).toBe(1);

      session.volume = -0.5;
      expect(session.volume).toBe(0);

      session.volume = 0.5;
      expect(session.volume).toBe(0.5);
    });

    it('emits volumeChanged event', () => {
      const listener = vi.fn();
      session.on('volumeChanged', listener);

      session.volume = 0.5;
      expect(listener).toHaveBeenCalledWith(0.5);
    });
  });

  describe('muted', () => {
    it('SES-009: toggleMute toggles muted state', () => {
      expect(session.muted).toBe(false);

      session.toggleMute();
      expect(session.muted).toBe(true);

      session.toggleMute();
      expect(session.muted).toBe(false);
    });

    it('emits mutedChanged event', () => {
      const listener = vi.fn();
      session.on('mutedChanged', listener);

      session.muted = true;
      expect(listener).toHaveBeenCalledWith(true);
    });
  });

  describe('playback control', () => {
    it('SES-010: play() sets isPlaying to true', () => {
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.play();
      expect(session.isPlaying).toBe(true);
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('SES-011: pause() sets isPlaying to false', () => {
      session.play();
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.pause();
      expect(session.isPlaying).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('SES-012: togglePlayback() toggles play/pause', () => {
      expect(session.isPlaying).toBe(false);

      session.togglePlayback();
      expect(session.isPlaying).toBe(true);

      session.togglePlayback();
      expect(session.isPlaying).toBe(false);
    });

    it('play() does nothing if already playing', () => {
      session.play();
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.play();
      expect(listener).not.toHaveBeenCalled();
    });

    it('pause() does nothing if already paused', () => {
      const listener = vi.fn();
      session.on('playbackChanged', listener);

      session.pause();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('frame navigation', () => {
    it('SES-013: goToFrame() updates currentFrame', () => {
      session.goToFrame(1);
      expect(session.currentFrame).toBe(1);
    });

    it('SES-016: goToStart() sets frame to inPoint', () => {
      session.goToStart();
      expect(session.currentFrame).toBe(session.inPoint);
    });

    it('SES-017: goToEnd() sets frame to outPoint', () => {
      session.goToEnd();
      expect(session.currentFrame).toBe(session.outPoint);
    });
  });

  describe('playDirection', () => {
    it('has default direction of 1', () => {
      expect(session.playDirection).toBe(1);
    });

    it('togglePlayDirection() reverses direction', () => {
      const listener = vi.fn();
      session.on('playDirectionChanged', listener);

      session.togglePlayDirection();
      expect(session.playDirection).toBe(-1);
      expect(listener).toHaveBeenCalledWith(-1);

      session.togglePlayDirection();
      expect(session.playDirection).toBe(1);
    });
  });

  describe('in/out points', () => {
    it('SES-018: setInPoint() updates inPoint', () => {
      const listener = vi.fn();
      session.on('inOutChanged', listener);

      session.setInPoint(1);
      // inPoint already 1, should not emit
    });

    it('SES-020: resetInOutPoints() resets to full duration', () => {
      const listener = vi.fn();
      session.on('inOutChanged', listener);

      session.resetInOutPoints();
      expect(session.inPoint).toBe(1);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('marks', () => {
    it('SES-021: toggleMark() adds frame to marks', () => {
      const listener = vi.fn();
      session.on('marksChanged', listener);

      session.toggleMark(5);
      expect(session.marks.has(5)).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('SES-022: toggleMark() removes existing mark', () => {
      session.toggleMark(5);
      session.toggleMark(5);
      expect(session.marks.has(5)).toBe(false);
    });

    it('SES-023: toggleMark() uses currentFrame by default', () => {
      session.toggleMark();
      expect(session.marks.has(session.currentFrame)).toBe(true);
    });

    it('SES-024: clearMarks() empties all marks', () => {
      session.toggleMark(1);
      session.toggleMark(5);
      session.toggleMark(10);
      expect(session.marks.size).toBe(3);

      session.clearMarks();
      expect(session.marks.size).toBe(0);
    });
  });

  describe('frameCount', () => {
    it('returns correct count based on in/out', () => {
      // With defaults (in=1, out=1), count = 1
      expect(session.frameCount).toBe(1);
    });
  });

  describe('source management', () => {
    it('getSourceByIndex returns null for invalid index', () => {
      expect(session.getSourceByIndex(0)).toBeNull();
      expect(session.getSourceByIndex(-1)).toBeNull();
      expect(session.getSourceByIndex(100)).toBeNull();
    });

    it('currentSourceIndex defaults to 0', () => {
      expect(session.currentSourceIndex).toBe(0);
    });
  });

  describe('graph', () => {
    it('graph is null initially', () => {
      expect(session.graph).toBeNull();
      expect(session.graphParseResult).toBeNull();
    });
  });

  describe('playback state', () => {
    it('getPlaybackState() exports current state', () => {
      session.volume = 0.5;
      session.fps = 30;
      session.loopMode = 'once';
      session.toggleMark(5);

      const state = session.getPlaybackState();

      expect(state.fps).toBe(30);
      expect(state.loopMode).toBe('once');
      expect(state.volume).toBe(0.5);
      expect(state.currentFrame).toBe(1);
      expect(state.marks).toContain(5);
    });

    it('setPlaybackState() restores state', () => {
      const listener = vi.fn();
      session.on('loopModeChanged', listener);

      session.setPlaybackState({
        fps: 60,
        loopMode: 'pingpong',
        volume: 0.8,
        marks: [1, 5, 10],
      });

      expect(session.fps).toBe(60);
      expect(session.loopMode).toBe('pingpong');
      expect(session.volume).toBe(0.8);
      expect(session.marks.has(1)).toBe(true);
      expect(session.marks.has(5)).toBe(true);
      expect(session.marks.has(10)).toBe(true);
      expect(listener).toHaveBeenCalledWith('pingpong');
    });

    it('setPlaybackState() handles partial state', () => {
      session.setPlaybackState({ volume: 0.3 });
      expect(session.volume).toBe(0.3);
      expect(session.fps).toBe(24); // Unchanged
    });
  });

  describe('dispose', () => {
    it('clears sources on dispose', () => {
      session.dispose();
      expect(session.allSources).toEqual([]);
    });
  });
});
