/**
 * InfoStripOverlay - Semi-transparent info strip at the bottom of the viewer
 *
 * Features:
 * - Displays the current source filename (basename or full path)
 * - Toggle between basename and full-path display (via icon button or Shift+F7)
 * - Keyboard shortcut F7 to toggle visibility (matching desktop OpenRV)
 * - Works in fullscreen and presentation mode
 * - Non-intrusive: pointer-events pass through to the viewer canvas
 */

import { type Session } from '../../core/session/Session';
import { EventEmitter, type EventMap } from '../../utils/EventEmitter';

export interface InfoStripOverlayState {
  enabled: boolean;
  showFullPath: boolean; // false = basename only, true = full path/URL
  backgroundOpacity: number; // 0-1, default 0.5
}

export interface InfoStripOverlayEvents extends EventMap {
  stateChanged: InfoStripOverlayState;
}

export const DEFAULT_INFO_STRIP_OVERLAY_STATE: InfoStripOverlayState = {
  enabled: false,
  showFullPath: false,
  backgroundOpacity: 0.5,
};

/**
 * Extract the basename (last path segment) from a URL or path string.
 *
 * - Tries parsing with `new URL()` first to extract the pathname.
 * - Falls back to splitting on `/` for non-URL strings.
 */
export function extractBasename(urlOrPath: string): string {
  try {
    const parsed = new URL(urlOrPath);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      return decodeURIComponent(segments[segments.length - 1]!);
    }
  } catch {
    // Not a valid URL — fall back to path splitting
  }

  const segments = urlOrPath.split('/').filter(Boolean);
  if (segments.length > 0) {
    return segments[segments.length - 1]!;
  }

  return urlOrPath;
}

/**
 * TODO(#84): InfoStripOverlay has a `backgroundOpacity` property that can be
 * configured via `setState({ backgroundOpacity })`, but no UI control is
 * exposed for users to adjust it. A settings popover or slider should be added.
 */
export class InfoStripOverlay extends EventEmitter<InfoStripOverlayEvents> {
  private container: HTMLElement;
  private textElement: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private session: Session;
  private state: InfoStripOverlayState = { ...DEFAULT_INFO_STRIP_OVERLAY_STATE };
  private unsubscribers: (() => void)[] = [];
  private hasLoggedCustomizationHint = false;

  constructor(session: Session) {
    super();
    this.session = session;

    // Create overlay container
    this.container = document.createElement('div');
    this.container.className = 'info-strip-overlay';
    this.container.dataset.testid = 'info-strip-overlay';
    this.container.setAttribute('aria-label', 'Source info strip');
    this.container.setAttribute('role', 'status');
    this.container.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 48;
      opacity: 0;
      transition: opacity 150ms ease;
      pointer-events: none;
      padding: 6px 12px;
      background: rgba(0, 0, 0, ${this.state.backgroundOpacity});
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
      user-select: none;
    `;

    // Create inner text element for filename
    this.textElement = document.createElement('span');
    this.textElement.className = 'info-strip-overlay-text';
    this.textElement.dataset.testid = 'info-strip-overlay-text';
    this.textElement.style.cssText = `
      color: #fff;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace, system-ui;
      font-size: 12px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: ltr;
      flex: 1;
      min-width: 0;
    `;
    this.container.appendChild(this.textElement);

    // Create toggle icon button
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'info-strip-overlay-toggle';
    this.toggleButton.dataset.testid = 'info-strip-overlay-toggle';
    this.toggleButton.setAttribute('aria-label', 'Toggle full path display');
    this.toggleButton.setAttribute('title', 'Toggle full path / basename');
    this.toggleButton.style.cssText = `
      pointer-events: auto;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      padding: 2px 4px;
      margin-left: 8px;
      font-size: 14px;
      line-height: 1;
      border-radius: 3px;
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    this.toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;

    // Toggle button click handler
    this.toggleButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePathMode();
    });

    // Prevent context menu on the toggle button from bubbling
    this.toggleButton.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.container.appendChild(this.toggleButton);

    // Bind session events
    this.unsubscribers.push(this.session.on('sourceLoaded', () => this.update()));

    // Initial update
    this.update();
  }

  /**
   * Update the displayed text based on the current source and path mode.
   */
  update(): void {
    const source = this.session.currentSource;

    if (!source) {
      this.textElement.textContent = '(no source)';
      this.applyTruncationDirection();
      return;
    }

    if (this.state.showFullPath) {
      // Full-path mode: prefer url, fallback to name
      const displayText = source.url || source.name || '(no source)';
      this.textElement.textContent = displayText;
    } else {
      // Basename mode: prefer name, fallback to basename from URL
      if (source.name) {
        this.textElement.textContent = source.name;
      } else if (source.url) {
        this.textElement.textContent = extractBasename(source.url);
      } else {
        this.textElement.textContent = '(no source)';
      }
    }

    this.applyTruncationDirection();
  }

  /**
   * Apply the appropriate text direction for truncation based on mode.
   * - Basename mode: LTR (truncates from the right)
   * - Full-path mode: RTL with unicode-bidi to preserve text order
   */
  private applyTruncationDirection(): void {
    if (this.state.showFullPath) {
      this.textElement.style.direction = 'rtl';
      this.textElement.style.unicodeBidi = 'plaintext';
    } else {
      this.textElement.style.direction = 'ltr';
      this.textElement.style.unicodeBidi = 'normal';
    }
  }

  /**
   * Toggle overlay visibility.
   */
  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  /**
   * Enable overlay.
   */
  enable(): void {
    this.setState({ enabled: true });

    // TODO(#84): Log customization hint on first enable
    if (!this.hasLoggedCustomizationHint) {
      this.hasLoggedCustomizationHint = true;
      console.info(
        '[InfoStripOverlay] backgroundOpacity is configurable via setState({ backgroundOpacity }) ' +
          'but is not yet exposed in the UI. See issue #84.',
      );
    }
  }

  /**
   * Disable overlay.
   */
  disable(): void {
    this.setState({ enabled: false });
  }

  /**
   * Check if overlay is visible.
   */
  isVisible(): boolean {
    return this.state.enabled;
  }

  /**
   * Toggle between basename and full-path display.
   */
  togglePathMode(): void {
    this.setShowFullPath(!this.state.showFullPath);
  }

  /**
   * Set whether to show the full path or basename.
   */
  setShowFullPath(showFullPath: boolean): void {
    this.setState({ showFullPath });
  }

  /**
   * Set the complete state (partial update).
   */
  setState(state: Partial<InfoStripOverlayState>): void {
    this.state = { ...this.state, ...state };
    this.updateStyles();
    this.update();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current state.
   */
  getState(): InfoStripOverlayState {
    return { ...this.state };
  }

  /**
   * Get the container element for mounting.
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Get the current height of the strip element.
   */
  getHeight(): number {
    return this.container.offsetHeight;
  }

  /**
   * Update styles based on current state.
   */
  private updateStyles(): void {
    // Visibility via opacity transition
    this.container.style.opacity = this.state.enabled ? '1' : '0';

    // Background opacity
    this.container.style.background = `rgba(0, 0, 0, ${this.state.backgroundOpacity})`;
  }

  /**
   * Dispose and clean up resources.
   */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.removeAllListeners();
  }
}
