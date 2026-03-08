import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { type IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyVibrance, type VibranceParams } from '../../ui/components/ViewerEffects';
import { defineNodeProperty } from '../base/defineNodeProperty';

/**
 * Vibrance effect node.
 *
 * Applies a non-linear saturation boost that targets less-saturated pixels
 * while optionally protecting skin tones from over-saturation.
 *
 * Delegates to `applyVibrance` for the actual pixel processing.
 */
@RegisterNode('Vibrance')
export class VibranceNode extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'Vibrance';

  declare vibrance: number;
  declare skinProtection: boolean;

  constructor(name?: string) {
    super('Vibrance', name);

    defineNodeProperty(this, 'vibrance', { defaultValue: 0, min: -100, max: 100, step: 1 });
    defineNodeProperty(this, 'skinProtection', { defaultValue: true });
  }

  getParams(): VibranceParams {
    return {
      vibrance: this.vibrance,
      skinProtection: this.skinProtection,
    };
  }

  isIdentity(): boolean {
    return this.vibrance === 0;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyVibrance(imageData, this.getParams());
    clone.fromImageData(imageData);
    return clone;
  }
}
