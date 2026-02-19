/**
 * ViewerEffects Tone Mapping Parameter Passthrough Tests
 */

import { describe, it, expect } from 'vitest';
import { applyToneMappingWithParams } from './ViewerEffects';
import type { ToneMappingState } from '../../core/types/effects';

function createTestImageData(w: number, h: number, fill: { r: number; g: number; b: number }): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill.r;
    data[i + 1] = fill.g;
    data[i + 2] = fill.b;
    data[i + 3] = 255;
  }
  return new ImageData(data, w, h);
}

describe('applyToneMappingWithParams', () => {
  it('VE-TMP-001: passes Reinhard white point parameter', () => {
    const img1 = createTestImageData(4, 4, { r: 200, g: 200, b: 200 });
    const img2 = createTestImageData(4, 4, { r: 200, g: 200, b: 200 });

    const state1: ToneMappingState = {
      enabled: true,
      operator: 'reinhard',
      reinhardWhitePoint: 4.0,
    };
    const state2: ToneMappingState = {
      enabled: true,
      operator: 'reinhard',
      reinhardWhitePoint: 1.0,
    };

    applyToneMappingWithParams(img1, state1);
    applyToneMappingWithParams(img2, state2);

    // Different white points should produce different results
    let hasDiff = false;
    for (let i = 0; i < img1.data.length; i += 4) {
      if (img1.data[i] !== img2.data[i]) { hasDiff = true; break; }
    }
    expect(hasDiff).toBe(true);
  });

  it('VE-TMP-002: passes Filmic exposure bias parameter', () => {
    const img1 = createTestImageData(4, 4, { r: 150, g: 150, b: 150 });
    const img2 = createTestImageData(4, 4, { r: 150, g: 150, b: 150 });

    const state1: ToneMappingState = {
      enabled: true,
      operator: 'filmic',
      filmicExposureBias: 2.0,
      filmicWhitePoint: 11.2,
    };
    const state2: ToneMappingState = {
      enabled: true,
      operator: 'filmic',
      filmicExposureBias: 5.0,
      filmicWhitePoint: 11.2,
    };

    applyToneMappingWithParams(img1, state1);
    applyToneMappingWithParams(img2, state2);

    let hasDiff = false;
    for (let i = 0; i < img1.data.length; i += 4) {
      if (img1.data[i] !== img2.data[i]) { hasDiff = true; break; }
    }
    expect(hasDiff).toBe(true);
  });

  it('VE-TMP-003: passes Drago params (bias + brightness)', () => {
    const img1 = createTestImageData(4, 4, { r: 180, g: 180, b: 180 });
    const img2 = createTestImageData(4, 4, { r: 180, g: 180, b: 180 });

    const state1: ToneMappingState = {
      enabled: true,
      operator: 'drago',
      dragoBias: 0.85,
      dragoLwa: 0.2,
      dragoLmax: 1.5,
      dragoBrightness: 2.0,
    };
    const state2: ToneMappingState = {
      enabled: true,
      operator: 'drago',
      dragoBias: 0.5,
      dragoLwa: 0.2,
      dragoLmax: 1.5,
      dragoBrightness: 4.0,
    };

    applyToneMappingWithParams(img1, state1);
    applyToneMappingWithParams(img2, state2);

    let hasDiff = false;
    for (let i = 0; i < img1.data.length; i += 4) {
      if (img1.data[i] !== img2.data[i]) { hasDiff = true; break; }
    }
    expect(hasDiff).toBe(true);
  });

  it('VE-TMP-004: disabled state is a no-op', () => {
    const img = createTestImageData(4, 4, { r: 128, g: 128, b: 128 });
    const original = new Uint8ClampedArray(img.data);

    const state: ToneMappingState = {
      enabled: false,
      operator: 'reinhard',
    };

    applyToneMappingWithParams(img, state);

    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(original[i]);
    }
  });

  it('VE-TMP-005: operator=off is a no-op even when enabled', () => {
    const img = createTestImageData(4, 4, { r: 128, g: 128, b: 128 });
    const original = new Uint8ClampedArray(img.data);

    const state: ToneMappingState = {
      enabled: true,
      operator: 'off',
    };

    applyToneMappingWithParams(img, state);

    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(original[i]);
    }
  });
});
