import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EffectChain } from './EffectChain';
import { EffectNode } from './EffectNode';
import type { EffectCategory } from './EffectNode';
import { IPImage } from '../../core/image/Image';
import { IPNode } from '../base/IPNode';
import type { EvalContext } from '../../core/graph/Graph';

// Import concrete effect nodes to trigger their @RegisterNode decorators
import { CDLNode } from './CDLNode';
import { SharpenNode } from './SharpenNode';
import { ColorInversionNode } from './ColorInversionNode';

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

// Concrete test effect that doubles RGB values
class DoubleRGBEffect extends EffectNode {
  readonly category: EffectCategory = 'color';
  readonly label = 'DoubleRGB';
  private _identity = false;

  constructor(name?: string) {
    super('DoubleRGB', name);
  }

  setIdentity(v: boolean) {
    this._identity = v;
  }

  isIdentity(): boolean {
    return this._identity;
  }

  protected applyEffect(_context: EvalContext, input: IPImage): IPImage {
    const output = input.deepClone();
    const data = output.getTypedArray();
    for (let i = 0; i < data.length; i++) {
      if ((i + 1) % 4 !== 0) {
        data[i] = Math.min(data[i]! * 2, 255);
      }
    }
    return output;
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

describe('EffectChain', () => {
  const context: EvalContext = {
    frame: 1,
    width: 4,
    height: 4,
    quality: 'full',
  };

  let inputImage: IPImage;
  let sourceNode: TestSourceNode;
  let chain: EffectChain;

  beforeEach(() => {
    inputImage = createTestImage();
    sourceNode = new TestSourceNode(inputImage);
    chain = new EffectChain();
  });

  afterEach(() => {
    chain.dispose();
  });

  it('EFCH-001: Empty chain (no source, no effects) returns null', () => {
    const result = chain.evaluate(context);
    expect(result).toBeNull();
  });

  it('EFCH-002: Source-only (zero effects) returns source image unchanged', () => {
    chain.setSource(sourceNode);

    const result = chain.evaluate(context);

    // With no effects, the chain should return the source image directly
    expect(result).toBe(inputImage);
  });

  it('EFCH-003: Single effect applies correctly', () => {
    chain.setSource(sourceNode);
    const effect = new DoubleRGBEffect();
    chain.append(effect);

    const result = chain.evaluate(context);

    expect(result).not.toBeNull();
    const data = result!.getTypedArray();
    // RGB doubled: R=200, G=100, B=50, A=200
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(200);
      expect(data[i + 1]).toBe(100);
      expect(data[i + 2]).toBe(50);
      expect(data[i + 3]).toBe(200);
    }
  });

  it('EFCH-004: CDL->Inversion produces different result than Inversion->CDL (ordering sensitivity)', () => {
    chain.setSource(sourceNode);

    const cdl = new CDLNode();
    cdl.slopeR = 1.5;
    const inversion = new ColorInversionNode();
    inversion.inverted = true;

    // CDL first, then Inversion
    chain.append(cdl);
    chain.append(inversion);
    const resultA = chain.evaluate(context);
    expect(resultA).not.toBeNull();
    const dataA = resultA!.getTypedArray().slice();

    chain.dispose();

    // Inversion first, then CDL
    chain = new EffectChain();
    inputImage = createTestImage();
    sourceNode = new TestSourceNode(inputImage);
    chain.setSource(sourceNode);

    const inversion2 = new ColorInversionNode();
    inversion2.inverted = true;
    const cdl2 = new CDLNode();
    cdl2.slopeR = 1.5;

    chain.append(inversion2);
    chain.append(cdl2);
    const resultB = chain.evaluate(context);
    expect(resultB).not.toBeNull();
    const dataB = resultB!.getTypedArray();

    // At least one pixel value should differ between the two orderings
    // CDL(slopeR=1.5) then invert vs invert then CDL(slopeR=1.5) gives different results
    // because inversion of (100*1.5)=150 -> 255-150=105
    // vs CDL on inverted: (255-100)*1.5 = 155*1.5 = 232
    let foundDifference = false;
    for (let i = 0; i < dataA.length; i++) {
      if (dataA[i] !== dataB[i]) {
        foundDifference = true;
        break;
      }
    }
    expect(foundDifference).toBe(true);
  });

  it('EFCH-005: insert(0, effect) correctly prepends', () => {
    chain.setSource(sourceNode);

    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');

    chain.append(effectA);
    chain.insert(0, effectB);

    const effects = chain.getEffects();
    expect(effects[0]).toBe(effectB);
    expect(effects[1]).toBe(effectA);
  });

  it('EFCH-006: Remove effect re-wires chain correctly', () => {
    chain.setSource(sourceNode);

    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');
    chain.append(effectA);
    chain.append(effectB);

    // Remove first effect
    chain.remove(effectA);

    const effects = chain.getEffects();
    expect(effects.length).toBe(1);
    expect(effects[0]).toBe(effectB);

    // Chain should still evaluate correctly with remaining effect
    const result = chain.evaluate(context);
    expect(result).not.toBeNull();
    const data = result!.getTypedArray();
    // Only one doubling: R=200, G=100, B=50
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(200);
      expect(data[i + 1]).toBe(100);
      expect(data[i + 2]).toBe(50);
    }
  });

  it('EFCH-007: reorder(from, to) updates evaluation order', () => {
    chain.setSource(sourceNode);

    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');
    const effectC = new DoubleRGBEffect('EffectC');

    chain.append(effectA);
    chain.append(effectB);
    chain.append(effectC);

    // Move last to first
    chain.reorder(2, 0);

    const effects = chain.getEffects();
    expect(effects[0]).toBe(effectC);
    expect(effects[1]).toBe(effectA);
    expect(effects[2]).toBe(effectB);
  });

  it('EFCH-008: Disabled effect in mid-chain is transparent', () => {
    chain.setSource(sourceNode);

    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');
    const effectC = new DoubleRGBEffect('EffectC');

    chain.append(effectA);
    chain.append(effectB);
    chain.append(effectC);

    // Disable middle effect
    effectB.enabled = false;

    const result = chain.evaluate(context);
    expect(result).not.toBeNull();
    const data = result!.getTypedArray();

    // Two doublings (A and C), B is disabled:
    // R: 100 -> 200 -> 200 (capped at 255, but 200*2=400 -> min(400,255)=255)
    // Actually: 100*2=200, 200*2=400 -> clamped 255
    // G: 50*2=100, 100*2=200
    // B: 25*2=50, 50*2=100
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(255); // R clamped at 255
      expect(data[i + 1]).toBe(200); // G
      expect(data[i + 2]).toBe(100); // B
    }
  });

