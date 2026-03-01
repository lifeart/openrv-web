/**
 * SessionManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionManager } from './SessionManager';
import type { SessionManagerHost } from './SessionManager';
import { Graph } from '../graph/Graph';
import { IPNode } from '../../nodes/base/IPNode';
import { getNodeIdCounter } from '../../nodes/base/IPNode';
import { BaseGroupNode } from '../../nodes/groups/BaseGroupNode';
import { NodeFactory } from '../../nodes/base/NodeFactory';
import { IPImage } from '../image/Image';
import type { EvalContext } from '../graph/Graph';
import type { SerializedGraph } from './SessionManagerTypes';

// --- Test node implementations ---

class TestSourceNode extends IPNode {
  constructor(name?: string) {
    super('TestSource', name);
  }
  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

class TestGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('TestGroup', name ?? 'TestGroup');
  }
  getActiveInputIndex(): number {
    return 0;
  }
}

// Register test types in NodeFactory
NodeFactory.register('TestSource', () => new TestSourceNode());
NodeFactory.register('TestGroup', () => new TestGroupNode());

// Helper to create a host
function createHost(graph: Graph | null): SessionManagerHost {
  return {
    getGraph: () => graph,
  };
}

// Helper to flush microtasks
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>(resolve => queueMicrotask(resolve));
}

describe('SessionManager', () => {
  let manager: SessionManager;
  let graph: Graph;
  let host: SessionManagerHost;

  beforeEach(() => {
    graph = new Graph();
    host = createHost(graph);
    manager = new SessionManager();
    manager.setHost(host);
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('lifecycle', () => {
    it('setHost subscribes to graph signals', async () => {
      const spy = vi.fn();
      manager.on('graphStructureChanged', spy);

      const node = new TestSourceNode('s1');
      graph.addNode(node);

      await flushMicrotasks();
      expect(spy).toHaveBeenCalled();
    });

    it('dispose clears all state', () => {
      const node = new TestSourceNode('s1');
      graph.addNode(node);
      manager.setViewNode(node.id);

      manager.dispose();

      expect(manager.getViewNodeId()).toBeNull();
      expect(manager.canGoBack).toBe(false);
      expect(manager.canGoForward).toBe(false);
    });

    it('onGraphCleared resets state and emits events', () => {
      const node = new TestSourceNode('s1');
      graph.addNode(node);
      manager.setViewNode(node.id);

      const structureSpy = vi.fn();
      const historySpy = vi.fn();
      manager.on('graphStructureChanged', structureSpy);
      manager.on('viewHistoryChanged', historySpy);

      manager.onGraphCleared();

      expect(manager.getViewNodeId()).toBeNull();
      expect(structureSpy).toHaveBeenCalled();
      expect(historySpy).toHaveBeenCalledWith({
        canGoBack: false,
        canGoForward: false,
      });
    });

    it('onGraphCreated re-subscribes to new graph', async () => {
      // Clear the old graph subscriptions
      manager.onGraphCleared();

      // Create a new graph and re-subscribe
      const newGraph = new Graph();
      const newHost = createHost(newGraph);
      manager.setHost(newHost);
      manager.onGraphCreated();

      const spy = vi.fn();
      manager.on('graphStructureChanged', spy);

      const node = new TestSourceNode('s1');
      newGraph.addNode(node);

      await flushMicrotasks();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('view node', () => {
    it('setViewNode updates the view node ID', () => {
      const node = new TestSourceNode('s1');
      graph.addNode(node);

      manager.setViewNode(node.id);

      expect(manager.getViewNodeId()).toBe(node.id);
    });

    it('setViewNode emits viewNodeChanged', () => {
      const node = new TestSourceNode('s1');
      graph.addNode(node);

      const spy = vi.fn();
      manager.on('viewNodeChanged', spy);

      manager.setViewNode(node.id);

      expect(spy).toHaveBeenCalledWith({ nodeId: node.id });
    });

    it('setViewNode pushes to history', () => {
      const node1 = new TestSourceNode('s1');
      const node2 = new TestSourceNode('s2');
      graph.addNode(node1);
      graph.addNode(node2);

      manager.setViewNode(node1.id);
      manager.setViewNode(node2.id);

      expect(manager.canGoBack).toBe(true);
    });

    it('setViewNode ignores non-existent nodes', () => {
      manager.setViewNode('non-existent');
      expect(manager.getViewNodeId()).toBeNull();
    });

    it('setViewNode does nothing when graph is null', () => {
      const nullManager = new SessionManager();
      nullManager.setHost(createHost(null));

      nullManager.setViewNode('any');
      expect(nullManager.getViewNodeId()).toBeNull();
      nullManager.dispose();
    });
  });

  describe('view history', () => {
    it('goBack navigates to the previous view node', () => {
      const node1 = new TestSourceNode('s1');
      const node2 = new TestSourceNode('s2');
      graph.addNode(node1);
      graph.addNode(node2);

      manager.setViewNode(node1.id);
      manager.setViewNode(node2.id);

      manager.goBack();

      expect(manager.getViewNodeId()).toBe(node1.id);
    });

    it('goForward navigates to the next view node', () => {
      const node1 = new TestSourceNode('s1');
      const node2 = new TestSourceNode('s2');
      graph.addNode(node1);
      graph.addNode(node2);

      manager.setViewNode(node1.id);
      manager.setViewNode(node2.id);
      manager.goBack();
      manager.goForward();

      expect(manager.getViewNodeId()).toBe(node2.id);
    });

    it('goBack does nothing when at the beginning', () => {
      const node = new TestSourceNode('s1');
      graph.addNode(node);
      manager.setViewNode(node.id);

      const spy = vi.fn();
      manager.on('viewNodeChanged', spy);

      manager.goBack();

      expect(spy).not.toHaveBeenCalled();
      expect(manager.getViewNodeId()).toBe(node.id);
    });

    it('goForward does nothing when at the end', () => {
      const node = new TestSourceNode('s1');
      graph.addNode(node);
      manager.setViewNode(node.id);

      const spy = vi.fn();
      manager.on('viewNodeChanged', spy);

      manager.goForward();

      expect(spy).not.toHaveBeenCalled();
    });

    it('emits viewHistoryChanged with correct state', () => {
      const node1 = new TestSourceNode('s1');
      const node2 = new TestSourceNode('s2');
      graph.addNode(node1);
      graph.addNode(node2);

      const spy = vi.fn();
      manager.on('viewHistoryChanged', spy);

      manager.setViewNode(node1.id);
      expect(spy).toHaveBeenLastCalledWith({
        canGoBack: false,
        canGoForward: false,
      });

      manager.setViewNode(node2.id);
      expect(spy).toHaveBeenLastCalledWith({
        canGoBack: true,
        canGoForward: false,
      });

      manager.goBack();
      expect(spy).toHaveBeenLastCalledWith({
        canGoBack: false,
        canGoForward: true,
      });
    });
  });

  describe('graph mutations', () => {
    describe('addSourceToGroup', () => {
      it('connects a source to a group', () => {
        const source = new TestSourceNode('s1');
        const group = new TestGroupNode('g1');
        graph.addNode(source);
        graph.addNode(group);

        manager.addSourceToGroup(source.id, group.id);

        expect(group.inputs).toContain(source);
      });

      it('adds source at specific index', () => {
        const s1 = new TestSourceNode('s1');
        const s2 = new TestSourceNode('s2');
        const s3 = new TestSourceNode('s3');
        const group = new TestGroupNode('g');
        graph.addNode(s1);
        graph.addNode(s2);
        graph.addNode(s3);
        graph.addNode(group);
        graph.connect(s1, group);
        graph.connect(s2, group);

        manager.addSourceToGroup(s3.id, group.id, 0);

        expect(group.inputs[0]).toBe(s3);
        expect(group.inputs[1]).toBe(s1);
        expect(group.inputs[2]).toBe(s2);
      });
    });

    describe('removeSourceFromGroup', () => {
      it('disconnects a source from a group', () => {
        const source = new TestSourceNode('s1');
        const group = new TestGroupNode('g1');
        graph.addNode(source);
        graph.addNode(group);
        graph.connect(source, group);

        manager.removeSourceFromGroup(source.id, group.id);

        expect(group.inputCount).toBe(0);
      });
    });

    describe('reorderGroupInput', () => {
      it('reorders inputs within a group', () => {
        const s1 = new TestSourceNode('s1');
        const s2 = new TestSourceNode('s2');
        const s3 = new TestSourceNode('s3');
        const group = new TestGroupNode('g');
        graph.addNode(s1);
        graph.addNode(s2);
        graph.addNode(s3);
        graph.addNode(group);
        graph.connect(s1, group);
        graph.connect(s2, group);
        graph.connect(s3, group);

        manager.reorderGroupInput(group.id, 0, 2);

        expect(group.inputs[0]).toBe(s2);
        expect(group.inputs[1]).toBe(s3);
        expect(group.inputs[2]).toBe(s1);
      });
    });

    describe('createGroup', () => {
      it('creates a new group with inputs', () => {
        const s1 = new TestSourceNode('s1');
        const s2 = new TestSourceNode('s2');
        graph.addNode(s1);
        graph.addNode(s2);

        const group = manager.createGroup('TestGroup' as any, [s1.id, s2.id]);

        expect(group).not.toBeNull();
        expect(group!.type).toBe('TestGroup');
        expect(group!.inputCount).toBe(2);
      });

      it('returns null for unknown group type', () => {
        const group = manager.createGroup('NonExistent' as any, []);
        expect(group).toBeNull();
      });

      it('returns null when graph is null', () => {
        const nullManager = new SessionManager();
        nullManager.setHost(createHost(null));

        const group = nullManager.createGroup('TestGroup' as any, []);
        expect(group).toBeNull();
        nullManager.dispose();
      });
    });

    describe('deleteNode', () => {
      it('deletes a source node', () => {
        const source = new TestSourceNode('s1');
        graph.addNode(source);

        manager.deleteNode(source.id, 'orphan');

        expect(graph.getNode(source.id)).toBeUndefined();
      });

      it('deletes a group with cascade delete-children', () => {
        const s1 = new TestSourceNode('s1');
        const s2 = new TestSourceNode('s2');
        const group = new TestGroupNode('g');
        graph.addNode(s1);
        graph.addNode(s2);
        graph.addNode(group);
        graph.connect(s1, group);
        graph.connect(s2, group);

        manager.deleteNode(group.id, 'delete-children');

        expect(graph.getAllNodes()).toHaveLength(0);
      });

      it('deletes a group with reparent mode', () => {
        const s1 = new TestSourceNode('s1');
        const child = new TestGroupNode('child');
        const parent = new TestGroupNode('parent');
        graph.addNode(s1);
        graph.addNode(child);
        graph.addNode(parent);
        graph.connect(s1, child);
        graph.connect(child, parent);

        manager.deleteNode(child.id, 'reparent');

        // s1 should now be connected to parent
        expect(parent.inputs).toContain(s1);
        expect(graph.getNode(child.id)).toBeUndefined();
      });

      it('deletes a group with orphan mode', () => {
        const s1 = new TestSourceNode('s1');
        const group = new TestGroupNode('g');
        graph.addNode(s1);
        graph.addNode(group);
        graph.connect(s1, group);

        manager.deleteNode(group.id, 'orphan');

        // s1 should still exist but disconnected
        expect(graph.getNode(s1.id)).toBeDefined();
        expect(s1.outputs).toHaveLength(0);
      });

      it('clears view node when deleting the viewed node', () => {
        const node = new TestSourceNode('s1');
        graph.addNode(node);
        manager.setViewNode(node.id);

        manager.deleteNode(node.id, 'orphan');

        expect(manager.getViewNodeId()).toBeNull();
      });

      it('removes deleted node from view history', () => {
        const node1 = new TestSourceNode('s1');
        const node2 = new TestSourceNode('s2');
        graph.addNode(node1);
        graph.addNode(node2);

        manager.setViewNode(node1.id);
        manager.setViewNode(node2.id);

        manager.deleteNode(node1.id, 'orphan');

        manager.goBack();
        // Should not navigate to deleted node
        expect(manager.getViewNodeId()).toBe(node2.id);
      });
    });

    describe('renameNode', () => {
      it('renames a node', () => {
        const node = new TestSourceNode('original');
        graph.addNode(node);

        manager.renameNode(node.id, 'renamed');

        expect(node.name).toBe('renamed');
      });

      it('emits graphStructureChanged', async () => {
        const node = new TestSourceNode('s1');
        graph.addNode(node);

        await flushMicrotasks(); // flush the addNode signal

        const spy = vi.fn();
        manager.on('graphStructureChanged', spy);

        manager.renameNode(node.id, 'new name');

        await flushMicrotasks();
        expect(spy).toHaveBeenCalled();
      });
    });
  });

  describe('tree model', () => {
    it('returns empty array for null graph', () => {
      const nullManager = new SessionManager();
      nullManager.setHost(createHost(null));

      expect(nullManager.getTreeModel()).toEqual([]);
      nullManager.dispose();
    });

    it('returns empty array for empty graph', () => {
      expect(manager.getTreeModel()).toEqual([]);
    });

    it('returns single source as root', () => {
      const source = new TestSourceNode('img.exr');
      graph.addNode(source);

      const tree = manager.getTreeModel();

      expect(tree).toHaveLength(1);
      expect(tree[0]!.id).toBe(source.id);
      expect(tree[0]!.name).toBe('img.exr');
      expect(tree[0]!.isGroup).toBe(false);
      expect(tree[0]!.children).toHaveLength(0);
      expect(tree[0]!.depth).toBe(0);
    });

    it('returns group with children', () => {
      const s1 = new TestSourceNode('s1');
      const s2 = new TestSourceNode('s2');
      const group = new TestGroupNode('seq');
      graph.addNode(s1);
      graph.addNode(s2);
      graph.addNode(group);
      graph.connect(s1, group);
      graph.connect(s2, group);

      const tree = manager.getTreeModel();

      expect(tree).toHaveLength(1);
      const root = tree[0]!;
      expect(root.id).toBe(group.id);
      expect(root.isGroup).toBe(true);
      expect(root.children).toHaveLength(2);
      expect(root.children[0]!.id).toBe(s1.id);
      expect(root.children[0]!.depth).toBe(1);
      expect(root.children[1]!.id).toBe(s2.id);
    });

    it('marks the view node', () => {
      const s1 = new TestSourceNode('s1');
      const s2 = new TestSourceNode('s2');
      graph.addNode(s1);
      graph.addNode(s2);

      manager.setViewNode(s1.id);

      const tree = manager.getTreeModel();
      const viewNode = tree.find(n => n.id === s1.id);
      const otherNode = tree.find(n => n.id === s2.id);

      expect(viewNode!.isViewNode).toBe(true);
      expect(otherNode!.isViewNode).toBe(false);
    });

    it('includes disconnected components', () => {
      const s1 = new TestSourceNode('s1');
      const s2 = new TestSourceNode('s2');
      const group = new TestGroupNode('g');
      graph.addNode(s1);
      graph.addNode(s2);
      graph.addNode(group);
      graph.connect(s1, group);
      // s2 is not connected to anything

      const tree = manager.getTreeModel();

      // Should have the group tree and the orphan s2
      expect(tree).toHaveLength(2);
      const ids = tree.map(n => n.id);
      expect(ids).toContain(group.id);
      expect(ids).toContain(s2.id);
    });

    it('handles nested groups', () => {
      const s1 = new TestSourceNode('s1');
      const innerGroup = new TestGroupNode('inner');
      const outerGroup = new TestGroupNode('outer');
      graph.addNode(s1);
      graph.addNode(innerGroup);
      graph.addNode(outerGroup);
      graph.connect(s1, innerGroup);
      graph.connect(innerGroup, outerGroup);

      const tree = manager.getTreeModel();

      expect(tree).toHaveLength(1);
      expect(tree[0]!.id).toBe(outerGroup.id);
      expect(tree[0]!.depth).toBe(0);
      expect(tree[0]!.children).toHaveLength(1);
      expect(tree[0]!.children[0]!.id).toBe(innerGroup.id);
      expect(tree[0]!.children[0]!.depth).toBe(1);
      expect(tree[0]!.children[0]!.children).toHaveLength(1);
      expect(tree[0]!.children[0]!.children[0]!.id).toBe(s1.id);
      expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
    });
  });

  describe('serialization', () => {
    it('toSerializedGraph returns null for null graph', () => {
      const nullManager = new SessionManager();
      nullManager.setHost(createHost(null));

      expect(nullManager.toSerializedGraph()).toBeNull();
      nullManager.dispose();
    });

    it('serializes an empty graph', () => {
      const result = manager.toSerializedGraph();

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.nodes).toEqual([]);
      expect(result!.outputNodeId).toBeNull();
      expect(result!.viewNodeId).toBeNull();
    });

    it('serializes a graph with nodes and connections', () => {
      const s1 = new TestSourceNode('s1');
      const s2 = new TestSourceNode('s2');
      const group = new TestGroupNode('seq');
      graph.addNode(s1);
      graph.addNode(s2);
      graph.addNode(group);
      graph.connect(s1, group);
      graph.connect(s2, group);
      graph.setOutputNode(group);
      manager.setViewNode(s1.id);

      const result = manager.toSerializedGraph();

      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(3);
      expect(result!.outputNodeId).toBe(group.id);
      expect(result!.viewNodeId).toBe(s1.id);

      const groupSerialized = result!.nodes.find(n => n.id === group.id);
      expect(groupSerialized!.inputIds).toEqual([s1.id, s2.id]);
    });

    it('uses toPersistentJSON for properties', () => {
      const node = new TestSourceNode('s1');
      // Add a persistent and non-persistent property
      node.properties.add({ name: 'persistent_prop', defaultValue: 42, persistent: true });
      node.properties.add({ name: 'transient_prop', defaultValue: 'temp' });
      graph.addNode(node);

      const result = manager.toSerializedGraph();
      const serialized = result!.nodes.find(n => n.id === node.id);

      expect(serialized!.properties).toHaveProperty('persistent_prop');
      expect(serialized!.properties).not.toHaveProperty('transient_prop');
    });

    it('round-trips serialization', () => {
      const s1 = new TestSourceNode('s1');
      const s2 = new TestSourceNode('s2');
      const group = new TestGroupNode('seq');
      graph.addNode(s1);
      graph.addNode(s2);
      graph.addNode(group);
      graph.connect(s1, group);
      graph.connect(s2, group);
      graph.setOutputNode(group);
      manager.setViewNode(group.id);

      const serialized = manager.toSerializedGraph()!;

      // Clear and restore
      const newGraph = new Graph();
      const newManager = new SessionManager();
      newManager.setHost(createHost(newGraph));

      newManager.fromSerializedGraph(serialized);

      const reserialized = newManager.toSerializedGraph()!;

      expect(reserialized.nodes).toHaveLength(3);
      expect(reserialized.outputNodeId).not.toBeNull();
      expect(reserialized.viewNodeId).not.toBeNull();

      // Verify connections are preserved
      const groupNode = reserialized.nodes.find(n => n.type === 'TestGroup');
      expect(groupNode!.inputIds).toHaveLength(2);

      newManager.dispose();
    });

    it('handles unknown node types gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const data: SerializedGraph = {
        version: 1,
        nodes: [
          { id: 'unknown_1', type: 'UnknownType', name: 'Unknown', properties: {}, inputIds: [] },
          { id: 'source_1', type: 'TestSource', name: 's1', properties: {}, inputIds: [] },
        ],
        outputNodeId: null,
        viewNodeId: null,
      };

      manager.fromSerializedGraph(data);

      expect(graph.getAllNodes()).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('handles dangling input references gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const data: SerializedGraph = {
        version: 1,
        nodes: [
          { id: 'group_1', type: 'TestGroup', name: 'g', properties: {}, inputIds: ['missing_node'] },
        ],
        outputNodeId: null,
        viewNodeId: null,
      };

      manager.fromSerializedGraph(data);

      const group = graph.getAllNodes()[0]!;
      expect(group.inputCount).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('resets node ID counter after deserialization', () => {
      const data: SerializedGraph = {
        version: 1,
        nodes: [
          { id: 'TestSource_100', type: 'TestSource', name: 's1', properties: {}, inputIds: [] },
        ],
        outputNodeId: null,
        viewNodeId: null,
      };

      manager.fromSerializedGraph(data);

      expect(getNodeIdCounter()).toBeGreaterThanOrEqual(100);

      // Creating a new node should not collide
      const newNode = new TestSourceNode('new');
      expect(newNode.id).not.toBe('TestSource_100');
    });

    it('restores view node ID', () => {
      const data: SerializedGraph = {
        version: 1,
        nodes: [
          { id: 'TestSource_1', type: 'TestSource', name: 's1', properties: {}, inputIds: [] },
        ],
        outputNodeId: null,
        viewNodeId: 'TestSource_1',
      };

      manager.fromSerializedGraph(data);

      expect(manager.getViewNodeId()).toBe('TestSource_1');
    });

    it('ignores viewNodeId if node does not exist', () => {
      const data: SerializedGraph = {
        version: 1,
        nodes: [
          { id: 'TestSource_1', type: 'TestSource', name: 's1', properties: {}, inputIds: [] },
        ],
        outputNodeId: null,
        viewNodeId: 'NonExistent_99',
      };

      manager.fromSerializedGraph(data);

      expect(manager.getViewNodeId()).toBeNull();
    });
  });

  describe('structure change debouncing', () => {
    it('batches multiple rapid structure changes into one emission', async () => {
      const spy = vi.fn();
      manager.on('graphStructureChanged', spy);

      const s1 = new TestSourceNode('s1');
      const s2 = new TestSourceNode('s2');
      const s3 = new TestSourceNode('s3');

      // Rapid-fire additions
      graph.addNode(s1);
      graph.addNode(s2);
      graph.addNode(s3);

      // Should be debounced -- not called yet synchronously
      expect(spy).not.toHaveBeenCalled();

      await flushMicrotasks();

      // Should have been called exactly once after debounce
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('signal subscription lifecycle', () => {
    it('unsubscribes from graph signals on dispose', async () => {
      const spy = vi.fn();
      manager.on('graphStructureChanged', spy);

      manager.dispose();

      const node = new TestSourceNode('s1');
      graph.addNode(node);

      await flushMicrotasks();
      expect(spy).not.toHaveBeenCalled();
    });

    it('unsubscribes from old graph on onGraphCleared', async () => {
      const spy = vi.fn();
      manager.on('graphStructureChanged', spy);

      manager.onGraphCleared();
      spy.mockClear(); // Clear the emission from onGraphCleared itself

      const node = new TestSourceNode('s1');
      graph.addNode(node);

      await flushMicrotasks();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
