import { describe, it, expect } from 'vitest';
import {
  float32ArrayEquals,
  hexToRgbInto,
  assignColorAdjustments,
  assignToneMappingState,
  createDefaultInternalState,
} from './ShaderStateTypes';
import { DEFAULT_COLOR_ADJUSTMENTS } from '../core/types/color';
import type { ColorAdjustments } from '../core/types/color';
import { DEFAULT_TONE_MAPPING_STATE } from '../core/types/effects';
import type { ToneMappingState } from '../core/types/effects';
import { DISPLAY_TRANSFER_SRGB } from '../config/RenderConfig';
import {
  BG_PATTERN_NONE,
  CHANNEL_MODE_CODES,
  DEFAULT_CHECKER_SIZE,
  DEFAULT_ZEBRA_HIGH_THRESHOLD,
  DEFAULT_ZEBRA_LOW_THRESHOLD,
} from './ShaderConstants';

// ---------------------------------------------------------------------------
// float32ArrayEquals
// ---------------------------------------------------------------------------
describe('float32ArrayEquals', () => {
  it('SST-F32-001: returns true for identical arrays', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(float32ArrayEquals(a, b)).toBe(true);
  });

  it('SST-F32-002: returns false for arrays with different values', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 4]);
    expect(float32ArrayEquals(a, b)).toBe(false);
  });

  it('SST-F32-003: returns false for arrays with different lengths', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(float32ArrayEquals(a, b)).toBe(false);
  });

  it('SST-F32-004: returns true for empty arrays', () => {
    expect(float32ArrayEquals(new Float32Array([]), new Float32Array([]))).toBe(true);
  });

  it('SST-F32-005: returns true for same reference', () => {
    const a = new Float32Array([1, 2, 3]);
    expect(float32ArrayEquals(a, a)).toBe(true);
  });

  it('SST-F32-006: detects difference at first element', () => {
    const a = new Float32Array([0, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(float32ArrayEquals(a, b)).toBe(false);
  });

  it('SST-F32-007: detects difference at last element', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 0]);
    expect(float32ArrayEquals(a, b)).toBe(false);
  });

  it('SST-F32-008: handles single-element arrays', () => {
    expect(float32ArrayEquals(new Float32Array([5]), new Float32Array([5]))).toBe(true);
    expect(float32ArrayEquals(new Float32Array([5]), new Float32Array([6]))).toBe(false);
  });

  it('SST-F32-009: handles mat3 identity comparison (9 elements)', () => {
    const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const identity2 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(float32ArrayEquals(identity, identity2)).toBe(true);
  });

  it('SST-F32-010: distinguishes 0 from -0', () => {
    // Float32Array normalizes -0 to 0, so they should be equal
    const a = new Float32Array([0]);
    const b = new Float32Array([-0]);
    expect(float32ArrayEquals(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hexToRgbInto
// ---------------------------------------------------------------------------
describe('hexToRgbInto', () => {
  it('SST-HEX-001: parses 6-digit hex with #', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#ff0000', out);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(0.0, 4);
    expect(out[2]).toBeCloseTo(0.0, 4);
  });

  it('SST-HEX-002: parses 6-digit hex without #', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('00ff00', out);
    expect(out[0]).toBeCloseTo(0.0, 4);
    expect(out[1]).toBeCloseTo(1.0, 4);
    expect(out[2]).toBeCloseTo(0.0, 4);
  });

  it('SST-HEX-003: parses 3-digit shorthand hex', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#f00', out);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(0.0, 4);
    expect(out[2]).toBeCloseTo(0.0, 4);
  });

  it('SST-HEX-004: parses white', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#ffffff', out);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(1.0, 4);
    expect(out[2]).toBeCloseTo(1.0, 4);
  });

  it('SST-HEX-005: parses black', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#000000', out);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(0);
  });

  it('SST-HEX-006: parses blue', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#0000ff', out);
    expect(out[0]).toBeCloseTo(0.0, 4);
    expect(out[1]).toBeCloseTo(0.0, 4);
    expect(out[2]).toBeCloseTo(1.0, 4);
  });

  it('SST-HEX-007: parses mid-gray', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#808080', out);
    expect(out[0]).toBeCloseTo(128 / 255, 4);
    expect(out[1]).toBeCloseTo(128 / 255, 4);
    expect(out[2]).toBeCloseTo(128 / 255, 4);
  });

  it('SST-HEX-008: writes into existing tuple without allocation', () => {
    const out: [number, number, number] = [0.5, 0.5, 0.5];
    hexToRgbInto('#ff0000', out);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(0.0, 4);
    expect(out[2]).toBeCloseTo(0.0, 4);
  });

  it('SST-HEX-009: 3-digit shorthand #fff expands correctly', () => {
    const out: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#fff', out);
    expect(out[0]).toBeCloseTo(1.0, 4);
    expect(out[1]).toBeCloseTo(1.0, 4);
    expect(out[2]).toBeCloseTo(1.0, 4);
  });

  it('SST-HEX-010: case-insensitive hex digits', () => {
    const lower: [number, number, number] = [0, 0, 0];
    const upper: [number, number, number] = [0, 0, 0];
    hexToRgbInto('#aabbcc', lower);
    hexToRgbInto('#AABBCC', upper);
    expect(lower[0]).toBeCloseTo(upper[0], 4);
    expect(lower[1]).toBeCloseTo(upper[1], 4);
    expect(lower[2]).toBeCloseTo(upper[2], 4);
  });
});

