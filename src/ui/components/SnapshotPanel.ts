/**
 * SnapshotPanel - UI panel for managing session snapshots.
 *
 * Features:
 * - List view with timestamps, names, descriptions
 * - Actions: Preview, Restore, Export, Delete, Rename
 * - Filter/search functionality
 * - Distinct styling for auto-checkpoints vs manual snapshots
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { SnapshotManager, Snapshot, SnapshotPreview } from '../../core/session/SnapshotManager';
import { getIconSvg, type IconName } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { showPrompt, showConfirm, showAlert } from './shared/Modal';

export interface SnapshotPanelEvents extends EventMap {
  /** Emitted when user wants to restore a snapshot */
  restoreRequested: { id: string };
  /** Emitted when panel is closed */
  closed: void;
}

/** Interface for panels that support mutual exclusion */
export interface ExclusivePanel {
  isOpen(): boolean;
  hide(): void;
}

export class SnapshotPanel extends EventEmitter<SnapshotPanelEvents> {
  private container: HTMLElement;
  private listContainer: HTMLElement;
  private searchInput: HTMLInputElement;
  private filterMode: 'all' | 'manual' | 'auto' = 'all';
  private snapshots: Snapshot[] = [];
  private snapshotManager: SnapshotManager;
  private isVisible = false;
  private exclusivePanel: ExclusivePanel | null = null;

  constructor(snapshotManager: SnapshotManager) {
    super();
    this.snapshotManager = snapshotManager;

    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'snapshot-panel';
    this.container.dataset.testid = 'snapshot-panel';
    this.container.style.cssText = `
      position: fixed;
      right: 16px;
      top: 60px;
      width: 320px;
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
    title.innerHTML = `${getIconSvg('history', 'sm')}<span>Snapshots</span>`;
    header.appendChild(title);

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
    header.appendChild(closeBtn);

    this.container.appendChild(header);

    // Search and filter bar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--border-primary);
    `;

    // Search input
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Search snapshots...';
    this.searchInput.style.cssText = `
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
    `;
    this.searchInput.addEventListener('input', () => this.renderList());
    this.searchInput.addEventListener('focus', () => {
      this.searchInput.style.borderColor = 'var(--accent-primary)';
    });
    this.searchInput.addEventListener('blur', () => {
      this.searchInput.style.borderColor = 'var(--border-primary)';
    });
    toolbar.appendChild(this.searchInput);

    // Filter dropdown
    const filterSelect = document.createElement('select');
    filterSelect.style.cssText = `
      padding: 6px 8px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      outline: none;
    `;
    filterSelect.innerHTML = `
      <option value="all">All</option>
      <option value="manual">Manual</option>
      <option value="auto">Auto</option>
    `;
    filterSelect.addEventListener('change', () => {
      this.filterMode = filterSelect.value as 'all' | 'manual' | 'auto';
      this.renderList();
    });
    toolbar.appendChild(filterSelect);

    this.container.appendChild(toolbar);

    // List container
    this.listContainer = document.createElement('div');
    this.listContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    `;
    this.container.appendChild(this.listContainer);

    // Footer with actions
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--border-primary);
      background: var(--bg-tertiary);
    `;

    const clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.style.cssText = `
      flex: 1;
      padding: 8px;
      border: 1px solid var(--border-danger);
      border-radius: 4px;
      background: transparent;
      color: var(--text-danger);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.12s ease;
    `;
    clearAllBtn.addEventListener('click', () => this.handleClearAll());
    clearAllBtn.addEventListener('mouseenter', () => {
      clearAllBtn.style.background = 'rgba(var(--danger-rgb), 0.1)';
    });
    clearAllBtn.addEventListener('mouseleave', () => {
      clearAllBtn.style.background = 'transparent';
    });
    applyA11yFocus(clearAllBtn);
    footer.appendChild(clearAllBtn);

    this.container.appendChild(footer);

    // Listen for snapshot changes
    this.snapshotManager.on('snapshotsChanged', ({ snapshots }) => {
      this.snapshots = snapshots;
      this.renderList();
    });
  }

  private async loadSnapshots(): Promise<void> {
    try {
      this.snapshots = await this.snapshotManager.listSnapshots();
      this.renderList();
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    }
  }

