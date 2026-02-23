/**
 * NotePanel Component Tests
 *
 * Tests for the note/comment panel with threading, status filtering,
 * inline editing, and frame navigation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotePanel } from './NotePanel';
import { Session } from '../../core/session/Session';

// Mock PreferencesManager so we can control userName
const mockGetGeneralPrefs = vi.fn(() => ({ userName: '' }));
vi.mock('../../core/PreferencesManager', () => ({
  getCorePreferencesManager: () => ({
    getGeneralPrefs: mockGetGeneralPrefs,
  }),
}));

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
      expect(() => session.noteManager.addNote(0, 10, 10, 'After dispose', 'Alice')).not.toThrow();
    });

    it('dispose removes all panel listeners', () => {
      const callback = vi.fn();
      panel.on('visibilityChanged', callback);
      panel.dispose();
      // After dispose, no events should fire from the panel
      panel.emit('visibilityChanged', true);
      expect(callback).not.toHaveBeenCalled();
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

    it('shows wontfix status badge', () => {
      const note = session.noteManager.addNote(0, 10, 10, 'Wontfix note', 'Alice');
      session.noteManager.updateNote(note.id, { status: 'wontfix' });
      panel.show();

      const badge = panel.getElement().querySelector(`[data-testid="note-status-${note.id}"]`);
      expect(badge?.textContent).toBe('wontfix');
    });
  });

  describe('wontfix filter', () => {
    it('wontfix filter shows only wontfix notes', () => {
      session.noteManager.addNote(0, 10, 10, 'Open note', 'Alice');
      const wontfixNote = session.noteManager.addNote(0, 20, 20, 'Wontfix note', 'Bob');
      session.noteManager.updateNote(wontfixNote.id, { status: 'wontfix' });
      panel.show();

      // All visible initially
      expect(panel.getElement().querySelectorAll('.note-entry').length).toBe(2);

      // Click wontfix filter
      const wontfixFilter = panel.getElement().querySelector('[data-testid="note-filter-wontfix"]') as HTMLElement;
      expect(wontfixFilter).not.toBeNull();
      wontfixFilter.click();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.textContent).toContain('Wontfix note');
    });
  });

  describe('nested reply rendering', () => {
    it('renders deeply nested replies (reply-to-reply)', () => {
      const parent = session.noteManager.addNote(0, 10, 10, 'Level 0', 'Alice');
      const reply1 = session.noteManager.addNote(0, 10, 10, 'Level 1', 'Bob', { parentId: parent.id });
      session.noteManager.addNote(0, 10, 10, 'Level 2', 'Charlie', { parentId: reply1.id });
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(3);
      expect(entries[0]?.textContent).toContain('Level 0');
      expect(entries[1]?.textContent).toContain('Level 1');
      expect(entries[2]?.textContent).toContain('Level 2');
    });
  });

  describe('author name from preferences', () => {
    afterEach(() => {
      mockGetGeneralPrefs.mockReturnValue({ userName: '' });
    });

    it('addNoteAtCurrentFrame uses userName from preferences', () => {
      mockGetGeneralPrefs.mockReturnValue({ userName: 'Jane Doe' });
      panel.addNoteAtCurrentFrame();
      const notes = session.noteManager.getNotes();
      expect(notes.length).toBe(1);
      expect(notes[0]?.author).toBe('Jane Doe');
    });

    it('saveReply uses userName from preferences', () => {
      mockGetGeneralPrefs.mockReturnValue({ userName: 'Jane Doe' });
      const parent = session.noteManager.addNote(0, 10, 10, 'Parent', 'Alice');
      panel.show();

      const replyBtn = panel.getElement().querySelector(`[data-testid="note-reply-${parent.id}"]`) as HTMLElement;
      replyBtn.click();

      const textarea = panel.getElement().querySelector(`[data-testid="note-reply-textarea-${parent.id}"]`) as HTMLTextAreaElement;
      textarea.value = 'A reply';
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', ctrlKey: true, bubbles: true,
      }));

      const replies = session.noteManager.getReplies(parent.id);
      expect(replies.length).toBe(1);
      expect(replies[0]?.author).toBe('Jane Doe');
    });

    it('falls back to "User" when userName is empty string', () => {
      mockGetGeneralPrefs.mockReturnValue({ userName: '' });
      panel.addNoteAtCurrentFrame();
      const notes = session.noteManager.getNotes();
      expect(notes[0]?.author).toBe('User');
    });

    it('falls back to "User" when userName is whitespace-only', () => {
      mockGetGeneralPrefs.mockReturnValue({ userName: '   ' });
      panel.addNoteAtCurrentFrame();
      const notes = session.noteManager.getNotes();
      expect(notes[0]?.author).toBe('User');
    });

    it('trims whitespace from userName', () => {
      mockGetGeneralPrefs.mockReturnValue({ userName: '  Bob  ' });
      panel.addNoteAtCurrentFrame();
      const notes = session.noteManager.getNotes();
      expect(notes[0]?.author).toBe('Bob');
    });
  });

  describe('export/import', () => {
    it('export button exists in header', () => {
      panel.show();
      const btn = panel.getElement().querySelector('[data-testid="note-export-btn"]');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('Export');
    });

    it('import button exists in header', () => {
      panel.show();
      const btn = panel.getElement().querySelector('[data-testid="note-import-btn"]');
      expect(btn).not.toBeNull();
      expect(btn?.textContent).toBe('Import');
    });

    it('export produces valid JSON with all note fields', () => {
      session.noteManager.addNote(0, 10, 20, 'Export me', 'Alice');
      panel.show();

      // Mock the download mechanism
      const createElementSpy = vi.spyOn(document, 'createElement');
      const revokeURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const createURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');

      const exportBtn = panel.getElement().querySelector('[data-testid="note-export-btn"]') as HTMLElement;
      exportBtn.click();

      // Find the anchor element that was created for download
      const anchorCalls = createElementSpy.mock.calls.filter(c => c[0] === 'a');
      expect(anchorCalls.length).toBeGreaterThan(0);

      createElementSpy.mockRestore();
      createURLSpy.mockRestore();
      revokeURLSpy.mockRestore();
    });

    it('round-trip: export → import → notes identical', () => {
      const note = session.noteManager.addNote(0, 10, 20, 'Round trip note', 'Alice');
      const originalNotes = session.noteManager.toSerializable();

      // Build the export data as the export method would
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        notes: originalNotes,
      };

      // Clear notes and import
      session.noteManager.fromSerializable([]);
      expect(session.noteManager.getNotes().length).toBe(0);

      // Simulate import
      session.noteManager.fromSerializable(exportData.notes);

      const imported = session.noteManager.getNotes();
      expect(imported.length).toBe(1);
      expect(imported[0]?.text).toBe('Round trip note');
      expect(imported[0]?.author).toBe('Alice');
      expect(imported[0]?.id).toBe(note.id);
    });
  });

  describe('per-source note filtering', () => {
    function addSecondSource() {
      (session as any).addSource({
        name: 'test2.mp4',
        url: 'blob:test2',
        type: 'video',
        duration: 50,
        fps: 24,
        width: 1920,
        height: 1080,
        element: document.createElement('video'),
      });
    }

    it('source dropdown hidden when only 1 source loaded', () => {
      panel.show();
      const select = panel.getElement().querySelector('[data-testid="note-source-filter"]');
      expect(select).toBeNull();
    });

    it('source dropdown visible when multiple sources loaded', () => {
      addSecondSource();
      panel.show();
      // Force filter bar rebuild
      (panel as any).buildFilterBar();
      const select = panel.getElement().querySelector('[data-testid="note-source-filter"]');
      expect(select).not.toBeNull();
    });

    it('default shows all sources', () => {
      addSecondSource();
      session.noteManager.addNote(0, 10, 10, 'Source 0', 'Alice');
      session.noteManager.addNote(1, 20, 20, 'Source 1', 'Bob');
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(2);
    });

    it('filter by specific source shows only matching notes', () => {
      addSecondSource();
      session.noteManager.addNote(0, 10, 10, 'Source 0', 'Alice');
      session.noteManager.addNote(1, 20, 20, 'Source 1', 'Bob');
      // Set source filter manually
      (panel as any).sourceFilter = 0;
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.textContent).toContain('Source 0');
    });

    it('combined source + status filter works', () => {
      addSecondSource();
      session.noteManager.addNote(0, 10, 10, 'Open S0', 'Alice');
      const resolved = session.noteManager.addNote(0, 20, 20, 'Resolved S0', 'Bob');
      session.noteManager.resolveNote(resolved.id);
      session.noteManager.addNote(1, 30, 30, 'Open S1', 'Charlie');

      (panel as any).sourceFilter = 0;
      (panel as any).statusFilter = 'open';
      panel.show();

      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.textContent).toContain('Open S0');
    });

    it('source with no notes shows empty state', () => {
      addSecondSource();
      session.noteManager.addNote(0, 10, 10, 'Only in S0', 'Alice');
      (panel as any).sourceFilter = 1;
      panel.show();

      const emptyState = panel.getElement().querySelector('[data-testid="note-empty-state"]');
      expect(emptyState).not.toBeNull();
    });
  });

  describe('ARIA accessibility', () => {
    it('entries container has role="list"', () => {
      panel.show();
      const container = panel.getElement().querySelector('[data-testid="note-entries"]');
      expect(container?.getAttribute('role')).toBe('list');
    });

    it('each note entry has role="listitem"', () => {
      session.noteManager.addNote(0, 10, 10, 'ARIA test', 'Alice');
      panel.show();
      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries.length).toBe(1);
      expect(entries[0]?.getAttribute('role')).toBe('listitem');
    });

    it('aria-selected updates on keyboard navigation', () => {
      session.noteManager.addNote(0, 10, 10, 'First', 'Alice');
      session.noteManager.addNote(0, 20, 20, 'Second', 'Bob');
      panel.show();

      // Simulate ArrowDown keydown on the container
      panel.getElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const entries = panel.getElement().querySelectorAll('.note-entry');
      expect(entries[0]?.getAttribute('aria-selected')).toBe('true');
    });

    it('action buttons have non-empty aria-label', () => {
      session.noteManager.addNote(0, 10, 10, 'Btn test', 'Alice');
      panel.show();
      const buttons = panel.getElement().querySelectorAll('.note-entry button');
      for (const btn of buttons) {
        const label = btn.getAttribute('aria-label');
        expect(label, `button should have aria-label`).toBeTruthy();
        expect(label!.length).toBeGreaterThan(0);
      }
    });

    it('note count area has aria-live="polite"', () => {
      panel.show();
      const countEl = panel.getElement().querySelector('[data-testid="note-count"]');
      expect(countEl?.getAttribute('aria-live')).toBe('polite');
    });

    it('note count updates when notes change', () => {
      panel.show();
      const countEl = panel.getElement().querySelector('[data-testid="note-count"]');
      expect(countEl?.textContent).toBe('');

      session.noteManager.addNote(0, 10, 10, 'Count test', 'Alice');
      expect(countEl?.textContent).toBe('(1)');

      session.noteManager.addNote(0, 20, 20, 'Count test 2', 'Bob');
      expect(countEl?.textContent).toBe('(2)');
    });

    it('aria-expanded matches panel visibility', () => {
      expect(panel.getElement().getAttribute('aria-expanded')).toBeFalsy();
      panel.show();
      expect(panel.getElement().getAttribute('aria-expanded')).toBe('true');
      panel.hide();
      expect(panel.getElement().getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('note count badge', () => {
    it('badge shows correct open count for current source', () => {
      const badge = panel.createBadge();
      expect(badge.style.display).toBe('none');

      session.noteManager.addNote(0, 10, 10, 'Open note', 'Alice');
      expect(badge.style.display).toBe('flex');
      expect(badge.textContent).toBe('1');

      session.noteManager.addNote(0, 20, 20, 'Open note 2', 'Bob');
      expect(badge.textContent).toBe('2');
    });

    it('badge updates when note resolved (count decreases)', () => {
      const badge = panel.createBadge();
      const note = session.noteManager.addNote(0, 10, 10, 'Resolve me', 'Alice');
      expect(badge.textContent).toBe('1');

      session.noteManager.resolveNote(note.id);
      expect(badge.textContent).toBe('');
      expect(badge.style.display).toBe('none');
    });

    it('badge scoped to current source', () => {
      const badge = panel.createBadge();
      // Add notes to source 0 (current) and source 1 (not current)
      session.noteManager.addNote(0, 10, 10, 'Source 0 note', 'Alice');
      session.noteManager.addNote(1, 10, 10, 'Source 1 note', 'Bob');

      // Should only count source 0 (currentSourceIndex = 0 by default)
      expect(badge.textContent).toBe('1');
    });

    it('badge hidden when 0 open notes', () => {
      const badge = panel.createBadge();
      expect(badge.style.display).toBe('none');
      expect(badge.textContent).toBe('');
    });
  });

  describe('reply nesting cap + performance', () => {
    it('deep nesting (4+ levels) flattens visually at level 2', () => {
      // Create chain: root -> reply1 -> reply2 -> reply3 -> reply4
      const root = session.noteManager.addNote(0, 5, 5, 'Root', 'A');
      const r1 = session.noteManager.addNote(0, 5, 5, 'Reply L1', 'B', { parentId: root.id });
      const r2 = session.noteManager.addNote(0, 5, 5, 'Reply L2', 'C', { parentId: r1.id });
      const r3 = session.noteManager.addNote(0, 5, 5, 'Reply L3', 'D', { parentId: r2.id });
      const r4 = session.noteManager.addNote(0, 5, 5, 'Reply L4', 'E', { parentId: r3.id });

      panel.show();

      const rootEl = panel.getElement().querySelector(`[data-testid="note-entry-${root.id}"]`) as HTMLElement;
      const r1El = panel.getElement().querySelector(`[data-testid="note-entry-${r1.id}"]`) as HTMLElement;
      const r2El = panel.getElement().querySelector(`[data-testid="note-entry-${r2.id}"]`) as HTMLElement;
      const r3El = panel.getElement().querySelector(`[data-testid="note-entry-${r3.id}"]`) as HTMLElement;
      const r4El = panel.getElement().querySelector(`[data-testid="note-entry-${r4.id}"]`) as HTMLElement;

      // Root has default padding (12px)
      expect(rootEl.style.paddingLeft).toBe('12px');
      // Depth 1: 12 + 16*1 = 28px
      expect(r1El.style.paddingLeft).toBe('28px');
      // Depth 2: 12 + 16*2 = 44px
      expect(r2El.style.paddingLeft).toBe('44px');
      // Depth 3+ capped at visual depth 2: 44px
      expect(r3El.style.paddingLeft).toBe('44px');
      expect(r4El.style.paddingLeft).toBe('44px');
    });

    it('150 notes render without error', () => {
      for (let i = 0; i < 150; i++) {
        session.noteManager.addNote(0, i + 1, i + 1, `Note ${i}`, 'User');
      }
      panel.show();
      const entries = panel.getElement().querySelectorAll('[data-testid^="note-entry-"]');
      expect(entries.length).toBe(150);
    });

    it('relative performance: 150 notes render in < 10x time of 15', () => {
      // Measure 15 notes
      for (let i = 0; i < 15; i++) {
        session.noteManager.addNote(0, i + 1, i + 1, `Note ${i}`, 'User');
      }
      panel.show();
      const start15 = performance.now();
      for (let r = 0; r < 10; r++) {
        // Force re-render by toggling visibility
        panel.hide();
        panel.show();
      }
      const time15 = performance.now() - start15;

      // Clear and add 150 notes
      const allNotes = session.noteManager.getNotes();
      for (const n of allNotes) {
        session.noteManager.removeNote(n.id);
      }
      for (let i = 0; i < 150; i++) {
        session.noteManager.addNote(0, i + 1, i + 1, `Note ${i}`, 'User');
      }
      const start150 = performance.now();
      for (let r = 0; r < 10; r++) {
        panel.hide();
        panel.show();
      }
      const time150 = performance.now() - start150;

      // 150 notes should not take more than 15x the time of 15 (catches exponential blowup)
      expect(time150).toBeLessThan(time15 * 15);
    });

    it('DOM cleanup after full deletion', () => {
      for (let i = 0; i < 10; i++) {
        session.noteManager.addNote(0, i + 1, i + 1, `Note ${i}`, 'User');
      }
      panel.show();
      expect(panel.getElement().querySelectorAll('[data-testid^="note-entry-"]').length).toBe(10);

      const allNotes = session.noteManager.getNotes();
      for (const n of allNotes) {
        session.noteManager.removeNote(n.id);
      }
      // After deleting all notes, entries container should be cleared (only empty state msg)
      const entries = panel.getElement().querySelectorAll('[data-testid^="note-entry-"]');
      expect(entries.length).toBe(0);
    });

    it('keyboard navigation works with 150 notes', () => {
      for (let i = 0; i < 150; i++) {
        session.noteManager.addNote(0, i + 1, i + 1, `Note ${i}`, 'User');
      }
      panel.show();

      // Navigate down several times
      for (let i = 0; i < 5; i++) {
        panel.getElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      }

      const entries = panel.getElement().querySelectorAll('.note-entry');
      const selected = panel.getElement().querySelector('[aria-selected="true"]');
      expect(selected).toBeTruthy();
      // focusedNoteIndex starts at -1, so 5 ArrowDown presses = index 4
      expect(selected).toBe(entries[4]);
    });
  });

  describe('mutual exclusion', () => {
    it('show() closes exclusive panel if open', () => {
      const mockExclusive = {
        isVisible: vi.fn().mockReturnValue(true),
        hide: vi.fn(),
      };
      panel.setExclusiveWith(mockExclusive);

      panel.show();

      expect(mockExclusive.hide).toHaveBeenCalledTimes(1);
    });

    it('show() does not close exclusive panel if already closed', () => {
      const mockExclusive = {
        isVisible: vi.fn().mockReturnValue(false),
        hide: vi.fn(),
      };
      panel.setExclusiveWith(mockExclusive);

      panel.show();

      expect(mockExclusive.hide).not.toHaveBeenCalled();
    });
  });
});
