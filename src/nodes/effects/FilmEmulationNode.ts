import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import {
  applyFilmEmulation,
  isFilmEmulationActive,
  type FilmEmulationParams,
  type FilmStockId,
} from '../../filters/FilmEmulation';

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

  constructor(name?: string) {
    super('FilmEmulation', name);

    this.properties.add({ name: 'stock', defaultValue: 'kodak-portra-400' as string });
    this.properties.add({ name: 'intensity', defaultValue: 50, min: 0, max: 100, step: 1 });
    this.properties.add({ name: 'grainIntensity', defaultValue: 0, min: 0, max: 100, step: 1 });
    this.properties.add({ name: 'grainSeed', defaultValue: 0, min: 0, max: 99999, step: 1 });
    this.properties.add({ name: 'filmEnabled', defaultValue: false });
  }

  get stock(): string { return this.properties.getValue('stock') as string; }
  set stock(v: string) { this.properties.setValue('stock', v); }

  get intensity(): number { return this.properties.getValue('intensity') as number; }
  set intensity(v: number) { this.properties.setValue('intensity', v); }

  get grainIntensity(): number { return this.properties.getValue('grainIntensity') as number; }
  set grainIntensity(v: number) { this.properties.setValue('grainIntensity', v); }

  get grainSeed(): number { return this.properties.getValue('grainSeed') as number; }
  set grainSeed(v: number) { this.properties.setValue('grainSeed', v); }

  get filmEnabled(): boolean { return this.properties.getValue('filmEnabled') as boolean; }
  set filmEnabled(v: boolean) { this.properties.setValue('filmEnabled', v); }

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