  private renderList(): void {
    this.listContainer.innerHTML = '';

    const searchTerm = this.searchInput.value.toLowerCase();
    const filtered = this.snapshots.filter(snapshot => {
      // Filter by type
      if (this.filterMode === 'manual' && snapshot.isAutoCheckpoint) return false;
      if (this.filterMode === 'auto' && !snapshot.isAutoCheckpoint) return false;

      // Filter by search term
      if (searchTerm) {
        const nameMatch = snapshot.name.toLowerCase().includes(searchTerm);
        const descMatch = snapshot.description?.toLowerCase().includes(searchTerm);
        if (!nameMatch && !descMatch) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = `
        text-align: center;
        padding: 32px 16px;
        color: var(--text-muted);
        font-size: 12px;
      `;
      emptyState.innerHTML = `
        ${getIconSvg('history', 'lg')}
        <p style="margin-top: 12px;">No snapshots found</p>
        <p style="margin-top: 4px; font-size: 11px;">Create a snapshot to save your session state</p>
      `;
      this.listContainer.appendChild(emptyState);
      return;
    }

    for (const snapshot of filtered) {
      const item = this.createSnapshotItem(snapshot);
      this.listContainer.appendChild(item);
    }
  }

  private createSnapshotItem(snapshot: Snapshot): HTMLElement {
    const item = document.createElement('div');
    item.className = 'snapshot-item';
    item.dataset.snapshotId = snapshot.id;
    item.style.cssText = `
      padding: 12px;
      margin-bottom: 8px;
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      background: var(--bg-primary);
      transition: all 0.12s ease;
    `;

    // Header row
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    `;

    const nameContainer = document.createElement('div');
    nameContainer.style.cssText = 'flex: 1; min-width: 0;';

    const name = document.createElement('div');
    name.style.cssText = `
      font-weight: 500;
      color: var(--text-primary);
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    name.textContent = snapshot.name;
    name.title = snapshot.name;
    nameContainer.appendChild(name);

    if (snapshot.description) {
      const desc = document.createElement('div');
      desc.style.cssText = `
        color: var(--text-muted);
        font-size: 11px;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      desc.textContent = snapshot.description;
      desc.title = snapshot.description;
      nameContainer.appendChild(desc);
    }

    headerRow.appendChild(nameContainer);

    // Type badge
    const badge = document.createElement('span');
    badge.style.cssText = `
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 500;
      flex-shrink: 0;
      margin-left: 8px;
    `;
    if (snapshot.isAutoCheckpoint) {
      badge.textContent = 'AUTO';
      badge.style.background = 'rgba(var(--warning-rgb), 0.15)';
      badge.style.color = 'var(--text-warning)';
    } else {
      badge.textContent = 'MANUAL';
      badge.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      badge.style.color = 'var(--accent-primary)';
    }
    headerRow.appendChild(badge);

    item.appendChild(headerRow);

    // Preview info
    if (snapshot.preview) {
      const preview = this.createPreviewInfo(snapshot.preview);
      item.appendChild(preview);
    }

    // Meta info
    const meta = document.createElement('div');
    meta.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border-secondary);
    `;

    const date = document.createElement('span');
    date.textContent = this.formatDate(snapshot.createdAt);
    meta.appendChild(date);

    const size = document.createElement('span');
    size.textContent = this.formatSize(snapshot.size);
    meta.appendChild(size);

    item.appendChild(meta);

    // Actions row
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      gap: 4px;
      margin-top: 8px;
    `;

    const restoreBtn = this.createActionButton('Restore', 'restore', () => {
      this.emit('restoreRequested', { id: snapshot.id });
    });
    restoreBtn.style.flex = '1';
    actions.appendChild(restoreBtn);

    const renameBtn = this.createActionButton('Rename', 'edit', () => {
      this.handleRename(snapshot);
    });
    actions.appendChild(renameBtn);

    const exportBtn = this.createActionButton('Export', 'download', () => {
      this.handleExport(snapshot);
    });
    actions.appendChild(exportBtn);

    const deleteBtn = this.createActionButton('Delete', 'trash', () => {
      this.handleDelete(snapshot);
    });
    deleteBtn.style.color = 'var(--text-danger)';
    actions.appendChild(deleteBtn);

    item.appendChild(actions);

    // Hover effects
    item.addEventListener('mouseenter', () => {
      item.style.borderColor = 'var(--border-hover)';
      item.style.background = 'var(--bg-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.borderColor = 'var(--border-primary)';
      item.style.background = 'var(--bg-primary)';
    });

    return item;
  }

  private createPreviewInfo(preview: SnapshotPreview): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11px;
    `;

    const items: Array<{ label: string; value: string }> = [];

    if (preview.sourceName) {
      items.push({ label: 'Source', value: preview.sourceName });
    }
    items.push({ label: 'Frame', value: `${preview.currentFrame}/${preview.frameCount}` });
    if (preview.annotationCount > 0) {
      items.push({ label: 'Annotations', value: String(preview.annotationCount) });
    }
    if (preview.hasColorGrade) {
      items.push({ label: 'Color', value: 'Yes' });
    }

    for (const { label, value } of items) {
      const span = document.createElement('span');
      span.style.cssText = `
        padding: 2px 6px;
        background: var(--bg-tertiary);
        border-radius: 3px;
        color: var(--text-secondary);
      `;
      const labelSpan = document.createElement('span');
      labelSpan.style.color = 'var(--text-muted)';
      labelSpan.textContent = `${label}: `;
      span.appendChild(labelSpan);
      span.appendChild(document.createTextNode(value));
      container.appendChild(span);
    }

    return container;
  }

  private createActionButton(
    title: string,
    icon: IconName,
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = getIconSvg(icon, 'sm');
    btn.title = title;
    btn.style.cssText = `
      padding: 6px 8px;
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--bg-hover)';
      btn.style.borderColor = 'var(--border-hover)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--border-primary)';
    });
    applyA11yFocus(btn);
    return btn;
  }

  private formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private async handleRename(snapshot: Snapshot): Promise<void> {
    const newName = await showPrompt('Enter new name:', {
      title: 'Rename Snapshot',
      defaultValue: snapshot.name,
      confirmText: 'Rename',
    });
    if (newName && newName !== snapshot.name) {
      try {
        await this.snapshotManager.renameSnapshot(snapshot.id, newName);
      } catch (err) {
        console.error('Failed to rename snapshot:', err);
        await showAlert('Failed to rename snapshot', { type: 'error', title: 'Error' });
      }
    }
  }

  private async handleExport(snapshot: Snapshot): Promise<void> {
    try {
      const json = await this.snapshotManager.exportSnapshot(snapshot.id);
      if (!json) {
        await showAlert('Failed to export snapshot', { type: 'error', title: 'Export Error' });
        return;
      }

      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapshot-${snapshot.name.replace(/[^a-z0-9]/gi, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export snapshot:', err);
      await showAlert('Failed to export snapshot', { type: 'error', title: 'Export Error' });
    }
  }

  private async handleDelete(snapshot: Snapshot): Promise<void> {
    const confirmed = await showConfirm(`Delete snapshot "${snapshot.name}"?`, {
      title: 'Delete Snapshot',
      confirmText: 'Delete',
      confirmVariant: 'danger',
    });
    if (confirmed) {
      try {
        await this.snapshotManager.deleteSnapshot(snapshot.id);
      } catch (err) {
        console.error('Failed to delete snapshot:', err);
        await showAlert('Failed to delete snapshot', { type: 'error', title: 'Error' });
      }
    }
  }

  private async handleClearAll(): Promise<void> {
    const confirmed = await showConfirm('Delete all snapshots? This cannot be undone.', {
      title: 'Clear All Snapshots',
      confirmText: 'Delete All',
      confirmVariant: 'danger',
    });
    if (confirmed) {
      try {
        await this.snapshotManager.clearAll();
      } catch (err) {
        console.error('Failed to clear snapshots:', err);
        await showAlert('Failed to clear snapshots', { type: 'error', title: 'Error' });
      }
    }
  }

  // Public methods

  /** Register another panel for mutual exclusion - opening this panel will close the other */
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
    this.loadSnapshots();
  }

  hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
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
