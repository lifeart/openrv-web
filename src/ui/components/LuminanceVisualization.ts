/**
 * LuminanceVisualization - Advanced luminance visualization modes
 *
 * Provides multiple luminance analysis modes:
 * - HSV Visualization: Maps luminance to HSV color wheel for perceptual analysis
 * - Random Colorization: Assigns distinct random colors to luminance bands
 * - Contour Visualization: Renders iso-luminance contour lines
 * - False Color: Delegates to existing FalseColor component
 *
 * Rec. 709 luminance coefficients: R=0.2126, G=0.7152, B=0.0722
 */

import { EventEmitter, EventMap } from '../../utils/EventEmitter';
import { FalseColor } from './FalseColor';

export type LuminanceVisMode = 'off' | 'false-color' | 'hsv' | 'random-color' | 'contour';

export interface LuminanceVisState {
  mode: LuminanceVisMode;
  falseColorPreset: 'standard' | 'arri' | 'red' | 'custom';
  randomBandCount: number;    // 4-64, default 16
  randomSeed: number;         // default 42
  contourLevels: number;      // 2-50, default 10
  contourDesaturate: boolean; // default true
  contourLineColor: [number, number, number]; // RGB, default [255, 255, 255]
}

export interface LuminanceVisEvents extends EventMap {
  stateChanged: LuminanceVisState;
  modeChanged: LuminanceVisMode;
}

export const DEFAULT_LUMINANCE_VIS_STATE: LuminanceVisState = {
  mode: 'off',
  falseColorPreset: 'standard',
  randomBandCount: 16,
  randomSeed: 42,
  contourLevels: 10,
  contourDesaturate: true,
  contourLineColor: [255, 255, 255],
};

// Rec. 709 luminance coefficients
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

// Mode cycle order
const MODE_CYCLE: LuminanceVisMode[] = ['off', 'false-color', 'hsv', 'random-color', 'contour'];

/**
 * Convert HSV to RGB.
 * @param h Hue in [0, 360)
 * @param s Saturation in [0, 1]
 * @param v Value in [0, 1]
 * @returns [r, g, b] each in [0, 1]
 */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hSector = (h / 60) % 6;
  const c = v * s;
  const x = c * (1 - Math.abs((hSector % 2) - 1));
  const m = v - c;

  let r: number, g: number, b: number;
  if (hSector < 1) { r = c; g = x; b = 0; }
  else if (hSector < 2) { r = x; g = c; b = 0; }
  else if (hSector < 3) { r = 0; g = c; b = x; }
  else if (hSector < 4) { r = 0; g = x; b = c; }
  else if (hSector < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [r + m, g + m, b + m];
}

/**
 * Build a pre-computed HSV LUT (256 entries mapping luminance 0-255 to RGB)
 * Luminance 0 -> hue 0 (red), luminance 0.5 -> hue 180 (cyan), luminance 1.0 -> hue 300 (magenta)
 */
function buildHsvLUT(): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const lum = i / 255;
    const hue = Math.min(lum, 1.0) * 300; // 0 to 300 degrees
    const [r, g, b] = hsvToRgb(hue, 1.0, 1.0);
    lut[i * 3] = Math.round(r * 255);
    lut[i * 3 + 1] = Math.round(g * 255);
    lut[i * 3 + 2] = Math.round(b * 255);
  }
  return lut;
}

/**
 * Build a random color palette using a seeded PRNG (mulberry32).
 * @param bandCount Number of bands (4-64)
 * @param seed Seed for deterministic output
 */
export function buildRandomPalette(bandCount: number, seed: number): Uint8Array {
  const lut = new Uint8Array(bandCount * 3);
  let s = seed | 0;

  function rand(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = 0; i < bandCount; i++) {
    lut[i * 3] = Math.round(rand() * 255);
    lut[i * 3 + 1] = Math.round(rand() * 255);
    lut[i * 3 + 2] = Math.round(rand() * 255);
  }
  return lut;
}

export class LuminanceVisualization extends EventEmitter<LuminanceVisEvents> {
  private state: LuminanceVisState;
  private falseColor: FalseColor;
  private hsvLUT: Uint8Array;
  private randomLUT: Uint8Array;

  constructor(falseColor: FalseColor) {
    super();
    this.falseColor = falseColor;
    this.state = { ...DEFAULT_LUMINANCE_VIS_STATE };

    // Pre-compute LUTs
    this.hsvLUT = buildHsvLUT();
    this.randomLUT = buildRandomPalette(this.state.randomBandCount, this.state.randomSeed);
  }

  // --- Mode control ---

  setMode(mode: LuminanceVisMode): void {
    if (this.state.mode === mode) return;
    this.state.mode = mode;

    // Sync FalseColor enabled state
    if (mode === 'false-color') {
      if (!this.falseColor.isEnabled()) {
        this.falseColor.enable();
      }
    } else {
      if (this.falseColor.isEnabled()) {
        this.falseColor.disable();
      }
    }

    this.emit('modeChanged', mode);
    this.emit('stateChanged', this.getState());
  }

