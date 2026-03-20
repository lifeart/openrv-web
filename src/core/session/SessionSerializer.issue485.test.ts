/**
 * Regression tests for issue #485:
 * Overlay states (TimecodeOverlay, SafeAreasOverlay, ClippingOverlay,
 * InfoStripOverlay, SpotlightOverlay, BugOverlay, EXRWindowOverlay,
 * FPSIndicator) must round-trip through SessionSerializer.toJSON() and
 * fromJSON().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionSerializer, type SessionComponents } from './SessionSerializer';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_TONE_MAPPING_STATE, DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';
import { DEFAULT_STEREO_STATE } from '../../core/types/stereo';
import { DEFAULT_GHOST_FRAME_STATE } from '../../ui/components/GhostFrameControl';
import { DEFAULT_DISPLAY_COLOR_STATE } from '../../color/DisplayTransfer';
import { DEFAULT_DIFFERENCE_MATTE_STATE } from '../../ui/components/DifferenceMatteControl';
import { DEFAULT_BLEND_MODE_STATE } from '../../ui/components/ComparisonManager';
import { createDefaultCurvesData } from '../../color/ColorCurves';
import { DEFAULT_STEREO_EYE_TRANSFORM_STATE, DEFAULT_STEREO_ALIGN_MODE } from '../../stereo/StereoRenderer';
import { DEFAULT_TIMECODE_OVERLAY_STATE } from '../../ui/components/TimecodeOverlay';
import { DEFAULT_SAFE_AREAS_STATE } from '../../ui/components/SafeAreasOverlay';
import { DEFAULT_CLIPPING_OVERLAY_STATE } from '../../ui/components/ClippingOverlay';
import { DEFAULT_INFO_STRIP_OVERLAY_STATE } from '../../ui/components/InfoStripOverlay';
import { DEFAULT_SPOTLIGHT_STATE } from '../../ui/components/SpotlightOverlay';
import { DEFAULT_BUG_OVERLAY_STATE } from '../../ui/components/BugOverlay';
import { DEFAULT_EXR_WINDOW_OVERLAY_STATE } from '../../ui/components/EXRWindowOverlay';
import { DEFAULT_FPS_INDICATOR_STATE } from '../../ui/components/FPSIndicator';
import type { TimecodeOverlayState } from '../../ui/components/TimecodeOverlay';
import type { SafeAreasState } from '../../ui/components/SafeAreasOverlay';
import type { ClippingOverlayState } from '../../ui/components/ClippingOverlay';
import type { InfoStripOverlayState } from '../../ui/components/InfoStripOverlay';
import type { SpotlightState } from '../../ui/components/SpotlightOverlay';
import type { BugOverlayState } from '../../ui/components/BugOverlay';
import type { EXRWindowOverlayState } from '../../ui/components/EXRWindowOverlay';
import type { FPSIndicatorState } from '../../ui/components/FPSIndicator';

// Mock Modal functions
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  showSequenceReloadPrompt: vi.fn(),
  FILE_RELOAD_CANCEL: 'cancel',
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/** Creates a mock overlay object with getState/setState methods. */
function createMockOverlay<T>(defaultState: T) {
  let state = { ...defaultState };
  return {
    getState: vi.fn(() => ({ ...state })),
    setState: vi.fn((partial: Partial<T>) => {
      state = { ...state, ...partial };
    }),
  };
}

