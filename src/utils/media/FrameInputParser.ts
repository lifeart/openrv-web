/**
 * FrameInputParser - Pure utility for parsing user input into frame numbers.
 *
 * Supports auto-detection of input formats:
 * - Plain frame numbers: "42"
 * - SMPTE timecode: "HH:MM:SS:FF" or "HH:MM:SS;FF" (drop-frame)
 * - Seconds: "3.5s"
 * - Relative offsets: "+10" or "-5"
 *
 * Also provides helpful error messages for near-miss inputs.
 */

export type FrameInputFormat = 'frame' | 'timecode' | 'seconds' | 'relative';

export interface FrameInputResult {
  /** 1-based absolute frame number */
  frame: number;
  /** Detected input format */
  format: FrameInputFormat;
  /** Whether the input is valid and the frame is in range */
  valid: boolean;
  /** Error or suggestion message when invalid */
  error?: string;
}

// Drop-frame frame rates
const DROP_FRAME_RATES = [29.97, 59.94];
const DROP_FRAME_EPSILON = 0.01;

function isDropFrameRate(fps: number): boolean {
  return DROP_FRAME_RATES.some((df) => Math.abs(fps - df) < DROP_FRAME_EPSILON);
}

/**
 * Convert SMPTE timecode components to a 0-based frame number.
 *
 * For non-drop-frame: straightforward arithmetic.
 * For drop-frame: applies the standard SMPTE DF formula.
 */
function timecodeToFrame(
  hours: number,
  minutes: number,
  seconds: number,
  frames: number,
  fps: number,
  dropFrame: boolean,
): number {
  const roundedFps = Math.round(fps);

  if (dropFrame) {
    // Standard SMPTE drop-frame to frame-count formula:
    // Drop 2 frames (for 29.97) or 4 frames (for 59.94) at every minute
    // boundary except every 10th minute.
    const dropFrames = roundedFps > 30 ? 4 : 2;

    const totalMinutes = hours * 60 + minutes;
    const frameNumber =
      roundedFps * 3600 * hours +
      roundedFps * 60 * minutes +
      roundedFps * seconds +
      frames -
      dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));

    return frameNumber;
  } else {
    return hours * 3600 * roundedFps + minutes * 60 * roundedFps + seconds * roundedFps + frames;
  }
}

/**
 * Validate SMPTE timecode component ranges.
 */
function validateTimecodeComponents(
  hours: number,
  minutes: number,
  seconds: number,
  frames: number,
  fps: number,
  _dropFrame: boolean,
): string | null {
  if (hours < 0 || hours > 23) return 'Hours must be 0-23';
  if (minutes < 0 || minutes > 59) return 'Minutes must be 0-59';
  if (seconds < 0 || seconds > 59) return 'Seconds must be 0-59';

  const roundedFps = Math.round(fps);
  if (frames < 0 || frames >= roundedFps) {
    return `Frames must be 0-${roundedFps - 1} at ${fps} fps`;
  }

  // Note: We intentionally do NOT reject "dropped" frame numbers at
  // non-10th minute boundaries. While the SMPTE convention says these
  // timecodes don't exist, the existing frameToTimecode() display code
  // generates them, and we need to round-trip parse(format(frame)) === frame.
  // The inverse formula handles these cases correctly.

  return null;
}

/**
 * Parse user input and resolve to a 1-based frame number.
 *
 * @param input       Raw user input string
 * @param fps         Current session FPS
 * @param current     Current frame number (for relative offsets)
 * @param minFrame    Minimum valid frame (always 1)
 * @param maxFrame    Maximum valid frame (source duration)
 * @param startFrame  Start timecode offset in frames (default 0). When non-zero,
 *                    timecode parsing subtracts this offset so that typing the
 *                    source's start timecode resolves to frame 1.
 */
