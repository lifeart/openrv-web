import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import {
  applyDeinterlace,
  isDeinterlaceActive,
  type DeinterlaceParams,
  type DeinterlaceMethod,
  type FieldOrder,
} from '../../filters/Deinterlace';

/**
 * Deinterlace effect node.
 *
 * Removes interlacing artifacts from field-based video content.
 * Supports bob, weave, and blend methods with configurable field order.
 *
 * Delegates to `applyDeinterlace` for the actual pixel processing.
 */
@RegisterNode('Deinterlace')
export class DeinterlaceNode extends EffectNode {
  readonly category: EffectCategory = 'spatial';
  readonly label = 'Deinterlace';

  constructor(name?: string) {
    super('Deinterlace', name);

    this.properties.add({ name: 'method', defaultValue: 'bob' as string });
    this.properties.add({ name: 'fieldOrder', defaultValue: 'tff' as string });
    this.properties.add({ name: 'deinterlaceEnabled', defaultValue: false });
  }

  get method(): string { return this.properties.getValue('method') as string; }
  set method(v: string) { this.properties.setValue('method', v); }

  get fieldOrder(): string { return this.properties.getValue('fieldOrder') as string; }
  set fieldOrder(v: string) { this.properties.setValue('fieldOrder', v); }

  get deinterlaceEnabled(): boolean { return this.properties.getValue('deinterlaceEnabled') as boolean; }
  set deinterlaceEnabled(v: boolean) { this.properties.setValue('deinterlaceEnabled', v); }

  getParams(): DeinterlaceParams {
    return {
      method: this.method as DeinterlaceMethod,
      fieldOrder: this.fieldOrder as FieldOrder,
      enabled: this.deinterlaceEnabled,
    };
  }

  isIdentity(): boolean {
    return !isDeinterlaceActive(this.getParams());
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();

    // Save alpha channel before deinterlace (which operates on all 4 channels)
    const channels = clone.channels;
    let savedAlpha: Uint8ClampedArray | null = null;
    if (channels >= 4) {
      const pixelCount = imageData.width * imageData.height;
      savedAlpha = new Uint8ClampedArray(pixelCount);
      for (let p = 0; p < pixelCount; p++) {
        savedAlpha[p] = imageData.data[p * 4 + 3]!;
      }
    }

    applyDeinterlace(imageData, this.getParams());

    // Restore alpha channel
    if (savedAlpha) {
      for (let p = 0; p < savedAlpha.length; p++) {
        imageData.data[p * 4 + 3] = savedAlpha[p]!;
      }
    }

    clone.fromImageData(imageData);
    return clone;
  }
}
