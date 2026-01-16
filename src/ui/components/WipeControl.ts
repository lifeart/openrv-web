import { EventEmitter, EventMap } from '../../utils/EventEmitter';

export type WipeMode = 'off' | 'horizontal' | 'vertical' | 'quad';
export type WipeSide = 'left' | 'right' | 'top' | 'bottom';

export interface WipeState {
  mode: WipeMode;
  position: number;  // 0-1, position of wipe line
  showOriginal: WipeSide;  // Which side shows original (no color adjustments)
}

export interface WipeControlEvents extends EventMap {
  modeChanged: WipeMode;
  positionChanged: number;
  stateChanged: WipeState;
}

export const DEFAULT_WIPE_STATE: WipeState = {
  mode: 'off',
  position: 0.5,
  showOriginal: 'left',
};

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
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 70px;
    `;

    this.toggleButton.addEventListener('click', () => this.cycleMode());
    this.toggleButton.addEventListener('mouseenter', () => {
      this.toggleButton.style.background = '#555';
    });
    this.toggleButton.addEventListener('mouseleave', () => {
      if (this.state.mode === 'off') {
        this.toggleButton.style.background = '#444';
      }
    });

    this.container.appendChild(this.toggleButton);
  }

  private updateButtonLabel(): void {
    const labels: Record<WipeMode, string> = {
      off: '⊞ Wipe',
      horizontal: '⊟ H-Wipe',
      vertical: '⊞ V-Wipe',
      quad: '⊠ Quad',
    };
    this.toggleButton.textContent = labels[this.state.mode];

    // Update button style based on active state
    if (this.state.mode !== 'off') {
      this.toggleButton.style.background = '#555';
      this.toggleButton.style.borderColor = '#4a9eff';
    } else {
      this.toggleButton.style.background = '#444';
      this.toggleButton.style.borderColor = '#555';
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
