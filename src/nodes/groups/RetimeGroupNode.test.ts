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

  // --- Explicit retime frame mapping tests ---

  it('RT-EXP-001: Explicit mapping [1,3,5,7] from firstOutputFrame=10', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('explicitActive', true);
    node.properties.setValue('explicitFirstOutputFrame', 10);
    node.properties.setValue('explicitInputFrames', [1, 3, 5, 7]);

    expect(node.getRetimedFrame(10)).toBe(1);  // index 0 -> 1
    expect(node.getRetimedFrame(11)).toBe(3);  // index 1 -> 3
    expect(node.getRetimedFrame(12)).toBe(5);  // index 2 -> 5
    expect(node.getRetimedFrame(13)).toBe(7);  // index 3 -> 7
  });

  it('RT-EXP-002: Output frame before firstOutputFrame clamps to first input frame', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('explicitActive', true);
    node.properties.setValue('explicitFirstOutputFrame', 10);
    node.properties.setValue('explicitInputFrames', [1, 3, 5, 7]);

    // Frame 9 is before firstOutputFrame=10, index would be -1, clamp to 0
    expect(node.getRetimedFrame(9)).toBe(1);
    // Frame 5 is well before firstOutputFrame=10
    expect(node.getRetimedFrame(5)).toBe(1);
    // Frame 0
    expect(node.getRetimedFrame(0)).toBe(1);
  });

  it('RT-EXP-003: Output frame after last clamps to last input frame', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('explicitActive', true);
    node.properties.setValue('explicitFirstOutputFrame', 10);
    node.properties.setValue('explicitInputFrames', [1, 3, 5, 7]);

    // Frame 14 is after the last mapped frame (13), index would be 4, clamp to 3
    expect(node.getRetimedFrame(14)).toBe(7);
    // Frame 100 is well past the end
    expect(node.getRetimedFrame(100)).toBe(7);
  });

  it('RT-EXP-004: explicitActive=false uses standard retime logic', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('explicitActive', false);
    node.properties.setValue('explicitFirstOutputFrame', 10);
    node.properties.setValue('explicitInputFrames', [1, 3, 5, 7]);

    // With default scale=1, offset=0: frame 10 -> 10 (not 1)
    expect(node.getRetimedFrame(10)).toBe(10);

    // With scale/offset: frame 5 -> 5*2 + 10 = 20
    node.properties.setValue('scale', 2.0);
    node.properties.setValue('offset', 10);
    expect(node.getRetimedFrame(5)).toBe(20);
  });

  it('RT-EXP-005: Empty inputFrames array falls back to standard retime', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('explicitActive', true);
    node.properties.setValue('explicitFirstOutputFrame', 10);
    node.properties.setValue('explicitInputFrames', []);

    // Empty array -> graceful fallback to standard retime
    // With default scale=1, offset=0: frame 10 -> 10
    expect(node.getRetimedFrame(10)).toBe(10);

    // With scale/offset
    node.properties.setValue('scale', 0.5);
    node.properties.setValue('offset', 5);
    expect(node.getRetimedFrame(10)).toBe(10); // round(10 * 0.5 + 5) = 10
  });

  it('RT-EXP-006: Single-frame inputFrames maps all output frames to that one frame', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('explicitActive', true);
    node.properties.setValue('explicitFirstOutputFrame', 1);
    node.properties.setValue('explicitInputFrames', [42]);

    // All output frames should map to frame 42
    expect(node.getRetimedFrame(1)).toBe(42);
    expect(node.getRetimedFrame(0)).toBe(42);   // before range -> clamp to first (only) entry
    expect(node.getRetimedFrame(2)).toBe(42);   // after range -> clamp to last (only) entry
    expect(node.getRetimedFrame(100)).toBe(42); // well past range
  });

  it('RT-EXP-007: Explicit properties initialize with correct defaults', () => {
    const node = new RetimeGroupNode();
    expect(node.properties.getValue('explicitActive')).toBe(false);
    expect(node.properties.getValue('explicitFirstOutputFrame')).toBe(1);
    expect(node.properties.getValue('explicitInputFrames')).toEqual([]);
  });
});
