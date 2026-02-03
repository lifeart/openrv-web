/**
 * LoopAPI - Public loop control methods for the OpenRV API
 *
 * Wraps the Session class to expose loop mode and in/out point controls.
 */

import type { Session, LoopMode } from '../core/session/Session';

const VALID_LOOP_MODES: ReadonlySet<LoopMode> = new Set(['once', 'loop', 'pingpong']);

export class LoopAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Set the loop mode
   * @param mode 'once' | 'loop' | 'pingpong'
   */
  setMode(mode: string): void {
    if (typeof mode !== 'string' || !VALID_LOOP_MODES.has(mode as LoopMode)) {
      throw new Error(`Invalid loop mode: "${mode}". Valid modes: once, loop, pingpong`);
    }
    this.session.loopMode = mode as LoopMode;
  }

  /**
   * Get current loop mode
   */
  getMode(): string {
    return this.session.loopMode;
  }

  /**
   * Set the in point (start of playback range)
   * @param frame Frame number for in point
   */
  setInPoint(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new Error('setInPoint() requires a valid frame number');
    }
    this.session.setInPoint(frame);
  }

  /**
   * Set the out point (end of playback range)
   * @param frame Frame number for out point
   */
  setOutPoint(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new Error('setOutPoint() requires a valid frame number');
    }
    this.session.setOutPoint(frame);
  }

  /**
   * Get current in point
   */
  getInPoint(): number {
    return this.session.inPoint;
  }

  /**
   * Get current out point
   */
  getOutPoint(): number {
    return this.session.outPoint;
  }

  /**
   * Clear in/out points (reset to full range)
   */
  clearInOut(): void {
    this.session.resetInOutPoints();
  }
}
