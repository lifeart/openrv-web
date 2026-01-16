/**
 * Group Nodes - Container nodes for combining sources
 *
 * Importing this module triggers registration of all group nodes
 * with the NodeFactory.
 */

// Export base class
export { BaseGroupNode } from './BaseGroupNode';

// Export concrete group nodes (importing triggers registration via @RegisterNode)
export { SequenceGroupNode } from './SequenceGroupNode';
export { StackGroupNode } from './StackGroupNode';
export { SwitchGroupNode } from './SwitchGroupNode';
export { LayoutGroupNode } from './LayoutGroupNode';
export { FolderGroupNode } from './FolderGroupNode';
export { RetimeGroupNode } from './RetimeGroupNode';
