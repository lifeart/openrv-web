import { describe, it, expect } from 'vitest';
import { LayoutGroupNode, computeTileViewports } from './LayoutGroupNode';
import type { EvalContext } from '../../core/graph/Graph';
import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';

class MockNode extends IPNode {
  constructor(name: string) {
    super('mock', name);
  }

  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

describe('LayoutGroupNode', () => {
  const context: EvalContext = {
    frame: 1,
    width: 1920,
    height: 1080,
    quality: 'full'
  };

  it('LGN-001: initializes with grid properties', () => {
    const node = new LayoutGroupNode();
    expect(node.properties.has('mode')).toBe(true);
    expect(node.properties.getValue('mode')).toBe('row');
  });

  it('LGN-002: getGridDimensions - row mode', () => {
    const node = new LayoutGroupNode();
    node.connectInput(new MockNode('1'));
    node.connectInput(new MockNode('2'));
    
    const dims = node.getGridDimensions();
    expect(dims.columns).toBe(2);
    expect(dims.rows).toBe(1);
  });

  it('LGN-003: getGridDimensions - column mode', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'column');
    node.connectInput(new MockNode('1'));
    node.connectInput(new MockNode('2'));
    node.connectInput(new MockNode('3'));
    
    const dims = node.getGridDimensions();
    expect(dims.columns).toBe(1);
    expect(dims.rows).toBe(3);
  });

  it('LGN-004: getGridDimensions - grid mode (explicit)', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 3);
    node.properties.setValue('rows', 4);
    
    const dims = node.getGridDimensions();
    expect(dims.columns).toBe(3);
    expect(dims.rows).toBe(4);
  });

  it('LGN-005: getGridDimensions - grid mode (auto-calculate)', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 0); // Trigger auto
    node.properties.setValue('rows', 0);
    
    // 4 inputs -> 2x2 grid
    node.connectInput(new MockNode('1'));
    node.connectInput(new MockNode('2'));
    node.connectInput(new MockNode('3'));
    node.connectInput(new MockNode('4'));
    
    let dims = node.getGridDimensions();
    expect(dims.columns).toBe(2);
    expect(dims.rows).toBe(2);

    // 5 inputs -> 3x2 grid (sqrt(5) ~ 2.23 -> 3 cols, 5/3 ~ 1.66 -> 2 rows)
    node.connectInput(new MockNode('5'));
    dims = node.getGridDimensions();
    expect(dims.columns).toBe(3);
    expect(dims.rows).toBe(2);
  });

  it('LGN-006: getActiveInputIndex returns 0', () => {
    const node = new LayoutGroupNode();
    expect(node.getActiveInputIndex(context)).toBe(0);
  });

  it('LGN-007: computeTileViewports returns empty for zero/negative columns or rows', () => {
    // Fix: computeTileViewports has guard: if (columns <= 0 || rows <= 0) return [];
    expect(computeTileViewports(1920, 1080, 0, 2, 0)).toEqual([]);
    expect(computeTileViewports(1920, 1080, 2, 0, 0)).toEqual([]);
    expect(computeTileViewports(1920, 1080, -1, 2, 0)).toEqual([]);
    expect(computeTileViewports(1920, 1080, 2, -1, 0)).toEqual([]);
    expect(computeTileViewports(1920, 1080, 0, 0, 0)).toEqual([]);
  });
});
