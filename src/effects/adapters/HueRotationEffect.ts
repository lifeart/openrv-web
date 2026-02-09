/**
 * Adapter: wraps `applyHueRotation` from `src/color/HueRotation.ts`
 * as a unified ImageEffect.
 *
 * Expected params key:
 *   hueRotation: number   (degrees, 0 = identity)
 */

import type { ImageEffect } from '../ImageEffect';
import { applyHueRotation, isIdentityHueRotation } from '../../color/HueRotation';

export const hueRotationEffect: ImageEffect = {
  name: 'hueRotation',
  label: 'Hue Rotation',
  category: 'color',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    const degrees = params['hueRotation'] as number | undefined;
    if (degrees === undefined) return;

    const data = imageData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      const [nr, ng, nb] = applyHueRotation(r, g, b, degrees);

      data[i] = Math.round(nr * 255);
      data[i + 1] = Math.round(ng * 255);
      data[i + 2] = Math.round(nb * 255);
      // alpha unchanged
    }
  },

  isActive(params: Record<string, unknown>): boolean {
    const degrees = params['hueRotation'] as number | undefined;
    return degrees !== undefined && !isIdentityHueRotation(degrees);
  },
};
