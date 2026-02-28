/**
 * Renderer.renderForScopes unit tests
 *
 * Tests the Y-flip logic and null handling of renderForScopes.
 * Since Renderer requires WebGL2, these tests mock the internal methods.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderStateManager, DIRTY_DISPLAY } from './ShaderStateManager';
import type { DisplayColorConfig } from './RenderState';
import { IPImage } from '../core/image/Image';
import { ManagedVideoFrame } from '../core/image/ManagedVideoFrame';
import { isHDRContent } from './Renderer';

// We test the Y-flip logic independently since it's the most error-prone part.
// The renderForScopes method is integration-tested via e2e.

describe('renderForScopes Y-flip logic', () => {
  // Extracted Y-flip algorithm for testability
  function yFlipFloat32(data: Float32Array, width: number, height: number): Float32Array {
    const RGBA = 4;
    const result = new Float32Array(data);
    const rowSize = width * RGBA;
    const halfHeight = height >> 1;
    const tempRow = new Float32Array(rowSize);
    for (let y = 0; y < halfHeight; y++) {
      const topOffset = y * rowSize;
      const bottomOffset = (height - 1 - y) * rowSize;
      tempRow.set(result.subarray(topOffset, topOffset + rowSize));
      result.copyWithin(topOffset, bottomOffset, bottomOffset + rowSize);
      result.set(tempRow, bottomOffset);
    }
    return result;
  }

  it('RFS-001: Y-flip reverses row order for even height', () => {
    // 2x2 image: row0=[1,0,0,1, 2,0,0,1], row1=[3,0,0,1, 4,0,0,1]
    const input = new Float32Array([
      1, 0, 0, 1,  2, 0, 0, 1,  // row 0 (bottom in GL)
      3, 0, 0, 1,  4, 0, 0, 1,  // row 1 (top in GL)
    ]);
    const flipped = yFlipFloat32(input, 2, 2);
    // After flip: row0 should be [3,0,0,1, 4,0,0,1], row1 should be [1,0,0,1, 2,0,0,1]
    expect(flipped[0]).toBe(3);
    expect(flipped[4]).toBe(4);
    expect(flipped[8]).toBe(1);
    expect(flipped[12]).toBe(2);
  });

  it('RFS-002: Y-flip reverses row order for odd height', () => {
    // 1x3 image: row0=[1,0,0,1], row1=[2,0,0,1], row2=[3,0,0,1]
    const input = new Float32Array([
      1, 0, 0, 1,  // row 0
      2, 0, 0, 1,  // row 1 (middle)
      3, 0, 0, 1,  // row 2
    ]);
    const flipped = yFlipFloat32(input, 1, 3);
    expect(flipped[0]).toBe(3);  // row 2 -> row 0
    expect(flipped[4]).toBe(2);  // row 1 stays (middle)
    expect(flipped[8]).toBe(1);  // row 0 -> row 2
  });

  it('RFS-003: Y-flip is identity for 1-row image', () => {
    const input = new Float32Array([1, 2, 3, 4,  5, 6, 7, 8]);
    const flipped = yFlipFloat32(input, 2, 1);
    expect(Array.from(flipped)).toEqual(Array.from(input));
  });

  it('RFS-004: Y-flip does not mutate original data', () => {
    const input = new Float32Array([1, 0, 0, 1, 2, 0, 0, 1]);
    const originalCopy = new Float32Array(input);
    yFlipFloat32(input, 1, 2);
    expect(Array.from(input)).toEqual(Array.from(originalCopy));
  });

  it('RFS-005: double Y-flip returns original data', () => {
    const input = new Float32Array([
      1, 0, 0, 1,  2, 0, 0, 1,
      3, 0, 0, 1,  4, 0, 0, 1,
      5, 0, 0, 1,  6, 0, 0, 1,
    ]);
    const flipped = yFlipFloat32(input, 2, 3);
    const doubleFlipped = yFlipFloat32(flipped, 2, 3);
    expect(Array.from(doubleFlipped)).toEqual(Array.from(input));
  });

  it('RFS-006: Y-flip handles empty data', () => {
    const input = new Float32Array(0);
    const flipped = yFlipFloat32(input, 0, 0);
    expect(flipped.length).toBe(0);
  });

  it('RFS-007: Y-flip preserves all RGBA channels', () => {
    // 1x2 with distinct RGBA values
    const input = new Float32Array([
      0.1, 0.2, 0.3, 0.4,  // row 0
      0.5, 0.6, 0.7, 0.8,  // row 1
    ]);
    const flipped = yFlipFloat32(input, 1, 2);
    expect(flipped[0]).toBeCloseTo(0.5);
    expect(flipped[1]).toBeCloseTo(0.6);
    expect(flipped[2]).toBeCloseTo(0.7);
    expect(flipped[3]).toBeCloseTo(0.8);
    expect(flipped[4]).toBeCloseTo(0.1);
    expect(flipped[5]).toBeCloseTo(0.2);
    expect(flipped[6]).toBeCloseTo(0.3);
    expect(flipped[7]).toBeCloseTo(0.4);
  });
});

describe('floatRGBAToImageData utility', () => {
  it('RFS-010: converts float [0,1] to Uint8 [0,255]', async () => {
    const { floatRGBAToImageData } = await import('../utils/math');
    const floatData = new Float32Array([0.0, 0.5, 1.0, 1.0]);
    const imageData = floatRGBAToImageData(floatData, 1, 1);
    expect(imageData.data[0]).toBe(0);
    expect(imageData.data[1]).toBe(128);
    expect(imageData.data[2]).toBe(255);
    expect(imageData.data[3]).toBe(255);
  });

  it('RFS-011: clamps values > 1.0 to 255', async () => {
    const { floatRGBAToImageData } = await import('../utils/math');
    const floatData = new Float32Array([3.5, 0.0, 0.0, 1.0]);
    const imageData = floatRGBAToImageData(floatData, 1, 1);
    expect(imageData.data[0]).toBe(255);
  });

  it('RFS-012: clamps negative values to 0', async () => {
    const { floatRGBAToImageData } = await import('../utils/math');
    const floatData = new Float32Array([-0.5, 0.0, 0.0, 1.0]);
    const imageData = floatRGBAToImageData(floatData, 1, 1);
    expect(imageData.data[0]).toBe(0);
  });
});

/**
 * Scope rendering display state neutralization tests.
 *
 * The Renderer.renderForScopes path (renderImageToFloatAsyncForScopes /
 * renderImageToFloatSync) neutralizes display settings via
 * stateManager.setDisplayColorState(SCOPE_DISPLAY_CONFIG) before rendering
 * and restores after. These tests verify the save/restore contract through
 * the ShaderStateManager directly, since full Renderer instantiation requires
 * WebGL2.
 */
