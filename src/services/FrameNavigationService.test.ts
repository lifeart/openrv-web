import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FrameNavigationService,
  type FrameNavigationDeps,
  type NavPlaylistClip,
  type NavFrameMapping,
} from './FrameNavigationService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClip(overrides: Partial<NavPlaylistClip> & { id: string; globalStartFrame: number; duration: number }): NavPlaylistClip {
  return {
    inPoint: 1,
    outPoint: overrides.duration,
    ...overrides,
  };
}

function makeMapping(clip: NavPlaylistClip, clipIndex: number, sourceIndex: number, localFrame: number): NavFrameMapping {
  return { clip, clipIndex, sourceIndex, localFrame };
}

// ---------------------------------------------------------------------------
// Lightweight test doubles
// ---------------------------------------------------------------------------

function createMockSession() {
  return {
    currentFrame: 1,
    currentSourceIndex: 0,
    goToFrame: vi.fn(),
    setCurrentSource: vi.fn(),
    setInPoint: vi.fn(),
    setOutPoint: vi.fn(),
    goToNextMarker: vi.fn().mockReturnValue(null),
    goToPreviousMarker: vi.fn().mockReturnValue(null),
  };
}

function createMockPlaylistManager() {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    getClipByIndex: vi.fn().mockReturnValue(null),
    getClipCount: vi.fn().mockReturnValue(0),
    getClipAtFrame: vi.fn().mockReturnValue(null),
    getCurrentFrame: vi.fn().mockReturnValue(1),
    setCurrentFrame: vi.fn(),
    goToNextClip: vi.fn().mockReturnValue(null),
    goToPreviousClip: vi.fn().mockReturnValue(null),
  };
}

function createMockPlaylistPanel() {
  return {
    setActiveClip: vi.fn(),
  };
}

