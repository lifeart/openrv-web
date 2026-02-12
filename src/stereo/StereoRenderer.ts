/**
 * Stereo Viewing Modes Renderer
 *
 * Implements stereoscopic 3D viewing modes following OpenRV patterns.
 * Supports various display modes for stereo content including:
 * - Side-by-side (left/right)
 * - Over/Under (top/bottom)
 * - Mirror (side-by-side with right eye flipped)
 * - Anaglyph (red-cyan color)
 * - Luminance Anaglyph (grayscale red-cyan)
 * - Checkerboard (alternating pixels)
 * - Scanline (alternating lines)
 *
 * Reference: OpenRV StereoIPNode.cpp
 */

import {
  StereoEyeTransformState,
  StereoAlignMode,
  isDefaultStereoEyeTransformState,
  applyEyeTransform,
} from './StereoEyeTransform';
import { applyAlignmentOverlay } from './StereoAlignOverlay';
import { luminanceRec709 } from '../color/PixelMath';

// Re-export types from StereoEyeTransform for convenience
export type {
  EyeTransform,
  StereoEyeTransformState,
  StereoAlignMode,
} from './StereoEyeTransform';
export {
  DEFAULT_EYE_TRANSFORM,
  DEFAULT_STEREO_EYE_TRANSFORM_STATE,
  DEFAULT_STEREO_ALIGN_MODE,
  STEREO_ALIGN_MODES,
  isDefaultEyeTransform,
  isDefaultStereoEyeTransformState,
  applyEyeTransform,
} from './StereoEyeTransform';
export { applyAlignmentOverlay } from './StereoAlignOverlay';

// Re-export types and defaults from centralized types for backward compatibility
export type { StereoMode, StereoInputFormat, StereoState } from '../core/types/stereo';
export { DEFAULT_STEREO_STATE } from '../core/types/stereo';

// Import for local use
import type { StereoState, StereoMode, StereoInputFormat } from '../core/types/stereo';

/**
 * Apply stereo rendering to source image data
 *
 * @param sourceData - The source ImageData (assumed to be side-by-side stereo)
 * @param state - Current stereo state
 * @param inputFormat - Format of the source stereo content
 * @returns Processed ImageData for display
 */
export function applyStereoMode(
  sourceData: ImageData,
  state: StereoState,
  inputFormat: StereoInputFormat = 'side-by-side'
): ImageData {
  if (state.mode === 'off') {
    return sourceData;
  }

  const { width, height } = sourceData;

  // Extract left and right eye images based on input format
  const { left, right } = extractStereoEyes(sourceData, inputFormat, state.eyeSwap);

  // Apply offset to the right eye
  const offsetRight = state.offset !== 0 ? applyHorizontalOffset(right, state.offset) : right;

  // Apply the selected stereo mode
  switch (state.mode) {
    case 'side-by-side':
      return renderSideBySide(left, offsetRight, width, height);
    case 'over-under':
      return renderOverUnder(left, offsetRight, width, height);
    case 'mirror':
      return renderMirror(left, offsetRight, width, height);
    case 'anaglyph':
      return renderAnaglyph(left, offsetRight, false);
    case 'anaglyph-luminance':
      return renderAnaglyph(left, offsetRight, true);
    case 'checkerboard':
      return renderCheckerboard(left, offsetRight);
    case 'scanline':
      return renderScanline(left, offsetRight);
    default:
      return sourceData;
  }
}

/**
 * Apply stereo rendering with per-eye transforms and alignment overlay.
 *
 * This extends the basic applyStereoMode with:
 * 1. Per-eye transforms applied between eye extraction and composite
 * 2. Alignment overlay applied after composite
 *
 * Returns the processed ImageData and optionally the transformed left/right eye buffers
 * (needed for difference/edge alignment modes).
 */
