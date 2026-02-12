/**
 * Viewer Effects Module
 * Contains pixel-level image processing utilities for highlights/shadows,
 * vibrance, clarity, and sharpening effects.
 */

import { clamp } from '../../utils/math';
import { luminanceRec709 } from '../../color/ColorProcessingFacade';

export interface HighlightsShadowsParams {
  highlights: number; // -100 to +100
  shadows: number; // -100 to +100
  whites: number; // -100 to +100
  blacks: number; // -100 to +100
}

export interface VibranceParams {
  vibrance: number; // -100 to +100
  skinProtection: boolean;
}

/**
 * Smoothstep function for soft transitions
 * Returns 0 when x <= edge0, 1 when x >= edge1, smooth interpolation between
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Helper function to convert hue to RGB component
 */
function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * Apply highlight/shadow recovery and whites/blacks clipping to ImageData.
 * Uses luminance-based masking with soft knee compression.
 *
 * Highlights: Negative values compress/recover highlights, positive values boost
 * Shadows: Negative values crush shadows, positive values lift/recover
 * Whites: Positive values lower the white clipping point, negative extends it
 * Blacks: Positive values raise the black clipping point, negative extends it
 */
export function applyHighlightsShadows(imageData: ImageData, params: HighlightsShadowsParams): void {
  const data = imageData.data;
  const highlights = params.highlights / 100; // -1 to +1
  const shadows = params.shadows / 100; // -1 to +1
  const whites = params.whites / 100; // -1 to +1
  const blacks = params.blacks / 100; // -1 to +1

  // Pre-compute LUT for performance (256 entries for each channel)
  // This avoids per-pixel math for the soft knee functions
  const highlightLUT = new Float32Array(256);
  const shadowLUT = new Float32Array(256);

  for (let i = 0; i < 256; i++) {
    const normalized = i / 255;

    // Highlight mask: smooth transition starting around 0.5, full effect at 1.0
    // Using smoothstep-like curve for natural falloff
    const highlightMask = smoothstep(0.5, 1.0, normalized);

    // Shadow mask: smooth transition starting around 0.5, full effect at 0.0
    const shadowMask = 1.0 - smoothstep(0.0, 0.5, normalized);

    // Store the adjustment multipliers
    highlightLUT[i] = highlightMask;
    shadowLUT[i] = shadowMask;
  }

  // Calculate white and black clipping points
  // Whites: at 0, white point is 255; at +100, it clips at ~200; at -100, it extends beyond
  // Blacks: at 0, black point is 0; at +100, it lifts to ~55; at -100, it extends beyond
  const whitePoint = 255 - whites * 55; // Range: 200-310 (255 at default)
  const blackPoint = blacks * 55; // Range: -55 to 55 (0 at default)

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;

    // Apply whites/blacks clipping first (affects the entire range)
    if (whites !== 0 || blacks !== 0) {
      // Remap values from [blackPoint, whitePoint] to [0, 255]
      const range = whitePoint - blackPoint;
      if (range > 0) {
        r = clamp(((r - blackPoint) / range) * 255, 0, 255);
        g = clamp(((g - blackPoint) / range) * 255, 0, 255);
        b = clamp(((b - blackPoint) / range) * 255, 0, 255);
      }
    }

    // Calculate luminance (Rec. 709) after whites/blacks adjustment
    const lum = luminanceRec709(r, g, b);
    const lumIndex = clamp(Math.round(lum), 0, 255);

    // Get masks from LUTs
    const highlightMask = highlightLUT[lumIndex]!;
    const shadowMask = shadowLUT[lumIndex]!;

    // Apply highlights/shadows adjustments
    if (highlights !== 0) {
      // For highlights recovery (negative): compress towards midtones
      // For highlights boost (positive): push brighter
      const highlightAdjust = highlights * highlightMask * 128;
      r = clamp(r - highlightAdjust, 0, 255);
      g = clamp(g - highlightAdjust, 0, 255);
      b = clamp(b - highlightAdjust, 0, 255);
    }

    if (shadows !== 0) {
      // For shadow recovery (positive): lift shadows
      // For shadow crush (negative): push darker
      const shadowAdjust = shadows * shadowMask * 128;
      r = clamp(r + shadowAdjust, 0, 255);
      g = clamp(g + shadowAdjust, 0, 255);
      b = clamp(b + shadowAdjust, 0, 255);
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    // Alpha unchanged
  }
}

