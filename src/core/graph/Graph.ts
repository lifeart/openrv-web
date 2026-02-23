import { IPNode } from '../../nodes/base/IPNode';
import { IPImage } from '../image/Image';
import { Signal } from './Signal';

export interface EvalContext {
  frame: number;
  width: number;
  height: number;
  quality: 'preview' | 'full';
}

export class Graph {
  private nodes = new Map<string, IPNode>();
  private outputNode: IPNode | null = null;

  readonly nodeAdded = new Signal<IPNode>();
  readonly nodeRemoved = new Signal<IPNode>();
  readonly connectionChanged = new Signal<{ from: IPNode; to: IPNode }>();

  addNode(node: IPNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id "${node.id}" already exists`);
    }
    this.nodes.set(node.id, node);
    this.nodeAdded.emit(node, node);
  }

  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Disconnect all inputs and outputs
    // Copy arrays first because disconnectInput mutates the underlying arrays
    for (const input of [...node.inputs]) {
      node.disconnectInput(input);
    }
    for (const output of [...node.outputs]) {
      output.disconnectInput(node);
    }

    this.nodes.delete(nodeId);
    this.nodeRemoved.emit(node, node);
  }

  getNode(nodeId: string): IPNode | undefined {
    return this.nodes.get(nodeId);
  }

  getAllNodes(): IPNode[] {
    return Array.from(this.nodes.values());
  }

  setOutputNode(node: IPNode): void {
    this.outputNode = node;
  }

  connect(fromNode: IPNode, toNode: IPNode): void {
    if (!this.nodes.has(fromNode.id) || !this.nodes.has(toNode.id)) {
      throw new Error('Both nodes must be in the graph');
    }

    // Check for cycles
    if (this.wouldCreateCycle(fromNode, toNode)) {
      throw new Error('Connection would create a cycle');
    }

    toNode.connectInput(fromNode);
    this.connectionChanged.emit({ from: fromNode, to: toNode }, { from: fromNode, to: toNode });
  }

  disconnect(fromNode: IPNode, toNode: IPNode): void {
    toNode.disconnectInput(fromNode);
    this.connectionChanged.emit({ from: fromNode, to: toNode }, { from: fromNode, to: toNode });
  }

  private wouldCreateCycle(from: IPNode, to: IPNode): boolean {
    // Check if connecting from -> to would create a cycle.
    // A cycle would exist if 'to' is already an ancestor of 'from' (reachable
    // by walking from's inputs upstream). If so, adding from→to creates a loop.
    const visited = new Set<string>();
    const stack = [from];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.id === to.id) {
        return true;
      }
      if (visited.has(node.id)) {
        continue;
      }
      visited.add(node.id);

      for (const input of node.inputs) {
        stack.push(input);
      }
    }

    return false;
  }

  // Topological sort for evaluation order
  getEvaluationOrder(): IPNode[] {
    const sorted: IPNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (node: IPNode) => {
      if (visited.has(node.id)) return;
      if (visiting.has(node.id)) {
        throw new Error('Cycle detected in graph');
      }

      visiting.add(node.id);

      for (const input of node.inputs) {
        visit(input);
      }

      visiting.delete(node.id);
      visited.add(node.id);
      sorted.push(node);
    };

    for (const node of this.nodes.values()) {
      visit(node);
    }

    return sorted;
  }

  evaluate(frame: number): IPImage | null {
    if (!this.outputNode) {
      return null;
    }

    const context: EvalContext = {
      frame,
      width: 1920,
      height: 1080,
      quality: 'full',
    };

    return this.outputNode.evaluate(context);
  }

  clear(): void {
    this.nodes.clear();
    this.outputNode = null;
  }

  toJSON(): object {
    const nodes = Array.from(this.nodes.values()).map((node) => ({
      id: node.id,
      type: node.type,
      properties: node.properties.toJSON(),
      inputs: node.inputs.map((input) => input.id),
    }));

    return {
      nodes,
      outputNode: this.outputNode?.id ?? null,
    };
  }
}
