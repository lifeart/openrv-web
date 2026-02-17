import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg, type IconName } from './shared/Icons';

export type { Transform2D } from '../../core/types/transform';
export { DEFAULT_TRANSFORM } from '../../core/types/transform';

import type { Transform2D } from '../../core/types/transform';
import { DEFAULT_TRANSFORM } from '../../core/types/transform';

export interface TransformControlEvents extends EventMap {
  transformChanged: Transform2D;
}

export class TransformControl extends EventEmitter<TransformControlEvents> {
  private container: HTMLElement;
  private rotationIndicator: HTMLElement;
  private transform: Transform2D = {
    ...DEFAULT_TRANSFORM,
    scale: { ...DEFAULT_TRANSFORM.scale },
    translate: { ...DEFAULT_TRANSFORM.translate },
  };

  constructor() {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'transform-control-container';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    // Create rotation status indicator
    this.rotationIndicator = document.createElement('span');
    this.rotationIndicator.dataset.testid = 'rotation-indicator';
    this.rotationIndicator.style.cssText = `
      font-size: 11px;
      color: var(--accent-primary);
      font-variant-numeric: tabular-nums;
      min-width: 0;
      display: none;
    `;

    this.createControls();
  }

  private createControls(): void {
    // Rotate left (counter-clockwise)
    const rotateLBtn = this.createButton('rotate-ccw', () => this.rotateLeft(), 'Rotate left 90° (Shift+R)');
    rotateLBtn.dataset.testid = 'transform-rotate-left';

    // Rotate right (clockwise)
    const rotateRBtn = this.createButton('rotate-cw', () => this.rotateRight(), 'Rotate right 90° (Alt+R)');
    rotateRBtn.dataset.testid = 'transform-rotate-right';

    // Flip horizontal
    const flipHBtn = this.createButton('flip-horizontal', () => this.toggleFlipH(), 'Flip horizontal (Alt+H)');
    flipHBtn.dataset.action = 'flipH';
    flipHBtn.dataset.testid = 'transform-flip-horizontal';

    // Flip vertical
    const flipVBtn = this.createButton('flip-vertical', () => this.toggleFlipV(), 'Flip vertical (Shift+V)');
    flipVBtn.dataset.action = 'flipV';
    flipVBtn.dataset.testid = 'transform-flip-vertical';

    // Reset button
    const resetBtn = this.createButton('reset', () => this.reset(), 'Reset transforms');
    resetBtn.dataset.testid = 'transform-reset';

    // Append rotation indicator after buttons
    this.container.appendChild(this.rotationIndicator);
  }

  private createButton(icon: IconName, onClick: () => void, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = getIconSvg(icon, 'sm');
    btn.title = title;
    btn.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      width: 28px;
      height: 28px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
    `;

    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => {
      if (!btn.classList.contains('active')) {
        btn.style.background = 'var(--bg-hover)';
        btn.style.borderColor = 'var(--border-primary)';
        btn.style.color = 'var(--text-primary)';
      }
    });
    btn.addEventListener('mouseleave', () => {
      this.updateButtonState(btn);
    });

    this.container.appendChild(btn);
    return btn;
  }

  private updateButtonState(btn: HTMLButtonElement): void {
    const action = btn.dataset.action;
    let isActive = false;

    if (action === 'flipH') {
      isActive = this.transform.flipH;
    } else if (action === 'flipV') {
      isActive = this.transform.flipV;
    }

    if (isActive) {
      btn.style.background = 'rgba(var(--accent-primary-rgb), 0.15)';
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.color = 'var(--accent-primary)';
      btn.classList.add('active');
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'transparent';
      btn.style.color = 'var(--text-muted)';
      btn.classList.remove('active');
    }
  }

  private updateAllButtons(): void {
    const buttons = this.container.querySelectorAll('button[data-action]');
    buttons.forEach((btn) => this.updateButtonState(btn as HTMLButtonElement));
    this.updateRotationIndicator();
  }

  private updateRotationIndicator(): void {
    if (this.transform.rotation !== 0) {
      this.rotationIndicator.textContent = `${this.transform.rotation}\u00B0`;
      this.rotationIndicator.style.display = '';
    } else {
      this.rotationIndicator.textContent = '';
      this.rotationIndicator.style.display = 'none';
    }
  }

  rotateRight(): void {
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    const currentIndex = rotations.indexOf(this.transform.rotation);
    this.transform.rotation = rotations[(currentIndex + 1) % 4]!;
    this.updateRotationIndicator();
    this.emitChange();
  }

  rotateLeft(): void {
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    const currentIndex = rotations.indexOf(this.transform.rotation);
    this.transform.rotation = rotations[(currentIndex + 3) % 4]!; // +3 is same as -1 mod 4
    this.updateRotationIndicator();
    this.emitChange();
  }

  toggleFlipH(): void {
    this.transform.flipH = !this.transform.flipH;
    this.updateAllButtons();
    this.emitChange();
  }

  toggleFlipV(): void {
    this.transform.flipV = !this.transform.flipV;
    this.updateAllButtons();
    this.emitChange();
  }

  reset(): void {
    this.transform = {
      ...DEFAULT_TRANSFORM,
      scale: { ...DEFAULT_TRANSFORM.scale },
      translate: { ...DEFAULT_TRANSFORM.translate },
    };
    this.updateAllButtons();
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('transformChanged', {
      ...this.transform,
      scale: { ...this.transform.scale },
      translate: { ...this.transform.translate },
    });
  }

  getTransform(): Transform2D {
    return {
      ...this.transform,
      scale: { ...this.transform.scale },
      translate: { ...this.transform.translate },
    };
  }

  setTransform(transform: Transform2D): void {
    this.transform = {
      ...transform,
      scale: { ...DEFAULT_TRANSFORM.scale, ...transform.scale },
      translate: { ...DEFAULT_TRANSFORM.translate, ...transform.translate },
    };
    this.updateAllButtons();
  }

  /**
   * Set scale values
   */
  setScale(x: number, y?: number): void {
    this.transform.scale = {
      x: Math.max(0.01, x), // Prevent zero or negative scale
      y: Math.max(0.01, y ?? x),
    };
    this.emitChange();
  }

  /**
   * Set translation values (in normalized 0-1 coordinates)
   */
  setTranslate(x: number, y: number): void {
    this.transform.translate = { x, y };
    this.emitChange();
  }

  /**
   * Check if transform has scale/translate applied
   */
  hasScaleOrTranslate(): boolean {
    const { scale, translate } = this.transform;
    return (
      scale.x !== 1 ||
      scale.y !== 1 ||
      translate.x !== 0 ||
      translate.y !== 0
    );
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
