import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionAnnotations } from './SessionAnnotations';
import { MARKER_COLORS } from './MarkerManager';

describe('SessionAnnotations', () => {
  let annotations: SessionAnnotations;

  beforeEach(() => {
    annotations = new SessionAnnotations();
  });

  describe('construction', () => {
    it('SA-001: can be constructed standalone without Session', () => {
      expect(annotations).toBeInstanceOf(SessionAnnotations);
    });

    it('SA-002: starts with empty marks', () => {
      expect(annotations.marks.size).toBe(0);
      expect(annotations.markedFrames).toEqual([]);
    });

    it('SA-003: matteSettings starts as null', () => {
      expect(annotations.matteSettings).toBeNull();
    });

    it('SA-004: sessionPaintEffects starts as null', () => {
      expect(annotations.sessionPaintEffects).toBeNull();
    });
  });

  describe('sub-manager access', () => {
    it('SA-005: exposes markerManager', () => {
      expect(annotations.markerManager).toBeDefined();
      expect(annotations.markerManager.marks).toBeDefined();
    });

    it('SA-006: exposes noteManager', () => {
      expect(annotations.noteManager).toBeDefined();
      expect(typeof annotations.noteManager.addNote).toBe('function');
    });

    it('SA-007: exposes versionManager', () => {
      expect(annotations.versionManager).toBeDefined();
      expect(typeof annotations.versionManager.createGroup).toBe('function');
    });

    it('SA-008: exposes statusManager', () => {
      expect(annotations.statusManager).toBeDefined();
      expect(typeof annotations.statusManager.setStatus).toBe('function');
    });

    it('SA-009: exposes annotationStore', () => {
      expect(annotations.annotationStore).toBeDefined();
      expect(typeof annotations.annotationStore.setPaintEffects).toBe('function');
    });
  });

  describe('marker convenience delegations', () => {
    it('SA-010: toggleMark adds and removes markers', () => {
      annotations.toggleMark(5);
      expect(annotations.hasMarker(5)).toBe(true);
      expect(annotations.marks.size).toBe(1);

      annotations.toggleMark(5);
      expect(annotations.hasMarker(5)).toBe(false);
      expect(annotations.marks.size).toBe(0);
    });

    it('SA-011: setMarker creates a marker with note and color', () => {
      annotations.setMarker(10, 'test note', '#00ff00');
      const marker = annotations.getMarker(10);
      expect(marker).toBeDefined();
      expect(marker!.note).toBe('test note');
      expect(marker!.color).toBe('#00ff00');
    });

    it('SA-012: setMarker uses defaults for optional parameters', () => {
      annotations.setMarker(10);
      const marker = annotations.getMarker(10);
      expect(marker).toBeDefined();
      expect(marker!.note).toBe('');
      expect(marker!.color).toBe(MARKER_COLORS[0]);
    });

    it('SA-013: setMarkerEndFrame sets end frame for duration markers', () => {
      annotations.setMarker(10, 'range');
      annotations.setMarkerEndFrame(10, 20);
      const marker = annotations.getMarker(10);
      expect(marker!.endFrame).toBe(20);
    });

    it('SA-014: getMarkerAtFrame returns marker within range', () => {
      annotations.setMarker(10, 'range', MARKER_COLORS[0], 20);
      expect(annotations.getMarkerAtFrame(15)).toBeDefined();
      expect(annotations.getMarkerAtFrame(15)!.frame).toBe(10);
    });

    it('SA-015: setMarkerNote updates note on existing marker', () => {
      annotations.setMarker(10);
      annotations.setMarkerNote(10, 'updated');
      expect(annotations.getMarker(10)!.note).toBe('updated');
    });

    it('SA-016: setMarkerColor updates color on existing marker', () => {
      annotations.setMarker(10);
      annotations.setMarkerColor(10, '#0000ff');
      expect(annotations.getMarker(10)!.color).toBe('#0000ff');
    });

    it('SA-017: removeMark removes a specific marker', () => {
      annotations.setMarker(10);
      annotations.setMarker(20);
      annotations.removeMark(10);
      expect(annotations.hasMarker(10)).toBe(false);
      expect(annotations.hasMarker(20)).toBe(true);
    });

    it('SA-018: clearMarks removes all markers', () => {
      annotations.setMarker(10);
      annotations.setMarker(20);
      annotations.clearMarks();
      expect(annotations.marks.size).toBe(0);
    });

    it('SA-019: markedFrames returns all marked frame numbers', () => {
      annotations.setMarker(10);
      annotations.setMarker(20);
      annotations.setMarker(30);
      const frames = annotations.markedFrames.sort((a, b) => a - b);
      expect(frames).toEqual([10, 20, 30]);
    });
  });

  describe('event wiring', () => {
    it('SA-020: toggleMark emits marksChanged', () => {
      const handler = vi.fn();
      annotations.on('marksChanged', handler);
      annotations.toggleMark(5);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(annotations.marks);
    });

    it('SA-021: setMarker emits marksChanged', () => {
      const handler = vi.fn();
      annotations.on('marksChanged', handler);
      annotations.setMarker(10, 'note', '#ff0000');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('SA-022: noteManager changes emit notesChanged', () => {
      const handler = vi.fn();
      annotations.on('notesChanged', handler);
      annotations.noteManager.addNote(0, 1, 10, 'test', 'author');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('SA-023: versionManager changes emit versionsChanged', () => {
      const handler = vi.fn();
      annotations.on('versionsChanged', handler);
      annotations.versionManager.createGroup('shot', [0, 1]);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('SA-024: statusManager changes emit statusChanged and statusesChanged', () => {
      const statusChangedHandler = vi.fn();
      const statusesChangedHandler = vi.fn();
      annotations.on('statusChanged', statusChangedHandler);
      annotations.on('statusesChanged', statusesChangedHandler);
      annotations.statusManager.setStatus(0, 'approved', 'reviewer');
      expect(statusChangedHandler).toHaveBeenCalledOnce();
      expect(statusChangedHandler).toHaveBeenCalledWith({
        sourceIndex: 0,
        status: 'approved',
        previous: 'pending',
      });
      expect(statusesChangedHandler).toHaveBeenCalledOnce();
    });

    it('SA-025: annotationStore setPaintEffects emits paintEffectsLoaded', () => {
      const handler = vi.fn();
      annotations.on('paintEffectsLoaded', handler);
      const effects = { ghost: true, ghostBefore: 3 };
      annotations.annotationStore.setPaintEffects(effects);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(effects);
    });

    it('SA-026: annotationStore setMatteSettings emits matteChanged', () => {
      const handler = vi.fn();
      annotations.on('matteChanged', handler);
      annotations.annotationStore.setMatteSettings({ show: true, aspect: 2.35 });
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].show).toBe(true);
      expect(handler.mock.calls[0][0].aspect).toBe(2.35);
    });

    it('SA-027: clearMarks emits marksChanged', () => {
      annotations.setMarker(10);
      const handler = vi.fn();
      annotations.on('marksChanged', handler);
      annotations.clearMarks();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('SA-028: removeMark emits marksChanged', () => {
      annotations.setMarker(10);
      const handler = vi.fn();
      annotations.on('marksChanged', handler);
      annotations.removeMark(10);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('matte and paint accessors', () => {
    it('SA-029: matteSettings reflects annotationStore state', () => {
      annotations.annotationStore.setMatteSettings({
        show: true,
        aspect: 1.85,
        opacity: 0.5,
      });
      const matte = annotations.matteSettings;
      expect(matte).not.toBeNull();
      expect(matte!.show).toBe(true);
      expect(matte!.aspect).toBe(1.85);
      expect(matte!.opacity).toBe(0.5);
    });

    it('SA-030: sessionPaintEffects reflects annotationStore state', () => {
      annotations.annotationStore.setPaintEffects({ ghost: true, hold: false });
      const effects = annotations.sessionPaintEffects;
      expect(effects).not.toBeNull();
      expect(effects!.ghost).toBe(true);
      expect(effects!.hold).toBe(false);
    });
  });

  describe('dispose', () => {
    it('SA-031: dispose does not throw', () => {
      expect(() => annotations.dispose()).not.toThrow();
    });

    it('SA-032: dispose can be called multiple times safely', () => {
      annotations.dispose();
      expect(() => annotations.dispose()).not.toThrow();
    });

    it('SA-033: noteManager stops emitting after dispose', () => {
      const handler = vi.fn();
      annotations.on('notesChanged', handler);
      annotations.dispose();
      // After dispose, noteManager callbacks are cleared, so no emission
      annotations.noteManager.addNote(0, 1, 10, 'test', 'author');
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
