/**
 * ToolbarOverflow - popover menus and responsive "More" overflow for toolbars.
 *
 * - `ToolbarPopover`: a trigger button plus a body-level floating panel that
 *   hosts arbitrary (live) toolbar controls. Used for grouping (e.g. the View
 *   tab "Overlays" menu) and as the container of the "More" (⋯) menu.
 * - `ToolbarOverflowController`: watches a horizontally-scrolling toolbar
 *   with a ResizeObserver and, only when its content does not fit, moves
 *   registered low-priority items into a `ToolbarPopover`. Items are moved
 *   (not cloned), so their listeners, state and data-testids are preserved.
 *   When space becomes available again they are restored in place.
 *
 * Items that are never registered (e.g. the play controls) never overflow.
 */

import { outsideClickRegistry, type OutsideClickDeregister } from '../../../utils/ui/OutsideClickRegistry';
import { createButton } from './Button';
import { getIconSvg, type IconName } from './Icons';
import { computeAnchoredPanelPosition } from './anchorPosition';
import { PANEL_WIDTHS, SHADOWS, Z_INDEX } from './theme';

let popoverIdCounter = 0;

export interface ToolbarPopoverOptions {
  /** data-testid of the trigger button. */
  triggerTestId: string;
  /** data-testid of the floating panel. */
  panelTestId: string;
  /** Trigger icon. */
  icon: IconName;
  /** Tooltip / accessible name of the trigger. */
  title: string;
  /** Optional visible text on the trigger (icon-only when omitted). */
  label?: string;
  /** Show a ▾ caret after the label. */
  showCaret?: boolean;
  /** Panel alignment relative to the trigger. */
  align?: 'left' | 'right';
  /** Accessible label of the panel. */
  panelLabel?: string;
}

export class ToolbarPopover {
  readonly trigger: HTMLButtonElement;
  readonly panel: HTMLElement;
  private readonly align: 'left' | 'right';
  private _isOpen = false;
  private deregisterDismiss: OutsideClickDeregister | null = null;
  private readonly boundReposition = () => this.reposition();
  private readonly boundKeydown = (e: KeyboardEvent) => this.handleKeydown(e);

  constructor(options: ToolbarPopoverOptions) {
    this.align = options.align ?? 'left';
    const iconSvg = getIconSvg(options.icon, 'sm');
    const text = options.label ? `${options.label}${options.showCaret ? ' ▾' : ''}` : '';
    this.trigger = createButton(text, () => this.toggle(), {
      variant: options.label ? 'ghost' : 'icon',
      size: 'md',
      title: options.title,
      icon: iconSvg,
    });
    if (!this.trigger.getAttribute('aria-label')) {
      this.trigger.setAttribute('aria-label', options.title);
    }
    this.trigger.dataset.testid = options.triggerTestId;
    this.trigger.setAttribute('aria-haspopup', 'true');
    this.trigger.setAttribute('aria-expanded', 'false');

    this.panel = document.createElement('div');
    this.panel.id = `toolbar-popover-${++popoverIdCounter}`;
    this.panel.className = 'toolbar-popover';
    this.panel.dataset.testid = options.panelTestId;
    this.panel.setAttribute('role', 'group');
    this.panel.setAttribute('aria-label', options.panelLabel ?? options.title);
    this.panel.style.cssText = `
      position: fixed;
      display: none;
      flex-direction: column;
      gap: 2px;
      padding: 4px;
      min-width: ${PANEL_WIDTHS.dropdownMenu};
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      z-index: ${Z_INDEX.dropdown};
    `;
    this.trigger.setAttribute('aria-controls', this.panel.id);
    this.panel.addEventListener('keydown', this.boundKeydown);
  }