  getMode(): LuminanceVisMode {
    return this.state.mode;
  }

  cycleMode(): void {
    const currentIndex = MODE_CYCLE.indexOf(this.state.mode);
    const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
    this.setMode(MODE_CYCLE[nextIndex]!);
  }

  // --- Random color settings ---

  setRandomBandCount(count: number): void {
    const clamped = Math.max(4, Math.min(64, Math.round(count)));
    if (this.state.randomBandCount === clamped) return;
    this.state.randomBandCount = clamped;
    this.randomLUT = buildRandomPalette(clamped, this.state.randomSeed);
    this.emit('stateChanged', this.getState());
  }

  reseedRandom(): void {
    this.state.randomSeed = Math.floor(Math.random() * 2147483647);
    this.randomLUT = buildRandomPalette(this.state.randomBandCount, this.state.randomSeed);
    this.emit('stateChanged', this.getState());
  }

  // --- Contour settings ---

  setContourLevels(levels: number): void {
    const clamped = Math.max(2, Math.min(50, Math.round(levels)));
    if (this.state.contourLevels === clamped) return;
    this.state.contourLevels = clamped;
    this.emit('stateChanged', this.getState());
  }

  setContourDesaturate(enabled: boolean): void {
    if (this.state.contourDesaturate === enabled) return;
    this.state.contourDesaturate = enabled;
    this.emit('stateChanged', this.getState());
  }

  setContourLineColor(color: [number, number, number]): void {
    this.state.contourLineColor = [...color] as [number, number, number];
    this.emit('stateChanged', this.getState());
  }

  // --- Apply visualization ---

  apply(imageData: ImageData): void {
    switch (this.state.mode) {
      case 'off':
        return;
      case 'false-color':
        this.falseColor.apply(imageData);
        return;
      case 'hsv':
        this.applyHSV(imageData);
        return;
      case 'random-color':
        this.applyRandomColorization(imageData);
        return;
      case 'contour':
        this.applyContour(imageData);
        return;
    }
  }

  private applyHSV(imageData: ImageData): void {
    const data = imageData.data;
    const len = data.length;
    const lut = this.hsvLUT;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = Math.round(LUMA_R * r + LUMA_G * g + LUMA_B * b);
      const lutIdx = Math.min(255, Math.max(0, lum)) * 3;

      data[i] = lut[lutIdx]!;
      data[i + 1] = lut[lutIdx + 1]!;
      data[i + 2] = lut[lutIdx + 2]!;
      // Alpha unchanged
    }
  }

  private applyRandomColorization(imageData: ImageData): void {
    const data = imageData.data;
    const len = data.length;
    const bandCount = this.state.randomBandCount;
    const palette = this.randomLUT;

    for (let i = 0; i < len; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const lum = (LUMA_R * r + LUMA_G * g + LUMA_B * b) / 255;
      const band = Math.min(Math.floor(lum * bandCount), bandCount - 1);

      data[i] = palette[band * 3]!;
      data[i + 1] = palette[band * 3 + 1]!;
      data[i + 2] = palette[band * 3 + 2]!;
      // Alpha unchanged
    }
  }

  private applyContour(imageData: ImageData): void {
    const { data, width, height } = imageData;
    const levels = this.state.contourLevels;
    const desaturate = this.state.contourDesaturate;
    const lineColor = this.state.contourLineColor;

    // Pre-compute luminance for all pixels
    const lum = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      lum[i] = (LUMA_R * data[idx]! + LUMA_G * data[idx + 1]! + LUMA_B * data[idx + 2]!) / 255;
    }

    // Quantize function
    const quantize = (v: number) => Math.floor(v * levels) / levels;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const idx = i * 4;
        const qC = quantize(lum[i]!);

        let isContour = false;
        if (x > 0 && quantize(lum[i - 1]!) !== qC) isContour = true;
        if (x < width - 1 && quantize(lum[i + 1]!) !== qC) isContour = true;
        if (y > 0 && quantize(lum[i - width]!) !== qC) isContour = true;
        if (y < height - 1 && quantize(lum[i + width]!) !== qC) isContour = true;

        if (desaturate && !isContour) {
          const l = lum[i]! * 255;
          data[idx] = Math.round((data[idx]! + l) / 2);
          data[idx + 1] = Math.round((data[idx + 1]! + l) / 2);
          data[idx + 2] = Math.round((data[idx + 2]! + l) / 2);
        }

        if (isContour) {
          data[idx] = lineColor[0];
          data[idx + 1] = lineColor[1];
          data[idx + 2] = lineColor[2];
        }
      }
    }
  }

  // --- State ---

  getState(): LuminanceVisState {
    return {
      ...this.state,
      contourLineColor: [...this.state.contourLineColor] as [number, number, number],
    };
  }

  dispose(): void {
    this.removeAllListeners();
  }
}
