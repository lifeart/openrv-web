/**
 * TimelineEditor - Visual EDL/Timeline editing component
 *
 * Provides UI for editing cuts in a SequenceGroupNode, including:
 * - Visual cut representation as colored blocks
 * - Drag handles for trimming
 * - Drag to reorder cuts
 * - Context menu for delete/split operations
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
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
  private zoomSlider: HTMLInputElement | null = null;

  // State
  private cuts: CutVisual[] = [];
  private selectedCutIndex: number = -1;
  private totalFrames: number = 100;
  private pixelsPerFrame: number = 2;
  private isDragging: boolean = false;
  private dragType: 'move' | 'trim-in' | 'trim-out' | null = null;
  private dragStartX: number = 0;
  private dragStartFrame: number = 0;

  // Bound event handlers for cleanup
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: () => void;
  private boundZoomInput: ((e: Event) => void) | null = null;
  private activeContextMenuHandler: ((e: MouseEvent) => void) | null = null;

  constructor(container: HTMLElement, session: Session, sequenceNode?: SequenceGroupNode) {
    super();

    this.container = container;
    this._session = session;
    this.sequenceNode = sequenceNode ?? null;

    // Bind event handlers for cleanup
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);

    // Create UI structure
    this.controlsContainer = this.createControlsContainer();
    this.rulerContainer = this.createRulerContainer();
    this.timelineContainer = this.createTimelineContainer();
    this.cutsContainer = this.createCutsContainer();

    this.timelineContainer.appendChild(this.cutsContainer);

    this.container.appendChild(this.controlsContainer);
    this.container.appendChild(this.rulerContainer);
    this.container.appendChild(this.timelineContainer);

    this.setupEventListeners();

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

    this.cuts = [];
    let currentFrame = 1;

    if (edlEntries.length > 0) {
      for (let i = 0; i < edlEntries.length; i++) {
        const entry = edlEntries[i]!;
        const duration = entry.outPoint - entry.inPoint + 1;

        this.cuts.push({
          index: i,
          startFrame: entry.frame,
          endFrame: entry.frame + duration - 1,
          sourceIndex: entry.source,
          inPoint: entry.inPoint,
          outPoint: entry.outPoint,
          color: CUT_COLORS[entry.source % CUT_COLORS.length]!,
          label: `Source ${entry.source + 1}`,
        });

        currentFrame = entry.frame + duration;
      }
      this.totalFrames = currentFrame;
    } else {
      // No EDL data - show empty timeline
      this.totalFrames = node.getTotalDuration() || 100;
    }

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
   * Render the timeline UI
   */
  render(): void {
    this.renderRuler();
    this.renderCuts();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Remove document-level event listeners
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);

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

  private createControlsContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'timeline-controls';
    container.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 8px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-primary);
    `;

    // Zoom controls
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

    container.appendChild(zoomLabel);
    container.appendChild(this.zoomSlider);

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
  }

  private renderRuler(): void {
    this.rulerContainer.innerHTML = '';

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
    this.cutsContainer.innerHTML = '';

    const width = this.totalFrames * this.pixelsPerFrame;
    this.cutsContainer.style.width = `${width}px`;

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
    el.style.cssText = `
      position: absolute;
      left: ${x}px;
      width: ${width}px;
      height: 100%;
      background: ${cut.color};
      border-radius: 4px;
      cursor: move;
      box-sizing: border-box;
      border: 2px solid ${isSelected ? 'var(--accent-primary)' : 'transparent'};
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    `;

    // Label
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
    handle.style.cssText = `
      position: absolute;
      ${side}: 0;
      top: 0;
      width: 8px;
      height: 100%;
      cursor: ew-resize;
      background: rgba(255,255,255,0.3);
      opacity: 0;
      transition: opacity 0.1s;
    `;

    handle.addEventListener('mouseenter', () => {
      handle.style.opacity = '1';
    });
    handle.addEventListener('mouseleave', () => {
      if (!this.isDragging) handle.style.opacity = '0';
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

  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging || this.selectedCutIndex < 0) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaFrames = Math.round(deltaX / this.pixelsPerFrame);
    const cut = this.cuts[this.selectedCutIndex]!;

    switch (this.dragType) {
      case 'move':
        const newPosition = Math.max(1, this.dragStartFrame + deltaFrames);
        cut.startFrame = newPosition;
        cut.endFrame = newPosition + (cut.outPoint - cut.inPoint);
        break;

      case 'trim-in':
        const newInPoint = Math.max(1, this.dragStartFrame + deltaFrames);
        if (newInPoint < cut.outPoint) {
          const deltaIn = newInPoint - cut.inPoint;
          cut.inPoint = newInPoint;
          cut.startFrame += deltaIn;
        }
        break;

      case 'trim-out':
        const newOutPoint = Math.max(cut.inPoint + 1, this.dragStartFrame + deltaFrames);
        const deltaOut = newOutPoint - cut.outPoint;
        cut.outPoint = newOutPoint;
        cut.endFrame += deltaOut;
        break;
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
      min-width: 120px;
    `;

    const deleteItem = this.createMenuItem('Delete Cut', () => {
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

  private createMenuItem(label: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.textContent = label;
    item.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-primary);
    `;
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
