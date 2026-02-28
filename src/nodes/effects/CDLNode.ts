import { RegisterNode } from '../base/NodeFactory';
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

  constructor(name?: string) {
    super('CDL', name);

    // Slope per channel (multiplier)
    this.properties.add({ name: 'slopeR', defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    this.properties.add({ name: 'slopeG', defaultValue: 1.0, min: 0, max: 10, step: 0.01 });
    this.properties.add({ name: 'slopeB', defaultValue: 1.0, min: 0, max: 10, step: 0.01 });

    // Offset per channel (addition)
    this.properties.add({ name: 'offsetR', defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    this.properties.add({ name: 'offsetG', defaultValue: 0.0, min: -1, max: 1, step: 0.001 });
    this.properties.add({ name: 'offsetB', defaultValue: 0.0, min: -1, max: 1, step: 0.001 });

    // Power per channel (gamma)
    this.properties.add({ name: 'powerR', defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    this.properties.add({ name: 'powerG', defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });
    this.properties.add({ name: 'powerB', defaultValue: 1.0, min: 0.1, max: 4, step: 0.01 });

    // Saturation (applied after SOP)
    this.properties.add({ name: 'saturation', defaultValue: 1.0, min: 0, max: 4, step: 0.01 });
  }

  // -- Property accessors --

  get slopeR(): number { return this.properties.getValue('slopeR') as number; }
  set slopeR(v: number) { this.properties.setValue('slopeR', v); }

  get slopeG(): number { return this.properties.getValue('slopeG') as number; }
  set slopeG(v: number) { this.properties.setValue('slopeG', v); }

  get slopeB(): number { return this.properties.getValue('slopeB') as number; }
  set slopeB(v: number) { this.properties.setValue('slopeB', v); }

  get offsetR(): number { return this.properties.getValue('offsetR') as number; }
  set offsetR(v: number) { this.properties.setValue('offsetR', v); }

  get offsetG(): number { return this.properties.getValue('offsetG') as number; }
  set offsetG(v: number) { this.properties.setValue('offsetG', v); }

  get offsetB(): number { return this.properties.getValue('offsetB') as number; }
  set offsetB(v: number) { this.properties.setValue('offsetB', v); }

  get powerR(): number { return this.properties.getValue('powerR') as number; }
  set powerR(v: number) { this.properties.setValue('powerR', v); }

  get powerG(): number { return this.properties.getValue('powerG') as number; }
  set powerG(v: number) { this.properties.setValue('powerG', v); }

  get powerB(): number { return this.properties.getValue('powerB') as number; }
  set powerB(v: number) { this.properties.setValue('powerB', v); }

  get saturation(): number { return this.properties.getValue('saturation') as number; }
  set saturation(v: number) { this.properties.setValue('saturation', v); }

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
