import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';
import { applyA11yFocus } from './shared/Button';
import {
  StereoMode,
  StereoState,
  DEFAULT_STEREO_STATE,
  getStereoModeLabel,
} from '../../stereo/StereoRenderer';

export interface StereoControlEvents extends EventMap {
  modeChanged: StereoMode;
  eyeSwapChanged: boolean;
  offsetChanged: number;
  stateChanged: StereoState;
}

const STEREO_MODES: StereoMode[] = [
  'off',
  'side-by-side',
  'over-under',
  'mirror',
  'anaglyph',
  'anaglyph-luminance',
  'checkerboard',
  'scanline',
];

export class StereoControl extends EventEmitter<StereoControlEvents> {
  private container: HTMLElement;
  private modeButton: HTMLButtonElement;
  private modeDropdown: HTMLElement;
  private eyeSwapButton: HTMLButtonElement;
  private offsetSlider: HTMLInputElement;
  private offsetLabel: HTMLSpanElement;
  private state: StereoState = { ...DEFAULT_STEREO_STATE };
  private isDropdownOpen = false;
  private boundHandleOutsideClick: (e: MouseEvent) => void;
  private boundHandleReposition: () => void;

  constructor() {
    super();

    // Bind event handlers for cleanup
    this.boundHandleOutsideClick = (e: MouseEvent) => this.handleOutsideClick(e);
    this.boundHandleReposition = () => this.positionDropdown();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'stereo-control-container';
    this.container.dataset.testid = 'stereo-control';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      position: relative;
    `;

    // Create mode select button with dropdown
    this.modeButton = document.createElement('button');
    this.modeButton.dataset.testid = 'stereo-mode-button';
    this.modeButton.title = 'Stereo viewing mode (Shift+3)';
    this.modeButton.style.cssText = `
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

    this.modeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
    this.modeButton.addEventListener('mouseenter', () => {
      if (this.state.mode === 'off' && !this.isDropdownOpen) {
        this.modeButton.style.background = 'var(--bg-hover)';
        this.modeButton.style.borderColor = 'var(--border-primary)';
        this.modeButton.style.color = 'var(--text-primary)';
      }
    });
    this.modeButton.addEventListener('mouseleave', () => {
      if (this.state.mode === 'off' && !this.isDropdownOpen) {
        this.modeButton.style.background = 'transparent';
        this.modeButton.style.borderColor = 'transparent';
        this.modeButton.style.color = 'var(--text-muted)';
      }
    });

    // Apply A11Y focus handling
    applyA11yFocus(this.modeButton);

    // Create dropdown (will be rendered at body level to avoid z-index issues)
    this.modeDropdown = document.createElement('div');
    this.modeDropdown.className = 'stereo-mode-dropdown';
    this.modeDropdown.dataset.testid = 'stereo-mode-dropdown';
    this.modeDropdown.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      padding: 4px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      min-width: 140px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Populate dropdown with mode options
    STEREO_MODES.forEach((mode) => {
      const option = document.createElement('button');
      option.dataset.stereoMode = mode;
      option.textContent = getStereoModeLabel(mode);
      option.style.cssText = `
        background: transparent;
        border: none;
        color: var(--text-primary);
        padding: 6px 10px;
        text-align: left;
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
        transition: background 0.12s ease;
      `;
      option.addEventListener('mouseenter', () => {
        option.style.background = 'var(--bg-hover)';
      });
      option.addEventListener('mouseleave', () => {
        if (this.state.mode !== mode) {
          option.style.background = 'transparent';
        }
      });
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setMode(mode);
        this.closeDropdown();
      });
      this.modeDropdown.appendChild(option);
    });

    // Create eye swap button
    this.eyeSwapButton = document.createElement('button');
    this.eyeSwapButton.textContent = 'Swap';
    this.eyeSwapButton.title = 'Swap left/right eyes';
    this.eyeSwapButton.dataset.testid = 'stereo-eye-swap';
    this.eyeSwapButton.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s ease;
      display: none;
    `;
    this.eyeSwapButton.addEventListener('click', () => this.toggleEyeSwap());
    this.eyeSwapButton.addEventListener('mouseenter', () => {
      if (!this.state.eyeSwap) {
        this.eyeSwapButton.style.background = 'var(--bg-hover)';
        this.eyeSwapButton.style.borderColor = 'var(--border-primary)';
      }
    });
    this.eyeSwapButton.addEventListener('mouseleave', () => {
      if (!this.state.eyeSwap) {
        this.eyeSwapButton.style.background = 'transparent';
        this.eyeSwapButton.style.borderColor = 'transparent';
      }
    });

    // Create offset slider container
    const offsetContainer = document.createElement('div');
    offsetContainer.className = 'stereo-offset-container';
    offsetContainer.dataset.testid = 'stereo-offset-container';
    offsetContainer.style.cssText = `
      display: none;
      align-items: center;
      gap: 4px;
    `;

    this.offsetLabel = document.createElement('span');
    this.offsetLabel.textContent = 'Offset:';
    this.offsetLabel.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
    `;

    this.offsetSlider = document.createElement('input');
    this.offsetSlider.type = 'range';
    this.offsetSlider.min = '-20';
    this.offsetSlider.max = '20';
    this.offsetSlider.step = '0.5';
    this.offsetSlider.value = '0';
    this.offsetSlider.title = 'Eye offset / convergence';
    this.offsetSlider.dataset.testid = 'stereo-offset-slider';
    this.offsetSlider.style.cssText = `
      width: 60px;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;
    this.offsetSlider.addEventListener('input', () => {
      this.setOffset(parseFloat(this.offsetSlider.value));
    });

    const offsetValue = document.createElement('span');
    offsetValue.className = 'offset-value';
    offsetValue.dataset.testid = 'stereo-offset-value';
    offsetValue.textContent = '0';
    offsetValue.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      min-width: 24px;
      text-align: right;
    `;

    offsetContainer.appendChild(this.offsetLabel);
    offsetContainer.appendChild(this.offsetSlider);
    offsetContainer.appendChild(offsetValue);

    // Assemble container (dropdown is NOT added here - it goes to body)
    this.container.appendChild(this.modeButton);
    this.container.appendChild(this.eyeSwapButton);
    this.container.appendChild(offsetContainer);

    // Initialize button label after dropdown is created
    this.updateModeButtonLabel();
  }

  private handleOutsideClick(e: MouseEvent): void {
    if (
      this.isDropdownOpen &&
      !this.modeButton.contains(e.target as Node) &&
      !this.modeDropdown.contains(e.target as Node)
    ) {
      this.closeDropdown();
    }
  }

  private positionDropdown(): void {
    if (!this.isDropdownOpen) return;
    const rect = this.modeButton.getBoundingClientRect();
    this.modeDropdown.style.top = `${rect.bottom + 4}px`;
    this.modeDropdown.style.left = `${rect.left}px`;
  }

  private updateModeButtonLabel(): void {
    const label = this.state.mode === 'off' ? 'Stereo' : getStereoModeLabel(this.state.mode);
    this.modeButton.innerHTML = `${getIconSvg('eye', 'sm')}<span style="margin-left: 4px;">${label}</span><span style="margin-left: 4px; font-size: 8px;">&#9660;</span>`;

    // Update button style based on active state
    if (this.state.mode !== 'off') {
      this.modeButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.modeButton.style.borderColor = 'var(--accent-primary)';
      this.modeButton.style.color = 'var(--accent-primary)';
    } else {
      this.modeButton.style.background = 'transparent';
      this.modeButton.style.borderColor = 'transparent';
      this.modeButton.style.color = 'var(--text-muted)';
    }

    // Update dropdown option highlighting
    const options = this.modeDropdown.querySelectorAll('button');
    options.forEach((option) => {
      const mode = (option as HTMLElement).dataset.stereoMode;
      if (mode === this.state.mode) {
        option.style.background = 'rgba(var(--accent-primary-rgb), 0.2)';
        option.style.color = 'var(--accent-primary)';
      } else {
        option.style.background = 'transparent';
        option.style.color = 'var(--text-primary)';
      }
    });
  }

  private updateControlsVisibility(): void {
    const isActive = this.state.mode !== 'off';
    this.eyeSwapButton.style.display = isActive ? 'inline-block' : 'none';
    const offsetContainer = this.container.querySelector('.stereo-offset-container') as HTMLElement;
    if (offsetContainer) {
      offsetContainer.style.display = isActive ? 'flex' : 'none';
    }
  }

  private updateEyeSwapButton(): void {
    if (this.state.eyeSwap) {
      this.eyeSwapButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.eyeSwapButton.style.borderColor = 'var(--accent-primary)';
      this.eyeSwapButton.style.color = 'var(--accent-primary)';
    } else {
      this.eyeSwapButton.style.background = 'transparent';
      this.eyeSwapButton.style.borderColor = 'transparent';
      this.eyeSwapButton.style.color = 'var(--text-muted)';
    }
  }

  private updateOffsetDisplay(): void {
    const offsetValue = this.container.querySelector('.offset-value') as HTMLElement;
    if (offsetValue) {
      const val = this.state.offset.toFixed(1);
      offsetValue.textContent = this.state.offset > 0 ? `+${val}` : val;
    }
    this.offsetSlider.value = String(this.state.offset);
  }

  private toggleDropdown(): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    // Append dropdown to body if not already there
    if (!document.body.contains(this.modeDropdown)) {
      document.body.appendChild(this.modeDropdown);
    }

    this.isDropdownOpen = true;
    this.positionDropdown();
    this.modeDropdown.style.display = 'flex';
    this.modeButton.style.background = 'var(--bg-hover)';
    this.modeButton.style.borderColor = 'var(--border-primary)';

    // Add listeners
    document.addEventListener('click', this.boundHandleOutsideClick);
    window.addEventListener('scroll', this.boundHandleReposition, true);
    window.addEventListener('resize', this.boundHandleReposition);
  }

  private closeDropdown(): void {
    this.isDropdownOpen = false;
    this.modeDropdown.style.display = 'none';
    this.updateModeButtonLabel();

    // Remove listeners
    document.removeEventListener('click', this.boundHandleOutsideClick);
    window.removeEventListener('scroll', this.boundHandleReposition, true);
    window.removeEventListener('resize', this.boundHandleReposition);
  }

  cycleMode(): void {
    const currentIndex = STEREO_MODES.indexOf(this.state.mode);
    const nextIndex = (currentIndex + 1) % STEREO_MODES.length;
    this.setMode(STEREO_MODES[nextIndex]!);
  }

  setMode(mode: StereoMode): void {
    if (mode !== this.state.mode) {
      this.state.mode = mode;
      this.updateModeButtonLabel();
      this.updateControlsVisibility();
      this.emit('modeChanged', mode);
      this.emit('stateChanged', { ...this.state });
    }
  }

  getMode(): StereoMode {
    return this.state.mode;
  }

  toggleEyeSwap(): void {
    this.setEyeSwap(!this.state.eyeSwap);
  }

  setEyeSwap(swap: boolean): void {
    if (swap !== this.state.eyeSwap) {
      this.state.eyeSwap = swap;
      this.updateEyeSwapButton();
      this.emit('eyeSwapChanged', swap);
      this.emit('stateChanged', { ...this.state });
    }
  }

  getEyeSwap(): boolean {
    return this.state.eyeSwap;
  }

  setOffset(offset: number): void {
    const clamped = Math.max(-20, Math.min(20, offset));
    if (clamped !== this.state.offset) {
      this.state.offset = clamped;
      this.updateOffsetDisplay();
      this.emit('offsetChanged', clamped);
      this.emit('stateChanged', { ...this.state });
    }
  }

  getOffset(): number {
    return this.state.offset;
  }

  getState(): StereoState {
    return { ...this.state };
  }

  setState(state: StereoState): void {
    const changed =
      state.mode !== this.state.mode ||
      state.eyeSwap !== this.state.eyeSwap ||
      state.offset !== this.state.offset;

    if (changed) {
      this.state = { ...state };
      this.updateModeButtonLabel();
      this.updateControlsVisibility();
      this.updateEyeSwapButton();
      this.updateOffsetDisplay();
      this.emit('stateChanged', { ...this.state });
    }
  }

  isActive(): boolean {
    return this.state.mode !== 'off';
  }

  reset(): void {
    this.setState({ ...DEFAULT_STEREO_STATE });
  }

  /**
   * Handle keyboard shortcuts
   * Returns true if the key was handled
   */
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    if (shiftKey && key === '3') {
      this.cycleMode();
      return true;
    }
    return false;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.closeDropdown();
    if (document.body.contains(this.modeDropdown)) {
      document.body.removeChild(this.modeDropdown);
    }
  }
}