export function applyStereoModeWithEyeTransforms(
  sourceData: ImageData,
  state: StereoState,
  eyeTransformState?: StereoEyeTransformState,
  alignMode?: StereoAlignMode,
  inputFormat: StereoInputFormat = 'side-by-side'
): ImageData {
  if (state.mode === 'off') {
    return sourceData;
  }

  const { width, height } = sourceData;

  // Extract left and right eye images based on input format
  const { left, right } = extractStereoEyes(sourceData, inputFormat, state.eyeSwap);

  // Apply offset to the right eye
  const offsetRight = state.offset !== 0 ? applyHorizontalOffset(right, state.offset) : right;

  // Apply per-eye transforms (NEW step)
  let transformedLeft = left;
  let transformedRight = offsetRight;
  if (eyeTransformState && !isDefaultStereoEyeTransformState(eyeTransformState)) {
    transformedLeft = applyEyeTransform(left, eyeTransformState.left);
    transformedRight = applyEyeTransform(offsetRight, eyeTransformState.right);
  }

  // Apply the selected stereo mode (composite)
  let result: ImageData;
  switch (state.mode) {
    case 'side-by-side':
      result = renderSideBySide(transformedLeft, transformedRight, width, height);
      break;
    case 'over-under':
      result = renderOverUnder(transformedLeft, transformedRight, width, height);
      break;
    case 'mirror':
      result = renderMirror(transformedLeft, transformedRight, width, height);
      break;
    case 'anaglyph':
      result = renderAnaglyph(transformedLeft, transformedRight, false);
      break;
    case 'anaglyph-luminance':
      result = renderAnaglyph(transformedLeft, transformedRight, true);
      break;
    case 'checkerboard':
      result = renderCheckerboard(transformedLeft, transformedRight);
      break;
    case 'scanline':
      result = renderScanline(transformedLeft, transformedRight);
      break;
    default:
      result = sourceData;
      break;
  }

  // Apply alignment overlay (NEW step)
  if (alignMode && alignMode !== 'off') {
    result = applyAlignmentOverlay(result, alignMode, transformedLeft, transformedRight);
  }

  return result;
}

/**
 * Extract left and right eye images from stereo source
 */
function extractStereoEyes(
  sourceData: ImageData,
  inputFormat: StereoInputFormat,
  eyeSwap: boolean
): { left: ImageData; right: ImageData } {
  const { width, height, data } = sourceData;

  let leftData: ImageData;
  let rightData: ImageData;

  if (inputFormat === 'side-by-side') {
    // Left eye is left half, right eye is right half
    const halfWidth = Math.floor(width / 2);
    leftData = new ImageData(halfWidth, height);
    rightData = new ImageData(halfWidth, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < halfWidth; x++) {
        const srcIdxLeft = (y * width + x) * 4;
        const srcIdxRight = (y * width + x + halfWidth) * 4;
        const dstIdx = (y * halfWidth + x) * 4;

        // Copy left half
        leftData.data[dstIdx] = data[srcIdxLeft]!;
        leftData.data[dstIdx + 1] = data[srcIdxLeft + 1]!;
        leftData.data[dstIdx + 2] = data[srcIdxLeft + 2]!;
        leftData.data[dstIdx + 3] = data[srcIdxLeft + 3]!;

        // Copy right half
        rightData.data[dstIdx] = data[srcIdxRight]!;
        rightData.data[dstIdx + 1] = data[srcIdxRight + 1]!;
        rightData.data[dstIdx + 2] = data[srcIdxRight + 2]!;
        rightData.data[dstIdx + 3] = data[srcIdxRight + 3]!;
      }
    }
  } else if (inputFormat === 'over-under') {
    // Left eye is top half, right eye is bottom half
    const halfHeight = Math.floor(height / 2);
    leftData = new ImageData(width, halfHeight);
    rightData = new ImageData(width, halfHeight);

    for (let y = 0; y < halfHeight; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdxTop = (y * width + x) * 4;
        const srcIdxBottom = ((y + halfHeight) * width + x) * 4;
        const dstIdx = (y * width + x) * 4;

        // Copy top half
        leftData.data[dstIdx] = data[srcIdxTop]!;
        leftData.data[dstIdx + 1] = data[srcIdxTop + 1]!;
        leftData.data[dstIdx + 2] = data[srcIdxTop + 2]!;
        leftData.data[dstIdx + 3] = data[srcIdxTop + 3]!;

        // Copy bottom half
        rightData.data[dstIdx] = data[srcIdxBottom]!;
        rightData.data[dstIdx + 1] = data[srcIdxBottom + 1]!;
        rightData.data[dstIdx + 2] = data[srcIdxBottom + 2]!;
        rightData.data[dstIdx + 3] = data[srcIdxBottom + 3]!;
      }
    }
  } else {
    // Separate format - just use the source as both eyes
    leftData = new ImageData(new Uint8ClampedArray(data), width, height);
    rightData = new ImageData(new Uint8ClampedArray(data), width, height);
  }

  // Apply eye swap if requested
  if (eyeSwap) {
    return { left: rightData, right: leftData };
  }

  return { left: leftData, right: rightData };
}

