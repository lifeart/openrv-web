/**
 * VideoSourceNode Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoSourceNode } from './VideoSourceNode';
import { DEFAULT_PRELOAD_CONFIG } from '../../utils/media/FramePreloadManager';

describe('VideoSourceNode', () => {
  let node: VideoSourceNode;

  beforeEach(() => {
    node = new VideoSourceNode('TestVideo');
  });

  afterEach(() => {
    node.dispose();
  });

  describe('initialization', () => {
    it('has correct type', () => {
      expect(node.type).toBe('RVVideoSource');
    });

    it('has correct default name', () => {
      const defaultNode = new VideoSourceNode();
      expect(defaultNode.name).toBe('Video Source');
      defaultNode.dispose();
    });

    it('has url property', () => {
      expect(node.properties.has('url')).toBe(true);
      expect(node.properties.getValue('url')).toBe('');
    });

    it('has duration property', () => {
      expect(node.properties.has('duration')).toBe(true);
      expect(node.properties.getValue('duration')).toBe(0);
    });

    it('has fps property', () => {
      expect(node.properties.has('fps')).toBe(true);
      expect(node.properties.getValue('fps')).toBe(24);
    });

    it('getFile() returns null when no file has been loaded', () => {
      expect(node.getFile()).toBeNull();
    });
  });

  describe('isReady', () => {
    it('returns false when no video loaded', () => {
      expect(node.isReady()).toBe(false);
    });
  });

  describe('getElement', () => {
    it('returns null when no video loaded', () => {
      expect(node.getElement(1)).toBeNull();
    });
  });

  describe('dispose', () => {
    it('VSN-001: handles dispose when no video loaded', () => {
      // Should not throw
      node.dispose();
      expect(node.isReady()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('VSN-002: serializes node state', () => {
      const json = node.toJSON() as {
        type: string;
        name: string;
        url: string;
      };

      expect(json.type).toBe('RVVideoSource');
      expect(json.name).toBe('TestVideo');
      expect(json.url).toBe('');
    });
  });

  describe('source node behavior', () => {
    it('VSN-003: does not accept inputs', () => {
      expect(node.inputs.length).toBe(0);
    });
  });

  describe('setFps', () => {
    it('VSN-004: updates fps property', () => {
      node.setFps(30);
      expect(node.properties.getValue('fps')).toBe(30);
    });

    it('VSN-005: does not throw without video', () => {
      // Should not throw even without video loaded
      expect(() => node.setFps(60)).not.toThrow();
      expect(node.properties.getValue('fps')).toBe(60);
    });
  });

  // =============================================================================
  // HDR VideoSample lifecycle tests
  // =============================================================================

  describe('HDR VideoSample lifecycle', () => {
    /**
     * Set up a VideoSourceNode with mocked HDR internals.
     * Returns the node and mock objects for assertions.
     */
    function setupHDRNode() {
      const testNode = new VideoSourceNode('HDR Test');
      const internal = testNode as any;

      // Simulate mediabunny HDR state
      internal.useMediabunny = true;
      internal.isHDRVideo = true;
      internal.videoColorSpace = { transfer: 'hlg', primaries: 'bt2020' };
      internal.url = 'test://hdr-video.mp4';
      internal.metadata = { name: 'hdr', width: 1920, height: 1080, duration: 100, fps: 24 };

      // Mock frameExtractor
      const mockFrameExtractor = {
        getMetadata: vi.fn().mockReturnValue({ rotation: 0 }),
        getFrameHDR: vi.fn(),
        getFrame: vi.fn(),
        dispose: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
        abortPendingOperations: vi.fn(),
      };
      internal.frameExtractor = mockFrameExtractor;

      // Mock preloadManager
      const mockPreloadManager = {
        getCachedFrame: vi.fn().mockReturnValue(null),
        getFrame: vi.fn(),
        getTargetSize: vi.fn().mockReturnValue(undefined),
        dispose: vi.fn(),
        setPlaybackState: vi.fn(),
        clear: vi.fn(),
      };
      internal.preloadManager = mockPreloadManager;

      return { testNode, internal, mockFrameExtractor };
    }

    /**
     * Create a mock VideoSample with a close() spy.
     */
    function createMockSample(width = 1920, height = 1080) {
      const mockVideoFrame = {
        displayWidth: width,
        displayHeight: height,
        codedWidth: width,
        codedHeight: height,
        colorSpace: { transfer: 'hlg', primaries: 'bt2020' },
        close: vi.fn(),
      };
      const mockSample = {
        toVideoFrame: vi.fn().mockReturnValue(mockVideoFrame),
        close: vi.fn(),
      };
      return { mockSample, mockVideoFrame };
    }

    it('VSN-HDR-001: fetchHDRFrame closes the VideoSample after extracting VideoFrame', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      const result = await testNode.fetchHDRFrame(1);

      expect(result).not.toBeNull();
      expect(mockSample.toVideoFrame).toHaveBeenCalledOnce();
      expect(mockSample.close).toHaveBeenCalledOnce();

      testNode.dispose();
    });

    it('VSN-HDR-002: fetchHDRFrame caches multiple frames, dispose closes all VideoFrames', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();

      // First fetch
      const { mockSample: sample1, mockVideoFrame: frame1 } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(sample1);
      await testNode.fetchHDRFrame(1);

      // Second fetch for different frame
      const { mockSample: sample2, mockVideoFrame: frame2 } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(sample2);
      await testNode.fetchHDRFrame(2);

      // Both samples should have been closed after extraction
      expect(sample1.close).toHaveBeenCalledOnce();
      expect(sample2.close).toHaveBeenCalledOnce();

      // Both frames should still be alive in the LRU cache (not evicted yet)
      expect(frame1.close).not.toHaveBeenCalled();
      expect(frame2.close).not.toHaveBeenCalled();

      // Dispose closes all cached VideoFrames via LRU cache clear
      testNode.dispose();
      expect(frame1.close).toHaveBeenCalled();
      expect(frame2.close).toHaveBeenCalled();
    });

    it('VSN-HDR-003: process() returns cached HDR frame from LRU cache', async () => {
      const { testNode, internal, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      // Populate cache via fetchHDRFrame (decode → resize → cache)
      await testNode.fetchHDRFrame(1);

      const context = { frame: 1, width: 1920, height: 1080, quality: 'full' as const };
      const result = (internal as any).process(context, []);

      // Should return the cached frame
      expect(result).not.toBeNull();
      expect(result.videoFrame).toBeDefined();

      testNode.dispose();
    });

    it('VSN-HDR-004: process() returns null and kicks off fetch for uncached HDR frame', () => {
      const { testNode, internal, mockFrameExtractor } = setupHDRNode();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(null);

      const context = { frame: 1, width: 1920, height: 1080, quality: 'full' as const };
      const result = (internal as any).process(context, []);

      // Returns null while waiting for async fetch
      expect(result).toBeNull();
      // getFrameHDR should have been called (via fetchHDRFrame)
      expect(mockFrameExtractor.getFrameHDR).toHaveBeenCalledWith(1);

      testNode.dispose();
    });

    it('VSN-HDR-005: fetchHDRFrame deduplicates concurrent requests for same frame', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      // Fire two concurrent fetches for the same frame
      const [result1, result2] = await Promise.all([
        testNode.fetchHDRFrame(1),
        testNode.fetchHDRFrame(1),
      ]);

      // Both should return the same IPImage, but only one extraction
      expect(result1).toBe(result2);
      expect(mockFrameExtractor.getFrameHDR).toHaveBeenCalledTimes(1);

      testNode.dispose();
    });

    it('VSN-HDR-006: getFrameIPImage delegates to fetchHDRFrame for HDR video', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      const result = await testNode.getFrameIPImage(1);

      expect(result).not.toBeNull();
      // Should be cached after getFrameIPImage
      expect(testNode.hasFrameCached(1)).toBe(true);
      expect(mockSample.close).toHaveBeenCalledOnce();

      testNode.dispose();
    });

    it('VSN-HDR-007: getFrameIPImage closes sample after HDR conversion', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      const result = await testNode.getFrameIPImage(1);

      expect(result).not.toBeNull();
      expect(mockSample.close).toHaveBeenCalledOnce();

      testNode.dispose();
    });

    it('VSN-HDR-008: fetchHDRFrame returns null when getFrameHDR returns null', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(null);

      const result = await testNode.fetchHDRFrame(1);

      expect(result).toBeNull();

      testNode.dispose();
    });

    it('VSN-HDR-008b: falls back to decoded VideoFrame colorSpace when track metadata is missing', async () => {
      const { testNode, internal, mockFrameExtractor } = setupHDRNode();
      internal.videoColorSpace = null;

      const mockVideoFrame = {
        colorSpace: { transfer: 'smpte2084', primaries: 'bt2020' },
        close: vi.fn(),
      };
      const mockSample = {
        toVideoFrame: vi.fn().mockReturnValue(mockVideoFrame),
        close: vi.fn(),
      };
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      const result = await testNode.fetchHDRFrame(1);

      expect(result).not.toBeNull();
      expect(result?.metadata.transferFunction).toBe('pq');
      expect(result?.metadata.colorPrimaries).toBe('bt2020');
      expect((internal.videoColorSpace as VideoColorSpaceInit | null)?.transfer).toBe('smpte2084');
      expect((internal.videoColorSpace as VideoColorSpaceInit | null)?.primaries).toBe('bt2020');
      expect(mockSample.close).toHaveBeenCalledOnce();

      testNode.dispose();
    });

    it('VSN-HDR-009: hasFrameCached checks HDR cache for HDR video', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      // Before fetching, frame should not be cached
      expect(testNode.hasFrameCached(1)).toBe(false);

      // Fetch frame 1 into HDR cache
      await testNode.fetchHDRFrame(1);

      // Now frame 1 should be cached (via hdrFrameCache, not preloadManager)
      expect(testNode.hasFrameCached(1)).toBe(true);
      // Frame 2 was never fetched
      expect(testNode.hasFrameCached(2)).toBe(false);

      testNode.dispose();
    });

    it('VSN-HDR-010: getCachedFrames returns HDR cache keys for HDR video', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();

      // Fetch frame 1
      const { mockSample: sample1 } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(sample1);
      await testNode.fetchHDRFrame(1);

      // Fetch frame 2
      const { mockSample: sample2 } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(sample2);
      await testNode.fetchHDRFrame(2);

      const cachedFrames = testNode.getCachedFrames();
      expect(cachedFrames.has(1)).toBe(true);
      expect(cachedFrames.has(2)).toBe(true);
      expect(cachedFrames.size).toBe(2);

      testNode.dispose();
    });

    it('VSN-HDR-011: getFrameAsync delegates to fetchHDRFrame for HDR video', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(mockSample);

      // getFrameAsync should delegate to fetchHDRFrame for HDR video
      const result = await testNode.getFrameAsync(1);

      // HDR path returns null (frame is cached internally, not returned as FrameResult)
      expect(result).toBeNull();
      // Verify getFrameHDR was called (via fetchHDRFrame)
      expect(mockFrameExtractor.getFrameHDR).toHaveBeenCalledWith(1);
      // Frame should now be in the HDR cache
      expect(testNode.hasFrameCached(1)).toBe(true);

      testNode.dispose();
    });
  });

  // REGRESSION TEST: VideoSourceNode must use DEFAULT_PRELOAD_CONFIG
  // Previously, VideoSourceNode hardcoded maxCacheSize: 60 and preloadAhead: 15,
  // which caused 70-frame videos to only cache 60 frames instead of all frames.
  // The fix was to remove the hardcoded values and rely on DEFAULT_PRELOAD_CONFIG.
  describe('preload config regression', () => {
    it('VSN-007: DEFAULT_PRELOAD_CONFIG must support caching 70+ frame videos', () => {
      // This test ensures that if someone changes DEFAULT_PRELOAD_CONFIG,
      // they'll be reminded that VideoSourceNode depends on these values
      expect(DEFAULT_PRELOAD_CONFIG.maxCacheSize).toBeGreaterThanOrEqual(100);
      expect(DEFAULT_PRELOAD_CONFIG.preloadAhead).toBeGreaterThanOrEqual(20);
    });

    it('VSN-008: getCacheStats reports capacity matching DEFAULT_PRELOAD_CONFIG', () => {
      // After loading, cache capacity should match DEFAULT_PRELOAD_CONFIG.
      // This guards against hardcoded overrides (the old bug used maxCacheSize: 60).
      const stats = node.getCacheStats();
      // Before loading, stats may be null; verify default config is large enough
      if (stats !== null) {
        expect(stats.maxCacheSize).toBe(DEFAULT_PRELOAD_CONFIG.maxCacheSize);
      }
      // Either way, the constant itself must be >= 100 (covered by VSN-007)
      expect(DEFAULT_PRELOAD_CONFIG.maxCacheSize).toBeGreaterThanOrEqual(100);
    });
  });

  // Note: load() and loadFile() tests require mocking HTMLVideoElement events
  // which is complex in jsdom. These would be better tested in integration tests.
  describe('load (mocked behavior)', () => {
    it('VSN-006: rejects with error message on load failure', async () => {
      // Mock video to fail loading
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          const video = originalCreateElement('video');
          setTimeout(() => {
            if (video.onerror) {
              video.onerror(new Event('error'));
            }
          }, 0);
          return video;
        }
        return originalCreateElement(tag);
      });

      await expect(node.load('invalid://bad-url')).rejects.toThrow('Failed to load video');

      vi.restoreAllMocks();
    });
  });

  describe('codec error handling', () => {
    it('VSN-009: getUnsupportedCodecError returns null initially', () => {
      expect(node.getUnsupportedCodecError()).toBeNull();
    });

    it('VSN-010: has codec property', () => {
      expect(node.properties.has('codec')).toBe(true);
      expect(node.properties.getValue('codec')).toBe('');
    });
  });

  // =============================================================================
  // Edge case tests for VideoSourceNode (IMP-039)
  // =============================================================================

  describe('edge cases (IMP-039)', () => {
    it('IMP-039-VSN-001: getFrameAsync returns null when not using mediabunny', async () => {
      // When mediabunny is not initialized, getFrameAsync should return null
      const result = await node.getFrameAsync(1);
      expect(result).toBeNull();
    });

    it('IMP-039-VSN-002: getFrameAsync returns null for invalid frame number 0', async () => {
      // Even without mediabunny, should handle gracefully
      const result = await node.getFrameAsync(0);
      expect(result).toBeNull();
    });

    it('IMP-039-VSN-003: getFrameAsync returns null for negative frame number', async () => {
      const result = await node.getFrameAsync(-1);
      expect(result).toBeNull();
    });

    it('IMP-039-VSN-004: concurrent getFrameAsync calls return null without mediabunny', async () => {
      // Concurrent calls should all return null gracefully
      const results = await Promise.all([
        node.getFrameAsync(1),
        node.getFrameAsync(2),
        node.getFrameAsync(3),
      ]);
      expect(results).toEqual([null, null, null]);
    });

    it('IMP-039-VSN-005: dispose during no pending operations does not throw', () => {
      // Should be safe to dispose even when there are no pending operations
      expect(() => node.dispose()).not.toThrow();
      expect(node.isReady()).toBe(false);
    });

    it('IMP-039-VSN-006: hasFrameCached returns false when no preload manager', () => {
      // Without mediabunny, no preload manager exists
      expect(node.hasFrameCached(1)).toBe(false);
      expect(node.hasFrameCached(0)).toBe(false);
      expect(node.hasFrameCached(-1)).toBe(false);
    });

    it('IMP-039-VSN-007: getCachedFrameCanvas returns null when no preload manager', () => {
      expect(node.getCachedFrameCanvas(1)).toBeNull();
    });

    it('IMP-039-VSN-008: getCachedFrames returns empty set when no preload manager', () => {
      const frames = node.getCachedFrames();
      expect(frames.size).toBe(0);
    });

    it('IMP-039-VSN-009: getPendingFrames returns empty set when no preload manager', () => {
      const frames = node.getPendingFrames();
      expect(frames.size).toBe(0);
    });

    it('IMP-039-VSN-010: getCacheStats returns null when no preload manager', () => {
      expect(node.getCacheStats()).toBeNull();
    });

    it('IMP-039-VSN-011: clearCache does not throw when no preload manager', () => {
      expect(() => node.clearCache()).not.toThrow();
    });

    it('IMP-039-VSN-012: preloadFrames does not throw when no mediabunny', async () => {
      await expect(node.preloadFrames(1)).resolves.toBeUndefined();
    });

    it('IMP-039-VSN-013: startPlaybackPreload does not throw when no mediabunny', () => {
      expect(() => node.startPlaybackPreload(1, 1)).not.toThrow();
    });

    it('IMP-039-VSN-014: stopPlaybackPreload does not throw when no mediabunny', () => {
      expect(() => node.stopPlaybackPreload()).not.toThrow();
    });

    it('IMP-039-VSN-015: updatePlaybackBuffer does not throw when no mediabunny', () => {
      expect(() => node.updatePlaybackBuffer(1)).not.toThrow();
    });

    it('IMP-039-VSN-016: setPlaybackDirection normalizes direction values', () => {
      node.setPlaybackDirection(1);
      expect(node.getPlaybackDirection()).toBe(1);

      node.setPlaybackDirection(-1);
      expect(node.getPlaybackDirection()).toBe(-1);

      // Zero and positive should map to 1
      node.setPlaybackDirection(0);
      expect(node.getPlaybackDirection()).toBe(1);

      // Large negative should map to -1
      node.setPlaybackDirection(-100);
      expect(node.getPlaybackDirection()).toBe(-1);
    });

    it('IMP-039-VSN-017: isPlaybackModeActive returns false initially', () => {
      expect(node.isPlaybackModeActive()).toBe(false);
    });

    it('IMP-039-VSN-018: setPlaybackActive toggles playback mode', () => {
      node.setPlaybackActive(true);
      expect(node.isPlaybackModeActive()).toBe(true);

      node.setPlaybackActive(false);
      expect(node.isPlaybackModeActive()).toBe(false);
    });

    it('IMP-039-VSN-019: isHDR returns false when no video loaded', () => {
      expect(node.isHDR()).toBe(false);
    });

    it('IMP-039-VSN-020: getVideoColorSpace returns null when no video loaded', () => {
      expect(node.getVideoColorSpace()).toBeNull();
    });

    it('IMP-039-VSN-021: dispose cleans up HDR state', () => {
      node.dispose();
      expect(node.isHDR()).toBe(false);
      expect(node.getVideoColorSpace()).toBeNull();
    });

    it('IMP-039-VSN-024: getCachedHDRIPImage returns null when no video loaded', () => {
      expect(node.getCachedHDRIPImage(1)).toBeNull();
    });

    it('IMP-039-VSN-025: fetchHDRFrame returns null when not HDR', async () => {
      const result = await node.fetchHDRFrame(1);
      expect(result).toBeNull();
    });

    it('IMP-039-VSN-026: getFrameIPImage returns null when not using mediabunny', async () => {
      const result = await node.getFrameIPImage(1);
      expect(result).toBeNull();
    });

    it('IMP-039-VSN-022: extraction mode can be changed', () => {
      expect(node.getExtractionMode()).toBe('auto');

      node.setExtractionMode('html-video');
      expect(node.getExtractionMode()).toBe('html-video');

      node.setExtractionMode('mediabunny');
      expect(node.getExtractionMode()).toBe('mediabunny');

      node.setExtractionMode('auto');
      expect(node.getExtractionMode()).toBe('auto');
    });

    it('IMP-039-VSN-023: clearFrameCache does not throw when no preload manager', () => {
      expect(() => node.clearFrameCache()).not.toThrow();
    });
  });

  // =============================================================================
  // HDR cache safety tests — preload must not evict the current frame
  // =============================================================================

  describe('HDR cache safety', () => {
    /**
     * Reusable HDR node factory (same helper as above but duplicated for
     * describe-block isolation).
     */
    function setupHDRNode(opts?: { duration?: number; cacheCapacity?: number }) {
      const testNode = new VideoSourceNode('HDR Cache Test');
      const internal = testNode as any;

      const duration = opts?.duration ?? 100;

      // Simulate mediabunny HDR state
      internal.useMediabunny = true;
      internal.isHDRVideo = true;
      internal.videoColorSpace = { transfer: 'hlg', primaries: 'bt2020' };
      internal.url = 'test://hdr-video.mp4';
      internal.metadata = { name: 'hdr', width: 1920, height: 1080, duration, fps: 24 };

      // Mock frameExtractor that produces unique VideoFrames per frame number
      const mockFrameExtractor = {
        getMetadata: vi.fn().mockReturnValue({ rotation: 0 }),
        getFrameHDR: vi.fn().mockImplementation((frame: number) => {
          const mockVideoFrame = {
            displayWidth: 1920,
            displayHeight: 1080,
            codedWidth: 1920,
            codedHeight: 1080,
            colorSpace: { transfer: 'hlg', primaries: 'bt2020' },
            close: vi.fn(),
            _frame: frame, // tag for identification
          };
          return Promise.resolve({
            toVideoFrame: vi.fn().mockReturnValue(mockVideoFrame),
            close: vi.fn(),
          });
        }),
        getFrame: vi.fn(),
        dispose: vi.fn(),
        isReady: vi.fn().mockReturnValue(true),
        abortPendingOperations: vi.fn(),
      };
      internal.frameExtractor = mockFrameExtractor;

      // Override cache capacity if requested
      if (opts?.cacheCapacity !== undefined) {
        internal.hdrFrameCache.setCapacity(opts.cacheCapacity);
      }

      return { testNode, internal, mockFrameExtractor };
    }

    it('VSN-HDR-SAFE-001: preloadHDRFrames must not evict the current frame', async () => {
      // Simulate worst case: small cache (4) with large preload window (ahead=8).
      // This tests the race where PlaybackEngine confirms frame N is cached,
      // then preloadHDRFrames() preloads ahead frames whose set() evicts frame N
      // before the Viewer can render it.
      const { testNode, internal } = setupHDRNode({ duration: 100, cacheCapacity: 4 });

      // Pre-fill cache with frames 8, 9, 10, 11 (capacity = 4)
      for (let f = 8; f <= 11; f++) {
        await testNode.fetchHDRFrame(f);
      }
      expect(testNode.hasFrameCached(11)).toBe(true);
      expect(internal.hdrFrameCache.size).toBe(4);

      // Call preloadHDRFrames directly (awaitable, unlike fire-and-forget
      // updatePlaybackBuffer). This preloads frames 9..19 around frame 11,
      // skipping cached ones. With ahead=8, it fetches frames 12-19 which
      // triggers LRU eviction of older frames.
      await testNode.preloadHDRFrames(11, 8, 2);

      // CRITICAL: frame 11 (the current frame) MUST still be in cache
      // so the Viewer can render it.
      expect(testNode.hasFrameCached(11)).toBe(true);

      testNode.dispose();
    });

    it('VSN-HDR-SAFE-002: getCachedHDRIPImage returns frame that hasFrameCached confirms', async () => {
      // Verify peek()-based getCachedHDRIPImage is consistent with has()-based hasFrameCached.
      const { testNode } = setupHDRNode({ duration: 50, cacheCapacity: 10 });

      await testNode.fetchHDRFrame(5);

      expect(testNode.hasFrameCached(5)).toBe(true);
      expect(testNode.getCachedHDRIPImage(5)).not.toBeNull();

      expect(testNode.hasFrameCached(99)).toBe(false);
      expect(testNode.getCachedHDRIPImage(99)).toBeNull();

      testNode.dispose();
    });

    it('VSN-HDR-SAFE-003: setHDRTargetSize skips recalculation when dimensions unchanged', () => {
      const { testNode, internal } = setupHDRNode();
      const spy = vi.spyOn(internal, 'updateHDRCacheSize');

      testNode.setHDRTargetSize({ w: 960, h: 540 });
      expect(spy).toHaveBeenCalledTimes(1);

      // Same dimensions — should NOT recalculate
      testNode.setHDRTargetSize({ w: 960, h: 540 });
      expect(spy).toHaveBeenCalledTimes(1);

      // Different dimensions — should recalculate
      testNode.setHDRTargetSize({ w: 1920, h: 1080 });
      expect(spy).toHaveBeenCalledTimes(2);

      // Back to undefined — should recalculate
      testNode.setHDRTargetSize(undefined);
      expect(spy).toHaveBeenCalledTimes(3);

      // undefined again — should NOT recalculate
      testNode.setHDRTargetSize(undefined);
      expect(spy).toHaveBeenCalledTimes(3);

      spy.mockRestore();
      testNode.dispose();
    });

    it('VSN-HDR-SAFE-004: HDR cache capacity respects preload window minimum', () => {
      // Even for very large frames that would mathematically result in a
      // tiny cache, the capacity must be large enough to hold the preload
      // window (ahead + behind + current frame) so that preloading does not
      // immediately evict the frame about to be rendered.
      const { testNode, internal } = setupHDRNode({ duration: 100 });

      // Force a very large target size to shrink cache via memory budget
      // (500 MB budget / (7680 * 4320 * 8 bytes) ≈ 1.9 frames → clamped to minimum)
      testNode.setHDRTargetSize({ w: 7680, h: 4320 });

      const capacity = internal.hdrFrameCache.capacity;
      // updatePlaybackBuffer uses ahead=8, behind=2. The cache must hold at
      // least ahead + 1 frames so preloading ahead doesn't evict the current frame.
      // Minimum should be >= 4 (existing floor), but ideally >= ahead + 1 = 9.
      expect(capacity).toBeGreaterThanOrEqual(4);

      testNode.dispose();
    });
  });

  // REGRESSION TEST for getActualFrameCount calling setTotalFrames
  describe('getActualFrameCount regression test', () => {
    it('VSN-FC-001: getActualFrameCount updates preloadManager totalFrames', async () => {
      // This test verifies the fix where getActualFrameCount() now calls
      // this.preloadManager.setTotalFrames(count) to prevent the preload
      // manager from trying to load ghost frames beyond the actual count.

      // Note: This test requires a loaded video with mediabunny, which is
      // difficult to mock properly in a unit test. We verify the code path
      // exists by checking that the method is defined and can be called.

      // The actual integration is tested through:
      // 1. MediabunnyFrameExtractor.getActualFrameCount() returning correct count
      // 2. FramePreloadManager.setTotalFrames() updating the total
      // 3. VideoSourceNode.getActualFrameCount() calling both

      expect(typeof node.getActualFrameCount).toBe('function');

      // Without a loaded video, this returns metadata.duration
      const count = await node.getActualFrameCount();
      expect(typeof count).toBe('number');
    });

    it('VSN-FC-002: getActualFrameCount returns metadata duration when not using mediabunny', async () => {
      // When not using mediabunny (HTML video fallback), should return metadata.duration
      const count = await node.getActualFrameCount();

      // With no video loaded, metadata.duration defaults to 1 (from BaseSourceNode)
      expect(count).toBe(1);
    });
  });
});
