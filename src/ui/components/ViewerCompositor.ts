/**
 * ViewerCompositor
 *
 * Encapsulates overlay/compositing management that was previously inline
 * in Viewer.ts.  The compositor owns overlay lifecycle (creation, dimension
 * updates, disposal), ghost frame rendering, split-screen / wipe / stack
 * compositing, and background pattern compositing.
 *
 * It communicates with the Viewer through the `ViewerCompositorContext`
 * interface so neither module imports the other's concrete class.
 */

import { SafeAreasOverlay } from './SafeAreasOverlay';
import { MatteOverlay } from './MatteOverlay';
import { TimecodeOverlay } from './TimecodeOverlay';
import { FalseColor } from './FalseColor';
import { LuminanceVisualization } from './LuminanceVisualization';
import { ZebraStripes } from './ZebraStripes';
import { ClippingOverlay } from './ClippingOverlay';
import { ColorWheels } from './ColorWheels';
import { SpotlightOverlay } from './SpotlightOverlay';
import { HSLQualifier } from './HSLQualifier';
import { StackLayer } from './StackControl';
import { compositeImageData, BlendMode } from '../../composite/BlendModes';
import { applyDifferenceMatte, DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE } from './DifferenceMatteControl';
import {
  drawWithTransform as drawWithTransformUtil,
  FilterStringCache,
  getCanvasFilterString as getCanvasFilterStringUtil,
} from './ViewerRenderingUtils';
import {
  renderSourceToImageData as renderSourceToImageDataUtil,
} from './ViewerExport';
import { safeCanvasContext2D } from '../../color/ColorProcessingFacade';
import type { Session } from '../../core/session/Session';
import { Logger } from '../../utils/Logger';
import type { Transform2D } from './TransformControl';
import type { WipeManager } from './WipeManager';
import type { GhostFrameManager } from './GhostFrameManager';
import type { StereoManager } from './StereoManager';
import type { LensDistortionManager } from './LensDistortionManager';
import type { PrerenderBufferManager } from '../../utils/effects/PrerenderBufferManager';
import type { ColorAdjustments } from './ColorControls';
import type { BackgroundPatternState } from './BackgroundPatternControl';
import type { VideoFrameFetchTracker } from './VideoFrameFetchTracker';

// ---------------------------------------------------------------------------
// Context interface – the "thin adapter" that the Viewer supplies so that
// the compositor can read viewer state and trigger side-effects without
// depending on the Viewer class directly.
// ---------------------------------------------------------------------------
export interface ViewerCompositorContext {
  // DOM
  getCanvasContainer(): HTMLElement;
  getContainer(): HTMLElement;

  // Canvas contexts
  getImageCtx(): CanvasRenderingContext2D;

  // Dimensions
  getDisplayWidth(): number;
  getDisplayHeight(): number;

  // Session
  getSession(): Session;

  // Managers
  getWipeManager(): WipeManager;
  getGhostFrameManager(): GhostFrameManager;
  getStereoManager(): StereoManager;
  getLensDistortionManager(): LensDistortionManager;

  // Transform
  getTransform(): Transform2D;

  // Canvas filter string
  getCanvasFilterString(): string;

  // Color space
  getCanvasColorSpace(): 'display-p3' | undefined;

  // Prerender buffer
  getPrerenderBuffer(): PrerenderBufferManager | null;

  // Background pattern state
  getBackgroundPatternState(): BackgroundPatternState;

  // Frame fetch tracker (for source B frame fallback in split screen)
  getFrameFetchTracker(): VideoFrameFetchTracker;

  // Callbacks
  scheduleRender(): void;
  refresh(): void;
  notifyEffectsChanged(): void;
}

const log = new Logger('ViewerCompositor');

