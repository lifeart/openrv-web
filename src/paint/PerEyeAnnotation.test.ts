/**
 * Per-Eye Annotation Tests
 *
 * Tests for stereo eye-aware annotation filtering in PaintEngine.
 * Annotations can be tagged with 'left', 'right', or 'both' (default)
 * and filtered when rendering for a specific stereo eye.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PaintEngine } from './PaintEngine';
import { ShapeType } from './types';
import type { AnnotationEye } from './types';

describe('Per-Eye Annotations', () => {
  let engine: PaintEngine;

  beforeEach(() => {
    engine = new PaintEngine();
    engine.tool = 'pen';
  });

  // -------------------------------------------------------------------------
  // Data model tests
  // -------------------------------------------------------------------------

  describe('data model', () => {
    it('EYEANN-001: default annotationEye is "both"', () => {
      expect(engine.annotationEye).toBe('both');
    });

    it('EYEANN-002: annotationEye can be set to "left"', () => {
      engine.annotationEye = 'left';
      expect(engine.annotationEye).toBe('left');
    });

    it('EYEANN-003: annotationEye can be set to "right"', () => {
      engine.annotationEye = 'right';
      expect(engine.annotationEye).toBe('right');
    });

    it('EYEANN-004: pen stroke inherits current annotationEye', () => {
      engine.annotationEye = 'left';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      const stroke = engine.endStroke();

      expect(stroke).not.toBeNull();
      expect(stroke!.eye).toBe('left');
    });

    it('EYEANN-005: pen stroke defaults to "both" eye', () => {
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      const stroke = engine.endStroke();

      expect(stroke).not.toBeNull();
      expect(stroke!.eye).toBe('both');
    });

    it('EYEANN-006: text annotation inherits current annotationEye', () => {
      engine.annotationEye = 'right';
      const text = engine.addText(1, { x: 0.5, y: 0.5 }, 'Hello');

      expect(text.eye).toBe('right');
    });

    it('EYEANN-007: shape annotation inherits current annotationEye', () => {
      engine.annotationEye = 'left';
      const shape = engine.addShape(
        1,
        ShapeType.Rectangle,
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
      );

      expect(shape.eye).toBe('left');
    });

    it('EYEANN-008: polygon annotation inherits current annotationEye', () => {
      engine.annotationEye = 'right';
      const shape = engine.addPolygon(1, [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.3, y: 0.5 },
      ]);

      expect(shape.eye).toBe('right');
    });
  });

  // -------------------------------------------------------------------------
  // Filtering tests
  // -------------------------------------------------------------------------

  describe('filtering by eye', () => {
    beforeEach(() => {
      // Add annotations for each eye
      engine.annotationEye = 'left';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationEye = 'right';
      engine.beginStroke(1, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      engine.annotationEye = 'both';
      engine.beginStroke(1, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      engine.endStroke();
    });

    it('EYEANN-010: no eye filter returns all annotations', () => {
      const all = engine.getAnnotationsForFrame(1);
      expect(all).toHaveLength(3);
    });

    it('EYEANN-011: left eye filter returns left + both annotations', () => {
      const leftAnns = engine.getAnnotationsForFrame(1, undefined, 'left');
      expect(leftAnns).toHaveLength(2);
      expect(leftAnns.some(a => a.eye === 'left')).toBe(true);
      expect(leftAnns.some(a => a.eye === 'both')).toBe(true);
      expect(leftAnns.some(a => a.eye === 'right')).toBe(false);
    });

    it('EYEANN-012: right eye filter returns right + both annotations', () => {
      const rightAnns = engine.getAnnotationsForFrame(1, undefined, 'right');
      expect(rightAnns).toHaveLength(2);
      expect(rightAnns.some(a => a.eye === 'right')).toBe(true);
      expect(rightAnns.some(a => a.eye === 'both')).toBe(true);
      expect(rightAnns.some(a => a.eye === 'left')).toBe(false);
    });

    it('EYEANN-013: annotations without eye field pass all eye filters', () => {
      engine.clearAll();
      // Manually add an annotation without eye field
      engine.addAnnotation({
        type: 'pen',
        id: '99',
        frame: 1,
        user: 'test',
        color: [1, 0, 0, 1],
        width: 3,
        brush: 0,
        points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
        join: 3,
        cap: 2,
        splat: false,
        mode: 0,
        startFrame: 1,
        duration: 0,
      });

      expect(engine.getAnnotationsForFrame(1, undefined, 'left')).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(1, undefined, 'right')).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(1)).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Ghost filtering with eye
  // -------------------------------------------------------------------------

  describe('ghost annotations with eye filter', () => {
    beforeEach(() => {
      engine.setGhostMode(true, 2, 2);

      engine.annotationEye = 'left';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationEye = 'right';
      engine.beginStroke(5, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      engine.annotationEye = 'both';
      engine.beginStroke(5, { x: 0.5, y: 0.5 });
      engine.continueStroke({ x: 0.6, y: 0.6 });
      engine.endStroke();
    });

    it('EYEANN-020: getAnnotationsWithGhost respects eye filter on current frame', () => {
      const leftGhost = engine.getAnnotationsWithGhost(5, undefined, 'left');
      expect(leftGhost).toHaveLength(2); // left + both
      expect(leftGhost.every(g => g.opacity === 1)).toBe(true);
    });

    it('EYEANN-021: getAnnotationsWithGhost respects eye filter on ghost frames', () => {
      const leftGhost = engine.getAnnotationsWithGhost(6, undefined, 'left');
      expect(leftGhost).toHaveLength(2); // left + both, ghosted
      expect(leftGhost.every(g => g.opacity < 1)).toBe(true);

      const rightGhost = engine.getAnnotationsWithGhost(6, undefined, 'right');
      expect(rightGhost).toHaveLength(2); // right + both, ghosted
    });

    it('EYEANN-022: no eye filter returns all ghost annotations', () => {
      const allGhost = engine.getAnnotationsWithGhost(6);
      expect(allGhost).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // hasAnnotationsOnFrame with eye filter
  // -------------------------------------------------------------------------

  describe('hasAnnotationsOnFrame with eye filter', () => {
    it('EYEANN-030: detects annotations for specific eye', () => {
      engine.annotationEye = 'left';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.hasAnnotationsOnFrame(1, undefined, 'left')).toBe(true);
      expect(engine.hasAnnotationsOnFrame(1, undefined, 'right')).toBe(false);
    });

    it('EYEANN-031: "both" annotations match any eye filter', () => {
      engine.annotationEye = 'both';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.hasAnnotationsOnFrame(1, undefined, 'left')).toBe(true);
      expect(engine.hasAnnotationsOnFrame(1, undefined, 'right')).toBe(true);
    });

    it('EYEANN-032: no eye filter matches all annotations', () => {
      engine.annotationEye = 'left';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.hasAnnotationsOnFrame(1)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Combined version + eye filtering
  // -------------------------------------------------------------------------

  describe('combined version and eye filtering', () => {
    it('EYEANN-040: version and eye filters work together', () => {
      engine.annotationVersion = 'A';
      engine.annotationEye = 'left';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.annotationVersion = 'B';
      engine.annotationEye = 'right';
      engine.beginStroke(1, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      // Version A + left eye => 1 annotation
      expect(engine.getAnnotationsForFrame(1, 'A', 'left')).toHaveLength(1);
      // Version A + right eye => 0 annotations
      expect(engine.getAnnotationsForFrame(1, 'A', 'right')).toHaveLength(0);
      // Version B + right eye => 1 annotation
      expect(engine.getAnnotationsForFrame(1, 'B', 'right')).toHaveLength(1);
      // Version B + left eye => 0 annotations
      expect(engine.getAnnotationsForFrame(1, 'B', 'left')).toHaveLength(0);
      // No filters => 2 annotations
      expect(engine.getAnnotationsForFrame(1)).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------------

  describe('serialization', () => {
    it('EYEANN-050: toJSON preserves eye field', () => {
      engine.annotationEye = 'left';
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      const snapshot = engine.toJSON();
      const annotations = snapshot.frames[1];
      expect(annotations).toHaveLength(1);
      expect(annotations![0]!.eye).toBe('left');
    });

    it('EYEANN-051: loadFromAnnotations preserves eye field', () => {
      const annotations = [
        {
          type: 'pen' as const,
          id: '1',
          frame: 1,
          user: 'test',
          eye: 'right' as AnnotationEye,
          color: [1, 0, 0, 1] as [number, number, number, number],
          width: 3,
          brush: 0,
          points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
          join: 3,
          cap: 2,
          splat: false,
          mode: 0,
          startFrame: 1,
          duration: 0,
        },
      ];

      engine.loadFromAnnotations(annotations);
      const result = engine.getAnnotationsForFrame(1, undefined, 'right');
      expect(result).toHaveLength(1);
      expect(result[0]!.eye).toBe('right');

      // Should not appear in left eye filter
      const leftResult = engine.getAnnotationsForFrame(1, undefined, 'left');
      expect(leftResult).toHaveLength(0);
    });
  });
});
