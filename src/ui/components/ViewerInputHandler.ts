/**
 * ViewerInputHandler
 *
 * Encapsulates all pointer, wheel, and drag-and-drop event handling
 * that was previously inline in Viewer.ts.  The handler owns the
 * transient interaction state (panning flag, active pointers, live
 * paint strokes / shapes) and communicates with the Viewer through
 * the `ViewerInputContext` interface so neither module imports the
 * other's concrete class.
 */

import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { StrokePoint, ShapeType, Point } from '../../paint/types';
import { Session } from '../../core/session/Session';
import { filterImageFiles, getBestSequence } from '../../utils/media/SequenceLoader';
import { showAlert } from './shared/Modal';
import {
  PointerState,
  getCanvasPoint as getCanvasPointUtil,
  calculateWheelZoom,
  calculateZoomPan,
  calculatePinchDistance,
  calculatePinchZoom,
} from './ViewerInteraction';
import type { TransformManager } from './TransformManager';
import type { WipeManager } from './WipeManager';
import type { CropManager } from './CropManager';
import type { PixelProbe } from './PixelProbe';
import type { InteractionQualityManager } from './InteractionQualityManager';
import type { PixelBuffer, PaintToolInterface, BrushParams } from '../../paint/AdvancedPaintTools';
import { CloneTool } from '../../paint/AdvancedPaintTools';
import type { SphericalProjection } from '../../render/SphericalProjection';
import type { Renderer } from '../../render/Renderer';

// ---------------------------------------------------------------------------
// Context interface – the "thin adapter" that the Viewer supplies so that
// the input handler can read viewer state and trigger side-effects without
// depending on the Viewer class directly.
// ---------------------------------------------------------------------------
export interface ViewerInputContext {
  // DOM elements
  getContainer(): HTMLElement;
  getCanvasContainer(): HTMLElement;
  getImageCanvas(): HTMLCanvasElement;
  getPaintCanvas(): HTMLCanvasElement;

  // Canvas contexts
  getPaintCtx(): CanvasRenderingContext2D;
  getImageCtx(): CanvasRenderingContext2D;

  // Dimensions
  getDisplayWidth(): number;
  getDisplayHeight(): number;
  getSourceWidth(): number;
  getSourceHeight(): number;

  // Rect accessors (use the cached versions from Viewer)
  getContainerRect(): DOMRect;
  getCanvasContainerRect(): DOMRect;
  getImageCanvasRect(): DOMRect;

  // Managers
  getTransformManager(): TransformManager;
  getWipeManager(): WipeManager;
  getCropManager(): CropManager;
  getPaintEngine(): PaintEngine;
  getPaintRenderer(): PaintRenderer;
  getSession(): Session;
  getPixelProbe(): PixelProbe;

  // Interaction quality tiering
  getInteractionQuality(): InteractionQualityManager;

  // Spherical (360) projection – null when not wired
  getSphericalProjection(): SphericalProjection | null;

  // GL renderer – null when WebGL rendering is not active
  getGLRenderer(): Renderer | null;

  // Whether the GL renderer is currently active (HDR or SDR WebGL mode)
  isGLRendererActive(): boolean;

  // Viewer helpers that the handler needs to invoke
  isViewerContentElement(element: HTMLElement): boolean;
  scheduleRender(): void;
  updateCanvasPosition(): void;
  updateSphericalUniforms(): void;
  renderPaint(): void;

  /**
   * Invalidate the GL render cache so the next scheduleRender() forces a
   * full redraw instead of skipping due to same-image optimization.
   */
  invalidateGLRenderCache(): void;
}

// ---------------------------------------------------------------------------
// ViewerInputHandler
// ---------------------------------------------------------------------------
export class ViewerInputHandler {
  // Interaction state
  private isPanning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private activePointers: Map<number, PointerState> = new Map();

  // Paint drawing state
  private isDrawing = false;
  private livePoints: StrokePoint[] = [];

  // Shape drawing state
  private isDrawingShape = false;
  private shapeStartPoint: Point | null = null;
  private shapeCurrentPoint: Point | null = null;

  // Advanced (pixel-destructive) tool drawing state
  private isAdvancedDrawing = false;
  private activePixelBuffer: PixelBuffer | null = null;
  /** Read-only snapshot of the original pixels before the stroke began.
   *  Tools like clone and smudge sample from this to avoid feedback artifacts. */
  private activeSourceBuffer: PixelBuffer | null = null;
  private activeAdvancedTool: PaintToolInterface | null = null;
  /** Whether the active pixel buffer was extracted from the GL renderer (HDR path) */
  private _isHDRBuffer = false;

