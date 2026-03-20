/**
 * SequenceAPI - Unit Tests
 *
 * Verifies that the public sequence API correctly delegates to
 * SequenceLoader utilities via the active session source.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from '../utils/EventEmitter';
import { SequenceAPI } from './SequenceAPI';
import type { SequenceInfo, SequenceFrame } from '../utils/media/SequenceLoader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFrame(index: number, frameNumber: number): SequenceFrame {
  return {
    index,
    frameNumber,
    file: new File([], `frame_${String(frameNumber).padStart(4, '0')}.png`),
  };
}

function createMockSequenceInfo(overrides?: Partial<SequenceInfo>): SequenceInfo {
  // Default: frames 1-5 with frame 3 missing
  const frames = [1, 2, 4, 5].map((n, i) => createMockFrame(i, n));
  return {
    name: 'frame',
    pattern: 'frame_####.png',
    frames,
    startFrame: 1,
    endFrame: 5,
    width: 1920,
    height: 1080,
    fps: 24,
    missingFrames: [3],
    ...overrides,
  };
}

function createMockSession(sequenceInfo?: SequenceInfo | null) {
  const session = new EventEmitter() as any;
  session._currentSource =
    sequenceInfo === null
      ? null
      : sequenceInfo !== undefined
        ? {
            name: 'test-seq',
            type: 'sequence',
            width: 1920,
            height: 1080,
            duration: 4,
            fps: 24,
            sequenceInfo,
          }
        : null;

  Object.defineProperty(session, 'currentSource', {
    get: () => session._currentSource,
    configurable: true,
  });

  return session;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SequenceAPI', () => {
  describe('when no source is loaded', () => {
    let api: SequenceAPI;

    beforeEach(() => {
      api = new SequenceAPI(createMockSession(null));
    });

    it('detectMissingFrames() returns empty array', () => {
      expect(api.detectMissingFrames()).toEqual([]);
    });

    it('isFrameMissing() returns false', () => {
      expect(api.isFrameMissing(3)).toBe(false);
    });

    it('isSequence() returns false', () => {
      expect(api.isSequence()).toBe(false);
    });

    it('getPattern() returns null', () => {
      expect(api.getPattern()).toBeNull();
    });

    it('getFrameRange() returns null', () => {
      expect(api.getFrameRange()).toBeNull();
    });
  });

  describe('when source is a non-sequence (video)', () => {
    let api: SequenceAPI;

    beforeEach(() => {
      const session = new EventEmitter() as any;
      session._currentSource = {
        name: 'clip.mp4',
        type: 'video',
        width: 1920,
        height: 1080,
        duration: 100,
        fps: 24,
        // no sequenceInfo
      };
      Object.defineProperty(session, 'currentSource', {
        get: () => session._currentSource,
        configurable: true,
      });
      api = new SequenceAPI(session);
    });

    it('detectMissingFrames() returns empty array', () => {
      expect(api.detectMissingFrames()).toEqual([]);
    });

    it('isFrameMissing() returns false', () => {
      expect(api.isFrameMissing(1)).toBe(false);
    });

    it('isSequence() returns false', () => {
      expect(api.isSequence()).toBe(false);
    });
  });

  describe('when source is a sequence with missing frames', () => {
    let api: SequenceAPI;
    let seqInfo: SequenceInfo;

    beforeEach(() => {
      seqInfo = createMockSequenceInfo();
      api = new SequenceAPI(createMockSession(seqInfo));
    });

    it('detectMissingFrames() returns the missing frame numbers', () => {
      expect(api.detectMissingFrames()).toEqual([3]);
    });

    it('isFrameMissing() returns true for a missing frame', () => {
      expect(api.isFrameMissing(3)).toBe(true);
    });

    it('isFrameMissing() returns false for a present frame', () => {
      expect(api.isFrameMissing(1)).toBe(false);
      expect(api.isFrameMissing(2)).toBe(false);
      expect(api.isFrameMissing(4)).toBe(false);
      expect(api.isFrameMissing(5)).toBe(false);
    });

    it('isFrameMissing() returns false for out-of-range frames', () => {
      expect(api.isFrameMissing(0)).toBe(false);
      expect(api.isFrameMissing(99)).toBe(false);
    });

    it('isSequence() returns true', () => {
      expect(api.isSequence()).toBe(true);
    });

    it('getPattern() returns the pattern string', () => {
      expect(api.getPattern()).toBe('frame_####.png');
    });

    it('getFrameRange() returns start and end', () => {
      expect(api.getFrameRange()).toEqual({ start: 1, end: 5 });
    });
  });

  describe('when source is a complete sequence (no missing frames)', () => {
    let api: SequenceAPI;

    beforeEach(() => {
      const frames = [1, 2, 3, 4, 5].map((n, i) => createMockFrame(i, n));
      const seqInfo = createMockSequenceInfo({
        frames,
        missingFrames: [],
      });
      api = new SequenceAPI(createMockSession(seqInfo));
    });

    it('detectMissingFrames() returns empty array', () => {
      expect(api.detectMissingFrames()).toEqual([]);
    });

    it('isFrameMissing() returns false for all frames', () => {
      for (let i = 1; i <= 5; i++) {
        expect(api.isFrameMissing(i)).toBe(false);
      }
    });
  });
});
