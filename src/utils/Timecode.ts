/**
 * SMPTE Timecode Utilities
 *
 * Provides conversion between frame numbers and SMPTE timecode format (HH:MM:SS:FF).
 * Supports standard (non-drop-frame) timecode for common VFX frame rates.
 */

/**
 * Display mode for frame counter in the timeline
 */
export type TimecodeDisplayMode = 'frames' | 'timecode';

/**
 * Format a frame number as SMPTE timecode (HH:MM:SS:FF).
 *
 * Uses non-drop-frame timecode. Frame numbering is 1-based
 * (frame 1 = 00:00:00:00, frame 2 = 00:00:00:01, etc.).
 *
 * @param frame - 1-based frame number
 * @param fps - frames per second (must be > 0)
 * @returns Timecode string in HH:MM:SS:FF format
 */
export function formatTimecode(frame: number, fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) {
    return '00:00:00:00';
  }

  if (!Number.isFinite(frame)) {
    return '00:00:00:00';
  }

  // Convert 1-based frame to 0-based for calculation
  const zeroBasedFrame = Math.max(0, Math.floor(frame) - 1);

  const roundedFps = Math.round(fps);
  const effectiveFps = Math.max(1, roundedFps);

  const totalSeconds = Math.floor(zeroBasedFrame / effectiveFps);
  const ff = zeroBasedFrame % effectiveFps;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad2 = (n: number): string => String(n).padStart(2, '0');

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad2(ff)}`;
}

/**
 * Format a frame number for display based on the current display mode.
 *
 * @param frame - 1-based frame number
 * @param fps - frames per second
 * @param mode - display mode ('frames' or 'timecode')
 * @returns Formatted string for display
 */
export function formatFrameDisplay(
  frame: number,
  fps: number,
  mode: TimecodeDisplayMode
): string {
  if (mode === 'timecode') {
    return formatTimecode(frame, fps);
  }
  return `Frame ${frame}`;
}
