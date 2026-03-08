/**
 * ViewerImageRenderer - Core rendering dispatch for the Viewer.
 *
 * Extracted from Viewer.ts to separate the image rendering pipeline
 * (wipe, split screen, ghost frames, blend modes, difference matte,
 * stack compositing) from the monolithic Viewer class.
 *
 * All functions are standalone and access viewer state through the
 * ImageRendererContext interface.
 */

import type { Session } from '../../core/session/Session';
import type { Transform2D } from './TransformControl';
import type { TextureFilterMode } from '../../core/types/filter';
import type { WipeManager } from './WipeManager';
import type { GhostFrameManager } from './GhostFrameManager';
import type { StackLayer } from './StackControl';
import type { BlendModeState } from './ComparisonManager';
import type { DifferenceMatteState } from './DifferenceMatteControl';
import type { PrerenderBufferManager } from '../../utils/effects/PrerenderBufferManager';
import type { VideoFrameFetchTracker } from './VideoFrameFetchTracker';
import type { FrameInterpolator } from '../../utils/media/FrameInterpolator';
import { compositeImageData, type BlendMode } from '../../composite/BlendModes';
import { isStencilBoxActive } from '../../core/types/wipe';
import { applyDifferenceMatte } from './DifferenceMatteControl';
import { drawWithTransform as drawWithTransformUtil } from './ViewerRenderingUtils';
import { renderSourceToImageData as renderSourceToImageDataUtil } from './ViewerExport';
import { Logger } from '../../utils/Logger';

const log = new Logger('ViewerImageRenderer');

/**
 * Context interface for ViewerImageRenderer to access Viewer state.
 */
export interface ImageRendererContext {
  getSession(): Session;
  getImageCtx(): CanvasRenderingContext2D;
  getWipeManager(): WipeManager;
  getGhostFrameManager(): GhostFrameManager;
  getTransform(): Transform2D;
  getTextureFilterMode(): TextureFilterMode;
  getCanvasFilterString(): string;
  getStackLayers(): StackLayer[];
  isStackEnabled(): boolean;
  isBlendModeEnabled(): boolean;
  getBlendModeState(): BlendModeState & { flickerFrame: 0 | 1 };
  getDifferenceMatteState(): DifferenceMatteState;
  getPrerenderBuffer(): PrerenderBufferManager | null;
  getFrameFetchTracker(): VideoFrameFetchTracker;
  getFrameInterpolator(): FrameInterpolator;
  getCanvasColorSpace(): 'display-p3' | undefined;
  getDisplayWidth(): number;
  getDisplayHeight(): number;
  drawWithTransform(
    ctx: CanvasRenderingContext2D,
    element: CanvasImageSource,
    displayWidth: number,
    displayHeight: number,
  ): void;
  renderSourceToImageData(sourceIndex: number, width: number, height: number): ImageData | null;
  drawClippedSource(
    canvasCtx: CanvasRenderingContext2D,
    element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
    clipX: number,
    clipY: number,
    clipWidth: number,
    clipHeight: number,
    displayWidth: number,
    displayHeight: number,
  ): void;
  refresh(): void;
}

/**
 * Render with wipe comparison mode.
 * Draws original in one region, color-filtered in another, using canvas clipping.
 */
export function renderWithWipe(
  ctx: ImageRendererContext,
  element: CanvasImageSource,
  displayWidth: number,
  displayHeight: number,
): void {
  const imageCtx = ctx.getImageCtx();
  const wipeManager = ctx.getWipeManager();

  // Image smoothing respects texture filter mode
  imageCtx.imageSmoothingEnabled = ctx.getTextureFilterMode() === 'linear';
  imageCtx.imageSmoothingQuality = 'high';

  // Compute stencil boxes from wipe position/mode.
  const [boxA, boxB] = wipeManager.computeStencilBoxes();

  imageCtx.save();

  // Draw original region (boxA) without filters
  imageCtx.save();
  imageCtx.beginPath();
  imageCtx.rect(
    Math.floor(displayWidth * boxA[0]),
    Math.floor(displayHeight * boxA[2]),
    Math.ceil(displayWidth * (boxA[1] - boxA[0])),
    Math.ceil(displayHeight * (boxA[3] - boxA[2])),
  );
  imageCtx.clip();
  imageCtx.filter = 'none';
  ctx.drawWithTransform(imageCtx, element, displayWidth, displayHeight);
  imageCtx.restore();

  // Draw adjusted region (boxB) with color filters
  imageCtx.save();
  imageCtx.beginPath();
  imageCtx.rect(
    Math.floor(displayWidth * boxB[0]),
    Math.floor(displayHeight * boxB[2]),
    Math.ceil(displayWidth * (boxB[1] - boxB[0])),
    Math.ceil(displayHeight * (boxB[3] - boxB[2])),
  );
  imageCtx.clip();
  imageCtx.filter = ctx.getCanvasFilterString();
  ctx.drawWithTransform(imageCtx, element, displayWidth, displayHeight);
  imageCtx.restore();

  imageCtx.restore();
}

