import { Session } from '../../core/session/Session';
import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { StrokePoint, ShapeType, Point } from '../../paint/types';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { WipeState, WipeMode } from './WipeControl';
import { Transform2D, DEFAULT_TRANSFORM } from './TransformControl';
import { FilterSettings, DEFAULT_FILTER_SETTINGS } from './FilterControl';
import { CropState, CropRegion, DEFAULT_CROP_STATE, DEFAULT_CROP_REGION, ASPECT_RATIOS, MIN_CROP_FRACTION } from './CropControl';
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
import { PrerenderBufferManager } from '../../utils/PrerenderBufferManager';
import { getThemeManager } from '../../utils/ThemeManager';
import { setupHiDPICanvas, resetCanvasFromHiDPI } from '../../utils/HiDPICanvas';

// Extracted effect processing utilities
import { applyHighlightsShadows, applyVibrance, applyClarity, applySharpenCPU } from './ViewerEffects';
import {
  createWipeUIElements,
  updateWipeLinePosition,
  isPointerOnWipeLine,
  calculateWipePosition,
  setWipeLabels as setWipeLabelsUtil,
  getWipeLabels as getWipeLabelsUtil,
  WipeUIElements,
} from './ViewerWipe';
import {
  PointerState,
  getCanvasPoint as getCanvasPointUtil,
  calculateWheelZoom,
  calculateZoomPan,
  calculatePinchDistance,
  calculatePinchZoom,
  isViewerContentElement as isViewerContentElementUtil,
  getPixelCoordinates,
  getPixelColor,
} from './ViewerInteraction';
import {
  drawWithTransform as drawWithTransformUtil,
  FilterStringCache,
  getCanvasFilterString as getCanvasFilterStringUtil,
  buildContainerFilterString,
  renderCropOverlay as renderCropOverlayUtil,
  drawPlaceholder as drawPlaceholderUtil,
  calculateDisplayDimensions,
  isFullCropRegion,
} from './ViewerRenderingUtils';
import {
  createExportCanvas as createExportCanvasUtil,
  renderFrameToCanvas as renderFrameToCanvasUtil,
  renderSourceToImageData as renderSourceToImageDataUtil,
} from './ViewerExport';
import {
  createFrameLoader,
  buildEffectsState,
  getPrerenderStats as getPrerenderStatsUtil,
  PrerenderStats,
  EFFECTS_DEBOUNCE_MS,
} from './ViewerPrerender';

