/**
 * Regression tests for issue #383:
 * The file-reload dialog must provide a distinct Cancel path that aborts the
 * entire restore flow.  Closing the dialog or pressing Escape must resolve as
 * cancel (not skip).  A dedicated Cancel button must be present.
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
import { FILE_RELOAD_CANCEL } from '../../ui/components/shared/Modal';
import { DEFAULT_TIMECODE_OVERLAY_STATE } from '../../ui/components/TimecodeOverlay';
import { DEFAULT_SAFE_AREAS_STATE } from '../../ui/components/SafeAreasOverlay';
import { DEFAULT_CLIPPING_OVERLAY_STATE } from '../../ui/components/ClippingOverlay';
import { DEFAULT_INFO_STRIP_OVERLAY_STATE } from '../../ui/components/InfoStripOverlay';
import { DEFAULT_SPOTLIGHT_STATE } from '../../ui/components/SpotlightOverlay';
import { DEFAULT_BUG_OVERLAY_STATE } from '../../ui/components/BugOverlay';
import { DEFAULT_EXR_WINDOW_OVERLAY_STATE } from '../../ui/components/EXRWindowOverlay';
import { DEFAULT_FPS_INDICATOR_STATE } from '../../ui/components/FPSIndicator';

// Mock Modal functions
vi.mock('../../ui/components/shared/Modal', async () => {
  const actual = await vi.importActual<typeof import('../../ui/components/shared/Modal')>('../../ui/components/shared/Modal');
  return {
    ...actual,
    showFileReloadPrompt: vi.fn(),
    showSequenceReloadPrompt: vi.fn(),
  };
});

import { showFileReloadPrompt, showSequenceReloadPrompt } from '../../ui/components/shared/Modal';

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
      loadSequence: vi.fn<(files: File[]) => Promise<void>>().mockResolvedValue(undefined),
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
      // Overlay accessors (fix #485)
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

describe('Issue #383: File-reload dialog must have a Cancel path that aborts restore', () => {
  it('ISS-383-001: FILE_RELOAD_CANCEL sentinel is a distinct string value', () => {
    expect(FILE_RELOAD_CANCEL).toBe('cancel');
    // Must be distinguishable from null (skip) and truthy File values
    expect(FILE_RELOAD_CANCEL).not.toBeNull();
    expect(typeof FILE_RELOAD_CANCEL).toBe('string');
  });

  it('ISS-383-002: cancelling file reload aborts the entire restore flow', async () => {
    const components = createMockComponents();
    vi.mocked(showFileReloadPrompt).mockResolvedValue(FILE_RELOAD_CANCEL);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'render.exr',
        path: '',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
        requiresReload: true,
      },
    ];

    await expect(SessionSerializer.fromJSON(state, components)).rejects.toThrow(
      'Session restore cancelled by user',
    );
    // loadFile should never have been called
    expect(components.session.loadFile).not.toHaveBeenCalled();
  });

  it('ISS-383-003: cancelling sequence reload aborts the entire restore flow', async () => {
    const components = createMockComponents();
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(FILE_RELOAD_CANCEL);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'shot.0001.exr',
        path: '',
        type: 'sequence',
        width: 2048,
        height: 1080,
        duration: 48,
        fps: 24,
        requiresReload: true,
      },
    ];

    await expect(SessionSerializer.fromJSON(state, components)).rejects.toThrow(
      'Session restore cancelled by user',
    );
    expect(components.session.loadSequence).not.toHaveBeenCalled();
  });

  it('ISS-383-004: skipping (null) still works and adds a warning', async () => {
    const components = createMockComponents();
    vi.mocked(showFileReloadPrompt).mockResolvedValue(null);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'render.exr',
        path: '',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
        requiresReload: true,
      },
    ];

    const result = await SessionSerializer.fromJSON(state, components);
    expect(result.warnings).toContain('Skipped reload: render.exr');
    expect(result.loadedMedia).toBe(0);
  });

  it('ISS-383-005: cancel on second file aborts without loading remaining files', async () => {
    const components = createMockComponents();
    const file = new File(['img'], 'first.exr');
    vi.mocked(showFileReloadPrompt)
      .mockResolvedValueOnce(file) // first file loaded OK
      .mockResolvedValueOnce(FILE_RELOAD_CANCEL); // second file cancelled

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'first.exr',
        path: '',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
        requiresReload: true,
      },
      {
        name: 'second.exr',
        path: '',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
        requiresReload: true,
      },
      {
        name: 'third.exr',
        path: '',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
        requiresReload: true,
      },
    ];

    await expect(SessionSerializer.fromJSON(state, components)).rejects.toThrow(
      'Session restore cancelled by user',
    );

    // First file was loaded, second triggered cancel, third never prompted
    expect(components.session.loadFile).toHaveBeenCalledTimes(1);
    expect(showFileReloadPrompt).toHaveBeenCalledTimes(2);
  });

  it('ISS-383-006: cancelling non-blob sequence reload aborts restore', async () => {
    const components = createMockComponents();
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(FILE_RELOAD_CANCEL);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'shot.0001.exr',
        path: '/path/to/shot.0001.exr',
        type: 'sequence',
        width: 2048,
        height: 1080,
        duration: 48,
        fps: 24,
        // No requiresReload — this is the non-blob sequence path
      },
    ];

    await expect(SessionSerializer.fromJSON(state, components)).rejects.toThrow(
      'Session restore cancelled by user',
    );
    expect(components.session.loadSequence).not.toHaveBeenCalled();
  });
});
