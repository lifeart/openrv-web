import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PlaylistTransitionEngine,
  resolveSourceFrameElement,
  type TransitionCanvasSurface,
} from './ViewerPlaylistTransition';
import { Canvas2DTransitionRenderer } from '../../render/Canvas2DTransitionRenderer';
import type { Session } from '../../core/session/Session';
import type { MediaSource } from '../../core/session/SessionTypes';
import type { PlaylistTransitionFrame } from '../../core/types/transition';

type SessionLike = Pick<Session, 'getSourceByIndex'>;

function sessionWith(sources: Partial<MediaSource>[]): SessionLike {
  return {
    getSourceByIndex: (index: number) => (sources[index] as MediaSource | undefined) ?? null,
  };
}

function fakeSurface(): TransitionCanvasSurface {
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const ctx = { canvas } as unknown as CanvasRenderingContext2D;
  return { canvas, ctx };
}

const incoming = { id: 'incoming' } as unknown as CanvasImageSource;

function frame(overrides: Partial<PlaylistTransitionFrame> = {}): PlaylistTransitionFrame {
  return {
    transitionType: 'crossfade',
    progress: 0.25,
    outgoingSourceIndex: 0,
    outgoingFrame: 42,
    ...overrides,
  };
}

describe('resolveSourceFrameElement', () => {
  it('VPT-001: resolves an image sequence frame by source-local frame', () => {
    const image = { id: 'seq-frame-1043' } as unknown as ImageBitmap;
    const session = sessionWith([
      {
        type: 'sequence',
        sequenceInfo: { startFrame: 1001 } as MediaSource['sequenceInfo'],
        sequenceFrameMap: new Map([[1042, { image } as never]]),
      },
    ]);
    expect(resolveSourceFrameElement(session, 0, 42, vi.fn())).toBe(image);
    expect(resolveSourceFrameElement(session, 0, 43, vi.fn())).toBeNull();
  });

  it('VPT-002: uses the cached mediabunny frame, else requests it', () => {
    const cached = { id: 'frame-10' } as unknown as HTMLCanvasElement;
    const getFrameAsync = vi.fn(() => Promise.resolve(null));
    const node = {
      isUsingMediabunny: () => true,
      isHDR: () => false,
      getCachedFrameCanvas: (f: number) => (f === 10 ? cached : null),
      getFrameAsync,
    };
    const session = sessionWith([{ type: 'video', videoSourceNode: node as never }]);
    const request = vi.fn();

    expect(resolveSourceFrameElement(session, 0, 10, request)).toBe(cached);
    expect(request).not.toHaveBeenCalled();

    expect(resolveSourceFrameElement(session, 0, 11, request)).toBeNull();
    expect(request).toHaveBeenCalledWith('0:11', expect.any(Function));
    request.mock.calls[0]![1]();
    expect(getFrameAsync).toHaveBeenCalledWith(11);
  });

  it('VPT-003: still images use their element; missing / HDR sources yield null', () => {
    const element = { id: 'img' } as unknown as HTMLImageElement;
    const hdrFile = { isHDR: () => true, getCanvas: () => null, getElement: () => null };
    const session = sessionWith([
      { type: 'image', element },
      { type: 'image', fileSourceNode: hdrFile as never },
    ]);
    expect(resolveSourceFrameElement(session, 0, 1, vi.fn())).toBe(element);
    expect(resolveSourceFrameElement(session, 1, 1, vi.fn())).toBeNull();
    expect(resolveSourceFrameElement(session, 7, 1, vi.fn())).toBeNull();
  });
});

describe('PlaylistTransitionEngine', () => {
  const outgoing = { id: 'outgoing' } as unknown as HTMLImageElement;
  let renderer: Canvas2DTransitionRenderer;
  let surface: TransitionCanvasSurface;
  let engine: PlaylistTransitionEngine;

  beforeEach(() => {
    renderer = new Canvas2DTransitionRenderer();
    vi.spyOn(renderer, 'renderTransitionFrame').mockImplementation(() => undefined);
    surface = fakeSurface();
    engine = new PlaylistTransitionEngine(renderer, () => surface);
  });

  it('VPT-010: creates the surface at frame size and calls the blend', () => {
    const session = sessionWith([{ type: 'image', element: outgoing }]);

    const result = engine.compose(session, frame({ transitionType: 'wipe-left' }), incoming, 320, 180, vi.fn());

    expect(result).toBe(surface.canvas);
    expect(surface.canvas.width).toBe(320);
    expect(surface.canvas.height).toBe(180);
    expect(renderer.renderTransitionFrame).toHaveBeenCalledWith(
      surface.ctx,
      outgoing,
      incoming,
      { type: 'wipe-left', durationFrames: 1 },
      0.25,
    );
  });

  it('VPT-011: returns null (no blend) for a cut or when the outgoing frame is unavailable', () => {
    const session = sessionWith([{ type: 'image', element: outgoing }]);
    expect(engine.compose(session, frame({ transitionType: 'cut' }), incoming, 320, 180, vi.fn())).toBeNull();
    expect(engine.compose(session, frame({ outgoingSourceIndex: 3 }), incoming, 320, 180, vi.fn())).toBeNull();
    expect(renderer.renderTransitionFrame).not.toHaveBeenCalled();
  });

  it('VPT-012: fetches a missing video frame once and re-renders when ready', async () => {
    let resolveFetch: () => void = () => undefined;
    const getFrameAsync = vi.fn(
      () =>
        new Promise<null>((resolve) => {
          resolveFetch = () => resolve(null);
        }),
    );
    const node = {
      isUsingMediabunny: () => true,
      isHDR: () => false,
      getCachedFrameCanvas: () => null,
      getFrameAsync,
    };
    const session = sessionWith([{ type: 'video', videoSourceNode: node as never }]);
    const onReady = vi.fn();

    expect(engine.compose(session, frame(), incoming, 320, 180, onReady)).toBeNull();
    expect(engine.compose(session, frame(), incoming, 320, 180, onReady)).toBeNull();
    expect(getFrameAsync).toHaveBeenCalledTimes(1);

    resolveFetch();
    await Promise.resolve();
    await Promise.resolve();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('VPT-013: returns null when no drawing surface can be created', () => {
    const noSurface = new PlaylistTransitionEngine(renderer, () => null);
    const session = sessionWith([{ type: 'image', element: outgoing }]);
    expect(noSurface.compose(session, frame(), incoming, 320, 180, vi.fn())).toBeNull();
  });
});
