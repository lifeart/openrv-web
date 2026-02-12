import { test as base, expect, Page } from '@playwright/test';
import path from 'path';

// Sample file paths
export const SAMPLE_VIDEO = 'sample/2d56d82687b78171f50c496bab002bc18d53149b.mp4';
export const SAMPLE_VIDEO2 = 'sample/3ef76c68a6da876ad221431399e0cfe434fbaee5.mp4';
export const SAMPLE_IMAGE = 'sample/test_image.png';
export const SAMPLE_RV_SESSION = 'sample/test_session.rv';
export const SAMPLE_EXR = 'sample/test_hdr.exr';
export const SAMPLE_EXR_SMALL = 'sample/test_small.exr';
export const SAMPLE_EXR_MULTILAYER = 'sample/test_multilayer.exr';
export const SAMPLE_SEQUENCE_DIR = 'sample/sequence';
export const SAMPLE_SEQUENCE_PATTERN = 'frame_####.png';
export const SAMPLE_SEQUENCE_FRAME = 'sample/sequence/frame_0001.png';

// Types matching test-helper.ts
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
  histogramHDRActive: boolean;
  histogramMaxValue: number;
  histogramPixelCount: number;
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

export interface ToneMappingState {
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

export interface FullscreenState {
  isFullscreen: boolean;
  isSupported: boolean;
}

export interface PresentationState {
  enabled: boolean;
  cursorAutoHide: boolean;
  cursorHideDelay: number;
}

export interface LuminanceVisState {
  mode: 'off' | 'false-color' | 'hsv' | 'random-color' | 'contour';
  falseColorPreset: 'standard' | 'arri' | 'red' | 'custom';
  randomBandCount: number;
  randomSeed: number;
  contourLevels: number;
  contourDesaturate: boolean;
  contourLineColor: [number, number, number];
}

/**
 * Get session state from the app
 */
export async function getSessionState(page: Page): Promise<SessionState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getSessionState() ?? {
      currentFrame: 0,
      frameCount: 0,
      inPoint: 0,
      outPoint: 0,
      isPlaying: false,
      isBuffering: false,
      loopMode: 'loop',
      playDirection: 1,
      playbackSpeed: 1,
      preservesPitch: true,
      volume: 0.7,
      muted: false,
      fps: 24,
      hasMedia: false,
      mediaType: null,
      mediaName: null,
      marks: [],
      markers: [],
      currentAB: 'A',
      sourceAIndex: 0,
      sourceBIndex: -1,
      abCompareAvailable: false,
      syncPlayhead: true,
    };
  });
}

/**
 * Get viewer state from the app
 */
export async function getViewerState(page: Page): Promise<ViewerState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getViewerState() ?? {
      zoom: 1,
      panX: 0,
      panY: 0,
      wipeMode: 'off',
      wipePosition: 0.5,
      cropEnabled: false,
      cropRegion: { x: 0, y: 0, width: 1, height: 1 },
      cropAspectRatio: null,
      channelMode: 'rgb',
      stereoMode: 'off',
      stereoEyeSwap: false,
      stereoOffset: 0,
      stereoEyeTransformLeft: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
      stereoEyeTransformRight: { flipH: false, flipV: false, rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
      stereoEyeTransformLinked: false,
      stereoAlignMode: 'off',
      histogramVisible: false,
      histogramMode: 'rgb',
      histogramLogScale: false,
      histogramHDRActive: false,
      histogramMaxValue: 1.0,
      histogramPixelCount: 0,
      waveformVisible: false,
      waveformMode: 'luma',
      vectorscopeVisible: false,
      vectorscopeZoom: 1,
      differenceMatteEnabled: false,
      differenceMatteGain: 1,
      differenceMatteHeatmap: false,
      clippingOverlayEnabled: false,
      histogramClipping: null,
      exrLayerCount: 0,
      exrSelectedLayer: null,
      exrAvailableLayers: [],
      uncropEnabled: false,
      uncropPaddingMode: 'uniform',
      uncropPadding: 0,
      uncropPaddingTop: 0,
      uncropPaddingRight: 0,
      uncropPaddingBottom: 0,
      uncropPaddingLeft: 0,
      parEnabled: false,
      parValue: 1.0,
      parPreset: 'square',
      backgroundPattern: 'black',
      backgroundCheckerSize: 'medium',
      backgroundCustomColor: '#1a1a1a',
      colorInversionEnabled: false,
    };
  });
}

/**
 * Wait for the crop enabled state to reach the expected value.
 * Prefer this over waitForTimeout for deterministic E2E tests.
 */
export async function waitForCropEnabled(page: Page, enabled: boolean, timeout = 2000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getViewerState();
      return state?.cropEnabled === expected;
    },
    enabled,
    { timeout }
  );
}

/**
 * Wait for the crop aspect ratio to reach the expected value.
 */
export async function waitForCropAspectRatio(page: Page, ratio: string | null, timeout = 2000): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getViewerState();
      return state?.cropAspectRatio === expected;
    },
    ratio,
    { timeout }
  );
}

/**
 * Get color adjustment state from the app
 */
