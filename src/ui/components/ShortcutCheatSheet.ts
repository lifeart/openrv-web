/**
 * Shortcut Cheat Sheet
 *
 * Read-only overlay that displays all available keyboard shortcuts,
 * grouped by category. Toggle with the `?` key (handled externally
 * by KeyboardManager).
 *
 * Reuses `buildActionGroups` / `describeKeyCombo` from the existing
 * shortcut infrastructure so display logic is never duplicated.
 *
 * Includes a search input and context-filter dropdown so users can
 * narrow the shortcut list interactively.
 */

import { buildActionGroups, type ShortcutEditorManager } from './ShortcutEditor';

// ---------------------------------------------------------------------------
// ShortcutCheatSheet DOM component
// ---------------------------------------------------------------------------

export class ShortcutCheatSheet {
  private container: HTMLElement;
  private manager: ShortcutEditorManager;
  private overlay: HTMLElement;
  private toolbar: HTMLElement;
  private contentArea: HTMLElement;
  private searchInput: HTMLInputElement;
  private contextSelect: HTMLSelectElement;
  private context: string | null = null;
  private filterQuery: string = '';
  private disposed = false;

  constructor(container: HTMLElement, manager: ShortcutEditorManager) {
    this.container = container;
    this.manager = manager;

    this.overlay = document.createElement('div');
    this.overlay.className = 'cheatsheet-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Keyboard shortcuts');
    this.overlay.style.display = 'none';

    // Toolbar (created once, never cleared)
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'cheatsheet-toolbar';
    this.toolbar.setAttribute('role', 'toolbar');

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.className = 'cheatsheet-search';
    this.searchInput.placeholder = 'Search shortcuts...';
    this.searchInput.setAttribute('aria-label', 'Search shortcuts');
    this.searchInput.addEventListener('input', () => {
      this.filter(this.searchInput.value);
    });
    this.searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        this.searchInput.blur();
      }
    });

    this.contextSelect = document.createElement('select');
    this.contextSelect.className = 'cheatsheet-context-select';
    this.contextSelect.setAttribute('aria-label', 'Filter by category');
    this.contextSelect.addEventListener('change', () => {
      const value = this.contextSelect.value;
      this.setContext(value === '' ? null : value);
    });
    this.contextSelect.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    this.toolbar.appendChild(this.searchInput);
    this.toolbar.appendChild(this.contextSelect);
    this.overlay.appendChild(this.toolbar);

    // Content area (cleared on each render)
    this.contentArea = document.createElement('div');
    this.contentArea.className = 'cheatsheet-content';
    this.overlay.appendChild(this.contentArea);

    this.container.appendChild(this.overlay);
  }

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  show(): void {
    if (this.disposed) return;
    this.render();
    this.overlay.style.display = '';
    this.searchInput.focus();
  }

  hide(): void {
    if (this.disposed) return;
    this.overlay.style.display = 'none';
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
    this.contextSelect.value = context ?? '';
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
    this.searchInput.value = query;
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
    this.contentArea.innerHTML = '';

    const columnsWrapper = document.createElement('div');
    columnsWrapper.className = 'cheatsheet-columns';

    const allGroups = buildActionGroups(this.manager);

    // Populate context select options from available groups
    const currentSelectValue = this.contextSelect.value;
    this.contextSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'All Categories';
    this.contextSelect.appendChild(allOption);
    for (const group of allGroups) {
      const opt = document.createElement('option');
      opt.value = group.category;
      opt.textContent = group.label;
      this.contextSelect.appendChild(opt);
    }
    this.contextSelect.value = currentSelectValue;

    let groups = allGroups;

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

    this.contentArea.appendChild(columnsWrapper);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.overlay.remove();
  }
}
