import { describe, it, expect, beforeEach } from 'vitest';
import { ColorWheelsNode } from './ColorWheelsNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { Graph } from '../../core/graph/Graph';
import { IPNode } from '../base/IPNode';

const context: EvalContext = { frame: 1, width: 4, height: 4, quality: 'full' };

class TestSourceNode extends IPNode {
  private image: IPImage;
  constructor(image: IPImage) { super('TestSource'); this.image = image; }
  protected process(): IPImage | null { return this.image; }
}

function createTestImage(width = 4, height = 4, channels = 4, dataType: 'uint8' | 'float32' = 'uint8'): IPImage {
  const image = IPImage.createEmpty(width, height, channels, dataType);
  const data = image.getTypedArray();
  for (let i = 0; i < data.length; i++) {
    if (dataType === 'uint8') data[i] = (i * 37 + 50) % 256;
    else data[i] = ((i * 37 + 50) % 256) / 255;
  }
  return image;
}

function wireAndEvaluate(source: IPImage, node: IPNode): IPImage | null {
  const graph = new Graph();
  const sourceNode = new TestSourceNode(source);
  graph.addNode(sourceNode);
  graph.addNode(node);
  node.connectInput(sourceNode);
  graph.setOutputNode(node);
  return graph.evaluateWithContext(context);
}

