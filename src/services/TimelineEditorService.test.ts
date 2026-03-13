import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TimelineEditorService,
  type TimelineEditorServiceDeps,
  type TimelineEDLEntry,
  type TimelineSequenceNode,
  type TimelinePlaylistClip,
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

function makePlaylistClip(overrides: Partial<TimelinePlaylistClip> = {}): TimelinePlaylistClip {
  return {
    globalStartFrame: 1,
    sourceIndex: 0,
    sourceName: 'Source 1',
    inPoint: 1,
    outPoint: 30,
    ...overrides,
  };
}

function makeSequenceNode(overrides: Partial<TimelineSequenceNode> = {}): TimelineSequenceNode {
  return {
    setEDL: vi.fn(),
    getTotalDurationFromEDL: vi.fn().mockReturnValue(60),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lightweight test doubles
// ---------------------------------------------------------------------------

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

function createMockTimelineEditor() {
  return {
    getEDL: vi.fn().mockReturnValue([]),
    loadFromEDL: vi.fn(),
    loadFromSequenceNode: vi.fn(),
    setTotalFrames: vi.fn(),
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

function createMockTimeline() {
  return {
    refresh: vi.fn(),
  };
}

function createMockPersistenceManager() {
  return {
    syncGTOStore: vi.fn(),
  };
}

function createDeps() {
  const isSequenceGroupNode = vi.fn().mockReturnValue(false);
  return {
    session: createMockSession(),
    timelineEditor: createMockTimelineEditor(),
    playlistManager: createMockPlaylistManager(),
    timeline: createMockTimeline(),
    persistenceManager: createMockPersistenceManager(),
    jumpToPlaylistGlobalFrame: vi.fn(),
    isSequenceGroupNode,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimelineEditorService', () => {
  let deps: ReturnType<typeof createDeps>;
  let service: TimelineEditorService;

  beforeEach(() => {
    deps = createDeps();
    service = new TimelineEditorService(deps as unknown as TimelineEditorServiceDeps);
  });

  // -----------------------------------------------------------------------
  // bindEvents
  // -----------------------------------------------------------------------

  describe('bindEvents', () => {
    it('TLE-001: subscribes to timeline editor UI events', () => {
      service.bindEvents();

      const calls = deps.timelineEditor.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('cutSelected');
      expect(calls).toContain('cutTrimmed');
      expect(calls).toContain('cutMoved');
      expect(calls).toContain('cutDeleted');
      expect(calls).toContain('cutInserted');
      expect(calls).toContain('cutSplit');
    });

    it('TLE-002: subscribes to session sync events', () => {
      service.bindEvents();

      const calls = deps.session.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('graphLoaded');
      expect(calls).toContain('durationChanged');
      expect(calls).toContain('sourceLoaded');
      expect(calls).toContain('edlLoaded');
    });

    it('TLE-003: subscribes to playlistManager clipsChanged event', () => {
      service.bindEvents();

      const calls = deps.playlistManager.on.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('clipsChanged');
    });
  });

  // -----------------------------------------------------------------------
  // getSequenceGroupNodeFromGraph
  // -----------------------------------------------------------------------

  describe('getSequenceGroupNodeFromGraph', () => {
    it('TLE-004: returns null when session has no graph', () => {
      deps.session.graph = null;

      expect(service.getSequenceGroupNodeFromGraph()).toBeNull();
    });

    it('TLE-005: returns SequenceGroupNode when found in graph', () => {
      const seqNode = makeSequenceNode();
      deps.session.graph = { getAllNodes: () => [seqNode, { type: 'other' }] };
      deps.isSequenceGroupNode.mockImplementation((node: unknown) => node === seqNode);

      expect(service.getSequenceGroupNodeFromGraph()).toBe(seqNode);
    });

    it('TLE-006: returns null when graph has no SequenceGroupNode', () => {
      deps.session.graph = { getAllNodes: () => [{ type: 'other' }] };

      expect(service.getSequenceGroupNodeFromGraph()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // handleCutSelected
  // -----------------------------------------------------------------------

  describe('handleCutSelected', () => {
    it('TLE-007: navigates to EDL entry frame when SequenceGroupNode exists', () => {
      const seqNode = makeSequenceNode();
      deps.session.graph = { getAllNodes: () => [seqNode] };
      deps.isSequenceGroupNode.mockImplementation((node: unknown) => node === seqNode);
      deps.timelineEditor.getEDL.mockReturnValue([makeEDLEntry({ frame: 10 }), makeEDLEntry({ frame: 40 })]);

      service.handleCutSelected(1);

      expect(deps.session.goToFrame).toHaveBeenCalledWith(40);
    });

    it('TLE-008: jumps to playlist clip when no SequenceGroupNode', () => {
      const clip = makePlaylistClip({ globalStartFrame: 31 });
      deps.playlistManager.getClipByIndex.mockReturnValue(clip);

      service.handleCutSelected(0);

      expect(deps.jumpToPlaylistGlobalFrame).toHaveBeenCalledWith(31);
    });

    it('TLE-009: falls back to EDL entry source navigation when no playlist clip', () => {
      deps.playlistManager.getClipByIndex.mockReturnValue(undefined);
      deps.timelineEditor.getEDL.mockReturnValue([makeEDLEntry({ frame: 1, source: 1, inPoint: 5 })]);
      deps.session.currentSourceIndex = 0;

      service.handleCutSelected(0);

      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(1);
      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
    });

    it('TLE-010: does nothing when cutIndex has no EDL entry and no playlist clip', () => {
      deps.playlistManager.getClipByIndex.mockReturnValue(undefined);
      deps.timelineEditor.getEDL.mockReturnValue([]);

      service.handleCutSelected(5);

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
      expect(deps.jumpToPlaylistGlobalFrame).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // buildFallbackEDLFromSources
  // -----------------------------------------------------------------------

  describe('buildFallbackEDLFromSources', () => {
    it('TLE-011: builds EDL from session sources with contiguous frames', () => {
      const result = service.buildFallbackEDLFromSources();

      expect(result.edl).toEqual([
        { frame: 1, source: 0, inPoint: 1, outPoint: 30 },
        { frame: 31, source: 1, inPoint: 1, outPoint: 50 },
      ]);
      expect(result.labels).toEqual(['Source A', 'Source B']);
    });

    it('TLE-012: returns empty EDL when no sources exist', () => {
      deps.session.allSources = [];

      const result = service.buildFallbackEDLFromSources();

      expect(result.edl).toEqual([]);
      expect(result.labels).toEqual([]);
    });

    it('TLE-013: uses fallback name when source has no name', () => {
      deps.session.allSources = [{ duration: 10 }];

      const result = service.buildFallbackEDLFromSources();

      expect(result.labels).toEqual(['Source 1']);
    });

    it('TLE-014: uses duration of 1 when source has no duration', () => {
      deps.session.allSources = [{ name: 'X' }];

      const result = service.buildFallbackEDLFromSources();

      expect(result.edl[0]!.outPoint).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // normalizeEDL
  // -----------------------------------------------------------------------

  describe('normalizeEDL', () => {
    it('TLE-015: recomputes contiguous frame starts', () => {
      const edl = [
        makeEDLEntry({ frame: 100, source: 0, inPoint: 1, outPoint: 10 }),
        makeEDLEntry({ frame: 200, source: 1, inPoint: 5, outPoint: 20 }),
      ];

      const result = service.normalizeEDL(edl);

      expect(result[0]!.frame).toBe(1);
      expect(result[1]!.frame).toBe(11); // 1 + (10 - 1 + 1)
    });

    it('TLE-016: filters out entries with non-finite source', () => {
      const edl = [makeEDLEntry({ source: NaN }), makeEDLEntry({ frame: 1, source: 0, inPoint: 1, outPoint: 10 })];

      const result = service.normalizeEDL(edl);

      expect(result).toHaveLength(1);
      expect(result[0]!.source).toBe(0);
    });

    it('TLE-017: clamps negative inPoint to 1', () => {
      const edl = [makeEDLEntry({ inPoint: -5, outPoint: 10 })];

      const result = service.normalizeEDL(edl);

      expect(result[0]!.inPoint).toBe(1);
    });

    it('TLE-018: ensures outPoint is at least inPoint', () => {
      const edl = [makeEDLEntry({ inPoint: 10, outPoint: 5 })];

      const result = service.normalizeEDL(edl);

      expect(result[0]!.outPoint).toBeGreaterThanOrEqual(result[0]!.inPoint);
    });

    it('TLE-019: sorts entries by frame before normalizing', () => {
      const edl = [
        makeEDLEntry({ frame: 50, source: 1, inPoint: 1, outPoint: 10 }),
        makeEDLEntry({ frame: 10, source: 0, inPoint: 1, outPoint: 5 }),
      ];

      const result = service.normalizeEDL(edl);

      expect(result[0]!.source).toBe(0);
      expect(result[1]!.source).toBe(1);
    });

    it('TLE-020: returns empty array for empty input', () => {
      expect(service.normalizeEDL([])).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // syncFromGraph
  // -----------------------------------------------------------------------

  describe('syncFromGraph', () => {
    it('TLE-021: loads from SequenceGroupNode when present', () => {
      const seqNode = makeSequenceNode();
      deps.session.graph = { getAllNodes: () => [seqNode] };
      deps.isSequenceGroupNode.mockImplementation((node: unknown) => node === seqNode);

      service.syncFromGraph();

      expect(deps.timelineEditor.loadFromSequenceNode).toHaveBeenCalledWith(seqNode);
    });

    it('TLE-022: loads from playlist clips when no SequenceGroupNode', () => {
      const clips = [
        makePlaylistClip({ globalStartFrame: 1, sourceIndex: 0, inPoint: 1, outPoint: 30, sourceName: 'A' }),
        makePlaylistClip({ globalStartFrame: 31, sourceIndex: 1, inPoint: 1, outPoint: 20, sourceName: 'B' }),
      ];
      deps.playlistManager.getClips.mockReturnValue(clips);

      service.syncFromGraph();

      expect(deps.timelineEditor.loadFromEDL).toHaveBeenCalledWith(
        [
          { frame: 1, source: 0, inPoint: 1, outPoint: 30 },
          { frame: 31, source: 1, inPoint: 1, outPoint: 20 },
        ],
        ['A', 'B'],
      );
    });

    it('TLE-023: loads from fallback EDL when no clips and no SequenceGroupNode', () => {
      service.syncFromGraph();

      // Should use buildFallbackEDLFromSources which returns Source A/B entries
      expect(deps.timelineEditor.loadFromEDL).toHaveBeenCalledWith(
        [
          { frame: 1, source: 0, inPoint: 1, outPoint: 30 },
          { frame: 31, source: 1, inPoint: 1, outPoint: 50 },
        ],
        ['Source A', 'Source B'],
      );
    });

    it('TLE-024: loads empty EDL when no sources, no clips, no SequenceGroupNode', () => {
      deps.session.allSources = [];

      service.syncFromGraph();

      expect(deps.timelineEditor.setTotalFrames).toHaveBeenCalledWith(100);
      expect(deps.timelineEditor.loadFromEDL).toHaveBeenCalledWith([]);
    });
  });

  // -----------------------------------------------------------------------
  // applyEditsToPlaylist
  // -----------------------------------------------------------------------

  describe('applyEditsToPlaylist', () => {
    it('TLE-025: replaces clips and disables playlist for empty EDL', () => {
      deps.playlistManager.isEnabled.mockReturnValue(true);

      service.applyEditsToPlaylist([]);

      expect(deps.playlistManager.replaceClips).toHaveBeenCalledWith([]);
      expect(deps.playlistManager.setEnabled).toHaveBeenCalledWith(false);
      expect(deps.timeline.refresh).toHaveBeenCalled();
      expect(deps.persistenceManager.syncGTOStore).toHaveBeenCalled();
    });

    it('TLE-026: single-cut edit disables playlist and sets in/out points', () => {
      deps.playlistManager.isEnabled.mockReturnValue(true);
      const edl = [makeEDLEntry({ source: 0, inPoint: 5, outPoint: 25 })];

      service.applyEditsToPlaylist(edl);

      expect(deps.playlistManager.setEnabled).toHaveBeenCalledWith(false);
      expect(deps.session.setInPoint).toHaveBeenCalledWith(5);
      expect(deps.session.setOutPoint).toHaveBeenCalledWith(25);
    });

    it('TLE-027: single-cut edit navigates to inPoint when currentFrame is out of range', () => {
      deps.session.currentFrame = 50;
      const edl = [makeEDLEntry({ source: 0, inPoint: 5, outPoint: 25 })];

      service.applyEditsToPlaylist(edl);

      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
    });

    it('TLE-028: multi-cut edit enables playlist with correct loop mode', () => {
      deps.playlistManager.isEnabled.mockReturnValue(false);
      deps.session.loopMode = 'loop';
      const edl = [
        makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
        makeEDLEntry({ source: 1, inPoint: 1, outPoint: 20 }),
      ];

      service.applyEditsToPlaylist(edl);

      expect(deps.playlistManager.setLoopMode).toHaveBeenCalledWith('all');
      expect(deps.playlistManager.setEnabled).toHaveBeenCalledWith(true);
    });

    it('TLE-029: multi-cut edit maps "once" loopMode to "none"', () => {
      deps.playlistManager.isEnabled.mockReturnValue(false);
      deps.session.loopMode = 'once';
      const edl = [
        makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
        makeEDLEntry({ source: 1, inPoint: 1, outPoint: 20 }),
      ];

      service.applyEditsToPlaylist(edl);

      expect(deps.playlistManager.setLoopMode).toHaveBeenCalledWith('none');
    });

    it('TLE-030: filters out entries with source index out of range', () => {
      deps.session.sourceCount = 1;
      const edl = [
        makeEDLEntry({ source: 0, inPoint: 1, outPoint: 10 }),
        makeEDLEntry({ source: 5, inPoint: 1, outPoint: 20 }),
      ];

      service.applyEditsToPlaylist(edl);

      const clipArgs = deps.playlistManager.replaceClips.mock.calls[0]![0];
      expect(clipArgs).toHaveLength(1);
      expect(clipArgs[0].sourceIndex).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // applyEdits
  // -----------------------------------------------------------------------

  describe('applyEdits', () => {
    it('TLE-031: delegates to applyEditsToPlaylist when no SequenceGroupNode', () => {
      deps.timelineEditor.getEDL.mockReturnValue([makeEDLEntry({ frame: 1, source: 0, inPoint: 1, outPoint: 10 })]);

      service.applyEdits();

      expect(deps.playlistManager.replaceClips).toHaveBeenCalled();
      expect(deps.timeline.refresh).toHaveBeenCalled();
    });

    it('TLE-032: updates SequenceGroupNode EDL when present', () => {
      const seqNode = makeSequenceNode();
      deps.session.graph = { getAllNodes: () => [seqNode] };
      deps.isSequenceGroupNode.mockImplementation((node: unknown) => node === seqNode);
      deps.timelineEditor.getEDL.mockReturnValue([makeEDLEntry({ frame: 1, source: 0, inPoint: 1, outPoint: 30 })]);

      service.applyEdits();

      expect(seqNode.setEDL).toHaveBeenCalled();
      expect(deps.session.setInPoint).toHaveBeenCalledWith(1);
      expect(deps.session.setOutPoint).toHaveBeenCalledWith(60); // getTotalDurationFromEDL returns 60
      expect(deps.timelineEditor.loadFromEDL).toHaveBeenCalled();
      expect(deps.timeline.refresh).toHaveBeenCalled();
      expect(deps.persistenceManager.syncGTOStore).toHaveBeenCalled();
    });

    it('TLE-033: clamps currentFrame to totalDuration when it exceeds it', () => {
      const seqNode = makeSequenceNode({ getTotalDurationFromEDL: vi.fn().mockReturnValue(20) });
      deps.session.graph = { getAllNodes: () => [seqNode] };
      deps.isSequenceGroupNode.mockImplementation((node: unknown) => node === seqNode);
      deps.session.currentFrame = 50;
      deps.timelineEditor.getEDL.mockReturnValue([makeEDLEntry({ frame: 1, source: 0, inPoint: 1, outPoint: 20 })]);

      service.applyEdits();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(20);
    });

    it('TLE-034: does not navigate when currentFrame is within duration', () => {
      const seqNode = makeSequenceNode({ getTotalDurationFromEDL: vi.fn().mockReturnValue(100) });
      deps.session.graph = { getAllNodes: () => [seqNode] };
      deps.isSequenceGroupNode.mockImplementation((node: unknown) => node === seqNode);
      deps.session.currentFrame = 50;
      deps.timelineEditor.getEDL.mockReturnValue([makeEDLEntry({ frame: 1, source: 0, inPoint: 1, outPoint: 100 })]);

      service.applyEdits();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // buildEDLFromRVEDLEntries
  // -----------------------------------------------------------------------

  describe('buildEDLFromRVEDLEntries', () => {
    it('TLE-037: converts RVEDL entries to timeline EDL with contiguous frames', () => {
      deps.session.allSources = [{ name: 'clip1.exr', duration: 100 }, { name: 'clip2.mov', duration: 200 }];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/path/to/clip1.exr', inFrame: 10, outFrame: 50 },
        { sourcePath: '/path/to/clip2.mov', inFrame: 1, outFrame: 100 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.edl).toEqual([
        { frame: 1, source: 0, inPoint: 10, outPoint: 50 },
        { frame: 42, source: 1, inPoint: 1, outPoint: 100 },
      ]);
      expect(result.labels).toEqual(['clip1.exr', 'clip2.mov']);
    });

    it('TLE-038: falls back to source 0 when no matching source found', () => {
      deps.session.allSources = [{ name: 'other.exr', duration: 100 }];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/path/to/unknown.exr', inFrame: 1, outFrame: 30 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.edl[0]!.source).toBe(0);
      expect(result.labels[0]).toBe('unknown.exr');
    });

    it('TLE-039: matches source by basename regardless of path prefix', () => {
      deps.session.allSources = [{ name: 'a.exr', duration: 10 }, { name: 'b.dpx', duration: 20 }];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/deep/nested/path/b.dpx', inFrame: 5, outFrame: 15 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.edl[0]!.source).toBe(1);
    });

    it('TLE-040: clamps negative inFrame to 1', () => {
      deps.session.allSources = [{ name: 'clip.exr', duration: 100 }];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/path/clip.exr', inFrame: -5, outFrame: 30 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.edl[0]!.inPoint).toBe(1);
    });

    it('TLE-041: ensures outPoint is at least inPoint', () => {
      deps.session.allSources = [{ name: 'clip.exr', duration: 100 }];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/path/clip.exr', inFrame: 50, outFrame: 10 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.edl[0]!.outPoint).toBeGreaterThanOrEqual(result.edl[0]!.inPoint);
    });

    it('TLE-042: returns empty result for empty entries', () => {
      const result = service.buildEDLFromRVEDLEntries([]);

      expect(result.edl).toEqual([]);
      expect(result.labels).toEqual([]);
      expect(result.unresolvedPaths).toEqual([]);
    });

    it('TLE-047: returns unresolved paths for entries that do not match any loaded source', () => {
      deps.session.allSources = [{ name: 'known.exr', duration: 100 }];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/path/to/known.exr', inFrame: 1, outFrame: 30 },
        { sourcePath: '/path/to/missing1.exr', inFrame: 10, outFrame: 40 },
        { sourcePath: '/path/to/missing2.dpx', inFrame: 5, outFrame: 20 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.unresolvedPaths).toEqual(['/path/to/missing1.exr', '/path/to/missing2.dpx']);
      // Unresolved entries still fall back to source 0
      expect(result.edl[1]!.source).toBe(0);
      expect(result.edl[2]!.source).toBe(0);
      // Resolved entry uses correct source
      expect(result.edl[0]!.source).toBe(0);
    });

    it('TLE-048: returns empty unresolvedPaths when all sources match', () => {
      deps.session.allSources = [
        { name: 'clip1.exr', duration: 100 },
        { name: 'clip2.mov', duration: 200 },
      ];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/path/to/clip1.exr', inFrame: 1, outFrame: 30 },
        { sourcePath: '/other/clip2.mov', inFrame: 10, outFrame: 50 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.unresolvedPaths).toEqual([]);
      expect(result.edl[0]!.source).toBe(0);
      expect(result.edl[1]!.source).toBe(1);
    });

    it('TLE-049: all entries unresolved returns all paths and falls back to source 0', () => {
      deps.session.allSources = [{ name: 'other.exr', duration: 50 }];
      const entries: TimelineRVEDLEntry[] = [
        { sourcePath: '/a/unknown1.exr', inFrame: 1, outFrame: 10 },
        { sourcePath: '/b/unknown2.exr', inFrame: 1, outFrame: 20 },
      ];

      const result = service.buildEDLFromRVEDLEntries(entries);

      expect(result.unresolvedPaths).toEqual(['/a/unknown1.exr', '/b/unknown2.exr']);
      expect(result.edl[0]!.source).toBe(0);
      expect(result.edl[1]!.source).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // syncFromGraph - RVEDL entries integration (Issue #163)
  // -----------------------------------------------------------------------

  describe('syncFromGraph - RVEDL entries', () => {
    it('TLE-043: loads from RVEDL entries when no SequenceGroupNode and no playlist clips', () => {
      deps.session.allSources = [{ name: 'shot1.exr', duration: 100 }];
      deps.session.edlEntries = [
        { sourcePath: '/renders/shot1.exr', inFrame: 10, outFrame: 50 },
        { sourcePath: '/renders/shot1.exr', inFrame: 60, outFrame: 90 },
      ];

      service.syncFromGraph();

      expect(deps.timelineEditor.loadFromEDL).toHaveBeenCalledWith(
        [
          { frame: 1, source: 0, inPoint: 10, outPoint: 50 },
          { frame: 42, source: 0, inPoint: 60, outPoint: 90 },
        ],
        ['shot1.exr', 'shot1.exr'],
      );
    });

    it('TLE-044: RVEDL entries are lower priority than playlist clips', () => {
      const clips = [
        makePlaylistClip({ globalStartFrame: 1, sourceIndex: 0, inPoint: 1, outPoint: 30, sourceName: 'A' }),
      ];
      deps.playlistManager.getClips.mockReturnValue(clips);
      deps.session.edlEntries = [
        { sourcePath: '/path/shot.exr', inFrame: 1, outFrame: 100 },
      ];

      service.syncFromGraph();

      // Should use playlist clips, not RVEDL entries
      expect(deps.timelineEditor.loadFromEDL).toHaveBeenCalledWith(
        [{ frame: 1, source: 0, inPoint: 1, outPoint: 30 }],
        ['A'],
      );
    });

    it('TLE-050: logs console.warn when RVEDL entries have unresolved source paths', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      deps.session.allSources = [{ name: 'known.exr', duration: 100 }];
      deps.session.edlEntries = [
        { sourcePath: '/path/to/known.exr', inFrame: 1, outFrame: 30 },
        { sourcePath: '/path/to/missing.exr', inFrame: 10, outFrame: 40 },
      ];

      service.syncFromGraph();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 RVEDL source path(s) could not be matched'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('/path/to/missing.exr'),
      );
      warnSpy.mockRestore();
    });

    it('TLE-051: does not log console.warn when all RVEDL entries resolve', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      deps.session.allSources = [{ name: 'shot.exr', duration: 100 }];
      deps.session.edlEntries = [
        { sourcePath: '/renders/shot.exr', inFrame: 10, outFrame: 50 },
      ];

      service.syncFromGraph();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('TLE-045: RVEDL entries are higher priority than fallback EDL', () => {
      deps.session.allSources = [{ name: 'fallback.exr', duration: 50 }];
      deps.session.edlEntries = [
        { sourcePath: '/path/fallback.exr', inFrame: 10, outFrame: 20 },
      ];

      service.syncFromGraph();

      // Should use RVEDL entries (inPoint=10), not fallback (inPoint=1)
      const call = deps.timelineEditor.loadFromEDL.mock.calls[0];
      expect(call![0][0].inPoint).toBe(10);
    });

    it('TLE-046: edlLoaded event triggers syncFromGraph', () => {
      // Set up a handler capture so we can invoke the edlLoaded callback
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      deps.session.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
        return vi.fn();
      });

      deps.session.edlEntries = [
        { sourcePath: '/path/shot.exr', inFrame: 1, outFrame: 30 },
      ];
      deps.session.allSources = [{ name: 'shot.exr', duration: 100 }];

      service.bindEvents();

      // Simulate the edlLoaded event
      expect(handlers['edlLoaded']).toBeDefined();
      handlers['edlLoaded']!();

      expect(deps.timelineEditor.loadFromEDL).toHaveBeenCalledWith(
        [{ frame: 1, source: 0, inPoint: 1, outPoint: 30 }],
        ['shot.exr'],
      );
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  describe('dispose', () => {
    it('TLE-035: calls all unsubscribers on dispose', () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      deps.timelineEditor.on.mockReturnValue(unsub1);
      deps.session.on.mockReturnValue(unsub2);

      service.bindEvents();
      service.dispose();

      // 6 timeline editor events + 4 session events + 1 playlist manager event = 11
      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
    });

    it('TLE-036: can be called multiple times without error', () => {
      service.bindEvents();

      expect(() => {
        service.dispose();
        service.dispose();
      }).not.toThrow();
    });
  });
});