// ---------------------------------------------------------------------------
// ViewerCompositor
// ---------------------------------------------------------------------------
export class ViewerCompositor {
  // Overlay instances
  private safeAreasOverlay: SafeAreasOverlay;
  private matteOverlay: MatteOverlay;
  private timecodeOverlay: TimecodeOverlay;
  private falseColor: FalseColor;
  private luminanceVisualization: LuminanceVisualization;
  private zebraStripes: ZebraStripes;
  private clippingOverlay: ClippingOverlay;
  private colorWheels: ColorWheels;
  private spotlightOverlay: SpotlightOverlay;
  private hslQualifier: HSLQualifier;

  // Stack/composite state
  private stackLayers: StackLayer[] = [];
  private stackEnabled = false;

  // Difference matte state
  private differenceMatteState: DifferenceMatteState = { ...DEFAULT_DIFFERENCE_MATTE_STATE };

  // Temp canvas for compositing ImageData over background patterns
  private bgCompositeTempCanvas: HTMLCanvasElement | null = null;
  private bgCompositeTempCtx: CanvasRenderingContext2D | null = null;

  constructor(private ctx: ViewerCompositorContext) {
    const canvasContainer = ctx.getCanvasContainer();
    const container = ctx.getContainer();
    const session = ctx.getSession();

    // Create safe areas overlay
    this.safeAreasOverlay = new SafeAreasOverlay();
    canvasContainer.appendChild(this.safeAreasOverlay.getElement());

    // Create matte overlay (below safe areas, z-index 40)
    this.matteOverlay = new MatteOverlay();
    canvasContainer.appendChild(this.matteOverlay.getElement());

    // Create timecode overlay
    this.timecodeOverlay = new TimecodeOverlay(session);
    canvasContainer.appendChild(this.timecodeOverlay.getElement());

    // Create false color display
    this.falseColor = new FalseColor();

    // Create luminance visualization (manages HSV, random color, contour, and delegates false-color)
    this.luminanceVisualization = new LuminanceVisualization(this.falseColor);
    this.luminanceVisualization.on('stateChanged', () => {
      ctx.refresh();
    });

    // Create zebra stripes overlay
    this.zebraStripes = new ZebraStripes();
    this.zebraStripes.on('stateChanged', (state) => {
      if (state.enabled && (state.highEnabled || state.lowEnabled)) {
        this.zebraStripes.startAnimation(() => ctx.refresh());
      } else {
        this.zebraStripes.stopAnimation();
      }
      ctx.refresh();
    });

    // Create clipping overlay
    this.clippingOverlay = new ClippingOverlay();
    this.clippingOverlay.on('stateChanged', () => {
      ctx.refresh();
    });

    // Create color wheels
    this.colorWheels = new ColorWheels(container);
    this.colorWheels.on('stateChanged', () => {
      ctx.notifyEffectsChanged();
      ctx.refresh();
    });

    // Create spotlight overlay
    this.spotlightOverlay = new SpotlightOverlay();
    canvasContainer.appendChild(this.spotlightOverlay.getElement());

    // Create HSL Qualifier (secondary color correction)
    this.hslQualifier = new HSLQualifier();
    this.hslQualifier.on('stateChanged', () => {
      ctx.notifyEffectsChanged();
      ctx.refresh();
    });
  }

  // ======================================================================
  // Overlay Accessors
  // ======================================================================

  getSafeAreasOverlay(): SafeAreasOverlay { return this.safeAreasOverlay; }
  getMatteOverlay(): MatteOverlay { return this.matteOverlay; }
  getTimecodeOverlay(): TimecodeOverlay { return this.timecodeOverlay; }
  getFalseColor(): FalseColor { return this.falseColor; }
  getLuminanceVisualization(): LuminanceVisualization { return this.luminanceVisualization; }
  getZebraStripes(): ZebraStripes { return this.zebraStripes; }
  getClippingOverlay(): ClippingOverlay { return this.clippingOverlay; }
  getColorWheels(): ColorWheels { return this.colorWheels; }
  getSpotlightOverlay(): SpotlightOverlay { return this.spotlightOverlay; }
  getHSLQualifier(): HSLQualifier { return this.hslQualifier; }

