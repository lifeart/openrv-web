/**
 * PlaylistPanel - UI panel for managing multi-clip playlists.
 *
 * Features:
 * - Draggable clip list for reordering
 * - In/out point editing per clip
 * - Total duration display
 * - Add from current source button
 * - EDL import/export
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { PlaylistManager, PlaylistClip } from '../../core/session/PlaylistManager';
import { TransitionManager } from '../../core/session/TransitionManager';
import { isTransitionType, DEFAULT_TRANSITION_DURATION, type TransitionType } from '../../core/types/transition';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { downloadEDL, type EDLClip, type EDLTransition } from '../../export/EDLWriter';
import { exportOTIO, type OTIOExportClip } from '../../utils/media/OTIOWriter';

export interface PlaylistPanelEvents extends EventMap {
  /** Emitted when user wants to add current source as clip */
  addCurrentSource: void;
  /** Emitted when user selects a clip */
  clipSelected: { clipId: string; sourceIndex: number; frame: number };
  /** Emitted when panel visibility changes */
  visibilityChanged: { open: boolean };
  /** Emitted when panel is closed */
  closed: void;
}

/** Interface for panels that support mutual exclusion */
export interface ExclusivePanel {
  isOpen(): boolean;
  hide(): void;
}

/** Human-readable labels for transition types */
const TRANSITION_TYPE_LABELS: Record<TransitionType, string> = {
  'cut': 'Cut',
  'crossfade': 'Crossfade',
  'dissolve': 'Dissolve',
  'wipe-left': 'Wipe Left',
  'wipe-right': 'Wipe Right',
  'wipe-up': 'Wipe Up',
  'wipe-down': 'Wipe Down',
};

export class PlaylistPanel extends EventEmitter<PlaylistPanelEvents> {
  private container: HTMLElement;
  private listContainer: HTMLElement;
  private footerInfo: HTMLElement;
  private playlistManager: PlaylistManager;
  private transitionManager: TransitionManager | null = null;
  private isVisible = false;
  private draggedClipId: string | null = null;
  private exclusivePanel: ExclusivePanel | null = null;
  private activeClipId: string | null = null;
  private fps = 24;

  constructor(playlistManager: PlaylistManager) {
    super();
    this.playlistManager = playlistManager;

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'playlist-panel';
    this.container.dataset.testid = 'playlist-panel';
    this.container.style.cssText = `
      position: fixed;
      right: 16px;
      top: 60px;
      width: 340px;
      max-height: calc(100vh - 120px);
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      z-index: 1000;
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-primary);
      background: var(--bg-tertiary);
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: var(--text-primary);
    `;
    title.innerHTML = `${getIconSvg('layers', 'sm')}<span>Playlist</span>`;
    header.appendChild(title);

    const headerActions = document.createElement('div');
    headerActions.style.cssText = 'display: flex; gap: 4px; align-items: center;';

    // Enable toggle
    const enableToggle = document.createElement('button');
    enableToggle.title = 'Enable Playlist Mode';
    enableToggle.innerHTML = getIconSvg('play', 'sm');
    enableToggle.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-primary);
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
    `;
    enableToggle.addEventListener('click', () => {
      const enabled = !this.playlistManager.isEnabled();
      this.playlistManager.setEnabled(enabled);
      this.updateEnableButton(enableToggle, enabled);
    });
    this.updateEnableButton(enableToggle, this.playlistManager.isEnabled());
    applyA11yFocus(enableToggle);
    headerActions.appendChild(enableToggle);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = getIconSvg('close', 'sm');
    closeBtn.title = 'Close';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'var(--bg-hover)';
      closeBtn.style.color = 'var(--text-primary)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = 'var(--text-muted)';
    });
    applyA11yFocus(closeBtn);
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);
    this.container.appendChild(header);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--border-primary);
    `;

