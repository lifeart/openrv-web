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

  // Viewer helpers that the handler needs to invoke
  isViewerContentElement(element: HTMLElement): boolean;
  scheduleRender(): void;
  updateCanvasPosition(): void;
  renderPaint(): void;
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

  // Drop zone overlay
  private dropOverlay: HTMLElement;

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
        container.style.cursor = 'crosshair';
        break;
      case 'text':
        container.style.cursor = 'text';
        break;
      default:
        container.style.cursor = 'grab';
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
          const text = prompt('Enter text:');
          if (text) {
            paintEngine.addText(session.currentFrame, point, text);
          }
        }
      } else if (this.isShapeTool(tool)) {
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        if (point) {
          this.isDrawingShape = true;
          this.shapeStartPoint = { x: point.x, y: point.y };
          this.shapeCurrentPoint = { x: point.x, y: point.y };
          this.renderLiveShape();
        }
      } else if (e.button === 0 || e.pointerType === 'touch') {
        // Pan mode
        this.isPanning = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        container.style.cursor = 'grabbing';
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
    } else if (this.isDrawingShape) {
      const point = this.getCanvasPoint(e.clientX, e.clientY);
      if (point) {
        this.shapeCurrentPoint = { x: point.x, y: point.y };
        this.renderLiveShape();
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

    if (this.isDrawingShape) {
      this.finalizeShape();
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
        if (file.name.endsWith('.rv') || file.name.endsWith('.gto')) {
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
  // Paint: live stroke rendering
  // ======================================================================

  renderLiveStroke(): void {
    if (this.livePoints.length === 0) return;
    const dw = this.ctx.getDisplayWidth();
    const dh = this.ctx.getDisplayHeight();
    if (dw === 0 || dh === 0) return;

    const ctx = this.ctx.getPaintCtx();
    const paintEngine = this.ctx.getPaintEngine();
    const paintRenderer = this.ctx.getPaintRenderer();
    const session = this.ctx.getSession();
    const renderOptions = { width: dw, height: dh };

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

    ctx.clearRect(0, 0, dw, dh);
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
    const paintEngine = this.ctx.getPaintEngine();
    const paintRenderer = this.ctx.getPaintRenderer();
    const session = this.ctx.getSession();
    const renderOptions = { width: dw, height: dh };

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

    ctx.clearRect(0, 0, dw, dh);
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
}
