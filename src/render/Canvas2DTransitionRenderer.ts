import type { TransitionConfig, TransitionType } from '../core/types/transition';
import { Logger } from '../utils/Logger';

const log = new Logger('Canvas2DTransitionRenderer');

/**
 * Canvas2D fallback for playlist transitions when WebGL is not available.
 *
 * | Transition | Canvas2D method                  |
 * |-----------|-----------------------------------|
 * | crossfade | globalAlpha blending              |
 * | dissolve  | Falls back to crossfade           |
 * | wipe-*    | ctx.clip() with rectangular path  |
 * | cut       | Direct draw of appropriate frame  |
 */
export class Canvas2DTransitionRenderer {
  private dissolveWarningLogged = false;

  /**
   * Render a transition frame using Canvas2D.
   *
   * @param ctx - Target canvas 2D context
   * @param outgoingCanvas - Canvas/image of the outgoing frame
   * @param incomingCanvas - Canvas/image of the incoming frame
   * @param config - Transition configuration
   * @param progress - 0.0 = fully outgoing, 1.0 = fully incoming
   */
  renderTransitionFrame(
    ctx: CanvasRenderingContext2D,
    outgoingCanvas: CanvasImageSource,
    incomingCanvas: CanvasImageSource,
    config: TransitionConfig,
    progress: number,
  ): void {
    const { width, height } = ctx.canvas;

    // Clamp progress to [0, 1] to avoid rendering artifacts
    progress = Math.max(0, Math.min(1, progress));

    // Clear
    ctx.clearRect(0, 0, width, height);

    const type = config.type;

    if (type === 'crossfade' || type === 'dissolve') {
      // Dissolve falls back to crossfade in Canvas2D (no per-pixel noise)
      if (type === 'dissolve' && !this.dissolveWarningLogged) {
        log.debug('Dissolve falling back to crossfade in Canvas2D mode');
        this.dissolveWarningLogged = true;
      }
      this.renderCrossfade(ctx, outgoingCanvas, incomingCanvas, progress, width, height);
    } else if (type === 'wipe-left' || type === 'wipe-right' || type === 'wipe-up' || type === 'wipe-down') {
      this.renderWipe(ctx, outgoingCanvas, incomingCanvas, type, progress, width, height);
    } else {
      // Cut or unknown: just draw the appropriate frame
      if (progress >= 0.5) {
        ctx.drawImage(incomingCanvas, 0, 0, width, height);
      } else {
        ctx.drawImage(outgoingCanvas, 0, 0, width, height);
      }
    }
  }

  private renderCrossfade(
    ctx: CanvasRenderingContext2D,
    outgoing: CanvasImageSource,
    incoming: CanvasImageSource,
    progress: number,
    width: number,
    height: number,
  ): void {
    // Draw outgoing at full opacity
    ctx.globalAlpha = 1.0;
    ctx.drawImage(outgoing, 0, 0, width, height);

    // Draw incoming on top with progress alpha
    ctx.globalAlpha = progress;
    ctx.drawImage(incoming, 0, 0, width, height);

    // Reset alpha
    ctx.globalAlpha = 1.0;
  }

  private renderWipe(
    ctx: CanvasRenderingContext2D,
    outgoing: CanvasImageSource,
    incoming: CanvasImageSource,
    type: TransitionType,
    progress: number,
    width: number,
    height: number,
  ): void {
    // Draw outgoing first (full frame)
    ctx.globalAlpha = 1.0;
    ctx.drawImage(outgoing, 0, 0, width, height);

    // Clip region for incoming
    ctx.save();
    ctx.beginPath();

    switch (type) {
      case 'wipe-left':
        // Incoming appears from left edge
        ctx.rect(0, 0, width * progress, height);
        break;
      case 'wipe-right':
        // Incoming appears from right edge
        ctx.rect(width * (1 - progress), 0, width * progress, height);
        break;
      case 'wipe-up':
        // Incoming appears from bottom edge
        ctx.rect(0, height * (1 - progress), width, height * progress);
        break;
      case 'wipe-down':
        // Incoming appears from top edge
        ctx.rect(0, 0, width, height * progress);
        break;
    }

    ctx.clip();
    ctx.drawImage(incoming, 0, 0, width, height);
    ctx.restore();
  }
}
