import { describe, it, expect, beforeEach } from 'vitest';
import { NoiseReductionNode } from './NoiseReductionNode';
import { applyNoiseReduction, isNoiseReductionActive } from '../../filters/NoiseReduction';
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

describe('NoiseReductionNode', () => {
  let node: NoiseReductionNode;

  beforeEach(() => {
    node = new NoiseReductionNode();
  });

  it('NR-001: isIdentity() returns true at default params', () => {
    expect(node.isIdentity()).toBe(true);
    expect(isNoiseReductionActive(node.getParams())).toBe(false);
  });

  it('NR-002: isIdentity() returns false when strength=50', () => {
    node.strength = 50;
    expect(node.isIdentity()).toBe(false);
    expect(isNoiseReductionActive(node.getParams())).toBe(true);
  });

  it('NR-003: enabled=false returns input reference', () => {
    node.enabled = false;
    node.strength = 50;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('NR-004: mix=0.5 produces blended output', () => {
    node.strength = 50;
    node.mix = 0.5;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result).not.toBe(source);

    // Result should be between source and fully-effected
    const fullNode = new NoiseReductionNode();
    fullNode.strength = 50;
    fullNode.mix = 1.0;
    const fullResult = wireAndEvaluate(createTestImage(), fullNode);

    const srcData = source.getTypedArray();
    const mixData = result!.getTypedArray();
    const fullData = fullResult!.getTypedArray();

    // Check several RGB channels are between source and full
    let blendedCount = 0;
    for (let i = 0; i < Math.min(32, srcData.length); i++) {
      if ((i + 1) % 4 === 0) continue; // skip alpha
      const s = srcData[i]!;
      const f = fullData[i]!;
      const m = mixData[i]!;
      if (s !== f) {
        const lo = Math.min(s, f);
        const hi = Math.max(s, f);
        expect(m).toBeGreaterThanOrEqual(lo - 2);
        expect(m).toBeLessThanOrEqual(hi + 2);
        blendedCount++;
      }
    }
    expect(blendedCount).toBeGreaterThan(0);
  });

  it('NR-005: parameter clamping - strength beyond max is clamped', () => {
    node.strength = 999;
    expect(node.strength).toBe(100);

    node.strength = -10;
    expect(node.strength).toBe(0);

    node.radius = 99;
    expect(node.radius).toBe(5);

    node.radius = -5;
    expect(node.radius).toBe(1);
  });

  it('NR-006: dirty propagation - changing param marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);

    node.strength = 30;
    expect(node.isDirty).toBe(true);
  });

  it('NR-007: cache validity - evaluate twice returns same reference', () => {
    node.strength = 50;
    const source = createTestImage();
    const graph = new Graph();
    const sourceNode = new TestSourceNode(source);
    graph.addNode(sourceNode);
    graph.addNode(node);
    node.connectInput(sourceNode);
    graph.setOutputNode(node);

    const first = graph.evaluate(1);
    const second = graph.evaluate(1);
    expect(first).toBe(second);
  });

  it('NR-008: pixel correctness (uint8) - output matches direct applyNoiseReduction call', () => {
    node.strength = 50;
    node.luminanceStrength = 50;
    node.chromaStrength = 75;
    node.radius = 2;

    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply directly via applyNoiseReduction
    const refImage = source.deepClone();
    const imageData = refImage.toImageData();
    applyNoiseReduction(imageData, node.getParams());
    refImage.fromImageData(imageData);

    const resultData = result!.getTypedArray();
    const refData = refImage.getTypedArray();

    for (let i = 0; i < resultData.length; i++) {
      expect(Math.abs(resultData[i]! - refData[i]!)).toBeLessThanOrEqual(1);
    }
  });

  it('NR-009: pixel correctness (float32) - within tolerance', () => {
    node.strength = 50;

    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply directly: toImageData (lossy for float32) then applyNoiseReduction
    const refImage = source.deepClone();
    const imageData = refImage.toImageData();
    applyNoiseReduction(imageData, node.getParams());
    refImage.fromImageData(imageData);

    const resultData = result!.getTypedArray();
    const refData = refImage.getTypedArray();

    for (let i = 0; i < resultData.length; i++) {
      expect(Math.abs(resultData[i]! - refData[i]!)).toBeLessThanOrEqual(0.01);
    }
  });

  it('NR-010: alpha preservation - alpha unchanged after RGBA processing', () => {
    node.strength = 80;
    const source = createTestImage(4, 4, 4, 'uint8');
    const sourceData = source.getTypedArray();
    const alphaValues: number[] = [];
    for (let i = 3; i < sourceData.length; i += 4) {
      alphaValues.push(sourceData[i]!);
    }

    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    const resultData = result!.getTypedArray();

    let alphaIdx = 0;
    for (let i = 3; i < resultData.length; i += 4) {
      expect(resultData[i]).toBe(alphaValues[alphaIdx]);
      alphaIdx++;
    }
  });

  it('NR-011: channel count safety - 1-channel and 3-channel handled', () => {
    node.strength = 50;

    // 1-channel image
    const gray = createTestImage(4, 4, 1, 'uint8');
    const grayResult = wireAndEvaluate(gray, node);
    expect(grayResult).not.toBeNull();
    expect(grayResult!.width).toBe(4);
    expect(grayResult!.height).toBe(4);

    // 3-channel image
    const rgb = createTestImage(4, 4, 3, 'uint8');
    const node2 = new NoiseReductionNode();
    node2.strength = 50;
    const rgbResult = wireAndEvaluate(rgb, node2);
    expect(rgbResult).not.toBeNull();
    expect(rgbResult!.width).toBe(4);
    expect(rgbResult!.height).toBe(4);
  });

  it('NR-012: 1x1 edge case - single pixel processes without crash', () => {
    node.strength = 50;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('NR-013: mix=0 bypass - mix=0 with enabled=true returns unprocessed', () => {
    node.strength = 80;
    node.mix = 0;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // With mix=0, output should match source pixel-for-pixel
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    for (let i = 0; i < srcData.length; i++) {
      expect(resData[i]).toBe(srcData[i]);
    }
  });

  it('NR-014: dispose idempotency - double dispose does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
