/**
 * SequenceGroupNode Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SequenceGroupNode } from './SequenceGroupNode';
import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

// Simple mock node for testing
class MockInputNode extends IPNode {
  constructor(name: string) {
    super('MockInput', name);
  }

  protected process(): IPImage | null {
    return null;
  }
}

describe('SequenceGroupNode', () => {
  let sequenceNode: SequenceGroupNode;
  let mockContext: EvalContext;

  beforeEach(() => {
    sequenceNode = new SequenceGroupNode('TestSequence');
    mockContext = { frame: 1 };
  });

  describe('initialization', () => {
    it('has correct type', () => {
      expect(sequenceNode.type).toBe('RVSequenceGroup');
    });

    it('has correct default name', () => {
      const defaultNode = new SequenceGroupNode();
      expect(defaultNode.name).toBe('Sequence');
    });

    it('has autoSize property defaulting to true', () => {
      expect(sequenceNode.properties.getValue('autoSize')).toBe(true);
    });

    it('has empty durations by default', () => {
      expect(sequenceNode.properties.getValue('durations')).toEqual([]);
    });
  });

  describe('getActiveInputIndex', () => {
    it('SGN-001: returns correct index based on frame', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      const input3 = new MockInputNode('Input3');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);
      sequenceNode.connectInput(input3);

      // Without durations set, each input defaults to 1 frame
      expect(sequenceNode.getActiveInputIndex({ frame: 1 })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 2 })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 3 })).toBe(2);
    });

    it('SGN-003: defaults duration to 1 if not set', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);

      // Total duration should be 2 (1 frame per input)
      expect(sequenceNode.getTotalDuration()).toBe(2);
    });

    it('SGN-005: wraps at sequence end', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);

      // Frame 3 should wrap to input 0 (frame 1 position)
      expect(sequenceNode.getActiveInputIndex({ frame: 3 })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 4 })).toBe(1);
    });

    it('returns 0 for empty inputs', () => {
      expect(sequenceNode.getActiveInputIndex({ frame: 1 })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 100 })).toBe(0);
    });
  });

  describe('getTotalDuration', () => {
    it('SGN-002: sums all input durations', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      const input3 = new MockInputNode('Input3');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);
      sequenceNode.connectInput(input3);

      sequenceNode.setInputDurations([10, 20, 30]);

      expect(sequenceNode.getTotalDuration()).toBe(60);
    });

    it('defaults to input count when no durations set', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);

      expect(sequenceNode.getTotalDuration()).toBe(2);
    });

    it('handles partial durations', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      const input3 = new MockInputNode('Input3');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);
      sequenceNode.connectInput(input3);

      // Only set duration for first input
      sequenceNode.setInputDurations([10]);

      // Should be 10 + 1 + 1 = 12
      expect(sequenceNode.getTotalDuration()).toBe(12);
    });
  });

  describe('setInputDurations', () => {
    it('updates durations property', () => {
      sequenceNode.setInputDurations([5, 10, 15]);
      expect(sequenceNode.properties.getValue('durations')).toEqual([5, 10, 15]);
    });

    it('recalculates offsets after setting', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      const input3 = new MockInputNode('Input3');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);
      sequenceNode.connectInput(input3);

      sequenceNode.setInputDurations([10, 20, 30]);

      // Frame 1-10: input 0
      // Frame 11-30: input 1
      // Frame 31-60: input 2
      expect(sequenceNode.getActiveInputIndex({ frame: 5 })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 15 })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 40 })).toBe(2);
    });
  });

  describe('getLocalFrame', () => {
    it('SGN-004: computes correct local frame offset', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);

      sequenceNode.setInputDurations([10, 20]);

      // Frame 1 is local frame 1 in input 0
      expect(sequenceNode.getLocalFrame({ frame: 1 })).toBe(1);

      // Frame 10 is local frame 10 in input 0
      expect(sequenceNode.getLocalFrame({ frame: 10 })).toBe(10);

      // Frame 11 is local frame 1 in input 1
      expect(sequenceNode.getLocalFrame({ frame: 11 })).toBe(1);

      // Frame 20 is local frame 10 in input 1
      expect(sequenceNode.getLocalFrame({ frame: 20 })).toBe(10);
    });

    it('returns 1 when no durations set', () => {
      expect(sequenceNode.getLocalFrame({ frame: 5 })).toBe(1);
    });

    it('SGN-006: handles division by zero gracefully', () => {
      // Empty inputs should not cause issues
      expect(sequenceNode.getLocalFrame({ frame: 1 })).toBe(1);

      const input = new MockInputNode('Input');
      sequenceNode.connectInput(input);
      sequenceNode.setInputDurations([0]); // Zero duration

      // Should handle gracefully
      const result = sequenceNode.getLocalFrame({ frame: 1 });
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('frame cycling', () => {
    it('cycles through inputs correctly', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);

      sequenceNode.setInputDurations([2, 3]);
      // Total duration: 5 frames
      // Frames 1-2: input 0
      // Frames 3-5: input 1

      expect(sequenceNode.getActiveInputIndex({ frame: 1 })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 2 })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 3 })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 4 })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 5 })).toBe(1);

      // Frame 6 wraps to frame 1
      expect(sequenceNode.getActiveInputIndex({ frame: 6 })).toBe(0);
    });
  });
});
