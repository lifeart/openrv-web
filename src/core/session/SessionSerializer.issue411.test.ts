/**
 * Regression tests for issue #411: Partial project/snapshot restore must remap
 * source indices in playlist clips, notes, version groups, and statuses through
 * mediaIndexMap so review context does not silently move to the wrong shot.
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
import type { PlaylistState } from './PlaylistManager';
import type { Note } from './NoteManager';
import type { VersionGroup } from './VersionManager';
import type { StatusEntry } from './StatusManager';

// Mock the showFileReloadPrompt dialog
vi.mock('../../ui/components/shared/Modal', () => ({
  showFileReloadPrompt: vi.fn(),
  FILE_RELOAD_CANCEL: 'cancel',
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createMockComponents(): SessionComponents & { playlistManager: any } {
  const paintEngine = new PaintEngine();
  vi.spyOn(paintEngine, 'loadFromAnnotations');

  const playlistManager = {
    setState: vi.fn(),
    clear: vi.fn(),
    setEnabled: vi.fn(),
    setLoopMode: vi.fn(),
    setCurrentFrame: vi.fn(),
  };

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
    playlistManager,
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

function makeImageRef(name: string, path: string) {
  return { name, path, type: 'image' as const, width: 1920, height: 1080, duration: 0, fps: 0 };
}

function makePlaylistState(clips: Array<{ sourceIndex: number; sourceName: string }>): PlaylistState {
  let globalStart = 1;
  return {
    clips: clips.map((c, i) => ({
      id: `clip-${i + 1}`,
      sourceIndex: c.sourceIndex,
      sourceName: c.sourceName,
      inPoint: 1,
      outPoint: 100,
      globalStartFrame: globalStart,
      duration: (globalStart += 100, 100),
    })),
    enabled: true,
    currentFrame: 1,
    loopMode: 'none',
  };
}

function makeNote(sourceIndex: number, text: string): Note {
  return {
    id: crypto.randomUUID(),
    sourceIndex,
    frameStart: 1,
    frameEnd: 10,
    text,
    author: 'tester',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    status: 'open',
    parentId: null,
    color: '#fbbf24',
    externalId: null,
    priority: 'medium' as const,
    category: '',
  };
}

function makeVersionGroup(shotName: string, sourceIndices: number[]): VersionGroup {
  return {
    id: crypto.randomUUID(),
    shotName,
    versions: sourceIndices.map((si, i) => ({
      versionNumber: i + 1,
      sourceIndex: si,
      label: `v${i + 1}`,
      addedAt: new Date().toISOString(),
    })),
    activeVersionIndex: sourceIndices.length - 1,
  };
}

function makeStatus(sourceIndex: number, status: 'approved' | 'needs-work' | 'pending'): StatusEntry {
  return {
    sourceIndex,
    status,
    setBy: 'tester',
    setAt: new Date().toISOString(),
  };
}

// Helper: simulate first source failing to load (source 0 skipped, 1->0, 2->1)
function setupFirstSourceFails(components: any) {
  let callCount = 0;
  components.session.loadImage.mockImplementation(() => {
    callCount++;
    if (callCount === 1) return Promise.reject(new Error('fail'));
    return Promise.resolve();
  });
}

// Helper: simulate middle source failing (source 0->0, 1 skipped, 2->1)
function setupMiddleSourceFails(components: any) {
  let callCount = 0;
  components.session.loadImage.mockImplementation(() => {
    callCount++;
    if (callCount === 2) return Promise.reject(new Error('fail'));
    return Promise.resolve();
  });
}

// =================================================================
// Issue #411: Playlist clips remapped through mediaIndexMap
// =================================================================

describe('Issue #411: Playlist clip source indices remapped during partial restore', () => {
  it('ISS-411-001: playlist clip sourceIndex is remapped when first source is skipped', async () => {
    const components = createMockComponents();
    setupFirstSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    state.playlist = makePlaylistState([
      { sourceIndex: 0, sourceName: 'img0.exr' },
      { sourceIndex: 1, sourceName: 'img1.exr' },
      { sourceIndex: 2, sourceName: 'img2.exr' },
    ]);

    await SessionSerializer.fromJSON(state, components);

    const playlistArg = components.playlistManager.setState.mock.calls[0][0] as PlaylistState;
    // Source 0 was skipped → clip referencing it should be dropped
    // Source 1 → live 0, Source 2 → live 1
    expect(playlistArg.clips).toHaveLength(2);
    expect(playlistArg.clips[0]!.sourceIndex).toBe(0); // was 1
    expect(playlistArg.clips[1]!.sourceIndex).toBe(1); // was 2
  });

  it('ISS-411-002: playlist clips referencing lost sources are dropped', async () => {
    const components = createMockComponents();
    setupMiddleSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    // Only a clip for the middle source (which will fail)
    state.playlist = makePlaylistState([
      { sourceIndex: 1, sourceName: 'img1.exr' },
    ]);

    await SessionSerializer.fromJSON(state, components);

    const playlistArg = components.playlistManager.setState.mock.calls[0][0] as PlaylistState;
    expect(playlistArg.clips).toHaveLength(0);
  });

  it('ISS-411-003: playlist unchanged when all sources load successfully', async () => {
    const components = createMockComponents();

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    state.playlist = makePlaylistState([
      { sourceIndex: 0, sourceName: 'img0.exr' },
      { sourceIndex: 1, sourceName: 'img1.exr' },
    ]);

    await SessionSerializer.fromJSON(state, components);

    const playlistArg = components.playlistManager.setState.mock.calls[0][0] as PlaylistState;
    expect(playlistArg.clips).toHaveLength(2);
    expect(playlistArg.clips[0]!.sourceIndex).toBe(0);
    expect(playlistArg.clips[1]!.sourceIndex).toBe(1);
  });
});

// =================================================================
// Issue #411: Notes remapped through mediaIndexMap
// =================================================================

describe('Issue #411: Note source indices remapped during partial restore', () => {
  it('ISS-411-004: note sourceIndex is remapped when first source is skipped', async () => {
    const components = createMockComponents();
    setupFirstSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    state.notes = [
      makeNote(1, 'Note on source 1'),
      makeNote(2, 'Note on source 2'),
    ];

    await SessionSerializer.fromJSON(state, components);

    const notesArg = (components.session as any).noteManager.fromSerializable.mock.calls[0][0] as Note[];
    expect(notesArg).toHaveLength(2);
    expect(notesArg[0]!.sourceIndex).toBe(0); // was 1
    expect(notesArg[1]!.sourceIndex).toBe(1); // was 2
  });

  it('ISS-411-005: notes referencing lost sources are dropped', async () => {
    const components = createMockComponents();
    setupFirstSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    state.notes = [
      makeNote(0, 'Note on source 0 (will be lost)'),
      makeNote(1, 'Note on source 1 (survives)'),
    ];

    await SessionSerializer.fromJSON(state, components);

    const notesArg = (components.session as any).noteManager.fromSerializable.mock.calls[0][0] as Note[];
    expect(notesArg).toHaveLength(1);
    expect(notesArg[0]!.sourceIndex).toBe(0); // was 1
    expect(notesArg[0]!.text).toBe('Note on source 1 (survives)');
  });

  it('ISS-411-006: notes unchanged when all sources load successfully', async () => {
    const components = createMockComponents();

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    state.notes = [
      makeNote(0, 'Note A'),
      makeNote(1, 'Note B'),
    ];

    await SessionSerializer.fromJSON(state, components);

    const notesArg = (components.session as any).noteManager.fromSerializable.mock.calls[0][0] as Note[];
    expect(notesArg).toHaveLength(2);
    expect(notesArg[0]!.sourceIndex).toBe(0);
    expect(notesArg[1]!.sourceIndex).toBe(1);
  });
});

// =================================================================
// Issue #411: Version groups remapped through mediaIndexMap
// =================================================================

describe('Issue #411: Version group source indices remapped during partial restore', () => {
  it('ISS-411-007: version entry sourceIndex is remapped when first source is skipped', async () => {
    const components = createMockComponents();
    setupFirstSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    state.versionGroups = [
      makeVersionGroup('shot_ABC', [1, 2]),
    ];

    await SessionSerializer.fromJSON(state, components);

    const groupsArg = (components.session as any).versionManager.fromSerializable.mock.calls[0][0] as VersionGroup[];
    expect(groupsArg).toHaveLength(1);
    expect(groupsArg[0]!.versions).toHaveLength(2);
    expect(groupsArg[0]!.versions[0]!.sourceIndex).toBe(0); // was 1
    expect(groupsArg[0]!.versions[1]!.sourceIndex).toBe(1); // was 2
  });

  it('ISS-411-008: version entries referencing lost sources are dropped; empty groups removed', async () => {
    const components = createMockComponents();
    setupFirstSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    // Group with only lost source
    state.versionGroups = [
      makeVersionGroup('shot_lost', [0]),
      makeVersionGroup('shot_ok', [1]),
    ];

    await SessionSerializer.fromJSON(state, components);

    const groupsArg = (components.session as any).versionManager.fromSerializable.mock.calls[0][0] as VersionGroup[];
    // First group should be dropped (all versions lost)
    expect(groupsArg).toHaveLength(1);
    expect(groupsArg[0]!.shotName).toBe('shot_ok');
    expect(groupsArg[0]!.versions[0]!.sourceIndex).toBe(0); // was 1
  });

  it('ISS-411-009: activeVersionIndex clamped when active version is lost', async () => {
    const components = createMockComponents();
    setupMiddleSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    // Active version points to last entry (index 2, version at sourceIndex=1 which will fail)
    state.versionGroups = [
      {
        id: crypto.randomUUID(),
        shotName: 'shot_X',
        versions: [
          { versionNumber: 1, sourceIndex: 0, label: 'v1', addedAt: new Date().toISOString() },
          { versionNumber: 2, sourceIndex: 1, label: 'v2', addedAt: new Date().toISOString() },
          { versionNumber: 3, sourceIndex: 2, label: 'v3', addedAt: new Date().toISOString() },
        ],
        activeVersionIndex: 2, // points to v3 (sourceIndex 2)
      },
    ];

    await SessionSerializer.fromJSON(state, components);

    const groupsArg = (components.session as any).versionManager.fromSerializable.mock.calls[0][0] as VersionGroup[];
    expect(groupsArg).toHaveLength(1);
    // Middle version dropped: v1 (sourceIndex 0→0), v3 (sourceIndex 2→1)
    expect(groupsArg[0]!.versions).toHaveLength(2);
    expect(groupsArg[0]!.versions[0]!.sourceIndex).toBe(0);
    expect(groupsArg[0]!.versions[1]!.sourceIndex).toBe(1);
    // activeVersionIndex was 2 but only 2 versions remain → clamped to 1
    expect(groupsArg[0]!.activeVersionIndex).toBe(1);
  });

  it('ISS-411-010: version groups unchanged when all sources load successfully', async () => {
    const components = createMockComponents();

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    state.versionGroups = [
      makeVersionGroup('shot_A', [0, 1]),
    ];

    await SessionSerializer.fromJSON(state, components);

    const groupsArg = (components.session as any).versionManager.fromSerializable.mock.calls[0][0] as VersionGroup[];
    expect(groupsArg).toHaveLength(1);
    expect(groupsArg[0]!.versions[0]!.sourceIndex).toBe(0);
    expect(groupsArg[0]!.versions[1]!.sourceIndex).toBe(1);
  });
});

// =================================================================
// Issue #411: Statuses remapped through mediaIndexMap
// =================================================================

describe('Issue #411: Status entry source indices remapped during partial restore', () => {
  it('ISS-411-011: status sourceIndex is remapped when first source is skipped', async () => {
    const components = createMockComponents();
    setupFirstSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];
    state.statuses = [
      makeStatus(1, 'approved'),
      makeStatus(2, 'needs-work'),
    ];

    await SessionSerializer.fromJSON(state, components);

    const statusArg = (components.session as any).statusManager.fromSerializable.mock.calls[0][0] as StatusEntry[];
    expect(statusArg).toHaveLength(2);
    expect(statusArg[0]!.sourceIndex).toBe(0); // was 1
    expect(statusArg[0]!.status).toBe('approved');
    expect(statusArg[1]!.sourceIndex).toBe(1); // was 2
    expect(statusArg[1]!.status).toBe('needs-work');
  });

  it('ISS-411-012: status entries referencing lost sources are dropped', async () => {
    const components = createMockComponents();
    setupFirstSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    state.statuses = [
      makeStatus(0, 'approved'), // source 0 will fail
      makeStatus(1, 'needs-work'),
    ];

    await SessionSerializer.fromJSON(state, components);

    const statusArg = (components.session as any).statusManager.fromSerializable.mock.calls[0][0] as StatusEntry[];
    expect(statusArg).toHaveLength(1);
    expect(statusArg[0]!.sourceIndex).toBe(0); // was 1
    expect(statusArg[0]!.status).toBe('needs-work');
  });

  it('ISS-411-013: statuses unchanged when all sources load successfully', async () => {
    const components = createMockComponents();

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];
    state.statuses = [
      makeStatus(0, 'approved'),
      makeStatus(1, 'needs-work'),
    ];

    await SessionSerializer.fromJSON(state, components);

    const statusArg = (components.session as any).statusManager.fromSerializable.mock.calls[0][0] as StatusEntry[];
    expect(statusArg).toHaveLength(2);
    expect(statusArg[0]!.sourceIndex).toBe(0);
    expect(statusArg[1]!.sourceIndex).toBe(1);
  });
});

// =================================================================
// Issue #411: All subsystems together
// =================================================================

describe('Issue #411: All subsystems remapped together during partial restore', () => {
  it('ISS-411-014: all subsystem indices remapped correctly when middle source is skipped', async () => {
    const components = createMockComponents();
    setupMiddleSourceFails(components);

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
      makeImageRef('img2.exr', '/img2.exr'),
    ];

    state.playlist = makePlaylistState([
      { sourceIndex: 0, sourceName: 'img0.exr' },
      { sourceIndex: 1, sourceName: 'img1.exr' },
      { sourceIndex: 2, sourceName: 'img2.exr' },
    ]);
    state.notes = [
      makeNote(0, 'Note on 0'),
      makeNote(1, 'Note on 1 (lost)'),
      makeNote(2, 'Note on 2'),
    ];
    state.versionGroups = [
      makeVersionGroup('shot', [0, 1, 2]),
    ];
    state.statuses = [
      makeStatus(0, 'approved'),
      makeStatus(1, 'needs-work'),
      makeStatus(2, 'pending'),
    ];
    state.playback.currentSourceIndex = 2;

    await SessionSerializer.fromJSON(state, components);

    // Playlist: source 1 lost → 2 clips survive
    const playlistArg = components.playlistManager.setState.mock.calls[0][0] as PlaylistState;
    expect(playlistArg.clips).toHaveLength(2);
    expect(playlistArg.clips[0]!.sourceIndex).toBe(0);
    expect(playlistArg.clips[1]!.sourceIndex).toBe(1); // was 2

    // Notes: note on source 1 dropped
    const notesArg = (components.session as any).noteManager.fromSerializable.mock.calls[0][0] as Note[];
    expect(notesArg).toHaveLength(2);
    expect(notesArg[0]!.sourceIndex).toBe(0);
    expect(notesArg[1]!.sourceIndex).toBe(1); // was 2

    // Version groups: entry for source 1 dropped
    const groupsArg = (components.session as any).versionManager.fromSerializable.mock.calls[0][0] as VersionGroup[];
    expect(groupsArg).toHaveLength(1);
    expect(groupsArg[0]!.versions).toHaveLength(2);
    expect(groupsArg[0]!.versions[0]!.sourceIndex).toBe(0);
    expect(groupsArg[0]!.versions[1]!.sourceIndex).toBe(1); // was 2

    // Statuses: entry for source 1 dropped
    const statusArg = (components.session as any).statusManager.fromSerializable.mock.calls[0][0] as StatusEntry[];
    expect(statusArg).toHaveLength(2);
    expect(statusArg[0]!.sourceIndex).toBe(0);
    expect(statusArg[1]!.sourceIndex).toBe(1); // was 2

    // Playback: currentSourceIndex remapped from 2 → 1
    const pbArg = (components.session as any).setPlaybackState.mock.calls[0][0];
    expect(pbArg.currentSourceIndex).toBe(1);
  });

  it('ISS-411-015: no remapping occurs when mediaIndexMap is identity (all sources load)', async () => {
    const components = createMockComponents();

    const state = SessionSerializer.createEmpty();
    state.media = [
      makeImageRef('img0.exr', '/img0.exr'),
      makeImageRef('img1.exr', '/img1.exr'),
    ];

    const note0 = makeNote(0, 'A');
    const note1 = makeNote(1, 'B');
    state.notes = [note0, note1];
    state.statuses = [makeStatus(0, 'approved'), makeStatus(1, 'needs-work')];
    state.versionGroups = [makeVersionGroup('shot', [0, 1])];
    state.playlist = makePlaylistState([
      { sourceIndex: 0, sourceName: 'img0.exr' },
      { sourceIndex: 1, sourceName: 'img1.exr' },
    ]);

    await SessionSerializer.fromJSON(state, components);

    // Everything should be unchanged
    const playlistArg = components.playlistManager.setState.mock.calls[0][0] as PlaylistState;
    expect(playlistArg.clips).toHaveLength(2);
    expect(playlistArg.clips[0]!.sourceIndex).toBe(0);
    expect(playlistArg.clips[1]!.sourceIndex).toBe(1);

    const notesArg = (components.session as any).noteManager.fromSerializable.mock.calls[0][0] as Note[];
    expect(notesArg).toHaveLength(2);

    const groupsArg = (components.session as any).versionManager.fromSerializable.mock.calls[0][0] as VersionGroup[];
    expect(groupsArg[0]!.versions[0]!.sourceIndex).toBe(0);
    expect(groupsArg[0]!.versions[1]!.sourceIndex).toBe(1);

    const statusArg = (components.session as any).statusManager.fromSerializable.mock.calls[0][0] as StatusEntry[];
    expect(statusArg[0]!.sourceIndex).toBe(0);
    expect(statusArg[1]!.sourceIndex).toBe(1);
  });
});
