import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { type IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import {
  applyFilmEmulation,
  isFilmEmulationActive,
  type FilmEmulationParams,
  type FilmStockId,
} from '../../filters/FilmEmulation';
import { defineNodeProperty } from '../base/defineNodeProperty';

/**
 * Film emulation effect node.
 *
 * Applies a film stock look with per-channel tone curves, saturation
 * adjustment, and optional film grain overlay.
 *
 * Delegates to `applyFilmEmulation` for the actual pixel processing.
 */
@RegisterNode('FilmEmulation')
export class FilmEmulationNode extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'Film Emulation';

  declare stock: string;
  declare intensity: number;
  declare grainIntensity: number;
  declare grainSeed: number;
  declare filmEnabled: boolean;

  constructor(name?: string) {
    super('FilmEmulation', name);

    defineNodeProperty(this, 'stock', { defaultValue: 'kodak-portra-400' as string });
    defineNodeProperty(this, 'intensity', { defaultValue: 50, min: 0, max: 100, step: 1 });
    defineNodeProperty(this, 'grainIntensity', { defaultValue: 0, min: 0, max: 100, step: 1 });
    defineNodeProperty(this, 'grainSeed', { defaultValue: 0, min: 0, max: 99999, step: 1 });
    defineNodeProperty(this, 'filmEnabled', { defaultValue: false });
  }

  getParams(): FilmEmulationParams {
    return {
      enabled: this.filmEnabled,
      stock: this.stock as FilmStockId,
      intensity: this.intensity,
      grainIntensity: this.grainIntensity,
      grainSeed: this.grainSeed,
    };
  }

  isIdentity(): boolean {
    return !isFilmEmulationActive(this.getParams());
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyFilmEmulation(imageData, this.getParams());
    clone.fromImageData(imageData);
    return clone;
  }
}
