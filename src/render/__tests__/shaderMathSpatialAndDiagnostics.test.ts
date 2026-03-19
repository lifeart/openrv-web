/**
 * Cross-ecosystem shader math tests: Spatial filters, diagnostics, display
 * transfer dispatch, hue rotation matrix, and background patterns.
 *
 * Verifies mathematical consistency between the TypeScript reference
 * implementations (ported from GLSL) and CPU implementations.
 *
 * Test ID convention: XE-<GROUP>-NNN (cross-ecosystem)
 */

import { describe, it, expect } from 'vitest';
import {
  clarityFilter,
  sharpenFilter,
  channelIsolation,
  bayerDither8x8,
  checkerPattern,
  buildHueRotationMatrix,
  applyMat3,
  applyDisplayTransferDispatch,
  luminanceRec709,
  linearToSRGBChannel,
  linearToRec709Channel,
} from './shaderMathReference';

// CPU implementations for cross-verification
import { applyDisplayTransfer } from '../../color/DisplayTransfer';
import { buildHueRotationMatrix as cpuBuildHueRotationMatrix } from '../../color/HueRotation';

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

// =============================================================================
// Clarity (XE-CLARITY-NNN)
// =============================================================================

describe('Clarity filter', () => {
  it('XE-CLARITY-001: Flat field (all same value) produces no change', () => {
    const flat = new Array(25).fill(0.5);
    const correction = clarityFilter(flat, 1.0, 0.5);
    expect(correction).toBeCloseTo(0.0, 10);
  });

  it('XE-CLARITY-002: Edge pixel produces enhanced contrast', () => {
    // Center is bright (0.8), surroundings are dark (0.2) — should produce positive correction
    const pixels = new Array(25).fill(0.2);
    pixels[12] = 0.8; // center
    const correction = clarityFilter(pixels, 1.0, 0.5);
    expect(correction).toBeGreaterThan(0);
  });

  it('XE-CLARITY-003: Gaussian weights sum to 1.0 (verify [1,4,6,4,1]^2 / 256 = 1.0)', () => {
    const weights1d = [1, 4, 6, 4, 1];
    let total = 0;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        total += weights1d[x]! * weights1d[y]!;
      }
    }
    // Sum of outer product should be 16*16 = 256
    expect(total).toBe(256);
    // Normalized weights sum to 1.0
    expect(total / 256).toBeCloseTo(1.0, 10);
  });

  it('XE-CLARITY-004: Amount=0 produces identity (no correction)', () => {
    const pixels = new Array(25).fill(0.2);
    pixels[12] = 0.8;
    const correction = clarityFilter(pixels, 0.0, 0.5);
    expect(correction).toBeCloseTo(0.0, 10);
  });

  it('XE-CLARITY-005: Midtone mask — very bright/dark pixels affected less', () => {
    // Same spatial pattern, but different processed luminance
    const pixels = new Array(25).fill(0.2);
    pixels[12] = 0.8;

    // Midtone (0.5) — maximum mask
    const midCorrection = clarityFilter(pixels, 1.0, 0.5);

    // Very bright (0.95) — minimal mask
    const brightCorrection = clarityFilter(pixels, 1.0, 0.95);

    // Very dark (0.05) — minimal mask
    const darkCorrection = clarityFilter(pixels, 1.0, 0.05);

    // Midtone correction should be larger in magnitude than bright/dark
    expect(Math.abs(midCorrection)).toBeGreaterThan(Math.abs(brightCorrection));
    expect(Math.abs(midCorrection)).toBeGreaterThan(Math.abs(darkCorrection));
  });
});

// =============================================================================
// Sharpen (XE-SHARP-NNN)
// =============================================================================

describe('Sharpen filter', () => {
  it('XE-SHARP-001: Flat field produces no change', () => {
    const result = sharpenFilter(0.5, [0.5, 0.5, 0.5, 0.5], 1.0);
    expect(result).toBeCloseTo(0.5, 10);
  });

  it('XE-SHARP-002: Edge between 0 and 1 is enhanced', () => {
    // Center is 1.0, all neighbors are 0.0 — should enhance
    const result = sharpenFilter(1.0, [0.0, 0.0, 0.0, 0.0], 1.0);
    // detail = 1.0*4 - 0 = 4.0, result = 1.0 + 4.0*1.0 = 5.0
    expect(result).toBeCloseTo(5.0, 10);
  });

  it('XE-SHARP-003: Amount=0 produces identity', () => {
    const result = sharpenFilter(1.0, [0.0, 0.0, 0.0, 0.0], 0.0);
    expect(result).toBeCloseTo(1.0, 10);
  });

  it('XE-SHARP-004: Negative amount produces blur effect', () => {
    // Center brighter than neighbors — negative amount should reduce center
    const result = sharpenFilter(1.0, [0.5, 0.5, 0.5, 0.5], -0.5);
    // detail = 1.0*4 - 2.0 = 2.0, result = 1.0 + 2.0*(-0.5) = 0.0
    expect(result).toBeCloseTo(0.0, 10);
  });
});

