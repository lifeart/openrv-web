/**
 * LeftPanelContent - Single scrollable view for the left layout panel (Color preset).
 *
 * Contains collapsible sections:
 * 1. Color - Key adjustment sliders synced bidirectionally with ColorControls
 * 2. History - Compact undo/redo list from HistoryManager
 */

import { CollapsibleSection } from './CollapsibleSection';
import type { ColorControls } from '../../components/ColorControls';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../../../core/types/color';
import type { NumericAdjustmentKey, ColorAdjustments } from '../../../core/types/color';
import type { HistoryManager, HistoryEntry } from '../../../utils/HistoryManager';
import type { LayoutPresetId } from '../LayoutStore';

interface SliderConfig {
  key: NumericAdjustmentKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const PANEL_SLIDERS: SliderConfig[] = [
  { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}` },
  { key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, format: (v) => `${(v * 100).toFixed(0)}%` },
  { key: 'temperature', label: 'Temp', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}` },
];

export class LeftPanelContent {
  private element: HTMLElement;
  private colorSection: CollapsibleSection;
  private historySection: CollapsibleSection;

  // Slider tracking for bidirectional sync
  private sliders: Map<NumericAdjustmentKey, HTMLInputElement> = new Map();
  private valueLabels: Map<NumericAdjustmentKey, HTMLSpanElement> = new Map();
  private sliderConfigs: Map<NumericAdjustmentKey, SliderConfig> = new Map();

  // History elements
  private historyList: HTMLElement;
  private historyPlaceholder: HTMLElement;

  // Event unsubscribers
  private unsubscribers: (() => void)[] = [];

  // References
  private colorControls: ColorControls;
  private historyManager: HistoryManager;

  // Flag to prevent feedback loop
  private _updating = false;

