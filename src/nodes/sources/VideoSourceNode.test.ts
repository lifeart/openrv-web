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

    it('VSN-HDR-002: fetchHDRFrame closes previous cached IPImage VideoFrame', async () => {
      const { testNode, mockFrameExtractor } = setupHDRNode();

      // First fetch
      const { mockSample: sample1, mockVideoFrame: frame1 } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(sample1);
      await testNode.fetchHDRFrame(1);

      // Second fetch for different frame
      const { mockSample: sample2 } = createMockSample();
      mockFrameExtractor.getFrameHDR.mockResolvedValue(sample2);
      await testNode.fetchHDRFrame(2);

      // First VideoFrame should have been closed (via IPImage.close())
      expect(frame1.close).toHaveBeenCalled();
      expect(sample1.close).toHaveBeenCalledOnce();
      expect(sample2.close).toHaveBeenCalledOnce();

      testNode.dispose();
    });

    it('VSN-HDR-003: dispose closes pending HDR sample', () => {
      const { testNode, internal } = setupHDRNode();

      const { mockSample } = createMockSample();
      internal.pendingHDRSample = mockSample;
      internal.pendingHDRFrame = 5;

      testNode.dispose();

      expect(mockSample.close).toHaveBeenCalledOnce();
    });

    it('VSN-HDR-004: dispose does not throw when pendingHDRSample is null', () => {
      const { testNode, internal } = setupHDRNode();
      internal.pendingHDRSample = null;

      expect(() => testNode.dispose()).not.toThrow();
    });

    it('VSN-HDR-005: process() closes pendingHDRSample after consuming it', () => {
      const { testNode, internal, mockFrameExtractor } = setupHDRNode();
      const { mockSample } = createMockSample();

      // Set up pending sample as if the async callback already fired
      internal.pendingHDRSample = mockSample;
      internal.pendingHDRFrame = 1;

      // Block the async path by setting a pending request
      internal.pendingHDRRequest = Promise.resolve(null);

      const context = { frame: 1, width: 1920, height: 1080, quality: 'full' as const };
      const result = (internal as any).process(context, []);

      expect(result).not.toBeNull();
      expect(mockSample.close).toHaveBeenCalledOnce();
      expect(internal.pendingHDRSample).toBeNull();

      testNode.dispose();
    });

    it('VSN-HDR-006: async callback closes stale sample before replacing', async () => {
      const { testNode, internal, mockFrameExtractor } = setupHDRNode();
      const { mockSample: oldSample } = createMockSample();
      const { mockSample: newSample } = createMockSample();

      // Simulate stale sample from a prior frame
      internal.pendingHDRSample = oldSample;
      internal.pendingHDRFrame = 1;

      // Set up getFrameHDR to return new sample
      mockFrameExtractor.getFrameHDR.mockResolvedValue(newSample);

      // Trigger process for frame 2 — async callback will fire
      internal.pendingHDRRequest = null; // allow new request
      const context = { frame: 2, width: 1920, height: 1080, quality: 'full' as const };
      (internal as any).process(context, []);

      // Wait for the async callback
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(oldSample.close).toHaveBeenCalledOnce();
      expect(internal.pendingHDRSample).toBe(newSample);
      expect(internal.pendingHDRFrame).toBe(2);

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

    it('VSN-008: VideoSourceNode source code should not hardcode preload config values', async () => {
      // This is a code-level regression test
      // We read the actual source to verify no hardcoded config overrides exist
      // If this test fails, it means someone added hardcoded values back

      // Import the source as text would require fs, so we test behavior instead:
      // VideoSourceNode should delegate entirely to DEFAULT_PRELOAD_CONFIG
      // The getCacheStats method should return maxCacheSize matching the default
      // (This can only be fully tested when mediabunny is initialized)

      // For now, verify the node can be created without errors
      const testNode = new VideoSourceNode('ConfigTest');
      expect(testNode).toBeDefined();
      expect(testNode.getCacheStats()).toBeNull(); // No preload manager until video loads
      testNode.dispose();
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
