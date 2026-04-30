/**
 * BaseSourceNode Unit Tests
 *
 * Tests for the abstract base class for source nodes, focusing on
 * the connectInput guard (must throw, not warn) and metadata access.
 */

import { describe, it, expect } from 'vitest';
import { BaseSourceNode, type SourceMetadata } from './BaseSourceNode';
import { IPNode } from '../base/IPNode';
import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';

// ---------------------------------------------------------------------------
// Concrete subclass for testing (BaseSourceNode is abstract)
// ---------------------------------------------------------------------------

class TestSourceNode extends BaseSourceNode {
  isReady(): boolean {
    return true;
  }

  getElement(): HTMLImageElement | HTMLVideoElement | ImageBitmap | null {
    return null;
  }

  toJSON(): object {
    return { type: this.type, name: this.name };
  }

  evaluate(_context: EvalContext): IPImage | null {
    return null;
  }

  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

// A minimal concrete IPNode to use as the "other" node in connection tests
class DummyNode extends IPNode {
  constructor() {
    super('DummyNode', 'dummy');
  }

  evaluate(_context: EvalContext): IPImage | null {
    return null;
  }

  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// connectInput — must throw for source nodes
// ---------------------------------------------------------------------------

describe('BaseSourceNode.connectInput', () => {
  it('throws an Error when called', () => {
    const source = new TestSourceNode('TestSource', 'my-source');
    const other = new DummyNode();

    expect(() => source.connectInput(other)).toThrow(Error);
  });

  it('error message mentions that source nodes cannot accept inputs', () => {
    const source = new TestSourceNode('TestSource', 'my-source');
    const other = new DummyNode();

    expect(() => source.connectInput(other)).toThrow(/cannot accept inputs/);
  });

  it('error message contains the node name', () => {
    const source = new TestSourceNode('TestSource', 'my-source');
    const other = new DummyNode();

    expect(() => source.connectInput(other)).toThrow(/my-source/);
  });

  it('error message contains the node type', () => {
    const source = new TestSourceNode('TestSource', 'my-source');
    const other = new DummyNode();

    expect(() => source.connectInput(other)).toThrow(/TestSource/);
  });

  it('does not add the node to inputs', () => {
    const source = new TestSourceNode('TestSource', 'my-source');
    const other = new DummyNode();

    try {
      source.connectInput(other);
    } catch {
      // expected
    }

    expect(source.inputs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Other BaseSourceNode functionality still works
// ---------------------------------------------------------------------------

describe('BaseSourceNode.getMetadata', () => {
  it('returns default metadata', () => {
    const source = new TestSourceNode('TestSource');
    const meta: SourceMetadata = source.getMetadata();

    expect(meta).toEqual({
      name: '',
      width: 0,
      height: 0,
      duration: 1,
      fps: 24,
    });
  });

  it('returns a copy (not the internal object)', () => {
    const source = new TestSourceNode('TestSource');
    const meta1 = source.getMetadata();
    const meta2 = source.getMetadata();

    expect(meta1).toEqual(meta2);
    expect(meta1).not.toBe(meta2);
  });
});

describe('BaseSourceNode constructor', () => {
  it('sets type correctly', () => {
    const source = new TestSourceNode('MyType');
    expect(source.type).toBe('MyType');
  });

  it('sets name when provided', () => {
    const source = new TestSourceNode('MyType', 'custom-name');
    expect(source.name).toBe('custom-name');
  });

  it('generates an id containing the type', () => {
    const source = new TestSourceNode('MyType');
    expect(source.id).toContain('MyType');
  });
});
