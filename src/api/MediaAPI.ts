/**
 * MediaAPI - Public media information methods for the OpenRV API
 *
 * Wraps the Session class to expose media/source information.
 */

import type { Session } from '../core/session/Session';

/**
 * Public source information returned by the API
 */
export interface SourceInfo {
  name: string;
  type: 'image' | 'video' | 'sequence';
  width: number;
  height: number;
  duration: number;
  fps: number;
}

export class MediaAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Get information about the currently loaded source
   * @returns Source info or null if no media is loaded
   */
  getCurrentSource(): SourceInfo | null {
    const source = this.session.currentSource;
    if (!source) return null;

    return {
      name: source.name,
      type: source.type,
      width: source.width,
      height: source.height,
      duration: source.duration,
      fps: source.fps,
    };
  }

  /**
   * Get total duration in frames
   */
  getDuration(): number {
    return this.session.currentSource?.duration ?? 0;
  }

  /**
   * Get frames per second of current source
   */
  getFPS(): number {
    return this.session.fps;
  }

  /**
   * Get resolution of current source
   */
  getResolution(): { width: number; height: number } {
    const source = this.session.currentSource;
    return {
      width: source?.width ?? 0,
      height: source?.height ?? 0,
    };
  }

  /**
   * Check if media is currently loaded
   */
  hasMedia(): boolean {
    return this.session.currentSource !== null;
  }

  /**
   * Get the number of loaded sources
   */
  getSourceCount(): number {
    return this.session.sourceCount;
  }
}
