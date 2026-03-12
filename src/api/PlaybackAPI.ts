/**
 * PlaybackAPI - Public playback control methods for the OpenRV API
 *
 * Wraps the Session class to expose playback operations.
 */

import type { Session } from '../core/session/Session';
import type { PlaybackMode } from '../core/types/session';
import { ValidationError } from '../core/errors';
import { DisposableAPI } from './Disposable';

export class PlaybackAPI extends DisposableAPI {
  private session: Session;

  constructor(session: Session) {
    super();
    this.session = session;
  }

  /**
   * Start playback from the current frame position.
   *
   * @example
   * ```ts
   * openrv.playback.play();
   * ```
   */
  play(): void {
    this.assertNotDisposed();
    this.session.play();
  }

  /**
   * Pause playback at the current frame.
   *
   * @example
   * ```ts
   * openrv.playback.pause();
   * ```
   */
  pause(): void {
    this.assertNotDisposed();
    this.session.pause();
  }

  /**
   * Toggle between play and pause states.
   *
   * @example
   * ```ts
   * openrv.playback.toggle();
   * ```
   */
  toggle(): void {
    this.assertNotDisposed();
    this.session.togglePlayback();
  }

  /**
   * Stop playback and seek to the start (in point).
   *
   * @example
   * ```ts
   * openrv.playback.stop();
   * ```
   */
  stop(): void {
    this.assertNotDisposed();
    this.session.stop();
  }

  /**
   * Seek to a specific frame number.
   *
   * @param frame - Frame number (1-based, clamped to valid range by the session).
   * @throws {ValidationError} If `frame` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.playback.seek(100);
   * ```
   */
  seek(frame: number): void {
    this.assertNotDisposed();
    if (typeof frame !== 'number' || !Number.isFinite(frame)) {
      throw new ValidationError('seek() requires a valid frame number');
    }
    this.session.goToFrame(frame);
  }

  /**
   * Step forward or backward by the given number of frames.
   *
   * @param direction - Positive for forward, negative for backward (default: 1).
   *   Zero is a no-op. The magnitude determines how many frames to step.
   *   The value is rounded to the nearest integer.
   * @throws {ValidationError} If `direction` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.playback.step();    // step forward 1 frame
   * openrv.playback.step(-5);  // step backward 5 frames
   * ```
   */
  step(direction: number = 1): void {
    this.assertNotDisposed();
    if (typeof direction !== 'number' || !Number.isFinite(direction)) {
      throw new ValidationError('step() requires a valid number');
    }
    const steps = Math.round(direction);
    if (steps === 0) return;

    if (steps === 1) {
      this.session.stepForward();
    } else if (steps === -1) {
      this.session.stepBackward();
    } else {
      // O(1) multi-frame step: compute target frame directly
      const currentFrame = this.session.currentFrame;
      const totalFrames = this.session.currentSource?.duration ?? 0;
      if (totalFrames <= 0) return;

      // Use in/out points as the effective range, matching PlaybackEngine behavior
      const rangeStart = this.session.inPoint;
      const rangeEnd = this.session.outPoint;
      const rangeLength = rangeEnd - rangeStart + 1;

      if (rangeLength <= 0) return;

      let targetFrame = currentFrame + steps;

      if (this.session.loopMode === 'loop') {
        // Wrap around within in/out range using modular arithmetic
        targetFrame =
          ((((targetFrame - rangeStart) % rangeLength) + rangeLength) % rangeLength) + rangeStart;
      } else if (this.session.loopMode === 'pingpong') {
        // Reflect off boundaries like a bouncing ball
        let offset = targetFrame - rangeStart;
        const cycle = rangeLength > 1 ? rangeLength - 1 : 1;
        // Normalize offset to positive range for reflection
        offset = ((offset % (2 * cycle)) + 2 * cycle) % (2 * cycle);
        if (offset <= cycle) {
          targetFrame = rangeStart + offset;
        } else {
          targetFrame = rangeEnd - (offset - cycle);
        }
      } else {
        // 'once': Clamp to in/out range
        targetFrame = Math.max(rangeStart, Math.min(rangeEnd, targetFrame));
      }

      this.session.goToFrame(targetFrame);
    }
  }

  /**
   * Set playback speed multiplier.
   *
   * @param speed - Speed multiplier, clamped to the range 0.1 (slow) to 8.0 (fast).
   *   A value of 1.0 is normal speed.
   * @throws {ValidationError} If `speed` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.playback.setSpeed(2.0); // 2x speed
   * ```
   */
  setSpeed(speed: number): void {
    this.assertNotDisposed();
    if (typeof speed !== 'number' || isNaN(speed)) {
      throw new ValidationError('setSpeed() requires a valid number');
    }
    // Clamp at API boundary so the contract is explicit
    const clamped = Math.max(0.1, Math.min(8, speed));
    this.session.playbackSpeed = clamped;
  }

