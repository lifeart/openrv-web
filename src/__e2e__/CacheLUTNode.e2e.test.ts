/**
 * CacheLUTNode E2E Integration Tests
 *
 * Verifies the full wiring of the CacheLUTNode:
 *   1. Side-effect import triggers NodeFactory registration via @RegisterNode decorator
 *   2. NodeFactory.create('CacheLUT') produces a valid CacheLUTNode instance
 *   3. The created node has correct type, properties, and functional behavior
 *   4. LUT generation, caching, invalidation, and pixel processing work end-to-end
 *   5. Graph evaluation pipeline (source -> CacheLUT -> output) works correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Side-effect import: triggers @RegisterNode('CacheLUT') decorator execution,
// which calls NodeFactory.register('CacheLUT', ...) at module scope.
import '../nodes/CacheLUTNode';

import { NodeFactory } from '../nodes/base/NodeFactory';
import {
  CacheLUTNode,
  generateLUT3D,
  lookupLUT3D,
  applyColorTransform,
  DEFAULT_TRANSFORM_PARAMS,
  type ColorTransformParams,
} from '../nodes/CacheLUTNode';
import { IPNode } from '../nodes/base/IPNode';
import { IPImage } from '../core/image/Image';
import type { EvalContext } from '../core/graph/Graph';
import { Graph } from '../core/graph/Graph';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple source node that returns a fixed image. */
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

/** Create a float32 RGBA test image with a known gradient pattern. */
function createTestImage(width: number, height: number): IPImage {
  const img = new IPImage({
    width,
    height,
    channels: 4,
    dataType: 'float32',
  });
  const data = img.getTypedArray() as Float32Array;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = x / Math.max(width - 1, 1);     // R: horizontal ramp
      data[idx + 1] = y / Math.max(height - 1, 1); // G: vertical ramp
      data[idx + 2] = 0.5;                          // B: constant mid
      data[idx + 3] = 1.0;                          // A: opaque
    }
  }
  return img;
}

/** Create a uint8 RGBA test image with known values. */
function createUint8TestImage(width: number, height: number): IPImage {
  const img = new IPImage({
    width,
    height,
    channels: 4,
    dataType: 'uint8',
  });
  const data = img.getTypedArray() as Uint8Array;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = Math.round((x / Math.max(width - 1, 1)) * 255);
      data[idx + 1] = Math.round((y / Math.max(height - 1, 1)) * 255);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  return img;
}

