/**
 * NotePanel - Right-panel note list UI for per-source, per-frame-range notes
 *
 * Features:
 * - List of all notes grouped by thread (parent + replies)
 * - Click to navigate to note frame
 * - Filter by status (all / open / resolved)
 * - Inline editing of note text
 * - Resolve / delete notes
 * - Add replies to existing notes
 * - Add new note at current frame
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { Session } from '../../core/session/Session';
import { type Note, type NoteStatus } from '../../core/session/NoteManager';
import { getIconSvg } from './shared/Icons';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import { DisposableSubscriptionManager } from '../../utils/DisposableSubscriptionManager';
import { getCorePreferencesManager } from '../../core/PreferencesManager';
import { AriaAnnouncer } from '../a11y/AriaAnnouncer';
import { showAlert } from './shared/Modal';

export interface NotePanelEvents extends EventMap {
  visibilityChanged: boolean;
  noteSelected: { noteId: string; frame: number };
}

type StatusFilter = 'all' | NoteStatus;

/** Interface for panels that support mutual exclusion */
export interface ExclusivePanelRef {
  isVisible(): boolean;
  hide(): void;
}

export class NotePanel extends EventEmitter<NotePanelEvents> {
  private container: HTMLElement;
  private session: Session;
  private visible = false;
  private entriesContainer: HTMLElement;
  private headerElement: HTMLElement;
  private statusFilter: StatusFilter = 'all';
  private sourceFilter: number | 'all' = 'all';
  private editingNoteId: string | null = null;
  private replyingToNoteId: string | null = null;
  private lastHighlightedFrame: number | null = null;
  private focusedNoteIndex = -1;
  private filterContainer: HTMLElement;
  private exclusivePanel: ExclusivePanelRef | null = null;
  private announcer: AriaAnnouncer;
  private noteCountEl!: HTMLElement;
  private badgeElement: HTMLElement | null = null;

  // Bound event handlers for cleanup
  private boundOnNotesChanged: () => void;
  private boundOnFrameChanged: () => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private subs = new DisposableSubscriptionManager();
  private boundOnSourceLoaded: (() => void) | null = null;

