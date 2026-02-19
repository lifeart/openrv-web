/**
 * Extended Timecode Utility Tests
 *
 * Tests for new display modes: 'seconds', 'footage'
 * and the helper functions: getAllDisplayModes, getNextDisplayMode, getDisplayModeLabel
 */
import { describe, it, expect } from 'vitest';
import {
  formatSeconds,
  formatFootage,
  formatFrameDisplay,
  getAllDisplayModes,
  getNextDisplayMode,
  getDisplayModeLabel,
  TimecodeDisplayMode,
} from './Timecode';

// ---------------------------------------------------------------------------
// formatSeconds
// ---------------------------------------------------------------------------
describe('formatSeconds', () => {
  it('TCS-001: frame 1 at 24fps = 0.000s', () => {
    expect(formatSeconds(1, 24)).toBe('0.000s');
  });

  it('TCS-002: frame 25 at 24fps = 1.000s', () => {
    expect(formatSeconds(25, 24)).toBe('1.000s');
  });

  it('TCS-003: frame 13 at 24fps = 0.500s', () => {
    expect(formatSeconds(13, 24)).toBe('0.500s');
  });

  it('TCS-004: frame 49 at 24fps = 2.000s', () => {
    expect(formatSeconds(49, 24)).toBe('2.000s');
  });

  it('TCS-005: frame 1 at 30fps = 0.000s', () => {
    expect(formatSeconds(1, 30)).toBe('0.000s');
  });

  it('TCS-006: frame 31 at 30fps = 1.000s', () => {
    expect(formatSeconds(31, 30)).toBe('1.000s');
  });

  it('TCS-007: frame 7 at 24fps shows fractional', () => {
    // (7-1)/24 = 6/24 = 0.25
    expect(formatSeconds(7, 24)).toBe('0.250s');
  });

  it('TCS-008: large frame number', () => {
    // frame 86401 at 24fps = 86400/24 = 3600s = 1 hour
    expect(formatSeconds(86401, 24)).toBe('3600.000s');
  });

  it('TCS-010: NaN fps returns 0.000s', () => {
    expect(formatSeconds(10, NaN)).toBe('0.000s');
  });

  it('TCS-011: zero fps returns 0.000s', () => {
    expect(formatSeconds(10, 0)).toBe('0.000s');
  });

  it('TCS-012: negative fps returns 0.000s', () => {
    expect(formatSeconds(10, -24)).toBe('0.000s');
  });

  it('TCS-013: NaN frame returns 0.000s', () => {
    expect(formatSeconds(NaN, 24)).toBe('0.000s');
  });

  it('TCS-014: Infinity frame returns 0.000s', () => {
    expect(formatSeconds(Infinity, 24)).toBe('0.000s');
  });

  it('TCS-015: negative frame clamps to 0.000s', () => {
    expect(formatSeconds(-5, 24)).toBe('0.000s');
  });

  it('TCS-016: frame 0 clamps to 0.000s', () => {
    expect(formatSeconds(0, 24)).toBe('0.000s');
  });
});

// ---------------------------------------------------------------------------
// formatFootage
// ---------------------------------------------------------------------------
describe('formatFootage', () => {
  it('TCF-001: frame 1 = 0+00', () => {
    expect(formatFootage(1, 24)).toBe('0+00');
  });

  it('TCF-002: frame 2 = 0+01', () => {
    expect(formatFootage(2, 24)).toBe('0+01');
  });

  it('TCF-003: frame 16 = 0+15 (last frame of first foot)', () => {
    expect(formatFootage(16, 24)).toBe('0+15');
  });

  it('TCF-004: frame 17 = 1+00 (start of second foot)', () => {
    expect(formatFootage(17, 24)).toBe('1+00');
  });

  it('TCF-005: frame 33 = 2+00', () => {
    expect(formatFootage(33, 24)).toBe('2+00');
  });

  it('TCF-006: frame 25 = 1+08', () => {
    // 0-based: 24, 24/16 = 1 foot, 24%16 = 8 frames
    expect(formatFootage(25, 24)).toBe('1+08');
  });

  it('TCF-007: large frame number', () => {
    // frame 161 = 0-based 160, 160/16 = 10 feet, 160%16 = 0
    expect(formatFootage(161, 24)).toBe('10+00');
  });

  it('TCF-008: fps is ignored (footage is film-based)', () => {
    // Should produce same result regardless of fps
    expect(formatFootage(25, 24)).toBe(formatFootage(25, 30));
  });

  it('TCF-010: NaN frame returns 0+00', () => {
    expect(formatFootage(NaN, 24)).toBe('0+00');
  });

  it('TCF-011: Infinity frame returns 0+00', () => {
    expect(formatFootage(Infinity, 24)).toBe('0+00');
  });

  it('TCF-012: negative frame clamps to 0+00', () => {
    expect(formatFootage(-5, 24)).toBe('0+00');
  });

  it('TCF-013: frame 0 clamps to 0+00', () => {
    expect(formatFootage(0, 24)).toBe('0+00');
  });

  it('TCF-014: fractional frame is floored', () => {
    // frame 2.9 -> floor(2.9) = 2 -> 0-based = 1 -> 0+01
    expect(formatFootage(2.9, 24)).toBe('0+01');
  });
});

