import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MuEvalBridge, type ViewTransformState, type ViewEventSource } from '../MuEvalBridge';
import { MuNodeBridge } from '../MuNodeBridge';
import { Graph } from '../../core/graph/Graph';
import { IPNode } from '../../nodes/base/IPNode';
import type { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import type { RenderedImageInfo } from '../types';
import type { PixelReadbackProvider } from '../MuSourceBridge';

// --- Test helpers ---

/** Minimal concrete IPNode for testing */
class TestNode extends IPNode {
  protected process(_context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    return null;
  }
}

/**
 * Build a simple graph:
 *   source1(RVSource) -> color1(RVColor) -> seq1(RVSequence) -> display1(RVDisplayColor)
 */
function createTestGraph(): { graph: Graph; nodes: Record<string, IPNode> } {
  const graph = new Graph();
  const source1 = new TestNode('RVSource', 'source1');
  const color1 = new TestNode('RVColor', 'color1');
  const seq1 = new TestNode('RVSequence', 'seq1');
  const display1 = new TestNode('RVDisplayColor', 'display1');

  graph.addNode(source1);
  graph.addNode(color1);
  graph.addNode(seq1);
  graph.addNode(display1);

  graph.connect(source1, color1);
  graph.connect(color1, seq1);
  graph.connect(seq1, display1);

  return { graph, nodes: { source1, color1, seq1, display1 } };
}

function makeRenderedImage(name: string, index: number, width: number, height: number): RenderedImageInfo {
  return {
    name,
    index,
    imageMin: [0, 0],
    imageMax: [width, height],
    width,
    height,
    nodeName: name,
  };
}

function defaultViewTransform(overrides?: Partial<ViewTransformState>): ViewTransformState {
  return {
    viewWidth: 800,
    viewHeight: 600,
    scale: 1,
    translation: [0, 0],
    imageWidth: 1920,
    imageHeight: 1080,
    pixelAspect: 1,
    ...overrides,
  };
}

/**
 * Minimal mock event source that simulates viewTransformChanged / renderedImagesChanged.
 */
function createMockViewEventSource() {
  const listeners: Record<string, Array<(data: any) => void>> = {};

  const source: ViewEventSource = {
    on(event: string, cb: (data: any) => void): () => void {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return () => {
        const arr = listeners[event];
        if (arr) {
          const idx = arr.indexOf(cb);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    },
  };

  return {
    source,
    emit(event: string, data: any = {}) {
      for (const cb of listeners[event] ?? []) {
        cb(data);
      }
    },
  };
}

describe('MuEvalBridge', () => {
  let bridge: MuEvalBridge;
  let nodeBridge: MuNodeBridge;
  let graph: Graph;
  let nodes: Record<string, IPNode>;

  beforeEach(() => {
    const setup = createTestGraph();
    graph = setup.graph;
    nodes = setup.nodes;
    nodeBridge = new MuNodeBridge(graph);
    nodeBridge.setViewNode('display1');
    bridge = new MuEvalBridge(graph, nodeBridge);
  });

  // =====================================================================
  // metaEvaluate
  // =====================================================================

  describe('metaEvaluate', () => {
    it('traverses the full evaluation chain from the view node', () => {
      const result = bridge.metaEvaluate(1, 'display1');
      expect(result.length).toBe(4);
      // Should include all nodes reachable from display1 upstream
      const nodeNames = result.map((r) => r.node);
      expect(nodeNames).toContain('display1');
      expect(nodeNames).toContain('seq1');
      expect(nodeNames).toContain('color1');
      expect(nodeNames).toContain('source1');
    });

    it('uses the current view node when no name is provided', () => {
      const result = bridge.metaEvaluate(1);
      expect(result.length).toBe(4);
      expect(result[0]!.node).toBe('display1');
    });

    it('filters by type when typeName is provided', () => {
      const result = bridge.metaEvaluate(1, 'display1', 'RVSource');
      expect(result.length).toBe(1);
      expect(result[0]!.node).toBe('source1');
      expect(result[0]!.nodeType).toBe('RVSource');
    });

    it('sets the frame number on each result', () => {
      const result = bridge.metaEvaluate(42, 'display1');
      for (const info of result) {
        expect(info.frame).toBe(42);
      }
    });

    it('returns empty array when start node not found', () => {
      expect(bridge.metaEvaluate(1, 'nonexistent')).toEqual([]);
    });

    it('returns empty array when no view node is set', () => {
      nodeBridge.setGraph(new Graph());
      bridge.setGraph(new Graph());
      const nb2 = new MuNodeBridge(new Graph());
      const b2 = new MuEvalBridge(new Graph(), nb2);
      expect(b2.metaEvaluate(1)).toEqual([]);
    });
  });

  // =====================================================================
  // metaEvaluateClosestByType
  // =====================================================================

  describe('metaEvaluateClosestByType', () => {
    it('stops at the first node of the target type', () => {
      const result = bridge.metaEvaluateClosestByType(1, 'display1', 'RVColor');
      const nodeNames = result.map((r) => r.node);
      // Should include display1 -> seq1 -> color1, then stop
      expect(nodeNames).toEqual(['display1', 'seq1', 'color1']);
      // Should NOT include source1 (past the matching node)
      expect(nodeNames).not.toContain('source1');
    });

    it('includes all nodes if type not found', () => {
      const result = bridge.metaEvaluateClosestByType(1, 'display1', 'RVNonExistent');
      expect(result.length).toBe(4); // traverses everything
    });

    it('stops immediately if the start node matches the type', () => {
      const result = bridge.metaEvaluateClosestByType(1, 'display1', 'RVDisplayColor');
      expect(result.length).toBe(1);
      expect(result[0]!.node).toBe('display1');
    });

    it('returns empty for unknown start node', () => {
      expect(bridge.metaEvaluateClosestByType(1, 'nope', 'RVSource')).toEqual([]);
    });

    it('returns the near branch in a branched graph, not the deep DFS branch', () => {
      // Build branched graph:
      //   srcDeep(Target) -> mid(TypeM) -> deep(TypeD) -> start(TypeS)
      //   srcNear(Target) -> start(TypeS)
      // BFS from start should find srcNear at depth 1, not srcDeep at depth 3
      const g = new Graph();
      const start = new TestNode('TypeS', 'start');
      const deep = new TestNode('TypeD', 'deep');
      const mid = new TestNode('TypeM', 'mid');
      const srcDeep = new TestNode('Target', 'srcDeep');
      const srcNear = new TestNode('Target', 'srcNear');

      g.addNode(start);
      g.addNode(deep);
      g.addNode(mid);
      g.addNode(srcDeep);
      g.addNode(srcNear);

      g.connect(srcDeep, mid);
      g.connect(mid, deep);
      g.connect(deep, start);
      g.connect(srcNear, start);

      const nb = new MuNodeBridge(g);
      const b = new MuEvalBridge(g, nb);

      const result = b.metaEvaluateClosestByType(1, 'start', 'Target');
      const names = result.map((r) => r.node);
      expect(names).toEqual(['start', 'srcNear']);
    });

    it('returns the correct chain of nodes from start to target', () => {
      // Chain: A(TypeA) -> B(TypeB) -> C(TypeC) -> D(TypeD)
      // Looking for TypeA from D should return [D, C, B, A]
      const g = new Graph();
      const a = new TestNode('TypeA', 'A');
      const b = new TestNode('TypeB', 'B');
      const c = new TestNode('TypeC', 'C');
      const d = new TestNode('TypeD', 'D');

      g.addNode(a);
      g.addNode(b);
      g.addNode(c);
      g.addNode(d);

      g.connect(a, b);
      g.connect(b, c);
      g.connect(c, d);

      const nb = new MuNodeBridge(g);
      const eb = new MuEvalBridge(g, nb);

      const result = eb.metaEvaluateClosestByType(1, 'D', 'TypeA');
      const names = result.map((r) => r.node);
      expect(names).toEqual(['D', 'C', 'B', 'A']);
    });

    it('excludes dead-end branch nodes from the result', () => {
      // Graph:
      //   deadEnd(TypeX) -> mid(TypeM) -> start(TypeS)
      //   target(Target) -> start(TypeS)
      // Result should be [start, target] — deadEnd and mid should NOT appear
      const g = new Graph();
      const start = new TestNode('TypeS', 'start');
      const mid = new TestNode('TypeM', 'mid');
      const deadEnd = new TestNode('TypeX', 'deadEnd');
      const target = new TestNode('Target', 'target');

      g.addNode(start);
      g.addNode(mid);
      g.addNode(deadEnd);
      g.addNode(target);

      g.connect(deadEnd, mid);
      g.connect(mid, start);
      g.connect(target, start);

      const nb = new MuNodeBridge(g);
      const b = new MuEvalBridge(g, nb);

      const result = b.metaEvaluateClosestByType(1, 'start', 'Target');
      const names = result.map((r) => r.node);
      expect(names).toEqual(['start', 'target']);
      expect(names).not.toContain('deadEnd');
      expect(names).not.toContain('mid');
    });
  });

  // =====================================================================
  // closestNodesOfType
  // =====================================================================

  describe('closestNodesOfType', () => {
    it('finds nodes of the given type upstream from start', () => {
      const result = bridge.closestNodesOfType('display1', 'RVSource');
      expect(result).toEqual(['source1']);
    });

    it('finds the start node itself if it matches the type', () => {
      const result = bridge.closestNodesOfType('display1', 'RVDisplayColor');
      expect(result).toEqual(['display1']);
    });

    it('returns empty for non-existent type', () => {
      const result = bridge.closestNodesOfType('display1', 'NonExistent');
      expect(result).toEqual([]);
    });

    it('returns empty for unknown start node', () => {
      const result = bridge.closestNodesOfType('unknown', 'RVSource');
      expect(result).toEqual([]);
    });

    it('finds multiple nodes of the same type', () => {
      // Add another RVSource
      const source2 = new TestNode('RVSource', 'source2');
      graph.addNode(source2);
      graph.connect(source2, nodes.color1!);

      const result = bridge.closestNodesOfType('display1', 'RVSource');
      expect(result).toContain('source1');
      expect(result).toContain('source2');
    });

    it('returns only the nearest depth matches in a multi-depth chain', () => {
      // Chain: srcA(X) -> mid(Y) -> srcB(X) -> end(Z)
      // Searching from end for type X should return only srcB (depth 1), not srcA (depth 3)
      const g = new Graph();
      const srcA = new TestNode('TypeX', 'srcA');
      const mid = new TestNode('TypeY', 'mid');
      const srcB = new TestNode('TypeX', 'srcB');
      const end = new TestNode('TypeZ', 'end');

      g.addNode(srcA);
      g.addNode(mid);
      g.addNode(srcB);
      g.addNode(end);

      g.connect(srcA, mid);
      g.connect(mid, srcB);
      g.connect(srcB, end);

      const nb = new MuNodeBridge(g);
      const b = new MuEvalBridge(g, nb);

      const result = b.closestNodesOfType('end', 'TypeX');
      expect(result).toEqual(['srcB']);
    });

    it('returns only the nearest depth in a branching graph', () => {
      // Branch1: nearX(X) -> end(Z)        (depth 1)
      // Branch2: farX(X) -> mid(Y) -> end   (depth 2 via mid)
      // Only nearX should be returned
      const g = new Graph();
      const nearX = new TestNode('TypeX', 'nearX');
      const farX = new TestNode('TypeX', 'farX');
      const mid = new TestNode('TypeY', 'mid');
      const end = new TestNode('TypeZ', 'end');

      g.addNode(nearX);
      g.addNode(farX);
      g.addNode(mid);
      g.addNode(end);

      g.connect(nearX, end);
      g.connect(farX, mid);
      g.connect(mid, end);

      const nb = new MuNodeBridge(g);
      const b = new MuEvalBridge(g, nb);

      const result = b.closestNodesOfType('end', 'TypeX');
      expect(result).toEqual(['nearX']);
    });

    it('returns all matches when they are at the same depth', () => {
      // a(X) -> end(Z) and b(X) -> end(Z)  — both at depth 1
      const g = new Graph();
      const a = new TestNode('TypeX', 'a');
      const b2 = new TestNode('TypeX', 'b');
      const end = new TestNode('TypeZ', 'end');

      g.addNode(a);
      g.addNode(b2);
      g.addNode(end);

      g.connect(a, end);
      g.connect(b2, end);

      const nb = new MuNodeBridge(g);
      const b = new MuEvalBridge(g, nb);

      const result = b.closestNodesOfType('end', 'TypeX');
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no upstream nodes match the type', () => {
      // Chain with no TypeX: a(Y) -> b(Z) -> end(W)
      const g = new Graph();
      const a = new TestNode('TypeY', 'a');
      const b2 = new TestNode('TypeZ', 'b');
      const end = new TestNode('TypeW', 'end');

      g.addNode(a);
      g.addNode(b2);
      g.addNode(end);

      g.connect(a, b2);
      g.connect(b2, end);

      const nb = new MuNodeBridge(g);
      const b = new MuEvalBridge(g, nb);

      const result = b.closestNodesOfType('end', 'TypeX');
      expect(result).toEqual([]);
    });
  });

  // =====================================================================
  // mapPropertyToGlobalFrames
  // =====================================================================

  describe('mapPropertyToGlobalFrames', () => {
    it('returns the local frame as identity mapping', () => {
      expect(bridge.mapPropertyToGlobalFrames(10)).toEqual([10]);
    });

    it('works with any frame number', () => {
      expect(bridge.mapPropertyToGlobalFrames(0)).toEqual([0]);
      expect(bridge.mapPropertyToGlobalFrames(100)).toEqual([100]);
    });
  });

  // =====================================================================
  // renderedImages
  // =====================================================================

  describe('renderedImages', () => {
    it('returns empty array by default', () => {
      expect(bridge.renderedImages()).toEqual([]);
    });

    it('returns the set rendered images', () => {
      const images = [
        makeRenderedImage('img1', 0, 1920, 1080),
        makeRenderedImage('img2', 1, 3840, 2160),
      ];
      bridge.setRenderedImages(images);
      const result = bridge.renderedImages();
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('img1');
      expect(result[1]!.name).toBe('img2');
    });

    it('returns a copy (not a reference)', () => {
      const images = [makeRenderedImage('img1', 0, 100, 100)];
      bridge.setRenderedImages(images);
      const r1 = bridge.renderedImages();
      const r2 = bridge.renderedImages();
      expect(r1).not.toBe(r2);
      expect(r1).toEqual(r2);
    });
  });

  // =====================================================================
  // imagesAtPixel
  // =====================================================================

  describe('imagesAtPixel', () => {
    beforeEach(() => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
        imageWidth: 200,
        imageHeight: 100,
      }));
      bridge.setRenderedImages([
        makeRenderedImage('testImg', 0, 200, 100),
      ]);
    });

    it('reports inside=true when point is within image bounds', () => {
      // Image is 200x100, centered in 800x600 viewport
      // Top-left corner of image in screen space: (300, 250)
      // Center of image in screen space: (400, 300)
      const result = bridge.imagesAtPixel([400, 300]);
      expect(result).toHaveLength(1);
      expect(result[0]!.inside).toBe(true);
      expect(result[0]!.name).toBe('testImg');
    });

    it('returns empty array for points outside the image', () => {
      // Far outside the image area — should not be returned at all
      const result = bridge.imagesAtPixel([0, 0]);
      expect(result).toHaveLength(0);
    });

    it('only returns images under the queried point, not all rendered images', () => {
      // Image A (200×100) centered in 800×600 viewport → screen [300,250]–[500,350]
      // Image B (50×50) centered in 800×600 viewport → screen [375,275]–[425,325]
      bridge.setRenderedImages([
        makeRenderedImage('imgA', 0, 200, 100),
        makeRenderedImage('imgB', 1, 50, 50),
      ]);
      // Point (310, 260) is inside imgA but outside imgB
      const result = bridge.imagesAtPixel([310, 260]);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('imgA');
      expect(result[0]!.inside).toBe(true);
    });

    it('returns no images when point misses all rendered images', () => {
      bridge.setRenderedImages([
        makeRenderedImage('img1', 0, 200, 100),
        makeRenderedImage('img2', 1, 200, 100),
      ]);
      // Far outside any image
      const result = bridge.imagesAtPixel([0, 0]);
      expect(result).toHaveLength(0);
    });

    it('includes edge pixels (point exactly on image boundary)', () => {
      // Image is 200x100, centered in 800x600 viewport
      // Top-left corner in screen space: (300, 250)
      // Query 1 pixel outside top-left → should be edge
      const result = bridge.imagesAtPixel([299, 249]);
      expect(result).toHaveLength(1);
      expect(result[0]!.edge).toBe(true);
      expect(result[0]!.inside).toBe(false);
    });

    it('returns empty array when no images are rendered', () => {
      bridge.setRenderedImages([]);
      expect(bridge.imagesAtPixel([400, 300])).toEqual([]);
    });

    it('includes image coordinates in the result', () => {
      // Center of viewport, image centered
      const result = bridge.imagesAtPixel([400, 300]);
      expect(result[0]!.px).toBeCloseTo(100, 0); // center of 200-wide image
      expect(result[0]!.py).toBeCloseTo(50, 0);  // center of 100-tall image
    });

    it('includes model matrix in the result', () => {
      const result = bridge.imagesAtPixel([400, 300]);
      expect(result[0]!.modelMatrix).toHaveLength(16);
      // Identity matrix
      expect(result[0]!.modelMatrix[0]).toBe(1);
      expect(result[0]!.modelMatrix[5]).toBe(1);
      expect(result[0]!.modelMatrix[10]).toBe(1);
      expect(result[0]!.modelMatrix[15]).toBe(1);
    });
  });

  // =====================================================================
  // imagesAtPixel — useStencil flag
  // =====================================================================

  describe('imagesAtPixel with useStencil', () => {
    beforeEach(() => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
        imageWidth: 200,
        imageHeight: 100,
      }));
      bridge.setRenderedImages([
        makeRenderedImage('testImg', 0, 200, 100),
      ]);
    });

    it('useStencil=false uses geometry-only hit test (default behavior)', () => {
      const result = bridge.imagesAtPixel([400, 300], undefined, false);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('testImg');
      expect(result[0]!.inside).toBe(true);
    });

    it('useStencil defaults to false', () => {
      // Calling without the third argument should behave like useStencil=false
      const withDefault = bridge.imagesAtPixel([400, 300]);
      const withExplicit = bridge.imagesAtPixel([400, 300], undefined, false);
      expect(withDefault).toEqual(withExplicit);
    });

    it('useStencil=true with opaque pixel still returns the image', () => {
      const provider: PixelReadbackProvider = {
        readSourcePixel: () => [1.0, 0.5, 0.0, 1.0], // opaque pixel
      };
      bridge.setPixelReadbackProvider(provider);

      const result = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('testImg');
    });

    it('useStencil=true with transparent pixel excludes the image', () => {
      const provider: PixelReadbackProvider = {
        readSourcePixel: () => [0.0, 0.0, 0.0, 0.0], // fully transparent
      };
      bridge.setPixelReadbackProvider(provider);

      const result = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(result).toHaveLength(0);
    });

    it('useStencil=true falls back to geometry when no provider is set', () => {
      // No provider set — should still return geometry hit
      bridge.setPixelReadbackProvider(null);
      const result = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('testImg');
    });

    it('useStencil=true falls back to geometry when provider returns null', () => {
      const provider: PixelReadbackProvider = {
        readSourcePixel: () => null, // readback not available
      };
      bridge.setPixelReadbackProvider(provider);

      const result = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('testImg');
    });

    it('useStencil=true filters per-image independently', () => {
      bridge.setRenderedImages([
        makeRenderedImage('opaqueImg', 0, 200, 100),
        makeRenderedImage('transparentImg', 1, 200, 100),
      ]);

      const provider: PixelReadbackProvider = {
        readSourcePixel: (name: string) => {
          if (name === 'transparentImg') return [0.0, 0.0, 0.0, 0.0];
          return [1.0, 1.0, 1.0, 1.0];
        },
      };
      bridge.setPixelReadbackProvider(provider);

      const result = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('opaqueImg');
    });

    it('readSourcePixel receives correct image-local coordinates', () => {
      const readSourcePixel = vi.fn().mockReturnValue([1.0, 1.0, 1.0, 1.0]);
      bridge.setPixelReadbackProvider({ readSourcePixel });

      // Screen center [400,300] with viewWidth=800, viewHeight=600, scale=1,
      // image 200×100 → image top-left at screen (300,250)
      // ix = (400-300)/1 = 100, iy = (300-250)/1 = 50
      bridge.imagesAtPixel([400, 300], undefined, true);

      expect(readSourcePixel).toHaveBeenCalledOnce();
      expect(readSourcePixel).toHaveBeenCalledWith('testImg', 100, 50);
    });

    it('alpha just above zero (0.01) includes the image', () => {
      const provider: PixelReadbackProvider = {
        readSourcePixel: () => [0.0, 0.0, 0.0, 0.01],
      };
      bridge.setPixelReadbackProvider(provider);

      const result = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('testImg');
    });

    it('point outside geometry returns empty even with opaque stencil provider', () => {
      const provider: PixelReadbackProvider = {
        readSourcePixel: () => [1.0, 1.0, 1.0, 1.0],
      };
      bridge.setPixelReadbackProvider(provider);

      // [0, 0] is far outside the image area (image occupies screen ~[300,500]×[250,350])
      const result = bridge.imagesAtPixel([0, 0], undefined, true);
      expect(result).toHaveLength(0);
    });

    it('useStencil=false ignores provider even when set', () => {
      const provider: PixelReadbackProvider = {
        readSourcePixel: () => [0.0, 0.0, 0.0, 0.0], // transparent
      };
      bridge.setPixelReadbackProvider(provider);

      // With useStencil=false, the provider should not be consulted
      const result = bridge.imagesAtPixel([400, 300], undefined, false);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('testImg');
    });
  });

  // =====================================================================
  // imageGeometry
  // =====================================================================

  describe('imageGeometry', () => {
    beforeEach(() => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
      }));
      bridge.setRenderedImages([
        makeRenderedImage('img1', 0, 200, 100),
      ]);
    });

    it('returns 4 corner points for a known image', () => {
      const corners = bridge.imageGeometry('img1');
      expect(corners).toHaveLength(4);
    });

    it('returns empty array for unknown image', () => {
      expect(bridge.imageGeometry('nope')).toEqual([]);
    });

    it('corner coordinates are consistent (form a rectangle)', () => {
      const corners = bridge.imageGeometry('img1');
      expect(corners).toHaveLength(4);
      // [bottomLeft, bottomRight, topRight, topLeft]
      const bl = corners[0]!;
      const br = corners[1]!;
      const tr = corners[2]!;
      const tl = corners[3]!;

      // Bottom edge is horizontal
      expect(bl[1]).toBeCloseTo(br[1]);
      // Top edge is horizontal
      expect(tl[1]).toBeCloseTo(tr[1]);
      // Left edge is vertical
      expect(bl[0]).toBeCloseTo(tl[0]);
      // Right edge is vertical
      expect(br[0]).toBeCloseTo(tr[0]);

      // Width should match image width * scale
      expect(br[0] - bl[0]).toBeCloseTo(200); // scale=1
      // Height should match image height * scale
      expect(bl[1] - tl[1]).toBeCloseTo(100); // scale=1
    });

    it('accounts for scale', () => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 2,
        translation: [0, 0],
      }));

      const corners = bridge.imageGeometry('img1');
      expect(corners).toHaveLength(4);
      const bl = corners[0]!;
      const br = corners[1]!;
      const tl = corners[3]!;
      // Width should be 200 * 2 = 400
      expect(br[0] - bl[0]).toBeCloseTo(400);
      // Height should be 100 * 2 = 200
      expect(bl[1] - tl[1]).toBeCloseTo(200);
    });

    it('accounts for translation', () => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [50, 30],
      }));

      const corners = bridge.imageGeometry('img1');
      expect(corners).toHaveLength(4);
      const tl = corners[3]!;

      // Without translation, top-left would be at (300, 250)
      // With translation [50, 30], it should be at (350, 280)
      expect(tl[0]).toBeCloseTo(350);
      expect(tl[1]).toBeCloseTo(280);
    });
  });

  // =====================================================================
  // imageGeometryByIndex
  // =====================================================================

  describe('imageGeometryByIndex', () => {
    beforeEach(() => {
      bridge.setViewTransform(defaultViewTransform());
      bridge.setRenderedImages([
        makeRenderedImage('img0', 0, 100, 100),
        makeRenderedImage('img1', 1, 200, 200),
      ]);
    });

    it('returns corners for valid index', () => {
      expect(bridge.imageGeometryByIndex(0)).toHaveLength(4);
      expect(bridge.imageGeometryByIndex(1)).toHaveLength(4);
    });

    it('returns empty for out-of-range index', () => {
      expect(bridge.imageGeometryByIndex(5)).toEqual([]);
      expect(bridge.imageGeometryByIndex(-1)).toEqual([]);
    });
  });

  // =====================================================================
  // imageGeometryByTag
  // =====================================================================

  describe('imageGeometryByTag', () => {
    it('selects geometry matching the given tag', () => {
      bridge.setViewTransform(defaultViewTransform());
      const main = { ...makeRenderedImage('img1', 0, 100, 100), tag: 'main' };
      const thumb = {
        ...makeRenderedImage('img1', 1, 50, 50),
        imageMin: [10, 10] as [number, number],
        imageMax: [60, 60] as [number, number],
        tag: 'thumbnail',
      };
      bridge.setRenderedImages([main, thumb]);
      const corners = bridge.imageGeometryByTag('img1', 'thumbnail');
      expect(corners).toHaveLength(4);
      // Corners should reflect the thumbnail geometry, not the main one
      const mainCorners = bridge.imageGeometryByTag('img1', 'main');
      expect(corners).not.toEqual(mainCorners);
    });

    it('falls back to name-only match when tag does not exist', () => {
      bridge.setViewTransform(defaultViewTransform());
      bridge.setRenderedImages([makeRenderedImage('img1', 0, 100, 100)]);
      const corners = bridge.imageGeometryByTag('img1', 'nonexistent');
      expect(corners).toHaveLength(4);
      // Should equal name-only lookup
      expect(corners).toEqual(bridge.imageGeometry('img1'));
    });

    it('returns name-only match when tag is empty string', () => {
      bridge.setViewTransform(defaultViewTransform());
      bridge.setRenderedImages([makeRenderedImage('img1', 0, 100, 100)]);
      const corners = bridge.imageGeometryByTag('img1', '');
      expect(corners).toHaveLength(4);
      expect(corners).toEqual(bridge.imageGeometry('img1'));
    });
  });

  // =====================================================================
  // eventToImageSpace
  // =====================================================================

  describe('eventToImageSpace', () => {
    beforeEach(() => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
      }));
      bridge.setRenderedImages([
        makeRenderedImage('testImg', 0, 200, 100),
      ]);
    });

    it('converts screen center to image center with useLocalCoords=true', () => {
      // Image 200x100 centered in 800x600 -> top-left at (300, 250)
      // Screen center (400, 300) -> image (100, 50)
      const [ix, iy] = bridge.eventToImageSpace('testImg', [400, 300], true);
      expect(ix).toBeCloseTo(100);
      expect(iy).toBeCloseTo(50);
    });

    it('converts image top-left corner with useLocalCoords=true', () => {
      // Image top-left is at screen (300, 250)
      const [ix, iy] = bridge.eventToImageSpace('testImg', [300, 250], true);
      expect(ix).toBeCloseTo(0);
      expect(iy).toBeCloseTo(0);
    });

    it('handles scaled view with useLocalCoords=true', () => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 2,
        translation: [0, 0],
      }));

      // At scale 2, image (200x100) occupies 400x200 in screen space
      // Centered in 800x600 -> top-left at (200, 200)
      // Screen point (400, 300) -> image center (100, 50)
      const [ix, iy] = bridge.eventToImageSpace('testImg', [400, 300], true);
      expect(ix).toBeCloseTo(100);
      expect(iy).toBeCloseTo(50);
    });

    it('falls back to view transform for unknown image with useLocalCoords=true', () => {
      const result = bridge.eventToImageSpace('unknown', [400, 300], true);
      expect(result).toHaveLength(2);
      expect(typeof result[0]).toBe('number');
      expect(typeof result[1]).toBe('number');
    });

    it('useLocalCoords=false returns screen coordinates', () => {
      const [sx, sy] = bridge.eventToImageSpace('testImg', [400, 300], false);
      expect(sx).toBe(400);
      expect(sy).toBe(300);
    });

    it('useLocalCoords=true returns image-local coordinates', () => {
      // Image 200x100 centered in 800x600 -> top-left at (300, 250)
      const [ix, iy] = bridge.eventToImageSpace('testImg', [400, 300], true);
      expect(ix).toBeCloseTo(100);
      expect(iy).toBeCloseTo(50);
    });

    it('default (no flag) behaves the same as useLocalCoords=false', () => {
      const withoutFlag = bridge.eventToImageSpace('testImg', [400, 300]);
      const withFalse = bridge.eventToImageSpace('testImg', [400, 300], false);
      expect(withoutFlag[0]).toBe(withFalse[0]);
      expect(withoutFlag[1]).toBe(withFalse[1]);
    });
  });

  // =====================================================================
  // eventToCameraSpace
  // =====================================================================

  describe('eventToCameraSpace', () => {
    beforeEach(() => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
      }));
    });

    it('maps viewport center to (0, 0)', () => {
      const [cx, cy] = bridge.eventToCameraSpace('', [400, 300]);
      expect(cx).toBeCloseTo(0);
      expect(cy).toBeCloseTo(0);
    });

    it('maps top-left to (-1, 1)', () => {
      const [cx, cy] = bridge.eventToCameraSpace('', [0, 0]);
      expect(cx).toBeCloseTo(-1);
      expect(cy).toBeCloseTo(1);
    });

    it('maps bottom-right to (1, -1)', () => {
      const [cx, cy] = bridge.eventToCameraSpace('', [800, 600]);
      expect(cx).toBeCloseTo(1);
      expect(cy).toBeCloseTo(-1);
    });

    it('returns (0, 0) for zero-size viewport', () => {
      bridge.setViewTransform(defaultViewTransform({ viewWidth: 0, viewHeight: 0 }));
      expect(bridge.eventToCameraSpace('', [100, 100])).toEqual([0, 0]);
    });

    it('uses global transform when viewNodeName is empty', () => {
      bridge.setViewNodeTransform('view1', defaultViewTransform({
        viewWidth: 400,
        viewHeight: 200,
      }));
      // Empty name → global 800×600
      const [cx, cy] = bridge.eventToCameraSpace('', [400, 300]);
      expect(cx).toBeCloseTo(0);
      expect(cy).toBeCloseTo(0);
    });

    it('uses per-node transform when viewNodeName matches', () => {
      bridge.setViewNodeTransform('view1', defaultViewTransform({
        viewWidth: 400,
        viewHeight: 200,
      }));
      // center of the 400×200 node viewport
      const [cx, cy] = bridge.eventToCameraSpace('view1', [200, 100]);
      expect(cx).toBeCloseTo(0);
      expect(cy).toBeCloseTo(0);

      // same point against global 800×600 gives different result
      const [gx, gy] = bridge.eventToCameraSpace('', [200, 100]);
      expect(gx).toBeCloseTo(-0.5);
      expect(gy).toBeCloseTo(2 / 3, 4);
    });

    it('falls back to global transform for unknown viewNodeName', () => {
      bridge.setViewNodeTransform('view1', defaultViewTransform({
        viewWidth: 400,
        viewHeight: 200,
      }));
      // 'unknown' is not registered → should use global 800×600
      const [cx, cy] = bridge.eventToCameraSpace('unknown', [400, 300]);
      expect(cx).toBeCloseTo(0);
      expect(cy).toBeCloseTo(0);
    });

    it('supports multiple view nodes with independent transforms', () => {
      bridge.setViewNodeTransform('left', defaultViewTransform({
        viewWidth: 400,
        viewHeight: 600,
      }));
      bridge.setViewNodeTransform('right', defaultViewTransform({
        viewWidth: 1600,
        viewHeight: 1200,
      }));

      // center for 'left' 400×600
      const [lx, ly] = bridge.eventToCameraSpace('left', [200, 300]);
      expect(lx).toBeCloseTo(0);
      expect(ly).toBeCloseTo(0);

      // same point in 'right' 1600×1200 is top-left quadrant
      const [rx, ry] = bridge.eventToCameraSpace('right', [200, 300]);
      expect(rx).toBeCloseTo(-0.75);
      expect(ry).toBeCloseTo(0.5);
    });

    it('clearViewNodeTransform causes fallback to global transform', () => {
      bridge.setViewNodeTransform('view1', defaultViewTransform({
        viewWidth: 400,
        viewHeight: 200,
      }));
      // Confirm per-node transform is active (center of 400×200)
      const [nx, ny] = bridge.eventToCameraSpace('view1', [200, 100]);
      expect(nx).toBeCloseTo(0);
      expect(ny).toBeCloseTo(0);

      bridge.clearViewNodeTransform('view1');

      // Now 'view1' should fall back to global 800×600
      const [gx, gy] = bridge.eventToCameraSpace('view1', [400, 300]);
      expect(gx).toBeCloseTo(0);
      expect(gy).toBeCloseTo(0);
    });
  });

  // =====================================================================
  // getViewNodeTransform
  // =====================================================================

  describe('getViewNodeTransform', () => {
    it('returns the stored transform after setting it', () => {
      const state = defaultViewTransform({ viewWidth: 400, viewHeight: 200 });
      bridge.setViewNodeTransform('view1', state);
      const retrieved = bridge.getViewNodeTransform('view1');
      expect(retrieved).toBeDefined();
      expect(retrieved!.viewWidth).toBe(400);
      expect(retrieved!.viewHeight).toBe(200);
    });

    it('returns undefined for an unknown view node', () => {
      expect(bridge.getViewNodeTransform('unknown')).toBeUndefined();
    });

    it('returns a copy that does not affect the stored transform', () => {
      bridge.setViewNodeTransform('view1', defaultViewTransform({ scale: 2 }));
      const copy = bridge.getViewNodeTransform('view1')!;
      copy.scale = 999;
      const fresh = bridge.getViewNodeTransform('view1')!;
      expect(fresh.scale).toBe(2);
    });
  });

  // =====================================================================
  // View transform management
  // =====================================================================

  describe('view transform management', () => {
    it('setViewTransform stores state', () => {
      const state = defaultViewTransform({ scale: 2.5 });
      bridge.setViewTransform(state);
      const retrieved = bridge.getViewTransform();
      expect(retrieved.scale).toBe(2.5);
    });

    it('getViewTransform returns a copy', () => {
      bridge.setViewTransform(defaultViewTransform());
      const a = bridge.getViewTransform();
      const b = bridge.getViewTransform();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // =====================================================================
  // setGraph
  // =====================================================================

  describe('setGraph', () => {
    it('clears rendered images when graph is replaced', () => {
      bridge.setRenderedImages([makeRenderedImage('img', 0, 100, 100)]);
      bridge.setGraph(new Graph());
      expect(bridge.renderedImages()).toEqual([]);
    });

    it('metaEvaluate works after setGraph', () => {
      const newGraph = new Graph();
      const n = new TestNode('RVSource', 'newSource');
      newGraph.addNode(n);
      bridge.setGraph(newGraph);

      const result = bridge.metaEvaluate(1, 'newSource');
      expect(result).toHaveLength(1);
      expect(result[0]!.node).toBe('newSource');
    });
  });

  // =====================================================================
  // Pixel aspect ratio
  // =====================================================================

  describe('pixel aspect ratio', () => {
    it('affects screen-to-image conversion', () => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
        pixelAspect: 2,
      }));
      bridge.setRenderedImages([
        makeRenderedImage('wideImg', 0, 200, 100),
      ]);

      // With pixelAspect=2, the image takes 400x100 screen pixels (200*2 x 100)
      // Centered in 800x600 -> top-left at (200, 250)
      const [ix, iy] = bridge.eventToImageSpace('wideImg', [400, 300], true);
      // Screen center to image center: (400-200)/2 = 100, (300-250)/1 = 50
      expect(ix).toBeCloseTo(100);
      expect(iy).toBeCloseTo(50);
    });

    it('affects image geometry corners', () => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
        pixelAspect: 2,
      }));
      bridge.setRenderedImages([
        makeRenderedImage('wideImg', 0, 200, 100),
      ]);

      const corners = bridge.imageGeometry('wideImg');
      expect(corners).toHaveLength(4);
      const bl = corners[0]!;
      const br = corners[1]!;
      // Width in screen space should be 200 * 2 = 400
      expect(br[0] - bl[0]).toBeCloseTo(400);
    });
  });

  // =====================================================================
  // connectToEvents / dispose (Issue #245)
  // =====================================================================

  describe('connectToEvents', () => {
    it('receives view transform updates when viewport changes', () => {
      const { source, emit } = createMockViewEventSource();
      bridge.connectToEvents(source);

      const state = defaultViewTransform({ scale: 3.5, translation: [10, 20] });
      emit('viewTransformChanged', state);

      const retrieved = bridge.getViewTransform();
      expect(retrieved.scale).toBe(3.5);
      expect(retrieved.translation).toEqual([10, 20]);
      expect(retrieved.viewWidth).toBe(800);
      expect(retrieved.viewHeight).toBe(600);
    });

    it('receives rendered image list updates', () => {
      const { source, emit } = createMockViewEventSource();
      bridge.connectToEvents(source);

      const images = [
        makeRenderedImage('shot_01', 0, 1920, 1080),
        makeRenderedImage('shot_02', 1, 3840, 2160),
      ];
      emit('renderedImagesChanged', { images });

      const result = bridge.renderedImages();
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('shot_01');
      expect(result[1]!.name).toBe('shot_02');
      expect(result[1]!.width).toBe(3840);
    });

    it('renderedImages() returns real data after wiring (not empty)', () => {
      // Before connecting, renderedImages() is empty
      expect(bridge.renderedImages()).toEqual([]);

      const { source, emit } = createMockViewEventSource();
      bridge.connectToEvents(source);

      emit('renderedImagesChanged', {
        images: [makeRenderedImage('frame_0001', 0, 2048, 1152)],
      });

      const images = bridge.renderedImages();
      expect(images).toHaveLength(1);
      expect(images[0]!.name).toBe('frame_0001');
      expect(images[0]!.width).toBe(2048);
      expect(images[0]!.height).toBe(1152);
    });

    it('imagesAtPixel() works with real render state', () => {
      const { source, emit } = createMockViewEventSource();
      bridge.connectToEvents(source);

      // Set view transform via events
      emit('viewTransformChanged', defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
      }));

      // Set rendered images via events
      emit('renderedImagesChanged', {
        images: [makeRenderedImage('test_img', 0, 200, 100)],
      });

      // Hit-test at center of viewport → should be inside the image
      const results = bridge.imagesAtPixel([400, 300]);
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('test_img');
      expect(results[0]!.inside).toBe(true);
    });

    it('manual setViewTransform() still works after connectToEvents', () => {
      const { source } = createMockViewEventSource();
      bridge.connectToEvents(source);

      // Manual override should still work
      bridge.setViewTransform(defaultViewTransform({ scale: 5 }));
      expect(bridge.getViewTransform().scale).toBe(5);
    });

    it('manual setRenderedImages() still works after connectToEvents', () => {
      const { source } = createMockViewEventSource();
      bridge.connectToEvents(source);

      bridge.setRenderedImages([makeRenderedImage('manual', 0, 640, 480)]);
      expect(bridge.renderedImages()).toHaveLength(1);
      expect(bridge.renderedImages()[0]!.name).toBe('manual');
    });

    it('cleans up previous subscriptions when called again', () => {
      const mock1 = createMockViewEventSource();
      const mock2 = createMockViewEventSource();

      bridge.connectToEvents(mock1.source);
      mock1.emit('viewTransformChanged', defaultViewTransform({ scale: 2 }));
      expect(bridge.getViewTransform().scale).toBe(2);

      // Connect to second source — first should be disconnected
      bridge.connectToEvents(mock2.source);
      mock1.emit('viewTransformChanged', defaultViewTransform({ scale: 9 }));
      expect(bridge.getViewTransform().scale).toBe(2); // unchanged from mock1

      mock2.emit('viewTransformChanged', defaultViewTransform({ scale: 4 }));
      expect(bridge.getViewTransform().scale).toBe(4); // updated from mock2
    });
  });

  describe('dispose', () => {
    it('disconnects from events', () => {
      const { source, emit } = createMockViewEventSource();
      bridge.connectToEvents(source);

      emit('viewTransformChanged', defaultViewTransform({ scale: 2 }));
      expect(bridge.getViewTransform().scale).toBe(2);

      bridge.dispose();

      emit('viewTransformChanged', defaultViewTransform({ scale: 10 }));
      expect(bridge.getViewTransform().scale).toBe(2); // unchanged after dispose
    });

    it('disconnects rendered images events', () => {
      const { source, emit } = createMockViewEventSource();
      bridge.connectToEvents(source);

      emit('renderedImagesChanged', {
        images: [makeRenderedImage('img1', 0, 100, 100)],
      });
      expect(bridge.renderedImages()).toHaveLength(1);

      bridge.dispose();

      emit('renderedImagesChanged', {
        images: [makeRenderedImage('img2', 1, 200, 200)],
      });
      expect(bridge.renderedImages()).toHaveLength(1);
      expect(bridge.renderedImages()[0]!.name).toBe('img1'); // unchanged
    });

    it('clears pixel readback provider so stencil falls back to geometry', () => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
        scale: 1,
        translation: [0, 0],
        imageWidth: 200,
        imageHeight: 100,
      }));
      bridge.setRenderedImages([makeRenderedImage('testImg', 0, 200, 100)]);

      // Provider that would reject the pixel (transparent)
      const provider: PixelReadbackProvider = {
        readSourcePixel: () => [0.0, 0.0, 0.0, 0.0],
      };
      bridge.setPixelReadbackProvider(provider);

      // Before dispose: stencil rejects the transparent pixel
      const before = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(before).toHaveLength(0);

      bridge.dispose();

      // After dispose: provider is cleared, falls back to geometry-only
      const after = bridge.imagesAtPixel([400, 300], undefined, true);
      expect(after).toHaveLength(1);
      expect(after[0]!.name).toBe('testImg');
    });

    it('clears view node transforms so eventToCameraSpace falls back to global', () => {
      bridge.setViewTransform(defaultViewTransform({
        viewWidth: 800,
        viewHeight: 600,
      }));
      bridge.setViewNodeTransform('view1', defaultViewTransform({
        viewWidth: 400,
        viewHeight: 200,
      }));

      // Before dispose: per-node transform is used (center of 400×200)
      const [bx, by] = bridge.eventToCameraSpace('view1', [200, 100]);
      expect(bx).toBeCloseTo(0);
      expect(by).toBeCloseTo(0);

      bridge.dispose();

      // After dispose: per-node transform is cleared, falls back to global 800×600
      const [ax, ay] = bridge.eventToCameraSpace('view1', [200, 100]);
      // 200/800*2 - 1 = -0.5, 1 - 100/600*2 ≈ 0.667
      expect(ax).toBeCloseTo(-0.5);
      expect(ay).toBeCloseTo(2 / 3, 4);
    });

    it('is safe to call multiple times', () => {
      const { source } = createMockViewEventSource();
      bridge.connectToEvents(source);

      bridge.dispose();
      bridge.dispose(); // second call should not throw
    });

    it('allows reconnection after dispose', () => {
      const mock1 = createMockViewEventSource();
      bridge.connectToEvents(mock1.source);
      bridge.dispose();

      const mock2 = createMockViewEventSource();
      bridge.connectToEvents(mock2.source);
      mock2.emit('viewTransformChanged', defaultViewTransform({ scale: 7 }));
      expect(bridge.getViewTransform().scale).toBe(7);
    });
  });
});
