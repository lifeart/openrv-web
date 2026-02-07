/**
 * Default marker colors palette
 */
export const MARKER_COLORS = [
  '#ff4444', // Red
  '#44ff44', // Green
  '#4444ff', // Blue
  '#ffff44', // Yellow
  '#ff44ff', // Magenta
  '#44ffff', // Cyan
  '#ff8844', // Orange
  '#8844ff', // Purple
] as const;

export type MarkerColor = typeof MARKER_COLORS[number];

/**
 * Marker data structure with optional note and color
 */
export interface Marker {
  frame: number;
  note: string;
  color: string; // Hex color like '#ff0000'
  endFrame?: number; // Optional end frame for duration/range markers
}

/**
 * Callback interface for MarkerManager to notify Session of changes
 * without importing Session (avoids circular deps).
 */
export interface MarkerManagerCallbacks {
  onMarksChanged(marks: ReadonlyMap<number, Marker>): void;
}

/**
 * MarkerManager owns marker state and operations:
 * - Adding, removing, toggling markers
 * - Marker notes and colors
 * - Duration markers (with endFrame)
 * - Navigation to next/previous marker
 *
 * State is owned by this manager. Session delegates to it.
 */
export class MarkerManager {
  private _marks = new Map<number, Marker>();
  private _defaultColor: string = MARKER_COLORS[0];
  private _callbacks: MarkerManagerCallbacks | null = null;

  /**
   * Set the callbacks object. Called once by Session after construction.
   */
  setCallbacks(callbacks: MarkerManagerCallbacks): void {
    this._callbacks = callbacks;
  }

  private notifyChange(): void {
    this._callbacks?.onMarksChanged(this._marks);
  }

  // ---- Read-only accessors ----

  /**
   * Get all markers as a read-only map
   */
  get marks(): ReadonlyMap<number, Marker> {
    return this._marks;
  }

  /**
   * Get all marked frame numbers (for backward compatibility)
   */
  get markedFrames(): number[] {
    return Array.from(this._marks.keys());
  }

  /**
   * Get marker at a specific frame (exact match)
   */
  getMarker(frame: number): Marker | undefined {
    const m = this._marks.get(frame);
    return m ? { ...m } : undefined;
  }

  /**
   * Check if a frame has a marker (exact match)
   */
  hasMarker(frame: number): boolean {
    return this._marks.has(frame);
  }

  /**
   * Check if a given frame falls within any duration marker's range
   * Returns the marker if found, undefined otherwise
   */
  getMarkerAtFrame(frame: number): Marker | undefined {
    // First check for exact match (point marker or start of range)
    const exact = this._marks.get(frame);
    if (exact) return { ...exact };

    // Then check if frame falls within any duration marker range
    for (const marker of this._marks.values()) {
      if (marker.endFrame !== undefined && frame >= marker.frame && frame <= marker.endFrame) {
        return { ...marker };
      }
    }
    return undefined;
  }

  // ---- Mutation operations ----

  /**
   * Toggle a mark at the specified frame.
   * If the frame has a marker, it removes it; otherwise, it creates a new marker with default color.
   */
  toggleMark(frame: number): void {
    if (this._marks.has(frame)) {
      this._marks.delete(frame);
    } else {
      this._marks.set(frame, {
        frame,
        note: '',
        color: this._defaultColor,
      });
    }
    this.notifyChange();
  }

  /**
   * Add or update a marker at the specified frame.
   * If endFrame is provided, the marker spans a range from frame to endFrame.
   */
  setMarker(frame: number, note: string = '', color: string = MARKER_COLORS[0], endFrame?: number): void {
    const marker: Marker = {
      frame,
      note,
      color,
    };
    if (endFrame !== undefined && endFrame > frame) {
      marker.endFrame = endFrame;
    }
    this._marks.set(frame, marker);
    this.notifyChange();
  }

  /**
   * Update the end frame for an existing marker (to convert to/from duration marker).
   * Pass undefined to remove the end frame (convert back to point marker).
   */
  setMarkerEndFrame(frame: number, endFrame: number | undefined): void {
    const marker = this._marks.get(frame);
    if (marker) {
      if (endFrame !== undefined && endFrame > frame) {
        marker.endFrame = endFrame;
      } else {
        delete marker.endFrame;
      }
      this.notifyChange();
    }
  }

  /**
   * Update the note for an existing marker
   */
  setMarkerNote(frame: number, note: string): void {
    const marker = this._marks.get(frame);
    if (marker) {
      marker.note = note;
      this.notifyChange();
    }
  }

  /**
   * Update the color for an existing marker
   */
  setMarkerColor(frame: number, color: string): void {
    const marker = this._marks.get(frame);
    if (marker) {
      marker.color = color;
      this.notifyChange();
    }
  }

  /**
   * Remove a marker at the specified frame
   */
  removeMark(frame: number): void {
    if (this._marks.delete(frame)) {
      this.notifyChange();
    }
  }

  /**
   * Clear all markers
   */
  clearMarks(): void {
    this._marks.clear();
    this.notifyChange();
  }

  // ---- Navigation ----

  /**
   * Find the next marker frame from the given current frame.
   * Returns the frame number of the next marker, or null if none.
   * Wraps around to the first marker if none found after current frame.
   */
  findNextMarkerFrame(currentFrame: number): number | null {
    const frames = this.markedFrames.sort((a, b) => a - b);
    for (const frame of frames) {
      if (frame > currentFrame) {
        return frame;
      }
    }
    // Wrap around to first marker if none found after current frame
    const firstFrame = frames[0];
    if (firstFrame !== undefined && firstFrame !== currentFrame) {
      return firstFrame;
    }
    return null;
  }

  /**
   * Find the previous marker frame from the given current frame.
   * Returns the frame number of the previous marker, or null if none.
   * Wraps around to the last marker if none found before current frame.
   */
  findPreviousMarkerFrame(currentFrame: number): number | null {
    const frames = this.markedFrames.sort((a, b) => b - a); // Descending
    for (const frame of frames) {
      if (frame < currentFrame) {
        return frame;
      }
    }
    // Wrap around to last marker if none found before current frame
    const lastFrame = frames[0];
    if (lastFrame !== undefined && lastFrame !== currentFrame) {
      return lastFrame;
    }
    return null;
  }

  // ---- Bulk operations (used by GTO loading / state restore) ----

  /**
   * Replace all markers with the given map (used during GTO parsing / state restore).
   */
  replaceAll(marks: Map<number, Marker>): void {
    this._marks = new Map(marks);
    this.notifyChange();
  }

  /**
   * Set markers from an array of frame numbers (old format) with default styling.
   */
  setFromFrameNumbers(frames: number[]): void {
    this._marks = new Map();
    for (const frame of frames) {
      this._marks.set(frame, {
        frame,
        note: '',
        color: this._defaultColor,
      });
    }
    this.notifyChange();
  }

  /**
   * Set markers from a mixed array (supports both old number[] and new Marker[] formats).
   */
  setFromArray(items: Array<number | Marker>): void {
    this._marks.clear();
    for (const m of items) {
      if (typeof m === 'number') {
        this._marks.set(m, { frame: m, note: '', color: MARKER_COLORS[0] });
      } else {
        this._marks.set(m.frame, { ...m });
      }
    }
    this.notifyChange();
  }

  /**
   * Get all markers as an array (for serialization).
   */
  toArray(): Marker[] {
    return Array.from(this._marks.values()).map(m => ({ ...m }));
  }

  dispose(): void {
    this._callbacks = null;
  }
}
