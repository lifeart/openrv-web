/**
 * ContextToolbar - Context-sensitive toolbar that changes based on active tab
 *
 * Height: 44px
 * Shows different controls based on which tab is active
 */

import { EventEmitter, EventMap } from '../../../utils/EventEmitter';
import { TabId } from './TabBar';
import { getIconSvg, IconName } from '../shared/Icons';

export interface ContextToolbarEvents extends EventMap {
  // Events will be added as tabs are implemented
}

export class ContextToolbar extends EventEmitter<ContextToolbarEvents> {
  private container: HTMLElement;
  private contentContainer: HTMLElement;
  private _activeTab: TabId = 'view';

  // Tab content containers
  private tabContents: Map<TabId, HTMLElement> = new Map();

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'context-toolbar';
    this.container.style.cssText = `
      height: 44px;
      background: #252525;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 8px;
      flex-shrink: 0;
      overflow-x: auto;
      overflow-y: hidden;
    `;

    // Create content container for smooth transitions
    this.contentContainer = document.createElement('div');
    this.contentContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 100%;
    `;
    this.container.appendChild(this.contentContainer);

    // Initialize empty content for each tab
    this.initTabContents();
  }

  private initTabContents(): void {
    const tabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate'];

    for (const tabId of tabs) {
      const content = document.createElement('div');
      content.className = `context-content-${tabId}`;
      content.style.cssText = `
        display: none;
        align-items: center;
        gap: 8px;
        height: 100%;
      `;
      this.tabContents.set(tabId, content);
    }

    // Show initial tab
    this.showTabContent(this._activeTab);
  }

  private showTabContent(tabId: TabId): void {
    // Hide all
    for (const [id, content] of this.tabContents) {
      content.style.display = id === tabId ? 'flex' : 'none';
    }
  }

  /**
   * Set the content for a specific tab
   */
  setTabContent(tabId: TabId, element: HTMLElement): void {
    const content = this.tabContents.get(tabId);
    if (content) {
      content.innerHTML = '';
      content.appendChild(element);

      // Make sure it's in the DOM
      if (!this.contentContainer.contains(content)) {
        this.contentContainer.appendChild(content);
      }
    }
  }

  /**
   * Append content to a specific tab
   */
  appendToTab(tabId: TabId, element: HTMLElement): void {
    const content = this.tabContents.get(tabId);
    if (content) {
      content.appendChild(element);

      // Make sure it's in the DOM
      if (!this.contentContainer.contains(content)) {
        this.contentContainer.appendChild(content);
      }
    }
  }

  /**
   * Get the content container for a specific tab
   */
  getTabContainer(tabId: TabId): HTMLElement | undefined {
    return this.tabContents.get(tabId);
  }

  /**
   * Set the active tab (called by TabBar)
   */
  setActiveTab(tabId: TabId): void {
    if (tabId === this._activeTab) return;

    this._activeTab = tabId;
    this.showTabContent(tabId);
  }

  get activeTab(): TabId {
    return this._activeTab;
  }

  /**
   * Helper to create a group divider
   */
  static createDivider(): HTMLElement {
    const divider = document.createElement('div');
    divider.style.cssText = `
      width: 1px;
      height: 24px;
      background: #444;
      margin: 0 4px;
    `;
    return divider;
  }

  /**
   * Helper to create a compact button
   */
  static createButton(
    text: string,
    onClick: () => void,
    options: {
      title?: string;
      active?: boolean;
      minWidth?: string;
      icon?: IconName;
    } = {}
  ): HTMLButtonElement {
    const button = document.createElement('button');
    if (options.icon) {
      button.innerHTML = `${getIconSvg(options.icon, 'sm')}<span style="margin-left: 6px;">${text}</span>`;
    } else {
      button.textContent = text;
    }
    button.title = options.title || '';
    button.style.cssText = `
      background: ${options.active ? 'rgba(74, 158, 255, 0.15)' : 'transparent'};
      border: 1px solid ${options.active ? '#4a9eff' : 'transparent'};
      color: ${options.active ? '#4a9eff' : '#bbb'};
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      min-width: ${options.minWidth || 'auto'};
    `;

    button.addEventListener('mouseenter', () => {
      if (!options.active) {
        button.style.background = 'rgba(255,255,255,0.08)';
        button.style.borderColor = 'rgba(255,255,255,0.1)';
        button.style.color = '#fff';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!options.active) {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
        button.style.color = '#bbb';
      }
    });

    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Helper to create a slider with label
   */
  static createSlider(
    label: string,
    options: {
      min?: number;
      max?: number;
      step?: number;
      value?: number;
      width?: string;
      onChange?: (value: number) => void;
      onDoubleClick?: () => void;
    } = {}
  ): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: #888;
      font-size: 11px;
      min-width: 60px;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(options.min ?? 0);
    slider.max = String(options.max ?? 100);
    slider.step = String(options.step ?? 1);
    slider.value = String(options.value ?? 50);
    slider.style.cssText = `
      width: ${options.width || '80px'};
      height: 4px;
      cursor: pointer;
      accent-color: #4a9eff;
    `;

    if (options.onChange) {
      slider.addEventListener('input', () => {
        options.onChange!(parseFloat(slider.value));
      });
    }

    if (options.onDoubleClick) {
      slider.addEventListener('dblclick', () => {
        options.onDoubleClick!();
      });
    }

    container.appendChild(labelEl);
    container.appendChild(slider);

    // Expose slider for external access
    (container as any).slider = slider;

    return container;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
