/**
 * StabilizeMotion Unit Tests
 *
 * STAB-001: Analysis completes on sequence
 * STAB-002: Stabilized preview reduces shake
 * STAB-003: Smoothing affects result
 * STAB-004: Crop removes edges
 */

import { describe, it, expect } from 'vitest';
import {
  computeMotionVector,
  smoothMotionPath,
  applyStabilization,
  isStabilizationActive,
  toGrayscale,
  downsampleGrayscale,
  median,
  filterOutliers,
  DEFAULT_STABILIZATION_PARAMS,
} from './StabilizeMotion';
import type { MotionVector } from './StabilizeMotion';

// --- Helpers ---

function createTestImageData(width: number, height: number, fill?: number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0] ?? 128;
      data[i + 1] = fill[1] ?? 128;
      data[i + 2] = fill[2] ?? 128;
      data[i + 3] = fill[3] ?? 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Create a frame with a globally unique, non-repeating textured pattern.
 * Uses smooth gradients for global uniqueness + deterministic noise for local texture.
 */
function createTexturedFrame(width: number, height: number, seed: number = 0): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Smooth gradients ensure global uniqueness (no translational symmetry)
      const baseR = Math.floor((x * 255) / width);
      const baseG = Math.floor((y * 255) / height);
      const baseB = Math.floor(((x + y) * 128) / (width + height));
      // Deterministic per-pixel noise for local texture
      const noise = ((x * 73 + y * 137 + seed * 31) % 29) - 14;
      data[idx] = Math.max(0, Math.min(255, baseR + noise));
      data[idx + 1] = Math.max(0, Math.min(255, baseG + noise));
      data[idx + 2] = Math.max(0, Math.min(255, baseB + noise));
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

/**
 * Create a shifted copy of an ImageData by (dx, dy) pixels.
 * Pixels that fall outside the boundary are filled with black.
 */
function shiftImageData(src: ImageData, dx: number, dy: number): ImageData {
  const { width, height } = src;
  const shifted = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x - dx;
      const srcY = y - dy;
      const dstIdx = (y * width + x) * 4;
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = (srcY * width + srcX) * 4;
        shifted[dstIdx] = src.data[srcIdx]!;
        shifted[dstIdx + 1] = src.data[srcIdx + 1]!;
        shifted[dstIdx + 2] = src.data[srcIdx + 2]!;
        shifted[dstIdx + 3] = src.data[srcIdx + 3]!;
      } else {
        shifted[dstIdx] = 0;
        shifted[dstIdx + 1] = 0;
        shifted[dstIdx + 2] = 0;
        shifted[dstIdx + 3] = 255;
      }
    }
  }
  return new ImageData(shifted, width, height);
}

/**
 * Compute MSE over an interior region, excluding a margin from each edge.
 */
function computeRegionMSE(a: ImageData, b: ImageData, margin: number): number {
  const w = a.width;
  const h = a.height;
  let sum = 0;
  let count = 0;
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      const idx = (y * w + x) * 4;
      sum += (a.data[idx]! - b.data[idx]!) ** 2;
      sum += (a.data[idx + 1]! - b.data[idx + 1]!) ** 2;
      sum += (a.data[idx + 2]! - b.data[idx + 2]!) ** 2;
      count++;
    }
  }
  return count > 0 ? sum / (count * 3) : 0;
}

/**
 * Compute variance of an array of numbers.
 */
