/**
 * Viewer – playlist transition blending (review finding L6).
 *
 * While the playhead is inside a transition overlap the viewer must blend the
 * outgoing clip's frame with the current (incoming) frame.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Viewer } from './Viewer';
import { Session } from '../../core/session/Session';
import { PaintEngine } from '../../paint/PaintEngine';
import { Canvas2DTransitionRenderer } from '../../render/Canvas2DTransitionRenderer';
import type { MediaSource } from '../../core/session/Session';
import type { PlaylistTransitionFrame } from '../../core/types/transition';

interface TestableViewer {
  session: Partial<Session> & { currentSource?: MediaSource | null };
  prerenderBuffer: unknown;
}

function imageSource(name: string, element: HTMLImageElement): MediaSource {
  return { type: 'image', name, url: name, width: 100, height: 100, duration: 1, fps: 24, element };
}

describe('Viewer playlist transition blending', () => {
  let viewer: Viewer;
  let tv: TestableViewer;
  let incomingImg: HTMLImageElement;
  let outgoingImg: HTMLImageElement;
  let getFrame: ReturnType<typeof vi.fn>;
  let blendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    viewer = new Viewer({ session: new Session(), paintEngine: new PaintEngine() });
    tv = viewer as unknown as TestableViewer;

    incomingImg = new Image(100, 100);
    outgoingImg = new Image(100, 100);
    const sources = [imageSource('incoming.jpg', incomingImg), imageSource('outgoing.jpg', outgoingImg)];

    const cachedCanvas = document.createElement('canvas');
    getFrame = vi.fn().mockReturnValue({ canvas: cachedCanvas, effectsHash: 'x', width: 100, height: 100 });
    tv.prerenderBuffer = {
      getFrame,
      queuePriorityFrame: vi.fn(),
      setTargetSize: vi.fn(),
      setHalfRes: vi.fn(),
      onFrameProcessed: null,
      dispose: vi.fn(),
    };

    tv.session = {
      ...tv.session,
      isPlaying: true,
      currentFrame: 5,
      frameCount: 10,
      currentSource: sources[0],
      getSourceByIndex: (index: number) => sources[index] ?? null,
      getSequenceFrameSync: () => null,
      isUsingMediabunny: () => false,
    } as TestableViewer['session'];

    blendSpy = vi.spyOn(Canvas2DTransitionRenderer.prototype, 'renderTransitionFrame');
  });

  afterEach(() => {
    blendSpy.mockRestore();
    viewer.dispose();
  });

  it('VWR-PLT-001: blends outgoing and incoming frames during a transition overlap', () => {
    const transition: PlaylistTransitionFrame = {
      transitionType: 'dissolve',
      progress: 0.5,
      outgoingSourceIndex: 1,
      outgoingFrame: 40,
    };
    viewer.setPlaylistTransitionProvider(() => transition);

    viewer.render();

    expect(blendSpy).toHaveBeenCalledTimes(1);
    const [ctx, outgoing, incoming, config, progress] = blendSpy.mock.calls[0]!;
    expect(ctx).toBeDefined();
    expect(outgoing).toBe(outgoingImg);
    expect(incoming).toBe(incomingImg);
    expect(config).toEqual({ type: 'dissolve', durationFrames: 1 });
    expect(progress).toBe(0.5);
    // The prerender cache holds unblended frames; it must be bypassed.
    expect(getFrame).not.toHaveBeenCalled();
  });

  it('VWR-PLT-002: no blend outside a transition (provider returns null)', () => {
    viewer.setPlaylistTransitionProvider(() => null);

    viewer.render();

    expect(blendSpy).not.toHaveBeenCalled();
    expect(getFrame).toHaveBeenCalled();
  });

  it('VWR-PLT-003: clearing the provider stops blending', () => {
    viewer.setPlaylistTransitionProvider(() => ({
      transitionType: 'crossfade',
      progress: 0.1,
      outgoingSourceIndex: 1,
      outgoingFrame: 1,
    }));
    viewer.setPlaylistTransitionProvider(null);

    viewer.render();

    expect(blendSpy).not.toHaveBeenCalled();
  });
});
