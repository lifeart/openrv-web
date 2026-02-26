import { RegisterNode } from '../base/NodeFactory';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { applyToneMappingWithParams } from '../../ui/components/ViewerEffects';
import type { ToneMappingOperator, ToneMappingState } from '../../core/types/effects';

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

  constructor(name?: string) {
    super('ToneMapping', name);

    this.properties.add({ name: 'operator', defaultValue: 'off' as string });

    // Reinhard parameters
    this.properties.add({ name: 'reinhardWhitePoint', defaultValue: 4.0, min: 0.1, max: 20, step: 0.1 });

    // Filmic parameters
    this.properties.add({ name: 'filmicExposureBias', defaultValue: 2.0, min: 0, max: 10, step: 0.1 });
    this.properties.add({ name: 'filmicWhitePoint', defaultValue: 11.2, min: 1, max: 20, step: 0.1 });

    // Drago parameters
    this.properties.add({ name: 'dragoBias', defaultValue: 0.85, min: 0.5, max: 1.0, step: 0.01 });
    this.properties.add({ name: 'dragoLwa', defaultValue: 0.2, min: 0, max: 10, step: 0.01 });
    this.properties.add({ name: 'dragoLmax', defaultValue: 1.5, min: 0, max: 10, step: 0.1 });
    this.properties.add({ name: 'dragoBrightness', defaultValue: 2.0, min: 0.5, max: 5.0, step: 0.1 });
  }

  // -- Property accessors --

  get operator(): string { return this.properties.getValue('operator') as string; }
  set operator(v: string) { this.properties.setValue('operator', v); }

  get reinhardWhitePoint(): number { return this.properties.getValue('reinhardWhitePoint') as number; }
  set reinhardWhitePoint(v: number) { this.properties.setValue('reinhardWhitePoint', v); }

  get filmicExposureBias(): number { return this.properties.getValue('filmicExposureBias') as number; }
  set filmicExposureBias(v: number) { this.properties.setValue('filmicExposureBias', v); }

  get filmicWhitePoint(): number { return this.properties.getValue('filmicWhitePoint') as number; }
  set filmicWhitePoint(v: number) { this.properties.setValue('filmicWhitePoint', v); }

  get dragoBias(): number { return this.properties.getValue('dragoBias') as number; }
  set dragoBias(v: number) { this.properties.setValue('dragoBias', v); }

  get dragoLwa(): number { return this.properties.getValue('dragoLwa') as number; }
  set dragoLwa(v: number) { this.properties.setValue('dragoLwa', v); }

  get dragoLmax(): number { return this.properties.getValue('dragoLmax') as number; }
  set dragoLmax(v: number) { this.properties.setValue('dragoLmax', v); }

  get dragoBrightness(): number { return this.properties.getValue('dragoBrightness') as number; }
  set dragoBrightness(v: number) { this.properties.setValue('dragoBrightness', v); }

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