/**
 * Draw a source element to a context, handling different element types.
 */
function drawSourceToContext(
  ctx: ImageRendererContext,
  canvasCtx: CanvasRenderingContext2D,
  element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
  width: number,
  height: number,
): void {
  drawWithTransformUtil(canvasCtx, element, width, height, ctx.getTransform(), ctx.getTextureFilterMode() === 'linear');
}

/**
 * Draw a source element clipped to a specific region.
 * Used by split screen rendering to show different sources in different areas.
 */
export function drawClippedSource(
  ctx: ImageRendererContext,
  canvasCtx: CanvasRenderingContext2D,
  element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
  clipX: number,
  clipY: number,
  clipWidth: number,
  clipHeight: number,
  displayWidth: number,
  displayHeight: number,
): void {
  canvasCtx.save();
  canvasCtx.beginPath();
  canvasCtx.rect(clipX, clipY, clipWidth, clipHeight);
  canvasCtx.clip();
  canvasCtx.filter = ctx.getCanvasFilterString();
  drawSourceToContext(ctx, canvasCtx, element, displayWidth, displayHeight);
  canvasCtx.restore();
}

/**
 * Render split screen A/B comparison.
 * Shows source A on one side and source B on the other, using canvas clipping.
 */
export function renderSplitScreen(ctx: ImageRendererContext, displayWidth: number, displayHeight: number): void {
  const session = ctx.getSession();
  const sourceA = session.sourceA;
  const sourceB = session.sourceB;

  if (!sourceA?.element || !sourceB?.element) {
    // Fallback to current source if A/B not properly set up
    const currentSource = session.currentSource;
    if (currentSource?.element) {
      ctx.drawWithTransform(ctx.getImageCtx(), currentSource.element, displayWidth, displayHeight);
    }
    return;
  }

  const imageCtx = ctx.getImageCtx();
  const wipeManager = ctx.getWipeManager();
  const pos = wipeManager.position;
  const currentFrame = session.currentFrame;
  const frameFetchTracker = ctx.getFrameFetchTracker();

  // Determine the element to use for source A
  let elementA: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap =
    sourceA.element;
  if (sourceA.type === 'video' && sourceA.videoSourceNode?.isUsingMediabunny()) {
    const frameCanvas = sourceA.videoSourceNode.getCachedFrameCanvas(currentFrame);
    if (frameCanvas) {
      elementA = frameCanvas;
    }
  }

  // Determine the element to use for source B
  let elementB: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap =
    sourceB.element;
  if (sourceB.type === 'video' && session.isSourceBUsingMediabunny()) {
    const frameCanvas = session.getSourceBFrameCanvas(currentFrame);
    if (frameCanvas) {
      elementB = frameCanvas;
      frameFetchTracker.lastSourceBFrameCanvas = frameCanvas;
      frameFetchTracker.hasDisplayedSourceBMediabunnyFrame = true;
      frameFetchTracker.pendingSourceBFrameFetch = null;
      frameFetchTracker.pendingSourceBFrameNumber = 0;
    } else {
      // Frame not cached - fetch it asynchronously
      if (!frameFetchTracker.pendingSourceBFrameFetch || frameFetchTracker.pendingSourceBFrameNumber !== currentFrame) {
        frameFetchTracker.pendingSourceBFrameNumber = currentFrame;
        const frameToFetch = currentFrame;

        frameFetchTracker.pendingSourceBFrameFetch = session
          .fetchSourceBVideoFrame(frameToFetch)
          .then(() => {
            if (frameFetchTracker.pendingSourceBFrameNumber === frameToFetch) {
              frameFetchTracker.pendingSourceBFrameFetch = null;
              frameFetchTracker.pendingSourceBFrameNumber = 0;
              ctx.refresh();
            }
          })
          .catch((err) => {
            log.warn('Failed to fetch source B video frame', err);
            if (frameFetchTracker.pendingSourceBFrameNumber === frameToFetch) {
              frameFetchTracker.pendingSourceBFrameFetch = null;
              frameFetchTracker.pendingSourceBFrameNumber = 0;
            }
          });
      }

      // Use fallback while frame is being fetched
      if (frameFetchTracker.hasDisplayedSourceBMediabunnyFrame && frameFetchTracker.lastSourceBFrameCanvas) {
        elementB = frameFetchTracker.lastSourceBFrameCanvas;
      } else {
        elementB = sourceB.element;
      }
    }
  }

  // Image smoothing respects texture filter mode
  imageCtx.imageSmoothingEnabled = ctx.getTextureFilterMode() === 'linear';
  imageCtx.imageSmoothingQuality = 'high';

  imageCtx.save();

  if (wipeManager.mode === 'splitscreen-h') {
    const splitX = Math.floor(displayWidth * pos);
    ctx.drawClippedSource(imageCtx, elementA, 0, 0, splitX, displayHeight, displayWidth, displayHeight);
    ctx.drawClippedSource(
      imageCtx,
      elementB,
      splitX,
      0,
      displayWidth - splitX,
      displayHeight,
      displayWidth,
      displayHeight,
    );
  } else if (wipeManager.mode === 'splitscreen-v') {
    const splitY = Math.floor(displayHeight * pos);
    ctx.drawClippedSource(imageCtx, elementA, 0, 0, displayWidth, splitY, displayWidth, displayHeight);
    ctx.drawClippedSource(
      imageCtx,
      elementB,
      0,
      splitY,
      displayWidth,
      displayHeight - splitY,
      displayWidth,
      displayHeight,
    );
  }

  imageCtx.restore();
}

