import { Session } from '../../core/session/Session';
import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { StrokePoint } from '../../paint/types';

interface PointerState {
  pointerId: number;
  x: number;
  y: number;
}

export class Viewer {
  private container: HTMLElement;
  private canvasContainer: HTMLElement;
  private imageCanvas: HTMLCanvasElement;
  private paintCanvas: HTMLCanvasElement;
  private imageCtx: CanvasRenderingContext2D;
  private paintCtx: CanvasRenderingContext2D;
  private session: Session;

  // Paint system
  private paintEngine: PaintEngine;
  private paintRenderer: PaintRenderer;
  private isDrawing = false;
  private livePoints: StrokePoint[] = [];

  // View state
  private panX = 0;
  private panY = 0;
  private zoom = 1;

  // Interaction state
  private isPanning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private activePointers: Map<number, PointerState> = new Map();

  // Pinch zoom state
  private initialPinchDistance = 0;
  private initialZoom = 1;

  // Source dimensions for coordinate conversion
  private sourceWidth = 0;
  private sourceHeight = 0;

  // Display dimensions
  private displayWidth = 0;
  private displayHeight = 0;

  // Drop zone
  private dropOverlay: HTMLElement;

  // Resize observer
  private resizeObserver: ResizeObserver;

  // Animation frame for smooth rendering
  private pendingRender = false;

