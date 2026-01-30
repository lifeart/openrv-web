/**
 * MissingFrameOverlay - Visual indicator for missing frames in sequences
 *
 * Displays a prominent overlay when the current frame is missing from the sequence,
 * helping users identify gaps in their image sequences.
 */

export interface MissingFrameOverlayState {
  visible: boolean;
  frameNumber: number | null;
}

export class MissingFrameOverlay {
  private container: HTMLDivElement;
  private messageElement: HTMLDivElement;
  private frameNumberElement: HTMLSpanElement;
  private state: MissingFrameOverlayState = {
    visible: false,
    frameNumber: null,
  };

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'missing-frame-overlay';
    this.container.dataset.testid = 'missing-frame-overlay';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.75);
      z-index: 100;
      pointer-events: none;
    `;

    // Warning icon
    const warningIcon = document.createElement('div');
    warningIcon.className = 'warning-icon';
    warningIcon.textContent = '⚠️';
    warningIcon.style.cssText = `
      font-size: 48px;
      margin-bottom: 16px;
    `;

    // Main message
    this.messageElement = document.createElement('div');
    this.messageElement.className = 'message';
    this.messageElement.textContent = 'MISSING FRAME';
    this.messageElement.style.cssText = `
      font-size: 24px;
      font-weight: bold;
      color: #ff6b6b;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 8px;
    `;

    // Frame number
    this.frameNumberElement = document.createElement('span');
    this.frameNumberElement.className = 'frame-number';
    this.frameNumberElement.dataset.testid = 'missing-frame-number';
    this.frameNumberElement.style.cssText = `
      font-size: 14px;
      color: var(--text-muted, #888);
    `;

    this.container.appendChild(warningIcon);
    this.container.appendChild(this.messageElement);
    this.container.appendChild(this.frameNumberElement);
  }

  /**
   * Show the missing frame overlay for a specific frame
   */
  show(frameNumber: number): void {
    this.state.visible = true;
    this.state.frameNumber = frameNumber;
    this.frameNumberElement.textContent = `Frame ${frameNumber}`;
    this.container.style.display = 'flex';
  }

  /**
   * Hide the missing frame overlay
   */
  hide(): void {
    this.state.visible = false;
    this.state.frameNumber = null;
    this.container.style.display = 'none';
  }

  /**
   * Check if the overlay is currently visible
   */
  isVisible(): boolean {
    return this.state.visible;
  }

  /**
   * Get the current frame number being displayed (if any)
   */
  getFrameNumber(): number | null {
    return this.state.frameNumber;
  }

  /**
   * Render the component
   */
  render(): HTMLElement {
    return this.container;
  }

  /**
   * Dispose of the component
   */
  dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
