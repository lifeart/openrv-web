import { describe, it, expect, beforeEach } from 'vitest';
import { HighlightsShadowsNode } from './HighlightsShadowsNode';
import { applyHighlightsShadows } from '../../ui/components/ViewerEffects';
import { IPImage } from '../../core/image/Image';
import { Graph } from '../../core/graph/Graph';
import { IPNode } from '../base/IPNode';

class TestSourceNode extends IPNode {
  private image: IPImage;
  constructor(image: IPImage) {
    super('TestSource');
    this.image = image;
  }
  protected process(): IPImage | null {
    return this.image;
  }
}

function createTestImage(
  width = 4,
  height = 4,
  channels = 4,
  dataType: 'uint8' | 'float32' = 'uint8',
): IPImage {
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
  return graph.evaluate(1);
}

describe('HighlightsShadowsNode', () => {
  let node: HighlightsShadowsNode;

  beforeEach(() => {
    node = new HighlightsShadowsNode();
  });

  it('HS-001: isIdentity returns true when all parameters are 0 (default)', () => {
    expect(node.highlights).toBe(0);
    expect(node.shadows).toBe(0);
    expect(node.whites).toBe(0);
    expect(node.blacks).toBe(0);
    expect(node.isIdentity()).toBe(true);
  });

  it('HS-002: isIdentity returns false when highlights is non-zero', () => {
    node.highlights = 50;
    expect(node.isIdentity()).toBe(false);
  });

  it('HS-003: bypasses processing when enabled is false', () => {
    node.highlights = 50;
    node.enabled = false;

    const source = createTestImage();
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    expect(result).toBe(source);
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    for (let i = 0; i < srcData.length; i++) {
      expect(resData[i]).toBe(srcData[i]);
    }
  });

  it('HS-004: mix=0.5 produces blended output', () => {
    const source = createTestImage(8, 8);
    const srcData = source.getTypedArray();

    // Full effect
    const fullNode = new HighlightsShadowsNode();
    fullNode.highlights = 50;
    const fullResult = wireAndEvaluate(source, fullNode)!;
    const fullData = fullResult.getTypedArray();

    // Half effect
    const halfNode = new HighlightsShadowsNode();
    halfNode.highlights = 50;
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

  it('HS-005: parameter clamping enforces min and max bounds', () => {
    node.highlights = 999;
    expect(node.highlights).toBe(100);

    node.shadows = -999;
    expect(node.shadows).toBe(-100);
  });

  it('HS-006: changing highlights marks the node as dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);

    node.highlights = 50;
    expect(node.isDirty).toBe(true);
  });

  it('HS-007: cache is valid on repeated evaluation with same frame', () => {
    node.highlights = 50;
    const source = createTestImage();
    const graph = new Graph();
    const sourceNode = new TestSourceNode(source);
    graph.addNode(sourceNode);
    graph.addNode(node);
    node.connectInput(sourceNode);
    graph.setOutputNode(node);

    const result1 = graph.evaluate(1);
    const result2 = graph.evaluate(1);

    expect(result1).toBe(result2);
  });

  it('HS-008: pixel correctness for uint8 image matches reference', () => {
    node.highlights = 50;
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    const refImage = source.deepClone();
    const refImageData = refImage.toImageData();
    applyHighlightsShadows(refImageData, node.getParams());
    refImage.fromImageData(refImageData);

    const resData = result!.getTypedArray();
    const refData = refImage.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBe(refData[i]);
    }
  });

  it('HS-009: pixel correctness for float32 image matches reference', () => {
    node.highlights = 50;
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    const refImage = source.deepClone();
    const refImageData = refImage.toImageData();
    applyHighlightsShadows(refImageData, node.getParams());
    refImage.fromImageData(refImageData);

    const resData = result!.getTypedArray();
    const refData = refImage.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBeCloseTo(refData[i]!, 5);
    }
  });

  it('HS-010: alpha channel is preserved after highlights/shadows adjustment', () => {
    node.highlights = 50;
    const source = createTestImage(4, 4, 4, 'uint8');
    const srcData = source.getTypedArray();
    const alphas: number[] = [];
    for (let i = 3; i < srcData.length; i += 4) {
      alphas.push(srcData[i]!);
    }

    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    const resData = result!.getTypedArray();
    let alphaIdx = 0;
    for (let i = 3; i < resData.length; i += 4) {
      expect(resData[i]).toBe(alphas[alphaIdx]);
      alphaIdx++;
    }
  });

  it('HS-011: handles 1-channel and 3-channel images without errors', () => {
    node.highlights = 50;

    const source1ch = createTestImage(4, 4, 1, 'uint8');
    expect(() => wireAndEvaluate(source1ch, node)).not.toThrow();

    const node2 = new HighlightsShadowsNode();
    node2.highlights = 50;
    const source3ch = createTestImage(4, 4, 3, 'uint8');
    expect(() => wireAndEvaluate(source3ch, node2)).not.toThrow();
  });

  it('HS-012: handles 1x1 edge case', () => {
    node.highlights = 50;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('HS-013: mix=0 returns unchanged source pixels', () => {
    node.highlights = 50;
    node.mix = 0;

    const source = createTestImage();
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    for (let i = 0; i < srcData.length; i++) {
      expect(resData[i]).toBe(srcData[i]);
    }
  });

  it('HS-014: dispose is idempotent and does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
