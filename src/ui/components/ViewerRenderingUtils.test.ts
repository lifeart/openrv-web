import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  drawWithTransform,
  FilterStringCache,
  getCanvasFilterString,
  buildContainerFilterString,
  renderCropOverlay,
  drawPlaceholder,
  calculateDisplayDimensions,
} from './ViewerRenderingUtils';
import { ColorAdjustments } from './ColorControls';
import { Transform2D } from './TransformControl';
import { CropState } from './CropControl';

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    filter: 'none',
  } as unknown as CanvasRenderingContext2D;
}

// Mock image element
function createMockImage(width: number, height: number): HTMLImageElement {
  return {
    naturalWidth: width,
    naturalHeight: height,
  } as HTMLImageElement;
}

// Mock video element
function createMockVideo(width: number, height: number): HTMLVideoElement {
  return {
    videoWidth: width,
    videoHeight: height,
  } as HTMLVideoElement;
}

// Default color adjustments
function defaultAdjustments(): ColorAdjustments {
  return {
    brightness: 0,
    exposure: 0,
    contrast: 1,
    saturation: 1,
    temperature: 0,
    tint: 0,
  };
}

// Default transform
function defaultTransform(): Transform2D {
  return {
    rotation: 0,
    flipH: false,
    flipV: false,
  };
}

