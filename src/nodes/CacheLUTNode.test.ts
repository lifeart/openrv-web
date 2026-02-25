/**
 * CacheLUTNode Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CacheLUTNode,
  generateLUT3D,
  lookupLUT3D,
  applyColorTransform,
  DEFAULT_TRANSFORM_PARAMS,
  type ColorTransformParams,
} from './CacheLUTNode';
import { IPImage } from '../core/image/Image';
import type { EvalContext } from '../core/graph/Graph';
import { IPNode } from './base/IPNode';

// Simple mock input node
class MockSourceNode extends IPNode {
  private outputImage: IPImage | null;

  constructor(name: string, image?: IPImage) {
    super('MockSource', name);
    this.outputImage = image ?? null;
  }

  protected process(): IPImage | null {
    return this.outputImage;
  }
}

function createTestImage(width: number, height: number): IPImage {
  const img = new IPImage({
    width,
    height,
    channels: 4,
    dataType: 'float32',
  });
  const data = img.getTypedArray() as Float32Array;
  // Fill with a known pattern: ramp from 0 to 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = x / (width - 1);     // R
      data[idx + 1] = y / (height - 1); // G
      data[idx + 2] = 0.5;              // B
      data[idx + 3] = 1.0;              // A
    }
  }
  return img;
}

describe('CacheLUTNode', () => {
  let node: CacheLUTNode;
  let mockContext: EvalContext;

  beforeEach(() => {
    node = new CacheLUTNode('TestCacheLUT');
    mockContext = { frame: 1, width: 1920, height: 1080, quality: 'full' };
  });

  describe('initialization', () => {
    it('CLN-001: has correct type', () => {
      expect(node.type).toBe('CacheLUT');
    });

    it('CLN-002: has default transform parameters', () => {
      expect(node.properties.getValue('exposure')).toBe(0);
      expect(node.properties.getValue('contrast')).toBe(1);
      expect(node.properties.getValue('saturation')).toBe(1);
      expect(node.properties.getValue('brightness')).toBe(0);
      expect(node.properties.getValue('gamma')).toBe(1);
      expect(node.properties.getValue('temperature')).toBe(0);
      expect(node.properties.getValue('tint')).toBe(0);
    });

    it('CLN-003: has default LUT size of 33', () => {
      expect(node.properties.getValue('lutSize')).toBe(33);
    });

    it('CLN-004: is enabled by default', () => {
      expect(node.properties.getValue('enabled')).toBe(true);
    });

    it('CLN-005: has correct default name', () => {
      const defaultNode = new CacheLUTNode();
      expect(defaultNode.name).toBe('CacheLUT');
    });
  });

  describe('getTransformParams', () => {
    it('CLN-010: returns current transform parameters', () => {
      node.properties.setValue('exposure', 1.5);
      node.properties.setValue('contrast', 1.2);

      const params = node.getTransformParams();
      expect(params.exposure).toBe(1.5);
      expect(params.contrast).toBe(1.2);
      expect(params.saturation).toBe(1);
      expect(params.brightness).toBe(0);
      expect(params.gamma).toBe(1);
      expect(params.temperature).toBe(0);
      expect(params.tint).toBe(0);
    });
  });

  describe('isIdentityTransform', () => {
    it('CLN-020: returns true for default parameters', () => {
      expect(node.isIdentityTransform()).toBe(true);
    });

    it('CLN-021: returns false when exposure is changed', () => {
      node.properties.setValue('exposure', 0.5);
      expect(node.isIdentityTransform()).toBe(false);
    });

    it('CLN-022: returns false when contrast is changed', () => {
      node.properties.setValue('contrast', 1.5);
      expect(node.isIdentityTransform()).toBe(false);
    });

    it('CLN-023: returns false when saturation is changed', () => {
      node.properties.setValue('saturation', 0.5);
      expect(node.isIdentityTransform()).toBe(false);
    });
  });

  describe('LUT caching', () => {
    it('CLN-030: generates LUT on first access', () => {
      expect(node.isLUTValid()).toBe(false);

      const lut = node.getLUT();
      expect(lut).toBeDefined();
      expect(lut.size).toBe(33);
      expect(lut.data.length).toBe(33 * 33 * 33 * 3);
    });

    it('CLN-031: caches LUT between accesses', () => {
      const lut1 = node.getLUT();
      const lut2 = node.getLUT();
      expect(lut1).toBe(lut2); // Same object reference
    });

    it('CLN-032: invalidates LUT when parameters change', () => {
      const lut1 = node.getLUT();
      expect(node.isLUTValid()).toBe(true);

      node.properties.setValue('exposure', 1);

      expect(node.isLUTValid()).toBe(false);
      const lut2 = node.getLUT();
      expect(lut2).not.toBe(lut1); // Different object
    });

    it('CLN-033: invalidates LUT when size changes', () => {
      const lut1 = node.getLUT();
      node.properties.setValue('lutSize', 17);

      const lut2 = node.getLUT();
      expect(lut2.size).toBe(17);
      expect(lut2).not.toBe(lut1);
    });

    it('CLN-034: invalidateLUT forces regeneration', () => {
      const lut1 = node.getLUT();
      node.invalidateLUT();

      expect(node.isLUTValid()).toBe(false);
      const lut2 = node.getLUT();
      expect(lut2).not.toBe(lut1);
    });

    it('CLN-035: isLUTValid returns true after generation', () => {
      expect(node.isLUTValid()).toBe(false);
      node.getLUT();
      expect(node.isLUTValid()).toBe(true);
    });
  });

  describe('evaluation', () => {
    it('CLN-040: passes through input when disabled', () => {
      node.properties.setValue('enabled', false);
      node.properties.setValue('exposure', 2); // Non-identity

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(mockContext);
      expect(result).toBe(inputImage); // Same reference - passed through
    });

    it('CLN-041: passes through input when identity transform', () => {
      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(mockContext);
      expect(result).toBe(inputImage);
    });

    it('CLN-042: returns null when no input', () => {
      node.properties.setValue('exposure', 1);

      const result = node.evaluate(mockContext);
      expect(result).toBeNull();
    });

    it('CLN-043: applies transform when not identity', () => {
      node.properties.setValue('exposure', 1); // Double brightness

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(mockContext);
      expect(result).not.toBeNull();
      expect(result).not.toBe(inputImage); // Should be a new image

      // Check that pixel values changed
      const inputData = inputImage.getTypedArray();
      const outputData = result!.getTypedArray();

      // First pixel R channel should be 0 (exposure of 0 = 0)
      // But pixel at (1,0) should have higher R value after exposure
      expect(outputData[4]).toBeGreaterThan(inputData[4]!); // idx 4 = pixel(1,0).R
    });

    it('CLN-044: preserves alpha channel', () => {
      node.properties.setValue('exposure', 1);

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(mockContext);
      const outputData = result!.getTypedArray();

      // Alpha should be 1.0 for all pixels
      for (let i = 0; i < 4 * 4; i++) {
        expect(outputData[i * 4 + 3]).toBe(1.0);
      }
    });
  });

  describe('maxVal default case', () => {
    it('CLN-045: process uses maxVal=1 for float32 (and unknown dataType via default)', () => {
      // Fix: switch(output.dataType) has default case that falls through to maxVal=1
      // For float32, maxVal is 1. This test verifies the LUT is applied correctly
      // with float32 normalization (dividing by 1, i.e., no normalization).
      node.properties.setValue('exposure', 1); // Double brightness

      const inputImage = createTestImage(2, 2);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(mockContext);
      expect(result).not.toBeNull();

      const outputData = result!.getTypedArray();
      // Pixel (1,0) has R = 1/(2-1) = 1.0 in a 2x2 image
      // With exposure=1, value doubles: 1.0 * 2 = 2.0, but clamped to 1.0
      // Pixel (0,0) has R = 0, exposure doesn't help: 0 * 2 = 0
      expect(outputData[0]).toBe(0); // R of pixel (0,0) stays 0
      // Alpha should be preserved
      expect(outputData[3]).toBe(1.0);
    });
  });

  describe('dispose', () => {
    it('CLN-050: clears cached LUT on dispose', () => {
      node.getLUT();
      expect(node.isLUTValid()).toBe(true);

      node.dispose();
      expect(node.isLUTValid()).toBe(false);
    });
  });
});

describe('generateLUT3D', () => {
  it('LUT-001: generates correct size', () => {
    const lut = generateLUT3D(5, DEFAULT_TRANSFORM_PARAMS);
    expect(lut.size).toBe(5);
    expect(lut.data.length).toBe(5 * 5 * 5 * 3);
  });

  it('LUT-002: identity transform produces identity LUT', () => {
    const lut = generateLUT3D(5, DEFAULT_TRANSFORM_PARAMS);

    // Corner points should map to themselves
    // (0,0,0) -> (0,0,0)
    expect(lut.data[0]).toBeCloseTo(0, 5);
    expect(lut.data[1]).toBeCloseTo(0, 5);
    expect(lut.data[2]).toBeCloseTo(0, 5);

    // (1,1,1) -> (1,1,1)
    const lastIdx = (4 * 25 + 4 * 5 + 4) * 3;
    expect(lut.data[lastIdx]).toBeCloseTo(1, 5);
    expect(lut.data[lastIdx + 1]).toBeCloseTo(1, 5);
    expect(lut.data[lastIdx + 2]).toBeCloseTo(1, 5);
  });

  it('LUT-003: exposure adjustment increases values', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, exposure: 1 };
    const lut = generateLUT3D(3, params);

    // Middle gray (0.5, 0.5, 0.5) with +1 exposure should be doubled
    const midIdx = (1 * 9 + 1 * 3 + 1) * 3; // (1,1,1) in a 3x3x3 LUT = mid
    expect(lut.data[midIdx]).toBeGreaterThan(0.5);
  });

  it('LUT-004: generates 33^3 LUT', () => {
    const lut = generateLUT3D(33, DEFAULT_TRANSFORM_PARAMS);
    expect(lut.data.length).toBe(33 * 33 * 33 * 3);
  });
});

describe('lookupLUT3D', () => {
  it('LLUT-001: identity LUT returns input values', () => {
    const lut = generateLUT3D(5, DEFAULT_TRANSFORM_PARAMS);

    const [r, g, b] = lookupLUT3D(0.5, 0.3, 0.7, lut);
    expect(r).toBeCloseTo(0.5, 1);
    expect(g).toBeCloseTo(0.3, 1);
    expect(b).toBeCloseTo(0.7, 1);
  });

  it('LLUT-002: corner values are exact', () => {
    const lut = generateLUT3D(5, DEFAULT_TRANSFORM_PARAMS);

    const [r0, g0, b0] = lookupLUT3D(0, 0, 0, lut);
    expect(r0).toBeCloseTo(0, 5);
    expect(g0).toBeCloseTo(0, 5);
    expect(b0).toBeCloseTo(0, 5);

    const [r1, g1, b1] = lookupLUT3D(1, 1, 1, lut);
    expect(r1).toBeCloseTo(1, 5);
    expect(g1).toBeCloseTo(1, 5);
    expect(b1).toBeCloseTo(1, 5);
  });

  it('LLUT-003: clamps out-of-range values', () => {
    const lut = generateLUT3D(5, DEFAULT_TRANSFORM_PARAMS);

    const [r, g, b] = lookupLUT3D(-0.5, 1.5, 0.5, lut);
    // Should be clamped to valid range
    expect(r).toBeCloseTo(0, 1);
    expect(g).toBeCloseTo(1, 1);
    expect(b).toBeCloseTo(0.5, 1);
  });

  it('LLUT-004: trilinear interpolation works for mid-values', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, exposure: 1 };
    const lut = generateLUT3D(9, params);

    // Test a value between grid points
    const [r, g, b] = lookupLUT3D(0.3, 0.3, 0.3, lut);
    const [rDirect, gDirect, bDirect] = applyColorTransform(0.3, 0.3, 0.3, params);

    // Should be close to the direct computation
    expect(r).toBeCloseTo(rDirect, 1);
    expect(g).toBeCloseTo(gDirect, 1);
    expect(b).toBeCloseTo(bDirect, 1);
  });
});

describe('applyColorTransform', () => {
  it('ACT-001: identity transform returns input', () => {
    const [r, g, b] = applyColorTransform(0.5, 0.3, 0.7, DEFAULT_TRANSFORM_PARAMS);
    expect(r).toBeCloseTo(0.5, 5);
    expect(g).toBeCloseTo(0.3, 5);
    expect(b).toBeCloseTo(0.7, 5);
  });

  it('ACT-002: exposure of 1 doubles values', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, exposure: 1 };
    const [r] = applyColorTransform(0.25, 0, 0, params);
    expect(r).toBeCloseTo(0.5, 2);
  });

  it('ACT-003: zero exposure has no effect', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, exposure: 0 };
    const [r, g, b] = applyColorTransform(0.5, 0.3, 0.7, params);
    expect(r).toBeCloseTo(0.5, 5);
    expect(g).toBeCloseTo(0.3, 5);
    expect(b).toBeCloseTo(0.7, 5);
  });

  it('ACT-004: contrast of 2 increases distance from mid-gray', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, contrast: 2 };
    const [r] = applyColorTransform(0.75, 0.5, 0.5, params);
    // (0.75 - 0.5) * 2 + 0.5 = 1.0
    expect(r).toBeCloseTo(1.0, 5);
  });

  it('ACT-005: saturation of 0 produces grayscale', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, saturation: 0 };
    const [r, g, b] = applyColorTransform(1, 0, 0, params);
    // All channels should be equal (luminance)
    expect(r).toBeCloseTo(g, 5);
    expect(g).toBeCloseTo(b, 5);
  });

  it('ACT-006: brightness adds offset', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, brightness: 0.1 };
    const [r] = applyColorTransform(0.5, 0.5, 0.5, params);
    // After brightness: 0.5 + 0.1 = 0.6, then contrast at 1 keeps at 0.6, then sat=1 keeps, then gamma=1 keeps
    expect(r).toBeCloseTo(0.6, 2);
  });

  it('ACT-007: gamma correction adjusts curve', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, gamma: 2.2 };
    const [r] = applyColorTransform(0.5, 0.5, 0.5, params);
    // pow(0.5, 1/2.2) ~ 0.73
    expect(r).toBeCloseTo(Math.pow(0.5, 1 / 2.2), 2);
  });

  it('ACT-008: temperature shifts red-blue axis', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, temperature: 1 };
    const [r, , b] = applyColorTransform(0.5, 0.5, 0.5, params);
    // Warmer: red should increase, blue should decrease
    expect(r).toBeGreaterThan(0.5);
    expect(b).toBeLessThan(0.5);
  });

  it('ACT-009: tint shifts green axis', () => {
    const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, tint: 1 };
    const [, g] = applyColorTransform(0.5, 0.5, 0.5, params);
    expect(g).toBeGreaterThan(0.5);
  });
});
