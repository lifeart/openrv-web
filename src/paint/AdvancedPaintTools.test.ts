/**
 * AdvancedPaintTools Unit Tests
 *
 * Tests for Dodge, Burn, Clone, and Smudge tools.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DodgeTool,
  BurnTool,
  CloneTool,
  SmudgeTool,
  brushFalloff,
  forEachBrushPixel,
  samplePixel,
  createAdvancedTool,
  type PixelBuffer,
  type BrushParams,
} from './AdvancedPaintTools';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBuffer(width: number, height: number, fillValue = 0.5): PixelBuffer {
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillValue;
    data[i + 1] = fillValue;
    data[i + 2] = fillValue;
    data[i + 3] = 1.0;
  }
  return { data, width, height, channels: 4 };
}

function createGradientBuffer(width: number, height: number): PixelBuffer {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x / width;       // R increases with x
      data[i + 1] = y / height;  // G increases with y
      data[i + 2] = 0.5;         // B constant
      data[i + 3] = 1.0;
    }
  }
  return { data, width, height, channels: 4 };
}

function defaultBrush(overrides?: Partial<BrushParams>): BrushParams {
  return {
    size: 5,
    opacity: 1,
    pressure: 1,
    hardness: 1,
    ...overrides,
  };
}

function getPixel(buffer: PixelBuffer, x: number, y: number): [number, number, number, number] {
  const idx = (y * buffer.width + x) * 4;
  return [
    buffer.data[idx]!,
    buffer.data[idx + 1]!,
    buffer.data[idx + 2]!,
    buffer.data[idx + 3]!,
  ];
}

// ---------------------------------------------------------------------------
// brushFalloff tests
// ---------------------------------------------------------------------------

describe('brushFalloff', () => {
  it('APT-BF-001: returns 1 at center with hard brush', () => {
    expect(brushFalloff(0, 10, 1)).toBe(1);
  });

  it('APT-BF-002: returns 0 at edge', () => {
    expect(brushFalloff(10, 10, 1)).toBe(0);
  });

  it('APT-BF-003: returns 0 beyond radius', () => {
    expect(brushFalloff(15, 10, 1)).toBe(0);
  });

  it('APT-BF-004: soft brush has falloff from center', () => {
    const center = brushFalloff(0, 10, 0);
    const mid = brushFalloff(5, 10, 0);
    const edge = brushFalloff(9.9, 10, 0);
    expect(center).toBe(1);
    expect(mid).toBeLessThan(center);
    expect(edge).toBeLessThan(mid);
    expect(edge).toBeGreaterThan(0);
  });

  it('APT-BF-005: hardness 0.5 starts falloff at midpoint', () => {
    // At hardness 0.5, pixels within 50% radius should be full intensity
    const nearCenter = brushFalloff(3, 10, 0.5);
    expect(nearCenter).toBe(1);
    // Pixels beyond 50% radius should have falloff
    const outer = brushFalloff(7, 10, 0.5);
    expect(outer).toBeLessThan(1);
    expect(outer).toBeGreaterThan(0);
  });

  it('APT-BF-006: zero radius returns 0', () => {
    expect(brushFalloff(0, 0, 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// forEachBrushPixel tests
// ---------------------------------------------------------------------------

describe('forEachBrushPixel', () => {
  it('APT-FBP-001: visits pixels within radius', () => {
    const buffer = createBuffer(20, 20);
    const visited: number[] = [];

    forEachBrushPixel(buffer, { x: 10, y: 10 }, defaultBrush({ size: 2 }), (index) => {
      visited.push(index);
    });

    expect(visited.length).toBeGreaterThan(0);
    // Should only visit pixels within radius 2 of (10,10)
    expect(visited.length).toBeLessThanOrEqual(25); // 5x5 max area
  });

  it('APT-FBP-002: respects buffer boundaries', () => {
    const buffer = createBuffer(10, 10);
    const visited: Array<{ px: number; py: number }> = [];

    forEachBrushPixel(buffer, { x: 0, y: 0 }, defaultBrush({ size: 5 }), (_index, _intensity, px, py) => {
      visited.push({ px, py });
    });

    for (const { px, py } of visited) {
      expect(px).toBeGreaterThanOrEqual(0);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThan(10);
      expect(py).toBeLessThan(10);
    }
  });

  it('APT-FBP-003: intensity includes pressure scaling', () => {
    const buffer = createBuffer(20, 20);
    const intensities: number[] = [];

    forEachBrushPixel(buffer, { x: 10, y: 10 }, defaultBrush({ pressure: 0.5, hardness: 1 }), (_index, intensity) => {
      intensities.push(intensity);
    });

    // With pressure 0.5, max intensity should be 0.5 (at center with hard brush)
    const maxIntensity = Math.max(...intensities);
    expect(maxIntensity).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// samplePixel tests
// ---------------------------------------------------------------------------

describe('samplePixel', () => {
  it('APT-SP-001: reads correct pixel values', () => {
    const buffer = createBuffer(10, 10, 0.7);
    const pixel = samplePixel(buffer, 5, 5);
    expect(pixel[0]).toBeCloseTo(0.7, 5);
    expect(pixel[3]).toBeCloseTo(1.0, 5);
  });

  it('APT-SP-002: out of bounds returns zeros', () => {
    const buffer = createBuffer(10, 10);
    expect(samplePixel(buffer, -1, 0)).toEqual([0, 0, 0, 0]);
    expect(samplePixel(buffer, 10, 5)).toEqual([0, 0, 0, 0]);
    expect(samplePixel(buffer, 5, 10)).toEqual([0, 0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// DodgeTool tests
// ---------------------------------------------------------------------------

describe('DodgeTool', () => {
  let tool: DodgeTool;

  beforeEach(() => {
    tool = new DodgeTool();
  });

  it('APT-DODGE-001: lightens pixels', () => {
    const buffer = createBuffer(20, 20, 0.5);
    const before = getPixel(buffer, 10, 10);

    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush());
    const after = getPixel(buffer, 10, 10);

    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeGreaterThan(before[1]);
    expect(after[2]).toBeGreaterThan(before[2]);
  });

  it('APT-DODGE-002: produces finite non-negative values (HDR-compatible, no upper clamp)', () => {
    const buffer = createBuffer(20, 20, 0.95);

    // Apply dodge many times
    for (let i = 0; i < 50; i++) {
      tool.apply(buffer, { x: 10, y: 10 }, defaultBrush());
    }

    const pixel = getPixel(buffer, 10, 10);
    // Dodge no longer clamps to 1.0 to support HDR content.
    // Values will exceed 1.0 but should remain finite and non-negative.
    expect(pixel[0]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(pixel[0])).toBe(true);
    expect(pixel[1]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(pixel[1])).toBe(true);
    expect(pixel[2]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(pixel[2])).toBe(true);
  });

  it('APT-DODGE-003: does not modify alpha', () => {
    const buffer = createBuffer(20, 20, 0.5);
    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush());
    const pixel = getPixel(buffer, 10, 10);
    expect(pixel[3]).toBe(1.0);
  });

  it('APT-DODGE-004: pressure affects dodge amount', () => {
    const buffer1 = createBuffer(20, 20, 0.5);
    const buffer2 = createBuffer(20, 20, 0.5);

    tool.apply(buffer1, { x: 10, y: 10 }, defaultBrush({ pressure: 0.2 }));
    tool.apply(buffer2, { x: 10, y: 10 }, defaultBrush({ pressure: 1.0 }));

    const pixel1 = getPixel(buffer1, 10, 10);
    const pixel2 = getPixel(buffer2, 10, 10);

    // Higher pressure = more lightening
    expect(pixel2[0]).toBeGreaterThan(pixel1[0]);
  });

  it('APT-DODGE-005: custom strength affects dodge amount', () => {
    const buffer1 = createBuffer(20, 20, 0.5);
    const buffer2 = createBuffer(20, 20, 0.5);

    tool.strength = 0.1;
    tool.apply(buffer1, { x: 10, y: 10 }, defaultBrush());

    tool.strength = 0.9;
    tool.apply(buffer2, { x: 10, y: 10 }, defaultBrush());

    const pixel1 = getPixel(buffer1, 10, 10);
    const pixel2 = getPixel(buffer2, 10, 10);

    expect(pixel2[0]).toBeGreaterThan(pixel1[0]);
  });

  it('APT-DODGE-006: reset restores default strength', () => {
    tool.strength = 0.9;
    tool.reset();
    expect(tool.strength).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// BurnTool tests
// ---------------------------------------------------------------------------

describe('BurnTool', () => {
  let tool: BurnTool;

  beforeEach(() => {
    tool = new BurnTool();
  });

  it('APT-BURN-001: darkens pixels', () => {
    const buffer = createBuffer(20, 20, 0.5);
    const before = getPixel(buffer, 10, 10);

    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush());
    const after = getPixel(buffer, 10, 10);

    expect(after[0]).toBeLessThan(before[0]);
    expect(after[1]).toBeLessThan(before[1]);
    expect(after[2]).toBeLessThan(before[2]);
  });

  it('APT-BURN-002: does not go below 0', () => {
    const buffer = createBuffer(20, 20, 0.05);

    for (let i = 0; i < 50; i++) {
      tool.apply(buffer, { x: 10, y: 10 }, defaultBrush());
    }

    const pixel = getPixel(buffer, 10, 10);
    expect(pixel[0]).toBeGreaterThanOrEqual(0);
    expect(pixel[1]).toBeGreaterThanOrEqual(0);
    expect(pixel[2]).toBeGreaterThanOrEqual(0);
  });

  it('APT-BURN-003: does not modify alpha', () => {
    const buffer = createBuffer(20, 20, 0.5);
    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush());
    const pixel = getPixel(buffer, 10, 10);
    expect(pixel[3]).toBe(1.0);
  });

  it('APT-BURN-004: pressure affects burn amount', () => {
    const buffer1 = createBuffer(20, 20, 0.5);
    const buffer2 = createBuffer(20, 20, 0.5);

    tool.apply(buffer1, { x: 10, y: 10 }, defaultBrush({ pressure: 0.2 }));
    tool.apply(buffer2, { x: 10, y: 10 }, defaultBrush({ pressure: 1.0 }));

    const pixel1 = getPixel(buffer1, 10, 10);
    const pixel2 = getPixel(buffer2, 10, 10);

    // Higher pressure = more darkening (lower value)
    expect(pixel2[0]).toBeLessThan(pixel1[0]);
  });

  it('APT-BURN-005: dodge + burn is approximately inverse', () => {
    const buffer = createBuffer(20, 20, 0.5);

    const dodge = new DodgeTool();
    dodge.strength = 0.3;
    dodge.apply(buffer, { x: 10, y: 10 }, defaultBrush({ size: 1, hardness: 1 }));
    const afterDodge = getPixel(buffer, 10, 10)[0]!;

    tool.strength = 0.3;
    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush({ size: 1, hardness: 1 }));
    const afterBoth = getPixel(buffer, 10, 10)[0]!;

    // After dodge + burn, value should be close to original (but not exact due to clamping)
    expect(afterBoth).toBeCloseTo(0.5, 0);
    expect(afterDodge).toBeGreaterThan(afterBoth);
  });
});

// ---------------------------------------------------------------------------
// CloneTool tests
// ---------------------------------------------------------------------------

describe('CloneTool', () => {
  let tool: CloneTool;

  beforeEach(() => {
    tool = new CloneTool();
  });

  it('APT-CLONE-001: starts with no source', () => {
    expect(tool.sourceSet).toBe(false);
    expect(tool.sourceOffset).toBeNull();
  });

  it('APT-CLONE-002: setSource marks source as set', () => {
    tool.setSource({ x: 50, y: 50 });
    expect(tool.sourceSet).toBe(true);
  });

  it('APT-CLONE-003: apply without source is a no-op', () => {
    const buffer = createGradientBuffer(20, 20);
    const before = getPixel(buffer, 10, 10);

    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush());

    const after = getPixel(buffer, 10, 10);
    expect(after).toEqual(before);
  });

  it('APT-CLONE-004: clones pixels from source offset', () => {
    const buffer = createGradientBuffer(50, 50);

    // Set source at (30, 30)
    tool.setSource({ x: 30, y: 30 });
    // Begin stroke at (10, 10) - offset should be (20, 20)
    tool.beginStroke({ x: 10, y: 10 });

    const sourcePixel = getPixel(buffer, 30, 30);
    const destPixelBefore = getPixel(buffer, 10, 10);

    // These should be different in a gradient
    expect(sourcePixel[0]).not.toBeCloseTo(destPixelBefore[0], 1);

    // Apply at (10, 10) - should copy from (30, 30)
    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush({ size: 1, hardness: 1 }));

    const destPixelAfter = getPixel(buffer, 10, 10);
    // With full opacity, destination should now match source
    expect(destPixelAfter[0]).toBeCloseTo(sourcePixel[0], 1);
  });

  it('APT-CLONE-005: offset is maintained during stroke', () => {
    tool.setSource({ x: 30, y: 30 });
    tool.beginStroke({ x: 10, y: 10 });

    expect(tool.sourceOffset).toEqual({ x: 20, y: 20 });
  });

  it('APT-CLONE-006: reset clears source', () => {
    tool.setSource({ x: 50, y: 50 });
    tool.reset();
    expect(tool.sourceSet).toBe(false);
    expect(tool.sourceOffset).toBeNull();
  });

  it('APT-CLONE-007: partial opacity blends source and destination', () => {
    const buffer = createGradientBuffer(50, 50);

    tool.setSource({ x: 30, y: 30 });
    tool.beginStroke({ x: 10, y: 10 });

    const sourcePixel = getPixel(buffer, 30, 30);
    const destPixelBefore = getPixel(buffer, 10, 10);

    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush({ size: 1, hardness: 1, opacity: 0.5, pressure: 1 }));

    const destPixelAfter = getPixel(buffer, 10, 10);
    // Should be between source and original destination
    expect(destPixelAfter[0]).toBeGreaterThan(Math.min(sourcePixel[0], destPixelBefore[0]) - 0.01);
    expect(destPixelAfter[0]).toBeLessThan(Math.max(sourcePixel[0], destPixelBefore[0]) + 0.01);
  });
});

// ---------------------------------------------------------------------------
// SmudgeTool tests
// ---------------------------------------------------------------------------

describe('SmudgeTool', () => {
  let tool: SmudgeTool;

  beforeEach(() => {
    tool = new SmudgeTool();
  });

  it('APT-SMUDGE-001: first apply picks up color', () => {
    const buffer = createBuffer(20, 20, 0.8);

    tool.beginStroke({ x: 10, y: 10 });
    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush({ size: 1 }));

    expect(tool.carriedColor).not.toBeNull();
    expect(tool.carriedColor![0]).toBeCloseTo(0.8, 1);
  });

  it('APT-SMUDGE-002: subsequent applies blend carried color into pixels', () => {
    const buffer = createGradientBuffer(50, 50);

    tool.beginStroke({ x: 5, y: 25 });
    // Pick up color at (5, 25) - dark on the x axis
    tool.apply(buffer, { x: 5, y: 25 }, defaultBrush({ size: 1 }));

    const pickedColor = tool.carriedColor![0]!; // Should be low (5/50 = 0.1)
    expect(pickedColor).toBeCloseTo(0.1, 0);

    // Apply at (25, 25) where the pixel is brighter (25/50 = 0.5)
    const beforeSmudge = getPixel(buffer, 25, 25);

    tool.apply(buffer, { x: 25, y: 25 }, defaultBrush({ size: 1, hardness: 1 }));
    const afterSmudge = getPixel(buffer, 25, 25);

    // The pixel should have gotten darker (mixed with carried dark color)
    expect(afterSmudge[0]).toBeLessThan(beforeSmudge[0]);
  });

  it('APT-SMUDGE-003: strength controls carry amount', () => {
    const buffer1 = createGradientBuffer(50, 50);
    const buffer2 = createGradientBuffer(50, 50);

    const tool1 = new SmudgeTool();
    tool1.strength = 0.1; // Low carry
    tool1.beginStroke({ x: 5, y: 25 });
    tool1.apply(buffer1, { x: 5, y: 25 }, defaultBrush({ size: 1 }));
    tool1.apply(buffer1, { x: 25, y: 25 }, defaultBrush({ size: 1, hardness: 1 }));

    const tool2 = new SmudgeTool();
    tool2.strength = 0.9; // High carry
    tool2.beginStroke({ x: 5, y: 25 });
    tool2.apply(buffer2, { x: 5, y: 25 }, defaultBrush({ size: 1 }));
    tool2.apply(buffer2, { x: 25, y: 25 }, defaultBrush({ size: 1, hardness: 1 }));

    const after1 = getPixel(buffer1, 25, 25);
    const after2 = getPixel(buffer2, 25, 25);

    // Higher strength should carry more of the dark color -> darker result
    expect(after2[0]).toBeLessThan(after1[0]);
  });

  it('APT-SMUDGE-004: endStroke resets carried color', () => {
    tool.beginStroke({ x: 10, y: 10 });
    const buffer = createBuffer(20, 20, 0.5);
    tool.apply(buffer, { x: 10, y: 10 }, defaultBrush({ size: 1 }));
    expect(tool.carriedColor).not.toBeNull();

    tool.endStroke();
    expect(tool.carriedColor).toBeNull();
  });

  it('APT-SMUDGE-005: reset clears all state', () => {
    tool.strength = 0.9;
    tool.beginStroke({ x: 10, y: 10 });
    tool.reset();
    expect(tool.strength).toBe(0.5);
    expect(tool.carriedColor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createAdvancedTool tests
// ---------------------------------------------------------------------------

describe('createAdvancedTool', () => {
  it('APT-FAC-001: creates dodge tool', () => {
    const tool = createAdvancedTool('dodge');
    expect(tool.name).toBe('dodge');
    expect(tool).toBeInstanceOf(DodgeTool);
  });

  it('APT-FAC-002: creates burn tool', () => {
    const tool = createAdvancedTool('burn');
    expect(tool.name).toBe('burn');
    expect(tool).toBeInstanceOf(BurnTool);
  });

  it('APT-FAC-003: creates clone tool', () => {
    const tool = createAdvancedTool('clone');
    expect(tool.name).toBe('clone');
    expect(tool).toBeInstanceOf(CloneTool);
  });

  it('APT-FAC-004: creates smudge tool', () => {
    const tool = createAdvancedTool('smudge');
    expect(tool.name).toBe('smudge');
    expect(tool).toBeInstanceOf(SmudgeTool);
  });

  it('APT-FAC-005: throws for unknown tool', () => {
    expect(() => createAdvancedTool('unknown' as never)).toThrow('Unknown advanced paint tool');
  });
});
