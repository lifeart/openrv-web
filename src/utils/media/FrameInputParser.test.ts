import { describe, it, expect } from 'vitest';
import { parseFrameInput, getFormatLabel } from './FrameInputParser';
import { formatTimecode, formatSeconds } from './Timecode';
import { frameToTimecode, formatTimecode as formatTimecodeDisplay } from '../../ui/components/TimecodeDisplay';

// Common test parameters
const FPS_24 = 24;
const FPS_25 = 25;
const FPS_30 = 30;
const FPS_2997 = 29.97;
const FPS_5994 = 59.94;
const CURRENT = 50;
const MIN = 1;
const MAX = 240;

describe('FrameInputParser', () => {
  // =========================================================================
  // Plain frame numbers
  // =========================================================================
  describe('plain frame numbers', () => {
    it('parses "1" as frame 1', () => {
      const result = parseFrameInput('1', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 1, format: 'frame', valid: true });
    });

    it('parses "42" as frame 42', () => {
      const result = parseFrameInput('42', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 42, format: 'frame', valid: true });
    });

    it('parses "240" as last frame', () => {
      const result = parseFrameInput('240', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 240, format: 'frame', valid: true });
    });

    it('rejects "0" as out of range', () => {
      const result = parseFrameInput('0', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.frame).toBe(0);
      expect(result.format).toBe('frame');
      expect(result.error).toContain('outside range');
    });

    it('rejects "999" as out of range', () => {
      const result = parseFrameInput('999', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.frame).toBe(999);
      expect(result.error).toContain('outside range 1-240');
    });

    it('parses large frame number within range', () => {
      const result = parseFrameInput('100', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 100, format: 'frame', valid: true });
    });

    it('parses "001" (leading zeros) as frame 1', () => {
      const result = parseFrameInput('001', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 1, format: 'frame', valid: true });
    });

    it('parses "0042" (leading zeros) as frame 42', () => {
      const result = parseFrameInput('0042', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 42, format: 'frame', valid: true });
    });
  });

  // =========================================================================
  // SMPTE timecode (non-drop-frame)
  // =========================================================================
  describe('SMPTE timecode (NDF)', () => {
    it('parses "00:00:00:00" as frame 1', () => {
      const result = parseFrameInput('00:00:00:00', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1);
      expect(result.format).toBe('timecode');
    });

    it('parses "00:00:00:01" as frame 2 at 24fps', () => {
      const result = parseFrameInput('00:00:00:01', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(2);
    });

    it('parses "00:00:01:00" as frame 25 at 24fps', () => {
      const result = parseFrameInput('00:00:01:00', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(25);
    });

    it('parses "00:01:00:00" at 24fps', () => {
      // 1 minute = 60 * 24 = 1440 frames → frame 1441
      const result = parseFrameInput('00:01:00:00', FPS_24, CURRENT, MIN, 10000);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1441);
    });

    it('parses "00:00:09:23" at 24fps as frame 240', () => {
      // 9 * 24 + 23 = 216 + 23 = 239 → 0-based, so frame = 240
      const result = parseFrameInput('00:00:09:23', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(240);
    });

    it('parses timecode at 25fps', () => {
      // "00:00:01:00" at 25fps → frame 26
      const result = parseFrameInput('00:00:01:00', FPS_25, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(26);
    });

    it('parses timecode at 30fps', () => {
      // "00:00:01:00" at 30fps → frame 31
      const result = parseFrameInput('00:00:01:00', FPS_30, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(31);
    });

    it('rejects frames exceeding fps', () => {
      // At 24fps, frame component must be 0-23
      const result = parseFrameInput('00:00:00:24', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Frames must be 0-23');
    });

    it('rejects minutes > 59', () => {
      const result = parseFrameInput('00:60:00:00', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minutes must be 0-59');
    });

    it('rejects seconds > 59', () => {
      const result = parseFrameInput('00:00:60:00', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Seconds must be 0-59');
    });

    it('parses single-digit hour "1:00:00:00"', () => {
      const result = parseFrameInput('1:00:00:00', FPS_24, CURRENT, MIN, 100000);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(86401);
    });

    it('parses single-digit frame "00:00:00:5"', () => {
      const result = parseFrameInput('00:00:00:5', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(6);
    });

    it('out-of-range timecode returns error', () => {
      const result = parseFrameInput('01:00:00:00', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside range');
    });
  });

  // =========================================================================
  // SMPTE timecode with startFrame offset
  // =========================================================================
  describe('SMPTE timecode with startFrame offset', () => {
    it('start timecode 01:00:00:00 at 24fps resolves correctly', () => {
      // startFrame = 86400 (1 hour at 24fps, 0-based)
      // Typing "01:00:00:00" → 0-based frame 86400, minus startFrame 86400 + 1 = frame 1
      const startFrame = 86400;
      const result = parseFrameInput('01:00:00:00', FPS_24, CURRENT, MIN, MAX, startFrame);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1);
    });

    it('start timecode offset: 01:00:01:00 at 24fps resolves to frame 25', () => {
      const startFrame = 86400;
      const result = parseFrameInput('01:00:01:00', FPS_24, CURRENT, MIN, MAX, startFrame);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(25);
    });

    it('start timecode offset: typing start timecode - 1 frame goes out of range', () => {
      const startFrame = 86400;
      // "00:59:59:23" at 24fps = 86399 → 86399 - 86400 + 1 = 0 (out of range)
      const result = parseFrameInput('00:59:59:23', FPS_24, CURRENT, MIN, MAX, startFrame);
      expect(result.valid).toBe(false);
      expect(result.frame).toBe(0);
    });

    it('startFrame defaults to 0', () => {
      const result = parseFrameInput('00:00:00:00', FPS_24, CURRENT, MIN, MAX);
      expect(result.frame).toBe(1);
    });
  });

  // =========================================================================
  // SMPTE timecode (drop-frame)
  // =========================================================================
  describe('SMPTE timecode (drop-frame)', () => {
    it('parses "00:00:00;00" at 29.97fps', () => {
      const result = parseFrameInput('00:00:00;00', FPS_2997, CURRENT, MIN, 100000);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1);
      expect(result.format).toBe('timecode');
    });

    it('parses "00:01:00;02" at 29.97fps (first valid frame after minute 1)', () => {
      // At 29.97fps drop-frame: frames 0 and 1 are dropped at minute 1
      // So "00:01:00;02" is the first valid frame after the minute boundary
      const result = parseFrameInput('00:01:00;02', FPS_2997, CURRENT, MIN, 100000);
      expect(result.valid).toBe(true);
    });

    it('accepts "dropped" frame numbers at non-10th minute boundaries', () => {
      // The existing frameToTimecode() display code generates these timecodes,
      // so the parser must accept them for round-trip compatibility.
      const result = parseFrameInput('00:01:00;00', FPS_2997, CURRENT, MIN, 100000);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1799);
    });

    it('accepts frame 0 at 10th minute boundary', () => {
      const result = parseFrameInput('00:10:00;00', FPS_2997, CURRENT, MIN, 1000000);
      expect(result.valid).toBe(true);
    });

    it('rejects drop-frame separator with non-DF fps', () => {
      const result = parseFrameInput('00:00:00;00', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('29.97 or 59.94');
    });

    it('parses drop-frame at 59.94fps', () => {
      const result = parseFrameInput('00:00:01;00', FPS_5994, CURRENT, MIN, 100000);
      expect(result.valid).toBe(true);
    });

    it('accepts "dropped" frames 0-3 at non-10th minute for 59.94fps', () => {
      // Parser accepts these for round-trip compatibility with frameToTimecode()
      const result = parseFrameInput('00:01:00;02', FPS_5994, CURRENT, MIN, 100000);
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // Drop-frame round-trip
  // =========================================================================
  describe('drop-frame round-trip', () => {
    it('round-trips all frames at 29.97fps for frames 1-100', () => {
      for (let frame = 1; frame <= 100; frame++) {
        const tc = frameToTimecode(frame, FPS_2997);
        const tcStr = formatTimecodeDisplay(tc);
        const result = parseFrameInput(tcStr, FPS_2997, 1, 1, 100000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });

    it('round-trips frames around minute boundaries at 29.97fps', () => {
      // Test around minute 1 boundary (frames 1798-1802)
      for (let frame = 1798; frame <= 1802; frame++) {
        const tc = frameToTimecode(frame, FPS_2997);
        const tcStr = formatTimecodeDisplay(tc);
        const result = parseFrameInput(tcStr, FPS_2997, 1, 1, 100000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });

    it('round-trips frames around 10th minute boundary at 29.97fps', () => {
      // Test around minute 10 boundary
      for (let frame = 17980; frame <= 17985; frame++) {
        const tc = frameToTimecode(frame, FPS_2997);
        const tcStr = formatTimecodeDisplay(tc);
        const result = parseFrameInput(tcStr, FPS_2997, 1, 1, 100000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });
  });

  // =========================================================================
  // Non-drop-frame round-trip
  // =========================================================================
  describe('NDF timecode round-trip', () => {
    it('round-trips all frames 1-240 at 24fps using Timecode.formatTimecode', () => {
      for (let frame = 1; frame <= 240; frame++) {
        const tcStr = formatTimecode(frame, FPS_24);
        const result = parseFrameInput(tcStr, FPS_24, 1, 1, 10000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });

    it('round-trips frames at 25fps', () => {
      for (let frame = 1; frame <= 100; frame++) {
        const tcStr = formatTimecode(frame, FPS_25);
        const result = parseFrameInput(tcStr, FPS_25, 1, 1, 10000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });

    it('round-trips frames at 30fps', () => {
      for (let frame = 1; frame <= 100; frame++) {
        const tcStr = formatTimecode(frame, FPS_30);
        const result = parseFrameInput(tcStr, FPS_30, 1, 1, 10000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });
  });

  // =========================================================================
  // Seconds
  // =========================================================================
  describe('seconds', () => {
    it('parses "0s" as frame 1', () => {
      const result = parseFrameInput('0s', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 1, format: 'seconds', valid: true });
    });

    it('parses "1s" at 24fps as frame 25', () => {
      // floor(1 * 24) + 1 = 25
      const result = parseFrameInput('1s', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(25);
    });

    it('parses "1.5s" at 24fps', () => {
      // floor(1.5 * 24) + 1 = floor(36) + 1 = 37
      const result = parseFrameInput('1.5s', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(37);
    });

    it('parses "3.75s" at 24fps', () => {
      // floor(3.75 * 24) + 1 = floor(90) + 1 = 91
      const result = parseFrameInput('3.75s', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(91);
    });

    it('parses "3.75S" (uppercase) at 24fps', () => {
      const result = parseFrameInput('3.75S', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(91);
    });

    it('rejects "100s" as out of range at 24fps with max 240', () => {
      // floor(100 * 24) + 1 = 2401
      const result = parseFrameInput('100s', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside range');
    });

    it('parses whole seconds without decimal', () => {
      const result = parseFrameInput('2s', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(49); // floor(2 * 24) + 1 = 49
    });
  });

  // =========================================================================
  // Seconds round-trip
  // =========================================================================
  describe('seconds round-trip', () => {
    it('round-trips with formatSeconds at 24fps', () => {
      for (let frame = 1; frame <= 100; frame++) {
        const secondsStr = formatSeconds(frame, FPS_24);
        // secondsStr is like "1.750s" - already has the 's' suffix
        const result = parseFrameInput(secondsStr, FPS_24, 1, 1, 10000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });

    it('round-trips with formatSeconds at 25fps', () => {
      for (let frame = 1; frame <= 100; frame++) {
        const secondsStr = formatSeconds(frame, FPS_25);
        const result = parseFrameInput(secondsStr, FPS_25, 1, 1, 10000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });

    it('round-trips with formatSeconds at 30fps', () => {
      for (let frame = 1; frame <= 100; frame++) {
        const secondsStr = formatSeconds(frame, FPS_30);
        const result = parseFrameInput(secondsStr, FPS_30, 1, 1, 10000);
        expect(result.valid).toBe(true);
        expect(result.frame).toBe(frame);
      }
    });
  });

  // =========================================================================
  // Relative offsets
  // =========================================================================
  describe('relative offsets', () => {
    it('parses "+1" as current + 1', () => {
      const result = parseFrameInput('+1', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 51, format: 'relative', valid: true });
    });

    it('parses "+10" as current + 10', () => {
      const result = parseFrameInput('+10', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 60, format: 'relative', valid: true });
    });

    it('parses "-10" as current - 10', () => {
      const result = parseFrameInput('-10', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 40, format: 'relative', valid: true });
    });

    it('parses "-5" as current - 5', () => {
      const result = parseFrameInput('-5', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 45, format: 'relative', valid: true });
    });

    it('parses "+0" as current', () => {
      const result = parseFrameInput('+0', FPS_24, CURRENT, MIN, MAX);
      expect(result).toEqual({ frame: 50, format: 'relative', valid: true });
    });

    it('rejects "+999" as out of range', () => {
      const result = parseFrameInput('+999', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.frame).toBe(1049);
      expect(result.error).toContain('outside range');
    });

    it('rejects negative result below min', () => {
      const result = parseFrameInput('-100', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.frame).toBe(-50);
      expect(result.error).toContain('outside range');
    });

    it('handles relative from frame 1', () => {
      const result = parseFrameInput('+5', FPS_24, 1, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(6);
    });

    it('handles relative from last frame', () => {
      const result = parseFrameInput('-5', FPS_24, 240, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(235);
    });
  });

  // =========================================================================
  // Invalid inputs
  // =========================================================================
  describe('invalid inputs', () => {
    it('rejects empty string', () => {
      const result = parseFrameInput('', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects "abc"', () => {
      const result = parseFrameInput('abc', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid input');
    });

    it('rejects "--5"', () => {
      const result = parseFrameInput('--5', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
    });

    it('rejects "+-5"', () => {
      const result = parseFrameInput('+-5', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
    });

    it('rejects "1.2.3s"', () => {
      const result = parseFrameInput('1.2.3s', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
    });

    it('rejects random text "hello world"', () => {
      const result = parseFrameInput('hello world', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
    });

    it('rejects special characters "!@#"', () => {
      const result = parseFrameInput('!@#', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
    });
  });

  // =========================================================================
  // Near-miss suggestions
  // =========================================================================
  describe('near-miss suggestions', () => {
    it('"1.5" without s suggests seconds format', () => {
      const result = parseFrameInput('1.5', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.format).toBe('seconds');
      expect(result.error).toContain('Did you mean 1.5s');
    });

    it('"3.75" without s suggests seconds format', () => {
      const result = parseFrameInput('3.75', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Did you mean 3.75s');
    });

    it('"0.5" without s suggests seconds format', () => {
      const result = parseFrameInput('0.5', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Did you mean 0.5s');
    });

    it('"12:34:56" (three groups) suggests HH:MM:SS:FF format', () => {
      const result = parseFrameInput('12:34:56', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.format).toBe('timecode');
      expect(result.error).toContain('HH:MM:SS:FF');
    });

    it('"1:02:03" (three groups, single-digit hour) suggests HH:MM:SS:FF format', () => {
      const result = parseFrameInput('1:02:03', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HH:MM:SS:FF');
    });
  });

  // =========================================================================
  // Whitespace trimming
  // =========================================================================
  describe('whitespace handling', () => {
    it('trims leading whitespace', () => {
      const result = parseFrameInput('  42', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(42);
    });

    it('trims trailing whitespace', () => {
      const result = parseFrameInput('42  ', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(42);
    });

    it('trims surrounding whitespace', () => {
      const result = parseFrameInput('  42  ', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(42);
    });

    it('trims whitespace around timecode', () => {
      const result = parseFrameInput('  00:00:00:05  ', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(6);
    });

    it('trims whitespace around seconds', () => {
      const result = parseFrameInput('  1.5s  ', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
    });

    it('trims whitespace around relative offset', () => {
      const result = parseFrameInput('  +10  ', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(60);
    });

    it('whitespace-only string is treated as empty', () => {
      const result = parseFrameInput('   ', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(false);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('min === max === 1 (single frame)', () => {
      const result = parseFrameInput('1', FPS_24, 1, 1, 1);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1);
    });

    it('min === max === 1, frame 2 out of range', () => {
      const result = parseFrameInput('2', FPS_24, 1, 1, 1);
      expect(result.valid).toBe(false);
    });

    it('relative offset to exactly min', () => {
      const result = parseFrameInput('-49', FPS_24, 50, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1);
    });

    it('relative offset to exactly max', () => {
      const result = parseFrameInput('+190', FPS_24, 50, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(240);
    });

    it('seconds at boundary: exactly 0s', () => {
      const result = parseFrameInput('0s', FPS_24, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(1);
    });

    it('handles very high fps (120)', () => {
      const result = parseFrameInput('00:00:01:00', 120, CURRENT, MIN, 10000);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(121);
    });

    it('handles fps = 1', () => {
      const result = parseFrameInput('00:00:05:00', 1, CURRENT, MIN, MAX);
      expect(result.valid).toBe(true);
      expect(result.frame).toBe(6);
    });
  });

  // =========================================================================
  // getFormatLabel
  // =========================================================================
  describe('getFormatLabel', () => {
    it('returns "Frame number" for frame format', () => {
      expect(getFormatLabel('frame')).toBe('Frame number');
    });

    it('returns "SMPTE Timecode" for timecode format', () => {
      expect(getFormatLabel('timecode')).toBe('SMPTE Timecode');
    });

    it('returns "Seconds" for seconds format', () => {
      expect(getFormatLabel('seconds')).toBe('Seconds');
    });

    it('returns "Relative (+/-)" for relative format', () => {
      expect(getFormatLabel('relative')).toBe('Relative (+/-)');
    });
  });
});