  constructor(session: Session) {
    super();
    this.session = session;
    this.announcer = new AriaAnnouncer();

    // Bind handlers
    this.boundOnNotesChanged = () => { this.render(); this.updateBadge(); };
    this.boundOnFrameChanged = () => this.updateHighlight();
    this.boundOnKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

    // Main container
    this.container = document.createElement('div');
    this.container.className = 'note-panel';
    this.container.dataset.testid = 'note-panel';
    this.container.style.cssText = `
      position: absolute;
      right: 10px;
      top: 60px;
      width: 340px;
      max-height: 500px;
      background: var(--overlay-bg);
      border: 1px solid var(--overlay-border);
      border-radius: 8px;
      display: none;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: var(--text-primary);
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    `;

    // Header
    this.headerElement = document.createElement('div');
    this.headerElement.className = 'note-panel-header';
    this.headerElement.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--overlay-border);
      background: var(--bg-secondary);
    `;

    const titleArea = document.createElement('div');
    titleArea.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const title = document.createElement('span');
    title.textContent = 'Notes';
    title.style.cssText = 'font-weight: 600; font-size: 13px;';
    titleArea.appendChild(title);

    this.noteCountEl = document.createElement('span');
    this.noteCountEl.dataset.testid = 'note-count';
    this.noteCountEl.setAttribute('aria-live', 'polite');
    this.noteCountEl.style.cssText = 'font-size: 11px; color: var(--text-muted);';
    titleArea.appendChild(this.noteCountEl);

    const headerButtons = document.createElement('div');
    headerButtons.style.cssText = 'display: flex; gap: 8px;';

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.title = 'Add note at current frame';
    addBtn.setAttribute('aria-label', 'Add note at current frame');
    addBtn.dataset.testid = 'note-add-btn';
    addBtn.style.cssText = `
      background: rgba(var(--accent-primary-rgb), 0.15);
      border: 1px solid var(--success);
      color: var(--success);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;
    addBtn.addEventListener('click', () => this.addNoteAtCurrentFrame());

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close notes panel');
    closeBtn.dataset.testid = 'note-close-btn';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    `;
    closeBtn.addEventListener('click', () => this.hide());

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Export notes to JSON file';
    exportBtn.dataset.testid = 'note-export-btn';
    exportBtn.style.cssText = `
      background: rgba(var(--accent-primary-rgb), 0.15);
      border: 1px solid var(--accent-primary);
      color: var(--accent-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;
    exportBtn.addEventListener('click', () => this.exportNotes());

    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import';
    importBtn.title = 'Import notes from JSON file';
    importBtn.dataset.testid = 'note-import-btn';
    importBtn.style.cssText = `
      background: rgba(var(--accent-primary-rgb), 0.15);
      border: 1px solid var(--accent-primary);
      color: var(--accent-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;
    importBtn.addEventListener('click', () => this.importNotes());

    headerButtons.appendChild(addBtn);
    headerButtons.appendChild(exportBtn);
    headerButtons.appendChild(importBtn);
    headerButtons.appendChild(closeBtn);
    this.headerElement.appendChild(titleArea);
    this.headerElement.appendChild(headerButtons);

    // Filter bar
    this.filterContainer = document.createElement('div');
    this.filterContainer.className = 'note-filter-bar';
    this.filterContainer.dataset.testid = 'note-filter-bar';
    this.filterContainer.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--overlay-border);
      background: var(--bg-secondary);
    `;
    this.buildFilterBar();

    // Entries container
    this.entriesContainer = document.createElement('div');
    this.entriesContainer.className = 'note-entries';
    this.entriesContainer.dataset.testid = 'note-entries';
    this.entriesContainer.setAttribute('role', 'list');
    this.entriesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    `;

    this.container.appendChild(this.headerElement);
    this.container.appendChild(this.filterContainer);
    this.container.appendChild(this.entriesContainer);

    // Subscribe to session events
    this.session.on('notesChanged', this.boundOnNotesChanged);
    this.session.on('frameChanged', this.boundOnFrameChanged);

    // Update source dropdown when sources change
    this.boundOnSourceLoaded = () => { this.buildFilterBar(); this.updateBadge(); };
    this.session.on('sourceLoaded', this.boundOnSourceLoaded);

    // Keyboard navigation
    this.container.setAttribute('tabindex', '0');
    this.container.addEventListener('keydown', this.boundOnKeyDown);

    // Theme changes
    this.subs.add(getThemeManager().on('themeChanged', () => this.render()));

    // Initial render
    this.render();
  }

  getElement(): HTMLElement {
    return this.container;
  }

  /** Register another panel for mutual exclusion - opening this panel will close the other */
  setExclusiveWith(panel: ExclusivePanelRef): void {
    this.exclusivePanel = panel;
  }

  show(): void {
    // Close exclusive panel if it is open
    if (this.exclusivePanel?.isVisible()) {
      this.exclusivePanel.hide();
    }
    this.visible = true;
    this.container.style.display = 'flex';
    this.container.setAttribute('aria-expanded', 'true');
    this.render();
    this.emit('visibilityChanged', true);
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.container.setAttribute('aria-expanded', 'false');
    this.editingNoteId = null;
    this.replyingToNoteId = null;
    this.emit('visibilityChanged', false);
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Create a badge element that shows the count of open notes for the current source.
   * The badge is hidden when the count is 0.
   */
  createBadge(): HTMLElement {
    if (this.badgeElement) return this.badgeElement;

    this.badgeElement = document.createElement('span');
    this.badgeElement.dataset.testid = 'note-count-badge';
    this.badgeElement.style.cssText = `
      display: none;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 8px;
      background: var(--accent-primary);
      color: var(--text-on-accent, #fff);
      font-size: 10px;
      font-weight: 600;
      line-height: 1;
    `;

    this.updateBadge();
    return this.badgeElement;
  }

  private updateBadge(): void {
    if (!this.badgeElement) return;

    const sourceIndex = this.session.currentSourceIndex;
    const notes = this.session.noteManager.getNotesForSource(sourceIndex);
    const openCount = notes.filter(n => n.parentId === null && n.status === 'open').length;

    if (openCount > 0) {
      this.badgeElement.textContent = String(openCount);
      this.badgeElement.style.display = 'flex';
    } else {
      this.badgeElement.textContent = '';
      this.badgeElement.style.display = 'none';
    }
  }

  /**
   * Programmatically add a note at the current frame.
   * Opens the panel and creates a blank note for editing.
   */
  addNoteAtCurrentFrame(): void {
    const frame = this.session.currentFrame;
    const sourceIndex = this.session.currentSourceIndex;
    const note = this.session.noteManager.addNote(
      sourceIndex, frame, frame, '', this.getAuthorName(),
    );
    this.announcer.announce(`Note added at frame ${frame}`);
    // Set editing state – the addNote above already triggered notesChanged → render(),
    // but that render ran with editingNoteId=null. We must re-render with editing mode.
    this.editingNoteId = note.id;
    if (!this.visible) {
      this.show();
    } else {
      this.render();
    }
  }

  // ---- Filter bar ----

  private buildFilterBar(): void {
    this.filterContainer.innerHTML = '';
    const filters: { label: string; value: StatusFilter }[] = [
      { label: 'All', value: 'all' },
      { label: 'Open', value: 'open' },
      { label: 'Resolved', value: 'resolved' },
      { label: "Won't Fix", value: 'wontfix' },
    ];
    for (const f of filters) {
      const btn = document.createElement('button');
      btn.textContent = f.label;
      btn.dataset.testid = `note-filter-${f.value}`;
      btn.dataset.filterValue = f.value;
      const isActive = this.statusFilter === f.value;
      btn.style.cssText = `
        background: ${isActive ? 'var(--accent-primary)' : 'transparent'};
        border: 1px solid ${isActive ? 'var(--accent-primary)' : 'var(--overlay-border)'};
        color: ${isActive ? '#fff' : 'var(--text-muted)'};
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
      `;
      btn.addEventListener('click', () => {
        this.statusFilter = f.value;
        this.buildFilterBar();
        this.render();
      });
      this.filterContainer.appendChild(btn);
    }

    // Source dropdown (only show if multiple sources are loaded)
    const allSources = this.session.allSources;
    if (allSources.length > 1) {
      const spacer = document.createElement('div');
      spacer.style.cssText = 'flex: 1;';
      this.filterContainer.appendChild(spacer);

      const select = document.createElement('select');
      select.dataset.testid = 'note-source-filter';
      select.style.cssText = `
        background: var(--bg-secondary);
        border: 1px solid var(--overlay-border);
        color: var(--text-primary);
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        max-width: 120px;
      `;

      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All Sources';
      select.appendChild(allOption);

      for (let i = 0; i < allSources.length; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = allSources[i]?.name ?? `Source ${i + 1}`;
        select.appendChild(opt);
      }

      select.value = this.sourceFilter === 'all' ? 'all' : String(this.sourceFilter);
      select.addEventListener('change', () => {
        this.sourceFilter = select.value === 'all' ? 'all' : Number(select.value);
        this.render();
      });
      this.filterContainer.appendChild(select);
    }
  }

  // ---- Rendering ----

  private render(): void {
    if (!this.visible) return;

    const allNotes = this.session.noteManager.getNotes();
    // Get only top-level notes (no parentId)
    let topLevel = allNotes.filter(n => n.parentId === null);

    // Apply source filter
    if (this.sourceFilter !== 'all') {
      topLevel = topLevel.filter(n => n.sourceIndex === this.sourceFilter);
    }

    // Apply status filter
    if (this.statusFilter !== 'all') {
      topLevel = topLevel.filter(n => n.status === this.statusFilter);
    }

    // Sort by frameStart ascending, then by createdAt
    topLevel.sort((a, b) => a.frameStart - b.frameStart || a.createdAt.localeCompare(b.createdAt));

    // Update note count display
    const totalTopLevel = allNotes.filter(n => n.parentId === null).length;
    this.noteCountEl.textContent = totalTopLevel > 0 ? `(${totalTopLevel})` : '';

    this.entriesContainer.innerHTML = '';
    this.focusedNoteIndex = -1;

    if (topLevel.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.dataset.testid = 'note-empty-state';
      emptyMsg.style.cssText = `
        padding: 24px 16px;
        text-align: center;
        color: var(--text-muted);
        font-style: italic;
      `;
      emptyMsg.textContent = 'No notes yet. Click "+ Add" to create one.';
      this.entriesContainer.appendChild(emptyMsg);
      return;
    }

    for (const note of topLevel) {
      const entryEl = this.createNoteEntry(note, false);
      this.entriesContainer.appendChild(entryEl);

      // Render replies recursively (depth starts at 1 for direct replies)
      this.renderReplies(note.id, 1);

      // Reply input
      if (this.replyingToNoteId === note.id) {
        const replyInput = this.createReplyInput(note.id);
        this.entriesContainer.appendChild(replyInput);
      }
    }

    // Sync highlight cache with the just-rendered state
    this.lastHighlightedFrame = this.session.currentFrame;
  }

  /**
   * Recursively render replies to a note (supports nested threads).
   * Visual nesting is capped at depth 2 — deeper replies render at the same indentation.
   */
  private renderReplies(parentId: string, depth: number): void {
    const replies = this.session.noteManager.getReplies(parentId);
    replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const reply of replies) {
      // Cap visual depth at 2 levels
      const visualDepth = Math.min(depth, 2);
      const replyEl = this.createNoteEntry(reply, true, visualDepth);
      this.entriesContainer.appendChild(replyEl);
      // Recurse into sub-replies
      this.renderReplies(reply.id, depth + 1);
    }
  }

  private createNoteEntry(note: Note, isReply: boolean, replyDepth = 1): HTMLElement {
    const currentFrame = this.session.currentFrame;
    const isInRange = currentFrame >= note.frameStart && currentFrame <= note.frameEnd;

    const el = document.createElement('div');
    el.className = 'note-entry';
    el.setAttribute('role', 'listitem');
    el.dataset.testid = `note-entry-${note.id}`;
    el.dataset.noteId = note.id;
    el.dataset.frame = String(note.frameStart);
    // Indentation increases with depth: 28px for depth 1, 44px for depth 2+
    const paddingLeft = isReply ? 12 + 16 * replyDepth : 12;
    el.style.cssText = `
      padding: 8px 12px;
      padding-left: ${paddingLeft}px;
      border-bottom: 1px solid var(--overlay-border);
      cursor: pointer;
      transition: background 0.1s;
      ${isInRange ? 'background: rgba(var(--accent-primary-rgb), 0.15);' : ''}
    `;

    // Top row: color indicator + frame info + status badge + action buttons
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px;';

    // Color indicator
    const colorDot = document.createElement('span');
    colorDot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${note.color};
      flex-shrink: 0;
    `;
    topRow.appendChild(colorDot);

    // Frame info
    const frameInfo = document.createElement('span');
    frameInfo.style.cssText = 'font-size: 11px; color: var(--text-muted); flex-shrink: 0;';
    frameInfo.textContent = note.frameStart === note.frameEnd
      ? `F${note.frameStart}`
      : `F${note.frameStart}-${note.frameEnd}`;
    frameInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      this.goToNote(note);
    });
    topRow.appendChild(frameInfo);

