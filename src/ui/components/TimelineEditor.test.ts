/**
 * TimelineEditor Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TimelineEditor } from './TimelineEditor';
import { Session } from '../../core/session/Session';
import { SequenceGroupNode } from '../../nodes/groups/SequenceGroupNode';

describe('TimelineEditor', () => {
  let container: HTMLElement;
  let session: Session;
  let editor: TimelineEditor;

  beforeEach(() => {
    // Create mock container
    container = document.createElement('div');
    document.body.appendChild(container);

    // Create session
    session = new Session();
  });

  afterEach(() => {
    editor?.dispose();
    container.remove();
  });

  describe('initialization', () => {
    it('TL-EDIT-U001: creates UI structure', () => {
      editor = new TimelineEditor(container, session);

      expect(container.querySelector('.timeline-controls')).toBeTruthy();
      expect(container.querySelector('.timeline-ruler')).toBeTruthy();
      expect(container.querySelector('.timeline-track')).toBeTruthy();
      expect(container.querySelector('.timeline-cuts')).toBeTruthy();
    });

    it('TL-EDIT-U002: creates zoom controls', () => {
      editor = new TimelineEditor(container, session);

      const zoomSlider = container.querySelector('input[type="range"]');
      expect(zoomSlider).toBeTruthy();
    });
  });

  describe('loadFromSequenceNode', () => {
    it('TL-EDIT-U003: loads EDL data from sequence node', () => {
      const sequenceNode = new SequenceGroupNode('TestSequence');
      sequenceNode.setEDL([
        { frame: 1, source: 0, inPoint: 1, outPoint: 50 },
        { frame: 51, source: 1, inPoint: 1, outPoint: 30 },
      ]);

      editor = new TimelineEditor(container, session, sequenceNode);

      const edl = editor.getEDL();
      expect(edl.length).toBe(2);
      expect(edl[0]!.frame).toBe(1);
      expect(edl[0]!.source).toBe(0);
      expect(edl[1]!.frame).toBe(51);
      expect(edl[1]!.source).toBe(1);
    });

    it('TL-EDIT-U004: handles empty EDL', () => {
      const sequenceNode = new SequenceGroupNode('EmptySequence');

      editor = new TimelineEditor(container, session, sequenceNode);

      const edl = editor.getEDL();
      expect(edl.length).toBe(0);
    });
  });

  describe('loadFromEDL', () => {
    it('TL-EDIT-U004b: loads custom labels and preserves frame positions', () => {
      editor = new TimelineEditor(container, session);

      editor.loadFromEDL(
        [
          { frame: 1, source: 0, inPoint: 1, outPoint: 24 },
          { frame: 25, source: 2, inPoint: 10, outPoint: 40 },
        ],
        ['Plate A', 'Plate B'],
      );

      const cuts = container.querySelectorAll('.timeline-cut');
      expect(cuts.length).toBe(2);
      expect(cuts[0]?.textContent).toContain('Plate A');
      expect(cuts[1]?.textContent).toContain('Plate B');

      const edl = editor.getEDL();
      expect(edl[0]?.frame).toBe(1);
      expect(edl[1]?.frame).toBe(25);
    });

    it('TL-EDIT-U004c: clears stale selection when loading fewer cuts', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 20);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const handler = vi.fn();
      editor.on('selectionCleared', handler);

      editor.loadFromEDL([]);

      expect(handler).toHaveBeenCalled();
      expect(editor.getEDL()).toHaveLength(0);
    });
  });

  describe('insertCut', () => {
    it('TL-EDIT-U005: inserts cut at specified position', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(100);

      editor.insertCut(1, 0, 1, 50);

      const edl = editor.getEDL();
      expect(edl.length).toBe(1);
      expect(edl[0]!.frame).toBe(1);
      expect(edl[0]!.source).toBe(0);
      expect(edl[0]!.inPoint).toBe(1);
      expect(edl[0]!.outPoint).toBe(50);
    });

    it('TL-EDIT-U006: emits cutInserted event', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(100);

      const handler = vi.fn();
      editor.on('cutInserted', handler);

      editor.insertCut(1, 0, 1, 25);

      expect(handler).toHaveBeenCalledWith({
        position: 1,
        sourceIndex: 0,
        inPoint: 1,
        outPoint: 25,
      });
    });

    it('TL-EDIT-U007: shifts subsequent cuts when inserting', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(100);

      editor.insertCut(1, 0, 1, 20);  // 20 frames
      editor.insertCut(21, 1, 1, 30); // 30 frames

      // Insert at beginning - should shift both existing cuts
      editor.insertCut(1, 2, 1, 10); // 10 frames

      const edl = editor.getEDL();
      expect(edl.length).toBe(3);
      expect(edl[0]!.frame).toBe(1);   // New cut at frame 1
      expect(edl[1]!.frame).toBe(11);  // Original first cut shifted by 10
      expect(edl[2]!.frame).toBe(31);  // Original second cut shifted by 10
    });
  });

  describe('deleteCut', () => {
    it('TL-EDIT-U008: deletes cut at specified index', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 25);
      editor.insertCut(26, 1, 1, 25);

      expect(editor.getEDL().length).toBe(2);

      editor.deleteCut(0);

      const edl = editor.getEDL();
      expect(edl.length).toBe(1);
      expect(edl[0]!.source).toBe(1); // Second cut now first
    });

    it('TL-EDIT-U009: emits cutDeleted event', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 25);

      const handler = vi.fn();
      editor.on('cutDeleted', handler);

      editor.deleteCut(0);

      expect(handler).toHaveBeenCalledWith({ cutIndex: 0 });
    });

    it('TL-EDIT-U010: shifts subsequent cuts after deletion', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 20);   // 20 frames
      editor.insertCut(21, 1, 1, 30);  // 30 frames at frame 21

      editor.deleteCut(0); // Delete first cut

      const edl = editor.getEDL();
      expect(edl.length).toBe(1);
      expect(edl[0]!.frame).toBe(1); // Second cut shifted to frame 1
    });

    it('TL-EDIT-U011: handles invalid index', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 25);

      editor.deleteCut(-1);
      editor.deleteCut(999);

      expect(editor.getEDL().length).toBe(1); // No change
    });
  });

  describe('trimCut', () => {
    it('TL-EDIT-U012: updates in/out points', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      editor.trimCut(0, 10, 40);

      const edl = editor.getEDL();
      expect(edl[0]!.inPoint).toBe(10);
      expect(edl[0]!.outPoint).toBe(40);
    });

    it('TL-EDIT-U013: emits cutTrimmed event', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const handler = vi.fn();
      editor.on('cutTrimmed', handler);

      editor.trimCut(0, 5, 45);

      expect(handler).toHaveBeenCalledWith({
        cutIndex: 0,
        inPoint: 5,
        outPoint: 45,
      });
    });

    it('TL-EDIT-U014: adjusts subsequent cuts when duration changes', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);   // 50 frames
      editor.insertCut(51, 1, 1, 30);  // 30 frames at frame 51

      editor.trimCut(0, 1, 30); // Shrink to 30 frames

      const edl = editor.getEDL();
      expect(edl[1]!.frame).toBe(31); // Second cut shifted to frame 31
    });
  });

  describe('moveCut', () => {
    it('TL-EDIT-U015: moves cut to new position', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(200);
      editor.insertCut(1, 0, 1, 50);

      editor.moveCut(0, 51);

      const edl = editor.getEDL();
      expect(edl[0]!.frame).toBe(51);
    });

    it('TL-EDIT-U016: emits cutMoved event', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(200);
      editor.insertCut(1, 0, 1, 50);

      const handler = vi.fn();
      editor.on('cutMoved', handler);

      editor.moveCut(0, 100);

      expect(handler).toHaveBeenCalledWith({
        cutIndex: 0,
        newPosition: 100,
      });
    });

    it('TL-EDIT-U017: clamps position to valid range', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(100);
      editor.insertCut(1, 0, 1, 50); // 50 frame cut - totalFrames becomes 150

      editor.moveCut(0, -10);
      expect(editor.getEDL()[0]!.frame).toBe(1); // Clamped to 1

      editor.moveCut(0, 1000);
      // Should clamp to max valid position where cut still fits within totalFrames
      // totalFrames = 100 (initial) + 50 (from insertCut) = 150
      // With a 50-frame cut and 150 total frames, max start position is 101 (so end is 150)
      const edl = editor.getEDL();
      const cutDuration = edl[0]!.outPoint - edl[0]!.inPoint + 1;
      expect(cutDuration).toBe(50);
      // Max position ensures cut doesn't exceed totalFrames
      expect(edl[0]!.frame).toBeGreaterThan(0);
      expect(edl[0]!.frame + cutDuration - 1).toBeLessThanOrEqual(150);
    });
  });

  describe('selection', () => {
    it('TL-EDIT-U018: emits cutSelected event', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const handler = vi.fn();
      editor.on('cutSelected', handler);

      // Simulate click on cut element
      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(handler).toHaveBeenCalledWith({ cutIndex: 0 });
    });

    it('TL-EDIT-U019: emits selectionCleared when clicking empty space', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const handler = vi.fn();
      editor.on('selectionCleared', handler);

      // Click on track background
      const track = container.querySelector('.timeline-track');
      track?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('zoom', () => {
    it('TL-EDIT-U020: setZoom updates pixel density', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(100);

      editor.setZoom(5);

      const cuts = container.querySelector('.timeline-cuts') as HTMLElement | null;
      const computedWidth = parseInt(cuts?.style.width || '0');
      expect(computedWidth).toBe(500); // 100 frames * 5 px/frame
    });

    it('TL-EDIT-U021: clamps zoom to valid range', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(100);

      editor.setZoom(0.1); // Below minimum
      let cuts = container.querySelector('.timeline-cuts') as HTMLElement | null;
      expect(parseInt(cuts?.style.width || '0')).toBeGreaterThanOrEqual(50); // Min 0.5 px/frame

      editor.setZoom(100); // Above maximum
      cuts = container.querySelector('.timeline-cuts') as HTMLElement | null;
      expect(parseInt(cuts?.style.width || '0')).toBeLessThanOrEqual(1000); // Max 10 px/frame
    });
  });

  describe('render', () => {
    it('TL-EDIT-U022: renders cut elements', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 25);
      editor.insertCut(26, 1, 1, 25);

      const cutElements = container.querySelectorAll('.timeline-cut');
      expect(cutElements.length).toBe(2);
    });

    it('TL-EDIT-U023: renders ruler markers', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(100);
      editor.render();

      const ruler = container.querySelector('.timeline-ruler');
      expect(ruler?.children.length).toBeGreaterThan(0);
    });
  });

  describe('dispose', () => {
    it('TL-EDIT-U024: clears container', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      editor.dispose();

      expect(container.innerHTML).toBe('');
    });

    it('TL-EDIT-U025: removes document event listeners', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      editor = new TimelineEditor(container, session);
      editor.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('TL-EDIT-U026: removes zoom slider event listener on dispose', () => {
      editor = new TimelineEditor(container, session);

      const zoomSlider = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(zoomSlider).not.toBeNull();

      const removeEventListenerSpy = vi.spyOn(zoomSlider, 'removeEventListener');

      editor.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('input', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });

    it('TL-EDIT-U027: removes open context menu on dispose', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      // Simulate context menu open
      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));

      // Verify context menu exists
      expect(document.querySelector('.timeline-context-menu')).not.toBeNull();

      // Dispose should remove it
      editor.dispose();

      expect(document.querySelector('.timeline-context-menu')).toBeNull();
    });
  });
});
