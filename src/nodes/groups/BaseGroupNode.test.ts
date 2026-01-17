import { describe, it, expect } from 'vitest';
import { BaseGroupNode } from './BaseGroupNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

class TestGroupNode extends BaseGroupNode {
  public activeIndex = 0;

  getActiveInputIndex(_context: EvalContext): number {
    return this.activeIndex;
  }

  // Expose protected process for testing
  public testProcess(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    return this.process(context, inputs);
  }
}

describe('BaseGroupNode', () => {
  const context: EvalContext = {
    frame: 1,
    width: 1920,
    height: 1080,
    quality: 'full'
  };

  it('BGN-001: returns null when inputs are empty', () => {
    const node = new TestGroupNode('test');
    expect(node.testProcess(context, [])).toBeNull();
  });

  it('BGN-002: selects the active input', () => {
    const node = new TestGroupNode('test');
    const img1 = IPImage.createEmpty(100, 100);
    const img2 = IPImage.createEmpty(200, 200);
    
    node.activeIndex = 1;
    expect(node.testProcess(context, [img1, img2])).toBe(img2);
  });

  it('BGN-003: clamps the active index to bounds', () => {
    const node = new TestGroupNode('test');
    const img1 = IPImage.createEmpty(100, 100);
    
    node.activeIndex = 5; // Out of bounds high
    expect(node.testProcess(context, [img1])).toBe(img1);
    
    node.activeIndex = -1; // Out of bounds low
    expect(node.testProcess(context, [img1])).toBe(img1);
  });

  it('BGN-005: returns null when selected input is null', () => {
    const node = new TestGroupNode('test');
    node.activeIndex = 0;
    expect(node.testProcess(context, [null])).toBeNull();
  });

  it('BGN-004: serializes correctly to JSON', () => {
    const node = new TestGroupNode('test', 'MyGroup');
    const json = node.toJSON() as any;
    
    expect(json.type).toBe('test');
    expect(json.name).toBe('MyGroup');
    expect(json.inputs).toEqual([]);
    expect(json.properties).toBeDefined();
  });
});
