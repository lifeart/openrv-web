/**
 * VirtualSliderHUD - DOM overlay for the virtual slider system.
 *
 * Creates, positions, updates, and disposes a transient HUD element
 * that shows the parameter name, slider bar, current value, and lock
 * indicator during virtual slider interactions.
 */

import type { VirtualSliderParam } from './VirtualSliderConfig';

// ---------------------------------------------------------------------------
// HUD element management
// ---------------------------------------------------------------------------

export class VirtualSliderHUD {
  private container: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private trackContainer: HTMLElement | null = null;
  private trackFill: HTMLElement | null = null;
  private valueEl: HTMLElement | null = null;
  private lockBadge: HTMLElement | null = null;
  private numericInputEl: HTMLElement | null = null;
  private fadeOutTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  /**
   * @param container - The parent element (viewer canvas container) to
   *   attach the HUD to.
   */
  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Show the HUD for the given parameter at the current value.
   */
  show(param: VirtualSliderParam, value: number): void {
    if (this.disposed) return;
    this.clearFadeOut();
    this.ensureRoot();
    this.updateContent(param, value, false, null);
    this.root!.style.opacity = '0';
    this.root!.style.display = 'flex';
    // Force reflow so the transition triggers
    void this.root!.offsetHeight;
    this.root!.style.opacity = '1';
  }

  /**
   * Update the HUD to reflect a new value.
   */
  update(param: VirtualSliderParam, value: number, locked: boolean, numericInput: string | null): void {
    if (this.disposed || !this.root) return;
    this.updateContent(param, value, locked, numericInput);
  }

  /**
   * Hide the HUD with a fade-out animation.
   */
  hide(): void {
    if (this.disposed || !this.root) return;
    this.root.style.opacity = '0';
    this.fadeOutTimer = setTimeout(() => {
      this.removeRoot();
      this.fadeOutTimer = null;
    }, 150);
  }

  /**
   * Immediately remove the HUD without animation.
   */
  hideImmediate(): void {
    if (this.disposed) return;
    this.clearFadeOut();
    this.removeRoot();
  }

  /**
   * Clean up all DOM elements and timers.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearFadeOut();
    this.removeRoot();
    this.container = null;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private clearFadeOut(): void {
    if (this.fadeOutTimer !== null) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }
  }

  private ensureRoot(): void {
    if (this.root) return;

    const root = document.createElement('div');
    root.className = 'virtual-slider-hud';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'assertive');
    root.dataset.testid = 'virtual-slider-hud';
    root.style.cssText = `
      position: absolute;
      bottom: 15%;
      left: 50%;
      transform: translateX(-50%);
      width: clamp(300px, 50%, 500px);
      z-index: 60;
      display: none;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      border-radius: 6px;
      font-family: system-ui, -apple-system, sans-serif;
      pointer-events: none;
      transition: opacity 100ms ease;
      box-sizing: border-box;
    `;

    // Parameter label
    const label = document.createElement('span');
    label.className = 'virtual-slider-label';
    label.dataset.testid = 'virtual-slider-label';
    label.style.cssText = `
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      white-space: nowrap;
      flex-shrink: 0;
    `;
    root.appendChild(label);
    this.labelEl = label;

    // Track container (slider bar)
    const trackContainer = document.createElement('div');
    trackContainer.className = 'virtual-slider-track';
    trackContainer.dataset.testid = 'virtual-slider-track';
    trackContainer.style.cssText = `
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      position: relative;
      overflow: hidden;
    `;

    const trackFill = document.createElement('div');
    trackFill.className = 'virtual-slider-fill';
    trackFill.dataset.testid = 'virtual-slider-fill';
    trackFill.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: var(--accent-primary, #4a9eff);
      border-radius: 3px;
      transition: width 32ms linear;
    `;
    trackContainer.appendChild(trackFill);
    root.appendChild(trackContainer);
    this.trackContainer = trackContainer;
    this.trackFill = trackFill;

    // Numeric input display (hidden by default)
    const numericInput = document.createElement('span');
    numericInput.className = 'virtual-slider-numeric';
    numericInput.dataset.testid = 'virtual-slider-numeric';
    numericInput.style.cssText = `
      flex: 1;
      font-size: 16px;
      font-family: monospace;
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      padding: 2px 8px;
      text-align: center;
      display: none;
    `;
    root.appendChild(numericInput);
    this.numericInputEl = numericInput;

    // Value readout
    const valueEl = document.createElement('span');
    valueEl.className = 'virtual-slider-value';
    valueEl.dataset.testid = 'virtual-slider-value';
    valueEl.style.cssText = `
      font-size: 13px;
      font-family: monospace;
      color: rgba(255, 255, 255, 0.9);
      white-space: nowrap;
      flex-shrink: 0;
      min-width: 60px;
      text-align: right;
    `;
    root.appendChild(valueEl);
    this.valueEl = valueEl;

    // Lock badge
    const lockBadge = document.createElement('span');
    lockBadge.className = 'virtual-slider-lock';
    lockBadge.dataset.testid = 'virtual-slider-lock';
    lockBadge.textContent = 'LOCK';
    lockBadge.style.cssText = `
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      background: var(--accent-primary, #4a9eff);
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      display: none;
      flex-shrink: 0;
    `;
    root.appendChild(lockBadge);
    this.lockBadge = lockBadge;

    this.container!.appendChild(root);
    this.root = root;
  }

  private removeRoot(): void {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    this.labelEl = null;
    this.trackContainer = null;
    this.trackFill = null;
    this.valueEl = null;
    this.lockBadge = null;
    this.numericInputEl = null;
  }

  private updateContent(
    param: VirtualSliderParam,
    value: number,
    locked: boolean,
    numericInput: string | null,
  ): void {
    if (!this.root || !this.labelEl || !this.valueEl || !this.lockBadge || !this.trackContainer || !this.trackFill || !this.numericInputEl) return;

    this.labelEl.textContent = param.label;

    // Compute fill percentage
    const range = param.max - param.min;
    const pct = range > 0 ? ((value - param.min) / range) * 100 : 0;
    const clampedPct = Math.max(0, Math.min(100, pct));
    this.trackFill.style.width = `${clampedPct}%`;

    // Numeric entry mode
    if (numericInput !== null) {
      this.trackContainer.style.display = 'none';
      this.numericInputEl.style.display = 'block';
      this.numericInputEl.textContent = numericInput.length > 0 ? `${numericInput}_` : '_';
      this.valueEl.textContent = '';
    } else {
      this.trackContainer.style.display = 'block';
      this.numericInputEl.style.display = 'none';
      this.valueEl.textContent = param.format(value);
    }

    // Lock badge
    this.lockBadge.style.display = locked ? 'inline-block' : 'none';

    // Aria label
    const ariaText = numericInput !== null
      ? `${param.label}: entering value ${numericInput}`
      : `${param.label}: ${param.format(value)}${locked ? ' (locked)' : ''}`;
    this.root.setAttribute('aria-label', ariaText);

    // Switch to polite updates after first show
    if (this.root.getAttribute('aria-live') === 'assertive') {
      this.root.setAttribute('aria-live', 'polite');
    }
  }
}
