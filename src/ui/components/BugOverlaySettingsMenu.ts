/**
 * Bug Overlay Settings Context Menu
 *
 * A context menu for loading, removing, and configuring BugOverlay images.
 */

import { applyHoverEffect } from './shared/Button';
import { SHADOWS, Z_INDEX } from './shared/theme';
import {
  createCheckableMenuItem,
  createSectionHeader,
  createSeparator,
  createSliderControl,
  setMenuItemChecked,
} from './shared/FormElements';
import type { BugOverlay, BugPosition } from './BugOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

const POSITION_LABELS: Record<BugPosition, string> = {
  'top-left': 'Top Left',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-right': 'Bottom Right',
};

export class BugOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
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

    menu.appendChild(createSectionHeader('Asset', { menu: true }));
    menu.appendChild(this.createAssetControls(state.imageUrl !== null));
    menu.appendChild(createSeparator('4px 0', { menu: true }));

    menu.appendChild(createSectionHeader('Position', { menu: true }));
    for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as BugPosition[]) {
      const item = createCheckableMenuItem(
        {
          label: POSITION_LABELS[position],
          checked: state.position === position,
          role: 'menuitemradio',
          onClick: () => {
            this.overlay.setPosition(position);
            this.updateRadioGroup(menu, position);
          },
        },
        applyHoverEffect,
      );
      item.dataset.position = position;
      menu.appendChild(item);
    }

    menu.appendChild(createSeparator('4px 0', { menu: true }));
    menu.appendChild(createSectionHeader('Appearance', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Size',
        id: 'bug-size',
        value: state.size * 100,
        min: 2,
        max: 30,
        suffix: '%',
        onInput: (value) => {
          this.overlay.setSize(value / 100);
          return this.overlay.getState().size * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Opacity',
        id: 'bug-opacity',
        value: state.opacity * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          this.overlay.setOpacity(value / 100);
          return this.overlay.getState().opacity * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Margin',
        id: 'bug-margin',
        value: state.margin,
        min: 0,
        max: 100,
        suffix: 'px',
        onInput: (value) => {
          this.overlay.setMargin(value);
          return this.overlay.getState().margin;
        },
      }).container,
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
    this.deregisterDismiss = outsideClickRegistry.register({
      elements: [menu],
      onDismiss: () => this.hide(),
    });
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    this.fileInput = null;
    this.errorText = null;
    this._isVisible = false;
    if (this.deregisterDismiss) {
      this.deregisterDismiss();
      this.deregisterDismiss = null;
    }
  }

  isVisible(): boolean {
    return this._isVisible;
  }

  dispose(): void {
    this.hide();
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

  private updateRadioGroup(menu: HTMLDivElement, position: BugPosition): void {
    const items = menu.querySelectorAll<HTMLDivElement>('[role="menuitemradio"]');
    items.forEach((item) => {
      setMenuItemChecked(item, item.dataset.position === position);
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
}
