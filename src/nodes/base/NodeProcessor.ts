/**
 * NodeProcessor - Strategy interface for node graph evaluation
 *
 * Decouples processing logic from the node hierarchy. Instead of requiring
 * all processing to live inside IPNode subclass `process()` methods,
 * a NodeProcessor can be attached to a node to handle evaluation externally.
 *
 * This enables:
 * - Plugin-style custom node types without subclassing IPNode
 * - Easier testing of processing logic in isolation
 * - Swapping processing strategies at runtime
 * - Composing processors without deep inheritance chains
 *
 * Usage:
 *   const node = new ProcessableNode('MyType', 'MyName');
 *   node.processor = new MyCustomProcessor();
 *   // node.evaluate() will now delegate to MyCustomProcessor.process()
 *
 * This is an opt-in pattern: existing nodes continue to use their
 * built-in `process()` method unless a processor is explicitly set.
 */

import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

/**
 * Strategy interface for node processing logic.
 *
 * Mirrors the signature of IPNode's protected `process()` method,
 * enabling external implementations of the same evaluation contract.
 */
export interface NodeProcessor {
  /**
   * Process inputs and produce an output image.
   *
   * @param context - Evaluation context with frame number, dimensions, and quality
   * @param inputs - Already-evaluated images from upstream input nodes (may contain nulls)
   * @returns The processed output image, or null if no output is available
   */
  process(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null;

  /**
   * Mark the processor's internal state as needing re-evaluation.
   * Called when the owning node is marked dirty (e.g., property change, input change).
   */
  invalidate(): void;

  /**
   * Clean up any resources held by the processor.
   * Called when the owning node is disposed.
   */
  dispose(): void;
}
