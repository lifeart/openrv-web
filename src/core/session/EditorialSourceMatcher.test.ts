import { describe, it, expect } from 'vitest';
import {
  matchEditorialSource,
  fuzzyKey,
  fileNameOf,
  createSessionSourceResolver,
  type MatchableSource,
} from './EditorialSourceMatcher';
import type { MediaSource } from './SessionTypes';

const sources: MatchableSource[] = [
  { name: 'shot_010_comp_v003.mov', url: 'blob:abc-1' },
  { name: 'shot_020.####.exr', url: '/plates/shot_020.####.exr' },
  { name: 'A001C003_230101.mov', url: 'https://cdn.example.com/media/A001C003_230101.mov?token=1' },
  { name: 'shot_010_comp_v003.exr', url: 'blob:abc-2' },
];

describe('EditorialSourceMatcher', () => {
  it('ESM-001: exact URL wins over everything else', () => {
    expect(matchEditorialSource(sources, { url: 'blob:abc-2', name: 'shot_010_comp_v003.mov' })).toBe(3);
  });

  it('ESM-002: exact file name of a path', () => {
    expect(matchEditorialSource(sources, { url: '/Volumes/edit/shot_010_comp_v003.exr' })).toBe(3);
    expect(matchEditorialSource(sources, { name: 'A001C003_230101.mov' })).toBe(2);
  });

  it('ESM-003: basename without extension', () => {
    expect(matchEditorialSource(sources, { name: 'A001C003_230101.mxf' })).toBe(2);
  });

  it('ESM-004: clip name before reel', () => {
    expect(matchEditorialSource(sources, { name: 'TAPE1', clipName: 'A001C003_230101.mov', reel: 'TAPE1' })).toBe(2);
  });

  it('ESM-005: reel name', () => {
    expect(matchEditorialSource(sources, { reel: 'A001C003_230101' })).toBe(2);
  });

  it('ESM-006: fuzzy match strips frame patterns and case', () => {
    expect(matchEditorialSource(sources, { url: 'file:///plates/SHOT_020.%04d.exr' })).toBe(1);
    expect(matchEditorialSource(sources, { name: 'shot_020.1001-1100#.exr' })).toBe(1);
    expect(matchEditorialSource(sources, { name: 'shot_020.[1001-1100].exr' })).toBe(1);
    expect(matchEditorialSource(sources, { name: 'shot_020.1001.exr' })).toBe(1);
  });

  it('ESM-007: fuzzy prefix match handles truncated 8-char reels', () => {
    expect(matchEditorialSource(sources, { reel: 'A001C003' })).toBe(2);
  });

  it('ESM-008: ambiguous fuzzy matches resolve to nothing', () => {
    // Both shot_010_comp_v003.mov and .exr share the fuzzy key
    expect(matchEditorialSource(sources, { reel: 'SHOT_010' })).toBe(-1);
  });

  it('ESM-009: no match returns -1', () => {
    expect(matchEditorialSource(sources, { name: 'unknown.mov', reel: 'ZZZ' })).toBe(-1);
    expect(matchEditorialSource([], { name: 'x' })).toBe(-1);
  });

  it('ESM-010: helpers', () => {
    expect(fileNameOf('https://x.com/a/b%20c.mov?x=1#y')).toBe('b c.mov');
    expect(fileNameOf('C:\\media\\clip.mov')).toBe('clip.mov');
    expect(fuzzyKey('/a/Shot_020.####.EXR')).toBe('shot020');
    expect(fuzzyKey('shot_020_%04d.exr')).toBe('shot020');
  });

  it('ESM-011: session resolver returns index, length, start frame and timecode', () => {
    const media = [
      { name: 'a.mov', url: 'blob:a', duration: 100, fps: 24, sourceTimecode: '01:00:00:00' },
      {
        name: 'seq.####.exr',
        url: '',
        duration: 50,
        fps: 24,
        sequenceInfo: { startFrame: 1001 },
      },
    ] as unknown as MediaSource[];
    const resolve = createSessionSourceResolver(() => media);
    expect(resolve('a.mov')).toEqual({ index: 0, frameCount: 100, fps: 24, startTimecode: '01:00:00:00' });
    expect(resolve('x', undefined, { clipName: 'seq.1001.exr' })).toEqual({
      index: 1,
      frameCount: 50,
      fps: 24,
      startFrame: 1001,
    });
    expect(resolve('nothing')).toBeNull();
  });
});
