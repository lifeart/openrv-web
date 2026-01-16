/**
 * StackGroupNode Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StackGroupNode } from './StackGroupNode';
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

describe('StackGroupNode', () => {
  let stackNode: StackGroupNode;
  let mockContext: EvalContext;

  beforeEach(() => {
    stackNode = new StackGroupNode('TestStack');
    mockContext = { frame: 1, width: 1920, height: 1080, quality: 'full' };
  });

  describe('initialization', () => {
    it('has correct type', () => {
      expect(stackNode.type).toBe('RVStackGroup');
    });

    it('has correct default name', () => {
      const defaultNode = new StackGroupNode();
      expect(defaultNode.name).toBe('Stack');
    });

    it('has composite property', () => {
      expect(stackNode.properties.has('composite')).toBe(true);
      expect(stackNode.properties.getValue('composite')).toBe('replace');
    });

    it('has mode property', () => {
      expect(stackNode.properties.has('mode')).toBe(true);
      expect(stackNode.properties.getValue('mode')).toBe('wipe');
    });

    it('has wipe position properties', () => {
      expect(stackNode.properties.getValue('wipeX')).toBe(0.5);
      expect(stackNode.properties.getValue('wipeY')).toBe(0.5);
      expect(stackNode.properties.getValue('wipeAngle')).toBe(0);
    });
  });

  describe('getActiveInputIndex', () => {
    it('STN-001: returns 0 for single input', () => {
      const input = new MockInputNode('Input');
      stackNode.connectInput(input);

      expect(stackNode.getActiveInputIndex(mockContext)).toBe(0);
    });

    it('returns input based on wipe position', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      stackNode.connectInput(input1);
      stackNode.connectInput(input2);

      // wipeX = 0.5 (default) should return input 1
      expect(stackNode.getActiveInputIndex(mockContext)).toBe(1);

      // wipeX < 0.5 should return input 0
      stackNode.properties.setValue('wipeX', 0.3);
      expect(stackNode.getActiveInputIndex(mockContext)).toBe(0);

      // wipeX >= 0.5 should return input 1
      stackNode.properties.setValue('wipeX', 0.7);
      expect(stackNode.getActiveInputIndex(mockContext)).toBe(1);
    });

    it('returns 0 for non-wipe modes', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      stackNode.connectInput(input1);
      stackNode.connectInput(input2);

      stackNode.properties.setValue('mode', 'blend');
      expect(stackNode.getActiveInputIndex(mockContext)).toBe(0);
    });

    it('returns 0 when no inputs', () => {
      expect(stackNode.getActiveInputIndex(mockContext)).toBe(0);
    });
  });

  describe('getWipePosition', () => {
    it('returns current wipe position', () => {
      const position = stackNode.getWipePosition();

      expect(position.x).toBe(0.5);
      expect(position.y).toBe(0.5);
      expect(position.angle).toBe(0);
    });

    it('reflects property changes', () => {
      stackNode.properties.setValue('wipeX', 0.3);
      stackNode.properties.setValue('wipeY', 0.7);
      stackNode.properties.setValue('wipeAngle', 45);

      const position = stackNode.getWipePosition();

      expect(position.x).toBe(0.3);
      expect(position.y).toBe(0.7);
      expect(position.angle).toBe(45);
    });
  });

  describe('setWipePosition', () => {
    it('sets wipe X position', () => {
      stackNode.setWipePosition(0.25);

      expect(stackNode.properties.getValue('wipeX')).toBe(0.25);
    });

    it('sets both X and Y when Y provided', () => {
      stackNode.setWipePosition(0.3, 0.8);

      expect(stackNode.properties.getValue('wipeX')).toBe(0.3);
      expect(stackNode.properties.getValue('wipeY')).toBe(0.8);
    });

    it('clamps X to 0-1 range', () => {
      stackNode.setWipePosition(-0.5);
      expect(stackNode.properties.getValue('wipeX')).toBe(0);

      stackNode.setWipePosition(1.5);
      expect(stackNode.properties.getValue('wipeX')).toBe(1);
    });

    it('clamps Y to 0-1 range', () => {
      stackNode.setWipePosition(0.5, -0.5);
      expect(stackNode.properties.getValue('wipeY')).toBe(0);

      stackNode.setWipePosition(0.5, 1.5);
      expect(stackNode.properties.getValue('wipeY')).toBe(1);
    });
  });

  describe('STN-002: blend mode support', () => {
    it('has blend mode property', () => {
      stackNode.properties.setValue('composite', 'multiply');
      expect(stackNode.properties.getValue('composite')).toBe('multiply');
    });
  });

  describe('STN-003: layer visibility', () => {
    it('can set wipe to show only first layer', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      stackNode.connectInput(input1);
      stackNode.connectInput(input2);

      // Set wipe to far left (show first layer)
      stackNode.setWipePosition(0);
      expect(stackNode.getActiveInputIndex(mockContext)).toBe(0);
    });

    it('can set wipe to show only second layer', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');

      stackNode.connectInput(input1);
      stackNode.connectInput(input2);

      // Set wipe to far right (show second layer)
      stackNode.setWipePosition(1);
      expect(stackNode.getActiveInputIndex(mockContext)).toBe(1);
    });
  });
});
