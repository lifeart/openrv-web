/**
 * ProceduralSourceNode - Source node for procedural test pattern images
 *
 * Generates SMPTE bars, EBU bars, color charts, gradients, solid colors,
 * checkerboard, grey ramp, and resolution chart patterns procedurally.
 * Useful for calibration and testing.
 *
 * All pattern generator values are **sRGB-encoded** (not linear). When the
 * shader's `u_inputTransfer` defaults to `INPUT_TRANSFER_SRGB` (code 0),
 * it applies the sRGB EOTF to linearize these values. This is consistent
 * with how FileSourceNode handles SDR 8-bit images.
 *
 * Supports OpenRV's `.movieproc` URL format:
 *   `smpte_bars,start=1,end=100,fps=24.movieproc`
 *   `solid,color=1 0 0 1.movieproc`
 *   `gradient,direction=horizontal.movieproc`
 *   `color_chart.movieproc`
 *   `ebu_bars.movieproc`
 *   `checkerboard,cellSize=32.movieproc`
 *   `grey_ramp,steps=16.movieproc`
 *   `resolution_chart.movieproc`
 *
 * Desktop OpenRV aliases are also supported:
 *   `smpte.movieproc` -> smpte_bars
 *   `ebu.movieproc` -> ebu_bars
 *   `checker.movieproc` -> checkerboard
 *   `colorchart.movieproc` -> color_chart
 *   `ramp.movieproc` -> gradient
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatternName =
  | 'smpte_bars'
  | 'ebu_bars'
  | 'color_chart'
  | 'gradient'
  | 'solid'
  | 'checkerboard'
  | 'grey_ramp'
  | 'resolution_chart';

export type GradientDirection = 'horizontal' | 'vertical';

export interface PatternResult {
  width: number;
  height: number;
  data: Float32Array; // RGBA float32, 4 channels, sRGB-encoded values
}

export interface MovieProcParams {
  pattern: PatternName;
  start?: number;
  end?: number;
  fps?: number;
  width?: number;
  height?: number;
  color?: [number, number, number, number];
  direction?: GradientDirection;
  cellSize?: number; // checkerboard cell size (clamped to >= 1)
  colorA?: [number, number, number, number]; // checkerboard color A
  colorB?: [number, number, number, number]; // checkerboard color B
  steps?: number; // grey_ramp step count (clamped to >= 2)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard max per dimension for procedural sources (prevents excessive memory) */
export const PROCEDURAL_MAX_DIMENSION = 8192;

/** Hard max total pixels for procedural sources (~1 GB for float32 RGBA) */
export const PROCEDURAL_MAX_PIXELS = 8192 * 8192;

/**
 * Desktop OpenRV pattern name aliases for .rv session file interoperability.
 */
export const PATTERN_ALIASES: Record<string, PatternName> = {
  smpte: 'smpte_bars',
  ebu: 'ebu_bars',
  checker: 'checkerboard',
  colorchart: 'color_chart',
  ramp: 'gradient',
};

/** All valid pattern names */
const VALID_PATTERNS: PatternName[] = [
  'smpte_bars',
  'ebu_bars',
  'color_chart',
  'gradient',
  'solid',
  'checkerboard',
  'grey_ramp',
  'resolution_chart',
];

// ---------------------------------------------------------------------------
// Input guard helpers
// ---------------------------------------------------------------------------

/**
 * Clamp width and height to >= 1 and <= PROCEDURAL_MAX_DIMENSION.
 */
export function clampDimensions(width: number, height: number): { width: number; height: number } {
  let w = Math.max(1, Math.min(Math.floor(width), PROCEDURAL_MAX_DIMENSION));
  let h = Math.max(1, Math.min(Math.floor(height), PROCEDURAL_MAX_DIMENSION));
  if (w * h > PROCEDURAL_MAX_PIXELS) {
    const scale = Math.sqrt(PROCEDURAL_MAX_PIXELS / (w * h));
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
  }
  return { width: w, height: h };
}

// ---------------------------------------------------------------------------
// SMPTE color bar reference (75% intensity)
// Values are sRGB-encoded (not linear). The shader applies sRGB EOTF.
// ---------------------------------------------------------------------------

