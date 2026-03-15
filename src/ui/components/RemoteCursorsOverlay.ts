/**
 * RemoteCursorsOverlay - Renders colored cursor indicators for remote
 * collaboration participants on top of the viewer canvas.
 *
 * Each remote cursor is displayed as a small arrow with the participant's
 * name label, using their assigned color. Cursors fade out after a period
 * of inactivity and are hidden entirely when collaboration is disconnected.
 *
 * Cursor coordinates arrive in normalized 0-1 range and are mapped to the
 * current viewer display dimensions.
 */

import type { CursorSyncPayload, SyncUser } from '../../network/types';
import { USER_COLORS } from '../../network/types';

/** How long (ms) before an idle cursor starts fading out. */
const FADE_START_MS = 5_000;

/** How long (ms) the fade transition lasts after FADE_START_MS. */
const FADE_DURATION_MS = 2_000;

/**
 * Validate that a color string is a safe CSS color value.
 * Only allows hex colors (#RGB, #RRGGBB, #RRGGBBAA) to prevent CSS injection.
 */
function sanitizeColor(color: string): string {
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
    return color;
  }
  return USER_COLORS[0];
}

export interface RemoteCursorEntry {
  userId: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  name: string;
  color: string;
  lastUpdated: number; // timestamp ms
}

