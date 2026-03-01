/**
 * ScaleRatioIndicator - Transient overlay showing current pixel ratio
 *
 * Appears briefly (1.5 seconds) in the bottom-right of the viewer
 * when zoom changes, showing labels like "1:1", "2:1", "50%", "Fit".
 */

import { formatRatio, findPresetForRatio } from './ScalePresets';

const DISPLAY_DURATION_MS = 1500;
const FADE_DURATION_MS = 300;

export class ScaleRatioIndicator {
  private parentContainer: HTMLElement;
  private container: HTMLElement;
  private labelEl: HTMLElement;
  private fadeTimeout: ReturnType<typeof setTimeout> | null = null;
  private removeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(parentContainer: HTMLElement) {
    this.parentContainer = parentContainer;

    this.container = document.createElement('div');
    this.container.dataset.testid = 'scale-ratio-indicator';
    this.container.style.cssText = `
      position: absolute;
      bottom: 16px;
      right: 16px;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 600;
      pointer-events: none;
      z-index: 100;
      opacity: 0;
      transition: opacity ${FADE_DURATION_MS}ms ease;
      display: none;
    `;

    this.labelEl = document.createElement('span');
    this.container.appendChild(this.labelEl);
    this.parentContainer.appendChild(this.container);
  }

  /**
   * Show the indicator with the given pixel ratio.
   * @param ratio - The current pixel ratio (e.g. 1.0 for 1:1, 2.0 for 2:1)
   * @param isFit - Whether the current zoom is "Fit" mode (zoom = 1.0)
   */
  show(ratio: number, isFit: boolean): void {
    // Clear any pending fade/remove timers
    this.clearTimers();

    // Determine the display text
    let text: string;
    if (isFit) {
      text = 'Fit';
    } else {
      const preset = findPresetForRatio(ratio);
      if (preset) {
        text = `${preset.label} (${preset.percentage})`;
      } else {
        text = formatRatio(ratio);
      }
    }

    this.labelEl.textContent = text;
    this.container.style.display = '';

    // Force reflow to ensure transition triggers
    void this.container.offsetHeight;

    this.container.style.opacity = '1';

    // Schedule fade out after display duration
    this.fadeTimeout = setTimeout(() => {
      this.container.style.opacity = '0';
      // Remove from display after fade transition
      this.removeTimeout = setTimeout(() => {
        this.container.style.display = 'none';
      }, FADE_DURATION_MS);
    }, DISPLAY_DURATION_MS);
  }

  private clearTimers(): void {
    if (this.fadeTimeout !== null) {
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = null;
    }
    if (this.removeTimeout !== null) {
      clearTimeout(this.removeTimeout);
      this.removeTimeout = null;
    }
  }

  dispose(): void {
    this.clearTimers();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
