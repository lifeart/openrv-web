/**
 * Test Helper - Exposes app internals for e2e testing
 * This file should only be imported in development/test builds
 */

import type { App } from './App';
import { getThemeManager } from './utils/ui/ThemeManager';

declare global {
  interface Window {
    __OPENRV_TEST__?: {
      app: App;
      getSessionState: () => SessionState;
      getViewerState: () => ViewerState;
      getColorState: () => ColorState;
      getTransformState: () => TransformState;
      getPaintState: () => PaintState;
      getPixelProbeState: () => PixelProbeState;
      getFalseColorState: () => FalseColorState;
      getToneMappingState: () => ToneMappingTestState;
      getSafeAreasState: () => SafeAreasState;
      getTimecodeOverlayState: () => TimecodeOverlayState;
      getZebraStripesState: () => ZebraStripesState;
      getColorWheelsState: () => ColorWheelsState;
      getSpotlightState: () => SpotlightState;
      getHSLQualifierState: () => HSLQualifierState;
      getHistoryPanelState: () => HistoryPanelState;
      getInfoPanelState: () => InfoPanelState;
      getCacheIndicatorState: () => CacheIndicatorState;
      getThemeState: () => ThemeState;
      getMatteState: () => MatteState;
      getSessionMetadataState: () => SessionMetadataState;
      getStackState: () => StackState;
      getOCIOState: () => OCIOState;
      isUsingMediabunny: () => boolean;
      getFullscreenState: () => FullscreenState;
      getPresentationState: () => PresentationTestState;
      getNetworkSyncState: () => NetworkSyncState;
      getLuminanceVisState: () => LuminanceVisTestState;
      getDiagnostics: () => TestHelperDiagnostics;
      clearDiagnostics: () => void;
      setStrictMode: (enabled: boolean) => void;
      simulateFullscreenEnter: () => void;
      simulateFullscreenExit: () => void;
    };
  }
}

export interface LuminanceVisTestState {
  mode: 'off' | 'false-color' | 'hsv' | 'random-color' | 'contour';
  falseColorPreset: 'standard' | 'arri' | 'red' | 'custom';
  randomBandCount: number;
  randomSeed: number;
  contourLevels: number;
  contourDesaturate: boolean;
  contourLineColor: [number, number, number];
}

export interface FullscreenState {
  isFullscreen: boolean;
  isSupported: boolean;
}

export interface NetworkSyncState {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  roomCode: string | null;
  userCount: number;
  isHost: boolean;
  isPanelOpen: boolean;
  syncPlayback: boolean;
  syncView: boolean;
  syncColor: boolean;
  syncAnnotations: boolean;
  rtt: number;
}

export interface PresentationTestState {
  enabled: boolean;
  cursorAutoHide: boolean;
  cursorHideDelay: number;
}

export interface MarkerData {
  frame: number;
  note: string;
  color: string;
}

export interface SessionState {
  currentFrame: number;
  frameCount: number;
  inPoint: number;
  outPoint: number;
  isPlaying: boolean;
  isBuffering: boolean;
  loopMode: 'once' | 'loop' | 'pingpong';
  playDirection: number;
  playbackSpeed: number;
  preservesPitch: boolean;
  volume: number;
  muted: boolean;
  fps: number;
  hasMedia: boolean;
  mediaType: string | null;
  mediaName: string | null;
  marks: number[]; // Legacy: just frame numbers
  markers: MarkerData[]; // Full marker data with notes and colors
  // A/B Compare state
  currentAB: 'A' | 'B';
  sourceAIndex: number;
  sourceBIndex: number;
  abCompareAvailable: boolean;
  syncPlayhead: boolean;
}