  constructor(session: Session, paintEngine: PaintEngine) {
    this.session = session;
    this.paintEngine = paintEngine;
    this.paintRenderer = new PaintRenderer();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'viewer-container';
    this.container.style.cssText = `
      flex: 1;
      position: relative;
      overflow: hidden;
      background: #1e1e1e;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `;

    // Create canvas container for transforms
    this.canvasContainer = document.createElement('div');
    this.canvasContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    `;
    this.container.appendChild(this.canvasContainer);

    // Create image canvas (bottom layer)
    this.imageCanvas = document.createElement('canvas');
    this.imageCanvas.style.cssText = `
      display: block;
      background: #000;
    `;
    this.canvasContainer.appendChild(this.imageCanvas);

    // Create paint canvas (top layer, overlaid)
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    `;
    this.canvasContainer.appendChild(this.paintCanvas);

    const imageCtx = this.imageCanvas.getContext('2d', { alpha: false });
    if (!imageCtx) throw new Error('Failed to get image 2D context');
    this.imageCtx = imageCtx;

    const paintCtx = this.paintCanvas.getContext('2d');
    if (!paintCtx) throw new Error('Failed to get paint 2D context');
    this.paintCtx = paintCtx;

    // Create drop overlay
    this.dropOverlay = document.createElement('div');
    this.dropOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(74, 158, 255, 0.2);
      border: 3px dashed #4a9eff;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 100;
    `;
    this.dropOverlay.innerHTML = `
      <div style="text-align: center; color: #4a9eff; font-size: 18px;">
        <div style="font-size: 48px; margin-bottom: 10px;">📁</div>
        Drop files here
      </div>
    `;
    this.container.appendChild(this.dropOverlay);

    // Setup resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleRender();
    });
    this.resizeObserver.observe(this.container);

    this.bindEvents();
    this.initializeCanvas();
    this.updateCursor(this.paintEngine.tool);
  }

  private initializeCanvas(): void {
    // Set initial canvas size
    this.sourceWidth = 640;
    this.sourceHeight = 360;
    this.setCanvasSize(640, 360);
    this.drawPlaceholder();
  }

  private setCanvasSize(width: number, height: number): void {
    this.displayWidth = width;
    this.displayHeight = height;

    this.imageCanvas.width = width;
    this.imageCanvas.height = height;
    this.paintCanvas.width = width;
    this.paintCanvas.height = height;

    this.updateCanvasPosition();
  }

  private drawPlaceholder(): void {
    const ctx = this.imageCtx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    // Clear first
    ctx.clearRect(0, 0, w, h);

    // Draw checkerboard (scale size with zoom)
    const baseSize = 20;
    const size = Math.max(4, Math.floor(baseSize * this.zoom));
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        const isLight = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = isLight ? '#2a2a2a' : '#222';
        ctx.fillRect(x, y, size, size);
      }
    }

    // Draw text (scale font with zoom)
    const baseFontSize = 24;
    const fontSize = Math.max(10, Math.floor(baseFontSize * this.zoom));
    ctx.fillStyle = '#666';
    ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Drop image or video here', w / 2, h / 2 - fontSize);

    const smallFontSize = Math.max(8, Math.floor(14 * this.zoom));
    ctx.font = `${smallFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = '#555';
    ctx.fillText('Supports: PNG, JPEG, WebP, GIF, MP4, WebM', w / 2, h / 2 + smallFontSize);
  }

  private bindEvents(): void {
    // Unified pointer events (works for mouse, touch, pen)
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointercancel', this.onPointerUp);
    this.container.addEventListener('pointerleave', this.onPointerLeave);

    // Wheel for zoom
    this.container.addEventListener('wheel', this.onWheel, { passive: false });

    // Drag and drop
    this.container.addEventListener('dragenter', this.onDragEnter);
    this.container.addEventListener('dragleave', this.onDragLeave);
    this.container.addEventListener('dragover', this.onDragOver);
    this.container.addEventListener('drop', this.onDrop);

    // Prevent context menu on long press
    this.container.addEventListener('contextmenu', (e) => {
      if (this.paintEngine.tool !== 'none') {
        e.preventDefault();
      }
    });

    // Session events
    this.session.on('sourceLoaded', () => this.scheduleRender());
    this.session.on('frameChanged', () => this.scheduleRender());

    // Paint events
    this.paintEngine.on('annotationsChanged', () => this.renderPaint());
    this.paintEngine.on('toolChanged', (tool) => this.updateCursor(tool));
  }

  private updateCursor(tool: PaintTool): void {
    switch (tool) {
      case 'pen':
        this.container.style.cursor = 'crosshair';
        break;
      case 'eraser':
        this.container.style.cursor = 'crosshair';
        break;
      case 'text':
        this.container.style.cursor = 'text';
        break;
      default:
        this.container.style.cursor = 'grab';
    }
  }

  private getCanvasPoint(clientX: number, clientY: number, pressure = 0.5): StrokePoint | null {
    if (this.displayWidth === 0 || this.displayHeight === 0) return null;

    const rect = this.imageCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    // Get position relative to canvas
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Convert to normalized coordinates (0,0 = bottom-left for OpenRV compatibility)
    // Account for CSS scaling
    const scaleX = this.displayWidth / rect.width;
    const scaleY = this.displayHeight / rect.height;

    // Calculate normalized position and clamp to valid range
    const x = Math.max(0, Math.min(1, (canvasX * scaleX) / this.displayWidth));
    const y = Math.max(0, Math.min(1, 1 - (canvasY * scaleY) / this.displayHeight));

    return { x, y, pressure };
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Capture pointer for tracking outside container
    this.container.setPointerCapture(e.pointerId);

    this.activePointers.set(e.pointerId, {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    });

    const tool = this.paintEngine.tool;

    // Handle pinch zoom with two fingers
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
          this.paintEngine.beginStroke(this.session.currentFrame, point);
          this.renderLiveStroke();
        }
      } else if (tool === 'text') {
        const point = this.getCanvasPoint(e.clientX, e.clientY);
        if (point) {
          const text = prompt('Enter text:');
          if (text) {
            this.paintEngine.addText(this.session.currentFrame, point, text);
          }
        }
      } else if (e.button === 0 || e.pointerType === 'touch') {
        // Pan mode
        this.isPanning = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.container.style.cursor = 'grabbing';
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;

    // Update pointer position
    const pointer = this.activePointers.get(e.pointerId)!;
    pointer.x = e.clientX;
    pointer.y = e.clientY;

    // Handle pinch zoom
    if (this.activePointers.size === 2 && this.initialPinchDistance > 0) {
      this.handlePinchZoom();
      return;
    }

    if (this.isDrawing) {
      const point = this.getCanvasPoint(e.clientX, e.clientY, e.pressure || 0.5);
      if (point) {
        this.livePoints.push(point);
        this.paintEngine.continueStroke(point);
        this.renderLiveStroke();
      }
    } else if (this.isPanning) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;

      this.panX += dx;
      this.panY += dy;

      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      this.updateCanvasPosition();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.container.releasePointerCapture(e.pointerId);
    this.activePointers.delete(e.pointerId);

    // Reset pinch zoom state
    if (this.activePointers.size < 2) {
      this.initialPinchDistance = 0;
    }

    if (this.isDrawing) {
      this.isDrawing = false;
      this.paintEngine.endStroke();
      this.livePoints = [];
      this.renderPaint();
    }

    if (this.isPanning) {
      this.isPanning = false;
      if (this.paintEngine.tool === 'none') {
        this.container.style.cursor = 'grab';
      } else {
        this.updateCursor(this.paintEngine.tool);
      }
    }
  };

