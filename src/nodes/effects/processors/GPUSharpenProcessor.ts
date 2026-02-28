import type { NodeProcessor } from '../../base/NodeProcessor';
import type { IPImage } from '../../../core/image/Image';
import type { EvalContext } from '../../../core/graph/Graph';
import { WebGLSharpenProcessor } from '../../../filters/WebGLSharpen';

/**
 * GPU-accelerated sharpen processor.
 * Attaches to a SharpenNode via `node.processor = new GPUSharpenProcessor()`.
 * Falls back to the node's built-in CPU applyEffect() if GPU is unavailable.
 *
 * @experimental This is a stub implementation. Parameters are hardcoded and
 * not yet read from the owning node's properties. A future revision will
 * wire up the node's property bag for full configurability.
 */
export class GPUSharpenProcessor implements NodeProcessor {
  private gpuProcessor: WebGLSharpenProcessor | null = null;

  constructor() {
    try {
      this.gpuProcessor = new WebGLSharpenProcessor();
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
    const amount = 50;
    const imageData = input.toImageData();
    const result = this.gpuProcessor.apply(imageData, amount);
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
