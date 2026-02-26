import { describe, it, expect, beforeEach } from 'vitest';
import { ColorInversionNode } from './ColorInversionNode';
import { applyColorInversion } from '../../color/Inversion';
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

describe('ColorInversionNode', () => {
  let node: ColorInversionNode;

  beforeEach(() => {
    node = new ColorInversionNode();
  });

  it('INV-001: isIdentity() returns true at default params', () => {
    expect(node.isIdentity()).toBe(true);
    expect(node.inverted).toBe(false);
  });

  it('INV-002: isIdentity() returns false when inverted=true', () => {
    node.inverted = true;
    expect(node.isIdentity()).toBe(false);
  });

  it('INV-003: enabled=false returns input reference', () => {
    node.enabled = false;
    node.inverted = true;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('INV-004: mix=0.5 produces blended output', () => {
    node.inverted = true;
    node.mix = 0.5;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result).not.toBe(source);

    const srcData = source.getTypedArray();
    const mixData = result!.getTypedArray();

    // Check a few RGB pixels are between source and inverted
    for (let i = 0; i < 16; i += 4) {
      const s = srcData[i]!;
      const inv = 255 - s;
      const m = mixData[i]!;
      const lo = Math.min(s, inv);
      const hi = Math.max(s, inv);
      expect(m).toBeGreaterThanOrEqual(lo - 1);
      expect(m).toBeLessThanOrEqual(hi + 1);
    }
  });

  it('INV-005: parameter clamping - inverted is boolean, no numeric clamping needed', () => {
    // Boolean property: setting to true/false always works
    node.inverted = true;
    expect(node.inverted).toBe(true);
    node.inverted = false;
    expect(node.inverted).toBe(false);
  });

  it('INV-006: dirty propagation - changing param marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);

    node.inverted = true;
    expect(node.isDirty).toBe(true);
  });

  it('INV-007: cache validity - evaluate twice returns same reference', () => {
    node.inverted = true;
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

  it('INV-008: pixel correctness (uint8) - output = 255 - input for RGB, alpha preserved', () => {
    node.inverted = true;
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply directly via applyColorInversion
    const refImage = source.deepClone();
    const imageData = refImage.toImageData();
    applyColorInversion(imageData);
    refImage.fromImageData(imageData);

    const resultData = result!.getTypedArray();
    const refData = refImage.getTypedArray();

    for (let i = 0; i < resultData.length; i++) {
      expect(Math.abs(resultData[i]! - refData[i]!)).toBeLessThanOrEqual(1);
    }

    // Also verify the inversion formula directly for RGB channels
    const srcData = source.getTypedArray();
    for (let i = 0; i < srcData.length; i += 4) {
      expect(resultData[i]).toBe(255 - srcData[i]!);     // R
      expect(resultData[i + 1]).toBe(255 - srcData[i + 1]!); // G
      expect(resultData[i + 2]).toBe(255 - srcData[i + 2]!); // B
    }
  });

  it('INV-009: pixel correctness (float32) - within tolerance', () => {
    node.inverted = true;
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply directly: toImageData then applyColorInversion
    const refImage = source.deepClone();
    const imageData = refImage.toImageData();
    applyColorInversion(imageData);
    refImage.fromImageData(imageData);

    const resultData = result!.getTypedArray();
    const refData = refImage.getTypedArray();

    for (let i = 0; i < resultData.length; i++) {
      expect(Math.abs(resultData[i]! - refData[i]!)).toBeLessThanOrEqual(0.01);
    }
  });

  it('INV-010: alpha preservation - alpha unchanged after RGBA processing', () => {
    node.inverted = true;
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

  it('INV-011: channel count safety - 1-channel and 3-channel handled', () => {
    node.inverted = true;

    // 1-channel image
    const gray = createTestImage(4, 4, 1, 'uint8');
    const grayResult = wireAndEvaluate(gray, node);
    expect(grayResult).not.toBeNull();
    expect(grayResult!.width).toBe(4);
    expect(grayResult!.height).toBe(4);

    // 3-channel image
    const rgb = createTestImage(4, 4, 3, 'uint8');
    const node2 = new ColorInversionNode();
    node2.inverted = true;
    const rgbResult = wireAndEvaluate(rgb, node2);
    expect(rgbResult).not.toBeNull();
    expect(rgbResult!.width).toBe(4);
    expect(rgbResult!.height).toBe(4);
  });

  it('INV-012: 1x1 edge case - single pixel processes without crash', () => {
    node.inverted = true;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('INV-013: mix=0 bypass - mix=0 with enabled=true returns unprocessed', () => {
    node.inverted = true;
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

  it('INV-014: dispose idempotency - double dispose does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