function createMockComponents(): SessionComponents {
  const paintEngine = new PaintEngine();
  vi.spyOn(paintEngine, 'loadFromAnnotations');

  const timecodeOverlay = createMockOverlay(DEFAULT_TIMECODE_OVERLAY_STATE);
  const safeAreasOverlay = createMockOverlay(DEFAULT_SAFE_AREAS_STATE);
  const clippingOverlay = createMockOverlay(DEFAULT_CLIPPING_OVERLAY_STATE);
  const infoStripOverlay = createMockOverlay(DEFAULT_INFO_STRIP_OVERLAY_STATE);
  const spotlightOverlay = createMockOverlay(DEFAULT_SPOTLIGHT_STATE);
  const bugOverlay = createMockOverlay(DEFAULT_BUG_OVERLAY_STATE);
  const exrWindowOverlay = createMockOverlay(DEFAULT_EXR_WINDOW_OVERLAY_STATE);
  const fpsIndicator = createMockOverlay(DEFAULT_FPS_INDICATOR_STATE);

  return {
    session: {
      allSources: [],
      getPlaybackState: vi.fn().mockReturnValue({
        currentFrame: 1,
        fps: 24,
        loopMode: 'loop',
        playbackMode: 'realtime',
        volume: 1,
        muted: false,
        marks: [],
        currentSourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: -1,
        currentAB: 'A',
        audioScrubEnabled: true,
      }),
      setPlaybackState: vi.fn(),
      clearSources: vi.fn(),
      loadImage: vi.fn<(name: string, url: string) => Promise<void>>().mockResolvedValue(undefined),
      loadVideo: vi.fn<(name: string, url: string) => Promise<void>>().mockResolvedValue(undefined),
      loadFile: vi.fn<(file: File) => Promise<void>>().mockResolvedValue(undefined),
      loadSequence: vi.fn<(files: File[]) => Promise<void>>().mockResolvedValue(undefined),
      toSerializedGraph: vi.fn().mockReturnValue(null),
      loadSerializedGraph: vi.fn().mockReturnValue([]),
      setEdlEntries: vi.fn(),
      noteManager: { toSerializable: vi.fn().mockReturnValue([]), fromSerializable: vi.fn(), dispose: vi.fn() },
      versionManager: { toSerializable: vi.fn().mockReturnValue([]), fromSerializable: vi.fn(), dispose: vi.fn() },
      statusManager: { toSerializable: vi.fn().mockReturnValue([]), fromSerializable: vi.fn(), dispose: vi.fn() },
      addSource: vi.fn(),
      addRepresentationToSource: vi.fn().mockReturnValue({ id: 'mock-rep' }),
      switchRepresentation: vi.fn<(sourceIndex: number, repId: string) => Promise<boolean>>().mockResolvedValue(true),
    },
    paintEngine,
    viewer: {
      getPan: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      getZoom: vi.fn().mockReturnValue(1.0),
      getColorAdjustments: vi.fn().mockReturnValue({}),
      getCDL: vi.fn().mockReturnValue({}),
      getFilterSettings: vi.fn().mockReturnValue({}),
      getTransform: vi.fn().mockReturnValue({}),
      getCropState: vi.fn().mockReturnValue({}),
      getLensParams: vi.fn().mockReturnValue({}),
      getWipeState: vi.fn().mockReturnValue({}),
      getStackLayers: vi.fn().mockReturnValue([]),
      getNoiseReductionParams: vi
        .fn()
        .mockReturnValue({ strength: 0, luminanceStrength: 50, chromaStrength: 75, radius: 2 }),
      getWatermarkState: vi.fn().mockReturnValue({
        enabled: false,
        imageUrl: null,
        position: 'bottom-right',
        customX: 0.9,
        customY: 0.9,
        scale: 1,
        opacity: 0.7,
        margin: 20,
      }),
      getLUT: vi.fn().mockReturnValue(undefined),
      getLUTIntensity: vi.fn().mockReturnValue(1.0),
      getPARState: vi.fn().mockReturnValue({ enabled: false, par: 1.0, preset: 'square' }),
      getBackgroundPatternState: vi
        .fn()
        .mockReturnValue({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' }),
      isOCIOEnabled: vi.fn().mockReturnValue(false),
      getDisplayColorState: vi.fn().mockReturnValue({ ...DEFAULT_DISPLAY_COLOR_STATE }),
      getGamutMappingState: vi.fn().mockReturnValue({ ...DEFAULT_GAMUT_MAPPING_STATE }),
      getToneMappingState: vi.fn().mockReturnValue({ ...DEFAULT_TONE_MAPPING_STATE }),
      getGhostFrameState: vi.fn().mockReturnValue({ ...DEFAULT_GHOST_FRAME_STATE }),
      getStereoState: vi.fn().mockReturnValue({ ...DEFAULT_STEREO_STATE }),
      getChannelMode: vi.fn().mockReturnValue('rgb'),
      getDifferenceMatteState: vi.fn().mockReturnValue({ ...DEFAULT_DIFFERENCE_MATTE_STATE }),
      getBlendModeState: vi.fn().mockReturnValue({ ...DEFAULT_BLEND_MODE_STATE, flickerFrame: 0 }),
      getColorInversion: vi.fn().mockReturnValue(false),
      getCurves: vi.fn().mockReturnValue(createDefaultCurvesData()),
      getStereoEyeTransforms: vi.fn().mockReturnValue({ ...DEFAULT_STEREO_EYE_TRANSFORM_STATE }),
      getStereoAlignMode: vi.fn().mockReturnValue(DEFAULT_STEREO_ALIGN_MODE),
      getDeinterlaceParams: vi.fn().mockReturnValue({ method: 'bob', fieldOrder: 'tff', enabled: false }),
      getFilmEmulationParams: vi.fn().mockReturnValue({ enabled: false, stock: 'kodak-portra-400', intensity: 1.0 }),
      getPerspectiveParams: vi.fn().mockReturnValue({
        enabled: false,
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 1, y: 1 },
        bottomLeft: { x: 0, y: 1 },
        quality: 'bilinear',
      }),
      getStabilizationParams: vi.fn().mockReturnValue({ enabled: false, smoothingStrength: 50 }),
      isUncropActive: vi.fn().mockReturnValue(false),
      setColorAdjustments: vi.fn(),
      setCDL: vi.fn(),
      setFilterSettings: vi.fn(),
      setTransform: vi.fn(),
      setCropState: vi.fn(),
      setLensParams: vi.fn(),
      setWipeState: vi.fn(),
      setStackLayers: vi.fn(),
      setNoiseReductionParams: vi.fn(),
      setWatermarkState: vi.fn(),
      setLUTIntensity: vi.fn(),
      setPARState: vi.fn(),
      setBackgroundPatternState: vi.fn(),
      setZoom: vi.fn(),
      setPan: vi.fn(),
      resetToneMappingState: vi.fn(),
      resetGhostFrameState: vi.fn(),
      resetStereoState: vi.fn(),
      resetStereoEyeTransforms: vi.fn(),
      resetStereoAlignMode: vi.fn(),
      resetChannelMode: vi.fn(),
      resetDifferenceMatteState: vi.fn(),
      syncLUTPipeline: vi.fn(),
      getLUTPipeline: vi.fn().mockReturnValue({
        getSerializableState: vi.fn().mockReturnValue({
          sources: {},
          displayLUT: {
            enabled: false,
            lutName: null,
            intensity: 1,
            source: 'manual',
            inMatrix: null,
            outMatrix: null,
          },
          activeSourceId: null,
        }),
        loadSerializableState: vi.fn(),
      }),
      // Overlay accessors
      getTimecodeOverlay: vi.fn().mockReturnValue(timecodeOverlay),
      getSafeAreasOverlay: vi.fn().mockReturnValue(safeAreasOverlay),
      getClippingOverlay: vi.fn().mockReturnValue(clippingOverlay),
      getInfoStripOverlay: vi.fn().mockReturnValue(infoStripOverlay),
      getSpotlightOverlay: vi.fn().mockReturnValue(spotlightOverlay),
      getBugOverlay: vi.fn().mockReturnValue(bugOverlay),
      getEXRWindowOverlay: vi.fn().mockReturnValue(exrWindowOverlay),
      getFPSIndicator: vi.fn().mockReturnValue(fpsIndicator),
    },
  } as any;
}

describe('Issue #485: Overlay states must round-trip through serialization', () => {
  it('ISS-485-001: toJSON() serializes all overlay states', () => {
    const components = createMockComponents();

    // Configure non-default overlay states
    const timecodeState: TimecodeOverlayState = {
      enabled: true,
      position: 'bottom-right',
      fontSize: 'large',
      showFrameCounter: false,
      backgroundOpacity: 0.8,
      displayFormat: 'smpte',
      sourceTimecode: undefined,
      showSourceTimecode: true,
    };
    const safeAreasState: SafeAreasState = {
      enabled: true,
      titleSafe: false,
      actionSafe: true,
      customSafeArea: false,
      customSafeAreaPercentage: 85,
      centerCrosshair: true,
      ruleOfThirds: true,
      aspectRatio: '2.39:1',
      guideColor: '#ff0000',
      guideOpacity: 0.9,
    };
    const clippingState: ClippingOverlayState = {
      enabled: true,
      showHighlights: true,
      showShadows: false,
      highlightColor: { r: 200, g: 0, b: 0 },
      shadowColor: { r: 0, g: 0, b: 200 },
      bothColor: { r: 200, g: 200, b: 0 },
      opacity: 0.5,
      shadowThreshold: 0.1,
      highlightThreshold: 0.9,
    };
    const infoStripState: InfoStripOverlayState = {
      enabled: true,
      showFullPath: true,
      backgroundOpacity: 0.3,
    };
    const spotlightState: SpotlightState = {
      enabled: true,
      shape: 'rectangle',
      x: 0.3,
      y: 0.4,
      width: 0.15,
      height: 0.25,
      dimAmount: 0.6,
      feather: 0.1,
    };
    const bugState: BugOverlayState = {
      enabled: true,
      imageUrl: 'https://example.com/logo.png',
      position: 'top-left',
      size: 0.12,
      opacity: 0.9,
      margin: 8,
    };
    const exrWindowState: EXRWindowOverlayState = {
      enabled: true,
      showDataWindow: true,
      showDisplayWindow: false,
      dataWindowColor: '#00ff00',
      displayWindowColor: '#ff00ff',
      lineWidth: 3,
      dashPattern: [8, 4],
      showLabels: false,
    };
    const fpsState: FPSIndicatorState = {
      enabled: false,
      position: 'bottom-left',
      showDroppedFrames: false,
      showTargetFps: false,
      backgroundOpacity: 0.4,
      warningThreshold: 0.9,
      criticalThreshold: 0.8,
    };

    (components.viewer.getTimecodeOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(timecodeState),
      setState: vi.fn(),
    });
    (components.viewer.getSafeAreasOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(safeAreasState),
      setState: vi.fn(),
    });
    (components.viewer.getClippingOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(clippingState),
      setState: vi.fn(),
    });
    (components.viewer.getInfoStripOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(infoStripState),
      setState: vi.fn(),
    });
    (components.viewer.getSpotlightOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(spotlightState),
      setState: vi.fn(),
    });
    (components.viewer.getBugOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(bugState),
      setState: vi.fn(),
    });
    (components.viewer.getEXRWindowOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(exrWindowState),
      setState: vi.fn(),
    });
    (components.viewer.getFPSIndicator as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(fpsState),
      setState: vi.fn(),
    });

    const state = SessionSerializer.toJSON(components);

    expect(state.timecodeOverlay).toEqual(timecodeState);
    expect(state.safeAreasOverlay).toEqual(safeAreasState);
    expect(state.clippingOverlay).toEqual(clippingState);
    expect(state.infoStripOverlay).toEqual(infoStripState);
    expect(state.spotlightOverlay).toEqual(spotlightState);
    expect(state.bugOverlay).toEqual(bugState);
    expect(state.exrWindowOverlay).toEqual(exrWindowState);
    expect(state.fpsIndicatorOverlay).toEqual(fpsState);
  });

  it('ISS-485-002: fromJSON() restores all overlay states', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty('test');

    const timecodeState: TimecodeOverlayState = {
      enabled: true,
      position: 'top-right',
      fontSize: 'small',
      showFrameCounter: true,
      backgroundOpacity: 0.4,
      displayFormat: 'both',
      sourceTimecode: undefined,
      showSourceTimecode: true,
    };
    const safeAreasState: SafeAreasState = {
      enabled: true,
      titleSafe: true,
      actionSafe: false,
      customSafeArea: false,
      customSafeAreaPercentage: 85,
      centerCrosshair: false,
      ruleOfThirds: true,
      aspectRatio: '16:9',
      guideColor: '#00ff00',
      guideOpacity: 0.7,
    };
    const clippingState: ClippingOverlayState = {
      enabled: true,
      showHighlights: false,
      showShadows: true,
      highlightColor: { r: 255, g: 100, b: 0 },
      shadowColor: { r: 0, g: 50, b: 255 },
      bothColor: { r: 255, g: 255, b: 0 },
      opacity: 0.6,
      shadowThreshold: 0.05,
      highlightThreshold: 0.95,
    };
    const infoStripState: InfoStripOverlayState = {
      enabled: true,
      showFullPath: false,
      backgroundOpacity: 0.7,
    };
    const spotlightState: SpotlightState = {
      enabled: true,
      shape: 'circle',
      x: 0.6,
      y: 0.7,
      width: 0.3,
      height: 0.3,
      dimAmount: 0.5,
      feather: 0.02,
    };
    const bugState: BugOverlayState = {
      enabled: false,
      imageUrl: null,
      position: 'top-right',
      size: 0.1,
      opacity: 0.5,
      margin: 16,
    };
    const exrWindowState: EXRWindowOverlayState = {
      enabled: false,
      showDataWindow: false,
      showDisplayWindow: true,
      dataWindowColor: '#ff0000',
      displayWindowColor: '#00ccff',
      lineWidth: 1,
      dashPattern: [4, 2],
      showLabels: true,
    };
    const fpsState: FPSIndicatorState = {
      enabled: true,
      position: 'top-left',
      showDroppedFrames: true,
      showTargetFps: true,
      backgroundOpacity: 0.5,
      warningThreshold: 0.95,
      criticalThreshold: 0.8,
    };

    state.timecodeOverlay = timecodeState;
    state.safeAreasOverlay = safeAreasState;
    state.clippingOverlay = clippingState;
    state.infoStripOverlay = infoStripState;
    state.spotlightOverlay = spotlightState;
    state.bugOverlay = bugState;
    state.exrWindowOverlay = exrWindowState;
    state.fpsIndicatorOverlay = fpsState;

    await SessionSerializer.fromJSON(state, components);

    const viewer = components.viewer as any;
    expect(viewer.getTimecodeOverlay().setState).toHaveBeenCalledWith(timecodeState);
    expect(viewer.getSafeAreasOverlay().setState).toHaveBeenCalledWith(safeAreasState);
    expect(viewer.getClippingOverlay().setState).toHaveBeenCalledWith(clippingState);
    expect(viewer.getInfoStripOverlay().setState).toHaveBeenCalledWith(infoStripState);
    expect(viewer.getSpotlightOverlay().setState).toHaveBeenCalledWith(spotlightState);
    expect(viewer.getBugOverlay().setState).toHaveBeenCalledWith(bugState);
    expect(viewer.getEXRWindowOverlay().setState).toHaveBeenCalledWith(exrWindowState);
    expect(viewer.getFPSIndicator().setState).toHaveBeenCalledWith(fpsState);
  });

  it('ISS-485-003: fromJSON() applies defaults when overlay state is absent (legacy projects)', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty('legacy');

    // Simulate a legacy project file that has no overlay fields
    delete state.timecodeOverlay;
    delete state.safeAreasOverlay;
    delete state.clippingOverlay;
    delete state.infoStripOverlay;
    delete state.spotlightOverlay;
    delete state.bugOverlay;
    delete state.exrWindowOverlay;
    delete state.fpsIndicatorOverlay;

    await SessionSerializer.fromJSON(state, components);

    const viewer = components.viewer as any;
    expect(viewer.getTimecodeOverlay().setState).toHaveBeenCalledWith(DEFAULT_TIMECODE_OVERLAY_STATE);
    expect(viewer.getSafeAreasOverlay().setState).toHaveBeenCalledWith(DEFAULT_SAFE_AREAS_STATE);
    expect(viewer.getClippingOverlay().setState).toHaveBeenCalledWith(DEFAULT_CLIPPING_OVERLAY_STATE);
    expect(viewer.getInfoStripOverlay().setState).toHaveBeenCalledWith(DEFAULT_INFO_STRIP_OVERLAY_STATE);
    expect(viewer.getSpotlightOverlay().setState).toHaveBeenCalledWith(DEFAULT_SPOTLIGHT_STATE);
    expect(viewer.getBugOverlay().setState).toHaveBeenCalledWith(DEFAULT_BUG_OVERLAY_STATE);
    expect(viewer.getEXRWindowOverlay().setState).toHaveBeenCalledWith(DEFAULT_EXR_WINDOW_OVERLAY_STATE);
    expect(viewer.getFPSIndicator().setState).toHaveBeenCalledWith(DEFAULT_FPS_INDICATOR_STATE);
  });

  it('ISS-485-004: overlay states survive JSON.stringify/parse round-trip', () => {
    const components = createMockComponents();

    const spotlightState: SpotlightState = {
      enabled: true,
      shape: 'rectangle',
      x: 0.25,
      y: 0.75,
      width: 0.1,
      height: 0.2,
      dimAmount: 0.8,
      feather: 0.03,
    };
    (components.viewer.getSpotlightOverlay as ReturnType<typeof vi.fn>).mockReturnValue({
      getState: vi.fn().mockReturnValue(spotlightState),
      setState: vi.fn(),
    });

    const state = SessionSerializer.toJSON(components);
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    expect(parsed.spotlightOverlay).toEqual(spotlightState);
  });

  it('ISS-485-005: migrate() fills missing fields with defaults for partial overlay state', () => {
    const components = createMockComponents();

    // Simulate a project with partial overlay data (e.g., only enabled field set)
    const state = SessionSerializer.createEmpty('partial');
    state.timecodeOverlay = { enabled: true } as any;
    state.clippingOverlay = { enabled: true, showHighlights: false } as any;

    // fromJSON internally calls migrate() which fills in missing defaults
    // We verify by passing through toJSON -> fromJSON cycle
    const json = JSON.stringify(state);
    const parsed = JSON.parse(json);

    // The migrate function should fill missing fields
    // We can test this indirectly through fromJSON
    void SessionSerializer.fromJSON(parsed, components).then(() => {
      const viewer = components.viewer as any;
      // Timecode: enabled=true should be kept, other fields from defaults
      const timecodeCall = viewer.getTimecodeOverlay().setState.mock.calls[0][0];
      expect(timecodeCall.enabled).toBe(true);
      expect(timecodeCall.position).toBe(DEFAULT_TIMECODE_OVERLAY_STATE.position);

      // Clipping: enabled=true and showHighlights=false kept, rest from defaults
      const clippingCall = viewer.getClippingOverlay().setState.mock.calls[0][0];
      expect(clippingCall.enabled).toBe(true);
      expect(clippingCall.showHighlights).toBe(false);
      expect(clippingCall.opacity).toBe(DEFAULT_CLIPPING_OVERLAY_STATE.opacity);
    });
  });
});
