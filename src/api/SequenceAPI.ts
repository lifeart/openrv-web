/**
 * SequenceAPI - Public sequence inspection methods for the OpenRV API
 *
 * Wraps the Session class to expose image-sequence missing-frame detection
 * and metadata queries on the active source.
 */

import type { Session } from '../core/session/Session';
import type { SequenceInfo } from '../utils/media/SequenceLoader';
import { isFrameMissing, detectMissingFrames } from '../utils/media/SequenceLoader';

export class SequenceAPI {
  private session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  /**
   * Get the SequenceInfo for the current source, if it is a sequence.
   *
   * @returns The active sequence info or `null` if the current source is not a sequence.
   */
  private getSequenceInfo(): SequenceInfo | null {
    const source = this.session.currentSource;
    return source?.sequenceInfo ?? null;
  }

  /**
   * Return a list of missing frame numbers in the active sequence.
   *
   * Missing frames are gaps between the start and end frame numbers of
   * the loaded image sequence.
   *
   * @returns An array of missing frame numbers, or an empty array if no
   *   sequence is loaded or there are no gaps.
   *
   * @example
   * ```ts
   * const missing = openrv.sequence.detectMissingFrames();
   * // e.g. [5, 12, 13]
   * ```
   */
  detectMissingFrames(): number[] {
    const info = this.getSequenceInfo();
    if (!info) return [];
    return detectMissingFrames(info.frames);
  }

  /**
   * Check whether a specific frame number is missing in the active sequence.
   *
   * @param frame - The frame number to check (uses the original frame
   *   numbering from filenames, not the 0-based index).
   * @returns `true` if the frame is absent from the sequence, `false` if it
   *   is present or if no sequence is loaded.
   *
   * @example
   * ```ts
   * if (openrv.sequence.isFrameMissing(5)) {
   *   console.log('Frame 5 is missing');
   * }
   * ```
   */
  isFrameMissing(frame: number): boolean {
    const info = this.getSequenceInfo();
    if (!info) return false;
    return isFrameMissing(info, frame);
  }

  /**
   * Check whether the current source is an image sequence.
   *
   * @returns `true` if the active source is a sequence, `false` otherwise.
   *
   * @example
   * ```ts
   * if (openrv.sequence.isSequence()) {
   *   console.log('Current source is a sequence');
   * }
   * ```
   */
  isSequence(): boolean {
    return this.getSequenceInfo() !== null;
  }

  /**
   * Get the naming pattern of the active sequence.
   *
   * @returns The detected pattern string (e.g., `"frame_####.png"`), or
   *   `null` if no sequence is loaded.
   *
   * @example
   * ```ts
   * const pattern = openrv.sequence.getPattern(); // e.g. "frame_####.png"
   * ```
   */
  getPattern(): string | null {
    return this.getSequenceInfo()?.pattern ?? null;
  }

  /**
   * Get the frame range of the active sequence.
   *
   * @returns An object with `start` and `end` frame numbers, or `null` if
   *   no sequence is loaded.
   *
   * @example
   * ```ts
   * const range = openrv.sequence.getFrameRange();
   * // e.g. { start: 1, end: 100 }
   * ```
   */
  getFrameRange(): { start: number; end: number } | null {
    const info = this.getSequenceInfo();
    if (!info) return null;
    return { start: info.startFrame, end: info.endFrame };
  }
}
