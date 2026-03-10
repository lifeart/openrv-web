/**
 * Note/Comment status values
 */
export type NoteStatus = 'open' | 'resolved' | 'wontfix';

const VALID_STATUSES: ReadonlySet<string> = new Set<NoteStatus>(['open', 'resolved', 'wontfix']);

/**
 * A note/comment attached to a frame range on a specific media source
 */
export interface Note {
  id: string; // crypto.randomUUID()
  sourceIndex: number; // Which media source
  frameStart: number; // Start frame (inclusive)
  frameEnd: number; // End frame (inclusive)
  text: string;
  author: string;
  createdAt: string; // ISO 8601
  modifiedAt: string; // ISO 8601
  status: NoteStatus;
  parentId: string | null; // null = top-level, string = reply
  color: string; // Hex color (default '#fbbf24')
}

/**
 * Result of a fromSerializable import operation.
 */
export interface ImportResult {
  imported: number;
  rejected: number;
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
    options?: { parentId?: string; color?: string; createdAt?: string; status?: NoteStatus },
  ): Note {
    const now = new Date().toISOString();
    const createdAt = options?.createdAt ?? now;
    const note: Note = {
      id: crypto.randomUUID(),
      sourceIndex,
      frameStart,
      frameEnd,
      text,
      author,
      createdAt,
      modifiedAt: now,
      status: options?.status ?? 'open',
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
    return Array.from(this._notes.values()).map((n) => ({ ...n }));
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
    return Array.from(this._notes.values()).map((n) => ({ ...n }));
  }

  /**
   * Validate and sanitize a single note entry from external data.
   * Returns a valid Note or null if required fields are missing/invalid.
   */
  private validateNoteEntry(entry: unknown): Note | null {
    if (typeof entry !== 'object' || entry === null) return null;
    const raw = entry as Record<string, unknown>;

    // Required fields
    if (typeof raw.frameStart !== 'number' || !Number.isFinite(raw.frameStart)) return null;
    if (typeof raw.frameEnd !== 'number' || !Number.isFinite(raw.frameEnd)) return null;
    if (typeof raw.text !== 'string') return null;

    const now = new Date().toISOString();
    const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : crypto.randomUUID();
    const sourceIndex = typeof raw.sourceIndex === 'number' && Number.isFinite(raw.sourceIndex) ? raw.sourceIndex : 0;
    const author = typeof raw.author === 'string' ? raw.author : '';
    const status: NoteStatus =
      typeof raw.status === 'string' && VALID_STATUSES.has(raw.status) ? (raw.status as NoteStatus) : 'open';
    const createdAt = typeof raw.createdAt === 'string' && raw.createdAt.length > 0 ? raw.createdAt : now;
    const modifiedAt = typeof raw.modifiedAt === 'string' && raw.modifiedAt.length > 0 ? raw.modifiedAt : now;
    const parentId = typeof raw.parentId === 'string' ? raw.parentId : null;
    const color = typeof raw.color === 'string' && raw.color.length > 0 ? raw.color : '#fbbf24';

    return {
      id,
      sourceIndex,
      frameStart: raw.frameStart as number,
      frameEnd: raw.frameEnd as number,
      text: raw.text as string,
      author,
      createdAt,
      modifiedAt,
      status,
      parentId,
      color,
    };
  }

  /**
   * Restore notes from a serialized array (for load/import).
   * Validates each entry — invalid entries are silently dropped.
   * Returns a summary of how many notes were imported vs rejected.
   */
  fromSerializable(notes: unknown[]): ImportResult {
    this._notes.clear();
    let imported = 0;
    let rejected = 0;
    for (const entry of notes) {
      const validated = this.validateNoteEntry(entry);
      if (validated) {
        this._notes.set(validated.id, validated);
        imported++;
      } else {
        rejected++;
      }
    }
    this.notifyChange();
    return { imported, rejected };
  }

  dispose(): void {
    this._notes.clear();
    this._callbacks = null;
  }
}
