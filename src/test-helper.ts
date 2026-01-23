/**
 * Test Helper - Exposes app internals for e2e testing
 * This file should only be imported in development/test builds
 */

import type { App } from './App';
import { getThemeManager } from './utils/ThemeManager';

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
      isUsingMediabunny: () => boolean;
    };
  }
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
  loopMode: 'once' | 'loop' | 'pingpong';
  playDirection: number;
  playbackSpeed: number;
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
  wipeMode: 'off' | 'horizontal' | 'vertical' | 'quad';
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
  ire: number;
}

export interface FalseColorState {
  enabled: boolean;
  preset: 'standard' | 'arri' | 'red' | 'custom';
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

export function exposeForTesting(app: App): void {
  // Access private properties through any cast (for testing only)
  const appAny = app as any;

  window.__OPENRV_TEST__ = {
    app,

    getSessionState: (): SessionState => {
      const session = appAny.session;
      const source = session.currentSource;
      return {
        currentFrame: session.currentFrame,
        // frameCount is the duration in the in/out range, use source?.duration for total
        frameCount: source?.duration ?? 0,
        inPoint: session.inPoint,
        outPoint: session.outPoint,
        isPlaying: session.isPlaying,
        loopMode: session.loopMode,
        playDirection: session.playDirection,
        playbackSpeed: session.playbackSpeed,
        volume: session.volume,
        muted: session.muted,
        fps: session.fps,
        hasMedia: !!source,
        mediaType: source?.type ?? null,
        mediaName: source?.name ?? null,
        marks: session.markedFrames ?? [],
        markers: Array.from(session.marks?.values?.() ?? []).map((m: unknown) => {
          const marker = m as { frame: number; note: string; color: string };
          return {
            frame: marker.frame,
            note: marker.note,
            color: marker.color,
          };
        }),
        // A/B Compare state
        currentAB: session.currentAB,
        sourceAIndex: session.sourceAIndex,
        sourceBIndex: session.sourceBIndex,
        abCompareAvailable: session.abCompareAvailable,
        syncPlayhead: session.syncPlayhead,
      };
    },

    getViewerState: (): ViewerState => {
      const viewer = appAny.viewer;
      const histogram = appAny.histogram;
      const waveform = appAny.waveform;
      const vectorscope = appAny.vectorscope;
      return {
        zoom: viewer.zoom ?? 1,
        panX: viewer.panX ?? 0,
        panY: viewer.panY ?? 0,
        wipeMode: viewer.wipeState?.mode ?? 'off',
        wipePosition: viewer.wipeState?.position ?? 0.5,
        cropEnabled: viewer.cropState?.enabled ?? false,
        cropRegion: {
          x: viewer.cropState?.region?.x ?? 0,
          y: viewer.cropState?.region?.y ?? 0,
          width: viewer.cropState?.region?.width ?? 1,
          height: viewer.cropState?.region?.height ?? 1,
        },
        cropAspectRatio: viewer.cropState?.aspectRatio ?? null,
        channelMode: viewer.channelMode ?? 'rgb',
        stereoMode: viewer.stereoState?.mode ?? 'off',
        stereoEyeSwap: viewer.stereoState?.eyeSwap ?? false,
        stereoOffset: viewer.stereoState?.offset ?? 0,
        histogramVisible: histogram?.isVisible?.() ?? false,
        histogramMode: histogram?.getMode?.() ?? 'rgb',
        histogramLogScale: histogram?.isLogScale?.() ?? false,
        waveformVisible: waveform?.isVisible?.() ?? false,
        waveformMode: waveform?.getMode?.() ?? 'luma',
        vectorscopeVisible: vectorscope?.isVisible?.() ?? false,
        vectorscopeZoom: vectorscope?.getZoom?.() ?? 1,
        // Difference matte state
        differenceMatteEnabled: viewer.differenceMatteState?.enabled ?? false,
        differenceMatteGain: viewer.differenceMatteState?.gain ?? 1,
        differenceMatteHeatmap: viewer.differenceMatteState?.heatmap ?? false,
        // Clipping overlay state
        clippingOverlayEnabled: viewer.getClippingOverlay?.()?.isEnabled?.() ?? false,
        histogramClipping: histogram?.getClipping?.() ?? null,
      };
    },

    getColorState: (): ColorState => {
      const colorControls = appAny.colorControls;
      const adjustments = colorControls?.adjustments ?? {};
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
        hasLUT: !!colorControls?.currentLUT,
        lutIntensity: colorControls?.lutIntensity ?? 1,
      };
    },

    getPixelProbeState: (): PixelProbeState => {
      const viewer = appAny.viewer;
      const pixelProbe = viewer?.getPixelProbe?.();
      const state = pixelProbe?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        locked: state.locked ?? false,
        x: state.x ?? 0,
        y: state.y ?? 0,
        rgb: state.rgb ?? { r: 0, g: 0, b: 0 },
        ire: state.ire ?? 0,
      };
    },

