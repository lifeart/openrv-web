/**
 * SequenceGroupNode Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SequenceGroupNode } from './SequenceGroupNode';
import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';

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

  beforeEach(() => {
    sequenceNode = new SequenceGroupNode('TestSequence');
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
      expect(sequenceNode.getActiveInputIndex({ frame: 1, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 2, width: 1920, height: 1080, quality: 'full' })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 3, width: 1920, height: 1080, quality: 'full' })).toBe(2);
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
      expect(sequenceNode.getActiveInputIndex({ frame: 3, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 4, width: 1920, height: 1080, quality: 'full' })).toBe(1);
    });

    it('returns 0 for empty inputs', () => {
      expect(sequenceNode.getActiveInputIndex({ frame: 1, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 100, width: 1920, height: 1080, quality: 'full' })).toBe(0);
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
      expect(sequenceNode.getActiveInputIndex({ frame: 5, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 15, width: 1920, height: 1080, quality: 'full' })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 40, width: 1920, height: 1080, quality: 'full' })).toBe(2);
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
      expect(sequenceNode.getLocalFrame({ frame: 1, width: 1920, height: 1080, quality: 'full' })).toBe(1);

      // Frame 10 is local frame 10 in input 0
      expect(sequenceNode.getLocalFrame({ frame: 10, width: 1920, height: 1080, quality: 'full' })).toBe(10);

      // Frame 11 is local frame 1 in input 1
      expect(sequenceNode.getLocalFrame({ frame: 11, width: 1920, height: 1080, quality: 'full' })).toBe(1);

      // Frame 20 is local frame 10 in input 1
      expect(sequenceNode.getLocalFrame({ frame: 20, width: 1920, height: 1080, quality: 'full' })).toBe(10);
    });

    it('returns 1 when no durations set', () => {
      expect(sequenceNode.getLocalFrame({ frame: 5, width: 1920, height: 1080, quality: 'full' })).toBe(1);
    });

    it('SGN-006: handles division by zero gracefully', () => {
      // Empty inputs should not cause issues
      expect(sequenceNode.getLocalFrame({ frame: 1, width: 1920, height: 1080, quality: 'full' })).toBe(1);

      const input = new MockInputNode('Input');
      sequenceNode.connectInput(input);
      sequenceNode.setInputDurations([0]); // Zero duration

      // Should handle gracefully
      const result = sequenceNode.getLocalFrame({ frame: 1, width: 1920, height: 1080, quality: 'full' });
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

      expect(sequenceNode.getActiveInputIndex({ frame: 1, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 2, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 3, width: 1920, height: 1080, quality: 'full' })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 4, width: 1920, height: 1080, quality: 'full' })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 5, width: 1920, height: 1080, quality: 'full' })).toBe(1);

      // Frame 6 wraps to frame 1
      expect(sequenceNode.getActiveInputIndex({ frame: 6, width: 1920, height: 1080, quality: 'full' })).toBe(0);
    });

    it('SGN-007: triggers internal offset recalculation when inputs change', () => {
      const input1 = new MockInputNode('Input1');
      sequenceNode.connectInput(input1);

      // Set some durations manually
      sequenceNode.setInputDurations([10]);
      expect(sequenceNode.getTotalDuration()).toBe(10);

      // Add another input WITHOUT setting durations again
      const input2 = new MockInputNode('Input2');
      sequenceNode.connectInput(input2);

      // This should trigger the internal recalculateOffsets on next call
      // Total duration should now be 10 + 1 (default for new input) = 11
      expect(sequenceNode.getTotalDuration()).toBe(11);
      expect(sequenceNode.getActiveInputIndex({ frame: 11, width: 1920, height: 1080, quality: 'full' })).toBe(1);
    });
  });

  describe('EDL (Edit Decision List)', () => {
    it('hasEDL returns false by default', () => {
      expect(sequenceNode.hasEDL()).toBe(false);
    });

    it('hasEDL returns true when EDL data is set', () => {
      sequenceNode.setEDLArrays([1, 25], [0, 1], [1, 1], [24, 48]);
      expect(sequenceNode.hasEDL()).toBe(true);
    });

    it('getEDL returns empty array by default', () => {
      expect(sequenceNode.getEDL()).toEqual([]);
    });

    it('getEDL returns structured EDL entries', () => {
      sequenceNode.setEDLArrays([1, 25, 73], [0, 1, 0], [1, 1, 25], [24, 48, 48]);

      const edl = sequenceNode.getEDL();
      expect(edl).toHaveLength(3);

      expect(edl[0]).toEqual({ frame: 1, source: 0, inPoint: 1, outPoint: 24 });
      expect(edl[1]).toEqual({ frame: 25, source: 1, inPoint: 1, outPoint: 48 });
      expect(edl[2]).toEqual({ frame: 73, source: 0, inPoint: 25, outPoint: 48 });
    });

    it('setEDL sets EDL from structured entries', () => {
      const entries = [
        { frame: 1, source: 0, inPoint: 1, outPoint: 100 },
        { frame: 101, source: 1, inPoint: 50, outPoint: 150 },
      ];

      sequenceNode.setEDL(entries);

      expect(sequenceNode.properties.getValue('edlFrames')).toEqual([1, 101]);
      expect(sequenceNode.properties.getValue('edlSources')).toEqual([0, 1]);
      expect(sequenceNode.properties.getValue('edlIn')).toEqual([1, 50]);
      expect(sequenceNode.properties.getValue('edlOut')).toEqual([100, 150]);
    });

    it('getActiveInputIndex uses EDL data when available', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);

      // EDL: frames 1-24 from source 0, frames 25-72 from source 1, frames 73+ from source 0
      sequenceNode.setEDLArrays([1, 25, 73], [0, 1, 0], [1, 1, 25], [24, 48, 48]);

      expect(sequenceNode.getActiveInputIndex({ frame: 1, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 24, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 25, width: 1920, height: 1080, quality: 'full' })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 50, width: 1920, height: 1080, quality: 'full' })).toBe(1);
      expect(sequenceNode.getActiveInputIndex({ frame: 73, width: 1920, height: 1080, quality: 'full' })).toBe(0);
      expect(sequenceNode.getActiveInputIndex({ frame: 100, width: 1920, height: 1080, quality: 'full' })).toBe(0);
    });

    it('getLocalFrame uses EDL data for source frame mapping', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      sequenceNode.connectInput(input1);
      sequenceNode.connectInput(input2);

      // EDL: frames 1-24 from source 0 (frames 1-24), frames 25-72 from source 1 (frames 1-48)
      sequenceNode.setEDLArrays([1, 25], [0, 1], [1, 1], [24, 48]);

      // Global frame 1 -> source frame 1 (inPoint + offset)
      expect(sequenceNode.getLocalFrame({ frame: 1, width: 1920, height: 1080, quality: 'full' })).toBe(1);

      // Global frame 12 -> source frame 12 (offset = 11, inPoint = 1)
      expect(sequenceNode.getLocalFrame({ frame: 12, width: 1920, height: 1080, quality: 'full' })).toBe(12);

      // Global frame 25 -> source 1, frame 1 (offset = 0, inPoint = 1)
      expect(sequenceNode.getLocalFrame({ frame: 25, width: 1920, height: 1080, quality: 'full' })).toBe(1);

      // Global frame 35 -> source 1, frame 11 (offset = 10, inPoint = 1)
      expect(sequenceNode.getLocalFrame({ frame: 35, width: 1920, height: 1080, quality: 'full' })).toBe(11);
    });

    it('getTotalDurationFromEDL calculates correct duration', () => {
      // EDL: 24 frames from source 0, 48 frames from source 1 = 72 total
      sequenceNode.setEDLArrays([1, 25], [0, 1], [1, 1], [24, 48]);

      expect(sequenceNode.getTotalDurationFromEDL()).toBe(72); // (24-1+1) + (48-1+1) = 24 + 48 = 72
    });

    it('EDL properties have correct defaults', () => {
      expect(sequenceNode.properties.getValue('edlFrames')).toEqual([]);
      expect(sequenceNode.properties.getValue('edlSources')).toEqual([]);
      expect(sequenceNode.properties.getValue('edlIn')).toEqual([]);
      expect(sequenceNode.properties.getValue('edlOut')).toEqual([]);
      expect(sequenceNode.properties.getValue('autoEDL')).toBe(true);
      expect(sequenceNode.properties.getValue('useCutInfo')).toBe(true);
    });
  });
});
