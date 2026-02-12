import { describe, it, expect } from 'vitest';

// Import from centralized config barrel
import {
  // TimingConfig
  EFFECTS_DEBOUNCE_MS,
  STARVATION_TIMEOUT_MS,
  // PlaybackConfig
  PLAYBACK_SPEED_PRESETS,
  MAX_CONSECUTIVE_STARVATION_SKIPS,
  MAX_REVERSE_SPEED,
  // RenderConfig
  LUMA_R,
  LUMA_G,
  LUMA_B,
  LUMINANCE_COEFFICIENTS,
  HIGHLIGHT_SHADOW_RANGE,
  WHITES_BLACKS_RANGE,
  CLARITY_EFFECT_SCALE,
  SKIN_TONE_HUE_CENTER,
  SKIN_TONE_HUE_RANGE,
  SKIN_PROTECTION_MIN,
  COLOR_WHEEL_MASTER_FACTOR,
  COLOR_WHEEL_LIFT_FACTOR,
  COLOR_WHEEL_GAMMA_FACTOR,
  COLOR_WHEEL_GAIN_FACTOR,
  HALF_RES_MIN_DIMENSION,
  // UIConfig
  MIN_CROP_FRACTION,
  MAX_UNCROP_PADDING,
  RV_PEN_WIDTH_SCALE,
  RV_TEXT_SIZE_SCALE,
  // ImageLimits
  IMAGE_LIMITS,
} from './index';

// Import from original locations to verify backward-compatible re-exports
import { EFFECTS_DEBOUNCE_MS as EFFECTS_DEBOUNCE_MS_ORIG } from '../ui/components/ViewerPrerender';
import {
  MAX_CONSECUTIVE_STARVATION_SKIPS as MAX_STARVATION_ORIG,
  STARVATION_TIMEOUT_MS as STARVATION_TIMEOUT_ORIG,
  MAX_REVERSE_SPEED as MAX_REVERSE_ORIG,
} from '../core/session/PlaybackTimingController';
import { PLAYBACK_SPEED_PRESETS as PRESETS_ORIG } from '../core/session/Session';
import { LUMINANCE_COEFFICIENTS as LUMA_COEFFS_ORIG } from '../ui/components/ChannelSelect';
import {
  MIN_CROP_FRACTION as MIN_CROP_ORIG,
  MAX_UNCROP_PADDING as MAX_UNCROP_ORIG,
} from '../ui/components/CropControl';
import {
  RV_PEN_WIDTH_SCALE as PEN_ORIG,
  RV_TEXT_SIZE_SCALE as TEXT_ORIG,
} from '../paint/types';
import {
  LUMA_R as LUMA_R_ORIG,
  LUMA_G as LUMA_G_ORIG,
  LUMA_B as LUMA_B_ORIG,
  HIGHLIGHT_SHADOW_RANGE as HS_RANGE_ORIG,
  WHITES_BLACKS_RANGE as WB_RANGE_ORIG,
  CLARITY_EFFECT_SCALE as CLARITY_ORIG,
  SKIN_TONE_HUE_CENTER as SKIN_CENTER_ORIG,
  SKIN_TONE_HUE_RANGE as SKIN_RANGE_ORIG,
  SKIN_PROTECTION_MIN as SKIN_MIN_ORIG,
  COLOR_WHEEL_MASTER_FACTOR as CW_MASTER_ORIG,
  COLOR_WHEEL_LIFT_FACTOR as CW_LIFT_ORIG,
  COLOR_WHEEL_GAMMA_FACTOR as CW_GAMMA_ORIG,
  COLOR_WHEEL_GAIN_FACTOR as CW_GAIN_ORIG,
  HALF_RES_MIN_DIMENSION as HALF_RES_ORIG,
} from '../utils/effects/effectProcessing.shared';

// ============================================================================
// TimingConfig
// ============================================================================

