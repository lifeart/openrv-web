/**
 * AriaAnnouncer - Shared screen reader announcement utility.
 *
 * Creates an aria-live region and exposes an announce() method.
 * Extracted from PresentationMode.announceToScreenReader() pattern.
 */

const VISUALLY_HIDDEN_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';

export class AriaAnnouncer {
  private liveRegion: HTMLElement;
  private pendingRAF: number | null = null;

  constructor() {
    // Reuse existing element if present (e.g. from PresentationMode)
    const existing = document.getElementById('openrv-sr-announcer');
    if (existing) {
      this.liveRegion = existing;
    } else {
      this.liveRegion = document.createElement('div');
      this.liveRegion.id = 'openrv-sr-announcer';
      this.liveRegion.setAttribute('role', 'status');
      this.liveRegion.setAttribute('aria-live', 'polite');
      this.liveRegion.setAttribute('aria-atomic', 'true');
      this.liveRegion.style.cssText = VISUALLY_HIDDEN_STYLE;
      document.body.appendChild(this.liveRegion);
    }
  }

  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    this.liveRegion.setAttribute('aria-live', priority);

    // Clear then set via rAF so screen readers detect the change
    // even if the same message is announced twice in a row.
    if (this.pendingRAF !== null) {
      cancelAnimationFrame(this.pendingRAF);
    }
    this.liveRegion.textContent = '';
    this.pendingRAF = requestAnimationFrame(() => {
      this.liveRegion.textContent = message;
      this.pendingRAF = null;
    });
  }

  getElement(): HTMLElement {
    return this.liveRegion;
  }

  dispose(): void {
    if (this.pendingRAF !== null) {
      cancelAnimationFrame(this.pendingRAF);
      this.pendingRAF = null;
    }
    this.liveRegion.remove();
  }
}
