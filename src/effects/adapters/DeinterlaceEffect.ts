/**
 * Adapter: wraps `applyDeinterlace` from `src/filters/Deinterlace.ts`
 * as a unified ImageEffect.
 *
 * Expected params keys:
 *   deinterlaceEnabled:    boolean  (default false)
 *   deinterlaceMethod:     'bob' | 'weave' | 'blend'  (default 'bob')
 *   deinterlaceFieldOrder: 'tff' | 'bff'  (default 'tff')
 */

import type { ImageEffect, EffectParams } from '../ImageEffect';
import { applyDeinterlace, isDeinterlaceActive } from '../../filters/Deinterlace';
import type { DeinterlaceMethod, FieldOrder } from '../../filters/Deinterlace';

export const deinterlaceEffect: ImageEffect = {
  name: 'deinterlace',
  label: 'Deinterlace',
  category: 'spatial',

  apply(imageData: ImageData, params: EffectParams): void {
    applyDeinterlace(imageData, {
      enabled: (params['deinterlaceEnabled'] as boolean) ?? false,
      method: (params['deinterlaceMethod'] as DeinterlaceMethod) ?? 'bob',
      fieldOrder: (params['deinterlaceFieldOrder'] as FieldOrder) ?? 'tff',
    });
  },

  isActive(params: EffectParams): boolean {
    return isDeinterlaceActive({
      enabled: (params['deinterlaceEnabled'] as boolean) ?? false,
      method: (params['deinterlaceMethod'] as DeinterlaceMethod) ?? 'bob',
      fieldOrder: (params['deinterlaceFieldOrder'] as FieldOrder) ?? 'tff',
    });
  },
};
