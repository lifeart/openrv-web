import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

export type PremultMode = 0 | 1 | 2;

export interface PremultControlEvents extends EventMap {
  premultChanged: PremultMode;
}

const MODE_LABELS: Record<PremultMode, string> = {
  0: 'Off',
  1: 'Premultiply',
  2: 'Unpremultiply',
};

export class PremultControl extends EventEmitter<PremultControlEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private mode: PremultMode = 0;
  private disposed = false;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.style.cssText = `
      display: flex;
      align-items: center;
    `;

    this.button = document.createElement('button');
    this.button.dataset.testid = 'premult-control';
    this.button.title = 'Alpha Premultiply Mode';
    this.button.innerHTML = `${getIconSvg('layers', 'sm')}<span data-testid="premult-label" style="margin-left: 6px;">Off</span>`;
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
    `;

    this.button.setAttribute('aria-label', 'Alpha Premultiply Mode');

    this.button.addEventListener('click', this.handleClick);
    this.button.addEventListener('pointerenter', this.handleMouseEnter);
    this.button.addEventListener('pointerleave', this.handleMouseLeave);

    this.container.appendChild(this.button);
  }

  private handleClick = (): void => {
    this.cycle();
  };

  private handleMouseEnter = (): void => {
    if (this.mode === 0) {
      this.button.style.background = 'var(--bg-hover)';
      this.button.style.borderColor = 'var(--border-primary)';
      this.button.style.color = 'var(--text-primary)';
    }
  };

  private handleMouseLeave = (): void => {
    if (this.mode === 0) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  };

  /** Cycle through modes: Off -> Premultiply -> Unpremultiply -> Off */
  cycle(): void {
    const next = ((this.mode + 1) % 3) as PremultMode;
    this.setMode(next);
  }

  setMode(mode: PremultMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.updateButtonStyle();
    this.emit('premultChanged', this.mode);
  }

  getMode(): PremultMode {
    return this.mode;
  }

  private updateButtonStyle(): void {
    const label = this.button.querySelector('[data-testid="premult-label"]');
    if (label) {
      label.textContent = MODE_LABELS[this.mode];
    }
    if (this.mode !== 0) {
      this.button.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      this.button.style.borderColor = 'var(--accent-primary)';
      this.button.style.color = 'var(--accent-primary)';
    } else {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.button.removeEventListener('click', this.handleClick);
    this.button.removeEventListener('pointerenter', this.handleMouseEnter);
    this.button.removeEventListener('pointerleave', this.handleMouseLeave);
    this.removeAllListeners();
  }
}
