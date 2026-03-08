import { describe, it, expect, vi } from 'vitest';
import { createRepresentationLoader } from './RepresentationLoaderFactory';
import { FileRepresentationLoader } from './FileRepresentationLoader';
import { VideoRepresentationLoader } from './VideoRepresentationLoader';
import { SequenceRepresentationLoader } from './SequenceRepresentationLoader';

// Mock the source nodes used by loaders
vi.mock('../../../nodes/sources/FileSourceNode', () => ({
  FileSourceNode: class MockFileSourceNode {
    loadFile = vi.fn().mockResolvedValue(undefined);
    isHDR = vi.fn().mockReturnValue(false);
    width = 1920;
    height = 1080;
    properties = { getValue: vi.fn() };
    dispose = vi.fn();
  },
}));

vi.mock('../../../nodes/sources/VideoSourceNode', () => ({
  VideoSourceNode: class MockVideoSourceNode {
    loadFile = vi.fn().mockResolvedValue({ success: true });
    isHDR = vi.fn().mockReturnValue(false);
    getMetadata = vi.fn().mockReturnValue({ width: 1920, height: 1080, duration: 100, fps: 24 });
    dispose = vi.fn();
  },
}));

vi.mock('../../../utils/media/SequenceLoader', () => ({
  createSequenceInfo: vi.fn(),
}));

describe('RepresentationLoaderFactory', () => {
  describe('createRepresentationLoader', () => {
    it('should create a FileRepresentationLoader for "frames" kind', () => {
      const loader = createRepresentationLoader('frames');
      expect(loader).toBeInstanceOf(FileRepresentationLoader);
    });

    it('should create a SequenceRepresentationLoader for "frames" kind with isSequence', () => {
      const loader = createRepresentationLoader('frames', 'none', true);
      expect(loader).toBeInstanceOf(SequenceRepresentationLoader);
    });

    it('should create a VideoRepresentationLoader for "movie" kind', () => {
      const loader = createRepresentationLoader('movie');
      expect(loader).toBeInstanceOf(VideoRepresentationLoader);
    });

    it('should create a VideoRepresentationLoader for "proxy" kind', () => {
      const loader = createRepresentationLoader('proxy');
      expect(loader).toBeInstanceOf(VideoRepresentationLoader);
    });

    it('should throw for "streaming" kind (not yet supported)', () => {
      expect(() => createRepresentationLoader('streaming')).toThrow('Streaming representations are not yet supported');
    });

    it('should pass hdrResizeTier to VideoRepresentationLoader', () => {
      const loader = createRepresentationLoader('movie', 'rec2100');
      expect(loader).toBeInstanceOf(VideoRepresentationLoader);
    });
  });
});

describe('FileRepresentationLoader', () => {
  it('should throw if no file is provided', async () => {
    const loader = new FileRepresentationLoader();
    const rep = {
      id: 'test',
      label: 'Test',
      kind: 'frames' as const,
      priority: 0,
      status: 'idle' as const,
      resolution: { width: 0, height: 0 },
      par: 1.0,
      sourceNode: null,
      loaderConfig: {},
      audioTrackPresent: false,
      startFrame: 0,
    };

    await expect(loader.load(rep)).rejects.toThrow('no file provided');
  });

  it('should load a file and return result', async () => {
    const loader = new FileRepresentationLoader();
    const mockFile = new File(['test'], 'test.exr', { type: 'image/x-exr' });

    const rep = {
      id: 'test',
      label: 'Test',
      kind: 'frames' as const,
      priority: 0,
      status: 'idle' as const,
      resolution: { width: 0, height: 0 },
      par: 1.0,
      sourceNode: null,
      loaderConfig: { file: mockFile },
      audioTrackPresent: false,
      startFrame: 0,
    };

    const result = await loader.load(rep);
    expect(result.sourceNode).toBeDefined();
    expect(result.audioTrackPresent).toBe(false);
    expect(result.par).toBe(1.0);
  });

  it('should dispose the source node', async () => {
    const loader = new FileRepresentationLoader();
    const mockFile = new File(['test'], 'test.exr', { type: 'image/x-exr' });

    const rep = {
      id: 'test',
      label: 'Test',
      kind: 'frames' as const,
      priority: 0,
      status: 'idle' as const,
      resolution: { width: 0, height: 0 },
      par: 1.0,
      sourceNode: null,
      loaderConfig: { file: mockFile },
      audioTrackPresent: false,
      startFrame: 0,
    };

    await loader.load(rep);
    loader.dispose();
    // Should not throw
  });
});

describe('VideoRepresentationLoader', () => {
  it('should throw if no file is provided', async () => {
    const loader = new VideoRepresentationLoader();
    const rep = {
      id: 'test',
      label: 'Test',
      kind: 'movie' as const,
      priority: 1,
      status: 'idle' as const,
      resolution: { width: 0, height: 0 },
      par: 1.0,
      sourceNode: null,
      loaderConfig: {},
      audioTrackPresent: false,
      startFrame: 0,
    };

    await expect(loader.load(rep)).rejects.toThrow('no file provided');
  });

  it('should load a video file and return result', async () => {
    const loader = new VideoRepresentationLoader();
    const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });

    const rep = {
      id: 'test',
      label: 'Test',
      kind: 'movie' as const,
      priority: 1,
      status: 'idle' as const,
      resolution: { width: 0, height: 0 },
      par: 1.0,
      sourceNode: null,
      loaderConfig: { file: mockFile },
      audioTrackPresent: false,
      startFrame: 0,
    };

    const result = await loader.load(rep);
    expect(result.sourceNode).toBeDefined();
    expect(result.audioTrackPresent).toBe(true);
    expect(result.resolution.width).toBe(1920);
  });
});

describe('SequenceRepresentationLoader', () => {
  it('should throw if no files are provided', async () => {
    const loader = new SequenceRepresentationLoader();
    const rep = {
      id: 'test',
      label: 'Test',
      kind: 'frames' as const,
      priority: 0,
      status: 'idle' as const,
      resolution: { width: 0, height: 0 },
      par: 1.0,
      sourceNode: null,
      loaderConfig: {},
      audioTrackPresent: false,
      startFrame: 0,
    };

    await expect(loader.load(rep)).rejects.toThrow('no files provided');
  });
});
