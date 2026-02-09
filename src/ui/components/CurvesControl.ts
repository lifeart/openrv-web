/**
 * CurvesControl - Draggable panel wrapper for curve editing
 *
 * Provides a complete curve editing interface with presets,
 * reset functionality, and import/export capabilities.
 * Now uses DraggableContainer for consistent draggable behavior.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { CurveEditor, CurveChannelType } from './CurveEditor';
import {
  type ColorCurvesData,
  CURVE_PRESETS,
  exportCurvesJSON,
  importCurvesJSON,
  isDefaultCurves,
} from '../../color/ColorProcessingFacade';
import { getIconSvg } from './shared/Icons';
import { createButton } from './shared/Button';
import {
  createDraggableContainer,
  createControlButton,
  DraggableContainer,
} from './shared/DraggableContainer';

interface CurvesControlEvents extends EventMap {
  curvesChanged: ColorCurvesData;
  visibilityChanged: boolean;
}

export class CurvesControl extends EventEmitter<CurvesControlEvents> {
  private draggableContainer: DraggableContainer;
  private editor: CurveEditor;
  private presetSelect: HTMLSelectElement;
  private visible = false;
  private isResetting = false;

  constructor(initialCurves?: ColorCurvesData) {
    super();

    // Create draggable container
    this.draggableContainer = createDraggableContainer({
      id: 'curves-control',
      title: 'Color Curves',
      initialPosition: { top: '10px', left: '10px' },
      zIndex: 100,
      onClose: () => this.hide(),
      testId: 'curves-control', // Maintain backward compatibility with existing tests
    });

    // Style the container for curves panel
    this.draggableContainer.element.style.cssText += `
      min-width: 220px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    `;

    // Add reset button to controls
    this.createHeaderControls();

    // Create inner content wrapper
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    // Create preset selector
    const presetRow = document.createElement('div');
    presetRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const presetLabel = document.createElement('label');
    presetLabel.textContent = 'Preset';
    presetLabel.style.cssText = `
      font-size: 11px;
      color: var(--text-secondary);
      min-width: 40px;
    `;
    presetRow.appendChild(presetLabel);

    this.presetSelect = document.createElement('select');
    this.presetSelect.dataset.testid = 'curves-preset';
    this.presetSelect.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      border: 1px solid var(--bg-hover);
      border-radius: 4px;
      background: var(--bg-secondary);
      color: #fff;
      font-size: 11px;
      cursor: pointer;
    `;

    CURVE_PRESETS.forEach((preset, index) => {
      const option = document.createElement('option');
      option.value = index.toString();
      option.textContent = preset.name;
      this.presetSelect.appendChild(option);
    });

    this.presetSelect.addEventListener('change', () => {
      const index = parseInt(this.presetSelect.value, 10);
      const preset = CURVE_PRESETS[index];
      if (preset) {
        this.editor.setCurves(preset.curves);
        this.emit('curvesChanged', this.editor.getCurves());
      }
    });

    presetRow.appendChild(this.presetSelect);
    contentWrapper.appendChild(presetRow);

    // Create curve editor
    this.editor = new CurveEditor(initialCurves);
    contentWrapper.appendChild(this.editor.render_element());

    // Listen for curve changes
    this.editor.on('curveChanged', () => {
      if (!this.isResetting) {
        this.updatePresetSelection();
      }
      this.emit('curvesChanged', this.editor.getCurves());
    });

    // Create import/export row
    const ioRow = document.createElement('div');
    ioRow.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 4px;
    `;

    const importBtn = createButton('Import', () => this.importCurves(), {
      variant: 'ghost',
      size: 'sm',
      title: 'Import curves from JSON file',
      icon: getIconSvg('upload', 'sm'),
    });
    importBtn.dataset.testid = 'curves-import';
    importBtn.style.flex = '1';
    ioRow.appendChild(importBtn);

    const exportBtn = createButton('Export', () => this.exportCurves(), {
      variant: 'ghost',
      size: 'sm',
      title: 'Export curves to JSON file',
      icon: getIconSvg('download', 'sm'),
    });
    exportBtn.dataset.testid = 'curves-export';
    exportBtn.style.flex = '1';
    ioRow.appendChild(exportBtn);

    contentWrapper.appendChild(ioRow);

    // Add content wrapper to draggable container
    this.draggableContainer.content.appendChild(contentWrapper);
  }

  private createHeaderControls(): void {
    const controls = this.draggableContainer.controls;

    // Reset button
    const resetBtn = createControlButton('Reset', 'Reset all curves to default');
    resetBtn.dataset.testid = 'curves-reset';
    resetBtn.addEventListener('click', () => this.resetAll());

    // Insert reset button before close button
    const closeButton = controls.querySelector('[data-testid="curves-control-close-button"]');
    controls.insertBefore(resetBtn, closeButton);
  }

  private updatePresetSelection(): void {
    const curves = this.editor.getCurves();

    // Check if curves match any preset
    for (let i = 0; i < CURVE_PRESETS.length; i++) {
      const preset = CURVE_PRESETS[i]!;
      if (this.curvesMatch(curves, preset.curves)) {
        this.presetSelect.value = i.toString();
        return;
      }
    }

    // If no match, could add a "Custom" option or leave as is
    // For now we just leave the last selected preset
  }

  private curvesMatch(a: ColorCurvesData, b: ColorCurvesData): boolean {
    const channels: (keyof ColorCurvesData)[] = ['master', 'red', 'green', 'blue'];

    for (const ch of channels) {
      const aCh = a[ch];
      const bCh = b[ch];

      if (aCh.enabled !== bCh.enabled) return false;
      if (aCh.points.length !== bCh.points.length) return false;

      for (let i = 0; i < aCh.points.length; i++) {
        const aP = aCh.points[i]!;
        const bP = bCh.points[i]!;
        if (Math.abs(aP.x - bP.x) > 0.001 || Math.abs(aP.y - bP.y) > 0.001) {
          return false;
        }
      }
    }

    return true;
  }

  private resetAll(): void {
    this.isResetting = true;
    this.editor.resetAll();
    this.presetSelect.value = '0'; // Linear (Default)
    this.isResetting = false;
    this.emit('curvesChanged', this.editor.getCurves());
  }

  private importCurves(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const curves = importCurvesJSON(text);
        if (curves) {
          this.editor.setCurves(curves);
          this.updatePresetSelection();
          this.emit('curvesChanged', curves);
        } else {
          console.error('Invalid curves JSON file');
        }
      } catch (err) {
        console.error('Failed to import curves:', err);
      }
    });
    input.click();
  }

  private exportCurves(): void {
    const curves = this.editor.getCurves();
    const json = exportCurvesJSON(curves);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'curves.json';
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Get current curves data
   */
  getCurves(): ColorCurvesData {
    return this.editor.getCurves();
  }

  /**
   * Set curves data
   */
  setCurves(curves: ColorCurvesData): void {
    this.editor.setCurves(curves);
    this.updatePresetSelection();
  }

  /**
   * Check if curves are at default (no adjustment)
   */
  isDefault(): boolean {
    return isDefaultCurves(this.editor.getCurves());
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show the panel
   */
  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.draggableContainer.show();
    this.emit('visibilityChanged', true);
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.draggableContainer.hide();
    this.emit('visibilityChanged', false);
  }

  /**
   * Check if visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Get the active channel
   */
  getActiveChannel(): CurveChannelType {
    return this.editor.getActiveChannel();
  }

  /**
   * Get current position
   */
  getPosition(): { x: number; y: number } {
    return this.draggableContainer.getPosition();
  }

  /**
   * Set position
   */
  setPosition(x: number, y: number): void {
    this.draggableContainer.setPosition(x, y);
  }

  /**
   * Reset position to initial
   */
  resetPosition(): void {
    this.draggableContainer.resetPosition();
  }

  /**
   * Render the component
   */
  render(): HTMLElement {
    return this.draggableContainer.element;
  }

  dispose(): void {
    this.editor.dispose();
    this.draggableContainer.dispose();
  }
}