export async function getColorState(page: Page): Promise<ColorState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getColorState() ?? {
      exposure: 0,
      gamma: 1,
      saturation: 1,
      vibrance: 0,
      vibranceSkinProtection: true,
      contrast: 1,
      temperature: 0,
      tint: 0,
      brightness: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      hasLUT: false,
      lutIntensity: 1,
    };
  });
}

/**
 * Get pixel probe state from the app
 */
export async function getPixelProbeState(page: Page): Promise<PixelProbeState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getPixelProbeState() ?? {
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
    };
  });
}

/**
 * Get false color state from the app
 */
export async function getFalseColorState(page: Page): Promise<FalseColorState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getFalseColorState() ?? {
      enabled: false,
      preset: 'standard',
    };
  });
}

/**
 * Get tone mapping state from the app
 */
export async function getToneMappingState(page: Page): Promise<ToneMappingState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getToneMappingState() ?? {
      enabled: false,
      operator: 'off',
    };
  });
}

/**
 * Get safe areas overlay state from the app
 */
export async function getSafeAreasState(page: Page): Promise<SafeAreasState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getSafeAreasState() ?? {
      enabled: false,
      titleSafe: true,
      actionSafe: true,
      centerCrosshair: false,
      ruleOfThirds: false,
      aspectRatio: null,
    };
  });
}

/**
 * Get zebra stripes state from the app
 */
export async function getZebraStripesState(page: Page): Promise<ZebraStripesState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getZebraStripesState() ?? {
      enabled: false,
      highEnabled: true,
      lowEnabled: false,
      highThreshold: 95,
      lowThreshold: 5,
    };
  });
}

/**
 * Get color wheels state from the app
 */
export async function getColorWheelsState(page: Page): Promise<ColorWheelsState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getColorWheelsState() ?? {
      lift: { r: 0, g: 0, b: 0, y: 0 },
      gamma: { r: 0, g: 0, b: 0, y: 0 },
      gain: { r: 0, g: 0, b: 0, y: 0 },
      master: { r: 0, g: 0, b: 0, y: 0 },
      linked: false,
      visible: false,
      canUndo: false,
      canRedo: false,
    };
  });
}

/**
 * Get spotlight state from the app
 */
export async function getSpotlightState(page: Page): Promise<SpotlightState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getSpotlightState() ?? {
      enabled: false,
      shape: 'circle',
      x: 0.5,
      y: 0.5,
      width: 0.2,
      height: 0.2,
      dimAmount: 0.7,
      feather: 0.05,
    };
  });
}

/**
 * Get HSL Qualifier state from the app
 */
export async function getHSLQualifierState(page: Page): Promise<HSLQualifierState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getHSLQualifierState() ?? {
      enabled: false,
      hue: { center: 0, width: 30, softness: 20 },
      saturation: { center: 50, width: 100, softness: 10 },
      luminance: { center: 50, width: 100, softness: 10 },
      correction: { hueShift: 0, saturationScale: 1, luminanceScale: 1 },
      invert: false,
      mattePreview: false,
    };
  });
}

/**
 * Get history panel state from the app
 */
export async function getHistoryPanelState(page: Page): Promise<HistoryPanelState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getHistoryPanelState() ?? {
      visible: false,
      entryCount: 0,
      currentIndex: -1,
      canUndo: false,
      canRedo: false,
    };
  });
}

/**
 * Get info panel state from the app
 */
export async function getInfoPanelState(page: Page): Promise<InfoPanelState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getInfoPanelState() ?? {
      enabled: false,
      position: 'top-left',
      filename: null,
      resolution: null,
      currentFrame: 0,
      totalFrames: 0,
      fps: 0,
      colorAtCursor: null,
    };
  });
}

/**
 * Get cache indicator state from the app
 */
export async function getCacheIndicatorState(page: Page): Promise<CacheIndicatorState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getCacheIndicatorState() ?? {
      visible: false,
      cachedCount: 0,
      pendingCount: 0,
      totalFrames: 0,
      isUsingMediabunny: false,
    };
  });
}

/**
 * Get theme state from the app
 */
export async function getThemeState(page: Page): Promise<ThemeState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getThemeState() ?? {
      mode: 'auto',
      resolvedTheme: 'dark',
    };
  });
}

/**
 * Get matte overlay state from the app
 */
export async function getMatteState(page: Page): Promise<MatteState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getMatteState() ?? {
      show: false,
      aspect: 1.78,
      opacity: 0.66,
      heightVisible: -1,
      centerPoint: [0, 0],
    };
  });
}

/**
 * Get session metadata state from the app
 */
export async function getSessionMetadataState(page: Page): Promise<SessionMetadataState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getSessionMetadataState() ?? {
      displayName: '',
      comment: '',
      version: 2,
      origin: 'openrv-web',
      frameIncrement: 1,
    };
  });
}

/**
 * Get stack/layer state from the app
 */
export async function getStackState(page: Page): Promise<StackState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getStackState() ?? {
      layers: [],
      activeLayerId: null,
      layerCount: 0,
      isPanelOpen: false,
    };
  });
}

/**
 * Get OCIO color management state from the app
 */
