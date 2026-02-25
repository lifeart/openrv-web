import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Canvas2DTransitionRenderer } from './Canvas2DTransitionRenderer';
import type { TransitionConfig } from '../core/types/transition';

/**
 * Create a mock CanvasRenderingContext2D with tracked calls.
 */
function createMockCtx(width = 640, height = 480): CanvasRenderingContext2D {
  return {
    canvas: { width, height },
    globalAlpha: 1.0,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

/**
 * Create a mock CanvasImageSource.
 */
function createMockImage(): CanvasImageSource {
  return {} as CanvasImageSource;
}

describe('Canvas2DTransitionRenderer', () => {
  let renderer: Canvas2DTransitionRenderer;
  let ctx: CanvasRenderingContext2D;
  let outgoing: CanvasImageSource;
  let incoming: CanvasImageSource;

  beforeEach(() => {
    renderer = new Canvas2DTransitionRenderer();
    ctx = createMockCtx();
    outgoing = createMockImage();
    incoming = createMockImage();
  });

  describe('crossfade', () => {
    const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };

    it('C2D-U001: crossfade at progress 0 draws outgoing at full opacity', () => {
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.0);

      // First call: outgoing at full alpha
      expect(ctx.drawImage).toHaveBeenCalledWith(outgoing, 0, 0, 640, 480);
      // Second call: incoming at alpha 0
      expect(ctx.drawImage).toHaveBeenCalledWith(incoming, 0, 0, 640, 480);
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    });

    it('C2D-U002: crossfade at progress 0.5 sets globalAlpha to 0.5 for incoming', () => {
      const alphaValues: number[] = [];
      ctx.drawImage = vi.fn((..._args: unknown[]) => {
        alphaValues.push(ctx.globalAlpha);
      }) as unknown as typeof ctx.drawImage;

      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      // Outgoing drawn at alpha 1.0, incoming at alpha 0.5
      expect(alphaValues[0]).toBe(1.0);
      expect(alphaValues[1]).toBe(0.5);
    });

    it('C2D-U003: crossfade at progress 1.0 sets globalAlpha to 1.0 for incoming', () => {
      const alphaValues: number[] = [];
      ctx.drawImage = vi.fn((..._args: unknown[]) => {
        alphaValues.push(ctx.globalAlpha);
      }) as unknown as typeof ctx.drawImage;

      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 1.0);

      expect(alphaValues[0]).toBe(1.0);
      expect(alphaValues[1]).toBe(1.0);
    });

    it('C2D-U004: crossfade resets globalAlpha to 1.0 after rendering', () => {
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);
      expect(ctx.globalAlpha).toBe(1.0);
    });
  });

  describe('dissolve', () => {
    const config: TransitionConfig = { type: 'dissolve', durationFrames: 12 };

    it('C2D-U005: dissolve falls back to crossfade (uses globalAlpha, no clip)', () => {
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      // Should use same drawing pattern as crossfade
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      expect(ctx.clip).not.toHaveBeenCalled();
    });
  });

  describe('wipe transitions', () => {
    it('C2D-U006: wipe-left clips from the left edge', () => {
      const config: TransitionConfig = { type: 'wipe-left', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      // Outgoing drawn first, then incoming clipped
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.rect).toHaveBeenCalledWith(0, 0, 320, 480); // 640 * 0.5 = 320
      expect(ctx.clip).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('C2D-U007: wipe-right clips from the right edge', () => {
      const config: TransitionConfig = { type: 'wipe-right', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      expect(ctx.rect).toHaveBeenCalledWith(320, 0, 320, 480); // x = 640*(1-0.5) = 320
      expect(ctx.clip).toHaveBeenCalled();
    });

    it('C2D-U008: wipe-up clips from the bottom edge', () => {
      const config: TransitionConfig = { type: 'wipe-up', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      expect(ctx.rect).toHaveBeenCalledWith(0, 240, 640, 240); // y = 480*(1-0.5) = 240
      expect(ctx.clip).toHaveBeenCalled();
    });

    it('C2D-U009: wipe-down clips from the top edge', () => {
      const config: TransitionConfig = { type: 'wipe-down', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      expect(ctx.rect).toHaveBeenCalledWith(0, 0, 640, 240); // h = 480 * 0.5 = 240
      expect(ctx.clip).toHaveBeenCalled();
    });

    it('C2D-U010: wipe at progress 0 shows only outgoing', () => {
      const config: TransitionConfig = { type: 'wipe-left', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.0);

      // Clip rect width = 0, so incoming is invisible
      expect(ctx.rect).toHaveBeenCalledWith(0, 0, 0, 480);
    });

    it('C2D-U011: wipe at progress 1 shows full incoming', () => {
      const config: TransitionConfig = { type: 'wipe-left', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 1.0);

      expect(ctx.rect).toHaveBeenCalledWith(0, 0, 640, 480);
    });
  });

  describe('cut transition', () => {
    const config: TransitionConfig = { type: 'cut', durationFrames: 1 };

    it('C2D-U012: cut at progress < 0.5 shows outgoing', () => {
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.3);

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(ctx.drawImage).toHaveBeenCalledWith(outgoing, 0, 0, 640, 480);
    });

    it('C2D-U013: cut at progress >= 0.5 shows incoming', () => {
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(ctx.drawImage).toHaveBeenCalledWith(incoming, 0, 0, 640, 480);
    });

    it('C2D-U014: cut at progress 1.0 shows incoming', () => {
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 1.0);

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(ctx.drawImage).toHaveBeenCalledWith(incoming, 0, 0, 640, 480);
    });
  });

  describe('canvas clearing', () => {
    it('C2D-U015: canvas is cleared before rendering any transition', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
      // clearRect should be called before drawImage
      const clearOrder = (ctx.clearRect as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
      const drawOrder = (ctx.drawImage as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
      expect(clearOrder).toBeLessThan(drawOrder);
    });
  });

  describe('wipe context management', () => {
    it('C2D-U016: wipe saves and restores canvas context', () => {
      const config: TransitionConfig = { type: 'wipe-left', durationFrames: 12 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.5);

      expect(ctx.save).toHaveBeenCalledTimes(1);
      expect(ctx.restore).toHaveBeenCalledTimes(1);

      // save before clip, restore after draw
      const saveOrder = (ctx.save as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
      const restoreOrder = (ctx.restore as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
      expect(saveOrder).toBeLessThan(restoreOrder);
    });
  });

  describe('edge progress values', () => {
    it('C2D-U017: crossfade clamps progress > 1.0 to 1.0', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      const alphaValues: number[] = [];
      ctx.drawImage = vi.fn((..._args: unknown[]) => {
        alphaValues.push(ctx.globalAlpha);
      }) as unknown as typeof ctx.drawImage;

      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 1.5);

      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      // Progress clamped to 1.0, so incoming drawn at full alpha
      expect(alphaValues[1]).toBe(1.0);
    });

    it('C2D-U018: crossfade clamps negative progress to 0.0', () => {
      const config: TransitionConfig = { type: 'crossfade', durationFrames: 12 };
      const alphaValues: number[] = [];
      ctx.drawImage = vi.fn((..._args: unknown[]) => {
        alphaValues.push(ctx.globalAlpha);
      }) as unknown as typeof ctx.drawImage;

      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, -0.5);

      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      // Progress clamped to 0.0, so incoming drawn at zero alpha
      expect(alphaValues[1]).toBe(0.0);
    });

    it('C2D-U019: wipe clamps progress > 1.0 to 1.0', () => {
      const config: TransitionConfig = { type: 'wipe-left', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 1.5);

      // Progress clamped to 1.0: full canvas width
      expect(ctx.rect).toHaveBeenCalledWith(0, 0, 640, 480); // 640 * 1.0 = 640
    });

    it('C2D-U020: wipe clamps negative progress to 0.0', () => {
      const config: TransitionConfig = { type: 'wipe-left', durationFrames: 24 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, -0.5);

      // Progress clamped to 0.0: zero width clip rect
      expect(ctx.rect).toHaveBeenCalledWith(0, 0, 0, 480); // 640 * 0.0 = 0
    });

    it('C2D-U021: cut at exactly progress 0.0 shows outgoing', () => {
      const config: TransitionConfig = { type: 'cut', durationFrames: 1 };
      renderer.renderTransitionFrame(ctx, outgoing, incoming, config, 0.0);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(ctx.drawImage).toHaveBeenCalledWith(outgoing, 0, 0, 640, 480);
    });
  });
});
