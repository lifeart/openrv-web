/**
 * Centralized image dimension limits used across format decoders.
 *
 * These constants prevent memory exhaustion when decoding images
 * with unreasonably large dimensions.
 */
export const IMAGE_LIMITS = {
  /** Maximum value for image width or height (65536 pixels) */
  MAX_DIMENSION: 65536,
  /** Maximum total pixel count (256 megapixels) */
  MAX_PIXELS: 268435456,
} as const;
