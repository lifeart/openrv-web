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

    it('traverseGroups=false returns direct connections even when groups exist', () => {
      // Make color1 a group containing source1
      const group = new TestNode('RVGroup', 'group1');
      graph.addNode(group);
      graph.connect(group, graph.getAllNodes().find((n) => n.name === 'seq1')!);
      bridge.addNodeToGroup('source1', 'group1');
      bridge.addNodeToGroup('color1', 'group1');

      // With traverseGroups=false, group1 appears as-is
      const [inputs] = bridge.nodeConnections('seq1', false);
      expect(inputs).toContain('color1');
    });

    it('traverseGroups=true replaces group nodes with their leaf members', () => {
      // Build: source1 -> groupNode -> seq1
      // groupNode contains leafA and leafB
      const groupNode = new TestNode('RVGroup', 'groupNode');
      const leafA = new TestNode('RVSource', 'leafA');
      const leafB = new TestNode('RVSource', 'leafB');
      graph.addNode(groupNode);
      graph.addNode(leafA);
      graph.addNode(leafB);

      // Wire groupNode as input to seq1
      bridge.setNodeInputs('seq1', ['groupNode']);
      // Register leafA and leafB as members of groupNode
      bridge.addNodeToGroup('leafA', 'groupNode');
      bridge.addNodeToGroup('leafB', 'groupNode');

      // traverseGroups=true should resolve groupNode -> [leafA, leafB]
      const [inputs] = bridge.nodeConnections('seq1', true);
      expect(inputs).not.toContain('groupNode');
      expect(inputs).toContain('leafA');
      expect(inputs).toContain('leafB');
    });

    it('traverseGroups=true returns same result as false when no groups in path', () => {
      // source1 -> color1 -> seq1, none are groups
      const [inputsF, outputsF] = bridge.nodeConnections('color1', false);
      const [inputsT, outputsT] = bridge.nodeConnections('color1', true);
      expect(inputsT).toEqual(inputsF);
      expect(outputsT).toEqual(outputsF);
    });

    it('traverseGroups=true preserves duplicate leaf when it appears directly and via group', () => {
      // seq1 has inputs: [leafA, groupNode]
      // groupNode contains leafA
      // With old shared visited set: leafA appears once (second via group is skipped)
      // With per-name visited set: leafA appears twice (once direct, once via group)
      const groupNode = new TestNode('RVGroup', 'groupNode');
      const leafA = new TestNode('RVSource', 'leafA');
      graph.addNode(groupNode);
      graph.addNode(leafA);

      bridge.setNodeInputs('seq1', ['leafA', 'groupNode']);
      bridge.addNodeToGroup('leafA', 'groupNode');

      const [inputs] = bridge.nodeConnections('seq1', true);
      // leafA passes through as-is, groupNode resolves to leafA
      expect(inputs).toEqual(['leafA', 'leafA']);
    });

    it('traverseGroups=true handles nested groups', () => {
      // outerGroup contains innerGroup, innerGroup contains leaf
      const outerGroup = new TestNode('RVGroup', 'outerGroup');
      const innerGroup = new TestNode('RVGroup', 'innerGroup');
      const leaf = new TestNode('RVSource', 'deepLeaf');
      graph.addNode(outerGroup);
      graph.addNode(innerGroup);
      graph.addNode(leaf);

      bridge.setNodeInputs('seq1', ['outerGroup']);
      bridge.addNodeToGroup('innerGroup', 'outerGroup');
      bridge.addNodeToGroup('deepLeaf', 'innerGroup');

      const [inputs] = bridge.nodeConnections('seq1', true);
      expect(inputs).toEqual(['deepLeaf']);
    });

    it('traverseGroups=true resolves groups in the outputs list', () => {
      // source1 -> color1 -> groupOut (group containing leafOut)
      const groupOut = new TestNode('RVGroup', 'groupOut');
      const leafOut = new TestNode('RVSource', 'leafOut');
      graph.addNode(groupOut);
      graph.addNode(leafOut);

      // Wire color1 -> groupOut via setNodeInputs on groupOut
      bridge.setNodeInputs('groupOut', ['color1']);
      bridge.addNodeToGroup('leafOut', 'groupOut');

      const [, outputs] = bridge.nodeConnections('color1', true);
      expect(outputs).not.toContain('groupOut');
      expect(outputs).toContain('leafOut');
    });

    it('traverseGroups=true passes empty group through as leaf', () => {
      const emptyGroup = new TestNode('RVGroup', 'emptyGroup');
      graph.addNode(emptyGroup);

      // Wire emptyGroup as input to seq1
      bridge.setNodeInputs('seq1', ['emptyGroup']);

      const [inputs] = bridge.nodeConnections('seq1', true);
      expect(inputs).toContain('emptyGroup');
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

    it('rolls back to original inputs when a later connection fails', () => {
      // Setup: source1 -> color1 -> seq1 (from beforeEach)
      // Adding extra nodes: src2 is valid, but connecting seq1 -> color1
      // would create a cycle (color1 -> seq1 -> color1).
      const src2 = new TestNode('RVSource', 'source2');
      graph.addNode(src2);

      // Verify original state
      expect(bridge.nodeConnections('color1')[0]).toEqual(['source1']);

      // Try to set inputs to [source2, seq1] — seq1 will cause a cycle
      expect(() => bridge.setNodeInputs('color1', ['source2', 'seq1'])).toThrow('cycle');

      // Original inputs should be restored
      const [inputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual(['source1']);

      // Verify source2 is not left partially connected
      const [, src2Outputs] = bridge.nodeConnections('source2');
      expect(src2Outputs).toEqual([]);
    });

    it('successful rewire replaces all inputs', () => {
      const src2 = new TestNode('RVSource', 'source2');
      const src3 = new TestNode('RVSource', 'source3');
      graph.addNode(src2);
      graph.addNode(src3);

      bridge.setNodeInputs('color1', ['source2', 'source3']);
      const [inputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual(['source2', 'source3']);

      // Original source1 should no longer be an input
      const [, src1Outputs] = bridge.nodeConnections('source1');
      expect(src1Outputs).not.toContain('color1');
    });

    it('rolls back ALL original inputs when a later connection fails (multiple originals)', () => {
      // Setup: connect both source1 AND source2 to color1
      const src2 = new TestNode('RVSource', 'source2');
      const src3 = new TestNode('RVSource', 'source3');
      graph.addNode(src2);
      graph.addNode(src3);
      bridge.setNodeInputs('color1', ['source1', 'source2']);
      expect(bridge.nodeConnections('color1')[0]).toEqual(['source1', 'source2']);

      // Try to rewire to [source3, seq1] — seq1 causes a cycle
      expect(() => bridge.setNodeInputs('color1', ['source3', 'seq1'])).toThrow('cycle');

      // Both original inputs must be restored
      const [inputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual(['source1', 'source2']);

      // source3 should not be left partially connected
      const [, src3Outputs] = bridge.nodeConnections('source3');
      expect(src3Outputs).toEqual([]);
    });

    it('rolls back when the FIRST connection in the new list fails', () => {
      // seq1 is an output of color1 (color1 -> seq1), so connecting
      // seq1 -> color1 creates a cycle.
      expect(() => bridge.setNodeInputs('color1', ['seq1'])).toThrow('cycle');

      // Original inputs should be restored
      const [inputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual(['source1']);
    });

    it('is idempotent when setting the same inputs that already exist', () => {
      // color1 already has source1 as its only input
      bridge.setNodeInputs('color1', ['source1']);

      const [inputs] = bridge.nodeConnections('color1');
      expect(inputs).toEqual(['source1']);

      // source1 should still feed into color1
      const [, src1Outputs] = bridge.nodeConnections('source1');
      expect(src1Outputs).toContain('color1');
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

    it('A→B→C, back returns B, forward returns C', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      expect(bridge.previousViewNode()).toBe('color1');
      expect(bridge.viewNode()).toBe('color1');

      expect(bridge.nextViewNode()).toBe('seq1');
      expect(bridge.viewNode()).toBe('seq1');
    });

    it('A→B→C, back×2 returns A, forward×2 returns C', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      expect(bridge.previousViewNode()).toBe('color1');
      expect(bridge.previousViewNode()).toBe('source1');
      expect(bridge.nextViewNode()).toBe('color1');
      expect(bridge.nextViewNode()).toBe('seq1');
    });

    it('A→B→C, back to B, setViewNode(D) truncates forward history', () => {
      // Add a fourth node for this test
      const d = new TestNode('RVMerge', 'merge1');
      graph.addNode(d);

      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      expect(bridge.previousViewNode()).toBe('color1');

      // Navigate to a new node — forward history (seq1) should be truncated
      bridge.setViewNode('merge1');
      expect(bridge.nextViewNode()).toBe('');
      expect(bridge.viewNode()).toBe('merge1');

      // Can still go back through source1 → color1 → merge1
      expect(bridge.previousViewNode()).toBe('color1');
      expect(bridge.previousViewNode()).toBe('source1');
    });

    it('at beginning, previousViewNode returns empty', () => {
      bridge.setViewNode('source1');
      expect(bridge.previousViewNode()).toBe('');
      expect(bridge.viewNode()).toBe('source1');
    });

    it('at end, nextViewNode returns empty', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      expect(bridge.nextViewNode()).toBe('');
      expect(bridge.viewNode()).toBe('color1');
    });

    it('single node, back returns empty', () => {
      bridge.setViewNode('source1');
      expect(bridge.previousViewNode()).toBe('');
      expect(bridge.nextViewNode()).toBe('');
    });

    it('A→B→C, repeated back→forward zigzag is stable', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      expect(bridge.previousViewNode()).toBe('color1');
      expect(bridge.nextViewNode()).toBe('seq1');
      expect(bridge.previousViewNode()).toBe('color1');
      expect(bridge.nextViewNode()).toBe('seq1');
    });
  });

  describe('deleteNode scrubs _viewHistory', () => {
    it('A→B→C, delete C, previousViewNode returns B, nextViewNode returns empty', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      bridge.deleteNode('seq1');

      expect(bridge.previousViewNode()).toBe('source1');
      // We moved back to source1; forward should be color1 (not deleted C)
      expect(bridge.nextViewNode()).toBe('color1');
      // At end now
      expect(bridge.nextViewNode()).toBe('');
    });

    it('A→B→C, delete B, history is [A, C] and navigation works', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      bridge.deleteNode('color1');

      // Cursor should be at C (index adjusted). Going back should reach A.
      expect(bridge.previousViewNode()).toBe('source1');
      expect(bridge.nextViewNode()).toBe('seq1');
    });

    it('A→B→C, delete C, setViewNode(B) should NOT duplicate B in history', () => {
      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      bridge.deleteNode('seq1');

      // After deleting C, history is [A, B] with cursor at B.
      // setViewNode('B') should be a no-op (early return guard).
      bridge.setViewNode('color1');

      expect(bridge.previousViewNode()).toBe('source1');
      // No duplicate B, so forward from A should be B only
      expect(bridge.nextViewNode()).toBe('color1');
      // At end now
      expect(bridge.nextViewNode()).toBe('');
    });

    it('A→B→C, delete C, setViewNode(D), previousViewNode returns B', () => {
      const d = new TestNode('RVMerge', 'merge1');
      graph.addNode(d);

      bridge.setViewNode('source1');
      bridge.setViewNode('color1');
      bridge.setViewNode('seq1');

      bridge.deleteNode('seq1');

      bridge.setViewNode('merge1');
      expect(bridge.previousViewNode()).toBe('color1');
      expect(bridge.previousViewNode()).toBe('source1');
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
