/**
 * Issue #499 regression tests:
 * SessionMedia creates image sources with duration: 1 for GIF and WebP files,
 * confirming they are treated as single-frame stills (not animated media).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionMedia, type SessionMediaHost } from './SessionMedia';

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

const { MockFileSourceNode } = vi.hoisted(() => {
  class _MockFileSourceNode {
    properties = {
      getValue: vi.fn().mockReturnValue(''),
    };
    constructor(_name: string) {
      // name stored internally by real FileSourceNode
    }
    get width() {
      return 100;
    }
    get height() {
      return 100;
    }
    get formatName() {
      return 'standard';
    }
    isHDR() {
      return false;
    }
    dispose() {}
    async loadFile(_file: any) {}
  }
  return { MockFileSourceNode: _MockFileSourceNode };
});

vi.mock('../../nodes/sources/FileSourceNode', () => ({
  FileSourceNode: MockFileSourceNode,
}));

vi.mock('../../nodes/sources/VideoSourceNode', () => ({
  VideoSourceNode: class {},
}));

vi.mock('./loaders/SequenceRepresentationLoader', () => ({
  SequenceSourceNodeWrapper: class {},
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

describe('Issue #499 – SessionMedia loads GIF/WebP as single-frame images', () => {
  let sessionMedia: SessionMedia;
  let host: SessionMediaHost;

  beforeEach(() => {
    sessionMedia = new SessionMedia();
    host = createMockHost();
    sessionMedia.setHost(host);
  });

  it('loadImageFile sets duration: 1 for a .gif file', async () => {
    const file = new File(['fake-gif-data'], 'animation.gif', { type: 'image/gif' });

    await sessionMedia.loadImageFile(file);

    const source = sessionMedia.currentSource;
    expect(source).not.toBeNull();
    expect(source!.type).toBe('image');
    expect(source!.duration).toBe(1);
    expect(source!.name).toBe('animation.gif');
  });

  it('loadImageFile sets duration: 1 for a .webp file', async () => {
    const file = new File(['fake-webp-data'], 'animation.webp', { type: 'image/webp' });

    await sessionMedia.loadImageFile(file);

    const source = sessionMedia.currentSource;
    expect(source).not.toBeNull();
    expect(source!.type).toBe('image');
    expect(source!.duration).toBe(1);
    expect(source!.name).toBe('animation.webp');
  });

  it('isSingleImage returns true for GIF source', async () => {
    const file = new File(['fake-gif-data'], 'test.gif', { type: 'image/gif' });
    await sessionMedia.loadImageFile(file);
    expect(sessionMedia.isSingleImage).toBe(true);
  });

  it('isSingleImage returns true for WebP source', async () => {
    const file = new File(['fake-webp-data'], 'test.webp', { type: 'image/webp' });
    await sessionMedia.loadImageFile(file);
    expect(sessionMedia.isSingleImage).toBe(true);
  });
});
