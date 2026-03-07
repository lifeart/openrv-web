/**
 * SessionManager Types
 *
 * Interfaces for the session manager tree model and serialized graph format.
 * These types bridge the core graph infrastructure with the UI layer.
 */

import type { IPNode } from '../../nodes/base/IPNode';

export type GroupNodeType =
  | 'RVSequenceGroup'
  | 'RVStackGroup'
  | 'RVSwitchGroup'
  | 'RVLayoutGroup'
  | 'RVRetimeGroup';

/**
 * Tree node representation for the Session Manager panel.
 *
 * NOTE: `expanded` state is NOT stored here. Expand/collapse state
 * lives in the panel's Map<string, boolean> to avoid coupling
 * service-layer data to view-layer state.
 */
export interface TreeNode {
  /** Graph node ID */
  id: string;
  /** Display name */
  name: string;
  /** Node type string (e.g. 'RVSequenceGroup', 'RVFileSource') */
  type: string;
  /** True for group nodes that can contain children */
  isGroup: boolean;
  /** Child nodes (inputs to a group node) */
  children: TreeNode[];
  /** True if this is the current view node */
  isViewNode: boolean;
  /** Depth in the tree (0 = root). Derivable but included as convenience. */
  depth: number;
  /** Reference to the underlying IPNode */
  nodeRef: IPNode;
}

/**
 * Serialized representation of a single graph node for .orvproject files.
 */
export interface SerializedGraphNode {
  /** Node ID (preserved across save/load) */
  id: string;
  /** Node type (must match NodeFactory registry) */
  type: string;
  /** Display name */
  name: string;
  /**
   * Persistent properties only (use PropertyContainer.toPersistentJSON()).
   * Transient properties are not included to keep file size small.
   */
  properties: Record<string, unknown>;
  /**
   * IDs of input nodes (order matters for group nodes).
   * If an inputId references a node that was not successfully deserialized
   * (e.g., unknown node type), that slot is skipped and a warning is logged.
   */
  inputIds: string[];
}

/**
 * Serialized graph format for .orvproject files.
 *
 * This format enhances Graph.toJSON() with additional metadata
 * (version, viewNodeId). The `nodes` array contains SerializedGraphNode
 * entries with persistent properties and ordered input IDs.
 */
export interface SerializedGraph {
  /** Version for graph schema migration (starts at 1) */
  version: number;
  /** All nodes in the graph */
  nodes: SerializedGraphNode[];
  /** ID of the root/output node */
  outputNodeId: string | null;
  /** ID of the currently viewed node (independent of output) */
  viewNodeId: string | null;
}
