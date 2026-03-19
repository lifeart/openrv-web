/**
 * ViewerCanvasSetup - DOM/canvas setup and layout for the Viewer.
 *
 * Extracted from Viewer.ts to separate the canvas initialization, sizing,
 * layout, and CSS background management from the monolithic Viewer class.
 *
 * All functions are standalone and access viewer state through the
 * CanvasSetupContext interface.
 */

import { setupHiDPICanvas, resetCanvasFromHiDPI } from '../../utils/ui/HiDPICanvas';
import { drawPlaceholder as drawPlaceholderUtil } from './ViewerRenderingUtils';
import type { BackgroundPatternState } from './BackgroundPatternControl';
import { PATTERN_COLORS } from './BackgroundPatternControl';
import type { TransformManager } from './TransformManager';
import type { ViewerGLRenderer } from './ViewerGLRenderer';
import type { CropManager } from './CropManager';
import type { OverlayManager } from './OverlayManager';
import type { PerspectiveGridOverlay } from './PerspectiveGridOverlay';

/**
 * Context interface for ViewerCanvasSetup to access Viewer state.
 */
export interface CanvasSetupContext {
  getContainer(): HTMLElement;
  getCanvasContainer(): HTMLElement;
  getImageCanvas(): HTMLCanvasElement;
  getWatermarkCanvas(): HTMLCanvasElement;
  getPaintCanvas(): HTMLCanvasElement;
  getImageCtx(): CanvasRenderingContext2D;
  getWatermarkCtx(): CanvasRenderingContext2D;
  getPaintCtx(): CanvasRenderingContext2D;
  getTransformManager(): TransformManager;
  getGLRendererManager(): ViewerGLRenderer;
  getCropManager(): CropManager;
  getOverlayManager(): OverlayManager;
  getPerspectiveGridOverlay(): PerspectiveGridOverlay;
  getContainerRect(): DOMRect;
  getDisplayWidth(): number;
  getDisplayHeight(): number;
  setDisplayWidth(w: number): void;
  setDisplayHeight(h: number): void;
  getSourceWidth(): number;
  getSourceHeight(): number;
  setSourceWidth(w: number): void;
  setSourceHeight(h: number): void;
  getPhysicalWidth(): number;
  getPhysicalHeight(): number;
  setPhysicalWidth(w: number): void;
  setPhysicalHeight(h: number): void;
  getPaintLogicalWidth(): number;
  getPaintLogicalHeight(): number;
  setPaintLogicalWidth(w: number): void;
  setPaintLogicalHeight(h: number): void;
  getPaintOffsetX(): number;
  getPaintOffsetY(): number;
  setPaintOffsetX(x: number): void;
  setPaintOffsetY(y: number): void;
  setPaintDirty(dirty: boolean): void;
  setWatermarkDirty(dirty: boolean): void;
}

const MIN_PAINT_OVERDRAW_PX = 128;
const PAINT_OVERDRAW_STEP_PX = 64;

/**
 * Initialize the canvas with default placeholder dimensions.
 */
export function initializeCanvas(ctx: CanvasSetupContext): void {
  // Set initial canvas size for placeholder
  ctx.setSourceWidth(640);
  ctx.setSourceHeight(360);
  ctx.setDisplayWidth(640);
  ctx.setDisplayHeight(360);

  // Configure paint canvas at physical resolution for retina annotations
  const dpr = window.devicePixelRatio || 1;
  ctx.setPhysicalWidth(Math.max(1, Math.round(ctx.getDisplayWidth() * dpr)));
  ctx.setPhysicalHeight(Math.max(1, Math.round(ctx.getDisplayHeight() * dpr)));
  const containerRect = ctx.getContainerRect();
  updatePaintCanvasSize(ctx, ctx.getDisplayWidth(), ctx.getDisplayHeight(), containerRect.width, containerRect.height);

  // Draw placeholder with hi-DPI support
  drawPlaceholder(ctx);
  updateOverlayDimensions(ctx);
  updateCanvasPosition(ctx);
}

/**
 * Set canvas size for media rendering (standard mode, no hi-DPI scaling).
 * This resets any hi-DPI configuration from placeholder mode.
 */
