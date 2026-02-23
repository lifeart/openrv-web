/**
 * Floating Window Violation Detector for Stereo Content
 *
 * A floating window violation occurs when stereo content appears to extend
 * beyond the physical screen edges, breaking the 3D illusion. This happens
 * when objects at the frame borders have negative disparity (appear in front
 * of the screen plane).
 *
 * Detection works by measuring horizontal disparity at the four frame edges
 * (left, right, top, bottom) and checking for negative disparity values that
 * indicate content protruding in front of the screen.
 *
 * Reference: Standard stereo QC practice for theatrical and streaming delivery.
 */

import { clamp } from '../utils/math';
import {
  measureDisparityAtPoint,
  type DisparityMeasureParams,
  DEFAULT_MEASURE_PARAMS,
} from './ConvergenceMeasure';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which screen edge has a violation */
export type ViolationEdge = 'left' | 'right' | 'top' | 'bottom';

/** Violation info for a single edge */
export interface EdgeViolation {
  /** Which edge is affected */
  edge: ViolationEdge;
  /** Maximum negative disparity (most protruding) at this edge, in pixels.
   *  Always negative when a violation exists. */
  maxViolationDisparity: number;
  /** Number of sample points on this edge that had negative disparity */
  violatingPoints: number;
  /** Total number of sample points measured on this edge */
  totalPoints: number;
}

/** Complete violation detection result */
export interface FloatingWindowViolationResult {
  /** Whether any violation was detected */
  hasViolation: boolean;
  /** Per-edge violation details (only edges with violations are included) */
  violations: EdgeViolation[];
  /** Summary: maximum negative disparity across all edges */
  worstDisparity: number;
  /** Summary: list of affected edge names */
  affectedEdges: ViolationEdge[];
}

/** Options for floating window violation detection */
export interface FloatingWindowDetectorOptions {
  /** Disparity measurement parameters */
  measureParams: DisparityMeasureParams;
  /** How many pixels from the edge to sample (border strip width) */
  borderWidth: number;
  /** Spacing between sample points along each edge */
  sampleSpacing: number;
  /** Minimum negative disparity to count as a violation (pixels, should be <= 0) */
  violationThreshold: number;
}

export const DEFAULT_FLOATING_WINDOW_OPTIONS: FloatingWindowDetectorOptions = {
  measureParams: { ...DEFAULT_MEASURE_PARAMS },
  borderWidth: 16,
  sampleSpacing: 8,
  violationThreshold: -1,
};

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * Measure disparity samples along a single edge of the frame.
 *
 * @param left - Left eye ImageData
 * @param right - Right eye ImageData
 * @param edge - Which edge to sample
 * @param options - Detection options
 * @returns Array of disparity values measured along this edge
 */
function sampleEdgeDisparity(
  left: ImageData,
  right: ImageData,
  edge: ViolationEdge,
  options: FloatingWindowDetectorOptions,
): number[] {
  const { measureParams, borderWidth, sampleSpacing } = options;
  const w = Math.min(left.width, right.width);
  const h = Math.min(left.height, right.height);
  const margin = measureParams.windowRadius;
  const disparities: number[] = [];

  switch (edge) {
    case 'left': {
      // Sample along left edge: x within [margin, borderWidth), y varies
      const xRange = Math.min(borderWidth, w - margin);
      for (let y = margin; y < h - margin; y += sampleSpacing) {
        for (let x = margin; x < xRange; x += sampleSpacing) {
          const result = measureDisparityAtPoint(left, right, x, y, measureParams);
          if (result.confidence > 0.1) {
            disparities.push(result.disparity);
          }
        }
      }
      break;
    }
    case 'right': {
      // Sample along right edge: x within [w - borderWidth, w - margin)
      const xStart = Math.max(margin, w - borderWidth);
      for (let y = margin; y < h - margin; y += sampleSpacing) {
        for (let x = xStart; x < w - margin; x += sampleSpacing) {
          const result = measureDisparityAtPoint(left, right, x, y, measureParams);
          if (result.confidence > 0.1) {
            disparities.push(result.disparity);
          }
        }
      }
      break;
    }
    case 'top': {
      // Sample along top edge: y within [margin, borderWidth), x varies
      const yRange = Math.min(borderWidth, h - margin);
      for (let y = margin; y < yRange; y += sampleSpacing) {
        for (let x = margin; x < w - margin; x += sampleSpacing) {
          const result = measureDisparityAtPoint(left, right, x, y, measureParams);
          if (result.confidence > 0.1) {
            disparities.push(result.disparity);
          }
        }
      }
      break;
    }
    case 'bottom': {
      // Sample along bottom edge: y within [h - borderWidth, h - margin)
      const yStart = Math.max(margin, h - borderWidth);
      for (let y = yStart; y < h - margin; y += sampleSpacing) {
        for (let x = margin; x < w - margin; x += sampleSpacing) {
          const result = measureDisparityAtPoint(left, right, x, y, measureParams);
          if (result.confidence > 0.1) {
            disparities.push(result.disparity);
          }
        }
      }
      break;
    }
  }

  return disparities;
}

