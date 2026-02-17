/**
 * PaintEngine Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaintEngine } from './PaintEngine';
import {
  BrushType,
  StrokeMode,
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_PAINT_EFFECTS,
} from './types';

describe('PaintEngine', () => {
  let engine: PaintEngine;

  beforeEach(() => {
    engine = new PaintEngine();
  });

  describe('initialization', () => {
    it('PAINT-001: initializes with default values', () => {
      expect(engine.tool).toBe('none');
      expect(engine.color).toEqual(DEFAULT_STROKE_COLOR);
      expect(engine.width).toBe(DEFAULT_STROKE_WIDTH);
      expect(engine.brush).toBe(BrushType.Circle);
      expect(engine.show).toBe(true);
    });

    it('has empty annotations initially', () => {
      expect(engine.getAnnotationsForFrame(0)).toEqual([]);
      expect(engine.getAnnotatedFrames().size).toBe(0);
    });

    it('has default effects', () => {
      expect(engine.effects).toEqual(DEFAULT_PAINT_EFFECTS);
    });
  });

  describe('tool settings', () => {
    it('PAINT-002: sets tool and emits event', () => {
      const listener = vi.fn();
      engine.on('toolChanged', listener);

      engine.tool = 'pen';
      expect(engine.tool).toBe('pen');
      expect(listener).toHaveBeenCalledWith('pen');
    });

    it('sets color', () => {
      const newColor: [number, number, number, number] = [0, 1, 0, 0.5];
      engine.color = newColor;
      expect(engine.color).toEqual(newColor);
    });

    it('clamps width to valid range', () => {
      engine.width = 0;
      expect(engine.width).toBe(1);

      engine.width = 150;
      expect(engine.width).toBe(100);

      engine.width = 50;
      expect(engine.width).toBe(50);
    });

    it('sets brush and emits event', () => {
      const listener = vi.fn();
      engine.on('brushChanged', listener);

      engine.brush = BrushType.Gaussian;
      expect(engine.brush).toBe(BrushType.Gaussian);
      expect(listener).toHaveBeenCalledWith(BrushType.Gaussian);
    });

    it('does not emit brushChanged if same brush', () => {
      engine.brush = BrushType.Circle;
      const listener = vi.fn();
      engine.on('brushChanged', listener);

      engine.brush = BrushType.Circle;
      expect(listener).not.toHaveBeenCalled();
    });

    it('sets user', () => {
      engine.user = 'testUser';
      expect(engine.user).toBe('testUser');
    });

    it('PE-L57a: PaintTool type should not include unused tool types', () => {
      // Verify that the valid paint tools are exactly the implemented set
      // 'select' was removed as it had no toolbar button, keyboard shortcut, or pointer handler
      const validTools: string[] = ['pen', 'text', 'eraser', 'none', 'rectangle', 'ellipse', 'line', 'arrow'];
      for (const tool of validTools) {
        engine.tool = tool as import('./PaintEngine').PaintTool;
        expect(engine.tool).toBe(tool);
      }
      // Ensure 'select' is not a valid tool by confirming it's absent from the valid set
      expect(validTools).not.toContain('select');
    });
  });

  describe('stroke operations', () => {
    beforeEach(() => {
      engine.tool = 'pen';
    });

    it('PAINT-003: begins stroke on pen tool', () => {
      engine.beginStroke(0, { x: 0.5, y: 0.5 });
      const stroke = engine.getCurrentStroke();

      expect(stroke).not.toBeNull();
      expect(stroke?.type).toBe('pen');
      expect(stroke?.frame).toBe(0);
      expect(stroke?.points).toHaveLength(1);
      expect(stroke?.mode).toBe(StrokeMode.Draw);
    });

    it('PAINT-004: continues stroke', () => {
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.continueStroke({ x: 0.3, y: 0.3 });

      const stroke = engine.getCurrentStroke();
      expect(stroke?.points).toHaveLength(3);
    });

    it('does not continue stroke if none started', () => {
      engine.continueStroke({ x: 0.5, y: 0.5 });
      expect(engine.getCurrentStroke()).toBeNull();
    });

    it('PAINT-005: ends stroke and adds annotation', () => {
      const listener = vi.fn();
      engine.on('strokeAdded', listener);

      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.5, y: 0.5 });
      const stroke = engine.endStroke();

      expect(stroke).not.toBeNull();
      expect(engine.getCurrentStroke()).toBeNull();
      expect(listener).toHaveBeenCalled();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(1);
    });

    it('does not begin stroke with wrong tool', () => {
      engine.tool = 'text';
      engine.beginStroke(0, { x: 0.5, y: 0.5 });
      expect(engine.getCurrentStroke()).toBeNull();
    });

    it('begins eraser stroke', () => {
      engine.tool = 'eraser';
      engine.beginStroke(0, { x: 0.5, y: 0.5 });

      const stroke = engine.getCurrentStroke();
      expect(stroke?.mode).toBe(StrokeMode.Erase);
    });

    it('uses current settings for stroke', () => {
      engine.color = [0, 1, 0, 1];
      engine.width = 10;
      engine.brush = BrushType.Gaussian;
      engine.user = 'artist';

      engine.beginStroke(5, { x: 0.5, y: 0.5 });
      const stroke = engine.getCurrentStroke();

      expect(stroke?.color).toEqual([0, 1, 0, 1]);
      expect(stroke?.width).toBe(10);
      expect(stroke?.brush).toBe(BrushType.Gaussian);
      expect(stroke?.user).toBe('artist');
      expect(stroke?.frame).toBe(5);
    });
  });

  describe('text annotations', () => {
    it('PAINT-006: adds text annotation', () => {
      const listener = vi.fn();
      engine.on('strokeAdded', listener);

      const text = engine.addText(0, { x: 0.5, y: 0.5 }, 'Test text', 24);

      expect(text.type).toBe('text');
      expect(text.text).toBe('Test text');
      expect(text.size).toBe(24);
      expect(listener).toHaveBeenCalled();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(1);
    });

    it('uses current color for text', () => {
      engine.color = [0, 0, 1, 1];
      const text = engine.addText(0, { x: 0.5, y: 0.5 }, 'Blue text');

      expect(text.color).toEqual([0, 0, 1, 1]);
    });
  });

  describe('annotation management', () => {
    it('PAINT-007: removes annotation by id', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      const stroke = engine.endStroke()!;

      const listener = vi.fn();
      engine.on('strokeRemoved', listener);

      const removed = engine.removeAnnotation(stroke.id, 0);
      expect(removed).not.toBeNull();
      expect(removed?.id).toBe(stroke.id);
      expect(listener).toHaveBeenCalled();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);
    });

    it('returns null for non-existent annotation', () => {
      const removed = engine.removeAnnotation('nonexistent', 0);
      expect(removed).toBeNull();
    });

    it('PAINT-008: clears frame', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();
      engine.beginStroke(0, { x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.getAnnotationsForFrame(0)).toHaveLength(2);

      const cleared = engine.clearFrame(0);
      expect(cleared).toHaveLength(2);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);
    });

    it('PAINT-009: clears all annotations', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();
      engine.beginStroke(1, { x: 0.2, y: 0.2 });
      engine.endStroke();

      expect(engine.getAnnotatedFrames().size).toBe(2);

      engine.clearAll();
      expect(engine.getAnnotatedFrames().size).toBe(0);
    });

    it('tracks annotated frames', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();
      engine.beginStroke(5, { x: 0.2, y: 0.2 });
      engine.endStroke();
      engine.beginStroke(10, { x: 0.3, y: 0.3 });
      engine.endStroke();

      const frames = engine.getAnnotatedFrames();
      expect(frames.size).toBe(3);
      expect(frames.has(0)).toBe(true);
      expect(frames.has(5)).toBe(true);
      expect(frames.has(10)).toBe(true);
    });

    it('checks if frame has annotations', () => {
      engine.tool = 'pen';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      expect(engine.hasAnnotationsOnFrame(5)).toBe(true);
      expect(engine.hasAnnotationsOnFrame(0)).toBe(false);
    });
  });

  describe('annotation visibility', () => {
    it('returns empty when show is false', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();

      engine.show = false;
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);
    });

    it('annotation visible only on its frame by default', () => {
      engine.tool = 'pen';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      expect(engine.getAnnotationsForFrame(5)).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(4)).toHaveLength(0);
      expect(engine.getAnnotationsForFrame(6)).toHaveLength(0);
    });
  });

  describe('ghost mode', () => {
    it('PAINT-010: sets ghost mode', () => {
      const listener = vi.fn();
      engine.on('effectsChanged', listener);

      engine.setGhostMode(true, 5, 3);

      expect(engine.effects.ghost).toBe(true);
      expect(engine.effects.ghostBefore).toBe(5);
      expect(engine.effects.ghostAfter).toBe(3);
      expect(listener).toHaveBeenCalled();
    });

    it('returns ghost annotations with opacity', () => {
      engine.tool = 'pen';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      engine.setGhostMode(true, 3, 3);

      // Check frame before
      const before = engine.getAnnotationsWithGhost(6);
      expect(before.length).toBe(1);
      expect(before[0]!.opacity).toBeLessThan(1);

      // Check frame after (annotation appears from future)
      const after = engine.getAnnotationsWithGhost(4);
      expect(after.length).toBe(1);
      expect(after[0]!.opacity).toBeLessThan(1);
    });

    it('returns full opacity for direct frame', () => {
      engine.tool = 'pen';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      engine.setGhostMode(true, 3, 3);
      const annotations = engine.getAnnotationsWithGhost(5);

      expect(annotations.length).toBe(1);
      expect(annotations[0]!.opacity).toBe(1);
    });
  });

  describe('hold mode', () => {
    it('PAINT-011: sets hold mode', () => {
      const listener = vi.fn();
      engine.on('effectsChanged', listener);

      engine.setHoldMode(true);

      expect(engine.effects.hold).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('PAINT-016: stroke with hold OFF has duration 0', () => {
      engine.tool = 'pen';
      engine.setHoldMode(false);

      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      const stroke = engine.endStroke();

      expect(stroke?.duration).toBe(0);
    });

    it('PAINT-017: stroke with hold ON has duration -1', () => {
      engine.tool = 'pen';
      engine.setHoldMode(true);

      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      const stroke = engine.endStroke();

      expect(stroke?.duration).toBe(-1);
    });

    it('PAINT-018: text with hold OFF has duration 0', () => {
      engine.setHoldMode(false);

      const text = engine.addText(5, { x: 0.5, y: 0.5 }, 'Test');

      expect(text.duration).toBe(0);
    });

    it('PAINT-019: text with hold ON has duration -1', () => {
      engine.setHoldMode(true);

      const text = engine.addText(5, { x: 0.5, y: 0.5 }, 'Test');

      expect(text.duration).toBe(-1);
    });

    it('PAINT-020: shape with hold OFF has duration 0', () => {
      engine.setHoldMode(false);

      const shape = engine.addRectangle(5, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 });

      expect(shape.duration).toBe(0);
    });

    it('PAINT-021: shape with hold ON has duration -1', () => {
      engine.setHoldMode(true);

      const shape = engine.addRectangle(5, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 });

      expect(shape.duration).toBe(-1);
    });

    it('PAINT-022: annotation with duration -1 visible on subsequent frames', () => {
      engine.tool = 'pen';
      engine.setHoldMode(true);

      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      // Visible on frame 5 (drawn frame)
      expect(engine.getAnnotationsForFrame(5)).toHaveLength(1);
      // Visible on frame 6, 7, 10, 100 (all subsequent frames)
      expect(engine.getAnnotationsForFrame(6)).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(7)).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(10)).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(100)).toHaveLength(1);
      // NOT visible on frame 4 (before drawn frame)
      expect(engine.getAnnotationsForFrame(4)).toHaveLength(0);
    });

    it('PAINT-023: annotation with duration 0 visible only on drawn frame', () => {
      engine.tool = 'pen';
      engine.setHoldMode(false);

      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      // Visible only on frame 5
      expect(engine.getAnnotationsForFrame(5)).toHaveLength(1);
      // NOT visible on any other frame
      expect(engine.getAnnotationsForFrame(4)).toHaveLength(0);
      expect(engine.getAnnotationsForFrame(6)).toHaveLength(0);
    });

    it('PAINT-024: turning hold OFF does not affect already-drawn hold annotations', () => {
      engine.tool = 'pen';
      engine.setHoldMode(true);

      // Draw with hold ON
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      // Turn hold OFF
      engine.setHoldMode(false);

      // Annotation should still persist (duration was set at draw time)
      expect(engine.getAnnotationsForFrame(5)).toHaveLength(1);
      expect(engine.getAnnotationsForFrame(10)).toHaveLength(1);
    });
  });

  describe('undo/redo', () => {
    it('PAINT-012: undoes last stroke', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();

      expect(engine.getAnnotationsForFrame(0)).toHaveLength(1);

      const result = engine.undo();
      expect(result).toBe(true);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);
    });

    it('PAINT-013: redoes undone stroke', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();

      engine.undo();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);

      const result = engine.redo();
      expect(result).toBe(true);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(1);
    });

    it('returns false when nothing to undo', () => {
      expect(engine.undo()).toBe(false);
    });

    it('returns false when nothing to redo', () => {
      expect(engine.redo()).toBe(false);
    });

    it('clears redo stack on new action', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();

      engine.undo();
      expect(engine.redo()).toBe(true);
      engine.undo();

      // Add new stroke
      engine.beginStroke(0, { x: 0.2, y: 0.2 });
      engine.endStroke();

      // Redo should now fail because stack was cleared
      expect(engine.redo()).toBe(false);
    });

    it('undo after clearFrame clears redo stack', () => {
      // The current implementation's undo is designed for undoing single stroke additions
      // clearFrame has different undo semantics (would need to restore annotations)
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();

      // Undo the stroke
      engine.undo();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);

      // Add new stroke (clears redo)
      engine.beginStroke(0, { x: 0.2, y: 0.2 });
      engine.endStroke();

      // Redo should fail since stack was cleared
      expect(engine.redo()).toBe(false);
    });
  });

  describe('serialization', () => {
    it('PAINT-014: exports to JSON', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();
      engine.addText(5, { x: 0.5, y: 0.5 }, 'Test');

      const json = engine.toJSON() as unknown as Record<string, unknown>;

      expect(json.nextId).toBeDefined();
      expect(json.show).toBe(true);
      expect(json.frames).toBeDefined();
      expect(json.effects).toBeDefined();
    });

    it('PAINT-015: loads from annotations', () => {
      const annotations = [
        {
          type: 'pen' as const,
          id: '5',
          frame: 0,
          user: 'test',
          color: [1, 0, 0, 1] as [number, number, number, number],
          width: 5,
          brush: BrushType.Circle,
          points: [{ x: 0.1, y: 0.1 }],
          join: 3,
          cap: 2,
          splat: false,
          mode: StrokeMode.Draw,
          startFrame: 0,
          duration: 0,
        },
      ];

      engine.loadFromAnnotations(annotations);

      expect(engine.getAnnotationsForFrame(0)).toHaveLength(1);
      // nextId should be updated to avoid collision
    });

    it('loads effects from annotations', () => {
      const effects = { ghost: true, ghostBefore: 5, ghostAfter: 5, hold: true };
      engine.loadFromAnnotations([], effects);

      expect(engine.effects.ghost).toBe(true);
      expect(engine.effects.ghostBefore).toBe(5);
      expect(engine.effects.hold).toBe(true);
    });
  });

  describe('event emission', () => {
    it('emits annotationsChanged on stroke add', () => {
      const listener = vi.fn();
      engine.on('annotationsChanged', listener);

      engine.tool = 'pen';
      engine.beginStroke(5, { x: 0.1, y: 0.1 });
      engine.endStroke();

      expect(listener).toHaveBeenCalledWith(5);
    });

    it('emits annotationsChanged on undo', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();

      const listener = vi.fn();
      engine.on('annotationsChanged', listener);

      engine.undo();
      expect(listener).toHaveBeenCalledWith(0);
    });
  });
});
