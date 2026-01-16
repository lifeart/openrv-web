/**
 * FolderGroupNode - Container for organizing sources
 *
 * A folder group is a logical container that doesn't affect rendering.
 * It passes through its first input.
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import type { EvalContext } from '../../core/graph/Graph';

@RegisterNode('RVFolderGroup')
export class FolderGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVFolderGroup', name ?? 'Folder');
  }

  getActiveInputIndex(_context: EvalContext): number {
    return 0; // Always use first input
  }
}
