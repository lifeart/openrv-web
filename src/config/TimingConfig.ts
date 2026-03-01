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

/**
 * Absolute safety-net timeout (ms) for play-all-frames mode.
 * If a single frame cannot be decoded within this window,
 * the engine skips it and emits a `frameDecodeTimeout` event.
 */
export const PLAY_ALL_FRAMES_ABSOLUTE_TIMEOUT_MS = 60_000;
