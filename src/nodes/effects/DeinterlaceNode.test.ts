import { describe, it, expect, beforeEach } from 'vitest';
import { DeinterlaceNode } from './DeinterlaceNode';
import { applyDeinterlace, isDeinterlaceActive } from '../../filters/Deinterlace';
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

describe('DeinterlaceNode', () => {
  let node: DeinterlaceNode;

  beforeEach(() => {
    node = new DeinterlaceNode();
  });

  it('DI-001: isIdentity returns true at defaults (deinterlaceEnabled=false)', () => {
    expect(node.isIdentity()).toBe(true);
    expect(node.deinterlaceEnabled).toBe(false);
  });

  it('DI-002: isIdentity returns false when deinterlaceEnabled=true and method is not weave', () => {
    node.deinterlaceEnabled = true;
    node.method = 'bob';
    expect(node.isIdentity()).toBe(false);
  });

  it('DI-003: enabled=false bypasses effect and returns input reference', () => {
    node.deinterlaceEnabled = true;
    node.enabled = false;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('DI-004: mix=0.5 blends between input and effected output', () => {
    node.deinterlaceEnabled = true;
    node.method = 'bob';
    node.mix = 0.5;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    const srcData = source.getTypedArray();
    const resData = result!.getTypedArray();
    let anyDifferent = false;
    for (let i = 0; i < srcData.length; i++) {
      if (srcData[i] !== resData[i]) { anyDifferent = true; break; }
    }
    expect(anyDifferent).toBe(true);
  });

  it('DI-005: isIdentity matches isDeinterlaceActive logic', () => {
    // When enabled=true and method='weave', deinterlace is not active (weave is a no-op)
    node.deinterlaceEnabled = true;
    node.method = 'weave';
    expect(node.isIdentity()).toBe(true);
    expect(isDeinterlaceActive(node.getParams())).toBe(false);

    // When enabled=true and method='blend', deinterlace is active
    node.method = 'blend';
    expect(node.isIdentity()).toBe(false);
    expect(isDeinterlaceActive(node.getParams())).toBe(true);
  });

  it('DI-006: property change marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);
    node.deinterlaceEnabled = true;
    expect(node.isDirty).toBe(true);
  });

  it('DI-007: same-frame evaluation uses cache', () => {
    node.deinterlaceEnabled = true;
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

  it('DI-008: pixel correctness for uint8 image with bob method', () => {
    node.deinterlaceEnabled = true;
    node.method = 'bob';
    node.fieldOrder = 'tff';
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Compute expected output using applyDeinterlace directly
    const expected = source.deepClone();
    const imageData = expected.toImageData();
    const srcImageData = source.toImageData();
    applyDeinterlace(imageData, node.getParams());
    // Restore alpha (node preserves alpha from input)
    for (let p = 0; p < imageData.width * imageData.height; p++) {
      imageData.data[p * 4 + 3] = srcImageData.data[p * 4 + 3]!;
    }
    expected.fromImageData(imageData);

    const resData = result!.getTypedArray();
    const expData = expected.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBe(expData[i]);
    }
  });

  it('DI-009: pixel correctness for float32 image', () => {
    node.deinterlaceEnabled = true;
    node.method = 'blend';
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Compute expected output using applyDeinterlace directly
    const expected = source.deepClone();
    const imageData = expected.toImageData();
    const srcImageData = source.toImageData();
    applyDeinterlace(imageData, node.getParams());
    // Restore alpha (node preserves alpha from input)
    for (let p = 0; p < imageData.width * imageData.height; p++) {
      imageData.data[p * 4 + 3] = srcImageData.data[p * 4 + 3]!;
    }
    expected.fromImageData(imageData);

    const resData = result!.getTypedArray();
    const expData = expected.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBeCloseTo(expData[i]!, 5);
    }
  });

  it('DI-010: alpha channel is preserved', () => {
    node.deinterlaceEnabled = true;
    node.method = 'bob';
    const source = createTestImage(4, 4, 4, 'uint8');
    const srcData = source.getTypedArray();
    const originalAlphas: number[] = [];
    for (let i = 3; i < srcData.length; i += 4) {
      originalAlphas.push(srcData[i]!);
    }

    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Verify alpha values match the original input alpha
    const resData = result!.getTypedArray();
    let alphaIdx = 0;
    for (let i = 3; i < resData.length; i += 4) {
      expect(resData[i]).toBe(originalAlphas[alphaIdx]);
      alphaIdx++;
    }
  });

  it('DI-011: 3-channel image does not throw', () => {
    node.deinterlaceEnabled = true;
    node.method = 'bob';
    const source = createTestImage(4, 4, 3, 'uint8');
    expect(() => wireAndEvaluate(source, node)).not.toThrow();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
  });

  it('DI-012: 1x1 image edge case', () => {
    node.deinterlaceEnabled = true;
    node.method = 'bob';
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('DI-013: mix=0 returns output equivalent to input', () => {
    node.deinterlaceEnabled = true;
    node.method = 'bob';
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

  it('DI-014: dispose called twice does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
