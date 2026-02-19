/**
 * ProceduralSourceNode Unit Tests
 *
 * Tests for procedural test pattern generation and .movieproc URL parsing.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSMPTEBars,
  generateColorChart,
  generateGradient,
  generateSolid,
  parseMovieProc,
  ProceduralSourceNode,
} from './ProceduralSourceNode';

// ---------------------------------------------------------------------------
// Helper: read a pixel from a Float32Array (RGBA, 4 channels)
// ---------------------------------------------------------------------------

function getPixel(
  data: Float32Array,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const idx = (y * width + x) * 4;
  return [data[idx]!, data[idx + 1]!, data[idx + 2]!, data[idx + 3]!];
}

// ---------------------------------------------------------------------------
// SMPTE Bars Tests
// ---------------------------------------------------------------------------

describe('generateSMPTEBars', () => {
  it('PROC-001: pixel at first bar center (137, 360) is ~75% white', () => {
    const result = generateSMPTEBars(1920, 1080);
    const [r, g, b] = getPixel(result.data, result.width, 137, 360);
    expect(r).toBeCloseTo(0.75, 2);
    expect(g).toBeCloseTo(0.75, 2);
    expect(b).toBeCloseTo(0.75, 2);
  });

  it('PROC-002: pixel at second bar center (411, 360) is ~75% yellow', () => {
    const result = generateSMPTEBars(1920, 1080);
    const [r, g, b] = getPixel(result.data, result.width, 411, 360);
    expect(r).toBeCloseTo(0.75, 2);
    expect(g).toBeCloseTo(0.75, 2);
    expect(b).toBeCloseTo(0.0, 2);
  });

  it('PROC-003: output dimensions match requested width/height', () => {
    const result = generateSMPTEBars(1920, 1080);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it('PROC-004: output has 4 channels (RGBA), alpha = 1.0', () => {
    const result = generateSMPTEBars(1920, 1080);
    // Total elements should be width * height * 4
    expect(result.data.length).toBe(1920 * 1080 * 4);
    // Check alpha of a few pixels
    const [, , , a1] = getPixel(result.data, result.width, 0, 0);
    const [, , , a2] = getPixel(result.data, result.width, 960, 540);
    const [, , , a3] = getPixel(result.data, result.width, 1919, 1079);
    expect(a1).toBe(1.0);
    expect(a2).toBe(1.0);
    expect(a3).toBe(1.0);
  });

  it('generates all 7 bar colors correctly', () => {
    const result = generateSMPTEBars(700, 100);
    // Each bar is 100px wide in a 700px image
    const expectedColors: [number, number, number][] = [
      [0.75, 0.75, 0.75], // White
      [0.75, 0.75, 0.0],  // Yellow
      [0.0, 0.75, 0.75],  // Cyan
      [0.0, 0.75, 0.0],   // Green
      [0.75, 0.0, 0.75],  // Magenta
      [0.75, 0.0, 0.0],   // Red
      [0.0, 0.0, 0.75],   // Blue
    ];

    for (let bar = 0; bar < 7; bar++) {
      const x = Math.floor(bar * 100 + 50); // center of each bar
      const [r, g, b] = getPixel(result.data, result.width, x, 50);
      expect(r).toBeCloseTo(expectedColors[bar]![0], 2);
      expect(g).toBeCloseTo(expectedColors[bar]![1], 2);
      expect(b).toBeCloseTo(expectedColors[bar]![2], 2);
    }
  });

  it('handles small dimensions', () => {
    const result = generateSMPTEBars(7, 1);
    expect(result.width).toBe(7);
    expect(result.height).toBe(1);
    expect(result.data.length).toBe(7 * 1 * 4);
  });
});

// ---------------------------------------------------------------------------
// Solid Fill Tests
// ---------------------------------------------------------------------------

describe('generateSolid', () => {
  it('PROC-010: solid(100, 100, [1,0,0,1]) fills all pixels red', () => {
    const result = generateSolid(100, 100, [1, 0, 0, 1]);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);

    // Check corners and center
    for (const [x, y] of [[0, 0], [99, 0], [0, 99], [99, 99], [50, 50]] as const) {
      const [r, g, b, a] = getPixel(result.data, result.width, x, y);
      expect(r).toBe(1.0);
      expect(g).toBe(0.0);
      expect(b).toBe(0.0);
      expect(a).toBe(1.0);
    }
  });

  it('PROC-011: solid(1, 1, [0.5, 0.5, 0.5, 1.0]) single pixel grey', () => {
    const result = generateSolid(1, 1, [0.5, 0.5, 0.5, 1.0]);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.data.length).toBe(4);

    const [r, g, b, a] = getPixel(result.data, result.width, 0, 0);
    expect(r).toBeCloseTo(0.5, 5);
    expect(g).toBeCloseTo(0.5, 5);
    expect(b).toBeCloseTo(0.5, 5);
    expect(a).toBeCloseTo(1.0, 5);
  });

  it('uses default black color when no color specified', () => {
    const result = generateSolid(2, 2);
    const [r, g, b, a] = getPixel(result.data, result.width, 0, 0);
    expect(r).toBe(0.0);
    expect(g).toBe(0.0);
    expect(b).toBe(0.0);
    expect(a).toBe(1.0);
  });

  it('supports transparent fill', () => {
    const result = generateSolid(2, 2, [0, 0, 0, 0]);
    const [r, g, b, a] = getPixel(result.data, result.width, 0, 0);
    expect(r).toBe(0.0);
    expect(g).toBe(0.0);
    expect(b).toBe(0.0);
    expect(a).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// Gradient Tests
// ---------------------------------------------------------------------------

describe('generateGradient', () => {
  it('PROC-020: horizontal gradient 256x1 ramps correctly', () => {
    const result = generateGradient(256, 1, 'horizontal');
    expect(result.width).toBe(256);
    expect(result.height).toBe(1);

    const [r0] = getPixel(result.data, result.width, 0, 0);
    const [r128] = getPixel(result.data, result.width, 128, 0);
    const [r255] = getPixel(result.data, result.width, 255, 0);

    expect(r0).toBeCloseTo(0.0, 2);
    expect(r128).toBeCloseTo(0.502, 2);
    expect(r255).toBeCloseTo(1.0, 2);
  });

  it('PROC-021: vertical gradient 1x256 ramps correctly', () => {
    const result = generateGradient(1, 256, 'vertical');
    expect(result.width).toBe(1);
    expect(result.height).toBe(256);

    const [r0] = getPixel(result.data, result.width, 0, 0);
    const [r128] = getPixel(result.data, result.width, 0, 128);
    const [r255] = getPixel(result.data, result.width, 0, 255);

    expect(r0).toBeCloseTo(0.0, 2);
    expect(r128).toBeCloseTo(0.502, 2);
    expect(r255).toBeCloseTo(1.0, 2);
  });

  it('horizontal gradient is constant along rows', () => {
    const result = generateGradient(10, 5, 'horizontal');
    // All rows should have the same values
    for (let y = 1; y < 5; y++) {
      for (let x = 0; x < 10; x++) {
        const [r0] = getPixel(result.data, result.width, x, 0);
        const [ry] = getPixel(result.data, result.width, x, y);
        expect(ry).toBe(r0);
      }
    }
  });

  it('vertical gradient is constant along columns', () => {
    const result = generateGradient(5, 10, 'vertical');
    // All columns should have the same values
    for (let x = 1; x < 5; x++) {
      for (let y = 0; y < 10; y++) {
        const [r0] = getPixel(result.data, result.width, 0, y);
        const [rx] = getPixel(result.data, result.width, x, y);
        expect(rx).toBe(r0);
      }
    }
  });

  it('defaults to horizontal direction', () => {
    const result = generateGradient(10, 1);
    const [r0] = getPixel(result.data, result.width, 0, 0);
    const [r9] = getPixel(result.data, result.width, 9, 0);
    expect(r0).toBeCloseTo(0.0, 2);
    expect(r9).toBeCloseTo(1.0, 2);
  });

  it('alpha is always 1.0', () => {
    const result = generateGradient(10, 10, 'horizontal');
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const [, , , a] = getPixel(result.data, result.width, x, y);
        expect(a).toBe(1.0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Color Chart Tests
// ---------------------------------------------------------------------------

describe('generateColorChart', () => {
  it('PROC-030: output has correct dimensions', () => {
    const result = generateColorChart(600, 400);
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
    expect(result.data.length).toBe(600 * 400 * 4);
  });

  it('PROC-031: first patch (dark skin) is approximately correct', () => {
    const result = generateColorChart(600, 400);
    // First patch is in the top-left corner (col 0, row 0)
    // Center of first patch: x = 50, y = 50
    const [r, g, b] = getPixel(result.data, result.width, 50, 50);
    // Dark skin: approximately [0.043, 0.032, 0.025]
    expect(r).toBeCloseTo(0.043, 2);
    expect(g).toBeCloseTo(0.032, 2);
    expect(b).toBeCloseTo(0.025, 2);
  });

  it('has 24 distinct patches in 6x4 grid', () => {
    const result = generateColorChart(600, 400);
    const patchWidth = 100;  // 600 / 6
    const patchHeight = 100; // 400 / 4

    const colors = new Set<string>();
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const x = Math.floor(col * patchWidth + patchWidth / 2);
        const y = Math.floor(row * patchHeight + patchHeight / 2);
        const [r, g, b] = getPixel(result.data, result.width, x, y);
        colors.add(`${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)}`);
      }
    }
    expect(colors.size).toBe(24);
  });

  it('alpha is always 1.0 for all patches', () => {
    const result = generateColorChart(60, 40);
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 60; x++) {
        const [, , , a] = getPixel(result.data, result.width, x, y);
        expect(a).toBe(1.0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// .movieproc URL Parsing Tests
// ---------------------------------------------------------------------------

describe('parseMovieProc', () => {
  it('PROC-040: parses smpte_bars with start/end/fps', () => {
    const params = parseMovieProc('smpte_bars,start=1,end=100,fps=24.movieproc');
    expect(params.pattern).toBe('smpte_bars');
    expect(params.start).toBe(1);
    expect(params.end).toBe(100);
    expect(params.fps).toBe(24);
  });

  it('PROC-041: parses solid with color', () => {
    const params = parseMovieProc('solid,color=1 0 0 1.movieproc');
    expect(params.pattern).toBe('solid');
    expect(params.color).toEqual([1, 0, 0, 1]);
  });

  it('PROC-042: unknown pattern throws error', () => {
    expect(() => parseMovieProc('unknown_pattern.movieproc')).toThrow(
      'Unknown movieproc pattern: "unknown_pattern"',
    );
  });

  it('parses gradient with direction', () => {
    const params = parseMovieProc('gradient,direction=horizontal.movieproc');
    expect(params.pattern).toBe('gradient');
    expect(params.direction).toBe('horizontal');
  });

  it('parses vertical gradient', () => {
    const params = parseMovieProc('gradient,direction=vertical.movieproc');
    expect(params.direction).toBe('vertical');
  });

  it('parses color_chart with no extra params', () => {
    const params = parseMovieProc('color_chart.movieproc');
    expect(params.pattern).toBe('color_chart');
  });

  it('parses width and height parameters', () => {
    const params = parseMovieProc('smpte_bars,width=3840,height=2160.movieproc');
    expect(params.width).toBe(3840);
    expect(params.height).toBe(2160);
  });

  it('throws for non-.movieproc URL', () => {
    expect(() => parseMovieProc('test.mov')).toThrow('Not a .movieproc URL');
  });

  it('parses color with 3 components (defaults alpha to 1.0)', () => {
    const params = parseMovieProc('solid,color=0.5 0.5 0.5.movieproc');
    expect(params.color).toEqual([0.5, 0.5, 0.5, 1.0]);
  });

  it('handles multiple parameters in one URL', () => {
    const params = parseMovieProc(
      'solid,color=0 1 0 0.5,width=100,height=200,fps=30.movieproc',
    );
    expect(params.pattern).toBe('solid');
    expect(params.color).toEqual([0, 1, 0, 0.5]);
    expect(params.width).toBe(100);
    expect(params.height).toBe(200);
    expect(params.fps).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// ProceduralSourceNode Integration Tests
// ---------------------------------------------------------------------------

describe('ProceduralSourceNode', () => {
  it('creates node with correct type', () => {
    const node = new ProceduralSourceNode();
    expect(node.type).toBe('RVMovieProc');
    expect(node.name).toBe('Procedural Source');
  });

  it('loadFromMovieProc generates SMPTE bars image', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('smpte_bars,width=100,height=50.movieproc');

    expect(node.isReady()).toBe(true);
    const metadata = node.getMetadata();
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(50);

    const image = node.getIPImage();
    expect(image).not.toBeNull();
    expect(image!.width).toBe(100);
    expect(image!.height).toBe(50);
    expect(image!.channels).toBe(4);
    expect(image!.dataType).toBe('float32');
  });

  it('loadPattern generates solid fill', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('solid', 10, 10, { color: [1, 0, 0, 1] });

    expect(node.isReady()).toBe(true);
    const image = node.getIPImage();
    expect(image).not.toBeNull();

    const pixel = image!.getPixel(5, 5);
    expect(pixel[0]).toBe(1.0);
    expect(pixel[1]).toBe(0.0);
    expect(pixel[2]).toBe(0.0);
    expect(pixel[3]).toBe(1.0);
  });

  it('loadPattern with gradient', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('gradient', 11, 1, { direction: 'horizontal' });

    const image = node.getIPImage();
    expect(image).not.toBeNull();

    // First pixel should be 0, last should be 1
    const first = image!.getPixel(0, 0);
    const last = image!.getPixel(10, 0);
    expect(first[0]).toBeCloseTo(0.0, 5);
    expect(last[0]).toBeCloseTo(1.0, 5);
  });

  it('sets metadata correctly from movieproc URL', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('smpte_bars,start=1,end=100,fps=30,width=1280,height=720.movieproc');

    const metadata = node.getMetadata();
    expect(metadata.width).toBe(1280);
    expect(metadata.height).toBe(720);
    expect(metadata.fps).toBe(30);
    expect(metadata.duration).toBe(100); // end - start + 1
  });

  it('getElement returns null for procedural sources', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('solid', 10, 10);
    expect(node.getElement(1)).toBeNull();
  });

  it('isReady returns false before loading', () => {
    const node = new ProceduralSourceNode();
    expect(node.isReady()).toBe(false);
  });

  it('process returns IPImage with correct frame number', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('solid', 2, 2, { color: [1, 1, 1, 1] });

    const context = { frame: 42, width: 1920, height: 1080, quality: 'full' as const };
    const result = node.evaluate(context);
    expect(result).not.toBeNull();
    expect(result!.metadata.frameNumber).toBe(42);
  });

  it('toJSON includes pattern information', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('solid,color=1 0 0 1.movieproc');

    const json = node.toJSON() as Record<string, unknown>;
    expect(json.type).toBe('RVMovieProc');
    expect(json.pattern).toBeDefined();
  });

  it('dispose cleans up resources', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('solid', 10, 10);
    expect(node.isReady()).toBe(true);

    node.dispose();
    expect(node.isReady()).toBe(false);
    expect(node.getIPImage()).toBeNull();
  });

  it('defaults to 1920x1080 when no dimensions in movieproc URL', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('smpte_bars.movieproc');

    const metadata = node.getMetadata();
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1080);
  });

  it('loadFromMovieProc throws on invalid URL', () => {
    const node = new ProceduralSourceNode();
    expect(() => node.loadFromMovieProc('not_a_movieproc')).toThrow('Not a .movieproc URL');
  });

  it('loadFromMovieProc throws on unknown pattern', () => {
    const node = new ProceduralSourceNode();
    expect(() => node.loadFromMovieProc('noise.movieproc')).toThrow(
      'Unknown movieproc pattern: "noise"',
    );
  });
});
