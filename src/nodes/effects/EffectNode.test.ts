import { describe, it, expect, beforeEach } from 'vitest';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import { IPNode } from '../base/IPNode';
import { Graph, type EvalContext } from '../../core/graph/Graph';

// Concrete test subclass of EffectNode for testing base class behavior
class TestEffectNode extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'Test';
  private _identity = false;

  setIdentity(v: boolean) {
    this._identity = v;
  }

  isIdentity(): boolean {
    return this._identity;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const output = input.deepClone();
    const data = output.getTypedArray();
    // Double all RGB values (simple transformation)
    for (let i = 0; i < data.length; i++) {
      if ((i + 1) % 4 !== 0) {
        // skip alpha
        data[i] = Math.min(data[i]! * 2, 255);
      }
    }
    return output;
  }
}

// Simple source node that returns a fixed image
class TestSourceNode extends IPNode {
  private image: IPImage;

  constructor(image: IPImage) {
    super('TestSource', 'TestSource');
    this.image = image;
  }

  protected process(): IPImage | null {
    return this.image;
  }
}

/**
 * Create a 4x4 RGBA uint8 image with known pixel values.
 * Every pixel has R=100, G=50, B=25, A=200.
 */
function createTestImage(): IPImage {
  const image = IPImage.createEmpty(4, 4, 4, 'uint8');
  const data = image.getTypedArray();
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 100; // R
    data[i + 1] = 50; // G
    data[i + 2] = 25; // B
    data[i + 3] = 200; // A
  }
  return image;
}

/**
 * Wire up source -> effect in a graph and evaluate.
 */
function evaluateEffect(
  source: TestSourceNode,
  effect: TestEffectNode,
  context: EvalContext
): IPImage | null {
  const graph = new Graph();
  graph.addNode(source);
  graph.addNode(effect);
  effect.connectInput(source);
  graph.setOutputNode(effect);
  return graph.evaluateWithContext(context);
}

describe('EffectNode', () => {
  const context: EvalContext = {
    frame: 1,
    width: 4,
    height: 4,
    quality: 'full',
  };

  let inputImage: IPImage;
  let sourceNode: TestSourceNode;
  let effectNode: TestEffectNode;

  beforeEach(() => {
    inputImage = createTestImage();
    sourceNode = new TestSourceNode(inputImage);
    effectNode = new TestEffectNode('TestEffect');
  });

  it('EFBN-001: enabled=false returns input reference unchanged', () => {
    effectNode.enabled = false;

    const result = evaluateEffect(sourceNode, effectNode, context);

    // When disabled, the effect should return the exact same input reference
    expect(result).toBe(inputImage);
  });

  it('EFBN-002: Identity parameters return input reference (no allocation)', () => {
    effectNode.setIdentity(true);

    const result = evaluateEffect(sourceNode, effectNode, context);

    // When identity, the effect should return the exact same input reference
    expect(result).toBe(inputImage);
  });

  it('EFBN-003: mix=0.0 produces output equivalent to unprocessed input (all pixel values same as input)', () => {
    effectNode.mix = 0.0;

    const result = evaluateEffect(sourceNode, effectNode, context);

    expect(result).not.toBeNull();
    const resultData = result!.getTypedArray();
    const inputData = inputImage.getTypedArray();

    // Every pixel value should match the input exactly (uint8 mix=0 is exact)
    for (let i = 0; i < inputData.length; i++) {
      expect(resultData[i]).toBe(inputData[i]);
    }
  });

  it('EFBN-004: mix=0.5 produces midpoint blend between input and effected output', () => {
    effectNode.mix = 0.5;

    const result = evaluateEffect(sourceNode, effectNode, context);

    expect(result).not.toBeNull();
    const resultData = result!.getTypedArray();

    // For each pixel (uint8 truncation applies):
    // Input R=100, effected R=200 -> blended = 100*0.5 + 200*0.5 = 150
    // Input G=50,  effected G=100 -> blended = 50*0.5 + 100*0.5 = 75
    // Input B=25,  effected B=50  -> blended = 25*0.5 + 50*0.5 = 37.5 -> truncated to 37
    // Alpha should be preserved from input: 200
    for (let i = 0; i < resultData.length; i += 4) {
      expect(resultData[i]).toBe(150); // R
      expect(resultData[i + 1]).toBe(75); // G
      expect(resultData[i + 2]).toBe(37); // B (uint8 truncation of 37.5)
      expect(resultData[i + 3]).toBe(200); // A preserved
    }
  });

  it('EFBN-005: mix=1.0 returns fully effected output (no blend)', () => {
    effectNode.mix = 1.0;

    const result = evaluateEffect(sourceNode, effectNode, context);

    expect(result).not.toBeNull();
    const resultData = result!.getTypedArray();

    // The effect doubles RGB values: R=200, G=100, B=50, A=200 (unchanged)
    for (let i = 0; i < resultData.length; i += 4) {
      expect(resultData[i]).toBe(200); // R doubled
      expect(resultData[i + 1]).toBe(100); // G doubled
      expect(resultData[i + 2]).toBe(50); // B doubled
      expect(resultData[i + 3]).toBe(200); // A unchanged
    }
  });

  it('EFBN-006: mix < 1.0 preserves alpha for RGBA images', () => {
    effectNode.mix = 0.3;

    const result = evaluateEffect(sourceNode, effectNode, context);

    expect(result).not.toBeNull();
    const resultData = result!.getTypedArray();

    // Alpha should be preserved from input (200), not interpolated
    for (let i = 0; i < resultData.length; i += 4) {
      expect(resultData[i + 3]).toBe(200);
    }

    // RGB channels should be blended (uint8 truncation applies):
    // R: 100*0.7 + 200*0.3 = 70 + 60 = 130
    // G: 50*0.7  + 100*0.3 = 35 + 30 = 65
    // B: 25*0.7  + 50*0.3  = 17.5 + 15 = 32.5 -> truncated to 32
    for (let i = 0; i < resultData.length; i += 4) {
      expect(resultData[i]).toBe(130);
      expect(resultData[i + 1]).toBe(65);
      expect(resultData[i + 2]).toBe(32); // uint8 truncation of 32.5
    }
  });

  it('EFBN-007: Property change triggers markDirty() on node', () => {
    // Evaluate once to clear dirty flag
    evaluateEffect(sourceNode, effectNode, context);
    expect(effectNode.isDirty).toBe(false);

    // Changing a property should mark the node dirty
    effectNode.enabled = false;
    expect(effectNode.isDirty).toBe(true);
  });

  it('EFBN-008: dispose() called twice does not throw', () => {
    expect(() => {
      effectNode.dispose();
      effectNode.dispose();
    }).not.toThrow();
  });
});
