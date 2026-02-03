/**
 * LUT Precision Analysis Utilities
 *
 * Tools for measuring and comparing precision of LUT processing pipelines.
 * Computes error metrics (max error, mean absolute error, PSNR, etc.)
 * between reference and actual LUT output.
 */

import type { LUT3D } from './LUTLoader';
import { applyLUT3D } from './LUTLoader';
import { applyLUT3DTetrahedral } from './TetrahedralInterp';

/**
 * Result of a precision analysis comparison
 */
export interface PrecisionAnalysis {
  /** Maximum absolute error across all channels and samples */
  maxError: number;
  /** Mean absolute error across all channels and samples */
  meanAbsoluteError: number;
  /** Root mean squared error */
  rmse: number;
  /** Peak Signal-to-Noise Ratio (dB), higher is better. Infinity means perfect match */
  psnr: number;
  /** Number of samples compared */
  sampleCount: number;
  /** Per-channel max errors [R, G, B] */
  maxErrorPerChannel: [number, number, number];
  /** Per-channel mean absolute errors [R, G, B] */
  meanErrorPerChannel: [number, number, number];
}

/**
 * Compare two float buffers (RGBA interleaved Float32Array) and compute error metrics.
 * Only RGB channels are compared; alpha is ignored.
 *
 * @param reference - Reference (ground truth) buffer
 * @param actual - Actual (test) buffer
 * @param peakValue - The maximum possible value for PSNR computation (default 1.0)
 * @returns PrecisionAnalysis with all error metrics
 */
export function comparePrecision(
  reference: Float32Array,
  actual: Float32Array,
  peakValue: number = 1.0
): PrecisionAnalysis {
  if (reference.length !== actual.length) {
    throw new Error(
      `Buffer length mismatch: reference=${reference.length}, actual=${actual.length}`
    );
  }

  const pixelCount = reference.length / 4;
  let maxError = 0;
  const maxErrorPerChannel: [number, number, number] = [0, 0, 0];
  const sumErrorPerChannel: [number, number, number] = [0, 0, 0];
  let sumSquaredError = 0;
  let totalSamples = 0;

  for (let i = 0; i < reference.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const refVal = reference[i + c]!;
      const actVal = actual[i + c]!;
      const error = Math.abs(refVal - actVal);

      maxError = Math.max(maxError, error);
      maxErrorPerChannel[c] = Math.max(maxErrorPerChannel[c]!, error);
      sumErrorPerChannel[c] = sumErrorPerChannel[c]! + error;
      sumSquaredError += error * error;
      totalSamples++;
    }
  }

  const meanAbsoluteError = (sumErrorPerChannel[0] + sumErrorPerChannel[1] + sumErrorPerChannel[2]) / totalSamples;
  const rmse = Math.sqrt(sumSquaredError / totalSamples);

  const meanErrorPerChannel: [number, number, number] = [
    sumErrorPerChannel[0] / pixelCount,
    sumErrorPerChannel[1] / pixelCount,
    sumErrorPerChannel[2] / pixelCount,
  ];

  // PSNR = 20 * log10(peak / RMSE)
  const psnr = rmse === 0 ? Infinity : 20 * Math.log10(peakValue / rmse);

  return {
    maxError,
    meanAbsoluteError,
    rmse,
    psnr,
    sampleCount: pixelCount,
    maxErrorPerChannel,
    meanErrorPerChannel,
  };
}

/**
 * Measure precision of a LUT interpolation method against an analytical reference function.
 *
 * @param lut - The 3D LUT to test
 * @param referenceFunc - Analytical reference function (e.g., exact gamma curve)
 * @param method - Interpolation method to test ('trilinear' or 'tetrahedral')
 * @param numSamples - Number of sample points per axis (total = numSamples^3)
 * @returns PrecisionAnalysis
 */
