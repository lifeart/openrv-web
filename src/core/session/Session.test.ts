import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session, MediaSource } from './Session';
import { Graph } from '../graph/Graph';

// Mock SequenceLoader
vi.mock('../../utils/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  preloadFrames: vi.fn(),
  loadFrameImage: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
}));

const createMockDTO = (protocols: any) => {
  const mockObj = (data: any): any => ({
    exists: () => data !== undefined,
    property: (name: string) => ({
      value: () => data?.[name],
      exists: () => data && name in data
    }),
    component: (name: string) => mockObj(data?.[name]),
    name: 'mock',
    components: () => Object.entries(data || {}).map(([name, val]) => ({ name, ...mockObj(val) }))
  });

  return {
    byProtocol: (proto: string) => {
      const list = protocols[proto] || [];
      const results = list.map(mockObj);
      (results as any).first = () => results[0] || mockObj(undefined);
      return results;
    }
  } as any;
};

const createMockVideo = (durationSec: number = 100, currentTimeSec: number = 0) => {
    const video = document.createElement('video') as any;
    video._currentTime = currentTimeSec;
    Object.defineProperty(video, 'duration', {
        get: () => durationSec,
        configurable: true
    });
    Object.defineProperty(video, 'currentTime', {
        get: () => video._currentTime,
        set: (v) => video._currentTime = v,
        configurable: true
    });
    Object.defineProperty(video, 'ended', {
        get: () => video._currentTime >= durationSec,
        configurable: true
    });
    video.play = vi.fn();
    video.pause = vi.fn();
    return video;
};

class TestSession extends Session {
  public setSources(s: MediaSource[]) {
    this.sources = [];
    s.forEach(src => {
        this.addSource(src);
        (this as any)._outPoint = Math.max((this as any)._outPoint, src.duration);
    });
  }
}

