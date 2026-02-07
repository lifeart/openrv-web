/**
 * Centralized playback-related constants.
 *
 * Speed presets, starvation thresholds, and reverse-playback limits
 * used by the session and playback timing controller.
 */

/** Common playback speed presets available in the UI */
export const PLAYBACK_SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 4, 8] as const;

/** Derived type for any value in the presets array */
export type PlaybackSpeedPreset = typeof PLAYBACK_SPEED_PRESETS[number];

/**
 * Maximum consecutive starvation skips before forcing a pause.
 * When frame extraction cannot keep up, playback pauses after this
 * many consecutive skipped frames.
 */
export const MAX_CONSECUTIVE_STARVATION_SKIPS = 2;

/**
 * Maximum reverse playback speed multiplier.
 * Higher speeds may outpace frame extraction when playing in reverse.
 */
export const MAX_REVERSE_SPEED = 4;
