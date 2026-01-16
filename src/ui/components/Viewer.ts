import { Session } from '../../core/session/Session';
import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { StrokePoint } from '../../paint/types';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { WipeState, WipeMode } from './WipeControl';
import { Transform2D, DEFAULT_TRANSFORM } from './TransformControl';
import { FilterSettings, DEFAULT_FILTER_SETTINGS } from './FilterControl';
import { CropState, CropRegion, DEFAULT_CROP_STATE, DEFAULT_CROP_REGION } from './CropControl';
import { LUT3D } from '../../color/LUTLoader';
import { WebGLLUTProcessor } from '../../color/WebGLLUT';
import { CDLValues, DEFAULT_CDL, isDefaultCDL, applyCDLToImageData } from '../../color/CDL';
import { LensDistortionParams, DEFAULT_LENS_PARAMS, isDefaultLensParams, applyLensDistortion } from '../../transform/LensDistortion';
import { ExportFormat, exportCanvas as doExportCanvas, copyCanvasToClipboard } from '../../utils/FrameExporter';
import { filterImageFiles } from '../../utils/SequenceLoader';
import { StackLayer } from './StackControl';
import { compositeImageData, BlendMode } from '../../composite/BlendModes';
import { showAlert } from './shared/Modal';
import { getIconSvg } from './shared/Icons';
import { ChannelMode, applyChannelIsolation } from './ChannelSelect';

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

  // Color adjustments
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

  // Wipe comparison
  private wipeState: WipeState = { mode: 'off', position: 0.5, showOriginal: 'left' };
  private wipeLine: HTMLElement | null = null;
  private isDraggingWipe = false;

  // LUT
  private currentLUT: LUT3D | null = null;
  private lutIntensity = 1.0;
  private lutIndicator: HTMLElement | null = null;
  private lutProcessor: WebGLLUTProcessor | null = null;

  // 2D Transform
  private transform: Transform2D = { ...DEFAULT_TRANSFORM };

  // Filter effects
  private filterSettings: FilterSettings = { ...DEFAULT_FILTER_SETTINGS };

  // Crop state
  private cropState: CropState = { ...DEFAULT_CROP_STATE, region: { ...DEFAULT_CROP_REGION } };
  private cropOverlay: HTMLCanvasElement | null = null;
  private cropCtx: CanvasRenderingContext2D | null = null;

  // CDL state
  private cdlValues: CDLValues = JSON.parse(JSON.stringify(DEFAULT_CDL));

  // Lens distortion state
  private lensParams: LensDistortionParams = { ...DEFAULT_LENS_PARAMS };

  // Stack/composite state
  private stackLayers: StackLayer[] = [];
  private stackEnabled = false;

  // Channel isolation state
  private channelMode: ChannelMode = 'rgb';

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

    // Create crop overlay canvas
    this.cropOverlay = document.createElement('canvas');
    this.cropOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    `;
    this.canvasContainer.appendChild(this.cropOverlay);
    this.cropCtx = this.cropOverlay.getContext('2d');

    const imageCtx = this.imageCanvas.getContext('2d', { alpha: false });
    if (!imageCtx) throw new Error('Failed to get image 2D context');
    this.imageCtx = imageCtx;

    const paintCtx = this.paintCanvas.getContext('2d');
    if (!paintCtx) throw new Error('Failed to get paint 2D context');
    this.paintCtx = paintCtx;

    // Create wipe line
    this.wipeLine = document.createElement('div');
    this.wipeLine.className = 'wipe-line';
    this.wipeLine.style.cssText = `
      position: absolute;
      background: #4a9eff;
      cursor: ew-resize;
      z-index: 50;
      display: none;
      box-shadow: 0 0 4px rgba(74, 158, 255, 0.5);
    `;
    this.container.appendChild(this.wipeLine);

    // Create LUT indicator badge
    this.lutIndicator = document.createElement('div');
    this.lutIndicator.className = 'lut-indicator';
    this.lutIndicator.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(74, 158, 255, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      z-index: 60;
      display: none;
      pointer-events: none;
    `;
    this.lutIndicator.textContent = 'LUT';
    this.container.appendChild(this.lutIndicator);

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
        <div style="margin-bottom: 10px;">${getIconSvg('folder-open', 'lg')}</div>
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

    // Initialize WebGL LUT processor
    try {
      this.lutProcessor = new WebGLLUTProcessor();
    } catch (e) {
      console.warn('WebGL LUT processor not available, falling back to CPU:', e);
      this.lutProcessor = null;
    }
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

    if (this.cropOverlay) {
      this.cropOverlay.width = width;
      this.cropOverlay.height = height;
    }

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

    // Check for wipe line dragging first
    if (this.handleWipePointerDown(e)) {
      return;
    }

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
    // Handle wipe dragging
    if (this.isDraggingWipe) {
      this.handleWipePointerMove(e);
      return;
    }

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

    // Handle wipe dragging end
    if (this.isDraggingWipe) {
      this.handleWipePointerUp();
      return;
    }

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

    const fileArray = Array.from(files);

    // Check if multiple image files were dropped - treat as sequence
    const imageFiles = filterImageFiles(fileArray);
    if (imageFiles.length > 1) {
      try {
        await this.session.loadSequence(imageFiles);
        return;
      } catch (err) {
        console.error('Failed to load sequence:', err);
        showAlert(`Failed to load sequence: ${err}`, { type: 'error', title: 'Load Error' });
        return;
      }
    }

    // Single file or mixed files - load individually
    for (const file of fileArray) {
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
        showAlert(`Failed to load ${file.name}: ${err}`, { type: 'error', title: 'Load Error' });
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

    // Render crop overlay if enabled
    this.renderCropOverlay();
  }

  private renderImage(): void {
    const source = this.session.currentSource;

    // Get container size
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width || 640;
    const containerHeight = containerRect.height || 360;

    // For sequences, get the current frame image
    let element: HTMLImageElement | HTMLVideoElement | undefined;
    if (source?.type === 'sequence') {
      const frameImage = this.session.getSequenceFrameSync();
      if (frameImage) {
        element = frameImage;
      } else {
        // Frame not loaded yet - trigger async load
        this.session.getSequenceFrameImage()
          .then(() => this.refresh())
          .catch((err) => console.warn('Failed to load sequence frame:', err));
        // Use first frame as fallback if available
        element = source.element;
      }
    } else {
      element = source?.element;
    }

    if (!source || !element) {
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
      this.updateWipeLine();
      return;
    }

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

    // Clear canvas
    this.imageCtx.clearRect(0, 0, displayWidth, displayHeight);

    // Check if we should render as a stack
    if (this.isStackEnabled()) {
      // Composite all stack layers
      const compositedData = this.compositeStackLayers(displayWidth, displayHeight);
      if (compositedData) {
        this.imageCtx.putImageData(compositedData, 0, 0);
      }
    } else if (element instanceof HTMLImageElement || element instanceof HTMLVideoElement) {
      // Single source rendering
      // Handle wipe rendering
      if (this.wipeState.mode !== 'off') {
        this.renderWithWipe(element, displayWidth, displayHeight);
      } else {
        // Normal rendering with transforms
        this.drawWithTransform(this.imageCtx, element, displayWidth, displayHeight);
      }
    }

    // Apply post-processing effects (lens, LUT, color, sharpen) regardless of stack mode
    // Apply lens distortion correction (geometric transform, applied first)
    if (!isDefaultLensParams(this.lensParams)) {
      this.applyLensDistortionToCtx(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply 3D LUT (GPU-accelerated color grading)
    if (this.currentLUT && this.lutIntensity > 0) {
      this.applyLUTToCanvas(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply CDL color correction (pixel-level operation)
    if (!isDefaultCDL(this.cdlValues)) {
      this.applyCDL(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply sharpen filter (pixel-level operation, applied after CDL)
    if (this.filterSettings.sharpen > 0) {
      this.applySharpen(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply channel isolation (display mode, applied last)
    if (this.channelMode !== 'rgb') {
      this.applyChannelIsolation(this.imageCtx, displayWidth, displayHeight);
    }

    this.updateCanvasPosition();
    this.updateWipeLine();
  }

  /**
   * Draw image/video with rotation and flip transforms applied
   */
  private drawWithTransform(
    ctx: CanvasRenderingContext2D,
    element: HTMLImageElement | HTMLVideoElement,
    displayWidth: number,
    displayHeight: number
  ): void {
    const { rotation, flipH, flipV } = this.transform;

    // If no transforms, just draw normally
    if (rotation === 0 && !flipH && !flipV) {
      ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
      return;
    }

    ctx.save();

    // Move to center for transformations
    ctx.translate(displayWidth / 2, displayHeight / 2);

    // Apply rotation
    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    // Apply flips
    const scaleX = flipH ? -1 : 1;
    const scaleY = flipV ? -1 : 1;
    if (flipH || flipV) {
      ctx.scale(scaleX, scaleY);
    }

    // For 90/270 rotation, we need to swap the draw dimensions
    let drawWidth = displayWidth;
    let drawHeight = displayHeight;
    if (rotation === 90 || rotation === 270) {
      // When rotated 90/270, the source needs to fill the rotated space
      // We need to scale to fit the rotated dimensions
      const sourceAspect = element instanceof HTMLVideoElement
        ? element.videoWidth / element.videoHeight
        : element.naturalWidth / element.naturalHeight;
      const targetAspect = displayHeight / displayWidth; // Swapped for rotation

      if (sourceAspect > targetAspect) {
        drawHeight = displayWidth;
        drawWidth = displayWidth * sourceAspect;
      } else {
        drawWidth = displayHeight;
        drawHeight = displayHeight / sourceAspect;
      }
      // Swap for rotated coordinate system
      [drawWidth, drawHeight] = [drawHeight, drawWidth];
    }

    // Draw centered
    ctx.drawImage(element, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

    ctx.restore();
  }

  /**
   * Apply unsharp mask sharpening to the canvas
   * Uses a simplified 3x3 kernel convolution for performance
   */
  private applySharpen(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.filterSettings.sharpen <= 0) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const amount = this.filterSettings.sharpen / 100;

    // Create a copy for reading original values
    const original = new Uint8ClampedArray(data);

    // Sharpen kernel (3x3 unsharp mask approximation)
    // Center weight is boosted, neighbors are subtracted
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    // For performance, we'll use a simplified approach:
    // Instead of full convolution, apply contrast-based sharpening with edge enhancement
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) { // RGB channels only
          let sum = 0;
          let ki = 0;

          // Apply 3x3 kernel
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pidx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += original[pidx]! * kernel[ki]!;
              ki++;
            }
          }

          // Blend between original and sharpened based on amount
          const originalValue = original[idx + c]!;
          const sharpenedValue = Math.max(0, Math.min(255, sum));
          data[idx + c] = Math.round(originalValue + (sharpenedValue - originalValue) * amount);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private renderWithWipe(
    element: HTMLImageElement | HTMLVideoElement,
    displayWidth: number,
    displayHeight: number
  ): void {
    const ctx = this.imageCtx;
    const pos = this.wipeState.position;

    // For wipe, we need to render both with and without filters
    // Since CSS filters apply to the whole container, we'll use canvas filter property

    ctx.save();

    if (this.wipeState.mode === 'horizontal') {
      // Left side: original (no filter)
      // Right side: with color adjustments
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
      ctx.filter = this.getCanvasFilterString();
      ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
      ctx.restore();

    } else if (this.wipeState.mode === 'vertical') {
      // Top side: original (no filter)
      // Bottom side: with color adjustments
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
      ctx.filter = this.getCanvasFilterString();
      ctx.drawImage(element, 0, 0, displayWidth, displayHeight);
      ctx.restore();
    }

    ctx.restore();
  }

  private getCanvasFilterString(): string {
    const filters: string[] = [];

    const brightness = 1 + this.colorAdjustments.brightness;
    if (brightness !== 1) {
      filters.push(`brightness(${brightness.toFixed(3)})`);
    }

    if (this.colorAdjustments.exposure !== 0) {
      const exposureBrightness = Math.pow(2, this.colorAdjustments.exposure);
      filters.push(`brightness(${exposureBrightness.toFixed(3)})`);
    }

    if (this.colorAdjustments.contrast !== 1) {
      filters.push(`contrast(${this.colorAdjustments.contrast.toFixed(3)})`);
    }

    if (this.colorAdjustments.saturation !== 1) {
      filters.push(`saturate(${this.colorAdjustments.saturation.toFixed(3)})`);
    }

    if (this.colorAdjustments.temperature !== 0) {
      const temp = this.colorAdjustments.temperature;
      if (temp > 0) {
        const sepia = Math.min(temp / 200, 0.3);
        filters.push(`sepia(${sepia.toFixed(3)})`);
      } else {
        const hue = temp * 0.3;
        filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
      }
    }

    if (this.colorAdjustments.tint !== 0) {
      const hue = this.colorAdjustments.tint * 0.5;
      filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }

    return filters.length > 0 ? filters.join(' ') : 'none';
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

  getPan(): { x: number; y: number } {
    return { x: this.panX, y: this.panY };
  }

  setPan(x: number, y: number): void {
    this.panX = x;
    this.panY = y;
    this.scheduleRender();
  }

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.colorAdjustments = { ...adjustments };
    this.applyColorFilters();
    this.scheduleRender();
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this.colorAdjustments };
  }

  resetColorAdjustments(): void {
    this.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
    this.applyColorFilters();
    this.scheduleRender();
  }

  // LUT methods
  setLUT(lut: LUT3D | null): void {
    this.currentLUT = lut;

    // Update WebGL LUT processor
    if (this.lutProcessor) {
      this.lutProcessor.setLUT(lut);
    }

    if (this.lutIndicator) {
      this.lutIndicator.style.display = lut ? 'block' : 'none';
      this.lutIndicator.textContent = lut ? `LUT: ${lut.title}` : 'LUT';
    }
    this.scheduleRender();
  }

  getLUT(): LUT3D | null {
    return this.currentLUT;
  }

  setLUTIntensity(intensity: number): void {
    this.lutIntensity = Math.max(0, Math.min(1, intensity));
    this.scheduleRender();
  }

  getLUTIntensity(): number {
    return this.lutIntensity;
  }

  /**
   * Apply LUT using WebGL for GPU acceleration
   */
  private applyLUTToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.currentLUT || this.lutIntensity === 0) return;

    // Use WebGL processor if available for GPU acceleration
    if (this.lutProcessor && this.lutProcessor.hasLUT()) {
      this.lutProcessor.applyToCanvas(ctx, width, height, this.lutIntensity);
    }
    // Fallback: No CPU fallback implemented for performance reasons
    // The WebGL path handles all LUT processing
  }

  // Wipe comparison methods
  setWipeState(state: WipeState): void {
    this.wipeState = { ...state };
    this.updateWipeLine();
    this.scheduleRender();
  }

  getWipeState(): WipeState {
    return { ...this.wipeState };
  }

  setWipeMode(mode: WipeMode): void {
    this.wipeState.mode = mode;
    this.updateWipeLine();
    this.scheduleRender();
  }

  setWipePosition(position: number): void {
    this.wipeState.position = Math.max(0, Math.min(1, position));
    this.updateWipeLine();
    this.scheduleRender();
  }

  // Transform methods
  setTransform(transform: Transform2D): void {
    this.transform = { ...transform };
    this.scheduleRender();
  }

  getTransform(): Transform2D {
    return { ...this.transform };
  }

  // Filter methods
  setFilterSettings(settings: FilterSettings): void {
    this.filterSettings = { ...settings };
    this.applyColorFilters();
    this.scheduleRender();
  }

  getFilterSettings(): FilterSettings {
    return { ...this.filterSettings };
  }

  resetFilterSettings(): void {
    this.filterSettings = { ...DEFAULT_FILTER_SETTINGS };
    this.applyColorFilters();
    this.scheduleRender();
  }

  // Crop methods
  setCropState(state: CropState): void {
    this.cropState = { ...state, region: { ...state.region } };
    this.scheduleRender();
  }

  getCropState(): CropState {
    return { ...this.cropState, region: { ...this.cropState.region } };
  }

  setCropRegion(region: CropRegion): void {
    this.cropState.region = { ...region };
    this.scheduleRender();
  }

  setCropEnabled(enabled: boolean): void {
    this.cropState.enabled = enabled;
    this.scheduleRender();
  }

  // CDL methods
  setCDL(cdl: CDLValues): void {
    this.cdlValues = JSON.parse(JSON.stringify(cdl));
    this.scheduleRender();
  }

  getCDL(): CDLValues {
    return JSON.parse(JSON.stringify(this.cdlValues));
  }

  resetCDL(): void {
    this.cdlValues = JSON.parse(JSON.stringify(DEFAULT_CDL));
    this.scheduleRender();
  }

  /**
   * Apply CDL color correction to the canvas
   */
  private applyCDL(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (isDefaultCDL(this.cdlValues)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    applyCDLToImageData(imageData, this.cdlValues);
    ctx.putImageData(imageData, 0, 0);
  }

  // Lens distortion methods
  setLensParams(params: LensDistortionParams): void {
    this.lensParams = { ...params };
    this.scheduleRender();
  }

  getLensParams(): LensDistortionParams {
    return { ...this.lensParams };
  }

  resetLensParams(): void {
    this.lensParams = { ...DEFAULT_LENS_PARAMS };
    this.scheduleRender();
  }

  /**
   * Apply lens distortion correction to the canvas
   */
  private applyLensDistortionToCtx(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (isDefaultLensParams(this.lensParams)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const correctedData = applyLensDistortion(imageData, this.lensParams);
    ctx.putImageData(correctedData, 0, 0);
  }

  // Channel isolation methods
  setChannelMode(mode: ChannelMode): void {
    if (this.channelMode === mode) return;
    this.channelMode = mode;
    this.scheduleRender();
  }

  getChannelMode(): ChannelMode {
    return this.channelMode;
  }

  resetChannelMode(): void {
    this.channelMode = 'rgb';
    this.scheduleRender();
  }

  /**
   * Apply channel isolation to the canvas
   */
  private applyChannelIsolation(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.channelMode === 'rgb') return;

    const imageData = ctx.getImageData(0, 0, width, height);
    applyChannelIsolation(imageData, this.channelMode);
    ctx.putImageData(imageData, 0, 0);
  }

  // Stack/composite methods
  setStackLayers(layers: StackLayer[]): void {
    this.stackLayers = [...layers];
    this.stackEnabled = layers.length > 1;
    this.scheduleRender();
  }

  getStackLayers(): StackLayer[] {
    return [...this.stackLayers];
  }

  setStackEnabled(enabled: boolean): void {
    this.stackEnabled = enabled;
    this.scheduleRender();
  }

  isStackEnabled(): boolean {
    return this.stackEnabled && this.stackLayers.length > 1;
  }

  /**
   * Render a single source to a canvas and return its ImageData
   */
  private renderSourceToImageData(
    sourceIndex: number,
    width: number,
    height: number
  ): ImageData | null {
    const source = this.session.getSourceByIndex(sourceIndex);
    if (!source?.element) return null;

    // Create temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    // Draw source element
    if (source.element instanceof HTMLImageElement || source.element instanceof HTMLVideoElement) {
      tempCtx.drawImage(source.element, 0, 0, width, height);
    }

    return tempCtx.getImageData(0, 0, width, height);
  }

  /**
   * Composite multiple stack layers together
   */
  private compositeStackLayers(width: number, height: number): ImageData | null {
    if (this.stackLayers.length === 0) return null;

    // Start with transparent
    let result = new ImageData(width, height);

    // Composite each visible layer from bottom to top
    for (const layer of this.stackLayers) {
      if (!layer.visible || layer.opacity === 0) continue;

      const layerData = this.renderSourceToImageData(layer.sourceIndex, width, height);
      if (!layerData) continue;

      // Composite this layer onto result
      result = compositeImageData(result, layerData, layer.blendMode as BlendMode, layer.opacity);
    }

    return result;
  }

  private renderCropOverlay(): void {
    if (!this.cropOverlay || !this.cropCtx) return;

    const ctx = this.cropCtx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    // Clear overlay
    ctx.clearRect(0, 0, w, h);

    if (!this.cropState.enabled) return;

    const region = this.cropState.region;
    const cropX = region.x * w;
    const cropY = region.y * h;
    const cropW = region.width * w;
    const cropH = region.height * h;

    // Draw darkened areas outside crop region
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

    // Top
    ctx.fillRect(0, 0, w, cropY);
    // Bottom
    ctx.fillRect(0, cropY + cropH, w, h - cropY - cropH);
    // Left
    ctx.fillRect(0, cropY, cropX, cropH);
    // Right
    ctx.fillRect(cropX + cropW, cropY, w - cropX - cropW, cropH);

    // Draw crop border
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);

    // Draw corner handles
    const handleSize = 8;
    ctx.fillStyle = '#4a9eff';

    // Top-left
    ctx.fillRect(cropX - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize);
    // Top-right
    ctx.fillRect(cropX + cropW - handleSize / 2, cropY - handleSize / 2, handleSize, handleSize);
    // Bottom-left
    ctx.fillRect(cropX - handleSize / 2, cropY + cropH - handleSize / 2, handleSize, handleSize);
    // Bottom-right
    ctx.fillRect(cropX + cropW - handleSize / 2, cropY + cropH - handleSize / 2, handleSize, handleSize);

    // Draw rule of thirds guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    // Vertical lines
    ctx.beginPath();
    ctx.moveTo(cropX + cropW / 3, cropY);
    ctx.lineTo(cropX + cropW / 3, cropY + cropH);
    ctx.moveTo(cropX + (cropW * 2) / 3, cropY);
    ctx.lineTo(cropX + (cropW * 2) / 3, cropY + cropH);
    // Horizontal lines
    ctx.moveTo(cropX, cropY + cropH / 3);
    ctx.lineTo(cropX + cropW, cropY + cropH / 3);
    ctx.moveTo(cropX, cropY + (cropH * 2) / 3);
    ctx.lineTo(cropX + cropW, cropY + (cropH * 2) / 3);
    ctx.stroke();
  }

  private updateWipeLine(): void {
    if (!this.wipeLine) return;

    if (this.wipeState.mode === 'off') {
      this.wipeLine.style.display = 'none';
      return;
    }

    this.wipeLine.style.display = 'block';

    const containerRect = this.container.getBoundingClientRect();
    const canvasRect = this.canvasContainer.getBoundingClientRect();

    if (this.wipeState.mode === 'horizontal') {
      // Vertical line for horizontal wipe
      const x = canvasRect.left - containerRect.left + this.displayWidth * this.wipeState.position;
      this.wipeLine.style.width = '3px';
      this.wipeLine.style.height = `${this.displayHeight}px`;
      this.wipeLine.style.left = `${x - 1}px`;
      this.wipeLine.style.top = `${canvasRect.top - containerRect.top}px`;
      this.wipeLine.style.cursor = 'ew-resize';
    } else if (this.wipeState.mode === 'vertical') {
      // Horizontal line for vertical wipe
      const y = canvasRect.top - containerRect.top + this.displayHeight * this.wipeState.position;
      this.wipeLine.style.width = `${this.displayWidth}px`;
      this.wipeLine.style.height = '3px';
      this.wipeLine.style.left = `${canvasRect.left - containerRect.left}px`;
      this.wipeLine.style.top = `${y - 1}px`;
      this.wipeLine.style.cursor = 'ns-resize';
    }
  }

  private handleWipePointerDown(e: PointerEvent): boolean {
    if (this.wipeState.mode === 'off' || !this.wipeLine) return false;

    const wipeRect = this.wipeLine.getBoundingClientRect();
    const tolerance = 10; // pixels

    // Check if click is on or near the wipe line
    if (this.wipeState.mode === 'horizontal') {
      if (Math.abs(e.clientX - (wipeRect.left + wipeRect.width / 2)) <= tolerance) {
        this.isDraggingWipe = true;
        return true;
      }
    } else if (this.wipeState.mode === 'vertical') {
      if (Math.abs(e.clientY - (wipeRect.top + wipeRect.height / 2)) <= tolerance) {
        this.isDraggingWipe = true;
        return true;
      }
    }

    return false;
  }

  private handleWipePointerMove(e: PointerEvent): void {
    if (!this.isDraggingWipe) return;

    const canvasRect = this.canvasContainer.getBoundingClientRect();

    if (this.wipeState.mode === 'horizontal') {
      const x = e.clientX - canvasRect.left;
      this.wipeState.position = Math.max(0, Math.min(1, x / this.displayWidth));
    } else if (this.wipeState.mode === 'vertical') {
      const y = e.clientY - canvasRect.top;
      this.wipeState.position = Math.max(0, Math.min(1, y / this.displayHeight));
    }

    this.updateWipeLine();
    this.scheduleRender();
  }

  private handleWipePointerUp(): void {
    this.isDraggingWipe = false;
  }

  private applyColorFilters(): void {
    // Build CSS filter string from color adjustments
    // CSS filters: brightness, contrast, saturate, hue-rotate, etc.
    const filters: string[] = [];

    // Brightness: CSS uses 1 = normal, we use -1 to +1 offset
    // Convert: brightness = 1 + adjustment
    const brightness = 1 + this.colorAdjustments.brightness;
    if (brightness !== 1) {
      filters.push(`brightness(${brightness.toFixed(3)})`);
    }

    // Exposure: simulate with brightness (2^exposure)
    if (this.colorAdjustments.exposure !== 0) {
      const exposureBrightness = Math.pow(2, this.colorAdjustments.exposure);
      filters.push(`brightness(${exposureBrightness.toFixed(3)})`);
    }

    // Contrast: CSS uses 1 = normal
    if (this.colorAdjustments.contrast !== 1) {
      filters.push(`contrast(${this.colorAdjustments.contrast.toFixed(3)})`);
    }

    // Saturation: CSS uses 1 = normal
    if (this.colorAdjustments.saturation !== 1) {
      filters.push(`saturate(${this.colorAdjustments.saturation.toFixed(3)})`);
    }

    // Temperature: approximate with hue-rotate and sepia
    // Warm = positive temperature, Cold = negative
    if (this.colorAdjustments.temperature !== 0) {
      const temp = this.colorAdjustments.temperature;
      if (temp > 0) {
        // Warm: add sepia and slight hue rotation
        const sepia = Math.min(temp / 200, 0.3);
        filters.push(`sepia(${sepia.toFixed(3)})`);
      } else {
        // Cold: use hue rotation towards blue
        const hue = temp * 0.3;
        filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
      }
    }

    // Tint: approximate with hue-rotate
    if (this.colorAdjustments.tint !== 0) {
      const hue = this.colorAdjustments.tint * 0.5;
      filters.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }

    // Blur filter effect
    if (this.filterSettings.blur > 0) {
      filters.push(`blur(${this.filterSettings.blur.toFixed(1)}px)`);
    }

    // Apply to canvas container (affects both image and paint layers)
    const filterString = filters.length > 0 ? filters.join(' ') : 'none';
    this.canvasContainer.style.filter = filterString;
  }

  // Export methods
  exportFrame(
    format: ExportFormat = 'png',
    includeAnnotations = true,
    quality = 0.92
  ): void {
    const canvas = this.createExportCanvas(includeAnnotations);
    if (!canvas) return;

    const source = this.session.currentSource;
    const frame = this.session.currentFrame;
    const name = source?.name?.replace(/\.[^.]+$/, '') || 'frame';
    const filename = `${name}_frame${frame}.${format}`;

    doExportCanvas(canvas, { format, quality, filename });
  }

  async copyFrameToClipboard(includeAnnotations = true): Promise<boolean> {
    const canvas = this.createExportCanvas(includeAnnotations);
    if (!canvas) return false;

    return copyCanvasToClipboard(canvas);
  }

  private createExportCanvas(includeAnnotations: boolean): HTMLCanvasElement | null {
    const source = this.session.currentSource;
    if (!source?.element) return null;

    // Create canvas at source resolution
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Apply color filters
    ctx.filter = this.getCanvasFilterString();

    // Draw image
    if (source.element instanceof HTMLImageElement || source.element instanceof HTMLVideoElement) {
      ctx.drawImage(source.element, 0, 0, source.width, source.height);
    }

    // Reset filter for annotations
    ctx.filter = 'none';

    // Draw annotations if requested
    if (includeAnnotations) {
      const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame);
      if (annotations.length > 0) {
        // Render annotations at source resolution
        this.paintRenderer.renderAnnotations(annotations, {
          width: source.width,
          height: source.height,
        });
        ctx.drawImage(this.paintRenderer.getCanvas(), 0, 0, source.width, source.height);
      }
    }

    return canvas;
  }

  /**
   * Render a specific frame to a canvas (for sequence export)
   * Seeks to the frame, renders, and returns the canvas
   */
  async renderFrameToCanvas(frame: number, includeAnnotations: boolean): Promise<HTMLCanvasElement | null> {
    const source = this.session.currentSource;
    if (!source) return null;

    // Save current frame
    const originalFrame = this.session.currentFrame;

    // Seek to target frame
    this.session.currentFrame = frame;

    // For sequences, wait for the frame to load
    if (source.type === 'sequence') {
      await this.session.getSequenceFrameImage(frame);
    }

    // For video, seek and wait
    if (source.type === 'video' && source.element instanceof HTMLVideoElement) {
      const video = source.element;
      const targetTime = (frame - 1) / this.session.fps;
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
      element = this.session.getSequenceFrameSync(frame) ?? undefined;
    } else {
      element = source.element;
    }

    if (!element) {
      this.session.currentFrame = originalFrame;
      return null;
    }

    // Create canvas at source resolution
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.session.currentFrame = originalFrame;
      return null;
    }

    // Apply color filters
    ctx.filter = this.getCanvasFilterString();

    // Draw image with transforms
    this.drawWithTransform(ctx, element, source.width, source.height);

    // Reset filter for annotations
    ctx.filter = 'none';

    // Draw annotations if requested
    if (includeAnnotations) {
      const annotations = this.paintEngine.getAnnotationsWithGhost(frame);
      if (annotations.length > 0) {
        this.paintRenderer.renderAnnotations(annotations, {
          width: source.width,
          height: source.height,
        });
        ctx.drawImage(this.paintRenderer.getCanvas(), 0, 0, source.width, source.height);
      }
    }

    // Restore original frame
    this.session.currentFrame = originalFrame;

    return canvas;
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('wheel', this.onWheel);

    // Cleanup WebGL LUT processor
    if (this.lutProcessor) {
      this.lutProcessor.dispose();
      this.lutProcessor = null;
    }
  }

  /**
   * Get ImageData from the current canvas for histogram analysis
   */
  getImageData(): ImageData | null {
    const source = this.session.currentSource;
    if (!source?.element) return null;

    // Get the displayed dimensions
    const displayWidth = this.imageCanvas.width;
    const displayHeight = this.imageCanvas.height;

    if (displayWidth === 0 || displayHeight === 0) return null;

    return this.imageCtx.getImageData(0, 0, displayWidth, displayHeight);
  }

  /**
   * Get the canvas container element for overlays
   */
  getCanvasContainer(): HTMLElement {
    return this.canvasContainer;
  }

  /**
   * Get the main viewer container element for overlays
   */
  getContainer(): HTMLElement {
    return this.container;
  }
}
