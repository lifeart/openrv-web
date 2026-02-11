import { describe, it, expect, afterEach } from 'vitest';
import type { App } from './App';
import { exposeForTesting } from './test-helper';

function makeFakeApp(overrides: Record<string, unknown> = {}): App {
  const fakeApp = {
    session: {
      currentSource: null,
      currentFrame: 0,
      inPoint: 0,
      outPoint: 0,
      isPlaying: false,
      isBuffering: false,
      loopMode: 'loop',
      playDirection: 1,
      playbackSpeed: 1,
      preservesPitch: false,
      volume: 1,
      muted: false,
      fps: 24,
      markedFrames: [],
      marks: new Map(),
      currentAB: 'A',
      sourceAIndex: 0,
      sourceBIndex: 1,
      abCompareAvailable: false,
      syncPlayhead: true,
      isUsingMediabunny: () => false,
      metadata: {
        displayName: '',
        comment: '',
        version: 2,
        origin: 'openrv-web',
      },
      frameIncrement: 1,
    },
    viewer: {
      getZoom: () => 1,
      getPan: () => ({ x: 0, y: 0 }),
      getWipeState: () => ({ mode: 'off', position: 0.5 }),
      getCropState: () => ({ enabled: false, region: { x: 0, y: 0, width: 1, height: 1 }, aspectRatio: null }),
      getChannelMode: () => 'rgb',
      getStereoState: () => ({ mode: 'off', eyeSwap: false, offset: 0 }),
      getStereoEyeTransforms: () => ({
        left: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
        right: { flipH: false, flipV: false, rotation: 0, scale: 1, translateX: 0, translateY: 0 },
        linked: false,
      }),
      getStereoAlignMode: () => 'off',
      getDifferenceMatteState: () => ({ enabled: false, gain: 1, heatmap: false }),
      getClippingOverlay: () => ({ isEnabled: () => false }),
      getUncropState: () => ({
        enabled: false,
        paddingMode: 'uniform',
        padding: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
      }),
      getPARState: () => ({ enabled: false, par: 1, preset: 'square' }),
      getBackgroundPatternState: () => ({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' }),
      getColorInversion: () => false,
      getColorAdjustments: () => ({ exposure: 0 }),
      getPixelProbe: () => ({ getState: () => ({ enabled: false }) }),
      getFalseColor: () => ({ getState: () => ({ enabled: false, preset: 'standard' }) }),
      getSafeAreasOverlay: () => ({ getState: () => ({ enabled: false }) }),
      getTimecodeOverlay: () => ({ getState: () => ({ enabled: false }) }),
      getZebraStripes: () => ({ getState: () => ({ enabled: false }) }),
      getSpotlightOverlay: () => ({ getState: () => ({ enabled: false }) }),
      getHSLQualifier: () => ({ getState: () => ({ enabled: false }) }),
      getColorWheels: () => ({
        getState: () => ({
          lift: { r: 0, g: 0, b: 0, y: 0 },
          gamma: { r: 0, g: 0, b: 0, y: 0 },
          gain: { r: 0, g: 0, b: 0, y: 0 },
          master: { r: 0, g: 0, b: 0, y: 0 },
          linked: false,
        }),
        isVisible: () => false,
        canUndo: () => false,
        canRedo: () => false,
      }),
      getMatteOverlay: () => ({ getSettings: () => ({ show: false, aspect: 1.78, opacity: 0.66, heightVisible: -1, centerPoint: [0, 0] }) }),
      getLuminanceVisualization: () => ({ getState: () => ({ mode: 'off' }) }),
    },
    paintEngine: {
      tool: 'none',
      color: [1, 0, 0, 1],
      brush: 0,
      undoStack: [],
      redoStack: [],
      effects: { ghost: false, hold: false, ghostBefore: 3, ghostAfter: 3 },
      getAnnotationsForFrame: () => [],
      getAnnotatedFrames: () => new Set<number>(),
      width: 4,
    },
    fullscreenManager: {
      isFullscreen: false,
      emit: () => {},
    },
    controls: {
      histogram: { isVisible: () => false, getMode: () => 'rgb', isLogScale: () => false, getClipping: () => null },
      waveform: { isVisible: () => false, getMode: () => 'luma' },
      vectorscope: { isVisible: () => false, getZoom: () => 1 },
      channelSelect: { getEXRLayerState: () => ({ availableLayers: [], selectedLayer: null }) },
      colorControls: { getAdjustments: () => ({ exposure: 0 }), getLUT: () => null, getLUTIntensity: () => 1 },
      toneMappingControl: { getState: () => ({ enabled: false, operator: 'off' }) },
      historyPanel: { getState: () => ({ visible: false, entryCount: 0, currentIndex: -1 }), historyManager: { getState: () => ({ canUndo: false, canRedo: false }) } },
      infoPanel: { getState: () => ({ enabled: false, position: 'top-left' }) },
      transformControl: { getTransform: () => ({ rotation: 0, flipH: false, flipV: false }) },
      cacheIndicator: { getState: () => ({ visible: false, cachedCount: 0, pendingCount: 0, totalFrames: 0 }) },
      stackControl: { getLayers: () => [], getActiveLayer: () => null, isPanelOpen: false },
      ocioControl: { getState: () => ({ enabled: false }), isExpanded: false },
      presentationMode: { getState: () => ({ enabled: false, cursorAutoHide: true, cursorHideDelay: 3000 }) },
      networkControl: { getState: () => ({ isPanelOpen: false }) },
      networkSyncManager: {
        connectionState: 'disconnected',
        roomInfo: null,
        users: [],
        isHost: false,
        syncSettings: { playback: true, view: true, color: false, annotations: false },
        rtt: 0,
      },
    },
    ...overrides,
  };
  return fakeApp as unknown as App;
}

describe('test-helper adapter', () => {
  afterEach(() => {
    delete window.__OPENRV_TEST__;
  });

  it('reads color state from controls.colorControls.getAdjustments()', () => {
    const app = makeFakeApp({
      controls: {
        colorControls: {
          getAdjustments: () => ({ exposure: 1.5, gamma: 2.2, saturation: 0.8 }),
          getLUT: () => ({ id: 'lut' }),
          getLUTIntensity: () => 0.65,
        },
      },
      // Old stale path with contradictory values should be ignored
      colorControls: {
        adjustments: { exposure: -99 },
        currentLUT: null,
        lutIntensity: 0,
      },
    });

    exposeForTesting(app);
    const state = window.__OPENRV_TEST__!.getColorState();
    expect(state.exposure).toBe(1.5);
    expect(state.gamma).toBe(2.2);
    expect(state.saturation).toBe(0.8);
    expect(state.hasLUT).toBe(true);
    expect(state.lutIntensity).toBe(0.65);
  });

  it('reads viewer state through getter APIs instead of stale fields', () => {
    const app = makeFakeApp({
      viewer: {
        getZoom: () => 2.5,
        getPan: () => ({ x: 12, y: -4 }),
        getWipeState: () => ({ mode: 'vertical', position: 0.33 }),
        getCropState: () => ({ enabled: true, region: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }, aspectRatio: '16:9' }),
        getChannelMode: () => 'luminance',
        getStereoState: () => ({ mode: 'anaglyph', eyeSwap: true, offset: 5 }),
        getStereoEyeTransforms: () => ({
          left: { flipH: true, flipV: false, rotation: 90, scale: 1.2, translateX: 0.1, translateY: -0.1 },
          right: { flipH: false, flipV: true, rotation: 270, scale: 0.9, translateX: -0.2, translateY: 0.2 },
          linked: false,
        }),
        getStereoAlignMode: () => 'difference',
        getDifferenceMatteState: () => ({ enabled: true, gain: 3.5, heatmap: true }),
        getClippingOverlay: () => ({ isEnabled: () => true }),
        getUncropState: () => ({ enabled: true, paddingMode: 'per-side', padding: 0, paddingTop: 10, paddingRight: 20, paddingBottom: 30, paddingLeft: 40 }),
        getPARState: () => ({ enabled: true, par: 1.5, preset: 'anamorphic' }),
        getBackgroundPatternState: () => ({ pattern: 'checker', checkerSize: 'large', customColor: '#222222' }),
        getColorInversion: () => true,
        getColorAdjustments: () => ({ exposure: 2 }),
        getPixelProbe: () => ({ getState: () => ({ enabled: false }) }),
        getFalseColor: () => ({ getState: () => ({ enabled: false, preset: 'standard' }) }),
        getSafeAreasOverlay: () => ({ getState: () => ({ enabled: false }) }),
        getTimecodeOverlay: () => ({ getState: () => ({ enabled: false }) }),
        getZebraStripes: () => ({ getState: () => ({ enabled: false }) }),
        getSpotlightOverlay: () => ({ getState: () => ({ enabled: false }) }),
        getHSLQualifier: () => ({ getState: () => ({ enabled: false }) }),
        getColorWheels: () => ({
          getState: () => ({
            lift: { r: 0, g: 0, b: 0, y: 0 },
            gamma: { r: 0, g: 0, b: 0, y: 0 },
            gain: { r: 0, g: 0, b: 0, y: 0 },
            master: { r: 0, g: 0, b: 0, y: 0 },
            linked: false,
          }),
          isVisible: () => false,
          canUndo: () => false,
          canRedo: () => false,
        }),
        getMatteOverlay: () => ({ getSettings: () => ({ show: false, aspect: 1.78, opacity: 0.66, heightVisible: -1, centerPoint: [0, 0] }) }),
        getLuminanceVisualization: () => ({ getState: () => ({ mode: 'off' }) }),
      },
      // Contradictory stale fields should not drive output
      histogram: { isVisible: () => false },
    });

    exposeForTesting(app);
    const state = window.__OPENRV_TEST__!.getViewerState();
    expect(state.zoom).toBe(2.5);
    expect(state.panX).toBe(12);
    expect(state.panY).toBe(-4);
    expect(state.wipeMode).toBe('vertical');
    expect(state.cropEnabled).toBe(true);
    expect(state.cropAspectRatio).toBe('16:9');
    expect(state.channelMode).toBe('luminance');
    expect(state.stereoMode).toBe('anaglyph');
    expect(state.differenceMatteEnabled).toBe(true);
    expect(state.parEnabled).toBe(true);
    expect(state.backgroundPattern).toBe('checker');
    expect(state.colorInversionEnabled).toBe(true);
    expect(state.colorAdjustments.exposure).toBe(2);
  });

  it('records missing paths in compatibility mode without throwing', () => {
    const app = makeFakeApp({ controls: undefined });
    exposeForTesting(app);

    const toneMappingState = window.__OPENRV_TEST__!.getToneMappingState();
    expect(toneMappingState.enabled).toBe(false);

    const diagnostics = window.__OPENRV_TEST__!.getDiagnostics();
    expect(diagnostics.strictMode).toBe(false);
    expect(diagnostics.missingPaths).toContain('app.controls');
    expect(diagnostics.missingPaths).toContain('app.controls.toneMappingControl');
  });

  it('throws in strict mode when required component path is missing', () => {
    const app = makeFakeApp({ controls: undefined });
    exposeForTesting(app);
    window.__OPENRV_TEST__!.setStrictMode(true);

    expect(() => window.__OPENRV_TEST__!.getToneMappingState()).toThrow(/Missing component/);
  });
});