export async function getOCIOState(page: Page): Promise<OCIOState> {
  return page.evaluate(() => {
    return (window as any).__OPENRV_TEST__?.getOCIOState() ?? {
      enabled: false,
      configName: 'aces_1.2',
      inputColorSpace: 'Auto',
      detectedColorSpace: null,
      workingColorSpace: 'ACEScg',
      display: 'sRGB',
      view: 'ACES 1.0 SDR-video',
      look: 'None',
      lookDirection: 'forward',
      panelVisible: false,
    };
  });
}

/**
 * Get fullscreen state from the app
 */
export async function getFullscreenState(page: Page): Promise<FullscreenState> {
  return page.evaluate(() => {
    return (window as any).__OPENRV_TEST__?.getFullscreenState() ?? {
      isFullscreen: false,
      isSupported: true,
    };
  });
}

/**
 * Simulate entering fullscreen mode (for headless browser testing)
 */
export async function simulateFullscreenEnter(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__OPENRV_TEST__?.simulateFullscreenEnter();
  });
}

/**
 * Simulate exiting fullscreen mode (for headless browser testing)
 */
export async function simulateFullscreenExit(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).__OPENRV_TEST__?.simulateFullscreenExit();
  });
}

/**
 * Get presentation mode state from the app
 */
export async function getPresentationState(page: Page): Promise<PresentationState> {
  return page.evaluate(() => {
    return (window as any).__OPENRV_TEST__?.getPresentationState() ?? {
      enabled: false,
      cursorAutoHide: true,
      cursorHideDelay: 3000,
    };
  });
}

/**
 * Get luminance visualization state from the app
 */
export async function getLuminanceVisState(page: Page): Promise<LuminanceVisState> {
  return page.evaluate(() => {
    return (window as any).__OPENRV_TEST__?.getLuminanceVisState() ?? {
      mode: 'off',
      falseColorPreset: 'standard',
      randomBandCount: 16,
      randomSeed: 42,
      contourLevels: 10,
      contourDesaturate: true,
      contourLineColor: [255, 255, 255],
    };
  });
}

/**
 * Get transform state from the app
 */
export async function getTransformState(page: Page): Promise<TransformState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getTransformState() ?? {
      rotation: 0,
      flipH: false,
      flipV: false,
    };
  });
}

/**
 * Get paint/annotation state from the app
 */
export async function getPaintState(page: Page): Promise<PaintState> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.getPaintState() ?? {
      currentTool: 'pan',
      strokeColor: '#ff0000',
      strokeWidth: 4,
      brushType: 'circle',
      ghostMode: false,
      holdMode: false,
      ghostBefore: 3,
      ghostAfter: 3,
      annotatedFrames: [],
      canUndo: false,
      canRedo: false,
    };
  });
}

/**
 * Wait for test helper to be available
 */
export async function waitForTestHelper(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(() => !!window.__OPENRV_TEST__, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Test fixtures interface
interface AppFixtures {
  appPage: Page;
}

// Extended test with app fixtures
export const test = base.extend<AppFixtures>({
  appPage: async ({ page }, use) => {
    await page.goto('/');
    // Wait for app to be fully loaded
    await page.waitForSelector('#app');
    await page.waitForSelector('.viewer-canvas, canvas');
    await use(page);
  },
});

export { expect };

// Helper functions
export async function loadVideoFile(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_VIDEO);

  // Get the file input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for video to load and render
  await page.waitForTimeout(1000);
}

export async function loadTwoVideoFiles(page: Page): Promise<void> {
  const filePath1 = path.resolve(process.cwd(), SAMPLE_VIDEO);
  const filePath2 = path.resolve(process.cwd(), SAMPLE_VIDEO2);

  // Get the file input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles([filePath1, filePath2]);

  // Wait for videos to load and render
  await page.waitForTimeout(1000);
}

/**
 * Load a second video file after the first video is already loaded
 * This simulates dropping a second video onto an existing session
 */
export async function loadSecondVideoFile(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_VIDEO2);

  // Get the file input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for video to load and render
  await page.waitForTimeout(1000);
}

export async function loadImageFile(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_IMAGE);

  // Get the file input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for image to load and render
  await page.waitForTimeout(500);
}

export async function loadRvSession(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_RV_SESSION);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for session to load
  await page.waitForTimeout(1000);
}

/**
 * Load an EXR (HDR) image file
 */
export async function loadExrFile(page: Page): Promise<void> {
  const filePath = path.resolve(process.cwd(), SAMPLE_EXR);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for EXR to decode and render
  await page.waitForTimeout(1000);
}

/**
 * Load a sequence of image files
 */
export async function loadSequenceFiles(page: Page): Promise<void> {
  // Load all frames from the sequence directory
  const sequenceDir = path.resolve(process.cwd(), SAMPLE_SEQUENCE_DIR);
  const files = [];
  for (let i = 1; i <= 10; i++) {
    const frameNum = String(i).padStart(4, '0');
    files.push(path.join(sequenceDir, `frame_${frameNum}.png`));
  }

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(files);

  // Wait for sequence to load and render
  await page.waitForTimeout(1000);
}