    getFalseColorState: (): FalseColorState => {
      const viewer = appAny.viewer;
      const falseColor = viewer?.getFalseColor?.();
      const state = falseColor?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        preset: state.preset ?? 'standard',
      };
    },

    getSafeAreasState: (): SafeAreasState => {
      const viewer = appAny.viewer;
      const safeAreas = viewer?.getSafeAreasOverlay?.();
      const state = safeAreas?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        titleSafe: state.titleSafe ?? true,
        actionSafe: state.actionSafe ?? true,
        centerCrosshair: state.centerCrosshair ?? false,
        ruleOfThirds: state.ruleOfThirds ?? false,
        aspectRatio: state.aspectRatio ?? null,
      };
    },

    getTimecodeOverlayState: (): TimecodeOverlayState => {
      const viewer = appAny.viewer;
      const timecodeOverlay = viewer?.getTimecodeOverlay?.();
      const state = timecodeOverlay?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        position: state.position ?? 'top-left',
        fontSize: state.fontSize ?? 'medium',
        showFrameCounter: state.showFrameCounter ?? true,
      };
    },

    getZebraStripesState: (): ZebraStripesState => {
      const viewer = appAny.viewer;
      const zebraStripes = viewer?.getZebraStripes?.();
      const state = zebraStripes?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        highEnabled: state.highEnabled ?? true,
        lowEnabled: state.lowEnabled ?? false,
        highThreshold: state.highThreshold ?? 95,
        lowThreshold: state.lowThreshold ?? 5,
      };
    },

    getColorWheelsState: (): ColorWheelsState => {
      const viewer = appAny.viewer;
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

    getSpotlightState: (): SpotlightState => {
      const viewer = appAny.viewer;
      const spotlight = viewer?.getSpotlightOverlay?.();
      const state = spotlight?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        shape: state.shape ?? 'circle',
        x: state.x ?? 0.5,
        y: state.y ?? 0.5,
        width: state.width ?? 0.2,
        height: state.height ?? 0.2,
        dimAmount: state.dimAmount ?? 0.7,
        feather: state.feather ?? 0.05,
      };
    },

    getHSLQualifierState: (): HSLQualifierState => {
      const viewer = appAny.viewer;
      const hslQualifier = viewer?.getHSLQualifier?.();
      const state = hslQualifier?.getState?.() ?? {};
      return {
        enabled: state.enabled ?? false,
        hue: state.hue ?? { center: 0, width: 30, softness: 20 },
        saturation: state.saturation ?? { center: 50, width: 100, softness: 10 },
        luminance: state.luminance ?? { center: 50, width: 100, softness: 10 },
        correction: state.correction ?? { hueShift: 0, saturationScale: 1, luminanceScale: 1 },
        invert: state.invert ?? false,
        mattePreview: state.mattePreview ?? false,
      };
    },

    getHistoryPanelState: (): HistoryPanelState => {
      const historyPanel = appAny.historyPanel;
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
      const infoPanel = appAny.infoPanel;
      const session = appAny.session;
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
      const transformControl = appAny.transformControl;
      const transform = transformControl?.getTransform?.() ?? {};
      return {
        rotation: transform.rotation ?? 0,
        flipH: transform.flipH ?? false,
        flipV: transform.flipV ?? false,
      };
    },

    getPaintState: (): PaintState => {
      const paintEngine = appAny.paintEngine;
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
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      };
    },

    getCacheIndicatorState: (): CacheIndicatorState => {
      const session = appAny.session;
      const cacheIndicator = appAny.cacheIndicator;
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
      const viewer = appAny.viewer;
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
      const session = appAny.session;
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
      const stackControl = appAny.stackControl;
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
        isPanelOpen: stackControl?.isPanelOpen ?? false,
      };
    },

    isUsingMediabunny: (): boolean => {
      const session = appAny.session;
      return session?.isUsingMediabunny?.() ?? false;
    },
  };
}
