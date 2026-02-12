/**
 * Canvas2DHDRBlit Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Canvas2DHDRBlit } from './Canvas2DHDRBlit';

// Mock ImageData constructor for float32 storageFormat
class MockImageData {
  width: number;
  height: number;
  data: Float32Array;
  colorSpace: string;

  constructor(width: number, height: number, settings?: { colorSpace?: string; storageFormat?: string }) {
    this.width = width;
    this.height = height;
    this.colorSpace = settings?.colorSpace ?? 'srgb';
    if (settings?.storageFormat === 'float32') {
      this.data = new Float32Array(width * height * 4);
    } else {
      this.data = new Float32Array(new Uint8ClampedArray(width * height * 4).buffer);
    }
  }
}

describe('Canvas2DHDRBlit', () => {
  let originalImageData: typeof globalThis.ImageData;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalImageData = globalThis.ImageData;
    originalCreateElement = document.createElement;
    // @ts-expect-error - mock ImageData
    globalThis.ImageData = MockImageData;
  });

  afterEach(() => {
    globalThis.ImageData = originalImageData;
    document.createElement = originalCreateElement;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a canvas with correct test id', () => {
      const blit = new Canvas2DHDRBlit();
      expect(blit.getCanvas()).toBeInstanceOf(HTMLCanvasElement);
      expect(blit.getCanvas().dataset.testid).toBe('viewer-canvas2d-blit-canvas');
    });

    it('should not be initialized on construction', () => {
      const blit = new Canvas2DHDRBlit();
      expect(blit.initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize with srgb-linear + colorType when available', () => {
      const mockCtx = {
        putImageData: vi.fn(),
      };

      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      const originalGetContext = canvas.getContext.bind(canvas);
      canvas.getContext = vi.fn((type: string, settings?: any) => {
        if (type === '2d' && settings?.colorSpace === 'srgb-linear' && settings?.colorType === 'float16') {
          return mockCtx;
        }
        return originalGetContext(type, settings);
      }) as any;

      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('srgb-linear');
    });

    it('should fall back to rec2100-hlg when srgb-linear is not available', () => {
      const mockCtx = {
        putImageData: vi.fn(),
      };

      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn((type: string, settings?: any) => {
        if (type === '2d' && settings?.colorSpace === 'rec2100-hlg') {
          return mockCtx;
        }
        return null;
      }) as any;

      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('rec2100-hlg');
    });

    it('should throw when no HDR context is available', () => {
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => null) as any;

      expect(() => blit.initialize()).toThrow('Canvas2D HDR not available');
    });

    it('should be idempotent', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();
      blit.initialize(); // should not throw

      expect(blit.initialized).toBe(true);
    });
  });

  describe('uploadAndDisplay', () => {
    it('should not throw when not initialized', () => {
      const blit = new Canvas2DHDRBlit();
      const pixels = new Float32Array(4);
      expect(() => blit.uploadAndDisplay(pixels, 1, 1)).not.toThrow();
    });

    it('should call putImageData with correct dimensions', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();

      const pixels = new Float32Array(2 * 2 * 4).fill(0.5);
      blit.uploadAndDisplay(pixels, 2, 2);

      expect(mockCtx.putImageData).toHaveBeenCalledTimes(1);
      const imageData = mockCtx.putImageData.mock.calls[0][0];
      expect(imageData.width).toBe(2);
      expect(imageData.height).toBe(2);
    });

    it('should flip rows (bottom-to-top → top-to-bottom)', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();

      // 2x2 image: bottom row = [1,0,0,1], top row = [0,1,0,1]
      const pixels = new Float32Array([
        // WebGL row 0 (bottom): red
        1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0,
        // WebGL row 1 (top): green
        0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0,
      ]);

      blit.uploadAndDisplay(pixels, 2, 2);

      const imageData = mockCtx.putImageData.mock.calls[0][0];
      const dst = imageData.data as Float32Array;

      // Canvas2D row 0 (top): should be green (from WebGL row 1)
      expect(dst[0]).toBeCloseTo(0.0);
      expect(dst[1]).toBeCloseTo(1.0);
      expect(dst[2]).toBeCloseTo(0.0);

      // Canvas2D row 1 (bottom): should be red (from WebGL row 0)
      expect(dst[8]).toBeCloseTo(1.0);
      expect(dst[9]).toBeCloseTo(0.0);
      expect(dst[10]).toBeCloseTo(0.0);
    });

    it('should resize canvas when dimensions change', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();

      blit.uploadAndDisplay(new Float32Array(4 * 4), 1, 1);
      expect(canvas.width).toBe(1);
      expect(canvas.height).toBe(1);

      blit.uploadAndDisplay(new Float32Array(2 * 2 * 4), 2, 2);
      expect(canvas.width).toBe(2);
      expect(canvas.height).toBe(2);
    });
  });

  describe('dispose', () => {
    it('should reset initialized state', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();
      expect(blit.initialized).toBe(true);

      blit.dispose();
      expect(blit.initialized).toBe(false);
    });

    it('should remove canvas from DOM', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      // Simulate DOM insertion
      const parent = document.createElement('div');
      parent.appendChild(canvas);
      expect(canvas.parentNode).toBe(parent);

      blit.dispose();
      expect(canvas.parentNode).toBeNull();
    });

    it('should be safe to call dispose without initialization', () => {
      const blit = new Canvas2DHDRBlit();
      expect(() => blit.dispose()).not.toThrow();
    });

    it('should reset colorSpace to default after dispose', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      // Only return context for rec2100-hlg to force that colorSpace
      canvas.getContext = vi.fn((type: string, settings?: any) => {
        if (type === '2d' && settings?.colorSpace === 'rec2100-hlg') {
          return mockCtx;
        }
        return null;
      }) as any;

      blit.initialize();
      expect(blit.colorSpace).toBe('rec2100-hlg');

      blit.dispose();
      expect(blit.colorSpace).toBe('srgb-linear'); // reset to default
    });
  });

  describe('uploadAndDisplay - HDR values', () => {
    it('should preserve HDR values > 1.0 without clamping', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();

      // 1x1 pixel with HDR values (bright highlight)
      const pixels = new Float32Array([3.5, 2.0, 1.5, 1.0]);
      blit.uploadAndDisplay(pixels, 1, 1);

      const imageData = mockCtx.putImageData.mock.calls[0][0];
      const dst = imageData.data as Float32Array;

      // HDR values should be preserved, not clamped to 1.0
      expect(dst[0]).toBeCloseTo(3.5);
      expect(dst[1]).toBeCloseTo(2.0);
      expect(dst[2]).toBeCloseTo(1.5);
      expect(dst[3]).toBeCloseTo(1.0);
    });

    it('should correctly flip a single-row image (no-op flip)', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();

      // 3x1 image: single row should be identical after flip
      const pixels = new Float32Array([
        0.1, 0.2, 0.3, 1.0,
        0.4, 0.5, 0.6, 1.0,
        0.7, 0.8, 0.9, 1.0,
      ]);
      blit.uploadAndDisplay(pixels, 3, 1);

      const imageData = mockCtx.putImageData.mock.calls[0][0];
      const dst = imageData.data as Float32Array;

      // Single row: input and output should be identical
      expect(dst[0]).toBeCloseTo(0.1);
      expect(dst[1]).toBeCloseTo(0.2);
      expect(dst[4]).toBeCloseTo(0.4);
      expect(dst[8]).toBeCloseTo(0.7);
    });

    it('should reject pixel arrays that are too small', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();

      // 2x2 image needs 16 floats, but we only provide 8
      const pixels = new Float32Array(8);
      blit.uploadAndDisplay(pixels, 2, 2);

      // putImageData should NOT be called since array is too small
      expect(mockCtx.putImageData).not.toHaveBeenCalled();
    });

    it('should accept pixel arrays larger than needed', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn(() => mockCtx) as any;

      blit.initialize();

      // 1x1 needs 4 floats, but we provide 8
      const pixels = new Float32Array(8).fill(0.5);
      blit.uploadAndDisplay(pixels, 1, 1);

      expect(mockCtx.putImageData).toHaveBeenCalledTimes(1);
    });
  });

  describe('initialize - fallback chain', () => {
    it('should fall back to pixelFormat when colorType is not available', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn((type: string, settings?: any) => {
        // Only accept pixelFormat (legacy Chrome <137)
        if (type === '2d' && settings?.pixelFormat === 'float16' && settings?.colorSpace === 'srgb-linear') {
          return mockCtx;
        }
        return null;
      }) as any;

      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('srgb-linear');
    });

    it('should try rec2100-hlg pixelFormat as last resort', () => {
      const mockCtx = { putImageData: vi.fn() };
      const blit = new Canvas2DHDRBlit();
      const canvas = blit.getCanvas();
      canvas.getContext = vi.fn((type: string, settings?: any) => {
        // Only accept rec2100-hlg + pixelFormat (the 4th attempt)
        if (type === '2d' && settings?.colorSpace === 'rec2100-hlg' && settings?.pixelFormat === 'float16') {
          return mockCtx;
        }
        return null;
      }) as any;

      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('rec2100-hlg');
    });
  });
});
