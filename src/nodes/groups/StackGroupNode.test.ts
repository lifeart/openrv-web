/**
 * StackGroupNode Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StackGroupNode } from './StackGroupNode';
import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

// Simple mock node for testing (returns null)
class MockInputNode extends IPNode {
  constructor(name: string) {
    super('MockInput', name);
  }

  protected process(): IPImage | null {
    return null;
  }
}

/**
 * Mock input node that returns a solid-color IPImage.
 * Creates a uint8 RGBA image filled with the given color.
 */
class ColorInputNode extends IPNode {
  private color: { r: number; g: number; b: number; a: number };
  private imgWidth: number;
  private imgHeight: number;

  constructor(name: string, color: { r: number; g: number; b: number; a?: number }, width = 4, height = 4) {
    super('ColorInput', name);
    this.color = { r: color.r, g: color.g, b: color.b, a: color.a ?? 255 };
    this.imgWidth = width;
    this.imgHeight = height;
  }

  protected process(): IPImage | null {
    const channels = 4;
    const data = new ArrayBuffer(this.imgWidth * this.imgHeight * channels);
    const arr = new Uint8Array(data);
    for (let i = 0; i < this.imgWidth * this.imgHeight; i++) {
      arr[i * 4] = this.color.r;
      arr[i * 4 + 1] = this.color.g;
      arr[i * 4 + 2] = this.color.b;
      arr[i * 4 + 3] = this.color.a;
    }
    return new IPImage({
      width: this.imgWidth,
      height: this.imgHeight,
      channels: 4,
      dataType: 'uint8',
      data,
    });
  }
}

/**
 * Helper to get pixel RGBA from an IPImage at the given position.
 */
