/**
 * MarkerListPanel Component Tests
 *
 * Tests for the marker list panel with note editing and navigation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MarkerListPanel } from './MarkerListPanel';
import { Session, MARKER_COLORS } from '../../core/session/Session';

describe('MarkerListPanel', () => {
  let panel: MarkerListPanel;
  let session: Session;

  beforeEach(() => {
    session = new Session();
    // Add a test source to enable the session
    (session as any).addSource({
      name: 'test.mp4',
      url: 'blob:test',
      type: 'video',
      duration: 100,
      fps: 24,
      width: 1920,
      height: 1080,
      element: document.createElement('video'),
    });
    (session as any)._inPoint = 1;
    (session as any)._outPoint = 100;
    panel = new MarkerListPanel(session);
  });

  afterEach(() => {
    panel.dispose();
  });

  describe('initialization', () => {
    it('MARK-U001: creates MarkerListPanel instance', () => {
      expect(panel).toBeInstanceOf(MarkerListPanel);
    });

    it('MARK-U002: panel is hidden by default', () => {
      expect(panel.isVisible()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('MARK-U003: panel has correct test ID', () => {
      expect(panel.getElement().dataset.testid).toBe('marker-list-panel');
    });
  });

  describe('visibility', () => {
    it('MARK-U010: show() makes panel visible', () => {
      panel.show();
      expect(panel.isVisible()).toBe(true);
      expect(panel.getElement().style.display).toBe('flex');
    });

    it('MARK-U011: hide() hides panel', () => {
      panel.show();
      panel.hide();
      expect(panel.isVisible()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('MARK-U012: toggle() toggles visibility', () => {
      expect(panel.isVisible()).toBe(false);
      panel.toggle();
      expect(panel.isVisible()).toBe(true);
      panel.toggle();
      expect(panel.isVisible()).toBe(false);
    });

    it('MARK-U013: emits visibilityChanged when showing', () => {
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);
      panel.show();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('MARK-U014: emits visibilityChanged when hiding', () => {
      panel.show();
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);
      panel.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('marker list rendering', () => {
    it('MARK-U020: shows empty message when no markers', () => {
      panel.show();
      const entries = panel.getElement().querySelector('[data-testid="marker-entries"]');
      expect(entries?.textContent).toContain('No markers yet');
    });

    it('MARK-U021: displays markers when added', () => {
      session.setMarker(10, 'Test note', MARKER_COLORS[0]);
      panel.show();
      const entry = panel.getElement().querySelector('[data-testid="marker-entry-10"]');
      expect(entry).not.toBeNull();
    });

    it('MARK-U022: displays multiple markers sorted by frame', () => {
      session.setMarker(50, 'Middle', MARKER_COLORS[0]);
      session.setMarker(10, 'First', MARKER_COLORS[1]);
      session.setMarker(90, 'Last', MARKER_COLORS[2]);
      panel.show();

      const entries = panel.getElement().querySelectorAll('[data-testid^="marker-entry-"]');
      expect(entries.length).toBe(3);
      expect(entries[0]?.getAttribute('data-frame')).toBe('10');
      expect(entries[1]?.getAttribute('data-frame')).toBe('50');
      expect(entries[2]?.getAttribute('data-frame')).toBe('90');
    });

    it('MARK-U023: updates when markers change', () => {
      panel.show();
      expect(panel.getElement().querySelector('[data-testid="marker-entry-25"]')).toBeNull();

      session.setMarker(25, 'New marker', MARKER_COLORS[0]);

      expect(panel.getElement().querySelector('[data-testid="marker-entry-25"]')).not.toBeNull();
    });

    it('MARK-U024: shows marker note in entry', () => {
      session.setMarker(10, 'This is a test note', MARKER_COLORS[0]);
      panel.show();
      const note = panel.getElement().querySelector('[data-testid="marker-note-10"]');
      expect(note?.textContent).toBe('This is a test note');
    });

    it('MARK-U025: shows marker color indicator', () => {
      session.setMarker(10, '', '#00ff00');
      panel.show();
      const colorBtn = panel.getElement().querySelector('[data-testid="marker-color-10"]') as HTMLElement;
      expect(colorBtn?.style.background).toBe('rgb(0, 255, 0)');
    });
  });

  describe('marker navigation', () => {
    it('MARK-U030: clicking frame info navigates to marker', () => {
      session.setMarker(50, 'Test', MARKER_COLORS[0]);
      panel.show();
      session.currentFrame = 1;

      const entry = panel.getElement().querySelector('[data-testid="marker-entry-50"]');
      const frameInfo = entry?.querySelector('span');
      frameInfo?.click();

      expect(session.currentFrame).toBe(50);
    });

    it('MARK-U031: emits markerSelected when navigating', () => {
      session.setMarker(50, 'Test', MARKER_COLORS[0]);
      panel.show();
      const callback = vi.fn();
      panel.on('markerSelected', callback);

      const entry = panel.getElement().querySelector('[data-testid="marker-entry-50"]');
      const frameInfo = entry?.querySelector('span');
      frameInfo?.click();

      expect(callback).toHaveBeenCalledWith(50);
    });

    it('MARK-U032: current frame marker is highlighted', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      session.setMarker(50, '', MARKER_COLORS[0]);
      session.currentFrame = 50;
      panel.show();

      const entry50 = panel.getElement().querySelector('[data-testid="marker-entry-50"]') as HTMLElement;
      expect(entry50?.style.cssText).toContain('rgba(var(--accent-primary-rgb)');
    });
  });

  describe('marker editing', () => {
    it('MARK-U040: clicking edit button shows textarea', () => {
      session.setMarker(10, 'Original note', MARKER_COLORS[0]);
      panel.show();

      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      const textarea = panel.getElement().querySelector('[data-testid="marker-note-input-10"]');
      expect(textarea).not.toBeNull();
    });

    it('MARK-U041: textarea contains current note', () => {
      session.setMarker(10, 'Original note', MARKER_COLORS[0]);
      panel.show();

      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      const textarea = panel.getElement().querySelector('[data-testid="marker-note-input-10"]') as HTMLTextAreaElement;
      expect(textarea?.value).toBe('Original note');
    });

    it('MARK-U042: clicking save updates marker note', () => {
      session.setMarker(10, 'Original', MARKER_COLORS[0]);
      panel.show();

      // Start editing
      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      // Change note
      const textarea = panel.getElement().querySelector('[data-testid="marker-note-input-10"]') as HTMLTextAreaElement;
      textarea.value = 'Updated note';

      // Save
      const saveBtn = panel.getElement().querySelector('[data-testid="marker-save-10"]') as HTMLElement;
      saveBtn.click();

      expect(session.getMarker(10)?.note).toBe('Updated note');
    });

    it('MARK-U043: state tracks editing frame', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      panel.show();

      expect(panel.getState().editingFrame).toBeNull();

      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      expect(panel.getState().editingFrame).toBe(10);
    });
  });

  describe('marker color cycling', () => {
    it('MARK-U050: clicking color button cycles to next color', () => {
      session.setMarker(10, '', MARKER_COLORS[0]); // Red
      panel.show();

      const colorBtn = panel.getElement().querySelector('[data-testid="marker-color-10"]') as HTMLElement;
      colorBtn.click();

      expect(session.getMarker(10)?.color).toBe(MARKER_COLORS[1]); // Green
    });

    it('MARK-U051: color cycles through all preset colors', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      panel.show();

      const colorBtn = panel.getElement().querySelector('[data-testid="marker-color-10"]') as HTMLElement;

      for (let i = 1; i < MARKER_COLORS.length; i++) {
        colorBtn.click();
        expect(session.getMarker(10)?.color).toBe(MARKER_COLORS[i]);
      }

      // Should wrap back to first color
      colorBtn.click();
      expect(session.getMarker(10)?.color).toBe(MARKER_COLORS[0]);
    });
  });

  describe('marker deletion', () => {
    it('MARK-U060: clicking delete button removes marker', () => {
      session.setMarker(10, 'Test', MARKER_COLORS[0]);
      panel.show();
      expect(session.hasMarker(10)).toBe(true);

      const deleteBtn = panel.getElement().querySelector('[data-testid="marker-delete-10"]') as HTMLElement;
      deleteBtn.click();

      expect(session.hasMarker(10)).toBe(false);
    });

    it('MARK-U061: marker entry is removed from list after deletion', () => {
      session.setMarker(10, 'Test', MARKER_COLORS[0]);
      panel.show();
      expect(panel.getElement().querySelector('[data-testid="marker-entry-10"]')).not.toBeNull();

      const deleteBtn = panel.getElement().querySelector('[data-testid="marker-delete-10"]') as HTMLElement;
      deleteBtn.click();

      expect(panel.getElement().querySelector('[data-testid="marker-entry-10"]')).toBeNull();
    });
  });

  describe('add marker button', () => {
    it('MARK-U070: add button adds marker at current frame', () => {
      session.currentFrame = 42;
      panel.show();
      expect(session.hasMarker(42)).toBe(false);

      const addBtn = panel.getElement().querySelector('[data-testid="marker-add-btn"]') as HTMLElement;
      addBtn.click();

      expect(session.hasMarker(42)).toBe(true);
    });

    it('MARK-U071: add button does nothing if marker already exists', () => {
      session.currentFrame = 42;
      session.setMarker(42, 'Existing', '#00ff00');
      panel.show();

      const addBtn = panel.getElement().querySelector('[data-testid="marker-add-btn"]') as HTMLElement;
      addBtn.click();

      // Should still have original note and color
      expect(session.getMarker(42)?.note).toBe('Existing');
      expect(session.getMarker(42)?.color).toBe('#00ff00');
    });
  });

  describe('clear all button', () => {
    it('MARK-U080: clear button removes all markers when confirmed', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      session.setMarker(20, '', MARKER_COLORS[1]);
      session.setMarker(30, '', MARKER_COLORS[2]);
      panel.show();
      expect(session.marks.size).toBe(3);

      // Mock window.confirm to return true
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const clearBtn = panel.getElement().querySelector('[data-testid="marker-clear-btn"]') as HTMLElement;
      clearBtn.click();

      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('3 markers'));
      expect(session.marks.size).toBe(0);

      confirmSpy.mockRestore();
    });

    it('MARK-U081: shows empty message after clearing', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      panel.show();

      // Mock window.confirm to return true
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const clearBtn = panel.getElement().querySelector('[data-testid="marker-clear-btn"]') as HTMLElement;
      clearBtn.click();

      const entries = panel.getElement().querySelector('[data-testid="marker-entries"]');
      expect(entries?.textContent).toContain('No markers yet');

      confirmSpy.mockRestore();
    });

    it('MARK-U082: clear button does not clear when cancelled', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      session.setMarker(20, '', MARKER_COLORS[1]);
      panel.show();
      expect(session.marks.size).toBe(2);

      // Mock window.confirm to return false (user cancelled)
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      const clearBtn = panel.getElement().querySelector('[data-testid="marker-clear-btn"]') as HTMLElement;
      clearBtn.click();

      expect(confirmSpy).toHaveBeenCalled();
      expect(session.marks.size).toBe(2); // Markers should still exist

      confirmSpy.mockRestore();
    });

    it('MARK-U083: clear button does nothing when no markers', () => {
      panel.show();
      expect(session.marks.size).toBe(0);

      // Mock window.confirm - should not be called
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const clearBtn = panel.getElement().querySelector('[data-testid="marker-clear-btn"]') as HTMLElement;
      clearBtn.click();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(session.marks.size).toBe(0);

      confirmSpy.mockRestore();
    });
  });

  describe('close button', () => {
    it('MARK-U090: close button hides panel', () => {
      panel.show();
      expect(panel.isVisible()).toBe(true);

      const closeBtn = panel.getElement().querySelector('[data-testid="marker-close-btn"]') as HTMLElement;
      closeBtn.click();

      expect(panel.isVisible()).toBe(false);
    });
  });

  describe('getState', () => {
    it('MARK-U100: getState returns correct state', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      session.setMarker(20, '', MARKER_COLORS[1]);

      const state = panel.getState();
      expect(state.visible).toBe(false);
      expect(state.markerCount).toBe(2);
      expect(state.editingFrame).toBeNull();
    });

    it('MARK-U101: getState reflects visibility changes', () => {
      panel.show();
      expect(panel.getState().visible).toBe(true);
      panel.hide();
      expect(panel.getState().visible).toBe(false);
    });
  });

  describe('duration markers', () => {
    it('MARK-U110: displays duration marker with frame range info', () => {
      session.setMarker(10, 'Duration note', MARKER_COLORS[0], 25);
      panel.show();
      const entry = panel.getElement().querySelector('[data-testid="marker-entry-10"]');
      expect(entry).not.toBeNull();
      const frameInfo = entry?.querySelector('span');
      expect(frameInfo?.textContent).toContain('Frames 10-25');
      expect(frameInfo?.textContent).toContain('16f');
    });

    it('MARK-U111: duration marker has square color indicator', () => {
      session.setMarker(10, '', MARKER_COLORS[0], 30);
      panel.show();
      const colorBtn = panel.getElement().querySelector('[data-testid="marker-color-10"]') as HTMLElement;
      expect(colorBtn?.style.borderRadius).toBe('3px');
    });

    it('MARK-U112: point marker has round color indicator', () => {
      session.setMarker(10, '', MARKER_COLORS[0]);
      panel.show();
      const colorBtn = panel.getElement().querySelector('[data-testid="marker-color-10"]') as HTMLElement;
      expect(colorBtn?.style.borderRadius).toBe('50%');
    });

    it('MARK-U113: highlights duration marker when current frame is within range', () => {
      session.setMarker(10, '', MARKER_COLORS[0], 30);
      session.currentFrame = 20; // Within range 10-30
      panel.show();
      const entry = panel.getElement().querySelector('[data-testid="marker-entry-10"]') as HTMLElement;
      expect(entry?.style.cssText).toContain('rgba(var(--accent-primary-rgb)');
    });

    it('MARK-U114: does not highlight duration marker when current frame is outside range', () => {
      session.setMarker(10, '', MARKER_COLORS[0], 30);
      session.currentFrame = 35; // Outside range 10-30
      panel.show();
      const entry = panel.getElement().querySelector('[data-testid="marker-entry-10"]') as HTMLElement;
      expect(entry?.style.cssText).not.toContain('rgba(var(--accent-primary-rgb)');
    });

    it('MARK-U115: editing shows end frame input', () => {
      session.setMarker(10, 'Test', MARKER_COLORS[0], 25);
      panel.show();

      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      const endFrameInput = panel.getElement().querySelector('[data-testid="marker-endframe-input-10"]') as HTMLInputElement;
      expect(endFrameInput).not.toBeNull();
      expect(endFrameInput.value).toBe('25');
    });

    it('MARK-U116: editing shows empty end frame input for point marker', () => {
      session.setMarker(10, 'Test', MARKER_COLORS[0]);
      panel.show();

      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      const endFrameInput = panel.getElement().querySelector('[data-testid="marker-endframe-input-10"]') as HTMLInputElement;
      expect(endFrameInput).not.toBeNull();
      expect(endFrameInput.value).toBe('');
    });

    it('MARK-U117: saving with end frame converts point marker to duration marker', () => {
      session.setMarker(10, 'Test', MARKER_COLORS[0]);
      panel.show();

      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      const endFrameInput = panel.getElement().querySelector('[data-testid="marker-endframe-input-10"]') as HTMLInputElement;
      endFrameInput.value = '30';

      const saveBtn = panel.getElement().querySelector('[data-testid="marker-save-10"]') as HTMLElement;
      saveBtn.click();

      const marker = session.getMarker(10);
      expect(marker?.endFrame).toBe(30);
    });

    it('MARK-U118: saving with cleared end frame converts duration to point marker', () => {
      session.setMarker(10, 'Test', MARKER_COLORS[0], 25);
      panel.show();

      const editBtn = panel.getElement().querySelector('[data-testid="marker-edit-10"]') as HTMLElement;
      editBtn.click();

      const endFrameInput = panel.getElement().querySelector('[data-testid="marker-endframe-input-10"]') as HTMLInputElement;
      endFrameInput.value = '';

      const saveBtn = panel.getElement().querySelector('[data-testid="marker-save-10"]') as HTMLElement;
      saveBtn.click();

      const marker = session.getMarker(10);
      expect(marker?.endFrame).toBeUndefined();
    });
  });
});
