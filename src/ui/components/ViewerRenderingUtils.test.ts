import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  drawWithTransform,
  drawWithTransformFill,
  FilterStringCache,
  getCanvasFilterString,
  buildContainerFilterString,
  renderCropOverlay,
  drawPlaceholder,
  calculateDisplayDimensions,
  isFullCropRegion,
  getEffectiveDimensions,
} from './ViewerRenderingUtils';
import { ColorAdjustments } from './ColorControls';
import { Transform2D } from './TransformControl';
import { CropState, CropRegion } from './CropControl';

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  const mockCanvas = {
    width: 800,
    height: 600,
    style: {
      width: '',
      height: '',
    },
  };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
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
    canvas: mockCanvas,
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
    gamma: 1,
    contrast: 1,
    saturation: 1,
    vibrance: 0,
    vibranceSkinProtection: true,
    clarity: 0,
    hueRotation: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
  };
}

// Default transform
function defaultTransform(): Transform2D {
  return {
    rotation: 0,
    flipH: false,
    flipV: false,
    scale: { x: 1, y: 1 },
    translate: { x: 0, y: 0 },
  };
}

describe('ViewerRenderingUtils', () => {
  // Tests verify observable behavior (state changes, output values)
  // rather than internal method calls
  describe('drawWithTransform', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('should draw image directly when no transforms applied', () => {
      const image = createMockImage(800, 600);
      const transform = defaultTransform();

      drawWithTransform(ctx, image, 800, 600, transform);

      // No save/restore needed for identity transform
      expect(ctx.save).not.toHaveBeenCalled();
      // Verify the image was drawn at correct dimensions
      expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 600);
    });

    it('should apply rotation transform with save/restore lifecycle', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { ...defaultTransform(), rotation: 90 };

      drawWithTransform(ctx, image, 800, 600, transform);

      // Verify the save/restore lifecycle is maintained (prevents state leaks)
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply horizontal flip with proper context lifecycle', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { ...defaultTransform(), flipH: true };

      drawWithTransform(ctx, image, 800, 600, transform);

      // Verify save/restore lifecycle and that scale was invoked for flip
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply vertical flip with proper context lifecycle', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { ...defaultTransform(), flipV: true };

      drawWithTransform(ctx, image, 800, 600, transform);

      // Verify save/restore lifecycle and that scale was invoked for flip
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply both flips together', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { ...defaultTransform(), flipH: true, flipV: true };

      drawWithTransform(ctx, image, 800, 600, transform);

      // Verify scale was called (both flips combined into single call)
      expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
    });

    it('should handle 270 degree rotation', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { ...defaultTransform(), rotation: 270 };

      drawWithTransform(ctx, image, 800, 600, transform);

      expect(ctx.rotate).toHaveBeenCalledWith((270 * Math.PI) / 180);
    });

    it('should handle video element with same lifecycle as image', () => {
      const video = createMockVideo(1920, 1080);
      const transform: Transform2D = { ...defaultTransform(), rotation: 90 };

      drawWithTransform(ctx, video, 1920, 1080, transform);

      // Verify video elements are handled identically to images
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should handle zero video dimensions gracefully', () => {
      const video = createMockVideo(0, 0);
      const transform: Transform2D = { ...defaultTransform(), rotation: 90 };

      // Should not throw
      expect(() => {
        drawWithTransform(ctx, video, 800, 600, transform);
      }).not.toThrow();
    });

    it('should handle zero display dimensions', () => {
      const image = createMockImage(800, 600);
      const transform: Transform2D = { ...defaultTransform(), rotation: 90 };

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

    it('should build hue rotation filter', () => {
      const adjustments = { ...defaultAdjustments(), hueRotation: 180 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toContain('hue-rotate(180.0deg)');
    });

    it('should not include hue rotation filter when value is 0', () => {
      const adjustments = { ...defaultAdjustments(), hueRotation: 0 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toBe('none');
    });

    it('should normalize hue rotation of 360 to 0 (no filter)', () => {
      const adjustments = { ...defaultAdjustments(), hueRotation: 360 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      // 360 % 360 = 0, so no hue-rotate filter should be emitted
      expect(result).toBe('none');
    });

    it('should normalize negative hue rotation to equivalent positive value', () => {
      const adjustments = { ...defaultAdjustments(), hueRotation: -90 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      // -90 normalizes to 270
      expect(result).toContain('hue-rotate(270.0deg)');
    });

    it('should normalize hue rotation > 360 by wrapping', () => {
      const adjustments = { ...defaultAdjustments(), hueRotation: 450 };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      // 450 % 360 = 90
      expect(result).toContain('hue-rotate(90.0deg)');
    });

    it('should handle NaN hue rotation gracefully (no filter)', () => {
      const adjustments = { ...defaultAdjustments(), hueRotation: NaN };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      // NaN falls back to 0, so no hue-rotate filter
      expect(result).toBe('none');
      expect(result).not.toContain('NaN');
    });

    it('should handle NaN brightness gracefully (no filter)', () => {
      const adjustments = { ...defaultAdjustments(), brightness: NaN };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      // NaN brightness falls back to 0, so 1+0=1, no brightness filter
      expect(result).toBe('none');
      expect(result).not.toContain('NaN');
    });

    it('should handle NaN exposure gracefully (no filter)', () => {
      const adjustments = { ...defaultAdjustments(), exposure: NaN };
      const cache: FilterStringCache = { filterString: null, cachedAdjustments: null };

      const result = getCanvasFilterString(adjustments, cache);

      expect(result).toBe('none');
      expect(result).not.toContain('NaN');
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
        ...defaultAdjustments(),
        brightness: 0.2,
        contrast: 1.2,
        saturation: 0.8,
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
        aspectRatio: null,
      };

      renderCropOverlay(ctx, cropState, 800, 600);

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(ctx.fillRect).not.toHaveBeenCalled();
    });

    it('should render overlay when crop enabled', () => {
      const cropState: CropState = {
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        aspectRatio: null,
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
        aspectRatio: null,
      };

      renderCropOverlay(ctx, cropState, 400, 400);

      // fillRect called for: 4 darkened areas + 4 corner handles = at least 8 calls
      expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(8);
    });

    it('should draw rule of thirds guides', () => {
      const cropState: CropState = {
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        aspectRatio: null,
      };

      renderCropOverlay(ctx, cropState, 600, 600);

      // Should have moveTo and lineTo calls for vertical and horizontal lines
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
    });

    it('should skip rendering for full-frame crop (performance optimization)', () => {
      const cropState: CropState = {
        enabled: true,
        region: { x: 0, y: 0, width: 1, height: 1 },
        aspectRatio: null,
      };

      renderCropOverlay(ctx, cropState, 600, 600);

      // Should only clear, no overlay rendering for full-frame crop
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 600, 600);
      expect(ctx.fillRect).not.toHaveBeenCalled();
      expect(ctx.strokeRect).not.toHaveBeenCalled();
    });

    it('should not render overlay when isEditing is false (pixel clipping suffices)', () => {
      const cropState: CropState = {
        enabled: true,
        region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        aspectRatio: null,
      };

      renderCropOverlay(ctx, cropState, 800, 600, false);

      // Should only clear, no overlay rendering when not editing
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
      expect(ctx.fillRect).not.toHaveBeenCalled();
      expect(ctx.strokeRect).not.toHaveBeenCalled();
      expect(ctx.stroke).not.toHaveBeenCalled();
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

  describe('isFullCropRegion', () => {
    it('should return true for full-frame crop', () => {
      const region: CropRegion = { x: 0, y: 0, width: 1, height: 1 };
      expect(isFullCropRegion(region)).toBe(true);
    });

    it('should return false for non-zero x', () => {
      const region: CropRegion = { x: 0.1, y: 0, width: 1, height: 1 };
      expect(isFullCropRegion(region)).toBe(false);
    });

    it('should return false for non-zero y', () => {
      const region: CropRegion = { x: 0, y: 0.1, width: 1, height: 1 };
      expect(isFullCropRegion(region)).toBe(false);
    });

    it('should return false for width less than 1', () => {
      const region: CropRegion = { x: 0, y: 0, width: 0.5, height: 1 };
      expect(isFullCropRegion(region)).toBe(false);
    });

    it('should return false for height less than 1', () => {
      const region: CropRegion = { x: 0, y: 0, width: 1, height: 0.5 };
      expect(isFullCropRegion(region)).toBe(false);
    });

    it('should return false for centered crop', () => {
      const region: CropRegion = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      expect(isFullCropRegion(region)).toBe(false);
    });

    it('should return true for near-full crop (floating-point imprecision)', () => {
      // Simulate floating-point drift from drag operations
      const region: CropRegion = { x: 1e-10, y: -1e-12, width: 0.9999999999, height: 1.0000000001 };
      expect(isFullCropRegion(region)).toBe(true);
    });

    it('should return false for values just outside epsilon threshold', () => {
      const region: CropRegion = { x: 0.001, y: 0, width: 1, height: 1 };
      expect(isFullCropRegion(region)).toBe(false);
    });
  });

  describe('getEffectiveDimensions', () => {
    it('should return same dimensions for 0° rotation', () => {
      const result = getEffectiveDimensions(1920, 1080, 0);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('should return same dimensions for 180° rotation', () => {
      const result = getEffectiveDimensions(1920, 1080, 180);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('should swap dimensions for 90° rotation', () => {
      const result = getEffectiveDimensions(1920, 1080, 90);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
    });

    it('should swap dimensions for 270° rotation', () => {
      const result = getEffectiveDimensions(1920, 1080, 270);
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1920);
    });

    it('should handle square dimensions', () => {
      const result90 = getEffectiveDimensions(500, 500, 90);
      expect(result90.width).toBe(500);
      expect(result90.height).toBe(500);

      const result0 = getEffectiveDimensions(500, 500, 0);
      expect(result0.width).toBe(500);
      expect(result0.height).toBe(500);
    });
  });

  // Tests verify observable behavior (state changes, output values)
  // rather than internal method calls
  describe('drawWithTransformFill', () => {
    let ctx: CanvasRenderingContext2D;

    beforeEach(() => {
      ctx = createMockContext();
    });

    it('should draw directly without transforms (no save/restore overhead)', () => {
      const element = createMockImage(800, 600);
      const transform: Transform2D = {
        rotation: 0,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 800, 600, transform);

      // Identity transform should draw directly without save/restore overhead
      expect(ctx.drawImage).toHaveBeenCalledWith(element, 0, 0, 800, 600);
      expect(ctx.save).not.toHaveBeenCalled();
    });

    it('should apply rotation with proper save/restore lifecycle', () => {
      const element = createMockImage(1080, 1920);
      const transform: Transform2D = {
        rotation: 90,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 1080, 1920, transform);

      // Verify proper context lifecycle for rotated rendering
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply horizontal flip with scale', () => {
      const element = createMockImage(800, 600);
      const transform: Transform2D = {
        rotation: 0,
        flipH: true,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 800, 600, transform);

      // Verify scale is invoked and drawImage completes
      expect(ctx.scale).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should apply vertical flip with scale', () => {
      const element = createMockImage(800, 600);
      const transform: Transform2D = {
        rotation: 0,
        flipH: false,
        flipV: true,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 800, 600, transform);

      // Verify scale is invoked and drawImage completes
      expect(ctx.scale).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('should apply both flips combined', () => {
      const element = createMockImage(800, 600);
      const transform: Transform2D = {
        rotation: 0,
        flipH: true,
        flipV: true,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 800, 600, transform);

      // Both flips combined into a single scale call
      expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
    });

    it('should swap draw dimensions for 90° rotation', () => {
      const element = createMockImage(1920, 1080);
      const transform: Transform2D = {
        rotation: 90,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      // Canvas is 1080x1920 (swapped), draw should use swapped dimensions
      drawWithTransformFill(ctx, element, 1080, 1920, transform);

      // drawImage should be called with swapped draw dimensions
      const drawCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls;
      expect(drawCalls.length).toBeGreaterThan(0);
      const drawCall = drawCalls[0]!;
      // For 90° rotation, drawWidth=canvasHeight, drawHeight=canvasWidth
      // So it draws at -960, -540 with size 1920x1080
      expect(drawCall[1]).toBe(-960); // -drawWidth/2
      expect(drawCall[2]).toBe(-540); // -drawHeight/2
    });

    it('should handle 180° rotation without swapping dimensions', () => {
      const element = createMockImage(800, 600);
      const transform: Transform2D = {
        rotation: 180,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 800, 600, transform);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.translate).toHaveBeenCalledWith(400, 300); // center
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI); // 180° in radians
      // 180° does NOT swap dimensions, so drawImage uses -400, -300
      const drawCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls;
      expect(drawCalls[0]![1]).toBe(-400); // -canvasWidth/2
      expect(drawCalls[0]![2]).toBe(-300); // -canvasHeight/2
      expect(drawCalls[0]![3]).toBe(800);  // drawWidth = canvasWidth
      expect(drawCalls[0]![4]).toBe(600);  // drawHeight = canvasHeight
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should handle 270° rotation with swapped dimensions', () => {
      const element = createMockImage(1920, 1080);
      const transform: Transform2D = {
        rotation: 270,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      // Canvas is 1080x1920 (swapped for 270°)
      drawWithTransformFill(ctx, element, 1080, 1920, transform);

      expect(ctx.rotate).toHaveBeenCalledWith((270 * Math.PI) / 180);
      // For 270° rotation, drawWidth=canvasHeight=1920, drawHeight=canvasWidth=1080
      const drawCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls;
      expect(drawCalls[0]![3]).toBe(1920); // drawWidth = canvasHeight
      expect(drawCalls[0]![4]).toBe(1080); // drawHeight = canvasWidth
    });

    it('should apply 90° rotation with horizontal flip', () => {
      const element = createMockImage(1920, 1080);
      const transform: Transform2D = {
        rotation: 90,
        flipH: true,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 1080, 1920, transform);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.rotate).toHaveBeenCalledWith((90 * Math.PI) / 180);
      expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply 180° rotation with both flips', () => {
      const element = createMockImage(800, 600);
      const transform: Transform2D = {
        rotation: 180,
        flipH: true,
        flipV: true,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 800, 600, transform);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI);
      expect(ctx.scale).toHaveBeenCalledWith(-1, -1);
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('should apply 270° rotation with vertical flip', () => {
      const element = createMockImage(1920, 1080);
      const transform: Transform2D = {
        rotation: 270,
        flipH: false,
        flipV: true,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      };

      drawWithTransformFill(ctx, element, 1080, 1920, transform);

      expect(ctx.rotate).toHaveBeenCalledWith((270 * Math.PI) / 180);
      expect(ctx.scale).toHaveBeenCalledWith(1, -1);
    });
  });
});
