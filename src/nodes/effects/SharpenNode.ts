import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applySharpenCPU } from '../../ui/components/ViewerEffects';

/**
 * Sharpening effect node.
 *
 * Applies an unsharp-mask style sharpening to the image using a CPU
 * convolution kernel. The `amount` parameter controls how strongly
 * edges are enhanced.
 *
 * Delegates to `applySharpenCPU` for the actual pixel processing.
 */
@RegisterNode('Sharpen')
export class SharpenNode extends EffectNode {
  readonly category: EffectCategory = 'spatial';
  readonly label = 'Sharpen';

  constructor(name?: string) {
    super('Sharpen', name);

    this.properties.add({ name: 'amount', defaultValue: 0, min: 0, max: 100, step: 1 });
  }

  // -- Property accessors --

  get amount(): number { return this.properties.getValue('amount') as number; }
  set amount(v: number) { this.properties.setValue('amount', v); }

  isIdentity(): boolean {
    return this.amount <= 0;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applySharpenCPU(imageData, this.amount);
    clone.fromImageData(imageData);
    return clone;
  }
}
