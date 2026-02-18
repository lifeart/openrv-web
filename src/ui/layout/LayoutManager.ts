/**
 * LayoutManager - DOM layout with resizable split panels.
 *
 * Restructures the app container into:
 *   [left-panel] | [center (viewer)] | [right-panel]
 *                       |
 *               [bottom-panel (timeline)]
 *
 * Each side panel has a collapse rail, a drag handle for resizing,
 * and a content area with tabs.
 */

import { LayoutStore, PanelId, COLLAPSED_RAIL_SIZE, LayoutPresetId, DEFAULT_PANEL_STATES } from './LayoutStore';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from '../components/shared/Icons';
import { createIconButton } from '../components/shared/Button';

export interface LayoutManagerEvents extends EventMap {
  /** Emitted after layout DOM is updated so viewer can resize. */
  viewerResized: void;
}

interface PanelElements {
  wrapper: HTMLElement;
  rail: HTMLElement;
  content: HTMLElement;
  handle: HTMLElement;
  tabBar: HTMLElement;
  tabContent: HTMLElement;
  contentCollapseBtn: HTMLButtonElement;
}

export class LayoutManager extends EventEmitter<LayoutManagerEvents> {
  private store: LayoutStore;
  private root!: HTMLElement;
  private topSection!: HTMLElement;
  private middleSection!: HTMLElement;
  private viewerSlot!: HTMLElement;
  private bottomSlot!: HTMLElement;
  private bottomHandle!: HTMLElement;
  private bottomCollapseBtn!: HTMLButtonElement;
  private panels: Record<'left' | 'right', PanelElements> = {} as any;
  private presetBar!: HTMLElement;
  private _presetButtons: Map<LayoutPresetId, HTMLButtonElement> = new Map();

  // Store event unsubscribe functions
  private _unsubLayoutChanged: (() => void) | null = null;
  private _unsubPresetApplied: (() => void) | null = null;

  // Drag state
  private _dragging: { panel: PanelId; startPos: number; startSize: number } | null = null;
  private _dragCaptureTarget: HTMLElement | null = null;
  private _dragPointerId: number = -1;
  private _boundPointerMove: ((e: PointerEvent) => void) | null = null;
  private _boundPointerUp: ((e: PointerEvent) => void) | null = null;
  private _resizeRaf: number | null = null;

  // Panel tab content registrations
  private _panelTabs: Record<'left' | 'right', { label: string; element: HTMLElement }[]> = {
    left: [],
    right: [],
  };

  constructor(store: LayoutStore) {
    super();
    this.store = store;
    this.buildDOM();
    this.applyLayout();

    // Listen only to layoutChanged (applyPreset already emits layoutChanged via notifyAndSave,
    // so a separate presetApplied listener would cause a redundant double applyLayout call).
    this._unsubLayoutChanged = this.store.on('layoutChanged', () => this.applyLayout());

    // Listen to presetApplied to update the active preset button styling
    this._unsubPresetApplied = this.store.on('presetApplied', (presetId) => this.updatePresetBarActiveState(presetId));

    // Window resize
    window.addEventListener('resize', this.handleWindowResize);
  }