export function setCanvasSize(ctx: CanvasSetupContext, width: number, height: number): void {
  ctx.setDisplayWidth(width);
  ctx.setDisplayHeight(height);

  // Compute physical dimensions for GL path (DPR-aware)
  const dpr = window.devicePixelRatio || 1;
  let physW = Math.max(1, Math.round(width * dpr));
  let physH = Math.max(1, Math.round(height * dpr));

  // Cap physical dimensions at GPU MAX_TEXTURE_SIZE
  const maxSize = ctx.getGLRendererManager().getMaxTextureSize();
  if (physW > maxSize || physH > maxSize) {
    const capScale = maxSize / Math.max(physW, physH);
    physW = Math.max(1, Math.round(physW * capScale));
    physH = Math.max(1, Math.round(physH * capScale));
  }
  ctx.setPhysicalWidth(physW);
  ctx.setPhysicalHeight(physH);

  // Reset image canvas at LOGICAL resolution
  resetCanvasFromHiDPI(ctx.getImageCanvas(), ctx.getImageCtx(), width, height);
  // Watermark overlay canvas matches image canvas logical dimensions
  resetCanvasFromHiDPI(ctx.getWatermarkCanvas(), ctx.getWatermarkCtx(), width, height);
  ctx.setWatermarkDirty(true);

  // Paint canvas at PHYSICAL resolution
  const containerRect = ctx.getContainerRect();
  updatePaintCanvasSize(ctx, width, height, containerRect.width, containerRect.height);

  ctx.getCropManager().resetOverlayCanvas(width, height);

  // Resize WebGL canvas at PHYSICAL resolution
  ctx.getGLRendererManager().resizeIfActive(physW, physH, width, height);

  updateOverlayDimensions(ctx);
  ctx.getPerspectiveGridOverlay().setViewerDimensions(width, height);
  updateCanvasPosition(ctx);
}

/**
 * Configure the paint canvas with extra padding around the image so
 * annotations can be drawn outside image bounds (OpenRV-compatible).
 */
export function updatePaintCanvasSize(
  ctx: CanvasSetupContext,
  logicalWidth: number,
  logicalHeight: number,
  containerWidth?: number,
  containerHeight?: number,
): void {
  const transformManager = ctx.getTransformManager();
  const viewW = containerWidth && containerWidth > 0 ? containerWidth : logicalWidth;
  const viewH = containerHeight && containerHeight > 0 ? containerHeight : logicalHeight;

  const centerX = (viewW - logicalWidth) / 2 + transformManager.panX;
  const centerY = (viewH - logicalHeight) / 2 + transformManager.panY;

  const visibleLeft = Math.max(0, centerX);
  const visibleTop = Math.max(0, centerY);
  const visibleRight = Math.max(0, viewW - (centerX + logicalWidth));
  const visibleBottom = Math.max(0, viewH - (centerY + logicalHeight));

  const maxPadX = viewW + MIN_PAINT_OVERDRAW_PX;
  const maxPadY = viewH + MIN_PAINT_OVERDRAW_PX;
  const snap = (v: number, step: number) => Math.ceil(v / step) * step;

  const leftPad = Math.min(maxPadX, snap(Math.max(MIN_PAINT_OVERDRAW_PX, visibleLeft), PAINT_OVERDRAW_STEP_PX));
  const rightPad = Math.min(maxPadX, snap(Math.max(MIN_PAINT_OVERDRAW_PX, visibleRight), PAINT_OVERDRAW_STEP_PX));
  const topPad = Math.min(maxPadY, snap(Math.max(MIN_PAINT_OVERDRAW_PX, visibleTop), PAINT_OVERDRAW_STEP_PX));
  const bottomPad = Math.min(maxPadY, snap(Math.max(MIN_PAINT_OVERDRAW_PX, visibleBottom), PAINT_OVERDRAW_STEP_PX));

  const nextLogicalW = Math.max(1, Math.round(logicalWidth + leftPad + rightPad));
  const nextLogicalH = Math.max(1, Math.round(logicalHeight + topPad + bottomPad));
  const dpr = window.devicePixelRatio || 1;
  const nextPhysicalW = Math.max(1, Math.round(nextLogicalW * dpr));
  const nextPhysicalH = Math.max(1, Math.round(nextLogicalH * dpr));

  const paintCanvas = ctx.getPaintCanvas();

  if (
    ctx.getPaintLogicalWidth() === nextLogicalW &&
    ctx.getPaintLogicalHeight() === nextLogicalH &&
    ctx.getPaintOffsetX() === leftPad &&
    ctx.getPaintOffsetY() === topPad &&
    paintCanvas.width === nextPhysicalW &&
    paintCanvas.height === nextPhysicalH
  ) {
    return;
  }

  ctx.setPaintLogicalWidth(nextLogicalW);
  ctx.setPaintLogicalHeight(nextLogicalH);
  ctx.setPaintOffsetX(leftPad);
  ctx.setPaintOffsetY(topPad);

  paintCanvas.width = nextPhysicalW;
  paintCanvas.height = nextPhysicalH;
  paintCanvas.style.width = `${nextLogicalW}px`;
  paintCanvas.style.height = `${nextLogicalH}px`;
  paintCanvas.style.left = `${-leftPad}px`;
  paintCanvas.style.top = `${-topPad}px`;
  ctx.getPaintCtx().setTransform(1, 0, 0, 1, 0, 0);
  // Canvas resize clears content; force repaint on next renderPaint()
  ctx.setPaintDirty(true);
}

/**
 * Update overlay dimensions to match display size.
 * When the crop manager has an active non-full crop, the crop region
 * is forwarded so that safe-areas guides are drawn relative to the
 * cropped sub-region.
 */
