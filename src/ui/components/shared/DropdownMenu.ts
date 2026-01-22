/**
 * Shared Dropdown Menu Utility
 *
 * Provides consistent dropdown behavior across all controls:
 * - Keyboard navigation (ArrowUp/Down, Enter, Escape)
 * - Automatic z-index stacking (newer menus on top)
 * - Close other menus when opening a new one
 * - Focus management
 */

import { COLORS, Z_INDEX, TRANSITIONS } from './theme';

// Global z-index counter for stacking multiple dropdowns
// Resets when all dropdowns are closed to prevent unbounded growth
let globalZIndex = Z_INDEX.dropdown;
const BASE_Z_INDEX = Z_INDEX.dropdown;

// Track all open dropdowns to close others when opening a new one
const openDropdowns = new Set<DropdownMenu>();

// Counter for generating unique IDs
let dropdownIdCounter = 0;

/**
 * Reset module state - only for testing purposes
 * @internal
 */
export function _resetDropdownState(): void {
  globalZIndex = BASE_Z_INDEX;
  openDropdowns.clear();
  dropdownIdCounter = 0;
}

export interface DropdownMenuItem {
  value: string;
  label: string;
  /** Optional text icon (emoji/unicode) to display before label. HTML is not supported for security. */
  icon?: string;
  /** Optional shortcut hint to display after label */
  shortcut?: string;
  /** Optional color indicator */
  color?: string;
  /** Whether this item is disabled */
  disabled?: boolean;
}

export interface DropdownMenuOptions {
  /** Minimum width of the dropdown */
  minWidth?: string;
  /** Maximum height before scrolling */
  maxHeight?: string;
  /** Alignment relative to anchor */
  align?: 'left' | 'right';
  /** Called when an item is selected (single-select mode) */
  onSelect?: (value: string) => void;
  /** Called when the dropdown is closed */
  onClose?: () => void;
  /** Whether to close other dropdowns when opening this one */
  closeOthers?: boolean;
  /** Enable multi-select mode (space toggles selection without closing) */
  multiSelect?: boolean;
  /** Called when selection changes in multi-select mode */
  onSelectionChange?: (values: string[]) => void;
}

export class DropdownMenu {
  private dropdown: HTMLElement;
  private items: DropdownMenuItem[] = [];
  private highlightedIndex = -1; // Currently highlighted item (keyboard or mouse)
  private isOpen = false;
  private currentAnchor: HTMLElement | null = null;
  private options: DropdownMenuOptions;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleKeydown: (e: KeyboardEvent) => void;
  private boundHandleReposition: () => void;
  private itemButtons: HTMLButtonElement[] = [];
  private dropdownId: string;
  private selectedValues: Set<string> = new Set();

  constructor(options: DropdownMenuOptions = {}) {
    this.options = {
      minWidth: '100px',
      maxHeight: '300px',
      align: 'left',
      closeOthers: true,
      multiSelect: false,
      ...options,
    };

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleKeydown = (e: KeyboardEvent) => this.handleKeydown(e);
    this.boundHandleReposition = () => this.positionDropdown();

    // Generate unique ID for this dropdown instance
    this.dropdownId = `dropdown-menu-${++dropdownIdCounter}`;

    this.dropdown = document.createElement('div');
    this.dropdown.id = this.dropdownId;
    this.dropdown.className = 'dropdown-menu';
    this.dropdown.setAttribute('role', 'listbox');
    this.dropdown.tabIndex = -1;
    this.dropdown.style.cssText = `
      position: fixed;
      background: ${COLORS.bgPanel};
      border: 1px solid ${COLORS.borderDefault};
      border-radius: 4px;
      padding: 4px;
      z-index: ${globalZIndex};
      display: none;
      flex-direction: column;
      min-width: ${this.options.minWidth};
      max-height: ${this.options.maxHeight};
      overflow-y: auto;
      box-shadow: ${COLORS.shadowDropdown};
      outline: none;
    `;
  }

  /**
   * Set the items in the dropdown
   */
  setItems(items: DropdownMenuItem[]): void {
    this.items = items;
    this.populateDropdown();
  }

  /**
   * Get current items
   */
  getItems(): DropdownMenuItem[] {
    return [...this.items];
  }