  // Spherical (360) drag state
  private isSphericalDragging = false;

  // Drop zone overlay
  private dropOverlay: HTMLElement;

  // Text input overlay state
  private activeTextOverlay: HTMLTextAreaElement | null = null;

  constructor(
    private ctx: ViewerInputContext,
    dropOverlay: HTMLElement,
  ) {
    this.dropOverlay = dropOverlay;
  }

  // ======================================================================
  // Event binding / unbinding (called from Viewer.bindEvents / dispose)
  // ======================================================================

  bindEvents(): void {
    const container = this.ctx.getContainer();

    // Unified pointer events
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('pointercancel', this.onPointerUp);
    container.addEventListener('pointerleave', this.onPointerLeave);

    // Wheel for zoom
    container.addEventListener('wheel', this.onWheel, { passive: false });

    // Drag and drop
    container.addEventListener('dragenter', this.onDragEnter);
    container.addEventListener('dragleave', this.onDragLeave);
    container.addEventListener('dragover', this.onDragOver);
    container.addEventListener('drop', this.onDrop);

    // Prevent context menu on long press when a paint tool is active
    container.addEventListener('contextmenu', this.onContextMenu);
  }

  unbindEvents(): void {
    const container = this.ctx.getContainer();

    container.removeEventListener('pointerdown', this.onPointerDown);
    container.removeEventListener('pointermove', this.onPointerMove);
    container.removeEventListener('pointerup', this.onPointerUp);
    container.removeEventListener('pointercancel', this.onPointerUp);
    container.removeEventListener('pointerleave', this.onPointerLeave);
    container.removeEventListener('wheel', this.onWheel);
    container.removeEventListener('dragenter', this.onDragEnter);
    container.removeEventListener('dragleave', this.onDragLeave);
    container.removeEventListener('dragover', this.onDragOver);
    container.removeEventListener('drop', this.onDrop);
    container.removeEventListener('contextmenu', this.onContextMenu);

    // Clean up any active text input overlay
    this.dismissTextOverlay(false);
  }

  // ======================================================================
  // Public queries – used by Viewer.render() to decide live stroke display
  // ======================================================================

  get drawing(): boolean {
    return this.isDrawing;
  }

  get drawingShape(): boolean {
    return this.isDrawingShape;
  }

  get currentLivePoints(): StrokePoint[] {
    return this.livePoints;
  }

  get currentShapeStart(): Point | null {
    return this.shapeStartPoint;
  }

  get currentShapeCurrent(): Point | null {
    return this.shapeCurrentPoint;
  }

  get advancedDrawing(): boolean {
    return this.isAdvancedDrawing;
  }

  // ======================================================================
  // Cursor management
  // ======================================================================

  updateCursor(tool: PaintTool): void {
    const container = this.ctx.getContainer();
    if (this.ctx.getPixelProbe().isEnabled()) {
      container.style.cursor = 'crosshair';
      return;
    }

    switch (tool) {
      case 'pen':
      case 'eraser':
      case 'rectangle':
      case 'ellipse':
      case 'line':
      case 'arrow':
      case 'dodge':
      case 'burn':
      case 'clone':
      case 'smudge':
        container.style.cursor = 'crosshair';
        break;
      case 'text':
        container.style.cursor = 'text';
        break;
      default:
        // Plugin advanced tools get crosshair cursor
        container.style.cursor = this.ctx.getPaintEngine().isAdvancedTool(tool)
          ? 'crosshair'
          : 'grab';
    }
  }

  updateCursorForProbe(enabled: boolean): void {
    if (enabled) {
      this.ctx.getContainer().style.cursor = 'crosshair';
    } else {
      this.updateCursor(this.ctx.getPaintEngine().tool);
    }
  }

  // ======================================================================
  // Pointer events
  // ======================================================================

  private getCanvasPoint(clientX: number, clientY: number, pressure = 0.5): StrokePoint | null {
    const rect = this.ctx.getImageCanvasRect();
    return getCanvasPointUtil(clientX, clientY, rect, this.ctx.getDisplayWidth(), this.ctx.getDisplayHeight(), pressure);
  }

  private onPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    if (!this.ctx.isViewerContentElement(target)) {
      return;
    }

    const container = this.ctx.getContainer();
    container.setPointerCapture(e.pointerId);

    // Check wipe line dragging
    if (this.ctx.getWipeManager().handlePointerDown(e)) {
      return;
    }

    // Check crop handle dragging
    if (this.ctx.getCropManager().handleCropPointerDown(e)) {
      return;
    }

    this.activePointers.set(e.pointerId, {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    });

