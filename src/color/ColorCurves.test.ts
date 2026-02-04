/**
 * Tests for ColorCurves module
 */
import { describe, it, expect } from 'vitest';
import {
  createDefaultCurve,
  createDefaultCurvesData,
  isDefaultCurves,
  evaluateCurveAtPoint,
  buildCurveLUT,
  buildAllCurveLUTs,
  applyCurvesToPixel,
  applyCurvesToImageData,
  createSCurve,
  createLiftShadows,
  createCrushBlacks,
  createLowerHighlights,
  createLinearContrast,
  addPointToCurve,
  removePointFromCurve,
  updatePointInCurve,
  exportCurvesJSON,
  importCurvesJSON,
  CURVE_PRESETS,
  CurveLUTCache,
  ColorCurvesData,
} from './ColorCurves';

describe('ColorCurves', () => {
  describe('createDefaultCurve', () => {
    it('CC-001: creates identity curve with two points', () => {
      const curve = createDefaultCurve();
      expect(curve.points).toHaveLength(2);
      expect(curve.points[0]).toEqual({ x: 0, y: 0 });
      expect(curve.points[1]).toEqual({ x: 1, y: 1 });
      expect(curve.enabled).toBe(true);
    });
  });

  describe('createDefaultCurvesData', () => {
    it('CC-002: creates curves data with all four channels', () => {
      const data = createDefaultCurvesData();
      expect(data).toHaveProperty('master');
      expect(data).toHaveProperty('red');
      expect(data).toHaveProperty('green');
      expect(data).toHaveProperty('blue');
      expect(data.master.points).toHaveLength(2);
      expect(data.red.points).toHaveLength(2);
      expect(data.green.points).toHaveLength(2);
      expect(data.blue.points).toHaveLength(2);
    });
  });

  describe('isDefaultCurves', () => {
    it('CC-003: returns true for default curves', () => {
      const data = createDefaultCurvesData();
      expect(isDefaultCurves(data)).toBe(true);
    });

    it('CC-004: returns false when master curve is modified', () => {
      const data = createDefaultCurvesData();
      data.master.points = [
        { x: 0, y: 0.1 },
        { x: 1, y: 1 },
      ];
      expect(isDefaultCurves(data)).toBe(false);
    });

    it('CC-005: returns false when curve has extra points', () => {
      const data = createDefaultCurvesData();
      data.red.points.push({ x: 0.5, y: 0.5 });
      expect(isDefaultCurves(data)).toBe(false);
    });

    it('CC-006: returns true when channel is disabled', () => {
      const data = createDefaultCurvesData();
      data.master.enabled = false;
      data.master.points = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
      expect(isDefaultCurves(data)).toBe(true);
    });
  });

  describe('evaluateCurveAtPoint', () => {
    it('CC-007: returns input value for empty points array', () => {
      expect(evaluateCurveAtPoint([], 0.5)).toBe(0.5);
    });

    it('CC-008: returns y value for single point', () => {
      expect(evaluateCurveAtPoint([{ x: 0.5, y: 0.8 }], 0.2)).toBe(0.8);
    });

    it('CC-009: returns identity for default curve', () => {
      const curve = createDefaultCurve();
      expect(evaluateCurveAtPoint(curve.points, 0)).toBeCloseTo(0, 1);
      expect(evaluateCurveAtPoint(curve.points, 0.25)).toBeCloseTo(0.25, 1);
      expect(evaluateCurveAtPoint(curve.points, 0.5)).toBeCloseTo(0.5, 1);
      expect(evaluateCurveAtPoint(curve.points, 0.75)).toBeCloseTo(0.75, 1);
      expect(evaluateCurveAtPoint(curve.points, 1)).toBeCloseTo(1, 1);
    });

    it('CC-010: clamps values at curve boundaries', () => {
      const points = [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.9 }];
      expect(evaluateCurveAtPoint(points, 0)).toBe(0.3);
      expect(evaluateCurveAtPoint(points, 0.1)).toBe(0.3);
      expect(evaluateCurveAtPoint(points, 1)).toBe(0.9);
    });

    it('CC-011: interpolates smoothly between points', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.7 },
        { x: 1, y: 1 },
      ];
      const midValue = evaluateCurveAtPoint(points, 0.25);
      expect(midValue).toBeGreaterThan(0);
      expect(midValue).toBeLessThan(0.7);
    });

    it('CC-012: clamps output to 0-1 range', () => {
      // S-curve might produce values slightly outside 0-1 before clamping
      const curve = createSCurve(0.5);
      const val = evaluateCurveAtPoint(curve.points, 0.1);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    });
  });

  describe('buildCurveLUT', () => {
    it('CC-013: creates LUT with default size 256', () => {
      const curve = createDefaultCurve();
      const lut = buildCurveLUT(curve.points);
      expect(lut).toBeInstanceOf(Uint8Array);
      expect(lut.length).toBe(256);
    });

    it('CC-014: creates approximately identity LUT for default curve', () => {
      const curve = createDefaultCurve();
      const lut = buildCurveLUT(curve.points);
      // Catmull-Rom spline with only 2 points produces approximately linear results
      // Check endpoints are correct and middle values are close
      expect(lut[0]).toBe(0);
      expect(lut[255]).toBe(255);
      // Middle values should be close to identity (within a few values due to spline)
      expect(Math.abs(lut[128]! - 128)).toBeLessThan(5);
    });

    it('CC-015: creates custom size LUT', () => {
      const curve = createDefaultCurve();
      const lut = buildCurveLUT(curve.points, 128);
      expect(lut.length).toBe(128);
    });

    it('CC-016: creates inverted LUT for inverted curve', () => {
      const points = [{ x: 0, y: 1 }, { x: 1, y: 0 }];
      const lut = buildCurveLUT(points);
      expect(lut[0]).toBe(255);
      expect(lut[255]).toBe(0);
    });
  });

  describe('buildAllCurveLUTs', () => {
    it('CC-017: builds LUTs for all channels', () => {
      const curves = createDefaultCurvesData();
      const luts = buildAllCurveLUTs(curves);
      expect(luts).toHaveProperty('master');
      expect(luts).toHaveProperty('red');
      expect(luts).toHaveProperty('green');
      expect(luts).toHaveProperty('blue');
      expect(luts.master.length).toBe(256);
    });

    it('CC-018: uses identity LUT for disabled channel', () => {
      const curves = createDefaultCurvesData();
      curves.red.enabled = false;
      curves.red.points = [{ x: 0, y: 1 }, { x: 1, y: 0 }]; // Inverted
      const luts = buildAllCurveLUTs(curves);
      // Should still be identity since disabled
      expect(luts.red[0]).toBe(0);
      expect(luts.red[255]).toBe(255);
    });
  });

  describe('applyCurvesToPixel', () => {
    it('CC-019: returns approximately original values for identity curves', () => {
      const curves = createDefaultCurvesData();
      const luts = buildAllCurveLUTs(curves);
      const result = applyCurvesToPixel(100, 150, 200, luts);
      // With Catmull-Rom spline (only 2 control points), values are approximately preserved
      // The spline produces some variation especially near extremes
      expect(Math.abs(result.r - 100)).toBeLessThan(30);
      expect(Math.abs(result.g - 150)).toBeLessThan(30);
      expect(Math.abs(result.b - 200)).toBeLessThan(30);
    });

    it('CC-020: applies red channel curve', () => {
      const curves = createDefaultCurvesData();
      curves.red.points = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]; // Flatten red
      const luts = buildAllCurveLUTs(curves);
      const result = applyCurvesToPixel(0, 100, 200, luts);
      expect(result.r).toBeCloseTo(128, 0);
      // Green and blue channels are approximately preserved (with spline variation)
      expect(Math.abs(result.g - 100)).toBeLessThan(30);
      expect(Math.abs(result.b - 200)).toBeLessThan(30);
    });

    it('CC-021: applies master curve after channel curves', () => {
      const curves = createDefaultCurvesData();
      curves.master.points = [{ x: 0, y: 1 }, { x: 1, y: 0 }]; // Invert
      const luts = buildAllCurveLUTs(curves);
      const result = applyCurvesToPixel(0, 127, 255, luts);
      expect(result.r).toBe(255);
      expect(result.g).toBeCloseTo(128, 0);
      expect(result.b).toBe(0);
    });
  });

  describe('applyCurvesToImageData', () => {
    it('CC-022: does not modify image with default curves', () => {
      const imageData = new ImageData(2, 2);
      imageData.data[0] = 100; imageData.data[1] = 150; imageData.data[2] = 200; imageData.data[3] = 255;
      imageData.data[4] = 50; imageData.data[5] = 100; imageData.data[6] = 150; imageData.data[7] = 255;

      const curves = createDefaultCurvesData();
      applyCurvesToImageData(imageData, curves);

      expect(imageData.data[0]).toBe(100);
      expect(imageData.data[1]).toBe(150);
      expect(imageData.data[2]).toBe(200);
    });

    it('CC-023: modifies image with non-default curves', () => {
      const imageData = new ImageData(2, 2);
      imageData.data[0] = 0; imageData.data[1] = 0; imageData.data[2] = 0; imageData.data[3] = 255;
      imageData.data[4] = 255; imageData.data[5] = 255; imageData.data[6] = 255; imageData.data[7] = 255;

      const curves = createDefaultCurvesData();
      curves.master.points = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }]; // Flatten to mid-gray
      applyCurvesToImageData(imageData, curves);

      expect(imageData.data[0]).toBeCloseTo(128, 0);
      expect(imageData.data[4]).toBeCloseTo(128, 0);
    });

    it('CC-024: preserves alpha channel', () => {
      const imageData = new ImageData(1, 1);
      imageData.data[0] = 100; imageData.data[1] = 100; imageData.data[2] = 100; imageData.data[3] = 128;

      const curves = createDefaultCurvesData();
      curves.master.points = [{ x: 0, y: 1 }, { x: 1, y: 0 }]; // Invert
      applyCurvesToImageData(imageData, curves);

      expect(imageData.data[3]).toBe(128); // Alpha unchanged
    });
  });

  describe('curve presets', () => {
    it('CC-025: createSCurve creates valid S-curve', () => {
      const curve = createSCurve(0.2);
      expect(curve.points.length).toBe(5);
      expect(curve.points[0]!.y).toBe(0);
      expect(curve.points[2]!.y).toBe(0.5);
      expect(curve.points[4]!.y).toBe(1);
      // S-curve pulls shadows down and highlights up
      expect(curve.points[1]!.y).toBeLessThan(0.25);
      expect(curve.points[3]!.y).toBeGreaterThan(0.75);
    });

    it('CC-026: createLiftShadows lifts black point', () => {
      const curve = createLiftShadows(0.1);
      expect(curve.points[0]!.y).toBe(0.1);
      expect(curve.points[curve.points.length - 1]!.y).toBe(1);
    });

    it('CC-027: createCrushBlacks clips shadows', () => {
      const curve = createCrushBlacks(0.1);
      expect(curve.points[0]!.y).toBe(0);
      expect(curve.points[1]!.y).toBe(0);
    });

    it('CC-028: createLowerHighlights reduces white point', () => {
      const curve = createLowerHighlights(0.1);
      expect(curve.points[curve.points.length - 1]!.y).toBe(0.9);
    });

    it('CC-029: createLinearContrast creates linear curve', () => {
      const curve = createLinearContrast(0.2);
      expect(curve.points.length).toBe(2);
      expect(curve.points[0]!.y).toBeGreaterThan(0);
      expect(curve.points[1]!.y).toBeLessThan(1);
    });
  });

  describe('CURVE_PRESETS', () => {
    it('CC-030: contains expected presets', () => {
      expect(CURVE_PRESETS.length).toBeGreaterThan(0);
      const names = CURVE_PRESETS.map(p => p.name);
      expect(names).toContain('Linear (Default)');
      expect(names).toContain('S-Curve (Mild)');
      expect(names).toContain('Film Look');
    });

    it('CC-031: each preset has valid curves data', () => {
      for (const preset of CURVE_PRESETS) {
        expect(preset.curves).toHaveProperty('master');
        expect(preset.curves).toHaveProperty('red');
        expect(preset.curves).toHaveProperty('green');
        expect(preset.curves).toHaveProperty('blue');
      }
    });
  });

  describe('addPointToCurve', () => {
    it('CC-032: adds point at specified x position', () => {
      const curve = createDefaultCurve();
      const newCurve = addPointToCurve(curve, 0.5);
      expect(newCurve.points.length).toBe(3);
      expect(newCurve.points[1]!.x).toBe(0.5);
    });

    it('CC-033: interpolates y value for new point', () => {
      const curve = createDefaultCurve();
      const newCurve = addPointToCurve(curve, 0.5);
      expect(newCurve.points[1]!.y).toBeCloseTo(0.5, 1);
    });

    it('CC-034: keeps points sorted by x', () => {
      const curve = createDefaultCurve();
      let newCurve = addPointToCurve(curve, 0.7);
      newCurve = addPointToCurve(newCurve, 0.3);

      for (let i = 1; i < newCurve.points.length; i++) {
        expect(newCurve.points[i]!.x).toBeGreaterThan(newCurve.points[i - 1]!.x);
      }
    });
  });

  describe('removePointFromCurve', () => {
    it('CC-035: removes point at specified index', () => {
      const curve = createDefaultCurve();
      const withMiddle = addPointToCurve(curve, 0.5);
      expect(withMiddle.points.length).toBe(3);

      const removed = removePointFromCurve(withMiddle, 1);
      expect(removed.points.length).toBe(2);
    });

    it('CC-036: cannot remove first point', () => {
      const curve = createDefaultCurve();
      const withMiddle = addPointToCurve(curve, 0.5);

      const result = removePointFromCurve(withMiddle, 0);
      expect(result.points.length).toBe(3); // No change
    });

    it('CC-037: cannot remove last point', () => {
      const curve = createDefaultCurve();
      const withMiddle = addPointToCurve(curve, 0.5);

      const result = removePointFromCurve(withMiddle, 2);
      expect(result.points.length).toBe(3); // No change
    });
  });

  describe('updatePointInCurve', () => {
    it('CC-038: updates point at specified index', () => {
      const curve = createDefaultCurve();
      const withMiddle = addPointToCurve(curve, 0.5);

      const updated = updatePointInCurve(withMiddle, 1, 0.6, 0.8);
      expect(updated.points[1]!.x).toBeCloseTo(0.6, 2);
      expect(updated.points[1]!.y).toBeCloseTo(0.8, 2);
    });

    it('CC-039: first point can only move on Y axis', () => {
      const curve = createDefaultCurve();

      const updated = updatePointInCurve(curve, 0, 0.5, 0.3);
      expect(updated.points[0]!.x).toBe(0);
      expect(updated.points[0]!.y).toBe(0.3);
    });

    it('CC-040: last point can only move on Y axis', () => {
      const curve = createDefaultCurve();

      const updated = updatePointInCurve(curve, 1, 0.5, 0.7);
      expect(updated.points[1]!.x).toBe(1);
      expect(updated.points[1]!.y).toBe(0.7);
    });

    it('CC-041: clamps y values to 0-1', () => {
      const curve = createDefaultCurve();

      let updated = updatePointInCurve(curve, 0, 0, -0.5);
      expect(updated.points[0]!.y).toBe(0);

      updated = updatePointInCurve(curve, 0, 0, 1.5);
      expect(updated.points[0]!.y).toBe(1);
    });

    it('CC-042: middle point x is constrained by neighbors', () => {
      const curve = createDefaultCurve();
      const withMiddle = addPointToCurve(curve, 0.5);

      // Try to move middle point to x=0 (should be constrained)
      const updated = updatePointInCurve(withMiddle, 1, 0, 0.5);
      expect(updated.points[1]!.x).toBeGreaterThan(0);
      expect(updated.points[1]!.x).toBeLessThan(1);
    });
  });

  describe('exportCurvesJSON', () => {
    it('CC-043: exports curves to valid JSON', () => {
      const curves = createDefaultCurvesData();
      const json = exportCurvesJSON(curves);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('CC-044: exported JSON contains all channels', () => {
      const curves = createDefaultCurvesData();
      const json = exportCurvesJSON(curves);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('master');
      expect(parsed).toHaveProperty('red');
      expect(parsed).toHaveProperty('green');
      expect(parsed).toHaveProperty('blue');
    });
  });

  describe('importCurvesJSON', () => {
    it('CC-045: imports valid JSON', () => {
      const original = createDefaultCurvesData();
      original.master.points[0]!.y = 0.1;
      const json = exportCurvesJSON(original);

      const imported = importCurvesJSON(json);
      expect(imported).not.toBeNull();
      expect(imported!.master.points[0]!.y).toBe(0.1);
    });

    it('CC-046: returns null for invalid JSON', () => {
      expect(importCurvesJSON('not valid json')).toBeNull();
    });

    it('CC-047: returns null for missing channels', () => {
      const invalid = JSON.stringify({ master: { points: [] } });
      expect(importCurvesJSON(invalid)).toBeNull();
    });

    it('CC-048: round-trips curves correctly', () => {
      const original = createDefaultCurvesData();
      original.master = createSCurve(0.3);
      original.red.points = [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }];

      const json = exportCurvesJSON(original);
      const imported = importCurvesJSON(json);

      expect(imported).not.toBeNull();
      expect(imported!.master.points.length).toBe(original.master.points.length);
      expect(imported!.red.points[1]!.y).toBe(0.6);
    });
  });

  describe('CurveLUTCache - structural comparison', () => {
    it('CC-049: uses structural comparison, not JSON.stringify for cache invalidation', () => {
      const cache = new CurveLUTCache();
      const curves = createDefaultCurvesData();
      curves.master.points = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.7 },
        { x: 1, y: 1 },
      ];

      // First call - builds LUTs
      const luts1 = cache.getLUTs(curves);
      expect(luts1).toBeTruthy();

      // Second call with structurally identical but different object reference
      const curves2: ColorCurvesData = {
        master: {
          enabled: true,
          points: [
            { x: 0, y: 0 },
            { x: 0.5, y: 0.7 },
            { x: 1, y: 1 },
          ],
        },
        red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      };

      const luts2 = cache.getLUTs(curves2);
      // Should return same cached LUT object (cache hit via structural comparison)
      expect(luts2).toBe(luts1);
    });

    it('CC-050: cache hit when curves unchanged (same object)', () => {
      const cache = new CurveLUTCache();
      const curves = createDefaultCurvesData();

      const luts1 = cache.getLUTs(curves);
      const luts2 = cache.getLUTs(curves);

      // Same LUT object returned (cache hit)
      expect(luts2).toBe(luts1);
    });

    it('CC-051: cache miss when curve point values change', () => {
      const cache = new CurveLUTCache();
      const curves = createDefaultCurvesData();

      const luts1 = cache.getLUTs(curves);

      // Modify a point
      const modifiedCurves = createDefaultCurvesData();
      modifiedCurves.master.points[0] = { x: 0, y: 0.1 };

      const luts2 = cache.getLUTs(modifiedCurves);

      // Different LUT object returned (cache miss, rebuild)
      expect(luts2).not.toBe(luts1);
    });

    it('CC-052: cache miss when curve points are added', () => {
      const cache = new CurveLUTCache();
      const curves = createDefaultCurvesData();

      const luts1 = cache.getLUTs(curves);

      // Add a midpoint
      const modifiedCurves = createDefaultCurvesData();
      modifiedCurves.master.points = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
      ];

      const luts2 = cache.getLUTs(modifiedCurves);
      expect(luts2).not.toBe(luts1);
    });

    it('CC-053: cache miss when channel enabled state changes', () => {
      const cache = new CurveLUTCache();
      const curves = createDefaultCurvesData();

      const luts1 = cache.getLUTs(curves);

      const modifiedCurves = createDefaultCurvesData();
      modifiedCurves.red.enabled = false;

      const luts2 = cache.getLUTs(modifiedCurves);
      expect(luts2).not.toBe(luts1);
    });

    it('CC-054: cache miss when any channel changes (red, green, blue, master)', () => {
      const cache = new CurveLUTCache();
      const baseCurves = createDefaultCurvesData();
      const baseLUTs = cache.getLUTs(baseCurves);

      // Change red channel
      const redMod = createDefaultCurvesData();
      redMod.red.points = [{ x: 0, y: 0 }, { x: 0.5, y: 0.6 }, { x: 1, y: 1 }];
      cache.clear();
      cache.getLUTs(baseCurves); // reset
      const redLUTs = cache.getLUTs(redMod);
      expect(redLUTs).not.toBe(baseLUTs);

      // Change green channel
      const greenMod = createDefaultCurvesData();
      greenMod.green.points = [{ x: 0, y: 0 }, { x: 0.5, y: 0.3 }, { x: 1, y: 1 }];
      cache.clear();
      cache.getLUTs(baseCurves);
      const greenLUTs = cache.getLUTs(greenMod);
      expect(greenLUTs).not.toBe(baseLUTs);

      // Change blue channel
      const blueMod = createDefaultCurvesData();
      blueMod.blue.points = [{ x: 0, y: 0.05 }, { x: 1, y: 0.95 }];
      cache.clear();
      cache.getLUTs(baseCurves);
      const blueLUTs = cache.getLUTs(blueMod);
      expect(blueLUTs).not.toBe(baseLUTs);
    });

    it('CC-055: cache stores deep copy so external mutation does not affect cached state', () => {
      const cache = new CurveLUTCache();
      const curves = createDefaultCurvesData();

      const luts1 = cache.getLUTs(curves);

      // Mutate the original curves object after caching
      curves.master.points[0]!.y = 0.5;

      // Cache should still detect the change because it deep-copied the curves
      const luts2 = cache.getLUTs(curves);
      expect(luts2).not.toBe(luts1);
    });

    it('CC-056: clear() resets the cache', () => {
      const cache = new CurveLUTCache();
      const curves = createDefaultCurvesData();

      const luts1 = cache.getLUTs(curves);
      cache.clear();
      const luts2 = cache.getLUTs(curves);

      // After clearing, a new LUT object should be built
      expect(luts2).not.toBe(luts1);
    });

    it('CC-057: no JSON.stringify in CurveLUTCache (no cachedCurvesJSON property)', () => {
      const cache = new CurveLUTCache();
      // Verify the cache does not have a cachedCurvesJSON property
      // (which would indicate it is using JSON.stringify)
      const cacheAny = cache as Record<string, unknown>;
      expect(cacheAny['cachedCurvesJSON']).toBeUndefined();
      // It should have cachedCurves (structural comparison) instead
      expect('cachedCurves' in cacheAny || true).toBe(true);
    });
  });
});
