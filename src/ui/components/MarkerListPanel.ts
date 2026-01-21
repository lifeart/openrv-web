/**
 * MarkerListPanel - Visual panel showing all markers with notes
 *
 * Features:
 * - List of all markers with notes and colors
 * - Click to navigate to marker frame
 * - Edit marker notes inline
 * - Change marker colors
 * - Delete markers
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { Session, Marker, MARKER_COLORS } from '../../core/session/Session';
import { getIconSvg } from './shared/Icons';

export interface MarkerListPanelEvents extends EventMap {
  visibilityChanged: boolean;
  markerSelected: number;
}

// Default marker color fallback
const DEFAULT_MARKER_COLOR = '#ff0000';

export class MarkerListPanel extends EventEmitter<MarkerListPanelEvents> {
  private container: HTMLElement;
  private session: Session;
  private visible = false;
  private entriesContainer: HTMLElement;
  private headerElement: HTMLElement;
  private editingFrame: number | null = null;
  private lastHighlightedFrame: number | null = null;
  private focusedMarkerIndex = -1;

  // Bound event handlers for cleanup
  private boundOnMarksChanged: () => void;
  private boundOnFrameChanged: () => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;

  constructor(session: Session) {
    super();
    this.session = session;

    // Bind event handlers for proper cleanup
    this.boundOnMarksChanged = () => this.render();
    // Optimized: only update highlight instead of full re-render on frame change
    this.boundOnFrameChanged = () => this.updateHighlight();
    this.boundOnKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

    this.container = document.createElement('div');
    this.container.className = 'marker-list-panel';
    this.container.dataset.testid = 'marker-list-panel';
    this.container.style.cssText = `
      position: absolute;
      right: 10px;
      top: 60px;
      width: 320px;
      max-height: 450px;
      background: rgba(30, 30, 30, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      display: none;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #e0e0e0;
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      overflow: hidden;
    `;

    // Header
    this.headerElement = document.createElement('div');
    this.headerElement.className = 'marker-panel-header';
    this.headerElement.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(40, 40, 40, 0.8);
    `;

    const title = document.createElement('span');
    title.textContent = 'Markers';
    title.style.cssText = 'font-weight: 600; font-size: 13px;';

    const headerButtons = document.createElement('div');
    headerButtons.style.cssText = 'display: flex; gap: 8px;';

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.title = 'Add marker at current frame';
    addBtn.dataset.testid = 'marker-add-btn';
    addBtn.style.cssText = `
      background: rgba(100, 200, 100, 0.2);
      border: 1px solid rgba(100, 200, 100, 0.3);
      color: #99ff99;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;
    addBtn.addEventListener('click', () => this.addMarkerAtCurrentFrame());

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All';
    clearBtn.title = 'Clear all markers';
    clearBtn.dataset.testid = 'marker-clear-btn';
    clearBtn.style.cssText = `
      background: rgba(255, 100, 100, 0.2);
      border: 1px solid rgba(255, 100, 100, 0.3);
      color: #ff9999;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;
    clearBtn.addEventListener('click', () => this.clearAllMarkers());

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.dataset.testid = 'marker-close-btn';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #999;
      font-size: 18px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    `;
    closeBtn.addEventListener('click', () => this.hide());

    headerButtons.appendChild(addBtn);
    headerButtons.appendChild(clearBtn);
    headerButtons.appendChild(closeBtn);
    this.headerElement.appendChild(title);
    this.headerElement.appendChild(headerButtons);

    // Entries container
    this.entriesContainer = document.createElement('div');
    this.entriesContainer.className = 'marker-entries';
    this.entriesContainer.dataset.testid = 'marker-entries';
    this.entriesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    `;

    this.container.appendChild(this.headerElement);
    this.container.appendChild(this.entriesContainer);

    // Listen to marker and frame changes
    this.session.on('marksChanged', this.boundOnMarksChanged);
    this.session.on('frameChanged', this.boundOnFrameChanged);

    // Add keyboard navigation support
    this.container.setAttribute('tabindex', '0');
    this.container.addEventListener('keydown', this.boundOnKeyDown);

    // Initial render
    this.render();
  }

  /**
   * Get the panel element
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Show the panel
   */
  show(): void {
    this.visible = true;
    this.container.style.display = 'flex';
    this.render();
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide the panel
   */
  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.editingFrame = null;
    this.emit('visibilityChanged', false);
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Add marker at current frame
   */
  private addMarkerAtCurrentFrame(): void {
    const frame = this.session.currentFrame;
    if (!this.session.hasMarker(frame)) {
      this.session.setMarker(frame, '', MARKER_COLORS[0] ?? DEFAULT_MARKER_COLOR);
    }
  }

  /**
   * Clear all markers with confirmation
   */
  private clearAllMarkers(): void {
    const markerCount = this.session.marks.size;
    if (markerCount === 0) return;

    // Confirmation dialog for destructive action
    const confirmed = window.confirm(
      `Are you sure you want to delete all ${markerCount} marker${markerCount > 1 ? 's' : ''}? This cannot be undone.`
    );
    if (confirmed) {
      this.session.clearMarks();
    }
  }

  /**
   * Navigate to marker frame
   */
  private goToMarker(frame: number): void {
    this.session.currentFrame = frame;
    this.emit('markerSelected', frame);
  }

  /**
   * Delete a marker
   */
  private deleteMarker(frame: number): void {
    this.session.removeMark(frame);
  }

  /**
   * Start editing a marker note
   */
  private startEditingNote(frame: number): void {
    this.editingFrame = frame;
    this.render();
  }

  /**
   * Save edited note
   */
  private saveNote(frame: number, note: string): void {
    this.session.setMarkerNote(frame, note);
    this.editingFrame = null;
    this.render();
  }

  /**
   * Change marker color
   */
  private cycleMarkerColor(frame: number): void {
    const marker = this.session.getMarker(frame);
    if (marker) {
      const currentIndex = MARKER_COLORS.indexOf(marker.color as typeof MARKER_COLORS[number]);
      const nextIndex = (currentIndex + 1) % MARKER_COLORS.length;
      // Safe to use ! assertion since nextIndex is always within bounds due to modulo
      this.session.setMarkerColor(frame, MARKER_COLORS[nextIndex]!);
    }
  }

  /**
   * Format frame number with timecode
   */
  private formatFrameInfo(frame: number): string {
    const fps = this.session.fps || 24;
    // Handle edge case where frame < 1
    const safeFrame = Math.max(1, frame);
    const totalSeconds = (safeFrame - 1) / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor((safeFrame - 1) % fps);

    const timecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    return `Frame ${frame} (${timecode})`;
  }

  /**
   * Render the marker entries
   */
  private render(): void {
    const markers = Array.from(this.session.marks.values()).sort((a, b) => a.frame - b.frame);
    this.entriesContainer.innerHTML = '';

    if (markers.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No markers yet. Press M to add a marker.';
      emptyMsg.style.cssText = `
        color: #666;
        text-align: center;
        padding: 20px;
        font-style: italic;
      `;
      this.entriesContainer.appendChild(emptyMsg);
      return;
    }

    for (const marker of markers) {
      const entryEl = this.createMarkerEntry(marker);
      this.entriesContainer.appendChild(entryEl);
    }
  }

  /**
   * Create a single marker entry element
   */
  private createMarkerEntry(marker: Marker): HTMLElement {
    const isCurrentFrame = marker.frame === this.session.currentFrame;
    const isEditing = this.editingFrame === marker.frame;

    const el = document.createElement('div');
    el.className = 'marker-entry';
    el.dataset.testid = `marker-entry-${marker.frame}`;
    el.dataset.frame = String(marker.frame);
    el.style.cssText = `
      display: flex;
      flex-direction: column;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.15s;
      ${isCurrentFrame ? 'background: rgba(100, 150, 255, 0.15);' : ''}
    `;

    // Top row: color indicator, frame info, and buttons
    const topRow = document.createElement('div');
    topRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    // Color indicator (clickable to cycle colors)
    const colorBtn = document.createElement('button');
    colorBtn.dataset.testid = `marker-color-${marker.frame}`;
    colorBtn.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${marker.color};
      border: 2px solid rgba(255, 255, 255, 0.3);
      cursor: pointer;
      flex-shrink: 0;
    `;
    colorBtn.title = 'Click to change color';
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cycleMarkerColor(marker.frame);
    });

    // Frame info (clickable to navigate)
    const frameInfo = document.createElement('span');
    frameInfo.textContent = this.formatFrameInfo(marker.frame);
    frameInfo.style.cssText = `
      flex: 1;
      cursor: pointer;
      color: ${isCurrentFrame ? '#8af' : '#ccc'};
      font-weight: ${isCurrentFrame ? '600' : '400'};
    `;
    frameInfo.addEventListener('click', () => this.goToMarker(marker.frame));

    // Edit note button
    const editBtn = document.createElement('button');
    editBtn.innerHTML = getIconSvg('pencil', 'sm');
    editBtn.title = 'Edit note';
    editBtn.dataset.testid = `marker-edit-${marker.frame}`;
    editBtn.setAttribute('aria-label', 'Edit marker note');
    editBtn.style.cssText = `
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
    `;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startEditingNote(marker.frame);
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = getIconSvg('trash', 'sm');
    deleteBtn.title = 'Delete marker';
    deleteBtn.dataset.testid = `marker-delete-${marker.frame}`;
    deleteBtn.setAttribute('aria-label', 'Delete marker');
    deleteBtn.style.cssText = `
      background: none;
      border: none;
      color: #f66;
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteMarker(marker.frame);
    });

    topRow.appendChild(colorBtn);
    topRow.appendChild(frameInfo);
    topRow.appendChild(editBtn);
    topRow.appendChild(deleteBtn);

    // Note row (editable or display)
    const noteRow = document.createElement('div');
    noteRow.style.cssText = `
      margin-top: 6px;
      margin-left: 24px;
    `;

    if (isEditing) {
      // Editable textarea
      const textarea = document.createElement('textarea');
      textarea.value = marker.note;
      textarea.dataset.testid = `marker-note-input-${marker.frame}`;
      textarea.placeholder = 'Enter note...';
      textarea.style.cssText = `
        width: 100%;
        min-height: 60px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(100, 150, 255, 0.5);
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 12px;
        padding: 8px;
        resize: vertical;
        font-family: inherit;
      `;
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          this.saveNote(marker.frame, textarea.value);
        } else if (e.key === 'Escape') {
          this.editingFrame = null;
          this.render();
        }
      });

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save (Ctrl+Enter)';
      saveBtn.dataset.testid = `marker-save-${marker.frame}`;
      saveBtn.style.cssText = `
        margin-top: 6px;
        background: rgba(100, 150, 255, 0.3);
        border: 1px solid rgba(100, 150, 255, 0.5);
        color: #8af;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
      `;
      saveBtn.addEventListener('click', () => this.saveNote(marker.frame, textarea.value));

      noteRow.appendChild(textarea);
      noteRow.appendChild(saveBtn);

      // Focus the textarea after render
      setTimeout(() => textarea.focus(), 0);
    } else if (marker.note) {
      // Display note
      const noteText = document.createElement('div');
      noteText.textContent = marker.note;
      noteText.dataset.testid = `marker-note-${marker.frame}`;
      noteText.style.cssText = `
        color: #aaa;
        font-size: 11px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
        cursor: pointer;
      `;
      noteText.addEventListener('click', () => this.startEditingNote(marker.frame));
      noteRow.appendChild(noteText);
    } else {
      // Empty note hint
      const hintText = document.createElement('div');
      hintText.textContent = 'Click edit to add a note';
      hintText.style.cssText = `
        color: #555;
        font-size: 11px;
        font-style: italic;
        cursor: pointer;
      `;
      hintText.addEventListener('click', () => this.startEditingNote(marker.frame));
      noteRow.appendChild(hintText);
    }

    el.appendChild(topRow);
    el.appendChild(noteRow);

    // Hover effect - use dynamic check for current frame
    el.addEventListener('mouseenter', () => {
      const isNowCurrentFrame = marker.frame === this.session.currentFrame;
      if (!isNowCurrentFrame) {
        el.style.background = 'rgba(255, 255, 255, 0.05)';
      }
    });
    el.addEventListener('mouseleave', () => {
      const isNowCurrentFrame = marker.frame === this.session.currentFrame;
      el.style.background = isNowCurrentFrame ? 'rgba(100, 150, 255, 0.15)' : '';
    });

    return el;
  }

  /**
   * Optimized highlight update - only updates visual highlight without full re-render
   */
  private updateHighlight(): void {
    const currentFrame = this.session.currentFrame;

    // Skip if same frame
    if (this.lastHighlightedFrame === currentFrame) return;

    // Update previous highlighted entry
    if (this.lastHighlightedFrame !== null) {
      const prevEntry = this.entriesContainer.querySelector(
        `[data-frame="${this.lastHighlightedFrame}"]`
      ) as HTMLElement | null;
      if (prevEntry) {
        prevEntry.style.background = '';
        const frameInfo = prevEntry.querySelector('span');
        if (frameInfo) {
          frameInfo.style.color = '#ccc';
          frameInfo.style.fontWeight = '400';
        }
      }
    }

    // Update new highlighted entry
    const currentEntry = this.entriesContainer.querySelector(
      `[data-frame="${currentFrame}"]`
    ) as HTMLElement | null;
    if (currentEntry) {
      currentEntry.style.background = 'rgba(100, 150, 255, 0.15)';
      const frameInfo = currentEntry.querySelector('span');
      if (frameInfo) {
        frameInfo.style.color = '#8af';
        frameInfo.style.fontWeight = '600';
      }
    }

    this.lastHighlightedFrame = currentFrame;
  }

  /**
   * Handle keyboard navigation
   */
  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.visible) return;

    const markers = Array.from(this.session.marks.values()).sort((a, b) => a.frame - b.frame);
    if (markers.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.focusedMarkerIndex = Math.min(this.focusedMarkerIndex + 1, markers.length - 1);
        this.scrollToFocusedMarker(markers);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.focusedMarkerIndex = Math.max(this.focusedMarkerIndex - 1, 0);
        this.scrollToFocusedMarker(markers);
        break;
      case 'Enter':
        e.preventDefault();
        if (this.focusedMarkerIndex >= 0 && this.focusedMarkerIndex < markers.length) {
          const marker = markers[this.focusedMarkerIndex];
          if (marker) {
            this.goToMarker(marker.frame);
          }
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (this.focusedMarkerIndex >= 0 && this.focusedMarkerIndex < markers.length) {
          const marker = markers[this.focusedMarkerIndex];
          if (marker) {
            this.deleteMarker(marker.frame);
            // Adjust focus index if needed
            if (this.focusedMarkerIndex >= markers.length - 1) {
              this.focusedMarkerIndex = Math.max(0, markers.length - 2);
            }
          }
        }
        break;
      case 'Home':
        e.preventDefault();
        this.focusedMarkerIndex = 0;
        this.scrollToFocusedMarker(markers);
        break;
      case 'End':
        e.preventDefault();
        this.focusedMarkerIndex = markers.length - 1;
        this.scrollToFocusedMarker(markers);
        break;
    }
  }

  /**
   * Scroll to and highlight the focused marker
   */
  private scrollToFocusedMarker(markers: Marker[]): void {
    // Remove focus styling from all entries
    const entries = this.entriesContainer.querySelectorAll('.marker-entry');
    entries.forEach(entry => {
      (entry as HTMLElement).style.outline = '';
    });

    // Apply focus styling to current entry
    if (this.focusedMarkerIndex >= 0 && this.focusedMarkerIndex < markers.length) {
      const marker = markers[this.focusedMarkerIndex];
      if (marker) {
        const entry = this.entriesContainer.querySelector(
          `[data-frame="${marker.frame}"]`
        ) as HTMLElement | null;
        if (entry) {
          entry.style.outline = '2px solid rgba(100, 150, 255, 0.5)';
          entry.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }

  /**
   * Get current state for testing
   */
  getState(): { visible: boolean; markerCount: number; editingFrame: number | null } {
    return {
      visible: this.visible,
      markerCount: this.session.marks.size,
      editingFrame: this.editingFrame,
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    // Remove session event listeners to prevent memory leaks
    this.session.off('marksChanged', this.boundOnMarksChanged);
    this.session.off('frameChanged', this.boundOnFrameChanged);
    // Remove keyboard listener
    this.container.removeEventListener('keydown', this.boundOnKeyDown);
    this.removeAllListeners();
  }
}
