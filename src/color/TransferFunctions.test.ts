/**
 * TransferFunctions Unit Tests
 *
 * Tests for all transfer function encode/decode pairs.
 * Covers spec test cases CSM-007 (PQ), CSM-008 (LogC3), CSM-009 (HLG).
 */

import { describe, it, expect } from 'vitest';
import {
  pqEncode,
  pqDecode,
  hlgEncode,
  hlgDecode,
  logC3Encode,
  logC3Decode,
  logC4Encode,
  logC4Decode,
  log3G10Encode,
  log3G10Decode,
  slog3Encode,
  slog3Decode,
  gamma22Encode,
  gamma22Decode,
  gamma24Encode,
  gamma24Decode,
  gamma26Encode,
  gamma26Decode,
  acescctEncode,
  acescctDecode,
  smpte240mEncode,
  smpte240mDecode,
} from './TransferFunctions';

describe('TransferFunctions', () => {
  // ==========================================================================
  // PQ (ST 2084) Tests - CSM-007
  // ==========================================================================
  describe('PQ (ST 2084)', () => {
    it('CSM-007: PQ encode/decode roundtrip', () => {
      const testValues = [0, 0.001, 0.01, 0.1, 0.18, 0.5, 0.9, 1.0];
      for (const v of testValues) {
        const encoded = pqEncode(v);
        const decoded = pqDecode(encoded);
        expect(decoded).toBeCloseTo(v, 4);
      }
    });

    it('PQ encode maps 0 to near 0', () => {
      expect(pqEncode(0)).toBeCloseTo(0, 5);
    });

    it('PQ encode maps 1 to ~1', () => {
      expect(pqEncode(1)).toBeCloseTo(1, 1);
    });

    it('PQ decode maps 0 to 0', () => {
      expect(pqDecode(0)).toBeCloseTo(0, 6);
    });

    it('PQ is monotonically increasing', () => {
      let prev = 0;
      for (let i = 0.01; i <= 1; i += 0.05) {
        const curr = pqEncode(i);
        expect(curr).toBeGreaterThan(prev);
        prev = curr;
      }
    });

    it('PQ handles NaN', () => {
      expect(pqEncode(NaN)).toBe(0);
      expect(pqDecode(NaN)).toBe(0);
    });

    it('PQ handles Infinity', () => {
      expect(pqEncode(Infinity)).toBe(1);
      expect(pqDecode(Infinity)).toBe(1);
    });

    it('PQ handles negative values', () => {
      expect(pqEncode(-0.5)).toBe(0);
      expect(pqDecode(-0.5)).toBe(0);
    });
  });

  // ==========================================================================
  // HLG Tests - CSM-009
  // ==========================================================================
  describe('HLG (Hybrid Log-Gamma)', () => {
    it('CSM-009: HLG encode/decode roundtrip', () => {
      const testValues = [0, 0.001, 0.01, 0.05, 0.1, 0.18, 0.5, 0.9, 1.0];
      for (const v of testValues) {
        const encoded = hlgEncode(v);
        const decoded = hlgDecode(encoded);
        expect(decoded).toBeCloseTo(v, 4);
      }
    });

    it('HLG encode maps 0 to 0', () => {
      expect(hlgEncode(0)).toBe(0);
    });

    it('HLG encode maps 1 to 1', () => {
      expect(hlgEncode(1)).toBeCloseTo(1, 4);
    });

    it('HLG is monotonically increasing', () => {
      let prev = 0;
      for (let i = 0.01; i <= 1; i += 0.05) {
        const curr = hlgEncode(i);
        expect(curr).toBeGreaterThan(prev);
        prev = curr;
      }
    });

    it('HLG handles NaN', () => {
      expect(hlgEncode(NaN)).toBe(0);
      expect(hlgDecode(NaN)).toBe(0);
    });

    it('HLG handles Infinity', () => {
      expect(hlgEncode(Infinity)).toBe(1);
      expect(hlgDecode(Infinity)).toBe(1);
    });

    it('HLG handles negative values', () => {
      expect(hlgEncode(-0.5)).toBe(0);
      expect(hlgDecode(-0.5)).toBe(0);
    });
  });

  // ==========================================================================
  // ARRI LogC3 Tests - CSM-008
  // ==========================================================================
  describe('ARRI LogC3 (EI 800)', () => {
    it('CSM-008: LogC3 encode/decode roundtrip', () => {
      const testValues = [0, 0.001, 0.01, 0.05, 0.18, 0.5, 1.0, 2.0, 5.0];
      for (const v of testValues) {
        const encoded = logC3Encode(v);
        const decoded = logC3Decode(encoded);
        expect(decoded).toBeCloseTo(v, 4);
      }
    });

    it('LogC3 encodes 18% gray near middle', () => {
      const encoded = logC3Encode(0.18);
      // LogC3 maps 18% gray to approximately 0.39
      expect(encoded).toBeGreaterThan(0.3);
      expect(encoded).toBeLessThan(0.5);
    });

    it('LogC3 encode maps 0 to near cut point', () => {
      const encoded = logC3Encode(0);
      expect(encoded).toBeCloseTo(0.092809, 4);
    });

    it('LogC3 is monotonically increasing', () => {
      let prev = logC3Encode(0);
      for (let i = 0.01; i <= 5; i += 0.1) {
        const curr = logC3Encode(i);
        expect(curr).toBeGreaterThanOrEqual(prev);
        prev = curr;
      }
    });

    it('LogC3 handles NaN', () => {
      expect(logC3Encode(NaN)).toBe(0);
      expect(logC3Decode(NaN)).toBe(0);
    });

    it('LogC3 handles Infinity', () => {
      expect(logC3Encode(Infinity)).toBe(1);
      expect(logC3Decode(Infinity)).toBe(1);
    });
  });

  // ==========================================================================
  // ARRI LogC4 Tests
  // ==========================================================================
  describe('ARRI LogC4', () => {
    it('LogC4 encode/decode roundtrip', () => {
      const testValues = [0, 0.001, 0.01, 0.18, 0.5, 1.0, 2.0];
      for (const v of testValues) {
        const encoded = logC4Encode(v);
        const decoded = logC4Decode(encoded);
        expect(decoded).toBeCloseTo(v, 4);
      }
    });

    it('LogC4 is monotonically increasing', () => {
      let prev = logC4Encode(0);
      for (let i = 0.01; i <= 5; i += 0.1) {
        const curr = logC4Encode(i);
        expect(curr).toBeGreaterThanOrEqual(prev);
        prev = curr;
      }
    });

    it('LogC4 handles NaN', () => {
      expect(logC4Encode(NaN)).toBe(0);
      expect(logC4Decode(NaN)).toBe(0);
    });

    it('LogC4 handles Infinity', () => {
      expect(logC4Encode(Infinity)).toBe(1);
      expect(logC4Decode(Infinity)).toBe(1);
    });

    it('LogC4 encode/decode roundtrip at ENCODED_CUT boundary', () => {
      // The ENCODED_CUT must be computed as (CUT * S + T) / 14.0
      // so that encode and decode use a consistent switch point.
      // This ensures exact roundtrip at the CUT boundary.
      const CUT = 0.00937677;

      // Verify roundtrip near and at the cut point is accurate
      const encoded = logC4Encode(CUT);
      const decoded = logC4Decode(encoded);
      expect(decoded).toBeCloseTo(CUT, 6);

      // Values just below the cut point should also roundtrip correctly
      const belowCut = CUT - 1e-6;
      const encodedBelow = logC4Encode(belowCut);
      const decodedBelow = logC4Decode(encodedBelow);
      expect(decodedBelow).toBeCloseTo(belowCut, 6);

      // Values just above the cut point should roundtrip through the log2 path
      const aboveCut = CUT + 1e-4;
      const encodedAbove = logC4Encode(aboveCut);
      const decodedAbove = logC4Decode(encodedAbove);
      expect(decodedAbove).toBeCloseTo(aboveCut, 4);
    });
  });

  // ==========================================================================
  // RED Log3G10 Tests
  // ==========================================================================
  describe('RED Log3G10', () => {
    it('Log3G10 encode/decode roundtrip', () => {
      const testValues = [0, 0.001, 0.01, 0.18, 0.5, 1.0, 2.0];
      for (const v of testValues) {
        const encoded = log3G10Encode(v);
        const decoded = log3G10Decode(encoded);
        expect(decoded).toBeCloseTo(v, 4);
      }
    });

    it('Log3G10 handles NaN', () => {
      expect(log3G10Encode(NaN)).toBe(0);
      expect(log3G10Decode(NaN)).toBe(0);
    });

    it('Log3G10 handles Infinity', () => {
      expect(log3G10Encode(Infinity)).toBe(1);
      expect(log3G10Decode(Infinity)).toBe(1);
    });

    it('Log3G10 is monotonically increasing in positive range', () => {
      let prev = log3G10Encode(0);
      for (let i = 0.01; i <= 5; i += 0.1) {
        const curr = log3G10Encode(i);
        expect(curr).toBeGreaterThanOrEqual(prev);
        prev = curr;
      }
    });
  });

  // ==========================================================================
  // Sony S-Log3 Tests
  // ==========================================================================
  describe('Sony S-Log3', () => {
    it('S-Log3 encode/decode roundtrip', () => {
      const testValues = [0, 0.001, 0.01, 0.02, 0.18, 0.5, 1.0, 2.0];
      for (const v of testValues) {
        const encoded = slog3Encode(v);
        const decoded = slog3Decode(encoded);
        expect(decoded).toBeCloseTo(v, 3);
      }
    });

    it('S-Log3 encodes 18% gray near middle', () => {
      const encoded = slog3Encode(0.18);
      // S-Log3 maps 18% gray to approximately 0.41
      expect(encoded).toBeGreaterThan(0.35);
      expect(encoded).toBeLessThan(0.5);
    });

    it('S-Log3 handles NaN', () => {
      expect(slog3Encode(NaN)).toBe(0);
      expect(slog3Decode(NaN)).toBe(0);
    });

    it('S-Log3 handles Infinity', () => {
      expect(slog3Encode(Infinity)).toBe(1);
      expect(slog3Decode(Infinity)).toBe(1);
    });
  });

  // ==========================================================================
  // Gamma Curves Tests
  // ==========================================================================
  describe('Gamma 2.2', () => {
    it('Gamma 2.2 encode/decode roundtrip', () => {
      const testValues = [0, 0.01, 0.1, 0.18, 0.5, 0.9, 1.0];
      for (const v of testValues) {
        const encoded = gamma22Encode(v);
        const decoded = gamma22Decode(encoded);
        expect(decoded).toBeCloseTo(v, 5);
      }
    });

    it('Gamma 2.2 encode maps 0 to 0 and 1 to 1', () => {
      expect(gamma22Encode(0)).toBe(0);
      expect(gamma22Encode(1)).toBeCloseTo(1, 6);
    });

    it('Gamma 2.2 encode brightens midtones', () => {
      expect(gamma22Encode(0.18)).toBeGreaterThan(0.18);
    });

    it('Gamma 2.2 handles negative values (extended range)', () => {
      const result = gamma22Encode(-0.5);
      expect(result).toBeLessThan(0);
      expect(gamma22Decode(result)).toBeCloseTo(-0.5, 5);
    });

    it('Gamma 2.2 handles NaN', () => {
      expect(gamma22Encode(NaN)).toBe(0);
      expect(gamma22Decode(NaN)).toBe(0);
    });
  });

  describe('Gamma 2.4', () => {
    it('Gamma 2.4 encode/decode roundtrip', () => {
      const testValues = [0, 0.01, 0.1, 0.18, 0.5, 0.9, 1.0];
      for (const v of testValues) {
        const encoded = gamma24Encode(v);
        const decoded = gamma24Decode(encoded);
        expect(decoded).toBeCloseTo(v, 5);
      }
    });

    it('Gamma 2.4 handles extremes', () => {
      expect(gamma24Encode(0)).toBe(0);
      expect(gamma24Encode(1)).toBeCloseTo(1, 6);
    });

    it('Gamma 2.4 handles NaN', () => {
      expect(gamma24Encode(NaN)).toBe(0);
      expect(gamma24Decode(NaN)).toBe(0);
    });
  });

  describe('Gamma 2.6', () => {
    it('Gamma 2.6 encode/decode roundtrip', () => {
      const testValues = [0, 0.01, 0.1, 0.18, 0.5, 0.9, 1.0];
      for (const v of testValues) {
        const encoded = gamma26Encode(v);
        const decoded = gamma26Decode(encoded);
        expect(decoded).toBeCloseTo(v, 5);
      }
    });

    it('Gamma 2.6 handles extremes', () => {
      expect(gamma26Encode(0)).toBe(0);
      expect(gamma26Encode(1)).toBeCloseTo(1, 6);
    });

    it('Gamma 2.6 handles NaN', () => {
      expect(gamma26Encode(NaN)).toBe(0);
      expect(gamma26Decode(NaN)).toBe(0);
    });
  });

  // ==========================================================================
  // SMPTE 240M Tests
  // ==========================================================================
  describe('SMPTE 240M', () => {
    it('SMPTE 240M encode/decode roundtrip', () => {
      const testValues = [0, 0.001, 0.01, 0.02, 0.05, 0.1, 0.18, 0.5, 0.9, 1.0];
      for (const v of testValues) {
        const encoded = smpte240mEncode(v);
        const decoded = smpte240mDecode(encoded);
        expect(decoded).toBeCloseTo(v, 4);
      }
    });

    it('SMPTE 240M encode maps 0 to 0', () => {
      expect(smpte240mEncode(0)).toBe(0);
    });

    it('SMPTE 240M encode maps 1 to ~1', () => {
      expect(smpte240mEncode(1)).toBeCloseTo(1, 4);
    });

    it('SMPTE 240M decode maps 0 to 0', () => {
      expect(smpte240mDecode(0)).toBe(0);
    });

    it('SMPTE 240M linear segment: V = 4*L for small values', () => {
      // For L < 0.0228, V = 4*L
      expect(smpte240mEncode(0.01)).toBeCloseTo(0.04, 6);
      expect(smpte240mEncode(0.02)).toBeCloseTo(0.08, 6);
    });

    it('SMPTE 240M decode linear segment: L = V/4 for small values', () => {
      // For V < 4*0.0228 = 0.0912, L = V/4
      expect(smpte240mDecode(0.04)).toBeCloseTo(0.01, 6);
      expect(smpte240mDecode(0.08)).toBeCloseTo(0.02, 6);
    });

    it('SMPTE 240M is monotonically increasing', () => {
      let prev = 0;
      for (let i = 0.01; i <= 1; i += 0.05) {
        const curr = smpte240mEncode(i);
        expect(curr).toBeGreaterThan(prev);
        prev = curr;
      }
    });

    it('SMPTE 240M encode is approximately continuous at the threshold (0.0228)', () => {
      // The SMPTE 240M spec has a very small discontinuity at the threshold;
      // check that the linear and power segments approximately meet.
      const justBelow = smpte240mEncode(0.0228 - 1e-8);
      const justAbove = smpte240mEncode(0.0228 + 1e-8);
      expect(justBelow).toBeCloseTo(justAbove, 3);
    });

    it('SMPTE 240M handles NaN', () => {
      expect(smpte240mEncode(NaN)).toBe(0);
      expect(smpte240mDecode(NaN)).toBe(0);
    });

    it('SMPTE 240M handles Infinity', () => {
      expect(smpte240mEncode(Infinity)).toBe(1);
      expect(smpte240mDecode(Infinity)).toBe(1);
    });

    it('SMPTE 240M handles negative values', () => {
      expect(smpte240mEncode(-0.5)).toBe(0);
      expect(smpte240mDecode(-0.5)).toBe(0);
    });
  });

  // ==========================================================================
  // ACEScct Tests
  // ==========================================================================
  describe('ACEScct', () => {
    it('ACEScct encode/decode roundtrip for positive values', () => {
      const testValues = [0.01, 0.05, 0.18, 0.5, 1.0, 2.0];
      for (const v of testValues) {
        const encoded = acescctEncode(v);
        const decoded = acescctDecode(encoded);
        expect(decoded).toBeCloseTo(v, 3);
      }
    });

    it('ACEScct encodes 18% gray', () => {
      const encoded = acescctEncode(0.18);
      // ACEScct maps 18% gray; value should be positive and less than 1
      expect(encoded).toBeGreaterThan(0.35);
      expect(encoded).toBeLessThan(1.0);
    });

    it('ACEScct handles NaN', () => {
      expect(acescctEncode(NaN)).toBe(0);
      expect(acescctDecode(NaN)).toBe(0);
    });

    it('ACEScct handles Infinity', () => {
      expect(acescctEncode(Infinity)).toBe(1);
      expect(acescctDecode(Infinity)).toBe(1);
    });
  });
});
