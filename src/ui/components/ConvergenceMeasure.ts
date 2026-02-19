/**
 * ConvergenceMeasure - Stereo convergence measurement tools
 *
 * Computes pixel disparity between left/right stereo frames:
 * - Cursor disparity: horizontal offset at a specific point using block matching
 * - Frame statistics: min/max/avg disparity across sampled points
 * - Convergence guide overlay: visual disparity distribution indicator
 *
 * Disparity is measured in pixels. Positive = right eye shifted rightward
 * relative to left eye. Negative = shifted leftward.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { clamp } from '../../utils/math';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DisparityResult {
  /** Horizontal disparity in pixels (positive = right shifted right) */
  disparity: number;
  /** Match confidence 0-1 (1 = perfect match, 0 = no match) */
  confidence: number;
  /** Image-space position where measurement was taken */
  x: number;
  y: number;
}

export interface DisparityStats {
  /** Minimum disparity found across sampled points */
  min: number;
  /** Maximum disparity found across sampled points */
  max: number;
  /** Average disparity across sampled points */
  avg: number;
  /** Number of valid sample points used */
  sampleCount: number;
}

export interface ConvergenceState {
  enabled: boolean;
  /** Cursor position in image coordinates */
  cursorX: number;
  cursorY: number;
  /** Show convergence guide overlay */
  guideOverlay: boolean;
  /** Current cursor disparity measurement */
  cursorDisparity: DisparityResult | null;
  /** Frame-wide disparity statistics */
  frameStats: DisparityStats | null;
}

export const DEFAULT_CONVERGENCE_STATE: ConvergenceState = {
  enabled: false,
  cursorX: 0,
  cursorY: 0,
  guideOverlay: false,
  cursorDisparity: null,
  frameStats: null,
};

// ---------------------------------------------------------------------------
// Pure computation functions
// ---------------------------------------------------------------------------

/**
 * Block matching search range: maximum disparity in pixels to search.
 */
const DEFAULT_SEARCH_RANGE = 64;

/**
 * Default block size for matching (width and height of patch).
 */
const DEFAULT_BLOCK_SIZE = 11;

/**
 * Minimum confidence threshold to consider a match valid.
 */
const MIN_CONFIDENCE = 0.1;

/**
 * Get luminance from RGBA pixel data at a given index.
 */
function getLuminance(data: Uint8ClampedArray, idx: number): number {
  return 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!;
}

/**
 * Compute Sum of Absolute Differences (SAD) between two blocks.
 * Returns normalized SAD (0 = identical, 1 = maximally different).
 */
export function computeBlockSAD(
  leftData: Uint8ClampedArray,
  rightData: Uint8ClampedArray,
  leftWidth: number,
  rightWidth: number,
  leftHeight: number,
  cx: number,
  cy: number,
  offset: number,
  blockSize: number,
): number {
  const half = Math.floor(blockSize / 2);
  let sad = 0;
  let count = 0;

  for (let dy = -half; dy <= half; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= leftHeight) continue;

    for (let dx = -half; dx <= half; dx++) {
      const lx = cx + dx;
      const rx = cx + dx + offset;

      if (lx < 0 || lx >= leftWidth) continue;
      if (rx < 0 || rx >= rightWidth) continue;

      const leftIdx = (y * leftWidth + lx) * 4;
      const rightIdx = (y * rightWidth + rx) * 4;

      const leftLum = getLuminance(leftData, leftIdx);
      const rightLum = getLuminance(rightData, rightIdx);

      sad += Math.abs(leftLum - rightLum);
      count++;
    }
  }

  if (count === 0) return 1;
  return sad / (count * 255);
}

/**
 * Measure horizontal pixel disparity at a given point using block matching.
 *
 * Searches for the horizontal offset that minimizes the Sum of Absolute
 * Differences (SAD) between a patch in the left image and a shifted patch
 * in the right image.
 *
 * @param left - Left eye ImageData
 * @param right - Right eye ImageData
 * @param x - X coordinate in image space
 * @param y - Y coordinate in image space
 * @param searchRange - Max disparity to search (default 64)
 * @param blockSize - Patch size for matching (default 11)
 * @returns DisparityResult with disparity, confidence, and position
 */
export function measureDisparity(
  left: ImageData,
  right: ImageData,
  x: number,
  y: number,
  searchRange: number = DEFAULT_SEARCH_RANGE,
  blockSize: number = DEFAULT_BLOCK_SIZE,
): DisparityResult {
  const cx = Math.round(x);
  const cy = Math.round(y);

  // Bounds check
  if (cx < 0 || cx >= left.width || cy < 0 || cy >= left.height) {
    return { disparity: 0, confidence: 0, x: cx, y: cy };
  }

  let bestOffset = 0;
  let bestSAD = Infinity;

  // Search negative and positive offsets
  for (let offset = -searchRange; offset <= searchRange; offset++) {
    const sad = computeBlockSAD(
      left.data,
      right.data,
      left.width,
      right.width,
      left.height,
      cx,
      cy,
      offset,
      blockSize,
    );

    if (sad < bestSAD || (sad === bestSAD && Math.abs(offset) < Math.abs(bestOffset))) {
      bestSAD = sad;
      bestOffset = offset;
    }
  }

  // Confidence: 1 - normalized SAD (inverted so higher = better)
  const confidence = clamp(1 - bestSAD, 0, 1);

  return {
    disparity: bestOffset,
    confidence,
    x: cx,
    y: cy,
  };
}