    const paintEngine = this.ctx.getPaintEngine();
    const tool = paintEngine.tool;
    const session = this.ctx.getSession();

    // Two-finger pinch zoom
    if (this.activePointers.size === 2) {
      this.startPinchZoom();
      return;
    }

    // Single pointer interaction
    if (this.activePointers.size === 1) {
      if (tool === 'pen' || tool === 'eraser') {
        const point = this.getCanvasPoint(e.clientX, e.clientY, e.pressure || 0.5);
        if (point) {
          this.isDrawing = true;
          this.livePoints = [point];
          paintEngine.beginStroke(session.currentFrame, point);
          this.renderLiveStroke();
        }
      } else if (tool === 'text') {
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        if (point) {
          this.showTextInputOverlay(e.clientX, e.clientY, point);
        }
      } else if (this.isShapeTool(tool)) {
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        if (point) {
          this.isDrawingShape = true;
          this.shapeStartPoint = { x: point.x, y: point.y };
          this.shapeCurrentPoint = { x: point.x, y: point.y };
          this.renderLiveShape();
        }
      } else if (this.isAdvancedTool(tool)) {
        const point = this.getCanvasPoint(e.clientX, e.clientY, e.pressure || 0.5);
        if (point) {
          // Alt-click sets the clone tool source point
          if (e.altKey && tool === 'clone') {
            const paintEngine = this.ctx.getPaintEngine();
            const cloneTool = paintEngine.getAdvancedTool('clone');
            if (cloneTool instanceof CloneTool) {
              const pixelPos = this.toPixelCoords(point);
              cloneTool.setSource(pixelPos);
            }
          } else {
            this.beginAdvancedStroke(point, e.pressure || 0.5);
          }
        }
      } else if (e.button === 0 || e.pointerType === 'touch') {
        // Spherical (360) drag mode: route to SphericalProjection when enabled
        const sp = this.ctx.getSphericalProjection();
        if (sp && sp.enabled) {
          this.isSphericalDragging = true;
          sp.beginDrag(e.clientX, e.clientY);
          container.style.cursor = 'grabbing';
        } else {
          // Pan mode
          this.isPanning = true;
          this.lastPointerX = e.clientX;
          this.lastPointerY = e.clientY;
          container.style.cursor = 'grabbing';
        }
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const wipeManager = this.ctx.getWipeManager();
    const cropManager = this.ctx.getCropManager();

    // Wipe / split dragging
    if (wipeManager.isDragging) {
      const canvasRect = this.ctx.getCanvasContainerRect();
      const containerRect = this.ctx.getContainerRect();
      if (wipeManager.handlePointerMove(e, canvasRect, containerRect, this.ctx.getDisplayWidth(), this.ctx.getDisplayHeight())) {
        this.ctx.scheduleRender();
      }
      return;
    }

    // Crop dragging
    if (cropManager.isDragging) {
      cropManager.handleCropPointerMove(e);
      return;
    }

    // Update cursor for crop handles on hover
    if (cropManager.getCropState().enabled && cropManager.isPanelOpen && !this.activePointers.size) {
      const handle = cropManager.getCropHandleAtPoint(e.clientX, e.clientY);
      cropManager.updateCropCursor(handle);
    }

    if (!this.activePointers.has(e.pointerId)) return;

    // Update pointer position
    const pointer = this.activePointers.get(e.pointerId)!;
    pointer.x = e.clientX;
    pointer.y = e.clientY;

    const tm = this.ctx.getTransformManager();

    // Pinch zoom
    if (this.activePointers.size === 2 && tm.initialPinchDistance > 0) {
      this.handlePinchZoom();
      return;
    }

    if (this.isDrawing) {
      const point = this.getCanvasPoint(e.clientX, e.clientY, e.pressure || 0.5);
      if (point) {
        this.livePoints.push(point);
        this.ctx.getPaintEngine().continueStroke(point);
        this.renderLiveStroke();
      }
    } else if (this.isAdvancedDrawing) {
      const point = this.getCanvasPoint(e.clientX, e.clientY, e.pressure || 0.5);
      if (point) {
        this.continueAdvancedStroke(point, e.pressure || 0.5);
      }
    } else if (this.isDrawingShape) {
      const point = this.getCanvasPoint(e.clientX, e.clientY);
      if (point) {
        this.shapeCurrentPoint = { x: point.x, y: point.y };
        this.renderLiveShape();
      }
    } else if (this.isSphericalDragging) {
      const sp = this.ctx.getSphericalProjection();
      if (sp) {
        sp.drag(e.clientX, e.clientY, this.ctx.getDisplayWidth(), this.ctx.getDisplayHeight());
        this.ctx.updateSphericalUniforms();
      }
    } else if (this.isPanning) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;

      tm.panX += dx;
      tm.panY += dy;

      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      this.ctx.updateCanvasPosition();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.ctx.getContainer().releasePointerCapture(e.pointerId);

    const wipeManager = this.ctx.getWipeManager();
    if (wipeManager.isDragging) {
      wipeManager.handlePointerUp();
      return;
    }

    const cropManager = this.ctx.getCropManager();
    if (cropManager.isDragging) {
      cropManager.handleCropPointerUp();
      return;
    }

    this.activePointers.delete(e.pointerId);

    // Reset pinch zoom state
    if (this.activePointers.size < 2) {
      if (this.ctx.getTransformManager().initialPinchDistance > 0) {
        this.ctx.getInteractionQuality().endInteraction();
      }
      this.ctx.getTransformManager().initialPinchDistance = 0;
    }

    if (this.isDrawing) {
      this.isDrawing = false;
      this.ctx.getPaintEngine().endStroke();
      this.livePoints = [];
      this.ctx.renderPaint();
    }

    if (this.isAdvancedDrawing) {
      this.endAdvancedStroke();
    }

    if (this.isDrawingShape) {
      this.finalizeShape();
    }

    if (this.isSphericalDragging) {
      this.isSphericalDragging = false;
      const sp = this.ctx.getSphericalProjection();
      if (sp) {
        sp.endDrag();
      }
      const paintEngine = this.ctx.getPaintEngine();
      if (paintEngine.tool === 'none') {
        this.ctx.getContainer().style.cursor = 'grab';
      } else {
        this.updateCursor(paintEngine.tool);
      }
    }

    if (this.isPanning) {
      this.isPanning = false;
      const paintEngine = this.ctx.getPaintEngine();
      if (paintEngine.tool === 'none') {
        this.ctx.getContainer().style.cursor = 'grab';
      } else {
        this.updateCursor(paintEngine.tool);
      }
    }
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (this.ctx.getContainer().hasPointerCapture(e.pointerId)) return;
    this.onPointerUp(e);
  };

  // ======================================================================
  // Pinch zoom
  // ======================================================================

  private startPinchZoom(): void {
    const pointers = Array.from(this.activePointers.values());
    if (pointers.length !== 2) return;

    this.ctx.getInteractionQuality().beginInteraction();

    const tm = this.ctx.getTransformManager();
    tm.cancelZoomAnimation();
    tm.initialPinchDistance = calculatePinchDistance(pointers);
    tm.initialZoom = tm.zoom;

    // Cancel any drawing in progress
    if (this.isDrawing) {
      this.isDrawing = false;
      this.livePoints = [];
      this.ctx.getPaintEngine().endStroke();
    }

    // Cancel any advanced tool drawing
    if (this.isAdvancedDrawing) {
      this.isAdvancedDrawing = false;
      if (this.activeAdvancedTool) {
        this.activeAdvancedTool.endStroke();
      }
      this.activePixelBuffer = null;
      this.activeAdvancedTool = null;
    }

    // Cancel any shape drawing
    if (this.isDrawingShape) {
      this.isDrawingShape = false;
      this.shapeStartPoint = null;
      this.shapeCurrentPoint = null;
    }
  }

  private handlePinchZoom(): void {
    const pointers = Array.from(this.activePointers.values());
    const tm = this.ctx.getTransformManager();
    const currentDistance = calculatePinchDistance(pointers);
    const newZoom = calculatePinchZoom(tm.initialPinchDistance, currentDistance, tm.initialZoom);

    if (newZoom !== null && Math.abs(newZoom - tm.zoom) > 0.01) {
      tm.zoom = newZoom;
      this.ctx.scheduleRender();
    }
  }

  // ======================================================================
  // Wheel zoom
  // ======================================================================

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();

    // Spherical (360) FOV zoom: when spherical projection is enabled,
    // route wheel events to adjust the field of view instead of pan/zoom.
    const sp = this.ctx.getSphericalProjection();
    if (sp && sp.enabled) {
      sp.handleWheel(e.deltaY);
      this.ctx.updateSphericalUniforms();
      return;
    }

    this.ctx.getInteractionQuality().beginInteraction();

    const tm = this.ctx.getTransformManager();
    tm.cancelZoomAnimation();

    const rect = this.ctx.getContainerRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = calculateWheelZoom(e.deltaY, tm.zoom);
    if (newZoom === null) {
      this.ctx.getInteractionQuality().endInteraction();
      return;
    }

    const containerWidth = rect.width || 640;
    const containerHeight = rect.height || 360;

    const { panX, panY } = calculateZoomPan(
      mouseX,
      mouseY,
      containerWidth,
      containerHeight,
      this.ctx.getSourceWidth(),
      this.ctx.getSourceHeight(),
      tm.panX,
      tm.panY,
      tm.zoom,
      newZoom,
    );

    tm.panX = panX;
    tm.panY = panY;
    tm.zoom = newZoom;
    this.ctx.scheduleRender();

    this.ctx.getInteractionQuality().endInteraction();
  };

