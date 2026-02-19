/**
 * GhostFrameControl - UI control for ghost frames (onion skin) overlay.
 *
 * Shows semi-transparent previous/next frames for animation review.
 * Features:
 * - Configurable number of frames before/after (0-5 each)
 * - Adjustable base opacity and falloff
 * - Optional color tinting (red for before, green for after)
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';

// Configuration constants
const FRAMES_MIN = 0;
const FRAMES_MAX = 5;
const OPACITY_BASE_MIN = 0.1;
const OPACITY_BASE_MAX = 0.5;
const OPACITY_FALLOFF_MIN = 0.5;
const OPACITY_FALLOFF_MAX = 0.9;

// Slider display values (percentages)
const OPACITY_BASE_MIN_PCT = OPACITY_BASE_MIN * 100;
const OPACITY_BASE_MAX_PCT = OPACITY_BASE_MAX * 100;
const OPACITY_FALLOFF_MIN_PCT = OPACITY_FALLOFF_MIN * 100;
const OPACITY_FALLOFF_MAX_PCT = OPACITY_FALLOFF_MAX * 100;

export interface GhostFrameState {
  enabled: boolean;
  framesBefore: number;     // FRAMES_MIN-FRAMES_MAX
  framesAfter: number;      // FRAMES_MIN-FRAMES_MAX
  opacityBase: number;      // OPACITY_BASE_MIN-OPACITY_BASE_MAX, opacity of nearest ghost frame
  opacityFalloff: number;   // OPACITY_FALLOFF_MIN-OPACITY_FALLOFF_MAX, how quickly opacity decreases per frame
  colorTint: boolean;       // Red for before, green for after
}

export const DEFAULT_GHOST_FRAME_STATE: GhostFrameState = {
  enabled: false,
  framesBefore: 2,
  framesAfter: 2,
  opacityBase: 0.3,
  opacityFalloff: 0.7,
  colorTint: false,
};

export interface GhostFrameControlEvents extends EventMap {
  stateChanged: GhostFrameState;
  enabledChanged: boolean;
}

export class GhostFrameControl extends EventEmitter<GhostFrameControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement;
  private state: GhostFrameState = { ...DEFAULT_GHOST_FRAME_STATE };
  private isOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    this.container = document.createElement('div');
    this.container.className = 'ghost-frame-control';
    this.container.dataset.testid = 'ghost-frame-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      position: relative;
    `;

    // Create toggle button
    this.button = document.createElement('button');
    this.button.dataset.testid = 'ghost-frame-button';
    this.button.title = 'Ghost Frames / Onion Skin (Ctrl+G)';
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
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
      min-width: 80px;
      gap: 4px;
      outline: none;
    `;
    this.updateButtonLabel();

    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
    this.button.addEventListener('mouseenter', () => {
      if (!this.isOpen && !this.state.enabled) {
        this.button.style.background = 'var(--bg-hover)';
        this.button.style.borderColor = 'var(--border-primary)';
        this.button.style.color = 'var(--text-primary)';
      }
    });
    this.button.addEventListener('mouseleave', () => {
      if (!this.isOpen && !this.state.enabled) {
        this.button.style.background = 'transparent';
        this.button.style.borderColor = 'transparent';
        this.button.style.color = 'var(--text-muted)';
      }
    });

    applyA11yFocus(this.button);

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'ghost-frame-dropdown';
    this.dropdown.dataset.testid = 'ghost-frame-dropdown';
    this.dropdown.setAttribute('role', 'dialog');
    this.dropdown.setAttribute('aria-label', 'Ghost Frame Settings');
    this.dropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 12px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 200px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      gap: 12px;
    `;

    this.populateDropdown();
    this.container.appendChild(this.button);
  }

  private populateDropdown(): void {
    this.dropdown.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const title = document.createElement('span');
    title.textContent = 'Ghost Frames';
    title.style.cssText = 'font-weight: 600; color: var(--text-primary);';
    header.appendChild(title);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-primary);
      color: var(--text-secondary);
      padding: 2px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
    `;
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.reset();
    });
    header.appendChild(resetBtn);

    this.dropdown.appendChild(header);

    // Enable toggle
    const enableRow = this.createToggleRow('Enabled', this.state.enabled, (checked) => {
      this.state.enabled = checked;
      this.updateButtonLabel();
      this.emit('enabledChanged', checked);
      this.emitStateChanged();
    });
    enableRow.dataset.testid = 'ghost-enable-toggle';
    this.dropdown.appendChild(enableRow);

    // Frames before slider
    const beforeRow = this.createSliderRow(
      'Frames Before',
      FRAMES_MIN,
      FRAMES_MAX,
      1,
      this.state.framesBefore,
      (value) => {
        this.state.framesBefore = value;
        this.emitStateChanged();
      },
      undefined,
      'ghost-frames-before'
    );
    this.dropdown.appendChild(beforeRow);

    // Frames after slider
    const afterRow = this.createSliderRow(
      'Frames After',
      FRAMES_MIN,
      FRAMES_MAX,
      1,
      this.state.framesAfter,
      (value) => {
        this.state.framesAfter = value;
        this.emitStateChanged();
      },
      undefined,
      'ghost-frames-after'
    );
    this.dropdown.appendChild(afterRow);

    // Base opacity slider
    const opacityRow = this.createSliderRow(
      'Base Opacity',
      OPACITY_BASE_MIN_PCT,
      OPACITY_BASE_MAX_PCT,
      5,
      this.state.opacityBase * 100,
      (value) => {
        this.state.opacityBase = value / 100;
        this.emitStateChanged();
      },
      (v) => `${Math.round(v)}%`,
      'ghost-base-opacity'
    );
    this.dropdown.appendChild(opacityRow);

    // Opacity falloff slider
    const falloffRow = this.createSliderRow(
      'Falloff',
      OPACITY_FALLOFF_MIN_PCT,
      OPACITY_FALLOFF_MAX_PCT,
      5,
      this.state.opacityFalloff * 100,
      (value) => {
        this.state.opacityFalloff = value / 100;
        this.emitStateChanged();
      },
      (v) => `${Math.round(v)}%`,
      'ghost-opacity-falloff'
    );
    this.dropdown.appendChild(falloffRow);

    // Color tint toggle
    const tintRow = this.createToggleRow('Color Tint (Red/Green)', this.state.colorTint, (checked) => {
      this.state.colorTint = checked;
      this.emitStateChanged();
    });
    this.dropdown.appendChild(tintRow);
  }

  private createSliderRow(
    label: string,
    min: number,
    max: number,
    step: number,
    initialValue: number,
    onChange: (value: number) => void,
    formatValue?: (value: number) => string,
    ariaId?: string
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
    labelRow.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.textContent = formatValue ? formatValue(initialValue) : String(initialValue);
    valueEl.style.cssText = 'font-size: 11px; color: var(--text-primary); min-width: 30px; text-align: right;';
    labelRow.appendChild(valueEl);

    row.appendChild(labelRow);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initialValue);
    slider.style.cssText = 'width: 100%; cursor: pointer;';
    slider.setAttribute('aria-label', label);
    slider.setAttribute('aria-valuemin', String(min));
    slider.setAttribute('aria-valuemax', String(max));
    slider.setAttribute('aria-valuenow', String(initialValue));
    if (ariaId) {
      slider.id = ariaId;
    }
    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueEl.textContent = formatValue ? formatValue(value) : String(value);
      slider.setAttribute('aria-valuenow', String(value));
      onChange(value);
    });

    row.appendChild(slider);

    return row;
  }

  private createToggleRow(label: string, initialValue: boolean, onChange: (checked: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 11px; color: var(--text-secondary);';
    row.appendChild(labelEl);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = initialValue;
    toggle.style.cssText = 'cursor: pointer;';
    toggle.addEventListener('change', () => {
      onChange(toggle.checked);
    });

    row.appendChild(toggle);

    return row;
  }

  private updateButtonLabel(): void {
    const label = this.state.enabled ? 'Ghost On' : 'Ghost';
    this.button.innerHTML = `${getIconSvg('ghost', 'sm')}<span>${label}</span>`;

    if (this.state.enabled) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else if (!this.isOpen) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
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
    this.button.setAttribute('aria-expanded', 'true');
    this.button.style.background = 'var(--bg-hover)';
    this.button.style.borderColor = 'var(--border-primary)';

    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.dropdown.style.display = 'none';
    this.button.setAttribute('aria-expanded', 'false');
    this.updateButtonLabel();

    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  private emitStateChanged(): void {
    this.emit('stateChanged', { ...this.state });
  }

  // Public methods
  toggle(): void {
    this.state.enabled = !this.state.enabled;
    this.updateButtonLabel();
    this.populateDropdown(); // Refresh checkbox state
    this.emit('enabledChanged', this.state.enabled);
    this.emitStateChanged();
  }

  reset(): void {
    this.state = { ...DEFAULT_GHOST_FRAME_STATE };
    this.updateButtonLabel();
    this.populateDropdown();
    this.emitStateChanged();
  }

  getState(): GhostFrameState {
    return { ...this.state };
  }

  setState(state: Partial<GhostFrameState>): void {
    if (state.enabled !== undefined) this.state.enabled = state.enabled;
    if (state.framesBefore !== undefined) this.state.framesBefore = Math.max(FRAMES_MIN, Math.min(FRAMES_MAX, state.framesBefore));
    if (state.framesAfter !== undefined) this.state.framesAfter = Math.max(FRAMES_MIN, Math.min(FRAMES_MAX, state.framesAfter));
    if (state.opacityBase !== undefined) this.state.opacityBase = Math.max(OPACITY_BASE_MIN, Math.min(OPACITY_BASE_MAX, state.opacityBase));
    if (state.opacityFalloff !== undefined) this.state.opacityFalloff = Math.max(OPACITY_FALLOFF_MIN, Math.min(OPACITY_FALLOFF_MAX, state.opacityFalloff));
    if (state.colorTint !== undefined) this.state.colorTint = state.colorTint;
    this.updateButtonLabel();
    this.populateDropdown();
    this.emitStateChanged();
  }

  isEnabled(): boolean {
    return this.state.enabled;
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