/**
 * Apply horizontal offset to eye image for convergence control
 */
function applyHorizontalOffset(imageData: ImageData, offsetPercent: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);
  const offsetPixels = Math.round((offsetPercent / 100) * width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x - offsetPixels;
      const dstIdx = (y * width + x) * 4;

      if (srcX >= 0 && srcX < width) {
        const srcIdx = (y * width + srcX) * 4;
        result.data[dstIdx] = data[srcIdx]!;
        result.data[dstIdx + 1] = data[srcIdx + 1]!;
        result.data[dstIdx + 2] = data[srcIdx + 2]!;
        result.data[dstIdx + 3] = data[srcIdx + 3]!;
      } else {
        // Fill with black for out-of-bounds areas
        result.data[dstIdx] = 0;
        result.data[dstIdx + 1] = 0;
        result.data[dstIdx + 2] = 0;
        result.data[dstIdx + 3] = 255;
      }
    }
  }

  return result;
}

/**
 * Render side-by-side stereo output
 * Displays left and right eyes horizontally adjacent
 */
function renderSideBySide(
  left: ImageData,
  right: ImageData,
  outputWidth: number,
  outputHeight: number
): ImageData {
  const result = new ImageData(outputWidth, outputHeight);
  const leftWidth = Math.floor(outputWidth / 2);
  const rightWidth = outputWidth - leftWidth; // Handles odd widths correctly

  // Scale left eye to left half
  scaleAndCopyToRegion(left, result, 0, 0, leftWidth, outputHeight);

  // Scale right eye to right half (may be 1px wider for odd widths)
  scaleAndCopyToRegion(right, result, leftWidth, 0, rightWidth, outputHeight);

  return result;
}

/**
 * Render over/under stereo output
 * Displays left eye on top, right eye on bottom
 */
function renderOverUnder(
  left: ImageData,
  right: ImageData,
  outputWidth: number,
  outputHeight: number
): ImageData {
  const result = new ImageData(outputWidth, outputHeight);
  const topHeight = Math.floor(outputHeight / 2);
  const bottomHeight = outputHeight - topHeight; // Handles odd heights correctly

  // Scale left eye to top half
  scaleAndCopyToRegion(left, result, 0, 0, outputWidth, topHeight);

  // Scale right eye to bottom half (may be 1px taller for odd heights)
  scaleAndCopyToRegion(right, result, 0, topHeight, outputWidth, bottomHeight);

  return result;
}

/**
 * Render mirror stereo output
 * Side-by-side with right eye horizontally flipped
 */
