import { RegisterNode } from '../base/NodeFactory';
import { defineNodeProperty } from '../base/defineNodeProperty';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyCDLToImageData, isDefaultCDL, type CDLValues } from '../../color/CDL';

/**
 * ASC CDL (Color Decision List) effect node.
 *
 * Applies the industry-standard CDL formula per channel:
 *   out = pow(max(in * slope + offset, 0), power)
 * followed by a global saturation adjustment.
 *
 * Delegates to `applyCDLToImageData` for the actual pixel processing.
 */
@RegisterNode('CDL')
export class CDLNode extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'ASC CDL';

  declare slopeR: number;
  declare slopeG: number;
  declare slopeB: number;
  declare offsetR: number;
  declare offsetG: number;
  declare offsetB: number;
  declare powerR: number;
  declare powerG: number;
  declare powerB: number;
  declare saturation: number;

  constructor(name?: string) {
    super('CDL', name);

    // Slope per channel (multiplier)
    defineNodeProperty(this, 'slopeR', { defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    defineNodeProperty(this, 'slopeG', { defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    defineNodeProperty(this, 'slopeB', { defaultValue: 1.0, min: 0, max: 10, step: 0.01 });

    // Offset per channel (addition)
    defineNodeProperty(this, 'offsetR', { defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    defineNodeProperty(this, 'offsetG', { defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    defineNodeProperty(this, 'offsetB', { defaultValue: 0.0, min: -1, max: 1, step: 0.001 });

    // Power per channel (gamma)
    defineNodeProperty(this, 'powerR', { defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    defineNodeProperty(this, 'powerG', { defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    defineNodeProperty(this, 'powerB', { defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });

    // Saturation (applied after SOP)
    defineNodeProperty(this, 'saturation', { defaultValue: 1.0, min: 0, max: 4, step: 0.01 });
  }

  /**
   * Build a CDLValues struct from the current property values.
   */
  getCDLValues(): CDLValues {
    return {
      slope: { r: this.slopeR, g: this.slopeG, b: this.slopeB },
      offset: { r: this.offsetR, g: this.offsetG, b: this.offsetB },
      power: { r: this.powerR, g: this.powerG, b: this.powerB },
      saturation: this.saturation,
    };
  }

  isIdentity(): boolean {
    return isDefaultCDL(this.getCDLValues());
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyCDLToImageData(imageData, this.getCDLValues());
    clone.fromImageData(imageData);
    return clone;
  }
}
