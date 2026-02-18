import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoteManager, type Note } from './NoteManager';

describe('NoteManager', () => {
  let manager: NoteManager;
  let onNotesChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new NoteManager();
    onNotesChanged = vi.fn();
    manager.setCallbacks({ onNotesChanged });
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('addNote', () => {
    it('NOTE-001: creates note with correct fields and UUID', () => {
      const note = manager.addNote(0, 10, 20, 'Fix edge artifact', 'Alice');
      expect(note.id).toBeTruthy();
      expect(note.sourceIndex).toBe(0);
      expect(note.frameStart).toBe(10);
      expect(note.frameEnd).toBe(20);
      expect(note.text).toBe('Fix edge artifact');
      expect(note.author).toBe('Alice');
      expect(note.status).toBe('open');
      expect(note.parentId).toBeNull();
      expect(note.color).toBe('#fbbf24');
      expect(note.createdAt).toBeTruthy();
      expect(note.modifiedAt).toBeTruthy();
    });

    it('NOTE-002: triggers onNotesChanged callback', () => {
      manager.addNote(0, 10, 20, 'Test', 'Alice');
      expect(onNotesChanged).toHaveBeenCalledOnce();
    });

    it('NOTE-010: with parentId creates threaded reply', () => {
      const parent = manager.addNote(0, 10, 10, 'Parent note', 'Alice');
      const reply = manager.addNote(0, 10, 10, 'Reply text', 'Bob', { parentId: parent.id });
      expect(reply.parentId).toBe(parent.id);
    });

    it('creates note with custom color', () => {
      const note = manager.addNote(0, 1, 1, 'Red note', 'Alice', { color: '#ff0000' });
      expect(note.color).toBe('#ff0000');
    });

    it('returns a copy, not internal reference', () => {
      const note = manager.addNote(0, 1, 1, 'Test', 'Alice');
      note.text = 'mutated';
      expect(manager.getNote(note.id)!.text).toBe('Test');
    });
  });

  describe('getNotesForFrame', () => {
    it('NOTE-003: returns notes overlapping given frame', () => {
      manager.addNote(0, 10, 20, 'Note A', 'Alice');
      manager.addNote(0, 15, 25, 'Note B', 'Bob');
      const notes = manager.getNotesForFrame(0, 17);
      expect(notes.length).toBe(2);
    });

    it('NOTE-004: excludes notes for different sourceIndex', () => {
      manager.addNote(0, 10, 20, 'Source 0', 'Alice');
      manager.addNote(1, 10, 20, 'Source 1', 'Bob');
      const notes = manager.getNotesForFrame(0, 15);
      expect(notes.length).toBe(1);
      expect(notes[0]!.text).toBe('Source 0');
    });

    it('includes notes at exact boundary frames', () => {
      manager.addNote(0, 10, 20, 'Boundary test', 'Alice');
      expect(manager.getNotesForFrame(0, 10).length).toBe(1);
      expect(manager.getNotesForFrame(0, 20).length).toBe(1);
      expect(manager.getNotesForFrame(0, 9).length).toBe(0);
      expect(manager.getNotesForFrame(0, 21).length).toBe(0);
    });
  });

  describe('getNotesForSource', () => {
    it('NOTE-005: returns all notes for source', () => {
      manager.addNote(0, 1, 5, 'A', 'Alice');
      manager.addNote(0, 10, 15, 'B', 'Bob');
      manager.addNote(1, 1, 5, 'C', 'Charlie');
      const notes = manager.getNotesForSource(0);
      expect(notes.length).toBe(2);
    });
  });

  describe('updateNote', () => {
    it('NOTE-006: changes text and modifiedAt', () => {
      const note = manager.addNote(0, 1, 1, 'Original', 'Alice');

      const updated = manager.updateNote(note.id, { text: 'Updated text' });
      expect(updated).not.toBeNull();
      expect(updated!.text).toBe('Updated text');
      expect(updated!.modifiedAt).toBeTruthy();
    });

    it('returns null for non-existent note', () => {
      const result = manager.updateNote('non-existent', { text: 'foo' });
      expect(result).toBeNull();
    });

    it('updates status and color', () => {
      const note = manager.addNote(0, 1, 1, 'Test', 'Alice');
      const updated = manager.updateNote(note.id, { status: 'wontfix', color: '#ff0000' });
      expect(updated!.status).toBe('wontfix');
      expect(updated!.color).toBe('#ff0000');
    });
  });

  describe('resolveNote', () => {
    it('NOTE-007: sets status to resolved', () => {
      const note = manager.addNote(0, 1, 1, 'Open note', 'Alice');
      const resolved = manager.resolveNote(note.id);
      expect(resolved).not.toBeNull();
      expect(resolved!.status).toBe('resolved');
    });

    it('returns null for non-existent note', () => {
      expect(manager.resolveNote('non-existent')).toBeNull();
    });
  });

  describe('removeNote', () => {
    it('NOTE-008: deletes note and triggers callback', () => {
      const note = manager.addNote(0, 1, 1, 'To remove', 'Alice');
      onNotesChanged.mockClear();
      const result = manager.removeNote(note.id);
      expect(result).toBe(true);
      expect(manager.getNote(note.id)).toBeUndefined();
      expect(onNotesChanged).toHaveBeenCalledOnce();
    });

    it('NOTE-009: cascades to replies', () => {
      const parent = manager.addNote(0, 1, 1, 'Parent', 'Alice');
      const reply1 = manager.addNote(0, 1, 1, 'Reply 1', 'Bob', { parentId: parent.id });
      const reply2 = manager.addNote(0, 1, 1, 'Reply to reply', 'Charlie', { parentId: reply1.id });

      manager.removeNote(parent.id);
      expect(manager.getNote(parent.id)).toBeUndefined();
      expect(manager.getNote(reply1.id)).toBeUndefined();
      expect(manager.getNote(reply2.id)).toBeUndefined();
      expect(manager.getNotes().length).toBe(0);
    });

    it('returns false for non-existent note', () => {
      expect(manager.removeNote('non-existent')).toBe(false);
    });
  });

  describe('getReplies', () => {
    it('NOTE-011: returns child notes', () => {
      const parent = manager.addNote(0, 1, 1, 'Parent', 'Alice');
      manager.addNote(0, 1, 1, 'Reply 1', 'Bob', { parentId: parent.id });
      manager.addNote(0, 1, 1, 'Reply 2', 'Charlie', { parentId: parent.id });
      manager.addNote(0, 1, 1, 'Unrelated', 'Dave');

      const replies = manager.getReplies(parent.id);
      expect(replies.length).toBe(2);
      expect(replies.every(r => r.parentId === parent.id)).toBe(true);
    });

    it('returns empty array for note with no replies', () => {
      const note = manager.addNote(0, 1, 1, 'Solo note', 'Alice');
      expect(manager.getReplies(note.id).length).toBe(0);
    });
  });

  describe('serialization', () => {
    it('NOTE-012: toSerializable produces JSON-safe array', () => {
      manager.addNote(0, 1, 5, 'A', 'Alice');
      manager.addNote(0, 10, 15, 'B', 'Bob');
      const serialized = manager.toSerializable();
      expect(serialized.length).toBe(2);
      // Should be JSON-safe
      const json = JSON.stringify(serialized);
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(2);
    });

    it('NOTE-013: fromSerializable restores notes from array', () => {
      const note1 = manager.addNote(0, 1, 5, 'A', 'Alice');
      const note2 = manager.addNote(0, 10, 15, 'B', 'Bob');
      const serialized = manager.toSerializable();

      // Create a fresh manager and restore
      const manager2 = new NoteManager();
      manager2.fromSerializable(serialized);
      expect(manager2.getNotes().length).toBe(2);
      expect(manager2.getNote(note1.id)!.text).toBe('A');
      expect(manager2.getNote(note2.id)!.text).toBe('B');
      manager2.dispose();
    });

    it('NOTE-014: fromSerializable triggers callback', () => {
      const serialized: Note[] = [{
        id: 'test-id',
        sourceIndex: 0,
        frameStart: 1,
        frameEnd: 5,
        text: 'Restored note',
        author: 'Alice',
        createdAt: '2026-01-01T00:00:00Z',
        modifiedAt: '2026-01-01T00:00:00Z',
        status: 'open',
        parentId: null,
        color: '#fbbf24',
      }];
      onNotesChanged.mockClear();
      manager.fromSerializable(serialized);
      expect(onNotesChanged).toHaveBeenCalledOnce();
    });

    it('NOTE-015: notes survive serialize → deserialize round-trip', () => {
      const parent = manager.addNote(0, 10, 20, 'Parent note', 'Alice');
      manager.addNote(0, 10, 10, 'Reply', 'Bob', { parentId: parent.id, color: '#ff0000' });
      manager.resolveNote(parent.id);

      const serialized = manager.toSerializable();
      const json = JSON.stringify(serialized);
      const restored = JSON.parse(json) as Note[];

      const manager2 = new NoteManager();
      manager2.fromSerializable(restored);

      const allNotes = manager2.getNotes();
      expect(allNotes.length).toBe(2);

      const restoredParent = manager2.getNote(parent.id)!;
      expect(restoredParent.status).toBe('resolved');
      expect(restoredParent.text).toBe('Parent note');

      const replies = manager2.getReplies(parent.id);
      expect(replies.length).toBe(1);
      expect(replies[0]!.color).toBe('#ff0000');

      manager2.dispose();
    });

    it('fromSerializable clears existing notes', () => {
      manager.addNote(0, 1, 1, 'Old note', 'Alice');
      manager.fromSerializable([]);
      expect(manager.getNotes().length).toBe(0);
    });
  });

  describe('getNotes', () => {
    it('returns all notes as copies', () => {
      manager.addNote(0, 1, 1, 'A', 'Alice');
      manager.addNote(1, 2, 3, 'B', 'Bob');
      const notes = manager.getNotes();
      expect(notes.length).toBe(2);
      // Mutation safety
      notes[0]!.text = 'mutated';
      expect(manager.getNotes()[0]!.text).not.toBe('mutated');
    });
  });

  describe('dispose', () => {
    it('NOTE-016: dispose clears callbacks and notes', () => {
      manager.addNote(0, 1, 1, 'Before dispose', 'Alice');
      onNotesChanged.mockClear();
      manager.dispose();
      // Callbacks should not fire after dispose
      manager.addNote(0, 1, 1, 'After dispose', 'Alice');
      expect(onNotesChanged).not.toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('works without callbacks set', () => {
      const mgr = new NoteManager();
      mgr.addNote(0, 1, 1, 'Test', 'Alice');
      mgr.dispose();
    });

    it('updateNote triggers onNotesChanged', () => {
      const note = manager.addNote(0, 1, 1, 'Test', 'Alice');
      onNotesChanged.mockClear();
      manager.updateNote(note.id, { text: 'Updated' });
      expect(onNotesChanged).toHaveBeenCalledOnce();
    });

    it('resolveNote triggers onNotesChanged', () => {
      const note = manager.addNote(0, 1, 1, 'Test', 'Alice');
      onNotesChanged.mockClear();
      manager.resolveNote(note.id);
      expect(onNotesChanged).toHaveBeenCalledOnce();
    });
  });

  describe('edge cases', () => {
    it('getNote returns undefined for non-existent ID', () => {
      expect(manager.getNote('non-existent')).toBeUndefined();
    });

    it('getNotesForFrame returns empty array on empty manager', () => {
      expect(manager.getNotesForFrame(0, 1)).toEqual([]);
    });

    it('getNotesForSource returns empty array on empty manager', () => {
      expect(manager.getNotesForSource(0)).toEqual([]);
    });

    it('getReplies returns empty array for non-existent parentId', () => {
      expect(manager.getReplies('non-existent')).toEqual([]);
    });

    it('toSerializable returns empty array on empty manager', () => {
      expect(manager.toSerializable()).toEqual([]);
    });

    it('updateNote preserves createdAt', () => {
      const note = manager.addNote(0, 1, 1, 'Test', 'Alice');
      const updated = manager.updateNote(note.id, { text: 'Changed' })!;
      expect(updated.createdAt).toBe(note.createdAt);
    });

    it('addNote with non-existent parentId stores the note', () => {
      const reply = manager.addNote(0, 1, 1, 'Orphan', 'Bob', { parentId: 'fake-id' });
      expect(reply.parentId).toBe('fake-id');
      expect(manager.getReplies('fake-id').length).toBe(1);
    });

    it('removeNote cascades through 4-level deep chain', () => {
      const l1 = manager.addNote(0, 1, 1, 'L1', 'A');
      const l2 = manager.addNote(0, 1, 1, 'L2', 'B', { parentId: l1.id });
      const l3 = manager.addNote(0, 1, 1, 'L3', 'C', { parentId: l2.id });
      const l4 = manager.addNote(0, 1, 1, 'L4', 'D', { parentId: l3.id });
      manager.removeNote(l1.id);
      expect(manager.getNotes().length).toBe(0);
      expect(manager.getNote(l4.id)).toBeUndefined();
    });
  });
});
