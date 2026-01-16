/**
 * ChannelSelect - Channel isolation control for viewing individual color channels
 *
 * Allows users to view individual color channels (Red, Green, Blue, Alpha)
 * or computed channels (Luminance) in isolation. Essential for QC work to
 * check for noise, artifacts, or alpha channel issues.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export type ChannelMode = 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance';

export interface ChannelSelectEvents extends EventMap {
  channelChanged: ChannelMode;
}

export const CHANNEL_LABELS: Record<ChannelMode, string> = {
  rgb: 'RGB',
  red: 'R',
  green: 'G',
  blue: 'B',
  alpha: 'A',
  luminance: 'Luma',
};

export const CHANNEL_SHORTCUTS: Record<string, ChannelMode> = {
  'R': 'red',
  'G': 'green',
  'B': 'blue',
  'A': 'alpha',
  'L': 'luminance',
  'N': 'rgb', // N for "normal" or neutral
};

/**
 * Rec.709 luminance coefficients
 */
export const LUMINANCE_COEFFICIENTS = {
  r: 0.2126,
  g: 0.7152,
  b: 0.0722,
};

export class ChannelSelect extends EventEmitter<ChannelSelectEvents> {
  private container: HTMLElement;
  private currentChannel: ChannelMode = 'rgb';
  private buttons: Map<ChannelMode, HTMLButtonElement> = new Map();

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'channel-select';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    this.createUI();
  }

  private createUI(): void {
    // Label
    const label = document.createElement('span');
    label.textContent = 'Ch:';
    label.style.cssText = `
      color: #888;
      font-size: 11px;
      margin-right: 4px;
    `;
    this.container.appendChild(label);

    // Channel buttons
    const channels: ChannelMode[] = ['rgb', 'red', 'green', 'blue', 'alpha', 'luminance'];

    for (const channel of channels) {
      const button = this.createButton(channel);
      this.buttons.set(channel, button);
      this.container.appendChild(button);
    }

    // Set initial state
    this.updateButtonStates();
  }

  private createButton(channel: ChannelMode): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = CHANNEL_LABELS[channel];
    button.title = this.getButtonTitle(channel);
    button.setAttribute('data-channel', channel);
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #bbb;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      min-width: 32px;
      transition: all 0.12s ease;
    `;

    button.addEventListener('mouseenter', () => {
      if (this.currentChannel !== channel) {
        button.style.background = 'rgba(255,255,255,0.08)';
        button.style.borderColor = 'rgba(255,255,255,0.1)';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (this.currentChannel !== channel) {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
      }
    });

    button.addEventListener('click', () => {
      this.setChannel(channel);
    });

    return button;
  }

  private getButtonTitle(channel: ChannelMode): string {
    const shortcuts: Record<ChannelMode, string> = {
      rgb: 'Show all channels (Shift+N)',
      red: 'Show red channel (Shift+R)',
      green: 'Show green channel (Shift+G)',
      blue: 'Show blue channel (Shift+B)',
      alpha: 'Show alpha channel (Shift+A)',
      luminance: 'Show luminance (Shift+L)',
    };
    return shortcuts[channel];
  }

  private updateButtonStates(): void {
    for (const [channel, button] of this.buttons) {
      const isActive = channel === this.currentChannel;
      button.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
      button.style.borderColor = isActive ? '#4a9eff' : 'transparent';
      button.style.color = isActive ? '#4a9eff' : '#bbb';
    }
  }

  /**
   * Set the current channel
   */
  setChannel(channel: ChannelMode): void {
    if (this.currentChannel === channel) return;

    this.currentChannel = channel;
    this.updateButtonStates();
    this.emit('channelChanged', channel);
  }

  /**
   * Get the current channel
   */
  getChannel(): ChannelMode {
    return this.currentChannel;
  }

  /**
   * Cycle to the next channel
   */
  cycleChannel(): void {
    const channels: ChannelMode[] = ['rgb', 'red', 'green', 'blue', 'alpha', 'luminance'];
    const currentIndex = channels.indexOf(this.currentChannel);
    const nextIndex = (currentIndex + 1) % channels.length;
    this.setChannel(channels[nextIndex]!);
  }

  /**
   * Reset to RGB (all channels)
   */
  reset(): void {
    this.setChannel('rgb');
  }

  /**
   * Handle keyboard shortcuts
   * Returns true if the key was handled
   */
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (!shiftKey) return false;

    const upperKey = key.toUpperCase();
    const channel = CHANNEL_SHORTCUTS[upperKey];

    if (channel) {
      this.setChannel(channel);
      return true;
    }

    return false;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.buttons.clear();
  }
}

/**
 * Apply channel isolation to ImageData
 * This is the core channel isolation algorithm
 */
export function applyChannelIsolation(
  imageData: ImageData,
  channel: ChannelMode
): void {
  if (channel === 'rgb') return; // No modification needed

  const data = imageData.data;
  const len = data.length;

  switch (channel) {
    case 'red':
      // Show red channel as grayscale
      for (let i = 0; i < len; i += 4) {
        const r = data[i]!;
        data[i] = r;     // R
        data[i + 1] = r; // G
        data[i + 2] = r; // B
        // Alpha unchanged
      }
      break;

    case 'green':
      // Show green channel as grayscale
      for (let i = 0; i < len; i += 4) {
        const g = data[i + 1]!;
        data[i] = g;     // R
        data[i + 1] = g; // G
        data[i + 2] = g; // B
      }
      break;

    case 'blue':
      // Show blue channel as grayscale
      for (let i = 0; i < len; i += 4) {
        const b = data[i + 2]!;
        data[i] = b;     // R
        data[i + 1] = b; // G
        data[i + 2] = b; // B
      }
      break;

    case 'alpha':
      // Show alpha channel as grayscale (white = opaque, black = transparent)
      for (let i = 0; i < len; i += 4) {
        const a = data[i + 3]!;
        data[i] = a;     // R
        data[i + 1] = a; // G
        data[i + 2] = a; // B
        data[i + 3] = 255; // Make fully opaque so we can see the alpha values
      }
      break;

    case 'luminance':
      // Rec.709 luminance: 0.2126*R + 0.7152*G + 0.0722*B
      for (let i = 0; i < len; i += 4) {
        const luma = Math.round(
          LUMINANCE_COEFFICIENTS.r * data[i]! +
          LUMINANCE_COEFFICIENTS.g * data[i + 1]! +
          LUMINANCE_COEFFICIENTS.b * data[i + 2]!
        );
        data[i] = luma;     // R
        data[i + 1] = luma; // G
        data[i + 2] = luma; // B
      }
      break;
  }
}

/**
 * Get channel value at a specific pixel
 */
export function getChannelValue(
  imageData: ImageData,
  x: number,
  y: number,
  channel: ChannelMode
): number {
  const idx = (y * imageData.width + x) * 4;
  const data = imageData.data;

  switch (channel) {
    case 'red':
      return data[idx]!;
    case 'green':
      return data[idx + 1]!;
    case 'blue':
      return data[idx + 2]!;
    case 'alpha':
      return data[idx + 3]!;
    case 'luminance':
      return Math.round(
        LUMINANCE_COEFFICIENTS.r * data[idx]! +
        LUMINANCE_COEFFICIENTS.g * data[idx + 1]! +
        LUMINANCE_COEFFICIENTS.b * data[idx + 2]!
      );
    case 'rgb':
    default:
      // Return perceived brightness for RGB mode
      return Math.round(
        LUMINANCE_COEFFICIENTS.r * data[idx]! +
        LUMINANCE_COEFFICIENTS.g * data[idx + 1]! +
        LUMINANCE_COEFFICIENTS.b * data[idx + 2]!
      );
  }
}
