/**
 * MuNodeBridge — Node Graph Operations Bridge for Mu API Compatibility
 *
 * Implements OpenRV's node graph commands (~20 commands) including:
 *   nodes, nodeType, newNode, deleteNode, nodeConnections, setNodeInputs,
 *   testNodeInputs, nodesInGroup, nodeGroup, nodeExists, nodesOfType,
 *   viewNode, viewNodes, setViewNode, previousViewNode, nextViewNode,
 *   nodeImageGeometry.
 *
 * Operates against a Graph instance and a NodeFactory for node creation.
 * Maintains view node history for previousViewNode/nextViewNode navigation.
 */

import { Graph } from '../core/graph/Graph';
import { NodeFactory } from '../nodes/base/NodeFactory';
import type { IPNode } from '../nodes/base/IPNode';
import type { NodeImageGeometry } from './types';

/**
 * MuNodeBridge wraps the openrv-web Graph and NodeFactory to expose
 * Mu-compatible node graph commands.
 */
export class MuNodeBridge {
  private _graph: Graph;

  /** Current view node name (the root of what's being displayed) */
  private _viewNode: string | null = null;

  /** All nodes that are considered "viewable" */
  private _viewableNodes = new Set<string>();

  /** View node history stack for navigation */
  private _viewHistory: string[] = [];

  /** Current index in view history (-1 = no history) */
  private _viewHistoryIndex = -1;

  /**
   * Group membership map: childNodeId -> parentGroupNodeId.
   * Maintained by the bridge when nodes are added/removed from groups.
   */
  private _groupMembership = new Map<string, string>();

  constructor(graph?: Graph) {
    this._graph = graph ?? new Graph();
  }

  /** Get the underlying graph instance. */
  get graph(): Graph {
    return this._graph;
  }

  /** Replace the underlying graph (e.g. after session load). */
  setGraph(graph: Graph): void {
    this._graph = graph;
    // Reset view state
    this._viewNode = null;
    this._viewableNodes.clear();
    this._viewHistory = [];
    this._viewHistoryIndex = -1;
    this._groupMembership.clear();
  }

  // ---- Node listing ----

  /**
   * List all node names in the graph.
   * Equivalent to Mu's `commands.nodes()`.
   */
  nodes(): string[] {
    return this._graph.getAllNodes().map((n) => n.name);
  }

  /**
   * Get the type of a node by name.
   * Equivalent to Mu's `commands.nodeType(name)`.
   *
   * @throws Error if node not found
   */
  nodeType(name: string): string {
    const node = this._findNode(name);
    if (!node) throw new Error(`Node not found: "${name}"`);
    return node.type;
  }

  /**
   * Check whether a node exists by name.
   * Equivalent to Mu's `commands.nodeExists(name)`.
   */
  nodeExists(name: string): boolean {
    return this._findNode(name) !== null;
  }

  /**
   * Find all nodes of a given type.
   * Equivalent to Mu's `commands.nodesOfType(typeName)`.
   */
  nodesOfType(typeName: string): string[] {
    return this._graph
      .getAllNodes()
      .filter((n) => n.type === typeName)
      .map((n) => n.name);
  }

  // ---- Node CRUD ----

  /**
   * Create a new node in the graph.
   * Equivalent to Mu's `commands.newNode(typeName, nodeName)`.
   *
   * @param typeName - Registered node type (e.g. "RVColor", "RVSource")
   * @param nodeName - Optional name for the node
   * @returns The name of the newly created node
   * @throws Error if the type is unknown
   */
  newNode(typeName: string, nodeName?: string): string {
    const node = NodeFactory.create(typeName);
    if (!node) {
      throw new Error(`Unknown node type: "${typeName}"`);
    }
    if (nodeName) {
      node.name = nodeName;
    }
    this._graph.addNode(node);
    return node.name;
  }

  /**
   * Delete a node from the graph.
   * Equivalent to Mu's `commands.deleteNode(name)`.
   *
   * @throws Error if node not found
   */
  deleteNode(name: string): void {
    const node = this._findNode(name);
    if (!node) throw new Error(`Node not found: "${name}"`);

    // Clean up group membership
    this._groupMembership.delete(node.id);
    // Remove from viewable set
    this._viewableNodes.delete(name);
    // If this was the current view node, clear it
    if (this._viewNode === name) {
      this._viewNode = null;
    }

    this._graph.removeNode(node.id);
  }

