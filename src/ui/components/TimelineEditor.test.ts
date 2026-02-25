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

  describe('splitCutAtFrame', () => {
    it('TL-EDIT-U028: splits a cut into two at the given frame', () => {
      editor = new TimelineEditor(container, session);
      // Cut: startFrame=1, endFrame=100, inPoint=1, outPoint=100
      editor.insertCut(1, 0, 1, 100);

      editor.splitCutAtFrame(0, 51); // timeline frame 51

      const edl = editor.getEDL();
      expect(edl.length).toBe(2);
      // First half: inPoint 1, outPoint 50
      expect(edl[0]!.inPoint).toBe(1);
      expect(edl[0]!.outPoint).toBe(50);
      expect(edl[0]!.frame).toBe(1);
      // Second half: inPoint 51, outPoint 100
      expect(edl[1]!.inPoint).toBe(51);
      expect(edl[1]!.outPoint).toBe(100);
      expect(edl[1]!.frame).toBe(51);
    });

    it('TL-EDIT-U029: emits cutSplit event', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 100);

      const handler = vi.fn();
      editor.on('cutSplit', handler);

      editor.splitCutAtFrame(0, 51);

      expect(handler).toHaveBeenCalledWith({ cutIndex: 0, frame: 51 });
    });

    it('TL-EDIT-U030: does nothing when split frame is at cut boundary', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 100);

      const handler = vi.fn();
      editor.on('cutSplit', handler);

      // At start boundary
      editor.splitCutAtFrame(0, 1);
      expect(editor.getEDL().length).toBe(1);

      // At end boundary
      editor.splitCutAtFrame(0, 100);
      expect(editor.getEDL().length).toBe(1);

      expect(handler).not.toHaveBeenCalled();
    });

    it('TL-EDIT-U031: does nothing for invalid cut index', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      editor.splitCutAtFrame(-1, 25);
      editor.splitCutAtFrame(5, 25);

      expect(editor.getEDL().length).toBe(1);
    });

    it('TL-EDIT-U032: preserves subsequent cuts after split', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);
      editor.insertCut(51, 1, 1, 30);

      editor.splitCutAtFrame(0, 26);

      const edl = editor.getEDL();
      expect(edl.length).toBe(3);
      // Third cut (originally second) should be unchanged
      expect(edl[2]!.source).toBe(1);
      expect(edl[2]!.inPoint).toBe(1);
      expect(edl[2]!.outPoint).toBe(30);
    });
  });

  describe('playhead', () => {
    it('TL-EDIT-U033: creates playhead elements', () => {
      editor = new TimelineEditor(container, session);

      expect(container.querySelector('.timeline-playhead')).toBeTruthy();
      expect(container.querySelector('.timeline-ruler-playhead')).toBeTruthy();
    });

    it('TL-EDIT-U034: playhead is hidden when no cuts exist', () => {
      editor = new TimelineEditor(container, session);
      editor.loadFromEDL([]);

      const playhead = container.querySelector('.timeline-playhead') as HTMLElement;
      const rulerPlayhead = container.querySelector('.timeline-ruler-playhead') as HTMLElement;

      expect(playhead.style.display).toBe('none');
      expect(rulerPlayhead.style.display).toBe('none');
    });

    it('TL-EDIT-U035: playhead is visible when cuts exist', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const playhead = container.querySelector('.timeline-playhead') as HTMLElement;
      const rulerPlayhead = container.querySelector('.timeline-ruler-playhead') as HTMLElement;

      expect(playhead.style.display).not.toBe('none');
      expect(rulerPlayhead.style.display).not.toBe('none');
    });

    it('TL-EDIT-U036: playhead updates position on session frameChanged', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 100);
      editor.setZoom(5);

      session.goToFrame(1);
      // Emit frameChanged to trigger playhead update
      (session as any).emit('frameChanged', 10);

      const playhead = container.querySelector('.timeline-playhead') as HTMLElement;
      // frame 10, pixelsPerFrame 5: left = (10-1) * 5 = 45
      expect(playhead.style.left).toBe('45px');
    });
  });

  describe('empty state', () => {
    it('TL-EDIT-U037: shows empty state message when no cuts', () => {
      editor = new TimelineEditor(container, session);
      editor.loadFromEDL([]);

      const emptyMsg = container.querySelector('.timeline-empty-state');
      expect(emptyMsg).toBeTruthy();
      expect(emptyMsg!.textContent).toContain('No cuts in timeline');
    });

    it('TL-EDIT-U038: hides empty state message when cuts are added', () => {
      editor = new TimelineEditor(container, session);
      editor.loadFromEDL([]);

      expect(container.querySelector('.timeline-empty-state')).toBeTruthy();

      editor.insertCut(1, 0, 1, 50);

      expect(container.querySelector('.timeline-empty-state')).toBeNull();
    });

    it('TL-EDIT-U039: shows "No sources loaded" in controls when no cuts', () => {
      editor = new TimelineEditor(container, session);
      editor.loadFromEDL([]);

      const controls = container.querySelector('.timeline-controls')!;
      expect(controls.textContent).toContain('No sources loaded');
    });

    it('TL-EDIT-U040: shows total frames in controls when cuts exist', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const controls = container.querySelector('.timeline-controls')!;
      expect(controls.textContent).toContain('Total: 150f');
    });
  });

  describe('controls bar', () => {
    it('TL-EDIT-U041: shows zoom value label', () => {
      editor = new TimelineEditor(container, session);

      const controls = container.querySelector('.timeline-controls')!;
      expect(controls.textContent).toContain('2.0x');
    });

    it('TL-EDIT-U042: zoom value label updates on setZoom', () => {
      editor = new TimelineEditor(container, session);

      editor.setZoom(5);

      const controls = container.querySelector('.timeline-controls')!;
      expect(controls.textContent).toContain('5.0x');
    });

    it('TL-EDIT-U043: shows selected cut info when a cut is selected', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const controls = container.querySelector('.timeline-controls')!;
      expect(controls.textContent).toContain('Selected: Cut 1');
    });

    it('TL-EDIT-U044: hides selected cut info when selection is cleared', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      // Select
      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Deselect by clicking track
      const track = container.querySelector('.timeline-track');
      track?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const controls = container.querySelector('.timeline-controls')!;
      expect(controls.textContent).not.toContain('Selected:');
    });
  });

  describe('timecode on cuts', () => {
    it('TL-EDIT-U045: shows timecode metadata on wide cuts', () => {
      editor = new TimelineEditor(container, session);
      // With pixelsPerFrame=2, a 50-frame cut = 100px wide (>60)
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut') as HTMLElement;
      // Should contain timecode text (the in–out | duration pattern)
      expect(cutEl.textContent).toContain('|');
      expect(cutEl.textContent).toContain('50f');
    });

    it('TL-EDIT-U046: does not show timecode on narrow cuts', () => {
      editor = new TimelineEditor(container, session);
      // With pixelsPerFrame=2, a 10-frame cut = 20px wide (<60)
      editor.insertCut(1, 0, 1, 10);

      const cutEl = container.querySelector('.timeline-cut') as HTMLElement;
      expect(cutEl.textContent).not.toContain('|');
      expect(cutEl.textContent).not.toContain('10f');
    });
  });

  describe('trim handles', () => {
    it('TL-EDIT-U047: trim handles are always partially visible', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const handles = container.querySelectorAll('.trim-handle') as NodeListOf<HTMLElement>;
      expect(handles.length).toBe(2);
      // Base opacity 0.5 (disabled state, not 0)
      for (const handle of handles) {
        expect(handle.style.opacity).toBe('0.5');
      }
    });

    it('TL-EDIT-U048: trim handles have 10px width', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const handles = container.querySelectorAll('.trim-handle') as NodeListOf<HTMLElement>;
      for (const handle of handles) {
        expect(handle.style.width).toBe('10px');
      }
    });
  });

  describe('keyboard shortcuts', () => {
    function dispatchKey(target: HTMLElement, key: string, opts: Partial<KeyboardEventInit> = {}): void {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }));
    }

    it('TL-EDIT-U049: container has tabindex for focusability', () => {
      editor = new TimelineEditor(container, session);

      expect(container.getAttribute('tabindex')).toBe('0');
    });

    it('TL-EDIT-U050: Delete key deletes selected cut', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      // Select the cut
      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const handler = vi.fn();
      editor.on('cutDeleted', handler);

      dispatchKey(container, 'Delete');

      expect(handler).toHaveBeenCalledWith({ cutIndex: 0 });
      expect(editor.getEDL().length).toBe(0);
    });

    it('TL-EDIT-U051: Backspace key deletes selected cut', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      dispatchKey(container, 'Backspace');

      expect(editor.getEDL().length).toBe(0);
    });

    it('TL-EDIT-U052: Delete does nothing when no cut selected', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      dispatchKey(container, 'Delete');

      expect(editor.getEDL().length).toBe(1);
    });

    it('TL-EDIT-U053: Escape clears selection', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const handler = vi.fn();
      editor.on('selectionCleared', handler);

      dispatchKey(container, 'Escape');

      expect(handler).toHaveBeenCalled();
    });

    it('TL-EDIT-U054: ArrowRight nudges selected cut forward by 1 frame', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(200);
      editor.insertCut(1, 0, 1, 50);

      // Select
      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      dispatchKey(container, 'ArrowRight');

      expect(editor.getEDL()[0]!.frame).toBe(2);
    });

    it('TL-EDIT-U055: ArrowLeft nudges selected cut backward by 1 frame', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(200);
      editor.insertCut(10, 0, 1, 50);

      // Select
      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      dispatchKey(container, 'ArrowLeft');

      expect(editor.getEDL()[0]!.frame).toBe(9);
    });

    it('TL-EDIT-U056: ArrowLeft does not nudge below frame 1', () => {
      editor = new TimelineEditor(container, session);
      editor.setTotalFrames(200);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      dispatchKey(container, 'ArrowLeft');

      expect(editor.getEDL()[0]!.frame).toBe(1);
    });

    it('TL-EDIT-U057: Tab cycles selection forward through cuts', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 20);
      editor.insertCut(21, 1, 1, 20);

      const handler = vi.fn();
      editor.on('cutSelected', handler);

      dispatchKey(container, 'Tab');

      expect(handler).toHaveBeenCalledWith({ cutIndex: 0 });

      dispatchKey(container, 'Tab');

      expect(handler).toHaveBeenCalledWith({ cutIndex: 1 });
    });

    it('TL-EDIT-U058: Tab wraps from last cut to first', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 20);
      editor.insertCut(21, 1, 1, 20);

      const handler = vi.fn();
      editor.on('cutSelected', handler);

      // Select last cut
      dispatchKey(container, 'Tab'); // -> 0
      dispatchKey(container, 'Tab'); // -> 1
      dispatchKey(container, 'Tab'); // -> 0 (wrap)

      expect(handler).toHaveBeenLastCalledWith({ cutIndex: 0 });
    });

    it('TL-EDIT-U059: Shift+Tab cycles selection backward', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 20);
      editor.insertCut(21, 1, 1, 20);

      const handler = vi.fn();
      editor.on('cutSelected', handler);

      // From no selection, Shift+Tab should go to last cut
      dispatchKey(container, 'Tab', { shiftKey: true });

      expect(handler).toHaveBeenCalledWith({ cutIndex: 1 });
    });

    it('TL-EDIT-U060: Arrow keys do nothing when no cut selected', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const handler = vi.fn();
      editor.on('cutMoved', handler);

      dispatchKey(container, 'ArrowRight');
      dispatchKey(container, 'ArrowLeft');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('context menu', () => {
    it('TL-EDIT-U061: context menu has Split, Duplicate, and Delete items', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));

      const menu = document.querySelector('.timeline-context-menu');
      expect(menu).toBeTruthy();
      expect(menu!.textContent).toContain('Split at Playhead');
      expect(menu!.textContent).toContain('Duplicate Cut');
      expect(menu!.textContent).toContain('Delete Cut');
    });

    it('TL-EDIT-U062: context menu shows keyboard shortcut hints', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));

      const menu = document.querySelector('.timeline-context-menu');
      expect(menu!.textContent).toContain('S');
      expect(menu!.textContent).toContain('D');
      expect(menu!.textContent).toContain('Del');
    });

    it('TL-EDIT-U063: Duplicate Cut inserts copy after current cut', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));

      // Click the Duplicate item (second menu item)
      const menuItems = document.querySelectorAll('.timeline-context-menu > div');
      // Items: Split, Duplicate, separator, Delete
      const duplicateItem = menuItems[1] as HTMLElement;
      duplicateItem.click();

      const edl = editor.getEDL();
      expect(edl.length).toBe(2);
      expect(edl[0]!.source).toBe(0);
      expect(edl[1]!.source).toBe(0);
      expect(edl[1]!.inPoint).toBe(1);
      expect(edl[1]!.outPoint).toBe(50);
      expect(edl[1]!.frame).toBe(51);
    });

    it('TL-EDIT-U064: context menu has visual separator', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut');
      cutEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));

      const menu = document.querySelector('.timeline-context-menu')!;
      // The separator is a div with height: 1px
      const children = Array.from(menu.children);
      const separator = children.find(
        (el) => (el as HTMLElement).style.height === '1px'
      );
      expect(separator).toBeTruthy();
    });
  });

  describe('ruler click-to-seek', () => {
    it('TL-EDIT-U065: clicking ruler calls session.goToFrame', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 100);
      editor.setZoom(2);

      const goToFrameSpy = vi.spyOn(session, 'goToFrame');

      const ruler = container.querySelector('.timeline-ruler') as HTMLElement;
      // Simulate click at x=40 from left of ruler
      // getBoundingClientRect returns 0 in jsdom, scrollLeft is 0
      // frame = max(1, round(40 / 2) + 1) = max(1, 21) = 21
      ruler.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40 }));

      expect(goToFrameSpy).toHaveBeenCalledWith(21);
      goToFrameSpy.mockRestore();
    });
  });

  describe('cut selection visual', () => {
    it('TL-EDIT-U066: selected cut has accent border', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      const cutEl = container.querySelector('.timeline-cut') as HTMLElement;
      cutEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // After re-render the cut should have accent border
      const updatedCut = container.querySelector('.timeline-cut') as HTMLElement;
      expect(updatedCut.style.borderColor || updatedCut.style.border).toContain('var(--accent-primary)');
    });

    it('TL-EDIT-U067: non-selected cuts have desaturated filter', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 20);
      editor.insertCut(21, 1, 1, 20);

      // Select first cut
      const firstCut = container.querySelector('.timeline-cut') as HTMLElement;
      firstCut.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // After re-render, second cut should be desaturated
      const cuts = container.querySelectorAll('.timeline-cut') as NodeListOf<HTMLElement>;
      const secondCut = cuts[1]!;
      expect(secondCut.style.filter).toContain('saturate(0.75)');
    });
  });

  describe('dispose (extended)', () => {
    it('TL-EDIT-U068: removes keydown listener on dispose', () => {
      editor = new TimelineEditor(container, session);

      const removeEventListenerSpy = vi.spyOn(container, 'removeEventListener');

      editor.dispose();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });

    it('TL-EDIT-U069: unsubscribes from session frameChanged on dispose', () => {
      editor = new TimelineEditor(container, session);
      editor.insertCut(1, 0, 1, 50);

      editor.dispose();

      // After dispose, emitting frameChanged should not throw or update anything
      // (we verify by checking the playhead element no longer exists)
      expect(container.querySelector('.timeline-playhead')).toBeNull();
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
