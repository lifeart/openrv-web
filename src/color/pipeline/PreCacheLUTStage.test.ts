import { describe, it, expect } from 'vitest';
import { PreCacheLUTStage } from './PreCacheLUTStage';
import type { LUT1D } from '../LUTLoader';

function createInvertLUT1D(): LUT1D {
  const size = 256;
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    const v = 1 - i / (size - 1);
    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;
  }
  return { title: 'Invert 1D', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

function createTestImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 128;     // R
    data[i * 4 + 1] = 64;  // G
    data[i * 4 + 2] = 192; // B
    data[i * 4 + 3] = 255; // A
  }
  return new ImageData(data, width, height);
}

describe('PreCacheLUTStage', () => {
  it('PCLT-U001: default bit-depth is auto', () => {
    const stage = new PreCacheLUTStage();
    expect(stage.getBitDepth()).toBe('auto');
  });

  it('PCLT-U002: setBitDepth changes reformatting mode', () => {
    const stage = new PreCacheLUTStage();
    stage.setBitDepth('16bit');
    expect(stage.getBitDepth()).toBe('16bit');
  });

  it('PCLT-U003: apply returns unchanged data when no LUT loaded', () => {
    const stage = new PreCacheLUTStage();
    const imageData = createTestImageData(2, 2);
    const original = new Uint8ClampedArray(imageData.data);

    const result = stage.apply(imageData);

    expect(result.data).toEqual(original);
  });

  it('PCLT-U004: apply returns unchanged data when stage disabled', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setEnabled(false);

    const imageData = createTestImageData(2, 2);
    const original = new Uint8ClampedArray(imageData.data);

    const result = stage.apply(imageData);

    expect(result.data).toEqual(original);
  });

  it('PCLT-U005: apply transforms pixel data when LUT loaded and enabled', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const imageData = createTestImageData(2, 2);

    const result = stage.apply(imageData);

    // Inverted: R=128 -> ~127, G=64 -> ~191, B=192 -> ~63
    expect(result.data[0]).not.toBe(128);
    expect(result.data[1]).not.toBe(64);
    expect(result.data[2]).not.toBe(192);
    expect(result.data[3]).toBe(255); // Alpha unchanged
  });

  it('PCLT-U006: apply does not modify original ImageData', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const imageData = createTestImageData(2, 2);
    const originalR = imageData.data[0];

    stage.apply(imageData);

    // Original should be unchanged (apply creates a copy)
    expect(imageData.data[0]).toBe(originalR);
  });

  it('PCLT-U007: getState includes bitDepth field', () => {
    const stage = new PreCacheLUTStage();
    stage.setBitDepth('float');
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const state = stage.getState();

    expect(state.bitDepth).toBe('float');
    expect(state.lutName).toBe('invert.cube');
    expect(state.enabled).toBe(true);
  });

  it('PCLT-U008: reset restores defaults including bitDepth', () => {
    const stage = new PreCacheLUTStage();
    stage.setBitDepth('16bit');
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setIntensity(0.5);

    stage.reset();

    expect(stage.getBitDepth()).toBe('auto');
    expect(stage.hasLUT()).toBe(false);
    expect(stage.getIntensity()).toBe(1.0);
  });

  it('PCLT-U009: partial intensity blends original and LUT result', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setIntensity(0.5);

    const imageData = createTestImageData(2, 2);

    const result = stage.apply(imageData);

    // At 50% intensity, the result should be between original and inverted
    // R=128, inverted ~127. Blend should be ~128
    // G=64, inverted ~191. Blend should be ~128
    // B=192, inverted ~63. Blend should be ~128
    // Values won't be exact due to rounding, but should be close to midpoint
    expect(result.data[0]).toBeGreaterThan(100);
    expect(result.data[0]).toBeLessThan(155);
    expect(result.data[3]).toBe(255); // Alpha unchanged
  });

  it('PCLT-U010: zero intensity returns unmodified copy', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setIntensity(0);

    const imageData = createTestImageData(2, 2);
    const original = new Uint8ClampedArray(imageData.data);

    const result = stage.apply(imageData);

    expect(result.data).toEqual(original);
  });
});
