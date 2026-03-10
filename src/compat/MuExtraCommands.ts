/**
 * MuExtraCommands — Mu `extra_commands` module compatibility layer (Phase 1)
 *
 * Provides Mu-compatible function names for the `extra_commands` module.
 * These are higher-level convenience functions built on top of `commands`.
 *
 * Access pattern: `window.rv.extra_commands.togglePlay()`
 */

import type { MuCommands } from './MuCommands';

/**
 * Lazily resolve the openrv API from the global scope.
 */
function getOpenRV(): {
  playback: {
    play(): void;
    pause(): void;
    toggle(): void;
    isPlaying(): boolean;
    getCurrentFrame(): number;
    getTotalFrames(): number;
    step(n?: number): void;
  };
  media: {
    hasMedia(): boolean;
    getResolution(): { width: number; height: number };
  };
  view: {
    fitToWindow(): void;
    setZoom(level: number): void;
    getZoom(): number;
    setPan(x: number, y: number): void;
    getPan(): { x: number; y: number };
  };
} {
  const api = (globalThis as Record<string, unknown>).openrv;
  if (!api) {
    throw new Error('window.openrv is not available. Initialize OpenRVAPI first.');
  }
  return api as ReturnType<typeof getOpenRV>;
}

/** Feedback message entry for queue-based display */
interface FeedbackEntry {
  message: string;
  duration: number;
  timestamp: number;
}

export class MuExtraCommands {
  private commands: MuCommands;
  private feedbackQueue: FeedbackEntry[] = [];
  private _currentFeedback: string | null = null;

  constructor(commands: MuCommands) {
    this.commands = commands;
  }

  // =====================================================================
  // Display Feedback (extra_commands 248-251)
  // =====================================================================