  // ======================================================================
  // Drag and drop
  // ======================================================================

  private onDragEnter = (e: DragEvent): void => {
    e.preventDefault();
    this.dropOverlay.style.display = 'flex';
  };

  private onDragLeave = (e: DragEvent): void => {
    e.preventDefault();
    if (e.relatedTarget && this.ctx.getContainer().contains(e.relatedTarget as Node)) return;
    this.dropOverlay.style.display = 'none';
  };

  private onDragOver = (e: DragEvent): void => {
    e.preventDefault();
  };

  private onDrop = async (e: DragEvent): Promise<void> => {
    e.preventDefault();
    this.dropOverlay.style.display = 'none';

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const session = this.ctx.getSession();

    // Check for sequence
    const imageFiles = filterImageFiles(fileArray);
    if (imageFiles.length > 1) {
      const bestSequence = getBestSequence(imageFiles);
      if (bestSequence && bestSequence.length > 1) {
        try {
          await session.loadSequence(bestSequence);
          return;
        } catch (err) {
          console.error('Failed to load sequence:', err);
          showAlert(`Failed to load sequence: ${err}`, { type: 'error', title: 'Load Error' });
          return;
        }
      }
    }

    // Single file or mixed files
    for (const file of fileArray) {
      try {
        if (file.name.toLowerCase().endsWith('.rv') || file.name.toLowerCase().endsWith('.gto')) {
          const content = await file.arrayBuffer();
          await session.loadFromGTO(content);
        } else {
          await session.loadFile(file);
        }
      } catch (err) {
        console.error('Failed to load file:', err);
        showAlert(`Failed to load ${file.name}: ${err}`, { type: 'error', title: 'Load Error' });
      }
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.ctx.getPaintEngine().tool !== 'none') {
      e.preventDefault();
    }
  };

