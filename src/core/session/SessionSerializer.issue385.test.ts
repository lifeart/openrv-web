/**
 * Regression tests for issue #385:
 * Session-restore file picker must use SUPPORTED_MEDIA_ACCEPT for all media
 * types (image, video), not hardcode 'image/*' or 'video/*' which excludes
 * pro formats (EXR, DPX, Cineon, MKV, etc.) that browsers don't map to
 * standard MIME wildcards.
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
import { SUPPORTED_MEDIA_ACCEPT } from '../../utils/media/SupportedMediaFormats';

// Mock Modal functions
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  showSequenceReloadPrompt: vi.fn(),
}));

import { showFileReloadPrompt } from '../../ui/components/shared/Modal';

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
    },
  } as any;
}

describe('Issue #385: Restore file picker must use SUPPORTED_MEDIA_ACCEPT for all types', () => {
  it('ISS-385-001: image reload uses SUPPORTED_MEDIA_ACCEPT (not hardcoded image/*)', async () => {
    const components = createMockComponents();
    const file = new File(['img'], 'render.exr');
    vi.mocked(showFileReloadPrompt).mockResolvedValue(file);

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

    await SessionSerializer.fromJSON(state, components);

    const callArgs = vi.mocked(showFileReloadPrompt).mock.calls[0]!;
    expect(callArgs[1]!.accept).toBe(SUPPORTED_MEDIA_ACCEPT);
    // Must include pro format extensions
    expect(callArgs[1]!.accept).toContain('.exr');
    expect(callArgs[1]!.accept).toContain('.dpx');
    expect(callArgs[1]!.accept).toContain('.cin');
    expect(callArgs[1]!.accept).toContain('.tiff');
  });

  it('ISS-385-002: video reload uses SUPPORTED_MEDIA_ACCEPT (not hardcoded video/*)', async () => {
    const components = createMockComponents();
    const file = new File(['vid'], 'footage.mkv');
    vi.mocked(showFileReloadPrompt).mockResolvedValue(file);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'footage.mkv',
        path: '',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 200,
        fps: 24,
        requiresReload: true,
      },
    ];

    await SessionSerializer.fromJSON(state, components);

    const callArgs = vi.mocked(showFileReloadPrompt).mock.calls[0]!;
    expect(callArgs[1]!.accept).toBe(SUPPORTED_MEDIA_ACCEPT);
    // Must include video container extensions that browsers may not map to video/*
    expect(callArgs[1]!.accept).toContain('.mkv');
    expect(callArgs[1]!.accept).toContain('.ogv');
  });

  it('ISS-385-003: accept string is identical for image and video reload prompts', async () => {
    // Restore a project with both an image and a video requiring reload
    const components = createMockComponents();
    const imgFile = new File(['img'], 'shot.dpx');
    const vidFile = new File(['vid'], 'clip.webm');
    vi.mocked(showFileReloadPrompt)
      .mockResolvedValueOnce(imgFile)
      .mockResolvedValueOnce(vidFile);

    const state = SessionSerializer.createEmpty();
    state.media = [
      {
        name: 'shot.dpx',
        path: '',
        type: 'image',
        width: 2048,
        height: 1080,
        duration: 1,
        fps: 24,
        requiresReload: true,
      },
      {
        name: 'clip.webm',
        path: '',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 30,
        requiresReload: true,
      },
    ];

    await SessionSerializer.fromJSON(state, components);

    expect(showFileReloadPrompt).toHaveBeenCalledTimes(2);
    const imageAccept = vi.mocked(showFileReloadPrompt).mock.calls[0]![1]!.accept;
    const videoAccept = vi.mocked(showFileReloadPrompt).mock.calls[1]![1]!.accept;
    // Both should use the same comprehensive accept string
    expect(imageAccept).toBe(SUPPORTED_MEDIA_ACCEPT);
    expect(videoAccept).toBe(SUPPORTED_MEDIA_ACCEPT);
    expect(imageAccept).toBe(videoAccept);
  });

  it('ISS-385-004: SUPPORTED_MEDIA_ACCEPT includes both MIME wildcards and extension list', () => {
    // Sanity check that the constant itself covers all needed bases
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('image/*');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('video/*');
    // Pro image formats
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.exr');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.dpx');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.cin');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.hdr');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.tiff');
    // RAW formats
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.cr2');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.nef');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.dng');
    // Video containers browsers may not recognize
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.mkv');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.ogv');
    expect(SUPPORTED_MEDIA_ACCEPT).toContain('.avi');
  });
});
