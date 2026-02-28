import type { IPNode } from '../base/IPNode';
import { EffectNode } from './EffectNode';
import { NodeFactory } from '../base/NodeFactory';
import { Graph, type EvalContext } from '../../core/graph/Graph';
import type { IPImage } from '../../core/image/Image';

/**
 * Convenience wrapper for a linear chain of EffectNodes.
 *
 * Usage:
 *   const chain = new EffectChain();
 *   chain.append(new CDLNode());
 *   chain.append(new SharpenNode());
 *   chain.setSource(sourceNode);
 *   const result = chain.evaluate(context);
 *
 * Performance note (deepClone and buffer allocation):
 *   The initial implementation uses deepClone() per active effect in
 *   applyEffect(). For 4K float32 RGBA images (~127 MB per clone),
 *   a chain of 5 active effects allocates ~635 MB of transient buffers.
 *   This is acceptable for HD uint8 workflows (the majority use case).
 *
 *   For 4K float32 workflows, a ping-pong buffer strategy is planned
 *   as a follow-up optimization: pre-allocate two IPImage buffers at
 *   the source resolution, and alternate writing into them across
 *   effect stages.
 */
export class EffectChain {
  private effects: EffectNode[] = [];
  private graph = new Graph();
  private source: IPNode | null = null;

  append(effect: EffectNode): void {
    if (this.effects.includes(effect)) return;
    this.graph.addNode(effect);
    this.effects.push(effect);
    this.rebuildChain();
  }

  insert(index: number, effect: EffectNode): void {
    if (this.effects.includes(effect)) return;
    this.graph.addNode(effect);
    this.effects.splice(index, 0, effect);
    this.rebuildChain();
  }

  remove(effect: EffectNode): void {
    const idx = this.effects.indexOf(effect);
    if (idx === -1) return;
    this.effects.splice(idx, 1);
    this.graph.removeNode(effect.id);
    this.rebuildChain();
  }

  reorder(fromIndex: number, toIndex: number): void {
    const [effect] = this.effects.splice(fromIndex, 1);
    if (!effect) return;
    this.effects.splice(toIndex, 0, effect);
    this.rebuildChain();
  }

  setSource(source: IPNode): void {
    this.source = source;
    if (!this.graph.getNode(source.id)) {
      this.graph.addNode(source);
    }
    this.rebuildChain();
  }

  getEffects(): readonly EffectNode[] {
    return this.effects;
  }

  /**
   * Evaluate the effect chain with a full EvalContext.
   *
   * Accepts a complete EvalContext rather than just a frame number,
   * so that the actual image resolution, quality mode, and other
   * context fields are correctly propagated to all effect nodes.
   * This avoids the Graph's internal default of 1920x1080.
   */
  evaluate(context: EvalContext): IPImage | null {
    return this.graph.evaluateWithContext(context);
  }

  private rebuildChain(): void {
    // Disconnect all
    for (const effect of this.effects) {
      effect.disconnectAllInputs();
    }

    // Wire: source -> effect[0] -> effect[1] -> ... -> last
    let prev: IPNode | null = this.source;
    for (const effect of this.effects) {
      if (prev) {
        effect.connectInput(prev);
      }
      prev = effect;
    }

    // Set last node as graph output
    if (prev) {
      this.graph.setOutputNode(prev);
    }
  }

  /** Serialize the chain to a portable format. */
  toJSON(): { effects: Array<{ type: string; properties: Record<string, unknown> }> } {
    return {
      effects: this.effects.map(e => ({
        type: e.type,
        properties: e.properties.toJSON(),
      })),
    };
  }

  /**
   * Deserialize a chain from a previously serialized JSON object.
   *
   * Uses NodeFactory.create(type) to reconstruct each effect node
   * by its registered type string, then restores property values
   * via node.properties.fromJSON(). This completes the serialization
   * round-trip required for exportable effect pipelines.
   *
   * @param data - The output of toJSON()
   * @returns A new EffectChain with restored effects and properties
   */
  static fromJSON(data: { effects: Array<{ type: string; properties: Record<string, unknown> }> }): EffectChain {
    const chain = new EffectChain();
    for (const entry of data.effects) {
      const node = NodeFactory.create(entry.type);
      if (!node) {
        throw new Error(`Unknown effect type: ${entry.type}`);
      }
      if (!(node instanceof EffectNode)) {
        throw new Error(`Node type "${entry.type}" is not an EffectNode`);
      }
      node.properties.fromJSON(entry.properties);
      chain.append(node);
    }
    return chain;
  }

  dispose(): void {
    for (const effect of this.effects) {
      effect.dispose();
    }
    this.effects = [];
    this.graph.clear();
    this.source = null;
  }
}
