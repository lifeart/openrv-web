import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { getIconSvg } from './shared/Icons';

export interface Transform2D {
  rotation: 0 | 90 | 180 | 270;  // Degrees clockwise
  flipH: boolean;                 // Horizontal flip
  flipV: boolean;                 // Vertical flip
}

export const DEFAULT_TRANSFORM: Transform2D = {
  rotation: 0,
  flipH: false,
  flipV: false,
};

export interface TransformControlEvents extends EventMap {
  transformChanged: Transform2D;
}

export class TransformControl extends EventEmitter<TransformControlEvents> {
  private container: HTMLElement;
  private transform: Transform2D = { ...DEFAULT_TRANSFORM };

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

    this.createControls();
  }

  private createControls(): void {
    // Rotate left (counter-clockwise)
    this.createButton('rotate-ccw', () => this.rotateLeft(), 'Rotate left 90° (Shift+R)');

    // Rotate right (clockwise)
    this.createButton('rotate-cw', () => this.rotateRight(), 'Rotate right 90° (R)');

    // Flip horizontal
    const flipHBtn = this.createButton('flip-horizontal', () => this.toggleFlipH(), 'Flip horizontal (H)');
    flipHBtn.dataset.action = 'flipH';

    // Flip vertical
    const flipVBtn = this.createButton('flip-vertical', () => this.toggleFlipV(), 'Flip vertical (V)');
    flipVBtn.dataset.action = 'flipV';

    // Reset button
    this.createButton('reset', () => this.reset(), 'Reset transforms');
  }

  private createButton(icon: string, onClick: () => void, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = getIconSvg(icon as any, 'sm');
    btn.title = title;
    btn.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #999;
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
        btn.style.background = '#3a3a3a';
        btn.style.borderColor = '#4a4a4a';
        btn.style.color = '#ccc';
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
      btn.style.background = 'rgba(74, 158, 255, 0.15)';
      btn.style.borderColor = '#4a9eff';
      btn.style.color = '#4a9eff';
      btn.classList.add('active');
    } else {
      btn.style.background = 'transparent';
      btn.style.borderColor = 'transparent';
      btn.style.color = '#999';
      btn.classList.remove('active');
    }
  }

  private updateAllButtons(): void {
    const buttons = this.container.querySelectorAll('button[data-action]');
    buttons.forEach((btn) => this.updateButtonState(btn as HTMLButtonElement));
  }

  rotateRight(): void {
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    const currentIndex = rotations.indexOf(this.transform.rotation);
    this.transform.rotation = rotations[(currentIndex + 1) % 4]!;
    this.emitChange();
  }

  rotateLeft(): void {
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    const currentIndex = rotations.indexOf(this.transform.rotation);
    this.transform.rotation = rotations[(currentIndex + 3) % 4]!; // +3 is same as -1 mod 4
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
    this.transform = { ...DEFAULT_TRANSFORM };
    this.updateAllButtons();
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('transformChanged', { ...this.transform });
  }

  getTransform(): Transform2D {
    return { ...this.transform };
  }

  setTransform(transform: Transform2D): void {
    this.transform = { ...transform };
    this.updateAllButtons();
  }

  /**
   * Handle keyboard shortcuts
   * Returns true if the key was handled
   */
  handleKeyboard(key: string, shiftKey: boolean): boolean {
    switch (key.toLowerCase()) {
      case 'r':
        if (shiftKey) {
          this.rotateLeft();
        } else {
          this.rotateRight();
        }
        return true;
      case 'h':
        this.toggleFlipH();
        return true;
      case 'v':
        // Note: 'v' might conflict with pan tool, so only handle if not in paint mode
        // For now, don't handle 'v' here - let App decide
        return false;
    }
    return false;
  }

  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
