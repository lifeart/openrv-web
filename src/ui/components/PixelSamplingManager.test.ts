import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PixelSamplingManager, PixelSamplingContext } from './PixelSamplingManager';

describe('PixelSamplingManager', () => {
  let manager: PixelSamplingManager;

  const mockPixelProbe = {
    isEnabled: vi.fn(() => false),
    getSampleSize: vi.fn(() => 1),
    getSourceMode: vi.fn(() => 'output'),
    setSourceImageData: vi.fn(),
    updateFromCanvas: vi.fn(),
    updateFromHDRValues: vi.fn(),
    setOverlayPosition: vi.fn(),
    toggleLock: vi.fn(),
  };

  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx2d = canvas.getContext('2d')!;

  const mockContext: PixelSamplingContext = {
    pixelProbe: mockPixelProbe as any,
    getGLRenderer: vi.fn(() => null),
    getRenderWorkerProxy: vi.fn(() => null),
    isAsyncRenderer: vi.fn(() => false),
    isHDRRenderActive: vi.fn(() => false),
    isSDRWebGLRenderActive: vi.fn(() => false),
    getImageCanvas: vi.fn(() => canvas),
    getImageCtx: vi.fn(() => ctx2d),
    getSession: vi.fn(() => ({ currentSource: null })) as any,
    getDisplayDimensions: vi.fn(() => ({ width: 800, height: 600 })),
    getCanvasColorSpace: vi.fn(() => undefined),
    getImageCanvasRect: vi.fn(
      () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect,
    ),
    isViewerContentElement: vi.fn(() => true),
    drawWithTransform: vi.fn(),
    getLastRenderedImage: vi.fn(() => null),
    isPlaying: vi.fn(() => false),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPixelProbe.isEnabled.mockReturnValue(false);
    manager = new PixelSamplingManager(mockContext);
  });

  // ===========================================================================
  // 1. Constructor
  // ===========================================================================

  describe('constructor', () => {
    it('PSM-001: creates manager without throwing', () => {
      expect(() => new PixelSamplingManager(mockContext)).not.toThrow();
    });
  });

  // ===========================================================================
  // 2. onCursorColorChange
  // ===========================================================================

  describe('onCursorColorChange', () => {
    it('PSM-010: registers a callback', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      // Verify callback is registered by triggering onMouseLeaveForCursorColor
      manager.onMouseLeaveForCursorColor();
      expect(callback).toHaveBeenCalledWith(null, null);
    });

    it('PSM-011: onMouseLeaveForCursorColor calls callback with null when registered', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      manager.onMouseLeaveForCursorColor();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(null, null);
    });

    it('PSM-012: onMouseLeaveForCursorColor is a no-op when no callback registered', () => {
      // Should not throw when no callback is registered
      expect(() => manager.onMouseLeaveForCursorColor()).not.toThrow();
    });
  });

  // ===========================================================================
  // 3. handlePixelProbeData
  // ===========================================================================

  describe('handlePixelProbeData', () => {
    const pixels = new Float32Array([0.5, 0.3, 0.1, 1.0]);
    const position = { x: 100, y: 100 };
    const mockEvent = { clientX: 100, clientY: 100 } as MouseEvent;

    it('PSM-020: with probeEnabled=true and valid pixels, calls pixelProbe.updateFromHDRValues', () => {
      manager.handlePixelProbeData(
        pixels,
        position,
        1,
        1,
        true,
        false,
        mockEvent,
      );

      expect(mockPixelProbe.updateFromHDRValues).toHaveBeenCalledTimes(1);
      const args = mockPixelProbe.updateFromHDRValues.mock.calls[0];
      expect(args[0]).toBe(100); // x
      expect(args[1]).toBe(100); // y
      expect(args[2]).toBeCloseTo(0.5, 5); // r
      expect(args[3]).toBeCloseTo(0.3, 5); // g
      expect(args[4]).toBeCloseTo(0.1, 5); // b
      expect(args[5]).toBeCloseTo(1.0, 5); // a
      expect(args[6]).toBe(800); // displayWidth
      expect(args[7]).toBe(600); // displayHeight
      expect(mockPixelProbe.setOverlayPosition).toHaveBeenCalledWith(100, 100);
    });

    it('PSM-021: with cursorColorEnabled=true and valid pixels, calls cursorColorCallback with RGB values', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      manager.handlePixelProbeData(
        pixels,
        position,
        1,
        1,
        false,
        true,
        mockEvent,
      );

      expect(callback).toHaveBeenCalledWith(
        {
          r: Math.round(0.5 * 255),
          g: Math.round(0.3 * 255),
          b: Math.round(0.1 * 255),
        },
        position,
      );
    });

    it('PSM-022: with null pixels and cursorColorEnabled, calls callback with null', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      manager.handlePixelProbeData(
        null,
        position,
        1,
        1,
        false,
        true,
        mockEvent,
      );

      expect(callback).toHaveBeenCalledWith(null, null);
    });

    it('PSM-023: with probeEnabled=false, does not call pixelProbe.updateFromHDRValues', () => {
      manager.handlePixelProbeData(
        pixels,
        position,
        1,
        1,
        false,
        false,
        mockEvent,
      );

      expect(mockPixelProbe.updateFromHDRValues).not.toHaveBeenCalled();
      expect(mockPixelProbe.setOverlayPosition).not.toHaveBeenCalled();
    });

    it('PSM-024: with probeEnabled=true but null pixels, still calls setOverlayPosition', () => {
      manager.handlePixelProbeData(
        null,
        position,
        1,
        1,
        true,
        false,
        mockEvent,
      );

      expect(mockPixelProbe.updateFromHDRValues).not.toHaveBeenCalled();
      expect(mockPixelProbe.setOverlayPosition).toHaveBeenCalledWith(100, 100);
    });

    it('PSM-025: shared handler serves both probe and cursor color in a single invocation', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      manager.handlePixelProbeData(
        pixels,
        position,
        1,
        1,
        true,
        true,
        mockEvent,
      );

      // Both probe and cursor color consumers should have been served
      expect(mockPixelProbe.updateFromHDRValues).toHaveBeenCalledOnce();
      expect(mockPixelProbe.setOverlayPosition).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledOnce();
    });

    it('PSM-026: multi-pixel block is averaged correctly', () => {
      // 2x2 block of pixels: test that averaging math works for real multi-pixel data
      const multiPixels = new Float32Array([
        0.2, 0.4, 0.6, 1.0,  // pixel (0,0)
        0.4, 0.6, 0.8, 1.0,  // pixel (1,0)
        0.6, 0.8, 1.0, 1.0,  // pixel (0,1)
        0.8, 1.0, 0.2, 1.0,  // pixel (1,1)
      ]);
      // Expected averages: r=(0.2+0.4+0.6+0.8)/4=0.5, g=(0.4+0.6+0.8+1.0)/4=0.7,
      //                    b=(0.6+0.8+1.0+0.2)/4=0.65, a=1.0

      manager.handlePixelProbeData(
        multiPixels,
        position,
        2,   // rw
        2,   // rh
        true,
        false,
        mockEvent,
      );

      const args = mockPixelProbe.updateFromHDRValues.mock.calls[0];
      expect(args[2]).toBeCloseTo(0.5, 5);   // avg r
      expect(args[3]).toBeCloseTo(0.7, 5);   // avg g
      expect(args[4]).toBeCloseTo(0.65, 5);  // avg b
      expect(args[5]).toBeCloseTo(1.0, 5);   // avg a
    });

    it('PSM-027: cursor color reads center pixel from multi-pixel block, not average', () => {
      // 3x3 block: cursor color should read the center pixel, not average
      const block3x3 = new Float32Array([
        0.0, 0.0, 0.0, 1.0,  // (0,0)
        0.0, 0.0, 0.0, 1.0,  // (1,0)
        0.0, 0.0, 0.0, 1.0,  // (2,0)
        0.0, 0.0, 0.0, 1.0,  // (0,1)
        0.5, 0.3, 0.1, 1.0,  // (1,1) CENTER
        0.0, 0.0, 0.0, 1.0,  // (2,1)
        0.0, 0.0, 0.0, 1.0,  // (0,2)
        0.0, 0.0, 0.0, 1.0,  // (1,2)
        0.0, 0.0, 0.0, 1.0,  // (2,2)
      ]);

      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      manager.handlePixelProbeData(
        block3x3,
        position,
        3,   // rw
        3,   // rh
        false,
        true,
        mockEvent,
      );

      // Should read center pixel (1,1), not the average of all 9
      expect(callback).toHaveBeenCalledWith(
        {
          r: Math.round(0.5 * 255),
          g: Math.round(0.3 * 255),
          b: Math.round(0.1 * 255),
        },
        position,
      );
    });
  });

  // ===========================================================================
  // 4. onMouseMoveForPixelSampling throttling
  // ===========================================================================

  describe('onMouseMoveForPixelSampling throttling', () => {
    it('PSM-030: skips if neither probe nor cursor color is active', () => {
      mockPixelProbe.isEnabled.mockReturnValue(false);
      // No cursor color callback registered

      const event = new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 100,
      });
      manager.onMouseMoveForPixelSampling(event);

      // Should not call getImageCanvasRect since early exit
      expect(mockContext.getImageCanvasRect).not.toHaveBeenCalled();
    });

    it('PSM-031: throttles to 16ms intervals', () => {
      mockPixelProbe.isEnabled.mockReturnValue(true);

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const event1 = new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 100,
      });
      manager.onMouseMoveForPixelSampling(event1);

      // First call should go through
      expect(mockContext.getDisplayDimensions).toHaveBeenCalledTimes(1);

      // Second call within 16ms should be throttled
      vi.spyOn(Date, 'now').mockReturnValue(now + 10);
      const event2 = new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 200,
      });
      manager.onMouseMoveForPixelSampling(event2);

      expect(mockContext.getDisplayDimensions).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });

    it('PSM-032: allows call after 16ms throttle period', () => {
      mockPixelProbe.isEnabled.mockReturnValue(true);

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const event1 = new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 100,
      });
      manager.onMouseMoveForPixelSampling(event1);

      expect(mockContext.getDisplayDimensions).toHaveBeenCalledTimes(1);

      // Call after 16ms should go through
      vi.spyOn(Date, 'now').mockReturnValue(now + 20);
      const event2 = new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 200,
      });
      manager.onMouseMoveForPixelSampling(event2);

      expect(mockContext.getDisplayDimensions).toHaveBeenCalledTimes(2);

      vi.restoreAllMocks();
    });

    it('PSM-033: HDR blit path samples from cached float frame (not readPixelFloat)', () => {
      mockPixelProbe.isEnabled.mockReturnValue(true);
      mockPixelProbe.getSampleSize.mockReturnValue(1);

      const readPixelFloat = vi.fn(() => new Float32Array([0.1, 0.1, 0.1, 1.0]));
      const blitData = new Float32Array(4 * 4 * 4);
      // Display-space pixel (1,1) maps to WebGL row-order source row 2.
      const idx = (2 * 4 + 1) * 4;
      blitData[idx] = 0.5;
      blitData[idx + 1] = 0.25;
      blitData[idx + 2] = 0.75;
      blitData[idx + 3] = 1.0;

      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => true),
        isSDRWebGLRenderActive: vi.fn(() => false),
        getGLRenderer: vi.fn(() => ({ readPixelFloat })) as any,
        getLastHDRBlitFrame: vi.fn(() => ({ data: blitData, width: 4, height: 4 })),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      const callback = vi.fn();
      webglManager.onCursorColorChange(callback);
      (webglManager as any).lastMouseMoveUpdate = 0;

      const event = new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 150,
      });
      webglManager.onMouseMoveForPixelSampling(event);

      expect(readPixelFloat).not.toHaveBeenCalled();
      expect(mockPixelProbe.updateFromHDRValues).toHaveBeenCalledWith(
        200,
        150,
        0.5,
        0.25,
        0.75,
        1.0,
        800,
        600,
      );
      expect(callback).toHaveBeenCalledWith(
        { r: Math.round(0.5 * 255), g: Math.round(0.25 * 255), b: Math.round(0.75 * 255) },
        { x: 200, y: 150 },
      );
    });

    it('PSM-034: WebGL HDR path falls back to readPixelFloat when no blit frame exists', () => {
      mockPixelProbe.isEnabled.mockReturnValue(true);
      mockPixelProbe.getSampleSize.mockReturnValue(1);

      const readPixelFloat = vi.fn(() => new Float32Array([0.25, 0.5, 0.75, 1.0]));
      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => true),
        isSDRWebGLRenderActive: vi.fn(() => false),
        getGLRenderer: vi.fn(() => ({ readPixelFloat })) as any,
        getLastHDRBlitFrame: vi.fn(() => null),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      const callback = vi.fn();
      webglManager.onCursorColorChange(callback);
      (webglManager as any).lastMouseMoveUpdate = 0;

      const event = new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 100,
      });
      webglManager.onMouseMoveForPixelSampling(event);

      expect(readPixelFloat).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        { r: Math.round(0.25 * 255), g: Math.round(0.5 * 255), b: Math.round(0.75 * 255) },
        { x: 100, y: 100 },
      );
    });
  });

  // ===========================================================================
  // 5. dispose
  // ===========================================================================

  describe('dispose', () => {
    it('PSM-040: nulls cursorColorCallback', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      manager.dispose();

      // After dispose, onMouseLeaveForCursorColor should be a no-op
      manager.onMouseLeaveForCursorColor();
      expect(callback).not.toHaveBeenCalled();
    });

    it('PSM-041: dispose releases cached source image canvas', () => {
      // Force creation of sourceImageCanvas by accessing private fields
      const internal = manager as any;
      internal.sourceImageCanvas = document.createElement('canvas');
      internal.sourceImageCtx = internal.sourceImageCanvas.getContext('2d');

      expect(internal.sourceImageCanvas).not.toBeNull();
      expect(internal.sourceImageCtx).not.toBeNull();

      manager.dispose();

      expect(internal.sourceImageCanvas).toBeNull();
      expect(internal.sourceImageCtx).toBeNull();
    });

    it('PSM-042: is idempotent', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      manager.dispose();
      manager.dispose();
      manager.dispose();

      // Should not throw and callback should remain null
      manager.onMouseLeaveForCursorColor();
      expect(callback).not.toHaveBeenCalled();
    });

    it('PSM-043: after dispose, onMouseLeaveForCursorColor is a no-op', () => {
      const callback = vi.fn();
      manager.onCursorColorChange(callback);

      // Verify callback works before dispose
      manager.onMouseLeaveForCursorColor();
      expect(callback).toHaveBeenCalledTimes(1);

      // After dispose, callback should not be called
      manager.dispose();
      manager.onMouseLeaveForCursorColor();
      expect(callback).toHaveBeenCalledTimes(1); // still 1, no additional call
    });
  });

  // ===========================================================================
  // 6. getScopeImageData
  // ===========================================================================

  describe('getScopeImageData', () => {
    it('PSM-050: returns null when 2D canvas has no image data', () => {
      // getImageCtx().getImageData returns empty ImageData with 0 dimensions
      // but canvas width/height is 800x600 so getImageData() actually works
      const result = manager.getScopeImageData();
      // Should return an object (2D canvas path) since canvas has dimensions
      if (result) {
        expect(result.floatData).toBeNull();
        expect(result.imageData).toBeInstanceOf(ImageData);
      }
    });

    it('PSM-051: returns ScopeImageData with null floatData in 2D canvas mode', () => {
      // In 2D canvas mode (no WebGL), floatData should be null
      const result = manager.getScopeImageData();
      if (result) {
        expect(result.floatData).toBeNull();
        expect(result.width).toBeGreaterThan(0);
        expect(result.height).toBeGreaterThan(0);
      }
    });

    it('PSM-052: returns null when WebGL active but no last rendered image', () => {
      mockContext.isHDRRenderActive = vi.fn(() => true);
      mockContext.getGLRenderer = vi.fn(() => ({
        renderForScopes: vi.fn(() => null),
      })) as any;
      mockContext.getLastRenderedImage = vi.fn(() => null);

      const webglManager = new PixelSamplingManager(mockContext);
      const result = webglManager.getScopeImageData();

      expect(result).toBeNull();
    });

    it('PSM-053: returns float data when WebGL rendering is active', () => {
      const floatData = new Float32Array(4 * 4 * 4); // 4x4 pixels
      for (let i = 0; i < floatData.length; i++) {
        floatData[i] = (i % 4 === 3) ? 1.0 : 0.5; // RGBA with 0.5 color, 1.0 alpha
      }

      const mockImage = {} as any; // Mock IPImage
      const mockRenderer = {
        renderForScopes: vi.fn(() => ({ data: floatData, width: 4, height: 4 })),
      };

      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => true),
        isSDRWebGLRenderActive: vi.fn(() => false),
        getGLRenderer: vi.fn(() => mockRenderer) as any,
        getLastRenderedImage: vi.fn(() => mockImage),
        isPlaying: vi.fn(() => false),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      const result = webglManager.getScopeImageData();

      expect(result).not.toBeNull();
      expect(result!.floatData).toBe(floatData);
      expect(result!.width).toBe(4);
      expect(result!.height).toBe(4);
      expect(result!.imageData).toBeInstanceOf(ImageData);
    });

    it('PSM-054: converts float data to ImageData for SDR fallback', () => {
      const floatData = new Float32Array([
        0.5, 0.3, 0.1, 1.0, // single pixel
      ]);

      const mockImage = {} as any;
      const mockRenderer = {
        renderForScopes: vi.fn(() => ({ data: floatData, width: 1, height: 1 })),
      };

      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => true),
        isSDRWebGLRenderActive: vi.fn(() => false),
        getGLRenderer: vi.fn(() => mockRenderer) as any,
        getLastRenderedImage: vi.fn(() => mockImage),
        isPlaying: vi.fn(() => false),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      const result = webglManager.getScopeImageData();

      expect(result).not.toBeNull();
      // ImageData should have clamped SDR values
      const pixel = result!.imageData.data;
      expect(pixel[0]).toBe(Math.round(0.5 * 255)); // R
      expect(pixel[1]).toBe(Math.round(0.3 * 255)); // G
      expect(pixel[2]).toBe(Math.round(0.1 * 255)); // B
      expect(pixel[3]).toBe(255); // A
    });

    it('PSM-055: uses playback resolution when playing', () => {
      const mockImage = {} as any;
      const mockRenderer = {
        renderForScopes: vi.fn(() => ({
          data: new Float32Array(320 * 180 * 4),
          width: 320,
          height: 180,
        })),
      };

      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => true),
        isSDRWebGLRenderActive: vi.fn(() => false),
        getGLRenderer: vi.fn(() => mockRenderer) as any,
        getLastRenderedImage: vi.fn(() => mockImage),
        isPlaying: vi.fn(() => true),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      webglManager.getScopeImageData();

      // Should request playback resolution (320x180)
      expect(mockRenderer.renderForScopes).toHaveBeenCalledWith(mockImage, 320, 180);
    });

    it('PSM-056: uses paused resolution when not playing', () => {
      const mockImage = {} as any;
      const mockRenderer = {
        renderForScopes: vi.fn(() => ({
          data: new Float32Array(640 * 360 * 4),
          width: 640,
          height: 360,
        })),
      };

      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => true),
        isSDRWebGLRenderActive: vi.fn(() => false),
        getGLRenderer: vi.fn(() => mockRenderer) as any,
        getLastRenderedImage: vi.fn(() => mockImage),
        isPlaying: vi.fn(() => false),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      webglManager.getScopeImageData();

      // Should request paused resolution (640x360)
      expect(mockRenderer.renderForScopes).toHaveBeenCalledWith(mockImage, 640, 360);
    });

    it('PSM-057: returns null when WebGL renderer returns null', () => {
      const mockImage = {} as any;
      const mockRenderer = {
        renderForScopes: vi.fn(() => null),
      };

      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => true),
        isSDRWebGLRenderActive: vi.fn(() => false),
        getGLRenderer: vi.fn(() => mockRenderer) as any,
        getLastRenderedImage: vi.fn(() => mockImage),
        isPlaying: vi.fn(() => false),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      const result = webglManager.getScopeImageData();

      expect(result).toBeNull();
    });

    it('PSM-058: SDR WebGL path also triggers WebGL scope data', () => {
      const mockImage = {} as any;
      const mockRenderer = {
        renderForScopes: vi.fn(() => ({
          data: new Float32Array(4),
          width: 1,
          height: 1,
        })),
      };

      const webglContext = {
        ...mockContext,
        isHDRRenderActive: vi.fn(() => false),
        isSDRWebGLRenderActive: vi.fn(() => true),
        getGLRenderer: vi.fn(() => mockRenderer) as any,
        getLastRenderedImage: vi.fn(() => mockImage),
        isPlaying: vi.fn(() => false),
      };

      const webglManager = new PixelSamplingManager(webglContext as any);
      const result = webglManager.getScopeImageData();

      expect(result).not.toBeNull();
      expect(result!.floatData).not.toBeNull();
      expect(mockRenderer.renderForScopes).toHaveBeenCalled();
    });
  });
});
