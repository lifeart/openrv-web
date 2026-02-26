import { describe, it, expect, beforeEach } from 'vitest';
import { FilmEmulationNode } from './FilmEmulationNode';
import { applyFilmEmulation } from '../../filters/FilmEmulation';
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

describe('FilmEmulationNode', () => {
  let node: FilmEmulationNode;

  beforeEach(() => {
    node = new FilmEmulationNode();
  });

  it('FILM-001: isIdentity returns true at defaults (filmEnabled=false)', () => {
    expect(node.isIdentity()).toBe(true);
    expect(node.filmEnabled).toBe(false);
  });

  it('FILM-002: isIdentity returns false when filmEnabled=true and intensity>0', () => {
    node.filmEnabled = true;
    node.intensity = 50;
    expect(node.isIdentity()).toBe(false);
  });

  it('FILM-003: enabled=false bypasses effect and returns input reference', () => {
    node.filmEnabled = true;
    node.intensity = 50;
    node.enabled = false;
    const source = createTestImage();
    const result = wireAndEvaluate(source, node);
    expect(result).toBe(source);
  });

  it('FILM-004: mix=0.5 blends between input and effected output', () => {
    node.filmEnabled = true;
    node.intensity = 80;
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

  it('FILM-005: intensity is clamped to max=100 when set above range', () => {
    node.intensity = 999;
    expect(node.intensity).toBe(100);
  });

  it('FILM-006: property change marks node dirty', () => {
    const source = createTestImage();
    wireAndEvaluate(source, node);
    expect(node.isDirty).toBe(false);
    node.filmEnabled = true;
    expect(node.isDirty).toBe(true);
  });

  it('FILM-007: same-frame evaluation uses cache', () => {
    node.filmEnabled = true;
    node.intensity = 50;
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

  it('FILM-008: pixel correctness for uint8 image', () => {
    node.filmEnabled = true;
    node.intensity = 50;
    node.stock = 'kodak-portra-400';
    const source = createTestImage(4, 4, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Compute expected output using applyFilmEmulation directly
    const expected = source.deepClone();
    const imageData = expected.toImageData();
    applyFilmEmulation(imageData, node.getParams());
    expected.fromImageData(imageData);

    const resData = result!.getTypedArray();
    const expData = expected.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBe(expData[i]);
    }
  });

  it('FILM-009: pixel correctness for float32 image', () => {
    node.filmEnabled = true;
    node.intensity = 50;
    const source = createTestImage(4, 4, 4, 'float32');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();

    // Compute expected output using applyFilmEmulation directly
    const expected = source.deepClone();
    const imageData = expected.toImageData();
    applyFilmEmulation(imageData, node.getParams());
    expected.fromImageData(imageData);

    const resData = result!.getTypedArray();
    const expData = expected.getTypedArray();
    for (let i = 0; i < resData.length; i++) {
      expect(resData[i]).toBeCloseTo(expData[i]!, 5);
    }
  });

  it('FILM-010: alpha channel is preserved', () => {
    node.filmEnabled = true;
    node.intensity = 80;
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

  it('FILM-011: 3-channel image does not throw', () => {
    node.filmEnabled = true;
    node.intensity = 50;
    const source = createTestImage(4, 4, 3, 'uint8');
    expect(() => wireAndEvaluate(source, node)).not.toThrow();
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
  });

  it('FILM-012: 1x1 image edge case', () => {
    node.filmEnabled = true;
    node.intensity = 50;
    const source = createTestImage(1, 1, 4, 'uint8');
    const result = wireAndEvaluate(source, node);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('FILM-013: mix=0 returns output equivalent to input', () => {
    node.filmEnabled = true;
    node.intensity = 80;
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

  it('FILM-014: dispose called twice does not throw', () => {
    expect(() => {
      node.dispose();
      node.dispose();
    }).not.toThrow();
  });
});