export function updateOverlayDimensions(ctx: CanvasSetupContext): void {
  const cropManager = ctx.getCropManager();
  const activeCrop = cropManager.isCropClipActive() ? cropManager.getCropState().region : null;
  ctx.getOverlayManager().updateDimensions(ctx.getDisplayWidth(), ctx.getDisplayHeight(), activeCrop);
}

/**
 * Draw placeholder content with hi-DPI support for crisp text.
 */
export function drawPlaceholder(ctx: CanvasSetupContext): void {
  setupHiDPICanvas({
    canvas: ctx.getImageCanvas(),
    ctx: ctx.getImageCtx(),
    width: ctx.getDisplayWidth(),
    height: ctx.getDisplayHeight(),
  });

  drawPlaceholderUtil(ctx.getImageCtx(), ctx.getDisplayWidth(), ctx.getDisplayHeight(), ctx.getTransformManager().zoom);
}

/**
 * Update the canvas container position based on pan and fit mode.
 */
export function updateCanvasPosition(ctx: CanvasSetupContext): void {
  const containerRect = ctx.getContainerRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;
  const transformManager = ctx.getTransformManager();
  const fitMode = transformManager.fitMode;
  const displayWidth = ctx.getDisplayWidth();
  const displayHeight = ctx.getDisplayHeight();

  // Apply pan clamping based on active fit mode
  if (fitMode === 'all') {
    transformManager.panX = 0;
    transformManager.panY = 0;
  } else if (fitMode === 'width') {
    transformManager.panX = 0;
    const margin = Math.min(50, containerHeight * 0.1);
    const maxPanY = Math.max(0, (displayHeight - containerHeight) / 2 + margin);
    transformManager.panY = Math.max(-maxPanY, Math.min(maxPanY, transformManager.panY));
  } else if (fitMode === 'height') {
    transformManager.panY = 0;
    const margin = Math.min(50, containerWidth * 0.1);
    const maxPanX = Math.max(0, (displayWidth - containerWidth) / 2 + margin);
    transformManager.panX = Math.max(-maxPanX, Math.min(maxPanX, transformManager.panX));
  }

  // Calculate base position (centered)
  const baseX = (containerWidth - displayWidth) / 2;
  const baseY = (containerHeight - displayHeight) / 2;

  // Apply pan offset
  const centerX = baseX + transformManager.panX;
  const centerY = baseY + transformManager.panY;

  ctx.getCanvasContainer().style.transform = `translate(${centerX}px, ${centerY}px)`;
}

/**
 * Update CSS backgrounds on the viewer container and canvas to match
 * the current background pattern.
 */
export function updateCSSBackground(
  container: HTMLElement,
  imageCanvas: HTMLCanvasElement,
  backgroundPatternState: BackgroundPatternState,
): void {
  const { pattern, checkerSize, customColor } = backgroundPatternState;

  if (pattern === 'black') {
    container.style.background = 'var(--viewer-bg)';
    imageCanvas.style.background = '#000';
    return;
  }

  let cssBg: string;

  switch (pattern) {
    case 'grey18':
      cssBg = PATTERN_COLORS.grey18 ?? '#2e2e2e';
      break;
    case 'grey50':
      cssBg = PATTERN_COLORS.grey50 ?? '#808080';
      break;
    case 'white':
      cssBg = '#ffffff';
      break;
    case 'checker': {
      const sizes = { small: 8, medium: 16, large: 32 };
      const sz = sizes[checkerSize];
      const light = PATTERN_COLORS.checkerLight ?? '#808080';
      const dark = PATTERN_COLORS.checkerDark ?? '#404040';
      cssBg = `repeating-conic-gradient(${dark} 0% 25%, ${light} 0% 50%) 0 0 / ${sz * 2}px ${sz * 2}px`;
      break;
    }
    case 'crosshatch': {
      const bg = PATTERN_COLORS.crosshatchBg ?? '#404040';
      const line = PATTERN_COLORS.crosshatchLine ?? '#808080';
      cssBg = `repeating-linear-gradient(45deg, transparent, transparent 5px, ${line} 5px, ${line} 6px), repeating-linear-gradient(-45deg, transparent, transparent 5px, ${line} 5px, ${line} 6px), ${bg}`;
      break;
    }
    case 'custom':
      cssBg = customColor || '#1a1a1a';
      break;
    default:
      cssBg = '#000';
  }

  container.style.background = cssBg;
  imageCanvas.style.background = cssBg;
}

/**
 * Listen for DPR changes (user moves window between displays).
 * Returns a cleanup function to remove the listener.
 */
export function listenForDPRChange(onDPRChange: () => void, previousCleanup: (() => void) | null): (() => void) | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;

  // Clean up previous listener
  previousCleanup?.();

  const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mql.addEventListener('change', onDPRChange, { once: true });
  return () => mql.removeEventListener('change', onDPRChange);
}
