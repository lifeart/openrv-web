/**
 * Comparison Annotations Tests
 *
 * Tests for version-linked annotations in A/B compare mode.
 * Covers COMP-001 through COMP-004 acceptance criteria.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaintEngine } from './PaintEngine';
import { ShapeType } from './types';

describe('Comparison Annotations', () => {
  let engine: PaintEngine;

  beforeEach(() => {
    engine = new PaintEngine();
    engine.tool = 'pen';
  });

  describe('COMP-001: Annotation attached to specific version', () => {
    it('COMP-001a: pen stroke created on version A has version A', () => {
      engine.annotationVersion = 'A';
      engine.beginStroke(10, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      const stroke = engine.endStroke();

      expect(stroke).not.toBeNull();
      expect(stroke!.version).toBe('A');
    });

    it('COMP-001b: pen stroke created on version B has version B', () => {
      engine.annotationVersion = 'B';
      engine.beginStroke(10, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      const stroke = engine.endStroke();

      expect(stroke).not.toBeNull();
      expect(stroke!.version).toBe('B');
    });

    it('COMP-001c: multiple annotations same frame different versions', () => {
      engine.annotationVersion = 'A';
      engine.beginStroke(10, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.beginStroke(10, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      // Without filter, both visible
      const all = engine.getAnnotationsForFrame(10);
      expect(all).toHaveLength(2);

      // Filter by A
      const aOnly = engine.getAnnotationsForFrame(10, 'A');
      expect(aOnly).toHaveLength(1);
      expect(aOnly[0]!.version).toBe('A');

      // Filter by B
      const bOnly = engine.getAnnotationsForFrame(10, 'B');
      expect(bOnly).toHaveLength(1);
      expect(bOnly[0]!.version).toBe('B');
    });

    it('COMP-001e: text annotation has version', () => {
      engine.tool = 'text';
      engine.annotationVersion = 'A';
      const text = engine.addText(5, { x: 0.5, y: 0.5 }, 'Review this');

      expect(text.version).toBe('A');
    });

    it('COMP-001f: shape annotation has version', () => {
      engine.annotationVersion = 'B';
      const shape = engine.addShape(
        15,
        ShapeType.Rectangle,
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 }
      );

      expect(shape.version).toBe('B');
    });

    it('COMP-001g: default version is all', () => {
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      const stroke = engine.endStroke();

      expect(stroke!.version).toBe('all');
    });
  });

  describe('COMP-002: Switching versions shows/hides annotations', () => {
    beforeEach(() => {
      // Create annotations on different versions
      engine.annotationVersion = 'A';
      engine.beginStroke(10, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();
      engine.beginStroke(10, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.beginStroke(10, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      engine.endStroke();
    });

    it('COMP-002a: filtering by A shows only A annotations', () => {
      const visible = engine.getAnnotationsForFrame(10, 'A');
      expect(visible).toHaveLength(2);
      visible.forEach(a => expect(a.version).toBe('A'));
    });

    it('COMP-002b: filtering by B shows only B annotations', () => {
      const visible = engine.getAnnotationsForFrame(10, 'B');
      expect(visible).toHaveLength(1);
      visible.forEach(a => expect(a.version).toBe('B'));
    });

    it('COMP-002c: no filter shows all annotations', () => {
      const visible = engine.getAnnotationsForFrame(10);
      expect(visible).toHaveLength(3);
    });

    it('COMP-002d: frame with only A annotations is empty when filtering by B', () => {
      // Add annotation only on frame 20 for version A
      engine.annotationVersion = 'A';
      engine.beginStroke(20, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.getAnnotationsForFrame(20, 'B')).toHaveLength(0);
      expect(engine.getAnnotationsForFrame(20, 'A')).toHaveLength(1);
    });

    it('COMP-002e: ghost mode respects version filter', () => {
      engine.setGhostMode(true, 3, 3);

      // Frame 10 has A and B annotations
      // Frame 11 is empty but within ghost range

      // Ghost from A should show
      const ghostA = engine.getAnnotationsWithGhost(11, 'A');
      expect(ghostA.length).toBeGreaterThan(0);
      ghostA.forEach(g => {
        expect(g.annotation.version).toBe('A');
        expect(g.opacity).toBeLessThan(1); // Ghost opacity
      });

      // Ghost from B should show
      const ghostB = engine.getAnnotationsWithGhost(11, 'B');
      expect(ghostB.length).toBeGreaterThan(0);
      ghostB.forEach(g => {
        expect(g.annotation.version).toBe('B');
      });
    });

    it('COMP-002f: hold mode annotations respect version filter', () => {
      // Create hold-mode annotation on version A
      engine.setHoldMode(true);
      engine.annotationVersion = 'A';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();
      engine.setHoldMode(false);

      // Hold annotation visible on future frames when filtering A
      expect(engine.getAnnotationsForFrame(15, 'A')).toHaveLength(1);

      // Hold annotation NOT visible when filtering B
      expect(engine.getAnnotationsForFrame(15, 'B')).toHaveLength(0);
    });
  });

  describe('COMP-003: All versions annotation always visible', () => {
    it('COMP-003a: annotation with version all is always visible', () => {
      engine.annotationVersion = 'all';
      engine.beginStroke(8, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      engine.endStroke();

      expect(engine.getAnnotationsForFrame(8, 'A')).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(8, 'B')).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(8)).toHaveLength(1);
    });

    it('COMP-003b: all-version annotation visible alongside version-specific', () => {
      engine.annotationVersion = 'A';
      engine.beginStroke(15, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.beginStroke(15, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      engine.annotationVersion = 'all';
      engine.beginStroke(15, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      engine.endStroke();

      // Filter A: A annotation + all annotation = 2
      expect(engine.getAnnotationsForFrame(15, 'A')).toHaveLength(2);

      // Filter B: B annotation + all annotation = 2
      expect(engine.getAnnotationsForFrame(15, 'B')).toHaveLength(2);

      // No filter: all 3
      expect(engine.getAnnotationsForFrame(15)).toHaveLength(3);
    });

    it('COMP-003c: annotations without version property are always visible', () => {
      // Simulate legacy annotation (no version field)
      engine.beginStroke(20, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      const stroke = engine.endStroke()!;
      // Remove version to simulate legacy
      delete (stroke as any).version;

      expect(engine.getAnnotationsForFrame(20, 'A')).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(20, 'B')).toHaveLength(1);
    });
  });

  describe('COMP-004: Filter by version works', () => {
    it('COMP-004a: annotationVersion getter/setter works', () => {
      expect(engine.annotationVersion).toBe('all');
      engine.annotationVersion = 'A';
      expect(engine.annotationVersion).toBe('A');
      engine.annotationVersion = 'B';
      expect(engine.annotationVersion).toBe('B');
    });

    it('COMP-004b: hasAnnotationsOnFrame respects version filter', () => {
      engine.annotationVersion = 'A';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.hasAnnotationsOnFrame(5)).toBe(true);
      expect(engine.hasAnnotationsOnFrame(5, 'A')).toBe(true);
      expect(engine.hasAnnotationsOnFrame(5, 'B')).toBe(false);
    });

    it('COMP-004c: hasAnnotationsOnFrame includes all-version annotations', () => {
      engine.annotationVersion = 'all';
      engine.beginStroke(7, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.hasAnnotationsOnFrame(7, 'A')).toBe(true);
      expect(engine.hasAnnotationsOnFrame(7, 'B')).toBe(true);
    });

    it('COMP-004d: version filter does not affect unfiltered queries', () => {
      engine.annotationVersion = 'A';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.beginStroke(1, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      // Unfiltered always returns all
      expect(engine.getAnnotationsForFrame(1)).toHaveLength(2);
      expect(engine.hasAnnotationsOnFrame(1)).toBe(true);
    });

    it('COMP-004e: all annotation types respect version filter', () => {
      // Pen
      engine.annotationVersion = 'A';
      engine.beginStroke(30, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      // Text
      engine.tool = 'text';
      engine.annotationVersion = 'B';
      engine.addText(30, { x: 0.5, y: 0.5 }, 'Note');

      // Shape
      engine.annotationVersion = 'all';
      engine.addShape(30, ShapeType.Ellipse, { x: 0, y: 0 }, { x: 1, y: 1 });

      // Filter A: pen + shape = 2
      const aAnns = engine.getAnnotationsForFrame(30, 'A');
      expect(aAnns).toHaveLength(2);
      expect(aAnns.map(a => a.type).sort()).toEqual(['pen', 'shape']);

      // Filter B: text + shape = 2
      const bAnns = engine.getAnnotationsForFrame(30, 'B');
      expect(bAnns).toHaveLength(2);
      expect(bAnns.map(a => a.type).sort()).toEqual(['shape', 'text']);
    });
  });

  describe('COMP-005: Polygon annotation version', () => {
    it('COMP-005a: addPolygon assigns the current annotation version', () => {
      engine.annotationVersion = 'A';
      const polygon = engine.addPolygon(10, [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ]);

      expect(polygon.version).toBe('A');
    });

    it('COMP-005b: addPolygon with version B assigns version B', () => {
      engine.annotationVersion = 'B';
      const polygon = engine.addPolygon(10, [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.2 },
        { x: 0.4, y: 0.6 },
      ]);

      expect(polygon.version).toBe('B');
    });

    it('COMP-005c: addPolygon with default version assigns all', () => {
      // Default annotationVersion is 'all'
      const polygon = engine.addPolygon(10, [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ]);

      expect(polygon.version).toBe('all');
    });

    it('COMP-005d: polygon respects version filter in getAnnotationsForFrame', () => {
      engine.annotationVersion = 'A';
      engine.addPolygon(10, [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ]);

      engine.annotationVersion = 'B';
      engine.addPolygon(10, [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.2 },
        { x: 0.4, y: 0.6 },
      ]);

      expect(engine.getAnnotationsForFrame(10, 'A')).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(10, 'B')).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(10)).toHaveLength(2);
    });
  });

  describe('COMP-006: Serialization roundtrip preserves version', () => {
    it('COMP-006a: toJSON and loadFromAnnotations preserves version on all annotation types', () => {
      // Create annotations with different versions and types
      engine.annotationVersion = 'A';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.addText(1, { x: 0.5, y: 0.5 }, 'Note B');

      engine.annotationVersion = 'all';
      engine.addShape(1, ShapeType.Rectangle, { x: 0, y: 0 }, { x: 1, y: 1 });

      engine.annotationVersion = 'A';
      engine.addPolygon(1, [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ]);

      // Serialize
      const snapshot = engine.toJSON();
      const allAnnotations = Object.values(snapshot.frames).flat();

      // Load into a fresh engine
      const engine2 = new PaintEngine();
      engine2.tool = 'pen';
      engine2.loadFromAnnotations(allAnnotations, snapshot.effects);

      // Verify version-filtered queries match
      // Filter A: pen stroke (A) + shape (all) + polygon (A) = 3
      const aAnns = engine2.getAnnotationsForFrame(1, 'A');
      expect(aAnns).toHaveLength(3);
      aAnns.forEach(a => expect(a.version === 'A' || a.version === 'all').toBe(true));

      // Filter B: text (B) + shape (all) = 2
      const bAnns = engine2.getAnnotationsForFrame(1, 'B');
      expect(bAnns).toHaveLength(2);
      bAnns.forEach(a => expect(a.version === 'B' || a.version === 'all').toBe(true));

      // All annotations present without filter
      expect(engine2.getAnnotationsForFrame(1)).toHaveLength(4);
    });

    it('COMP-006b: version field survives JSON stringify/parse roundtrip', () => {
      engine.annotationVersion = 'B';
      engine.addPolygon(5, [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.5, y: 0.9 },
      ]);

      const snapshot = engine.toJSON();
      const json = JSON.stringify(snapshot);
      const parsed = JSON.parse(json);

      const engine2 = new PaintEngine();
      const allAnnotations = Object.values(parsed.frames).flat() as any[];
      engine2.loadFromAnnotations(allAnnotations, parsed.effects);

      const bAnns = engine2.getAnnotationsForFrame(5, 'B');
      expect(bAnns).toHaveLength(1);
      expect(bAnns[0]!.version).toBe('B');

      // Not visible when filtering for A
      expect(engine2.getAnnotationsForFrame(5, 'A')).toHaveLength(0);
    });
  });

  describe('COMP-007: clearFrame removes all versions', () => {
    it('COMP-007a: clearFrame removes annotations from all versions', () => {
      engine.annotationVersion = 'A';
      engine.beginStroke(10, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.beginStroke(10, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      engine.annotationVersion = 'all';
      engine.beginStroke(10, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      engine.endStroke();

      // Verify all 3 exist
      expect(engine.getAnnotationsForFrame(10)).toHaveLength(3);

      // clearFrame removes everything on the frame regardless of version
      const removed = engine.clearFrame(10);
      expect(removed).toHaveLength(3);

      expect(engine.getAnnotationsForFrame(10)).toHaveLength(0);
      expect(engine.getAnnotationsForFrame(10, 'A')).toHaveLength(0);
      expect(engine.getAnnotationsForFrame(10, 'B')).toHaveLength(0);
      expect(engine.hasAnnotationsOnFrame(10)).toBe(false);
    });

    it('COMP-007b: clearFrame does not affect other frames', () => {
      engine.annotationVersion = 'A';
      engine.beginStroke(10, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.beginStroke(20, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      engine.clearFrame(10);

      // Frame 10 cleared
      expect(engine.getAnnotationsForFrame(10)).toHaveLength(0);

      // Frame 20 untouched
      expect(engine.getAnnotationsForFrame(20)).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(20, 'B')).toHaveLength(1);
    });
  });
});
