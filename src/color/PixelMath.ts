/**
 * Shared pixel math utilities.
 *
 * Centralizes commonly duplicated pixel-level calculations such as
 * Rec. 709 luminance. All functions are pure and dependency-free,
 * safe for use in both main-thread and Web Worker contexts.
 */

import { LUMA_R, LUMA_G, LUMA_B } from '../config/RenderConfig';

/**
 * Rec. 709 luminance coefficients.
 * Re-exported from the centralized config for backward compatibility.
 */
export const LUMA_R_709 = LUMA_R;
export const LUMA_G_709 = LUMA_G;
export const LUMA_B_709 = LUMA_B;

/**
 * Compute Rec. 709 luminance from linear R, G, B values.
 *
 * Formula: Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
 *
 * @param r - Red channel value (any scale)
 * @param g - Green channel value (same scale as r)
 * @param b - Blue channel value (same scale as r)
 * @returns Luminance in the same scale as the inputs
 */
export function luminanceRec709(r: number, g: number, b: number): number {
  return LUMA_R_709 * r + LUMA_G_709 * g + LUMA_B_709 * b;
}
