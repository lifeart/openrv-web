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
});