/**
 * Load a single frame from a sequence (tests single-file inference)
 * In practice, this should load only the one file,
 * and the sequence inference happens when all files are available
 */
export async function loadSingleSequenceFrame(page: Page, frameNumber: number = 1): Promise<void> {
  const sequenceDir = path.resolve(process.cwd(), SAMPLE_SEQUENCE_DIR);
  const frameNum = String(frameNumber).padStart(4, '0');
  const filePath = path.join(sequenceDir, `frame_${frameNum}.png`);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for file to load and render
  await page.waitForTimeout(500);
}

/**
 * Wait until there is at least one visible viewer canvas with a non-zero size.
 * Some controls swap render canvases (GL/2D) and there can be a brief hidden gap.
 */
async function waitForRenderableViewerCanvas(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(() => {
    const canvases = Array.from(document.querySelectorAll('.viewer-container canvas'));
    return canvases.some((canvas) => {
      const style = window.getComputedStyle(canvas as HTMLElement);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = (canvas as HTMLCanvasElement).getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }, { timeout });
}

/**
 * Resolve the active viewer render canvas.
 * Prefer visible WebGL canvas when active; otherwise use visible image canvas.
 */
async function getViewerRenderCanvas(page: Page): Promise<ReturnType<Page['locator']>> {
  await waitForRenderableViewerCanvas(page);

  const glCanvas = page.locator('canvas[data-testid="viewer-gl-canvas"]:visible').first();
  if (await glCanvas.isVisible().catch(() => false)) {
    return glCanvas;
  }

  const imageCanvas = page.locator('canvas[data-testid="viewer-image-canvas"]:visible').first();
  if (await imageCanvas.isVisible().catch(() => false)) {
    return imageCanvas;
  }

  const fallback = page.locator('.viewer-container canvas:visible').first();
  await expect(fallback).toBeVisible({ timeout: 5000 });
  return fallback;
}

/**
 * Resolve the 2D image canvas used for pixel sampling/state probes.
 */
async function getViewerImageCanvas(page: Page): Promise<ReturnType<Page['locator']>> {
  const imageCanvas = page.locator('canvas[data-testid="viewer-image-canvas"]');
  if ((await imageCanvas.count()) > 0) {
    return imageCanvas.first();
  }
  return page.locator('.viewer-container canvas').first();
}

/**
 * Best-effort canvas data URL capture that tolerates transient visibility swaps.
 * Falls back through visible and non-visible viewer canvases.
 */
async function captureViewerCanvasDataUrl(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const seen = new Set<HTMLCanvasElement>();
    const candidates: HTMLCanvasElement[] = [];

    const isVisible = (el: HTMLCanvasElement): boolean => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const pushCanvases = (selector: string, requireVisible: boolean) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!(node instanceof HTMLCanvasElement)) continue;
        if (seen.has(node)) continue;
        if (requireVisible && !isVisible(node)) continue;
        seen.add(node);
        candidates.push(node);
      }
    };

    // Prefer visible canvases in order of render significance.
    pushCanvases('canvas[data-testid="viewer-gl-canvas"]', true);
    pushCanvases('canvas[data-testid="viewer-image-canvas"]', true);
    pushCanvases('.viewer-container canvas', true);
    // Fallback to attached canvases even if currently hidden.
    pushCanvases('canvas[data-testid="viewer-gl-canvas"]', false);
    pushCanvases('canvas[data-testid="viewer-image-canvas"]', false);
    pushCanvases('.viewer-container canvas', false);

    for (const canvas of candidates) {
      if (canvas.width < 1 || canvas.height < 1) {
        continue;
      }
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl.startsWith('data:image/png')) {
          return dataUrl;
        }
      } catch {
        // Ignore tainted/detached canvas and try next one.
      }
    }

    return null;
  });
}

/**
 * Capture canvas pixel data as a base64 string for comparison
 */
export async function captureCanvasState(page: Page): Promise<string> {
  const maxAttempts = 16;
  let lastError: unknown = new Error('Viewer canvas data URL not available');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (page.isClosed()) {
      throw new Error('Page was closed while capturing canvas state');
    }

    try {
      const dataUrl = await captureViewerCanvasDataUrl(page);
      if (dataUrl) {
        return dataUrl;
      }
      lastError = new Error('Viewer canvas data URL not available');
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts) {
      await page.waitForTimeout(50);
    }
  }

  throw lastError ?? new Error('Failed to capture canvas state');
}

/**
 * Verify that canvas content changed between two states
 */
export function verifyCanvasChanged(before: string, after: string): boolean {
  return before !== after;
}

/**
 * Get the computed transform style of the canvas or viewer element
 */
export async function getCanvasTransform(page: Page): Promise<{ scale: number; translateX: number; translateY: number }> {
  const canvas = await getViewerRenderCanvas(page);
  const transform = await canvas.evaluate((el) => {
    const style = getComputedStyle(el);
    const matrix = style.transform;
    if (matrix === 'none') {
      return { scale: 1, translateX: 0, translateY: 0 };
    }
    // Parse matrix(a, b, c, d, tx, ty)
    const values = matrix.match(/matrix\(([^)]+)\)/)?.[1]?.split(',').map(v => parseFloat(v.trim()));
    if (values && values.length >= 6) {
      return {
        scale: values[0] || 1,
        translateX: values[4] || 0,
        translateY: values[5] || 0,
      };
    }
    return { scale: 1, translateX: 0, translateY: 0 };
  });
  return transform;
}

