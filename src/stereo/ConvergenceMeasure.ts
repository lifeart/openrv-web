/**
 * Stereo Convergence Measurement Tools
 *
 * Quantitative stereo QC tools for measuring pixel disparity between
 * left and right eye frames:
 * - Point disparity: horizontal offset at a cursor position using block matching
 * - Region statistics: min/max/avg disparity over sampled grid
 * - Convergence guide overlay: visual reference lines at screen plane
 * - Disparity heatmap: color-coded disparity visualization
 *
 * All functions are pure and operate on ImageData.
 *
 * Reference: OpenRV StereoIPNode convergence measurement tools
 */

import { clamp } from '../utils/math';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of disparity measurement at a single point */
export interface DisparityAtPoint {
  /** Cursor x position (pixels) */
  x: number;
  /** Cursor y position (pixels) */
  y: number;
  /** Horizontal pixel disparity (positive = right eye feature is to the right of left eye feature) */
  disparity: number;
  /** Match confidence 0-1 (1 = perfect match, 0 = no correlation) */
  confidence: number;
}

/** Aggregate disparity statistics over a region */
export interface DisparityStats {
  min: number;
  max: number;
  avg: number;
  /** Number of valid sample points */
  sampleCount: number;
}

/** Options for convergence guide overlay rendering */
export interface ConvergenceGuideOptions {
  /** Screen-plane convergence line position as fraction of width (0-1) */
  convergenceX: number;
  /** Near-plane disparity threshold in pixels (negative = in front of screen) */
  nearPlane: number;
  /** Far-plane disparity threshold in pixels (positive = behind screen) */
  farPlane: number;
  /** Guide line opacity (0-1) */
  opacity: number;
}

export const DEFAULT_CONVERGENCE_GUIDE_OPTIONS: ConvergenceGuideOptions = {
  convergenceX: 0.5,
  nearPlane: -10,
  farPlane: 10,
  opacity: 0.6,
};

/** Parameters for disparity measurement */
export interface DisparityMeasureParams {
  /** Half-size of the matching window (full window = 2*windowRadius+1) */
  windowRadius: number;
  /** Maximum horizontal search distance in pixels */
  searchRange: number;
}

export const DEFAULT_MEASURE_PARAMS: DisparityMeasureParams = {
  windowRadius: 8,
  searchRange: 64,
};

// ---------------------------------------------------------------------------
// Core: Luminance extraction
// ---------------------------------------------------------------------------

/**
 * Extract luminance value at pixel (x, y) from ImageData.
 * Uses Rec. 709 coefficients: Y = 0.2126*R + 0.7152*G + 0.0722*B
 */
function getLuminance(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  const idx = (y * width + x) * 4;
  return 0.2126 * data[idx]! + 0.7152 * data[idx + 1]! + 0.0722 * data[idx + 2]!;
}

// ---------------------------------------------------------------------------
// Core: Block matching via Sum of Absolute Differences (SAD)
// ---------------------------------------------------------------------------

/**
 * Compute the Sum of Absolute Differences (SAD) between a window in the
 * left image at (lx, ly) and the right image at (rx, ry).
 *
 * Returns a normalized SAD value (0 = perfect match, 255 = worst).
 */
function computeSAD(
  leftData: Uint8ClampedArray,
  leftWidth: number,
  leftHeight: number,
  rightData: Uint8ClampedArray,
  rightWidth: number,
  rightHeight: number,
  lx: number,
  ly: number,
  rx: number,
  ry: number,
  windowRadius: number,
): number {
  let sad = 0;
  let count = 0;

  for (let dy = -windowRadius; dy <= windowRadius; dy++) {
    const leftY = ly + dy;
    const rightY = ry + dy;
    if (leftY < 0 || leftY >= leftHeight || rightY < 0 || rightY >= rightHeight) continue;

    for (let dx = -windowRadius; dx <= windowRadius; dx++) {
      const leftX = lx + dx;
      const rightX = rx + dx;
      if (leftX < 0 || leftX >= leftWidth || rightX < 0 || rightX >= rightWidth) continue;

      const lLum = getLuminance(leftData, leftWidth, leftX, leftY);
      const rLum = getLuminance(rightData, rightWidth, rightX, rightY);
      sad += Math.abs(lLum - rLum);
      count++;
    }
  }

  return count > 0 ? sad / count : 255;
}

// ---------------------------------------------------------------------------
// Public: Disparity at a point
// ---------------------------------------------------------------------------