  /**
   * Create a row hosting `element`, optionally followed by a text label that
   * forwards clicks / context menus to the element (useful for icon-only
   * buttons). The row is not attached; use `appendRow`. Pass `null` to
   * create an empty row whose element is inserted later (as first child).
   */
  createRow(element: HTMLElement | null, label?: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'toolbar-popover-row';
    row.style.cssText = 'display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 4px;';
    if (element) row.appendChild(element);
    if (label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'toolbar-popover-label';
      labelEl.textContent = label;
      labelEl.style.cssText =
        'flex: 1; color: var(--text-primary); font-size: 12px; cursor: pointer; user-select: none; white-space: nowrap;';
      labelEl.addEventListener('click', () => {
        const target = row.firstElementChild;
        if (target instanceof HTMLElement && target !== labelEl) target.click();
      });
      labelEl.addEventListener('contextmenu', (e) => {
        const target = row.firstElementChild;
        if (target instanceof HTMLElement && target !== labelEl) {
          e.preventDefault();
          target.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }),
          );
        }
      });
      row.appendChild(labelEl);
    }
    return row;
  }

  /** Create and append a row in one step. */
  addItem(element: HTMLElement, label?: string): HTMLElement {
    const row = this.createRow(element, label);
    this.appendRow(row);
    return row;
  }

  appendRow(row: HTMLElement): void {
    // Keep hosted controls attached to the document even while the menu is
    // closed, so document-level lookups (tests, keyboard wiring) still find them.
    this.ensureAttached();
    this.panel.appendChild(row);
  }

  private ensureAttached(): void {
    if (!this.panel.isConnected && document.body) {
      document.body.appendChild(this.panel);
    }
  }

  clearRows(): void {
    while (this.panel.firstChild) this.panel.removeChild(this.panel.firstChild);
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  toggle(): void {
    if (this._isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this._isOpen) return;
    this.ensureAttached();
    this._isOpen = true;
    this.panel.style.display = 'flex';
    this.reposition();
    this.trigger.setAttribute('aria-expanded', 'true');
    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [this.trigger, this.panel],
      onDismiss: () => this.close(),
      dismissOn: 'click',
      dismissOnEscape: true,
    });
    window.addEventListener('resize', this.boundReposition);
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.panel.style.display = 'none';
    this.trigger.setAttribute('aria-expanded', 'false');
    this.deregisterDismiss?.();
    this.deregisterDismiss = null;
    window.removeEventListener('resize', this.boundReposition);
  }

  /** Re-anchor the panel to the trigger (no-op while closed). */
  reposition(): void {
    if (!this._isOpen) return;
    const width = this.panel.offsetWidth || parseInt(PANEL_WIDTHS.dropdownMenu, 10);
    const { top, left } = computeAnchoredPanelPosition(this.trigger, width, this.align);
    this.panel.style.top = `${top}px`;
    this.panel.style.left = `${left}px`;
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const focusables = Array.from(
      this.panel.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"], input, select'),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusables.length === 0) return;
    e.preventDefault();
    const idx = focusables.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? focusables[(idx + 1) % focusables.length]
        : focusables[(idx - 1 + focusables.length) % focusables.length];
    next?.focus();
  }

  dispose(): void {
    this.close();
    this.panel.removeEventListener('keydown', this.boundKeydown);
    this.panel.remove();
  }
}

// ---------------------------------------------------------------------------
// Overflow controller
// ---------------------------------------------------------------------------

export interface OverflowItem {
  /** The live toolbar element that may be moved into the "More" menu. */
  element: HTMLElement;
  /** Optional label shown next to it inside the menu. */
  label?: string;
}

export interface ToolbarOverflowOptions {
  /** The horizontally scrolling element whose overflow is measured. */
  container: HTMLElement;
  /** Popover used as the "More" menu; its trigger is shown only when needed. */
  popover: ToolbarPopover;
  /** Overflow candidates, in the order they should be moved (first = least important). */
  items: OverflowItem[];
  /** Extra elements whose size changes should trigger a re-layout. */
  observe?: HTMLElement[];
  /** Return false to skip layout (e.g. the toolbar tab is hidden). */
  isActive?: () => boolean;
  /** Called after each layout pass with whether anything overflowed. */
  onLayout?: (overflowing: boolean) => void;
}