// ---------------------------------------------------------------------------
// formatFrameDisplay (extended modes)
// ---------------------------------------------------------------------------
describe('formatFrameDisplay with new modes', () => {
  it('TCD-001: seconds mode', () => {
    expect(formatFrameDisplay(25, 24, 'seconds')).toBe('1.000s');
  });

  it('TCD-002: footage mode', () => {
    expect(formatFrameDisplay(17, 24, 'footage')).toBe('1+00');
  });

  it('TCD-003: frames mode still works', () => {
    expect(formatFrameDisplay(42, 24, 'frames')).toBe('Frame 42');
  });

  it('TCD-004: timecode mode still works', () => {
    expect(formatFrameDisplay(25, 24, 'timecode')).toBe('00:00:01:00');
  });
});

// ---------------------------------------------------------------------------
// getAllDisplayModes
// ---------------------------------------------------------------------------
describe('getAllDisplayModes', () => {
  it('TCM-001: returns all four modes', () => {
    const modes = getAllDisplayModes();
    expect(modes).toEqual(['frames', 'timecode', 'seconds', 'footage']);
  });

  it('TCM-002: returns a new array each time', () => {
    const m1 = getAllDisplayModes();
    const m2 = getAllDisplayModes();
    expect(m1).toEqual(m2);
    expect(m1).not.toBe(m2);
  });
});

// ---------------------------------------------------------------------------
// getNextDisplayMode
// ---------------------------------------------------------------------------
describe('getNextDisplayMode', () => {
  it('TCN-001: frames -> timecode', () => {
    expect(getNextDisplayMode('frames')).toBe('timecode');
  });

  it('TCN-002: timecode -> seconds', () => {
    expect(getNextDisplayMode('timecode')).toBe('seconds');
  });

  it('TCN-003: seconds -> footage', () => {
    expect(getNextDisplayMode('seconds')).toBe('footage');
  });

  it('TCN-004: footage -> frames (wraps around)', () => {
    expect(getNextDisplayMode('footage')).toBe('frames');
  });

  it('TCN-005: full cycle returns to start', () => {
    let mode: TimecodeDisplayMode = 'frames';
    mode = getNextDisplayMode(mode);
    expect(mode).toBe('timecode');
    mode = getNextDisplayMode(mode);
    expect(mode).toBe('seconds');
    mode = getNextDisplayMode(mode);
    expect(mode).toBe('footage');
    mode = getNextDisplayMode(mode);
    expect(mode).toBe('frames');
  });
});

// ---------------------------------------------------------------------------
// getDisplayModeLabel
// ---------------------------------------------------------------------------
describe('getDisplayModeLabel', () => {
  it('TCL-001: frames -> F#', () => {
    expect(getDisplayModeLabel('frames')).toBe('F#');
  });

  it('TCL-002: timecode -> TC', () => {
    expect(getDisplayModeLabel('timecode')).toBe('TC');
  });

  it('TCL-003: seconds -> SEC', () => {
    expect(getDisplayModeLabel('seconds')).toBe('SEC');
  });

  it('TCL-004: footage -> FT', () => {
    expect(getDisplayModeLabel('footage')).toBe('FT');
  });
});
