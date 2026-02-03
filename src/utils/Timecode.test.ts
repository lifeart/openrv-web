/**
 * Timecode Utility Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { formatTimecode, formatFrameDisplay, TimecodeDisplayMode } from './Timecode';

describe('formatTimecode', () => {
  describe('basic conversions at 24fps', () => {
    const fps = 24;

    it('TC-U001: frame 1 should be 00:00:00:00', () => {
      expect(formatTimecode(1, fps)).toBe('00:00:00:00');
    });

    it('TC-U002: frame 2 should be 00:00:00:01', () => {
      expect(formatTimecode(2, fps)).toBe('00:00:00:01');
    });

    it('TC-U003: frame 24 should be 00:00:00:23', () => {
      expect(formatTimecode(24, fps)).toBe('00:00:00:23');
    });

    it('TC-U004: frame 25 should be 00:00:01:00 (start of second 1)', () => {
      expect(formatTimecode(25, fps)).toBe('00:00:01:00');
    });

    it('TC-U005: frame 49 should be 00:00:02:00', () => {
      expect(formatTimecode(49, fps)).toBe('00:00:02:00');
    });

    it('TC-U006: one minute (frame 1441) should be 00:01:00:00', () => {
      // 60 seconds * 24 frames + 1 (1-based) = 1441
      expect(formatTimecode(1441, fps)).toBe('00:01:00:00');
    });

    it('TC-U007: one hour (frame 86401) should be 01:00:00:00', () => {
      // 3600 seconds * 24 frames + 1 (1-based) = 86401
      expect(formatTimecode(86401, fps)).toBe('01:00:00:00');
    });
  });

  describe('conversions at 25fps', () => {
    const fps = 25;

    it('TC-U008: frame 1 should be 00:00:00:00', () => {
      expect(formatTimecode(1, fps)).toBe('00:00:00:00');
    });

    it('TC-U009: frame 26 should be 00:00:01:00', () => {
      expect(formatTimecode(26, fps)).toBe('00:00:01:00');
    });

    it('TC-U010: frame 1501 should be 00:01:00:00', () => {
      // 60 * 25 + 1 = 1501
      expect(formatTimecode(1501, fps)).toBe('00:01:00:00');
    });
  });

  describe('conversions at 30fps', () => {
    const fps = 30;

    it('TC-U011: frame 1 should be 00:00:00:00', () => {
      expect(formatTimecode(1, fps)).toBe('00:00:00:00');
    });

    it('TC-U012: frame 31 should be 00:00:01:00', () => {
      expect(formatTimecode(31, fps)).toBe('00:00:01:00');
    });

    it('TC-U013: frame 1801 should be 00:01:00:00', () => {
      // 60 * 30 + 1 = 1801
      expect(formatTimecode(1801, fps)).toBe('00:01:00:00');
    });
  });

  describe('fractional fps rounding', () => {
    it('TC-U014: 23.976fps rounds to 24fps for timecode', () => {
      // Frame 25 at rounded 24fps = 00:00:01:00
      expect(formatTimecode(25, 23.976)).toBe('00:00:01:00');
    });

    it('TC-U015: 29.97fps rounds to 30fps for timecode', () => {
      // Frame 31 at rounded 30fps = 00:00:01:00
      expect(formatTimecode(31, 29.97)).toBe('00:00:01:00');
    });
  });

  describe('edge cases', () => {
    it('TC-U016: frame 0 should clamp to 00:00:00:00', () => {
      expect(formatTimecode(0, 24)).toBe('00:00:00:00');
    });

    it('TC-U017: negative frame should clamp to 00:00:00:00', () => {
      expect(formatTimecode(-5, 24)).toBe('00:00:00:00');
    });

    it('TC-U018: fps of 0 returns 00:00:00:00', () => {
      expect(formatTimecode(100, 0)).toBe('00:00:00:00');
    });

    it('TC-U019: negative fps returns 00:00:00:00', () => {
      expect(formatTimecode(100, -24)).toBe('00:00:00:00');
    });

    it('TC-U020: very large frame number', () => {
      // 10 hours at 24fps = 864000 frames, frame 864001
      expect(formatTimecode(864001, 24)).toBe('10:00:00:00');
    });

    it('TC-U021: fractional frame is floored', () => {
      // frame 2.7 -> floor(2.7) = 2 -> 0-based = 1 -> 00:00:00:01
      expect(formatTimecode(2.7, 24)).toBe('00:00:00:01');
    });

    it('TC-U022: fps of 1', () => {
      expect(formatTimecode(1, 1)).toBe('00:00:00:00');
      expect(formatTimecode(2, 1)).toBe('00:00:01:00');
      expect(formatTimecode(61, 1)).toBe('00:01:00:00');
    });

    it('TC-U025: NaN fps returns 00:00:00:00', () => {
      expect(formatTimecode(100, NaN)).toBe('00:00:00:00');
    });

    it('TC-U026: Infinity fps returns 00:00:00:00', () => {
      expect(formatTimecode(100, Infinity)).toBe('00:00:00:00');
    });

    it('TC-U027: -Infinity fps returns 00:00:00:00', () => {
      expect(formatTimecode(100, -Infinity)).toBe('00:00:00:00');
    });

    it('TC-U028: NaN frame returns 00:00:00:00', () => {
      expect(formatTimecode(NaN, 24)).toBe('00:00:00:00');
    });

    it('TC-U029: Infinity frame returns valid timecode (not NaN)', () => {
      expect(formatTimecode(Infinity, 24)).toBe('00:00:00:00');
    });

    it('TC-U030a: -Infinity frame returns 00:00:00:00', () => {
      expect(formatTimecode(-Infinity, 24)).toBe('00:00:00:00');
    });

    it('TC-U031a: both NaN frame and fps returns 00:00:00:00', () => {
      expect(formatTimecode(NaN, NaN)).toBe('00:00:00:00');
    });

    it('TC-U032a: very small positive fps (e.g. 0.3) rounds to 0 then clamps to 1', () => {
      // Math.round(0.3) = 0, Math.max(1, 0) = 1
      expect(formatTimecode(2, 0.3)).toBe('00:00:01:00');
    });
  });

  describe('complex timecodes', () => {
    it('TC-U023: 1h 23m 45s 12f at 24fps', () => {
      // (1*3600 + 23*60 + 45) * 24 + 12 + 1 = 5025 * 24 + 12 + 1 = 120600 + 12 + 1 = 120613
      const frame = (1 * 3600 + 23 * 60 + 45) * 24 + 12 + 1;
      expect(formatTimecode(frame, 24)).toBe('01:23:45:12');
    });

    it('TC-U024: 00:00:59:23 at 24fps (last frame of first minute)', () => {
      // 59 * 24 + 23 + 1 = 1416 + 23 + 1 = 1440
      expect(formatTimecode(1440, 24)).toBe('00:00:59:23');
    });
  });
});

describe('formatFrameDisplay', () => {
  it('TC-U030: frames mode shows "Frame N"', () => {
    expect(formatFrameDisplay(42, 24, 'frames')).toBe('Frame 42');
  });

  it('TC-U031: timecode mode shows SMPTE format', () => {
    expect(formatFrameDisplay(25, 24, 'timecode')).toBe('00:00:01:00');
  });

  it('TC-U032: timecode mode with frame 1', () => {
    expect(formatFrameDisplay(1, 24, 'timecode')).toBe('00:00:00:00');
  });

  it('TC-U033: frames mode with frame 1', () => {
    expect(formatFrameDisplay(1, 24, 'frames')).toBe('Frame 1');
  });

  it('TC-U034: timecode mode with NaN fps returns 00:00:00:00', () => {
    expect(formatFrameDisplay(10, NaN, 'timecode')).toBe('00:00:00:00');
  });

  it('TC-U035: timecode mode with NaN frame returns 00:00:00:00', () => {
    expect(formatFrameDisplay(NaN, 24, 'timecode')).toBe('00:00:00:00');
  });

  it('TC-U036: frames mode with NaN frame shows "Frame NaN"', () => {
    // In frames mode, we just format the number directly
    expect(formatFrameDisplay(NaN, 24, 'frames')).toBe('Frame NaN');
  });
});
