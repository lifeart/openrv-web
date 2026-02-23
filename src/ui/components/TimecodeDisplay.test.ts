/**
 * TimecodeDisplay Component Tests
 *
 * Tests for the timecode display with SMPTE format and frame counter.
 */

import { describe, it, expect } from 'vitest';
import { frameToTimecode, formatTimecode } from './TimecodeDisplay';

describe('frameToTimecode', () => {
  describe('non-drop-frame timecode (24fps)', () => {
    const fps = 24;

    it('TC-U001: frame 1 returns 00:00:00:00', () => {
      const tc = frameToTimecode(1, fps);
      expect(tc.hours).toBe(0);
      expect(tc.minutes).toBe(0);
      expect(tc.seconds).toBe(0);
      expect(tc.frames).toBe(0);
      expect(tc.dropFrame).toBe(false);
    });

    it('TC-U002: frame 25 returns 00:00:01:00', () => {
      const tc = frameToTimecode(25, fps);
      expect(tc.hours).toBe(0);
      expect(tc.minutes).toBe(0);
      expect(tc.seconds).toBe(1);
      expect(tc.frames).toBe(0);
    });

    it('TC-U003: frame 1441 returns 00:01:00:00 (24*60+1)', () => {
      const tc = frameToTimecode(1441, fps); // 24*60 + 1 = 1441
      expect(tc.hours).toBe(0);
      expect(tc.minutes).toBe(1);
      expect(tc.seconds).toBe(0);
      expect(tc.frames).toBe(0);
    });

    it('TC-U004: frame 86401 returns 01:00:00:00 (24*60*60+1)', () => {
      const tc = frameToTimecode(86401, fps); // 24*3600 + 1 = 86401
      expect(tc.hours).toBe(1);
      expect(tc.minutes).toBe(0);
      expect(tc.seconds).toBe(0);
      expect(tc.frames).toBe(0);
    });

    it('TC-U005: frame 12 returns 00:00:00:11 (0-based frames)', () => {
      const tc = frameToTimecode(12, fps);
      expect(tc.frames).toBe(11);
    });
  });

  describe('non-drop-frame timecode (25fps)', () => {
    const fps = 25;

    it('TC-U010: frame 26 returns 00:00:01:00', () => {
      const tc = frameToTimecode(26, fps);
      expect(tc.seconds).toBe(1);
      expect(tc.frames).toBe(0);
      expect(tc.dropFrame).toBe(false);
    });

    it('TC-U011: frame 1501 returns 00:01:00:00', () => {
      const tc = frameToTimecode(1501, fps); // 25*60 + 1
      expect(tc.minutes).toBe(1);
      expect(tc.seconds).toBe(0);
    });
  });

  describe('non-drop-frame timecode (30fps)', () => {
    const fps = 30;

    it('TC-U020: frame 31 returns 00:00:01:00', () => {
      const tc = frameToTimecode(31, fps);
      expect(tc.seconds).toBe(1);
      expect(tc.frames).toBe(0);
      expect(tc.dropFrame).toBe(false);
    });

    it('TC-U021: frame 1801 returns 00:01:00:00', () => {
      const tc = frameToTimecode(1801, fps); // 30*60 + 1
      expect(tc.minutes).toBe(1);
      expect(tc.seconds).toBe(0);
    });
  });

  describe('drop-frame timecode (29.97fps)', () => {
    const fps = 29.97;

    it('TC-U030: frame 1 is drop-frame', () => {
      const tc = frameToTimecode(1, fps);
      expect(tc.dropFrame).toBe(true);
    });

    it('TC-U031: frame 1 returns 00:00:00:00', () => {
      const tc = frameToTimecode(1, fps);
      expect(tc.hours).toBe(0);
      expect(tc.minutes).toBe(0);
      expect(tc.seconds).toBe(0);
      expect(tc.frames).toBe(0);
    });

    it('TC-U032: basic frame calculation works', () => {
      const tc = frameToTimecode(30, fps);
      expect(tc.seconds).toBeGreaterThanOrEqual(0);
      expect(tc.dropFrame).toBe(true);
    });
  });

  describe('drop-frame timecode (59.94fps)', () => {
    const fps = 59.94;

    it('TC-U040: frame 1 is drop-frame', () => {
      const tc = frameToTimecode(1, fps);
      expect(tc.dropFrame).toBe(true);
    });

    it('TC-U041: basic frame calculation works', () => {
      const tc = frameToTimecode(60, fps);
      expect(tc.seconds).toBeGreaterThanOrEqual(0);
      expect(tc.dropFrame).toBe(true);
    });
  });

  describe('startFrame offset', () => {
    const fps = 24;

    it('TC-U050: startFrame offset is added to calculation', () => {
      // Frame 1 with startFrame 24 should be second 1
      const tc = frameToTimecode(1, fps, 24);
      expect(tc.seconds).toBe(1);
    });

    it('TC-U051: startFrame of 0 has no effect', () => {
      const tc1 = frameToTimecode(100, fps, 0);
      const tc2 = frameToTimecode(100, fps);
      expect(tc1).toEqual(tc2);
    });

    it('TC-U052: startFrame can represent hours', () => {
      // Frame 1 with startFrame 86400 (24*3600) should be hour 1
      const tc = frameToTimecode(1, fps, 86400);
      expect(tc.hours).toBe(1);
    });
  });
});

