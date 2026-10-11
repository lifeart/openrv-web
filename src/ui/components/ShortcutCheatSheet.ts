/**
 * Shortcut Cheat Sheet
 *
 * Read-only overlay that displays all available keyboard shortcuts,
 * grouped by category. Toggle with the `?` key (handled externally
 * by KeyboardManager). Supports context filtering and text search.
 *
 * Reuses `buildActionGroups` / `describeKeyCombo` from the existing
 * shortcut infrastructure so display logic is never duplicated.
 */

import { buildActionGroups, type ShortcutEditorManager } from './ShortcutEditor';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';
import { PANEL_WIDTHS, SHADOWS, Z_INDEX } from './shared/theme';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/** Id of the shared <style> element holding the cheat sheet rules. */
export const CHEATSHEET_STYLE_ID = 'shortcut-cheatsheet-styles';

/**
 * Build the cheat sheet stylesheet. Colors come from theme CSS variables and
 * stacking / widths from the shared theme tokens so the overlay follows the
 * active theme and sits on the modal layer.
 */
export function buildCheatSheetStyles(): string {
  return `
.cheatsheet-overlay {
  position: fixed;
  inset: 0;
  z-index: ${Z_INDEX.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: var(--overlay-bg, rgba(0, 0, 0, 0.75));
  font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
}
.cheatsheet-panel {
  display: flex;
  flex-direction: column;
  width: min(1200px, 100%);
  max-height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: ${SHADOWS.modal};
  overflow: hidden;
}
.cheatsheet-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
}
.cheatsheet-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.cheatsheet-hint {
  font-size: 11px;
  color: var(--text-muted);
}
.cheatsheet-columns {
  overflow-y: auto;
  min-height: 0;
  padding: 12px 16px 16px;
  column-width: ${PANEL_WIDTHS.standard};
  column-gap: 24px;
}
.cheatsheet-group {
  break-inside: avoid;
  margin: 0 0 14px;
}
.cheatsheet-group-header {
  margin: 0 0 6px;
  padding-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--accent-primary);
  border-bottom: 1px solid var(--border-secondary);
}
.cheatsheet-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.5;
}
.cheatsheet-description {
  color: var(--text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cheatsheet-combo {
  flex-shrink: 0;
  padding: 0 6px;
  border: 1px solid var(--border-primary);
  border-radius: 3px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace);
  font-size: 11px;
  white-space: nowrap;
}
.cheatsheet-customized .cheatsheet-combo {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.cheatsheet-empty {
  padding: 24px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}
`;
}

function ensureCheatSheetStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(CHEATSHEET_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CHEATSHEET_STYLE_ID;
  style.textContent = buildCheatSheetStyles();
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// ShortcutCheatSheet DOM component
// ---------------------------------------------------------------------------

export class ShortcutCheatSheet {
  private container: HTMLElement;
  private manager: ShortcutEditorManager;
  private overlay: HTMLElement;
  private context: string | null = null;
  private filterQuery: string = '';
  private disposed = false;
  private deregisterDismiss: (() => void) | null = null;

  constructor(container: HTMLElement, manager: ShortcutEditorManager) {
    this.container = container;
    this.manager = manager;

    this.overlay = document.createElement('div');
    this.overlay.className = 'cheatsheet-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Keyboard shortcuts');
    this.overlay.style.display = 'none';
    ensureCheatSheetStyles();
    this.container.appendChild(this.overlay);
  }

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  show(): void {
    if (this.disposed) return;
    this.overlay.style.display = '';
    this.render();
  }

  /**
   * The cheat sheet is dismissed when the user clicks the overlay backdrop
   * (anywhere outside the panel). Register the current panel as the "inside"
   * element so clicks on it do not dismiss. Re-run after every render because
   * rendering replaces the panel element.
   */
  private registerDismiss(): void {
    this.deregisterDismiss?.();
    const content = this.overlay.querySelector<HTMLElement>('.cheatsheet-panel');
    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [content],
      onDismiss: () => this.hide(),
    });
  }

  hide(): void {
    if (this.disposed) return;
    this.overlay.style.display = 'none';

    if (this.deregisterDismiss) {
      this.deregisterDismiss();
      this.deregisterDismiss = null;
    }
  }

  toggle(): void {
    if (this.disposed) return;
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    if (this.disposed) return false;
    return this.overlay.style.display !== 'none';
  }

  // -------------------------------------------------------------------------
  // Context filtering
  // -------------------------------------------------------------------------

  setContext(context: string | null): void {
    if (this.disposed) return;
    this.context = context;
    if (this.isVisible()) {
      this.render();
    }
  }

  getContext(): string | null {
    return this.context;
  }

  // -------------------------------------------------------------------------
  // Text search / filter
  // -------------------------------------------------------------------------

  filter(query: string): void {
    if (this.disposed) return;
    this.filterQuery = query;
    if (this.isVisible()) {
      this.render();
    }
  }

  clearFilter(): void {
    if (this.disposed) return;
    this.filterQuery = '';
    if (this.isVisible()) {
      this.render();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private render(): void {
    this.overlay.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'cheatsheet-panel';

    const headerBar = document.createElement('div');
    headerBar.className = 'cheatsheet-header';
    const title = document.createElement('h2');
    title.className = 'cheatsheet-title';
    title.textContent = 'Keyboard Shortcuts';
    const hint = document.createElement('span');
    hint.className = 'cheatsheet-hint';
    hint.textContent = 'Press ? or Esc to close';
    headerBar.appendChild(title);
    headerBar.appendChild(hint);
    panel.appendChild(headerBar);

    const columnsWrapper = document.createElement('div');
    columnsWrapper.className = 'cheatsheet-columns';

    let groups = buildActionGroups(this.manager);

    // Context filtering: only show groups matching the context category
    if (this.context !== null) {
      groups = groups.filter((g) => g.category === this.context);
    }

    // Text search filtering
    const query = this.filterQuery.toLowerCase();

    for (const group of groups) {
      const filteredActions = query
        ? group.actions.filter(
            (entry) =>
              entry.description.toLowerCase().includes(query) || entry.comboLabel.toLowerCase().includes(query),
          )
        : group.actions;

      // Skip empty groups after filtering
      if (filteredActions.length === 0) continue;

      const section = document.createElement('div');
      section.className = 'cheatsheet-group';
      section.dataset.category = group.category;

      const header = document.createElement('h3');
      header.className = 'cheatsheet-group-header';
      header.textContent = group.label;
      section.appendChild(header);

      for (const entry of filteredActions) {
        const row = document.createElement('div');
        row.className = 'cheatsheet-row';
        row.dataset.action = entry.action;

        if (entry.isCustomized) {
          row.classList.add('cheatsheet-customized');
        }

        const desc = document.createElement('span');
        desc.className = 'cheatsheet-description';
        desc.textContent = entry.description;

        const combo = document.createElement('span');
        combo.className = 'cheatsheet-combo';
        combo.textContent = entry.comboLabel;

        row.appendChild(desc);
        row.appendChild(combo);
        section.appendChild(row);
      }

      columnsWrapper.appendChild(section);
    }

    if (columnsWrapper.childElementCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'cheatsheet-empty';
      empty.textContent = 'No matching shortcuts';
      columnsWrapper.appendChild(empty);
    }

    panel.appendChild(columnsWrapper);
    this.overlay.appendChild(panel);

    if (this.isVisible()) {
      this.registerDismiss();
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.deregisterDismiss) {
      this.deregisterDismiss();
      this.deregisterDismiss = null;
    }
    this.overlay.remove();
  }
}
