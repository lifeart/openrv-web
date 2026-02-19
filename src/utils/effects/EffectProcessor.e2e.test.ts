/**
 * EffectProcessor End-to-End Integration Tests
 *
 * Tests the full effects pipeline across multiple code paths:
 * - Main-thread EffectProcessor.applyEffects() vs Worker processEffects() parity
 * - Full multi-effect pipeline (CDL + curves + clarity + sharpen + tone mapping)
 * - Half-resolution end-to-end quality through the full pipeline
 * - Async (chunked) vs sync parity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EffectProcessor,
  AllEffectsState,
  createDefaultEffectsState,
} from './EffectProcessor';
import { createGradientImageData } from '../../../test/utils';

// Mock postMessage before importing the worker (jsdom requires targetOrigin)
vi.hoisted(() => {
  self.postMessage = (() => {}) as typeof self.postMessage;
});

const { __test__: workerTest } = await import('../../workers/effectProcessor.worker');
const { processEffects: workerProcessEffects, resetBuffers } = workerTest;

// Helper: convert AllEffectsState to the shape the worker expects (structurally identical)
function toWorkerState(state: AllEffectsState) {
  return JSON.parse(JSON.stringify(state));
}

// Helper: compute RMS error between two pixel arrays (normalized to 0-1)
function computeRMSError(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sumSqErr = 0;
  let pixelCount = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = (a[i + c]! - b[i + c]!) / 255;
      sumSqErr += diff * diff;
    }
    pixelCount++;
  }
  return Math.sqrt(sumSqErr / (pixelCount * 3));
}

// Helper: check pixel-exact match (allows rounding tolerance of ±1)
function assertPixelMatch(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  tolerance = 1,
  label = 'pixels'
): void {
  let maxDiff = 0;
  let diffCount = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs(a[i + c]! - b[i + c]!);
      if (diff > tolerance) diffCount++;
      maxDiff = Math.max(maxDiff, diff);
    }
  }
  if (diffCount > 0) {
    throw new Error(
      `${label}: ${diffCount} pixels differ by more than ±${tolerance} (max diff: ${maxDiff})`
    );
  }
}

// Helper: create a checkerboard pattern (better for testing clarity/sharpen than gradients)
function createCheckerImageData(width: number, height: number, blockSize = 8): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const checker = (Math.floor(x / blockSize) + Math.floor(y / blockSize)) & 1;
      const v = checker ? 200 : 56;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('EffectProcessor E2E', () => {
  let processor: EffectProcessor;

  beforeEach(() => {
    processor = new EffectProcessor();
    resetBuffers();
  });

  describe('Main-thread vs Worker parity', () => {
    it('E2E-PAR-001: CDL with slope/offset/power produces identical output', () => {
      const width = 100;
      const height = 100;
      const imgMain = createGradientImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.cdlValues.slope = { r: 1.5, g: 1.2, b: 0.8 };
      state.cdlValues.offset = { r: 0.1, g: -0.05, b: 0.15 };
      state.cdlValues.power = { r: 0.8, g: 1.2, b: 0.9 };

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'CDL parity');
    });

    it('E2E-PAR-002: tone mapping (Reinhard + custom whitePoint) produces identical output', () => {
      const width = 50;
      const height = 50;
      const imgMain = createGradientImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.toneMappingState.enabled = true;
      state.toneMappingState.operator = 'reinhard';
      state.toneMappingState.reinhardWhitePoint = 2.0;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Reinhard parity');
    });

    it('E2E-PAR-003: tone mapping (Drago + custom params) produces identical output', () => {
      const width = 50;
      const height = 50;
      const imgMain = createGradientImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.toneMappingState.enabled = true;
      state.toneMappingState.operator = 'drago';
      state.toneMappingState.dragoBias = 0.65;
      state.toneMappingState.dragoLwa = 0.3;
      state.toneMappingState.dragoLmax = 2.0;
      state.toneMappingState.dragoBrightness = 3.0;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Drago parity');
    });

    it('E2E-PAR-004: clarity produces identical output (main vs worker, fullRes)', () => {
      const width = 100;
      const height = 100;
      const imgMain = createCheckerImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.colorAdjustments.clarity = 50;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Clarity parity');
    });

    it('E2E-PAR-005: sharpen produces identical output (main vs worker, fullRes)', () => {
      const width = 100;
      const height = 100;
      const imgMain = createGradientImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.filterSettings.sharpen = 60;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Sharpen parity');
    });

    it('E2E-PAR-006: exposure + contrast + saturation produces identical output', () => {
      const width = 80;
      const height = 80;
      const imgMain = createGradientImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.colorAdjustments.exposure = 0.5;
      state.colorAdjustments.contrast = 30;
      state.colorAdjustments.saturation = 1.3;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Basic adjustments parity');
    });
  });

  describe('Full multi-effect pipeline', () => {
    it('E2E-PIPE-001: CDL + curves + clarity + sharpen + tone mapping combined', () => {
      const width = 400;
      const height = 400;
      const imgMain = createCheckerImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      // CDL
      state.cdlValues.slope = { r: 1.3, g: 1.1, b: 0.9 };
      state.cdlValues.offset = { r: 0.05, g: 0, b: -0.03 };
      state.cdlValues.power = { r: 0.9, g: 1.0, b: 1.1 };
      // Curves
      state.curvesData.master.enabled = true;
      state.curvesData.master.points = [{ x: 0, y: 0.05 }, { x: 0.5, y: 0.55 }, { x: 1, y: 0.95 }];
      // Clarity
      state.colorAdjustments.clarity = 40;
      // Sharpen
      state.filterSettings.sharpen = 50;
      // Tone mapping
      state.toneMappingState.enabled = true;
      state.toneMappingState.operator = 'reinhard';
      state.toneMappingState.reinhardWhitePoint = 3.0;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Full pipeline parity');
    });

    it('E2E-PIPE-002: CDL with values > 1.0 + curves + color inversion - no crash', () => {
      const width = 200;
      const height = 200;
      const imgMain = createGradientImageData(width, height);

      const state = createDefaultEffectsState();
      state.cdlValues.slope = { r: 3, g: 3, b: 3 };
      state.cdlValues.offset = { r: 0.5, g: 0.5, b: 0.5 };
      state.cdlValues.power = { r: 0.5, g: 0.5, b: 0.5 };
      state.curvesData.master.enabled = true;
      state.curvesData.master.points = [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }];
      state.colorInversionEnabled = true;

      expect(() => {
        processor.applyEffects(imgMain, width, height, state);
      }).not.toThrow();

      // All pixels must be valid
      for (let i = 0; i < imgMain.data.length; i += 4) {
        expect(Number.isFinite(imgMain.data[i]!)).toBe(true);
        expect(imgMain.data[i]!).toBeGreaterThanOrEqual(0);
        expect(imgMain.data[i]!).toBeLessThanOrEqual(255);
      }
    });

    it('E2E-PIPE-003: exposure + highlights/shadows + vibrance + hue combined', () => {
      const width = 100;
      const height = 100;
      const imgMain = createGradientImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.colorAdjustments.exposure = 0.3;
      state.colorAdjustments.highlights = -30;
      state.colorAdjustments.shadows = 20;
      state.colorAdjustments.vibrance = 40;
      state.colorAdjustments.hueRotation = 45;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Combined adjustments parity');
    });

    it('E2E-PIPE-004: color wheels + CDL + saturation combined', () => {
      const width = 80;
      const height = 80;
      const imgMain = createGradientImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.colorWheelsState.lift = { r: 0.02, g: -0.01, b: 0, y: 0.01 };
      state.colorWheelsState.gain = { r: 0, g: 0.03, b: -0.02, y: 0 };
      state.cdlValues.slope = { r: 1.2, g: 1.0, b: 0.8 };
      state.cdlValues.saturation = 1.2;

      processor.applyEffects(imgMain, width, height, state);
      workerProcessEffects(workerData, width, height, toWorkerState(state));

      assertPixelMatch(imgMain.data, workerData, 1, 'Color wheels + CDL parity');
    });
  });

  describe('Half-resolution end-to-end quality', () => {
    it('E2E-HALF-001: full pipeline with halfRes=true is within acceptable RMS of fullRes', () => {
      const width = 400;
      const height = 400;
      const imgFull = createCheckerImageData(width, height);
      const imgHalf = createCheckerImageData(width, height);

      const state = createDefaultEffectsState();
      state.colorAdjustments.clarity = 50;
      state.filterSettings.sharpen = 60;
      state.colorAdjustments.exposure = 0.2;

      processor.applyEffects(imgFull, width, height, state, false);
      processor.applyEffects(imgHalf, width, height, state, true);

      const rms = computeRMSError(imgFull.data, imgHalf.data);
      // Interactive preview: RMS error should be under 10%
      expect(rms).toBeLessThan(0.10);
    });

    it('E2E-HALF-002: worker full pipeline with halfRes=true is within acceptable RMS', () => {
      const width = 400;
      const height = 400;
      const full = createCheckerImageData(width, height);
      const half = createCheckerImageData(width, height);
      const fullData = new Uint8ClampedArray(full.data);
      const halfData = new Uint8ClampedArray(half.data);

      const state = createDefaultEffectsState();
      state.colorAdjustments.clarity = 50;
      state.filterSettings.sharpen = 60;

      workerProcessEffects(fullData, width, height, toWorkerState(state), false);
      resetBuffers();
      workerProcessEffects(halfData, width, height, toWorkerState(state), true);

      const rms = computeRMSError(fullData, halfData);
      expect(rms).toBeLessThan(0.10);
    });

    it('E2E-HALF-003: main-thread halfRes vs worker halfRes produce same output', () => {
      const width = 400;
      const height = 400;
      const imgMain = createCheckerImageData(width, height);
      const workerData = new Uint8ClampedArray(imgMain.data);

      const state = createDefaultEffectsState();
      state.colorAdjustments.clarity = 40;
      state.filterSettings.sharpen = 50;

      processor.applyEffects(imgMain, width, height, state, true);
      workerProcessEffects(workerData, width, height, toWorkerState(state), true);

      assertPixelMatch(imgMain.data, workerData, 1, 'Half-res main vs worker parity');
    });

    it('E2E-HALF-004: CDL + clarity + sharpen combined with halfRes produces acceptable quality', () => {
      const width = 400;
      const height = 400;
      const imgFull = createCheckerImageData(width, height);
      const imgHalf = createCheckerImageData(width, height);

      const state = createDefaultEffectsState();
      state.cdlValues.slope = { r: 1.3, g: 1.1, b: 0.9 };
      state.cdlValues.offset = { r: 0.05, g: 0, b: -0.03 };
      state.colorAdjustments.clarity = 60;
      state.filterSettings.sharpen = 70;

      processor.applyEffects(imgFull, width, height, state, false);
      processor.applyEffects(imgHalf, width, height, state, true);

      const rms = computeRMSError(imgFull.data, imgHalf.data);
      // Combined CDL + high clarity + high sharpen pushes error slightly higher;
      // 12% threshold is acceptable for interactive preview (~200ms display time)
      expect(rms).toBeLessThan(0.12);
    });
  });

  describe('Async (chunked) vs sync parity', () => {
    it('E2E-ASYNC-001: applyEffectsAsync produces identical output to applyEffects for clarity', async () => {
      const width = 400;
      const height = 400;
      const imgSync = createCheckerImageData(width, height);
      const imgAsync = createCheckerImageData(width, height);

      const state = createDefaultEffectsState();
      state.colorAdjustments.clarity = 50;

      processor.applyEffects(imgSync, width, height, state);
      await processor.applyEffectsAsync(imgAsync, width, height, state);

      assertPixelMatch(imgSync.data, imgAsync.data, 0, 'Sync vs async clarity');
    });

    it('E2E-ASYNC-002: applyEffectsAsync produces identical output to applyEffects for sharpen', async () => {
      const width = 400;
      const height = 400;
      const imgSync = createGradientImageData(width, height);
      const imgAsync = createGradientImageData(width, height);

      const state = createDefaultEffectsState();
      state.filterSettings.sharpen = 60;

      processor.applyEffects(imgSync, width, height, state);
      await processor.applyEffectsAsync(imgAsync, width, height, state);

      assertPixelMatch(imgSync.data, imgAsync.data, 0, 'Sync vs async sharpen');
    });

    it('E2E-ASYNC-003: applyEffectsAsync with full pipeline matches sync', async () => {
      const width = 400;
      const height = 400;
      const imgSync = createCheckerImageData(width, height);
      const imgAsync = createCheckerImageData(width, height);

      const state = createDefaultEffectsState();
      state.colorAdjustments.clarity = 30;
      state.filterSettings.sharpen = 40;
      state.colorAdjustments.exposure = 0.2;
      state.cdlValues.slope = { r: 1.2, g: 1.0, b: 0.9 };
      state.toneMappingState.enabled = true;
      state.toneMappingState.operator = 'filmic';
      state.toneMappingState.filmicExposureBias = 3.0;
      state.toneMappingState.filmicWhitePoint = 11.2;

      processor.applyEffects(imgSync, width, height, state);
      await processor.applyEffectsAsync(imgAsync, width, height, state);

      assertPixelMatch(imgSync.data, imgAsync.data, 0, 'Sync vs async full pipeline');
    });
  });

  describe('Buffer reuse across frames', () => {
    it('E2E-BUF-001: sharpen half-res buffers are reused across multiple calls', () => {
      const width = 400;
      const height = 400;
      const state = createDefaultEffectsState();
      state.filterSettings.sharpen = 50;

      // First call — allocates buffers
      const img1 = createCheckerImageData(width, height);
      processor.applyEffects(img1, width, height, state, true);

      // Second call — should reuse buffers (same dimensions)
      const img2 = createCheckerImageData(width, height);
      processor.applyEffects(img2, width, height, state, true);

      // Both should produce the same output (deterministic)
      assertPixelMatch(img1.data, img2.data, 0, 'Buffer reuse consistency');
    });

    it('E2E-BUF-002: worker sharpen half-res buffers allocated on first call, reused on second', () => {
      const width = 400;
      const height = 400;
      const state = createDefaultEffectsState();
      state.filterSettings.sharpen = 50;

      resetBuffers();

      // Before any call — no sharpen half-res buffers
      let bufState = workerTest.getBufferState();
      expect(bufState.sharpenHalfOrigBuffer).toBeNull();
      expect(bufState.sharpenDeltaBuffer).toBeNull();

      // First call with halfRes=true
      const data1 = new Uint8ClampedArray(createCheckerImageData(width, height).data);
      workerProcessEffects(data1, width, height, toWorkerState(state), true);

      bufState = workerTest.getBufferState();
      expect(bufState.sharpenHalfOrigBuffer).not.toBeNull();
      expect(bufState.sharpenDeltaBuffer).not.toBeNull();
      const firstOrigBuffer = bufState.sharpenHalfOrigBuffer;
      const firstDeltaBuffer = bufState.sharpenDeltaBuffer;

      // Second call — same dimensions, buffers should be reused (same reference)
      const data2 = new Uint8ClampedArray(createCheckerImageData(width, height).data);
      workerProcessEffects(data2, width, height, toWorkerState(state), true);

      bufState = workerTest.getBufferState();
      expect(bufState.sharpenHalfOrigBuffer).toBe(firstOrigBuffer);
      expect(bufState.sharpenDeltaBuffer).toBe(firstDeltaBuffer);
    });
  });
});
