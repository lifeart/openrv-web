/**
 * ViewerImageRenderer Unit Tests
 *
 * Tests for rendering dispatch functions: renderWithWipe, renderSplitScreen,
 * drawClippedSource, renderGhostFrames, renderBlendMode, renderDifferenceMatte,
 * compositeStackLayers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImageRendererContext } from './ViewerImageRenderer';
import {
  renderWithWipe,
  renderSplitScreen,
  drawClippedSource,
  renderGhostFrames,
  renderSourceToImageData,
  renderBlendMode,
  renderDifferenceMatte,
  compositeStackLayers,
} from './ViewerImageRenderer';

// ---------------------------------------------------------------------------
// Mock canvas context
// ---------------------------------------------------------------------------
function createMockCanvasCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    filter: 'none',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high' as ImageSmoothingQuality,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    canvas: document.createElement('canvas'),
    getImageData: vi.fn(() => new ImageData(1, 1)),
    putImageData: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// ---------------------------------------------------------------------------
// Mock element (used as CanvasImageSource)
// ---------------------------------------------------------------------------
function createMockElement(): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = 100;
  el.height = 100;
  return el;
}

// ---------------------------------------------------------------------------
// Mock ImageRendererContext
// ---------------------------------------------------------------------------
function createMockContext(overrides: Partial<ImageRendererContext> = {}): ImageRendererContext {
  const imageCtx = createMockCanvasCtx();
  return {
    getSession: vi.fn(() => ({
      currentSource: null,
      sourceA: null,
      sourceB: null,
      sourceAIndex: 0,
      sourceBIndex: 1,
      currentFrame: 1,
    })) as any,
    getImageCtx: vi.fn(() => imageCtx),
    getWipeManager: vi.fn(() => ({
      computeStencilBoxes: vi.fn(() => [
        [0, 0.5, 0, 1],
        [0.5, 1, 0, 1],
      ]),
      position: 0.5,
      mode: 'splitscreen-h' as const,
    })),
    getGhostFrameManager: vi.fn(() => ({
      state: {
        enabled: false,
        framesBefore: 0,
        framesAfter: 0,
        opacityBase: 0.5,
        opacityFalloff: 0.7,
        colorTint: false,
      },
      getPoolCanvas: vi.fn(),
      trimPool: vi.fn(),
    })),
    getTransform: vi.fn(() => ({ x: 0, y: 0, scale: 1, rotation: 0 })),
    getTextureFilterMode: vi.fn(() => 'linear' as const),
    getCanvasFilterString: vi.fn(() => 'none'),
    getStackLayers: vi.fn(() => []),
    isStackEnabled: vi.fn(() => false),
    isBlendModeEnabled: vi.fn(() => false),
    getBlendModeState: vi.fn(() => ({
      mode: 'off' as const,
      onionOpacity: 0.5,
      flickerRate: 4,
      blendRatio: 0.5,
      flickerFrame: 0 as 0 | 1,
    })),
    getDifferenceMatteState: vi.fn(() => ({
      enabled: false,
      gain: 1.0,
      heatmap: false,
    })),
    getPrerenderBuffer: vi.fn(() => null),
    getFrameFetchTracker: vi.fn(() => ({
      lastSourceBFrameCanvas: null,
      hasDisplayedSourceBMediabunnyFrame: false,
      pendingSourceBFrameFetch: null,
      pendingSourceBFrameNumber: 0,
    })),
    getFrameInterpolator: vi.fn(() => ({})),
    getCanvasColorSpace: vi.fn(() => undefined),
    getDisplayWidth: vi.fn(() => 800),
    getDisplayHeight: vi.fn(() => 600),
    drawWithTransform: vi.fn(),
    renderSourceToImageData: vi.fn(() => null),
    drawClippedSource: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

// =========================================================================
// renderWithWipe
// =========================================================================
describe('renderWithWipe', () => {
  let ctx: ImageRendererContext;
  let imageCtx: CanvasRenderingContext2D;
  let element: HTMLCanvasElement;

  beforeEach(() => {
    ctx = createMockContext();
    imageCtx = ctx.getImageCtx();
    element = createMockElement();
  });

  it('should set imageSmoothingEnabled to true when filter mode is linear', () => {
    renderWithWipe(ctx, element, 800, 600);
    expect(imageCtx.imageSmoothingEnabled).toBe(true);
  });

  it('should set imageSmoothingEnabled to false when filter mode is nearest', () => {
    (ctx.getTextureFilterMode as ReturnType<typeof vi.fn>).mockReturnValue('nearest');
    renderWithWipe(ctx, element, 800, 600);
    expect(imageCtx.imageSmoothingEnabled).toBe(false);
  });

  it('should call save/restore for outer and two inner clip regions in proper nesting order', () => {
    const callOrder: string[] = [];
    (imageCtx.save as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('save'));
    (imageCtx.restore as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('restore'));

    renderWithWipe(ctx, element, 800, 600);

    // 1 outer save + 2 inner saves = 3 saves, 3 restores
    expect(imageCtx.save).toHaveBeenCalledTimes(3);
    expect(imageCtx.restore).toHaveBeenCalledTimes(3);
    // Verify proper nesting: outer save, inner save/restore for boxA, inner save/restore for boxB, outer restore
    expect(callOrder).toEqual(['save', 'save', 'restore', 'save', 'restore', 'restore']);
  });

  it('should call beginPath and clip for both stencil boxes', () => {
    renderWithWipe(ctx, element, 800, 600);
    expect(imageCtx.beginPath).toHaveBeenCalledTimes(2);
    expect(imageCtx.clip).toHaveBeenCalledTimes(2);
  });

  it('should draw the original region with filter=none', () => {
    renderWithWipe(ctx, element, 800, 600);
    expect(ctx.drawWithTransform).toHaveBeenCalledTimes(2);
  });

  it('should apply canvas filter string to the adjusted region', () => {
    (ctx.getCanvasFilterString as ReturnType<typeof vi.fn>).mockReturnValue('saturate(1.5)');
    renderWithWipe(ctx, element, 800, 600);
    // The filter is set to 'none' for boxA, then to the canvas filter string for boxB.
    // After both regions are drawn, the last assignment to imageCtx.filter was 'saturate(1.5)'.
    expect(imageCtx.filter).toBe('saturate(1.5)');
  });

  it('should compute rect coordinates from stencil boxes and display dimensions', () => {
    const wipeManager = {
      computeStencilBoxes: vi.fn(() => [
        [0, 0.3, 0, 1],
        [0.3, 1, 0, 1],
      ]),
      position: 0.3,
      mode: 'wipe-h' as const,
    };
    (ctx.getWipeManager as ReturnType<typeof vi.fn>).mockReturnValue(wipeManager);

    renderWithWipe(ctx, element, 1000, 500);

    // boxA rect: Math.floor(1000*0), Math.floor(500*0), Math.ceil(1000*(0.3-0)), Math.ceil(500*(1-0))
    expect(imageCtx.rect).toHaveBeenCalledWith(0, 0, 300, 500);
    // boxB rect: Math.floor(1000*0.3), Math.floor(500*0), Math.ceil(1000*(1-0.3)), Math.ceil(500*(1-0))
    expect(imageCtx.rect).toHaveBeenCalledWith(300, 0, 700, 500);
  });
});

// =========================================================================
// drawClippedSource
// =========================================================================
describe('drawClippedSource', () => {
  it('should save, clip, set filter, draw, and restore', () => {
    const ctx = createMockContext();
    const canvasCtx = createMockCanvasCtx();
    const element = createMockElement();

    drawClippedSource(ctx, canvasCtx, element, 10, 20, 100, 200, 800, 600);

    expect(canvasCtx.save).toHaveBeenCalledTimes(1);
    expect(canvasCtx.beginPath).toHaveBeenCalledTimes(1);
    expect(canvasCtx.rect).toHaveBeenCalledWith(10, 20, 100, 200);
    expect(canvasCtx.clip).toHaveBeenCalledTimes(1);
    expect(canvasCtx.restore).toHaveBeenCalledTimes(1);
  });

  it('should apply the canvas filter string from context', () => {
    const ctx = createMockContext();
    (ctx.getCanvasFilterString as ReturnType<typeof vi.fn>).mockReturnValue('brightness(1.2)');
    const canvasCtx = createMockCanvasCtx();
    const element = createMockElement();

    drawClippedSource(ctx, canvasCtx, element, 0, 0, 100, 100, 800, 600);

    expect(canvasCtx.filter).toBe('brightness(1.2)');
  });
});

// =========================================================================
// renderSplitScreen
// =========================================================================
describe('renderSplitScreen', () => {
  it('should fallback to currentSource when sourceA is null', () => {
    const currentElement = createMockElement();
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: null,
        sourceB: null,
        currentSource: { element: currentElement },
        currentFrame: 1,
      })) as any,
    });

    renderSplitScreen(ctx, 800, 600);

    expect(ctx.drawWithTransform).toHaveBeenCalledWith(ctx.getImageCtx(), currentElement, 800, 600);
  });

  it('should fallback to currentSource when sourceB element is null', () => {
    const currentElement = createMockElement();
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: null },
        currentSource: { element: currentElement },
        currentFrame: 1,
      })) as any,
    });

    renderSplitScreen(ctx, 800, 600);

    expect(ctx.drawWithTransform).toHaveBeenCalledWith(ctx.getImageCtx(), currentElement, 800, 600);
  });

  it('should do nothing when no sources and no currentSource', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: null,
        sourceB: null,
        currentSource: null,
        currentFrame: 1,
      })) as any,
    });

    renderSplitScreen(ctx, 800, 600);

    expect(ctx.drawWithTransform).not.toHaveBeenCalled();
    expect(ctx.drawClippedSource).not.toHaveBeenCalled();
  });

  it('should render horizontal split screen with drawClippedSource', () => {
    const elementA = createMockElement();
    const elementB = createMockElement();
    const wipeManager = {
      computeStencilBoxes: vi.fn(() => [
        [0, 0.5, 0, 1],
        [0.5, 1, 0, 1],
      ]),
      position: 0.5,
      mode: 'splitscreen-h' as const,
    };

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: elementA, type: 'image' },
        sourceB: { element: elementB, type: 'image' },
        currentSource: { element: elementA },
        currentFrame: 1,
        isSourceBUsingMediabunny: vi.fn(() => false),
      })) as any,
      getWipeManager: vi.fn(() => wipeManager) as any,
    });

    renderSplitScreen(ctx, 800, 600);

    // Horizontal split at position 0.5: splitX = Math.floor(800 * 0.5) = 400
    expect(ctx.drawClippedSource).toHaveBeenCalledTimes(2);
    const imageCtx = ctx.getImageCtx();
    expect(ctx.drawClippedSource).toHaveBeenCalledWith(imageCtx, elementA, 0, 0, 400, 600, 800, 600);
    expect(ctx.drawClippedSource).toHaveBeenCalledWith(imageCtx, elementB, 400, 0, 400, 600, 800, 600);
  });

  it('should render vertical split screen with drawClippedSource', () => {
    const elementA = createMockElement();
    const elementB = createMockElement();
    const wipeManager = {
      computeStencilBoxes: vi.fn(() => [
        [0, 1, 0, 0.5],
        [0, 1, 0.5, 1],
      ]),
      position: 0.5,
      mode: 'splitscreen-v' as const,
    };

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: elementA, type: 'image' },
        sourceB: { element: elementB, type: 'image' },
        currentSource: { element: elementA },
        currentFrame: 1,
        isSourceBUsingMediabunny: vi.fn(() => false),
      })) as any,
      getWipeManager: vi.fn(() => wipeManager) as any,
    });

    renderSplitScreen(ctx, 800, 600);

    // Vertical split at position 0.5: splitY = Math.floor(600 * 0.5) = 300
    expect(ctx.drawClippedSource).toHaveBeenCalledTimes(2);
    const imageCtx = ctx.getImageCtx();
    expect(ctx.drawClippedSource).toHaveBeenCalledWith(imageCtx, elementA, 0, 0, 800, 300, 800, 600);
    expect(ctx.drawClippedSource).toHaveBeenCalledWith(imageCtx, elementB, 0, 300, 800, 300, 800, 600);
  });

  it('should set imageSmoothingEnabled based on texture filter mode', () => {
    const elementA = createMockElement();
    const elementB = createMockElement();

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: elementA, type: 'image' },
        sourceB: { element: elementB, type: 'image' },
        currentSource: { element: elementA },
        currentFrame: 1,
        isSourceBUsingMediabunny: vi.fn(() => false),
      })) as any,
      getTextureFilterMode: vi.fn(() => 'nearest' as const),
    });

    renderSplitScreen(ctx, 800, 600);

    const imageCtx = ctx.getImageCtx();
    expect(imageCtx.imageSmoothingEnabled).toBe(false);
  });

  it('should use cached video frame canvas for sourceA when using mediabunny', () => {
    const cachedCanvas = createMockElement();
    const elementA = createMockElement();
    const elementB = createMockElement();

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: {
          element: elementA,
          type: 'video',
          videoSourceNode: {
            isUsingMediabunny: vi.fn(() => true),
            getCachedFrameCanvas: vi.fn(() => cachedCanvas),
          },
        },
        sourceB: { element: elementB, type: 'image' },
        currentSource: { element: elementA },
        currentFrame: 5,
        isSourceBUsingMediabunny: vi.fn(() => false),
      })) as any,
      getWipeManager: vi.fn(() => ({
        computeStencilBoxes: vi.fn(() => [
          [0, 0.5, 0, 1],
          [0.5, 1, 0, 1],
        ]),
        position: 0.5,
        mode: 'splitscreen-h' as const,
      })) as any,
    });

    renderSplitScreen(ctx, 800, 600);

    // The first call should use cachedCanvas (not elementA)
    const imageCtx = ctx.getImageCtx();
    expect(ctx.drawClippedSource).toHaveBeenCalledWith(imageCtx, cachedCanvas, 0, 0, 400, 600, 800, 600);
  });
});

// =========================================================================
// renderGhostFrames
// =========================================================================
describe('renderGhostFrames', () => {
  it('should return early when ghost frames are disabled', () => {
    const ctx = createMockContext();
    renderGhostFrames(ctx, 800, 600);

    // Should not try to get session source details
    const imageCtx = ctx.getImageCtx();
    expect(imageCtx.save).not.toHaveBeenCalled();
  });

  it('should return early when current source is null', () => {
    const gfm = {
      state: {
        enabled: true,
        framesBefore: 2,
        framesAfter: 2,
        opacityBase: 0.5,
        opacityFalloff: 0.7,
        colorTint: false,
      },
      getPoolCanvas: vi.fn(),
      trimPool: vi.fn(),
    };
    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: null,
        currentFrame: 5,
      })) as any,
    });

    renderGhostFrames(ctx, 800, 600);

    expect(gfm.trimPool).not.toHaveBeenCalled();
  });

  it('should render ghost frames from prerender buffer when available', () => {
    const ghostCanvas = createMockElement();
    const gfm = {
      state: {
        enabled: true,
        framesBefore: 1,
        framesAfter: 0,
        opacityBase: 0.8,
        opacityFalloff: 0.5,
        colorTint: false,
      },
      getPoolCanvas: vi.fn(),
      trimPool: vi.fn(),
    };
    const prerenderBuffer = {
      getFrame: vi.fn((frame: number) => {
        if (frame === 4) return { canvas: ghostCanvas };
        return null;
      }),
    };

    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: { element: createMockElement(), type: 'image', duration: 10 },
        currentFrame: 5,
      })) as any,
      getPrerenderBuffer: vi.fn(() => prerenderBuffer) as any,
    });

    renderGhostFrames(ctx, 800, 600);

    expect(prerenderBuffer.getFrame).toHaveBeenCalledWith(4);
    expect(ctx.drawWithTransform).toHaveBeenCalledTimes(1);
    expect(gfm.trimPool).toHaveBeenCalledWith(0);
  });

  it('should apply opacity based on distance and falloff', () => {
    const ghostCanvas = createMockElement();
    const gfm = {
      state: {
        enabled: true,
        framesBefore: 2,
        framesAfter: 0,
        opacityBase: 0.8,
        opacityFalloff: 0.5,
        colorTint: false,
      },
      getPoolCanvas: vi.fn(),
      trimPool: vi.fn(),
    };
    const prerenderBuffer = {
      getFrame: vi.fn((frame: number) => ({ canvas: ghostCanvas })),
    };

    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: { element: createMockElement(), type: 'image', duration: 10 },
        currentFrame: 5,
      })) as any,
      getPrerenderBuffer: vi.fn(() => prerenderBuffer) as any,
    });

    renderGhostFrames(ctx, 800, 600);

    const imageCtx = ctx.getImageCtx();
    // 2 frames before (farthest first): distance=2, then distance=1
    // frame 3 (distance 2): opacity = 0.8 * 0.5^(2-1) = 0.4
    // frame 4 (distance 1): opacity = 0.8 * 0.5^(1-1) = 0.8
    expect(imageCtx.save).toHaveBeenCalledTimes(2);
    expect(ctx.drawWithTransform).toHaveBeenCalledTimes(2);
  });

  it('should apply color tint with multiply composite operation when enabled', () => {
    const ghostCanvas = createMockElement();
    const gfm = {
      state: { enabled: true, framesBefore: 1, framesAfter: 1, opacityBase: 0.5, opacityFalloff: 1, colorTint: true },
      getPoolCanvas: vi.fn(),
      trimPool: vi.fn(),
    };
    const prerenderBuffer = {
      getFrame: vi.fn(() => ({ canvas: ghostCanvas })),
    };

    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: { element: createMockElement(), type: 'image', duration: 10 },
        currentFrame: 5,
      })) as any,
      getPrerenderBuffer: vi.fn(() => prerenderBuffer) as any,
    });

    renderGhostFrames(ctx, 800, 600);

    const imageCtx = ctx.getImageCtx();
    // Color tint triggers fillRect calls
    expect(imageCtx.fillRect).toHaveBeenCalledTimes(2);
    // Before frame should get red tint, after frame should get green tint
    expect(imageCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('should skip frames before frame 1 and after duration', () => {
    const ghostCanvas = createMockElement();
    const gfm = {
      state: { enabled: true, framesBefore: 3, framesAfter: 3, opacityBase: 0.5, opacityFalloff: 1, colorTint: false },
      getPoolCanvas: vi.fn(),
      trimPool: vi.fn(),
    };
    const prerenderBuffer = {
      getFrame: vi.fn(() => ({ canvas: ghostCanvas })),
    };

    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: { element: createMockElement(), type: 'image', duration: 3 },
        currentFrame: 2,
      })) as any,
      getPrerenderBuffer: vi.fn(() => prerenderBuffer) as any,
    });

    renderGhostFrames(ctx, 800, 600);

    // frame 2, framesBefore=3: frames -1,0,1 -> only 1 is valid (>=1)
    // framesAfter=3: frames 5,4,3 -> only 3 is valid (<=3)
    // So 2 ghost frames total
    expect(ctx.drawWithTransform).toHaveBeenCalledTimes(2);
  });

  it('should use sequence frame when source type is sequence', () => {
    const seqFrame = createMockElement();
    const poolCanvas = createMockElement();
    const poolCtx = createMockCanvasCtx();
    const gfm = {
      state: { enabled: true, framesBefore: 1, framesAfter: 0, opacityBase: 0.5, opacityFalloff: 1, colorTint: false },
      getPoolCanvas: vi.fn(() => ({ canvas: poolCanvas, ctx: poolCtx })),
      trimPool: vi.fn(),
    };

    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: { element: createMockElement(), type: 'sequence', duration: 10 },
        currentFrame: 5,
        getSequenceFrameSync: vi.fn(() => seqFrame),
      })) as any,
      getPrerenderBuffer: vi.fn(() => null),
    });

    renderGhostFrames(ctx, 800, 600);

    expect(gfm.getPoolCanvas).toHaveBeenCalledWith(0, 800, 600, undefined);
    expect(poolCtx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(poolCtx.drawImage).toHaveBeenCalledWith(seqFrame, 0, 0, 800, 600);
    expect(gfm.trimPool).toHaveBeenCalledWith(1);
  });

  it('should use video frame canvas when source type is video', () => {
    const videoCanvas = createMockElement();
    const gfm = {
      state: { enabled: true, framesBefore: 1, framesAfter: 0, opacityBase: 0.5, opacityFalloff: 1, colorTint: false },
      getPoolCanvas: vi.fn(),
      trimPool: vi.fn(),
    };

    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: { element: createMockElement(), type: 'video', duration: 10 },
        currentFrame: 5,
        getVideoFrameCanvas: vi.fn(() => videoCanvas),
      })) as any,
      getPrerenderBuffer: vi.fn(() => null),
    });

    renderGhostFrames(ctx, 800, 600);

    expect(ctx.drawWithTransform).toHaveBeenCalledTimes(1);
    expect(gfm.trimPool).toHaveBeenCalledWith(0);
  });

  it('should skip ghost frame when no canvas is available', () => {
    const gfm = {
      state: { enabled: true, framesBefore: 1, framesAfter: 0, opacityBase: 0.5, opacityFalloff: 1, colorTint: false },
      getPoolCanvas: vi.fn(() => null),
      trimPool: vi.fn(),
    };

    const ctx = createMockContext({
      getGhostFrameManager: vi.fn(() => gfm) as any,
      getSession: vi.fn(() => ({
        currentSource: { element: createMockElement(), type: 'sequence', duration: 10 },
        currentFrame: 5,
        getSequenceFrameSync: vi.fn(() => createMockElement()),
      })) as any,
      getPrerenderBuffer: vi.fn(() => null),
    });

    renderGhostFrames(ctx, 800, 600);

    // poolCanvas returned null, so no draw
    expect(ctx.drawWithTransform).not.toHaveBeenCalled();
    expect(gfm.trimPool).toHaveBeenCalledWith(0);
  });
});

// =========================================================================
// renderSourceToImageData
// =========================================================================
describe('renderSourceToImageData', () => {
  it('should return null when source does not exist', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        getSourceByIndex: vi.fn(() => null),
      })) as any,
    });

    const result = renderSourceToImageData(ctx, 0, 100, 100);

    expect(ctx.getSession).toHaveBeenCalled();
    expect(ctx.getTransform).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('should return null when source has no element', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        getSourceByIndex: vi.fn(() => ({ element: null })),
      })) as any,
    });

    const result = renderSourceToImageData(ctx, 0, 100, 100);
    expect(result).toBeNull();
  });
});

// =========================================================================
// renderBlendMode
// =========================================================================
describe('renderBlendMode', () => {
  it('should return null when sourceA is null', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: null,
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
    });

    const result = renderBlendMode(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should return null when sourceB is null', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: null,
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
    });

    const result = renderBlendMode(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should return null when sourceA element is null', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: null },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
    });

    const result = renderBlendMode(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should return null when renderSourceToImageData returns null for dataA', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn(() => null),
    });

    const result = renderBlendMode(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should return composited data for onionskin mode', () => {
    const dataA = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    const dataB = new ImageData(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? dataA : dataB)),
      getBlendModeState: vi.fn(() => ({
        mode: 'onionskin' as const,
        onionOpacity: 0.5,
        flickerRate: 4,
        blendRatio: 0.5,
        flickerFrame: 0 as 0 | 1,
      })),
    });

    const result = renderBlendMode(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
    // compositeImageData(red@255a, green@255a, 'normal', 0.5)
    // outA = 0.5 + 1*(1-0.5) = 1.0 => 255
    // R = round((0*0.5 + 255*1*0.5)/1.0) = 128
    // G = round((255*0.5 + 0*1*0.5)/1.0) = 128
    // B = 0
    expect(result!.data[0]).toBe(128); // R
    expect(result!.data[1]).toBe(128); // G
    expect(result!.data[2]).toBe(0); // B
    expect(result!.data[3]).toBe(255); // A
  });

  it('should return composited data for blend mode', () => {
    const dataA = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    const dataB = new ImageData(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? dataA : dataB)),
      getBlendModeState: vi.fn(() => ({
        mode: 'blend' as const,
        onionOpacity: 0.5,
        flickerRate: 4,
        blendRatio: 0.3,
        flickerFrame: 0 as 0 | 1,
      })),
    });

    const result = renderBlendMode(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    // compositeImageData(red@255a, green@255a, 'normal', 0.3)
    // outA = 0.3 + 1*0.7 = 1.0 => 255
    // R = round((0*0.3 + 255*1*0.7)/1.0) = round(178.5) = 179
    // G = round((255*0.3 + 0*1*0.7)/1.0) = round(76.5) = 77
    // B = 0
    expect(result!.data[0]).toBe(179); // R
    expect(result!.data[1]).toBe(77); // G
    expect(result!.data[2]).toBe(0); // B
    expect(result!.data[3]).toBe(255); // A
  });

  it('should return dataA copy for flicker mode when flickerFrame is 0', () => {
    const dataA = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    const dataB = new ImageData(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? dataA : dataB)),
      getBlendModeState: vi.fn(() => ({
        mode: 'flicker' as const,
        onionOpacity: 0.5,
        flickerRate: 4,
        blendRatio: 0.5,
        flickerFrame: 0 as 0 | 1,
      })),
    });

    const result = renderBlendMode(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    expect(result!.data[0]).toBe(255); // Red channel from dataA
    expect(result!.data[1]).toBe(0);
  });

  it('should return dataB copy for flicker mode when flickerFrame is 1', () => {
    const dataA = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    const dataB = new ImageData(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? dataA : dataB)),
      getBlendModeState: vi.fn(() => ({
        mode: 'flicker' as const,
        onionOpacity: 0.5,
        flickerRate: 4,
        blendRatio: 0.5,
        flickerFrame: 1 as 0 | 1,
      })),
    });

    const result = renderBlendMode(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    expect(result!.data[0]).toBe(0);
    expect(result!.data[1]).toBe(255); // Green channel from dataB
  });

  it('should return null for unknown blend mode', () => {
    const dataA = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    const dataB = new ImageData(new Uint8ClampedArray([0, 255, 0, 255]), 1, 1);

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? dataA : dataB)),
      getBlendModeState: vi.fn(() => ({
        mode: 'unknown-mode' as any,
        onionOpacity: 0.5,
        flickerRate: 4,
        blendRatio: 0.5,
        flickerFrame: 0 as 0 | 1,
      })),
    });

    const result = renderBlendMode(ctx, 1, 1);
    expect(result).toBeNull();
  });
});

// =========================================================================
// renderDifferenceMatte
// =========================================================================
describe('renderDifferenceMatte', () => {
  it('should return null when sourceA is null', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: null,
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
    });

    const result = renderDifferenceMatte(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should return null when sourceB is null', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: null,
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
    });

    const result = renderDifferenceMatte(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should return null when renderSourceToImageData returns null', () => {
    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn(() => null),
    });

    const result = renderDifferenceMatte(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should return difference matte ImageData when both sources are available', () => {
    const dataA = new ImageData(new Uint8ClampedArray([200, 100, 50, 255]), 1, 1);
    const dataB = new ImageData(new Uint8ClampedArray([100, 100, 50, 255]), 1, 1);

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? dataA : dataB)),
      getDifferenceMatteState: vi.fn(() => ({
        enabled: true,
        gain: 1.0,
        heatmap: false,
      })),
    });

    const result = renderDifferenceMatte(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
    // diffR=100, diffG=0, diffB=0 => magnitude = 100/3 ≈ 33.33
    // amplified = min(255, 33.33 * 1.0) ≈ 33.33
    // Grayscale: Uint8ClampedArray truncates to 33
    expect(result!.data[0]).toBe(33); // R (grayscale)
    expect(result!.data[1]).toBe(33); // G (grayscale)
    expect(result!.data[2]).toBe(33); // B (grayscale)
    expect(result!.data[3]).toBe(255); // A (full opacity)
  });

  it('should pass gain and heatmap to applyDifferenceMatte', () => {
    const dataA = new ImageData(new Uint8ClampedArray([200, 100, 50, 255]), 1, 1);
    const dataB = new ImageData(new Uint8ClampedArray([100, 100, 50, 255]), 1, 1);

    const ctx = createMockContext({
      getSession: vi.fn(() => ({
        sourceA: { element: createMockElement() },
        sourceB: { element: createMockElement() },
        sourceAIndex: 0,
        sourceBIndex: 1,
      })) as any,
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? dataA : dataB)),
      getDifferenceMatteState: vi.fn(() => ({
        enabled: true,
        gain: 5.0,
        heatmap: true,
      })),
    });

    const result = renderDifferenceMatte(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    // diffR=100, diffG=0, diffB=0 => magnitude = 100/3 ≈ 33.33
    // amplified = min(255, 33.33 * 5.0) ≈ 166.67
    // heatmap with t = 166.67/255 ≈ 0.6536 (falls in "Green to yellow" range 0.5-0.75)
    // s = (0.6536 - 0.5)/0.25 ≈ 0.6144
    // r = round(0.6144*255) = 157, g = 255, b = round((1-0.6144)*128) = 49
    expect(result!.data[0]).toBe(157); // R (heatmap)
    expect(result!.data[1]).toBe(255); // G (heatmap)
    expect(result!.data[2]).toBe(49); // B (heatmap)
    expect(result!.data[3]).toBe(255); // A (full opacity)
  });
});

// =========================================================================
// compositeStackLayers
// =========================================================================
describe('compositeStackLayers', () => {
  it('should return null when stack layers array is empty', () => {
    const ctx = createMockContext({
      getStackLayers: vi.fn(() => []),
    });

    const result = compositeStackLayers(ctx, 100, 100);
    expect(result).toBeNull();
  });

  it('should skip invisible layers', () => {
    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        { id: '1', name: 'Layer 1', visible: false, opacity: 1, blendMode: 'normal', sourceIndex: 0 },
      ]),
      renderSourceToImageData: vi.fn(() => new ImageData(1, 1)),
    });

    const result = compositeStackLayers(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    // renderSourceToImageData should NOT be called for invisible layers
    expect(ctx.renderSourceToImageData).not.toHaveBeenCalled();
  });

  it('should skip layers with zero opacity', () => {
    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        { id: '1', name: 'Layer 1', visible: true, opacity: 0, blendMode: 'normal', sourceIndex: 0 },
      ]),
      renderSourceToImageData: vi.fn(() => new ImageData(1, 1)),
    });

    const result = compositeStackLayers(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    expect(ctx.renderSourceToImageData).not.toHaveBeenCalled();
  });

  it('should composite visible layers with full opacity', () => {
    const layerData = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);

    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        { id: '1', name: 'Layer 1', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 },
      ]),
      renderSourceToImageData: vi.fn(() => layerData),
    });

    const result = compositeStackLayers(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    expect(ctx.renderSourceToImageData).toHaveBeenCalledWith(0, 1, 1);
  });

  it('should skip layers where renderSourceToImageData returns null', () => {
    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        { id: '1', name: 'Layer 1', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 },
      ]),
      renderSourceToImageData: vi.fn(() => null),
    });

    const result = compositeStackLayers(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    // Result should be transparent (initial ImageData)
    expect(result!.data[3]).toBe(0);
  });

  it('should composite multiple visible layers bottom to top', () => {
    const layer1Data = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    const layer2Data = new ImageData(new Uint8ClampedArray([0, 255, 0, 128]), 1, 1);

    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        { id: '1', name: 'Layer 1', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 },
        { id: '2', name: 'Layer 2', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 1 },
      ]),
      renderSourceToImageData: vi.fn((idx: number) => (idx === 0 ? layer1Data : layer2Data)),
    });

    const result = compositeStackLayers(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    expect(ctx.renderSourceToImageData).toHaveBeenCalledTimes(2);
    expect(ctx.renderSourceToImageData).toHaveBeenCalledWith(0, 1, 1);
    expect(ctx.renderSourceToImageData).toHaveBeenCalledWith(1, 1, 1);
  });

  it('should apply stencil box clipping to layer data', () => {
    // 2x2 image, stencil box clips to right half only
    const layerData = new ImageData(
      new Uint8ClampedArray([
        255,
        0,
        0,
        255,
        0,
        255,
        0,
        255, // row 0: red, green
        0,
        0,
        255,
        255,
        255,
        255,
        0,
        255, // row 1: blue, yellow
      ]),
      2,
      2,
    );

    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        {
          id: '1',
          name: 'Layer 1',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          sourceIndex: 0,
          stencilBox: [0.5, 1, 0, 1] as [number, number, number, number], // right half
        },
      ]),
      renderSourceToImageData: vi.fn(() => layerData),
    });

    const result = compositeStackLayers(ctx, 2, 2);
    expect(result).toBeInstanceOf(ImageData);

    // Assert against the composited result, not the mutated input.
    // Left column (x=0) should be zeroed out by stencil
    // pxMinX = Math.floor(0.5*2) = 1, pxMaxX = Math.ceil(1*2) = 2
    // So x=0 is outside the stencil box (x < 1)
    // pixel (0,0) - zeroed by stencil, composited over transparent => [0,0,0,0]
    expect(result!.data[0]).toBe(0);
    expect(result!.data[1]).toBe(0);
    expect(result!.data[2]).toBe(0);
    expect(result!.data[3]).toBe(0);

    // pixel (1,0) - preserved green [0,255,0,255], composited over transparent => [0,255,0,255]
    expect(result!.data[4]).toBe(0);
    expect(result!.data[5]).toBe(255);
    expect(result!.data[6]).toBe(0);
    expect(result!.data[7]).toBe(255);

    // pixel (0,1) - zeroed by stencil => [0,0,0,0]
    expect(result!.data[8]).toBe(0);
    expect(result!.data[9]).toBe(0);
    expect(result!.data[10]).toBe(0);
    expect(result!.data[11]).toBe(0);

    // pixel (1,1) - preserved yellow [255,255,0,255], composited over transparent => [255,255,0,255]
    expect(result!.data[12]).toBe(255);
    expect(result!.data[13]).toBe(255);
    expect(result!.data[14]).toBe(0);
    expect(result!.data[15]).toBe(255);
  });

  it('should not apply stencil clipping when stencil box covers full area', () => {
    const layerData = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);

    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        {
          id: '1',
          name: 'Layer 1',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          sourceIndex: 0,
          stencilBox: [0, 1, 0, 1] as [number, number, number, number], // full area - not active
        },
      ]),
      renderSourceToImageData: vi.fn(() => layerData),
    });

    const result = compositeStackLayers(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    // Pixel should be preserved since stencil box covers full area
    // isStencilBoxActive returns false for [0,1,0,1]
  });

  it('should handle mixed visible and invisible layers', () => {
    const layer1Data = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    const layer3Data = new ImageData(new Uint8ClampedArray([0, 0, 255, 255]), 1, 1);

    let callCount = 0;
    const ctx = createMockContext({
      getStackLayers: vi.fn(() => [
        { id: '1', name: 'Layer 1', visible: true, opacity: 1, blendMode: 'normal', sourceIndex: 0 },
        { id: '2', name: 'Layer 2', visible: false, opacity: 1, blendMode: 'normal', sourceIndex: 1 },
        { id: '3', name: 'Layer 3', visible: true, opacity: 0.5, blendMode: 'normal', sourceIndex: 2 },
      ]),
      renderSourceToImageData: vi.fn((idx: number) => {
        callCount++;
        if (idx === 0) return layer1Data;
        if (idx === 2) return layer3Data;
        return null;
      }),
    });

    const result = compositeStackLayers(ctx, 1, 1);
    expect(result).toBeInstanceOf(ImageData);
    // Only 2 calls: sourceIndex 0 and 2 (layer 2 is invisible)
    expect(callCount).toBe(2);
  });
});
