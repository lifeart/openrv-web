/**
 * MediaAPI - Public media information methods for the OpenRV API
 *
 * Wraps the Session class to expose media/source information.
 */

import type { Session } from '../core/session/Session';
import type { PatternName, GradientDirection } from '../nodes/sources/ProceduralSourceNode';
import { DisposableAPI } from './Disposable';

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

export class MediaAPI extends DisposableAPI {
  private session: Session;

  constructor(session: Session) {
    super();
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
    this.assertNotDisposed();
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
    this.assertNotDisposed();
    return this.session.currentSource?.duration ?? 0;
  }

  /**
   * Get the frames per second of the current source.
   *
   * @returns The FPS of the current source, or the session playback FPS if no source is loaded.
   *
   * @example
   * ```ts
   * const fps = openrv.media.getFPS(); // e.g. 24
   * ```
   */
  getFPS(): number {
    this.assertNotDisposed();
    return this.session.currentSource?.fps ?? this.session.fps;
  }

  /**
   * Get the session playback FPS (which may differ from the source FPS if overridden).
   *
   * @returns The current session playback rate in frames per second.
   *
   * @example
   * ```ts
   * const playbackFps = openrv.media.getPlaybackFPS(); // e.g. 48
   * ```
   */
  getPlaybackFPS(): number {
    this.assertNotDisposed();
    return this.session.fps;
  }

  /**
   * Set the session playback FPS (overrides the source FPS for playback timing).
   *
   * @param fps - The desired playback rate in frames per second. Must be a positive number.
   *
   * @example
   * ```ts
   * openrv.media.setPlaybackFPS(48); // play back at 48 fps
   * ```
   */
  setPlaybackFPS(fps: number): void {
    this.assertNotDisposed();
    if (typeof fps !== 'number' || isNaN(fps) || fps <= 0) {
      throw new TypeError('setPlaybackFPS() requires a positive number');
    }
    this.session.fps = fps;
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
    this.assertNotDisposed();
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
    this.assertNotDisposed();
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
    this.assertNotDisposed();
    return this.session.sourceCount;
  }

  /**
   * Load a procedural test pattern as a source.
   *
   * @param pattern - The pattern type to generate (e.g., 'smpte_bars', 'checkerboard')
   * @param options - Optional configuration for resolution, color, and other parameters
   *
   * @example
   * ```ts
   * openrv.media.loadProceduralSource('smpte_bars');
   * openrv.media.loadProceduralSource('solid', { color: [1, 0, 0, 1] });
   * openrv.media.loadProceduralSource('checkerboard', { width: 3840, height: 2160, cellSize: 32 });
   * ```
   */
  loadProceduralSource(
    pattern: PatternName,
    options?: {

      width?: number;
      height?: number;
      color?: [number, number, number, number];
      direction?: GradientDirection;
      cellSize?: number;
      steps?: number;
      fps?: number;
      duration?: number;
    },
  ): void {
    this.assertNotDisposed();
    this.session.loadProceduralSource(pattern, options);
  }

  /**
   * Load a procedural source from a `.movieproc` URL string.
   *
   * @param url - The movieproc URL (e.g., 'smpte_bars,width=1920,height=1080.movieproc')
   *
   * @example
   * ```ts
   * openrv.media.loadMovieProc('checkerboard,cellSize=32.movieproc');
   * ```
   */
  loadMovieProc(url: string): void {
    this.assertNotDisposed();
    this.session.loadMovieProc(url);
  }
}
