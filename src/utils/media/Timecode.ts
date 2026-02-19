/**
 * SMPTE Timecode Utilities
 *
 * Provides conversion between frame numbers and SMPTE timecode format (HH:MM:SS:FF).
 * Supports standard (non-drop-frame) timecode for common VFX frame rates.
 */

/**
 * Display mode for frame counter in the timeline
 *
 * - 'frames': Global frame number (e.g. "Frame 42")
 * - 'timecode': SMPTE timecode (HH:MM:SS:FF)
 * - 'seconds': Fractional seconds (e.g. "1.750s")
 * - 'footage': 35mm feet+frames (16 frames per foot, e.g. "3+08")
 */
export type TimecodeDisplayMode = 'frames' | 'timecode' | 'seconds' | 'footage';

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
 * Format a frame number as fractional seconds.
 *
 * Frame numbering is 1-based (frame 1 = 0.000s).
 *
 * @param frame - 1-based frame number
 * @param fps - frames per second (must be > 0)
 * @returns Seconds string with 3 decimal places (e.g. "1.750s")
 */
export function formatSeconds(frame: number, fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) {
    return '0.000s';
  }
  if (!Number.isFinite(frame)) {
    return '0.000s';
  }
  const zeroBasedFrame = Math.max(0, Math.floor(frame) - 1);
  const seconds = zeroBasedFrame / fps;
  return `${seconds.toFixed(3)}s`;
}

/**
 * Format a frame number as 35mm footage (feet+frames).
 *
 * 35mm film has 16 frames per foot (4-perf).
 * Frame numbering is 1-based (frame 1 = 0+00).
 *
 * @param frame - 1-based frame number
 * @param _fps - frames per second (unused, included for API consistency)
 * @returns Footage string in "feet+frames" format (e.g. "3+08")
 */
export function formatFootage(frame: number, _fps: number): string {
  const FRAMES_PER_FOOT = 16;

  if (!Number.isFinite(frame)) {
    return '0+00';
  }

  const zeroBasedFrame = Math.max(0, Math.floor(frame) - 1);
  const feet = Math.floor(zeroBasedFrame / FRAMES_PER_FOOT);
  const remainingFrames = zeroBasedFrame % FRAMES_PER_FOOT;

  return `${feet}+${String(remainingFrames).padStart(2, '0')}`;
}

/**
 * Get all display modes in cycling order.
 */
export function getAllDisplayModes(): TimecodeDisplayMode[] {
  return ['frames', 'timecode', 'seconds', 'footage'];
}

/**
 * Get the next display mode in cycling order.
 */
export function getNextDisplayMode(current: TimecodeDisplayMode): TimecodeDisplayMode {
  const modes = getAllDisplayModes();
  const currentIndex = modes.indexOf(current);
  const nextIndex = (currentIndex + 1) % modes.length;
  return modes[nextIndex]!;
}

/**
 * Get a short label for a display mode (for UI indicators).
 */
export function getDisplayModeLabel(mode: TimecodeDisplayMode): string {
  switch (mode) {
    case 'frames': return 'F#';
    case 'timecode': return 'TC';
    case 'seconds': return 'SEC';
    case 'footage': return 'FT';
  }
}

/**
 * Format a frame number for display based on the current display mode.
 *
 * @param frame - 1-based frame number
 * @param fps - frames per second
 * @param mode - display mode
 * @returns Formatted string for display
 */
export function formatFrameDisplay(
  frame: number,
  fps: number,
  mode: TimecodeDisplayMode
): string {
  switch (mode) {
    case 'timecode':
      return formatTimecode(frame, fps);
    case 'seconds':
      return formatSeconds(frame, fps);
    case 'footage':
      return formatFootage(frame, fps);
    case 'frames':
    default:
      return `Frame ${frame}`;
  }
}