  private populateDropdown(): void {
    this.dropdown.innerHTML = '';
    this.itemButtons = [];

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!item) continue;
      const button = this.createItemButton(item, i);
      this.itemButtons.push(button);
      this.dropdown.appendChild(button);
    }
  }

  private createItemButton(item: DropdownMenuItem, index: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = `${this.dropdownId}-item-${index}`;
    button.dataset.value = item.value;
    button.dataset.index = String(index);
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', 'false');
    button.disabled = item.disabled ?? false;
    const isSelected = this.selectedValues.has(item.value);
    button.style.cssText = `
      background: transparent;
      border: none;
      color: ${item.disabled ? COLORS.textDisabled : COLORS.textDefault};
      padding: 6px 10px;
      text-align: left;
      cursor: ${item.disabled ? 'not-allowed' : 'pointer'};
      font-size: 12px;
      border-radius: 3px;
      transition: background ${TRANSITIONS.fast};
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
    `;

    // Left part (checkmark for multiselect + icon + color dot + label)
    const leftPart = document.createElement('span');
    leftPart.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    // Add checkmark for multiselect mode
    if (this.options.multiSelect) {
      const checkmark = document.createElement('span');
      checkmark.className = 'dropdown-checkmark';
      checkmark.textContent = isSelected ? '\u2713' : '';
      checkmark.style.cssText = `
        width: 14px;
        color: ${COLORS.accent};
        font-size: 12px;
      `;
      leftPart.appendChild(checkmark);
    }

    if (item.icon) {
      const iconSpan = document.createElement('span');
      // Only allow plain text icons (emoji, unicode symbols, etc.)
      // HTML/SVG content is not supported for security reasons - use the Icons module instead
      iconSpan.textContent = item.icon;
      iconSpan.style.cssText = 'display: flex; align-items: center;';
      leftPart.appendChild(iconSpan);
    }

    if (item.color) {
      const colorDot = document.createElement('span');
      colorDot.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${item.color};
        flex-shrink: 0;
      `;
      leftPart.appendChild(colorDot);
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    leftPart.appendChild(labelSpan);

    button.appendChild(leftPart);

    // Shortcut hint
    if (item.shortcut) {
      const shortcutSpan = document.createElement('span');
      shortcutSpan.textContent = item.shortcut;
      shortcutSpan.style.cssText = `color: ${COLORS.textDisabled}; font-size: 10px;`;
      button.appendChild(shortcutSpan);
    }

    if (!item.disabled) {
      button.addEventListener('mouseenter', () => {
        this.setHighlightedIndex(index);
      });
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        // In multiselect mode, clicking toggles selection without closing
        this.selectItem(item.value, !this.options.multiSelect);
      });
    }

    return button;
  }

  /**
   * Set the highlighted index and update visual state
   */
  private setHighlightedIndex(index: number): void {
    // Remove highlight from previous item
    if (this.highlightedIndex >= 0 && this.highlightedIndex < this.itemButtons.length) {
      const prevButton = this.itemButtons[this.highlightedIndex];
      const prevItem = this.items[this.highlightedIndex];
      if (prevButton && prevItem) {
        // If item is selected, apply selected styling; otherwise transparent
        if (this.selectedValues.has(prevItem.value)) {
          prevButton.style.background = COLORS.accentBgStrong;
          prevButton.style.color = COLORS.accent;
        } else {
          prevButton.style.background = 'transparent';
          prevButton.style.color = prevItem.disabled ? COLORS.textDisabled : COLORS.textDefault;
        }
        prevButton.setAttribute('aria-selected', 'false');
      }
    }

    this.highlightedIndex = index;

    // Add highlight to new item
    if (index >= 0 && index < this.itemButtons.length) {
      const button = this.itemButtons[index];
      if (button && !button.disabled) {
        button.style.background = COLORS.bgHover;
        button.setAttribute('aria-selected', 'true');
        // Update aria-activedescendant for screen readers
        this.dropdown.setAttribute('aria-activedescendant', button.id);
      }
    } else {
      this.dropdown.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * Get the currently highlighted index
   */
  getHighlightedIndex(): number {
    return this.highlightedIndex;
  }

  /**
   * Set the selected value (highlights matching item with "selected" styling)
   * In multiselect mode, this adds to the selection
   */
  setSelectedValue(value: string): void {
    if (this.options.multiSelect) {
      this.selectedValues.add(value);
    } else {
      // Reset visual styling of previously selected items before clearing
      this.resetPreviousSelectionStyling();
      this.selectedValues.clear();
      this.selectedValues.add(value);
    }
    const index = this.items.findIndex((item) => item.value === value);
    if (index >= 0) {
      this.setHighlightedIndex(index);
      const button = this.itemButtons[index];
      if (button) {
        button.style.background = COLORS.accentBgStrong;
        button.style.color = COLORS.accent;
      }
    }
    // Update checkmark if in multiselect mode
    if (this.options.multiSelect) {
      this.updateItemCheckmark(value);
    }
  }

  /**
   * Reset visual styling of all previously selected items
   * Used in single-select mode to clear old selection styling before setting new
   */
  private resetPreviousSelectionStyling(): void {
    for (const oldValue of this.selectedValues) {
      const oldIndex = this.items.findIndex((item) => item.value === oldValue);
      if (oldIndex >= 0 && oldIndex < this.itemButtons.length) {
        const oldButton = this.itemButtons[oldIndex];
        const oldItem = this.items[oldIndex];
        if (oldButton && oldItem) {
          oldButton.style.background = 'transparent';
          oldButton.style.color = oldItem.disabled ? COLORS.textDisabled : COLORS.textDefault;
        }
      }
    }
  }

  /**
   * Set multiple selected values (for multiselect mode)
   */
  setSelectedValues(values: string[]): void {
    this.selectedValues.clear();
    for (const value of values) {
      this.selectedValues.add(value);
    }
    // Repopulate to update checkmarks
    if (this.options.multiSelect && this.items.length > 0) {
      this.populateDropdown();
    }
  }

  /**
   * Get selected values (for multiselect mode)
   */
  getSelectedValues(): string[] {
    return [...this.selectedValues];
  }

  /**
   * Check if a value is selected
   */
  isValueSelected(value: string): boolean {
    return this.selectedValues.has(value);
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    // Reset visual styling before clearing (for single-select mode)
    if (!this.options.multiSelect) {
      this.resetPreviousSelectionStyling();
    }
    this.selectedValues.clear();
    if (this.options.multiSelect && this.items.length > 0) {
      this.populateDropdown();
    }
  }

  private selectItem(value: string, closeAfter: boolean = true): void {
    if (this.options.multiSelect) {
      // Toggle selection in multiselect mode
      if (this.selectedValues.has(value)) {
        this.selectedValues.delete(value);
      } else {
        this.selectedValues.add(value);
      }
      // Update the checkmark visual
      this.updateItemCheckmark(value);
      // Notify of selection change
      this.options.onSelectionChange?.([...this.selectedValues]);
      // Don't close in multiselect mode unless explicitly requested
      if (closeAfter) {
        this.close();
      }
    } else {
      // Single-select mode - reset previous selection styling before setting new
      this.resetPreviousSelectionStyling();
      this.selectedValues.clear();
      this.selectedValues.add(value);
      this.options.onSelect?.(value);
      if (closeAfter) {
        this.close();
      }
    }
  }

  private updateItemCheckmark(value: string): void {
    const index = this.items.findIndex((item) => item.value === value);
    if (index >= 0 && index < this.itemButtons.length) {
      const button = this.itemButtons[index];
      const checkmark = button?.querySelector('.dropdown-checkmark');
      if (checkmark) {
        checkmark.textContent = this.selectedValues.has(value) ? '\u2713' : '';
      }
    }
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (
      this.isOpen &&
      this.currentAnchor &&
      !this.currentAnchor.contains(e.target as Node) &&
      !this.dropdown.contains(e.target as Node)
    ) {
      this.close();
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.navigateNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.navigatePrevious();
        break;
      case 'Home':
        e.preventDefault();
        e.stopPropagation();
        this.navigateToFirst();
        break;
      case 'End':
        e.preventDefault();
        e.stopPropagation();
        this.navigateToLast();
        break;
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.items.length) {
          const item = this.items[this.highlightedIndex];
          if (item && !item.disabled) {
            // Enter always closes the dropdown after selection
            this.selectItem(item.value, true);
          }
        }
        break;
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.items.length) {
          const item = this.items[this.highlightedIndex];
          if (item && !item.disabled) {
            // Space: in multiselect mode, toggle without closing; in single-select, close
            this.selectItem(item.value, !this.options.multiSelect);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
      case 'Tab':
        // Close on tab but don't prevent default
        this.close();
        break;
    }
  }

  private navigateNext(): void {
    let nextIndex = this.highlightedIndex + 1;
    // Skip disabled items
    while (nextIndex < this.items.length && this.items[nextIndex]?.disabled) {
      nextIndex++;
    }
    if (nextIndex < this.items.length) {
      this.setHighlightedIndex(nextIndex);
      this.scrollItemIntoView(nextIndex);
    }
  }

  private navigatePrevious(): void {
    let prevIndex = this.highlightedIndex - 1;
    // Skip disabled items
    while (prevIndex >= 0 && this.items[prevIndex]?.disabled) {
      prevIndex--;
    }
    if (prevIndex >= 0) {
      this.setHighlightedIndex(prevIndex);
      this.scrollItemIntoView(prevIndex);
    }
  }

  private navigateToFirst(): void {
    for (let i = 0; i < this.items.length; i++) {
      if (!this.items[i]?.disabled) {
        this.setHighlightedIndex(i);
        this.scrollItemIntoView(i);
        break;
      }
    }
  }

  private navigateToLast(): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (!this.items[i]?.disabled) {
        this.setHighlightedIndex(i);
        this.scrollItemIntoView(i);
        break;
      }
    }
  }

  private scrollItemIntoView(index: number): void {
    const button = this.itemButtons[index];
    if (button && typeof button.scrollIntoView === 'function') {
      button.scrollIntoView({ block: 'nearest' });
    }
  }

  private positionDropdown(): void {
    if (!this.isOpen || !this.currentAnchor) return;

    const rect = this.currentAnchor.getBoundingClientRect();
    const dropdownRect = this.dropdown.getBoundingClientRect();

    // Position below anchor
    let top = rect.bottom + 4;
    let left = this.options.align === 'right' ? rect.right - dropdownRect.width : rect.left;

    // Ensure dropdown stays within viewport
    if (top + dropdownRect.height > window.innerHeight) {
      // Position above if not enough space below
      top = rect.top - dropdownRect.height - 4;
    }
    if (left + dropdownRect.width > window.innerWidth) {
      left = window.innerWidth - dropdownRect.width - 8;
    }
    if (left < 8) {
      left = 8;
    }

    this.dropdown.style.top = `${top}px`;
    this.dropdown.style.left = `${left}px`;
  }

  /**
   * Open the dropdown menu
   */
  open(anchor: HTMLElement): void {
    // Close other dropdowns if configured
    if (this.options.closeOthers) {
      for (const dropdown of openDropdowns) {
        if (dropdown !== this) {
          dropdown.close();
        }
      }
    }

    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }

    this.currentAnchor = anchor;
    this.isOpen = true;

    // Increment z-index for stacking
    globalZIndex++;
    this.dropdown.style.zIndex = String(globalZIndex);

    this.dropdown.style.display = 'flex';
    this.positionDropdown();

    // Reset highlight to first enabled item
    this.highlightedIndex = -1;
    for (let i = 0; i < this.items.length; i++) {
      if (!this.items[i]?.disabled) {
        this.setHighlightedIndex(i);
        break;
      }
    }

    // Focus the dropdown for keyboard events
    this.dropdown.focus();

    // Add event listeners
    document.addEventListener('click', this.boundHandleOutsideClick);
    document.addEventListener('keydown', this.boundHandleKeydown, true);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);

    openDropdowns.add(this);
  }

  /**
   * Close the dropdown menu
   */
  close(): void {
    if (!this.isOpen) return;

    // Save anchor reference before clearing
    const anchor = this.currentAnchor;

    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.currentAnchor = null;

    // Remove event listeners
    document.removeEventListener('click', this.boundHandleOutsideClick);
    document.removeEventListener('keydown', this.boundHandleKeydown, true);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);

    openDropdowns.delete(this);

    // Reset z-index counter when all dropdowns are closed
    if (openDropdowns.size === 0) {
      globalZIndex = BASE_Z_INDEX;
    }

    // Return focus to the anchor button
    if (anchor && typeof anchor.focus === 'function') {
      anchor.focus();
    }

    this.options.onClose?.();
  }

  /**
   * Toggle the dropdown menu
   */
  toggle(anchor: HTMLElement): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open(anchor);
    }
  }

  /**
   * Check if the dropdown is open
   */
  isVisible(): boolean {
    return this.isOpen;
  }

  /**
   * Get the dropdown element
   */
  getElement(): HTMLElement {
    return this.dropdown;
  }

  /**
   * Dispose the dropdown
   */
  dispose(): void {
    this.close();
    if (document.body.contains(this.dropdown)) {
      document.body.removeChild(this.dropdown);
    }
  }
}

/**
 * Close all open dropdown menus
 */
export function closeAllDropdowns(): void {
  for (const dropdown of openDropdowns) {
    dropdown.close();
  }
}

/**
 * Get count of open dropdowns
 */
export function getOpenDropdownCount(): number {
  return openDropdowns.size;
}
