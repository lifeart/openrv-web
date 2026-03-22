/**
 * Regression tests for issue #524:
 * Decoder-backed images (EXR, DPX, float TIFF, RAW, etc.) must round-trip
 * through the FileSourceNode pipeline when restoring from .orvproject files,
 * rather than falling back to the weaker HTMLImageElement path.
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

function createMockComponents(): SessionComponents {
  const paintEngine = new PaintEngine();
  vi.spyOn(paintEngine, 'loadFromAnnotations');
  const lutPipeline = new LUTPipeline();
  lutPipeline.registerSource('default');
  lutPipeline.setActiveSource('default');

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

describe('Issue #524: Decoder-backed images must round-trip through FileSourceNode pipeline', () => {
  describe('toJSON serialization', () => {
    it('ISS-524-001: sets decoderBacked flag when source has fileSourceNode', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'https://cdn.example.com/render.exr',
          name: 'render.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          fileSourceNode: { dispose: vi.fn() },
        },
      ];

      const state = SessionSerializer.toJSON(components, 'TestProject');

      expect(state.media).toHaveLength(1);
      expect(state.media[0]!.decoderBacked).toBe(true);
    });

    it('ISS-524-002: does not set decoderBacked flag for plain images without fileSourceNode', () => {
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
      expect(state.media[0]!.decoderBacked).toBeUndefined();
    });
  });

  describe('fromJSON restore', () => {
    it('ISS-524-003: restores decoder-backed image via loadSourceFromUrl when decoderBacked flag is set', async () => {
      const components = createMockComponents();
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/render.exr',
          name: 'render.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          decoderBacked: true,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadSourceFromUrl).toHaveBeenCalledWith('https://cdn.example.com/render.exr');
      expect((components.session as any).loadImage).not.toHaveBeenCalled();
    });

    it('ISS-524-004: restores decoder-backed image via loadSourceFromUrl by extension fallback (no flag)', async () => {
      const components = createMockComponents();
      // Simulate a project saved before the decoderBacked flag existed
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/render.exr',
          name: 'render.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          // no decoderBacked flag
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadSourceFromUrl).toHaveBeenCalledWith('https://cdn.example.com/render.exr');
      expect((components.session as any).loadImage).not.toHaveBeenCalled();
    });

    it('ISS-524-005: restores plain image via loadImage (not decoder-backed)', async () => {
      const components = createMockComponents();
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/photo.jpg',
          name: 'photo.jpg',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadImage).toHaveBeenCalledWith(
        'photo.jpg',
        'https://cdn.example.com/photo.jpg',
      );
      expect((components.session as any).loadSourceFromUrl).not.toHaveBeenCalled();
    });

    it('ISS-524-006: detects DPX extension as decoder-backed without flag', async () => {
      const components = createMockComponents();
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/frame.dpx',
          name: 'frame.dpx',
          type: 'image',
          width: 2048,
          height: 1556,
          duration: 1,
          fps: 24,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadSourceFromUrl).toHaveBeenCalledWith('https://cdn.example.com/frame.dpx');
    });

    it('ISS-524-007: detects TIFF extension as decoder-backed without flag', async () => {
      const components = createMockComponents();
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/scan.tiff',
          name: 'scan.tiff',
          type: 'image',
          width: 4096,
          height: 3072,
          duration: 1,
          fps: 24,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadSourceFromUrl).toHaveBeenCalledWith('https://cdn.example.com/scan.tiff');
    });

    it('ISS-524-008: PNG image does not use decoder-backed path', async () => {
      const components = createMockComponents();
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/image.png',
          name: 'image.png',
          type: 'image',
          width: 800,
          height: 600,
          duration: 1,
          fps: 24,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadImage).toHaveBeenCalledWith(
        'image.png',
        'https://cdn.example.com/image.png',
      );
      expect((components.session as any).loadSourceFromUrl).not.toHaveBeenCalled();
    });

    it('ISS-524-009: WebP image does not use decoder-backed path', async () => {
      const components = createMockComponents();
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/image.webp',
          name: 'image.webp',
          type: 'image',
          width: 800,
          height: 600,
          duration: 1,
          fps: 24,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadImage).toHaveBeenCalledWith(
        'image.webp',
        'https://cdn.example.com/image.webp',
      );
      expect((components.session as any).loadSourceFromUrl).not.toHaveBeenCalled();
    });

    it('ISS-524-010a: non-remote decoder-backed path falls back to loadImage', async () => {
      const components = createMockComponents();
      // Local file path (not http/https) — cannot be fetched, so falls back to loadImage
      const state = createStateWithMedia([
        {
          path: '/local/render.exr',
          name: 'render.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          decoderBacked: true,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(1);
      expect((components.session as any).loadImage).toHaveBeenCalledWith('render.exr', '/local/render.exr');
      expect((components.session as any).loadSourceFromUrl).not.toHaveBeenCalled();
    });

    it('ISS-524-010: mixed media restores each type through correct path', async () => {
      const components = createMockComponents();
      const state = createStateWithMedia([
        {
          path: 'https://cdn.example.com/photo.jpg',
          name: 'photo.jpg',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
        },
        {
          path: 'https://cdn.example.com/render.exr',
          name: 'render.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          decoderBacked: true,
        },
        {
          path: 'https://cdn.example.com/clip.mp4',
          name: 'clip.mp4',
          type: 'video',
          width: 1920,
          height: 1080,
          duration: 100,
          fps: 24,
        },
      ]);

      const result = await SessionSerializer.fromJSON(state, components);

      expect(result.loadedMedia).toBe(3);
      expect((components.session as any).loadImage).toHaveBeenCalledWith(
        'photo.jpg',
        'https://cdn.example.com/photo.jpg',
      );
      expect((components.session as any).loadSourceFromUrl).toHaveBeenCalledWith('https://cdn.example.com/render.exr');
      expect((components.session as any).loadVideo).toHaveBeenCalledWith(
        'clip.mp4',
        'https://cdn.example.com/clip.mp4',
      );
    });
  });

  describe('round-trip', () => {
    it('ISS-524-011: decoderBacked flag survives save/load cycle', () => {
      const components = createMockComponents();
      (components.session as any).allSources = [
        {
          url: 'https://cdn.example.com/render.exr',
          name: 'render.exr',
          type: 'image',
          width: 1920,
          height: 1080,
          duration: 1,
          fps: 24,
          fileSourceNode: { dispose: vi.fn() },
        },
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

      // Simulate save/load by JSON round-trip
      const restored = JSON.parse(JSON.stringify(state)) as SessionState;

      expect(restored.media[0]!.decoderBacked).toBe(true);
      expect(restored.media[1]!.decoderBacked).toBeUndefined();
    });
  });
});
