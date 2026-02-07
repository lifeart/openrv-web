/**
 * Centralized timing-related constants.
 *
 * Debounce intervals, timeouts, and animation durations used across the
 * application.  Import from here (or via `src/config`) rather than
 * scattering magic numbers throughout source files.
 */

/** Debounce delay (ms) applied before re-running CPU effect processing */
export const EFFECTS_DEBOUNCE_MS = 50;

/**
 * If frame extraction hangs for this long (ms) during playback,
 * the frame is skipped and starvation handling kicks in.
 */
export const STARVATION_TIMEOUT_MS = 5000;
