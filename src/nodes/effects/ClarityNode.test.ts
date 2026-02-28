import { describe, it, expect, beforeEach } from 'vitest';
import { ClarityNode } from './ClarityNode';
import { applyClarity } from '../../ui/components/ViewerEffects';
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

describe('ClarityNode', () => {
  let node: ClarityNode;

  beforeEach(() => {
    node = new ClarityNode();
  });

  it('CLAR-001: isIdentity returns true at default clarity=0', () => {
    expect(node.isIdentity()).toBe(true);
  });

  it('CLAR-002: isIdentity returns false when clarity != 0', () => {
    node.clarity = 50;
    expect(node.isIdentity()).toBe(false);
  });

  it('CLAR-003: enabled=false bypasses effect and returns input reference', () => {
    node.clarity = 50;
    node.enabled = false;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('CLAR-004: mix=0.5 produces blended output', () => {
    const source = createTestImage(8, 8);
    const srcData = source.getTypedArray();

    // Full effect
    const fullNode = new ClarityNode();
    fullNode.clarity = 50;
    const fullResult = wireAndEvaluate(source, fullNode)!;
    const fullData = fullResult.getTypedArray();

    // Half effect
    const halfNode = new ClarityNode();
    halfNode.clarity = 50;
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

  it('CLAR-005: clarity is clamped to max=100 when set to 999', () => {
    node.clarity = 999;
    expect(node.clarity).toBe(100);
  });

  it('CLAR-006: property change marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);
    node.clarity = 50;
    expect(node.isDirty).toBe(true);
  });

  it('CLAR-007: same-frame evaluation uses cache', () => {
    node.clarity = 50;
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

  it('CLAR-008: pixel correctness for uint8 image', () => {
    node.clarity = 50;
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Compute expected output using applyClarity directly
    const expected = source.deepClone();
    const imageData = expected.toImageData();
    applyClarity(imageData, 50);
    expected.fromImageData(imageData);

    const resData = result!.getTypedArray();
    const expData = expected.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBe(expData[i]);
    }
  });

  it('CLAR-009: pixel correctness for float32 image', () => {
    node.clarity = 50;
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Compute expected output using applyClarity directly
    const expected = source.deepClone();
    const imageData = expected.toImageData();
    applyClarity(imageData, 50);
    expected.fromImageData(imageData);

    const resData = result!.getTypedArray();
    const expData = expected.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBeCloseTo(expData[i]!, 5);
    }
  });

  it('CLAR-010: alpha channel is preserved', () => {
    node.clarity = 80;
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

  it('CLAR-011: 1-channel and 3-channel images do not throw', () => {
    node.clarity = 50;

    const source1ch = createTestImage(4, 4, 1, 'uint8');
    expect(() => wireAndEvaluate(source1ch, node)).not.toThrow();

    const node2 = new ClarityNode();
    node2.clarity = 50;
    const source3ch = createTestImage(4, 4, 3, 'uint8');
    expect(() => wireAndEvaluate(source3ch, node2)).not.toThrow();
    const result = wireAndEvaluate(source3ch, new ClarityNode());
    expect(result).not.toBeNull();
  });

  it('CLAR-012: 1x1 image edge case', () => {
    node.clarity = 50;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('CLAR-013: mix=0 returns output equivalent to input', () => {
    node.clarity = 80;
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

  it('CLAR-014: dispose called twice does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
