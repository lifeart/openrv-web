import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

/**
 * Category for grouping and ordering effects in the UI.
 */
export type EffectCategory = 'color' | 'tone' | 'spatial' | 'diagnostic';

/**
 * Base class for all effect nodes in the graph.
 *
 * Single-input, single-output: takes one image from input[0],
 * applies an effect, and returns the modified image.
 *
 * Subclasses implement:
 * - `applyEffect()`: the actual pixel processing
 * - `isIdentity()`: returns true when current parameters produce no change
 *
 * The base class handles:
 * - Pass-through when disabled or identity
 * - Caching (inherited from IPNode)
 * - Dirty propagation on property changes
 * - Enabled/disabled toggle
 * - Mix blending between input and effected output
 */
export abstract class EffectNode extends IPNode {
  /** Effect category for UI grouping. */
  abstract readonly category: EffectCategory;

  /** Human-readable label for UI display. */
  abstract readonly label: string;

  constructor(type: string, name?: string) {
    super(type, name);
    this.properties.add({ name: 'enabled', defaultValue: true });
    this.properties.add({
      name: 'mix',
      defaultValue: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Mix',
    });
  }

  /** Whether the effect is currently enabled. */
  get enabled(): boolean {
    return this.properties.getValue('enabled') as boolean;
  }
  set enabled(value: boolean) {
    this.properties.setValue('enabled', value);
  }

  /** Mix/opacity of the effect (0 = bypass, 1 = full). */
  get mix(): number {
    return this.properties.getValue('mix') as number;
  }
  set mix(value: number) {
    this.properties.setValue('mix', value);
  }

  /**
   * Returns true when the current parameter values produce an identity
   * transform (no pixel change). Used to skip processing entirely.
   */
  abstract isIdentity(): boolean;

  /**
   * Apply the effect to the input image and return the result.
   * Implementations should NOT modify the input image in-place if caching
   * is desired upstream; instead, clone and modify.
   */
  protected abstract applyEffect(
    context: EvalContext,
    input: IPImage
  ): IPImage;

  protected process(
    context: EvalContext,
    inputs: (IPImage | null)[]
  ): IPImage | null {
    const input = inputs[0];
    if (!input) return null;

    // Pass-through when disabled or identity
    if (!this.enabled || this.isIdentity()) {
      return input;
    }

    const result = this.applyEffect(context, input);

    // Apply mix (blend between input and result)
    if (this.mix < 1.0) {
      return this.blendImages(input, result, this.mix);
    }

    return result;
  }

  /**
   * Linearly blend two images by the given factor.
   * factor=0 returns `a`, factor=1 returns `b`.
   *
   * For RGBA images (channels >= 4), the alpha channel is preserved
   * from the input image `a` rather than interpolated. This prevents
   * corruption of premultiplied-alpha images where linear interpolation
   * of alpha would produce incorrect compositing results.
   */
  private blendImages(a: IPImage, b: IPImage, factor: number): IPImage {
    const srcData = a.getTypedArray();
    const outData = b.getTypedArray();
    const len = srcData.length;
    const channels = a.channels;

    if (channels >= 4) {
      // RGBA: blend RGB channels, preserve alpha from input
      for (let i = 0; i < len; i++) {
        if ((i + 1) % channels === 0) {
          // Alpha channel: preserve from input image
          outData[i] = srcData[i]!;
        } else {
          outData[i] = srcData[i]! * (1 - factor) + outData[i]! * factor;
        }
      }
    } else {
      // Non-RGBA (1 or 3 channels): blend all channels
      for (let i = 0; i < len; i++) {
        outData[i] = srcData[i]! * (1 - factor) + outData[i]! * factor;
      }
    }
    return b;
  }
}