/**
 * Measure horizontal pixel disparity at a specific point using block matching.
 *
 * Searches horizontally in the right image for the best matching window
 * from the left image at position (x, y). The disparity is the horizontal
 * offset that minimizes the Sum of Absolute Differences (SAD).
 *
 * @param left - Left eye ImageData
 * @param right - Right eye ImageData
 * @param x - Cursor x position (in left eye coordinates)
 * @param y - Cursor y position (in left eye coordinates)
 * @param params - Measurement parameters (window size, search range)
 * @returns Disparity measurement with confidence
 */
export function measureDisparityAtPoint(
  left: ImageData,
  right: ImageData,
  x: number,
  y: number,
  params: DisparityMeasureParams = DEFAULT_MEASURE_PARAMS,
): DisparityAtPoint {
  const { windowRadius, searchRange } = params;

  // Clamp cursor to valid range
  const cx = clamp(Math.round(x), 0, left.width - 1);
  const cy = clamp(Math.round(y), 0, left.height - 1);

  let bestDisparity = 0;
  let bestSAD = Infinity;
  let worstSAD = 0;

  // Search horizontally in the right image
  for (let d = -searchRange; d <= searchRange; d++) {
    const rx = cx + d;
    if (rx < 0 || rx >= right.width) continue;

    const sad = computeSAD(
      left.data, left.width, left.height,
      right.data, right.width, right.height,
      cx, cy, rx, cy,
      windowRadius,
    );

    if (sad < bestSAD || (sad === bestSAD && Math.abs(d) < Math.abs(bestDisparity))) {
      bestSAD = sad;
      bestDisparity = d;
    }
    if (sad > worstSAD) {
      worstSAD = sad;
    }
  }

  // Confidence: 1 when best SAD is 0, 0 when best equals worst
  const range = worstSAD - bestSAD;
  const confidence = range > 0 ? clamp(1 - bestSAD / worstSAD, 0, 1) : (bestSAD === 0 ? 1 : 0);

  return {
    x: cx,
    y: cy,
    disparity: bestDisparity,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Public: Disparity statistics over a region
// ---------------------------------------------------------------------------

/**
 * Compute disparity statistics over the overlapping region of L/R images.
 *
 * Samples disparity at a regular grid with the given spacing. Returns
 * min, max, and average disparity values.
 *
 * @param left - Left eye ImageData
 * @param right - Right eye ImageData
 * @param sampleSpacing - Pixel spacing between sample points (default 16)
 * @param params - Measurement parameters for each sample
 * @returns Aggregate disparity statistics
 */
export function measureDisparityStats(
  left: ImageData,
  right: ImageData,
  sampleSpacing: number = 16,
  params: DisparityMeasureParams = DEFAULT_MEASURE_PARAMS,
): DisparityStats {
  const spacing = Math.max(1, Math.round(sampleSpacing));
  const w = Math.min(left.width, right.width);
  const h = Math.min(left.height, right.height);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;

  const margin = params.windowRadius;

  for (let y = margin; y < h - margin; y += spacing) {
    for (let x = margin; x < w - margin; x += spacing) {
      const result = measureDisparityAtPoint(left, right, x, y, params);
      // Only include samples with reasonable confidence
      if (result.confidence > 0.1) {
        const d = result.disparity;
        if (d < min) min = d;
        if (d > max) max = d;
        sum += d;
        count++;
      }
    }
  }

  if (count === 0) {
    return { min: 0, max: 0, avg: 0, sampleCount: 0 };
  }

  return {
    min,
    max,
    avg: sum / count,
    sampleCount: count,
  };
}

// ---------------------------------------------------------------------------
// Public: Convergence guide overlay
// ---------------------------------------------------------------------------

/**
 * Render a convergence guide overlay on the given image.
 *
 * Draws three vertical reference lines:
 * - Green center line at the convergence point (screen plane)
 * - Blue line at the near-plane limit (left of center for negative disparity)
 * - Red line at the far-plane limit (right of center for positive disparity)
 *
 * @param imageData - Source image to overlay on (not modified)
 * @param options - Guide positioning and appearance
 * @returns New ImageData with overlay applied
 */
export function renderConvergenceGuide(
  imageData: ImageData,
  options: ConvergenceGuideOptions = DEFAULT_CONVERGENCE_GUIDE_OPTIONS,
): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const alpha = clamp(options.opacity, 0, 1);

  const centerX = Math.round(clamp(options.convergenceX, 0, 1) * (width - 1));
  const nearX = clamp(centerX + Math.round(options.nearPlane), 0, width - 1);
  const farX = clamp(centerX + Math.round(options.farPlane), 0, width - 1);

  // Draw vertical lines
  for (let y = 0; y < height; y++) {
    // Green center line (screen plane convergence)
    blendPixel(result, centerX, y, 0, 255, 0, alpha);

    // Blue near-plane line
    if (nearX !== centerX) {
      blendPixel(result, nearX, y, 0, 100, 255, alpha);
    }

    // Red far-plane line
    if (farX !== centerX) {
      blendPixel(result, farX, y, 255, 0, 0, alpha);
    }
  }

  return result;
}

/**
 * Alpha-blend a color onto a pixel in ImageData.
 */
function blendPixel(
  img: ImageData,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
): void {
  const idx = (y * img.width + x) * 4;
  const inv = 1 - alpha;
  img.data[idx] = Math.round(img.data[idx]! * inv + r * alpha);
  img.data[idx + 1] = Math.round(img.data[idx + 1]! * inv + g * alpha);
  img.data[idx + 2] = Math.round(img.data[idx + 2]! * inv + b * alpha);
  img.data[idx + 3] = 255;
}

// ---------------------------------------------------------------------------
// Public: Disparity heatmap
// ---------------------------------------------------------------------------

/**
 * Render a color-coded disparity heatmap from L/R eye images.
 *
 * Colors:
 * - Blue: negative disparity (object in front of screen)
 * - Green: zero disparity (at screen plane)
 * - Red: positive disparity (object behind screen)
 * - Black: no valid measurement
 *
 * @param left - Left eye ImageData
 * @param right - Right eye ImageData
 * @param sampleSpacing - Pixel spacing between samples (default 4)
 * @param params - Measurement parameters
 * @returns New ImageData with heatmap visualization
 */
export function renderDisparityHeatmap(
  left: ImageData,
  right: ImageData,
  sampleSpacing: number = 4,
  params: DisparityMeasureParams = DEFAULT_MEASURE_PARAMS,
): ImageData {
  const w = Math.min(left.width, right.width);
  const h = Math.min(left.height, right.height);
  const result = new ImageData(w, h);
  const spacing = Math.max(1, Math.round(sampleSpacing));

  // First pass: compute disparity at each sample and find range
  const disparities = new Float32Array(Math.ceil(w / spacing) * Math.ceil(h / spacing));
  const confidences = new Float32Array(disparities.length);
  let minD = Infinity;
  let maxD = -Infinity;
  let idx = 0;

  const margin = params.windowRadius;

  for (let sy = 0; sy < h; sy += spacing) {
    for (let sx = 0; sx < w; sx += spacing) {
      if (sy >= margin && sy < h - margin && sx >= margin && sx < w - margin) {
        const r = measureDisparityAtPoint(left, right, sx, sy, params);
        disparities[idx] = r.disparity;
        confidences[idx] = r.confidence;
        if (r.confidence > 0.1) {
          if (r.disparity < minD) minD = r.disparity;
          if (r.disparity > maxD) maxD = r.disparity;
        }
      }
      idx++;
    }
  }

  if (minD === Infinity) {
    // No valid samples
    return result;
  }

  // Ensure symmetric range for balanced coloring
  const absMax = Math.max(Math.abs(minD), Math.abs(maxD), 1);

  // Second pass: render heatmap using nearest-sample coloring
  const cols = Math.ceil(w / spacing);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const si = Math.min(Math.floor(px / spacing), cols - 1);
      const sj = Math.min(Math.floor(py / spacing), Math.ceil(h / spacing) - 1);
      const sIdx = sj * cols + si;
      const outIdx = (py * w + px) * 4;

      const conf = confidences[sIdx]!;
      if (conf <= 0.1) {
        // Black for invalid
        result.data[outIdx + 3] = 255;
        continue;
      }

      const d = disparities[sIdx]!;
      const t = clamp(d / absMax, -1, 1); // -1 to +1

      let r: number, g: number, b: number;
      if (t < 0) {
        // Negative disparity: blue → green
        const f = -t; // 0 to 1
        r = 0;
        g = Math.round(255 * (1 - f));
        b = Math.round(255 * f);
      } else {
        // Positive disparity: green → red
        const f = t; // 0 to 1
        r = Math.round(255 * f);
        g = Math.round(255 * (1 - f));
        b = 0;
      }

      result.data[outIdx] = r;
      result.data[outIdx + 1] = g;
      result.data[outIdx + 2] = b;
      result.data[outIdx + 3] = 255;
    }
  }

  return result;
}
