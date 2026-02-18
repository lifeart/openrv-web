import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { PerfTrace } from '../../utils/PerfTrace';
import { ColorAdjustments } from './ColorControls';
import { WipeState, WipeMode } from './WipeControl';
import { Transform2D } from './TransformControl';
import { FilterSettings, DEFAULT_FILTER_SETTINGS } from './FilterControl';
import type { DeinterlaceParams } from '../../filters/Deinterlace';
import { DEFAULT_DEINTERLACE_PARAMS, isDeinterlaceActive, applyDeinterlace } from '../../filters/Deinterlace';
import type { GamutMappingState } from '../../core/types/effects';
import { DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';
import type { NoiseReductionParams } from '../../filters/NoiseReduction';
import { DEFAULT_NOISE_REDUCTION_PARAMS, isNoiseReductionActive, applyNoiseReduction } from '../../filters/NoiseReduction';
import type { FilmEmulationParams } from '../../filters/FilmEmulation';
import { DEFAULT_FILM_EMULATION_PARAMS, isFilmEmulationActive, applyFilmEmulation } from '../../filters/FilmEmulation';
import type { StabilizationParams } from '../../filters/StabilizeMotion';
import { DEFAULT_STABILIZATION_PARAMS, isStabilizationActive, applyStabilization } from '../../filters/StabilizeMotion';
import { CropState, CropRegion, UncropState } from './CropControl';
import { CropManager } from './CropManager';
import {
  type LUT3D,
  LUTPipeline,
  GPULUTChain,
  isLUT3D,
  type CDLValues,
  isDefaultCDL,
  applyCDLToImageData,
  type ColorCurvesData,
  isDefaultCurves,
  applyColorInversion,
  type DisplayColorState,
  DEFAULT_DISPLAY_COLOR_STATE,
  DISPLAY_TRANSFER_CODES,
  applyDisplayColorManagementToImageData,
  isDisplayStateActive,
  type DisplayCapabilities,
  safeCanvasContext2D,
  applyHueRotation as applyHueRotationPixel,
  isIdentityHueRotation,
} from '../../color/ColorProcessingFacade';
import type { LensDistortionParams } from '../../transform/LensDistortion';
import { ExportFormat, exportCanvas as doExportCanvas, copyCanvasToClipboard } from '../../utils/export/FrameExporter';
import { StackLayer } from './StackControl';
import { compositeImageData, BlendMode } from '../../composite/BlendModes';
import { getIconSvg } from './shared/Icons';
import { ChannelMode, applyChannelIsolation } from './ChannelSelect';
import { DEFAULT_BLEND_MODE_STATE, type BlendModeState } from './ComparisonManager';
import type { StereoState, StereoEyeTransformState, StereoAlignMode } from '../../stereo/StereoRenderer';
import { DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE, applyDifferenceMatte } from './DifferenceMatteControl';
import { WebGLSharpenProcessor } from '../../filters/WebGLSharpen';
import type { SafeAreasOverlay } from './SafeAreasOverlay';
import type { MatteOverlay } from './MatteOverlay';
import type { PixelProbe } from './PixelProbe';
import type { FalseColor } from './FalseColor';
import type { LuminanceVisualization } from './LuminanceVisualization';
import type { TimecodeOverlay } from './TimecodeOverlay';
import type { ZebraStripes } from './ZebraStripes';
import { ColorWheels } from './ColorWheels';
import type { SpotlightOverlay } from './SpotlightOverlay';
import type { ClippingOverlay } from './ClippingOverlay';
import { HSLQualifier } from './HSLQualifier';
import { OverlayManager } from './OverlayManager';
import { WatermarkOverlay, type WatermarkState } from './WatermarkOverlay';
import { MissingFrameOverlay } from './MissingFrameOverlay';
import { PrerenderBufferManager } from '../../utils/effects/PrerenderBufferManager';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import { setupHiDPICanvas, resetCanvasFromHiDPI } from '../../utils/ui/HiDPICanvas';

// Extracted effect processing utilities
import { applyHighlightsShadows, applyVibrance, applyClarity, applySharpenCPU, applyToneMapping } from './ViewerEffects';
import { yieldToMain } from '../../utils/effects/EffectProcessor';
import { WipeManager } from './WipeManager';
import type { GhostFrameState } from './GhostFrameControl';
import { ColorPipelineManager } from './ColorPipelineManager';
import { TransformManager } from './TransformManager';
import { StereoManager } from './StereoManager';
import { LensDistortionManager } from './LensDistortionManager';
import { PerspectiveCorrectionManager } from './PerspectiveCorrectionManager';
import { PerspectiveGridOverlay } from './PerspectiveGridOverlay';
import type { PerspectiveCorrectionParams } from '../../transform/PerspectiveCorrection';
import { GhostFrameManager } from './GhostFrameManager';
import { PixelSamplingManager } from './PixelSamplingManager';
import { ViewerGLRenderer } from './ViewerGLRenderer';
import type { GLRendererContext } from './ViewerGLRenderer';
import { detectWebGPUHDR, isHDROutputAvailableWithLog } from '../../color/DisplayCapabilities';
import { VideoFrameFetchTracker } from './VideoFrameFetchTracker';
import { ToneMappingState } from './ToneMappingControl';
import { PARState, DEFAULT_PAR_STATE, isPARActive, calculatePARCorrectedWidth } from '../../utils/media/PixelAspectRatio';
import { Logger } from '../../utils/Logger';
import { BackgroundPatternState, DEFAULT_BACKGROUND_PATTERN_STATE, drawBackgroundPattern, PATTERN_COLORS } from './BackgroundPatternControl';
import { FrameInterpolator } from '../../utils/media/FrameInterpolator';
import {
  isViewerContentElement as isViewerContentElementUtil,
} from './ViewerInteraction';
import {
  drawWithTransform as drawWithTransformUtil,
  FilterStringCache,
  getCanvasFilterString as getCanvasFilterStringUtil,
  buildContainerFilterString,
  drawPlaceholder as drawPlaceholderUtil,
  calculateDisplayDimensions,
  getEffectiveDimensions,
} from './ViewerRenderingUtils';
import {
  createExportCanvas as createExportCanvasUtil,
  createSourceExportCanvas as createSourceExportCanvasUtil,
  renderFrameToCanvas as renderFrameToCanvasUtil,
  renderSourceToImageData as renderSourceToImageDataUtil,
} from './ViewerExport';
import type { FrameburnTimecodeOptions } from './FrameburnCompositor';
import {
  createFrameLoader,
  buildEffectsState,
  getPrerenderStats as getPrerenderStatsUtil,
  PrerenderStats,
  EFFECTS_DEBOUNCE_MS,
} from './ViewerPrerender';
import { ViewerInputHandler } from './ViewerInputHandler';
import { InteractionQualityManager } from './InteractionQualityManager';

export interface ViewerConfig {
  session: Session;
  paintEngine: PaintEngine;
  capabilities?: DisplayCapabilities;
  // Optional overrides for testing / dependency injection
  transformManager?: TransformManager;
  colorPipeline?: ColorPipelineManager;
  wipeManager?: WipeManager;
  ghostFrameManager?: GhostFrameManager;
  lensDistortionManager?: LensDistortionManager;
  perspectiveCorrectionManager?: PerspectiveCorrectionManager;
  stereoManager?: StereoManager;
}

const log = new Logger('Viewer');
const MIN_PAINT_OVERDRAW_PX = 128;
const PAINT_OVERDRAW_STEP_PX = 64;
const MISSING_FRAME_MODE_STORAGE_KEY = 'openrv.missingFrameMode';

export type MissingFrameMode = 'off' | 'show-frame' | 'hold' | 'black';

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

  // Transform manager (owns pan/zoom/rotation/flip/animation state)
  private transformManager: TransformManager;

  // Input handler (owns pointer/wheel/drag-drop events, pan/zoom interaction, live paint state)
  private inputHandler!: ViewerInputHandler;

  // Interaction quality tiering (reduces GL viewport during zoom/scrub)
  private interactionQuality: InteractionQualityManager;

  // Source dimensions for coordinate conversion
  private sourceWidth = 0;
  private sourceHeight = 0;

  // Display dimensions
  private displayWidth = 0;
  private displayHeight = 0;

  // Physical (DPR-scaled) dimensions for the GL canvas
  private physicalWidth = 0;
  private physicalHeight = 0;

  // Paint overlay dimensions/offsets in logical pixels.
  private paintLogicalWidth = 0;
  private paintLogicalHeight = 0;
  private paintOffsetX = 0;
  private paintOffsetY = 0;

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

  // Generation counter for async effects — incremented on each render() call
  // so that stale async operations can detect they've been superseded and bail out.
  private _asyncEffectsGeneration = 0;

  // Video frame fetch tracking (pending fetches, mediabunny frame state, source B cache)
  private frameFetchTracker = new VideoFrameFetchTracker();

  // Color pipeline manager (owns all color correction state)
  private colorPipeline: ColorPipelineManager;

  // Wipe + split-screen comparison manager
  private wipeManager: WipeManager;

  // LUT indicator badge (UI element, remains in Viewer)
  private lutIndicator: HTMLElement | null = null;
  private pipelinePrecacheLUTActive = false;

  // A/B Compare indicator
  private abIndicator: HTMLElement | null = null;

  // 2D Transform -> moved to transformManager

  // Filter effects
  private filterSettings: FilterSettings = { ...DEFAULT_FILTER_SETTINGS };
  private noiseReductionParams: NoiseReductionParams = { ...DEFAULT_NOISE_REDUCTION_PARAMS };
  private sharpenProcessor: WebGLSharpenProcessor | null = null;

  // Gamut mapping
  private gamutMappingState: GamutMappingState = { ...DEFAULT_GAMUT_MAPPING_STATE };

  // Deinterlace preview
  private deinterlaceParams: DeinterlaceParams = { ...DEFAULT_DEINTERLACE_PARAMS };

  // Film emulation
  private filmEmulationParams: FilmEmulationParams = { ...DEFAULT_FILM_EMULATION_PARAMS };

  // Stabilization preview
  private stabilizationParams: StabilizationParams = { ...DEFAULT_STABILIZATION_PARAMS };

  // Crop manager (owns crop/uncrop state, overlay, and drag interaction)
  private cropManager!: CropManager;

  // Overlay manager (owns safe areas, matte, timecode, pixel probe,
  // false color, luminance visualization, zebra stripes, clipping, spotlight)
  private overlayManager!: OverlayManager;
  private watermarkOverlay: WatermarkOverlay;
  private missingFrameOverlay: MissingFrameOverlay;
  private missingFrameMode: MissingFrameMode = 'show-frame';

  // Lift/Gamma/Gain color wheels
  private colorWheels: ColorWheels;

  // HSL Qualifier (secondary color correction)
  private hslQualifier: HSLQualifier;

  // CDL state -> moved to colorPipeline
  // Color curves state -> moved to colorPipeline

  // Lens distortion manager (owns lens correction state)
  private lensDistortionManager: LensDistortionManager;

  // Perspective correction manager (owns perspective warp state)
  private perspectiveCorrectionManager: PerspectiveCorrectionManager;
  private perspectiveGridOverlay: PerspectiveGridOverlay;

  // Stack/composite state
  private stackLayers: StackLayer[] = [];
  private stackEnabled = false;

  // Channel isolation state
  private channelMode: ChannelMode = 'rgb';

  // Stereo manager (owns stereo/3D viewing state)
  private stereoManager: StereoManager;

  // Difference matte state
  private differenceMatteState: DifferenceMatteState = { ...DEFAULT_DIFFERENCE_MATTE_STATE };
  private blendModeState: BlendModeState & { flickerFrame: 0 | 1 } = {
    ...DEFAULT_BLEND_MODE_STATE,
    flickerFrame: 0,
  };

  // Ghost frame manager (owns onion skin state + canvas pool)
  private ghostFrameManager: GhostFrameManager;

  // Tone mapping state -> moved to colorPipeline

  // Pixel Aspect Ratio state
  private parState: PARState = { ...DEFAULT_PAR_STATE };

  // Background pattern state (for alpha visualization)
  private backgroundPatternState: BackgroundPatternState = { ...DEFAULT_BACKGROUND_PATTERN_STATE };

  // Display color management state -> moved to colorPipeline

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

  // Pixel sampling manager (cursor color callback, probe handlers, source image cache)
  private pixelSamplingManager!: PixelSamplingManager;

  // Theme change listener for runtime theme updates
  private boundOnThemeChange: (() => void) | null = null;

  // Display capabilities for wide color gamut / HDR support
  private capabilities: DisplayCapabilities | undefined;
  private canvasColorSpace: 'display-p3' | undefined;

  // WebGL/HDR rendering manager (owns GL canvas, Renderer, worker proxy)
  private glRendererManager!: ViewerGLRenderer;

  /**
   * Create a GLRendererContext adapter that the ViewerGLRenderer uses
   * to access Viewer state without tight coupling.
   */
  private asGLRendererContext(): GLRendererContext {
    return {
      getCanvasContainer: () => this.canvasContainer,
      getImageCanvas: () => this.imageCanvas,
      getPaintCanvas: () => this.paintCanvas,
      getColorPipeline: () => this.colorPipeline,
      getTransformManager: () => this.transformManager,
      getFilterSettings: () => this.filterSettings,
      getChannelMode: () => this.channelMode,
      getBackgroundPatternState: () => this.backgroundPatternState,
      getColorWheels: () => this.colorWheels,
      getFalseColor: () => this.overlayManager.getFalseColor(),
      getZebraStripes: () => this.overlayManager.getZebraStripes(),
      getHSLQualifier: () => this.hslQualifier,
      getSession: () => this.session,
      applyColorFilters: () => this.applyColorFilters(),
      scheduleRender: () => this.scheduleRender(),
      isToneMappingEnabled: () => this.isToneMappingEnabled(),
      getDeinterlaceParams: () => this.getDeinterlaceParams(),
      getFilmEmulationParams: () => this.getFilmEmulationParams(),
      getPerspectiveParams: () => this.getPerspectiveParams(),
      getGamutMappingState: () => this.getGamutMappingState(),
      getNoiseReductionParams: () => this.getNoiseReductionParams(),
    };
  }

  /**
   * Create an adapter that the ViewerInputHandler uses to access Viewer
   * state and invoke side-effects without tight coupling.
   */
  private asInputContext(): import('./ViewerInputHandler').ViewerInputContext {
    return {
      getContainer: () => this.container,
      getCanvasContainer: () => this.canvasContainer,
      getImageCanvas: () => this.imageCanvas,
      getPaintCanvas: () => this.paintCanvas,
      getPaintCtx: () => this.paintCtx,
      getDisplayWidth: () => this.displayWidth,
      getDisplayHeight: () => this.displayHeight,
      getSourceWidth: () => this.sourceWidth,
      getSourceHeight: () => this.sourceHeight,
      getContainerRect: () => this.getContainerRect(),
      getCanvasContainerRect: () => this.getCanvasContainerRect(),
      getImageCanvasRect: () => this.getImageCanvasRect(),
      getTransformManager: () => this.transformManager,
      getWipeManager: () => this.wipeManager,
      getCropManager: () => this.cropManager,
      getPaintEngine: () => this.paintEngine,
      getPaintRenderer: () => this.paintRenderer,
      getSession: () => this.session,
      getPixelProbe: () => this.overlayManager.getPixelProbe(),
      getInteractionQuality: () => this.interactionQuality,
      isViewerContentElement: (el: HTMLElement) => this.isViewerContentElement(el),
      scheduleRender: () => this.scheduleRender(),
      updateCanvasPosition: () => this.updateCanvasPosition(),
      renderPaint: () => this.renderPaint(),
    };
  }

  constructor(config: ViewerConfig) {
    this.capabilities = config.capabilities;
    this.canvasColorSpace = this.capabilities?.canvasP3 ? 'display-p3' : undefined;
    this.session = config.session;
    this.paintEngine = config.paintEngine;
    this.paintRenderer = new PaintRenderer(this.canvasColorSpace);

    // Initialize managers from config or create defaults
    this.transformManager = config.transformManager ?? new TransformManager();
    this.colorPipeline = config.colorPipeline ?? new ColorPipelineManager();
    this.wipeManager = config.wipeManager ?? new WipeManager();
    this.ghostFrameManager = config.ghostFrameManager ?? new GhostFrameManager();
    this.lensDistortionManager = config.lensDistortionManager ?? new LensDistortionManager();
    this.perspectiveCorrectionManager = config.perspectiveCorrectionManager ?? new PerspectiveCorrectionManager();
    this.stereoManager = config.stereoManager ?? new StereoManager();
    this.watermarkOverlay = new WatermarkOverlay();
    this.missingFrameOverlay = new MissingFrameOverlay();
    this.missingFrameMode = this.loadMissingFrameModePreference();

    // Wire up transform manager's render callback
    this.transformManager.setScheduleRender(() => this.scheduleRender());

    // Initialize interaction quality tiering
    this.interactionQuality = new InteractionQualityManager();
    this.interactionQuality.setOnQualityChange(() => this.scheduleRender());

    // Wire up transform manager interaction callbacks for smooth zoom animations
    this.transformManager.setInteractionCallbacks(
      () => this.interactionQuality.beginInteraction(),
      () => this.interactionQuality.endInteraction(),
    );

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
    this.canvasContainer.dataset.testid = 'viewer-canvas-container';
    this.canvasContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    `;
    this.container.appendChild(this.canvasContainer);

    // Create image canvas (bottom layer)
    this.imageCanvas = document.createElement('canvas');
    this.imageCanvas.dataset.testid = 'viewer-image-canvas';
    this.imageCanvas.style.cssText = `
      display: block;
      background: #000;
    `;
    this.canvasContainer.appendChild(this.imageCanvas);

    // Create WebGL/HDR rendering manager and its GL canvas (between image canvas and paint canvas)
    this.glRendererManager = new ViewerGLRenderer(this.asGLRendererContext(), this.capabilities);
    this.canvasContainer.appendChild(this.glRendererManager.createGLCanvas());

    // Async WebGPU HDR detection: when the display supports HDR but WebGL2 has no
    // native HDR output (no HLG/PQ/extended), probe WebGPU for HDR blit fallback.
    // If WebGPU fails, try Canvas2D HDR blit as last resort.
    if (this.capabilities?.displayHDR &&
        !this.capabilities?.webglHLG && !this.capabilities?.webglPQ &&
        !(this.capabilities?.webglDrawingBufferStorage && this.capabilities?.canvasExtendedHDR)) {
      const tryCanvas2DFallback = () => {
        if (this.capabilities && (this.capabilities.canvasHLG || this.capabilities.canvasFloat16)) {
          console.log('[Viewer] Trying Canvas2D HDR blit as last resort');
          this.glRendererManager.initCanvas2DHDRBlit();
        }
      };

      if (this.capabilities?.webgpuAvailable) {
        detectWebGPUHDR().then(available => {
          if (available && this.capabilities) {
            this.capabilities.webgpuHDR = available;
            console.log('[Viewer] WebGPU HDR available, initializing blit');
            this.glRendererManager.initWebGPUHDRBlit();
          } else {
            tryCanvas2DFallback();
          }
        }).catch(() => { tryCanvas2DFallback(); });
      } else {
        tryCanvas2DFallback();
      }
    }

    // Create paint canvas (top layer, overlaid)
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.dataset.testid = 'viewer-paint-canvas';
    this.paintCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
    `;
    this.canvasContainer.appendChild(this.paintCanvas);

    // Create perspective grid overlay
    this.perspectiveGridOverlay = new PerspectiveGridOverlay();
    this.canvasContainer.appendChild(this.perspectiveGridOverlay.getElement());

    // Create crop manager (creates and appends crop overlay canvas)
    this.cropManager = new CropManager({
      container: this.container,
      canvasContainer: this.canvasContainer,
      getSession: () => this.session,
      getDisplayDimensions: () => ({ width: this.displayWidth, height: this.displayHeight }),
      getSourceDimensions: () => ({ width: this.sourceWidth, height: this.sourceHeight }),
      scheduleRender: () => this.scheduleRender(),
    }, this.canvasColorSpace);

    // Create overlay manager (safe areas, matte, timecode, pixel probe,
    // false color, luminance visualization, zebra stripes, clipping, spotlight)
    this.overlayManager = new OverlayManager(this.canvasContainer, this.session, {
      refresh: () => this.refresh(),
      onProbeStateChanged: (enabled) => this.updateCursorForProbe(enabled),
    });

    // Missing-frame overlay (rendered above image canvas when sequence gaps are encountered)
    this.canvasContainer.appendChild(this.missingFrameOverlay.render());

    // Re-render when watermark settings change
    this.watermarkOverlay.on('stateChanged', () => {
      this.scheduleRender();
    });

    // Create pixel sampling manager (cursor color, probe mouse handlers, source image cache)
    this.pixelSamplingManager = new PixelSamplingManager({
      pixelProbe: this.overlayManager.getPixelProbe(),
      getGLRenderer: () => this.glRendererManager.glRenderer,
      getRenderWorkerProxy: () => this.glRendererManager.renderWorkerProxy,
      isAsyncRenderer: () => this.glRendererManager.isAsyncRenderer,
      isHDRRenderActive: () => this.glRendererManager.hdrRenderActive,
      isSDRWebGLRenderActive: () => this.glRendererManager.sdrWebGLRenderActive,
      getImageCanvas: () => this.imageCanvas,
      getImageCtx: () => this.imageCtx,
      getSession: () => this.session,
      getDisplayDimensions: () => ({ width: this.displayWidth, height: this.displayHeight }),
      getCanvasColorSpace: () => this.canvasColorSpace,
      getImageCanvasRect: () => this.getImageCanvasRect(),
      isViewerContentElement: (element: HTMLElement) => this.isViewerContentElement(element),
      drawWithTransform: (ctx, element, w, h) => this.drawWithTransform(ctx, element, w, h),
      getLastRenderedImage: () => this.glRendererManager.lastRenderedImage,
      getLastHDRBlitFrame: () => this.glRendererManager.lastHDRBlitFrame,
      isPlaying: () => this.session.isPlaying,
    });

    // Create color wheels
    this.colorWheels = new ColorWheels(this.container);
    this.colorWheels.on('stateChanged', () => {
      this.notifyEffectsChanged();
      this.refresh();
    });

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

    // Create wipe + split screen UI elements
    this.wipeManager.initUI(this.container);

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
      // Source switching during playback reuses stale frame-fetch state unless reset.
      this.frameFetchTracker.reset();
      this.scheduleRender();
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

    // Create input handler (pointer/wheel/drag-drop events, pan/zoom, live paint)
    this.inputHandler = new ViewerInputHandler(
      this.asInputContext(),
      this.dropOverlay,
    );

    this.bindEvents();
    this.initializeCanvas();
    this.inputHandler.updateCursor(this.paintEngine.tool);

    // Initialize color pipeline GPU resources
    this.colorPipeline.initLUTProcessor();
    this.colorPipeline.initGPULUTChain();
    this.colorPipeline.initLUTPipelineDefaults();
    this.colorPipeline.initOCIOProcessor();
    this.syncLUTPipeline();

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

    // Configure paint canvas at physical resolution for retina annotations
    const dpr = window.devicePixelRatio || 1;
    this.physicalWidth = Math.max(1, Math.round(this.displayWidth * dpr));
    this.physicalHeight = Math.max(1, Math.round(this.displayHeight * dpr));
    const containerRect = this.getContainerRect();
    this.updatePaintCanvasSize(this.displayWidth, this.displayHeight, containerRect.width, containerRect.height);

    // Draw placeholder with hi-DPI support
    this.drawPlaceholder();
    this.updateOverlayDimensions();
    this.updateCanvasPosition();
  }

  /**
   * Set canvas size for media rendering (standard mode, no hi-DPI scaling).
   * This resets any hi-DPI configuration from placeholder mode.
   * The 2D canvases stay at logical resolution; the GL canvas is sized at
   * physical (DPR-scaled) resolution for retina sharpness.
   */
  private setCanvasSize(width: number, height: number): void {
    this.displayWidth = width;
    this.displayHeight = height;

    // Compute physical dimensions for GL path (DPR-aware)
    const dpr = window.devicePixelRatio || 1;
    this.physicalWidth = Math.max(1, Math.round(width * dpr));
    this.physicalHeight = Math.max(1, Math.round(height * dpr));

    // Cap physical dimensions at GPU MAX_TEXTURE_SIZE (proportional to preserve aspect ratio)
    const maxSize = this.glRendererManager.getMaxTextureSize();
    if (this.physicalWidth > maxSize || this.physicalHeight > maxSize) {
      const capScale = maxSize / Math.max(this.physicalWidth, this.physicalHeight);
      this.physicalWidth = Math.max(1, Math.round(this.physicalWidth * capScale));
      this.physicalHeight = Math.max(1, Math.round(this.physicalHeight * capScale));
    }

    // Reset image canvas at LOGICAL resolution (no DPR scaling for CPU effects)
    resetCanvasFromHiDPI(this.imageCanvas, this.imageCtx, width, height);

    // Paint canvas at PHYSICAL resolution with CSS logical sizing for retina annotations
    const containerRect = this.getContainerRect();
    this.updatePaintCanvasSize(width, height, containerRect.width, containerRect.height);

    this.cropManager.resetOverlayCanvas(width, height);

    // Resize WebGL canvas at PHYSICAL resolution for retina sharpness.
    // Pass logical (display) dims for exact CSS sizing (avoids rounding drift).
    this.glRendererManager.resizeIfActive(this.physicalWidth, this.physicalHeight, width, height);

    this.updateOverlayDimensions();
    this.perspectiveGridOverlay.setViewerDimensions(width, height);
    this.updateCanvasPosition();
  }

  /**
   * Configure the paint canvas with extra padding around the image so
   * annotations can be drawn outside image bounds (OpenRV-compatible).
   */
  private updatePaintCanvasSize(
    logicalWidth: number,
    logicalHeight: number,
    containerWidth?: number,
    containerHeight?: number,
  ): void {
    const viewW = (containerWidth && containerWidth > 0) ? containerWidth : logicalWidth;
    const viewH = (containerHeight && containerHeight > 0) ? containerHeight : logicalHeight;

    const centerX = (viewW - logicalWidth) / 2 + this.transformManager.panX;
    const centerY = (viewH - logicalHeight) / 2 + this.transformManager.panY;

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

    if (
      this.paintLogicalWidth === nextLogicalW &&
      this.paintLogicalHeight === nextLogicalH &&
      this.paintOffsetX === leftPad &&
      this.paintOffsetY === topPad &&
      this.paintCanvas.width === nextPhysicalW &&
      this.paintCanvas.height === nextPhysicalH
    ) {
      return;
    }

    this.paintLogicalWidth = nextLogicalW;
    this.paintLogicalHeight = nextLogicalH;
    this.paintOffsetX = leftPad;
    this.paintOffsetY = topPad;

    this.paintCanvas.width = nextPhysicalW;
    this.paintCanvas.height = nextPhysicalH;
    this.paintCanvas.style.width = `${nextLogicalW}px`;
    this.paintCanvas.style.height = `${nextLogicalH}px`;
    this.paintCanvas.style.left = `${-leftPad}px`;
    this.paintCanvas.style.top = `${-topPad}px`;
    this.paintCtx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Update overlay dimensions to match display size.
   */
  private updateOverlayDimensions(): void {
    this.overlayManager.updateDimensions(this.displayWidth, this.displayHeight);
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
    drawPlaceholderUtil(this.imageCtx, this.displayWidth, this.displayHeight, this.transformManager.zoom);
  }

  private bindEvents(): void {
    // Pointer, wheel, drag-drop, and context menu events (delegated to input handler)
    this.inputHandler.bindEvents();

    // Session events
    this.session.on('sourceLoaded', () => {
      this.frameFetchTracker.reset();
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
      if (this.glRendererManager.isAsyncRenderer && this.glRendererManager.renderWorkerProxy) {
        const source = this.session.currentSource;
        if (source?.element && !(source.fileSourceNode?.isHDR()) && !(source.videoSourceNode?.isHDR())) {
          this.glRendererManager.renderWorkerProxy.prepareFrame(source.element as unknown as HTMLImageElement);
        }
      }

      this.scheduleRender();
    });

    // Paint events
    this.paintEngine.on('annotationsChanged', () => this.renderPaint());
    this.paintEngine.on('toolChanged', (tool) => this.inputHandler.updateCursor(tool));

    // Pixel probe + cursor color events - single handler for both consumers
    this.container.addEventListener('mousemove', this.pixelSamplingManager.onMouseMoveForPixelSampling);
    this.container.addEventListener('mouseleave', this.pixelSamplingManager.onMouseLeaveForCursorColor);
    this.container.addEventListener('click', this.pixelSamplingManager.onClickForProbe);

    // Listen for DPR changes (window moved between displays).
    // matchMedia fires only when the query transitions from match→no-match,
    // so we must re-register with the new DPR value after each change.
    this.listenForDPRChange();
  }

  /**
   * Listen for DPR changes (user moves window between displays).
   * Re-registers the listener after each change since the media query
   * is tied to a specific DPR value.
   */
  private _dprCleanup: (() => void) | null = null;
  private listenForDPRChange(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const onDPRChange = () => {
      // Recompute physical dims and re-render
      if (this.displayWidth > 0 && this.displayHeight > 0) {
        const dpr = window.devicePixelRatio || 1;
        this.physicalWidth = Math.max(1, Math.round(this.displayWidth * dpr));
        this.physicalHeight = Math.max(1, Math.round(this.displayHeight * dpr));
        this.glRendererManager.resizeIfActive(this.physicalWidth, this.physicalHeight);
        const containerRect = this.getContainerRect();
        this.updatePaintCanvasSize(this.displayWidth, this.displayHeight, containerRect.width, containerRect.height);
        this.scheduleRender();
      }
      // Re-register for the new DPR value
      this.listenForDPRChange();
    };

    // Clean up previous listener
    this._dprCleanup?.();

    const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mql.addEventListener('change', onDPRChange, { once: true });
    this._dprCleanup = () => mql.removeEventListener('change', onDPRChange);
  }

  /**
   * Update cursor when pixel probe state changes
   */
  private updateCursorForProbe(enabled: boolean): void {
    this.inputHandler.updateCursorForProbe(enabled);
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
      this.cropManager.getOverlayElement(),
      this.wipeManager.wipeLine,
      this.wipeManager.splitLine
    );
  }

  // Interaction methods (getCanvasPoint, pointer/wheel/drag handlers, live stroke/shape,
  // pinch zoom, cursor management) have been extracted to ViewerInputHandler.

  getElement(): HTMLElement {
    return this.container;
  }

  private scheduleRender(): void {
    // During video playback, the tick loop handles all rendering via renderDirect().
    // Skip scheduling to prevent render storm that starves the video decoder.
    if (this.session.isPlaying) return;

    if (this.pendingRender) return;
    this.pendingRender = true;

    requestAnimationFrame(() => {
      // Skip if renderDirect() already cleared pendingRender and rendered
      if (!this.pendingRender) return;
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

  private loadMissingFrameModePreference(): MissingFrameMode {
    try {
      const stored = localStorage.getItem(MISSING_FRAME_MODE_STORAGE_KEY);
      if (stored === 'off' || stored === 'show-frame' || stored === 'hold' || stored === 'black') {
        return stored;
      }
    } catch {
      // Ignore storage errors (private mode, disabled storage, etc.)
    }
    return 'show-frame';
  }

  private persistMissingFrameModePreference(): void {
    try {
      localStorage.setItem(MISSING_FRAME_MODE_STORAGE_KEY, this.missingFrameMode);
    } catch {
      // Ignore storage errors
    }
  }

  private updateMissingFrameOverlay(frameNumber: number | null): void {
    if (frameNumber === null || this.missingFrameMode === 'off') {
      this.missingFrameOverlay.hide();
      return;
    }
    this.missingFrameOverlay.show(frameNumber);
  }

  private getMissingSequenceFrameNumber(frameIndex: number): number | null {
    const source = this.session.currentSource;
    if (source?.type !== 'sequence' || !source.sequenceFrames || source.sequenceFrames.length < 2) {
      return null;
    }

    const idx = frameIndex - 1;
    if (idx <= 0 || idx >= source.sequenceFrames.length) {
      return null;
    }

    const previousFrameNumber = source.sequenceFrames[idx - 1]?.frameNumber;
    const currentFrameNumber = source.sequenceFrames[idx]?.frameNumber;
    if (previousFrameNumber === undefined || currentFrameNumber === undefined) {
      return null;
    }

    if (currentFrameNumber - previousFrameNumber <= 1) {
      return null;
    }

    const candidate = previousFrameNumber + 1;
    const missingFrames = source.sequenceInfo?.missingFrames ?? [];
    if (missingFrames.length === 0 || missingFrames.includes(candidate)) {
      return candidate;
    }

    const between = missingFrames.find((frame) => frame > previousFrameNumber && frame < currentFrameNumber);
    return between ?? candidate;
  }

  /**
   * Render immediately without scheduling via requestAnimationFrame.
   * Used by the playback loop (App.tick) which already runs inside rAF,
   * avoiding the double-rAF delay that would halve effective frame throughput.
   */
  renderDirect(): void {
    this.pendingRender = false;
    this.render();
  }

  fitToWindow(): void {
    this.transformManager.fitToWindow();
    this.scheduleRender();
  }

  /**
   * Fit to window with a smooth animated transition.
   */
  smoothFitToWindow(): void {
    this.transformManager.smoothFitToWindow();
  }

  setZoom(level: number): void {
    this.transformManager.setZoom(level);
    this.scheduleRender();
  }

  /**
   * Set zoom with a smooth animated transition.
   */
  smoothSetZoom(level: number): void {
    this.transformManager.smoothSetZoom(level);
  }

  /**
   * Animate zoom smoothly to a target level over a given duration.
   * Uses requestAnimationFrame with ease-out cubic interpolation.
   * Also animates pan position to the target values.
   */
  smoothZoomTo(
    targetZoom: number,
    duration: number = 200,
    targetPanX?: number,
    targetPanY?: number
  ): void {
    this.transformManager.smoothZoomTo(targetZoom, duration, targetPanX, targetPanY);
  }

  /**
   * Cancel any in-progress smooth zoom animation.
   * The zoom remains at whatever intermediate value it reached.
   */
  cancelZoomAnimation(): void {
    this.transformManager.cancelZoomAnimation();
  }

  /**
   * Check if a smooth zoom animation is currently in progress.
   */
  isZoomAnimating(): boolean {
    return this.transformManager.isZoomAnimating();
  }

  private updateCanvasPosition(): void {
    const containerRect = this.getContainerRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Calculate base position (centered)
    const baseX = (containerWidth - this.displayWidth) / 2;
    const baseY = (containerHeight - this.displayHeight) / 2;

    // Apply pan offset
    const centerX = baseX + this.transformManager.panX;
    const centerY = baseY + this.transformManager.panY;

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
    // Bump generation so any in-flight async effects from a previous render() are cancelled.
    this._asyncEffectsGeneration++;
    // Invalidate layout cache once per frame - measurements are cached within the frame
    this.invalidateLayoutCache();

    PerfTrace.count('render.calls');
    this.renderImage();

    // If actively drawing, render with live stroke/shape; otherwise just paint
    PerfTrace.begin('paint+crop');
    if (this.inputHandler.drawing && this.inputHandler.currentLivePoints.length > 0) {
      this.inputHandler.renderLiveStroke();
    } else if (this.inputHandler.drawingShape && this.inputHandler.currentShapeStart && this.inputHandler.currentShapeCurrent) {
      this.inputHandler.renderLiveShape();
    } else {
      this.renderPaint();
    }

    // Render crop overlay if enabled
    try {
      this.cropManager.renderCropOverlay();
    } catch (err) {
      console.error('Crop overlay render failed:', err);
    }
    PerfTrace.end('paint+crop');
  }

  // GL rendering methods delegated to ViewerGLRenderer.
  // These wrappers forward physical (DPR-scaled) dimensions to the GL renderer,
  // reduced by interaction quality factor during active zoom/scrub for responsiveness.
  // The canvas buffer is resized to reduced dims while CSS stays at full logical
  // size — the browser upscales the smaller buffer, providing fluid interaction.
  private renderHDRWithWebGL(image: import('../../core/image/Image').IPImage, _displayWidth: number, _displayHeight: number) {
    const { w, h } = this.interactionQuality.getEffectiveViewport(this.physicalWidth, this.physicalHeight);
    return this.glRendererManager.renderHDRWithWebGL(image, w, h);
  }
  private deactivateHDRMode() { this.glRendererManager.deactivateHDRMode(); }
  private deactivateSDRWebGLMode() { this.glRendererManager.deactivateSDRWebGLMode(); }
  private hasGPUShaderEffectsActive() { return this.glRendererManager.hasGPUShaderEffectsActive(); }
  private hasCPUOnlyEffectsActive() { return this.glRendererManager.hasCPUOnlyEffectsActive(); }
  private renderSDRWithWebGL(
    source: HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap,
    _displayWidth: number,
    _displayHeight: number,
  ) {
    const { w, h } = this.interactionQuality.getEffectiveViewport(this.physicalWidth, this.physicalHeight);
    return this.glRendererManager.renderSDRWithWebGL(source, w, h);
  }

  private renderImage(): void {
    const source = this.session.currentSource;

    // Deactivate HDR mode if current source isn't HDR, or if OCIO is active
    // (unless WebGPU blit bypasses OCIO for HDR output)
    const isCurrentHDR = source?.fileSourceNode?.isHDR() === true || source?.videoSourceNode?.isHDR() === true;
    const ocioActive = this.colorPipeline.ocioEnabled && this.colorPipeline.ocioBakedLUT !== null;
    const blitBypassesOCIO = this.glRendererManager.isWebGPUBlitReady;
    if (this.glRendererManager.hdrRenderActive && (!isCurrentHDR || (ocioActive && !blitBypassesOCIO))) {
      this.deactivateHDRMode();
    }

    // Deactivate SDR WebGL mode if current source is HDR (HDR path takes over)
    if (isCurrentHDR && this.glRendererManager.sdrWebGLRenderActive) {
      this.deactivateSDRWebGLMode();
    }

    // Get container size (cached per frame)
    const containerRect = this.getContainerRect();
    const containerWidth = containerRect.width || 640;
    const containerHeight = containerRect.height || 360;

    // For sequences and videos with mediabunny, get the current frame
    let element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | undefined;
    let forceBlackFrame = false;
    this.updateMissingFrameOverlay(null);
    if (source?.type === 'sequence') {
      const currentFrame = this.session.currentFrame;
      const missingFrameNumber = this.getMissingSequenceFrameNumber(currentFrame);
      const hasMissingFrame = missingFrameNumber !== null && this.missingFrameMode !== 'off';
      this.updateMissingFrameOverlay(missingFrameNumber);

      if (hasMissingFrame && this.missingFrameMode === 'black') {
        forceBlackFrame = true;
      } else if (hasMissingFrame && this.missingFrameMode === 'hold') {
        const holdFrame = this.session.getSequenceFrameSync(Math.max(1, currentFrame - 1));
        element = holdFrame ?? source.element;
      } else {
        const frameImage = this.session.getSequenceFrameSync();
        if (frameImage) {
          element = frameImage;
        } else {
          // Frame not loaded yet - trigger async load
          this.session.getSequenceFrameImage()
            .then((image) => {
              if (image) {
                this.refresh();
              }
            })
            .catch((err) => console.warn('Failed to load sequence frame:', err));
          // Use first frame as fallback if available
          element = source.element;
        }
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
        this.frameFetchTracker.hasDisplayedMediabunnyFrame = true;
        this.frameFetchTracker.pendingVideoFrameFetch = null;
        this.frameFetchTracker.pendingVideoFrameNumber = 0;
      } else {
        // Frame not cached - fetch it asynchronously
        // Start a new fetch if:
        // 1. No fetch is pending, OR
        // 2. The pending fetch is for a different frame (user navigated)
        if (!this.frameFetchTracker.pendingVideoFrameFetch || this.frameFetchTracker.pendingVideoFrameNumber !== currentFrame) {
          // Cancel tracking of old fetch (it will complete but we'll ignore its refresh)
          this.frameFetchTracker.pendingVideoFrameNumber = currentFrame;
          const frameToFetch = currentFrame;

          this.frameFetchTracker.pendingVideoFrameFetch = this.session.fetchCurrentVideoFrame(frameToFetch)
            .then(() => {
              // Only refresh if this fetch is still relevant (user hasn't navigated away)
              if (this.frameFetchTracker.pendingVideoFrameNumber === frameToFetch) {
                this.frameFetchTracker.pendingVideoFrameFetch = null;
                this.frameFetchTracker.pendingVideoFrameNumber = 0;
                this.refresh();
              }
            })
            .catch((err) => {
              log.warn('Failed to fetch video frame', err);
              if (this.frameFetchTracker.pendingVideoFrameNumber === frameToFetch) {
                this.frameFetchTracker.pendingVideoFrameFetch = null;
                this.frameFetchTracker.pendingVideoFrameNumber = 0;
              }
            });
        }

        // Only use HTMLVideoElement fallback on first render (before any mediabunny frame shown)
        // After that, keep previous frame to ensure frame-accurate stepping
        if (!this.frameFetchTracker.hasDisplayedMediabunnyFrame) {
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
        element = source.fileSourceNode.getCanvas()
          ?? source.fileSourceNode.getElement(0)
          ?? undefined;
      }
      // For HDR: element stays undefined here; we intercept after displayWidth/Height are calculated
    } else {
      // Fallback: use HTMLVideoElement directly (no mediabunny)
      element = source?.element;
    }

    // HDR sources may have no element (they render via WebGL); treat them as valid
    const hdrFileSource = source?.fileSourceNode?.isHDR() ? source.fileSourceNode : null;
    const isHDRVideo = source?.videoSourceNode?.isHDR() === true;
    if (!source || (!element && !hdrFileSource && !isHDRVideo)) {
      // Placeholder mode
      this.sourceWidth = 640;
      this.sourceHeight = 360;

      const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
        this.sourceWidth,
        this.sourceHeight,
        containerWidth,
        containerHeight,
        this.transformManager.zoom
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
    const uncropPad = this.cropManager.getUncropPadding();
    const uncropActive = this.isUncropActive();
    const baseWidth = uncropActive ? this.sourceWidth + uncropPad.left + uncropPad.right : this.sourceWidth;
    const virtualHeight = uncropActive ? this.sourceHeight + uncropPad.top + uncropPad.bottom : this.sourceHeight;

    // Apply PAR correction: scale virtual width by pixel aspect ratio
    const parActive = isPARActive(this.parState);
    const virtualWidth = parActive ? calculatePARCorrectedWidth(baseWidth, this.parState.par) : baseWidth;

    // Apply rotation to get effective dimensions for layout (90/270 swaps width/height)
    const userRotation = this.transformManager.transform.rotation;
    const { width: effectiveWidth, height: effectiveHeight } = getEffectiveDimensions(
      virtualWidth,
      virtualHeight,
      userRotation
    );

    const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
      effectiveWidth,
      effectiveHeight,
      containerWidth,
      containerHeight,
      this.transformManager.zoom
    );

    // Scale factor from effective source to display pixels
    const uncropScaleX = uncropActive ? displayWidth / effectiveWidth : 1;
    const uncropScaleY = uncropActive ? displayHeight / effectiveHeight : 1;
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

    // Phase 4: Set target extraction size for SDR video frame cache.
    // Uses quality-reduced physical dims so frames are extracted at display resolution,
    // not full source resolution. Capped at source dims (never upscale during extraction).
    if (source.videoSourceNode && this.physicalWidth > 0 && this.physicalHeight > 0) {
      const { w, h } = this.interactionQuality.getEffectiveViewport(this.physicalWidth, this.physicalHeight);
      const cappedW = Math.min(w, source.width);
      const cappedH = Math.min(h, source.height);
      source.videoSourceNode.setTargetSize(
        cappedW < source.width || cappedH < source.height
          ? { w: cappedW, h: cappedH }
          : undefined // full resolution
      );

      // Set stable HDR target size using actual display dimensions (not interaction-reduced).
      // HDR frames are cached in an LRU and should always be at full display quality.
      const hdrW = Math.min(this.physicalWidth, source.width);
      const hdrH = Math.min(this.physicalHeight, source.height);
      source.videoSourceNode.setHDRTargetSize(
        hdrW < source.width || hdrH < source.height
          ? { w: hdrW, h: hdrH }
          : undefined
      );
    }

    // HDR WebGL rendering path: render via GPU shader pipeline and skip 2D canvas.
    // When OCIO is active, normally skip the WebGL path and fall through to the
    // 2D canvas where applyOCIOToCanvas() can apply the baked LUT as a post-process.
    // Exception: when the WebGPU HDR blit is ready, bypass the OCIO guard so that
    // HDR content can be displayed via the float FBO → WebGPU extended-range path.
    if (isHDRVideo && (!ocioActive || blitBypassesOCIO)) {
      // HDR video: get cached HDR IPImage with VideoFrame for GPU upload
      const currentFrame = this.session.currentFrame;
      PerfTrace.begin('getVideoHDRIPImage');
      const hdrIPImage = this.session.getVideoHDRIPImage(currentFrame);
      PerfTrace.end('getVideoHDRIPImage');
      if (!hdrIPImage) PerfTrace.count('hdrIPImage.miss');
      if (hdrIPImage && this.renderHDRWithWebGL(hdrIPImage, displayWidth, displayHeight)) {
        this.updateCanvasPosition();
        this.updateWipeLine();
        // Preload nearby HDR frames in background for smoother scrubbing.
        // Skip during playback — PlaybackEngine.update() already calls
        // updatePlaybackBuffer() which triggers preloadHDRFrames().
        if (!this.session.isPlaying) {
          this.session.preloadVideoHDRFrames(currentFrame).catch(() => {});
        }
        return; // HDR video path complete
      }
      // Start async HDR frame fetch if not cached
      if (!hdrIPImage) {
        this.session.fetchVideoHDRFrame(currentFrame)
          .then(() => this.refresh())
          .catch((err) => console.warn('Failed to fetch HDR video frame:', err));
      }
      // Fall through to SDR while waiting (element was set by the video path above)
    } else if (hdrFileSource && (!ocioActive || blitBypassesOCIO)) {
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
    } else if (hdrFileSource) {
      // OCIO is active — bypass WebGL and use 2D canvas so OCIO LUT can be applied
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
    const cropClipActiveForSDR = this.cropManager.isCropClipActive();
    const sdrWebGLEligible =
      element &&
      !isCurrentHDR &&
      !cropClipActiveForSDR &&
      this.hasGPUShaderEffectsActive() &&
      !this.hasCPUOnlyEffectsActive() &&
      !uncropActive &&
      this.wipeManager.isOff &&
      !this.isStackEnabled() &&
      !this.isBlendModeEnabled() &&
      !this.differenceMatteState.enabled &&
      !this.ghostFrameManager.enabled &&
      this.stereoManager.isDefaultStereo() &&
      this.lensDistortionManager.isDefault() &&
      !(this.colorPipeline.ocioEnabled && this.colorPipeline.ocioBakedLUT) &&
      (element instanceof HTMLImageElement ||
       element instanceof HTMLVideoElement ||
       element instanceof HTMLCanvasElement ||
       element instanceof ImageBitmap ||
       (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas));

    if (sdrWebGLEligible) {
      if (this.renderSDRWithWebGL(
        element as HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap,
        displayWidth,
        displayHeight,
      )) {
        this.updateCanvasPosition();
        this.updateWipeLine();
        return; // SDR WebGL path complete, skip 2D processing
      }
      // renderSDRWithWebGL failed — fall through to 2D canvas path
    } else if (this.glRendererManager.sdrWebGLRenderActive) {
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
      this.cropManager.drawUncropBackground(this.imageCtx, displayWidth, displayHeight, uncropOffsetX, uncropOffsetY, imageDisplayW, imageDisplayH);
    }

    // Enable high-quality image smoothing for best picture quality
    this.imageCtx.imageSmoothingEnabled = true;
    this.imageCtx.imageSmoothingQuality = 'high';

    // Check if crop clipping should be applied (will be done AFTER all rendering)
    // Note: We can't use ctx.clip() because putImageData() ignores clip regions
    let cropClipActive = this.cropManager.isCropClipActive();

    // Set target display size for prerender buffer so effects are processed at
    // display resolution instead of full source resolution (e.g., 4K → display size).
    // Cache frames remain untransformed source-space frames, so 90/270 uses
    // swapped targets to preserve source aspect before draw-time rotation.
    if (this.prerenderBuffer && displayWidth > 0 && displayHeight > 0) {
      const prerenderDisplayW = uncropActive ? imageDisplayW : displayWidth;
      const prerenderDisplayH = uncropActive ? imageDisplayH : displayHeight;
      const prerenderTargetW = userRotation === 90 || userRotation === 270 ? prerenderDisplayH : prerenderDisplayW;
      const prerenderTargetH = userRotation === 90 || userRotation === 270 ? prerenderDisplayW : prerenderDisplayH;
      this.prerenderBuffer.setTargetSize(prerenderTargetW, prerenderTargetH);
    }

    // Try prerendered cache first during playback for smooth performance with effects
    if (this.session.isPlaying && this.prerenderBuffer && !isNoiseReductionActive(this.noiseReductionParams)) {
      const currentFrame = this.session.currentFrame;
      // Note: preloadAround() is already called from the frameChanged handler,
      // so we don't duplicate it here. Only queuePriorityFrame() is called on cache miss.
      const cached = this.prerenderBuffer.getFrame(currentFrame);
      if (cached) {
        // Clear canvas before drawing cached frame (prevents stale pixels at edges)
        this.imageCtx.clearRect(0, 0, displayWidth, displayHeight);

        // Draw background pattern (shows through transparent/alpha areas)
        if (this.backgroundPatternState.pattern !== 'black') {
          drawBackgroundPattern(this.imageCtx, displayWidth, displayHeight, this.backgroundPatternState);
        }

        // When uncrop is active, fill the padding area with a subtle pattern
        if (uncropActive) {
          this.cropManager.drawUncropBackground(this.imageCtx, displayWidth, displayHeight, uncropOffsetX, uncropOffsetY, imageDisplayW, imageDisplayH);
        }

        // Draw cached pre-rendered frame with current transform.
        if (uncropActive) {
          this.imageCtx.save();
          this.imageCtx.translate(uncropOffsetX, uncropOffsetY);
          this.drawWithTransform(this.imageCtx, cached.canvas, imageDisplayW, imageDisplayH);
          this.imageCtx.restore();
        } else {
          this.drawWithTransform(this.imageCtx, cached.canvas, displayWidth, displayHeight);
        }

        // After drawing cached frame, apply effects not handled by worker
        // Render ghost frames (onion skin) on top of the main frame
        if (this.ghostFrameManager.enabled) {
          try {
            this.renderGhostFrames(displayWidth, displayHeight);
          } catch (err) {
            console.error('Ghost frame rendering failed:', err);
          }
        }

        // Apply stereo viewing mode (transforms layout for 3D viewing)
        if (!this.stereoManager.isDefaultStereo()) {
          try {
            if (this.stereoManager.needsEyeTransformApply()) {
              this.stereoManager.applyStereoModeWithEyeTransforms(this.imageCtx, displayWidth, displayHeight);
            } else {
              this.stereoManager.applyStereoMode(this.imageCtx, displayWidth, displayHeight);
            }
          } catch (err) {
            console.error('Stereo mode rendering failed:', err);
          }
        }

        // Apply lens distortion correction (geometric transform, applied before color effects)
        if (!this.lensDistortionManager.isDefault()) {
          try {
            this.lensDistortionManager.applyToCtx(this.imageCtx, displayWidth, displayHeight);
          } catch (err) {
            console.error('Lens distortion rendering failed:', err);
          }
        }
        // Apply perspective correction (after lens distortion)
        if (!this.perspectiveCorrectionManager.isDefault()) {
          try {
            this.perspectiveCorrectionManager.applyToCtx(this.imageCtx, displayWidth, displayHeight);
          } catch (err) {
            console.error('Perspective correction rendering failed:', err);
          }
        }
        // Apply GPU-accelerated color effects
        if (this.colorPipeline.currentLUT && this.colorPipeline.lutIntensity > 0) {
          try {
            this.applyLUTToCanvas(this.imageCtx, displayWidth, displayHeight);
          } catch (err) {
            console.error('LUT application failed:', err);
          }
        }
        if (this.colorPipeline.ocioEnabled && this.colorPipeline.ocioBakedLUT) {
          try {
            this.applyOCIOToCanvas(this.imageCtx, displayWidth, displayHeight);
          } catch (err) {
            console.error('OCIO application failed:', err);
          }
        }
        // Apply lightweight diagnostic overlays and display management
        try {
          this.applyLightweightEffects(this.imageCtx, displayWidth, displayHeight);
        } catch (err) {
          console.error('Lightweight effects processing failed:', err);
        }
        // Apply crop clipping by clearing outside areas
        if (cropClipActive) {
          this.cropManager.clearOutsideCropRegion(this.imageCtx, displayWidth, displayHeight);
        }
        this.updateCanvasPosition();
        this.updateWipeLine();
        return; // Skip live effect processing
      }
      // Cache miss during playback: queue for background prerender so the
      // frame is cached for future hits. The current render still falls through
      // to the full effect pipeline below for correct visuals.
      this.prerenderBuffer.queuePriorityFrame(currentFrame);
    }

    // Check if difference matte mode is enabled
    let rendered = false;
    if (forceBlackFrame) {
      this.imageCtx.fillStyle = '#000';
      this.imageCtx.fillRect(0, 0, displayWidth, displayHeight);
      rendered = true;
    }

    if (!rendered && this.isBlendModeEnabled() && this.session.abCompareAvailable) {
      const blendData = this.renderBlendMode(displayWidth, displayHeight);
      if (blendData) {
        this.compositeImageDataOverBackground(blendData, displayWidth, displayHeight);
        rendered = true;
      }
    }

    if (!rendered && this.differenceMatteState.enabled && this.session.abCompareAvailable) {
      // Render difference between A and B sources
      const diffData = this.renderDifferenceMatte(displayWidth, displayHeight);
      if (diffData) {
        this.compositeImageDataOverBackground(diffData, displayWidth, displayHeight);
        rendered = true;
      }
    }

    if (!rendered && this.wipeManager.isSplitScreen && this.session.abCompareAvailable) {
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
      element instanceof ImageBitmap ||
      (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas)
    )) {
      // Single source rendering (supports images, videos, and canvas elements from mediabunny)
      // Handle wipe rendering (but not split screen modes which are handled above)
      if (!this.wipeManager.isOff && !this.wipeManager.isSplitScreen) {
        this.renderWithWipe(element as CanvasImageSource, displayWidth, displayHeight);
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
    if (this.ghostFrameManager.enabled) {
      try {
        this.renderGhostFrames(displayWidth, displayHeight);
      } catch (err) {
        console.error('Ghost frame rendering failed:', err);
      }
    }

    // Apply post-processing effects (stereo, lens, LUT, color, sharpen) regardless of stack mode
    // Apply stereo viewing mode (transforms layout for 3D viewing)
    // Uses extended function when per-eye transforms or alignment overlays are active
    if (!this.stereoManager.isDefaultStereo()) {
      try {
        if (this.stereoManager.needsEyeTransformApply()) {
          this.stereoManager.applyStereoModeWithEyeTransforms(this.imageCtx, displayWidth, displayHeight);
        } else {
          this.stereoManager.applyStereoMode(this.imageCtx, displayWidth, displayHeight);
        }
      } catch (err) {
        console.error('Stereo mode rendering failed:', err);
      }
    }

    // Apply lens distortion correction (geometric transform, applied first)
    if (!this.lensDistortionManager.isDefault()) {
      try {
        this.lensDistortionManager.applyToCtx(this.imageCtx, displayWidth, displayHeight);
      } catch (err) {
        console.error('Lens distortion rendering failed:', err);
      }
    }

    // Apply perspective correction (after lens distortion)
    if (!this.perspectiveCorrectionManager.isDefault()) {
      try {
        this.perspectiveCorrectionManager.applyToCtx(this.imageCtx, displayWidth, displayHeight);
      } catch (err) {
        console.error('Perspective correction rendering failed:', err);
      }
    }

    // Apply multi-stage LUT chain (File / Look / Display)
    if (this.colorPipeline.gpuLUTChain?.hasAnyLUT()) {
      try {
        this.colorPipeline.gpuLUTChain.applyToCanvas(this.imageCtx, displayWidth, displayHeight);
      } catch (err) {
        console.error('Multi-stage LUT application failed:', err);
      }
    }

    // Apply 3D LUT (GPU-accelerated color grading)
    if (this.colorPipeline.currentLUT && this.colorPipeline.lutIntensity > 0) {
      try {
        this.applyLUTToCanvas(this.imageCtx, displayWidth, displayHeight);
      } catch (err) {
        console.error('LUT application failed:', err);
      }
    }

    // Apply OCIO display transform (GPU-accelerated via baked 3D LUT)
    // This runs after user-loaded LUTs but before color adjustments/CDL/curves
    if (this.colorPipeline.ocioEnabled && this.colorPipeline.ocioBakedLUT) {
      try {
        this.applyOCIOToCanvas(this.imageCtx, displayWidth, displayHeight);
      } catch (err) {
        console.error('OCIO application failed:', err);
      }
    }

    // Apply batched pixel-level effects (highlights/shadows, vibrance, clarity,
    // CDL, curves, HSL qualifier, sharpen, channel isolation, etc.)
    // This uses a single getImageData/putImageData pair for better performance.
    // Note: Cache hits already returned early above (line 2388), so this code
    // only runs on cache misses or when paused/scrubbing. Always apply full
    // effects for correct visuals — do NOT skip effects during playback cache
    // misses, as that causes effects to disappear until paused.
    // Phase 4A: Use async version when heavy inter-pixel effects (clarity/sharpen)
    // are active, to yield between passes and keep each blocking period <16ms.
    // For lightweight per-pixel-only effects, use the sync version for simplicity.
    if (
      this.colorPipeline.colorAdjustments.clarity !== 0 ||
      this.filterSettings.sharpen > 0 ||
      isNoiseReductionActive(this.noiseReductionParams)
    ) {
      // Fire-and-forget: the async method checks _asyncEffectsGeneration at each
      // yield point and bails out if a newer render() has started, preventing
      // stale pixel data from overwriting a newer frame. Crop clipping is handled
      // inside the async method (after putImageData) for the same reason.
      void this.applyBatchedPixelEffectsAsync(
        this.imageCtx, displayWidth, displayHeight,
        this._asyncEffectsGeneration, cropClipActive
      );
      // Skip the crop clipping below — it's handled inside the async method.
      cropClipActive = false;
    } else {
      try {
        this.applyBatchedPixelEffects(this.imageCtx, displayWidth, displayHeight);
      } catch (err) {
        console.error('Batched pixel effects processing failed:', err);
      }
    }

    // Apply crop clipping by clearing areas outside the crop region
    // Note: This is done AFTER all effects because putImageData() ignores ctx.clip()
    if (cropClipActive) {
      this.cropManager.clearOutsideCropRegion(this.imageCtx, displayWidth, displayHeight);
    }

    // Composite watermark last so it stays visible above image effects.
    this.watermarkOverlay.render(this.imageCtx, displayWidth, displayHeight);

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
    drawWithTransformUtil(ctx, element, displayWidth, displayHeight, this.transformManager.transform);
  }

  private renderWithWipe(
    element: CanvasImageSource,
    displayWidth: number,
    displayHeight: number
  ): void {
    const ctx = this.imageCtx;
    const pos = this.wipeManager.position;

    // Enable high-quality image smoothing for best picture quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // For wipe, we need to render both with and without filters
    // Since CSS filters apply to the whole container, we'll use canvas filter property

    ctx.save();

    if (this.wipeManager.mode === 'horizontal') {
      // Left side: original (no filter)
      // Right side: with color adjustments
      const splitX = Math.floor(displayWidth * pos);

      // Draw original (left side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, displayHeight);
      ctx.clip();
      ctx.filter = 'none';
      this.drawWithTransform(ctx, element, displayWidth, displayHeight);
      ctx.restore();

      // Draw adjusted (right side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, displayWidth - splitX, displayHeight);
      ctx.clip();
      ctx.filter = this.getCanvasFilterString();
      this.drawWithTransform(ctx, element, displayWidth, displayHeight);
      ctx.restore();

    } else if (this.wipeManager.mode === 'vertical') {
      // Top side: original (no filter)
      // Bottom side: with color adjustments
      const splitY = Math.floor(displayHeight * pos);

      // Draw original (top side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, displayWidth, splitY);
      ctx.clip();
      ctx.filter = 'none';
      this.drawWithTransform(ctx, element, displayWidth, displayHeight);
      ctx.restore();

      // Draw adjusted (bottom side)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, splitY, displayWidth, displayHeight - splitY);
      ctx.clip();
      ctx.filter = this.getCanvasFilterString();
      this.drawWithTransform(ctx, element, displayWidth, displayHeight);
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
    const pos = this.wipeManager.position;
    const currentFrame = this.session.currentFrame;

    // Determine the element to use for source A
    // For mediabunny videos, use source A's own cached frame canvas.
    // Do not read via session.getVideoFrameCanvas(), which follows currentSource
    // and can incorrectly return source B when AB is toggled during playback.
    let elementA: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap = sourceA.element;
    if (sourceA.type === 'video' && sourceA.videoSourceNode?.isUsingMediabunny()) {
      const frameCanvas = sourceA.videoSourceNode.getCachedFrameCanvas(currentFrame);
      if (frameCanvas) {
        elementA = frameCanvas;
      }
    }

    // Determine the element to use for source B
    // For mediabunny videos, use the cached frame canvas
    let elementB: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap = sourceB.element;
    if (sourceB.type === 'video' && this.session.isSourceBUsingMediabunny()) {
      const frameCanvas = this.session.getSourceBFrameCanvas(currentFrame);
      if (frameCanvas) {
        elementB = frameCanvas;
        // Cache this frame canvas to use as fallback while next frame loads
        this.frameFetchTracker.lastSourceBFrameCanvas = frameCanvas;
        this.frameFetchTracker.hasDisplayedSourceBMediabunnyFrame = true;
        this.frameFetchTracker.pendingSourceBFrameFetch = null;
        this.frameFetchTracker.pendingSourceBFrameNumber = 0;
      } else {
        // Frame not cached - fetch it asynchronously
        if (!this.frameFetchTracker.pendingSourceBFrameFetch || this.frameFetchTracker.pendingSourceBFrameNumber !== currentFrame) {
          this.frameFetchTracker.pendingSourceBFrameNumber = currentFrame;
          const frameToFetch = currentFrame;

          this.frameFetchTracker.pendingSourceBFrameFetch = this.session.fetchSourceBVideoFrame(frameToFetch)
            .then(() => {
              if (this.frameFetchTracker.pendingSourceBFrameNumber === frameToFetch) {
                this.frameFetchTracker.pendingSourceBFrameFetch = null;
                this.frameFetchTracker.pendingSourceBFrameNumber = 0;
                this.refresh();
              }
            })
            .catch((err) => {
              log.warn('Failed to fetch source B video frame', err);
              if (this.frameFetchTracker.pendingSourceBFrameNumber === frameToFetch) {
                this.frameFetchTracker.pendingSourceBFrameFetch = null;
                this.frameFetchTracker.pendingSourceBFrameNumber = 0;
              }
            });
        }

        // Use fallback while frame is being fetched
        if (this.frameFetchTracker.hasDisplayedSourceBMediabunnyFrame && this.frameFetchTracker.lastSourceBFrameCanvas) {
          // Use the last successfully rendered frame to prevent flickering
          elementB = this.frameFetchTracker.lastSourceBFrameCanvas;
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

    if (this.wipeManager.mode === 'splitscreen-h') {
      // Horizontal split: A on left, B on right
      const splitX = Math.floor(displayWidth * pos);
      this.drawClippedSource(ctx, elementA, 0, 0, splitX, displayHeight, displayWidth, displayHeight);
      this.drawClippedSource(ctx, elementB, splitX, 0, displayWidth - splitX, displayHeight, displayWidth, displayHeight);
    } else if (this.wipeManager.mode === 'splitscreen-v') {
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
    element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
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
    element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
    width: number,
    height: number
  ): void {
    // Apply transform and draw
    drawWithTransformUtil(ctx, element, width, height, this.transformManager.transform);
  }

  private getCanvasFilterString(): string {
    return getCanvasFilterStringUtil(this.colorPipeline.colorAdjustments, this.filterStringCache);
  }

  private renderPaint(): void {
    if (this.displayWidth === 0 || this.displayHeight === 0) return;

    // Keep paint surface in sync with current viewport and pan offset so
    // off-image annotations remain visible around the image area.
    const containerRect = this.getContainerRect();
    this.updatePaintCanvasSize(this.displayWidth, this.displayHeight, containerRect.width, containerRect.height);

    const ctx = this.paintCtx;
    // Clear at physical resolution (no DPR scale on paint canvas context)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);

    // Get annotations with ghost effect, filtering by current A/B version
    const version = this.paintEngine.annotationVersion;
    const versionFilter = (version === 'all') ? undefined : version;
    const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame, versionFilter);

    if (annotations.length === 0) return;

    const dpr = window.devicePixelRatio || 1;

    // Render annotations at retina resolution (PaintRenderer applies DPR scaling internally)
    this.paintRenderer.renderAnnotations(annotations, {
      width: this.displayWidth,
      height: this.displayHeight,
      canvasWidth: this.paintLogicalWidth,
      canvasHeight: this.paintLogicalHeight,
      offsetX: this.paintOffsetX,
      offsetY: this.paintOffsetY,
      dpr,
    });

    // Copy physical-resolution PaintRenderer canvas to physical-resolution paint canvas
    ctx.drawImage(this.paintRenderer.getCanvas(), 0, 0);
  }

  getPaintEngine(): PaintEngine {
    return this.paintEngine;
  }

  getZoom(): number {
    return this.transformManager.getZoom();
  }

  getPan(): { x: number; y: number } {
    return this.transformManager.getPan();
  }

  setPan(x: number, y: number): void {
    this.transformManager.setPan(x, y);
    this.scheduleRender();
  }

  setColorAdjustments(adjustments: ColorAdjustments): void {
    this.colorPipeline.setColorAdjustments(adjustments);
    this.glRendererManager.setColorAdjustments(adjustments);
    this.applyColorFilters();
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getColorAdjustments(): ColorAdjustments {
    return this.colorPipeline.getColorAdjustments();
  }

  resetColorAdjustments(): void {
    this.colorPipeline.resetColorAdjustments();
    this.applyColorFilters();
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  // Color inversion methods
  setColorInversion(enabled: boolean): void {
    if (!this.colorPipeline.setColorInversion(enabled)) return;
    this.glRendererManager.setColorInversion(enabled);
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getColorInversion(): boolean {
    return this.colorPipeline.getColorInversion();
  }

  toggleColorInversion(): void {
    this.setColorInversion(!this.colorPipeline.colorInversionEnabled);
  }

  // LUT methods
  setLUT(lut: LUT3D | null): void {
    this.colorPipeline.setLUT(lut);

    if (this.lutIndicator) {
      this.lutIndicator.style.display = lut ? 'block' : 'none';
      this.lutIndicator.textContent = lut ? `LUT: ${lut.title}` : 'LUT';
    }
    this.scheduleRender();
  }

  getLUT(): LUT3D | null {
    return this.colorPipeline.getLUT();
  }

  setLUTIntensity(intensity: number): void {
    this.colorPipeline.setLUTIntensity(intensity);
    this.scheduleRender();
  }

  getLUTIntensity(): number {
    return this.colorPipeline.getLUTIntensity();
  }

  /** Get the multi-point LUT pipeline instance */
  getLUTPipeline(): LUTPipeline {
    return this.colorPipeline.lutPipeline;
  }

  /** Get the GPU LUT chain (for multi-point rendering) */
  getGPULUTChain(): GPULUTChain | null {
    return this.colorPipeline.gpuLUTChain;
  }

  /**
   * Synchronize UI-managed LUT pipeline state into the runtime renderer.
   *
   * Mapping:
   * - Pre-cache stage uses the existing single-LUT path for compatibility.
   * - File / Look / Display stages are driven by GPULUTChain.
   */
  syncLUTPipeline(): void {
    const pipeline = this.colorPipeline.lutPipeline;
    const sourceId = pipeline.getActiveSourceId() ?? 'default';
    const sourceConfig = pipeline.getSourceConfig(sourceId);
    const state = pipeline.getState();

    const gpuChain = this.colorPipeline.gpuLUTChain;
    if (gpuChain) {
      const fileLUT = sourceConfig?.fileLUT.lutData;
      const lookLUT = sourceConfig?.lookLUT.lutData;
      const displayLUT = state.displayLUT.lutData;

      gpuChain.setFileLUT(fileLUT && isLUT3D(fileLUT) ? fileLUT : null);
      gpuChain.setFileLUTEnabled(sourceConfig?.fileLUT.enabled ?? true);
      gpuChain.setFileLUTIntensity(sourceConfig?.fileLUT.intensity ?? 1);

      gpuChain.setLookLUT(lookLUT && isLUT3D(lookLUT) ? lookLUT : null);
      gpuChain.setLookLUTEnabled(sourceConfig?.lookLUT.enabled ?? true);
      gpuChain.setLookLUTIntensity(sourceConfig?.lookLUT.intensity ?? 1);

      gpuChain.setDisplayLUT(displayLUT && isLUT3D(displayLUT) ? displayLUT : null);
      gpuChain.setDisplayLUTEnabled(state.displayLUT.enabled);
      gpuChain.setDisplayLUTIntensity(state.displayLUT.intensity);
    }

    const preCache = sourceConfig?.preCacheLUT;
    const hasPreCache3D =
      !!preCache?.lutData &&
      isLUT3D(preCache.lutData) &&
      preCache.enabled &&
      preCache.intensity > 0;

    if (hasPreCache3D) {
      this.pipelinePrecacheLUTActive = true;
      this.colorPipeline.setLUT(preCache!.lutData);
      this.colorPipeline.setLUTIntensity(preCache!.intensity);
      if (this.lutIndicator) {
        this.lutIndicator.style.display = 'block';
        this.lutIndicator.textContent = preCache?.lutName ? `LUT: ${preCache.lutName}` : 'LUT';
      }
    } else if (this.pipelinePrecacheLUTActive) {
      this.pipelinePrecacheLUTActive = false;
      this.colorPipeline.setLUT(null);
      this.colorPipeline.setLUTIntensity(1);
      if (this.lutIndicator) {
        this.lutIndicator.style.display = 'none';
      }
    }

    this.notifyEffectsChanged();
    this.scheduleRender();
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
    if (this.wipeManager.isSplitScreen) {
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
    this.colorPipeline.applyLUTToCanvas(ctx, width, height);
  }

  /**
   * Apply OCIO display transform using GPU-accelerated baked 3D LUT.
   *
   * The OCIO transform chain (input -> working -> look -> display+view) is pre-baked
   * into a 3D LUT by the OCIOProcessor, then applied here via the WebGL LUT pipeline
   * for real-time performance.
   */
  private applyOCIOToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.colorPipeline.applyOCIOToCanvas(ctx, width, height);
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
    this.colorPipeline.setOCIOBakedLUT(lut, enabled);
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  /**
   * Get whether OCIO is currently enabled and active
   */
  isOCIOEnabled(): boolean {
    return this.colorPipeline.isOCIOEnabled();
  }

  // Wipe comparison methods
  setWipeState(state: WipeState): void {
    this.wipeManager.setState(state);
    this.updateWipeLine();
    this.updateSplitScreenLine();
    this.updateABIndicator(); // Hide/show A/B indicator based on mode
    this.scheduleRender();
  }

  getWipeState(): WipeState {
    return this.wipeManager.getState();
  }

  setWipeMode(mode: WipeMode): void {
    this.wipeManager.setMode(mode);
    this.updateWipeLine();
    this.updateSplitScreenLine();
    this.updateABIndicator(); // Hide/show A/B indicator based on mode
    this.scheduleRender();
  }

  setWipePosition(position: number): void {
    this.wipeManager.setPosition(position);
    this.updateWipeLine();
    this.scheduleRender();
  }

  setWipeLabels(labelA: string, labelB: string): void {
    this.wipeManager.setLabels(labelA, labelB);
  }

  getWipeLabels(): { labelA: string; labelB: string } {
    return this.wipeManager.getLabels();
  }

  // Transform methods
  setTransform(transform: Transform2D): void {
    this.transformManager.setTransform(transform);
    this.scheduleRender();
  }

  getTransform(): Transform2D {
    return this.transformManager.getTransform();
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

  setNoiseReductionParams(params: NoiseReductionParams): void {
    this.noiseReductionParams = { ...params };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getNoiseReductionParams(): NoiseReductionParams {
    return { ...this.noiseReductionParams };
  }

  resetNoiseReductionParams(): void {
    this.noiseReductionParams = { ...DEFAULT_NOISE_REDUCTION_PARAMS };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getWatermarkOverlay(): WatermarkOverlay {
    return this.watermarkOverlay;
  }

  getWatermarkState(): WatermarkState {
    return this.watermarkOverlay.getState();
  }

  setWatermarkState(state: Partial<WatermarkState>): void {
    const hasImageUrl = Object.prototype.hasOwnProperty.call(state, 'imageUrl');
    const { imageUrl, ...nonImageState } = state;

    if (Object.keys(nonImageState).length > 0) {
      this.watermarkOverlay.setState(nonImageState);
    }

    if (hasImageUrl) {
      if (!imageUrl) {
        this.watermarkOverlay.removeImage();
      } else {
        const currentState = this.watermarkOverlay.getState();
        const needsLoad = !this.watermarkOverlay.hasImage() || currentState.imageUrl !== imageUrl;

        if (needsLoad) {
          if (imageUrl.startsWith('blob:')) {
            console.warn('[Viewer] Cannot restore watermark from blob URL. Please reload the watermark file.');
            this.watermarkOverlay.setState({ imageUrl: null, enabled: false });
          } else {
            const desiredEnabled = state.enabled ?? true;
            void this.watermarkOverlay.loadFromUrl(imageUrl)
              .then(() => {
                this.watermarkOverlay.setState({ ...nonImageState, enabled: desiredEnabled });
              })
              .catch((err) => {
                console.warn('[Viewer] Failed to restore watermark image:', err);
                this.watermarkOverlay.setState({ enabled: false });
              });
          }
        }
      }
    }

    this.scheduleRender();
  }

  setMissingFrameMode(mode: MissingFrameMode): void {
    this.missingFrameMode = mode;
    this.persistMissingFrameModePreference();
    this.scheduleRender();
  }

  getMissingFrameMode(): MissingFrameMode {
    return this.missingFrameMode;
  }

  // Gamut mapping methods
  setGamutMappingState(state: GamutMappingState): void {
    this.gamutMappingState = { ...state };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getGamutMappingState(): GamutMappingState {
    return { ...this.gamutMappingState };
  }

  // Deinterlace methods
  setDeinterlaceParams(params: DeinterlaceParams): void {
    this.deinterlaceParams = { ...params };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getDeinterlaceParams(): DeinterlaceParams {
    return { ...this.deinterlaceParams };
  }

  resetDeinterlaceParams(): void {
    this.deinterlaceParams = { ...DEFAULT_DEINTERLACE_PARAMS };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  // Film emulation methods
  setFilmEmulationParams(params: FilmEmulationParams): void {
    this.filmEmulationParams = { ...params };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getFilmEmulationParams(): FilmEmulationParams {
    return { ...this.filmEmulationParams };
  }

  resetFilmEmulationParams(): void {
    this.filmEmulationParams = { ...DEFAULT_FILM_EMULATION_PARAMS };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  // Stabilization methods
  setStabilizationParams(params: StabilizationParams): void {
    this.stabilizationParams = { ...params };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getStabilizationParams(): StabilizationParams {
    return { ...this.stabilizationParams };
  }

  resetStabilizationParams(): void {
    this.stabilizationParams = { ...DEFAULT_STABILIZATION_PARAMS };
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  // Crop methods (delegate to CropManager)
  setCropState(state: CropState): void {
    this.cropManager.setCropState(state);
  }

  getCropState(): CropState {
    return this.cropManager.getCropState();
  }

  setCropRegion(region: CropRegion): void {
    this.cropManager.setCropRegion(region);
  }

  setCropEnabled(enabled: boolean): void {
    this.cropManager.setCropEnabled(enabled);
  }

  // Uncrop methods (delegate to CropManager)
  setUncropState(state: UncropState): void {
    this.cropManager.setUncropState(state);
  }

  getUncropState(): UncropState {
    return this.cropManager.getUncropState();
  }

  /**
   * Check if uncrop is actively adding padding to the canvas.
   */
  isUncropActive(): boolean {
    return this.cropManager.isUncropActive();
  }

  // CDL methods
  setCDL(cdl: CDLValues): void {
    this.colorPipeline.setCDL(cdl);
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getCDL(): CDLValues {
    return this.colorPipeline.getCDL();
  }

  resetCDL(): void {
    this.colorPipeline.resetCDL();
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  // Color curves methods
  setCurves(curves: ColorCurvesData): void {
    this.colorPipeline.setCurves(curves);
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getCurves(): ColorCurvesData {
    return this.colorPipeline.getCurves();
  }

  resetCurves(): void {
    this.colorPipeline.resetCurves();
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
    const hasCDL = !isDefaultCDL(this.colorPipeline.cdlValues);
    const hasCurves = !isDefaultCurves(this.colorPipeline.curvesData);
    const hasSharpen = this.filterSettings.sharpen > 0;
    const hasNoiseReduction = isNoiseReductionActive(this.noiseReductionParams);
    const hasChannel = this.channelMode !== 'rgb';
    const hasHighlightsShadows = this.colorPipeline.colorAdjustments.highlights !== 0 || this.colorPipeline.colorAdjustments.shadows !== 0 ||
                                 this.colorPipeline.colorAdjustments.whites !== 0 || this.colorPipeline.colorAdjustments.blacks !== 0;
    const hasVibrance = this.colorPipeline.colorAdjustments.vibrance !== 0;
    const hasClarity = this.colorPipeline.colorAdjustments.clarity !== 0;
    const hasHueRotation = !isIdentityHueRotation(this.colorPipeline.colorAdjustments.hueRotation);
    const hasColorWheels = this.colorWheels.hasAdjustments();
    const hasHSLQualifier = this.hslQualifier.isEnabled();
    const hasFalseColor = this.overlayManager.getFalseColor().isEnabled();
    const hasLuminanceVis = this.overlayManager.getLuminanceVisualization().getMode() !== 'off' && this.overlayManager.getLuminanceVisualization().getMode() !== 'false-color';
    const hasZebras = this.overlayManager.getZebraStripes().isEnabled();
    const hasClippingOverlay = this.overlayManager.getClippingOverlay().isEnabled();
    const hasToneMapping = this.isToneMappingEnabled();
    const hasInversion = this.colorPipeline.colorInversionEnabled;
    const hasDisplayColorMgmt = isDisplayStateActive(this.colorPipeline.displayColorState);
    const hasDeinterlace = isDeinterlaceActive(this.deinterlaceParams);
    const hasFilmEmulation = isFilmEmulationActive(this.filmEmulationParams);
    const hasStabilization = isStabilizationActive(this.stabilizationParams) && this.stabilizationParams.cropAmount > 0;

    // Early return if no pixel effects are active
    // Note: OCIO is handled via GPU-accelerated 3D LUT in the main render pipeline (applyOCIOToCanvas)
    if (!hasCDL && !hasCurves && !hasSharpen && !hasNoiseReduction && !hasChannel && !hasHighlightsShadows && !hasVibrance && !hasClarity && !hasHueRotation && !hasColorWheels && !hasHSLQualifier && !hasFalseColor && !hasLuminanceVis && !hasZebras && !hasClippingOverlay && !hasToneMapping && !hasInversion && !hasDisplayColorMgmt && !hasDeinterlace && !hasFilmEmulation && !hasStabilization) {
      return;
    }

    // Single getImageData call
    const imageData = ctx.getImageData(0, 0, width, height);

    // Apply stabilization (spatial transform, before deinterlace)
    if (hasStabilization) {
      applyStabilization(imageData, { dx: 0, dy: 0, cropAmount: this.stabilizationParams.cropAmount });
    }

    // Apply deinterlace (spatial, before color adjustments)
    if (hasDeinterlace) {
      applyDeinterlace(imageData, this.deinterlaceParams);
    }

    // Apply highlight/shadow recovery (before other adjustments for best results)
    if (hasHighlightsShadows) {
      applyHighlightsShadows(imageData, {
        highlights: this.colorPipeline.colorAdjustments.highlights,
        shadows: this.colorPipeline.colorAdjustments.shadows,
        whites: this.colorPipeline.colorAdjustments.whites,
        blacks: this.colorPipeline.colorAdjustments.blacks,
      });
    }

    // Apply vibrance (intelligent saturation - before CDL/curves for natural results)
    if (hasVibrance) {
      applyVibrance(imageData, {
        vibrance: this.colorPipeline.colorAdjustments.vibrance,
        skinProtection: this.colorPipeline.colorAdjustments.vibranceSkinProtection,
      });
    }

    // Apply clarity (local contrast enhancement in midtones)
    if (hasClarity) {
      applyClarity(imageData, this.colorPipeline.colorAdjustments.clarity);
    }

    // Apply hue rotation (luminance-preserving, after basic adjustments, before CDL)
    if (hasHueRotation) {
      const data = imageData.data;
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        const r = data[i]! / 255;
        const g = data[i + 1]! / 255;
        const b = data[i + 2]! / 255;
        const [nr, ng, nb] = applyHueRotationPixel(r, g, b, this.colorPipeline.colorAdjustments.hueRotation);
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
      applyCDLToImageData(imageData, this.colorPipeline.cdlValues);
    }

    // Apply color curves
    if (hasCurves) {
      this.colorPipeline.curveLUTCache.apply(imageData, this.colorPipeline.curvesData);
    }

    // Apply HSL Qualifier (secondary color correction - after primary corrections)
    if (hasHSLQualifier) {
      this.hslQualifier.apply(imageData);
    }

    // Apply tone mapping (after color adjustments, before channel isolation)
    if (hasToneMapping) {
      applyToneMapping(imageData, this.colorPipeline.toneMappingState.operator);
    }

    // Apply color inversion (after all color corrections, before sharpen/channel isolation)
    if (hasInversion) {
      applyColorInversion(imageData);
    }

    // Apply film emulation (after color corrections, before sharpen/channel isolation)
    if (hasFilmEmulation) {
      applyFilmEmulation(imageData, this.filmEmulationParams);
    }

    // Apply noise reduction (edge-preserving denoise before sharpen).
    if (hasNoiseReduction) {
      applyNoiseReduction(imageData, this.noiseReductionParams);
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
      applyDisplayColorManagementToImageData(imageData, this.colorPipeline.displayColorState);
    }

    // Apply luminance visualization modes (HSV, random color, contour) or false color
    // These replace pixel colors for analysis, so they're mutually exclusive
    if (hasLuminanceVis) {
      this.overlayManager.getLuminanceVisualization().apply(imageData);
    } else if (hasFalseColor) {
      this.overlayManager.getFalseColor().apply(imageData);
    }

    // Apply zebra stripes (overlay on top of other effects for exposure warnings)
    // Note: Zebras work on original image luminance, so they're applied after false color
    // (typically you'd use one or the other, not both)
    if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
      this.overlayManager.getZebraStripes().apply(imageData);
    }

    // Apply clipping overlay (shows clipped highlights/shadows)
    // Applied last as it's a diagnostic overlay
    if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
      this.overlayManager.getClippingOverlay().apply(imageData);
    }

    // Single putImageData call
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Async version of applyBatchedPixelEffects that yields to the event loop
   * between major effect passes. This keeps each blocking period under ~16ms,
   * preventing janky UI during paused frame updates, export rendering, or
   * interactive slider dragging on CPU fallback.
   *
   * Produces identical pixel output to the sync applyBatchedPixelEffects().
   * During playback, the sync version is used instead (workers handle CPU effects).
   */
  private async applyBatchedPixelEffectsAsync(
    ctx: CanvasRenderingContext2D, width: number, height: number,
    generation: number, cropClipActive: boolean
  ): Promise<void> {
    try {
    const hasCDL = !isDefaultCDL(this.colorPipeline.cdlValues);
    const hasCurves = !isDefaultCurves(this.colorPipeline.curvesData);
    const hasSharpen = this.filterSettings.sharpen > 0;
    const hasNoiseReduction = isNoiseReductionActive(this.noiseReductionParams);
    const hasChannel = this.channelMode !== 'rgb';
    const hasHighlightsShadows = this.colorPipeline.colorAdjustments.highlights !== 0 || this.colorPipeline.colorAdjustments.shadows !== 0 ||
                                 this.colorPipeline.colorAdjustments.whites !== 0 || this.colorPipeline.colorAdjustments.blacks !== 0;
    const hasVibrance = this.colorPipeline.colorAdjustments.vibrance !== 0;
    const hasClarity = this.colorPipeline.colorAdjustments.clarity !== 0;
    const hasHueRotation = !isIdentityHueRotation(this.colorPipeline.colorAdjustments.hueRotation);
    const hasColorWheels = this.colorWheels.hasAdjustments();
    const hasHSLQualifier = this.hslQualifier.isEnabled();
    const hasFalseColor = this.overlayManager.getFalseColor().isEnabled();
    const hasLuminanceVis = this.overlayManager.getLuminanceVisualization().getMode() !== 'off' && this.overlayManager.getLuminanceVisualization().getMode() !== 'false-color';
    const hasZebras = this.overlayManager.getZebraStripes().isEnabled();
    const hasClippingOverlay = this.overlayManager.getClippingOverlay().isEnabled();
    const hasToneMapping = this.isToneMappingEnabled();
    const hasInversion = this.colorPipeline.colorInversionEnabled;
    const hasDisplayColorMgmt = isDisplayStateActive(this.colorPipeline.displayColorState);
    const hasDeinterlace = isDeinterlaceActive(this.deinterlaceParams);
    const hasFilmEmulation = isFilmEmulationActive(this.filmEmulationParams);
    const hasStabilization = isStabilizationActive(this.stabilizationParams) && this.stabilizationParams.cropAmount > 0;

    // Early return if no pixel effects are active
    if (!hasCDL && !hasCurves && !hasSharpen && !hasNoiseReduction && !hasChannel && !hasHighlightsShadows && !hasVibrance && !hasClarity && !hasHueRotation && !hasColorWheels && !hasHSLQualifier && !hasFalseColor && !hasLuminanceVis && !hasZebras && !hasClippingOverlay && !hasToneMapping && !hasInversion && !hasDisplayColorMgmt && !hasDeinterlace && !hasFilmEmulation && !hasStabilization) {
      return;
    }

    // Single getImageData call
    const imageData = ctx.getImageData(0, 0, width, height);

    // --- Pass 0: Stabilization (spatial transform, before deinterlace) ---
    if (hasStabilization) {
      applyStabilization(imageData, { dx: 0, dy: 0, cropAmount: this.stabilizationParams.cropAmount });
      await yieldToMain();
      if (this._asyncEffectsGeneration !== generation) return;
    }

    // --- Pass 1: Deinterlace (spatial, before color adjustments) ---
    if (hasDeinterlace) {
      applyDeinterlace(imageData, this.deinterlaceParams);
      await yieldToMain();
      if (this._asyncEffectsGeneration !== generation) return;
    }

    // --- Pass 2: Clarity (most expensive - 5x5 Gaussian blur, inter-pixel dependency) ---
    if (hasClarity) {
      applyClarity(imageData, this.colorPipeline.colorAdjustments.clarity);
      await yieldToMain();
      if (this._asyncEffectsGeneration !== generation) return; // superseded by newer render
    }

    // --- Pass 3: Per-pixel color effects (merged where possible) ---
    const hasPerPixelEffects = hasHighlightsShadows || hasVibrance || hasHueRotation ||
      hasColorWheels || hasCDL || hasCurves || hasHSLQualifier || hasToneMapping || hasInversion || hasFilmEmulation;

    if (hasPerPixelEffects) {
      // Apply highlight/shadow recovery
      if (hasHighlightsShadows) {
        applyHighlightsShadows(imageData, {
          highlights: this.colorPipeline.colorAdjustments.highlights,
          shadows: this.colorPipeline.colorAdjustments.shadows,
          whites: this.colorPipeline.colorAdjustments.whites,
          blacks: this.colorPipeline.colorAdjustments.blacks,
        });
      }

      // Apply vibrance
      if (hasVibrance) {
        applyVibrance(imageData, {
          vibrance: this.colorPipeline.colorAdjustments.vibrance,
          skinProtection: this.colorPipeline.colorAdjustments.vibranceSkinProtection,
        });
      }

      // Apply hue rotation
      if (hasHueRotation) {
        const data = imageData.data;
        const len = data.length;
        for (let i = 0; i < len; i += 4) {
          const r = data[i]! / 255;
          const g = data[i + 1]! / 255;
          const b = data[i + 2]! / 255;
          const [nr, ng, nb] = applyHueRotationPixel(r, g, b, this.colorPipeline.colorAdjustments.hueRotation);
          data[i] = Math.round(nr * 255);
          data[i + 1] = Math.round(ng * 255);
          data[i + 2] = Math.round(nb * 255);
        }
      }

      // Apply color wheels
      if (hasColorWheels) {
        this.colorWheels.apply(imageData);
      }

      // Apply CDL color correction
      if (hasCDL) {
        applyCDLToImageData(imageData, this.colorPipeline.cdlValues);
      }

      // Apply color curves
      if (hasCurves) {
        this.colorPipeline.curveLUTCache.apply(imageData, this.colorPipeline.curvesData);
      }

      // Apply HSL Qualifier
      if (hasHSLQualifier) {
        this.hslQualifier.apply(imageData);
      }

      // Apply tone mapping
      if (hasToneMapping) {
        applyToneMapping(imageData, this.colorPipeline.toneMappingState.operator);
      }

      // Apply color inversion
      if (hasInversion) {
        applyColorInversion(imageData);
      }

      // Apply film emulation
      if (hasFilmEmulation) {
        applyFilmEmulation(imageData, this.filmEmulationParams);
      }

      await yieldToMain();
      if (this._asyncEffectsGeneration !== generation) return; // superseded by newer render
    }

    // --- Pass 4: Noise reduction (inter-pixel bilateral filter) ---
    if (hasNoiseReduction) {
      applyNoiseReduction(imageData, this.noiseReductionParams);
      await yieldToMain();
      if (this._asyncEffectsGeneration !== generation) return; // superseded by newer render
    }

    // --- Pass 5: Sharpen (inter-pixel dependency - 3x3 kernel) ---
    if (hasSharpen) {
      this.applySharpenToImageData(imageData);
      await yieldToMain();
      if (this._asyncEffectsGeneration !== generation) return; // superseded by newer render
    }

    // --- Pass 6: Channel isolation + display color management ---
    if (hasChannel) {
      applyChannelIsolation(imageData, this.channelMode);
    }

    if (hasDisplayColorMgmt) {
      applyDisplayColorManagementToImageData(imageData, this.colorPipeline.displayColorState);
    }

    // --- Pass 7: Diagnostic overlays ---
    if (hasLuminanceVis) {
      this.overlayManager.getLuminanceVisualization().apply(imageData);
    } else if (hasFalseColor) {
      this.overlayManager.getFalseColor().apply(imageData);
    }

    if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
      this.overlayManager.getZebraStripes().apply(imageData);
    }

    if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
      this.overlayManager.getClippingOverlay().apply(imageData);
    }

    // Final generation check before writing pixels — avoid overwriting a newer frame.
    if (this._asyncEffectsGeneration !== generation) return;

    // Single putImageData call
    ctx.putImageData(imageData, 0, 0);

    // Apply crop clipping after putImageData (putImageData ignores clip regions)
    if (cropClipActive) {
      this.cropManager.clearOutsideCropRegion(ctx, width, height);
    }
    } catch (err) {
      console.error('Async batched pixel effects processing failed:', err);
    }
  }

  /**
   * Apply only lightweight diagnostic overlays and display color management.
   * Used during playback with prerender buffer to maintain visual diagnostics
   * without blocking on expensive CPU effects (handled by workers).
   * These are all O(n) single-pass with no heavy computation (<5ms at 1080p).
   */
  private applyLightweightEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const hasChannel = this.channelMode !== 'rgb';
    const hasFalseColor = this.overlayManager.getFalseColor().isEnabled();
    const hasLuminanceVis = this.overlayManager.getLuminanceVisualization().getMode() !== 'off' && this.overlayManager.getLuminanceVisualization().getMode() !== 'false-color';
    const hasZebras = this.overlayManager.getZebraStripes().isEnabled();
    const hasClippingOverlay = this.overlayManager.getClippingOverlay().isEnabled();
    const hasDisplayColorMgmt = isDisplayStateActive(this.colorPipeline.displayColorState);

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
      applyDisplayColorManagementToImageData(imageData, this.colorPipeline.displayColorState);
    }

    // Luminance visualization or false color (mutually exclusive)
    if (hasLuminanceVis) {
      this.overlayManager.getLuminanceVisualization().apply(imageData);
    } else if (hasFalseColor) {
      this.overlayManager.getFalseColor().apply(imageData);
    }

    // Zebra stripes
    if (hasZebras && !hasFalseColor && !hasLuminanceVis) {
      this.overlayManager.getZebraStripes().apply(imageData);
    }

    // Clipping overlay
    if (hasClippingOverlay && !hasFalseColor && !hasLuminanceVis && !hasZebras) {
      this.overlayManager.getClippingOverlay().apply(imageData);
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

  // Lens distortion methods (delegated to LensDistortionManager)
  setLensParams(params: LensDistortionParams): void {
    this.lensDistortionManager.setLensParams(params);
    this.scheduleRender();
  }

  getLensParams(): LensDistortionParams {
    return this.lensDistortionManager.getLensParams();
  }

  resetLensParams(): void {
    this.lensDistortionManager.resetLensParams();
    this.scheduleRender();
  }

  // Perspective correction methods (delegated to PerspectiveCorrectionManager)
  setPerspectiveParams(params: PerspectiveCorrectionParams): void {
    this.perspectiveCorrectionManager.setParams(params);
    this.perspectiveGridOverlay.setParams(params);
    this.scheduleRender();
  }

  getPerspectiveParams(): PerspectiveCorrectionParams {
    return this.perspectiveCorrectionManager.getParams();
  }

  resetPerspectiveParams(): void {
    this.perspectiveCorrectionManager.resetParams();
    this.perspectiveGridOverlay.setParams(this.perspectiveCorrectionManager.getParams());
    this.scheduleRender();
  }

  getPerspectiveGridOverlay(): PerspectiveGridOverlay {
    return this.perspectiveGridOverlay;
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

  // Stereo viewing methods (delegated to StereoManager)
  setStereoState(state: StereoState): void {
    this.stereoManager.setStereoState(state);
    this.scheduleRender();
  }

  getStereoState(): StereoState {
    return this.stereoManager.getStereoState();
  }

  resetStereoState(): void {
    this.stereoManager.resetStereoState();
    this.scheduleRender();
  }

  // Per-eye transform methods (delegated to StereoManager)
  setStereoEyeTransforms(state: StereoEyeTransformState): void {
    this.stereoManager.setStereoEyeTransforms(state);
    this.scheduleRender();
  }

  getStereoEyeTransforms(): StereoEyeTransformState {
    return this.stereoManager.getStereoEyeTransforms();
  }

  resetStereoEyeTransforms(): void {
    this.stereoManager.resetStereoEyeTransforms();
    this.scheduleRender();
  }

  // Stereo alignment mode methods (delegated to StereoManager)
  setStereoAlignMode(mode: StereoAlignMode): void {
    this.stereoManager.setStereoAlignMode(mode);
    this.scheduleRender();
  }

  getStereoAlignMode(): StereoAlignMode {
    return this.stereoManager.getStereoAlignMode();
  }

  resetStereoAlignMode(): void {
    this.stereoManager.resetStereoAlignMode();
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

  // A/B blend mode methods
  setBlendModeState(state: BlendModeState & { flickerFrame?: 0 | 1 }): void {
    this.blendModeState = {
      mode: state.mode,
      onionOpacity: Math.max(0, Math.min(1, state.onionOpacity)),
      flickerRate: Math.max(1, Math.min(30, Math.round(state.flickerRate))),
      blendRatio: Math.max(0, Math.min(1, state.blendRatio)),
      flickerFrame: state.flickerFrame ?? this.blendModeState.flickerFrame,
    };
    this.scheduleRender();
  }

  getBlendModeState(): BlendModeState & { flickerFrame: 0 | 1 } {
    return { ...this.blendModeState };
  }

  private isBlendModeEnabled(): boolean {
    return this.blendModeState.mode !== 'off';
  }

  // Ghost frame (onion skin) methods (delegated to GhostFrameManager)
  setGhostFrameState(state: GhostFrameState): void {
    this.ghostFrameManager.setState(state);
    this.scheduleRender();
  }

  getGhostFrameState(): GhostFrameState {
    return this.ghostFrameManager.getState();
  }

  resetGhostFrameState(): void {
    this.ghostFrameManager.resetState();
    this.scheduleRender();
  }

  isGhostFrameEnabled(): boolean {
    return this.ghostFrameManager.enabled;
  }

  // Tone mapping methods
  setToneMappingState(state: ToneMappingState): void {
    this.colorPipeline.setToneMappingState(state);
    this.glRendererManager.setToneMappingState(state);
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getToneMappingState(): ToneMappingState {
    return this.colorPipeline.getToneMappingState();
  }

  resetToneMappingState(): void {
    this.colorPipeline.resetToneMappingState();
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  // HDR output mode (delegates to renderer when available)
  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended'): void {
    if (this.glRendererManager.glRenderer && this.glRendererManager.capabilities) {
      this.glRendererManager.glRenderer.setHDROutputMode(mode, this.glRendererManager.capabilities);
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
    this.colorPipeline.setDisplayColorState(state);
    this.glRendererManager.setDisplayColorState({
      transferFunction: DISPLAY_TRANSFER_CODES[state.transferFunction],
      displayGamma: state.displayGamma,
      displayBrightness: state.displayBrightness,
      customGamma: state.customGamma,
    });
    this.notifyEffectsChanged();
    this.scheduleRender();
  }

  getDisplayColorState(): DisplayColorState {
    return this.colorPipeline.getDisplayColorState();
  }

  resetDisplayColorState(): void {
    this.colorPipeline.resetDisplayColorState();
    this.glRendererManager.setDisplayColorState({
      transferFunction: DISPLAY_TRANSFER_CODES[DEFAULT_DISPLAY_COLOR_STATE.transferFunction],
      displayGamma: DEFAULT_DISPLAY_COLOR_STATE.displayGamma,
      displayBrightness: DEFAULT_DISPLAY_COLOR_STATE.displayBrightness,
      customGamma: DEFAULT_DISPLAY_COLOR_STATE.customGamma,
    });
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
    return this.colorPipeline.toneMappingState.enabled && this.colorPipeline.toneMappingState.operator !== 'off';
  }

  /**
   * Get a canvas from the ghost frame pool, creating one if needed.
   * All pooled canvases share the same dimensions; if the display size changes,
   * the pool is re-sized.
   */
  /**
   * Render ghost frames (onion skin overlay) behind the main frame.
   * Shows semi-transparent previous/next frames for animation review.
   */
  private renderGhostFrames(displayWidth: number, displayHeight: number): void {
    const gfm = this.ghostFrameManager;
    const gfs = gfm.state;
    if (!gfs.enabled) return;

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

    // Render ghost frames
    let poolIndex = 0;
    for (const { frame, distance, isBefore } of framesToRender) {
      // Calculate opacity with falloff
      const opacity = gfs.opacityBase *
        Math.pow(gfs.opacityFalloff, distance - 1);

      // Try to get the frame from prerender cache
      let frameCanvas: HTMLCanvasElement | OffscreenCanvas | ImageBitmap | null = null;

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
            // Use pooled canvas from ghost frame manager
            const poolEntry = gfm.getPoolCanvas(poolIndex, displayWidth, displayHeight, this.canvasColorSpace);
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

      if (gfs.colorTint) {
        // Apply color tint using composite operations
        // First draw the frame
        this.drawWithTransform(ctx, frameCanvas, displayWidth, displayHeight);

        // Then overlay color tint
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = isBefore ? 'rgba(255, 100, 100, 1)' : 'rgba(100, 255, 100, 1)';
        ctx.fillRect(0, 0, displayWidth, displayHeight);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        // Just draw with opacity
        this.drawWithTransform(ctx, frameCanvas, displayWidth, displayHeight);
      }

      ctx.restore();
    }

    // Trim pool to actual number of canvases used
    gfm.trimPool(poolIndex);
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
    return renderSourceToImageDataUtil(
      this.session,
      sourceIndex,
      width,
      height,
      this.transformManager.transform
    );
  }

  /**
   * Render A/B blend modes (onion skin, flicker, blend ratio).
   */
  private renderBlendMode(width: number, height: number): ImageData | null {
    const sourceA = this.session.sourceA;
    const sourceB = this.session.sourceB;
    if (!sourceA?.element || !sourceB?.element) return null;

    const dataA = this.renderSourceToImageData(this.session.sourceAIndex, width, height);
    const dataB = this.renderSourceToImageData(this.session.sourceBIndex, width, height);
    if (!dataA || !dataB) return null;

    switch (this.blendModeState.mode) {
      case 'onionskin':
        return compositeImageData(dataA, dataB, 'normal', this.blendModeState.onionOpacity);
      case 'blend':
        return compositeImageData(dataA, dataB, 'normal', this.blendModeState.blendRatio);
      case 'flicker': {
        const src = this.blendModeState.flickerFrame === 0 ? dataA : dataB;
        return new ImageData(new Uint8ClampedArray(src.data), width, height);
      }
      default:
        return null;
    }
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

  setCropPanelOpen(isOpen: boolean): void {
    this.cropManager.setCropPanelOpen(isOpen);
  }

  /**
   * Register a callback for crop region changes from interactive handle dragging.
   * Uses single-consumer callback pattern consistent with other Viewer callbacks
   * (e.g., cursorColorCallback, prerenderCacheUpdateCallback).
   * Only one listener is supported — the App wires this to CropControl.setCropRegion.
   */
  setOnCropRegionChanged(callback: ((region: CropRegion) => void) | null): void {
    this.cropManager.setOnCropRegionChanged(callback);
  }

  private updateWipeLine(): void {
    const containerRect = this.getContainerRect();
    const canvasRect = this.getCanvasContainerRect();
    this.wipeManager.updateWipeLine(containerRect, canvasRect, this.displayWidth, this.displayHeight);
  }

  private updateSplitScreenLine(): void {
    const containerRect = this.getContainerRect();
    const canvasRect = this.getCanvasContainerRect();
    this.wipeManager.updateSplitScreenLine(containerRect, canvasRect, this.displayWidth, this.displayHeight);
  }

  private applyColorFilters(): void {
    if (this.glRendererManager.hdrRenderActive || this.glRendererManager.sdrWebGLRenderActive) {
      // In HDR/SDR WebGL mode, CSS filters are skipped — the WebGL shader handles all adjustments
      this.canvasContainer.style.filter = 'none';
      return;
    }
    const filterString = buildContainerFilterString(this.colorPipeline.colorAdjustments, this.filterSettings.blur);
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

  exportSourceFrame(
    format: ExportFormat = 'png',
    quality = 0.92
  ): void {
    const canvas = createSourceExportCanvasUtil(this.session);
    if (!canvas) return;

    const source = this.session.currentSource;
    const frame = this.session.currentFrame;
    const name = source?.name?.replace(/\.[^.]+$/, '') || 'source';
    const filename = `${name}_source${frame}.${format}`;

    doExportCanvas(canvas, { format, quality, filename });
  }

  async copyFrameToClipboard(includeAnnotations = true): Promise<boolean> {
    const canvas = this.createExportCanvas(includeAnnotations);
    if (!canvas) return false;

    return copyCanvasToClipboard(canvas);
  }

  private getExportFrameburnOptions(frame: number): FrameburnTimecodeOptions | null {
    const timecodeOverlay = this.overlayManager.getTimecodeOverlay();
    const state = timecodeOverlay.getState();
    if (!state.enabled) return null;

    return {
      ...state,
      frame,
      totalFrames: this.session.frameCount,
      fps: this.session.fps,
      startFrame: timecodeOverlay.getStartFrame(),
    };
  }

  private applyWatermarkToCanvas(canvas: HTMLCanvasElement): void {
    if (!this.watermarkOverlay.isEnabled() || !this.watermarkOverlay.hasImage()) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    this.watermarkOverlay.render(ctx, canvas.width, canvas.height);
  }

  createExportCanvas(includeAnnotations: boolean, colorSpace?: 'srgb' | 'display-p3'): HTMLCanvasElement | null {
    const cropRegion = this.cropManager.getExportCropRegion();
    const frameburnOptions = this.getExportFrameburnOptions(this.session.currentFrame);
    const canvas = createExportCanvasUtil(
      this.session,
      this.paintEngine,
      this.paintRenderer,
      this.getCanvasFilterString(),
      includeAnnotations,
      this.transformManager.transform,
      cropRegion,
      colorSpace,
      frameburnOptions
    );
    if (canvas) {
      this.applyWatermarkToCanvas(canvas);
    }
    return canvas;
  }

  /**
   * Render a specific frame to a canvas (for sequence export)
   * Seeks to the frame, renders, and returns the canvas
   */
  async renderFrameToCanvas(frame: number, includeAnnotations: boolean): Promise<HTMLCanvasElement | null> {
    const cropRegion = this.cropManager.getExportCropRegion();
    const frameburnOptions = this.getExportFrameburnOptions(frame);
    const canvas = await renderFrameToCanvasUtil(
      this.session,
      this.paintEngine,
      this.paintRenderer,
      frame,
      this.transformManager.transform,
      this.getCanvasFilterString(),
      includeAnnotations,
      cropRegion,
      undefined,
      frameburnOptions
    );
    if (canvas) {
      this.applyWatermarkToCanvas(canvas);
    }
    return canvas;
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

    // Skip CPU effects prerender for HDR video — effects are handled by the
    // WebGL shader pipeline, so the PrerenderBufferManager would only waste
    // memory caching unused SDR frames at full source resolution.
    const source = this.session.currentSource;
    if (source?.videoSourceNode?.isHDR()) {
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
      this.colorPipeline.colorAdjustments,
      this.colorPipeline.cdlValues,
      this.colorPipeline.curvesData,
      this.filterSettings,
      this.channelMode,
      this.colorWheels,
      this.hslQualifier,
      this.colorPipeline.toneMappingState,
      this.colorPipeline.colorInversionEnabled,
      this.deinterlaceParams,
      this.filmEmulationParams,
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
    // Clean up DPR change listener
    this._dprCleanup?.();
    this._dprCleanup = null;

    // Dispose interaction quality manager (clears debounce timer)
    this.interactionQuality.dispose();

    // Dispose transform manager (cancels zoom animation, clears callback)
    this.transformManager.dispose();

    this.resizeObserver.disconnect();
    this.inputHandler.unbindEvents();
    this.container.removeEventListener('mousemove', this.pixelSamplingManager.onMouseMoveForPixelSampling);
    this.container.removeEventListener('mouseleave', this.pixelSamplingManager.onMouseLeaveForCursorColor);
    this.container.removeEventListener('click', this.pixelSamplingManager.onClickForProbe);

    // Cleanup pixel sampling manager (clears cursor color callback and cached canvases)
    this.pixelSamplingManager.dispose();

    // Cleanup theme change listener
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
      this.boundOnThemeChange = null;
    }

    // Cleanup frame interpolator
    this.frameInterpolator.dispose();

    // Cleanup color pipeline GPU resources (LUT processor, GPU LUT chain, OCIO processor)
    this.colorPipeline.dispose();

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
    this.ghostFrameManager.dispose();

    // Cleanup overlays (via overlay manager)
    this.missingFrameOverlay.dispose();
    this.watermarkOverlay.dispose();
    this.overlayManager.dispose();
    this.hslQualifier.dispose();

    // Cleanup crop manager
    this.cropManager.dispose();

    // Cleanup WebGL/HDR rendering manager (renderer, worker proxy, GL canvas)
    this.glRendererManager.dispose();

    // Cleanup video frame fetch tracker
    this.frameFetchTracker.dispose();

    // Cleanup wipe manager
    this.wipeManager.dispose();

  }

  /**
   * Get ImageData from the current canvas for histogram analysis
   */
  getImageData(): ImageData | null {
    return this.pixelSamplingManager.getImageData();
  }

  /**
   * Get image data optimized for scope analysis (histogram, waveform, vectorscope).
   * When WebGL is active, returns float data preserving HDR values > 1.0.
   * When 2D canvas is active, returns standard ImageData with floatData: null.
   */
  getScopeImageData(): import('./PixelSamplingManager').ScopeImageData | null {
    return this.pixelSamplingManager.getScopeImageData();
  }

  /**
   * Get the WebGL2 renderer instance (for scope HDR headroom queries).
   * Returns null when WebGL rendering is not active.
   */
  getGLRenderer(): import('../../render/Renderer').Renderer | null {
    return this.glRendererManager.glRenderer;
  }

  /**
   * Check if the display is HDR-capable (any HDR output path available).
   * Delegates to DisplayCapabilities helper which checks WebGL native HDR,
   * WebGPU blit, and display HDR + wide gamut + WebGPU availability.
   */
  isDisplayHDRCapable(): boolean {
    if (!this.capabilities) return false;
    return isHDROutputAvailableWithLog(this.capabilities, {
      webgpuBlitReady: this.glRendererManager?.isWebGPUBlitReady ?? false,
    });
  }

  /**
   * Get source ImageData before color pipeline (for pixel probe "source" mode)
   * Returns ImageData of the original source scaled to display dimensions
   * Uses a cached canvas to avoid creating new canvases on every mouse move
   */
  getSourceImageData(): ImageData | null {
    return this.pixelSamplingManager.getSourceImageData();
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
    return this.overlayManager.getSafeAreasOverlay();
  }

  /**
   * Get the matte overlay instance
   */
  getMatteOverlay(): MatteOverlay {
    return this.overlayManager.getMatteOverlay();
  }

  /**
   * Get the timecode overlay instance
   */
  getTimecodeOverlay(): TimecodeOverlay {
    return this.overlayManager.getTimecodeOverlay();
  }

  /**
   * Get the pixel probe instance
   */
  getPixelProbe(): PixelProbe {
    return this.overlayManager.getPixelProbe();
  }

  /**
   * Get the false color display instance
   */
  getFalseColor(): FalseColor {
    return this.overlayManager.getFalseColor();
  }

  /**
   * Get the luminance visualization instance
   */
  getLuminanceVisualization(): LuminanceVisualization {
    return this.overlayManager.getLuminanceVisualization();
  }

  /**
   * Get the zebra stripes instance
   */
  getZebraStripes(): ZebraStripes {
    return this.overlayManager.getZebraStripes();
  }

  /**
   * Get the clipping overlay instance
   */
  getClippingOverlay(): ClippingOverlay {
    return this.overlayManager.getClippingOverlay();
  }

  getMissingFrameOverlay(): MissingFrameOverlay {
    return this.missingFrameOverlay;
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
    return this.overlayManager.getSpotlightOverlay();
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
    this.pixelSamplingManager.onCursorColorChange(callback);
  }
}
