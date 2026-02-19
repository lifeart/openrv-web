/**
 * LayoutProcessor Tiled Rendering Tests
 *
 * Tests for the LayoutProcessor's computeTileViewports() method
 * and its integration with layout modes.
 */

import { describe, it, expect } from 'vitest';
import { LayoutProcessor } from './LayoutProcessor';

describe('LayoutProcessor.computeTileViewports', () => {
  it('LP-TILE-001: row mode computes horizontal tiles', () => {
    const processor = new LayoutProcessor({ mode: 'row' });
    const viewports = processor.computeTileViewports(800, 400, 3);

    // 3 columns, 1 row
    expect(viewports).toHaveLength(3);
    expect(viewports[0]!.width).toBe(Math.floor(800 / 3));
    expect(viewports[0]!.height).toBe(400);
  });

  it('LP-TILE-002: column mode computes vertical tiles', () => {
    const processor = new LayoutProcessor({ mode: 'column' });
    const viewports = processor.computeTileViewports(400, 800, 3);

    // 1 column, 3 rows
    expect(viewports).toHaveLength(3);
    expect(viewports[0]!.width).toBe(400);
    expect(viewports[0]!.height).toBe(Math.floor(800 / 3));
  });

  it('LP-TILE-003: grid mode with 4 inputs produces 2x2 grid', () => {
    const processor = new LayoutProcessor({ mode: 'grid', columns: 2, rows: 2 });
    const viewports = processor.computeTileViewports(800, 600, 4);

    expect(viewports).toHaveLength(4);
    expect(viewports[0]!.width).toBe(400);
    expect(viewports[0]!.height).toBe(300);
  });

  it('LP-TILE-004: spacing is applied correctly', () => {
    const processor = new LayoutProcessor({ mode: 'grid', columns: 2, rows: 2, spacing: 10 });
    const viewports = processor.computeTileViewports(810, 610, 4);

    // Available: 810 - 10 = 800 -> 400 per col
    // Available: 610 - 10 = 600 -> 300 per row
    expect(viewports[0]!.width).toBe(400);
    expect(viewports[0]!.height).toBe(300);
  });

  it('LP-TILE-005: auto-calculate grid for 4 inputs', () => {
    const processor = new LayoutProcessor({ mode: 'grid', columns: 0, rows: 0 });
    const viewports = processor.computeTileViewports(800, 600, 4);

    // sqrt(4) = 2, so 2x2
    expect(viewports).toHaveLength(4);
  });

  it('LP-TILE-006: auto-calculate grid for 6 inputs', () => {
    const processor = new LayoutProcessor({ mode: 'grid', columns: 0, rows: 0 });
    const viewports = processor.computeTileViewports(800, 600, 6);

    // sqrt(6) ~ 2.45 -> ceil = 3 cols, ceil(6/3) = 2 rows -> 3x2
    expect(viewports).toHaveLength(6);
  });

  it('LP-TILE-007: setConfig updates spacing', () => {
    const processor = new LayoutProcessor({ mode: 'grid', columns: 2, rows: 2, spacing: 0 });
    processor.setConfig({ spacing: 20 });

    const viewports = processor.computeTileViewports(820, 620, 4);

    // Available: 820 - 20 = 800 -> 400 per col
    expect(viewports[0]!.width).toBe(400);
  });

  it('LP-TILE-008: single input uses full canvas', () => {
    const processor = new LayoutProcessor({ mode: 'row' });
    const viewports = processor.computeTileViewports(1920, 1080, 1);

    expect(viewports).toHaveLength(1);
    expect(viewports[0]).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('LP-TILE-009: getConfig reflects current settings', () => {
    const processor = new LayoutProcessor({ mode: 'grid', columns: 3, rows: 2, spacing: 5 });
    const config = processor.getConfig();

    expect(config.mode).toBe('grid');
    expect(config.columns).toBe(3);
    expect(config.rows).toBe(2);
    expect(config.spacing).toBe(5);
  });

  it('LP-TILE-010: viewports are consistent with LayoutGroupNode', () => {
    // The LayoutProcessor delegates to the same computeTileViewports function
    // as LayoutGroupNode, so results should match
    const processor = new LayoutProcessor({ mode: 'grid', columns: 2, rows: 2, spacing: 5 });
    const viewports = processor.computeTileViewports(800, 600, 4);

    // Verify basic invariants
    expect(viewports).toHaveLength(4);
    for (const vp of viewports) {
      expect(vp.width).toBeGreaterThan(0);
      expect(vp.height).toBeGreaterThan(0);
      expect(vp.x).toBeGreaterThanOrEqual(0);
      expect(vp.y).toBeGreaterThanOrEqual(0);
    }
  });
});
