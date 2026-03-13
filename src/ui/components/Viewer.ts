import { type Session, type MatteSettings } from '../../core/session/Session';
import { type PaintEngine } from '../../paint/PaintEngine';
import { PaintRenderer } from '../../paint/PaintRenderer';
import { PerfTrace } from '../../utils/PerfTrace';
import { type ColorAdjustments } from './ColorControls';
import { type WipeState, type WipeMode } from '../../core/types/wipe';
import { type Transform2D } from './TransformControl';
import { type FilterSettings, DEFAULT_FILTER_SETTINGS } from './FilterControl';
import type { TextureFilterMode } from '../../core/types/filter';
import type { DeinterlaceParams } from '../../filters/Deinterlace';
import { DEFAULT_DEINTERLACE_PARAMS } from '../../filters/Deinterlace';
import type { GamutMappingState } from '../../core/types/effects';
import { DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';
import type { NoiseReductionParams } from '../../filters/NoiseReduction';
import { DEFAULT_NOISE_REDUCTION_PARAMS, isNoiseReductionActive } from '../../filters/NoiseReduction';
import { createNoiseReductionProcessor } from '../../filters/WebGLNoiseReduction';
import type { FilmEmulationParams } from '../../filters/FilmEmulation';
import { DEFAULT_FILM_EMULATION_PARAMS } from '../../filters/FilmEmulation';
import type { StabilizationParams } from '../../filters/StabilizeMotion';
import { DEFAULT_STABILIZATION_PARAMS } from '../../filters/StabilizeMotion';
import { type CropState, type CropRegion, type UncropState } from './CropControl';
import { CropManager } from './CropManager';
import {
  type LUT,
  type LUT3D,
  type LUTPipeline,
  type GPULUTChain,
  isLUT3D,
  type CDLValues,
  type ColorCurvesData,
  type DisplayColorState,
  DEFAULT_DISPLAY_COLOR_STATE,
  DISPLAY_TRANSFER_CODES,
  type DisplayCapabilities,
  safeCanvasContext2D,
} from '../../color/ColorProcessingFacade';
import type { LensDistortionParams } from '../../transform/LensDistortion';
import {
  type ExportFormat,
  exportCanvas as doExportCanvas,
  copyCanvasToClipboard,
} from '../../utils/export/FrameExporter';
import { type StackLayer } from './StackControl';
import { getIconSvg } from './shared/Icons';
import { type ChannelMode } from './ChannelSelect';
import { DEFAULT_BLEND_MODE_STATE, type BlendModeState } from './ComparisonManager';
import type { StereoState, StereoEyeTransformState, StereoAlignMode } from '../../stereo/StereoRenderer';
import { extractStereoEyes } from '../../stereo/StereoRenderer';
import { type DifferenceMatteState, DEFAULT_DIFFERENCE_MATTE_STATE } from './DifferenceMatteControl';
import { WebGLSharpenProcessor } from '../../filters/WebGLSharpen';
import type { SafeAreasOverlay } from './SafeAreasOverlay';
import type { MatteOverlay } from './MatteOverlay';
import type { PixelProbe } from './PixelProbe';
import type { FalseColor } from './FalseColor';
import type { LuminanceVisualization } from './LuminanceVisualization';
import type { TimecodeOverlay } from './TimecodeOverlay';
import type { InfoStripOverlay } from './InfoStripOverlay';
import type { FPSIndicator } from './FPSIndicator';
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
import { DisposableSubscriptionManager } from '../../utils/DisposableSubscriptionManager';

// Extracted effect processing utilities
import { EffectProcessor } from '../../utils/effects/EffectProcessor';
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
import { detectWebGPUHDR, isHDROutputAvailableWithLog, queryHDRHeadroom } from '../../color/DisplayCapabilities';
import { VideoFrameFetchTracker } from './VideoFrameFetchTracker';
import { type ToneMappingState } from './ToneMappingControl';
import {
  type PARState,
  DEFAULT_PAR_STATE,
  isPARActive,
  calculatePARCorrectedWidth,
} from '../../utils/media/PixelAspectRatio';
import { Logger } from '../../utils/Logger';
import {
  type BackgroundPatternState,
  DEFAULT_BACKGROUND_PATTERN_STATE,
  drawBackgroundPattern,
} from './BackgroundPatternControl';
import { FrameInterpolator } from '../../utils/media/FrameInterpolator';
import { isViewerContentElement as isViewerContentElementUtil, getPixelCoordinates } from './ViewerInteraction';
import {
  drawWithTransform as drawWithTransformUtil,
  type FilterStringCache,
  getCanvasFilterString as getCanvasFilterStringUtil,
  buildContainerFilterString,
  calculateDisplayDimensions,
  getEffectiveDimensions,
} from './ViewerRenderingUtils';
import { calculateFitScale, ratioToZoom, zoomToRatio } from './ScalePresets';
import { ScaleRatioIndicator } from './ScaleRatioIndicator';
import {
  createExportCanvas as createExportCanvasUtil,
  createSourceExportCanvas as createSourceExportCanvasUtil,
  renderFrameToCanvas as renderFrameToCanvasUtil,
} from './ViewerExport';
import type { FrameburnTimecodeOptions } from './FrameburnCompositor';
import {
  createFrameLoader,
  buildEffectsState,
  getPrerenderStats as getPrerenderStatsUtil,
  type PrerenderStats,
  EFFECTS_DEBOUNCE_MS,
} from './ViewerPrerender';
import { ViewerInputHandler } from './ViewerInputHandler';
import { InteractionQualityManager } from './InteractionQualityManager';

// Extracted modules
import {
  type PixelEffectsContext,
  isToneMappingEnabled as isToneMappingEnabledUtil,
  compositeImageDataOverBackground as compositeImageDataOverBackgroundUtil,
  applyBatchedPixelEffects as applyBatchedPixelEffectsUtil,
  applyBatchedPixelEffectsAsync as applyBatchedPixelEffectsAsyncUtil,
  applyLightweightEffects as applyLightweightEffectsUtil,
} from './ViewerPixelEffects';
import {
  type ImageRendererContext,
  renderWithWipe as renderWithWipeUtil,
  renderSplitScreen as renderSplitScreenUtil,
  renderGhostFrames as renderGhostFramesUtil,
  renderBlendMode as renderBlendModeUtil,
  renderDifferenceMatte as renderDifferenceMatteUtil,
  compositeStackLayers as compositeStackLayersUtil,
  drawClippedSource as drawClippedSourceUtil,
  renderSourceToImageData as renderSourceToImageDataUtil,
} from './ViewerImageRenderer';
import {
  createLutIndicator,
  createABIndicator,
  createFilterModeBadge,
  updateABIndicator as updateABIndicatorUtil,
  showFilterModeIndicator as showFilterModeIndicatorUtil,
  showFitModeIndicator as showFitModeIndicatorUtil,
  loadFilterModePreference,
  persistFilterModePreference,
} from './ViewerIndicators';
import {
  type CanvasSetupContext,
  initializeCanvas as initializeCanvasUtil,
  setCanvasSize as setCanvasSizeUtil,
  updatePaintCanvasSize as updatePaintCanvasSizeUtil,
  drawPlaceholder as drawPlaceholderCanvasUtil,
  updateCanvasPosition as updateCanvasPositionUtil,
  updateCSSBackground as updateCSSBackgroundUtil,
  listenForDPRChange as listenForDPRChangeUtil,
} from './ViewerCanvasSetup';

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
/** @deprecated Use the unified key below. Kept only for backward-compat migration. */
const LEGACY_MISSING_FRAME_MODE_STORAGE_KEY = 'openrv.missingFrameMode';
const MISSING_FRAME_MODE_STORAGE_KEY = 'openrv-prefs-missing-frame-mode';

export type MissingFrameMode = 'off' | 'show-frame' | 'hold' | 'black';

export class Viewer {
  private container: HTMLElement;
  private canvasContainer: HTMLElement;
  private imageCanvas: HTMLCanvasElement;
  private watermarkCanvas: HTMLCanvasElement;
  private paintCanvas: HTMLCanvasElement;
  private imageCtx: CanvasRenderingContext2D;
  private watermarkCtx: CanvasRenderingContext2D;
  private paintCtx: CanvasRenderingContext2D;
  private watermarkDirty = true;
  private lastWatermarkGLActive = false;
  private paintHasContent = false;
  private paintDirty = true;
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

  // Multi-listener support for view changes (pan/zoom)
  private _viewChangeListeners = new Set<(panX: number, panY: number, zoom: number) => void>();
  private _externalViewChangedCallback: ((panX: number, panY: number, zoom: number) => void) | null = null;

  // Paint overlay dimensions/offsets in logical pixels.
  private paintLogicalWidth = 0;
  private paintLogicalHeight = 0;
  private paintOffsetX = 0;
  private paintOffsetY = 0;

  // Spherical (360) projection reference (wired from AppControlRegistry)
  private _sphericalProjection: import('../../render/SphericalProjection').SphericalProjection | null = null;
  private _sphericalUniformsCallback: (() => void) | null = null;

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
  private pipelineSingleLUTActive = false;

  // A/B Compare indicator
  private abIndicator: HTMLElement | null = null;

  // 2D Transform -> moved to transformManager

  // Filter effects
  private filterSettings: FilterSettings = { ...DEFAULT_FILTER_SETTINGS };

  // Texture filter mode (nearest-neighbor vs bilinear)
  private _textureFilterMode: TextureFilterMode = 'linear';
  private filterModeIndicator: HTMLElement | null = null;
  private filterModeTimeout: ReturnType<typeof setTimeout> | null = null;
  private filterModeBadge: HTMLElement | null = null;
  private noiseReductionParams: NoiseReductionParams = { ...DEFAULT_NOISE_REDUCTION_PARAMS };
  private sharpenProcessor: WebGLSharpenProcessor | null = null;
  private noiseReductionProcessor: ReturnType<typeof createNoiseReductionProcessor> | null = null;

  // CPU effect processor for half-res clarity/sharpen
  private effectProcessor: EffectProcessor = new EffectProcessor();

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
  private subs = new DisposableSubscriptionManager();

  // Reference image overlay (for A/B reference comparison)
  private _referenceCanvas: HTMLCanvasElement | null = null;
  private _referenceCtx: CanvasRenderingContext2D | null = null;

  // Scale ratio indicator overlay (transient zoom feedback)
  private scaleRatioIndicator: ScaleRatioIndicator | null = null;

  // Display capabilities for wide color gamut / HDR support
  private capabilities: DisplayCapabilities | undefined;
  private canvasColorSpace: 'display-p3' | undefined;
  private lastSystemHDRHeadroom = 1.0;

  // WebGL/HDR rendering manager (owns GL canvas, Renderer, worker proxy)
  private glRendererManager!: ViewerGLRenderer;

  // Cached context adapters (lazily created, reused across calls)
  private _glRendererContext: GLRendererContext | null = null;
  private _inputContext: import('./ViewerInputHandler').ViewerInputContext | null = null;
  private _pixelEffectsContext: PixelEffectsContext | null = null;
  private _imageRendererContext: ImageRendererContext | null = null;
  private _canvasSetupContext: CanvasSetupContext | null = null;

  /**
   * Create a GLRendererContext adapter that the ViewerGLRenderer uses
   * to access Viewer state without tight coupling.
   */
  private asGLRendererContext(): GLRendererContext {
    if (this._glRendererContext) return this._glRendererContext;
    this._glRendererContext = {
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
      isInteractionActive: () => this.interactionQuality.isInteracting,
      isToneMappingEnabled: () => this.isToneMappingEnabled(),
      getDeinterlaceParams: () => this.getDeinterlaceParams(),
      getFilmEmulationParams: () => this.getFilmEmulationParams(),
      getPerspectiveParams: () => this.getPerspectiveParams(),
      getGamutMappingState: () => this.getGamutMappingState(),
      getNoiseReductionParams: () => this.getNoiseReductionParams(),
      getLuminanceVisualization: () => this.overlayManager.getLuminanceVisualization(),
    };
    return this._glRendererContext;
  }

  /**
   * Create an adapter that the ViewerInputHandler uses to access Viewer
   * state and invoke side-effects without tight coupling.
   */
  private asInputContext(): import('./ViewerInputHandler').ViewerInputContext {
    if (this._inputContext) return this._inputContext;
    this._inputContext = {
      getContainer: () => this.container,
      getCanvasContainer: () => this.canvasContainer,
      getImageCanvas: () => this.imageCanvas,
      getPaintCanvas: () => this.paintCanvas,
      getPaintCtx: () => this.paintCtx,
      getImageCtx: () => this.imageCtx,
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
      getSphericalProjection: () => this._sphericalProjection,
      getGLRenderer: () => this.glRendererManager.glRenderer,
      isGLRendererActive: () => this.glRendererManager.hdrRenderActive || this.glRendererManager.sdrWebGLRenderActive,
      isViewerContentElement: (el: HTMLElement) => this.isViewerContentElement(el),
      scheduleRender: () => this.scheduleRender(),
      updateCanvasPosition: () => this.updateCanvasPosition(),
      updateSphericalUniforms: () => this._sphericalUniformsCallback?.(),
      renderPaint: () => this.renderPaint(),
      invalidateGLRenderCache: () => this.glRendererManager.invalidateRenderCache(),
    };
    return this._inputContext;
  }

  /**
   * Create a PixelEffectsContext adapter for ViewerPixelEffects.
   */
  private asPixelEffectsContext(): PixelEffectsContext {
    if (this._pixelEffectsContext) return this._pixelEffectsContext;
    this._pixelEffectsContext = {
      getColorPipeline: () => this.colorPipeline,
      getFilterSettings: () => this.filterSettings,
      getChannelMode: () => this.channelMode,
      getColorWheels: () => this.colorWheels,
      getHSLQualifier: () => this.hslQualifier,
      getOverlayManager: () => this.overlayManager,
      getEffectProcessor: () => this.effectProcessor,
      getSharpenProcessor: () => this.sharpenProcessor,
      getNoiseReductionProcessor: () => this.noiseReductionProcessor,
      getDeinterlaceParams: () => this.deinterlaceParams,
      getFilmEmulationParams: () => this.filmEmulationParams,
      getStabilizationParams: () => this.stabilizationParams,
      getNoiseReductionParams: () => this.noiseReductionParams,
      getBackgroundPatternState: () => this.backgroundPatternState,
      getInteractionQuality: () => this.interactionQuality,
      getImageCtx: () => this.imageCtx,
      getCanvasColorSpace: () => this.canvasColorSpace,
      getBgCompositeTempCanvas: () => this.bgCompositeTempCanvas,
      setBgCompositeTempCanvas: (canvas) => {
        this.bgCompositeTempCanvas = canvas;
      },
      getBgCompositeTempCtx: () => this.bgCompositeTempCtx,
      setBgCompositeTempCtx: (ctx) => {
        this.bgCompositeTempCtx = ctx;
      },
      getAsyncEffectsGeneration: () => this._asyncEffectsGeneration,
      getCropManager: () => this.cropManager,
    };
    return this._pixelEffectsContext;
  }

  /**
   * Create an ImageRendererContext adapter for ViewerImageRenderer.
   */
  private asImageRendererContext(): ImageRendererContext {
    if (this._imageRendererContext) return this._imageRendererContext;
    this._imageRendererContext = {
      getSession: () => this.session,
      getImageCtx: () => this.imageCtx,
      getWipeManager: () => this.wipeManager,
      getGhostFrameManager: () => this.ghostFrameManager,
      getTransform: () => this.transformManager.transform,
      getTextureFilterMode: () => this._textureFilterMode,
      getCanvasFilterString: () => this.getCanvasFilterString(),
      getStackLayers: () => this.stackLayers,
      isStackEnabled: () => this.isStackEnabled(),
      isBlendModeEnabled: () => this.isBlendModeEnabled(),
      getBlendModeState: () => this.blendModeState,
      getDifferenceMatteState: () => this.differenceMatteState,
      getPrerenderBuffer: () => this.prerenderBuffer,
      getFrameFetchTracker: () => this.frameFetchTracker,
      getFrameInterpolator: () => this.frameInterpolator,
      getCanvasColorSpace: () => this.canvasColorSpace,
      getDisplayWidth: () => this.displayWidth,
      getDisplayHeight: () => this.displayHeight,
      drawWithTransform: (ctx, element, w, h) => this.drawWithTransform(ctx, element, w, h),
      renderSourceToImageData: (sourceIndex, width, height) => this.renderSourceToImageData(sourceIndex, width, height),
      drawClippedSource: (canvasCtx, element, clipX, clipY, clipWidth, clipHeight, displayWidth, displayHeight) =>
        this.drawClippedSource(canvasCtx, element, clipX, clipY, clipWidth, clipHeight, displayWidth, displayHeight),
      refresh: () => this.refresh(),
    };
    return this._imageRendererContext;
  }

  /**
   * Create a CanvasSetupContext adapter for ViewerCanvasSetup.
   */
  private asCanvasSetupContext(): CanvasSetupContext {
    if (this._canvasSetupContext) return this._canvasSetupContext;
    this._canvasSetupContext = {
      getContainer: () => this.container,
      getCanvasContainer: () => this.canvasContainer,
      getImageCanvas: () => this.imageCanvas,
      getWatermarkCanvas: () => this.watermarkCanvas,
      getPaintCanvas: () => this.paintCanvas,
      getImageCtx: () => this.imageCtx,
      getWatermarkCtx: () => this.watermarkCtx,
      getPaintCtx: () => this.paintCtx,
      getTransformManager: () => this.transformManager,
      getGLRendererManager: () => this.glRendererManager,
      getCropManager: () => this.cropManager,
      getOverlayManager: () => this.overlayManager,
      getPerspectiveGridOverlay: () => this.perspectiveGridOverlay,
      getContainerRect: () => this.getContainerRect(),
      getDisplayWidth: () => this.displayWidth,
      getDisplayHeight: () => this.displayHeight,
      setDisplayWidth: (w) => {
        this.displayWidth = w;
      },
      setDisplayHeight: (h) => {
        this.displayHeight = h;
      },
      getSourceWidth: () => this.sourceWidth,
      getSourceHeight: () => this.sourceHeight,
      setSourceWidth: (w) => {
        this.sourceWidth = w;
      },
      setSourceHeight: (h) => {
        this.sourceHeight = h;
      },
      getPhysicalWidth: () => this.physicalWidth,
      getPhysicalHeight: () => this.physicalHeight,
      setPhysicalWidth: (w) => {
        this.physicalWidth = w;
      },
      setPhysicalHeight: (h) => {
        this.physicalHeight = h;
      },
      getPaintLogicalWidth: () => this.paintLogicalWidth,
      getPaintLogicalHeight: () => this.paintLogicalHeight,
      setPaintLogicalWidth: (w) => {
        this.paintLogicalWidth = w;
      },
      setPaintLogicalHeight: (h) => {
        this.paintLogicalHeight = h;
      },
      getPaintOffsetX: () => this.paintOffsetX,
      getPaintOffsetY: () => this.paintOffsetY,
      setPaintOffsetX: (x) => {
        this.paintOffsetX = x;
      },
      setPaintOffsetY: (y) => {
        this.paintOffsetY = y;
      },
      setPaintDirty: (dirty) => {
        this.paintDirty = dirty;
      },
      setWatermarkDirty: (dirty) => {
        this.watermarkDirty = dirty;
      },
    };
    return this._canvasSetupContext;
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
    this.interactionQuality.setOnQualityChange(() => {
      // When quality is restored (interaction ended), invalidate half-res prerender cache
      if (!this.interactionQuality.cpuHalfRes && this.prerenderBuffer) {
        this.prerenderBuffer.invalidateAll();
      }
      this.scheduleRender();
    });

    // Wire up transform manager interaction callbacks for smooth zoom animations
    this.transformManager.setInteractionCallbacks(
      () => this.interactionQuality.beginInteraction(),
      () => this.interactionQuality.endInteraction(),
    );

    // Wire up zoom change callback for scale ratio indicator
    this.transformManager.setOnZoomChanged((zoom: number) => {
      if (this.scaleRatioIndicator) {
        const fitScale = this.getFitScale();
        const ratio = zoomToRatio(zoom, fitScale);
        const isFit = Math.abs(zoom - 1) < 0.001;
        this.scaleRatioIndicator.show(ratio, isFit);
      }
    });

    // Wire up multiplexed view change dispatch for external + multi-listener
    this.transformManager.setOnViewChanged(() => {
      this.notifyViewChangeListeners();
    });

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

    // Create scale ratio indicator (transient zoom feedback overlay)
    this.scaleRatioIndicator = new ScaleRatioIndicator(this.container);

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
    if (
      this.capabilities?.displayHDR &&
      !this.capabilities?.webglHLG &&
      !this.capabilities?.webglPQ &&
      !(this.capabilities?.webglDrawingBufferStorage && this.capabilities?.canvasExtendedHDR)
    ) {
      const tryCanvas2DFallback = () => {
        if (this.capabilities && (this.capabilities.canvasHLG || this.capabilities.canvasFloat16)) {
          console.log('[Viewer] Trying Canvas2D HDR blit as last resort');
          this.glRendererManager.initCanvas2DHDRBlit();
        }
      };

      if (this.capabilities?.webgpuAvailable) {
        detectWebGPUHDR()
          .then((available) => {
            if (available && this.capabilities) {
              this.capabilities.webgpuHDR = available;
              console.log('[Viewer] WebGPU HDR available, initializing blit');
              this.glRendererManager.initWebGPUHDRBlit();
            } else {
              tryCanvas2DFallback();
            }
          })
          .catch((err) => {
            log.warn('WebGPU HDR check failed, falling back to Canvas2D:', err);
            tryCanvas2DFallback();
          });
      } else {
        tryCanvas2DFallback();
      }
    }

    // Query system HDR headroom asynchronously and propagate it to the renderer.
    // This lets shader tone mapping scale to the actual display capability.
    this.syncHDRHeadroomFromSystem();

    // Create watermark overlay canvas (between image/GL and paint annotations)
    this.watermarkCanvas = document.createElement('canvas');
    this.watermarkCanvas.dataset.testid = 'viewer-watermark-canvas';
    this.watermarkCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      display: none;
    `;
    this.canvasContainer.appendChild(this.watermarkCanvas);

    // Create paint canvas (top layer, overlaid)
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.dataset.testid = 'viewer-paint-canvas';
    this.paintCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      display: none;
    `;
    this.canvasContainer.appendChild(this.paintCanvas);

    // Create perspective grid overlay
    this.perspectiveGridOverlay = new PerspectiveGridOverlay();
    this.canvasContainer.appendChild(this.perspectiveGridOverlay.getElement());

    // Create crop manager (creates and appends crop overlay canvas)
    this.cropManager = new CropManager(
      {
        container: this.container,
        canvasContainer: this.canvasContainer,
        getSession: () => this.session,
        getDisplayDimensions: () => ({ width: this.displayWidth, height: this.displayHeight }),
        getSourceDimensions: () => ({ width: this.sourceWidth, height: this.sourceHeight }),
        scheduleRender: () => this.scheduleRender(),
      },
      this.canvasColorSpace,
    );

    // Create overlay manager (safe areas, matte, timecode, pixel probe,
    // false color, luminance visualization, zebra stripes, clipping, spotlight)
    this.overlayManager = new OverlayManager(this.canvasContainer, this.session, {
      refresh: () => this.refresh(),
      onProbeStateChanged: (enabled) => this.updateCursorForProbe(enabled),
    });

    // Missing-frame overlay (rendered above image canvas when sequence gaps are encountered)
    this.canvasContainer.appendChild(this.missingFrameOverlay.render());

    // Re-render when watermark settings change
    this.subs.add(
      this.watermarkOverlay.on('stateChanged', () => {
        this.watermarkDirty = true;
        this.scheduleRender();
      }),
    );

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
      getSourceDimensions: () => ({ width: this.sourceWidth, height: this.sourceHeight }),
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
    this.subs.add(
      this.colorWheels.on('stateChanged', () => {
        this.notifyEffectsChanged();
        this.refresh();
      }),
    );

    // Create HSL Qualifier (secondary color correction)
    this.hslQualifier = new HSLQualifier();
    this.subs.add(
      this.hslQualifier.on('stateChanged', () => {
        this.notifyEffectsChanged();
        this.refresh();
      }),
    );

    // Use willReadFrequently for better getImageData performance during effect processing
    // Use P3 color space when available for wider gamut output
    const imageCtx = safeCanvasContext2D(
      this.imageCanvas,
      { alpha: false, willReadFrequently: true },
      this.canvasColorSpace,
    );
    this.imageCtx = imageCtx;

    const watermarkCtx = safeCanvasContext2D(this.watermarkCanvas, {}, this.canvasColorSpace);
    this.watermarkCtx = watermarkCtx;

    const paintCtx = safeCanvasContext2D(this.paintCanvas, {}, this.canvasColorSpace);
    this.paintCtx = paintCtx;

    // Create wipe + split screen UI elements
    this.wipeManager.initUI(this.container);

    // Create LUT indicator badge
    this.lutIndicator = createLutIndicator();
    this.container.appendChild(this.lutIndicator);

    // Create A/B indicator badge
    this.abIndicator = createABIndicator();
    this.container.appendChild(this.abIndicator);

    // Create filter mode persistent badge (hidden when mode is 'linear', shown for 'nearest')
    this.filterModeBadge = createFilterModeBadge();
    this.container.appendChild(this.filterModeBadge);

    // Load filter mode from localStorage
    this._textureFilterMode = loadFilterModePreference();
    if (this._textureFilterMode === 'nearest') {
      this.glRendererManager.setFilterMode('nearest');
      if (this.filterModeBadge) this.filterModeBadge.style.display = 'block';
    }

    // Listen for A/B changes
    this.subs.add(
      this.session.on('abSourceChanged', ({ current }) => {
        this.updateABIndicator(current);
        // Source switching during playback reuses stale frame-fetch state unless reset.
        this.frameFetchTracker.reset();
        this.scheduleRender();
      }),
    );

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
      this.notifyViewChangeListeners();
      this.scheduleRender();
    });
    this.resizeObserver.observe(this.container);

    // Create input handler (pointer/wheel/drag-drop events, pan/zoom, live paint)
    this.inputHandler = new ViewerInputHandler(this.asInputContext(), this.dropOverlay);

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

    // Initialize WebGL noise reduction processor (GPU fast-path)
    try {
      this.noiseReductionProcessor = createNoiseReductionProcessor();
    } catch (e) {
      console.warn('WebGL noise reduction processor not available, falling back to CPU:', e);
      this.noiseReductionProcessor = null;
    }

    // Listen for theme changes to redraw placeholders and overlays with updated colors
    this.subs.add(getThemeManager().on('themeChanged', () => this.scheduleRender()));
  }

  private initializeCanvas(): void {
    initializeCanvasUtil(this.asCanvasSetupContext());
  }

  /**
   * Set canvas size for media rendering (standard mode, no hi-DPI scaling).
   * This resets any hi-DPI configuration from placeholder mode.
   * The 2D canvases stay at logical resolution; the GL canvas is sized at
   * physical (DPR-scaled) resolution for retina sharpness.
   */
  private setCanvasSize(width: number, height: number): void {
    setCanvasSizeUtil(this.asCanvasSetupContext(), width, height);
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
    updatePaintCanvasSizeUtil(
      this.asCanvasSetupContext(),
      logicalWidth,
      logicalHeight,
      containerWidth,
      containerHeight,
    );
  }

  /**
   * Draw placeholder content with hi-DPI support for crisp text.
   * Sets up the canvas for hi-DPI rendering before drawing.
   */
  private drawPlaceholder(): void {
    drawPlaceholderCanvasUtil(this.asCanvasSetupContext());
  }

  /**
   * Query system HDR headroom and apply it to the GL renderer manager.
   * Safe no-op when the API is unavailable or permission is denied.
   */
  private syncHDRHeadroomFromSystem(): void {
    if (!this.capabilities?.displayHDR) return;

    void queryHDRHeadroom()
      .then((headroom) => {
        if (typeof headroom !== 'number' || !Number.isFinite(headroom) || headroom <= 0) {
          return;
        }
        if (headroom === this.lastSystemHDRHeadroom) return;
        this.lastSystemHDRHeadroom = headroom;
        this.glRendererManager.setHDRHeadroom(headroom);
        log.info(`System HDR headroom detected: ${headroom.toFixed(2)}x`);
        this.scheduleRender();
      })
      .catch((err) => {
        log.debug('HDR headroom query unavailable:', err);
      });
  }

  private bindEvents(): void {
    // Pointer, wheel, drag-drop, and context menu events (delegated to input handler)
    this.inputHandler.bindEvents();

    // Session events
    this.subs.add(
      this.session.on('sourceLoaded', () => {
        this.frameFetchTracker.reset();
        this.syncHDRHeadroomFromSystem();
        this.scheduleRender();
      }),
    );
    this.subs.add(
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
          if (source?.element && !source.fileSourceNode?.isHDR() && !source.videoSourceNode?.isHDR()) {
            this.glRendererManager.renderWorkerProxy.prepareFrame(source.element as unknown as HTMLImageElement);
          }
        }

        // Annotations are per-frame, so the paint canvas must be redrawn
        this.paintDirty = true;
        this.scheduleRender();
      }),
    );

    // Paint events
    this.subs.add(
      this.paintEngine.on('annotationsChanged', () => {
        this.paintDirty = true;
        this.renderPaint();
      }),
    );
    this.subs.add(this.paintEngine.on('toolChanged', (tool) => this.inputHandler.updateCursor(tool)));

    // Pixel probe + cursor color events - single handler for both consumers
    this.container.addEventListener('mousemove', this.pixelSamplingManager.onMouseMoveForPixelSampling);
    this.container.addEventListener('pointerleave', this.pixelSamplingManager.onMouseLeaveForCursorColor);
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
    const onDPRChange = () => {
      // Recompute physical dims and re-render
      if (this.displayWidth > 0 && this.displayHeight > 0) {
        const dpr = window.devicePixelRatio || 1;
        this.physicalWidth = Math.max(1, Math.round(this.displayWidth * dpr));
        this.physicalHeight = Math.max(1, Math.round(this.displayHeight * dpr));
        this.glRendererManager.resizeIfActive(this.physicalWidth, this.physicalHeight);
        const containerRect = this.getContainerRect();
        this.updatePaintCanvasSize(this.displayWidth, this.displayHeight, containerRect.width, containerRect.height);
        this.syncHDRHeadroomFromSystem();
        this.scheduleRender();
      }
      // Re-register for the new DPR value
      this.listenForDPRChange();
    };

    this._dprCleanup = listenForDPRChangeUtil(onDPRChange, this._dprCleanup);
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
      this.wipeManager.splitLine,
    );
  }

  // Interaction methods (getCanvasPoint, pointer/wheel/drag handlers, live stroke/shape,
  // pinch zoom, cursor management) have been extracted to ViewerInputHandler.

  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Set a callback invoked when an `.orvproject` file is dropped onto the viewer.
   * Wired by AppPlaybackWiring to route to the persistence manager.
   */
  setOnProjectFileDrop(cb: ((file: File, companionFiles: File[]) => void) | null): void {
    this.inputHandler.onProjectFileDrop = cb;
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
      // Try unified key first
      const stored = localStorage.getItem(MISSING_FRAME_MODE_STORAGE_KEY);
      if (stored === 'off' || stored === 'show-frame' || stored === 'hold' || stored === 'black') {
        return stored;
      }
      // Backward compat: migrate from legacy key
      const legacy = localStorage.getItem(LEGACY_MISSING_FRAME_MODE_STORAGE_KEY);
      if (legacy === 'off' || legacy === 'show-frame' || legacy === 'hold' || legacy === 'black') {
        // Migrate: write to unified key and remove legacy key
        localStorage.setItem(MISSING_FRAME_MODE_STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_MISSING_FRAME_MODE_STORAGE_KEY);
        return legacy;
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
   * Fit image width to the container width.
   */
  fitToWidth(): void {
    this.transformManager.fitToWidth();
    this.scheduleRender();
    this.showFitModeIndicator('width');
  }

  /**
   * Fit image height to the container height.
   */
  fitToHeight(): void {
    this.transformManager.fitToHeight();
    this.scheduleRender();
    this.showFitModeIndicator('height');
  }

  /**
   * Fit width with a smooth animated transition.
   */
  smoothFitToWidth(): void {
    this.transformManager.smoothFitToWidth();
    this.showFitModeIndicator('width');
  }

  /**
   * Fit height with a smooth animated transition.
   */
  smoothFitToHeight(): void {
    this.transformManager.smoothFitToHeight();
    this.showFitModeIndicator('height');
  }

  /**
   * Get the current fit mode.
   */
  getFitMode(): string | null {
    return this.transformManager.fitMode;
  }

  /**
   * Show a brief transient indicator when fit mode changes.
   */
  private showFitModeIndicator(mode: 'all' | 'width' | 'height'): void {
    showFitModeIndicatorUtil(this.container, mode);
  }

  /**
   * Animate zoom smoothly to a target level over a given duration.
   * Uses requestAnimationFrame with ease-out cubic interpolation.
   * Also animates pan position to the target values.
   */
  smoothZoomTo(targetZoom: number, duration: number = 200, targetPanX?: number, targetPanY?: number): void {
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

  /**
   * Get the current fitScale (base scale at zoom=1).
   * Returns the ratio between display size and source size when fitting to window.
   *
   * IMPORTANT: Uses effective (post-rotation) source dimensions to account
   * for 90/270 degree rotation, where width and height are swapped.
   */
  getFitScale(): number {
    const containerRect = this.getContainerRect();
    const { width: effectiveWidth, height: effectiveHeight } = this.getEffectiveDimensions();
    return calculateFitScale(effectiveWidth, effectiveHeight, containerRect.width, containerRect.height);
  }

  /**
   * Get the current pixel ratio (source pixels per display pixel).
   */
  getPixelRatio(): number {
    return zoomToRatio(this.transformManager.getZoom(), this.getFitScale());
  }

  /**
   * Smoothly zoom to a specific pixel ratio (e.g. 1.0 for 1:1, 2.0 for 2:1).
   * Centers on the image center (pan 0,0).
   *
   * Note: "1:1" means one source pixel per CSS/logical pixel, not per physical
   * pixel. On Retina displays, source pixels will span multiple physical pixels.
   * This matches desktop RV, Nuke, and DaVinci Resolve behavior.
   */
  smoothSetPixelRatio(ratio: number): void {
    const fitScale = this.getFitScale();
    const targetZoom = ratioToZoom(ratio, fitScale);
    this.transformManager.smoothZoomTo(targetZoom, 200, 0, 0);
  }

  /**
   * Get the effective source image dimensions (post-rotation).
   * When rotated 90/270 degrees, width and height are swapped.
   */
  getEffectiveDimensions(): { width: number; height: number } {
    const userRotation = this.transformManager.transform.rotation;
    return getEffectiveDimensions(this.sourceWidth, this.sourceHeight, userRotation);
  }

  private updateCanvasPosition(): void {
    updateCanvasPositionUtil(this.asCanvasSetupContext());
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

    // During an advanced (pixel-destructive) tool stroke, skip renderImage()
    // for the SDR path so the in-place image canvas modifications are preserved.
    // For the HDR/GL path, renderImage is still called but the GL render cache
    // was invalidated so it redraws from the modified texture without re-uploading.
    if (
      !this.inputHandler.advancedDrawing ||
      this.glRendererManager.hdrRenderActive ||
      this.glRendererManager.sdrWebGLRenderActive
    ) {
      this.renderImage();
    }
    this.renderWatermarkOverlayCanvas();

    // If actively drawing, render with live stroke/shape; otherwise just paint
    PerfTrace.begin('paint+crop');
    if (this.inputHandler.drawing && this.inputHandler.currentLivePoints.length > 0) {
      this.paintCanvas.style.display = '';
      this.inputHandler.renderLiveStroke();
    } else if (
      this.inputHandler.drawingShape &&
      this.inputHandler.currentShapeStart &&
      this.inputHandler.currentShapeCurrent
    ) {
      this.paintCanvas.style.display = '';
      this.inputHandler.renderLiveShape();
    } else if (!this.inputHandler.advancedDrawing) {
      // Skip renderPaint during advanced tool strokes so annotations overlay
      // is preserved and doesn't clear the visible state.
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
  private renderHDRWithWebGL(
    image: import('../../core/image/Image').IPImage,
    _displayWidth: number,
    _displayHeight: number,
  ) {
    const { w, h } = this.interactionQuality.getEffectiveViewport(this.physicalWidth, this.physicalHeight);
    return this.glRendererManager.renderHDRWithWebGL(image, w, h);
  }
  private deactivateHDRMode() {
    this.glRendererManager.deactivateHDRMode();
  }
  private deactivateSDRWebGLMode() {
    this.glRendererManager.deactivateSDRWebGLMode();
  }
  private hasGPUShaderEffectsActive() {
    return this.glRendererManager.hasGPUShaderEffectsActive();
  }
  private hasCPUOnlyEffectsActive() {
    return this.glRendererManager.hasCPUOnlyEffectsActive();
  }
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
    const isCurrentHDR =
      source?.fileSourceNode?.isHDR() === true ||
      source?.videoSourceNode?.isHDR() === true ||
      source?.proceduralSourceNode != null;
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
        const holdFrameIndex = Math.max(1, currentFrame - 1);
        const holdFrame = this.session.getSequenceFrameSync(holdFrameIndex);
        if (holdFrame) {
          element = holdFrame;
        } else {
          // Keep hold mode responsive on cache misses: fetch the hold frame in background,
          // then redraw. In the meantime prefer current frame cache over frame-1 fallback.
          this.session
            .getSequenceFrameImage?.(holdFrameIndex)
            ?.then((image) => {
              if (image) {
                this.refresh();
              }
            })
            .catch((err) => log.warn('Failed to load hold frame:', err));
          element = this.session.getSequenceFrameSync(currentFrame) ?? source.element;
        }
      } else {
        const frameImage = this.session.getSequenceFrameSync();
        if (frameImage) {
          element = frameImage;
        } else {
          // Frame not loaded yet - trigger async load
          this.session
            .getSequenceFrameImage()
            .then((image) => {
              if (image) {
                this.refresh();
              }
            })
            .catch((err) => log.warn('Failed to load sequence frame:', err));
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
        if (
          !this.frameFetchTracker.pendingVideoFrameFetch ||
          this.frameFetchTracker.pendingVideoFrameNumber !== currentFrame
        ) {
          // Cancel tracking of old fetch (it will complete but we'll ignore its refresh)
          this.frameFetchTracker.pendingVideoFrameNumber = currentFrame;
          const frameToFetch = currentFrame;

          this.frameFetchTracker.pendingVideoFrameFetch = this.session
            .fetchCurrentVideoFrame(frameToFetch)
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
        element = source.fileSourceNode.getCanvas() ?? source.fileSourceNode.getElement(0) ?? undefined;
      }
      // For HDR: element stays undefined here; we intercept after displayWidth/Height are calculated
    } else {
      // Fallback: use HTMLVideoElement directly (no mediabunny)
      element = source?.element;
    }

    // HDR sources may have no element (they render via WebGL); treat them as valid
    const hdrFileSource = source?.fileSourceNode?.isHDR() ? source.fileSourceNode : null;
    const isHDRVideo = source?.videoSourceNode?.isHDR() === true;
    const hdrProceduralSource = source?.proceduralSourceNode ?? null;
    if (!source || (!element && !hdrFileSource && !isHDRVideo && !hdrProceduralSource)) {
      // Placeholder mode
      this.sourceWidth = 640;
      this.sourceHeight = 360;

      const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
        this.sourceWidth,
        this.sourceHeight,
        containerWidth,
        containerHeight,
        this.transformManager.zoom,
        this.transformManager.fitMode ?? 'all',
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
      userRotation,
    );

    const { width: displayWidth, height: displayHeight } = calculateDisplayDimensions(
      effectiveWidth,
      effectiveHeight,
      containerWidth,
      containerHeight,
      this.transformManager.zoom,
      this.transformManager.fitMode ?? 'all',
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
        cappedW < source.width || cappedH < source.height ? { w: cappedW, h: cappedH } : undefined, // full resolution
      );

      // Set stable HDR target size using actual display dimensions (not interaction-reduced).
      // HDR frames are cached in an LRU and should always be at full display quality.
      const hdrW = Math.min(this.physicalWidth, source.width);
      const hdrH = Math.min(this.physicalHeight, source.height);
      source.videoSourceNode.setHDRTargetSize(
        hdrW < source.width || hdrH < source.height ? { w: hdrW, h: hdrH } : undefined,
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
          this.session.preloadVideoHDRFrames(currentFrame).catch((err) => {
            log.debug('HDR frame preload error:', err);
          });
        }
        return; // HDR video path complete
      }
      // Start async HDR frame fetch if not cached
      if (!hdrIPImage) {
        this.session
          .fetchVideoHDRFrame(currentFrame)
          .then(() => this.refresh())
          .catch((err) => log.warn('Failed to fetch HDR video frame:', err));
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
    } else if (hdrProceduralSource) {
      // Procedural sources produce float32 IPImage — render via WebGL HDR path
      const ipImage = hdrProceduralSource.getIPImage();
      if (ipImage && this.renderHDRWithWebGL(ipImage, displayWidth, displayHeight)) {
        this.updateCanvasPosition();
        this.updateWipeLine();
        return; // Procedural HDR path complete
      }
      // Fallback: convert to ImageData and use 2D canvas
      if (ipImage) {
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = ipImage.width;
        fallbackCanvas.height = ipImage.height;
        const fallbackCtx = fallbackCanvas.getContext('2d');
        if (fallbackCtx) {
          fallbackCtx.putImageData(ipImage.toImageData(), 0, 0);
          element = fallbackCanvas;
        }
      }
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
      if (
        this.renderSDRWithWebGL(
          element as HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageBitmap,
          displayWidth,
          displayHeight,
        )
      ) {
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
      this.cropManager.drawUncropBackground(
        this.imageCtx,
        displayWidth,
        displayHeight,
        uncropOffsetX,
        uncropOffsetY,
        imageDisplayW,
        imageDisplayH,
      );
    }

    // Image smoothing respects texture filter mode (nearest = pixel-accurate QC)
    this.imageCtx.imageSmoothingEnabled = this._textureFilterMode === 'linear';
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
      this.prerenderBuffer.setHalfRes(this.interactionQuality.cpuHalfRes);
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
          this.cropManager.drawUncropBackground(
            this.imageCtx,
            displayWidth,
            displayHeight,
            uncropOffsetX,
            uncropOffsetY,
            imageDisplayW,
            imageDisplayH,
          );
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

    if (
      !rendered &&
      (element instanceof HTMLImageElement ||
        element instanceof HTMLVideoElement ||
        element instanceof HTMLCanvasElement ||
        element instanceof ImageBitmap ||
        (typeof OffscreenCanvas !== 'undefined' && element instanceof OffscreenCanvas))
    ) {
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
        this.imageCtx,
        displayWidth,
        displayHeight,
        this._asyncEffectsGeneration,
        cropClipActive,
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
    displayHeight: number,
  ): void {
    drawWithTransformUtil(
      ctx,
      element,
      displayWidth,
      displayHeight,
      this.transformManager.transform,
      this._textureFilterMode === 'linear',
    );
  }

  private renderWithWipe(element: CanvasImageSource, displayWidth: number, displayHeight: number): void {
    renderWithWipeUtil(this.asImageRendererContext(), element, displayWidth, displayHeight);
  }

  /**
   * Render split screen A/B comparison.
   * Shows source A on one side and source B on the other, using canvas clipping.
   */
  private renderSplitScreen(displayWidth: number, displayHeight: number): void {
    renderSplitScreenUtil(this.asImageRendererContext(), displayWidth, displayHeight);

    // Update split screen UI elements
    this.updateSplitScreenLine();
  }

  private drawClippedSource(
    canvasCtx: CanvasRenderingContext2D,
    element: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap,
    clipX: number,
    clipY: number,
    clipWidth: number,
    clipHeight: number,
    displayWidth: number,
    displayHeight: number,
  ): void {
    drawClippedSourceUtil(
      this.asImageRendererContext(),
      canvasCtx,
      element,
      clipX,
      clipY,
      clipWidth,
      clipHeight,
      displayWidth,
      displayHeight,
    );
  }

  private renderSourceToImageData(sourceIndex: number, width: number, height: number): ImageData | null {
    return renderSourceToImageDataUtil(this.asImageRendererContext(), sourceIndex, width, height);
  }

  private getCanvasFilterString(): string {
    return getCanvasFilterStringUtil(this.colorPipeline.colorAdjustments, this.filterStringCache);
  }

  private renderPaint(): void {
    if (this.displayWidth === 0 || this.displayHeight === 0) return;

    // Get annotations with ghost effect, filtering by current A/B version
    const version = this.paintEngine.annotationVersion;
    const versionFilter = version === 'all' ? undefined : version;
    const annotations = this.paintEngine.getAnnotationsWithGhost(this.session.currentFrame, versionFilter);

    if (annotations.length === 0) {
      // Only clear if we previously had content
      if (this.paintHasContent) {
        const ctx = this.paintCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);
        this.paintHasContent = false;
        this.paintCanvas.style.display = 'none';
      }
      this.paintDirty = false;
      return;
    }

    // Skip expensive clear+redraw when annotations haven't changed since last paint
    if (!this.paintDirty && this.paintHasContent) return;

    // Keep paint surface in sync with current viewport and pan offset so
    // off-image annotations remain visible around the image area.
    const containerRect = this.getContainerRect();
    this.updatePaintCanvasSize(this.displayWidth, this.displayHeight, containerRect.width, containerRect.height);

    const ctx = this.paintCtx;
    // Clear at physical resolution (no DPR scale on paint canvas context)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.paintCanvas.width, this.paintCanvas.height);

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
    this.paintHasContent = true;
    this.paintDirty = false;
    this.paintCanvas.style.display = '';
  }

  /**
   * Composite watermark on a dedicated overlay canvas when WebGL output is active.
   * In the 2D path, watermark is drawn directly into imageCanvas at the end of renderImage().
   */
  private renderWatermarkOverlayCanvas(): void {
    const isWebGLActive = this.glRendererManager.hdrRenderActive || this.glRendererManager.sdrWebGLRenderActive;
    if (isWebGLActive !== this.lastWatermarkGLActive) {
      this.watermarkDirty = true;
      this.lastWatermarkGLActive = isWebGLActive;
    }

    if (!this.watermarkDirty) return;
    this.watermarkDirty = false;
    const shouldRender = isWebGLActive && this.watermarkOverlay.isEnabled() && this.watermarkOverlay.hasImage();
    this.watermarkCanvas.style.display = shouldRender ? '' : 'none';

    if (!shouldRender) return;

    this.watermarkCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.watermarkCtx.clearRect(0, 0, this.watermarkCanvas.width, this.watermarkCanvas.height);
    this.watermarkOverlay.render(this.watermarkCtx, this.displayWidth, this.displayHeight);
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

  /**
   * Set a callback that fires when the view (pan/zoom) changes.
   * Used by network sync to broadcast local view changes.
   */
  setOnViewChanged(callback: ((panX: number, panY: number, zoom: number) => void) | null): void {
    this._externalViewChangedCallback = callback;
  }

  /**
   * Subscribe to view changes (pan/zoom). Supports multiple concurrent listeners.
   * Returns an unsubscribe function.
   */
  addViewChangeListener(callback: (panX: number, panY: number, zoom: number) => void): () => void {
    this._viewChangeListeners.add(callback);
    return () => { this._viewChangeListeners.delete(callback); };
  }

  /**
   * Dispatch current pan/zoom state to all view change listeners.
   * Called by TransformManager's onViewChanged callback and by the ResizeObserver.
   */
  private notifyViewChangeListeners(): void {
    const panX = this.transformManager.panX;
    const panY = this.transformManager.panY;
    const zoom = this.transformManager.zoom;
    this._externalViewChangedCallback?.(panX, panY, zoom);
    for (const listener of this._viewChangeListeners) {
      listener(panX, panY, zoom);
    }
  }

  /**
   * Get the native source image dimensions.
   */
  getSourceDimensions(): { width: number; height: number; pixelAspect?: number } {
    return { width: this.sourceWidth, height: this.sourceHeight, pixelAspect: this.parState.par };
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

  // Premult mode
  setPremultMode(mode: number): void {
    this.glRendererManager.setPremultMode(mode);
    this.scheduleRender();
  }

  // Spherical (360) projection
  setSphericalProjection(state: { enabled: boolean; fov: number; aspect: number; yaw: number; pitch: number }): void {
    this.glRendererManager.setSphericalProjection(state);
    this.scheduleRender();
  }

  /**
   * Wire a SphericalProjection instance so that ViewerInputHandler can
   * route mouse drag/wheel events to it for 360 navigation.
   */
  setSphericalProjectionRef(
    sp: import('../../render/SphericalProjection').SphericalProjection,
    updateUniforms: () => void,
  ): void {
    this._sphericalProjection = sp;
    this._sphericalUniformsCallback = updateUniforms;
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

  // Texture filter mode methods (nearest-neighbor vs bilinear)
  setFilterMode(mode: TextureFilterMode): void {
    if (mode === this._textureFilterMode) return;
    this._textureFilterMode = mode;

    // Persist preference
    persistFilterModePreference(this._textureFilterMode);

    // Update GL renderer
    this.glRendererManager.setFilterMode(this._textureFilterMode);

    // Show transient HUD indicator
    this.showFilterModeIndicator(this._textureFilterMode);

    // Update persistent badge
    if (this.filterModeBadge) {
      this.filterModeBadge.style.display = this._textureFilterMode === 'nearest' ? 'block' : 'none';
    }

    // Re-render current frame
    this.scheduleRender();
  }

  toggleFilterMode(): void {
    this.setFilterMode(this._textureFilterMode === 'linear' ? 'nearest' : 'linear');
  }

  getFilterMode(): TextureFilterMode {
    return this._textureFilterMode;
  }

  private showFilterModeIndicator(mode: TextureFilterMode): void {
    const result = showFilterModeIndicatorUtil(
      this.canvasContainer,
      mode,
      this.filterModeIndicator,
      this.filterModeTimeout,
    );
    this.filterModeIndicator = result.indicator;
    this.filterModeTimeout = result.timeout;
  }

  // LUT methods
  setLUT(lut: LUT | null): void {
    this.colorPipeline.setLUT(lut);

    if (this.lutIndicator) {
      this.lutIndicator.style.display = lut ? 'block' : 'none';
      this.lutIndicator.textContent = lut ? `LUT: ${lut.title}` : 'LUT';
    }
    this.scheduleRender();
  }

  getLUT(): LUT | null {
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
    const preCache = sourceConfig?.preCacheLUT;
    const hasPreCache3D =
      !!preCache?.lutData && isLUT3D(preCache.lutData) && preCache.enabled;

    const gpuChain = this.colorPipeline.gpuLUTChain;
    if (!gpuChain) {
      const fallbackLUT = this.colorPipeline.compose3DLUTStages([
        ...(preCache ? [{ label: 'Pre-Cache', stage: preCache }] : []),
        ...(sourceConfig?.fileLUT ? [{ label: 'File', stage: sourceConfig.fileLUT }] : []),
        ...(sourceConfig?.lookLUT ? [{ label: 'Look', stage: sourceConfig.lookLUT }] : []),
        { label: 'Display', stage: state.displayLUT },
      ]);

      if (fallbackLUT) {
        this.pipelineSingleLUTActive = true;
        this.colorPipeline.setLUT(fallbackLUT);
        this.colorPipeline.setLUTIntensity(1);
        if (this.lutIndicator) {
          this.lutIndicator.style.display = 'block';
          this.lutIndicator.textContent = fallbackLUT.title ? `LUT: ${fallbackLUT.title}` : 'LUT';
        }
      } else if (this.pipelineSingleLUTActive) {
        this.pipelineSingleLUTActive = false;
        this.colorPipeline.setLUT(null);
        this.colorPipeline.setLUTIntensity(1);
        if (this.lutIndicator) {
          this.lutIndicator.style.display = 'none';
        }
      }
    } else {
      if (this.pipelineSingleLUTActive && !hasPreCache3D) {
        this.pipelineSingleLUTActive = false;
        this.colorPipeline.setLUT(null);
        this.colorPipeline.setLUTIntensity(1);
        if (this.lutIndicator) {
          this.lutIndicator.style.display = 'none';
        }
      }
    }
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

    if (gpuChain && hasPreCache3D && preCache!.intensity > 0) {
      this.pipelineSingleLUTActive = true;
      this.colorPipeline.setLUT(preCache!.lutData);
      this.colorPipeline.setLUTIntensity(preCache!.intensity);
      if (this.lutIndicator) {
        this.lutIndicator.style.display = 'block';
        this.lutIndicator.textContent = preCache?.lutName ? `LUT: ${preCache.lutName}` : 'LUT';
      }
    } else if (gpuChain && this.pipelineSingleLUTActive) {
      this.pipelineSingleLUTActive = false;
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
    updateABIndicatorUtil(this.abIndicator, this.session, this.wipeManager, current);
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
        const currentState = this.watermarkOverlay.getState();
        const hasCurrentImage = this.watermarkOverlay.hasImage() || currentState.imageUrl !== null;
        const currentlyEnabled = currentState.enabled;

        // Avoid re-triggering removeImage() when already cleared; this prevents
        // stateChanged -> setWatermarkState -> removeImage recursion in shared-overlay wiring.
        if (hasCurrentImage || currentlyEnabled) {
          this.watermarkOverlay.removeImage();
        }
      } else {
        const currentState = this.watermarkOverlay.getState();
        const needsLoad = !this.watermarkOverlay.hasImage() || currentState.imageUrl !== imageUrl;

        if (needsLoad) {
          if (imageUrl.startsWith('blob:')) {
            console.warn('[Viewer] Cannot restore watermark from blob URL. Please reload the watermark file.');
            this.watermarkOverlay.setState({ imageUrl: null, enabled: false });
          } else {
            const desiredEnabled = state.enabled ?? true;
            void this.watermarkOverlay
              .loadFromUrl(imageUrl)
              .then(() => {
                this.watermarkOverlay.setState({ ...nonImageState, enabled: desiredEnabled });
              })
              .catch((err) => {
                log.warn('Failed to restore watermark image:', err);
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
   * Delegates to ViewerPixelEffects module.
   */
  private applyBatchedPixelEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    applyBatchedPixelEffectsUtil(this.asPixelEffectsContext(), ctx, width, height);
  }

  /**
   * Async version of applyBatchedPixelEffects that yields to the event loop
   * between major effect passes.
   */
  private async applyBatchedPixelEffectsAsync(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    generation: number,
    cropClipActive: boolean,
  ): Promise<void> {
    return applyBatchedPixelEffectsAsyncUtil(
      this.asPixelEffectsContext(),
      ctx,
      width,
      height,
      generation,
      cropClipActive,
    );
  }

  /**
   * Apply only lightweight diagnostic overlays and display color management.
   * Delegates to ViewerPixelEffects module.
   */
  private applyLightweightEffects(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    applyLightweightEffectsUtil(this.asPixelEffectsContext(), ctx, width, height);
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

  /**
   * Get the left and right eye ImageData from the current stereo source.
   * Returns null when stereo mode is off or no image data is available.
   */
  getStereoPair(): { left: ImageData; right: ImageData } | null {
    const stereoState = this.stereoManager.getStereoState();
    if (stereoState.mode === 'off') return null;

    const imageData = this.getImageData();
    if (!imageData) return null;

    return extractStereoEyes(imageData, 'side-by-side', stereoState.eyeSwap);
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
  setHDROutputMode(mode: 'sdr' | 'hlg' | 'pq' | 'extended'): boolean {
    if (this.glRendererManager.glRenderer && this.glRendererManager.capabilities) {
      const accepted = this.glRendererManager.glRenderer.setHDROutputMode(mode, this.glRendererManager.capabilities);
      if (accepted) {
        this.scheduleRender();
      }
      return accepted;
    }
    return false;
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

  getViewportSize(): { width: number; height: number } {
    return { width: this.displayWidth, height: this.displayHeight };
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
   * the current background pattern.
   */
  private updateCSSBackground(): void {
    updateCSSBackgroundUtil(this.container, this.imageCanvas, this.backgroundPatternState);
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
   * Delegates to ViewerPixelEffects module.
   */
  private compositeImageDataOverBackground(imageData: ImageData, width: number, height: number): void {
    compositeImageDataOverBackgroundUtil(this.asPixelEffectsContext(), imageData, width, height);
  }

  isToneMappingEnabled(): boolean {
    return isToneMappingEnabledUtil(this.asPixelEffectsContext());
  }

  /**
   * Render ghost frames (onion skin overlay) behind the main frame.
   * Delegates to ViewerImageRenderer module.
   */
  private renderGhostFrames(displayWidth: number, displayHeight: number): void {
    renderGhostFramesUtil(this.asImageRendererContext(), displayWidth, displayHeight);
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
   * Render A/B blend modes (onion skin, flicker, blend ratio).
   * Delegates to ViewerImageRenderer module.
   */
  private renderBlendMode(width: number, height: number): ImageData | null {
    return renderBlendModeUtil(this.asImageRendererContext(), width, height);
  }

  /**
   * Render difference matte between A and B sources.
   * Delegates to ViewerImageRenderer module.
   */
  private renderDifferenceMatte(width: number, height: number): ImageData | null {
    return renderDifferenceMatteUtil(this.asImageRendererContext(), width, height);
  }

  /**
   * Composite multiple stack layers together.
   * Delegates to ViewerImageRenderer module.
   */
  private compositeStackLayers(width: number, height: number): ImageData | null {
    return compositeStackLayersUtil(this.asImageRendererContext(), width, height);
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
  exportFrame(format: ExportFormat = 'png', includeAnnotations = true, quality = 0.92): void {
    const canvas = this.createExportCanvas(includeAnnotations);
    if (!canvas) return;

    const source = this.session.currentSource;
    const frame = this.session.currentFrame;
    const name = source?.name?.replace(/\.[^.]+$/, '') || 'frame';
    const filename = `${name}_frame${frame}.${format}`;

    doExportCanvas(canvas, { format, quality, filename });
  }

  exportSourceFrame(format: ExportFormat = 'png', quality = 0.92): void {
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
      frameburnOptions,
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
  async renderFrameToCanvas(
    frame: number,
    includeAnnotations: boolean,
    advancedFrameburnConfig?: import('./FrameburnCompositor').FrameburnConfig | null,
    advancedFrameburnContext?: import('./FrameburnCompositor').FrameburnContext | null,
  ): Promise<HTMLCanvasElement | null> {
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
      frameburnOptions,
      advancedFrameburnConfig,
      advancedFrameburnContext,
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

    // Dispose scale ratio indicator
    if (this.scaleRatioIndicator) {
      this.scaleRatioIndicator.dispose();
      this.scaleRatioIndicator = null;
    }

    this.resizeObserver.disconnect();
    this.inputHandler.unbindEvents();
    this.container.removeEventListener('mousemove', this.pixelSamplingManager.onMouseMoveForPixelSampling);
    this.container.removeEventListener('pointerleave', this.pixelSamplingManager.onMouseLeaveForCursorColor);
    this.container.removeEventListener('click', this.pixelSamplingManager.onClickForProbe);

    // Cleanup pixel sampling manager (clears cursor color callback and cached canvases)
    this.pixelSamplingManager.dispose();

    // Cleanup theme change listener
    this.subs.dispose();

    // Cleanup frame interpolator
    this.frameInterpolator.dispose();

    // Cleanup color pipeline GPU resources (LUT processor, GPU LUT chain, OCIO processor)
    this.colorPipeline.dispose();

    // Cleanup WebGL sharpen processor
    if (this.sharpenProcessor) {
      this.sharpenProcessor.dispose();
      this.sharpenProcessor = null;
    }

    // Cleanup WebGL noise reduction processor
    if (this.noiseReductionProcessor) {
      this.noiseReductionProcessor.dispose();
      this.noiseReductionProcessor = null;
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

    // Cleanup filter mode indicator and badge
    if (this.filterModeIndicator?.parentNode) {
      this.filterModeIndicator.remove();
      this.filterModeIndicator = null;
    }
    if (this.filterModeTimeout) {
      clearTimeout(this.filterModeTimeout);
      this.filterModeTimeout = null;
    }
    if (this.filterModeBadge?.parentNode) {
      this.filterModeBadge.remove();
      this.filterModeBadge = null;
    }
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
   * Update the display capabilities reference after a display change
   * (e.g., window moved from SDR to HDR monitor). The capabilities object
   * is already mutated in-place by watchDisplayChanges(); this method
   * triggers a re-evaluation of HDR headroom and a render update.
   */
  updateDisplayCapabilities(caps: DisplayCapabilities): void {
    this.capabilities = caps;
    this.syncHDRHeadroomFromSystem();
    this.scheduleRender();
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
   * Returns true if the viewer input handler has an active interaction
   * (pan, draw, shape draw, advanced draw, or spherical drag).
   * Used by VirtualSliderController to suppress activation.
   */
  isInteracting(): boolean {
    return this.inputHandler.isInteracting();
  }

  /**
   * Get the current display width in logical pixels.
   */
  getDisplayWidth(): number {
    return this.displayWidth;
  }

  /**
   * Get the current display height in logical pixels.
   */
  getDisplayHeight(): number {
    return this.displayHeight;
  }

  /**
   * Convert client (mouse event) coordinates to image pixel coordinates.
   * Uses the image canvas bounding rect and display dimensions for correct
   * mapping regardless of zoom, pan, letterboxing, or canvas stacking.
   * Returns null if the coordinates are outside the image canvas bounds.
   */
  getPixelCoordinatesFromClient(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvasRect = this.getImageCanvasRect();
    return getPixelCoordinates(clientX, clientY, canvasRect, this.displayWidth, this.displayHeight);
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
   * Get current matte overlay settings.
   */
  getMatteSettings(): MatteSettings {
    return this.overlayManager.getMatteOverlay().getSettings();
  }

  /**
   * Update matte overlay settings (partial merge).
   */
  setMatteSettings(settings: Partial<MatteSettings>): void {
    this.overlayManager.getMatteOverlay().setSettings(settings);
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

  getBugOverlay(): import('./BugOverlay').BugOverlay {
    return this.overlayManager.getBugOverlay();
  }

  getEXRWindowOverlay(): import('./EXRWindowOverlay').EXRWindowOverlay {
    return this.overlayManager.getEXRWindowOverlay();
  }

  /**
   * Get the info strip overlay instance
   */
  getInfoStripOverlay(): InfoStripOverlay {
    return this.overlayManager.getInfoStripOverlay();
  }

  /**
   * Get the FPS indicator overlay instance
   */
  getFPSIndicator(): FPSIndicator {
    return this.overlayManager.getFPSIndicator();
  }

  /**
   * Set (or clear) a reference image for overlay comparison.
   *
   * When imageData is non-null the reference is composited on top of the
   * live image canvas using the given viewMode and opacity.
   * Pass `null` to disable the reference overlay.
   */
  setReferenceImage(imageData: ImageData | null, viewMode: string, opacity: number, wipePosition = 0.5): void {
    if (!imageData || viewMode === 'off') {
      // Hide the overlay canvas if present
      if (this._referenceCanvas) {
        this._referenceCanvas.style.display = 'none';
      }
      this.scheduleRender();
      return;
    }

    // Lazy-create the reference overlay canvas
    if (!this._referenceCanvas) {
      this._referenceCanvas = document.createElement('canvas');
      this._referenceCanvas.className = 'reference-overlay';
      this._referenceCanvas.dataset.testid = 'reference-overlay';
      this._referenceCanvas.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:35;';
      this.canvasContainer.appendChild(this._referenceCanvas);
      this._referenceCtx = this._referenceCanvas.getContext('2d');
    }

    // Size the overlay canvas to match the image canvas
    const cw = this.imageCanvas.width;
    const ch = this.imageCanvas.height;
    if (this._referenceCanvas.width !== cw) this._referenceCanvas.width = cw;
    if (this._referenceCanvas.height !== ch) this._referenceCanvas.height = ch;
    this._referenceCanvas.style.display = '';

    const ctx = this._referenceCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, cw, ch);

    // Scale the reference ImageData to the current canvas size via a temp canvas
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) return;
    tmpCtx.putImageData(imageData, 0, 0);

    if (viewMode === 'overlay') {
      ctx.globalAlpha = opacity;
      ctx.drawImage(tmp, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
    } else if (viewMode === 'split-h') {
      const splitX = Math.round(cw * Math.max(0, Math.min(1, wipePosition)));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, ch);
      ctx.clip();
      ctx.drawImage(tmp, 0, 0, cw, ch);
      ctx.restore();
    } else if (viewMode === 'split-v') {
      const splitY = Math.round(ch * Math.max(0, Math.min(1, wipePosition)));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cw, splitY);
      ctx.clip();
      ctx.drawImage(tmp, 0, 0, cw, ch);
      ctx.restore();
    } else if (viewMode === 'side-by-side') {
      // Draw reference in left half, live in right half (just draw ref)
      ctx.drawImage(tmp, 0, 0, Math.round(cw / 2), ch);
    } else if (viewMode === 'toggle') {
      // Full replacement
      ctx.drawImage(tmp, 0, 0, cw, ch);
    }

    this.scheduleRender();
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
      source?.height ?? 0,
    );
  }

  /**
   * Clear the prerender (effects) cache
   */
  clearPrerenderCache(): void {
    if (this.prerenderBuffer) {
      this.prerenderBuffer.clear();
    }
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
  onCursorColorChange(
    callback:
      | ((color: { r: number; g: number; b: number } | null, position: { x: number; y: number } | null) => void)
      | null,
  ): void {
    this.pixelSamplingManager.onCursorColorChange(callback);
  }
}