// Wipe label constants (kept for wipe UI initialization)
const DEFAULT_WIPE_LABEL_A = 'Original';
const DEFAULT_WIPE_LABEL_B = 'Graded';

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

  // Wipe comparison
  private wipeState: WipeState = { mode: 'off', position: 0.5, showOriginal: 'left' };
  private wipeElements: WipeUIElements | null = null;
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
  private isDraggingCrop = false;
  private cropDragHandle: 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'move' | null = null;
  private cropDragStart: { x: number; y: number; region: CropRegion } | null = null;
  private cropDragPointerId: number | null = null;
  private cropRegionChangedCallback: ((region: CropRegion) => void) | null = null;
  private isCropPanelOpen = false;

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

  // Prerender buffer for smooth playback with effects
  private prerenderBuffer: PrerenderBufferManager | null = null;
  private prerenderCacheUpdateCallback: (() => void) | null = null;
  private effectsChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Filter string cache for performance
  private filterStringCache: FilterStringCache = { filterString: null, cachedAdjustments: null };

  // Cursor color callback for InfoPanel
  private cursorColorCallback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null = null;
  private lastCursorColorUpdate = 0;

  // Theme change listener for runtime theme updates
  private boundOnThemeChange: (() => void) | null = null;

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
      background: var(--viewer-bg);
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
      this.notifyEffectsChanged();
      this.refresh();
    });

    // Create spotlight overlay
    this.spotlightOverlay = new SpotlightOverlay();
    this.canvasContainer.appendChild(this.spotlightOverlay.getElement());

    // Create HSL Qualifier (secondary color correction)
    this.hslQualifier = new HSLQualifier();
    this.hslQualifier.on('stateChanged', () => {
      this.notifyEffectsChanged();
      this.refresh();
    });

    // Use willReadFrequently for better getImageData performance during effect processing
    const imageCtx = this.imageCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!imageCtx) throw new Error('Failed to get image 2D context');
    this.imageCtx = imageCtx;

    const paintCtx = this.paintCanvas.getContext('2d');
    if (!paintCtx) throw new Error('Failed to get paint 2D context');
    this.paintCtx = paintCtx;

    // Create wipe UI elements (line and labels)
    this.wipeElements = createWipeUIElements(this.container);

    // Create LUT indicator badge
    this.lutIndicator = document.createElement('div');
    this.lutIndicator.className = 'lut-indicator';
    this.lutIndicator.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(var(--accent-primary-rgb), 0.8);
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
      color: var(--bg-primary);
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
      background: rgba(var(--accent-primary-rgb), 0.2);
      border: 3px dashed var(--accent-primary);
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 100;
    `;
    this.dropOverlay.innerHTML = `
      <div style="text-align: center; color: var(--accent-primary); font-size: 18px;">
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

    // Listen for theme changes to redraw placeholders and overlays with updated colors
    this.boundOnThemeChange = () => {
      this.scheduleRender();
    };
    getThemeManager().on('themeChanged', this.boundOnThemeChange);
  }

  private initializeCanvas(): void {
    // Set initial canvas size for placeholder
    this.sourceWidth = 640;
    this.sourceHeight = 360;
    this.displayWidth = 640;
    this.displayHeight = 360;
    // Draw placeholder with hi-DPI support
    this.drawPlaceholder();
    this.updateOverlayDimensions();
    this.updateCanvasPosition();
  }

  /**
   * Set canvas size for media rendering (standard mode, no hi-DPI scaling).
   * This resets any hi-DPI configuration from placeholder mode.
   */
  private setCanvasSize(width: number, height: number): void {
    this.displayWidth = width;
    this.displayHeight = height;

    // Reset all canvases from hi-DPI mode using the utility
    resetCanvasFromHiDPI(this.imageCanvas, this.imageCtx, width, height);
    resetCanvasFromHiDPI(this.paintCanvas, this.paintCtx, width, height);

    if (this.cropOverlay && this.cropCtx) {
      resetCanvasFromHiDPI(this.cropOverlay, this.cropCtx, width, height);
    }

    this.updateOverlayDimensions();
    this.updateCanvasPosition();
  }

  /**
   * Update overlay dimensions to match display size.
   */
  private updateOverlayDimensions(): void {
    const width = this.displayWidth;
    const height = this.displayHeight;

    // Update safe areas overlay dimensions
    this.safeAreasOverlay.setViewerDimensions(width, height, 0, 0, width, height);

    // Update matte overlay dimensions
    this.matteOverlay.setViewerDimensions(width, height, 0, 0, width, height);

    // Update spotlight overlay dimensions
    this.spotlightOverlay.setViewerDimensions(width, height, 0, 0, width, height);
  }

  /**
   * Draw placeholder content with hi-DPI support for crisp text.
   * Sets up the canvas for hi-DPI rendering before drawing.
   */
  private drawPlaceholder(): void {
    // Setup hi-DPI canvas for crisp placeholder text
    setupHiDPICanvas({
      canvas: this.imageCanvas,
      ctx: this.imageCtx,
      width: this.displayWidth,
      height: this.displayHeight,
    });

    // Draw the placeholder content using logical coordinates
    drawPlaceholderUtil(this.imageCtx, this.displayWidth, this.displayHeight, this.zoom);
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

    const canvasRect = this.imageCanvas.getBoundingClientRect();
    const position = getPixelCoordinates(
      e.clientX,
      e.clientY,
      canvasRect,
      this.displayWidth,
      this.displayHeight
    );

    if (!position) {
      this.cursorColorCallback(null, null);
      return;
    }

    const imageData = this.getImageData();
    if (!imageData) {
      this.cursorColorCallback(null, null);
      return;
    }

    const color = getPixelColor(imageData, position.x, position.y);
    if (!color) {
      this.cursorColorCallback(null, null);
      return;
    }

    this.cursorColorCallback(color, position);
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
    return isViewerContentElementUtil(
      element,
      this.container,
      this.canvasContainer,
      this.imageCanvas,
      this.paintCanvas,
      this.cropOverlay,
      this.wipeElements?.wipeLine ?? null
    );
  }

  private getCanvasPoint(clientX: number, clientY: number, pressure = 0.5): StrokePoint | null {
    const rect = this.imageCanvas.getBoundingClientRect();
    return getCanvasPointUtil(clientX, clientY, rect, this.displayWidth, this.displayHeight, pressure);
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

    // Check for crop handle dragging
    if (this.handleCropPointerDown(e)) {
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

    // Handle crop dragging
    if (this.isDraggingCrop) {
      this.handleCropPointerMove(e);
      return;
    }

    // Update cursor for crop handles on hover (only when panel is open / editing)
    if (this.cropState.enabled && this.isCropPanelOpen && !this.activePointers.size) {
      const handle = this.getCropHandleAtPoint(e.clientX, e.clientY);
      this.updateCropCursor(handle);
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

    // Handle crop dragging end
    if (this.isDraggingCrop) {
      this.handleCropPointerUp();
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

    this.initialPinchDistance = calculatePinchDistance(pointers);
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
    const currentDistance = calculatePinchDistance(pointers);
    const newZoom = calculatePinchZoom(this.initialPinchDistance, currentDistance, this.initialZoom);

    if (newZoom !== null && Math.abs(newZoom - this.zoom) > 0.01) {
      this.zoom = newZoom;
      this.scheduleRender();
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = calculateWheelZoom(e.deltaY, this.zoom);
    if (newZoom === null) return;

    const containerWidth = rect.width || 640;
    const containerHeight = rect.height || 360;

    const { panX, panY } = calculateZoomPan(
      mouseX,
      mouseY,
      containerWidth,
      containerHeight,
      this.sourceWidth,
      this.sourceHeight,
      this.panX,
      this.panY,
      this.zoom,
      newZoom
    );

    this.panX = panX;
    this.panY = panY;
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

      const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
        this.sourceWidth,
        this.sourceHeight,
        containerWidth,
        containerHeight,
        this.zoom
      );

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

    const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
      this.sourceWidth,
      this.sourceHeight,
      containerWidth,
      containerHeight,
      this.zoom
    );

    // Update canvas size if needed
    if (this.displayWidth !== displayWidth || this.displayHeight !== displayHeight) {
      this.setCanvasSize(displayWidth, displayHeight);
    }

    // Clear canvas
    this.imageCtx.clearRect(0, 0, displayWidth, displayHeight);

    // Check if crop clipping should be applied (will be done AFTER all rendering)
    // Note: We can't use ctx.clip() because putImageData() ignores clip regions
    const cropClipActive = this.cropState.enabled && !isFullCropRegion(this.cropState.region);

    // Try prerendered cache first during playback for smooth performance with effects
    if (this.session.isPlaying && this.prerenderBuffer) {
      const currentFrame = this.session.currentFrame;
      const cached = this.prerenderBuffer.getFrame(currentFrame);
      if (cached) {
        // Draw cached pre-rendered frame scaled to display size
        this.imageCtx.drawImage(cached.canvas, 0, 0, displayWidth, displayHeight);
        // Apply crop clipping by clearing outside areas
        if (cropClipActive) {
          this.clearOutsideCropRegion(displayWidth, displayHeight);
        }
        this.updateCanvasPosition();
        this.updateWipeLine();
        // Trigger preloading of nearby frames
        this.prerenderBuffer.preloadAround(currentFrame);
        return; // Skip live effect processing
      }
    }

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

    // Apply crop clipping by clearing areas outside the crop region
    // Note: This is done AFTER all effects because putImageData() ignores ctx.clip()
    if (cropClipActive) {
      this.clearOutsideCropRegion(displayWidth, displayHeight);
    }

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
    drawWithTransformUtil(ctx, element, displayWidth, displayHeight, this.transform);
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
    return getCanvasFilterStringUtil(this.colorAdjustments, this.filterStringCache);
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
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getColorAdjustments(): ColorAdjustments {
    return { ...this.colorAdjustments };
  }

  resetColorAdjustments(): void {
    this.colorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };
    this.applyColorFilters();
    this.notifyEffectsChanged();
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
        this.abIndicator.style.background = 'rgba(var(--accent-primary-rgb), 0.9)';
        this.abIndicator.style.color = 'white';
      } else {
        this.abIndicator.style.background = 'rgba(255, 180, 50, 0.9)';
        this.abIndicator.style.color = 'var(--bg-primary)';
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

  /**
   * Set the text labels shown on each side of the wipe split
   */
  setWipeLabels(labelA: string, labelB: string): void {
    if (this.wipeElements) {
      setWipeLabelsUtil(this.wipeElements, labelA, labelB);
    }
  }

  /**
   * Get wipe labels
   */
  getWipeLabels(): { labelA: string; labelB: string } {
    if (this.wipeElements) {
      return getWipeLabelsUtil(this.wipeElements);
    }
    return { labelA: DEFAULT_WIPE_LABEL_A, labelB: DEFAULT_WIPE_LABEL_B };
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
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getFilterSettings(): FilterSettings {
    return { ...this.filterSettings };
  }

  resetFilterSettings(): void {
    this.filterSettings = { ...DEFAULT_FILTER_SETTINGS };
    this.applyColorFilters();
    this.notifyEffectsChanged();
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
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getCDL(): CDLValues {
    return JSON.parse(JSON.stringify(this.cdlValues));
  }

  resetCDL(): void {
    this.cdlValues = JSON.parse(JSON.stringify(DEFAULT_CDL));
    this.notifyEffectsChanged();
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
    this.notifyEffectsChanged();
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
    this.notifyEffectsChanged();
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
      applyHighlightsShadows(imageData, {
        highlights: this.colorAdjustments.highlights,
        shadows: this.colorAdjustments.shadows,
        whites: this.colorAdjustments.whites,
        blacks: this.colorAdjustments.blacks,
      });
    }

    // Apply vibrance (intelligent saturation - before CDL/curves for natural results)
    if (hasVibrance) {
      applyVibrance(imageData, {
        vibrance: this.colorAdjustments.vibrance,
        skinProtection: this.colorAdjustments.vibranceSkinProtection,
      });
    }

    // Apply clarity (local contrast enhancement in midtones)
    if (hasClarity) {
      applyClarity(imageData, this.colorAdjustments.clarity);
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
      this.applySharpenToImageData(imageData);
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
   * Apply sharpen filter to ImageData in-place.
   * Uses GPU acceleration when available, falls back to CPU.
   */
  private applySharpenToImageData(imageData: ImageData): void {
    const amount = this.filterSettings.sharpen;

    // Try GPU sharpen first (much faster for large images)
    if (this.sharpenProcessor && this.sharpenProcessor.isReady()) {
      this.sharpenProcessor.applyInPlace(imageData, amount);
      return;
    }

    // CPU fallback: 3x3 unsharp mask kernel convolution
    applySharpenCPU(imageData, amount / 100);
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
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getChannelMode(): ChannelMode {
    return this.channelMode;
  }

  resetChannelMode(): void {
    this.channelMode = 'rgb';
    this.notifyEffectsChanged();
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
    return renderSourceToImageDataUtil(this.session, sourceIndex, width, height);
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
    // Show full editing overlay when panel is open or dragging, subtle indicator otherwise
    const isEditing = this.isCropPanelOpen || this.isDraggingCrop;
    renderCropOverlayUtil(this.cropCtx, this.cropState, this.displayWidth, this.displayHeight, isEditing);
  }

  /**
   * Clear pixels outside the crop region to implement pixel-level clipping.
   * This approach is used instead of ctx.clip() because putImageData() ignores clip regions.
   */
  private clearOutsideCropRegion(displayWidth: number, displayHeight: number): void {
    const { x, y, width, height } = this.cropState.region;
    // Use floor for positions and ceil for the far edge to avoid 1px gaps
    const cropX = Math.floor(x * displayWidth);
    const cropY = Math.floor(y * displayHeight);
    const cropRight = Math.ceil((x + width) * displayWidth);
    const cropBottom = Math.ceil((y + height) * displayHeight);
    const cropH = cropBottom - cropY;

    // Clear the four regions outside the crop area
    // Top
    if (cropY > 0) {
      this.imageCtx.clearRect(0, 0, displayWidth, cropY);
    }
    // Bottom
    if (cropBottom < displayHeight) {
      this.imageCtx.clearRect(0, cropBottom, displayWidth, displayHeight - cropBottom);
    }
    // Left
    if (cropX > 0) {
      this.imageCtx.clearRect(0, cropY, cropX, cropH);
    }
    // Right
    if (cropRight < displayWidth) {
      this.imageCtx.clearRect(cropRight, cropY, displayWidth - cropRight, cropH);
    }
  }

  /**
   * Set whether the crop panel is currently open (for overlay rendering).
   */
  setCropPanelOpen(isOpen: boolean): void {
    this.isCropPanelOpen = isOpen;
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

  private updateWipeLine(): void {
    if (!this.wipeElements) return;

    const containerRect = this.container.getBoundingClientRect();
    const canvasRect = this.canvasContainer.getBoundingClientRect();

    updateWipeLinePosition(
      this.wipeState,
      this.wipeElements,
      containerRect,
      canvasRect,
      this.displayWidth,
      this.displayHeight
    );
  }

  private handleWipePointerDown(e: PointerEvent): boolean {
    if (this.wipeState.mode === 'off' || !this.wipeElements) return false;

    const wipeRect = this.wipeElements.wipeLine.getBoundingClientRect();
    if (isPointerOnWipeLine(e, this.wipeState, wipeRect)) {
      this.isDraggingWipe = true;
      return true;
    }

    return false;
  }

  private handleWipePointerMove(e: PointerEvent): void {
    if (!this.isDraggingWipe) return;

    const canvasRect = this.canvasContainer.getBoundingClientRect();
    this.wipeState.position = calculateWipePosition(
      e,
      this.wipeState,
      canvasRect,
      this.displayWidth,
      this.displayHeight
    );

    this.updateWipeLine();
    this.scheduleRender();
  }

  private handleWipePointerUp(): void {
    this.isDraggingWipe = false;
  }

  // Crop dragging methods
  private getCropHandleAtPoint(clientX: number, clientY: number): typeof this.cropDragHandle {
    if (!this.cropState.enabled || !this.cropOverlay || !this.isCropPanelOpen) return null;

    const rect = this.cropOverlay.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const region = this.cropState.region;
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

  private handleCropPointerDown(e: PointerEvent): boolean {
    // Only intercept events when the crop panel is open (editing mode).
    // When closed, let other tools (pan, zoom, paint, wipe) handle the event.
    if (!this.cropState.enabled || !this.cropOverlay || !this.isCropPanelOpen) return false;

    const handle = this.getCropHandleAtPoint(e.clientX, e.clientY);
    if (!handle) return false;

    this.isDraggingCrop = true;
    this.cropDragHandle = handle;
    this.cropDragPointerId = e.pointerId;

    // Capture pointer so drag continues even if cursor leaves the container
    this.container.setPointerCapture(e.pointerId);

    const rect = this.cropOverlay.getBoundingClientRect();
    this.cropDragStart = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      region: { ...this.cropState.region },
    };

    // Set appropriate cursor
    this.updateCropCursor(handle);

    return true;
  }

  private handleCropPointerMove(e: PointerEvent): void {
    if (!this.isDraggingCrop || !this.cropDragStart || !this.cropDragHandle || !this.cropOverlay) return;

    const rect = this.cropOverlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const dx = x - this.cropDragStart.x;
    const dy = y - this.cropDragStart.y;
    const startRegion = this.cropDragStart.region;

    let newRegion: CropRegion = { ...startRegion };

    switch (this.cropDragHandle) {
      case 'move':
        newRegion.x = Math.max(0, Math.min(1 - startRegion.width, startRegion.x + dx));
        newRegion.y = Math.max(0, Math.min(1 - startRegion.height, startRegion.y + dy));
        break;
      case 'tl':
        newRegion.x = Math.max(0, Math.min(startRegion.x + startRegion.width - MIN_CROP_FRACTION, startRegion.x + dx));
        newRegion.y = Math.max(0, Math.min(startRegion.y + startRegion.height - MIN_CROP_FRACTION, startRegion.y + dy));
        newRegion.width = startRegion.x + startRegion.width - newRegion.x;
        newRegion.height = startRegion.y + startRegion.height - newRegion.y;
        break;
      case 'tr':
        newRegion.width = Math.max(MIN_CROP_FRACTION, Math.min(1 - startRegion.x, startRegion.width + dx));
        newRegion.y = Math.max(0, Math.min(startRegion.y + startRegion.height - MIN_CROP_FRACTION, startRegion.y + dy));
        newRegion.height = startRegion.y + startRegion.height - newRegion.y;
        break;
      case 'bl':
        newRegion.x = Math.max(0, Math.min(startRegion.x + startRegion.width - MIN_CROP_FRACTION, startRegion.x + dx));
        newRegion.width = startRegion.x + startRegion.width - newRegion.x;
        newRegion.height = Math.max(MIN_CROP_FRACTION, Math.min(1 - startRegion.y, startRegion.height + dy));
        break;
      case 'br':
        newRegion.width = Math.max(MIN_CROP_FRACTION, Math.min(1 - startRegion.x, startRegion.width + dx));
        newRegion.height = Math.max(MIN_CROP_FRACTION, Math.min(1 - startRegion.y, startRegion.height + dy));
        break;
      case 'top':
        newRegion.y = Math.max(0, Math.min(startRegion.y + startRegion.height - MIN_CROP_FRACTION, startRegion.y + dy));
        newRegion.height = startRegion.y + startRegion.height - newRegion.y;
        break;
      case 'bottom':
        newRegion.height = Math.max(MIN_CROP_FRACTION, Math.min(1 - startRegion.y, startRegion.height + dy));
        break;
      case 'left':
        newRegion.x = Math.max(0, Math.min(startRegion.x + startRegion.width - MIN_CROP_FRACTION, startRegion.x + dx));
        newRegion.width = startRegion.x + startRegion.width - newRegion.x;
        break;
      case 'right':
        newRegion.width = Math.max(MIN_CROP_FRACTION, Math.min(1 - startRegion.x, startRegion.width + dx));
        break;
    }

    // Apply aspect ratio constraint if set
    if (this.cropState.aspectRatio && this.cropDragHandle !== 'move') {
      newRegion = this.constrainToAspectRatio(newRegion, this.cropDragHandle);
    }

    // Enforce minimum crop size to prevent zero-area regions
    newRegion.width = Math.max(MIN_CROP_FRACTION, newRegion.width);
    newRegion.height = Math.max(MIN_CROP_FRACTION, newRegion.height);

    this.cropState.region = newRegion;
    this.scheduleRender();
  }

  private constrainToAspectRatio(region: CropRegion, handle: typeof this.cropDragHandle): CropRegion {
    // Look up target pixel ratio from the shared ASPECT_RATIOS constant
    const arEntry = ASPECT_RATIOS.find(a => a.value === this.cropState.aspectRatio);
    if (!arEntry?.ratio) return region;

    // Account for source aspect ratio: normalized coords don't map 1:1 to pixels
    const source = this.session.currentSource;
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
    result.x = Math.max(0, Math.min(result.x, 1 - result.width));
    result.y = Math.max(0, Math.min(result.y, 1 - result.height));

    return result;
  }

  private handleCropPointerUp(): void {
    if (this.isDraggingCrop && this.cropRegionChangedCallback) {
      this.cropRegionChangedCallback({ ...this.cropState.region });
    }
    // Release pointer capture
    if (this.cropDragPointerId !== null) {
      try { this.container.releasePointerCapture(this.cropDragPointerId); } catch (e) { if (typeof console !== 'undefined') console.debug('Pointer capture already released', e); }
      this.cropDragPointerId = null;
    }
    this.isDraggingCrop = false;
    this.cropDragHandle = null;
    this.cropDragStart = null;
    this.container.style.cursor = 'grab';
  }

  private updateCropCursor(handle: typeof this.cropDragHandle): void {
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
    this.container.style.cursor = handle ? (cursors[handle] || 'default') : 'default';
  }

  private applyColorFilters(): void {
    const filterString = buildContainerFilterString(this.colorAdjustments, this.filterSettings.blur);
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

  createExportCanvas(includeAnnotations: boolean): HTMLCanvasElement | null {
    const cropRegion = this.cropState.enabled ? this.cropState.region : undefined;
    return createExportCanvasUtil(
      this.session,
      this.paintEngine,
      this.paintRenderer,
      this.getCanvasFilterString(),
      includeAnnotations,
      this.transform,
      cropRegion
    );
  }

  /**
   * Render a specific frame to a canvas (for sequence export)
   * Seeks to the frame, renders, and returns the canvas
   */
  async renderFrameToCanvas(frame: number, includeAnnotations: boolean): Promise<HTMLCanvasElement | null> {
    const cropRegion = this.cropState.enabled ? this.cropState.region : undefined;
    return renderFrameToCanvasUtil(
      this.session,
      this.paintEngine,
      this.paintRenderer,
      frame,
      this.transform,
      this.getCanvasFilterString(),
      includeAnnotations,
      cropRegion
    );
  }

  /**
   * Initialize the prerender buffer for smooth playback with effects.
   * Should be called when the session has a valid source loaded.
   */
  initPrerenderBuffer(): void {
    // Clear any pending effects debounce timer to avoid stale updates
    if (this.effectsChangeDebounceTimer !== null) {
      clearTimeout(this.effectsChangeDebounceTimer);
      this.effectsChangeDebounceTimer = null;
    }

    if (this.prerenderBuffer) {
      this.prerenderBuffer.dispose();
    }

    const totalFrames = this.session.frameCount;
    if (totalFrames <= 0) {
      this.prerenderBuffer = null;
      return;
    }

    // Create frame loader using extracted utility
    const frameLoader = createFrameLoader(this.session);

    this.prerenderBuffer = new PrerenderBufferManager(totalFrames, frameLoader);
    // Apply stored callback if any
    if (this.prerenderCacheUpdateCallback) {
      this.prerenderBuffer.setOnCacheUpdate(this.prerenderCacheUpdateCallback);
    }
    this.notifyEffectsChanged();
  }

  /**
   * Notify the prerender buffer that effects have changed.
   * Uses debouncing to avoid excessive cache invalidations during rapid changes.
   */
  private notifyEffectsChanged(): void {
    if (!this.prerenderBuffer) return;

    // Clear any pending debounce timer
    if (this.effectsChangeDebounceTimer !== null) {
      clearTimeout(this.effectsChangeDebounceTimer);
    }

    // Debounce the effect update to avoid excessive invalidations during rapid slider changes
    this.effectsChangeDebounceTimer = setTimeout(() => {
      this.effectsChangeDebounceTimer = null;
      this.doUpdateEffects();
    }, EFFECTS_DEBOUNCE_MS);
  }

  /**
   * Actually perform the effects update (called after debounce)
   */
  private doUpdateEffects(): void {
    if (!this.prerenderBuffer) return;

    const effectsState = buildEffectsState(
      this.colorAdjustments,
      this.cdlValues,
      this.curvesData,
      this.filterSettings,
      this.channelMode,
      this.colorWheels,
      this.hslQualifier
    );

    this.prerenderBuffer.updateEffects(effectsState);
  }

  /**
   * Update prerender buffer playback state.
   * Should be called when playback starts/stops.
   */
  updatePrerenderPlaybackState(isPlaying: boolean, direction: number = 1): void {
    if (this.prerenderBuffer) {
      this.prerenderBuffer.setPlaybackState(isPlaying, direction);
      if (isPlaying) {
        // Start preloading around current frame
        this.prerenderBuffer.preloadAround(this.session.currentFrame);
      }
    }
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

    // Cleanup theme change listener
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
      this.boundOnThemeChange = null;
    }

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

    // Cleanup effects debounce timer
    if (this.effectsChangeDebounceTimer !== null) {
      clearTimeout(this.effectsChangeDebounceTimer);
      this.effectsChangeDebounceTimer = null;
    }

    // Cleanup prerender buffer
    if (this.prerenderBuffer) {
      this.prerenderBuffer.dispose();
      this.prerenderBuffer = null;
    }

    // Cleanup overlays
    this.clippingOverlay.dispose();
    this.falseColor.dispose();
    this.zebraStripes.dispose();
    this.spotlightOverlay.dispose();
    this.hslQualifier.dispose();

    // Cleanup crop drag state
    if (this.isDraggingCrop && this.cropDragPointerId !== null) {
      try { this.container.releasePointerCapture(this.cropDragPointerId); } catch (e) { if (typeof console !== 'undefined') console.debug('Pointer capture already released', e); }
    }
    this.isDraggingCrop = false;
    this.cropDragHandle = null;
    this.cropDragStart = null;
    this.cropDragPointerId = null;
    this.cropRegionChangedCallback = null;

    // Cleanup wipe elements
    this.wipeElements = null;
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
   * Get prerender buffer statistics for UI display
   * Returns null if prerender buffer is not active
   */
  getPrerenderStats(): PrerenderStats | null {
    const source = this.session.currentSource;
    return getPrerenderStatsUtil(
      this.prerenderBuffer,
      this.session.frameCount,
      source?.width ?? 0,
      source?.height ?? 0
    );
  }

  /**
   * Set callback to be called when prerender cache is updated
   * Used by CacheIndicator to refresh display in real-time
   */
  setOnPrerenderCacheUpdate(callback: (() => void) | null): void {
    this.prerenderCacheUpdateCallback = callback;
    this.prerenderBuffer?.setOnCacheUpdate(callback);
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
