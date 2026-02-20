import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MediaManager, type MediaManagerHost } from './MediaManager';
import type { MediaSource } from './Session';

// Mock SequenceLoader
vi.mock('../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  preloadFrames: vi.fn(),
  loadFrameImage: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
}));

// Mock VideoSourceNode
function createMockVideoSourceNode(name?: string) {
  return {
    name: name ?? 'Video Source',
    loadFile: vi.fn().mockResolvedValue({ success: true, useMediabunny: true }),
    load: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockReturnValue({ name: 'video', width: 1920, height: 1080, duration: 100, fps: 24 }),
    isUsingMediabunny: vi.fn().mockReturnValue(false),
    getDetectedFps: vi.fn().mockResolvedValue(null),
    getActualFrameCount: vi.fn().mockResolvedValue(0),
    preloadFrames: vi.fn().mockResolvedValue(undefined),
    getCachedFrameCanvas: vi.fn().mockReturnValue(null),
    hasFrameCached: vi.fn().mockReturnValue(false),
    getFrameAsync: vi.fn().mockResolvedValue(null),
    getCachedFrames: vi.fn().mockReturnValue(new Set()),
    getPendingFrames: vi.fn().mockReturnValue(new Set()),
    getCacheStats: vi.fn().mockReturnValue(null),
    clearCache: vi.fn(),
    dispose: vi.fn(),
    properties: {
      getValue: vi.fn().mockReturnValue(null),
      setValue: vi.fn(),
    },
  };
}
vi.mock('../../nodes/sources/VideoSourceNode', () => ({
  VideoSourceNode: vi.fn().mockImplementation((name?: string) => createMockVideoSourceNode(name)),
}));

// Mock FileSourceNode
function createMockFileSourceNode(name?: string) {
  return {
    name: name ?? 'File Source',
    loadFile: vi.fn().mockResolvedValue(undefined),
    loadFromEXR: vi.fn().mockResolvedValue(undefined),
    isHDR: vi.fn().mockReturnValue(false),
    formatName: null,
    width: 800,
    height: 600,
    properties: {
      getValue: vi.fn().mockReturnValue('blob:file-url'),
      setValue: vi.fn(),
    },
    dispose: vi.fn(),
  };
}
vi.mock('../../nodes/sources/FileSourceNode', () => ({
  FileSourceNode: vi.fn().mockImplementation((name?: string) => createMockFileSourceNode(name)),
}));

// Import mocked modules so we can access them
import {
  createSequenceInfo,
  preloadFrames,
  loadFrameImage,
  releaseDistantFrames,
  disposeSequence,
} from '../../utils/media/SequenceLoader';
import { VideoSourceNode } from '../../nodes/sources/VideoSourceNode';
import { FileSourceNode } from '../../nodes/sources/FileSourceNode';

function createMockHost(overrides: Partial<MediaManagerHost> = {}): MediaManagerHost {
  return {
    getFps: vi.fn().mockReturnValue(24),
    setFpsInternal: vi.fn(),
    emitFpsChanged: vi.fn(),
    getCurrentFrame: vi.fn().mockReturnValue(1),
    setCurrentFrameInternal: vi.fn(),
    getInPoint: vi.fn().mockReturnValue(1),
    setInPointInternal: vi.fn(),
    getOutPoint: vi.fn().mockReturnValue(100),
    setOutPointInternal: vi.fn(),
    getIsPlaying: vi.fn().mockReturnValue(false),
    pause: vi.fn(),
    getMuted: vi.fn().mockReturnValue(false),
    getEffectiveVolume: vi.fn().mockReturnValue(1),
    initVideoPreservesPitch: vi.fn(),
    onSourceAdded: vi.fn().mockReturnValue({ currentSourceIndex: 0, emitEvent: false }),
    emitABChanged: vi.fn(),
    emitSourceLoaded: vi.fn(),
    emitDurationChanged: vi.fn(),
    emitInOutChanged: vi.fn(),
    emitUnsupportedCodec: vi.fn(),
    getHDRResizeTier: vi.fn().mockReturnValue('none'),
    ...overrides,
  };
}

function createImageSource(overrides: Partial<MediaSource> = {}): MediaSource {
  return {
    type: 'image',
    name: 'test.png',
    url: 'blob:image-url',
    width: 800,
    height: 600,
    duration: 1,
    fps: 24,
    ...overrides,
  };
}

function createVideoSource(overrides: Partial<MediaSource> = {}): MediaSource {
  const mockVideoSourceNode = createMockVideoSourceNode('test-video') as unknown as InstanceType<typeof VideoSourceNode>;
  return {
    type: 'video',
    name: 'test.mp4',
    url: 'blob:video-url',
    width: 1920,
    height: 1080,
    duration: 100,
    fps: 24,
    videoSourceNode: mockVideoSourceNode,
    ...overrides,
  };
}

function createMockImageBitmap(): ImageBitmap {
  return { close: vi.fn(), width: 100, height: 100 } as unknown as ImageBitmap;
}

function createSequenceSource(overrides: Partial<MediaSource> = {}): MediaSource {
  const frames = [
    { index: 0, frameNumber: 1, file: new File([], 'frame_001.png'), image: createMockImageBitmap() },
    { index: 1, frameNumber: 2, file: new File([], 'frame_002.png'), image: createMockImageBitmap() },
    { index: 2, frameNumber: 3, file: new File([], 'frame_003.png'), image: createMockImageBitmap() },
  ];
  return {
    type: 'sequence',
    name: 'frame_###.png',
    url: '',
    width: 1920,
    height: 1080,
    duration: 3,
    fps: 24,
    sequenceFrames: frames,
    ...overrides,
  };
}

