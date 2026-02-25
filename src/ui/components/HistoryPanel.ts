/**
 * HistoryPanel - Visual panel showing undo/redo history
 *
 * Features:
 * - List of all actions with timestamps
 * - Click to revert to any state
 * - Current state highlighted
 * - Clear history option
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { HistoryManager, HistoryEntry } from '../../utils/HistoryManager';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import { getIconSvg } from './shared/Icons';
import { OPACITY } from './shared/theme';

export interface HistoryPanelEvents extends EventMap {
  visibilityChanged: boolean;
  entrySelected: number;
}

export class HistoryPanel extends EventEmitter<HistoryPanelEvents> {
  private container: HTMLElement;
  private historyManager: HistoryManager;
  private visible = false;
  private entriesContainer: HTMLElement;
  private headerElement: HTMLElement;
  private unsubscribers: (() => void)[] = [];
  private boundOnThemeChange: (() => void) | null = null;

  constructor(historyManager: HistoryManager) {
    super();
    this.historyManager = historyManager;

    this.container = document.createElement('div');
    this.container.className = 'history-panel';
    this.container.dataset.testid = 'history-panel';
    this.container.style.cssText = `
      position: absolute;
      right: 10px;
      top: 60px;
      width: 280px;
      max-height: 400px;
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
    this.headerElement = document.createElement('div');
    this.headerElement.className = 'history-panel-header';
    this.headerElement.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-primary);
      background: var(--bg-tertiary);
    `;

    const title = document.createElement('span');
    title.textContent = 'History';
    title.style.cssText = 'font-weight: 500; font-size: 13px;';

    const headerButtons = document.createElement('div');
    headerButtons.style.cssText = 'display: flex; gap: 8px;';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Clear history';
    clearBtn.dataset.testid = 'history-clear-btn';
    clearBtn.style.cssText = `
      background: rgba(255, 100, 100, 0.2);
      border: 1px solid rgba(255, 100, 100, 0.3);
      color: var(--error);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    `;
    clearBtn.addEventListener('click', () => this.clearHistory());

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = getIconSvg('x', 'sm');
    closeBtn.title = 'Close';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0 4px;
      display: inline-flex;
      align-items: center;
    `;
    closeBtn.addEventListener('click', () => this.hide());

    headerButtons.appendChild(clearBtn);
    headerButtons.appendChild(closeBtn);
    this.headerElement.appendChild(title);
    this.headerElement.appendChild(headerButtons);

    // Entries container
    this.entriesContainer = document.createElement('div');
    this.entriesContainer.className = 'history-entries';
    this.entriesContainer.dataset.testid = 'history-entries';
    this.entriesContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    `;

    this.container.appendChild(this.headerElement);
    this.container.appendChild(this.entriesContainer);

    // Listen to history changes
    this.unsubscribers.push(this.historyManager.on('historyChanged', () => this.render()));
    this.unsubscribers.push(this.historyManager.on('currentIndexChanged', () => this.render()));

    // Listen for theme changes to re-render with new colors
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
   * Clear history
   */
  clearHistory(): void {
    this.historyManager.clear();
  }

  /**
   * Render the history entries
   */
  private render(): void {
    const state = this.historyManager.getState();
    this.entriesContainer.innerHTML = '';

    if (state.entries.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No history yet';
      emptyMsg.style.cssText = `
        color: var(--text-muted);
        text-align: center;
        padding: 20px;
        font-style: italic;
      `;
      this.entriesContainer.appendChild(emptyMsg);
      return;
    }

    // Create entry elements in reverse order (newest first)
    for (let i = state.entries.length - 1; i >= 0; i--) {
      const entry = state.entries[i];
      if (!entry) continue;

      const entryEl = this.createEntryElement(entry, i, state.currentIndex);
      this.entriesContainer.appendChild(entryEl);
    }
  }

  /**
   * Create a single entry element
   */
  private createEntryElement(entry: HistoryEntry, index: number, currentIndex: number): HTMLElement {
    const isCurrent = index === currentIndex;
    const isFuture = index > currentIndex;

    const el = document.createElement('div');
    el.className = 'history-entry';
    el.dataset.testid = `history-entry-${index}`;
    el.dataset.entryId = String(entry.id);
    el.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 12px;
      cursor: pointer;
      gap: 8px;
      transition: background 0.15s;
      ${isCurrent ? 'background: rgba(var(--accent-primary-rgb), 0.2);' : ''}
      ${isFuture ? `opacity: ${OPACITY.disabled};` : ''}
    `;

    el.addEventListener('pointerenter', () => {
      if (!isCurrent) {
        el.style.background = 'var(--bg-hover)';
      }
    });

    el.addEventListener('pointerleave', () => {
      el.style.background = isCurrent ? 'rgba(var(--accent-primary-rgb), 0.2)' : '';
    });

    el.addEventListener('click', () => {
      this.historyManager.jumpTo(index);
      this.emit('entrySelected', index);
    });

    // Category icon (SVG)
    const icon = document.createElement('span');
    icon.innerHTML = HistoryManager.getCategoryIcon(entry.category);
    icon.style.cssText = 'width: 20px; display: flex; align-items: center; justify-content: center; color: var(--text-muted);';

    // Description
    const desc = document.createElement('span');
    desc.textContent = entry.description;
    desc.style.cssText = `
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    // Current indicator
    if (isCurrent) {
      const indicator = document.createElement('span');
      indicator.textContent = '●';
      indicator.style.cssText = 'color: var(--accent-primary); font-size: 8px;';
      el.appendChild(indicator);
    }

    // Time
    const time = document.createElement('span');
    time.textContent = HistoryManager.formatTimeSince(entry.timestamp);
    time.style.cssText = 'color: var(--text-muted); font-size: 10px; min-width: 50px; text-align: right;';

    el.appendChild(icon);
    el.appendChild(desc);
    el.appendChild(time);

    return el;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
      this.boundOnThemeChange = null;
    }
    this.container.remove();
  }

  /**
   * Get current state for testing
   */
  getState(): { visible: boolean; entryCount: number; currentIndex: number } {
    const historyState = this.historyManager.getState();
    return {
      visible: this.visible,
      entryCount: historyState.entries.length,
      currentIndex: historyState.currentIndex,
    };
  }
}
