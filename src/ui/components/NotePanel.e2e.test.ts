/**
 * NotePanel E2E Integration Tests
 *
 * Verifies that notes are properly wired end-to-end:
 * - NoteManager CRUD → NotePanel renders correctly
 * - NotePanel noteSelected → session frame navigation
 * - Notes survive serialize → deserialize round-trip
 * - Notes persist through NoteManager → Session → NotePanel lifecycle
 * - Filter, threading, and status flows work end-to-end
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotePanel } from './NotePanel';
import { Session } from '../../core/session/Session';
import { NoteManager, type Note } from '../../core/session/NoteManager';

describe('NotePanel E2E Integration', () => {
  let panel: NotePanel;
  let session: Session;

  beforeEach(() => {
    session = new Session();
    (session as any).addSource({
      name: 'test.mp4',
      url: 'blob:test',
      type: 'video',
      duration: 200,
      fps: 24,
      width: 1920,
      height: 1080,
      element: document.createElement('video'),
    });
    (session as any)._inPoint = 1;
    (session as any)._outPoint = 200;
    panel = new NotePanel(session);
  });

  afterEach(() => {
    panel.dispose();
  });

  describe('NoteManager CRUD → Panel rendering', () => {
    it('adding a note via NoteManager immediately renders in panel', () => {
      panel.show();
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(0);

      session.noteManager.addNote(0, 10, 20, 'First note', 'Alice');

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.textContent).toContain('First note');
      expect(entries[0]?.textContent).toContain('Alice');
    });

    it('removing a note via NoteManager immediately removes from panel', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'To be removed', 'Alice');
      panel.show();
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(1);

      session.noteManager.removeNote(note.id);

      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(0);
    });

    it('updating note text via NoteManager re-renders in panel', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Original', 'Alice');
      panel.show();

      session.noteManager.updateNote(note.id, { text: 'Updated text' });

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries[0]?.textContent).toContain('Updated text');
    });

    it('resolving a note via NoteManager updates status badge', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Open note', 'Alice');
      panel.show();

      const badgeBefore = panel.getElement().querySelector(`[data-testid="note-status-${note.id}"]`);
      expect(badgeBefore?.textContent).toBe('open');

      session.noteManager.resolveNote(note.id);

      const badgeAfter = panel.getElement().querySelector(`[data-testid="note-status-${note.id}"]`);
      expect(badgeAfter?.textContent).toBe('resolved');
    });
  });

  describe('noteSelected → session navigation', () => {
    it('clicking a note navigates session to the note frame', () => {
      const note = session.noteManager.addNote(0, 42, 50, 'Go here', 'Alice');
      panel.show();
      const goToFrameSpy = vi.spyOn(session, 'goToFrame');

      const entry = panel.getElement().querySelector(`[data-testid="note-entry-${note.id}"]`) as HTMLElement;
      entry.click();

      expect(goToFrameSpy).toHaveBeenCalledWith(42);
    });

    it('noteSelected event contains noteId and frame', () => {
      const note = session.noteManager.addNote(0, 100, 110, 'Important', 'Alice');
      panel.show();

      const callback = vi.fn();
      panel.on('noteSelected', callback);

      const entry = panel.getElement().querySelector(`[data-testid="note-entry-${note.id}"]`) as HTMLElement;
      entry.click();

      expect(callback).toHaveBeenCalledWith({
        noteId: note.id,
        frame: 100,
      });
    });
  });

  describe('serialize → deserialize round-trip', () => {
    it('NOTE-015: notes survive NoteManager serialize → deserialize', () => {
      session.noteManager.addNote(0, 10, 20, 'Note A', 'Alice');
      const parent = session.noteManager.addNote(0, 50, 60, 'Parent', 'Bob');
      session.noteManager.addNote(0, 50, 60, 'Reply', 'Charlie', { parentId: parent.id });
      session.noteManager.resolveNote(parent.id);

      const serialized = session.noteManager.toSerializable();
      const json = JSON.stringify(serialized);
      const restored = JSON.parse(json) as Note[];

      // Create fresh manager and restore
      const freshManager = new NoteManager();
      freshManager.fromSerializable(restored);

      expect(freshManager.getNotes().length).toBe(3);
      expect(freshManager.getNote(parent.id)?.status).toBe('resolved');
      expect(freshManager.getReplies(parent.id).length).toBe(1);

      freshManager.dispose();
    });

    it('panel renders correctly after restoring notes', () => {
      // Create notes in one manager
      session.noteManager.addNote(0, 10, 10, 'Restored A', 'Alice');
      session.noteManager.addNote(0, 20, 20, 'Restored B', 'Bob');
      const serialized = session.noteManager.toSerializable();

      // Clear and restore
      session.noteManager.fromSerializable([]);
      panel.show();
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(0);

      // Restore from serialized data
      session.noteManager.fromSerializable(serialized);

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(2);
      expect(entries[0]?.textContent).toContain('Restored A');
      expect(entries[1]?.textContent).toContain('Restored B');
    });
  });

  describe('full threading workflow', () => {
    it('create parent → add replies → all display in order', () => {
      const parent = session.noteManager.addNote(0, 30, 30, 'Main note', 'Alice');
      session.noteManager.addNote(0, 30, 30, 'Reply 1', 'Bob', { parentId: parent.id });
      session.noteManager.addNote(0, 30, 30, 'Reply 2', 'Charlie', { parentId: parent.id });
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(3); // parent + 2 replies

      // Parent first, then replies
      expect(entries[0]?.textContent).toContain('Main note');
      expect(entries[1]?.textContent).toContain('Reply 1');
      expect(entries[2]?.textContent).toContain('Reply 2');
    });

    it('removing parent cascades and removes replies from panel', () => {
      const parent = session.noteManager.addNote(0, 30, 30, 'Parent', 'Alice');
      session.noteManager.addNote(0, 30, 30, 'Reply', 'Bob', { parentId: parent.id });
      panel.show();
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(2);

      session.noteManager.removeNote(parent.id);

      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(0);
    });
  });

  describe('status filter end-to-end', () => {
    it('complete workflow: create → resolve → filter → verify', () => {
      const noteA = session.noteManager.addNote(0, 10, 10, 'Open A', 'Alice');
      session.noteManager.addNote(0, 20, 20, 'Open B', 'Bob');
      session.noteManager.addNote(0, 30, 30, 'Open C', 'Charlie');
      panel.show();

      // All 3 visible
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(3);

      // Resolve one
      session.noteManager.resolveNote(noteA.id);

      // Still shows all (filter = 'all')
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(3);

      // Filter to open only
      const openFilter = panel.getElement().querySelector('[data-testid="note-filter-open"]') as HTMLElement;
      openFilter.click();
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(2);

      // Filter to resolved only
      const resolvedFilter = panel.getElement().querySelector('[data-testid="note-filter-resolved"]') as HTMLElement;
      resolvedFilter.click();
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(1);
      expect(panel.getElement().querySelector('.note-entry')?.textContent).toContain('Open A');
    });
  });

  describe('inline edit end-to-end', () => {
    it('edit → save → panel shows updated text', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Before edit', 'Alice');
      panel.show();

      // Click edit
      const editBtn = panel.getElement().querySelector(`[data-testid="note-edit-${note.id}"]`) as HTMLElement;
      editBtn.click();

      // Type and save
      const textarea = panel.getElement().querySelector(`[data-testid="note-edit-textarea-${note.id}"]`) as HTMLTextAreaElement;
      textarea.value = 'After edit';
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      }));

      // Verify text updated in both NoteManager and Panel
      expect(session.noteManager.getNote(note.id)?.text).toBe('After edit');
      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries[0]?.textContent).toContain('After edit');
    });

    it('edit with empty text removes the note', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Will be emptied', 'Alice');
      panel.show();

      const editBtn = panel.getElement().querySelector(`[data-testid="note-edit-${note.id}"]`) as HTMLElement;
      editBtn.click();

      const textarea = panel.getElement().querySelector(`[data-testid="note-edit-textarea-${note.id}"]`) as HTMLTextAreaElement;
      textarea.value = '   '; // whitespace only
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      }));

      expect(session.noteManager.getNote(note.id)).toBeUndefined();
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(0);
    });
  });

  describe('reply workflow end-to-end', () => {
    it('reply button → type → submit → reply appears under parent', () => {
      const parent = session.noteManager.addNote(0, 10, 10, 'Parent note', 'Alice');
      panel.show();

      // Click reply
      const replyBtn = panel.getElement().querySelector(`[data-testid="note-reply-${parent.id}"]`) as HTMLElement;
      replyBtn.click();

      // Submit reply
      const textarea = panel.getElement().querySelector(`[data-testid="note-reply-textarea-${parent.id}"]`) as HTMLTextAreaElement;
      textarea.value = 'My reply';
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      }));

      // Verify in manager
      const replies = session.noteManager.getReplies(parent.id);
      expect(replies.length).toBe(1);
      expect(replies[0]?.text).toBe('My reply');

      // Verify in panel (parent + reply)
      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(2);
    });
  });

  describe('multiple sources', () => {
    it('notes from different sources are displayed', () => {
      session.noteManager.addNote(0, 10, 10, 'Source 0 note', 'Alice');
      session.noteManager.addNote(1, 20, 20, 'Source 1 note', 'Bob');
      panel.show();

      // Panel shows all top-level notes regardless of source
      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(2);
    });
  });

  describe('session notesChanged event integration', () => {
    it('session emits notesChanged when notes change', () => {
      const callback = vi.fn();
      session.on('notesChanged', callback);

      session.noteManager.addNote(0, 10, 10, 'Test', 'Alice');
      expect(callback).toHaveBeenCalled();
    });

    it('NotePanel re-renders on session notesChanged', () => {
      panel.show();

      // Batch update via fromSerializable
      const notes: Note[] = [
        {
          id: 'batch-1',
          sourceIndex: 0,
          frameStart: 10,
          frameEnd: 10,
          text: 'Batch note 1',
          author: 'Alice',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          status: 'open',
          parentId: null,
          color: '#fbbf24',
        },
        {
          id: 'batch-2',
          sourceIndex: 0,
          frameStart: 20,
          frameEnd: 20,
          text: 'Batch note 2',
          author: 'Bob',
          createdAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          status: 'open',
          parentId: null,
          color: '#fbbf24',
        },
      ];
      session.noteManager.fromSerializable(notes);

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(2);
    });
  });

  describe('addNoteAtCurrentFrame integration', () => {
    it('creates note at current session frame and opens edit mode', () => {
      // Move session to a specific frame
      session.goToFrame(55);

      panel.addNoteAtCurrentFrame();

      const notes = session.noteManager.getNotes();
      expect(notes.length).toBe(1);
      expect(notes[0]?.frameStart).toBe(55);
      expect(notes[0]?.frameEnd).toBe(55);

      // Panel should be visible and showing the edit textarea
      expect(panel.isVisible()).toBe(true);
      const textarea = panel.getElement().querySelector(`[data-testid="note-edit-textarea-${notes[0]!.id}"]`);
      expect(textarea).not.toBeNull();
    });
  });

  describe('panel lifecycle', () => {
    it('show → add notes → hide → show preserves notes', () => {
      panel.show();
      session.noteManager.addNote(0, 10, 10, 'Persistent', 'Alice');

      panel.hide();
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.textContent).toContain('Persistent');
    });

    it('toggle cycle preserves state', () => {
      session.noteManager.addNote(0, 5, 5, 'Toggle test', 'Alice');

      panel.toggle(); // show
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(1);

      panel.toggle(); // hide
      panel.toggle(); // show again

      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(1);
    });
  });
});
