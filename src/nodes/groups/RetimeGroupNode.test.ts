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

  // --- Warp keyframe speed ramp tests ---

  it('WARP-001: Accelerating speed ramp [0,24] rates [1.0,2.0] - frame 12 maps to 15', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', true);
    node.properties.setValue('warpKeyFrames', [0, 24]);
    node.properties.setValue('warpKeyRates', [1.0, 2.0]);

    // rate(t) = 1.0 + t/24, integral from 0 to 12:
    // rate at 12 = 1.0 + 12/24 = 1.5
    // integral = (1.0 + 1.5) / 2 * 12 = 1.25 * 12 = 15
    expect(node.getRetimedFrame(12)).toBe(15);

    // Frame 0 -> integral from 0 to 0 = 0, clamped to 1 (1-based frames)
    expect(node.getRetimedFrame(0)).toBe(1);

    // Frame 24 -> integral from 0 to 24 = (1.0 + 2.0) / 2 * 24 = 36
    expect(node.getRetimedFrame(24)).toBe(36);
  });

  it('WARP-002: Single keyframe [0] rate [2.0] - constant 2x speed', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', true);
    node.properties.setValue('warpKeyFrames', [0]);
    node.properties.setValue('warpKeyRates', [2.0]);

    // Constant rate of 2.0: outputFrame * 2.0
    expect(node.getRetimedFrame(12)).toBe(24);
    expect(node.getRetimedFrame(0)).toBe(1); // clamped to 1 (1-based frames)
    expect(node.getRetimedFrame(1)).toBe(2);
    expect(node.getRetimedFrame(50)).toBe(100);
  });

  it('WARP-003: Multi-segment [0,10,20] rates [1.0,2.0,1.0] - verify intermediate and endpoints', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', true);
    node.properties.setValue('warpKeyFrames', [0, 10, 20]);
    node.properties.setValue('warpKeyRates', [1.0, 2.0, 1.0]);

    // Frame 0: integral = 0, clamped to 1 (1-based frames)
    expect(node.getRetimedFrame(0)).toBe(1);

    // Frame 5 (midpoint of segment [0,10]):
    // rate at 5 = 1.0 + (2.0-1.0)*(5/10) = 1.5
    // integral = (1.0 + 1.5) / 2 * 5 = 6.25 -> round = 6
    expect(node.getRetimedFrame(5)).toBe(6);

    // Frame 10 (end of first segment):
    // integral = (1.0 + 2.0) / 2 * 10 = 15
    expect(node.getRetimedFrame(10)).toBe(15);

    // Frame 15 (midpoint of segment [10,20]):
    // Segment 1: (1.0 + 2.0) / 2 * 10 = 15
    // rate at 15 = 2.0 + (1.0-2.0)*((15-10)/10) = 1.5
    // Segment 2: (2.0 + 1.5) / 2 * 5 = 8.75
    // Total = 15 + 8.75 = 23.75 -> round = 24
    expect(node.getRetimedFrame(15)).toBe(24);

    // Frame 20 (end of second segment):
    // Segment 1: 15, Segment 2: (2.0 + 1.0) / 2 * 10 = 15
    // Total = 30
    expect(node.getRetimedFrame(20)).toBe(30);
  });

  it('WARP-004: warpActive=false ignores warp, uses standard retime', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', false);
    node.properties.setValue('warpKeyFrames', [0, 24]);
    node.properties.setValue('warpKeyRates', [1.0, 2.0]);

    // Should use standard retime (scale=1, offset=0) -> frame unchanged
    expect(node.getRetimedFrame(12)).toBe(12);

    // With scale/offset set
    node.properties.setValue('scale', 2.0);
    node.properties.setValue('offset', 5);
    expect(node.getRetimedFrame(10)).toBe(25); // round(10*2 + 5) = 25
  });

  it('WARP-005: Empty keyframes array falls back to standard retime', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', true);
    node.properties.setValue('warpKeyFrames', []);
    node.properties.setValue('warpKeyRates', []);

    // Empty arrays -> fallback to standard retime
    expect(node.getRetimedFrame(12)).toBe(12);

    node.properties.setValue('scale', 0.5);
    node.properties.setValue('offset', 3);
    expect(node.getRetimedFrame(10)).toBe(8); // round(10*0.5 + 3) = 8
  });

  it('WARP-006: Mismatched keyFrames/keyRates lengths falls back to standard retime', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', true);
    node.properties.setValue('warpKeyFrames', [0, 10, 20]);
    node.properties.setValue('warpKeyRates', [1.0, 2.0]); // Only 2 rates for 3 keyframes

    // Mismatched lengths -> graceful fallback to standard retime
    expect(node.getRetimedFrame(12)).toBe(12);
  });

  it('WARP-007: Warp properties initialize with correct defaults', () => {
    const node = new RetimeGroupNode();
    expect(node.properties.getValue('warpActive')).toBe(false);
    expect(node.properties.getValue('warpKeyFrames')).toEqual([]);
    expect(node.properties.getValue('warpKeyRates')).toEqual([]);
  });

  it('WARP-008: Explicit mapping takes priority over warp', () => {
    const node = new RetimeGroupNode();
    // Enable both explicit and warp
    node.properties.setValue('explicitActive', true);
    node.properties.setValue('explicitFirstOutputFrame', 1);
    node.properties.setValue('explicitInputFrames', [10, 20, 30]);
    node.properties.setValue('warpActive', true);
    node.properties.setValue('warpKeyFrames', [0, 24]);
    node.properties.setValue('warpKeyRates', [1.0, 2.0]);

    // Explicit should win
    expect(node.getRetimedFrame(1)).toBe(10);
    expect(node.getRetimedFrame(2)).toBe(20);
    expect(node.getRetimedFrame(3)).toBe(30);
  });

  it('WARP-009: Extrapolation beyond last keyframe uses last rate', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', true);
    node.properties.setValue('warpKeyFrames', [0, 10]);
    node.properties.setValue('warpKeyRates', [1.0, 2.0]);

    // Frame 10: integral = (1.0+2.0)/2 * 10 = 15
    expect(node.getRetimedFrame(10)).toBe(15);

    // Frame 20: integral to 10 = 15, plus 2.0 * (20-10) = 20, total = 35
    expect(node.getRetimedFrame(20)).toBe(35);
  });

  it('WARP-010: Before-range extrapolation clamps to minimum frame 1', () => {
    const node = new RetimeGroupNode();
    node.properties.setValue('warpActive', true);
    // Keyframes start at frame 10 — querying frame 0 would produce negative integral
    node.properties.setValue('warpKeyFrames', [10, 20]);
    node.properties.setValue('warpKeyRates', [2.0, 2.0]);

    // Frame 0: extrapolate at rate 2.0 => integral = 2.0 * (0 - 10) = -20
    // Without clamp this would be -20, but must be clamped to 1
    expect(node.getRetimedFrame(0)).toBe(1);

    // Frame 5: extrapolate at rate 2.0 => integral = 2.0 * (5 - 10) = -10
    // Without clamp this would be -10, but must be clamped to 1
    expect(node.getRetimedFrame(5)).toBe(1);
  });
});
