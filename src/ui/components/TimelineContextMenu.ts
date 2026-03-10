/**
 * Timeline Context Menu
 *
 * A standalone context menu component for the main Timeline canvas.
 * Displays frame info, source info, and provides actions like
 * Copy Timecode, Go to Frame, Set In/Out, Add/Remove Mark.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { applyHoverEffect } from './shared/Button';

/**
 * Options for showing the timeline context menu.
 */
export interface TimelineContextMenuOptions {
  /** Client coordinates for menu placement */
  x: number;
  y: number;
  /** The frame number at the right-click position */
  frame: number;
  /** Formatted frame display string (respects current display mode) */
  frameLabel: string;
  /** Timecode string (always SMPTE, for secondary display and clipboard copy) */
  timecode: string;
  /** Source info */
  sourceName: string | null;
  sourceResolution: string | null;
  sourceType: string | null;
  /** Current state for conditional items */
  markerAtFrame: { frame: number } | null;
  hasCustomInOut: boolean;
  inPoint: number;
  outPoint: number;
  /** Callbacks for menu actions */
  onGoToFrame: (frame: number) => void;
  onSetInPoint: (frame: number) => void;
  onSetOutPoint: (frame: number) => void;
  onResetInOutPoints: () => void;
  onToggleMark: (frame: number) => void;
  onRemoveMark: (markerStartFrame: number) => void;
  onCopyTimecode: (timecode: string) => void;
}

/** Margin from viewport edges for clamping */
const VIEWPORT_MARGIN = 8;

export class TimelineContextMenu {
  private menuEl: HTMLDivElement | null = null;
  private dismissHandlers: (() => void)[] = [];
  private _isVisible = false;

  /**
   * Show the context menu at the specified position with the given options.
   * Rebuilds the menu DOM on each call.
   */
  show(options: TimelineContextMenuOptions): void {
    // Remove any previous instance
    this.hide();

    // Also remove any TimelineEditor context menu to prevent duplicates
    const editorMenu = document.querySelector('.timeline-context-menu');
    if (editorMenu) {
      editorMenu.remove();
    }

    const menu = document.createElement('div');
    menu.className = 'timeline-main-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Timeline context menu');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 240px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    // Build info header: frame + timecode
    const infoRow1 = this.createInfoRow(`${options.frameLabel}  |  ${options.timecode}`);
    menu.appendChild(infoRow1);

    // Build info header: source info
    if (options.sourceName) {
      const typeLabel = options.sourceType === 'video' ? '[VID]' : '[IMG]';
      const resInfo = options.sourceResolution ? `  (${options.sourceResolution})` : '';
      const infoRow2 = this.createInfoRow(`${typeLabel} ${options.sourceName}${resInfo}`);
      menu.appendChild(infoRow2);
    }

    // Separator after info
    menu.appendChild(this.createSeparator());

    // Copy Timecode (click-only; Ctrl+C is bound to frame copy, not timecode copy)
    const copyItem = this.createMenuItem('Copy Timecode', null, () => {
      options.onCopyTimecode(options.timecode);
      this.hide();
    });
    menu.appendChild(copyItem);

    // Separator
    menu.appendChild(this.createSeparator());

    // Go to Frame
    const goToItem = this.createMenuItem(`Go to ${options.frameLabel}`, null, () => {
      options.onGoToFrame(options.frame);
      this.hide();
    });
    menu.appendChild(goToItem);

    // Separator
    menu.appendChild(this.createSeparator());

    // Set In Point Here
    const setInItem = this.createMenuItem('Set In Point Here', 'I', () => {
      options.onSetInPoint(options.frame);
      this.hide();
    });
    menu.appendChild(setInItem);

    // Set Out Point Here
    const setOutItem = this.createMenuItem('Set Out Point Here', 'O', () => {
      options.onSetOutPoint(options.frame);
      this.hide();
    });
    menu.appendChild(setOutItem);

    // Clear In/Out Range (conditional)
    if (options.hasCustomInOut) {
      const clearItem = this.createMenuItem('Clear In/Out Range', 'R', () => {
        options.onResetInOutPoints();
        this.hide();
      });
      menu.appendChild(clearItem);
    }

    // Separator
    menu.appendChild(this.createSeparator());

    // Add/Remove Mark
    if (options.markerAtFrame) {
      const markerStartFrame = options.markerAtFrame.frame;
      const removeItem = this.createMenuItem(`Remove Mark at Frame ${markerStartFrame}`, 'M', () => {
        options.onRemoveMark(markerStartFrame);
        this.hide();
      });
      menu.appendChild(removeItem);
    } else {
      const addItem = this.createMenuItem(`Add Mark at ${options.frameLabel}`, 'M', () => {
        options.onToggleMark(options.frame);
        this.hide();
      });
      menu.appendChild(addItem);
    }

