import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  framesToTimecode,
  timecodeToFrames,
  formatReelName,
  generateEDL,
  createEDLBlob,
  downloadEDL,
  type EDLClip,
} from './EDLWriter';

// ---------------------------------------------------------------------------
// framesToTimecode
// ---------------------------------------------------------------------------

describe('EDLWriter', () => {
  describe('framesToTimecode', () => {
    it('EDL-001: converts 0 to 00:00:00:00', () => {
      expect(framesToTimecode(0)).toBe('00:00:00:00');
    });

    it('EDL-002: converts frame at 24fps', () => {
      // 120 frames at 24fps = 5 seconds
      expect(framesToTimecode(120, 24)).toBe('00:00:05:00');
      // 25 frames = 1 sec + 1 frame
      expect(framesToTimecode(25, 24)).toBe('00:00:01:01');
    });

    it('EDL-003: converts large frame number (hours)', () => {
      // 1 hour at 24fps = 86400 frames
      expect(framesToTimecode(86400, 24)).toBe('01:00:00:00');
      // 2 hours + 30 min + 15 sec + 12 frames
      const frame = (2 * 3600 + 30 * 60 + 15) * 24 + 12;
      expect(framesToTimecode(frame, 24)).toBe('02:30:15:12');
    });

    it('EDL-004: with 25fps', () => {
      // 25 frames = 1 second at 25fps
      expect(framesToTimecode(25, 25)).toBe('00:00:01:00');
      // 50 frames = 2 seconds
      expect(framesToTimecode(50, 25)).toBe('00:00:02:00');
      // 26 frames = 1 sec + 1 frame
      expect(framesToTimecode(26, 25)).toBe('00:00:01:01');
    });

    it('EDL-005: with 30fps (non-drop)', () => {
      // 30 frames = 1 second
      expect(framesToTimecode(30, 30)).toBe('00:00:01:00');
      // 1800 frames = 1 minute
      expect(framesToTimecode(1800, 30)).toBe('00:01:00:00');
    });

    it('EDL-006: with drop-frame 29.97fps', () => {
      // Frame 0 at DF
      expect(framesToTimecode(0, 29.97, true)).toBe('00:00:00;00');
      // Frame 29 -> 00:00:00;29
      expect(framesToTimecode(29, 29.97, true)).toBe('00:00:00;29');
      // Frame 30 -> 00:00:01;00 (second boundary, no drop)
      expect(framesToTimecode(30, 29.97, true)).toBe('00:00:01;00');
    });

    it('EDL-007: drop-frame skips frames 0,1 at non-10th minutes', () => {
      // At 29.97 DF, the first minute has 1800 real frames (nom*60 = 30*60).
      // Minute 1 starts at real frame 1800. Display frames ;00 and ;01 are
      // skipped at that minute boundary.
      // Frame 1799 is the last frame of minute 0: 00:00:59;29
      expect(framesToTimecode(1799, 29.97, true)).toBe('00:00:59;29');
      // Frame 1800 is the first frame of minute 1: 00:01:00;02 (;00 and ;01 skipped)
      expect(framesToTimecode(1800, 29.97, true)).toBe('00:01:00;02');
      // Frame 1801 continues: 00:01:00;03
      expect(framesToTimecode(1801, 29.97, true)).toBe('00:01:00;03');
    });

    it('EDL-008: drop-frame does NOT skip at 10th minutes', () => {
      // At 10th minute boundaries, frames 0 and 1 are NOT dropped
      // 10 minutes of DF 29.97: 10*60*30 - 9*2 = 17982 frames
      const tenMinFrames = 10 * 60 * 30 - 9 * 2; // 17982
      expect(framesToTimecode(tenMinFrames, 29.97, true)).toBe('00:10:00;00');
    });

    it('EDL-026: with negative frame clamps to 0', () => {
      expect(framesToTimecode(-1, 24)).toBe('00:00:00:00');
      expect(framesToTimecode(-100, 24)).toBe('00:00:00:00');
    });

    it('EDL-031: with 59.94fps drop-frame', () => {
      // Frame 0
      expect(framesToTimecode(0, 59.94, true)).toBe('00:00:00;00');
      // Frame 59 -> 00:00:00;59
      expect(framesToTimecode(59, 59.94, true)).toBe('00:00:00;59');
      // Frame 60 -> 00:00:01;00 (second boundary)
      expect(framesToTimecode(60, 59.94, true)).toBe('00:00:01;00');
      // First minute boundary at 59.94: 3600 real frames
      // Minute 1 skips ;00-;03
      expect(framesToTimecode(3600, 59.94, true)).toBe('00:01:00;04');
    });

    it('EDL-032: 59.94fps drop-frame 10th minute boundary', () => {
      // 10 minutes of DF 59.94: 60*600 - 4*9 = 35964 frames
      const tenMinFrames = 60 * 600 - 4 * 9; // 35964
      expect(framesToTimecode(tenMinFrames, 59.94, true)).toBe('00:10:00;00');
    });

    it('EDL-033: round-trips at 59.94fps drop-frame', () => {
      const testFrames = [0, 1, 59, 60, 3599, 3600, 35964, 36000];
      for (const f of testFrames) {
        const tc = framesToTimecode(f, 59.94, true);
        const result = timecodeToFrames(tc, 59.94, true);
        expect(result).toBe(f);
      }
    });

    it('EDL-034: NaN/Infinity clamped to 0', () => {
      expect(framesToTimecode(NaN, 24)).toBe('00:00:00:00');
      expect(framesToTimecode(-Infinity, 24)).toBe('00:00:00:00');
      expect(framesToTimecode(Infinity, 24)).toBe('00:00:00:00');
    });

    it('EDL-044: invalid fps defaults to 24', () => {
      expect(framesToTimecode(24, NaN)).toBe('00:00:01:00');
      expect(framesToTimecode(24, 0)).toBe('00:00:01:00');
      expect(framesToTimecode(24, Infinity)).toBe('00:00:01:00');
    });

    it('EDL-045: dropFrame with non-DF rate produces non-drop output', () => {
      // 24fps is not a drop-frame rate, so dropFrame flag is silently ignored
      const tc = framesToTimecode(120, 24, true);
      expect(tc).toBe('00:00:05:00'); // Uses ':' not ';'
      expect(tc).not.toContain(';');
    });
  });

  // ---------------------------------------------------------------------------
  // timecodeToFrames
  // ---------------------------------------------------------------------------

  describe('timecodeToFrames', () => {
    it('EDL-009: converts 00:00:00:00 to 0', () => {
      expect(timecodeToFrames('00:00:00:00')).toBe(0);
    });

    it('EDL-010: round-trips with framesToTimecode at 24fps', () => {
      const testFrames = [0, 1, 23, 24, 25, 47, 48, 120, 1440, 86400, 90000];
      for (const f of testFrames) {
        const tc = framesToTimecode(f, 24);
        expect(timecodeToFrames(tc, 24)).toBe(f);
      }
    });

    it('EDL-011: round-trips with framesToTimecode at 29.97 drop-frame', () => {
      const testFrames = [0, 1, 29, 30, 59, 1798, 1799, 1800, 17982, 18000, 53946];
      for (const f of testFrames) {
        const tc = framesToTimecode(f, 29.97, true);
        const result = timecodeToFrames(tc, 29.97, true);
        expect(result).toBe(f);
      }
    });

    it('EDL-027: with invalid format returns 0', () => {
      expect(timecodeToFrames('invalid')).toBe(0);
      expect(timecodeToFrames('00:00:00')).toBe(0);
      expect(timecodeToFrames('')).toBe(0);
      expect(timecodeToFrames('aa:bb:cc:dd')).toBe(0);
    });

    it('EDL-030: handles drop-frame semicolon separator', () => {
      // Semicolon in the timecode auto-detects drop-frame
      const tc = '00:01:00;02';
      const frames = timecodeToFrames(tc, 29.97);
      // Should be frame 1800 (first frame of minute 1 in DF, ;00 and ;01 skipped)
      expect(frames).toBe(1800);
    });

    it('EDL-035: round-trips at 25fps', () => {
      const testFrames = [0, 1, 24, 25, 50, 1500, 90000];
      for (const f of testFrames) {
        const tc = framesToTimecode(f, 25);
        expect(timecodeToFrames(tc, 25)).toBe(f);
      }
    });

    it('EDL-036: round-trips at 30fps non-drop', () => {
      const testFrames = [0, 1, 29, 30, 60, 1800, 108000];
      for (const f of testFrames) {
        const tc = framesToTimecode(f, 30);
        expect(timecodeToFrames(tc, 30)).toBe(f);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // formatReelName
  // ---------------------------------------------------------------------------

  describe('formatReelName', () => {
    it('EDL-012: truncates to 8 chars from left', () => {
      const result = formatReelName('very_long_reel_name.mov');
      expect(result).toHaveLength(8);
      // Keeps leftmost 8 chars: "VERY_LON"
      expect(result).toBe('VERY_LON');
    });

    it('EDL-013: pads short names', () => {
      const result = formatReelName('ABC');
      expect(result).toBe('ABC     ');
      expect(result).toHaveLength(8);
    });

    it('EDL-014: uppercases', () => {
      const result = formatReelName('reel');
      expect(result).toBe('REEL    ');
    });

    it('EDL-015: handles empty string', () => {
      const result = formatReelName('');
      expect(result).toBe('BL      ');
      expect(result).toHaveLength(8);
    });

    it('EDL-037: strips non-ASCII characters', () => {
      // Unicode characters should be stripped
      expect(formatReelName('\u5f71\u7247.mov')).toBe('.MOV    ');
      // Pure non-ASCII becomes blank
      expect(formatReelName('\u5f71\u7247')).toBe('BL      ');
    });

    it('EDL-038: different prefixes produce different reel names', () => {
      const reel1 = formatReelName('shot_001_comp_v03.exr');
      const reel2 = formatReelName('shot_002_comp_v03.exr');
      // Leftmost truncation keeps the distinguishing prefix
      expect(reel1).not.toBe(reel2);
    });
  });

  // ---------------------------------------------------------------------------
  // generateEDL
  // ---------------------------------------------------------------------------

  describe('generateEDL', () => {
    const sampleClips: EDLClip[] = [
      {
        sourceName: 'clip_one.mov',
        sourceIn: 0,
        sourceOut: 120,
        recordIn: 0,
        recordOut: 120,
      },
      {
        sourceName: 'clip_two.exr',
        sourceIn: 48,
        sourceOut: 252,
        recordIn: 120,
        recordOut: 324,
        comment: 'clip_two.exr',
      },
    ];

    it('EDL-016: produces valid CMX3600 header', () => {
      const edl = generateEDL([], { title: 'Test Session' });
      const lines = edl.split('\n');
      expect(lines[0]).toBe('TITLE: Test Session');
      expect(lines[1]).toBe('FCM: NON-DROP FRAME');
      expect(lines[2]).toBe('');
    });

    it('EDL-017: produces correct edit lines', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'REEL001',
          sourceIn: 0,
          sourceOut: 120,
          recordIn: 0,
          recordOut: 120,
        },
      ];
      const edl = generateEDL(clips, { fps: 24 });
      const lines = edl.split('\n');
      // Line 3 should be the first edit with exact format
      expect(lines[3]).toBe('001  REEL001  V     C        00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00');
      // Comment line
      expect(lines[4]).toBe('* FROM CLIP NAME: REEL001');
    });

    it('EDL-018: with multiple clips', () => {
      const edl = generateEDL(sampleClips);
      const editLines = edl.split('\n').filter(l => /^\d{3}\s/.test(l));
      expect(editLines).toHaveLength(2);
    });

    it('EDL-019: with custom title', () => {
      const edl = generateEDL([], { title: 'My Dailies Session' });
      expect(edl).toContain('TITLE: My Dailies Session');
    });

    it('EDL-020: with includeClipComments=false', () => {
      const edl = generateEDL(sampleClips, { includeClipComments: false });
      expect(edl).not.toContain('FROM CLIP NAME');
    });

    it('EDL-021: with drop-frame FCM header', () => {
      const edl = generateEDL([], { fps: 29.97, dropFrame: true });
      expect(edl).toContain('FCM: DROP FRAME');
    });

    it('EDL-022: with empty clips array', () => {
      const edl = generateEDL([]);
      const lines = edl.split('\n');
      expect(lines[0]).toBe('TITLE: Untitled');
      expect(lines[1]).toBe('FCM: NON-DROP FRAME');
      expect(lines[2]).toBe('');
      const editLines = edl.split('\n').filter(l => /^\d{3}\s/.test(l));
      expect(editLines).toHaveLength(0);
    });

    it('EDL-023: with custom fps', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'TEST',
          sourceIn: 0,
          sourceOut: 25,
          recordIn: 0,
          recordOut: 25,
        },
      ];
      const edl = generateEDL(clips, { fps: 25 });
      // 25 frames at 25fps = 1 second
      expect(edl).toContain('00:00:01:00');
    });

    it('EDL-028: edit numbers increment correctly', () => {
      const clips: EDLClip[] = Array.from({ length: 5 }, (_, i) => ({
        sourceName: `CLIP${i + 1}`,
        sourceIn: i * 24,
        sourceOut: (i + 1) * 24,
        recordIn: i * 24,
        recordOut: (i + 1) * 24,
      }));
      const edl = generateEDL(clips);
      const editLines = edl.split('\n').filter(l => /^\d{3}\s/.test(l));
      expect(editLines).toHaveLength(5);
      expect(editLines[0]).toMatch(/^001\s/);
      expect(editLines[1]).toMatch(/^002\s/);
      expect(editLines[2]).toMatch(/^003\s/);
      expect(editLines[3]).toMatch(/^004\s/);
      expect(editLines[4]).toMatch(/^005\s/);
    });

    it('EDL-029: reel names are formatted (leftmost 8 chars, uppercase)', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'my_long_source_name.mov',
          sourceIn: 0,
          sourceOut: 24,
          recordIn: 0,
          recordOut: 24,
        },
      ];
      const edl = generateEDL(clips);
      const editLine = edl.split('\n').find(l => /^\d{3}\s/.test(l))!;
      // Reel name field starts after "001  " (5 chars), 8 chars wide
      const reelSection = editLine.slice(5, 13);
      expect(reelSection).toBe('MY_LONG_');
    });

    it('EDL-039: caps at 999 edit entries', () => {
      const clips: EDLClip[] = Array.from({ length: 1001 }, (_, i) => ({
        sourceName: `C${i}`,
        sourceIn: 0,
        sourceOut: 24,
        recordIn: i * 24,
        recordOut: (i + 1) * 24,
      }));
      const edl = generateEDL(clips);
      const editLines = edl.split('\n').filter(l => /^\d{3}\s/.test(l));
      expect(editLines).toHaveLength(999);
      expect(editLines[998]).toMatch(/^999\s/);
    });

    it('EDL-040: title newlines are sanitized', () => {
      const edl = generateEDL([], { title: 'My\nBroken\rTitle' });
      const lines = edl.split('\n');
      expect(lines[0]).toBe('TITLE: My Broken Title');
    });

    it('EDL-041: comment newlines are sanitized', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'REEL',
          sourceIn: 0,
          sourceOut: 24,
          recordIn: 0,
          recordOut: 24,
          comment: 'line1\nline2',
        },
      ];
      const edl = generateEDL(clips);
      const commentLine = edl.split('\n').find(l => l.startsWith('*'))!;
      expect(commentLine).toBe('* FROM CLIP NAME: line1 line2');
    });

    it('EDL-042: comment falls back to sourceName when not specified', () => {
      const clips: EDLClip[] = [
        {
          sourceName: 'my_source.mov',
          sourceIn: 0,
          sourceOut: 24,
          recordIn: 0,
          recordOut: 24,
        },
      ];
      const edl = generateEDL(clips);
      expect(edl).toContain('* FROM CLIP NAME: my_source.mov');
    });
  });

  // ---------------------------------------------------------------------------
  // createEDLBlob
  // ---------------------------------------------------------------------------

  describe('createEDLBlob', () => {
    it('EDL-024: returns Blob with correct type', () => {
      const blob = createEDLBlob('TITLE: Test\n');
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/plain');
    });

    it('EDL-025: content matches input', () => {
      const text = 'TITLE: Test\nFCM: NON-DROP FRAME\n';
      const blob = createEDLBlob(text);
      expect(blob.size).toBe(new TextEncoder().encode(text).length);
    });
  });

  // ---------------------------------------------------------------------------
  // downloadEDL
  // ---------------------------------------------------------------------------

  describe('downloadEDL', () => {
    let mockClick: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockClick = vi.fn();
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_v: string) { /* no-op */ },
        set download(_v: string) { /* no-op */ },
        click: mockClick,
      } as unknown as HTMLAnchorElement);
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('EDL-043: triggers download and cleans up', () => {
      const clips: EDLClip[] = [
        { sourceName: 'TEST', sourceIn: 0, sourceOut: 24, recordIn: 0, recordOut: 24 },
      ];

      downloadEDL(clips, 'test.edl');

      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });

    it('EDL-046: revokeObjectURL called even when click throws', () => {
      mockClick.mockImplementation(() => { throw new Error('click failed'); });

      const clips: EDLClip[] = [
        { sourceName: 'TEST', sourceIn: 0, sourceOut: 24, recordIn: 0, recordOut: 24 },
      ];

      expect(() => downloadEDL(clips, 'test.edl')).toThrow('click failed');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    });
  });
});
