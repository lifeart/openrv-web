/**
 * Matte Overlay Settings Context Menu
 *
 * A context menu for configuring MatteOverlay aspect, opacity, and center point.
 */

import { SHADOWS, Z_INDEX } from './shared/theme';
import { createSectionHeader, createSeparator, createSliderControl } from './shared/FormElements';
import type { MatteOverlay } from './MatteOverlay';
import { outsideClickRegistry } from '../../utils/ui/OutsideClickRegistry';

const VIEWPORT_MARGIN = 8;

export class MatteOverlaySettingsMenu {
  private menuEl: HTMLDivElement | null = null;
  private deregisterDismiss: (() => void) | null = null;
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

    menu.appendChild(createSectionHeader('Aspect Ratio', { menu: true }));
    menu.appendChild(this.createAspectControl(settings.aspect));
    menu.appendChild(createSeparator('4px 0', { menu: true }));

    menu.appendChild(createSectionHeader('Appearance', { menu: true }));
    menu.appendChild(
      createSliderControl({
        label: 'Opacity',
        id: 'matte-opacity',
        value: settings.opacity * 100,
        min: 0,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          this.overlay.setOpacity(value / 100);
          return this.overlay.getSettings().opacity * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Center X',
        id: 'matte-center-x',
        value: settings.centerPoint[0] * 100,
        min: -100,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          const [, y] = this.overlay.getSettings().centerPoint;
          this.overlay.setCenterPoint(value / 100, y);
          return this.overlay.getSettings().centerPoint[0] * 100;
        },
      }).container,
    );
    menu.appendChild(
      createSliderControl({
        label: 'Center Y',
        id: 'matte-center-y',
        value: settings.centerPoint[1] * 100,
        min: -100,
        max: 100,
        suffix: '%',
        onInput: (value) => {
          const [x] = this.overlay.getSettings().centerPoint;
          this.overlay.setCenterPoint(x, value / 100);
          return this.overlay.getSettings().centerPoint[1] * 100;
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

    updatePresetHighlights();

    return wrapper;
  }
}