function variance(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

// --- Tests ---

describe('StabilizeMotion', () => {
  describe('DEFAULT_STABILIZATION_PARAMS', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_STABILIZATION_PARAMS.enabled).toBe(false);
      expect(DEFAULT_STABILIZATION_PARAMS.smoothingStrength).toBe(50);
      expect(DEFAULT_STABILIZATION_PARAMS.cropAmount).toBe(8);
    });
  });

  describe('isStabilizationActive', () => {
    it('should return false when disabled', () => {
      expect(isStabilizationActive({ enabled: false, smoothingStrength: 50, cropAmount: 8 })).toBe(false);
    });

    it('should return true when enabled', () => {
      expect(isStabilizationActive({ enabled: true, smoothingStrength: 50, cropAmount: 8 })).toBe(true);
    });
  });

  describe('utility functions', () => {
    it('toGrayscale converts RGBA to luminance', () => {
      const img = createTestImageData(2, 2, [255, 0, 0, 255]); // red
      const gray = toGrayscale(img.data, 2, 2);
      expect(gray.length).toBe(4);
      // Rec.709: 0.2126 * 255 ≈ 54.2
      for (let i = 0; i < 4; i++) {
        expect(gray[i]).toBeCloseTo(0.2126 * 255, 0);
      }
    });

    it('downsampleGrayscale reduces dimensions', () => {
      const gray = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      const result = downsampleGrayscale(gray, 4, 4, 2);
      expect(result.width).toBe(2);
      expect(result.height).toBe(2);
      expect(result.data.length).toBe(4);
      expect(result.data[0]).toBe(1);  // (0,0)
      expect(result.data[1]).toBe(3);  // (2,0)
      expect(result.data[2]).toBe(9);  // (0,2)
      expect(result.data[3]).toBe(11); // (2,2)
    });

    it('median computes correct value for odd-length array', () => {
      expect(median([3, 1, 2])).toBe(2);
    });

    it('median computes correct value for even-length array', () => {
      expect(median([4, 1, 3, 2])).toBe(2.5);
    });

    it('median returns 0 for empty array', () => {
      expect(median([])).toBe(0);
    });

    it('median returns single value for single-element array', () => {
      expect(median([42])).toBe(42);
    });

    it('filterOutliers removes extreme values', () => {
      const values = [1, 2, 3, 2, 1, 3, 2, 100]; // 100 is an outlier
      const filtered = filterOutliers(values);
      expect(filtered).not.toContain(100);
      expect(filtered.length).toBeLessThan(values.length);
    });

    it('filterOutliers keeps all values when none are outliers', () => {
      const values = [1, 2, 3, 2, 1, 3, 2, 3];
      const filtered = filterOutliers(values);
      expect(filtered.length).toBe(values.length);
    });

    it('filterOutliers handles arrays with < 3 elements', () => {
      expect(filterOutliers([1, 100])).toEqual([1, 100]);
      expect(filterOutliers([5])).toEqual([5]);
      expect(filterOutliers([])).toEqual([]);
    });
  });

  // STAB-001: Analysis completes on sequence
  describe('STAB-001: computeMotionVector', () => {
    it('STAB-001-01: returns {dx:0, dy:0} for identical frames', () => {
      const frame = createTexturedFrame(128, 128);
      const result = computeMotionVector(frame, frame);
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('STAB-001-02: detects known horizontal shift', () => {
      const reference = createTexturedFrame(128, 128);
      const shifted = shiftImageData(reference, 5, 0);
      const result = computeMotionVector(shifted, reference);
      // The detected shift should be close to 5 (may not be exact due to block quantization)
      expect(Math.abs(result.dx - 5)).toBeLessThanOrEqual(3);
      expect(Math.abs(result.dy)).toBeLessThanOrEqual(3);
    });

    it('STAB-001-03: detects known vertical shift', () => {
      const reference = createTexturedFrame(128, 128);
      const shifted = shiftImageData(reference, 0, 8);
      const result = computeMotionVector(shifted, reference);
      expect(Math.abs(result.dy - 8)).toBeLessThanOrEqual(3);
      expect(Math.abs(result.dx)).toBeLessThanOrEqual(3);
    });

    it('STAB-001-04: detects diagonal shift', () => {
      const reference = createTexturedFrame(128, 128);
      const shifted = shiftImageData(reference, 4, 6);
      const result = computeMotionVector(shifted, reference);
      expect(Math.abs(result.dx - 4)).toBeLessThanOrEqual(3);
      expect(Math.abs(result.dy - 6)).toBeLessThanOrEqual(3);
    });

    it('STAB-001-05: works on small 64x64 image', () => {
      const frame = createTexturedFrame(64, 64);
      const result = computeMotionVector(frame, frame, 8, 16);
      expect(Number.isFinite(result.dx)).toBe(true);
      expect(Number.isFinite(result.dy)).toBe(true);
    });

    it('STAB-001-06: returns finite values for random noise input', () => {
      const a = createTestImageData(64, 64);
      const b = createTestImageData(64, 64);
      // Fill with pseudo-random values
      for (let i = 0; i < a.data.length; i++) {
        a.data[i] = (i * 37 + 13) % 256;
        b.data[i] = (i * 53 + 7) % 256;
      }
      const result = computeMotionVector(a, b, 8, 16);
      expect(Number.isFinite(result.dx)).toBe(true);
      expect(Number.isFinite(result.dy)).toBe(true);
      expect(Number.isFinite(result.confidence)).toBe(true);
    });

    it('STAB-001-07: handles all-black frames gracefully', () => {
      const black = createTestImageData(64, 64, [0, 0, 0, 255]);
      const result = computeMotionVector(black, black, 8, 16);
      // All-black frames have no texture, so all blocks should be skipped
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('STAB-001-08: handles image smaller than block size', () => {
      const tiny = createTestImageData(4, 4, [128, 128, 128, 255]);
      const result = computeMotionVector(tiny, tiny, 16, 32);
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('STAB-001-09: mismatched dimensions return zero vector with zero confidence', () => {
      const a = createTestImageData(64, 64, [128, 128, 128, 255]);
      const b = createTestImageData(32, 32, [128, 128, 128, 255]);
      const result = computeMotionVector(a, b);
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('STAB-001-10: scene-cut detection — unrelated frames have low confidence', () => {
      // Two completely unrelated frames (different seeds with large offset)
      const a = createTexturedFrame(128, 128, 0);
      // Create a truly unrelated frame with scrambled pixel data
      const b = createTestImageData(128, 128);
      for (let i = 0; i < b.data.length; i += 4) {
        // Pseudo-random values unrelated to frame a
        b.data[i] = (i * 37 + 173) % 256;
        b.data[i + 1] = (i * 53 + 91) % 256;
        b.data[i + 2] = (i * 71 + 211) % 256;
        b.data[i + 3] = 255;
      }
      const result = computeMotionVector(a, b);
      // Scene cut: confidence should be notably lower than for similar frames
      const sameResult = computeMotionVector(a, a);
      expect(result.confidence).toBeLessThan(sameResult.confidence);
    });

    it('STAB-001-11: identical frames have high confidence', () => {
      const frame = createTexturedFrame(128, 128);
      const result = computeMotionVector(frame, frame);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  // STAB-002: Stabilized preview reduces shake
  describe('STAB-002: applyStabilization', () => {
    it('STAB-002-01: inverse motion brings shifted frame closer to reference', () => {
      const reference = createTexturedFrame(64, 64);
      const shifted = shiftImageData(reference, 5, 0);

      // Apply compensating shift: srcX = x + dx, so dx=+5 pulls from x+5 in the shifted
      // frame, recovering the original content (shifted[x+5] = reference[x+5-5] = reference[x])
      const stabilized = new ImageData(
        new Uint8ClampedArray(shifted.data),
        shifted.width,
        shifted.height,
      );
      applyStabilization(stabilized, { dx: 5, dy: 0, cropAmount: 0 });

      // Compare MSE over the valid interior region (excluding border artifacts)
      const margin = 8;
      const mseBefore = computeRegionMSE(shifted, reference, margin);
      const mseAfter = computeRegionMSE(stabilized, reference, margin);
      expect(mseAfter).toBeLessThan(mseBefore);
    });

    it('STAB-002-02: neutral gray frame unchanged with zero vector', () => {
      const gray = createTestImageData(32, 32, [128, 128, 128, 255]);
      const originalData = new Uint8ClampedArray(gray.data);

      applyStabilization(gray, { dx: 0, dy: 0, cropAmount: 0 });
      expect(gray.data).toEqual(originalData);
    });

    it('STAB-002-03: sub-pixel motion via bilinear interpolation', () => {
      // Create a frame with a sharp edge at x=16
      const img = createTestImageData(32, 32);
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const idx = (y * 32 + x) * 4;
          const val = x < 16 ? 0 : 255;
          img.data[idx] = val;
          img.data[idx + 1] = val;
          img.data[idx + 2] = val;
          img.data[idx + 3] = 255;
        }
      }
      const originalData = new Uint8ClampedArray(img.data);

      // Shift by +0.5 pixels: output[x] samples from input[x+0.5]
      applyStabilization(img, { dx: 0.5, dy: 0, cropAmount: 0 });

      // At x=15: srcX=15.5, interpolates between input[15]=0 and input[16]=255 → ~128
      let hasInterpolated = false;
      for (let y = 1; y < 30; y++) {
        const edgeIdx = (y * 32 + 15) * 4; // x=15, where interpolation happens
        const val = img.data[edgeIdx]!;
        if (val > 0 && val < 255) {
          hasInterpolated = true;
          break;
        }
      }
      expect(hasInterpolated).toBe(true);

      // Overall data should have changed
      let changed = false;
      for (let i = 0; i < originalData.length; i++) {
        if (img.data[i] !== originalData[i]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    });

    it('STAB-002-04: stabilization of known shift brings frame back near original', () => {
      const reference = createTexturedFrame(64, 64);
      const shiftX = 3;
      const shiftY = 2;
      const shifted = shiftImageData(reference, shiftX, shiftY);

      // Apply compensating shift: dx=+shiftX recovers reference content
      // shifted[x+shiftX] = reference[x+shiftX - shiftX] = reference[x]
      const stabilized = new ImageData(
        new Uint8ClampedArray(shifted.data),
        shifted.width,
        shifted.height,
      );
      applyStabilization(stabilized, { dx: shiftX, dy: shiftY, cropAmount: 0 });

      // Interior pixels (away from border) should closely match reference
      let maxDiff = 0;
      const margin = Math.max(Math.abs(shiftX), Math.abs(shiftY)) + 2;
      for (let y = margin; y < 64 - margin; y++) {
        for (let x = margin; x < 64 - margin; x++) {
          const idx = (y * 64 + x) * 4;
          for (let c = 0; c < 3; c++) {
            maxDiff = Math.max(maxDiff, Math.abs(stabilized.data[idx + c]! - reference.data[idx + c]!));
          }
        }
      }
      // Integer shift → exact match (no interpolation rounding)
      expect(maxDiff).toBeLessThanOrEqual(1);
    });

    it('STAB-002-05: large shift fills most pixels with black', () => {
      const img = createTestImageData(32, 32, [128, 128, 128, 255]);
      applyStabilization(img, { dx: 30, dy: 30, cropAmount: 0 });

      // Most pixels should be black (out of bounds)
      let blackCount = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i] === 0 && img.data[i + 1] === 0 && img.data[i + 2] === 0) {
          blackCount++;
        }
      }
      expect(blackCount).toBeGreaterThan(img.width * img.height * 0.8);
    });
  });

  // STAB-003: Smoothing affects result
  describe('STAB-003: smoothMotionPath', () => {
    it('STAB-003-01: strength 0 returns zero corrections', () => {
      const vectors: MotionVector[] = [
        { dx: 5, dy: 3, confidence: 1 },
        { dx: -2, dy: 4, confidence: 1 },
        { dx: 1, dy: -1, confidence: 1 },
      ];
      const result = smoothMotionPath(vectors, 0);
      expect(result.length).toBe(3);
      // Zero corrections = no smoothing
      for (const v of result) {
        expect(v.dx).toBe(0);
        expect(v.dy).toBe(0);
      }
    });

    it('STAB-003-02: high strength produces non-zero corrections for shaky input', () => {
      const vectors: MotionVector[] = [
        { dx: 10, dy: 0, confidence: 1 },
        { dx: -10, dy: 5, confidence: 1 },
        { dx: 8, dy: -3, confidence: 1 },
        { dx: -7, dy: 6, confidence: 1 },
        { dx: 9, dy: -4, confidence: 1 },
      ];
      const result = smoothMotionPath(vectors, 90);
      // With high smoothing, corrections should be non-trivial
      const hasNonZeroCorrection = result.some((v) => Math.abs(v.dx) > 0.1 || Math.abs(v.dy) > 0.1);
      expect(hasNonZeroCorrection).toBe(true);
    });

    it('STAB-003-03: higher smoothing → lower variance in corrected path', () => {
      // Generate shaky motion
      const vectors: MotionVector[] = [];
      for (let i = 0; i < 20; i++) {
        vectors.push({
          dx: Math.sin(i) * 10,
          dy: Math.cos(i * 1.3) * 8,
          confidence: 1,
        });
      }

      const lowSmooth = smoothMotionPath(vectors, 20);
      const highSmooth = smoothMotionPath(vectors, 80);

      // Compute cumulative path + corrections for each
      const buildCorrectedPath = (vecs: MotionVector[], corrections: MotionVector[]) => {
        const path: number[] = [];
        let cumX = 0;
        for (let i = 0; i < vecs.length; i++) {
          cumX += vecs[i]!.dx;
          path.push(cumX + corrections[i]!.dx);
        }
        return path;
      };

      const lowPath = buildCorrectedPath(vectors, lowSmooth);
      const highPath = buildCorrectedPath(vectors, highSmooth);

      const lowVariance = variance(lowPath);
      const highVariance = variance(highPath);

      // Higher smoothing should produce a smoother (lower variance) corrected path
      expect(highVariance).toBeLessThan(lowVariance);
    });

    it('STAB-003-04: constant motion path produces near-zero corrections', () => {
      // All frames move by the same amount = constant velocity
      const vectors: MotionVector[] = Array.from({ length: 10 }, () => ({
        dx: 3,
        dy: -2,
        confidence: 1,
      }));
      const result = smoothMotionPath(vectors, 50);

      // Constant motion is already smooth — corrections should be small
      // (EMA has some lag so early frames may have small corrections)
      // After convergence (last few frames), corrections should be very small
      const lastFew = result.slice(-3);
      for (const v of lastFew) {
        expect(Math.abs(v.dx)).toBeLessThan(5);
        expect(Math.abs(v.dy)).toBeLessThan(5);
      }
    });

    it('STAB-003-05: single-frame path returns zero correction', () => {
      const vectors: MotionVector[] = [{ dx: 5, dy: -3, confidence: 1 }];
      const result = smoothMotionPath(vectors, 50);
      expect(result.length).toBe(1);
      expect(result[0]!.dx).toBe(0);
      expect(result[0]!.dy).toBe(0);
    });

    it('STAB-003-06: empty input returns empty output', () => {
      const result = smoothMotionPath([], 50);
      expect(result).toEqual([]);
    });

    it('STAB-003-07: confidence values are preserved', () => {
      const vectors: MotionVector[] = [
        { dx: 1, dy: 0, confidence: 0.8 },
        { dx: 2, dy: 1, confidence: 0.3 },
        { dx: -1, dy: 2, confidence: 0.95 },
      ];
      const result = smoothMotionPath(vectors, 50);
      expect(result[0]!.confidence).toBe(0.8);
      expect(result[1]!.confidence).toBe(0.3);
      expect(result[2]!.confidence).toBe(0.95);
    });
  });

  // STAB-004: Crop removes edges
  describe('STAB-004: crop', () => {
    it('STAB-004-01: cropAmount=0 produces no black border', () => {
      const img = createTestImageData(32, 32, [128, 128, 128, 255]);
      applyStabilization(img, { dx: 0, dy: 0, cropAmount: 0 });

      // No pixel should be changed
      for (let i = 0; i < img.data.length; i += 4) {
        expect(img.data[i]).toBe(128);
        expect(img.data[i + 1]).toBe(128);
        expect(img.data[i + 2]).toBe(128);
      }
    });

    it('STAB-004-02: cropAmount=N blacks out border pixels', () => {
      const crop = 4;
      const img = createTestImageData(32, 32, [200, 200, 200, 255]);
      applyStabilization(img, { dx: 0, dy: 0, cropAmount: crop });

      // Check border pixels are black
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const idx = (y * 32 + x) * 4;
          if (x < crop || x >= 32 - crop || y < crop || y >= 32 - crop) {
            expect(img.data[idx]).toBe(0);
            expect(img.data[idx + 1]).toBe(0);
            expect(img.data[idx + 2]).toBe(0);
          }
        }
      }
    });

    it('STAB-004-03: interior pixels are NOT zeroed by crop', () => {
      const crop = 4;
      const img = createTestImageData(32, 32, [200, 200, 200, 255]);
      applyStabilization(img, { dx: 0, dy: 0, cropAmount: crop });

      // Interior pixels should remain 200
      for (let y = crop; y < 32 - crop; y++) {
        for (let x = crop; x < 32 - crop; x++) {
          const idx = (y * 32 + x) * 4;
          expect(img.data[idx]).toBe(200);
          expect(img.data[idx + 1]).toBe(200);
          expect(img.data[idx + 2]).toBe(200);
        }
      }
    });

    it('STAB-004-04: crop works with zero motion vector', () => {
      const img = createTestImageData(16, 16, [100, 150, 200, 255]);
      applyStabilization(img, { dx: 0, dy: 0, cropAmount: 2 });

      // Border should be black
      expect(img.data[0]).toBe(0); // (0,0)
      // Interior should be original
      const centerIdx = (8 * 16 + 8) * 4;
      expect(img.data[centerIdx]).toBe(100);
    });

    it('STAB-004-05: cropAmount larger than half image produces all-black', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 255]);
      applyStabilization(img, { dx: 0, dy: 0, cropAmount: 8 });

      // All pixels should be black (crop >= width/2)
      for (let i = 0; i < img.data.length; i += 4) {
        expect(img.data[i]).toBe(0);
        expect(img.data[i + 1]).toBe(0);
        expect(img.data[i + 2]).toBe(0);
      }
    });

    it('STAB-004-06: crop combined with shift', () => {
      const img = createTestImageData(32, 32, [200, 200, 200, 255]);
      applyStabilization(img, { dx: 2, dy: 2, cropAmount: 3 });

      // Border should be black
      expect(img.data[0]).toBe(0);
      // Some interior pixels should be non-zero (shifted content + crop)
      let hasNonBlack = false;
      for (let y = 3; y < 29; y++) {
        for (let x = 3; x < 29; x++) {
          const idx = (y * 32 + x) * 4;
          if (img.data[idx]! > 0) {
            hasNonBlack = true;
            break;
          }
        }
        if (hasNonBlack) break;
      }
      expect(hasNonBlack).toBe(true);
    });

    it('STAB-004-07: alpha is set to 255 in cropped region', () => {
      const img = createTestImageData(16, 16, [128, 128, 128, 200]);
      applyStabilization(img, { dx: 0, dy: 0, cropAmount: 2 });

      // Cropped border: alpha should be 255 (opaque black)
      const idx = 0; // (0,0)
      expect(img.data[idx + 3]).toBe(255);
    });
  });
});
