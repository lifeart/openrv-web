/**
 * Pressure Mapping Unit Tests
 *
 * Tests for PressureMapping type, adjustSaturation utility,
 * and PaintRenderer pressure modulation behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PRESSURE_MAPPING,
  adjustSaturation,
  BrushType,
  StrokeMode,
  LineCap,
  LineJoin,
  PenStroke,
  StrokePoint,
} from './types';
import { PaintRenderer, RenderOptions } from './PaintRenderer';

// ---------------------------------------------------------------------------
// adjustSaturation tests
// ---------------------------------------------------------------------------

describe('adjustSaturation', () => {
  it('PRESS-001: factor=1 returns original color unchanged', () => {
    const color: [number, number, number, number] = [1, 0.3, 0.3, 1];
    const result = adjustSaturation(color, 1);
    expect(result[0]).toBeCloseTo(1, 6);
    expect(result[1]).toBeCloseTo(0.3, 6);
    expect(result[2]).toBeCloseTo(0.3, 6);
    expect(result[3]).toBe(1);
  });

  it('PRESS-002: factor=0 produces grayscale (luminance)', () => {
    const color: [number, number, number, number] = [1, 0, 0, 1]; // pure red
    const result = adjustSaturation(color, 0);
    // All channels should be equal to luminance
    const luma = 0.2126 * 1 + 0.7152 * 0 + 0.0722 * 0;
    expect(result[0]).toBeCloseTo(luma, 6);
    expect(result[1]).toBeCloseTo(luma, 6);
    expect(result[2]).toBeCloseTo(luma, 6);
    expect(result[3]).toBe(1);
  });

  it('PRESS-003: factor=0.5 halves saturation', () => {
    const color: [number, number, number, number] = [1, 0, 0, 1];
    const result = adjustSaturation(color, 0.5);
    // Halfway between luminance and original
    const luma = 0.2126;
    expect(result[0]).toBeCloseTo(luma + (1 - luma) * 0.5, 6);
    expect(result[1]).toBeCloseTo(luma + (0 - luma) * 0.5, 6);
    expect(result[2]).toBeCloseTo(luma + (0 - luma) * 0.5, 6);
  });

  it('preserves alpha channel', () => {
    const color: [number, number, number, number] = [0.5, 0.5, 0.5, 0.7];
    const result = adjustSaturation(color, 0);
    expect(result[3]).toBe(0.7);
  });

  it('handles grayscale input (no change)', () => {
    const gray: [number, number, number, number] = [0.5, 0.5, 0.5, 1];
    const result = adjustSaturation(gray, 0.5);
    // Gray has zero saturation, so any factor should produce the same gray
    expect(result[0]).toBeCloseTo(0.5, 6);
    expect(result[1]).toBeCloseTo(0.5, 6);
    expect(result[2]).toBeCloseTo(0.5, 6);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_PRESSURE_MAPPING tests
// ---------------------------------------------------------------------------

describe('DEFAULT_PRESSURE_MAPPING', () => {
  it('PRESS-004: defaults to width only', () => {
    expect(DEFAULT_PRESSURE_MAPPING.width).toBe(true);
    expect(DEFAULT_PRESSURE_MAPPING.opacity).toBe(false);
    expect(DEFAULT_PRESSURE_MAPPING.saturation).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PaintRenderer pressure mapping integration
// ---------------------------------------------------------------------------

function makeGaussianStroke(
  points: StrokePoint[],
  overrides: Partial<PenStroke> = {},
): PenStroke {
  return {
    type: 'pen',
    id: 'test-stroke',
    frame: 1,
    user: 'test',
    color: [1, 0, 0, 1],
    width: 10,
    brush: BrushType.Gaussian,
    points,
    join: LineJoin.Round,
    cap: LineCap.Round,
    splat: true,
    mode: StrokeMode.Draw,
    startFrame: 1,
    duration: 1,
    ...overrides,
  };
}

const renderOptions: RenderOptions = {
  width: 100,
  height: 100,
};

describe('PaintRenderer pressure mapping', () => {
  let renderer: PaintRenderer;

  beforeEach(() => {
    renderer = new PaintRenderer();
    renderer.resize(100, 100);
  });

  it('PRESS-005: default pressureMapping has width=true', () => {
    expect(renderer.pressureMapping.width).toBe(true);
    expect(renderer.pressureMapping.opacity).toBe(false);
    expect(renderer.pressureMapping.saturation).toBe(false);
  });

  it('PRESS-006: pressureMapping can be set', () => {
    renderer.pressureMapping = { width: false, opacity: true, saturation: true };
    expect(renderer.pressureMapping.opacity).toBe(true);
    expect(renderer.pressureMapping.saturation).toBe(true);
    expect(renderer.pressureMapping.width).toBe(false);
  });

  it('PRESS-007: renders Gaussian stroke with pressure without errors', () => {
    const stroke = makeGaussianStroke([
      { x: 0.2, y: 0.5, pressure: 0.5 },
      { x: 0.5, y: 0.5, pressure: 1.0 },
      { x: 0.8, y: 0.5, pressure: 0.3 },
    ]);

    expect(() => renderer.renderStroke(stroke, renderOptions)).not.toThrow();
  });

  it('PRESS-008: opacity mapping renders without errors', () => {
    renderer.pressureMapping = { width: false, opacity: true, saturation: false };

    const stroke = makeGaussianStroke([
      { x: 0.2, y: 0.5, pressure: 0.1 },
      { x: 0.5, y: 0.5, pressure: 0.5 },
      { x: 0.8, y: 0.5, pressure: 1.0 },
    ]);

    expect(() => renderer.renderStroke(stroke, renderOptions)).not.toThrow();
  });

  it('PRESS-009: saturation mapping renders without errors', () => {
    renderer.pressureMapping = { width: false, opacity: false, saturation: true };

    const stroke = makeGaussianStroke([
      { x: 0.3, y: 0.5, pressure: 0.0 }, // fully desaturated
      { x: 0.5, y: 0.5, pressure: 0.5 },
      { x: 0.7, y: 0.5, pressure: 1.0 }, // full saturation
    ]);

    expect(() => renderer.renderStroke(stroke, renderOptions)).not.toThrow();
  });

  it('PRESS-010: all three mappings enabled simultaneously', () => {
    renderer.pressureMapping = { width: true, opacity: true, saturation: true };

    const stroke = makeGaussianStroke([
      { x: 0.2, y: 0.5, pressure: 0.3 },
      { x: 0.5, y: 0.5, pressure: 0.7 },
      { x: 0.8, y: 0.5, pressure: 1.0 },
    ]);

    expect(() => renderer.renderStroke(stroke, renderOptions)).not.toThrow();
  });

  it('PRESS-011: pressure=undefined defaults to 1 (no modulation)', () => {
    renderer.pressureMapping = { width: true, opacity: true, saturation: true };

    const stroke = makeGaussianStroke([
      { x: 0.5, y: 0.5 }, // no pressure field
    ]);

    expect(() => renderer.renderStroke(stroke, renderOptions)).not.toThrow();
  });

  it('PRESS-012: all mappings disabled skips modulation', () => {
    renderer.pressureMapping = { width: false, opacity: false, saturation: false };

    const stroke = makeGaussianStroke([
      { x: 0.5, y: 0.5, pressure: 0.1 },
    ]);

    // Should render without pressure affecting anything
    expect(() => renderer.renderStroke(stroke, renderOptions)).not.toThrow();
  });
});