describe('ViewerRenderingUtils', () => {
  describe('drawWithTransform', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('should draw image directly when no transforms applied', () => {
      const image = createMockImage(800, 600);
      const transform = defaultTransform();

      drawWithTransform(ctx, image, 800, 600, transform);

      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 600);
    });

    it('should apply rotation transform', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false };

      drawWithTransform(ctx, image, 800, 600, transform);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.translate).toHaveBeenCalledWith(400, 300);
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply horizontal flip', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { rotation: 0, flipH: true, flipV: false };

      drawWithTransform(ctx, image, 800, 600, transform);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply vertical flip', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { rotation: 0, flipH: false, flipV: true };

      drawWithTransform(ctx, image, 800, 600, transform);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalledWith(1, -1);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply both flips', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { rotation: 0, flipH: true, flipV: true };

      drawWithTransform(ctx, image, 800, 600, transform);

      expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
    });

    it('should handle 270 degree rotation', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { rotation: 270, flipH: false, flipV: false };

      drawWithTransform(ctx, image, 800, 600, transform);

      expect(ctx.rotate).toHaveBeenCalledWith((270 * Math.PI) / 180);
    });

    it('should handle video element', () => {
      const video = createMockVideo(1920, 1080);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false };

      drawWithTransform(ctx, video, 1920, 1080, transform);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should handle zero video dimensions gracefully', () => {
      const video = createMockVideo(0, 0);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false };

      // Should not throw
      expect(() => {
        drawWithTransform(ctx, video, 800, 600, transform);
      }).not.toThrow();
    });

    it('should handle zero display dimensions', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { rotation: 90, flipH: false, flipV: false };

      // Should not throw even with zero display dimensions
      expect(() => {
        drawWithTransform(ctx, image, 0, 0, transform);
      }).not.toThrow();
    });
  });

  describe('getCanvasFilterString', () => {
    it('should return "none" for default adjustments', () => {
      const adjustments = defaultAdjustments();
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toBe('none');
    });

    it('should build brightness filter', () => {
      const adjustments = { ...defaultAdjustments(), brightness: 0.5 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('brightness(1.500)');
    });

    it('should build exposure filter', () => {
      const adjustments = { ...defaultAdjustments(), exposure: 1 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('brightness(2.000)');
    });

    it('should build contrast filter', () => {
      const adjustments = { ...defaultAdjustments(), contrast: 1.5 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('contrast(1.500)');
    });

    it('should build saturation filter', () => {
      const adjustments = { ...defaultAdjustments(), saturation: 0.5 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('saturate(0.500)');
    });

    it('should build positive temperature filter with sepia', () => {
      const adjustments = { ...defaultAdjustments(), temperature: 50 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('sepia(');
    });

    it('should build negative temperature filter with hue-rotate', () => {
      const adjustments = { ...defaultAdjustments(), temperature: -50 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('hue-rotate(');
    });

    it('should build tint filter', () => {
      const adjustments = { ...defaultAdjustments(), tint: 20 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('hue-rotate(');
    });

    it('should combine multiple filters', () => {
      const adjustments: ColorAdjustments = {
        brightness: 0.2,
        exposure: 0,
        contrast: 1.2,
        saturation: 0.8,
        temperature: 0,
        tint: 0,
      };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('brightness(');
      expect(result).toContain('contrast(');
      expect(result).toContain('saturate(');
    });

    it('should use cached value when adjustments unchanged', () => {
      const adjustments = { ...defaultAdjustments(), brightness: 0.3 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result1 = getCanvasFilterString(adjustments, cache);
      const result2 = getCanvasFilterString(adjustments, cache);

      expect(result1).toBe(result2);
      expect(cache.filterString).toBe(result1);
    });

    it('should update cache when adjustments change', () => {
      const adjustments1 = { ...defaultAdjustments(), brightness: 0.3 };
      const adjustments2 = { ...defaultAdjustments(), brightness: 0.5 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result1 = getCanvasFilterString(adjustments1, cache);
      const result2 = getCanvasFilterString(adjustments2, cache);

      expect(result1).not.toBe(result2);
      expect(cache.filterString).toBe(result2);
    });
  });

  describe('buildContainerFilterString', () => {
    it('should return "none" for default adjustments and no blur', () => {
      const adjustments = defaultAdjustments();

      const result = buildContainerFilterString(adjustments, 0);

      expect(result).toBe('none');
    });

    it('should include blur filter when blur amount > 0', () => {
      const adjustments = defaultAdjustments();

      const result = buildContainerFilterString(adjustments, 5);

      expect(result).toContain('blur(5.0px)');
    });

    it('should combine color adjustments with blur', () => {
      const adjustments = { ...defaultAdjustments(), brightness: 0.2 };

      const result = buildContainerFilterString(adjustments, 3);

      expect(result).toContain('brightness(');
      expect(result).toContain('blur(3.0px)');
    });
  });

  describe('renderCropOverlay', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('should clear and return early when crop not enabled', () => {
      const cropState: CropState = {
        enabled: false,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      };

      renderCropOverlay(ctx, cropState, 800, 600);

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(ctx.fillRect).not.toHaveBeenCalled();
    });

    it('should render overlay when crop enabled', () => {
      const cropState: CropState = {
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      };

      renderCropOverlay(ctx, cropState, 800, 600);

      // Should draw darkened areas (4 rectangles for top, bottom, left, right)
      expect(ctx.fillRect).toHaveBeenCalled();
      // Should draw crop border
      expect(ctx.strokeRect).toHaveBeenCalled();
      // Should draw guide lines
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('should draw corner handles', () => {
      const cropState: CropState = {
        enabled: true,
        region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      };

      renderCropOverlay(ctx, cropState, 400, 400);

      // fillRect called for: 4 darkened areas + 4 corner handles = at least 8 calls
      expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(8);
    });

    it('should draw rule of thirds guides', () => {
      const cropState: CropState = {
        enabled: true,
        region: { x: 0, y: 0, width: 1, height: 1 },
      };

      renderCropOverlay(ctx, cropState, 600, 600);

      // Should have moveTo and lineTo calls for vertical and horizontal lines
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
    });
  });

  describe('drawPlaceholder', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('should clear canvas first', () => {
      drawPlaceholder(ctx, 800, 600, 1);

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it('should draw checkerboard pattern', () => {
      drawPlaceholder(ctx, 100, 100, 1);

      // Multiple fillRect calls for checkerboard squares
      expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
    });

    it('should draw placeholder text', () => {
      drawPlaceholder(ctx, 800, 600, 1);

      expect(ctx.fillText).toHaveBeenCalled();
      const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some((call: unknown[]) => (call[0] as string).includes('Drop'))).toBe(true);
    });

    it('should scale with zoom', () => {
      drawPlaceholder(ctx, 800, 600, 2);

      // Font should be scaled
      expect(ctx.font).toContain('px');
    });

    it('should handle small zoom values', () => {
      expect(() => {
        drawPlaceholder(ctx, 800, 600, 0.1);
      }).not.toThrow();
    });
  });

  describe('calculateDisplayDimensions', () => {
    it('should calculate dimensions for exact fit', () => {
      const result = calculateDisplayDimensions(800, 600, 800, 600, 1);

      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('should scale down for larger source', () => {
      const result = calculateDisplayDimensions(1600, 1200, 800, 600, 1);

      expect(result.width).toBeLessThanOrEqual(800);
      expect(result.height).toBeLessThanOrEqual(600);
    });

    it('should not upscale smaller source at zoom 1', () => {
      const result = calculateDisplayDimensions(400, 300, 800, 600, 1);

      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });

    it('should apply zoom factor', () => {
      const result1 = calculateDisplayDimensions(400, 300, 800, 600, 1);
      const result2 = calculateDisplayDimensions(400, 300, 800, 600, 2);

      expect(result2.width).toBe(result1.width * 2);
      expect(result2.height).toBe(result1.height * 2);
    });

    it('should maintain aspect ratio', () => {
      const sourceAspect = 1600 / 900;
      const result = calculateDisplayDimensions(1600, 900, 800, 600, 1);

      const resultAspect = result.width / result.height;
      expect(Math.abs(resultAspect - sourceAspect)).toBeLessThan(0.01);
    });

    it('should handle portrait orientation', () => {
      const result = calculateDisplayDimensions(600, 1200, 800, 600, 1);

      expect(result.width).toBeLessThan(result.height);
    });

    it('should handle zero source dimensions', () => {
      const result = calculateDisplayDimensions(0, 0, 800, 600, 1);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });

    it('should handle zero container dimensions', () => {
      const result = calculateDisplayDimensions(800, 600, 0, 0, 1);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });

    it('should handle negative dimensions', () => {
      const result = calculateDisplayDimensions(-800, -600, 800, 600, 1);

      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
    });

    it('should produce minimum 1x1 dimensions', () => {
      const result = calculateDisplayDimensions(1, 1, 1, 1, 0.001);

      expect(result.width).toBeGreaterThanOrEqual(1);
      expect(result.height).toBeGreaterThanOrEqual(1);
    });

    it('should handle very small zoom', () => {
      const result = calculateDisplayDimensions(800, 600, 800, 600, 0.01);

      expect(result.width).toBeGreaterThanOrEqual(1);
      expect(result.height).toBeGreaterThanOrEqual(1);
    });

    it('should handle large zoom', () => {
      const result = calculateDisplayDimensions(800, 600, 800, 600, 10);

      expect(result.width).toBe(8000);
      expect(result.height).toBe(6000);
    });
  });
});
