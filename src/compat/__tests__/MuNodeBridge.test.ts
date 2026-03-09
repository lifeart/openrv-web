import { describe, it, expect, beforeEach } from 'vitest';
import { MuNodeBridge } from '../MuNodeBridge';
import { Graph } from '../../core/graph/Graph';
import { IPNode } from '../../nodes/base/IPNode';
import { NodeFactory } from '../../nodes/base/NodeFactory';
import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

// --- Test helpers ---

/** Minimal concrete IPNode for testing */
class TestNode extends IPNode {
  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

// Register a test node type for newNode tests
const TEST_TYPE = '__MuNodeBridgeTest__';
NodeFactory.register(TEST_TYPE, () => new TestNode(TEST_TYPE));

function createTestGraph(): { graph: Graph; nodes: IPNode[] } {
  const graph = new Graph();
  const a = new TestNode('RVSource', 'source1');
  const b = new TestNode('RVColor', 'color1');
  const c = new TestNode('RVSequence', 'seq1');
  graph.addNode(a);
  graph.addNode(b);
  graph.addNode(c);
  graph.connect(a, b);
  graph.connect(b, c);
  return { graph, nodes: [a, b, c] };
}

describe('MuNodeBridge', () => {
  let bridge: MuNodeBridge;
  let graph: Graph;

  beforeEach(() => {
    const setup = createTestGraph();
    graph = setup.graph;
    bridge = new MuNodeBridge(graph);
  });

  // ---- Node listing ----

  describe('nodes', () => {
    it('lists all node names', () => {
      const names = bridge.nodes();
      expect(names).toHaveLength(3);
      expect(names).toContain('source1');
      expect(names).toContain('color1');
      expect(names).toContain('seq1');
    });

    it('returns empty array for empty graph', () => {
      bridge.setGraph(new Graph());
      expect(bridge.nodes()).toEqual([]);
    });
  });

  describe('nodeType', () => {
    it('returns the type of a node', () => {
      expect(bridge.nodeType('source1')).toBe('RVSource');
      expect(bridge.nodeType('color1')).toBe('RVColor');
    });

    it('throws for unknown node', () => {
      expect(() => bridge.nodeType('nope')).toThrow('Node not found');
    });
  });

  describe('nodeExists', () => {
    it('returns true for existing nodes', () => {
      expect(bridge.nodeExists('source1')).toBe(true);
    });

    it('returns false for non-existent nodes', () => {
      expect(bridge.nodeExists('nope')).toBe(false);
    });
  });

  describe('nodesOfType', () => {
    it('finds nodes by type', () => {
      expect(bridge.nodesOfType('RVColor')).toEqual(['color1']);
    });

    it('returns empty array for unknown type', () => {
      expect(bridge.nodesOfType('RVUnknown')).toEqual([]);
    });
  });

  // ---- Node CRUD ----

  describe('newNode', () => {
    it('creates a node of registered type', () => {
      const name = bridge.newNode(TEST_TYPE, 'testNode1');
      expect(name).toBe('testNode1');
      expect(bridge.nodeExists('testNode1')).toBe(true);
      expect(bridge.nodeType('testNode1')).toBe(TEST_TYPE);
    });

    it('creates a node with auto-generated name when no name given', () => {
      const name = bridge.newNode(TEST_TYPE);
      expect(bridge.nodeExists(name)).toBe(true);
    });

    it('throws for unknown type', () => {
      expect(() => bridge.newNode('__NonExistentType__')).toThrow('Unknown node type');
    });
  });

  describe('deleteNode', () => {
    it('removes a node from the graph', () => {
      expect(bridge.nodeExists('color1')).toBe(true);
      bridge.deleteNode('color1');
      expect(bridge.nodeExists('color1')).toBe(false);
    });

    it('throws for non-existent node', () => {
      expect(() => bridge.deleteNode('nope')).toThrow('Node not found');
    });

    it('clears view node if deleted node was the view node', () => {
      bridge.setViewNode('source1');
      expect(bridge.viewNode()).toBe('source1');
      bridge.deleteNode('source1');
      expect(bridge.viewNode()).toBe('');
    });
  });

  // ---- Connections ----

  describe('nodeConnections', () => {
    it('returns inputs and outputs', () => {
      const [inputs, outputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual(['source1']);
      expect(outputs).toEqual(['seq1']);
    });

    it('returns empty arrays for leaf nodes inputs', () => {
      const [inputs] = bridge.nodeConnections('source1');
      expect(inputs).toEqual([]);
    });

    it('throws for unknown node', () => {
      expect(() => bridge.nodeConnections('nope')).toThrow('Node not found');
    });
  });

  describe('setNodeInputs', () => {
    it('replaces node inputs', () => {
      // Create a second source
      const src2 = new TestNode('RVSource', 'source2');
      graph.addNode(src2);

      bridge.setNodeInputs('color1', ['source2']);
      const [inputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual(['source2']);
    });

    it('throws for unknown node', () => {
      expect(() => bridge.setNodeInputs('nope', ['source1'])).toThrow('Node not found');
    });

    it('throws for unknown input node', () => {
      expect(() => bridge.setNodeInputs('color1', ['nope'])).toThrow('Input node not found');
    });

    it('supports setting empty inputs (disconnect all)', () => {
      bridge.setNodeInputs('color1', []);
      const [inputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual([]);
    });
  });

  describe('testNodeInputs', () => {
    it('returns true for valid connections', () => {
      const src2 = new TestNode('RVSource', 'source2');
      graph.addNode(src2);
      expect(bridge.testNodeInputs('color1', ['source2'])).toBe(true);
    });

    it('returns false for connections that would create a cycle', () => {
      // seq1 -> source1 would create: source1 -> color1 -> seq1 -> source1
      expect(bridge.testNodeInputs('source1', ['seq1'])).toBe(false);
    });

    it('returns false for non-existent node', () => {
      expect(bridge.testNodeInputs('nope', ['source1'])).toBe(false);
    });

    it('returns false for non-existent input', () => {
      expect(bridge.testNodeInputs('color1', ['nope'])).toBe(false);
    });
  });

  // ---- Group operations ----

  describe('group operations', () => {
    it('manages group membership', () => {
      const group = new TestNode('RVGroup', 'group1');
      graph.addNode(group);
      bridge.addNodeToGroup('source1', 'group1');
      bridge.addNodeToGroup('color1', 'group1');

      const members = bridge.nodesInGroup('group1');
      expect(members).toHaveLength(2);
      expect(members).toContain('source1');
      expect(members).toContain('color1');
    });

    it('nodeGroup returns parent group name', () => {
      const group = new TestNode('RVGroup', 'group1');
      graph.addNode(group);
      bridge.addNodeToGroup('source1', 'group1');
      expect(bridge.nodeGroup('source1')).toBe('group1');
    });

    it('nodeGroup returns empty string for ungrouped nodes', () => {
      expect(bridge.nodeGroup('source1')).toBe('');
    });

    it('nodesInGroup returns empty for non-group nodes', () => {
      expect(bridge.nodesInGroup('source1')).toEqual([]);
    });

    it('addNodeToGroup throws for unknown nodes', () => {
      expect(() => bridge.addNodeToGroup('nope', 'group1')).toThrow('Node not found');
    });
  });

  // ---- View node management ----

  describe('viewNode / setViewNode', () => {
    it('returns empty string when no view node is set', () => {
      expect(bridge.viewNode()).toBe('');
    });

    it('sets and returns the view node', () => {
      bridge.setViewNode('seq1');
      expect(bridge.viewNode()).toBe('seq1');
    });

    it('throws for non-existent node', () => {
      expect(() => bridge.setViewNode('nope')).toThrow('Node not found');
    });

    it('auto-adds to viewable nodes', () => {
      bridge.setViewNode('seq1');
      expect(bridge.viewNodes()).toContain('seq1');
    });
  });

  describe('viewNodes', () => {
    it('returns empty by default', () => {
      expect(bridge.viewNodes()).toEqual([]);
    });

    it('returns manually added viewable nodes', () => {
      bridge.addViewableNode('source1');
      bridge.addViewableNode('seq1');
      const vn = bridge.viewNodes();
      expect(vn).toHaveLength(2);
      expect(vn).toContain('source1');
      expect(vn).toContain('seq1');
    });

    it('removeViewableNode works', () => {
      bridge.addViewableNode('source1');
      bridge.removeViewableNode('source1');
      expect(bridge.viewNodes()).toEqual([]);
    });
  });

  describe('previousViewNode / nextViewNode', () => {
    it('returns empty when no history', () => {
      expect(bridge.previousViewNode()).toBe('');
      expect(bridge.nextViewNode()).toBe('');
    });

    it('navigates back through history', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      // Current is seq1, history has [source1, color1]
      const prev1 = bridge.previousViewNode();
      expect(prev1).toBe('color1');
      expect(bridge.viewNode()).toBe('color1');
    });

    it('navigates forward through history after going back', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      bridge.previousViewNode(); // -> color1

      const next = bridge.nextViewNode();
      // Should go forward to seq1 or color1's successor
      expect(next).not.toBe('');
      expect(bridge.viewNode()).toBe(next);
    });
  });

  // ---- nodeImageGeometry ----

  describe('nodeImageGeometry', () => {
    it('returns default geometry for nodes without width/height properties', () => {
      const geom = bridge.nodeImageGeometry('source1');
      expect(geom).toEqual({
        width: 0,
        height: 0,
        pixelAspect: 1.0,
        orientation: 'normal',
      });
    });

    it('reads width/height from node properties', () => {
      const node = graph.getAllNodes().find((n) => n.name === 'source1')!;
      node.properties.add({ name: 'width', defaultValue: 1920 });
      node.properties.add({ name: 'height', defaultValue: 1080 });

      const geom = bridge.nodeImageGeometry('source1');
      expect(geom.width).toBe(1920);
      expect(geom.height).toBe(1080);
    });

    it('throws for unknown node', () => {
      expect(() => bridge.nodeImageGeometry('nope')).toThrow('Node not found');
    });
  });

  // ---- setGraph ----

  describe('setGraph', () => {
    it('replaces the graph and resets view state', () => {
      bridge.setViewNode('source1');
      bridge.addViewableNode('color1');

      bridge.setGraph(new Graph());
      expect(bridge.nodes()).toEqual([]);
      expect(bridge.viewNode()).toBe('');
      expect(bridge.viewNodes()).toEqual([]);
    });
  });

  // ---- graph accessor ----

  describe('graph accessor', () => {
    it('returns the underlying graph', () => {
      expect(bridge.graph).toBe(graph);
    });
  });
});
