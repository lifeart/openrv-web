/**
 * TabBar - Tab navigation for tool categories
 *
 * Tabs: View | Color | Effects | Transform | Annotate
 * Height: 36px
 */

import { EventEmitter, EventMap } from '../../../utils/EventEmitter';
import { getIconSvg, IconName } from '../shared/Icons';

export type TabId = 'view' | 'color' | 'effects' | 'transform' | 'annotate';

export interface Tab {
  id: TabId;
  label: string;
  icon: IconName;
  shortcut: string;
}

export const TABS: Tab[] = [
  { id: 'view', label: 'View', icon: 'eye', shortcut: '1' },
  { id: 'color', label: 'Color', icon: 'palette', shortcut: '2' },
  { id: 'effects', label: 'Effects', icon: 'sparkles', shortcut: '3' },
  { id: 'transform', label: 'Transform', icon: 'move', shortcut: '4' },
  { id: 'annotate', label: 'Annotate', icon: 'pencil', shortcut: '5' },
];

export interface TabBarEvents extends EventMap {
  tabChanged: TabId;
}

export class TabBar extends EventEmitter<TabBarEvents> {
  private container: HTMLElement;
  private tabButtons: Map<TabId, HTMLButtonElement> = new Map();
  private _activeTab: TabId = 'view';
  private indicator: HTMLElement;

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'tab-bar';
    this.container.style.cssText = `
      height: 36px;
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border-secondary);
      display: flex;
      align-items: stretch;
      padding: 0 12px;
      gap: 0;
      flex-shrink: 0;
      position: relative;
      user-select: none;
    `;

    // Create tab indicator (underline for active tab)
    this.indicator = document.createElement('div');
    this.indicator.style.cssText = `
      position: absolute;
      bottom: 0;
      height: 2px;
      background: var(--accent-primary);
      transition: left 0.2s ease, width 0.2s ease;
      border-radius: 1px 1px 0 0;
    `;
    this.container.appendChild(this.indicator);

    this.createTabs();
  }

  private createTabs(): void {
    for (const tab of TABS) {
      const button = this.createTabButton(tab);
      this.tabButtons.set(tab.id, button);
      this.container.appendChild(button);
    }

    // Set initial active state
    this.updateActiveState();
  }

  private createTabButton(tab: Tab): HTMLButtonElement {
    const button = document.createElement('button');
    button.dataset.tabId = tab.id;
    button.title = `${tab.label} (${tab.shortcut})`;
    button.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 0 16px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 100%;
      position: relative;
      letter-spacing: 0.3px;
    `;

    // Icon
    const icon = document.createElement('span');
    icon.innerHTML = getIconSvg(tab.icon, 'sm');
    icon.style.display = 'flex';
    icon.style.alignItems = 'center';

    // Label
    const label = document.createElement('span');
    label.textContent = tab.label;

    button.appendChild(icon);
    button.appendChild(label);

    button.addEventListener('mouseenter', () => {
      if (tab.id !== this._activeTab) {
        button.style.color = 'var(--text-secondary)';
        button.style.background = 'var(--bg-hover)';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (tab.id !== this._activeTab) {
        button.style.color = 'var(--text-muted)';
        button.style.background = 'transparent';
      }
    });

    button.addEventListener('click', () => {
      this.setActiveTab(tab.id);
    });

    return button;
  }

  private updateActiveState(): void {
    for (const [id, button] of this.tabButtons) {
      const isActive = id === this._activeTab;
      button.style.color = isActive ? 'var(--text-primary)' : 'var(--text-muted)';
      button.style.background = isActive ? 'var(--bg-hover)' : 'transparent';
    }

    // Update indicator position
    const activeButton = this.tabButtons.get(this._activeTab);
    if (activeButton) {
      const rect = activeButton.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      this.indicator.style.left = `${rect.left - containerRect.left}px`;
      this.indicator.style.width = `${rect.width}px`;
    }
  }

  setActiveTab(id: TabId): void {
    if (id === this._activeTab) return;

    this._activeTab = id;
    this.updateActiveState();
    this.emit('tabChanged', id);
  }

  get activeTab(): TabId {
    return this._activeTab;
  }

  /**
   * Handle keyboard shortcuts (1-5 for tabs)
   */
  handleKeyboard(key: string): boolean {
    const tab = TABS.find(t => t.shortcut === key);
    if (tab) {
      this.setActiveTab(tab.id);
      return true;
    }
    return false;
  }

  render(): HTMLElement {
    // Update indicator on next frame (after layout)
    requestAnimationFrame(() => this.updateActiveState());
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
