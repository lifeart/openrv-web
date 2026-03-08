import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { type IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyToneMappingWithParams } from '../../ui/components/ViewerEffects';
import type { ToneMappingOperator, ToneMappingState } from '../../core/types/effects';
import { defineNodeProperty } from '../base/defineNodeProperty';

/**
 * Tone mapping effect node.
 *
 * Maps high-dynamic-range pixel values into displayable range using one of
 * several standard operators (Reinhard, Filmic, ACES, AGX, PBR Neutral,
 * GT, ACES Hill, Drago).
 *
 * Each operator exposes its own tuning parameters (white point, exposure
 * bias, etc.) which are passed through to the processing function.
 *
 * Delegates to `applyToneMappingWithParams` for the actual pixel processing.
 */
@RegisterNode('ToneMapping')
export class ToneMappingNode extends EffectNode {
  readonly category: EffectCategory = 'tone';
  readonly label = 'Tone Mapping';

  declare operator: string;
  declare reinhardWhitePoint: number;
  declare filmicExposureBias: number;
  declare filmicWhitePoint: number;
  declare dragoBias: number;
  declare dragoLwa: number;
  declare dragoLmax: number;
  declare dragoBrightness: number;

  constructor(name?: string) {
    super('ToneMapping', name);

    defineNodeProperty(this, 'operator', { defaultValue: 'off' as string });

    // Reinhard parameters
    defineNodeProperty(this, 'reinhardWhitePoint', { defaultValue: 4.0, min: 0.1, max: 20, step: 0.1 });

    // Filmic parameters
    defineNodeProperty(this, 'filmicExposureBias', { defaultValue: 2.0, min: 0, max: 10, step: 0.1 });
    defineNodeProperty(this, 'filmicWhitePoint', { defaultValue: 11.2, min: 1, max: 20, step: 0.1 });

    // Drago parameters
    defineNodeProperty(this, 'dragoBias', { defaultValue: 0.85, min: 0.5, max: 1.0, step: 0.01 });
    defineNodeProperty(this, 'dragoLwa', { defaultValue: 0.2, min: 0, max: 10, step: 0.01 });
    defineNodeProperty(this, 'dragoLmax', { defaultValue: 1.5, min: 0, max: 10, step: 0.1 });
    defineNodeProperty(this, 'dragoBrightness', { defaultValue: 2.0, min: 0.5, max: 5.0, step: 0.1 });
  }

  /**
   * Build a ToneMappingState struct from the current property values.
   */
  getToneMappingState(): ToneMappingState {
    return {
      enabled: true,
      operator: this.operator as ToneMappingOperator,
      reinhardWhitePoint: this.reinhardWhitePoint,
      filmicExposureBias: this.filmicExposureBias,
      filmicWhitePoint: this.filmicWhitePoint,
      dragoBias: this.dragoBias,
      dragoLwa: this.dragoLwa,
      dragoLmax: this.dragoLmax,
      dragoBrightness: this.dragoBrightness,
    };
  }

  isIdentity(): boolean {
    return this.operator === 'off';
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const clone = input.deepClone();
    const imageData = clone.toImageData();
    applyToneMappingWithParams(imageData, this.getToneMappingState());
    clone.fromImageData(imageData);
    return clone;
  }
}