export interface ViewerState {
  zoom: number;
  panX: number;
  panY: number;
  wipeMode: 'off' | 'horizontal' | 'vertical' | 'quad' | 'splitscreen-h' | 'splitscreen-v';
  wipePosition: number;
  cropEnabled: boolean;
  cropRegion: {
    x: number;      // 0-1 normalized left position
    y: number;      // 0-1 normalized top position
    width: number;  // 0-1 normalized width
    height: number; // 0-1 normalized height
  };
  cropAspectRatio: string | null;  // null = free, "16:9", "4:3", "1:1", etc.
  channelMode: 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance';
  stereoMode: 'off' | 'side-by-side' | 'over-under' | 'mirror' | 'anaglyph' | 'anaglyph-luminance' | 'checkerboard' | 'scanline';
  stereoEyeSwap: boolean;
  stereoOffset: number;
  // Per-eye transform state
  stereoEyeTransformLeft: { flipH: boolean; flipV: boolean; rotation: number; scale: number; translateX: number; translateY: number };
  stereoEyeTransformRight: { flipH: boolean; flipV: boolean; rotation: number; scale: number; translateX: number; translateY: number };
  stereoEyeTransformLinked: boolean;
  stereoAlignMode: 'off' | 'grid' | 'crosshair' | 'difference' | 'edges';
  histogramVisible: boolean;
  histogramMode: 'rgb' | 'luminance' | 'separate';
  histogramLogScale: boolean;
  waveformVisible: boolean;
  waveformMode: 'luma' | 'rgb' | 'parade';
  vectorscopeVisible: boolean;
  vectorscopeZoom: number;
  // Difference matte state
  differenceMatteEnabled: boolean;
  differenceMatteGain: number;
  differenceMatteHeatmap: boolean;
  // Clipping overlay state
  clippingOverlayEnabled: boolean;
  histogramClipping: {
    shadows: number;
    highlights: number;
    shadowsPercent: number;
    highlightsPercent: number;
  } | null;
  // EXR layer state
  exrLayerCount: number;
  exrSelectedLayer: string | null;
  exrAvailableLayers: string[];
  // Uncrop state
  uncropEnabled: boolean;
  uncropPaddingMode: 'uniform' | 'per-side';
  uncropPadding: number;
  uncropPaddingTop: number;
  uncropPaddingRight: number;
  uncropPaddingBottom: number;
  uncropPaddingLeft: number;
  // PAR state
  parEnabled: boolean;
  parValue: number;
  parPreset: string;
  // Background pattern state
  backgroundPattern: 'black' | 'grey18' | 'grey50' | 'white' | 'checker' | 'crosshatch' | 'custom';
  backgroundCheckerSize: 'small' | 'medium' | 'large';
  backgroundCustomColor: string;
  // Color inversion state
  colorInversionEnabled: boolean;
  // Viewer color pipeline adjustments snapshot (used by HDR/tone-mapping E2E)
  colorAdjustments: Record<string, unknown>;
  // HDR format info
  formatName: string | null;
  bitDepth: number | null;
  dataType: string | null;
  colorSpace: string | null;
}

export interface ColorState {
  exposure: number;
  gamma: number;
  saturation: number;
  vibrance: number;
  vibranceSkinProtection: boolean;
  contrast: number;
  clarity: number;
  temperature: number;
  tint: number;
  brightness: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  hasLUT: boolean;
  lutIntensity: number;
}

export interface PixelProbeState {
  enabled: boolean;
  locked: boolean;
  x: number;
  y: number;
  rgb: { r: number; g: number; b: number };
  alpha: number;
  hsl: { h: number; s: number; l: number };
  ire: number;
  format: 'rgb' | 'rgb01' | 'hsl' | 'hex' | 'ire';
  sampleSize: 1 | 3 | 5 | 9;
  sourceMode: 'rendered' | 'source';
}

export interface FalseColorState {
  enabled: boolean;
  preset: 'standard' | 'arri' | 'red' | 'custom';
}

export interface ToneMappingTestState {
  enabled: boolean;
  operator: 'off' | 'reinhard' | 'filmic' | 'aces';
}

export interface SafeAreasState {
  enabled: boolean;
  titleSafe: boolean;
  actionSafe: boolean;
  centerCrosshair: boolean;
  ruleOfThirds: boolean;
  aspectRatio: string | null;
}

export interface TimecodeOverlayState {
  enabled: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  fontSize: 'small' | 'medium' | 'large';
  showFrameCounter: boolean;
}

export interface ZebraStripesState {
  enabled: boolean;
  highEnabled: boolean;
  lowEnabled: boolean;
  highThreshold: number;
  lowThreshold: number;
}

