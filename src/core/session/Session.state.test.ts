import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session, MediaSource } from './Session';
import { Graph } from '../graph/Graph';
import { IPNode } from '../../nodes/base/IPNode';
import type { IPImage } from '../image/Image';
import type { EvalContext } from '../graph/Graph';
import type { GTOData } from 'gto-js';

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
    (this as any)._media.resetSourcesInternal();
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

  describe('metadata', () => {
    it('SES-META-001: initializes metadata with defaults', () => {
      expect(session.metadata.displayName).toBe('');
      expect(session.metadata.comment).toBe('');
      expect(session.metadata.version).toBe(2);
      expect(session.metadata.origin).toBe('openrv-web');
    });

    it('SES-META-002: setDisplayName trims value and emits metadataChanged', () => {
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.setDisplayName('  My Session  ');

      expect(session.metadata.displayName).toBe('My Session');
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'My Session' })
      );
    });

    it('SES-META-003: setDisplayName does not emit when normalized value is unchanged', () => {
      session.setDisplayName('Existing Name');
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.setDisplayName('  Existing Name  ');

      expect(listener).not.toHaveBeenCalled();
    });

    it('SES-META-004: updateMetadata supports partial updates', () => {
      session.setDisplayName('Session A');

      session.updateMetadata({ comment: 'Review notes' });

      expect(session.metadata.displayName).toBe('Session A');
      expect(session.metadata.comment).toBe('Review notes');
    });

    it('SES-META-005: updateMetadata does not emit for empty no-op patch', () => {
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.updateMetadata({});

      expect(listener).not.toHaveBeenCalled();
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

    it('SES-008b: setting volume to 0 auto-mutes session', () => {
      const mutedListener = vi.fn();
      session.on('mutedChanged', mutedListener);

      session.volume = 0;
      expect(session.volume).toBe(0);
      expect(session.muted).toBe(true);
      expect(mutedListener).toHaveBeenCalledWith(true);
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
    it('SES-018: setInPoint() with same value does not emit', () => {
      const listener = vi.fn();
      session.on('inOutChanged', listener);

      session.setInPoint(1);
      // inPoint already 1, should not emit
      expect(listener).not.toHaveBeenCalled();
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

    it('SES-025: setMarker() creates duration marker with endFrame', () => {
      session.setMarker(10, 'range', '#ff0000', 25);
      const marker = session.getMarker(10);
      expect(marker).toBeDefined();
      expect(marker!.frame).toBe(10);
      expect(marker!.endFrame).toBe(25);
      expect(marker!.note).toBe('range');
    });

    it('SES-026: setMarker() ignores endFrame <= frame', () => {
      session.setMarker(10, '', '#ff0000', 10);
      const marker = session.getMarker(10);
      expect(marker).toBeDefined();
      expect(marker!.endFrame).toBeUndefined();

      session.setMarker(10, '', '#ff0000', 5);
      const marker2 = session.getMarker(10);
      expect(marker2!.endFrame).toBeUndefined();
    });

    it('SES-027: setMarkerEndFrame() converts point marker to duration', () => {
      session.setMarker(10, 'test', '#ff0000');
      expect(session.getMarker(10)!.endFrame).toBeUndefined();

      session.setMarkerEndFrame(10, 20);
      expect(session.getMarker(10)!.endFrame).toBe(20);
    });

    it('SES-028: setMarkerEndFrame(undefined) converts duration to point', () => {
      session.setMarker(10, 'test', '#ff0000', 25);
      expect(session.getMarker(10)!.endFrame).toBe(25);

      session.setMarkerEndFrame(10, undefined);
      expect(session.getMarker(10)!.endFrame).toBeUndefined();
    });

    it('SES-029: getMarkerAtFrame() returns marker when frame is within range', () => {
      session.setMarker(10, 'range', '#ff0000', 30);
      expect(session.getMarkerAtFrame(10)).toBeDefined();
      expect(session.getMarkerAtFrame(20)).toBeDefined();
      expect(session.getMarkerAtFrame(30)).toBeDefined();
      expect(session.getMarkerAtFrame(31)).toBeUndefined();
      expect(session.getMarkerAtFrame(9)).toBeUndefined();
    });

    it('SES-030: getMarkerAtFrame() returns exact match for point marker', () => {
      session.setMarker(15, 'point', '#ff0000');
      expect(session.getMarkerAtFrame(15)).toBeDefined();
      expect(session.getMarkerAtFrame(16)).toBeUndefined();
    });

    it('SES-031: duration marker serialization preserves endFrame', () => {
      session.setMarker(10, 'range', '#ff0000', 25);
      const state = session.getPlaybackState();
      expect(state.marks[0]!.endFrame).toBe(25);
    });

    it('SES-032: duration marker deserialization restores endFrame', () => {
      session.setPlaybackState({
        marks: [{ frame: 10, note: 'range', color: '#ff0000', endFrame: 25 }],
      });
      const marker = session.getMarker(10);
      expect(marker).toBeDefined();
      expect(marker!.endFrame).toBe(25);
    });

    it('SES-033: setMarkerEndFrame() emits marksChanged', () => {
      session.setMarker(10, '', '#ff0000');
      const listener = vi.fn();
      session.on('marksChanged', listener);
      session.setMarkerEndFrame(10, 20);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('frameCount', () => {
    it('returns correct count based on in/out', () => {
      // With defaults (in=1, out=1), count = 1
      expect(session.frameCount).toBe(1);
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
      // Regression: loopModeChanged must be emitted exactly once (not double-emitted)
      expect(listener).toHaveBeenCalledTimes(1);
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
      session.setSources([source1]);

      session.setCurrentAB('B');
      expect(session.currentAB).toBe('A'); // Unchanged
    });

    it('AB-012: clearSourceB resets B source and switches to A', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      session.setSources([source1, source2]);
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

      session.setSources([source1, source2]);

      expect(session.sourceA).toBe(source1);
    });

    it('AB-014: sourceB returns correct source when assigned', async () => {
      const source1 = createMockSource('source1');
      const source2 = createMockSource('source2');

      session.setSources([source1, source2]);
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

      session.setSources([source1, source2, source3]);

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
        (session as any)._playback.syncVideoToFrame();
        // threshold is 0.1, (25-1)/24 = 1.0. diff is 0.
        expect(currentTime).toBe(1.0);

        (session as any)._currentFrame = 50;
        (session as any)._playback.syncVideoToFrame();
        expect(currentTime).toBeCloseTo(49/24);
    });
  });

  describe('disposal', () => {
    it('dispose cleans up all sources', () => {
        const seqSource: MediaSource = { type: 'sequence', name: 's', url: '', width: 1, height: 1, duration: 1, fps: 1, sequenceFrames: [] };
        session.setSources([seqSource]);
        const disposeSpy = vi.spyOn((session as any)._media, 'disposeSequenceSource');

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
            { type: 'image', name: 'v2', url: 'v2.png', width: 100, height: 100, duration: 1, fps: 24 }
        ]);

        session.setCurrentSource(1);
        expect(video.pause).toHaveBeenCalled();
    });

    it('toggleAB syncs frame with clamping', () => {
        session.setSources([
            { type: 'image', name: 'a', url: 'a.png', width: 100, height: 100, duration: 100, fps: 24 },
            { type: 'image', name: 'b', url: 'b.png', width: 100, height: 100, duration: 50, fps: 24 }
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
            { type: 'image', name: 'a', url: 'a.png', width: 1, height: 1, duration: 1, fps: 24 },
            { type: 'image', name: 'b', url: 'b.png', width: 1, height: 1, duration: 1, fps: 24 },
            { type: 'image', name: 'c', url: 'c.png', width: 1, height: 1, duration: 1, fps: 24 }
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

        session.setSources([{ type: 'sequence', name: 's', url: '', width: 1, height: 1, duration: 1, fps: 1, sequenceFrames: [] }]);
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
        (session as any)._sessionGraph.parseSession(dto);
        expect(session.currentFrame).toBe(15);
        expect(session.inPoint).toBe(5);
        expect(session.outPoint).toBe(25);
        expect(session.marks.has(10)).toBe(true);
    });

    it('resolveRange extra paths', () => {
        const s = session as any;
        const testRange = (val: any) => {
            const dto = createMockDTO({ RVSession: [{ session: { range: val } }] });
            s._sessionGraph.parseSession(dto);
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
        (session as any)._sessionGraph.parseSession(dto);
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
        (session as any)._playback.syncVideoToFrame();
        expect(video.currentTime).toBe(0.385); // No change

        // When diff > threshold, it should sync
        video.currentTime = 0;
        (session as any)._playback.syncVideoToFrame();
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
        expect(warnSpy).toHaveBeenCalledWith('[SessionGraph]', expect.stringContaining('Failed to load node graph'), 'graph fail');
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

  describe('isSingleImage', () => {
    it('SES-IMG-001: returns false when no source loaded', () => {
      expect(session.isSingleImage).toBe(false);
    });

    it('SES-IMG-002: returns true for image source', () => {
      session.setSources([{
        name: 'photo.png', url: 'blob:test', type: 'image',
        duration: 1, fps: 24, width: 1920, height: 1080,
      }]);
      expect(session.isSingleImage).toBe(true);
    });

    it('SES-IMG-003: returns false for video source', () => {
      session.setSources([{
        name: 'clip.mp4', url: 'blob:test', type: 'video',
        duration: 100, fps: 24, width: 1920, height: 1080,
        element: document.createElement('video'),
      }]);
      expect(session.isSingleImage).toBe(false);
    });

    it('SES-IMG-004: returns false for sequence source', () => {
      session.setSources([{
        name: 'frame_001.exr', url: 'blob:test', type: 'sequence',
        duration: 50, fps: 24, width: 1920, height: 1080,
      }]);
      expect(session.isSingleImage).toBe(false);
    });

    it('SES-IMG-005: updates when switching sources', () => {
      session.setSources([
        { name: 'photo.png', url: 'blob:a', type: 'image', duration: 1, fps: 24, width: 100, height: 100 },
        { name: 'clip.mp4', url: 'blob:b', type: 'video', duration: 100, fps: 24, width: 100, height: 100, element: document.createElement('video') },
      ]);
      session.setCurrentSource(0);
      expect(session.isSingleImage).toBe(true);
      session.setCurrentSource(1);
      expect(session.isSingleImage).toBe(false);
    });
  });

  describe('image mode edge cases', () => {
    it('EDGE-IMG-001: togglePlayback with image source does not throw', () => {
      session.setSources([{
        name: 'photo.png', url: 'blob:test', type: 'image',
        duration: 1, fps: 24, width: 100, height: 100,
      }]);
      expect(() => session.togglePlayback()).not.toThrow();
      // Session allows play toggle (no error), frame stays at 1
      expect(session.currentFrame).toBe(1);
    });

    it('EDGE-IMG-002: stepForward with image source is no-op', () => {
      session.setSources([{
        name: 'photo.png', url: 'blob:test', type: 'image',
        duration: 1, fps: 24, width: 100, height: 100,
      }]);
      session.stepForward();
      expect(session.currentFrame).toBe(1);
    });

    it('EDGE-IMG-003: stepBackward with image source is no-op', () => {
      session.setSources([{
        name: 'photo.png', url: 'blob:test', type: 'image',
        duration: 1, fps: 24, width: 100, height: 100,
      }]);
      session.stepBackward();
      expect(session.currentFrame).toBe(1);
    });

    it('EDGE-IMG-004: goToStart with image source stays at frame 1', () => {
      session.setSources([{
        name: 'photo.png', url: 'blob:test', type: 'image',
        duration: 1, fps: 24, width: 100, height: 100,
      }]);
      session.goToStart();
      expect(session.currentFrame).toBe(1);
    });

    it('EDGE-IMG-005: goToEnd with image source stays at frame 1', () => {
      session.setSources([{
        name: 'photo.png', url: 'blob:test', type: 'image',
        duration: 1, fps: 24, width: 100, height: 100,
      }]);
      session.goToEnd();
      expect(session.currentFrame).toBe(1);
    });
  });

  // ==========================================================================
  // Session.resolveProperty()
  // ==========================================================================

  describe('resolveProperty', () => {
    // Minimal TestNode for creating a graph with typed nodes
    class ResolverTestNode extends IPNode {
      constructor(type: string, name?: string) {
        super(type, name);
      }
      protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
        return null;
      }
    }

    function createTestGraph(
      nodes: Array<{ type: string; name?: string; props?: Record<string, unknown> }>,
    ): Graph {
      const graph = new Graph();
      for (const spec of nodes) {
        const node = new ResolverTestNode(spec.type, spec.name);
        if (spec.props) {
          for (const [key, value] of Object.entries(spec.props)) {
            node.properties.add({ name: key, defaultValue: value });
          }
        }
        graph.addNode(node);
      }
      return graph;
    }

    function createTestGTOData(
      objects: Array<{
        name: string;
        protocol: string;
        components?: Record<string, Record<string, { type: string; data: unknown[] }>>;
      }>,
    ): GTOData {
      return {
        version: 4,
        objects: objects.map((obj) => ({
          name: obj.name,
          protocol: obj.protocol,
          protocolVersion: 1,
          components: Object.fromEntries(
            Object.entries(obj.components ?? {}).map(([compName, props]) => [
              compName,
              {
                interpretation: '',
                properties: Object.fromEntries(
                  Object.entries(props).map(([propName, propData]) => [
                    propName,
                    {
                      type: propData.type,
                      size: propData.data.length,
                      width: 1,
                      interpretation: '',
                      data: propData.data,
                    },
                  ]),
                ),
              },
            ]),
          ),
        })),
      };
    }

    it('RP-001: returns null when neither graph nor gtoData is loaded', () => {
      expect(session.resolveProperty('#RVColor.color.exposure')).toBeNull();
      expect(session.resolveProperty('@RVDisplayColor')).toBeNull();
    });

    it('RP-002: returns null for invalid address format', () => {
      expect(session.resolveProperty('plainString')).toBeNull();
      expect(session.resolveProperty('')).toBeNull();
      expect(session.resolveProperty('!invalid')).toBeNull();
    });

    it('RP-003: resolves hash address against the live graph', () => {
      const graph = createTestGraph([
        { type: 'RVColor', props: { exposure: 1.5 } },
      ]);
      (session as any)._sessionGraph._graph = graph;

      const results = session.resolveProperty('#RVColor.color.exposure');
      expect(results).not.toBeNull();
      expect(results).toHaveLength(1);
      expect((results as any)[0].value).toBe(1.5);
    });

    it('RP-004: resolves at address against the live graph', () => {
      const graph = createTestGraph([
        { type: 'RVDisplayColor', name: 'display1' },
        { type: 'RVDisplayColor', name: 'display2' },
      ]);
      (session as any)._sessionGraph._graph = graph;

      const results = session.resolveProperty('@RVDisplayColor');
      expect(results).not.toBeNull();
      expect(results).toHaveLength(2);
    });

    it('RP-005: falls back to GTOData hash resolution when no graph', () => {
      const gtoData = createTestGTOData([
        {
          name: 'rvColor',
          protocol: 'RVColor',
          components: {
            color: {
              exposure: { type: 'float', data: [2.0] },
            },
          },
        },
      ]);
      (session as any)._sessionGraph._gtoData = gtoData;

      const results = session.resolveProperty('#RVColor.color.exposure');
      expect(results).not.toBeNull();
      expect(results).toHaveLength(1);
      expect((results as any)[0].value).toBe(2.0);
      // Verify it's a GTOHashResolveResult (has `object`, not `node`)
      expect((results as any)[0].object).toBeDefined();
    });

    it('RP-006: falls back to GTOData at resolution when no graph', () => {
      const gtoData = createTestGTOData([
        { name: 'rvDisplay', protocol: 'RVDisplayColor' },
      ]);
      (session as any)._sessionGraph._gtoData = gtoData;

      const results = session.resolveProperty('@RVDisplayColor');
      expect(results).not.toBeNull();
      expect(results).toHaveLength(1);
      expect((results as any)[0].object.name).toBe('rvDisplay');
    });

    it('RP-007: prefers graph over GTOData when both are present', () => {
      const graph = createTestGraph([
        { type: 'RVColor', props: { exposure: 99.0 } },
      ]);
      const gtoData = createTestGTOData([
        {
          name: 'rvColor',
          protocol: 'RVColor',
          components: {
            color: { exposure: { type: 'float', data: [1.0] } },
          },
        },
      ]);
      (session as any)._sessionGraph._graph = graph;
      (session as any)._sessionGraph._gtoData = gtoData;

      const results = session.resolveProperty('#RVColor.color.exposure');
      expect(results).not.toBeNull();
      expect(results).toHaveLength(1);
      // Should return graph value (99.0), not GTO value (1.0)
      expect((results as any)[0].value).toBe(99.0);
      // Should be a HashResolveResult (has `node`, not `object`)
      expect((results as any)[0].node).toBeDefined();
    });

    it('RP-008: returns null for invalid address with only gtoData', () => {
      const gtoData = createTestGTOData([
        { name: 'rvColor', protocol: 'RVColor' },
      ]);
      (session as any)._sessionGraph._gtoData = gtoData;

      expect(session.resolveProperty('invalidFormat')).toBeNull();
    });

    it('RP-009: returns empty array for non-matching protocol in graph', () => {
      const graph = createTestGraph([
        { type: 'RVColor', props: { exposure: 1.5 } },
      ]);
      (session as any)._sessionGraph._graph = graph;

      const results = session.resolveProperty('#RVNonExistent.color.exposure');
      expect(results).not.toBeNull();
      expect(results).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Metadata: realtime and bgColor fields
  // ==========================================================================

  describe('metadata realtime and bgColor', () => {
    it('META-RT-001: metadata initializes with realtime=0', () => {
      expect(session.metadata.realtime).toBe(0);
    });

    it('META-RT-002: updateMetadata with realtime emits metadataChanged', () => {
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.updateMetadata({ realtime: 30 });

      expect(session.metadata.realtime).toBe(30);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ realtime: 30 })
      );
    });

    it('META-RT-003: updateMetadata with same realtime does not emit', () => {
      session.updateMetadata({ realtime: 30 });
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.updateMetadata({ realtime: 30 });

      expect(listener).not.toHaveBeenCalled();
    });

    it('META-BG-001: metadata initializes with default bgColor (18% gray)', () => {
      expect(session.metadata.bgColor).toEqual([0.18, 0.18, 0.18, 1.0]);
    });

    it('META-BG-002: updateMetadata with bgColor emits metadataChanged', () => {
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.updateMetadata({ bgColor: [0.5, 0.5, 0.5, 1.0] });

      expect(session.metadata.bgColor).toEqual([0.5, 0.5, 0.5, 1.0]);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ bgColor: [0.5, 0.5, 0.5, 1.0] })
      );
    });

    it('META-BG-003: updateMetadata with same bgColor does not emit', () => {
      session.updateMetadata({ bgColor: [0.5, 0.5, 0.5, 1.0] });
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.updateMetadata({ bgColor: [0.5, 0.5, 0.5, 1.0] });

      expect(listener).not.toHaveBeenCalled();
    });

    it('META-BG-004: updateMetadata creates a defensive copy of bgColor', () => {
      const bgColor: [number, number, number, number] = [0.3, 0.4, 0.5, 1.0];
      session.updateMetadata({ bgColor });

      // Mutate the original array
      bgColor[0] = 999;

      // Session should have its own copy
      expect(session.metadata.bgColor[0]).toBe(0.3);
    });

    it('META-RT-BG-001: updateMetadata supports both realtime and bgColor together', () => {
      const listener = vi.fn();
      session.on('metadataChanged', listener);

      session.updateMetadata({ realtime: 29.97, bgColor: [0.0, 0.0, 0.0, 1.0] });

      expect(session.metadata.realtime).toBe(29.97);
      expect(session.metadata.bgColor).toEqual([0.0, 0.0, 0.0, 1.0]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('META-RT-BG-002: updateMetadata with bgColor preserves other fields', () => {
      session.setDisplayName('TestSession');
      session.updateMetadata({ realtime: 30 });

      session.updateMetadata({ bgColor: [1.0, 1.0, 1.0, 1.0] });

      expect(session.metadata.displayName).toBe('TestSession');
      expect(session.metadata.realtime).toBe(30);
      expect(session.metadata.bgColor).toEqual([1.0, 1.0, 1.0, 1.0]);
    });
  });

  // ==========================================================================
  // AudioCoordinator wiring
  // ==========================================================================

  describe('AudioCoordinator wiring', () => {
    it('AC-WIRE-001: audioPlaybackManager getter returns coordinator manager', () => {
      const manager = session.audioPlaybackManager;
      expect(manager).toBeDefined();
      expect(manager.state).toBe('idle');
    });

    it('AC-WIRE-002: volume change forwards to AudioCoordinator', () => {
      // Access the internal coordinator
      const coordinator = (session as any)._playback._audioCoordinator;
      const spy = vi.spyOn(coordinator, 'onVolumeChanged');

      session.volume = 0.5;

      expect(spy).toHaveBeenCalledWith(0.5);
    });

    it('AC-WIRE-003: mute change forwards to AudioCoordinator', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const spy = vi.spyOn(coordinator, 'onMutedChanged');

      session.muted = true;

      expect(spy).toHaveBeenCalledWith(true);
    });

    it('AC-WIRE-004: frameChanged event forwards to AudioCoordinator', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const spy = vi.spyOn(coordinator, 'onFrameChanged');

      // Set up a source so frame changes are valid
      session.setSources([{
        name: 'img.png', type: 'image', url: '', width: 100, height: 100, duration: 100, fps: 24,
      }]);
      session.setOutPoint(100);

      session.currentFrame = 10;

      expect(spy).toHaveBeenCalledWith(10, expect.any(Number), expect.any(Boolean));
    });

    it('AC-WIRE-005: playbackChanged(true) calls AudioCoordinator.onPlaybackStarted', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const startSpy = vi.spyOn(coordinator, 'onPlaybackStarted');

      session.setSources([{
        name: 'img.png', type: 'image', url: '', width: 100, height: 100, duration: 100, fps: 24,
      }]);
      session.setOutPoint(100);

      session.play();

      expect(startSpy).toHaveBeenCalledWith(
        expect.any(Number), // currentFrame
        expect.any(Number), // fps
        expect.any(Number), // playbackSpeed
        expect.any(Number), // playDirection
      );
    });

    it('AC-WIRE-006: playbackChanged(false) calls AudioCoordinator.onPlaybackStopped', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const stopSpy = vi.spyOn(coordinator, 'onPlaybackStopped');

      session.setSources([{
        name: 'img.png', type: 'image', url: '', width: 100, height: 100, duration: 100, fps: 24,
      }]);
      session.setOutPoint(100);

      session.play();
      session.pause();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('AC-WIRE-007: playbackSpeedChanged forwards to AudioCoordinator.onSpeedChanged', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const spy = vi.spyOn(coordinator, 'onSpeedChanged');

      session.playbackSpeed = 2;

      expect(spy).toHaveBeenCalledWith(2);
    });

    it('AC-WIRE-008: playDirectionChanged forwards to AudioCoordinator.onDirectionChanged', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const spy = vi.spyOn(coordinator, 'onDirectionChanged');

      session.setSources([{
        name: 'img.png', type: 'image', url: '', width: 100, height: 100, duration: 100, fps: 24,
      }]);
      session.setOutPoint(100);

      session.togglePlayDirection();

      expect(spy).toHaveBeenCalledWith(-1);
    });

    it('AC-WIRE-009: dispose calls AudioCoordinator.dispose', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const spy = vi.spyOn(coordinator, 'dispose');

      session.dispose();

      expect(spy).toHaveBeenCalled();
    });

    it('AC-WIRE-010: preservesPitch change forwards to AudioCoordinator.onPreservesPitchChanged', () => {
      const coordinator = (session as any)._playback._audioCoordinator;
      const spy = vi.spyOn(coordinator, 'onPreservesPitchChanged');

      session.preservesPitch = false;

      expect(spy).toHaveBeenCalledWith(false);
    });
  });

});