/**
 * Analyze disparity samples for a single edge and produce violation info.
 */
function analyzeEdge(
  edge: ViolationEdge,
  disparities: number[],
  threshold: number,
): EdgeViolation | null {
  if (disparities.length === 0) return null;

  let violatingCount = 0;
  let worstDisparity = 0;

  for (const d of disparities) {
    if (d < threshold) {
      violatingCount++;
      if (d < worstDisparity) {
        worstDisparity = d;
      }
    }
  }

  if (violatingCount === 0) return null;

  return {
    edge,
    maxViolationDisparity: worstDisparity,
    violatingPoints: violatingCount,
    totalPoints: disparities.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect floating window violations in a stereo image pair.
 *
 * Samples disparity at the four frame edges and checks for negative disparity
 * values (content in front of the screen plane). Objects at screen edges with
 * negative disparity create the floating window effect, breaking the 3D illusion.
 *
 * @param left - Left eye ImageData
 * @param right - Right eye ImageData
 * @param options - Detection parameters
 * @returns Violation detection result with per-edge details
 */
export function detectFloatingWindowViolations(
  left: ImageData,
  right: ImageData,
  options: FloatingWindowDetectorOptions = DEFAULT_FLOATING_WINDOW_OPTIONS,
): FloatingWindowViolationResult {
  const edges: ViolationEdge[] = ['left', 'right', 'top', 'bottom'];
  const violations: EdgeViolation[] = [];
  let worstDisparity = 0;

  for (const edge of edges) {
    const disparities = sampleEdgeDisparity(left, right, edge, options);
    const violation = analyzeEdge(edge, disparities, options.violationThreshold);
    if (violation) {
      violations.push(violation);
      if (violation.maxViolationDisparity < worstDisparity) {
        worstDisparity = violation.maxViolationDisparity;
      }
    }
  }

  return {
    hasViolation: violations.length > 0,
    violations,
    worstDisparity,
    affectedEdges: violations.map(v => v.edge),
  };
}

/**
 * Render a floating window violation overlay on an image.
 *
 * Draws red borders on edges where violations were detected.
 * Border intensity is proportional to the severity of the violation.
 *
 * @param imageData - Source image to overlay on (not modified)
 * @param result - Violation detection result
 * @param borderThickness - Thickness of the violation indicator border in pixels
 * @param opacity - Maximum opacity of the overlay (0-1)
 * @returns New ImageData with violation overlay applied
 */
export function renderViolationOverlay(
  imageData: ImageData,
  result: FloatingWindowViolationResult,
  borderThickness: number = 4,
  opacity: number = 0.7,
): ImageData {
  if (!result.hasViolation) {
    // Return a copy unchanged
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  }

  const { width, height } = imageData;
  const output = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const alpha = clamp(opacity, 0, 1);

  // Build a lookup for severity per edge
  const edgeSeverity = new Map<ViolationEdge, number>();
  for (const v of result.violations) {
    // Severity: 0 to 1, based on how negative the disparity is (more negative = more severe)
    // Normalize using worst disparity as reference
    const severity = result.worstDisparity !== 0
      ? clamp(v.maxViolationDisparity / result.worstDisparity, 0, 1)
      : 1;
    edgeSeverity.set(v.edge, severity);
  }

  const thickness = Math.max(1, Math.round(borderThickness));

  // Draw red borders on affected edges
  for (const [edge, severity] of edgeSeverity) {
    const edgeAlpha = alpha * severity;

    switch (edge) {
      case 'left':
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < thickness && x < width; x++) {
            blendRedPixel(output, x, y, edgeAlpha);
          }
        }
        break;
      case 'right':
        for (let y = 0; y < height; y++) {
          for (let x = Math.max(0, width - thickness); x < width; x++) {
            blendRedPixel(output, x, y, edgeAlpha);
          }
        }
        break;
      case 'top':
        for (let y = 0; y < thickness && y < height; y++) {
          for (let x = 0; x < width; x++) {
            blendRedPixel(output, x, y, edgeAlpha);
          }
        }
        break;
      case 'bottom':
        for (let y = Math.max(0, height - thickness); y < height; y++) {
          for (let x = 0; x < width; x++) {
            blendRedPixel(output, x, y, edgeAlpha);
          }
        }
        break;
    }
  }

  return output;
}

/**
 * Alpha-blend a red pixel onto the image at position (x, y).
 */
function blendRedPixel(img: ImageData, x: number, y: number, alpha: number): void {
  const idx = (y * img.width + x) * 4;
  const inv = 1 - alpha;
  img.data[idx] = Math.round(img.data[idx]! * inv + 255 * alpha);
  img.data[idx + 1] = Math.round(img.data[idx + 1]! * inv);
  img.data[idx + 2] = Math.round(img.data[idx + 2]! * inv);
  img.data[idx + 3] = 255;
}
