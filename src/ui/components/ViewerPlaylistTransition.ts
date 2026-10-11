/**
 * ViewerPlaylistTransition - Blends playlist transition frames for the Viewer.
 *
 * While the playhead is inside a playlist transition overlap the session is
 * showing the incoming clip (it owns playback there). This engine fetches the
 * outgoing clip's frame and blends the two with the Canvas2D transition
 * renderer into an offscreen canvas. The Viewer then uses that canvas as the
 * frame element, so the blended image flows through the regular render
 * pipeline (2D canvas path and the SDR WebGL path alike).
 *
 * Out of scope: HDR sources (rendered as float IPImages directly by the GL
 * renderer) are not blended; the incoming clip is shown as a hard cut.
 */

import type { Session } from '../../core/session/Session';
import type { PlaylistTransitionFrame, TransitionConfig } from '../../core/types/transition';
import { Canvas2DTransitionRenderer } from '../../render/Canvas2DTransitionRenderer';
import { Logger } from '../../utils/Logger';

const log = new Logger('ViewerPlaylistTransition');

/** Supplies the transition blend for the frame being rendered, or null. */
export type PlaylistTransitionProvider = () => PlaylistTransitionFrame | null;

/** Minimal canvas surface used by the engine (lets tests inject a fake). */
export interface TransitionCanvasSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/**
 * Resolve a drawable for `frame` of the source at `sourceIndex` without
 * changing the session's current source.
 *
 * Returns null when the frame is not available synchronously. For mediabunny
 * video an async decode is started and `onFrameReady` is invoked once it
 * resolves so the caller can re-render.
 */
export function resolveSourceFrameElement(
  session: Pick<Session, 'getSourceByIndex'>,
  sourceIndex: number,
  frame: number,
  requestFrame: (key: string, load: () => Promise<unknown>) => void,
): CanvasImageSource | null {
  const source = session.getSourceByIndex(sourceIndex);
  if (!source) return null;

  if (source.type === 'sequence') {
    const startFrame = source.sequenceInfo?.startFrame ?? 1;
    return source.sequenceFrameMap?.get(startFrame + frame - 1)?.image ?? null;
  }

  if (source.type === 'video') {
    const node = source.videoSourceNode;
    if (!node?.isUsingMediabunny() || node.isHDR()) return null;
    const cached = node.getCachedFrameCanvas(frame);
    if (cached) return cached;
    requestFrame(`${sourceIndex}:${frame}`, () => node.getFrameAsync(frame));
    return null;
  }

  if (source.fileSourceNode) {
    if (source.fileSourceNode.isHDR()) return null;
    return source.fileSourceNode.getCanvas() ?? source.fileSourceNode.getElement(0) ?? null;
  }

  if (source.proceduralSourceNode) return null;

  // Still images: the element is the frame.
  return source.element ?? null;
}

/**
 * Composites playlist transition frames with the Canvas2D transition renderer.
 */
export class PlaylistTransitionEngine {
  private surface: TransitionCanvasSurface | null = null;
  private pendingFetchKey: string | null = null;

  constructor(
    private readonly renderer: Canvas2DTransitionRenderer = new Canvas2DTransitionRenderer(),
    private readonly createSurface: () => TransitionCanvasSurface | null = createDefaultSurface,
  ) {}

  /**
   * Blend the outgoing clip's frame with `incoming` (the frame the session is
   * showing). Returns the blended canvas, or null when no blend could be
   * produced (the caller should then render `incoming` unchanged).
   *
   * @param onFrameReady - Called when an outgoing frame that was not yet
   *   available finishes loading (caller should re-render).
   */
  compose(
    session: Pick<Session, 'getSourceByIndex'>,
    transition: PlaylistTransitionFrame,
    incoming: CanvasImageSource,
    width: number,
    height: number,
    onFrameReady: () => void,
  ): HTMLCanvasElement | null {
    if (transition.transitionType === 'cut' || width <= 0 || height <= 0) return null;

    const outgoing = resolveSourceFrameElement(
      session,
      transition.outgoingSourceIndex,
      transition.outgoingFrame,
      (key, load) => this.requestFrame(key, load, onFrameReady),
    );
    if (!outgoing) return null;

    const surface = this.ensureSurface(width, height);
    if (!surface) return null;

    const config: TransitionConfig = { type: transition.transitionType, durationFrames: 1 };
    this.renderer.renderTransitionFrame(surface.ctx, outgoing, incoming, config, transition.progress);
    return surface.canvas;
  }

  dispose(): void {
    this.surface = null;
    this.pendingFetchKey = null;
  }

  private ensureSurface(width: number, height: number): TransitionCanvasSurface | null {
    if (!this.surface) {
      this.surface = this.createSurface();
      if (!this.surface) return null;
    }
    const { canvas } = this.surface;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    return this.surface;
  }

  private requestFrame(key: string, load: () => Promise<unknown>, onFrameReady: () => void): void {
    if (this.pendingFetchKey === key) return;
    this.pendingFetchKey = key;
    load()
      .then(() => {
        if (this.pendingFetchKey === key) {
          this.pendingFetchKey = null;
          onFrameReady();
        }
      })
      .catch((err) => {
        if (this.pendingFetchKey === key) this.pendingFetchKey = null;
        log.warn('Failed to fetch outgoing transition frame:', err);
      });
  }
}

function createDefaultSurface(): TransitionCanvasSurface | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    log.warn('2D context unavailable; playlist transitions will render as cuts');
    return null;
  }
  return { canvas, ctx };
}
