/**
 * CMX3600 EDL Writer
 *
 * Generates CMX3600-format Edit Decision Lists from clip data.
 * All functions are pure (no side effects) except `downloadEDL`
 * which triggers a browser download via anchor click.
 */

// ---------------------------------------------------------------------------
// Data Model
// ---------------------------------------------------------------------------

/** Transition type for EDL export */
export interface EDLTransition {
  /** Transition type: 'dissolve' covers crossfade/dissolve */
  type: 'dissolve';
  /** Duration in frames */
  durationFrames: number;
}

/** A single edit event in the EDL */
export interface EDLClip {
  /** Source/reel name */
  sourceName: string;
  /** In point within the source (frame number) */
  sourceIn: number;
  /** Out point within the source (exclusive, frame number) */
  sourceOut: number;
  /** Record in point on the master timeline (frame number) */
  recordIn: number;
  /** Record out point on the master timeline (exclusive, frame number) */
  recordOut: number;
  /** Optional comment */
  comment?: string;
  /** Optional transition into this clip (dissolve) */
  transition?: EDLTransition;
}

/** EDL export configuration */
export interface EDLExportConfig {
  /** Title line (default: 'Untitled') */
  title?: string;
  /** Frames per second for timecode conversion (default: 24) */
  fps?: number;
  /** Use drop-frame timecode (default: false, only valid for 29.97/59.94 fps) */
  dropFrame?: boolean;
  /** Include FROM CLIP NAME comments (default: true) */
  includeClipComments?: boolean;
}

// ---------------------------------------------------------------------------
// Timecode Helpers
// ---------------------------------------------------------------------------

/**
 * Whether the given fps value is eligible for drop-frame timecode.
 * Only 29.97 and 59.94 support drop-frame.
 */
function isDropFrameRate(fps: number): boolean {
  return Math.abs(fps - 29.97) < 0.01 || Math.abs(fps - 59.94) < 0.01;
}

/**
 * Return the nominal (integer) frame rate for a given fps.
 * 29.97 -> 30, 59.94 -> 60, all others returned as-is rounded.
 */
function nominalRate(fps: number): number {
  if (Math.abs(fps - 29.97) < 0.01) return 30;
  if (Math.abs(fps - 59.94) < 0.01) return 60;
  return Math.round(fps);
}

/**
 * Convert a frame number to timecode string.
 *
 * Non-drop: `HH:MM:SS:FF`
 * Drop-frame: `HH:MM:SS;FF`
 *
 * @param frame - Frame number (clamped to >= 0)
 * @param fps - Frames per second (default 24)
 * @param dropFrame - Use drop-frame timecode (default false, only valid for 29.97/59.94)
 */