/**
 * Compute frame-wide disparity statistics by sampling points across the image.
 *
 * Samples points on a grid across the image and measures disparity at each.
 * Points with confidence below MIN_CONFIDENCE are excluded.
 *
 * @param left - Left eye ImageData
 * @param right - Right eye ImageData
 * @param gridStep - Spacing between sample points (default 32)
 * @param searchRange - Max disparity to search per point
 * @param blockSize - Patch size for matching
 * @returns DisparityStats with min/max/avg/sampleCount
 */
export function computeFrameDisparityStats(
  left: ImageData,
  right: ImageData,
  gridStep: number = 32,
  searchRange: number = DEFAULT_SEARCH_RANGE,
  blockSize: number = DEFAULT_BLOCK_SIZE,
): DisparityStats {
  const disparities: number[] = [];
  const half = Math.floor(blockSize / 2);

  for (let y = half; y < left.height - half; y += gridStep) {
    for (let x = half; x < left.width - half; x += gridStep) {
      const result = measureDisparity(left, right, x, y, searchRange, blockSize);
      if (result.confidence >= MIN_CONFIDENCE) {
        disparities.push(result.disparity);
      }
    }
  }

  if (disparities.length === 0) {
    return { min: 0, max: 0, avg: 0, sampleCount: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (const d of disparities) {
    if (d < min) min = d;
    if (d > max) max = d;
    sum += d;
  }

  return {
    min,
    max,
    avg: sum / disparities.length,
    sampleCount: disparities.length,
  };
}

/**
 * Render convergence guide overlay onto a stereo composite image.
 *
 * Draws:
 * - Center convergence line (green at zero disparity)
 * - Disparity range indicator (red/blue bars showing parallax)
 * - Cursor disparity marker if provided
 *
 * @param imageData - The composite image to draw on (modified in-place)
 * @param stats - Frame disparity statistics
 * @param cursorDisparity - Optional cursor disparity measurement
 * @returns New ImageData with overlay applied
 */
export function renderConvergenceGuide(
  imageData: ImageData,
  stats: DisparityStats | null,
  cursorDisparity: DisparityResult | null,
): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(imageData.data), width, height);

  // Draw center convergence line (green, 40% opacity, vertical)
  const cx = Math.floor(width / 2);
  const greenAlpha = 0.4;
  for (let y = 0; y < height; y++) {
    const idx = (y * width + cx) * 4;
    result.data[idx] = Math.round(result.data[idx]! * (1 - greenAlpha));
    result.data[idx + 1] = Math.round(result.data[idx + 1]! * (1 - greenAlpha) + 255 * greenAlpha);
    result.data[idx + 2] = Math.round(result.data[idx + 2]! * (1 - greenAlpha));
    result.data[idx + 3] = 255;
  }

  // Draw disparity range bars at bottom
  if (stats && stats.sampleCount > 0) {
    const barY = height - 20;
    const barHeight = 10;
    const scale = width / (DEFAULT_SEARCH_RANGE * 2); // Scale disparity to pixels

    for (let row = barY; row < Math.min(barY + barHeight, height); row++) {
      // Draw min disparity marker (blue)
      const minX = clamp(Math.round(cx + stats.min * scale), 0, width - 1);
      const minIdx = (row * width + minX) * 4;
      result.data[minIdx] = 80;
      result.data[minIdx + 1] = 120;
      result.data[minIdx + 2] = 255;
      result.data[minIdx + 3] = 255;

      // Draw max disparity marker (red)
      const maxX = clamp(Math.round(cx + stats.max * scale), 0, width - 1);
      const maxIdx = (row * width + maxX) * 4;
      result.data[maxIdx] = 255;
      result.data[maxIdx + 1] = 80;
      result.data[maxIdx + 2] = 80;
      result.data[maxIdx + 3] = 255;

      // Draw avg disparity marker (yellow)
      const avgX = clamp(Math.round(cx + stats.avg * scale), 0, width - 1);
      const avgIdx = (row * width + avgX) * 4;
      result.data[avgIdx] = 255;
      result.data[avgIdx + 1] = 255;
      result.data[avgIdx + 2] = 0;
      result.data[avgIdx + 3] = 255;
    }
  }

  // Draw cursor disparity marker (magenta crosshair)
  if (cursorDisparity && cursorDisparity.confidence >= MIN_CONFIDENCE) {
    const markerAlpha = 0.7;
    const markerSize = 8;
    const mx = cursorDisparity.x;
    const my = cursorDisparity.y;

    // Horizontal line
    for (let dx = -markerSize; dx <= markerSize; dx++) {
      const px = mx + dx;
      if (px < 0 || px >= width || my < 0 || my >= height) continue;
      const idx = (my * width + px) * 4;
      result.data[idx] = Math.round(result.data[idx]! * (1 - markerAlpha) + 255 * markerAlpha);
      result.data[idx + 1] = Math.round(result.data[idx + 1]! * (1 - markerAlpha));
      result.data[idx + 2] = Math.round(result.data[idx + 2]! * (1 - markerAlpha) + 255 * markerAlpha);
      result.data[idx + 3] = 255;
    }

    // Vertical line
    for (let dy = -markerSize; dy <= markerSize; dy++) {
      const py = my + dy;
      if (mx < 0 || mx >= width || py < 0 || py >= height) continue;
      const idx = (py * width + mx) * 4;
      result.data[idx] = Math.round(result.data[idx]! * (1 - markerAlpha) + 255 * markerAlpha);
      result.data[idx + 1] = Math.round(result.data[idx + 1]! * (1 - markerAlpha));
      result.data[idx + 2] = Math.round(result.data[idx + 2]! * (1 - markerAlpha) + 255 * markerAlpha);
      result.data[idx + 3] = 255;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// ConvergenceMeasure state manager
// ---------------------------------------------------------------------------

export interface ConvergenceMeasureEvents extends EventMap {
  stateChanged: ConvergenceState;
  disparityMeasured: DisparityResult;
  statsComputed: DisparityStats;
}

export class ConvergenceMeasure extends EventEmitter<ConvergenceMeasureEvents> {
  private state: ConvergenceState = { ...DEFAULT_CONVERGENCE_STATE };

  /**
   * Enable or disable convergence measurement.
   */
  setEnabled(enabled: boolean): void {
    if (this.state.enabled !== enabled) {
      this.state.enabled = enabled;
      if (!enabled) {
        this.state.cursorDisparity = null;
        this.state.frameStats = null;
      }
      this.emitState();
    }
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  /**
   * Update cursor position and measure disparity at that point.
   */
  setCursorPosition(x: number, y: number): void {
    this.state.cursorX = Math.round(x);
    this.state.cursorY = Math.round(y);
    this.emitState();
  }

  getCursorPosition(): { x: number; y: number } {
    return { x: this.state.cursorX, y: this.state.cursorY };
  }

  /**
   * Enable or disable the convergence guide overlay.
   */
  setGuideOverlay(enabled: boolean): void {
    if (this.state.guideOverlay !== enabled) {
      this.state.guideOverlay = enabled;
      this.emitState();
    }
  }

  isGuideOverlayEnabled(): boolean {
    return this.state.guideOverlay;
  }

  /**
   * Measure disparity at the current cursor position using the given stereo pair.
   */
  measureAtCursor(left: ImageData, right: ImageData): DisparityResult {
    const result = measureDisparity(left, right, this.state.cursorX, this.state.cursorY);
    this.state.cursorDisparity = result;
    this.emit('disparityMeasured', result);
    this.emitState();
    return result;
  }

  /**
   * Compute frame-wide disparity statistics for the given stereo pair.
   */
  computeStats(left: ImageData, right: ImageData, gridStep?: number): DisparityStats {
    const stats = computeFrameDisparityStats(left, right, gridStep);
    this.state.frameStats = stats;
    this.emit('statsComputed', stats);
    this.emitState();
    return stats;
  }

  /**
   * Get the current cursor disparity measurement.
   */
  getCursorDisparity(): DisparityResult | null {
    return this.state.cursorDisparity;
  }

  /**
   * Get the current frame disparity statistics.
   */
  getFrameStats(): DisparityStats | null {
    return this.state.frameStats;
  }

  /**
   * Get a copy of the full state.
   */
  getState(): ConvergenceState {
    return {
      ...this.state,
      cursorDisparity: this.state.cursorDisparity ? { ...this.state.cursorDisparity } : null,
      frameStats: this.state.frameStats ? { ...this.state.frameStats } : null,
    };
  }

  /**
   * Format disparity result as display string.
   */
  formatDisparity(result: DisparityResult): string {
    if (result.confidence < MIN_CONFIDENCE) {
      return `(${result.x}, ${result.y}): no match`;
    }
    const sign = result.disparity >= 0 ? '+' : '';
    return `(${result.x}, ${result.y}): ${sign}${result.disparity}px (${Math.round(result.confidence * 100)}%)`;
  }

  /**
   * Format stats as display string.
   */
  formatStats(stats: DisparityStats): string {
    if (stats.sampleCount === 0) {
      return 'No valid samples';
    }
    return `min: ${stats.min}px | max: ${stats.max}px | avg: ${stats.avg.toFixed(1)}px (${stats.sampleCount} samples)`;
  }

  /**
   * Dispose the convergence measure: remove all listeners and reset state.
   */
  dispose(): void {
    this.removeAllListeners();
    this.state = { ...DEFAULT_CONVERGENCE_STATE };
  }

  private emitState(): void {
    this.emit('stateChanged', this.getState());
  }
}
