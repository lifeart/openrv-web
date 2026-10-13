import { describe, it, expect } from 'vitest';
import {
  CHROMATICITIES,
  chromaticitiesFromICCMatrix,
  chromaticitiesToBT709Matrix,
  getChromaticitiesShaderMatrix,
  identifyChromaticities,
  invertMat3,
  isIdentityMat3,
  isValidChromaticities,
  multiplyMat3,
  namedPrimariesForChromaticities,
  rgbToXYZMatrix,
  type Mat3,
} from './ColorPrimariesMath';
import { COLOR_PRIMARIES_MATRICES } from '../render/ShaderConstants';

function expectMatClose(actual: ArrayLike<number> | null, expected: readonly number[], tol: number): void {
  expect(actual).not.toBeNull();
  for (let i = 0; i < 9; i++) {
    expect(Math.abs((actual![i] ?? NaN) - expected[i]!), `element ${i}: ${actual![i]} vs ${expected[i]}`).toBeLessThan(
      tol,
    );
  }
}

// Published reference matrices (row-major).
// ACES: S-2014-004 / ACES TB-2014-004 Appendix.
const ACES_AP0_TO_XYZ = [
  0.9525523959, 0.0, 0.0000936786, 0.3439664498, 0.7281660966, -0.0721325464, 0.0, 0.0, 1.0088251844,
];
const ACES_AP1_TO_XYZ = [
  0.6624541811, 0.1340042065, 0.156187687, 0.2722287168, 0.6740817658, 0.0536895174, -0.0055746495, 0.0040607335,
  1.0103391003,
];
const ACES_AP0_TO_AP1 = [
  1.4514393161, -0.2365107469, -0.2149285693, -0.0765537734, 1.1762296998, -0.0996759264, 0.0083161484, -0.0060324498,
  0.9977163014,
];
// SMPTE RP 431-2 (DCI-P3, DCI white).
const DCI_P3_TO_XYZ = [
  0.4451698156, 0.2771344092, 0.1722826698, 0.2094916779, 0.7215952542, 0.0689130679, 0.0, 0.0470605601, 0.9073553944,
];
// ACEScg → linear Rec.709 with Bradford D60→D65 (OCIO ACES 1.x config,
// "Utility - Linear - sRGB" from ACEScg).
const ACES_AP1_TO_BT709_BRADFORD = [
  1.70505099, -0.62179212, -0.08325887, -0.13025642, 1.14080474, -0.01054832, -0.02400336, -0.12896898, 1.15297233,
];

