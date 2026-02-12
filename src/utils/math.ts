/**
 * Shared math utility functions.
 *
 * These are pure functions with zero external dependencies, safe for use
 * in both main-thread and Web Worker contexts.
 */

/**
 * Clamp a numeric value to the inclusive range [min, max].
 *
 * Replaces the common pattern `Math.max(min, Math.min(max, value))`.
 *
 * @param value - The value to clamp
 * @param min   - Lower bound (inclusive)
 * @param max   - Upper bound (inclusive)
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert RGBA Float32Array (values in [0,1] for SDR, possibly >1.0 for HDR)
 * to a Uint8ClampedArray suitable for ImageData construction.
 *
 * Values are clamped to [0, 255] after scaling by 255.
 */
export function floatRGBAToUint8(floatData: Float32Array, length: number): Uint8ClampedArray {
  const clamped = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i++) {
    clamped[i] = Math.max(0, Math.min(255, Math.round(floatData[i]! * 255)));
  }
  return clamped;
}

/**
 * Convert RGBA Float32Array to an ImageData for CPU scope rendering.
 */
export function floatRGBAToImageData(floatData: Float32Array, width: number, height: number): ImageData {
  const clamped = floatRGBAToUint8(floatData, width * height * 4);
  return new ImageData(clamped as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
}