function renderMirror(
  left: ImageData,
  right: ImageData,
  outputWidth: number,
  outputHeight: number
): ImageData {
  const result = new ImageData(outputWidth, outputHeight);
  const leftWidth = Math.floor(outputWidth / 2);
  const rightWidth = outputWidth - leftWidth; // Handles odd widths correctly

  // Scale left eye to left half
  scaleAndCopyToRegion(left, result, 0, 0, leftWidth, outputHeight);

  // Flip right eye horizontally and scale to right half
  const flippedRight = flipHorizontal(right);
  scaleAndCopyToRegion(flippedRight, result, leftWidth, 0, rightWidth, outputHeight);

  return result;
}

/**
 * Flip an image horizontally
 */
function flipHorizontal(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = (y * width + (width - 1 - x)) * 4;

      result.data[dstIdx] = data[srcIdx]!;
      result.data[dstIdx + 1] = data[srcIdx + 1]!;
      result.data[dstIdx + 2] = data[srcIdx + 2]!;
      result.data[dstIdx + 3] = data[srcIdx + 3]!;
    }
  }

  return result;
}

/**
 * Render anaglyph stereo output
 * Left eye in red channel, right eye in cyan (green+blue)
 */
function renderAnaglyph(left: ImageData, right: ImageData, useLuminance: boolean): ImageData {
  // Ensure both images have the same dimensions
  const width = left.width;
  const height = left.height;
  const result = new ImageData(width, height);

  // Scale right eye if dimensions don't match
  const scaledRight = right.width !== width || right.height !== height
    ? scaleImage(right, width, height)
    : right;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const leftR = left.data[idx]!;
      const leftG = left.data[idx + 1]!;
      const leftB = left.data[idx + 2]!;

      const rightR = scaledRight.data[idx]!;
      const rightG = scaledRight.data[idx + 1]!;
      const rightB = scaledRight.data[idx + 2]!;

      if (useLuminance) {
        // Luminance anaglyph - convert to grayscale first
        // Using Rec.709 luminance coefficients
        const leftLuma = Math.round(luminanceRec709(leftR, leftG, leftB));
        const rightLuma = Math.round(luminanceRec709(rightR, rightG, rightB));

        result.data[idx] = leftLuma;     // Red channel from left eye luminance
        result.data[idx + 1] = rightLuma; // Green channel from right eye luminance
        result.data[idx + 2] = rightLuma; // Blue channel from right eye luminance
      } else {
        // Color anaglyph - left eye red, right eye cyan
        result.data[idx] = leftR;        // Red channel from left eye
        result.data[idx + 1] = rightG;   // Green channel from right eye
        result.data[idx + 2] = rightB;   // Blue channel from right eye
      }
      result.data[idx + 3] = 255;
    }
  }

  return result;
}

/**
 * Render checkerboard stereo output
 * Alternating pixels from left and right eyes
 * Used with DLP projectors and shutter glasses
 */
function renderCheckerboard(left: ImageData, right: ImageData): ImageData {
  const width = left.width;
  const height = left.height;
  const result = new ImageData(width, height);

  const scaledRight = right.width !== width || right.height !== height
    ? scaleImage(right, width, height)
    : right;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isEven = (x + y) % 2 === 0;
      const source = isEven ? left : scaledRight;

      result.data[idx] = source.data[idx]!;
      result.data[idx + 1] = source.data[idx + 1]!;
      result.data[idx + 2] = source.data[idx + 2]!;
      result.data[idx + 3] = source.data[idx + 3]!;
    }
  }

  return result;
}

/**
 * Render scanline interleaved stereo output
 * Alternating lines from left and right eyes
 * Used with line-blanking displays
 */
function renderScanline(left: ImageData, right: ImageData): ImageData {
  const width = left.width;
  const height = left.height;
  const result = new ImageData(width, height);

  const scaledRight = right.width !== width || right.height !== height
    ? scaleImage(right, width, height)
    : right;

  for (let y = 0; y < height; y++) {
    const isEvenLine = y % 2 === 0;
    const source = isEvenLine ? left : scaledRight;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      result.data[idx] = source.data[idx]!;
      result.data[idx + 1] = source.data[idx + 1]!;
      result.data[idx + 2] = source.data[idx + 2]!;
      result.data[idx + 3] = source.data[idx + 3]!;
    }
  }

  return result;
}