/**
 * Get current frame number from session (via DOM inspection)
 */
export async function getCurrentFrame(page: Page): Promise<number> {
  // Try to get frame from any element showing frame info
  const frameText = await page.evaluate(() => {
    // Look for frame display in the app
    const allText = document.body.innerText;
    const frameMatch = allText.match(/Frame:?\s*(\d+)/i);
    if (frameMatch) return parseInt(frameMatch[1] || '0', 10);
    // Try timeline text
    const timeMatch = allText.match(/(\d+)\s*\/\s*\d+/);
    if (timeMatch) return parseInt(timeMatch[1] || '0', 10);
    return 0;
  });
  return frameText;
}

/**
 * Sample canvas pixel colors at specific points
 */
export async function sampleCanvasPixels(page: Page, points: Array<{ x: number; y: number }>): Promise<Array<{ r: number; g: number; b: number; a: number }>> {
  const canvas = await getViewerImageCanvas(page);
  const pixels = await canvas.evaluate((el: HTMLCanvasElement, pts: Array<{ x: number; y: number }>) => {
    const ctx = el.getContext('2d');
    if (!ctx) return pts.map(() => ({ r: 0, g: 0, b: 0, a: 0 }));

    return pts.map(pt => {
      const data = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      return { r: data[0] || 0, g: data[1] || 0, b: data[2] || 0, a: data[3] || 0 };
    });
  }, points);
  return pixels;
}

/**
 * Check if canvas has non-black content (media loaded)
 */
export async function canvasHasContent(page: Page): Promise<boolean> {
  const canvas = await getViewerImageCanvas(page);
  const hasContent = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    if (!ctx) return false;

    // Sample several points across the canvas
    const width = el.width;
    const height = el.height;
    const samplePoints = [
      { x: Math.floor(width / 4), y: Math.floor(height / 4) },
      { x: Math.floor(width / 2), y: Math.floor(height / 2) },
      { x: Math.floor(3 * width / 4), y: Math.floor(3 * height / 4) },
    ];

    for (const pt of samplePoints) {
      const data = ctx.getImageData(pt.x, pt.y, 1, 1).data;
      // Check if pixel is not black (any channel > 10)
      if ((data[0] || 0) > 10 || (data[1] || 0) > 10 || (data[2] || 0) > 10) {
        return true;
      }
    }
    return false;
  });
  return hasContent;
}

/**
 * Calculate average brightness of canvas
 */
export async function getCanvasBrightness(page: Page): Promise<number> {
  const canvas = await getViewerImageCanvas(page);
  const brightness = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    if (!ctx) return 0;

    const width = el.width;
    const height = el.height;

    // Sample a grid of points
    const gridSize = 10;
    let totalBrightness = 0;
    let sampleCount = 0;

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        const px = Math.floor((x + 0.5) * width / gridSize);
        const py = Math.floor((y + 0.5) * height / gridSize);
        const data = ctx.getImageData(px, py, 1, 1).data;
        // Calculate perceived brightness
        const brightness = 0.299 * (data[0] || 0) + 0.587 * (data[1] || 0) + 0.114 * (data[2] || 0);
        totalBrightness += brightness;
        sampleCount++;
      }
    }

    return totalBrightness / sampleCount;
  });
  return brightness;
}

/**
 * Get canvas dimensions
 */
export async function getCanvasDimensions(page: Page): Promise<{ width: number; height: number }> {
  const canvas = await getViewerImageCanvas(page);
  const dims = await canvas.evaluate((el: HTMLCanvasElement) => ({
    width: el.width,
    height: el.height,
  }));
  return dims;
}

/**
 * Trigger export and capture the exported image data
 * Returns the download data as base64
 */
export async function exportFrame(page: Page, format: 'png' | 'jpeg' | 'webp' = 'png'): Promise<{ data: Buffer; filename: string }> {
  // Set up download handler before triggering export
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

  // Trigger export via keyboard shortcut (Ctrl+S for PNG)
  await page.keyboard.press('Control+s');

  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  const readStream = await download.createReadStream();

  // Read the download data
  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks);

  return { data, filename };
}

/**
 * Export with specific format using the export dropdown
 */