const SMPTE_BARS_75: readonly [number, number, number][] = [
  [0.75, 0.75, 0.75], // White
  [0.75, 0.75, 0.0], // Yellow
  [0.0, 0.75, 0.75], // Cyan
  [0.0, 0.75, 0.0], // Green
  [0.75, 0.0, 0.75], // Magenta
  [0.75, 0.0, 0.0], // Red
  [0.0, 0.0, 0.75], // Blue
];

// ---------------------------------------------------------------------------
// EBU color bar reference (100% intensity, 100/0/100/0 system)
// Values are sRGB-encoded, matching EBU Tech 3325.
// ---------------------------------------------------------------------------

const EBU_BARS_100: readonly [number, number, number][] = [
  [1.0, 1.0, 1.0], // White
  [1.0, 1.0, 0.0], // Yellow
  [0.0, 1.0, 1.0], // Cyan
  [0.0, 1.0, 0.0], // Green
  [1.0, 0.0, 1.0], // Magenta
  [1.0, 0.0, 0.0], // Red
  [0.0, 0.0, 1.0], // Blue
  [0.0, 0.0, 0.0], // Black
];

// ---------------------------------------------------------------------------
// Macbeth ColorChecker approximation (sRGB linear, 6 columns x 4 rows)
// Values are approximate linear-light sRGB equivalents of the standard patches.
// ---------------------------------------------------------------------------

const COLOR_CHECKER_PATCHES: readonly [number, number, number][] = [
  // Row 1: Natural colors
  [0.043, 0.0323, 0.0253], // 1  Dark skin
  [0.147, 0.11, 0.0805], // 2  Light skin
  [0.037, 0.062, 0.103], // 3  Blue sky
  [0.031, 0.046, 0.021], // 4  Foliage
  [0.064, 0.06, 0.135], // 5  Blue flower
  [0.032, 0.149, 0.139], // 6  Bluish green

  // Row 2: Miscellaneous colors
  [0.174, 0.076, 0.006], // 7  Orange
  [0.018, 0.036, 0.14], // 8  Purplish blue
  [0.129, 0.029, 0.031], // 9  Moderate red
  [0.021, 0.013, 0.05], // 10 Purple
  [0.088, 0.154, 0.013], // 11 Yellow green
  [0.221, 0.124, 0.008], // 12 Orange yellow

  // Row 3: Primary and secondary colors
  [0.008, 0.019, 0.121], // 13 Blue
  [0.016, 0.087, 0.015], // 14 Green
  [0.094, 0.013, 0.007], // 15 Red
  [0.258, 0.2, 0.008], // 16 Yellow
  [0.106, 0.026, 0.092], // 17 Magenta
  [0.006, 0.078, 0.147], // 18 Cyan

  // Row 4: Neutral scale (dark to light)
  [0.031, 0.031, 0.031], // 19 White 9.5
  [0.09, 0.09, 0.09], // 20 Neutral 8
  [0.195, 0.195, 0.195], // 21 Neutral 6.5
  [0.361, 0.361, 0.361], // 22 Neutral 5
  [0.586, 0.586, 0.586], // 23 Neutral 3.5
  [0.9, 0.9, 0.9], // 24 White
];

// ---------------------------------------------------------------------------
// Generator functions
// ---------------------------------------------------------------------------

/**
 * Generate SMPTE 75% color bars test pattern.
 * Values are sRGB-encoded (not linear). The shader applies sRGB EOTF to linearize.
 *
 * Standard 7-bar layout (left to right, each 1/7 of width):
 * White, Yellow, Cyan, Green, Magenta, Red, Blue
 */
export function generateSMPTEBars(width: number, height: number): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  const data = new Float32Array(width * height * 4);
  const numBars = SMPTE_BARS_75.length;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const barIndex = Math.min(Math.floor((x / width) * numBars), numBars - 1);
      const color = SMPTE_BARS_75[barIndex]!;
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 1.0;
    }
  }

  return { width, height, data };
}

/**
 * Generate EBU 100% color bars test pattern.
 * Values are sRGB-encoded, matching EBU Tech 3325 100/0/100/0 system.
 *
 * 8-bar layout (left to right, each 1/8 of width):
 * White, Yellow, Cyan, Green, Magenta, Red, Blue, Black
 */
export function generateEBUBars(width: number, height: number): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  const data = new Float32Array(width * height * 4);
  const numBars = EBU_BARS_100.length;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const barIndex = Math.min(Math.floor((x / width) * numBars), numBars - 1);
      const color = EBU_BARS_100[barIndex]!;
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 1.0;
    }
  }

  return { width, height, data };
}