/**
 * Apply vibrance effect to ImageData.
 * Vibrance is intelligent saturation that:
 * - Boosts less-saturated colors more than already-saturated ones
 * - Protects skin tones (hue range ~20-50 degrees in orange-yellow)
 * - Prevents clipping of already-saturated colors
 *
 * Formula: sat_factor = 1.0 - (current_saturation * 0.5)
 *          new_saturation = current_saturation + (vibrance * sat_factor)
 */
export function applyVibrance(imageData: ImageData, params: VibranceParams): void {
  const data = imageData.data;
  const vibrance = params.vibrance / 100; // -1 to +1
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;

    // Calculate max, min for HSL conversion
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    // Calculate saturation (HSL)
    const l = (max + min) / 2;
    let s = 0;
    if (delta !== 0) {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    }

    // Calculate hue for skin tone detection
    let h = 0;
    if (delta !== 0) {
      if (max === r) {
        h = ((g - b) / delta) % 6;
      } else if (max === g) {
        h = (b - r) / delta + 2;
      } else {
        h = (r - g) / delta + 4;
      }
      h = h * 60;
      if (h < 0) h += 360;
    }

    // Skin tone protection: reduce effect for hue range 20-50 degrees (orange-yellow skin tones)
    // Also check for low saturation which is typical of skin
    // Only apply if skinProtection is enabled
    let skinProtection = 1.0;
    if (params.skinProtection && h >= 20 && h <= 50 && s < 0.6 && l > 0.2 && l < 0.8) {
      // Gradual protection based on how "skin-like" the color is
      const hueCenter = 35; // Center of skin tone range (20-50)
      const hueDistance = Math.abs(h - hueCenter) / 15; // Normalize to 0-1 (max distance from center is 15)
      skinProtection = 0.3 + hueDistance * 0.7; // 30% effect at center, up to 100% at edges
    }

    // Calculate vibrance adjustment factor
    // Less saturated colors get more boost
    const satFactor = 1.0 - s * 0.5;
    const adjustment = vibrance * satFactor * skinProtection;

    // Calculate new saturation
    let newS = s + adjustment;
    newS = clamp(newS, 0, 1);

    // If saturation didn't change, skip conversion back
    if (Math.abs(newS - s) < 0.001) continue;

    // Convert back to RGB (HSL to RGB)
    let newR: number, newG: number, newB: number;

    if (newS === 0) {
      newR = newG = newB = l;
    } else {
      const q = l < 0.5 ? l * (1 + newS) : l + newS - l * newS;
      const p = 2 * l - q;
      const hNorm = h / 360;

      newR = hueToRgb(p, q, hNorm + 1 / 3);
      newG = hueToRgb(p, q, hNorm);
      newB = hueToRgb(p, q, hNorm - 1 / 3);
    }

    data[i] = Math.round(newR * 255);
    data[i + 1] = Math.round(newG * 255);
    data[i + 2] = Math.round(newB * 255);
    // Alpha unchanged
  }
}

/**
 * Apply 5x5 Gaussian blur to image data.
 * Uses separable convolution (horizontal + vertical) for O(n*k) instead of O(n*k^2).
 * Kernel: [1, 4, 6, 4, 1] / 16 (approximation of Gaussian)
 */
