/**
 * Regression tests for issue #384:
 * Reloading a saved local image sequence should not collapse it into a single image.
 *
 * Verifies:
 * - Sequence-type media with requiresReload triggers multi-file (sequence) reload prompt
 * - Sequence-type media calls loadSequence instead of loadFile
 * - Non-video accept filter uses SUPPORTED_MEDIA_ACCEPT instead of hardcoded 'image/*'
 * - Non-blob sequence media also uses the sequence reload path
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
import { SUPPORTED_MEDIA_ACCEPT } from '../../utils/media/SupportedMediaFormats';

// Mock both Modal functions
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  showSequenceReloadPrompt: vi.fn(),
  FILE_RELOAD_CANCEL: 'cancel',
}));

import { showFileReloadPrompt, showSequenceReloadPrompt } from '../../ui/components/shared/Modal';

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper — mirrors createMockComponents from other serializer tests
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
      addSource: vi.fn(),
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

describe('Issue #384: Sequence reload should not collapse to single image', () => {
  it('ISS-384-001: sequence with requiresReload uses showSequenceReloadPrompt (multi-file)', async () => {
    const components = createMockComponents();
    const seqFiles = [
      new File(['a'], 'frame.0001.exr'),
      new File(['b'], 'frame.0002.exr'),
      new File(['c'], 'frame.0003.exr'),
    ];
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(seqFiles);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'frame.####.exr',
        path: '',
        type: 'sequence',
        width: 1920,
        height: 1080,
        duration: 3,
        fps: 24,
        requiresReload: true,
        sequencePattern: 'frame.####.exr',
        frameRange: { start: 1, end: 3 },
      },
    ];

    const result = await SessionSerializer.fromJSON(state, components);

    // Should use the sequence prompt, NOT the single file prompt
    expect(showSequenceReloadPrompt).toHaveBeenCalledTimes(1);
    expect(showFileReloadPrompt).not.toHaveBeenCalled();

    // Should call loadSequence, NOT loadFile
    expect((components.session as any).loadSequence).toHaveBeenCalledWith(seqFiles);
    expect((components.session as any).loadFile).not.toHaveBeenCalled();

    expect(result.loadedMedia).toBe(1);
  });

  it('ISS-384-002: sequence with requiresReload passes SUPPORTED_MEDIA_ACCEPT to prompt', async () => {
    const components = createMockComponents();
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(null); // user skips

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'shot.####.dpx',
        path: '',
        type: 'sequence',
        width: 2048,
        height: 1080,
        duration: 48,
        fps: 24,
        requiresReload: true,
      },
    ];

    await SessionSerializer.fromJSON(state, components);

    expect(showSequenceReloadPrompt).toHaveBeenCalledWith('shot.####.dpx', {
      title: 'Reload Sequence',
      accept: SUPPORTED_MEDIA_ACCEPT,
    });
  });

  it('ISS-384-003: sequence reload skipped produces warning (not crash)', async () => {
    const components = createMockComponents();
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(null);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'seq.####.exr',
        path: '',
        type: 'sequence',
        width: 1920,
        height: 1080,
        duration: 10,
        fps: 24,
        requiresReload: true,
      },
    ];

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(1);
    expect(result.warnings).toContain('Sequence needs file reload: seq.####.exr');
  });

  it('ISS-384-004: sequence reload failure produces warning', async () => {
    const components = createMockComponents();
    const seqFiles = [new File(['a'], 'frame.0001.exr')];
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(seqFiles);
    (components.session as any).loadSequence.mockRejectedValue(new Error('decode failed'));

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'seq.####.exr',
        path: '',
        type: 'sequence',
        width: 1920,
        height: 1080,
        duration: 10,
        fps: 24,
        requiresReload: true,
      },
    ];

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(1);
    expect(result.warnings).toContain('Failed to reload sequence: seq.####.exr — added as placeholder');
  });

  it('ISS-384-005: non-blob sequence type also uses sequence reload prompt', async () => {
    const components = createMockComponents();
    const seqFiles = [
      new File(['a'], 'img.0001.png'),
      new File(['b'], 'img.0002.png'),
    ];
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(seqFiles);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'img.####.png',
        path: 'file:///some/path',  // non-blob, non-empty path but type=sequence
        type: 'sequence',
        width: 800,
        height: 600,
        duration: 2,
        fps: 30,
        sequencePattern: 'img.####.png',
        frameRange: { start: 1, end: 2 },
      },
    ];

    const result = await SessionSerializer.fromJSON(state, components);

    expect(showSequenceReloadPrompt).toHaveBeenCalledTimes(1);
    expect((components.session as any).loadSequence).toHaveBeenCalledWith(seqFiles);
    expect(result.loadedMedia).toBe(1);
  });

  it('ISS-384-006: image with requiresReload still uses single-file prompt with SUPPORTED_MEDIA_ACCEPT', async () => {
    const components = createMockComponents();
    const file = new File(['img'], 'photo.exr');
    vi.mocked(showFileReloadPrompt).mockResolvedValue(file);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'photo.exr',
        path: '',
        type: 'image',
        width: 1920,
        height: 1080,
        duration: 1,
        fps: 24,
        requiresReload: true,
      },
    ];

    await SessionSerializer.fromJSON(state, components);

    // Image type should use single-file prompt
    expect(showFileReloadPrompt).toHaveBeenCalledTimes(1);
    expect(showSequenceReloadPrompt).not.toHaveBeenCalled();

    // Accept should be SUPPORTED_MEDIA_ACCEPT, not hardcoded 'image/*'
    const callArgs = vi.mocked(showFileReloadPrompt).mock.calls[0]!;
    expect(callArgs[1]!.accept).toBe(SUPPORTED_MEDIA_ACCEPT);

    // Should use loadFile for single images
    expect((components.session as any).loadFile).toHaveBeenCalledWith(file);
  });

  it('ISS-384-007: video with requiresReload uses SUPPORTED_MEDIA_ACCEPT (not hardcoded video/*)', async () => {
    const components = createMockComponents();
    const file = new File(['vid'], 'clip.mp4');
    vi.mocked(showFileReloadPrompt).mockResolvedValue(file);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'clip.mp4',
        path: '',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        requiresReload: true,
      },
    ];

    await SessionSerializer.fromJSON(state, components);

    const callArgs = vi.mocked(showFileReloadPrompt).mock.calls[0]!;
    expect(callArgs[1]!.accept).toBe(SUPPORTED_MEDIA_ACCEPT);
  });
});
