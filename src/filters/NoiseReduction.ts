/**
 * NoiseReduction - Bilateral filter for edge-preserving noise reduction
 *
 * Uses spatial distance AND pixel value difference for weighting,
 * preserving edges while smoothing flat areas.
 */

import { clamp } from '../utils/math';
import { luminanceRec709 } from '../color/PixelMath';

export interface NoiseReductionParams {
  strength: number;           // 0-100 (overall strength)
  luminanceStrength: number;  // 0-100 (defaults to strength)
  chromaStrength: number;     // 0-100 (defaults to strength * 1.5) - Reserved for future YCbCr chroma-separated filtering
  radius: number;             // 1-5 (kernel size = radius * 2 + 1)
}

export const DEFAULT_NOISE_REDUCTION_PARAMS: NoiseReductionParams = {
  strength: 0,
  luminanceStrength: 50,
  chromaStrength: 75,
  radius: 2,
};

/**
 * Calculate luminance from RGB using Rec.709 coefficients
 */
function luminance(r: number, g: number, b: number): number {
  return luminanceRec709(r, g, b);
}

/**
 * Apply bilateral filter for edge-preserving noise reduction.
 * This is a CPU implementation for use when WebGL is not available.
 *
 * Note: Currently applies uniform filtering based on luminance.
 * The chromaStrength parameter is reserved for future implementation
 * of YCbCr color space separation where luma and chroma can be
 * filtered independently for better color preservation.
 */
export function applyNoiseReduction(
  imageData: ImageData,
  params: NoiseReductionParams
): void {
  const { data, width, height } = imageData;
  const { strength, luminanceStrength, radius } = params;
  // Note: chromaStrength is intentionally unused - reserved for future YCbCr filtering

  // Skip if no strength
  if (strength === 0) return;

  // Create copy for reading (we write to original)
  const original = new Uint8ClampedArray(data);

  // Calculate sigma values
  // Higher strength = lower sigma = more smoothing
  const spatialSigma = radius / 2;
  const rangeSigmaLuma = (100 - luminanceStrength) * 0.5 + 5; // 5-55 range

  // Precompute spatial weights (Gaussian based on distance)
  const kernelSize = radius * 2 + 1;
  const spatialWeights = new Float32Array(kernelSize * kernelSize);
  const spatialSigmaSq2 = 2 * spatialSigma * spatialSigma;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (dy + radius) * kernelSize + (dx + radius);
      spatialWeights[idx] = Math.exp(-(dist * dist) / spatialSigmaSq2);
    }
  }

  const rangeSigmaSq2 = 2 * rangeSigmaLuma * rangeSigmaLuma;

  // Process each pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIdx = (y * width + x) * 4;
      const centerR = original[centerIdx]!;
      const centerG = original[centerIdx + 1]!;
      const centerB = original[centerIdx + 2]!;

      // Calculate center luminance for range weighting
      const centerLuma = luminance(centerR, centerG, centerB);

      let sumR = 0,
        sumG = 0,
        sumB = 0,
        sumWeight = 0;

      // Apply bilateral filter kernel
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          // Clamp to image bounds
          const nx = clamp(x + dx, 0, width - 1);
          const ny = clamp(y + dy, 0, height - 1);
          const neighborIdx = (ny * width + nx) * 4;

          const nR = original[neighborIdx]!;
          const nG = original[neighborIdx + 1]!;
          const nB = original[neighborIdx + 2]!;

          // Luminance difference for range weight
          const nLuma = luminance(nR, nG, nB);
          const lumaDiff = Math.abs(centerLuma - nLuma);

          // Spatial weight (precomputed Gaussian)
          const spatialIdx = (dy + radius) * kernelSize + (dx + radius);
          const spatialW = spatialWeights[spatialIdx]!;

          // Range weight (Gaussian based on luminance difference)
          // This preserves edges by giving low weight to pixels with different luminance
          const rangeW = Math.exp(-(lumaDiff * lumaDiff) / rangeSigmaSq2);

          // Combined bilateral weight
          const weight = spatialW * rangeW;

          sumR += nR * weight;
          sumG += nG * weight;
          sumB += nB * weight;
          sumWeight += weight;
        }
      }

      // Normalize and write result
      // Blend between original and filtered based on overall strength
      const blendFactor = strength / 100;
      const filteredR = sumR / sumWeight;
      const filteredG = sumG / sumWeight;
      const filteredB = sumB / sumWeight;

      data[centerIdx] = Math.round(centerR * (1 - blendFactor) + filteredR * blendFactor);
      data[centerIdx + 1] = Math.round(centerG * (1 - blendFactor) + filteredG * blendFactor);
      data[centerIdx + 2] = Math.round(centerB * (1 - blendFactor) + filteredB * blendFactor);
      // Alpha unchanged
    }
  }
}

/**
 * Check if noise reduction is effectively enabled
 */
export function isNoiseReductionActive(params: NoiseReductionParams): boolean {
  return params.strength > 0;
}

/**
 * Create noise reduction params with strength, using defaults for other values
 */
export function createNoiseReductionParams(strength: number): NoiseReductionParams {
  return {
    ...DEFAULT_NOISE_REDUCTION_PARAMS,
    strength: clamp(strength, 0, 100),
    luminanceStrength: clamp(strength, 0, 100),
    chromaStrength: clamp(Math.min(100, strength * 1.5), 0, 100),
  };
}
