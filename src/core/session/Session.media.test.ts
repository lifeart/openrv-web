import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session, MediaSource } from './Session';

// Mock SequenceLoader
vi.mock('../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  preloadFrames: vi.fn(),
  loadFrameImage: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
}));

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

  describe('file handling', () => {
    it('loadFile handles image and video', async () => {
      vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:123'), revokeObjectURL: vi.fn() });
      // loadFile now uses loadImageFile for HDR format detection
      const imgLoadSpy = vi.spyOn(session, 'loadImageFile').mockResolvedValue();
      // loadFile now uses loadVideoFile for mediabunny support
      const vidLoadSpy = vi.spyOn(session, 'loadVideoFile').mockResolvedValue();

      await session.loadFile(new File([], 'test.png', { type: 'image/png' }));
      expect(imgLoadSpy).toHaveBeenCalled();

      await session.loadFile(new File([], 'test.mp4', { type: 'video/mp4' }));
      expect(vidLoadSpy).toHaveBeenCalled();
    });

    it('loadFile rethrows error and revokes URL', async () => {
      vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:123'), revokeObjectURL: vi.fn() });
      vi.spyOn(session, 'loadImageFile').mockRejectedValue(new Error('fail'));
      await expect(session.loadFile(new File([], 't.png', { type: 'image/png' }))).rejects.toThrow('fail');
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
      const { createSequenceInfo, preloadFrames } = await import('../../utils/media/SequenceLoader');
      (createSequenceInfo as any).mockResolvedValue({
        name: 'seq', width: 100, height: 100, frames: [ { image: {} } ], fps: 24
      });

      await session.loadSequence([]);
      expect(session.currentSource?.type).toBe('sequence');
      expect(preloadFrames).toHaveBeenCalled();
    });

    it('loadSequence throws if no sequence found', async () => {
      const { createSequenceInfo } = await import('../../utils/media/SequenceLoader');
      (createSequenceInfo as any).mockResolvedValue(null);
      await expect(session.loadSequence([])).rejects.toThrow('No valid image sequence found');
    });

    it('getSequenceFrameImage preloads and releases and returns image', async () => {
        const { loadFrameImage, preloadFrames, releaseDistantFrames } = await import('../../utils/media/SequenceLoader');
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

  describe('video HDR methods', () => {
    it('SES-HDR-001: isVideoHDR returns false when no source', () => {
      expect(session.isVideoHDR()).toBe(false);
    });

    it('SES-HDR-002: isVideoHDR returns false for image source', () => {
      const source: MediaSource = {
        name: 'test.png', type: 'image', url: 'test.png',
        width: 100, height: 100, duration: 1, fps: 24,
      };
      session.setSources([source]);
      expect(session.isVideoHDR()).toBe(false);
    });

    it('SES-HDR-003: isVideoHDR returns false for video without videoSourceNode', () => {
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
      };
      session.setSources([source]);
      expect(session.isVideoHDR()).toBe(false);
    });

    it('SES-HDR-004: isVideoHDR returns false for non-HDR video', () => {
      const mockVideoNode = { isHDR: vi.fn().mockReturnValue(false) };
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
        videoSourceNode: mockVideoNode as any,
      };
      session.setSources([source]);
      expect(session.isVideoHDR()).toBe(false);
      expect(mockVideoNode.isHDR).toHaveBeenCalled();
    });

    it('SES-HDR-005: isVideoHDR returns true for HDR video', () => {
      const mockVideoNode = { isHDR: vi.fn().mockReturnValue(true) };
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
        videoSourceNode: mockVideoNode as any,
      };
      session.setSources([source]);
      expect(session.isVideoHDR()).toBe(true);
    });

    it('SES-HDR-006: getVideoHDRIPImage returns null when no source', () => {
      expect(session.getVideoHDRIPImage()).toBeNull();
    });

    it('SES-HDR-007: getVideoHDRIPImage returns null for non-HDR video', () => {
      const mockVideoNode = {
        isHDR: vi.fn().mockReturnValue(false),
        getCachedHDRIPImage: vi.fn(),
      };
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
        videoSourceNode: mockVideoNode as any,
      };
      session.setSources([source]);
      expect(session.getVideoHDRIPImage()).toBeNull();
      expect(mockVideoNode.getCachedHDRIPImage).not.toHaveBeenCalled();
    });

    it('SES-HDR-008: getVideoHDRIPImage delegates to videoSourceNode', () => {
      const mockIPImage = { width: 1920, height: 1080 };
      const mockVideoNode = {
        isHDR: vi.fn().mockReturnValue(true),
        getCachedHDRIPImage: vi.fn().mockReturnValue(mockIPImage),
      };
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
        videoSourceNode: mockVideoNode as any,
      };
      session.setSources([source]);

      const result = session.getVideoHDRIPImage(5);
      expect(result).toBe(mockIPImage);
      expect(mockVideoNode.getCachedHDRIPImage).toHaveBeenCalledWith(5);
    });

    it('SES-HDR-009: getVideoHDRIPImage uses currentFrame when no frameIndex', () => {
      const mockVideoNode = {
        isHDR: vi.fn().mockReturnValue(true),
        getCachedHDRIPImage: vi.fn().mockReturnValue(null),
      };
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
        videoSourceNode: mockVideoNode as any,
      };
      session.setSources([source]);

      session.getVideoHDRIPImage();
      expect(mockVideoNode.getCachedHDRIPImage).toHaveBeenCalledWith(session.currentFrame);
    });

    it('SES-HDR-010: fetchVideoHDRFrame does nothing for non-HDR video', async () => {
      const mockVideoNode = {
        isHDR: vi.fn().mockReturnValue(false),
        fetchHDRFrame: vi.fn(),
      };
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
        videoSourceNode: mockVideoNode as any,
      };
      session.setSources([source]);

      await session.fetchVideoHDRFrame(1);
      expect(mockVideoNode.fetchHDRFrame).not.toHaveBeenCalled();
    });

    it('SES-HDR-011: fetchVideoHDRFrame delegates to videoSourceNode', async () => {
      const mockVideoNode = {
        isHDR: vi.fn().mockReturnValue(true),
        fetchHDRFrame: vi.fn().mockResolvedValue(null),
      };
      const source: MediaSource = {
        name: 'test.mp4', type: 'video', url: 'test.mp4',
        width: 100, height: 100, duration: 100, fps: 24,
        videoSourceNode: mockVideoNode as any,
      };
      session.setSources([source]);

      await session.fetchVideoHDRFrame(10);
      expect(mockVideoNode.fetchHDRFrame).toHaveBeenCalledWith(10);
    });

    it('SES-HDR-012: fetchVideoHDRFrame does nothing when no source', async () => {
      // Should not throw
      await expect(session.fetchVideoHDRFrame()).resolves.toBeUndefined();
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

});
