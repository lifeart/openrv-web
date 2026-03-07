/**
 * Cache configuration types and defaults for the Frame Cache System.
 *
 * Provides configurable memory budgets, cache modes, and thresholds
 * for the FrameCacheController.
 */

// Byte size constants
export const KB = 1024;
export const MB = 1024 * KB;
export const GB = 1024 * MB;

/**
 * Cache mode controls how aggressively frames are pre-fetched.
 *
 * - `'off'`:        No proactive caching. 3-frame buffer (current, +1, -1).
 * - `'region'`:     Fixed window around playhead, sized by memory budget.
 * - `'lookahead'`:  Region + speculative pre-fetch in playback direction.
 */
export type CacheMode = 'off' | 'region' | 'lookahead';

/**
 * User-friendly labels for each cache mode (used in UI).
 */
export const CACHE_MODE_LABELS: Record<CacheMode, string> = {
  off: 'None',
  region: 'Nearby Frames',
  lookahead: 'Playback Buffer',
};

/**
 * Tooltip descriptions for each cache mode (used in UI).
 */
export const CACHE_MODE_TOOLTIPS: Record<CacheMode, string> = {
  off: 'No pre-loading. Frames are decoded on demand.',
  region: 'Keeps frames near the playhead ready for instant scrubbing.',
  lookahead: 'Pre-loads frames ahead for smooth playback.',
};

/**
 * Full cache configuration interface.
 */
export interface CacheConfig {
  /** Active cache mode */
  mode: CacheMode;
  /** Total memory budget in bytes for all frame caches (shared across all sources) */
  memoryBudgetBytes: number;
  /** Fraction of budget reserved for HDR frames (0-1) */
  hdrReserveFraction: number;
  /** Fraction of budget reserved for effects prerender (0-1) */
  effectsReserveFraction: number;
  /** High-water mark (fraction 0-1) at which lookahead pauses */
  highWaterMark: number;
  /** Critical mark (fraction 0-1) at which emergency eviction triggers */
  criticalMark: number;
  /** Minimum pre-roll frames before playback starts */
  minPrerollFrames: number;
  /** Eviction guard radius: max(this, ceil(playbackSpeed * 2)) */
  minEvictionGuard: number;
}

/**
 * Detect default memory budget based on device capabilities.
 *
 * Uses `navigator.deviceMemory` when available (Chromium browsers).
 * Falls back to 512 MB for unknown devices.
 */
export function detectDefaultBudget(): number {
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    const deviceGB = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
    // Use 25% of device memory, clamped to [256 MB, 4 GB]
    return Math.max(256 * MB, Math.min(4 * GB, deviceGB * GB * 0.25));
  }
  // Fallback: 512 MB (safe for most devices)
  return 512 * MB;
}

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  mode: 'lookahead',
  memoryBudgetBytes: 512 * MB, // Overridden at runtime by detectDefaultBudget()
  hdrReserveFraction: 0.3,
  effectsReserveFraction: 0.1,
  highWaterMark: 0.8,
  criticalMark: 0.95,
  minPrerollFrames: 8,
  minEvictionGuard: 2,
};

/**
 * Ordered list of cache modes for cycling (Shift+C keyboard shortcut).
 */
export const CACHE_MODE_CYCLE: CacheMode[] = ['off', 'region', 'lookahead'];