    // Add current source button
    const addBtn = document.createElement('button');
    addBtn.innerHTML = `${getIconSvg('plus', 'sm')} Add Current`;
    addBtn.title = 'Add current source to playlist';
    addBtn.style.cssText = `
      flex: 1;
      padding: 8px;
      border: 1px solid var(--accent-primary);
      border-radius: 4px;
      background: rgba(var(--accent-primary-rgb), 0.1);
      color: var(--accent-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 12px;
      transition: all 0.12s ease;
    `;
    addBtn.addEventListener('click', () => this.emit('addCurrentSource', undefined));
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = 'rgba(var(--accent-primary-rgb), 0.1)';
    });
    applyA11yFocus(addBtn);
    toolbar.appendChild(addBtn);

    // Loop mode selector
    const loopSelect = document.createElement('select');
    loopSelect.title = 'Loop Mode';
    loopSelect.style.cssText = `
      padding: 8px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      outline: none;
    `;
    loopSelect.innerHTML = `
      <option value="none">No Loop</option>
      <option value="single">Loop Clip</option>
      <option value="all">Loop All</option>
    `;
    loopSelect.value = this.playlistManager.getLoopMode();
    loopSelect.addEventListener('change', () => {
      this.playlistManager.setLoopMode(loopSelect.value as 'none' | 'single' | 'all');
    });
    toolbar.appendChild(loopSelect);

    this.container.appendChild(toolbar);

    // List container
    this.listContainer = document.createElement('div');
    this.listContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      min-height: 100px;
    `;
    this.container.appendChild(this.listContainer);

    // Footer with info and export
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-top: 1px solid var(--border-primary);
      background: var(--bg-tertiary);
    `;

    this.footerInfo = document.createElement('div');
    this.footerInfo.style.cssText = `
      font-size: 11px;
      color: var(--text-muted);
    `;
    this.updateFooterInfo();
    footer.appendChild(this.footerInfo);

    const exportBtn = document.createElement('button');
    exportBtn.innerHTML = `${getIconSvg('download', 'sm')} EDL`;
    exportBtn.title = 'Export as EDL';
    exportBtn.style.cssText = `
      padding: 6px 10px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      transition: all 0.12s ease;
    `;
    exportBtn.addEventListener('click', () => this.exportEDL());
    exportBtn.addEventListener('mouseenter', () => {
      exportBtn.style.background = 'var(--bg-hover)';
    });
    exportBtn.addEventListener('mouseleave', () => {
      exportBtn.style.background = 'transparent';
    });
    applyA11yFocus(exportBtn);

    const otioBtn = document.createElement('button');
    otioBtn.innerHTML = `${getIconSvg('download', 'sm')} OTIO`;
    otioBtn.title = 'Export as OTIO';
    otioBtn.style.cssText = exportBtn.style.cssText;
    otioBtn.addEventListener('click', () => this.exportOTIO());
    otioBtn.addEventListener('mouseenter', () => {
      otioBtn.style.background = 'var(--bg-hover)';
    });
    otioBtn.addEventListener('mouseleave', () => {
      otioBtn.style.background = 'transparent';
    });
    applyA11yFocus(otioBtn);

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display: flex; gap: 4px;';
    btnGroup.appendChild(exportBtn);
    btnGroup.appendChild(otioBtn);
    footer.appendChild(btnGroup);

    this.container.appendChild(footer);

    // Listen for playlist changes
    this.playlistManager.on('clipsChanged', () => {
      this.renderList();
      this.updateFooterInfo();
    });
    this.playlistManager.on('enabledChanged', ({ enabled }) => {
      this.updateEnableButton(enableToggle, enabled);
    });
    this.playlistManager.on('loopModeChanged', ({ mode }) => {
      loopSelect.value = mode;
    });
  }

  private updateEnableButton(btn: HTMLButtonElement, enabled: boolean): void {
    if (enabled) {
      btn.innerHTML = `${getIconSvg('pause', 'sm')} On`;
      btn.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.color = 'var(--accent-primary)';
      btn.title = 'Disable Playlist Mode';
    } else {
      btn.innerHTML = `${getIconSvg('play', 'sm')} Off`;
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--border-primary)';
      btn.style.color = 'var(--text-muted)';
      btn.title = 'Enable Playlist Mode';
    }
  }

  private updateFooterInfo(): void {
    const clips = this.playlistManager.getClips();
    const totalDuration = this.playlistManager.getTotalDuration();
    const durationStr = this.formatDuration(totalDuration, this.fps);
    this.footerInfo.textContent = `${clips.length} clip${clips.length !== 1 ? 's' : ''} \u2022 ${durationStr}`;
  }

  private formatDuration(frames: number, fps = 24): string {
    const totalSeconds = frames / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  private renderList(): void {
    this.listContainer.innerHTML = '';
    const clips = this.playlistManager.getClips();

    if (clips.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = `
        text-align: center;
        padding: 32px 16px;
        color: var(--text-muted);
        font-size: 12px;
      `;
      emptyState.innerHTML = `
        ${getIconSvg('layers', 'lg')}
        <p style="margin-top: 12px;">No clips in playlist</p>
        <p style="margin-top: 4px; font-size: 11px;">Click "Add Current" to add the current source</p>
      `;
      this.listContainer.appendChild(emptyState);
      return;
    }

    clips.forEach((clip, index) => {
      const item = this.createClipItem(clip, index);
      this.listContainer.appendChild(item);

      // Add transition control between adjacent clips (not after the last clip)
      if (index < clips.length - 1 && this.transitionManager) {
        const transitionRow = this.createTransitionControl(index, clips);
        this.listContainer.appendChild(transitionRow);
      }
    });
  }

  private createClipItem(clip: PlaylistClip, index: number): HTMLElement {
    const isActive = clip.id === this.activeClipId;
    const item = document.createElement('div');
    item.className = 'playlist-clip-item';
    item.dataset.clipId = clip.id;
    item.draggable = true;
    item.style.cssText = `
      padding: 10px 12px;
      margin-bottom: 6px;
      border: 1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-primary)'};
      border-left: 3px solid ${isActive ? 'var(--accent-primary)' : 'transparent'};
      border-radius: 6px;
      background: ${isActive ? 'rgba(var(--accent-primary-rgb), 0.08)' : 'var(--bg-primary)'};
      cursor: grab;
      transition: all 0.12s ease;
    `;

    // Drag events
    item.addEventListener('dragstart', (e) => {
      this.draggedClipId = clip.id;
      item.style.opacity = '0.5';
      e.dataTransfer?.setData('text/plain', clip.id);
    });
    item.addEventListener('dragend', () => {
      this.draggedClipId = null;
      item.style.opacity = '1';
      this.renderList();
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.draggedClipId && this.draggedClipId !== clip.id) {
        item.style.borderTopColor = 'var(--accent-primary)';
        item.style.borderTopWidth = '2px';
      }
    });
    item.addEventListener('dragleave', () => {
      item.style.borderTopColor = 'var(--border-primary)';
      item.style.borderTopWidth = '1px';
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.draggedClipId && this.draggedClipId !== clip.id) {
        this.playlistManager.moveClip(this.draggedClipId, index);
      }
    });

    // Header row with index and name
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    `;

    const indexBadge = document.createElement('span');
    indexBadge.textContent = String(index + 1);
    indexBadge.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    `;
    headerRow.appendChild(indexBadge);

    const name = document.createElement('div');
    name.style.cssText = `
      flex: 1;
      font-weight: 500;
      color: var(--text-primary);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    name.textContent = clip.sourceName;
    name.title = clip.sourceName;
    headerRow.appendChild(name);

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = getIconSvg('x', 'sm');
    deleteBtn.title = 'Remove clip';
    deleteBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 3px;
      display: flex;
      opacity: 0.6;
      transition: opacity 0.12s ease;
    `;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.playlistManager.removeClip(clip.id);
    });
    deleteBtn.addEventListener('mouseenter', () => {
      deleteBtn.style.opacity = '1';
      deleteBtn.style.color = 'var(--text-danger)';
    });
    deleteBtn.addEventListener('mouseleave', () => {
      deleteBtn.style.opacity = '0.6';
      deleteBtn.style.color = 'var(--text-muted)';
    });
    headerRow.appendChild(deleteBtn);

    item.appendChild(headerRow);

    // Info row
    const infoRow = document.createElement('div');
    infoRow.style.cssText = `
      display: flex;
      gap: 12px;
      font-size: 10px;
      color: var(--text-muted);
    `;

    const inOutSpan = document.createElement('span');
    inOutSpan.textContent = `In: ${clip.inPoint} \u2022 Out: ${clip.outPoint}`;
    infoRow.appendChild(inOutSpan);

    const durationSpan = document.createElement('span');
    durationSpan.textContent = `${clip.duration} frames`;
    infoRow.appendChild(durationSpan);

    item.appendChild(infoRow);

    // Trim controls
    const trimRow = document.createElement('div');
    trimRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
      font-size: 10px;
      color: var(--text-muted);
    `;

    const inLabel = document.createElement('span');
    inLabel.textContent = 'In';
    trimRow.appendChild(inLabel);

    const inInput = document.createElement('input');
    inInput.type = 'number';
    inInput.min = '1';
    inInput.value = String(clip.inPoint);
    inInput.title = 'Clip in point';
    inInput.style.cssText = `
      width: 58px;
      padding: 2px 4px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 11px;
    `;
    trimRow.appendChild(inInput);

    const outLabel = document.createElement('span');
    outLabel.textContent = 'Out';
    trimRow.appendChild(outLabel);

    const outInput = document.createElement('input');
    outInput.type = 'number';
    outInput.min = inInput.value;
    outInput.value = String(clip.outPoint);
    outInput.title = 'Clip out point';
    outInput.style.cssText = inInput.style.cssText;
    trimRow.appendChild(outInput);

    const commitTrim = (): void => {
      const nextIn = Number.parseInt(inInput.value, 10);
      const nextOut = Number.parseInt(outInput.value, 10);
      const valid = Number.isFinite(nextIn) && Number.isFinite(nextOut) && nextIn >= 1 && nextOut >= nextIn;
      if (!valid) {
        inInput.value = String(clip.inPoint);
        outInput.value = String(clip.outPoint);
        return;
      }
      if (nextIn !== clip.inPoint || nextOut !== clip.outPoint) {
        this.playlistManager.updateClipPoints(clip.id, nextIn, nextOut);
      }
    };

    const bindTrimInput = (input: HTMLInputElement): void => {
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          commitTrim();
        }
      });
      input.addEventListener('change', commitTrim);
      input.addEventListener('blur', commitTrim);
    };

    bindTrimInput(inInput);
    bindTrimInput(outInput);
    item.appendChild(trimRow);

    // Click to select/jump
    item.addEventListener('click', () => {
      this.emit('clipSelected', {
        clipId: clip.id,
        sourceIndex: clip.sourceIndex,
        frame: clip.globalStartFrame,
      });
    });

    // Hover effects
    item.addEventListener('mouseenter', () => {
      if (!isActive) {
        item.style.borderColor = 'var(--border-hover)';
        item.style.background = 'var(--bg-hover)';
      }
    });
    item.addEventListener('mouseleave', () => {
      if (!isActive) {
        item.style.borderColor = 'var(--border-primary)';
        item.style.background = 'var(--bg-primary)';
      }
    });

    return item;
  }

  private createTransitionControl(gapIndex: number, clips: PlaylistClip[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'playlist-transition-row';
    row.dataset.testid = `transition-control-${gapIndex}`;
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      margin-bottom: 6px;
      border-left: 3px solid transparent;
      font-size: 10px;
      color: var(--text-muted);
    `;

    const tm = this.transitionManager!;
    const currentTransition = tm.getTransition(gapIndex);
    const currentType: TransitionType = currentTransition?.type ?? 'cut';
    const currentDuration = currentTransition?.durationFrames ?? DEFAULT_TRANSITION_DURATION;

    // Check if same source (same sourceIndex) for adjacent clips
    const outgoing = clips[gapIndex];
    const incoming = clips[gapIndex + 1];
    const isSameSource = outgoing && incoming && outgoing.sourceIndex === incoming.sourceIndex;

    // Transition icon
    const icon = document.createElement('span');
    icon.innerHTML = getIconSvg('layers', 'sm');
    icon.style.cssText = 'flex-shrink: 0; opacity: 0.6;';
    row.appendChild(icon);

    // Type dropdown
    const typeSelect = document.createElement('select');
    typeSelect.dataset.testid = `transition-type-${gapIndex}`;
    typeSelect.style.cssText = `
      padding: 2px 4px;
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 10px;
      cursor: pointer;
      outline: none;
      flex: 1;
      min-width: 0;
    `;

    for (const [type, label] of Object.entries(TRANSITION_TYPE_LABELS)) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = label;
      typeSelect.appendChild(option);
    }
    typeSelect.value = currentType;

    if (isSameSource) {
      typeSelect.value = 'cut';
      typeSelect.disabled = true;
      typeSelect.title = 'Same source: transitions not supported';
    }

    row.appendChild(typeSelect);

    // Duration input
    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.min = '1';
    durationInput.max = '120';
    durationInput.step = '1';
    durationInput.value = String(currentDuration);
    durationInput.dataset.testid = `transition-duration-${gapIndex}`;
    durationInput.title = 'Transition duration (frames)';
    durationInput.style.cssText = `
      width: 42px;
      padding: 2px 4px;
      border: 1px solid var(--border-primary);
      border-radius: 3px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 10px;
      text-align: center;
    `;

    // Hide duration input for cuts
    const isCut = currentType === 'cut';
    durationInput.style.display = isCut ? 'none' : 'inline-block';

    if (isSameSource) {
      durationInput.disabled = true;
      durationInput.style.display = 'none';
    }

    row.appendChild(durationInput);

    // Duration label showing seconds
    const durationLabel = document.createElement('span');
    durationLabel.dataset.testid = `transition-duration-label-${gapIndex}`;
    durationLabel.style.cssText = 'white-space: nowrap; opacity: 0.7;';
    const seconds = (currentDuration / this.fps).toFixed(1);
    durationLabel.textContent = `${currentDuration}f (${seconds}s)`;
    durationLabel.style.display = isCut || isSameSource ? 'none' : 'inline';
    row.appendChild(durationLabel);

    // Event handlers
    const applyTransition = (): void => {
      const selectedType = typeSelect.value;
      if (!isTransitionType(selectedType)) return;

      if (selectedType === 'cut') {
        tm.setTransition(gapIndex, null);
        durationInput.style.display = 'none';
        durationLabel.style.display = 'none';
      } else {
        const frames = Math.max(1, Math.min(120, Number.parseInt(durationInput.value, 10) || DEFAULT_TRANSITION_DURATION));
        const validated = tm.validateTransition(gapIndex, { type: selectedType, durationFrames: frames }, clips);
        if (validated) {
          tm.setTransition(gapIndex, validated);
          durationInput.value = String(validated.durationFrames);
          const secs = (validated.durationFrames / this.fps).toFixed(1);
          durationLabel.textContent = `${validated.durationFrames}f (${secs}s)`;
        } else {
          // Can't apply transition, revert to cut
          typeSelect.value = 'cut';
          tm.setTransition(gapIndex, null);
        }
        durationInput.style.display = typeSelect.value === 'cut' ? 'none' : 'inline-block';
        durationLabel.style.display = typeSelect.value === 'cut' ? 'none' : 'inline';
      }
    };

    typeSelect.addEventListener('change', applyTransition);

    const commitDuration = (): void => {
      applyTransition();
    };

    durationInput.addEventListener('click', (e) => e.stopPropagation());
    durationInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        commitDuration();
      }
    });
    durationInput.addEventListener('change', commitDuration);
    durationInput.addEventListener('blur', commitDuration);

    return row;
  }

  private exportEDL(): void {
    const clips = this.playlistManager.getClips();
    // When transitions exist, use overlap-adjusted frames for accurate record timecodes
    const adjustedClips = this.transitionManager
      ? this.transitionManager.calculateOverlapAdjustedFrames(clips)
      : clips;
    const edlClips: EDLClip[] = adjustedClips.map((clip, index) => {
      const edlClip: EDLClip = {
        sourceName: clip.sourceName,
        sourceIn: clip.inPoint,
        sourceOut: clip.outPoint + 1, // EDL uses exclusive out point
        recordIn: clip.globalStartFrame,
        recordOut: clip.globalStartFrame + clip.duration,
      };

      // Add dissolve transition if configured (crossfade and dissolve map to EDL dissolve)
      if (this.transitionManager && index > 0) {
        const transition = this.transitionManager.getTransition(index - 1);
        if (transition && (transition.type === 'crossfade' || transition.type === 'dissolve')) {
          const edlTransition: EDLTransition = {
            type: 'dissolve',
            durationFrames: transition.durationFrames,
          };
          edlClip.transition = edlTransition;
        }
      }

      return edlClip;
    });
    downloadEDL(edlClips, 'playlist.edl', {
      title: 'OpenRV Playlist',
      fps: this.fps,
    });
  }

  private exportOTIO(): void {
    const clips = this.playlistManager.getClips();
    const otioClips: OTIOExportClip[] = clips.map((clip) => ({
      sourceName: clip.sourceName,
      sourceUrl: '',
      inPoint: clip.inPoint,
      outPoint: clip.outPoint,
      globalStartFrame: clip.globalStartFrame,
      duration: clip.duration,
      fps: this.fps,
    }));
    const json = exportOTIO(otioClips, { name: 'OpenRV Playlist', fps: this.fps });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'playlist.otio';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Public methods

  /** Set the frames-per-second used for EDL/OTIO export timecodes */
  setFps(fps: number): void {
    this.fps = fps > 0 ? fps : 24;
  }

  /** Set the transition manager for configuring transitions between clips */
  setTransitionManager(tm: TransitionManager): void {
    this.transitionManager = tm;
    tm.on('transitionChanged', () => {
      if (this.isVisible) {
        this.renderList();
        this.updateFooterInfo();
      }
    });
  }

  setExclusiveWith(panel: ExclusivePanel): void {
    this.exclusivePanel = panel;
  }

  show(): void {
    // Close the exclusive panel if it is open
    if (this.exclusivePanel?.isOpen()) {
      this.exclusivePanel.hide();
    }
    if (!document.body.contains(this.container)) {
      document.body.appendChild(this.container);
    }
    this.container.style.display = 'flex';
    this.isVisible = true;
    this.emit('visibilityChanged', { open: true });
    this.renderList();
  }

  hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
    this.emit('visibilityChanged', { open: false });
    this.emit('closed', undefined);
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  /** Update the currently active/playing clip and re-render to highlight it */
  setActiveClip(clipId: string | null): void {
    if (this.activeClipId === clipId) return;
    this.activeClipId = clipId;
    if (this.isVisible) {
      this.renderList();
      // Auto-scroll to the active clip
      if (clipId) {
        const activeEl = this.listContainer.querySelector(`[data-clip-id="${clipId}"]`) as HTMLElement | null;
        activeEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.hide();
    if (document.body.contains(this.container)) {
      document.body.removeChild(this.container);
    }
  }
}
