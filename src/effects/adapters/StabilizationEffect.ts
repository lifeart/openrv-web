/**
 * Adapter: wraps `applyStabilization` from `src/filters/StabilizeMotion.ts`
 * as a unified ImageEffect.
 *
 * Expected params keys (flat primitives):
 *   stabilizationEnabled:   boolean  (default false)
 *   stabilizationDx:        number   (default 0) — horizontal correction in pixels
 *   stabilizationDy:        number   (default 0) — vertical correction in pixels
 *   stabilizationCropAmount: number  (default 0) — border crop in pixels
 */

import type { ImageEffect } from '../ImageEffect';
import { applyStabilization } from '../../filters/StabilizeMotion';

export const stabilizationEffect: ImageEffect = {
  name: 'stabilization',
  label: 'Stabilization',
  category: 'spatial',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    applyStabilization(imageData, {
      dx: (params['stabilizationDx'] as number) ?? 0,
      dy: (params['stabilizationDy'] as number) ?? 0,
      cropAmount: (params['stabilizationCropAmount'] as number) ?? 0,
    });
  },

  isActive(params: Record<string, unknown>): boolean {
    const enabled = (params['stabilizationEnabled'] as boolean) ?? false;
    if (!enabled) return false;
    const dx = (params['stabilizationDx'] as number) ?? 0;
    const dy = (params['stabilizationDy'] as number) ?? 0;
    const cropAmount = (params['stabilizationCropAmount'] as number) ?? 0;
    return dx !== 0 || dy !== 0 || cropAmount > 0;
  },
};
