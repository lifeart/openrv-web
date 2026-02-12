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

  /**
   * Helper: mock document.createElement so that fresh canvases created
   * during initialize() have a custom getContext. initialize() creates
   * fresh canvases for each fallback attempt.
   */
  function mockCreateElement(getContextFn: (type: string, settings?: any) => any) {
    const origCreate = originalCreateElement.bind(document);
    document.createElement = vi.fn((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'canvas') {
        el.getContext = vi.fn(getContextFn) as any;
      }
      return el;
    }) as any;
  }

  /** Helper: create and initialize a blit with a simple mock context. */
  function createInitializedBlit(mockCtx?: { putImageData: ReturnType<typeof vi.fn> }) {
    const ctx = mockCtx ?? { putImageData: vi.fn() };
    mockCreateElement(() => ctx);
    const blit = new Canvas2DHDRBlit();
    blit.initialize();
    return { blit, mockCtx: ctx };
  }

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
      const mockCtx = { putImageData: vi.fn() };
      mockCreateElement((type: string, settings?: any) => {
        if (type === '2d' && settings?.colorSpace === 'srgb-linear' && settings?.colorType === 'float16') {
          return mockCtx;
        }
        return null;
      });

      const blit = new Canvas2DHDRBlit();
      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('srgb-linear');
    });

    it('should fall back to rec2100-hlg when srgb-linear is not available', () => {
      const mockCtx = { putImageData: vi.fn() };
      mockCreateElement((type: string, settings?: any) => {
        if (type === '2d' && settings?.colorSpace === 'rec2100-hlg') {
          return mockCtx;
        }
        return null;
      });

      const blit = new Canvas2DHDRBlit();
      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('rec2100-hlg');
    });

    it('should throw when no HDR context is available', () => {
      mockCreateElement(() => null);

      const blit = new Canvas2DHDRBlit();
      expect(() => blit.initialize()).toThrow('Canvas2D HDR not available');
    });

    it('should be idempotent', () => {
      const mockCtx = { putImageData: vi.fn() };
      mockCreateElement(() => mockCtx);

      const blit = new Canvas2DHDRBlit();
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
      const { blit, mockCtx } = createInitializedBlit();

      const pixels = new Float32Array(2 * 2 * 4).fill(0.5);
      blit.uploadAndDisplay(pixels, 2, 2);

      expect(mockCtx.putImageData).toHaveBeenCalledTimes(1);
      const imageData = mockCtx.putImageData.mock.calls[0][0];
      expect(imageData.width).toBe(2);
      expect(imageData.height).toBe(2);
    });

    it('should flip rows (bottom-to-top → top-to-bottom)', () => {
      const { blit, mockCtx } = createInitializedBlit();

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
      const { blit, mockCtx } = createInitializedBlit();
      const canvas = blit.getCanvas();

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
      const { blit } = createInitializedBlit();
      expect(blit.initialized).toBe(true);

      blit.dispose();
      expect(blit.initialized).toBe(false);
    });

    it('should remove canvas from DOM', () => {
      const { blit } = createInitializedBlit();
      const canvas = blit.getCanvas();

      // Simulate DOM insertion
      const parent = originalCreateElement.call(document, 'div');
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
      mockCreateElement((type: string, settings?: any) => {
        // Only return context for rec2100-hlg to force that colorSpace
        if (type === '2d' && settings?.colorSpace === 'rec2100-hlg') {
          return mockCtx;
        }
        return null;
      });

      const blit = new Canvas2DHDRBlit();
      blit.initialize();
      expect(blit.colorSpace).toBe('rec2100-hlg');

      blit.dispose();
      expect(blit.colorSpace).toBe('srgb-linear'); // reset to default
    });
  });

  describe('uploadAndDisplay - HDR values', () => {
    it('should preserve HDR values > 1.0 without clamping', () => {
      const { blit, mockCtx } = createInitializedBlit();

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
      const { blit, mockCtx } = createInitializedBlit();

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
      const { blit, mockCtx } = createInitializedBlit();

      // 2x2 image needs 16 floats, but we only provide 8
      const pixels = new Float32Array(8);
      blit.uploadAndDisplay(pixels, 2, 2);

      // putImageData should NOT be called since array is too small
      expect(mockCtx.putImageData).not.toHaveBeenCalled();
    });

    it('should accept pixel arrays larger than needed', () => {
      const { blit, mockCtx } = createInitializedBlit();

      // 1x1 needs 4 floats, but we provide 8
      const pixels = new Float32Array(8).fill(0.5);
      blit.uploadAndDisplay(pixels, 1, 1);

      expect(mockCtx.putImageData).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadAndDisplay - multi-row accuracy', () => {
    it('should correctly flip a 3-row image', () => {
      const { blit, mockCtx } = createInitializedBlit();

      // 2x3 image: row 0 = red, row 1 = green, row 2 = blue
      const pixels = new Float32Array([
        // WebGL row 0 (bottom): red
        1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0,
        // WebGL row 1 (middle): green
        0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0,
        // WebGL row 2 (top): blue
        0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0,
      ]);

      blit.uploadAndDisplay(pixels, 2, 3);

      const imageData = mockCtx.putImageData.mock.calls[0][0];
      const dst = imageData.data as Float32Array;
      const rowStride = 2 * 4; // 2 pixels * 4 channels

      // Canvas2D row 0 (top): should be blue (from WebGL row 2)
      expect(dst[0]).toBeCloseTo(0.0);
      expect(dst[1]).toBeCloseTo(0.0);
      expect(dst[2]).toBeCloseTo(1.0);

      // Canvas2D row 1 (middle): should be green (from WebGL row 1)
      expect(dst[rowStride]).toBeCloseTo(0.0);
      expect(dst[rowStride + 1]).toBeCloseTo(1.0);
      expect(dst[rowStride + 2]).toBeCloseTo(0.0);

      // Canvas2D row 2 (bottom): should be red (from WebGL row 0)
      expect(dst[rowStride * 2]).toBeCloseTo(1.0);
      expect(dst[rowStride * 2 + 1]).toBeCloseTo(0.0);
      expect(dst[rowStride * 2 + 2]).toBeCloseTo(0.0);
    });

    it('should work correctly after canvas resize', () => {
      const { blit, mockCtx } = createInitializedBlit();
      const canvas = blit.getCanvas();

      // First upload: 1x1
      const pixels1 = new Float32Array([0.5, 0.5, 0.5, 1.0]);
      blit.uploadAndDisplay(pixels1, 1, 1);

      expect(canvas.width).toBe(1);
      expect(canvas.height).toBe(1);
      expect(mockCtx.putImageData).toHaveBeenCalledTimes(1);

      // Second upload: 2x2 (triggers resize)
      const pixels2 = new Float32Array([
        0.1, 0.2, 0.3, 1.0, 0.4, 0.5, 0.6, 1.0,
        0.7, 0.8, 0.9, 1.0, 1.0, 1.0, 1.0, 1.0,
      ]);
      blit.uploadAndDisplay(pixels2, 2, 2);

      expect(canvas.width).toBe(2);
      expect(canvas.height).toBe(2);
      expect(mockCtx.putImageData).toHaveBeenCalledTimes(2);

      // Verify the second upload has correct flipped data
      const imageData = mockCtx.putImageData.mock.calls[1][0];
      const dst = imageData.data as Float32Array;

      // Row 0 output = row 1 input (flipped)
      expect(dst[0]).toBeCloseTo(0.7);
      expect(dst[1]).toBeCloseTo(0.8);
      // Row 1 output = row 0 input (flipped)
      expect(dst[8]).toBeCloseTo(0.1);
      expect(dst[9]).toBeCloseTo(0.2);
    });

    it('should handle negative pixel values (for scene-referred data)', () => {
      const { blit, mockCtx } = createInitializedBlit();

      // Scene-referred data can have negative values (e.g., out-of-gamut)
      const pixels = new Float32Array([-0.1, 0.5, 1.5, 1.0]);
      blit.uploadAndDisplay(pixels, 1, 1);

      const imageData = mockCtx.putImageData.mock.calls[0][0];
      const dst = imageData.data as Float32Array;

      // Negative values should be preserved (browser handles clipping)
      expect(dst[0]).toBeCloseTo(-0.1);
      expect(dst[1]).toBeCloseTo(0.5);
      expect(dst[2]).toBeCloseTo(1.5);
    });
  });

  describe('initialize - fallback chain', () => {
    it('should fall back to pixelFormat when colorType is not available', () => {
      const mockCtx = { putImageData: vi.fn() };
      mockCreateElement((type: string, settings?: any) => {
        // Only accept pixelFormat (legacy Chrome <137)
        if (type === '2d' && settings?.pixelFormat === 'float16' && settings?.colorSpace === 'srgb-linear') {
          return mockCtx;
        }
        return null;
      });

      const blit = new Canvas2DHDRBlit();
      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('srgb-linear');
    });

    it('should try rec2100-hlg pixelFormat as last resort', () => {
      const mockCtx = { putImageData: vi.fn() };
      mockCreateElement((type: string, settings?: any) => {
        // Only accept rec2100-hlg + pixelFormat (the 4th attempt)
        if (type === '2d' && settings?.colorSpace === 'rec2100-hlg' && settings?.pixelFormat === 'float16') {
          return mockCtx;
        }
        return null;
      });

      const blit = new Canvas2DHDRBlit();
      blit.initialize();

      expect(blit.initialized).toBe(true);
      expect(blit.colorSpace).toBe('rec2100-hlg');
    });
  });
});
