/**
 * Adapter: wraps `applyFilmEmulation` from `src/filters/FilmEmulation.ts`
 * as a unified ImageEffect.
 *
 * Expected params keys:
 *   filmEmulationEnabled:    boolean          (default false)
 *   filmEmulationStock:      FilmStockId      (default 'kodak-portra-400')
 *   filmEmulationIntensity:  number 0-100     (default 100)
 *   filmEmulationGrain:      number 0-100     (default 30)
 *   filmEmulationSeed:       number           (default 0)
 */

import type { ImageEffect } from '../ImageEffect';
import { applyFilmEmulation, isFilmEmulationActive } from '../../filters/FilmEmulation';
import type { FilmStockId } from '../../filters/FilmEmulation';

export const filmEmulationEffect: ImageEffect = {
  name: 'filmEmulation',
  label: 'Film Emulation',
  category: 'color',

  apply(imageData: ImageData, params: Record<string, unknown>): void {
    applyFilmEmulation(imageData, {
      enabled: (params['filmEmulationEnabled'] as boolean) ?? false,
      stock: (params['filmEmulationStock'] as FilmStockId) ?? 'kodak-portra-400',
      intensity: (params['filmEmulationIntensity'] as number) ?? 100,
      grainIntensity: (params['filmEmulationGrain'] as number) ?? 30,
      grainSeed: (params['filmEmulationSeed'] as number) ?? 0,
    });
  },

  isActive(params: Record<string, unknown>): boolean {
    return isFilmEmulationActive({
      enabled: (params['filmEmulationEnabled'] as boolean) ?? false,
      stock: (params['filmEmulationStock'] as FilmStockId) ?? 'kodak-portra-400',
      intensity: (params['filmEmulationIntensity'] as number) ?? 100,
      grainIntensity: (params['filmEmulationGrain'] as number) ?? 30,
      grainSeed: (params['filmEmulationSeed'] as number) ?? 0,
    });
  },
};
