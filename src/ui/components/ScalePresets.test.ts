/**
 * ScalePresets Tests
 *
 * Unit tests for pixel-ratio-based zoom preset utilities:
 * - calculateFitScale: fitScale computation for various source/container combos
 * - ratioToZoom / zoomToRatio: conversion between pixel ratios and zoom multipliers
 * - formatRatio: human-readable ratio formatting
 * - findPresetForRatio: preset matching
 * - ALL_PRESETS: immutability guarantee
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFitScale,
  ratioToZoom,
  zoomToRatio,
  formatRatio,
  findPresetForRatio,
  MAGNIFICATION_PRESETS,
  REDUCTION_PRESETS,
  ALL_PRESETS,
  MAX_CANVAS_DIMENSION,
} from './ScalePresets';

// ---------------------------------------------------------------------------
// calculateFitScale
// ---------------------------------------------------------------------------

describe('calculateFitScale', () => {
  it('SP-001: returns 1 when source fits within container', () => {
    // 640x480 in 1280x720 => fitScale = 1 (source is smaller)
    expect(calculateFitScale(640, 480, 1280, 720)).toBe(1);
  });

  it('SP-002: scales down when source is wider than container', () => {
    // 3840x2160 in 1280x720 => min(1280/3840, 720/2160, 1) = min(0.333, 0.333, 1) = 0.333
    const result = calculateFitScale(3840, 2160, 1280, 720);
    expect(result).toBeCloseTo(1 / 3, 2);
  });

  it('SP-003: scales down when source is taller than container', () => {
    // 1080x1920 in 1280x720 => min(1280/1080, 720/1920, 1) = min(1.185, 0.375, 1) = 0.375
    const result = calculateFitScale(1080, 1920, 1280, 720);
    expect(result).toBeCloseTo(0.375, 3);
  });

  it('SP-004: returns 1 for exact same dimensions', () => {
    expect(calculateFitScale(1280, 720, 1280, 720)).toBe(1);
  });

  it('SP-005: handles portrait source in landscape container', () => {
    // 1080x1920 in 1920x1080 => min(1920/1080, 1080/1920, 1) = min(1.778, 0.5625, 1) = 0.5625
    const result = calculateFitScale(1080, 1920, 1920, 1080);
    expect(result).toBeCloseTo(0.5625, 4);
  });

  it('SP-006: returns 1 for zero source width', () => {
    expect(calculateFitScale(0, 480, 1280, 720)).toBe(1);
  });

  it('SP-007: returns 1 for zero source height', () => {
    expect(calculateFitScale(640, 0, 1280, 720)).toBe(1);
  });

  it('SP-008: returns 1 for zero container width', () => {
    expect(calculateFitScale(640, 480, 0, 720)).toBe(1);
  });

  it('SP-009: returns 1 for zero container height', () => {
    expect(calculateFitScale(640, 480, 1280, 0)).toBe(1);
  });

  it('SP-010: returns 1 for negative dimensions', () => {
    expect(calculateFitScale(-100, 480, 1280, 720)).toBe(1);
    expect(calculateFitScale(640, -480, 1280, 720)).toBe(1);
    expect(calculateFitScale(640, 480, -1280, 720)).toBe(1);
  });

  it('SP-011: handles very large source image (8K in HD container)', () => {
    // 7680x4320 in 1920x1080 => min(1920/7680, 1080/4320, 1) = min(0.25, 0.25, 1) = 0.25
    const result = calculateFitScale(7680, 4320, 1920, 1080);
    expect(result).toBe(0.25);
  });

  it('SP-012: handles non-standard aspect ratio', () => {
    // 2048x858 (2.39:1 anamorphic) in 1920x1080
    const result = calculateFitScale(2048, 858, 1920, 1080);
    expect(result).toBeCloseTo(1920 / 2048, 4);
  });
});

// ---------------------------------------------------------------------------
// ratioToZoom
// ---------------------------------------------------------------------------

describe('ratioToZoom', () => {
  it('SP-020: converts 1:1 ratio to correct zoom for 4K in HD container', () => {
    // fitScale = 0.333, ratio 1.0 => zoom = 1 / 0.333 = 3.0
    const fitScale = 1 / 3;
    const zoom = ratioToZoom(1, fitScale);
    expect(zoom).toBeCloseTo(3, 1);
  });

  it('SP-021: converts 2:1 ratio to correct zoom', () => {
    const fitScale = 0.5;
    const zoom = ratioToZoom(2, fitScale);
    expect(zoom).toBe(4);
  });

  it('SP-022: converts 1:2 (0.5) ratio to correct zoom', () => {
    const fitScale = 0.5;
    const zoom = ratioToZoom(0.5, fitScale);
    expect(zoom).toBe(1);
  });

  it('SP-023: converts 1:3 ratio to correct zoom', () => {
    const fitScale = 1 / 3;
    const zoom = ratioToZoom(1 / 3, fitScale);
    expect(zoom).toBeCloseTo(1, 5);
  });

  it('SP-024: converts 8:1 ratio to correct zoom', () => {
    const fitScale = 0.25;
    const zoom = ratioToZoom(8, fitScale);
    expect(zoom).toBe(32);
  });

  it('SP-025: returns ratio directly when fitScale is 0', () => {
    expect(ratioToZoom(2, 0)).toBe(2);
  });

  it('SP-026: returns ratio directly when fitScale is negative', () => {
    expect(ratioToZoom(3, -0.5)).toBe(3);
  });

  it('SP-027: converts 1:1 ratio with fitScale 1 (small image) to zoom 1', () => {
    // When source fits at native size, fitScale = 1, so 1:1 = zoom 1
    expect(ratioToZoom(1, 1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// zoomToRatio
// ---------------------------------------------------------------------------

describe('zoomToRatio', () => {
  it('SP-030: converts zoom 1 with fitScale to the fitScale ratio', () => {
    expect(zoomToRatio(1, 0.5)).toBe(0.5);
  });

  it('SP-031: converts zoom 3 with fitScale 0.333 to approximately 1:1', () => {
    const ratio = zoomToRatio(3, 1 / 3);
    expect(ratio).toBeCloseTo(1, 5);
  });

  it('SP-032: round-trips ratioToZoom -> zoomToRatio correctly for 1:1', () => {
    const fitScale = 0.25;
    const zoom = ratioToZoom(1, fitScale);
    const ratio = zoomToRatio(zoom, fitScale);
    expect(ratio).toBeCloseTo(1, 10);
  });

  it('SP-033: round-trips correctly for 2:1', () => {
    const fitScale = 0.333;
    const zoom = ratioToZoom(2, fitScale);
    const ratio = zoomToRatio(zoom, fitScale);
    expect(ratio).toBeCloseTo(2, 5);
  });

  it('SP-034: round-trips correctly for 1:4', () => {
    const fitScale = 0.25;
    const zoom = ratioToZoom(0.25, fitScale);
    const ratio = zoomToRatio(zoom, fitScale);
    expect(ratio).toBeCloseTo(0.25, 10);
  });

  it('SP-035: round-trips correctly for 1:8', () => {
    const fitScale = 0.5;
    const zoom = ratioToZoom(0.125, fitScale);
    const ratio = zoomToRatio(zoom, fitScale);
    expect(ratio).toBeCloseTo(0.125, 10);
  });
});

// ---------------------------------------------------------------------------
// formatRatio
// ---------------------------------------------------------------------------

describe('formatRatio', () => {
  it('SP-040: formats 1:1 correctly', () => {
    expect(formatRatio(1)).toBe('1:1');
  });

  it('SP-041: formats 2:1 correctly', () => {
    expect(formatRatio(2)).toBe('2:1');
  });

  it('SP-042: formats 3:1 correctly', () => {
    expect(formatRatio(3)).toBe('3:1');
  });

  it('SP-043: formats 8:1 correctly', () => {
    expect(formatRatio(8)).toBe('8:1');
  });

  it('SP-044: formats 1:2 correctly', () => {
    expect(formatRatio(0.5)).toBe('1:2');
  });

  it('SP-045: formats 1:4 correctly', () => {
    expect(formatRatio(0.25)).toBe('1:4');
  });

  it('SP-046: formats 1:8 correctly', () => {
    expect(formatRatio(0.125)).toBe('1:8');
  });

  it('SP-047: formats non-integer magnification as percentage', () => {
    expect(formatRatio(1.5)).toBe('150%');
  });

  it('SP-048: formats non-integer reduction as percentage', () => {
    // 1/3 => inverse 3, which IS integer => "1:3"
    expect(formatRatio(1 / 3)).toBe('1:3');
  });

  it('SP-049: formats 0.7 as percentage', () => {
    expect(formatRatio(0.7)).toBe('70%');
  });

  it('SP-050: formats 1.333 as percentage', () => {
    expect(formatRatio(1.333)).toBe('133%');
  });

  it('SP-051: formats 1/6 as ratio (V8 round-trips 1/(1/6) to integer 6)', () => {
    // In V8 JS engine, 1/(1/6) = 6 exactly, so Number.isInteger is true
    const result = formatRatio(1 / 6);
    expect(result).toBe('1:6');
  });

  it('SP-052: formats 1/7 as ratio (V8 round-trips 1/(1/7) to integer 7)', () => {
    // In V8 JS engine, 1/(1/7) = 7 exactly, so Number.isInteger is true
    const result = formatRatio(1 / 7);
    expect(result).toBe('1:7');
  });
});

// ---------------------------------------------------------------------------
// findPresetForRatio
// ---------------------------------------------------------------------------

describe('findPresetForRatio', () => {
  it('SP-060: finds 1:1 preset', () => {
    const preset = findPresetForRatio(1);
    expect(preset).not.toBeNull();
    expect(preset!.label).toBe('1:1');
  });

  it('SP-061: finds 2:1 preset', () => {
    const preset = findPresetForRatio(2);
    expect(preset).not.toBeNull();
    expect(preset!.label).toBe('2:1');
  });

  it('SP-062: finds 1:2 preset', () => {
    const preset = findPresetForRatio(0.5);
    expect(preset).not.toBeNull();
    expect(preset!.label).toBe('1:2');
  });

  it('SP-063: finds 1:4 preset', () => {
    const preset = findPresetForRatio(0.25);
    expect(preset).not.toBeNull();
    expect(preset!.label).toBe('1:4');
  });

  it('SP-064: finds 8:1 preset', () => {
    const preset = findPresetForRatio(8);
    expect(preset).not.toBeNull();
    expect(preset!.label).toBe('8:1');
  });

  it('SP-065: returns null for non-preset ratio', () => {
    expect(findPresetForRatio(1.5)).toBeNull();
  });

  it('SP-066: finds preset within epsilon tolerance', () => {
    const preset = findPresetForRatio(1.005);
    expect(preset).not.toBeNull();
    expect(preset!.label).toBe('1:1');
  });

  it('SP-067: returns null outside epsilon tolerance', () => {
    expect(findPresetForRatio(1.02)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Presets arrays
// ---------------------------------------------------------------------------

describe('preset arrays', () => {
  it('SP-070: MAGNIFICATION_PRESETS has 8 entries', () => {
    expect(MAGNIFICATION_PRESETS).toHaveLength(8);
  });

  it('SP-071: REDUCTION_PRESETS has 7 entries', () => {
    expect(REDUCTION_PRESETS).toHaveLength(7);
  });

  it('SP-072: ALL_PRESETS has 15 entries (7 reduction + 8 magnification)', () => {
    expect(ALL_PRESETS).toHaveLength(15);
  });

  it('SP-073: ALL_PRESETS is sorted by ratio ascending', () => {
    for (let i = 1; i < ALL_PRESETS.length; i++) {
      expect(ALL_PRESETS[i]!.ratio).toBeGreaterThan(ALL_PRESETS[i - 1]!.ratio);
    }
  });

  it('SP-074: ALL_PRESETS does not mutate REDUCTION_PRESETS', () => {
    // Access ALL_PRESETS to trigger any potential mutation
    const _all = ALL_PRESETS;
    // REDUCTION_PRESETS should still be in original order (descending ratio: 0.5, 0.333, 0.25, ...)
    expect(REDUCTION_PRESETS[0]!.ratio).toBe(0.5);
    expect(REDUCTION_PRESETS[1]!.ratio).toBeCloseTo(1 / 3, 5);
    expect(REDUCTION_PRESETS[2]!.ratio).toBe(0.25);
    expect(REDUCTION_PRESETS[6]!.ratio).toBe(0.125);
    void _all; // suppress unused variable warning
  });

  it('SP-075: MAGNIFICATION_PRESETS first entry is 1:1', () => {
    expect(MAGNIFICATION_PRESETS[0]!.label).toBe('1:1');
    expect(MAGNIFICATION_PRESETS[0]!.ratio).toBe(1);
  });

  it('SP-076: MAGNIFICATION_PRESETS last entry is 8:1', () => {
    expect(MAGNIFICATION_PRESETS[7]!.label).toBe('8:1');
    expect(MAGNIFICATION_PRESETS[7]!.ratio).toBe(8);
  });

  it('SP-077: REDUCTION_PRESETS first entry is 1:2', () => {
    expect(REDUCTION_PRESETS[0]!.label).toBe('1:2');
    expect(REDUCTION_PRESETS[0]!.ratio).toBe(0.5);
  });

  it('SP-078: REDUCTION_PRESETS last entry is 1:8', () => {
    expect(REDUCTION_PRESETS[6]!.label).toBe('1:8');
    expect(REDUCTION_PRESETS[6]!.ratio).toBe(0.125);
  });

  it('SP-079: MAX_CANVAS_DIMENSION is 16384', () => {
    expect(MAX_CANVAS_DIMENSION).toBe(16384);
  });

  it('SP-080: each preset has a valid label format', () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.label).toMatch(/^(\d+:\d+)$/);
    }
  });

  it('SP-081: each preset has a valid percentage format', () => {
    for (const preset of ALL_PRESETS) {
      expect(preset.percentage).toMatch(/^\d+(\.\d+)?%$/);
    }
  });
});
