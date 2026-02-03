/**
 * ChannelSelect - Channel isolation control for viewing individual color channels
 *
 * Allows users to view individual color channels (Red, Green, Blue, Alpha)
 * or computed channels (Luminance) in isolation. Essential for QC work to
 * check for noise, artifacts, or alpha channel issues.
 *
 * Now uses a compact dropdown instead of 6 separate buttons.
 *
 * EXR Layer Support:
 * When an EXR file is loaded with multiple layers/AOVs (e.g., diffuse, specular),
 * an additional layer selector appears allowing users to switch between render passes.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import { DropdownMenu } from './shared/DropdownMenu';
import type { EXRLayerInfo, EXRChannelRemapping } from '../../formats/EXRDecoder';

export type ChannelMode = 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance';

/**
 * State for EXR layer selection
 */
export interface EXRLayerState {
  /** Available layers from the EXR file */
  availableLayers: EXRLayerInfo[];
  /** Currently selected layer (null = default RGBA) */
  selectedLayer: string | null;
  /** Optional custom channel remapping */
  channelRemapping: EXRChannelRemapping | null;
}

export interface ChannelSelectEvents extends EventMap {
  channelChanged: ChannelMode;
  /** Emitted when EXR layer selection changes */
  layerChanged: { layer: string | null; remapping: EXRChannelRemapping | null };
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

