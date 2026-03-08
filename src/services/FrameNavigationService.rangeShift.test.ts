import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FrameNavigationService,
  type FrameNavigationDeps,
  type NavPlaylistClip,
  type RangeSegment,
} from './FrameNavigationService';
import { createMockSession } from '../../test/mocks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClip(
  overrides: Partial<NavPlaylistClip> & { id: string; globalStartFrame: number; duration: number },
): NavPlaylistClip {
  return {
    inPoint: 1,
    outPoint: overrides.duration,
    ...overrides,
  };
}

function createMockPlaylistManager() {
  return {
    isEnabled: vi.fn().mockReturnValue(false),
    getClipByIndex: vi.fn().mockReturnValue(null),
    getClipCount: vi.fn().mockReturnValue(0),
    getClipAtFrame: vi.fn().mockReturnValue(null),
    getCurrentFrame: vi.fn().mockReturnValue(1),
    setCurrentFrame: vi.fn(),
    goToNextClip: vi.fn().mockReturnValue(null),
    goToPreviousClip: vi.fn().mockReturnValue(null),
    getClips: vi.fn().mockReturnValue([]),
  };
}

function createMockPlaylistPanel() {
  return { setActiveClip: vi.fn() };
}

function createMockPaintEngine() {
  return { getAnnotatedFrames: vi.fn().mockReturnValue(new Set()) };
}

