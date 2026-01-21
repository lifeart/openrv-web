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
  luminance: 'Luma',
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
  'N': 'rgb', // N for "normal" or neutral
};

const CHANNEL_COLORS: Record<ChannelMode, string> = {
  rgb: '#ccc',
  red: '#ff6b6b',
  green: '#6bff6b',
  blue: '#6b9fff',
  alpha: '#999',
  luminance: '#ddd',
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
  private dropdown!: HTMLElement;
  private currentChannel: ChannelMode = 'rgb';
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    this.container = document.createElement('div');
    this.container.className = 'channel-select';
    this.container.dataset.testid = 'channel-select';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    this.createUI();
  }

  private createUI(): void {
    // Create button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'channel-select-button';
    this.button.title = 'Channel isolation (Shift+R/G/B/A/L/N)';
    this.button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #999;
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
      this.toggleDropdown();
    });
    this.button.addEventListener('mouseenter', () => {
      if (!this.isOpen && this.currentChannel === 'rgb') {
        this.button.style.background = '#3a3a3a';
        this.button.style.borderColor = '#4a4a4a';
        this.button.style.color = '#ccc';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen && this.currentChannel === 'rgb') {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = '#999';
      }
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.button);

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'channel-dropdown';
    this.dropdown.dataset.testid = 'channel-dropdown';
    this.dropdown.style.cssText = `
      position: fixed;
      background: #2a2a2a;
      border: 1px solid #4a4a4a;
      border-radius: 4px;
      padding: 4px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 120px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    this.populateDropdown();
    this.container.appendChild(this.button);
  }

  private populateDropdown(): void {
    this.dropdown.innerHTML = '';

    const channels: ChannelMode[] = ['rgb', 'red', 'green', 'blue', 'alpha', 'luminance'];

    for (const channel of channels) {
      const option = document.createElement('button');
      option.dataset.channel = channel;
      option.style.cssText = `
        background: transparent;
        border: none;
        color: #ccc;
        padding: 6px 10px;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
        transition: background 0.12s ease;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      `;

      const leftPart = document.createElement('span');
      leftPart.style.cssText = 'display: flex; align-items: center; gap: 6px;';

      // Color indicator
      const colorDot = document.createElement('span');
      colorDot.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${CHANNEL_COLORS[channel]};
      `;
      leftPart.appendChild(colorDot);

      const labelSpan = document.createElement('span');
      labelSpan.textContent = CHANNEL_LABELS[channel];
      leftPart.appendChild(labelSpan);

      const shortcutHint = document.createElement('span');
      shortcutHint.textContent = channel === 'rgb' ? 'N' : CHANNEL_SHORT_LABELS[channel];
      shortcutHint.style.cssText = 'color: #666; font-size: 10px;';

      option.appendChild(leftPart);
      option.appendChild(shortcutHint);

      option.addEventListener('mouseenter', () => {
        option.style.background = '#3a3a3a';
      });
      option.addEventListener('mouseleave', () => {
        this.updateOptionStyle(option, channel);
      });
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setChannel(channel);
        this.closeDropdown();
      });
      this.dropdown.appendChild(option);
    }

    this.updateDropdownStates();
  }

  private updateButtonLabel(): void {
    const label = this.currentChannel === 'rgb' ? 'Ch' : CHANNEL_SHORT_LABELS[this.currentChannel];
    const color = CHANNEL_COLORS[this.currentChannel];
    this.button.innerHTML = `${getIconSvg('eye', 'sm')}<span style="color: ${this.currentChannel !== 'rgb' ? color : 'inherit'}">${label}</span><span style="font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.currentChannel !== 'rgb') {
      this.button.style.background = 'rgba(74, 158, 255, 0.15)';
      this.button.style.borderColor = '#4a9eff';
      this.button.style.color = '#4a9eff';
    } else if (!this.isOpen) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = '#999';
    }
  }

  private updateOptionStyle(option: HTMLButtonElement, channel: ChannelMode): void {
    const isActive = this.currentChannel === channel;
    option.style.background = isActive ? 'rgba(74, 158, 255, 0.15)' : 'transparent';
    option.style.color = isActive ? '#4a9eff' : '#ccc';
  }

  private updateDropdownStates(): void {
    const options = this.dropdown.querySelectorAll('button');
    options.forEach((option) => {
      const channel = (option as HTMLElement).dataset.channel as ChannelMode;
      this.updateOptionStyle(option as HTMLButtonElement, channel);
    });
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (
      this.isOpen &&
      !this.button.contains(e.target as Node) &&
      !this.dropdown.contains(e.target as Node)
    ) {
      this.closeDropdown();
    }
  }

  private positionDropdown(): void {
    if (!this.isOpen) return;
    const rect = this.button.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 4}px`;
    this.dropdown.style.left = `${rect.left}px`;
  }

  private toggleDropdown(): void {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    if (!document.body.contains(this.dropdown)) {
      document.body.appendChild(this.dropdown);
    }

    this.isOpen = true;
    this.positionDropdown();
    this.dropdown.style.display = 'flex';
    this.button.style.background = '#3a3a3a';
    this.button.style.borderColor = '#4a4a4a';

    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.updateButtonLabel();

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  /**
   * Set the current channel
   */
  setChannel(channel: ChannelMode): void {
    if (this.currentChannel === channel) return;

    this.currentChannel = channel;
    this.updateButtonLabel();
    this.updateDropdownStates();
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
    this.closeDropdown();
    if (document.body.contains(this.dropdown)) {
      document.body.removeChild(this.dropdown);
    }
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
