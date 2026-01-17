import { describe, it, expect } from 'vitest';
import { FolderGroupNode } from './FolderGroupNode';
import type { EvalContext } from '../../core/graph/Graph';

describe('FolderGroupNode', () => {
  const context: EvalContext = {
    frame: 1,
    width: 1920,
    height: 1080,
    quality: 'full'
  };

  it('FGN-001: initializes with correct type and default name', () => {
    const node = new FolderGroupNode();
    expect(node.type).toBe('RVFolderGroup');
    expect(node.name).toBe('Folder');
  });

  it('FGN-002: always returns 0 for active input index', () => {
    const node = new FolderGroupNode();
    expect(node.getActiveInputIndex(context)).toBe(0);
  });
});
