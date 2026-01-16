/**
 * CurvesControl - Panel wrapper for curve editing
 *
 * Provides a complete curve editing interface with presets,
 * reset functionality, and import/export capabilities.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { CurveEditor, CurveChannelType } from './CurveEditor';
import {
  ColorCurvesData,
  CURVE_PRESETS,
  exportCurvesJSON,
  importCurvesJSON,
  isDefaultCurves,
} from '../../color/ColorCurves';

interface CurvesControlEvents extends EventMap {
  curvesChanged: ColorCurvesData;
  visibilityChanged: boolean;
}

export class CurvesControl extends EventEmitter<CurvesControlEvents> {
  private container: HTMLElement;
  private editor: CurveEditor;
  private presetSelect: HTMLSelectElement;
  private visible = false;
  private isResetting = false;

  constructor(initialCurves?: ColorCurvesData) {
    super();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'curves-control';
    this.container.dataset.testid = 'curves-control';
    this.container.style.cssText = `
      display: none;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: #1a1a1a;
      border-radius: 8px;
      min-width: 220px;
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    `;

    const title = document.createElement('span');
    title.textContent = 'Curves';
    title.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    header.appendChild(title);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Reset all curves to default';
    resetBtn.dataset.testid = 'curves-reset';
    resetBtn.style.cssText = `
      padding: 2px 8px;
      border: 1px solid #3a3a3a;
      border-radius: 3px;
      background: transparent;
      color: #888;
      cursor: pointer;
      font-size: 10px;
      transition: all 0.15s ease;
    `;
    resetBtn.addEventListener('click', () => this.resetAll());
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.background = '#2a2a2a';
      resetBtn.style.color = '#fff';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.background = 'transparent';
      resetBtn.style.color = '#888';
    });
    header.appendChild(resetBtn);

    this.container.appendChild(header);

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
      color: #888;
      min-width: 40px;
    `;
    presetRow.appendChild(presetLabel);

    this.presetSelect = document.createElement('select');
    this.presetSelect.dataset.testid = 'curves-preset';
    this.presetSelect.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      background: #2a2a2a;
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
    this.container.appendChild(presetRow);

    // Create curve editor
    this.editor = new CurveEditor(initialCurves);
    this.container.appendChild(this.editor.render_element());

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

    const importBtn = document.createElement('button');
    importBtn.textContent = 'Import';
    importBtn.title = 'Import curves from JSON file';
    importBtn.dataset.testid = 'curves-import';
    importBtn.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #3a3a3a;
      border-radius: 3px;
      background: transparent;
      color: #888;
      cursor: pointer;
      font-size: 10px;
      transition: all 0.15s ease;
    `;
    importBtn.addEventListener('click', () => this.importCurves());
    importBtn.addEventListener('mouseenter', () => {
      importBtn.style.background = '#2a2a2a';
      importBtn.style.color = '#fff';
    });
    importBtn.addEventListener('mouseleave', () => {
      importBtn.style.background = 'transparent';
      importBtn.style.color = '#888';
    });
    ioRow.appendChild(importBtn);

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Export curves to JSON file';
    exportBtn.dataset.testid = 'curves-export';
    exportBtn.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #3a3a3a;
      border-radius: 3px;
      background: transparent;
      color: #888;
      cursor: pointer;
      font-size: 10px;
      transition: all 0.15s ease;
    `;
    exportBtn.addEventListener('click', () => this.exportCurves());
    exportBtn.addEventListener('mouseenter', () => {
      exportBtn.style.background = '#2a2a2a';
      exportBtn.style.color = '#fff';
    });
    exportBtn.addEventListener('mouseleave', () => {
      exportBtn.style.background = 'transparent';
      exportBtn.style.color = '#888';
    });
    ioRow.appendChild(exportBtn);

    this.container.appendChild(ioRow);
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
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'flex' : 'none';
    this.emit('visibilityChanged', this.visible);
  }

  /**
   * Show the panel
   */
  show(): void {
    if (!this.visible) {
      this.visible = true;
      this.container.style.display = 'flex';
      this.emit('visibilityChanged', true);
    }
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (this.visible) {
      this.visible = false;
      this.container.style.display = 'none';
      this.emit('visibilityChanged', false);
    }
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
   * Render the component
   */
  render(): HTMLElement {
    return this.container;
  }

  dispose(): void {
    this.editor.dispose();
  }
}