export async function exportFrameWithFormat(page: Page, format: 'png' | 'jpeg' | 'webp', includeAnnotations: boolean = true): Promise<Buffer> {
  // Set up download handler
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

  // Click export button
  const exportButton = page.locator('button:has-text("Export")').first();
  await exportButton.click();
  await page.waitForTimeout(100);

  // Select format
  const formatButton = page.locator(`button:has-text("${format.toUpperCase()}")`).first();
  if (await formatButton.isVisible()) {
    await formatButton.click();
  }

  const download = await downloadPromise;
  const readStream = await download.createReadStream();

  const chunks: Buffer[] = [];
  for await (const chunk of readStream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Compare two image buffers and return whether they are different
 */
export function imagesAreDifferent(img1: Buffer, img2: Buffer): boolean {
  if (img1.length !== img2.length) return true;
  return !img1.equals(img2);
}

/**
 * Get app state via the session serializer
 */
export async function getAppState(page: Page): Promise<{
  currentFrame: number;
  isPlaying: boolean;
  inPoint: number;
  outPoint: number;
  loopMode: string;
  volume: number;
  muted: boolean;
}> {
  const state = await page.evaluate(() => {
    // Access the app instance through the window (if exposed)
    const app = (window as unknown as { __openrv_app__?: { session: { currentFrame: number; isPlaying: boolean; inPoint: number; outPoint: number; loopMode: string; volume: number; muted: boolean } } }).__openrv_app__;
    if (app?.session) {
      return {
        currentFrame: app.session.currentFrame,
        isPlaying: app.session.isPlaying,
        inPoint: app.session.inPoint,
        outPoint: app.session.outPoint,
        loopMode: app.session.loopMode,
        volume: app.session.volume,
        muted: app.session.muted,
      };
    }
    return {
      currentFrame: 0,
      isPlaying: false,
      inPoint: 0,
      outPoint: 0,
      loopMode: 'loop',
      volume: 1,
      muted: false,
    };
  });
  return state;
}

interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve a stable screenshot clip around the currently active render canvas.
 * Uses page-level clipping to avoid element screenshot visibility races.
 */
async function getViewerClipRect(page: Page, timeout = 5000): Promise<ClipRect> {
  const deadline = Date.now() + timeout;
  let lastError: unknown = new Error('Viewer clip not available');

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      throw new Error('Page was closed while resolving viewer clip rectangle');
    }

    try {
      // Prefer visible viewer container bounds (stable under canvas swaps).
      const viewer = page.locator('.viewer-container:visible').first();
      let box = await viewer.boundingBox();

      // Fallback to any visible viewer canvas if container bounds are unavailable.
      if (!box) {
        const canvas = page.locator('.viewer-container canvas:visible').first();
        box = await canvas.boundingBox();
      }

      if (box && box.width > 1 && box.height > 1) {
        const x = Math.max(0, Math.floor(box.x));
        const y = Math.max(0, Math.floor(box.y));
        const width = Math.max(1, Math.floor(box.width));
        const height = Math.max(1, Math.floor(box.height));
        return { x, y, width, height };
      }
    } catch (error) {
      lastError = error;
    }

    if (page.isClosed()) {
      throw new Error('Page was closed while waiting for viewer clip rectangle');
    }
    await page.waitForTimeout(40);
  }

  throw lastError ?? new Error('Could not resolve visible viewer clip rectangle');
}

/**
 * Verify video frame changed by checking visual difference
 * Uses screenshot comparison instead of canvas pixel access
 */
export async function captureViewerScreenshot(page: Page): Promise<Buffer> {
  const maxAttempts = 3;
  let lastError: unknown;
  const viewer = page.locator('.viewer-container').first();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (page.isClosed()) {
      throw new Error('Page was closed while capturing viewer screenshot');
    }

    try {
      // Fast path: element screenshot avoids long clip polling loops.
      if (await viewer.isVisible().catch(() => false)) {
        return await viewer.screenshot();
      }

      // Fallback for transient visibility races.
      const clip = await getViewerClipRect(page, 1200);
      return await page.screenshot({ clip });
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
      if (page.isClosed()) {
        throw error;
      }
      await page.waitForTimeout(40 * attempt);
    }
  }

  throw lastError ?? new Error('Failed to capture viewer screenshot');
}

/**
 * Capture just the right half (B side) of the split screen viewer
 * Used to verify that the B source is actually updating during playback
 */
export async function captureBSideScreenshot(page: Page): Promise<Buffer> {
  const box = await getViewerClipRect(page);
  // Capture right half (B side in horizontal split)
  const screenshot = await page.screenshot({
    clip: {
      x: box.x + Math.floor(box.width / 2),
      y: box.y,
      width: Math.ceil(box.width / 2),
      height: box.height,
    },
  });
  return screenshot;
}

/**
 * Capture just the left half (A side) of the split screen viewer
 * Used to verify that the A source is actually updating during playback
 */
export async function captureASideScreenshot(page: Page): Promise<Buffer> {
  const box = await getViewerClipRect(page);
  // Capture left half (A side in horizontal split)
  const screenshot = await page.screenshot({
    clip: {
      x: box.x,
      y: box.y,
      width: Math.floor(box.width / 2),
      height: box.height,
    },
  });
  return screenshot;
}

/**
 * Capture both A and B sides of split screen separately
 * Optimized to only call boundingBox() once
 * Returns { aSide, bSide } screenshots
 */
