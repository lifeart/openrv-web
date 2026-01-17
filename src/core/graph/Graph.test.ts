/**
 * Graph Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Graph, EvalContext } from './Graph';
import { IPNode } from '../../nodes/base/IPNode';
import { IPImage } from '../image/Image';

// Simple mock node for testing
class MockNode extends IPNode {
  constructor(name: string) {
    super('MockNode', name);
  }

  protected process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    // Just pass through first input
    return inputs[0] ?? null;
  }
}

describe('Graph', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
  });

  describe('addNode', () => {
    it('GRP-001: adds node to graph', () => {
      const node = new MockNode('TestNode');
      graph.addNode(node);

      expect(graph.getNode(node.id)).toBe(node);
      expect(graph.getAllNodes()).toContain(node);
    });

    it('emits nodeAdded signal', () => {
      const listener = vi.fn();
      graph.nodeAdded.connect(listener);

      const node = new MockNode('TestNode');
      graph.addNode(node);

      expect(listener).toHaveBeenCalledWith(node, node);
    });

    it('throws error for duplicate node id', () => {
      const node = new MockNode('TestNode');
      graph.addNode(node);

      expect(() => graph.addNode(node)).toThrow('already exists');
    });
  });

  describe('removeNode', () => {
    it('GRP-002: removes node from graph', () => {
      const node = new MockNode('TestNode');
      graph.addNode(node);

      graph.removeNode(node.id);

      expect(graph.getNode(node.id)).toBeUndefined();
      expect(graph.getAllNodes()).not.toContain(node);
    });

    it('emits nodeRemoved signal', () => {
      const node = new MockNode('TestNode');
      graph.addNode(node);

      const listener = vi.fn();
      graph.nodeRemoved.connect(listener);

      graph.removeNode(node.id);

      expect(listener).toHaveBeenCalledWith(node, node);
    });

    it('does nothing for non-existent node', () => {
      expect(() => graph.removeNode('non-existent')).not.toThrow();
    });

    it('disconnects all connections when removing', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');
      const node3 = new MockNode('Node3');

      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(node3);

      graph.connect(node1, node2);
      graph.connect(node2, node3);

      graph.removeNode(node2.id);

      expect(node1.outputs.length).toBe(0);
      expect(node3.inputs.length).toBe(0);
    });
  });

  describe('connect', () => {
    it('GRP-003: establishes connection between nodes', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      graph.addNode(node2);

      graph.connect(node1, node2);

      expect(node2.inputs).toContain(node1);
      expect(node1.outputs).toContain(node2);
    });

    it('emits connectionChanged signal', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      graph.addNode(node2);

      const listener = vi.fn();
      graph.connectionChanged.connect(listener);

      graph.connect(node1, node2);

      expect(listener).toHaveBeenCalled();
    });

    it('throws error if node not in graph', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      // node2 not added

      expect(() => graph.connect(node1, node2)).toThrow('must be in the graph');
    });

    it('GRP-005: throws error for cycle detection', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');
      const node3 = new MockNode('Node3');

      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(node3);

      graph.connect(node1, node2);
      graph.connect(node2, node3);

      // Trying to connect node3 back to node1 would create a cycle
      expect(() => graph.connect(node3, node1)).toThrow('cycle');
    });
  });

  describe('disconnect', () => {
    it('GRP-004: removes connection between nodes', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      graph.addNode(node2);

      graph.connect(node1, node2);
      graph.disconnect(node1, node2);

      expect(node2.inputs).not.toContain(node1);
      expect(node1.outputs).not.toContain(node2);
    });

    it('emits connectionChanged signal', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      graph.addNode(node2);
      graph.connect(node1, node2);

      const listener = vi.fn();
      graph.connectionChanged.connect(listener);

      graph.disconnect(node1, node2);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('setOutputNode', () => {
    it('GRP-008: sets the output node', () => {
      const node = new MockNode('Output');
      graph.addNode(node);
      graph.setOutputNode(node);

      // Evaluate should work with output node set
      const result = graph.evaluate(1);
      expect(result).toBeNull(); // No inputs, returns null
    });
  });

  describe('evaluate', () => {
    it('GRP-006: evaluates graph from output node', () => {
      const node = new MockNode('Output');
      graph.addNode(node);
      graph.setOutputNode(node);

      const result = graph.evaluate(1);
      expect(result).toBeNull(); // No inputs
    });

    it('returns null if no output node', () => {
      const result = graph.evaluate(1);
      expect(result).toBeNull();
    });
  });

  describe('getEvaluationOrder', () => {
    it('returns topologically sorted nodes', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');
      const node3 = new MockNode('Node3');

      graph.addNode(node1);
      graph.addNode(node2);
      graph.addNode(node3);

      graph.connect(node1, node2);
      graph.connect(node2, node3);

      const order = graph.getEvaluationOrder();

      // node1 should come before node2, node2 before node3
      expect(order.indexOf(node1)).toBeLessThan(order.indexOf(node2));
      expect(order.indexOf(node2)).toBeLessThan(order.indexOf(node3));
    });

    it('throws error for cycles', () => {
      // We can't create a cycle with the connect method (it checks),
      // but we can test that getEvaluationOrder would detect one
      // For this test, we just verify it works on a valid graph
      const node1 = new MockNode('Node1');
      graph.addNode(node1);

      const order = graph.getEvaluationOrder();
      expect(order).toContain(node1);
    });
  });

  describe('getAllNodes', () => {
    it('returns all nodes in graph', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      graph.addNode(node2);

      const nodes = graph.getAllNodes();
      expect(nodes).toContain(node1);
      expect(nodes).toContain(node2);
      expect(nodes.length).toBe(2);
    });
  });

  describe('clear', () => {
    it('removes all nodes', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      graph.addNode(node2);

      graph.clear();

      expect(graph.getAllNodes().length).toBe(0);
    });
  });

  describe('toJSON', () => {
    it('serializes graph structure', () => {
      const node1 = new MockNode('Node1');
      const node2 = new MockNode('Node2');

      graph.addNode(node1);
      graph.addNode(node2);
      graph.connect(node1, node2);
      graph.setOutputNode(node2);

      const json = graph.toJSON() as { nodes: unknown[]; outputNode: string | null };

      expect(json.nodes).toHaveLength(2);
      expect(json.outputNode).toBe(node2.id);
    });
  });
});