// =============================================================================
// Channel Isolation (XE-CHAN-NNN)
// =============================================================================

describe('Channel isolation', () => {
  it('XE-CHAN-001: Mode 1 (red) on (0.3, 0.5, 0.7) returns (0.3, 0.3, 0.3)', () => {
    const [r, g, b] = channelIsolation(0.3, 0.5, 0.7, 1);
    expect(r).toBeCloseTo(0.3, 10);
    expect(g).toBeCloseTo(0.3, 10);
    expect(b).toBeCloseTo(0.3, 10);
  });

  it('XE-CHAN-002: Mode 2 (green) returns (0.5, 0.5, 0.5)', () => {
    const [r, g, b] = channelIsolation(0.3, 0.5, 0.7, 2);
    expect(r).toBeCloseTo(0.5, 10);
    expect(g).toBeCloseTo(0.5, 10);
    expect(b).toBeCloseTo(0.5, 10);
  });

  it('XE-CHAN-003: Mode 3 (blue) returns (0.7, 0.7, 0.7)', () => {
    const [r, g, b] = channelIsolation(0.3, 0.5, 0.7, 3);
    expect(r).toBeCloseTo(0.7, 10);
    expect(g).toBeCloseTo(0.7, 10);
    expect(b).toBeCloseTo(0.7, 10);
  });

  it('XE-CHAN-004: Mode 5 (luma) returns Rec.709 luminance replicated', () => {
    const expectedLuma = LUMA_R * 0.3 + LUMA_G * 0.5 + LUMA_B * 0.7;
    const [r, g, b] = channelIsolation(0.3, 0.5, 0.7, 5);
    expect(r).toBeCloseTo(expectedLuma, 10);
    expect(g).toBeCloseTo(expectedLuma, 10);
    expect(b).toBeCloseTo(expectedLuma, 10);
  });
});

// =============================================================================
// Bayer Dither (XE-DITHER-NNN)
// =============================================================================

describe('Bayer dither 8x8', () => {
  it('XE-DITHER-001: Position (0,0) returns known value', () => {
    // bayer[0] = 0, so (0 + 0.5) / 64 = 0.0078125
    expect(bayerDither8x8(0, 0)).toBeCloseTo(0.5 / 64.0, 10);
  });

  it('XE-DITHER-002: Full 8x8 matrix sums to correct total', () => {
    // Sum of all bayer matrix values: 0+1+2+...+63 = 63*64/2 = 2016
    // Plus 0.5 per entry: (2016 + 64*0.5) / 64 = (2016+32)/64 = 32.0
    let sum = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        sum += bayerDither8x8(x, y);
      }
    }
    // Sum of normalized values = (2016 + 32) / 64 = 32.0
    expect(sum).toBeCloseTo(32.0, 5);
  });

  it('XE-DITHER-003: Values are in [0, 1) range (normalized by 64)', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const val = bayerDither8x8(x, y);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1.0);
      }
    }
  });
});

// =============================================================================
// Background Pattern (XE-BG-NNN)
// =============================================================================

describe('Background pattern (checker)', () => {
  it('XE-BG-001: Checker at (0,0) size 16 returns color1 (0)', () => {
    expect(checkerPattern(0, 0, 16)).toBe(0);
  });

  it('XE-BG-002: Checker at (16,0) size 16 returns color2 (1)', () => {
    expect(checkerPattern(16, 0, 16)).toBe(1);
  });

  it('XE-BG-003: Checker wraps correctly', () => {
    // (32, 0) should be same as (0, 0)
    expect(checkerPattern(32, 0, 16)).toBe(0);
    // (48, 0) should be same as (16, 0)
    expect(checkerPattern(48, 0, 16)).toBe(1);
    // (0, 16) should be opposite of (0, 0)
    expect(checkerPattern(0, 16, 16)).toBe(1);
    // (16, 16) should be same as (0, 0)
    expect(checkerPattern(16, 16, 16)).toBe(0);
  });
});

// =============================================================================
// Hue Rotation Matrix (XE-HUEMAT-NNN)
// =============================================================================

