import { PaintEngine, PaintTool } from '../../paint/PaintEngine';
import { BrushType, type AnnotationVersion } from '../../paint/types';
import { showConfirm } from './shared/Modal';
import { getIconSvg, IconName } from './shared/Icons';
import { createIconButton as sharedCreateIconButton, setButtonActive } from './shared/Button';

export class PaintToolbar {
  private container: HTMLElement;
  private paintEngine: PaintEngine;
  private buttons: Map<PaintTool, HTMLButtonElement> = new Map();
  private colorPicker!: HTMLInputElement;
  private opacitySlider!: HTMLInputElement;
  private opacityLabel!: HTMLSpanElement;
  private _opacity: number = 1;
  private widthSlider!: HTMLInputElement;
  private widthLabel!: HTMLSpanElement;
  private brushButton!: HTMLButtonElement;
  private ghostButton!: HTMLButtonElement;
  private holdButton!: HTMLButtonElement;
  private versionSelect!: HTMLSelectElement;

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

    // Shape tool buttons
    this.createToolButton('rectangle', 'box', 'Rectangle shape (R)');
    this.createToolButton('ellipse', 'circle', 'Ellipse shape (O)');
    this.createToolButton('line', 'minus', 'Line shape (L)');
    this.createToolButton('arrow', 'arrow-right', 'Arrow shape (A)');

    this.addSeparator();

    // Advanced paint tools (pixel-destructive)
    this.createToolButton('dodge', 'sun', 'Dodge tool (D) \u2013 Lighten pixels under the brush');
    this.createToolButton('burn', 'moon', 'Burn tool (U) \u2013 Darken pixels under the brush');
    this.createToolButton('clone', 'copy', 'Clone stamp (C) \u2013 Alt-click to set source, then paint to copy pixels');
    this.createToolButton('smudge', 'droplet', 'Smudge tool (M) \u2013 Drag to blend and smear pixels');

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
      border: 1px solid var(--bg-hover);
      border-radius: 4px;
      padding: 2px;
      cursor: pointer;
      background: var(--bg-secondary);
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
        border: 1px solid var(--bg-hover);
        border-radius: 3px;
        padding: 0;
        cursor: pointer;
        background: ${color};
        transition: all 0.12s ease;
      `;
      preset.title = color;
      preset.addEventListener('mouseenter', () => {
        preset.style.borderColor = 'var(--border-secondary)';
      });
      preset.addEventListener('mouseleave', () => {
        preset.style.borderColor = 'var(--bg-hover)';
      });
      preset.addEventListener('click', () => {
        this.colorPicker.value = color;
        this.paintEngine.color = this.hexToRgba(color);
      });
      this.container.appendChild(preset);
    }

    // Opacity slider
    this.opacityLabel = document.createElement('span');
    this.opacityLabel.dataset.testid = 'paint-opacity-label';
    this.opacityLabel.textContent = '100%';
    this.opacityLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px; min-width: 28px; text-align: right; margin-left: 8px;';
    this.container.appendChild(this.opacityLabel);

    this.opacitySlider = document.createElement('input');
    this.opacitySlider.type = 'range';
    this.opacitySlider.min = '0';
    this.opacitySlider.max = '100';
    this.opacitySlider.value = '100';
    this.opacitySlider.title = 'Stroke opacity';
    this.opacitySlider.dataset.testid = 'paint-opacity-slider';
    this.opacitySlider.style.cssText = `
      width: 60px;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;
    this.opacitySlider.addEventListener('input', () => {
      const percent = parseInt(this.opacitySlider.value, 10);
      this._opacity = percent / 100;
      this.opacityLabel.textContent = `${percent}%`;
      this.paintEngine.color = this.hexToRgba(this.colorPicker.value);
    });
    this.container.appendChild(this.opacitySlider);

    // Width slider
    this.widthLabel = document.createElement('span');
    this.widthLabel.textContent = `${this.paintEngine.width}`;
    this.widthLabel.style.cssText = 'color: var(--text-secondary); font-size: 10px; min-width: 20px; text-align: right; margin-left: 8px;';
    this.container.appendChild(this.widthLabel);

    this.widthSlider = document.createElement('input');
    this.widthSlider.type = 'range';
    this.widthSlider.min = '1';
    this.widthSlider.max = '50';
    this.widthSlider.value = String(this.paintEngine.width);
    this.widthSlider.title = 'Stroke width';
    this.widthSlider.dataset.testid = 'paint-width-slider';
    this.widthSlider.style.cssText = `
      width: 60px;
      height: 4px;
      cursor: pointer;
      accent-color: var(--accent-primary);
    `;
    this.widthSlider.addEventListener('input', () => {
      this.paintEngine.width = parseInt(this.widthSlider.value, 10);
      this.widthLabel.textContent = `${this.paintEngine.width}`;
    });
    this.container.appendChild(this.widthSlider);