export function framesToTimecode(
  frame: number,
  fps: number = 24,
  dropFrame: boolean = false,
): string {
  // Clamp negative/NaN/Infinity to 0
  if (!Number.isFinite(frame) || frame < 0) frame = 0;
  // Guard invalid fps
  if (!Number.isFinite(fps) || fps <= 0) fps = 24;

  const useDropFrame = dropFrame && isDropFrameRate(fps);
  const nom = nominalRate(fps);

  if (useDropFrame) {
    // Drop-frame timecode algorithm (SMPTE standard)
    //
    // In drop-frame timecode, certain frame *numbers* are skipped in the
    // display to keep the timecode in sync with real time at 29.97/59.94fps.
    //
    // For 29.97fps (nominal 30): skip display frame numbers ;00 and ;01 at
    // the start of every minute EXCEPT every 10th minute.
    // For 59.94fps (nominal 60): skip display frame numbers ;00-;03 similarly.
    const D = nom === 30 ? 2 : 4;

    // Within a 10-minute block:
    //   Minute 0 (the 10th-minute boundary): NO drop, has nom*60 real frames
    //   Minutes 1-9: each drops D frame numbers, has (nom*60 - D) real frames
    //
    // Real frames per 10-minute block = nom*60 + 9*(nom*60 - D) = nom*600 - 9*D
    const framesPer10Min = nom * 600 - D * 9;
    // Real frames in the first (non-dropping) minute of a 10-min block
    const framesFirstMin = nom * 60;
    // Real frames in each subsequent (dropping) minute
    const framesPerDropMin = nom * 60 - D;

    // Decompose the frame number into 10-minute blocks and remainder
    const numTenMins = Math.floor(frame / framesPer10Min);
    const remainder = frame % framesPer10Min;

    // Within the 10-minute block, count how many non-10th minute boundaries
    // we've crossed. The first minute (minute 0) has nom*60 frames and no drops.
    let minuteOffset: number;
    if (remainder < framesFirstMin) {
      // Still in minute 0 of the 10-min block (no drops here)
      minuteOffset = 0;
    } else {
      // Past minute 0; each subsequent minute has framesPerDropMin real frames
      minuteOffset = Math.floor((remainder - framesFirstMin) / framesPerDropMin) + 1;
    }

    // Total dropped frame numbers = D per non-10th minute we've passed
    const totalDropped = D * 9 * numTenMins + D * minuteOffset;

    // The display frame number is the real frame count plus the dropped numbers
    const displayFrame = frame + totalDropped;

    const ff = displayFrame % nom;
    const ss = Math.floor(displayFrame / nom) % 60;
    const mm = Math.floor(displayFrame / (nom * 60)) % 60;
    const hh = Math.floor(displayFrame / (nom * 60 * 60));

    return (
      String(hh).padStart(2, '0') +
      ':' +
      String(mm).padStart(2, '0') +
      ':' +
      String(ss).padStart(2, '0') +
      ';' +
      String(ff).padStart(2, '0')
    );
  }

  // Non-drop-frame timecode
  const totalSeconds = Math.floor(frame / nom);
  const ff = frame % nom;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);

  return (
    String(hh).padStart(2, '0') +
    ':' +
    String(mm).padStart(2, '0') +
    ':' +
    String(ss).padStart(2, '0') +
    ':' +
    String(ff).padStart(2, '0')
  );
}

/**
 * Convert a timecode string to a frame number.
 *
 * Accepts `HH:MM:SS:FF` (non-drop) or `HH:MM:SS;FF` (drop-frame).
 * The `dropFrame` parameter is auto-detected from the separator if a semicolon
 * is present, but can also be set explicitly.
 *
 * @param timecode - Timecode string
 * @param fps - Frames per second (default 24)
 * @param dropFrame - Use drop-frame timecode (default false)
 * @returns Frame number, or 0 for invalid input
 */
export function timecodeToFrames(
  timecode: string,
  fps: number = 24,
  dropFrame: boolean = false,
): number {
  // Guard invalid fps
  if (!Number.isFinite(fps) || fps <= 0) fps = 24;

  // Detect drop-frame from semicolon separator
  const hasDropSeparator = timecode.includes(';');
  const useDropFrame = (dropFrame || hasDropSeparator) && isDropFrameRate(fps);

  // Normalize separator: replace semicolons with colons for parsing
  const normalized = timecode.replace(/;/g, ':');
  const parts = normalized.split(':').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return 0;

  const hh = parts[0]!;
  const mm = parts[1]!;
  const ss = parts[2]!;
  const ff = parts[3]!;

  const nom = nominalRate(fps);

  if (useDropFrame) {
    const dropFrames = nom === 30 ? 2 : 4;

    // Convert display timecode back to frame count
    const totalMinutes = hh * 60 + mm;
    const nonDropFrames = hh * 3600 * nom + mm * 60 * nom + ss * nom + ff;

    // Subtract the dropped frames that were "added" in display
    return (
      nonDropFrames -
      dropFrames * (totalMinutes - Math.floor(totalMinutes / 10))
    );
  }

  // Non-drop: simple calculation
  return (hh * 3600 + mm * 60 + ss) * nom + ff;
}