export async function captureBothSidesScreenshot(page: Page): Promise<{ aSide: Buffer; bSide: Buffer }> {
  const box = await getViewerClipRect(page);

  const halfWidth = Math.floor(box.width / 2);
  const x = box.x;
  const y = box.y;
  const height = box.height;

  // Capture both sides in parallel using the same bounding box
  const [aSide, bSide] = await Promise.all([
    page.screenshot({
      clip: { x, y, width: halfWidth, height },
    }),
    page.screenshot({
      clip: { x: x + halfWidth, y, width: Math.ceil(box.width / 2), height },
    }),
  ]);

  return { aSide, bSide };
}

/**
 * Compare screenshots with tolerance for minor differences
 */
export function screenshotsMatch(img1: Buffer, img2: Buffer, tolerance: number = 0): boolean {
  if (tolerance === 0) {
    return img1.equals(img2);
  }
  // For tolerance > 0, we'd need image comparison library
  // For now, exact match
  return img1.equals(img2);
}

// Tab selectors
export const TABS = {
  view: '[data-tab="view"], button:has-text("View")',
  color: '[data-tab="color"], button:has-text("Color")',
  effects: '[data-tab="effects"], button:has-text("Effects")',
  transform: '[data-tab="transform"], button:has-text("Transform")',
  annotate: '[data-tab="annotate"], button:has-text("Annotate")',
};

// Common selectors
export const SELECTORS = {
  canvas: 'canvas',
  timeline: '.timeline',
  headerBar: '.header-bar',
  tabBar: '.tab-bar',
  contextToolbar: '.context-toolbar',
  playButton: 'button[title*="Play"], button:has-text("Play"), .play-button',
  pauseButton: 'button[title*="Pause"], button:has-text("Pause")',
  volumeControl: '.volume-control',
  exportButton: 'button[title*="Export"], .export-button',
  helpButton: 'button[title*="Help"], button:has-text("?")',
  fileInput: 'input[type="file"]',
};

// Helper to click a tab
export async function clickTab(page: Page, tabName: 'view' | 'color' | 'effects' | 'transform' | 'annotate'): Promise<void> {
  const tabTexts: Record<string, string> = {
    view: 'View',
    color: 'Color',
    effects: 'Effects',
    transform: 'Transform',
    annotate: 'Annotate',
  };

  await page.click(`button:has-text("${tabTexts[tabName]}")`);
  await page.waitForTimeout(100);
}

// Helper to get canvas element
export async function getCanvas(page: Page): Promise<ReturnType<Page['locator']>> {
  return getViewerRenderCanvas(page);
}

// Helper to perform drag operation on canvas
export async function dragOnCanvas(
  page: Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Promise<void> {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  const actualStartX = box.x + startX;
  const actualStartY = box.y + startY;
  const actualEndX = box.x + endX;
  const actualEndY = box.y + endY;

  await page.mouse.move(actualStartX, actualStartY);
  await page.mouse.down();
  await page.mouse.move(actualEndX, actualEndY);
  await page.mouse.up();
}

// Helper to draw a stroke on canvas
export async function drawStroke(
  page: Page,
  points: Array<{ x: number; y: number }>
): Promise<void> {
  const canvas = await getCanvas(page);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  if (points.length < 2) return;

  const [start, ...rest] = points;
  await page.mouse.move(box.x + start!.x, box.y + start!.y);
  await page.mouse.down();

  for (const point of rest) {
    await page.mouse.move(box.x + point.x, box.y + point.y);
  }

  await page.mouse.up();
}

// Helper to get current frame display value
export async function getCurrentFrameDisplay(page: Page): Promise<string> {
  const frameDisplay = page.locator('.frame-display, [class*="frame"]').first();
  return await frameDisplay.textContent() || '';
}

// Helper to wait for media to load
export async function waitForMediaLoad(page: Page): Promise<void> {
  // Wait for either video element or image to be present
  await page.waitForFunction(() => {
    const videos = document.querySelectorAll('video');
    const images = document.querySelectorAll('img');
    return videos.length > 0 || images.length > 0;
  }, { timeout: 10000 }).catch(() => {
    // Media might be rendered directly to canvas without video/img elements
  });
  await page.waitForTimeout(300);
}

// Helper to check if slider exists and get its value
export async function getSliderValue(page: Page, label: string): Promise<number> {
  const slider = page.locator(`input[type="range"]`).filter({ hasText: label });
  const value = await slider.inputValue();
  return parseFloat(value);
}

// Helper to set slider value
export async function setSliderValue(page: Page, selector: string, value: number): Promise<void> {
  const slider = page.locator(selector);
  await slider.fill(String(value));
  await slider.dispatchEvent('input');
  await slider.dispatchEvent('change');
}

// Helper to verify button state
export async function isButtonActive(page: Page, buttonText: string): Promise<boolean> {
  const button = page.locator(`button:has-text("${buttonText}")`);
  const className = await button.getAttribute('class') || '';
  return className.includes('active') || className.includes('selected');
}

// Export type for page with loaded media
export type AppPageWithMedia = Page;

/**
 * Check if mediabunny is being used for the current video source
 */
export async function isUsingMediabunny(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return window.__OPENRV_TEST__?.isUsingMediabunny?.() ?? false;
  });
}

/**
 * Get extended session info including mediabunny status
 */
