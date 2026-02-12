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
   * Get information about the currently loaded source.
   *
   * @returns A {@link SourceInfo} object with name, type, dimensions, duration, and fps,
   *   or `null` if no media is loaded.
   *
   * @example
   * ```ts
   * const src = openrv.media.getCurrentSource();
   * if (src) console.log(`${src.name}: ${src.width}x${src.height}`);
   * ```
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
   * Get total duration in frames.
   *
   * @returns The total number of frames in the current source, or 0 if no source is loaded.
   *
   * @example
   * ```ts
   * const frames = openrv.media.getDuration();
   * ```
   */
  getDuration(): number {
    return this.session.currentSource?.duration ?? 0;
  }

  /**
   * Get the frames per second of the current source.
   *
   * @returns The FPS value for the active session.
   *
   * @example
   * ```ts
   * const fps = openrv.media.getFPS(); // e.g. 24
   * ```
   */
  getFPS(): number {
    return this.session.fps;
  }

  /**
   * Get the resolution of the current source.
   *
   * @returns An object with `width` and `height` in pixels, or `{ width: 0, height: 0 }` if
   *   no source is loaded.
   *
   * @example
   * ```ts
   * const { width, height } = openrv.media.getResolution();
   * ```
   */
  getResolution(): { width: number; height: number } {
    const source = this.session.currentSource;
    return {
      width: source?.width ?? 0,
      height: source?.height ?? 0,
    };
  }

  /**
   * Check if any media source is currently loaded.
   *
   * @returns `true` if a source is loaded, `false` otherwise.
   *
   * @example
   * ```ts
   * if (openrv.media.hasMedia()) { openrv.playback.play(); }
   * ```
   */
  hasMedia(): boolean {
    return this.session.currentSource !== null;
  }

  /**
   * Get the number of loaded sources.
   *
   * @returns The count of media sources currently loaded in the session.
   *
   * @example
   * ```ts
   * const count = openrv.media.getSourceCount();
   * ```
   */
  getSourceCount(): number {
    return this.session.sourceCount;
  }
}