describe('Hue rotation matrix', () => {
  it('XE-HUEMAT-001: 0 degrees produces identity', () => {
    const mat = buildHueRotationMatrix(0);
    // Should be approximately identity
    const [r, g, b] = applyMat3(mat, 0.3, 0.5, 0.7);
    expect(r).toBeCloseTo(0.3, 5);
    expect(g).toBeCloseTo(0.5, 5);
    expect(b).toBeCloseTo(0.7, 5);
  });

  it('XE-HUEMAT-002: 360 degrees produces identity', () => {
    const mat = buildHueRotationMatrix(360);
    const [r, g, b] = applyMat3(mat, 0.3, 0.5, 0.7);
    expect(r).toBeCloseTo(0.3, 5);
    expect(g).toBeCloseTo(0.5, 5);
    expect(b).toBeCloseTo(0.7, 5);
  });

  it('XE-HUEMAT-003: 120 degrees on (1,0,0) shifts toward green', () => {
    const mat = buildHueRotationMatrix(120);
    const [r, g] = applyMat3(mat, 1, 0, 0);
    // After 120-degree rotation, red should shift significantly toward green
    expect(g).toBeGreaterThan(r);
  });

  it('XE-HUEMAT-004: Luminance preserved after rotation', () => {
    const testAngles = [30, 45, 60, 90, 120, 180, 240, 300];
    const testColor: [number, number, number] = [0.4, 0.6, 0.2];
    const originalLuma = luminanceRec709(...testColor);

    for (const angle of testAngles) {
      const mat = buildHueRotationMatrix(angle);
      const rotated = applyMat3(mat, ...testColor);
      const rotatedLuma = luminanceRec709(rotated[0], rotated[1], rotated[2]);
      expect(rotatedLuma).toBeCloseTo(originalLuma, 5);
    }
  });

  it('XE-HUEMAT-005: Cross-check with HueRotation.ts CPU implementation', () => {
    const testAngles = [0, 30, 90, 120, 180, 270, 360];
    for (const angle of testAngles) {
      const refMat = buildHueRotationMatrix(angle);
      const cpuMat = cpuBuildHueRotationMatrix(angle);

      for (let i = 0; i < 9; i++) {
        // CPU implementation uses Float32Array (32-bit), reference uses 64-bit doubles
        expect(refMat[i]).toBeCloseTo(cpuMat[i]!, 6);
      }
    }
  });
});

// =============================================================================
// Display Transfer Dispatch (XE-DISPLAY-NNN)
// =============================================================================

describe('Display transfer dispatch', () => {
  const testValues = [0.0, 0.001, 0.01, 0.018, 0.04, 0.1, 0.18, 0.5, 0.8, 1.0];

  it('XE-DISPLAY-001: sRGB mode matches srgbOETF (linearToSRGBChannel)', () => {
    for (const v of testValues) {
      const [r] = applyDisplayTransferDispatch(v, v, v, 1);
      expect(r).toBeCloseTo(linearToSRGBChannel(v), 10);
    }
  });

  it('XE-DISPLAY-002: Rec.709 mode matches rec709 OETF', () => {
    for (const v of testValues) {
      const [r] = applyDisplayTransferDispatch(v, v, v, 2);
      expect(r).toBeCloseTo(linearToRec709Channel(v), 10);
    }
  });

  it('XE-DISPLAY-003: Gamma 2.2 mode = pow(x, 1/2.2)', () => {
    for (const v of testValues) {
      const expected = Math.pow(Math.max(v, 0), 1.0 / 2.2);
      const [r] = applyDisplayTransferDispatch(v, v, v, 3);
      expect(r).toBeCloseTo(expected, 10);
    }
  });

  it('XE-DISPLAY-004: Gamma 2.4 mode = pow(x, 1/2.4)', () => {
    for (const v of testValues) {
      const expected = Math.pow(Math.max(v, 0), 1.0 / 2.4);
      const [r] = applyDisplayTransferDispatch(v, v, v, 4);
      expect(r).toBeCloseTo(expected, 10);
    }
  });

  it('XE-DISPLAY-005: Custom gamma mode = pow(x, 1/customGamma)', () => {
    const customGamma = 1.8;
    for (const v of testValues) {
      const expected = Math.pow(Math.max(v, 0), 1.0 / customGamma);
      const [r] = applyDisplayTransferDispatch(v, v, v, 5, customGamma);
      expect(r).toBeCloseTo(expected, 10);
    }
  });

  it('XE-DISPLAY-006: Cross-check with DisplayTransfer.ts CPU implementation', () => {
    const modes: Array<{ code: number; name: 'srgb' | 'rec709' | 'gamma2.2' | 'gamma2.4' | 'custom' }> = [
      { code: 1, name: 'srgb' },
      { code: 2, name: 'rec709' },
      { code: 3, name: 'gamma2.2' },
      { code: 4, name: 'gamma2.4' },
      { code: 5, name: 'custom' },
    ];
    const customGamma = 2.2;

    for (const { code, name } of modes) {
      for (const v of testValues) {
        const [refR] = applyDisplayTransferDispatch(v, v, v, code, customGamma);
        const cpuR = applyDisplayTransfer(v, name, customGamma);
        expect(refR).toBeCloseTo(cpuR, 5);
      }
    }
  });
});
