/**
 * HDRPixelData - Compatibility wrapper for ImageData pixel access in HDR mode
 *
 * When the 2D canvas is in HDR mode with `pixelFormat: 'float16'`,
 * `getImageData` may return typed arrays other than `Uint8ClampedArray`
 * (e.g. Float32Array for float16/float32 canvases).
 *
 * This module provides a unified way to read pixel values as normalized
 * floats in [0, N] regardless of the underlying storage type.
 *
 * When `imageData.data` is `Uint8ClampedArray` (the current/default case),
 * the wrapper is a trivial passthrough with no overhead beyond a single
 * `instanceof` check.
 */

/**
 * Read a single channel value from ImageData as a normalized float.
 *
 * - Uint8ClampedArray: divides by 255 to return [0, 1]
 * - Float16/Float32: values are already in linear float range, returned as-is
 *
 * @param imageData - The ImageData object (from getImageData)
 * @param offset - The byte offset into the data array (e.g. y*width*4 + x*4 + channel)
 * @returns The normalized pixel value
 */
export function getPixelValue(imageData: ImageData, offset: number): number {
  const data = imageData.data;
  if (data instanceof Uint8ClampedArray) {
    return (data[offset] ?? 0) / 255;
  }
  // Float16/Float32 path -- values are already in [0, N] range
  return ((data as unknown as ArrayLike<number>)[offset] ?? 0) as number;
}

/**
 * Check whether the ImageData uses a float-based storage format (HDR mode).
 *
 * @param imageData - The ImageData object to inspect
 * @returns true if the data is NOT Uint8ClampedArray (i.e. float16/float32)
 */
export function isHDRImageData(imageData: ImageData): boolean {
  return !(imageData.data instanceof Uint8ClampedArray);
}

/**
 * Get the maximum representable value for a given ImageData.
 *
 * - Uint8ClampedArray: 1.0 (values are normalized to [0, 1])
 * - Float types: Infinity (values can exceed 1.0 in HDR content)
 *
 * This is useful for scope rendering to know whether values > 1.0 are possible.
 *
 * @param imageData - The ImageData object to inspect
 * @returns The maximum representable value (1.0 for SDR, Infinity for HDR)
 */
export function getMaxRepresentableValue(imageData: ImageData): number {
  if (imageData.data instanceof Uint8ClampedArray) {
    return 1.0;
  }
  return Infinity;
}