  // ======================================================================
  // Overlay Dimension Updates
  // ======================================================================

  /**
   * Update overlay dimensions to match display size.
   */
  updateOverlayDimensions(width: number, height: number): void {
    // Update safe areas overlay dimensions
    try {
      this.safeAreasOverlay.setViewerDimensions(width, height, 0, 0, width, height);
    } catch (err) {
      console.error('SafeAreasOverlay setViewerDimensions failed:', err);
    }

    // Update matte overlay dimensions
    try {
      this.matteOverlay.setViewerDimensions(width, height, 0, 0, width, height);
    } catch (err) {
      console.error('MatteOverlay setViewerDimensions failed:', err);
    }

    // Update spotlight overlay dimensions
    try {
      this.spotlightOverlay.setViewerDimensions(width, height, 0, 0, width, height);
    } catch (err) {
      console.error('SpotlightOverlay setViewerDimensions failed:', err);
    }
  }

  // ======================================================================
  // Ghost Frame Rendering
  // ======================================================================

  /**
   * Render ghost frames (onion skin overlay) behind the main frame.
   * Shows semi-transparent previous/next frames for animation review.
   */
  renderGhostFrames(displayWidth: number, displayHeight: number): void {
    const gfm = this.ctx.getGhostFrameManager();
    const gfs = gfm.state;
    if (!gfs.enabled) return;

    const session = this.ctx.getSession();
    const currentFrame = session.currentFrame;
    const source = session.currentSource;
    if (!source) return;

    const duration = source.duration ?? 1;
    const ctx = this.ctx.getImageCtx();

    // Enable high-quality smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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

    const canvasColorSpace = this.ctx.getCanvasColorSpace();
    const prerenderBuffer = this.ctx.getPrerenderBuffer();

    // Render ghost frames
    let poolIndex = 0;
    for (const { frame, distance, isBefore } of framesToRender) {
      // Calculate opacity with falloff
      const opacity = gfs.opacityBase *
        Math.pow(gfs.opacityFalloff, distance - 1);

      // Try to get the frame from prerender cache
      let frameCanvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null = null;

      if (prerenderBuffer) {
        const cached = prerenderBuffer.getFrame(frame);
        if (cached) {
          frameCanvas = cached.canvas;
        }
      }

      // If not in cache, try to get from sequence or video
      if (!frameCanvas) {
        if (source.type === 'sequence') {
          // Synchronous check for cached sequence frame
          const seqFrame = session.getSequenceFrameSync(frame);
          if (seqFrame) {
            // Use pooled canvas from ghost frame manager
            const poolEntry = gfm.getPoolCanvas(poolIndex, displayWidth, displayHeight, canvasColorSpace);
            if (poolEntry) {
              poolEntry.ctx.clearRect(0, 0, displayWidth, displayHeight);
              poolEntry.ctx.drawImage(seqFrame, 0, 0, displayWidth, displayHeight);
              frameCanvas = poolEntry.canvas;
              poolIndex++;
            }
          }
        } else if (source.type === 'video') {
          // Try mediabunny cached frame
          const videoFrame = session.getVideoFrameCanvas(frame);
          if (videoFrame) {
            frameCanvas = videoFrame;
          }
        }
      }

      if (!frameCanvas) continue;

      // Draw ghost frame with opacity and optional color tint
      ctx.save();
      ctx.globalAlpha = opacity;

      if (gfs.colorTint) {
        // Apply color tint using composite operations
        // First draw the frame
        ctx.drawImage(frameCanvas, 0, 0, displayWidth, displayHeight);

        // Then overlay color tint
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = isBefore ? 'rgba(255, 100, 100, 1)' : 'rgba(100, 255, 100, 1)';
        ctx.fillRect(0, 0, displayWidth, displayHeight);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        // Just draw with opacity
        ctx.drawImage(frameCanvas, 0, 0, displayWidth, displayHeight);
      }

      ctx.restore();
    }

    // Trim pool to actual number of canvases used
    gfm.trimPool(poolIndex);
  }

