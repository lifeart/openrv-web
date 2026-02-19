/**
 * TimelineEditor - Visual EDL/Timeline editing component
 *
 * Provides UI for editing cuts in a SequenceGroupNode, including:
 * - Visual cut representation as colored blocks
 * - Drag handles for trimming
 * - Drag to reorder cuts
 * - Context menu for delete/split/duplicate operations
 * - Playhead indicator synchronized to session frame
 * - Timecode display on cuts
 * - Keyboard shortcuts for common operations
 * - Ruler click-to-seek
 * - Snap-to-cut-boundary during drag
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { formatTimecode } from '../../utils/media/Timecode';
import type { Session } from '../../core/session/Session';
import type { SequenceGroupNode, EDLEntry } from '../../nodes/groups/SequenceGroupNode';

/**
 * Events emitted by the TimelineEditor
 */
export interface TimelineEditorEvents extends EventMap {
  /** Cut in/out points changed */
  cutTrimmed: { cutIndex: number; inPoint: number; outPoint: number };
  /** Cut moved to new position */
  cutMoved: { cutIndex: number; newPosition: number };
  /** Cut deleted */
  cutDeleted: { cutIndex: number };
  /** New cut inserted */
  cutInserted: { position: number; sourceIndex: number; inPoint: number; outPoint: number };
  /** Cut selected */
  cutSelected: { cutIndex: number };
  /** Selection cleared */
  selectionCleared: void;
  /** Cut split at playhead */
  cutSplit: { cutIndex: number; frame: number };
}

/**
 * Visual representation of a cut for rendering
 */
interface CutVisual {
  index: number;
  startFrame: number;
  endFrame: number;
  sourceIndex: number;
  inPoint: number;
  outPoint: number;
  color: string;
  label: string;
}

/**
 * Cut colors palette
 */
const CUT_COLORS = [
  '#4a90d9', // Blue
  '#50c878', // Emerald
  '#f4a460', // Sandy Brown
  '#9370db', // Medium Purple
  '#20b2aa', // Light Sea Green
  '#ff6b6b', // Light Red
  '#ffd700', // Gold
  '#87ceeb', // Sky Blue
];

/**
 * Timeline Editor Component
 */
export class TimelineEditor extends EventEmitter<TimelineEditorEvents> {
  private container: HTMLElement;
  private _session: Session;
  private sequenceNode: SequenceGroupNode | null = null;

  // UI elements
  private timelineContainer: HTMLElement;
  private cutsContainer: HTMLElement;
  private rulerContainer: HTMLElement;
  private controlsContainer: HTMLElement;
  private playheadElement: HTMLElement;
  private rulerPlayheadElement: HTMLElement;
  private zoomSlider: HTMLInputElement | null = null;
  private zoomValueLabel: HTMLElement | null = null;
  private infoLabel: HTMLElement | null = null;
  private selectedInfoSep: HTMLElement | null = null;
  private selectedInfoLabel: HTMLElement | null = null;

  // State
  private cuts: CutVisual[] = [];
  private selectedCutIndex: number = -1;
  private totalFrames: number = 100;
  private pixelsPerFrame: number = 2;
  private isDragging: boolean = false;
  private dragType: 'move' | 'trim-in' | 'trim-out' | null = null;
  private dragStartX: number = 0;
  private dragStartFrame: number = 0;
  private currentFrame: number = 1;

  // Bound event handlers for cleanup
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: () => void;
  private boundZoomInput: ((e: Event) => void) | null = null;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private activeContextMenuHandler: ((e: MouseEvent) => void) | null = null;
  private unsubscribeFrameChanged: (() => void) | null = null;
  private scrollSyncInProgress: boolean = false;

  constructor(container: HTMLElement, session: Session, sequenceNode?: SequenceGroupNode) {
    super();

    this.container = container;
    this._session = session;
    this.sequenceNode = sequenceNode ?? null;

    // Bind event handlers for cleanup
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);

    // Create UI structure
    this.controlsContainer = this.createControlsContainer();
    this.rulerContainer = this.createRulerContainer();
    this.timelineContainer = this.createTimelineContainer();
    this.cutsContainer = this.createCutsContainer();