  private onPointerLeave = (e: PointerEvent): void => {
    // Don't end drawing if pointer is captured
    if (this.container.hasPointerCapture(e.pointerId)) return;

    // Otherwise treat like pointer up
    this.onPointerUp(e);
  };

  private startPinchZoom(): void {
    const pointers = Array.from(this.activePointers.values());
    if (pointers.length !== 2) return;

    const dx = pointers[1]!.x - pointers[0]!.x;
    const dy = pointers[1]!.y - pointers[0]!.y;
    this.initialPinchDistance = Math.hypot(dx, dy);
    this.initialZoom = this.zoom;

    // Cancel any drawing in progress
    if (this.isDrawing) {
      this.isDrawing = false;
      this.livePoints = [];
      this.paintEngine.endStroke();
    }
  }

  private handlePinchZoom(): void {
    const pointers = Array.from(this.activePointers.values());
    if (pointers.length !== 2) return;

    // Get current distance between pointers
    const dx = pointers[1]!.x - pointers[0]!.x;
    const dy = pointers[1]!.y - pointers[0]!.y;
    const currentDistance = Math.hypot(dx, dy);

    if (this.initialPinchDistance > 0 && currentDistance > 0) {
      const scale = currentDistance / this.initialPinchDistance;
      const newZoom = Math.max(0.1, Math.min(10, this.initialZoom * scale));

      if (Math.abs(newZoom - this.zoom) > 0.01) {
        this.zoom = newZoom;
        this.scheduleRender();
      }
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const oldZoom = this.zoom;
    const newZoom = Math.max(0.1, Math.min(10, oldZoom * zoomFactor));

    if (newZoom === oldZoom) return;

    // Calculate old and new display sizes
    const containerWidth = rect.width || 640;
    const containerHeight = rect.height || 360;

    const fitScale = Math.min(
      containerWidth / this.sourceWidth,
      containerHeight / this.sourceHeight,
      1
    );

    const oldDisplayWidth = this.sourceWidth * fitScale * oldZoom;
    const oldDisplayHeight = this.sourceHeight * fitScale * oldZoom;
    const newDisplayWidth = this.sourceWidth * fitScale * newZoom;
    const newDisplayHeight = this.sourceHeight * fitScale * newZoom;

    // Canvas position before zoom
    const oldCanvasLeft = (containerWidth - oldDisplayWidth) / 2 + this.panX;
    const oldCanvasTop = (containerHeight - oldDisplayHeight) / 2 + this.panY;

    // Mouse position relative to old canvas (in pixels)
    const mouseOnCanvasX = mouseX - oldCanvasLeft;
    const mouseOnCanvasY = mouseY - oldCanvasTop;

    // Normalized position on canvas (0-1)
    const normalizedX = mouseOnCanvasX / oldDisplayWidth;
    const normalizedY = mouseOnCanvasY / oldDisplayHeight;

    // After zoom, same normalized position should be under mouse
    // newCanvasLeft + normalizedX * newDisplayWidth = mouseX
    // (containerWidth - newDisplayWidth) / 2 + newPanX + normalizedX * newDisplayWidth = mouseX
    // newPanX = mouseX - (containerWidth - newDisplayWidth) / 2 - normalizedX * newDisplayWidth

    const newPanX = mouseX - (containerWidth - newDisplayWidth) / 2 - normalizedX * newDisplayWidth;
    const newPanY = mouseY - (containerHeight - newDisplayHeight) / 2 - normalizedY * newDisplayHeight;

    this.panX = newPanX;
    this.panY = newPanY;
    this.zoom = newZoom;
    this.scheduleRender();
  };

  private onDragEnter = (e: DragEvent): void => {
    e.preventDefault();
    this.dropOverlay.style.display = 'flex';
  };

  private onDragLeave = (e: DragEvent): void => {
    e.preventDefault();
    if (e.relatedTarget && this.container.contains(e.relatedTarget as Node)) return;
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

    for (const file of files) {
      try {
        if (file.name.endsWith('.rv') || file.name.endsWith('.gto')) {
          // Load RV/GTO session files with annotations
          const content = await file.arrayBuffer();
          await this.session.loadFromGTO(content);
        } else {
          // Load image or video files
          await this.session.loadFile(file);
        }
      } catch (err) {
        console.error('Failed to load file:', err);
        alert(`Failed to load ${file.name}: ${err}`);
      }
    }
  };

  private renderLiveStroke(): void {
    if (this.livePoints.length === 0) return;
    if (this.displayWidth === 0 || this.displayHeight === 0) return;

    const ctx = this.paintCtx;
    const renderOptions = { width: this.displayWidth, height: this.displayHeight };

    // Get existing annotations
    const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame);

    // Render all annotations to paintRenderer
    this.paintRenderer.renderAnnotations(annotations, renderOptions);

    // Then render live stroke on top
    const isEraser = this.paintEngine.tool === 'eraser';
    this.paintRenderer.renderLiveStroke(
      this.livePoints,
      this.paintEngine.color,
      this.paintEngine.width,
      this.paintEngine.brush,
      isEraser,
      renderOptions
    );

    // Copy to paint canvas
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    ctx.drawImage(this.paintRenderer.getCanvas(), 0, 0);
  }

