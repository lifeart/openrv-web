/**
 * Mu API Compatibility Layer — Constants
 *
 * Mirrors the integer constants used in OpenRV's Mu commands module.
 * These are the values that Mu scripts pass to commands like setPlayMode(),
 * setFiltering(), etc.
 */

// --- Play Mode Constants ---
/** Loop playback continuously */
export const PlayLoop = 0;
/** Play once and stop */
export const PlayOnce = 1;
/** Play forward then backward continuously */
export const PlayPingPong = 2;

// --- Filtering Constants ---
/** Nearest-neighbor (pixelated) filtering */
export const FilterNearest = 0;
/** Bilinear (smooth) filtering */
export const FilterLinear = 1;

// --- Cache Mode Constants (N/A in web, kept for compat) ---
export const CacheOff = 0;
export const CacheBuffer = 1;
export const CacheGreedy = 2;

// --- Audio Cache Mode Constants (N/A in web, kept for compat) ---
export const AudioCacheOff = 0;
export const AudioCacheBuffer = 1;

// --- Cursor Constants ---
export const CursorDefault = 0;
export const CursorCrosshair = 1;
export const CursorPointer = 2;
export const CursorWait = 3;
export const CursorText = 4;
export const CursorMove = 5;
export const CursorNotAllowed = 6;
export const CursorHelp = 7;

// --- Play mode mapping helpers ---
/** Map from Mu integer play mode to openrv-web LoopMode string */
export const PLAY_MODE_TO_LOOP: Record<number, string> = {
  [PlayLoop]: 'loop',
  [PlayOnce]: 'once',
  [PlayPingPong]: 'pingpong',
};

/** Map from openrv-web LoopMode string to Mu integer play mode */
export const LOOP_TO_PLAY_MODE: Record<string, number> = {
  loop: PlayLoop,
  once: PlayOnce,
  pingpong: PlayPingPong,
};

// --- Background method constants ---
export const BG_METHODS = ['black', 'checker', 'grey18', 'grey50', 'crosshatch'] as const;
export type BGMethod = (typeof BG_METHODS)[number];
