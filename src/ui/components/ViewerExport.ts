/**
 * Viewer Export Module
 * Contains functions for creating export canvases with filters and annotations applied.
 */

import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { Transform2D } from './TransformControl';
import { CropRegion } from './CropControl';
import {
  drawWithTransform,
  drawWithTransformFill,
  isFullCropRegion,
  getEffectiveDimensions,
} from './ViewerRenderingUtils';
import { safeCanvasContext2D } from '../../color/ColorProcessingFacade';

/**
 * Shared helper: draw an element onto a context with transform and/or crop applied.
 * Handles the four cases (transform+crop, crop-only, transform-only, neither)
 * in a single function to avoid code duplication.
 * Uses high-quality image smoothing for best picture quality.
 */
function drawElementWithTransformAndCrop(
  ctx: CanvasRenderingContext2D,
  element: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  effectiveWidth: number,
  effectiveHeight: number,
  outputWidth: number,
  outputHeight: number,
  transform: Transform2D | undefined,
  crop: { x: number; y: number } | null,
  filterString?: string
): void {
  // Enable high-quality image smoothing for best picture quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const hasTransform = transform && (transform.rotation !== 0 || transform.flipH || transform.flipV);

  if (crop && hasTransform) {
    // Transform with crop: render transformed to temp canvas, then extract crop
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = effectiveWidth;
    tempCanvas.height = effectiveHeight;
    const tempCtx = safeCanvasContext2D(tempCanvas, {});
    if (tempCtx) {
      // Enable high-quality image smoothing for temp canvas too
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';
      if (filterString) {
        tempCtx.filter = filterString;
      }
      drawWithTransformFill(tempCtx, element, effectiveWidth, effectiveHeight, transform!);
      // Extract crop from temp canvas. Temporarily disable filter on ctx to avoid
      // double-applying it (filter was already applied on tempCtx).
      const prevFilter = ctx.filter;
      ctx.filter = 'none';
      ctx.drawImage(tempCanvas, crop.x, crop.y, outputWidth, outputHeight, 0, 0, outputWidth, outputHeight);
      ctx.filter = prevFilter;
    }
  } else if (crop) {
    // Crop without transform: direct cropped draw from source.
    // Note: ctx.filter is already set by the caller — drawImage will apply it during this draw call.
    ctx.drawImage(element, crop.x, crop.y, outputWidth, outputHeight, 0, 0, outputWidth, outputHeight);
  } else if (hasTransform) {
    // Transform without crop
    drawWithTransformFill(ctx, element, effectiveWidth, effectiveHeight, transform!);
  } else {
    // No transform, no crop: draw at source dimensions
    ctx.drawImage(element, 0, 0, sourceWidth, sourceHeight);
  }
}

interface ExportParams {
  effectiveWidth: number;
  effectiveHeight: number;
  outputWidth: number;
  outputHeight: number;
  crop: { x: number; y: number } | null;
}

/**
 * Compute export parameters from source dimensions, transform, and crop region.
 */
function computeExportParams(
  sourceWidth: number,
  sourceHeight: number,
  transform: Transform2D | undefined,
  cropRegion: CropRegion | undefined
): ExportParams {
  // Clamp rotation to valid values to handle potentially corrupted session data
  const rawRotation = transform?.rotation ?? 0;
  const validRotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270];
  const isValidRotation = validRotations.includes(rawRotation as 0 | 90 | 180 | 270);
  if (!isValidRotation && rawRotation !== 0) {
    console.warn(`[ViewerExport] Invalid rotation value ${rawRotation}° clamped to 0°. Expected one of: 0, 90, 180, 270.`);
  }
  const rotation = isValidRotation ? (rawRotation as 0 | 90 | 180 | 270) : 0;

  const { width: effectiveWidth, height: effectiveHeight } = getEffectiveDimensions(
    sourceWidth,
    sourceHeight,
    rotation
  );

  const hasCrop = !!(cropRegion && !isFullCropRegion(cropRegion));
  const crop = hasCrop ? cropRegion : null;

  const outputWidth = crop
    ? Math.round(crop.width * effectiveWidth)
    : effectiveWidth;
  const outputHeight = crop
    ? Math.round(crop.height * effectiveHeight)
    : effectiveHeight;

  const cropOffset = crop ? {
    x: Math.round(crop.x * effectiveWidth),
    y: Math.round(crop.y * effectiveHeight),
  } : null;

  return { effectiveWidth, effectiveHeight, outputWidth, outputHeight, crop: cropOffset };
}

/**
 * Create an export canvas with the current frame at source resolution.
 * Applies color filters, transforms, crop, and optionally includes paint annotations.
 * Crop is applied in display space (after transforms), matching what the user sees.
 */
