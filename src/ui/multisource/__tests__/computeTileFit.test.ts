/**
 * Tests for computeTileFit - per-tile aspect-ratio fitting calculation.
 */

import { describe, it, expect } from 'vitest';
import { computeTileFit } from '../computeTileFit';

describe('computeTileFit', () => {
  it('returns identity when source matches tile aspect ratio', () => {
    const result = computeTileFit(1920, 1080, 960, 540);
    expect(result.scaleX).toBeCloseTo(1.0);
    expect(result.scaleY).toBeCloseTo(1.0);
    expect(result.offsetX).toBeCloseTo(0);
    expect(result.offsetY).toBeCloseTo(0);
  });

  it('letterboxes when source is wider than tile', () => {
    // 16:9 source in a square tile
    const result = computeTileFit(1920, 1080, 500, 500);
    expect(result.scaleX).toBeCloseTo(1.0);
    expect(result.scaleY).toBeLessThan(1.0);
    expect(result.offsetX).toBeCloseTo(0);
    expect(result.offsetY).toBeGreaterThan(0);

    // scaleY = tileAspect / sourceAspect = (500/500) / (1920/1080) = 1 / 1.778 ≈ 0.5625
    expect(result.scaleY).toBeCloseTo(1080 / 1920);
    // offsetY = (1 - scaleY) / 2 ≈ (1 - 0.5625) / 2 ≈ 0.21875
    expect(result.offsetY).toBeCloseTo((1 - 1080 / 1920) / 2);
  });

  it('pillarboxes when source is taller than tile', () => {
    // 9:16 source in a square tile
    const result = computeTileFit(1080, 1920, 500, 500);
    expect(result.scaleX).toBeLessThan(1.0);
    expect(result.scaleY).toBeCloseTo(1.0);
    expect(result.offsetX).toBeGreaterThan(0);
    expect(result.offsetY).toBeCloseTo(0);

    // scaleX = sourceAspect / tileAspect = (1080/1920) / (500/500) = 0.5625
    expect(result.scaleX).toBeCloseTo(1080 / 1920);
  });

  it('handles square source in wide tile', () => {
    // Square source in 2:1 tile
    const result = computeTileFit(1000, 1000, 2000, 1000);
    // Source aspect = 1, tile aspect = 2
    // Source taller than tile: pillarbox
    expect(result.scaleX).toBeCloseTo(0.5); // 1/2
    expect(result.scaleY).toBeCloseTo(1.0);
    expect(result.offsetX).toBeCloseTo(0.25);
    expect(result.offsetY).toBeCloseTo(0);
  });

  it('handles square source in tall tile', () => {
    // Square source in 1:2 tile
    const result = computeTileFit(1000, 1000, 500, 1000);
    // Source aspect = 1, tile aspect = 0.5
    // Source wider than tile: letterbox
    expect(result.scaleX).toBeCloseTo(1.0);
    expect(result.scaleY).toBeCloseTo(0.5);
    expect(result.offsetX).toBeCloseTo(0);
    expect(result.offsetY).toBeCloseTo(0.25);
  });

  it('handles zero source dimensions gracefully', () => {
    const result = computeTileFit(0, 0, 500, 500);
    expect(result.scaleX).toBe(1);
    expect(result.scaleY).toBe(1);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it('handles zero tile dimensions gracefully', () => {
    const result = computeTileFit(1920, 1080, 0, 0);
    expect(result.scaleX).toBe(1);
    expect(result.scaleY).toBe(1);
  });

  it('handles negative dimensions gracefully', () => {
    const result = computeTileFit(-100, -100, 500, 500);
    expect(result.scaleX).toBe(1);
    expect(result.scaleY).toBe(1);
  });

  it('offset + scale always sums to 1 in each axis', () => {
    const testCases = [
      [1920, 1080, 500, 500],
      [1080, 1920, 500, 500],
      [640, 480, 1000, 800],
      [3840, 2160, 320, 240],
      [100, 1000, 500, 500],
    ] as const;

    for (const [sw, sh, tw, th] of testCases) {
      const result = computeTileFit(sw, sh, tw, th);
      // offsetX * 2 + scaleX should equal 1
      expect(result.offsetX * 2 + result.scaleX).toBeCloseTo(1.0);
      expect(result.offsetY * 2 + result.scaleY).toBeCloseTo(1.0);
    }
  });

  it('scale is always in [0, 1] range', () => {
    const testCases = [
      [1, 1, 1, 1],
      [1920, 1080, 100, 100],
      [100, 100, 1920, 1080],
      [1, 10000, 10000, 1],
    ] as const;

    for (const [sw, sh, tw, th] of testCases) {
      const result = computeTileFit(sw, sh, tw, th);
      expect(result.scaleX).toBeGreaterThanOrEqual(0);
      expect(result.scaleX).toBeLessThanOrEqual(1);
      expect(result.scaleY).toBeGreaterThanOrEqual(0);
      expect(result.scaleY).toBeLessThanOrEqual(1);
    }
  });
});
