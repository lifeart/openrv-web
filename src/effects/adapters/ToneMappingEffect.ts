/**
 * Adapter: wraps `applyToneMapping` from `src/ui/components/ViewerEffects.ts`
 * as a unified ImageEffect.
 *
 * Expected params keys:
 *   toneMappingEnabled:  boolean
 *   toneMappingOperator: ToneMappingOperator ('off' | 'reinhard' | 'filmic' | 'aces')
 */

import type { ImageEffect } from '../ImageEffect';
import { applyToneMapping } from '../../ui/components/ViewerEffects';
import type { ToneMappingOperator } from '../../core/types/effects';

export const toneMappingEffect: ImageEffect = {
  name: 'toneMapping',
  label: 'Tone Mapping',
  category: 'tone',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    const operator = params['toneMappingOperator'] as ToneMappingOperator | undefined;
    if (operator && operator !== 'off') {
      applyToneMapping(imageData, operator);
    }
  },

  isActive(params: Record<string, unknown>): boolean {
    const enabled = params['toneMappingEnabled'] as boolean | undefined;
    const operator = params['toneMappingOperator'] as ToneMappingOperator | undefined;
    return enabled === true && operator !== undefined && operator !== 'off';
  },
};