  getElement(): HTMLElement {
    return this.container;
  }

  private scheduleRender(): void {
    if (this.pendingRender) return;
    this.pendingRender = true;

    requestAnimationFrame(() => {
      this.pendingRender = false;
      this.render();
    });
  }

  resize(): void {
    this.scheduleRender();
  }

  refresh(): void {
    this.scheduleRender();
  }

  fitToWindow(): void {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.scheduleRender();
  }

  setZoom(level: number): void {
    this.zoom = level;
    this.panX = 0;
    this.panY = 0;
    this.scheduleRender();
  }

  private updateCanvasPosition(): void {
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Calculate base position (centered)
    const baseX = (containerWidth - this.displayWidth) / 2;
    const baseY = (containerHeight - this.displayHeight) / 2;

    // Apply pan offset
    const centerX = baseX + this.panX;
    const centerY = baseY + this.panY;

    this.canvasContainer.style.transform = `translate(${centerX}px, ${centerY}px)`;
  }

  render(): void {
    this.renderImage();

    // If actively drawing, render with live stroke; otherwise just paint
    if (this.isDrawing && this.livePoints.length > 0) {
      this.renderLiveStroke();
    } else {
      this.renderPaint();
    }
  }

  private renderImage(): void {
    const source = this.session.currentSource;

    // Get container size
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width || 640;
    const containerHeight = containerRect.height || 360;

    if (!source || !source.element) {
      // Placeholder mode
      this.sourceWidth = 640;
      this.sourceHeight = 360;

      // Calculate fit scale for placeholder
      const fitScale = Math.min(
        containerWidth / this.sourceWidth,
        containerHeight / this.sourceHeight,
        1
      );

      // Apply zoom
      const scale = fitScale * this.zoom;
      const displayWidth = Math.max(1, Math.floor(this.sourceWidth * scale));
      const displayHeight = Math.max(1, Math.floor(this.sourceHeight * scale));

      if (this.displayWidth !== displayWidth || this.displayHeight !== displayHeight) {
        this.setCanvasSize(displayWidth, displayHeight);
      }

      this.drawPlaceholder();
      this.updateCanvasPosition();
      return;
    }

    const element = source.element;
    this.sourceWidth = source.width;
    this.sourceHeight = source.height;

    // Calculate fit scale
    const fitScale = Math.min(
      containerWidth / this.sourceWidth,
      containerHeight / this.sourceHeight,
      1
    );

    // Apply zoom
    const scale = fitScale * this.zoom;
    const displayWidth = Math.max(1, Math.floor(this.sourceWidth * scale));
    const displayHeight = Math.max(1, Math.floor(this.sourceHeight * scale));

    // Update canvas size if needed
    if (this.displayWidth !== displayWidth || this.displayHeight !== displayHeight) {
      this.setCanvasSize(displayWidth, displayHeight);
    }

    // Clear and draw image
    this.imageCtx.clearRect(0, 0, displayWidth, displayHeight);

    if (element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
      this.imageCtx.drawImage(element, 0, 0, displayWidth, displayHeight);
    }

    this.updateCanvasPosition();
  }

  private renderPaint(): void {
    if (this.displayWidth === 0 || this.displayHeight === 0) return;

    const ctx = this.paintCtx;
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    // Get annotations with ghost effect
    const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame);

    if (annotations.length === 0) return;

    // Render annotations
    this.paintRenderer.renderAnnotations(annotations, {
      width: this.displayWidth,
      height: this.displayHeight,
    });

    // Copy to paint canvas
    ctx.drawImage(this.paintRenderer.getCanvas(), 0, 0);
  }

  getPaintEngine(): PaintEngine {
    return this.paintEngine;
  }

  getZoom(): number {
    return this.zoom;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('wheel', this.onWheel);
  }
}