  // EXR layer support
  private layerContainer: HTMLElement | null = null;
  private layerButton: HTMLButtonElement | null = null;
  private layerDropdown: DropdownMenu | null = null;
  private exrLayerState: EXRLayerState = {
    availableLayers: [],
    selectedLayer: null,
    channelRemapping: null,
  };

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'channel-select';
    this.container.dataset.testid = 'channel-select';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
      gap: 4px;
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
    this.layerDropdown?.dispose();
  }

  // ========== EXR Layer Support ==========

  /**
   * Set available EXR layers (called when an EXR file is loaded)
   * If there are multiple layers, shows the layer selector UI
   */
  setEXRLayers(layers: EXRLayerInfo[]): void {
    const previousLayers = this.exrLayerState.availableLayers;
    this.exrLayerState.availableLayers = layers;

    // Reset selected layer when loading a different file (layer list changed)
    // This prevents stale layer selection from a previous file
    const layersChanged = previousLayers.length !== layers.length ||
      previousLayers.some((l, i) => layers[i]?.name !== l.name);

    if (layersChanged) {
      this.exrLayerState.selectedLayer = null;
      this.exrLayerState.channelRemapping = null;
    }

    // Only show layer selector if there's more than one layer
    // (single RGBA layer doesn't need selection)
    const hasMultipleLayers = layers.length > 1;

    if (hasMultipleLayers) {
      this.showLayerSelector();
    } else {
      this.hideLayerSelector();
    }
  }

  /**
   * Clear EXR layers (called when switching to a non-EXR file)
   */
  clearEXRLayers(): void {
    this.exrLayerState = {
      availableLayers: [],
      selectedLayer: null,
      channelRemapping: null,
    };
    this.hideLayerSelector();
  }

  /**
   * Get current EXR layer state
   */
  getEXRLayerState(): EXRLayerState {
    return { ...this.exrLayerState };
  }

  /**
   * Set the selected EXR layer
   */
  setEXRLayer(layerName: string | null): void {
    if (this.exrLayerState.selectedLayer === layerName) return;

    this.exrLayerState.selectedLayer = layerName;
    this.updateLayerButtonLabel();
    this.layerDropdown?.setSelectedValue(layerName ?? 'RGBA');

    this.emit('layerChanged', {
      layer: layerName,
      remapping: this.exrLayerState.channelRemapping,
    });
  }

  /**
   * Set custom channel remapping for EXR
   */
  setChannelRemapping(remapping: EXRChannelRemapping | null): void {
    this.exrLayerState.channelRemapping = remapping;

    this.emit('layerChanged', {
      layer: this.exrLayerState.selectedLayer,
      remapping: remapping,
    });
  }

  private showLayerSelector(): void {
    if (this.layerContainer) {
      // Update existing dropdown items
      this.updateLayerDropdownItems();
      this.layerContainer.style.display = 'flex';
      return;
    }

    // Create layer container
    this.layerContainer = document.createElement('div');
    this.layerContainer.className = 'channel-select-layers';
    this.layerContainer.dataset.testid = 'exr-layer-select';
    this.layerContainer.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create layer dropdown
    this.layerDropdown = new DropdownMenu({
      minWidth: '140px',
      onSelect: (value) => {
        this.setEXRLayer(value === 'RGBA' ? null : value);
      },
      onClose: () => {
        this.updateLayerButtonLabel();
      },
    });

    this.layerDropdown.getElement().dataset.testid = 'exr-layer-dropdown';

    // Create layer button
    this.layerButton = document.createElement('button');
    this.layerButton.dataset.testid = 'exr-layer-button';
    this.layerButton.title = 'Select EXR layer/AOV';
    this.layerButton.style.cssText = `
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
      min-width: 70px;
      gap: 4px;
      outline: none;
    `;

    this.layerButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.layerDropdown?.toggle(this.layerButton!);
      this.updateLayerButtonStyle();
    });

    this.layerButton.addEventListener('mouseenter', () => {
      if (!this.layerDropdown?.isVisible() && !this.exrLayerState.selectedLayer) {
        this.layerButton!.style.background = 'var(--bg-hover)';
        this.layerButton!.style.borderColor = 'var(--border-primary)';
        this.layerButton!.style.color = 'var(--text-primary)';
      }
    });

    this.layerButton.addEventListener('mouseleave', () => {
      if (!this.layerDropdown?.isVisible() && !this.exrLayerState.selectedLayer) {
        this.layerButton!.style.background = 'transparent';
        this.layerButton!.style.borderColor = 'transparent';
        this.layerButton!.style.color = 'var(--text-muted)';
      }
    });

    applyA11yFocus(this.layerButton);

    this.updateLayerDropdownItems();
    this.updateLayerButtonLabel();

    this.layerContainer.appendChild(this.layerButton);
    this.container.appendChild(this.layerContainer);
  }

  private hideLayerSelector(): void {
    if (this.layerContainer) {
      this.layerContainer.style.display = 'none';
    }
  }

  private updateLayerDropdownItems(): void {
    if (!this.layerDropdown) return;

    const items = this.exrLayerState.availableLayers.map((layer) => ({
      value: layer.name,
      label: layer.name,
      // Show channel count as info
      shortcut: layer.channels.length > 0 ? layer.channels.join('') : '',
    }));

    this.layerDropdown.setItems(items);
    this.layerDropdown.setSelectedValue(this.exrLayerState.selectedLayer ?? 'RGBA');
  }

  private updateLayerButtonLabel(): void {
    if (!this.layerButton) return;

    const layerName = this.exrLayerState.selectedLayer ?? 'RGBA';
    const truncatedName = layerName.length > 10 ? layerName.substring(0, 9) + '...' : layerName;

    this.layerButton.innerHTML = `${getIconSvg('layers', 'sm')}<span>${truncatedName}</span><span style="font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.exrLayerState.selectedLayer && this.exrLayerState.selectedLayer !== 'RGBA') {
      this.layerButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.layerButton.style.borderColor = 'var(--accent-primary)';
      this.layerButton.style.color = 'var(--accent-primary)';
    } else if (!this.layerDropdown?.isVisible()) {
      this.layerButton.style.background = 'transparent';
      this.layerButton.style.borderColor = 'transparent';
      this.layerButton.style.color = 'var(--text-muted)';
    }
  }

  private updateLayerButtonStyle(): void {
    if (!this.layerButton || !this.layerDropdown) return;

    if (this.layerDropdown.isVisible()) {
      this.layerButton.style.background = 'var(--bg-hover)';
      this.layerButton.style.borderColor = 'var(--border-primary)';
    } else if (!this.exrLayerState.selectedLayer || this.exrLayerState.selectedLayer === 'RGBA') {
      this.layerButton.style.background = 'transparent';
      this.layerButton.style.borderColor = 'transparent';
      this.layerButton.style.color = 'var(--text-muted)';
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
