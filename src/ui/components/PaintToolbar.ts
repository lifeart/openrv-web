import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { BrushType } from '../../paint/types';
import { showConfirm } from './shared/Modal';
import { getIconSvg, IconName } from './shared/Icons';

export class PaintToolbar {
  private container: HTMLElement;
  private paintEngine: PaintEngine;
  private buttons: Map<PaintTool, HTMLButtonElement> = new Map();
  private colorPicker!: HTMLInputElement;
  private widthSlider!: HTMLInputElement;
  private widthLabel!: HTMLSpanElement;
  private brushButton!: HTMLButtonElement;
  private ghostButton!: HTMLButtonElement;

  constructor(paintEngine: PaintEngine) {
    this.paintEngine = paintEngine;

    this.container = document.createElement('div');
    this.container.className = 'paint-toolbar';
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    this.createControls();
    this.bindEvents();
  }

  private createControls(): void {
    // Tool buttons
    this.createToolButton('none', 'hand', 'Pan tool (V)');
    this.createToolButton('pen', 'pencil', 'Pen tool (P)');
    this.createToolButton('eraser', 'eraser', 'Eraser (E)');
    this.createToolButton('text', 'type', 'Text tool (T)');

    this.addSeparator();

    // Brush settings group: brush type, color, width
    this.brushButton = this.createIconButton('circle', 'Toggle soft/hard brush (B)', () => {
      this.paintEngine.brush = this.paintEngine.brush === BrushType.Circle
        ? BrushType.Gaussian
        : BrushType.Circle;
    });

    // Color picker
    this.colorPicker = document.createElement('input');
    this.colorPicker.type = 'color';
    this.colorPicker.value = this.rgbaToHex(this.paintEngine.color);
    this.colorPicker.title = 'Stroke color';
    this.colorPicker.style.cssText = `
      width: 24px;
      height: 24px;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      padding: 2px;
      cursor: pointer;
      background: #2a2a2a;
      margin-left: 4px;
    `;
    this.colorPicker.addEventListener('input', () => {
      this.paintEngine.color = this.hexToRgba(this.colorPicker.value);
    });
    this.container.appendChild(this.colorPicker);

    // Preset colors
    const presetColors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ffffff', '#000000'];
    for (const color of presetColors) {
      const preset = document.createElement('button');
      preset.style.cssText = `
        width: 16px;
        height: 16px;
        border: 1px solid #3a3a3a;
        border-radius: 3px;
        padding: 0;
        cursor: pointer;
        background: ${color};
        transition: all 0.12s ease;
      `;
      preset.title = color;
      preset.addEventListener('mouseenter', () => {
        preset.style.borderColor = '#555';
      });
      preset.addEventListener('mouseleave', () => {
        preset.style.borderColor = '#3a3a3a';
      });
      preset.addEventListener('click', () => {
        this.colorPicker.value = color;
        this.paintEngine.color = this.hexToRgba(color);
      });
      this.container.appendChild(preset);
    }

    // Width slider
    this.widthLabel = document.createElement('span');
    this.widthLabel.textContent = `${this.paintEngine.width}`;
    this.widthLabel.style.cssText = 'color: #888; font-size: 10px; min-width: 20px; text-align: right; margin-left: 8px;';
    this.container.appendChild(this.widthLabel);

    this.widthSlider = document.createElement('input');
    this.widthSlider.type = 'range';
    this.widthSlider.min = '1';
    this.widthSlider.max = '50';
    this.widthSlider.value = String(this.paintEngine.width);
    this.widthSlider.title = 'Stroke width';
    this.widthSlider.style.cssText = `
      width: 60px;
      height: 4px;
      cursor: pointer;
      accent-color: #4a9eff;
    `;
    this.widthSlider.addEventListener('input', () => {
      this.paintEngine.width = parseInt(this.widthSlider.value, 10);
      this.widthLabel.textContent = `${this.paintEngine.width}`;
    });
    this.container.appendChild(this.widthSlider);

    this.addSeparator();

    // Actions group: ghost, undo, redo, clear
    this.ghostButton = this.createIconButton('ghost', 'Toggle ghost mode (G)', () => {
      const effects = this.paintEngine.effects;
      this.paintEngine.setGhostMode(!effects.ghost, effects.ghostBefore, effects.ghostAfter);
    });

    this.createIconButton('undo', 'Undo (Ctrl+Z)', () => this.paintEngine.undo());
    this.createIconButton('redo', 'Redo (Ctrl+Y)', () => this.paintEngine.redo());

    this.createIconButton('trash', 'Clear frame annotations', async () => {
      const confirmed = await showConfirm('Clear all annotations on this frame?', {
        title: 'Clear Annotations',
        confirmText: 'Clear',
        confirmVariant: 'danger'
      });
      if (confirmed) {
        this.container.dispatchEvent(new CustomEvent('clearFrame'));
      }
    });

    // Update initial button state
    this.updateToolButtons();
  }

