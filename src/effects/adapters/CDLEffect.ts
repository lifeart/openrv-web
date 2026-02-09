/**
 * Adapter: wraps `applyCDLToImageData` from `src/color/CDL.ts`
 * as a unified ImageEffect.
 *
 * Expected params key:
 *   cdlValues: CDLValues   (the slope/offset/power/saturation object)
 */

import type { ImageEffect } from '../ImageEffect';
import { applyCDLToImageData, isDefaultCDL } from '../../color/CDL';
import type { CDLValues } from '../../color/CDL';

export const cdlEffect: ImageEffect = {
  name: 'cdl',
  label: 'ASC CDL',
  category: 'color',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    const cdl = params['cdlValues'] as CDLValues | undefined;
    if (cdl) {
      applyCDLToImageData(imageData, cdl);
    }
  },

  isActive(params: Record<string, unknown>): boolean {
    const cdl = params['cdlValues'] as CDLValues | undefined;
    return cdl !== undefined && !isDefaultCDL(cdl);
  },
};
