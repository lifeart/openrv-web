/**
 * SessionManager - Central orchestrator for graph mutations,
 * view history, tree model, and media-graph bridge.
 *
 * Sits between the UI panel and the core SessionGraph, providing
 * a safe, validated API for graph mutations and maintaining the
 * view history stack. Follows the existing setHost() callback pattern
 * used by other session services.
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import { ViewHistory } from './ViewHistory';
import type {
  TreeNode,
  SerializedGraph,
  SerializedGraphNode,
  GroupNodeType,
} from './SessionManagerTypes';
import type { Graph } from '../graph/Graph';
import type { IPNode } from '../../nodes/base/IPNode';
import { resetNodeIdCounter } from '../../nodes/base/IPNode';
import { NodeFactory } from '../../nodes/base/NodeFactory';
import { BaseGroupNode } from '../../nodes/groups/BaseGroupNode';

export interface SessionManagerEvents extends EventMap {
  viewNodeChanged: { nodeId: string };
  graphStructureChanged: void;
  viewHistoryChanged: { canGoBack: boolean; canGoForward: boolean };
}

export interface SessionManagerHost {
  /** Get the current graph (may be null) */
  getGraph(): Graph | null;
}

export class SessionManager extends EventEmitter<SessionManagerEvents> {
  private _host: SessionManagerHost | null = null;
  private _viewHistory = new ViewHistory();
  private _viewNodeId: string | null = null;
  private _signalUnsubscribers: (() => void)[] = [];
  private _structureChangePending = false;

  // --- Lifecycle ---

  setHost(host: SessionManagerHost): void {
    this._host = host;
    this._subscribeToGraph();
  }

  /**
   * Called when the graph is cleared (e.g., when loading a new file).
   * Disconnects signal subscriptions, clears state, and emits events
   * so the UI shows the empty state.
   */
  onGraphCleared(): void {
    this._unsubscribeAll();
    this._viewHistory.clear();
    this._viewNodeId = null;
    this.emit('graphStructureChanged', undefined);
    this.emit('viewHistoryChanged', {
      canGoBack: false,
      canGoForward: false,
    });
  }

  /**
   * Called after a new graph is created (e.g., after GTO import or
   * deserialization). Re-subscribes to the new graph's signals.
   */
  onGraphCreated(): void {
    this._subscribeToGraph();
  }

  /**
   * Disconnect all Signal subscriptions to prevent memory leaks.
   */
  dispose(): void {
    this._unsubscribeAll();
    this._viewHistory.clear();
    this._viewNodeId = null;
    this._host = null;
    this.removeAllListeners();
  }

  // --- View Node (independent of graph output) ---

  /**
   * Sets the node to view/evaluate. Does NOT change graph.outputNode.
   * Pushes the node onto the view history stack.
   */
  setViewNode(nodeId: string): void {
    const graph = this._host?.getGraph();
    if (!graph) return;

    const node = graph.getNode(nodeId);
    if (!node) return;

    this._viewNodeId = nodeId;

    this._viewHistory.push({
      nodeId,
      timestamp: Date.now(),
    });

    this.emit('viewNodeChanged', { nodeId });
    this.emit('viewHistoryChanged', {
      canGoBack: this._viewHistory.canGoBack,
      canGoForward: this._viewHistory.canGoForward,
    });
  }

  getViewNodeId(): string | null {
    return this._viewNodeId;
  }

  // --- View History ---

  goBack(): void {
    const entry = this._viewHistory.back();
    if (entry) {
      this._viewNodeId = entry.nodeId;
      this.emit('viewNodeChanged', { nodeId: entry.nodeId });
      this.emit('viewHistoryChanged', {
        canGoBack: this._viewHistory.canGoBack,
        canGoForward: this._viewHistory.canGoForward,
      });
    }
  }

  goForward(): void {
    const entry = this._viewHistory.forward();
    if (entry) {
      this._viewNodeId = entry.nodeId;
      this.emit('viewNodeChanged', { nodeId: entry.nodeId });
      this.emit('viewHistoryChanged', {
        canGoBack: this._viewHistory.canGoBack,
        canGoForward: this._viewHistory.canGoForward,
      });
    }
  }

  get canGoBack(): boolean {
    return this._viewHistory.canGoBack;
  }

  get canGoForward(): boolean {
    return this._viewHistory.canGoForward;
  }

  // --- Graph Mutation API ---

  /**
   * Add a source node as an input to a group node at the specified index.
   * If no index is specified, appends to the end.
   */
  addSourceToGroup(sourceNodeId: string, groupNodeId: string, index?: number): void {
    const graph = this._host?.getGraph();
    if (!graph) return;

    const sourceNode = graph.getNode(sourceNodeId);
    const groupNode = graph.getNode(groupNodeId);
    if (!sourceNode || !groupNode) return;

    graph.connect(sourceNode, groupNode);

    // If index is specified and differs from the default (last), reorder
    if (index !== undefined && index < groupNode.inputCount - 1) {
      groupNode.reorderInput(groupNode.inputCount - 1, index);
    }
  }

