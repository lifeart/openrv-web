/**
 * Stereo Alignment Overlay Rendering
 *
 * Provides visual alignment tools for stereo correction:
 * - Grid overlay (64px spacing, white 30% opacity lines)
 * - Crosshair overlay (center lines, yellow 60% opacity)
 * - Difference mode (per-channel absolute difference between eyes)
 * - Edge overlay (Sobel-like edges, left=cyan, right=red, overlap=white)
 *
 * These overlays are drawn after the stereo composite step.
 */

import { StereoAlignMode } from './StereoEyeTransform';

/**
 * Apply alignment overlay to the stereo composite output.
 *
 * For 'grid' and 'crosshair', the overlay is drawn on top of the output.
 * For 'difference' and 'edges', the output is replaced entirely.
 *
 * @param output - The stereo composite ImageData (modified in-place for grid/crosshair)
 * @param mode - The alignment mode
 * @param left - Left eye ImageData (needed for difference and edge modes)
 * @param right - Right eye ImageData (needed for difference and edge modes)
 * @returns The resulting ImageData
 */
export function applyAlignmentOverlay(
  output: ImageData,
  mode: StereoAlignMode,
  left?: ImageData,
  right?: ImageData
): ImageData {
  switch (mode) {
    case 'off':
      return output;
    case 'grid':
      return renderGrid(output);
    case 'crosshair':
      return renderCrosshair(output);
    case 'difference':
      if (left && right) return renderDifference(left, right);
      return output;
    case 'edges':
      if (left && right) return renderEdgeOverlay(left, right);
      return output;
    default:
      return output;
  }
}

/**
 * Render grid overlay at 64px intervals.
 * Grid lines are white at 30% opacity, 1px wide.
 * The grid is composited over the existing image.
 */
export function renderGrid(imageData: ImageData): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const spacing = 64;
  const alpha = 0.3;

  // Draw vertical lines
  for (let x = spacing; x < width; x += spacing) {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      // Alpha blend white over existing pixel
      result.data[idx] = Math.round(result.data[idx]! * (1 - alpha) + 255 * alpha);
      result.data[idx + 1] = Math.round(result.data[idx + 1]! * (1 - alpha) + 255 * alpha);
      result.data[idx + 2] = Math.round(result.data[idx + 2]! * (1 - alpha) + 255 * alpha);
      result.data[idx + 3] = 255;
    }
  }

  // Draw horizontal lines
  for (let y = spacing; y < height; y += spacing) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      result.data[idx] = Math.round(result.data[idx]! * (1 - alpha) + 255 * alpha);
      result.data[idx + 1] = Math.round(result.data[idx + 1]! * (1 - alpha) + 255 * alpha);
      result.data[idx + 2] = Math.round(result.data[idx + 2]! * (1 - alpha) + 255 * alpha);
      result.data[idx + 3] = 255;
    }
  }

  return result;
}

/**
 * Render center crosshair overlay.
 * Crosshair is yellow (255, 255, 0) at 60% opacity, full width and height.
 */
export function renderCrosshair(imageData: ImageData): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
  const alpha = 0.6;
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);

  // Draw vertical line at center
  for (let y = 0; y < height; y++) {
    const idx = (y * width + cx) * 4;
    result.data[idx] = Math.round(result.data[idx]! * (1 - alpha) + 255 * alpha);
    result.data[idx + 1] = Math.round(result.data[idx + 1]! * (1 - alpha) + 255 * alpha);
    result.data[idx + 2] = Math.round(result.data[idx + 2]! * (1 - alpha) + 0 * alpha);
    result.data[idx + 3] = 255;
  }

  // Draw horizontal line at center
  for (let x = 0; x < width; x++) {
    const idx = (cy * width + x) * 4;
    result.data[idx] = Math.round(result.data[idx]! * (1 - alpha) + 255 * alpha);
    result.data[idx + 1] = Math.round(result.data[idx + 1]! * (1 - alpha) + 255 * alpha);
    result.data[idx + 2] = Math.round(result.data[idx + 2]! * (1 - alpha) + 0 * alpha);
    result.data[idx + 3] = 255;
  }

  return result;
}

/**
 * Render absolute difference between left and right eye.
 * Perfect alignment shows black; misalignment shows white.
 */
export function renderDifference(left: ImageData, right: ImageData): ImageData {
  const width = left.width;
  const height = left.height;
  const result = new ImageData(width, height);

  // Handle size mismatch: use smaller dimensions
  const w = Math.min(width, right.width);
  const h = Math.min(height, right.height);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const leftIdx = (y * left.width + x) * 4;
      const rightIdx = (y * right.width + x) * 4;
      const outIdx = (y * width + x) * 4;

      result.data[outIdx] = Math.abs(left.data[leftIdx]! - right.data[rightIdx]!);
      result.data[outIdx + 1] = Math.abs(left.data[leftIdx + 1]! - right.data[rightIdx + 1]!);
      result.data[outIdx + 2] = Math.abs(left.data[leftIdx + 2]! - right.data[rightIdx + 2]!);
      result.data[outIdx + 3] = 255;
    }
  }
  return result;
}

/**
 * Simple edge detection using Sobel-like gradient.
 * Returns a binary edge map (0 or 255 per pixel).
 */
function detectEdges(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const edges = new Uint8Array(width * height);
  const threshold = 30;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      // Horizontal gradient
      const idxL = (y * width + (x - 1)) * 4;
      const idxR = (y * width + (x + 1)) * 4;
      const lumL = 0.299 * data[idxL]! + 0.587 * data[idxL + 1]! + 0.114 * data[idxL + 2]!;
      const lumR = 0.299 * data[idxR]! + 0.587 * data[idxR + 1]! + 0.114 * data[idxR + 2]!;
      const gx = lumR - lumL;

      // Vertical gradient
      const idxU = ((y - 1) * width + x) * 4;
      const idxD = ((y + 1) * width + x) * 4;
      const lumU = 0.299 * data[idxU]! + 0.587 * data[idxU + 1]! + 0.114 * data[idxU + 2]!;
      const lumD = 0.299 * data[idxD]! + 0.587 * data[idxD + 1]! + 0.114 * data[idxD + 2]!;
      const gy = lumD - lumU;

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * width + x] = magnitude > threshold ? 255 : 0;
    }
  }

  return edges;
}

/**
 * Render edge overlay: left eye edges in cyan, right eye edges in red.
 * Overlapping edges appear white.
 */
export function renderEdgeOverlay(left: ImageData, right: ImageData): ImageData {
  const width = left.width;
  const height = left.height;
  const result = new ImageData(width, height);

  const leftEdges = detectEdges(left);
  const rightEdges = detectEdges(right);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edgeIdx = y * width + x;
      const outIdx = edgeIdx * 4;
      const hasLeft = leftEdges[edgeIdx]! > 0;
      const hasRight = x < right.width && y < right.height ? rightEdges[y * right.width + x]! > 0 : false;

      if (hasLeft && hasRight) {
        // Overlap: white
        result.data[outIdx] = 255;
        result.data[outIdx + 1] = 255;
        result.data[outIdx + 2] = 255;
      } else if (hasLeft) {
        // Left eye: cyan
        result.data[outIdx] = 0;
        result.data[outIdx + 1] = 255;
        result.data[outIdx + 2] = 255;
      } else if (hasRight) {
        // Right eye: red
        result.data[outIdx] = 255;
        result.data[outIdx + 1] = 0;
        result.data[outIdx + 2] = 0;
      }
      // else: black (default 0,0,0)
      result.data[outIdx + 3] = 255;
    }
  }

  return result;
}