// ---------------------------------------------------------------------------
// assignColorAdjustments
// ---------------------------------------------------------------------------
describe('assignColorAdjustments', () => {
  function makeAdjustments(overrides: Partial<ColorAdjustments> = {}): ColorAdjustments {
    return { ...DEFAULT_COLOR_ADJUSTMENTS, ...overrides };
  }

  it('SST-CA-001: copies all scalar properties', () => {
    const src = makeAdjustments({ exposure: 2.5, gamma: 0.8, saturation: 1.5, contrast: 1.2 });
    const dst = makeAdjustments();
    assignColorAdjustments(dst, src);
    expect(dst.exposure).toBe(2.5);
    expect(dst.gamma).toBe(0.8);
    expect(dst.saturation).toBe(1.5);
    expect(dst.contrast).toBe(1.2);
  });

  it('SST-CA-002: copies boolean properties', () => {
    const src = makeAdjustments({ vibranceSkinProtection: false });
    const dst = makeAdjustments({ vibranceSkinProtection: true });
    assignColorAdjustments(dst, src);
    expect(dst.vibranceSkinProtection).toBe(false);
  });

  it('SST-CA-003: copies all known properties', () => {
    const src = makeAdjustments({
      exposure: 1,
      gamma: 2,
      saturation: 3,
      vibrance: 4,
      vibranceSkinProtection: false,
      contrast: 5,
      clarity: 6,
      hueRotation: 7,
      temperature: 8,
      tint: 9,
      brightness: 10,
      highlights: 11,
      shadows: 12,
      whites: 13,
      blacks: 14,
    });
    const dst = makeAdjustments();
    assignColorAdjustments(dst, src);
    expect(dst.exposure).toBe(1);
    expect(dst.gamma).toBe(2);
    expect(dst.saturation).toBe(3);
    expect(dst.vibrance).toBe(4);
    expect(dst.vibranceSkinProtection).toBe(false);
    expect(dst.contrast).toBe(5);
    expect(dst.clarity).toBe(6);
    expect(dst.hueRotation).toBe(7);
    expect(dst.temperature).toBe(8);
    expect(dst.tint).toBe(9);
    expect(dst.brightness).toBe(10);
    expect(dst.highlights).toBe(11);
    expect(dst.shadows).toBe(12);
    expect(dst.whites).toBe(13);
    expect(dst.blacks).toBe(14);
  });

  it('SST-CA-004: does not create new object — mutates dst in place', () => {
    const src = makeAdjustments({ exposure: 5 });
    const dst = makeAdjustments();
    const ref = dst;
    assignColorAdjustments(dst, src);
    expect(dst).toBe(ref);
    expect(dst.exposure).toBe(5);
  });

  it('SST-CA-005: copies optional RGB array properties', () => {
    const rgb: [number, number, number] = [0.1, 0.2, 0.3];
    const src = makeAdjustments({ exposureRGB: rgb, gammaRGB: rgb, contrastRGB: rgb });
    const dst = makeAdjustments();
    assignColorAdjustments(dst, src);
    expect(dst.exposureRGB).toEqual(rgb);
    expect(dst.gammaRGB).toEqual(rgb);
    expect(dst.contrastRGB).toEqual(rgb);
  });

  it('SST-CA-006: copies scale/offset and inline LUT properties', () => {
    const lut = new Float32Array([0, 0.5, 1]);
    const src = makeAdjustments({ scale: 2, offset: 0.1, inlineLUT: lut, lutChannels: 3 });
    const dst = makeAdjustments();
    assignColorAdjustments(dst, src);
    expect(dst.scale).toBe(2);
    expect(dst.offset).toBe(0.1);
    expect(dst.inlineLUT).toBe(lut);
    expect(dst.lutChannels).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// assignToneMappingState
// ---------------------------------------------------------------------------
describe('assignToneMappingState', () => {
  function makeTM(overrides: Partial<ToneMappingState> = {}): ToneMappingState {
    return { ...DEFAULT_TONE_MAPPING_STATE, ...overrides };
  }

  it('SST-TM-001: copies all tone mapping properties', () => {
    const src = makeTM({
      enabled: true,
      operator: 'aces',
      reinhardWhitePoint: 5.0,
      filmicExposureBias: 3.0,
      filmicWhitePoint: 12.0,
      dragoBias: 0.9,
      dragoLwa: 0.3,
      dragoLmax: 2.0,
      dragoBrightness: 3.0,
    });
    const dst = makeTM();
    assignToneMappingState(dst, src);
    expect(dst.enabled).toBe(true);
    expect(dst.operator).toBe('aces');
    expect(dst.reinhardWhitePoint).toBe(5.0);
    expect(dst.filmicExposureBias).toBe(3.0);
    expect(dst.filmicWhitePoint).toBe(12.0);
    expect(dst.dragoBias).toBe(0.9);
    expect(dst.dragoLwa).toBe(0.3);
    expect(dst.dragoLmax).toBe(2.0);
    expect(dst.dragoBrightness).toBe(3.0);
  });

  it('SST-TM-002: mutates dst in place', () => {
    const src = makeTM({ enabled: true });
    const dst = makeTM();
    const ref = dst;
    assignToneMappingState(dst, src);
    expect(dst).toBe(ref);
    expect(dst.enabled).toBe(true);
  });

  it('SST-TM-003: copies default state correctly', () => {
    const src = makeTM();
    const dst = makeTM({ enabled: true, operator: 'aces' });
    assignToneMappingState(dst, src);
    expect(dst.enabled).toBe(false);
    expect(dst.operator).toBe('off');
  });
});

// ---------------------------------------------------------------------------
// createDefaultInternalState
// ---------------------------------------------------------------------------
describe('createDefaultInternalState', () => {
  it('SST-DEF-001: returns a fresh object each call', () => {
    const a = createDefaultInternalState();
    const b = createDefaultInternalState();
    expect(a).not.toBe(b);
  });

  it('SST-DEF-002: color adjustments match defaults', () => {
    const s = createDefaultInternalState();
    expect(s.colorAdjustments.exposure).toBe(DEFAULT_COLOR_ADJUSTMENTS.exposure);
    expect(s.colorAdjustments.gamma).toBe(DEFAULT_COLOR_ADJUSTMENTS.gamma);
    expect(s.colorAdjustments.saturation).toBe(DEFAULT_COLOR_ADJUSTMENTS.saturation);
  });

  it('SST-DEF-003: tone mapping matches defaults', () => {
    const s = createDefaultInternalState();
    expect(s.toneMappingState.enabled).toBe(false);
    expect(s.toneMappingState.operator).toBe('off');
  });

  it('SST-DEF-004: background defaults', () => {
    const s = createDefaultInternalState();
    expect(s.bgPatternCode).toBe(BG_PATTERN_NONE);
    expect(s.bgCheckerSize).toBe(DEFAULT_CHECKER_SIZE);
    expect(s.bgColor1).toEqual([0, 0, 0]);
    expect(s.bgColor2).toEqual([0, 0, 0]);
  });

  it('SST-DEF-005: CDL defaults (identity transform)', () => {
    const s = createDefaultInternalState();
    expect(s.cdlEnabled).toBe(false);
    expect(s.cdlSlope).toEqual([1, 1, 1]);
    expect(s.cdlOffset).toEqual([0, 0, 0]);
    expect(s.cdlPower).toEqual([1, 1, 1]);
    expect(s.cdlSaturation).toBe(1);
    expect(s.cdlColorspace).toBe(0);
  });

  it('SST-DEF-006: zebra defaults', () => {
    const s = createDefaultInternalState();
    expect(s.zebraEnabled).toBe(false);
    expect(s.zebraHighThreshold).toBe(DEFAULT_ZEBRA_HIGH_THRESHOLD);
    expect(s.zebraLowThreshold).toBe(DEFAULT_ZEBRA_LOW_THRESHOLD);
    expect(s.zebraHighEnabled).toBe(true);
    expect(s.zebraLowEnabled).toBe(false);
  });

  it('SST-DEF-007: channel mode defaults to RGB', () => {
    const s = createDefaultInternalState();
    expect(s.channelModeCode).toBe(CHANNEL_MODE_CODES['rgb']);
  });

  it('SST-DEF-008: LUT3D slots default to disabled with identity domains', () => {
    const s = createDefaultInternalState();
    // Look LUT
    expect(s.lut3DEnabled).toBe(false);
    expect(s.lut3DIntensity).toBe(1.0);
    expect(s.lut3DData).toBeNull();
    expect(s.lookLUT3DDomainMin).toEqual([0, 0, 0]);
    expect(s.lookLUT3DDomainMax).toEqual([1, 1, 1]);
    // File LUT
    expect(s.fileLUT3DEnabled).toBe(false);
    expect(s.fileLUT3DData).toBeNull();
    expect(s.fileLUT3DDomainMin).toEqual([0, 0, 0]);
    expect(s.fileLUT3DDomainMax).toEqual([1, 1, 1]);
    // Display LUT
    expect(s.displayLUT3DEnabled).toBe(false);
    expect(s.displayLUT3DData).toBeNull();
    expect(s.displayLUT3DDomainMin).toEqual([0, 0, 0]);
    expect(s.displayLUT3DDomainMax).toEqual([1, 1, 1]);
  });

  it('SST-DEF-009: display transfer defaults to sRGB', () => {
    const s = createDefaultInternalState();
    expect(s.displayTransferCode).toBe(DISPLAY_TRANSFER_SRGB);
    expect(s.displayGammaOverride).toBe(1.0);
    expect(s.displayBrightnessMultiplier).toBe(1.0);
    expect(s.displayCustomGamma).toBe(2.2);
  });

  it('SST-DEF-010: perspective defaults to identity matrix', () => {
    const s = createDefaultInternalState();
    expect(s.perspectiveEnabled).toBe(false);
    expect(s.perspectiveInvH).toEqual(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  });

  it('SST-DEF-011: channel swizzle defaults to identity', () => {
    const s = createDefaultInternalState();
    expect(s.channelSwizzle).toEqual([0, 1, 2, 3]);
  });

  it('SST-DEF-012: contour defaults', () => {
    const s = createDefaultInternalState();
    expect(s.contourEnabled).toBe(false);
    expect(s.contourLevels).toBe(10);
    expect(s.contourDesaturate).toBe(true);
    expect(s.contourLineColor).toEqual([1.0, 1.0, 1.0]);
  });

  it('SST-DEF-013: color primaries default to identity matrices', () => {
    const s = createDefaultInternalState();
    expect(s.inputPrimariesEnabled).toBe(false);
    expect(s.inputPrimariesMatrix).toEqual(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
    expect(s.outputPrimariesEnabled).toBe(false);
    expect(s.outputPrimariesMatrix).toEqual(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  });

  it('SST-DEF-014: spherical projection defaults', () => {
    const s = createDefaultInternalState();
    expect(s.sphericalEnabled).toBe(false);
    expect(s.sphericalFov).toBe(Math.PI / 2);
    expect(s.sphericalAspect).toBe(1);
    expect(s.sphericalYaw).toBe(0);
    expect(s.sphericalPitch).toBe(0);
  });

  it('SST-DEF-015: dither/quantize defaults', () => {
    const s = createDefaultInternalState();
    expect(s.ditherMode).toBe(0);
    expect(s.quantizeBits).toBe(0);
  });

  it('SST-DEF-016: does not share mutable state between calls', () => {
    const a = createDefaultInternalState();
    const b = createDefaultInternalState();
    a.cdlSlope[0] = 99;
    expect(b.cdlSlope[0]).toBe(1);
    a.bgColor1[0] = 0.5;
    expect(b.bgColor1[0]).toBe(0);
  });
});
