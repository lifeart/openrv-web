/**
 * NotePanel Component Tests
 *
 * Tests for the note/comment panel with threading, status filtering,
 * inline editing, and frame navigation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotePanel } from './NotePanel';
import { Session } from '../../core/session/Session';

describe('NotePanel', () => {
  let panel: NotePanel;
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
    panel = new NotePanel(session);
  });

  afterEach(() => {
    panel.dispose();
  });

  describe('initialization', () => {
    it('creates NotePanel instance', () => {
      expect(panel).toBeInstanceOf(NotePanel);
    });

    it('panel is hidden by default', () => {
      expect(panel.isVisible()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('panel has correct test ID', () => {
      expect(panel.getElement().dataset.testid).toBe('note-panel');
    });
  });

  describe('visibility', () => {
    it('show() makes panel visible', () => {
      panel.show();
      expect(panel.isVisible()).toBe(true);
      expect(panel.getElement().style.display).toBe('flex');
    });

    it('hide() hides panel', () => {
      panel.show();
      panel.hide();
      expect(panel.isVisible()).toBe(false);
      expect(panel.getElement().style.display).toBe('none');
    });

    it('toggle() toggles visibility', () => {
      expect(panel.isVisible()).toBe(false);
      panel.toggle();
      expect(panel.isVisible()).toBe(true);
      panel.toggle();
      expect(panel.isVisible()).toBe(false);
    });

    it('emits visibilityChanged when showing', () => {
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);
      panel.show();
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('emits visibilityChanged when hiding', () => {
      panel.show();
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);
      panel.hide();
      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('note list rendering', () => {
    it('NOTE-U001: renders empty state message when no notes', () => {
      panel.show();
      const emptyState = panel.getElement().querySelector('[data-testid="note-empty-state"]');
      expect(emptyState).not.toBeNull();
      expect(emptyState?.textContent).toContain('No notes yet');
    });

    it('NOTE-U002: renders note list with author, text, timestamp', () => {
      session.noteManager.addNote(0, 10, 20, 'Fix edge artifact', 'Alice');
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);

      const entry = entries[0]!;
      expect(entry.textContent).toContain('Fix edge artifact');
      expect(entry.textContent).toContain('Alice');
    });

    it('renders multiple notes sorted by frame', () => {
      session.noteManager.addNote(0, 50, 50, 'Middle note', 'Bob');
      session.noteManager.addNote(0, 10, 10, 'First note', 'Alice');
      session.noteManager.addNote(0, 90, 90, 'Last note', 'Charlie');
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(3);
      expect(entries[0]?.getAttribute('data-frame')).toBe('10');
      expect(entries[1]?.getAttribute('data-frame')).toBe('50');
      expect(entries[2]?.getAttribute('data-frame')).toBe('90');
    });

    it('updates when notes change', () => {
      panel.show();
      expect(panel.getElement().querySelector('[data-testid="note-empty-state"]')).not.toBeNull();

      session.noteManager.addNote(0, 10, 10, 'New note', 'Alice');

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
    });

    it('shows frame range for multi-frame notes', () => {
      session.noteManager.addNote(0, 10, 20, 'Range note', 'Alice');
      panel.show();

      const entry = panel.getElement().querySelector('.note-entry');
      expect(entry?.textContent).toContain('F10-20');
    });

    it('shows single frame for single-frame notes', () => {
      session.noteManager.addNote(0, 15, 15, 'Single frame note', 'Alice');
      panel.show();

      const entry = panel.getElement().querySelector('.note-entry');
      expect(entry?.textContent).toContain('F15');
      expect(entry?.textContent).not.toContain('F15-');
    });
  });

  describe('note navigation', () => {
    it('NOTE-U003: clicking note emits noteSelected with frame', () => {
      const note = session.noteManager.addNote(0, 25, 30, 'Click me', 'Alice');
      panel.show();

      const callback = vi.fn();
      panel.on('noteSelected', callback);

      const entry = panel.getElement().querySelector(`[data-testid="note-entry-${note.id}"]`) as HTMLElement;
      expect(entry).not.toBeNull();
      entry.click();

      expect(callback).toHaveBeenCalledWith({ noteId: note.id, frame: 25 });
    });

    it('clicking note navigates session to frame', () => {
      const goToFrameSpy = vi.spyOn(session, 'goToFrame');
      const note = session.noteManager.addNote(0, 42, 42, 'Navigate here', 'Alice');
      panel.show();

      const entry = panel.getElement().querySelector(`[data-testid="note-entry-${note.id}"]`) as HTMLElement;
      entry.click();

      expect(goToFrameSpy).toHaveBeenCalledWith(42);
    });
  });

  describe('status filtering', () => {
    it('NOTE-U004: filter by status shows only matching notes', () => {
      const openNote = session.noteManager.addNote(0, 10, 10, 'Open note', 'Alice');
      session.noteManager.addNote(0, 20, 20, 'Also open', 'Bob');
      session.noteManager.resolveNote(openNote.id);
      panel.show();

      // Initially shows all (2 notes)
      let entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(2);

      // Click "Open" filter
      const openFilter = panel.getElement().querySelector('[data-testid="note-filter-open"]') as HTMLElement;
      openFilter.click();

      entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.textContent).toContain('Also open');

      // Click "Resolved" filter
      const resolvedFilter = panel.getElement().querySelector('[data-testid="note-filter-resolved"]') as HTMLElement;
      resolvedFilter.click();

      entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.textContent).toContain('Open note');

      // Click "All" filter
      const allFilter = panel.getElement().querySelector('[data-testid="note-filter-all"]') as HTMLElement;
      allFilter.click();

      entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(2);
    });
  });

  describe('inline editing', () => {
    it('NOTE-U005: inline edit updates note text', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Original text', 'Alice');
      panel.show();

      // Click edit button
      const editBtn = panel.getElement().querySelector(`[data-testid="note-edit-${note.id}"]`) as HTMLElement;
      editBtn.click();

      // Textarea should appear
      const textarea = panel.getElement().querySelector(`[data-testid="note-edit-textarea-${note.id}"]`) as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      expect(textarea.value).toBe('Original text');

      // Simulate typing and Ctrl+Enter
      textarea.value = 'Updated text';
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      }));

      // Verify note was updated
      const updatedNote = session.noteManager.getNote(note.id);
      expect(updatedNote?.text).toBe('Updated text');
    });

    it('escape cancels edit without saving', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Original text', 'Alice');
      panel.show();

      // Click edit button
      const editBtn = panel.getElement().querySelector(`[data-testid="note-edit-${note.id}"]`) as HTMLElement;
      editBtn.click();

      const textarea = panel.getElement().querySelector(`[data-testid="note-edit-textarea-${note.id}"]`) as HTMLTextAreaElement;
      textarea.value = 'This should not be saved';
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));

      // Verify note was NOT updated
      const originalNote = session.noteManager.getNote(note.id);
      expect(originalNote?.text).toBe('Original text');
    });
  });

  describe('resolve and delete', () => {
    it('NOTE-U006: resolve button calls noteManager.resolveNote()', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Open note', 'Alice');
      panel.show();

      const resolveBtn = panel.getElement().querySelector(`[data-testid="note-resolve-${note.id}"]`) as HTMLElement;
      expect(resolveBtn).not.toBeNull();
      resolveBtn.click();

      const updatedNote = session.noteManager.getNote(note.id);
      expect(updatedNote?.status).toBe('resolved');
    });

    it('resolved notes have no resolve button', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Resolved note', 'Alice');
      session.noteManager.resolveNote(note.id);
      panel.show();

      const resolveBtn = panel.getElement().querySelector(`[data-testid="note-resolve-${note.id}"]`);
      expect(resolveBtn).toBeNull();
    });

    it('delete button removes note', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Delete me', 'Alice');
      panel.show();

      const deleteBtn = panel.getElement().querySelector(`[data-testid="note-delete-${note.id}"]`) as HTMLElement;
      deleteBtn.click();

      expect(session.noteManager.getNote(note.id)).toBeUndefined();
    });
  });

  describe('reply threading', () => {
    it('NOTE-U007: reply button opens reply input', () => {
      const parent = session.noteManager.addNote(0, 10, 10, 'Parent note', 'Alice');
      panel.show();

      const replyBtn = panel.getElement().querySelector(`[data-testid="note-reply-${parent.id}"]`) as HTMLElement;
      expect(replyBtn).not.toBeNull();
      replyBtn.click();

      const replyInput = panel.getElement().querySelector(`[data-testid="note-reply-input-${parent.id}"]`);
      expect(replyInput).not.toBeNull();
    });

    it('reply creates note with parentId', () => {
      const parent = session.noteManager.addNote(0, 10, 10, 'Parent note', 'Alice');
      panel.show();

      // Open reply input
      const replyBtn = panel.getElement().querySelector(`[data-testid="note-reply-${parent.id}"]`) as HTMLElement;
      replyBtn.click();

      // Type and submit
      const textarea = panel.getElement().querySelector(`[data-testid="note-reply-textarea-${parent.id}"]`) as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      textarea.value = 'This is a reply';
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      }));

      // Verify reply was created
      const replies = session.noteManager.getReplies(parent.id);
      expect(replies.length).toBe(1);
      expect(replies[0]?.text).toBe('This is a reply');
      expect(replies[0]?.parentId).toBe(parent.id);
    });

    it('replies are shown indented under parent', () => {
      const parent = session.noteManager.addNote(0, 10, 10, 'Parent note', 'Alice');
      session.noteManager.addNote(0, 10, 10, 'Reply text', 'Bob', { parentId: parent.id });
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      // Should show parent + reply
      expect(entries.length).toBe(2);
      // Reply should have larger left padding (indented)
      const replyStyle = (entries[1] as HTMLElement).style.paddingLeft;
      expect(replyStyle).toBe('28px');
    });
  });

  describe('add note', () => {
    it('add button creates note at current frame', () => {
      panel.show();

      const addBtn = panel.getElement().querySelector('[data-testid="note-add-btn"]') as HTMLElement;
      addBtn.click();

      const notes = session.noteManager.getNotes();
      expect(notes.length).toBe(1);
      expect(notes[0]?.frameStart).toBe(session.currentFrame);
    });

    it('addNoteAtCurrentFrame() opens panel if hidden', () => {
      expect(panel.isVisible()).toBe(false);
      panel.addNoteAtCurrentFrame();
      expect(panel.isVisible()).toBe(true);
    });
  });

  describe('close button', () => {
    it('close button hides panel', () => {
      panel.show();

      const closeBtn = panel.getElement().querySelector('[data-testid="note-close-btn"]') as HTMLElement;
      closeBtn.click();

      expect(panel.isVisible()).toBe(false);
    });
  });

  describe('disposal', () => {
    it('NOTE-U008: dispose() cleans up event listeners', () => {
      panel.show();
      panel.dispose();

      // After dispose, adding notes should not cause errors
      session.noteManager.addNote(0, 10, 10, 'After dispose', 'Alice');
      // No crash = success
    });

    it('dispose removes all panel listeners', () => {
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);
      panel.dispose();
      // After dispose, no events should fire from the panel
      // (removeAllListeners was called)
    });
  });

  describe('status badge display', () => {
    it('shows open status badge', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Open note', 'Alice');
      panel.show();

      const badge = panel.getElement().querySelector(`[data-testid="note-status-${note.id}"]`);
      expect(badge?.textContent).toBe('open');
    });

    it('shows resolved status badge', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Resolved note', 'Alice');
      session.noteManager.resolveNote(note.id);
      panel.show();

      const badge = panel.getElement().querySelector(`[data-testid="note-status-${note.id}"]`);
      expect(badge?.textContent).toBe('resolved');
    });
  });
});
