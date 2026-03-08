import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { type IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyHighlightsShadows, type HighlightsShadowsParams } from '../../ui/components/ViewerEffects';
import { defineNodeProperty } from '../base/defineNodeProperty';

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

  declare highlights: number;
  declare shadows: number;
  declare whites: number;
  declare blacks: number;

  constructor(name?: string) {
    super('HighlightsShadows', name);

    defineNodeProperty(this, 'highlights', { defaultValue: 0, min: -100, max: 100, step: 1 });
    defineNodeProperty(this, 'shadows', { defaultValue: 0, min: -100, max: 100, step: 1 });
    defineNodeProperty(this, 'whites', { defaultValue: 0, min: -100, max: 100, step: 1 });
    defineNodeProperty(this, 'blacks', { defaultValue: 0, min: -100, max: 100, step: 1 });
  }

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
    return this.highlights === 0 && this.shadows === 0 && this.whites === 0 && this.blacks === 0;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyHighlightsShadows(imageData, this.getParams());
    clone.fromImageData(imageData);
    return clone;
  }
}
