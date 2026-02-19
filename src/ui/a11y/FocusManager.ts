/**
 * FocusManager - Zone-based keyboard navigation, roving tabindex, and focus trapping.
 *
 * Manages F6 zone cycling, arrow-key roving within toolbar zones,
 * and modal focus trapping.
 */

export interface FocusZone {
  name: string;
  container: HTMLElement;
  getItems: () => HTMLElement[];
  orientation: 'horizontal' | 'vertical';
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [tabindex="0"], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]';

export class FocusManager {
  private zones: FocusZone[] = [];
  private activeZoneIndex = -1;
  private rovingIndices: Map<string, number> = new Map();
  private trapContainer: HTMLElement | null = null;
  private preTrapFocus: Element | null = null;
  private boundKeyHandler: (e: KeyboardEvent) => void;

  constructor() {
    this.boundKeyHandler = (e: KeyboardEvent) => this.handleKeydown(e);
    document.addEventListener('keydown', this.boundKeyHandler, true);
  }

  addZone(zone: FocusZone): void {
    this.zones.push(zone);
  }

  removeZone(name: string): void {
    const idx = this.zones.findIndex((z) => z.name === name);
    if (idx !== -1) {
      this.rovingIndices.delete(name);
      this.zones.splice(idx, 1);
      if (this.activeZoneIndex >= this.zones.length) {
        this.activeZoneIndex = this.zones.length - 1;
      }
    }
  }

  initRovingTabindex(zoneName: string): void {
    const zone = this.zones.find((z) => z.name === zoneName);
    if (!zone) return;

    const items = zone.getItems();
    if (items.length === 0) return;

    const savedIdx = this.rovingIndices.get(zoneName) ?? 0;
    const activeIdx = Math.min(savedIdx, items.length - 1);

    for (let i = 0; i < items.length; i++) {
      items[i]!.setAttribute('tabindex', i === activeIdx ? '0' : '-1');
    }

    this.rovingIndices.set(zoneName, activeIdx);
  }

  focusZone(index: number): void {
    if (this.zones.length === 0) return;

    // Find next visible zone, skipping hidden ones
    const len = this.zones.length;
    for (let attempt = 0; attempt < len; attempt++) {
      const wrapped = ((index % len) + len) % len;
      const zone = this.zones[wrapped]!;

      // Skip hidden zones (e.g. timeline in image mode)
      // Check display:none, visibility:hidden, and detached elements
      if (
        zone.container.style.display === 'none' ||
        zone.container.style.visibility === 'hidden' ||
        !zone.container.isConnected
      ) {
        index = index >= 0 ? wrapped + 1 : wrapped - 1;
        continue;
      }

      this.activeZoneIndex = wrapped;
      const items = zone.getItems();
      if (items.length === 0) {
        // Fallback: focus the container itself
        zone.container.focus();
        return;
      }

      const rovingIdx = this.rovingIndices.get(zone.name) ?? 0;
      const target = items[Math.min(rovingIdx, items.length - 1)];
      target?.focus();
      return;
    }
  }

  focusNextZone(): void {
    this.focusZone(this.activeZoneIndex + 1);
  }

  focusPreviousZone(): void {
    this.focusZone(this.activeZoneIndex - 1);
  }

  trapFocus(container: HTMLElement): void {
    this.preTrapFocus = document.activeElement;
    this.trapContainer = container;

    // Focus the first focusable element inside the trap
    const focusable = this.getTrapFocusable();
    if (focusable.length > 0) {
      focusable[0]!.focus();
    }
  }

  releaseFocus(): void {
    this.trapContainer = null;
    if (this.preTrapFocus instanceof HTMLElement) {
      this.preTrapFocus.focus();
    }
    this.preTrapFocus = null;
  }

  createSkipLink(targetId: string): HTMLElement {
    const link = document.createElement('a');
    link.href = `#${targetId}`;
    link.className = 'skip-link';
    link.textContent = 'Skip to main content';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
      }
    });
    return link;
  }

  dispose(): void {
    document.removeEventListener('keydown', this.boundKeyHandler, true);
    this.zones = [];
    this.rovingIndices.clear();
    this.trapContainer = null;
    this.preTrapFocus = null;
  }

  private handleKeydown(e: KeyboardEvent): void {
    // Guard: ensure target is an HTMLElement
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // Skip if user is typing in a text input
    if (this.isTextInput(target)) return;

    // Focus trap takes priority
    if (this.trapContainer) {
      this.handleTrapKeydown(e);
      return;
    }

    // Roving tabindex within zones
    this.handleRovingKeydown(e);
  }

  private handleTrapKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;

    const focusable = this.getTrapFocusable();
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  private handleRovingKeydown(e: KeyboardEvent): void {
    // Find which zone the active element belongs to
    const activeEl = document.activeElement as HTMLElement;
    if (!activeEl) return;

    const zone = this.zones.find((z) => z.container.contains(activeEl));
    if (!zone) return;

    const items = zone.getItems();
    if (items.length === 0) return;

    const currentIdx = items.indexOf(activeEl);
    if (currentIdx === -1) return;

    const isHorizontal = zone.orientation === 'horizontal';
    const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';

    let newIdx = -1;

    if (e.key === nextKey) {
      newIdx = (currentIdx + 1) % items.length;
    } else if (e.key === prevKey) {
      newIdx = (currentIdx - 1 + items.length) % items.length;
    } else if (e.key === 'Home') {
      newIdx = 0;
    } else if (e.key === 'End') {
      newIdx = items.length - 1;
    }

    if (newIdx !== -1) {
      e.preventDefault();
      // Update tabindex: old becomes -1, new becomes 0
      items[currentIdx]!.setAttribute('tabindex', '-1');
      items[newIdx]!.setAttribute('tabindex', '0');
      items[newIdx]!.focus();
      this.rovingIndices.set(zone.name, newIdx);
    }
  }

  private getTrapFocusable(): HTMLElement[] {
    if (!this.trapContainer) return [];
    return Array.from(
      this.trapContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    );
  }

  private isTextInput(el: HTMLElement): boolean {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      return type === 'text' || type === 'search' || type === 'url' || type === 'email' || type === 'password' || type === 'number';
    }
    if (el.isContentEditable) return true;
    return false;
  }
}
