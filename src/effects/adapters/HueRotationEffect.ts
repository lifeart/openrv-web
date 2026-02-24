/**
 * Adapter: wraps `applyHueRotation` from `src/color/HueRotation.ts`
 * as a unified ImageEffect.
 *
 * Expected params key:
 *   hueRotation: number   (degrees, 0 = identity)
 */

import type { ImageEffect } from '../ImageEffect';
import { applyHueRotationInto, isIdentityHueRotation } from '../../color/HueRotation';

export const hueRotationEffect: ImageEffect = {
  name: 'hueRotation',
  label: 'Hue Rotation',
  category: 'color',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    const degrees = params['hueRotation'] as number | undefined;
    if (degrees === undefined) return;

    const data = imageData.data;
    const len = data.length;
    const hueOut: [number, number, number] = [0, 0, 0];

    for (let i = 0; i < len; i += 4) {
      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      applyHueRotationInto(r, g, b, degrees, hueOut);

      data[i] = Math.round(hueOut[0] * 255);
      data[i + 1] = Math.round(hueOut[1] * 255);
      data[i + 2] = Math.round(hueOut[2] * 255);
      // alpha unchanged
    }
  },

  isActive(params: Record<string, unknown>): boolean {
    const degrees = params['hueRotation'] as number | undefined;
    return degrees !== undefined && !isIdentityHueRotation(degrees);
  },
};