    this.menuEl = menu;
    document.body.appendChild(menu);

    // Setup keyboard navigation
    this.setupKeyboardNavigation(menu);

    // Position: render hidden, measure, clamp, then show
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = options.x;
    let top = options.y;

    // Clamp right edge
    if (left + rect.width > vw - VIEWPORT_MARGIN) {
      left = options.x - rect.width;
    }
    // Clamp left edge
    if (left < VIEWPORT_MARGIN) {
      left = VIEWPORT_MARGIN;
    }
    // Clamp bottom edge
    if (top + rect.height > vh - VIEWPORT_MARGIN) {
      top = options.y - rect.height;
    }
    // Clamp top edge
    if (top < VIEWPORT_MARGIN) {
      top = VIEWPORT_MARGIN;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';

    this._isVisible = true;

    // Focus the first action item
    const firstItem = menu.querySelector<HTMLElement>('[role="menuitem"]');
    if (firstItem) {
      firstItem.focus();
    }

    // Set up dismiss handlers
    this.setupDismissHandlers(menu);
  }

  /**
   * Hide and remove the context menu.
   */
  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this._isVisible = false;
    this.cleanupDismissHandlers();
  }

  /**
   * Whether the context menu is currently visible.
   */
  isVisible(): boolean {
    return this._isVisible;
  }

  /**
   * Dispose the context menu and clean up all resources.
   */
  dispose(): void {
    this.hide();
  }

  private createInfoRow(text: string): HTMLDivElement {
    const row = document.createElement('div');
    row.setAttribute('role', 'none');
    row.textContent = text;
    row.style.cssText = `
      padding: 6px 12px;
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    return row;
  }

  private createMenuItem(label: string, shortcut: string | null, onClick: () => void): HTMLDivElement {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    item.style.cssText = `
      padding: 8px 12px;
      font-size: 12px;
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      outline: none;
      white-space: nowrap;
    `;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    item.appendChild(labelSpan);

    if (shortcut) {
      const shortcutSpan = document.createElement('span');
      shortcutSpan.textContent = shortcut;
      shortcutSpan.style.cssText = `
        font-size: 11px;
        color: var(--text-muted);
        margin-left: 24px;
      `;
      item.appendChild(shortcutSpan);
    }

    // Hover effects
    applyHoverEffect(item);
    item.addEventListener('focus', () => {
      item.style.background = 'var(--bg-hover)';
    });
    item.addEventListener('blur', () => {
      item.style.background = 'transparent';
    });

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });

    return item;
  }

  private createSeparator(): HTMLDivElement {
    const sep = document.createElement('div');
    sep.style.cssText = `
      height: 1px;
      background: var(--border-primary);
      margin: 4px 0;
    `;
    return sep;
  }

  private setupKeyboardNavigation(menu: HTMLDivElement): void {
    menu.addEventListener('keydown', (e: KeyboardEvent) => {
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[nextIndex]?.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prevIndex]?.focus();
          break;
        }
        case 'Home': {
          e.preventDefault();
          items[0]?.focus();
          break;
        }
        case 'End': {
          e.preventDefault();
          items[items.length - 1]?.focus();
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (currentIndex >= 0) {
            (items[currentIndex] as HTMLElement).click();
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          this.hide();
          break;
        }
      }
    });
  }

  private setupDismissHandlers(menu: HTMLDivElement): void {
    // Click outside
    const onClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.hide();
      }
    };
    // Defer to avoid the triggering right-click from immediately closing the menu
    setTimeout(() => {
      if (this._isVisible) {
        document.addEventListener('click', onClickOutside);
        document.addEventListener('contextmenu', onClickOutside);
      }
    }, 0);
    this.dismissHandlers.push(() => {
      document.removeEventListener('click', onClickOutside);
      document.removeEventListener('contextmenu', onClickOutside);
    });

    // Escape key (handled in keyboard navigation above, but also on document)
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    };
    document.addEventListener('keydown', onEscape);
    this.dismissHandlers.push(() => {
      document.removeEventListener('keydown', onEscape);
    });

    // Window blur
    const onBlur = () => {
      this.hide();
    };
    window.addEventListener('blur', onBlur);
    this.dismissHandlers.push(() => {
      window.removeEventListener('blur', onBlur);
    });

    // Scroll on timeline (the canvas itself or window)
    const onScroll = () => {
      this.hide();
    };
    window.addEventListener('scroll', onScroll, true);
    this.dismissHandlers.push(() => {
      window.removeEventListener('scroll', onScroll, true);
    });
  }

  private cleanupDismissHandlers(): void {
    for (const cleanup of this.dismissHandlers) {
      cleanup();
    }
    this.dismissHandlers = [];
  }
}
