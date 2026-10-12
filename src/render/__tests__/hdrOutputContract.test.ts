/**
 * HDR input normalization and output encoding contract (reference math).
 *
 * Checks the TypeScript ports of the viewer.frag.glsl HDR functions against
 * published reference values (ITU-R BT.2100, BT.2408, SMPTE ST 2084), and
 * the contract that both HDR inputs use 1.0 = 203 cd/m² and that every
 * output encoding is the exact inverse of its input decode.
 *
 * The same values are checked against the real GLSL in
 * src/render/__gpu__/hdr-output.gpu-test.ts.
 *
 * Test ID convention: HDRC-NNN
 */

import { describe, it, expect } from 'vitest';
import {
  HDR_REFERENCE_WHITE_NITS,
  HLG_NOMINAL_PEAK_NITS,
  hlgToLinear,
  linearToHLG,
  pqEOTFChannel,
  linearToPQ,
  extendedSRGBEncode,
  linearToSRGBChannel,
} from './shaderMathReference';
import {
  OUTPUT_ENCODING_DISPLAY,
  OUTPUT_ENCODING_EXTENDED_SRGB,
  OUTPUT_ENCODING_HLG,
  OUTPUT_ENCODING_LINEAR,
  OUTPUT_ENCODING_PQ,
  outputEncodingForCanvasColorSpace,
  outputEncodingForHDRMode,
} from '../../config/RenderConfig';

/** PQ signal → display linear (1.0 = 203 cd/m²), mirroring GLSL pqToLinear. */
function pqToLinear(signal: number): number {
  return pqEOTFChannel(signal) * (10000 / HDR_REFERENCE_WHITE_NITS);
}

describe('HDR input normalization', () => {
  it('HDRC-001: HLG reference white (signal 0.75) decodes to ~1.0 (203 cd/m², BT.2408)', () => {
    const [r, g, b] = hlgToLinear(0.75, 0.75, 0.75);
    // 0.75 → scene 0.26497 → display 0.26497^1.2 * 1000 ≈ 203.2 cd/m²
    expect(r).toBeCloseTo(1.0, 2);
    expect(g).toBeCloseTo(r, 10);
    expect(b).toBeCloseTo(r, 10);
  });

  it('HDRC-002: PQ 203 cd/m² signal (0.5806) decodes to ~1.0', () => {
    // SMPTE ST 2084: 203 cd/m² ↔ PQ signal 0.58069
    expect(pqToLinear(0.58069)).toBeCloseTo(1.0, 3);
  });

  it('HDRC-003: HLG and PQ reference white land on the same linear value (no 2.3-stop gap)', () => {
    const [hlg] = hlgToLinear(0.75, 0.75, 0.75);
    const pq = pqToLinear(0.58069);
    // Previously HLG peaked at 1.0, which put reference white ~4.9x (2.3 stops) below PQ.
    expect(Math.abs(Math.log2(hlg / pq))).toBeLessThan(0.01);
  });

  it('HDRC-004: HLG peak (signal 1.0) decodes to nominal peak / reference white', () => {
    const [r] = hlgToLinear(1, 1, 1);
    expect(r).toBeCloseTo(HLG_NOMINAL_PEAK_NITS / HDR_REFERENCE_WHITE_NITS, 4);
  });

  it('HDRC-005: PQ 1000 cd/m² signal (0.7518) decodes to 1000/203', () => {
    expect(pqToLinear(0.75183)).toBeCloseTo(1000 / 203, 2);
  });

  it('HDRC-006: HLG OOTF uses BT.2020 luminance weights', () => {
    // Pure green on BT.2020 carries 0.6780 of the luminance. With the old
    // BT.709 weights (0.7152) the OOTF gain for this pixel was different.
    const [, g] = hlgToLinear(0, 0.75, 0);
    const scene = 0.265; // hlgOETFInverse(0.75)
    const ys = scene * 0.678;
    const expected = scene * Math.pow(ys, 0.2) * (HLG_NOMINAL_PEAK_NITS / HDR_REFERENCE_WHITE_NITS);
    expect(g).toBeCloseTo(expected, 3);
  });
});