describe('ColorWheelsNode', () => {
  let node: ColorWheelsNode;

  beforeEach(() => {
    node = new ColorWheelsNode();
  });

  it('CW-001: isIdentity returns true when all parameters are 0', () => {
    expect(node.isIdentity()).toBe(true);
  });

  it('CW-002: isIdentity returns false when liftR != 0', () => {
    node.liftR = 0.5;
    expect(node.isIdentity()).toBe(false);
  });

  it('CW-003: enabled=false bypasses effect and returns input reference', () => {
    node.masterR = 0.5;
    node.enabled = false;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('CW-004: mix=0.5 produces blended output', () => {
    const source = createTestImage(8, 8);
    const srcData = source.getTypedArray();

    // Full effect
    const fullNode = new ColorWheelsNode();
    fullNode.masterR = 0.5;
    const fullResult = wireAndEvaluate(source, fullNode)!;
    const fullData = fullResult.getTypedArray();

    // Half effect
    const halfNode = new ColorWheelsNode();
    halfNode.masterR = 0.5;
    halfNode.mix = 0.5;
    const halfResult = wireAndEvaluate(source, halfNode)!;
    const halfData = halfResult.getTypedArray();

    // Verify blended values are between source and full effect
    let betweenCount = 0;
    for (let i = 0; i < srcData.length; i++) {
      const s = srcData[i]!;
      const f = fullData[i]!;
      const h = halfData[i]!;
      const lo = Math.min(s, f);
      const hi = Math.max(s, f);
      if (h >= lo - 1 && h <= hi + 1) betweenCount++;  // tolerance of 1 for rounding
    }
    expect(betweenCount).toBe(srcData.length);
  });

  it('CW-005: parameter is clamped to max=1 when set above range', () => {
    node.liftR = 5.0;
    expect(node.liftR).toBe(1);
    node.masterG = -5.0;
    expect(node.masterG).toBe(-1);
  });

  it('CW-006: property change marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);
    node.liftR = 0.5;
    expect(node.isDirty).toBe(true);
  });

  it('CW-007: same-frame evaluation uses cache', () => {
    node.masterR = 0.5;
    const source = createTestImage();
    const graph = new Graph();
    const sourceNode = new TestSourceNode(source);
    graph.addNode(sourceNode);
    graph.addNode(node);
    node.connectInput(sourceNode);
    graph.setOutputNode(node);
    const result1 = graph.evaluateWithContext(context);
    const result2 = graph.evaluateWithContext(context);
    expect(result1).toBe(result2);
  });

  it('CW-008: pixel correctness for uint8 image - masterR=0.5 matches manual calculation', () => {
    node.masterR = 0.5;
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();

    // With only masterR=0.5 set (all other params = 0), the formula simplifies to:
    //   r_out = clamp((r_in/255 + 0.5*0.5) * 255, 0, 255)
    //   g_out = g_in (unchanged)
    //   b_out = b_in (unchanged)
    //   a_out = a_in (unchanged)
    // Uint8ClampedArray rounds to nearest integer.
    for (let i = 0; i < srcData.length; i += 4) {
      const rIn = srcData[i]!;
      const gIn = srcData[i + 1]!;
      const bIn = srcData[i + 2]!;
      const aIn = srcData[i + 3]!;

      const expectedR = Math.max(0, Math.min(255, Math.round((rIn / 255 + 0.25) * 255)));
      const expectedG = gIn;
      const expectedB = bIn;

      // Tolerance of 1 for rounding differences between Math.round and Uint8ClampedArray
      expect(Math.abs(resData[i]! - expectedR)).toBeLessThanOrEqual(1);    // R
      expect(resData[i + 1]).toBe(expectedG);                               // G: unchanged
      expect(resData[i + 2]).toBe(expectedB);                               // B: unchanged
      expect(resData[i + 3]).toBe(aIn);                                     // A: preserved exactly
    }
  });

  it('CW-009: pixel correctness for float32 image - masterR=0.5 matches manual calculation', () => {
    node.masterR = 0.5;
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();

    // The pipeline for float32: toImageData converts to uint8 (Math.round(clamp(v,0,1)*255)),
    // applyEffect works on uint8 ImageData, then fromImageData converts back to float32 (/255).
    // With only masterR=0.5, the formula is:
    //   r_u8 = Math.round(clamp(srcFloat, 0, 1) * 255)
    //   r_out_u8 = Uint8Clamped(clamp((r_u8/255 + 0.25) * 255, 0, 255))
    //   r_out_float = r_out_u8 / 255
    for (let i = 0; i < srcData.length; i += 4) {
      const rFloat = srcData[i]!;
      const gFloat = srcData[i + 1]!;
      const bFloat = srcData[i + 2]!;
      const aFloat = srcData[i + 3]!;

      // Step 1: toImageData converts float32 to uint8
      const rU8 = Math.round(Math.max(0, Math.min(1, rFloat)) * 255);
      // Step 2: apply masterR offset and clamp back to uint8
      const rOutU8 = Math.max(0, Math.min(255, Math.round((rU8 / 255 + 0.25) * 255)));
      // Step 3: fromImageData converts back to float32
      const expectedR = rOutU8 / 255;

      // G and B go through uint8 roundtrip but are otherwise unchanged
      const gU8 = Math.round(Math.max(0, Math.min(1, gFloat)) * 255);
      const expectedG = gU8 / 255;
      const bU8 = Math.round(Math.max(0, Math.min(1, bFloat)) * 255);
      const expectedB = bU8 / 255;

      expect(resData[i]!).toBeCloseTo(expectedR, 2);       // R: masterR applied
      expect(resData[i + 1]!).toBeCloseTo(expectedG, 2);   // G: roundtrip only
      expect(resData[i + 2]!).toBeCloseTo(expectedB, 2);   // B: roundtrip only
      // Alpha should survive the roundtrip with minimal error
      const aU8 = Math.round(Math.max(0, Math.min(1, aFloat)) * 255);
      const expectedA = aU8 / 255;
      expect(resData[i + 3]!).toBeCloseTo(expectedA, 2);   // A: roundtrip only
    }
  });

  it('CW-010: alpha channel is preserved', () => {
    node.masterR = 0.8;
    const source = createTestImage(4, 4, 4, 'uint8');
    const srcData = source.getTypedArray();
    const originalAlphas: number[] = [];
    for (let i = 3; i < srcData.length; i += 4) {
      originalAlphas.push(srcData[i]!);
    }

    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    const resData = result!.getTypedArray();
    let idx = 0;
    for (let i = 3; i < resData.length; i += 4) {
      expect(resData[i]).toBe(originalAlphas[idx]);
      idx++;
    }
  });

  it('CW-011: 3-channel image does not throw', () => {
    node.masterR = 0.5;
    const source = createTestImage(4, 4, 3, 'uint8');
    expect(() => wireAndEvaluate(source, node)).not.toThrow();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
  });

  it('CW-012: 1x1 image edge case', () => {
    node.masterR = 0.5;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('CW-013: mix=0 returns output equivalent to input', () => {
    node.masterR = 0.8;
    node.mix = 0;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    for (let i = 0; i < srcData.length; i++) {
      expect(resData[i]).toBeCloseTo(srcData[i]!, 1);
    }
  });

  it('CW-014: dispose called twice does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
