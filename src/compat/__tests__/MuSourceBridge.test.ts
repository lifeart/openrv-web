import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MuSourceBridge } from '../MuSourceBridge';
import type { PixelReadbackProvider } from '../MuSourceBridge';
import { Graph } from '../../core/graph/Graph';

// --- Mock openrv API ---

function createMockOpenRV() {
  return {
    media: {
      getCurrentSource: vi.fn().mockReturnValue({
        name: 'test-source',
        url: '/media/test-source.mov',
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
      addSourceFromURL: vi.fn().mockResolvedValue(undefined),
      loadMovieProc: vi.fn(),
      clearSources: vi.fn(),
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

    it('fallback media field is a path, not the source name (Issue #268)', () => {
      const result = bridge.sources();
      expect(result).toHaveLength(1);
      expect(result[0]!.media).toBe('/media/test-source.mov');
      expect(result[0]!.media).not.toBe(result[0]!.name);
    });

    it('fallback media vs local media consistency (Issue #268)', async () => {
      // Get fallback entry
      const fallback = bridge.sources();
      expect(fallback[0]!.media).toBe('/media/test-source.mov');

      // Now create a fresh bridge with a local source
      const bridge2 = new MuSourceBridge();
      await bridge2.addSource(['/path/to/local.mov'], 'movie');
      const local = bridge2.sources();

      // Both should have path-like media values
      expect(fallback[0]!.media).toMatch(/\//);
      expect(local[0]!.media).toMatch(/\//);
    });

    it('fallback media uses empty string when url is empty (Issue #268)', () => {
      mockOpenRV.media.getCurrentSource.mockReturnValue({
        name: 'test-source',
        url: '',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
      });
      const result = bridge.sources();
      expect(result).toHaveLength(1);
      expect(result[0]!.media).toBe('');
      expect(result[0]!.media).not.toBe('test-source');
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

    it('in-range frame returns fallback source (Issue #266)', () => {
      // Mock duration is 100, so frame 50 should be in range [1, 100]
      const result = bridge.sourcesAtFrame(50);
      expect(result).toContain('test-source');
    });

    it('upper-boundary endFrame returns fallback source (Issue #266)', () => {
      // Mock duration is 100, so endFrame = 100; frame 100 is still in range [1, 100]
      const result = bridge.sourcesAtFrame(100);
      expect(result).toContain('test-source');
    });

    it('duration-0 edge case uses default endFrame of 1 (Issue #266)', () => {
      // Override mock to return duration: 0 so endFrame stays at default 1
      mockOpenRV.media.getCurrentSource.mockReturnValue({
        name: 'test-source',
        url: '/media/test-source.mov',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 0,
        fps: 24,
      });

      // Frame 1 is within [1, 1] (default endFrame)
      expect(bridge.sourcesAtFrame(1)).toContain('test-source');
      // Frame 2 is out of range
      expect(bridge.sourcesAtFrame(2)).toEqual([]);
    });

    it('out-of-range frame returns empty array (Issue #266)', () => {
      // Mock duration is 100, so frame 99999 is out of range
      const result = bridge.sourcesAtFrame(99999);
      expect(result).toEqual([]);
    });

    it('local source frame filtering still works (Issue #266)', async () => {
      await bridge.addSource(['/clip.mov'], 'default');
      const sources = bridge.sources();
      const name = sources[0]!.name;
      bridge.setSourceFrameRange(name, 10, 20);

      expect(bridge.sourcesAtFrame(9)).not.toContain(name);
      expect(bridge.sourcesAtFrame(10)).toContain(name);
      expect(bridge.sourcesAtFrame(15)).toContain(name);
      expect(bridge.sourcesAtFrame(20)).toContain(name);
      expect(bridge.sourcesAtFrame(21)).not.toContain(name);
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

    it('batched addSourceVerbose name resolves to a valid source record after commit', async () => {
      bridge.addSourceBegin();
      const name = await bridge.addSourceVerbose(['/a.mov'], 'mytag');
      // Name returned but source not yet committed
      expect(bridge.sourceCount()).toBe(0);
      await bridge.addSourceEnd();
      // After commit, the returned name must resolve
      expect(bridge.sourceCount()).toBe(1);
      const media = bridge.sourceMedia(name);
      expect(media.media).toEqual(['/a.mov']);
      const sources = bridge.sources();
      expect(sources.some((s) => s.name === name)).toBe(true);
    });

    it('multiple batched addSourceVerbose calls all resolve correctly after commit', async () => {
      bridge.addSourceBegin();
      const name1 = await bridge.addSourceVerbose(['/a.mov'], 'tag1');
      const name2 = await bridge.addSourceVerbose(['/b.mov'], 'tag2');
      const name3 = await bridge.addSourceVerbose(['/c.mov'], 'tag3');
      await bridge.addSourceEnd();
      expect(bridge.sourceCount()).toBe(3);
      // Each returned name must map to the correct media
      expect(bridge.sourceMedia(name1).media).toEqual(['/a.mov']);
      expect(bridge.sourceMedia(name2).media).toEqual(['/b.mov']);
      expect(bridge.sourceMedia(name3).media).toEqual(['/c.mov']);
    });

    it('batched names are sequential and non-colliding', async () => {
      bridge.addSourceBegin();
      const name1 = await bridge.addSourceVerbose(['/a.mov']);
      const name2 = await bridge.addSourceVerbose(['/b.mov']);
      await bridge.addSourceEnd();
      expect(name1).not.toBe(name2);
      // Names follow sourceGroupNNNNNN pattern and are sequential
      expect(name1).toMatch(/^sourceGroup\d{6}$/);
      expect(name2).toMatch(/^sourceGroup\d{6}$/);
      const idx1 = parseInt(name1.replace('sourceGroup', ''), 10);
      const idx2 = parseInt(name2.replace('sourceGroup', ''), 10);
      expect(idx2).toBe(idx1 + 1);
    });

    it('non-batch addSourceVerbose still works (backward compat)', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov'], 'direct');
      expect(typeof name).toBe('string');
      expect(bridge.sourceCount()).toBe(1);
      expect(bridge.sourceMedia(name).media).toEqual(['/a.mov']);
    });

    it('newImageSource throws when name is already queued in batch', async () => {
      bridge.addSourceBegin();
      const batchName = await bridge.addSourceVerbose(['/a.mov'], 'tag');
      expect(() => bridge.newImageSource(batchName, 10, 10, 4)).toThrow(TypeError);
      expect(() => bridge.newImageSource(batchName, 10, 10, 4)).toThrow(
        /already exists/,
      );
      // Batch queue entry is preserved and commit still succeeds
      await bridge.addSourceEnd();
      expect(bridge.sourceCount()).toBe(1);
      expect(bridge.sourceMedia(batchName).media).toEqual(['/a.mov']);
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

  describe('sourceMedia / sourceMediaInfo respect active rep (Issue #262)', () => {
    it('sourceMedia reflects active rep media paths', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');
      expect(bridge.sourceMedia(name).media).toEqual(['/proxy.mov']);
    });

    it('sourceMediaInfo reflects active rep file path', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');
      const info = bridge.sourceMediaInfo(name);
      expect(info.file).toBe('/proxy.mov');
    });

    it('returns first-added rep media when auto-activated', async () => {
      const name = await bridge.addSourceVerbose(['/base.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      // activeRep is 'full' (first added), which has its own mediaPaths
      expect(bridge.sourceMedia(name).media).toEqual(['/full.mov']);
    });

    it('returns base media when no rep is active (no reps added)', async () => {
      const name = await bridge.addSourceVerbose(['/base.mov', '/layer.mov']);
      // No addSourceMediaRep calls – fallback path in _getActiveMediaPaths
      expect(bridge.sourceMedia(name).media).toEqual(['/base.mov', '/layer.mov']);
    });

    it('returns base media paths for default (no reps)', async () => {
      const name = await bridge.addSourceVerbose(['/base.mov', '/layer.mov']);
      expect(bridge.sourceMedia(name).media).toEqual(['/base.mov', '/layer.mov']);
      expect(bridge.sourceMediaInfo(name).file).toBe('/base.mov');
    });

    it('sources() reflects active rep media path', async () => {
      const name = await bridge.addSourceVerbose(['/base.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');
      const sources = bridge.sources();
      expect(sources[0]!.media).toBe('/proxy.mov');
    });

    it('switches between representations', async () => {
      const name = await bridge.addSourceVerbose(['/base.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');
      expect(bridge.sourceMedia(name).media).toEqual(['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'full');
      expect(bridge.sourceMedia(name).media).toEqual(['/full.mov']);
      expect(bridge.sourceMediaInfo(name).file).toBe('/full.mov');
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

    it('returns fallback source info when no local sources exist (Issue #267)', () => {
      // No addSource calls — bridge has no local sources
      const list = bridge.sourceMediaInfoList();
      expect(list).toHaveLength(1);
      expect(list[0]!.file).toBe('/media/test-source.mov');
    });

    it('returns same number of entries as sources() in fallback case (Issue #267)', () => {
      const sourcesList = bridge.sources();
      // sources() registers the fallback source via side-effect, so
      // sourceMediaInfoList() sees the already-registered source
      const list = bridge.sourceMediaInfoList();
      expect(list).toHaveLength(sourcesList.length);
    });

    it('sees fallback source after sources() registers it (Issue #267)', () => {
      // First call sources() which triggers fallback registration
      const sourcesList = bridge.sources();
      expect(sourcesList).toHaveLength(1);
      // Now sourceMediaInfoList should include the registered fallback
      const list = bridge.sourceMediaInfoList();
      expect(list).toHaveLength(1);
      expect(list[0]!.file).toBe(sourcesList[0]!.media);
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

    it('throws TypeError when creating a source with a duplicate name', () => {
      bridge.newImageSource('foo', 10, 10, 4);
      expect(() => bridge.newImageSource('foo', 20, 20, 3)).toThrow(TypeError);
      expect(() => bridge.newImageSource('foo', 20, 20, 3)).toThrow(
        /Source 'foo' already exists/,
      );
    });

    it('preserves the original source after duplicate name rejection', () => {
      bridge.newImageSource('foo', 10, 10, 4);
      expect(() => bridge.newImageSource('foo', 99, 99, 3)).toThrow(TypeError);
      const info = bridge.sourceMediaInfo('foo');
      expect(info.width).toBe(10);
      expect(info.height).toBe(10);
      expect(info.channelNames).toEqual(['R', 'G', 'B', 'A']);
    });

    it('allows creating a different name after duplicate rejection', () => {
      bridge.newImageSource('foo', 10, 10, 4);
      expect(() => bridge.newImageSource('foo', 20, 20)).toThrow(TypeError);
      const name = bridge.newImageSource('bar', 20, 20, 3);
      expect(name).toBe('bar');
      expect(bridge.hasSource('bar')).toBe(true);
    });

    it('treats names as case-sensitive', () => {
      bridge.newImageSource('Foo', 10, 10, 4);
      const name = bridge.newImageSource('foo', 20, 20, 3);
      expect(name).toBe('foo');
      expect(bridge.hasSource('Foo')).toBe(true);
      expect(bridge.hasSource('foo')).toBe(true);
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
    it('returns empty string when no graph is attached (Issue #258)', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      const repNode = bridge.addSourceMediaRep(name, 'proxy', [
        '/proxy.mov',
      ]);
      expect(repNode).toBe('');
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
    it('returns name-node pairs with empty node names when no graph (Issue #258)', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const pairs = bridge.sourceMediaRepsAndNodes(name);
      expect(pairs).toHaveLength(2);
      expect(pairs[0]![0]).toBe('full');
      expect(pairs[1]![0]).toBe('proxy');
      // Without a graph, node names must be empty strings (Issue #258)
      expect(pairs[0]![1]).toBe('');
      expect(pairs[1]![1]).toBe('');
    });
  });

  describe('sourceMediaRepSwitchNode', () => {
    it('returns empty string when no graph is attached (Issue #258)', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      const switchNode = bridge.sourceMediaRepSwitchNode(name);
      expect(switchNode).toBe('');
    });

    it('returns empty string when no reps', async () => {
      const name = await bridge.addSourceVerbose(['/a.mov']);
      expect(bridge.sourceMediaRepSwitchNode(name)).toBe('');
    });
  });

  describe('sourceMedia with active representation', () => {
    it('returns base media paths when no active rep is set', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      const result = bridge.sourceMedia(name);
      expect(result.media).toEqual(['/full.mov']);
    });

    it('returns rep media paths after switching active rep', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full-res.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');

      const result = bridge.sourceMedia(name);
      expect(result.media).toEqual(['/proxy.mov']);
    });

    it('returns first rep media paths when first rep is auto-activated', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full-res.mov']);

      const result = bridge.sourceMedia(name);
      expect(result.media).toEqual(['/full-res.mov']);
    });

    it('returns base paths if active rep has empty media paths', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'empty', []);

      const result = bridge.sourceMedia(name);
      expect(result.media).toEqual(['/full.mov']);
    });
  });

  describe('sourceMediaInfo with active representation', () => {
    it('returns base file when no active rep is set', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      const info = bridge.sourceMediaInfo(name);
      expect(info.file).toBe('/full.mov');
    });

    it('returns rep file after switching active rep', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full-res.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');

      const info = bridge.sourceMediaInfo(name);
      expect(info.file).toBe('/proxy.mov');
      expect(info.name).toBe(name);
    });

    it('preserves source metadata when returning rep file', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.setSourceDimensions(name, 3840, 2160, 1.0);
      bridge.setSourceFrameRange(name, 1, 200);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      bridge.setActiveSourceMediaRep(name, 'proxy');

      const info = bridge.sourceMediaInfo(name);
      expect(info.file).toBe('/proxy.mov');
      expect(info.width).toBe(3840);
      expect(info.height).toBe(2160);
      expect(info.startFrame).toBe(1);
      expect(info.endFrame).toBe(200);
    });
  });

  describe('sourceMediaRepSourceNode', () => {
    it('returns empty string for active rep when no graph (Issue #258)', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const node = bridge.sourceMediaRepSourceNode(name);
      expect(node).toBe('');
    });

    it('returns empty string for a specific rep when no graph (Issue #258)', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const node = bridge.sourceMediaRepSourceNode(name, 'proxy');
      expect(node).toBe('');
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

  // ==================================================================
  // Session Integration (real session propagation)
  // ==================================================================

  describe('session integration', () => {
    it('addSource loads http URLs into the real session', async () => {
      await bridge.addSource(['https://example.com/movie.mp4']);
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
        'https://example.com/movie.mp4',
      );
    });

    it('addSource loads .movieproc paths via loadMovieProc', async () => {
      await bridge.addSource(['smpte_bars,width=1920.movieproc']);
      expect(mockOpenRV.media.loadMovieProc).toHaveBeenCalledWith(
        'smpte_bars,width=1920.movieproc',
      );
    });

    it('addSource skips local file paths (no session call)', async () => {
      await bridge.addSource(['/local/path/movie.mov']);
      expect(mockOpenRV.media.addSourceFromURL).not.toHaveBeenCalled();
      expect(mockOpenRV.media.loadMovieProc).not.toHaveBeenCalled();
      // Shadow state still tracks it
      expect(bridge.sourceCount()).toBe(1);
    });

    it('addSourceVerbose loads into session and returns name', async () => {
      const name = await bridge.addSourceVerbose(
        ['https://cdn.example.com/clip.mov'],
        'movie',
      );
      expect(name).toMatch(/^sourceGroup\d{6}$/);
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
        'https://cdn.example.com/clip.mov',
      );
    });

    it('addSources loads multiple URLs into session', async () => {
      await bridge.addSources([
        ['https://example.com/a.mp4'],
        ['https://example.com/b.mp4'],
      ]);
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledTimes(2);
    });

    it('addSourceEnd loads batched URLs into session', async () => {
      bridge.addSourceBegin();
      await bridge.addSource(['https://example.com/a.mp4']);
      await bridge.addSource(['https://example.com/b.mp4']);
      expect(mockOpenRV.media.addSourceFromURL).not.toHaveBeenCalled();

      await bridge.addSourceEnd();
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledTimes(2);
    });

    it('clearSession clears the real session', async () => {
      await bridge.addSource(['/a.mov']);
      bridge.clearSession();
      expect(mockOpenRV.media.clearSources).toHaveBeenCalled();
    });

    it('clearSession works when openrv is unavailable', async () => {
      await bridge.addSource(['/a.mov']);
      delete (globalThis as Record<string, unknown>).openrv;
      // Should not throw
      bridge.clearSession();
      expect(bridge.sourceCount()).toBe(0);
    });

    it('clearSession still clears shadow state when clearSources throws', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await bridge.addSource(['/a.mov']);
      await bridge.addSource(['/b.mov']);
      expect(bridge.sourceCount()).toBe(2);

      mockOpenRV.media.clearSources.mockImplementation(() => {
        throw new Error('session exploded');
      });

      // Should not throw
      expect(() => bridge.clearSession()).not.toThrow();
      // Shadow state (_sources) must still be cleared
      expect(bridge.sourceCount()).toBe(0);
      warnSpy.mockRestore();
    });

    it('setSourceMedia propagates http URL to session', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      mockOpenRV.media.addSourceFromURL.mockClear();
      bridge.setSourceMedia(name, ['https://example.com/new.mp4']);
      // Allow async propagation to flush
      await vi.waitFor(() => {
        expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
          'https://example.com/new.mp4',
        );
      });
    });

    it('relocateSource propagates http URL to session', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      mockOpenRV.media.addSourceFromURL.mockClear();
      bridge.relocateSource(name, 'https://example.com/relocated.mp4');
      await vi.waitFor(() => {
        expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
          'https://example.com/relocated.mp4',
        );
      });
    });

    it('addToSource propagates http URL to session', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      mockOpenRV.media.addSourceFromURL.mockClear();
      bridge.addToSource(name, 'https://example.com/layer2.mp4');
      await vi.waitFor(() => {
        expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
          'https://example.com/layer2.mp4',
        );
      });
    });

    it('addToSource propagates movieproc to session', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      mockOpenRV.media.loadMovieProc.mockClear();
      bridge.addToSource(name, 'color.movieproc');
      await vi.waitFor(() => {
        expect(mockOpenRV.media.loadMovieProc).toHaveBeenCalledWith(
          'color.movieproc',
        );
      });
    });

    it('setActiveSourceMediaRep propagates rep media to session', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', [
        'https://cdn.example.com/proxy.mp4',
      ]);
      mockOpenRV.media.addSourceFromURL.mockClear();
      bridge.setActiveSourceMediaRep(name, 'proxy');
      await vi.waitFor(() => {
        expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
          'https://cdn.example.com/proxy.mp4',
        );
      });
    });

    it('gracefully handles session load errors', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockOpenRV.media.addSourceFromURL.mockRejectedValue(
        new Error('Network error'),
      );
      // Should not throw — error is caught and logged
      await bridge.addSource(['https://example.com/fail.mp4']);
      expect(bridge.sourceCount()).toBe(1); // shadow state still works
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('gracefully handles missing API methods', async () => {
      // Simulate an older openrv build without addSourceFromURL
      delete (mockOpenRV.media as Record<string, unknown>).addSourceFromURL;
      delete (mockOpenRV.media as Record<string, unknown>).loadMovieProc;
      delete (mockOpenRV.media as Record<string, unknown>).clearSources;

      // All mutations should still work via shadow state
      await bridge.addSource(['https://example.com/movie.mp4']);
      expect(bridge.sourceCount()).toBe(1);

      bridge.clearSession();
      expect(bridge.sourceCount()).toBe(0);
    });

    it('addSource routes http:// (non-TLS) URLs to addSourceFromURL', async () => {
      await bridge.addSource(['http://example.com/clip.mp4']);
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
        'http://example.com/clip.mp4',
      );
    });

    it('addSource handles mixed path types in a single call', async () => {
      // addSource accepts an array of paths; each path is routed independently
      await bridge.addSource([
        'https://example.com/movie.mp4',
        'smpte_bars.movieproc',
        '/local/path.mov',
      ]);
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
        'https://example.com/movie.mp4',
      );
      expect(mockOpenRV.media.loadMovieProc).toHaveBeenCalledWith(
        'smpte_bars.movieproc',
      );
      // Local path should not trigger any session call beyond the above two
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledTimes(1);
      expect(mockOpenRV.media.loadMovieProc).toHaveBeenCalledTimes(1);
      // Shadow state tracks all three paths
      expect(bridge.sourceCount()).toBe(1);
      const media = bridge.sourceMedia(bridge.sources()[0]!.name);
      expect(media.media).toEqual([
        'https://example.com/movie.mp4',
        'smpte_bars.movieproc',
        '/local/path.mov',
      ]);
    });

    it('addSourceVerbose in batch mode defers session loading until addSourceEnd', async () => {
      bridge.addSourceBegin();
      const name = await bridge.addSourceVerbose(
        ['https://example.com/batch.mp4'],
        'movie',
      );
      expect(typeof name).toBe('string');
      // No session call yet
      expect(mockOpenRV.media.addSourceFromURL).not.toHaveBeenCalled();

      await bridge.addSourceEnd();
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledWith(
        'https://example.com/batch.mp4',
      );
    });

    it('batch mode defers movieproc loading until addSourceEnd', async () => {
      bridge.addSourceBegin();
      await bridge.addSource(['checkerboard.movieproc']);
      expect(mockOpenRV.media.loadMovieProc).not.toHaveBeenCalled();

      await bridge.addSourceEnd();
      expect(mockOpenRV.media.loadMovieProc).toHaveBeenCalledWith(
        'checkerboard.movieproc',
      );
    });

    it('clearSession clears both real session AND shadow state atomically', async () => {
      await bridge.addSource(['https://example.com/a.mp4']);
      await bridge.addSource(['/local/b.mov']);
      bridge.newImageSource('img', 10, 10);
      expect(bridge.sourceCount()).toBe(3);

      bridge.clearSession();
      // Real session cleared
      expect(mockOpenRV.media.clearSources).toHaveBeenCalled();
      // Shadow state cleared (sourceCount tracks local registry only)
      expect(bridge.sourceCount()).toBe(0);
      // sources() falls back to openrv current source when local registry is empty
      // — the fallback now properly registers the discovered source
      const fallbackSources = bridge.sources();
      expect(fallbackSources).toHaveLength(1);
      expect(bridge.hasSource(fallbackSources[0]?.name ?? '')).toBe(true);
    });

    it('setSourceMedia shadow state updated even when session propagation fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const name = await bridge.addSourceVerbose(['/old.mov']);
      mockOpenRV.media.addSourceFromURL.mockRejectedValue(
        new Error('Network error'),
      );
      bridge.setSourceMedia(name, ['https://example.com/fail.mp4']);
      // Shadow state reflects the new media immediately
      expect(bridge.sourceMedia(name).media).toEqual([
        'https://example.com/fail.mp4',
      ]);
      // Wait for fire-and-forget propagation to flush
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });
      warnSpy.mockRestore();
    });

    it('relocateSource shadow state updated even when session propagation fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const name = await bridge.addSourceVerbose(['/old.mov']);
      mockOpenRV.media.addSourceFromURL.mockRejectedValue(
        new Error('Network error'),
      );
      bridge.relocateSource(name, 'https://example.com/fail.mp4');
      // Shadow state has the new path
      expect(bridge.sourceMedia(name).media[0]).toBe(
        'https://example.com/fail.mp4',
      );
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });
      warnSpy.mockRestore();
    });

    it('addToSource shadow state updated even when session propagation fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const name = await bridge.addSourceVerbose(['/old.mov']);
      mockOpenRV.media.addSourceFromURL.mockRejectedValue(
        new Error('Network error'),
      );
      bridge.addToSource(name, 'https://example.com/fail.mp4');
      // Shadow state reflects the appended media immediately
      expect(bridge.sourceMedia(name).media).toEqual([
        '/old.mov',
        'https://example.com/fail.mp4',
      ]);
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });
      warnSpy.mockRestore();
    });

    it('setActiveSourceMediaRep shadow state updated even when session propagation fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', [
        'https://cdn.example.com/proxy.mp4',
      ]);
      mockOpenRV.media.addSourceFromURL.mockRejectedValue(
        new Error('CDN error'),
      );
      bridge.setActiveSourceMediaRep(name, 'proxy');
      // Shadow state switched immediately
      expect(bridge.sourceMediaRep(name)).toBe('proxy');
      await vi.waitFor(() => {
        expect(warnSpy).toHaveBeenCalled();
      });
      warnSpy.mockRestore();
    });

    it('loadMovieProc errors are caught and shadow state preserved', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockOpenRV.media.loadMovieProc.mockImplementation(() => {
        throw new Error('Proc parse error');
      });
      await bridge.addSource(['bad.movieproc']);
      // Shadow state still tracks the source
      expect(bridge.sourceCount()).toBe(1);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('setSourceMedia works when openrv is unavailable', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      delete (globalThis as Record<string, unknown>).openrv;
      // Should not throw, shadow state updated
      bridge.setSourceMedia(name, ['/new.mov']);
      expect(bridge.sourceMedia(name).media).toEqual(['/new.mov']);
    });

    it('relocateSource works when openrv is unavailable', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      delete (globalThis as Record<string, unknown>).openrv;
      bridge.relocateSource(name, '/relocated.mov');
      expect(bridge.sourceMedia(name).media[0]).toBe('/relocated.mov');
    });

    it('addToSource works when openrv is unavailable', async () => {
      const name = await bridge.addSourceVerbose(['/old.mov']);
      delete (globalThis as Record<string, unknown>).openrv;
      bridge.addToSource(name, '/layer2.mov');
      expect(bridge.sourceMedia(name).media).toEqual(['/old.mov', '/layer2.mov']);
    });

    it('setActiveSourceMediaRep works when openrv is unavailable', async () => {
      const name = await bridge.addSourceVerbose(['/full.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      delete (globalThis as Record<string, unknown>).openrv;
      bridge.setActiveSourceMediaRep(name, 'proxy');
      expect(bridge.sourceMediaRep(name)).toBe('proxy');
    });

    it('shadow state remains consistent after successful session loads', async () => {
      await bridge.addSource(['https://example.com/a.mp4'], 'movie');
      await bridge.addSource(['pattern.movieproc'], 'proc');
      await bridge.addSource(['/local/file.mov'], 'local');

      // All three should be in shadow state
      expect(bridge.sourceCount()).toBe(3);
      const sources = bridge.sources();
      expect(sources[0]!.media).toBe('https://example.com/a.mp4');
      expect(sources[0]!.tag).toBe('movie');
      expect(sources[1]!.media).toBe('pattern.movieproc');
      expect(sources[1]!.tag).toBe('proc');
      expect(sources[2]!.media).toBe('/local/file.mov');
      expect(sources[2]!.tag).toBe('local');

      // Session calls were made for URL and movieproc but not local
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalledTimes(1);
      expect(mockOpenRV.media.loadMovieProc).toHaveBeenCalledTimes(1);
    });

    it('mixed addSource and addSourceVerbose in the same batch commit correctly', async () => {
      bridge.addSourceBegin();
      await bridge.addSource(['/a.mov'], 'plain');
      const verboseName = await bridge.addSourceVerbose(['/b.mov'], 'verbose');
      await bridge.addSource(['/c.mov'], 'plain2');
      await bridge.addSourceEnd();

      expect(bridge.sourceCount()).toBe(3);
      // The verbose-returned name must resolve to the /b.mov source, not another
      expect(bridge.sourceMedia(verboseName).media).toEqual(['/b.mov']);
    });
  });

  describe('source fallback registration (Issue #252)', () => {
    it('sources() fallback name is usable by sourceMedia()', () => {
      const result = bridge.sources();
      expect(result).toHaveLength(1);
      const name = result[0]!.name;
      // Should NOT throw — the fallback source was registered
      expect(() => bridge.sourceMedia(name)).not.toThrow();
      expect(bridge.sourceMedia(name).media).toEqual(['/media/test-source.mov']);
    });

    it('sources() fallback name is found by hasSource()', () => {
      const result = bridge.sources();
      expect(result).toHaveLength(1);
      expect(bridge.hasSource(result[0]!.name)).toBe(true);
    });

    it('sources() fallback is reflected in sourceCount()', () => {
      expect(bridge.sourceCount()).toBe(0);
      bridge.sources(); // triggers fallback
      expect(bridge.sourceCount()).toBe(1);
    });

    it('sourcesAtFrame() fallback name is usable by sourceMedia()', () => {
      const names = bridge.sourcesAtFrame(1);
      expect(names).toHaveLength(1);
      const name = names[0]!;
      expect(() => bridge.sourceMedia(name)).not.toThrow();
      expect(bridge.sourceMedia(name).media).toEqual(['/media/test-source.mov']);
    });

    it('sourcesAtFrame() fallback name is found by hasSource()', () => {
      const names = bridge.sourcesAtFrame(1);
      expect(names).toHaveLength(1);
      expect(bridge.hasSource(names[0]!)).toBe(true);
    });

    it('calling sources() twice does not create duplicate entries', () => {
      bridge.sources();
      bridge.sources();
      expect(bridge.sourceCount()).toBe(1);
      expect(bridge.sources()).toHaveLength(1);
    });

    it('calling sourcesAtFrame() twice does not create duplicate entries', () => {
      bridge.sourcesAtFrame(1);
      bridge.sourcesAtFrame(1);
      expect(bridge.sourceCount()).toBe(1);
    });

    it('sourceMediaInfo after fallback does not throw', () => {
      const result = bridge.sources();
      expect(result).toHaveLength(1);
      const name = result[0]!.name;
      // Should NOT throw — the fallback source was registered
      expect(() => bridge.sourceMediaInfo(name)).not.toThrow();
      const info = bridge.sourceMediaInfo(name);
      expect(info).toBeDefined();
      expect(typeof info).toBe('object');
    });

    it('sourceAttributes after fallback does not throw', () => {
      const result = bridge.sources();
      expect(result).toHaveLength(1);
      const name = result[0]!.name;
      // Should NOT throw — the fallback source was registered
      expect(() => bridge.sourceAttributes(name)).not.toThrow();
      const attrs = bridge.sourceAttributes(name);
      expect(Array.isArray(attrs)).toBe(true);
    });
  });

  // ==================================================================
  // Media-representation graph node registration (Issue #258)
  // ==================================================================

  describe('media-rep graph node registration (Issue #258)', () => {
    it('rep source nodes are registered in the graph', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/full.mov']);
      const repNode = gb.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      // The returned node name should exist in the graph
      const found = graph.getAllNodes().find((n) => n.name === repNode);
      expect(found).toBeDefined();
      expect(found!.type).toBe('RVMediaRepSource');
    });

    it('switch node is queryable in the graph after adding a rep', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/full.mov']);
      gb.addSourceMediaRep(name, 'full', ['/full.mov']);
      const switchName = gb.sourceMediaRepSwitchNode(name);
      const found = graph.getAllNodes().find((n) => n.name === switchName);
      expect(found).toBeDefined();
      expect(found!.type).toBe('RVMediaRepSwitch');
    });

    it('multiple reps share the same switch node', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/full.mov']);
      gb.addSourceMediaRep(name, 'full', ['/full.mov']);
      gb.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      // Only one switch node in the graph
      const switchNodes = graph
        .getAllNodes()
        .filter((n) => n.name === `${name}_switch`);
      expect(switchNodes).toHaveLength(1);
      // The switch node should have 2 inputs (one per rep)
      expect(switchNodes[0]!.inputs).toHaveLength(2);
    });

    it('session propagation is attempted when openrv is available', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      mockOpenRV.media.addSourceFromURL = vi.fn().mockResolvedValue(undefined);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['https://cdn.example.com/full.mp4']);
      gb.addSourceMediaRep(name, 'full', ['https://cdn.example.com/full.mp4']);
      // Allow the async session load to settle
      await new Promise((r) => setTimeout(r, 10));
      expect(mockOpenRV.media.addSourceFromURL).toHaveBeenCalled();
    });

    it('gracefully degrades when no graph is provided (Issue #258)', async () => {
      // Without a graph, node names must be empty strings — not fabricated
      const name = await bridge.addSourceVerbose(['/full.mov']);
      const repNode = bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      expect(repNode).toBe('');
    });

    it('clearSession removes rep nodes from the graph', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/full.mov']);
      gb.addSourceMediaRep(name, 'full', ['/full.mov']);
      gb.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      // Nodes exist before clear
      const switchName = `${name}_switch`;
      expect(graph.getAllNodes().find((n) => n.name === switchName)).toBeDefined();
      expect(graph.getAllNodes().some((n) => n.type === 'RVMediaRepSource')).toBe(true);

      gb.clearSession();

      // All rep nodes removed from graph
      expect(graph.getAllNodes().find((n) => n.name === switchName)).toBeUndefined();
      expect(graph.getAllNodes().some((n) => n.type === 'RVMediaRepSource')).toBe(false);
      expect(graph.getAllNodes().some((n) => n.type === 'RVMediaRepSwitch')).toBe(false);
    });

    it('setActiveSourceMediaRep updates the switch node active input', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/full.mov']);
      gb.addSourceMediaRep(name, 'full', ['/full.mov']);
      gb.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);

      const switchName = `${name}_switch`;
      const switchNode = graph.getAllNodes().find((n) => n.name === switchName);
      expect(switchNode).toBeDefined();
      // Initially the active rep is the first one added ('full', index 0)
      expect((switchNode as unknown as { activeInputIndex: number }).activeInputIndex).toBe(0);

      gb.setActiveSourceMediaRep(name, 'proxy');
      // After switching, activeInputIndex should be 1
      expect((switchNode as unknown as { activeInputIndex: number }).activeInputIndex).toBe(1);
    });

    it('process routes the input selected by activeInputIndex', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/full.mov']);
      gb.addSourceMediaRep(name, 'full', ['/full.mov']);
      gb.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);

      const switchName = `${name}_switch`;
      const switchNode = graph.getAllNodes().find((n) => n.name === switchName)!;
      expect(switchNode).toBeDefined();

      const imgA = { width: 10, height: 10 } as unknown as import('../../core/image/Image').IPImage;
      const imgB = { width: 20, height: 20 } as unknown as import('../../core/image/Image').IPImage;
      const ctx = { frame: 0, fps: 24, stereoEye: 'left' } as unknown as import('../../core/graph/Graph').EvalContext;

      // activeInputIndex defaults to 0 → should return first input
      const result0 = (switchNode as unknown as { process(ctx: unknown, inputs: unknown[]): unknown }).process(ctx, [imgA, imgB]);
      expect(result0).toBe(imgA);

      // Switch to index 1 → should return second input
      gb.setActiveSourceMediaRep(name, 'proxy');
      const result1 = (switchNode as unknown as { process(ctx: unknown, inputs: unknown[]): unknown }).process(ctx, [imgA, imgB]);
      expect(result1).toBe(imgB);
    });

    it('clearSession removes rep nodes from multiple independent sources', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;

      const name1 = await gb.addSourceVerbose(['/alpha.mov']);
      gb.addSourceMediaRep(name1, 'full', ['/alpha.mov']);
      gb.addSourceMediaRep(name1, 'proxy', ['/alpha_proxy.mov']);

      const name2 = await gb.addSourceVerbose(['/beta.mov']);
      gb.addSourceMediaRep(name2, 'full', ['/beta.mov']);
      gb.addSourceMediaRep(name2, 'proxy', ['/beta_proxy.mov']);

      // Both sources have switch and rep nodes in the graph
      expect(graph.getAllNodes().find((n) => n.name === `${name1}_switch`)).toBeDefined();
      expect(graph.getAllNodes().find((n) => n.name === `${name2}_switch`)).toBeDefined();
      expect(graph.getAllNodes().filter((n) => n.type === 'RVMediaRepSource').length).toBeGreaterThanOrEqual(4);

      gb.clearSession();

      // ALL rep nodes from both sources must be gone
      expect(graph.getAllNodes().find((n) => n.name === `${name1}_switch`)).toBeUndefined();
      expect(graph.getAllNodes().find((n) => n.name === `${name2}_switch`)).toBeUndefined();
      expect(graph.getAllNodes().some((n) => n.type === 'RVMediaRepSource')).toBe(false);
      expect(graph.getAllNodes().some((n) => n.type === 'RVMediaRepSwitch')).toBe(false);
    });
  });

  // ==================================================================
  // Regression: no fabricated node names without a graph (Issue #258)
  // ==================================================================

  describe('Issue #258 regression: no fabricated node names without graph', () => {
    it('addSourceMediaRep returns empty string without a graph', async () => {
      const name = await bridge.addSourceVerbose(['/clip.mov']);
      const result = bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      expect(result).toBe('');
    });

    it('sourceMediaRepsAndNodes returns empty node names without a graph', async () => {
      const name = await bridge.addSourceVerbose(['/clip.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const pairs = bridge.sourceMediaRepsAndNodes(name);
      expect(pairs).toEqual([
        ['full', ''],
        ['proxy', ''],
      ]);
    });

    it('sourceMediaRepSwitchNode returns empty string without a graph', async () => {
      const name = await bridge.addSourceVerbose(['/clip.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      expect(bridge.sourceMediaRepSwitchNode(name)).toBe('');
    });

    it('sourceMediaRepSourceNode returns empty string without a graph', async () => {
      const name = await bridge.addSourceVerbose(['/clip.mov']);
      bridge.addSourceMediaRep(name, 'full', ['/full.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      expect(bridge.sourceMediaRepSourceNode(name)).toBe('');
      expect(bridge.sourceMediaRepSourceNode(name, 'proxy')).toBe('');
    });

    it('representation record preserves name and media type correctly', async () => {
      const name = await bridge.addSourceVerbose(['/clip.mov']);
      bridge.addSourceMediaRep(name, 'editorial', ['/edit.mov']);
      bridge.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      // Rep names are preserved
      expect(bridge.sourceMediaReps(name)).toEqual(['editorial', 'proxy']);
      // First rep is auto-activated
      expect(bridge.sourceMediaRep(name)).toBe('editorial');
      // Switching works
      bridge.setActiveSourceMediaRep(name, 'proxy');
      expect(bridge.sourceMediaRep(name)).toBe('proxy');
    });

    it('graph-backed bridge returns real node names', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/clip.mov']);
      const repNode = gb.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      // With a graph, the node name should be non-empty and correspond to a real node
      expect(repNode).not.toBe('');
      expect(repNode).toContain('proxy');
      const found = graph.getAllNodes().find((n) => n.name === repNode);
      expect(found).toBeDefined();
    });

    it('graph-backed sourceMediaRepsAndNodes returns real node names', async () => {
      const graph = new Graph();
      const gb = new MuSourceBridge(graph);
      (globalThis as Record<string, unknown>).openrv = mockOpenRV;
      const name = await gb.addSourceVerbose(['/clip.mov']);
      gb.addSourceMediaRep(name, 'full', ['/full.mov']);
      gb.addSourceMediaRep(name, 'proxy', ['/proxy.mov']);
      const pairs = gb.sourceMediaRepsAndNodes(name);
      // Node names should be non-empty and exist in the graph
      for (const [repName, nodeName] of pairs) {
        expect(repName).toBeTruthy();
        expect(nodeName).not.toBe('');
        expect(graph.getAllNodes().find((n) => n.name === nodeName)).toBeDefined();
      }
    });
  });
});
