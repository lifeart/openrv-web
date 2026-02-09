/**
 * NodeProcessor Strategy Pattern Tests
 *
 * Tests the NodeProcessor interface integration with IPNode,
 * and the concrete SwitchProcessor, LayoutProcessor, and StackProcessor implementations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import type { NodeProcessor } from '../base/NodeProcessor';
import { SwitchProcessor } from './SwitchProcessor';
import { LayoutProcessor } from './LayoutProcessor';
import { StackProcessor } from './StackProcessor';

// Concrete test node (since IPNode is abstract)
class TestNode extends IPNode {
  processCallCount = 0;

  constructor(name?: string) {
    super('TestNode', name ?? 'Test');
  }

  protected process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    this.processCallCount++;
    return inputs[0] ?? null;
  }
}

// Test node that produces a specific image
class ImageProducerNode extends IPNode {
  private image: IPImage;

  constructor(name: string, width: number = 100, height: number = 100) {
    super('ImageProducer', name);
    this.image = new IPImage({
      width,
      height,
      channels: 4,
      dataType: 'uint8',
      data: new ArrayBuffer(width * height * 4),
      metadata: { sourcePath: name },
    });
  }

  protected process(): IPImage | null {
    return this.image;
  }

  getImage(): IPImage {
    return this.image;
  }
}

const defaultContext: EvalContext = {
  frame: 1,
  width: 1920,
  height: 1080,
  quality: 'full',
};

// --- IPNode + NodeProcessor integration ---

describe('IPNode processor integration', () => {
  let node: TestNode;

  beforeEach(() => {
    node = new TestNode('ProcessorTest');
  });

  it('processor field is null by default', () => {
    expect(node.processor).toBeNull();
  });

  it('uses built-in process() when no processor is set', () => {
    node.evaluate(defaultContext);
    expect(node.processCallCount).toBe(1);
  });

  it('delegates to processor.process() when processor is set', () => {
    const mockProcessor: NodeProcessor = {
      process: vi.fn().mockReturnValue(null),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };

    node.processor = mockProcessor;
    node.evaluate(defaultContext);

    expect(mockProcessor.process).toHaveBeenCalledOnce();
    expect(mockProcessor.process).toHaveBeenCalledWith(defaultContext, []);
    expect(node.processCallCount).toBe(0); // built-in process not called
  });

  it('processor receives evaluated input images', () => {
    const input1 = new ImageProducerNode('A', 100, 100);
    const input2 = new ImageProducerNode('B', 200, 200);

    node.connectInput(input1);
    node.connectInput(input2);

    const mockProcessor: NodeProcessor = {
      process: vi.fn().mockReturnValue(null),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    node.processor = mockProcessor;

    node.evaluate(defaultContext);

    const call = (mockProcessor.process as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const inputs = call[1] as (IPImage | null)[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toBe(input1.getImage());
    expect(inputs[1]).toBe(input2.getImage());
  });

  it('processor output is cached by the node', () => {
    const resultImage = new IPImage({
      width: 50,
      height: 50,
      channels: 4,
      dataType: 'uint8',
      data: new ArrayBuffer(50 * 50 * 4),
    });

    const mockProcessor: NodeProcessor = {
      process: vi.fn().mockReturnValue(resultImage),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    node.processor = mockProcessor;

    // First call
    const result1 = node.evaluate(defaultContext);
    expect(result1).toBe(resultImage);
    expect(mockProcessor.process).toHaveBeenCalledOnce();

    // Second call with same frame - should use cache
    const result2 = node.evaluate(defaultContext);
    expect(result2).toBe(resultImage);
    expect(mockProcessor.process).toHaveBeenCalledOnce(); // not called again
  });

  it('markDirty calls processor.invalidate()', () => {
    const mockProcessor: NodeProcessor = {
      process: vi.fn().mockReturnValue(null),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    node.processor = mockProcessor;

    node.markDirty();

    expect(mockProcessor.invalidate).toHaveBeenCalledOnce();
  });

  it('dispose calls processor.dispose() and nulls the field', () => {
    const mockProcessor: NodeProcessor = {
      process: vi.fn().mockReturnValue(null),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    node.processor = mockProcessor;

    node.dispose();

    expect(mockProcessor.dispose).toHaveBeenCalledOnce();
    expect(node.processor).toBeNull();
  });

  it('can swap processors at runtime', () => {
    const processorA: NodeProcessor = {
      process: vi.fn().mockReturnValue(null),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };
    const processorB: NodeProcessor = {
      process: vi.fn().mockReturnValue(null),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };

    node.processor = processorA;
    node.evaluate(defaultContext);
    expect(processorA.process).toHaveBeenCalledOnce();

    // Swap to processorB
    node.processor = processorB;
    node.markDirty(); // need to invalidate cache
    node.evaluate(defaultContext);

    expect(processorB.process).toHaveBeenCalledOnce();
    expect(processorA.process).toHaveBeenCalledOnce(); // not called again
  });

  it('removing processor falls back to built-in process()', () => {
    const mockProcessor: NodeProcessor = {
      process: vi.fn().mockReturnValue(null),
      invalidate: vi.fn(),
      dispose: vi.fn(),
    };

    node.processor = mockProcessor;
    node.evaluate(defaultContext);
    expect(mockProcessor.process).toHaveBeenCalledOnce();
    expect(node.processCallCount).toBe(0);

    // Remove processor
    node.processor = null;
    node.markDirty();
    node.evaluate(defaultContext);

    expect(node.processCallCount).toBe(1); // built-in called now
    expect(mockProcessor.process).toHaveBeenCalledOnce(); // not called again
  });
});

// --- SwitchProcessor ---

describe('SwitchProcessor', () => {
  it('returns null for empty inputs', () => {
    const processor = new SwitchProcessor(() => 0);
    const result = processor.process(defaultContext, []);
    expect(result).toBeNull();
  });

  it('selects the input at the provided index', () => {
    const imageA = new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
      metadata: { sourcePath: 'A' },
    });
    const imageB = new IPImage({
      width: 200, height: 200, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(200 * 200 * 4),
      metadata: { sourcePath: 'B' },
    });

    const processor = new SwitchProcessor(() => 1);
    const result = processor.process(defaultContext, [imageA, imageB]);
    expect(result).toBe(imageB);
  });

  it('clamps index to valid range (high)', () => {
    const imageA = new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
    });

    const processor = new SwitchProcessor(() => 99);
    const result = processor.process(defaultContext, [imageA]);
    expect(result).toBe(imageA); // clamped to index 0
  });

  it('clamps index to valid range (low)', () => {
    const imageA = new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
    });

    const processor = new SwitchProcessor(() => -5);
    const result = processor.process(defaultContext, [imageA]);
    expect(result).toBe(imageA); // clamped to index 0
  });

  it('uses context to determine active index', () => {
    const images = [0, 1, 2].map(i => new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
      metadata: { sourcePath: `img${i}` },
    }));

    // Select based on frame number
    const processor = new SwitchProcessor((ctx) => ctx.frame % 3);

    expect(processor.process({ ...defaultContext, frame: 0 }, images)).toBe(images[0]);
    expect(processor.process({ ...defaultContext, frame: 1 }, images)).toBe(images[1]);
    expect(processor.process({ ...defaultContext, frame: 2 }, images)).toBe(images[2]);
    expect(processor.process({ ...defaultContext, frame: 3 }, images)).toBe(images[0]);
  });

  it('invalidate and dispose are safe to call', () => {
    const processor = new SwitchProcessor(() => 0);
    expect(() => processor.invalidate()).not.toThrow();
    expect(() => processor.dispose()).not.toThrow();
  });

  it('works when attached to an IPNode', () => {
    const node = new TestNode('WithSwitch');

    const input0 = new ImageProducerNode('Input0');
    const input1 = new ImageProducerNode('Input1');
    node.connectInput(input0);
    node.connectInput(input1);

    node.processor = new SwitchProcessor(() => 1);

    const result = node.evaluate(defaultContext);
    expect(result).toBe(input1.getImage());
    expect(node.processCallCount).toBe(0); // built-in not called
  });
});

// --- LayoutProcessor ---

describe('LayoutProcessor', () => {
  it('returns null for empty inputs', () => {
    const processor = new LayoutProcessor();
    const result = processor.process(defaultContext, []);
    expect(result).toBeNull();
  });

  it('returns first input (pass-through)', () => {
    const imageA = new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
    });
    const imageB = new IPImage({
      width: 200, height: 200, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(200 * 200 * 4),
    });

    const processor = new LayoutProcessor();
    const result = processor.process(defaultContext, [imageA, imageB]);
    expect(result).toBe(imageA);
  });

  it('uses default config when none provided', () => {
    const processor = new LayoutProcessor();
    const config = processor.getConfig();
    expect(config.mode).toBe('row');
    expect(config.columns).toBe(2);
    expect(config.rows).toBe(2);
    expect(config.spacing).toBe(0);
  });

  it('accepts partial config in constructor', () => {
    const processor = new LayoutProcessor({ mode: 'grid', columns: 3 });
    const config = processor.getConfig();
    expect(config.mode).toBe('grid');
    expect(config.columns).toBe(3);
    expect(config.rows).toBe(2); // default
  });

  it('setConfig updates configuration', () => {
    const processor = new LayoutProcessor();
    processor.setConfig({ mode: 'column', spacing: 10 });

    const config = processor.getConfig();
    expect(config.mode).toBe('column');
    expect(config.spacing).toBe(10);
    expect(config.columns).toBe(2); // unchanged
  });

  describe('getGridDimensions', () => {
    it('row mode: all inputs in one row', () => {
      const processor = new LayoutProcessor({ mode: 'row' });
      const dims = processor.getGridDimensions(4);
      expect(dims).toEqual({ columns: 4, rows: 1 });
    });

    it('column mode: all inputs in one column', () => {
      const processor = new LayoutProcessor({ mode: 'column' });
      const dims = processor.getGridDimensions(3);
      expect(dims).toEqual({ columns: 1, rows: 3 });
    });

    it('grid mode: uses configured dimensions', () => {
      const processor = new LayoutProcessor({ mode: 'grid', columns: 3, rows: 2 });
      const dims = processor.getGridDimensions(6);
      expect(dims).toEqual({ columns: 3, rows: 2 });
    });

    it('grid mode: auto-calculates when config is 0', () => {
      const processor = new LayoutProcessor({ mode: 'grid', columns: 0, rows: 0 });
      const dims = processor.getGridDimensions(9);
      // sqrt(9) = 3
      expect(dims.columns).toBe(3);
      expect(dims.rows).toBe(3);
    });

    it('handles single input', () => {
      const processor = new LayoutProcessor({ mode: 'row' });
      const dims = processor.getGridDimensions(1);
      expect(dims).toEqual({ columns: 1, rows: 1 });
    });

    it('handles zero input count (treats as 1)', () => {
      const processor = new LayoutProcessor({ mode: 'row' });
      const dims = processor.getGridDimensions(0);
      expect(dims).toEqual({ columns: 1, rows: 1 });
    });
  });

  it('invalidate and dispose are safe to call', () => {
    const processor = new LayoutProcessor();
    expect(() => processor.invalidate()).not.toThrow();
    expect(() => processor.dispose()).not.toThrow();
  });

  it('works when attached to an IPNode', () => {
    const node = new TestNode('WithLayout');
    const input0 = new ImageProducerNode('Input0');
    const input1 = new ImageProducerNode('Input1');
    node.connectInput(input0);
    node.connectInput(input1);

    node.processor = new LayoutProcessor({ mode: 'grid' });

    const result = node.evaluate(defaultContext);
    expect(result).toBe(input0.getImage()); // first input (pass-through)
    expect(node.processCallCount).toBe(0);
  });
});

// --- StackProcessor ---

describe('StackProcessor', () => {
  it('returns null for empty inputs', () => {
    const processor = new StackProcessor(() => 0);
    const result = processor.process(defaultContext, []);
    expect(result).toBeNull();
  });

  it('selects input based on provider callback', () => {
    const imageA = new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
      metadata: { sourcePath: 'A' },
    });
    const imageB = new IPImage({
      width: 200, height: 200, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(200 * 200 * 4),
      metadata: { sourcePath: 'B' },
    });

    const processor = new StackProcessor((_ctx, _count) => 1);
    const result = processor.process(defaultContext, [imageA, imageB]);
    expect(result).toBe(imageB);
  });

  it('receives input count in callback', () => {
    const images = [0, 1, 2].map(() => new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
    }));

    const callback = vi.fn().mockReturnValue(0);
    const processor = new StackProcessor(callback);
    processor.process(defaultContext, images);

    expect(callback).toHaveBeenCalledWith(defaultContext, 3);
  });

  it('clamps index to valid range', () => {
    const image = new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
    });

    const processorHigh = new StackProcessor(() => 99);
    expect(processorHigh.process(defaultContext, [image])).toBe(image);

    const processorLow = new StackProcessor(() => -1);
    expect(processorLow.process(defaultContext, [image])).toBe(image);
  });

  it('simulates wipe mode (selects based on threshold)', () => {
    const imageA = new IPImage({
      width: 100, height: 100, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(100 * 100 * 4),
      metadata: { sourcePath: 'A' },
    });
    const imageB = new IPImage({
      width: 200, height: 200, channels: 4, dataType: 'uint8',
      data: new ArrayBuffer(200 * 200 * 4),
      metadata: { sourcePath: 'B' },
    });

    // Simulate wipe: threshold-based selection
    let wipeX = 0.3;
    const processor = new StackProcessor((_ctx, inputCount) => {
      if (inputCount >= 2) {
        return wipeX < 0.5 ? 0 : 1;
      }
      return 0;
    });

    expect(processor.process(defaultContext, [imageA, imageB])).toBe(imageA);

    wipeX = 0.7;
    expect(processor.process(defaultContext, [imageA, imageB])).toBe(imageB);
  });

  it('invalidate and dispose are safe to call', () => {
    const processor = new StackProcessor(() => 0);
    expect(() => processor.invalidate()).not.toThrow();
    expect(() => processor.dispose()).not.toThrow();
  });

  it('works when attached to an IPNode', () => {
    const node = new TestNode('WithStack');
    const input0 = new ImageProducerNode('Input0');
    const input1 = new ImageProducerNode('Input1');
    node.connectInput(input0);
    node.connectInput(input1);

    node.processor = new StackProcessor((_ctx, inputCount) => {
      return inputCount >= 2 ? 1 : 0;
    });

    const result = node.evaluate(defaultContext);
    expect(result).toBe(input1.getImage());
    expect(node.processCallCount).toBe(0);
  });
});