function createEvalContext(frame = 1): EvalContext {
  return { frame, width: 1920, height: 1080, quality: 'full' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CacheLUTNode E2E Integration', () => {
  // =========================================================================
  // 1. NodeFactory registration (side-effect import wiring)
  // =========================================================================
  describe('NodeFactory registration', () => {
    it('CLUT-E2E-001: CacheLUT is registered in NodeFactory after side-effect import', () => {
      expect(NodeFactory.isRegistered('CacheLUT')).toBe(true);
    });

    it('CLUT-E2E-002: CacheLUT appears in getRegisteredTypes list', () => {
      const types = NodeFactory.getRegisteredTypes();
      expect(types).toContain('CacheLUT');
    });

    it('CLUT-E2E-003: NodeFactory.create("CacheLUT") returns a non-null node', () => {
      const node = NodeFactory.create('CacheLUT');
      expect(node).not.toBeNull();
    });

    it('CLUT-E2E-004: factory-created node is an instance of CacheLUTNode', () => {
      const node = NodeFactory.create('CacheLUT');
      expect(node).toBeInstanceOf(CacheLUTNode);
    });

    it('CLUT-E2E-005: factory-created node has correct type string', () => {
      const node = NodeFactory.create('CacheLUT');
      expect(node!.type).toBe('CacheLUT');
    });

    it('CLUT-E2E-006: factory creates distinct instances on each call', () => {
      const node1 = NodeFactory.create('CacheLUT');
      const node2 = NodeFactory.create('CacheLUT');
      expect(node1).not.toBe(node2);
      expect(node1!.id).not.toBe(node2!.id);
    });
  });

  // =========================================================================
  // 2. Factory-created node has correct default properties
  // =========================================================================
  describe('factory-created node properties', () => {
    let node: CacheLUTNode;

    beforeEach(() => {
      node = NodeFactory.create('CacheLUT') as CacheLUTNode;
    });

    it('CLUT-E2E-010: has default exposure of 0', () => {
      expect(node.properties.getValue('exposure')).toBe(0);
    });

    it('CLUT-E2E-011: has default contrast of 1', () => {
      expect(node.properties.getValue('contrast')).toBe(1);
    });

    it('CLUT-E2E-012: has default saturation of 1', () => {
      expect(node.properties.getValue('saturation')).toBe(1);
    });

    it('CLUT-E2E-013: has default brightness of 0', () => {
      expect(node.properties.getValue('brightness')).toBe(0);
    });

    it('CLUT-E2E-014: has default gamma of 1', () => {
      expect(node.properties.getValue('gamma')).toBe(1);
    });

    it('CLUT-E2E-015: has default temperature of 0', () => {
      expect(node.properties.getValue('temperature')).toBe(0);
    });

    it('CLUT-E2E-016: has default tint of 0', () => {
      expect(node.properties.getValue('tint')).toBe(0);
    });

    it('CLUT-E2E-017: has default LUT size of 33', () => {
      expect(node.properties.getValue('lutSize')).toBe(33);
    });

    it('CLUT-E2E-018: is enabled by default', () => {
      expect(node.properties.getValue('enabled')).toBe(true);
    });

    it('CLUT-E2E-019: default parameters represent identity transform', () => {
      expect(node.isIdentityTransform()).toBe(true);
    });
  });

  // =========================================================================
  // 3. LUT generation and caching through factory-created node
  // =========================================================================
  describe('LUT generation and caching', () => {
    let node: CacheLUTNode;

    beforeEach(() => {
      node = NodeFactory.create('CacheLUT') as CacheLUTNode;
    });

    it('CLUT-E2E-020: LUT is not valid before first access', () => {
      expect(node.isLUTValid()).toBe(false);
    });

    it('CLUT-E2E-021: getLUT generates a 33^3 LUT by default', () => {
      const lut = node.getLUT();
      expect(lut.size).toBe(33);
      expect(lut.data.length).toBe(33 * 33 * 33 * 3);
      expect(lut.data).toBeInstanceOf(Float32Array);
    });

    it('CLUT-E2E-022: LUT becomes valid after generation', () => {
      node.getLUT();
      expect(node.isLUTValid()).toBe(true);
    });

    it('CLUT-E2E-023: same LUT object is returned on repeated access', () => {
      const lut1 = node.getLUT();
      const lut2 = node.getLUT();
      expect(lut1).toBe(lut2);
    });

    it('CLUT-E2E-024: changing a property invalidates the LUT cache', () => {
      const lut1 = node.getLUT();
      expect(node.isLUTValid()).toBe(true);

      node.properties.setValue('exposure', 1.5);
      expect(node.isLUTValid()).toBe(false);

      const lut2 = node.getLUT();
      expect(lut2).not.toBe(lut1);
    });

    it('CLUT-E2E-025: changing LUT size regenerates with correct dimensions', () => {
      node.properties.setValue('lutSize', 17);
      const lut = node.getLUT();
      expect(lut.size).toBe(17);
      expect(lut.data.length).toBe(17 * 17 * 17 * 3);
    });

    it('CLUT-E2E-026: invalidateLUT forces regeneration', () => {
      const lut1 = node.getLUT();
      node.invalidateLUT();
      expect(node.isLUTValid()).toBe(false);

      const lut2 = node.getLUT();
      expect(lut2).not.toBe(lut1);
    });

    it('CLUT-E2E-027: identity LUT preserves corner values', () => {
      const lut = node.getLUT();

      // Black corner (0,0,0) -> (0,0,0)
      const [r0, g0, b0] = lookupLUT3D(0, 0, 0, lut);
      expect(r0).toBeCloseTo(0, 4);
      expect(g0).toBeCloseTo(0, 4);
      expect(b0).toBeCloseTo(0, 4);

      // White corner (1,1,1) -> (1,1,1)
      const [r1, g1, b1] = lookupLUT3D(1, 1, 1, lut);
      expect(r1).toBeCloseTo(1, 4);
      expect(g1).toBeCloseTo(1, 4);
      expect(b1).toBeCloseTo(1, 4);
    });
  });

  // =========================================================================
  // 4. Graph evaluation pipeline: source -> CacheLUT -> output
  // =========================================================================
  describe('graph evaluation pipeline', () => {
    let node: CacheLUTNode;
    let ctx: EvalContext;

    beforeEach(() => {
      node = NodeFactory.create('CacheLUT') as CacheLUTNode;
      ctx = createEvalContext();
    });

    it('CLUT-E2E-030: passes through image unchanged when identity transform', () => {
      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(ctx);
      // Identity transform: should pass through the exact same image reference
      expect(result).toBe(inputImage);
    });

    it('CLUT-E2E-031: passes through image unchanged when disabled', () => {
      node.properties.setValue('enabled', false);
      node.properties.setValue('exposure', 2); // Non-identity, but disabled

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(ctx);
      expect(result).toBe(inputImage);
    });

    it('CLUT-E2E-032: returns null when no input is connected', () => {
      node.properties.setValue('exposure', 1);
      const result = node.evaluate(ctx);
      expect(result).toBeNull();
    });

    it('CLUT-E2E-033: applies exposure transform to produce new image', () => {
      node.properties.setValue('exposure', 1); // Double brightness

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(ctx);
      expect(result).not.toBeNull();
      expect(result).not.toBe(inputImage); // New image, not pass-through

      const inputData = inputImage.getTypedArray() as Float32Array;
      const outputData = result!.getTypedArray() as Float32Array;

      // For pixel (1,0): R = 1/3 ~ 0.333, with exposure=1 should approximately double
      const inR = inputData[4]!;
      const outR = outputData[4]!;
      expect(outR).toBeGreaterThan(inR);
    });

    it('CLUT-E2E-034: preserves alpha channel after transform', () => {
      node.properties.setValue('exposure', 1);

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(ctx);
      const outputData = result!.getTypedArray() as Float32Array;

      for (let i = 0; i < 4 * 4; i++) {
        expect(outputData[i * 4 + 3]).toBe(1.0);
      }
    });

    it('CLUT-E2E-035: preserves image dimensions after transform', () => {
      node.properties.setValue('contrast', 1.5);

      const inputImage = createTestImage(8, 6);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(ctx);
      expect(result!.width).toBe(8);
      expect(result!.height).toBe(6);
      expect(result!.channels).toBe(4);
      expect(result!.dataType).toBe('float32');
    });

    it('CLUT-E2E-036: handles uint8 image data correctly', () => {
      node.properties.setValue('exposure', 1);

      const inputImage = createUint8TestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result = node.evaluate(ctx);
      expect(result).not.toBeNull();
      expect(result!.dataType).toBe('uint8');

      // Pixel values should have changed
      const inputData = inputImage.getTypedArray() as Uint8Array;
      const outputData = result!.getTypedArray() as Uint8Array;
      // Pixel (1,0) R channel: input = round((1/3)*255) = 85, exposure=1 doubles it
      // so output R should be greater than input R for this low-value pixel
      expect(outputData[1 * 4]!).toBeGreaterThan(inputData[1 * 4]!);
    });

    it('CLUT-E2E-037: chaining multiple CacheLUT nodes applies cumulative transforms', () => {
      const node1 = NodeFactory.create('CacheLUT') as CacheLUTNode;
      const node2 = NodeFactory.create('CacheLUT') as CacheLUTNode;

      node1.properties.setValue('exposure', 1); // Double
      node2.properties.setValue('exposure', 1); // Double again

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node1.connectInput(source);
      node2.connectInput(node1);

      const result = node2.evaluate(ctx);
      expect(result).not.toBeNull();

      // The value should have been doubled twice (roughly quadrupled)
      const inputData = inputImage.getTypedArray() as Float32Array;
      const outputData = result!.getTypedArray() as Float32Array;
      const inR = inputData[4]!; // pixel (1,0) R
      const outR = outputData[4]!;
      // With two +1 exposure stages, we expect approximately 4x increase
      // (trilinear interpolation introduces slight error)
      expect(outR).toBeGreaterThan(inR * 3);
    });

    it('CLUT-E2E-038: re-evaluating with same frame uses cached result', () => {
      node.properties.setValue('exposure', 1);

      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      node.connectInput(source);

      const result1 = node.evaluate(ctx);
      const result2 = node.evaluate(ctx);
      // Same frame, not dirty: should return cached result
      expect(result1).toBe(result2);
    });
  });

  // =========================================================================
  // 5. LUT correctness: direct transform vs LUT lookup comparison
  // =========================================================================
  describe('LUT correctness vs direct computation', () => {
    it('CLUT-E2E-040: LUT lookup matches direct applyColorTransform within tolerance', () => {
      const params: ColorTransformParams = {
        exposure: 0.5,
        contrast: 1.2,
        saturation: 0.8,
        brightness: 0.05,
        gamma: 1.1,
        temperature: 0.1,
        tint: -0.05,
      };

      const lut = generateLUT3D(33, params);

      // Test several sample points
      const testPoints: [number, number, number][] = [
        [0.2, 0.4, 0.6],
        [0.1, 0.9, 0.5],
        [0.5, 0.5, 0.5],
        [0.0, 0.0, 0.0],
        [1.0, 1.0, 1.0],
      ];

      for (const [r, g, b] of testPoints) {
        const [directR, directG, directB] = applyColorTransform(r, g, b, params);
        const [lutR, lutG, lutB] = lookupLUT3D(r, g, b, lut);

        // With 33^3 LUT, trilinear interpolation should be within ~0.02
        expect(lutR).toBeCloseTo(directR, 1);
        expect(lutG).toBeCloseTo(directG, 1);
        expect(lutB).toBeCloseTo(directB, 1);
      }
    });

    it('CLUT-E2E-041: higher LUT size improves accuracy for nonlinear transforms', () => {
      // Use a highly nonlinear transform (gamma + saturation) to guarantee
      // measurable interpolation error in a coarse LUT.
      const params: ColorTransformParams = {
        ...DEFAULT_TRANSFORM_PARAMS,
        gamma: 2.2,
        saturation: 0.5,
        temperature: 0.3,
      };

      const lutSmall = generateLUT3D(3, params);  // Very coarse: only 3^3 = 27 entries
      const lutLarge = generateLUT3D(65, params);

      // Average error across multiple sample points
      const testPoints: [number, number, number][] = [
        [0.37, 0.13, 0.61],
        [0.12, 0.88, 0.44],
        [0.73, 0.29, 0.55],
        [0.41, 0.67, 0.19],
      ];

      let totalErrSmall = 0;
      let totalErrLarge = 0;

      for (const [r, g, b] of testPoints) {
        const [directR, directG, directB] = applyColorTransform(r, g, b, params);
        const [smallR, smallG, smallB] = lookupLUT3D(r, g, b, lutSmall);
        const [largeR, largeG, largeB] = lookupLUT3D(r, g, b, lutLarge);

        totalErrSmall += Math.abs(smallR - directR) + Math.abs(smallG - directG) + Math.abs(smallB - directB);
        totalErrLarge += Math.abs(largeR - directR) + Math.abs(largeG - directG) + Math.abs(largeB - directB);
      }

      // The larger LUT should have strictly less total error
      expect(totalErrLarge).toBeLessThan(totalErrSmall);
      // The coarse LUT should have non-zero error
      expect(totalErrSmall).toBeGreaterThan(0);
    });

    it('CLUT-E2E-042: generateLUT3D throws RangeError for size < 2', () => {
      expect(() => generateLUT3D(1, DEFAULT_TRANSFORM_PARAMS)).toThrow(RangeError);
      expect(() => generateLUT3D(0, DEFAULT_TRANSFORM_PARAMS)).toThrow(RangeError);
      expect(() => generateLUT3D(-1, DEFAULT_TRANSFORM_PARAMS)).toThrow(RangeError);
    });

    it('CLUT-E2E-043: saturation=0 produces grayscale output', () => {
      const params: ColorTransformParams = { ...DEFAULT_TRANSFORM_PARAMS, saturation: 0 };
      const [r, g, b] = applyColorTransform(1, 0, 0, params);
      // All channels should equal the luminance value
      expect(r).toBeCloseTo(g, 5);
      expect(g).toBeCloseTo(b, 5);
    });
  });

  // =========================================================================
  // 6. Graph integration with Graph class
  // =========================================================================
  describe('Graph integration', () => {
    it('CLUT-E2E-050: factory-created node can be added to a Graph', () => {
      const graph = new Graph();
      const node = NodeFactory.create('CacheLUT')!;

      expect(() => graph.addNode(node)).not.toThrow();
    });

    it('CLUT-E2E-051: node connects and evaluates within a Graph', () => {
      const graph = new Graph();
      const inputImage = createTestImage(4, 4);
      const source = new MockSourceNode('Source', inputImage);
      const cacheLUT = NodeFactory.create('CacheLUT') as CacheLUTNode;
      cacheLUT.properties.setValue('exposure', 1);

      graph.addNode(source);
      graph.addNode(cacheLUT);
      cacheLUT.connectInput(source);

      const ctx = createEvalContext();
      const result = cacheLUT.evaluate(ctx);

      expect(result).not.toBeNull();
      expect(result).not.toBe(inputImage);
      expect(result!.width).toBe(4);
      expect(result!.height).toBe(4);
    });
  });

  // =========================================================================
  // 7. Dispose and cleanup
  // =========================================================================
  describe('dispose and cleanup', () => {
    it('CLUT-E2E-060: dispose clears cached LUT', () => {
      const node = NodeFactory.create('CacheLUT') as CacheLUTNode;
      node.getLUT();
      expect(node.isLUTValid()).toBe(true);

      node.dispose();
      expect(node.isLUTValid()).toBe(false);
    });

    it('CLUT-E2E-061: dispose disconnects inputs', () => {
      const node = NodeFactory.create('CacheLUT') as CacheLUTNode;
      const source = new MockSourceNode('Source', createTestImage(2, 2));
      node.connectInput(source);
      expect(node.inputCount).toBe(1);

      node.dispose();
      expect(node.inputCount).toBe(0);
    });

    it('CLUT-E2E-062: dispose can be called multiple times without error', () => {
      const node = NodeFactory.create('CacheLUT') as CacheLUTNode;
      expect(() => {
        node.dispose();
        node.dispose();
      }).not.toThrow();
    });
  });
});