/**
 * Generate a Macbeth ColorChecker approximation (6 columns x 4 rows).
 * Values are sRGB-encoded (not linear). The shader applies sRGB EOTF to linearize.
 */
export function generateColorChart(width: number, height: number): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  const data = new Float32Array(width * height * 4);
  const cols = 6;
  const rows = 4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const col = Math.min(Math.floor((x / width) * cols), cols - 1);
      const row = Math.min(Math.floor((y / height) * rows), rows - 1);
      const patchIndex = row * cols + col;
      const color = COLOR_CHECKER_PATCHES[patchIndex]!;
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 1.0;
    }
  }

  return { width, height, data };
}

/**
 * Generate a linear gradient ramp.
 * Values are sRGB-encoded (not linear). The shader applies sRGB EOTF to linearize.
 *
 * @param direction - 'horizontal' ramps left-to-right, 'vertical' ramps top-to-bottom
 */
export function generateGradient(
  width: number,
  height: number,
  direction: GradientDirection = 'horizontal',
): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = direction === 'horizontal' ? (width > 1 ? x / (width - 1) : 0) : height > 1 ? y / (height - 1) : 0;
      const idx = (y * width + x) * 4;
      data[idx] = t;
      data[idx + 1] = t;
      data[idx + 2] = t;
      data[idx + 3] = 1.0;
    }
  }

  return { width, height, data };
}

/**
 * Generate a solid flat-fill image.
 * Values are sRGB-encoded (not linear). The shader applies sRGB EOTF to linearize.
 *
 * @param color - RGBA values in [0, 1] range
 */
export function generateSolid(
  width: number,
  height: number,
  color: [number, number, number, number] = [0, 0, 0, 1],
): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = color[3];
    }
  }

  return { width, height, data };
}

/**
 * Generate a checkerboard pattern.
 * Values are sRGB-encoded (not linear). The shader applies sRGB EOTF to linearize.
 *
 * @param cellSize - size of each square in pixels (default: 64, clamped to >= 1)
 * @param colorA - first color RGBA (default: white)
 * @param colorB - second color RGBA (default: black)
 */
export function generateCheckerboard(
  width: number,
  height: number,
  cellSize: number = 64,
  colorA: [number, number, number, number] = [1, 1, 1, 1],
  colorB: [number, number, number, number] = [0, 0, 0, 1],
): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  cellSize = Math.max(1, Math.floor(cellSize));
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWhite = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      const color = isWhite ? colorA : colorB;
      const idx = (y * width + x) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = color[3];
    }
  }

  return { width, height, data };
}

/**
 * Generate a stepped grey ramp showing discrete luminance levels.
 * Values are sRGB-encoded (not linear). The shader applies sRGB EOTF to linearize.
 *
 * Unlike the smooth gradient pattern, this produces discrete bands.
 *
 * @param steps - number of grey levels (default: 16, clamped to >= 2)
 * @param direction - 'horizontal' or 'vertical' (default: 'horizontal')
 */
export function generateGreyRamp(
  width: number,
  height: number,
  steps: number = 16,
  direction: GradientDirection = 'horizontal',
): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  steps = Math.max(2, Math.floor(steps));
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = direction === 'horizontal' ? x : y;
      const size = direction === 'horizontal' ? width : height;
      const stepIndex = Math.min(Math.floor((pos / size) * steps), steps - 1);
      const value = stepIndex / (steps - 1);
      const idx = (y * width + x) * 4;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 1.0;
    }
  }

  return { width, height, data };
}

// ---------------------------------------------------------------------------
// Resolution chart drawing helpers
// ---------------------------------------------------------------------------

function setPixel(
  data: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number = 1.0,
): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = a;
}

