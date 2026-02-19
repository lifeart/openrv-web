/**
 * MiniHistogram - Compact histogram canvas for embedding in panel.
 *
 * Renders a simplified histogram using the same HistogramData format
 * as the full Histogram component. Supports RGB/Luminance modes.
 */

import type { HistogramData } from '../../components/Histogram';
import type { ScopesControl } from '../../components/ScopesControl';

const MINI_WIDTH = 256;
const MINI_HEIGHT = 80;
const BINS = 256;

type MiniHistogramMode = 'rgb' | 'luminance';

export class MiniHistogram {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private placeholder: HTMLElement;
  private modeButton: HTMLButtonElement;
  private mode: MiniHistogramMode = 'rgb';
  private data: HistogramData | null = null;
  private scopesControl: ScopesControl;

  constructor(scopesControl: ScopesControl) {
    this.scopesControl = scopesControl;

    this.container = document.createElement('div');
    this.container.className = 'mini-histogram';
    this.container.dataset.testid = 'mini-histogram';
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    // Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = MINI_WIDTH;
    this.canvas.height = MINI_HEIGHT;
    this.canvas.style.cssText = `
      width: 100%;
      height: ${MINI_HEIGHT}px;
      background: var(--bg-primary);
      border-radius: 3px;
      cursor: pointer;
      display: block;
    `;
    this.canvas.title = 'Click to open full Histogram';
    this.ctx = this.canvas.getContext('2d')!;

    // Click to open full histogram overlay
    this.canvas.addEventListener('click', () => {
      this.scopesControl.toggleScope('histogram');
    });

    // Placeholder
    this.placeholder = document.createElement('div');
    this.placeholder.style.cssText = `
      width: 100%;
      height: ${MINI_HEIGHT}px;
      background: var(--bg-primary);
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 10px;
    `;
    this.placeholder.textContent = 'Open or drop a file';

    // Mode toggle
    this.modeButton = document.createElement('button');
    this.modeButton.dataset.testid = 'mini-histogram-mode';
    this.modeButton.textContent = 'RGB';
    this.modeButton.style.cssText = `
      background: transparent;
      border: 1px solid var(--border-primary);
      color: var(--text-secondary);
      padding: 2px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
      align-self: flex-start;
    `;
    this.modeButton.addEventListener('click', () => this.cycleMode());

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.placeholder);
    this.container.appendChild(this.modeButton);

    // Initial state: show placeholder, hide canvas
    this.canvas.style.display = 'none';
    this.placeholder.style.display = 'flex';
  }

  update(data: HistogramData): void {
    this.data = data;

    // Visibility guard: skip render when hidden via CSS display:none
    // (offsetParent is null in jsdom, so also check style.display)
    if (this.container.style.display === 'none') return;

    this.placeholder.style.display = 'none';
    this.canvas.style.display = 'block';
    this.draw();
  }

  private cycleMode(): void {
    this.mode = this.mode === 'rgb' ? 'luminance' : 'rgb';
    this.modeButton.textContent = this.mode === 'rgb' ? 'RGB' : 'Luma';
    if (this.data) this.draw();
  }

  private draw(): void {
    if (!this.data) return;

    const { ctx } = this;
    const { red, green, blue, luminance, maxValue } = this.data;

    ctx.clearRect(0, 0, MINI_WIDTH, MINI_HEIGHT);
    if (maxValue === 0) return;

    const normalize = (v: number) => v / maxValue;

    if (this.mode === 'luminance') {
      ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
      for (let i = 0; i < BINS; i++) {
        const h = normalize(luminance[i]!) * MINI_HEIGHT;
        ctx.fillRect(i, MINI_HEIGHT - h, 1, h);
      }
    } else {
      // RGB superimposed
      ctx.globalCompositeOperation = 'lighter';

      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      for (let i = 0; i < BINS; i++) {
        const h = normalize(red[i]!) * MINI_HEIGHT;
        ctx.fillRect(i, MINI_HEIGHT - h, 1, h);
      }

      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      for (let i = 0; i < BINS; i++) {
        const h = normalize(green[i]!) * MINI_HEIGHT;
        ctx.fillRect(i, MINI_HEIGHT - h, 1, h);
      }

      ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
      for (let i = 0; i < BINS; i++) {
        const h = normalize(blue[i]!) * MINI_HEIGHT;
        ctx.fillRect(i, MINI_HEIGHT - h, 1, h);
      }

      ctx.globalCompositeOperation = 'source-over';
    }
  }

  getElement(): HTMLElement {
    return this.container;
  }

  getData(): HistogramData | null {
    return this.data;
  }

  getMode(): MiniHistogramMode {
    return this.mode;
  }

  dispose(): void {
    this.container.remove();
  }
}
