import { describe, it, expect, beforeEach } from 'vitest';
import { ToneMappingNode } from './ToneMappingNode';
import { applyToneMappingWithParams } from '../../ui/components/ViewerEffects';
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

describe('ToneMappingNode', () => {
  let node: ToneMappingNode;

  beforeEach(() => {
    node = new ToneMappingNode();
  });

  it('TM-001: isIdentity returns true when operator is "off" (default)', () => {
    expect(node.operator).toBe('off');
    expect(node.isIdentity()).toBe(true);
  });

  it('TM-002: isIdentity returns false when operator is "reinhard"', () => {
    node.operator = 'reinhard';
    expect(node.isIdentity()).toBe(false);
  });

  it('TM-003: bypasses processing when enabled is false', () => {
    node.operator = 'reinhard';
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

  it('TM-004: mix blending interpolates between source and effect', () => {
    node.operator = 'reinhard';
    node.mix = 0.5;

    const source = createTestImage();
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    let anyDifferent = false;
    for (let i = 0; i < srcData.length; i++) {
      if (resData[i] !== srcData[i]) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it('TM-005: parameter clamping enforces max bound on reinhardWhitePoint', () => {
    node.reinhardWhitePoint = 999;
    expect(node.reinhardWhitePoint).toBe(20);
  });

  it('TM-006: changing operator marks the node as dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);

    node.operator = 'reinhard';
    expect(node.isDirty).toBe(true);
  });

  it('TM-007: cache is valid on repeated evaluation with same frame', () => {
    node.operator = 'reinhard';
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

  it('TM-008: pixel correctness for uint8 image matches reference', () => {
    node.operator = 'reinhard';
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    const refImage = source.deepClone();
    const refImageData = refImage.toImageData();
    applyToneMappingWithParams(refImageData, node.getToneMappingState());
    refImage.fromImageData(refImageData);

    const resData = result!.getTypedArray();
    const refData = refImage.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBe(refData[i]);
    }
  });

  it('TM-009: pixel correctness for float32 image matches reference', () => {
    node.operator = 'reinhard';
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    const refImage = source.deepClone();
    const refImageData = refImage.toImageData();
    applyToneMappingWithParams(refImageData, node.getToneMappingState());
    refImage.fromImageData(refImageData);

    const resData = result!.getTypedArray();
    const refData = refImage.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBeCloseTo(refData[i]!, 5);
    }
  });

  it('TM-010: alpha channel is preserved after tone mapping', () => {
    node.operator = 'reinhard';
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

  it('TM-011: handles 1-channel and 3-channel images without errors', () => {
    node.operator = 'reinhard';

    const source1ch = createTestImage(4, 4, 1, 'uint8');
    expect(() => wireAndEvaluate(source1ch, node)).not.toThrow();

    const node2 = new ToneMappingNode();
    node2.operator = 'reinhard';
    const source3ch = createTestImage(4, 4, 3, 'uint8');
    expect(() => wireAndEvaluate(source3ch, node2)).not.toThrow();
  });

  it('TM-012: handles 1x1 edge case', () => {
    node.operator = 'reinhard';
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);

    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('TM-013: mix=0 returns unchanged source pixels', () => {
    node.operator = 'reinhard';
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

  it('TM-014: dispose is idempotent and does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
