/**
 * Regression tests for issues #123–#133: Persistence/serialization fixes
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

// Mock the showFileReloadPrompt dialog
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  FILE_RELOAD_CANCEL: 'cancel',
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// =================================================================
// Helper — mirrors createMockComponents from SessionSerializer.test.ts
// =================================================================

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
      // Reset methods for omitted viewer states (fix #136)
      resetToneMappingState: vi.fn(),
      resetGhostFrameState: vi.fn(),
      resetStereoState: vi.fn(),
      resetStereoEyeTransforms: vi.fn(),
      resetStereoAlignMode: vi.fn(),
      resetChannelMode: vi.fn(),
      resetDifferenceMatteState: vi.fn(),
      // LUT pipeline (fix #146)
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

// =================================================================
// Issue #123: Empty notes/versionGroups/statuses must clear old data
// =================================================================

describe('Issue #123: empty arrays clear old session data', () => {
  it('ISS-123-001: empty notes array calls fromSerializable to clear old notes', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty();
    state.notes = [];

    await SessionSerializer.fromJSON(state, components);

    expect((components.session as any).noteManager.fromSerializable).toHaveBeenCalledWith([]);
  });

  it('ISS-123-002: empty versionGroups array calls fromSerializable to clear old groups', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty();
    state.versionGroups = [];

    await SessionSerializer.fromJSON(state, components);

    expect((components.session as any).versionManager.fromSerializable).toHaveBeenCalledWith([]);
  });

  it('ISS-123-003: empty statuses array calls fromSerializable to clear old statuses', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty();
    state.statuses = [];

    await SessionSerializer.fromJSON(state, components);

    expect((components.session as any).statusManager.fromSerializable).toHaveBeenCalledWith([]);
  });
});

// =================================================================
// Issue #124: Playback state restored even with zero loaded media
// =================================================================

describe('Issue #124: playback state restored even with zero media', () => {
  it('ISS-124-001: setPlaybackState called when no media loads', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty();
    state.media = []; // No media at all
    state.playback.loopMode = 'pingpong';
    state.playback.volume = 0.5;

    await SessionSerializer.fromJSON(state, components);

    expect((components.session as any).setPlaybackState).toHaveBeenCalled();
    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    expect(arg.loopMode).toBe('pingpong');
    expect(arg.volume).toBe(0.5);
  });

  it('ISS-124-002: setPlaybackState called when all media fails to load', async () => {
    const components = createMockComponents();
    (components.session as any).loadVideo.mockRejectedValue(new Error('fail'));

    const state = SessionSerializer.createEmpty();
    state.media = [
      { name: 'v', path: 'v.mp4', type: 'video', width: 1920, height: 1080, duration: 10, fps: 24 },
    ];
    state.playback.playbackMode = 'playAllFrames';

    const result = await SessionSerializer.fromJSON(state, components);

    expect(result.loadedMedia).toBe(0);
    expect((components.session as any).setPlaybackState).toHaveBeenCalled();
    const arg = (components.session as any).setPlaybackState.mock.calls[0][0];
    expect(arg.playbackMode).toBe('playAllFrames');
  });
});

// =================================================================
// Issue #126: .orvproject save/load persists node graph
// =================================================================

describe('Issue #126: node graph persisted in .orvproject', () => {
  it('ISS-126-001: toJSON includes graph when the session exposes serialized graph state', () => {
    const components = createMockComponents();
    const serializedGraph = {
      version: 1,
      nodes: [{ id: 'TestSource_1', type: 'TestSource', name: 's1', properties: {}, inputIds: [] }],
      outputNodeId: 'TestSource_1',
      viewNodeId: 'TestSource_1',
    };
    (components.session as any).toSerializedGraph.mockReturnValue(serializedGraph);

    const state = SessionSerializer.toJSON(components, 'Test');

    expect(state.graph).toEqual(serializedGraph);
  });

  it('ISS-126-002: fromJSON restores graph and appends non-fatal graph warnings', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty();
    state.graph = {
      version: 1,
      nodes: [{ id: 'TestSource_1', type: 'TestSource', name: 's1', properties: {}, inputIds: [] }],
      outputNodeId: 'TestSource_1',
      viewNodeId: 'TestSource_1',
    };
    (components.session as any).loadSerializedGraph.mockReturnValue(['Unknown node type "LegacyNode"']);

    const result = await SessionSerializer.fromJSON(state, components);

    expect((components.session as any).loadSerializedGraph).toHaveBeenCalledWith(state.graph);
    expect(result.warnings).toContain('Unknown node type "LegacyNode"');
  });
});

// =================================================================
// Issue #130: Effects-tab gaps reported in getSerializationGaps
// =================================================================

describe('Issue #130: effects-tab gaps in getSerializationGaps', () => {
  it('ISS-130-001: reports deinterlace, film emulation, perspective, stabilization, uncrop gaps', () => {
    const components = createMockComponents();
    const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);

    const names = gaps.map((g) => g.name);
    expect(names).toContain('Deinterlace');
    expect(names).toContain('Film emulation');
    expect(names).toContain('Perspective correction');
    expect(names).toContain('Stabilization');
    expect(names).toContain('Uncrop');
  });

  it('ISS-130-002: effects gaps report inactive when at defaults', () => {
    const components = createMockComponents();
    const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);

    const effectGaps = gaps.filter((g) =>
      ['Deinterlace', 'Film emulation', 'Perspective correction', 'Stabilization', 'Uncrop'].includes(g.name),
    );
    for (const gap of effectGaps) {
      expect(gap.isActive).toBe(false);
    }
  });

  it('ISS-130-003: deinterlace gap is active when enabled', () => {
    const components = createMockComponents();
    (components.viewer as any).getDeinterlaceParams.mockReturnValue({ method: 'bob', fieldOrder: 'tff', enabled: true });

    const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
    const gap = gaps.find((g) => g.name === 'Deinterlace')!;
    expect(gap.isActive).toBe(true);
  });

  it('ISS-130-004: film emulation gap is active when enabled', () => {
    const components = createMockComponents();
    (components.viewer as any).getFilmEmulationParams.mockReturnValue({ enabled: true, stock: 'kodak-portra-400', intensity: 1.0 });

    const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
    const gap = gaps.find((g) => g.name === 'Film emulation')!;
    expect(gap.isActive).toBe(true);
  });

  it('ISS-130-005: stabilization gap is active when enabled', () => {
    const components = createMockComponents();
    (components.viewer as any).getStabilizationParams.mockReturnValue({ enabled: true, smoothingStrength: 50 });

    const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
    const gap = gaps.find((g) => g.name === 'Stabilization')!;
    expect(gap.isActive).toBe(true);
  });

  it('ISS-130-006: uncrop gap is active when uncrop is active', () => {
    const components = createMockComponents();
    (components.viewer as any).isUncropActive.mockReturnValue(true);

    const gaps = SessionSerializer.getSerializationGaps(components.viewer as any);
    const gap = gaps.find((g) => g.name === 'Uncrop')!;
    expect(gap.isActive).toBe(true);
  });
});

// =================================================================
// Issue #132: A/B compare assignment persisted
// =================================================================

describe('Issue #132: A/B compare assignment persisted', () => {
  it('ISS-132-001: toJSON persists A/B compare assignment in playback state', () => {
    const components = createMockComponents();
    (components.session as any).getPlaybackState.mockReturnValue({
      currentFrame: 1,
      fps: 24,
      loopMode: 'loop',
      playbackMode: 'realtime',
      volume: 1,
      muted: false,
      preservesPitch: true,
      audioScrubEnabled: true,
      marks: [],
      currentSourceIndex: 4,
      sourceAIndex: 2,
      sourceBIndex: 5,
      currentAB: 'B',
    });

    const state = SessionSerializer.toJSON(components, 'Test');
    expect(state.playback.sourceAIndex).toBe(2);
    expect(state.playback.sourceBIndex).toBe(5);
    expect(state.playback.currentAB).toBe('B');
  });

  it('ISS-132-002: fromJSON forwards persisted A/B compare assignment to session playback restore', async () => {
    const components = createMockComponents();
    const state = SessionSerializer.createEmpty();
    state.playback.sourceAIndex = 1;
    state.playback.sourceBIndex = 3;
    state.playback.currentAB = 'B';

    await SessionSerializer.fromJSON(state, components);

    expect((components.session as any).setPlaybackState).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceAIndex: 1,
        sourceBIndex: 3,
        currentAB: 'B',
      }),
    );
  });
});
