/**
 * TimecodeOverlay - Timecode overlay displayed on the viewer
 *
 * Features:
 * - SMPTE timecode display (HH:MM:SS:FF)
 * - Configurable position (top-left, top-right, bottom-left, bottom-right)
 * - Adjustable font size
 * - Background opacity for readability
 * - Support for drop-frame timecode
 */

import { Session } from '../../core/session/Session';
import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { frameToTimecode, formatTimecode } from './TimecodeDisplay';

export type OverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface TimecodeOverlayState {
  enabled: boolean;
  position: OverlayPosition;
  fontSize: 'small' | 'medium' | 'large';
  showFrameCounter: boolean;
  backgroundOpacity: number;
}

export interface TimecodeOverlayEvents extends EventMap {
  stateChanged: TimecodeOverlayState;
}

export const DEFAULT_TIMECODE_OVERLAY_STATE: TimecodeOverlayState = {
  enabled: false,
  position: 'top-left',
  fontSize: 'medium',
  showFrameCounter: true,
  backgroundOpacity: 0.6,
};

const FONT_SIZES: Record<TimecodeOverlayState['fontSize'], string> = {
  small: '14px',
  medium: '18px',
  large: '24px',
};

export class TimecodeOverlay extends EventEmitter<TimecodeOverlayEvents> {
  private container: HTMLElement;
  private timecodeElement: HTMLElement;
  private frameCounterElement: HTMLElement;
  private session: Session;
  private state: TimecodeOverlayState = { ...DEFAULT_TIMECODE_OVERLAY_STATE };
  private startFrame = 0;
  private unsubscribers: (() => void)[] = [];

  constructor(session: Session) {
    super();
    this.session = session;

    // Create overlay container
    this.container = document.createElement('div');
    this.container.className = 'timecode-overlay';
    this.container.dataset.testid = 'timecode-overlay';
    this.container.style.cssText = `
      position: absolute;
      z-index: 50;
      display: none;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      user-select: none;
      pointer-events: none;
    `;

    // Create inner wrapper with background
    const wrapper = document.createElement('div');
    wrapper.className = 'timecode-overlay-wrapper';
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 12px;
      border-radius: 4px;
    `;

    // Timecode display
    this.timecodeElement = document.createElement('div');
    this.timecodeElement.className = 'timecode-overlay-value';
    this.timecodeElement.dataset.testid = 'timecode-overlay-value';
    this.timecodeElement.style.cssText = `
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      letter-spacing: 1px;
    `;
    wrapper.appendChild(this.timecodeElement);

    // Frame counter
    this.frameCounterElement = document.createElement('div');
    this.frameCounterElement.className = 'timecode-overlay-frame';
    this.frameCounterElement.dataset.testid = 'timecode-overlay-frame';
    this.frameCounterElement.style.cssText = `
      color: rgba(255,255,255,0.7);
      font-size: 0.75em;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    `;
    wrapper.appendChild(this.frameCounterElement);

    this.container.appendChild(wrapper);

    // Apply initial state
    this.updateStyles();

    // Bind events
    this.unsubscribers.push(
      this.session.on('frameChanged', () => this.update()),
      this.session.on('sourceLoaded', () => this.update()),
      this.session.on('durationChanged', () => this.update()),
    );

    // Initial update
    this.update();
  }

  /**
   * Update the timecode display
   */
  private update(): void {
    const frame = this.session.currentFrame;
    const fps = this.session.fps;
    const totalFrames = this.session.frameCount;

    // Calculate and display timecode
    const tc = frameToTimecode(frame, fps, this.startFrame);
    this.timecodeElement.textContent = formatTimecode(tc);

    // Update frame counter
    if (this.state.showFrameCounter) {
      this.frameCounterElement.textContent = `Frame ${frame} / ${totalFrames}`;
      this.frameCounterElement.style.display = 'block';
    } else {
      this.frameCounterElement.style.display = 'none';
    }
  }

  /**
   * Update styles based on current state
   */
  private updateStyles(): void {
    const wrapper = this.container.querySelector('.timecode-overlay-wrapper') as HTMLElement;
    if (!wrapper) return;

    // Font size
    const fontSize = FONT_SIZES[this.state.fontSize];
    this.timecodeElement.style.fontSize = fontSize;

    // Background opacity
    wrapper.style.background = `rgba(0, 0, 0, ${this.state.backgroundOpacity})`;

    // Position
    this.container.style.top = '';
    this.container.style.bottom = '';
    this.container.style.left = '';
    this.container.style.right = '';

    switch (this.state.position) {
      case 'top-left':
        this.container.style.top = '16px';
        this.container.style.left = '16px';
        break;
      case 'top-right':
        this.container.style.top = '16px';
        this.container.style.right = '16px';
        break;
      case 'bottom-left':
        this.container.style.bottom = '16px';
        this.container.style.left = '16px';
        break;
      case 'bottom-right':
        this.container.style.bottom = '16px';
        this.container.style.right = '16px';
        break;
    }

    // Visibility
    this.container.style.display = this.state.enabled ? 'block' : 'none';
  }

  /**
   * Toggle overlay visibility
   */
  toggle(): void {
    this.setState({ enabled: !this.state.enabled });
  }

  /**
   * Enable overlay
   */
  enable(): void {
    this.setState({ enabled: true });
  }

  /**
   * Disable overlay
   */
  disable(): void {
    this.setState({ enabled: false });
  }

  /**
   * Set overlay position
   */
  setPosition(position: OverlayPosition): void {
    this.setState({ position });
  }

  /**
   * Set font size
   */
  setFontSize(fontSize: TimecodeOverlayState['fontSize']): void {
    this.setState({ fontSize });
  }

  /**
   * Set background opacity (0-1)
   */
  setBackgroundOpacity(opacity: number): void {
    this.setState({ backgroundOpacity: Math.max(0, Math.min(1, opacity)) });
  }

  /**
   * Toggle frame counter visibility
   */
  setShowFrameCounter(show: boolean): void {
    this.setState({ showFrameCounter: show });
  }

  /**
   * Set start timecode offset
   */
  setStartFrame(frame: number): void {
    this.startFrame = frame;
    this.update();
  }

  /**
   * Get start timecode offset
   */
  getStartFrame(): number {
    return this.startFrame;
  }

  /**
   * Set the complete state
   */
  setState(state: Partial<TimecodeOverlayState>): void {
    this.state = { ...this.state, ...state };
    this.updateStyles();
    this.update();
    this.emit('stateChanged', { ...this.state });
  }

  /**
   * Get current state
   */
  getState(): TimecodeOverlayState {
    return { ...this.state };
  }

  /**
   * Check if overlay is visible
   */
  isVisible(): boolean {
    return this.state.enabled;
  }

  /**
   * Get the element for mounting
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Dispose
   */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.removeAllListeners();
  }
}