describe('HDR output encoding', () => {
  it('HDRC-010: linearToPQ maps 1.0 to the 203 cd/m² PQ signal', () => {
    expect(linearToPQ(1.0)).toBeCloseTo(0.58069, 4);
  });

  it('HDRC-011: linearToPQ maps 1000/203 to the 1000 cd/m² PQ signal', () => {
    expect(linearToPQ(1000 / 203)).toBeCloseTo(0.75183, 4);
  });

  it('HDRC-012: linearToPQ clamps at 10000 cd/m² and black', () => {
    expect(linearToPQ(1e6)).toBeCloseTo(1.0, 6);
    expect(linearToPQ(-1)).toBeCloseTo(pqInverseZero(), 10);
  });

  it('HDRC-013: linearToHLG maps 1.0 to HLG reference white 0.75', () => {
    const [r, g, b] = linearToHLG(1, 1, 1);
    expect(r).toBeCloseTo(0.75, 3);
    expect(g).toBeCloseTo(0.75, 3);
    expect(b).toBeCloseTo(0.75, 3);
  });

  it('HDRC-014: linearToHLG maps nominal peak to signal 1.0 and clips above it', () => {
    const peak = HLG_NOMINAL_PEAK_NITS / HDR_REFERENCE_WHITE_NITS;
    expect(linearToHLG(peak, peak, peak)[0]).toBeCloseTo(1.0, 4);
    expect(linearToHLG(peak * 4, peak * 4, peak * 4)[0]).toBeCloseTo(1.0, 6);
  });

  it('HDRC-015: HLG encode is the exact inverse of decode (grey ramp, incl. near-black ramp)', () => {
    for (const s of [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 0.6, 0.75, 0.9, 1.0]) {
      const lin = hlgToLinear(s, s, s);
      const [e] = linearToHLG(lin[0], lin[1], lin[2]);
      expect(e).toBeCloseTo(s, 4);
    }
  });

  it('HDRC-016: HLG encode is the exact inverse of decode (colored pixels)', () => {
    const samples: [number, number, number][] = [
      [0.75, 0.5, 0.25],
      [0.2, 0.8, 0.4],
      [0.9, 0.1, 0.6],
    ];
    for (const [r, g, b] of samples) {
      const lin = hlgToLinear(r, g, b);
      const enc = linearToHLG(lin[0], lin[1], lin[2]);
      expect(enc[0]).toBeCloseTo(r, 4);
      expect(enc[1]).toBeCloseTo(g, 4);
      expect(enc[2]).toBeCloseTo(b, 4);
    }
  });

  it('HDRC-017: PQ encode is the exact inverse of decode', () => {
    for (const s of [0.05, 0.25, 0.5, 0.58069, 0.75, 0.9, 1.0]) {
      expect(linearToPQ(pqToLinear(s))).toBeCloseTo(s, 4);
    }
  });

  it('HDRC-018: extended sRGB matches sRGB in [0,1] and keeps going above 1.0', () => {
    for (const x of [0, 0.001, 0.18, 0.5, 1.0]) {
      expect(extendedSRGBEncode(x)).toBeCloseTo(linearToSRGBChannel(x), 6);
    }
    // 4x SDR white → 1.055 * 4^(1/2.4) - 0.055
    expect(extendedSRGBEncode(4)).toBeCloseTo(1.055 * Math.pow(4, 1 / 2.4) - 0.055, 6);
    expect(extendedSRGBEncode(4)).toBeGreaterThan(1.0);
    // Sign-preserving for out-of-gamut negatives
    expect(extendedSRGBEncode(-0.5)).toBeCloseTo(-linearToSRGBChannel(0.5), 6);
  });
});

describe('Output encoding selection', () => {
  it('HDRC-020: WebGL drawing-buffer modes', () => {
    expect(outputEncodingForHDRMode('sdr')).toBe(OUTPUT_ENCODING_DISPLAY);
    expect(outputEncodingForHDRMode('extended')).toBe(OUTPUT_ENCODING_EXTENDED_SRGB);
    expect(outputEncodingForHDRMode('hlg')).toBe(OUTPUT_ENCODING_HLG);
    expect(outputEncodingForHDRMode('pq')).toBe(OUTPUT_ENCODING_PQ);
  });

  it('HDRC-021: canvas color spaces', () => {
    expect(outputEncodingForCanvasColorSpace('srgb-linear')).toBe(OUTPUT_ENCODING_LINEAR);
    expect(outputEncodingForCanvasColorSpace('rec2100-hlg')).toBe(OUTPUT_ENCODING_HLG);
    expect(outputEncodingForCanvasColorSpace('rec2100-pq')).toBe(OUTPUT_ENCODING_PQ);
    expect(outputEncodingForCanvasColorSpace('srgb')).toBe(OUTPUT_ENCODING_EXTENDED_SRGB);
    expect(outputEncodingForCanvasColorSpace('display-p3')).toBe(OUTPUT_ENCODING_EXTENDED_SRGB);
  });
});

function pqInverseZero(): number {
  // PQ signal for 0 cd/m²: (c1)^m2
  return Math.pow(0.8359375, 78.84375);
}