  it('EFCH-009: Identity-parameterized node is transparent', () => {
    chain.setSource(sourceNode);

    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');
    effectB.setIdentity(true); // mark as identity

    chain.append(effectA);
    chain.append(effectB);

    const result = chain.evaluate(context);
    expect(result).not.toBeNull();
    const data = result!.getTypedArray();

    // Only effectA applies (effectB is identity): R=200, G=100, B=50
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(200);
      expect(data[i + 1]).toBe(100);
      expect(data[i + 2]).toBe(50);
    }
  });

  it('EFCH-010: Cache efficiency - evaluate twice returns cached result', () => {
    chain.setSource(sourceNode);
    const effect = new DoubleRGBEffect();
    chain.append(effect);

    const result1 = chain.evaluate(context);
    const result2 = chain.evaluate(context);

    // Second evaluation with the same context should return the cached result
    expect(result1).toBe(result2);
  });

  it('EFCH-011: toJSON() has correct structure', () => {
    const cdl = new CDLNode();
    cdl.slopeR = 2.0;
    const sharpen = new SharpenNode();
    sharpen.amount = 30;

    chain.append(cdl);
    chain.append(sharpen);

    const json = chain.toJSON();

    expect(json).toHaveProperty('effects');
    expect(json.effects).toHaveLength(2);

    expect(json.effects[0]).toHaveProperty('type', 'CDL');
    expect(json.effects[0]).toHaveProperty('properties');
    expect(json.effects[0]!.properties).toHaveProperty('slopeR', 2.0);

    expect(json.effects[1]).toHaveProperty('type', 'Sharpen');
    expect(json.effects[1]).toHaveProperty('properties');
    expect(json.effects[1]!.properties).toHaveProperty('amount', 30);
  });

  it('EFCH-012: fromJSON() round-trip produces identical parameters', () => {
    const cdl = new CDLNode();
    cdl.slopeR = 1.8;
    cdl.offsetG = 0.05;
    cdl.powerB = 1.2;
    cdl.saturation = 0.9;

    const inversion = new ColorInversionNode();
    inversion.inverted = true;

    chain.append(cdl);
    chain.append(inversion);

    const json = chain.toJSON();
    const restored = EffectChain.fromJSON(json);

    const restoredJSON = restored.toJSON();

    expect(restoredJSON.effects).toHaveLength(2);
    expect(restoredJSON.effects[0]!.type).toBe('CDL');
    expect(restoredJSON.effects[0]!.properties).toEqual(json.effects[0]!.properties);
    expect(restoredJSON.effects[1]!.type).toBe('ColorInversion');
    expect(restoredJSON.effects[1]!.properties).toEqual(json.effects[1]!.properties);

    restored.dispose();
  });

  it('EFCH-013: Adding same node instance twice is handled (no-op)', () => {
    const effect = new DoubleRGBEffect();
    chain.append(effect);
    chain.append(effect); // second append should be a no-op

    const effects = chain.getEffects();
    expect(effects.length).toBe(1);
  });

  it('EFCH-014: dispose() disposes all child effect nodes', () => {
    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');

    chain.append(effectA);
    chain.append(effectB);

    // Spy on disposed state: after dispose, properties should be disposed
    chain.dispose();

    // After dispose, the chain should have no effects
    const effects = chain.getEffects();
    expect(effects.length).toBe(0);
  });

  it('EFCH-015: Chain dispose() called twice does not throw', () => {
    const effect = new DoubleRGBEffect();
    chain.append(effect);

    expect(() => {
      chain.dispose();
      chain.dispose();
    }).not.toThrow();
  });

  it('EFCH-016: setSource() with new source re-wires connections', () => {
    chain.setSource(sourceNode);
    const effect = new DoubleRGBEffect();
    chain.append(effect);

    // Evaluate with first source
    const result1 = chain.evaluate(context);
    expect(result1).not.toBeNull();

    // Create a different source with different pixel values
    const newImage = IPImage.createEmpty(4, 4, 4, 'uint8');
    const newData = newImage.getTypedArray();
    for (let i = 0; i < newData.length; i += 4) {
      newData[i] = 50; // R
      newData[i + 1] = 25; // G
      newData[i + 2] = 10; // B
      newData[i + 3] = 255; // A
    }
    const newSource = new TestSourceNode(newImage);
    chain.setSource(newSource);

    // Evaluate with new source - use a different frame to bust cache
    const newContext: EvalContext = { frame: 2, width: 4, height: 4, quality: 'full' };
    const result2 = chain.evaluate(newContext);
    expect(result2).not.toBeNull();

    const data2 = result2!.getTypedArray();
    // New source R=50 doubled -> 100, G=25 doubled -> 50, B=10 doubled -> 20
    for (let i = 0; i < data2.length; i += 4) {
      expect(data2[i]).toBe(100);
      expect(data2[i + 1]).toBe(50);
      expect(data2[i + 2]).toBe(20);
    }
  });

  it('EFCH-017: getEffects() returns effects in current chain order', () => {
    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');
    const effectC = new DoubleRGBEffect('EffectC');

    chain.append(effectA);
    chain.append(effectB);
    chain.append(effectC);

    const effects = chain.getEffects();
    expect(effects).toEqual([effectA, effectB, effectC]);

    // Reorder and check again
    chain.reorder(0, 2);
    const reordered = chain.getEffects();
    expect(reordered).toEqual([effectB, effectC, effectA]);
  });

  it('EFCH-018: 10-node chain evaluates without stack overflow', () => {
    chain.setSource(sourceNode);

    for (let i = 0; i < 10; i++) {
      const effect = new DoubleRGBEffect(`Effect${i}`);
      chain.append(effect);
    }

    expect(chain.getEffects().length).toBe(10);

    // Should not throw due to deep evaluation stack
    const result = chain.evaluate(context);
    expect(result).not.toBeNull();

    // After 10 doublings, all RGB values should be clamped at 255
    const data = result!.getTypedArray();
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(255); // R
      expect(data[i + 1]).toBe(255); // G
      expect(data[i + 2]).toBe(255); // B
      expect(data[i + 3]).toBe(200); // A preserved
    }
  });

  it('EFCH-019: All effects disabled returns source image unchanged', () => {
    chain.setSource(sourceNode);

    const effectA = new DoubleRGBEffect('EffectA');
    const effectB = new DoubleRGBEffect('EffectB');
    const effectC = new DoubleRGBEffect('EffectC');

    effectA.enabled = false;
    effectB.enabled = false;
    effectC.enabled = false;

    chain.append(effectA);
    chain.append(effectB);
    chain.append(effectC);

    const result = chain.evaluate(context);

    // All effects disabled, so the output should be the source image reference
    expect(result).toBe(inputImage);
  });

  it('EFCH-020: remove(unknownEffect) is a no-op', () => {
    chain.setSource(sourceNode);
    const effectA = new DoubleRGBEffect('EffectA');
    chain.append(effectA);

    const unknownEffect = new DoubleRGBEffect('Unknown');

    // Removing an effect not in the chain should not throw or change anything
    expect(() => chain.remove(unknownEffect)).not.toThrow();
    expect(chain.getEffects().length).toBe(1);
    expect(chain.getEffects()[0]).toBe(effectA);
  });

  it('EFCH-021: fromJSON throws for unknown effect type', () => {
    expect(() => {
      EffectChain.fromJSON({ effects: [{ type: 'NonexistentEffect', properties: {} }] });
    }).toThrow('Unknown effect type');
  });
});