  // ---- Connections ----

  /**
   * Get input and output connections for a node.
   * Equivalent to Mu's `commands.nodeConnections(name, traverseGroups)`.
   *
   * @param name - Node name
   * @param _traverseGroups - Whether to traverse into group nodes (currently ignored)
   * @returns Tuple of [inputNames, outputNames]
   */
  nodeConnections(name: string, _traverseGroups = false): [string[], string[]] {
    const node = this._findNode(name);
    if (!node) throw new Error(`Node not found: "${name}"`);
    const inputs = node.inputs.map((n) => n.name);
    const outputs = node.outputs.map((n) => n.name);
    return [inputs, outputs];
  }

  /**
   * Set the inputs of a node, replacing all existing inputs.
   * Equivalent to Mu's `commands.setNodeInputs(name, inputNames)`.
   *
   * @throws Error if node or any input not found, or if connection would create a cycle
   */
  setNodeInputs(name: string, inputNames: string[]): void {
    const node = this._findNode(name);
    if (!node) throw new Error(`Node not found: "${name}"`);

    // Resolve all input nodes first
    const inputNodes: IPNode[] = [];
    for (const inputName of inputNames) {
      const inputNode = this._findNode(inputName);
      if (!inputNode) throw new Error(`Input node not found: "${inputName}"`);
      inputNodes.push(inputNode);
    }

    // Disconnect existing inputs
    node.disconnectAllInputs();

    // Connect new inputs (Graph.connect checks for cycles)
    for (const inputNode of inputNodes) {
      this._graph.connect(inputNode, node);
    }
  }

  /**
   * Test whether setting the given inputs would create a cycle.
   * Equivalent to Mu's `commands.testNodeInputs(name, inputNames)`.
   *
   * Returns true if the connection is valid (no cycle), false otherwise.
   */
  testNodeInputs(name: string, inputNames: string[]): boolean {
    const node = this._findNode(name);
    if (!node) return false;

    // Resolve input nodes
    const inputNodes: IPNode[] = [];
    for (const inputName of inputNames) {
      const inputNode = this._findNode(inputName);
      if (!inputNode) return false;
      inputNodes.push(inputNode);
    }

    // Check each potential connection for cycles
    for (const inputNode of inputNodes) {
      if (this._wouldCreateCycle(inputNode, node)) {
        return false;
      }
    }

    return true;
  }

  // ---- Group operations ----

  /**
   * List nodes in a group.
   * Equivalent to Mu's `commands.nodesInGroup(groupName)`.
   */
  nodesInGroup(groupName: string): string[] {
    const result: string[] = [];
    for (const [childId, parentId] of this._groupMembership) {
      const parentNode = this._graph.getNode(parentId);
      if (parentNode && parentNode.name === groupName) {
        const childNode = this._graph.getNode(childId);
        if (childNode) result.push(childNode.name);
      }
    }
    return result;
  }

  /**
   * Get the parent group of a node.
   * Equivalent to Mu's `commands.nodeGroup(name)`.
   *
   * Returns empty string if the node has no parent group.
   */
  nodeGroup(name: string): string {
    const node = this._findNode(name);
    if (!node) throw new Error(`Node not found: "${name}"`);
    const parentId = this._groupMembership.get(node.id);
    if (!parentId) return '';
    const parentNode = this._graph.getNode(parentId);
    return parentNode?.name ?? '';
  }

  /**
   * Add a node to a group (bridge-specific helper, not in Mu API).
   */
  addNodeToGroup(nodeName: string, groupName: string): void {
    const node = this._findNode(nodeName);
    if (!node) throw new Error(`Node not found: "${nodeName}"`);
    const group = this._findNode(groupName);
    if (!group) throw new Error(`Group node not found: "${groupName}"`);
    this._groupMembership.set(node.id, group.id);
  }

  // ---- View node management ----

  /**
   * Get the current view root node name.
   * Equivalent to Mu's `commands.viewNode()`.
   */
  viewNode(): string {
    return this._viewNode ?? '';
  }

  /**
   * Get all viewable node names.
   * Equivalent to Mu's `commands.viewNodes()`.
   */
  viewNodes(): string[] {
    return Array.from(this._viewableNodes);
  }