function createDeps() {
  return {
    session: createMockSession(),
    playlistManager: createMockPlaylistManager(),
    playlistPanel: createMockPlaylistPanel(),
    paintEngine: createMockPaintEngine(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FrameNavigationService - Range Shifting', () => {
  let deps: ReturnType<typeof createDeps>;
  let service: FrameNavigationService;

  beforeEach(() => {
    deps = createDeps();
    service = new FrameNavigationService(deps as unknown as FrameNavigationDeps);
  });

  // -----------------------------------------------------------------------
  // collectRangeBoundaries
  // -----------------------------------------------------------------------

  describe('collectRangeBoundaries', () => {
    it('RS-B01: returns [1, duration] when no marks exist', () => {
      deps.session.currentSource = { duration: 100 };
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 100]);
    });

    it('RS-B02: includes mark frame numbers sorted', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [50, { frame: 50 }],
        [25, { frame: 25 }],
        [75, { frame: 75 }],
      ]);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 25, 50, 75, 100]);
    });

    it('RS-B03: includes duration marker endFrame as boundary', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[20, { frame: 20, endFrame: 40 }]]);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 20, 40, 100]);
    });

    it('RS-B04: deduplicates overlapping boundaries', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [1, { frame: 1 }],
        [100, { frame: 100 }],
      ]);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 100]);
    });

    it('RS-B05: clamps marks beyond source duration', () => {
      deps.session.currentSource = { duration: 50 };
      deps.session.marks = new Map([[200, { frame: 200 }]]);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 50]);
    });

    it('RS-B06: clamps marks below 1 to 1', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[0, { frame: 0 }]]);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 100]);
    });

    it('RS-B07: includes playlist clip boundaries when enabled', () => {
      deps.session.currentSource = { duration: 300 };
      deps.playlistManager.isEnabled.mockReturnValue(true);
      const clips = [
        makeClip({ id: 'c1', globalStartFrame: 1, duration: 100 }),
        makeClip({ id: 'c2', globalStartFrame: 101, duration: 100 }),
        makeClip({ id: 'c3', globalStartFrame: 201, duration: 100 }),
      ];
      deps.playlistManager.getClips.mockReturnValue(clips);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 100, 101, 200, 201, 300]);
    });

    it('RS-B08: merges playlist boundaries with user marks', () => {
      deps.session.currentSource = { duration: 200 };
      deps.playlistManager.isEnabled.mockReturnValue(true);
      const clips = [
        makeClip({ id: 'c1', globalStartFrame: 1, duration: 100 }),
        makeClip({ id: 'c2', globalStartFrame: 101, duration: 100 }),
      ];
      deps.playlistManager.getClips.mockReturnValue(clips);
      deps.session.marks = new Map([
        [50, { frame: 50 }],
        [150, { frame: 150 }],
      ]);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 50, 100, 101, 150, 200]);
    });

    it('RS-B09: clamps duration marker endFrame to source duration', () => {
      deps.session.currentSource = { duration: 50 };
      deps.session.marks = new Map([[20, { frame: 20, endFrame: 200 }]]);
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 20, 50]);
    });
  });

  // -----------------------------------------------------------------------
  // buildSegments
  // -----------------------------------------------------------------------

  describe('buildSegments', () => {
    it('RS-S01: returns empty for fewer than 2 boundaries', () => {
      expect(service.buildSegments([])).toEqual([]);
      expect(service.buildSegments([1])).toEqual([]);
    });

    it('RS-S02: creates correct segments from boundaries', () => {
      const segments = service.buildSegments([1, 25, 50, 75, 100]);
      expect(segments).toEqual([
        { inPoint: 1, outPoint: 25 },
        { inPoint: 25, outPoint: 50 },
        { inPoint: 50, outPoint: 75 },
        { inPoint: 75, outPoint: 100 },
      ]);
    });

    it('RS-S03: single mark creates two segments', () => {
      const segments = service.buildSegments([1, 50, 100]);
      expect(segments).toEqual([
        { inPoint: 1, outPoint: 50 },
        { inPoint: 50, outPoint: 100 },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // findCurrentSegmentIndex
  // -----------------------------------------------------------------------

  describe('findCurrentSegmentIndex', () => {
    it('RS-F01: finds segment matching current in point', () => {
      deps.session.inPoint = 25;
      deps.session.currentFrame = 30;
      const segments: RangeSegment[] = [
        { inPoint: 1, outPoint: 25 },
        { inPoint: 25, outPoint: 50 },
        { inPoint: 50, outPoint: 100 },
      ];
      expect(service.findCurrentSegmentIndex(segments)).toBe(1);
    });

    it('RS-F02: falls back to segment containing current frame', () => {
      deps.session.inPoint = 15; // doesn't match any inPoint exactly
      deps.session.currentFrame = 30;
      const segments: RangeSegment[] = [
        { inPoint: 1, outPoint: 25 },
        { inPoint: 25, outPoint: 50 },
        { inPoint: 50, outPoint: 100 },
      ];
      expect(service.findCurrentSegmentIndex(segments)).toBe(1);
    });

    it('RS-F03: defaults to 0 when no segment matches', () => {
      deps.session.inPoint = 200;
      deps.session.currentFrame = 200;
      const segments: RangeSegment[] = [
        { inPoint: 1, outPoint: 50 },
        { inPoint: 50, outPoint: 100 },
      ];
      expect(service.findCurrentSegmentIndex(segments)).toBe(0);
    });

    it('RS-F04: returns 0 for empty segments', () => {
      expect(service.findCurrentSegmentIndex([])).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // shiftRangeToNext
  // -----------------------------------------------------------------------

  describe('shiftRangeToNext', () => {
    it('RS-001: shifts to next mark pair', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [25, { frame: 25 }],
        [50, { frame: 50 }],
        [75, { frame: 75 }],
      ]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      const result = service.shiftRangeToNext();

      expect(result).toEqual({ inPoint: 25, outPoint: 50 });
      expect(deps.session.setInOutRange).toHaveBeenCalledWith(25, 50);
      expect(deps.session.goToFrame).toHaveBeenCalledWith(25);
    });

    it('RS-002: wraps around in loop mode', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 50;
      deps.session.currentFrame = 50;
      deps.session.loopMode = 'loop';

      const result = service.shiftRangeToNext();

      expect(result).toEqual({ inPoint: 1, outPoint: 50 });
      expect(deps.session.setInOutRange).toHaveBeenCalledWith(1, 50);
    });

    it('RS-003: does not wrap in once mode', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 50;
      deps.session.currentFrame = 75;
      deps.session.loopMode = 'once';

      const result = service.shiftRangeToNext();

      expect(result).toBeNull();
      expect(deps.session.setInOutRange).not.toHaveBeenCalled();
    });

    it('RS-007: no marks, range covers full duration, shift is no-op', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map();
      deps.session.inPoint = 1;
      deps.session.outPoint = 100;

      const result = service.shiftRangeToNext();

      expect(result).toBeNull();
      expect(deps.session.setInOutRange).not.toHaveBeenCalled();
    });

    it('RS-008: single mark creates two segments, shifts between them', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      const result = service.shiftRangeToNext();

      expect(result).toEqual({ inPoint: 50, outPoint: 100 });
    });

    it('RS-009: duration marker defines its own segment', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[20, { frame: 20, endFrame: 40 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      const result = service.shiftRangeToNext();

      // Boundaries: [1, 20, 40, 100] -> segments: [1-20], [20-40], [40-100]
      expect(result).toEqual({ inPoint: 20, outPoint: 40 });
    });

    it('RS-011: playhead moves to in point of new range', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 25;

      service.shiftRangeToNext();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(50);
    });

    it('RS-012: range shift works with pingpong loop mode (wraps)', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 50;
      deps.session.currentFrame = 75;
      deps.session.loopMode = 'pingpong';

      const result = service.shiftRangeToNext();

      expect(result).toEqual({ inPoint: 1, outPoint: 50 });
    });

    it('RS-013: adjacent marks on same frame are deduplicated', () => {
      deps.session.currentSource = { duration: 100 };
      // Two marks at frame 50 (duplicate keys in Map won't happen, but
      // the boundary set deduplicates frame 50 with source boundary at 100)
      deps.session.marks = new Map([[50, { frame: 50, endFrame: 50 }]]);
      deps.session.inPoint = 1;

      const result = service.shiftRangeToNext();

      // Boundaries: [1, 50, 100] -> segments: [1-50], [50-100]
      expect(result).toEqual({ inPoint: 50, outPoint: 100 });
    });

    it('RS-014: multiple duration markers create correct segments', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [10, { frame: 10, endFrame: 30 }],
        [60, { frame: 60, endFrame: 80 }],
      ]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      // Boundaries: [1, 10, 30, 60, 80, 100]
      // Segments: [1-10], [10-30], [30-60], [60-80], [80-100]
      const result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 10, outPoint: 30 });
    });

    it('RS-015: forward shift uses atomic setInOutRange (no clamping bug)', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [20, { frame: 20 }],
        [80, { frame: 80 }],
      ]);
      // Currently at [1-20], shifting to [20-80]
      deps.session.inPoint = 1;
      deps.session.outPoint = 20;
      deps.session.currentFrame = 5;

      const result = service.shiftRangeToNext();

      expect(result).toEqual({ inPoint: 20, outPoint: 80 });
      // Verify atomic setInOutRange is called (not separate setInPoint/setOutPoint)
      expect(deps.session.setInOutRange).toHaveBeenCalledWith(20, 80);
      expect(deps.session.setInPoint).not.toHaveBeenCalled();
      expect(deps.session.setOutPoint).not.toHaveBeenCalled();
    });

    it('RS-017: duration marker endFrame is clamped to source duration', () => {
      deps.session.currentSource = { duration: 50 };
      deps.session.marks = new Map([[20, { frame: 20, endFrame: 200 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      // Boundaries: [1, 20, 50] -> segments: [1-20], [20-50]
      const result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 20, outPoint: 50 });
    });

    it('RS-018: emits rangeShifted event after shift', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      service.shiftRangeToNext();

      expect(deps.session.emitRangeShifted).toHaveBeenCalledWith(50, 100);
    });

    it('RS-019: multiple forward shifts cycle through all segments', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [25, { frame: 25 }],
        [50, { frame: 50 }],
        [75, { frame: 75 }],
      ]);

      // Segments: [1-25], [25-50], [50-75], [75-100]
      // Start at first segment
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      let result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 25, outPoint: 50 });

      // Simulate the state change from the shift
      deps.session.inPoint = 25;
      deps.session.currentFrame = 25;

      result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 50, outPoint: 75 });

      deps.session.inPoint = 50;
      deps.session.currentFrame = 50;

      result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 75, outPoint: 100 });

      // Wrap around in loop mode
      deps.session.inPoint = 75;
      deps.session.currentFrame = 75;

      result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 1, outPoint: 25 });
    });

    it('RS-020: returns null for single segment (only start and end boundaries)', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map();

      const result = service.shiftRangeToNext();
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // shiftRangeToPrevious
  // -----------------------------------------------------------------------

  describe('shiftRangeToPrevious', () => {
    it('RS-004: shifts to previous mark pair', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [25, { frame: 25 }],
        [50, { frame: 50 }],
        [75, { frame: 75 }],
      ]);
      deps.session.inPoint = 50;
      deps.session.currentFrame = 60;

      const result = service.shiftRangeToPrevious();

      expect(result).toEqual({ inPoint: 25, outPoint: 50 });
      expect(deps.session.setInOutRange).toHaveBeenCalledWith(25, 50);
      expect(deps.session.goToFrame).toHaveBeenCalledWith(25);
    });

    it('RS-005: wraps around in loop mode', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 25;
      deps.session.loopMode = 'loop';

      const result = service.shiftRangeToPrevious();

      expect(result).toEqual({ inPoint: 50, outPoint: 100 });
    });

    it('RS-006: does not wrap in once mode', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 25;
      deps.session.loopMode = 'once';

      const result = service.shiftRangeToPrevious();

      expect(result).toBeNull();
      expect(deps.session.setInOutRange).not.toHaveBeenCalled();
    });

    it('RS-021: previous from middle segment goes to correct segment', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [25, { frame: 25 }],
        [50, { frame: 50 }],
        [75, { frame: 75 }],
      ]);
      // Currently at third segment [50-75]
      deps.session.inPoint = 50;
      deps.session.currentFrame = 60;

      const result = service.shiftRangeToPrevious();
      expect(result).toEqual({ inPoint: 25, outPoint: 50 });
    });

    it('RS-022: multiple backward shifts cycle through all segments', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [25, { frame: 25 }],
        [50, { frame: 50 }],
        [75, { frame: 75 }],
      ]);
      deps.session.loopMode = 'loop';

      // Start at last segment
      deps.session.inPoint = 75;
      deps.session.currentFrame = 80;

      let result = service.shiftRangeToPrevious();
      expect(result).toEqual({ inPoint: 50, outPoint: 75 });

      deps.session.inPoint = 50;
      deps.session.currentFrame = 50;

      result = service.shiftRangeToPrevious();
      expect(result).toEqual({ inPoint: 25, outPoint: 50 });

      deps.session.inPoint = 25;
      deps.session.currentFrame = 25;

      result = service.shiftRangeToPrevious();
      expect(result).toEqual({ inPoint: 1, outPoint: 25 });

      // Wrap around
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      result = service.shiftRangeToPrevious();
      expect(result).toEqual({ inPoint: 75, outPoint: 100 });
    });
  });

  // -----------------------------------------------------------------------
  // Playlist integration
  // -----------------------------------------------------------------------

  describe('playlist integration', () => {
    it('RS-010: playlist boundaries merge with user marks in global frame space', () => {
      deps.session.currentSource = { duration: 200 };
      deps.playlistManager.isEnabled.mockReturnValue(true);
      const clips = [
        makeClip({ id: 'c1', globalStartFrame: 1, duration: 100 }),
        makeClip({ id: 'c2', globalStartFrame: 101, duration: 100 }),
      ];
      deps.playlistManager.getClips.mockReturnValue(clips);
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      // Boundaries: [1, 50, 100, 101, 200]
      // Segments: [1-50], [50-100], [100-101], [101-200]
      const result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 50, outPoint: 100 });
    });

    it('RS-016: user marks add boundaries in single source mode', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [30, { frame: 30 }],
        [70, { frame: 70 }],
      ]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      // Boundaries: [1, 30, 70, 100]
      // Segments: [1-30], [30-70], [70-100]
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 30, 70, 100]);

      const result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 30, outPoint: 70 });
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('RS-023: source with duration 1 returns null', () => {
      deps.session.currentSource = { duration: 1 };
      deps.session.marks = new Map();

      const result = service.shiftRangeToNext();
      expect(result).toBeNull();
    });

    it('RS-024: null currentSource defaults to duration 1', () => {
      deps.session.currentSource = null;
      deps.session.marks = new Map();

      const result = service.shiftRangeToNext();
      expect(result).toBeNull();
    });

    it('RS-025: point marker inside duration marker creates sub-segments', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [10, { frame: 10, endFrame: 50 }],
        [30, { frame: 30 }],
      ]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      // Boundaries: [1, 10, 30, 50, 100]
      // Segments: [1-10], [10-30], [30-50], [50-100]
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 10, 30, 50, 100]);

      const result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 10, outPoint: 30 });
    });

    it('RS-026: shift does not pause playback (no pause call)', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      service.shiftRangeToNext();

      // Verify pause was not called (playback continues)
      // The mock session does not have a pause method, confirming
      // the service does not attempt to pause
      expect(deps.session.setInOutRange).toHaveBeenCalled();
      expect(deps.session.goToFrame).toHaveBeenCalled();
    });

    it('RS-027: two segments with same boundaries deduplicated', () => {
      deps.session.currentSource = { duration: 100 };
      // Mark at same frame as start boundary (1) and end boundary (100)
      deps.session.marks = new Map([
        [1, { frame: 1 }],
        [100, { frame: 100 }],
        [50, { frame: 50 }],
      ]);

      // Boundaries after dedup: [1, 50, 100]
      const boundaries = service.collectRangeBoundaries();
      expect(boundaries).toEqual([1, 50, 100]);
    });

    it('RS-028: shift from current frame that does not match any segment falls back to first', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([[50, { frame: 50 }]]);
      deps.session.inPoint = 200; // beyond duration
      deps.session.currentFrame = 200;

      // Should default to segment index 0 and shift to next
      const result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 50, outPoint: 100 });
    });

    it('RS-029: marks at exactly frame 1 and frame duration are handled', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [1, { frame: 1 }],
        [100, { frame: 100 }],
        [50, { frame: 50 }],
      ]);
      deps.session.inPoint = 1;
      deps.session.currentFrame = 1;

      // Boundaries: [1, 50, 100]
      // Segments: [1-50], [50-100]
      const result = service.shiftRangeToNext();
      expect(result).toEqual({ inPoint: 50, outPoint: 100 });
    });

    it('RS-030: shifting next then previous returns to original segment', () => {
      deps.session.currentSource = { duration: 100 };
      deps.session.marks = new Map([
        [25, { frame: 25 }],
        [50, { frame: 50 }],
        [75, { frame: 75 }],
      ]);
      deps.session.inPoint = 25;
      deps.session.currentFrame = 30;

      // Shift forward from [25-50]
      const next = service.shiftRangeToNext();
      expect(next).toEqual({ inPoint: 50, outPoint: 75 });

      // Simulate the state change
      deps.session.inPoint = 50;
      deps.session.currentFrame = 50;

      // Shift back
      const prev = service.shiftRangeToPrevious();
      expect(prev).toEqual({ inPoint: 25, outPoint: 50 });
    });
  });
});
