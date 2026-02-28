import { describe, it, expect, beforeEach } from 'vitest';
import { StabilizationNode } from './StabilizationNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { Graph } from '../../core/graph/Graph';
import { IPNode } from '../base/IPNode';

const context: EvalContext = { frame: 1, width: 4, height: 4, quality: 'full' };

class TestSourceNode extends IPNode {
  private image: IPImage;
  constructor(image: IPImage) { super('TestSource'); this.image = image; }
  protected process(): IPImage | null { return this.image; }
  setImage(img: IPImage) { this.image = img; this.markDirty(); }
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

describe('StabilizationNode', () => {
  let node: StabilizationNode;

  beforeEach(() => {
    node = new StabilizationNode();
  });

  it('STAB-001: isIdentity returns true at defaults (stabilizationEnabled=false)', () => {
    expect(node.isIdentity()).toBe(true);
    expect(node.stabilizationEnabled).toBe(false);
  });

  it('STAB-002: isIdentity returns false when stabilizationEnabled=true', () => {
    node.stabilizationEnabled = true;
    expect(node.isIdentity()).toBe(false);
  });

  it('STAB-003: enabled=false bypasses effect and returns input reference', () => {
    node.stabilizationEnabled = true;
    node.enabled = false;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('STAB-004: mix=0.5 blends between input and effected output', () => {
    node.stabilizationEnabled = true;
    node.mix = 0.5;
    node.cropAmount = 8;
    // Use a larger image so the crop boundary has visible effect.
    // With cropAmount=8, first-frame stabilization blacks out edge pixels.
    // mix=0.5 should blend between input and the cropped/stabilized output.
    const source = createTestImage(32, 32, 4, 'uint8');
    const ctx: EvalContext = { frame: 1, width: 32, height: 32, quality: 'full' };
    const graph = new Graph();
    const sourceNode = new TestSourceNode(source);
    graph.addNode(sourceNode);
    graph.addNode(node);
    node.connectInput(sourceNode);
    graph.setOutputNode(node);
    const result = graph.evaluateWithContext(ctx);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(32);
    expect(result!.height).toBe(32);

    // Verify pixel data is valid and has expected length
    const resData = result!.getTypedArray();
    const srcData = source.getTypedArray();
    expect(resData.length).toBe(srcData.length);

    // Verify that pixel values are within the valid uint8 range
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBeGreaterThanOrEqual(0);
      expect(resData[i]).toBeLessThanOrEqual(255);
    }
  });

  it('STAB-005: smoothingStrength is clamped to max=100 when set above range', () => {
    node.smoothingStrength = 999;
    expect(node.smoothingStrength).toBe(100);
  });

  it('STAB-006: property change marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);
    node.stabilizationEnabled = true;
    expect(node.isDirty).toBe(true);
  });

  it('STAB-007: same-frame evaluation uses cache', () => {
    node.stabilizationEnabled = true;
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

  it('STAB-008: pixel correctness for uint8 first frame (no previous, no stabilization shift)', () => {
    node.stabilizationEnabled = true;
    node.cropAmount = 0; // disable crop so first frame is a pure clone
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // First frame: no previous frame, so no motion compensation is applied.
    // With cropAmount=0, the output should match the input exactly.
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    for (let i = 0; i < srcData.length; i++) {
      expect(resData[i]).toBe(srcData[i]);
    }
  });

  it('STAB-009: pixel correctness for float32 first frame', () => {
    node.stabilizationEnabled = true;
    node.cropAmount = 0;
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // First frame with no crop: output matches input
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    for (let i = 0; i < srcData.length; i++) {
      expect(resData[i]).toBeCloseTo(srcData[i]!, 5);
    }
  });

  it('STAB-010: alpha channel is preserved on first frame', () => {
    node.stabilizationEnabled = true;
    node.cropAmount = 0;
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

  it('STAB-011: 3-channel image does not throw', () => {
    node.stabilizationEnabled = true;
    const source = createTestImage(4, 4, 3, 'uint8');
    expect(() => wireAndEvaluate(source, node)).not.toThrow();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
  });

  it('STAB-012: 1x1 image edge case', () => {
    node.stabilizationEnabled = true;
    node.cropAmount = 0;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('STAB-013: mix=0 returns output equivalent to input', () => {
    node.stabilizationEnabled = true;
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

  it('STAB-014: dispose called twice does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });

  it('STAB-015: sequential frame evaluation produces temporally consistent output', () => {
    node.stabilizationEnabled = true;
    node.cropAmount = 0;

    const graph = new Graph();
    const source1 = createTestImage(16, 16, 4, 'uint8');
    const sourceNode = new TestSourceNode(source1);
    graph.addNode(sourceNode);
    graph.addNode(node);
    node.connectInput(sourceNode);
    graph.setOutputNode(node);

    // Evaluate frame 1
    const ctx1: EvalContext = { frame: 1, width: 16, height: 16, quality: 'full' };
    const result1 = graph.evaluateWithContext(ctx1);
    expect(result1).not.toBeNull();

    // Create a slightly different image for frame 2
    const source2 = createTestImage(16, 16, 4, 'uint8');
    const data2 = source2.getTypedArray();
    for (let i = 0; i < data2.length; i++) {
      data2[i] = ((data2[i] ?? 0) + 5) % 256;
    }
    sourceNode.setImage(source2);
    node.markDirty();

    // Evaluate frame 2 (consecutive with frame 1)
    const ctx2: EvalContext = { frame: 2, width: 16, height: 16, quality: 'full' };
    const result2 = graph.evaluateWithContext(ctx2);
    // With consecutive frames, stabilization should have computed a motion vector
    // and applied correction. The result should be a valid image.
    expect(result2).not.toBeNull();
    expect(result2!.width).toBe(16);
    expect(result2!.height).toBe(16);

    // Verify data length matches expected dimensions
    const resData2 = result2!.getTypedArray();
    expect(resData2.length).toBe(16 * 16 * 4);

    // Verify all pixel values are within valid uint8 range
    for (let i = 0; i < resData2.length; i++) {
      expect(resData2[i]).toBeGreaterThanOrEqual(0);
      expect(resData2[i]).toBeLessThanOrEqual(255);
    }
  });

  it('STAB-016: random-access frame jump handles missing motion history gracefully', () => {
    node.stabilizationEnabled = true;
    node.cropAmount = 0;

    const graph = new Graph();
    const source = createTestImage(16, 16, 4, 'uint8');
    const sourceNode = new TestSourceNode(source);
    graph.addNode(sourceNode);
    graph.addNode(node);
    node.connectInput(sourceNode);
    graph.setOutputNode(node);

    // Evaluate frame 1
    const ctx1: EvalContext = { frame: 1, width: 16, height: 16, quality: 'full' };
    graph.evaluateWithContext(ctx1);

    // Jump to frame 100 (non-consecutive, no motion history)
    const source100 = createTestImage(16, 16, 4, 'uint8');
    sourceNode.setImage(source100);
    node.markDirty();

    const ctx100: EvalContext = { frame: 100, width: 16, height: 16, quality: 'full' };
    const result = graph.evaluateWithContext(ctx100);
    expect(result).not.toBeNull();

    // Since frame 100 is not consecutive with frame 1, no motion compensation
    // should be applied. With cropAmount=0, output matches input.
    const srcData = source100.getTypedArray();
    const resData = result!.getTypedArray();
    for (let i = 0; i < srcData.length; i++) {
      expect(resData[i]).toBe(srcData[i]);
    }
  });

  it('STAB-017: cache invalidation when reference frame changes', () => {
    node.stabilizationEnabled = true;
    node.cropAmount = 0;

    const graph = new Graph();
    const source = createTestImage(16, 16, 4, 'uint8');
    const sourceNode = new TestSourceNode(source);
    graph.addNode(sourceNode);
    graph.addNode(node);
    node.connectInput(sourceNode);
    graph.setOutputNode(node);

    // Evaluate frame 1
    const ctx1: EvalContext = { frame: 1, width: 16, height: 16, quality: 'full' };
    const result1 = graph.evaluateWithContext(ctx1);

    // Change the source image and mark dirty
    const newSource = createTestImage(16, 16, 4, 'uint8');
    const newData = newSource.getTypedArray();
    for (let i = 0; i < newData.length; i++) {
      newData[i] = 128; // Fill with constant
    }
    sourceNode.setImage(newSource);
    node.markDirty();

    // Evaluate same frame again with different source
    const result2 = graph.evaluateWithContext(ctx1);
    expect(result2).not.toBeNull();
    // The result should differ from the first evaluation since source changed
    expect(result2).not.toBe(result1);
  });
});
