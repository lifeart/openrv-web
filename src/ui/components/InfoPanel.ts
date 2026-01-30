/**
 * InfoPanel - Floating panel showing file metadata and frame info
 *
 * Features:
 * - Display filename, resolution, bit depth
 * - Frame number, timecode, duration
 * - Color values at cursor position
 * - Configurable position (corners)
 * - Configurable fields
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export type InfoPanelPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface InfoPanelFields {
  filename: boolean;
  resolution: boolean;
  frameInfo: boolean;
  timecode: boolean;
  duration: boolean;
  fps: boolean;
  colorAtCursor: boolean;
}

export interface InfoPanelState {
  enabled: boolean;
  position: InfoPanelPosition;
  fields: InfoPanelFields;
}

export interface InfoPanelData {
  filename?: string;
  width?: number;
  height?: number;
  currentFrame?: number;
  totalFrames?: number;
  timecode?: string;
  duration?: string;
  fps?: number;
  colorAtCursor?: { r: number; g: number; b: number } | null;
  cursorPosition?: { x: number; y: number } | null;
}

export interface InfoPanelEvents extends EventMap {
  stateChanged: InfoPanelState;
  visibilityChanged: boolean;
}

const DEFAULT_FIELDS: InfoPanelFields = {
  filename: true,
  resolution: true,
  frameInfo: true,
  timecode: true,
  duration: false,
  fps: true,
  colorAtCursor: true,
};

export class InfoPanel extends EventEmitter<InfoPanelEvents> {
  private container: HTMLElement;
  private contentElement: HTMLElement;
  private enabled = false;
  private position: InfoPanelPosition = 'top-left';
  private fields: InfoPanelFields = { ...DEFAULT_FIELDS };
  private currentData: InfoPanelData = {};

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.className = 'info-panel';
    this.container.dataset.testid = 'info-panel';
    this.container.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: monospace;
      font-size: 11px;
      color: var(--text-primary);
      z-index: 500;
      pointer-events: none;
      display: none;
      min-width: 150px;
      max-width: 250px;
      line-height: 1.5;
    `;

    this.contentElement = document.createElement('div');
    this.contentElement.className = 'info-panel-content';
    this.container.appendChild(this.contentElement);

    this.updatePosition();
  }

  /**
   * Get the panel element
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * Enable/show the panel
   */
  enable(): void {
    this.enabled = true;
    this.container.style.display = 'block';
    this.render();
    this.emit('visibilityChanged', true);
    this.emitStateChanged();
  }

  /**
   * Disable/hide the panel
   */
  disable(): void {
    this.enabled = false;
    this.container.style.display = 'none';
    this.emit('visibilityChanged', false);
    this.emitStateChanged();
  }

  /**
   * Toggle panel visibility
   */
  toggle(): void {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
  }

  /**
   * Check if panel is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set panel position
   */
  setPosition(position: InfoPanelPosition): void {
    this.position = position;
    this.updatePosition();
    this.emitStateChanged();
  }

  /**
   * Get current position
   */
  getPosition(): InfoPanelPosition {
    return this.position;
  }

  /**
   * Set which fields to display
   */
  setFields(fields: Partial<InfoPanelFields>): void {
    this.fields = { ...this.fields, ...fields };
    this.render();
    this.emitStateChanged();
  }

  /**
   * Get current field settings
   */
  getFields(): InfoPanelFields {
    return { ...this.fields };
  }

  /**
   * Toggle a specific field
   */
  toggleField(field: keyof InfoPanelFields): void {
    this.fields[field] = !this.fields[field];
    this.render();
    this.emitStateChanged();
  }

  /**
   * Update panel data
   */
  update(data: Partial<InfoPanelData>): void {
    this.currentData = { ...this.currentData, ...data };
    if (this.enabled) {
      this.render();
    }
  }

  /**
   * Get current state
   */
  getState(): InfoPanelState {
    return {
      enabled: this.enabled,
      position: this.position,
      fields: { ...this.fields },
    };
  }

  /**
   * Set state from saved config
   */
  setState(state: Partial<InfoPanelState>): void {
    if (state.position !== undefined) {
      this.position = state.position;
      this.updatePosition();
    }
    if (state.fields !== undefined) {
      this.fields = { ...this.fields, ...state.fields };
    }
    if (state.enabled !== undefined) {
      if (state.enabled) {
        this.enable();
      } else {
        this.disable();
      }
    }
    this.render();
  }

  /**
   * Update position based on current setting
   */
  private updatePosition(): void {
    // Reset all position styles
    this.container.style.top = '';
    this.container.style.bottom = '';
    this.container.style.left = '';
    this.container.style.right = '';

    const margin = '10px';

    switch (this.position) {
      case 'top-left':
        this.container.style.top = margin;
        this.container.style.left = margin;
        break;
      case 'top-right':
        this.container.style.top = margin;
        this.container.style.right = margin;
        break;
      case 'bottom-left':
        this.container.style.bottom = margin;
        this.container.style.left = margin;
        break;
      case 'bottom-right':
        this.container.style.bottom = margin;
        this.container.style.right = margin;
        break;
    }
  }

  /**
   * Render panel content
   */
  private render(): void {
    if (!this.enabled) return;

    const lines: string[] = [];

    if (this.fields.filename && this.currentData.filename) {
      const name = this.truncateFilename(this.currentData.filename, 25);
      lines.push(`<span style="color: var(--accent-primary);">${name}</span>`);
    }

    if (this.fields.resolution && this.currentData.width && this.currentData.height) {
      lines.push(`${this.currentData.width} x ${this.currentData.height}`);
    }

    if (this.fields.frameInfo && this.currentData.currentFrame !== undefined) {
      const total = this.currentData.totalFrames ?? '?';
      lines.push(`Frame: ${this.currentData.currentFrame + 1} / ${total}`);
    }

    if (this.fields.timecode && this.currentData.timecode) {
      lines.push(`TC: ${this.currentData.timecode}`);
    }

    if (this.fields.duration && this.currentData.duration) {
      lines.push(`Duration: ${this.currentData.duration}`);
    }

    if (this.fields.fps && this.currentData.fps) {
      lines.push(`${this.currentData.fps} fps`);
    }

    if (this.fields.colorAtCursor) {
      if (this.currentData.colorAtCursor) {
        const { r, g, b } = this.currentData.colorAtCursor;
        const hex = this.rgbToHex(r, g, b);
        const swatch = `<span style="display:inline-block;width:12px;height:12px;background:${hex};border:1px solid var(--text-muted);vertical-align:middle;margin-right:4px;"></span>`;
        lines.push(`${swatch}RGB: ${r}, ${g}, ${b}`);
      } else {
        lines.push(`<span style="color: var(--text-muted);">RGB: --</span>`);
      }
    }

    if (lines.length === 0) {
      lines.push('<span style="color: var(--text-muted);">No data</span>');
    }

    this.contentElement.innerHTML = lines.join('<br>');
  }

  /**
   * Truncate filename for display
   */
  private truncateFilename(filename: string, maxLength: number): string {
    if (filename.length <= maxLength) return filename;
    const ext = filename.lastIndexOf('.');
    if (ext > 0) {
      const extension = filename.slice(ext);
      const name = filename.slice(0, ext);
      const available = maxLength - extension.length - 3;
      if (available > 5) {
        return name.slice(0, available) + '...' + extension;
      }
    }
    return filename.slice(0, maxLength - 3) + '...';
  }

  /**
   * Convert RGB to hex color
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Emit state changed event
   */
  private emitStateChanged(): void {
    this.emit('stateChanged', this.getState());
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.container.remove();
    this.removeAllListeners();
  }
}