function applyGaussianBlur5x5(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  const temp = new Uint8ClampedArray(data.length);

  // Gaussian kernel: [1, 4, 6, 4, 1] / 16
  const kernel = [1, 4, 6, 4, 1];

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let weightSum = 0;

        for (let k = -2; k <= 2; k++) {
          const nx = clamp(x + k, 0, width - 1);
          const nidx = (y * width + nx) * 4 + c;
          const weight = kernel[k + 2]!;
          sum += data[nidx]! * weight;
          weightSum += weight;
        }

        temp[idx + c] = sum / weightSum;
      }
      temp[idx + 3] = data[idx + 3]!; // Copy alpha
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let weightSum = 0;

        for (let k = -2; k <= 2; k++) {
          const ny = clamp(y + k, 0, height - 1);
          const nidx = (ny * width + x) * 4 + c;
          const weight = kernel[k + 2]!;
          sum += temp[nidx]! * weight;
          weightSum += weight;
        }

        result[idx + c] = sum / weightSum;
      }
      result[idx + 3] = temp[idx + 3]!; // Copy alpha
    }
  }

  return result;
}

/**
 * Apply clarity (local contrast) effect to ImageData.
 * Clarity enhances midtone contrast using a high-pass filter approach:
 * 1. Apply Gaussian blur to create low-frequency layer
 * 2. Subtract low-frequency from original = high-frequency detail
 * 3. Create midtone mask from luminance (full effect in midtones, fades at extremes)
 * 4. Add masked high-frequency back scaled by clarity amount
 *
 * Positive clarity adds punch and definition to midtones.
 * Negative clarity softens/smooths midtone detail.
 */
export function applyClarity(imageData: ImageData, clarity: number): void {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const clarityNorm = clarity / 100; // -1 to +1
  const len = data.length;

  // Create a copy for the blur operation
  const original = new Uint8ClampedArray(data);

  // Apply 5x5 Gaussian blur to create low-frequency layer
  // Using separable filter for performance (horizontal then vertical pass)
  const blurred = applyGaussianBlur5x5(original, width, height);

  // Pre-compute midtone mask LUT
  // Full effect (1.0) at midtones (128), fading to 0 at extremes
  const midtoneMask = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    // Bell curve centered at 128, with wider range for natural look
    const normalized = i / 255;
    // Use smooth bell curve: 1 at center, 0 at edges
    // f(x) = 1 - (2x - 1)^2 gives a parabola from 0 to 1 to 0
    const deviation = Math.abs(normalized - 0.5) * 2; // 0 at center, 1 at edges
    midtoneMask[i] = 1.0 - deviation * deviation; // Quadratic falloff
  }

  // Scale factor for the effect (reduced to avoid harsh artifacts)
  const effectScale = clarityNorm * 0.7;

  for (let i = 0; i < len; i += 4) {
    const r = original[i]!;
    const g = original[i + 1]!;
    const b = original[i + 2]!;

    const blurredR = blurred[i]!;
    const blurredG = blurred[i + 1]!;
    const blurredB = blurred[i + 2]!;

    // Calculate luminance for midtone mask (Rec. 709)
    const lum = luminanceRec709(r, g, b);
    const lumIndex = clamp(Math.round(lum), 0, 255);
    const mask = midtoneMask[lumIndex]!;

    // Calculate high-frequency detail (original - blurred)
    const highR = r - blurredR;
    const highG = g - blurredG;
    const highB = b - blurredB;

    // Add masked high-frequency detail back, scaled by clarity
    // Positive clarity: add detail; Negative clarity: subtract detail (softens)
    const adjustedMask = mask * effectScale;
    data[i] = clamp(r + highR * adjustedMask, 0, 255);
    data[i + 1] = clamp(g + highG * adjustedMask, 0, 255);
    data[i + 2] = clamp(b + highB * adjustedMask, 0, 255);
    // Alpha unchanged
  }
}

/**
 * Tone Mapping Operators
 *
 * These functions map HDR (High Dynamic Range) values to SDR (Standard Dynamic Range)
 * for display on standard monitors. They compress the wide luminance range of HDR content
 * while preserving perceptual detail and contrast.
 */

