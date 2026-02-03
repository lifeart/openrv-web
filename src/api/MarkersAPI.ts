/**
 * MarkersAPI - Public marker management methods for the OpenRV API
 *
 * Wraps the Session class to expose marker operations.
 */

import type { Session } from '../core/session/Session';

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
   * Add a marker at the specified frame
   * @param frame Frame number (start frame)
   * @param note Optional note text
   * @param color Optional hex color (e.g., '#ff0000')
   * @param endFrame Optional end frame for duration/range markers
   */
  add(frame: number, note?: string, color?: string, endFrame?: number): void {
    if (typeof frame !== 'number' || isNaN(frame) || frame < 1) {
      throw new Error('add() requires a valid positive frame number');
    }
    if (note !== undefined && typeof note !== 'string') {
      throw new Error('add() note must be a string');
    }
    if (color !== undefined && typeof color !== 'string') {
      throw new Error('add() color must be a string');
    }
    if (endFrame !== undefined) {
      if (typeof endFrame !== 'number' || isNaN(endFrame)) {
        throw new Error('add() endFrame must be a valid number');
      }
      if (endFrame <= frame) {
        throw new Error('add() endFrame must be greater than frame');
      }
    }
    this.session.setMarker(frame, note ?? '', color ?? '#ff4444', endFrame);
  }

  /**
   * Remove a marker at the specified frame
   * @param frame Frame number
   */
  remove(frame: number): void {
    if (typeof frame !== 'number' || isNaN(frame)) {
      throw new Error('remove() requires a valid frame number');
    }
    this.session.removeMark(frame);
  }

  /**
   * Get all markers
   * @returns Array of marker objects sorted by frame
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
   * Get marker at a specific frame
   * @returns Marker info or null if no marker at that frame
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
   * Clear all markers
   */
  clear(): void {
    this.session.clearMarks();
  }

  /**
   * Navigate to the next marker from current position
   * @returns Frame number of the next marker, or null if none
   */
  goToNext(): number | null {
    return this.session.goToNextMarker();
  }

  /**
   * Navigate to the previous marker from current position
   * @returns Frame number of the previous marker, or null if none
   */
  goToPrevious(): number | null {
    return this.session.goToPreviousMarker();
  }

  /**
   * Get the total number of markers
   */
  count(): number {
    return this.session.marks.size;
  }
}
