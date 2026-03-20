/**
 * DisplayProfileIndicator - HUD overlay showing the active display profile name
 *
 * Features:
 * - Shows the current display transfer function name (e.g., "sRGB", "Linear")
 * - Positioned in the viewer's bottom-left corner (non-overlapping with other overlays)
 * - Semi-transparent background, non-intrusive
 * - Temporarily highlights (flash) when the profile cycles via Shift+Alt+D
 * - Accessible via aria-label and role="status"
 * - Fades out after a brief period when cycling, stays visible while enabled
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import {
  type DisplayTransferFunction,
  type DisplayColorState,
  PROFILE_LABELS,
} from '../../color/ColorProcessingFacade';

export interface DisplayProfileIndicatorState {
  enabled: boolean;
  backgroundOpacity: number;
}

export interface DisplayProfileIndicatorEvents extends EventMap {
  stateChanged: DisplayProfileIndicatorState;
}

export const DEFAULT_DISPLAY_PROFILE_INDICATOR_STATE: DisplayProfileIndicatorState = {
  enabled: true,
  backgroundOpacity: 0.5,
};

/** Duration in ms for the flash highlight when cycling profiles */
const FLASH_DURATION_MS = 1500;
/** Transition speed for opacity changes */
const OPACITY_TRANSITION_MS = 200;

export class DisplayProfileIndicator extends EventEmitter<DisplayProfileIndicatorEvents> {
  private container: HTMLElement;
  private textElement: HTMLElement;
  private state: DisplayProfileIndicatorState = { ...DEFAULT_DISPLAY_PROFILE_INDICATOR_STATE };
  private currentProfile: DisplayTransferFunction = 'srgb';
  private flashTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();

    // Create overlay container
    this.container = document.createElement('div');
    this.container.className = 'display-profile-indicator';
    this.container.dataset.testid = 'display-profile-indicator';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-label', 'Active display profile');
    this.container.setAttribute('aria-live', 'polite');
    this.container.style.cssText = `
      position: absolute;
      bottom: 36px;
      left: 16px;
      z-index: 49;
      pointer-events: none;
      user-select: none;
      opacity: 0;
      transition: opacity ${OPACITY_TRANSITION_MS}ms ease;
    `;

    // Inner wrapper with background
    const wrapper = document.createElement('div');
    wrapper.className = 'display-profile-indicator-wrapper';
    wrapper.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 4px;
      background: rgba(0, 0, 0, ${this.state.backgroundOpacity});
    `;

    // Label prefix
    const labelElement = document.createElement('span');
    labelElement.className = 'display-profile-indicator-label';
    labelElement.dataset.testid = 'display-profile-indicator-label';
    labelElement.textContent = 'Display:';
    labelElement.style.cssText = `
      color: rgba(255, 255, 255, 0.6);
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace, system-ui;
      font-size: 11px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    `;

    // Profile name text
    this.textElement = document.createElement('span');
    this.textElement.className = 'display-profile-indicator-name';
    this.textElement.dataset.testid = 'display-profile-indicator-name';
    this.textElement.style.cssText = `
      color: #fff;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace, system-ui;
      font-size: 11px;
      font-weight: 600;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    `;
    this.textElement.textContent = PROFILE_LABELS[this.currentProfile];

    wrapper.appendChild(labelElement);
    wrapper.appendChild(this.textElement);
    this.container.appendChild(wrapper);
  }

  /**
   * Update the indicator to reflect a new display color state.
   * If `flash` is true, the indicator temporarily shows more prominently.
   */
  setDisplayState(displayState: DisplayColorState, flash = false): void {
    const profile = displayState.transferFunction;
    const changed = profile !== this.currentProfile;
    this.currentProfile = profile;

    // Update text
    this.textElement.textContent = PROFILE_LABELS[profile];

    // Update aria-label to include the profile name
    this.container.setAttribute('aria-label', `Active display profile: ${PROFILE_LABELS[profile]}`);

    if (flash && changed) {
      this.flashIndicator();
    }
  }

  /**
   * Temporarily show the indicator more prominently (e.g., when cycling profiles).
   * Makes the indicator fully opaque briefly, then returns to normal.
   */
  private flashIndicator(): void {
    // Clear any existing flash timeout
    if (this.flashTimeoutId !== null) {
      clearTimeout(this.flashTimeoutId);
      this.flashTimeoutId = null;
    }

    // Make fully opaque immediately
    this.container.style.opacity = '1';

    // After FLASH_DURATION_MS, return to normal opacity
    this.flashTimeoutId = setTimeout(() => {
      this.flashTimeoutId = null;
      this.updateStyles();
    }, FLASH_DURATION_MS);
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
   * Set the complete state (partial update).
   */
  setState(state: Partial<DisplayProfileIndicatorState>): void {
    this.state = { ...this.state, ...state };
    this.updateStyles();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current state.
   */
  getState(): DisplayProfileIndicatorState {
    return { ...this.state };
  }

  /**
   * Get the current profile name being displayed.
   */
  getProfileName(): string {
    return PROFILE_LABELS[this.currentProfile];
  }

  /**
   * Get the container element for mounting.
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Update styles based on current state.
   */
  private updateStyles(): void {
    // Visibility via opacity (unless a flash is active)
    if (this.flashTimeoutId === null) {
      this.container.style.opacity = this.state.enabled ? '0.8' : '0';
    }

    // Update background opacity on the wrapper
    const wrapper = this.container.firstElementChild as HTMLElement;
    if (wrapper) {
      wrapper.style.background = `rgba(0, 0, 0, ${this.state.backgroundOpacity})`;
    }
  }

  /**
   * Dispose and clean up resources.
   */
  dispose(): void {
    if (this.flashTimeoutId !== null) {
      clearTimeout(this.flashTimeoutId);
      this.flashTimeoutId = null;
    }
    this.removeAllListeners();
  }
}