    this.addSeparator();

    // Actions group: ghost, hold, undo, redo, clear
    this.ghostButton = this.createIconButton('ghost', 'Toggle ghost mode (G)', () => {
      const effects = this.paintEngine.effects;
      this.paintEngine.setGhostMode(!effects.ghost, effects.ghostBefore, effects.ghostAfter);
    });

    this.holdButton = this.createIconButton('lock', 'Toggle hold mode (X)', () => {
      const effects = this.paintEngine.effects;
      this.paintEngine.setHoldMode(!effects.hold);
    });

    // Version filter for A/B compare annotations
    this.versionSelect = document.createElement('select');
    this.versionSelect.dataset.testid = 'paint-version-select';
    this.versionSelect.title = 'Annotation version (A/B compare)';
    this.versionSelect.style.cssText = `
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      color: var(--text-primary);
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      height: 24px;
    `;
    for (const [value, label] of [['all', 'All'], ['A', 'A'], ['B', 'B']] as const) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      this.versionSelect.appendChild(opt);
    }
    this.versionSelect.addEventListener('change', () => {
      this.paintEngine.annotationVersion = this.versionSelect.value as AnnotationVersion;
    });
    this.container.appendChild(this.versionSelect);

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
    btn.dataset.testid = `paint-tool-${tool}`;
    this.buttons.set(tool, btn);
  }

  private createIconButton(icon: IconName, title: string, onClick: () => void): HTMLButtonElement {
    const button = sharedCreateIconButton(getIconSvg(icon, 'sm'), onClick, {
      variant: 'icon',
      size: 'sm',
      title,
    });
    this.container.appendChild(button);
    return button;
  }

  private addSeparator(): void {
    const sep = document.createElement('div');
    sep.style.cssText = 'width: 1px; height: 18px; background: var(--bg-hover); margin: 0 2px;';
    this.container.appendChild(sep);
  }

  private updateToolButtons(): void {
    const currentTool = this.paintEngine.tool;
    for (const [tool, btn] of this.buttons) {
      setButtonActive(btn, tool === currentTool, 'icon');
    }
  }

  private bindEvents(): void {
    this.paintEngine.on('toolChanged', () => this.updateToolButtons());
    this.paintEngine.on('brushChanged', () => this.updateBrushButton());
    this.paintEngine.on('effectsChanged', () => {
      this.updateGhostButton();
      this.updateHoldButton();
    });
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
    this.ghostButton.style.color = effects.ghost ? 'var(--accent-primary)' : 'var(--text-muted)';
    this.ghostButton.title = effects.ghost
      ? 'Ghost mode ON (G)'
      : 'Ghost mode OFF (G)';
  }

  private updateHoldButton(): void {
    const effects = this.paintEngine.effects;
    this.holdButton.style.opacity = effects.hold ? '1' : '0.5';
    this.holdButton.style.color = effects.hold ? 'var(--accent-primary)' : 'var(--text-muted)';
    this.holdButton.title = effects.hold
      ? 'Hold mode ON (X)'
      : 'Hold mode OFF (X)';
  }

  /**
   * Set the annotation version from external A/B switching.
   * Updates both the select UI and the paint engine.
   */
  setAnnotationVersion(version: AnnotationVersion): void {
    this.versionSelect.value = version;
    this.paintEngine.annotationVersion = version;
  }

  getAnnotationVersion(): AnnotationVersion {
    return this.paintEngine.annotationVersion;
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
    return [r, g, b, this._opacity];
  }

  render(): HTMLElement {
    this.updateBrushButton();
    this.updateGhostButton();
    this.updateHoldButton();
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
      case 'r':
        this.paintEngine.tool = 'rectangle';
        return true;
      case 'o':
        this.paintEngine.tool = 'ellipse';
        return true;
      case 'l':
        this.paintEngine.tool = 'line';
        return true;
      case 'a':
        this.paintEngine.tool = 'arrow';
        return true;
      case 'd':
        this.paintEngine.tool = 'dodge';
        return true;
      case 'u':
        this.paintEngine.tool = 'burn';
        return true;
      case 'c':
        this.paintEngine.tool = 'clone';
        return true;
      case 'm':
        this.paintEngine.tool = 'smudge';
        return true;
      case 'b':
        this.paintEngine.brush = this.paintEngine.brush === BrushType.Circle
          ? BrushType.Gaussian
          : BrushType.Circle;
        return true;
      case 'g': {
        const effects = this.paintEngine.effects;
        this.paintEngine.setGhostMode(!effects.ghost);
        return true;
      }
      case 'x': {
        const effects = this.paintEngine.effects;
        this.paintEngine.setHoldMode(!effects.hold);
        return true;
      }
      default:
        return false;
    }
  }

  dispose(): void {
    // Cleanup if needed
  }
}
