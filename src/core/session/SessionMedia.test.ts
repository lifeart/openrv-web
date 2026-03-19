import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionMedia, type SessionMediaHost } from './SessionMedia';
import type { MediaSource } from './Session';
import type { MediaCacheManager } from '../../cache/MediaCacheManager';

vi.mock('../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  loadFrameImage: vi.fn(),
  preloadFrames: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
  buildFrameNumberMap: (frames: any[]) => {
    const map = new Map();
    for (const f of frames) map.set(f.frameNumber, f);
    return map;
  },
  getSequenceFrameRange: (info: any) => info.endFrame - info.startFrame + 1,
}));

// Use vi.hoisted + class mocks so instanceof checks work in applyRepresentationShim
const { MockVideoSourceNode, MockFileSourceNode, MockSequenceSourceNodeWrapper } = vi.hoisted(() => {
  class _MockVideoSourceNode {}
  class _MockFileSourceNode {}
  class _MockSequenceSourceNodeWrapper {
    private _sequenceInfo: any;
    private _frames: any[];
    constructor(sequenceInfo: any, frames: any[]) {
      this._sequenceInfo = sequenceInfo;
      this._frames = frames;
    }
    get sequenceInfo() { return this._sequenceInfo; }
    get frames() { return this._frames; }
    getElement(frame: number) {
      const idx = frame - 1;
      return this._frames[idx]?.image ?? null;
    }
  }
  return {
    MockVideoSourceNode: _MockVideoSourceNode,
    MockFileSourceNode: _MockFileSourceNode,
    MockSequenceSourceNodeWrapper: _MockSequenceSourceNodeWrapper,
  };
});

vi.mock('../../nodes/sources/VideoSourceNode', () => ({
  VideoSourceNode: MockVideoSourceNode,
}));

vi.mock('../../nodes/sources/FileSourceNode', () => ({
  FileSourceNode: MockFileSourceNode,
}));

vi.mock('./loaders/SequenceRepresentationLoader', () => ({
  SequenceSourceNodeWrapper: MockSequenceSourceNodeWrapper,
}));

vi.mock('../../utils/media/SupportedMediaFormats', () => ({
  detectMediaTypeFromFile: vi.fn().mockReturnValue('image'),
  detectMediaTypeFromFileBytes: vi.fn().mockResolvedValue('unknown'),
}));

vi.mock('../../cache/MediaCacheKey', () => ({
  computeCacheKey: vi.fn().mockResolvedValue('mock-cache-key-abc123'),
}));

function createMockHost(): SessionMediaHost {
  return {
    getFps: vi.fn().mockReturnValue(24),
    getCurrentFrame: vi.fn().mockReturnValue(1),
    setFps: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    setCurrentFrame: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    getIsPlaying: vi.fn().mockReturnValue(false),
    getMuted: vi.fn().mockReturnValue(false),
    getEffectiveVolume: vi.fn().mockReturnValue(0.7),
    initVideoPreservesPitch: vi.fn(),
    onSourceAdded: vi.fn().mockReturnValue({ currentSourceIndex: 0, emitEvent: false }),
    emitABChanged: vi.fn(),
    loadAudioFromVideo: vi.fn(),
    clearGraphData: vi.fn(),
    emitFpsChanged: vi.fn(),
    emitInOutChanged: vi.fn(),
  };
}

function makeImageSource(overrides?: Partial<MediaSource>): MediaSource {
  return {
    type: 'image',
    name: 'test.png',
    url: 'blob:test',
    width: 1920,
    height: 1080,
    duration: 1,
    fps: 24,
    ...overrides,
  };
}

function makeVideoSource(overrides?: Partial<MediaSource>): MediaSource {
  return {
    type: 'video',
    name: 'test.mp4',
    url: 'blob:video',
    width: 1920,
    height: 1080,
    duration: 120,
    fps: 24,
    ...overrides,
  };
}

function createMockCacheManager(): MediaCacheManager {
  return {
    put: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(null),
    isStable: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
    clearAll: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({ totalSizeBytes: 0, entryCount: 0, maxSizeBytes: 2 * 1024 * 1024 * 1024 }),
    evictLRU: vi.fn().mockResolvedValue(0),
    cleanOrphans: vi.fn().mockResolvedValue(0),
  } as unknown as MediaCacheManager;
}

function makeSequenceSource(overrides?: Partial<MediaSource>): MediaSource {
  const source: MediaSource = {
    type: 'sequence',
    name: 'seq_####.exr',
    url: '',
    width: 1920,
    height: 1080,
    duration: 48,
    fps: 24,
    sequenceFrames: [],
    sequenceInfo: { name: 'seq_####.exr', pattern: 'seq_####.exr', frames: [], startFrame: 1, endFrame: 48, width: 1920, height: 1080, fps: 24, missingFrames: [] },
    sequenceFrameMap: new Map(),
    ...overrides,
  };
  // Ensure sequenceFrameMap stays in sync with sequenceFrames when overridden
  if (overrides?.sequenceFrames && !overrides?.sequenceFrameMap) {
    source.sequenceFrameMap = new Map(
      (source.sequenceFrames ?? []).filter((f) => f.frameNumber !== undefined).map((f) => [f.frameNumber, f]),
    );
  }
  return source;
}

