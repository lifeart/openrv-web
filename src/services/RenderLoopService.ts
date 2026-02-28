/**
 * RenderLoopService - Owns the requestAnimationFrame render loop.
 *
 * Extracted from App.ts to isolate the tick/render cycle from the
 * top-level orchestrator.  Manages PerfTrace integration and the
 * play-driven render-on-frame-change optimisation.
 */

import { PerfTrace } from '../utils/PerfTrace';

// ---------------------------------------------------------------------------
// Dependency interfaces (structural typing — no need to import heavy classes)
// ---------------------------------------------------------------------------

/** Subset of Session that the render loop actually touches. */
export interface RenderLoopSession {
  readonly isPlaying: boolean;
  readonly currentFrame: number;
  readonly currentSource: { type: string } | null;
  update(): void;
}

/** Subset of Viewer that the render loop actually touches. */
export interface RenderLoopViewer {
  renderDirect(): void;
}

export interface RenderLoopDeps {
  session: RenderLoopSession;
  viewer: RenderLoopViewer;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RenderLoopService {
  private animationId: number | null = null;
  private readonly session: RenderLoopSession;
  private readonly viewer: RenderLoopViewer;

  constructor(deps: RenderLoopDeps) {
    this.session = deps.session;
    this.viewer = deps.viewer;
  }

  /** Kick off the rAF loop. */
  start(): void {
    this.tick();
  }

  /** Cancel the running rAF loop (idempotent). */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /** Stop the loop and release references. */
  dispose(): void {
    this.stop();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private tick = (): void => {
    // Auto-enable perf tracing during playback for fps diagnosis
    if (this.session.isPlaying && !PerfTrace.enabled) {
      PerfTrace.enabled = true;
    } else if (!this.session.isPlaying && PerfTrace.enabled) {
      PerfTrace.enabled = false;
    }

    PerfTrace.begin('tick');

    const frameBefore = this.session.currentFrame;
    PerfTrace.begin('session.update');
    this.session.update();
    PerfTrace.end('session.update');

    // Only render on frame changes during video playback.
    // Static images and drawing are handled by event-driven updates.
    const source = this.session.currentSource;
    if (source?.type === 'video' && this.session.isPlaying) {
      if (this.session.currentFrame !== frameBefore) {
        // Use renderDirect() to avoid double-rAF delay:
        // tick() already runs inside rAF, so scheduling another rAF via refresh()
        // would delay rendering by one frame (~16.7ms), halving effective throughput.
        // Only render when the frame actually advanced to avoid wasting GPU work
        // on ticks where the accumulator hasn't crossed the frame boundary yet.
        PerfTrace.begin('viewer.renderDirect');
        this.viewer.renderDirect();
        PerfTrace.end('viewer.renderDirect');
        PerfTrace.frame();
      } else {
        PerfTrace.count('tick.noFrameAdvance');
      }
    }

    PerfTrace.end('tick');
    this.animationId = requestAnimationFrame(this.tick);
  };
}
