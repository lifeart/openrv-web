import { describe, it, expect, vi } from 'vitest';
import { ViewerCompositor } from './ViewerCompositor';
import { DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import type { FilterStringCache } from './ViewerRenderingUtils';

function createMockContext2D(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    filter: 'none',
  } as unknown as CanvasRenderingContext2D;
}

describe('ViewerCompositor', () => {
  it('VCOM-001: renderWithWipe applies transform for rotated sources', () => {
    const imageCtx = createMockContext2D();
    const compositor = Object.create(ViewerCompositor.prototype) as ViewerCompositor & { ctx: unknown };
    compositor.ctx = {
      getWipeManager: () => ({ mode: 'horizontal', position: 0.5 }),
      getImageCtx: () => imageCtx,
      getTransform: () => ({
        rotation: 90,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      }),
    };

    const source = document.createElement('canvas');
    source.width = 640;
    source.height = 360;
    const filterCache: FilterStringCache = {
      filterString: null,
      cachedAdjustments: null,
    };

    compositor.renderWithWipe(
      source,
      640,
      360,
      filterCache,
      DEFAULT_COLOR_ADJUSTMENTS
    );

    expect(imageCtx.rotate).toHaveBeenCalled();
  });

  it('VCOM-002: renderGhostFrames applies transform for rotated sources', () => {
    const imageCtx = createMockContext2D();
    const compositor = Object.create(ViewerCompositor.prototype) as ViewerCompositor & { ctx: unknown };
    compositor.ctx = {
      getImageCtx: () => imageCtx,
      getSession: () => ({
        currentFrame: 2,
        currentSource: {
          type: 'video',
          duration: 10,
        },
        getSequenceFrameSync: vi.fn().mockReturnValue(null),
        getVideoFrameCanvas: vi.fn().mockReturnValue(document.createElement('canvas')),
      }),
      getGhostFrameManager: () => ({
        state: {
          enabled: true,
          framesBefore: 1,
          framesAfter: 0,
          opacityBase: 0.3,
          opacityFalloff: 0.7,
          colorTint: false,
        },
        getPoolCanvas: vi.fn().mockReturnValue(null),
        trimPool: vi.fn(),
      }),
      getCanvasColorSpace: () => undefined,
      getPrerenderBuffer: () => null,
      getTransform: () => ({
        rotation: 90,
        flipH: false,
        flipV: false,
        scale: { x: 1, y: 1 },
        translate: { x: 0, y: 0 },
      }),
    };

    compositor.renderGhostFrames(640, 360);

    expect(imageCtx.rotate).toHaveBeenCalled();
  });
});
