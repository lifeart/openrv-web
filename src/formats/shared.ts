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
 * Draw an image onto a canvas context with EXIF orientation transform applied.
 * Used to rotate gainmap images to match the display orientation of the base image.
 *
 * @param ctx - Canvas 2D context (sized to displayWidth × displayHeight)
 * @param image - Source image to draw
 * @param displayWidth - Base image display width (canvas width)
 * @param displayHeight - Base image display height (canvas height)
 * @param orientation - EXIF orientation value 1-8
 */
export function drawImageWithOrientation(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: CanvasImageSource,
  displayWidth: number,
  displayHeight: number,
  orientation: number,
): void {
  // For orientations 5-8, the source image is stored with swapped dimensions
  // relative to display, so drawImage uses (dH, dW) instead of (dW, dH)
  const dW = displayWidth;
  const dH = displayHeight;

  ctx.save();

  switch (orientation) {
    case 2: // Flip horizontal
      ctx.translate(dW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, dW, dH);
      break;
    case 3: // Rotate 180
      ctx.translate(dW, dH);
      ctx.rotate(Math.PI);
      ctx.drawImage(image, 0, 0, dW, dH);
      break;
    case 4: // Flip vertical
      ctx.translate(0, dH);
      ctx.scale(1, -1);
      ctx.drawImage(image, 0, 0, dW, dH);
      break;
    case 5: // Transpose (rotate 90 CW + flip H)
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
      ctx.drawImage(image, 0, 0, dH, dW);
      break;
    case 6: // Rotate 90 CW
      ctx.translate(dW, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, 0, 0, dH, dW);
      break;
    case 7: // Transverse (rotate 90 CW + flip V)
      ctx.translate(dW, dH);
      ctx.rotate(Math.PI / 2);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, dH, dW);
      break;
    case 8: // Rotate 90 CCW
      ctx.translate(0, dH);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(image, 0, 0, dH, dW);
      break;
    default: // 1 or invalid: no transform
      ctx.drawImage(image, 0, 0, dW, dH);
      break;
  }

  ctx.restore();
}

/**
 * Apply EXIF orientation to RGBA Float32Array pixel data.
 * Returns a new buffer with pixels rearranged to match display orientation.
 *
 * @param data - RGBA Float32Array (4 channels per pixel)
 * @param width - Stored image width
 * @param height - Stored image height
 * @param orientation - EXIF orientation value 1-8
 * @returns Transformed data with potentially swapped width/height
 */
export function applyOrientationRGBA(
  data: Float32Array,
  width: number,
  height: number,
  orientation: number,
): { data: Float32Array; width: number; height: number } {
  // No-op for orientation 1 or invalid values
  if (orientation <= 1 || orientation > 8) {
    return { data, width, height };
  }

  const W = width;
  const H = height;
  // Orientations 5-8 swap output dimensions
  const swapped = orientation >= 5;
  const outW = swapped ? H : W;
  const outH = swapped ? W : H;
  const result = new Float32Array(W * H * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const srcIdx = (y * W + x) * 4;
      let dx: number, dy: number;

      switch (orientation) {
        case 2: dx = W - 1 - x; dy = y; break;
        case 3: dx = W - 1 - x; dy = H - 1 - y; break;
        case 4: dx = x; dy = H - 1 - y; break;
        case 5: dx = y; dy = x; break;
        case 6: dx = H - 1 - y; dy = x; break;
        case 7: dx = H - 1 - y; dy = W - 1 - x; break;
        case 8: dx = y; dy = W - 1 - x; break;
        default: dx = x; dy = y; break;
      }

      const dstIdx = (dy * outW + dx) * 4;
      result[dstIdx] = data[srcIdx]!;
      result[dstIdx + 1] = data[srcIdx + 1]!;
      result[dstIdx + 2] = data[srcIdx + 2]!;
      result[dstIdx + 3] = data[srcIdx + 3]!;
    }
  }

  return { data: result, width: outW, height: outH };
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
