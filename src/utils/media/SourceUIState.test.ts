import { describe, expect, it } from 'vitest';
import { getCurrentSourceStartFrame, isAudioScrubAvailable } from './SourceUIState';

describe('SourceUIState', () => {
  it('prefers the active representation start frame over sequence metadata', () => {
    const source = {
      sequenceInfo: { startFrame: 1001 },
      representations: [{ startFrame: 0 }, { startFrame: 86400 }],
      activeRepresentationIndex: 1,
    } as any;

    expect(getCurrentSourceStartFrame(source)).toBe(86400);
  });

  it('falls back to sequence start frame when no active representation is selected', () => {
    const source = {
      sequenceInfo: { startFrame: 1001 },
      representations: [{ startFrame: 86400 }],
      activeRepresentationIndex: -1,
    } as any;

    expect(getCurrentSourceStartFrame(source)).toBe(1001);
  });

  it('returns zero when the source has no start-frame metadata', () => {
    expect(getCurrentSourceStartFrame(null)).toBe(0);
    expect(getCurrentSourceStartFrame({} as any)).toBe(0);
  });

  it('reports audio scrub as available only for video sources with decoded web audio', () => {
    expect(isAudioScrubAvailable({ type: 'video' } as any, { isUsingWebAudio: true })).toBe(true);
    expect(isAudioScrubAvailable({ type: 'video' } as any, { isUsingWebAudio: false })).toBe(false);
    expect(isAudioScrubAvailable({ type: 'image' } as any, { isUsingWebAudio: true })).toBe(false);
    expect(isAudioScrubAvailable(null, { isUsingWebAudio: true })).toBe(false);
  });
});
