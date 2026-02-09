/**
 * LoopAPI - Public loop control methods for the OpenRV API
 *
 * Wraps the Session class to expose loop mode and in/out point controls.
 */

import type { Session } from '../core/session/Session';
import type { LoopMode } from '../core/types/session';
import { ValidationError } from '../core/errors';

const VALID_LOOP_MODES: ReadonlySet<LoopMode> = new Set(['once', 'loop', 'pingpong']);

export class LoopAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Set the loop mode for playback.
   *
   * @param mode - One of `'once'` (play once and stop), `'loop'` (repeat from start),
   *   or `'pingpong'` (alternate forward/backward).
   * @throws {ValidationError} If `mode` is not a recognized loop mode string.
   *
   * @example
   * ```ts
   * openrv.loop.setMode('loop');
   * ```
   */
  setMode(mode: string): void {
    if (typeof mode !== 'string' || !VALID_LOOP_MODES.has(mode as LoopMode)) {
      throw new ValidationError(`Invalid loop mode: "${mode}". Valid modes: once, loop, pingpong`);
    }
    this.session.loopMode = mode as LoopMode;
  }

  /**
   * Get the current loop mode.
   *
   * @returns The current loop mode: `'once'`, `'loop'`, or `'pingpong'`.
   *
   * @example
   * ```ts
   * const mode = openrv.loop.getMode(); // e.g. 'loop'
   * ```
   */
  getMode(): string {
    return this.session.loopMode;
  }

  /**
   * Set the in point (start of playback range).
   *
   * @param frame - Frame number for the in point (1-based).
   * @throws {ValidationError} If `frame` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.loop.setInPoint(10);
   * ```
   */
  setInPoint(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new ValidationError('setInPoint() requires a valid frame number');
    }
    this.session.setInPoint(frame);
  }

  /**
   * Set the out point (end of playback range).
   *
   * @param frame - Frame number for the out point (1-based).
   * @throws {ValidationError} If `frame` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.loop.setOutPoint(200);
   * ```
   */
  setOutPoint(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new ValidationError('setOutPoint() requires a valid frame number');
    }
    this.session.setOutPoint(frame);
  }

  /**
   * Get the current in point frame number.
   *
   * @returns The in point frame number (1-based).
   *
   * @example
   * ```ts
   * const inPt = openrv.loop.getInPoint();
   * ```
   */
  getInPoint(): number {
    return this.session.inPoint;
  }

  /**
   * Get the current out point frame number.
   *
   * @returns The out point frame number (1-based).
   *
   * @example
   * ```ts
   * const outPt = openrv.loop.getOutPoint();
   * ```
   */
  getOutPoint(): number {
    return this.session.outPoint;
  }

  /**
   * Clear in/out points, resetting the playback range to the full source duration.
   *
   * @example
   * ```ts
   * openrv.loop.clearInOut();
   * ```
   */
  clearInOut(): void {
    this.session.resetInOutPoints();
  }
}