  /**
   * Remove a source node from a group node's inputs.
   */
  removeSourceFromGroup(sourceNodeId: string, groupNodeId: string): void {
    const graph = this._host?.getGraph();
    if (!graph) return;

    const sourceNode = graph.getNode(sourceNodeId);
    const groupNode = graph.getNode(groupNodeId);
    if (!sourceNode || !groupNode) return;

    graph.disconnect(sourceNode, groupNode);
  }

  /**
   * Reorder an input within a group node from one index to another.
   */
  reorderGroupInput(groupNodeId: string, fromIndex: number, toIndex: number): void {
    const graph = this._host?.getGraph();
    if (!graph) return;

    graph.reorderInput(groupNodeId, fromIndex, toIndex);
  }

  /**
   * Create a new group node of the specified type, add input nodes to it,
   * and add it to the graph. Returns the new group node.
   */
  createGroup(type: GroupNodeType, inputNodeIds: string[]): IPNode | null {
    const graph = this._host?.getGraph();
    if (!graph) return null;

    const groupNode = NodeFactory.create(type);
    if (!groupNode) return null;

    graph.addNode(groupNode);

    for (const inputId of inputNodeIds) {
      const inputNode = graph.getNode(inputId);
      if (inputNode) {
        graph.connect(inputNode, groupNode);
      }
    }

    return groupNode;
  }

  /**
   * Delete a node from the graph.
   * - If the node is a source: disconnects from parent group(s) and removes.
   * - If the node is a group: behavior depends on cascadeMode:
   *   (a) 'delete-children': delete group and all children recursively.
   *   (b) 'reparent': re-parent children to the group's parent(s).
   *   (c) 'orphan': disconnect children, leaving them as independent roots.
   */
  deleteNode(nodeId: string, cascadeMode: 'delete-children' | 'reparent' | 'orphan'): void {
    const graph = this._host?.getGraph();
    if (!graph) return;

    const node = graph.getNode(nodeId);
    if (!node) return;

    const isGroup = node instanceof BaseGroupNode;

    if (isGroup && cascadeMode === 'delete-children') {
      // Recursively delete all children first
      const children = [...node.inputs];
      for (const child of children) {
        this.deleteNode(child.id, 'delete-children');
      }
    } else if (isGroup && cascadeMode === 'reparent') {
      // Re-parent children to this node's parents
      const parents = [...node.outputs];
      const children = [...node.inputs];

      for (const parent of parents) {
        for (const child of children) {
          try {
            graph.connect(child, parent);
          } catch {
            // Cycle detection may prevent some re-parenting
          }
        }
      }
    }
    // For 'orphan' mode, children are automatically disconnected by removeNode

    // Clean up view history references
    this._viewHistory.removeNodeEntries(nodeId);
    if (this._viewNodeId === nodeId) {
      this._viewNodeId = null;
    }

    graph.removeNode(nodeId);
  }

  /**
   * Rename a node in the graph.
   */
  renameNode(nodeId: string, name: string): void {
    const graph = this._host?.getGraph();
    if (!graph) return;

    const node = graph.getNode(nodeId);
    if (!node) return;

    node.name = name;
    // Emit structure changed so the tree re-renders with the new name
    this._emitStructureChanged();
  }

  // --- Tree Model ---

  /**
   * Returns a tree of all connected components in the graph.
   * Includes orphan nodes not reachable from the output node.
   * Root nodes are those with no outputs (no parents).
   */
  getTreeModel(): TreeNode[] {
    const graph = this._host?.getGraph();
    if (!graph) return [];

    const allNodes = graph.getAllNodes();
    if (allNodes.length === 0) return [];

    // Find root nodes (no outputs / no parents)
    const rootNodes = allNodes.filter(n => n.outputs.length === 0);

    // If no root nodes found (all nodes are connected), use the output node
    // or fall back to all nodes
    if (rootNodes.length === 0) {
      const outputNode = graph.getOutputNode();
      if (outputNode) {
        rootNodes.push(outputNode);
      } else {
        // Fallback: treat all nodes as roots
        return allNodes.map(n => this._buildTreeNode(n, 0, new Set()));
      }
    }

    const visited = new Set<string>();
    const trees: TreeNode[] = [];

    for (const root of rootNodes) {
      if (!visited.has(root.id)) {
        trees.push(this._buildTreeNode(root, 0, visited));
      }
    }

    // Include any orphan nodes not reachable from root nodes
    for (const node of allNodes) {
      if (!visited.has(node.id)) {
        trees.push(this._buildTreeNode(node, 0, visited));
      }
    }

    return trees;
  }

  // --- Serialization ---