export interface ColorWheelsState {
  lift: { r: number; g: number; b: number; y: number };
  gamma: { r: number; g: number; b: number; y: number };
  gain: { r: number; g: number; b: number; y: number };
  master: { r: number; g: number; b: number; y: number };
  linked: boolean;
  visible: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface SpotlightState {
  enabled: boolean;
  shape: 'circle' | 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  dimAmount: number;
  feather: number;
}

export interface HSLQualifierState {
  enabled: boolean;
  hue: { center: number; width: number; softness: number };
  saturation: { center: number; width: number; softness: number };
  luminance: { center: number; width: number; softness: number };
  correction: { hueShift: number; saturationScale: number; luminanceScale: number };
  invert: boolean;
  mattePreview: boolean;
}

export interface HistoryPanelState {
  visible: boolean;
  entryCount: number;
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
}

export interface InfoPanelState {
  enabled: boolean;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  filename: string | null;
  resolution: string | null;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  colorAtCursor: { r: number; g: number; b: number } | null;
}

export interface TransformState {
  rotation: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
}

export interface PaintState {
  currentTool: 'pan' | 'pen' | 'eraser' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'arrow';
  strokeColor: string;
  strokeWidth: number;
  brushType: 'circle' | 'gaussian';
  ghostMode: boolean;
  holdMode: boolean;
  ghostBefore: number;
  ghostAfter: number;
  annotatedFrames: number[];
  visibleAnnotationCount: number; // Number of annotations visible on current frame (including hold mode)
  canUndo: boolean;
  canRedo: boolean;
}

export interface CacheIndicatorState {
  visible: boolean;
  cachedCount: number;
  pendingCount: number;
  totalFrames: number;
  isUsingMediabunny: boolean;
}

export interface ThemeState {
  mode: 'dark' | 'light' | 'auto';
  resolvedTheme: 'dark' | 'light';
}

export interface MatteState {
  show: boolean;
  aspect: number;
  opacity: number;
  heightVisible: number;
  centerPoint: [number, number];
}

export interface SessionMetadataState {
  displayName: string;
  comment: string;
  version: number;
  origin: string;
  frameIncrement: number;
}

export interface StackLayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: string;
  sourceIndex: number;
}

export interface StackState {
  layers: StackLayerState[];
  activeLayerId: string | null;
  layerCount: number;
  isPanelOpen: boolean;
}

export interface OCIOState {
  enabled: boolean;
  configName: string;
  inputColorSpace: string;
  detectedColorSpace: string | null;
  workingColorSpace: string;
  display: string;
  view: string;
  look: string;
  lookDirection: 'forward' | 'inverse';
  panelVisible: boolean;
}

export interface TestHelperDiagnostics {
  strictMode: boolean;
  missingPaths: string[];
  errors: string[];
}

/**
 * Creates a state getter that retrieves a component, calls getState() on it,
 * and merges the result with defaults using nullish coalescing (??) semantics.
 * This preserves the behavior where state values of `null` or `undefined`
 * are replaced by the corresponding default value.
 */
function createStateGetter<T extends object>(
  path: string,
  getComponent: () => any,
  defaults: T,
  resolveComponent?: (path: string, getComponent: () => any) => any,
): () => T {
  return () => {
    const component = resolveComponent ? resolveComponent(path, getComponent) : getComponent();
    const state = component?.getState?.() ?? {};
    const result = {} as Record<string, unknown>;
    for (const key of Object.keys(defaults)) {
      result[key] = state[key] ?? (defaults as Record<string, unknown>)[key];
    }
    return result as T;
  };
}