function getPixel(image: IPImage, x: number, y: number): { r: number; g: number; b: number; a: number } {
  const pixel = image.getPixel(x, y);
  return { r: pixel[0]!, g: pixel[1]!, b: pixel[2]!, a: pixel[3]! };
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
    });

    it('reflects property changes', () => {
      stackNode.properties.setValue('wipeX', 0.3);
      stackNode.properties.setValue('wipeY', 0.7);

      const position = stackNode.getWipePosition();

      expect(position.x).toBe(0.3);
      expect(position.y).toBe(0.7);
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

  describe('layer stencil boxes', () => {
    it('getLayerStencilBox returns DEFAULT_STENCIL_BOX when no boxes set', () => {
      const box = stackNode.getLayerStencilBox(0);
      expect(box).toEqual([0, 1, 0, 1]);
    });

    it('setLayerStencilBox stores and retrieves correctly', () => {
      stackNode.setLayerStencilBox(0, [0.2, 0.8, 0.1, 0.9]);
      const box = stackNode.getLayerStencilBox(0);
      expect(box).toEqual([0.2, 0.8, 0.1, 0.9]);
    });

    it('setLayerStencilBox corrects min > max', () => {
      // xMin > xMax: should be corrected so xMax >= xMin
      stackNode.setLayerStencilBox(0, [0.8, 0.2, 0.7, 0.3]);
      const box = stackNode.getLayerStencilBox(0);
      expect(box[0]).toBe(0.8);
      expect(box[1]).toBeGreaterThanOrEqual(box[0]);
      expect(box[2]).toBe(0.7);
      expect(box[3]).toBeGreaterThanOrEqual(box[2]);
    });

    it('setLayerStencilBox clamps values > 1 or < 0', () => {
      stackNode.setLayerStencilBox(0, [-0.5, 1.5, -0.3, 1.2]);
      const box = stackNode.getLayerStencilBox(0);
      expect(box[0]).toBe(0);
      expect(box[1]).toBe(1);
      expect(box[2]).toBe(0);
      expect(box[3]).toBe(1);
    });

    it('resetLayerStencilBoxes clears all boxes', () => {
      stackNode.setLayerStencilBox(0, [0.2, 0.8, 0.1, 0.9]);
      stackNode.setLayerStencilBox(1, [0.3, 0.7, 0.2, 0.8]);
      stackNode.resetLayerStencilBoxes();
      // After reset, should return default for any index
      expect(stackNode.getLayerStencilBox(0)).toEqual([0, 1, 0, 1]);
      expect(stackNode.getLayerStencilBox(1)).toEqual([0, 1, 0, 1]);
    });

    it('clamped xMin=1.0 edge case produces xMax of 1.0 not 1.001', () => {
      // Both xMin and xMax clamp to 1.0; then min<max correction kicks in
      // but should be capped at 1.0
      stackNode.setLayerStencilBox(0, [1.0, 0.5, 1.0, 0.5]);
      const box = stackNode.getLayerStencilBox(0);
      expect(box[1]).toBeLessThanOrEqual(1);
      expect(box[3]).toBeLessThanOrEqual(1);
    });
  });

  describe('multi-layer compositing via process()', () => {
    describe('basic compositing', () => {
      it('returns null for no inputs', () => {
        stackNode.properties.setValue('mode', 'stack');
        const result = stackNode.evaluate(mockContext);
        expect(result).toBeNull();
      });

      it('returns the single input unchanged', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        stackNode.connectInput(red);
        stackNode.properties.setValue('mode', 'stack');

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(255);
        expect(pixel.g).toBe(0);
        expect(pixel.b).toBe(0);
        expect(pixel.a).toBe(255);
      });

      it('composites two opaque layers with normal blend (top replaces bottom)', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 });
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.properties.setValue('mode', 'stack');

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // With normal blend at full opacity, top layer (green) replaces bottom (red)
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(0);
        expect(pixel.g).toBe(255);
        expect(pixel.b).toBe(0);
      });

      it('composites three layers bottom-to-top', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 });
        const blue = new ColorInputNode('Blue', { r: 0, g: 0, b: 255 });
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.connectInput(blue);
        stackNode.properties.setValue('mode', 'stack');

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Last layer (blue) should be on top with normal blend
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(0);
        expect(pixel.g).toBe(0);
        expect(pixel.b).toBe(255);
      });
    });

    describe('per-layer opacity', () => {
      it('applies per-layer opacity during compositing', () => {
        const black = new ColorInputNode('Black', { r: 0, g: 0, b: 0 });
        const white = new ColorInputNode('White', { r: 255, g: 255, b: 255 });
        stackNode.connectInput(black);
        stackNode.connectInput(white);
        stackNode.properties.setValue('mode', 'stack');

        // Set top layer opacity to 50%
        stackNode.setLayerSettings(1, { opacity: 0.5 });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // White at 50% opacity over black should produce ~128 gray
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBeCloseTo(128, -1);
        expect(pixel.g).toBeCloseTo(128, -1);
        expect(pixel.b).toBeCloseTo(128, -1);
      });

      it('skips layers with zero opacity', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 });
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.properties.setValue('mode', 'stack');

        // Set top layer opacity to 0 (should be skipped)
        stackNode.setLayerSettings(1, { opacity: 0 });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Only red should be visible
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(255);
        expect(pixel.g).toBe(0);
        expect(pixel.b).toBe(0);
      });

      it('applies base layer opacity', () => {
        const white = new ColorInputNode('White', { r: 255, g: 255, b: 255 });
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        stackNode.connectInput(white);
        stackNode.connectInput(red);
        stackNode.properties.setValue('mode', 'stack');

        // Set base layer opacity to 50%
        stackNode.setLayerSettings(0, { opacity: 0.5 });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Red layer at full opacity on top of 50%-alpha white
        // Normal blend: top replaces bottom where top is opaque
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(255);
        expect(pixel.g).toBe(0);
        expect(pixel.b).toBe(0);
      });
    });

    describe('per-layer visibility', () => {
      it('skips invisible layers', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 });
        const blue = new ColorInputNode('Blue', { r: 0, g: 0, b: 255 });
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.connectInput(blue);
        stackNode.properties.setValue('mode', 'stack');

        // Hide the middle layer
        stackNode.setLayerSettings(1, { visible: false });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Blue on top of red (green skipped)
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(0);
        expect(pixel.g).toBe(0);
        expect(pixel.b).toBe(255);
      });

      it('invisible base layer starts with transparent', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0, a: 128 });
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.properties.setValue('mode', 'stack');

        // Hide base layer
        stackNode.setLayerSettings(0, { visible: false });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Only green layer with semi-transparent alpha
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(0);
        expect(pixel.g).toBe(255);
        expect(pixel.b).toBe(0);
        expect(pixel.a).toBe(128);
      });
    });

    describe('per-layer blend modes', () => {
      it('applies multiply blend mode', () => {
        // Gray base, gray top with multiply -> darker
        const gray = new ColorInputNode('Gray', { r: 128, g: 128, b: 128 });
        const gray2 = new ColorInputNode('Gray2', { r: 128, g: 128, b: 128 });
        stackNode.connectInput(gray);
        stackNode.connectInput(gray2);
        stackNode.properties.setValue('mode', 'stack');

        stackNode.setLayerSettings(1, { blendMode: 'multiply' });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Multiply: (128/255)*(128/255) ~ 0.25 -> ~64
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBeCloseTo(64, -1);
      });

      it('applies add blend mode', () => {
        const gray = new ColorInputNode('Gray', { r: 100, g: 100, b: 100 });
        const gray2 = new ColorInputNode('Gray2', { r: 100, g: 100, b: 100 });
        stackNode.connectInput(gray);
        stackNode.connectInput(gray2);
        stackNode.properties.setValue('mode', 'stack');

        stackNode.setLayerSettings(1, { blendMode: 'add' });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Add: 100/255 + 100/255 ~ 0.78 -> ~200
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBeCloseTo(200, -1);
      });

      it('applies screen blend mode', () => {
        const gray = new ColorInputNode('Gray', { r: 128, g: 128, b: 128 });
        const gray2 = new ColorInputNode('Gray2', { r: 128, g: 128, b: 128 });
        stackNode.connectInput(gray);
        stackNode.connectInput(gray2);
        stackNode.properties.setValue('mode', 'stack');

        stackNode.setLayerSettings(1, { blendMode: 'screen' });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Screen: 1-(1-0.5)*(1-0.5) = 0.75 -> ~191
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBeCloseTo(191, -1);
      });

      it('applies difference blend mode', () => {
        const bright = new ColorInputNode('Bright', { r: 200, g: 200, b: 200 });
        const dim = new ColorInputNode('Dim', { r: 100, g: 100, b: 100 });
        stackNode.connectInput(bright);
        stackNode.connectInput(dim);
        stackNode.properties.setValue('mode', 'stack');

        stackNode.setLayerSettings(1, { blendMode: 'difference' });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Difference: |200/255 - 100/255| ~ 0.39 -> ~100
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBeCloseTo(100, -1);
      });

      it('different blend modes per layer', () => {
        const gray = new ColorInputNode('Gray', { r: 128, g: 128, b: 128 });
        const white = new ColorInputNode('White', { r: 255, g: 255, b: 255 });
        const dark = new ColorInputNode('Dark', { r: 50, g: 50, b: 50 });
        stackNode.connectInput(gray);
        stackNode.connectInput(white);
        stackNode.connectInput(dark);
        stackNode.properties.setValue('mode', 'stack');

        // Layer 1: multiply (white * gray = gray ~128)
        stackNode.setLayerSettings(1, { blendMode: 'multiply' });
        // Layer 2: add (gray + dark ~178)
        stackNode.setLayerSettings(2, { blendMode: 'add' });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        const pixel = getPixel(result!, 0, 0);
        // First multiply gray*white = ~128, then add 50 -> ~178
        // Due to normalization: add(128/255, 50/255) = 0.698 -> ~178
        expect(pixel.r).toBeGreaterThan(160);
        expect(pixel.r).toBeLessThan(195);
      });
    });

    describe('global composite type', () => {
      it('uses global composite type as default blend mode', () => {
        const gray = new ColorInputNode('Gray', { r: 128, g: 128, b: 128 });
        const gray2 = new ColorInputNode('Gray2', { r: 128, g: 128, b: 128 });
        stackNode.connectInput(gray);
        stackNode.connectInput(gray2);
        stackNode.properties.setValue('mode', 'stack');

        // Set global composite to 'add'
        stackNode.setCompositeType('add');

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Add: 128/255 + 128/255 > 1 -> clamped to 255
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(255);
      });

      it('per-layer blend mode overrides global composite', () => {
        const gray = new ColorInputNode('Gray', { r: 128, g: 128, b: 128 });
        const gray2 = new ColorInputNode('Gray2', { r: 128, g: 128, b: 128 });
        stackNode.connectInput(gray);
        stackNode.connectInput(gray2);
        stackNode.properties.setValue('mode', 'stack');

        // Global says add, but layer says multiply
        stackNode.setCompositeType('add');
        stackNode.setLayerSettings(1, { blendMode: 'multiply' });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Multiply should be used: (128/255)^2 ~ 0.25 -> ~64
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBeCloseTo(64, -1);
      });

      it('difference composite type produces abs difference', () => {
        const bright = new ColorInputNode('Bright', { r: 200, g: 200, b: 200 });
        const dim = new ColorInputNode('Dim', { r: 50, g: 50, b: 50 });
        stackNode.connectInput(bright);
        stackNode.connectInput(dim);
        stackNode.properties.setValue('mode', 'stack');
        stackNode.setCompositeType('difference');

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // |200/255 - 50/255| ~ 0.588 -> ~150
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBeCloseTo(150, -1);
      });
    });

    describe('wipe mode compositing', () => {
      it('wipe at 0 shows only right (input 1)', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 });
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.setWipePosition(0);

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Wipe at 0: all pixels show input 1 (green) since wipePixelX = 0
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.g).toBe(255);
        expect(pixel.r).toBe(0);
      });

      it('wipe at 1 shows only left (input 0)', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 });
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.setWipePosition(1);

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Wipe at 1: all pixels show input 0 (red) since wipePixelX = width
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(255);
        expect(pixel.g).toBe(0);
      });

      it('wipe at 0.5 shows split between left and right', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 }, 10, 1);
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 }, 10, 1);
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.setWipePosition(0.5);

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Left side (x=0) should be red (input 0)
        const leftPixel = getPixel(result!, 0, 0);
        expect(leftPixel.r).toBe(255);
        expect(leftPixel.g).toBe(0);

        // Right side (x=9) should be green (input 1)
        const rightPixel = getPixel(result!, 9, 0);
        expect(rightPixel.r).toBe(0);
        expect(rightPixel.g).toBe(255);
      });

      it('wipe composites multiple right-side inputs', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 }, 10, 1);
        const black = new ColorInputNode('Black', { r: 0, g: 0, b: 0 }, 10, 1);
        const blue = new ColorInputNode('Blue', { r: 0, g: 0, b: 255 }, 10, 1);
        stackNode.connectInput(red);
        stackNode.connectInput(black);
        stackNode.connectInput(blue);
        stackNode.setWipePosition(0.5);

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Left side should be red (input 0)
        const leftPixel = getPixel(result!, 0, 0);
        expect(leftPixel.r).toBe(255);

        // Right side: composited blue on top of black = blue
        const rightPixel = getPixel(result!, 9, 0);
        expect(rightPixel.r).toBe(0);
        expect(rightPixel.g).toBe(0);
        expect(rightPixel.b).toBe(255);
      });
    });

    describe('ipImageToImageData conversion', () => {
      it('converts uint8 RGBA image correctly', () => {
        const image = new IPImage({
          width: 2, height: 2, channels: 4, dataType: 'uint8',
          data: new Uint8Array([
            255, 0, 0, 255,  0, 255, 0, 255,
            0, 0, 255, 255,  128, 128, 128, 255,
          ]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(image, 2, 2);

        expect(imageData.width).toBe(2);
        expect(imageData.height).toBe(2);
        expect(imageData.data[0]).toBe(255); // R of pixel (0,0)
        expect(imageData.data[1]).toBe(0);   // G of pixel (0,0)
        expect(imageData.data[4]).toBe(0);   // R of pixel (1,0)
        expect(imageData.data[5]).toBe(255); // G of pixel (1,0)
      });

      it('converts float32 RGBA image correctly', () => {
        const image = new IPImage({
          width: 1, height: 1, channels: 4, dataType: 'float32',
          data: new Float32Array([0.5, 0.25, 1.0, 1.0]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(image, 1, 1);

        expect(imageData.data[0]).toBe(128); // 0.5 * 255 = 127.5 -> 128
        expect(imageData.data[1]).toBe(64);  // 0.25 * 255 = 63.75 -> 64
        expect(imageData.data[2]).toBe(255); // 1.0 * 255 = 255
        expect(imageData.data[3]).toBe(255); // 1.0 * 255 = 255
      });

      it('converts 3-channel image (adds alpha=255)', () => {
        const image = new IPImage({
          width: 1, height: 1, channels: 3, dataType: 'uint8',
          data: new Uint8Array([100, 150, 200]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(image, 1, 1);

        expect(imageData.data[0]).toBe(100);
        expect(imageData.data[1]).toBe(150);
        expect(imageData.data[2]).toBe(200);
        expect(imageData.data[3]).toBe(255); // Alpha added
      });

      it('converts 1-channel grayscale image', () => {
        const image = new IPImage({
          width: 1, height: 1, channels: 1, dataType: 'uint8',
          data: new Uint8Array([128]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(image, 1, 1);

        expect(imageData.data[0]).toBe(128); // R = gray
        expect(imageData.data[1]).toBe(128); // G = gray
        expect(imageData.data[2]).toBe(128); // B = gray
        expect(imageData.data[3]).toBe(255); // A = opaque
      });

      it('resizes image when dimensions differ', () => {
        const image = new IPImage({
          width: 2, height: 2, channels: 4, dataType: 'uint8',
          data: new Uint8Array([
            255, 0, 0, 255,  0, 255, 0, 255,
            0, 0, 255, 255,  255, 255, 0, 255,
          ]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(image, 4, 4);

        expect(imageData.width).toBe(4);
        expect(imageData.height).toBe(4);
        // Nearest-neighbor resize should maintain color values
        expect(imageData.data[0]).toBe(255); // Top-left red
      });
    });

    describe('imageDataToIPImage conversion', () => {
      it('creates valid IPImage from ImageData', () => {
        const imageData = new ImageData(2, 2);
        imageData.data[0] = 255; imageData.data[1] = 0; imageData.data[2] = 0; imageData.data[3] = 255;

        const image = StackGroupNode.imageDataToIPImage(imageData);

        expect(image.width).toBe(2);
        expect(image.height).toBe(2);
        expect(image.channels).toBe(4);
        expect(image.dataType).toBe('uint8');

        const pixel = image.getPixel(0, 0);
        expect(pixel[0]).toBe(255);
        expect(pixel[1]).toBe(0);
        expect(pixel[2]).toBe(0);
        expect(pixel[3]).toBe(255);
      });
    });

    describe('edge cases', () => {
      it('handles null inputs in the middle', () => {
        // ConnectInput a real node and a null-returning node
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 });
        const nullNode = new MockInputNode('Null');
        const blue = new ColorInputNode('Blue', { r: 0, g: 0, b: 255 });
        stackNode.connectInput(red);
        stackNode.connectInput(nullNode);
        stackNode.connectInput(blue);
        stackNode.properties.setValue('mode', 'stack');

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Should composite red (bottom) and blue (top), skipping null
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.b).toBe(255);
      });

      it('returns null when all inputs are null', () => {
        const null1 = new MockInputNode('Null1');
        const null2 = new MockInputNode('Null2');
        stackNode.connectInput(null1);
        stackNode.connectInput(null2);
        stackNode.properties.setValue('mode', 'stack');

        const result = stackNode.evaluate(mockContext);
        expect(result).toBeNull();
      });

      it('composites layers with different dimensions', () => {
        // First input is 4x4, second is 2x2 - should resize to 4x4
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 }, 4, 4);
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 }, 2, 2);
        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.properties.setValue('mode', 'stack');

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();
        expect(result!.width).toBe(4);
        expect(result!.height).toBe(4);

        // Green layer resized and composited on top
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.g).toBe(255);
      });

      it('compositeLayers public method works directly', () => {
        const img1 = new IPImage({
          width: 2, height: 2, channels: 4, dataType: 'uint8',
          data: new Uint8Array([
            255, 0, 0, 255,  255, 0, 0, 255,
            255, 0, 0, 255,  255, 0, 0, 255,
          ]).buffer,
        });
        const img2 = new IPImage({
          width: 2, height: 2, channels: 4, dataType: 'uint8',
          data: new Uint8Array([
            0, 0, 255, 255,  0, 0, 255, 255,
            0, 0, 255, 255,  0, 0, 255, 255,
          ]).buffer,
        });

        const result = stackNode.compositeLayers([
          { image: img1, originalIndex: 0 },
          { image: img2, originalIndex: 1 },
        ]);
        expect(result).not.toBeNull();
        expect(result!.width).toBe(2);
        expect(result!.height).toBe(2);

        const pixel = getPixel(result!, 0, 0);
        expect(pixel.b).toBe(255); // Blue on top
      });
    });

    describe('uint16 and float32 input handling', () => {
      it('handles uint16 inputs', () => {
        const img = new IPImage({
          width: 1, height: 1, channels: 4, dataType: 'uint16',
          data: new Uint16Array([32768, 0, 0, 65535]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(img, 1, 1);

        // 32768/65535 * 255 ~ 127
        expect(imageData.data[0]).toBeCloseTo(128, -1);
        expect(imageData.data[3]).toBe(255);
      });

      it('clamps float32 values outside 0-1', () => {
        const img = new IPImage({
          width: 1, height: 1, channels: 4, dataType: 'float32',
          data: new Float32Array([1.5, -0.5, 0.5, 1.0]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(img, 1, 1);

        expect(imageData.data[0]).toBe(255); // 1.5 clamped to 1.0
        expect(imageData.data[1]).toBe(0);   // -0.5 clamped to 0.0
        expect(imageData.data[2]).toBe(128); // 0.5 -> 128
      });
    });

    describe('2-channel grayscale+alpha input handling', () => {
      it('converts 2-channel image as gray+alpha', () => {
        const img = new IPImage({
          width: 1, height: 1, channels: 2, dataType: 'uint8',
          data: new Uint8Array([200, 128]).buffer,
        });

        const imageData = StackGroupNode.ipImageToImageData(img, 1, 1);

        expect(imageData.data[0]).toBe(200); // R = gray
        expect(imageData.data[1]).toBe(200); // G = gray
        expect(imageData.data[2]).toBe(200); // B = gray
        expect(imageData.data[3]).toBe(128); // A from second channel
      });
    });

    describe('complex multi-layer scenarios', () => {
      it('composites 4 layers with mixed blend modes and opacities', () => {
        const base = new ColorInputNode('Base', { r: 128, g: 128, b: 128 });
        const layer1 = new ColorInputNode('Layer1', { r: 255, g: 0, b: 0 });
        const layer2 = new ColorInputNode('Layer2', { r: 0, g: 255, b: 0 });
        const layer3 = new ColorInputNode('Layer3', { r: 0, g: 0, b: 255 });

        stackNode.connectInput(base);
        stackNode.connectInput(layer1);
        stackNode.connectInput(layer2);
        stackNode.connectInput(layer3);
        stackNode.properties.setValue('mode', 'stack');

        stackNode.setLayerSettings(1, { blendMode: 'add', opacity: 0.5 });
        stackNode.setLayerSettings(2, { visible: false });
        stackNode.setLayerSettings(3, { blendMode: 'normal', opacity: 1.0 });

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Layer 2 (green) is invisible, so result should be:
        // Base: gray(128) -> add red at 50% opacity -> blue on top
        // Final result: blue (layer 3 is normal at full opacity)
        const pixel = getPixel(result!, 0, 0);
        expect(pixel.r).toBe(0);
        expect(pixel.g).toBe(0);
        expect(pixel.b).toBe(255);
      });

      it('wipe mode with three layers: left=input0, right=composited(input1+input2)', () => {
        const red = new ColorInputNode('Red', { r: 255, g: 0, b: 0 }, 10, 1);
        const green = new ColorInputNode('Green', { r: 0, g: 255, b: 0 }, 10, 1);
        const halfBlue = new ColorInputNode('HalfBlue', { r: 0, g: 0, b: 255, a: 128 }, 10, 1);

        stackNode.connectInput(red);
        stackNode.connectInput(green);
        stackNode.connectInput(halfBlue);
        stackNode.setWipePosition(0.5);

        const result = stackNode.evaluate(mockContext);
        expect(result).not.toBeNull();

        // Left side (x=0): red
        const leftPixel = getPixel(result!, 0, 0);
        expect(leftPixel.r).toBe(255);
        expect(leftPixel.g).toBe(0);

        // Right side (x=9): semi-transparent blue over green
        const rightPixel = getPixel(result!, 9, 0);
        expect(rightPixel.b).toBeGreaterThan(0);
        expect(rightPixel.g).toBeGreaterThan(0);
      });
    });
  });
});