    // Playhead in cuts area
    this.playheadElement = document.createElement('div');
    this.playheadElement.className = 'timeline-playhead';
    this.playheadElement.style.cssText = `
      position: absolute;
      top: 0;
      width: 2px;
      height: 100%;
      background: var(--accent-primary, #4a90d9);
      pointer-events: none;
      z-index: 10;
      left: 0px;
    `;

    // Playhead triangle in ruler
    this.rulerPlayheadElement = document.createElement('div');
    this.rulerPlayheadElement.className = 'timeline-ruler-playhead';
    this.rulerPlayheadElement.style.cssText = `
      position: absolute;
      bottom: 0;
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 6px solid var(--accent-primary, #4a90d9);
      pointer-events: none;
      z-index: 10;
      left: 0px;
      transform: translateX(-5px);
    `;

    this.cutsContainer.appendChild(this.playheadElement);
    this.rulerContainer.appendChild(this.rulerPlayheadElement);

    this.timelineContainer.appendChild(this.cutsContainer);

    this.container.appendChild(this.controlsContainer);
    this.container.appendChild(this.rulerContainer);
    this.container.appendChild(this.timelineContainer);

    // Make container focusable for keyboard shortcuts
    this.container.setAttribute('tabindex', '0');
    this.container.style.outline = 'none';

    this.setupEventListeners();

    // Subscribe to session frame changes
    this.unsubscribeFrameChanged = this._session.on('frameChanged', (frame: number) => {
      this.updatePlayhead(frame);
    });

