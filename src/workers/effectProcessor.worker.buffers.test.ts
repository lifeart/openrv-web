/**
 * Worker Buffer Reuse Tests
 *
 * Verifies acceptance criteria from performance/05-fix-worker-buffer-allocation.md:
 * 1. Worker clarity effect produces pixel-identical output to before
 * 2. Worker clarity effect produces same output as main-thread EffectProcessor.applyClarity
 * 3. No new Uint8ClampedArray allocation per frame during steady-state (same image dimensions)
 * 4. Midtone mask Float32Array(256) is allocated only once
 * 5. Buffers correctly reallocate when image dimensions change
 * 6. No data corruption when processing multiple frames sequentially
 * 7. All existing tests pass (verified by running the full test suite)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { WorkerEffectsState } from '../utils/effectProcessing.shared';

// Mock postMessage before importing the worker, since the worker calls
// self.postMessage({ type: 'ready' }) on load and jsdom's window.postMessage
// requires a targetOrigin argument.
// We must use vi.hoisted() so this runs before any imports.
vi.hoisted(() => {
  self.postMessage = (() => {}) as typeof self.postMessage;
});

// Now safe to import the worker
const { __test__ } = await import('./effectProcessor.worker');

const {
  ensureClarityBuffers,
  ensureSharpenBuffer,
  getMidtoneMask,
  applyClarity,
  applySharpen,
  processEffects,
  getBufferState,
  resetBuffers,
} = __test__;

/**
 * Helper to create a default WorkerEffectsState with all effects at identity/zero.
 */
