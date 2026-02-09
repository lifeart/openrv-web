/**
 * Adapter: wraps `applyHighlightsShadows` from `src/ui/components/ViewerEffects.ts`
 * as a unified ImageEffect.
 *
 * Expected params keys:
 *   highlights: number  (-100 to +100, default 0)
 *   shadows:    number  (-100 to +100, default 0)
 *   whites:     number  (-100 to +100, default 0)
 *   blacks:     number  (-100 to +100, default 0)
 */

import type { ImageEffect } from '../ImageEffect';
import { applyHighlightsShadows } from '../../ui/components/ViewerEffects';
import type { HighlightsShadowsParams } from '../../ui/components/ViewerEffects';

export const highlightsShadowsEffect: ImageEffect = {
  name: 'highlightsShadows',
  label: 'Highlights / Shadows',
  category: 'tone',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    const hsParams: HighlightsShadowsParams = {
      highlights: (params['highlights'] as number) ?? 0,
      shadows: (params['shadows'] as number) ?? 0,
      whites: (params['whites'] as number) ?? 0,
      blacks: (params['blacks'] as number) ?? 0,
    };
    applyHighlightsShadows(imageData, hsParams);
  },

  isActive(params: Record<string, unknown>): boolean {
    const h = (params['highlights'] as number) ?? 0;
    const s = (params['shadows'] as number) ?? 0;
    const w = (params['whites'] as number) ?? 0;
    const b = (params['blacks'] as number) ?? 0;
    return h !== 0 || s !== 0 || w !== 0 || b !== 0;
  },
};