  /**
   * Get current playback speed multiplier.
   *
   * @returns The current speed multiplier (between 0.1 and 8.0).
   *
   * @example
   * ```ts
   * const speed = openrv.playback.getSpeed(); // e.g. 1.0
   * ```
   */
  getSpeed(): number {
    this.assertNotDisposed();
    return this.session.playbackSpeed;
  }

  /**
   * Set the playback direction.
   *
   * @param direction - Positive values (including 0) set forward playback,
   *   negative values set reverse playback. The value is normalized to +1 or -1.
   *
   * @example
   * ```ts
   * openrv.playback.setPlayDirection(-1); // reverse
   * openrv.playback.setPlayDirection(1);  // forward
   * ```
   */
  setPlayDirection(direction: number): void {
    this.assertNotDisposed();
    if (typeof direction !== 'number' || isNaN(direction)) {
      throw new ValidationError('setPlayDirection() requires a valid number');
    }
    this.session.playDirection = direction;
  }

  /**
   * Get the current playback direction.
   *
   * @returns `1` for forward, `-1` for reverse.
   *
   * @example
   * ```ts
   * const dir = openrv.playback.getPlayDirection(); // 1 or -1
   * ```
   */
  getPlayDirection(): number {
    this.assertNotDisposed();
    return this.session.playDirection;
  }

  /**
   * Check if playback is currently active.
   *
   * @returns `true` if playing, `false` if paused or stopped.
   *
   * @example
   * ```ts
   * if (openrv.playback.isPlaying()) { openrv.playback.pause(); }
   * ```
   */
  isPlaying(): boolean {
    this.assertNotDisposed();
    return this.session.isPlaying;
  }

  /**
   * Get current frame number (1-based).
   *
   * @returns The current frame number, starting from 1.
   *
   * @example
   * ```ts
   * const frame = openrv.playback.getCurrentFrame();
   * ```
   */
  getCurrentFrame(): number {
    this.assertNotDisposed();
    return this.session.currentFrame;
  }

  /**
   * Get total number of frames in the current source.
   *
   * @returns The total frame count, or 0 if no source is loaded.
   *
   * @example
   * ```ts
   * const total = openrv.playback.getTotalFrames();
   * ```
   */
  getTotalFrames(): number {
    this.assertNotDisposed();
    return this.session.currentSource?.duration ?? 0;
  }

  /**
   * Set the playback mode.
   *
   * @param mode - Either `'realtime'` (frames may be skipped to maintain target FPS)
   *   or `'playAllFrames'` (every frame is displayed, effective FPS may drop).
   * @throws {ValidationError} If `mode` is not a valid playback mode.
   *
   * @example
   * ```ts
   * openrv.playback.setPlaybackMode('playAllFrames');
   * ```
   */
  setPlaybackMode(mode: PlaybackMode): void {
    this.assertNotDisposed();
    if (mode !== 'realtime' && mode !== 'playAllFrames') {
      throw new ValidationError("setPlaybackMode() requires 'realtime' or 'playAllFrames'");
    }
    this.session.playbackMode = mode;
  }

  /**
   * Get the current playback mode.
   *
   * @returns `'realtime'` or `'playAllFrames'`.
   *
   * @example
   * ```ts
   * const mode = openrv.playback.getPlaybackMode(); // e.g. 'realtime'
   * ```
   */
  getPlaybackMode(): PlaybackMode {
    this.assertNotDisposed();
    return this.session.playbackMode;
  }

  /**
   * Get the measured (actual) playback FPS.
   *
   * During active playback, this returns the real throughput measured by the
   * playback engine (rolling average updated every ~500 ms). When playback is
   * stopped, returns `0`.
   *
   * @returns The measured FPS as a number (0 when not playing).
   *
   * @example
   * ```ts
   * const real = openrv.playback.getMeasuredFPS(); // e.g. 23.4
   * ```
   */
  getMeasuredFPS(): number {
    this.assertNotDisposed();
    return this.session.effectiveFps;
  }

  /**
   * Check whether the playback engine is currently buffering.
   *
   * Returns `true` when the engine is waiting for frames (e.g. play-all-frames
   * starvation or HDR initial buffering delay).
   *
   * @returns `true` if buffering, `false` otherwise.
   *
   * @example
   * ```ts
   * if (openrv.playback.isBuffering()) { showSpinner(); }
   * ```
   */
  isBuffering(): boolean {
    this.assertNotDisposed();
    return this.session.isBuffering;
  }

  /**
   * Get the cumulative count of dropped (skipped) frames since playback started.
   *
   * In realtime mode the engine may skip frames to maintain the target FPS.
   * This counter reflects the total number of such skips.
   *
   * @returns The number of dropped frames.
   *
   * @example
   * ```ts
   * const dropped = openrv.playback.getDroppedFrameCount(); // e.g. 12
   * ```
   */
  getDroppedFrameCount(): number {
    this.assertNotDisposed();
    return this.session.droppedFrameCount;
  }
}
