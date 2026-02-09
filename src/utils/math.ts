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
