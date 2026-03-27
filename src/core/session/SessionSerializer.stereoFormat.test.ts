/**
 * Regression tests for LOW-09:
 * Stereo input format must be serialized and restored correctly
 * when saving/loading .orvproject files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionSerializer, type SessionComponents } from './SessionSerializer';
import type { SessionState, MediaReference } from './SessionState';
import { PaintEngine } from '../../paint/PaintEngine';
import { DEFAULT_TONE_MAPPING_STATE, DEFAULT_GAMUT_MAPPING_STATE } from '../../core/types/effects';
import { DEFAULT_STEREO_STATE } from '../../core/types/stereo';
import { DEFAULT_GHOST_FRAME_STATE } from '../../ui/components/GhostFrameControl';
import { DEFAULT_DISPLAY_COLOR_STATE } from '../../color/DisplayTransfer';
import { DEFAULT_DIFFERENCE_MATTE_STATE } from '../../ui/components/DifferenceMatteControl';
import { DEFAULT_BLEND_MODE_STATE } from '../../ui/components/ComparisonManager';
import { createDefaultCurvesData } from '../../color/ColorCurves';
import { DEFAULT_STEREO_EYE_TRANSFORM_STATE, DEFAULT_STEREO_ALIGN_MODE } from '../../stereo/StereoRenderer';
import { LUTPipeline } from '../../color/pipeline/LUTPipeline';
import { DEFAULT_TIMECODE_OVERLAY_STATE } from '../../ui/components/TimecodeOverlay';
import { DEFAULT_SAFE_AREAS_STATE } from '../../ui/components/SafeAreasOverlay';
import { DEFAULT_CLIPPING_OVERLAY_STATE } from '../../ui/components/ClippingOverlay';
import { DEFAULT_INFO_STRIP_OVERLAY_STATE } from '../../ui/components/InfoStripOverlay';
import { DEFAULT_SPOTLIGHT_STATE } from '../../ui/components/SpotlightOverlay';
import { DEFAULT_BUG_OVERLAY_STATE } from '../../ui/components/BugOverlay';
import { DEFAULT_EXR_WINDOW_OVERLAY_STATE } from '../../ui/components/EXRWindowOverlay';
import { DEFAULT_FPS_INDICATOR_STATE } from '../../ui/components/FPSIndicator';

// Mock Modal functions
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  showSequenceReloadPrompt: vi.fn(),
  FILE_RELOAD_CANCEL: 'cancel',
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockComponents(opts?: {
  sources?: any[];
  getSourceByIndex?: (index: number) => any;
}): SessionComponents {
  const paintEngine = new PaintEngine();
  vi.spyOn(paintEngine, 'loadFromAnnotations');
  const lutPipeline = new LUTPipeline();
  lutPipeline.registerSource('default');
  lutPipeline.setActiveSource('default');

  const sources = opts?.sources ?? [];

  return {
    session: {
      allSources: sources,
      getSourceByIndex: opts?.getSourceByIndex ?? vi.fn().mockReturnValue(null),
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
      loadSourceFromUrl: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
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
      edlEntries: [] as any[],
      addSource: vi.fn(),
      addRepresentationToSource: vi.fn().mockReturnValue({ id: 'mock-rep' }),
      switchRepresentation: vi.fn<(sourceIndex: number, repId: string) => Promise<boolean>>().mockResolvedValue(true),
    },
    paintEngine,
    viewer: {
      getPan: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      getZoom: vi.fn().mockReturnValue(1.0),
      getColorAdjustments: vi.fn().mockReturnValue({}),
      getColorWheels: vi.fn(() => ({
        getState: vi.fn(() => ({
          lift: { r: 0, g: 0, b: 0, y: 0 },
          gamma: { r: 0, g: 0, b: 0, y: 0 },
          gain: { r: 0, g: 0, b: 0, y: 0 },
          master: { r: 0, g: 0, b: 0, y: 0 },
          linked: false,
        })),
        setState: vi.fn(),
        on: vi.fn(),
      })),
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
      syncLUTPipeline: vi.fn(),
      resetToneMappingState: vi.fn(),
      resetGhostFrameState: vi.fn(),
      resetStereoState: vi.fn(),
      resetStereoEyeTransforms: vi.fn(),
      resetStereoAlignMode: vi.fn(),
      resetChannelMode: vi.fn(),
      resetDifferenceMatteState: vi.fn(),
      getLUTPipeline: vi.fn().mockReturnValue(lutPipeline),
      getTimecodeOverlay: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_TIMECODE_OVERLAY_STATE }),
        setState: vi.fn(),
      }),
      getSafeAreasOverlay: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_SAFE_AREAS_STATE }),
        setState: vi.fn(),
      }),
      getClippingOverlay: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_CLIPPING_OVERLAY_STATE }),
        setState: vi.fn(),
      }),
      getInfoStripOverlay: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_INFO_STRIP_OVERLAY_STATE }),
        setState: vi.fn(),
      }),
      getSpotlightOverlay: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_SPOTLIGHT_STATE }),
        setState: vi.fn(),
      }),
      getBugOverlay: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_BUG_OVERLAY_STATE }),
        setState: vi.fn(),
      }),
      getEXRWindowOverlay: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_EXR_WINDOW_OVERLAY_STATE }),
        setState: vi.fn(),
      }),
      getFPSIndicator: vi.fn().mockReturnValue({
        getState: vi.fn().mockReturnValue({ ...DEFAULT_FPS_INDICATOR_STATE }),
        setState: vi.fn(),
      }),
    },
  } as any;
}

function createStateWithMedia(media: MediaReference[]): SessionState {
  const state = SessionSerializer.createEmpty('TestProject');
  state.media = media;
  return state;
}

describe('LOW-09: Stereo input format serialization', () => {
  describe('toJSON serialization', () => {
    it('LOW09-001: includes stereoInputFormat from source.stereoInputFormat', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'https://cdn.example.com/stereo.exr',
          name: 'stereo.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          fileSourceNode: { dispose: vi.fn(), stereoInputFormat: null },
          stereoInputFormat: 'separate',
        },
      ];

      const state = SessionSerializer.toJSON(components, 'TestProject');

      expect(state.media).toHaveLength(1);
      expect(state.media[0]!.stereoInputFormat).toBe('separate');
    });

    it('LOW09-002: includes stereoInputFormat from fileSourceNode when source lacks it', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'https://cdn.example.com/stereo.exr',
          name: 'stereo.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          fileSourceNode: { dispose: vi.fn(), stereoInputFormat: 'over-under' },
        },
      ];

      const state = SessionSerializer.toJSON(components, 'TestProject');

      expect(state.media).toHaveLength(1);
      expect(state.media[0]!.stereoInputFormat).toBe('over-under');
    });

    it('LOW09-003: omits stereoInputFormat when neither source nor fileSourceNode has it', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'https://cdn.example.com/photo.jpg',
          name: 'photo.jpg',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
        },
      ];

      const state = SessionSerializer.toJSON(components, 'TestProject');

      expect(state.media).toHaveLength(1);
      expect(state.media[0]!.stereoInputFormat).toBeUndefined();
    });

    it('LOW09-004: serializes side-by-side stereo input format', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'https://cdn.example.com/sbs.jpg',
          name: 'sbs.jpg',
          type: 'image',
          width: 3840,
          height: 1080,
          duration: 1,
          fps: 24,
          stereoInputFormat: 'side-by-side',
        },
      ];

      const state = SessionSerializer.toJSON(components, 'TestProject');

      expect(state.media[0]!.stereoInputFormat).toBe('side-by-side');
    });
  });

  describe('fromJSON deserialization', () => {
    it('LOW09-005: restores stereoInputFormat on source after loading', async () => {
      const mockSource: any = {
        stereoInputFormat: undefined,
        fileSourceNode: { stereoInputFormat: null },
      };
      const components = createMockComponents({
        getSourceByIndex: vi.fn().mockReturnValue(mockSource),
      });

      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/stereo.exr',
          name: 'stereo.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          decoderBacked: true,
          stereoInputFormat: 'separate',
        },
      ]);

      await SessionSerializer.fromJSON(state, components);

      expect(mockSource.stereoInputFormat).toBe('separate');
      expect(mockSource.fileSourceNode.stereoInputFormat).toBe('separate');
    });

    it('LOW09-006: restores over-under stereoInputFormat correctly', async () => {
      const mockSource: any = {
        stereoInputFormat: undefined,
      };
      const components = createMockComponents({
        getSourceByIndex: vi.fn().mockReturnValue(mockSource),
      });

      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/ou.exr',
          name: 'ou.exr',
          type: 'image',
          width: 1920,
          height: 2160,
          duration: 1,
          fps: 24,
          stereoInputFormat: 'over-under',
        },
      ]);

      await SessionSerializer.fromJSON(state, components);

      expect(mockSource.stereoInputFormat).toBe('over-under');
    });

    it('LOW09-007: ignores invalid stereoInputFormat values during deserialization', async () => {
      const mockSource: any = {
        stereoInputFormat: undefined,
      };
      const components = createMockComponents({
        getSourceByIndex: vi.fn().mockReturnValue(mockSource),
      });

      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/photo.jpg',
          name: 'photo.jpg',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          stereoInputFormat: 'invalid-format' as any,
        },
      ]);

      await SessionSerializer.fromJSON(state, components);

      // Invalid format should not be applied
      expect(mockSource.stereoInputFormat).toBeUndefined();
    });

    it('LOW09-008: handles missing stereoInputFormat gracefully (defaults)', async () => {
      const mockSource: any = {
        stereoInputFormat: undefined,
      };
      const components = createMockComponents({
        getSourceByIndex: vi.fn().mockReturnValue(mockSource),
      });

      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/photo.jpg',
          name: 'photo.jpg',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          // no stereoInputFormat
        },
      ]);

      await SessionSerializer.fromJSON(state, components);

      // Should remain undefined (no stereo format detected)
      expect(mockSource.stereoInputFormat).toBeUndefined();
    });

    it('LOW09-009: does not set stereoInputFormat on source when source index not found', async () => {
      const components = createMockComponents({
        getSourceByIndex: vi.fn().mockReturnValue(null),
      });

      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/stereo.exr',
          name: 'stereo.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          stereoInputFormat: 'separate',
        },
      ]);

      // Should not throw
      await expect(SessionSerializer.fromJSON(state, components)).resolves.toBeDefined();
    });
  });

  describe('round-trip serialization', () => {
    it('LOW09-010: stereoInputFormat round-trips correctly (serialize -> deserialize)', async () => {
      // Step 1: Serialize a source with stereoInputFormat
      const serializeComponents = createMockComponents();
      (serializeComponents.session as any).allSources = [
        {
          url: 'https://cdn.example.com/stereo.exr',
          name: 'stereo.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          fileSourceNode: { dispose: vi.fn(), stereoInputFormat: 'separate' },
          stereoInputFormat: 'separate',
        },
      ];

      const state = SessionSerializer.toJSON(serializeComponents, 'TestProject');

      // Verify serialization included the format
      expect(state.media[0]!.stereoInputFormat).toBe('separate');

      // Step 2: Deserialize and verify the format is restored
      const mockSource: any = {
        stereoInputFormat: undefined,
        fileSourceNode: { stereoInputFormat: null },
      };
      const restoreComponents = createMockComponents({
        getSourceByIndex: vi.fn().mockReturnValue(mockSource),
      });

      await SessionSerializer.fromJSON(state, restoreComponents);

      expect(mockSource.stereoInputFormat).toBe('separate');
      expect(mockSource.fileSourceNode.stereoInputFormat).toBe('separate');
    });

    it('LOW09-011: all valid StereoInputFormat values round-trip correctly', async () => {
      const formats = ['side-by-side', 'over-under', 'separate'] as const;

      for (const format of formats) {
        const serializeComponents = createMockComponents();
        (serializeComponents.session as any).allSources = [
          {
            url: 'https://cdn.example.com/test.exr',
            name: 'test.exr',
            type: 'image',
            width: 1920,
            height: 1080,
            duration: 1,
            fps: 24,
            stereoInputFormat: format,
          },
        ];

        const state = SessionSerializer.toJSON(serializeComponents, 'TestProject');
        expect(state.media[0]!.stereoInputFormat).toBe(format);

        const mockSource: any = { stereoInputFormat: undefined };
        const restoreComponents = createMockComponents({
          getSourceByIndex: vi.fn().mockReturnValue(mockSource),
        });

        await SessionSerializer.fromJSON(state, restoreComponents);
        expect(mockSource.stereoInputFormat).toBe(format);
      }
    });
  });
});
