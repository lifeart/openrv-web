import { describe, it, expect } from 'vitest';
import {
  detectPAR,
  calculatePARCorrectedWidth,
  calculateDisplayAspectRatio,
  findPresetForPAR,
  getPARForPreset,
  isPARActive,
  PAR_PRESETS,
  DEFAULT_PAR_STATE,
  PARState,
} from './PixelAspectRatio';

describe('PixelAspectRatio', () => {
  describe('detectPAR', () => {
    it('PAR-U001: returns 1.0 for standard HD resolution (1920x1080)', () => {
      expect(detectPAR(1920, 1080)).toBe(1.0);
    });

    it('PAR-U002: returns 1.0 for 4K resolution (3840x2160)', () => {
      expect(detectPAR(3840, 2160)).toBe(1.0);
    });

    it('PAR-U003: detects NTSC DV 4:3 (720x480) as 0.9091', () => {
      expect(detectPAR(720, 480)).toBeCloseTo(0.9091, 3);
    });

    it('PAR-U004: detects PAL DV 4:3 (720x576) as 1.0926', () => {
      expect(detectPAR(720, 576)).toBeCloseTo(1.0926, 3);
    });

    it('PAR-U005: detects NTSC D1 (720x486) as 0.9', () => {
      expect(detectPAR(720, 486)).toBeCloseTo(0.9, 3);
    });

    it('PAR-U006: returns 1.0 for zero dimensions', () => {
      expect(detectPAR(0, 0)).toBe(1.0);
      expect(detectPAR(-1, 100)).toBe(1.0);
    });

    it('PAR-U006a: returns 1.0 for NaN dimensions', () => {
      expect(detectPAR(NaN, 480)).toBe(1.0);
      expect(detectPAR(720, NaN)).toBe(1.0);
      expect(detectPAR(NaN, NaN)).toBe(1.0);
    });

    it('PAR-U006b: returns 1.0 for Infinity dimensions', () => {
      expect(detectPAR(Infinity, 480)).toBe(1.0);
      expect(detectPAR(720, Infinity)).toBe(1.0);
      expect(detectPAR(-Infinity, 480)).toBe(1.0);
    });

    it('PAR-U006c: ignores non-finite displayAspectRatio', () => {
      expect(detectPAR(720, 480, NaN)).toBeCloseTo(0.9091, 3);
      expect(detectPAR(720, 480, Infinity)).toBeCloseTo(0.9091, 3);
      expect(detectPAR(720, 480, -1)).toBeCloseTo(0.9091, 3);
      expect(detectPAR(720, 480, 0)).toBeCloseTo(0.9091, 3);
    });

    it('PAR-U007: computes PAR from display aspect ratio', () => {
      // 720x480 displayed as 16:9 -> PAR = (16/9) / (720/480) = 1.185
      const par = detectPAR(720, 480, 16 / 9);
      expect(par).toBeCloseTo(1.185, 2);
    });

    it('PAR-U008: computes PAR from 4:3 display aspect ratio', () => {
      // 720x480 displayed as 4:3 -> PAR = (4/3) / (720/480) = 0.8889
      const par = detectPAR(720, 480, 4 / 3);
      expect(par).toBeCloseTo(0.8889, 3);
    });
  });

  describe('calculatePARCorrectedWidth', () => {
    it('PAR-U010: returns same width for square pixels (PAR=1.0)', () => {
      expect(calculatePARCorrectedWidth(1920, 1.0)).toBe(1920);
    });

    it('PAR-U011: doubles width for 2:1 anamorphic', () => {
      expect(calculatePARCorrectedWidth(1920, 2.0)).toBe(3840);
    });

    it('PAR-U012: compresses width for NTSC DV', () => {
      const result = calculatePARCorrectedWidth(720, 0.9091);
      expect(result).toBe(655); // 720 * 0.9091 = 654.552 -> rounded to 655
    });

    it('PAR-U013: stretches width for PAL DV', () => {
      const result = calculatePARCorrectedWidth(720, 1.0926);
      expect(result).toBe(787); // 720 * 1.0926 = 786.672 -> rounded to 787
    });

    it('PAR-U014: handles zero PAR gracefully', () => {
      expect(calculatePARCorrectedWidth(1920, 0)).toBe(1920);
    });

    it('PAR-U015: handles negative PAR gracefully', () => {
      expect(calculatePARCorrectedWidth(1920, -1.0)).toBe(1920);
    });

    it('PAR-U016: handles NaN PAR gracefully', () => {
      expect(calculatePARCorrectedWidth(1920, NaN)).toBe(1920);
    });

    it('PAR-U017: handles Infinity PAR gracefully', () => {
      expect(calculatePARCorrectedWidth(1920, Infinity)).toBe(1920);
      expect(calculatePARCorrectedWidth(1920, -Infinity)).toBe(1920);
    });

    it('PAR-U018: handles NaN width gracefully', () => {
      expect(calculatePARCorrectedWidth(NaN, 2.0)).toBeNaN();
    });

    it('PAR-U019: handles very large PAR without crashing', () => {
      const result = calculatePARCorrectedWidth(1920, 3.999);
      expect(result).toBe(Math.round(1920 * 3.999));
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('calculateDisplayAspectRatio', () => {
    it('PAR-U020: calculates 16:9 for 1920x1080 square pixels', () => {
      const dar = calculateDisplayAspectRatio(1920, 1080, 1.0);
      expect(dar).toBeCloseTo(16 / 9, 3);
    });

    it('PAR-U021: calculates 2.39:1 scope for anamorphic 2:1 with 1920x1080', () => {
      // (1920 * 2.0) / 1080 = 3555.56 / 1080 = 3.556
      const dar = calculateDisplayAspectRatio(1920, 1080, 2.0);
      expect(dar).toBeCloseTo(3.556, 2);
    });

    it('PAR-U022: handles zero height', () => {
      expect(calculateDisplayAspectRatio(1920, 0, 1.0)).toBe(1.0);
    });

    it('PAR-U023: handles NaN inputs', () => {
      expect(calculateDisplayAspectRatio(NaN, 1080, 1.0)).toBe(1.0);
      expect(calculateDisplayAspectRatio(1920, NaN, 1.0)).toBe(1.0);
      expect(calculateDisplayAspectRatio(1920, 1080, NaN)).toBe(1.0);
    });

    it('PAR-U024: handles Infinity inputs', () => {
      expect(calculateDisplayAspectRatio(Infinity, 1080, 1.0)).toBe(1.0);
      expect(calculateDisplayAspectRatio(1920, Infinity, 1.0)).toBe(1.0);
      expect(calculateDisplayAspectRatio(1920, 1080, Infinity)).toBe(1.0);
    });

    it('PAR-U025: handles negative width', () => {
      expect(calculateDisplayAspectRatio(-1920, 1080, 1.0)).toBe(1.0);
    });

    it('PAR-U026: handles zero PAR', () => {
      expect(calculateDisplayAspectRatio(1920, 1080, 0)).toBe(1.0);
    });

    it('PAR-U027: handles negative PAR', () => {
      expect(calculateDisplayAspectRatio(1920, 1080, -1.0)).toBe(1.0);
    });
  });

  describe('findPresetForPAR', () => {
    it('PAR-U030: finds square preset for 1.0', () => {
      expect(findPresetForPAR(1.0)).toBe('square');
    });

    it('PAR-U031: finds anamorphic 2x preset for 2.0', () => {
      expect(findPresetForPAR(2.0)).toBe('anamorphic-2x');
    });

    it('PAR-U032: finds NTSC DV preset for 0.9091', () => {
      expect(findPresetForPAR(0.9091)).toBe('ntsc-dv');
    });

    it('PAR-U033: returns custom for unrecognized value', () => {
      expect(findPresetForPAR(1.5555)).toBe('custom');
    });

    it('PAR-U034: respects tolerance parameter', () => {
      expect(findPresetForPAR(0.92, 0.02)).toBe('ntsc-dv'); // 0.92 within 0.02 of 0.9091
      expect(findPresetForPAR(0.92, 0.001)).toBe('custom'); // 0.92 not within 0.001 of 0.9091
    });

    it('PAR-U035: returns custom for NaN', () => {
      expect(findPresetForPAR(NaN)).toBe('custom');
    });

    it('PAR-U036: returns custom for Infinity', () => {
      expect(findPresetForPAR(Infinity)).toBe('custom');
      expect(findPresetForPAR(-Infinity)).toBe('custom');
    });

    it('PAR-U037: returns custom for negative tolerance', () => {
      expect(findPresetForPAR(1.0, -0.01)).toBe('custom');
    });
  });

  describe('getPARForPreset', () => {
    it('PAR-U040: returns 1.0 for square preset', () => {
      expect(getPARForPreset('square')).toBe(1.0);
    });

    it('PAR-U041: returns 2.0 for anamorphic-2x preset', () => {
      expect(getPARForPreset('anamorphic-2x')).toBe(2.0);
    });

    it('PAR-U042: returns 1.0 for unknown preset', () => {
      expect(getPARForPreset('unknown')).toBe(1.0);
    });

    it('PAR-U043: returns 1.0 for empty string', () => {
      expect(getPARForPreset('')).toBe(1.0);
    });

    it('PAR-U044: returns correct PAR for all presets', () => {
      for (const preset of PAR_PRESETS) {
        expect(getPARForPreset(preset.value)).toBe(preset.par);
      }
    });
  });

  describe('isPARActive', () => {
    it('PAR-U050: returns false for default state', () => {
      expect(isPARActive(DEFAULT_PAR_STATE)).toBe(false);
    });

    it('PAR-U051: returns false when disabled even with non-1.0 PAR', () => {
      const state: PARState = { enabled: false, par: 2.0, preset: 'anamorphic-2x' };
      expect(isPARActive(state)).toBe(false);
    });

    it('PAR-U052: returns false when enabled with square pixels', () => {
      const state: PARState = { enabled: true, par: 1.0, preset: 'square' };
      expect(isPARActive(state)).toBe(false);
    });

    it('PAR-U053: returns true when enabled with non-1.0 PAR', () => {
      const state: PARState = { enabled: true, par: 2.0, preset: 'anamorphic-2x' };
      expect(isPARActive(state)).toBe(true);
    });

    it('PAR-U054: returns true for small PAR deviations', () => {
      const state: PARState = { enabled: true, par: 0.9091, preset: 'ntsc-dv' };
      expect(isPARActive(state)).toBe(true);
    });

    it('PAR-U055: returns false for near-1.0 PAR (within tolerance)', () => {
      const state: PARState = { enabled: true, par: 1.0005, preset: 'custom' };
      expect(isPARActive(state)).toBe(false);
    });

    it('PAR-U056: returns false for NaN PAR', () => {
      const state: PARState = { enabled: true, par: NaN, preset: 'custom' };
      expect(isPARActive(state)).toBe(false);
    });

    it('PAR-U057: returns false for Infinity PAR', () => {
      const state: PARState = { enabled: true, par: Infinity, preset: 'custom' };
      expect(isPARActive(state)).toBe(false);
    });

    it('PAR-U058: returns false for zero PAR', () => {
      const state: PARState = { enabled: true, par: 0, preset: 'custom' };
      expect(isPARActive(state)).toBe(false);
    });

    it('PAR-U059: returns false for negative PAR', () => {
      const state: PARState = { enabled: true, par: -2.0, preset: 'custom' };
      expect(isPARActive(state)).toBe(false);
    });
  });

  describe('PAR_PRESETS', () => {
    it('PAR-U060: contains at least 5 presets', () => {
      expect(PAR_PRESETS.length).toBeGreaterThanOrEqual(5);
    });

    it('PAR-U061: first preset is square pixels', () => {
      expect(PAR_PRESETS[0]!.value).toBe('square');
      expect(PAR_PRESETS[0]!.par).toBe(1.0);
    });

    it('PAR-U062: all presets have positive PAR values', () => {
      for (const preset of PAR_PRESETS) {
        expect(preset.par).toBeGreaterThan(0);
      }
    });

    it('PAR-U063: all presets have unique values', () => {
      const values = PAR_PRESETS.map((p) => p.value);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });

    it('PAR-U064: includes anamorphic 2:1 preset', () => {
      const anamorphic = PAR_PRESETS.find((p) => p.value === 'anamorphic-2x');
      expect(anamorphic).toBeDefined();
      expect(anamorphic!.par).toBe(2.0);
    });
  });
});
