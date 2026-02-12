import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg, type IconName } from './shared/Icons';
import { DEFAULT_WIPE_STATE } from '../../core/types/wipe';
import type { WipeMode, WipeSide, WipeState } from '../../core/types/wipe';

// Re-export types and defaults for backward compatibility
export type { WipeMode, WipeSide, WipeState };
export { DEFAULT_WIPE_STATE };

export interface WipeControlEvents extends EventMap {
  modeChanged: WipeMode;
  positionChanged: number;
  stateChanged: WipeState;
}

export class WipeControl extends EventEmitter<WipeControlEvents> {
  private container: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private state: WipeState = { ...DEFAULT_WIPE_STATE };

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'wipe-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 8px;
    `;

    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.updateButtonLabel();
    this.toggleButton.title = 'Toggle wipe comparison (W)';
    this.toggleButton.style.cssText = `
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
    `;

    this.toggleButton.addEventListener('click', () => this.cycleMode());
    this.toggleButton.addEventListener('mouseenter', () => {
      if (this.state.mode === 'off') {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      if (this.state.mode === 'off') {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.borderColor = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);
  }

  private updateButtonLabel(): void {
    const icons: Record<WipeMode, IconName> = {
      off: 'columns',
      horizontal: 'split-vertical',
      vertical: 'split-horizontal',
      quad: 'columns',
      'splitscreen-h': 'columns',
      'splitscreen-v': 'rows',
    };
    const labels: Record<WipeMode, string> = {
      off: 'Wipe',
      horizontal: 'H-Wipe',
      vertical: 'V-Wipe',
      quad: 'Quad',
      'splitscreen-h': 'Split-H',
      'splitscreen-v': 'Split-V',
    };
    this.toggleButton.innerHTML = `${getIconSvg(icons[this.state.mode], 'sm')}<span style="margin-left: 6px;">${labels[this.state.mode]}</span>`;

    // Update button style based on active state
    if (this.state.mode !== 'off') {
      this.toggleButton.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.toggleButton.style.borderColor = 'var(--accent-primary)';
      this.toggleButton.style.color = 'var(--accent-primary)';
    } else {
      this.toggleButton.style.background = 'transparent';
      this.toggleButton.style.borderColor = 'transparent';
      this.toggleButton.style.color = 'var(--text-muted)';
    }
  }

  cycleMode(): void {
    const modes: WipeMode[] = ['off', 'horizontal', 'vertical'];
    const currentIndex = modes.indexOf(this.state.mode);
    this.state.mode = modes[(currentIndex + 1) % modes.length]!;
    this.updateButtonLabel();
    this.emit('modeChanged', this.state.mode);
    this.emit('stateChanged', { ...this.state });
  }

  setMode(mode: WipeMode): void {
    if (mode !== this.state.mode) {
      this.state.mode = mode;
      this.updateButtonLabel();
      this.emit('modeChanged', mode);
      this.emit('stateChanged', { ...this.state });
    }
  }

  getMode(): WipeMode {
    return this.state.mode;
  }

  setPosition(position: number): void {
    const clamped = Math.max(0, Math.min(1, position));
    if (clamped !== this.state.position) {
      this.state.position = clamped;
      this.emit('positionChanged', clamped);
      this.emit('stateChanged', { ...this.state });
    }
  }

  getPosition(): number {
    return this.state.position;
  }

  getState(): WipeState {
    return { ...this.state };
  }

  toggleOriginalSide(): void {
    if (this.state.mode === 'horizontal') {
      this.state.showOriginal = this.state.showOriginal === 'left' ? 'right' : 'left';
    } else if (this.state.mode === 'vertical') {
      this.state.showOriginal = this.state.showOriginal === 'top' ? 'bottom' : 'top';
    }
    this.emit('stateChanged', { ...this.state });
  }

  isActive(): boolean {
    return this.state.mode !== 'off';
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
