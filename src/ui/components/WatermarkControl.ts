/**
 * WatermarkControl - UI panel for watermark/logo overlay settings
 *
 * Provides controls for loading image, position presets, scale, opacity, and margin.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  WatermarkOverlay,
  WatermarkState,
  WatermarkPosition,
} from './WatermarkOverlay';
import { getIconSvg } from './shared/Icons';

export interface WatermarkControlEvents extends EventMap {
  stateChanged: WatermarkState;
  imageLoaded: { width: number; height: number };
  imageRemoved: void;
  error: Error;
}

const POSITION_LABELS: Record<WatermarkPosition, string> = {
  'top-left': 'TL',
  'top-center': 'TC',
  'top-right': 'TR',
  'center-left': 'CL',
  'center': 'C',
  'center-right': 'CR',
  'bottom-left': 'BL',
  'bottom-center': 'BC',
  'bottom-right': 'BR',
  'custom': 'Custom',
};

export class WatermarkControl extends EventEmitter<WatermarkControlEvents> {
  private container: HTMLElement;
  private overlay: WatermarkOverlay;
  private fileInput!: HTMLInputElement;
  private loadButton!: HTMLButtonElement;
  private removeButton!: HTMLButtonElement;
  private positionGrid!: HTMLElement;
  private scaleSlider!: HTMLInputElement;
  private scaleValue!: HTMLSpanElement;
  private opacitySlider!: HTMLInputElement;
  private opacityValue!: HTMLSpanElement;
  private marginSlider!: HTMLInputElement;
  private marginValue!: HTMLSpanElement;
  private previewContainer!: HTMLElement;
  private controlsContainer!: HTMLElement;

  constructor(overlay?: WatermarkOverlay) {
    super();

    this.overlay = overlay || new WatermarkOverlay();

    this.container = document.createElement('div');
    this.container.className = 'watermark-control';
    this.container.dataset.testid = 'watermark-control';
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 8px 0;
    `;

    this.createControls();
    this.setupOverlayListeners();
    this.updateUI();
  }

  private createControls(): void {
    // Header with load/remove buttons
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px;
    `;

    const title = document.createElement('span');
    title.textContent = 'Watermark';
    title.style.cssText = 'font-size: 11px; font-weight: 500; color: var(--text-secondary);';

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = 'display: flex; gap: 4px;';

    // File input (hidden)
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
    this.fileInput.dataset.testid = 'watermark-file-input';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => this.handleFileSelect());

    // Load button
    this.loadButton = document.createElement('button');
    this.loadButton.innerHTML = getIconSvg('upload', 'sm');
    this.loadButton.title = 'Load watermark image';
    this.loadButton.dataset.testid = 'watermark-load-button';
    this.loadButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      transition: all 0.12s ease;
    `;
    this.loadButton.addEventListener('click', () => this.fileInput.click());
    this.loadButton.addEventListener('mouseenter', () => {
      this.loadButton.style.background = 'var(--bg-hover)';
    });
    this.loadButton.addEventListener('mouseleave', () => {
      this.loadButton.style.background = 'transparent';
    });

    // Remove button
    this.removeButton = document.createElement('button');
    this.removeButton.innerHTML = getIconSvg('trash', 'sm');
    this.removeButton.title = 'Remove watermark';
    this.removeButton.dataset.testid = 'watermark-remove-button';
    this.removeButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-secondary);
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      transition: all 0.12s ease;
    `;
    this.removeButton.addEventListener('click', () => this.removeImage());
    this.removeButton.addEventListener('mouseenter', () => {
      this.removeButton.style.background = 'rgba(255, 100, 100, 0.1)';
      this.removeButton.style.color = 'var(--text-primary)';
    });
    this.removeButton.addEventListener('mouseleave', () => {
      this.removeButton.style.background = 'transparent';
      this.removeButton.style.color = 'var(--text-muted)';
    });

    buttonGroup.appendChild(this.loadButton);
    buttonGroup.appendChild(this.removeButton);
    header.appendChild(title);
    header.appendChild(buttonGroup);
    header.appendChild(this.fileInput);
    this.container.appendChild(header);

    // Preview container
    this.previewContainer = document.createElement('div');
    this.previewContainer.dataset.testid = 'watermark-preview';
    this.previewContainer.style.cssText = `
      display: none;
      align-items: center;
      justify-content: center;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 8px;
      min-height: 60px;
    `;
    this.container.appendChild(this.previewContainer);

    // Controls container (hidden until image loaded)
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 12px;
    `;

    // Position grid
    const positionSection = document.createElement('div');
    positionSection.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const positionLabel = document.createElement('span');
    positionLabel.textContent = 'Position';
    positionLabel.style.cssText = 'font-size: 10px; color: var(--text-secondary); padding: 0 4px;';
    positionSection.appendChild(positionLabel);

    this.positionGrid = document.createElement('div');
    this.positionGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2px;
      padding: 0 4px;
    `;

    const positions: WatermarkPosition[] = [
      'top-left',
      'top-center',
      'top-right',
      'center-left',
      'center',
      'center-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ];

    for (const pos of positions) {
      const btn = document.createElement('button');
      btn.dataset.position = pos;
      btn.dataset.testid = `watermark-position-${pos}`;
      btn.textContent = POSITION_LABELS[pos];
      btn.style.cssText = `
        background: transparent;
        border: 1px solid var(--border-secondary);
        color: var(--text-muted);
        cursor: pointer;
        padding: 6px 4px;
        border-radius: 2px;
        font-size: 10px;
        transition: all 0.12s ease;
      `;
      btn.addEventListener('click', () => this.setPosition(pos));
      btn.addEventListener('mouseenter', () => {
        if (this.overlay.getPosition() !== pos) {
          btn.style.background = 'var(--bg-hover)';
        }
      });
      btn.addEventListener('mouseleave', () => {
        this.updatePositionButton(btn, pos);
      });
      this.positionGrid.appendChild(btn);
    }

    positionSection.appendChild(this.positionGrid);
    this.controlsContainer.appendChild(positionSection);

    // Scale slider
    const scaleRow = this.createSliderRow(
      'Scale',
      'watermark-scale-slider',
      10,
      200,
      this.overlay.getScale() * 100,
      (value) => {
        this.overlay.setScale(value / 100);
        this.scaleValue.textContent = `${Math.round(value)}%`;
      },
      '%'
    );
    this.scaleSlider = scaleRow.slider;
    this.scaleValue = scaleRow.value;
    this.controlsContainer.appendChild(scaleRow.row);

    // Opacity slider
    const opacityRow = this.createSliderRow(
      'Opacity',
      'watermark-opacity-slider',
      0,
      100,
      this.overlay.getOpacity() * 100,
      (value) => {
        this.overlay.setOpacity(value / 100);
        this.opacityValue.textContent = `${Math.round(value)}%`;
      },
      '%'
    );
    this.opacitySlider = opacityRow.slider;
    this.opacityValue = opacityRow.value;
    this.controlsContainer.appendChild(opacityRow.row);

    // Margin slider
    const marginRow = this.createSliderRow(
      'Margin',
      'watermark-margin-slider',
      0,
      100,
      this.overlay.getMargin(),
      (value) => {
        this.overlay.setMargin(value);
        this.marginValue.textContent = `${Math.round(value)}px`;
      },
      'px'
    );
    this.marginSlider = marginRow.slider;
    this.marginValue = marginRow.value;
    this.controlsContainer.appendChild(marginRow.row);

    this.container.appendChild(this.controlsContainer);
  }

  private createSliderRow(
    label: string,
    testId: string,
    min: number,
    max: number,
    initial: number,
    onChange: (value: number) => void,
    suffix = ''
  ): { row: HTMLElement; slider: HTMLInputElement; value: HTMLSpanElement } {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 4px;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 50px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(initial);
    slider.dataset.testid = testId;
    slider.style.cssText = 'flex: 1; height: 4px; cursor: pointer;';
    slider.addEventListener('input', () => {
      onChange(parseFloat(slider.value));
    });

    const value = document.createElement('span');
    value.textContent = suffix ? `${Math.round(initial)}${suffix}` : String(Math.round(initial));
    value.style.cssText = 'font-size: 11px; color: var(--text-secondary); min-width: 40px; text-align: right;';

    row.appendChild(labelEl);
    row.appendChild(slider);
    row.appendChild(value);

    return { row, slider, value };
  }

  private setupOverlayListeners(): void {
    this.overlay.on('stateChanged', (state) => {
      this.updateUI();
      this.emit('stateChanged', state);
    });

    this.overlay.on('imageLoaded', (dimensions) => {
      this.updateUI();
      this.emit('imageLoaded', dimensions);
    });

    this.overlay.on('imageRemoved', () => {
      this.updateUI();
      this.emit('imageRemoved', undefined);
    });

    this.overlay.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private async handleFileSelect(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    try {
      await this.overlay.loadImage(file);
    } catch (err) {
      // Error is already emitted by the overlay via 'error' event
      // which we forward in setupOverlayListeners
    }

    // Clear input for future selections
    this.fileInput.value = '';
  }

  private removeImage(): void {
    this.overlay.removeImage();
  }

  private setPosition(position: WatermarkPosition): void {
    this.overlay.setPosition(position);
  }

  private updateUI(): void {
    const hasImage = this.overlay.hasImage();
    const state = this.overlay.getState();

    // Show/hide controls
    this.controlsContainer.style.display = hasImage ? 'flex' : 'none';
    this.removeButton.style.display = hasImage ? 'flex' : 'none';

    // Update preview
    if (hasImage) {
      this.previewContainer.style.display = 'flex';
      const dims = this.overlay.getImageDimensions();
      if (dims) {
        this.previewContainer.innerHTML = `
          <span style="font-size: 10px; color: var(--text-muted);">
            ${dims.width} × ${dims.height}px
          </span>
        `;
      }
    } else {
      this.previewContainer.style.display = 'none';
    }

    // Update position grid
    const positionButtons = this.positionGrid.querySelectorAll('button');
    positionButtons.forEach((btn) => {
      const pos = (btn as HTMLElement).dataset.position as WatermarkPosition;
      this.updatePositionButton(btn as HTMLButtonElement, pos);
    });

    // Update sliders
    this.scaleSlider.value = String(state.scale * 100);
    this.scaleValue.textContent = `${Math.round(state.scale * 100)}%`;
    this.opacitySlider.value = String(state.opacity * 100);
    this.opacityValue.textContent = `${Math.round(state.opacity * 100)}%`;
    this.marginSlider.value = String(state.margin);
    this.marginValue.textContent = `${state.margin}px`;
  }

  private updatePositionButton(btn: HTMLButtonElement, pos: WatermarkPosition): void {
    const isActive = this.overlay.getPosition() === pos;
    btn.style.background = isActive ? 'rgba(var(--accent-primary-rgb), 0.15)' : 'transparent';
    btn.style.borderColor = isActive ? 'var(--accent-primary)' : 'var(--border-secondary)';
    btn.style.color = isActive ? 'var(--accent-primary)' : 'var(--text-muted)';
  }

  // Public API
  getOverlay(): WatermarkOverlay {
    return this.overlay;
  }

  getState(): WatermarkState {
    return this.overlay.getState();
  }

  setState(state: Partial<WatermarkState>): void {
    this.overlay.setState(state);
  }

  async loadImage(file: File): Promise<void> {
    return this.overlay.loadImage(file);
  }

  async loadFromUrl(url: string): Promise<void> {
    return this.overlay.loadFromUrl(url);
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.overlay.dispose();
  }
}