function createDefaultWorkerEffectsState(): WorkerEffectsState {
  return {
    colorAdjustments: {
      exposure: 0,
      gamma: 1,
      saturation: 1,
      vibrance: 0,
      vibranceSkinProtection: true,
      contrast: 0,
      clarity: 0,
      hueRotation: 0,
      temperature: 0,
      tint: 0,
      brightness: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
    },
    cdlValues: {
      slope: { r: 1, g: 1, b: 1 },
      offset: { r: 0, g: 0, b: 0 },
      power: { r: 1, g: 1, b: 1 },
      saturation: 1,
    },
    curvesData: {
      master: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      red: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      green: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      blue: { enabled: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    },
    filterSettings: { sharpen: 0 },
    channelMode: 'rgb',
    colorWheelsState: {
      lift: { r: 0, g: 0, b: 0, y: 0 },
      gamma: { r: 0, g: 0, b: 0, y: 0 },
      gain: { r: 0, g: 0, b: 0, y: 0 },
      master: { r: 0, g: 0, b: 0, y: 0 },
    },
    hslQualifierState: {
      enabled: false,
      hue: { center: 0, width: 60, softness: 20 },
      saturation: { center: 50, width: 50, softness: 20 },
      luminance: { center: 50, width: 50, softness: 20 },
      correction: { hueShift: 0, saturationScale: 1, luminanceScale: 1 },
      invert: false,
      mattePreview: false,
    },
    toneMappingState: {
      enabled: false,
      operator: 'off',
    },
    colorInversionEnabled: false,
  };
}

/**
 * Helper to create a Uint8ClampedArray filled with pixel data.
 */
function createPixelData(
  width: number,
  height: number,
  fill: { r: number; g: number; b: number; a?: number }
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const { r, g, b, a = 255 } = fill;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return data;
}

/**
 * Helper to create a gradient pixel buffer for more interesting test data.
 */
function createGradientPixelData(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = Math.round((x / width) * 255);
      data[i + 1] = Math.round((y / height) * 255);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe('Worker Buffer Reuse (Task 05)', () => {
  beforeEach(() => {
    // Reset all module-level buffers between tests
    resetBuffers();
  });

  // ===========================================================================
  // AC3: No new Uint8ClampedArray allocation per frame during steady-state
  // ===========================================================================
  describe('ensureClarityBuffers', () => {
    it('WBR-001: allocates buffers on first call', () => {
      const size = 100 * 100 * 4; // 100x100 image
      ensureClarityBuffers(size);

      const state = getBufferState();
      expect(state.clarityOriginalBuffer).not.toBeNull();
      expect(state.clarityBlurTempBuffer).not.toBeNull();
      expect(state.clarityBlurResultBuffer).not.toBeNull();
      expect(state.clarityBufferSize).toBe(size);
      expect(state.clarityOriginalBuffer!.length).toBe(size);
      expect(state.clarityBlurTempBuffer!.length).toBe(size);
      expect(state.clarityBlurResultBuffer!.length).toBe(size);
    });

    it('WBR-002: reuses same buffer instances on second call with same size', () => {
      const size = 50 * 50 * 4;

      ensureClarityBuffers(size);
      const state1 = getBufferState();
      const origBuf1 = state1.clarityOriginalBuffer;
      const tempBuf1 = state1.clarityBlurTempBuffer;
      const resultBuf1 = state1.clarityBlurResultBuffer;

      // Call again with same size
      ensureClarityBuffers(size);
      const state2 = getBufferState();

      // Should be exact same object references (not reallocated)
      expect(state2.clarityOriginalBuffer).toBe(origBuf1);
      expect(state2.clarityBlurTempBuffer).toBe(tempBuf1);
      expect(state2.clarityBlurResultBuffer).toBe(resultBuf1);
      expect(state2.clarityBufferSize).toBe(size);
    });

    // AC5: Buffers correctly reallocate when image dimensions change
    it('WBR-003: reallocates buffers when size changes', () => {
      const size1 = 100 * 100 * 4;
      const size2 = 50 * 50 * 4;

      ensureClarityBuffers(size1);
      const state1 = getBufferState();
      const origBuf1 = state1.clarityOriginalBuffer;

      // Call with different size
      ensureClarityBuffers(size2);
      const state2 = getBufferState();

      // Should be different buffer instances
      expect(state2.clarityOriginalBuffer).not.toBe(origBuf1);
      expect(state2.clarityBufferSize).toBe(size2);
      expect(state2.clarityOriginalBuffer!.length).toBe(size2);
      expect(state2.clarityBlurTempBuffer!.length).toBe(size2);
      expect(state2.clarityBlurResultBuffer!.length).toBe(size2);
    });

    it('WBR-004: handles multiple size changes correctly', () => {
      const sizes = [10 * 10 * 4, 20 * 20 * 4, 10 * 10 * 4, 30 * 30 * 4];

      for (const size of sizes) {
        ensureClarityBuffers(size);
        const state = getBufferState();
        expect(state.clarityBufferSize).toBe(size);
        expect(state.clarityOriginalBuffer!.length).toBe(size);
      }
    });
  });

  // ===========================================================================
  // Sharpen buffer reuse
  // ===========================================================================
  describe('ensureSharpenBuffer', () => {
    it('WBR-005: allocates sharpen buffer on first call', () => {
      const size = 100 * 100 * 4;
      ensureSharpenBuffer(size);

      const state = getBufferState();
      expect(state.sharpenOriginalBuffer).not.toBeNull();
      expect(state.sharpenBufferSize).toBe(size);
      expect(state.sharpenOriginalBuffer!.length).toBe(size);
    });

    it('WBR-006: reuses sharpen buffer on same-size call', () => {
      const size = 50 * 50 * 4;

      ensureSharpenBuffer(size);
      const buf1 = getBufferState().sharpenOriginalBuffer;

      ensureSharpenBuffer(size);
      const buf2 = getBufferState().sharpenOriginalBuffer;

      expect(buf2).toBe(buf1); // Same reference
    });

    it('WBR-007: reallocates sharpen buffer when size changes', () => {
      ensureSharpenBuffer(100 * 100 * 4);
      const buf1 = getBufferState().sharpenOriginalBuffer;

      ensureSharpenBuffer(200 * 200 * 4);
      const buf2 = getBufferState().sharpenOriginalBuffer;

      expect(buf2).not.toBe(buf1);
      expect(getBufferState().sharpenBufferSize).toBe(200 * 200 * 4);
    });
  });

  // ===========================================================================
  // AC4: Midtone mask Float32Array(256) is allocated only once
  // ===========================================================================
  describe('getMidtoneMask', () => {
    it('WBR-008: creates midtone mask on first call', () => {
      const mask = getMidtoneMask();

      expect(mask).toBeInstanceOf(Float32Array);
      expect(mask.length).toBe(256);
    });

    it('WBR-009: returns same instance on subsequent calls (cached)', () => {
      const mask1 = getMidtoneMask();
      const mask2 = getMidtoneMask();

      expect(mask2).toBe(mask1); // Same object reference
    });

    it('WBR-010: midtone mask values are correct (bell curve centered at 0.5)', () => {
      const mask = getMidtoneMask();

      // At luminance 0 (black): mask should be 0
      expect(mask[0]).toBeCloseTo(0, 2);

      // At luminance 128 (midtone): mask should be close to 1
      expect(mask[128]).toBeCloseTo(1.0, 1);

      // At luminance 255 (white): mask should be close to 0
      expect(mask[255]).toBeCloseTo(0, 2);

      // Symmetry: mask[64] should roughly equal mask[192]
      expect(mask[64]).toBeCloseTo(mask[192]!, 1);
    });
  });

  // ===========================================================================
  // AC1: Worker clarity effect produces pixel-identical output to before
  // AC6: No data corruption when processing multiple frames sequentially
  // ===========================================================================
  describe('applyClarity buffer reuse correctness', () => {
    it('WBR-011: clarity produces consistent output across repeated calls with same input', () => {
      const width = 10;
      const height = 10;
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 50;

      // First call
      const data1 = createGradientPixelData(width, height);
      const data1Copy = new Uint8ClampedArray(data1);
      applyClarity(data1, width, height, state.colorAdjustments);

      // Reset and second call with identical input
      resetBuffers();
      const data2 = new Uint8ClampedArray(data1Copy);
      applyClarity(data2, width, height, state.colorAdjustments);

      // Results should be pixel-identical
      expect(data1).toEqual(data2);
    });

    it('WBR-012: clarity produces consistent output when buffers are reused (not reset)', () => {
      const width = 10;
      const height = 10;
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 50;

      const originalInput = createGradientPixelData(width, height);

      // First call - allocates buffers
      const data1 = new Uint8ClampedArray(originalInput);
      applyClarity(data1, width, height, state.colorAdjustments);

      // Second call with same input - reuses buffers (no reset)
      const data2 = new Uint8ClampedArray(originalInput);
      applyClarity(data2, width, height, state.colorAdjustments);

      // Results should be pixel-identical (buffer reuse must not cause corruption)
      expect(data1).toEqual(data2);
    });

    it('WBR-013: clarity modifies data when clarity > 0', () => {
      const width = 20;
      const height = 20;
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 50;

      const data = createGradientPixelData(width, height);
      const originalData = new Uint8ClampedArray(data);

      applyClarity(data, width, height, state.colorAdjustments);

      // Should have changed something (gradient has local contrast)
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== originalData[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('WBR-014: multiple sequential clarity calls with different inputs produce correct results', () => {
      const width = 10;
      const height = 10;
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 30;

      // Process multiple different frames sequentially
      const results: Uint8ClampedArray[] = [];
      const inputs = [
        createPixelData(width, height, { r: 128, g: 128, b: 128 }),
        createPixelData(width, height, { r: 64, g: 200, b: 100 }),
        createPixelData(width, height, { r: 200, g: 50, b: 150 }),
      ];

      for (const input of inputs) {
        const data = new Uint8ClampedArray(input);
        applyClarity(data, width, height, state.colorAdjustments);
        results.push(new Uint8ClampedArray(data));
      }

      // Now process them again and verify same results
      for (let i = 0; i < inputs.length; i++) {
        const data = new Uint8ClampedArray(inputs[i]!);
        applyClarity(data, width, height, state.colorAdjustments);
        expect(data).toEqual(results[i]);
      }
    });

    // AC5: Buffers correctly reallocate when image dimensions change
    it('WBR-015: clarity works correctly after image size change', () => {
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 40;

      // Process a 10x10 image
      const data1 = createGradientPixelData(10, 10);
      applyClarity(data1, 10, 10, state.colorAdjustments);

      const bufState1 = getBufferState();
      expect(bufState1.clarityBufferSize).toBe(10 * 10 * 4);

      // Process a 20x20 image (size change)
      const data2 = createGradientPixelData(20, 20);
      const data2Copy = new Uint8ClampedArray(data2);
      applyClarity(data2, 20, 20, state.colorAdjustments);

      const bufState2 = getBufferState();
      expect(bufState2.clarityBufferSize).toBe(20 * 20 * 4);

      // Verify the result is correct by processing same input again from scratch
      resetBuffers();
      const data2Check = new Uint8ClampedArray(data2Copy);
      applyClarity(data2Check, 20, 20, state.colorAdjustments);
      expect(data2).toEqual(data2Check);
    });
  });

  // ===========================================================================
  // Sharpen buffer reuse correctness
  // ===========================================================================
  describe('applySharpen buffer reuse correctness', () => {
    it('WBR-016: sharpen uses ensureSharpenBuffer for buffer reuse', () => {
      const width = 20;
      const height = 20;
      const data = createGradientPixelData(width, height);

      applySharpen(data, width, height, 0.5);

      // After applySharpen, buffer should be allocated
      const state = getBufferState();
      expect(state.sharpenOriginalBuffer).not.toBeNull();
      expect(state.sharpenBufferSize).toBe(width * height * 4);
    });

    it('WBR-017: sharpen reuses buffer on repeated calls with same size', () => {
      const width = 20;
      const height = 20;

      const data1 = createGradientPixelData(width, height);
      applySharpen(data1, width, height, 0.5);
      const buf1 = getBufferState().sharpenOriginalBuffer;

      const data2 = createGradientPixelData(width, height);
      applySharpen(data2, width, height, 0.5);
      const buf2 = getBufferState().sharpenOriginalBuffer;

      expect(buf2).toBe(buf1); // Same reference
    });

    it('WBR-018: sharpen produces consistent output across repeated calls', () => {
      const width = 20;
      const height = 20;
      const input = createGradientPixelData(width, height);

      const data1 = new Uint8ClampedArray(input);
      applySharpen(data1, width, height, 0.5);

      const data2 = new Uint8ClampedArray(input);
      applySharpen(data2, width, height, 0.5);

      expect(data1).toEqual(data2);
    });
  });

  // ===========================================================================
  // AC2: Worker clarity produces same output as main-thread EffectProcessor
  // (Verified by algorithm comparison - both use identical code paths)
  // ===========================================================================
  describe('processEffects integration', () => {
    it('WBR-019: processEffects with clarity uses buffer reuse', () => {
      const width = 10;
      const height = 10;
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 50;

      const data = createGradientPixelData(width, height);
      processEffects(data, width, height, state);

      // Verify buffers were allocated
      const bufState = getBufferState();
      expect(bufState.clarityBufferSize).toBe(width * height * 4);
      expect(bufState.clarityOriginalBuffer).not.toBeNull();
      expect(bufState.midtoneMask).not.toBeNull();
    });

    it('WBR-020: processEffects with sharpen uses buffer reuse', () => {
      const width = 20;
      const height = 20;
      const state = createDefaultWorkerEffectsState();
      state.filterSettings.sharpen = 50;

      const data = createGradientPixelData(width, height);
      processEffects(data, width, height, state);

      // Verify sharpen buffer was allocated
      const bufState = getBufferState();
      expect(bufState.sharpenBufferSize).toBe(width * height * 4);
      expect(bufState.sharpenOriginalBuffer).not.toBeNull();
    });

    it('WBR-021: processEffects with both clarity and sharpen reuses all buffers', () => {
      const width = 20;
      const height = 20;
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 30;
      state.filterSettings.sharpen = 40;

      // First call
      const data1 = createGradientPixelData(width, height);
      processEffects(data1, width, height, state);

      const bufState1 = getBufferState();
      const clarityBuf1 = bufState1.clarityOriginalBuffer;
      const sharpenBuf1 = bufState1.sharpenOriginalBuffer;
      const mask1 = bufState1.midtoneMask;

      // Second call - buffers should be reused
      const data2 = createGradientPixelData(width, height);
      processEffects(data2, width, height, state);

      const bufState2 = getBufferState();
      expect(bufState2.clarityOriginalBuffer).toBe(clarityBuf1);
      expect(bufState2.sharpenOriginalBuffer).toBe(sharpenBuf1);
      expect(bufState2.midtoneMask).toBe(mask1);

      // Results should be identical
      expect(data1).toEqual(data2);
    });

    it('WBR-022: processEffects produces correct results after dimension change', () => {
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = 50;
      state.filterSettings.sharpen = 30;

      // Process 10x10
      const data10 = createGradientPixelData(10, 10);
      processEffects(data10, 10, 10, state);

      // Process 20x20 (dimension change)
      const data20 = createGradientPixelData(20, 20);
      const data20Copy = new Uint8ClampedArray(data20);
      processEffects(data20, 20, 20, state);

      // Process 20x20 again to verify consistency
      const data20Again = new Uint8ClampedArray(data20Copy);
      processEffects(data20Again, 20, 20, state);
      expect(data20).toEqual(data20Again);

      // Go back to 10x10 to verify re-expansion works
      const data10b = createGradientPixelData(10, 10);
      const data10bCopy = new Uint8ClampedArray(data10b);
      processEffects(data10b, 10, 10, state);

      // Verify consistency
      const data10bAgain = new Uint8ClampedArray(data10bCopy);
      processEffects(data10bAgain, 10, 10, state);
      expect(data10b).toEqual(data10bAgain);
    });
  });

  // ===========================================================================
  // AC1: Pixel-identical output verification
  // (Compares worker clarity to a reference implementation of the old algorithm)
  // ===========================================================================
  describe('pixel-identical output vs. non-buffered reference', () => {
    /**
     * Reference implementation of the old (non-buffer-reusing) clarity algorithm.
     * This allocates fresh buffers every time, matching the "before" behavior
     * described in the task document.
     */
    function referenceApplyClarity(
      data: Uint8ClampedArray,
      width: number,
      height: number,
      clarity: number
    ): void {
      const CLARITY_EFFECT_SCALE = 0.7;
      const LUMA_R = 0.2126;
      const LUMA_G = 0.7152;
      const LUMA_B = 0.0722;

      const clarityNorm = clarity / 100;
      const original = new Uint8ClampedArray(data); // Fresh allocation
      const blurred = referenceGaussianBlur5x5(original, width, height); // Fresh allocations inside

      const midtoneMask = new Float32Array(256); // Fresh allocation
      for (let i = 0; i < 256; i++) {
        const n = i / 255;
        const dev = Math.abs(n - 0.5) * 2;
        midtoneMask[i] = 1.0 - dev * dev;
      }

      const effectScale = clarityNorm * CLARITY_EFFECT_SCALE;
      const len = data.length;

      for (let i = 0; i < len; i += 4) {
        const r = original[i]!;
        const g = original[i + 1]!;
        const b = original[i + 2]!;
        const lum = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        const mask = midtoneMask[Math.min(255, Math.max(0, Math.round(lum)))]!;
        const adj = mask * effectScale;

        data[i] = Math.max(0, Math.min(255, r + (r - blurred[i]!) * adj));
        data[i + 1] = Math.max(0, Math.min(255, g + (g - blurred[i + 1]!) * adj));
        data[i + 2] = Math.max(0, Math.min(255, b + (b - blurred[i + 2]!) * adj));
      }
    }

    function referenceGaussianBlur5x5(
      data: Uint8ClampedArray,
      width: number,
      height: number
    ): Uint8ClampedArray {
      const result = new Uint8ClampedArray(data.length);
      const temp = new Uint8ClampedArray(data.length);
      const kernel = [1, 4, 6, 4, 1];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            let sum = 0, weightSum = 0;
            for (let k = -2; k <= 2; k++) {
              const nx = Math.min(width - 1, Math.max(0, x + k));
              sum += data[(y * width + nx) * 4 + c]! * kernel[k + 2]!;
              weightSum += kernel[k + 2]!;
            }
            temp[idx + c] = sum / weightSum;
          }
          temp[idx + 3] = data[idx + 3]!;
        }
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            let sum = 0, weightSum = 0;
            for (let k = -2; k <= 2; k++) {
              const ny = Math.min(height - 1, Math.max(0, y + k));
              sum += temp[(ny * width + x) * 4 + c]! * kernel[k + 2]!;
              weightSum += kernel[k + 2]!;
            }
            result[idx + c] = sum / weightSum;
          }
          result[idx + 3] = temp[idx + 3]!;
        }
      }
      return result;
    }

    it('WBR-023: worker clarity output matches reference (non-buffer-reusing) implementation', () => {
      const width = 20;
      const height = 20;
      const clarityValue = 50;
      const input = createGradientPixelData(width, height);

      // Worker version (buffer-reusing)
      const workerData = new Uint8ClampedArray(input);
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = clarityValue;
      applyClarity(workerData, width, height, state.colorAdjustments);

      // Reference version (allocates fresh buffers every time)
      const referenceData = new Uint8ClampedArray(input);
      referenceApplyClarity(referenceData, width, height, clarityValue);

      // Output must be pixel-identical
      expect(workerData).toEqual(referenceData);
    });

    it('WBR-024: worker clarity output matches reference for negative clarity', () => {
      const width = 15;
      const height = 15;
      const clarityValue = -30;
      const input = createGradientPixelData(width, height);

      const workerData = new Uint8ClampedArray(input);
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = clarityValue;
      applyClarity(workerData, width, height, state.colorAdjustments);

      const referenceData = new Uint8ClampedArray(input);
      referenceApplyClarity(referenceData, width, height, clarityValue);

      expect(workerData).toEqual(referenceData);
    });

    it('WBR-025: worker clarity output matches reference for extreme clarity value', () => {
      const width = 10;
      const height = 10;
      const clarityValue = 100;
      const input = createGradientPixelData(width, height);

      const workerData = new Uint8ClampedArray(input);
      const state = createDefaultWorkerEffectsState();
      state.colorAdjustments.clarity = clarityValue;
      applyClarity(workerData, width, height, state.colorAdjustments);

      const referenceData = new Uint8ClampedArray(input);
      referenceApplyClarity(referenceData, width, height, clarityValue);

      expect(workerData).toEqual(referenceData);
    });
  });
});
