/**
 * AudioAPI - Public audio control methods for the OpenRV API
 *
 * Wraps the Session class to expose volume and mute controls.
 */

import type { Session } from '../core/session/Session';
import { ValidationError } from '../core/errors';

export class AudioAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Set the audio volume level.
   *
   * @param volume - A number between 0.0 (mute) and 1.0 (max). Values outside
   *   this range are clamped.
   * @throws {ValidationError} If `volume` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.audio.setVolume(0.75);
   * ```
   */
  setVolume(volume: number): void {
    if (typeof volume !== 'number' || isNaN(volume)) {
      throw new ValidationError('setVolume() requires a valid number between 0 and 1');
    }
    // Clamp at API boundary so the contract is explicit
    const clamped = Math.max(0, Math.min(1, volume));
    this.session.volume = clamped;
  }

  /**
   * Get the current audio volume level.
   *
   * @returns The current volume as a number between 0.0 and 1.0.
   *
   * @example
   * ```ts
   * const vol = openrv.audio.getVolume();
   * ```
   */
  getVolume(): number {
    return this.session.volume;
  }

  /**
   * Mute audio output.
   *
   * @example
   * ```ts
   * openrv.audio.mute();
   * ```
   */
  mute(): void {
    this.session.muted = true;
  }

  /**
   * Unmute audio output.
   *
   * @example
   * ```ts
   * openrv.audio.unmute();
   * ```
   */
  unmute(): void {
    this.session.muted = false;
  }

  /**
   * Check if audio is currently muted.
   *
   * @returns `true` if muted, `false` otherwise.
   *
   * @example
   * ```ts
   * if (openrv.audio.isMuted()) { openrv.audio.unmute(); }
   * ```
   */
  isMuted(): boolean {
    return this.session.muted;
  }

  /**
   * Toggle the mute state (mute if unmuted, unmute if muted).
   *
   * @example
   * ```ts
   * openrv.audio.toggleMute();
   * ```
   */
  toggleMute(): void {
    this.session.toggleMute();
  }

  /**
   * Enable or disable pitch correction for non-1x playback speeds.
   * When enabled, audio pitch stays the same regardless of playback speed.
   *
   * @param preserve - `true` to preserve pitch (default behavior), `false` for
   *   natural pitch shift proportional to speed.
   * @throws {ValidationError} If `preserve` is not a boolean.
   *
   * @example
   * ```ts
   * openrv.audio.setPreservesPitch(false); // allow pitch to shift with speed
   * ```
   */
  setPreservesPitch(preserve: boolean): void {
    if (typeof preserve !== 'boolean') {
      throw new ValidationError('setPreservesPitch() requires a boolean value');
    }
    this.session.preservesPitch = preserve;
  }

  /**
   * Check if pitch correction is enabled.
   *
   * @returns `true` if pitch is preserved during speed changes, `false` otherwise.
   *
   * @example
   * ```ts
   * const preserved = openrv.audio.getPreservesPitch();
   * ```
   */
  getPreservesPitch(): boolean {
    return this.session.preservesPitch;
  }
}