function createMockPaintEngine() {
  return {
    getAnnotatedFrames: vi.fn().mockReturnValue(new Set()),
  };
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

describe('FrameNavigationService', () => {
  let deps: ReturnType<typeof createDeps>;
  let service: FrameNavigationService;

  beforeEach(() => {
    deps = createDeps();
    service = new FrameNavigationService(deps as unknown as FrameNavigationDeps);
  });

  // -----------------------------------------------------------------------
  // goToPlaylistStart
  // -----------------------------------------------------------------------

  describe('goToPlaylistStart', () => {
    it('FN-001: navigates to globalStartFrame of the first clip', () => {
      const clip = makeClip({ id: 'c1', globalStartFrame: 1, duration: 30 });
      deps.playlistManager.getClipByIndex.mockReturnValue(clip);
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(clip, 0, 0, 1)
      );

      service.goToPlaylistStart();

      expect(deps.playlistManager.getClipByIndex).toHaveBeenCalledWith(0);
      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(1);
      expect(deps.session.goToFrame).toHaveBeenCalledWith(1);
    });

    it('FN-002: does nothing when no clips exist', () => {
      deps.playlistManager.getClipByIndex.mockReturnValue(null);

      service.goToPlaylistStart();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // goToPlaylistEnd
  // -----------------------------------------------------------------------

  describe('goToPlaylistEnd', () => {
    it('FN-003: navigates to last frame of the last clip', () => {
      const clip = makeClip({ id: 'c3', globalStartFrame: 61, duration: 30, inPoint: 1, outPoint: 30 });
      deps.playlistManager.getClipCount.mockReturnValue(3);
      deps.playlistManager.getClipByIndex.mockReturnValue(clip);
      // globalStartFrame + duration - 1 = 61 + 30 - 1 = 90
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(clip, 2, 2, 30)
      );

      service.goToPlaylistEnd();

      expect(deps.playlistManager.getClipByIndex).toHaveBeenCalledWith(2);
      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(90);
      expect(deps.session.goToFrame).toHaveBeenCalledWith(30);
    });

    it('FN-004: does nothing when no clips exist', () => {
      deps.playlistManager.getClipCount.mockReturnValue(0);
      deps.playlistManager.getClipByIndex.mockReturnValue(null);

      service.goToPlaylistEnd();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // goToNextMarkOrBoundary
  // -----------------------------------------------------------------------

  describe('goToNextMarkOrBoundary', () => {
    it('FN-005: uses marker if goToNextMarker succeeds', () => {
      deps.session.goToNextMarker.mockReturnValue(42);

      service.goToNextMarkOrBoundary();

      // Should stop after the marker — no playlist navigation
      expect(deps.playlistManager.getClipAtFrame).not.toHaveBeenCalled();
    });

    it('FN-006: falls through to next clip boundary when no marker', () => {
      const currentClip = makeClip({ id: 'c1', globalStartFrame: 1, duration: 30 });
      const nextClip = makeClip({ id: 'c2', globalStartFrame: 31, duration: 20 });

      deps.playlistManager.getCurrentFrame.mockReturnValue(15);
      deps.playlistManager.getClipAtFrame.mockImplementation((frame: number) => {
        if (frame === 15) return makeMapping(currentClip, 0, 0, 15);
        if (frame === 31) return makeMapping(nextClip, 1, 1, 1);
        return null;
      });
      deps.playlistManager.getClipByIndex.mockImplementation((index: number) => {
        if (index === 1) return nextClip;
        return null;
      });

      service.goToNextMarkOrBoundary();

      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(31);
    });

    it('FN-007: does nothing when playlist is disabled and no marker', () => {
      deps.playlistManager.isEnabled.mockReturnValue(false);

      service.goToNextMarkOrBoundary();

      expect(deps.playlistManager.getClipAtFrame).not.toHaveBeenCalled();
    });

    it('FN-008: does nothing when at last clip boundary and no marker', () => {
      const clip = makeClip({ id: 'c1', globalStartFrame: 1, duration: 30 });
      deps.playlistManager.getCurrentFrame.mockReturnValue(15);
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(clip, 0, 0, 15)
      );
      deps.playlistManager.getClipByIndex.mockReturnValue(null); // no next clip

      service.goToNextMarkOrBoundary();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // goToPreviousMarkOrBoundary
  // -----------------------------------------------------------------------

  describe('goToPreviousMarkOrBoundary', () => {
    it('FN-009: uses marker if goToPreviousMarker succeeds', () => {
      deps.session.goToPreviousMarker.mockReturnValue(5);

      service.goToPreviousMarkOrBoundary();

      expect(deps.playlistManager.getClipAtFrame).not.toHaveBeenCalled();
    });

    it('FN-010: goes to start of current clip when mid-clip', () => {
      const clip = makeClip({ id: 'c2', globalStartFrame: 31, duration: 30 });
      deps.playlistManager.getCurrentFrame.mockReturnValue(45);
      deps.playlistManager.getClipAtFrame.mockImplementation((frame: number) => {
        if (frame === 45) return makeMapping(clip, 1, 1, 15);
        if (frame === 31) return makeMapping(clip, 1, 1, 1);
        return null;
      });
      // globalFrame (45) > currentClipStart (31) → targetIndex = clipIndex = 1
      deps.playlistManager.getClipByIndex.mockReturnValue(clip);

      service.goToPreviousMarkOrBoundary();

      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(31);
    });

    it('FN-011: goes to previous clip when at clip start', () => {
      const prevClip = makeClip({ id: 'c1', globalStartFrame: 1, duration: 30 });
      const currentClip = makeClip({ id: 'c2', globalStartFrame: 31, duration: 30 });

      deps.playlistManager.getCurrentFrame.mockReturnValue(31);
      deps.playlistManager.getClipAtFrame.mockImplementation((frame: number) => {
        if (frame === 31) return makeMapping(currentClip, 1, 1, 1);
        if (frame === 1) return makeMapping(prevClip, 0, 0, 1);
        return null;
      });
      // globalFrame (31) === currentClipStart (31) → targetIndex = 1-1 = 0
      deps.playlistManager.getClipByIndex.mockImplementation((index: number) => {
        if (index === 0) return prevClip;
        return null;
      });

      service.goToPreviousMarkOrBoundary();

      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(1);
    });

    it('FN-012: does nothing at first clip start and no marker', () => {
      const clip = makeClip({ id: 'c1', globalStartFrame: 1, duration: 30 });
      deps.playlistManager.getCurrentFrame.mockReturnValue(1);
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(clip, 0, 0, 1)
      );
      // globalFrame (1) === currentClipStart (1) → targetIndex = 0 - 1 = -1 < 0 → bail

      service.goToPreviousMarkOrBoundary();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // goToNextShot
  // -----------------------------------------------------------------------

  describe('goToNextShot', () => {
    it('FN-013: delegates to playlistManager.goToNextClip and jumps', () => {
      const nextClip = makeClip({ id: 'c2', globalStartFrame: 31, duration: 20 });
      deps.playlistManager.getCurrentFrame.mockReturnValue(15);
      deps.playlistManager.goToNextClip.mockReturnValue({ frame: 31, clip: nextClip });
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(nextClip, 1, 1, 1)
      );

      service.goToNextShot();

      expect(deps.playlistManager.goToNextClip).toHaveBeenCalledWith(15);
      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(31);
    });

    it('FN-014: does nothing when goToNextClip returns null', () => {
      deps.playlistManager.getCurrentFrame.mockReturnValue(15);
      deps.playlistManager.goToNextClip.mockReturnValue(null);

      service.goToNextShot();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });

    it('FN-015: does nothing when playlist is disabled', () => {
      deps.playlistManager.isEnabled.mockReturnValue(false);

      service.goToNextShot();

      expect(deps.playlistManager.goToNextClip).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // goToPreviousShot
  // -----------------------------------------------------------------------

  describe('goToPreviousShot', () => {
    it('FN-016: delegates to playlistManager.goToPreviousClip and jumps', () => {
      const prevClip = makeClip({ id: 'c1', globalStartFrame: 1, duration: 30 });
      deps.playlistManager.getCurrentFrame.mockReturnValue(35);
      deps.playlistManager.goToPreviousClip.mockReturnValue({ frame: 1, clip: prevClip });
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(prevClip, 0, 0, 1)
      );

      service.goToPreviousShot();

      expect(deps.playlistManager.goToPreviousClip).toHaveBeenCalledWith(35);
      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(1);
    });

    it('FN-017: does nothing when goToPreviousClip returns null', () => {
      deps.playlistManager.getCurrentFrame.mockReturnValue(5);
      deps.playlistManager.goToPreviousClip.mockReturnValue(null);

      service.goToPreviousShot();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });

    it('FN-018: does nothing when playlist is disabled', () => {
      deps.playlistManager.isEnabled.mockReturnValue(false);

      service.goToPreviousShot();

      expect(deps.playlistManager.goToPreviousClip).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // goToNextAnnotation
  // -----------------------------------------------------------------------

  describe('goToNextAnnotation', () => {
    it('FN-019: navigates to the next annotated frame after current', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set([5, 10, 20]));
      deps.session.currentFrame = 7;

      service.goToNextAnnotation();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(10);
    });

    it('FN-020: wraps to first annotated frame when at end', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set([5, 10, 20]));
      deps.session.currentFrame = 25;

      service.goToNextAnnotation();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
    });

    it('FN-021: does nothing when no annotations exist', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set());

      service.goToNextAnnotation();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });

    it('FN-022: wraps when current frame equals last annotation', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set([5, 10]));
      deps.session.currentFrame = 10;

      service.goToNextAnnotation();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
    });
  });

  // -----------------------------------------------------------------------
  // goToPreviousAnnotation
  // -----------------------------------------------------------------------

  describe('goToPreviousAnnotation', () => {
    it('FN-023: navigates to the previous annotated frame before current', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set([5, 10, 20]));
      deps.session.currentFrame = 15;

      service.goToPreviousAnnotation();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(10);
    });

    it('FN-024: wraps to last annotated frame when at start', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set([5, 10, 20]));
      deps.session.currentFrame = 3;

      service.goToPreviousAnnotation();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(20);
    });

    it('FN-025: does nothing when no annotations exist', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set());

      service.goToPreviousAnnotation();

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
    });

    it('FN-026: wraps when current frame equals first annotation', () => {
      deps.paintEngine.getAnnotatedFrames.mockReturnValue(new Set([5, 10]));
      deps.session.currentFrame = 5;

      service.goToPreviousAnnotation();

      expect(deps.session.goToFrame).toHaveBeenCalledWith(10);
    });
  });

  // -----------------------------------------------------------------------
  // jumpToPlaylistGlobalFrame
  // -----------------------------------------------------------------------

  describe('jumpToPlaylistGlobalFrame', () => {
    it('FN-027: maps global frame to correct source/local frame and updates state', () => {
      const clip = makeClip({ id: 'c2', globalStartFrame: 31, duration: 30, inPoint: 1, outPoint: 30 });
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(clip, 1, 2, 10)
      );
      deps.session.currentSourceIndex = 0; // different from mapping.sourceIndex=2

      service.jumpToPlaylistGlobalFrame(40);

      expect(deps.session.setCurrentSource).toHaveBeenCalledWith(2);
      expect(deps.session.setInPoint).toHaveBeenCalledWith(1);
      expect(deps.session.setOutPoint).toHaveBeenCalledWith(30);
      expect(deps.playlistManager.setCurrentFrame).toHaveBeenCalledWith(40);
      expect(deps.playlistPanel.setActiveClip).toHaveBeenCalledWith('c2');
      expect(deps.session.goToFrame).toHaveBeenCalledWith(10);
    });

    it('FN-028: does not switch source when already on the correct source', () => {
      const clip = makeClip({ id: 'c1', globalStartFrame: 1, duration: 30, inPoint: 1, outPoint: 30 });
      deps.playlistManager.getClipAtFrame.mockReturnValue(
        makeMapping(clip, 0, 0, 5)
      );
      deps.session.currentSourceIndex = 0; // same as mapping.sourceIndex

      service.jumpToPlaylistGlobalFrame(5);

      expect(deps.session.setCurrentSource).not.toHaveBeenCalled();
      expect(deps.session.goToFrame).toHaveBeenCalledWith(5);
    });

    it('FN-029: does nothing when getClipAtFrame returns null', () => {
      deps.playlistManager.getClipAtFrame.mockReturnValue(null);

      service.jumpToPlaylistGlobalFrame(999);

      expect(deps.session.goToFrame).not.toHaveBeenCalled();
      expect(deps.session.setCurrentSource).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // dispose
  // -----------------------------------------------------------------------

  describe('dispose', () => {
    it('FN-030: can be called without error', () => {
      expect(() => service.dispose()).not.toThrow();
    });
  });
});
