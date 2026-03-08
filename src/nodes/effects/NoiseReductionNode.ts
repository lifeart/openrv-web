import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import {
  applyNoiseReduction,
  isNoiseReductionActive,
  type NoiseReductionParams,
} from '../../filters/NoiseReduction';
import { defineNodeProperty } from '../base/defineNodeProperty';

/**
 * Edge-preserving noise reduction effect node.
 *
 * Uses a bilateral filter that weights by both spatial distance and pixel
 * value similarity, smoothing flat areas while preserving edges.
 *
 * Separates luminance and chroma filtering so colour noise can be reduced
 * more aggressively than luminance noise.
 *
 * Delegates to `applyNoiseReduction` for the actual pixel processing.
 */
@RegisterNode('NoiseReduction')
export class NoiseReductionNode extends EffectNode {
  readonly category: EffectCategory = 'spatial';
  readonly label = 'Noise Reduction';

  declare strength: number;
  declare luminanceStrength: number;
  declare chromaStrength: number;
  declare radius: number;

  constructor(name?: string) {
    super('NoiseReduction', name);

    defineNodeProperty(this, 'strength', { defaultValue: 0, min: 0, max: 100, step: 1 });
    defineNodeProperty(this, 'luminanceStrength', { defaultValue: 50, min: 0, max: 100, step: 1 });
    defineNodeProperty(this, 'chromaStrength', { defaultValue: 75, min: 0, max: 100, step: 1 });
    defineNodeProperty(this, 'radius', { defaultValue: 2, min: 1, max: 5, step: 1 });
  }

  /**
   * Build a NoiseReductionParams struct from the current property values.
   */
  getParams(): NoiseReductionParams {
    return {
      strength: this.strength,
      luminanceStrength: this.luminanceStrength,
      chromaStrength: this.chromaStrength,
      radius: this.radius,
    };
  }

  isIdentity(): boolean {
    return !isNoiseReductionActive(this.getParams());
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyNoiseReduction(imageData, this.getParams());
    clone.fromImageData(imageData);
    return clone;
  }
}
