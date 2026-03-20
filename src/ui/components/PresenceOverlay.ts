/**
 * PresenceOverlay - Viewer overlay showing connected participant avatars
 *
 * Renders small colored circles with user initials in the top-right corner
 * of the viewer canvas area. Updates dynamically as users join/leave the
 * network sync room. Hidden when not connected.
 */

import type { SyncUser } from '../../network/types';
import { USER_COLORS } from '../../network/types';
import { EventEmitter, type EventMap } from '../../utils/EventEmitter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresenceOverlayState {
  /** Whether the overlay is visible (requires connected users to actually render) */
  visible: boolean;
  /** Current list of connected participants */
  users: SyncUser[];
}

export interface PresenceOverlayEvents extends EventMap {
  stateChanged: PresenceOverlayState;
}

/**
 * Validate that a color string is a safe CSS color value.
 * Only allows hex colors (#RGB, #RRGGBB, #RRGGBBAA) to prevent CSS injection.
 */
function sanitizeColor(color: string): string {
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
    return color;
  }
  return USER_COLORS[0]; // fallback to default color
}

/**
 * Extract initials from a user name.
 * Returns the first character uppercased.
 */
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  return trimmed.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// PresenceOverlay
// ---------------------------------------------------------------------------

export class PresenceOverlay extends EventEmitter<PresenceOverlayEvents> {
  private container: HTMLElement;
  private state: PresenceOverlayState = {
    visible: false,
    users: [],
  };

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'presence-overlay';
    this.container.dataset.testid = 'presence-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 60;
      display: none;
      flex-direction: row;
      gap: 6px;
      pointer-events: none;
      user-select: none;
    `;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Update the list of connected participants.
   * Re-renders avatar circles for each user.
   */
  setUsers(users: SyncUser[]): void {
    this.state.users = [...users];
    this.render();
    this.emit('stateChanged', this.getState());
  }

  /**
   * Show the overlay (e.g. when connected to a room).
   */
  show(): void {
    if (!this.state.visible) {
      this.state.visible = true;
      this.updateVisibility();
      this.emit('stateChanged', this.getState());
    }
  }

  /**
   * Hide the overlay (e.g. when disconnected).
   */
  hide(): void {
    if (this.state.visible) {
      this.state.visible = false;
      this.updateVisibility();
      this.emit('stateChanged', this.getState());
    }
  }

  /**
   * Get the current state.
   */
  getState(): PresenceOverlayState {
    return {
      visible: this.state.visible,
      users: [...this.state.users],
    };
  }

  /**
   * Get the DOM element for mounting into the viewer canvas container.
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Dispose the overlay and clean up resources.
   */
  dispose(): void {
    this.container.innerHTML = '';
    this.state.users = [];
    this.state.visible = false;
    this.removeAllListeners();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private updateVisibility(): void {
    const shouldShow = this.state.visible && this.state.users.length > 0;
    this.container.style.display = shouldShow ? 'flex' : 'none';
  }

  private render(): void {
    this.container.innerHTML = '';

    for (const user of this.state.users) {
      const avatar = document.createElement('div');
      avatar.dataset.testid = `presence-avatar-${user.id}`;
      const safeColor = sanitizeColor(user.color);
      avatar.dataset.color = safeColor;
      avatar.title = user.name;
      avatar.style.cssText = `
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: ${safeColor};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        color: white;
        text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        flex-shrink: 0;
        border: 2px solid rgba(255,255,255,0.3);
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      `;
      avatar.textContent = getInitials(user.name);
      this.container.appendChild(avatar);
    }

    this.updateVisibility();
  }
}