  // ======================================================================
  // Wipe Compositing
  // ======================================================================

  /**
   * Render with wipe comparison (horizontal or vertical split with filter on one side).
   */
  renderWithWipe(
    element: HTMLImageElement | HTMLVideoElement,
    displayWidth: number,
    displayHeight: number,
    filterStringCache: FilterStringCache,
    colorAdjustments: ColorAdjustments,
  ): void {
    const wipeManager = this.ctx.getWipeManager();
    const ctx = this.ctx.getImageCtx();
    const pos = wipeManager.position;

    // Enable high-quality image smoothing for best picture quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();

    if (wipeManager.mode === 'horizontal') {
      const splitX = Math.floor(displayWidth * pos);

      // Draw original (left side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, displayHeight);
      ctx.clip();
      ctx.filter = 'none';
      ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
      ctx.restore();

      // Draw adjusted (right side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, displayWidth - splitX, displayHeight);
      ctx.clip();
      ctx.filter = getCanvasFilterStringUtil(colorAdjustments, filterStringCache);
      ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
      ctx.restore();

    } else if (wipeManager.mode === 'vertical') {
      const splitY = Math.floor(displayHeight * pos);

      // Draw original (top side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, displayWidth, splitY);
      ctx.clip();
      ctx.filter = 'none';
      ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
      ctx.restore();

      // Draw adjusted (bottom side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, splitY, displayWidth, displayHeight - splitY);
      ctx.clip();
      ctx.filter = getCanvasFilterStringUtil(colorAdjustments, filterStringCache);
      ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
      ctx.restore();
    }

    ctx.restore();
  }

  // ======================================================================
  // Split Screen Compositing
  // ======================================================================