export function measureLUTAccuracy(
  lut: LUT3D,
  referenceFunc: (r: number, g: number, b: number) => [number, number, number],
  method: 'trilinear' | 'tetrahedral' = 'tetrahedral',
  numSamples: number = 10
): PrecisionAnalysis {
  if (numSamples < 2) {
    throw new Error('numSamples must be at least 2');
  }
  const applyFn = method === 'tetrahedral' ? applyLUT3DTetrahedral : applyLUT3D;

  const totalPixels = numSamples * numSamples * numSamples;
  const reference = new Float32Array(totalPixels * 4);
  const actual = new Float32Array(totalPixels * 4);

  let idx = 0;
  for (let ri = 0; ri < numSamples; ri++) {
    for (let gi = 0; gi < numSamples; gi++) {
      for (let bi = 0; bi < numSamples; bi++) {
        const r = ri / (numSamples - 1);
        const g = gi / (numSamples - 1);
        const b = bi / (numSamples - 1);

        const [refR, refG, refB] = referenceFunc(r, g, b);
        reference[idx] = refR;
        reference[idx + 1] = refG;
        reference[idx + 2] = refB;
        reference[idx + 3] = 1.0;

        const [actR, actG, actB] = applyFn(lut, r, g, b);
        actual[idx] = actR;
        actual[idx + 1] = actG;
        actual[idx + 2] = actB;
        actual[idx + 3] = 1.0;

        idx += 4;
      }
    }
  }

  return comparePrecision(reference, actual);
}

/**
 * Quantize a float buffer to 8-bit precision and back to float.
 * This simulates the precision loss of an 8-bit pipeline.
 *
 * @param data - Input Float32Array (RGBA interleaved)
 * @returns New Float32Array with values rounded to 8-bit precision (1/255 steps)
 */
export function quantizeTo8Bit(data: Float32Array): Float32Array {
  const output = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    // Quantize RGB channels only
    for (let c = 0; c < 3; c++) {
      const clamped = Math.max(0, Math.min(1, data[i + c]!));
      output[i + c] = Math.round(clamped * 255) / 255;
    }
    // Preserve alpha as-is
    output[i + 3] = data[i + 3]!;
  }
  return output;
}

/**
 * Quantize a float buffer to 16-bit half-float precision.
 * Simulates the precision loss of a float16 pipeline.
 *
 * Half-float has 10 bits of mantissa, giving ~3 decimal digits of precision.
 *
 * @param data - Input Float32Array (RGBA interleaved)
 * @returns New Float32Array with values rounded to half-float precision
 */
export function quantizeToFloat16(data: Float32Array): Float32Array {
  const output = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    // Quantize RGB channels only
    for (let c = 0; c < 3; c++) {
      output[i + c] = toFloat16(data[i + c]!);
    }
    // Preserve alpha as-is
    output[i + 3] = data[i + 3]!;
  }
  return output;
}

/**
 * Convert a float32 value to float16 precision and back.
 * This loses precision equivalent to IEEE 754 half-precision.
 */