describe('ColorPrimariesMath', () => {
  describe('rgbToXYZMatrix', () => {
    it('AP0 matches the published ACES matrix', () => {
      expectMatClose(rgbToXYZMatrix(CHROMATICITIES.acesAP0), ACES_AP0_TO_XYZ, 1e-4);
    });

    it('AP1 matches the published ACES matrix', () => {
      expectMatClose(rgbToXYZMatrix(CHROMATICITIES.acesAP1), ACES_AP1_TO_XYZ, 1e-4);
    });

    it('DCI-P3 matches SMPTE RP 431-2', () => {
      expectMatClose(rgbToXYZMatrix(CHROMATICITIES.dciP3), DCI_P3_TO_XYZ, 1e-4);
    });

    it('AP0 → AP1 (same white) matches the published ACES matrix', () => {
      const ap1Inv = invertMat3(rgbToXYZMatrix(CHROMATICITIES.acesAP1)!)!;
      expectMatClose(multiplyMat3(ap1Inv, rgbToXYZMatrix(CHROMATICITIES.acesAP0)!), ACES_AP0_TO_AP1, 1e-4);
    });

    it('handles primaries with y = 0 (CIE XYZ as RGB) as the identity', () => {
      expectMatClose(rgbToXYZMatrix(CHROMATICITIES.cieXYZ), [1, 0, 0, 0, 1, 0, 0, 0, 1], 1e-9);
    });

    it('accepts float32-rounded chromaticities (EXR attribute precision)', () => {
      expectMatClose(
        rgbToXYZMatrix(new Float32Array(CHROMATICITIES.acesAP0) as unknown as number[]),
        ACES_AP0_TO_XYZ,
        1e-4,
      );
    });
  });

  describe('chromaticitiesToBT709Matrix', () => {
    it('is the identity for BT.709', () => {
      expect(isIdentityMat3(chromaticitiesToBT709Matrix(CHROMATICITIES.bt709)!, 1e-9)).toBe(true);
    });

    it('AP1 → BT.709 matches the Bradford-adapted ACEScg → linear sRGB matrix', () => {
      expectMatClose(chromaticitiesToBT709Matrix(CHROMATICITIES.acesAP1), ACES_AP1_TO_BT709_BRADFORD, 1e-4);
    });

    it('maps the source white to BT.709 white for every non-D65 space', () => {
      for (const c of [CHROMATICITIES.acesAP0, CHROMATICITIES.acesAP1, CHROMATICITIES.dciP3, CHROMATICITIES.cieXYZ]) {
        const m = chromaticitiesToBT709Matrix(c)!;
        for (let row = 0; row < 3; row++) {
          expect(m[row * 3]! + m[row * 3 + 1]! + m[row * 3 + 2]!).toBeCloseTo(1, 6);
        }
      }
    });

    it('AP0 → BT.709 equals (AP1 → BT.709) · (AP0 → AP1)', () => {
      const viaAP1 = multiplyMat3(ACES_AP1_TO_BT709_BRADFORD as Mat3, ACES_AP0_TO_AP1 as Mat3);
      expectMatClose(chromaticitiesToBT709Matrix(CHROMATICITIES.acesAP0), viaAP1, 1e-4);
    });

    it('agrees with the renderer constants for BT.2020 and Display P3', () => {
      // COLOR_PRIMARIES_MATRICES are column-major and rounded to 4 decimals.
      expectMatClose(
        getChromaticitiesShaderMatrix(CHROMATICITIES.bt2020),
        Array.from(COLOR_PRIMARIES_MATRICES.REC2020_TO_SRGB),
        1e-3,
      );
      expectMatClose(
        getChromaticitiesShaderMatrix(CHROMATICITIES.p3),
        Array.from(COLOR_PRIMARIES_MATRICES.P3_TO_SRGB),
        1e-3,
      );
    });
  });

  describe('getChromaticitiesShaderMatrix', () => {
    it('returns the same instance for the same chromaticities (reference-stable)', () => {
      const a = getChromaticitiesShaderMatrix(CHROMATICITIES.acesAP1);
      const b = getChromaticitiesShaderMatrix([...CHROMATICITIES.acesAP1]);
      expect(a).toBe(b);
    });

    it('is column-major', () => {
      const m = getChromaticitiesShaderMatrix(CHROMATICITIES.acesAP1)!;
      expect(m[1]).toBeCloseTo(ACES_AP1_TO_BT709_BRADFORD[3]!, 4);
      expect(m[3]).toBeCloseTo(ACES_AP1_TO_BT709_BRADFORD[1]!, 4);
    });

    it('returns null for degenerate chromaticities', () => {
      expect(getChromaticitiesShaderMatrix([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3127, 0.329])).toBeNull();
      expect(getChromaticitiesShaderMatrix([0.64, 0.33, 0.3, 0.6, 0.15, 0.06, 0.3127, 0])).toBeNull();
    });
  });

  describe('identification', () => {
    it('names AP0, AP1 and DCI-P3', () => {
      expect(identifyChromaticities(CHROMATICITIES.acesAP0)).toBe('acesAP0');
      expect(identifyChromaticities(CHROMATICITIES.acesAP1)).toBe('acesAP1');
      expect(identifyChromaticities(CHROMATICITIES.dciP3)).toBe('dciP3');
      expect(identifyChromaticities([0.6, 0.3, 0.3, 0.6, 0.15, 0.06, 0.3127, 0.329])).toBeUndefined();
    });

    it('only maps renderer fast-path primaries to ColorPrimaries', () => {
      expect(namedPrimariesForChromaticities(CHROMATICITIES.p3)).toBe('p3');
      expect(namedPrimariesForChromaticities(CHROMATICITIES.bt2020)).toBe('bt2020');
      expect(namedPrimariesForChromaticities(CHROMATICITIES.dciP3)).toBeUndefined();
      expect(namedPrimariesForChromaticities(CHROMATICITIES.acesAP1)).toBeUndefined();
    });

    it('validates input', () => {
      expect(isValidChromaticities(CHROMATICITIES.acesAP0)).toBe(true);
      expect(isValidChromaticities([1, 2, 3])).toBe(false);
      expect(isValidChromaticities([NaN, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
    });
  });

  describe('chromaticitiesFromICCMatrix', () => {
    // Display P3 colorants as stored by Apple's "Display P3" profile (D50 PCS)
    const DISPLAY_P3_ICC_D50 = [
      0.515121, 0.291977, 0.157104, 0.241196, 0.692245, 0.0665741, -0.00105286, 0.0418854, 0.784073,
    ];
    const BRADFORD_D65_TO_D50 = [
      1.04788, 0.0229187, -0.0502014, 0.0295868, 0.990479, -0.0170593, -0.00923157, 0.0150757, 0.751678,
    ];

    it('recovers Display P3 primaries (with chad)', () => {
      const c = chromaticitiesFromICCMatrix(DISPLAY_P3_ICC_D50, BRADFORD_D65_TO_D50)!;
      expect(identifyChromaticities(c, 0.003)).toBe('p3');
    });

    it('recovers Display P3 primaries (no chad, D65 assumed)', () => {
      const c = chromaticitiesFromICCMatrix(DISPLAY_P3_ICC_D50)!;
      expect(identifyChromaticities(c, 0.003)).toBe('p3');
    });
  });
});
