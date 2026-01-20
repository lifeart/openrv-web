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

  describe('per-layer compositing', () => {
    it('has default layer properties', () => {
      expect(stackNode.properties.getValue('layerBlendModes')).toEqual([]);
      expect(stackNode.properties.getValue('layerOpacities')).toEqual([]);
      expect(stackNode.properties.getValue('layerVisible')).toEqual([]);
    });

    it('getLayerSettings returns defaults for unconfigured layers', () => {
      const input = new MockInputNode('Input');
      stackNode.connectInput(input);

      const settings = stackNode.getLayerSettings(0);

      expect(settings.blendMode).toBe('normal');
      expect(settings.opacity).toBe(1.0);
      expect(settings.visible).toBe(true);
    });

    it('setLayerSettings updates blend mode for specific layer', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      stackNode.connectInput(input1);
      stackNode.connectInput(input2);

      stackNode.setLayerSettings(1, { blendMode: 'multiply' });

      expect(stackNode.getLayerSettings(0).blendMode).toBe('normal');
      expect(stackNode.getLayerSettings(1).blendMode).toBe('multiply');
    });

    it('setLayerSettings updates opacity for specific layer', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      stackNode.connectInput(input1);
      stackNode.connectInput(input2);

      stackNode.setLayerSettings(0, { opacity: 0.5 });
      stackNode.setLayerSettings(1, { opacity: 0.75 });

      expect(stackNode.getLayerSettings(0).opacity).toBe(0.5);
      expect(stackNode.getLayerSettings(1).opacity).toBe(0.75);
    });

    it('setLayerSettings clamps opacity to 0-1 range', () => {
      const input = new MockInputNode('Input');
      stackNode.connectInput(input);

      stackNode.setLayerSettings(0, { opacity: -0.5 });
      expect(stackNode.getLayerSettings(0).opacity).toBe(0);

      stackNode.setLayerSettings(0, { opacity: 1.5 });
      expect(stackNode.getLayerSettings(0).opacity).toBe(1);
    });

    it('setLayerSettings updates visibility for specific layer', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      stackNode.connectInput(input1);
      stackNode.connectInput(input2);

      stackNode.setLayerSettings(1, { visible: false });

      expect(stackNode.getLayerSettings(0).visible).toBe(true);
      expect(stackNode.getLayerSettings(1).visible).toBe(false);
    });

    it('getAllLayerSettings returns settings for all inputs', () => {
      const input1 = new MockInputNode('Input1');
      const input2 = new MockInputNode('Input2');
      const input3 = new MockInputNode('Input3');
      stackNode.connectInput(input1);
      stackNode.connectInput(input2);
      stackNode.connectInput(input3);

      stackNode.setLayerSettings(0, { blendMode: 'add', opacity: 0.8 });
      stackNode.setLayerSettings(2, { blendMode: 'screen', opacity: 0.6, visible: false });

      const allSettings = stackNode.getAllLayerSettings();

      expect(allSettings).toHaveLength(3);
      expect(allSettings[0]).toEqual({ blendMode: 'add', opacity: 0.8, visible: true });
      expect(allSettings[1]).toEqual({ blendMode: 'normal', opacity: 1.0, visible: true });
      expect(allSettings[2]).toEqual({ blendMode: 'screen', opacity: 0.6, visible: false });
    });

    it('setLayerBlendModes sets all blend modes at once', () => {
      stackNode.setLayerBlendModes(['normal', 'multiply', 'screen']);

      expect(stackNode.properties.getValue('layerBlendModes')).toEqual(['normal', 'multiply', 'screen']);
    });

    it('setLayerOpacities sets all opacities at once', () => {
      stackNode.setLayerOpacities([1.0, 0.5, 0.25]);

      expect(stackNode.properties.getValue('layerOpacities')).toEqual([1.0, 0.5, 0.25]);
    });

    it('setLayerOpacities clamps values to 0-1', () => {
      stackNode.setLayerOpacities([-0.5, 1.5, 0.5]);

      expect(stackNode.properties.getValue('layerOpacities')).toEqual([0, 1, 0.5]);
    });
  });

  describe('composite type', () => {
    it('getCompositeType returns default', () => {
      expect(stackNode.getCompositeType()).toBe('replace');
    });

    it('setCompositeType updates composite type', () => {
      stackNode.setCompositeType('over');
      expect(stackNode.getCompositeType()).toBe('over');

      stackNode.setCompositeType('add');
      expect(stackNode.getCompositeType()).toBe('add');

      stackNode.setCompositeType('difference');
      expect(stackNode.getCompositeType()).toBe('difference');
    });
  });

  describe('output and mode properties', () => {
    it('has chosenAudioInput property', () => {
      expect(stackNode.properties.getValue('chosenAudioInput')).toBe(0);
    });

    it('has outOfRangePolicy property', () => {
      expect(stackNode.properties.getValue('outOfRangePolicy')).toBe('hold');
    });

    it('has alignStartFrames property', () => {
      expect(stackNode.properties.getValue('alignStartFrames')).toBe(false);
    });

    it('has strictFrameRanges property', () => {
      expect(stackNode.properties.getValue('strictFrameRanges')).toBe(false);
    });
  });
});
