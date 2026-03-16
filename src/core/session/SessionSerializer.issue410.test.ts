/**
 * Regression tests for issue #410: Partial project/snapshot restore
 * must remap currentSourceIndex (and sourceAIndex/sourceBIndex) through
 * mediaIndexMap so the active source does not land on the wrong media
 * after skipped loads.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionSerializer, type SessionComponents } from './SessionSerializer';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_TONE_MAPPING_STATE } from '../../core/types/effects';
import { DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';
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

// Mock the showFileReloadPrompt dialog
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  FILE_RELOAD_CANCEL: 'cancel',
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockComponents(): SessionComponents {
  const paintEngine = new PaintEngine();
  vi.spyOn(paintEngine, 'loadFromAnnotations');

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
        preservesPitch: true,
        audioScrubEnabled: true,
        marks: [],
        currentSourceIndex: 0,
        sourceAIndex: 0,
        sourceBIndex: -1,
        currentAB: 'A',
      }),
      setPlaybackState: vi.fn(),
      clearSources: vi.fn(),
      loadImage: vi.fn<(name: string, url: string) => Promise<void>>().mockResolvedValue(undefined),
      loadVideo: vi.fn<(name: string, url: string) => Promise<void>>().mockResolvedValue(undefined),
      loadFile: vi.fn<(file: File) => Promise<void>>().mockResolvedValue(undefined),
      toSerializedGraph: vi.fn().mockReturnValue(null),
      loadSerializedGraph: vi.fn().mockReturnValue([]),
      setEdlEntries: vi.fn(),
      noteManager: {
        toSerializable: vi.fn().mockReturnValue([]),
        fromSerializable: vi.fn(),
        dispose: vi.fn(),
      },
      versionManager: {
        toSerializable: vi.fn().mockReturnValue([]),
        fromSerializable: vi.fn(),
        dispose: vi.fn(),
      },
      statusManager: {
        toSerializable: vi.fn().mockReturnValue([]),
        fromSerializable: vi.fn(),
        dispose: vi.fn(),
      },
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
      getNoiseReductionParams: vi.fn().mockReturnValue({ strength: 0, luminanceStrength: 50, chromaStrength: 75, radius: 2 }),
      getWatermarkState: vi.fn().mockReturnValue({
        enabled: false, imageUrl: null, position: 'bottom-right',
        customX: 0.9, customY: 0.9, scale: 1, opacity: 0.7, margin: 20,
      }),
      getLUT: vi.fn().mockReturnValue(undefined),
      getLUTIntensity: vi.fn().mockReturnValue(1.0),
      getPARState: vi.fn().mockReturnValue({ enabled: false, par: 1.0, preset: 'square' }),
      getBackgroundPatternState: vi.fn().mockReturnValue({ pattern: 'black', checkerSize: 'medium', customColor: '#1a1a1a' }),
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
      getPerspectiveParams: vi.fn().mockReturnValue({ enabled: false, topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 0 }, bottomRight: { x: 1, y: 1 }, bottomLeft: { x: 0, y: 1 }, quality: 'bilinear' }),
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
      getLUTPipeline: vi.fn().mockReturnValue({
        getActiveSourceId: vi.fn().mockReturnValue('default'),
        getSourceConfig: vi.fn().mockReturnValue({
          fileLUT: { lutData: null, enabled: false, intensity: 1 },
          lookLUT: { lutData: null, enabled: false, intensity: 1 },
          preCacheLUT: { lutData: null, enabled: false, intensity: 1 },
        }),
        getState: vi.fn().mockReturnValue({
          displayLUT: { lutData: null, enabled: false, intensity: 1 },
        }),
        getSerializableState: vi.fn().mockReturnValue({
          sources: {},
          displayLUT: { enabled: false, lutName: null, intensity: 1, source: 'manual' },
          activeSourceId: null,
        }),
      }),
      getTimecodeOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_TIMECODE_OVERLAY_STATE }), setState: vi.fn() }),
      getSafeAreasOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_SAFE_AREAS_STATE }), setState: vi.fn() }),
      getClippingOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_CLIPPING_OVERLAY_STATE }), setState: vi.fn() }),
      getInfoStripOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_INFO_STRIP_OVERLAY_STATE }), setState: vi.fn() }),
      getSpotlightOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_SPOTLIGHT_STATE }), setState: vi.fn() }),
      getBugOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_BUG_OVERLAY_STATE }), setState: vi.fn() }),
      getEXRWindowOverlay: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_EXR_WINDOW_OVERLAY_STATE }), setState: vi.fn() }),
      getFPSIndicator: vi.fn().mockReturnValue({ getState: vi.fn().mockReturnValue({ ...DEFAULT_FPS_INDICATOR_STATE }), setState: vi.fn() }),
    },
  } as any;
}

function makeImageRef(name: string, path: string) {
  return { name, path, type: 'image' as const, width: 1920, height: 1080, duration: 0, fps: 0 };
}

// =================================================================
// Issue #410: currentSourceIndex remapped through mediaIndexMap
// =================================================================

describe('Issue #410: currentSourceIndex remapped during partial restore', () => {
  it('ISS-410-001: currentSourceIndex is remapped when first source is skipped', async () => {
    const components = createMockComponents();

    // Simulate: source 0 fails, source 1 succeeds → mediaIndexMap = {1→0}
    // loadVideo for first call rejects (source 0 skipped), second call resolves (source 1 loaded as live index 0)
    let callCount = 0;
    (components.session as any).loadImage
      .mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('fail'));
        return Promise.resolve();
      });

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    // Saved state had source index 1 active (the second image)
    state.playback.currentSourceIndex = 1;

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(1);
    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    // Source 1 in saved state maps to live index 0 (only one source loaded)
    expect(arg.currentSourceIndex).toBe(0);
  });

  it('ISS-410-002: currentSourceIndex falls back to 0 when the saved active source was skipped', async () => {
    const components = createMockComponents();

    // source 0 fails, source 1 succeeds → saved currentSourceIndex was 0 (skipped)
    let callCount = 0;
    (components.session as any).loadImage
      .mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('fail'));
        return Promise.resolve();
      });

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    // Saved state had source index 0 active — but that source failed to load
    state.playback.currentSourceIndex = 0;

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(1);
    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    // Source 0 was skipped, nearest valid is 0 (the only live source)
    expect(arg.currentSourceIndex).toBe(0);
  });

  it('ISS-410-003: sourceAIndex and sourceBIndex are also remapped', async () => {
    const components = createMockComponents();

    // 3 sources: 0 fails, 1 succeeds (→0), 2 succeeds (→1)
    let callCount = 0;
    (components.session as any).loadImage
      .mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('fail'));
        return Promise.resolve();
      });

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    // Saved: active=2, A=1, B=2
    state.playback.currentSourceIndex = 2;
    state.playback.sourceAIndex = 1;
    state.playback.sourceBIndex = 2;

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(2);
    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    // saved 1→live 0, saved 2→live 1
    expect(arg.currentSourceIndex).toBe(1);
    expect(arg.sourceAIndex).toBe(0);
    expect(arg.sourceBIndex).toBe(1);
  });

  it('ISS-410-004: indices unchanged when all sources load successfully', async () => {
    const components = createMockComponents();

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    state.playback.currentSourceIndex = 2;
    state.playback.sourceAIndex = 0;
    state.playback.sourceBIndex = 1;

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(3);
    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    // All loaded, mapping is identity: 0→0, 1→1, 2→2
    expect(arg.currentSourceIndex).toBe(2);
    expect(arg.sourceAIndex).toBe(0);
    expect(arg.sourceBIndex).toBe(1);
  });

  it('ISS-410-005: middle source skipped remaps correctly', async () => {
    const components = createMockComponents();

    // 3 sources: 0 succeeds (→0), 1 fails, 2 succeeds (→1)
    let callCount = 0;
    (components.session as any).loadImage
      .mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('fail'));
        return Promise.resolve();
      });

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    // Saved active source was index 1 (the one that will be skipped)
    state.playback.currentSourceIndex = 1;

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(2);
    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    // Source 1 was skipped. Valid live indices are 0 (from saved 0) and 1 (from saved 2).
    // Closest live index to saved index 1 is live index 1 (distance 0 vs distance 1).
    expect(arg.currentSourceIndex).toBe(1);
  });

  it('ISS-410-006: sourceBIndex of -1 is preserved (not remapped)', async () => {
    const components = createMockComponents();

    // Source 0 fails, source 1 succeeds
    let callCount = 0;
    (components.session as any).loadImage
      .mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('fail'));
        return Promise.resolve();
      });

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    state.playback.currentSourceIndex = 1;
    state.playback.sourceAIndex = 1;
    state.playback.sourceBIndex = -1; // No B source assigned

    await SessionSerializer.fromJSON(state, components);

    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    expect(arg.sourceBIndex).toBe(-1); // Should remain -1
  });
});
