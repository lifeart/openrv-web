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
import { getThemeManager } from '../../utils/ui/ThemeManager';
import { showAlert, showConfirm } from './shared/Modal';
import type { ExclusivePanelRef } from './NotePanel';

/**
 * Marker export JSON structure
 */
export interface MarkerExportData {
  version: 1;
  exportedAt: string;
  fps: number;
  markers: Marker[];
}

export interface MarkerListPanelEvents extends EventMap {
  visibilityChanged: boolean;
  markerSelected: number;
}

// Default marker color fallback - resolved from CSS variable
function getDefaultMarkerColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--error').trim() || '#ff0000';
}

export class MarkerListPanel extends EventEmitter<MarkerListPanelEvents> {
  private container: HTMLElement;
  private session: Session;
  private visible = false;
  private entriesContainer: HTMLElement;
  private headerElement: HTMLElement;
  private actionsBar: HTMLElement;
  private editingFrame: number | null = null;
  private lastHighlightedFrame: number | null = null;
  private focusedMarkerIndex = -1;
  private exclusivePanel: ExclusivePanelRef | null = null;

  // Bound event handlers for cleanup
  private boundOnMarksChanged: () => void;
  private boundOnFrameChanged: () => void;
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnThemeChange: (() => void) | null = null;

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
    this.headerElement.className = 'marker-panel-header';
    this.headerElement.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--overlay-border);
      background: var(--bg-secondary);
    `;

    const title = document.createElement('span');
    title.textContent = 'Markers';
    title.style.cssText = 'font-weight: 500; font-size: 13px;';

    const headerButtons = document.createElement('div');
    headerButtons.style.cssText = 'display: flex; gap: 8px;';

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add';
    addBtn.title = 'Add marker at current frame';
    addBtn.dataset.testid = 'marker-add-btn';
    addBtn.style.cssText = `
      background: rgba(var(--accent-primary-rgb), 0.15);
      border: 1px solid var(--success);
      color: var(--success);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;
    addBtn.addEventListener('click', () => this.addMarkerAtCurrentFrame());

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Close';
    closeBtn.dataset.testid = 'marker-close-btn';
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

    headerButtons.appendChild(addBtn);
    headerButtons.appendChild(closeBtn);
    this.headerElement.appendChild(title);
    this.headerElement.appendChild(headerButtons);

    // Actions bar (Export, Import, Clear All)
    this.actionsBar = document.createElement('div');
    this.actionsBar.className = 'marker-actions-bar';
    this.actionsBar.dataset.testid = 'marker-actions-bar';
    this.actionsBar.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--overlay-border);
      background: var(--bg-secondary);
    `;

    const actionBtnStyle = `
      background: transparent;
      border: 1px solid var(--overlay-border);
      color: var(--text-muted);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Export markers to JSON file';
    exportBtn.dataset.testid = 'marker-export-btn';
    exportBtn.style.cssText = actionBtnStyle;
    exportBtn.addEventListener('click', () => this.exportMarkers());

    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import';
    importBtn.title = 'Import markers from JSON file (merge)';
    importBtn.dataset.testid = 'marker-import-btn';
    importBtn.style.cssText = actionBtnStyle;
    importBtn.addEventListener('click', () => this.importMarkers('merge'));

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All';
    clearBtn.title = 'Clear all markers';
    clearBtn.dataset.testid = 'marker-clear-btn';
    clearBtn.style.cssText = actionBtnStyle;
    clearBtn.addEventListener('click', () => this.clearAllMarkers());

    this.actionsBar.appendChild(exportBtn);
    this.actionsBar.appendChild(importBtn);
    this.actionsBar.appendChild(clearBtn);

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
    this.container.appendChild(this.actionsBar);
    this.container.appendChild(this.entriesContainer);

    // Listen to marker and frame changes
    this.session.on('marksChanged', this.boundOnMarksChanged);
    this.session.on('frameChanged', this.boundOnFrameChanged);

    // Add keyboard navigation support
    this.container.setAttribute('tabindex', '0');
    this.container.addEventListener('keydown', this.boundOnKeyDown);

    // Subscribe to theme changes so marker entries pick up new CSS variable values
    this.boundOnThemeChange = () => this.render();
    getThemeManager().on('themeChanged', this.boundOnThemeChange);

    // Initial render
    this.render();
  }

  /**
   * Get the panel element
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /** Register another panel for mutual exclusion - opening this panel will close the other */
  setExclusiveWith(panel: ExclusivePanelRef): void {
    this.exclusivePanel = panel;
  }

  /**
   * Show the panel
   */
  show(): void {
    // Close exclusive panel if it is open
    if (this.exclusivePanel?.isVisible()) {
      this.exclusivePanel.hide();
    }
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
      this.session.setMarker(frame, '', MARKER_COLORS[0] ?? getDefaultMarkerColor());
    }
  }

  /**
   * Clear all markers with confirmation
   */
  private async clearAllMarkers(): Promise<void> {
    const markerCount = this.session.marks.size;
    if (markerCount === 0) return;

    // Confirmation dialog for destructive action
    const confirmed = await showConfirm(
      `Are you sure you want to delete all ${markerCount} marker${markerCount > 1 ? 's' : ''}? This cannot be undone.`
    );
    if (confirmed) {
      this.session.clearMarks();
    }
  }

  /**
   * Export markers to a JSON file download
   */
  exportMarkers(): void {
    const markers = Array.from(this.session.marks.values()).sort((a, b) => a.frame - b.frame);
    const exportData: MarkerExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      fps: this.session.fps || 24,
      markers,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `markers-export-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import markers from a JSON file
   * @param mode 'merge' preserves existing markers, 'replace' clears them first
   */
  importMarkers(mode: 'replace' | 'merge' = 'merge'): void {
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
          this.applyImportedMarkers(data, mode);
        } catch {
          await showAlert('Invalid JSON file. Could not parse marker data.');
        }
      };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  /**
   * Validate and apply imported marker data
   */
  private async applyImportedMarkers(data: unknown, mode: 'replace' | 'merge'): Promise<void> {
    if (!this.validateImportData(data)) {
      await showAlert('Invalid marker file. Expected { version, markers: [...] } format.');
      return;
    }
    const validMarkers = (data as MarkerExportData).markers.filter(
      (m) =>
        typeof m.frame === 'number' &&
        Number.isFinite(m.frame) &&
        m.frame >= 0 &&
        typeof m.note === 'string' &&
        typeof m.color === 'string'
    );

    if (mode === 'replace') {
      this.session.clearMarks();
    }

    for (const m of validMarkers) {
      if (mode === 'merge' && this.session.hasMarker(m.frame)) {
        continue;
      }
      this.session.setMarker(m.frame, m.note, m.color, m.endFrame);
    }
  }

  /**
   * Validate imported data has required structure
   */
  private validateImportData(data: unknown): data is MarkerExportData {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    if (typeof obj.version !== 'number') return false;
    if (!Array.isArray(obj.markers)) return false;
    return true;
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
   * Save marker edit with note and optional end frame
   */
  private saveMarkerEdit(frame: number, note: string, endFrame: number | undefined): void {
    this.session.setMarkerNote(frame, note);
    // Update end frame (handles validation: endFrame must be > frame)
    if (endFrame !== undefined && !isNaN(endFrame) && endFrame > frame) {
      this.session.setMarkerEndFrame(frame, endFrame);
    } else {
      this.session.setMarkerEndFrame(frame, undefined);
    }
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
   * Format a single frame number to timecode
   */
  private formatTimecodeForFrame(frame: number): string {
    const fps = this.session.fps || 24;
    const safeFrame = Math.max(1, frame);
    const totalSeconds = (safeFrame - 1) / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor((safeFrame - 1) % fps);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }

  /**
   * Format frame number with timecode, supports range markers
   */
  private formatFrameInfo(frame: number, endFrame?: number): string {
    const timecode = this.formatTimecodeForFrame(frame);
    if (endFrame !== undefined && endFrame > frame) {
      const endTimecode = this.formatTimecodeForFrame(endFrame);
      const rangeLength = endFrame - frame + 1;
      return `Frames ${frame}-${endFrame} (${rangeLength}f) [${timecode} - ${endTimecode}]`;
    }
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
        color: var(--text-muted);
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
    const currentFrame = this.session.currentFrame;
    const isCurrentFrame = marker.frame === currentFrame ||
      (marker.endFrame !== undefined && currentFrame >= marker.frame && currentFrame <= marker.endFrame);
    const isDurationMarker = marker.endFrame !== undefined && marker.endFrame > marker.frame;
    const isEditing = this.editingFrame === marker.frame;

    const el = document.createElement('div');
    el.className = 'marker-entry';
    el.dataset.testid = `marker-entry-${marker.frame}`;
    el.dataset.frame = String(marker.frame);
    el.style.cssText = `
      display: flex;
      flex-direction: column;
      padding: 10px 12px;
      border-bottom: 1px solid var(--overlay-border);
      transition: background 0.15s;
      ${isCurrentFrame ? 'background: rgba(var(--accent-primary-rgb), 0.15);' : ''}
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
      border-radius: ${isDurationMarker ? '3px' : '50%'};
      background: ${marker.color};
      border: 2px solid var(--border-secondary);
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
    frameInfo.textContent = this.formatFrameInfo(marker.frame, marker.endFrame);
    frameInfo.style.cssText = `
      flex: 1;
      cursor: pointer;
      color: ${isCurrentFrame ? 'var(--accent-primary)' : 'var(--text-primary)'};
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
      color: var(--text-muted);
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
      color: var(--error);
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
      // End frame input row for duration markers
      const endFrameRow = document.createElement('div');
      endFrameRow.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      `;

      const endFrameLabel = document.createElement('label');
      endFrameLabel.textContent = 'End frame:';
      endFrameLabel.style.cssText = `
        font-size: 11px;
        color: var(--text-secondary);
        white-space: nowrap;
      `;

      const endFrameInput = document.createElement('input');
      endFrameInput.type = 'number';
      endFrameInput.min = String(marker.frame + 1);
      endFrameInput.value = marker.endFrame !== undefined ? String(marker.endFrame) : '';
      endFrameInput.placeholder = 'none (point marker)';
      endFrameInput.dataset.testid = `marker-endframe-input-${marker.frame}`;
      endFrameInput.style.cssText = `
        width: 100px;
        background: var(--bg-primary);
        border: 1px solid var(--accent-primary);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 11px;
        padding: 4px 6px;
        font-family: inherit;
      `;
      // Prevent keyboard shortcuts when typing in input
      endFrameInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          this.editingFrame = null;
          this.render();
        }
      });

      const clearEndBtn = document.createElement('button');
      clearEndBtn.textContent = 'Clear';
      clearEndBtn.dataset.testid = `marker-clear-endframe-${marker.frame}`;
      clearEndBtn.title = 'Remove end frame (convert to point marker)';
      clearEndBtn.style.cssText = `
        background: none;
        border: 1px solid var(--text-muted);
        color: var(--text-muted);
        padding: 3px 6px;
        border-radius: 4px;
        font-size: 10px;
        cursor: pointer;
      `;
      clearEndBtn.addEventListener('click', () => {
        endFrameInput.value = '';
      });

      endFrameRow.appendChild(endFrameLabel);
      endFrameRow.appendChild(endFrameInput);
      endFrameRow.appendChild(clearEndBtn);
      noteRow.appendChild(endFrameRow);

      // Editable textarea
      const textarea = document.createElement('textarea');
      textarea.value = marker.note;
      textarea.dataset.testid = `marker-note-input-${marker.frame}`;
      textarea.placeholder = 'Enter note...';
      textarea.style.cssText = `
        width: 100%;
        min-height: 60px;
        background: var(--bg-primary);
        border: 1px solid var(--accent-primary);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 12px;
        padding: 8px;
        resize: vertical;
        font-family: inherit;
      `;

      const saveHandler = () => {
        const endVal = endFrameInput.value.trim();
        const endFrame = endVal ? parseInt(endVal, 10) : undefined;
        this.saveMarkerEdit(marker.frame, textarea.value, endFrame);
      };

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          saveHandler();
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
        background: rgba(var(--accent-primary-rgb), 0.3);
        border: 1px solid var(--accent-primary);
        color: var(--accent-primary);
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
      `;
      saveBtn.addEventListener('click', saveHandler);

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
        color: var(--text-secondary);
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
        color: var(--text-muted);
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
    el.addEventListener('pointerenter', () => {
      const isNowCurrentFrame = marker.frame === this.session.currentFrame;
      if (!isNowCurrentFrame) {
        el.style.background = 'var(--bg-hover)';
      }
    });
    el.addEventListener('pointerleave', () => {
      const isNowCurrentFrame = marker.frame === this.session.currentFrame;
      el.style.background = isNowCurrentFrame ? 'rgba(var(--accent-primary-rgb), 0.15)' : '';
    });

    return el;
  }

  /**
   * Optimized highlight update - only updates visual highlight without full re-render
   * Supports duration markers by highlighting entries whose range includes current frame
   */
  private updateHighlight(): void {
    const currentFrame = this.session.currentFrame;

    // Skip if same frame
    if (this.lastHighlightedFrame === currentFrame) return;

    // Clear all highlights first
    const allEntries = this.entriesContainer.querySelectorAll('.marker-entry');
    allEntries.forEach(entry => {
      (entry as HTMLElement).style.background = '';
      const frameInfo = (entry as HTMLElement).querySelector('span');
      if (frameInfo) {
        (frameInfo as HTMLElement).style.color = 'var(--text-primary)';
        (frameInfo as HTMLElement).style.fontWeight = '400';
      }
    });

    // Highlight entries that match current frame (exact or within range)
    for (const marker of this.session.marks.values()) {
      const isInRange = marker.frame === currentFrame ||
        (marker.endFrame !== undefined && currentFrame >= marker.frame && currentFrame <= marker.endFrame);
      if (isInRange) {
        const entry = this.entriesContainer.querySelector(
          `[data-frame="${marker.frame}"]`
        ) as HTMLElement | null;
        if (entry) {
          entry.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
          const frameInfo = entry.querySelector('span');
          if (frameInfo) {
            frameInfo.style.color = 'var(--accent-primary)';
            frameInfo.style.fontWeight = '600';
          }
        }
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
          entry.style.outline = '2px solid var(--accent-primary)';
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
    // Remove theme change listener
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
      this.boundOnThemeChange = null;
    }
    this.removeAllListeners();
  }
}