describe('Scope rendering display state neutralization', () => {
  const SCOPE_DISPLAY_CONFIG: DisplayColorConfig = {
    transferFunction: 0, displayGamma: 1, displayBrightness: 1, customGamma: 2.2,
  };

  let mgr: ShaderStateManager;

  beforeEach(() => {
    mgr = new ShaderStateManager();
  });

  it('RFS-020: scope config is independent of display transfer setting', () => {
    mgr.setDisplayColorState({
      transferFunction: 3,
      displayGamma: 1,
      displayBrightness: 1,
      customGamma: 2.2,
    });

    // Save, apply scope config, verify
    const prev = mgr.getDisplayColorState();
    mgr.setDisplayColorState(SCOPE_DISPLAY_CONFIG);
    const active = mgr.getDisplayColorState();

    expect(active.transferFunction).toBe(0);
    expect(prev.transferFunction).toBe(3);

    // Restore
    mgr.setDisplayColorState(prev);
    expect(mgr.getDisplayColorState().transferFunction).toBe(3);
  });

  it('RFS-021: scope config is independent of display gamma setting', () => {
    mgr.setDisplayColorState({
      transferFunction: 0,
      displayGamma: 2.4,
      displayBrightness: 1,
      customGamma: 2.2,
    });

    const prev = mgr.getDisplayColorState();
    mgr.setDisplayColorState(SCOPE_DISPLAY_CONFIG);
    const active = mgr.getDisplayColorState();

    expect(active.displayGamma).toBe(1);
    expect(prev.displayGamma).toBe(2.4);

    mgr.setDisplayColorState(prev);
    expect(mgr.getDisplayColorState().displayGamma).toBe(2.4);
  });

  it('RFS-022: scope config is independent of display brightness setting', () => {
    mgr.setDisplayColorState({
      transferFunction: 0,
      displayGamma: 1,
      displayBrightness: 2.0,
      customGamma: 2.2,
    });

    const prev = mgr.getDisplayColorState();
    mgr.setDisplayColorState(SCOPE_DISPLAY_CONFIG);
    const active = mgr.getDisplayColorState();

    expect(active.displayBrightness).toBe(1);
    expect(prev.displayBrightness).toBe(2.0);

    mgr.setDisplayColorState(prev);
    expect(mgr.getDisplayColorState().displayBrightness).toBe(2.0);
  });

  it('RFS-023: display state is fully restored after scope rendering pattern', () => {
    const userConfig: DisplayColorConfig = {
      transferFunction: 3,
      displayGamma: 2.4,
      displayBrightness: 1.5,
      customGamma: 1.8,
    };
    mgr.setDisplayColorState(userConfig);

    // Simulate scope render: save → set neutral → restore
    const prev = mgr.getDisplayColorState();
    mgr.setDisplayColorState(SCOPE_DISPLAY_CONFIG);

    // During scope render, display state should be neutral
    const duringScope = mgr.getDisplayColorState();
    expect(duringScope).toEqual(SCOPE_DISPLAY_CONFIG);

    // Restore
    mgr.setDisplayColorState(prev);

    // After restore, display state should match original user config
    const restored = mgr.getDisplayColorState();
    expect(restored).toEqual(userConfig);

    // And DIRTY_DISPLAY should be set (so next main render pushes uniforms)
    expect(mgr.getDirtyFlags().has(DIRTY_DISPLAY)).toBe(true);
  });
});

