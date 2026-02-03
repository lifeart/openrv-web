/**
 * AudioAPI - Public audio control methods for the OpenRV API
 *
 * Wraps the Session class to expose volume and mute controls.
 */

import type { Session } from '../core/session/Session';

export class AudioAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Set volume level
   * @param volume Volume level 0.0 to 1.0 (clamped)
   */
  setVolume(volume: number): void {
    if (typeof volume !== 'number' || isNaN(volume)) {
      throw new Error('setVolume() requires a valid number between 0 and 1');
    }
    // Clamp at API boundary so the contract is explicit
    const clamped = Math.max(0, Math.min(1, volume));
    this.session.volume = clamped;
  }

  /**
   * Get current volume level (0.0 to 1.0)
   */
  getVolume(): number {
    return this.session.volume;
  }

  /**
   * Mute audio
   */
  mute(): void {
    this.session.muted = true;
  }

  /**
   * Unmute audio
   */
  unmute(): void {
    this.session.muted = false;
  }

  /**
   * Check if audio is muted
   */
  isMuted(): boolean {
    return this.session.muted;
  }

  /**
   * Toggle mute state
   */
  toggleMute(): void {
    this.session.toggleMute();
  }
}