  /**
   * Display a HUD/toast feedback message. (Mu #248)
   * In the web layer this logs to console and stores the message for
   * retrieval. A full HUD overlay implementation can be plugged in later.
   */
  displayFeedback(
    message: string,
    duration: number = 2.0,
    _glyph?: string | null,
    _position?: number[],
  ): void {
    this._currentFeedback = message;
    if (typeof console !== 'undefined') {
      console.info(`[RV Feedback] ${message}`);
    }
    // Auto-clear after duration, then drain queue
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        if (this._currentFeedback === message) {
          this._currentFeedback = null;
          this.drainFeedbackQueue();
        }
      }, Math.max(0, duration * 1000));
    }
  }

  /** Show the next queued feedback message, if any. */
  private drainFeedbackQueue(): void {
    if (this._currentFeedback !== null) return;
    const next = this.feedbackQueue.shift();
    if (next) {
      this.displayFeedback(next.message, next.duration);
    }
  }

  /**
   * Queue a feedback message (displayed after current one). (Mu #249)
   */
  displayFeedbackQueue(
    message: string,
    duration: number = 2.0,
    _glyph?: string | null,
    _position?: number[],
  ): void {
    this.feedbackQueue.push({ message, duration, timestamp: Date.now() });
    // If nothing is currently showing, show this one
    if (this._currentFeedback === null) {
      this.displayFeedback(message, duration, _glyph, _position);
      this.feedbackQueue.shift();
    }
  }

  /**
   * Simple feedback display (no glyph/position). (Mu #250)
   */
  displayFeedback2(message: string, duration: number = 2.0): void {
    this.displayFeedback(message, duration);
  }

  /**
   * Feedback display with custom font sizes. (Mu #251)
   */
  displayFeedbackWithSizes(
    message: string,
    duration: number = 2.0,
    _sizes?: number[],
  ): void {
    this.displayFeedback(message, duration);
  }

  // =====================================================================
  // Session State Queries (extra_commands 252-256)
  // =====================================================================

  /** Check if the session has no media loaded. (Mu #252) */
  isSessionEmpty(): boolean {
    return !getOpenRV().media.hasMedia();
  }

  /** Check if in/out points narrow the playback range. (Mu #253) */
  isNarrowed(): boolean {
    const inPt = this.commands.inPoint();
    const outPt = this.commands.outPoint();
    const start = this.commands.frameStart();
    const end = this.commands.frameEnd();
    return inPt !== start || outPt !== end;
  }

  /** Check if there are enough frames to play. (Mu #254) */
  isPlayable(): boolean {
    return this.commands.frameEnd() > this.commands.frameStart();
  }

  /** Check if playing in the forward direction. (Mu #255) */
  isPlayingForwards(): boolean {
    return this.commands.isPlaying() && this.commands.inc() > 0;
  }

  /** Check if playing in the reverse direction. (Mu #256) */
  isPlayingBackwards(): boolean {
    return this.commands.isPlaying() && this.commands.inc() < 0;
  }

  // =====================================================================
  // Playback Toggles (extra_commands 257-260)
  // =====================================================================

  /** Toggle play/pause. (Mu #257) */
  togglePlay(): void {
    getOpenRV().playback.toggle();
  }

  /** Toggle playback direction (forward <-> backward). (Mu #258) */
  toggleForwardsBackwards(): void {
    const current = this.commands.inc();
    this.commands.setInc(current > 0 ? -1 : 1);
  }

  /** Toggle realtime mode on/off. (Mu #259) */
  toggleRealtime(): void {
    this.commands.setRealtime(!this.commands.isRealtime());
  }

  /** Toggle fullscreen mode. (Mu #260) */
  toggleFullScreen(): void {
    this.commands.fullScreenMode(!this.commands.isFullScreen());
  }

  // =====================================================================
  // View Transform (extra_commands 261-265)
  // =====================================================================

  /** Set zoom scale. (Mu #261) */
  setScale(scale: number): void {
    getOpenRV().view.setZoom(scale);
  }

  /** Get current zoom scale. (Mu #262) */
  scale(): number {
    return getOpenRV().view.getZoom();
  }

  /** Set pan translation as [x, y]. (Mu #263) */
  setTranslation(translation: [number, number]): void {
    if (!Array.isArray(translation) || translation.length < 2) {
      throw new TypeError('setTranslation() requires a [x, y] array');
    }
    getOpenRV().view.setPan(translation[0]!, translation[1]!);
  }

  /** Get current pan translation as [x, y]. (Mu #264) */
  translation(): [number, number] {
    const { x, y } = getOpenRV().view.getPan();
    return [x, y];
  }

  /** Reset pan/zoom to fit image in viewport. (Mu #265) */
  frameImage(): void {
    getOpenRV().view.fitToWindow();
  }

  // =====================================================================
  // Frame Stepping (extra_commands 266-273)
  // =====================================================================

  /** Step forward by n frames (default 1). (Mu #266) */
  stepForward(n: number = 1): void {
    getOpenRV().playback.step(Math.abs(n));
  }

  /** Step backward by n frames (default 1). (Mu #267) */
  stepBackward(n: number = 1): void {
    getOpenRV().playback.step(-Math.abs(n));
  }

  /** Step forward 1 frame. (Mu #268) */
  stepForward1(): void {
    getOpenRV().playback.step(1);
  }

  /** Step backward 1 frame. (Mu #269) */
  stepBackward1(): void {
    getOpenRV().playback.step(-1);
  }

  /** Step forward 10 frames. (Mu #270) */
  stepForward10(): void {
    getOpenRV().playback.step(10);
  }

  /** Step backward 10 frames. (Mu #271) */
  stepBackward10(): void {
    getOpenRV().playback.step(-10);
  }

  /** Step forward 100 frames. (Mu #272) */
  stepForward100(): void {
    getOpenRV().playback.step(100);
  }

  /** Step backward 100 frames. (Mu #273) */
  stepBackward100(): void {
    getOpenRV().playback.step(-100);
  }

  // =====================================================================
  // Misc (extra_commands 274, 277-278)
  // =====================================================================

  /** Get total number of frames. (Mu #274) */
  numFrames(): number {
    return getOpenRV().playback.getTotalFrames();
  }

  /** Fit and center the image in the viewport. (Mu #277) */
  centerResizeFit(): void {
    getOpenRV().view.fitToWindow();
  }

  /** Get current image aspect ratio. (Mu #278) */
  currentImageAspect(): number {
    return this.commands.contentAspect();
  }
}
