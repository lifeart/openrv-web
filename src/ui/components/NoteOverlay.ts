/**
 * NoteOverlay - Draws colored bars on the timeline canvas for notes.
 *
 * Each note is rendered as a thin horizontal bar color-coded by status:
 * - open: amber (#fbbf24)
 * - resolved: green (#22c55e)
 * - wontfix: gray (#6b7280)
 *
 * Only draws notes matching the current source index.
 */

import type { Session } from '../../core/session/Session';
import type { NoteStatus } from '../../core/session/NoteManager';

/** Color mapping for note statuses */
const STATUS_COLORS: Record<NoteStatus, string> = {
  open: '#fbbf24',
  resolved: '#22c55e',
  wontfix: '#6b7280',
};

/** Height of the note indicator bar in pixels */
const BAR_HEIGHT = 4;

export class NoteOverlay {
  private session: Session;
  private boundRedraw: (() => void) | null = null;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Register a callback that triggers timeline redraw when notes change.
   */
  setRedrawCallback(cb: () => void): void {
    // Clean up previous subscription if any
    if (this.boundRedraw) {
      this.session.off('notesChanged', this.boundRedraw);
    }
    this.boundRedraw = cb;
    this.session.on('notesChanged', this.boundRedraw);
  }

  /**
   * Draw note bars onto the timeline canvas context.
   *
   * @param ctx - Canvas 2D rendering context
   * @param trackWidth - Width of the track area (excluding padding)
   * @param totalFrames - Total number of frames in the current source
   * @param paddingLeft - Left padding of the track area
   * @param currentSourceIndex - Source index to filter notes by
   * @param trackY - Y position of the track area
   * @param trackHeight - Height of the track area
   */
  update(
    ctx: CanvasRenderingContext2D,
    trackWidth: number,
    totalFrames: number,
    paddingLeft: number,
    currentSourceIndex: number,
    trackY: number,
    trackHeight: number,
  ): void {
    if (totalFrames <= 1) return;

    const notes = this.session.noteManager.getNotesForSource(currentSourceIndex);
    // Only top-level notes (no replies)
    const topLevel = notes.filter(n => n.parentId === null);
    if (topLevel.length === 0) return;

    const savedAlpha = ctx.globalAlpha;
    const barY = trackY + trackHeight + 2; // Just below the track

    const frameToX = (frame: number) =>
      paddingLeft + ((frame - 1) / Math.max(1, totalFrames - 1)) * trackWidth;

    for (const note of topLevel) {
      const startX = frameToX(note.frameStart);
      const endX = frameToX(note.frameEnd);
      const width = Math.max(endX - startX, 2); // Minimum 2px for visibility

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = STATUS_COLORS[note.status];
      ctx.fillRect(startX, barY, width, BAR_HEIGHT);
    }

    // Always restore globalAlpha
    ctx.globalAlpha = savedAlpha;
  }

  /**
   * Get the Y position and height of the note bar area for hit testing.
   */
  getBarBounds(trackY: number, trackHeight: number): { y: number; height: number } {
    return { y: trackY + trackHeight + 2, height: BAR_HEIGHT };
  }

  dispose(): void {
    if (this.boundRedraw) {
      this.session.off('notesChanged', this.boundRedraw);
      this.boundRedraw = null;
    }
  }
}
