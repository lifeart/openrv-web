/**
 * CropManager - Manages crop and uncrop state, overlay rendering,
 * and interactive crop handle dragging.
 *
 * Extracted from Viewer.ts to separate the crop concern from the
 * monolithic Viewer class.
 *
 * The manager owns crop/uncrop state, the crop overlay canvas, and
 * all drag interaction logic. The Viewer delegates crop operations
 * to this manager and calls its render/clear methods during the
 * render cycle.
 */

import {
  CropState,
  CropRegion,
  DEFAULT_CROP_STATE,
  DEFAULT_CROP_REGION,
  ASPECT_RATIOS,
  MIN_CROP_FRACTION,
  UncropState,
  DEFAULT_UNCROP_STATE,
} from './CropControl';
import { renderCropOverlay as renderCropOverlayUtil, isFullCropRegion } from './ViewerRenderingUtils';
import { safeCanvasContext2D } from '../../color/ColorProcessingFacade';
import { resetCanvasFromHiDPI } from '../../utils/ui/HiDPICanvas';
import { Session } from '../../core/session/Session';
import { clamp } from '../../utils/math';

/**
 * Context interface for what CropManager needs from the Viewer.
 * The Viewer implements this interface and passes itself as the context.
 */
export interface CropManagerContext {
  container: HTMLElement;
  canvasContainer: HTMLElement;
  getSession(): Session;
  getDisplayDimensions(): { width: number; height: number };
  getSourceDimensions(): { width: number; height: number };
  scheduleRender(): void;
}

export type CropDragHandle = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'move' | null;

export class CropManager {
  // Crop state
  private _cropState: CropState = { ...DEFAULT_CROP_STATE, region: { ...DEFAULT_CROP_REGION } };
  private _uncropState: UncropState = { ...DEFAULT_UNCROP_STATE };
  private cropOverlay: HTMLCanvasElement | null = null;
  private cropCtx: CanvasRenderingContext2D | null = null;
  private _isDraggingCrop = false;
  private cropDragHandle: CropDragHandle = null;
  private cropDragStart: { x: number; y: number; region: CropRegion } | null = null;
  private cropDragPointerId: number | null = null;
  private cropRegionChangedCallback: ((region: CropRegion) => void) | null = null;
  private _isCropPanelOpen = false;

  private context: CropManagerContext;

  /**
   * Whether a crop handle is currently being dragged.
   */
  get isDragging(): boolean {
    return this._isDraggingCrop;
  }

  /**
   * Whether the crop editing panel is currently open.
   */
  get isPanelOpen(): boolean {
    return this._isCropPanelOpen;
  }