/**
 * Scale an image to new dimensions using bilinear interpolation
 */
function scaleImage(source: ImageData, newWidth: number, newHeight: number): ImageData {
  const result = new ImageData(newWidth, newHeight);
  const xRatio = source.width / newWidth;
  const yRatio = source.height / newHeight;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = x * xRatio;
      const srcY = y * yRatio;

      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, source.width - 1);
      const y1 = Math.min(y0 + 1, source.height - 1);

      const xFrac = srcX - x0;
      const yFrac = srcY - y0;

      const idx00 = (y0 * source.width + x0) * 4;
      const idx10 = (y0 * source.width + x1) * 4;
      const idx01 = (y1 * source.width + x0) * 4;
      const idx11 = (y1 * source.width + x1) * 4;

      const dstIdx = (y * newWidth + x) * 4;

      for (let c = 0; c < 4; c++) {
        const v00 = source.data[idx00 + c]!;
        const v10 = source.data[idx10 + c]!;
        const v01 = source.data[idx01 + c]!;
        const v11 = source.data[idx11 + c]!;

        const v0 = v00 * (1 - xFrac) + v10 * xFrac;
        const v1 = v01 * (1 - xFrac) + v11 * xFrac;
        const value = v0 * (1 - yFrac) + v1 * yFrac;

        result.data[dstIdx + c] = Math.round(value);
      }
    }
  }

  return result;
}

/**
 * Scale and copy source image to a region in destination
 */
function scaleAndCopyToRegion(
  source: ImageData,
  dest: ImageData,
  destX: number,
  destY: number,
  destWidth: number,
  destHeight: number
): void {
  const xRatio = source.width / destWidth;
  const yRatio = source.height / destHeight;

  for (let y = 0; y < destHeight; y++) {
    for (let x = 0; x < destWidth; x++) {
      const srcX = Math.min(Math.floor(x * xRatio), source.width - 1);
      const srcY = Math.min(Math.floor(y * yRatio), source.height - 1);

      const srcIdx = (srcY * source.width + srcX) * 4;
      const dstIdx = ((destY + y) * dest.width + (destX + x)) * 4;

      dest.data[dstIdx] = source.data[srcIdx]!;
      dest.data[dstIdx + 1] = source.data[srcIdx + 1]!;
      dest.data[dstIdx + 2] = source.data[srcIdx + 2]!;
      dest.data[dstIdx + 3] = source.data[srcIdx + 3]!;
    }
  }
}

/**
 * Check if a stereo state is at default values
 */
export function isDefaultStereoState(state: StereoState): boolean {
  return (
    state.mode === 'off' &&
    state.eyeSwap === false &&
    state.offset === 0
  );
}

/**
 * Get human-readable label for stereo mode
 */
export function getStereoModeLabel(mode: StereoMode): string {
  const labels: Record<StereoMode, string> = {
    'off': 'Off',
    'side-by-side': 'Side-by-Side',
    'over-under': 'Over/Under',
    'mirror': 'Mirror',
    'anaglyph': 'Anaglyph',
    'anaglyph-luminance': 'Anaglyph (Luma)',
    'checkerboard': 'Checkerboard',
    'scanline': 'Scanline',
  };
  return labels[mode];
}

/**
 * Get short label for stereo mode (for buttons)
 */
export function getStereoModeShortLabel(mode: StereoMode): string {
  const labels: Record<StereoMode, string> = {
    'off': 'Off',
    'side-by-side': 'SbS',
    'over-under': 'O/U',
    'mirror': 'Mir',
    'anaglyph': 'Ana',
    'anaglyph-luminance': 'Ana-L',
    'checkerboard': 'Chk',
    'scanline': 'Scn',
  };
  return labels[mode];
}
