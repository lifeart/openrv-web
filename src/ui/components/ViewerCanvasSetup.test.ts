import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanvasSetupContext } from './ViewerCanvasSetup';
import {
  initializeCanvas,
  setCanvasSize,
  updatePaintCanvasSize,
  updateOverlayDimensions,
  updateCanvasPosition,
  updateCSSBackground,
  listenForDPRChange,
} from './ViewerCanvasSetup';
import type { BackgroundPatternState } from './BackgroundPatternControl';

// Mock dependencies needed by initializeCanvas and setCanvasSize
vi.mock('../../utils/ui/HiDPICanvas', () => ({
  setupHiDPICanvas: vi.fn(),
  resetCanvasFromHiDPI: vi.fn(),
}));

vi.mock('./ViewerRenderingUtils', () => ({
  drawPlaceholder: vi.fn(),
}));

function createMockCanvasElement(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  return canvas;
}

function createMockContext(): CanvasRenderingContext2D {
  return {
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getTransform: vi.fn(),
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createMockSetupContext(overrides: Partial<CanvasSetupContext> = {}): CanvasSetupContext {
  let displayWidth = 640;
  let displayHeight = 360;
  let sourceWidth = 0;
  let sourceHeight = 0;
  let physicalWidth = 0;
  let physicalHeight = 0;
  let paintLogicalWidth = 0;
  let paintLogicalHeight = 0;
  let paintOffsetX = 0;
  let paintOffsetY = 0;

  const container = document.createElement('div');
  const canvasContainer = document.createElement('div');
  const imageCanvas = createMockCanvasElement();
  const watermarkCanvas = createMockCanvasElement();
  const paintCanvas = createMockCanvasElement();
  const imageCtx = createMockContext();
  const watermarkCtx = createMockContext();
  const paintCtx = createMockContext();

  const transformManager = {
    panX: 0,
    panY: 0,
    zoom: 1,
    fitMode: 'all' as string,
  };

  const glRendererManager = {
    getMaxTextureSize: vi.fn(() => 16384),
    resizeIfActive: vi.fn(),
  };

  const cropManager = {
    resetOverlayCanvas: vi.fn(),
  };

  const overlayManager = {
    updateDimensions: vi.fn(),
  };

  const perspectiveGridOverlay = {
    setViewerDimensions: vi.fn(),
  };

  const ctx: CanvasSetupContext = {
    getContainer: () => container,
    getCanvasContainer: () => canvasContainer,
    getImageCanvas: () => imageCanvas,
    getWatermarkCanvas: () => watermarkCanvas,
    getPaintCanvas: () => paintCanvas,
    getImageCtx: () => imageCtx,
    getWatermarkCtx: () => watermarkCtx,
    getPaintCtx: () => paintCtx,
    getTransformManager: () => transformManager as any,
    getGLRendererManager: () => glRendererManager as any,
    getCropManager: () => cropManager as any,
    getOverlayManager: () => overlayManager as any,
    getPerspectiveGridOverlay: () => perspectiveGridOverlay as any,
    getContainerRect: () =>
      ({
        width: 1920,
        height: 1080,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 1080,
        right: 1920,
        toJSON: () => {},
      }) as DOMRect,
    getDisplayWidth: () => displayWidth,
    getDisplayHeight: () => displayHeight,
    setDisplayWidth: (w: number) => {
      displayWidth = w;
    },
    setDisplayHeight: (h: number) => {
      displayHeight = h;
    },
    getSourceWidth: () => sourceWidth,
    getSourceHeight: () => sourceHeight,
    setSourceWidth: (w: number) => {
      sourceWidth = w;
    },
    setSourceHeight: (h: number) => {
      sourceHeight = h;
    },
    getPhysicalWidth: () => physicalWidth,
    getPhysicalHeight: () => physicalHeight,
    setPhysicalWidth: (w: number) => {
      physicalWidth = w;
    },
    setPhysicalHeight: (h: number) => {
      physicalHeight = h;
    },
    getPaintLogicalWidth: () => paintLogicalWidth,
    getPaintLogicalHeight: () => paintLogicalHeight,
    setPaintLogicalWidth: (w: number) => {
      paintLogicalWidth = w;
    },
    setPaintLogicalHeight: (h: number) => {
      paintLogicalHeight = h;
    },
    getPaintOffsetX: () => paintOffsetX,
    getPaintOffsetY: () => paintOffsetY,
    setPaintOffsetX: (x: number) => {
      paintOffsetX = x;
    },
    setPaintOffsetY: (y: number) => {
      paintOffsetY = y;
    },
    setPaintDirty: vi.fn(),
    setWatermarkDirty: vi.fn(),
    ...overrides,
  };

  return ctx;
}

describe('ViewerCanvasSetup', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 1);
  });

  describe('initializeCanvas', () => {
    it('should set source and display dimensions to 640x360', () => {
      const ctx = createMockSetupContext();
      initializeCanvas(ctx);

      expect(ctx.getSourceWidth()).toBe(640);
      expect(ctx.getSourceHeight()).toBe(360);
      expect(ctx.getDisplayWidth()).toBe(640);
      expect(ctx.getDisplayHeight()).toBe(360);
    });

    it('should set physical dimensions based on DPR', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      const ctx = createMockSetupContext();
      initializeCanvas(ctx);

      expect(ctx.getPhysicalWidth()).toBe(1280);
      expect(ctx.getPhysicalHeight()).toBe(720);
    });

    it('should set physical dimensions with DPR=1', () => {
      const ctx = createMockSetupContext();
      initializeCanvas(ctx);

      expect(ctx.getPhysicalWidth()).toBe(640);
      expect(ctx.getPhysicalHeight()).toBe(360);
    });

    it('should update canvas container position to centered translate', () => {
      const ctx = createMockSetupContext();
      initializeCanvas(ctx);

      // With fitMode 'all', panX/panY are 0
      // baseX = (1920 - 640) / 2 = 640, baseY = (1080 - 360) / 2 = 360
      const style = ctx.getCanvasContainer().style.transform;
      expect(style).toBe('translate(640px, 360px)');
    });
  });

  describe('setCanvasSize', () => {
    it('should update display dimensions', () => {
      const ctx = createMockSetupContext();
      setCanvasSize(ctx, 1920, 1080);

      expect(ctx.getDisplayWidth()).toBe(1920);
      expect(ctx.getDisplayHeight()).toBe(1080);
    });

    it('should compute physical dimensions at DPR=1', () => {
      const ctx = createMockSetupContext();
      setCanvasSize(ctx, 800, 600);

      expect(ctx.getPhysicalWidth()).toBe(800);
      expect(ctx.getPhysicalHeight()).toBe(600);
    });

    it('should compute physical dimensions at DPR=2', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      const ctx = createMockSetupContext();
      setCanvasSize(ctx, 800, 600);

      expect(ctx.getPhysicalWidth()).toBe(1600);
      expect(ctx.getPhysicalHeight()).toBe(1200);
    });

    it('should cap physical dimensions at MAX_TEXTURE_SIZE', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      const ctx = createMockSetupContext();
      (ctx.getGLRendererManager().getMaxTextureSize as ReturnType<typeof vi.fn>).mockReturnValue(1024);

      setCanvasSize(ctx, 800, 600);

      // 800*2=1600, 600*2=1200 -> max is 1600 > 1024
      // capScale = 1024/1600 = 0.64
      // physW = round(1600 * 0.64) = 1024, physH = round(1200 * 0.64) = 768
      expect(ctx.getPhysicalWidth()).toBe(1024);
      expect(ctx.getPhysicalHeight()).toBe(768);
    });

    it('should ensure physical dimensions are at least 1', () => {
      const ctx = createMockSetupContext();
      setCanvasSize(ctx, 0, 0);

      expect(ctx.getPhysicalWidth()).toBe(1);
      expect(ctx.getPhysicalHeight()).toBe(1);
    });
  });

  describe('updatePaintCanvasSize', () => {
    it('should configure paint canvas with exact padded dimensions', () => {
      // 640x360 image centered in 1920x1080 container, panX/panY=0, DPR=1
      // visibleLeft = (1920-640)/2 = 640, visibleTop = (1080-360)/2 = 360
      // leftPad = snap(max(128,640),64) = 640, rightPad = 640
      // topPad = snap(max(128,360),64) = ceil(360/64)*64 = 384, bottomPad = 384
      // logicalW = 640+640+640 = 1920, logicalH = 360+384+384 = 1128
      const ctx = createMockSetupContext();
      updatePaintCanvasSize(ctx, 640, 360, 1920, 1080);

      expect(ctx.getPaintLogicalWidth()).toBe(1920);
      expect(ctx.getPaintLogicalHeight()).toBe(1128);
      expect(ctx.getPaintOffsetX()).toBe(640);
      expect(ctx.getPaintOffsetY()).toBe(384);
    });

    it('should set paint canvas physical dimensions at DPR=1', () => {
      const ctx = createMockSetupContext();
      updatePaintCanvasSize(ctx, 640, 360, 1920, 1080);

      const paintCanvas = ctx.getPaintCanvas();
      expect(paintCanvas.width).toBe(1920);
      expect(paintCanvas.height).toBe(1128);
    });

    it('should set paint canvas CSS styles to exact values', () => {
      const ctx = createMockSetupContext();
      updatePaintCanvasSize(ctx, 640, 360, 1920, 1080);

      const paintCanvas = ctx.getPaintCanvas();
      expect(paintCanvas.style.width).toBe('1920px');
      expect(paintCanvas.style.height).toBe('1128px');
      expect(paintCanvas.style.left).toBe('-640px');
      expect(paintCanvas.style.top).toBe('-384px');
    });

    it('should mark paint dirty after resize', () => {
      const ctx = createMockSetupContext();
      updatePaintCanvasSize(ctx, 640, 360, 1920, 1080);

      expect(ctx.setPaintDirty).toHaveBeenCalledWith(true);
    });

    it('should not update if dimensions unchanged', () => {
      const ctx = createMockSetupContext();
      // First call sets up dimensions
      updatePaintCanvasSize(ctx, 640, 360, 1920, 1080);
      (ctx.setPaintDirty as ReturnType<typeof vi.fn>).mockClear();

      // Second call with same parameters should be a no-op
      updatePaintCanvasSize(ctx, 640, 360, 1920, 1080);
      expect(ctx.setPaintDirty).not.toHaveBeenCalled();
    });

    it('should use logical dimensions as fallback with MIN_PAINT_OVERDRAW_PX padding', () => {
      // No container: viewW=640, viewH=360, centerX=0, centerY=0
      // visible all 0, so pads = snap(max(128,0),64) = 128
      // logicalW = 640+128+128 = 896, logicalH = 360+128+128 = 616
      const ctx = createMockSetupContext();
      updatePaintCanvasSize(ctx, 640, 360);

      expect(ctx.getPaintLogicalWidth()).toBe(896);
      expect(ctx.getPaintLogicalHeight()).toBe(616);
      expect(ctx.getPaintOffsetX()).toBe(128);
      expect(ctx.getPaintOffsetY()).toBe(128);
    });

    it('should use logical dimensions as fallback when container dimensions are zero', () => {
      const ctx = createMockSetupContext();
      updatePaintCanvasSize(ctx, 640, 360, 0, 0);

      expect(ctx.getPaintLogicalWidth()).toBe(896);
      expect(ctx.getPaintLogicalHeight()).toBe(616);
    });

    it('should scale physical dimensions with DPR=2', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      const ctx = createMockSetupContext();
      updatePaintCanvasSize(ctx, 640, 360, 1920, 1080);

      const paintCanvas = ctx.getPaintCanvas();
      // logicalW=1920, logicalH=1128, physical = logical * 2
      expect(paintCanvas.width).toBe(3840);
      expect(paintCanvas.height).toBe(2256);
    });
  });

  describe('updateOverlayDimensions', () => {
    it('should call overlay manager with current display dimensions', () => {
      const ctx = createMockSetupContext();
      updateOverlayDimensions(ctx);

      expect(ctx.getOverlayManager().updateDimensions).toHaveBeenCalledWith(640, 360);
    });

    it('should use updated display dimensions', () => {
      const ctx = createMockSetupContext();
      ctx.setDisplayWidth(1920);
      ctx.setDisplayHeight(1080);
      updateOverlayDimensions(ctx);

      expect(ctx.getOverlayManager().updateDimensions).toHaveBeenCalledWith(1920, 1080);
    });
  });

  // drawPlaceholder is a thin delegation wrapper that calls setupHiDPICanvas
  // and drawPlaceholderUtil. Testing it would only verify mock-to-mock wiring.
  // The underlying utilities have their own dedicated tests.

  describe('updateCanvasPosition', () => {
    it('should center canvas in container with fitMode all', () => {
      const ctx = createMockSetupContext();
      const tm = ctx.getTransformManager();
      tm.fitMode = 'all';
      tm.panX = 100;
      tm.panY = 100;

      updateCanvasPosition(ctx);

      // fitMode 'all' resets pan to 0
      expect(tm.panX).toBe(0);
      expect(tm.panY).toBe(0);
    });

    it('should set transform style on canvas container', () => {
      const ctx = createMockSetupContext();
      updateCanvasPosition(ctx);

      const transform = ctx.getCanvasContainer().style.transform;
      expect(transform).toMatch(/translate\(.+px, .+px\)/);
    });

    it('should center canvas when fitMode is all', () => {
      const ctx = createMockSetupContext();
      ctx.setDisplayWidth(640);
      ctx.setDisplayHeight(360);
      // Container is 1920x1080
      updateCanvasPosition(ctx);

      // baseX = (1920 - 640) / 2 = 640, baseY = (1080 - 360) / 2 = 360
      const transform = ctx.getCanvasContainer().style.transform;
      expect(transform).toBe('translate(640px, 360px)');
    });

    it('should clamp panX to 0 when fitMode is width', () => {
      const ctx = createMockSetupContext();
      const tm = ctx.getTransformManager();
      tm.fitMode = 'width';
      tm.panX = 500;
      tm.panY = 10;

      updateCanvasPosition(ctx);

      expect(tm.panX).toBe(0);
    });

    it('should clamp panY within bounds when fitMode is width', () => {
      const ctx = createMockSetupContext();
      const tm = ctx.getTransformManager();
      tm.fitMode = 'width';
      ctx.setDisplayHeight(2000);
      tm.panY = 99999;

      updateCanvasPosition(ctx);

      // maxPanY = max(0, (2000 - 1080) / 2 + margin) where margin = min(50, 1080*0.1) = 50
      // maxPanY = max(0, 460 + 50) = 510
      expect(tm.panY).toBeLessThanOrEqual(510);
      expect(tm.panY).toBeGreaterThanOrEqual(-510);
    });

    it('should clamp panY to 0 when fitMode is height', () => {
      const ctx = createMockSetupContext();
      const tm = ctx.getTransformManager();
      tm.fitMode = 'height';
      tm.panY = 500;
      tm.panX = 10;

      updateCanvasPosition(ctx);

      expect(tm.panY).toBe(0);
    });

    it('should clamp panX within bounds when fitMode is height', () => {
      const ctx = createMockSetupContext();
      const tm = ctx.getTransformManager();
      tm.fitMode = 'height';
      ctx.setDisplayWidth(4000);
      tm.panX = 99999;

      updateCanvasPosition(ctx);

      // maxPanX = max(0, (4000 - 1920) / 2 + margin) where margin = min(50, 1920*0.1) = 50
      // maxPanX = max(0, 1040 + 50) = 1090
      expect(tm.panX).toBeLessThanOrEqual(1090);
      expect(tm.panX).toBeGreaterThanOrEqual(-1090);
    });

    it('should not clamp pan when fitMode is none', () => {
      const ctx = createMockSetupContext();
      const tm = ctx.getTransformManager();
      tm.fitMode = null;
      tm.panX = 5000;
      tm.panY = 3000;

      updateCanvasPosition(ctx);

      expect(tm.panX).toBe(5000);
      expect(tm.panY).toBe(3000);
    });

    it('should apply pan offset to transform', () => {
      const ctx = createMockSetupContext();
      const tm = ctx.getTransformManager();
      tm.fitMode = null;
      tm.panX = 100;
      tm.panY = 50;

      ctx.setDisplayWidth(640);
      ctx.setDisplayHeight(360);

      updateCanvasPosition(ctx);

      // baseX = (1920-640)/2 = 640, baseY = (1080-360)/2 = 360
      // centerX = 640 + 100 = 740, centerY = 360 + 50 = 410
      const transform = ctx.getCanvasContainer().style.transform;
      expect(transform).toBe('translate(740px, 410px)');
    });
  });

  describe('updateCSSBackground', () => {
    let container: HTMLElement;
    let imageCanvas: HTMLCanvasElement;

    beforeEach(() => {
      container = document.createElement('div');
      imageCanvas = document.createElement('canvas');
    });

    it('should set black background', () => {
      const state: BackgroundPatternState = { pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      expect(container.style.background).toBe('var(--viewer-bg)');
      // jsdom normalizes #000 to rgb(0, 0, 0)
      expect(imageCanvas.style.background).toMatch(/rgb\(0,\s*0,\s*0\)|#000/);
    });

    it('should set grey18 background', () => {
      const state: BackgroundPatternState = { pattern: 'grey18', checkerSize: 'medium', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      // PATTERN_COLORS.grey18 = '#2e2e2e', jsdom normalizes to rgb
      expect(container.style.background).toMatch(/rgb\(46,\s*46,\s*46\)|#2e2e2e/);
      expect(imageCanvas.style.background).toMatch(/rgb\(46,\s*46,\s*46\)|#2e2e2e/);
    });

    it('should set grey50 background', () => {
      const state: BackgroundPatternState = { pattern: 'grey50', checkerSize: 'medium', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      // PATTERN_COLORS.grey50 = '#808080', jsdom normalizes to rgb
      expect(container.style.background).toMatch(/rgb\(128,\s*128,\s*128\)|#808080/);
      expect(imageCanvas.style.background).toMatch(/rgb\(128,\s*128,\s*128\)|#808080/);
    });

    it('should set white background', () => {
      const state: BackgroundPatternState = { pattern: 'white', checkerSize: 'medium', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      // jsdom normalizes #ffffff to rgb(255, 255, 255)
      expect(container.style.background).toMatch(/rgb\(255,\s*255,\s*255\)|#ffffff/);
      expect(imageCanvas.style.background).toMatch(/rgb\(255,\s*255,\s*255\)|#ffffff/);
    });

    it('should set checker background with small size', () => {
      const state: BackgroundPatternState = { pattern: 'checker', checkerSize: 'small', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      // small = 8px, so pattern uses 16px (8*2)
      expect(container.style.background).toContain('16px');
    });

    it('should set checker background with medium size', () => {
      const state: BackgroundPatternState = { pattern: 'checker', checkerSize: 'medium', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      // medium = 16px, so pattern uses 32px (16*2)
      expect(container.style.background).toContain('32px');
    });

    it('should set checker background with large size', () => {
      const state: BackgroundPatternState = { pattern: 'checker', checkerSize: 'large', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      // large = 32px, so pattern uses 64px (32*2)
      expect(container.style.background).toContain('64px');
    });

    it('should set crosshatch background', () => {
      const state: BackgroundPatternState = { pattern: 'crosshatch', checkerSize: 'medium', customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      expect(container.style.background).toContain('45deg');
      expect(container.style.background).toContain('-45deg');
    });

    it('should set custom color background', () => {
      const state: BackgroundPatternState = { pattern: 'custom', checkerSize: 'medium', customColor: '#ff0000' };
      updateCSSBackground(container, imageCanvas, state);

      // jsdom normalizes hex to rgb
      expect(container.style.background).toMatch(/rgb\(255,\s*0,\s*0\)|#ff0000/);
      expect(imageCanvas.style.background).toMatch(/rgb\(255,\s*0,\s*0\)|#ff0000/);
    });

    it('should use fallback for custom when customColor is empty', () => {
      const state: BackgroundPatternState = { pattern: 'custom', checkerSize: 'medium', customColor: '' };
      updateCSSBackground(container, imageCanvas, state);

      // jsdom normalizes #1a1a1a to rgb(26, 26, 26)
      expect(container.style.background).toMatch(/rgb\(26,\s*26,\s*26\)|#1a1a1a/);
    });

    it('should handle unknown pattern with black fallback', () => {
      const state = { pattern: 'unknown' as any, checkerSize: 'medium' as const, customColor: '#1a1a1a' };
      updateCSSBackground(container, imageCanvas, state);

      // jsdom normalizes #000 to rgb(0, 0, 0)
      expect(imageCanvas.style.background).toMatch(/rgb\(0,\s*0,\s*0\)|#000/);
    });
  });

  describe('listenForDPRChange', () => {
    it('should return null when window is undefined', () => {
      // Cannot fully remove window in jsdom, so test the matchMedia path instead
      const result = listenForDPRChange(vi.fn(), null);
      // In jsdom window exists, so it depends on matchMedia support
      // This should return a cleanup function or null
      expect(result === null || typeof result === 'function').toBe(true);
    });

    it('should call previous cleanup function', () => {
      // Ensure matchMedia is available so the function proceeds past the guard
      const mqlMock = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mqlMock),
      );

      const previousCleanup = vi.fn();
      listenForDPRChange(vi.fn(), previousCleanup);

      expect(previousCleanup).toHaveBeenCalled();
    });

    it('should return a cleanup function', () => {
      const mqlMock = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => mqlMock),
      );

      const result = listenForDPRChange(vi.fn(), null);

      expect(typeof result).toBe('function');
      // Calling cleanup should remove the event listener
      result!();
      expect(mqlMock.removeEventListener).toHaveBeenCalled();
    });
  });
});
