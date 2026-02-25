/**
 * CacheManagementPanel - Simple settings panel for managing the OPFS media cache.
 *
 * Features:
 * - Displays cache statistics (entry count, total size in human-readable format)
 * - "Clear All" button to purge the entire cache
 * - Follows the existing DOM-based component pattern (EventEmitter, getElement, dispose)
 */

import { EventEmitter } from '../../utils/EventEmitter';
import type { EventMap } from '../../utils/EventEmitter';
import type { MediaCacheManager, CacheStats } from '../../cache/MediaCacheManager';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface CacheManagementPanelEvents extends EventMap {
  visibilityChanged: boolean;
  cleared: void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format byte count into a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class CacheManagementPanel extends EventEmitter<CacheManagementPanelEvents> {
  private container: HTMLElement;
  private statsElement: HTMLElement;
  private clearButton: HTMLButtonElement;
  private cacheManager: MediaCacheManager;
  private visible = false;

  constructor(cacheManager: MediaCacheManager) {
    super();
    this.cacheManager = cacheManager;

    // Main container
    this.container = document.createElement('div');
    this.container.className = 'cache-management-panel';
    this.container.dataset.testid = 'cache-management-panel';
    this.container.style.cssText = `
      position: absolute;
      right: 10px;
      top: 60px;
      width: 280px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 8px;
      display: none;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: var(--text-primary);
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-primary);
      background: var(--bg-tertiary);
    `;

    const title = document.createElement('span');
    title.textContent = 'Media Cache';
    title.style.cssText = 'font-weight: 600; font-size: 13px;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00D7';
    closeBtn.title = 'Close';
    closeBtn.dataset.testid = 'cache-panel-close';
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

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding: 12px;';

    this.statsElement = document.createElement('div');
    this.statsElement.dataset.testid = 'cache-stats';
    this.statsElement.style.cssText = `
      margin-bottom: 12px;
      line-height: 1.6;
    `;
    this.statsElement.textContent = 'Loading...';

    this.clearButton = document.createElement('button');
    this.clearButton.textContent = 'Clear All Cache';
    this.clearButton.dataset.testid = 'cache-clear-btn';
    this.clearButton.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: rgba(255, 100, 100, 0.2);
      border: 1px solid rgba(255, 100, 100, 0.3);
      color: var(--error, #ff6464);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    `;
    this.clearButton.addEventListener('click', () => this.handleClear());

    body.appendChild(this.statsElement);
    body.appendChild(this.clearButton);

    this.container.appendChild(header);
    this.container.appendChild(body);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  getElement(): HTMLElement {
    return this.container;
  }

  show(): void {
    this.visible = true;
    this.container.style.display = 'flex';
    this.refreshStats();
    this.emit('visibilityChanged', true);
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.emit('visibilityChanged', false);
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  async refreshStats(): Promise<void> {
    try {
      const stats = await this.cacheManager.getStats();
      this.renderStats(stats);
    } catch {
      this.statsElement.textContent = 'Unable to read cache stats.';
    }
  }

  dispose(): void {
    this.container.remove();
    this.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private renderStats(stats: CacheStats): void {
    this.statsElement.innerHTML = '';

    const entries = document.createElement('div');
    entries.textContent = `Entries: ${stats.entryCount}`;

    const size = document.createElement('div');
    size.textContent = `Total size: ${formatBytes(stats.totalSizeBytes)}`;

    const max = document.createElement('div');
    max.textContent = `Max size: ${formatBytes(stats.maxSizeBytes)}`;

    this.statsElement.appendChild(entries);
    this.statsElement.appendChild(size);
    this.statsElement.appendChild(max);
  }

  private async handleClear(): Promise<void> {
    this.clearButton.disabled = true;
    this.clearButton.textContent = 'Clearing...';

    try {
      await this.cacheManager.clearAll();
      this.emit('cleared', undefined as unknown as void);
      await this.refreshStats();
    } finally {
      this.clearButton.disabled = false;
      this.clearButton.textContent = 'Clear All Cache';
    }
  }
}