export function exposeForTesting(app: App): void {
  // Access private properties through any cast (for testing only)
  const appAny = app as any;
  let strictMode = false;
  const missingPaths = new Set<string>();
  const errors: string[] = [];

  const addError = (path: string, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${path}: ${message}`);
  };

  const resolveComponent = (path: string, getComponent: () => any): any => {
    try {
      const component = getComponent();
      if (component == null) {
        missingPaths.add(path);
        if (strictMode) {
          throw new Error(`[OPENRV_TEST] Missing component at path: ${path}`);
        }
      }
      return component;
    } catch (error) {
      addError(path, error);
      if (strictMode) {
        throw error instanceof Error ? error : new Error(String(error));
      }
      return null;
    }
  };

  const getControls = (): any => {
    return resolveComponent('app.controls', () => appAny.controls);
  };

  const getControl = (key: string): any => {
    const controls = getControls();
    return resolveComponent(`app.controls.${key}`, () => controls?.[key]);
  };

  window.__OPENRV_TEST__ = {
    app,

    getSessionState: (): SessionState => {
      const session = resolveComponent('app.session', () => appAny.session);
      const source = session?.currentSource;
      const marksFromMap = Array.from(session?.marks?.keys?.() ?? []);
      const marks = marksFromMap.length > 0 ? marksFromMap : (session?.markedFrames ?? []);
      return {
        currentFrame: session?.currentFrame ?? 0,
        // frameCount is the duration in the in/out range, use source?.duration for total
        frameCount: source?.duration ?? 0,
        inPoint: session?.inPoint ?? 0,
        outPoint: session?.outPoint ?? 0,
        isPlaying: session?.isPlaying ?? false,
        isBuffering: session?.isBuffering ?? false,
        loopMode: session?.loopMode ?? 'loop',
        playDirection: session?.playDirection ?? 1,
        playbackSpeed: session?.playbackSpeed ?? 1,
        preservesPitch: session?.preservesPitch ?? false,
        volume: session?.volume ?? 1,
        muted: session?.muted ?? false,
        fps: session?.fps ?? 24,
        hasMedia: !!source,
        mediaType: source?.type ?? null,
        mediaName: source?.name ?? null,
        marks,
        markers: Array.from(session?.marks?.values?.() ?? []).map((m: unknown) => {
          const marker = m as { frame: number; note: string; color: string };
          return {
            frame: marker.frame,
            note: marker.note,
            color: marker.color,
          };
        }),
        // A/B Compare state
        currentAB: session?.currentAB ?? 'A',
        sourceAIndex: session?.sourceAIndex ?? 0,
        sourceBIndex: session?.sourceBIndex ?? 1,
        abCompareAvailable: session?.abCompareAvailable ?? false,
        syncPlayhead: session?.syncPlayhead ?? true,
      };
    },

    getViewerState: (): ViewerState => {
      const viewer = resolveComponent('app.viewer', () => appAny.viewer);
      const histogram = getControl('histogram');
      const waveform = getControl('waveform');
      const vectorscope = getControl('vectorscope');
      const channelSelect = getControl('channelSelect');
      const zoom = viewer?.getZoom?.() ?? 1;
      const pan = viewer?.getPan?.() ?? { x: 0, y: 0 };
      const wipeState = viewer?.getWipeState?.() ?? {};
      const cropState = viewer?.getCropState?.() ?? {};
      const uncropState = viewer?.getUncropState?.() ?? {};
      const stereoState = viewer?.getStereoState?.() ?? {};
      const stereoEyeTransformState = viewer?.getStereoEyeTransforms?.() ?? null;
      const stereoAlignMode = viewer?.getStereoAlignMode?.() ?? 'off';
      const differenceMatteState = viewer?.getDifferenceMatteState?.() ?? {};
      const parState = viewer?.getPARState?.() ?? {};
      const backgroundPatternState = viewer?.getBackgroundPatternState?.() ?? {};
      const colorAdjustments = viewer?.getColorAdjustments?.() ?? {};
      const exrLayerState = channelSelect?.getEXRLayerState?.() ?? {};
      return {
        zoom,
        panX: pan.x ?? 0,
        panY: pan.y ?? 0,
        wipeMode: wipeState.mode ?? 'off',
        wipePosition: wipeState.position ?? 0.5,
        cropEnabled: cropState.enabled ?? false,
        cropRegion: {
          x: cropState.region?.x ?? 0,
          y: cropState.region?.y ?? 0,
          width: cropState.region?.width ?? 1,
          height: cropState.region?.height ?? 1,
        },
        cropAspectRatio: cropState.aspectRatio ?? null,
        channelMode: viewer?.getChannelMode?.() ?? 'rgb',
        stereoMode: stereoState.mode ?? 'off',
        stereoEyeSwap: stereoState.eyeSwap ?? false,
        stereoOffset: stereoState.offset ?? 0,
        // Per-eye transform state
        stereoEyeTransformLeft: stereoEyeTransformState ? { ...stereoEyeTransformState.left } : { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        stereoEyeTransformRight: stereoEyeTransformState ? { ...stereoEyeTransformState.right } : { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
        stereoEyeTransformLinked: stereoEyeTransformState?.linked ?? false,
        stereoAlignMode,
        histogramVisible: histogram?.isVisible?.() ?? false,
        histogramMode: histogram?.getMode?.() ?? 'rgb',
        histogramLogScale: histogram?.isLogScale?.() ?? false,
        waveformVisible: waveform?.isVisible?.() ?? false,
        waveformMode: waveform?.getMode?.() ?? 'luma',
        vectorscopeVisible: vectorscope?.isVisible?.() ?? false,
        vectorscopeZoom: vectorscope?.getZoom?.() ?? 1,
        // Difference matte state
        differenceMatteEnabled: differenceMatteState.enabled ?? false,
        differenceMatteGain: differenceMatteState.gain ?? 1,
        differenceMatteHeatmap: differenceMatteState.heatmap ?? false,
        // Clipping overlay state
        clippingOverlayEnabled: viewer?.getClippingOverlay?.()?.isEnabled?.() ?? false,
        histogramClipping: histogram?.getClipping?.() ?? null,
        // EXR layer state (from channelSelect component)
        exrLayerCount: exrLayerState.availableLayers?.length ?? 0,
        exrSelectedLayer: exrLayerState.selectedLayer ?? null,
        exrAvailableLayers: exrLayerState.availableLayers?.map((l: any) => l.name) ?? [],
        // Uncrop state
        uncropEnabled: uncropState.enabled ?? false,
        uncropPaddingMode: uncropState.paddingMode ?? 'uniform',
        uncropPadding: uncropState.padding ?? 0,
        uncropPaddingTop: uncropState.paddingTop ?? 0,
        uncropPaddingRight: uncropState.paddingRight ?? 0,
        uncropPaddingBottom: uncropState.paddingBottom ?? 0,
        uncropPaddingLeft: uncropState.paddingLeft ?? 0,
        // PAR state
        parEnabled: parState.enabled ?? false,
        parValue: parState.par ?? 1.0,
        parPreset: parState.preset ?? 'square',
        // Background pattern state
        backgroundPattern: backgroundPatternState.pattern ?? 'black',
        backgroundCheckerSize: backgroundPatternState.checkerSize ?? 'medium',
        backgroundCustomColor: backgroundPatternState.customColor ?? '#1a1a1a',
        // Color inversion state
        colorInversionEnabled: viewer?.getColorInversion?.() ?? false,
        colorAdjustments,
        // HDR format info
        formatName: (() => {
          const session = resolveComponent('app.session', () => appAny.session);
          const source = session?.currentSource;
          const fileSource = source?.getFileSource?.() ?? source;
          return fileSource?.formatName ?? null;
        })(),
        bitDepth: (() => {
          const session = resolveComponent('app.session', () => appAny.session);
          const source = session?.currentSource;
          const fileSource = source?.getFileSource?.() ?? source;
          const ipImage = fileSource?.cachedIPImage;
          const attrs = ipImage?.metadata?.attributes;
          return (attrs?.bitDepth as number) ?? (attrs?.bitsPerSample as number) ?? null;
        })(),
        dataType: (() => {
          const session = resolveComponent('app.session', () => appAny.session);
          const source = session?.currentSource;
          const fileSource = source?.getFileSource?.() ?? source;
          const ipImage = fileSource?.cachedIPImage;
          return ipImage?.dataType ?? null;
        })(),
        colorSpace: (() => {
          const session = resolveComponent('app.session', () => appAny.session);
          const source = session?.currentSource;
          const fileSource = source?.getFileSource?.() ?? source;
          const ipImage = fileSource?.cachedIPImage;
          return ipImage?.metadata?.colorSpace ?? null;
        })(),
      };
    },

    getColorState: (): ColorState => {
      const colorControls = getControl('colorControls');
      const adjustments = colorControls?.getAdjustments?.() ?? {};
      return {
        exposure: adjustments.exposure ?? 0,
        gamma: adjustments.gamma ?? 1,
        saturation: adjustments.saturation ?? 1,
        vibrance: adjustments.vibrance ?? 0,
        vibranceSkinProtection: adjustments.vibranceSkinProtection ?? true,
        contrast: adjustments.contrast ?? 1,
        clarity: adjustments.clarity ?? 0,
        temperature: adjustments.temperature ?? 0,
        tint: adjustments.tint ?? 0,
        brightness: adjustments.brightness ?? 0,
        highlights: adjustments.highlights ?? 0,
        shadows: adjustments.shadows ?? 0,
        whites: adjustments.whites ?? 0,
        blacks: adjustments.blacks ?? 0,
        hasLUT: !!colorControls?.getLUT?.(),
        lutIntensity: colorControls?.getLUTIntensity?.() ?? 1,
      };
    },

    getPixelProbeState: createStateGetter<PixelProbeState>(
      'app.viewer.getPixelProbe',
      () => appAny.viewer?.getPixelProbe?.(),
      {
        enabled: false,
        locked: false,
        x: 0,
        y: 0,
        rgb: { r: 0, g: 0, b: 0 },
        alpha: 255,
        hsl: { h: 0, s: 0, l: 0 },
        ire: 0,
        format: 'rgb',
        sampleSize: 1,
        sourceMode: 'rendered',
      },
      resolveComponent,
    ),

    getFalseColorState: createStateGetter<FalseColorState>(
      'app.viewer.getFalseColor',
      () => appAny.viewer?.getFalseColor?.(),
      {
        enabled: false,
        preset: 'standard',
      },
      resolveComponent,
    ),

    getToneMappingState: createStateGetter<ToneMappingTestState>(
      'app.controls.toneMappingControl',
      () => getControl('toneMappingControl'),
      {
        enabled: false,
        operator: 'off',
      },
      resolveComponent,
    ),

    getSafeAreasState: createStateGetter<SafeAreasState>(
      'app.viewer.getSafeAreasOverlay',
      () => appAny.viewer?.getSafeAreasOverlay?.(),
      {
        enabled: false,
        titleSafe: true,
        actionSafe: true,
        centerCrosshair: false,
        ruleOfThirds: false,
        aspectRatio: null,
      },
      resolveComponent,
    ),

    getTimecodeOverlayState: createStateGetter<TimecodeOverlayState>(
      'app.viewer.getTimecodeOverlay',
      () => appAny.viewer?.getTimecodeOverlay?.(),
      {
        enabled: false,
        position: 'top-left',
        fontSize: 'medium',
        showFrameCounter: true,
      },
      resolveComponent,
    ),

    getZebraStripesState: createStateGetter<ZebraStripesState>(
      'app.viewer.getZebraStripes',
      () => appAny.viewer?.getZebraStripes?.(),
      {
        enabled: false,
        highEnabled: true,
        lowEnabled: false,
        highThreshold: 95,
        lowThreshold: 5,
      },
      resolveComponent,
    ),

    getColorWheelsState: (): ColorWheelsState => {
      const viewer = resolveComponent('app.viewer', () => appAny.viewer);
      const colorWheels = viewer?.getColorWheels?.();
      const state = colorWheels?.getState?.() ?? {};
      return {
        lift: state.lift ?? { r: 0, g: 0, b: 0, y: 0 },
        gamma: state.gamma ?? { r: 0, g: 0, b: 0, y: 0 },
        gain: state.gain ?? { r: 0, g: 0, b: 0, y: 0 },
        master: state.master ?? { r: 0, g: 0, b: 0, y: 0 },
        linked: state.linked ?? false,
        visible: colorWheels?.isVisible?.() ?? false,
        canUndo: colorWheels?.canUndo?.() ?? false,
        canRedo: colorWheels?.canRedo?.() ?? false,
      };
    },

    getSpotlightState: createStateGetter<SpotlightState>(
      'app.viewer.getSpotlightOverlay',
      () => appAny.viewer?.getSpotlightOverlay?.(),
      {
        enabled: false,
        shape: 'circle',
        x: 0.5,
        y: 0.5,
        width: 0.2,
        height: 0.2,
        dimAmount: 0.7,
        feather: 0.05,
      },
      resolveComponent,
    ),

    getHSLQualifierState: createStateGetter<HSLQualifierState>(
      'app.viewer.getHSLQualifier',
      () => appAny.viewer?.getHSLQualifier?.(),
      {
        enabled: false,
        hue: { center: 0, width: 30, softness: 20 },
        saturation: { center: 50, width: 100, softness: 10 },
        luminance: { center: 50, width: 100, softness: 10 },
        correction: { hueShift: 0, saturationScale: 1, luminanceScale: 1 },
        invert: false,
        mattePreview: false,
      },
      resolveComponent,
    ),

    getHistoryPanelState: (): HistoryPanelState => {
      const historyPanel = getControl('historyPanel');
      const panelState = historyPanel?.getState?.() ?? {};
      const historyManager = historyPanel?.historyManager;
      const historyState = historyManager?.getState?.() ?? {};
      return {
        visible: panelState.visible ?? false,
        entryCount: panelState.entryCount ?? 0,
        currentIndex: panelState.currentIndex ?? -1,
        canUndo: historyState.canUndo ?? false,
        canRedo: historyState.canRedo ?? false,
      };
    },

    getInfoPanelState: (): InfoPanelState => {
      const infoPanel = getControl('infoPanel');
      const session = resolveComponent('app.session', () => appAny.session);
      const source = session?.currentSource;
      const state = infoPanel?.getState?.() ?? {};
      const currentData = (infoPanel as any)?.currentData ?? {};
      return {
        enabled: state.enabled ?? false,
        position: state.position ?? 'top-left',
        filename: currentData.filename ?? source?.name ?? null,
        resolution: source?.width && source?.height ? `${source.width}x${source.height}` : null,
        currentFrame: session?.currentFrame ?? 0,
        totalFrames: source?.duration ?? 0,
        fps: session?.fps ?? 0,
        colorAtCursor: currentData.colorAtCursor ?? null,
      };
    },

    getTransformState: (): TransformState => {
      const transformControl = getControl('transformControl');
      const transform = transformControl?.getTransform?.() ?? {};
      return {
        rotation: transform.rotation ?? 0,
        flipH: transform.flipH ?? false,
        flipV: transform.flipV ?? false,
      };
    },

    getPaintState: (): PaintState => {
      const paintEngine = appAny.paintEngine;
      const session = resolveComponent('app.session', () => appAny.session);
      // Map 'none' tool to 'pan' for test interface consistency
      const tool = paintEngine?.tool ?? 'none';
      const toolMap: Record<string, 'pan' | 'pen' | 'eraser' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'arrow'> = {
        'none': 'pan',
        'pen': 'pen',
        'eraser': 'eraser',
        'text': 'text',
        'rectangle': 'rectangle',
        'ellipse': 'ellipse',
        'line': 'line',
        'arrow': 'arrow',
      };
      // Convert RGBA color array to hex string
      const color = paintEngine?.color ?? [1, 0, 0, 1];
      const hexColor = '#' +
        Math.round(color[0] * 255).toString(16).padStart(2, '0') +
        Math.round(color[1] * 255).toString(16).padStart(2, '0') +
        Math.round(color[2] * 255).toString(16).padStart(2, '0');
      // Get brush type - 0 is Circle, 1 is Gaussian (from BrushType enum)
      const brush = paintEngine?.brush ?? 0;
      const brushTypeMap: Record<number, 'circle' | 'gaussian'> = { 0: 'circle', 1: 'gaussian' };
      // Check undo/redo stacks directly since there are no public methods
      const undoStack = paintEngine?.undoStack ?? [];
      const redoStack = paintEngine?.redoStack ?? [];
      // Get visible annotation count on current frame
      const currentFrame = session?.currentFrame ?? 0;
      const visibleAnnotations = paintEngine?.getAnnotationsForFrame?.(currentFrame) ?? [];

      return {
        currentTool: toolMap[tool] ?? 'pan',
        strokeColor: hexColor,
        strokeWidth: paintEngine?.width ?? 4,
        brushType: brushTypeMap[brush] ?? 'circle',
        ghostMode: paintEngine?.effects?.ghost ?? false,
        holdMode: paintEngine?.effects?.hold ?? false,
        ghostBefore: paintEngine?.effects?.ghostBefore ?? 3,
        ghostAfter: paintEngine?.effects?.ghostAfter ?? 3,
        annotatedFrames: Array.from(paintEngine?.getAnnotatedFrames?.() ?? []),
        visibleAnnotationCount: visibleAnnotations.length,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      };
    },

    getCacheIndicatorState: (): CacheIndicatorState => {
      const session = resolveComponent('app.session', () => appAny.session);
      const cacheIndicator = getControl('cacheIndicator');
      const state = cacheIndicator?.getState?.() ?? {};
      const isUsingMediabunny = session?.isUsingMediabunny?.() ?? false;
      return {
        visible: state.visible ?? false,
        cachedCount: state.cachedCount ?? 0,
        pendingCount: state.pendingCount ?? 0,
        totalFrames: state.totalFrames ?? 0,
        isUsingMediabunny,
      };
    },

    getThemeState: (): ThemeState => {
      const themeManager = getThemeManager();
      return {
        mode: themeManager.getMode(),
        resolvedTheme: themeManager.getResolvedTheme(),
      };
    },

    getMatteState: (): MatteState => {
      const viewer = resolveComponent('app.viewer', () => appAny.viewer);
      const matteOverlay = viewer?.getMatteOverlay?.();
      const settings = matteOverlay?.getSettings?.() ?? {};
      return {
        show: settings.show ?? false,
        aspect: settings.aspect ?? 1.78,
        opacity: settings.opacity ?? 0.66,
        heightVisible: settings.heightVisible ?? -1,
        centerPoint: settings.centerPoint ?? [0, 0],
      };
    },

    getSessionMetadataState: (): SessionMetadataState => {
      const session = resolveComponent('app.session', () => appAny.session);
      const metadata = session?.metadata ?? {};
      return {
        displayName: metadata.displayName ?? '',
        comment: metadata.comment ?? '',
        version: metadata.version ?? 2,
        origin: metadata.origin ?? 'openrv-web',
        frameIncrement: session?.frameIncrement ?? 1,
      };
    },

    getStackState: (): StackState => {
      const stackControl = getControl('stackControl');
      const layers = stackControl?.getLayers?.() ?? [];
      const activeLayer = stackControl?.getActiveLayer?.();
      return {
        layers: layers.map((l: any) => ({
          id: l.id ?? '',
          name: l.name ?? '',
          visible: l.visible ?? true,
          opacity: l.opacity ?? 1,
          blendMode: l.blendMode ?? 'normal',
          sourceIndex: l.sourceIndex ?? 0,
        })),
        activeLayerId: activeLayer?.id ?? null,
        layerCount: layers.length,
        isPanelOpen: (stackControl as any)?.isPanelOpen ?? false,
      };
    },

    getOCIOState: (): OCIOState => {
      const ocioControl = getControl('ocioControl');
      const state = ocioControl?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        configName: state.configName ?? 'aces_1.2',
        inputColorSpace: state.inputColorSpace ?? 'Auto',
        detectedColorSpace: state.detectedColorSpace ?? null,
        workingColorSpace: state.workingColorSpace ?? 'ACEScg',
        display: state.display ?? 'sRGB',
        view: state.view ?? 'ACES 1.0 SDR-video',
        look: state.look ?? 'None',
        lookDirection: state.lookDirection ?? 'forward',
        panelVisible: (ocioControl as any)?.isExpanded ?? false,
      };
    },

    isUsingMediabunny: (): boolean => {
      const session = resolveComponent('app.session', () => appAny.session);
      return session?.isUsingMediabunny?.() ?? false;
    },

    getFullscreenState: (): FullscreenState => {
      const fullscreenManager = appAny.fullscreenManager;
      return {
        isFullscreen: fullscreenManager?.isFullscreen ?? false,
        isSupported: true,
      };
    },

    getPresentationState: createStateGetter<PresentationTestState>(
      'app.controls.presentationMode',
      () => getControl('presentationMode'),
      {
        enabled: false,
        cursorAutoHide: true,
        cursorHideDelay: 3000,
      },
      resolveComponent,
    ),

    getLuminanceVisState: createStateGetter<LuminanceVisTestState>(
      'app.viewer.getLuminanceVisualization',
      () => appAny.viewer?.getLuminanceVisualization?.(),
      {
        mode: 'off',
        falseColorPreset: 'standard',
        randomBandCount: 16,
        randomSeed: 42,
        contourLevels: 10,
        contourDesaturate: true,
        contourLineColor: [255, 255, 255],
      },
      resolveComponent,
    ),

    getNetworkSyncState: (): NetworkSyncState => {
      const networkControl = getControl('networkControl');
      const networkSyncManager = getControl('networkSyncManager');
      const controlState = networkControl?.getState?.() ?? {};
      return {
        connectionState: networkSyncManager?.connectionState ?? 'disconnected',
        roomCode: networkSyncManager?.roomInfo?.roomCode ?? null,
        userCount: networkSyncManager?.users?.length ?? 0,
        isHost: networkSyncManager?.isHost ?? false,
        isPanelOpen: controlState.isPanelOpen ?? false,
        syncPlayback: networkSyncManager?.syncSettings?.playback ?? true,
        syncView: networkSyncManager?.syncSettings?.view ?? true,
        syncColor: networkSyncManager?.syncSettings?.color ?? false,
        syncAnnotations: networkSyncManager?.syncSettings?.annotations ?? false,
        rtt: networkSyncManager?.rtt ?? 0,
      };
    },

    getDiagnostics: (): TestHelperDiagnostics => ({
      strictMode,
      missingPaths: Array.from(missingPaths),
      errors: [...errors],
    }),

    clearDiagnostics: (): void => {
      missingPaths.clear();
      errors.length = 0;
    },

    setStrictMode: (enabled: boolean): void => {
      strictMode = enabled;
    },

    simulateFullscreenEnter: (): void => {
      const fullscreenManager = appAny.fullscreenManager;
      if (fullscreenManager) {
        // Simulate entering fullscreen by updating internal state and firing event
        fullscreenManager._isFullscreen = true;
        fullscreenManager.emit('fullscreenChanged', true);
      }
    },

    simulateFullscreenExit: (): void => {
      const fullscreenManager = appAny.fullscreenManager;
      if (fullscreenManager) {
        // Simulate exiting fullscreen by updating internal state and firing event
        fullscreenManager._isFullscreen = false;
        fullscreenManager.emit('fullscreenChanged', false);
      }
    },
  };
}