describe('TimingConfig', () => {
  it('EFFECTS_DEBOUNCE_MS is a positive number', () => {
    expect(typeof EFFECTS_DEBOUNCE_MS).toBe('number');
    expect(EFFECTS_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(EFFECTS_DEBOUNCE_MS).toBe(50);
  });

  it('STARVATION_TIMEOUT_MS is a positive number', () => {
    expect(typeof STARVATION_TIMEOUT_MS).toBe('number');
    expect(STARVATION_TIMEOUT_MS).toBeGreaterThan(0);
    expect(STARVATION_TIMEOUT_MS).toBe(5000);
  });

  it('re-exports match original locations', () => {
    expect(EFFECTS_DEBOUNCE_MS).toBe(EFFECTS_DEBOUNCE_MS_ORIG);
    expect(STARVATION_TIMEOUT_MS).toBe(STARVATION_TIMEOUT_ORIG);
  });
});

// ============================================================================
// PlaybackConfig
// ============================================================================

describe('PlaybackConfig', () => {
  it('PLAYBACK_SPEED_PRESETS is a sorted ascending array of positive numbers', () => {
    expect(Array.isArray(PLAYBACK_SPEED_PRESETS)).toBe(true);
    expect(PLAYBACK_SPEED_PRESETS.length).toBeGreaterThan(0);
    for (let i = 0; i < PLAYBACK_SPEED_PRESETS.length; i++) {
      expect(typeof PLAYBACK_SPEED_PRESETS[i]).toBe('number');
      expect(PLAYBACK_SPEED_PRESETS[i]).toBeGreaterThan(0);
      if (i > 0) {
        expect(PLAYBACK_SPEED_PRESETS[i]).toBeGreaterThan(PLAYBACK_SPEED_PRESETS[i - 1]!);
      }
    }
  });

  it('PLAYBACK_SPEED_PRESETS includes 1x speed', () => {
    expect(PLAYBACK_SPEED_PRESETS).toContain(1);
  });

  it('MAX_CONSECUTIVE_STARVATION_SKIPS is a positive integer', () => {
    expect(typeof MAX_CONSECUTIVE_STARVATION_SKIPS).toBe('number');
    expect(MAX_CONSECUTIVE_STARVATION_SKIPS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_CONSECUTIVE_STARVATION_SKIPS)).toBe(true);
    expect(MAX_CONSECUTIVE_STARVATION_SKIPS).toBe(2);
  });

  it('MAX_REVERSE_SPEED is a positive number', () => {
    expect(typeof MAX_REVERSE_SPEED).toBe('number');
    expect(MAX_REVERSE_SPEED).toBeGreaterThan(0);
    expect(MAX_REVERSE_SPEED).toBe(4);
  });

  it('re-exports match original locations', () => {
    expect(PLAYBACK_SPEED_PRESETS).toBe(PRESETS_ORIG);
    expect(MAX_CONSECUTIVE_STARVATION_SKIPS).toBe(MAX_STARVATION_ORIG);
    expect(MAX_REVERSE_SPEED).toBe(MAX_REVERSE_ORIG);
  });
});

// ============================================================================
// RenderConfig
// ============================================================================

