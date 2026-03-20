/**
 * Matte Overlay Settings Context Menu
 *
 * A context menu for configuring MatteOverlay aspect, opacity, and center point.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import type { MatteOverlay } from './MatteOverlay';

const VIEWPORT_MARGIN = 8;

export class MatteOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private dismissHandlers: (() => void)[] = [];
  private _isVisible = false;
  private overlay: MatteOverlay;

  constructor(overlay: MatteOverlay) {
    this.overlay = overlay;
  }

  show(x: number, y: number): void {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'matte-overlay-settings-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Matte Overlay settings');
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

    const settings = this.overlay.getSettings();

    menu.appendChild(this.createSectionHeader('Aspect Ratio'));
    menu.appendChild(this.createAspectControl(settings.aspect));
    menu.appendChild(this.createSeparator());

    menu.appendChild(this.createSectionHeader('Appearance'));
    menu.appendChild(
      this.createSliderControl('Opacity', 'matte-opacity', settings.opacity * 100, 0, 100, '%', (value) => {
        this.overlay.setOpacity(value / 100);
        return this.overlay.getSettings().opacity * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Center X', 'matte-center-x', settings.centerPoint[0] * 100, -100, 100, '%', (value) => {
        const [, y] = this.overlay.getSettings().centerPoint;
        this.overlay.setCenterPoint(value / 100, y);
        return this.overlay.getSettings().centerPoint[0] * 100;
      }),
    );
    menu.appendChild(
      this.createSliderControl('Center Y', 'matte-center-y', settings.centerPoint[1] * 100, -100, 100, '%', (value) => {
        const [x] = this.overlay.getSettings().centerPoint;
        this.overlay.setCenterPoint(x, value / 100);
        return this.overlay.getSettings().centerPoint[1] * 100;
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

  private createAspectControl(initialAspect: number): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('role', 'none');
    wrapper.style.cssText = `
      padding: 8px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    const label = document.createElement('span');
    label.textContent = 'Target Aspect';
    label.style.cssText = 'font-size: 12px; color: var(--text-primary);';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.max = '10';
    input.step = '0.01';
    input.value = initialAspect.toFixed(2);
    input.dataset.testid = 'matte-aspect-input';
    input.style.cssText = `
      width: 100%;
      min-width: 0;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-secondary);
      color: var(--text-primary);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
    `;
    input.addEventListener('input', () => {
      const parsed = Number.parseFloat(input.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      this.overlay.setAspect(parsed);
      input.value = this.overlay.getSettings().aspect.toFixed(2);
    });

    // Preset aspect ratio buttons
    const presets = [
      { label: '2.39:1', value: 2.39 },
      { label: '1.85:1', value: 1.85 },
      { label: '16:9', value: 16 / 9 },
      { label: '4:3', value: 4 / 3 },
      { label: '1:1', value: 1 },
    ];

    const presetsRow = document.createElement('div');
    presetsRow.dataset.testid = 'matte-aspect-presets';
    presetsRow.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    `;

    const updatePresetHighlights = () => {
      const currentAspect = this.overlay.getSettings().aspect;
      presetsRow.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
        const presetValue = Number.parseFloat(btn.dataset.aspect!);
        const isSelected = Math.abs(currentAspect - presetValue) < 0.005;
        btn.style.background = isSelected ? 'rgba(var(--accent-primary-rgb), 0.2)' : 'var(--bg-tertiary)';
        btn.style.color = isSelected ? 'var(--accent-primary)' : 'var(--text-primary)';
        btn.style.borderColor = isSelected ? 'var(--accent-primary)' : 'var(--border-secondary)';
      });
    };

    for (const preset of presets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = preset.label;
      btn.dataset.testid = `matte-aspect-preset-${preset.label.replace(/[:.]/g, '-')}`;
      btn.dataset.aspect = String(preset.value);
      btn.style.cssText = `
        background: var(--bg-tertiary);
        border: 1px solid var(--border-secondary);
        color: var(--text-primary);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.12s ease;
      `;
      btn.addEventListener('click', () => {
        this.overlay.setAspect(preset.value);
        input.value = this.overlay.getSettings().aspect.toFixed(2);
        updatePresetHighlights();
      });
      btn.addEventListener('pointerenter', () => {
        btn.style.background = 'var(--bg-hover)';
      });
      btn.addEventListener('pointerleave', () => {
        const presetValue = Number.parseFloat(btn.dataset.aspect!);
        const currentAspect = this.overlay.getSettings().aspect;
        const isSelected = Math.abs(currentAspect - presetValue) < 0.005;
        btn.style.background = isSelected ? 'rgba(var(--accent-primary-rgb), 0.2)' : 'var(--bg-tertiary)';
      });
      presetsRow.appendChild(btn);
    }

    wrapper.appendChild(label);
    wrapper.appendChild(presetsRow);
    wrapper.appendChild(input);

    // Apply initial highlight
    updatePresetHighlights();

    return wrapper;
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
