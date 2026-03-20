/**
 * Regression tests for Issue #310:
 * Editing a multi-cut timeline collapses session `pingpong` looping into
 * plain playlist looping. The lossy mapping collapsed both `loop` and
 * `pingpong` into `'all'`. After the fix, `pingpong` is mapped to
 * PlaylistManager's new `'pingpong'` loop mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TimelineEditorService,
  type TimelineEditorServiceDeps,
  type TimelineEDLEntry,
  type TimelineSourceInfo,
  type TimelineRVEDLEntry,
} from './TimelineEditorService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEDLEntry(overrides: Partial<TimelineEDLEntry> = {}): TimelineEDLEntry {
  return {
    frame: 1,
    source: 0,
    inPoint: 1,
    outPoint: 30,
    ...overrides,
  };
}

function createMockSession() {
  return {
    currentFrame: 1,
    currentSourceIndex: 0,
    frameCount: 100,
    sourceCount: 2,
    loopMode: 'loop',
    allSources: [
      { name: 'Source A', duration: 30 },
      { name: 'Source B', duration: 50 },
    ] as TimelineSourceInfo[],
    edlEntries: [] as TimelineRVEDLEntry[],
    graph: null as { getAllNodes(): unknown[] } | null,
    goToFrame: vi.fn(),
    setCurrentSource: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    getSourceByIndex: vi.fn().mockImplementation((index: number) => {
      const sources = [{ name: 'Source A' }, { name: 'Source B' }];
      return sources[index] ?? null;
    }),
    on: vi.fn().mockReturnValue(vi.fn()),
  };
}

function createMockPlaylistManager() {
  return {
    isEnabled: vi.fn().mockReturnValue(false),
    setEnabled: vi.fn(),
    getClips: vi.fn().mockReturnValue([]),
    getClipByIndex: vi.fn().mockReturnValue(undefined),
    replaceClips: vi.fn(),
    getLoopMode: vi.fn().mockReturnValue('none'),
    setLoopMode: vi.fn(),
    setCurrentFrame: vi.fn(),
    on: vi.fn().mockReturnValue(vi.fn()),
  };
}

function createDeps() {
  const isSequenceGroupNode = vi.fn().mockReturnValue(false);
  return {
    session: createMockSession(),
    timelineEditor: {
      getEDL: vi.fn().mockReturnValue([]),
      loadFromEDL: vi.fn(),
      loadFromSequenceNode: vi.fn(),
      setTotalFrames: vi.fn(),
      on: vi.fn().mockReturnValue(vi.fn()),
    },
    playlistManager: createMockPlaylistManager(),
    timeline: { refresh: vi.fn() },
    persistenceManager: { syncGTOStore: vi.fn() },
    jumpToPlaylistGlobalFrame: vi.fn(),
    isSequenceGroupNode,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Issue #310 — pingpong loop mode preservation in multi-cut timeline', () => {
  let deps: ReturnType<typeof createDeps>;
  let service: TimelineEditorService;

  beforeEach(() => {
    deps = createDeps();
    service = new TimelineEditorService(deps as unknown as TimelineEditorServiceDeps);
  });

  it('maps session pingpong to playlist pingpong on multi-cut edit', () => {
    deps.playlistManager.isEnabled.mockReturnValue(false);
    deps.session.loopMode = 'pingpong';

    const edl = [
      makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
      makeEDLEntry({ source: 1, inPoint: 1, outPoint: 20 }),
    ];

    service.applyEditsToPlaylist(edl);

    expect(deps.playlistManager.setLoopMode).toHaveBeenCalledWith('pingpong');
    expect(deps.playlistManager.setEnabled).toHaveBeenCalledWith(true);
  });

  it('maps session loop to playlist all (unchanged behavior)', () => {
    deps.playlistManager.isEnabled.mockReturnValue(false);
    deps.session.loopMode = 'loop';

    const edl = [
      makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
      makeEDLEntry({ source: 1, inPoint: 1, outPoint: 20 }),
    ];

    service.applyEditsToPlaylist(edl);

    expect(deps.playlistManager.setLoopMode).toHaveBeenCalledWith('all');
  });

  it('maps session once to playlist none (unchanged behavior)', () => {
    deps.playlistManager.isEnabled.mockReturnValue(false);
    deps.session.loopMode = 'once';

    const edl = [
      makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
      makeEDLEntry({ source: 1, inPoint: 1, outPoint: 20 }),
    ];

    service.applyEditsToPlaylist(edl);

    expect(deps.playlistManager.setLoopMode).toHaveBeenCalledWith('none');
  });

  it('preserves pingpong when playlist is already enabled with loopMode none', () => {
    deps.playlistManager.isEnabled.mockReturnValue(true);
    deps.playlistManager.getLoopMode.mockReturnValue('none');
    deps.session.loopMode = 'pingpong';

    const edl = [
      makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
      makeEDLEntry({ source: 1, inPoint: 1, outPoint: 20 }),
    ];

    service.applyEditsToPlaylist(edl);

    expect(deps.playlistManager.setLoopMode).toHaveBeenCalledWith('pingpong');
  });

  it('does not overwrite loop mode when playlist already enabled with non-none mode', () => {
    deps.playlistManager.isEnabled.mockReturnValue(true);
    deps.playlistManager.getLoopMode.mockReturnValue('pingpong');
    deps.session.loopMode = 'loop';

    const edl = [
      makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
      makeEDLEntry({ source: 1, inPoint: 1, outPoint: 20 }),
    ];

    service.applyEditsToPlaylist(edl);

    // Should NOT overwrite — the existing mode is not 'none'
    expect(deps.playlistManager.setLoopMode).not.toHaveBeenCalled();
  });
});
