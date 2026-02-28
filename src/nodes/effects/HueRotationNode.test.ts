import { describe, it, expect, beforeEach } from 'vitest';
import { HueRotationNode } from './HueRotationNode';
import { isIdentityHueRotation, applyHueRotationInto } from '../../color/HueRotation';
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

describe('HueRotationNode', () => {
  let node: HueRotationNode;

  beforeEach(() => {
    node = new HueRotationNode();
  });

  it('HUE-001: isIdentity() returns true at default params', () => {
    expect(node.isIdentity()).toBe(true);
    expect(isIdentityHueRotation(node.degrees)).toBe(true);
  });

  it('HUE-002: isIdentity() returns false when degrees=90', () => {
    node.degrees = 90;
    expect(node.isIdentity()).toBe(false);
  });

  it('HUE-003: enabled=false returns input reference', () => {
    node.enabled = false;
    node.degrees = 90;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('HUE-004: mix=0.5 produces blended output', () => {
    node.degrees = 90;
    node.mix = 0.5;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result).not.toBe(source);

    // Result should differ from source (rotation happened) but be blended
    const fullNode = new HueRotationNode();
    fullNode.degrees = 90;
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

  it('HUE-005: parameter clamping - degrees beyond min/max is clamped', () => {
    node.degrees = 999;
    expect(node.degrees).toBe(180);

    node.degrees = -999;
    expect(node.degrees).toBe(-180);
  });

  it('HUE-006: dirty propagation - changing param marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);

    node.degrees = 45;
    expect(node.isDirty).toBe(true);
  });

  it('HUE-007: cache validity - evaluate twice returns same reference', () => {
    node.degrees = 90;
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

  it('HUE-008: pixel correctness (uint8) - output matches direct applyHueRotationInto per-pixel', () => {
    node.degrees = 90;
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply applyHueRotationInto manually per pixel on a clone
    const srcData = source.getTypedArray();
    const resultData = result!.getTypedArray();
    const channels = 4;
    const out: [number, number, number] = [0, 0, 0];
    const scale = 1 / 255;

    for (let i = 0; i < srcData.length; i += channels) {
      const r = srcData[i]! * scale;
      const g = srcData[i + 1]! * scale;
      const b = srcData[i + 2]! * scale;
      applyHueRotationInto(r, g, b, 90, out);

      const expectedR = Math.round(out[0] * 255);
      const expectedG = Math.round(out[1] * 255);
      const expectedB = Math.round(out[2] * 255);

      expect(Math.abs(resultData[i]! - expectedR)).toBeLessThanOrEqual(1);
      expect(Math.abs(resultData[i + 1]! - expectedG)).toBeLessThanOrEqual(1);
      expect(Math.abs(resultData[i + 2]! - expectedB)).toBeLessThanOrEqual(1);
    }
  });

  it('HUE-009: pixel correctness (float32) - within tolerance', () => {
    node.degrees = 45;
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Apply applyHueRotationInto manually per pixel
    const srcData = source.getTypedArray();
    const resultData = result!.getTypedArray();
    const channels = 4;
    const out: [number, number, number] = [0, 0, 0];

    for (let i = 0; i < srcData.length; i += channels) {
      applyHueRotationInto(srcData[i]!, srcData[i + 1]!, srcData[i + 2]!, 45, out);

      expect(Math.abs(resultData[i]! - out[0])).toBeLessThanOrEqual(0.002);
      expect(Math.abs(resultData[i + 1]! - out[1])).toBeLessThanOrEqual(0.002);
      expect(Math.abs(resultData[i + 2]! - out[2])).toBeLessThanOrEqual(0.002);
    }
  });

  it('HUE-010: alpha preservation - alpha unchanged after RGBA processing', () => {
    node.degrees = 120;
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

  it('HUE-011: channel count safety - 1-channel returns input, 3-channel handled', () => {
    node.degrees = 90;

    // 1-channel image: HueRotationNode returns input when channels < 3
    const gray = createTestImage(4, 4, 1, 'uint8');
    const grayResult = wireAndEvaluate(gray, node);
    expect(grayResult).not.toBeNull();
    expect(grayResult!.width).toBe(4);
    expect(grayResult!.height).toBe(4);

    // 3-channel image: should process normally
    const rgb = createTestImage(4, 4, 3, 'uint8');
    const node2 = new HueRotationNode();
    node2.degrees = 90;
    const rgbResult = wireAndEvaluate(rgb, node2);
    expect(rgbResult).not.toBeNull();
    expect(rgbResult!.width).toBe(4);
    expect(rgbResult!.height).toBe(4);

    // Verify 3-channel data was actually modified
    const srcData = rgb.getTypedArray();
    const resData = rgbResult!.getTypedArray();
    let changed = false;
    for (let i = 0; i < srcData.length; i++) {
      if (srcData[i] !== resData[i]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('HUE-012: 1x1 edge case - single pixel processes without crash', () => {
    node.degrees = 90;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('HUE-013: mix=0 bypass - mix=0 with enabled=true returns unprocessed', () => {
    node.degrees = 90;
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

  it('HUE-014: dispose idempotency - double dispose does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
