/**
 * Adapter: wraps the existing `applyColorInversion` from `src/color/Inversion.ts`
 * as a unified ImageEffect.
 *
 * Expected params key:
 *   colorInversionEnabled: boolean
 */

import type { ImageEffect } from '../ImageEffect';
import { applyColorInversion } from '../../color/Inversion';

export const colorInversionEffect: ImageEffect = {
  name: 'colorInversion',
  label: 'Color Inversion',
  category: 'color',

  apply(imageData: ImageData, _params: Record<string, unknown>): void {
    applyColorInversion(imageData);
  },

  isActive(params: Record<string, unknown>): boolean {
    return params['colorInversionEnabled'] === true;
  },
};