/**
 * Render ghost frames (onion skin overlay) behind the main frame.
 * Shows semi-transparent previous/next frames for animation review.
 */
export function renderGhostFrames(ctx: ImageRendererContext, displayWidth: number, displayHeight: number): void {
  const gfm = ctx.getGhostFrameManager();
  const gfs = gfm.state;
  if (!gfs.enabled) return;

  const session = ctx.getSession();
  const currentFrame = session.currentFrame;
  const source = session.currentSource;
  if (!source) return;

  const duration = source.duration ?? 1;
  const imageCtx = ctx.getImageCtx();
  const prerenderBuffer = ctx.getPrerenderBuffer();
  const canvasColorSpace = ctx.getCanvasColorSpace();

  // Image smoothing respects texture filter mode
  imageCtx.imageSmoothingEnabled = ctx.getTextureFilterMode() === 'linear';
  imageCtx.imageSmoothingQuality = 'high';

  // Collect frames to render (before frames first, then after frames)
  const framesToRender: { frame: number; distance: number; isBefore: boolean }[] = [];

  // Frames before current (rendered first, farthest first)
  for (let i = gfs.framesBefore; i >= 1; i--) {
    const frame = currentFrame - i;
    if (frame >= 1) {
      framesToRender.push({ frame, distance: i, isBefore: true });
    }
  }

  // Frames after current (rendered second, farthest first)
  for (let i = gfs.framesAfter; i >= 1; i--) {
    const frame = currentFrame + i;
    if (frame <= duration) {
      framesToRender.push({ frame, distance: i, isBefore: false });
    }
  }

  // Render ghost frames
  let poolIndex = 0;
  for (const { frame, distance, isBefore } of framesToRender) {
    const opacity = gfs.opacityBase * Math.pow(gfs.opacityFalloff, distance - 1);

    let frameCanvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null = null;

    if (prerenderBuffer) {
      const cached = prerenderBuffer.getFrame(frame);
      if (cached) {
        frameCanvas = cached.canvas;
      }
    }

    if (!frameCanvas) {
      if (source.type === 'sequence') {
        const seqFrame = session.getSequenceFrameSync(frame);
        if (seqFrame) {
          const poolEntry = gfm.getPoolCanvas(poolIndex, displayWidth, displayHeight, canvasColorSpace);
          if (poolEntry) {
            poolEntry.ctx.clearRect(0, 0, displayWidth, displayHeight);
            poolEntry.ctx.drawImage(seqFrame, 0, 0, displayWidth, displayHeight);
            frameCanvas = poolEntry.canvas;
            poolIndex++;
          }
        }
      } else if (source.type === 'video') {
        const videoFrame = session.getVideoFrameCanvas(frame);
        if (videoFrame) {
          frameCanvas = videoFrame;
        }
      }
    }

    if (!frameCanvas) continue;

    imageCtx.save();
    imageCtx.globalAlpha = opacity;

    if (gfs.colorTint) {
      ctx.drawWithTransform(imageCtx, frameCanvas, displayWidth, displayHeight);
      imageCtx.globalCompositeOperation = 'multiply';
      imageCtx.fillStyle = isBefore ? 'rgba(255, 100, 100, 1)' : 'rgba(100, 255, 100, 1)';
      imageCtx.fillRect(0, 0, displayWidth, displayHeight);
      imageCtx.globalCompositeOperation = 'source-over';
    } else {
      ctx.drawWithTransform(imageCtx, frameCanvas, displayWidth, displayHeight);
    }

    imageCtx.restore();
  }

  // Trim pool to actual number of canvases used
  gfm.trimPool(poolIndex);
}

