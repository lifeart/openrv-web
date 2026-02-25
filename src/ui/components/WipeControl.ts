import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg, type IconName } from './shared/Icons';
import { DEFAULT_WIPE_STATE } from '../../core/types/wipe';
import type { WipeMode, WipeSide, WipeState } from '../../core/types/wipe';
import { ComparisonManager } from './ComparisonManager';

// Re-export types and defaults for backward compatibility
export type { WipeMode, WipeSide, WipeState };
export { DEFAULT_WIPE_STATE };

export interface WipeControlEvents extends EventMap {
  modeChanged: WipeMode;
  positionChanged: number;
  stateChanged: WipeState;
}

/**
 * @deprecated Prefer using {@link ComparisonManager} directly for new code.
 * WipeControl is a legacy UI widget that now delegates wipe state to ComparisonManager.
 * It is kept for backward compatibility with existing consumers.
 */
export class WipeControl extends EventEmitter<WipeControlEvents> {
  private container: HTMLElement;
  private toggleButton: HTMLButtonElement;
  private manager: ComparisonManager;
  private showOriginal: WipeSide = 'left';

  constructor() {
    super();

    this.manager = new ComparisonManager();
    this.bindManagerEvents();

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
    this.toggleButton.addEventListener('pointerenter', () => {
      if (this.manager.getWipeMode() === 'off') {
        this.toggleButton.style.background = 'var(--bg-hover)';
        this.toggleButton.style.borderColor = 'var(--border-primary)';
        this.toggleButton.style.color = 'var(--text-primary)';
      }
    });
    this.toggleButton.addEventListener('pointerleave', () => {
      if (this.manager.getWipeMode() === 'off') {
        this.toggleButton.style.background = 'transparent';
        this.toggleButton.style.borderColor = 'transparent';
        this.toggleButton.style.color = 'var(--text-muted)';
      }
    });

    this.container.appendChild(this.toggleButton);
  }

  /**
   * Forward manager wipe events to WipeControl's own event emitter,
   * keeping the existing public event API intact.
   */
  private bindManagerEvents(): void {
    this.manager.on('wipeModeChanged', (mode) => {
      this.updateButtonLabel();
      this.emit('modeChanged', mode);
      this.emit('stateChanged', this.getState());
    });
    this.manager.on('wipePositionChanged', (position) => {
      this.emit('positionChanged', position);
      this.emit('stateChanged', this.getState());
    });
  }

  private updateButtonLabel(): void {
    const mode = this.manager.getWipeMode();
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
    this.toggleButton.innerHTML = `${getIconSvg(icons[mode], 'sm')}<span style="margin-left: 6px;">${labels[mode]}</span>`;

    // Update button style based on active state
    if (mode !== 'off') {
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
    this.manager.cycleWipeMode();
  }

  setMode(mode: WipeMode): void {
    this.manager.setWipeMode(mode);
  }

  getMode(): WipeMode {
    return this.manager.getWipeMode();
  }

  setPosition(position: number): void {
    this.manager.setWipePosition(position);
  }

  getPosition(): number {
    return this.manager.getWipePosition();
  }

  getState(): WipeState {
    return {
      mode: this.manager.getWipeMode(),
      position: this.manager.getWipePosition(),
      showOriginal: this.showOriginal,
    };
  }

  toggleOriginalSide(): void {
    const mode = this.manager.getWipeMode();
    if (mode === 'horizontal') {
      this.showOriginal = this.showOriginal === 'left' ? 'right' : 'left';
    } else if (mode === 'vertical') {
      this.showOriginal = this.showOriginal === 'top' ? 'bottom' : 'top';
    }
    this.emit('stateChanged', this.getState());
  }

  isActive(): boolean {
    return this.manager.getWipeMode() !== 'off';
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.manager.dispose();
  }
}