    if (this.sequenceNode) {
      this.loadFromSequenceNode(this.sequenceNode);
    }
  }

  /**
   * Load EDL data from a SequenceGroupNode
   */
  loadFromSequenceNode(node: SequenceGroupNode): void {
    this.sequenceNode = node;
    const edlEntries = node.getEDL();
    if (edlEntries.length > 0) {
      this.loadFromEDL(edlEntries);
      return;
    }

    // No EDL data - show empty timeline
    this.cuts = [];
    this.selectedCutIndex = -1;
    this.totalFrames = Math.max(1, node.getTotalDuration() || 100);
    this.render();
  }

  /**
   * Load EDL data directly, with optional per-cut labels.
   */
  loadFromEDL(entries: EDLEntry[], labels?: string[]): void {
    this.cuts = [];
    let maxEndFrame = 1;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;

      const inPoint = Math.max(1, Math.floor(entry.inPoint));
      const outPoint = Math.max(inPoint, Math.floor(entry.outPoint));
      const startFrame = Math.max(1, Math.floor(entry.frame));
      const duration = outPoint - inPoint + 1;
      const endFrame = startFrame + duration - 1;

      this.cuts.push({
        index: this.cuts.length,
        startFrame,
        endFrame,
        sourceIndex: entry.source,
        inPoint,
        outPoint,
        color: CUT_COLORS[entry.source % CUT_COLORS.length]!,
        label: labels?.[i] ?? `Source ${entry.source + 1}`,
      });

      maxEndFrame = Math.max(maxEndFrame, endFrame);
    }

    if (this.selectedCutIndex >= this.cuts.length) {
      this.selectedCutIndex = -1;
      this.emit('selectionCleared', undefined);
    }

    this.totalFrames = this.cuts.length > 0
      ? maxEndFrame
      : Math.max(1, this.totalFrames);

    this.render();
  }

  /**
   * Set the total timeline length
   */
  setTotalFrames(frames: number): void {
    this.totalFrames = frames;
    this.render();
  }

  /**
   * Set zoom level (pixels per frame)
   */
  setZoom(pixelsPerFrame: number): void {
    this.pixelsPerFrame = Math.max(0.5, Math.min(10, pixelsPerFrame));
    if (this.zoomValueLabel) {
      this.zoomValueLabel.textContent = `${this.pixelsPerFrame.toFixed(1)}x`;
    }
    this.render();
  }

  /**
   * Get the associated session
   */
  get session(): Session {
    return this._session;
  }

  /**
   * Get current EDL as structured data
   */
  getEDL(): EDLEntry[] {
    return this.cuts.map((cut) => ({
      frame: cut.startFrame,
      source: cut.sourceIndex,
      inPoint: cut.inPoint,
      outPoint: cut.outPoint,
    }));
  }

  /**
   * Insert a new cut at the specified position
   */
  insertCut(position: number, sourceIndex: number, inPoint: number, outPoint: number): void {
    // Find insertion point
    let insertIndex = this.cuts.length;
    for (let i = 0; i < this.cuts.length; i++) {
      if (this.cuts[i]!.startFrame >= position) {
        insertIndex = i;
        break;
      }
    }

    const duration = outPoint - inPoint + 1;
    const newCut: CutVisual = {
      index: insertIndex,
      startFrame: position,
      endFrame: position + duration - 1,
      sourceIndex,
      inPoint,
      outPoint,
      color: CUT_COLORS[sourceIndex % CUT_COLORS.length]!,
      label: `Source ${sourceIndex + 1}`,
    };

    // Shift existing cuts
    for (let i = insertIndex; i < this.cuts.length; i++) {
      this.cuts[i]!.startFrame += duration;
      this.cuts[i]!.endFrame += duration;
      this.cuts[i]!.index = i + 1;
    }

    this.cuts.splice(insertIndex, 0, newCut);
    this.totalFrames += duration;

    this.emit('cutInserted', { position, sourceIndex, inPoint, outPoint });
    this.render();
  }

  /**
   * Delete a cut at the specified index
   */
  deleteCut(cutIndex: number): void {
    if (cutIndex < 0 || cutIndex >= this.cuts.length) return;

    const cut = this.cuts[cutIndex]!;
    const duration = cut.endFrame - cut.startFrame + 1;

    // Shift subsequent cuts
    for (let i = cutIndex + 1; i < this.cuts.length; i++) {
      this.cuts[i]!.startFrame -= duration;
      this.cuts[i]!.endFrame -= duration;
      this.cuts[i]!.index = i - 1;
    }

    this.cuts.splice(cutIndex, 1);
    this.totalFrames -= duration;

    if (this.selectedCutIndex === cutIndex) {
      this.selectedCutIndex = -1;
      this.emit('selectionCleared', undefined);
    } else if (this.selectedCutIndex > cutIndex) {
      this.selectedCutIndex--;
    }

    this.emit('cutDeleted', { cutIndex });
    this.render();
  }

  /**
   * Trim a cut's in/out points
   */
  trimCut(cutIndex: number, newIn: number, newOut: number): void {
    if (cutIndex < 0 || cutIndex >= this.cuts.length) return;

    const cut = this.cuts[cutIndex]!;
    const oldDuration = cut.endFrame - cut.startFrame + 1;
    const newDuration = newOut - newIn + 1;
    const durationDelta = newDuration - oldDuration;

    cut.inPoint = newIn;
    cut.outPoint = newOut;
    cut.endFrame = cut.startFrame + newDuration - 1;

    // Shift subsequent cuts if duration changed
    if (durationDelta !== 0) {
      for (let i = cutIndex + 1; i < this.cuts.length; i++) {
        this.cuts[i]!.startFrame += durationDelta;
        this.cuts[i]!.endFrame += durationDelta;
      }
      this.totalFrames += durationDelta;
    }

    this.emit('cutTrimmed', { cutIndex, inPoint: newIn, outPoint: newOut });
    this.render();
  }

  /**
   * Move a cut to a new position
   */
  moveCut(cutIndex: number, newPosition: number): void {
    if (cutIndex < 0 || cutIndex >= this.cuts.length) return;

    const cut = this.cuts[cutIndex]!;
    const duration = cut.endFrame - cut.startFrame + 1;

    // Clamp to valid range: position must be >= 1 and end frame must be <= totalFrames
    const maxPosition = this.totalFrames - duration + 1;
    newPosition = Math.max(1, Math.min(maxPosition, newPosition));

    cut.startFrame = newPosition;
    cut.endFrame = newPosition + duration - 1;

    this.emit('cutMoved', { cutIndex, newPosition });
    this.render();
  }

  /**
   * Split a cut at the given frame, creating two cuts from one
   */
  splitCutAtFrame(cutIndex: number, frame: number): void {
    if (cutIndex < 0 || cutIndex >= this.cuts.length) return;

    const cut = this.cuts[cutIndex]!;
    // The frame is in timeline-space; convert to source-space offset
    const offsetInCut = frame - cut.startFrame;
    const splitSourceFrame = cut.inPoint + offsetInCut;

    // Must be strictly inside the cut (not at start or end)
    if (splitSourceFrame <= cut.inPoint || splitSourceFrame >= cut.outPoint) return;

    const originalOutPoint = cut.outPoint;
    const originalEndFrame = cut.endFrame;

    // Trim the first half
    cut.outPoint = splitSourceFrame - 1;
    cut.endFrame = cut.startFrame + (cut.outPoint - cut.inPoint);

    // Create second half
    const newCut: CutVisual = {
      index: cutIndex + 1,
      startFrame: cut.endFrame + 1,
      endFrame: originalEndFrame,
      sourceIndex: cut.sourceIndex,
      inPoint: splitSourceFrame,
      outPoint: originalOutPoint,
      color: cut.color,
      label: cut.label,
    };

    // Update indices of subsequent cuts
    for (let i = cutIndex + 1; i < this.cuts.length; i++) {
      this.cuts[i]!.index = i + 1;
    }

    this.cuts.splice(cutIndex + 1, 0, newCut);

    this.emit('cutSplit', { cutIndex, frame });
    this.render();
  }

  /**
   * Render the timeline UI
   */
  render(): void {
    this.renderRuler();
    this.renderCuts();
    this.updatePlayhead(this.currentFrame);
    this.updateControlsInfo();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Remove document-level event listeners
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);

    // Remove keyboard listener
    this.container.removeEventListener('keydown', this.boundKeyDown);

    // Unsubscribe from session frame changes
    if (this.unsubscribeFrameChanged) {
      this.unsubscribeFrameChanged();
      this.unsubscribeFrameChanged = null;
    }

    // Clean up context menu handler if active
    if (this.activeContextMenuHandler) {
      document.removeEventListener('click', this.activeContextMenuHandler);
      this.activeContextMenuHandler = null;
    }

    // Clean up zoom slider listener
    if (this.zoomSlider && this.boundZoomInput) {
      this.zoomSlider.removeEventListener('input', this.boundZoomInput);
      this.boundZoomInput = null;
      this.zoomSlider = null;
    }

    // Remove any open context menu
    const existingMenu = document.querySelector('.timeline-context-menu');
    if (existingMenu) existingMenu.remove();

    this.container.innerHTML = '';
  }

  // Private methods

  private get hasContent(): boolean {
    return this.cuts.length > 0;
  }

  private updatePlayhead(frame: number): void {
    this.currentFrame = frame;
    const x = (frame - 1) * this.pixelsPerFrame;
    this.playheadElement.style.left = `${x}px`;
    this.rulerPlayheadElement.style.left = `${x}px`;

    // Hide playhead when there are no cuts
    const visible = this.hasContent;
    this.playheadElement.style.display = visible ? '' : 'none';
    this.rulerPlayheadElement.style.display = visible ? '' : 'none';
  }

  private updateControlsInfo(): void {
    if (this.infoLabel) {
      if (this.hasContent) {
        this.infoLabel.textContent = `Total: ${this.totalFrames}f`;
      } else {
        this.infoLabel.textContent = 'No sources loaded';
      }
    }
    if (this.selectedInfoLabel) {
      if (this.selectedCutIndex >= 0 && this.selectedCutIndex < this.cuts.length) {
        const cut = this.cuts[this.selectedCutIndex]!;
        const fps = this._session.fps || 24;
        const inTC = formatTimecode(cut.inPoint, fps);
        const outTC = formatTimecode(cut.outPoint, fps);
        this.selectedInfoLabel.textContent = `Selected: Cut ${this.selectedCutIndex + 1} (${inTC}\u2013${outTC})`;
        this.selectedInfoLabel.style.display = '';
        if (this.selectedInfoSep) this.selectedInfoSep.style.display = '';
      } else {
        this.selectedInfoLabel.textContent = '';
        this.selectedInfoLabel.style.display = 'none';
        if (this.selectedInfoSep) this.selectedInfoSep.style.display = 'none';
      }
    }
  }

  private createControlsContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'timeline-controls';
    container.style.cssText = `
      display: flex;
      gap: 12px;
      padding: 8px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-primary);
      align-items: center;
    `;

    // Zoom controls group
    const zoomGroup = document.createElement('div');
    zoomGroup.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const zoomLabel = document.createElement('span');
    zoomLabel.textContent = 'Zoom:';
    zoomLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px;';

    this.zoomSlider = document.createElement('input');
    this.zoomSlider.type = 'range';
    this.zoomSlider.min = '0.5';
    this.zoomSlider.max = '10';
    this.zoomSlider.step = '0.5';
    this.zoomSlider.value = String(this.pixelsPerFrame);
    this.zoomSlider.style.cssText = 'width: 100px;';
    this.boundZoomInput = () => {
      this.setZoom(parseFloat(this.zoomSlider!.value));
    };
    this.zoomSlider.addEventListener('input', this.boundZoomInput);

    this.zoomValueLabel = document.createElement('span');
    this.zoomValueLabel.textContent = `${this.pixelsPerFrame.toFixed(1)}x`;
    this.zoomValueLabel.style.cssText = 'color: var(--text-muted); font-size: 11px; min-width: 32px;';

    zoomGroup.appendChild(zoomLabel);
    zoomGroup.appendChild(this.zoomSlider);
    zoomGroup.appendChild(this.zoomValueLabel);

    // Separator
    const sep1 = document.createElement('div');
    sep1.style.cssText = 'width: 1px; height: 16px; background: var(--border-primary);';

    // Info section
    this.infoLabel = document.createElement('span');
    this.infoLabel.textContent = `Total: ${this.totalFrames}f`;
    this.infoLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px;';

    // Separator (hidden when no selection)
    this.selectedInfoSep = document.createElement('div');
    this.selectedInfoSep.style.cssText = 'width: 1px; height: 16px; background: var(--border-primary); display: none;';

    // Selected cut info
    this.selectedInfoLabel = document.createElement('span');
    this.selectedInfoLabel.style.cssText = 'color: var(--text-secondary); font-size: 12px; display: none;';

    container.appendChild(zoomGroup);
    container.appendChild(sep1);
    container.appendChild(this.infoLabel);
    container.appendChild(this.selectedInfoSep);
    container.appendChild(this.selectedInfoLabel);

    return container;
  }

  private createRulerContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'timeline-ruler';
    container.style.cssText = `
      height: 24px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-primary);
      overflow-x: auto;
      overflow-y: hidden;
      position: relative;
    `;
    return container;
  }

  private createTimelineContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'timeline-track';
    container.style.cssText = `
      min-height: 60px;
      background: var(--bg-primary);
      overflow-x: auto;
      overflow-y: hidden;
      position: relative;
    `;
    return container;
  }

  private createCutsContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'timeline-cuts';
    container.style.cssText = `
      position: relative;
      height: 48px;
      margin: 6px 0;
    `;
    return container;
  }

  private setupEventListeners(): void {
    // Click on empty space to deselect
    this.timelineContainer.addEventListener('click', (e) => {
      if (e.target === this.timelineContainer || e.target === this.cutsContainer) {
        this.selectedCutIndex = -1;
        this.emit('selectionCleared', undefined);
        this.render();
      }
    });

    // Global mouse events for dragging (use bound handlers for cleanup)
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);

    // Keyboard shortcuts
    this.container.addEventListener('keydown', this.boundKeyDown);

    // Bidirectional scroll sync between ruler and timeline
    this.rulerContainer.addEventListener('scroll', () => {
      if (this.scrollSyncInProgress) return;
      this.scrollSyncInProgress = true;
      this.timelineContainer.scrollLeft = this.rulerContainer.scrollLeft;
      this.scrollSyncInProgress = false;
    });
    this.timelineContainer.addEventListener('scroll', () => {
      if (this.scrollSyncInProgress) return;
      this.scrollSyncInProgress = true;
      this.rulerContainer.scrollLeft = this.timelineContainer.scrollLeft;
      this.scrollSyncInProgress = false;
    });

    // Ruler click-to-seek
    this.rulerContainer.addEventListener('click', (e) => {
      const rect = this.rulerContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left + this.rulerContainer.scrollLeft;
      const frame = Math.max(1, Math.round(clickX / this.pixelsPerFrame) + 1);
      this._session.goToFrame(frame);
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (this.selectedCutIndex >= 0) {
          e.preventDefault();
          this.deleteCut(this.selectedCutIndex);
        }
        break;
      case 'Escape':
        this.selectedCutIndex = -1;
        this.emit('selectionCleared', undefined);
        this.render();
        break;
      case 'ArrowLeft':
        if (this.selectedCutIndex >= 0) {
          e.preventDefault();
          this.nudgeCut(this.selectedCutIndex, -1);
        }
        break;
      case 'ArrowRight':
        if (this.selectedCutIndex >= 0) {
          e.preventDefault();
          this.nudgeCut(this.selectedCutIndex, 1);
        }
        break;
      case 'Tab':
        if (this.cuts.length > 0) {
          e.preventDefault();
          if (e.shiftKey) {
            // Previous cut
            this.selectedCutIndex = this.selectedCutIndex <= 0
              ? this.cuts.length - 1
              : this.selectedCutIndex - 1;
          } else {
            // Next cut
            this.selectedCutIndex = this.selectedCutIndex >= this.cuts.length - 1
              ? 0
              : this.selectedCutIndex + 1;
          }
          this.emit('cutSelected', { cutIndex: this.selectedCutIndex });
          this.render();
        }
        break;
    }
  }

  private nudgeCut(cutIndex: number, deltaFrames: number): void {
    if (cutIndex < 0 || cutIndex >= this.cuts.length) return;
    const cut = this.cuts[cutIndex]!;
    const newPosition = Math.max(1, cut.startFrame + deltaFrames);
    this.moveCut(cutIndex, newPosition);
  }

  private renderRuler(): void {
    // Preserve the ruler playhead; clear everything else
    const children = Array.from(this.rulerContainer.children);
    for (const child of children) {
      if (child !== this.rulerPlayheadElement) {
        child.remove();
      }
    }

    const width = this.totalFrames * this.pixelsPerFrame;
    this.rulerContainer.style.width = `${width}px`;

    // Draw frame markers
    const markerSpacing = Math.max(1, Math.floor(50 / this.pixelsPerFrame));
    for (let frame = 0; frame <= this.totalFrames; frame += markerSpacing) {
      const marker = document.createElement('div');
      marker.style.cssText = `
        position: absolute;
        left: ${frame * this.pixelsPerFrame}px;
        top: 0;
        height: 100%;
        border-left: 1px solid var(--border-secondary);
      `;

      const label = document.createElement('span');
      label.textContent = String(frame);
      label.style.cssText = `
        position: absolute;
        left: 2px;
        top: 2px;
        font-size: 10px;
        color: var(--text-muted);
      `;
      marker.appendChild(label);
      this.rulerContainer.appendChild(marker);
    }
  }

  private renderCuts(): void {
    // Preserve the playhead; clear everything else
    const children = Array.from(this.cutsContainer.children);
    for (const child of children) {
      if (child !== this.playheadElement) {
        child.remove();
      }
    }

    const width = this.totalFrames * this.pixelsPerFrame;
    this.cutsContainer.style.width = `${width}px`;

    if (this.cuts.length === 0) {
      // Empty state message anchored to the visible scroll area via the
      // timelineContainer (the scrollable parent) so it stays centered even
      // when the cutsContainer itself is narrower or wider than the viewport.
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'timeline-empty-state';
      emptyMsg.textContent = 'No cuts in timeline. Load a sequence to begin editing.';
      emptyMsg.style.cssText = `
        color: var(--text-muted);
        font-size: 12px;
        padding: 16px;
        text-align: center;
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 300px;
        pointer-events: none;
      `;
      this.cutsContainer.appendChild(emptyMsg);
      return;
    }

    for (const cut of this.cuts) {
      const cutEl = this.createCutElement(cut);
      this.cutsContainer.appendChild(cutEl);
    }
  }

  private createCutElement(cut: CutVisual): HTMLElement {
    const el = document.createElement('div');
    const isSelected = cut.index === this.selectedCutIndex;
    const x = (cut.startFrame - 1) * this.pixelsPerFrame;
    const width = (cut.endFrame - cut.startFrame + 1) * this.pixelsPerFrame;

    el.className = 'timeline-cut';
    el.dataset.index = String(cut.index);

    const filterStyle = isSelected ? '' : 'filter: saturate(0.75) brightness(0.85);';
    const boxShadow = isSelected ? 'box-shadow: 0 0 8px rgba(74, 144, 217, 0.4);' : '';
    const gradientOverlay = isSelected
      ? 'background-image: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.08) 100%);'
      : '';

    el.style.cssText = `
      position: absolute;
      left: ${x}px;
      width: ${width}px;
      height: 100%;
      background-color: ${cut.color};
      ${gradientOverlay}
      border-radius: 4px;
      cursor: move;
      box-sizing: border-box;
      border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'transparent'};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      ${filterStyle}
      ${boxShadow}
      transition: filter 0.1s;
    `;

    // Remove filter on hover for full vibrancy
    el.addEventListener('mouseenter', () => {
      el.style.filter = '';
    });
    el.addEventListener('mouseleave', () => {
      if (cut.index !== this.selectedCutIndex) {
        el.style.filter = 'saturate(0.75) brightness(0.85)';
      }
    });

    // Top row: source label
    const label = document.createElement('span');
    label.textContent = cut.label;
    label.style.cssText = `
      font-size: 11px;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      pointer-events: none;
      white-space: nowrap;
    `;
    el.appendChild(label);

    // Bottom row: timecode metadata (only when cut is wide enough)
    if (width > 60) {
      const fps = this._session.fps || 24;
      const inTC = formatTimecode(cut.inPoint, fps);
      const outTC = formatTimecode(cut.outPoint, fps);
      const duration = cut.outPoint - cut.inPoint + 1;

      const metaRow = document.createElement('span');
      metaRow.textContent = `${inTC}\u2013${outTC} | ${duration}f`;
      metaRow.style.cssText = `
        font-size: 9px;
        color: white;
        opacity: 0.7;
        pointer-events: none;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      `;
      el.appendChild(metaRow);
    }

    // Trim handles
    const leftHandle = this.createTrimHandle('left');
    const rightHandle = this.createTrimHandle('right');
    el.appendChild(leftHandle);
    el.appendChild(rightHandle);

    // Click to select
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectedCutIndex = cut.index;
      this.emit('cutSelected', { cutIndex: cut.index });
      this.render();
    });

    // Drag to move
    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('trim-handle')) return;
      e.preventDefault();
      this.startDrag('move', cut.index, e.clientX, cut.startFrame);
    });

    // Context menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(cut.index, e.clientX, e.clientY);
    });

    return el;
  }

  private createTrimHandle(side: 'left' | 'right'): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'trim-handle';

    const gripBorder = side === 'left'
      ? 'border-left: 2px dotted rgba(255,255,255,0.4);'
      : 'border-right: 2px dotted rgba(255,255,255,0.4);';

    handle.style.cssText = `
      position: absolute;
      ${side}: 0;
      top: 0;
      width: 10px;
      height: 100%;
      cursor: ew-resize;
      background: rgba(255,255,255,0.3);
      opacity: 0.25;
      transition: opacity 0.1s, background 0.1s;
      ${gripBorder}
    `;

    handle.addEventListener('mouseenter', () => {
      handle.style.opacity = '1';
      handle.style.background = 'rgba(255,255,255,0.5)';
    });
    handle.addEventListener('mouseleave', () => {
      if (!this.isDragging) {
        handle.style.opacity = '0.25';
        handle.style.background = 'rgba(255,255,255,0.3)';
      }
    });

    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const cutEl = handle.parentElement!;
      const cutIndex = parseInt(cutEl.dataset.index!);
      const cut = this.cuts[cutIndex]!;

      this.startDrag(
        side === 'left' ? 'trim-in' : 'trim-out',
        cutIndex,
        e.clientX,
        side === 'left' ? cut.inPoint : cut.outPoint
      );
    });

    return handle;
  }

  private startDrag(type: 'move' | 'trim-in' | 'trim-out', cutIndex: number, clientX: number, startFrame: number): void {
    this.isDragging = true;
    this.dragType = type;
    this.selectedCutIndex = cutIndex;
    this.dragStartX = clientX;
    this.dragStartFrame = startFrame;
  }

  private getSnapThreshold(): number {
    return Math.max(1, Math.round(5 / this.pixelsPerFrame));
  }

  private snapToNearestBoundary(frame: number, excludeCutIndex: number): number {
    const threshold = this.getSnapThreshold();
    let bestSnap = frame;
    let bestDist = threshold + 1;

    for (let i = 0; i < this.cuts.length; i++) {
      if (i === excludeCutIndex) continue;
      const cut = this.cuts[i]!;

      const distStart = Math.abs(frame - cut.startFrame);
      if (distStart < bestDist) {
        bestDist = distStart;
        bestSnap = cut.startFrame;
      }

      const distEnd = Math.abs(frame - (cut.endFrame + 1));
      if (distEnd < bestDist) {
        bestDist = distEnd;
        bestSnap = cut.endFrame + 1;
      }
    }

    return bestDist <= threshold ? bestSnap : frame;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging || this.selectedCutIndex < 0) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaFrames = Math.round(deltaX / this.pixelsPerFrame);
    const cut = this.cuts[this.selectedCutIndex]!;

    switch (this.dragType) {
      case 'move': {
        let newPosition = Math.max(1, this.dragStartFrame + deltaFrames);
        newPosition = this.snapToNearestBoundary(newPosition, this.selectedCutIndex);
        cut.startFrame = newPosition;
        cut.endFrame = newPosition + (cut.outPoint - cut.inPoint);
        break;
      }

      case 'trim-in': {
        const newInPoint = Math.max(1, this.dragStartFrame + deltaFrames);
        if (newInPoint < cut.outPoint) {
          const deltaIn = newInPoint - cut.inPoint;
          cut.inPoint = newInPoint;
          cut.startFrame += deltaIn;
        }
        break;
      }

      case 'trim-out': {
        const newOutPoint = Math.max(cut.inPoint + 1, this.dragStartFrame + deltaFrames);
        const deltaOut = newOutPoint - cut.outPoint;
        cut.outPoint = newOutPoint;
        cut.endFrame += deltaOut;
        break;
      }
    }

    this.render();
  }

  private handleMouseUp(): void {
    if (!this.isDragging) return;

    const cutIndex = this.selectedCutIndex;
    const cut = this.cuts[cutIndex];

    if (cut) {
      switch (this.dragType) {
        case 'move':
          this.emit('cutMoved', { cutIndex, newPosition: cut.startFrame });
          break;
        case 'trim-in':
        case 'trim-out':
          this.emit('cutTrimmed', { cutIndex, inPoint: cut.inPoint, outPoint: cut.outPoint });
          break;
      }
    }

    this.isDragging = false;
    this.dragType = null;
  }

  private showContextMenu(cutIndex: number, x: number, y: number): void {
    // Remove any existing context menu
    const existing = document.querySelector('.timeline-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'timeline-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      min-width: 180px;
    `;

    // Split at Playhead
    const splitItem = this.createMenuItem('Split at Playhead', 'S', () => {
      this.splitCutAtFrame(cutIndex, this.currentFrame);
      menu.remove();
    });
    menu.appendChild(splitItem);

    // Duplicate Cut
    const duplicateItem = this.createMenuItem('Duplicate Cut', 'D', () => {
      const cut = this.cuts[cutIndex];
      if (cut) {
        this.insertCut(cut.endFrame + 1, cut.sourceIndex, cut.inPoint, cut.outPoint);
      }
      menu.remove();
    });
    menu.appendChild(duplicateItem);

    // Separator
    const separator = document.createElement('div');
    separator.style.cssText = 'height: 1px; background: var(--border-primary); margin: 4px 0;';
    menu.appendChild(separator);

    // Delete Cut
    const deleteItem = this.createMenuItem('Delete Cut', 'Del', () => {
      this.deleteCut(cutIndex);
      menu.remove();
    });
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);

    // Close on click outside
    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
        this.activeContextMenuHandler = null;
      }
    };
    // Store reference for cleanup
    this.activeContextMenuHandler = closeHandler;
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  private createMenuItem(label: string, shortcut: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-primary);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;

    const shortcutSpan = document.createElement('span');
    shortcutSpan.textContent = shortcut;
    shortcutSpan.style.cssText = 'color: var(--text-muted); font-size: 11px; margin-left: 16px;';

    item.appendChild(labelSpan);
    item.appendChild(shortcutSpan);

    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--bg-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });
    item.addEventListener('click', onClick);
    return item;
  }
}
