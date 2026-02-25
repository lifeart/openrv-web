/**
 * PlaybackAPI - Public playback control methods for the OpenRV API
 *
 * Wraps the Session class to expose playback operations.
 */

import type { Session } from '../core/session/Session';
import { ValidationError } from '../core/errors';

export class PlaybackAPI {
  private session: Session;

  constructor(session: Session) {
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
    this.session.pause();
    this.session.goToStart();
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
    if (typeof frame !== 'number' || isNaN(frame)) {
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
    if (typeof direction !== 'number' || isNaN(direction)) {
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

      let targetFrame = currentFrame + steps;

      if (this.session.loopMode === 'loop') {
        // Wrap around using modular arithmetic
        targetFrame = ((targetFrame - 1) % totalFrames + totalFrames) % totalFrames + 1;
      } else {
        // Clamp to valid range [1, totalFrames]
        targetFrame = Math.max(1, Math.min(totalFrames, targetFrame));
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
    return this.session.playbackSpeed;
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
    return this.session.currentSource?.duration ?? 0;
  }
}