function drawLine(
  data: Float32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
): void {
  // Bresenham's line algorithm
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;

  while (true) {
    setPixel(data, width, height, cx, cy, r, g, b);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}

function drawCircle(
  data: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
): void {
  // Midpoint circle algorithm
  let x = radius;
  let y = 0;
  let err = 1 - radius;

  while (x >= y) {
    setPixel(data, width, height, cx + x, cy + y, r, g, b);
    setPixel(data, width, height, cx - x, cy + y, r, g, b);
    setPixel(data, width, height, cx + x, cy - y, r, g, b);
    setPixel(data, width, height, cx - x, cy - y, r, g, b);
    setPixel(data, width, height, cx + y, cy + x, r, g, b);
    setPixel(data, width, height, cx - y, cy + x, r, g, b);
    setPixel(data, width, height, cx + y, cy - x, r, g, b);
    setPixel(data, width, height, cx - y, cy - x, r, g, b);
    y++;
    if (err < 0) {
      err += 2 * y + 1;
    } else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

function drawRect(
  data: Float32Array,
  width: number,
  height: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  r: number,
  g: number,
  b: number,
): void {
  // Top and bottom edges
  for (let x = rx; x < rx + rw; x++) {
    setPixel(data, width, height, x, ry, r, g, b);
    setPixel(data, width, height, x, ry + rh - 1, r, g, b);
  }
  // Left and right edges
  for (let y = ry; y < ry + rh; y++) {
    setPixel(data, width, height, rx, y, r, g, b);
    setPixel(data, width, height, rx + rw - 1, y, r, g, b);
  }
}

/**
 * Generate a resolution/alignment test chart.
 * Uses purely geometric elements: center crosshair with circle, corner crosshairs,
 * border frame, and frequency gratings at varying periods.
 *
 * Text-free (no font rendering required).
 * Values are sRGB-encoded (not linear).
 */
export function generateResolutionChart(width: number, height: number): PatternResult {
  ({ width, height } = clampDimensions(width, height));
  // Start with black background
  const data = new Float32Array(width * height * 4);
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 1.0; // alpha = 1
  }

  const w = 1.0; // white color value

  // Border frame (1px white outline)
  drawRect(data, width, height, 0, 0, width, height, w, w, w);

  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const minDim = Math.min(width, height);

  // Center crosshair: spans 20% of image
  const crossLen = Math.max(1, Math.floor(minDim * 0.1));
  drawLine(data, width, height, cx - crossLen, cy, cx + crossLen, cy, w, w, w);
  drawLine(data, width, height, cx, cy - crossLen, cx, cy + crossLen, w, w, w);

  // Center circle (radius = 5% of min dimension)
  const circleR = Math.max(2, Math.floor(minDim * 0.05));
  drawCircle(data, width, height, cx, cy, circleR, w, w, w);

  // Corner crosshairs at 5% inset
  const inset = Math.max(2, Math.floor(minDim * 0.05));
  const cornerLen = Math.max(1, Math.floor(minDim * 0.02));
  const corners = [
    [inset, inset],
    [width - 1 - inset, inset],
    [inset, height - 1 - inset],
    [width - 1 - inset, height - 1 - inset],
  ];
  for (const corner of corners) {
    const ccx = corner[0]!;
    const ccy = corner[1]!;
    drawLine(data, width, height, ccx - cornerLen, ccy, ccx + cornerLen, ccy, w, w, w);
    drawLine(data, width, height, ccx, ccy - cornerLen, ccx, ccy + cornerLen, w, w, w);
  }

  // Frequency gratings: alternating black/white at 1px, 2px, 4px, 8px, 16px periods
  // Arranged as horizontal bands above center and vertical bands to the right of center
  const periods = [1, 2, 4, 8, 16];
  const gratingLen = Math.max(4, Math.floor(minDim * 0.08));
  const gratingHeight = Math.max(2, Math.floor(minDim * 0.03));

  // Vertical gratings (above center)
  let gratingY = cy - circleR - gratingHeight - 10;
  for (const period of periods) {
    if (gratingY < 2) break;
    for (let gx = cx - Math.floor(gratingLen / 2); gx < cx + Math.floor(gratingLen / 2); gx++) {
      const isWhite = Math.floor((gx - (cx - Math.floor(gratingLen / 2))) / period) % 2 === 0;
      if (isWhite) {
        for (let gy = gratingY; gy < gratingY + gratingHeight && gy < height; gy++) {
          setPixel(data, width, height, gx, gy, w, w, w);
        }
      }
    }
    gratingY -= gratingHeight + 4;
  }

  // Horizontal gratings (to the right of center)
  let gratingX = cx + circleR + 10;
  for (const period of periods) {
    if (gratingX + gratingHeight >= width - 2) break;
    for (let gy = cy - Math.floor(gratingLen / 2); gy < cy + Math.floor(gratingLen / 2); gy++) {
      const isWhite = Math.floor((gy - (cy - Math.floor(gratingLen / 2))) / period) % 2 === 0;
      if (isWhite) {
        for (let gx = gratingX; gx < gratingX + gratingHeight && gx < width; gx++) {
          setPixel(data, width, height, gx, gy, w, w, w);
        }
      }
    }
    gratingX += gratingHeight + 4;
  }

  return { width, height, data };
}

// ---------------------------------------------------------------------------
// .movieproc URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse a `.movieproc` URL string into structured parameters.
 *
 * Format: `<pattern_name>[,key=value,...].movieproc`
 *
 * Supports desktop OpenRV aliases: smpte, ebu, checker, colorchart, ramp
 *
 * @throws Error if the URL is not a valid `.movieproc` URL or the pattern is unknown
 */
export function parseMovieProc(url: string): MovieProcParams {
  // Strip trailing `.movieproc` suffix
  if (!url.endsWith('.movieproc')) {
    throw new Error(`Not a .movieproc URL: ${url}`);
  }
  const body = url.slice(0, -'.movieproc'.length);

  // Split on commas to get pattern name and key=value pairs
  const parts = body.split(',');
  let patternName = parts[0]!.trim();

  // Resolve desktop OpenRV aliases
  if (patternName in PATTERN_ALIASES) {
    patternName = PATTERN_ALIASES[patternName]!;
  }

  // Validate pattern name
  if (!VALID_PATTERNS.includes(patternName as PatternName)) {
    throw new Error(`Unknown movieproc pattern: "${patternName}"`);
  }

  const params: MovieProcParams = {
    pattern: patternName as PatternName,
  };

  // Parse key=value pairs
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!.trim();
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;

    const key = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();

    switch (key) {
      case 'start':
        params.start = parseInt(value, 10);
        break;
      case 'end':
        params.end = parseInt(value, 10);
        break;
      case 'fps':
        params.fps = parseFloat(value);
        break;
      case 'width':
        params.width = parseInt(value, 10);
        break;
      case 'height':
        params.height = parseInt(value, 10);
        break;
      case 'color': {
        const colorParts = value.split(/\s+/).map(Number);
        if (colorParts.length >= 4) {
          params.color = [colorParts[0]!, colorParts[1]!, colorParts[2]!, colorParts[3]!];
        } else if (colorParts.length === 3) {
          params.color = [colorParts[0]!, colorParts[1]!, colorParts[2]!, 1.0];
        }
        break;
      }
      case 'direction':
        if (value === 'horizontal' || value === 'vertical') {
          params.direction = value;
        }
        break;
      case 'cellSize':
        params.cellSize = parseInt(value, 10);
        break;
      case 'colorA': {
        const aParts = value.split(/\s+/).map(Number);
        if (aParts.length >= 4) {
          params.colorA = [aParts[0]!, aParts[1]!, aParts[2]!, aParts[3]!];
        } else if (aParts.length === 3) {
          params.colorA = [aParts[0]!, aParts[1]!, aParts[2]!, 1.0];
        }
        break;
      }
      case 'colorB': {
        const bParts = value.split(/\s+/).map(Number);
        if (bParts.length >= 4) {
          params.colorB = [bParts[0]!, bParts[1]!, bParts[2]!, bParts[3]!];
        } else if (bParts.length === 3) {
          params.colorB = [bParts[0]!, bParts[1]!, bParts[2]!, 1.0];
        }
        break;
      }
      case 'steps':
        params.steps = parseInt(value, 10);
        break;
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// ProceduralSourceNode
// ---------------------------------------------------------------------------

@RegisterNode('RVMovieProc')
export class ProceduralSourceNode extends BaseSourceNode {
  private cachedIPImage: IPImage | null = null;
  private patternParams: MovieProcParams | null = null;

  constructor(name?: string) {
    super('RVMovieProc', name ?? 'Procedural Source');

    // Define properties
    this.properties.add({ name: 'url', defaultValue: '' });
    this.properties.add({ name: 'pattern', defaultValue: '' });
    this.properties.add({ name: 'width', defaultValue: 1920 });
    this.properties.add({ name: 'height', defaultValue: 1080 });
  }

  /**
   * Load from a `.movieproc` URL string.
   */
  loadFromMovieProc(url: string): void {
    const params = parseMovieProc(url);
    this.patternParams = params;

    const clamped = clampDimensions(params.width ?? 1920, params.height ?? 1080);
    const width = clamped.width;
    const height = clamped.height;
    const fps = params.fps ?? 24;
    const start = params.start ?? 1;
    const end = params.end ?? 1;
    const duration = Math.max(1, end - start + 1);

    this.metadata = {
      name: url,
      width,
      height,
      duration,
      fps,
    };

    this.properties.setValue('url', url);
    this.properties.setValue('pattern', params.pattern);
    this.properties.setValue('width', width);
    this.properties.setValue('height', height);

    // Generate the image immediately
    this.generatePattern(width, height, params);
  }

  /**
   * Load from explicit parameters (programmatic API).
   */
  loadPattern(
    pattern: PatternName,
    width: number,
    height: number,
    options?: {
      color?: [number, number, number, number];
      direction?: GradientDirection;
      cellSize?: number;
      colorA?: [number, number, number, number];
      colorB?: [number, number, number, number];
      steps?: number;
      fps?: number;
      duration?: number;
    },
  ): void {
    const clamped = clampDimensions(width, height);
    width = clamped.width;
    height = clamped.height;

    const params: MovieProcParams = {
      pattern,
      width,
      height,
      color: options?.color,
      direction: options?.direction,
      cellSize: options?.cellSize,
      colorA: options?.colorA,
      colorB: options?.colorB,
      steps: options?.steps,
      fps: options?.fps,
    };
    this.patternParams = params;

    const fps = options?.fps ?? 24;
    const duration = options?.duration ?? 1;

    this.metadata = {
      name: `${pattern} (${width}x${height})`,
      width,
      height,
      duration,
      fps,
    };

    this.properties.setValue('pattern', pattern);
    this.properties.setValue('width', width);
    this.properties.setValue('height', height);

    this.generatePattern(width, height, params);
  }

  private generatePattern(width: number, height: number, params: MovieProcParams): void {
    let result: PatternResult;

    switch (params.pattern) {
      case 'smpte_bars':
        result = generateSMPTEBars(width, height);
        break;
      case 'ebu_bars':
        result = generateEBUBars(width, height);
        break;
      case 'color_chart':
        result = generateColorChart(width, height);
        break;
      case 'gradient':
        result = generateGradient(width, height, params.direction ?? 'horizontal');
        break;
      case 'solid':
        result = generateSolid(width, height, params.color ?? [0, 0, 0, 1]);
        break;
      case 'checkerboard':
        result = generateCheckerboard(width, height, params.cellSize, params.colorA, params.colorB);
        break;
      case 'grey_ramp':
        result = generateGreyRamp(width, height, params.steps, params.direction);
        break;
      case 'resolution_chart':
        result = generateResolutionChart(width, height);
        break;
      default:
        throw new Error(`Unknown pattern: ${params.pattern}`);
    }

    this.cachedIPImage = new IPImage({
      width: result.width,
      height: result.height,
      channels: 4,
      dataType: 'float32',
      data: result.data.buffer as ArrayBuffer,
      metadata: {
        sourcePath: `movieproc://${params.pattern}`,
        frameNumber: 1,
        attributes: {
          pattern: params.pattern,
          procedural: true,
        },
      },
    });

    this.markDirty();
  }

  isReady(): boolean {
    return this.cachedIPImage !== null;
  }

  getElement(_frame: number): HTMLImageElement | HTMLVideoElement | null {
    // Procedural sources don't have DOM elements
    return null;
  }

  /**
   * Get the cached IPImage directly (for WebGL rendering path).
   */
  getIPImage(): IPImage | null {
    return this.cachedIPImage;
  }

  protected process(context: EvalContext, _inputs: (IPImage | null)[]): IPImage | null {
    if (!this.cachedIPImage) {
      return null;
    }

    // Update frame number in metadata
    if (this.cachedIPImage.metadata.frameNumber !== context.frame) {
      this.cachedIPImage.metadata.frameNumber = context.frame;
    }

    return this.cachedIPImage;
  }

  override dispose(): void {
    this.cachedIPImage = null;
    this.patternParams = null;
    super.dispose();
  }

  toJSON(): object {
    return {
      type: this.type,
      id: this.id,
      name: this.name,
      url: this.properties.getValue<string>('url'),
      pattern: this.patternParams,
      metadata: this.metadata,
      properties: this.properties.toJSON(),
    };
  }
}
