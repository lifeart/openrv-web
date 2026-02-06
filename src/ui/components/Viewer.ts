import { Session } from '../../core/session/Session';
import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { StrokePoint, ShapeType, Point } from '../../paint/types';
import { ColorAdjustments, DEFAULT_COLOR_ADJUSTMENTS } from './ColorControls';
import { WipeState, WipeMode } from './WipeControl';
import { Transform2D, DEFAULT_TRANSFORM } from './TransformControl';
import { FilterSettings, DEFAULT_FILTER_SETTINGS } from './FilterControl';
import { CropState, CropRegion, DEFAULT_CROP_STATE, DEFAULT_CROP_REGION, ASPECT_RATIOS, MIN_CROP_FRACTION, UncropState, DEFAULT_UNCROP_STATE } from './CropControl';
import { LUT3D } from '../../color/LUTLoader';
import { WebGLLUTProcessor } from '../../color/WebGLLUT';
import { LUTPipeline } from '../../color/pipeline/LUTPipeline';
import { GPULUTChain } from '../../color/pipeline/GPULUTChain';
import { CDLValues, DEFAULT_CDL, isDefaultCDL, applyCDLToImageData } from '../../color/CDL';
import { ColorCurvesData, createDefaultCurvesData, isDefaultCurves, CurveLUTCache, buildAllCurveLUTs } from '../../color/ColorCurves';
import { LensDistortionParams, DEFAULT_LENS_PARAMS, isDefaultLensParams, applyLensDistortion } from '../../transform/LensDistortion';
import { ExportFormat, exportCanvas as doExportCanvas, copyCanvasToClipboard } from '../../utils/FrameExporter';
import { filterImageFiles, getBestSequence } from '../../utils/SequenceLoader';
import { StackLayer } from './StackControl';
import { compositeImageData, BlendMode } from '../../composite/BlendModes';
import { showAlert } from './shared/Modal';
import { getIconSvg } from './shared/Icons';
import { ChannelMode, applyChannelIsolation } from './ChannelSelect';
import { applyColorInversion } from '../../color/Inversion';
import { StereoState, DEFAULT_STEREO_STATE, isDefaultStereoState, applyStereoMode, applyStereoModeWithEyeTransforms, StereoEyeTransformState, StereoAlignMode, DEFAULT_STEREO_EYE_TRANSFORM_STATE, DEFAULT_STEREO_ALIGN_MODE, isDefaultStereoEyeTransformState } from '../../stereo/StereoRenderer';
import { DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE, applyDifferenceMatte } from './DifferenceMatteControl';
import { WebGLSharpenProcessor } from '../../filters/WebGLSharpen';
import { SafeAreasOverlay } from './SafeAreasOverlay';
import { MatteOverlay } from './MatteOverlay';
import { PixelProbe } from './PixelProbe';
import { FalseColor } from './FalseColor';
import { LuminanceVisualization } from './LuminanceVisualization';
import { TimecodeOverlay } from './TimecodeOverlay';
import { ZebraStripes } from './ZebraStripes';
import { ColorWheels } from './ColorWheels';
import { SpotlightOverlay } from './SpotlightOverlay';
import { ClippingOverlay } from './ClippingOverlay';
import { HSLQualifier } from './HSLQualifier';
import { PrerenderBufferManager } from '../../utils/PrerenderBufferManager';
import { getThemeManager } from '../../utils/ThemeManager';
import { setupHiDPICanvas, resetCanvasFromHiDPI } from '../../utils/HiDPICanvas';
import { getSharedOCIOProcessor } from '../../color/OCIOProcessor';
import { DisplayColorState, DEFAULT_DISPLAY_COLOR_STATE, DISPLAY_TRANSFER_CODES, applyDisplayColorManagementToImageData, isDisplayStateActive } from '../../color/DisplayTransfer';
import type { DisplayCapabilities } from '../../color/DisplayCapabilities';
import { safeCanvasContext2D } from '../../color/SafeCanvasContext';
import { Renderer } from '../../render/Renderer';
import { RenderWorkerProxy } from '../../render/RenderWorkerProxy';
import type { IPImage } from '../../core/image/Image';