describe('SessionMedia', () => {
  let media: SessionMedia;
  let host: SessionMediaHost;

  beforeEach(() => {
    media = new SessionMedia();
    host = createMockHost();
    media.setHost(host);
  });

  describe('construction and initial state', () => {
    it('SM-001: starts with no sources', () => {
      expect(media.allSources).toEqual([]);
      expect(media.sourceCount).toBe(0);
    });

    it('SM-002: starts with currentSourceIndex 0', () => {
      expect(media.currentSourceIndex).toBe(0);
    });

    it('SM-003: currentSource is null when no sources', () => {
      expect(media.currentSource).toBeNull();
    });

    it('SM-004: isSingleImage is false when no sources', () => {
      expect(media.isSingleImage).toBe(false);
    });
  });

  describe('source management - addSource', () => {
    it('SM-005: addSource adds a source to allSources', () => {
      const source = makeImageSource();
      media.addSource(source);

      expect(media.allSources).toHaveLength(1);
      expect(media.allSources[0]).toBe(source);
    });

    it('SM-006: addSource sets currentSourceIndex to the newly added source', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));
      media.addSource(makeImageSource({ name: 'b.png' }));

      expect(media.currentSourceIndex).toBe(1);
      expect(media.currentSource!.name).toBe('b.png');
    });

    it('SM-007: addSource pauses playback if playing', () => {
      (host.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(true);
      media.addSource(makeImageSource());

      expect(host.pause).toHaveBeenCalled();
    });

    it('SM-008: addSource does not pause if not playing', () => {
      (host.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(false);
      media.addSource(makeImageSource());

      expect(host.pause).not.toHaveBeenCalled();
    });

    it('SM-009: addSource calls onSourceAdded with count', () => {
      media.addSource(makeImageSource());

      expect(host.onSourceAdded).toHaveBeenCalledWith(1);
    });

    it('SM-010: addSource applies AB auto-assignment when emitEvent is true', () => {
      (host.onSourceAdded as ReturnType<typeof vi.fn>).mockReturnValue({
        currentSourceIndex: 0,
        emitEvent: true,
      });

      media.addSource(makeImageSource({ name: 'a.png' }));

      expect(media.currentSourceIndex).toBe(0);
      expect(host.emitABChanged).toHaveBeenCalledWith(0);
    });

    it('SM-011: addSource does not emit AB changed when emitEvent is false', () => {
      (host.onSourceAdded as ReturnType<typeof vi.fn>).mockReturnValue({
        currentSourceIndex: 0,
        emitEvent: false,
      });

      media.addSource(makeImageSource());

      expect(host.emitABChanged).not.toHaveBeenCalled();
    });

    it('SM-012: sourceCount reflects number of added sources', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));
      media.addSource(makeVideoSource({ name: 'b.mp4' }));
      media.addSource(makeSequenceSource({ name: 'c.exr' }));

      expect(media.sourceCount).toBe(3);
    });
  });

  describe('source management - setCurrentSource', () => {
    it('SM-013: setCurrentSource switches to a valid index', () => {
      media.addSource(makeImageSource({ name: 'a.png', duration: 1 }));
      media.addSource(makeImageSource({ name: 'b.png', duration: 1 }));

      media.setCurrentSource(0);

      expect(media.currentSourceIndex).toBe(0);
      expect(media.currentSource!.name).toBe('a.png');
    });

    it('SM-014: setCurrentSource sets in/out points and current frame', () => {
      media.addSource(makeImageSource({ name: 'a.png', duration: 1 }));
      media.addSource(makeVideoSource({ name: 'b.mp4', duration: 120 }));

      media.setCurrentSource(1);

      expect(host.setOutPoint).toHaveBeenCalledWith(120);
      expect(host.setInPoint).toHaveBeenCalledWith(1);
      expect(host.setCurrentFrame).toHaveBeenCalledWith(1);
    });

    it('SM-015: setCurrentSource emits durationChanged', () => {
      const listener = vi.fn();
      media.on('durationChanged', listener);

      media.addSource(makeImageSource({ name: 'a.png', duration: 1 }));
      media.addSource(makeVideoSource({ name: 'b.mp4', duration: 120 }));

      media.setCurrentSource(1);

      expect(listener).toHaveBeenCalledWith(120);
    });

    it('SM-016: setCurrentSource ignores negative index', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));

      media.setCurrentSource(-1);

      // Should remain at the last index set by addSource
      expect(media.currentSourceIndex).toBe(0);
    });

    it('SM-017: setCurrentSource ignores index >= sourceCount', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));

      media.setCurrentSource(5);

      expect(media.currentSourceIndex).toBe(0);
    });

    it('SM-018: setCurrentSource pauses video element of previous source', () => {
      const videoElement = document.createElement('video');
      const videoPause = vi.spyOn(videoElement, 'pause');
      // Directly set the video source as current first
      const videoSource = makeVideoSource({ element: videoElement });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      // Add a second source and switch back
      (media as any)._sources.push(makeImageSource({ name: 'b.png' }));
      media.setCurrentSource(1);

      expect(videoPause).toHaveBeenCalled();
    });
  });

  describe('source accessors', () => {
    it('SM-019: getSourceByIndex returns the correct source', () => {
      const src0 = makeImageSource({ name: 'a.png' });
      const src1 = makeVideoSource({ name: 'b.mp4' });
      media.addSource(src0);
      media.addSource(src1);

      expect(media.getSourceByIndex(0)).toBe(src0);
      expect(media.getSourceByIndex(1)).toBe(src1);
    });

    it('SM-020: getSourceByIndex returns null for out-of-range index', () => {
      media.addSource(makeImageSource());

      expect(media.getSourceByIndex(5)).toBeNull();
      expect(media.getSourceByIndex(-1)).toBeNull();
    });
  });

  describe('isSingleImage', () => {
    it('SM-021: isSingleImage is true for image source', () => {
      media.addSource(makeImageSource());

      expect(media.isSingleImage).toBe(true);
    });

    it('SM-022: isSingleImage is false for video source', () => {
      media.addSource(makeVideoSource());

      expect(media.isSingleImage).toBe(false);
    });

    it('SM-023: isSingleImage is false for sequence source', () => {
      media.addSource(makeSequenceSource());

      expect(media.isSingleImage).toBe(false);
    });
  });

  describe('setHDRResizeTier', () => {
    it('SM-024: stores the HDR resize tier', () => {
      media.setHDRResizeTier('rec2100');
      expect(media.hdrResizeTier).toBe('rec2100');
    });

    it('SM-025: can be set to display-p3-float16', () => {
      media.setHDRResizeTier('display-p3-float16');
      expect(media.hdrResizeTier).toBe('display-p3-float16');
    });

    it('SM-026: defaults to none', () => {
      expect(media.hdrResizeTier).toBe('none');
    });
  });

  describe('event emission', () => {
    it('SM-027: setCurrentSource emits durationChanged with correct duration after addSource', () => {
      const durationListener = vi.fn();
      media.on('durationChanged', durationListener);

      const source = makeVideoSource({ name: 'a.mp4', duration: 200 });
      media.addSource(source);

      // addSource itself does not emit durationChanged; setCurrentSource does
      durationListener.mockClear();
      media.setCurrentSource(0);

      expect(durationListener).toHaveBeenCalledWith(200);
    });

    it('SM-028: setCurrentSource emits durationChanged with the selected source duration', () => {
      const listener = vi.fn();
      media.on('durationChanged', listener);

      media.addSource(makeImageSource({ name: 'a.png', duration: 1 }));
      media.addSource(makeVideoSource({ name: 'b.mp4', duration: 120 }));

      listener.mockClear();
      media.setCurrentSource(0);

      expect(listener).toHaveBeenCalledWith(1);
    });

    it('SM-028b: setCurrentSource emits currentSourceChanged when index changes', () => {
      const listener = vi.fn();
      media.on('currentSourceChanged', listener);

      media.addSource(makeImageSource({ name: 'a.png', duration: 1 }));
      media.addSource(makeVideoSource({ name: 'b.mp4', duration: 120 }));

      listener.mockClear();
      media.setCurrentSource(0);

      expect(listener).toHaveBeenCalledWith(0);
    });

    it('SM-028c: setCurrentSource does not emit currentSourceChanged when index is the same', () => {
      const listener = vi.fn();
      media.on('currentSourceChanged', listener);

      media.addSource(makeImageSource({ name: 'a.png', duration: 1 }));
      media.addSource(makeVideoSource({ name: 'b.mp4', duration: 120 }));

      // addSource sets currentSourceIndex to 1 (last added)
      listener.mockClear();
      media.setCurrentSource(1);

      expect(listener).not.toHaveBeenCalled();
    });

    it('SM-028d: setCurrentSource does not emit currentSourceChanged for out-of-range index', () => {
      const listener = vi.fn();
      media.on('currentSourceChanged', listener);

      media.addSource(makeImageSource({ name: 'a.png', duration: 1 }));

      listener.mockClear();
      media.setCurrentSource(5);

      expect(listener).not.toHaveBeenCalled();
    });

    it('SM-029: unsupportedCodec event signature test (registration verification)', () => {
      // Note: unsupportedCodec is emitted by loadVideoFile which requires heavy mocking.
      // This test verifies the event type signature is correctly accepted by on/emit,
      // ensuring the SessionMediaEvents type definition is sound.
      const listener = vi.fn();
      media.on('unsupportedCodec', listener);

      const info = {
        filename: 'test.mp4',
        codec: 'av1',
        codecFamily: 'av1' as const,
        error: new Error('Unsupported') as any,
      };
      media.emit('unsupportedCodec', info);

      expect(listener).toHaveBeenCalledWith(info);
    });

    it('SM-029b: hdrDowngraded event fires with filename', () => {
      const listener = vi.fn();
      media.on('hdrDowngraded', listener);

      const info = { filename: 'hdr_clip.mp4' };
      media.emit('hdrDowngraded', info);

      expect(listener).toHaveBeenCalledWith(info);
    });

    it('SM-030: on() returns unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = media.on('durationChanged', listener);

      media.emit('durationChanged', 10);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      media.emit('durationChanged', 20);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('SM-031: dispose clears all sources', () => {
      media.addSource(makeImageSource());
      media.addSource(makeVideoSource());

      media.dispose();

      expect(media.allSources).toEqual([]);
      expect(media.sourceCount).toBe(0);
    });

    it('SM-032: dispose resets currentSourceIndex to 0', () => {
      media.addSource(makeImageSource());
      media.addSource(makeImageSource());

      media.dispose();

      expect(media.currentSourceIndex).toBe(0);
    });

    it('SM-033: dispose removes all event listeners', () => {
      const listener = vi.fn();
      media.on('sourceLoaded', listener);

      media.dispose();

      media.emit('sourceLoaded', makeImageSource());
      expect(listener).not.toHaveBeenCalled();
    });

    it('SM-034: dispose calls disposeSequenceSource for sequence sources', async () => {
      const { disposeSequence } = await import('../../utils/media/SequenceLoader');
      const frames = [{ image: null, file: null as any, loaded: false }];
      const seqSource = makeSequenceSource({ sequenceFrames: frames as any });
      (media as any)._sources.push(seqSource);

      media.dispose();

      expect(disposeSequence).toHaveBeenCalledWith(frames);
    });

    it('SM-035: dispose calls videoSourceNode.dispose() for video sources', () => {
      const disposeFn = vi.fn();
      const videoSource = makeVideoSource({
        videoSourceNode: { dispose: disposeFn } as any,
      });
      (media as any)._sources.push(videoSource);

      media.dispose();

      expect(disposeFn).toHaveBeenCalled();
    });

    it('SM-075: dispose revokes blob URLs', () => {
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const source = makeImageSource({ url: 'blob:http://test/abc' });
      (media as any)._sources.push(source);

      media.dispose();

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://test/abc');
      revokeObjectURL.mockRestore();
    });

    it('SM-076: dispose pauses and detaches video elements', () => {
      const videoElement = document.createElement('video');
      const pauseSpy = vi.spyOn(videoElement, 'pause');
      const removeAttrSpy = vi.spyOn(videoElement, 'removeAttribute');
      const loadSpy = vi.spyOn(videoElement, 'load').mockImplementation(() => {});

      const source = makeVideoSource({ element: videoElement });
      (media as any)._sources.push(source);

      media.dispose();

      expect(pauseSpy).toHaveBeenCalled();
      expect(removeAttrSpy).toHaveBeenCalledWith('src');
      expect(loadSpy).toHaveBeenCalled();
    });

    it('SM-077: dispose calls fileSourceNode.dispose() for sources with fileSourceNode', () => {
      const disposeFn = vi.fn();
      const source = makeImageSource({
        fileSourceNode: { dispose: disposeFn } as any,
      });
      (media as any)._sources.push(source);

      media.dispose();

      expect(disposeFn).toHaveBeenCalled();
    });
  });

  describe('frame cache methods - defaults when no video source', () => {
    it('SM-036: getVideoFrameCanvas returns null when no source', () => {
      expect(media.getVideoFrameCanvas()).toBeNull();
    });

    it('SM-037: isVideoHDR returns false when no source', () => {
      expect(media.isVideoHDR()).toBe(false);
    });

    it('SM-038: getVideoHDRIPImage returns null when no source', () => {
      expect(media.getVideoHDRIPImage()).toBeNull();
    });

    it('SM-039: hasVideoFrameCached returns false when no source', () => {
      expect(media.hasVideoFrameCached()).toBe(false);
    });

    it('SM-040: getCachedFrames returns empty set when no source', () => {
      expect(media.getCachedFrames()).toEqual(new Set());
    });

    it('SM-041: getPendingFrames returns empty set when no source', () => {
      expect(media.getPendingFrames()).toEqual(new Set());
    });

    it('SM-042: getCacheStats returns null when no source', () => {
      expect(media.getCacheStats()).toBeNull();
    });

    it('SM-043: isUsingMediabunny returns false when no source', () => {
      expect(media.isUsingMediabunny()).toBe(false);
    });

    it('SM-044: getVideoFrameCanvas returns null for image source', () => {
      media.addSource(makeImageSource());
      expect(media.getVideoFrameCanvas()).toBeNull();
    });

    it('SM-045: isVideoHDR returns false for image source', () => {
      media.addSource(makeImageSource());
      expect(media.isVideoHDR()).toBe(false);
    });
  });

  describe('frame cache methods - with video source', () => {
    it('SM-046: getVideoFrameCanvas delegates to videoSourceNode', () => {
      const mockCanvas = {} as HTMLCanvasElement;
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          getCachedFrameCanvas: vi.fn().mockReturnValue(mockCanvas),
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getVideoFrameCanvas(5)).toBe(mockCanvas);
      expect(videoSource.videoSourceNode!.getCachedFrameCanvas).toHaveBeenCalledWith(5);
    });

    it('SM-047: isVideoHDR returns true when videoSourceNode reports HDR', () => {
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isHDR: () => true,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.isVideoHDR()).toBe(true);
    });

    it('SM-048: hasVideoFrameCached delegates to videoSourceNode', () => {
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          hasFrameCached: vi.fn().mockReturnValue(true),
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.hasVideoFrameCached(10)).toBe(true);
      expect(videoSource.videoSourceNode!.hasFrameCached).toHaveBeenCalledWith(10);
    });

    it('SM-049: getCachedFrames delegates to videoSourceNode', () => {
      const cachedSet = new Set([1, 2, 3]);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          getCachedFrames: vi.fn().mockReturnValue(cachedSet),
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getCachedFrames()).toBe(cachedSet);
    });
  });

  describe('source B methods', () => {
    it('SM-050: isSourceBUsingMediabunny returns true for mediabunny source', () => {
      const sourceB = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
        } as any,
      });

      expect(media.isSourceBUsingMediabunny(sourceB)).toBe(true);
    });

    it('SM-051: isSourceBUsingMediabunny returns false for null', () => {
      expect(media.isSourceBUsingMediabunny(null)).toBe(false);
    });

    it('SM-052: getSourceBFrameCanvas delegates to videoSourceNode', () => {
      const mockCanvas = {} as HTMLCanvasElement;
      const sourceB = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          getCachedFrameCanvas: vi.fn().mockReturnValue(mockCanvas),
        } as any,
      });

      expect(media.getSourceBFrameCanvas(sourceB, 7)).toBe(mockCanvas);
    });

    it('SM-053: getSourceBFrameCanvas returns null for non-video source', () => {
      const sourceB = makeImageSource();
      expect(media.getSourceBFrameCanvas(sourceB)).toBeNull();
    });
  });

  describe('clearVideoCache', () => {
    it('SM-054: clearVideoCache delegates to videoSourceNode', () => {
      const clearCacheFn = vi.fn();
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          clearCache: clearCacheFn,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      media.clearVideoCache();

      expect(clearCacheFn).toHaveBeenCalled();
    });

    it('SM-055: clearVideoCache does nothing for non-video source', () => {
      media.addSource(makeImageSource());

      // Should not throw
      media.clearVideoCache();
    });
  });

  describe('disposeSequenceSource / disposeVideoSource', () => {
    it('SM-056: disposeSequenceSource disposes sequence frames', async () => {
      const { disposeSequence } = await import('../../utils/media/SequenceLoader');
      const frames = [{ image: null, file: null as any, loaded: false }];
      const source = makeSequenceSource({ sequenceFrames: frames as any });

      media.disposeSequenceSource(source);

      expect(disposeSequence).toHaveBeenCalledWith(frames);
    });

    it('SM-057: disposeSequenceSource is a no-op for non-sequence', async () => {
      const { disposeSequence } = await import('../../utils/media/SequenceLoader');
      (disposeSequence as ReturnType<typeof vi.fn>).mockClear();

      media.disposeSequenceSource(makeImageSource());

      expect(disposeSequence).not.toHaveBeenCalled();
    });

    it('SM-058: disposeVideoSource disposes videoSourceNode', () => {
      const disposeFn = vi.fn();
      const source = makeVideoSource({
        videoSourceNode: { dispose: disposeFn } as any,
      });

      media.disposeVideoSource(source);

      expect(disposeFn).toHaveBeenCalled();
    });

    it('SM-059: disposeVideoSource is a no-op for image source', () => {
      // Should not throw
      media.disposeVideoSource(makeImageSource());
    });
  });

  describe('getSequenceFrameSync', () => {
    it('SM-060: returns null when current source is not a sequence', () => {
      media.addSource(makeImageSource());

      expect(media.getSequenceFrameSync(1)).toBeNull();
    });

    it('SM-061: returns null when no sources exist', () => {
      expect(media.getSequenceFrameSync()).toBeNull();
    });

    it('SM-062: returns frame image when available', () => {
      const mockBitmap = {} as ImageBitmap;
      const frames = [{ index: 0, frameNumber: 1, image: mockBitmap, file: null as any, loaded: true }];
      const seqSource = makeSequenceSource({ sequenceFrames: frames as any });
      (media as any)._sources.push(seqSource);
      (media as any)._currentSourceIndex = 0;

      // Frame index is 1-based, so timeline frame 1 maps to frameNumber startFrame (1)
      const result = media.getSequenceFrameSync(1);
      expect(result).toBe(mockBitmap);
    });

    it('SM-063: returns null for out-of-range frame index', () => {
      const frames = [{ index: 0, frameNumber: 1, image: null, file: null as any, loaded: false }];
      const seqSource = makeSequenceSource({ sequenceFrames: frames as any });
      (media as any)._sources.push(seqSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getSequenceFrameSync(100)).toBeNull();
    });
  });

  describe('fetchVideoHDRFrame / preloadVideoHDRFrames', () => {
    it('SM-064: fetchVideoHDRFrame resolves immediately for non-HDR source', async () => {
      media.addSource(makeImageSource());
      // Should not throw
      await media.fetchVideoHDRFrame(1);
    });

    it('SM-065: preloadVideoHDRFrames resolves immediately for non-HDR source', async () => {
      media.addSource(makeImageSource());
      // Should not throw
      await media.preloadVideoHDRFrames(1, 5, 2);
    });

    it('SM-066: fetchVideoHDRFrame delegates to videoSourceNode for HDR video', async () => {
      const fetchHDRFrame = vi.fn().mockResolvedValue(undefined);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isHDR: () => true,
          fetchHDRFrame,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      await media.fetchVideoHDRFrame(5);

      expect(fetchHDRFrame).toHaveBeenCalledWith(5);
    });

    it('SM-067: preloadVideoHDRFrames delegates to videoSourceNode', async () => {
      const preloadHDRFrames = vi.fn().mockResolvedValue(undefined);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isHDR: () => true,
          preloadHDRFrames,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      await media.preloadVideoHDRFrames(10, 5, 3);

      expect(preloadHDRFrames).toHaveBeenCalledWith(10, 5, 3);
    });
  });

  describe('fetchCurrentVideoFrame', () => {
    it('SM-068: resolves immediately when no video source', async () => {
      media.addSource(makeImageSource());
      await media.fetchCurrentVideoFrame(1);
      // No error expected
    });

    it('SM-069: skips fetch when frame is already cached', async () => {
      const getFrameAsync = vi.fn().mockResolvedValue(undefined);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          hasFrameCached: vi.fn().mockReturnValue(true),
          getFrameAsync,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      await media.fetchCurrentVideoFrame(5);

      expect(getFrameAsync).not.toHaveBeenCalled();
    });

    it('SM-070: fetches frame when not cached', async () => {
      const getFrameAsync = vi.fn().mockResolvedValue(undefined);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          hasFrameCached: vi.fn().mockReturnValue(false),
          getFrameAsync,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      await media.fetchCurrentVideoFrame(5);

      expect(getFrameAsync).toHaveBeenCalledWith(5);
    });
  });

  describe('frame index defaults to host.getCurrentFrame()', () => {
    it('SM-071: getVideoFrameCanvas uses host frame when no frameIndex given', () => {
      (host.getCurrentFrame as ReturnType<typeof vi.fn>).mockReturnValue(7);
      const getCachedFrameCanvas = vi.fn().mockReturnValue(null);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          getCachedFrameCanvas,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      media.getVideoFrameCanvas();

      expect(getCachedFrameCanvas).toHaveBeenCalledWith(7);
    });

    it('SM-072: hasVideoFrameCached uses host frame when no frameIndex given', () => {
      (host.getCurrentFrame as ReturnType<typeof vi.fn>).mockReturnValue(12);
      const hasFrameCached = vi.fn().mockReturnValue(false);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          hasFrameCached,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      media.hasVideoFrameCached();

      expect(hasFrameCached).toHaveBeenCalledWith(12);
    });
  });

  describe('getVideoHDRIPImage', () => {
    it('SM-073: returns null for non-HDR video', () => {
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isHDR: () => false,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getVideoHDRIPImage(1)).toBeNull();
    });

    it('SM-074: delegates to videoSourceNode for HDR video', () => {
      const mockIPImage = { width: 100, height: 100 };
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isHDR: () => true,
          getCachedHDRIPImage: vi.fn().mockReturnValue(mockIPImage),
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getVideoHDRIPImage(3)).toBe(mockIPImage);
      expect(videoSource.videoSourceNode!.getCachedHDRIPImage).toHaveBeenCalledWith(3);
    });
  });

  describe('OPFS media cache integration', () => {
    it('SM-078: setCacheManager stores the cache manager reference', () => {
      const mockCache = createMockCacheManager();
      media.setCacheManager(mockCache);

      expect((media as any)._cacheManager).toBe(mockCache);
    });

    it('SM-079: dispose clears the cache manager reference', () => {
      const mockCache = createMockCacheManager();
      media.setCacheManager(mockCache);

      media.dispose();

      expect((media as any)._cacheManager).toBeNull();
    });

    it('SM-080: cacheFileInBackground calls computeCacheKey and cache.put', async () => {
      const { computeCacheKey } = await import('../../cache/MediaCacheKey');
      const mockCache = createMockCacheManager();
      media.setCacheManager(mockCache);

      const file = new File(['test-data'], 'test.exr', { type: 'image/x-exr', lastModified: 12345 });
      const source = makeImageSource({ name: 'test.exr', width: 1920, height: 1080 });

      // Call the private method directly
      (media as any).cacheFileInBackground(file, source);

      // Wait for the async chain to settle
      await vi.waitFor(() => {
        expect(computeCacheKey).toHaveBeenCalledWith(file);
      });

      await vi.waitFor(() => {
        expect(mockCache.put).toHaveBeenCalledWith(
          'mock-cache-key-abc123',
          expect.any(ArrayBuffer),
          expect.objectContaining({
            fileName: 'test.exr',
            fileSize: file.size,
            lastModified: 12345,
            width: 1920,
            height: 1080,
          }),
        );
      });

      // Verify opfsCacheKey was set on the source
      expect(source.opfsCacheKey).toBe('mock-cache-key-abc123');
    });

    it('SM-081: cacheFileInBackground is a no-op when no cache manager', async () => {
      const { computeCacheKey } = await import('../../cache/MediaCacheKey');
      (computeCacheKey as ReturnType<typeof vi.fn>).mockClear();

      // Do not set cache manager
      const file = new File(['test-data'], 'test.exr');
      const source = makeImageSource();

      (media as any).cacheFileInBackground(file, source);

      // computeCacheKey should not be called
      expect(computeCacheKey).not.toHaveBeenCalled();
    });

    it('SM-082: cacheFileInBackground handles errors gracefully', async () => {
      const { computeCacheKey } = await import('../../cache/MediaCacheKey');
      (computeCacheKey as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('hash failed'));

      const mockCache = createMockCacheManager();
      media.setCacheManager(mockCache);

      const file = new File(['test-data'], 'fail.exr');
      const source = makeImageSource();

      // Should not throw
      (media as any).cacheFileInBackground(file, source);

      // Wait for the promise rejection to be handled
      await vi.waitFor(() => {
        expect(computeCacheKey).toHaveBeenCalled();
      });

      // cache.put should not be called since computeCacheKey failed
      expect(mockCache.put).not.toHaveBeenCalled();
    });

    it('SM-083: cacheFileInBackground handles cache.put failure gracefully', async () => {
      const mockCache = createMockCacheManager();
      (mockCache.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('OPFS write failed'));
      media.setCacheManager(mockCache);

      const file = new File(['test-data'], 'fail-put.exr', { lastModified: 100 });
      const source = makeImageSource();

      // Should not throw
      (media as any).cacheFileInBackground(file, source);

      // Wait for the async chain to settle
      await vi.waitFor(() => {
        expect(mockCache.put).toHaveBeenCalled();
      });

      // opfsCacheKey should still have been set before put() failed
      expect(source.opfsCacheKey).toBe('mock-cache-key-abc123');
    });
  });

  describe('loadFile - unsupported file type rejection', () => {
    it('SM-084: loadFile rejects unknown file types with a clear error', async () => {
      const { detectMediaTypeFromFile } = await import('../../utils/media/SupportedMediaFormats');
      (detectMediaTypeFromFile as ReturnType<typeof vi.fn>).mockReturnValue('unknown');

      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });

      await expect(media.loadFile(file)).rejects.toThrow('Unsupported file type: document.pdf');
    });

    it('SM-085: loadFile does not add a source for unknown file types', async () => {
      const { detectMediaTypeFromFile } = await import('../../utils/media/SupportedMediaFormats');
      (detectMediaTypeFromFile as ReturnType<typeof vi.fn>).mockReturnValue('unknown');

      const file = new File(['test'], 'notes.txt', { type: 'text/plain' });

      try {
        await media.loadFile(file);
      } catch {
        // expected
      }

      expect(media.allSources).toHaveLength(0);
    });

    it('SM-086: loadFile does not throw "Unsupported file type" for known image types', async () => {
      const { detectMediaTypeFromFile } = await import('../../utils/media/SupportedMediaFormats');
      (detectMediaTypeFromFile as ReturnType<typeof vi.fn>).mockReturnValue('image');

      const file = new File(['test'], 'photo.png', { type: 'image/png' });

      // loadFile should attempt image loading (which may fail due to mocked FileSourceNode),
      // but it should NOT throw "Unsupported file type"
      let errorMessage = '';
      try {
        await media.loadFile(file);
      } catch (err: any) {
        errorMessage = err.message ?? '';
      }

      expect(errorMessage).not.toContain('Unsupported file type');
    });
  });

  describe('_suppressNextLoadingStarted leak guard', () => {
    it('SM-045: emitSourceLoadingStarted reads and clears the suppress flag atomically', () => {
      const listener = vi.fn();
      media.on('sourceLoadingStarted', listener);

      // Simulate fallback path setting the flag (via public emit to trigger the guard)
      // Access the private flag via cast to exercise the guard behavior
      (media as any)._suppressNextLoadingStarted = true;

      // First call should be suppressed and flag cleared
      (media as any).emitSourceLoadingStarted('suppressed.exr');
      expect(listener).not.toHaveBeenCalled();

      // Second call should NOT be suppressed — flag was cleared
      (media as any).emitSourceLoadingStarted('normal.exr');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ name: 'normal.exr' });
    });

    it('SM-046: suppress flag does not leak to unrelated loads when cleared by finally', () => {
      const listener = vi.fn();
      media.on('sourceLoadingStarted', listener);

      // Simulate: flag set, then cleared (as the finally block would do)
      (media as any)._suppressNextLoadingStarted = true;
      (media as any)._suppressNextLoadingStarted = false;

      // Next call should work normally
      (media as any).emitSourceLoadingStarted('unrelated.png');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ name: 'unrelated.png' });
    });
  });

  describe('sourceLoadFailed event', () => {
    it('SM-047: sourceLoadFailed event type is accepted by on()', () => {
      const listener = vi.fn();
      media.on('sourceLoadFailed', listener);

      media.emit('sourceLoadFailed', { name: 'broken.exr' });

      expect(listener).toHaveBeenCalledWith({ name: 'broken.exr' });
    });
  });

  describe('switchRepresentation playback resume (#538)', () => {
    it('SM-048: resumes playback after successful switch when was playing', async () => {
      (host.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const switchMock = vi.fn().mockResolvedValue(true);
      vi.spyOn(media.representationManager, 'switchRepresentation').mockImplementation(switchMock);

      const result = await media.switchRepresentation(0, 'rep-1');

      expect(result).toBe(true);
      expect(host.pause).toHaveBeenCalled();
      expect(host.play).toHaveBeenCalled();
    });

    it('SM-049: does not resume playback after failed switch', async () => {
      (host.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(true);
      vi.spyOn(media.representationManager, 'switchRepresentation').mockResolvedValue(false);

      const result = await media.switchRepresentation(0, 'rep-1');

      expect(result).toBe(false);
      expect(host.pause).toHaveBeenCalled();
      expect(host.play).not.toHaveBeenCalled();
    });

    it('SM-050: does not resume playback when was not playing', async () => {
      (host.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(false);
      vi.spyOn(media.representationManager, 'switchRepresentation').mockResolvedValue(true);

      const result = await media.switchRepresentation(0, 'rep-1');

      expect(result).toBe(true);
      expect(host.pause).not.toHaveBeenCalled();
      expect(host.play).not.toHaveBeenCalled();
    });

    it('SM-051: does not resume playback when switch throws', async () => {
      (host.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(true);
      vi.spyOn(media.representationManager, 'switchRepresentation').mockRejectedValue(
        new Error('load failed'),
      );

      await expect(media.switchRepresentation(0, 'rep-1')).rejects.toThrow('load failed');

      expect(host.pause).toHaveBeenCalled();
      expect(host.play).not.toHaveBeenCalled();
    });
  });

  describe('applyRepresentationShim duration/fps updates (#536)', () => {
    function makeRepresentation(overrides?: Record<string, unknown>) {
      return {
        id: 'rep-1',
        label: 'Test Rep',
        kind: 'movie' as const,
        priority: 1,
        status: 'ready' as const,
        resolution: { width: 1920, height: 1080 },
        par: 1.0,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
        ...overrides,
      };
    }

    it('SM-087: switching to a representation with different duration updates source.duration', () => {
      const source = makeVideoSource({ duration: 120, fps: 24 });
      media.addSource(source);

      const rep = makeRepresentation({ duration: 240 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.duration).toBe(240);
    });

    it('SM-088: switching to a representation with different fps updates source.fps', () => {
      const source = makeVideoSource({ duration: 120, fps: 24 });
      media.addSource(source);

      const rep = makeRepresentation({ fps: 30 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.fps).toBe(30);
    });

    it('SM-089: emits durationChanged and updates out-point when duration changes on current source', () => {
      const source = makeVideoSource({ duration: 120, fps: 24 });
      media.addSource(source);

      const durationListener = vi.fn();
      media.on('durationChanged', durationListener);

      const rep = makeRepresentation({ duration: 300 });
      (media as any).applyRepresentationShim(0, rep);

      expect(durationListener).toHaveBeenCalledWith(300);
      expect(host.setOutPoint).toHaveBeenCalledWith(300);
      expect(host.emitInOutChanged).toHaveBeenCalledWith(1, 300);
    });

    it('SM-090: emits fpsChanged when fps changes on current source', () => {
      const source = makeVideoSource({ duration: 120, fps: 24 });
      media.addSource(source);

      const rep = makeRepresentation({ fps: 60 });
      (media as any).applyRepresentationShim(0, rep);

      expect(host.setFps).toHaveBeenCalledWith(60);
      expect(host.emitFpsChanged).toHaveBeenCalledWith(60);
    });

    it('SM-091: does not emit fpsChanged when fps is unchanged', () => {
      const source = makeVideoSource({ duration: 120, fps: 24 });
      media.addSource(source);

      const rep = makeRepresentation({ fps: 24 });
      (media as any).applyRepresentationShim(0, rep);

      // fps matches current host fps (mocked to return 24), so no event
      expect(host.emitFpsChanged).not.toHaveBeenCalled();
    });

    it('SM-092: preserves existing duration when representation has no duration', () => {
      const source = makeVideoSource({ duration: 120, fps: 24 });
      media.addSource(source);

      const rep = makeRepresentation({ duration: undefined, fps: undefined });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.duration).toBe(120);
      expect(source.fps).toBe(24);
    });

    it('SM-093: preserves existing fps when representation has no fps', () => {
      const source = makeVideoSource({ duration: 120, fps: 30 });
      media.addSource(source);

      const rep = makeRepresentation({});
      (media as any).applyRepresentationShim(0, rep);

      expect(source.fps).toBe(30);
      expect(host.setFps).not.toHaveBeenCalled();
      expect(host.emitFpsChanged).not.toHaveBeenCalled();
    });

    it('SM-094: does not emit events for non-current source', () => {
      const source0 = makeVideoSource({ name: 'first.mp4', duration: 120, fps: 24 });
      const source1 = makeVideoSource({ name: 'second.mp4', duration: 60, fps: 30 });
      media.addSource(source0);
      media.addSource(source1);

      // Switch back to source 0 so source 1 is not current
      media.setCurrentSource(0);

      // Clear mock calls from setCurrentSource
      (host.setFps as ReturnType<typeof vi.fn>).mockClear();
      (host.emitFpsChanged as ReturnType<typeof vi.fn>).mockClear();
      (host.setOutPoint as ReturnType<typeof vi.fn>).mockClear();
      (host.emitInOutChanged as ReturnType<typeof vi.fn>).mockClear();

      const durationListener = vi.fn();
      media.on('durationChanged', durationListener);

      // Apply to source index 1 while current is 0
      const rep = makeRepresentation({ duration: 500, fps: 60 });
      (media as any).applyRepresentationShim(1, rep);

      // Source-level values should update
      expect(source1.duration).toBe(500);
      expect(source1.fps).toBe(60);

      // But no host events should fire (not the current source)
      expect(durationListener).not.toHaveBeenCalled();
      expect(host.setFps).not.toHaveBeenCalled();
      expect(host.emitFpsChanged).not.toHaveBeenCalled();
      expect(host.setOutPoint).not.toHaveBeenCalled();
    });
  });

  describe('applyRepresentationShim source.name/url updates (#540)', () => {
    function makeRepresentation(overrides?: Record<string, unknown>) {
      return {
        id: 'rep-1',
        label: 'Test Rep',
        kind: 'movie' as const,
        priority: 1,
        status: 'ready' as const,
        resolution: { width: 1920, height: 1080 },
        par: 1.0,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
        ...overrides,
      };
    }

    it('SM-095: updates source.name from representation label', () => {
      const source = makeVideoSource({ name: 'original.mp4', url: 'blob:original' });
      media.addSource(source);

      const rep = makeRepresentation({ label: 'Proxy 720p' });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.name).toBe('Proxy 720p');
    });

    it('SM-096: updates source.url from representation loaderConfig.url', () => {
      const source = makeVideoSource({ name: 'original.mp4', url: 'blob:original' });
      media.addSource(source);

      const rep = makeRepresentation({ loaderConfig: { url: 'https://cdn.example.com/proxy.mp4' } });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.url).toBe('https://cdn.example.com/proxy.mp4');
    });

    it('SM-097: updates source.url from representation loaderConfig.path when url is absent', () => {
      const source = makeVideoSource({ name: 'original.mp4', url: 'blob:original' });
      media.addSource(source);

      const rep = makeRepresentation({ loaderConfig: { path: '/media/proxy.mov' } });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.url).toBe('/media/proxy.mov');
    });

    it('SM-098: preserves source.name when representation has no label', () => {
      const source = makeVideoSource({ name: 'original.mp4', url: 'blob:original' });
      media.addSource(source);

      const rep = makeRepresentation({ label: '' });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.name).toBe('original.mp4');
    });

    it('SM-099: restores original name/url after clearing representation', () => {
      const source = makeVideoSource({ name: 'original.mp4', url: 'blob:original' });
      media.addSource(source);

      // Apply representation
      const rep = makeRepresentation({
        label: 'Proxy 720p',
        loaderConfig: { url: 'https://cdn.example.com/proxy.mp4' },
      });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.name).toBe('Proxy 720p');
      expect(source.url).toBe('https://cdn.example.com/proxy.mp4');

      // Clear representation (null)
      (media as any).applyRepresentationShim(0, null);

      expect(source.name).toBe('original.mp4');
      expect(source.url).toBe('blob:original');
    });

    it('SM-100: preserves original values across multiple representation switches', () => {
      const source = makeVideoSource({ name: 'original.mp4', url: 'blob:original' });
      media.addSource(source);

      // First switch
      const rep1 = makeRepresentation({
        label: 'Proxy 720p',
        loaderConfig: { url: 'https://cdn.example.com/proxy720.mp4' },
      });
      (media as any).applyRepresentationShim(0, rep1);
      expect(source.name).toBe('Proxy 720p');

      // Second switch (original should still be saved, not the first rep's values)
      const rep2 = makeRepresentation({
        label: 'Proxy 480p',
        loaderConfig: { url: 'https://cdn.example.com/proxy480.mp4' },
      });
      (media as any).applyRepresentationShim(0, rep2);
      expect(source.name).toBe('Proxy 480p');
      expect(source.url).toBe('https://cdn.example.com/proxy480.mp4');

      // Clear — should restore the original, not the first rep
      (media as any).applyRepresentationShim(0, null);
      expect(source.name).toBe('original.mp4');
      expect(source.url).toBe('blob:original');
    });

    it('SM-101: preserves source.url when representation has no url or path', () => {
      const source = makeVideoSource({ name: 'original.mp4', url: 'blob:original' });
      media.addSource(source);

      const rep = makeRepresentation({ label: 'In-memory rep', loaderConfig: {} });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.name).toBe('In-memory rep');
      expect(source.url).toBe('blob:original');
    });
  });

  describe('applyRepresentationShim video element wiring (#539)', () => {
    function makeRepresentation(overrides?: Record<string, unknown>) {
      return {
        id: 'rep-video-1',
        label: 'Video Rep',
        kind: 'movie' as const,
        priority: 1,
        status: 'ready' as const,
        resolution: { width: 1920, height: 1080 },
        par: 1.0,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
        ...overrides,
      };
    }

    it('SM-107: creates HTMLVideoElement when video representation sourceNode is VideoSourceNode', () => {
      const source = makeVideoSource({ url: 'blob:video' });
      media.addSource(source);

      const mockNode = new MockVideoSourceNode();
      const rep = makeRepresentation({ sourceNode: mockNode, loaderConfig: { url: 'https://cdn/proxy.mp4' } });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.element).toBeDefined();
      expect(source.element && 'tagName' in source.element ? source.element.tagName : undefined).toBe('VIDEO');
    });

    it('SM-108: calls initVideoPreservesPitch for video representation', () => {
      const source = makeVideoSource({ url: 'blob:video' });
      media.addSource(source);

      const mockNode = new MockVideoSourceNode();
      const rep = makeRepresentation({ sourceNode: mockNode, loaderConfig: { url: 'https://cdn/proxy.mp4' } });
      (media as any).applyRepresentationShim(0, rep);

      expect(host.initVideoPreservesPitch).toHaveBeenCalled();
    });

    it('SM-109: calls loadAudioFromVideo for video representation', () => {
      const source = makeVideoSource({ url: 'blob:video' });
      media.addSource(source);

      const mockNode = new MockVideoSourceNode();
      const rep = makeRepresentation({ sourceNode: mockNode, loaderConfig: { url: 'https://cdn/proxy.mp4' } });
      (media as any).applyRepresentationShim(0, rep);

      expect(host.loadAudioFromVideo).toHaveBeenCalledWith(
        source.element,
        0.7,
        false,
      );
    });

    it('SM-110: falls back to source.url when loaderConfig has no url or file', () => {
      const source = makeVideoSource({ url: 'blob:original-video' });
      media.addSource(source);

      const mockNode = new MockVideoSourceNode();
      const rep = makeRepresentation({ sourceNode: mockNode, loaderConfig: {} });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.element).toBeDefined();
    });

    it('SM-111: non-video representations do not create HTMLVideoElement', () => {
      const source = makeImageSource();
      media.addSource(source);

      const mockNode = new MockFileSourceNode();
      const rep = makeRepresentation({ sourceNode: mockNode });
      (media as any).applyRepresentationShim(0, rep);

      expect(host.initVideoPreservesPitch).not.toHaveBeenCalled();
      expect(host.loadAudioFromVideo).not.toHaveBeenCalled();
    });
  });

  describe('currentSourceChanged on representation switch (#546)', () => {
    function makeRepresentation(overrides?: Record<string, unknown>) {
      return {
        id: 'rep-1',
        label: 'Test Rep',
        kind: 'movie' as const,
        priority: 1,
        status: 'ready' as const,
        resolution: { width: 1920, height: 1080 },
        par: 1.0,
        sourceNode: null,
        loaderConfig: {},
        audioTrackPresent: false,
        startFrame: 0,
        ...overrides,
      };
    }

    it('SM-102: emits currentSourceChanged after representationChanged on current source', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));

      const currentSourceListener = vi.fn();
      const repListener = vi.fn();
      media.on('currentSourceChanged', currentSourceListener);
      media.on('representationChanged', repListener);

      // Simulate the representation manager emitting a representationChanged event
      // for the current source (index 0)
      const rep = makeRepresentation();
      media.representationManager.emit('representationChanged', {
        sourceIndex: 0,
        previousRepId: null,
        newRepId: 'rep-1',
        representation: rep as any,
      });

      expect(repListener).toHaveBeenCalledTimes(1);
      expect(currentSourceListener).toHaveBeenCalledTimes(1);
      expect(currentSourceListener).toHaveBeenCalledWith(0);
    });

    it('SM-103: does NOT emit currentSourceChanged when representationChanged is on a non-current source', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));
      media.addSource(makeImageSource({ name: 'b.png' }));
      // currentSourceIndex is now 1 (last added)

      const currentSourceListener = vi.fn();
      media.on('currentSourceChanged', currentSourceListener);

      // Emit representationChanged for source index 0 (not the current source)
      const rep = makeRepresentation();
      media.representationManager.emit('representationChanged', {
        sourceIndex: 0,
        previousRepId: null,
        newRepId: 'rep-1',
        representation: rep as any,
      });

      expect(currentSourceListener).not.toHaveBeenCalled();
    });

    it('SM-104: emits currentSourceChanged after fallbackActivated on current source', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));

      const currentSourceListener = vi.fn();
      const fallbackListener = vi.fn();
      media.on('currentSourceChanged', currentSourceListener);
      media.on('fallbackActivated', fallbackListener);

      const fallbackRep = makeRepresentation({ id: 'fallback-rep', label: 'Fallback' });
      media.representationManager.emit('fallbackActivated', {
        sourceIndex: 0,
        failedRepId: 'rep-1',
        fallbackRepId: 'fallback-rep',
        fallbackRepresentation: fallbackRep as any,
      });

      expect(fallbackListener).toHaveBeenCalledTimes(1);
      expect(currentSourceListener).toHaveBeenCalledTimes(1);
      expect(currentSourceListener).toHaveBeenCalledWith(0);
    });

    it('SM-105: does NOT emit currentSourceChanged when fallbackActivated is on a non-current source', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));
      media.addSource(makeImageSource({ name: 'b.png' }));
      // currentSourceIndex is now 1

      const currentSourceListener = vi.fn();
      media.on('currentSourceChanged', currentSourceListener);

      const fallbackRep = makeRepresentation({ id: 'fallback-rep', label: 'Fallback' });
      media.representationManager.emit('fallbackActivated', {
        sourceIndex: 0,
        failedRepId: 'rep-1',
        fallbackRepId: 'fallback-rep',
        fallbackRepresentation: fallbackRep as any,
      });

      expect(currentSourceListener).not.toHaveBeenCalled();
    });

    it('SM-106: representationChanged emits before currentSourceChanged for ordering guarantees', () => {
      media.addSource(makeImageSource({ name: 'a.png' }));

      const order: string[] = [];
      media.on('representationChanged', () => order.push('representationChanged'));
      media.on('currentSourceChanged', () => order.push('currentSourceChanged'));

      const rep = makeRepresentation();
      media.representationManager.emit('representationChanged', {
        sourceIndex: 0,
        previousRepId: null,
        newRepId: 'rep-1',
        representation: rep as any,
      });

      expect(order).toEqual(['representationChanged', 'currentSourceChanged']);
    });
  });

  describe('preloadVideoFrames', () => {
    it('SM-112: does nothing when no video source', () => {
      expect(() => media.preloadVideoFrames()).not.toThrow();
    });

    it('SM-113: does nothing for image source', () => {
      media.addSource(makeImageSource());
      expect(() => media.preloadVideoFrames()).not.toThrow();
    });

    it('SM-114: delegates to videoSourceNode.preloadFrames with host frame', () => {
      const preloadFrames = vi.fn().mockResolvedValue(undefined);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          preloadFrames,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      (host.getCurrentFrame as ReturnType<typeof vi.fn>).mockReturnValue(5);
      media.preloadVideoFrames();

      expect(preloadFrames).toHaveBeenCalledWith(5);
    });

    it('SM-115: uses explicit centerFrame parameter', () => {
      const preloadFrames = vi.fn().mockResolvedValue(undefined);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          preloadFrames,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      media.preloadVideoFrames(20);

      expect(preloadFrames).toHaveBeenCalledWith(20);
    });
  });

  describe('getPendingFrames with video source', () => {
    it('SM-116: delegates to videoSourceNode.getPendingFrames', () => {
      const pending = new Set([4, 5]);
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          getPendingFrames: vi.fn().mockReturnValue(pending),
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getPendingFrames()).toBe(pending);
    });
  });

  describe('getCacheStats edge cases', () => {
    it('SM-117: returns null for non-mediabunny video source', () => {
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => false,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getCacheStats()).toBeNull();
    });

    it('SM-118: delegates to videoSourceNode.getCacheStats for mediabunny source', () => {
      const stats = { cachedCount: 10, pendingCount: 2, totalFrames: 100, maxCacheSize: 200 };
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          getCacheStats: vi.fn().mockReturnValue(stats),
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      expect(media.getCacheStats()).toBe(stats);
    });
  });

  describe('clearVideoCache edge cases', () => {
    it('SM-119: does nothing for non-mediabunny video source', () => {
      const clearCache = vi.fn();
      const videoSource = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => false,
          clearCache,
        } as any,
      });
      (media as any)._sources.push(videoSource);
      (media as any)._currentSourceIndex = 0;

      media.clearVideoCache();
      expect(clearCache).not.toHaveBeenCalled();
    });
  });

  describe('disposeVideoSource edge cases', () => {
    it('SM-120: does nothing for video source without videoSourceNode', () => {
      const source = makeVideoSource();
      delete source.videoSourceNode;
      expect(() => media.disposeVideoSource(source)).not.toThrow();
    });
  });

  describe('dispose edge cases', () => {
    it('SM-121: is safe to call with no sources', () => {
      media.dispose();
      expect(media.sourceCount).toBe(0);
      expect(media.currentSource).toBeNull();
    });

    it('SM-122: disposes procedural source nodes', () => {
      const disposeFn = vi.fn();
      const source = makeImageSource({
        proceduralSourceNode: { dispose: disposeFn } as any,
      });
      (media as any)._sources.push(source);

      media.dispose();

      expect(disposeFn).toHaveBeenCalled();
    });
  });

  describe('multiple sources ordering', () => {
    it('SM-123: multiple sources maintain correct ordering', () => {
      const src1 = makeImageSource({ name: 'first.png' });
      const src2 = makeImageSource({ name: 'second.png' });
      const src3 = makeImageSource({ name: 'third.png' });

      media.addSource(src1);
      media.addSource(src2);
      media.addSource(src3);

      expect(media.getSourceByIndex(0)).toBe(src1);
      expect(media.getSourceByIndex(1)).toBe(src2);
      expect(media.getSourceByIndex(2)).toBe(src3);
    });
  });

  describe('fetchSourceBVideoFrame', () => {
    it('SM-124: does nothing for null source', async () => {
      await expect(media.fetchSourceBVideoFrame(null, 1)).resolves.not.toThrow();
    });

    it('SM-125: does nothing for non-video source', async () => {
      await expect(media.fetchSourceBVideoFrame(makeImageSource(), 1)).resolves.not.toThrow();
    });

    it('SM-126: delegates to videoSourceNode.getFrameAsync', async () => {
      const getFrameAsync = vi.fn().mockResolvedValue(null);
      const sourceB = makeVideoSource({
        videoSourceNode: {
          isUsingMediabunny: () => true,
          getFrameAsync,
        } as any,
      });

      await media.fetchSourceBVideoFrame(sourceB, 42);
      expect(getFrameAsync).toHaveBeenCalledWith(42);
    });
  });

  describe('setCurrentSource video-to-image switching', () => {
    it('SM-127: handles video-to-image switching correctly', () => {
      const video = document.createElement('video');
      const videoPause = vi.spyOn(video, 'pause');
      const videoSource = makeVideoSource({ element: video, duration: 100 });
      const imageSource = makeImageSource({ duration: 1 });

      (media as any)._sources.push(videoSource);
      (media as any)._sources.push(imageSource);
      (media as any)._currentSourceIndex = 0;

      media.setCurrentSource(1);

      expect(media.currentSourceIndex).toBe(1);
      expect(media.currentSource?.type).toBe('image');
      expect(media.currentSource?.duration).toBe(1);
      expect(videoPause).toHaveBeenCalled();
    });
  });

  describe('applyRepresentationShim sequence metadata preservation (#535)', () => {
    function makeRepresentation(overrides?: Record<string, unknown>) {
      return {
        id: 'rep-seq-1',
        kind: 'proxy' as const,
        label: 'Proxy Sequence',
        resolution: { width: 1920, height: 1080 },
        loaderConfig: {},
        sourceNode: null,
        duration: undefined as number | undefined,
        fps: undefined as number | undefined,
        ...overrides,
      };
    }

    function makeSequenceFrames(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        frameNumber: i + 1,
        image: { tagName: 'IMG', src: `frame${i + 1}.png` } as unknown as HTMLImageElement,
      }));
    }

    function makeSequenceInfo(frames: any[]) {
      return {
        name: 'shot_####.exr',
        pattern: 'shot_####.exr',
        width: 1920,
        height: 1080,
        fps: 24,
        startFrame: 1,
        endFrame: frames.length,
        frames,
      };
    }

    it('SM-100: preserves sequenceInfo from SequenceSourceNodeWrapper', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const frames = makeSequenceFrames(48);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 48, fps: 24 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.sequenceInfo).toBe(seqInfo);
    });

    it('SM-101: preserves sequenceFrames from SequenceSourceNodeWrapper', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const frames = makeSequenceFrames(48);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 48, fps: 24 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.sequenceFrames).toBe(frames);
      expect(source.sequenceFrames!.length).toBe(48);
    });

    it('SM-102: builds sequenceFrameMap for O(1) lookups', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const frames = makeSequenceFrames(10);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 10, fps: 24 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.sequenceFrameMap).toBeDefined();
      expect(source.sequenceFrameMap!.size).toBe(10);
      // Frame number 1 should map to the first frame
      expect(source.sequenceFrameMap!.get(1)).toBe(frames[0]);
    });

    it('SM-103: sets source type to sequence', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const frames = makeSequenceFrames(24);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 24, fps: 24 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.type).toBe('sequence');
    });

    it('SM-104: sets element from first frame via getElement(1)', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const frames = makeSequenceFrames(5);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 5, fps: 24 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.element).toBe(frames[0]!.image);
    });

    it('SM-105: updates duration and fps from representation', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const frames = makeSequenceFrames(100);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 100, fps: 30 });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.duration).toBe(100);
      expect(source.fps).toBe(30);
    });

    it('SM-106: updates host FPS and out-point for current source', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const frames = makeSequenceFrames(48);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 48, fps: 30 });
      (media as any).applyRepresentationShim(0, rep);

      expect(host.setFps).toHaveBeenCalledWith(30);
      expect(host.emitFpsChanged).toHaveBeenCalledWith(30);
      expect(host.setOutPoint).toHaveBeenCalledWith(48);
    });

    it('SM-107: non-sequence representations still work (backward compat)', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      const mockNode = new MockFileSourceNode();
      const rep = makeRepresentation({ sourceNode: mockNode });
      (media as any).applyRepresentationShim(0, rep);

      expect(source.type).toBe('image');
      expect(source.fileSourceNode).toBe(mockNode);
      expect(source.sequenceInfo).toBeUndefined();
      expect(source.sequenceFrames).toBeUndefined();
    });

    it('SM-108: clears sequence metadata when representation is set to null', () => {
      const source = makeImageSource({ duration: 1, fps: 24 });
      media.addSource(source);

      // First apply a sequence representation
      const frames = makeSequenceFrames(24);
      const seqInfo = makeSequenceInfo(frames);
      const wrapper = new (MockSequenceSourceNodeWrapper as any)(seqInfo, frames);
      const rep = makeRepresentation({ sourceNode: wrapper, duration: 24, fps: 24 });
      (media as any).applyRepresentationShim(0, rep);
      expect(source.sequenceInfo).toBeDefined();

      // Now clear
      (media as any).applyRepresentationShim(0, null);
      expect(source.sequenceInfo).toBeUndefined();
      expect(source.sequenceFrames).toBeUndefined();
      expect(source.sequenceFrameMap).toBeUndefined();
    });
  });

  describe('Session integration', () => {
    it('Session uses SessionMedia as its media subsystem', async () => {
      // Dynamic import to avoid pulling in heavy Session deps at module level
      const { Session } = await import('./Session');
      const session = new Session();
      // The public `media` accessor must return a SessionMedia instance
      expect(session.media).toBeInstanceOf(SessionMedia);
    });
  });

  describe('documentation regression — call-site preload/release values (#526)', () => {
    // These tests verify that the numeric constants passed at the call sites
    // inside SessionMedia.ts match the documented values. If someone changes
    // the numbers without updating the docs, these tests will fail.

    it('SM-128: initial sequence preload uses windowSize=10', async () => {
      // SessionMedia.loadSequence calls: preloadFrames(sequenceInfo.frames, 0, 10)
      const { preloadFrames } = await import('../../utils/media/SequenceLoader');
      const preloadMock = preloadFrames as ReturnType<typeof vi.fn>;
      preloadMock.mockClear();

      const frames = Array.from({ length: 20 }, (_, i) => ({
        index: i,
        frameNumber: i + 1,
        file: new File([], `frame_${String(i + 1).padStart(4, '0')}.png`),
        image: { width: 1920, height: 1080, close: vi.fn() } as any,
      }));
      const seqInfo = {
        name: 'seq',
        pattern: 'seq_####.png',
        frames,
        startFrame: 1,
        endFrame: 20,
        width: 1920,
        height: 1080,
        fps: 24,
        missingFrames: [],
      };

      const { createSequenceInfo } = await import('../../utils/media/SequenceLoader');
      (createSequenceInfo as ReturnType<typeof vi.fn>).mockResolvedValueOnce(seqInfo);

      const fileList = frames.map((f) => f.file);
      try {
        await media.loadSequence(fileList);
      } catch {
        // May throw due to mocks; we only care about the preloadFrames call
      }

      // Verify the initial preload call uses windowSize = 10
      const matchingCall = preloadMock.mock.calls.find(
        (args: any[]) => args[2] === 10,
      );
      expect(matchingCall).toBeDefined();
      expect(matchingCall![2]).toBe(10);
    });

    it('SM-129: per-frame sequence preload uses windowSize=5', async () => {
      // SessionMedia.getSequenceFrameImage calls: preloadFrames(source.sequenceFrames, frame.index, 5)
      const { preloadFrames, loadFrameImage } = await import('../../utils/media/SequenceLoader');
      const preloadMock = preloadFrames as ReturnType<typeof vi.fn>;
      preloadMock.mockClear();
      const mockBitmap = { width: 1920, height: 1080, close: vi.fn() } as any;
      (loadFrameImage as ReturnType<typeof vi.fn>).mockResolvedValue(mockBitmap);

      const frames = Array.from({ length: 20 }, (_, i) => ({
        index: i,
        frameNumber: i + 1,
        file: new File(['x'], `frame_${String(i + 1).padStart(4, '0')}.png`),
      }));

      const seqSource = makeSequenceSource({
        sequenceFrames: frames as any,
        sequenceInfo: {
          name: 'seq',
          pattern: 'seq_####.png',
          frames: frames as any,
          startFrame: 1,
          endFrame: 20,
          width: 1920,
          height: 1080,
          fps: 24,
          missingFrames: [],
        },
        sequenceFrameMap: new Map(frames.map((f) => [f.frameNumber, f as any])),
      });
      (media as any)._sources.push(seqSource);
      (media as any)._currentSourceIndex = 0;

      await media.getSequenceFrameImage(5);

      const matchingCall = preloadMock.mock.calls.find(
        (args: any[]) => args[2] === 5,
      );
      expect(matchingCall).toBeDefined();
      expect(matchingCall![2]).toBe(5);
    });

    it('SM-130: per-frame sequence release uses keepWindow=20', async () => {
      // SessionMedia.getSequenceFrameImage calls: releaseDistantFrames(source.sequenceFrames, frame.index, 20)
      const { releaseDistantFrames, loadFrameImage } = await import('../../utils/media/SequenceLoader');
      const releaseMock = releaseDistantFrames as ReturnType<typeof vi.fn>;
      releaseMock.mockClear();
      const mockBitmap = { width: 1920, height: 1080, close: vi.fn() } as any;
      (loadFrameImage as ReturnType<typeof vi.fn>).mockResolvedValue(mockBitmap);

      const frames = Array.from({ length: 30 }, (_, i) => ({
        index: i,
        frameNumber: i + 1,
        file: new File(['x'], `frame_${String(i + 1).padStart(4, '0')}.png`),
      }));

      const seqSource = makeSequenceSource({
        sequenceFrames: frames as any,
        sequenceInfo: {
          name: 'seq',
          pattern: 'seq_####.png',
          frames: frames as any,
          startFrame: 1,
          endFrame: 30,
          width: 1920,
          height: 1080,
          fps: 24,
          missingFrames: [],
        },
        sequenceFrameMap: new Map(frames.map((f) => [f.frameNumber, f as any])),
      });
      (media as any)._sources.push(seqSource);
      (media as any)._currentSourceIndex = 0;

      await media.getSequenceFrameImage(10);

      const matchingCall = releaseMock.mock.calls.find(
        (args: any[]) => args[2] === 20,
      );
      expect(matchingCall).toBeDefined();
      expect(matchingCall![2]).toBe(20);
    });
  });
});