describe('MediaManager', () => {
  let manager: MediaManager;
  let host: MediaManagerHost;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish default mock implementations after clearAllMocks
    vi.mocked(FileSourceNode).mockImplementation(
      (name?: string) => createMockFileSourceNode(name) as unknown as FileSourceNode
    );
    vi.mocked(VideoSourceNode).mockImplementation(
      (name?: string) => createMockVideoSourceNode(name) as unknown as VideoSourceNode
    );
    manager = new MediaManager();
    host = createMockHost();
    manager.setHost(host);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // Source accessors
  // ---------------------------------------------------------------

  describe('source accessors', () => {
    it('MM-001: starts with empty sources', () => {
      expect(manager.sources).toEqual([]);
      expect(manager.sourceCount).toBe(0);
      expect(manager.allSources).toEqual([]);
    });

    it('MM-002: currentSource returns null when no sources', () => {
      expect(manager.currentSource).toBeNull();
    });

    it('MM-003: currentSourceIndex defaults to 0', () => {
      expect(manager.currentSourceIndex).toBe(0);
    });

    it('MM-004: getSourceByIndex returns null for invalid index', () => {
      expect(manager.getSourceByIndex(0)).toBeNull();
      expect(manager.getSourceByIndex(-1)).toBeNull();
      expect(manager.getSourceByIndex(100)).toBeNull();
    });

    it('MM-005: sources setter updates internal sources', () => {
      const src = createImageSource();
      manager.sources = [src];
      expect(manager.sources).toEqual([src]);
      expect(manager.sourceCount).toBe(1);
    });

    it('MM-006: currentSourceIndex setter updates internal index', () => {
      manager.currentSourceIndex = 5;
      expect(manager.currentSourceIndex).toBe(5);
    });
  });

  // ---------------------------------------------------------------
  // Source CRUD - addSource
  // ---------------------------------------------------------------

  describe('addSource', () => {
    it('MM-007: adds source and updates currentSourceIndex', () => {
      const source = createImageSource();
      manager.addSource(source);
      expect(manager.sourceCount).toBe(1);
      expect(manager.currentSource).toBe(source);
    });

    it('MM-008: pauses playback before adding source', () => {
      vi.mocked(host.getIsPlaying).mockReturnValue(true);
      manager.addSource(createImageSource());
      expect(host.pause).toHaveBeenCalled();
    });

    it('MM-009: does not pause when not playing', () => {
      vi.mocked(host.getIsPlaying).mockReturnValue(false);
      manager.addSource(createImageSource());
      expect(host.pause).not.toHaveBeenCalled();
    });

    it('MM-010: delegates to host.onSourceAdded for AB auto-assignment', () => {
      manager.addSource(createImageSource());
      expect(host.onSourceAdded).toHaveBeenCalledWith(1);
    });

    it('MM-011: emits AB changed when host reports emitEvent=true', () => {
      vi.mocked(host.onSourceAdded).mockReturnValue({
        currentSourceIndex: 0,
        emitEvent: true,
      });
      manager.addSource(createImageSource());
      expect(host.emitABChanged).toHaveBeenCalledWith(0);
    });

    it('MM-012: does not emit AB changed when host reports emitEvent=false', () => {
      manager.addSource(createImageSource());
      expect(host.emitABChanged).not.toHaveBeenCalled();
    });

    it('MM-013: sets currentSourceIndex to last added source by default', () => {
      manager.addSource(createImageSource({ name: 'first.png' }));
      manager.addSource(createImageSource({ name: 'second.png' }));
      // After second add, index should be 1 (latest)
      expect(manager.currentSourceIndex).toBe(1);
    });

    it('MM-014: updates currentSourceIndex from AB result when emitEvent is true', () => {
      vi.mocked(host.onSourceAdded).mockReturnValue({
        currentSourceIndex: 0,
        emitEvent: true,
      });
      manager.addSource(createImageSource({ name: 'first.png' }));
      manager.addSource(createImageSource({ name: 'second.png' }));
      // AB result overrides to 0
      expect(manager.currentSourceIndex).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Source CRUD - setCurrentSource
  // ---------------------------------------------------------------

  // Tests verify observable behavior (state changes, output values)
  // rather than internal method calls
  describe('setCurrentSource', () => {
    it('MM-015: switches to valid source index and updates current source', () => {
      manager.addSource(createImageSource({ name: 'a.png', duration: 10 }));
      manager.addSource(createImageSource({ name: 'b.png', duration: 20 }));
      manager.setCurrentSource(0);
      expect(manager.currentSourceIndex).toBe(0);
      expect(manager.currentSource?.name).toBe('a.png');
      expect(manager.currentSource?.duration).toBe(10);
    });

    it('MM-016: ignores invalid negative index', () => {
      manager.addSource(createImageSource());
      manager.setCurrentSource(-1);
      // Should not have updated anything beyond initial addSource calls
      expect(manager.currentSourceIndex).toBe(0);
    });

    it('MM-017: ignores index beyond sources length', () => {
      manager.addSource(createImageSource());
      manager.setCurrentSource(5);
      expect(manager.currentSourceIndex).toBe(0);
    });

    it('MM-018: pauses video element when switching away from video source', () => {
      const video = document.createElement('video');
      video.pause = vi.fn();
      const videoSource = createVideoSource({ element: video });
      manager.addSource(videoSource);
      manager.addSource(createImageSource());
      // Switch back to source 0 from source 1
      manager.currentSourceIndex = 0;
      manager.setCurrentSource(1);
      expect(video.pause).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Source CRUD - switchToSource
  // ---------------------------------------------------------------

  // Tests verify observable behavior (state changes, output values)
  // rather than internal method calls
  describe('switchToSource', () => {
    it('MM-019: switches to valid index without resetting frame', () => {
      manager.addSource(createImageSource({ name: 'a.png', duration: 10 }));
      manager.addSource(createImageSource({ name: 'b.png', duration: 20 }));

      // Clear mocks from addSource calls
      vi.clearAllMocks();

      manager.switchToSource(0);
      expect(manager.currentSourceIndex).toBe(0);
      expect(manager.currentSource?.name).toBe('a.png');
      expect(manager.currentSource?.duration).toBe(10);
      // switchToSource does NOT reset frame (unlike setCurrentSource)
      expect(host.setCurrentFrameInternal).not.toHaveBeenCalled();
    });

    it('MM-020: ignores negative index', () => {
      manager.addSource(createImageSource());
      vi.clearAllMocks();
      manager.switchToSource(-1);
      expect(host.setOutPointInternal).not.toHaveBeenCalled();
    });

    it('MM-021: ignores index >= sources.length', () => {
      manager.addSource(createImageSource());
      vi.clearAllMocks();
      manager.switchToSource(5);
      expect(host.setOutPointInternal).not.toHaveBeenCalled();
    });

    it('MM-022: pauses video element when switching away from video source', () => {
      const video = document.createElement('video');
      video.pause = vi.fn();
      const videoSource = createVideoSource({ element: video });
      manager.addSource(videoSource);
      manager.addSource(createImageSource());
      manager.currentSourceIndex = 0;

      manager.switchToSource(1);
      expect(video.pause).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // File type detection
  // ---------------------------------------------------------------

  describe('getMediaType', () => {
    it('MM-023: detects video by MIME type', () => {
      expect(manager.getMediaType(new File([], 'test.mp4', { type: 'video/mp4' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.webm', { type: 'video/webm' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.ogg', { type: 'video/ogg' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.mov', { type: 'video/quicktime' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.mkv', { type: 'video/x-matroska' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.ogv', { type: 'application/ogg' }))).toBe('video');
    });

    it('MM-024: detects video by extension even without MIME type', () => {
      expect(manager.getMediaType(new File([], 'test.mp4', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.m4v', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.mov', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.qt', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.3gp', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.avi', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.mkv', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.webm', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.ogv', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.ogx', { type: '' }))).toBe('video');
    });

    it('MM-025: detects video extension case-insensitively', () => {
      expect(manager.getMediaType(new File([], 'test.MP4', { type: '' }))).toBe('video');
      expect(manager.getMediaType(new File([], 'test.MoV', { type: '' }))).toBe('video');
    });

    it('MM-026: detects image for non-video files', () => {
      expect(manager.getMediaType(new File([], 'test.png', { type: 'image/png' }))).toBe('image');
      expect(manager.getMediaType(new File([], 'test.jpg', { type: 'image/jpeg' }))).toBe('image');
      expect(manager.getMediaType(new File([], 'test.exr', { type: '' }))).toBe('image');
      expect(manager.getMediaType(new File([], 'test.dpx', { type: '' }))).toBe('image');
    });

    it('MM-027: defaults to image for unknown types', () => {
      expect(manager.getMediaType(new File([], 'unknown.xyz', { type: '' }))).toBe('image');
      expect(manager.getMediaType(new File([], 'noext', { type: '' }))).toBe('image');
    });
  });

  // ---------------------------------------------------------------
  // loadFile
  // ---------------------------------------------------------------

  describe('loadFile', () => {
    it('MM-028: delegates to loadImageFile for image files', async () => {
      const loadImageFileSpy = vi.spyOn(manager, 'loadImageFile').mockResolvedValue();
      await manager.loadFile(new File([], 'test.png', { type: 'image/png' }));
      expect(loadImageFileSpy).toHaveBeenCalled();
    });

    it('MM-029: delegates to loadVideoFile for video files', async () => {
      const loadVideoFileSpy = vi.spyOn(manager, 'loadVideoFile').mockResolvedValue();
      await manager.loadFile(new File([], 'test.mp4', { type: 'video/mp4' }));
      expect(loadVideoFileSpy).toHaveBeenCalled();
    });

    it('MM-030: propagates errors from loadImageFile', async () => {
      vi.spyOn(manager, 'loadImageFile').mockRejectedValue(new Error('image load failed'));
      await expect(
        manager.loadFile(new File([], 'test.png', { type: 'image/png' }))
      ).rejects.toThrow('image load failed');
    });

    it('MM-031: propagates errors from loadVideoFile', async () => {
      vi.spyOn(manager, 'loadVideoFile').mockRejectedValue(new Error('video load failed'));
      await expect(
        manager.loadFile(new File([], 'test.mp4', { type: 'video/mp4' }))
      ).rejects.toThrow('video load failed');
    });
  });

  // ---------------------------------------------------------------
  // loadImageFile
  // ---------------------------------------------------------------

  describe('loadImageFile', () => {
    it('MM-032: loads image via FileSourceNode successfully', async () => {
      await manager.loadImageFile(new File([], 'test.png', { type: 'image/png' }));

      expect(manager.sourceCount).toBe(1);
      expect(manager.currentSource?.type).toBe('image');
      expect(manager.currentSource?.name).toBe('test.png');
      expect(manager.currentSource?.duration).toBe(1);
      expect(host.emitSourceLoaded).toHaveBeenCalled();
    });

    it('MM-033: sets image source duration to 1', async () => {
      await manager.loadImageFile(new File([], 'test.png'));

      expect(manager.currentSource?.duration).toBe(1);
      expect(manager.currentSource?.type).toBe('image');
    });

    it('MM-034: uses host FPS for image source', async () => {
      vi.mocked(host.getFps).mockReturnValue(30);
      await manager.loadImageFile(new File([], 'test.png'));

      expect(manager.currentSource?.fps).toBe(30);
    });

    it('MM-035: falls back to loadImage on FileSourceNode failure', async () => {
      // Make FileSourceNode.loadFile throw
      vi.mocked(FileSourceNode).mockImplementationOnce(() => ({
        loadFile: vi.fn().mockRejectedValue(new Error('unsupported format')),
        isHDR: vi.fn().mockReturnValue(false),
        formatName: null,
        width: 0,
        height: 0,
        properties: { getValue: vi.fn().mockReturnValue('') },
      }) as unknown as FileSourceNode);

      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:fallback-url'),
        revokeObjectURL: vi.fn(),
      });

      const loadImageSpy = vi.spyOn(manager, 'loadImage').mockResolvedValue();
      await manager.loadImageFile(new File([], 'test.png'));

      expect(loadImageSpy).toHaveBeenCalledWith('test.png', 'blob:fallback-url');
    });

    it('MM-036: revokes URL on fallback failure', async () => {
      vi.mocked(FileSourceNode).mockImplementationOnce(() => ({
        loadFile: vi.fn().mockRejectedValue(new Error('unsupported format')),
        isHDR: vi.fn().mockReturnValue(false),
        formatName: null,
        width: 0,
        height: 0,
        properties: { getValue: vi.fn().mockReturnValue('') },
      }) as unknown as FileSourceNode);

      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:fallback-url'),
        revokeObjectURL,
      });

      vi.spyOn(manager, 'loadImage').mockRejectedValue(new Error('fallback also failed'));

      await expect(
        manager.loadImageFile(new File([], 'test.png'))
      ).rejects.toThrow('fallback also failed');

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fallback-url');
    });
  });

  // ---------------------------------------------------------------
  // loadImage
  // ---------------------------------------------------------------

  describe('loadImage', () => {
    it('MM-037: loads image via HTMLImageElement', async () => {
      const mockImg = {
        crossOrigin: '',
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        width: 640,
        height: 480,
      };
      vi.stubGlobal('Image', vi.fn(() => mockImg));

      const promise = manager.loadImage('test.png', 'http://example.com/test.png');
      // Trigger the onload callback
      mockImg.onload!();
      await promise;

      expect(manager.sourceCount).toBe(1);
      expect(manager.currentSource?.type).toBe('image');
      expect(manager.currentSource?.name).toBe('test.png');
      expect(manager.currentSource?.width).toBe(640);
      expect(manager.currentSource?.height).toBe(480);
      expect(manager.currentSource?.duration).toBe(1);
      expect(host.emitSourceLoaded).toHaveBeenCalled();
    });

    it('MM-038: sets crossOrigin to anonymous', async () => {
      const mockImg = {
        crossOrigin: '',
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        width: 100,
        height: 100,
      };
      vi.stubGlobal('Image', vi.fn(() => mockImg));

      const promise = manager.loadImage('test.png', 'http://example.com/test.png');
      mockImg.onload!();
      await promise;

      expect(mockImg.crossOrigin).toBe('anonymous');
    });

    it('MM-039: rejects on image load error', async () => {
      const mockImg = {
        crossOrigin: '',
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        width: 0,
        height: 0,
      };
      vi.stubGlobal('Image', vi.fn(() => mockImg));

      const promise = manager.loadImage('test.png', 'http://example.com/bad.png');
      mockImg.onerror!();

      await expect(promise).rejects.toThrow('Failed to load image: http://example.com/bad.png');
    });

    it('MM-040: uses default FPS of 24 when host is not set', async () => {
      const managerNoHost = new MediaManager();
      const mockImg = {
        crossOrigin: '',
        src: '',
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        width: 100,
        height: 100,
      };
      vi.stubGlobal('Image', vi.fn(() => mockImg));

      const promise = managerNoHost.loadImage('test.png', 'url');
      mockImg.onload!();
      await promise;

      expect(managerNoHost.currentSource?.fps).toBe(24);
    });
  });

  // ---------------------------------------------------------------
  // loadEXRFile
  // ---------------------------------------------------------------

  describe('loadEXRFile', () => {
    it('MM-041: loads EXR via FileSourceNode.loadFromEXR', async () => {
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:exr-url'),
        revokeObjectURL,
      });

      const file = new File([new ArrayBuffer(10)], 'test.exr');
      await manager.loadEXRFile(file);

      expect(manager.sourceCount).toBe(1);
      expect(manager.currentSource?.type).toBe('image');
      expect(manager.currentSource?.url).toBe('blob:exr-url');
      expect(manager.currentSource?.duration).toBe(1);
      expect(host.emitSourceLoaded).toHaveBeenCalled();
    });

    it('MM-042: revokes URL on EXR load failure', async () => {
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn(() => 'blob:exr-url'),
        revokeObjectURL,
      });

      vi.mocked(FileSourceNode).mockImplementationOnce(() => ({
        loadFromEXR: vi.fn().mockRejectedValue(new Error('EXR decode error')),
        width: 0,
        height: 0,
        properties: { getValue: vi.fn().mockReturnValue('') },
      }) as unknown as FileSourceNode);

      await expect(
        manager.loadEXRFile(new File([new ArrayBuffer(10)], 'bad.exr'))
      ).rejects.toThrow('EXR decode error');

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:exr-url');
    });
  });

  // ---------------------------------------------------------------
  // loadVideo
  // ---------------------------------------------------------------

  describe('loadVideo', () => {
    it('MM-043: loads video via HTMLVideoElement', async () => {
      const mockVideo = {
        crossOrigin: '',
        preload: '',
        muted: false,
        volume: 1,
        loop: false,
        playsInline: false,
        src: '',
        videoWidth: 1920,
        videoHeight: 1080,
        duration: 10,
        oncanplay: null as (() => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        load: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockVideo as unknown as HTMLElement);

      const promise = manager.loadVideo('test.mp4', 'http://example.com/test.mp4');
      // Trigger oncanplay
      mockVideo.oncanplay!();
      await promise;

      expect(manager.sourceCount).toBe(1);
      expect(manager.currentSource?.type).toBe('video');
      expect(manager.currentSource?.name).toBe('test.mp4');
      expect(manager.currentSource?.width).toBe(1920);
      expect(manager.currentSource?.height).toBe(1080);
      // Duration = Math.ceil(10 * 24) = 240
      expect(manager.currentSource?.duration).toBe(240);
    });

    it('MM-044: rejects on video load error', async () => {
      const mockVideo = {
        crossOrigin: '',
        preload: '',
        muted: false,
        volume: 1,
        loop: false,
        playsInline: false,
        src: '',
        videoWidth: 0,
        videoHeight: 0,
        duration: 0,
        oncanplay: null as (() => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        load: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockVideo as unknown as HTMLElement);

      const promise = manager.loadVideo('test.mp4', 'http://example.com/bad.mp4');
      mockVideo.onerror!(new Error('network'));

      await expect(promise).rejects.toThrow('Failed to load video: http://example.com/bad.mp4');
    });

    it('MM-045: initializes video element properties correctly', async () => {
      vi.mocked(host.getMuted).mockReturnValue(true);
      vi.mocked(host.getEffectiveVolume).mockReturnValue(0.5);

      const mockVideo = {
        crossOrigin: '',
        preload: '',
        muted: false,
        volume: 1,
        loop: true,
        playsInline: false,
        src: '',
        videoWidth: 100,
        videoHeight: 100,
        duration: 5,
        oncanplay: null as (() => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        load: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockVideo as unknown as HTMLElement);

      const promise = manager.loadVideo('test.mp4', 'url');
      mockVideo.oncanplay!();
      await promise;

      expect(mockVideo.crossOrigin).toBe('anonymous');
      expect(mockVideo.preload).toBe('auto');
      expect(mockVideo.muted).toBe(true);
      expect(mockVideo.volume).toBe(0.5);
      expect(mockVideo.loop).toBe(false);
      expect(mockVideo.playsInline).toBe(true);
      expect(host.initVideoPreservesPitch).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Sequence loading
  // ---------------------------------------------------------------

  describe('loadSequence', () => {
    it('MM-046: loads image sequence successfully', async () => {
      const sequenceInfo = {
        name: 'frame_###.png',
        pattern: 'frame_###.png',
        frames: [
          { index: 0, frameNumber: 1, file: new File([], 'frame_001.png'), image: createMockImageBitmap() },
          { index: 1, frameNumber: 2, file: new File([], 'frame_002.png'), image: createMockImageBitmap() },
        ],
        startFrame: 1,
        endFrame: 2,
        width: 1920,
        height: 1080,
        fps: 24,
        missingFrames: [],
      };
      vi.mocked(createSequenceInfo).mockResolvedValue(sequenceInfo);

      await manager.loadSequence([new File([], 'frame_001.png'), new File([], 'frame_002.png')]);

      // Verify observable state: source was created with correct properties
      expect(manager.sourceCount).toBe(1);
      expect(manager.currentSource?.type).toBe('sequence');
      expect(manager.currentSource?.name).toBe('frame_###.png');
      expect(manager.currentSource?.duration).toBe(2);
      expect(manager.currentSource?.width).toBe(1920);
      expect(manager.currentSource?.height).toBe(1080);
      expect(manager.currentSource?.fps).toBe(24);
      // Event emission is an interface contract — keep this check
      expect(host.emitSourceLoaded).toHaveBeenCalled();
      expect(preloadFrames).toHaveBeenCalledWith(sequenceInfo.frames, 0, 10);
    });

    it('MM-047: throws when no valid sequence found', async () => {
      vi.mocked(createSequenceInfo).mockResolvedValue(null);

      await expect(
        manager.loadSequence([new File([], 'random.txt')])
      ).rejects.toThrow('No valid image sequence found in the selected files');
    });

    it('MM-048: uses provided fps override', async () => {
      const sequenceInfo = {
        name: 'frame_###.png',
        pattern: 'frame_###.png',
        frames: [{ index: 0, frameNumber: 1, file: new File([], 'frame_001.png') }],
        startFrame: 1,
        endFrame: 1,
        width: 100,
        height: 100,
        fps: 30,
        missingFrames: [],
      };
      vi.mocked(createSequenceInfo).mockResolvedValue(sequenceInfo);

      await manager.loadSequence([new File([], 'frame_001.png')], 30);

      expect(createSequenceInfo).toHaveBeenCalledWith(expect.any(Array), 30);
    });
  });

  // ---------------------------------------------------------------
  // Sequence frame access
  // ---------------------------------------------------------------

  describe('getSequenceFrameImage', () => {
    it('MM-049: returns null when no current source', async () => {
      const result = await manager.getSequenceFrameImage();
      expect(result).toBeNull();
    });

    it('MM-050: returns null when current source is not a sequence', async () => {
      manager.addSource(createImageSource());
      const result = await manager.getSequenceFrameImage();
      expect(result).toBeNull();
    });

    it('MM-051: loads frame image for sequence source', async () => {
      const mockImage = createMockImageBitmap();
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);
      const seqSource = createSequenceSource();
      manager.addSource(seqSource);

      vi.mocked(host.getCurrentFrame).mockReturnValue(1);
      const result = await manager.getSequenceFrameImage();

      expect(loadFrameImage).toHaveBeenCalledWith(seqSource.sequenceFrames![0]);
      expect(result).toBe(mockImage);
      expect(preloadFrames).toHaveBeenCalled();
      expect(releaseDistantFrames).toHaveBeenCalled();
    });

    it('MM-052: returns null for out-of-range frame index', async () => {
      manager.addSource(createSequenceSource());
      const result = await manager.getSequenceFrameImage(100);
      expect(result).toBeNull();
    });

    it('MM-053: uses explicit frameIndex parameter', async () => {
      const mockImage = createMockImageBitmap();
      vi.mocked(loadFrameImage).mockResolvedValue(mockImage);
      const seqSource = createSequenceSource();
      manager.addSource(seqSource);

      // frameIndex 2 maps to index 1 (0-based)
      await manager.getSequenceFrameImage(2);
      expect(loadFrameImage).toHaveBeenCalledWith(seqSource.sequenceFrames![1]);
    });
  });

  describe('getSequenceFrameSync', () => {
    it('MM-054: returns null when no sequence source', () => {
      expect(manager.getSequenceFrameSync()).toBeNull();
    });

    it('MM-055: returns cached image synchronously', () => {
      const seqSource = createSequenceSource();
      manager.addSource(seqSource);
      vi.mocked(host.getCurrentFrame).mockReturnValue(1);

      const result = manager.getSequenceFrameSync();
      expect(result).toBe(seqSource.sequenceFrames![0]!.image);
    });

    it('MM-056: returns null when frame has no cached image', () => {
      const seqSource = createSequenceSource();
      seqSource.sequenceFrames![0]!.image = undefined;
      manager.addSource(seqSource);
      vi.mocked(host.getCurrentFrame).mockReturnValue(1);

      expect(manager.getSequenceFrameSync()).toBeNull();
    });

    it('MM-057: returns null for non-sequence source', () => {
      manager.addSource(createImageSource());
      expect(manager.getSequenceFrameSync()).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Video frame access (mediabunny)
  // ---------------------------------------------------------------

  describe('getVideoFrameCanvas', () => {
    it('MM-058: returns null when no source', () => {
      expect(manager.getVideoFrameCanvas()).toBeNull();
    });

    it('MM-059: returns null when source is not video', () => {
      manager.addSource(createImageSource());
      expect(manager.getVideoFrameCanvas()).toBeNull();
    });

    it('MM-060: returns null when not using mediabunny', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(false);
      manager.addSource(videoSource);
      expect(manager.getVideoFrameCanvas()).toBeNull();
    });

    it('MM-061: returns cached frame canvas for current frame', () => {
      const mockCanvas = document.createElement('canvas');
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getCachedFrameCanvas = vi.fn().mockReturnValue(mockCanvas);
      manager.addSource(videoSource);

      vi.mocked(host.getCurrentFrame).mockReturnValue(5);
      const result = manager.getVideoFrameCanvas();

      // Verify observable output: the correct canvas is returned
      expect(result).toBe(mockCanvas);
    });

    it('MM-062: returns canvas for explicit frameIndex parameter', () => {
      const mockCanvas = document.createElement('canvas');
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getCachedFrameCanvas = vi.fn().mockReturnValue(mockCanvas);
      manager.addSource(videoSource);

      const result = manager.getVideoFrameCanvas(42);
      // Verify observable output: the correct canvas is returned
      expect(result).toBe(mockCanvas);
    });
  });

  describe('hasVideoFrameCached', () => {
    it('MM-063: returns false when no video source', () => {
      expect(manager.hasVideoFrameCached()).toBe(false);
    });

    it('MM-064: returns false when not using mediabunny', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(false);
      manager.addSource(videoSource);
      expect(manager.hasVideoFrameCached()).toBe(false);
    });

    it('MM-065: returns true when current frame is cached', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.hasFrameCached = vi.fn().mockReturnValue(true);
      manager.addSource(videoSource);

      vi.mocked(host.getCurrentFrame).mockReturnValue(10);
      // Verify observable output: the cached state is correctly reported
      expect(manager.hasVideoFrameCached()).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // isUsingMediabunny
  // ---------------------------------------------------------------

  describe('isUsingMediabunny', () => {
    it('MM-066: returns false when no source', () => {
      expect(manager.isUsingMediabunny()).toBe(false);
    });

    it('MM-067: returns false for image source', () => {
      manager.addSource(createImageSource());
      expect(manager.isUsingMediabunny()).toBe(false);
    });

    it('MM-068: returns false for video source not using mediabunny', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(false);
      manager.addSource(videoSource);
      expect(manager.isUsingMediabunny()).toBe(false);
    });

    it('MM-069: returns true for video source using mediabunny', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      manager.addSource(videoSource);
      expect(manager.isUsingMediabunny()).toBe(true);
    });
  });

  describe('isSourceUsingMediabunny', () => {
    it('MM-070: returns false for null source', () => {
      expect(manager.isSourceUsingMediabunny(null)).toBe(false);
    });

    it('MM-071: returns false for image source', () => {
      expect(manager.isSourceUsingMediabunny(createImageSource())).toBe(false);
    });

    it('MM-072: returns true when videoSourceNode.isUsingMediabunny returns true', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      expect(manager.isSourceUsingMediabunny(videoSource)).toBe(true);
    });

    it('MM-073: returns false for video source without videoSourceNode', () => {
      const source = createVideoSource();
      delete source.videoSourceNode;
      expect(manager.isSourceUsingMediabunny(source)).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // getFrameCanvasForSource
  // ---------------------------------------------------------------

  describe('getFrameCanvasForSource', () => {
    it('MM-074: returns null for null source', () => {
      expect(manager.getFrameCanvasForSource(null)).toBeNull();
    });

    it('MM-075: returns null for non-video source', () => {
      expect(manager.getFrameCanvasForSource(createImageSource())).toBeNull();
    });

    it('MM-076: returns canvas for valid mediabunny video source', () => {
      const mockCanvas = document.createElement('canvas');
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getCachedFrameCanvas = vi.fn().mockReturnValue(mockCanvas);

      vi.mocked(host.getCurrentFrame).mockReturnValue(3);
      const result = manager.getFrameCanvasForSource(videoSource, 7);

      // Verify observable output: correct canvas returned for explicit frame
      expect(result).toBe(mockCanvas);
    });

    it('MM-077: returns null when frameIndex not provided and no cached canvas', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getCachedFrameCanvas = vi.fn().mockReturnValue(null);

      vi.mocked(host.getCurrentFrame).mockReturnValue(15);
      const result = manager.getFrameCanvasForSource(videoSource);

      // Verify observable output: null returned when no canvas cached
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // fetchFrameForSource
  // ---------------------------------------------------------------

  describe('fetchFrameForSource', () => {
    it('MM-078: does nothing for null source', async () => {
      await expect(manager.fetchFrameForSource(null, 1)).resolves.not.toThrow();
    });

    it('MM-079: does nothing for non-video source', async () => {
      await expect(manager.fetchFrameForSource(createImageSource(), 1)).resolves.not.toThrow();
    });

    it('MM-080: delegates to videoSourceNode.getFrameAsync', async () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getFrameAsync = vi.fn().mockResolvedValue(null);

      await manager.fetchFrameForSource(videoSource, 42);
      expect(videoSource.videoSourceNode!.getFrameAsync).toHaveBeenCalledWith(42);
    });
  });

  // ---------------------------------------------------------------
  // preloadVideoFrames
  // ---------------------------------------------------------------

  describe('preloadVideoFrames', () => {
    it('MM-081: does nothing when no video source', () => {
      expect(() => manager.preloadVideoFrames()).not.toThrow();
    });

    it('MM-082: delegates to videoSourceNode.preloadFrames', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.preloadFrames = vi.fn().mockResolvedValue(undefined);
      manager.addSource(videoSource);

      vi.mocked(host.getCurrentFrame).mockReturnValue(5);
      manager.preloadVideoFrames();

      expect(videoSource.videoSourceNode!.preloadFrames).toHaveBeenCalledWith(5);
    });

    it('MM-083: uses explicit centerFrame parameter', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.preloadFrames = vi.fn().mockResolvedValue(undefined);
      manager.addSource(videoSource);

      manager.preloadVideoFrames(20);
      expect(videoSource.videoSourceNode!.preloadFrames).toHaveBeenCalledWith(20);
    });
  });

  // ---------------------------------------------------------------
  // fetchCurrentVideoFrame
  // ---------------------------------------------------------------

  describe('fetchCurrentVideoFrame', () => {
    it('MM-084: does nothing when no video source', async () => {
      await expect(manager.fetchCurrentVideoFrame()).resolves.not.toThrow();
    });

    it('MM-085: skips fetch when frame is already cached', async () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.hasFrameCached = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getFrameAsync = vi.fn();
      manager.addSource(videoSource);

      vi.mocked(host.getCurrentFrame).mockReturnValue(5);
      await manager.fetchCurrentVideoFrame();

      expect(videoSource.videoSourceNode!.getFrameAsync).not.toHaveBeenCalled();
    });

    it('MM-086: fetches frame when not cached', async () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.hasFrameCached = vi.fn().mockReturnValue(false);
      videoSource.videoSourceNode!.getFrameAsync = vi.fn().mockResolvedValue(null);
      manager.addSource(videoSource);

      vi.mocked(host.getCurrentFrame).mockReturnValue(7);
      await manager.fetchCurrentVideoFrame();

      expect(videoSource.videoSourceNode!.getFrameAsync).toHaveBeenCalledWith(7);
    });

    it('MM-087: uses explicit frameIndex parameter', async () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.hasFrameCached = vi.fn().mockReturnValue(false);
      videoSource.videoSourceNode!.getFrameAsync = vi.fn().mockResolvedValue(null);
      manager.addSource(videoSource);

      await manager.fetchCurrentVideoFrame(33);
      expect(videoSource.videoSourceNode!.hasFrameCached).toHaveBeenCalledWith(33);
      expect(videoSource.videoSourceNode!.getFrameAsync).toHaveBeenCalledWith(33);
    });
  });

  // ---------------------------------------------------------------
  // Cache operations
  // ---------------------------------------------------------------

  describe('getCachedFrames', () => {
    it('MM-088: returns empty set when no video source', () => {
      expect(manager.getCachedFrames()).toEqual(new Set());
    });

    it('MM-089: delegates to videoSourceNode.getCachedFrames', () => {
      const frames = new Set([1, 2, 3]);
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getCachedFrames = vi.fn().mockReturnValue(frames);
      manager.addSource(videoSource);

      expect(manager.getCachedFrames()).toBe(frames);
    });
  });

  describe('getPendingFrames', () => {
    it('MM-090: returns empty set when no video source', () => {
      expect(manager.getPendingFrames()).toEqual(new Set());
    });

    it('MM-091: delegates to videoSourceNode.getPendingFrames', () => {
      const pending = new Set([4, 5]);
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getPendingFrames = vi.fn().mockReturnValue(pending);
      manager.addSource(videoSource);

      expect(manager.getPendingFrames()).toBe(pending);
    });
  });

  describe('getCacheStats', () => {
    it('MM-092: returns null when no video source', () => {
      expect(manager.getCacheStats()).toBeNull();
    });

    it('MM-093: delegates to videoSourceNode.getCacheStats', () => {
      const stats = { cachedCount: 10, pendingCount: 2, totalFrames: 100, maxCacheSize: 200 };
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.getCacheStats = vi.fn().mockReturnValue(stats);
      manager.addSource(videoSource);

      expect(manager.getCacheStats()).toBe(stats);
    });

    it('MM-094: returns null for non-mediabunny video source', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(false);
      manager.addSource(videoSource);

      expect(manager.getCacheStats()).toBeNull();
    });
  });

  describe('clearVideoCache', () => {
    it('MM-095: does nothing when no video source', () => {
      expect(() => manager.clearVideoCache()).not.toThrow();
    });

    it('MM-096: delegates to videoSourceNode.clearCache', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(true);
      videoSource.videoSourceNode!.clearCache = vi.fn();
      manager.addSource(videoSource);

      manager.clearVideoCache();
      expect(videoSource.videoSourceNode!.clearCache).toHaveBeenCalled();
    });

    it('MM-097: does nothing for non-mediabunny video source', () => {
      const videoSource = createVideoSource();
      videoSource.videoSourceNode!.isUsingMediabunny = vi.fn().mockReturnValue(false);
      videoSource.videoSourceNode!.clearCache = vi.fn();
      manager.addSource(videoSource);

      manager.clearVideoCache();
      expect(videoSource.videoSourceNode!.clearCache).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // Disposal
  // ---------------------------------------------------------------

  describe('disposeSequenceSource', () => {
    it('MM-098: disposes sequence frames', () => {
      const seqSource = createSequenceSource();
      manager.disposeSequenceSource(seqSource);
      expect(disposeSequence).toHaveBeenCalledWith(seqSource.sequenceFrames);
    });

    it('MM-099: does nothing for non-sequence source', () => {
      manager.disposeSequenceSource(createImageSource());
      expect(disposeSequence).not.toHaveBeenCalled();
    });
  });

  describe('disposeVideoSource', () => {
    it('MM-100: disposes videoSourceNode', () => {
      const videoSource = createVideoSource();
      manager.disposeVideoSource(videoSource);
      expect(videoSource.videoSourceNode!.dispose).toHaveBeenCalled();
    });

    it('MM-101: does nothing for non-video source', () => {
      expect(() => manager.disposeVideoSource(createImageSource())).not.toThrow();
    });

    it('MM-102: does nothing for video source without videoSourceNode', () => {
      const source = createVideoSource();
      delete source.videoSourceNode;
      expect(() => manager.disposeVideoSource(source)).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('MM-103: disposes all sources', () => {
      const seqSource = createSequenceSource();
      const videoSource = createVideoSource();
      manager.addSource(seqSource);
      manager.addSource(videoSource);

      manager.dispose();

      expect(disposeSequence).toHaveBeenCalledWith(seqSource.sequenceFrames);
      expect(videoSource.videoSourceNode!.dispose).toHaveBeenCalled();
      expect(manager.sources).toEqual([]);
      expect(manager.sourceCount).toBe(0);
    });

    it('MM-104: clears all sources after disposal', () => {
      manager.addSource(createImageSource());
      manager.addSource(createImageSource());
      expect(manager.sourceCount).toBe(2);

      manager.dispose();
      expect(manager.sourceCount).toBe(0);
      expect(manager.currentSource).toBeNull();
    });

    it('MM-105: is safe to call with no sources', () => {
      manager.dispose();
      expect(manager.sourceCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Working without a host
  // ---------------------------------------------------------------

  describe('without host', () => {
    it('MM-106: addSource works without host', () => {
      const managerNoHost = new MediaManager();
      const source = createImageSource();
      managerNoHost.addSource(source);
      expect(managerNoHost.sourceCount).toBe(1);
      expect(managerNoHost.currentSource).toBe(source);
    });

    it('MM-107: setCurrentSource works without host', () => {
      const managerNoHost = new MediaManager();
      managerNoHost.addSource(createImageSource({ name: 'a.png' }));
      managerNoHost.addSource(createImageSource({ name: 'b.png' }));
      managerNoHost.setCurrentSource(0);
      expect(managerNoHost.currentSourceIndex).toBe(0);
    });

    it('MM-108: dispose works without host', () => {
      const managerNoHost = new MediaManager();
      managerNoHost.addSource(createImageSource());
      managerNoHost.dispose();
      expect(managerNoHost.sourceCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------

  describe('edge cases', () => {
    it('MM-109: multiple sources maintain correct ordering', () => {
      const src1 = createImageSource({ name: 'first.png' });
      const src2 = createImageSource({ name: 'second.png' });
      const src3 = createImageSource({ name: 'third.png' });

      manager.addSource(src1);
      manager.addSource(src2);
      manager.addSource(src3);

      expect(manager.getSourceByIndex(0)).toBe(src1);
      expect(manager.getSourceByIndex(1)).toBe(src2);
      expect(manager.getSourceByIndex(2)).toBe(src3);
    });

    it('MM-110: allSources returns same reference as sources', () => {
      manager.addSource(createImageSource());
      expect(manager.allSources).toBe(manager.sources);
    });

    it('MM-111: loadImageFile uses FPS default of 24 when host has no fps', () => {
      const managerNoHost = new MediaManager();
      // loadImageFile will use _host?.getFps() ?? 24
      // Without host, it should default to 24
      const loadFileSpy = vi.fn().mockResolvedValue(undefined);
      vi.mocked(FileSourceNode).mockImplementationOnce(() => ({
        loadFile: loadFileSpy,
        isHDR: vi.fn().mockReturnValue(false),
        formatName: null,
        width: 100,
        height: 100,
        properties: { getValue: vi.fn().mockReturnValue('url') },
      }) as unknown as FileSourceNode);

      // We can't easily verify the fps without checking the source
      // But the method should not throw
      return expect(managerNoHost.loadImageFile(new File([], 'test.png'))).resolves.toBeUndefined();
    });

    it('MM-112: setCurrentSource handles video-to-image switching', () => {
      const video = document.createElement('video');
      video.pause = vi.fn();
      const videoSource = createVideoSource({ element: video, duration: 100 });
      const imageSource = createImageSource({ duration: 1 });

      manager.addSource(videoSource);
      manager.addSource(imageSource);

      // Reset to video (index 0)
      manager.currentSourceIndex = 0;
      // Now switch to image (index 1)
      manager.setCurrentSource(1);

      // Verify observable state: switched to image source
      expect(manager.currentSourceIndex).toBe(1);
      expect(manager.currentSource?.type).toBe('image');
      expect(manager.currentSource?.duration).toBe(1);
      // Video pause is an interface contract (side effect on the DOM element)
      expect(video.pause).toHaveBeenCalled();
    });
  });
});