  /**
   * Render split screen A/B comparison.
   * Shows source A on one side and source B on the other, using canvas clipping.
   */
  renderSplitScreen(
    displayWidth: number,
    displayHeight: number,
    filterStringCache: FilterStringCache,
    colorAdjustments: ColorAdjustments,
  ): void {
    const session = this.ctx.getSession();
    const wipeManager = this.ctx.getWipeManager();
    const sourceA = session.sourceA;
    const sourceB = session.sourceB;

    if (!sourceA?.element || !sourceB?.element) {
      // Fallback to current source if A/B not properly set up
      const currentSource = session.currentSource;
      if (currentSource?.element) {
        const imgCtx = this.ctx.getImageCtx();
        drawWithTransformUtil(imgCtx, currentSource.element, displayWidth, displayHeight, this.ctx.getTransform());
      }
      return;
    }

    const ctx = this.ctx.getImageCtx();
    const pos = wipeManager.position;
    const currentFrame = session.currentFrame;
    const tracker = this.ctx.getFrameFetchTracker();

    // Determine the element to use for source A
    let elementA: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap = sourceA.element;
    if (sourceA.type === 'video' && session.isUsingMediabunny()) {
      const frameCanvas = session.getVideoFrameCanvas(currentFrame);
      if (frameCanvas) {
        elementA = frameCanvas;
      }
    }

    // Determine the element to use for source B
    let elementB: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap = sourceB.element;
    if (sourceB.type === 'video' && session.isSourceBUsingMediabunny()) {
      const frameCanvas = session.getSourceBFrameCanvas(currentFrame);
      if (frameCanvas) {
        elementB = frameCanvas;
        // Cache this frame canvas to use as fallback while next frame loads
        tracker.lastSourceBFrameCanvas = frameCanvas;
        tracker.hasDisplayedSourceBMediabunnyFrame = true;
        tracker.pendingSourceBFrameFetch = null;
        tracker.pendingSourceBFrameNumber = 0;
      } else {
        // Frame not cached - fetch it asynchronously
        if (!tracker.pendingSourceBFrameFetch || tracker.pendingSourceBFrameNumber !== currentFrame) {
          tracker.pendingSourceBFrameNumber = currentFrame;
          const frameToFetch = currentFrame;

          tracker.pendingSourceBFrameFetch = session.fetchSourceBVideoFrame(frameToFetch)
            .then(() => {
              if (tracker.pendingSourceBFrameNumber === frameToFetch) {
                tracker.pendingSourceBFrameFetch = null;
                tracker.pendingSourceBFrameNumber = 0;
                this.ctx.refresh();
              }
            })
            .catch((err) => {
              log.warn('Failed to fetch source B video frame', err);
              if (tracker.pendingSourceBFrameNumber === frameToFetch) {
                tracker.pendingSourceBFrameFetch = null;
                tracker.pendingSourceBFrameNumber = 0;
              }
            });
        }

        // Use fallback while frame is being fetched
        if (tracker.hasDisplayedSourceBMediabunnyFrame && tracker.lastSourceBFrameCanvas) {
          elementB = tracker.lastSourceBFrameCanvas;
        } else {
          elementB = sourceB.element;
        }
      }
    }

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();

    if (wipeManager.mode === 'splitscreen-h') {
      // Horizontal split: A on left, B on right
      const splitX = Math.floor(displayWidth * pos);
      this.drawClippedSource(ctx, elementA, 0, 0, splitX, displayHeight, displayWidth, displayHeight, filterStringCache, colorAdjustments);
      this.drawClippedSource(ctx, elementB, splitX, 0, displayWidth - splitX, displayHeight, displayWidth, displayHeight, filterStringCache, colorAdjustments);
    } else if (wipeManager.mode === 'splitscreen-v') {
      // Vertical split: A on top, B on bottom
      const splitY = Math.floor(displayHeight * pos);
      this.drawClippedSource(ctx, elementA, 0, 0, displayWidth, splitY, displayWidth, displayHeight, filterStringCache, colorAdjustments);
      this.drawClippedSource(ctx, elementB, 0, splitY, displayWidth, displayHeight - splitY, displayWidth, displayHeight, filterStringCache, colorAdjustments);
    }

    ctx.restore();
  }

