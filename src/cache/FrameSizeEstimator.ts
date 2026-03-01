/**
 * FrameSizeEstimator - Pure functions for estimating frame memory usage.
 *
 * Used by all cache layers for consistent memory budgeting.
 * Estimates are conservative upper bounds (assumes uncompressed RGBA).
 */

/**
 * Estimate the memory footprint of a single decoded frame in bytes.
 *
 * @param width     - Source width in pixels
 * @param height    - Source height in pixels
 * @param isHDR     - Whether the frame uses HDR (RGBA16F = 8 bytes/pixel)
 * @param targetSize - Optional target resolution (frames may be extracted at reduced resolution)
 * @returns Estimated byte size of the frame in memory
 */
export function estimateFrameBytes(
  width: number,
  height: number,
  isHDR: boolean,
  targetSize?: { w: number; h: number },
): number {
  // Use targetSize when available (frames may be extracted at reduced resolution)
  const w = targetSize?.w ?? width;
  const h = targetSize?.h ?? height;
  // ImageBitmap is typically RGBA8 (4 bytes/pixel) for SDR
  // HDR IPImage with VideoFrame is RGBA16F (8 bytes/pixel)
  const bytesPerPixel = isHDR ? 8 : 4;
  return w * h * bytesPerPixel;
}

/**
 * Calculate the maximum number of frames that fit within a given memory budget.
 *
 * @param budgetBytes    - Total memory budget in bytes
 * @param bytesPerFrame  - Estimated bytes per frame (from estimateFrameBytes)
 * @returns Maximum number of frames that fit within the budget
 */
export function maxFramesInBudget(
  budgetBytes: number,
  bytesPerFrame: number,
): number {
  if (bytesPerFrame <= 0) return 0;
  return Math.floor(budgetBytes / bytesPerFrame);
}

/**
 * Calculate the region cache capacity (80% of maxFramesInBudget).
 *
 * The 20% reserve is for lookahead overshoot and system overhead.
 *
 * @param budgetBytes    - Total memory budget in bytes
 * @param bytesPerFrame  - Estimated bytes per frame
 * @returns Region capacity in number of frames
 */
export function regionCapacity(
  budgetBytes: number,
  bytesPerFrame: number,
): number {
  const maxFrames = maxFramesInBudget(budgetBytes, bytesPerFrame);
  return Math.floor(maxFrames * 0.8);
}

/**
 * Calculate the ahead/behind frame split for a given region capacity.
 *
 * During playback: 70% ahead, 30% behind.
 * During scrubbing (symmetric): 50/50 split.
 * During fast scrubbing in one direction: 70% in scrub direction, 30% behind.
 *
 * @param capacity     - Total region capacity in frames
 * @param mode         - 'playback' | 'scrub' | 'scrubDirectional'
 * @param direction    - 1 for forward, -1 for reverse (used for scrubDirectional)
 * @returns Object with aheadFrames and behindFrames
 */
export function calculateWindowSplit(
  capacity: number,
  mode: 'playback' | 'scrub' | 'scrubDirectional',
  direction: 1 | -1 = 1,
): { aheadFrames: number; behindFrames: number } {
  if (capacity <= 0) {
    return { aheadFrames: 0, behindFrames: 0 };
  }

  switch (mode) {
    case 'playback': {
      // 70% ahead in playback direction, 30% behind
      const aheadFrames = Math.floor(capacity * 0.7);
      const behindFrames = capacity - aheadFrames;
      return { aheadFrames, behindFrames };
    }
    case 'scrub': {
      // Symmetric: 50/50
      const half = Math.floor(capacity / 2);
      return { aheadFrames: half, behindFrames: capacity - half };
    }
    case 'scrubDirectional': {
      // 70% in scrub direction, 30% opposite
      const majorSide = Math.floor(capacity * 0.7);
      const minorSide = capacity - majorSide;
      if (direction > 0) {
        return { aheadFrames: majorSide, behindFrames: minorSide };
      } else {
        return { aheadFrames: minorSide, behindFrames: majorSide };
      }
    }
  }
}

/**
 * Calculate the eviction guard radius for a given playback speed.
 *
 * The eviction guard prevents evicting frames near the playhead,
 * protecting against races during high-speed playback.
 *
 * @param playbackSpeed   - Current playback speed multiplier
 * @param minGuard        - Minimum guard radius (default: 2)
 * @returns Guard radius in frames
 */
export function evictionGuardRadius(
  playbackSpeed: number,
  minGuard: number = 2,
): number {
  return Math.max(minGuard, Math.ceil(playbackSpeed * 2));
}
