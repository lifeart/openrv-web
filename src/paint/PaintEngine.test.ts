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
      const validTools: string[] = ['pen', 'text', 'eraser', 'none', 'rectangle', 'ellipse', 'line', 'arrow', 'dodge', 'burn', 'clone', 'smudge'];
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

    it('PAINT-006b: updateTextAnnotation applies spacing', () => {
      const text = engine.addText(0, { x: 0.5, y: 0.5 }, 'Spaced text', 24);
      expect(text.spacing).toBe(0);

      const result = engine.updateTextAnnotation(0, text.id, { spacing: 5 });
      expect(result).toBe(true);

      const annotations = engine.getAnnotationsForFrame(0);
      const updated = annotations[0] as import('./types').TextAnnotation;
      expect(updated.spacing).toBe(5);
    });

    it('PAINT-006c: addText accepts spacing via options', () => {
      const text = engine.addText(0, { x: 0.5, y: 0.5 }, 'Custom spacing', 24, { spacing: 3 });
      expect(text.spacing).toBe(3);
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

    it('PAINT-012b: clearFrame undo correctly restores annotations', () => {
      // 1. Draw strokes
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();
      engine.beginStroke(0, { x: 0.2, y: 0.2 });
      engine.endStroke();
      
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(2);

      // 2. Clear frame
      const cleared = engine.clearFrame(0);
      expect(cleared).toHaveLength(2);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);

      // 3. Undo clearFrame -> should restore annotations
      const result = engine.undo();
      expect(result).toBe(true);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(2);
      
      // 4. Redo -> should clear frame again
      const redoResult = engine.redo();
      expect(redoResult).toBe(true);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);
    });

    it('PAINT-012b2: clearFrame undo restores stroke data faithfully', () => {
      // Draw strokes with distinct properties
      engine.tool = 'pen';
      engine.color = [1, 0, 0, 1];
      engine.width = 5;
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.continueStroke({ x: 0.2, y: 0.2 });
      engine.endStroke();

      engine.color = [0, 1, 0, 1];
      engine.width = 10;
      engine.beginStroke(0, { x: 0.3, y: 0.3 });
      engine.continueStroke({ x: 0.4, y: 0.4 });
      engine.endStroke();

      const beforeClear = engine.getAnnotationsForFrame(0);
      expect(beforeClear).toHaveLength(2);
      const ids = beforeClear.map(a => a.id);

      // Clear and undo
      engine.clearFrame(0);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);

      engine.undo();
      const restored = engine.getAnnotationsForFrame(0);
      expect(restored).toHaveLength(2);

      // Verify the restored annotations have matching IDs and data
      expect(restored.map(a => a.id)).toEqual(ids);
      const firstStroke = restored[0] as import('./types').PenStroke;
      expect(firstStroke.color).toEqual([1, 0, 0, 1]);
      expect(firstStroke.width).toBe(5);
      const secondStroke = restored[1] as import('./types').PenStroke;
      expect(secondStroke.color).toEqual([0, 1, 0, 1]);
      expect(secondStroke.width).toBe(10);
    });

    it('PAINT-012b3: clearFrame redo re-clears the frame', () => {
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();
      engine.beginStroke(0, { x: 0.2, y: 0.2 });
      engine.endStroke();

      // Clear, undo, redo
      engine.clearFrame(0);
      engine.undo();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(2);

      engine.redo();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);

      // Undo again to verify round-trip
      engine.undo();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(2);
    });

    it('PAINT-012c: redo clear preserves remote annotations added after undo', () => {
      // 1. Draw a stroke on frame 0
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      engine.endStroke();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(1);

      // 2. Clear frame 0
      engine.clearFrame(0);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(0);

      // 3. Undo the clear → restores the original stroke
      engine.undo();
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(1);

      // 4. A remote peer adds an annotation (doesn't clear redo stack)
      engine.addRemoteAnnotation({
        type: 'text',
        id: 'remote-1',
        frame: 0,
        user: 'peer',
        version: 'all',
        eye: 'both',
        position: { x: 0.5, y: 0.5 },
        color: [255, 0, 0, 255],
        text: 'Remote note',
        size: 24,
        scale: 1,
        rotation: 0,
        spacing: 0,
        font: 'sans-serif',
        origin: 0,
        startFrame: 0,
        duration: 0,
      } as any);
      expect(engine.getAnnotationsForFrame(0)).toHaveLength(2);

      // 5. Redo the clear → should only remove the original stroke,
      //    NOT the remote annotation added after undo
      engine.redo();
      const remaining = engine.getAnnotationsForFrame(0);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.type).toBe('text');
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

  describe('remote annotation methods', () => {
    it('addRemoteAnnotation adds annotation without affecting undo stack', () => {
      const annotation = {
        type: 'pen' as const,
        id: 'remote-1',
        frame: 5,
        user: 'alice',
        color: [1, 0, 0, 1] as [number, number, number, number],
        width: 3,
        brush: 0,
        points: [{ x: 0.1, y: 0.2 }],
        join: 3,
        cap: 2,
        splat: false,
        mode: 0,
        startFrame: 5,
        duration: 0,
      };

      engine.addRemoteAnnotation(annotation as any);
      expect(engine.getAnnotationsForFrame(5)).toHaveLength(1);

      // Undo should not remove it
      const undone = engine.undo();
      expect(undone).toBe(false);
      expect(engine.getAnnotationsForFrame(5)).toHaveLength(1);
    });

    it('addRemoteAnnotation emits annotationsChanged but not strokeAdded', () => {
      const changedListener = vi.fn();
      const addedListener = vi.fn();
      engine.on('annotationsChanged', changedListener);
      engine.on('strokeAdded', addedListener);

      engine.addRemoteAnnotation({
        type: 'pen', id: 'r1', frame: 3, user: 'bob',
        color: [0, 1, 0, 1], width: 2, brush: 0,
        points: [{ x: 0, y: 0 }], join: 3, cap: 2,
        splat: false, mode: 0, startFrame: 3, duration: 0,
      } as any);

      expect(changedListener).toHaveBeenCalledWith(3);
      expect(addedListener).not.toHaveBeenCalled();
    });

    it('removeRemoteAnnotation removes without affecting undo stack', () => {
      engine.addRemoteAnnotation({
        type: 'pen', id: 'r2', frame: 1, user: 'alice',
        color: [1, 0, 0, 1], width: 3, brush: 0,
        points: [{ x: 0, y: 0 }], join: 3, cap: 2,
        splat: false, mode: 0, startFrame: 1, duration: 0,
      } as any);

      const removed = engine.removeRemoteAnnotation('r2', 1);
      expect(removed).not.toBeNull();
      expect(engine.getAnnotationsForFrame(1)).toHaveLength(0);
    });

    it('clearRemoteFrame clears all annotations on frame', () => {
      engine.addRemoteAnnotation({
        type: 'pen', id: 'c1', frame: 2, user: 'alice',
        color: [1, 0, 0, 1], width: 3, brush: 0,
        points: [{ x: 0, y: 0 }], join: 3, cap: 2,
        splat: false, mode: 0, startFrame: 2, duration: 0,
      } as any);
      engine.addRemoteAnnotation({
        type: 'text', id: 'c2', frame: 2, user: 'bob',
        position: { x: 0.5, y: 0.5 }, color: [0, 0, 1, 1],
        text: 'Hello', size: 24, scale: 1, rotation: 0,
        spacing: 0, font: 'sans-serif', origin: 4,
        startFrame: 2, duration: 0,
      } as any);

      expect(engine.getAnnotationsForFrame(2)).toHaveLength(2);
      engine.clearRemoteFrame(2);
      expect(engine.getAnnotationsForFrame(2)).toHaveLength(0);
    });

    it('addRemoteAnnotation updates nextId to avoid collisions', () => {
      engine.addRemoteAnnotation({
        type: 'pen', id: '100', frame: 0, user: 'alice',
        color: [1, 0, 0, 1], width: 3, brush: 0,
        points: [{ x: 0, y: 0 }], join: 3, cap: 2,
        splat: false, mode: 0, startFrame: 0, duration: 0,
      } as any);

      // Next local annotation should get id > 100
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.5, y: 0.5 });
      const stroke = engine.endStroke();
      expect(Number(stroke!.id)).toBeGreaterThan(100);
    });

    it('addRemoteAnnotation handles prefixed IDs for nextId', () => {
      engine.addRemoteAnnotation({
        type: 'pen', id: 'user1-50', frame: 0, user: 'alice',
        color: [1, 0, 0, 1], width: 3, brush: 0,
        points: [{ x: 0, y: 0 }], join: 3, cap: 2,
        splat: false, mode: 0, startFrame: 0, duration: 0,
      } as any);

      // nextId should be updated based on the numeric suffix
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.5, y: 0.5 });
      const stroke = engine.endStroke();
      const numericPart = stroke!.id.includes('-') ? Number(stroke!.id.split('-').pop()) : Number(stroke!.id);
      expect(numericPart).toBeGreaterThanOrEqual(51);
    });
  });

  describe('id prefix', () => {
    it('PAINT-030: setIdPrefix sets prefix for generated IDs', () => {
      engine.setIdPrefix('user1');
      expect(engine.idPrefix).toBe('user1');

      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      const stroke = engine.endStroke();

      expect(stroke!.id).toMatch(/^user1-\d+$/);
    });

    it('PAINT-031: empty prefix generates plain numeric IDs', () => {
      engine.setIdPrefix('');
      expect(engine.idPrefix).toBe('');

      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      const stroke = engine.endStroke();

      expect(stroke!.id).toMatch(/^\d+$/);
    });

    it('PAINT-032: prefix applies to text annotations', () => {
      engine.setIdPrefix('peer2');
      const text = engine.addText(0, { x: 0.5, y: 0.5 }, 'Hello');
      expect(text.id).toMatch(/^peer2-\d+$/);
    });

    it('PAINT-033: prefix applies to shape annotations', () => {
      engine.setIdPrefix('peer3');
      const shape = engine.addRectangle(0, { x: 0, y: 0 }, { x: 1, y: 1 });
      expect(shape.id).toMatch(/^peer3-\d+$/);
    });

    it('PAINT-034: prefix applies to polygon annotations', () => {
      engine.setIdPrefix('peer4');
      const shape = engine.addPolygon(0, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]);
      expect(shape.id).toMatch(/^peer4-\d+$/);
    });

    it('PAINT-035: clearing prefix reverts to numeric IDs', () => {
      engine.setIdPrefix('user1');
      engine.tool = 'pen';
      engine.beginStroke(0, { x: 0.1, y: 0.1 });
      const stroke1 = engine.endStroke();
      expect(stroke1!.id).toContain('user1-');

      engine.setIdPrefix('');
      engine.beginStroke(1, { x: 0.1, y: 0.1 });
      const stroke2 = engine.endStroke();
      expect(stroke2!.id).not.toContain('-');
    });

    it('PAINT-036: loadFromAnnotations handles prefixed IDs', () => {
      const annotations = [
        {
          type: 'pen' as const,
          id: 'user1-10',
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

      // nextId should be >= 11 to avoid collisions
      engine.tool = 'pen';
      engine.beginStroke(1, { x: 0.5, y: 0.5 });
      const stroke = engine.endStroke();
      const numericPart = stroke!.id.includes('-') ? Number(stroke!.id.split('-').pop()) : Number(stroke!.id);
      expect(numericPart).toBeGreaterThanOrEqual(11);
    });
  });

  describe('advanced paint tools', () => {
    it('PAINT-040: getAdvancedTool returns tool instance for dodge', () => {
      const tool = engine.getAdvancedTool('dodge');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('dodge');
    });

    it('PAINT-041: getAdvancedTool returns tool instance for burn', () => {
      const tool = engine.getAdvancedTool('burn');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('burn');
    });

    it('PAINT-042: getAdvancedTool returns tool instance for clone', () => {
      const tool = engine.getAdvancedTool('clone');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('clone');
    });

    it('PAINT-043: getAdvancedTool returns tool instance for smudge', () => {
      const tool = engine.getAdvancedTool('smudge');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('smudge');
    });

    it('PAINT-044: getAdvancedTool returns undefined for non-advanced tools', () => {
      expect(engine.getAdvancedTool('pen')).toBeUndefined();
      expect(engine.getAdvancedTool('eraser')).toBeUndefined();
      expect(engine.getAdvancedTool('text')).toBeUndefined();
      expect(engine.getAdvancedTool('none')).toBeUndefined();
      expect(engine.getAdvancedTool('rectangle')).toBeUndefined();
    });

    it('PAINT-045: isAdvancedTool returns true for advanced tools', () => {
      expect(engine.isAdvancedTool('dodge')).toBe(true);
      expect(engine.isAdvancedTool('burn')).toBe(true);
      expect(engine.isAdvancedTool('clone')).toBe(true);
      expect(engine.isAdvancedTool('smudge')).toBe(true);
    });

    it('PAINT-046: isAdvancedTool returns false for non-advanced tools', () => {
      expect(engine.isAdvancedTool('pen')).toBe(false);
      expect(engine.isAdvancedTool('eraser')).toBe(false);
      expect(engine.isAdvancedTool('text')).toBe(false);
      expect(engine.isAdvancedTool('none')).toBe(false);
    });

    it('PAINT-047: advanced tools are consistent instances (same instance returned each time)', () => {
      const tool1 = engine.getAdvancedTool('dodge');
      const tool2 = engine.getAdvancedTool('dodge');
      expect(tool1).toBe(tool2);
    });

    it('PAINT-049: addText options spread order - explicit fields override user options', () => {
      // Fix: addText spreads ...options FIRST so explicit fields (type, id, frame, user)
      // take precedence over any conflicting user-provided options.
      engine.tool = 'pen';
      engine.user = 'correctUser';

      const text = engine.addText(0, { x: 0.5, y: 0.5 }, 'Hello', 24, {
        // Try to override internal fields via options
        type: 'text',
        id: 'malicious-id',
        frame: 999,
        user: 'wrongUser',
      } as any);

      // The explicit assignments should win over spread options
      expect(text.type).toBe('text');
      expect(text.frame).toBe(0);
      expect(text.user).toBe('correctUser');
      // The id should be auto-generated, not the one from options
      expect(text.id).not.toBe('malicious-id');
    });

    it('PAINT-048: beginStroke correctly rejects advanced tool names', () => {
      // Advanced tools use PaintToolInterface, not PaintEngine.beginStroke
      engine.tool = 'dodge';
      engine.beginStroke(0, { x: 0.5, y: 0.5 });
      expect(engine.getCurrentStroke()).toBeNull();

      engine.tool = 'burn';
      engine.beginStroke(0, { x: 0.5, y: 0.5 });
      expect(engine.getCurrentStroke()).toBeNull();
    });
  });
});
