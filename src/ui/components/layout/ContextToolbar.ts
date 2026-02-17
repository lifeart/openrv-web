/**
 * ContextToolbar - Context-sensitive toolbar that changes based on active tab
 *
 * Height: 44px
 * Shows different controls based on which tab is active
 */

import { EventEmitter, EventMap } from '../../../utils/EventEmitter';
import { TabId } from './TabBar';
import { getIconSvg, IconName } from '../shared/Icons';
import { applyA11yFocus } from '../shared/Button';

export interface ContextToolbarEvents extends EventMap {
  // Events will be added as tabs are implemented
}

export class ContextToolbar extends EventEmitter<ContextToolbarEvents> {
  private container: HTMLElement;
  private contentContainer: HTMLElement;
  private _activeTab: TabId = 'view';
  private fadeLeft: HTMLElement;
  private fadeRight: HTMLElement;
  private boundUpdateFades: () => void;

  // Tab content containers
  private tabContents: Map<TabId, HTMLElement> = new Map();

  constructor() {
    super();

    this.boundUpdateFades = () => this.updateFades();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'context-toolbar';
    this.container.setAttribute('role', 'toolbar');
    this.container.setAttribute('aria-label', 'View controls');
    this.container.style.cssText = `
      height: 44px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-secondary);
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 6px;
      flex-shrink: 0;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      -ms-overflow-style: none;
      position: relative;
    `;
    // Hide scrollbar for WebKit browsers
    const style = document.createElement('style');
    style.textContent = `.context-toolbar::-webkit-scrollbar { display: none; }`;
    this.container.appendChild(style);

    // Create fade overlays for overflow indication
    this.fadeLeft = document.createElement('div');
    this.fadeLeft.className = 'context-toolbar-fade-left';
    this.fadeLeft.style.cssText = `
      position: sticky;
      left: 0;
      top: 0;
      width: 24px;
      height: 100%;
      pointer-events: none;
      background: linear-gradient(to right, var(--bg-secondary), transparent);
      flex-shrink: 0;
      z-index: 1;
      display: none;
    `;

    this.fadeRight = document.createElement('div');
    this.fadeRight.className = 'context-toolbar-fade-right';
    this.fadeRight.style.cssText = `
      position: sticky;
      right: 0;
      top: 0;
      width: 24px;
      height: 100%;
      pointer-events: none;
      background: linear-gradient(to left, var(--bg-secondary), transparent);
      flex-shrink: 0;
      z-index: 1;
      display: none;
    `;

    // Create content container for smooth transitions
    this.contentContainer = document.createElement('div');
    this.contentContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      height: 100%;
    `;

    this.container.appendChild(this.fadeLeft);
    this.container.appendChild(this.contentContainer);
    this.container.appendChild(this.fadeRight);

    // Listen for scroll events to update fade visibility
    this.container.addEventListener('scroll', this.boundUpdateFades);

    // Initialize empty content for each tab
    this.initTabContents();
  }

  private initTabContents(): void {
    const tabs: TabId[] = ['view', 'color', 'effects', 'transform', 'annotate'];

    for (const tabId of tabs) {
      const content = document.createElement('div');
      content.className = `context-content-${tabId}`;
      content.id = `tabpanel-${tabId}`;
      content.setAttribute('role', 'tabpanel');
      content.setAttribute('aria-labelledby', `tab-${tabId}`);
      content.style.cssText = `
        display: none;
        align-items: center;
        gap: 6px;
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

    // Check if focus is inside the previous tab content before hiding
    const prevContent = this.tabContents.get(this._activeTab);
    const focusInPrevTab = prevContent && prevContent.contains(document.activeElement);

    this._activeTab = tabId;
    this.showTabContent(tabId);

    // Update toolbar aria-label to match tab
    const tabLabels: Record<TabId, string> = {
      view: 'View controls',
      color: 'Color controls',
      effects: 'Effects controls',
      transform: 'Transform controls',
      annotate: 'Annotate controls',
    };
    this.container.setAttribute('aria-label', tabLabels[tabId]);

    // If focus was in the previous tab, move it to the new tab's roving element
    if (focusInPrevTab) {
      const newContent = this.tabContents.get(tabId);
      if (newContent) {
        const focusTarget = newContent.querySelector<HTMLElement>('[tabindex="0"]') ||
          newContent.querySelector<HTMLElement>('button:not([disabled])');
        if (focusTarget) {
          focusTarget.focus();
        }
      }
    }
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
      background: var(--border-primary);
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
      background: ${options.active ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent'};
      border: 1px solid ${options.active ? 'var(--accent-primary)' : 'transparent'};
      color: ${options.active ? 'var(--accent-primary)' : 'var(--text-secondary)'};
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
        button.style.background = 'var(--bg-hover)';
        button.style.borderColor = 'var(--border-secondary)';
        button.style.color = 'var(--text-primary)';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!options.active) {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
        button.style.color = 'var(--text-secondary)';
      }
    });

    button.addEventListener('click', onClick);

    // Apply A11Y focus handling from shared utility
    applyA11yFocus(button);

    return button;
  }

  /**
   * Helper to create an icon-only button (compact, no text label)
   * Use for toolbar toggles where space is at a premium
   */
  static createIconButton(
    icon: IconName,
    onClick: () => void,
    options: {
      title?: string;
      active?: boolean;
      size?: 'sm' | 'md';
    } = {}
  ): HTMLButtonElement {
    const button = document.createElement('button');
    const iconSize = options.size === 'md' ? 'md' : 'sm';
    button.innerHTML = getIconSvg(icon, iconSize);
    button.title = options.title || '';
    if (options.title) {
      button.setAttribute('aria-label', options.title);
    }

    const btnSize = options.size === 'md' ? '32px' : '28px';
    button.style.cssText = `
      background: ${options.active ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent'};
      border: 1px solid ${options.active ? 'var(--accent-primary)' : 'transparent'};
      color: ${options.active ? 'var(--accent-primary)' : 'var(--text-secondary)'};
      padding: 0;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${btnSize};
      height: ${btnSize};
    `;

    button.addEventListener('mouseenter', () => {
      if (!options.active) {
        button.style.background = 'var(--bg-hover)';
        button.style.borderColor = 'var(--border-secondary)';
        button.style.color = 'var(--text-primary)';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!options.active) {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
        button.style.color = 'var(--text-secondary)';
      }
    });

    button.addEventListener('click', onClick);

    // Apply A11Y focus handling from shared utility
    applyA11yFocus(button);

    return button;
  }

  /**
   * Helper to create a slider with label
   */
  private static sliderId = 0;

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

    const labelId = `ct-slider-label-${ContextToolbar.sliderId++}`;

    const labelEl = document.createElement('span');
    labelEl.id = labelId;
    labelEl.textContent = label;
    labelEl.style.cssText = `
      color: var(--text-muted);
      font-size: 11px;
      min-width: 60px;
    `;

    const minVal = String(options.min ?? 0);
    const maxVal = String(options.max ?? 100);
    const currentVal = String(options.value ?? 50);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = minVal;
    slider.max = maxVal;
    slider.step = String(options.step ?? 1);
    slider.value = currentVal;

    // ARIA attributes for accessibility
    slider.setAttribute('aria-label', label);
    slider.setAttribute('aria-labelledby', labelId);
    slider.setAttribute('aria-valuemin', minVal);
    slider.setAttribute('aria-valuemax', maxVal);
    slider.setAttribute('aria-valuenow', currentVal);

    slider.style.cssText = `
      width: ${options.width || '80px'};
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;

    slider.addEventListener('input', () => {
      slider.setAttribute('aria-valuenow', slider.value);
      if (options.onChange) {
        options.onChange(parseFloat(slider.value));
      }
    });

    if (options.onDoubleClick) {
      slider.addEventListener('dblclick', () => {
        options.onDoubleClick!();
      });
    }

    container.appendChild(labelEl);
    container.appendChild(slider);

    // Expose slider for external access
    Object.defineProperty(container, 'slider', { value: slider });

    return container;
  }

  /**
   * Update fade overlay visibility based on scroll position
   */
  private updateFades(): void {
    const { scrollLeft, scrollWidth, clientWidth } = this.container;
    const hasOverflow = scrollWidth > clientWidth;

    this.fadeLeft.style.display = hasOverflow && scrollLeft > 0 ? 'block' : 'none';
    this.fadeRight.style.display = hasOverflow && scrollLeft + clientWidth < scrollWidth - 1 ? 'block' : 'none';
  }

  /**
   * Scroll a control element into view within the toolbar
   */
  scrollActiveControlIntoView(element: HTMLElement): void {
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.container.removeEventListener('scroll', this.boundUpdateFades);
  }
}
