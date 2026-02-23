/**
 * Shortcut Editor
 *
 * UI panel for viewing and customizing keyboard shortcuts.
 * Groups actions by category, supports key capture for rebinding,
 * conflict detection, per-action reset, and bulk export/import.
 */

import type { KeyCombination } from '../../utils/input/KeyboardManager';
import { describeKeyCombo } from '../../utils/input/KeyBindings';

// ---------------------------------------------------------------------------
// Minimal interface for the keybindings manager (avoids hard coupling)
// ---------------------------------------------------------------------------

export interface ShortcutEditorManager {
  getAvailableActions(): Array<{ action: string; description: string; currentCombo: KeyCombination }>;
  getEffectiveCombo(action: string): KeyCombination;
  setCustomBinding(action: string, combo: KeyCombination, force?: boolean): void;
  findConflictingAction(combo: KeyCombination, excludeAction?: string): string | null;
  hasCustomBinding(action: string): boolean;
  removeCustomBinding(action: string): void;
  resetAll(): void;
  getCustomBindings(): Array<{ action: string; customCombo: KeyCombination }>;
}

// ---------------------------------------------------------------------------
// Category grouping
// ---------------------------------------------------------------------------

export interface ActionEntry {
  action: string;
  description: string;
  currentCombo: KeyCombination;
  comboLabel: string;
  isCustomized: boolean;
  category: string;
}

export interface ActionGroup {
  category: string;
  label: string;
  actions: ActionEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  playback: 'Playback',
  timeline: 'Timeline',
  view: 'View',
  panel: 'Panels',
  transform: 'Transform',
  export: 'Export',
  edit: 'Edit',
  annotation: 'Annotations',
  tab: 'Tabs',
  paint: 'Paint',
  channel: 'Channels',
  stereo: 'Stereo',
  color: 'Color',
  display: 'Display',
  snapshot: 'Snapshot',
  notes: 'Notes',
  network: 'Network',
  layout: 'Layout',
  focus: 'Focus',
  theme: 'Theme',
  help: 'Help',
};

/**
 * Extract the category prefix from a dot-notation action name.
 */
export function getActionCategory(action: string): string {
  const dot = action.indexOf('.');
  return dot >= 0 ? action.slice(0, dot) : 'other';
}

/**
 * Build grouped action entries from the manager's available actions.
 */
export function buildActionGroups(manager: ShortcutEditorManager): ActionGroup[] {
  const actions = manager.getAvailableActions();
  const groups = new Map<string, ActionEntry[]>();

  for (const { action, description, currentCombo } of actions) {
    const category = getActionCategory(action);
    const entry: ActionEntry = {
      action,
      description,
      currentCombo,
      comboLabel: describeKeyCombo(currentCombo),
      isCustomized: manager.hasCustomBinding(action),
      category,
    };

    let list = groups.get(category);
    if (!list) {
      list = [];
      groups.set(category, list);
    }
    list.push(entry);
  }

  // Sort categories alphabetically, with known categories in a stable order
  const knownOrder = Object.keys(CATEGORY_LABELS);
  const sortedCategories = [...groups.keys()].sort((a, b) => {
    const ai = knownOrder.indexOf(a);
    const bi = knownOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });

  return sortedCategories.map(category => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    actions: groups.get(category)!,
  }));
}

// ---------------------------------------------------------------------------
// Key capture — convert a KeyboardEvent to a KeyCombination
// ---------------------------------------------------------------------------

