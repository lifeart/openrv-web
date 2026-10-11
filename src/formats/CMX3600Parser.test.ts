import { describe, it, expect } from 'vitest';
import { parseCMX3600, cmxTimecodeToFrames } from './CMX3600Parser';

describe('parseCMX3600', () => {
  it('CMX-001: parses cuts with record timecode and FROM CLIP NAME', () => {
    const edl = [
      'TITLE: Test',
      'FCM: NON-DROP FRAME',
      '',
      '001  A001     V     C        00:00:01:00 00:00:02:00 01:00:00:00 01:00:01:00',
      '* FROM CLIP NAME: shot_010.mov',
      '* SOURCE FILE: /media/shot_010.mov',
      '002  B002     V     C        00:00:00:00 00:00:00:12 01:00:02:00 01:00:02:12',
    ].join('\n');
    const result = parseCMX3600(edl, { fps: 24 });
    expect(result.title).toBe('Test');
    expect(result.dropFrame).toBe(false);
    expect(result.fps).toBe(24);
    expect(result.events).toHaveLength(2);
    const [a, b] = result.events;
    expect(a).toMatchObject({
      eventNumber: 1,
      reel: 'A001',
      clipName: 'shot_010.mov',
      sourceFile: '/media/shot_010.mov',
      sourceIn: 24,
      sourceOut: 48,
      recordIn: 3600 * 24,
      recordOut: 3600 * 24 + 24,
    });
    expect(b!.recordIn).toBe(3600 * 24 + 48); // 1 second gap preserved
    expect(b!.clipName).toBeUndefined();
  });

  it('CMX-002: honours the fps option', () => {
    const edl = '001  A  V  C  00:00:01:00 00:00:02:00 00:00:00:00 00:00:01:00';
    expect(parseCMX3600(edl, { fps: 25 }).events[0]!.sourceIn).toBe(25);
    expect(parseCMX3600(edl).events[0]!.sourceIn).toBe(24);
  });

  it('CMX-003: decodes drop-frame timecode from FCM header', () => {
    const edl = ['FCM: DROP FRAME', '001  A  V  C  00:01:00;02 00:01:00;12 00:00:00;00 00:00:00;10'].join('\n');
    const result = parseCMX3600(edl, { fps: 30 });
    expect(result.dropFrame).toBe(true);
    expect(result.fps).toBeCloseTo(29.97);
    // 00:01:00;02 is the first frame after the drop at minute 1 = 1800
    expect(result.events[0]!.sourceIn).toBe(1800);
    expect(result.events[0]!.sourceOut).toBe(1810);
  });

  it('CMX-004: semicolon separators imply drop-frame without FCM', () => {
    const edl = '001  A  V  C  00:10:00;00 00:10:00;10 00:00:00;00 00:00:00;10';
    const result = parseCMX3600(edl, { fps: 29.97 });
    expect(result.dropFrame).toBe(true);
    // 10 minutes of 29.97 DF = 17982 frames
    expect(result.events[0]!.sourceIn).toBe(17982);
  });

  it('CMX-005: NON-DROP header keeps 30fps non-drop math', () => {
    const edl = ['FCM: NON-DROP FRAME', '001  A  V  C  00:01:00:00 00:01:00:10 00:00:00:00 00:00:00:10'].join('\n');
    expect(parseCMX3600(edl, { fps: 30 }).events[0]!.sourceIn).toBe(1800);
  });

  it('CMX-006: single-line dissolve (as written by EDLWriter)', () => {
    const edl = [
      '001  A  V     C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00',
      '* FROM CLIP NAME: a.mov',
      '002  B  V     D 012    00:00:00:00 00:00:02:00 00:00:01:12 00:00:03:12',
      '* FROM CLIP NAME: b.mov',
    ].join('\n');
    const events = parseCMX3600(edl).events;
    expect(events).toHaveLength(2);
    expect(events[1]!.clipName).toBe('b.mov');
    expect(events[1]!.transition).toEqual({ type: 'dissolve', durationFrames: 12 });
  });

  it('CMX-007: two-line dissolve uses outgoing line as handle and TO CLIP NAME for incoming', () => {
    const edl = [
      '001  A  V  C        01:00:00:00 01:00:05:00 01:00:00:00 01:00:05:00',
      '* FROM CLIP NAME: a.mov',
      '002  A  V  C        01:00:05:00 01:00:05:00 01:00:05:00 01:00:05:00',
      '002  B  V  D    024 02:00:00:00 02:00:06:00 01:00:05:00 01:00:11:00',
      '* FROM CLIP NAME: a.mov',
      '* TO CLIP NAME: b.mov',
    ].join('\n');
    const events = parseCMX3600(edl).events;
    // zero-length outgoing line is not a record segment
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      reel: 'B',
      clipName: 'b.mov',
      transition: { type: 'dissolve', durationFrames: 24 },
    });
  });

  it('CMX-008: wipes carry the SMPTE wipe code', () => {
    const edl = [
      '001  A  V  C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00',
      '002  B  V  W001 010 00:00:00:00 00:00:02:00 00:00:02:00 00:00:04:00',
    ].join('\n');
    expect(parseCMX3600(edl).events[1]!.transition).toEqual({ type: 'wipe', durationFrames: 10, wipeCode: 1 });
  });

  it('CMX-009: skips audio-only events and keeps B (both) / AA/V', () => {
    const edl = [
      '001  A  A     C        00:00:00:00 00:00:01:00 00:00:00:00 00:00:01:00',
      '002  B  B     C        00:00:00:00 00:00:01:00 00:00:01:00 00:00:02:00',
      '003  C  AA/V  C        00:00:00:00 00:00:01:00 00:00:02:00 00:00:03:00',
    ].join('\n');
    expect(parseCMX3600(edl).events.map((e) => e.reel)).toEqual(['B', 'C']);
  });

  it('CMX-010: cmxTimecodeToFrames handles DF and NDF', () => {
    expect(cmxTimecodeToFrames('01:00:00:00', 24)).toBe(86400);
    expect(cmxTimecodeToFrames('00:01:00;02', 29.97)).toBe(1800);
  });
});
