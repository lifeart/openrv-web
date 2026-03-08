import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { type IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyClarity } from '../../ui/components/ViewerEffects';
import { defineNodeProperty } from '../base/defineNodeProperty';

/**
 * Clarity effect node.
 *
 * Applies mid-tone contrast enhancement using local contrast adjustment.
 * Positive values increase clarity (punch), negative values soften.
 *
 * Delegates to `applyClarity` for the actual pixel processing.
 */
@RegisterNode('Clarity')
export class ClarityNode extends EffectNode {
  readonly category: EffectCategory = 'spatial';
  readonly label = 'Clarity';

  declare clarity: number;

  constructor(name?: string) {
    super('Clarity', name);

    defineNodeProperty(this, 'clarity', { defaultValue: 0, min: -100, max: 100, step: 1 });
  }

  isIdentity(): boolean {
    return this.clarity === 0;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyClarity(imageData, this.clarity);
    clone.fromImageData(imageData);
    return clone;
  }
}