/** Modifier-only codes that should not be captured as standalone keys. */
const MODIFIER_CODES = new Set([
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

/**
 * Convert a KeyboardEvent to a KeyCombination.
 * Returns null for modifier-only presses (user is still building the combo).
 */
export function keyEventToCombo(e: KeyboardEvent): KeyCombination | null {
  if (MODIFIER_CODES.has(e.code)) return null;

  const combo: KeyCombination = { code: e.code };
  if (e.ctrlKey || e.metaKey) combo.ctrl = true;
  if (e.shiftKey) combo.shift = true;
  if (e.altKey) combo.alt = true;
  return combo;
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

export interface ConflictInfo {
  existingAction: string;
  existingDescription: string;
  combo: KeyCombination;
}

/**
 * Check for conflicts when assigning a new combo to an action.
 * Returns ConflictInfo if a conflict exists, or null if the combo is free.
 */
export function checkConflict(
  manager: ShortcutEditorManager,
  action: string,
  newCombo: KeyCombination,
): ConflictInfo | null {
  const conflicting = manager.findConflictingAction(newCombo, action);
  if (!conflicting) return null;

  const actions = manager.getAvailableActions();
  const found = actions.find(a => a.action === conflicting);
  return {
    existingAction: conflicting,
    existingDescription: found?.description ?? conflicting,
    combo: newCombo,
  };
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export interface ExportedBindings {
  version: 1;
  bindings: Array<{ action: string; combo: KeyCombination }>;
}

/**
 * Export all custom bindings as a JSON string.
 */
export function exportBindings(manager: ShortcutEditorManager): string {
  const bindings = manager.getCustomBindings().map(b => ({
    action: b.action,
    combo: b.customCombo,
  }));
  const data: ExportedBindings = { version: 1, bindings };
  return JSON.stringify(data, null, 2);
}

/**
 * Import bindings from a JSON string.
 * Returns the count of successfully imported bindings.
 */
export function importBindings(manager: ShortcutEditorManager, json: string): number {
  const data = JSON.parse(json) as ExportedBindings;
  if (!data || data.version !== 1 || !Array.isArray(data.bindings)) {
    throw new Error('Invalid bindings format');
  }

  let count = 0;
  for (const { action, combo } of data.bindings) {
    if (typeof action === 'string' && combo && typeof combo.code === 'string') {
      const sanitized: KeyCombination = { code: combo.code };
      if (combo.ctrl === true) sanitized.ctrl = true;
      if (combo.shift === true) sanitized.shift = true;
      if (combo.alt === true) sanitized.alt = true;
      if (combo.meta === true) sanitized.meta = true;
      manager.setCustomBinding(action, sanitized, true);
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// ShortcutEditor DOM component
// ---------------------------------------------------------------------------

export class ShortcutEditor {
  private container: HTMLElement;
  private manager: ShortcutEditorManager;
  private listeningAction: string | null = null;
  private listContainer: HTMLElement;
  private toolbar: HTMLElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement, manager: ShortcutEditorManager) {
    this.container = container;
    this.manager = manager;
    this.listContainer = document.createElement('div');
    this.container.appendChild(this.listContainer);
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);
    this.render();
  }

  getListeningAction(): string | null {
    return this.listeningAction;
  }

  render(): void {
    this.listContainer.innerHTML = '';
    const groups = buildActionGroups(this.manager);

    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'shortcut-group';
      section.dataset.category = group.category;

      const header = document.createElement('h3');
      header.className = 'shortcut-group-header';
      header.textContent = group.label;
      section.appendChild(header);

      for (const entry of group.actions) {
        const row = document.createElement('div');
        row.className = 'shortcut-row';
        row.dataset.action = entry.action;

        const desc = document.createElement('span');
        desc.className = 'shortcut-description';
        desc.textContent = entry.description;

        const combo = document.createElement('button');
        combo.className = 'shortcut-combo';
        combo.textContent = entry.comboLabel;
        combo.addEventListener('click', () => this.startListening(entry.action));

        row.appendChild(desc);
        row.appendChild(combo);

        if (entry.isCustomized) {
          row.classList.add('shortcut-modified');

          const resetBtn = document.createElement('button');
          resetBtn.className = 'shortcut-reset';
          resetBtn.textContent = 'Reset';
          resetBtn.addEventListener('click', () => {
            this.manager.removeCustomBinding(entry.action);
            this.render();
          });
          row.appendChild(resetBtn);
        }

        section.appendChild(row);
      }

      this.listContainer.appendChild(section);
    }

  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'shortcut-toolbar';

    const resetAllBtn = document.createElement('button');
    resetAllBtn.className = 'shortcut-reset-all';
    resetAllBtn.textContent = 'Reset All';
    resetAllBtn.addEventListener('click', () => {
      this.manager.resetAll();
      this.render();
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'shortcut-export';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', () => this.exportToFile());

    const importBtn = document.createElement('button');
    importBtn.className = 'shortcut-import';
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', () => this.importFromFile());

    toolbar.appendChild(resetAllBtn);
    toolbar.appendChild(exportBtn);
    toolbar.appendChild(importBtn);
    return toolbar;
  }

  private startListening(action: string): void {
    // Clean up any previous listener to prevent leaks on rapid re-click
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
    this.listeningAction = action;

    // Update UI to show listening state
    const rows = this.listContainer.querySelectorAll('.shortcut-row');
    const row = [...rows].find(r => (r as HTMLElement).dataset.action === action);
    const comboBtn = row?.querySelector('.shortcut-combo');
    if (comboBtn) {
      comboBtn.textContent = 'Press key...';
      comboBtn.classList.add('shortcut-listening');
    }

    this.keyHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const combo = keyEventToCombo(e);
      if (!combo) return; // Modifier-only press, keep listening

      if (e.code === 'Escape') {
        this.stopListening();
        return;
      }

      const conflict = checkConflict(this.manager, action, combo);
      if (conflict) {
        const confirmMsg = `"${describeKeyCombo(combo)}" is already used by "${conflict.existingDescription}". Override?`;
        if (!confirm(confirmMsg)) {
          this.stopListening();
          return;
        }
      }

      this.manager.setCustomBinding(action, combo, true);
      this.stopListening();
    };

    document.addEventListener('keydown', this.keyHandler, true);
  }

  private stopListening(): void {
    this.listeningAction = null;
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
    this.render();
  }

  private exportToFile(): void {
    const json = exportBindings(this.manager);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keybindings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private importFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importBindings(this.manager, reader.result as string);
          this.render();
        } catch {
          // Import failed silently
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  dispose(): void {
    this.stopListening();
    this.container.innerHTML = '';
  }
}
