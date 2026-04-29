import { describe, it, expect } from 'vitest';
import { PreCacheLUTStage } from './PreCacheLUTStage';
import type { LUT1D } from '../LUTLoader';
import { IPImage, type ImageMetadata } from '../../core/image/Image';

function createInvertLUT1D(): LUT1D {
  const size = 256;
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    const v = 1 - i / (size - 1);
    data[i * 3] = v;
    data[i * 3 + 1] = v;
    data[i * 3 + 2] = v;
  }
  return { type: '1d', title: 'Invert 1D', size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], data };
}

function createTestImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 128; // R
    data[i * 4 + 1] = 64; // G
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

  // ---------------------------------------------------------------------------
  // applyToIPImage — metadata propagation through the LUT (issue MED-51)
  // ---------------------------------------------------------------------------

  function createTestIPImage(width = 2, height = 2, metadata: ImageMetadata = {}): IPImage {
    const buffer = new ArrayBuffer(width * height * 4);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < width * height; i++) {
      view[i * 4] = 128; // R
      view[i * 4 + 1] = 64; // G
      view[i * 4 + 2] = 192; // B
      view[i * 4 + 3] = 255; // A
    }
    return new IPImage({
      width,
      height,
      channels: 4,
      dataType: 'uint8',
      data: buffer,
      metadata,
    });
  }

  it('PCLT-IPM-001: applyToIPImage preserves colorPrimaries when stage is color-space-preserving', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt2020', transferFunction: 'hlg' });

    const output = stage.applyToIPImage(input);

    expect(output.metadata.colorPrimaries).toBe('bt2020');
    expect(output.metadata.transferFunction).toBe('hlg');
  });

  it('PCLT-IPM-002: applyToIPImage replaces colorPrimaries when stage declares output primaries', () => {
    // Simulate an AP1 -> Rec.709 input transform LUT.
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'ap1_to_rec709.cube');
    stage.setOutputColorPrimaries('bt709');

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt2020', transferFunction: 'hlg' });

    const output = stage.applyToIPImage(input);

    expect(output.metadata.colorPrimaries).toBe('bt709');
    // Transfer function was not declared by the stage -> preserved.
    expect(output.metadata.transferFunction).toBe('hlg');
  });

  it('PCLT-IPM-003: applyToIPImage replaces transferFunction when stage declares output transfer', () => {
    // Simulate a PQ-decoding shaper LUT that outputs into sRGB-encoded space.
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'pq_to_srgb.cube');
    stage.setOutputTransferFunction('srgb');

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt2020', transferFunction: 'pq' });

    const output = stage.applyToIPImage(input);

    expect(output.metadata.transferFunction).toBe('srgb');
    // Color primaries not declared by the stage -> preserved.
    expect(output.metadata.colorPrimaries).toBe('bt2020');
  });

  it('PCLT-IPM-004: applyToIPImage propagates non-color metadata (frame number, source path, attributes)', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const input = createTestIPImage(2, 2, {
      frameNumber: 42,
      sourcePath: '/clips/shot01.exr',
      pixelAspectRatio: 1.5,
      colorPrimaries: 'bt709',
      transferFunction: 'srgb',
      attributes: { exposure: 2.5, lensName: 'Cooke S5/i' },
    });

    const output = stage.applyToIPImage(input);

    expect(output.metadata.frameNumber).toBe(42);
    expect(output.metadata.sourcePath).toBe('/clips/shot01.exr');
    expect(output.metadata.pixelAspectRatio).toBe(1.5);
    expect(output.metadata.attributes).toEqual({ exposure: 2.5, lensName: 'Cooke S5/i' });
  });

  it('PCLT-IPM-005: applyToIPImage handles missing metadata (input has none)', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const input = createTestIPImage(2, 2);

    const output = stage.applyToIPImage(input);

    expect(output.metadata).toBeDefined();
    expect(output.metadata.colorPrimaries).toBeUndefined();
    expect(output.metadata.transferFunction).toBeUndefined();
  });

  it('PCLT-IPM-006: applyToIPImage adds output color space when input has no metadata', () => {
    // OCIO baked LUT writing into a known display space.
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'aces_to_rec709_srgb.cube');
    stage.setOutputColorPrimaries('bt709');
    stage.setOutputTransferFunction('srgb');

    const input = createTestIPImage(2, 2);

    const output = stage.applyToIPImage(input);

    expect(output.metadata.colorPrimaries).toBe('bt709');
    expect(output.metadata.transferFunction).toBe('srgb');
  });

  it('PCLT-IPM-007: applyToIPImage returns input unchanged when no LUT loaded (identity bypass)', () => {
    const stage = new PreCacheLUTStage();

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt709', transferFunction: 'srgb' });

    const output = stage.applyToIPImage(input);

    // Bypass: same instance is returned (no reason to clone).
    expect(output).toBe(input);
    expect(output.metadata.colorPrimaries).toBe('bt709');
    expect(output.metadata.transferFunction).toBe('srgb');
  });

  it('PCLT-IPM-008: applyToIPImage returns input unchanged when stage disabled', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setOutputColorPrimaries('bt709');
    stage.setEnabled(false);

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt2020', transferFunction: 'hlg' });

    const output = stage.applyToIPImage(input);

    // Stage bypassed -> output color space not applied, metadata flows through.
    expect(output).toBe(input);
    expect(output.metadata.colorPrimaries).toBe('bt2020');
    expect(output.metadata.transferFunction).toBe('hlg');
  });

  it('PCLT-IPM-009: applyToIPImage returns independent metadata object (no shared references)', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const inputAttrs = { exposure: 1.0 };
    const input = createTestIPImage(2, 2, {
      colorPrimaries: 'bt709',
      attributes: inputAttrs,
    });

    const output = stage.applyToIPImage(input);

    // Mutating output's metadata must not bleed into input.
    expect(output.metadata).not.toBe(input.metadata);
    expect(output.metadata.attributes).not.toBe(inputAttrs);

    (output.metadata.attributes as Record<string, unknown>)['exposure'] = 99;
    expect(inputAttrs.exposure).toBe(1.0);
  });

  it('PCLT-IPM-010: applyToIPImage actually transforms pixel data (not just metadata)', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt709' });

    const output = stage.applyToIPImage(input);

    const inputArr = input.getTypedArray();
    const outputArr = output.getTypedArray();
    // R was 128, inverted ~127 — different from input but close to 127.
    expect(outputArr[0]).not.toBe(inputArr[0]);
  });

  it('PCLT-IPM-011: composeOutputMetadata is pure (does not mutate input metadata)', () => {
    const stage = new PreCacheLUTStage();
    stage.setOutputColorPrimaries('bt709');
    stage.setOutputTransferFunction('srgb');

    const input: ImageMetadata = {
      colorPrimaries: 'bt2020',
      transferFunction: 'hlg',
      frameNumber: 1,
    };
    const snapshot = JSON.parse(JSON.stringify(input));

    const output = stage.composeOutputMetadata(input);

    expect(input).toEqual(snapshot);
    expect(output.colorPrimaries).toBe('bt709');
    expect(output.transferFunction).toBe('srgb');
    expect(output.frameNumber).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Bit-depth and dataType guards (issue MED-51 — Round 2 fix B3)
  // ---------------------------------------------------------------------------

  it('PCLT-IPM-012: applyToIPImage throws on float32 input (HDR/EXR not supported)', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setOutputTransferFunction('srgb');

    const input = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'float32',
      metadata: { colorPrimaries: 'bt2020', transferFunction: 'pq' },
    });

    expect(() => stage.applyToIPImage(input)).toThrow(/uint8 IPImage inputs/);
  });

  it('PCLT-IPM-013: applyToIPImage throws on uint16 input', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const input = new IPImage({
      width: 2,
      height: 2,
      channels: 4,
      dataType: 'uint16',
    });

    expect(() => stage.applyToIPImage(input)).toThrow(/uint8 IPImage inputs/);
  });

  it('PCLT-IPM-014: applyToIPImage throws when stage bitDepth is incompatible (16bit)', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setBitDepth('16bit');

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt709' });

    expect(() => stage.applyToIPImage(input)).toThrow(/bitDepth='16bit'.*incompatible/);
  });

  it('PCLT-IPM-015: applyToIPImage throws when stage bitDepth is incompatible (float)', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setBitDepth('float');

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt709' });

    expect(() => stage.applyToIPImage(input)).toThrow(/bitDepth='float'.*incompatible/);
  });

  it('PCLT-IPM-016: applyToIPImage works when stage bitDepth is "8bit" or "auto"', () => {
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt709' });

    stage.setBitDepth('auto');
    expect(() => stage.applyToIPImage(input)).not.toThrow();

    stage.setBitDepth('8bit');
    expect(() => stage.applyToIPImage(input)).not.toThrow();
  });

  it('PCLT-IPM-017: applyToIPImage zero-intensity bypass returns input by reference even with output declared', () => {
    // Regression test: zero-intensity must bypass even when stage declares
    // output color space (the stage has no effect on pixels, so it has no
    // effect on metadata).
    const stage = new PreCacheLUTStage();
    stage.setLUT(createInvertLUT1D(), 'invert.cube');
    stage.setOutputColorPrimaries('bt709');
    stage.setOutputTransferFunction('srgb');
    stage.setIntensity(0);

    const input = createTestIPImage(2, 2, { colorPrimaries: 'bt2020', transferFunction: 'hlg' });

    const output = stage.applyToIPImage(input);

    expect(output).toBe(input);
    expect(output.metadata.colorPrimaries).toBe('bt2020');
    expect(output.metadata.transferFunction).toBe('hlg');
  });
});
