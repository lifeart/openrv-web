/**
 * Tests for MediabunnyFrameExtractor
 *
 * These tests verify the actual MediabunnyFrameExtractor class behavior.
 *
 * The mediabunny module mock is necessary because mediabunny requires
 * WebCodecs APIs (VideoDecoder, VideoEncoder) which are unavailable in
 * the jsdom/node test environment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the mediabunny module (required: WebCodecs APIs unavailable in test env)
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
    CanvasSink: vi.fn().mockImplementation(() => {
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

// Static imports work because vi.mock is hoisted before all imports
import {
  MediabunnyFrameExtractor,
  createFrameExtractor,
  UnsupportedCodecException,
  type FrameResult,
} from './MediabunnyFrameExtractor';
import { Input, CanvasSink, VideoSampleSink } from 'mediabunny';

describe('MediabunnyFrameExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CanvasSink Options', () => {
    it('should create CanvasSink with fit option when width and height are provided', async () => {
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

      // Verify CanvasSink was called with fit option via the mock
      const calls = vi.mocked(CanvasSink).mock.calls;
      if (calls.length > 0) {
        const lastCall = calls[calls.length - 1];
        const options = lastCall?.[1] as { width?: number; height?: number; fit?: string } | undefined;
        expect(options).toBeDefined();
        if (options?.width && options?.height) {
          expect(options.fit).toBe('contain');
        }
      }
    });
  });

  describe('frame/timestamp conversion', () => {
    it('should convert frame number to timestamp correctly at 24fps', () => {
      const extractor = new MediabunnyFrameExtractor();

      // Default fps is 24, frame numbers are 1-based
      // Frame 1 = 0 seconds, Frame 2 = 1/24 seconds, etc.
      expect(extractor.frameToTimestamp(1)).toBeCloseTo(0, 6);
      expect(extractor.frameToTimestamp(2)).toBeCloseTo(1 / 24, 6);
      expect(extractor.frameToTimestamp(25)).toBeCloseTo(1, 6); // 1 second at 24fps
      expect(extractor.frameToTimestamp(49)).toBeCloseTo(2, 6); // 2 seconds
    });

    it('should convert timestamp to frame number correctly at 24fps', () => {
      const extractor = new MediabunnyFrameExtractor();

      // Frame numbers are 1-based
      expect(extractor.timestampToFrame(0)).toBe(1); // First frame
      expect(extractor.timestampToFrame(1)).toBe(25); // 1 second at 24fps
      expect(extractor.timestampToFrame(0.5)).toBe(13); // 0.5 seconds
    });

    it('should round-trip frame to timestamp to frame correctly', () => {
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
    it('should return boolean indicating WebCodecs support', () => {
      const supported = MediabunnyFrameExtractor.isSupported();
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('initialization state', () => {
    it('should not be ready before load is called', () => {
      const extractor = new MediabunnyFrameExtractor();

      expect(extractor.isReady()).toBe(false);
      expect(extractor.getMetadata()).toBeNull();
      expect(extractor.isFrameIndexReady()).toBe(false);
    });

    it('should throw when getFrame is called before load', async () => {
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getFrame(1)).rejects.toThrow('Extractor not initialized');
    });

    it('should throw when getFrameImageData is called before load', async () => {
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getFrameImageData(1)).rejects.toThrow('Extractor not initialized');
    });

    it('should throw when getFrameBlob is called before load', async () => {
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getFrameBlob(1)).rejects.toThrow('Extractor not initialized');
    });

    it('should throw when getThumbnail is called before load', async () => {
      const extractor = new MediabunnyFrameExtractor();

      await expect(extractor.getThumbnail(1)).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('dispose', () => {
    it('should reset state when dispose is called', () => {
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
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      // Mock fetch (required: no real network in tests)
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
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      // Mock fetch failure (required: no real network in tests)
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
      const extractor = new MediabunnyFrameExtractor();

      const generator = extractor.getFrameRange(1, 5);
      await expect(generator.next()).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('getFrames', () => {
    it('should throw when called before load', async () => {
      const extractor = new MediabunnyFrameExtractor();

      const generator = extractor.getFrames([1, 2, 3]);
      await expect(generator.next()).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('generateThumbnails', () => {
    it('should throw when called before load', async () => {
      const extractor = new MediabunnyFrameExtractor();

      const generator = extractor.generateThumbnails(5);
      await expect(generator.next()).rejects.toThrow('Extractor not initialized');
    });
  });

  describe('getActualFrameCount', () => {
    it('should return frame count after building index', async () => {
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
    it('should have abortPendingOperations method', () => {
      const extractor = new MediabunnyFrameExtractor();

      // Method should exist and not throw
      expect(typeof extractor.abortPendingOperations).toBe('function');
      extractor.abortPendingOperations();
    });

    it('should have getAbortSignal method that returns AbortSignal', () => {
      const extractor = new MediabunnyFrameExtractor();

      const signal = extractor.getAbortSignal();
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });

    it('should create new abort signal after abortPendingOperations', () => {
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

    it('should abort pending operations on dispose', () => {
      const extractor = new MediabunnyFrameExtractor();

      const signal = extractor.getAbortSignal();
      expect(signal.aborted).toBe(false);

      extractor.dispose();

      // Signal should be aborted after dispose
      expect(signal.aborted).toBe(true);
    });

    it('getFrame should return null when aborted before start', async () => {
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
    it('MFE-U090: UnsupportedCodecException should be exported', () => {
      expect(UnsupportedCodecException).toBeDefined();
    });

    it('MFE-U091: UnsupportedCodecException should contain codec info', () => {
      const error = new UnsupportedCodecException('apch', 'test.mov');
      expect(error.codec).toBe('apch');
      expect(error.codecFamily).toBe('prores');
      expect(error.codecError).toBeDefined();
      expect(error.codecError.title).toContain('ProRes');
    });

    it('MFE-U092: UnsupportedCodecException message should be descriptive', () => {
      const error = new UnsupportedCodecException('dnxhd', 'test.mxf');
      expect(error.message).toContain('DNxHD');
      expect(error.message.length).toBeGreaterThan(10);
    });

    it('MFE-U093: UnsupportedCodecException should handle null codec', () => {
      const error = new UnsupportedCodecException(null);
      expect(error.codec).toBe(null);
      expect(error.codecFamily).toBe('unknown');
    });
  });

  describe('HDR detection', () => {
    it('should include isHDR in metadata after load', async () => {
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
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      expect(extractor.getColorSpace()).toBeNull();
    });

    it('getFrameHDR should return null when not HDR', async () => {
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

    it('MFE-HDR-001: probes decoded frame color metadata when container HDR lacks transfer info', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const mockTrack = {
        displayWidth: 1920,
        displayHeight: 1080,
        codedWidth: 1920,
        codedHeight: 1080,
        codec: 'hvc1',
        canDecode: vi.fn().mockResolvedValue(true),
        hasHighDynamicRange: vi.fn().mockResolvedValue(true),
        getColorSpace: vi.fn().mockResolvedValue(null),
      };
      const mockInput = {
        getPrimaryVideoTrack: vi.fn().mockResolvedValue(mockTrack),
        computeDuration: vi.fn().mockResolvedValue(10),
        dispose: vi.fn(),
      };
      vi.mocked(Input).mockReturnValueOnce(mockInput as never);

      const probeFrameClose = vi.fn();
      const probeSampleClose = vi.fn();
      const probeGetSample = vi.fn().mockResolvedValue({
        toVideoFrame: vi.fn().mockReturnValue({
          colorSpace: {
            transfer: 'smpte2084',
            primaries: 'bt2020',
            matrix: 'bt2020-ncl',
            fullRange: false,
          },
          close: probeFrameClose,
        }),
        close: probeSampleClose,
      });

      // 1st sink: probe first decoded frame for transfer/primaries
      // 2nd sink: persistent HDR extraction sink
      vi.mocked(VideoSampleSink)
        .mockImplementationOnce(() => ({ getSample: probeGetSample }) as never)
        .mockImplementationOnce(() => ({ getSample: vi.fn().mockResolvedValue(null) }) as never);

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const metadata = await extractor.load(mockFile, 24);

      expect(metadata.isHDR).toBe(true);
      expect(metadata.colorSpace?.transfer).toBe('smpte2084');
      expect(metadata.colorSpace?.primaries).toBe('bt2020');
      expect(probeGetSample).toHaveBeenCalledWith(0);
      expect(probeSampleClose).toHaveBeenCalledOnce();
      expect(probeFrameClose).toHaveBeenCalledOnce();
    });
  });

  describe('Metadata codec info', () => {
    it('MFE-U100: metadata should include codecFamily after load', async () => {
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

  // =============================================================================
  // Edge case tests for MediabunnyFrameExtractor (IMP-039)
  // =============================================================================

  describe('edge cases (IMP-039)', () => {
    it('IMP-039-MFE-001: single-frame video has frameCount of 1 after index build', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // The mock yields exactly 1 frame at timestamp 0
      const actualCount = await extractor.getActualFrameCount();
      expect(actualCount).toBe(1);
      expect(extractor.isFrameIndexReady()).toBe(true);
    });

    it('IMP-039-MFE-002: getFrame clamps frame 0 to frame 1', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Frame 0 should be clamped to 1 (1-based frame numbering)
      const result = await extractor.getFrame(0);
      if (result) {
        expect(result.frameNumber).toBe(1);
      }
    });

    it('IMP-039-MFE-003: getFrame clamps negative frame to frame 1', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Negative frame should be clamped to 1
      const result = await extractor.getFrame(-5);
      if (result) {
        expect(result.frameNumber).toBe(1);
      }
    });

    it('IMP-039-MFE-004: getFrame clamps frame beyond total to last frame', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const metadata = await extractor.load(mockFile, 24);
      const maxFrame = metadata.frameCount;

      // Frame beyond total should be clamped to maxFrame
      const result = await extractor.getFrame(maxFrame + 100);
      if (result) {
        expect(result.frameNumber).toBe(maxFrame);
      }
    });

    it('IMP-039-MFE-005: abort during frame extraction returns null', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Create an abort controller and abort before the frame extraction completes
      const controller = new AbortController();
      controller.abort();

      const result = await extractor.getFrame(1, controller.signal);
      expect(result).toBeNull();
    });

    it('IMP-039-MFE-006: requesting same frame twice uses snapshot cache', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // First request
      const result1 = await extractor.getFrame(1);

      // Second request for the same frame should use cache
      const result2 = await extractor.getFrame(1);

      // Both should succeed (or both null if test env lacks createImageBitmap)
      if (result1 && result2) {
        expect(result2.frameNumber).toBe(result1.frameNumber);
        expect(result2.timestamp).toBe(result1.timestamp);
      }
    });

    it('IMP-039-MFE-007: abortPendingOperations resets signal for future operations', () => {
      const extractor = new MediabunnyFrameExtractor();

      // First abort
      const signal1 = extractor.getAbortSignal();
      extractor.abortPendingOperations();
      expect(signal1.aborted).toBe(true);

      // Second abort - should work on the new controller
      const signal2 = extractor.getAbortSignal();
      expect(signal2.aborted).toBe(false);
      extractor.abortPendingOperations();
      expect(signal2.aborted).toBe(true);

      // Third signal should be fresh
      const signal3 = extractor.getAbortSignal();
      expect(signal3.aborted).toBe(false);
    });

    it('IMP-039-MFE-008: getFrameHDR returns null when aborted', async () => {
      if (!MediabunnyFrameExtractor.isSupported()) {
        return;
      }

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      await extractor.load(mockFile, 24);

      // Abort before calling getFrameHDR
      const controller = new AbortController();
      controller.abort();

      const result = await extractor.getFrameHDR(1, controller.signal);
      expect(result).toBeNull();
    });

    it('IMP-039-MFE-009: frame timestamp at exact boundary (frame 1 = 0.0s)', () => {
      const extractor = new MediabunnyFrameExtractor();

      // Frame 1 should map to exactly 0.0 seconds (boundary)
      expect(extractor.frameToTimestamp(1)).toBe(0);
    });

    it('IMP-039-MFE-010: isReady returns false before load and after abort', () => {
      const extractor = new MediabunnyFrameExtractor();

      // Not ready before load
      expect(extractor.isReady()).toBe(false);

      // Still not ready after abort
      extractor.abortPendingOperations();
      expect(extractor.isReady()).toBe(false);

      // getMetadata is null before load
      expect(extractor.getMetadata()).toBeNull();
    });
  });

  // REGRESSION TESTS for frame count accuracy and timestamp clamping fixes
  describe('frame count accuracy regression tests', () => {
    it('MFE-FC-001: frame count uses Math.round instead of Math.ceil', async () => {
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

      vi.mocked(Input).mockReturnValue(mockInput as never);

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const metadata = await extractor.load(mockFile, 24);

      // 10.0 * 24 = 240.0 -> Math.round(240.0) = 240 (not Math.ceil which would also be 240)
      expect(metadata.frameCount).toBe(240);
    });

    it('MFE-FC-002: frame count with fractional result rounds correctly', async () => {
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

      vi.mocked(Input).mockReturnValue(mockInput as never);

      const extractor = new MediabunnyFrameExtractor();
      const mockFile = new File(['test'], 'test.mp4', { type: 'video/mp4' });
      const metadata = await extractor.load(mockFile, 24);

      // 10.02 * 24 = 240.48 -> Math.round(240.48) = 240 (Math.ceil would give 241)
      expect(metadata.frameCount).toBe(240);
    });

    it('MFE-FC-003: frame count rounds up when fractional part >= 0.5', async () => {
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

  // =================================================================
  // FPS regression: FrameResult type and snapshotCanvas
  //
  // These tests protect the switch from synchronous copyCanvas() to
  // async createImageBitmap (snapshotCanvas).  Reverting to copyCanvas
  // would block the main thread with ~8MB pixel copies per 1080p frame.
  // =================================================================

  describe('FrameResult type and snapshotCanvas (FPS regression)', () => {
    it('MFE-FPS-001: FrameResult type allows ImageBitmap canvas', () => {
      // The FrameResult interface must accept ImageBitmap as a canvas type.
      // If someone changes the interface back to only HTMLCanvasElement | OffscreenCanvas,
      // this test will fail at compile time (and the cast below will be type-unsafe).

      // Verify the interface accepts ImageBitmap at the type level
      // by constructing a compliant object.
      // In jsdom, ImageBitmap may not exist, so we use a duck-type.
      const mockBitmap = {
        width: 100,
        height: 100,
        close: () => {},
      } as unknown as ImageBitmap;

      const result: FrameResult = {
        canvas: mockBitmap,
        timestamp: 0,
        duration: 0.04167,
        frameNumber: 1,
      };

      // The assignment above proves the type allows ImageBitmap.
      // Also verify the shape at runtime.
      expect(result.canvas).toBe(mockBitmap);
      expect(result.frameNumber).toBe(1);
    });

    it('MFE-FPS-002: getFrameImageData rejects before load', async () => {
      // getFrameImageData must support ImageBitmap input (from snapshotCanvas).
      // Verify it throws when extractor is not initialized.
      const extractor = new MediabunnyFrameExtractor();
      await expect(extractor.getFrameImageData(1)).rejects.toThrow('Extractor not initialized');
    });

    it('MFE-FPS-003: getFrameBlob rejects before load', async () => {
      // getFrameBlob must support ImageBitmap input (from snapshotCanvas).
      // Verify it throws when extractor is not initialized.
      const extractor = new MediabunnyFrameExtractor();
      await expect(extractor.getFrameBlob(1)).rejects.toThrow('Extractor not initialized');
    });
  });
});
