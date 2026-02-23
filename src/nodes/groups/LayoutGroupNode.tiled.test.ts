/**
 * LayoutGroupNode Tiled Rendering Tests
 *
 * Tests for quad view GPU rendering: tile viewport computation,
 * tiled mode, evaluateAllInputs, and grid layout with spacing.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  LayoutGroupNode,
  computeTileViewports,
} from './LayoutGroupNode';
import type { EvalContext } from '../../core/graph/Graph';
import { IPNode } from '../base/IPNode';
import { IPImage } from '../../core/image/Image';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class MockSourceNode extends IPNode {
  private _image: IPImage | null;

  constructor(name: string, image?: IPImage | null) {
    super('mock', name);
    this._image = image ?? null;
  }

  setImage(image: IPImage | null): void {
    this._image = image;
  }

  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return this._image;
  }
}

function createTestImage(width = 100, height = 100): IPImage {
  return new IPImage({
    width,
    height,
    channels: 4,
    dataType: 'uint8',
  });
}

const context: EvalContext = {
  frame: 1,
  width: 1920,
  height: 1080,
  quality: 'full',
};

// ---------------------------------------------------------------------------
// computeTileViewports (pure function)
// ---------------------------------------------------------------------------

describe('computeTileViewports', () => {
  it('TILE-001: 2x2 grid with no spacing divides canvas into 4 equal quadrants', () => {
    const viewports = computeTileViewports(800, 600, 2, 2, 0);

    expect(viewports).toHaveLength(4);

    // Top-left (row=0, col=0): x=0, y=300 (WebGL bottom-up: top row has higher Y)
    expect(viewports[0]).toEqual({ x: 0, y: 300, width: 400, height: 300 });
    // Top-right (row=0, col=1): x=400, y=300
    expect(viewports[1]).toEqual({ x: 400, y: 300, width: 400, height: 300 });
    // Bottom-left (row=1, col=0): x=0, y=0
    expect(viewports[2]).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    // Bottom-right (row=1, col=1): x=400, y=0
    expect(viewports[3]).toEqual({ x: 400, y: 0, width: 400, height: 300 });
  });

  it('TILE-002: 2x2 grid with spacing subtracts gap from tile sizes', () => {
    const spacing = 10;
    const viewports = computeTileViewports(810, 610, 2, 2, spacing);

    // Available: 810 - 10 = 800, per tile: 400
    // Available: 610 - 10 = 600, per tile: 300
    expect(viewports).toHaveLength(4);

    // Top-left (row=0, col=0): x=0, y=310 (300 + 10)
    expect(viewports[0]).toEqual({ x: 0, y: 310, width: 400, height: 300 });
    // Top-right (row=0, col=1): x=410 (400 + 10), y=310
    expect(viewports[1]).toEqual({ x: 410, y: 310, width: 400, height: 300 });
    // Bottom-left (row=1, col=0): x=0, y=0
    expect(viewports[2]).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    // Bottom-right (row=1, col=1): x=410, y=0
    expect(viewports[3]).toEqual({ x: 410, y: 0, width: 400, height: 300 });
  });

  it('TILE-003: 1x1 grid fills entire canvas', () => {
    const viewports = computeTileViewports(1920, 1080, 1, 1, 0);

    expect(viewports).toHaveLength(1);
    expect(viewports[0]).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('TILE-004: 3x1 row layout produces horizontal strip', () => {
    const viewports = computeTileViewports(900, 300, 3, 1, 0);

    expect(viewports).toHaveLength(3);
    expect(viewports[0]).toEqual({ x: 0, y: 0, width: 300, height: 300 });
    expect(viewports[1]).toEqual({ x: 300, y: 0, width: 300, height: 300 });
    expect(viewports[2]).toEqual({ x: 600, y: 0, width: 300, height: 300 });
  });

  it('TILE-005: 1x3 column layout produces vertical strip', () => {
    const viewports = computeTileViewports(300, 900, 1, 3, 0);

    expect(viewports).toHaveLength(3);
    // Row 0 (top) = highest Y in WebGL
    expect(viewports[0]).toEqual({ x: 0, y: 600, width: 300, height: 300 });
    expect(viewports[1]).toEqual({ x: 0, y: 300, width: 300, height: 300 });
    expect(viewports[2]).toEqual({ x: 0, y: 0, width: 300, height: 300 });
  });

  it('TILE-006: spacing of 0 produces no gaps', () => {
    const viewports = computeTileViewports(200, 200, 2, 2, 0);

    // All tiles should be exactly 100x100 and tightly packed
    expect(viewports[0]!.width).toBe(100);
    expect(viewports[0]!.height).toBe(100);
    // Top-left is at y=100 (WebGL), bottom-left at y=0
    expect(viewports[0]!.y).toBe(100);
    expect(viewports[2]!.y).toBe(0);
  });

  it('TILE-007: large spacing reduces tile sizes correctly', () => {
    // Canvas 100x100, 2x2, spacing 20
    // Available: 100 - 20 = 80, per tile: 40
    const viewports = computeTileViewports(100, 100, 2, 2, 20);

    expect(viewports).toHaveLength(4);
    expect(viewports[0]!.width).toBe(40);
    expect(viewports[0]!.height).toBe(40);
  });

  it('TILE-008: non-divisible canvas size floors tile dimensions', () => {
    // 101 / 2 = 50.5 -> floor = 50
    const viewports = computeTileViewports(101, 101, 2, 2, 0);

    expect(viewports[0]!.width).toBe(50);
    expect(viewports[0]!.height).toBe(50);
  });

  it('TILE-009: empty grid (0x0) produces no viewports', () => {
    const viewports = computeTileViewports(800, 600, 0, 0, 0);
    // Degenerate case - division by zero produces NaN/Infinity
    // The function should still return an empty array since 0 rows * 0 cols = 0 iterations
    expect(viewports).toHaveLength(0);
  });

  it('TILE-010: 2x1 horizontal split produces two halves', () => {
    const viewports = computeTileViewports(1920, 1080, 2, 1, 0);

    expect(viewports).toHaveLength(2);
    expect(viewports[0]).toEqual({ x: 0, y: 0, width: 960, height: 1080 });
    expect(viewports[1]).toEqual({ x: 960, y: 0, width: 960, height: 1080 });
  });

  it('TILE-011: 1x2 vertical split produces two halves', () => {
    const viewports = computeTileViewports(1920, 1080, 1, 2, 0);

    expect(viewports).toHaveLength(2);
    // Row 0 (top) at y=540, row 1 (bottom) at y=0
    expect(viewports[0]).toEqual({ x: 0, y: 540, width: 1920, height: 540 });
    expect(viewports[1]).toEqual({ x: 0, y: 0, width: 1920, height: 540 });
  });
});

// ---------------------------------------------------------------------------
// LayoutGroupNode tiled mode
// ---------------------------------------------------------------------------

describe('LayoutGroupNode tiled mode', () => {
  it('TILE-020: tiled mode defaults to false', () => {
    const node = new LayoutGroupNode();
    expect(node.isTiledMode()).toBe(false);
  });

  it('TILE-021: setTiledMode(true) activates tiled mode', () => {
    const node = new LayoutGroupNode();
    node.setTiledMode(true);
    expect(node.isTiledMode()).toBe(true);
  });

  it('TILE-022: setTiledMode(false) deactivates tiled mode', () => {
    const node = new LayoutGroupNode();
    node.setTiledMode(true);
    node.setTiledMode(false);
    expect(node.isTiledMode()).toBe(false);
  });

  it('TILE-023: setTiledMode marks node dirty', () => {
    const node = new LayoutGroupNode();
    node.evaluate(context); // Clear dirty
    node.setTiledMode(true);
    expect(node.isDirty).toBe(true);
  });

  it('TILE-024: setTiledMode with same value does not mark dirty', () => {
    const node = new LayoutGroupNode();
    node.evaluate(context); // Clear dirty
    expect(node.isDirty).toBe(false);
    node.setTiledMode(false); // Already false
    expect(node.isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LayoutGroupNode.computeTileViewports
// ---------------------------------------------------------------------------

describe('LayoutGroupNode.computeTileViewports', () => {
  it('TILE-030: row mode computes horizontal tiles', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'row');
    node.connectInput(new MockSourceNode('a'));
    node.connectInput(new MockSourceNode('b'));

    const viewports = node.computeTileViewports(800, 400);

    expect(viewports).toHaveLength(2);
    // 2 columns, 1 row
    expect(viewports[0]).toEqual({ x: 0, y: 0, width: 400, height: 400 });
    expect(viewports[1]).toEqual({ x: 400, y: 0, width: 400, height: 400 });
  });

  it('TILE-031: column mode computes vertical tiles', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'column');
    node.connectInput(new MockSourceNode('a'));
    node.connectInput(new MockSourceNode('b'));

    const viewports = node.computeTileViewports(400, 800);

    expect(viewports).toHaveLength(2);
    // 1 column, 2 rows: row 0 (top) has higher Y
    expect(viewports[0]).toEqual({ x: 0, y: 400, width: 400, height: 400 });
    expect(viewports[1]).toEqual({ x: 0, y: 0, width: 400, height: 400 });
  });

  it('TILE-032: grid mode with 4 inputs produces 2x2 grid', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 2);
    node.properties.setValue('rows', 2);
    for (let i = 0; i < 4; i++) {
      node.connectInput(new MockSourceNode(`src${i}`));
    }

    const viewports = node.computeTileViewports(800, 600);

    expect(viewports).toHaveLength(4);
  });

  it('TILE-033: spacing property is used in viewport computation', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 2);
    node.properties.setValue('rows', 2);
    node.properties.setValue('spacing', 10);
    for (let i = 0; i < 4; i++) {
      node.connectInput(new MockSourceNode(`src${i}`));
    }

    const viewports = node.computeTileViewports(810, 610);

    // Available: 810 - 10 = 800 -> 400 per col
    // Available: 610 - 10 = 600 -> 300 per row
    expect(viewports[0]!.width).toBe(400);
    expect(viewports[0]!.height).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// LayoutGroupNode.evaluateAllInputs
// ---------------------------------------------------------------------------

describe('LayoutGroupNode.evaluateAllInputs', () => {
  it('TILE-040: returns null when no inputs', () => {
    const node = new LayoutGroupNode();
    const result = node.evaluateAllInputs(context, 800, 600);
    expect(result).toBeNull();
  });

  it('TILE-041: returns tiles for single input', () => {
    const node = new LayoutGroupNode();
    const image = createTestImage();
    const src = new MockSourceNode('a', image);
    node.connectInput(src);

    const result = node.evaluateAllInputs(context, 800, 600);

    expect(result).not.toBeNull();
    expect(result!.tiles).toHaveLength(1);
    expect(result!.tiles[0]!.image).toBe(image);
    expect(result!.tiles[0]!.viewport.width).toBeGreaterThan(0);
    expect(result!.tiles[0]!.viewport.height).toBeGreaterThan(0);
  });

  it('TILE-042: returns tiles for all 4 inputs in quad view', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 2);
    node.properties.setValue('rows', 2);

    const images = [
      createTestImage(100, 100),
      createTestImage(200, 200),
      createTestImage(300, 300),
      createTestImage(400, 400),
    ];
    for (let i = 0; i < 4; i++) {
      node.connectInput(new MockSourceNode(`src${i}`, images[i]!));
    }

    const result = node.evaluateAllInputs(context, 800, 600);

    expect(result).not.toBeNull();
    expect(result!.tiles).toHaveLength(4);
    expect(result!.tiles[0]!.image).toBe(images[0]);
    expect(result!.tiles[1]!.image).toBe(images[1]);
    expect(result!.tiles[2]!.image).toBe(images[2]);
    expect(result!.tiles[3]!.image).toBe(images[3]);
  });

  it('TILE-043: skips null inputs (empty tile slots)', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 2);
    node.properties.setValue('rows', 2);

    const imageA = createTestImage();
    node.connectInput(new MockSourceNode('a', imageA));
    node.connectInput(new MockSourceNode('b', null)); // Null source
    node.connectInput(new MockSourceNode('c', createTestImage()));

    const result = node.evaluateAllInputs(context, 800, 600);

    expect(result).not.toBeNull();
    // 2 non-null images
    expect(result!.tiles).toHaveLength(2);
    expect(result!.tiles[0]!.image).toBe(imageA);
  });

  it('TILE-044: returns null when all inputs evaluate to null', () => {
    const node = new LayoutGroupNode();
    node.connectInput(new MockSourceNode('a', null));
    node.connectInput(new MockSourceNode('b', null));

    const result = node.evaluateAllInputs(context, 800, 600);

    expect(result).toBeNull();
  });

  it('TILE-045: grid dimensions are included in result', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 3);
    node.properties.setValue('rows', 2);
    node.connectInput(new MockSourceNode('a', createTestImage()));

    const result = node.evaluateAllInputs(context, 900, 600);

    expect(result!.grid).toEqual({ columns: 3, rows: 2 });
  });

  it('TILE-046: spacing is included in result', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('spacing', 8);
    node.connectInput(new MockSourceNode('a', createTestImage()));

    const result = node.evaluateAllInputs(context, 800, 600);

    expect(result!.spacing).toBe(8);
  });

  it('TILE-047: inputs beyond available viewport slots are ignored', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 2);
    node.properties.setValue('rows', 2);

    // 6 inputs but only 4 grid slots (2x2)
    for (let i = 0; i < 6; i++) {
      node.connectInput(new MockSourceNode(`src${i}`, createTestImage()));
    }

    const result = node.evaluateAllInputs(context, 800, 600);

    expect(result).not.toBeNull();
    expect(result!.tiles).toHaveLength(4); // Only 4 grid slots
  });

  it('TILE-048: evaluateAllInputs evaluates each input node', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'grid');
    node.properties.setValue('columns', 2);
    node.properties.setValue('rows', 1);

    const srcA = new MockSourceNode('a', createTestImage());
    const srcB = new MockSourceNode('b', createTestImage());
    const evalSpyA = vi.spyOn(srcA, 'evaluate');
    const evalSpyB = vi.spyOn(srcB, 'evaluate');
    node.connectInput(srcA);
    node.connectInput(srcB);

    node.evaluateAllInputs(context, 800, 600);

    expect(evalSpyA).toHaveBeenCalledWith(context);
    expect(evalSpyB).toHaveBeenCalledWith(context);
  });
});

// ---------------------------------------------------------------------------
// LayoutGroupNode backward compatibility (pass-through mode)
// ---------------------------------------------------------------------------

describe('LayoutGroupNode backward compatibility', () => {
  it('TILE-050: getActiveInputIndex still returns 0', () => {
    const node = new LayoutGroupNode();
    expect(node.getActiveInputIndex(context)).toBe(0);
  });

  it('TILE-051: evaluate returns first input in pass-through mode', () => {
    const node = new LayoutGroupNode();
    const imageA = createTestImage();
    const imageB = createTestImage();
    node.connectInput(new MockSourceNode('a', imageA));
    node.connectInput(new MockSourceNode('b', imageB));

    const result = node.evaluate(context);

    expect(result).toBe(imageA);
  });

  it('TILE-052: getGridDimensions still works correctly', () => {
    const node = new LayoutGroupNode();
    node.properties.setValue('mode', 'row');
    node.connectInput(new MockSourceNode('a'));
    node.connectInput(new MockSourceNode('b'));
    node.connectInput(new MockSourceNode('c'));

    const dims = node.getGridDimensions();
    expect(dims).toEqual({ columns: 3, rows: 1 });
  });

  it('TILE-053: properties unchanged from original', () => {
    const node = new LayoutGroupNode();
    expect(node.properties.has('mode')).toBe(true);
    expect(node.properties.has('columns')).toBe(true);
    expect(node.properties.has('rows')).toBe(true);
    expect(node.properties.has('spacing')).toBe(true);
    expect(node.properties.getValue('mode')).toBe('row');
    expect(node.properties.getValue('columns')).toBe(2);
    expect(node.properties.getValue('rows')).toBe(2);
    expect(node.properties.getValue('spacing')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Viewport geometry invariants
// ---------------------------------------------------------------------------

describe('Viewport geometry invariants', () => {
  it('TILE-060: all viewports have positive width and height', () => {
    const viewports = computeTileViewports(1920, 1080, 3, 3, 5);

    for (const vp of viewports) {
      expect(vp.width).toBeGreaterThan(0);
      expect(vp.height).toBeGreaterThan(0);
    }
  });

  it('TILE-061: viewports do not overlap (no spacing)', () => {
    const viewports = computeTileViewports(800, 600, 2, 2, 0);

    for (let i = 0; i < viewports.length; i++) {
      for (let j = i + 1; j < viewports.length; j++) {
        const a = viewports[i]!;
        const b = viewports[j]!;

        // Check no overlap: either one is fully left/right/above/below the other
        const noOverlap =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;

        expect(noOverlap).toBe(true);
      }
    }
  });

  it('TILE-062: viewports do not overlap (with spacing)', () => {
    const viewports = computeTileViewports(810, 610, 2, 2, 10);

    for (let i = 0; i < viewports.length; i++) {
      for (let j = i + 1; j < viewports.length; j++) {
        const a = viewports[i]!;
        const b = viewports[j]!;

        const noOverlap =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;

        expect(noOverlap).toBe(true);
      }
    }
  });

  it('TILE-063: viewports fit within canvas bounds', () => {
    const canvasW = 1920;
    const canvasH = 1080;
    const viewports = computeTileViewports(canvasW, canvasH, 3, 2, 8);

    for (const vp of viewports) {
      expect(vp.x).toBeGreaterThanOrEqual(0);
      expect(vp.y).toBeGreaterThanOrEqual(0);
      expect(vp.x + vp.width).toBeLessThanOrEqual(canvasW);
      expect(vp.y + vp.height).toBeLessThanOrEqual(canvasH);
    }
  });

  it('TILE-064: total viewport count matches grid cells', () => {
    expect(computeTileViewports(800, 600, 2, 2, 0)).toHaveLength(4);
    expect(computeTileViewports(800, 600, 3, 3, 0)).toHaveLength(9);
    expect(computeTileViewports(800, 600, 4, 1, 0)).toHaveLength(4);
    expect(computeTileViewports(800, 600, 1, 4, 0)).toHaveLength(4);
  });

  it('TILE-065: row-major ordering (top-left is index 0)', () => {
    const viewports = computeTileViewports(800, 600, 2, 2, 0);

    // Index 0: top-left (highest Y in WebGL, lowest X)
    // Index 1: top-right (highest Y, highest X)
    // Index 2: bottom-left (lowest Y, lowest X)
    // Index 3: bottom-right (lowest Y, highest X)
    expect(viewports[0]!.x).toBeLessThan(viewports[1]!.x);
    expect(viewports[0]!.y).toEqual(viewports[1]!.y);
    expect(viewports[0]!.y).toBeGreaterThan(viewports[2]!.y);
    expect(viewports[2]!.x).toBeLessThan(viewports[3]!.x);
  });
});
