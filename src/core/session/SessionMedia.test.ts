import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionMedia, type SessionMediaHost } from './SessionMedia';
import type { MediaSource } from './Session';

vi.mock('../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  loadFrameImage: vi.fn(),
  preloadFrames: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
}));

vi.mock('../../nodes/sources/VideoSourceNode', () => ({
  VideoSourceNode: vi.fn(),
}));

vi.mock('../../nodes/sources/FileSourceNode', () => ({
  FileSourceNode: vi.fn(),
}));

vi.mock('../../utils/media/SupportedMediaFormats', () => ({
  detectMediaTypeFromFile: vi.fn().mockReturnValue('image'),
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

function makeSequenceSource(overrides?: Partial<MediaSource>): MediaSource {
  return {
    type: 'sequence',
    name: 'seq_####.exr',
    url: '',
    width: 1920,
    height: 1080,
    duration: 48,
    fps: 24,
    sequenceFrames: [],
    ...overrides,
  };
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
      const frames = [{ image: mockBitmap, file: null as any, loaded: true }];
      const seqSource = makeSequenceSource({ sequenceFrames: frames as any });
      (media as any)._sources.push(seqSource);
      (media as any)._currentSourceIndex = 0;

      // Frame index is 1-based, so frame 1 maps to index 0
      const result = media.getSequenceFrameSync(1);
      expect(result).toBe(mockBitmap);
    });

    it('SM-063: returns null for out-of-range frame index', () => {
      const frames = [{ image: null, file: null as any, loaded: false }];
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
});