  /**
   * Draw a source element clipped to a specific region.
   * Used by split screen rendering to show different sources in different areas.
   */
  private drawClippedSource(
    ctx: CanvasRenderingContext2D,
    element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
    clipX: number,
    clipY: number,
    clipWidth: number,
    clipHeight: number,
    displayWidth: number,
    displayHeight: number,
    filterStringCache: FilterStringCache,
    colorAdjustments: ColorAdjustments,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipWidth, clipHeight);
    ctx.clip();
    ctx.filter = getCanvasFilterStringUtil(colorAdjustments, filterStringCache);
    drawWithTransformUtil(ctx, element, displayWidth, displayHeight, this.ctx.getTransform());
    ctx.restore();
  }

  // ======================================================================
  // Stack/Layer Compositing
  // ======================================================================

  setStackLayers(layers: StackLayer[]): void {
    this.stackLayers = [...layers];
    this.stackEnabled = layers.length > 1;
  }

  getStackLayers(): StackLayer[] {
    return [...this.stackLayers];
  }

  setStackEnabled(enabled: boolean): void {
    this.stackEnabled = enabled;
  }

  isStackEnabled(): boolean {
    return this.stackEnabled && this.stackLayers.length > 1;
  }

  /**
   * Composite multiple stack layers together
   */
  compositeStackLayers(width: number, height: number): ImageData | null {
    if (this.stackLayers.length === 0) return null;

    const session = this.ctx.getSession();

    // Start with transparent
    let result = new ImageData(width, height);

    // Composite each visible layer from bottom to top
    for (const layer of this.stackLayers) {
      if (!layer.visible || layer.opacity === 0) continue;

      const layerData = renderSourceToImageDataUtil(session, layer.sourceIndex, width, height);
      if (!layerData) continue;

      // Composite this layer onto result
      result = compositeImageData(result, layerData, layer.blendMode as BlendMode, layer.opacity);
    }

    return result;
  }

  // ======================================================================
  // Difference Matte
  // ======================================================================

  setDifferenceMatteState(state: DifferenceMatteState): void {
    this.differenceMatteState = { ...state };
  }

  getDifferenceMatteState(): DifferenceMatteState {
    return { ...this.differenceMatteState };
  }

  resetDifferenceMatteState(): void {
    this.differenceMatteState = { ...DEFAULT_DIFFERENCE_MATTE_STATE };
  }

  isDifferenceMatteEnabled(): boolean {
    return this.differenceMatteState.enabled;
  }

  /**
   * Render difference matte between A and B sources.
   * Shows absolute pixel difference, optionally as heatmap.
   */
  renderDifferenceMatte(width: number, height: number): ImageData | null {
    const session = this.ctx.getSession();
    const sourceA = session.sourceA;
    const sourceB = session.sourceB;

    if (!sourceA?.element || !sourceB?.element) return null;

    // Render both sources to ImageData
    const dataA = renderSourceToImageDataUtil(session, session.sourceAIndex, width, height);
    const dataB = renderSourceToImageDataUtil(session, session.sourceBIndex, width, height);

    if (!dataA || !dataB) return null;

    // Apply difference matte algorithm
    return applyDifferenceMatte(
      dataA,
      dataB,
      this.differenceMatteState.gain,
      this.differenceMatteState.heatmap
    );
  }

  // ======================================================================
  // Background Compositing
  // ======================================================================

  /**
   * Composite ImageData onto the canvas while preserving the background pattern.
   * putImageData() ignores compositing and overwrites pixels directly, so we
   * write to a temporary canvas first, then use drawImage() which respects
   * alpha compositing and preserves the background pattern underneath.
   */
  compositeImageDataOverBackground(imageData: ImageData, width: number, height: number): void {
    const imageCtx = this.ctx.getImageCtx();
    const bgState = this.ctx.getBackgroundPatternState();
    const canvasColorSpace = this.ctx.getCanvasColorSpace();

    if (bgState.pattern === 'black') {
      // No background pattern - putImageData is fine
      imageCtx.putImageData(imageData, 0, 0);
      return;
    }

    // Ensure temp canvas is the right size
    if (!this.bgCompositeTempCanvas || !this.bgCompositeTempCtx) {
      this.bgCompositeTempCanvas = document.createElement('canvas');
      this.bgCompositeTempCtx = safeCanvasContext2D(this.bgCompositeTempCanvas, {}, canvasColorSpace);
    }
    if (!this.bgCompositeTempCtx) {
      // Fallback if context creation fails
      imageCtx.putImageData(imageData, 0, 0);
      return;
    }
    if (this.bgCompositeTempCanvas.width !== width || this.bgCompositeTempCanvas.height !== height) {
      this.bgCompositeTempCanvas.width = width;
      this.bgCompositeTempCanvas.height = height;
    }

    // Write ImageData to temp canvas, then drawImage onto main canvas
    this.bgCompositeTempCtx.putImageData(imageData, 0, 0);
    imageCtx.drawImage(this.bgCompositeTempCanvas, 0, 0);
  }

  // ======================================================================
  // Disposal
  // ======================================================================

  dispose(): void {
    this.clippingOverlay.dispose();
    this.luminanceVisualization.dispose();
    this.falseColor.dispose();
    this.zebraStripes.dispose();
    this.spotlightOverlay.dispose();
    this.hslQualifier.dispose();
    this.bgCompositeTempCanvas = null;
    this.bgCompositeTempCtx = null;
  }
}