    // Status badge
    const statusBadge = document.createElement('span');
    statusBadge.dataset.testid = `note-status-${note.id}`;
    const statusColors: Record<NoteStatus, string> = {
      open: 'var(--warning, #fbbf24)',
      resolved: 'var(--success, #22c55e)',
      wontfix: 'var(--text-muted, #888)',
    };
    statusBadge.style.cssText = `
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: ${statusColors[note.status]};
      color: #000;
      flex-shrink: 0;
    `;
    statusBadge.textContent = note.status;
    topRow.appendChild(statusBadge);

    // Author
    const author = document.createElement('span');
    author.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-left: auto; flex-shrink: 0;';
    author.textContent = note.author;
    topRow.appendChild(author);

    // Action buttons container
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 4px; margin-left: 6px;';

    if (note.status === 'open') {
      // Resolve button
      const resolveBtn = document.createElement('button');
      resolveBtn.dataset.testid = `note-resolve-${note.id}`;
      resolveBtn.innerHTML = getIconSvg('check', 'sm');
      resolveBtn.title = 'Resolve';
      resolveBtn.setAttribute('aria-label', 'Resolve note');
      resolveBtn.style.cssText = `
        background: none; border: none; color: var(--success, #22c55e);
        cursor: pointer; padding: 2px; line-height: 1;
      `;
      resolveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.session.noteManager.resolveNote(note.id);
        this.announcer.announce('Note resolved');
      });
      actions.appendChild(resolveBtn);
    }

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.dataset.testid = `note-edit-${note.id}`;
    editBtn.innerHTML = getIconSvg('pencil', 'sm');
    editBtn.title = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit note');
    editBtn.style.cssText = `
      background: none; border: none; color: var(--text-muted);
      cursor: pointer; padding: 2px; line-height: 1;
    `;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editingNoteId = note.id;
      this.render();
    });
    actions.appendChild(editBtn);

    // Reply button (only for top-level notes)
    if (!isReply) {
      const replyBtn = document.createElement('button');
      replyBtn.dataset.testid = `note-reply-${note.id}`;
      replyBtn.title = 'Reply';
      replyBtn.setAttribute('aria-label', 'Reply to note');
      replyBtn.textContent = '\u21a9';
      replyBtn.style.cssText = `
        background: none; border: none; color: var(--text-muted);
        cursor: pointer; padding: 2px; font-size: 14px; line-height: 1;
      `;
      replyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.replyingToNoteId = note.id;
        this.render();
      });
      actions.appendChild(replyBtn);
    }

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.dataset.testid = `note-delete-${note.id}`;
    deleteBtn.innerHTML = getIconSvg('trash', 'sm');
    deleteBtn.title = 'Delete';
    deleteBtn.setAttribute('aria-label', 'Delete note');
    deleteBtn.style.cssText = `
      background: none; border: none; color: var(--error, #f44);
      cursor: pointer; padding: 2px; line-height: 1;
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.session.noteManager.removeNote(note.id);
      this.announcer.announce('Note deleted');
    });
    actions.appendChild(deleteBtn);

    topRow.appendChild(actions);
    el.appendChild(topRow);

    // Text content or edit area
    if (this.editingNoteId === note.id) {
      const textarea = document.createElement('textarea');
      textarea.dataset.testid = `note-edit-textarea-${note.id}`;
      textarea.value = note.text;
      textarea.style.cssText = `
        width: 100%;
        min-height: 48px;
        padding: 4px 6px;
        background: var(--input-bg, rgba(0, 0, 0, 0.3));
        border: 1px solid var(--accent-primary);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 12px;
        font-family: inherit;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
      `;
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.stopPropagation();
          this.saveEdit(note.id, textarea.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.editingNoteId = null;
          // If the note text is empty (just added), remove it
          if (!note.text) {
            this.session.noteManager.removeNote(note.id);
          } else {
            this.render();
          }
        }
        e.stopPropagation();
      });
      // Prevent keyboard navigation from bubbling
      textarea.addEventListener('click', (e) => e.stopPropagation());
      el.appendChild(textarea);

      const hint = document.createElement('div');
      hint.style.cssText = 'font-size: 10px; color: var(--text-muted); margin-top: 2px;';
      hint.textContent = 'Ctrl+Enter to save, Esc to cancel';
      el.appendChild(hint);

      // Auto-focus the textarea after render
      requestAnimationFrame(() => textarea.focus());
    } else {
      const textEl = document.createElement('div');
      textEl.dataset.testid = `note-text-${note.id}`;
      textEl.style.cssText = `
        font-size: 12px;
        line-height: 1.4;
        color: var(--text-primary);
        word-break: break-word;
        ${note.status === 'resolved' ? 'text-decoration: line-through; opacity: 0.7;' : ''}
      `;
      textEl.textContent = note.text || '(empty)';
      el.appendChild(textEl);
    }

    // Timestamp
    const timestamp = document.createElement('div');
    timestamp.style.cssText = 'font-size: 10px; color: var(--text-muted); margin-top: 2px;';
    timestamp.textContent = this.formatTimestamp(note.createdAt);
    el.appendChild(timestamp);

    // Click to navigate
    el.addEventListener('click', () => this.goToNote(note));

    // Hover effects
    el.addEventListener('pointerenter', () => {
      if (!isInRange) el.style.background = 'var(--bg-hover, rgba(255,255,255,0.05))';
    });
    el.addEventListener('pointerleave', () => {
      el.style.background = isInRange ? 'rgba(var(--accent-primary-rgb), 0.15)' : '';
    });

    return el;
  }

  private createReplyInput(parentId: string): HTMLElement {
    const el = document.createElement('div');
    el.dataset.testid = `note-reply-input-${parentId}`;
    el.style.cssText = `
      padding: 6px 12px 6px 28px;
      border-bottom: 1px solid var(--overlay-border);
    `;

    const textarea = document.createElement('textarea');
    textarea.dataset.testid = `note-reply-textarea-${parentId}`;
    textarea.placeholder = 'Write a reply...';
    textarea.style.cssText = `
      width: 100%;
      min-height: 36px;
      padding: 4px 6px;
      background: var(--input-bg, rgba(0, 0, 0, 0.3));
      border: 1px solid var(--accent-primary);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
      font-family: inherit;
      resize: vertical;
      outline: none;
      box-sizing: border-box;
    `;
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        this.saveReply(parentId, textarea.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.replyingToNoteId = null;
        this.render();
      }
      e.stopPropagation();
    });
    textarea.addEventListener('click', (e) => e.stopPropagation());
    el.appendChild(textarea);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 10px; color: var(--text-muted); margin-top: 2px;';
    hint.textContent = 'Ctrl+Enter to reply, Esc to cancel';
    el.appendChild(hint);

    requestAnimationFrame(() => textarea.focus());
    return el;
  }

  // ---- Actions ----

  private goToNote(note: Note): void {
    this.session.goToFrame(note.frameStart);
    this.emit('noteSelected', { noteId: note.id, frame: note.frameStart });
  }

  private saveEdit(noteId: string, text: string): void {
    const trimmed = text.trim();
    // Clear editing state before CRUD so the notesChanged re-render
    // shows the text view instead of the textarea
    this.editingNoteId = null;
    if (!trimmed) {
      // Remove note if text cleared
      this.session.noteManager.removeNote(noteId);
    } else {
      this.session.noteManager.updateNote(noteId, { text: trimmed });
    }
  }

  private saveReply(parentId: string, text: string): void {
    const trimmed = text.trim();
    // Clear reply state before CRUD so the notesChanged re-render
    // doesn't show the reply input again
    this.replyingToNoteId = null;
    if (trimmed) {
      const parentNote = this.session.noteManager.getNote(parentId);
      if (parentNote) {
        this.session.noteManager.addNote(
          parentNote.sourceIndex,
          parentNote.frameStart,
          parentNote.frameEnd,
          trimmed,
          this.getAuthorName(),
          { parentId, color: parentNote.color },
        );
      }
    }
  }

  // ---- Export / Import ----

  /** Export all notes to a JSON file download */
  private exportNotes(): void {
    const notes = this.session.noteManager.toSerializable();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      notes,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `notes-export-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Import notes from a JSON file */
  private importNotes(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (!data || !Array.isArray(data.notes)) {
            await showAlert('Invalid notes file. Expected { version, notes: [...] } format.');
            return;
          }
          this.session.noteManager.fromSerializable(data.notes);
        } catch {
          await showAlert('Invalid JSON file. Could not parse note data.');
        }
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  // ---- Highlight (optimized, no full re-render) ----

  private updateHighlight(): void {
    if (!this.visible) return;
    const currentFrame = this.session.currentFrame;
    if (this.lastHighlightedFrame === currentFrame) return;

    const entries = this.entriesContainer.querySelectorAll('.note-entry');
    for (const entry of entries) {
      const el = entry as HTMLElement;
      const noteId = el.dataset.noteId;
      if (!noteId) continue;
      const note = this.session.noteManager.getNote(noteId);
      if (!note) continue;
      const isInRange = currentFrame >= note.frameStart && currentFrame <= note.frameEnd;
      el.style.background = isInRange ? 'rgba(var(--accent-primary-rgb), 0.15)' : '';
    }
    this.lastHighlightedFrame = currentFrame;
  }

  // ---- Keyboard navigation ----

  private handleKeyDown(e: KeyboardEvent): void {
    const entries = this.entriesContainer.querySelectorAll('.note-entry');
    if (entries.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.focusedNoteIndex = Math.min(this.focusedNoteIndex + 1, entries.length - 1);
        this.scrollToFocused(entries);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.focusedNoteIndex = Math.max(this.focusedNoteIndex - 1, 0);
        this.scrollToFocused(entries);
        break;
      case 'Enter': {
        e.preventDefault();
        const focused = entries[this.focusedNoteIndex] as HTMLElement | undefined;
        if (focused) focused.click();
        break;
      }
      case 'Home':
        e.preventDefault();
        this.focusedNoteIndex = 0;
        this.scrollToFocused(entries);
        break;
      case 'End':
        e.preventDefault();
        this.focusedNoteIndex = entries.length - 1;
        this.scrollToFocused(entries);
        break;
    }
  }

  private scrollToFocused(entries: NodeListOf<Element>): void {
    // Clear old focus and aria-selected
    for (const entry of entries) {
      (entry as HTMLElement).style.outline = '';
      entry.setAttribute('aria-selected', 'false');
    }
    const focused = entries[this.focusedNoteIndex] as HTMLElement | undefined;
    if (focused) {
      focused.setAttribute('aria-selected', 'true');
      focused.style.outline = '1px solid var(--accent-primary)';
      focused.scrollIntoView?.({ block: 'nearest' });
    }
  }

  // ---- Utils ----

  /** Get the current author name from preferences, falling back to 'User'. */
  private getAuthorName(): string {
    try {
      const name = getCorePreferencesManager().getGeneralPrefs().userName;
      if (name && name.trim()) return name.trim();
    } catch {
      // PreferencesManager not wired — fall back
    }
    return 'User';
  }

  private formatTimestamp(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  // ---- Disposal ----

  dispose(): void {
    this.session.off('notesChanged', this.boundOnNotesChanged);
    this.session.off('frameChanged', this.boundOnFrameChanged);
    if (this.boundOnSourceLoaded) {
      this.session.off('sourceLoaded', this.boundOnSourceLoaded);
    }
    this.container.removeEventListener('keydown', this.boundOnKeyDown);
    this.subs.dispose();
    this.announcer.dispose();
    this.removeAllListeners();
  }
}
