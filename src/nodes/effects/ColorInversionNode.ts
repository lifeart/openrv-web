import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyColorInversion } from '../../color/Inversion';

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

  constructor(name?: string) {
    super('ColorInversion', name);

    this.properties.add({ name: 'inverted', defaultValue: false });
  }

  get inverted(): boolean { return this.properties.getValue('inverted') as boolean; }
  set inverted(v: boolean) { this.properties.setValue('inverted', v); }

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