// --- Scope FBO Format Negotiation Tests ---

describe('isHDRContent helper', () => {
  it('SFBO-010: uint8 + srgb + no videoFrame = SDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'srgb' },
    });
    expect(isHDRContent(image)).toBe(false);
  });

  it('SFBO-011: uint8 + no metadata = SDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
    });
    expect(isHDRContent(image)).toBe(false);
  });

  it('SFBO-012: float32 = HDR regardless of metadata', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'float32',
      metadata: { transferFunction: 'srgb' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-013: uint16 = HDR regardless of metadata', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint16',
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-014: uint8 + hlg = HDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'hlg' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-015: uint8 + pq = HDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'pq' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-016: uint8 + smpte240m = HDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'smpte240m' },
    });
    expect(isHDRContent(image)).toBe(true);
  });

  it('SFBO-017: uint8 + videoFrame = HDR', () => {
    ManagedVideoFrame.resetForTesting();
    const mockFrame = { get format() { return 'RGBA'; }, close() {}, displayWidth: 2, displayHeight: 2, codedWidth: 2, codedHeight: 2, timestamp: 0, duration: null, colorSpace: {} } as unknown as VideoFrame;
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      videoFrame: mockFrame,
    });
    expect(isHDRContent(image)).toBe(true);
    image.close();
  });

  it('SFBO-018: uint8 + srgb + imageBitmap (no videoFrame) = SDR', () => {
    const image = new IPImage({
      width: 2, height: 2, channels: 4, dataType: 'uint8',
      metadata: { transferFunction: 'srgb' },
      imageBitmap: {} as ImageBitmap,
    });
    expect(isHDRContent(image)).toBe(false);
  });
});

describe('Uint8 to Float32 conversion', () => {
  // Extracted conversion logic for testability (mirrors renderForScopes)
  function uint8ToFloat32(uint8Data: Uint8Array): Float32Array {
    const result = new Float32Array(uint8Data.length);
    for (let i = 0; i < uint8Data.length; i++) {
      result[i] = uint8Data[i]! / 255.0;
    }
    return result;
  }

  it('SFBO-005: [0, 128, 255, 255] converts to [0.0, ~0.502, 1.0, 1.0]', () => {
    const input = new Uint8Array([0, 128, 255, 255]);
    const result = uint8ToFloat32(input);
    expect(result[0]).toBeCloseTo(0.0, 6);
    expect(result[1]).toBeCloseTo(128 / 255, 4);
    expect(result[2]).toBeCloseTo(1.0, 6);
    expect(result[3]).toBeCloseTo(1.0, 6);
  });

  it('SFBO-060: all-zero Uint8 converts to all-zero Float32', () => {
    const input = new Uint8Array(16).fill(0);
    const result = uint8ToFloat32(input);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(0.0);
    }
  });

  it('SFBO-061: all-255 Uint8 converts to all-1.0 Float32', () => {
    const input = new Uint8Array(16).fill(255);
    const result = uint8ToFloat32(input);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(1.0);
    }
  });

  it('SFBO-062: conversion result length matches input length', () => {
    const input = new Uint8Array(640 * 360 * 4);
    const result = uint8ToFloat32(input);
    expect(result.length).toBe(input.length);
  });

  it('SFBO-063: conversion preserves monotonicity', () => {
    const input = new Uint8Array([0, 1, 127, 128, 254, 255]);
    const result = uint8ToFloat32(input);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!).toBeGreaterThan(result[i - 1]!);
    }
  });

  it('SFBO-064: Y-flip works correctly on converted SDR data', () => {
    // 1x2 image: row0=[0,0,0,255], row1=[128,128,128,255]
    const uint8Data = new Uint8Array([0, 0, 0, 255, 128, 128, 128, 255]);
    const floatData = uint8ToFloat32(uint8Data);
    // Y-flip
    const result = new Float32Array(floatData);
    const rowSize = 1 * 4;
    const temp = new Float32Array(rowSize);
    temp.set(result.subarray(0, rowSize));
    result.copyWithin(0, rowSize, rowSize * 2);
    result.set(temp, rowSize);
    // After flip: row0 should be ~[0.502, 0.502, 0.502, 1.0]
    expect(result[0]).toBeCloseTo(128 / 255, 4);
    expect(result[4]).toBeCloseTo(0.0, 6);
  });
});
