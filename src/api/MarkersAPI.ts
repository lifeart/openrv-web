/**
 * MarkersAPI - Public marker management methods for the OpenRV API
 *
 * Wraps the Session class to expose marker operations.
 */

import type { Session } from '../core/session/Session';
import { ValidationError } from '../core/errors';

/**
 * Public marker data returned by the API
 */
export interface MarkerInfo {
  frame: number;
  note: string;
  color: string;
  endFrame?: number; // Optional end frame for duration/range markers
}

export class MarkersAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Add a marker at the specified frame.
   *
   * @param frame - Frame number for the marker (1-based, must be positive).
   * @param note - Optional note/comment text for the marker.
   * @param color - Optional hex color string (e.g., `'#ff0000'`). Defaults to `'#ff4444'`.
   * @param endFrame - Optional end frame for duration/range markers. Must be greater than `frame`.
   * @throws {ValidationError} If `frame` is not a positive number, or if `note`/`color`
   *   are provided but not strings, or if `endFrame` is invalid or not greater than `frame`.
   *
   * @example
   * ```ts
   * openrv.markers.add(50, 'Review this', '#00ff00');
   * ```
   */
  add(frame: number, note?: string, color?: string, endFrame?: number): void {
    if (typeof frame !== 'number' || isNaN(frame) || frame < 1) {
      throw new ValidationError('add() requires a valid positive frame number');
    }
    if (note !== undefined && typeof note !== 'string') {
      throw new ValidationError('add() note must be a string');
    }
    if (color !== undefined && typeof color !== 'string') {
      throw new ValidationError('add() color must be a string');
    }
    if (endFrame !== undefined) {
      if (typeof endFrame !== 'number' || isNaN(endFrame)) {
        throw new ValidationError('add() endFrame must be a valid number');
      }
      if (endFrame <= frame) {
        throw new ValidationError('add() endFrame must be greater than frame');
      }
    }
    this.session.setMarker(frame, note ?? '', color ?? '#ff4444', endFrame);
  }

  /**
   * Remove a marker at the specified frame.
   *
   * @param frame - Frame number of the marker to remove (1-based).
   * @throws {ValidationError} If `frame` is not a valid number or is NaN.
   *
   * @example
   * ```ts
   * openrv.markers.remove(50);
   * ```
   */
  remove(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new ValidationError('remove() requires a valid frame number');
    }
    this.session.removeMark(frame);
  }

  /**
   * Get all markers, sorted by frame number.
   *
   * @returns An array of {@link MarkerInfo} objects, sorted in ascending frame order.
   *
   * @example
   * ```ts
   * const markers = openrv.markers.getAll();
   * markers.forEach(m => console.log(m.frame, m.note));
   * ```
   */
  getAll(): MarkerInfo[] {
    const marks = this.session.marks;
    return Array.from(marks.values())
      .map((m) => {
        const info: MarkerInfo = {
          frame: m.frame,
          note: m.note,
          color: m.color,
        };
        if (m.endFrame !== undefined) {
          info.endFrame = m.endFrame;
        }
        return info;
      })
      .sort((a, b) => a.frame - b.frame);
  }

  /**
   * Get marker at a specific frame.
   *
   * @param frame - The frame number to look up.
   * @returns The {@link MarkerInfo} at that frame, or `null` if no marker exists there.
   *
   * @example
   * ```ts
   * const marker = openrv.markers.get(50);
   * if (marker) console.log(marker.note);
   * ```
   */
  get(frame: number): MarkerInfo | null {
    const marker = this.session.getMarker(frame);
    if (!marker) return null;
    const info: MarkerInfo = {
      frame: marker.frame,
      note: marker.note,
      color: marker.color,
    };
    if (marker.endFrame !== undefined) {
      info.endFrame = marker.endFrame;
    }
    return info;
  }

  /**
   * Clear all markers from the session.
   *
   * @example
   * ```ts
   * openrv.markers.clear();
   * ```
   */
  clear(): void {
    this.session.clearMarks();
  }

  /**
   * Navigate to the next marker from the current playback position.
   *
   * @returns The frame number of the next marker, or `null` if there is no subsequent marker.
   *
   * @example
   * ```ts
   * const next = openrv.markers.goToNext();
   * ```
   */
  goToNext(): number | null {
    return this.session.goToNextMarker();
  }

  /**
   * Navigate to the previous marker from the current playback position.
   *
   * @returns The frame number of the previous marker, or `null` if there is no preceding marker.
   *
   * @example
   * ```ts
   * const prev = openrv.markers.goToPrevious();
   * ```
   */
  goToPrevious(): number | null {
    return this.session.goToPreviousMarker();
  }

  /**
   * Get the total number of markers.
   *
   * @returns The count of markers in the session.
   *
   * @example
   * ```ts
   * const n = openrv.markers.count();
   * ```
   */
  count(): number {
    return this.session.marks.size;
  }
}