interface TrackedItem {
  element: HTMLElement;
  marker: Comment;
  row: HTMLElement;
  moved: boolean;
  /** Inline margin-left saved while the item sits in the menu (toolbar spacing). */
  savedMarginLeft: string;
}

/** Tolerance (px) for sub-pixel rounding when comparing scroll/client width. */
const OVERFLOW_TOLERANCE = 1;

export class ToolbarOverflowController {
  private readonly container: HTMLElement;
  private readonly popover: ToolbarPopover;
  private readonly items: TrackedItem[] = [];
  private readonly isActive: () => boolean;
  private readonly onLayout?: (overflowing: boolean) => void;
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private disposed = false;
  private readonly boundSchedule = () => this.scheduleUpdate();

  constructor(options: ToolbarOverflowOptions) {
    this.container = options.container;
    this.popover = options.popover;
    this.isActive = options.isActive ?? (() => true);
    this.onLayout = options.onLayout;
    this.popover.trigger.style.display = 'none';

    for (const { element, label } of options.items) {
      const parent = element.parentNode;
      if (!parent) continue;
      const marker = document.createComment('toolbar-overflow-anchor');
      parent.insertBefore(marker, element);
      const row = this.popover.createRow(null, label);
      this.items.push({ element, marker, row, moved: false, savedMarginLeft: '' });
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.boundSchedule);
      this.resizeObserver.observe(this.container);
      for (const el of options.observe ?? []) this.resizeObserver.observe(el);
    }
    window.addEventListener('resize', this.boundSchedule);
  }

  /** Elements currently moved into the overflow menu (DOM order). */
  getOverflowedElements(): HTMLElement[] {
    return this.items.filter((i) => i.moved).map((i) => i.element);
  }

  /** Coalesce layout passes into the next animation frame. */
  scheduleUpdate(): void {
    if (this.disposed || this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.update();
    });
  }

  /** Synchronously recompute which items overflow. */
  update(): void {
    if (this.disposed || !this.isActive()) return;

    this.restoreAll();
    this.popover.trigger.style.display = 'none';

    if (!this.isOverflowing()) {
      this.popover.close();
      this.onLayout?.(false);
      return;
    }

    // Reserve room for the trigger before deciding what to move.
    this.popover.trigger.style.display = '';
    const moved: TrackedItem[] = [];
    for (const item of this.items) {
      if (!this.isOverflowing()) break;
      // Hidden items take no room; moving them would only add empty rows.
      if (item.element.style.display === 'none') continue;
      item.row.insertBefore(item.element, item.row.firstChild);
      item.savedMarginLeft = item.element.style.marginLeft;
      item.element.style.marginLeft = '0';
      item.moved = true;
      moved.push(item);
    }

    if (moved.length === 0) {
      this.popover.trigger.style.display = 'none';
      this.popover.close();
      this.onLayout?.(false);
      return;
    }

    // Present the moved items in their original left-to-right order.
    moved.sort((a, b) => (a.marker.compareDocumentPosition(b.marker) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    for (const item of moved) this.popover.appendRow(item.row);
    this.popover.reposition();
    this.onLayout?.(true);
  }

  private isOverflowing(): boolean {
    return this.container.scrollWidth - this.container.clientWidth > OVERFLOW_TOLERANCE;
  }

  private restoreAll(): void {
    for (const item of this.items) {
      if (!item.moved) continue;
      const parent = item.marker.parentNode;
      if (parent) parent.insertBefore(item.element, item.marker.nextSibling);
      item.element.style.marginLeft = item.savedMarginLeft;
      item.moved = false;
    }
    this.popover.clearRows();
  }

  dispose(): void {
    if (this.disposed) return;
    this.restoreAll();
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.boundSchedule);
    for (const item of this.items) item.marker.remove();
  }
}