describe('formatTimecode', () => {
  describe('non-drop-frame format', () => {
    it('TC-U060: formats with colons for non-drop-frame', () => {
      const tc = { hours: 0, minutes: 0, seconds: 0, frames: 0, dropFrame: false };
      expect(formatTimecode(tc)).toBe('00:00:00:00');
    });

    it('TC-U061: pads single digits', () => {
      const tc = { hours: 1, minutes: 2, seconds: 3, frames: 4, dropFrame: false };
      expect(formatTimecode(tc)).toBe('01:02:03:04');
    });

    it('TC-U062: handles double digit values', () => {
      const tc = { hours: 12, minutes: 34, seconds: 56, frames: 12, dropFrame: false };
      expect(formatTimecode(tc)).toBe('12:34:56:12');
    });
  });

  describe('drop-frame format', () => {
    it('TC-U070: formats with semicolon before frames for drop-frame', () => {
      const tc = { hours: 0, minutes: 0, seconds: 0, frames: 0, dropFrame: true };
      expect(formatTimecode(tc)).toBe('00:00:00;00');
    });

    it('TC-U071: only last separator is semicolon', () => {
      const tc = { hours: 1, minutes: 2, seconds: 3, frames: 4, dropFrame: true };
      expect(formatTimecode(tc)).toBe('01:02:03;04');
    });

    it('TC-U072: all other colons remain', () => {
      const formatted = formatTimecode({ hours: 0, minutes: 0, seconds: 0, frames: 0, dropFrame: true });
      const parts = formatted.split(':');
      // Should have 3 parts with ":" separator (HH, MM, SS;FF)
      expect(parts.length).toBe(3);
    });
  });
});

describe('isDropFrame detection', () => {
  it('TC-U080: 24fps is not drop-frame', () => {
    const tc = frameToTimecode(1, 24);
    expect(tc.dropFrame).toBe(false);
  });

  it('TC-U081: 25fps is not drop-frame', () => {
    const tc = frameToTimecode(1, 25);
    expect(tc.dropFrame).toBe(false);
  });

  it('TC-U082: 30fps is not drop-frame', () => {
    const tc = frameToTimecode(1, 30);
    expect(tc.dropFrame).toBe(false);
  });

  it('TC-U083: 29.97fps is drop-frame', () => {
    const tc = frameToTimecode(1, 29.97);
    expect(tc.dropFrame).toBe(true);
  });

  it('TC-U084: 59.94fps is drop-frame', () => {
    const tc = frameToTimecode(1, 59.94);
    expect(tc.dropFrame).toBe(true);
  });

  it('TC-U085: 60fps is not drop-frame', () => {
    const tc = frameToTimecode(1, 60);
    expect(tc.dropFrame).toBe(false);
  });
});

describe('edge cases', () => {
  it('TC-U090: frame 0 produces 00:00:00:00', () => {
    // Frame 0 is clamped to totalFrame=0 (not -1), producing 00:00:00:00
    const tc = frameToTimecode(0, 24);
    expect(tc.hours).toBe(0);
    expect(tc.minutes).toBe(0);
    expect(tc.seconds).toBe(0);
    expect(tc.frames).toBe(0);
    expect(formatTimecode(tc)).toBe('00:00:00:00');
  });

  it('TC-U091: very high frame numbers work', () => {
    // 100 hours worth of frames at 24fps
    const tc = frameToTimecode(24 * 3600 * 100 + 1, 24);
    expect(tc.hours).toBe(100);
  });

  it('TC-U092: fractional fps rounds properly', () => {
    // 23.976 fps (common for film)
    const tc = frameToTimecode(25, 23.976);
    expect(tc.dropFrame).toBe(false);
    expect(tc.seconds).toBe(1);
  });
});
