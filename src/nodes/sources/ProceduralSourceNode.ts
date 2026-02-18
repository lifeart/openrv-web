/**
 * ProceduralSourceNode - Source node for procedural test pattern images
 *
 * Generates SMPTE bars, color charts, gradients, solid colors, and noise
 * patterns procedurally. Useful for calibration and testing.
 *
 * Supports OpenRV's `.movieproc` URL format:
 *   `smpte_bars,start=1,end=100,fps=24.movieproc`
 *   `solid,color=1 0 0 1.movieproc`
 *   `gradient,direction=horizontal.movieproc`
 *   `color_chart.movieproc`
 */

import { BaseSourceNode } from './BaseSourceNode';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import { RegisterNode } from '../base/NodeFactory';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatternName = 'smpte_bars' | 'color_chart' | 'gradient' | 'solid';
export type GradientDirection = 'horizontal' | 'vertical';

export interface PatternResult {
  width: number;
  height: number;
  data: Float32Array;
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
}

// ---------------------------------------------------------------------------
// SMPTE color bar reference (75% intensity)
// ---------------------------------------------------------------------------

const SMPTE_BARS_75: readonly [number, number, number][] = [
  [0.75, 0.75, 0.75], // White
  [0.75, 0.75, 0.0],  // Yellow
  [0.0, 0.75, 0.75],  // Cyan
  [0.0, 0.75, 0.0],   // Green
  [0.75, 0.0, 0.75],  // Magenta
  [0.75, 0.0, 0.0],   // Red
  [0.0, 0.0, 0.75],   // Blue
];

// ---------------------------------------------------------------------------
// Macbeth ColorChecker approximation (sRGB linear, 6 columns x 4 rows)
// Values are approximate linear-light sRGB equivalents of the standard patches.
// ---------------------------------------------------------------------------

const COLOR_CHECKER_PATCHES: readonly [number, number, number][] = [
  // Row 1: Natural colors
  [0.0430, 0.0323, 0.0253], // 1  Dark skin
  [0.1470, 0.1100, 0.0805], // 2  Light skin
  [0.0370, 0.0620, 0.1030], // 3  Blue sky
  [0.0310, 0.0460, 0.0210], // 4  Foliage
  [0.0640, 0.0600, 0.1350], // 5  Blue flower
  [0.0320, 0.1490, 0.1390], // 6  Bluish green

  // Row 2: Miscellaneous colors
  [0.1740, 0.0760, 0.0060], // 7  Orange
  [0.0180, 0.0360, 0.1400], // 8  Purplish blue
  [0.1290, 0.0290, 0.0310], // 9  Moderate red
  [0.0210, 0.0130, 0.0500], // 10 Purple
  [0.0880, 0.1540, 0.0130], // 11 Yellow green
  [0.2210, 0.1240, 0.0080], // 12 Orange yellow

  // Row 3: Primary and secondary colors
  [0.0080, 0.0190, 0.1210], // 13 Blue
  [0.0160, 0.0870, 0.0150], // 14 Green
  [0.0940, 0.0130, 0.0070], // 15 Red
  [0.2580, 0.2000, 0.0080], // 16 Yellow
  [0.1060, 0.0260, 0.0920], // 17 Magenta
  [0.0060, 0.0780, 0.1470], // 18 Cyan

  // Row 4: Neutral scale (dark to light)
  [0.0310, 0.0310, 0.0310], // 19 White 9.5
  [0.0900, 0.0900, 0.0900], // 20 Neutral 8
  [0.1950, 0.1950, 0.1950], // 21 Neutral 6.5
  [0.3610, 0.3610, 0.3610], // 22 Neutral 5
  [0.5860, 0.5860, 0.5860], // 23 Neutral 3.5
  [0.9000, 0.9000, 0.9000], // 24 White
];

// ---------------------------------------------------------------------------
// Generator functions
// ---------------------------------------------------------------------------

/**
 * Generate SMPTE 75% color bars test pattern.
 *
 * Standard 7-bar layout (left to right, each 1/7 of width):
 * White, Yellow, Cyan, Green, Magenta, Red, Blue
 */
export function generateSMPTEBars(width: number, height: number): PatternResult {
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
 * Generate a Macbeth ColorChecker approximation (6 columns x 4 rows).
 */
export function generateColorChart(width: number, height: number): PatternResult {
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
 *
 * @param direction - 'horizontal' ramps left-to-right, 'vertical' ramps top-to-bottom
 */
export function generateGradient(
  width: number,
  height: number,
  direction: GradientDirection = 'horizontal',
): PatternResult {
  const data = new Float32Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t =
        direction === 'horizontal'
          ? width > 1 ? x / (width - 1) : 0
          : height > 1 ? y / (height - 1) : 0;
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
 *
 * @param color - RGBA values in [0, 1] range
 */
export function generateSolid(
  width: number,
  height: number,
  color: [number, number, number, number] = [0, 0, 0, 1],
): PatternResult {
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

// ---------------------------------------------------------------------------
// .movieproc URL parsing
// ---------------------------------------------------------------------------

/**
 * Parse a `.movieproc` URL string into structured parameters.
 *
 * Format: `<pattern_name>[,key=value,...].movieproc`
 *
 * Examples:
 *   `smpte_bars,start=1,end=100,fps=24.movieproc`
 *   `solid,color=1 0 0 1.movieproc`
 *   `gradient,direction=horizontal.movieproc`
 *   `color_chart.movieproc`
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
  const patternName = parts[0]!.trim();

  // Validate pattern name
  const validPatterns: PatternName[] = ['smpte_bars', 'color_chart', 'gradient', 'solid'];
  if (!validPatterns.includes(patternName as PatternName)) {
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

    const width = params.width ?? 1920;
    const height = params.height ?? 1080;
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
      fps?: number;
      duration?: number;
    },
  ): void {
    const params: MovieProcParams = {
      pattern,
      width,
      height,
      color: options?.color,
      direction: options?.direction,
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
      case 'color_chart':
        result = generateColorChart(width, height);
        break;
      case 'gradient':
        result = generateGradient(width, height, params.direction ?? 'horizontal');
        break;
      case 'solid':
        result = generateSolid(width, height, params.color ?? [0, 0, 0, 1]);
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
