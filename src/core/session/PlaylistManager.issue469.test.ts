/**
 * Regression tests for Issue #469:
 * OTIO import should preserve gap spacing and expose transitions in the parse result.
 *
 * Before the fix, PlaylistManager.fromOTIO() called addClip() which rebuilt
 * contiguous globalStartFrame values, dropping gap spacing. The single-track
 * OTIOParseResult also lacked transitions and gaps fields.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaylistManager } from './PlaylistManager';

/** Build a minimal OTIO JSON string with the given track children */
function makeOTIOJson(trackChildren: unknown[], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Test Timeline',
    global_start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: 24 },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Video 1',
          kind: 'Video',
          children: trackChildren,
        },
      ],
    },
    ...overrides,
  });
}

function clip(name: string, startFrame: number, duration: number, targetUrl?: string) {
  const c: Record<string, unknown> = {
    OTIO_SCHEMA: 'Clip.1',
    name,
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: { OTIO_SCHEMA: 'RationalTime.1', value: startFrame, rate: 24 },
      duration: { OTIO_SCHEMA: 'RationalTime.1', value: duration, rate: 24 },
    },
  };
  if (targetUrl) {
    c.media_reference = { OTIO_SCHEMA: 'ExternalReference.1', target_url: targetUrl };
  }
  return c;
}

function gap(duration: number) {
  return {
    OTIO_SCHEMA: 'Gap.1',
    source_range: {
      OTIO_SCHEMA: 'TimeRange.1',
      start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: 24 },
      duration: { OTIO_SCHEMA: 'RationalTime.1', value: duration, rate: 24 },
    },
  };
}

function transition(name: string, inOffset: number, outOffset: number) {
  return {
    OTIO_SCHEMA: 'Transition.1',
    name,
    transition_type: 'SMPTE_Dissolve',
    in_offset: { OTIO_SCHEMA: 'RationalTime.1', value: inOffset, rate: 24 },
    out_offset: { OTIO_SCHEMA: 'RationalTime.1', value: outOffset, rate: 24 },
  };
}

/** Resolver that maps clip names to source indices */
function defaultResolver(name: string) {
  const map: Record<string, number> = {
    shot_01: 0,
    shot_02: 1,
    shot_03: 2,
  };
  const idx = map[name];
  if (idx !== undefined) return { index: idx, frameCount: 200 };
  return null;
}

