/**
 * Regression tests for issue #394:
 * Locally loaded image sequences do not round-trip through project save/load.
 *
 * Root cause: sequences are created with url: '' in SessionMedia.ts, but
 * serializeMedia() only marked blob URLs as requiresReload — empty-URL
 * sequences were saved without the flag and silently skipped on load.
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
    },
  } as any;
}

describe('Issue #394: Locally loaded sequences must round-trip through save/load', () => {
  it('ISS-394-001: serializeMedia marks sequences with empty URL as requiresReload', () => {
    const components = createMockComponents();
    (components.session as any).allSources = [
      {
        type: 'sequence',
        name: 'shot.0001.exr',
        url: '',
        width: 2048,
        height: 1080,
        duration: 48,
        fps: 24,
        sequenceInfo: {
          name: 'shot.0001.exr',
          pattern: 'shot.%04d.exr',
          startFrame: 1,
          endFrame: 48,
          frames: new Array(48),
          width: 2048,
          height: 1080,
          fps: 24,
        },
      },
    ];

    const state = SessionSerializer.toJSON(components, 'Test');
    expect(state.media).toHaveLength(1);
    expect(state.media[0]!.requiresReload).toBe(true);
    expect(state.media[0]!.path).toBe('');
    expect(state.media[0]!.sequencePattern).toBe('shot.%04d.exr');
    expect(state.media[0]!.frameRange).toEqual({ start: 1, end: 48 });
  });

  it('ISS-394-002: fromJSON shows sequence reload prompt for requiresReload sequences and reconstructs on file selection', async () => {
    const components = createMockComponents();
    const files = [new File(['a'], 'shot.0001.exr'), new File(['b'], 'shot.0002.exr')];
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(files);

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
        sequencePattern: 'shot.%04d.exr',
        frameRange: { start: 1, end: 48 },
      },
    ];

    const result = await SessionSerializer.fromJSON(state, components);
    expect(showSequenceReloadPrompt).toHaveBeenCalledTimes(1);
    expect(showSequenceReloadPrompt).toHaveBeenCalledWith('shot.0001.exr', expect.objectContaining({
      title: 'Reload Sequence',
    }));
    expect(components.session.loadSequence).toHaveBeenCalledWith(files);
    expect(result.loadedMedia).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('ISS-394-003: cancelling sequence reload prompt aborts restore (FILE_RELOAD_CANCEL)', async () => {
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

  it('ISS-394-004: skipping sequence reload (empty file list) produces a warning', async () => {
    const components = createMockComponents();
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue([]);

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

    const result = await SessionSerializer.fromJSON(state, components);
    expect(result.warnings).toContain('Skipped reload: shot.0001.exr');
    expect(result.loadedMedia).toBe(0);
  });

  it('ISS-394-005: skipping sequence reload (null) produces a warning', async () => {
    const components = createMockComponents();
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(null);

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

    const result = await SessionSerializer.fromJSON(state, components);
    expect(result.warnings).toContain('Skipped reload: shot.0001.exr');
    expect(result.loadedMedia).toBe(0);
  });

  it('ISS-394-006: sequence loadSequence failure produces a warning, not abort', async () => {
    const components = createMockComponents();
    const files = [new File(['a'], 'shot.0001.exr')];
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(files);
    (components.session.loadSequence as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('sequence decode failed'),
    );

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

    const result = await SessionSerializer.fromJSON(state, components);
    expect(result.warnings).toContain('Failed to reload sequence: shot.0001.exr');
    expect(result.loadedMedia).toBe(0);
  });

  it('ISS-394-007: round-trip: serialize then deserialize a sequence source', async () => {
    const components = createMockComponents();
    (components.session as any).allSources = [
      {
        type: 'sequence',
        name: 'render.0001.exr',
        url: '',
        width: 1920,
        height: 1080,
        duration: 24,
        fps: 24,
        sequenceInfo: {
          name: 'render.0001.exr',
          pattern: 'render.%04d.exr',
          startFrame: 1,
          endFrame: 24,
          frames: new Array(24),
          width: 1920,
          height: 1080,
          fps: 24,
        },
      },
    ];

    // Serialize
    const saved = SessionSerializer.toJSON(components, 'RoundTrip');
    expect(saved.media[0]!.requiresReload).toBe(true);

    // Deserialize — user provides files
    const files = [new File(['f1'], 'render.0001.exr'), new File(['f2'], 'render.0002.exr')];
    vi.mocked(showSequenceReloadPrompt).mockResolvedValue(files);

    const result = await SessionSerializer.fromJSON(saved, components);
    expect(showSequenceReloadPrompt).toHaveBeenCalledTimes(1);
    expect(components.session.loadSequence).toHaveBeenCalledWith(files);
    expect(result.loadedMedia).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('ISS-394-008: blob URL images still get requiresReload (no regression)', () => {
    const components = createMockComponents();
    (components.session as any).allSources = [
      {
        type: 'image',
        name: 'photo.jpg',
        url: 'blob:http://localhost:3000/abc-123',
        width: 800,
        height: 600,
        duration: 1,
        fps: 24,
      },
    ];

    const state = SessionSerializer.toJSON(components, 'Test');
    expect(state.media[0]!.requiresReload).toBe(true);
    expect(state.media[0]!.path).toBe('');
  });
});
