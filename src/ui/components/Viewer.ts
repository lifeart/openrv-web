import { Session } from '../../core/session/Session';
import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { StrokePoint, ShapeType, Point } from '../../paint/types';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { WipeState, WipeMode } from './WipeControl';
import { Transform2D, DEFAULT_TRANSFORM } from './TransformControl';
import { FilterSettings, DEFAULT_FILTER_SETTINGS } from './FilterControl';
import { CropState, CropRegion, DEFAULT_CROP_STATE, DEFAULT_CROP_REGION } from './CropControl';
import { LUT3D } from '../../color/LUTLoader';
import { WebGLLUTProcessor } from '../../color/WebGLLUT';
import { CDLValues, DEFAULT_CDL, isDefaultCDL, applyCDLToImageData } from '../../color/CDL';
import { ColorCurvesData, createDefaultCurvesData, isDefaultCurves, CurveLUTCache } from '../../color/ColorCurves';
import { LensDistortionParams, DEFAULT_LENS_PARAMS, isDefaultLensParams, applyLensDistortion } from '../../transform/LensDistortion';
import { ExportFormat, exportCanvas as doExportCanvas, copyCanvasToClipboard } from '../../utils/FrameExporter';
import { filterImageFiles } from '../../utils/SequenceLoader';
import { StackLayer } from './StackControl';
import { compositeImageData, BlendMode } from '../../composite/BlendModes';
import { showAlert } from './shared/Modal';
import { getIconSvg } from './shared/Icons';
import { ChannelMode, applyChannelIsolation } from './ChannelSelect';
import { StereoState, DEFAULT_STEREO_STATE, isDefaultStereoState, applyStereoMode } from '../../stereo/StereoRenderer';
import { DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE, applyDifferenceMatte } from './DifferenceMatteControl';
import { WebGLSharpenProcessor } from '../../filters/WebGLSharpen';
import { SafeAreasOverlay } from './SafeAreasOverlay';
import { MatteOverlay } from './MatteOverlay';
import { PixelProbe } from './PixelProbe';
import { FalseColor } from './FalseColor';
import { TimecodeOverlay } from './TimecodeOverlay';
import { ZebraStripes } from './ZebraStripes';
import { ColorWheels } from './ColorWheels';
import { SpotlightOverlay } from './SpotlightOverlay';
import { ClippingOverlay } from './ClippingOverlay';
import { HSLQualifier } from './HSLQualifier';

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

  // Shape drawing state
  private isDrawingShape = false;
  private shapeStartPoint: Point | null = null;
  private shapeCurrentPoint: Point | null = null;

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

  // Pending video frame fetch tracking
  private pendingVideoFrameFetch: Promise<void> | null = null;
  private pendingVideoFrameNumber: number = 0; // Which frame is being fetched

  // Track if we've ever displayed a mediabunny frame (for fallback logic)
  private hasDisplayedMediabunnyFrame = false;

  // Color adjustments
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

  // Cached filter string for performance (avoid rebuilding every frame)
  private cachedFilterString: string | null = null;
  private cachedFilterAdjustments: ColorAdjustments | null = null;

  // Wipe comparison
  private wipeState: WipeState = { mode: 'off', position: 0.5, showOriginal: 'left' };
  private wipeLine: HTMLElement | null = null;
  private isDraggingWipe = false;

  // LUT
  private currentLUT: LUT3D | null = null;
  private lutIntensity = 1.0;
  private lutIndicator: HTMLElement | null = null;
  private lutProcessor: WebGLLUTProcessor | null = null;

  // A/B Compare indicator
  private abIndicator: HTMLElement | null = null;

  // 2D Transform
  private transform: Transform2D = {
    ...DEFAULT_TRANSFORM,
    scale: { ...DEFAULT_TRANSFORM.scale },
    translate: { ...DEFAULT_TRANSFORM.translate },
  };

  // Filter effects
  private filterSettings: FilterSettings = { ...DEFAULT_FILTER_SETTINGS };
  private sharpenProcessor: WebGLSharpenProcessor | null = null;

  // Crop state
  private cropState: CropState = { ...DEFAULT_CROP_STATE, region: { ...DEFAULT_CROP_REGION } };
  private cropOverlay: HTMLCanvasElement | null = null;
  private cropCtx: CanvasRenderingContext2D | null = null;

  // Safe areas overlay
  private safeAreasOverlay: SafeAreasOverlay;

  // Matte overlay
  private matteOverlay: MatteOverlay;

  // Timecode overlay
  private timecodeOverlay: TimecodeOverlay;

  // Pixel probe
  private pixelProbe: PixelProbe;

  // False color display
  private falseColor: FalseColor;

  // Zebra stripes overlay
  private zebraStripes: ZebraStripes;
  private clippingOverlay: ClippingOverlay;

  // Lift/Gamma/Gain color wheels
  private colorWheels: ColorWheels;

  // Spotlight overlay
  private spotlightOverlay: SpotlightOverlay;

  // HSL Qualifier (secondary color correction)
  private hslQualifier: HSLQualifier;

  // CDL state
  private cdlValues: CDLValues = JSON.parse(JSON.stringify(DEFAULT_CDL));

  // Color curves state
  private curvesData: ColorCurvesData = createDefaultCurvesData();
  private curveLUTCache = new CurveLUTCache();

  // Lens distortion state
  private lensParams: LensDistortionParams = { ...DEFAULT_LENS_PARAMS };

  // Stack/composite state
  private stackLayers: StackLayer[] = [];
  private stackEnabled = false;

  // Channel isolation state
  private channelMode: ChannelMode = 'rgb';

  // Stereo viewing state
  private stereoState: StereoState = { ...DEFAULT_STEREO_STATE };

  // Difference matte state
  private differenceMatteState: DifferenceMatteState = { ...DEFAULT_DIFFERENCE_MATTE_STATE };

  // Cursor color callback for InfoPanel
  private cursorColorCallback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null = null;
  private lastCursorColorUpdate = 0;

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

    // Create safe areas overlay
    this.safeAreasOverlay = new SafeAreasOverlay();
    this.canvasContainer.appendChild(this.safeAreasOverlay.getElement());

    // Create matte overlay (below safe areas, z-index 40)
    this.matteOverlay = new MatteOverlay();
    this.canvasContainer.appendChild(this.matteOverlay.getElement());

    // Create timecode overlay
    this.timecodeOverlay = new TimecodeOverlay(session);
    this.canvasContainer.appendChild(this.timecodeOverlay.getElement());

    // Create pixel probe
    this.pixelProbe = new PixelProbe();

    // Update cursor when pixel probe state changes
    this.pixelProbe.on('stateChanged', (state) => {
      this.updateCursorForProbe(state.enabled);
    });

    // Create false color display
    this.falseColor = new FalseColor();

    // Create zebra stripes overlay
    this.zebraStripes = new ZebraStripes();
    this.zebraStripes.on('stateChanged', (state) => {
      if (state.enabled && (state.highEnabled || state.lowEnabled)) {
        this.zebraStripes.startAnimation(() => this.refresh());
      } else {
        this.zebraStripes.stopAnimation();
      }
      this.refresh();
    });

    // Create clipping overlay
    this.clippingOverlay = new ClippingOverlay();
    this.clippingOverlay.on('stateChanged', () => {
      this.refresh();
    });

    // Create color wheels
    this.colorWheels = new ColorWheels(this.container);
    this.colorWheels.on('stateChanged', () => {
      this.refresh();
    });

    // Create spotlight overlay
    this.spotlightOverlay = new SpotlightOverlay();
    this.canvasContainer.appendChild(this.spotlightOverlay.getElement());

    // Create HSL Qualifier (secondary color correction)
    this.hslQualifier = new HSLQualifier();
    this.hslQualifier.on('stateChanged', () => {
      this.refresh();
    });

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

    // Create A/B indicator badge
    this.abIndicator = document.createElement('div');
    this.abIndicator.className = 'ab-indicator';
    this.abIndicator.dataset.testid = 'ab-indicator';
    this.abIndicator.style.cssText = `
      position: absolute;
      top: 10px;
      right: 60px;
      background: rgba(255, 180, 50, 0.9);
      color: #1a1a1a;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      z-index: 60;
      display: none;
      pointer-events: none;
    `;
    this.abIndicator.textContent = 'A';
    this.container.appendChild(this.abIndicator);

    // Listen for A/B changes
    this.session.on('abSourceChanged', ({ current }) => {
      this.updateABIndicator(current);
    });

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

    // Initialize WebGL sharpen processor
    try {
      this.sharpenProcessor = new WebGLSharpenProcessor();
    } catch (e) {
      console.warn('WebGL sharpen processor not available, falling back to CPU:', e);
      this.sharpenProcessor = null;
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

    // Update safe areas overlay dimensions
    this.safeAreasOverlay.setViewerDimensions(
      width,
      height,
      0,
      0,
      width,
      height
    );

    // Update matte overlay dimensions
    this.matteOverlay.setViewerDimensions(
      width,
      height,
      0,
      0,
      width,
      height
    );

    // Update spotlight overlay dimensions
    this.spotlightOverlay.setViewerDimensions(
      width,
      height,
      0,
      0,
      width,
      height
    );

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
    this.session.on('sourceLoaded', () => {
      this.hasDisplayedMediabunnyFrame = false;
      this.pendingVideoFrameFetch = null;
      this.pendingVideoFrameNumber = 0;
      this.scheduleRender();
    });
    this.session.on('frameChanged', () => this.scheduleRender());

    // Paint events
    this.paintEngine.on('annotationsChanged', () => this.renderPaint());
    this.paintEngine.on('toolChanged', (tool) => this.updateCursor(tool));

    // Pixel probe events - track mouse movement for color sampling
    this.container.addEventListener('mousemove', this.onMouseMoveForProbe);
    this.container.addEventListener('mousemove', this.onMouseMoveForCursorColor);
    this.container.addEventListener('mouseleave', this.onMouseLeaveForCursorColor);
    this.container.addEventListener('click', this.onClickForProbe);
  }

  private onMouseMoveForProbe = (e: MouseEvent): void => {
    if (!this.pixelProbe.isEnabled()) return;

    // Get canvas-relative coordinates
    const canvasRect = this.imageCanvas.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    // Check if within canvas bounds
    if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) {
      return;
    }

    // Scale to canvas pixel coordinates
    const scaleX = this.displayWidth / canvasRect.width;
    const scaleY = this.displayHeight / canvasRect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // Get image data for pixel value
    const imageData = this.getImageData();

    // Update pixel probe
    this.pixelProbe.updateFromCanvas(canvasX, canvasY, imageData, this.displayWidth, this.displayHeight);
    this.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
  };

  /**
   * Handle mouse move for cursor color callback (InfoPanel integration)
   * Throttled to ~60fps for performance
   */
  private onMouseMoveForCursorColor = (e: MouseEvent): void => {
    if (!this.cursorColorCallback) return;

    // Throttle updates to ~60fps (16ms)
    const now = Date.now();
    if (now - this.lastCursorColorUpdate < 16) {
      return;
    }
    this.lastCursorColorUpdate = now;

    // Get canvas-relative coordinates
    const canvasRect = this.imageCanvas.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    // Check if within canvas bounds
    if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) {
      this.cursorColorCallback(null, null);
      return;
    }

    // Scale to canvas pixel coordinates
    const scaleX = this.displayWidth / canvasRect.width;
    const scaleY = this.displayHeight / canvasRect.height;
    const canvasX = Math.floor(x * scaleX);
    const canvasY = Math.floor(y * scaleY);

    // Get pixel color from canvas
    const imageData = this.getImageData();
    if (!imageData) {
      this.cursorColorCallback(null, null);
      return;
    }

    // Calculate pixel index
    const pixelIndex = (canvasY * imageData.width + canvasX) * 4;
    if (pixelIndex < 0 || pixelIndex >= imageData.data.length - 3) {
      this.cursorColorCallback(null, null);
      return;
    }

    const r = imageData.data[pixelIndex]!;
    const g = imageData.data[pixelIndex + 1]!;
    const b = imageData.data[pixelIndex + 2]!;

    this.cursorColorCallback(
      { r, g, b },
      { x: canvasX, y: canvasY }
    );
  };

  /**
   * Handle mouse leave - clear cursor color
   */
  private onMouseLeaveForCursorColor = (): void => {
    if (this.cursorColorCallback) {
      this.cursorColorCallback(null, null);
    }
  };

  private onClickForProbe = (e: MouseEvent): void => {
    if (!this.pixelProbe.isEnabled()) return;

    // Only toggle lock if clicking on the canvas area (not on UI elements)
    const target = e.target as HTMLElement;
    if (this.isViewerContentElement(target)) {
      this.pixelProbe.toggleLock();
    }
  };

  private updateCursor(tool: PaintTool): void {
    // Pixel probe takes priority over other tools
    if (this.pixelProbe.isEnabled()) {
      this.container.style.cursor = 'crosshair';
      return;
    }

    switch (tool) {
      case 'pen':
      case 'eraser':
      case 'rectangle':
      case 'ellipse':
      case 'line':
      case 'arrow':
        this.container.style.cursor = 'crosshair';
        break;
      case 'text':
        this.container.style.cursor = 'text';
        break;
      default:
        this.container.style.cursor = 'grab';
    }
  }

  /**
   * Update cursor when pixel probe state changes
   */
  private updateCursorForProbe(enabled: boolean): void {
    if (enabled) {
      this.container.style.cursor = 'crosshair';
    } else {
      // Restore cursor based on current paint tool
      this.updateCursor(this.paintEngine.tool);
    }
  }

  /**
   * Check if an element is part of the viewer's own content (canvas, wipe line)
   * and not an overlay UI element like curves control
   */
  private isViewerContentElement(element: HTMLElement): boolean {
    // The element should be the container itself or one of its direct viewer elements
    return (
      element === this.container ||
      element === this.imageCanvas ||
      element === this.paintCanvas ||
      element === this.cropOverlay ||
      element === this.wipeLine ||
      element === this.canvasContainer ||
      this.canvasContainer.contains(element)
    );
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
    // Only handle events that target the viewer content directly
    // Don't capture events from overlay UI elements (curves control, etc.)
    const target = e.target as HTMLElement;
    if (!this.isViewerContentElement(target)) {
      return;
    }

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
      } else if (this.isShapeTool(tool)) {
        // Shape tools (rectangle, ellipse, line, arrow)
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
    } else if (this.isDrawingShape) {
      const point = this.getCanvasPoint(e.clientX, e.clientY);
      if (point) {
        this.shapeCurrentPoint = { x: point.x, y: point.y };
        this.renderLiveShape();
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

    if (this.isDrawingShape) {
      this.finalizeShape();
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

    // Cancel any shape drawing in progress
    if (this.isDrawingShape) {
      this.isDrawingShape = false;
      this.shapeStartPoint = null;
      this.shapeCurrentPoint = null;
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

  private renderLiveShape(): void {
    if (!this.shapeStartPoint || !this.shapeCurrentPoint) return;
    if (this.displayWidth === 0 || this.displayHeight === 0) return;

    const ctx = this.paintCtx;
    const renderOptions = { width: this.displayWidth, height: this.displayHeight };

    // Get existing annotations
    const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame);

    // Render all annotations to paintRenderer
    this.paintRenderer.renderAnnotations(annotations, renderOptions);

    // Then render live shape on top
    const shapeType = this.getShapeType(this.paintEngine.tool);
    this.paintRenderer.renderLiveShape(
      shapeType,
      this.shapeStartPoint,
      this.shapeCurrentPoint,
      this.paintEngine.color,
      this.paintEngine.width,
      renderOptions
    );

    // Copy to paint canvas
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    ctx.drawImage(this.paintRenderer.getCanvas(), 0, 0);
  }

  private finalizeShape(): void {
    if (!this.shapeStartPoint || !this.shapeCurrentPoint) {
      this.isDrawingShape = false;
      this.shapeStartPoint = null;
      this.shapeCurrentPoint = null;
      return;
    }

    const tool = this.paintEngine.tool;
    const frame = this.session.currentFrame;
    const shapeType = this.getShapeType(tool);

    // Only add shape if there's meaningful size (prevent accidental clicks)
    const dx = Math.abs(this.shapeCurrentPoint.x - this.shapeStartPoint.x);
    const dy = Math.abs(this.shapeCurrentPoint.y - this.shapeStartPoint.y);
    const minSize = 0.005; // Minimum 0.5% of canvas dimension

    if (dx > minSize || dy > minSize) {
      this.paintEngine.addShape(
        frame,
        shapeType,
        this.shapeStartPoint,
        this.shapeCurrentPoint
      );
    }

    // Reset shape drawing state
    this.isDrawingShape = false;
    this.shapeStartPoint = null;
    this.shapeCurrentPoint = null;
    this.renderPaint();
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

    // If actively drawing, render with live stroke/shape; otherwise just paint
    if (this.isDrawing && this.livePoints.length > 0) {
      this.renderLiveStroke();
    } else if (this.isDrawingShape && this.shapeStartPoint && this.shapeCurrentPoint) {
      this.renderLiveShape();
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

    // For sequences and videos with mediabunny, get the current frame
    let element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | undefined;
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
    } else if (source?.type === 'video' && this.session.isUsingMediabunny()) {
      // Try to use mediabunny cached frame canvas for accurate playback
      const currentFrame = this.session.currentFrame;
      const frameCanvas = this.session.getVideoFrameCanvas(currentFrame);
      if (frameCanvas) {
        element = frameCanvas;
        this.hasDisplayedMediabunnyFrame = true;
        this.pendingVideoFrameFetch = null;
        this.pendingVideoFrameNumber = 0;
      } else {
        // Frame not cached - fetch it asynchronously
        // Start a new fetch if:
        // 1. No fetch is pending, OR
        // 2. The pending fetch is for a different frame (user navigated)
        if (!this.pendingVideoFrameFetch || this.pendingVideoFrameNumber !== currentFrame) {
          // Cancel tracking of old fetch (it will complete but we'll ignore its refresh)
          this.pendingVideoFrameNumber = currentFrame;
          const frameToFetch = currentFrame;

          this.pendingVideoFrameFetch = this.session.fetchCurrentVideoFrame(frameToFetch)
            .then(() => {
              // Only refresh if this fetch is still relevant (user hasn't navigated away)
              if (this.pendingVideoFrameNumber === frameToFetch) {
                this.pendingVideoFrameFetch = null;
                this.pendingVideoFrameNumber = 0;
                this.refresh();
              }
            })
            .catch(() => {
              if (this.pendingVideoFrameNumber === frameToFetch) {
                this.pendingVideoFrameFetch = null;
                this.pendingVideoFrameNumber = 0;
              }
            });
        }

        // Only use HTMLVideoElement fallback on first render (before any mediabunny frame shown)
        // After that, keep previous frame to ensure frame-accurate stepping
        if (!this.hasDisplayedMediabunnyFrame) {
          element = source.element;
        } else {
          // Keep canvas as-is until correct frame loads
          this.updateCanvasPosition();
          this.updateWipeLine();
          return;
        }
      }
    } else {
      // Fallback: use HTMLVideoElement directly (no mediabunny)
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

    // Check if difference matte mode is enabled
    if (this.differenceMatteState.enabled && this.session.abCompareAvailable) {
      // Render difference between A and B sources
      const diffData = this.renderDifferenceMatte(displayWidth, displayHeight);
      if (diffData) {
        this.imageCtx.putImageData(diffData, 0, 0);
      }
    } else if (this.isStackEnabled()) {
      // Composite all stack layers
      const compositedData = this.compositeStackLayers(displayWidth, displayHeight);
      if (compositedData) {
        this.imageCtx.putImageData(compositedData, 0, 0);
      }
    } else if (
      element instanceof HTMLImageElement ||
      element instanceof HTMLVideoElement ||
      element instanceof HTMLCanvasElement ||
      (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)
    ) {
      // Single source rendering (supports images, videos, and canvas elements from mediabunny)
      // Handle wipe rendering
      if (this.wipeState.mode !== 'off' && !(element instanceof HTMLCanvasElement) && !(typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)) {
        // Wipe only works with HTMLImageElement/HTMLVideoElement
        this.renderWithWipe(element as HTMLImageElement | HTMLVideoElement, displayWidth, displayHeight);
      } else {
        // Normal rendering with transforms
        this.drawWithTransform(this.imageCtx, element as CanvasImageSource, displayWidth, displayHeight);
      }
    }

    // Apply post-processing effects (stereo, lens, LUT, color, sharpen) regardless of stack mode
    // Apply stereo viewing mode (transforms layout for 3D viewing)
    if (!isDefaultStereoState(this.stereoState)) {
      this.applyStereoMode(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply lens distortion correction (geometric transform, applied first)
    if (!isDefaultLensParams(this.lensParams)) {
      this.applyLensDistortionToCtx(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply 3D LUT (GPU-accelerated color grading)
    if (this.currentLUT && this.lutIntensity > 0) {
      this.applyLUTToCanvas(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply batched pixel-level effects (CDL, curves, sharpen, channel isolation)
    // This uses a single getImageData/putImageData pair for better performance
    this.applyBatchedPixelEffects(this.imageCtx, displayWidth, displayHeight);

    this.updateCanvasPosition();
    this.updateWipeLine();
  }

  /**
   * Draw image/video with rotation and flip transforms applied
   */
  private drawWithTransform(
    ctx: CanvasRenderingContext2D,
    element: CanvasImageSource,
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
      let sourceAspect: number;
      if (element instanceof HTMLVideoElement) {
        sourceAspect = element.videoWidth / element.videoHeight;
      } else if (element instanceof HTMLImageElement) {
        sourceAspect = element.naturalWidth / element.naturalHeight;
      } else if (element instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)) {
        sourceAspect = element.width / element.height;
      } else {
        sourceAspect = displayWidth / displayHeight; // Fallback
      }
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
    // Check if cached filter is still valid
    if (this.cachedFilterString !== null && this.cachedFilterAdjustments !== null) {
      const adj = this.colorAdjustments;
      const cached = this.cachedFilterAdjustments;
      if (
        adj.brightness === cached.brightness &&
        adj.exposure === cached.exposure &&
        adj.contrast === cached.contrast &&
        adj.saturation === cached.saturation &&
        adj.temperature === cached.temperature &&
        adj.tint === cached.tint
      ) {
        return this.cachedFilterString;
      }
    }

    // Build new filter string
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

    // Cache the result
    this.cachedFilterString = filters.length > 0 ? filters.join(' ') : 'none';
    this.cachedFilterAdjustments = { ...this.colorAdjustments };

    return this.cachedFilterString;
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
   * Update A/B indicator visibility and text
   */
  updateABIndicator(current?: 'A' | 'B'): void {
    if (!this.abIndicator) return;

    const ab = current ?? this.session.currentAB;
    const available = this.session.abCompareAvailable;

    if (available) {
      this.abIndicator.style.display = 'block';
      this.abIndicator.textContent = ab;
      // Different colors for A and B
      if (ab === 'A') {
        this.abIndicator.style.background = 'rgba(74, 158, 255, 0.9)';
        this.abIndicator.style.color = 'white';
      } else {
        this.abIndicator.style.background = 'rgba(255, 180, 50, 0.9)';
        this.abIndicator.style.color = '#1a1a1a';
      }
    } else {
      this.abIndicator.style.display = 'none';
    }
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
    this.transform = {
      ...transform,
      scale: { ...DEFAULT_TRANSFORM.scale, ...transform.scale },
      translate: { ...DEFAULT_TRANSFORM.translate, ...transform.translate },
    };
    this.scheduleRender();
  }

  getTransform(): Transform2D {
    return {
      ...this.transform,
      scale: { ...this.transform.scale },
      translate: { ...this.transform.translate },
    };
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

  // Color curves methods
  setCurves(curves: ColorCurvesData): void {
    this.curvesData = {
      master: { ...curves.master, points: [...curves.master.points] },
      red: { ...curves.red, points: [...curves.red.points] },
      green: { ...curves.green, points: [...curves.green.points] },
      blue: { ...curves.blue, points: [...curves.blue.points] },
    };
    this.scheduleRender();
  }

  getCurves(): ColorCurvesData {
    return {
      master: { ...this.curvesData.master, points: [...this.curvesData.master.points] },
      red: { ...this.curvesData.red, points: [...this.curvesData.red.points] },
      green: { ...this.curvesData.green, points: [...this.curvesData.green.points] },
      blue: { ...this.curvesData.blue, points: [...this.curvesData.blue.points] },
    };
  }

  resetCurves(): void {
    this.curvesData = createDefaultCurvesData();
    this.scheduleRender();
  }

  /**
   * Apply batched pixel-level effects to the canvas.
   * Uses a single getImageData/putImageData pair for CDL, curves, sharpen, and channel isolation.
   * This reduces GPU↔CPU transfers from 4 to 1.
   */
  private applyBatchedPixelEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const hasCDL = !isDefaultCDL(this.cdlValues);
    const hasCurves = !isDefaultCurves(this.curvesData);
    const hasSharpen = this.filterSettings.sharpen > 0;
    const hasChannel = this.channelMode !== 'rgb';
    const hasHighlightsShadows = this.colorAdjustments.highlights !== 0 || this.colorAdjustments.shadows !== 0 ||
                                 this.colorAdjustments.whites !== 0 || this.colorAdjustments.blacks !== 0;
    const hasVibrance = this.colorAdjustments.vibrance !== 0;
    const hasClarity = this.colorAdjustments.clarity !== 0;
    const hasColorWheels = this.colorWheels.hasAdjustments();
    const hasHSLQualifier = this.hslQualifier.isEnabled();
    const hasFalseColor = this.falseColor.isEnabled();
    const hasZebras = this.zebraStripes.isEnabled();
    const hasClippingOverlay = this.clippingOverlay.isEnabled();

    // Early return if no pixel effects are active
    if (!hasCDL && !hasCurves && !hasSharpen && !hasChannel && !hasHighlightsShadows && !hasVibrance && !hasClarity && !hasColorWheels && !hasHSLQualifier && !hasFalseColor && !hasZebras && !hasClippingOverlay) {
      return;
    }

    // Single getImageData call
    const imageData = ctx.getImageData(0, 0, width, height);

    // Apply highlight/shadow recovery (before other adjustments for best results)
    if (hasHighlightsShadows) {
      this.applyHighlightsShadows(imageData);
    }

    // Apply vibrance (intelligent saturation - before CDL/curves for natural results)
    if (hasVibrance) {
      this.applyVibrance(imageData);
    }

    // Apply clarity (local contrast enhancement in midtones)
    if (hasClarity) {
      this.applyClarity(imageData, width, height);
    }

    // Apply color wheels (Lift/Gamma/Gain - after basic adjustments, before CDL)
    if (hasColorWheels) {
      this.colorWheels.apply(imageData);
    }

    // Apply CDL color correction
    if (hasCDL) {
      applyCDLToImageData(imageData, this.cdlValues);
    }

    // Apply color curves
    if (hasCurves) {
      this.curveLUTCache.apply(imageData, this.curvesData);
    }

    // Apply HSL Qualifier (secondary color correction - after primary corrections)
    if (hasHSLQualifier) {
      this.hslQualifier.apply(imageData);
    }

    // Apply sharpen filter
    if (hasSharpen) {
      this.applySharpenToImageData(imageData, width, height);
    }

    // Apply channel isolation (before false color so we can see individual channel exposure)
    if (hasChannel) {
      applyChannelIsolation(imageData, this.channelMode);
    }

    // Apply false color display (replaces all color information for exposure analysis)
    if (hasFalseColor) {
      this.falseColor.apply(imageData);
    }

    // Apply zebra stripes (overlay on top of other effects for exposure warnings)
    // Note: Zebras work on original image luminance, so they're applied after false color
    // (typically you'd use one or the other, not both)
    if (hasZebras && !hasFalseColor) {
      this.zebraStripes.apply(imageData);
    }

    // Apply clipping overlay (shows clipped highlights/shadows)
    // Applied last as it's a diagnostic overlay
    if (hasClippingOverlay && !hasFalseColor && !hasZebras) {
      this.clippingOverlay.apply(imageData);
    }

    // Single putImageData call
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Apply highlight/shadow recovery and whites/blacks clipping to ImageData.
   * Uses luminance-based masking with soft knee compression.
   *
   * Highlights: Negative values compress/recover highlights, positive values boost
   * Shadows: Negative values crush shadows, positive values lift/recover
   * Whites: Positive values lower the white clipping point, negative extends it
   * Blacks: Positive values raise the black clipping point, negative extends it
   */
  private applyHighlightsShadows(imageData: ImageData): void {
    const data = imageData.data;
    const highlights = this.colorAdjustments.highlights / 100; // -1 to +1
    const shadows = this.colorAdjustments.shadows / 100; // -1 to +1
    const whites = this.colorAdjustments.whites / 100; // -1 to +1
    const blacks = this.colorAdjustments.blacks / 100; // -1 to +1

    // Pre-compute LUT for performance (256 entries for each channel)
    // This avoids per-pixel math for the soft knee functions
    const highlightLUT = new Float32Array(256);
    const shadowLUT = new Float32Array(256);

    for (let i = 0; i < 256; i++) {
      const normalized = i / 255;

      // Highlight mask: smooth transition starting around 0.5, full effect at 1.0
      // Using smoothstep-like curve for natural falloff
      const highlightMask = this.smoothstep(0.5, 1.0, normalized);

      // Shadow mask: smooth transition starting around 0.5, full effect at 0.0
      const shadowMask = 1.0 - this.smoothstep(0.0, 0.5, normalized);

      // Store the adjustment multipliers
      highlightLUT[i] = highlightMask;
      shadowLUT[i] = shadowMask;
    }

    // Calculate white and black clipping points
    // Whites: at 0, white point is 255; at +100, it clips at ~200; at -100, it extends beyond
    // Blacks: at 0, black point is 0; at +100, it lifts to ~55; at -100, it extends beyond
    const whitePoint = 255 - whites * 55; // Range: 200-310 (255 at default)
    const blackPoint = blacks * 55; // Range: -55 to 55 (0 at default)

    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      let r = data[i]!;
      let g = data[i + 1]!;
      let b = data[i + 2]!;

      // Apply whites/blacks clipping first (affects the entire range)
      if (whites !== 0 || blacks !== 0) {
        // Remap values from [blackPoint, whitePoint] to [0, 255]
        const range = whitePoint - blackPoint;
        if (range > 0) {
          r = Math.max(0, Math.min(255, ((r - blackPoint) / range) * 255));
          g = Math.max(0, Math.min(255, ((g - blackPoint) / range) * 255));
          b = Math.max(0, Math.min(255, ((b - blackPoint) / range) * 255));
        }
      }

      // Calculate luminance (Rec. 709) after whites/blacks adjustment
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));

      // Get masks from LUTs
      const highlightMask = highlightLUT[lumIndex]!;
      const shadowMask = shadowLUT[lumIndex]!;

      // Apply highlights/shadows adjustments
      if (highlights !== 0) {
        // For highlights recovery (negative): compress towards midtones
        // For highlights boost (positive): push brighter
        const highlightAdjust = highlights * highlightMask * 128;
        r = Math.max(0, Math.min(255, r - highlightAdjust));
        g = Math.max(0, Math.min(255, g - highlightAdjust));
        b = Math.max(0, Math.min(255, b - highlightAdjust));
      }

      if (shadows !== 0) {
        // For shadow recovery (positive): lift shadows
        // For shadow crush (negative): push darker
        const shadowAdjust = shadows * shadowMask * 128;
        r = Math.max(0, Math.min(255, r + shadowAdjust));
        g = Math.max(0, Math.min(255, g + shadowAdjust));
        b = Math.max(0, Math.min(255, b + shadowAdjust));
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      // Alpha unchanged
    }
  }

  /**
   * Smoothstep function for soft transitions
   * Returns 0 when x <= edge0, 1 when x >= edge1, smooth interpolation between
   */
  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Apply vibrance effect to ImageData.
   * Vibrance is intelligent saturation that:
   * - Boosts less-saturated colors more than already-saturated ones
   * - Protects skin tones (hue range ~20-50 degrees in orange-yellow)
   * - Prevents clipping of already-saturated colors
   *
   * Formula: sat_factor = 1.0 - (current_saturation * 0.5)
   *          new_saturation = current_saturation + (vibrance * sat_factor)
   */
  private applyVibrance(imageData: ImageData): void {
    const data = imageData.data;
    const vibrance = this.colorAdjustments.vibrance / 100; // -1 to +1
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      // Calculate max, min for HSL conversion
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      // Calculate saturation (HSL)
      const l = (max + min) / 2;
      let s = 0;
      if (delta !== 0) {
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      }

      // Calculate hue for skin tone detection
      let h = 0;
      if (delta !== 0) {
        if (max === r) {
          h = ((g - b) / delta) % 6;
        } else if (max === g) {
          h = (b - r) / delta + 2;
        } else {
          h = (r - g) / delta + 4;
        }
        h = h * 60;
        if (h < 0) h += 360;
      }

      // Skin tone protection: reduce effect for hue range 20-50 degrees (orange-yellow skin tones)
      // Also check for low saturation which is typical of skin
      // Only apply if vibranceSkinProtection is enabled
      let skinProtection = 1.0;
      if (this.colorAdjustments.vibranceSkinProtection && h >= 20 && h <= 50 && s < 0.6 && l > 0.2 && l < 0.8) {
        // Gradual protection based on how "skin-like" the color is
        const hueCenter = 35; // Center of skin tone range (20-50)
        const hueDistance = Math.abs(h - hueCenter) / 15; // Normalize to 0-1 (max distance from center is 15)
        skinProtection = 0.3 + (hueDistance * 0.7); // 30% effect at center, up to 100% at edges
      }

      // Calculate vibrance adjustment factor
      // Less saturated colors get more boost
      const satFactor = 1.0 - (s * 0.5);
      const adjustment = vibrance * satFactor * skinProtection;

      // Calculate new saturation
      let newS = s + adjustment;
      newS = Math.max(0, Math.min(1, newS));

      // If saturation didn't change, skip conversion back
      if (Math.abs(newS - s) < 0.001) continue;

      // Convert back to RGB (HSL to RGB)
      let newR: number, newG: number, newB: number;

      if (newS === 0) {
        newR = newG = newB = l;
      } else {
        const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
        const p = 2 * l - q;
        const hNorm = h / 360;

        newR = this.hueToRgb(p, q, hNorm + 1/3);
        newG = this.hueToRgb(p, q, hNorm);
        newB = this.hueToRgb(p, q, hNorm - 1/3);
      }

      data[i] = Math.round(newR * 255);
      data[i + 1] = Math.round(newG * 255);
      data[i + 2] = Math.round(newB * 255);
      // Alpha unchanged
    }
  }

  /**
   * Helper function to convert hue to RGB component
   */
  private hueToRgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }

  /**
   * Apply clarity (local contrast) effect to ImageData.
   * Clarity enhances midtone contrast using a high-pass filter approach:
   * 1. Apply Gaussian blur to create low-frequency layer
   * 2. Subtract low-frequency from original = high-frequency detail
   * 3. Create midtone mask from luminance (full effect in midtones, fades at extremes)
   * 4. Add masked high-frequency back scaled by clarity amount
   *
   * Positive clarity adds punch and definition to midtones.
   * Negative clarity softens/smooths midtone detail.
   */
  private applyClarity(imageData: ImageData, width: number, height: number): void {
    const data = imageData.data;
    const clarity = this.colorAdjustments.clarity / 100; // -1 to +1
    const len = data.length;

    // Create a copy for the blur operation
    const original = new Uint8ClampedArray(data);

    // Apply 5x5 Gaussian blur to create low-frequency layer
    // Using separable filter for performance (horizontal then vertical pass)
    const blurred = this.applyGaussianBlur5x5(original, width, height);

    // Pre-compute midtone mask LUT
    // Full effect (1.0) at midtones (128), fading to 0 at extremes
    const midtoneMask = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      // Bell curve centered at 128, with wider range for natural look
      const normalized = i / 255;
      // Use smooth bell curve: 1 at center, 0 at edges
      // f(x) = 1 - (2x - 1)^2 gives a parabola from 0 to 1 to 0
      const deviation = Math.abs(normalized - 0.5) * 2; // 0 at center, 1 at edges
      midtoneMask[i] = 1.0 - deviation * deviation; // Quadratic falloff
    }

    // Scale factor for the effect (reduced to avoid harsh artifacts)
    const effectScale = clarity * 0.7;

    for (let i = 0; i < len; i += 4) {
      const r = original[i]!;
      const g = original[i + 1]!;
      const b = original[i + 2]!;

      const blurredR = blurred[i]!;
      const blurredG = blurred[i + 1]!;
      const blurredB = blurred[i + 2]!;

      // Calculate luminance for midtone mask (Rec. 709)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const lumIndex = Math.min(255, Math.max(0, Math.round(lum)));
      const mask = midtoneMask[lumIndex]!;

      // Calculate high-frequency detail (original - blurred)
      const highR = r - blurredR;
      const highG = g - blurredG;
      const highB = b - blurredB;

      // Add masked high-frequency detail back, scaled by clarity
      // Positive clarity: add detail; Negative clarity: subtract detail (softens)
      const adjustedMask = mask * effectScale;
      data[i] = Math.max(0, Math.min(255, r + highR * adjustedMask));
      data[i + 1] = Math.max(0, Math.min(255, g + highG * adjustedMask));
      data[i + 2] = Math.max(0, Math.min(255, b + highB * adjustedMask));
      // Alpha unchanged
    }
  }

  /**
   * Apply 5x5 Gaussian blur to image data.
   * Uses separable convolution (horizontal + vertical) for O(n*k) instead of O(n*k^2).
   * Kernel: [1, 4, 6, 4, 1] / 16 (approximation of Gaussian)
   */
  private applyGaussianBlur5x5(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const result = new Uint8ClampedArray(data.length);
    const temp = new Uint8ClampedArray(data.length);

    // Gaussian kernel: [1, 4, 6, 4, 1] / 16
    const kernel = [1, 4, 6, 4, 1];

    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let weightSum = 0;

          for (let k = -2; k <= 2; k++) {
            const nx = Math.min(width - 1, Math.max(0, x + k));
            const nidx = (y * width + nx) * 4 + c;
            const weight = kernel[k + 2]!;
            sum += data[nidx]! * weight;
            weightSum += weight;
          }

          temp[idx + c] = sum / weightSum;
        }
        temp[idx + 3] = data[idx + 3]!; // Copy alpha
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        for (let c = 0; c < 3; c++) {
          let sum = 0;
          let weightSum = 0;

          for (let k = -2; k <= 2; k++) {
            const ny = Math.min(height - 1, Math.max(0, y + k));
            const nidx = (ny * width + x) * 4 + c;
            const weight = kernel[k + 2]!;
            sum += temp[nidx]! * weight;
            weightSum += weight;
          }

          result[idx + c] = sum / weightSum;
        }
        result[idx + 3] = temp[idx + 3]!; // Copy alpha
      }
    }

    return result;
  }

  /**
   * Apply sharpen filter to ImageData in-place.
   * Uses GPU acceleration when available, falls back to CPU.
   */
  private applySharpenToImageData(imageData: ImageData, width: number, height: number): void {
    const amount = this.filterSettings.sharpen;

    // Try GPU sharpen first (much faster for large images)
    if (this.sharpenProcessor && this.sharpenProcessor.isReady()) {
      this.sharpenProcessor.applyInPlace(imageData, amount);
      return;
    }

    // CPU fallback: 3x3 unsharp mask kernel convolution
    this.applySharpenCPU(imageData, width, height, amount / 100);
  }

  /**
   * CPU-based sharpen filter (fallback when GPU is unavailable)
   */
  private applySharpenCPU(imageData: ImageData, width: number, height: number, amount: number): void {
    const data = imageData.data;

    // Create a copy for reading original values
    const original = new Uint8ClampedArray(data);

    // Sharpen kernel (3x3 unsharp mask approximation)
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

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

  // Stereo viewing methods
  setStereoState(state: StereoState): void {
    this.stereoState = { ...state };
    this.scheduleRender();
  }

  getStereoState(): StereoState {
    return { ...this.stereoState };
  }

  resetStereoState(): void {
    this.stereoState = { ...DEFAULT_STEREO_STATE };
    this.scheduleRender();
  }

  /**
   * Apply stereo viewing mode to the canvas
   */
  private applyStereoMode(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (isDefaultStereoState(this.stereoState)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const processedData = applyStereoMode(imageData, this.stereoState);
    ctx.putImageData(processedData, 0, 0);
  }

  // Difference matte methods
  setDifferenceMatteState(state: DifferenceMatteState): void {
    this.differenceMatteState = { ...state };
    this.scheduleRender();
  }

  getDifferenceMatteState(): DifferenceMatteState {
    return { ...this.differenceMatteState };
  }

  resetDifferenceMatteState(): void {
    this.differenceMatteState = { ...DEFAULT_DIFFERENCE_MATTE_STATE };
    this.scheduleRender();
  }

  /**
   * Check if difference matte is enabled
   */
  isDifferenceMatteEnabled(): boolean {
    return this.differenceMatteState.enabled;
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
   * Render difference matte between A and B sources
   * Shows absolute pixel difference, optionally as heatmap
   */
  private renderDifferenceMatte(width: number, height: number): ImageData | null {
    const sourceA = this.session.sourceA;
    const sourceB = this.session.sourceB;

    if (!sourceA?.element || !sourceB?.element) return null;

    // Render both sources to ImageData
    const dataA = this.renderSourceToImageData(this.session.sourceAIndex, width, height);
    const dataB = this.renderSourceToImageData(this.session.sourceBIndex, width, height);

    if (!dataA || !dataB) return null;

    // Apply difference matte algorithm
    return applyDifferenceMatte(
      dataA,
      dataB,
      this.differenceMatteState.gain,
      this.differenceMatteState.heatmap
    );
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
    this.container.removeEventListener('mousemove', this.onMouseMoveForCursorColor);
    this.container.removeEventListener('mouseleave', this.onMouseLeaveForCursorColor);

    // Clear cursor color callback
    this.cursorColorCallback = null;

    // Cleanup WebGL LUT processor
    if (this.lutProcessor) {
      this.lutProcessor.dispose();
      this.lutProcessor = null;
    }

    // Cleanup WebGL sharpen processor
    if (this.sharpenProcessor) {
      this.sharpenProcessor.dispose();
      this.sharpenProcessor = null;
    }

    // Cleanup overlays
    this.clippingOverlay.dispose();
    this.falseColor.dispose();
    this.zebraStripes.dispose();
    this.spotlightOverlay.dispose();
    this.hslQualifier.dispose();
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

  /**
   * Get the safe areas overlay instance
   */
  getSafeAreasOverlay(): SafeAreasOverlay {
    return this.safeAreasOverlay;
  }

  /**
   * Get the matte overlay instance
   */
  getMatteOverlay(): MatteOverlay {
    return this.matteOverlay;
  }

  /**
   * Get the timecode overlay instance
   */
  getTimecodeOverlay(): TimecodeOverlay {
    return this.timecodeOverlay;
  }

  /**
   * Get the pixel probe instance
   */
  getPixelProbe(): PixelProbe {
    return this.pixelProbe;
  }

  /**
   * Get the false color display instance
   */
  getFalseColor(): FalseColor {
    return this.falseColor;
  }

  /**
   * Get the zebra stripes instance
   */
  getZebraStripes(): ZebraStripes {
    return this.zebraStripes;
  }

  /**
   * Get the clipping overlay instance
   */
  getClippingOverlay(): ClippingOverlay {
    return this.clippingOverlay;
  }

  /**
   * Get the color wheels instance
   */
  getColorWheels(): ColorWheels {
    return this.colorWheels;
  }

  /**
   * Get the spotlight overlay instance
   */
  getSpotlightOverlay(): SpotlightOverlay {
    return this.spotlightOverlay;
  }

  /**
   * Get the HSL Qualifier instance (secondary color correction)
   */
  getHSLQualifier(): HSLQualifier {
    return this.hslQualifier;
  }

  /**
   * Register a callback for cursor color updates (for InfoPanel integration)
   * The callback is called with the RGB color and position when the mouse moves over the canvas.
   * When the mouse leaves the canvas or is outside bounds, null values are passed.
   * @param callback The callback function, or null to unregister
   */
  onCursorColorChange(callback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null): void {
    this.cursorColorCallback = callback;
  }
}