export function parseFrameInput(
  input: string,
  fps: number,
  current: number,
  minFrame: number,
  maxFrame: number,
  startFrame: number = 0,
): FrameInputResult {
  const trimmed = input.trim();

  if (trimmed === '') {
    return { frame: current, format: 'frame', valid: false, error: 'Enter a frame number, timecode, or seconds' };
  }

  // 1. Relative offset: +N or -N
  if (/^[+-]\d+$/.test(trimmed)) {
    const offset = parseInt(trimmed, 10);
    const frame = current + offset;

    if (frame < minFrame || frame > maxFrame) {
      return {
        frame,
        format: 'relative',
        valid: false,
        error: `Frame ${frame} is outside range ${minFrame}-${maxFrame}`,
      };
    }

    return { frame, format: 'relative', valid: true };
  }

  // 2. Seconds: number followed by 's' (case-insensitive)
  if (/^\d+(\.\d+)?s$/i.test(trimmed)) {
    const seconds = parseFloat(trimmed.slice(0, -1));

    if (!Number.isFinite(seconds) || seconds < 0) {
      return { frame: current, format: 'seconds', valid: false, error: 'Invalid seconds value' };
    }

    // Formula: Math.round(seconds * fps) + 1
    // Using Math.round (not Math.floor) to correctly round-trip with
    // formatSeconds() which truncates to 3 decimal places via toFixed(3).
    // Without rounding, precision loss from toFixed(3) causes off-by-one
    // errors (e.g., 0.083s at 24fps → 1.992 → floor=1 → frame 2, not 3).
    const frame = Math.round(seconds * fps) + 1;

    if (frame < minFrame || frame > maxFrame) {
      return {
        frame,
        format: 'seconds',
        valid: false,
        error: `Frame ${frame} is outside range ${minFrame}-${maxFrame}`,
      };
    }

    return { frame, format: 'seconds', valid: true };
  }

  // 3. SMPTE timecode: HH:MM:SS:FF or HH:MM:SS;FF
  if (/^\d{1,2}:\d{2}:\d{2}[:;]\d{1,2}$/.test(trimmed)) {
    const dropFrame = trimmed.includes(';');
    const parts = trimmed.split(/[:;]/);
    const hours = parseInt(parts[0]!, 10);
    const minutes = parseInt(parts[1]!, 10);
    const seconds = parseInt(parts[2]!, 10);
    const frames = parseInt(parts[3]!, 10);

    // Validate that the fps supports drop-frame if ; is used
    if (dropFrame && !isDropFrameRate(fps)) {
      return {
        frame: current,
        format: 'timecode',
        valid: false,
        error: `Drop-frame timecode requires 29.97 or 59.94 fps (current: ${fps})`,
      };
    }

    // Validate component ranges
    const validationError = validateTimecodeComponents(hours, minutes, seconds, frames, fps, dropFrame);
    if (validationError) {
      return { frame: current, format: 'timecode', valid: false, error: validationError };
    }

    // Convert to 0-based frame number
    const zeroBasedFrame = timecodeToFrame(hours, minutes, seconds, frames, fps, dropFrame);

    // Apply start timecode offset and convert to 1-based
    const frame = zeroBasedFrame - startFrame + 1;

    if (frame < minFrame || frame > maxFrame) {
      return {
        frame,
        format: 'timecode',
        valid: false,
        error: `Frame ${frame} is outside range ${minFrame}-${maxFrame}`,
      };
    }

    return { frame, format: 'timecode', valid: true };
  }

  // 4. Plain frame number
  if (/^\d+$/.test(trimmed)) {
    const frame = parseInt(trimmed, 10);

    if (frame < minFrame || frame > maxFrame) {
      return {
        frame,
        format: 'frame',
        valid: false,
        error: `Frame ${frame} is outside range ${minFrame}-${maxFrame}`,
      };
    }

    return { frame, format: 'frame', valid: true };
  }

  // 5. Near-miss: decimal without 's' suffix
  if (/^\d+\.\d+$/.test(trimmed)) {
    return {
      frame: current,
      format: 'seconds',
      valid: false,
      error: `Did you mean ${trimmed}s (seconds)?`,
    };
  }

  // 6. Near-miss: three colon groups (incomplete timecode)
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
    return {
      frame: current,
      format: 'timecode',
      valid: false,
      error: 'Use HH:MM:SS:FF format',
    };
  }

  // 7. Otherwise: invalid
  return {
    frame: current,
    format: 'frame',
    valid: false,
    error: 'Invalid input. Enter a frame number, timecode (HH:MM:SS:FF), or seconds (e.g. 3.5s)',
  };
}

/**
 * Get a human-readable label for a detected format.
 */
export function getFormatLabel(format: FrameInputFormat): string {
  switch (format) {
    case 'frame':
      return 'Frame number';
    case 'timecode':
      return 'SMPTE Timecode';
    case 'seconds':
      return 'Seconds';
    case 'relative':
      return 'Relative (+/-)';
  }
}
