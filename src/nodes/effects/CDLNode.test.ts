import { describe, it, expect, beforeEach } from 'vitest';
import { CDLNode } from './CDLNode';
import { applyCDLToImageData, isDefaultCDL } from '../../color/CDL';
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

describe('CDLNode', () => {
  let node: CDLNode;

  beforeEach(() => {
    node = new CDLNode();
  });

  it('CDL-001: isIdentity() returns true at default params', () => {
    expect(node.isIdentity()).toBe(true);
    expect(isDefaultCDL(node.getCDLValues())).toBe(true);
  });

  it('CDL-002: isIdentity() returns false when slopeR deviates', () => {
    node.slopeR = 1.5;
    expect(node.isIdentity()).toBe(false);
  });

  it('CDL-003: enabled=false returns input reference', () => {
    node.enabled = false;
    node.slopeR = 1.5;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('CDL-004: mix=0.5 produces blended output', () => {
    node.slopeR = 1.5;
    node.mix = 0.5;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result).not.toBe(source);

    // Result should be between source and fully-effected
    const fullyEffected = new CDLNode();
    fullyEffected.slopeR = 1.5;
    fullyEffected.mix = 1.0;
    const fullResult = wireAndEvaluate(createTestImage(), fullyEffected);

    const srcData = source.getTypedArray();
    const mixData = result!.getTypedArray();
    const fullData = fullResult!.getTypedArray();

    // Check a few non-alpha pixels are between source and full
    for (let i = 0; i < 16; i += 4) {
      // R channel (index 0 of each pixel group) should be blended
      const s = srcData[i]!;
      const f = fullData[i]!;
      const m = mixData[i]!;
      if (s !== f) {
        const lo = Math.min(s, f);
        const hi = Math.max(s, f);
        expect(m).toBeGreaterThanOrEqual(lo - 1);
        expect(m).toBeLessThanOrEqual(hi + 1);
      }
    }
  });

  it('CDL-005: parameter clamping - slopeR=999 clamps to 10, powerR=0.001 clamps to 0.1', () => {
    node.slopeR = 999;
    expect(node.slopeR).toBe(10);

    node.powerR = 0.001;
    expect(node.powerR).toBeCloseTo(0.1);
  });

  it('CDL-006: dirty propagation - changing param marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);

    node.slopeR = 1.2;
    expect(node.isDirty).toBe(true);
  });

  it('CDL-007: cache validity - evaluate twice returns same reference', () => {
    node.slopeR = 1.5;
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

  it('CDL-008: pixel correctness (uint8) - output matches direct applyCDLToImageData', () => {
    node.slopeR = 1.3;
    node.offsetG = 0.05;
    node.powerB = 1.2;
    node.saturation = 0.9;

    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply directly via applyCDLToImageData
    const refImage = source.deepClone();
    const imageData = refImage.toImageData();
    applyCDLToImageData(imageData, node.getCDLValues());
    refImage.fromImageData(imageData);

    const resultData = result!.getTypedArray();
    const refData = refImage.getTypedArray();

    for (let i = 0; i < resultData.length; i++) {
      expect(Math.abs(resultData[i]! - refData[i]!)).toBeLessThanOrEqual(1);
    }
  });

  it('CDL-009: pixel correctness (float32) - within tolerance', () => {
    node.slopeR = 1.3;
    node.offsetG = 0.05;

    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply directly: toImageData (lossy for float32) then applyCDLToImageData
    const refImage = source.deepClone();
    const imageData = refImage.toImageData();
    applyCDLToImageData(imageData, node.getCDLValues());
    refImage.fromImageData(imageData);

    const resultData = result!.getTypedArray();
    const refData = refImage.getTypedArray();

    for (let i = 0; i < resultData.length; i++) {
      expect(Math.abs(resultData[i]! - refData[i]!)).toBeLessThanOrEqual(0.01);
    }
  });

  it('CDL-010: alpha preservation - alpha unchanged after RGBA processing', () => {
    node.slopeR = 2.0;
    node.slopeG = 0.5;
    node.slopeB = 1.5;

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

  it('CDL-011: channel count safety - 1-channel and 3-channel handled', () => {
    node.slopeR = 1.5;

    // 1-channel image
    const gray = createTestImage(4, 4, 1, 'uint8');
    const grayResult = wireAndEvaluate(gray, node);
    expect(grayResult).not.toBeNull();
    expect(grayResult!.width).toBe(4);
    expect(grayResult!.height).toBe(4);

    // 3-channel image
    const rgb = createTestImage(4, 4, 3, 'uint8');
    const node2 = new CDLNode();
    node2.slopeR = 1.5;
    const rgbResult = wireAndEvaluate(rgb, node2);
    expect(rgbResult).not.toBeNull();
    expect(rgbResult!.width).toBe(4);
    expect(rgbResult!.height).toBe(4);
  });

  it('CDL-012: 1x1 edge case - single pixel processes without crash', () => {
    node.slopeR = 1.5;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('CDL-013: mix=0 bypass - mix=0 with enabled=true returns unprocessed', () => {
    node.slopeR = 2.0;
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

  it('CDL-014: dispose idempotency - double dispose does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