export class RemoteCursorsOverlay {
  private container: HTMLDivElement;
  private cursors = new Map<string, RemoteCursorEntry>();
  private cursorElements = new Map<string, HTMLDivElement>();
  private users = new Map<string, SyncUser>();
  private viewerWidth = 0;
  private viewerHeight = 0;
  private active = false;
  private fadeTimerId: ReturnType<typeof setInterval> | null = null;
  private _nowFn: () => number = Date.now;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'remote-cursors-overlay';
    this.container.dataset.testid = 'remote-cursors-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 110;
      overflow: hidden;
      display: none;
    `;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Returns the root DOM element for mounting in the viewer container. */
  getElement(): HTMLDivElement {
    return this.container;
  }

  /** Update the viewer display dimensions used for coordinate mapping. */
  setViewerDimensions(width: number, height: number): void {
    this.viewerWidth = width;
    this.viewerHeight = height;
    // Reposition all cursors
    for (const [userId, entry] of this.cursors) {
      this.positionCursorElement(userId, entry);
    }
  }

  /** Activate the overlay (when collaboration is connected). */
  setActive(active: boolean): void {
    this.active = active;
    this.container.style.display = active ? '' : 'none';
    if (active) {
      this.startFadeTimer();
    } else {
      this.stopFadeTimer();
      this.clearAll();
    }
  }

  /** Whether the overlay is currently active. */
  isActive(): boolean {
    return this.active;
  }

  /** Update the known set of users (for name/color lookup). */
  setUsers(users: SyncUser[]): void {
    this.users.clear();
    for (const user of users) {
      this.users.set(user.id, user);
    }
    // Update names/colors on any existing cursor elements
    for (const [userId, entry] of this.cursors) {
      const user = this.users.get(userId);
      if (user) {
        entry.name = user.name;
        entry.color = sanitizeColor(user.color);
        this.updateCursorStyle(userId, entry);
      }
    }
  }

  /** Handle an incoming cursor sync payload. */
  updateCursor(payload: CursorSyncPayload): void {
    if (!this.active) return;

    const user = this.users.get(payload.userId);
    const entry: RemoteCursorEntry = {
      userId: payload.userId,
      x: clamp01(payload.x),
      y: clamp01(payload.y),
      name: user?.name ?? payload.userId.slice(0, 8),
      color: sanitizeColor(user?.color ?? USER_COLORS[0]),
      lastUpdated: this._nowFn(),
    };

    this.cursors.set(payload.userId, entry);
    this.ensureCursorElement(payload.userId, entry);
    this.positionCursorElement(payload.userId, entry);
    this.updateCursorOpacity(payload.userId, entry);
  }

  /** Remove a specific user's cursor (e.g., on user leave). */
  removeCursor(userId: string): void {
    this.cursors.delete(userId);
    const el = this.cursorElements.get(userId);
    if (el) {
      el.remove();
      this.cursorElements.delete(userId);
    }
  }

  /** Remove all cursors. */
  clearAll(): void {
    for (const el of this.cursorElements.values()) {
      el.remove();
    }
    this.cursorElements.clear();
    this.cursors.clear();
  }

  /** Get the current cursor entries (for testing). */
  getCursors(): Map<string, RemoteCursorEntry> {
    return this.cursors;
  }

  /** Override the time source (for testing). */
  setNowFn(fn: () => number): void {
    this._nowFn = fn;
  }

  /** Manually trigger a fade check (for testing). */
  tickFade(): void {
    this.updateFadeStates();
  }

  dispose(): void {
    this.stopFadeTimer();
    this.clearAll();
    this.container.remove();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private ensureCursorElement(userId: string, entry: RemoteCursorEntry): void {
    if (this.cursorElements.has(userId)) return;

    const el = document.createElement('div');
    el.className = 'remote-cursor';
    el.dataset.testid = `remote-cursor-${userId}`;
    el.dataset.userId = userId;
    el.style.cssText = `
      position: absolute;
      pointer-events: none;
      transition: left 0.1s ease-out, top 0.1s ease-out, opacity 0.3s ease;
      will-change: left, top, opacity;
    `;

    // Cursor arrow (SVG)
    const arrow = document.createElement('div');
    arrow.className = 'remote-cursor-arrow';
    arrow.innerHTML = `<svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1L1 15L5.5 11L10 19L13 17.5L8.5 9.5L14 8L1 1Z" fill="${entry.color}" stroke="rgba(0,0,0,0.6)" stroke-width="1.2"/>
    </svg>`;

    // Name label
    const label = document.createElement('div');
    label.className = 'remote-cursor-label';
    label.textContent = entry.name;
    label.style.cssText = `
      position: absolute;
      left: 16px;
      top: 12px;
      background: ${entry.color};
      color: #fff;
      font-size: 11px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
      text-shadow: 0 0 2px rgba(0,0,0,0.5);
      line-height: 16px;
    `;

    el.appendChild(arrow);
    el.appendChild(label);
    this.container.appendChild(el);
    this.cursorElements.set(userId, el);
  }

  private positionCursorElement(userId: string, entry: RemoteCursorEntry): void {
    const el = this.cursorElements.get(userId);
    if (!el) return;

    const px = entry.x * this.viewerWidth;
    const py = entry.y * this.viewerHeight;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
  }

  private updateCursorStyle(userId: string, entry: RemoteCursorEntry): void {
    const el = this.cursorElements.get(userId);
    if (!el) return;

    const arrow = el.querySelector('.remote-cursor-arrow svg path') as SVGPathElement | null;
    if (arrow) {
      arrow.setAttribute('fill', entry.color);
    }

    const label = el.querySelector('.remote-cursor-label') as HTMLElement | null;
    if (label) {
      label.textContent = entry.name;
      label.style.background = entry.color;
    }
  }

  private updateCursorOpacity(userId: string, entry: RemoteCursorEntry): void {
    const el = this.cursorElements.get(userId);
    if (!el) return;

    const age = this._nowFn() - entry.lastUpdated;
    if (age < FADE_START_MS) {
      el.style.opacity = '1';
    } else if (age < FADE_START_MS + FADE_DURATION_MS) {
      const progress = (age - FADE_START_MS) / FADE_DURATION_MS;
      el.style.opacity = String(Math.max(0, 1 - progress));
    } else {
      el.style.opacity = '0';
    }
  }

  private updateFadeStates(): void {
    const removeList: string[] = [];
    for (const [userId, entry] of this.cursors) {
      const age = this._nowFn() - entry.lastUpdated;
      if (age >= FADE_START_MS + FADE_DURATION_MS) {
        removeList.push(userId);
      } else {
        this.updateCursorOpacity(userId, entry);
      }
    }
    for (const userId of removeList) {
      this.removeCursor(userId);
    }
  }

  private startFadeTimer(): void {
    if (this.fadeTimerId !== null) return;
    this.fadeTimerId = setInterval(() => {
      this.updateFadeStates();
    }, 1_000);
  }

  private stopFadeTimer(): void {
    if (this.fadeTimerId !== null) {
      clearInterval(this.fadeTimerId);
      this.fadeTimerId = null;
    }
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
