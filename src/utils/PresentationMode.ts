/**
 * PresentationMode - Manages presentation/clean display mode
 *
 * When enabled, hides all UI elements (header, tabs, toolbar, timeline)
 * and shows only the viewer canvas. Includes cursor auto-hide on inactivity.
 */

import { EventEmitter, EventMap } from './EventEmitter';

export interface PresentationState {
  enabled: boolean;
  cursorAutoHide: boolean;
  cursorHideDelay: number; // milliseconds
}

export interface PresentationEvents extends EventMap {
  stateChanged: PresentationState;
}

export const DEFAULT_PRESENTATION_STATE: PresentationState = {
  enabled: false,
  cursorAutoHide: true,
  cursorHideDelay: 3000,
};

export class PresentationMode extends EventEmitter<PresentationEvents> {
  private state: PresentationState = { ...DEFAULT_PRESENTATION_STATE };
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimers: ReturnType<typeof setTimeout>[] = [];
  private pendingRAF: number | null = null;
  private elementsToHide: HTMLElement[] = [];
  private boundHandleMouseMove: (e: MouseEvent) => void;

  constructor() {
    super();
    this.boundHandleMouseMove = this.handleMouseMove.bind(this);
  }

  /**
   * Get the current presentation mode state
   */
  getState(): PresentationState {
    return { ...this.state };
  }

  /**
   * Set the presentation mode state
   */
  setState(partial: Partial<PresentationState>): void {
    const wasEnabled = this.state.enabled;
    this.state = { ...this.state, ...partial };

    if (this.state.enabled && !wasEnabled) {
      this.enterPresentationMode();
    } else if (!this.state.enabled && wasEnabled) {
      this.exitPresentationMode();
    }

    // If cursor auto-hide settings changed while enabled
    if (this.state.enabled) {
      if (this.state.cursorAutoHide) {
        this.resetCursorTimer();
      } else {
        this.clearCursorTimer();
        this.showCursor();
      }
    }

    this.emit('stateChanged', this.getState());
  }

  /**
   * Toggle presentation mode on/off
   */
  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  /**
   * Set the UI elements that should be hidden in presentation mode
   */
  setElementsToHide(elements: HTMLElement[]): void {
    this.elementsToHide = elements;
  }

  /**
   * Handle mouse movement - shows cursor and resets auto-hide timer.
   * Public so it can be called from tests.
   */
  handleMouseMove(): void {
    if (!this.state.enabled) return;
    this.showCursor();
    if (this.state.cursorAutoHide) {
      this.resetCursorTimer();
    }
  }

  private enterPresentationMode(): void {
    // Clear any leftover transition timers from a previous cycle
    this.clearTransitionTimers();

    // Announce to screen readers
    this.announceToScreenReader('Presentation mode enabled. UI elements hidden.');

    // Hide UI elements with transition
    for (const element of this.elementsToHide) {
      element.style.transition = 'opacity 0.3s ease';
      element.style.opacity = '0';
      element.style.pointerEvents = 'none';
      element.setAttribute('aria-hidden', 'true');
      // After transition, fully collapse the element to reclaim space
      const timer = setTimeout(() => {
        if (this.state.enabled) {
          element.style.display = 'none';
        }
      }, 300);
      this.transitionTimers.push(timer);
    }

    // Start cursor auto-hide
    if (this.state.cursorAutoHide) {
      this.resetCursorTimer();
    }

    // Listen for mouse movement
    document.addEventListener('mousemove', this.boundHandleMouseMove);
  }

  private exitPresentationMode(): void {
    // Cancel any pending enter-transition timers (prevents stale display:none)
    this.clearTransitionTimers();

    // Announce to screen readers
    this.announceToScreenReader('Presentation mode disabled. UI elements restored.');

    // Show UI elements with transition
    for (const element of this.elementsToHide) {
      element.style.display = '';
      element.style.pointerEvents = '';
      element.removeAttribute('aria-hidden');
      // Force reflow before changing opacity for animation
      void element.offsetHeight;
      element.style.opacity = '1';
      // Clean up transition after it completes
      const timer = setTimeout(() => {
        element.style.transition = '';
      }, 300);
      this.transitionTimers.push(timer);
    }

    // Restore cursor
    this.clearCursorTimer();
    this.showCursor();

    // Remove mouse move listener
    document.removeEventListener('mousemove', this.boundHandleMouseMove);
  }

  private hideCursor(): void {
    document.body.style.cursor = 'none';
  }

  private showCursor(): void {
    document.body.style.cursor = '';
  }

  private resetCursorTimer(): void {
    this.clearCursorTimer();
    if (this.state.enabled && this.state.cursorAutoHide) {
      this.cursorTimer = setTimeout(() => {
        this.hideCursor();
      }, this.state.cursorHideDelay);
    }
  }

  private clearCursorTimer(): void {
    if (this.cursorTimer !== null) {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }
  }

  private clearTransitionTimers(): void {
    for (const timer of this.transitionTimers) {
      clearTimeout(timer);
    }
    this.transitionTimers = [];
  }

  private announceToScreenReader(message: string): void {
    let announcer = document.getElementById('openrv-sr-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'openrv-sr-announcer';
      announcer.setAttribute('role', 'status');
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.style.cssText =
        'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
      document.body.appendChild(announcer);
    }
    // Clear and re-set to trigger announcement even with same text
    announcer.textContent = '';
    if (this.pendingRAF !== null) {
      cancelAnimationFrame(this.pendingRAF);
    }
    this.pendingRAF = requestAnimationFrame(() => {
      this.pendingRAF = null;
      announcer!.textContent = message;
    });
  }

  /**
   * Load cursor auto-hide preference from localStorage
   */
  loadPreference(): void {
    try {
      const saved = localStorage.getItem('openrv-cursor-autohide');
      if (saved !== null) {
        this.state.cursorAutoHide = saved === 'true';
      }
    } catch {
      // localStorage not available
    }
  }

  /**
   * Save cursor auto-hide preference to localStorage
   */
  savePreference(): void {
    try {
      localStorage.setItem('openrv-cursor-autohide', String(this.state.cursorAutoHide));
    } catch {
      // localStorage not available
    }
  }

  dispose(): void {
    // If currently in presentation mode, restore hidden elements
    if (this.state.enabled) {
      for (const element of this.elementsToHide) {
        element.style.display = '';
        element.style.opacity = '';
        element.style.pointerEvents = '';
        element.style.transition = '';
        element.removeAttribute('aria-hidden');
      }
    }
    this.clearCursorTimer();
    this.clearTransitionTimers();
    if (this.pendingRAF !== null) {
      cancelAnimationFrame(this.pendingRAF);
      this.pendingRAF = null;
    }
    this.showCursor();
    document.removeEventListener('mousemove', this.boundHandleMouseMove);
    this.removeAllListeners();
  }
}
