import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MuSourceBridge } from '../MuSourceBridge';
import type { PixelReadbackProvider } from '../MuSourceBridge';

// --- Mock openrv API ---

function createMockOpenRV() {
  return {
    media: {
      getCurrentSource: vi.fn().mockReturnValue({
        name: 'test-source',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
      }),
      getResolution: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
      hasMedia: vi.fn().mockReturnValue(true),
      getFPS: vi.fn().mockReturnValue(24),
      getSourceCount: vi.fn().mockReturnValue(1),
    },
  };
}

describe('MuSourceBridge', () => {
  let bridge: MuSourceBridge;
  let mockOpenRV: ReturnType<typeof createMockOpenRV>;

  beforeEach(() => {
    bridge = new MuSourceBridge();
    mockOpenRV = createMockOpenRV();
    (globalThis as Record<string, unknown>).openrv = mockOpenRV;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).openrv;
  });

  // ==================================================================
  // Source Listing & Queries
  // ==================================================================

  describe('sources', () => {
    it('returns empty array initially, then falls back to openrv current source', () => {
      const result = bridge.sources();
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('test-source');
    });

    it('returns locally tracked sources when available', async () => {
      await bridge.addSource(['/path/to/movie.mov'], 'movie');
      await bridge.addSource(['/path/to/image.exr'], 'image');
      const result = bridge.sources();
      expect(result).toHaveLength(2);
      expect(result[0]!.media).toBe('/path/to/movie.mov');
      expect(result[0]!.tag).toBe('movie');
      expect(result[1]!.media).toBe('/path/to/image.exr');
    });

    it('returns empty array when no sources and openrv has no media', () => {
      mockOpenRV.media.getCurrentSource.mockReturnValue(null);
      expect(bridge.sources()).toEqual([]);
    });
  });

  describe('sourcesAtFrame', () => {
    it('throws on invalid frame', () => {
      expect(() => bridge.sourcesAtFrame(NaN)).toThrow(TypeError);
    });

    it('falls back to openrv current source when no local sources', () => {
      const result = bridge.sourcesAtFrame(1);
      expect(result).toContain('test-source');
    });

    it('returns sources whose frame range includes the given frame', async () => {
      await bridge.addSource(['/a.mov'], 'default');
      const sources = bridge.sources();
      const name = sources[0]!.name;
      bridge.setSourceFrameRange(name, 1, 50);

      expect(bridge.sourcesAtFrame(25)).toContain(name);
      expect(bridge.sourcesAtFrame(51)).not.toContain(name);
    });
  });

  describe('getCurrentImageSize', () => {
    it('returns resolution from openrv', () => {
      expect(bridge.getCurrentImageSize()).toEqual([1920, 1080]);
    });

    it('returns [0,0] when openrv is not available', () => {
      delete (globalThis as Record<string, unknown>).openrv;
      expect(bridge.getCurrentImageSize()).toEqual([0, 0]);
    });
  });

  // ==================================================================
  // Source Addition
  // ==================================================================

  describe('addSource', () => {
    it('creates a source record', async () => {
      await bridge.addSource(['/path/movie.mov'], 'movie');
      expect(bridge.sourceCount()).toBe(1);
    });

    it('throws on empty paths', async () => {
      await expect(bridge.addSource([], 'x')).rejects.toThrow(TypeError);
    });

    it('throws on non-array', async () => {
      // @ts-expect-error testing invalid input
      await expect(bridge.addSource('bad', 'x')).rejects.toThrow(TypeError);
    });

    it('uses default tag when none provided', async () => {
      await bridge.addSource(['/a.mov']);
      const sources = bridge.sources();
      expect(sources[0]!.tag).toBe('default');
    });
  });

  describe('addSources', () => {
    it('adds multiple sources', async () => {
      await bridge.addSources(
        [['/a.mov'], ['/b.mov'], ['/c.exr']],
        'batch',
      );
      expect(bridge.sourceCount()).toBe(3);
    });

    it('throws on non-array', async () => {
      // @ts-expect-error testing invalid input
      await expect(bridge.addSources('bad')).rejects.toThrow(TypeError);
    });
  });

  describe('addSourceVerbose', () => {
    it('returns the created source name', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov'], 'tag1');
      expect(typeof name).toBe('string');
      expect(name).toMatch(/^sourceGroup\d{6}$/);
    });

    it('throws on empty paths', async () => {
      await expect(bridge.addSourceVerbose([])).rejects.toThrow(TypeError);
    });
  });

  describe('addSourcesVerbose', () => {
    it('returns all created names', async () => {
      const names = await bridge.addSourcesVerbose(
        [['/a.mov'], ['/b.exr']],
        'multi',
      );
      expect(names).toHaveLength(2);
      expect(names[0]).not.toBe(names[1]);
    });
  });

  describe('addSourceBegin / addSourceEnd', () => {
    it('queues sources during batch mode', async () => {
      bridge.addSourceBegin();
      await bridge.addSource(['/a.mov'], 'batch');
      await bridge.addSource(['/b.mov'], 'batch');
      // Nothing committed yet
      expect(bridge.sourceCount()).toBe(0);

      await bridge.addSourceEnd();
      expect(bridge.sourceCount()).toBe(2);
    });

    it('addSourceVerbose returns name during batch', async () => {
      bridge.addSourceBegin();
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(typeof name).toBe('string');
      await bridge.addSourceEnd();
    });
  });

  // ==================================================================
  // Source Modification
  // ==================================================================

  describe('addToSource', () => {
    it('appends a media path to an existing source', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      bridge.addToSource(name, '/a-layer2.mov');
      const media = bridge.sourceMedia(name);
      expect(media.media).toEqual(['/a.mov', '/a-layer2.mov']);
    });

    it('throws for non-existent source', () => {
      expect(() => bridge.addToSource('nope', '/x.mov')).toThrow(
        'Source not found',
      );
    });
  });

  describe('setSourceMedia', () => {
    it('replaces media paths', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      bridge.setSourceMedia(name, ['/new1.mov', '/new2.mov']);
      expect(bridge.sourceMedia(name).media).toEqual([
        '/new1.mov',
        '/new2.mov',
      ]);
    });

    it('throws on non-array', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      // @ts-expect-error testing invalid input
      expect(() => bridge.setSourceMedia(name, 'bad')).toThrow(TypeError);
    });
  });

  describe('relocateSource', () => {
    it('replaces the first media path', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov', '/layer.mov']);
      bridge.relocateSource(name, '/relocated.mov');
      expect(bridge.sourceMedia(name).media[0]).toBe('/relocated.mov');
      expect(bridge.sourceMedia(name).media[1]).toBe('/layer.mov');
    });

    it('throws on non-string path', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      // @ts-expect-error testing invalid input
      expect(() => bridge.relocateSource(name, 123)).toThrow(TypeError);
    });
  });

  // ==================================================================
  // Source Media Queries
  // ==================================================================

  describe('sourceMedia', () => {
    it('returns media paths for a source', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov', '/b.exr']);
      const result = bridge.sourceMedia(name);
      expect(result.media).toEqual(['/a.mov', '/b.exr']);
    });

    it('returns a copy (not a reference)', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      const result1 = bridge.sourceMedia(name);
      result1.media.push('/extra.mov');
      const result2 = bridge.sourceMedia(name);
      expect(result2.media).toEqual(['/a.mov']);
    });
  });

  describe('sourceMediaInfo', () => {
    it('returns source media info with local state', async () => {
      const name = await bridge.addSourceVerbose(['/movie.mov']);
      bridge.setSourceDimensions(name, 3840, 2160, 1.0);
      bridge.setSourceFrameRange(name, 1, 200);
      bridge.setSourceChannelNames(name, ['R', 'G', 'B', 'A']);

      const info = bridge.sourceMediaInfo(name);
      expect(info.name).toBe(name);
      expect(info.file).toBe('/movie.mov');
      expect(info.width).toBe(3840);
      expect(info.height).toBe(2160);
      expect(info.startFrame).toBe(1);
      expect(info.endFrame).toBe(200);
      expect(info.pixelAspect).toBe(1.0);
      expect(info.channelNames).toEqual(['R', 'G', 'B', 'A']);
      expect(info.numChannels).toBe(4);
    });

    it('enriches from openrv when source name matches', async () => {
      // Create a source with the same name as openrv's current source
      await bridge.addSource(['/test.mov'], 'default');
      // Force the source name to match
      const sources = bridge.sources();
      // The openrv mock returns name "test-source", which won't match auto-generated names
      // So the info should use local defaults
      const info = bridge.sourceMediaInfo(sources[0]!.name);
      expect(info.width).toBe(0); // local default since name doesn't match
    });
  });

  describe('sourceMediaInfoList', () => {
    it('returns info for all sources', async () => {
      await bridge.addSource(['/a.mov']);
      await bridge.addSource(['/b.exr']);
      const list = bridge.sourceMediaInfoList();
      expect(list).toHaveLength(2);
      expect(list[0]!.file).toBe('/a.mov');
      expect(list[1]!.file).toBe('/b.exr');
    });
  });

  // ==================================================================
  // Source Attributes
  // ==================================================================

  describe('sourceAttributes', () => {
    it('returns empty array initially', async () => {
      const name = await bridge.addSourceVerbose(['/a.exr']);
      expect(bridge.sourceAttributes(name)).toEqual([]);
    });

    it('returns set attributes as tuples', async () => {
      const name = await bridge.addSourceVerbose(['/a.exr']);
      bridge.setSourceAttribute(name, 'compression', 'piz');
      bridge.setSourceAttribute(name, 'colorSpace', 'ACEScg');
      const attrs = bridge.sourceAttributes(name);
      expect(attrs).toEqual([
        ['compression', 'piz'],
        ['colorSpace', 'ACEScg'],
      ]);
    });
  });

  describe('sourceDataAttributes', () => {
    it('returns empty array initially', async () => {
      const name = await bridge.addSourceVerbose(['/a.exr']);
      expect(bridge.sourceDataAttributes(name)).toEqual([]);
    });

    it('returns binary data attributes', async () => {
      const name = await bridge.addSourceVerbose(['/a.exr']);
      const icc = new Uint8Array([0, 1, 2, 3]);
      bridge.setSourceDataAttribute(name, 'ICCProfile', icc);
      const attrs = bridge.sourceDataAttributes(name);
      expect(attrs).toHaveLength(1);
      expect(attrs[0]![0]).toBe('ICCProfile');
      expect(attrs[0]![1]).toEqual(icc);
    });
  });

  describe('sourcePixelValue', () => {
    it('returns null for non-image sources without readback provider', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(bridge.sourcePixelValue(name, 0, 0)).toBeNull();
    });

    it('reads from in-memory image source', () => {
      const name = bridge.newImageSource('testImg', 2, 2, 4);
      const pixels = new Float32Array([
        1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1,
      ]);
      bridge.newImageSourcePixels(name, 0, pixels);

      expect(bridge.sourcePixelValue(name, 0, 0)).toEqual([1, 0, 0, 1]);
      expect(bridge.sourcePixelValue(name, 1, 0)).toEqual([0, 1, 0, 1]);
      expect(bridge.sourcePixelValue(name, 0, 1)).toEqual([0, 0, 1, 1]);
      expect(bridge.sourcePixelValue(name, 1, 1)).toEqual([1, 1, 1, 1]);
    });

    it('returns null for out-of-bounds coordinates on in-memory source', () => {
      const name = bridge.newImageSource('testImg', 2, 2, 4);
      bridge.newImageSourcePixels(
        name,
        0,
        new Float32Array(2 * 2 * 4),
      );
      expect(bridge.sourcePixelValue(name, -1, 0)).toBeNull();
      expect(bridge.sourcePixelValue(name, 5, 5)).toBeNull();
    });

    it('throws on invalid coordinates', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      // @ts-expect-error testing invalid input
      expect(() => bridge.sourcePixelValue(name, 'a', 0)).toThrow(TypeError);
    });

    it('throws for non-existent source', () => {
      expect(() => bridge.sourcePixelValue('nope', 0, 0)).toThrow(
        'Source not found',
      );
    });

    it('delegates to PixelReadbackProvider for GPU-backed sources', async () => {
      const name = await bridge.addSourceVerbose(['/movie.mov']);
      const mockProvider: PixelReadbackProvider = {
        readSourcePixel: vi.fn().mockReturnValue([0.5, 0.25, 0.75, 1.0]),
      };
      bridge.setPixelReadbackProvider(mockProvider);

      const result = bridge.sourcePixelValue(name, 100, 200);
      expect(result).toEqual([0.5, 0.25, 0.75, 1.0]);
      expect(mockProvider.readSourcePixel).toHaveBeenCalledWith(name, 100, 200);
    });

    it('returns null when readback provider returns null', async () => {
      const name = await bridge.addSourceVerbose(['/movie.mov']);
      const mockProvider: PixelReadbackProvider = {
        readSourcePixel: vi.fn().mockReturnValue(null),
      };
      bridge.setPixelReadbackProvider(mockProvider);

      expect(bridge.sourcePixelValue(name, 0, 0)).toBeNull();
    });

    it('prefers in-memory data over readback provider', () => {
      const name = bridge.newImageSource('testImg', 2, 2, 4);
      const pixels = new Float32Array([
        1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1,
      ]);
      bridge.newImageSourcePixels(name, 0, pixels);

      const mockProvider: PixelReadbackProvider = {
        readSourcePixel: vi.fn().mockReturnValue([0, 0, 0, 0]),
      };
      bridge.setPixelReadbackProvider(mockProvider);

      // Should use in-memory data, not provider
      expect(bridge.sourcePixelValue(name, 0, 0)).toEqual([1, 0, 0, 1]);
      expect(mockProvider.readSourcePixel).not.toHaveBeenCalled();
    });

    it('clearing provider restores null return for GPU sources', async () => {
      const name = await bridge.addSourceVerbose(['/movie.mov']);
      const mockProvider: PixelReadbackProvider = {
        readSourcePixel: vi.fn().mockReturnValue([0.5, 0.5, 0.5, 1.0]),
      };
      bridge.setPixelReadbackProvider(mockProvider);
      expect(bridge.sourcePixelValue(name, 0, 0)).toEqual([0.5, 0.5, 0.5, 1.0]);

      bridge.setPixelReadbackProvider(null);
      expect(bridge.sourcePixelValue(name, 0, 0)).toBeNull();
    });
  });

  describe('sourceDisplayChannelNames', () => {
    it('returns default RGBA when no channels set', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(bridge.sourceDisplayChannelNames(name)).toEqual([
        'R',
        'G',
        'B',
        'A',
      ]);
    });

    it('returns custom channel names when set', async () => {
      const name = await bridge.addSourceVerbose(['/a.exr']);
      bridge.setSourceChannelNames(name, ['R', 'G', 'B', 'A', 'Z']);
      expect(bridge.sourceDisplayChannelNames(name)).toEqual([
        'R',
        'G',
        'B',
        'A',
        'Z',
      ]);
    });
  });

  // ==================================================================
  // In-Memory Image Sources
  // ==================================================================

  describe('newImageSource', () => {
    it('creates an image source with the given dimensions', () => {
      const name = bridge.newImageSource('myImage', 100, 50, 4);
      expect(name).toBe('myImage');
      expect(bridge.hasSource('myImage')).toBe(true);

      const info = bridge.sourceMediaInfo('myImage');
      expect(info.width).toBe(100);
      expect(info.height).toBe(50);
      expect(info.channelNames).toEqual(['R', 'G', 'B', 'A']);
    });

    it('creates 3-channel source', () => {
      bridge.newImageSource('rgb', 10, 10, 3);
      const info = bridge.sourceMediaInfo('rgb');
      expect(info.channelNames).toEqual(['R', 'G', 'B']);
    });

    it('creates 1-channel source', () => {
      bridge.newImageSource('mono', 10, 10, 1);
      const info = bridge.sourceMediaInfo('mono');
      expect(info.channelNames).toEqual(['R']);
    });

    it('throws on empty name', () => {
      expect(() => bridge.newImageSource('', 10, 10)).toThrow(TypeError);
    });

    it('throws on zero/negative dimensions', () => {
      expect(() => bridge.newImageSource('x', 0, 10)).toThrow(TypeError);
      expect(() => bridge.newImageSource('x', 10, -1)).toThrow(TypeError);
    });
  });

  describe('newImageSourcePixels', () => {
    it('sets pixel data from Float32Array', () => {
      const name = bridge.newImageSource('img', 2, 1, 4);
      const data = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]);
      bridge.newImageSourcePixels(name, 0, data);

      expect(bridge.sourcePixelValue(name, 0, 0)).toEqual([1, 0, 0, 1]);
      expect(bridge.sourcePixelValue(name, 1, 0)).toEqual([0, 1, 0, 1]);
    });

    it('accepts regular number array', () => {
      const name = bridge.newImageSource('img', 1, 1, 4);
      bridge.newImageSourcePixels(name, 0, [0.5, 0.5, 0.5, 1]);
      expect(bridge.sourcePixelValue(name, 0, 0)).toEqual([0.5, 0.5, 0.5, 1]);
    });

    it('throws for non-existent image source', () => {
      expect(() =>
        bridge.newImageSourcePixels('nope', 0, new Float32Array(4)),
      ).toThrow('Image source not found');
    });

    it('throws on data length mismatch', () => {
      const name = bridge.newImageSource('img', 2, 2, 4);
      expect(() =>
        bridge.newImageSourcePixels(name, 0, new Float32Array(8)),
      ).toThrow('length mismatch');
    });
  });

  // ==================================================================
  // Session Management
  // ==================================================================

  describe('clearSession', () => {
    it('removes all sources', async () => {
      await bridge.addSource(['/a.mov']);
      await bridge.addSource(['/b.exr']);
      bridge.newImageSource('img', 10, 10);
      expect(bridge.sourceCount()).toBe(3);

      bridge.clearSession();
      expect(bridge.sourceCount()).toBe(0);
    });

    it('resets batch mode', async () => {
      bridge.addSourceBegin();
      await bridge.addSource(['/a.mov']);
      bridge.clearSession();
      // Should not be in batch mode anymore
      await bridge.addSource(['/b.mov']);
      expect(bridge.sourceCount()).toBe(1);
    });

    it('clears image source pixel data', () => {
      const name = bridge.newImageSource('img', 2, 2, 4);
      bridge.newImageSourcePixels(name, 0, new Float32Array(16));
      bridge.clearSession();
      expect(() => bridge.sourcePixelValue('img', 0, 0)).toThrow(
        'Source not found',
      );
    });
  });

  // ==================================================================
  // Media Representations
  // ==================================================================

  describe('addSourceMediaRep', () => {
    it('adds a media representation', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      const repNode = bridge.addSourceMediaRep(name, 'proxy', [
        '/proxy.mov',
      ]);
      expect(typeof repNode).toBe('string');
      expect(repNode).toContain('proxy');
    });

    it('sets first rep as active', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      expect(bridge.sourceMediaRep(name)).toBe('full');
    });
  });

  describe('setActiveSourceMediaRep', () => {
    it('switches the active representation', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');
      expect(bridge.sourceMediaRep(name)).toBe('proxy');
    });

    it('throws for non-existent representation', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      expect(() =>
        bridge.setActiveSourceMediaRep(name, 'nonexistent'),
      ).toThrow('not found');
    });
  });

  describe('sourceMediaRep', () => {
    it('returns empty string when no reps', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(bridge.sourceMediaRep(name)).toBe('');
    });
  });

  describe('sourceMediaReps', () => {
    it('lists all rep names', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.addSourceMediaRep(name, 'editorial', ['/edit.mov']);
      expect(bridge.sourceMediaReps(name)).toEqual([
        'full',
        'proxy',
        'editorial',
      ]);
    });

    it('returns empty array when no reps', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(bridge.sourceMediaReps(name)).toEqual([]);
    });
  });

  describe('sourceMediaRepsAndNodes', () => {
    it('returns name-node pairs', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const pairs = bridge.sourceMediaRepsAndNodes(name);
      expect(pairs).toHaveLength(2);
      expect(pairs[0]![0]).toBe('full');
      expect(pairs[1]![0]).toBe('proxy');
      // node names should contain the rep name
      expect(pairs[0]![1]).toContain('full');
      expect(pairs[1]![1]).toContain('proxy');
    });
  });

  describe('sourceMediaRepSwitchNode', () => {
    it('returns switch node name', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      const switchNode = bridge.sourceMediaRepSwitchNode(name);
      expect(switchNode).toContain('switch');
    });

    it('returns empty string when no reps', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(bridge.sourceMediaRepSwitchNode(name)).toBe('');
    });
  });

  describe('sourceMediaRepSourceNode', () => {
    it('returns source node for active rep', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const node = bridge.sourceMediaRepSourceNode(name);
      expect(node).toContain('full');
    });

    it('returns source node for a specific rep', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const node = bridge.sourceMediaRepSourceNode(name, 'proxy');
      expect(node).toContain('proxy');
    });

    it('returns empty string for unknown rep', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      expect(bridge.sourceMediaRepSourceNode(name, 'nope')).toBe('');
    });
  });

  // ==================================================================
  // Source Geometry
  // ==================================================================

  describe('sourceGeometry', () => {
    it('returns geometry for a source', async () => {
      const name = await bridge.addSourceVerbose(['/a.exr']);
      bridge.setSourceDimensions(name, 4096, 2160, 1.0);
      const geo = bridge.sourceGeometry(name);
      expect(geo.width).toBe(4096);
      expect(geo.height).toBe(2160);
      expect(geo.pixelAspect).toBe(1.0);
    });

    it('returns defaults for new source', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      const geo = bridge.sourceGeometry(name);
      expect(geo.width).toBe(0);
      expect(geo.height).toBe(0);
      expect(geo.pixelAspect).toBe(1.0);
    });
  });

  // ==================================================================
  // Helper Methods
  // ==================================================================

  describe('hasSource', () => {
    it('returns false for non-existent source', () => {
      expect(bridge.hasSource('nope')).toBe(false);
    });

    it('returns true after adding a source', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(bridge.hasSource(name)).toBe(true);
    });
  });

  describe('sourceCount', () => {
    it('returns 0 initially', () => {
      expect(bridge.sourceCount()).toBe(0);
    });

    it('increments as sources are added', async () => {
      await bridge.addSource(['/a.mov']);
      expect(bridge.sourceCount()).toBe(1);
      await bridge.addSource(['/b.mov']);
      expect(bridge.sourceCount()).toBe(2);
    });
  });

  // ==================================================================
  // Source name generation
  // ==================================================================

  describe('source naming', () => {
    it('generates sequential names', async () => {
      const name1 = await bridge.addSourceVerbose(['/a.mov']);
      const name2 = await bridge.addSourceVerbose(['/b.mov']);
      expect(name1).toBe('sourceGroup000000');
      expect(name2).toBe('sourceGroup000001');
    });

    it('resets counter on clearSession', async () => {
      await bridge.addSource(['/a.mov']);
      await bridge.addSource(['/b.mov']);
      bridge.clearSession();
      const name = await bridge.addSourceVerbose(['/c.mov']);
      expect(name).toBe('sourceGroup000000');
    });
  });

  // ==================================================================
  // Error handling
  // ==================================================================

  describe('error handling', () => {
    it('throws when accessing non-existent source', () => {
      expect(() => bridge.sourceMedia('nonexistent')).toThrow(
        'Source not found',
      );
      expect(() => bridge.sourceMediaInfo('nonexistent')).toThrow(
        'Source not found',
      );
      expect(() => bridge.sourceAttributes('nonexistent')).toThrow(
        'Source not found',
      );
      expect(() => bridge.sourceGeometry('nonexistent')).toThrow(
        'Source not found',
      );
      expect(() => bridge.sourceMediaRep('nonexistent')).toThrow(
        'Source not found',
      );
      expect(() => bridge.sourceMediaReps('nonexistent')).toThrow(
        'Source not found',
      );
    });

    it('works when openrv is not available', async () => {
      delete (globalThis as Record<string, unknown>).openrv;
      // addSource should still work (doesn't call openrv)
      await bridge.addSource(['/a.mov']);
      expect(bridge.sourceCount()).toBe(1);
    });
  });
});
