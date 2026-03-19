/**
 * Bug Overlay Settings Context Menu
 *
 * A context menu for loading, removing, and configuring BugOverlay images.
 */

import { applyHoverEffect } from './shared/Button';
import { SHADOWS, Z_INDEX } from './shared/theme';
import type { BugOverlay, BugPosition } from './BugOverlay';

const VIEWPORT_MARGIN = 8;

const POSITION_LABELS: Record<BugPosition, string> = {
  'top-left': 'Top Left',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-right': 'Bottom Right',
};

export class BugOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private dismissHandlers: (() => void)[] = [];
  private _isVisible = false;
  private overlay: BugOverlay;
  private fileInput: HTMLInputElement | null = null;
  private errorText: HTMLDivElement | null = null;

  constructor(overlay: BugOverlay) {
    this.overlay = overlay;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'bug-overlay-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Bug Overlay settings');
    menu.style.cssText = `
      position: fixed;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      box-shadow: ${SHADOWS.dropdown};
      padding: 4px 0;
      z-index: ${Z_INDEX.dropdown};
      min-width: 240px;
      max-width: calc(100vw - 16px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      visibility: hidden;
    `;

    const state = this.overlay.getState();

    menu.appendChild(this.createSectionHeader('Asset'));
    menu.appendChild(this.createAssetControls(state.imageUrl !== null));
    menu.appendChild(this.createSeparator());

    menu.appendChild(this.createSectionHeader('Position'));
    for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as BugPosition[]) {
      const item = this.createRadioItem(POSITION_LABELS[position], state.position === position, () => {
        this.overlay.setPosition(position);
        this.updateRadioGroup(menu, position);
      });
      item.dataset.position = position;
      menu.appendChild(item);
    }

    menu.appendChild(this.createSeparator());
    menu.appendChild(this.createSectionHeader('Appearance'));
    menu.appendChild(
      this.createSliderControl('Size', 'bug-size', state.size * 100, 2, 30, '%', (value) => {
        this.overlay.setSize(value / 100);
        return this.overlay.getState().size * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Opacity', 'bug-opacity', state.opacity * 100, 0, 100, '%', (value) => {
        this.overlay.setOpacity(value / 100);
        return this.overlay.getState().opacity * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Margin', 'bug-margin', state.margin, 0, 100, 'px', (value) => {
        this.overlay.setMargin(value);
        return this.overlay.getState().margin;
      }),
    );

    this.menuEl = menu;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;

    if (left + rect.width > vw - VIEWPORT_MARGIN) left = x - rect.width;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (top + rect.height > vh - VIEWPORT_MARGIN) top = y - rect.height;
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';

    this._isVisible = true;
    this.setupDismissHandlers(menu);
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this.fileInput = null;
    this.errorText = null;
    this._isVisible = false;
    this.cleanupDismissHandlers();
  }

  isVisible(): boolean {
    return this._isVisible;
  }

  dispose(): void {
    this.hide();
  }

  private createSectionHeader(text: string): HTMLDivElement {
    const header = document.createElement('div');
    header.setAttribute('role', 'none');
    header.textContent = text;
    header.style.cssText = `
      padding: 6px 12px 2px;
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      pointer-events: none;
    `;
    return header;
  }

  private createAssetControls(hasImage: boolean): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'none');
    wrapper.style.cssText = `
      padding: 8px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
    this.fileInput.dataset.testid = 'bug-overlay-file-input';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => {
      void this.handleFileSelection();
    });

    const loadButton = this.createActionButton('Load Image', 'bug-overlay-load-button', () => {
      this.fileInput?.click();
    });

    const removeButton = this.createActionButton('Remove', 'bug-overlay-remove-button', () => {
      this.overlay.removeImage();
      if (this.errorText) {
        this.errorText.textContent = '';
      }
      this.hide();
    });
    removeButton.disabled = !hasImage;
    removeButton.style.opacity = hasImage ? '1' : '0.5';
    removeButton.style.cursor = hasImage ? 'pointer' : 'default';

    buttonRow.appendChild(loadButton);
    buttonRow.appendChild(removeButton);
    wrapper.appendChild(this.fileInput);
    wrapper.appendChild(buttonRow);

    this.errorText = document.createElement('div');
    this.errorText.dataset.testid = 'bug-overlay-load-error';
    this.errorText.style.cssText = `
      min-height: 14px;
      font-size: 11px;
      color: var(--text-danger, #ef4444);
    `;
    wrapper.appendChild(this.errorText);

    return wrapper;
  }

  private createActionButton(label: string, testId: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.testid = testId;
    button.textContent = label;
    button.style.cssText = `
      flex: 1;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      cursor: pointer;
    `;
    applyHoverEffect(button);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private createRadioItem(label: string, checked: boolean, onClick: () => void): HTMLDivElement {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', String(checked));
    item.tabIndex = -1;
    item.style.cssText = `
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      outline: none;
      white-space: nowrap;
    `;

    const checkSpan = document.createElement('span');
    checkSpan.className = 'menu-check';
    checkSpan.textContent = checked ? '\u2713' : '';
    checkSpan.style.cssText = `
      width: 14px;
      font-size: 12px;
      text-align: center;
      flex-shrink: 0;
    `;
    item.appendChild(checkSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    item.appendChild(labelSpan);

    applyHoverEffect(item);
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });

    return item;
  }

  private createSliderControl(
    labelText: string,
    id: string,
    initialValue: number,
    min: number,
    max: number,
    suffix: string,
    onInputValue: (value: number) => number,
  ): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'none');
    wrapper.style.cssText = `
      padding: 8px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: var(--text-primary);
    `;

    const label = document.createElement('span');
    label.textContent = labelText;
    labelRow.appendChild(label);

    const value = document.createElement('span');
    value.dataset.testid = `${id}-value`;
    value.textContent = `${Math.round(initialValue)}${suffix}`;
    labelRow.appendChild(value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = '1';
    slider.value = String(Math.round(initialValue));
    slider.dataset.testid = `${id}-slider`;
    slider.style.cssText = 'width: 100%;';
    slider.addEventListener('input', () => {
      const appliedValue = onInputValue(Number.parseInt(slider.value, 10));
      slider.value = String(Math.round(appliedValue));
      value.textContent = `${Math.round(appliedValue)}${suffix}`;
    });

    wrapper.appendChild(labelRow);
    wrapper.appendChild(slider);
    return wrapper;
  }

  private createSeparator(): HTMLDivElement {
    const separator = document.createElement('div');
    separator.setAttribute('role', 'separator');
    separator.style.cssText = `
      height: 1px;
      margin: 4px 0;
      background: var(--border-secondary);
      opacity: 0.5;
    `;
    return separator;
  }

  private updateRadioGroup(menu: HTMLDivElement, position: BugPosition): void {
    const items = menu.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
    items.forEach((item) => {
      const checked = item.dataset.position === position;
      item.setAttribute('aria-checked', String(checked));
      const check = item.querySelector<HTMLElement>('.menu-check');
      if (check) {
        check.textContent = checked ? '\u2713' : '';
      }
    });
  }

  private async handleFileSelection(): Promise<void> {
    const file = this.fileInput?.files?.[0];
    if (!file) {
      return;
    }

    if (this.errorText) {
      this.errorText.textContent = '';
    }

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      await this.overlay.loadImage(dataUrl);
      this.hide();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.errorText) {
        this.errorText.textContent = `Failed to load image: ${message}`;
      }
    } finally {
      if (this.fileInput) {
        this.fileInput.value = '';
      }
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Failed to read bug image'));
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error('Failed to read bug image'));
      };
      reader.readAsDataURL(file);
    });
  }

  private setupDismissHandlers(menu: HTMLDivElement): void {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !menu.contains(target)) {
        this.hide();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.hide();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    this.dismissHandlers.push(() => document.removeEventListener('mousedown', onPointerDown));
    this.dismissHandlers.push(() => document.removeEventListener('keydown', onKeyDown));
  }

  private cleanupDismissHandlers(): void {
    for (const dispose of this.dismissHandlers) {
      dispose();
    }
    this.dismissHandlers = [];
  }
}
