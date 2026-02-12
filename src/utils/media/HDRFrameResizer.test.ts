/**
 * Tests for HDRFrameResizer
 *
 * Since VideoFrame and HDR OffscreenCanvas are not available in the test
 * environment (jsdom/happy-dom), these tests mock the browser APIs to verify
 * the resize logic, tier selection, metadata overrides, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HDRFrameResizer, type HDRResizeTier } from './HDRFrameResizer';

// --- Mock VideoFrame ---

function createMockVideoFrame(opts: {
  displayWidth: number;
  displayHeight: number;
  timestamp?: number;
}): VideoFrame {
  const frame = {
    displayWidth: opts.displayWidth,
    displayHeight: opts.displayHeight,
    timestamp: opts.timestamp ?? 0,
    close: vi.fn(),
  };
  return frame as unknown as VideoFrame;
}

// --- Mock OffscreenCanvas ---

function setupOffscreenCanvasMock(contextReturnsNull = false) {
  const mockCtx = {
    drawImage: vi.fn(),
  };

  const MockOffscreenCanvas = vi.fn().mockImplementation((w: number, h: number) => {
    const canvas = {
      width: w,
      height: h,
      getContext: vi.fn().mockReturnValue(contextReturnsNull ? null : mockCtx),
    };
    return canvas;
  });

  vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas);

  // Mock VideoFrame constructor for the resized frame
  const originalVideoFrame = globalThis.VideoFrame;
  const MockVideoFrame = vi.fn().mockImplementation((_source: unknown, opts: { timestamp: number }) => {
    return createMockVideoFrame({
      displayWidth: 960,
      displayHeight: 540,
      timestamp: opts.timestamp,
    });
  });
  vi.stubGlobal('VideoFrame', MockVideoFrame);

  return { mockCtx, MockOffscreenCanvas, MockVideoFrame, originalVideoFrame };
}

describe('HDRFrameResizer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('constructor and getTier', () => {
    it('should store the tier', () => {
      const resizer = new HDRFrameResizer('rec2100');
      expect(resizer.getTier()).toBe('rec2100');
    });

    it('should accept all tier values', () => {
      const tiers: HDRResizeTier[] = ['rec2100', 'display-p3-float16', 'none'];
      for (const tier of tiers) {
        expect(new HDRFrameResizer(tier).getTier()).toBe(tier);
      }
    });
  });

  describe('resize - skip conditions', () => {
    it('should return original frame when tier is none', () => {
      const resizer = new HDRFrameResizer('none');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });

      const result = resizer.resize(frame, { w: 1920, h: 1080 });

      expect(result.resized).toBe(false);
      expect(result.videoFrame).toBe(frame);
      expect(result.width).toBe(3840);
      expect(result.height).toBe(2160);
      expect(frame.close).not.toHaveBeenCalled();
    });

    it('should return original frame when target >= source', () => {
      const { MockOffscreenCanvas } = setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 1920, displayHeight: 1080 });

      const result = resizer.resize(frame, { w: 1920, h: 1080 });

      expect(result.resized).toBe(false);
      expect(result.videoFrame).toBe(frame);
      expect(frame.close).not.toHaveBeenCalled();
      // Should not even create a canvas
      expect(MockOffscreenCanvas).not.toHaveBeenCalled();
    });

    it('should return original frame when target is larger than source', () => {
      const { MockOffscreenCanvas } = setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 1920, displayHeight: 1080 });

      const result = resizer.resize(frame, { w: 3840, h: 2160 });

      expect(result.resized).toBe(false);
      expect(MockOffscreenCanvas).not.toHaveBeenCalled();
    });
  });

  describe('resize - tier 1 (rec2100)', () => {
    it('should resize with rec2100-hlg color space for HLG content', () => {
      const { mockCtx, MockVideoFrame } = setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160, timestamp: 42000 });

      const result = resizer.resize(
        frame,
        { w: 1920, h: 1080 },
        { transfer: 'arib-std-b67', primaries: 'bt2020' },
      );

      expect(result.resized).toBe(true);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.metadataOverrides).toBeUndefined(); // tier 1 = no overrides
      expect(mockCtx.drawImage).toHaveBeenCalledWith(frame, 0, 0, 1920, 1080);
      expect(MockVideoFrame).toHaveBeenCalledWith(expect.anything(), { timestamp: 42000 });
      expect(frame.close).toHaveBeenCalled(); // original closed
    });

    it('should use rec2100-pq for PQ content', () => {
      setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });

      resizer.resize(
        frame,
        { w: 1920, h: 1080 },
        { transfer: 'smpte2084', primaries: 'bt2020' },
      );

      // Verify getContext was called with rec2100-pq
      const canvas = (OffscreenCanvas as unknown as ReturnType<typeof vi.fn>).mock.results[0]!.value;
      expect(canvas.getContext).toHaveBeenCalledWith('2d', expect.objectContaining({
        colorSpace: 'rec2100-pq',
        colorType: 'float16',
      }));
    });

    it('should default to rec2100-hlg when transfer is unknown', () => {
      setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });

      resizer.resize(frame, { w: 1920, h: 1080 });

      const canvas = (OffscreenCanvas as unknown as ReturnType<typeof vi.fn>).mock.results[0]!.value;
      expect(canvas.getContext).toHaveBeenCalledWith('2d', expect.objectContaining({
        colorSpace: 'rec2100-hlg',
      }));
    });
  });

  describe('resize - tier 2 (display-p3-float16)', () => {
    it('should resize with display-p3 and return metadata overrides', () => {
      const { mockCtx } = setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('display-p3-float16');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });

      const result = resizer.resize(
        frame,
        { w: 1920, h: 1080 },
        { transfer: 'arib-std-b67', primaries: 'bt2020' },
      );

      expect(result.resized).toBe(true);
      expect(result.metadataOverrides).toEqual({
        transferFunction: 'srgb',
        colorPrimaries: 'bt709',
      });

      const canvas = (OffscreenCanvas as unknown as ReturnType<typeof vi.fn>).mock.results[0]!.value;
      expect(canvas.getContext).toHaveBeenCalledWith('2d', expect.objectContaining({
        colorSpace: 'display-p3',
        colorType: 'float16',
      }));
      expect(mockCtx.drawImage).toHaveBeenCalledWith(frame, 0, 0, 1920, 1080);
    });
  });

  describe('resize - error handling', () => {
    it('should return original frame when context creation fails', () => {
      setupOffscreenCanvasMock(true /* contextReturnsNull */);
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });

      const result = resizer.resize(frame, { w: 1920, h: 1080 });

      expect(result.resized).toBe(false);
      expect(result.videoFrame).toBe(frame);
      expect(frame.close).not.toHaveBeenCalled();
    });

    it('should return original frame when drawImage throws', () => {
      const { mockCtx } = setupOffscreenCanvasMock();
      mockCtx.drawImage.mockImplementation(() => { throw new Error('draw failed'); });
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });

      const result = resizer.resize(frame, { w: 1920, h: 1080 });

      expect(result.resized).toBe(false);
      expect(result.videoFrame).toBe(frame);
      expect(frame.close).not.toHaveBeenCalled();
    });

    it('should return original frame when VideoFrame constructor throws', () => {
      setupOffscreenCanvasMock();
      vi.stubGlobal('VideoFrame', vi.fn().mockImplementation(() => {
        throw new Error('VideoFrame construction failed');
      }));
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });

      const result = resizer.resize(frame, { w: 1920, h: 1080 });

      expect(result.resized).toBe(false);
      expect(result.videoFrame).toBe(frame);
      expect(frame.close).not.toHaveBeenCalled();
    });
  });

  describe('canvas reuse', () => {
    it('should reuse canvas when dimensions and color space match', () => {
      const { MockOffscreenCanvas } = setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');

      const frame1 = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });
      resizer.resize(frame1, { w: 1920, h: 1080 }, { transfer: 'arib-std-b67' });

      const frame2 = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });
      resizer.resize(frame2, { w: 1920, h: 1080 }, { transfer: 'arib-std-b67' });

      // Only one OffscreenCanvas should be created
      expect(MockOffscreenCanvas).toHaveBeenCalledTimes(1);
    });

    it('should re-create context when dimensions change', () => {
      setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');

      const frame1 = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });
      resizer.resize(frame1, { w: 1920, h: 1080 });

      const frame2 = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });
      resizer.resize(frame2, { w: 960, h: 540 });

      // Canvas getContext should be called twice (different dimensions)
      const canvas = (OffscreenCanvas as unknown as ReturnType<typeof vi.fn>).mock.results[0]!.value;
      expect(canvas.getContext).toHaveBeenCalledTimes(2);
    });
  });

  describe('dispose', () => {
    it('should release canvas resources', () => {
      setupOffscreenCanvasMock();
      const resizer = new HDRFrameResizer('rec2100');
      const frame = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });
      resizer.resize(frame, { w: 1920, h: 1080 });

      resizer.dispose();

      // After dispose, resize should create a new canvas
      const frame2 = createMockVideoFrame({ displayWidth: 3840, displayHeight: 2160 });
      const result = resizer.resize(frame2, { w: 1920, h: 1080 });
      expect(result.resized).toBe(true);
    });

    it('should be safe to call dispose multiple times', () => {
      const resizer = new HDRFrameResizer('rec2100');
      expect(() => {
        resizer.dispose();
        resizer.dispose();
      }).not.toThrow();
    });
  });
});
