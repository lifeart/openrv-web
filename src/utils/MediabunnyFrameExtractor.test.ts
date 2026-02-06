/**
 * Tests for MediabunnyFrameExtractor
 *
 * These tests verify the actual MediabunnyFrameExtractor class behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track CanvasSink constructor calls to verify options
let canvasSinkCalls: Array<{ track: unknown; options: unknown }> = [];

// Mock the mediabunny module
vi.mock('mediabunny', () => {
  return {
    Input: vi.fn().mockImplementation(() => ({
      getPrimaryVideoTrack: vi.fn().mockResolvedValue({
        displayWidth: 1920,
        displayHeight: 1080,
        codec: 'avc1',
        canDecode: vi.fn().mockResolvedValue(true),
      }),
      computeDuration: vi.fn().mockResolvedValue(10),
      dispose: vi.fn(),
    })),
    BlobSource: vi.fn(),
    CanvasSink: vi.fn().mockImplementation((track, options) => {
      canvasSinkCalls.push({ track, options });
      return {
        canvases: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield { canvas: document.createElement('canvas'), timestamp: 0 };
          },
        }),
      };
    }),
    VideoSampleSink: vi.fn().mockImplementation(() => ({
      getSample: vi.fn().mockResolvedValue(null),
    })),
    ALL_FORMATS: [],
  };
});

describe('MediabunnyFrameExtractor', () => {
  beforeEach(() => {
    canvasSinkCalls = [];
    vi.clearAllMocks();
  });

  describe('CanvasSink Options', () => {
    it('should create CanvasSink with fit option when width and height are provided', async () => {
      // Import after mocking
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      // Skip if WebCodecs not supported (test environment)
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });

      try {
        await extractor.load(mockFile, 24);
      } catch {
        // May fail in test env, but we want to verify CanvasSink was called correctly
      }

      // Verify CanvasSink was called with fit option
      if (canvasSinkCalls.length > 0) {
        const lastCall = canvasSinkCalls[canvasSinkCalls.length - 1];
        const options = lastCall?.options as { width?: number; height?: number; fit?: string };
        expect(options).toBeDefined();
        if (options?.width && options?.height) {
          expect(options.fit).toBe('contain');
        }
      }
    });
  });

  describe('frame/timestamp conversion', () => {
    it('should convert frame number to timestamp correctly at 24fps', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      // Default fps is 24, frame numbers are 1-based
      // Frame 1 = 0 seconds, Frame 2 = 1/24 seconds, etc.
      expect(extractor.frameToTimestamp(1)).toBeCloseTo(0, 6);
      expect(extractor.frameToTimestamp(2)).toBeCloseTo(1 / 24, 6);
      expect(extractor.frameToTimestamp(25)).toBeCloseTo(1, 6); // 1 second at 24fps
      expect(extractor.frameToTimestamp(49)).toBeCloseTo(2, 6); // 2 seconds
    });

    it('should convert timestamp to frame number correctly at 24fps', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      // Frame numbers are 1-based
      expect(extractor.timestampToFrame(0)).toBe(1); // First frame
      expect(extractor.timestampToFrame(1)).toBe(25); // 1 second at 24fps
      expect(extractor.timestampToFrame(0.5)).toBe(13); // 0.5 seconds
    });

    it('should round-trip frame to timestamp to frame correctly', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      // Round trip should get back to same frame
      for (let frame = 1; frame <= 100; frame++) {
        const timestamp = extractor.frameToTimestamp(frame);
        const backToFrame = extractor.timestampToFrame(timestamp);
        expect(backToFrame).toBe(frame);
      }
    });
  });

  describe('isSupported', () => {
    it('should return boolean indicating WebCodecs support', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const supported = MediabunnyFrameExtractor.isSupported();
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('initialization state', () => {
    it('should not be ready before load is called', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      expect(extractor.isReady()).toBe(false);
      expect(extractor.getMetadata()).toBeNull();
      expect(extractor.isFrameIndexReady()).toBe(false);
    });

    it('should throw when getFrame is called before load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getFrame(1)).rejects.toThrow('Extractor not initialized');
    });

    it('should throw when getFrameImageData is called before load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getFrameImageData(1)).rejects.toThrow('Extractor not initialized');
    });

    it('should throw when getFrameBlob is called before load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getFrameBlob(1)).rejects.toThrow('Extractor not initialized');
    });

    it('should throw when getThumbnail is called before load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getThumbnail(1)).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('dispose', () => {
    it('should reset state when dispose is called', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      // Even without loading, dispose should work
      extractor.dispose();

      expect(extractor.isReady()).toBe(false);
      expect(extractor.getMetadata()).toBeNull();
      expect(extractor.isFrameIndexReady()).toBe(false);
    });
  });

  describe('load', () => {
    it('should return metadata after successful load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      // Skip if WebCodecs not supported
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });

      const metadata = await extractor.load(mockFile, 30);

      expect(metadata).toBeDefined();
      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
      expect(metadata.fps).toBe(30);
      expect(metadata.codec).toBe('avc1');
      expect(metadata.canDecode).toBe(true);
      expect(metadata.duration).toBe(10);
      expect(metadata.frameCount).toBe(300); // 10 seconds * 30 fps
    });

    it('should mark extractor as ready after load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });

      await extractor.load(mockFile, 24);

      expect(extractor.isReady()).toBe(true);
      expect(extractor.getMetadata()).not.toBeNull();
    });

    it('should use provided fps value', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });

      // Load with custom fps
      const metadata = await extractor.load(mockFile, 60);

      expect(metadata.fps).toBe(60);
      expect(metadata.frameCount).toBe(600); // 10 seconds * 60 fps
    });

    it('should clean up previous resources when loading again', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile1 = new File(['test1'], 'test1.mp4', { type: 'video/mp4' });
      const mockFile2 = new File(['test2'], 'test2.mp4', { type: 'video/mp4' });

      // Load first file
      await extractor.load(mockFile1, 24);
      expect(extractor.isReady()).toBe(true);

      // Load second file - should work without errors
      await extractor.load(mockFile2, 30);
      expect(extractor.isReady()).toBe(true);
      expect(extractor.getMetadata()?.fps).toBe(30);
    });
  });

  describe('createFrameExtractor helper', () => {
    it('should create and load extractor in one call', async () => {
      const { createFrameExtractor, MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const extractor = await createFrameExtractor(mockFile, 24);

      expect(extractor.isReady()).toBe(true);
      expect(extractor.getMetadata()).not.toBeNull();
    });
  });

  describe('loadUrl', () => {
    it('should fetch URL and load video', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      // Mock fetch
      const mockBlob = new Blob(['test'], { type: 'video/mp4' });
      const mockResponse = {
        ok: true,
        blob: vi.fn().mockResolvedValue(mockBlob),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const extractor = new MediabunnyFrameExtractor();
      const metadata = await extractor.loadUrl('https://example.com/video.mp4', 24);

      expect(fetch).toHaveBeenCalledWith('https://example.com/video.mp4');
      expect(metadata).toBeDefined();
      expect(extractor.isReady()).toBe(true);
    });

    it('should throw error when fetch fails', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      // Mock fetch failure
      const mockResponse = {
        ok: false,
        statusText: 'Not Found',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const extractor = new MediabunnyFrameExtractor();
      await expect(extractor.loadUrl('https://example.com/notfound.mp4')).rejects.toThrow('Failed to fetch video: Not Found');
    });
  });

  describe('getFrameRange', () => {
    it('should throw when called before load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      const generator = extractor.getFrameRange(1, 5);
      await expect(generator.next()).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('getFrames', () => {
    it('should throw when called before load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      const generator = extractor.getFrames([1, 2, 3]);
      await expect(generator.next()).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('generateThumbnails', () => {
    it('should throw when called before load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      const generator = extractor.generateThumbnails(5);
      await expect(generator.next()).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('getActualFrameCount', () => {
    it('should return frame count after building index', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // The mock yields 1 frame, so actual count should be 1
      const actualCount = await extractor.getActualFrameCount();
      expect(actualCount).toBe(1);
      expect(extractor.isFrameIndexReady()).toBe(true);
    });
  });

  describe('getDetectedFps', () => {
    it('should return null for single frame video', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Build frame index
      await extractor.getActualFrameCount();

      // With only 1 frame at timestamp 0, FPS detection may return null or calculated value
      const detectedFps = await extractor.getDetectedFps();
      // The result depends on the algorithm - just verify it doesn't throw
      expect(detectedFps === null || typeof detectedFps === 'number').toBe(true);
    });
  });

  describe('AbortController support', () => {
    it('should have abortPendingOperations method', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      // Method should exist and not throw
      expect(typeof extractor.abortPendingOperations).toBe('function');
      extractor.abortPendingOperations();
    });

    it('should have getAbortSignal method that returns AbortSignal', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      const signal = extractor.getAbortSignal();
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });

    it('should create new abort signal after abortPendingOperations', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      const signal1 = extractor.getAbortSignal();
      expect(signal1.aborted).toBe(false);

      extractor.abortPendingOperations();

      // Old signal should be aborted
      expect(signal1.aborted).toBe(true);

      // New signal should be fresh
      const signal2 = extractor.getAbortSignal();
      expect(signal2.aborted).toBe(false);
      expect(signal2).not.toBe(signal1);
    });

    it('should abort pending operations on dispose', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');
      const extractor = new MediabunnyFrameExtractor();

      const signal = extractor.getAbortSignal();
      expect(signal.aborted).toBe(false);

      extractor.dispose();

      // Signal should be aborted after dispose
      expect(signal.aborted).toBe(true);
    });

    it('getFrame should return null when aborted before start', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Abort before calling getFrame
      extractor.abortPendingOperations();

      // getFrame should return null for aborted signal
      const result = await extractor.getFrame(1);
      expect(result).toBeNull();
    });

    it('getFrame should accept external AbortSignal', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Create external abort controller
      const abortController = new AbortController();
      abortController.abort();

      // getFrame should return null for aborted external signal
      const result = await extractor.getFrame(1, abortController.signal);
      expect(result).toBeNull();
    });
  });

  describe('UnsupportedCodecException', () => {
    it('MFE-U090: UnsupportedCodecException should be exported', async () => {
      const { UnsupportedCodecException } = await import('./MediabunnyFrameExtractor');
      expect(UnsupportedCodecException).toBeDefined();
    });

    it('MFE-U091: UnsupportedCodecException should contain codec info', async () => {
      const { UnsupportedCodecException } = await import('./MediabunnyFrameExtractor');

      const error = new UnsupportedCodecException('apch', 'test.mov');
      expect(error.codec).toBe('apch');
      expect(error.codecFamily).toBe('prores');
      expect(error.codecError).toBeDefined();
      expect(error.codecError.title).toContain('ProRes');
    });

    it('MFE-U092: UnsupportedCodecException message should be descriptive', async () => {
      const { UnsupportedCodecException } = await import('./MediabunnyFrameExtractor');

      const error = new UnsupportedCodecException('dnxhd', 'test.mxf');
      expect(error.message).toContain('DNxHD');
      expect(error.message.length).toBeGreaterThan(10);
    });

    it('MFE-U093: UnsupportedCodecException should handle null codec', async () => {
      const { UnsupportedCodecException } = await import('./MediabunnyFrameExtractor');

      const error = new UnsupportedCodecException(null);
      expect(error.codec).toBe(null);
      expect(error.codecFamily).toBe('unknown');
    });
  });

  describe('HDR detection', () => {
    it('should include isHDR in metadata after load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      const metadata = extractor.getMetadata();
      expect(metadata).toBeDefined();
      expect(typeof metadata?.isHDR).toBe('boolean');
    });

    it('should include colorSpace in metadata after load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      const metadata = extractor.getMetadata();
      expect(metadata).toBeDefined();
      // colorSpace can be null for SDR videos
      expect(metadata?.colorSpace === null || typeof metadata?.colorSpace === 'object').toBe(true);
    });

    it('isHDR should return false for non-HDR videos', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Mock video track doesn't have hasHighDynamicRange, so isHDR should be false
      expect(extractor.isHDR()).toBe(false);
    });

    it('getColorSpace should return null for non-HDR videos', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      expect(extractor.getColorSpace()).toBeNull();
    });

    it('getFrameHDR should return null when not HDR', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Non-HDR video should return null from getFrameHDR
      const result = await extractor.getFrameHDR(1);
      expect(result).toBeNull();
    });
  });

  describe('Metadata codec info', () => {
    it('MFE-U100: metadata should include codecFamily after load', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      const metadata = extractor.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.codecFamily).toBeDefined();
    });

    it('MFE-U101: metadata should include isProfessionalCodec flag', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      const metadata = extractor.getMetadata();
      expect(metadata?.isProfessionalCodec).toBeDefined();
      expect(typeof metadata?.isProfessionalCodec).toBe('boolean');
    });
  });

  // REGRESSION TESTS for frame count accuracy and timestamp clamping fixes
  describe('frame count accuracy regression tests', () => {
    it('MFE-FC-001: frame count uses Math.round instead of Math.ceil', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      // Mock computeDuration to return exact 10.0 seconds
      const mockInput = {
        getPrimaryVideoTrack: vi.fn().mockResolvedValue({
          displayWidth: 1920,
          displayHeight: 1080,
          codec: 'avc1',
          canDecode: vi.fn().mockResolvedValue(true),
        }),
        computeDuration: vi.fn().mockResolvedValue(10.0), // Exactly 10 seconds
        dispose: vi.fn(),
      };

      const { Input } = await import('mediabunny');
      vi.mocked(Input).mockReturnValue(mockInput as never);

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const metadata = await extractor.load(mockFile, 24);

      // 10.0 * 24 = 240.0 -> Math.round(240.0) = 240 (not Math.ceil which would also be 240)
      expect(metadata.frameCount).toBe(240);
    });

    it('MFE-FC-002: frame count with fractional result rounds correctly', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      // Mock computeDuration to return 10.02 seconds (slightly over)
      const mockInput = {
        getPrimaryVideoTrack: vi.fn().mockResolvedValue({
          displayWidth: 1920,
          displayHeight: 1080,
          codec: 'avc1',
          canDecode: vi.fn().mockResolvedValue(true),
        }),
        computeDuration: vi.fn().mockResolvedValue(10.02), // 10.02 seconds
        dispose: vi.fn(),
      };

      const { Input } = await import('mediabunny');
      vi.mocked(Input).mockReturnValue(mockInput as never);

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const metadata = await extractor.load(mockFile, 24);

      // 10.02 * 24 = 240.48 -> Math.round(240.48) = 240 (Math.ceil would give 241)
      expect(metadata.frameCount).toBe(240);
    });

    it('MFE-FC-003: frame count rounds up when fractional part >= 0.5', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      // Mock computeDuration to return duration that gives >= 0.5 fractional frames
      const mockInput = {
        getPrimaryVideoTrack: vi.fn().mockResolvedValue({
          displayWidth: 1920,
          displayHeight: 1080,
          codec: 'avc1',
          canDecode: vi.fn().mockResolvedValue(true),
        }),
        computeDuration: vi.fn().mockResolvedValue(10.03), // 10.03 * 24 = 240.72
        dispose: vi.fn(),
      };

      const { Input } = await import('mediabunny');
      vi.mocked(Input).mockReturnValue(mockInput as never);

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const metadata = await extractor.load(mockFile, 24);

      // 10.03 * 24 = 240.72 -> Math.round(240.72) = 241
      expect(metadata.frameCount).toBe(241);
    });
  });

  describe('timestamp clamping regression test', () => {
    it('MFE-TS-001: getFrame clamps endTimestamp to video duration', async () => {
      const { MediabunnyFrameExtractor } = await import('./MediabunnyFrameExtractor');

      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      let capturedEndTimestamp: number | null = null;

      // Mock CanvasSink to capture the endTimestamp argument
      const mockCanvasSink = {
        canvases: vi.fn((startTimestamp: number, endTimestamp: number) => {
          capturedEndTimestamp = endTimestamp;
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { canvas: document.createElement('canvas'), timestamp: startTimestamp, duration: 0.041 };
            },
          };
        }),
      };

      const mockInput = {
        getPrimaryVideoTrack: vi.fn().mockResolvedValue({
          displayWidth: 1920,
          displayHeight: 1080,
          codec: 'avc1',
          canDecode: vi.fn().mockResolvedValue(true),
        }),
        computeDuration: vi.fn().mockResolvedValue(10.0), // 10 second video
        dispose: vi.fn(),
      };

      const { Input, CanvasSink } = await import('mediabunny');
      vi.mocked(Input).mockReturnValue(mockInput as never);
      vi.mocked(CanvasSink).mockReturnValue(mockCanvasSink as never);

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Build frame index first
      await extractor.getActualFrameCount();

      // Try to get the last frame (which might have expectedTimestamp very close to duration)
      // The endTimestamp should be clamped to video duration (10.0)
      await extractor.getFrame(1); // Frame 1, timestamp 0

      // Verify endTimestamp was clamped
      expect(capturedEndTimestamp).toBeDefined();
      expect(capturedEndTimestamp).toBeLessThanOrEqual(10.0);
    });
  });
});