import { ToneMappingOperator } from './ToneMappingControl';
import { applyToneMappingToRGB } from '../../utils/effects/effectProcessing.shared';

/**
 * Apply tone mapping to ImageData in-place.
 * Converts HDR pixel values to displayable SDR range using the selected operator.
 *
 * The process:
 * 1. Convert 8-bit [0-255] to normalized [0-1]
 * 2. Apply tone mapping curve to compress high values
 * 3. Convert back to 8-bit [0-255]
 *
 * Note: For true HDR content (EXR/float), values may exceed 1.0.
 * For 8-bit content, this still provides pleasing compression of bright areas.
 */
export function applyToneMapping(imageData: ImageData, operator: ToneMappingOperator): void {
  if (operator === 'off') return;

  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    // Convert to normalized [0-1] range (assuming 8-bit input)
    // For true HDR, this would handle float values directly
    let r = data[i]! / 255;
    let g = data[i + 1]! / 255;
    let b = data[i + 2]! / 255;

    // Apply tone mapping (cross-channel for agx, pbrNeutral, acesHill)
    const tm = applyToneMappingToRGB(r, g, b, operator);
    r = tm.r; g = tm.g; b = tm.b;

    // Convert back to 8-bit with safe clamping
    // Handle NaN that could have slipped through by treating it as 0
    data[i] = clamp(Math.round(Number.isFinite(r) ? r * 255 : 0), 0, 255);
    data[i + 1] = clamp(Math.round(Number.isFinite(g) ? g * 255 : 0), 0, 255);
    data[i + 2] = clamp(Math.round(Number.isFinite(b) ? b * 255 : 0), 0, 255);
    // Alpha unchanged
  }
}

/**
 * Apply tone mapping for HDR float data (values can exceed 1.0)
 * This is used for true HDR content like EXR files.
 */
export function applyToneMappingHDR(
  imageData: ImageData,
  operator: ToneMappingOperator,
  hdrData: Float32Array,
  channels: number
): void {
  if (operator === 'off') return;

  const data = imageData.data;
  const pixelCount = imageData.width * imageData.height;

  for (let i = 0; i < pixelCount; i++) {
    const hdrIndex = i * channels;
    const dataIndex = i * 4;

    // Get HDR values (may exceed 1.0)
    let r = channels >= 1 ? hdrData[hdrIndex]! : 0;
    let g = channels >= 2 ? hdrData[hdrIndex + 1]! : r;
    let b = channels >= 3 ? hdrData[hdrIndex + 2]! : r;

    // Apply tone mapping to compress HDR to SDR range (cross-channel for agx, pbrNeutral, acesHill)
    const tm = applyToneMappingToRGB(r, g, b, operator);
    r = tm.r; g = tm.g; b = tm.b;

    // Convert to 8-bit
    data[dataIndex] = clamp(Math.round(Number.isFinite(r) ? r * 255 : 0), 0, 255);
    data[dataIndex + 1] = clamp(Math.round(Number.isFinite(g) ? g * 255 : 0), 0, 255);
    data[dataIndex + 2] = clamp(Math.round(Number.isFinite(b) ? b * 255 : 0), 0, 255);
    // Alpha unchanged
  }
}

/**
 * CPU-based sharpen filter (fallback when GPU is unavailable)
 */
export function applySharpenCPU(
  imageData: ImageData,
  amount: number
): void {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // Create a copy for reading original values
  const original = new Uint8ClampedArray(data);

  // Sharpen kernel (3x3 unsharp mask approximation)
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      for (let c = 0; c < 3; c++) {
        // RGB channels only
        let sum = 0;
        let ki = 0;

        // Apply 3x3 kernel
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pidx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += original[pidx]! * kernel[ki]!;
            ki++;
          }
        }

        // Blend between original and sharpened based on amount
        const originalValue = original[idx + c]!;
        const sharpenedValue = clamp(sum, 0, 255);
        data[idx + c] = Math.round(originalValue + (sharpenedValue - originalValue) * amount);
      }
    }
  }
}
