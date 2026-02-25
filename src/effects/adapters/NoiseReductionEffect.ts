/**
 * Adapter: wraps `applyNoiseReduction` from `src/filters/NoiseReduction.ts`
 * as a unified ImageEffect.
 *
 * Expected params keys:
 *   noiseReductionStrength:           number (0-100, default 0)
 *   noiseReductionLuminanceStrength:  number (0-100, default 50)
 *   noiseReductionChromaStrength:     number (0-100, default 75)
 *   noiseReductionRadius:             number (1-5, default 2)
 */

import type { ImageEffect } from '../ImageEffect';
import { applyNoiseReduction, isNoiseReductionActive } from '../../filters/NoiseReduction';
import type { NoiseReductionParams } from '../../filters/NoiseReduction';

function extractParams(params: Record<string, unknown>): NoiseReductionParams {
  return {
    strength: (params['noiseReductionStrength'] as number) ?? 0,
    luminanceStrength: (params['noiseReductionLuminanceStrength'] as number) ?? 50,
    chromaStrength: (params['noiseReductionChromaStrength'] as number) ?? 75,
    radius: (params['noiseReductionRadius'] as number) ?? 2,
  };
}

export const noiseReductionEffect: ImageEffect = {
  name: 'noiseReduction',
  label: 'Noise Reduction',
  category: 'spatial',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    applyNoiseReduction(imageData, extractParams(params));
  },

  isActive(params: Record<string, unknown>): boolean {
    return isNoiseReductionActive(extractParams(params));
  },
};
