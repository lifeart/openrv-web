/**
 * StereoEyeTransformControl - Per-eye geometric transform panel
 *
 * Provides UI controls for independent left/right eye transforms:
 * - Flip H/V toggle buttons
 * - Rotation slider (-180 to +180)
 * - Scale slider (0.5 to 2.0)
 * - Translation X/Y sliders (-100 to +100)
 * - Link/unlink L/R controls
 * - Reset all button
 *
 * Panel is only visible when stereo mode is active (not "off").
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import {
  StereoEyeTransformState,
  DEFAULT_EYE_TRANSFORM,
  isDefaultStereoEyeTransformState,
  clampRotation,
  clampScale,
  clampTranslation,
} from '../../stereo/StereoEyeTransform';

export interface StereoEyeTransformEvents extends EventMap {
  transformChanged: StereoEyeTransformState;
  visibilityChanged: boolean;
}

export class StereoEyeTransformControl extends EventEmitter<StereoEyeTransformEvents> {
  private container: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private panel: HTMLElement;
  private state: StereoEyeTransformState = {
    left: { ...DEFAULT_EYE_TRANSFORM },
    right: { ...DEFAULT_EYE_TRANSFORM },
    linked: false,
  };
  private isPanelOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private _cleanupA11y: (() => void) | null = null;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'stereo-eye-transform-container';
    this.container.style.cssText = 'display: inline-flex; align-items: center; position: relative;';

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.dataset.testid = 'stereo-eye-transform-button';
    this.toggleButton.title = 'Per-eye transforms (Shift+E)';
    this.toggleButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      outline: none;
    `;
    this.toggleButton.innerHTML = `${getIconSvg('grid', 'sm')}<span>Eye Transforms</span>`;
    this.toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });
    this.toggleButton.addEventListener('pointerenter', () => {
      if (!this.isActive() && !this.isPanelOpen) {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });
    this.toggleButton.addEventListener('pointerleave', () => {
      if (!this.isActive() && !this.isPanelOpen) {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.borderColor = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });
    this.toggleButton.setAttribute('aria-label', 'Per-eye transforms');
    this.toggleButton.setAttribute('aria-expanded', 'false');
    this.toggleButton.setAttribute('aria-haspopup', 'true');
    this._cleanupA11y = applyA11yFocus(this.toggleButton);

    // Create panel
    this.panel = this.createPanel();

    this.container.appendChild(this.toggleButton);
    this.updateToggleButtonStyle();
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.dataset.testid = 'stereo-eye-transform-panel';
    panel.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 0;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 420px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const title = document.createElement('span');
    title.textContent = 'Per-Eye Transforms';
    title.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--text-primary);';

    const closeBtn = document.createElement('button');
    closeBtn.dataset.testid = 'stereo-eye-transform-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 16px;
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1;
    `;
    closeBtn.addEventListener('click', () => this.hidePanel());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Controls row (link + reset)
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border-primary);
    `;

    const linkBtn = this.createLinkButton();
    const resetBtn = this.createResetButton();
    controlsRow.appendChild(linkBtn);
    controlsRow.appendChild(resetBtn);

    // Eye sections container
    const eyeSections = document.createElement('div');
    eyeSections.style.cssText = `
      display: flex;
      gap: 0;
    `;

    const leftSection = this.createEyeSection('left', 'LEFT EYE', '#4a9eff');
    const divider = document.createElement('div');
    divider.style.cssText = 'width: 1px; background: var(--border-primary); flex-shrink: 0;';
    const rightSection = this.createEyeSection('right', 'RIGHT EYE', '#ff6b4a');

    eyeSections.appendChild(leftSection);
    eyeSections.appendChild(divider);
    eyeSections.appendChild(rightSection);

    panel.appendChild(header);
    panel.appendChild(controlsRow);
    panel.appendChild(eyeSections);

    return panel;
  }

  private createLinkButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.dataset.testid = 'stereo-eye-link-toggle';
    btn.textContent = 'Link L/R';
    btn.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s ease;
    `;
    btn.addEventListener('click', () => {
      this.setLinked(!this.state.linked);
    });
    return btn;
  }

  private createResetButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.dataset.testid = 'stereo-eye-transform-reset';
    btn.textContent = 'Reset All';
    btn.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s ease;
    `;
    btn.addEventListener('click', () => this.reset());
    btn.addEventListener('pointerenter', () => {
      btn.style.background = 'var(--bg-hover)';
      btn.style.borderColor = 'var(--border-primary)';
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'transparent';
    });
    return btn;
  }

  private createEyeSection(eye: 'left' | 'right', label: string, dotColor: string): HTMLElement {
    const section = document.createElement('div');
    section.dataset.testid = `stereo-${eye}-eye-section`;
    section.style.cssText = 'flex: 1; padding: 8px 12px;';

    // Section header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    `;
    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${dotColor};
      display: inline-block;
    `;
    const headerLabel = document.createElement('span');
    headerLabel.textContent = label;
    headerLabel.style.cssText = `
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
    `;
    header.appendChild(dot);
    header.appendChild(headerLabel);

    // Flip buttons row
    const flipRow = document.createElement('div');
    flipRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px;';

    const flipH = this.createFlipButton(eye, 'h', 'FlipH');
    const flipV = this.createFlipButton(eye, 'v', 'FlipV');
    flipRow.appendChild(flipH);
    flipRow.appendChild(flipV);

    // Sliders
    const rotationRow = this.createSliderRow(eye, 'rotation', 'Rotate', -180, 180, 0.1, 0, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}\u00b0`);
    const scaleRow = this.createSliderRow(eye, 'scale', 'Scale', 0.5, 2.0, 0.01, 1.0, (v) => v.toFixed(2));
    const txRow = this.createSliderRow(eye, 'translate-x', 'X', -100, 100, 1, 0, (v) => `${v > 0 ? '+' : ''}${v}px`);
    const tyRow = this.createSliderRow(eye, 'translate-y', 'Y', -100, 100, 1, 0, (v) => `${v > 0 ? '+' : ''}${v}px`);

    section.appendChild(header);
    section.appendChild(flipRow);
    section.appendChild(rotationRow);
    section.appendChild(scaleRow);
    section.appendChild(txRow);
    section.appendChild(tyRow);

    return section;
  }

  private createFlipButton(eye: 'left' | 'right', axis: 'h' | 'v', label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.dataset.testid = `stereo-${eye}-flip-${axis}`;
    btn.textContent = label;
    btn.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-primary);
      color: var(--text-muted);
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      transition: all 0.12s ease;
    `;
    btn.addEventListener('click', () => {
      if (eye === 'left') {
        if (axis === 'h') this.setLeftFlipH(!this.state.left.flipH);
        else this.setLeftFlipV(!this.state.left.flipV);
      } else {
        if (axis === 'h') this.setRightFlipH(!this.state.right.flipH);
        else this.setRightFlipV(!this.state.right.flipV);
      }
    });
    return btn;
  }

  private createSliderRow(
    eye: 'left' | 'right',
    property: string,
    label: string,
    min: number,
    max: number,
    step: number,
    defaultValue: number,
    format: (v: number) => string
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 4px; margin-bottom: 4px;';

    const lbl = document.createElement('span');
    lbl.textContent = `${label}:`;
    lbl.style.cssText = 'color: var(--text-secondary); font-size: 10px; min-width: 38px;';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(defaultValue);
    slider.dataset.testid = `stereo-${eye}-${property}`;
    slider.style.cssText = `
      flex: 1;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;

    const valueSpan = document.createElement('span');
    valueSpan.className = `stereo-${eye}-${property}-value`;
    valueSpan.textContent = format(defaultValue);
    valueSpan.style.cssText = 'color: var(--text-secondary); font-size: 10px; min-width: 40px; text-align: right;';

    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      this.handleSliderChange(eye, property, val);
      valueSpan.textContent = format(val);
    });

    // Double-click to reset
    slider.addEventListener('dblclick', () => {
      slider.value = String(defaultValue);
      this.handleSliderChange(eye, property, defaultValue);
      valueSpan.textContent = format(defaultValue);
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(valueSpan);

    return row;
  }

  private handleSliderChange(eye: 'left' | 'right', property: string, value: number): void {
    switch (property) {
      case 'rotation':
        if (eye === 'left') this.setLeftRotation(value);
        else this.setRightRotation(value);
        break;
      case 'scale':
        if (eye === 'left') this.setLeftScale(value);
        else this.setRightScale(value);
        break;
      case 'translate-x':
        if (eye === 'left') this.setLeftTranslateX(value);
        else this.setRightTranslateX(value);
        break;
      case 'translate-y':
        if (eye === 'left') this.setLeftTranslateY(value);
        else this.setRightTranslateY(value);
        break;
    }
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (
      this.isPanelOpen &&
      !this.toggleButton.contains(e.target as Node) &&
      !this.panel.contains(e.target as Node)
    ) {
      this.hidePanel();
    }
  }

  private positionPanel(): void {
    if (!this.isPanelOpen) return;
    const rect = this.toggleButton.getBoundingClientRect();
    this.panel.style.top = `${rect.bottom + 4}px`;
    this.panel.style.left = `${rect.left}px`;
  }

  private updateToggleButtonStyle(): void {
    if (this.isActive()) {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  private updateLinkButtonStyle(): void {
    const btn = this.panel.querySelector('[data-testid="stereo-eye-link-toggle"]') as HTMLButtonElement;
    if (!btn) return;
    if (this.state.linked) {
      btn.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.color = 'var(--accent-primary)';
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'transparent';
      btn.style.color = 'var(--text-muted)';
    }
  }

  private updateFlipButtonStyle(eye: 'left' | 'right', axis: 'h' | 'v', active: boolean): void {
    const btn = this.panel.querySelector(`[data-testid="stereo-${eye}-flip-${axis}"]`) as HTMLButtonElement;
    if (!btn) return;
    if (active) {
      btn.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.color = 'var(--accent-primary)';
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'var(--border-primary)';
      btn.style.color = 'var(--text-muted)';
    }
  }

  private updateSliderUI(eye: 'left' | 'right', property: string, value: number, format: (v: number) => string): void {
    const slider = this.panel.querySelector(`[data-testid="stereo-${eye}-${property}"]`) as HTMLInputElement;
    if (slider) slider.value = String(value);
    const valueSpan = this.panel.querySelector(`.stereo-${eye}-${property}-value`) as HTMLElement;
    if (valueSpan) valueSpan.textContent = format(value);
  }

  private updateAllUI(): void {
    // Left eye
    this.updateFlipButtonStyle('left', 'h', this.state.left.flipH);
    this.updateFlipButtonStyle('left', 'v', this.state.left.flipV);
    this.updateSliderUI('left', 'rotation', this.state.left.rotation, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}\u00b0`);
    this.updateSliderUI('left', 'scale', this.state.left.scale, (v) => v.toFixed(2));
    this.updateSliderUI('left', 'translate-x', this.state.left.translateX, (v) => `${v > 0 ? '+' : ''}${v}px`);
    this.updateSliderUI('left', 'translate-y', this.state.left.translateY, (v) => `${v > 0 ? '+' : ''}${v}px`);

    // Right eye
    this.updateFlipButtonStyle('right', 'h', this.state.right.flipH);
    this.updateFlipButtonStyle('right', 'v', this.state.right.flipV);
    this.updateSliderUI('right', 'rotation', this.state.right.rotation, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}\u00b0`);
    this.updateSliderUI('right', 'scale', this.state.right.scale, (v) => v.toFixed(2));
    this.updateSliderUI('right', 'translate-x', this.state.right.translateX, (v) => `${v > 0 ? '+' : ''}${v}px`);
    this.updateSliderUI('right', 'translate-y', this.state.right.translateY, (v) => `${v > 0 ? '+' : ''}${v}px`);

    // Controls
    this.updateLinkButtonStyle();
    this.updateToggleButtonStyle();
  }

  private emitTransformChanged(): void {
    this.emit('transformChanged', this.getState());
    this.updateToggleButtonStyle();
  }

  // ---- Left eye setters ----

  setLeftFlipH(value: boolean): void {
    if (value === this.state.left.flipH) return;
    this.state.left.flipH = value;
    this.updateFlipButtonStyle('left', 'h', value);
    if (this.state.linked) {
      this.state.right.flipH = value;
      this.updateFlipButtonStyle('right', 'h', value);
    }
    this.emitTransformChanged();
  }

  setLeftFlipV(value: boolean): void {
    if (value === this.state.left.flipV) return;
    this.state.left.flipV = value;
    this.updateFlipButtonStyle('left', 'v', value);
    if (this.state.linked) {
      this.state.right.flipV = value;
      this.updateFlipButtonStyle('right', 'v', value);
    }
    this.emitTransformChanged();
  }

  setLeftRotation(value: number): void {
    const clamped = clampRotation(value);
    if (clamped === this.state.left.rotation) return;
    this.state.left.rotation = clamped;
    this.updateSliderUI('left', 'rotation', clamped, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}\u00b0`);
    if (this.state.linked) {
      this.state.right.rotation = clamped;
      this.updateSliderUI('right', 'rotation', clamped, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}\u00b0`);
    }
    this.emitTransformChanged();
  }

  setLeftScale(value: number): void {
    const clamped = clampScale(value);
    if (clamped === this.state.left.scale) return;
    this.state.left.scale = clamped;
    this.updateSliderUI('left', 'scale', clamped, (v) => v.toFixed(2));
    if (this.state.linked) {
      this.state.right.scale = clamped;
      this.updateSliderUI('right', 'scale', clamped, (v) => v.toFixed(2));
    }
    this.emitTransformChanged();
  }

  setLeftTranslateX(value: number): void {
    const clamped = clampTranslation(value);
    if (clamped === this.state.left.translateX) return;
    this.state.left.translateX = clamped;
    this.updateSliderUI('left', 'translate-x', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    if (this.state.linked) {
      this.state.right.translateX = clamped;
      this.updateSliderUI('right', 'translate-x', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    }
    this.emitTransformChanged();
  }

  setLeftTranslateY(value: number): void {
    const clamped = clampTranslation(value);
    if (clamped === this.state.left.translateY) return;
    this.state.left.translateY = clamped;
    this.updateSliderUI('left', 'translate-y', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    if (this.state.linked) {
      this.state.right.translateY = clamped;
      this.updateSliderUI('right', 'translate-y', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    }
    this.emitTransformChanged();
  }

  // ---- Right eye setters ----

  setRightFlipH(value: boolean): void {
    if (value === this.state.right.flipH) return;
    this.state.right.flipH = value;
    this.updateFlipButtonStyle('right', 'h', value);
    if (this.state.linked) {
      this.state.left.flipH = value;
      this.updateFlipButtonStyle('left', 'h', value);
    }
    this.emitTransformChanged();
  }

  setRightFlipV(value: boolean): void {
    if (value === this.state.right.flipV) return;
    this.state.right.flipV = value;
    this.updateFlipButtonStyle('right', 'v', value);
    if (this.state.linked) {
      this.state.left.flipV = value;
      this.updateFlipButtonStyle('left', 'v', value);
    }
    this.emitTransformChanged();
  }

  setRightRotation(value: number): void {
    const clamped = clampRotation(value);
    if (clamped === this.state.right.rotation) return;
    this.state.right.rotation = clamped;
    this.updateSliderUI('right', 'rotation', clamped, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}\u00b0`);
    if (this.state.linked) {
      this.state.left.rotation = clamped;
      this.updateSliderUI('left', 'rotation', clamped, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}\u00b0`);
    }
    this.emitTransformChanged();
  }

  setRightScale(value: number): void {
    const clamped = clampScale(value);
    if (clamped === this.state.right.scale) return;
    this.state.right.scale = clamped;
    this.updateSliderUI('right', 'scale', clamped, (v) => v.toFixed(2));
    if (this.state.linked) {
      this.state.left.scale = clamped;
      this.updateSliderUI('left', 'scale', clamped, (v) => v.toFixed(2));
    }
    this.emitTransformChanged();
  }

  setRightTranslateX(value: number): void {
    const clamped = clampTranslation(value);
    if (clamped === this.state.right.translateX) return;
    this.state.right.translateX = clamped;
    this.updateSliderUI('right', 'translate-x', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    if (this.state.linked) {
      this.state.left.translateX = clamped;
      this.updateSliderUI('left', 'translate-x', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    }
    this.emitTransformChanged();
  }

  setRightTranslateY(value: number): void {
    const clamped = clampTranslation(value);
    if (clamped === this.state.right.translateY) return;
    this.state.right.translateY = clamped;
    this.updateSliderUI('right', 'translate-y', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    if (this.state.linked) {
      this.state.left.translateY = clamped;
      this.updateSliderUI('left', 'translate-y', clamped, (v) => `${v > 0 ? '+' : ''}${v}px`);
    }
    this.emitTransformChanged();
  }

  // ---- State management ----

  setLinked(linked: boolean): void {
    if (linked === this.state.linked) return;
    this.state.linked = linked;
    this.updateLinkButtonStyle();
    // Linking does not change current values, but future changes will mirror
    this.emitTransformChanged();
  }

  getState(): StereoEyeTransformState {
    return {
      left: { ...this.state.left },
      right: { ...this.state.right },
      linked: this.state.linked,
    };
  }

  setState(state: StereoEyeTransformState): void {
    const changed =
      state.left.flipH !== this.state.left.flipH ||
      state.left.flipV !== this.state.left.flipV ||
      state.left.rotation !== this.state.left.rotation ||
      state.left.scale !== this.state.left.scale ||
      state.left.translateX !== this.state.left.translateX ||
      state.left.translateY !== this.state.left.translateY ||
      state.right.flipH !== this.state.right.flipH ||
      state.right.flipV !== this.state.right.flipV ||
      state.right.rotation !== this.state.right.rotation ||
      state.right.scale !== this.state.right.scale ||
      state.right.translateX !== this.state.right.translateX ||
      state.right.translateY !== this.state.right.translateY ||
      state.linked !== this.state.linked;

    if (!changed) return;

    this.state = {
      left: { ...state.left },
      right: { ...state.right },
      linked: state.linked,
    };
    this.updateAllUI();
    this.emitTransformChanged();
  }

  reset(): void {
    this.state = {
      left: { ...DEFAULT_EYE_TRANSFORM },
      right: { ...DEFAULT_EYE_TRANSFORM },
      linked: false,
    };
    this.updateAllUI();
    this.emitTransformChanged();
  }

  isActive(): boolean {
    return !isDefaultStereoEyeTransformState(this.state);
  }

  // ---- Panel visibility ----

  togglePanel(): void {
    if (this.isPanelOpen) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  showPanel(): void {
    if (this.isPanelOpen) return;

    // Append panel to body for z-index
    if (!document.body.contains(this.panel)) {
      document.body.appendChild(this.panel);
    }

    this.isPanelOpen = true;
    this.panel.style.display = 'flex';
    this.toggleButton.setAttribute('aria-expanded', 'true');
    this.positionPanel();
    this.updateAllUI();

    document.addEventListener('click', this.boundHandleOutsideClick);
    this.emit('visibilityChanged', true);
  }

  hidePanel(): void {
    if (!this.isPanelOpen) return;
    this.isPanelOpen = false;
    this.panel.style.display = 'none';
    this.toggleButton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this.boundHandleOutsideClick);
    this.updateToggleButtonStyle();
    this.emit('visibilityChanged', false);
  }

  isPanelVisible(): boolean {
    return this.isPanelOpen;
  }

  /**
   * Handle keyboard shortcuts
   * Returns true if the key was handled
   */
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (shiftKey && key === 'E') {
      this.togglePanel();
      return true;
    }
    return false;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.hidePanel();
    if (document.body.contains(this.panel)) {
      document.body.removeChild(this.panel);
    }
    if (this._cleanupA11y) {
      this._cleanupA11y();
      this._cleanupA11y = null;
    }
    this.removeAllListeners();
  }
}