  private handleWindowResize = (): void => {
    if (this._resizeRaf !== null) return;
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = null;
      this.store.handleViewportResize(window.innerWidth, window.innerHeight);
      this.applyLayout();
    });
  };

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  private buildDOM(): void {
    this.root = document.createElement('div');
    this.root.className = 'layout-root';
    this.root.style.cssText = `
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    `;

    // Top section (for header, tab bar, context toolbar) - elements will be slotted in
    this.topSection = document.createElement('div');
    this.topSection.className = 'layout-top';
    this.topSection.style.cssText = 'flex-shrink: 0;';

    // Preset bar
    this.presetBar = this.createPresetBar();

    // Middle section: left | viewer | right
    this.middleSection = document.createElement('div');
    this.middleSection.className = 'layout-middle';
    this.middleSection.style.cssText = `
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    `;

    // Left panel
    this.panels.left = this.createPanel('left');
    // Viewer slot
    this.viewerSlot = document.createElement('div');
    this.viewerSlot.className = 'layout-viewer';
    this.viewerSlot.style.cssText = `
      display: flex;
      flex-direction: column;
      flex: 1;
      position: relative;
      overflow: hidden;
      min-width: 100px;
    `;
    // Right panel
    this.panels.right = this.createPanel('right');

    this.middleSection.appendChild(this.panels.left.wrapper);
    this.middleSection.appendChild(this.viewerSlot);
    this.middleSection.appendChild(this.panels.right.wrapper);

    // Bottom handle + collapse button + bottom slot
    this.bottomHandle = this.createDragHandle('bottom');
    this.bottomCollapseBtn = this.createBottomCollapseButton();
    this.bottomSlot = document.createElement('div');
    this.bottomSlot.className = 'layout-bottom';
    this.bottomSlot.style.cssText = 'flex-shrink: 0; overflow: hidden;';

    this.root.appendChild(this.topSection);
    this.root.appendChild(this.presetBar);
    this.root.appendChild(this.middleSection);
    this.root.appendChild(this.bottomHandle);
    this.root.appendChild(this.bottomCollapseBtn);
    this.root.appendChild(this.bottomSlot);
  }

  private createPanel(id: 'left' | 'right'): PanelElements {
    const isLeft = id === 'left';
    const wrapper = document.createElement('div');
    wrapper.className = `layout-panel layout-panel-${id}`;
    wrapper.dataset.testid = `layout-panel-${id}`;
    wrapper.style.cssText = `
      display: flex;
      flex-direction: row;
      flex-shrink: 0;
      overflow: hidden;
      background: var(--bg-secondary);
      border-${isLeft ? 'right' : 'left'}: 1px solid var(--border-primary);
    `;

    // Collapse rail (visible only when collapsed)
    const rail = document.createElement('div');
    rail.className = `layout-rail layout-rail-${id}`;
    rail.style.cssText = `
      width: ${COLLAPSED_RAIL_SIZE}px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 8px;
      gap: 4px;
      background: var(--bg-primary);
      cursor: pointer;
    `;

    const collapseBtn = createIconButton(
      getIconSvg(isLeft ? 'chevron-right' : 'chevron-left', 'sm'),
      () => this.store.togglePanelCollapsed(id),
      { variant: 'icon', size: 'sm', title: `Expand ${id} panel` },
    );
    collapseBtn.dataset.testid = `layout-collapse-${id}`;
    rail.appendChild(collapseBtn);

    // Content area (hidden when collapsed)
    const content = document.createElement('div');
    content.className = `layout-panel-content layout-panel-content-${id}`;
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
    `;

    // Content collapse button (visible when panel is expanded, rail is hidden)
    const contentCollapseBtn = createIconButton(
      getIconSvg(isLeft ? 'chevron-left' : 'chevron-right', 'sm'),
      () => this.store.togglePanelCollapsed(id),
      { variant: 'icon', size: 'sm', title: `Collapse ${id} panel` },
    );
    contentCollapseBtn.dataset.testid = `layout-content-collapse-${id}`;
    contentCollapseBtn.style.alignSelf = isLeft ? 'flex-end' : 'flex-start';
    contentCollapseBtn.style.flexShrink = '0';
    contentCollapseBtn.style.margin = '4px';

    // Tab bar inside panel
    const tabBar = document.createElement('div');
    tabBar.className = `layout-panel-tabs layout-panel-tabs-${id}`;
    tabBar.setAttribute('role', 'tablist');
    tabBar.style.cssText = `
      display: flex;
      border-bottom: 1px solid var(--border-primary);
      background: var(--bg-primary);
      flex-shrink: 0;
      min-height: 28px;
    `;

    const tabContent = document.createElement('div');
    tabContent.className = `layout-panel-tab-content`;
    tabContent.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    `;

    content.appendChild(contentCollapseBtn);
    content.appendChild(tabBar);
    content.appendChild(tabContent);

    // Drag handle
    const handle = this.createDragHandle(id);

    // Assembly order: left has rail → content → handle, right has handle → content → rail
    if (isLeft) {
      wrapper.appendChild(rail);
      wrapper.appendChild(content);
      wrapper.appendChild(handle);
    } else {
      wrapper.appendChild(handle);
      wrapper.appendChild(content);
      wrapper.appendChild(rail);
    }

    return { wrapper, rail, content, handle, tabBar, tabContent, contentCollapseBtn };
  }

  private createDragHandle(panelId: PanelId): HTMLElement {
    const isHorizontal = panelId === 'bottom';
    const handle = document.createElement('div');
    handle.className = `layout-handle layout-handle-${panelId}`;
    handle.dataset.testid = `layout-handle-${panelId}`;
    handle.style.cssText = isHorizontal
      ? `
        height: 5px;
        cursor: row-resize;
        background: var(--border-primary);
        opacity: 0.2;
        flex-shrink: 0;
        position: relative;
        z-index: 10;
      `
      : `
        width: 5px;
        cursor: col-resize;
        background: var(--border-primary);
        opacity: 0.2;
        flex-shrink: 0;
        position: relative;
        z-index: 10;
      `;

    // Visual indicator on hover
    handle.addEventListener('mouseenter', () => {
      handle.style.background = 'var(--accent-primary)';
      handle.style.opacity = '0.5';
    });
    handle.addEventListener('mouseleave', () => {
      if (!this._dragging) {
        handle.style.background = 'var(--border-primary)';
        handle.style.opacity = '0.2';
      }
    });

    handle.addEventListener('pointerdown', (e) => this.onDragStart(panelId, e));

    // Double-click resets the panel to its default preset size
    handle.addEventListener('dblclick', () => {
      const defaultState = DEFAULT_PANEL_STATES[panelId];
      this.store.setPanelSize(panelId, defaultState.size);
    });

    return handle;
  }

  private createBottomCollapseButton(): HTMLButtonElement {
    const btn = createIconButton(
      getIconSvg('chevron-down', 'sm'),
      () => this.store.togglePanelCollapsed('bottom'),
      { variant: 'icon', size: 'sm', title: 'Toggle bottom panel' },
    );
    btn.dataset.testid = 'layout-collapse-bottom';
    btn.style.flexShrink = '0';
    return btn;
  }

  private createPresetBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'layout-preset-bar';
    bar.dataset.testid = 'layout-preset-bar';
    bar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: var(--bg-primary);
      border-bottom: 1px solid var(--border-secondary);
      flex-shrink: 0;
      height: 24px;
    `;

    const label = document.createElement('span');
    label.textContent = 'Layout:';
    label.style.cssText = 'font-size: 10px; color: var(--text-muted); margin-right: 4px;';
    bar.appendChild(label);

    for (const preset of this.store.getPresets()) {
      const btn = document.createElement('button');
      btn.textContent = preset.label;
      btn.dataset.testid = `layout-preset-${preset.id}`;
      btn.title = `Switch to ${preset.label} layout`;
      btn.setAttribute('aria-pressed', 'false');
      btn.style.cssText = `
        background: transparent;
        border: 1px solid var(--border-primary);
        color: var(--text-secondary);
        padding: 2px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        height: 18px;
        transition: all 0.12s ease;
      `;
      btn.addEventListener('click', () => this.store.applyPreset(preset.id));
      btn.addEventListener('mouseenter', () => {
        if (btn.getAttribute('aria-pressed') !== 'true') {
          btn.style.background = 'var(--bg-hover)';
          btn.style.color = 'var(--text-primary)';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (btn.getAttribute('aria-pressed') !== 'true') {
          btn.style.background = 'transparent';
          btn.style.color = 'var(--text-secondary)';
        }
      });
      this._presetButtons.set(preset.id, btn);
      bar.appendChild(btn);
    }

    return bar;
  }

  private updatePresetBarActiveState(activePresetId: LayoutPresetId): void {
    for (const [presetId, btn] of this._presetButtons) {
      if (presetId === activePresetId) {
        btn.setAttribute('aria-pressed', 'true');
        btn.style.background = 'var(--accent-primary)';
        btn.style.borderColor = 'var(--accent-primary)';
        btn.style.color = 'var(--text-on-accent, #fff)';
      } else {
        btn.setAttribute('aria-pressed', 'false');
        btn.style.background = 'transparent';
        btn.style.borderColor = 'var(--border-primary)';
        btn.style.color = 'var(--text-secondary)';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drag resize
  // ---------------------------------------------------------------------------

  private onDragStart(panelId: PanelId, e: PointerEvent): void {
    e.preventDefault();
    const panel = this.store.panels[panelId];
    const startPos = panelId === 'bottom' ? e.clientY : e.clientX;
    this._dragging = { panel: panelId, startPos, startSize: panel.size };

    const target = e.target as HTMLElement;
    target.setPointerCapture(e.pointerId);
    this._dragCaptureTarget = target;
    this._dragPointerId = e.pointerId;

    this._boundPointerMove = (ev: PointerEvent) => this.onDragMove(ev);
    this._boundPointerUp = (ev: PointerEvent) => this.onDragEnd(ev);
    document.addEventListener('pointermove', this._boundPointerMove);
    document.addEventListener('pointerup', this._boundPointerUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = panelId === 'bottom' ? 'row-resize' : 'col-resize';
  }

  private onDragMove(e: PointerEvent): void {
    if (!this._dragging) return;
    const { panel: panelId, startPos, startSize } = this._dragging;

    if (panelId === 'bottom') {
      // Dragging up increases height
      const delta = startPos - e.clientY;
      this.store.setPanelSize('bottom', startSize + delta);
    } else if (panelId === 'left') {
      // Dragging right increases width
      const delta = e.clientX - startPos;
      const newSize = startSize + delta;
      if (this.store.panels.left.collapsed && newSize > COLLAPSED_RAIL_SIZE + 50) {
        this.store.setPanelCollapsed('left', false);
      }
      this.store.setPanelSize('left', newSize);
    } else {
      // Right: dragging left increases width
      const delta = startPos - e.clientX;
      const newSize = startSize + delta;
      if (this.store.panels.right.collapsed && newSize > COLLAPSED_RAIL_SIZE + 50) {
        this.store.setPanelCollapsed('right', false);
      }
      this.store.setPanelSize('right', newSize);
    }
  }

  private onDragEnd(_e: PointerEvent): void {
    if (this._dragCaptureTarget && this._dragPointerId >= 0) {
      this._dragCaptureTarget.releasePointerCapture(this._dragPointerId);
    }
    this._dragCaptureTarget = null;
    this._dragPointerId = -1;
    this._dragging = null;
    if (this._boundPointerMove) {
      document.removeEventListener('pointermove', this._boundPointerMove);
    }
    if (this._boundPointerUp) {
      document.removeEventListener('pointerup', this._boundPointerUp);
    }
    this._boundPointerMove = null;
    this._boundPointerUp = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // Restore handle to subtle rest state
    for (const id of ['left', 'right'] as const) {
      this.panels[id].handle.style.background = 'var(--border-primary)';
      this.panels[id].handle.style.opacity = '0.2';
    }
    this.bottomHandle.style.background = 'var(--border-primary)';
    this.bottomHandle.style.opacity = '0.2';
  }

  // ---------------------------------------------------------------------------
  // Layout application
  // ---------------------------------------------------------------------------

  private applyLayout(): void {
    const { panels } = this.store;

    // Side panels
    for (const id of ['left', 'right'] as const) {
      const panel = panels[id];
      const els = this.panels[id];
      const hasContent = this._panelTabs[id].length > 0;

      // If panel has no registered content, force it collapsed and hide the rail toggle
      const effectivelyCollapsed = panel.collapsed || !hasContent;

      if (effectivelyCollapsed) {
        els.wrapper.style.width = `${COLLAPSED_RAIL_SIZE}px`;
        els.rail.style.display = 'flex';
        els.content.style.display = 'none';
        els.handle.style.display = 'none';
        // If the store thinks it's expanded but there's no content, correct the store
        if (!panel.collapsed && !hasContent) {
          this.store.setPanelCollapsed(id, true);
        }
      } else {
        els.wrapper.style.width = `${panel.size}px`;
        els.rail.style.display = 'none';
        els.content.style.display = 'flex';
        els.handle.style.display = '';
      }

      // Hide or show the rail expand button based on whether panel has content
      const btn = els.rail.querySelector('button') as HTMLElement | null;
      if (btn) {
        btn.style.display = hasContent ? 'flex' : 'none';
      }

      // Update tab display
      this.updatePanelTabs(id, panel.activeTab);
    }

    // Bottom panel
    const bottom = panels.bottom;
    if (bottom.collapsed) {
      this.bottomSlot.style.height = '0px';
      this.bottomSlot.style.display = 'none';
      this.bottomHandle.style.display = 'none';
      this.bottomCollapseBtn.innerHTML = getIconSvg('chevron-up', 'sm');
    } else {
      this.bottomSlot.style.height = `${bottom.size}px`;
      this.bottomSlot.style.display = '';
      this.bottomHandle.style.display = '';
      this.bottomCollapseBtn.innerHTML = getIconSvg('chevron-down', 'sm');
    }

    this.emit('viewerResized', undefined as unknown as void);
  }

  private updatePanelTabs(id: 'left' | 'right', activeIndex: number): void {
    const els = this.panels[id];
    const tabs = this._panelTabs[id];

    // Clear existing tab buttons
    els.tabBar.innerHTML = '';

    if (tabs.length === 0) {
      els.tabBar.style.display = 'none';
      return;
    }

    els.tabBar.style.display = tabs.length <= 1 ? 'none' : 'flex';

    tabs.forEach((tab, idx) => {
      const btn = document.createElement('button');
      btn.textContent = tab.label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(idx === activeIndex));
      btn.style.cssText = `
        background: transparent;
        border: none;
        border-bottom: 2px solid ${idx === activeIndex ? 'var(--accent-primary)' : 'transparent'};
        color: ${idx === activeIndex ? 'var(--text-primary)' : 'var(--text-muted)'};
        padding: 4px 10px;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.12s ease;
      `;
      btn.addEventListener('click', () => this.store.setActiveTab(id, idx));
      els.tabBar.appendChild(btn);

      // Show/hide tab content
      tab.element.style.display = idx === activeIndex ? '' : 'none';
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Get root element to mount into the app container. */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Slot for top bar elements (header, tab bar, context toolbar). */
  getTopSection(): HTMLElement {
    return this.topSection;
  }

  /** Slot for the viewer canvas. */
  getViewerSlot(): HTMLElement {
    return this.viewerSlot;
  }

  /** Slot for the bottom timeline. */
  getBottomSlot(): HTMLElement {
    return this.bottomSlot;
  }

  /** Check whether a side panel has any registered tab content. */
  hasPanelContent(panelId: 'left' | 'right'): boolean {
    return this._panelTabs[panelId].length > 0;
  }

  /** Register a tab in a side panel. */
  addPanelTab(panelId: 'left' | 'right', label: string, element: HTMLElement): void {
    this._panelTabs[panelId].push({ label, element });
    this.panels[panelId].tabContent.appendChild(element);
    this.applyLayout();
  }

  /** Remove all tabs from a panel. */
  clearPanelTabs(panelId: 'left' | 'right'): void {
    this._panelTabs[panelId] = [];
    this.panels[panelId].tabContent.innerHTML = '';
    this.applyLayout();
  }

  /** Handle keyboard shortcut for preset switching. */
  handleKeyboard(key: string, altKey: boolean): boolean {
    if (!altKey) return false;
    const presetMap: Record<string, LayoutPresetId> = {
      '1': 'default',
      '2': 'review',
      '3': 'color',
      '4': 'paint',
    };
    const presetId = presetMap[key];
    if (presetId) {
      this.store.applyPreset(presetId);
      return true;
    }
    return false;
  }

  dispose(): void {
    // Unsubscribe from store events
    this._unsubLayoutChanged?.();
    this._unsubLayoutChanged = null;
    this._unsubPresetApplied?.();
    this._unsubPresetApplied = null;

    window.removeEventListener('resize', this.handleWindowResize);
    if (this._resizeRaf !== null) {
      cancelAnimationFrame(this._resizeRaf);
    }
    if (this._boundPointerMove) {
      document.removeEventListener('pointermove', this._boundPointerMove);
    }
    if (this._boundPointerUp) {
      document.removeEventListener('pointerup', this._boundPointerUp);
    }
    this.store.dispose();
  }
}
