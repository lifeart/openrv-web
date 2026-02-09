/**
 * StackProcessor - NodeProcessor implementation for stack compositing
 *
 * Encapsulates the processing logic of StackGroupNode: selecting
 * the active input based on wipe position and mode. In wipe mode with
 * two or more inputs, it chooses based on wipe X position. Otherwise,
 * it returns the first input.
 *
 * This is a proof-of-concept processor demonstrating the NodeProcessor
 * strategy pattern for compositing-style group nodes.
 */

import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import type { NodeProcessor } from '../base/NodeProcessor';

/**
 * Configuration callback that provides the active input index.
 * For stack nodes, this is driven by the wipe position and mode.
 */
export type StackActiveIndexProvider = (context: EvalContext, inputCount: number) => number;

export class StackProcessor implements NodeProcessor {
  private getActiveIndex: StackActiveIndexProvider;

  /**
   * @param getActiveIndex - Function that returns the active input index based on
   *                         evaluation context and the number of available inputs.
   */
  constructor(getActiveIndex: StackActiveIndexProvider) {
    this.getActiveIndex = getActiveIndex;
  }

  process(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0) {
      return null;
    }

    const activeIndex = this.getActiveIndex(context, inputs.length);
    const clampedIndex = Math.max(0, Math.min(inputs.length - 1, activeIndex));
    return inputs[clampedIndex] ?? null;
  }

  invalidate(): void {
    // No internal cached state to invalidate for a simple selector
  }

  dispose(): void {
    // No resources to clean up
  }
}
