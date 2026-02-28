import type { NodeProcessor } from '../../base/NodeProcessor';
import type { IPImage } from '../../../core/image/Image';
import type { EvalContext } from '../../../core/graph/Graph';
import { WebGLNoiseReductionProcessor } from '../../../filters/WebGLNoiseReduction';
import type { NoiseReductionParams } from '../../../filters/NoiseReduction';

/**
 * GPU-accelerated noise reduction processor.
 * Attaches to a NoiseReductionNode via `node.processor = new GPUNoiseReductionProcessor()`.
 * Falls back to the node's built-in CPU applyEffect() if GPU is unavailable.
 *
 * @experimental This is a stub implementation. Parameters are hardcoded and
 * not yet read from the owning node's properties. A future revision will
 * wire up the node's property bag for full configurability.
 */
export class GPUNoiseReductionProcessor implements NodeProcessor {
  private gpuProcessor: WebGLNoiseReductionProcessor | null = null;

  constructor() {
    try {
      const canvas = document.createElement('canvas');
      this.gpuProcessor = new WebGLNoiseReductionProcessor(canvas);
    } catch {
      // GPU not available -- node will use its built-in CPU path
    }
  }

  isReady(): boolean {
    return this.gpuProcessor?.isReady() ?? false;
  }

  process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    const input = inputs[0];
    if (!input || !this.gpuProcessor?.isReady()) return input ?? null;

    // TODO: Read parameters from owning node instead of using hardcoded values
    const params: NoiseReductionParams = {
      strength: 50,
      luminanceStrength: 50,
      chromaStrength: 75,
      radius: 2,
    };
    const imageData = input.toImageData();
    const result = this.gpuProcessor.process(imageData, params);
    const output = input.deepClone();
    output.fromImageData(result);
    return output;
  }

  invalidate(): void {}

  dispose(): void {
    this.gpuProcessor?.dispose();
    this.gpuProcessor = null;
  }
}
