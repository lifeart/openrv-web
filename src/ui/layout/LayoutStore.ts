/**
 * LayoutStore - State management for customizable panel layout.
 *
 * Pure data layer managing panel sizes, collapsed states, and preset layouts.
 * Persists to localStorage with debounced saves.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelId = 'left' | 'right' | 'bottom';

export interface PanelState {
  /** Current size in pixels (width for left/right, height for bottom). */
  size: number;
  /** Whether the panel is collapsed (shows only a thin rail). */
  collapsed: boolean;
  /** Active tab index within this panel region. */
  activeTab: number;
}

export interface LayoutData {
  /** Schema version for forward-compatible migration. */
  version: number;
  /** Panel states keyed by panel ID. */
  panels: Record<PanelId, PanelState>;
}

export type LayoutPresetId = 'review' | 'color' | 'paint' | 'default';

export interface LayoutPreset {
  id: LayoutPresetId;
  label: string;
  data: Omit<LayoutData, 'version'>;
}

export interface LayoutStoreEvents extends EventMap {
  layoutChanged: LayoutData;
  presetApplied: LayoutPresetId;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LAYOUT_SCHEMA_VERSION = 1;
export const LAYOUT_STORAGE_KEY = 'openrv-layout';
export const LAYOUT_CUSTOM_LIST_KEY = 'openrv-layout-custom-list';

/** How long to debounce before writing to localStorage (ms). */
const SAVE_DEBOUNCE_MS = 500;

// Size constraints
export const MIN_SIDE_PANEL_WIDTH = 150;
export const MAX_SIDE_PANEL_RATIO = 0.5; // 50% of viewport
export const MIN_BOTTOM_PANEL_HEIGHT = 80;
export const MAX_BOTTOM_PANEL_RATIO = 0.4; // 40% of viewport
export const COLLAPSED_RAIL_SIZE = 32;

/** Threshold beyond which a panel auto-expands from collapsed drag. */
export const EXPAND_DRAG_THRESHOLD = 80;

// Default layout
export const DEFAULT_PANEL_STATES: Record<PanelId, PanelState> = {
  left: { size: 0, collapsed: true, activeTab: 0 },
  right: { size: 280, collapsed: true, activeTab: 0 },
  bottom: { size: 120, collapsed: false, activeTab: 0 },
};

function defaultLayout(): LayoutData {
  return {
    version: LAYOUT_SCHEMA_VERSION,
    panels: {
      left: { ...DEFAULT_PANEL_STATES.left },
      right: { ...DEFAULT_PANEL_STATES.right },
      bottom: { ...DEFAULT_PANEL_STATES.bottom },
    },
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    // Playback-first layout: clean viewer, side panels tucked away,
    // but keep practical stored widths for quick expand.
    id: 'default',
    label: 'Default',
    data: {
      panels: {
        left: { size: 300, collapsed: true, activeTab: 0 },
        right: { size: 340, collapsed: true, activeTab: 0 },
        bottom: { size: 132, collapsed: false, activeTab: 0 },
      },
    },
  },
  {
    // QC/review-first: prioritize inspector + timeline for scrubbing.
    id: 'review',
    label: 'Review',
    data: {
      panels: {
        left: { size: 280, collapsed: true, activeTab: 0 },
        right: { size: 360, collapsed: false, activeTab: 0 },
        bottom: { size: 132, collapsed: false, activeTab: 0 },
      },
    },
  },
  {
    // Color-grading-first: wide controls + scopes, compact timeline.
    id: 'color',
    label: 'Color',
    data: {
      panels: {
        left: { size: 340, collapsed: false, activeTab: 0 },
        right: { size: 380, collapsed: false, activeTab: 0 },
        bottom: { size: 96, collapsed: false, activeTab: 0 },
      },
    },
  },
  {
    // Annotation-first: keep tools visible on left, suppress right inspector.
    id: 'paint',
    label: 'Paint',
    data: {
      panels: {
        left: { size: 300, collapsed: false, activeTab: 0 },
        right: { size: 320, collapsed: true, activeTab: 0 },
        bottom: { size: 180, collapsed: false, activeTab: 0 },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// LayoutStore
// ---------------------------------------------------------------------------

export class LayoutStore extends EventEmitter<LayoutStoreEvents> {
  private _layout: LayoutData;
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _viewportWidth = 0;
  private _viewportHeight = 0;

  constructor() {
    super();
    this._layout = this.loadFromStorage();
  }

  // --- Getters ---

  get layout(): LayoutData {
    return this._layout;
  }

  get panels(): Record<PanelId, PanelState> {
    return this._layout.panels;
  }

  // --- Panel operations ---

  setPanelSize(id: PanelId, size: number): void {
    const clamped = this.clampSize(id, size);
    if (this._layout.panels[id].size === clamped) return;
    this._layout.panels[id].size = clamped;
    this.notifyAndSave();
  }

  setPanelCollapsed(id: PanelId, collapsed: boolean): void {
    if (this._layout.panels[id].collapsed === collapsed) return;
    this._layout.panels[id].collapsed = collapsed;

    // When uncollapsing, ensure size is at least the minimum so the panel is visible
    if (!collapsed) {
      const panel = this._layout.panels[id];
      const minSize = id === 'bottom' ? MIN_BOTTOM_PANEL_HEIGHT : MIN_SIDE_PANEL_WIDTH;
      if (panel.size < minSize) {
        panel.size = minSize;
      }
    }

    this.notifyAndSave();
  }

  togglePanelCollapsed(id: PanelId): void {
    this.setPanelCollapsed(id, !this._layout.panels[id].collapsed);
  }

  setActiveTab(id: PanelId, tabIndex: number): void {
    if (this._layout.panels[id].activeTab === tabIndex) return;
    this._layout.panels[id].activeTab = tabIndex;
    this.notifyAndSave();
  }

  // --- Computed sizes ---

  /** Effective width for left/right panel (collapsed → rail, else stored size). */
  getEffectiveSize(id: PanelId): number {
    const panel = this._layout.panels[id];
    if (panel.collapsed) return COLLAPSED_RAIL_SIZE;
    return panel.size;
  }

  /**
   * Compute remaining viewer width given a viewport width.
   * Subtracts effective left and right panel sizes.
   */
  getViewerWidth(viewportWidth: number): number {
    const left = this.getEffectiveSize('left');
    const right = this.getEffectiveSize('right');
    return Math.max(100, viewportWidth - left - right);
  }

  /**
   * Compute remaining viewer height given a viewport height (minus fixed toolbars).
   * Subtracts effective bottom panel size.
   */
  getViewerHeight(viewportHeight: number, fixedTopHeight: number): number {
    const bottom = this.getEffectiveSize('bottom');
    return Math.max(100, viewportHeight - fixedTopHeight - bottom);
  }

  // --- Clamping ---

  private clampSize(id: PanelId, size: number): number {
    if (id === 'bottom') {
      const maxHeight = this._viewportHeight * MAX_BOTTOM_PANEL_RATIO;
      return Math.max(MIN_BOTTOM_PANEL_HEIGHT, Math.min(size, maxHeight || size));
    }
    const maxWidth = this._viewportWidth * MAX_SIDE_PANEL_RATIO;
    return Math.max(MIN_SIDE_PANEL_WIDTH, Math.min(size, maxWidth || size));
  }

  /**
   * Handle viewport resize. If panels exceed max ratio, shrink them.
   * Auto-collapses panels when viewport is too small.
   */
  handleViewportResize(viewportWidth: number, viewportHeight: number): void {
    this._viewportWidth = viewportWidth;
    this._viewportHeight = viewportHeight;
    let changed = false;

    // Clamp side panels to max ratio
    const maxSide = Math.floor(viewportWidth * MAX_SIDE_PANEL_RATIO);
    for (const id of ['left', 'right'] as const) {
      const panel = this._layout.panels[id];
      if (!panel.collapsed && panel.size > maxSide) {
        panel.size = Math.max(MIN_SIDE_PANEL_WIDTH, maxSide);
        changed = true;
      }
    }

    // Clamp bottom panel to max ratio
    const maxBottom = Math.floor(viewportHeight * MAX_BOTTOM_PANEL_RATIO);
    if (!this._layout.panels.bottom.collapsed && this._layout.panels.bottom.size > maxBottom) {
      this._layout.panels.bottom.size = Math.max(MIN_BOTTOM_PANEL_HEIGHT, maxBottom);
      changed = true;
    }

    // Auto-collapse if viewport is too small for two side panels
    const leftEff = this._layout.panels.left.collapsed ? COLLAPSED_RAIL_SIZE : this._layout.panels.left.size;
    const rightEff = this._layout.panels.right.collapsed ? COLLAPSED_RAIL_SIZE : this._layout.panels.right.size;
    const remainingWidth = viewportWidth - leftEff - rightEff;

    if (remainingWidth < 200) {
      // Collapse right first, then left
      if (!this._layout.panels.right.collapsed) {
        this._layout.panels.right.collapsed = true;
        changed = true;
      } else if (!this._layout.panels.left.collapsed) {
        this._layout.panels.left.collapsed = true;
        changed = true;
      }
    }

    if (changed) {
      this.notifyAndSave();
    }
  }

  // --- Presets ---

  applyPreset(presetId: LayoutPresetId): void {
    const preset = LAYOUT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;

    this._layout.panels = {
      left: { ...preset.data.panels.left },
      right: { ...preset.data.panels.right },
      bottom: { ...preset.data.panels.bottom },
    };

    this.emit('presetApplied', presetId);
    this.notifyAndSave();
  }

  getPresets(): LayoutPreset[] {
    return LAYOUT_PRESETS;
  }

  // --- Custom layouts ---

  saveCustomLayout(name: string): void {
    const key = `${LAYOUT_STORAGE_KEY}-custom-${name.toLowerCase().replace(/\s+/g, '-')}`;
    const data: LayoutData = {
      version: LAYOUT_SCHEMA_VERSION,
      panels: {
        left: { ...this._layout.panels.left },
        right: { ...this._layout.panels.right },
        bottom: { ...this._layout.panels.bottom },
      },
    };
    try {
      localStorage.setItem(key, JSON.stringify(data));
      // Update custom list
      const list = this.getCustomLayoutNames();
      if (!list.includes(name)) {
        list.push(name);
        localStorage.setItem(LAYOUT_CUSTOM_LIST_KEY, JSON.stringify(list));
      }
    } catch {
      // localStorage unavailable
    }
  }

  loadCustomLayout(name: string): boolean {
    const key = `${LAYOUT_STORAGE_KEY}-custom-${name.toLowerCase().replace(/\s+/g, '-')}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const data = JSON.parse(raw) as LayoutData;
      if (this.validateLayoutData(data)) {
        this._layout = this.migrateIfNeeded(data);
        this.notifyAndSave();
        return true;
      }
    } catch {
      // Invalid data
    }
    return false;
  }

  deleteCustomLayout(name: string): void {
    const key = `${LAYOUT_STORAGE_KEY}-custom-${name.toLowerCase().replace(/\s+/g, '-')}`;
    try {
      localStorage.removeItem(key);
      const list = this.getCustomLayoutNames().filter(n => n !== name);
      localStorage.setItem(LAYOUT_CUSTOM_LIST_KEY, JSON.stringify(list));
    } catch {
      // localStorage unavailable
    }
  }

  getCustomLayoutNames(): string[] {
    try {
      const raw = localStorage.getItem(LAYOUT_CUSTOM_LIST_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  }

  // --- Persistence ---

  private loadFromStorage(): LayoutData {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (!raw) return defaultLayout();
      const data = JSON.parse(raw) as LayoutData;
      if (this.validateLayoutData(data)) {
        return this.migrateIfNeeded(data);
      }
      console.warn('Invalid layout data, using defaults');
      return defaultLayout();
    } catch {
      console.warn('Invalid layout data, using defaults');
      return defaultLayout();
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(this._layout));
    } catch {
      // localStorage unavailable or quota exceeded
    }
  }

  private scheduleSave(): void {
    if (this._saveTimer !== null) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveToStorage();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Immediately flush pending save (useful for tests or shutdown). */
  flushSave(): void {
    if (this._saveTimer !== null) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this.saveToStorage();
    }
  }

  private notifyAndSave(): void {
    this.emit('layoutChanged', this._layout);
    this.scheduleSave();
  }

  // --- Validation & Migration ---

  private validateLayoutData(data: unknown): data is LayoutData {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    if (typeof d.version !== 'number') return false;
    if (!d.panels || typeof d.panels !== 'object') return false;
    const panels = d.panels as Record<string, unknown>;
    for (const id of ['left', 'right', 'bottom'] as const) {
      const panel = panels[id];
      if (!panel || typeof panel !== 'object') return false;
      const p = panel as Record<string, unknown>;
      if (typeof p.size !== 'number') return false;
      if (typeof p.collapsed !== 'boolean') return false;
      if (typeof p.activeTab !== 'number') return false;
    }
    return true;
  }

  private migrateIfNeeded(data: LayoutData): LayoutData {
    // Currently only version 1 exists. Future migrations go here.
    if (data.version < LAYOUT_SCHEMA_VERSION) {
      // Fill any missing fields with defaults
      const def = defaultLayout();
      for (const id of ['left', 'right', 'bottom'] as const) {
        if (!data.panels[id]) {
          data.panels[id] = { ...def.panels[id] };
        }
      }
      data.version = LAYOUT_SCHEMA_VERSION;
    }
    return data;
  }

  /** Reset to default layout. */
  reset(): void {
    this._layout = defaultLayout();
    this.notifyAndSave();
  }

  dispose(): void {
    this.flushSave();
  }
}