  /**
   * Set the current view root node.
   * Equivalent to Mu's `commands.setViewNode(name)`.
   *
   * Pushes the new node onto the view history stack.
   */
  setViewNode(name: string): void {
    if (!this._findNode(name)) {
      throw new Error(`Node not found: "${name}"`);
    }

    if (this._viewNode !== null && this._viewNode !== name) {
      // Truncate any forward history beyond the current position
      this._viewHistory = this._viewHistory.slice(0, this._viewHistoryIndex + 1);
      // Push current view onto history before switching
      this._viewHistory.push(this._viewNode);
      this._viewHistoryIndex = this._viewHistory.length - 1;
    }

    this._viewNode = name;

    // Auto-add to viewable set
    this._viewableNodes.add(name);
  }

  /**
   * Navigate to the previous view node in history.
   * Equivalent to Mu's `commands.previousViewNode()`.
   *
   * @returns The previous view node name, or empty string if at start of history.
   */
  previousViewNode(): string {
    if (this._viewHistory.length === 0 || this._viewHistoryIndex < 0) {
      return '';
    }

    // If we are past the end of the stored history (i.e. at a fresh setViewNode),
    // save the current node so we can navigate forward to it later.
    if (this._viewNode && this._viewHistoryIndex === this._viewHistory.length - 1) {
      // The current node is NOT in _viewHistory yet (it's the "active" one).
      // Push it so nextViewNode can return to it.
      this._viewHistory.push(this._viewNode);
      // _viewHistoryIndex stays the same — we want to go to the item at _viewHistoryIndex.
    }

    const prev = this._viewHistory[this._viewHistoryIndex];
    if (prev !== undefined) {
      this._viewNode = prev;
      if (this._viewHistoryIndex > 0) {
        this._viewHistoryIndex--;
      }
      return prev;
    }

    return '';
  }

  /**
   * Navigate to the next view node in history.
   * Equivalent to Mu's `commands.nextViewNode()`.
   *
   * @returns The next view node name, or empty string if at end of history.
   */
  nextViewNode(): string {
    if (this._viewHistoryIndex >= this._viewHistory.length - 1) {
      return '';
    }

    this._viewHistoryIndex++;
    const next = this._viewHistory[this._viewHistoryIndex];
    if (next !== undefined) {
      this._viewNode = next;
      return next;
    }
    return '';
  }

  /**
   * Mark a node as viewable (bridge-specific helper).
   */
  addViewableNode(name: string): void {
    this._viewableNodes.add(name);
  }

  /**
   * Remove a node from the viewable set (bridge-specific helper).
   */
  removeViewableNode(name: string): void {
    this._viewableNodes.delete(name);
  }

  // ---- Image geometry ----

  /**
   * Get the image geometry output of a node.
   * Equivalent to Mu's `commands.nodeImageGeometry(name)`.
   *
   * Returns default geometry since actual image evaluation is not
   * performed by this bridge (it would require rendering).
   */
  nodeImageGeometry(name: string): NodeImageGeometry {
    const node = this._findNode(name);
    if (!node) throw new Error(`Node not found: "${name}"`);

    // Try to read width/height from the node's properties
    const width = (node.properties.getValue<number>('width') ?? 0);
    const height = (node.properties.getValue<number>('height') ?? 0);
    const pixelAspect = (node.properties.getValue<number>('pixelAspect') ?? 1.0);
    const orientation = (node.properties.getValue<string>('orientation') ?? 'normal');

    return { width, height, pixelAspect, orientation };
  }

  // ---- Internal helpers ----

  /**
   * Find a node by name (searches all graph nodes).
   */
  private _findNode(name: string): IPNode | null {
    for (const node of this._graph.getAllNodes()) {
      if (node.name === name) return node;
    }
    // Also try by ID
    return this._graph.getNode(name) ?? null;
  }

  /**
   * Check if connecting `from` -> `to` would create a cycle.
   * Walks upstream from `from` to see if `to` is reachable.
   */
  private _wouldCreateCycle(from: IPNode, to: IPNode): boolean {
    const visited = new Set<string>();
    const stack = [from];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.id === to.id) return true;
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      for (const input of node.inputs) {
        stack.push(input);
      }
    }

    return false;
  }
}
