/**
 * Editorial import tests (EDL / RVEDL / OTIO) — source-time conversion,
 * drop-frame, transitions, gaps, OTIO Clip.2 and nested stacks.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';
import { TransitionManager } from './TransitionManager';
import type { PlaylistSourceResolver, ResolvedPlaylistSource } from './EditorialSourceMatcher';

function resolverFor(map: Record<string, ResolvedPlaylistSource>): PlaylistSourceResolver {
  return (name, url, hints) => {
    for (const key of [url, name, hints?.clipName, hints?.reel]) {
      if (key && map[key]) return map[key]!;
    }
    return null;
  };
}

const rt = (value: number, rate = 24) => ({ OTIO_SCHEMA: 'RationalTime.1', value, rate });
const tr = (start: number, duration: number, rate = 24) => ({
  OTIO_SCHEMA: 'TimeRange.1',
  start_time: rt(start, rate),
  duration: rt(duration, rate),
});

function timeline(children: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 't',
    global_start_time: rt(0),
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      children: [{ OTIO_SCHEMA: 'Track.1', name: 'V1', kind: 'Video', children }],
    },
    ...extra,
  });
}

describe('PlaylistManager editorial import', () => {
  let pm: PlaylistManager;

  beforeEach(() => {
    pm = new PlaylistManager();
  });

  describe('fromEDL', () => {
    it('ED-001: FROM CLIP NAME and record-timecode gaps are honoured', () => {
      const edl = [
        'TITLE: t',
        'FCM: NON-DROP FRAME',
        '001  TAPE1    V     C        00:00:00:00 00:00:01:00 01:00:00:00 01:00:01:00',
        '* FROM CLIP NAME: a.mov',
        '002  TAPE2    V     C        00:00:00:12 00:00:01:12 01:00:02:00 01:00:03:00',
        '* FROM CLIP NAME: b.mov',
      ].join('\n');
      const count = pm.fromEDL(
        edl,
        resolverFor({ 'a.mov': { index: 0, frameCount: 100 }, 'b.mov': { index: 1, frameCount: 100 } }),
      );
      expect(count).toBe(2);
      const [a, b] = pm.getClips();
      expect(a).toMatchObject({ sourceIndex: 0, sourceName: 'a.mov', inPoint: 1, outPoint: 24, globalStartFrame: 1 });
      // 1 second (24 frame) gap preserved
      expect(b).toMatchObject({ sourceIndex: 1, inPoint: 13, outPoint: 36, globalStartFrame: 49 });
    });

    it('ED-002: explicit fps is used for timecode', () => {
      const edl = '001  A  V  C  00:00:01:00 00:00:02:00 00:00:00:00 00:00:01:00';
      pm.fromEDL(edl, resolverFor({ A: { index: 0, frameCount: 1000 } }), { fps: 25 });
      expect(pm.getClips()[0]).toMatchObject({ inPoint: 26, outPoint: 50, duration: 25 });
    });

    it('ED-003: drop-frame timecode is decoded at 29.97 DF', () => {
      const edl = ['FCM: DROP FRAME', '001  A  V  C  00:01:00;02 00:01:00;12 00:00:00;00 00:00:00;10'].join('\n');
      pm.fromEDL(edl, resolverFor({ A: { index: 0, frameCount: 5000 } }), { fps: 29.97 });
      // 00:01:00;02 = frame 1800 (two frame numbers dropped at minute 1)
      expect(pm.getClips()[0]).toMatchObject({ inPoint: 1801, outPoint: 1810 });
    });

    it('ED-004: dissolves are imported (not dropped) and become transitions', () => {
      const tm = new TransitionManager();
      pm.setTransitionManager(tm);
      const edl = [
        '001  A  V  C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00',
        '002  B  V  D 012    00:00:00:00 00:00:02:00 00:00:02:00 00:00:04:00',
      ].join('\n');
      const count = pm.fromEDL(
        edl,
        resolverFor({ A: { index: 0, frameCount: 100 }, B: { index: 1, frameCount: 100 } }),
      );
      expect(count).toBe(2);
      const [a, b] = pm.getClips();
      // Outgoing clip extended by the 12-frame A-side handle
      expect(a).toMatchObject({ inPoint: 1, outPoint: 60 });
      expect(b).toMatchObject({ inPoint: 1, outPoint: 48 });
      expect(tm.getTransition(0)).toEqual({ type: 'dissolve', durationFrames: 12 });
      // Record duration is preserved: 96 frames
      expect(pm.getTotalDuration()).toBe(96);
    });

    it('ED-005: wipes map to wipe transitions', () => {
      const tm = new TransitionManager();
      pm.setTransitionManager(tm);
      const edl = [
        '001  A  V  C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00',
        '002  B  V  W001 006 00:00:00:00 00:00:02:00 00:00:02:00 00:00:04:00',
      ].join('\n');
      pm.fromEDL(edl, resolverFor({ A: { index: 0, frameCount: 100 }, B: { index: 1, frameCount: 100 } }));
      expect(tm.getTransition(0)).toEqual({ type: 'wipe-right', durationFrames: 6 });
    });

    it('ED-006: source start timecode is subtracted when known', () => {
      const edl = '001  A  V  C  01:00:00:10 01:00:01:10 00:00:00:00 00:00:01:00';
      pm.fromEDL(edl, resolverFor({ A: { index: 0, frameCount: 500, startTimecode: '01:00:00:00' } }));
      expect(pm.getClips()[0]).toMatchObject({ inPoint: 11, outPoint: 34 });
    });

    it('ED-007: without start TC, out-of-range source TC falls back to the earliest source-in', () => {
      const edl = [
        '001  A  V  C  01:00:00:00 01:00:01:00 01:00:00:00 01:00:01:00',
        '002  A  V  C  01:00:02:00 01:00:03:00 01:00:01:00 01:00:02:00',
      ].join('\n');
      pm.fromEDL(edl, resolverFor({ A: { index: 0, frameCount: 200 } }));
      const [c1, c2] = pm.getClips();
      expect(c1).toMatchObject({ inPoint: 1, outPoint: 24 });
      expect(c2).toMatchObject({ inPoint: 49, outPoint: 72 });
    });

    it('ED-008: SOURCE FILE and reel are passed to the resolver; unresolved events are reported', () => {
      const calls: unknown[][] = [];
      const edl = [
        '001  REEL1  V  C  00:00:00:00 00:00:01:00 00:00:00:00 00:00:01:00',
        '* FROM CLIP NAME: clip1',
        '* SOURCE FILE: /media/clip1.mov',
      ].join('\n');
      const count = pm.fromEDL(edl, (...args) => {
        calls.push(args);
        return null;
      });
      expect(count).toBe(0);
      expect(calls[0]).toEqual(['clip1', '/media/clip1.mov', { clipName: 'clip1', reel: 'REEL1' }]);
      expect(pm.unresolvedClips).toHaveLength(1);
      expect(pm.unresolvedClips[0]).toMatchObject({ name: 'clip1', sourceUrl: '/media/clip1.mov' });
    });
  });

  describe('fromRVEDL', () => {
    it('RV-001: converts image-sequence frame numbers to local frames', () => {
      const count = pm.fromRVEDL(
        '# cut\n/plates/a.1001.exr 1001 1010\n"/movies/b c.mov" 5 9\n',
        resolverFor({
          '/plates/a.1001.exr': { index: 0, frameCount: 100, startFrame: 1001 },
          'b c.mov': { index: 1, frameCount: 50 },
        }),
      );
      expect(count).toBe(2);
      const [a, b] = pm.getClips();
      expect(a).toMatchObject({ sourceIndex: 0, inPoint: 1, outPoint: 10 });
      expect(b).toMatchObject({ sourceIndex: 1, sourceName: 'b c.mov', inPoint: 5, outPoint: 9, globalStartFrame: 11 });
    });
  });

  describe('fromOTIO', () => {
    it('OT-001: Clip.2 with media_references imports', () => {
      const json = timeline([
        {
          OTIO_SCHEMA: 'Clip.2',
          name: 'shot',
          source_range: tr(0, 24),
          active_media_reference_key: 'DEFAULT_MEDIA',
          media_references: {
            DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', target_url: '/m/shot.mov' },
          },
        },
      ]);
      const urls: (string | undefined)[] = [];
      const count = pm.fromOTIO(json, (_name, url) => {
        urls.push(url);
        return { index: 0, frameCount: 100 };
      });
      expect(count).toBe(1);
      expect(urls).toEqual(['/m/shot.mov']);
    });

    it('OT-002: media time 0 maps to local frame 1 (off-by-one)', () => {
      const json = timeline([{ OTIO_SCHEMA: 'Clip.1', name: 'a', source_range: tr(0, 48) }]);
      pm.fromOTIO(json, () => ({ index: 0, frameCount: 100 }));
      expect(pm.getClips()[0]).toMatchObject({ inPoint: 1, outPoint: 48, globalStartFrame: 1 });
    });

    it('OT-003: source_range is offset by the available_range start', () => {
      const json = timeline([
        {
          OTIO_SCHEMA: 'Clip.2',
          name: 'a',
          source_range: tr(86410, 24),
          media_references: {
            DEFAULT_MEDIA: {
              OTIO_SCHEMA: 'ExternalReference.1',
              target_url: 'a.mov',
              available_range: tr(86400, 100),
            },
          },
        },
      ]);
      pm.fromOTIO(json, () => ({ index: 0, frameCount: 100 }));
      expect(pm.getClips()[0]).toMatchObject({ inPoint: 11, outPoint: 34 });
    });

    it('OT-004: image sequence references use start frame numbering', () => {
      const json = timeline([
        {
          OTIO_SCHEMA: 'Clip.2',
          name: 'seq',
          source_range: tr(1010, 10),
          media_references: {
            DEFAULT_MEDIA: {
              OTIO_SCHEMA: 'ImageSequenceReference.1',
              target_url_base: '/plates/',
              name_prefix: 'seq.',
              name_suffix: '.exr',
              start_frame: 1001,
              frame_zero_padding: 4,
              available_range: tr(1001, 50),
            },
          },
        },
      ]);
      const urls: (string | undefined)[] = [];
      pm.fromOTIO(json, (_n, url) => {
        urls.push(url);
        return { index: 0, frameCount: 50, startFrame: 1001 };
      });
      expect(urls).toEqual(['/plates/seq.####.exr']);
      expect(pm.getClips()[0]).toMatchObject({ inPoint: 10, outPoint: 19 });
    });

    it('OT-005: nested stacks keep their timeline duration and source_range window', () => {
      const json = timeline([
        { OTIO_SCHEMA: 'Clip.1', name: 'a', source_range: tr(0, 24) },
        {
          OTIO_SCHEMA: 'Stack.1',
          name: 'nested',
          source_range: tr(12, 24),
          children: [
            {
              OTIO_SCHEMA: 'Track.1',
              name: 'inner',
              kind: 'Video',
              children: [
                { OTIO_SCHEMA: 'Clip.1', name: 'b', source_range: tr(0, 24) },
                { OTIO_SCHEMA: 'Clip.1', name: 'c', source_range: tr(100, 24) },
              ],
            },
          ],
        },
        { OTIO_SCHEMA: 'Gap.1', source_range: tr(0, 10) },
        { OTIO_SCHEMA: 'Clip.1', name: 'd', source_range: tr(0, 24) },
      ]);
      const count = pm.fromOTIO(json, () => ({ index: 0, frameCount: 1000 }));
      expect(count).toBe(4);
      const clips = pm.getClips();
      expect(clips.map((c) => [c.sourceName, c.inPoint, c.outPoint, c.globalStartFrame])).toEqual([
        ['a', 1, 24, 1],
        // nested window [12, 36): last 12 frames of b, first 12 of c
        ['b', 13, 24, 25],
        ['c', 101, 112, 37],
        // nested stack occupies 24 frames, then a 10-frame gap
        ['d', 1, 24, 59],
      ]);
    });

    it('OT-006: transition indices map through unresolved clips and keep handles', () => {
      const tm = new TransitionManager();
      pm.setTransitionManager(tm);
      const json = timeline([
        { OTIO_SCHEMA: 'Clip.1', name: 'a', source_range: tr(0, 48) },
        {
          OTIO_SCHEMA: 'Transition.1',
          transition_type: 'SMPTE_Dissolve',
          in_offset: rt(6),
          out_offset: rt(6),
        },
        { OTIO_SCHEMA: 'Clip.1', name: 'b', source_range: tr(24, 48) },
      ]);
      pm.fromOTIO(json, () => ({ index: 0, frameCount: 200 }));
      const [a, b] = pm.getClips();
      expect(a).toMatchObject({ inPoint: 1, outPoint: 54 }); // +6 tail handle
      expect(b).toMatchObject({ inPoint: 19, outPoint: 72 }); // -6 head handle
      expect(tm.getTransition(0)).toEqual({ type: 'dissolve', durationFrames: 12 });
      // OTIO track duration (96) is preserved
      expect(pm.getTotalDuration()).toBe(96);
    });
  });
});
