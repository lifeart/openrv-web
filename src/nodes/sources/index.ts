/**
 * Source Nodes - Root nodes for the processing graph
 *
 * Importing this module triggers registration of all source nodes
 * with the NodeFactory.
 */

// Export types and base class
export { BaseSourceNode } from './BaseSourceNode';
export type { SourceMetadata } from './BaseSourceNode';

// Export concrete source nodes (importing triggers registration via @RegisterNode)
export { FileSourceNode } from './FileSourceNode';
export { VideoSourceNode } from './VideoSourceNode';
export { SequenceSourceNode } from './SequenceSourceNode';
