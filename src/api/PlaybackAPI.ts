/**
 * PlaybackAPI - Public playback control methods for the OpenRV API
 *
 * Wraps the Session class to expose playback operations.
 */

import type { Session } from '../core/session/Session';

export class PlaybackAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Start playback
   */
  play(): void {
    this.session.play();
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.session.pause();
  }

  /**
   * Toggle play/pause state
   */
  toggle(): void {
    this.session.togglePlayback();
  }

  /**
   * Stop playback and seek to start (in point)
   */
  stop(): void {
    this.session.pause();
    this.session.goToStart();
  }

  /**
   * Seek to a specific frame number
   * @param frame Frame number (1-based, clamped to valid range)
   */
  seek(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new Error('seek() requires a valid frame number');
    }
    this.session.goToFrame(frame);
  }

  /**
   * Step forward or backward by the given number of frames
   * @param direction Positive for forward, negative for backward (default: 1).
   *                  Zero is a no-op. The magnitude determines how many frames to step.
   */
  step(direction: number = 1): void {
    if (typeof direction !== 'number' || isNaN(direction)) {
      throw new Error('step() requires a valid number');
    }
    const steps = Math.round(direction);
    if (steps === 0) return;
    const count = Math.abs(steps);
    if (steps > 0) {
      for (let i = 0; i < count; i++) {
        this.session.stepForward();
      }
    } else {
      for (let i = 0; i < count; i++) {
        this.session.stepBackward();
      }
    }
  }

  /**
   * Set playback speed multiplier
   * @param speed Speed multiplier (clamped to 0.1-8 range)
   */
  setSpeed(speed: number): void {
    if (typeof speed !== 'number' || isNaN(speed)) {
      throw new Error('setSpeed() requires a valid number');
    }
    // Clamp at API boundary so the contract is explicit
    const clamped = Math.max(0.1, Math.min(8, speed));
    this.session.playbackSpeed = clamped;
  }

  /**
   * Get current playback speed multiplier
   */
  getSpeed(): number {
    return this.session.playbackSpeed;
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.session.isPlaying;
  }

  /**
   * Get current frame number (1-based)
   */
  getCurrentFrame(): number {
    return this.session.currentFrame;
  }

  /**
   * Get total number of frames in the source
   */
  getTotalFrames(): number {
    return this.session.currentSource?.duration ?? 0;
  }
}
