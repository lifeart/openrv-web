import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyHueRotationInto, isIdentityHueRotation } from '../../color/HueRotation';

/**
 * Luminance-preserving hue rotation effect node.
 *
 * Rotates the hue of each pixel by the specified number of degrees
 * using a 3x3 matrix that preserves Rec. 709 luminance.
 *
 * Operates directly on the typed array for precision, normalizing
 * from the image's native data type to [0, 1] before applying the
 * rotation and converting back afterward.
 *
 * Delegates to `applyHueRotationInto` for per-pixel processing.
 */
@RegisterNode('HueRotation')
export class HueRotationNode extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'Hue Rotation';

  constructor(name?: string) {
    super('HueRotation', name);

    this.properties.add({ name: 'degrees', defaultValue: 0, min: -180, max: 180, step: 1 });
  }

  get degrees(): number { return this.properties.getValue('degrees') as number; }
  set degrees(v: number) { this.properties.setValue('degrees', v); }

  isIdentity(): boolean {
    return isIdentityHueRotation(this.degrees);
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const channels = input.channels;

    // Need at least 3 channels (RGB) to apply hue rotation
    if (channels < 3) {
      return input;
    }

    const clone = input.deepClone();
    const data = clone.getTypedArray();
    const len = data.length;
    const degrees = this.degrees;
    const dataType = clone.dataType;

    // Pre-allocated output tuple to avoid per-pixel allocation
    const out: [number, number, number] = [0, 0, 0];

    if (dataType === 'float32') {
      // float32: values are already in [0, 1]
      for (let i = 0; i < len; i += channels) {
        applyHueRotationInto(data[i]!, data[i + 1]!, data[i + 2]!, degrees, out);
        data[i] = out[0];
        data[i + 1] = out[1];
        data[i + 2] = out[2];
        // Alpha and any extra channels are unchanged
      }
    } else if (dataType === 'uint8') {
      // uint8: normalize by 255, then scale back
      const scale = 1 / 255;
      for (let i = 0; i < len; i += channels) {
        applyHueRotationInto(
          data[i]! * scale,
          data[i + 1]! * scale,
          data[i + 2]! * scale,
          degrees,
          out,
        );
        data[i] = Math.round(out[0] * 255);
        data[i + 1] = Math.round(out[1] * 255);
        data[i + 2] = Math.round(out[2] * 255);
      }
    } else {
      // uint16: normalize by 65535, then scale back
      const scale = 1 / 65535;
      for (let i = 0; i < len; i += channels) {
        applyHueRotationInto(
          data[i]! * scale,
          data[i + 1]! * scale,
          data[i + 2]! * scale,
          degrees,
          out,
        );
        data[i] = Math.round(out[0] * 65535);
        data[i + 1] = Math.round(out[1] * 65535);
        data[i + 2] = Math.round(out[2] * 65535);
      }
    }

    return clone;
  }
}
