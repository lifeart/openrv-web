import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { BrushType } from '../../paint/types';

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
      gap: 6px;
      padding: 0 8px;
      background: #333;
      border-left: 1px solid #444;
      margin-left: 8px;
    `;

    this.createControls();
    this.bindEvents();
  }

  private createControls(): void {
    // Label
    const label = document.createElement('span');
    label.textContent = 'Paint:';
    label.style.cssText = 'color: #888; font-size: 11px; margin-right: 4px;';
    this.container.appendChild(label);

    // Tool buttons
    this.createToolButton('none', '🖐', 'Pan tool (V)');
    this.createToolButton('pen', '✏️', 'Pen tool (P)');
    this.createToolButton('eraser', '🧹', 'Eraser (E)');
    this.createToolButton('text', 'T', 'Text tool (T)');

    this.addSeparator();

    // Brush type toggle
    this.brushButton = this.createButton('⚫', 'Toggle soft/hard brush (B)', () => {
      this.paintEngine.brush = this.paintEngine.brush === BrushType.Circle
        ? BrushType.Gaussian
        : BrushType.Circle;
    });

    this.addSeparator();

    // Color picker
    this.colorPicker = document.createElement('input');
    this.colorPicker.type = 'color';
    this.colorPicker.value = this.rgbaToHex(this.paintEngine.color);
    this.colorPicker.title = 'Stroke color';
    this.colorPicker.style.cssText = `
      width: 28px;
      height: 24px;
      border: 1px solid #555;
      border-radius: 3px;
      padding: 0;
      cursor: pointer;
      background: transparent;
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
        width: 18px;
        height: 18px;
        border: 1px solid #555;
        border-radius: 2px;
        padding: 0;
        cursor: pointer;
        background: ${color};
      `;
      preset.title = color;
      preset.addEventListener('click', () => {
        this.colorPicker.value = color;
        this.paintEngine.color = this.hexToRgba(color);
      });
      this.container.appendChild(preset);
    }

    this.addSeparator();

    // Width slider
    this.widthLabel = document.createElement('span');
    this.widthLabel.textContent = `${this.paintEngine.width}px`;
    this.widthLabel.style.cssText = 'color: #aaa; font-size: 11px; min-width: 32px;';
    this.container.appendChild(this.widthLabel);

    this.widthSlider = document.createElement('input');
    this.widthSlider.type = 'range';
    this.widthSlider.min = '1';
    this.widthSlider.max = '50';
    this.widthSlider.value = String(this.paintEngine.width);
    this.widthSlider.title = 'Stroke width';
    this.widthSlider.style.cssText = 'width: 80px; cursor: pointer;';
    this.widthSlider.addEventListener('input', () => {
      this.paintEngine.width = parseInt(this.widthSlider.value, 10);
      this.widthLabel.textContent = `${this.paintEngine.width}px`;
    });
    this.container.appendChild(this.widthSlider);

    this.addSeparator();

    // Ghost mode toggle
    this.ghostButton = this.createButton('👻', 'Toggle ghost mode (G)', () => {
      const effects = this.paintEngine.effects;
      this.paintEngine.setGhostMode(!effects.ghost, effects.ghostBefore, effects.ghostAfter);
    });

    // Undo/Redo
    this.addSeparator();
    this.createButton('↩️', 'Undo (Ctrl+Z)', () => this.paintEngine.undo());
    this.createButton('↪️', 'Redo (Ctrl+Y)', () => this.paintEngine.redo());

    // Clear frame
    this.createButton('🗑', 'Clear frame annotations', () => {
      if (confirm('Clear all annotations on this frame?')) {
        // We need access to session for this - handled in App
        this.container.dispatchEvent(new CustomEvent('clearFrame'));
      }
    });

    // Update initial button state
    this.updateToolButtons();
  }

  private createToolButton(tool: PaintTool, icon: string, title: string): void {
    const btn = this.createButton(icon, title, () => {
      this.paintEngine.tool = tool;
      this.updateToolButtons();
    });
    this.buttons.set(tool, btn);
  }

  private createButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title;
    button.style.cssText = `
      background: #444;
      border: 1px solid #555;
      color: #ddd;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      min-width: 28px;
      transition: all 0.15s ease;
    `;

    button.addEventListener('mouseenter', () => {
      if (!button.classList.contains('active')) {
        button.style.background = '#555';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!button.classList.contains('active')) {
        button.style.background = '#444';
      }
    });

    button.addEventListener('click', onClick);
    this.container.appendChild(button);
    return button;
  }

  private addSeparator(): void {
    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 20px; background: #444; margin: 0 4px;';
    this.container.appendChild(sep);
  }

  private updateToolButtons(): void {
    const currentTool = this.paintEngine.tool;
    for (const [tool, btn] of this.buttons) {
      if (tool === currentTool) {
        btn.style.background = '#4a9eff';
        btn.style.borderColor = '#5aafff';
        btn.classList.add('active');
      } else {
        btn.style.background = '#444';
        btn.style.borderColor = '#555';
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
    this.brushButton.textContent = isGaussian ? '🔵' : '⚫';
    this.brushButton.title = isGaussian
      ? 'Soft brush (click for hard) (B)'
      : 'Hard brush (click for soft) (B)';
  }

  private updateGhostButton(): void {
    const effects = this.paintEngine.effects;
    this.ghostButton.style.opacity = effects.ghost ? '1' : '0.5';
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

  // Handle keyboard shortcuts
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