  private createToolButton(tool: PaintTool, icon: IconName, title: string): void {
    const btn = this.createIconButton(icon, title, () => {
      this.paintEngine.tool = tool;
      this.updateToolButtons();
    });
    this.buttons.set(tool, btn);
  }

  private createIconButton(icon: IconName, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.innerHTML = getIconSvg(icon, 'sm');
    button.title = title;
    button.style.cssText = `
      background: transparent;
      border: 1px solid transparent;
      color: #999;
      padding: 4px;
      border-radius: 4px;
      cursor: pointer;
      width: 26px;
      height: 26px;
      transition: all 0.12s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    `;

    button.addEventListener('mouseenter', () => {
      if (!button.classList.contains('active')) {
        button.style.background = '#3a3a3a';
        button.style.borderColor = '#4a4a4a';
        button.style.color = '#ccc';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!button.classList.contains('active')) {
        button.style.background = 'transparent';
        button.style.borderColor = 'transparent';
        button.style.color = '#999';
      }
    });

    button.addEventListener('click', onClick);
    this.container.appendChild(button);
    return button;
  }

  private addSeparator(): void {
    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 18px; background: #3a3a3a; margin: 0 2px;';
    this.container.appendChild(sep);
  }

  private updateToolButtons(): void {
    const currentTool = this.paintEngine.tool;
    for (const [tool, btn] of this.buttons) {
      if (tool === currentTool) {
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
  }

  private bindEvents(): void {
    this.paintEngine.on('toolChanged', () => this.updateToolButtons());
    this.paintEngine.on('brushChanged', () => this.updateBrushButton());
    this.paintEngine.on('effectsChanged', () => this.updateGhostButton());
  }

  private updateBrushButton(): void {
    const isGaussian = this.paintEngine.brush === BrushType.Gaussian;
    this.brushButton.innerHTML = getIconSvg(isGaussian ? 'blur' : 'circle', 'sm');
    this.brushButton.title = isGaussian
      ? 'Soft brush (click for hard) (B)'
      : 'Hard brush (click for soft) (B)';
  }

  private updateGhostButton(): void {
    const effects = this.paintEngine.effects;
    this.ghostButton.style.opacity = effects.ghost ? '1' : '0.5';
    this.ghostButton.style.color = effects.ghost ? '#4a9eff' : '#999';
    this.ghostButton.title = effects.ghost
      ? 'Ghost mode ON (G)'
      : 'Ghost mode OFF (G)';
  }

  private rgbaToHex(rgba: [number, number, number, number]): string {
    const r = Math.round(rgba[0] * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgba[1] * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgba[2] * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  private hexToRgba(hex: string): [number, number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b, 1];
  }

  render(): HTMLElement {
    this.updateBrushButton();
    this.updateGhostButton();
    return this.container;
  }

  handleKeyboard(key: string): boolean {
    switch (key.toLowerCase()) {
      case 'v':
        this.paintEngine.tool = 'none';
        return true;
      case 'p':
        this.paintEngine.tool = 'pen';
        return true;
      case 'e':
        this.paintEngine.tool = 'eraser';
        return true;
      case 't':
        this.paintEngine.tool = 'text';
        return true;
      case 'b':
        this.paintEngine.brush = this.paintEngine.brush === BrushType.Circle
          ? BrushType.Gaussian
          : BrushType.Circle;
        return true;
      case 'g':
        const effects = this.paintEngine.effects;
        this.paintEngine.setGhostMode(!effects.ghost);
        return true;
      default:
        return false;
    }
  }

  dispose(): void {
    // Cleanup if needed
  }
}