export function createExportCanvas(
  session: Session,
  paintEngine: PaintEngine,
  paintRenderer: PaintRenderer,
  filterString: string,
  includeAnnotations: boolean,
  transform?: Transform2D,
  cropRegion?: CropRegion,
  colorSpace?: 'srgb' | 'display-p3'
): HTMLCanvasElement | null {
  const source = session.currentSource;
  if (!source?.element) return null;

  const { effectiveWidth, effectiveHeight, outputWidth, outputHeight, crop } =
    computeExportParams(source.width, source.height, transform, cropRegion);

  // Create canvas at output resolution (cropped or full)
  // When colorSpace is 'display-p3', the exported PNG will be tagged with a P3 ICC profile.
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = safeCanvasContext2D(canvas, {}, colorSpace === 'display-p3' ? 'display-p3' : undefined);

  // Apply color filters
  ctx.filter = filterString;

  // Draw image with optional transforms and crop
  if (source.element instanceof HTMLImageElement || source.element instanceof HTMLVideoElement) {
    drawElementWithTransformAndCrop(
      ctx, source.element,
      source.width, source.height,
      effectiveWidth, effectiveHeight,
      outputWidth, outputHeight,
      transform, crop, filterString
    );
  }

  // Reset filter for annotations
  ctx.filter = 'none';

  // Draw annotations if requested
  if (includeAnnotations) {
    const annotations = paintEngine.getAnnotationsWithGhost(session.currentFrame);
    if (annotations.length > 0) {
      paintRenderer.renderAnnotations(annotations, {
        width: source.width,
        height: source.height,
      });

      drawElementWithTransformAndCrop(
        ctx, paintRenderer.getCanvas(),
        source.width, source.height,
        effectiveWidth, effectiveHeight,
        outputWidth, outputHeight,
        transform, crop
      );
    }
  }

  return canvas;
}

/**
 * Render a specific frame to a canvas for sequence export.
 * Seeks to the frame, renders, and returns the canvas.
 * Crop is applied in display space (after transforms), matching what the user sees.
 */
export async function renderFrameToCanvas(
  session: Session,
  paintEngine: PaintEngine,
  paintRenderer: PaintRenderer,
  frame: number,
  transform: Transform2D,
  filterString: string,
  includeAnnotations: boolean,
  cropRegion?: CropRegion,
  colorSpace?: 'srgb' | 'display-p3'
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

    const { effectiveWidth, effectiveHeight, outputWidth, outputHeight, crop } =
      computeExportParams(source.width, source.height, transform, cropRegion);

    // Create canvas at output resolution (cropped or full)
    // When colorSpace is 'display-p3', the exported PNG will be tagged with a P3 ICC profile.
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = safeCanvasContext2D(canvas, {}, colorSpace === 'display-p3' ? 'display-p3' : undefined);

    // Apply color filters
    ctx.filter = filterString;

    // Draw image with transforms and optional crop
    drawElementWithTransformAndCrop(
      ctx, element,
      source.width, source.height,
      effectiveWidth, effectiveHeight,
      outputWidth, outputHeight,
      transform, crop, filterString
    );

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

        drawElementWithTransformAndCrop(
          ctx, paintRenderer.getCanvas(),
          source.width, source.height,
          effectiveWidth, effectiveHeight,
          outputWidth, outputHeight,
          transform, crop
        );
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
  height: number,
  transform?: Transform2D,
): ImageData | null {
  const source = session.getSourceByIndex(sourceIndex);
  if (!source) return null;

  const frame = session.currentFrame;
  let element: CanvasImageSource | null = source.element ?? null;

  // Use sequence frame image for the current frame when available.
  if (source.type === 'sequence' && source.sequenceFrames) {
    const seqFrame = source.sequenceFrames[frame - 1]?.image;
    if (seqFrame) {
      element = seqFrame;
    }
  }

  // Prefer mediabunny cached frame for frame-accurate A/B playback compare.
  if (source.type === 'video' && source.videoSourceNode?.isUsingMediabunny()) {
    const frameCanvas = source.videoSourceNode.getCachedFrameCanvas(frame);
    if (frameCanvas) {
      element = frameCanvas;
    } else {
      // Queue async fetch for next render while falling back to current element.
      source.videoSourceNode.getFrameAsync?.(frame).catch(() => {});
    }
  }

  if (!element) return null;

  // Create temp canvas with willReadFrequently for getImageData performance
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = safeCanvasContext2D(tempCanvas, { willReadFrequently: true });

  // Enable high-quality image smoothing for best picture quality
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';

  const hasTransform = !!transform && (transform.rotation !== 0 || transform.flipH || transform.flipV);

  // Draw source element with optional transform so compositing modes
  // (blend/difference/stack) match the main viewer orientation.
  if (hasTransform) {
    drawWithTransform(tempCtx, element, width, height, transform!);
  } else {
    tempCtx.drawImage(element, 0, 0, width, height);
  }

  return tempCtx.getImageData(0, 0, width, height);
}
