import { RegisterNode } from '../base/NodeFactory';
import { defineNodeProperty } from '../base/defineNodeProperty';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { luminanceRec709 } from '../../color/PixelMath';

/**
 * Color Wheels (Lift/Gamma/Gain) effect node.
 *
 * Applies the classic three-way color corrector model used in grading:
 * - **Lift** adjusts shadows (luma < 0.33)
 * - **Gamma** adjusts midtones (centered at luma 0.5)
 * - **Gain** adjusts highlights (luma > 0.67)
 * - **Master** applies a uniform offset across all luminance ranges
 *
 * Each zone has per-channel (R, G, B) and luminance (Y) controls.
 * Zone weighting uses smooth blending functions to avoid harsh transitions.
 */
@RegisterNode('ColorWheels')
export class ColorWheelsNode extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'Color Wheels';

  declare liftR: number;
  declare liftG: number;
  declare liftB: number;
  declare liftY: number;
  declare gammaR: number;
  declare gammaG: number;
  declare gammaB: number;
  declare gammaY: number;
  declare gainR: number;
  declare gainG: number;
  declare gainB: number;
  declare gainY: number;
  declare masterR: number;
  declare masterG: number;
  declare masterB: number;
  declare masterY: number;

  constructor(name?: string) {
    super('ColorWheels', name);

    // Lift (shadows)
    defineNodeProperty(this, 'liftR', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'liftG', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'liftB', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'liftY', { defaultValue: 0, min: -1, max: 1, step: 0.01 });

    // Gamma (midtones)
    defineNodeProperty(this, 'gammaR', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'gammaG', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'gammaB', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'gammaY', { defaultValue: 0, min: -1, max: 1, step: 0.01 });

    // Gain (highlights)
    defineNodeProperty(this, 'gainR', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'gainG', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'gainB', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'gainY', { defaultValue: 0, min: -1, max: 1, step: 0.01 });

    // Master (global)
    defineNodeProperty(this, 'masterR', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'masterG', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'masterB', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
    defineNodeProperty(this, 'masterY', { defaultValue: 0, min: -1, max: 1, step: 0.01 });
  }

  isIdentity(): boolean {
    return (
      this.liftR === 0 && this.liftG === 0 && this.liftB === 0 && this.liftY === 0 &&
      this.gammaR === 0 && this.gammaG === 0 && this.gammaB === 0 && this.gammaY === 0 &&
      this.gainR === 0 && this.gainG === 0 && this.gainB === 0 && this.gainY === 0 &&
      this.masterR === 0 && this.masterG === 0 && this.masterB === 0 && this.masterY === 0
    );
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    const data = imageData.data;

    const { liftR, liftG, liftB, liftY } = this;
    const { gammaR, gammaG, gammaB, gammaY } = this;
    const { gainR, gainG, gainB, gainY } = this;
    const { masterR, masterG, masterB, masterY } = this;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]! / 255;
      let g = data[i + 1]! / 255;
      let b = data[i + 2]! / 255;

      const luma = luminanceRec709(r, g, b);

      // Master (global offset)
      r += masterR * 0.5 + masterY;
      g += masterG * 0.5 + masterY;
      b += masterB * 0.5 + masterY;

      // Lift (shadows: luma < 0.33)
      const liftWeight =
        this.smoothstep(0.5, 0.33, luma) * this.smoothstep(0, 0.15, luma);
      r += liftR * 0.5 * liftWeight + liftY * liftWeight;
      g += liftG * 0.5 * liftWeight + liftY * liftWeight;
      b += liftB * 0.5 * liftWeight + liftY * liftWeight;

      // Gamma (midtones: centered at 0.5)
      const gammaWeight = this.bellCurve(luma, 0.5, 0.25);
      r += gammaR * 0.5 * gammaWeight + gammaY * gammaWeight;
      g += gammaG * 0.5 * gammaWeight + gammaY * gammaWeight;
      b += gammaB * 0.5 * gammaWeight + gammaY * gammaWeight;

      // Gain (highlights: luma > 0.67)
      const gainWeight =
        this.smoothstep(0.5, 0.67, luma) * this.smoothstep(1.0, 0.85, luma);
      r += gainR * 0.5 * gainWeight + gainY * gainWeight;
      g += gainG * 0.5 * gainWeight + gainY * gainWeight;
      b += gainB * 0.5 * gainWeight + gainY * gainWeight;

      data[i] = this.clamp(r * 255, 0, 255);
      data[i + 1] = this.clamp(g * 255, 0, 255);
      data[i + 2] = this.clamp(b * 255, 0, 255);
      // alpha unchanged
    }

    clone.fromImageData(imageData);
    return clone;
  }

  /**
   * Standard smoothstep interpolation.
   * Returns 0 when x <= edge0, 1 when x >= edge1, and a smooth
   * Hermite interpolation in between.
   */
  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Gaussian bell curve centered at `center` with the given `width`.
   * Returns 1.0 at center and falls off smoothly to ~0 beyond +/- 2*width.
   */
  private bellCurve(x: number, center: number, width: number): number {
    const d = (x - center) / width;
    return Math.exp(-(d * d));
  }

  /**
   * Clamp a value to the [min, max] range.
   */
  private clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }
}
