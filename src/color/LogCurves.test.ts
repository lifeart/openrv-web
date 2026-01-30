/**
 * LogCurves Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  LOG_CURVES,
  getLogCurveOptions,
  buildLogLUT,
  buildLogToLinearGLSL,
  applyLogCurve,
} from './LogCurves';

describe('LogCurves', () => {
  describe('LOG_CURVES', () => {
    it('LOG-U001: provides all expected log curves', () => {
      expect(LOG_CURVES.none).toBeNull();
      expect(LOG_CURVES.cineon).toBeDefined();
      expect(LOG_CURVES.arri_logc3).toBeDefined();
      expect(LOG_CURVES.arri_logc4).toBeDefined();
      expect(LOG_CURVES.sony_slog3).toBeDefined();
      expect(LOG_CURVES.red_log3g10).toBeDefined();
    });

    it('LOG-U002: each curve has required properties', () => {
      const curves = [
        LOG_CURVES.cineon,
        LOG_CURVES.arri_logc3,
        LOG_CURVES.arri_logc4,
        LOG_CURVES.sony_slog3,
        LOG_CURVES.red_log3g10,
      ];

      for (const curve of curves) {
        expect(curve).not.toBeNull();
        expect(curve!.name).toBeDefined();
        expect(curve!.id).toBeDefined();
        expect(typeof curve!.toLinear).toBe('function');
        expect(typeof curve!.toLog).toBe('function');
      }
    });
  });

  describe('Cineon', () => {
    const cineon = LOG_CURVES.cineon!;

    it('LOG-U003: produces monotonically increasing output', () => {
      // Cineon should produce monotonically increasing linear values
      let lastLinear = -Infinity;
      for (let i = 95; i <= 685; i += 50) {
        const logValue = i / 1023;
        const linear = cineon.toLinear(logValue);
        expect(linear).toBeGreaterThanOrEqual(lastLinear);
        lastLinear = linear;
      }
    });

    it('LOG-U004: handles black level correctly', () => {
      const blackLog = 95 / 1023;
      const linear = cineon.toLinear(blackLog);

      expect(linear).toBeCloseTo(0, 1);
    });

    it('LOG-U005: round-trips values correctly', () => {
      // Test values that fall within the valid Cineon range (above black level)
      const testValues = [0.5, 1.0, 2.0, 5.0];

      for (const original of testValues) {
        const logValue = cineon.toLog(original);
        const recovered = cineon.toLinear(logValue);
        expect(recovered).toBeCloseTo(original, 1); // 1 decimal place precision
      }
    });
  });

  describe('ARRI LogC3', () => {
    const logc3 = LOG_CURVES.arri_logc3!;

    it('LOG-U006: converts mid-gray correctly', () => {
      // 18% gray in LogC3 is defined at specific code value
      const midGrayLinear = 0.18;
      const logValue = logc3.toLog(midGrayLinear);
      const recovered = logc3.toLinear(logValue);

      expect(recovered).toBeCloseTo(midGrayLinear, 3);
    });

    it('LOG-U007: handles very dark values (cut point)', () => {
      const darkValue = 0.001;
      const logValue = logc3.toLog(darkValue);
      const recovered = logc3.toLinear(logValue);

      expect(recovered).toBeCloseTo(darkValue, 4);
    });

    it('LOG-U008: produces monotonically increasing output', () => {
      let lastLinear = -Infinity;
      for (let i = 0; i <= 10; i++) {
        const logValue = i / 10;
        const linear = logc3.toLinear(logValue);
        expect(linear).toBeGreaterThanOrEqual(lastLinear);
        lastLinear = linear;
      }
    });
  });

  describe('ARRI LogC4', () => {
    const logc4 = LOG_CURVES.arri_logc4!;

    it('LOG-U009: converts mid-gray correctly', () => {
      const midGrayLinear = 0.18;
      const logValue = logc4.toLog(midGrayLinear);
      const recovered = logc4.toLinear(logValue);

      expect(recovered).toBeCloseTo(midGrayLinear, 2);
    });

    it('LOG-U010: handles extended dynamic range', () => {
      // LogC4 supports values above 1.0
      const brightValue = 2.0;
      const logValue = logc4.toLog(brightValue);
      const recovered = logc4.toLinear(logValue);

      expect(recovered).toBeCloseTo(brightValue, 1);
    });
  });

  describe('Sony S-Log3', () => {
    const slog3 = LOG_CURVES.sony_slog3!;

    it('LOG-U011: converts mid-gray correctly', () => {
      // S-Log3 mid-gray is defined at 420 code value (10-bit)
      const midGrayLog = 420 / 1023;
      const linear = slog3.toLinear(midGrayLog);

      // Should be approximately 0.18
      expect(linear).toBeGreaterThan(0.1);
      expect(linear).toBeLessThan(0.3);
    });

    it('LOG-U012: handles cut point correctly', () => {
      const cutPoint = 171.2102946929 / 1023;
      const justAbove = slog3.toLinear(cutPoint + 0.001);
      const justBelow = slog3.toLinear(cutPoint - 0.001);

      // Should be continuous at cut point
      expect(Math.abs(justAbove - justBelow)).toBeLessThan(0.01);
    });

    it('LOG-U013: round-trips values correctly', () => {
      const testValues = [0.05, 0.18, 0.5, 1.0];

      for (const original of testValues) {
        const logValue = slog3.toLog(original);
        const recovered = slog3.toLinear(logValue);
        expect(recovered).toBeCloseTo(original, 2);
      }
    });
  });

  describe('RED Log3G10', () => {
    const log3g10 = LOG_CURVES.red_log3g10!;

    it('LOG-U014: converts mid-gray correctly', () => {
      const midGrayLinear = 0.18;
      const logValue = log3g10.toLog(midGrayLinear);
      const recovered = log3g10.toLinear(logValue);

      expect(recovered).toBeCloseTo(midGrayLinear, 3);
    });

    it('LOG-U015: handles negative values', () => {
      // Log3G10 supports negative linear values
      const negativeLog = -0.1;
      const linear = log3g10.toLinear(negativeLog);

      expect(linear).toBeLessThan(0);
    });

    it('LOG-U016: round-trips values correctly', () => {
      const testValues = [0.01, 0.18, 0.5, 1.0];

      for (const original of testValues) {
        const logValue = log3g10.toLog(original);
        const recovered = log3g10.toLinear(logValue);
        expect(recovered).toBeCloseTo(original, 2);
      }
    });
  });

  describe('getLogCurveOptions', () => {
    it('LOG-U017: returns all curve options', () => {
      const options = getLogCurveOptions();

      expect(options.length).toBe(6);
      expect(options[0]!.id).toBe('none');
      expect(options[0]!.name).toBe('None (Linear)');
    });

    it('LOG-U018: each option has id and name', () => {
      const options = getLogCurveOptions();

      for (const option of options) {
        expect(option.id).toBeDefined();
        expect(option.name).toBeDefined();
        expect(option.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildLogLUT', () => {
    it('LOG-U019: creates LUT of correct size', () => {
      const lut = buildLogLUT(LOG_CURVES.cineon!, 256);

      expect(lut.length).toBe(256);
      expect(lut).toBeInstanceOf(Float32Array);
    });

    it('LOG-U020: uses default size of 1024', () => {
      const lut = buildLogLUT(LOG_CURVES.cineon!);

      expect(lut.length).toBe(1024);
    });

    it('LOG-U021: LUT values are valid', () => {
      const lut = buildLogLUT(LOG_CURVES.arri_logc3!);

      // First value should be for log=0
      expect(lut[0]).toBeDefined();
      expect(isNaN(lut[0]!)).toBe(false);

      // Last value should be for log=1
      expect(lut[lut.length - 1]).toBeDefined();
      expect(isNaN(lut[lut.length - 1]!)).toBe(false);
    });

    it('LOG-U022: LUT is monotonically increasing', () => {
      const lut = buildLogLUT(LOG_CURVES.arri_logc3!);

      for (let i = 1; i < lut.length; i++) {
        expect(lut[i]!).toBeGreaterThanOrEqual(lut[i - 1]!);
      }
    });
  });

  describe('buildLogToLinearGLSL', () => {
    it('LOG-U023: generates GLSL for each curve', () => {
      const curveIds: Array<keyof typeof LOG_CURVES> = [
        'none',
        'cineon',
        'arri_logc3',
        'arri_logc4',
        'sony_slog3',
        'red_log3g10',
      ];

      for (const id of curveIds) {
        const glsl = buildLogToLinearGLSL(id);

        expect(glsl).toContain('float logToLinear(float v)');
        expect(glsl).toContain('return');
      }
    });

    it('LOG-U024: generates valid GLSL syntax', () => {
      const glsl = buildLogToLinearGLSL('arri_logc3');

      // Check for proper GLSL syntax elements
      expect(glsl).toContain('float');
      expect(glsl).toContain('{');
      expect(glsl).toContain('}');
      expect(glsl).not.toContain('const'); // GLSL uses different keywords
    });

    it('LOG-U025: none curve returns pass-through', () => {
      const glsl = buildLogToLinearGLSL('none');

      expect(glsl).toContain('return v');
    });
  });

  describe('applyLogCurve', () => {
    it('LOG-U026: applies curve to RGB channels', () => {
      const [r, g, b] = applyLogCurve(LOG_CURVES.cineon!, 0.5, 0.5, 0.5);

      expect(r).toBe(g);
      expect(g).toBe(b);
      expect(r).not.toBe(0.5); // Should be transformed
    });

    it('LOG-U027: handles different channel values', () => {
      const [r, g, b] = applyLogCurve(LOG_CURVES.arri_logc3!, 0.3, 0.5, 0.7);

      expect(r).toBeLessThan(g);
      expect(g).toBeLessThan(b);
    });
  });
});
