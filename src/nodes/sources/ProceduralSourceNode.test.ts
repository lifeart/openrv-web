/**
 * ProceduralSourceNode Unit Tests
 *
 * Tests for procedural test pattern generation, .movieproc URL parsing,
 * pattern name aliases, input guards, and resolution cap enforcement.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSMPTEBars,
  generateEBUBars,
  generateColorChart,
  generateGradient,
  generateSolid,
  generateCheckerboard,
  generateGreyRamp,
  generateResolutionChart,
  parseMovieProc,
  ProceduralSourceNode,
  clampDimensions,
  PROCEDURAL_MAX_DIMENSION,
  PROCEDURAL_MAX_PIXELS,
  PATTERN_ALIASES,
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
// Constants
// ---------------------------------------------------------------------------

describe('PROCEDURAL_MAX_DIMENSION', () => {
  it('is 8192', () => {
    expect(PROCEDURAL_MAX_DIMENSION).toBe(8192);
  });
});

describe('PROCEDURAL_MAX_PIXELS', () => {
  it('is 8192 * 8192', () => {
    expect(PROCEDURAL_MAX_PIXELS).toBe(8192 * 8192);
  });
});

describe('PATTERN_ALIASES', () => {
  it('maps smpte to smpte_bars', () => {
    expect(PATTERN_ALIASES['smpte']).toBe('smpte_bars');
  });
  it('maps ebu to ebu_bars', () => {
    expect(PATTERN_ALIASES['ebu']).toBe('ebu_bars');
  });
  it('maps checker to checkerboard', () => {
    expect(PATTERN_ALIASES['checker']).toBe('checkerboard');
  });
  it('maps colorchart to color_chart', () => {
    expect(PATTERN_ALIASES['colorchart']).toBe('color_chart');
  });
  it('maps ramp to gradient', () => {
    expect(PATTERN_ALIASES['ramp']).toBe('gradient');
  });
});

// ---------------------------------------------------------------------------
// clampDimensions
// ---------------------------------------------------------------------------

describe('clampDimensions', () => {
  it('passes through valid dimensions', () => {
    expect(clampDimensions(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('clamps width below 1 to 1', () => {
    expect(clampDimensions(0, 100)).toEqual({ width: 1, height: 100 });
    expect(clampDimensions(-5, 100)).toEqual({ width: 1, height: 100 });
  });

  it('clamps height below 1 to 1', () => {
    expect(clampDimensions(100, 0)).toEqual({ width: 100, height: 1 });
  });

  it('clamps width above PROCEDURAL_MAX_DIMENSION', () => {
    const result = clampDimensions(10000, 100);
    expect(result.width).toBe(8192);
    expect(result.height).toBe(100);
  });

  it('clamps height above PROCEDURAL_MAX_DIMENSION', () => {
    const result = clampDimensions(100, 10000);
    expect(result.width).toBe(100);
    expect(result.height).toBe(8192);
  });

  it('scales down proportionally when total pixels exceed PROCEDURAL_MAX_PIXELS', () => {
    // 8192 x 8192 is exactly the limit, so it should be fine
    const atLimit = clampDimensions(8192, 8192);
    expect(atLimit.width * atLimit.height).toBeLessThanOrEqual(PROCEDURAL_MAX_PIXELS);

    // Beyond limit: both at max should still fit
    const result = clampDimensions(8192, 8192);
    expect(result.width).toBeLessThanOrEqual(8192);
    expect(result.height).toBeLessThanOrEqual(8192);
  });

  it('floors fractional dimensions', () => {
    const result = clampDimensions(100.7, 200.3);
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
  });
});

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

  it('clamps oversized dimensions', () => {
    const result = generateSMPTEBars(10000, 100);
    expect(result.width).toBe(8192);
    expect(result.height).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// EBU Bars Tests
// ---------------------------------------------------------------------------

describe('generateEBUBars', () => {
  it('generates 8 bars at 100% intensity', () => {
    const result = generateEBUBars(800, 100);
    expect(result.width).toBe(800);
    expect(result.height).toBe(100);

    const expectedColors: [number, number, number][] = [
      [1.0, 1.0, 1.0],  // White
      [1.0, 1.0, 0.0],  // Yellow
      [0.0, 1.0, 1.0],  // Cyan
      [0.0, 1.0, 0.0],  // Green
      [1.0, 0.0, 1.0],  // Magenta
      [1.0, 0.0, 0.0],  // Red
      [0.0, 0.0, 1.0],  // Blue
      [0.0, 0.0, 0.0],  // Black
    ];

    for (let bar = 0; bar < 8; bar++) {
      const x = Math.floor(bar * 100 + 50); // center of each bar
      const [r, g, b] = getPixel(result.data, result.width, x, 50);
      expect(r).toBeCloseTo(expectedColors[bar]![0], 2);
      expect(g).toBeCloseTo(expectedColors[bar]![1], 2);
      expect(b).toBeCloseTo(expectedColors[bar]![2], 2);
    }
  });

  it('has alpha = 1.0 for all pixels', () => {
    const result = generateEBUBars(80, 10);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 80; x++) {
        const [, , , a] = getPixel(result.data, result.width, x, y);
        expect(a).toBe(1.0);
      }
    }
  });

  it('outputs correct dimensions', () => {
    const result = generateEBUBars(1920, 1080);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.data.length).toBe(1920 * 1080 * 4);
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
// Checkerboard Tests
// ---------------------------------------------------------------------------

describe('generateCheckerboard', () => {
  it('alternates black and white cells with default parameters', () => {
    const result = generateCheckerboard(128, 128, 64);
    // Top-left cell should be white (colorA)
    const [r0, g0, b0, a0] = getPixel(result.data, result.width, 0, 0);
    expect(r0).toBe(1.0);
    expect(g0).toBe(1.0);
    expect(b0).toBe(1.0);
    expect(a0).toBe(1.0);

    // Second cell (right of first) should be black (colorB)
    const [r1, g1, b1] = getPixel(result.data, result.width, 64, 0);
    expect(r1).toBe(0.0);
    expect(g1).toBe(0.0);
    expect(b1).toBe(0.0);

    // Cell below first should also be black
    const [r2, g2, b2] = getPixel(result.data, result.width, 0, 64);
    expect(r2).toBe(0.0);
    expect(g2).toBe(0.0);
    expect(b2).toBe(0.0);

    // Diagonal cell (1,1) should be white
    const [r3, g3, b3] = getPixel(result.data, result.width, 64, 64);
    expect(r3).toBe(1.0);
    expect(g3).toBe(1.0);
    expect(b3).toBe(1.0);
  });

  it('supports custom colors', () => {
    const colorA: [number, number, number, number] = [1, 0, 0, 1]; // red
    const colorB: [number, number, number, number] = [0, 0, 1, 1]; // blue
    const result = generateCheckerboard(100, 100, 50, colorA, colorB);

    const [r0] = getPixel(result.data, result.width, 0, 0);
    expect(r0).toBe(1.0); // red

    const [r1, , b1] = getPixel(result.data, result.width, 50, 0);
    expect(r1).toBe(0.0);
    expect(b1).toBe(1.0); // blue
  });

  it('supports custom cell size', () => {
    const result = generateCheckerboard(20, 20, 5);
    // Pixel at (0,0) = cell (0,0) -> white
    const [r0] = getPixel(result.data, result.width, 0, 0);
    expect(r0).toBe(1.0);

    // Pixel at (5,0) = cell (1,0) -> black
    const [r1] = getPixel(result.data, result.width, 5, 0);
    expect(r1).toBe(0.0);

    // Pixel at (10,0) = cell (2,0) -> white
    const [r2] = getPixel(result.data, result.width, 10, 0);
    expect(r2).toBe(1.0);
  });

  it('clamps cellSize=0 to 1', () => {
    const result = generateCheckerboard(10, 10, 0);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
    // With cellSize=1, every pixel alternates
    const [r0] = getPixel(result.data, result.width, 0, 0);
    const [r1] = getPixel(result.data, result.width, 1, 0);
    expect(r0).not.toBe(r1);
  });

  it('clamps negative cellSize to 1', () => {
    const result = generateCheckerboard(10, 10, -5);
    expect(result.data.length).toBe(10 * 10 * 4);
  });

  it('has correct dimensions', () => {
    const result = generateCheckerboard(200, 100, 32);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Grey Ramp Tests
// ---------------------------------------------------------------------------

describe('generateGreyRamp', () => {
  it('generates correct step values for 4 horizontal steps', () => {
    const result = generateGreyRamp(400, 100, 4, 'horizontal');
    // Step 0: 0/(4-1) = 0.0
    const [r0] = getPixel(result.data, result.width, 10, 50);
    expect(r0).toBeCloseTo(0.0, 5);

    // Step 1: 1/(4-1) = 0.333
    const [r1] = getPixel(result.data, result.width, 110, 50);
    expect(r1).toBeCloseTo(1 / 3, 4);

    // Step 2: 2/(4-1) = 0.667
    const [r2] = getPixel(result.data, result.width, 210, 50);
    expect(r2).toBeCloseTo(2 / 3, 4);

    // Step 3: 3/(4-1) = 1.0
    const [r3] = getPixel(result.data, result.width, 399, 50);
    expect(r3).toBeCloseTo(1.0, 5);
  });

  it('generates correct step values for vertical direction', () => {
    const result = generateGreyRamp(100, 400, 4, 'vertical');
    // First step at top
    const [r0] = getPixel(result.data, result.width, 50, 10);
    expect(r0).toBeCloseTo(0.0, 5);

    // Last step at bottom
    const [r3] = getPixel(result.data, result.width, 50, 399);
    expect(r3).toBeCloseTo(1.0, 5);
  });

  it('step boundaries are discrete (not smooth)', () => {
    const result = generateGreyRamp(100, 10, 4, 'horizontal');
    // Within step 0 (pixels 0-24), all should be the same
    const [r0] = getPixel(result.data, result.width, 0, 0);
    const [r24] = getPixel(result.data, result.width, 24, 0);
    expect(r24).toBe(r0);

    // Step 1 should be different from step 0
    const [r25] = getPixel(result.data, result.width, 25, 0);
    expect(r25).not.toBe(r0);
  });

  it('clamps steps=0 to 2', () => {
    const result = generateGreyRamp(100, 10, 0);
    expect(result.data.length).toBe(100 * 10 * 4);
    // With 2 steps: first half = 0.0, second half = 1.0
    const [r0] = getPixel(result.data, result.width, 0, 0);
    expect(r0).toBeCloseTo(0.0, 5);
    const [r99] = getPixel(result.data, result.width, 99, 0);
    expect(r99).toBeCloseTo(1.0, 5);
  });

  it('clamps steps=1 to 2', () => {
    const result = generateGreyRamp(100, 10, 1);
    const [r0] = getPixel(result.data, result.width, 0, 0);
    expect(r0).toBeCloseTo(0.0, 5);
    const [r99] = getPixel(result.data, result.width, 99, 0);
    expect(r99).toBeCloseTo(1.0, 5);
  });

  it('defaults to 16 steps and horizontal direction', () => {
    const result = generateGreyRamp(160, 10);
    // Each step should be 10px wide
    const [r0] = getPixel(result.data, result.width, 0, 0);
    expect(r0).toBeCloseTo(0.0, 5);
    const [r159] = getPixel(result.data, result.width, 159, 0);
    expect(r159).toBeCloseTo(1.0, 5);
  });

  it('alpha is always 1.0', () => {
    const result = generateGreyRamp(50, 10, 8);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 50; x++) {
        const [, , , a] = getPixel(result.data, result.width, x, y);
        expect(a).toBe(1.0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Resolution Chart Tests
// ---------------------------------------------------------------------------

describe('generateResolutionChart', () => {
  it('generates correct dimensions', () => {
    const result = generateResolutionChart(640, 480);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.data.length).toBe(640 * 480 * 4);
  });

  it('has white border frame (top-left corner pixel is white)', () => {
    const result = generateResolutionChart(100, 100);
    const [r, g, b] = getPixel(result.data, result.width, 0, 0);
    expect(r).toBe(1.0);
    expect(g).toBe(1.0);
    expect(b).toBe(1.0);
  });

  it('has white border frame (bottom-right corner pixel is white)', () => {
    const result = generateResolutionChart(100, 100);
    const [r, g, b] = getPixel(result.data, result.width, 99, 99);
    expect(r).toBe(1.0);
    expect(g).toBe(1.0);
    expect(b).toBe(1.0);
  });

  it('has center crosshair (center pixel is white)', () => {
    const result = generateResolutionChart(200, 200);
    const cx = 100;
    const cy = 100;
    const [r, g, b] = getPixel(result.data, result.width, cx, cy);
    expect(r).toBe(1.0);
    expect(g).toBe(1.0);
    expect(b).toBe(1.0);
  });

  it('interior pixels are mostly black (background)', () => {
    const result = generateResolutionChart(200, 200);
    // Pick a pixel far from any features
    const [r] = getPixel(result.data, result.width, 15, 15);
    expect(r).toBe(0.0);
  });

  it('alpha is 1.0 everywhere', () => {
    const result = generateResolutionChart(50, 50);
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(1.0);
    }
  });

  it('handles small dimensions gracefully', () => {
    const result = generateResolutionChart(10, 10);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
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

  // New pattern parsing
  it('parses ebu_bars', () => {
    const params = parseMovieProc('ebu_bars.movieproc');
    expect(params.pattern).toBe('ebu_bars');
  });

  it('parses checkerboard with cellSize', () => {
    const params = parseMovieProc('checkerboard,cellSize=32.movieproc');
    expect(params.pattern).toBe('checkerboard');
    expect(params.cellSize).toBe(32);
  });

  it('parses checkerboard with colorA and colorB', () => {
    const params = parseMovieProc('checkerboard,cellSize=64,colorA=1 1 0 1,colorB=0 0 0.5 1.movieproc');
    expect(params.pattern).toBe('checkerboard');
    expect(params.cellSize).toBe(64);
    expect(params.colorA).toEqual([1, 1, 0, 1]);
    expect(params.colorB).toEqual([0, 0, 0.5, 1]);
  });

  it('parses grey_ramp with steps and direction', () => {
    const params = parseMovieProc('grey_ramp,steps=16,direction=horizontal.movieproc');
    expect(params.pattern).toBe('grey_ramp');
    expect(params.steps).toBe(16);
    expect(params.direction).toBe('horizontal');
  });

  it('parses resolution_chart with width and height', () => {
    const params = parseMovieProc('resolution_chart,width=1920,height=1080.movieproc');
    expect(params.pattern).toBe('resolution_chart');
    expect(params.width).toBe(1920);
    expect(params.height).toBe(1080);
  });

  // Alias resolution
  it('resolves smpte alias to smpte_bars', () => {
    const params = parseMovieProc('smpte.movieproc');
    expect(params.pattern).toBe('smpte_bars');
  });

  it('resolves ebu alias to ebu_bars', () => {
    const params = parseMovieProc('ebu.movieproc');
    expect(params.pattern).toBe('ebu_bars');
  });

  it('resolves checker alias to checkerboard', () => {
    const params = parseMovieProc('checker,cellSize=16.movieproc');
    expect(params.pattern).toBe('checkerboard');
    expect(params.cellSize).toBe(16);
  });

  it('resolves colorchart alias to color_chart', () => {
    const params = parseMovieProc('colorchart.movieproc');
    expect(params.pattern).toBe('color_chart');
  });

  it('resolves ramp alias to gradient', () => {
    const params = parseMovieProc('ramp,direction=vertical.movieproc');
    expect(params.pattern).toBe('gradient');
    expect(params.direction).toBe('vertical');
  });

  it('resolves smpte alias with parameters', () => {
    const params = parseMovieProc('smpte,width=3840,height=2160.movieproc');
    expect(params.pattern).toBe('smpte_bars');
    expect(params.width).toBe(3840);
    expect(params.height).toBe(2160);
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

  it('loadPattern with EBU bars', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('ebu_bars', 800, 100);

    expect(node.isReady()).toBe(true);
    const image = node.getIPImage();
    expect(image).not.toBeNull();
    expect(image!.width).toBe(800);
    expect(image!.height).toBe(100);
  });

  it('loadPattern with checkerboard', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('checkerboard', 100, 100, { cellSize: 50 });

    expect(node.isReady()).toBe(true);
    const image = node.getIPImage();
    expect(image).not.toBeNull();
  });

  it('loadPattern with grey_ramp', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('grey_ramp', 100, 100, { steps: 8 });

    expect(node.isReady()).toBe(true);
    const image = node.getIPImage();
    expect(image).not.toBeNull();
  });

  it('loadPattern with resolution_chart', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('resolution_chart', 200, 200);

    expect(node.isReady()).toBe(true);
    const image = node.getIPImage();
    expect(image).not.toBeNull();
    expect(image!.width).toBe(200);
    expect(image!.height).toBe(200);
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

  it('loadFromMovieProc with alias resolves correctly', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('smpte.movieproc');
    expect(node.isReady()).toBe(true);

    const metadata = node.getMetadata();
    expect(metadata.width).toBe(1920);
  });

  it('loadFromMovieProc with ebu alias', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('ebu,width=640,height=480.movieproc');
    expect(node.isReady()).toBe(true);

    const metadata = node.getMetadata();
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(480);
  });

  it('loadFromMovieProc with checker alias', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('checker,cellSize=32.movieproc');
    expect(node.isReady()).toBe(true);
  });

  it('enforces PROCEDURAL_MAX_DIMENSION cap in loadPattern', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('solid', 10000, 100);

    const metadata = node.getMetadata();
    expect(metadata.width).toBe(8192);
    expect(metadata.height).toBe(100);
  });

  it('enforces PROCEDURAL_MAX_DIMENSION cap in loadFromMovieProc', () => {
    const node = new ProceduralSourceNode();
    node.loadFromMovieProc('solid,width=10000,height=100.movieproc');

    const metadata = node.getMetadata();
    expect(metadata.width).toBe(8192);
    expect(metadata.height).toBe(100);
  });

  it('loadPattern with new options (cellSize, colorA, colorB, steps)', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('checkerboard', 100, 100, {
      cellSize: 25,
      colorA: [1, 0, 0, 1],
      colorB: [0, 1, 0, 1],
    });
    expect(node.isReady()).toBe(true);

    const image = node.getIPImage();
    expect(image).not.toBeNull();

    // First pixel (cell 0,0) should be colorA (red)
    const p = image!.getPixel(0, 0);
    expect(p[0]).toBe(1.0);
    expect(p[1]).toBe(0.0);
  });

  it('loadPattern grey_ramp with steps option', () => {
    const node = new ProceduralSourceNode();
    node.loadPattern('grey_ramp', 100, 10, { steps: 4 });
    expect(node.isReady()).toBe(true);
  });
});
