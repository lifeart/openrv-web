import type { NodeProcessor } from '../../base/NodeProcessor';
import type { IPImage } from '../../../core/image/Image';
import type { EvalContext } from '../../../core/graph/Graph';
import { WebGLSharpenProcessor } from '../../../filters/WebGLSharpen';

/** Minimal interface for reading sharpen parameters from the owning node. */
interface SharpenParamsProvider {
  readonly amount: number;
}

/**
 * GPU-accelerated sharpen processor.
 * Attaches to a SharpenNode via `node.processor = new GPUSharpenProcessor(node)`.
 * Falls back to the node's built-in CPU applyEffect() if GPU is unavailable.
 */
export class GPUSharpenProcessor implements NodeProcessor {
  private gpuProcessor: WebGLSharpenProcessor | null = null;

  constructor(private readonly params: SharpenParamsProvider) {
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

    const amount = this.params.amount;
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
