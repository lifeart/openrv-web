import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarkerManager, MARKER_COLORS, type Marker, type MarkerManagerCallbacks } from './MarkerManager';

describe('MarkerManager', () => {
  let manager: MarkerManager;
  let callbacks: MarkerManagerCallbacks;
  let onMarksChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new MarkerManager();
    onMarksChanged = vi.fn();
    callbacks = { onMarksChanged };
    manager.setCallbacks(callbacks);
  });

  describe('initialization', () => {
    it('MKR-001: starts with empty marks', () => {
      expect(manager.marks.size).toBe(0);
      expect(manager.markedFrames).toEqual([]);
    });

    it('MKR-002: getMarker returns undefined for non-existent frame', () => {
      expect(manager.getMarker(1)).toBeUndefined();
    });

    it('MKR-003: hasMarker returns false for non-existent frame', () => {
      expect(manager.hasMarker(1)).toBe(false);
    });
  });

  describe('toggleMark', () => {
    it('MKR-004: adds a marker when frame has no marker', () => {
      manager.toggleMark(10);
      expect(manager.hasMarker(10)).toBe(true);
      expect(manager.getMarker(10)?.color).toBe(MARKER_COLORS[0]);
      expect(manager.getMarker(10)?.note).toBe('');
      expect(onMarksChanged).toHaveBeenCalledOnce();
    });

    it('MKR-005: removes a marker when frame already has one', () => {
      manager.toggleMark(10);
      manager.toggleMark(10);
      expect(manager.hasMarker(10)).toBe(false);
      expect(onMarksChanged).toHaveBeenCalledTimes(2);
    });

    it('MKR-006: toggle does not affect other markers', () => {
      manager.toggleMark(10);
      manager.toggleMark(20);
      manager.toggleMark(10); // remove 10
      expect(manager.hasMarker(20)).toBe(true);
      expect(manager.hasMarker(10)).toBe(false);
    });
  });

  describe('setMarker', () => {
    it('MKR-007: creates marker with note and color', () => {
      manager.setMarker(5, 'Test note', '#00ff00');
      const marker = manager.getMarker(5);
      expect(marker).toBeDefined();
      expect(marker!.note).toBe('Test note');
      expect(marker!.color).toBe('#00ff00');
      expect(marker!.frame).toBe(5);
    });

    it('MKR-008: creates marker with endFrame for duration markers', () => {
      manager.setMarker(5, '', '#ff0000', 15);
      const marker = manager.getMarker(5);
      expect(marker!.endFrame).toBe(15);
    });

    it('MKR-009: ignores endFrame if not greater than frame', () => {
      manager.setMarker(10, '', '#ff0000', 5);
      const marker = manager.getMarker(10);
      expect(marker!.endFrame).toBeUndefined();
    });

    it('MKR-010: overwrites existing marker at same frame', () => {
      manager.setMarker(5, 'Original', '#ff0000');
      manager.setMarker(5, 'Updated', '#00ff00');
      expect(manager.getMarker(5)?.note).toBe('Updated');
      expect(manager.getMarker(5)?.color).toBe('#00ff00');
    });

    it('MKR-011: uses default color when not specified', () => {
      manager.setMarker(5, 'Note');
      expect(manager.getMarker(5)?.color).toBe(MARKER_COLORS[0]);
    });
  });

  describe('setMarkerEndFrame', () => {
    it('MKR-012: sets end frame on existing marker', () => {
      manager.setMarker(10, 'test');
      manager.setMarkerEndFrame(10, 20);
      expect(manager.getMarker(10)?.endFrame).toBe(20);
    });

    it('MKR-013: removes end frame when undefined', () => {
      manager.setMarker(10, 'test', '#ff0000', 20);
      manager.setMarkerEndFrame(10, undefined);
      expect(manager.getMarker(10)?.endFrame).toBeUndefined();
    });

    it('MKR-014: does nothing for non-existent marker', () => {
      manager.setMarkerEndFrame(99, 105);
      expect(manager.hasMarker(99)).toBe(false);
      // Should not have been called (no marker existed)
      expect(onMarksChanged).not.toHaveBeenCalled();
    });
  });

  describe('setMarkerNote', () => {
    it('MKR-015: updates note on existing marker', () => {
      manager.setMarker(10, 'old');
      manager.setMarkerNote(10, 'new note');
      expect(manager.getMarker(10)?.note).toBe('new note');
    });

    it('MKR-016: does nothing for non-existent marker', () => {
      manager.setMarkerNote(99, 'note');
      expect(manager.hasMarker(99)).toBe(false);
    });
  });

  describe('setMarkerColor', () => {
    it('MKR-017: updates color on existing marker', () => {
      manager.setMarker(10, '', '#ff0000');
      manager.setMarkerColor(10, '#00ff00');
      expect(manager.getMarker(10)?.color).toBe('#00ff00');
    });

    it('MKR-018: does nothing for non-existent marker', () => {
      manager.setMarkerColor(99, '#00ff00');
      expect(manager.hasMarker(99)).toBe(false);
    });
  });

  describe('removeMark', () => {
    it('MKR-019: removes an existing marker', () => {
      manager.setMarker(10, 'test');
      manager.removeMark(10);
      expect(manager.hasMarker(10)).toBe(false);
    });

    it('MKR-020: does not emit if marker does not exist', () => {
      onMarksChanged.mockClear();
      manager.removeMark(99);
      expect(onMarksChanged).not.toHaveBeenCalled();
    });
  });

  describe('clearMarks', () => {
    it('MKR-021: removes all markers', () => {
      manager.setMarker(1, 'a');
      manager.setMarker(2, 'b');
      manager.setMarker(3, 'c');
      manager.clearMarks();
      expect(manager.marks.size).toBe(0);
      expect(manager.markedFrames).toEqual([]);
    });
  });

  describe('getMarkerAtFrame', () => {
    it('MKR-022: returns exact marker', () => {
      manager.setMarker(10, 'test');
      expect(manager.getMarkerAtFrame(10)?.note).toBe('test');
    });

    it('MKR-023: returns duration marker for frame within range', () => {
      manager.setMarker(10, 'range', '#ff0000', 20);
      expect(manager.getMarkerAtFrame(15)?.note).toBe('range');
    });

    it('MKR-024: returns undefined for frame outside all ranges', () => {
      manager.setMarker(10, 'range', '#ff0000', 20);
      expect(manager.getMarkerAtFrame(21)).toBeUndefined();
    });
  });

  describe('navigation', () => {
    it('MKR-025: findNextMarkerFrame returns next marker after current', () => {
      manager.setMarker(5, '');
      manager.setMarker(10, '');
      manager.setMarker(20, '');
      expect(manager.findNextMarkerFrame(7)).toBe(10);
    });

    it('MKR-026: findNextMarkerFrame wraps around', () => {
      manager.setMarker(5, '');
      manager.setMarker(10, '');
      expect(manager.findNextMarkerFrame(10)).toBe(5);
    });

    it('MKR-027: findNextMarkerFrame returns null when no markers', () => {
      expect(manager.findNextMarkerFrame(5)).toBeNull();
    });

    it('MKR-028: findPreviousMarkerFrame returns previous marker', () => {
      manager.setMarker(5, '');
      manager.setMarker(10, '');
      manager.setMarker(20, '');
      expect(manager.findPreviousMarkerFrame(15)).toBe(10);
    });

    it('MKR-029: findPreviousMarkerFrame wraps around', () => {
      manager.setMarker(5, '');
      manager.setMarker(20, '');
      expect(manager.findPreviousMarkerFrame(5)).toBe(20);
    });

    it('MKR-030: findPreviousMarkerFrame returns null when no markers', () => {
      expect(manager.findPreviousMarkerFrame(5)).toBeNull();
    });
  });

  describe('bulk operations', () => {
    it('MKR-031: setFromFrameNumbers creates markers from number array', () => {
      manager.setFromFrameNumbers([1, 5, 10]);
      expect(manager.marks.size).toBe(3);
      expect(manager.hasMarker(1)).toBe(true);
      expect(manager.hasMarker(5)).toBe(true);
      expect(manager.hasMarker(10)).toBe(true);
      expect(manager.getMarker(1)?.color).toBe(MARKER_COLORS[0]);
    });

    it('MKR-032: setFromArray supports mixed number and Marker format', () => {
      const markerObj: Marker = { frame: 10, note: 'hello', color: '#00ff00' };
      manager.setFromArray([5, markerObj]);
      expect(manager.marks.size).toBe(2);
      expect(manager.getMarker(5)?.note).toBe('');
      expect(manager.getMarker(10)?.note).toBe('hello');
      expect(manager.getMarker(10)?.color).toBe('#00ff00');
    });

    it('MKR-033: replaceAll replaces entire map', () => {
      manager.setMarker(1, 'old');
      const newMap = new Map<number, Marker>();
      newMap.set(50, { frame: 50, note: 'new', color: '#0000ff' });
      manager.replaceAll(newMap);
      expect(manager.marks.size).toBe(1);
      expect(manager.hasMarker(1)).toBe(false);
      expect(manager.getMarker(50)?.note).toBe('new');
    });

    it('MKR-034: toArray returns all markers', () => {
      manager.setMarker(1, 'a');
      manager.setMarker(2, 'b');
      const arr = manager.toArray();
      expect(arr.length).toBe(2);
      expect(arr.map(m => m.frame).sort()).toEqual([1, 2]);
    });
  });

  describe('callbacks', () => {
    it('MKR-035: notifies on every mutation', () => {
      manager.setMarker(1, '');
      manager.setMarkerNote(1, 'updated');
      manager.setMarkerColor(1, '#0000ff');
      manager.removeMark(1);
      expect(onMarksChanged).toHaveBeenCalledTimes(4);
    });

    it('MKR-036: works without callbacks set', () => {
      const mgr = new MarkerManager();
      // Should not throw
      mgr.setMarker(1, '');
      mgr.toggleMark(1);
      mgr.clearMarks();
      expect(mgr.marks.size).toBe(0);
    });
  });

  describe('mutation safety', () => {
    it('MKR-037: getMarker returns a copy, not internal reference', () => {
      manager.setMarker(10, 'original');
      const marker = manager.getMarker(10)!;
      marker.note = 'mutated';
      expect(manager.getMarker(10)!.note).toBe('original');
    });

    it('MKR-038: getMarkerAtFrame returns a copy for exact match', () => {
      manager.setMarker(5, 'exact');
      const marker = manager.getMarkerAtFrame(5)!;
      marker.color = '#000000';
      expect(manager.getMarkerAtFrame(5)!.color).not.toBe('#000000');
    });

    it('MKR-039: getMarkerAtFrame returns a copy for range match', () => {
      manager.setMarker(1, 'range', MARKER_COLORS[0], 10);
      const marker = manager.getMarkerAtFrame(5)!;
      marker.note = 'mutated';
      expect(manager.getMarkerAtFrame(5)!.note).toBe('range');
    });

    it('MKR-040: replaceAll copies the map, caller mutation has no effect', () => {
      const externalMap = new Map<number, Marker>();
      externalMap.set(1, { frame: 1, note: 'test', color: MARKER_COLORS[0] });
      manager.replaceAll(externalMap);
      externalMap.set(2, { frame: 2, note: 'sneaky', color: MARKER_COLORS[1] });
      expect(manager.marks.size).toBe(1);
      expect(manager.hasMarker(2)).toBe(false);
    });

    it('MKR-041: setFromArray copies Marker objects', () => {
      const marker: Marker = { frame: 1, note: 'original', color: MARKER_COLORS[0] };
      manager.setFromArray([marker]);
      marker.note = 'mutated';
      expect(manager.getMarker(1)!.note).toBe('original');
    });

    it('MKR-042: toArray returns copies, not internal references', () => {
      manager.setMarker(1, 'original');
      const arr = manager.toArray();
      arr[0]!.note = 'mutated';
      expect(manager.getMarker(1)!.note).toBe('original');
    });
  });

  describe('dispose', () => {
    it('MKR-043: dispose nulls callbacks', () => {
      manager.dispose();
      // Should not throw when mutating after dispose
      manager.setMarker(1, 'after dispose');
      expect(onMarksChanged).not.toHaveBeenCalled();
    });
  });
});
