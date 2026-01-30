/**
 * ChannelSelect - Channel isolation control for viewing individual color channels
 *
 * Allows users to view individual color channels (Red, Green, Blue, Alpha)
 * or computed channels (Luminance) in isolation. Essential for QC work to
 * check for noise, artifacts, or alpha channel issues.
 *
 * Now uses a compact dropdown instead of 6 separate buttons.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { DropdownMenu } from './shared/DropdownMenu';

export type ChannelMode = 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance';

export interface ChannelSelectEvents extends EventMap {
  channelChanged: ChannelMode;
}

export const CHANNEL_LABELS: Record<ChannelMode, string> = {
  rgb: 'RGB',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  alpha: 'Alpha',
  luminance: 'Grayscale',
};

export const CHANNEL_SHORT_LABELS: Record<ChannelMode, string> = {
  rgb: 'RGB',
  red: 'R',
  green: 'G',
  blue: 'B',
  alpha: 'A',
  luminance: 'L',
};

export const CHANNEL_SHORTCUTS: Record<string, ChannelMode> = {
  'R': 'red',
  'G': 'green',
  'B': 'blue',
  'A': 'alpha',
  'L': 'luminance',
  'Y': 'luminance', // Y for "graY" - alias for grayscale/luminance
  'N': 'rgb', // N for "normal" or neutral
};

const CHANNEL_COLORS: Record<ChannelMode, string> = {
  rgb: 'var(--text-primary)',
  red: '#ff6b6b',
  green: '#6bff6b',
  blue: '#6b9fff',
  alpha: 'var(--text-muted)',
  luminance: 'var(--text-primary)',
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
  private button!: HTMLButtonElement;
  private dropdown: DropdownMenu;
  private currentChannel: ChannelMode = 'rgb';

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'channel-select';
    this.container.dataset.testid = 'channel-select';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create dropdown menu
    this.dropdown = new DropdownMenu({
      minWidth: '120px',
      onSelect: (value) => {
        this.setChannel(value as ChannelMode);
      },
      onClose: () => {
        this.updateButtonLabel();
      },
    });

    // Set dropdown items with colors and shortcuts
    const channels: ChannelMode[] = ['rgb', 'red', 'green', 'blue', 'alpha', 'luminance'];
    this.dropdown.setItems(
      channels.map((channel) => ({
        value: channel,
        label: CHANNEL_LABELS[channel],
        color: CHANNEL_COLORS[channel],
        // Show L/Y for grayscale (luminance) to indicate both shortcuts work
        shortcut: channel === 'rgb' ? 'N' : channel === 'luminance' ? 'L/Y' : CHANNEL_SHORT_LABELS[channel],
      }))
    );

    this.dropdown.getElement().dataset.testid = 'channel-dropdown';

    this.createUI();
  }

  private createUI(): void {
    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'channel-select-button';
    this.button.title = 'Channel isolation (Shift+R/G/B/A/L/Y/N) - Y for grayscale';
    this.button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 60px;
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dropdown.toggle(this.button);
      this.updateButtonStyle();
    });
    this.button.addEventListener('mouseenter', () => {
      if (!this.dropdown.isVisible() && this.currentChannel === 'rgb') {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.dropdown.isVisible() && this.currentChannel === 'rgb') {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.button);

    this.container.appendChild(this.button);
  }

  private updateButtonLabel(): void {
    const label = this.currentChannel === 'rgb' ? 'Ch' : CHANNEL_SHORT_LABELS[this.currentChannel];
    const color = CHANNEL_COLORS[this.currentChannel];
    this.button.innerHTML = `${getIconSvg('eye', 'sm')}<span style="color: ${this.currentChannel !== 'rgb' ? color : 'inherit'}">${label}</span><span style="font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.currentChannel !== 'rgb') {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else if (!this.dropdown.isVisible()) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  private updateButtonStyle(): void {
    if (this.dropdown.isVisible()) {
      this.button.style.background = 'var(--bg-hover)';
      this.button.style.borderColor = 'var(--border-primary)';
    } else if (this.currentChannel === 'rgb') {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  /**
   * Set the current channel
   */
  setChannel(channel: ChannelMode): void {
    if (this.currentChannel === channel) return;

    this.currentChannel = channel;
    this.updateButtonLabel();
    this.dropdown.setSelectedValue(channel);
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
    this.dropdown.dispose();
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