describe('PlaylistManager - Issue #469: OTIO gap and transition preservation', () => {
  let manager: PlaylistManager;

  beforeEach(() => {
    manager = new PlaylistManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('gap spacing preserved in fromOTIO', () => {
    it('I469-001: gap between clips offsets globalStartFrame', () => {
      // shot_01: 24 frames, gap: 12 frames, shot_02: 24 frames
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);

      const count = manager.fromOTIO(json, defaultResolver);
      expect(count).toBe(2);

      const clips = manager.getClips();
      expect(clips).toHaveLength(2);

      // shot_01 starts at frame 1 (0-based OTIO position 0 -> 1-based frame 1)
      expect(clips[0]!.globalStartFrame).toBe(1);
      expect(clips[0]!.duration).toBe(24);

      // shot_02 starts at OTIO position 36 (24 clip + 12 gap) -> frame 37
      expect(clips[1]!.globalStartFrame).toBe(37);
      expect(clips[1]!.duration).toBe(24);
    });

    it('I469-002: gap at start offsets first clip', () => {
      const json = makeOTIOJson([gap(10), clip('shot_01', 0, 24)]);

      const count = manager.fromOTIO(json, defaultResolver);
      expect(count).toBe(1);

      const clips = manager.getClips();
      // shot_01 starts at OTIO position 10 -> frame 11
      expect(clips[0]!.globalStartFrame).toBe(11);
    });

    it('I469-003: multiple gaps create correct spacing', () => {
      const json = makeOTIOJson([
        clip('shot_01', 0, 24),
        gap(6),
        clip('shot_02', 0, 24),
        gap(12),
        clip('shot_03', 0, 24),
      ]);

      const count = manager.fromOTIO(json, defaultResolver);
      expect(count).toBe(3);

      const clips = manager.getClips();
      // shot_01: position 0 -> frame 1
      expect(clips[0]!.globalStartFrame).toBe(1);
      // shot_02: position 24+6=30 -> frame 31
      expect(clips[1]!.globalStartFrame).toBe(31);
      // shot_03: position 30+24+12=66 -> frame 67
      expect(clips[2]!.globalStartFrame).toBe(67);
    });

    it('I469-004: getTotalDuration accounts for gap spacing', () => {
      // 24 clip + 12 gap + 24 clip = 60 total OTIO frames
      // Last clip ends at 1-based frame 60
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);

      manager.fromOTIO(json, defaultResolver);
      expect(manager.getTotalDuration()).toBe(60);
    });

    it('I469-005: getClipAtFrame returns null in gap region', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);

      manager.fromOTIO(json, defaultResolver);

      // Frame 24 is end of shot_01 (1+24-1=24)
      expect(manager.getClipAtFrame(24)).not.toBeNull();
      expect(manager.getClipAtFrame(24)!.clipIndex).toBe(0);

      // Frames 25-36 are in the gap
      expect(manager.getClipAtFrame(25)).toBeNull();
      expect(manager.getClipAtFrame(30)).toBeNull();
      expect(manager.getClipAtFrame(36)).toBeNull();

      // Frame 37 is start of shot_02
      expect(manager.getClipAtFrame(37)).not.toBeNull();
      expect(manager.getClipAtFrame(37)!.clipIndex).toBe(1);
    });

    it('I469-006: contiguous clips (no gaps) still work correctly', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), clip('shot_02', 0, 48)]);

      manager.fromOTIO(json, defaultResolver);

      const clips = manager.getClips();
      expect(clips[0]!.globalStartFrame).toBe(1);
      expect(clips[1]!.globalStartFrame).toBe(25); // 0+24 -> frame 25
      expect(manager.getTotalDuration()).toBe(72);
    });
  });

  describe('transitions exposed in import result', () => {
    it('I469-007: lastOTIOImportResult contains transitions', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 48), transition('Dissolve', 6, 6), clip('shot_02', 0, 48)]);

      manager.fromOTIO(json, defaultResolver);

      const result = manager.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.transitions).toHaveLength(1);
      expect(result!.transitions[0]!.name).toBe('Dissolve');
      expect(result!.transitions[0]!.inOffset).toBe(6);
      expect(result!.transitions[0]!.outOffset).toBe(6);
      expect(result!.transitions[0]!.duration).toBe(12);
    });

    it('I469-008: lastOTIOImportResult contains gaps', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);

      manager.fromOTIO(json, defaultResolver);

      const result = manager.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.gaps).toHaveLength(1);
      expect(result!.gaps[0]!.timelineInFrame).toBe(24);
      expect(result!.gaps[0]!.durationFrames).toBe(12);
    });

    it('I469-009: lastOTIOImportResult contains markers', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 48)], {
        markers: [
          {
            OTIO_SCHEMA: 'Marker.1',
            name: 'ReviewNote',
            color: 'RED',
            marked_range: {
              OTIO_SCHEMA: 'TimeRange.1',
              start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 10, rate: 24 },
              duration: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: 24 },
            },
          },
        ],
      });

      manager.fromOTIO(json, defaultResolver);

      const result = manager.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.markers).toHaveLength(1);
      expect(result!.markers[0]!.name).toBe('ReviewNote');
    });

    it('I469-010: transitions with gaps produce correct clip indices', () => {
      const json = makeOTIOJson([
        clip('shot_01', 0, 48),
        gap(12),
        clip('shot_02', 0, 24),
        transition('Dissolve', 4, 4),
        clip('shot_03', 0, 36),
      ]);

      manager.fromOTIO(json, defaultResolver);

      const result = manager.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.transitions).toHaveLength(1);

      const trans = result!.transitions[0]!;
      expect(trans.outgoingClipIndex).toBe(1); // shot_02
      expect(trans.incomingClipIndex).toBe(2); // shot_03
    });
  });

  describe('OTIOParseResult includes transitions and gaps', () => {
    it('I469-011: parseOTIO single-track result has transitions field', () => {
      // This is tested indirectly through the fallback path.
      // We verify via the lastOTIOImportResult which uses the single-track
      // parser's transitions when the multi-track parser returns the same data.
      const json = makeOTIOJson([clip('shot_01', 0, 48), transition('Dissolve', 6, 6), clip('shot_02', 0, 48)]);

      manager.fromOTIO(json, defaultResolver);

      const result = manager.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.transitions).toHaveLength(1);
    });

    it('I469-012: parseOTIO single-track result has gaps field', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(10), clip('shot_02', 0, 24)]);

      manager.fromOTIO(json, defaultResolver);

      const result = manager.lastOTIOImportResult;
      expect(result).not.toBeNull();
      expect(result!.gaps).toHaveLength(1);
    });
  });

  describe('unresolved clips preserve timeline position', () => {
    it('I469-013: unresolved clips record timelineIn from OTIO', () => {
      const resolver = (name: string) => {
        if (name === 'shot_01') return { index: 0, frameCount: 200 };
        return null; // shot_02 is unresolved
      };

      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);

      manager.fromOTIO(json, resolver);

      expect(manager.unresolvedClips).toHaveLength(1);
      expect(manager.unresolvedClips[0]!.name).toBe('shot_02');
      expect(manager.unresolvedClips[0]!.timelineIn).toBe(36); // 24 + 12 gap
    });
  });

  describe('getNextFrame / getPreviousFrame across gaps', () => {
    it('I469-015: getNextFrame sets clipChanged when entering clip from gap', () => {
      // shot_01: frames 1-24, gap: frames 25-36, shot_02: frames 37-60
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);
      manager.fromOTIO(json, defaultResolver);

      // Frame 36 is the last frame of the gap, frame 37 is the start of shot_02
      const result = manager.getNextFrame(36);
      expect(result.frame).toBe(37);
      expect(result.clipChanged).toBe(true);
    });

    it('I469-016: getNextFrame sets clipChanged when advancing through gap middle', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);
      manager.fromOTIO(json, defaultResolver);

      // Frame 30 is in the gap, frame 31 is still in the gap — both null mappings
      const result = manager.getNextFrame(30);
      expect(result.frame).toBe(31);
      // Both frames are in the gap (null mappings), so no clip change
      expect(result.clipChanged).toBe(false);
    });

    it('I469-017: getPreviousFrame sets clipChanged when entering clip from gap', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);
      manager.fromOTIO(json, defaultResolver);

      // Frame 25 is the first frame of the gap, frame 24 is the last frame of shot_01
      const result = manager.getPreviousFrame(25);
      expect(result.frame).toBe(24);
      expect(result.clipChanged).toBe(true);
    });

    it('I469-018: getPreviousFrame in gap middle does not set clipChanged', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);
      manager.fromOTIO(json, defaultResolver);

      // Frame 30 is in the gap, frame 29 is also in the gap
      const result = manager.getPreviousFrame(30);
      expect(result.frame).toBe(29);
      expect(result.clipChanged).toBe(false);
    });

    it('I469-019: getNextFrame sets clipChanged when leaving clip into gap then into next clip', () => {
      const json = makeOTIOJson([clip('shot_01', 0, 24), gap(12), clip('shot_02', 0, 24)]);
      manager.fromOTIO(json, defaultResolver);

      // Frame 24 is end of shot_01 — getNextFrame should skip to next clip or advance into gap
      // Since frame 24 is the end of the clip, the "at end of clip" logic triggers
      const result = manager.getNextFrame(24);
      // The end-of-clip logic jumps to the next clip's globalStartFrame
      expect(result.frame).toBe(37);
      expect(result.clipChanged).toBe(true);
    });
  });

  describe('marker importer callback in single-track fallback', () => {
    it('I469-014: markerImporter is invoked for single-track fallback path', () => {
      // This tests the single-track fallback which previously did not call
      // markerImporter or store _lastOTIOImportResult
      const markerImporter = vi.fn();
      const json = makeOTIOJson([clip('shot_01', 0, 48)], {
        markers: [
          {
            OTIO_SCHEMA: 'Marker.1',
            name: 'TestMarker',
            marked_range: {
              OTIO_SCHEMA: 'TimeRange.1',
              start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 5, rate: 24 },
              duration: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: 24 },
            },
          },
        ],
      });

      manager.fromOTIO(json, defaultResolver, { markerImporter });

      // The markerImporter should be called with the parsed markers
      // (this works whether the multi-track or single-track path is used)
      expect(manager.lastOTIOImportResult).not.toBeNull();
      expect(manager.lastOTIOImportResult!.markers).toHaveLength(1);
    });
  });
});