export async function getExtendedSessionState(page: Page): Promise<SessionState & { isUsingMediabunny: boolean }> {
  return page.evaluate(() => {
    const baseState = window.__OPENRV_TEST__?.getSessionState() ?? {
      currentFrame: 0,
      frameCount: 0,
      inPoint: 0,
      outPoint: 0,
      isPlaying: false,
      isBuffering: false,
      loopMode: 'loop',
      playDirection: 1,
      playbackSpeed: 1,
      preservesPitch: true,
      volume: 0.7,
      muted: false,
      fps: 24,
      hasMedia: false,
      mediaType: null,
      mediaName: null,
      marks: [],
      markers: [],
      currentAB: 'A',
      sourceAIndex: 0,
      sourceBIndex: -1,
      abCompareAvailable: false,
      syncPlayhead: true,
    };
    return {
      ...baseState,
      isUsingMediabunny: window.__OPENRV_TEST__?.isUsingMediabunny?.() ?? false,
    };
  });
}

// Timeout constants for deterministic E2E tests
// Use these instead of magic numbers to maintain consistency
const TIMEOUT_SHORT = 2000;   // For quick state changes (play/pause, direction)
const TIMEOUT_MEDIUM = 5000;  // For frame operations that may require loading
const TIMEOUT_LONG = 10000;   // For heavy operations like initial media load

/**
 * Wait for playback state to change to the expected value.
 * Prefer this over waitForTimeout for deterministic E2E tests.
 */
export async function waitForPlaybackState(page: Page, isPlaying: boolean, timeout = TIMEOUT_SHORT): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.isPlaying === expected;
    },
    isPlaying,
    { timeout }
  );
}

/**
 * Wait for the current frame to reach or exceed a target value.
 */
export async function waitForFrameAtLeast(page: Page, minFrame: number, timeout = TIMEOUT_MEDIUM): Promise<void> {
  await page.waitForFunction(
    (min) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.currentFrame >= min;
    },
    minFrame,
    { timeout }
  );
}

/**
 * Wait for frame to change from a known value.
 */
export async function waitForFrameChange(page: Page, fromFrame: number, timeout = TIMEOUT_MEDIUM): Promise<void> {
  await page.waitForFunction(
    (from) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.currentFrame !== from;
    },
    fromFrame,
    { timeout }
  );
}

/**
 * Wait for cache to have at least N cached frames.
 */
export async function waitForCachedFrames(page: Page, minCached: number, timeout = TIMEOUT_MEDIUM): Promise<void> {
  await page.waitForFunction(
    (min) => {
      const state = (window as any).__OPENRV_TEST__?.getCacheIndicatorState();
      return state?.cachedCount >= min;
    },
    minCached,
    { timeout }
  );
}

/**
 * Wait for pending frame count to drop to or below a threshold.
 */
export async function waitForPendingFramesBelow(page: Page, maxPending: number, timeout = TIMEOUT_MEDIUM): Promise<void> {
  await page.waitForFunction(
    (max) => {
      const state = (window as any).__OPENRV_TEST__?.getCacheIndicatorState();
      return state?.pendingCount <= max;
    },
    maxPending,
    { timeout }
  );
}

/**
 * Wait for play direction to change to the expected value.
 */
export async function waitForPlayDirection(page: Page, direction: number, timeout = TIMEOUT_SHORT): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.playDirection === expected;
    },
    direction,
    { timeout }
  );
}

/**
 * Wait for frame to be at an exact value.
 */
export async function waitForFrame(page: Page, frame: number, timeout = TIMEOUT_SHORT): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.currentFrame === expected;
    },
    frame,
    { timeout }
  );
}

/**
 * Wait for media to be loaded (hasMedia becomes true).
 */
export async function waitForMediaLoaded(page: Page, timeout = TIMEOUT_LONG): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.hasMedia === true;
    },
    undefined,
    { timeout }
  );
}

/**
 * Wait for the current frame to be at or below a target value.
 * Useful for verifying reverse playback.
 */
export async function waitForFrameAtMost(page: Page, maxFrame: number, timeout = TIMEOUT_MEDIUM): Promise<void> {
  await page.waitForFunction(
    (max) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.currentFrame <= max;
    },
    maxFrame,
    { timeout }
  );
}

/**
 * Wait for the current frame to be at the end of the video.
 */
export async function waitForFrameAtEnd(page: Page, timeout = TIMEOUT_MEDIUM): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.currentFrame === state?.frameCount;
    },
    undefined,
    { timeout }
  );
}

/**
 * Wait for loop mode to change to the expected value.
 * Prefer this over waitForTimeout for deterministic E2E tests.
 */
export async function waitForLoopMode(page: Page, loopMode: 'once' | 'loop' | 'pingpong', timeout = TIMEOUT_SHORT): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.loopMode === expected;
    },
    loopMode,
    { timeout }
  );
}

/**
 * Wait for buffering state to change to the expected value.
 */
export async function waitForBufferingState(page: Page, isBuffering: boolean, timeout = TIMEOUT_MEDIUM): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__OPENRV_TEST__?.getSessionState();
      return state?.isBuffering === expected;
    },
    isBuffering,
    { timeout }
  );
}
