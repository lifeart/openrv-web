import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

export interface ColorInversionToggleEvents extends EventMap {
  inversionChanged: boolean;
}

export class ColorInversionToggle extends EventEmitter<ColorInversionToggleEvents> {
  private container: HTMLElement;
  private button: HTMLButtonElement;
  private enabled = false;
  private disposed = false;

  constructor() {
    super();

    this.container = document.createElement('div');
    this.container.style.cssText = `
      display: flex;
      align-items: center;
    `;

    this.button = document.createElement('button');
    this.button.dataset.testid = 'color-inversion-toggle';
    this.button.title = 'Invert Colors (Ctrl+I)';
    this.button.innerHTML = `${getIconSvg('contrast', 'sm')}<span data-testid="color-inversion-label" style="margin-left: 6px;">Invert</span>`;
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

    this.button.setAttribute('aria-pressed', 'false');
    this.button.setAttribute('aria-label', 'Invert Colors');

    this.button.addEventListener('click', this.handleClick);
    this.button.addEventListener('mouseenter', this.handleMouseEnter);
    this.button.addEventListener('mouseleave', this.handleMouseLeave);

    this.container.appendChild(this.button);
  }

  private handleClick = (): void => {
    this.toggle();
  };

  private handleMouseEnter = (): void => {
    if (!this.enabled) {
      this.button.style.background = 'var(--bg-hover)';
      this.button.style.borderColor = 'var(--border-primary)';
      this.button.style.color = 'var(--text-primary)';
    }
  };

  private handleMouseLeave = (): void => {
    if (!this.enabled) {
      this.button.style.background = 'transparent';
      this.button.style.borderColor = 'transparent';
      this.button.style.color = 'var(--text-muted)';
    }
  };

  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.updateButtonStyle();
    this.emit('inversionChanged', this.enabled);
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  private updateButtonStyle(): void {
    this.button.setAttribute('aria-pressed', String(this.enabled));
    if (this.enabled) {
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
    this.button.removeEventListener('mouseenter', this.handleMouseEnter);
    this.button.removeEventListener('mouseleave', this.handleMouseLeave);
    this.removeAllListeners();
  }
}