describe('RenderConfig', () => {
  it('Rec. 709 luma coefficients sum to approximately 1', () => {
    expect(typeof LUMA_R).toBe('number');
    expect(typeof LUMA_G).toBe('number');
    expect(typeof LUMA_B).toBe('number');
    expect(LUMA_R + LUMA_G + LUMA_B).toBeCloseTo(1, 10);
  });

  it('LUMINANCE_COEFFICIENTS matches individual luma values', () => {
    expect(LUMINANCE_COEFFICIENTS.r).toBe(LUMA_R);
    expect(LUMINANCE_COEFFICIENTS.g).toBe(LUMA_G);
    expect(LUMINANCE_COEFFICIENTS.b).toBe(LUMA_B);
  });

  it('HIGHLIGHT_SHADOW_RANGE is a positive integer within byte range', () => {
    expect(typeof HIGHLIGHT_SHADOW_RANGE).toBe('number');
    expect(HIGHLIGHT_SHADOW_RANGE).toBeGreaterThan(0);
    expect(HIGHLIGHT_SHADOW_RANGE).toBeLessThanOrEqual(255);
    expect(HIGHLIGHT_SHADOW_RANGE).toBe(128);
  });

  it('WHITES_BLACKS_RANGE is a positive integer within byte range', () => {
    expect(typeof WHITES_BLACKS_RANGE).toBe('number');
    expect(WHITES_BLACKS_RANGE).toBeGreaterThan(0);
    expect(WHITES_BLACKS_RANGE).toBeLessThanOrEqual(255);
    expect(WHITES_BLACKS_RANGE).toBe(55);
  });

  it('CLARITY_EFFECT_SCALE is between 0 and 1', () => {
    expect(typeof CLARITY_EFFECT_SCALE).toBe('number');
    expect(CLARITY_EFFECT_SCALE).toBeGreaterThan(0);
    expect(CLARITY_EFFECT_SCALE).toBeLessThanOrEqual(1);
    expect(CLARITY_EFFECT_SCALE).toBe(0.7);
  });

  it('skin tone constants have reasonable values', () => {
    expect(typeof SKIN_TONE_HUE_CENTER).toBe('number');
    expect(SKIN_TONE_HUE_CENTER).toBeGreaterThanOrEqual(0);
    expect(SKIN_TONE_HUE_CENTER).toBeLessThan(360);
    expect(SKIN_TONE_HUE_CENTER).toBe(35);

    expect(typeof SKIN_TONE_HUE_RANGE).toBe('number');
    expect(SKIN_TONE_HUE_RANGE).toBeGreaterThan(0);
    expect(SKIN_TONE_HUE_RANGE).toBe(15);

    expect(typeof SKIN_PROTECTION_MIN).toBe('number');
    expect(SKIN_PROTECTION_MIN).toBeGreaterThanOrEqual(0);
    expect(SKIN_PROTECTION_MIN).toBeLessThanOrEqual(1);
    expect(SKIN_PROTECTION_MIN).toBe(0.3);
  });

  it('color wheel factors are between 0 and 1', () => {
    const factors = [
      COLOR_WHEEL_MASTER_FACTOR,
      COLOR_WHEEL_LIFT_FACTOR,
      COLOR_WHEEL_GAMMA_FACTOR,
      COLOR_WHEEL_GAIN_FACTOR,
    ];
    for (const f of factors) {
      expect(typeof f).toBe('number');
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(COLOR_WHEEL_MASTER_FACTOR).toBe(0.5);
    expect(COLOR_WHEEL_LIFT_FACTOR).toBe(0.3);
    expect(COLOR_WHEEL_GAMMA_FACTOR).toBe(0.5);
    expect(COLOR_WHEEL_GAIN_FACTOR).toBe(0.5);
  });

  it('HALF_RES_MIN_DIMENSION is a positive integer', () => {
    expect(typeof HALF_RES_MIN_DIMENSION).toBe('number');
    expect(HALF_RES_MIN_DIMENSION).toBeGreaterThan(0);
    expect(Number.isInteger(HALF_RES_MIN_DIMENSION)).toBe(true);
    expect(HALF_RES_MIN_DIMENSION).toBe(256);
  });

  it('re-exports match original locations', () => {
    expect(LUMA_R).toBe(LUMA_R_ORIG);
    expect(LUMA_G).toBe(LUMA_G_ORIG);
    expect(LUMA_B).toBe(LUMA_B_ORIG);
    expect(LUMINANCE_COEFFICIENTS).toBe(LUMA_COEFFS_ORIG);
    expect(HIGHLIGHT_SHADOW_RANGE).toBe(HS_RANGE_ORIG);
    expect(WHITES_BLACKS_RANGE).toBe(WB_RANGE_ORIG);
    expect(CLARITY_EFFECT_SCALE).toBe(CLARITY_ORIG);
    expect(SKIN_TONE_HUE_CENTER).toBe(SKIN_CENTER_ORIG);
    expect(SKIN_TONE_HUE_RANGE).toBe(SKIN_RANGE_ORIG);
    expect(SKIN_PROTECTION_MIN).toBe(SKIN_MIN_ORIG);
    expect(COLOR_WHEEL_MASTER_FACTOR).toBe(CW_MASTER_ORIG);
    expect(COLOR_WHEEL_LIFT_FACTOR).toBe(CW_LIFT_ORIG);
    expect(COLOR_WHEEL_GAMMA_FACTOR).toBe(CW_GAMMA_ORIG);
    expect(COLOR_WHEEL_GAIN_FACTOR).toBe(CW_GAIN_ORIG);
    expect(HALF_RES_MIN_DIMENSION).toBe(HALF_RES_ORIG);
  });
});

// ============================================================================
// UIConfig
// ============================================================================

describe('UIConfig', () => {
  it('MIN_CROP_FRACTION is between 0 and 1', () => {
    expect(typeof MIN_CROP_FRACTION).toBe('number');
    expect(MIN_CROP_FRACTION).toBeGreaterThan(0);
    expect(MIN_CROP_FRACTION).toBeLessThan(1);
    expect(MIN_CROP_FRACTION).toBe(0.05);
  });

  it('MAX_UNCROP_PADDING is a positive integer', () => {
    expect(typeof MAX_UNCROP_PADDING).toBe('number');
    expect(MAX_UNCROP_PADDING).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_UNCROP_PADDING)).toBe(true);
    expect(MAX_UNCROP_PADDING).toBe(2000);
  });

  it('RV_PEN_WIDTH_SCALE is a positive number', () => {
    expect(typeof RV_PEN_WIDTH_SCALE).toBe('number');
    expect(RV_PEN_WIDTH_SCALE).toBeGreaterThan(0);
    expect(RV_PEN_WIDTH_SCALE).toBe(500);
  });

  it('RV_TEXT_SIZE_SCALE is a positive number', () => {
    expect(typeof RV_TEXT_SIZE_SCALE).toBe('number');
    expect(RV_TEXT_SIZE_SCALE).toBeGreaterThan(0);
    expect(RV_TEXT_SIZE_SCALE).toBe(2000);
  });

  it('re-exports match original locations', () => {
    expect(MIN_CROP_FRACTION).toBe(MIN_CROP_ORIG);
    expect(MAX_UNCROP_PADDING).toBe(MAX_UNCROP_ORIG);
    expect(RV_PEN_WIDTH_SCALE).toBe(PEN_ORIG);
    expect(RV_TEXT_SIZE_SCALE).toBe(TEXT_ORIG);
  });
});

// ============================================================================
// ImageLimits (pre-existing, included in barrel)
// ============================================================================

describe('ImageLimits (barrel export)', () => {
  it('IMAGE_LIMITS has expected shape', () => {
    expect(typeof IMAGE_LIMITS.MAX_DIMENSION).toBe('number');
    expect(typeof IMAGE_LIMITS.MAX_PIXELS).toBe('number');
    expect(IMAGE_LIMITS.MAX_DIMENSION).toBeGreaterThan(0);
    expect(IMAGE_LIMITS.MAX_PIXELS).toBeGreaterThan(0);
  });
});