  constructor(colorControls: ColorControls, historyManager: HistoryManager) {
    this.colorControls = colorControls;
    this.historyManager = historyManager;

    this.element = document.createElement('div');
    this.element.className = 'left-panel-content';
    this.element.dataset.testid = 'left-panel-content';
    this.element.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    // --- Section 1: Color Sliders ---
    this.colorSection = new CollapsibleSection('Color', {
      expanded: true,
      testId: 'section-color',
    });

    const slidersContainer = document.createElement('div');
    slidersContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    for (const config of PANEL_SLIDERS) {
      this.sliderConfigs.set(config.key, config);
      slidersContainer.appendChild(this.createSliderRow(config));
    }

    // "All Controls..." button
    const allControlsBtn = document.createElement('button');
    allControlsBtn.textContent = 'All Controls\u2026';
    allControlsBtn.dataset.testid = 'open-all-controls';
    allControlsBtn.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-primary);
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      margin-top: 6px;
      align-self: flex-start;
    `;
    allControlsBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent document click from immediately closing the panel
      colorControls.toggle();
    });

    slidersContainer.appendChild(allControlsBtn);
    this.colorSection.getContent().appendChild(slidersContainer);
    this.element.appendChild(this.colorSection.getElement());

    // --- Section 2: History ---
    this.historySection = new CollapsibleSection('History', {
      expanded: true,
      testId: 'section-history',
      onToggle: (expanded) => {
        if (expanded) {
          this.renderHistory(this.historyManager.getEntries());
        }
      },
    });

    // Clear button in header
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.dataset.testid = 'history-clear';
    clearBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 2px 4px;
      cursor: pointer;
      font-size: 10px;
      margin-left: auto;
    `;
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't toggle section
      this.historyManager.clear();
    });
    this.historySection.getHeader().appendChild(clearBtn);

    // History placeholder
    this.historyPlaceholder = document.createElement('div');
    this.historyPlaceholder.style.cssText = `
      color: var(--text-muted);
      font-size: 10px;
      padding: 8px 0;
    `;
    this.historyPlaceholder.textContent = 'No actions yet';

    // History list
    this.historyList = document.createElement('div');
    this.historyList.dataset.testid = 'history-list';
    this.historyList.style.cssText = `
      display: flex;
      flex-direction: column;
      max-height: 300px;
      overflow-y: auto;
    `;

    this.historySection.getContent().appendChild(this.historyPlaceholder);
    this.historySection.getContent().appendChild(this.historyList);
    this.element.appendChild(this.historySection.getElement());

    // --- Wire events ---
    // Reverse sync: ColorControls -> panel sliders
    this.unsubscribers.push(
      colorControls.on('adjustmentsChanged', (adj) => {
        if (this._updating) return;
        this.syncSlidersFromAdjustments(adj);
      })
    );

    // History updates
    this.unsubscribers.push(
      historyManager.on('historyChanged', (entries) => this.renderHistory(entries))
    );
    this.unsubscribers.push(
      historyManager.on('currentIndexChanged', () => this.updateHistoryHighlight())
    );

    // Initial render
    const state = historyManager.getState();
    this.renderHistory(state.entries);
    this.syncSlidersFromAdjustments(colorControls.getAdjustments());
  }

  private createSliderRow(config: SliderConfig): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    // Label (double-click to reset)
    const label = document.createElement('label');
    label.textContent = config.label;
    label.title = 'Double-click to reset';
    label.style.cssText = `
      color: var(--text-secondary);
      font-size: 10px;
      width: 65px;
      flex-shrink: 0;
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    label.addEventListener('dblclick', () => {
      const defaultValue = DEFAULT_COLOR_ADJUSTMENTS[config.key];
      this._updating = true;
      this.colorControls.setAdjustments({ [config.key]: defaultValue });
      this._updating = false;
      const slider = this.sliders.get(config.key);
      const valueLabel = this.valueLabels.get(config.key);
      if (slider) slider.value = String(defaultValue);
      if (valueLabel) valueLabel.textContent = config.format(defaultValue);
    });

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(config.min);
    slider.max = String(config.max);
    slider.step = String(config.step);
    slider.value = String(DEFAULT_COLOR_ADJUSTMENTS[config.key]);
    slider.dataset.testid = `panel-slider-${config.key}`;
    slider.style.cssText = `
      flex: 1;
      height: 3px;
      cursor: pointer;
      accent-color: var(--accent-primary);
      min-width: 0;
    `;

    // Value display
    const valueLabel = document.createElement('span');
    valueLabel.textContent = config.format(DEFAULT_COLOR_ADJUSTMENTS[config.key]);
    valueLabel.style.cssText = `
      color: var(--text-muted);
      font-size: 10px;
      width: 40px;
      text-align: right;
      font-family: monospace;
      flex-shrink: 0;
    `;

    this.sliders.set(config.key, slider);
    this.valueLabels.set(config.key, valueLabel);

    // Forward sync: panel slider -> ColorControls
    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      valueLabel.textContent = config.format(value);
      this._updating = true;
      this.colorControls.setAdjustments({ [config.key]: value });
      this._updating = false;
    });

    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(valueLabel);

    return row;
  }

  private syncSlidersFromAdjustments(adj: ColorAdjustments): void {
    for (const [key, slider] of this.sliders) {
      const value = adj[key];
      if (typeof value !== 'number') continue;
      slider.value = String(value);
      const config = this.sliderConfigs.get(key);
      const valueLabel = this.valueLabels.get(key);
      if (config && valueLabel) {
        valueLabel.textContent = config.format(value);
      }
    }
  }

  private renderHistory(entries: HistoryEntry[]): void {
    // Visibility guard
    if (!this.historySection.isExpanded()) return;

    if (entries.length === 0) {
      this.historyPlaceholder.style.display = '';
      this.historyList.style.display = 'none';
      return;
    }

    this.historyPlaceholder.style.display = 'none';
    this.historyList.style.display = 'flex';
    this.historyList.innerHTML = '';

    const currentIndex = this.historyManager.getCurrentIndex();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const item = document.createElement('div');
      item.dataset.historyIndex = String(i);
      item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px;
        cursor: pointer;
        font-size: 10px;
        border-radius: 3px;
        ${i === currentIndex ? 'background: rgba(var(--accent-primary-rgb), 0.15); color: var(--text-primary);' : 'color: var(--text-secondary);'}
        ${i > currentIndex ? 'opacity: 0.4;' : ''}
      `;

      const desc = document.createElement('span');
      desc.textContent = entry.description;
      desc.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';

      const time = document.createElement('span');
      time.textContent = this.formatTimeSince(entry.timestamp);
      time.style.cssText = 'color: var(--text-muted); font-size: 10px; flex-shrink: 0; margin-left: 4px;';

      item.appendChild(desc);
      item.appendChild(time);

      item.addEventListener('click', () => {
        this.historyManager.jumpTo(i);
      });

      this.historyList.appendChild(item);
    }

    // Scroll current entry into view
    const currentItem = this.historyList.children[currentIndex] as HTMLElement | undefined;
    currentItem?.scrollIntoView?.({ block: 'nearest' });
  }

  private updateHistoryHighlight(): void {
    const currentIndex = this.historyManager.getCurrentIndex();
    const children = this.historyList.children;

    for (let i = 0; i < children.length; i++) {
      const item = children[i] as HTMLElement;
      const isCurrent = i === currentIndex;
      const isFuture = i > currentIndex;

      item.style.background = isCurrent ? 'rgba(var(--accent-primary-rgb), 0.15)' : '';
      item.style.color = isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)';
      item.style.opacity = isFuture ? '0.4' : '';
    }
  }

  private formatTimeSince(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'now';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  }

  setPresetMode(preset: LayoutPresetId): void {
    switch (preset) {
      case 'review':
        // Review mode avoids accidental edits from this panel.
        this.colorSection.setExpanded(false);
        this.historySection.setExpanded(false);
        break;
      case 'color':
        // Color mode prioritizes active grading controls.
        this.colorSection.setExpanded(true);
        this.historySection.setExpanded(false);
        break;
      case 'paint':
        // Paint mode benefits from edit history over color sliders.
        this.colorSection.setExpanded(false);
        this.historySection.setExpanded(true);
        break;
      case 'default':
      default:
        // Balanced default.
        this.colorSection.setExpanded(true);
        this.historySection.setExpanded(true);
        break;
    }
  }

  getElement(): HTMLElement {
    return this.element;
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.sliders.clear();
    this.valueLabels.clear();
    this.sliderConfigs.clear();
    this.colorSection.dispose();
    this.historySection.dispose();
    this.element.remove();
  }
}
