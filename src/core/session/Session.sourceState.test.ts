/**
 * Source switching must not silently reset the playback range, frame or fps
 * (review findings L1, L2, L7, L13).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Session, type MediaSource } from './Session';

class TestSession extends Session {
  setSources(sources: MediaSource[]): void {
    (this as unknown as { _media: { resetSourcesInternal(): void } })._media.resetSourcesInternal();
    for (const source of sources) this.addSource(source);
    // Mirror what a loader does for the first (current) source.
    this.setInOutRange(1, this.currentSource?.duration ?? 1);
  }
}

const video = (name: string, duration: number, fps = 24): MediaSource => ({
  type: 'video',
  name,
  url: `file://${name}`,
  width: 100,
  height: 100,
  duration,
  fps,
});

describe('Session source state', () => {
  let session: TestSession;

  beforeEach(() => {
    session = new TestSession();
  });

  it('SRC-001: an A/B flip keeps a narrowed loop range and the frame', () => {
    session.setSources([video('a', 100), video('b', 100)]);
    expect(session.sourceBIndex).toBe(1);
    session.setInOutRange(20, 40);
    session.goToFrame(30);

    session.toggleAB();
    expect(session.currentAB).toBe('B');
    expect([session.inPoint, session.outPoint, session.currentFrame]).toEqual([20, 40, 30]);

    session.toggleAB();
    expect([session.inPoint, session.outPoint, session.currentFrame]).toEqual([20, 40, 30]);
  });

  it('SRC-002: an A/B flip from the full range lands on the new source full range', () => {
    session.setSources([video('a', 100), video('b', 50)]);
    expect([session.inPoint, session.outPoint]).toEqual([1, 100]);
    session.goToFrame(80);

    session.toggleAB();
    expect([session.inPoint, session.outPoint]).toEqual([1, 50]);
    expect(session.currentFrame).toBe(50);
  });

  it('SRC-003: an A/B flip makes the session fps follow the source', () => {
    session.setSources([video('a', 100, 24), video('b', 100, 30)]);
    session.toggleAB();
    expect(session.fps).toBe(30);
    session.toggleAB();
    expect(session.fps).toBe(24);
  });

  it('SRC-004: restoring playback state keeps the saved range and frame on source B', () => {
    session.setSources([video('a', 100), video('b', 60)]);

    session.setPlaybackState({
      currentSourceIndex: 1,
      sourceAIndex: 0,
      sourceBIndex: 1,
      currentAB: 'B',
      inPoint: 10,
      outPoint: 40,
      currentFrame: 25,
      fps: 25,
    });

    expect(session.currentSourceIndex).toBe(1);
    expect(session.currentAB).toBe('B');
    expect([session.inPoint, session.outPoint, session.currentFrame]).toEqual([10, 40, 25]);
    expect(session.fps).toBe(25);
  });

  it('SRC-005: restoring a range that starts after the old out point does not cross-clamp', () => {
    session.setSources([video('a', 100)]);
    session.setInOutRange(1, 50);

    session.setPlaybackState({ inPoint: 60, outPoint: 100, currentFrame: 70 });

    expect([session.inPoint, session.outPoint, session.currentFrame]).toEqual([60, 100, 70]);
  });

  it('SRC-006: re-selecting the current source keeps the range and frame', () => {
    session.setSources([video('a', 100)]);
    session.setInOutRange(20, 40);
    session.goToFrame(30);

    session.setCurrentSource(0);

    expect([session.inPoint, session.outPoint, session.currentFrame]).toEqual([20, 40, 30]);
  });

  it('SRC-007: loading a second source keeps the first source range', () => {
    session.loadProceduralSource('smpte_bars', { duration: 100 });
    session.setInOutRange(10, 50);
    session.goToFrame(20);

    session.loadProceduralSource('gradient', { duration: 1 });

    expect(session.currentSourceIndex).toBe(0);
    expect(session.sourceBIndex).toBe(1);
    expect([session.inPoint, session.outPoint, session.currentFrame]).toEqual([10, 50, 20]);
  });
});