function toFloat16(value: number): number {
  // Handle special cases
  if (value === 0) return 0;
  if (!isFinite(value)) return value;

  // Use DataView for proper float16 conversion
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  // Write as float32
  view.setFloat32(0, value, true);
  const bits = view.getUint32(0, true);

  // Extract float32 components
  const sign = (bits >> 31) & 1;
  const exp = (bits >> 23) & 0xff;
  const mantissa = bits & 0x7fffff;

  // Convert to float16
  const halfSign = sign << 15;
  let halfExp: number;
  let halfMantissa: number;

  if (exp === 0) {
    // Denormalized float32 -> zero in float16
    return 0;
  } else if (exp === 0xff) {
    // Inf or NaN
    halfExp = 0x1f;
    halfMantissa = mantissa ? 0x200 : 0; // NaN preserves non-zero mantissa
  } else {
    // Normalized number
    const newExp = exp - 127 + 15;
    if (newExp >= 0x1f) {
      // Overflow -> infinity
      halfExp = 0x1f;
      halfMantissa = 0;
    } else if (newExp <= 0) {
      // Underflow -> zero or denorm
      if (newExp < -10) {
        return 0;
      }
      halfExp = 0;
      halfMantissa = (mantissa | 0x800000) >> (14 - newExp);
    } else {
      halfExp = newExp;
      halfMantissa = mantissa >> 13;
    }
  }

  const halfBits = halfSign | (halfExp << 10) | halfMantissa;

  // Convert float16 bits back to float32
  const hSign = (halfBits >> 15) & 1;
  const hExp = (halfBits >> 10) & 0x1f;
  const hMantissa = halfBits & 0x3ff;

  if (hExp === 0) {
    if (hMantissa === 0) return 0;
    // Denormalized
    let m = hMantissa;
    let e = -14;
    while ((m & 0x400) === 0) {
      m <<= 1;
      e--;
    }
    m &= 0x3ff;
    const f32Exp = e + 127;
    const f32Mantissa = m << 13;
    const f32Bits = (hSign << 31) | (f32Exp << 23) | f32Mantissa;
    view.setUint32(0, f32Bits, true);
    return view.getFloat32(0, true);
  } else if (hExp === 0x1f) {
    return hMantissa === 0 ? (hSign ? -Infinity : Infinity) : NaN;
  } else {
    const f32Exp = hExp - 15 + 127;
    const f32Mantissa = hMantissa << 13;
    const f32Bits = (hSign << 31) | (f32Exp << 23) | f32Mantissa;
    view.setUint32(0, f32Bits, true);
    return view.getFloat32(0, true);
  }
}

/**
 * Measure the precision loss from quantization at different bit depths.
 *
 * @param data - Original Float32Array data (RGBA interleaved)
 * @returns Object with precision analysis for 8-bit, 16-bit, and 32-bit
 */
export function measureQuantizationLoss(data: Float32Array): {
  uint8: PrecisionAnalysis;
  float16: PrecisionAnalysis;
  float32: PrecisionAnalysis;
} {
  const q8 = quantizeTo8Bit(data);
  const q16 = quantizeToFloat16(data);

  return {
    uint8: comparePrecision(data, q8),
    float16: comparePrecision(data, q16),
    float32: {
      maxError: 0,
      meanAbsoluteError: 0,
      rmse: 0,
      psnr: Infinity,
      sampleCount: data.length / 4,
      maxErrorPerChannel: [0, 0, 0],
      meanErrorPerChannel: [0, 0, 0],
    },
  };
}

/**
 * Generate a test gradient buffer (RGBA Float32Array) for precision testing.
 * Values range from 0 to 1 in a smooth gradient.
 *
 * @param width - Image width
 * @param height - Image height
 * @returns Float32Array with RGBA gradient data
 */
export function generateTestGradient(width: number, height: number): Float32Array {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = width > 1 ? x / (width - 1) : 0;     // R: horizontal gradient
      data[i + 1] = height > 1 ? y / (height - 1) : 0; // G: vertical gradient
      data[i + 2] = 0.5;              // B: constant
      data[i + 3] = 1.0;              // A: opaque
    }
  }
  return data;
}

/**
 * Generate an HDR test buffer with values exceeding 1.0.
 * Useful for testing float precision preservation.
 *
 * @param width - Image width
 * @param height - Image height
 * @param maxValue - Maximum value in the gradient (default 5.0)
 * @returns Float32Array with RGBA HDR gradient data
 */
export function generateHDRTestGradient(
  width: number,
  height: number,
  maxValue: number = 5.0
): Float32Array {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (width > 1 ? x / (width - 1) : 0) * maxValue;     // R: 0 to maxValue
      data[i + 1] = (height > 1 ? y / (height - 1) : 0) * maxValue; // G: 0 to maxValue
      data[i + 2] = maxValue * 0.5;                 // B: constant at midpoint
      data[i + 3] = 1.0;                            // A: opaque
    }
  }
  return data;
}
