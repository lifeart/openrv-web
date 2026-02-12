/**
 * SwitchProcessor - NodeProcessor implementation for input switching
 *
 * Encapsulates the processing logic of SwitchGroupNode: selecting
 * one of the input images based on a configurable index.
 *
 * This is a proof-of-concept processor demonstrating the NodeProcessor
 * strategy pattern for group-style nodes.
 */

import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import type { NodeProcessor } from '../base/NodeProcessor';

/**
 * Configuration callback that provides the active input index.
 * Decouples the processor from property storage concerns.
 */
export type ActiveIndexProvider = (context: EvalContext) => number;

export class SwitchProcessor implements NodeProcessor {
  private getActiveIndex: ActiveIndexProvider;

  /**
   * @param getActiveIndex - Function that returns the active input index for a given context.
   *                         This allows the processor to be driven by any source of truth
   *                         (node properties, external state, etc.)
   */
  constructor(getActiveIndex: ActiveIndexProvider) {
    this.getActiveIndex = getActiveIndex;
  }

  process(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    if (inputs.length === 0) {
      return null;
    }

    const activeIndex = this.getActiveIndex(context);
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