// Extracted effect processing utilities
import { applyHighlightsShadows, applyVibrance, applyClarity, applySharpenCPU, applyToneMapping } from './ViewerEffects';
import { applyHueRotation as applyHueRotationPixel, isIdentityHueRotation } from '../../color/HueRotation';
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
  SplitScreenState,
  SplitScreenUIElements,
  createSplitScreenUIElements,
  updateSplitScreenPosition,
  isPointerOnSplitLine,
  calculateSplitPosition,
  isSplitScreenMode,
} from './ViewerSplitScreen';
import { GhostFrameState, DEFAULT_GHOST_FRAME_STATE } from './GhostFrameControl';
import { ToneMappingState, DEFAULT_TONE_MAPPING_STATE } from './ToneMappingControl';
import { PARState, DEFAULT_PAR_STATE, isPARActive, calculatePARCorrectedWidth } from '../../utils/PixelAspectRatio';
import { BackgroundPatternState, DEFAULT_BACKGROUND_PATTERN_STATE, drawBackgroundPattern, PATTERN_COLORS } from './BackgroundPatternControl';
import { FrameInterpolator } from '../../utils/FrameInterpolator';
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
  interpolateZoom,
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

  // Smooth zoom animation state
  private zoomAnimationId: number | null = null;
  private zoomAnimationStartTime = 0;
  private zoomAnimationStartZoom = 1;
  private zoomAnimationTargetZoom = 1;
  private zoomAnimationDuration = 0;
  private zoomAnimationStartPanX = 0;
  private zoomAnimationStartPanY = 0;
  private zoomAnimationTargetPanX = 0;
  private zoomAnimationTargetPanY = 0;

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

  // Cached layout measurements - invalidated by ResizeObserver and at each render frame
  private cachedContainerRect: DOMRect | null = null;
  private cachedCanvasContainerRect: DOMRect | null = null;
  private cachedImageCanvasRect: DOMRect | null = null;

  // Animation frame for smooth rendering
  private pendingRender = false;

  // Pending video frame fetch tracking
  private pendingVideoFrameFetch: Promise<void> | null = null;
  private pendingVideoFrameNumber: number = 0; // Which frame is being fetched

  // Pending source B video frame fetch tracking (for split screen)
  private pendingSourceBFrameFetch: Promise<void> | null = null;
  private pendingSourceBFrameNumber: number = 0;
  private hasDisplayedSourceBMediabunnyFrame = false;
  // Cache the last successfully rendered source B frame canvas to prevent flickering
  // when the next frame is being fetched asynchronously
  private lastSourceBFrameCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

  // Track if we've ever displayed a mediabunny frame (for fallback logic)
  private hasDisplayedMediabunnyFrame = false;

  // Color adjustments
  private colorAdjustments: ColorAdjustments = { ...DEFAULT_COLOR_ADJUSTMENTS };

  // Color inversion state
  private colorInversionEnabled = false;

  // Wipe comparison
  private wipeState: WipeState = { mode: 'off', position: 0.5, showOriginal: 'left' };
  private wipeElements: WipeUIElements | null = null;
  private isDraggingWipe = false;

  // Split screen comparison (shows A/B sources side-by-side)
  // Note: Split screen state is managed via wipeState.mode for unified handling
  private splitScreenElements: SplitScreenUIElements | null = null;
  private isDraggingSplit = false;

  // LUT
  private currentLUT: LUT3D | null = null;
  private lutIntensity = 1.0;
  private lutIndicator: HTMLElement | null = null;
  private lutProcessor: WebGLLUTProcessor | null = null;

  // Multi-point LUT pipeline
  private lutPipeline: LUTPipeline = new LUTPipeline();
  private gpuLUTChain: GPULUTChain | null = null;

  // OCIO GPU-accelerated color management
  private ocioLUTProcessor: WebGLLUTProcessor | null = null;
  private ocioEnabled = false;
  private ocioBakedLUT: LUT3D | null = null;

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
  private uncropState: UncropState = { ...DEFAULT_UNCROP_STATE };
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

  // Luminance visualization modes (HSV, random color, contour, delegates false-color)
  private luminanceVisualization: LuminanceVisualization;

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

  // Per-eye transform state
  private stereoEyeTransformState: StereoEyeTransformState = { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE, left: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.left }, right: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.right } };

  // Stereo alignment overlay mode
  private stereoAlignMode: StereoAlignMode = DEFAULT_STEREO_ALIGN_MODE;

  // Difference matte state
  private differenceMatteState: DifferenceMatteState = { ...DEFAULT_DIFFERENCE_MATTE_STATE };

  // Ghost frame (onion skin) state
  private ghostFrameState: GhostFrameState = { ...DEFAULT_GHOST_FRAME_STATE };

  // Ghost frame canvas pool - reuse canvases instead of creating new ones each frame
  private ghostFrameCanvasPool: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];
  private ghostFramePoolWidth = 0;
  private ghostFramePoolHeight = 0;

  // Tone mapping state
  private toneMappingState: ToneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };

  // Pixel Aspect Ratio state
  private parState: PARState = { ...DEFAULT_PAR_STATE };

  // Background pattern state (for alpha visualization)
  private backgroundPatternState: BackgroundPatternState = { ...DEFAULT_BACKGROUND_PATTERN_STATE };

  // Display color management state (final pipeline stage)
  private displayColorState: DisplayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE };

  // Sub-frame interpolator for slow-motion blending
  private frameInterpolator = new FrameInterpolator();

  // Temp canvas for compositing ImageData over background patterns
  // (putImageData ignores compositing, so we draw to a temp canvas first, then drawImage)
  private bgCompositeTempCanvas: HTMLCanvasElement | null = null;
  private bgCompositeTempCtx: CanvasRenderingContext2D | null = null;

  // Prerender buffer for smooth playback with effects
  private prerenderBuffer: PrerenderBufferManager | null = null;
  private prerenderCacheUpdateCallback: (() => void) | null = null;
  private effectsChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Filter string cache for performance
  private filterStringCache: FilterStringCache = { filterString: null, cachedAdjustments: null };

  // Cursor color callback for InfoPanel
  private cursorColorCallback: ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void) | null = null;

  // Shared throttle timestamp for merged mousemove handler (probe + cursor color)
  private lastMouseMoveUpdate = 0;

  // Cached source image canvas for pixel probe "source" mode
  // Reused to avoid creating new canvases on every mouse move
  private sourceImageCanvas: HTMLCanvasElement | null = null;
  private sourceImageCtx: CanvasRenderingContext2D | null = null;

  // Theme change listener for runtime theme updates
  private boundOnThemeChange: (() => void) | null = null;

  // Display capabilities for wide color gamut / HDR support
  private capabilities: DisplayCapabilities | undefined;
  private canvasColorSpace: 'display-p3' | undefined;

  // WebGL HDR rendering
  private glCanvas: HTMLCanvasElement | null = null;
  private glRenderer: Renderer | null = null;
  private hdrRenderActive = false;

  // WebGL SDR rendering (Phase 1A: GPU shader pipeline for SDR sources)
  private sdrWebGLRenderActive = false;

  // Phase 4: OffscreenCanvas worker proxy
  private renderWorkerProxy: RenderWorkerProxy | null = null;
  private isAsyncRenderer = false;

  constructor(session: Session, paintEngine: PaintEngine, capabilities?: DisplayCapabilities) {
    this.capabilities = capabilities;
    this.canvasColorSpace = this.capabilities?.canvasP3 ? 'display-p3' : undefined;
    this.session = session;
    this.paintEngine = paintEngine;
    this.paintRenderer = new PaintRenderer(this.canvasColorSpace);

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

    // Create WebGL canvas for HDR rendering (between image canvas and paint canvas)
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.style.cssText = 'position:absolute;top:0;left:0;display:none;';
    this.canvasContainer.appendChild(this.glCanvas);

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
    this.cropCtx = safeCanvasContext2D(this.cropOverlay, {}, this.canvasColorSpace);

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

    // Create luminance visualization (manages HSV, random color, contour, and delegates false-color)
    this.luminanceVisualization = new LuminanceVisualization(this.falseColor);
    this.luminanceVisualization.on('stateChanged', () => {
      this.refresh();
    });

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
    // Use P3 color space when available for wider gamut output
    const imageCtx = safeCanvasContext2D(this.imageCanvas, { alpha: false, willReadFrequently: true }, this.canvasColorSpace);
    this.imageCtx = imageCtx;

    const paintCtx = safeCanvasContext2D(this.paintCanvas, {}, this.canvasColorSpace);
    this.paintCtx = paintCtx;

    // Create wipe UI elements (line and labels)
    this.wipeElements = createWipeUIElements(this.container);

    // Create split screen UI elements (divider line and A/B labels)
    this.splitScreenElements = createSplitScreenUIElements(this.container);

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
      this.invalidateLayoutCache();
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

    // Initialize multi-point LUT pipeline GPU chain
    try {
      const chainCanvas = document.createElement('canvas');
      const chainGl = chainCanvas.getContext('webgl2', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
      if (chainGl) {
        this.gpuLUTChain = new GPULUTChain(chainGl);
      }
    } catch (e) {
      console.warn('GPU LUT chain not available:', e);
      this.gpuLUTChain = null;
    }

    // Register default source for LUT pipeline
    this.lutPipeline.registerSource('default');
    this.lutPipeline.setActiveSource('default');

    // Initialize dedicated OCIO WebGL LUT processor for GPU-accelerated color management
    try {
      this.ocioLUTProcessor = new WebGLLUTProcessor();
    } catch (e) {
      console.warn('WebGL OCIO LUT processor not available, OCIO will use CPU fallback:', e);
      this.ocioLUTProcessor = null;
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

    // Resize WebGL canvas if HDR or SDR WebGL mode is active
    if (this.glCanvas && (this.hdrRenderActive || this.sdrWebGLRenderActive) && this.glRenderer) {
      this.glRenderer.resize(width, height);
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
      // Also reset source B tracking for split screen
      this.hasDisplayedSourceBMediabunnyFrame = false;
      this.pendingSourceBFrameFetch = null;
      this.pendingSourceBFrameNumber = 0;
      this.lastSourceBFrameCanvas = null;
      this.scheduleRender();
    });
    this.session.on('frameChanged', () => {
      // Phase 2B: Proactively preload for the NEXT frame before it is rendered,
      // giving the worker pool a head start on processing upcoming frames
      if (this.session.isPlaying && this.prerenderBuffer) {
        const direction = this.session.playDirection || 1;
        const nextFrame = this.session.currentFrame + direction;
        this.prerenderBuffer.preloadAround(nextFrame);
        // Auto-tune preload-ahead window based on frame processing times and FPS
        const fps = this.session.fps || 24;
        this.prerenderBuffer.updateDynamicPreloadAhead(fps);
      }

      // Phase 4: Pre-create ImageBitmap for double-buffer pattern.
      // This starts bitmap creation before the next RAF, avoiding blocking.
      if (this.isAsyncRenderer && this.renderWorkerProxy) {
        const source = this.session.currentSource;
        if (source?.element && !(source.fileSourceNode?.isHDR())) {
          this.renderWorkerProxy.prepareFrame(source.element as unknown as HTMLImageElement);
        }
      }

      this.scheduleRender();
    });

    // Paint events
    this.paintEngine.on('annotationsChanged', () => this.renderPaint());
    this.paintEngine.on('toolChanged', (tool) => this.updateCursor(tool));

    // Pixel probe + cursor color events - single handler for both consumers
    this.container.addEventListener('mousemove', this.onMouseMoveForPixelSampling);
    this.container.addEventListener('mouseleave', this.onMouseLeaveForCursorColor);
    this.container.addEventListener('click', this.onClickForProbe);
  }

  /**
   * Merged mousemove handler for both pixel probe and cursor color consumers.
   * Calls getBoundingClientRect() and getImageData() at most once per event,
   * then dispatches results to both consumers as needed.
   * Throttled to ~60fps (16ms) for performance.
   */
  private onMouseMoveForPixelSampling = (e: MouseEvent): void => {
    const probeEnabled = this.pixelProbe.isEnabled();
    const cursorColorEnabled = !!this.cursorColorCallback;

    // Early exit if neither consumer is active
    if (!probeEnabled && !cursorColorEnabled) return;

    // Single throttle for both consumers
    const now = Date.now();
    if (now - this.lastMouseMoveUpdate < 16) {
      return;
    }
    this.lastMouseMoveUpdate = now;

    // Single layout read shared by both consumers (cached per frame)
    const canvasRect = this.getImageCanvasRect();

    // Compute canvas-relative pixel coordinates once
    const position = getPixelCoordinates(
      e.clientX,
      e.clientY,
      canvasRect,
      this.displayWidth,
      this.displayHeight
    );

    // Handle out-of-bounds
    if (!position) {
      if (cursorColorEnabled) {
        this.cursorColorCallback!(null, null);
      }
      return;
    }

    // HDR/SDR WebGL path: use WebGL readPixelFloat for accurate values
    if ((this.hdrRenderActive || this.sdrWebGLRenderActive) && this.glRenderer) {
      const sampleSize = this.pixelProbe.getSampleSize();
      const halfSize = Math.floor(sampleSize / 2);
      const rx = Math.max(0, Math.floor(position.x) - halfSize);
      const ry = Math.max(0, Math.floor(position.y) - halfSize);
      const rw = Math.min(sampleSize, this.displayWidth - rx);
      const rh = Math.min(sampleSize, this.displayHeight - ry);

      // Phase 4: Use async readback when worker renderer is active
      if (this.isAsyncRenderer && this.renderWorkerProxy) {
        this.renderWorkerProxy.readPixelFloatAsync(rx, ry, rw, rh).then((pixels) => {
          this.handlePixelProbeData(pixels, position, rw, rh, probeEnabled, cursorColorEnabled, e);
        }).catch(() => {
          // Readback failed — ignore silently
        });
        if (probeEnabled) {
          this.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
        }
        return;
      }

      const pixels = this.glRenderer.readPixelFloat(rx, ry, rw, rh);

      if (probeEnabled) {
        if (pixels && pixels.length >= 4) {
          // Average all pixels in the sample area
          const count = rw * rh;
          let tr = 0, tg = 0, tb = 0, ta = 0;
          for (let i = 0; i < count; i++) {
            tr += pixels[i * 4]!;
            tg += pixels[i * 4 + 1]!;
            tb += pixels[i * 4 + 2]!;
            ta += pixels[i * 4 + 3]!;
          }
          this.pixelProbe.updateFromHDRValues(
            position.x, position.y,
            tr / count, tg / count, tb / count, ta / count,
            this.displayWidth, this.displayHeight
          );
        }
        this.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
      }

      if (cursorColorEnabled) {
        if (pixels && pixels.length >= 4) {
          // Use center pixel for cursor color
          const centerIdx = (Math.floor(rh / 2) * rw + Math.floor(rw / 2)) * 4;
          const color = {
            r: Math.round(Math.max(0, Math.min(255, pixels[centerIdx]! * 255))),
            g: Math.round(Math.max(0, Math.min(255, pixels[centerIdx + 1]! * 255))),
            b: Math.round(Math.max(0, Math.min(255, pixels[centerIdx + 2]! * 255))),
          };
          this.cursorColorCallback!(color, position);
        } else {
          this.cursorColorCallback!(null, null);
        }
      }
      return;
    }

    // SDR path: read from 2D canvas
    const imageData = this.getImageData();

    // Dispatch to probe consumer
    if (probeEnabled && imageData) {
      // Get source image data (before color pipeline) for source mode
      // Only fetch if source mode is selected to save performance
      if (this.pixelProbe.getSourceMode() === 'source') {
        const sourceImageData = this.getSourceImageData();
        this.pixelProbe.setSourceImageData(sourceImageData);
      } else {
        this.pixelProbe.setSourceImageData(null);
      }

      this.pixelProbe.updateFromCanvas(
        position.x, position.y, imageData,
        this.displayWidth, this.displayHeight
      );
      this.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
    }

    // Dispatch to cursor color consumer
    if (cursorColorEnabled) {
      if (!imageData) {
        this.cursorColorCallback!(null, null);
        return;
      }
      const color = getPixelColor(imageData, position.x, position.y);
      if (!color) {
        this.cursorColorCallback!(null, null);
      } else {
        this.cursorColorCallback!(color, position);
      }
    }
  };

  /**
   * Handle mouse leave - clear cursor color
   */
  private onMouseLeaveForCursorColor = (): void => {
    if (this.cursorColorCallback) {
      this.cursorColorCallback(null, null);
    }
  };

  /**
   * Process pixel probe data from either sync or async readback.
   * Used by both the sync and async (worker) paths.
   */
  private handlePixelProbeData(
    pixels: Float32Array | null,
    position: { x: number; y: number },
    rw: number,
    rh: number,
    probeEnabled: boolean,
    cursorColorEnabled: boolean,
    e: MouseEvent,
  ): void {
    if (probeEnabled) {
      if (pixels && pixels.length >= 4) {
        const count = rw * rh;
        let tr = 0, tg = 0, tb = 0, ta = 0;
        for (let i = 0; i < count; i++) {
          tr += pixels[i * 4]!;
          tg += pixels[i * 4 + 1]!;
          tb += pixels[i * 4 + 2]!;
          ta += pixels[i * 4 + 3]!;
        }
        this.pixelProbe.updateFromHDRValues(
          position.x, position.y,
          tr / count, tg / count, tb / count, ta / count,
          this.displayWidth, this.displayHeight
        );
      }
      this.pixelProbe.setOverlayPosition(e.clientX, e.clientY);
    }

    if (cursorColorEnabled) {
      if (pixels && pixels.length >= 4) {
        const centerIdx = (Math.floor(rh / 2) * rw + Math.floor(rw / 2)) * 4;
        const color = {
          r: Math.round(Math.max(0, Math.min(255, pixels[centerIdx]! * 255))),
          g: Math.round(Math.max(0, Math.min(255, pixels[centerIdx + 1]! * 255))),
          b: Math.round(Math.max(0, Math.min(255, pixels[centerIdx + 2]! * 255))),
        };
        this.cursorColorCallback!(color, position);
      } else {
        this.cursorColorCallback!(null, null);
      }
    }
  }

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
      this.wipeElements?.wipeLine ?? null,
      this.splitScreenElements?.splitLine ?? null
    );
  }

  private getCanvasPoint(clientX: number, clientY: number, pressure = 0.5): StrokePoint | null {
    const rect = this.getImageCanvasRect();
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
    // Handle wipe/split dragging
    if (this.isDraggingWipe || this.isDraggingSplit) {
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

    // Handle wipe/split dragging end
    if (this.isDraggingWipe || this.isDraggingSplit) {
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

    // Cancel any smooth zoom animation - pinch zoom should be instant
    this.cancelZoomAnimation();

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

    // Cancel any smooth zoom animation - wheel zoom should be instant for responsiveness
    this.cancelZoomAnimation();

    const rect = this.getContainerRect();
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
      // Use getBestSequence to handle mixed sequences - picks the longest one
      const bestSequence = getBestSequence(imageFiles);
      if (bestSequence && bestSequence.length > 1) {
        try {
          await this.session.loadSequence(bestSequence);
          return;
        } catch (err) {
          console.error('Failed to load sequence:', err);
          showAlert(`Failed to load sequence: ${err}`, { type: 'error', title: 'Load Error' });
          return;
        }
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
    this.cancelZoomAnimation();
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.scheduleRender();
  }

  /**
   * Fit to window with a smooth animated transition.
   */
  smoothFitToWindow(): void {
    this.smoothZoomTo(1, 200, 0, 0);
  }

  setZoom(level: number): void {
    this.cancelZoomAnimation();
    this.zoom = level;
    this.panX = 0;
    this.panY = 0;
    this.scheduleRender();
  }

  /**
   * Set zoom with a smooth animated transition.
   */
  smoothSetZoom(level: number): void {
    this.smoothZoomTo(level, 200, 0, 0);
  }

  /**
   * Animate zoom smoothly to a target level over a given duration.
   * Uses requestAnimationFrame with ease-out cubic interpolation.
   * Also animates pan position to the target values.
   * @param targetZoom - The target zoom level
   * @param duration - Animation duration in milliseconds (default 200)
   * @param targetPanX - Target pan X position (default: current panX)
   * @param targetPanY - Target pan Y position (default: current panY)
   */
  smoothZoomTo(
    targetZoom: number,
    duration: number = 200,
    targetPanX?: number,
    targetPanY?: number
  ): void {
    // Cancel any in-progress zoom animation
    this.cancelZoomAnimation();

    // If duration is 0 or negligible, apply instantly
    if (duration <= 0) {
      this.zoom = targetZoom;
      if (targetPanX !== undefined) this.panX = targetPanX;
      if (targetPanY !== undefined) this.panY = targetPanY;
      this.scheduleRender();
      return;
    }

    // If already at target, no animation needed
    const panXTarget = targetPanX !== undefined ? targetPanX : this.panX;
    const panYTarget = targetPanY !== undefined ? targetPanY : this.panY;
    if (
      Math.abs(this.zoom - targetZoom) < 0.001 &&
      Math.abs(this.panX - panXTarget) < 0.5 &&
      Math.abs(this.panY - panYTarget) < 0.5
    ) {
      this.zoom = targetZoom;
      this.panX = panXTarget;
      this.panY = panYTarget;
      this.scheduleRender();
      return;
    }

    this.zoomAnimationStartTime = performance.now();
    this.zoomAnimationStartZoom = this.zoom;
    this.zoomAnimationTargetZoom = targetZoom;
    this.zoomAnimationDuration = duration;
    this.zoomAnimationStartPanX = this.panX;
    this.zoomAnimationStartPanY = this.panY;
    this.zoomAnimationTargetPanX = panXTarget;
    this.zoomAnimationTargetPanY = panYTarget;

    const animate = (now: number): void => {
      const elapsed = now - this.zoomAnimationStartTime;
      const progress = Math.min(1, elapsed / this.zoomAnimationDuration);

      this.zoom = interpolateZoom(
        this.zoomAnimationStartZoom,
        this.zoomAnimationTargetZoom,
        progress
      );
      this.panX = interpolateZoom(
        this.zoomAnimationStartPanX,
        this.zoomAnimationTargetPanX,
        progress
      );
      this.panY = interpolateZoom(
        this.zoomAnimationStartPanY,
        this.zoomAnimationTargetPanY,
        progress
      );

      this.scheduleRender();

      if (progress < 1) {
        this.zoomAnimationId = requestAnimationFrame(animate);
      } else {
        // Ensure exact final values
        this.zoom = this.zoomAnimationTargetZoom;
        this.panX = this.zoomAnimationTargetPanX;
        this.panY = this.zoomAnimationTargetPanY;
        this.zoomAnimationId = null;
        this.scheduleRender();
      }
    };

    this.zoomAnimationId = requestAnimationFrame(animate);
  }

  /**
   * Cancel any in-progress smooth zoom animation.
   * The zoom remains at whatever intermediate value it reached.
   */
  cancelZoomAnimation(): void {
    if (this.zoomAnimationId !== null) {
      cancelAnimationFrame(this.zoomAnimationId);
      this.zoomAnimationId = null;
    }
  }

  /**
   * Check if a smooth zoom animation is currently in progress.
   */
  isZoomAnimating(): boolean {
    return this.zoomAnimationId !== null;
  }

  private updateCanvasPosition(): void {
    const containerRect = this.getContainerRect();
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

  private invalidateLayoutCache(): void {
    this.cachedContainerRect = null;
    this.cachedCanvasContainerRect = null;
    this.cachedImageCanvasRect = null;
  }

  private getContainerRect(): DOMRect {
    if (!this.cachedContainerRect) {
      this.cachedContainerRect = this.container.getBoundingClientRect();
    }
    return this.cachedContainerRect;
  }

  private getCanvasContainerRect(): DOMRect {
    if (!this.cachedCanvasContainerRect) {
      this.cachedCanvasContainerRect = this.canvasContainer.getBoundingClientRect();
    }
    return this.cachedCanvasContainerRect;
  }

  private getImageCanvasRect(): DOMRect {
    if (!this.cachedImageCanvasRect) {
      this.cachedImageCanvasRect = this.imageCanvas.getBoundingClientRect();
    }
    return this.cachedImageCanvasRect;
  }

  render(): void {
    // Invalidate layout cache once per frame - measurements are cached within the frame
    this.invalidateLayoutCache();
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

  private ensureGLRenderer(): Renderer | null {
    if (this.glRenderer) return this.glRenderer;
    if (!this.glCanvas) return null;

    // Phase 4: Try OffscreenCanvas worker first for main-thread isolation.
    // Only attempt once — if worker proxy already failed, skip directly to sync renderer.
    if (!this.renderWorkerProxy && !this.isAsyncRenderer) {
      try {
        if (typeof OffscreenCanvas !== 'undefined' &&
            'transferControlToOffscreen' in this.glCanvas &&
            typeof Worker !== 'undefined') {
          const proxy = new RenderWorkerProxy();
          proxy.initialize(this.glCanvas, this.capabilities);
          // initAsync runs in background — the proxy buffers messages until ready
          proxy.initAsync().then(() => {
            console.log(`[Viewer] Render worker initialized, HDR output: ${proxy.getHDROutputMode()}`);
          }).catch((err) => {
            console.warn('[Viewer] Render worker init failed, falling back to sync:', err);
            this.fallbackToSyncRenderer();
          });

          // Set up context loss/restore callbacks
          proxy.setOnContextLost(() => {
            console.warn('[Viewer] Worker WebGL context lost');
            if (this.hdrRenderActive) {
              this.deactivateHDRMode();
            }
            if (this.sdrWebGLRenderActive) {
              this.deactivateSDRWebGLMode();
            }
          });
          proxy.setOnContextRestored(() => {
            console.log('[Viewer] Worker WebGL context restored');
          });

          this.renderWorkerProxy = proxy;
          this.isAsyncRenderer = true;
          // glCanvas has been transferred — we cannot create a sync renderer on it anymore.
          // The proxy acts as the renderer for state setters.
          // For RendererBackend compatibility, create a facade Renderer that delegates.
          // For now, we use the proxy as a "renderer" by wrapping it.
          this.glRenderer = proxy as unknown as Renderer;
          return this.glRenderer;
        }
      } catch (e) {
        console.warn('[Viewer] OffscreenCanvas worker setup failed, using sync renderer:', e);
        // Fall through to sync renderer. Need a fresh canvas since transferControlToOffscreen
        // may have been called (irreversible). Recreate glCanvas.
        this.recreateGLCanvas();
      }
    }

    // Sync renderer fallback (tier 2)
    try {
      const renderer = new Renderer();
      // initialize() sets drawingBufferColorSpace to rec2100-hlg/pq immediately
      // after context creation (before shaders/buffers) when displayHDR is true.
      renderer.initialize(this.glCanvas, this.capabilities);
      const hdrMode = renderer.getHDROutputMode();
      console.log(`[Viewer] WebGL renderer initialized (sync), HDR output: ${hdrMode}`);
      this.glRenderer = renderer;
      return renderer;
    } catch (e) {
      console.warn('[Viewer] WebGL renderer init failed:', e);
      return null;
    }
  }

  /**
   * Fall back from async worker renderer to synchronous main-thread renderer.
   * Used when the worker fails to initialize or crashes.
   */
  private fallbackToSyncRenderer(): void {
    if (this.renderWorkerProxy) {
      this.renderWorkerProxy.dispose();
      this.renderWorkerProxy = null;
    }
    this.isAsyncRenderer = false;
    this.glRenderer = null;

    // Recreate glCanvas since the original was transferred
    this.recreateGLCanvas();
  }

  /**
   * Recreate the GL canvas element (needed after transferControlToOffscreen fails
   * or worker dies, since the transfer is irreversible).
   */
  private recreateGLCanvas(): void {
    if (this.glCanvas && this.glCanvas.parentNode) {
      const parent = this.glCanvas.parentNode;
      const nextSibling = this.glCanvas.nextSibling;
      parent.removeChild(this.glCanvas);
      this.glCanvas = document.createElement('canvas');
      this.glCanvas.style.cssText = 'position:absolute;top:0;left:0;display:none;';
      if (nextSibling) {
        parent.insertBefore(this.glCanvas, nextSibling);
      } else {
        parent.appendChild(this.glCanvas);
      }
    }
  }

  /**
   * Sync shared Viewer state (effects, LUT, background pattern, etc.) to the GL
   * renderer. Called by both renderHDRWithWebGL() and renderSDRWithWebGL() to
   * avoid duplicating the state transfer code.
   *
   * Basic color adjustments (exposure, gamma, saturation, contrast, brightness,
   * temperature, tint) and tone mapping are NOT synced here because HDR and SDR
   * paths override them differently. Extended adjustments (highlights/shadows,
   * vibrance, clarity, sharpen, HSL qualifier) ARE synced here since they use
   * the same values regardless of HDR/SDR mode.
   */
  private syncRendererState(renderer: Renderer): void {
    renderer.setColorInversion(this.colorInversionEnabled);

    // Background pattern
    renderer.setBackgroundPattern(this.backgroundPatternState);

    // 2D effects
    renderer.setCDL(this.cdlValues);
    renderer.setCurvesLUT(isDefaultCurves(this.curvesData) ? null : buildAllCurveLUTs(this.curvesData));
    renderer.setColorWheels(this.colorWheels.getState());
    renderer.setFalseColor(this.falseColor.isEnabled(), this.falseColor.getColorLUT());
    renderer.setZebraStripes(this.zebraStripes.getState());
    renderer.setChannelMode(this.channelMode);
    renderer.setDisplayColorState({
      transferFunction: DISPLAY_TRANSFER_CODES[this.displayColorState.transferFunction],
      displayGamma: this.displayColorState.displayGamma,
      displayBrightness: this.displayColorState.displayBrightness,
      customGamma: this.displayColorState.customGamma,
    });

    // 3D LUT
    if (this.currentLUT && this.lutIntensity > 0) {
      renderer.setLUT(this.currentLUT.data, this.currentLUT.size, this.lutIntensity);
    } else {
      renderer.setLUT(null, 0, 0);
    }

    // Phase 1B: New GPU shader effects
    const adj = this.colorAdjustments;
    renderer.setHighlightsShadows(adj.highlights, adj.shadows, adj.whites, adj.blacks);
    renderer.setVibrance(adj.vibrance, adj.vibranceSkinProtection);
    renderer.setClarity(adj.clarity);
    renderer.setSharpen(this.filterSettings.sharpen);
    renderer.setHSLQualifier(this.hslQualifier.getState());
  }

  private renderHDRWithWebGL(
    image: IPImage,
    displayWidth: number,
    displayHeight: number,
  ): boolean {
    const renderer = this.ensureGLRenderer();
    if (!renderer || !this.glCanvas) return false;

    // Activate WebGL canvas
    if (!this.hdrRenderActive) {
      this.glCanvas.style.display = 'block';
      this.imageCanvas.style.visibility = 'hidden';
      this.hdrRenderActive = true;
    }

    // Resize if needed
    if (this.glCanvas.width !== displayWidth || this.glCanvas.height !== displayHeight) {
      renderer.resize(displayWidth, displayHeight);
    }

    // Sync color adjustments and tone mapping (HDR-specific overrides)
    const isHDROutput = renderer.getHDROutputMode() !== 'sdr';
    if (isHDROutput) {
      // HDR output: values > 1.0 pass through to the rec2100-hlg/pq drawing buffer.
      // - No tone mapping: the HDR display handles the extended luminance range
      // - Gamma = 1 (linear): the browser applies the HLG/PQ OETF automatically
      // Other adjustments (exposure, temperature, saturation, etc.) still apply.
      renderer.setColorAdjustments({ ...this.colorAdjustments, gamma: 1 });
      renderer.setToneMappingState({ enabled: false, operator: 'off' });
    } else {
      // SDR output: tone mapping compresses HDR→SDR, gamma encodes linear→sRGB
      renderer.setColorAdjustments(this.colorAdjustments);
      renderer.setToneMappingState(this.toneMappingState);
    }

    // Sync shared state (effects, LUT, background pattern, etc.)
    this.syncRendererState(renderer);

    // Render
    renderer.clear(0, 0, 0, 1);
    renderer.renderImage(image, 0, 0, 1, 1);

    // CSS transform for rotation/flip
    const { rotation, flipH, flipV } = this.transform;
    const transforms: string[] = [];
    if (rotation) transforms.push(`rotate(${rotation}deg)`);
    if (flipH) transforms.push('scaleX(-1)');
    if (flipV) transforms.push('scaleY(-1)');
    this.glCanvas.style.transform = transforms.length ? transforms.join(' ') : '';

    return true;
  }

  private deactivateHDRMode(): void {
    if (!this.glCanvas) return;
    this.glCanvas.style.display = 'none';
    this.imageCanvas.style.visibility = 'visible';
    this.hdrRenderActive = false;
  }

  private deactivateSDRWebGLMode(): void {
    if (!this.glCanvas) return;
    this.glCanvas.style.display = 'none';
    this.imageCanvas.style.visibility = 'visible';
    this.sdrWebGLRenderActive = false;
    // Restore CSS filters for the 2D canvas path
    this.applyColorFilters();
  }

  /**
   * Check if any GPU-supported shader effects are active that justify routing
   * SDR content through the WebGL pipeline instead of the 2D canvas path.
   *
   * Effects supported in the GPU shader:
   * - exposure, gamma, saturation, contrast, brightness, temperature, tint
   * - hue rotation, tone mapping, color inversion, channel isolation
   * - CDL, curves, color wheels, false color, zebra stripes, 3D LUT
   * - display color management, background pattern
   * - highlights/shadows/whites/blacks, vibrance, clarity, sharpen
   * - HSL qualifier (secondary color correction)
   */
  private hasGPUShaderEffectsActive(): boolean {
    const adj = this.colorAdjustments;
    // Basic color adjustments
    if (adj.exposure !== 0) return true;
    if (adj.gamma !== 1) return true;
    if (adj.saturation !== 1) return true;
    if (adj.contrast !== 1) return true;
    if (adj.brightness !== 0) return true;
    if (adj.temperature !== 0) return true;
    if (adj.tint !== 0) return true;
    if (!isIdentityHueRotation(adj.hueRotation)) return true;

    // Tone mapping
    if (this.isToneMappingEnabled()) return true;

    // Color inversion
    if (this.colorInversionEnabled) return true;

    // Channel isolation
    if (this.channelMode !== 'rgb') return true;

    // CDL
    if (!isDefaultCDL(this.cdlValues)) return true;

    // Curves
    if (!isDefaultCurves(this.curvesData)) return true;

    // Color wheels
    if (this.colorWheels.hasAdjustments()) return true;

    // False color
    if (this.falseColor.isEnabled()) return true;

    // Zebra stripes
    if (this.zebraStripes.isEnabled()) return true;

    // 3D LUT
    if (this.currentLUT && this.lutIntensity > 0) return true;

    // Display color management
    if (isDisplayStateActive(this.displayColorState)) return true;

    // Phase 1B: New GPU shader effects
    // Highlights/shadows/whites/blacks
    if (adj.highlights !== 0 || adj.shadows !== 0 || adj.whites !== 0 || adj.blacks !== 0) return true;
    // Vibrance
    if (adj.vibrance !== 0) return true;
    // Clarity
    if (adj.clarity !== 0) return true;
    // Sharpen
    if (this.filterSettings.sharpen > 0) return true;
    // HSL qualifier
    if (this.hslQualifier.isEnabled()) return true;

    return false;
  }

  /**
   * Check if any CPU-only effects are active that are not in the GPU shader.
   * When these are active, the SDR path must fall back to the 2D canvas + pixel
   * processing pipeline to get correct results.
   *
   * After Phase 1B, the only remaining CPU-only effect is blur (applied via CSS
   * filter which doesn't work with the GL canvas).
   */
  private hasCPUOnlyEffectsActive(): boolean {
    // Blur (applied via CSS filter which doesn't work with the GL canvas)
    if (this.filterSettings.blur > 0) return true;
    return false;
  }

  /**
   * Render an SDR source through the WebGL shader pipeline for GPU-accelerated
   * effects processing. This avoids the slow CPU pixel processing path for
   * effects that are supported in the fragment shader.
   *
   * Returns true if the SDR content was rendered via WebGL, false if the caller
   * should fall back to the 2D canvas path.
   */
  private renderSDRWithWebGL(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
    displayWidth: number,
    displayHeight: number,
  ): boolean {
    const renderer = this.ensureGLRenderer();
    if (!renderer || !this.glCanvas) return false;

    // Activate WebGL canvas (show GL canvas, hide 2D canvas)
    if (!this.sdrWebGLRenderActive) {
      this.glCanvas.style.display = 'block';
      this.imageCanvas.style.visibility = 'hidden';
      this.sdrWebGLRenderActive = true;
      this.applyColorFilters();
    }

    // Resize if needed
    if (this.glCanvas.width !== displayWidth || this.glCanvas.height !== displayHeight) {
      renderer.resize(displayWidth, displayHeight);
    }

    // Sync color adjustments and tone mapping (SDR: use as configured)
    renderer.setColorAdjustments(this.colorAdjustments);
    renderer.setToneMappingState(this.toneMappingState);

    // Sync shared state (effects, LUT, background pattern, etc.)
    this.syncRendererState(renderer);

    // Render
    renderer.clear(0, 0, 0, 1);
    const result = renderer.renderSDRFrame(source);

    if (!result) {
      // WebGL rendering failed - deactivate and let caller fall back to 2D canvas
      this.deactivateSDRWebGLMode();
      return false;
    }

    // CSS transform for rotation/flip
    const { rotation, flipH, flipV } = this.transform;
    const transforms: string[] = [];
    if (rotation) transforms.push(`rotate(${rotation}deg)`);
    if (flipH) transforms.push('scaleX(-1)');
    if (flipV) transforms.push('scaleY(-1)');
    this.glCanvas.style.transform = transforms.length ? transforms.join(' ') : '';

    return true;
  }

  private renderImage(): void {
    const source = this.session.currentSource;

    // Deactivate HDR mode if current source isn't HDR
    const isCurrentHDR = source?.fileSourceNode?.isHDR() === true;
    if (this.hdrRenderActive && !isCurrentHDR) {
      this.deactivateHDRMode();
    }

    // Deactivate SDR WebGL mode if current source is HDR (HDR path takes over)
    if (isCurrentHDR && this.sdrWebGLRenderActive) {
      this.deactivateSDRWebGLMode();
    }

    // Get container size (cached per frame)
    const containerRect = this.getContainerRect();
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
        // Check if sub-frame interpolation is active (slow-motion blending)
        const subFramePos = this.session.subFramePosition;
        if (subFramePos && this.frameInterpolator.enabled && subFramePos.ratio > 0 && subFramePos.ratio < 1) {
          const nextFrameCanvas = this.session.getVideoFrameCanvas(subFramePos.nextFrame);
          if (nextFrameCanvas) {
            const blendedCanvas = this.frameInterpolator.getBlendedFrame(frameCanvas, nextFrameCanvas, subFramePos);
            if (blendedCanvas) {
              element = blendedCanvas;
            } else {
              element = frameCanvas;
            }
          } else {
            element = frameCanvas;
          }
        } else {
          element = frameCanvas;
        }
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
    } else if (source?.fileSourceNode) {
      // HDR files: prefer WebGL rendering path (handled below after display dimensions are computed)
      // Set canvas fallback in case WebGL path fails or source isn't HDR
      if (!source.fileSourceNode.isHDR()) {
        element = source.fileSourceNode.getCanvas() ?? undefined;
      }
      // For HDR: element stays undefined here; we intercept after displayWidth/Height are calculated
    } else {
      // Fallback: use HTMLVideoElement directly (no mediabunny)
      element = source?.element;
    }

    // HDR sources may have no element (they render via WebGL); treat them as valid
    const hdrFileSource = source?.fileSourceNode?.isHDR() ? source.fileSourceNode : null;
    if (!source || (!element && !hdrFileSource)) {
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

    // Calculate uncrop padding and effective virtual canvas size
    const uncropPad = this.getUncropPadding();
    const uncropActive = this.isUncropActive();
    const baseWidth = uncropActive ? this.sourceWidth + uncropPad.left + uncropPad.right : this.sourceWidth;
    const virtualHeight = uncropActive ? this.sourceHeight + uncropPad.top + uncropPad.bottom : this.sourceHeight;

    // Apply PAR correction: scale virtual width by pixel aspect ratio
    const parActive = isPARActive(this.parState);
    const virtualWidth = parActive ? calculatePARCorrectedWidth(baseWidth, this.parState.par) : baseWidth;

    const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
      virtualWidth,
      virtualHeight,
      containerWidth,
      containerHeight,
      this.zoom
    );

    // Scale factor from virtual source to display pixels
    const uncropScaleX = uncropActive ? displayWidth / virtualWidth : 1;
    const uncropScaleY = uncropActive ? displayHeight / virtualHeight : 1;
    // Pixel offsets for the image within the expanded canvas
    const uncropOffsetX = uncropActive ? Math.round(uncropPad.left * uncropScaleX) : 0;
    const uncropOffsetY = uncropActive ? Math.round(uncropPad.top * uncropScaleY) : 0;
    // Display dimensions of the source image (excluding padding) within the expanded canvas.
    // Derive from displayWidth minus both padding offsets to avoid rounding gaps.
    const uncropRightPadX = uncropActive ? Math.round(uncropPad.right * uncropScaleX) : 0;
    const uncropBottomPadY = uncropActive ? Math.round(uncropPad.bottom * uncropScaleY) : 0;
    const imageDisplayW = uncropActive ? Math.max(1, displayWidth - uncropOffsetX - uncropRightPadX) : displayWidth;
    const imageDisplayH = uncropActive ? Math.max(1, displayHeight - uncropOffsetY - uncropBottomPadY) : displayHeight;

    // Update canvas size if needed
    if (this.displayWidth !== displayWidth || this.displayHeight !== displayHeight) {
      this.setCanvasSize(displayWidth, displayHeight);
    }

    // HDR WebGL rendering path: render via GPU shader pipeline and skip 2D canvas
    if (hdrFileSource) {
      const ipImage = hdrFileSource.getIPImage();
      if (ipImage && this.renderHDRWithWebGL(ipImage, displayWidth, displayHeight)) {
        this.updateCanvasPosition();
        this.updateWipeLine();
        return; // HDR path complete, skip 2D
      }
      // WebGL failed — fall back to 2D canvas
      element = hdrFileSource.getCanvas() ?? undefined;
      if (!element) {
        this.drawPlaceholder();
        this.updateCanvasPosition();
        this.updateWipeLine();
        return;
      }
    }

    // SDR WebGL rendering path: route SDR sources through GPU shader pipeline
    // when GPU-supported effects are active and no CPU-only effects need the 2D path.
    // Conditions: element is available, not HDR, GPU effects active, no CPU-only effects,
    // no active crop clipping (not yet handled in GL shader), and no complex features
    // that require the 2D canvas (wipe, split screen, stack, difference matte, uncrop,
    // stereo, lens distortion, ghost frames, OCIO).
    const cropClipActiveForSDR = this.cropState.enabled && !isFullCropRegion(this.cropState.region);
    const sdrWebGLEligible =
      element &&
      !isCurrentHDR &&
      !cropClipActiveForSDR &&
      this.hasGPUShaderEffectsActive() &&
      !this.hasCPUOnlyEffectsActive() &&
      !uncropActive &&
      this.wipeState.mode === 'off' &&
      !this.isStackEnabled() &&
      !this.differenceMatteState.enabled &&
      !this.ghostFrameState.enabled &&
      isDefaultStereoState(this.stereoState) &&
      isDefaultLensParams(this.lensParams) &&
      !(this.ocioEnabled && this.ocioBakedLUT) &&
      (element instanceof HTMLImageElement ||
       element instanceof HTMLVideoElement ||
       element instanceof HTMLCanvasElement ||
       (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas));

    if (sdrWebGLEligible) {
      if (this.renderSDRWithWebGL(
        element as HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement,
        displayWidth,
        displayHeight,
      )) {
        this.updateCanvasPosition();
        this.updateWipeLine();
        return; // SDR WebGL path complete, skip 2D processing
      }
      // renderSDRWithWebGL failed — fall through to 2D canvas path
    } else if (this.sdrWebGLRenderActive) {
      // Transitioning away from SDR WebGL: deactivate and restore 2D canvas path
      this.deactivateSDRWebGLMode();
    }

    // Clear canvas
    this.imageCtx.clearRect(0, 0, displayWidth, displayHeight);

    // Draw background pattern (shows through transparent/alpha areas of the image)
    if (this.backgroundPatternState.pattern !== 'black') {
      drawBackgroundPattern(this.imageCtx, displayWidth, displayHeight, this.backgroundPatternState);
    }

    // When uncrop is active, fill the padding area with a subtle pattern
    if (uncropActive) {
      this.drawUncropBackground(displayWidth, displayHeight, uncropOffsetX, uncropOffsetY, imageDisplayW, imageDisplayH);
    }

    // Enable high-quality image smoothing for best picture quality
    this.imageCtx.imageSmoothingEnabled = true;
    this.imageCtx.imageSmoothingQuality = 'high';

    // Check if crop clipping should be applied (will be done AFTER all rendering)
    // Note: We can't use ctx.clip() because putImageData() ignores clip regions
    const cropClipActive = this.cropState.enabled && !isFullCropRegion(this.cropState.region);

    // Try prerendered cache first during playback for smooth performance with effects
    if (this.session.isPlaying && this.prerenderBuffer) {
      const currentFrame = this.session.currentFrame;
      // Note: preloadAround() is already called from the frameChanged handler,
      // so we don't duplicate it here. Only queuePriorityFrame() is called on cache miss.
      const cached = this.prerenderBuffer.getFrame(currentFrame);
      if (cached) {
        // Draw cached pre-rendered frame scaled to display size
        if (uncropActive) {
          this.imageCtx.drawImage(cached.canvas, uncropOffsetX, uncropOffsetY, imageDisplayW, imageDisplayH);
        } else {
          this.imageCtx.drawImage(cached.canvas, 0, 0, displayWidth, displayHeight);
        }
        // After drawing cached frame, apply GPU-accelerated effects not handled by worker
        if (this.currentLUT && this.lutIntensity > 0) {
          this.applyLUTToCanvas(this.imageCtx, displayWidth, displayHeight);
        }
        if (this.ocioEnabled && this.ocioBakedLUT) {
          this.applyOCIOToCanvas(this.imageCtx, displayWidth, displayHeight);
        }
        // Apply lightweight diagnostic overlays and display management
        this.applyLightweightEffects(this.imageCtx, displayWidth, displayHeight);
        // Apply crop clipping by clearing outside areas
        if (cropClipActive) {
          this.clearOutsideCropRegion(displayWidth, displayHeight);
        }
        this.updateCanvasPosition();
        this.updateWipeLine();
        return; // Skip live effect processing
      }
      // Phase 2A: On cache miss during playback, show raw frame without effects.
      // Queue the frame for async processing in the background so it will be
      // available on the next render pass. This avoids blocking the main thread
      // with synchronous applyBatchedPixelEffects() during playback.
      this.prerenderBuffer.queuePriorityFrame(currentFrame);
    }

    // Check if difference matte mode is enabled
    let rendered = false;
    if (this.differenceMatteState.enabled && this.session.abCompareAvailable) {
      // Render difference between A and B sources
      const diffData = this.renderDifferenceMatte(displayWidth, displayHeight);
      if (diffData) {
        this.compositeImageDataOverBackground(diffData, displayWidth, displayHeight);
        rendered = true;
      }
    }

    if (!rendered && isSplitScreenMode(this.wipeState.mode) && this.session.abCompareAvailable) {
      // Split screen A/B comparison - show source A on one side, source B on other
      this.renderSplitScreen(displayWidth, displayHeight);
      rendered = true;
    }

    if (!rendered && this.isStackEnabled()) {
      // Composite all stack layers
      const compositedData = this.compositeStackLayers(displayWidth, displayHeight);
      if (compositedData) {
        this.compositeImageDataOverBackground(compositedData, displayWidth, displayHeight);
        rendered = true;
      }
    }

    if (!rendered && (
      element instanceof HTMLImageElement ||
      element instanceof HTMLVideoElement ||
      element instanceof HTMLCanvasElement ||
      (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)
    )) {
      // Single source rendering (supports images, videos, and canvas elements from mediabunny)
      // Handle wipe rendering (but not split screen modes which are handled above)
      if (this.wipeState.mode !== 'off' && !isSplitScreenMode(this.wipeState.mode) && !(element instanceof HTMLCanvasElement) && !(typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)) {
        // Wipe only works with HTMLImageElement/HTMLVideoElement
        this.renderWithWipe(element as HTMLImageElement | HTMLVideoElement, displayWidth, displayHeight);
      } else if (uncropActive) {
        // Uncrop: draw image at offset within expanded canvas
        this.imageCtx.save();
        this.imageCtx.translate(uncropOffsetX, uncropOffsetY);
        this.drawWithTransform(this.imageCtx, element as CanvasImageSource, imageDisplayW, imageDisplayH);
        this.imageCtx.restore();
      } else {
        // Normal rendering with transforms
        this.drawWithTransform(this.imageCtx, element as CanvasImageSource, displayWidth, displayHeight);
      }
      rendered = true;
    }

    // Fallback: if nothing was rendered but we have a current source, draw it
    if (!rendered) {
      const currentSource = this.session.currentSource;
      if (currentSource?.element) {
        if (uncropActive) {
          this.imageCtx.save();
          this.imageCtx.translate(uncropOffsetX, uncropOffsetY);
          this.drawWithTransform(this.imageCtx, currentSource.element, imageDisplayW, imageDisplayH);
          this.imageCtx.restore();
        } else {
          this.drawWithTransform(this.imageCtx, currentSource.element, displayWidth, displayHeight);
        }
      }
    }

    // Render ghost frames (onion skin) on top of the main frame
    if (this.ghostFrameState.enabled) {
      this.renderGhostFrames(displayWidth, displayHeight);
    }

    // Apply post-processing effects (stereo, lens, LUT, color, sharpen) regardless of stack mode
    // Apply stereo viewing mode (transforms layout for 3D viewing)
    // Uses extended function when per-eye transforms or alignment overlays are active
    if (!isDefaultStereoState(this.stereoState)) {
      const hasEyeTransforms = !isDefaultStereoEyeTransformState(this.stereoEyeTransformState);
      const hasAlignOverlay = this.stereoAlignMode !== 'off';
      if (hasEyeTransforms || hasAlignOverlay) {
        this.applyStereoModeWithEyeTransforms(this.imageCtx, displayWidth, displayHeight);
      } else {
        this.applyStereoMode(this.imageCtx, displayWidth, displayHeight);
      }
    }

    // Apply lens distortion correction (geometric transform, applied first)
    if (!isDefaultLensParams(this.lensParams)) {
      this.applyLensDistortionToCtx(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply 3D LUT (GPU-accelerated color grading)
    if (this.currentLUT && this.lutIntensity > 0) {
      this.applyLUTToCanvas(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply OCIO display transform (GPU-accelerated via baked 3D LUT)
    // This runs after user-loaded LUTs but before color adjustments/CDL/curves
    if (this.ocioEnabled && this.ocioBakedLUT) {
      this.applyOCIOToCanvas(this.imageCtx, displayWidth, displayHeight);
    }

    // Apply batched pixel-level effects (highlights/shadows, vibrance, clarity,
    // CDL, curves, HSL qualifier, sharpen, channel isolation, etc.)
    // This uses a single getImageData/putImageData pair for better performance.
    // Phase 2A: During playback with prerender buffer active, skip expensive CPU
    // effects on cache miss (workers handle those). Still apply cheap diagnostic
    // overlays and display color management for accurate monitoring.
    if (this.session.isPlaying && this.prerenderBuffer) {
      this.applyLightweightEffects(this.imageCtx, displayWidth, displayHeight);
    } else {
      // When paused/scrubbing, apply all effects synchronously for instant feedback
      this.applyBatchedPixelEffects(this.imageCtx, displayWidth, displayHeight);
    }

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

    // Enable high-quality image smoothing for best picture quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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

  /**
   * Render split screen A/B comparison.
   * Shows source A on one side and source B on the other, using canvas clipping.
   */
  private renderSplitScreen(displayWidth: number, displayHeight: number): void {
    const sourceA = this.session.sourceA;
    const sourceB = this.session.sourceB;

    if (!sourceA?.element || !sourceB?.element) {
      // Fallback to current source if A/B not properly set up
      const currentSource = this.session.currentSource;
      if (currentSource?.element) {
        this.drawWithTransform(this.imageCtx, currentSource.element, displayWidth, displayHeight);
      }
      return;
    }

    const ctx = this.imageCtx;
    const pos = this.wipeState.position;
    const currentFrame = this.session.currentFrame;

    // Determine the element to use for source A
    // For mediabunny videos, use the cached frame canvas
    let elementA: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas = sourceA.element;
    if (sourceA.type === 'video' && this.session.isUsingMediabunny()) {
      const frameCanvas = this.session.getVideoFrameCanvas(currentFrame);
      if (frameCanvas) {
        elementA = frameCanvas;
      }
    }

    // Determine the element to use for source B
    // For mediabunny videos, use the cached frame canvas
    let elementB: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas = sourceB.element;
    if (sourceB.type === 'video' && this.session.isSourceBUsingMediabunny()) {
      const frameCanvas = this.session.getSourceBFrameCanvas(currentFrame);
      if (frameCanvas) {
        elementB = frameCanvas;
        // Cache this frame canvas to use as fallback while next frame loads
        this.lastSourceBFrameCanvas = frameCanvas;
        this.hasDisplayedSourceBMediabunnyFrame = true;
        this.pendingSourceBFrameFetch = null;
        this.pendingSourceBFrameNumber = 0;
      } else {
        // Frame not cached - fetch it asynchronously
        if (!this.pendingSourceBFrameFetch || this.pendingSourceBFrameNumber !== currentFrame) {
          this.pendingSourceBFrameNumber = currentFrame;
          const frameToFetch = currentFrame;

          this.pendingSourceBFrameFetch = this.session.fetchSourceBVideoFrame(frameToFetch)
            .then(() => {
              if (this.pendingSourceBFrameNumber === frameToFetch) {
                this.pendingSourceBFrameFetch = null;
                this.pendingSourceBFrameNumber = 0;
                this.refresh();
              }
            })
            .catch(() => {
              if (this.pendingSourceBFrameNumber === frameToFetch) {
                this.pendingSourceBFrameFetch = null;
                this.pendingSourceBFrameNumber = 0;
              }
            });
        }

        // Use fallback while frame is being fetched
        if (this.hasDisplayedSourceBMediabunnyFrame && this.lastSourceBFrameCanvas) {
          // Use the last successfully rendered frame to prevent flickering
          elementB = this.lastSourceBFrameCanvas;
        } else {
          // First render - use HTMLVideoElement as initial fallback
          elementB = sourceB.element;
        }
      }
    }

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();

    if (this.wipeState.mode === 'splitscreen-h') {
      // Horizontal split: A on left, B on right
      const splitX = Math.floor(displayWidth * pos);
      this.drawClippedSource(ctx, elementA, 0, 0, splitX, displayHeight, displayWidth, displayHeight);
      this.drawClippedSource(ctx, elementB, splitX, 0, displayWidth - splitX, displayHeight, displayWidth, displayHeight);
    } else if (this.wipeState.mode === 'splitscreen-v') {
      // Vertical split: A on top, B on bottom
      const splitY = Math.floor(displayHeight * pos);
      this.drawClippedSource(ctx, elementA, 0, 0, displayWidth, splitY, displayWidth, displayHeight);
      this.drawClippedSource(ctx, elementB, 0, splitY, displayWidth, displayHeight - splitY, displayWidth, displayHeight);
    }

    ctx.restore();

    // Update split screen UI elements
    this.updateSplitScreenLine();
  }

  /**
   * Draw a source element clipped to a specific region.
   * Used by split screen rendering to show different sources in different areas.
   */
  private drawClippedSource(
    ctx: CanvasRenderingContext2D,
    element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas,
    clipX: number,
    clipY: number,
    clipWidth: number,
    clipHeight: number,
    displayWidth: number,
    displayHeight: number
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipWidth, clipHeight);
    ctx.clip();
    ctx.filter = this.getCanvasFilterString();
    this.drawSourceToContext(ctx, element, displayWidth, displayHeight);
    ctx.restore();
  }

  /**
   * Draw a source element to a context, handling different element types.
   */
  private drawSourceToContext(
    ctx: CanvasRenderingContext2D,
    element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas,
    width: number,
    height: number
  ): void {
    // Apply transform and draw
    drawWithTransformUtil(ctx, element, width, height, this.transform);
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
    if (this.glRenderer) {
      this.glRenderer.setColorAdjustments(adjustments);
    }
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

  // Color inversion methods
  setColorInversion(enabled: boolean): void {
    if (this.colorInversionEnabled === enabled) return;
    this.colorInversionEnabled = enabled;
    if (this.glRenderer) {
      this.glRenderer.setColorInversion(enabled);
    }
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getColorInversion(): boolean {
    return this.colorInversionEnabled;
  }

  toggleColorInversion(): void {
    this.setColorInversion(!this.colorInversionEnabled);
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

  /** Get the multi-point LUT pipeline instance */
  getLUTPipeline(): LUTPipeline {
    return this.lutPipeline;
  }

  /** Get the GPU LUT chain (for multi-point rendering) */
  getGPULUTChain(): GPULUTChain | null {
    return this.gpuLUTChain;
  }

  /**
   * Update A/B indicator visibility and text
   */
  updateABIndicator(current?: 'A' | 'B'): void {
    if (!this.abIndicator) return;

    const ab = current ?? this.session.currentAB;
    const available = this.session.abCompareAvailable;

    // Hide the A/B indicator in split screen mode since both sources are visible
    // with their own labels (A and B) on each side of the split
    if (isSplitScreenMode(this.wipeState.mode)) {
      this.abIndicator.style.display = 'none';
      return;
    }

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

  /**
   * Apply OCIO display transform using GPU-accelerated baked 3D LUT.
   *
   * The OCIO transform chain (input -> working -> look -> display+view) is pre-baked
   * into a 3D LUT by the OCIOProcessor, then applied here via the WebGL LUT pipeline
   * for real-time performance.
   */
  private applyOCIOToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.ocioBakedLUT) return;

    // Use dedicated GPU LUT processor for OCIO
    if (this.ocioLUTProcessor && this.ocioLUTProcessor.hasLUT()) {
      this.ocioLUTProcessor.applyToCanvas(ctx, width, height, 1.0);
      return;
    }

    // CPU fallback: apply OCIO transform via the shared processor
    // This is slower but ensures OCIO always works even without GPU support
    const ocioProcessor = getSharedOCIOProcessor();
    if (ocioProcessor.isEnabled()) {
      const imageData = ctx.getImageData(0, 0, width, height);
      ocioProcessor.apply(imageData);
      ctx.putImageData(imageData, 0, 0);
    }
  }

  // ==========================================================================
  // OCIO Color Management Methods
  // ==========================================================================

  /**
   * Set the baked OCIO 3D LUT for GPU-accelerated display transform.
   * Called by the App when the OCIOProcessor bakes a new transform.
   *
   * @param lut The baked 3D LUT from OCIOProcessor.bakeTo3DLUT(), or null to clear
   * @param enabled Whether OCIO processing is enabled
   */
  setOCIOBakedLUT(lut: LUT3D | null, enabled: boolean): void {
    this.ocioBakedLUT = lut;
    this.ocioEnabled = enabled;

    // Update the dedicated OCIO GPU LUT processor
    if (this.ocioLUTProcessor) {
      this.ocioLUTProcessor.setLUT(lut);
    }

    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  /**
   * Get whether OCIO is currently enabled and active
   */
  isOCIOEnabled(): boolean {
    return this.ocioEnabled && this.ocioBakedLUT !== null;
  }

  // Wipe comparison methods
  setWipeState(state: WipeState): void {
    this.wipeState = { ...state };
    this.updateWipeLine();
    this.updateSplitScreenLine();
    this.updateABIndicator(); // Hide/show A/B indicator based on mode
    this.scheduleRender();
  }

  getWipeState(): WipeState {
    return { ...this.wipeState };
  }

  setWipeMode(mode: WipeMode): void {
    this.wipeState.mode = mode;
    this.updateWipeLine();
    this.updateSplitScreenLine();
    this.updateABIndicator(); // Hide/show A/B indicator based on mode
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

  // Uncrop methods
  setUncropState(state: UncropState): void {
    this.uncropState = { ...state };
    this.scheduleRender();
  }

  getUncropState(): UncropState {
    return { ...this.uncropState };
  }

  /**
   * Check if uncrop is actively adding padding to the canvas.
   */
  isUncropActive(): boolean {
    if (!this.uncropState.enabled) return false;
    if (this.uncropState.paddingMode === 'uniform') {
      return this.uncropState.padding > 0;
    }
    return this.uncropState.paddingTop > 0 || this.uncropState.paddingRight > 0 ||
           this.uncropState.paddingBottom > 0 || this.uncropState.paddingLeft > 0;
  }

  /**
   * Get effective padding in pixels for uncrop.
   */
  private getUncropPadding(): { top: number; right: number; bottom: number; left: number } {
    if (!this.uncropState.enabled) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (this.uncropState.paddingMode === 'uniform') {
      const p = Math.max(0, this.uncropState.padding);
      return { top: p, right: p, bottom: p, left: p };
    }
    return {
      top: Math.max(0, this.uncropState.paddingTop),
      right: Math.max(0, this.uncropState.paddingRight),
      bottom: Math.max(0, this.uncropState.paddingBottom),
      left: Math.max(0, this.uncropState.paddingLeft),
    };
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
   * Uses a single getImageData/putImageData pair for all pixel-level effects:
   * highlights/shadows, vibrance, clarity, hue rotation, color wheels, CDL,
   * curves, HSL qualifier, tone mapping, color inversion, sharpen, channel
   * isolation, display color management, false color, luminance visualization,
   * zebra stripes, and clipping overlay.
   * This reduces GPU-to-CPU transfers from N to 1.
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
    const hasHueRotation = !isIdentityHueRotation(this.colorAdjustments.hueRotation);
    const hasColorWheels = this.colorWheels.hasAdjustments();
    const hasHSLQualifier = this.hslQualifier.isEnabled();
    const hasFalseColor = this.falseColor.isEnabled();
    const hasLuminanceVis = this.luminanceVisualization.getMode() !== 'off' && this.luminanceVisualization.getMode() !== 'false-color';
    const hasZebras = this.zebraStripes.isEnabled();
    const hasClippingOverlay = this.clippingOverlay.isEnabled();
    const hasToneMapping = this.isToneMappingEnabled();
    const hasInversion = this.colorInversionEnabled;
    const hasDisplayColorMgmt = isDisplayStateActive(this.displayColorState);

    // Early return if no pixel effects are active
    // Note: OCIO is handled via GPU-accelerated 3D LUT in the main render pipeline (applyOCIOToCanvas)
    if (!hasCDL && !hasCurves && !hasSharpen && !hasChannel && !hasHighlightsShadows && !hasVibrance && !hasClarity && !hasHueRotation && !hasColorWheels && !hasHSLQualifier && !hasFalseColor && !hasLuminanceVis && !hasZebras && !hasClippingOverlay && !hasToneMapping && !hasInversion && !hasDisplayColorMgmt) {
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

    // Apply hue rotation (luminance-preserving, after basic adjustments, before CDL)
    if (hasHueRotation) {
      const data = imageData.data;
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        const r = data[i]! / 255;
        const g = data[i + 1]! / 255;
        const b = data[i + 2]! / 255;
        const [nr, ng, nb] = applyHueRotationPixel(r, g, b, this.colorAdjustments.hueRotation);
        data[i] = Math.round(nr * 255);
        data[i + 1] = Math.round(ng * 255);
        data[i + 2] = Math.round(nb * 255);
      }
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

    // Apply tone mapping (after color adjustments, before channel isolation)
    if (hasToneMapping) {
      applyToneMapping(imageData, this.toneMappingState.operator);
    }

    // Apply color inversion (after all color corrections, before sharpen/channel isolation)
    if (hasInversion) {
      applyColorInversion(imageData);
    }

    // Apply sharpen filter
    if (hasSharpen) {
      this.applySharpenToImageData(imageData);
    }

    // Apply channel isolation (before false color so we can see individual channel exposure)
    if (hasChannel) {
      applyChannelIsolation(imageData, this.channelMode);
    }

    // Apply display color management (final pipeline stage before diagnostic overlays)
    if (hasDisplayColorMgmt) {
      applyDisplayColorManagementToImageData(imageData, this.displayColorState);
    }

    // Apply luminance visualization modes (HSV, random color, contour) or false color
    // These replace pixel colors for analysis, so they're mutually exclusive
    if (hasLuminanceVis) {
      this.luminanceVisualization.apply(imageData);
    } else if (hasFalseColor) {
      this.falseColor.apply(imageData);
    }

    // Apply zebra stripes (overlay on top of other effects for exposure warnings)
    // Note: Zebras work on original image luminance, so they're applied after false color
    // (typically you'd use one or the other, not both)
    if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
      this.zebraStripes.apply(imageData);
    }

    // Apply clipping overlay (shows clipped highlights/shadows)
    // Applied last as it's a diagnostic overlay
    if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
      this.clippingOverlay.apply(imageData);
    }

    // Single putImageData call
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Apply only lightweight diagnostic overlays and display color management.
   * Used during playback with prerender buffer to maintain visual diagnostics
   * without blocking on expensive CPU effects (handled by workers).
   * These are all O(n) single-pass with no heavy computation (<5ms at 1080p).
   */
  private applyLightweightEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const hasChannel = this.channelMode !== 'rgb';
    const hasFalseColor = this.falseColor.isEnabled();
    const hasLuminanceVis = this.luminanceVisualization.getMode() !== 'off' && this.luminanceVisualization.getMode() !== 'false-color';
    const hasZebras = this.zebraStripes.isEnabled();
    const hasClippingOverlay = this.clippingOverlay.isEnabled();
    const hasDisplayColorMgmt = isDisplayStateActive(this.displayColorState);

    // Early return if no lightweight effects are active
    if (!hasChannel && !hasFalseColor && !hasLuminanceVis && !hasZebras && !hasClippingOverlay && !hasDisplayColorMgmt) {
      return;
    }

    // Single getImageData call
    const imageData = ctx.getImageData(0, 0, width, height);

    // Channel isolation (fast channel swizzle)
    if (hasChannel) {
      applyChannelIsolation(imageData, this.channelMode);
    }

    // Display color management (final pipeline stage before diagnostic overlays)
    if (hasDisplayColorMgmt) {
      applyDisplayColorManagementToImageData(imageData, this.displayColorState);
    }

    // Luminance visualization or false color (mutually exclusive)
    if (hasLuminanceVis) {
      this.luminanceVisualization.apply(imageData);
    } else if (hasFalseColor) {
      this.falseColor.apply(imageData);
    }

    // Zebra stripes
    if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
      this.zebraStripes.apply(imageData);
    }

    // Clipping overlay
    if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
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

  /**
   * Apply stereo viewing mode with per-eye transforms and alignment overlay
   */
  private applyStereoModeWithEyeTransforms(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (isDefaultStereoState(this.stereoState)) return;

    const imageData = ctx.getImageData(0, 0, width, height);
    const processedData = applyStereoModeWithEyeTransforms(
      imageData,
      this.stereoState,
      this.stereoEyeTransformState,
      this.stereoAlignMode
    );
    ctx.putImageData(processedData, 0, 0);
  }

  // Per-eye transform methods
  setStereoEyeTransforms(state: StereoEyeTransformState): void {
    this.stereoEyeTransformState = {
      left: { ...state.left },
      right: { ...state.right },
      linked: state.linked,
    };
    this.scheduleRender();
  }

  getStereoEyeTransforms(): StereoEyeTransformState {
    return {
      left: { ...this.stereoEyeTransformState.left },
      right: { ...this.stereoEyeTransformState.right },
      linked: this.stereoEyeTransformState.linked,
    };
  }

  resetStereoEyeTransforms(): void {
    this.stereoEyeTransformState = {
      left: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.left },
      right: { ...DEFAULT_STEREO_EYE_TRANSFORM_STATE.right },
      linked: false,
    };
    this.scheduleRender();
  }

  // Stereo alignment mode methods
  setStereoAlignMode(mode: StereoAlignMode): void {
    this.stereoAlignMode = mode;
    this.scheduleRender();
  }

  getStereoAlignMode(): StereoAlignMode {
    return this.stereoAlignMode;
  }

  resetStereoAlignMode(): void {
    this.stereoAlignMode = DEFAULT_STEREO_ALIGN_MODE;
    this.scheduleRender();
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

  // Ghost frame (onion skin) methods
  setGhostFrameState(state: GhostFrameState): void {
    this.ghostFrameState = { ...state };
    if (!state.enabled) {
      this.ghostFrameCanvasPool = [];
      this.ghostFramePoolWidth = 0;
      this.ghostFramePoolHeight = 0;
    }
    this.scheduleRender();
  }

  getGhostFrameState(): GhostFrameState {
    return { ...this.ghostFrameState };
  }

  resetGhostFrameState(): void {
    this.ghostFrameState = { ...DEFAULT_GHOST_FRAME_STATE };
    this.ghostFrameCanvasPool = [];
    this.ghostFramePoolWidth = 0;
    this.ghostFramePoolHeight = 0;
    this.scheduleRender();
  }

  isGhostFrameEnabled(): boolean {
    return this.ghostFrameState.enabled;
  }

  // Tone mapping methods
  setToneMappingState(state: ToneMappingState): void {
    this.toneMappingState = { ...state };
    if (this.glRenderer) {
      this.glRenderer.setToneMappingState(state);
    }
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getToneMappingState(): ToneMappingState {
    return { ...this.toneMappingState };
  }

  resetToneMappingState(): void {
    this.toneMappingState = { ...DEFAULT_TONE_MAPPING_STATE };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  // HDR output mode (delegates to renderer when available)
  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq'): void {
    if (this.glRenderer && this.capabilities) {
      this.glRenderer.setHDROutputMode(mode, this.capabilities);
    }
  }

  // Pixel Aspect Ratio methods
  setPARState(state: PARState): void {
    this.parState = { ...state };
    this.scheduleRender();
  }

  getPARState(): PARState {
    return { ...this.parState };
  }

  resetPARState(): void {
    this.parState = { ...DEFAULT_PAR_STATE };
    this.scheduleRender();
  }

  // Background pattern methods
  setBackgroundPatternState(state: BackgroundPatternState): void {
    this.backgroundPatternState = { ...state };
    this.updateCSSBackground();
    this.scheduleRender();
  }

  getBackgroundPatternState(): BackgroundPatternState {
    return { ...this.backgroundPatternState };
  }

  resetBackgroundPatternState(): void {
    this.backgroundPatternState = { ...DEFAULT_BACKGROUND_PATTERN_STATE };
    this.updateCSSBackground();
    this.scheduleRender();
  }

  // Display color management methods
  setDisplayColorState(state: DisplayColorState): void {
    this.displayColorState = { ...state };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getDisplayColorState(): DisplayColorState {
    return { ...this.displayColorState };
  }

  resetDisplayColorState(): void {
    this.displayColorState = { ...DEFAULT_DISPLAY_COLOR_STATE };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  /**
   * Update CSS backgrounds on the viewer container and canvas to match
   * the current background pattern. This ensures the pattern is visible
   * in letterbox areas and around the canvas, not just on the canvas surface
   * (which is covered by opaque content).
   */
  private updateCSSBackground(): void {
    const { pattern, checkerSize, customColor } = this.backgroundPatternState;

    if (pattern === 'black') {
      // Restore theme default for container, keep canvas black
      this.container.style.background = 'var(--viewer-bg)';
      this.imageCanvas.style.background = '#000';
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

    this.container.style.background = cssBg;
    this.imageCanvas.style.background = cssBg;
  }

  /**
   * Enable or disable sub-frame interpolation for slow-motion playback.
   * When enabled, adjacent frames are blended during slow-motion for smoother output.
   * Also updates the Session's interpolation state.
   */
  setInterpolationEnabled(enabled: boolean): void {
    this.frameInterpolator.enabled = enabled;
    this.session.interpolationEnabled = enabled;
    if (!enabled) {
      this.frameInterpolator.clearCache();
    }
    this.scheduleRender();
  }

  /**
   * Whether sub-frame interpolation is currently enabled.
   */
  getInterpolationEnabled(): boolean {
    return this.frameInterpolator.enabled;
  }

  /**
   * Composite ImageData onto the canvas while preserving the background pattern.
   * putImageData() ignores compositing and overwrites pixels directly, so we
   * write to a temporary canvas first, then use drawImage() which respects
   * alpha compositing and preserves the background pattern underneath.
   */
  private compositeImageDataOverBackground(imageData: ImageData, width: number, height: number): void {
    if (this.backgroundPatternState.pattern === 'black') {
      // No background pattern - putImageData is fine
      this.imageCtx.putImageData(imageData, 0, 0);
      return;
    }

    // Ensure temp canvas is the right size
    if (!this.bgCompositeTempCanvas || !this.bgCompositeTempCtx) {
      this.bgCompositeTempCanvas = document.createElement('canvas');
      this.bgCompositeTempCtx = safeCanvasContext2D(this.bgCompositeTempCanvas, {}, this.canvasColorSpace);
    }
    if (!this.bgCompositeTempCtx) {
      // Fallback if context creation fails
      this.imageCtx.putImageData(imageData, 0, 0);
      return;
    }
    if (this.bgCompositeTempCanvas.width !== width || this.bgCompositeTempCanvas.height !== height) {
      this.bgCompositeTempCanvas.width = width;
      this.bgCompositeTempCanvas.height = height;
    }

    // Write ImageData to temp canvas, then drawImage onto main canvas
    this.bgCompositeTempCtx.putImageData(imageData, 0, 0);
    this.imageCtx.drawImage(this.bgCompositeTempCanvas, 0, 0);
  }

  isToneMappingEnabled(): boolean {
    return this.toneMappingState.enabled && this.toneMappingState.operator !== 'off';
  }

  /**
   * Get a canvas from the ghost frame pool, creating one if needed.
   * All pooled canvases share the same dimensions; if the display size changes,
   * the pool is re-sized.
   */
  private getGhostFrameCanvas(
    index: number,
    width: number,
    height: number
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    // If display size changed, resize all existing pool entries
    if (this.ghostFramePoolWidth !== width || this.ghostFramePoolHeight !== height) {
      this.ghostFramePoolWidth = width;
      this.ghostFramePoolHeight = height;
      for (const entry of this.ghostFrameCanvasPool) {
        entry.canvas.width = width;
        entry.canvas.height = height;
      }
    }

    // Create new entry if pool is not big enough
    if (index >= this.ghostFrameCanvasPool.length) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      try {
        const ctx = safeCanvasContext2D(canvas, {}, this.canvasColorSpace);
        this.ghostFrameCanvasPool.push({ canvas, ctx });
      } catch {
        return null;
      }
    }

    return this.ghostFrameCanvasPool[index]!;
  }

  /**
   * Render ghost frames (onion skin overlay) behind the main frame.
   * Shows semi-transparent previous/next frames for animation review.
   */
  private renderGhostFrames(displayWidth: number, displayHeight: number): void {
    if (!this.ghostFrameState.enabled) return;

    const currentFrame = this.session.currentFrame;
    const source = this.session.currentSource;
    if (!source) return;

    const duration = source.duration ?? 1;
    const ctx = this.imageCtx;

    // Enable high-quality smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Collect frames to render (before frames first, then after frames)
    const framesToRender: { frame: number; distance: number; isBefore: boolean }[] = [];

    // Frames before current (rendered first, farthest first)
    for (let i = this.ghostFrameState.framesBefore; i >= 1; i--) {
      const frame = currentFrame - i;
      if (frame >= 1) {
        framesToRender.push({ frame, distance: i, isBefore: true });
      }
    }

    // Frames after current (rendered second, farthest first)
    for (let i = this.ghostFrameState.framesAfter; i >= 1; i--) {
      const frame = currentFrame + i;
      if (frame <= duration) {
        framesToRender.push({ frame, distance: i, isBefore: false });
      }
    }

    // Render ghost frames
    let poolIndex = 0;
    for (const { frame, distance, isBefore } of framesToRender) {
      // Calculate opacity with falloff
      const opacity = this.ghostFrameState.opacityBase *
        Math.pow(this.ghostFrameState.opacityFalloff, distance - 1);

      // Try to get the frame from prerender cache
      let frameCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

      if (this.prerenderBuffer) {
        const cached = this.prerenderBuffer.getFrame(frame);
        if (cached) {
          frameCanvas = cached.canvas;
        }
      }

      // If not in cache, try to get from sequence or video
      if (!frameCanvas) {
        if (source.type === 'sequence') {
          // Synchronous check for cached sequence frame
          const seqFrame = this.session.getSequenceFrameSync(frame);
          if (seqFrame) {
            // Use pooled canvas instead of creating a new one
            const poolEntry = this.getGhostFrameCanvas(poolIndex, displayWidth, displayHeight);
            if (poolEntry) {
              poolEntry.ctx.clearRect(0, 0, displayWidth, displayHeight);
              poolEntry.ctx.drawImage(seqFrame, 0, 0, displayWidth, displayHeight);
              frameCanvas = poolEntry.canvas;
              poolIndex++;
            }
          }
        } else if (source.type === 'video') {
          // Try mediabunny cached frame
          const videoFrame = this.session.getVideoFrameCanvas(frame);
          if (videoFrame) {
            frameCanvas = videoFrame;
          }
        }
      }

      if (!frameCanvas) continue;

      // Draw ghost frame with opacity and optional color tint
      ctx.save();
      ctx.globalAlpha = opacity;

      if (this.ghostFrameState.colorTint) {
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
    if (poolIndex < this.ghostFrameCanvasPool.length) {
      this.ghostFrameCanvasPool.length = poolIndex;
    }
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

  /**
   * Draw the uncrop padding background - a subtle checkerboard pattern
   * to visually distinguish the padding area from the image content.
   */
  private drawUncropBackground(
    displayWidth: number,
    displayHeight: number,
    imageX: number,
    imageY: number,
    imageW: number,
    imageH: number
  ): void {
    const ctx = this.imageCtx;
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

    const containerRect = this.getContainerRect();
    const canvasRect = this.getCanvasContainerRect();

    // If split screen mode is active, hide the wipe line (split screen has its own UI)
    if (isSplitScreenMode(this.wipeState.mode)) {
      this.wipeElements.wipeLine.style.display = 'none';
      this.wipeElements.wipeLabelA.style.display = 'none';
      this.wipeElements.wipeLabelB.style.display = 'none';
      return;
    }

    updateWipeLinePosition(
      this.wipeState,
      this.wipeElements,
      containerRect,
      canvasRect,
      this.displayWidth,
      this.displayHeight
    );
  }

  private updateSplitScreenLine(): void {
    if (!this.splitScreenElements) return;

    // Only update if actually in split screen mode
    if (!isSplitScreenMode(this.wipeState.mode)) {
      // Hide split screen UI when not in split screen mode
      this.splitScreenElements.splitLine.style.display = 'none';
      this.splitScreenElements.labelA.style.display = 'none';
      this.splitScreenElements.labelB.style.display = 'none';
      return;
    }

    const containerRect = this.getContainerRect();
    const canvasRect = this.getCanvasContainerRect();

    // Safe to cast since we validated with isSplitScreenMode
    const splitState: SplitScreenState = {
      mode: this.wipeState.mode as 'splitscreen-h' | 'splitscreen-v',
      position: this.wipeState.position,
    };

    updateSplitScreenPosition(
      splitState,
      this.splitScreenElements,
      containerRect,
      canvasRect,
      this.displayWidth,
      this.displayHeight
    );
  }

  private handleWipePointerDown(e: PointerEvent): boolean {
    if (this.wipeState.mode === 'off') return false;

    // Handle split screen mode
    if (isSplitScreenMode(this.wipeState.mode) && this.splitScreenElements) {
      const splitRect = this.splitScreenElements.splitLine.getBoundingClientRect();
      const splitState: SplitScreenState = {
        mode: this.wipeState.mode as 'splitscreen-h' | 'splitscreen-v',
        position: this.wipeState.position,
      };
      if (isPointerOnSplitLine(e, splitState, splitRect)) {
        this.isDraggingSplit = true;
        return true;
      }
      return false;
    }

    // Handle regular wipe mode
    if (!this.wipeElements) return false;

    const wipeRect = this.wipeElements.wipeLine.getBoundingClientRect();
    if (isPointerOnWipeLine(e, this.wipeState, wipeRect)) {
      this.isDraggingWipe = true;
      return true;
    }

    return false;
  }

  private handleWipePointerMove(e: PointerEvent): void {
    // Handle split screen dragging
    if (this.isDraggingSplit) {
      const canvasRect = this.getCanvasContainerRect();
      const splitState: SplitScreenState = {
        mode: this.wipeState.mode as 'splitscreen-h' | 'splitscreen-v',
        position: this.wipeState.position,
      };
      this.wipeState.position = calculateSplitPosition(
        e,
        splitState,
        canvasRect,
        this.displayWidth,
        this.displayHeight
      );
      this.updateSplitScreenLine();
      this.scheduleRender();
      return;
    }

    // Handle regular wipe dragging
    if (!this.isDraggingWipe) return;

    const canvasRect = this.getCanvasContainerRect();
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
    this.isDraggingSplit = false;
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
    if (this.hdrRenderActive || this.sdrWebGLRenderActive) {
      // In HDR/SDR WebGL mode, CSS filters are skipped — the WebGL shader handles all adjustments
      this.canvasContainer.style.filter = 'none';
      return;
    }
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

  createExportCanvas(includeAnnotations: boolean, colorSpace?: 'srgb' | 'display-p3'): HTMLCanvasElement | null {
    const cropRegion = this.cropState.enabled ? this.cropState.region : undefined;
    return createExportCanvasUtil(
      this.session,
      this.paintEngine,
      this.paintRenderer,
      this.getCanvasFilterString(),
      includeAnnotations,
      this.transform,
      cropRegion,
      colorSpace
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
    // Phase 2A: When a frame completes background processing, trigger re-render
    // so the processed frame replaces the raw one being displayed
    this.prerenderBuffer.onFrameProcessed = (frame: number) => {
      if (this.session.currentFrame === frame && this.session.isPlaying) {
        this.scheduleRender();
      }
    };
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

    // Use longer debounce during playback to avoid constant cache churn
    const debounceMs = this.session.isPlaying ? 200 : EFFECTS_DEBOUNCE_MS;

    // Debounce the effect update to avoid excessive invalidations during rapid slider changes
    this.effectsChangeDebounceTimer = setTimeout(() => {
      this.effectsChangeDebounceTimer = null;
      this.doUpdateEffects();
    }, debounceMs);
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
      this.hslQualifier,
      this.toneMappingState,
      this.colorInversionEnabled
    );

    this.prerenderBuffer.updateEffects(effectsState);

    // After effects change, immediately start prerendering upcoming frames
    // so the cache warms up before playback reaches them
    if (this.session.isPlaying) {
      // Phase 2B: Queue current frame with highest priority so it processes first
      const frame = this.session.currentFrame;
      this.prerenderBuffer.queuePriorityFrame(frame);
      this.prerenderBuffer.preloadAround(frame);
    }
  }

  /**
   * Update prerender buffer playback state.
   * Should be called when playback starts/stops.
   */
  updatePrerenderPlaybackState(isPlaying: boolean, direction: number = 1): void {
    if (this.prerenderBuffer) {
      const fps = this.session.fps || 24;
      this.prerenderBuffer.setPlaybackState(isPlaying, direction, fps);
      if (isPlaying) {
        // Start preloading around current frame
        this.prerenderBuffer.preloadAround(this.session.currentFrame);
      }
    }
  }

  /**
   * Phase 2B: Proactively preload frames around a target frame.
   * Can be called from external code (e.g., Session) before the frame is rendered
   * to give the worker pool a head start.
   */
  public preloadForFrame(frame: number): void {
    if (this.prerenderBuffer) {
      this.prerenderBuffer.preloadAround(frame);
    }
  }

  dispose(): void {
    // Cancel any in-progress zoom animation
    this.cancelZoomAnimation();

    this.resizeObserver.disconnect();
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('wheel', this.onWheel);
    this.container.removeEventListener('mousemove', this.onMouseMoveForPixelSampling);
    this.container.removeEventListener('mouseleave', this.onMouseLeaveForCursorColor);
    this.container.removeEventListener('click', this.onClickForProbe);

    // Clear cursor color callback
    this.cursorColorCallback = null;

    // Cleanup theme change listener
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
      this.boundOnThemeChange = null;
    }

    // Cleanup frame interpolator
    this.frameInterpolator.dispose();

    // Cleanup WebGL LUT processor
    if (this.lutProcessor) {
      this.lutProcessor.dispose();
      this.lutProcessor = null;
    }

    // Cleanup multi-point GPU LUT chain
    if (this.gpuLUTChain) {
      this.gpuLUTChain.dispose();
      this.gpuLUTChain = null;
    }

    // Cleanup OCIO WebGL LUT processor
    if (this.ocioLUTProcessor) {
      this.ocioLUTProcessor.dispose();
      this.ocioLUTProcessor = null;
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

    // Cleanup ghost frame canvas pool
    this.ghostFrameCanvasPool = [];
    this.ghostFramePoolWidth = 0;
    this.ghostFramePoolHeight = 0;

    // Cleanup overlays
    this.clippingOverlay.dispose();
    this.luminanceVisualization.dispose();
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

    // Cleanup render worker proxy (Phase 4)
    if (this.renderWorkerProxy) {
      this.renderWorkerProxy.dispose();
      this.renderWorkerProxy = null;
      this.isAsyncRenderer = false;
    }

    // Cleanup WebGL HDR renderer
    if (this.glRenderer) {
      // Only dispose if not the worker proxy (already disposed above)
      if (!this.isAsyncRenderer) {
        this.glRenderer.dispose();
      }
      this.glRenderer = null;
    }
    this.glCanvas = null;

    // Cleanup wipe elements
    this.wipeElements = null;

    // Cleanup cached source image canvas
    this.sourceImageCanvas = null;
    this.sourceImageCtx = null;
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
   * Get source ImageData before color pipeline (for pixel probe "source" mode)
   * Returns ImageData of the original source scaled to display dimensions
   * Uses a cached canvas to avoid creating new canvases on every mouse move
   */
  getSourceImageData(): ImageData | null {
    const source = this.session.currentSource;
    if (!source) return null;

    // Get the displayed dimensions
    const displayWidth = this.imageCanvas.width;
    const displayHeight = this.imageCanvas.height;

    if (displayWidth === 0 || displayHeight === 0) return null;

    // Get the source element
    let element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | undefined;
    if (source.type === 'sequence') {
      element = this.session.getSequenceFrameSync() ?? source.element;
    } else if (source.type === 'video' && this.session.isUsingMediabunny()) {
      const frameCanvas = this.session.getVideoFrameCanvas(this.session.currentFrame);
      element = frameCanvas ?? source.element;
    } else if (source.fileSourceNode) {
      element = source.fileSourceNode.getCanvas() ?? undefined;
    } else {
      element = source.element;
    }

    if (!element) return null;

    // Reuse cached canvas or create new one if dimensions changed
    if (!this.sourceImageCanvas || !this.sourceImageCtx ||
        this.sourceImageCanvas.width !== displayWidth ||
        this.sourceImageCanvas.height !== displayHeight) {
      this.sourceImageCanvas = document.createElement('canvas');
      this.sourceImageCanvas.width = displayWidth;
      this.sourceImageCanvas.height = displayHeight;
      this.sourceImageCtx = safeCanvasContext2D(this.sourceImageCanvas, { willReadFrequently: true }, this.canvasColorSpace);
    }

    if (!this.sourceImageCtx) return null;

    // Clear and draw source with transform but without color pipeline
    this.sourceImageCtx.clearRect(0, 0, displayWidth, displayHeight);
    this.sourceImageCtx.imageSmoothingEnabled = true;
    this.sourceImageCtx.imageSmoothingQuality = 'high';

    try {
      // Apply geometric transform only
      this.drawWithTransform(this.sourceImageCtx, element as CanvasImageSource, displayWidth, displayHeight);
      return this.sourceImageCtx.getImageData(0, 0, displayWidth, displayHeight);
    } catch {
      // Handle potential CORS issues
      return null;
    }
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
   * Get the luminance visualization instance
   */
  getLuminanceVisualization(): LuminanceVisualization {
    return this.luminanceVisualization;
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
