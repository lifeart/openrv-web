/**
 * Viewer Export Module
 * Contains functions for creating export canvases with filters and annotations applied.
 */

import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { Transform2D } from './TransformControl';
import { drawWithTransform } from './ViewerRenderingUtils';

/**
 * Create an export canvas with the current frame at source resolution.
 * Applies color filters, transforms, and optionally includes paint annotations.
 */
export function createExportCanvas(
  session: Session,
  paintEngine: PaintEngine,
  paintRenderer: PaintRenderer,
  filterString: string,
  includeAnnotations: boolean,
  transform?: Transform2D
): HTMLCanvasElement | null {
  const source = session.currentSource;
  if (!source?.element) return null;

  // Create canvas at source resolution
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Apply color filters
  ctx.filter = filterString;

  // Draw image with optional transforms
  if (source.element instanceof HTMLImageElement || source.element instanceof HTMLVideoElement) {
    if (transform) {
      drawWithTransform(ctx, source.element, source.width, source.height, transform);
    } else {
      ctx.drawImage(source.element, 0, 0, source.width, source.height);
    }
  }

  // Reset filter for annotations
  ctx.filter = 'none';

  // Draw annotations if requested
  if (includeAnnotations) {
    const annotations = paintEngine.getAnnotationsWithGhost(session.currentFrame);
    if (annotations.length > 0) {
      // Render annotations at source resolution
      paintRenderer.renderAnnotations(annotations, {
        width: source.width,
        height: source.height,
      });
      ctx.drawImage(paintRenderer.getCanvas(), 0, 0, source.width, source.height);
    }
  }

  return canvas;
}

/**
 * Render a specific frame to a canvas for sequence export.
 * Seeks to the frame, renders, and returns the canvas.
 */
export async function renderFrameToCanvas(
  session: Session,
  paintEngine: PaintEngine,
  paintRenderer: PaintRenderer,
  frame: number,
  transform: Transform2D,
  filterString: string,
  includeAnnotations: boolean
): Promise<HTMLCanvasElement | null> {
  const source = session.currentSource;
  if (!source) return null;

  // Save current frame
  const originalFrame = session.currentFrame;

  try {
    // Seek to target frame
    session.currentFrame = frame;

    // For sequences, wait for the frame to load
    if (source.type === 'sequence') {
      await session.getSequenceFrameImage(frame);
    }

    // For video, seek and wait
    if (source.type === 'video' && source.element instanceof HTMLVideoElement) {
      const video = source.element;
      const targetTime = (frame - 1) / session.fps;
      if (Math.abs(video.currentTime - targetTime) > 0.01) {
        video.currentTime = targetTime;
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });
      }
    }

    // Get the element to render
    let element: HTMLImageElement | HTMLVideoElement | undefined;
    if (source.type === 'sequence') {
      element = session.getSequenceFrameSync(frame) ?? undefined;
    } else {
      element = source.element;
    }

    if (!element) {
      return null;
    }

    // Create canvas at source resolution
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    // Apply color filters
    ctx.filter = filterString;

    // Draw image with transforms
    drawWithTransform(ctx, element, source.width, source.height, transform);

    // Reset filter for annotations
    ctx.filter = 'none';

    // Draw annotations if requested
    if (includeAnnotations) {
      const annotations = paintEngine.getAnnotationsWithGhost(frame);
      if (annotations.length > 0) {
        paintRenderer.renderAnnotations(annotations, {
          width: source.width,
          height: source.height,
        });
        ctx.drawImage(paintRenderer.getCanvas(), 0, 0, source.width, source.height);
      }
    }

    return canvas;
  } finally {
    // Restore original frame
    session.currentFrame = originalFrame;
  }
}

/**
 * Render a source to ImageData for compositing operations.
 */
export function renderSourceToImageData(
  session: Session,
  sourceIndex: number,
  width: number,
  height: number
): ImageData | null {
  const source = session.getSourceByIndex(sourceIndex);
  if (!source?.element) return null;

  // Create temp canvas with willReadFrequently for getImageData performance
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  if (!tempCtx) return null;

  // Draw source element
  if (source.element instanceof HTMLImageElement || source.element instanceof HTMLVideoElement) {
    tempCtx.drawImage(source.element, 0, 0, width, height);
  }

  return tempCtx.getImageData(0, 0, width, height);
}
