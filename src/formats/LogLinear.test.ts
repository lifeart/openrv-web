/**
 * LogLinear Conversion Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { cineonLogToLinear, dpxLogToLinear } from './LogLinear';

describe('LogLinear', () => {
  describe('cineonLogToLinear', () => {
    it('should return 0 for code values at refBlack', () => {
      expect(cineonLogToLinear(95)).toBe(0);
    });

    it('should return 0 for code values below refBlack', () => {
      expect(cineonLogToLinear(0)).toBe(0);
      expect(cineonLogToLinear(50)).toBe(0);
      expect(cineonLogToLinear(94)).toBe(0);
    });

    it('should return a positive value for code values above refBlack', () => {
      const result = cineonLogToLinear(400);
      expect(result).toBeGreaterThan(0);
    });

    it('should return a higher value for refWhite than for midtones', () => {
      const mid = cineonLogToLinear(400);
      const white = cineonLogToLinear(685);
      expect(white).toBeGreaterThan(mid);
    });

    it('should map refWhite (685) to approximately 1.0', () => {
      // At refWhite, density/gamma - refWhiteOffset = 0, so linear = 10^0 = 1.0
      const result = cineonLogToLinear(685);
      expect(result).toBeCloseTo(1.0, 4);
    });

    it('should map values above refWhite to super-white (>1.0)', () => {
      const result = cineonLogToLinear(800);
      expect(result).toBeGreaterThan(1.0);
      expect(isFinite(result)).toBe(true);
    });

    it('should handle custom options', () => {
      const result = cineonLogToLinear(500, {
        refWhite: 700,
        refBlack: 100,
        filmGamma: 0.5,
      });
      expect(result).toBeGreaterThan(0);
      expect(isFinite(result)).toBe(true);
    });

    it('should return 0 when refWhite equals refBlack', () => {
      const result = cineonLogToLinear(500, {
        refWhite: 500,
        refBlack: 500,
      });
      expect(result).toBe(0);
    });

    it('should return 0 when refWhite is less than refBlack', () => {
      const result = cineonLogToLinear(500, {
        refWhite: 100,
        refBlack: 600,
      });
      expect(result).toBe(0);
    });

    it('should always return finite values for valid input range', () => {
      for (let cv = 0; cv <= 1023; cv += 50) {
        const result = cineonLogToLinear(cv);
        expect(isFinite(result)).toBe(true);
      }
    });

    it('should increase monotonically for values above refBlack', () => {
      let prev = cineonLogToLinear(96);
      for (let cv = 100; cv <= 685; cv += 10) {
        const current = cineonLogToLinear(cv);
        expect(current).toBeGreaterThanOrEqual(prev);
        prev = current;
      }
    });
  });

  describe('dpxLogToLinear', () => {
    it('should produce the same result as cineonLogToLinear with the same inputs', () => {
      // Both functions use the same formula
      expect(dpxLogToLinear(400)).toBe(cineonLogToLinear(400));
      expect(dpxLogToLinear(685)).toBe(cineonLogToLinear(685));
      expect(dpxLogToLinear(95)).toBe(cineonLogToLinear(95));
      expect(dpxLogToLinear(0)).toBe(cineonLogToLinear(0));
    });

    it('should return 0 for code values at or below refBlack', () => {
      expect(dpxLogToLinear(95)).toBe(0);
      expect(dpxLogToLinear(0)).toBe(0);
    });

    it('should handle custom options', () => {
      const opts = { refWhite: 700, refBlack: 100, filmGamma: 0.5 };
      expect(dpxLogToLinear(500, opts)).toBe(cineonLogToLinear(500, opts));
    });

    it('should return a positive finite value for code values above refBlack', () => {
      const result = dpxLogToLinear(500);
      expect(result).toBeGreaterThan(0);
      expect(isFinite(result)).toBe(true);
    });
  });
});