/**
 * Render a single source to ImageData for compositing operations.
 */
export function renderSourceToImageData(
  ctx: ImageRendererContext,
  sourceIndex: number,
  width: number,
  height: number,
): ImageData | null {
  return renderSourceToImageDataUtil(ctx.getSession(), sourceIndex, width, height, ctx.getTransform());
}

/**
 * Render A/B blend modes (onion skin, flicker, blend ratio).
 */
export function renderBlendMode(ctx: ImageRendererContext, width: number, height: number): ImageData | null {
  const session = ctx.getSession();
  const sourceA = session.sourceA;
  const sourceB = session.sourceB;
  if (!sourceA?.element || !sourceB?.element) return null;

  const dataA = ctx.renderSourceToImageData(session.sourceAIndex, width, height);
  const dataB = ctx.renderSourceToImageData(session.sourceBIndex, width, height);
  if (!dataA || !dataB) return null;

  const blendModeState = ctx.getBlendModeState();

  switch (blendModeState.mode) {
    case 'onionskin':
      return compositeImageData(dataA, dataB, 'normal', blendModeState.onionOpacity);
    case 'blend':
      return compositeImageData(dataA, dataB, 'normal', blendModeState.blendRatio);
    case 'flicker': {
      const src = blendModeState.flickerFrame === 0 ? dataA : dataB;
      return new ImageData(new Uint8ClampedArray(src.data), width, height);
    }
    default:
      return null;
  }
}

/**
 * Render difference matte between A and B sources.
 * Shows absolute pixel difference, optionally as heatmap.
 */
export function renderDifferenceMatte(ctx: ImageRendererContext, width: number, height: number): ImageData | null {
  const session = ctx.getSession();
  const sourceA = session.sourceA;
  const sourceB = session.sourceB;

  if (!sourceA?.element || !sourceB?.element) return null;

  const dataA = ctx.renderSourceToImageData(session.sourceAIndex, width, height);
  const dataB = ctx.renderSourceToImageData(session.sourceBIndex, width, height);

  if (!dataA || !dataB) return null;

  const differenceMatteState = ctx.getDifferenceMatteState();
  return applyDifferenceMatte(dataA, dataB, differenceMatteState.gain, differenceMatteState.heatmap);
}

/**
 * Composite multiple stack layers together.
 * Applies per-layer stencilBox clipping when present.
 */
export function compositeStackLayers(ctx: ImageRendererContext, width: number, height: number): ImageData | null {
  const stackLayers = ctx.getStackLayers();
  if (stackLayers.length === 0) return null;

  // Start with transparent
  let result = new ImageData(width, height);

  // Composite each visible layer from bottom to top
  for (const layer of stackLayers) {
    if (!layer.visible || layer.opacity === 0) continue;

    const layerData = ctx.renderSourceToImageData(layer.sourceIndex, width, height);
    if (!layerData) continue;

    // Apply stencil box clipping: zero out pixels outside the visible region
    if (layer.stencilBox && isStencilBoxActive(layer.stencilBox)) {
      const [xMin, xMax, yMin, yMax] = layer.stencilBox;
      const pxMinX = Math.floor(xMin * width);
      const pxMaxX = Math.ceil(xMax * width);
      const pxMinY = Math.floor(yMin * height);
      const pxMaxY = Math.ceil(yMax * height);
      const data = layerData.data;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (x < pxMinX || x >= pxMaxX || y < pxMinY || y >= pxMaxY) {
            const idx = (y * width + x) * 4;
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = 0;
          }
        }
      }
    }

    // Composite this layer onto result
    result = compositeImageData(result, layerData, layer.blendMode as BlendMode, layer.opacity);
  }

  return result;
}