  /**
   * Serialize the current graph state for .orvproject persistence.
   * Wraps Graph.toJSON() with additional metadata (version, viewNodeId).
   */
  toSerializedGraph(): SerializedGraph | null {
    const graph = this._host?.getGraph();
    if (!graph) return null;

    const allNodes = graph.getAllNodes();
    const outputNode = graph.getOutputNode();

    const nodes: SerializedGraphNode[] = allNodes.map(node => ({
      id: node.id,
      type: node.type,
      name: node.name,
      properties: node.properties.toPersistentJSON(),
      inputIds: node.inputs.map(input => input.id),
    }));

    return {
      version: 1,
      nodes,
      outputNodeId: outputNode?.id ?? null,
      viewNodeId: this._viewNodeId,
    };
  }

  /**
   * Restore graph state from serialized data.
   * Creates nodes via NodeFactory, restores connections, and resets
   * the node ID counter to prevent collisions.
   */
  fromSerializedGraph(data: SerializedGraph): void {
    const graph = this._host?.getGraph();
    if (!graph) return;

    // Clear existing graph
    graph.clear();

    const warnings: string[] = [];
    const nodeMap = new Map<string, IPNode>();

    // Track the maximum numeric suffix for ID counter reset
    let maxIdSuffix = 0;

    // Phase 1: Create all nodes
    for (const serializedNode of data.nodes) {
      const node = NodeFactory.create(serializedNode.type);
      if (!node) {
        warnings.push(`Unknown node type "${serializedNode.type}" (id: ${serializedNode.id}), skipping`);
        continue;
      }

      // Override the auto-generated ID with the serialized one.
      // This is a controlled operation during deserialization only.
      (node as { id: string }).id = serializedNode.id;
      node.name = serializedNode.name;

      // Restore persistent properties
      if (serializedNode.properties && Object.keys(serializedNode.properties).length > 0) {
        node.properties.fromJSON(serializedNode.properties);
      }

      graph.addNode(node);
      nodeMap.set(serializedNode.id, node);

      // Track max ID suffix for counter reset
      const match = serializedNode.id.match(/_(\d+)$/);
      if (match) {
        maxIdSuffix = Math.max(maxIdSuffix, parseInt(match[1]!, 10));
      }
    }

    // Phase 2: Restore connections (order matters for group nodes)
    for (const serializedNode of data.nodes) {
      const node = nodeMap.get(serializedNode.id);
      if (!node) continue;

      for (const inputId of serializedNode.inputIds) {
        const inputNode = nodeMap.get(inputId);
        if (!inputNode) {
          warnings.push(`Dangling input reference "${inputId}" in node "${serializedNode.id}", skipping`);
          continue;
        }
        try {
          graph.connect(inputNode, node);
        } catch (err) {
          warnings.push(`Failed to connect "${inputId}" -> "${serializedNode.id}": ${err}`);
        }
      }
    }

    // Phase 3: Restore output node
    if (data.outputNodeId) {
      const outputNode = nodeMap.get(data.outputNodeId);
      if (outputNode) {
        graph.setOutputNode(outputNode);
      }
    }

    // Phase 4: Restore view node
    if (data.viewNodeId && nodeMap.has(data.viewNodeId)) {
      this._viewNodeId = data.viewNodeId;
    }

    // Phase 5: Reset node ID counter to prevent collisions
    resetNodeIdCounter(maxIdSuffix);

    // Log warnings
    for (const warning of warnings) {
      console.warn(`[SessionManager] ${warning}`);
    }

    this._emitStructureChanged();
  }

  // --- Private helpers ---

  private _buildTreeNode(node: IPNode, depth: number, visited: Set<string>): TreeNode {
    visited.add(node.id);

    const isGroup = node instanceof BaseGroupNode;
    const children: TreeNode[] = [];

    if (isGroup) {
      for (const input of node.inputs) {
        if (!visited.has(input.id)) {
          children.push(this._buildTreeNode(input, depth + 1, visited));
        }
      }
    }

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      isGroup,
      children,
      isViewNode: node.id === this._viewNodeId,
      depth,
      nodeRef: node,
    };
  }

  private _subscribeToGraph(): void {
    this._unsubscribeAll();

    const graph = this._host?.getGraph();
    if (!graph) return;

    const onStructureChanged = () => {
      this._emitStructureChanged();
    };

    this._signalUnsubscribers.push(
      graph.nodeAdded.connect(onStructureChanged),
      graph.nodeRemoved.connect(onStructureChanged),
      graph.connectionChanged.connect(onStructureChanged),
    );
  }

  private _unsubscribeAll(): void {
    for (const unsub of this._signalUnsubscribers) {
      unsub();
    }
    this._signalUnsubscribers = [];
  }

  /**
   * Emit graphStructureChanged, debounced with microtask to batch
   * rapid structural changes (e.g., loading 50 sources at once).
   */
  private _emitStructureChanged(): void {
    if (this._structureChangePending) return;
    this._structureChangePending = true;

    // Use queueMicrotask for synchronous-feeling debounce
    // (requestAnimationFrame is not available in test environments)
    queueMicrotask(() => {
      this._structureChangePending = false;
      this.emit('graphStructureChanged', undefined);
    });
  }
}
