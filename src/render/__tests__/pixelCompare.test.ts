import { describe, it, expect } from 'vitest';
import { computeRMSE, computePSNR, assertPixelParity } from './pixelCompare';

describe('pixelCompare', () => {
  // ─── computeRMSE ───────────────────────────────────────────────────

  it('A-13: computeRMSE returns 0 for identical arrays', () => {
    const a = new Float32Array([0.5, 0.3, 0.7, 1.0, 0.1, 0.9, 0.4, 0.6]);
    expect(computeRMSE(a, a)).toBe(0);
  });

  it('A-13b: computeRMSE returns 0 for identical Uint8Array', () => {
    const a = new Uint8Array([128, 64, 200, 255]);
    expect(computeRMSE(a, a)).toBe(0);
  });

  it('A-14: computeRMSE returns correct value for known inputs', () => {
    // [1,0,0,1] vs [0,0,0,1] → diffs = [1,0,0,0] → sum of squares = 1
    // RMSE = sqrt(1/4) = 0.5
    const a = new Float32Array([1, 0, 0, 1]);
    const b = new Float32Array([0, 0, 0, 1]);
    expect(computeRMSE(a, b)).toBe(0.5);
  });

  it('computeRMSE returns 0 for empty arrays', () => {
    const a = new Float32Array([]);
    expect(computeRMSE(a, a)).toBe(0);
  });

  it('computeRMSE throws for mismatched lengths', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(() => computeRMSE(a, b)).toThrow('Buffer length mismatch');
  });

  it('computeRMSE is symmetric', () => {
    const a = new Float32Array([1, 0.5, 0.2, 1]);
    const b = new Float32Array([0.8, 0.3, 0.4, 1]);
    expect(computeRMSE(a, b)).toBe(computeRMSE(b, a));
  });

  // ─── computePSNR ───────────────────────────────────────────────────

  it('A-15: computePSNR(0) returns Infinity', () => {
    expect(computePSNR(0)).toBe(Infinity);
  });

  it('computePSNR returns finite value for non-zero RMSE', () => {
    const psnr = computePSNR(0.01);
    expect(Number.isFinite(psnr)).toBe(true);
    expect(psnr).toBeGreaterThan(0);
  });

  it('computePSNR respects maxValue parameter', () => {
    // With maxValue=255 for uint8 data
    const psnr = computePSNR(1, 255);
    // PSNR = 20 * log10(255/1) ≈ 48.13 dB
    expect(psnr).toBe(20 * Math.log10(255));
  });

  it('computePSNR higher for lower RMSE', () => {
    const psnrLow = computePSNR(0.01);
    const psnrHigh = computePSNR(0.001);
    expect(psnrHigh).toBeGreaterThan(psnrLow);
  });

  // ─── assertPixelParity ─────────────────────────────────────────────

  it('A-16: assertPixelParity passes when RMSE below threshold', () => {
    const a = new Float32Array([0.5, 0.5, 0.5, 1.0]);
    const b = new Float32Array([0.501, 0.5, 0.5, 1.0]);
    // RMSE will be very small
    expect(() => assertPixelParity(a, b, 0.01)).not.toThrow();
  });

  it('A-16b: assertPixelParity fails when RMSE above threshold', () => {
    const a = new Float32Array([1, 0, 0, 1]);
    const b = new Float32Array([0, 0, 0, 1]);
    // RMSE = 0.5
    expect(() => assertPixelParity(a, b, 0.01)).toThrow('Pixel parity failed');
  });

  it('assertPixelParity passes for identical buffers with zero threshold', () => {
    const a = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    expect(() => assertPixelParity(a, a, 0)).not.toThrow();
  });

  it('assertPixelParity error message includes diagnostics', () => {
    const a = new Float32Array([0, 0, 0.9, 1]);
    const b = new Float32Array([0, 0, 0.1, 1]);
    try {
      assertPixelParity(a, b, 0.01);
      expect.fail('Should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('RMSE=');
      expect(msg).toContain('Max error');
      expect(msg).toContain('channel B');
    }
  });

  it('assertPixelParity throws for mismatched buffer lengths', () => {
    const a = new Float32Array([1, 0, 0, 1]);
    const b = new Float32Array([1, 0]);
    expect(() => assertPixelParity(a, b, 1.0)).toThrow('Buffer length mismatch');
  });

  it('computeRMSE with Uint8Array non-zero difference', () => {
    const a = new Uint8Array([255, 0, 0, 255]);
    const b = new Uint8Array([0, 0, 0, 255]);
    // diffs = [255, 0, 0, 0], sum of squares = 255^2 = 65025, RMSE = sqrt(65025/4)
    expect(computeRMSE(a, b)).toBeCloseTo(Math.sqrt(255 * 255 / 4), 6);
  });

  // ─── NaN handling ──────────────────────────────────────────────────

  it('computeRMSE returns NaN when input contains NaN', () => {
    const a = new Float32Array([NaN, 0, 0, 1]);
    const b = new Float32Array([0, 0, 0, 1]);
    expect(computeRMSE(a, b)).toBeNaN();
  });

  it('assertPixelParity does not silently pass when buffers contain NaN', () => {
    const a = new Float32Array([NaN, 0, 0, 1]);
    const b = new Float32Array([0, 0, 0, 1]);
    // NaN RMSE should be caught and cause failure, not silently pass
    expect(() => assertPixelParity(a, b, 1.0)).toThrow('Pixel parity failed');
  });
});