describe('Session', () => {
  let session: TestSession;

  beforeEach(() => {
    session = new TestSession();
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
      expect(state.marks).toContainEqual(expect.objectContaining({ frame: 5 }));
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
      session.setSources([source1, source2]);

      session.setSourceB(1);
      expect(session.sourceBIndex).toBe(1);
      expect(session.abCompareAvailable).toBe(true);
    });

    it('AB-007: toggleAB switches between A and B', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      session.setSources([source1, source2]);
      session.setSourceB(1);

      expect(session.currentAB).toBe('A');
      session.toggleAB();
      expect(session.currentAB).toBe('B');
      session.toggleAB();
      expect(session.currentAB).toBe('A');
    });

    it('AB-008: toggleAB does nothing when B source not assigned', () => {
      const source1 = createMockSource('source1');
      session.setSources([source1]);

      expect(session.currentAB).toBe('A');
      session.toggleAB();
      expect(session.currentAB).toBe('A'); // No change
    });

    it('AB-009: toggleAB emits abSourceChanged event', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      session.setSources([source1, source2]);
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

      session.setSources([source1, source2]);
      session.setSourceB(1);

      session.setCurrentAB('B');
      expect(session.currentAB).toBe('B');

      session.setCurrentAB('A');
      expect(session.currentAB).toBe('A');
    });

    it('AB-011: setCurrentAB ignores invalid B when not available', () => {
      const source1 = createMockSource('source1');
      const sessionInternal = session as unknown as { sources: MediaSource[] };
      sessionInternal.sources = [source1];

      session.setCurrentAB('B');
      expect(session.currentAB).toBe('A'); // Unchanged
    });

    it('AB-012: clearSourceB resets B source and switches to A', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionInternal = session as unknown as { sources: MediaSource[] };
      sessionInternal.sources = [source1, source2];
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

      const sessionInternal = session as unknown as { sources: MediaSource[] };
      sessionInternal.sources = [source1, source2];

      expect(session.sourceA).toBe(source1);
    });

    it('AB-014: sourceB returns correct source when assigned', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionInternal = session as unknown as { sources: MediaSource[] };
      sessionInternal.sources = [source1, source2];
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

      const sessionInternal = session as unknown as { sources: MediaSource[] };
      sessionInternal.sources = [source1, source2, source3];

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

      const sessionInternal = session as unknown as { sources: MediaSource[], addSource: (s: MediaSource) => void };

      // Add first source using addSource
      sessionInternal.addSource(source1);
      expect(session.sourceBIndex).toBe(-1); // B not yet assigned

      // Add second source
      sessionInternal.addSource(source2);
      expect(session.sourceBIndex).toBe(1); // B auto-assigned to second source
      expect(session.sourceAIndex).toBe(0); // A remains first source
      expect(session.abCompareAvailable).toBe(true);
    });

    it('AB-019: auto-assign emits abSourceChanged event', () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      const sessionInternal = session as unknown as { addSource: (s: MediaSource) => void };
      const callback = vi.fn();
      session.on('abSourceChanged', callback);

      sessionInternal.addSource(source1);
      expect(callback).not.toHaveBeenCalled(); // No event for first source

      sessionInternal.addSource(source2);
      expect(callback).toHaveBeenCalledWith({
        current: 'A',
        sourceIndex: 0,
      });
    });

    it('AB-020: third source does not change B assignment', () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');
      const source3 = createMockSource('source3');

      const sessionInternal = session as unknown as { addSource: (s: MediaSource) => void };
      sessionInternal.addSource(source1);
      sessionInternal.addSource(source2);
      expect(session.sourceBIndex).toBe(1);

      sessionInternal.addSource(source3);
      expect(session.sourceBIndex).toBe(1); // Still 1, not changed to 2
    });
  });

  describe('cleanup and switching', () => {
    it('SES-036: switchToSource pauses current video if playing', () => {
      const video = document.createElement('video');
      const pauseSpy = vi.spyOn(video, 'pause');
      
      const source1: MediaSource = {
        name: 'v1.mp4', type: 'video', duration: 10, fps: 24, width: 100, height: 100, url: 'v1.mp4', element: video
      };
      const source2: MediaSource = {
        name: 'i1.png', type: 'image', duration: 1, fps: 24, width: 100, height: 100, url: 'i1.png'
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(source1);
      sessionInternal.addSource(source2);

      session.play();
      expect(session.isPlaying).toBe(true);

      // Switching to source 2 (B) should pause source 1 (A)
      session.toggleAB();
      expect(pauseSpy).toHaveBeenCalled();
    });

    it('SES-037: dispose cleans up sequence and clears sources', () => {
      const sequenceFrames = [{} as any];
      const source: MediaSource = {
        name: 's1', type: 'sequence', url: 's1', duration: 3, fps: 24, width: 100, height: 100, sequenceFrames
      };
      
      const sessionInternal = session as any;
      sessionInternal.addSource(source);
      
      expect(session.sourceCount).toBe(1);
      
      session.dispose();
      
      expect(session.sourceCount).toBe(0);
      expect(session.allSources).toEqual([]);
    });
  });

  describe('helper methods', () => {
    it('getNumberValue handles various inputs', () => {
      const s = session as any;
      expect(s.getNumberValue(10)).toBe(10);
      expect(s.getNumberValue([20])).toBe(20);
      expect(s.getNumberValue([[30]])).toBe(30);
      expect(s.getNumberValue('abc')).toBeUndefined();
      expect(s.getNumberValue([])).toBeUndefined();
    });

    it('getBooleanValue handles various inputs', () => {
      const s = session as any;
      expect(s.getBooleanValue(true)).toBe(true);
      expect(s.getBooleanValue(false)).toBe(false);
      expect(s.getBooleanValue(1)).toBe(true);
      expect(s.getBooleanValue(0)).toBe(false);
      expect(s.getBooleanValue('true')).toBe(true);
      expect(s.getBooleanValue('0')).toBe(false);
      expect(s.getBooleanValue('false')).toBe(false);
      expect(s.getBooleanValue([true])).toBe(true);
      expect(s.getBooleanValue(['1'])).toBe(true);
      expect(s.getBooleanValue(['false'])).toBe(false);
      expect(s.getBooleanValue({})).toBeUndefined();
    });

    it('getNumberArray handles various inputs', () => {
      const s = session as any;
      expect(s.getNumberArray([1, 2])).toEqual([1, 2]);
      expect(s.getNumberArray([[3, 4]])).toEqual([3, 4]);
      expect(s.getNumberArray('abc')).toBeUndefined();
      expect(s.getNumberArray(['a'])).toBeUndefined();
    });

    it('getStringValue handles various inputs', () => {
      const s = session as any;
      expect(s.getStringValue('test')).toBe('test');
      expect(s.getStringValue(['val'])).toBe('val');
      expect(s.getStringValue(123)).toBeUndefined();
    });
  });

  describe('loadFromGTO', () => {
    it('handles GTOa text format', async () => {
      // Minimal valid GTO text format
      const gtoText = 'GTOa 5\n\nRVSession : protocol\n{\n    session : component\n    {\n        int frame = 10\n    }\n}\n';
      const bytes = new TextEncoder().encode(gtoText);
      await session.loadFromGTO(bytes.buffer);
    });

    it('throws error for invalid GTO', async () => {
      // SimpleReader inside gto-js might not throw but just log.
      // We force it to throw to test our catch block.
      const gtoJs = await import('gto-js');
      const openSpy = vi.spyOn(gtoJs.SimpleReader.prototype, 'open').mockImplementation(() => {
        throw new Error('Mock parse error');
      });

      try {
        await expect(session.loadFromGTO(new ArrayBuffer(10))).rejects.toThrow('Mock parse error');
      } finally {
        openSpy.mockRestore();
      }
    });

    it('handles text GTO input directly', async () => {
      const gtoText = 'GTOa 5\n\nRVSession : protocol\n{\n    session : component\n    {\n        int frame = 20\n    }\n}\n';
      await session.loadFromGTO(gtoText);
    });
  });

  describe('update logic overrides', () => {

    it('updates video frame in forward playback', () => {
        const video = createMockVideo(100, 1.0);
        session.setSources([{
            type: 'video',
            name: 'v',
            url: 'v.mp4',
            width: 100,
            height: 100,
            duration: 100,
            fps: 24,
            element: video
        }]);
        session.setOutPoint(100);
        session.play();
        (session as any)._playDirection = 1;

        session.update();
        expect(session.currentFrame).toBe(25); // 1.0 * 24 + 1
    });

    it('handles video loop', () => {
        const video = createMockVideo(100, 4.0);
        session.setSources([{
            type: 'video',
            name: 'v',
            url: 'v.mp4',
            width: 100,
            height: 100,
            duration: 100,
            fps: 24,
            element: video
        }]);
        session.loopMode = 'loop';
        session.setOutPoint(50);
        session.play();

        session.update(); // frame will be 4*24+1 = 97 > 50
        expect(video.currentTime).toBe(0); 
        expect(video.play).toHaveBeenCalled();
    });

    it('handles video loop mode once', () => {
        const video = createMockVideo(100, 4.0);
        session.setSources([{
            type: 'video',
            name: 'v',
            url: 'v.mp4',
            width: 100,
            height: 100,
            duration: 100,
            fps: 24,
            element: video
        }]);
        session.loopMode = 'once';
        session.setOutPoint(50);
        session.play();

        session.update();
        expect(session.isPlaying).toBe(false);
    });
  });

  describe('file handling', () => {
    it('loadFile handles image and video', async () => {
      vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:123'), revokeObjectURL: vi.fn() });
      const imgLoadSpy = vi.spyOn(session, 'loadImage').mockResolvedValue();
      // loadFile now uses loadVideoFile for mediabunny support
      const vidLoadSpy = vi.spyOn(session, 'loadVideoFile').mockResolvedValue();

      await session.loadFile(new File([], 'test.png', { type: 'image/png' }));
      expect(imgLoadSpy).toHaveBeenCalled();

      await session.loadFile(new File([], 'test.mp4', { type: 'video/mp4' }));
      expect(vidLoadSpy).toHaveBeenCalled();
    });

    it('loadFile rethrows error and revokes URL', async () => {
      vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:123'), revokeObjectURL: vi.fn() });
      vi.spyOn(session, 'loadImage').mockRejectedValue(new Error('fail'));
      await expect(session.loadFile(new File([], 't.png', { type: 'image/png' }))).rejects.toThrow('fail');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:123');
    });

    it('getMediaType detects various types', () => {
      const s = session as any;
      expect(s.getMediaType(new File([], 't.mp4', { type: 'video/mp4' }))).toBe('video');
      expect(s.getMediaType(new File([], 't.mov', { type: '' }))).toBe('video');
      expect(s.getMediaType(new File([], 't.jpg', { type: 'image/jpeg' }))).toBe('image');
    });

    it('loadImage succeeds', async () => {
      const img = { crossOrigin: '', src: '', onload: null as any, onerror: null as any, width: 100, height: 100 };
      vi.stubGlobal('Image', vi.fn(() => img));
      
      const promise = session.loadImage('test.png', 'url');
      img.onload();
      await promise;
      
      expect(session.currentSource?.type).toBe('image');
      expect(session.currentSource?.width).toBe(100);
    });

    it('loadImage fails', async () => {
      const img = { src: '', onload: null as any, onerror: null as any };
      vi.stubGlobal('Image', vi.fn(() => img));
      
      const promise = session.loadImage('test.png', 'url');
      img.onerror();
      await expect(promise).rejects.toThrow('Failed to load image');
    });

    it('loadVideo succeeds', async () => {
        const video = { 
          src: '', oncanplay: null as any, onerror: null as any, 
          duration: 10, videoWidth: 100, videoHeight: 100,
          load: vi.fn(),
          style: {},
          crossOrigin: '', preload: '', muted: false, volume: 1, loop: false, playsInline: false
        };
        vi.spyOn(document, 'createElement').mockReturnValue(video as any);
        
        const promise = session.loadVideo('test.mp4', 'url');
        video.oncanplay();
        await promise;
        
        expect(session.currentSource?.type).toBe('video');
        expect(session.currentSource?.duration).toBe(240); // 10 * 24
    });

    it('loadVideo fails', async () => {
        const video = { src: '', onerror: null as any, load: vi.fn() };
        vi.spyOn(document, 'createElement').mockReturnValue(video as any);
        
        const promise = session.loadVideo('test.mp4', 'url');
        video.onerror('error');
        await expect(promise).rejects.toThrow('Failed to load video');
    });
  });

  describe('sequences', () => {
    it('loadSequence sets up source and preloads', async () => {
      const { createSequenceInfo, preloadFrames } = await import('../../utils/SequenceLoader');
      (createSequenceInfo as any).mockResolvedValue({
        name: 'seq', width: 100, height: 100, frames: [ { image: {} } ], fps: 24
      });

      await session.loadSequence([]);
      expect(session.currentSource?.type).toBe('sequence');
      expect(preloadFrames).toHaveBeenCalled();
    });

    it('loadSequence throws if no sequence found', async () => {
      const { createSequenceInfo } = await import('../../utils/SequenceLoader');
      (createSequenceInfo as any).mockResolvedValue(null);
      await expect(session.loadSequence([])).rejects.toThrow('No valid image sequence found');
    });

    it('getSequenceFrameImage preloads and releases and returns image', async () => {
        const { loadFrameImage, preloadFrames, releaseDistantFrames } = await import('../../utils/SequenceLoader');
        const mockImg = {} as any;
        (loadFrameImage as any).mockResolvedValue(mockImg);
        
        const source: MediaSource = {
            type: 'sequence', name: 's', url: '', width: 100, height: 100, duration: 10, fps: 24,
            sequenceFrames: [{}] as any
        };
        session.setSources([source]);
        
        const img = await session.getSequenceFrameImage(1);
        expect(img).toBe(mockImg);
        expect(preloadFrames).toHaveBeenCalled();
        expect(releaseDistantFrames).toHaveBeenCalled();
    });

    it('getSequenceFrameSync returns cached image', () => {
        const mockImg = {} as any;
        const source: MediaSource = {
            type: 'sequence', name: 's', url: '', width: 100, height: 100, duration: 10, fps: 24,
            sequenceFrames: [{ image: mockImg }] as any
        };
        session.setSources([source]);
        expect(session.getSequenceFrameSync(1)).toBe(mockImg);
    });
  });

  describe('GTO detailed parsing', () => {
    it('parseScopes handles all protocols', () => {
        const s = session as any;
        const testScope = (proto: string, key: string) => {
            const dto = createMockDTO({ [proto]: [{ node: { active: 1 } }] });
            const scopes = s.parseScopes(dto);
            expect(scopes[key]).toBe(true);
        };

        testScope('Histogram', 'histogram');
        testScope('RVHistogram', 'histogram');
        testScope('Waveform', 'waveform');
        testScope('RVWaveform', 'waveform');
        testScope('Vectorscope', 'vectorscope');
        testScope('RVVectorscope', 'vectorscope');
        
        expect(s.parseScopes(createMockDTO({}))).toBeNull();
    });

    it('parseInitialSettings handles various components', () => {
      const dto = createMockDTO({
        RVColor: [{ color: { exposure: 1.5, gamma: 2.2, contrast: 1.1, saturation: 0.9, offset: 0.1 }, CDL: { active: 1, slope: [1,1,1], offset: [0,0,0], power: [1,1,1], saturation: 1 } }],
        RVDisplayColor: [{ color: { brightness: 0.5, gamma: 2.4 } }],
        RVTransform2D: [{ transform: { active: 1, rotate: 180, flip: 1, flop: 1 } }],
        RVLensWarp: [{ node: { active: 1 }, warp: { k1: 0.2, k2: 0.1, center: [0.6, 0.6] } }],
        RVFormat: [{ crop: { active: 1, xmin: 10, ymin: 10, xmax: 90, ymax: 90 } }],
        ChannelSelect: [{ node: { active: 1 }, parameters: { channel: 0 } }],
        RVDisplayStereo: [{ stereo: { type: 'pair', swap: 1, relativeOffset: 0.05 } }],
        Histogram: [{ node: { active: 1 } }],
        Waveform: [{ node: { active: 0 } }],
      });
      
      const settings = (session as any).parseInitialSettings(dto, { width: 100, height: 100 });
      expect(settings.colorAdjustments.exposure).toBe(1.5);
      expect(settings.colorAdjustments.brightness).toBe(0.5);
      expect(settings.transform.rotation).toBe(180);
      expect(settings.transform.flipV).toBe(true);
      expect(settings.lens.k1).toBe(0.2);
      expect(settings.lens.centerX).toBeCloseTo(0.1);
      expect(settings.crop.enabled).toBe(true);
      expect(settings.channelMode).toBe('red');
      expect(settings.stereo.mode).toBe('side-by-side');
      expect(settings.scopes.histogram).toBe(true);
      expect(settings.scopes.waveform).toBe(false);
    });

    it('parseInitialSettings returns null if no settings', () => {
        const dto = createMockDTO({});
        expect((session as any).parseInitialSettings(dto, { width: 0, height: 0 })).toBeNull();
    });

    it('parsePaintAnnotations handles pen and text', () => {
        const dto = createMockDTO({
            RVPaint: [{
                'frame:1': { order: ['pen:1', 'text:1'] },
                'pen:1': { color: [1,0,0,1], width: 0.5, points: [0,0,1,1] },
                'text:1': { position: [0,0], text: 'hello' },
                paint: { ghost: 1, hold: 1 }
            }]
        });
        const emitSpy = vi.spyOn(session, 'emit');
        (session as any).parsePaintAnnotations(dto, 1);
        expect(emitSpy).toHaveBeenCalledWith('annotationsLoaded', expect.anything());
    });

    it('parsePaintTagEffects handles JSON and string tags', () => {
        const s = session as any;
        expect(s.parsePaintTagEffects('{"ghost": true}')).toEqual({ ghost: true });
        expect(s.parsePaintTagEffects('ghost:1, hold=0, ghostBefore:5')).toEqual({ ghost: true, hold: false, ghostBefore: 5 });
        expect(s.parsePaintTagEffects('ghost hold')).toEqual({ ghost: true, hold: true });
    });
  });

  describe('volume and sync', () => {
    it('applyVolumeToVideo updates video element', () => {
        const video = document.createElement('video');
        Object.setPrototypeOf(video, HTMLVideoElement.prototype);
        
        let volume = 1.0;
        let muted = false;
        Object.defineProperty(video, 'volume', { get: () => volume, set: (v) => volume = v, configurable: true });
        Object.defineProperty(video, 'muted', { get: () => muted, set: (v) => muted = v, configurable: true });

        session.setSources([{
            type: 'video', name: 'v', url: 'v.mp4', width: 100, height: 100, duration: 100, fps: 24, element: video
        }]);
        
        session.volume = 0.5;
        expect(volume).toBe(0.5);
        
        session.muted = true;
        expect(volume).toBe(0);
        expect(muted).toBe(true);
    });

    it('syncVideoToFrame respects threshold', () => {
        const video = document.createElement('video');
        Object.setPrototypeOf(video, HTMLVideoElement.prototype);
        
        let currentTime = 1.0;
        Object.defineProperty(video, 'currentTime', { get: () => currentTime, set: (v) => currentTime = v, configurable: true });
        
        session.setSources([{
            type: 'video', name: 'v', url: 'v.mp4', width: 100, height: 100, duration: 100, fps: 24, element: video
        }]);
        
        (session as any)._currentFrame = 25; // 1.0s + 1/24s
        (session as any).syncVideoToFrame();
        // threshold is 0.1, (25-1)/24 = 1.0. diff is 0.
        expect(currentTime).toBe(1.0);
        
        (session as any)._currentFrame = 50; 
        (session as any).syncVideoToFrame();
        expect(currentTime).toBeCloseTo(49/24);
    });
  });

  describe('disposal', () => {
    it('dispose cleans up all sources', () => {
        const seqSource: MediaSource = { type: 'sequence', name: 's', url: '', width: 1, height: 1, duration: 1, fps: 1, sequenceFrames: [] as any };
        session.setSources([seqSource]);
        const disposeSpy = vi.spyOn(session as any, 'disposeSequenceSource');
        
        session.dispose();
        expect(disposeSpy).toHaveBeenCalled();
        expect((session as any).sources.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('setCurrentSource pauses video', () => {
        const video = document.createElement('video');
        Object.setPrototypeOf(video, HTMLVideoElement.prototype);
        video.pause = vi.fn();
        
        session.setSources([
            { type: 'video', name: 'v1', url: 'v1.mp4', width: 100, height: 100, duration: 100, fps: 24, element: video },
            { type: 'image', name: 'v2', url: 'v2.png', width: 100, height: 100, duration: 1, fps: 24, element: {} as any }
        ]);
        
        session.setCurrentSource(1);
        expect(video.pause).toHaveBeenCalled();
    });

    it('toggleAB syncs frame with clamping', () => {
        session.setSources([
            { type: 'image', name: 'a', url: 'a.png', width: 100, height: 100, duration: 100, fps: 24, element: {} as any },
            { type: 'image', name: 'b', url: 'b.png', width: 100, height: 100, duration: 50, fps: 24, element: {} as any }
        ]);
        session.setSourceB(1);
        session.currentFrame = 80;
        session.syncPlayhead = true;
        
        session.toggleAB(); // To B
        expect(session.currentFrame).toBe(50); // Clamped to B duration
    });

    it('GTO detailed parsing extra paths', () => {
        const s = session as any;
        
        // Test nested position in text - needs length 2 to trigger unwrap
        const textComp = {
            position: [[10, 20]],
            text: 'nested',
        };
        const text = s.parseTextAnnotation('text:1:1:user', 1, {
            property: (name: string) => ({ value: () => (textComp as any)[name], exists: () => name in textComp })
        } as any, 1);
        expect(text.position.x).toBe(10.5);

        // Test nested points in pen
        const penComp = {
            points: [[0,0], [1,1]],
            color: [1,1,1,1],
            width: [0.1]
        };
        const pen = s.parsePenStroke('pen:1:1:user', 1, {
            property: (name: string) => ({ value: () => (penComp as any)[name], exists: () => name in penComp })
        } as any, 1);
        expect(pen.points.length).toBe(2);
    });

    it('parseColorAdjustments contrast edge case', () => {
        const s = session as any;
        const mockObj = (data: any): any => ({
            exists: () => true,
            component: () => mockObj(data),
            property: (p: string) => ({ value: () => p === 'contrast' ? 0 : 1 })
        });

        const dto = {
            byProtocol: (proto: string) => {
                if (proto === 'RVColor') {
                    const res = [mockObj({})];
                    (res as any).first = () => res[0];
                    return res;
                }
                return [];
            }
        } as any;
        const adj = s.parseColorAdjustments(dto);
        expect(adj.contrast).toBe(1);
    });

    it('parseChannelMode and Stereo mapping coverage', () => {
        const s = session as any;
        const testChannel = (val: number, expected: string) => {
            const node = { component: (c: string) => ({ exists: () => true, property: () => ({ value: () => c === 'parameters' ? val : 1 }) }) };
            const results = [node];
            const dto = { byProtocol: () => results } as any;
            expect(s.parseChannelMode(dto)).toBe(expected);
        };
        testChannel(1, 'green');
        testChannel(5, 'luminance');
        testChannel(99, 'rgb'); // default

        const testStereo = (type: string, mode: string) => {
            const node = { component: () => ({ exists: () => true, property: (p: string) => ({ value: () => p === 'type' ? type : 0 }) }) };
            const results = [node];
            (results as any).first = () => node;
            const dto = { byProtocol: () => results } as any;
            expect(s.parseStereo(dto).mode).toBe(mode);
        };
        testStereo('vsqueezed', 'over-under');
        testStereo('checker', 'checkerboard');
        testStereo('unknown', 'off');
    });

    it('parseCDL RVLinearize path', () => {
        const s = session as any;
        const mockObj = (data: any): any => ({
            exists: () => data !== undefined,
            property: (name: string) => ({
                value: () => data?.[name],
                exists: () => data && name in data
            }),
            component: (name: string) => mockObj(data?.[name])
        });

        const dto = {
            byProtocol: (proto: string) => {
                if (proto === 'RVLinearize') return [mockObj({ CDL: { active: 1, slope: [2,2,2], offset: [0,0,0], power: [1,1,1], saturation: 1 } })];
                return [];
            }
        } as any;
        const cdl = s.parseCDL(dto);
        expect(cdl.slope.r).toBe(2);
    });

    it('A/B switching and clearing coverage', () => {
        session.setSources([
            { type: 'image', name: 'a', url: 'a.png', width: 1, height: 1, duration: 1, fps: 24, element: {} as any },
            { type: 'image', name: 'b', url: 'b.png', width: 1, height: 1, duration: 1, fps: 24, element: {} as any },
            { type: 'image', name: 'c', url: 'c.png', width: 1, height: 1, duration: 1, fps: 24, element: {} as any }
        ]);
        session.setSourceB(1);
        
        // setSourceA while A is active
        session.setCurrentAB('A');
        session.setSourceA(2);
        expect(session.currentSourceIndex).toBe(2);

        // setSourceB while B is active
        session.setCurrentAB('B');
        session.setSourceB(0);
        expect(session.currentSourceIndex).toBe(0);

        // clearSourceB while B is active
        session.setCurrentAB('B');
        session.clearSourceB();
        expect(session.currentAB).toBe('A');
        expect(session.currentSourceIndex).toBe(2);
    });

    it('parsePaintAnnotations with annotation component', () => {
        const s = session as any;
        const dto = createMockDTO({
            RVPaint: [{
                'frame:1': { order: [] },
                annotation: { ghost: 1, active: 1 }
            }]
        });
        const emitSpy = vi.spyOn(session, 'emit');
        s.parsePaintAnnotations(dto, 1);
        expect(emitSpy).toHaveBeenCalledWith('annotationsLoaded', expect.anything());
    });

    it('sequence frame negative paths', async () => {
        session.setSources([{ type: 'image', name: 'i', url: '', width: 1, height: 1, duration: 1, fps: 1 }]);
        expect(await session.getSequenceFrameImage(1)).toBeNull();
        expect(session.getSequenceFrameSync(1)).toBeNull();
        
        session.setSources([{ type: 'sequence', name: 's', url: '', width: 1, height: 1, duration: 1, fps: 1, sequenceFrames: [] as any }]);
        expect(await session.getSequenceFrameImage(10)).toBeNull();
    });

    it('parsePenStroke edge cases', () => {
        const s = session as any;
        const testPen = (overrides: any) => {
            const comp = {
                points: [[0,0], [1,1]], color: [1,1,1,1], width: [0.1],
                ...overrides
            };
            return s.parsePenStroke('pen:1:1:user', 1, {
                property: (name: string) => ({ value: () => (comp as any)[name], exists: () => name in comp })
            } as any, 1);
        };
        
        expect(testPen({ join: 0 }).join).toBe(2); // Miter is internal 2
        expect(testPen({ join: 2 }).join).toBe(1); // Bevel is internal 1
        expect(testPen({ cap: 0 }).cap).toBe(0); // NoCap is internal 0
        expect(testPen({ cap: 2 }).cap).toBe(1); // Square is internal 1
        
        // Empty points
        const emptyPen = s.parsePenStroke('pen:1', 1, {
            property: (_name: string) => ({ value: () => [], exists: () => true })
        } as any, 1);
        expect(emptyPen).toBeNull();
    });

    it('video loop resets to inPoint', () => {
        const video = createMockVideo(100, 0);
        Object.setPrototypeOf(video, HTMLVideoElement.prototype);
        const source: MediaSource = {
            type: 'video', name: 'v', url: 'v.mp4', width: 100, height: 100, duration: 100, fps: 24, element: video
        };
        session.setSources([source]);
        
        session.setOutPoint(20);
        session.setInPoint(10);
        session.loopMode = 'loop';
        session.play();
        
        // Simulate video ended or reached outPoint
        video.currentTime = 21/24;
        session.update();
        expect(video.currentTime).toBe(9/24); // (10-1)/24
    });

    it('parseSession with session component details', async () => {
        const dto = createMockDTO({
            RVSession: [{
                session: {
                    frame: 15,
                    range: [[5, 25]], // nested array path
                    marks: [10, 20]
                }
            }]
        });
        (session as any).parseSession(dto);
        expect(session.currentFrame).toBe(15);
        expect(session.inPoint).toBe(5);
        expect(session.outPoint).toBe(25);
        expect(session.marks.has(10)).toBe(true);
    });

    it('resolveRange extra paths', () => {
        const s = session as any;
        const testRange = (val: any) => {
            const dto = createMockDTO({ RVSession: [{ session: { range: val } }] });
            s.parseSession(dto);
            return [session.inPoint, session.outPoint];
        };
        
        expect(testRange([10, 20])).toEqual([10, 20]);
        expect(testRange(new Int32Array([30, 40]))).toEqual([30, 40]);
        expect(testRange([[50, 60]])).toEqual([50, 60]);
        expect(testRange([[100, 110], [120, 130]])).toEqual([100, 110]); // Line 634 path
        expect(testRange([100])).toEqual([100, 110]); // invalid, should keep previous
    });

    it('parseSession with file sources and settings', () => {
        const dto = createMockDTO({
            RVFileSource: [
                {
                    proxy: { size: [1920, 1080] },
                    media: { movie: 'test.mov' }
                }
            ],
            Histogram: [{ node: { active: 1 } }],
            RVDisplayStereo: [{ stereo: { type: 'pair', swap: 1, relativeOffset: 0.1 } }]
        });
        const spy = vi.fn();
        session.on('settingsLoaded', spy);
        (session as any).parseSession(dto);
        expect(spy).toHaveBeenCalled();
        const settings = spy.mock.calls[0][0];
        expect(settings.scopes.histogram).toBe(true);
    });

    it('setPlaybackState coverage', () => {
        session.setSources([{ type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 1000, fps: 24 }]);
        session.setOutPoint(1000);
        session.setPlaybackState({
            outPoint: 100,
            inPoint: 10,
            currentFrame: 50,
            loopMode: 'once',
            volume: 0.5,
            muted: true,
            marks: [5, 15]
        });
        expect(session.currentFrame).toBe(50);
        expect(session.loopMode).toBe('once');
        expect(session.volume).toBe(0.5);
        expect(session.muted).toBe(true);
        expect(session.inPoint).toBe(10);
        expect(session.outPoint).toBe(100);
        expect(session.marks.has(5)).toBe(true);
    });

    it('currentFrame setter emits', () => {
        const spy = vi.fn();
        session.on('frameChanged', spy);
        session.setSources([{ type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24 }]);
        session.setOutPoint(100);
        session.currentFrame = 33;
        expect(session.currentFrame).toBe(33);
        expect(spy).toHaveBeenCalledWith(33);
    });

    it('syncVideoToFrame edge cases', () => {
        const video = createMockVideo(100, 0);
        Object.setPrototypeOf(video, HTMLVideoElement.prototype);
        session.setSources([{
            type: 'video', name: 'v', url: 'v.mp4', width: 100, height: 100, duration: 100, fps: 24, element: video
        }]);
        
        // When diff < threshold (1/fps/2 = 1/48 = 0.0208), it should NOT sync
        // frame 10 at 24fps -> target is (10-1)/24 = 0.375
        video.currentTime = 0.375 + 0.01; // diff = 0.01 < 0.02
        (session as any)._currentFrame = 10;
        (session as any).syncVideoToFrame();
        expect(video.currentTime).toBe(0.385); // No change
        
        // When diff > threshold, it should sync
        video.currentTime = 0;
        (session as any).syncVideoToFrame();
        expect(video.currentTime).toBeCloseTo(0.375, 5);
    });

    it('loadFromGTO handles graph parse error gracefully', async () => {
        const gtoJs = await import('gto-js');
        vi.spyOn(gtoJs.SimpleReader.prototype, 'open').mockImplementation((_c, _n) => true);
        (gtoJs.SimpleReader.prototype as any).result = {};
        
        const loader = await import('./GTOGraphLoader');
        vi.spyOn(loader, 'loadGTOGraph').mockImplementation(() => { throw new Error('graph fail'); });
        
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await session.loadFromGTO('GTOa 1.0');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load node graph'), 'graph fail');
    });

    it('loadFromGTO handles success with graph info', async () => {
        const gtoJs = await import('gto-js');
        vi.spyOn(gtoJs.SimpleReader.prototype, 'open').mockImplementation((_c, _n) => true);
        (gtoJs.SimpleReader.prototype as any).result = {};
        
        const loader = await import('./GTOGraphLoader');
        vi.spyOn(loader, 'loadGTOGraph').mockImplementation(() => ({
            graph: new Graph(),
            rootNode: { name: 'root' },
            nodes: new Map([['n', {}]]),
            sessionInfo: { fps: 30, frame: 10, inPoint: 5, outPoint: 20, marks: [7, 8] }
        }) as any);
        
        await session.loadFromGTO('GTOa 1.0');
        expect(session.fps).toBe(30);
        expect(session.currentFrame).toBe(10);
        expect(session.inPoint).toBe(5);
        expect(session.outPoint).toBe(20);
        expect(session.marks.has(7)).toBe(true);
    });

    it('extra logic coverage', () => {
        const s = session as any;
        session.setSources([{ type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24 }]);
        session.setOutPoint(100);
        
        // gtoData
        expect(session.gtoData).toBeNull();
        
        // Navigation
        session.stepForward();
        expect(session.currentFrame).toBe(2);
        session.stepBackward();
        expect(session.currentFrame).toBe(1);
        session.goToFrame(10);
        expect(session.currentFrame).toBe(10);
        session.goToStart();
        expect(session.currentFrame).toBe(session.inPoint);
        session.goToEnd();
        expect(session.currentFrame).toBe(session.outPoint);
        
        // play() in reverse
        const video = createMockVideo(100, 0);
        Object.setPrototypeOf(video, HTMLVideoElement.prototype);
        session.setSources([{
            type: 'video', name: 'v', url: 'v.mp4', width: 100, height: 100, duration: 100, fps: 24, element: video
        }]);
        session.goToFrame(10);
        s._playDirection = -1;
        s.lastFrameTime = performance.now();
        session.play();
        expect(video.pause).toHaveBeenCalled();
        session.update(); // trigger reverse seek logic
        expect(video.currentTime).toBeCloseTo(0.375, 5); // (10-1)/24 = 0.375
        
        // togglePlayDirection while playing with video
        s._isPlaying = true;
        s._playDirection = 1;
        session.togglePlayDirection(); // switch to -1
        expect(video.pause).toHaveBeenCalled();
        session.togglePlayDirection(); // switch to 1
        expect(video.play).toHaveBeenCalled();
        
        // setOutPoint clamps currentFrame
        session.currentFrame = 100;
        session.setOutPoint(50);
        expect(session.currentFrame).toBe(50);
        
        // marks toggling
        session.toggleMark(); // without args
        expect(session.marks.has(50)).toBe(true);
        session.toggleMark(10);
        expect(session.marks.has(10)).toBe(true);
        session.toggleMark(10);
        expect(session.marks.has(10)).toBe(false);
        
        // parseChannelMode continue
        const dto = createMockDTO({
            ChannelSelect: [
                { node: { active: 0 } },
                { node: { active: 1 }, parameters: { channel: 4 } }
            ]
        });
        expect(s.parseChannelMode(dto)).toBe('rgb');
        
        // getNumberArray edge cases
        expect(s.getNumberArray('not an array')).toBeUndefined();
        expect(s.getNumberArray([1, 'mix', 2])).toEqual([1, 2]);
        
        // setSources index clamp - this test needs to be revisited if _currentSourceIndex is not clamped in setSources
        s._currentSourceIndex = 10;
        session.setSources([]);
    });

    it('paint and CDL edge cases', () => {
        const s = session as any;
        
        // CDL failure and active=0 and RVLinearize path
        const dtoCDL = createMockDTO({
            RVLinearize: [{ CDL: { active: 1, slope: [1,1,1], offset: [0,0,0], power: [1,1,1], saturation: 1 } }]
        });
        expect(s.parseCDL(dtoCDL)).not.toBeNull();
        
        // Paint tag effects JSON and error paths
        const effects = s.parsePaintTagEffects('{"ghost": true, "ghostafter": 5, "unknown": 1}');
        expect(effects.ghost).toBe(true);
        expect(effects.ghostAfter).toBe(5);
        expect(s.parsePaintTagEffects('not json or tags')).toBeNull();
        expect(s.parsePaintTagEffects('{ invalid json }')).toBeNull(); // trigger catch
        
        // parsePenStroke flat points and numeric width
        const penComp = {
            points: [0,0, 1,1], color: [1,1,1,1], width: 0.5
        };
        const pen = s.parsePenStroke('pen:1', 1, {
            property: (name: string) => ({ value: () => (penComp as any)[name], exists: () => name in penComp })
        } as any, 1);
        expect(pen.points.length).toBe(2);
        expect(pen.width).toBe(0.5 * 500); // RV_PEN_WIDTH_SCALE=500
        
        // parsePaintAnnotations with frame component and tag effects
        const dtoPaint = createMockDTO({
            RVPaint: [{
                'frame:15': { order: ['pen:1', 'text:1', 'unknown:1'] },
                'pen:1': { points: [0,0, 1,1], color: [1,1,1,1], width: 0.5 },
                'text:1': { position: [0,0], color: [1,1,1,1], text: 'hi' },
                'tagEffects': { 'tag:default': 'exposure=2.5; ghost' },
                'annotation': {} // extra component
            }]
        });
        s.parsePaintAnnotations(dtoPaint, 1);
        
        // parseCrop edge cases
        const dtoCrop = createMockDTO({
            RVFormat: [{ crop: { active: 0 } }]
        });
        expect(s.parseCrop(dtoCrop, { width: 100, height: 100 })).toBeNull();
        
        // getBooleanValue array of number
        expect(s.getBooleanValue([1])).toBe(true);
        expect(s.getBooleanValue([0])).toBe(false);
        
        // parseChannelMode loop return null
        const dtoChannel = createMockDTO({
            ChannelSelect: [{ node: { active: 1 } }]
        });
        expect(s.parseChannelMode(dtoChannel)).toBeNull();
    });

    it('forward playback wrapping overrides', () => {
        session.setSources([{ type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 20, fps: 24 }]);
        session.setInPoint(10);
        session.setOutPoint(15);
        
        session.currentFrame = 15;
        session.loopMode = 'once';
        session.play();
        (session as any).advanceFrame(1);
        expect(session.isPlaying).toBe(false);
        expect(session.currentFrame).toBe(15);
        
        session.currentFrame = 15;
        session.loopMode = 'loop';
        session.play();
        (session as any).advanceFrame(1);
        expect(session.currentFrame).toBe(10);
        
        session.currentFrame = 15;
        session.loopMode = 'pingpong';
        session.play();
        (session as any).advanceFrame(1);
        expect(session.playDirection).toBe(-1);
        expect(session.currentFrame).toBe(14);
    });
  });

  describe('effective FPS tracking', () => {
    it('SES-038: effectiveFps returns 0 when not playing', () => {
      expect(session.isPlaying).toBe(false);
      expect(session.effectiveFps).toBe(0);
    });

    it('SES-039: effectiveFps resets when play() is called', () => {
      // Set up a source
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      // Access internal state
      const internal = session as any;

      // Manually set some FPS tracking state
      internal._effectiveFps = 30;
      internal.fpsFrameCount = 10;

      // Play should reset FPS tracking
      session.play();

      expect(internal.fpsFrameCount).toBe(0);
      expect(internal._effectiveFps).toBe(0);
    });

    it('SES-040: effectiveFps is calculated during frame advancement', () => {
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      // Mock performance.now to control timing
      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;

      // Set up the conditions for FPS calculation:
      // - Start with 11 frames already counted
      // - Set fpsLastTime to 0
      // - Then call advanceFrame with mockTime = 500
      // This will make fpsFrameCount = 12, elapsed = 500, FPS = 12/500*1000 = 24
      internal.fpsFrameCount = 11;
      internal.fpsLastTime = 0;
      mockTime = 500;

      // One more advanceFrame triggers the FPS calculation
      internal.advanceFrame(1);

      // FPS should be calculated: 12 frames / 500ms * 1000 = 24 fps
      expect(internal._effectiveFps).toBeCloseTo(24, 0);

      vi.restoreAllMocks();
    });

    it('SES-041: effectiveFps updates every 500ms', () => {
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;

      // Advance a few frames but less than 500ms - should not update FPS yet
      mockTime = 200;
      internal.fpsLastTime = 0;

      internal.advanceFrame(1);
      internal.advanceFrame(1);
      internal.advanceFrame(1);

      // FPS should still be 0 (not enough time elapsed)
      expect(internal._effectiveFps).toBe(0);

      // Now advance past 500ms
      mockTime = 600;
      internal.advanceFrame(1);

      // Now FPS should be calculated: 4 frames / 600ms * 1000 ≈ 6.67 fps
      expect(internal._effectiveFps).toBeGreaterThan(0);

      vi.restoreAllMocks();
    });

    it('SES-042: effectiveFps returns 0 after pause', () => {
      session.setSources([{
        type: 'image', name: 'i', url: 'i.jpg', width: 100, height: 100, duration: 100, fps: 24
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      session.play();
      internal._effectiveFps = 24; // Simulate measured FPS

      // While playing, effectiveFps should return the value
      expect(session.effectiveFps).toBe(24);

      // After pause, effectiveFps should return 0
      session.pause();
      expect(session.effectiveFps).toBe(0);
    });
  });

  describe('mediabunny playback frame fetching', () => {
    // Helper to create mock VideoSourceNode with minimal interface
    const createMockVideoSourceNode = (hasFrameCachedFn: (frame: number) => boolean = () => false) => ({
      isUsingMediabunny: vi.fn(() => true),
      hasFrameCached: vi.fn(hasFrameCachedFn),
      getFrameAsync: vi.fn().mockResolvedValue(null),
      preloadForPlayback: vi.fn().mockResolvedValue(undefined),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      stopPlaybackPreload: vi.fn(),
    });

    it('SES-043: playback waits when next frame is not cached', () => {
      // Frame NOT cached - playback should wait (not advance)
      const mockVideoNode = createMockVideoSourceNode(() => false);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;
      const startFrame = session.currentFrame;

      // Advance time enough for multiple frames at 24fps
      mockTime = 100;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      session.update();

      // Observable behavior: frame should NOT advance when not cached
      expect(session.currentFrame).toBe(startFrame);

      vi.restoreAllMocks();
    });

    it('SES-044: playback advances when next frame is cached', () => {
      // Frame IS cached - playback should advance
      const mockVideoNode = createMockVideoSourceNode(() => true);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;
      const startFrame = session.currentFrame;

      // Advance time enough for frames at 24fps (~41ms per frame)
      mockTime = 100;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      session.update();

      // Observable behavior: frame should advance when cached
      expect(session.currentFrame).toBeGreaterThan(startFrame);

      vi.restoreAllMocks();
    });

    it('SES-045: playback resumes after cached frame becomes available', () => {
      // Simulate frame becoming cached after initial wait
      let frameAvailable = false;
      const mockVideoNode = createMockVideoSourceNode(() => frameAvailable);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 10;

      mockTime = 50;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      // First update - frame not available, should wait
      session.update();
      expect(session.currentFrame).toBe(10);

      // Frame becomes available
      frameAvailable = true;
      mockTime = 100;

      // Second update - frame now available, should advance
      session.update();
      expect(session.currentFrame).toBeGreaterThan(10);

      vi.restoreAllMocks();
    });

    it('SES-046: loop correctly waits for frame 1 when not cached', () => {
      // At outPoint, looping back to frame 1 which is NOT cached
      const mockVideoNode = createMockVideoSourceNode((frame: number) => frame !== 1);
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);
      session.loopMode = 'loop';

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 100; // At outPoint

      mockTime = 100;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      session.update();

      // Observable behavior: should stay at frame 100 waiting for frame 1 to be fetched
      // The loop target (frame 1) is not cached, so playback waits
      expect(session.currentFrame).toBe(100);

      vi.restoreAllMocks();
    });

    it('SES-047: loop successfully transitions when frame 1 becomes cached', () => {
      // At outPoint, looping back to frame 1 - initially not cached, then cached
      let frame1Cached = false;
      const mockVideoNode = createMockVideoSourceNode((frame: number) => {
        if (frame === 1) return frame1Cached;
        return true; // Other frames cached
      });
      const mockVideo = createMockVideo(100, 0);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);

      session.setSources([{
        type: 'video',
        name: 'v',
        url: 'v.mp4',
        width: 100,
        height: 100,
        duration: 100,
        fps: 24,
        element: mockVideo,
        videoSourceNode: mockVideoNode as any,
      }]);
      session.setOutPoint(100);
      session.loopMode = 'loop';

      const internal = session as any;

      let mockTime = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

      session.play();
      internal._currentFrame = 100; // At outPoint

      mockTime = 50;
      internal.lastFrameTime = 0;
      internal.frameAccumulator = 0;

      // First update - frame 1 not cached, waits at frame 100
      session.update();
      expect(session.currentFrame).toBe(100);

      // Frame 1 becomes cached
      frame1Cached = true;
      mockTime = 100;

      // Second update - frame 1 now available, loop happens
      // Observable: we're no longer stuck at 100, playback resumed from beginning
      session.update();
      expect(session.currentFrame).toBeLessThan(100); // Looped back to beginning
      expect(session.currentFrame).toBeGreaterThanOrEqual(1); // At or past frame 1

      vi.restoreAllMocks();
    });
  });

  describe('loadVideoSourcesFromGraph', () => {
    // Helper to create mock canvas
    const createMockCanvas = () => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
        putImageData: vi.fn(),
        clearRect: vi.fn(),
      })),
    });

    // Helper to mock document.createElement for both video and canvas
    const setupElementMocks = (mockVideo: ReturnType<typeof createMockVideo>) => {
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'video') {
          return mockVideo as any;
        }
        if (tagName === 'canvas') {
          return createMockCanvas() as any;
        }
        return originalCreateElement(tagName);
      });
    };

    it('loads video source with File object and calls loadFile', async () => {
      const mockFile = new File(['video content'], 'test.mp4', { type: 'video/mp4' });

      // Setup mocks before creating VideoSourceNode
      const mockVideo = createMockVideo(1920, 1080);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);
      setupElementMocks(mockVideo);

      // Mock URL.createObjectURL
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:loaded'),
        revokeObjectURL: vi.fn()
      });

      // Create a mock VideoSourceNode
      const { VideoSourceNode } = await import('../../nodes/sources/VideoSourceNode');
      const videoNode = new VideoSourceNode('Test Video');
      videoNode.properties.setValue('file', mockFile);
      videoNode.properties.setValue('url', 'blob:test');

      // Mock loadFile to avoid actual video loading
      const loadFileSpy = vi.spyOn(videoNode, 'loadFile').mockResolvedValue({
        success: true,
        useMediabunny: true,
      });
      vi.spyOn(videoNode, 'getMetadata').mockReturnValue({
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
      });
      vi.spyOn(videoNode, 'isUsingMediabunny').mockReturnValue(true);
      vi.spyOn(videoNode, 'preloadFrames').mockResolvedValue();

      // Trigger oncanplay immediately
      setTimeout(() => {
        (mockVideo as any).oncanplay?.();
      }, 0);

      const { Graph } = await import('../graph/Graph');
      const mockResult = {
        graph: new Graph(),
        rootNode: null,
        nodes: new Map([['video1', videoNode]]),
        sessionInfo: { name: 'Test Session' },
      };

      await (session as any).loadVideoSourcesFromGraph(mockResult);

      // Verify loadFile was called with the File object
      expect(loadFileSpy).toHaveBeenCalledWith(mockFile, session.fps);

      // Verify source was added (use any cast to access protected property)
      const sources = (session as any).sources;
      expect(sources.length).toBe(1);
      expect(sources[0]?.type).toBe('video');
      expect(sources[0]?.videoSourceNode).toBe(videoNode);
    });

    it('loads video source from URL when no File available', async () => {
      // Setup mocks before creating VideoSourceNode
      const mockVideo = createMockVideo(1920, 1080);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);
      setupElementMocks(mockVideo);

      // Create a mock VideoSourceNode
      const { VideoSourceNode } = await import('../../nodes/sources/VideoSourceNode');
      const videoNode = new VideoSourceNode('Test Video');
      videoNode.properties.setValue('url', 'https://example.com/video.mp4');
      // No file property set

      // Mock load to avoid actual video loading
      const loadSpy = vi.spyOn(videoNode, 'load').mockResolvedValue();
      vi.spyOn(videoNode, 'getMetadata').mockReturnValue({
        name: 'video.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
      });
      vi.spyOn(videoNode, 'isUsingMediabunny').mockReturnValue(false);

      // Trigger oncanplay immediately
      setTimeout(() => {
        (mockVideo as any).oncanplay?.();
      }, 0);

      const { Graph } = await import('../graph/Graph');
      const mockResult = {
        graph: new Graph(),
        rootNode: null,
        nodes: new Map([['video1', videoNode]]),
        sessionInfo: { name: 'Test Session' },
      };

      await (session as any).loadVideoSourcesFromGraph(mockResult);

      // Verify load was called with URL (not loadFile)
      expect(loadSpy).toHaveBeenCalledWith('https://example.com/video.mp4', 'Test Video', session.fps);

      // Verify source was added without mediabunny
      const sources = (session as any).sources;
      expect(sources.length).toBe(1);
      expect(sources[0]?.type).toBe('video');
    });

    it('skips non-VideoSourceNode nodes', async () => {
      const { Graph } = await import('../graph/Graph');
      const { FileSourceNode } = await import('../../nodes/sources/FileSourceNode');

      const imageNode = new FileSourceNode('Test Image');

      const mockResult = {
        graph: new Graph(),
        rootNode: null,
        nodes: new Map([['image1', imageNode]]),
        sessionInfo: { name: 'Test Session' },
      };

      await (session as any).loadVideoSourcesFromGraph(mockResult);

      // No sources should be added for non-video nodes
      const sources = (session as any).sources;
      expect(sources.length).toBe(0);
    });

    it('emits sourceLoaded and durationChanged events', async () => {
      const mockFile = new File(['video content'], 'test.mp4', { type: 'video/mp4' });

      // Setup mocks before creating VideoSourceNode
      const mockVideo = createMockVideo(1920, 1080);
      Object.setPrototypeOf(mockVideo, HTMLVideoElement.prototype);
      setupElementMocks(mockVideo);

      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:loaded'),
        revokeObjectURL: vi.fn()
      });

      const { VideoSourceNode } = await import('../../nodes/sources/VideoSourceNode');
      const videoNode = new VideoSourceNode('Test Video');
      videoNode.properties.setValue('file', mockFile);
      videoNode.properties.setValue('url', 'blob:test');

      vi.spyOn(videoNode, 'loadFile').mockResolvedValue({
        success: true,
        useMediabunny: false,
      });
      vi.spyOn(videoNode, 'getMetadata').mockReturnValue({
        name: 'test.mp4',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
      });
      vi.spyOn(videoNode, 'isUsingMediabunny').mockReturnValue(false);

      setTimeout(() => {
        (mockVideo as any).oncanplay?.();
      }, 0);

      const sourceLoadedSpy = vi.fn();
      const durationChangedSpy = vi.fn();
      session.on('sourceLoaded', sourceLoadedSpy);
      session.on('durationChanged', durationChangedSpy);

      const { Graph } = await import('../graph/Graph');
      const mockResult = {
        graph: new Graph(),
        rootNode: null,
        nodes: new Map([['video1', videoNode]]),
        sessionInfo: { name: 'Test Session' },
      };

      await (session as any).loadVideoSourcesFromGraph(mockResult);

      expect(sourceLoadedSpy).toHaveBeenCalled();
      expect(durationChangedSpy).toHaveBeenCalledWith(100);
    });
  });

  describe('split screen playback support', () => {
    // Helper to create a complete mock video source node
    const createMockVideoSourceNode = (usesMediabunny = true) => ({
      isUsingMediabunny: vi.fn().mockReturnValue(usesMediabunny),
      setPlaybackDirection: vi.fn(),
      startPlaybackPreload: vi.fn(),
      hasFrameCached: vi.fn().mockReturnValue(true),
      getFrameAsync: vi.fn().mockResolvedValue({}),
      updatePlaybackBuffer: vi.fn(),
      stopPlaybackPreload: vi.fn(),
      preloadFrames: vi.fn().mockResolvedValue(undefined),
    });

    it('SPLIT-001: startSourceBPlaybackPreload is called when playback starts with source B', () => {
      // Create mock video sources with videoSourceNode
      const mockVideoNodeA = createMockVideoSourceNode();
      const mockVideoNodeB = createMockVideoSourceNode();

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      // Play should start preloading for both source A and source B
      session.play();

      expect(mockVideoNodeA.startPlaybackPreload).toHaveBeenCalled();
      expect(mockVideoNodeB.startPlaybackPreload).toHaveBeenCalled();
    });

    it('SPLIT-002: stopSourceBPlaybackPreload is called when playback pauses', () => {
      const mockVideoNodeA = createMockVideoSourceNode();
      const mockVideoNodeB = createMockVideoSourceNode();

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      session.play();
      session.pause();

      expect(mockVideoNodeA.stopPlaybackPreload).toHaveBeenCalled();
      expect(mockVideoNodeB.stopPlaybackPreload).toHaveBeenCalled();
    });

    it('SPLIT-003: updateSourceBPlaybackBuffer is called during playback when frame advances', () => {
      const mockVideoNodeA = createMockVideoSourceNode();
      const mockVideoNodeB = createMockVideoSourceNode();

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);
      sessionInternal._outPoint = 100;

      session.play();

      // Clear mocks after play to only track calls during update
      mockVideoNodeB.updatePlaybackBuffer.mockClear();

      // Simulate time passing to trigger frame advance
      sessionInternal.lastFrameTime = performance.now() - 100;
      sessionInternal.frameAccumulator = 50;

      session.update();

      // Source B's buffer should be updated when frame advances (key fix for split screen)
      expect(mockVideoNodeB.updatePlaybackBuffer).toHaveBeenCalled();
    });

    it('SPLIT-004: source B without mediabunny is handled gracefully', () => {
      const mockVideoNodeA = createMockVideoSourceNode();
      // Source B doesn't use mediabunny
      const mockVideoNodeB = createMockVideoSourceNode(false);

      const videoA = createMockVideo();
      const videoB = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      const sourceB: MediaSource = {
        name: 'videoB.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoB.mp4',
        element: videoB,
        videoSourceNode: mockVideoNodeB as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      // Should not throw
      expect(() => {
        session.play();
        session.pause();
      }).not.toThrow();
    });

    it('SPLIT-005: source B as image is handled gracefully', () => {
      const mockVideoNodeA = createMockVideoSourceNode();

      const videoA = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };
      // Source B is an image, not a video
      const sourceB: MediaSource = {
        name: 'imageB.png',
        type: 'image',
        duration: 1,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'imageB.png',
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      sessionInternal.addSource(sourceB);

      // Should not throw - image sources don't have videoSourceNode
      expect(() => {
        session.play();
        session.pause();
      }).not.toThrow();
    });

    it('SPLIT-006: no source B is handled gracefully', () => {
      const mockVideoNodeA = createMockVideoSourceNode();

      const videoA = createMockVideo();

      const sourceA: MediaSource = {
        name: 'videoA.mp4',
        type: 'video',
        duration: 100,
        fps: 24,
        width: 1920,
        height: 1080,
        url: 'videoA.mp4',
        element: videoA,
        videoSourceNode: mockVideoNodeA as any,
      };

      const sessionInternal = session as any;
      sessionInternal.addSource(sourceA);
      // Don't add source B - only one source

      // Clear auto-assigned source B
      session.clearSourceB();

      // Should not throw when there's no source B
      expect(() => {
        session.play();
        session.pause();
      }).not.toThrow();

      expect(mockVideoNodeA.startPlaybackPreload).toHaveBeenCalled();
      expect(mockVideoNodeA.stopPlaybackPreload).toHaveBeenCalled();
    });
  });

  describe('preservesPitch', () => {
    it('SES-PITCH-001: defaults to true', () => {
      expect(session.preservesPitch).toBe(true);
    });

    it('SES-PITCH-002: can be set to false', () => {
      session.preservesPitch = false;
      expect(session.preservesPitch).toBe(false);
    });

    it('SES-PITCH-003: can be toggled back to true', () => {
      session.preservesPitch = false;
      session.preservesPitch = true;
      expect(session.preservesPitch).toBe(true);
    });

    it('SES-PITCH-004: emits preservesPitchChanged event', () => {
      const handler = vi.fn();
      session.on('preservesPitchChanged', handler);

      session.preservesPitch = false;
      expect(handler).toHaveBeenCalledWith(false);

      session.preservesPitch = true;
      expect(handler).toHaveBeenCalledWith(true);
    });

    it('SES-PITCH-005: does not emit event when value unchanged', () => {
      const handler = vi.fn();
      session.on('preservesPitchChanged', handler);

      // Set to same value
      session.preservesPitch = true;
      expect(handler).not.toHaveBeenCalled();
    });

    it('SES-PITCH-006: applies to video element when set', () => {
      const video = createMockVideo();
      session.setSources([{
        type: 'video',
        name: 'test.mp4',
        url: 'blob:test',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        element: video,
      }]);

      // Default should be true
      session.preservesPitch = false;
      expect(video.preservesPitch).toBe(false);

      session.preservesPitch = true;
      expect(video.preservesPitch).toBe(true);
    });

    it('SES-PITCH-007: is included in getPlaybackState', () => {
      const state = session.getPlaybackState();
      expect(state.preservesPitch).toBe(true);

      session.preservesPitch = false;
      const state2 = session.getPlaybackState();
      expect(state2.preservesPitch).toBe(false);
    });

    it('SES-PITCH-008: is restored by setPlaybackState', () => {
      session.preservesPitch = true;
      session.setPlaybackState({ preservesPitch: false });
      expect(session.preservesPitch).toBe(false);

      session.setPlaybackState({ preservesPitch: true });
      expect(session.preservesPitch).toBe(true);
    });

    it('SES-PITCH-009: setPlaybackState without preservesPitch does not change it', () => {
      session.preservesPitch = false;
      session.setPlaybackState({ volume: 0.5 });
      expect(session.preservesPitch).toBe(false);
    });
  });
});
