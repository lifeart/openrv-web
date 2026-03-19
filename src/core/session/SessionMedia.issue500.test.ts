/**
 * Regression tests for Issue #500:
 * Validates the image-loading architecture described in the file-format guide.
 *
 * - loadImageFile() creates a FileSourceNode (local file path)
 * - loadImage() is the URL/HTMLImageElement path
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionMedia, type SessionMediaHost } from './SessionMedia';

// ---- Mocks ----

// Track FileSourceNode construction and loadFile calls
const fileSourceNodeInstances: any[] = [];
const { MockFileSourceNode } = vi.hoisted(() => {
  class _MockFileSourceNode {
    name: string;
    properties = {
      getValue: vi.fn().mockReturnValue('blob:mock-url'),
    };
    width = 800;
    height = 600;
    _loadFileCalled = false;
    _loadFileArg: any = null;

    constructor(name: string) {
      this.name = name;
    }

    async loadFile(file: File): Promise<void> {
      this._loadFileCalled = true;
      this._loadFileArg = file;
    }

    isHDR() {
      return false;
    }

    get formatName() {
      return 'standard';
    }

    dispose() {}
  }
  return { MockFileSourceNode: _MockFileSourceNode };
});

vi.mock('../../nodes/sources/FileSourceNode', () => ({
  FileSourceNode: class extends MockFileSourceNode {
    constructor(name: string) {
      super(name);
      fileSourceNodeInstances.push(this);
    }
  },
}));

vi.mock('../../nodes/sources/VideoSourceNode', () => ({
  VideoSourceNode: class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
  },
}));

vi.mock('../../nodes/sources/ProceduralSourceNode', () => ({
  ProceduralSourceNode: class {},
  parseMovieProc: vi.fn(),
}));

vi.mock('./loaders/SequenceRepresentationLoader', () => ({
  SequenceSourceNodeWrapper: class {},
}));

vi.mock('../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
  createSequenceInfoFromPattern: vi.fn(),
  isSequencePattern: vi.fn(),
  loadFrameImage: vi.fn(),
  loadFrameImageFromURL: vi.fn(),
  preloadFrames: vi.fn(),
  releaseDistantFrames: vi.fn(),
  disposeSequence: vi.fn(),
  buildFrameNumberMap: (_frames: any[]) => new Map(),
  getSequenceFrameRange: (info: any) => info.endFrame - info.startFrame + 1,
}));

vi.mock('../../utils/media/SupportedMediaFormats', () => ({
  detectMediaTypeFromFile: vi.fn().mockReturnValue('image'),
  detectMediaTypeFromFileBytes: vi.fn().mockResolvedValue('unknown'),
}));

vi.mock('../../cache/MediaCacheKey', () => ({
  computeCacheKey: vi.fn().mockResolvedValue('mock-cache-key'),
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

/** Shared MockImage that auto-fires onload when src is set. */
class MockImage {
  crossOrigin = '';
  src = '';
  width: number;
  height: number;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(width = 100, height = 100) {
    this.width = width;
    this.height = height;
    const self = this;
    let _src = '';
    Object.defineProperty(this, 'src', {
      get() {
        return _src;
      },
      set(v: string) {
        _src = v;
        setTimeout(() => self.onload?.(), 0);
      },
    });
  }
}

describe('Issue #500: Image loading architecture', () => {
  let media: SessionMedia;
  let host: SessionMediaHost;

  beforeEach(() => {
    fileSourceNodeInstances.length = 0;
    media = new SessionMedia();
    host = createMockHost();
    media.setHost(host);
  });

  afterEach(() => {
    media.removeAllListeners();
  });

  describe('loadImageFile creates a FileSourceNode', () => {
    it('creates a FileSourceNode instance for local file loading', async () => {
      const file = new File(['dummy'], 'photo.png', { type: 'image/png' });

      await media.loadImageFile(file);

      expect(fileSourceNodeInstances).toHaveLength(1);
      expect(fileSourceNodeInstances[0].name).toBe('photo.png');
    });

    it('calls fileSourceNode.loadFile with the File object', async () => {
      const file = new File(['dummy'], 'render.exr', { type: '' });

      await media.loadImageFile(file);

      expect(fileSourceNodeInstances).toHaveLength(1);
      expect(fileSourceNodeInstances[0]._loadFileCalled).toBe(true);
      expect(fileSourceNodeInstances[0]._loadFileArg).toBe(file);
    });

    it('stores the FileSourceNode on the resulting MediaSource', async () => {
      const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });

      await media.loadImageFile(file);

      const source = media.currentSource;
      expect(source).not.toBeNull();
      expect(source!.fileSourceNode).toBe(fileSourceNodeInstances[0]);
    });

    it('emits sourceLoaded with fileSourceNode attached', async () => {
      const file = new File(['dummy'], 'frame.dpx', { type: '' });
      const loaded: any[] = [];
      media.on('sourceLoaded', (s) => loaded.push(s));

      await media.loadImageFile(file);

      expect(loaded).toHaveLength(1);
      expect(loaded[0].fileSourceNode).toBeDefined();
      expect(loaded[0].fileSourceNode).toBe(fileSourceNodeInstances[0]);
    });
  });

  describe('loadImage is the URL/HTMLImageElement path', () => {
    let originalImage: typeof globalThis.Image;

    beforeEach(() => {
      originalImage = globalThis.Image;
      globalThis.Image = MockImage as any;
    });

    afterEach(() => {
      globalThis.Image = originalImage;
    });

    it('does NOT create a FileSourceNode', async () => {
      await media.loadImage('remote.png', 'https://example.com/remote.png');
      expect(fileSourceNodeInstances).toHaveLength(0);
    });

    it('creates a source with an HTMLImageElement, not a FileSourceNode', async () => {
      await media.loadImage('url-image.jpg', 'https://cdn.example.com/img.jpg');
      const source = media.currentSource;
      expect(source).not.toBeNull();
      expect(source!.fileSourceNode).toBeUndefined();
      expect(source!.element).toBeDefined();
      expect(source!.url).toBe('https://cdn.example.com/img.jpg');
    });
  });

});
