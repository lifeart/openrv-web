/**
 * Note/Comment status values
 */
export type NoteStatus = 'open' | 'resolved' | 'wontfix';

/**
 * A note/comment attached to a frame range on a specific media source
 */
export interface Note {
  id: string;              // crypto.randomUUID()
  sourceIndex: number;     // Which media source
  frameStart: number;      // Start frame (inclusive)
  frameEnd: number;        // End frame (inclusive)
  text: string;
  author: string;
  createdAt: string;       // ISO 8601
  modifiedAt: string;      // ISO 8601
  status: NoteStatus;
  parentId: string | null; // null = top-level, string = reply
  color: string;           // Hex color (default '#fbbf24')
}

/**
 * Callback interface for NoteManager to notify Session of changes
 * without importing Session (avoids circular deps).
 */
export interface NoteManagerCallbacks {
  onNotesChanged(): void;
}

/**
 * NoteManager owns note/comment state and operations:
 * - Adding, removing, updating notes
 * - Threaded replies (parentId)
 * - Querying notes by frame range and source
 * - Serialization for save/load
 *
 * State is owned by this manager. Session delegates to it.
 */
export class NoteManager {
  private _notes = new Map<string, Note>();
  private _callbacks: NoteManagerCallbacks | null = null;

  /**
   * Set the callbacks object. Called once by Session after construction.
   */
  setCallbacks(callbacks: NoteManagerCallbacks): void {
    this._callbacks = callbacks;
  }

  private notifyChange(): void {
    this._callbacks?.onNotesChanged();
  }

  // ---- CRUD ----

  /**
   * Add a new note attached to a frame range on a source.
   * Returns the created note.
   */
  addNote(
    sourceIndex: number,
    frameStart: number,
    frameEnd: number,
    text: string,
    author: string,
    options?: { parentId?: string; color?: string },
  ): Note {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      sourceIndex,
      frameStart,
      frameEnd,
      text,
      author,
      createdAt: now,
      modifiedAt: now,
      status: 'open',
      parentId: options?.parentId ?? null,
      color: options?.color ?? '#fbbf24',
    };
    this._notes.set(note.id, note);
    this.notifyChange();
    return { ...note };
  }

  /**
   * Update an existing note's text, status, or color.
   * Returns the updated note copy, or null if not found.
   */
  updateNote(noteId: string, updates: Partial<Pick<Note, 'text' | 'status' | 'color'>>): Note | null {
    const note = this._notes.get(noteId);
    if (!note) return null;

    if (updates.text !== undefined) note.text = updates.text;
    if (updates.status !== undefined) note.status = updates.status;
    if (updates.color !== undefined) note.color = updates.color;
    note.modifiedAt = new Date().toISOString();

    this.notifyChange();
    return { ...note };
  }

  /**
   * Convenience: resolve a note (set status to 'resolved').
   */
  resolveNote(noteId: string): Note | null {
    return this.updateNote(noteId, { status: 'resolved' });
  }

  /**
   * Remove a note and all its replies (cascade).
   * Returns true if the note was found and removed.
   */
  removeNote(noteId: string): boolean {
    if (!this._notes.has(noteId)) return false;

    // Collect all reply IDs recursively
    const toRemove = new Set<string>();
    const collectReplies = (parentId: string): void => {
      toRemove.add(parentId);
      for (const [id, note] of this._notes) {
        if (note.parentId === parentId && !toRemove.has(id)) {
          collectReplies(id);
        }
      }
    };
    collectReplies(noteId);

    for (const id of toRemove) {
      this._notes.delete(id);
    }

    this.notifyChange();
    return true;
  }

  // ---- Queries ----

  /**
   * Get a single note by ID
   */
  getNote(noteId: string): Note | undefined {
    const note = this._notes.get(noteId);
    return note ? { ...note } : undefined;
  }

  /**
   * Get all notes as an array
   */
  getNotes(): Note[] {
    return Array.from(this._notes.values()).map(n => ({ ...n }));
  }

  /**
   * Get notes that overlap a specific frame on a specific source
   */
  getNotesForFrame(sourceIndex: number, frame: number): Note[] {
    const result: Note[] = [];
    for (const note of this._notes.values()) {
      if (note.sourceIndex === sourceIndex && frame >= note.frameStart && frame <= note.frameEnd) {
        result.push({ ...note });
      }
    }
    return result;
  }

  /**
   * Get all notes for a specific source
   */
  getNotesForSource(sourceIndex: number): Note[] {
    const result: Note[] = [];
    for (const note of this._notes.values()) {
      if (note.sourceIndex === sourceIndex) {
        result.push({ ...note });
      }
    }
    return result;
  }

  /**
   * Get all direct replies to a note
   */
  getReplies(parentId: string): Note[] {
    const result: Note[] = [];
    for (const note of this._notes.values()) {
      if (note.parentId === parentId) {
        result.push({ ...note });
      }
    }
    return result;
  }

  // ---- Navigation ----

  /**
   * Get the frame of the next note after currentFrame for a given source.
   * Returns the frame number, or currentFrame if no next note exists.
   */
  getNextNoteFrame(sourceIndex: number, currentFrame: number): number {
    let best = Infinity;
    for (const note of this._notes.values()) {
      if (note.sourceIndex === sourceIndex && note.parentId === null && note.frameStart > currentFrame) {
        if (note.frameStart < best) best = note.frameStart;
      }
    }
    return best === Infinity ? currentFrame : best;
  }

  /**
   * Get the frame of the previous note before currentFrame for a given source.
   * Returns the frame number, or currentFrame if no previous note exists.
   */
  getPreviousNoteFrame(sourceIndex: number, currentFrame: number): number {
    let best = -Infinity;
    for (const note of this._notes.values()) {
      if (note.sourceIndex === sourceIndex && note.parentId === null && note.frameStart < currentFrame) {
        if (note.frameStart > best) best = note.frameStart;
      }
    }
    return best === -Infinity ? currentFrame : best;
  }

  // ---- Serialization ----

  /**
   * Import a note with a specific ID (for network sync).
   * Skips if a note with the same ID already exists.
   */
  importNote(note: Note): void {
    if (this._notes.has(note.id)) return;
    this._notes.set(note.id, { ...note });
    this.notifyChange();
  }

  /**
   * Produce a JSON-safe array of all notes (for save/export)
   */
  toSerializable(): Note[] {
    return Array.from(this._notes.values()).map(n => ({ ...n }));
  }

  /**
   * Restore notes from a serialized array (for load/import)
   */
  fromSerializable(notes: Note[]): void {
    this._notes.clear();
    for (const note of notes) {
      this._notes.set(note.id, { ...note });
    }
    this.notifyChange();
  }

  dispose(): void {
    this._notes.clear();
    this._callbacks = null;
  }
}
