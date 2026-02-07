/**
 * Shared utilities for image format decoders.
 *
 * Extracts common logic used across DPX, Cineon, EXR, TIFF, and JPEG Gainmap
 * decoders to reduce code duplication.
 */

import { IMAGE_LIMITS } from '../config/ImageLimits';

/**
 * Validate image dimensions against maximum constraints.
 *
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param formatName - Name of the format (used in error messages)
 * @param maxDimension - Maximum allowed value for width or height (default: 65536)
 * @param maxPixels - Maximum total pixel count (default: 268435456)
 * @throws Error if dimensions are invalid or exceed limits
 */
export function validateImageDimensions(
  width: number,
  height: number,
  formatName: string,
  maxDimension: number = IMAGE_LIMITS.MAX_DIMENSION,
  maxPixels: number = IMAGE_LIMITS.MAX_PIXELS,
): void {
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid ${formatName} dimensions: ${width}x${height}`);
  }

  if (width > maxDimension || height > maxDimension) {
    throw new Error(
      `${formatName} dimensions ${width}x${height} exceed maximum of ${maxDimension}x${maxDimension}`
    );
  }

  const totalPixels = width * height;
  if (totalPixels > maxPixels) {
    throw new Error(
      `${formatName} image has ${totalPixels} pixels, exceeding maximum of ${maxPixels}`
    );
  }
}

/**
 * Convert multi-channel pixel data to RGBA Float32Array.
 *
 * Handles 3 and 4 channel inputs:
 * - 4 channels: returned as-is (passthrough)
 * - 3 channels: RGB copied, alpha set to 1.0
 *
 * @param data - Source pixel data (interleaved)
 * @param width - Image width
 * @param height - Image height
 * @param inputChannels - Number of channels in source data (3 or 4)
 * @returns RGBA Float32Array with 4 channels per pixel
 */
export function toRGBA(
  data: Float32Array,
  width: number,
  height: number,
  inputChannels: number,
): Float32Array {
  if (inputChannels === 4) {
    return data;
  }

  const totalPixels = width * height;
  const result = new Float32Array(totalPixels * 4);

  for (let i = 0; i < totalPixels; i++) {
    const srcIdx = i * inputChannels;
    const dstIdx = i * 4;
    if (inputChannels === 1) {
      const v = data[srcIdx] ?? 0;
      result[dstIdx] = v;
      result[dstIdx + 1] = v;
      result[dstIdx + 2] = v;
    } else {
      result[dstIdx] = data[srcIdx] ?? 0;
      result[dstIdx + 1] = data[srcIdx + 1] ?? 0;
      result[dstIdx + 2] = data[srcIdx + 2] ?? 0;
    }
    result[dstIdx + 3] = 1.0;
  }

  return result;
}

/**
 * Apply log-to-linear conversion on RGBA data.
 *
 * Converts each pixel's RGB channels from normalized log code values
 * back to linear light using the provided converter function.
 * The alpha channel is left unchanged.
 *
 * @param data - RGBA Float32Array (modified in-place)
 * @param width - Image width
 * @param height - Image height
 * @param bitDepth - Bit depth of the original data (used to compute max code value)
 * @param logToLinearFn - Conversion function that maps a code value to linear light
 */
export function applyLogToLinearRGBA(
  data: Float32Array,
  width: number,
  height: number,
  bitDepth: number,
  logToLinearFn: (codeValue: number) => number,
): void {
  const totalPixels = width * height;
  const maxCodeValue = (1 << bitDepth) - 1;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    // Convert normalized [0,1] back to code value for log-to-linear
    for (let c = 0; c < 3; c++) {
      const normalized = data[idx + c]!;
      const codeValue = normalized * maxCodeValue;
      data[idx + c] = logToLinearFn(codeValue);
    }
    // Alpha stays as-is
  }
}
