import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import {
  applyHighlightsShadows,
  type HighlightsShadowsParams,
} from '../../ui/components/ViewerEffects';

/**
 * Highlights and shadows recovery effect node.
 *
 * Adjusts four tonal ranges independently:
 * - **highlights**: brightest values (pull back blown-out areas)
 * - **shadows**: darkest values (lift crushed blacks)
 * - **whites**: white clipping point
 * - **blacks**: black clipping point
 *
 * Each parameter ranges from -100 to +100; zero means no change.
 *
 * Delegates to `applyHighlightsShadows` for the actual pixel processing.
 */
@RegisterNode('HighlightsShadows')
export class HighlightsShadowsNode extends EffectNode {
  readonly category: EffectCategory = 'tone';
  readonly label = 'Highlights/Shadows';

  constructor(name?: string) {
    super('HighlightsShadows', name);

    this.properties.add({ name: 'highlights', defaultValue: 0, min: -100, max: 100, step: 1 });
    this.properties.add({ name: 'shadows', defaultValue: 0, min: -100, max: 100, step: 1 });
    this.properties.add({ name: 'whites', defaultValue: 0, min: -100, max: 100, step: 1 });
    this.properties.add({ name: 'blacks', defaultValue: 0, min: -100, max: 100, step: 1 });
  }

  // -- Property accessors --

  get highlights(): number { return this.properties.getValue('highlights') as number; }
  set highlights(v: number) { this.properties.setValue('highlights', v); }

  get shadows(): number { return this.properties.getValue('shadows') as number; }
  set shadows(v: number) { this.properties.setValue('shadows', v); }

  get whites(): number { return this.properties.getValue('whites') as number; }
  set whites(v: number) { this.properties.setValue('whites', v); }

  get blacks(): number { return this.properties.getValue('blacks') as number; }
  set blacks(v: number) { this.properties.setValue('blacks', v); }

  /**
   * Build a HighlightsShadowsParams struct from the current property values.
   */
  getParams(): HighlightsShadowsParams {
    return {
      highlights: this.highlights,
      shadows: this.shadows,
      whites: this.whites,
      blacks: this.blacks,
    };
  }

  isIdentity(): boolean {
    return (
      this.highlights === 0 &&
      this.shadows === 0 &&
      this.whites === 0 &&
      this.blacks === 0
    );
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyHighlightsShadows(imageData, this.getParams());
    clone.fromImageData(imageData);
    return clone;
  }
}