  constructor(context: CropManagerContext, canvasColorSpace?: 'display-p3' | undefined) {
    this.context = context;

    // Create crop overlay canvas
    this.cropOverlay = document.createElement('canvas');
    this.cropOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    `;
    context.canvasContainer.appendChild(this.cropOverlay);
    this.cropCtx = safeCanvasContext2D(this.cropOverlay, {}, canvasColorSpace);
  }

  /**
   * Get the crop overlay element (for isViewerContentElement checks).
   */
  getOverlayElement(): HTMLCanvasElement | null {
    return this.cropOverlay;
  }

  /**
   * Reset crop overlay canvas from hi-DPI mode.
   */
  resetOverlayCanvas(width: number, height: number): void {
    if (this.cropOverlay && this.cropCtx) {
      resetCanvasFromHiDPI(this.cropOverlay, this.cropCtx, width, height);
    }
  }

  // =========================================================================
  // Crop State Methods
  // =========================================================================

  setCropState(state: CropState): void {
    this._cropState = { ...state, region: { ...state.region } };
    this.context.scheduleRender();
  }

  getCropState(): CropState {
    return { ...this._cropState, region: { ...this._cropState.region } };
  }

  setCropRegion(region: CropRegion): void {
    this._cropState.region = { ...region };
    this.context.scheduleRender();
  }

  setCropEnabled(enabled: boolean): void {
    this._cropState.enabled = enabled;
    this.context.scheduleRender();
  }

  // =========================================================================
  // Uncrop State Methods
  // =========================================================================

  setUncropState(state: UncropState): void {
    this._uncropState = { ...state };
    this.context.scheduleRender();
  }

  getUncropState(): UncropState {
    return { ...this._uncropState };
  }

  /**
   * Check if uncrop is actively adding padding to the canvas.
   */
  isUncropActive(): boolean {
    if (!this._uncropState.enabled) return false;
    if (this._uncropState.paddingMode === 'uniform') {
      return this._uncropState.padding > 0;
    }
    return this._uncropState.paddingTop > 0 || this._uncropState.paddingRight > 0 ||
           this._uncropState.paddingBottom > 0 || this._uncropState.paddingLeft > 0;
  }

  /**
   * Get effective padding in pixels for uncrop.
   */
  getUncropPadding(): { top: number; right: number; bottom: number; left: number } {
    if (!this._uncropState.enabled) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (this._uncropState.paddingMode === 'uniform') {
      const p = Math.max(0, this._uncropState.padding);
      return { top: p, right: p, bottom: p, left: p };
    }
    return {
      top: Math.max(0, this._uncropState.paddingTop),
      right: Math.max(0, this._uncropState.paddingRight),
      bottom: Math.max(0, this._uncropState.paddingBottom),
      left: Math.max(0, this._uncropState.paddingLeft),
    };
  }

  // =========================================================================
  // Crop Panel / Callback
  // =========================================================================

  /**
   * Set whether the crop panel is currently open (for overlay rendering).
   */
  setCropPanelOpen(isOpen: boolean): void {
    this._isCropPanelOpen = isOpen;
    this.renderCropOverlay();
  }

  /**
   * Register a callback for crop region changes from interactive handle dragging.
   * Uses single-consumer callback pattern consistent with other Viewer callbacks
   * (e.g., cursorColorCallback, prerenderCacheUpdateCallback).
   * Only one listener is supported — the App wires this to CropControl.setCropRegion.
   */
  setOnCropRegionChanged(callback: ((region: CropRegion) => void) | null): void {
    this.cropRegionChangedCallback = callback;
  }

  // =========================================================================
  // Render Methods
  // =========================================================================

  /**
   * Render crop overlay on the overlay canvas.
   * Shows full editing overlay when panel is open or dragging,
   * subtle indicator otherwise.
   */
  renderCropOverlay(): void {
    if (!this.cropOverlay || !this.cropCtx) return;
    const { width, height } = this.context.getDisplayDimensions();
    const isEditing = this._isCropPanelOpen || this._isDraggingCrop;
    renderCropOverlayUtil(this.cropCtx, this._cropState, width, height, isEditing);
  }

  /**
   * Clear pixels outside the crop region to implement pixel-level clipping.
   * This approach is used instead of ctx.clip() because putImageData() ignores clip regions.
   */
  clearOutsideCropRegion(imageCtx: CanvasRenderingContext2D, displayWidth: number, displayHeight: number): void {
    const { x, y, width, height } = this._cropState.region;
    // Use floor for positions and ceil for the far edge to avoid 1px gaps
    const cropX = Math.floor(x * displayWidth);
    const cropY = Math.floor(y * displayHeight);
    const cropRight = Math.ceil((x + width) * displayWidth);
    const cropBottom = Math.ceil((y + height) * displayHeight);
    const cropH = cropBottom - cropY;

    // Clear the four regions outside the crop area
    // Top
    if (cropY > 0) {
      imageCtx.clearRect(0, 0, displayWidth, cropY);
    }
    // Bottom
    if (cropBottom < displayHeight) {
      imageCtx.clearRect(0, cropBottom, displayWidth, displayHeight - cropBottom);
    }
    // Left
    if (cropX > 0) {
      imageCtx.clearRect(0, cropY, cropX, cropH);
    }
    // Right
    if (cropRight < displayWidth) {
      imageCtx.clearRect(cropRight, cropY, displayWidth - cropRight, cropH);
    }
  }

  /**
   * Draw the uncrop padding background - a subtle checkerboard pattern
   * to visually distinguish the padding area from the image content.
   */
  drawUncropBackground(
    imageCtx: CanvasRenderingContext2D,
    displayWidth: number,
    displayHeight: number,
    imageX: number,
    imageY: number,
    imageW: number,
    imageH: number
  ): void {
    const ctx = imageCtx;
    const tileSize = 8;

    // Resolve theme colors for checker pattern
    const style = getComputedStyle(document.documentElement);
    const darkColor = style.getPropertyValue('--bg-primary').trim() || '#1a1a1a';
    const lightColor = style.getPropertyValue('--bg-tertiary').trim() || '#2d2d2d';

    // Draw checkerboard in the padding areas (top, bottom, left, right strips)
    const regions = [
      // Top strip
      { x: 0, y: 0, w: displayWidth, h: imageY },
      // Bottom strip
      { x: 0, y: imageY + imageH, w: displayWidth, h: displayHeight - (imageY + imageH) },
      // Left strip (between top and bottom)
      { x: 0, y: imageY, w: imageX, h: imageH },
      // Right strip (between top and bottom)
      { x: imageX + imageW, y: imageY, w: displayWidth - (imageX + imageW), h: imageH },
    ];

    for (const region of regions) {
      if (region.w <= 0 || region.h <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(region.x, region.y, region.w, region.h);
      ctx.clip();

      // Draw checkerboard
      const startCol = Math.floor(region.x / tileSize);
      const endCol = Math.ceil((region.x + region.w) / tileSize);
      const startRow = Math.floor(region.y / tileSize);
      const endRow = Math.ceil((region.y + region.h) / tileSize);

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? darkColor : lightColor;
          ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
        }
      }
      ctx.restore();
    }

    // Draw a subtle border around the image area to delineate it from padding
    ctx.strokeStyle = style.getPropertyValue('--border-primary').trim() || '#444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(imageX + 0.5, imageY + 0.5, imageW - 1, imageH - 1);
    ctx.setLineDash([]);
  }

  /**
   * Check if crop clipping should be applied (crop enabled with non-full region).
   */
  isCropClipActive(): boolean {
    return this._cropState.enabled && !isFullCropRegion(this._cropState.region);
  }

  /**
   * Get the crop region for export (returns undefined if crop is not enabled).
   */
  getExportCropRegion(): CropRegion | undefined {
    return this._cropState.enabled ? this._cropState.region : undefined;
  }

  // =========================================================================
  // Crop Dragging Methods
  // =========================================================================

  getCropHandleAtPoint(clientX: number, clientY: number): CropDragHandle {
    if (!this._cropState.enabled || !this.cropOverlay || !this._isCropPanelOpen) return null;

    const rect = this.cropOverlay.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const region = this._cropState.region;
    // Hit area is 16px (2x the visual 8px handle in renderCropOverlay) for easier targeting.
    // Use separate X/Y thresholds since normalized coords scale differently on non-square canvases.
    const handleSizeX = 16 / rect.width;
    const handleSizeY = 16 / rect.height;

    // Check corners first (higher priority)
    // Top-left
    if (Math.abs(x - region.x) < handleSizeX && Math.abs(y - region.y) < handleSizeY) {
      return 'tl';
    }
    // Top-right
    if (Math.abs(x - (region.x + region.width)) < handleSizeX && Math.abs(y - region.y) < handleSizeY) {
      return 'tr';
    }
    // Bottom-left
    if (Math.abs(x - region.x) < handleSizeX && Math.abs(y - (region.y + region.height)) < handleSizeY) {
      return 'bl';
    }
    // Bottom-right
    if (Math.abs(x - (region.x + region.width)) < handleSizeX && Math.abs(y - (region.y + region.height)) < handleSizeY) {
      return 'br';
    }

    // Check edges (only when region is large enough to have distinct edge zones)
    const edgeThresholdX = handleSizeX / 2;
    const edgeThresholdY = handleSizeY / 2;
    const hasHorizontalEdge = region.width > 2 * handleSizeX;
    const hasVerticalEdge = region.height > 2 * handleSizeY;

    // Top edge
    if (hasHorizontalEdge &&
        x > region.x + handleSizeX && x < region.x + region.width - handleSizeX &&
        Math.abs(y - region.y) < edgeThresholdY) {
      return 'top';
    }
    // Bottom edge
    if (hasHorizontalEdge &&
        x > region.x + handleSizeX && x < region.x + region.width - handleSizeX &&
        Math.abs(y - (region.y + region.height)) < edgeThresholdY) {
      return 'bottom';
    }
    // Left edge
    if (hasVerticalEdge &&
        y > region.y + handleSizeY && y < region.y + region.height - handleSizeY &&
        Math.abs(x - region.x) < edgeThresholdX) {
      return 'left';
    }
    // Right edge
    if (hasVerticalEdge &&
        y > region.y + handleSizeY && y < region.y + region.height - handleSizeY &&
        Math.abs(x - (region.x + region.width)) < edgeThresholdX) {
      return 'right';
    }

    // Check if inside region (for moving)
    if (x > region.x && x < region.x + region.width &&
        y > region.y && y < region.y + region.height) {
      return 'move';
    }

    return null;
  }

  handleCropPointerDown(e: PointerEvent): boolean {
    // Only intercept events when the crop panel is open (editing mode).
    // When closed, let other tools (pan, zoom, paint, wipe) handle the event.
    if (!this._cropState.enabled || !this.cropOverlay || !this._isCropPanelOpen) return false;

    const handle = this.getCropHandleAtPoint(e.clientX, e.clientY);
    if (!handle) return false;

    this._isDraggingCrop = true;
    this.cropDragHandle = handle;
    this.cropDragPointerId = e.pointerId;

    // Capture pointer so drag continues even if cursor leaves the container
    this.context.container.setPointerCapture(e.pointerId);

    const rect = this.cropOverlay.getBoundingClientRect();
    this.cropDragStart = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      region: { ...this._cropState.region },
    };

    // Set appropriate cursor
    this.updateCropCursor(handle);

    return true;
  }

  handleCropPointerMove(e: PointerEvent): void {
    if (!this._isDraggingCrop || !this.cropDragStart || !this.cropDragHandle || !this.cropOverlay) return;

    const rect = this.cropOverlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const dx = x - this.cropDragStart.x;
    const dy = y - this.cropDragStart.y;
    const startRegion = this.cropDragStart.region;

    let newRegion: CropRegion = { ...startRegion };

    switch (this.cropDragHandle) {
      case 'move':
        newRegion.x = clamp(startRegion.x + dx, 0, 1 - startRegion.width);
        newRegion.y = clamp(startRegion.y + dy, 0, 1 - startRegion.height);
        break;
      case 'tl':
        newRegion.x = clamp(startRegion.x + dx, 0, startRegion.x + startRegion.width - MIN_CROP_FRACTION);
        newRegion.y = clamp(startRegion.y + dy, 0, startRegion.y + startRegion.height - MIN_CROP_FRACTION);
        newRegion.width = startRegion.x + startRegion.width - newRegion.x;
        newRegion.height = startRegion.y + startRegion.height - newRegion.y;
        break;
      case 'tr':
        newRegion.width = clamp(startRegion.width + dx, MIN_CROP_FRACTION, 1 - startRegion.x);
        newRegion.y = clamp(startRegion.y + dy, 0, startRegion.y + startRegion.height - MIN_CROP_FRACTION);
        newRegion.height = startRegion.y + startRegion.height - newRegion.y;
        break;
      case 'bl':
        newRegion.x = clamp(startRegion.x + dx, 0, startRegion.x + startRegion.width - MIN_CROP_FRACTION);
        newRegion.width = startRegion.x + startRegion.width - newRegion.x;
        newRegion.height = clamp(startRegion.height + dy, MIN_CROP_FRACTION, 1 - startRegion.y);
        break;
      case 'br':
        newRegion.width = clamp(startRegion.width + dx, MIN_CROP_FRACTION, 1 - startRegion.x);
        newRegion.height = clamp(startRegion.height + dy, MIN_CROP_FRACTION, 1 - startRegion.y);
        break;
      case 'top':
        newRegion.y = clamp(startRegion.y + dy, 0, startRegion.y + startRegion.height - MIN_CROP_FRACTION);
        newRegion.height = startRegion.y + startRegion.height - newRegion.y;
        break;
      case 'bottom':
        newRegion.height = clamp(startRegion.height + dy, MIN_CROP_FRACTION, 1 - startRegion.y);
        break;
      case 'left':
        newRegion.x = clamp(startRegion.x + dx, 0, startRegion.x + startRegion.width - MIN_CROP_FRACTION);
        newRegion.width = startRegion.x + startRegion.width - newRegion.x;
        break;
      case 'right':
        newRegion.width = clamp(startRegion.width + dx, MIN_CROP_FRACTION, 1 - startRegion.x);
        break;
    }

    // Apply aspect ratio constraint if set
    if (this._cropState.aspectRatio && this.cropDragHandle !== 'move') {
      newRegion = this.constrainToAspectRatio(newRegion, this.cropDragHandle);
    }

    // Enforce minimum crop size to prevent zero-area regions
    newRegion.width = Math.max(MIN_CROP_FRACTION, newRegion.width);
    newRegion.height = Math.max(MIN_CROP_FRACTION, newRegion.height);

    this._cropState.region = newRegion;
    this.context.scheduleRender();
  }

  constrainToAspectRatio(region: CropRegion, handle: CropDragHandle): CropRegion {
    // Look up target pixel ratio from the shared ASPECT_RATIOS constant
    const arEntry = ASPECT_RATIOS.find(a => a.value === this._cropState.aspectRatio);
    if (!arEntry?.ratio) return region;

    // Account for source aspect ratio: normalized coords don't map 1:1 to pixels
    const source = this.context.getSession().currentSource;
    const sourceWidth = source?.width ?? 1;
    const sourceHeight = source?.height ?? 1;
    if (sourceWidth <= 0 || sourceHeight <= 0) return region;
    const sourceAspect = sourceWidth / sourceHeight;

    // Convert target pixel ratio to normalized coordinate ratio
    const normalizedTargetRatio = arEntry.ratio / sourceAspect;
    if (!Number.isFinite(normalizedTargetRatio) || normalizedTargetRatio <= 0) return region;

    const result = { ...region };

    // Determine whether to adjust width or height based on the handle being dragged.
    // Edge drags: adjust the dimension perpendicular to the edge being dragged.
    // Corner drags: adjust whichever dimension is "too large" relative to the ratio.
    const adjustWidth =
      (handle === 'top' || handle === 'bottom')
        ? true  // Vertical edge: user controls height, width follows
        : (handle === 'left' || handle === 'right')
          ? false  // Horizontal edge: user controls width, height follows
          : (result.width / result.height > normalizedTargetRatio);  // Corner: shrink the larger dimension

    if (adjustWidth) {
      result.width = result.height * normalizedTargetRatio;
    } else {
      result.height = result.width / normalizedTargetRatio;
    }

    // For edge drags, preserve the anchor (the fixed opposite edge)
    if (handle === 'left' || handle === 'tl' || handle === 'bl') {
      const rightEdge = region.x + region.width;
      result.x = rightEdge - result.width;
    }
    if (handle === 'top' || handle === 'tl' || handle === 'tr') {
      const bottomEdge = region.y + region.height;
      result.y = bottomEdge - result.height;
    }

    // Clamp to bounds while preserving aspect ratio (single pass).
    // Compute the maximum size that fits within [0,1] at the current position,
    // then take the minimum of current size and max allowed size.
    const maxW = Math.min(result.width, 1 - Math.max(0, result.x));
    const maxH = Math.min(result.height, 1 - Math.max(0, result.y));

    // The constraining dimension is whichever hits the bound first
    const wFromH = maxH * normalizedTargetRatio;
    const hFromW = maxW / normalizedTargetRatio;

    if (maxW < result.width || maxH < result.height) {
      if (wFromH <= maxW) {
        result.width = wFromH;
        result.height = maxH;
      } else {
        result.width = maxW;
        result.height = hFromW;
      }
    }

    // Final position clamp
    result.x = clamp(result.x, 0, 1 - result.width);
    result.y = clamp(result.y, 0, 1 - result.height);

    return result;
  }

  handleCropPointerUp(): void {
    if (this._isDraggingCrop && this.cropRegionChangedCallback) {
      this.cropRegionChangedCallback({ ...this._cropState.region });
    }
    // Release pointer capture
    if (this.cropDragPointerId !== null) {
      try { this.context.container.releasePointerCapture(this.cropDragPointerId); } catch (e) { if (typeof console !== 'undefined') console.debug('Pointer capture already released', e); }
      this.cropDragPointerId = null;
    }
    this._isDraggingCrop = false;
    this.cropDragHandle = null;
    this.cropDragStart = null;
    this.context.container.style.cursor = 'grab';
  }

  updateCropCursor(handle: CropDragHandle): void {
    const cursors: Record<string, string> = {
      'tl': 'nwse-resize',
      'br': 'nwse-resize',
      'tr': 'nesw-resize',
      'bl': 'nesw-resize',
      'top': 'ns-resize',
      'bottom': 'ns-resize',
      'left': 'ew-resize',
      'right': 'ew-resize',
      'move': 'move',
    };
    this.context.container.style.cursor = handle ? (cursors[handle] || 'default') : 'default';
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose(): void {
    // Cleanup crop drag state
    if (this._isDraggingCrop && this.cropDragPointerId !== null) {
      try { this.context.container.releasePointerCapture(this.cropDragPointerId); } catch (e) { if (typeof console !== 'undefined') console.debug('Pointer capture already released', e); }
    }
    this._isDraggingCrop = false;
    this.cropDragHandle = null;
    this.cropDragStart = null;
    this.cropDragPointerId = null;
    this.cropRegionChangedCallback = null;
  }
}
