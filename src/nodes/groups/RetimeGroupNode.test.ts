import { describe, it, expect } from 'vitest';
import { RetimeGroupNode } from './RetimeGroupNode';
import type { EvalContext } from '../../core/graph/Graph';

describe('RetimeGroupNode', () => {
  const context: EvalContext = {
    frame: 1,
    width: 1920,
    height: 1080,
    quality: 'full'
  };

  it('RGN-001: initializes with standard properties', () => {
    const node = new RetimeGroupNode();
    expect(node.properties.getValue('scale')).toBe(1.0);
    expect(node.properties.getValue('offset')).toBe(0);
    expect(node.properties.getValue('reverse')).toBe(false);
  });

  it('RGN-002: getRetimedFrame - simple scale and offset', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('scale', 2.0);
    node.properties.setValue('offset', 10);
    
    expect(node.getRetimedFrame(5)).toBe(20); // 5 * 2 + 10
  });

  it('RGN-003: getRetimedFrame - reverse', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('reverse', true);
    
    // Reverse on frame 1 of a 100-frame clip -> frame 100
    expect(node.getRetimedFrame(1, 100)).toBe(100);
    // Reverse on frame 100 of a 100-frame clip -> frame 1
    expect(node.getRetimedFrame(100, 100)).toBe(1);
    
    // Using stored duration
    node.properties.setValue('duration', 50);
    expect(node.getRetimedFrame(1)).toBe(50);
  });

  it('RGN-004: getRetimedFrame - never returns less than 1', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('offset', -100);
    expect(node.getRetimedFrame(1)).toBe(1);
  });

  it('RGN-005: getActiveInputIndex returns 0', () => {
    const node = new RetimeGroupNode();
    expect(node.getActiveInputIndex(context)).toBe(0);
  });
});
