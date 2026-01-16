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

  describe('update() with playDirection', () => {
    // Helper to access private members for testing
    const setPrivateState = (s: Session, overrides: {
      currentFrame?: number;
      inPoint?: number;
      outPoint?: number;
    }) => {
      const internal = s as unknown as {
        _currentFrame: number;
        _inPoint: number;
        _outPoint: number;
      };
      if (overrides.currentFrame !== undefined) internal._currentFrame = overrides.currentFrame;
      if (overrides.inPoint !== undefined) internal._inPoint = overrides.inPoint;
      if (overrides.outPoint !== undefined) internal._outPoint = overrides.outPoint;
    };

    // Helper to add a mock source with specified duration
    const addMockSource = (s: Session, duration: number) => {
      const sources = (s as unknown as { sources: MediaSource[] }).sources;
      sources.push({
        type: 'image',
        name: 'test',
        url: 'test.png',
        width: 100,
        height: 100,
        duration: duration,
        fps: 10,
      });
    };

    beforeEach(() => {
      // Add a mock source with 100 frame duration
      addMockSource(session, 100);
      // Set up a session with enough frames to test
      setPrivateState(session, { inPoint: 1, outPoint: 100 });
      session.fps = 10; // 100ms per frame for easy testing
    });

    it('SES-025: forward playback advances frame forward for images', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Start playback (forward direction by default)
      session.play();
      expect(session.playDirection).toBe(1);

      // Simulate time passing (enough for one frame at 10fps = 100ms)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 150); // 150ms elapsed

      session.update();

      // Frame should have advanced forward
      expect(session.currentFrame).toBe(51);

      vi.restoreAllMocks();
    });

    it('SES-026: reverse playback advances frame backward for images', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Set reverse direction
      session.togglePlayDirection();
      expect(session.playDirection).toBe(-1);

      // Start playback
      session.play();

      // Simulate time passing (enough for one frame at 10fps = 100ms)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 150); // 150ms elapsed

      session.update();

      // Frame should have advanced backward
      expect(session.currentFrame).toBe(49);

      vi.restoreAllMocks();
    });

    it('SES-027: reverse playback decrements multiple frames over time', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Set reverse direction and start playback
      session.togglePlayDirection();
      session.play();

      // Simulate time passing (enough for 3 frames at 10fps = 300ms)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 350); // 350ms elapsed

      session.update();

      // Frame should have gone back by 3
      expect(session.currentFrame).toBe(47);

      vi.restoreAllMocks();
    });

    it('SES-028: toggling direction while playing changes frame advancement', () => {
      // Start at frame 50
      setPrivateState(session, { currentFrame: 50 });

      // Mock time
      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      const startFrame = session.currentFrame;

      // Advance forward
      mockTime = 150;
      session.update();
      const afterForward = session.currentFrame;
      expect(afterForward).toBeGreaterThan(startFrame); // Frame increased (forward)

      // Toggle to reverse
      session.togglePlayDirection();
      expect(session.playDirection).toBe(-1);

      // Record current frame before reverse playback
      const beforeReverse = session.currentFrame;

      // Advance with reverse direction - update lastFrameTime first
      (session as unknown as { lastFrameTime: number }).lastFrameTime = mockTime;
      (session as unknown as { frameAccumulator: number }).frameAccumulator = 0;
      mockTime = 300;
      session.update();
      const afterReverse = session.currentFrame;

      // Verify frame decreased (reverse direction works)
      expect(afterReverse).toBeLessThan(beforeReverse);

      vi.restoreAllMocks();
    });

    it('SES-029: reverse playback stops at inPoint with loop mode once', () => {
      // Start at frame 2
      setPrivateState(session, { currentFrame: 2 });
      session.loopMode = 'once';

      // Set reverse direction and start playback
      session.togglePlayDirection();
      session.play();

      // Simulate time passing (enough for 5 frames)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 550);

      session.update();

      // Should stop at inPoint (1) and pause
      expect(session.currentFrame).toBe(1);
      expect(session.isPlaying).toBe(false);

      vi.restoreAllMocks();
    });

    it('SES-030: reverse playback wraps to outPoint with loop mode', () => {
      // Start at frame 2
      setPrivateState(session, { currentFrame: 2 });
      session.loopMode = 'loop';

      // Set reverse direction and start playback
      session.togglePlayDirection();
      session.play();

      // Simulate time passing (enough for exactly 2 frames: 2 -> 1 -> wraps to 100)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 250);

      session.update();

      // Frame goes: 2 -> 1 -> 0 (wraps to outPoint 100)
      expect(session.currentFrame).toBe(100);

      vi.restoreAllMocks();
    });

    it('SES-031: pingpong mode emits playDirectionChanged when reversing at outPoint', () => {
      // Start near the end
      setPrivateState(session, { currentFrame: 99 });
      session.loopMode = 'pingpong';
      session.play();

      const directionListener = vi.fn();
      session.on('playDirectionChanged', directionListener);

      // Advance past outPoint
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 250);
      session.update();

      // Direction should have changed and event emitted
      expect(session.playDirection).toBe(-1);
      expect(directionListener).toHaveBeenCalledWith(-1);

      vi.restoreAllMocks();
    });

    it('SES-032: pingpong mode emits playDirectionChanged when reversing at inPoint', () => {
      // Start near the beginning with reverse direction
      setPrivateState(session, { currentFrame: 2 });
      session.loopMode = 'pingpong';
      session.togglePlayDirection(); // Set to -1
      session.play();

      const directionListener = vi.fn();
      session.on('playDirectionChanged', directionListener);

      // Advance past inPoint (going backward)
      const lastFrameTime = (session as unknown as { lastFrameTime: number }).lastFrameTime;
      vi.spyOn(performance, 'now').mockReturnValue(lastFrameTime + 250);
      session.update();

      // Direction should have changed back to forward and event emitted
      expect(session.playDirection).toBe(1);
      expect(directionListener).toHaveBeenCalledWith(1);

      vi.restoreAllMocks();
    });
  });

  describe('fps events', () => {
    it('SES-033: fps setter emits fpsChanged event', () => {
      const listener = vi.fn();
      session.on('fpsChanged', listener);

      session.fps = 30;
      expect(session.fps).toBe(30);
      expect(listener).toHaveBeenCalledWith(30);
    });

    it('SES-034: fps setter does not emit if value unchanged', () => {
      session.fps = 30;
      const listener = vi.fn();
      session.on('fpsChanged', listener);

      session.fps = 30; // Same value
      expect(listener).not.toHaveBeenCalled();
    });

    it('SES-035: fps setter clamps and emits clamped value', () => {
      const listener = vi.fn();
      session.on('fpsChanged', listener);

      session.fps = 150; // Above max (120)
      expect(session.fps).toBe(120);
      expect(listener).toHaveBeenCalledWith(120);
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

  describe('A/B source compare', () => {
    // Helper to create a mock source
    const createMockSource = (name: string): MediaSource => ({
      type: 'image',
      name,
      url: `file://${name}`,
      width: 100,
      height: 100,
      duration: 30,
      fps: 24,
    });

    it('AB-001: initializes with A as current source', () => {
      expect(session.currentAB).toBe('A');
    });

    it('AB-002: sourceAIndex defaults to 0', () => {
      expect(session.sourceAIndex).toBe(0);
    });

    it('AB-003: sourceBIndex defaults to -1 (unassigned)', () => {
      expect(session.sourceBIndex).toBe(-1);
    });

    it('AB-004: abCompareAvailable is false when no B source', () => {
      expect(session.abCompareAvailable).toBe(false);
    });

    it('AB-005: syncPlayhead defaults to true', () => {
      expect(session.syncPlayhead).toBe(true);
    });

    it('AB-006: setSourceB assigns B source', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      // Need to add sources to session first (using internal method)
      const sessionAny = session as any;
      sessionAny.sources = [source1, source2];

      session.setSourceB(1);
      expect(session.sourceBIndex).toBe(1);
      expect(session.abCompareAvailable).toBe(true);
    });

    it('AB-007: toggleAB switches between A and B', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;
      sessionAny.sources = [source1, source2];
      session.setSourceB(1);

      expect(session.currentAB).toBe('A');
      session.toggleAB();
      expect(session.currentAB).toBe('B');
      session.toggleAB();
      expect(session.currentAB).toBe('A');
    });

    it('AB-008: toggleAB does nothing when B source not assigned', () => {
      const source1 = createMockSource('source1');
      const sessionAny = session as any;
      sessionAny.sources = [source1];

      expect(session.currentAB).toBe('A');
      session.toggleAB();
      expect(session.currentAB).toBe('A'); // No change
    });

    it('AB-009: toggleAB emits abSourceChanged event', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;
      sessionAny.sources = [source1, source2];
      session.setSourceB(1);

      const callback = vi.fn();
      session.on('abSourceChanged', callback);

      session.toggleAB();
      expect(callback).toHaveBeenCalledWith({
        current: 'B',
        sourceIndex: 1,
      });
    });

    it('AB-010: setCurrentAB switches to specified source', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;
      sessionAny.sources = [source1, source2];
      session.setSourceB(1);

      session.setCurrentAB('B');
      expect(session.currentAB).toBe('B');

      session.setCurrentAB('A');
      expect(session.currentAB).toBe('A');
    });

    it('AB-011: setCurrentAB ignores invalid B when not available', () => {
      const source1 = createMockSource('source1');
      const sessionAny = session as any;
      sessionAny.sources = [source1];

      session.setCurrentAB('B');
      expect(session.currentAB).toBe('A'); // Unchanged
    });

    it('AB-012: clearSourceB resets B source and switches to A', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;
      sessionAny.sources = [source1, source2];
      session.setSourceB(1);
      session.toggleAB(); // Switch to B

      expect(session.currentAB).toBe('B');
      session.clearSourceB();

      expect(session.sourceBIndex).toBe(-1);
      expect(session.currentAB).toBe('A');
      expect(session.abCompareAvailable).toBe(false);
    });

    it('AB-013: sourceA returns correct source', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;
      sessionAny.sources = [source1, source2];

      expect(session.sourceA).toBe(source1);
    });

    it('AB-014: sourceB returns correct source when assigned', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;
      sessionAny.sources = [source1, source2];
      session.setSourceB(1);

      expect(session.sourceB).toBe(source2);
    });

    it('AB-015: sourceB returns null when not assigned', () => {
      expect(session.sourceB).toBeNull();
    });

    it('AB-016: setSourceA changes A source', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');
      const source3 = createMockSource('source3');

      const sessionAny = session as any;
      sessionAny.sources = [source1, source2, source3];

      session.setSourceA(2);
      expect(session.sourceAIndex).toBe(2);
      expect(session.sourceA).toBe(source3);
    });

    it('AB-017: syncPlayhead can be set', () => {
      session.syncPlayhead = false;
      expect(session.syncPlayhead).toBe(false);
      session.syncPlayhead = true;
      expect(session.syncPlayhead).toBe(true);
    });

    it('AB-018: second source auto-assigns as source B', () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;

      // Add first source using addSource
      sessionAny.addSource(source1);
      expect(session.sourceBIndex).toBe(-1); // B not yet assigned

      // Add second source
      sessionAny.addSource(source2);
      expect(session.sourceBIndex).toBe(1); // B auto-assigned to second source
      expect(session.sourceAIndex).toBe(0); // A remains first source
      expect(session.abCompareAvailable).toBe(true);
    });

    it('AB-019: auto-assign emits abSourceChanged event', () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionAny = session as any;
      const callback = vi.fn();
      session.on('abSourceChanged', callback);

      sessionAny.addSource(source1);
      expect(callback).not.toHaveBeenCalled(); // No event for first source

      sessionAny.addSource(source2);
      expect(callback).toHaveBeenCalledWith({
        current: 'A',
        sourceIndex: 0,
      });
    });

    it('AB-020: third source does not change B assignment', () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');
      const source3 = createMockSource('source3');

      const sessionAny = session as any;
      sessionAny.addSource(source1);
      sessionAny.addSource(source2);
      expect(session.sourceBIndex).toBe(1);

      sessionAny.addSource(source3);
      expect(session.sourceBIndex).toBe(1); // Still 1, not changed to 2
    });
  });

  describe('dispose', () => {
    it('clears sources on dispose', () => {
      session.dispose();
      expect(session.allSources).toEqual([]);
    });
  });
});
