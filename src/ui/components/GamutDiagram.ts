/**
 * GamutDiagram - CIE 1931 xy Chromaticity Diagram
 *
 * Displays the CIE horseshoe with gamut triangles for input/working/display
 * color spaces and a scatter plot of pixel chromaticity coordinates.
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import {
  createDraggableContainer,
  DraggableContainer,
} from './shared/DraggableContainer';
import { setupHiDPICanvas } from '../../utils/ui/HiDPICanvas';
import { getThemeManager } from '../../utils/ui/ThemeManager';
import { getCSSColor } from '../../utils/ui/getCSSColor';
import {
  CIE_1931_XY_LOCUS,
  getColorSpacePrimaries,
  getRGBToXYZMatrix,
  type ColorSpacePrimaries,
} from '../../color/CIE1931Data';
import { SRGB_TO_XYZ, srgbDecode } from '../../color/OCIOTransform';
import type { Matrix3x3 } from '../../color/OCIOTransform';

export interface GamutDiagramEvents extends EventMap {
  visibilityChanged: boolean;
}

const DIAGRAM_SIZE = 280;

// Coordinate mapping: x ∈ [0, 0.8] → canvas, y ∈ [0, 0.9] → canvas (y-flipped)
const X_MIN = 0;
const X_MAX = 0.8;
const Y_MIN = 0;
const Y_MAX = 0.9;
const MARGIN = 30;

export class GamutDiagram extends EventEmitter<GamutDiagramEvents> {
  private draggableContainer: DraggableContainer;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private visible = false;
  private dpr = 1;
  private lastImageData: ImageData | null = null;
  private lastFloatData: Float32Array | null = null;
  private lastFloatWidth = 0;
  private lastFloatHeight = 0;
  private boundOnThemeChange: (() => void) | null = null;

  // Color spaces for gamut triangles
  private inputColorSpace = 'sRGB';
  private workingColorSpace = 'ACEScg';
  private displayColorSpace = 'sRGB';

  // Cached horseshoe as an offscreen canvas with transparent background.
  // The horseshoe colors are physical constants (CIE chromaticity) that never
  // change with theme. Non-locus pixels have alpha=0 so the themed background
  // (drawn via fillRect in drawFull) shows through via drawImage compositing.
  // Invalidated only on canvas resize, NOT on theme changes.
  private horseshoeCanvas: HTMLCanvasElement | null = null;

  // Display matrix for HDR scatter
  private displayMatrix: Matrix3x3 = SRGB_TO_XYZ;

  constructor() {
    super();

    this.draggableContainer = createDraggableContainer({
      id: 'gamut-diagram',
      title: 'CIE Diagram',
      initialPosition: { bottom: '10px', left: '230px' },
      onClose: () => this.hide(),
    });

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display: block; background: var(--bg-primary);';

    this.ctx = this.canvas.getContext('2d')!;

    const result = setupHiDPICanvas({
      canvas: this.canvas,
      ctx: this.ctx,
      width: DIAGRAM_SIZE,
      height: DIAGRAM_SIZE,
    });
    this.dpr = result.dpr;

    this.draggableContainer.content.appendChild(this.canvas);

    // Defer horseshoe computation until first show() — the diagram starts hidden
    // and the computation is expensive (~300K pixels at 2x DPR).

    this.boundOnThemeChange = () => {
      // Horseshoe cache is theme-independent (transparent bg), no invalidation needed.
      // Only redraw graticule/triangles which use themed colors.
      if (this.visible) {
        this.drawFull();
      }
    };
    getThemeManager().on('themeChanged', this.boundOnThemeChange);
  }

  // ===========================================================================
  // Coordinate Mapping
  //
  // Two coordinate systems are used:
  // - Logical coordinates (0..DIAGRAM_SIZE): used by graticule, triangles, and
  //   all ctx.moveTo/lineTo/fillText calls. The DPR-scaled ctx.scale() transform
  //   automatically maps these to physical pixels.
  // - Physical coordinates (0..canvas.width): used by putImageData/getImageData
  //   which bypass the canvas transform. Scatter methods multiply logical coords
  //   by this.dpr to convert. The horseshoe uses drawImage with a reset transform.
  // ===========================================================================

  private xToCanvas(x: number): number {
    return MARGIN + ((x - X_MIN) / (X_MAX - X_MIN)) * (DIAGRAM_SIZE - 2 * MARGIN);
  }

  private yToCanvas(y: number): number {
    // y-flipped: higher y values go up
    return DIAGRAM_SIZE - MARGIN - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * (DIAGRAM_SIZE - 2 * MARGIN);
  }

  // ===========================================================================
  // Drawing Methods
  // ===========================================================================

  private drawFull(): void {
    const { ctx } = this;

    // Fill themed background — horseshoe composites on top with transparent bg
    ctx.fillStyle = getCSSColor('--bg-primary', '#111');
    ctx.fillRect(0, 0, DIAGRAM_SIZE, DIAGRAM_SIZE);

    this.drawHorseshoe();
    this.drawGraticule();
    this.drawGamutTriangles();
  }

  /**
   * Draw the CIE horseshoe filled with approximate sRGB colors.
   * Uses a cached offscreen canvas with transparent background for non-locus
   * pixels, composited via drawImage so the themed background shows through.
   */
  private drawHorseshoe(): void {
    if (!this.horseshoeCanvas) {
      this.horseshoeCanvas = this.computeHorseshoeCanvas();
    }
    // Draw cached horseshoe via drawImage. Reset the DPR transform so the
    // offscreen canvas (at physical pixel dimensions) maps 1:1.
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.horseshoeCanvas, 0, 0);
    this.ctx.restore();
  }

  private computeHorseshoeCanvas(): HTMLCanvasElement {
    const physW = this.canvas.width;
    const physH = this.canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = physW;
    offscreen.height = physH;
    const offCtx = offscreen.getContext('2d')!;

    const imageData = offCtx.createImageData(physW, physH);
    const pixels = imageData.data;

    // XYZ to sRGB matrix (hardcoded inverse for performance)
    const m = [
      3.2404542, -1.5371385, -0.4985314,
      -0.9692660, 1.8760108, 0.0415560,
      0.0556434, -0.2040259, 1.0572252,
    ];

    for (let py = 0; py < physH; py++) {
      for (let px = 0; px < physW; px++) {
        // Convert physical pixel to CIE xy
        const cx = X_MIN + ((px / this.dpr - MARGIN) / (DIAGRAM_SIZE - 2 * MARGIN)) * (X_MAX - X_MIN);
        const cy = Y_MAX - ((py / this.dpr - MARGIN) / (DIAGRAM_SIZE - 2 * MARGIN)) * (Y_MAX - Y_MIN);

        const idx = (py * physW + px) * 4;

        // Outside valid range or near y=0 singularity: transparent
        if (cx < 0 || cx > X_MAX || cy < 0 || cy > Y_MAX || cy < 1e-6) {
          // alpha=0 (transparent) — themed background shows through
          continue;
        }

        // Point-in-polygon test against spectral locus + line of purples
        if (!this.pointInLocus(cx, cy, CIE_1931_XY_LOCUS)) {
          // Outside locus: transparent
          continue;
        }

        // Convert xy to XYZ (assume Y=1)
        const X = cx / cy;
        const Y = 1;
        const Z = (1 - cx - cy) / cy;

        // XYZ to linear sRGB
        let lr = m[0]! * X + m[1]! * Y + m[2]! * Z;
        let lg = m[3]! * X + m[4]! * Y + m[5]! * Z;
        let lb = m[6]! * X + m[7]! * Y + m[8]! * Z;

        // Normalize to bring into gamut (preserve chromaticity)
        const maxVal = Math.max(lr, lg, lb, 1);
        lr /= maxVal;
        lg /= maxVal;
        lb /= maxVal;

        // sRGB gamma encode
        const gamma = (v: number): number => {
          v = Math.max(0, v);
          return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        };

        pixels[idx] = Math.round(Math.min(255, gamma(lr) * 255));
        pixels[idx + 1] = Math.round(Math.min(255, gamma(lg) * 255));
        pixels[idx + 2] = Math.round(Math.min(255, gamma(lb) * 255));
        pixels[idx + 3] = 255;
      }
    }

    offCtx.putImageData(imageData, 0, 0);
    return offscreen;
  }

  /**
   * Point-in-polygon test against spectral locus + line of purples
   */
  private pointInLocus(x: number, y: number, locus: ReadonlyArray<{ x: number; y: number }>): boolean {
    let inside = false;
    const n = locus.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = locus[i]!.x, yi = locus[i]!.y;
      const xj = locus[j]!.x, yj = locus[j]!.y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Draw grid lines and axis labels
   */
  private drawGraticule(): void {
    const { ctx } = this;
    const gridColor = getCSSColor('--border-secondary', 'rgba(100,100,100,0.3)');
    const textColor = getCSSColor('--text-muted', 'rgba(180,180,180,0.7)');

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;

    // Grid lines at 0.1 intervals
    for (let v = 0; v <= 0.8; v += 0.1) {
      const round = Math.round(v * 10) / 10;
      // Vertical lines (x)
      const cx = this.xToCanvas(round);
      ctx.beginPath();
      ctx.moveTo(cx, this.yToCanvas(Y_MIN));
      ctx.lineTo(cx, this.yToCanvas(Y_MAX));
      ctx.stroke();
    }
    for (let v = 0; v <= 0.9; v += 0.1) {
      const round = Math.round(v * 10) / 10;
      // Horizontal lines (y)
      const cy = this.yToCanvas(round);
      ctx.beginPath();
      ctx.moveTo(this.xToCanvas(X_MIN), cy);
      ctx.lineTo(this.xToCanvas(X_MAX), cy);
      ctx.stroke();
    }

    // Axis labels
    ctx.font = '8px sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = 0; v <= 0.8; v += 0.2) {
      const round = Math.round(v * 10) / 10;
      ctx.fillText(round.toFixed(1), this.xToCanvas(round), this.yToCanvas(Y_MIN) + 4);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= 0.8; v += 0.2) {
      const round = Math.round(v * 10) / 10;
      ctx.fillText(round.toFixed(1), this.xToCanvas(X_MIN) - 4, this.yToCanvas(round));
    }

    // Title label
    ctx.font = '9px sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('CIE 1931', DIAGRAM_SIZE / 2, MARGIN - 4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('x', DIAGRAM_SIZE / 2, DIAGRAM_SIZE - 8);
    ctx.save();
    ctx.translate(8, DIAGRAM_SIZE / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('y', 0, 0);
    ctx.restore();
  }

  /**
   * Draw gamut triangles for input/working/display color spaces
   */
  private drawGamutTriangles(): void {
    const inputPrimaries = getColorSpacePrimaries(this.inputColorSpace);
    const workingPrimaries = getColorSpacePrimaries(this.workingColorSpace);
    const displayPrimaries = getColorSpacePrimaries(this.displayColorSpace);

    if (inputPrimaries) {
      this.drawGamutTriangle(inputPrimaries, 'rgba(0, 200, 255, 0.7)', [6, 4]);
    }
    if (workingPrimaries && workingPrimaries.name !== inputPrimaries?.name) {
      this.drawGamutTriangle(workingPrimaries, 'rgba(255, 200, 0, 0.7)', [3, 3]);
    }
    if (displayPrimaries && displayPrimaries.name !== inputPrimaries?.name) {
      this.drawGamutTriangle(displayPrimaries, 'rgba(255, 255, 255, 0.8)', []);
    }
  }

  private drawGamutTriangle(
    primaries: ColorSpacePrimaries,
    color: string,
    dashPattern: number[]
  ): void {
    const { ctx } = this;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dashPattern);

    ctx.beginPath();
    ctx.moveTo(this.xToCanvas(primaries.red.x), this.yToCanvas(primaries.red.y));
    ctx.lineTo(this.xToCanvas(primaries.green.x), this.yToCanvas(primaries.green.y));
    ctx.lineTo(this.xToCanvas(primaries.blue.x), this.yToCanvas(primaries.blue.y));
    ctx.closePath();
    ctx.stroke();

    ctx.setLineDash([]);

    // White point marker
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      this.xToCanvas(primaries.white.x),
      this.yToCanvas(primaries.white.y),
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  /**
   * Draw pixel scatter from ImageData (SDR path).
   * Linearizes sRGB before converting to XYZ.
   */
  private drawPixelScatter(imageData: ImageData): void {
    const { data, width, height } = imageData;
    const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height / 8000)));

    // Scatter operates in physical pixel coordinates via getImageData/putImageData
    // which bypass the DPR canvas transform. Logical coords are multiplied by dpr.
    const physW = this.canvas.width;
    const physH = this.canvas.height;
    const plotData = this.ctx.getImageData(0, 0, physW, physH);
    const pixels = plotData.data;

    const m = SRGB_TO_XYZ;

    for (let srcY = 0; srcY < height; srcY += sampleStep) {
      for (let srcX = 0; srcX < width; srcX += sampleStep) {
        const i = (srcY * width + srcX) * 4;
        // Linearize sRGB
        const lr = srgbDecode(data[i]! / 255);
        const lg = srgbDecode(data[i + 1]! / 255);
        const lb = srgbDecode(data[i + 2]! / 255);

        // RGB to XYZ
        const X = m[0] * lr + m[1] * lg + m[2] * lb;
        const Y = m[3] * lr + m[4] * lg + m[5] * lb;
        const Z = m[6] * lr + m[7] * lg + m[8] * lb;

        const sum = X + Y + Z;
        if (!(sum > 1e-10)) continue; // Catches negative sums and NaN

        const cx = X / sum;
        const cy = Y / sum;

        // Map to physical pixels
        const px = Math.floor(this.xToCanvas(cx) * this.dpr);
        const py = Math.floor(this.yToCanvas(cy) * this.dpr);

        if (px >= 0 && px < physW && py >= 0 && py < physH) {
          const idx = (py * physW + px) * 4;
          pixels[idx] = Math.min(255, (pixels[idx] || 0) + 40);
          pixels[idx + 1] = Math.min(255, (pixels[idx + 1] || 0) + 40);
          pixels[idx + 2] = Math.min(255, (pixels[idx + 2] || 0) + 40);
          pixels[idx + 3] = 255;
        }
      }
    }

    this.ctx.putImageData(plotData, 0, 0);
  }

  /**
   * Draw pixel scatter from Float32Array (HDR path).
   * Uses the display matrix matching the current display color space.
   */
  private drawPixelScatterFloat(data: Float32Array, width: number, height: number): void {
    const sampleStep = Math.max(1, Math.floor(Math.sqrt(width * height / 8000)));

    const physW = this.canvas.width;
    const physH = this.canvas.height;
    const plotData = this.ctx.getImageData(0, 0, physW, physH);
    const pixels = plotData.data;

    const m = this.displayMatrix;

    for (let srcY = 0; srcY < height; srcY += sampleStep) {
      for (let srcX = 0; srcX < width; srcX += sampleStep) {
        const i = (srcY * width + srcX) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;

        // Skip invalid values
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) continue;

        // RGB to XYZ
        const X = m[0] * r + m[1] * g + m[2] * b;
        const Y = m[3] * r + m[4] * g + m[5] * b;
        const Z = m[6] * r + m[7] * g + m[8] * b;

        const sum = X + Y + Z;
        if (!(sum > 1e-10)) continue; // Catches negative sums and NaN

        const cx = X / sum;
        const cy = Y / sum;

        // Map to physical pixels
        const px = Math.floor(this.xToCanvas(cx) * this.dpr);
        const py = Math.floor(this.yToCanvas(cy) * this.dpr);

        if (px >= 0 && px < physW && py >= 0 && py < physH) {
          const idx = (py * physW + px) * 4;
          pixels[idx] = Math.min(255, (pixels[idx] || 0) + 40);
          pixels[idx + 1] = Math.min(255, (pixels[idx + 1] || 0) + 40);
          pixels[idx + 2] = Math.min(255, (pixels[idx + 2] || 0) + 40);
          pixels[idx + 3] = 255;
        }
      }
    }

    this.ctx.putImageData(plotData, 0, 0);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Update with SDR ImageData. Linearizes sRGB before conversion.
   */
  update(imageData: ImageData): void {
    this.lastImageData = imageData;
    this.lastFloatData = null;
    this.drawFull();
    this.drawPixelScatter(imageData);
  }

  /**
   * Update with HDR float data. Uses the active display matrix.
   */
  updateFloat(data: Float32Array, width: number, height: number): void {
    this.lastFloatData = data;
    this.lastFloatWidth = width;
    this.lastFloatHeight = height;
    this.lastImageData = null;
    this.drawFull();
    this.drawPixelScatterFloat(data, width, height);
  }

  /**
   * Set color spaces for gamut triangle display.
   * Also updates the display matrix used for HDR scatter.
   */
  setColorSpaces(input: string, working: string, display: string): void {
    this.inputColorSpace = input;
    this.workingColorSpace = working;
    this.displayColorSpace = display;

    // Update display matrix for HDR scatter
    this.displayMatrix = getRGBToXYZMatrix(display) ?? SRGB_TO_XYZ;

    // Redraw if we have data
    if (this.lastImageData) {
      this.update(this.lastImageData);
    } else if (this.lastFloatData) {
      this.updateFloat(this.lastFloatData, this.lastFloatWidth, this.lastFloatHeight);
    } else {
      this.drawFull();
    }
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.draggableContainer.show();
    // Draw on first show (horseshoe computation deferred from constructor)
    this.drawFull();
    this.emit('visibilityChanged', true);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.draggableContainer.hide();
    // Release large pixel buffers when hidden to reduce memory pressure.
    // New data will arrive via update()/updateFloat() when shown again.
    this.lastImageData = null;
    this.lastFloatData = null;
    this.emit('visibilityChanged', false);
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  render(): HTMLElement {
    return this.draggableContainer.element;
  }

  dispose(): void {
    if (this.boundOnThemeChange) {
      getThemeManager().off('themeChanged', this.boundOnThemeChange);
    }
    this.boundOnThemeChange = null;
    this.horseshoeCanvas = null;
    this.lastImageData = null;
    this.lastFloatData = null;
    this.draggableContainer.dispose();
  }
}