// ---------------------------------------------------------------------------
// Reel Name Formatting
// ---------------------------------------------------------------------------

/**
 * Format a reel/source name for EDL.
 *
 * - Strips non-ASCII characters (CMX3600 requires 7-bit ASCII)
 * - Converts to uppercase
 * - Truncates to 8 characters (keeps leftmost 8 chars, per industry convention)
 * - Pads with spaces on the right if shorter than 8 chars
 * - Empty strings become "BL      " (black/blank)
 */
export function formatReelName(name: string): string {
  // Strip non-ASCII characters
  const ascii = name.replace(/[^\x20-\x7E]/g, '');
  if (!ascii) return 'BL      ';

  const upper = ascii.toUpperCase();
  // Truncate: keep leftmost 8 characters (industry standard)
  const truncated = upper.length > 8 ? upper.slice(0, 8) : upper;
  return truncated.padEnd(8, ' ');
}

// ---------------------------------------------------------------------------
// EDL Generation
// ---------------------------------------------------------------------------

/**
 * Generate CMX3600 EDL text from clips.
 *
 * @param clips - Array of edit events
 * @param config - Export configuration
 * @returns CMX3600-format EDL string
 */
export function generateEDL(
  clips: EDLClip[],
  config?: EDLExportConfig,
): string {
  const title = config?.title ?? 'Untitled';
  const fps = config?.fps ?? 24;
  const dropFrame = config?.dropFrame ?? false;
  const includeClipComments = config?.includeClipComments ?? true;
  const useDropFrame = dropFrame && isDropFrameRate(fps);

  // Sanitize title: strip newlines
  const safeTitle = title.replace(/[\r\n]+/g, ' ');

  const lines: string[] = [
    'TITLE: ' + safeTitle,
    'FCM: ' + (useDropFrame ? 'DROP FRAME' : 'NON-DROP FRAME'),
    '',
  ];

  let editNum = 1;
  for (const clip of clips) {
    // CMX3600 supports edit numbers 001-999
    if (editNum > 999) break;
    const reel = formatReelName(clip.sourceName);
    const srcIn = framesToTimecode(clip.sourceIn, fps, useDropFrame);
    const srcOut = framesToTimecode(clip.sourceOut, fps, useDropFrame);
    const recIn = framesToTimecode(clip.recordIn, fps, useDropFrame);
    const recOut = framesToTimecode(clip.recordOut, fps, useDropFrame);

    // Determine transition type: 'C' for cut, 'D XXX' for dissolve
    // Field is 9 characters wide: "C________" or "D_XXX____"
    const transitionField = clip.transition
      ? `D ${String(clip.transition.durationFrames).padStart(3, '0')}    `
      : 'C        ';

    lines.push(
      `${String(editNum).padStart(3, '0')}  ${reel} V     ${transitionField}${srcIn} ${srcOut} ${recIn} ${recOut}`,
    );

    if (includeClipComments) {
      const commentText = (clip.comment ?? clip.sourceName).replace(/[\r\n]+/g, ' ');
      lines.push(`* FROM CLIP NAME: ${commentText}`);
    }

    lines.push('');
    editNum++;
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Blob / Download
// ---------------------------------------------------------------------------

/**
 * Create a downloadable Blob from EDL text.
 *
 * @param edlText - The EDL content string
 * @returns Blob with MIME type text/plain
 */
export function createEDLBlob(edlText: string): Blob {
  return new Blob([edlText], { type: 'text/plain' });
}

/**
 * Trigger browser download of an EDL file.
 *
 * Creates a temporary anchor element, triggers a click, then cleans up.
 *
 * @param clips - Array of edit events
 * @param filename - Download filename (default: 'export.edl')
 * @param config - Export configuration
 */
export function downloadEDL(
  clips: EDLClip[],
  filename: string = 'export.edl',
  config?: EDLExportConfig,
): void {
  const edlText = generateEDL(clips, config);
  const blob = createEDLBlob(edlText);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