  // ======================================================================
  // Text input overlay
  // ======================================================================

  private showTextInputOverlay(clientX: number, clientY: number, point: StrokePoint): void {
    // Dismiss any existing overlay first (commit its text)
    if (this.activeTextOverlay) {
      this.dismissTextOverlay(true);
    }

    const container = this.ctx.getContainer();
    const containerRect = this.ctx.getContainerRect();

    // Position relative to the container
    const left = clientX - containerRect.left;
    const top = clientY - containerRect.top;

    const textarea = document.createElement('textarea');
    textarea.dataset.testid = 'text-input-overlay';
    textarea.style.cssText = `
      position: absolute;
      left: ${left}px;
      top: ${top}px;
      min-width: 120px;
      min-height: 40px;
      padding: 4px 6px;
      font-family: sans-serif;
      font-size: 14px;
      color: #fff;
      background: rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 3px;
      outline: none;
      resize: both;
      z-index: 1000;
      white-space: pre-wrap;
      overflow: auto;
    `;

    // Store the canvas point for later use when committing
    (textarea as HTMLTextAreaElement & { _canvasPoint: StrokePoint })._canvasPoint = point;

    let committed = false;
    const commit = (): void => {
      if (committed) return;
      committed = true;
      const text = textarea.value.trim();
      if (text) {
        const paintEngine = this.ctx.getPaintEngine();
        const session = this.ctx.getSession();
        const canvasPoint = (textarea as HTMLTextAreaElement & { _canvasPoint: StrokePoint })._canvasPoint;
        paintEngine.addText(session.currentFrame, canvasPoint, text);
        this.ctx.renderPaint();
      }
      this.removeTextOverlay();
    };

    const cancel = (): void => {
      if (committed) return;
      committed = true;
      this.removeTextOverlay();
    };

    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        commit();
      }
    });

    textarea.addEventListener('blur', () => {
      // Use a microtask to allow Escape keydown to fire before blur commits
      queueMicrotask(() => {
        if (!committed) {
          commit();
        }
      });
    });

    // Prevent pointer events on the textarea from triggering pan/paint
    textarea.addEventListener('pointerdown', (e: PointerEvent) => {
      e.stopPropagation();
    });

    container.appendChild(textarea);
    this.activeTextOverlay = textarea;

    // Auto-focus after appending to DOM
    textarea.focus();
  }

  private removeTextOverlay(): void {
    if (this.activeTextOverlay && this.activeTextOverlay.parentNode) {
      this.activeTextOverlay.parentNode.removeChild(this.activeTextOverlay);
    }
    this.activeTextOverlay = null;
  }

  private dismissTextOverlay(commitText: boolean): void {
    if (!this.activeTextOverlay) return;

    if (commitText) {
      const text = this.activeTextOverlay.value.trim();
      if (text) {
        const paintEngine = this.ctx.getPaintEngine();
        const session = this.ctx.getSession();
        const canvasPoint = (this.activeTextOverlay as HTMLTextAreaElement & { _canvasPoint: StrokePoint })._canvasPoint;
        if (canvasPoint) {
          paintEngine.addText(session.currentFrame, canvasPoint, text);
          this.ctx.renderPaint();
        }
      }
    }
    this.removeTextOverlay();
  }

  // ======================================================================
  // Paint: live stroke rendering
  // ======================================================================

  renderLiveStroke(): void {
    if (this.livePoints.length === 0) return;
    const dw = this.ctx.getDisplayWidth();
    const dh = this.ctx.getDisplayHeight();
    if (dw === 0 || dh === 0) return;

    const ctx = this.ctx.getPaintCtx();
    const paintCanvas = this.ctx.getPaintCanvas();
    const paintEngine = this.ctx.getPaintEngine();
    const paintRenderer = this.ctx.getPaintRenderer();
    const session = this.ctx.getSession();
    const dpr = window.devicePixelRatio || 1;
    const parsePx = (value: string): number => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    };
    const renderOptions = {
      width: dw,
      height: dh,
      canvasWidth: paintCanvas.width / dpr,
      canvasHeight: paintCanvas.height / dpr,
      offsetX: -Math.min(0, parsePx(paintCanvas.style.left)),
      offsetY: -Math.min(0, parsePx(paintCanvas.style.top)),
      dpr,
    };

    const annotations = paintEngine.getAnnotationsWithGhost(session.currentFrame);
    paintRenderer.renderAnnotations(annotations, renderOptions);

    const isEraser = paintEngine.tool === 'eraser';
    paintRenderer.renderLiveStroke(
      this.livePoints,
      paintEngine.color,
      paintEngine.width,
      paintEngine.brush,
      isEraser,
      renderOptions,
    );

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    ctx.drawImage(paintRenderer.getCanvas(), 0, 0);
  }

  // ======================================================================
  // Paint: live shape rendering
  // ======================================================================

  renderLiveShape(): void {
    if (!this.shapeStartPoint || !this.shapeCurrentPoint) return;
    const dw = this.ctx.getDisplayWidth();
    const dh = this.ctx.getDisplayHeight();
    if (dw === 0 || dh === 0) return;

    const ctx = this.ctx.getPaintCtx();
    const paintCanvas = this.ctx.getPaintCanvas();
    const paintEngine = this.ctx.getPaintEngine();
    const paintRenderer = this.ctx.getPaintRenderer();
    const session = this.ctx.getSession();
    const dpr = window.devicePixelRatio || 1;
    const parsePx = (value: string): number => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    };
    const renderOptions = {
      width: dw,
      height: dh,
      canvasWidth: paintCanvas.width / dpr,
      canvasHeight: paintCanvas.height / dpr,
      offsetX: -Math.min(0, parsePx(paintCanvas.style.left)),
      offsetY: -Math.min(0, parsePx(paintCanvas.style.top)),
      dpr,
    };

    const annotations = paintEngine.getAnnotationsWithGhost(session.currentFrame);
    paintRenderer.renderAnnotations(annotations, renderOptions);

    const shapeType = this.getShapeType(paintEngine.tool);
    paintRenderer.renderLiveShape(
      shapeType,
      this.shapeStartPoint,
      this.shapeCurrentPoint,
      paintEngine.color,
      paintEngine.width,
      renderOptions,
    );

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    ctx.drawImage(paintRenderer.getCanvas(), 0, 0);
  }

  // ======================================================================
  // Shape helpers
  // ======================================================================

  private isShapeTool(tool: PaintTool): boolean {
    return tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow';
  }

  private getShapeType(tool: PaintTool): ShapeType {
    switch (tool) {
      case 'rectangle': return ShapeType.Rectangle;
      case 'ellipse': return ShapeType.Ellipse;
      case 'line': return ShapeType.Line;
      case 'arrow': return ShapeType.Arrow;
      default: return ShapeType.Rectangle;
    }
  }

  private finalizeShape(): void {
    if (!this.shapeStartPoint || !this.shapeCurrentPoint) {
      this.isDrawingShape = false;
      this.shapeStartPoint = null;
      this.shapeCurrentPoint = null;
      return;
    }

    const paintEngine = this.ctx.getPaintEngine();
    const session = this.ctx.getSession();
    const tool = paintEngine.tool;
    const frame = session.currentFrame;
    const shapeType = this.getShapeType(tool);

    // Only add shape if there's meaningful size
    const dx = Math.abs(this.shapeCurrentPoint.x - this.shapeStartPoint.x);
    const dy = Math.abs(this.shapeCurrentPoint.y - this.shapeStartPoint.y);
    const minSize = 0.005;

    if (dx > minSize || dy > minSize) {
      paintEngine.addShape(
        frame,
        shapeType,
        this.shapeStartPoint,
        this.shapeCurrentPoint,
      );
    }

    this.isDrawingShape = false;
    this.shapeStartPoint = null;
    this.shapeCurrentPoint = null;
    this.ctx.renderPaint();
  }

  // ======================================================================
  // Advanced (pixel-destructive) tool helpers
  // ======================================================================

  private isAdvancedTool(tool: PaintTool): boolean {
    return this.ctx.getPaintEngine().isAdvancedTool(tool);
  }

  /**
   * Extract a PixelBuffer from the image canvas.
   *
   * When the GL renderer is active (HDR or SDR WebGL mode), uses
   * `gl.readPixels()` with FLOAT type to preserve HDR values > 1.0.
   * Falls back to a temporary 2D canvas + getImageData for the SDR path,
   * which converts Uint8ClampedArray to Float32Array with values in [0, 1].
   */
  private extractPixelBuffer(): PixelBuffer | null {
    // HDR-aware GL path: use readPixelFloat for full-range float data
    const glRenderer = this.ctx.getGLRenderer();
    if (glRenderer && this.ctx.isGLRendererActive()) {
      // Use GL drawing buffer dimensions (may be DPR-scaled)
      const gl = glRenderer.getContext();
      if (!gl) return null;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      if (w === 0 || h === 0) return null;
      const floatPixels = glRenderer.readPixelFloat(0, 0, w, h);
      if (floatPixels) {
        // readPixelFloat returns rows bottom-to-top (WebGL convention).
        // Flip to top-to-bottom for the PixelBuffer.
        const data = new Float32Array(w * h * 4);
        const stride = w * 4;
        for (let row = 0; row < h; row++) {
          const srcOffset = (h - 1 - row) * stride;
          const dstOffset = row * stride;
          data.set(floatPixels.subarray(srcOffset, srcOffset + stride), dstOffset);
        }
        this._isHDRBuffer = true;
        return { data, width: w, height: h, channels: 4 };
      }
    }

    // SDR fallback: read via temporary 2D canvas
    this._isHDRBuffer = false;
    const imageCanvas = this.ctx.getImageCanvas();
    const w = imageCanvas.width;
    const h = imageCanvas.height;
    if (w === 0 || h === 0) return null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // Draw the image canvas onto the temporary canvas to capture current frame
    tempCtx.drawImage(imageCanvas, 0, 0, w, h);
    const imageData = tempCtx.getImageData(0, 0, w, h);
    const src = imageData.data;

    const data = new Float32Array(w * h * 4);
    for (let i = 0; i < src.length; i++) {
      data[i] = src[i]! / 255;
    }
    return { data, width: w, height: h, channels: 4 };
  }

  /**
   * Write the modified PixelBuffer back to the paint overlay canvas.
   *
   * When the buffer was extracted from the GL renderer (HDR content),
   * writes via a temporary WebGL texture to preserve values > 1.0.
   * Falls back to 2D canvas putImageData for SDR content, converting
   * Float32Array [0, 1] back to Uint8ClampedArray.
   */
  private writePixelBuffer(buffer: PixelBuffer): void {
    const { data, width, height } = buffer;

    // For HDR buffers extracted from the GL renderer, upload as a floating-point
    // texture so HDR values > 1.0 are preserved in the WebGL pipeline.
    if (this._isHDRBuffer) {
      const glRenderer = this.ctx.getGLRenderer();
      const gl = glRenderer?.getContext();
      if (gl) {
        // Flip rows back to bottom-to-top (WebGL convention) before uploading
        const flipped = new Float32Array(width * height * 4);
        const stride = width * 4;
        for (let row = 0; row < height; row++) {
          const srcOffset = row * stride;
          const dstOffset = (height - 1 - row) * stride;
          flipped.set(data.subarray(srcOffset, srcOffset + stride), dstOffset);
        }

        // Upload float pixels to the currently bound GL texture (which is
        // the image texture from the last renderImage call), overwriting the
        // rendered image. This preserves HDR values in the rendering pipeline.
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          width,
          height,
          0,
          gl.RGBA,
          gl.FLOAT,
          flipped,
        );

        // Invalidate the GL render cache so the next scheduleRender() forces
        // a full redraw instead of skipping (same-image optimization).
        // The texture data was modified in-place so renderImage() will bind
        // the updated texture without re-uploading from source.
        this.ctx.invalidateGLRenderCache();
        this.ctx.scheduleRender();
        return;
      }
    }

    // SDR path: write directly to the image canvas (not the paint overlay,
    // which gets cleared on every renderPaint() call).
    const imageCanvas = this.ctx.getImageCanvas();
    const imageCtx = this.ctx.getImageCtx();
    const imageData = imageCtx.createImageData(width, height);
    const dst = imageData.data;
    for (let i = 0; i < data.length; i++) {
      dst[i] = Math.round(Math.min(1, Math.max(0, data[i]!)) * 255);
    }

    imageCtx.putImageData(imageData, 0, 0, 0, 0, imageCanvas.width, imageCanvas.height);
  }

  /**
   * Convert a normalized canvas point (0-1 range) to pixel coordinates
   * matching the active pixel buffer dimensions.
   *
   * The Y axis is flipped because getCanvasPoint() uses OpenRV convention
   * where Y=0 is bottom and Y=1 is top, but pixel buffers have row 0 at
   * the top.
   */
  private toPixelCoords(point: StrokePoint | { x: number; y: number }): { x: number; y: number } {
    // Use active buffer dimensions when available for consistency with
    // extractPixelBuffer/writePixelBuffer. Fall back to image canvas.
    const w = this.activePixelBuffer?.width ?? this.ctx.getImageCanvas().width;
    const h = this.activePixelBuffer?.height ?? this.ctx.getImageCanvas().height;
    return {
      x: point.x * w,
      y: (1 - point.y) * h,
    };
  }

  /**
   * Build brush params from the current paint engine state and pointer pressure.
   */
  private buildBrushParams(pressure: number): BrushParams {
    const paintEngine = this.ctx.getPaintEngine();
    return {
      size: paintEngine.width,
      opacity: paintEngine.color[3],
      pressure,
      hardness: 0.5,
    };
  }

  /**
   * Begin an advanced tool stroke: extract pixel data, call tool.beginStroke,
   * apply the first dab, and render the result.
   */
  private beginAdvancedStroke(point: StrokePoint, pressure: number): void {
    const paintEngine = this.ctx.getPaintEngine();
    const tool = paintEngine.getAdvancedTool(paintEngine.tool);
    if (!tool) return;

    const buffer = this.extractPixelBuffer();
    if (!buffer) return;

    // Create a read-only snapshot of the original pixels. Tools like clone
    // and smudge sample from this to avoid reading their own writes.
    const sourceBuffer: PixelBuffer = {
      data: new Float32Array(buffer.data),
      width: buffer.width,
      height: buffer.height,
      channels: buffer.channels,
    };

    this.isAdvancedDrawing = true;
    this.activePixelBuffer = buffer;
    this.activeSourceBuffer = sourceBuffer;
    this.activeAdvancedTool = tool;

    const pixelPos = this.toPixelCoords(point);
    const brush = this.buildBrushParams(pressure);

    tool.beginStroke(pixelPos);
    tool.apply(buffer, pixelPos, brush, sourceBuffer);
    this.writePixelBuffer(buffer);
  }

  /**
   * Continue an advanced tool stroke: apply the tool at the new position
   * and re-render.
   */
  private continueAdvancedStroke(point: StrokePoint, pressure: number): void {
    if (!this.activePixelBuffer || !this.activeAdvancedTool) return;

    const pixelPos = this.toPixelCoords(point);
    const brush = this.buildBrushParams(pressure);

    this.activeAdvancedTool.apply(this.activePixelBuffer, pixelPos, brush, this.activeSourceBuffer ?? undefined);
    this.writePixelBuffer(this.activePixelBuffer);
  }

  /**
   * End an advanced tool stroke: call tool.endStroke and clean up state.
   */
  private endAdvancedStroke(): void {
    if (this.activeAdvancedTool) {
      this.activeAdvancedTool.endStroke();
    }

    // Write final result to the paint overlay canvas
    if (this.activePixelBuffer) {
      this.writePixelBuffer(this.activePixelBuffer);
    }

    this.isAdvancedDrawing = false;
    this.activePixelBuffer = null;
    this.activeSourceBuffer = null;
    this.activeAdvancedTool = null;
  }
}
