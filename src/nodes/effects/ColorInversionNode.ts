import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { type IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyColorInversion } from '../../color/Inversion';
import { defineNodeProperty } from '../base/defineNodeProperty';

/**
 * Color inversion (negation) effect node.
 *
 * Inverts RGB channels: output = 255 - input.
 * Alpha is preserved unchanged.
 *
 * Delegates to `applyColorInversion` for the actual pixel processing.
 */
@RegisterNode('ColorInversion')
export class ColorInversionNode extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'Color Inversion';

  declare inverted: boolean;

  constructor(name?: string) {
    super('ColorInversion', name);

    defineNodeProperty(this, 'inverted', { defaultValue: false });
  }

  isIdentity(): boolean {
    return !this.inverted;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyColorInversion(imageData);
    clone.fromImageData(imageData);
    return clone;
  }
}
