import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyVibrance, type VibranceParams } from '../../ui/components/ViewerEffects';

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

  constructor(name?: string) {
    super('Vibrance', name);

    this.properties.add({ name: 'vibrance', defaultValue: 0, min: -100, max: 100, step: 1 });
    this.properties.add({ name: 'skinProtection', defaultValue: true });
  }

  get vibrance(): number { return this.properties.getValue('vibrance') as number; }
  set vibrance(v: number) { this.properties.setValue('vibrance', v); }

  get skinProtection(): boolean { return this.properties.getValue('skinProtection') as boolean; }
  set skinProtection(v: boolean) { this.properties.setValue('skinProtection', v); }

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
