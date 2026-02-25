/**
 * CacheLUTNode - Pre-bakes color pipeline into a 3D LUT for faster playback
 *
 * Takes input color transform parameters (exposure, contrast, saturation, etc.)
 * and generates a 3D LUT that represents the combined transform. The LUT is
 * cached and reused until the parameters change, avoiding per-pixel computation
 * during playback.
 *
 * LUT sizes: 33^3 (standard) or 65^3 (high quality)
 */

import { IPNode } from './base/IPNode';
import { RegisterNode } from './base/NodeFactory';
import { IPImage } from '../core/image/Image';
import type { EvalContext } from '../core/graph/Graph';

/**
 * Color transform parameters that the LUT bakes in.
 */
export interface ColorTransformParams {
  exposure: number;
  contrast: number;
  saturation: number;
  brightness: number;
  gamma: number;
  temperature: number;
  tint: number;
}

/**
 * 3D LUT data structure for the cached transform.
 */
export interface CachedLUT3D {
  /** The number of samples along each axis (e.g. 33 or 65) */
  size: number;
  /** Flat Float32Array of RGB triplets, indexed as data[(r*size*size + g*size + b) * 3 + channel] */
  data: Float32Array;
}

/** Default transform params - identity transform */
export const DEFAULT_TRANSFORM_PARAMS: ColorTransformParams = {
  exposure: 0,
  contrast: 1,
  saturation: 1,
  brightness: 0,
  gamma: 1,
  temperature: 0,
  tint: 0,
};

/**
 * Apply exposure adjustment: multiply by 2^exposure
 */
function applyExposure(value: number, exposure: number): number {
  return value * Math.pow(2, exposure);
}

/**
 * Apply brightness: simple offset
 */
function applyBrightness(value: number, brightness: number): number {
  return value + brightness;
}

/**
 * Apply contrast: scale around 0.5 midpoint
 */
function applyContrast(value: number, contrast: number): number {
  return (value - 0.5) * contrast + 0.5;
}

/**
 * Apply gamma correction
 */
function applyGamma(value: number, gamma: number): number {
  if (value <= 0) return 0;
  return Math.pow(value, 1.0 / gamma);
}

/**
 * Apply color temperature and tint adjustment.
 * Temperature shifts blue-yellow axis; tint shifts green-magenta.
 * Operates on individual R, G, B channels.
 */
function applyTemperatureTint(
  r: number, g: number, b: number,
  temperature: number, tint: number
): [number, number, number] {
  // Temperature: positive = warmer (more red/yellow), negative = cooler (more blue)
  const tempScale = temperature * 0.1;
  r = r + tempScale;
  b = b - tempScale;

  // Tint: positive = more green, negative = more magenta
  const tintScale = tint * 0.1;
  g = g + tintScale;

  return [r, g, b];
}

/**
 * Apply saturation adjustment around luminance.
 */
function applySaturation(
  r: number, g: number, b: number,
  saturation: number
): [number, number, number] {
  // Rec. 709 luminance weights
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = luma + (r - luma) * saturation;
  g = luma + (g - luma) * saturation;
  b = luma + (b - luma) * saturation;
  return [r, g, b];
}

/**
 * Apply the full color transform pipeline to an RGB triplet.
 */
export function applyColorTransform(
  r: number, g: number, b: number,
  params: ColorTransformParams
): [number, number, number] {
  // 1. Exposure
  r = applyExposure(r, params.exposure);
  g = applyExposure(g, params.exposure);
  b = applyExposure(b, params.exposure);

  // 2. Temperature/Tint
  [r, g, b] = applyTemperatureTint(r, g, b, params.temperature, params.tint);

  // 3. Brightness
  r = applyBrightness(r, params.brightness);
  g = applyBrightness(g, params.brightness);
  b = applyBrightness(b, params.brightness);

  // 4. Contrast
  r = applyContrast(r, params.contrast);
  g = applyContrast(g, params.contrast);
  b = applyContrast(b, params.contrast);

  // 5. Saturation
  [r, g, b] = applySaturation(r, g, b, params.saturation);

  // 6. Gamma
  r = applyGamma(r, params.gamma);
  g = applyGamma(g, params.gamma);
  b = applyGamma(b, params.gamma);

  return [r, g, b];
}

/**
 * Generate a 3D LUT that bakes the color transform.
 *
 * @param size - Number of samples per axis (typically 33 or 65)
 * @param params - Color transform parameters to bake in
 * @returns The generated 3D LUT
 */
export function generateLUT3D(size: number, params: ColorTransformParams): CachedLUT3D {
  if (size < 2) {
    throw new RangeError(`LUT size must be >= 2, got ${size}`);
  }
  const totalEntries = size * size * size;
  const data = new Float32Array(totalEntries * 3);

  for (let ri = 0; ri < size; ri++) {
    const r = ri / (size - 1);
    for (let gi = 0; gi < size; gi++) {
      const g = gi / (size - 1);
      for (let bi = 0; bi < size; bi++) {
        const b = bi / (size - 1);

        const [outR, outG, outB] = applyColorTransform(r, g, b, params);

        const idx = (ri * size * size + gi * size + bi) * 3;
        data[idx] = outR;
        data[idx + 1] = outG;
        data[idx + 2] = outB;
      }
    }
  }

  return { size, data };
}

/**
 * Look up and trilinearly interpolate a value from a 3D LUT.
 */
export function lookupLUT3D(
  r: number, g: number, b: number,
  lut: CachedLUT3D
): [number, number, number] {
  const { size, data } = lut;
  const maxIdx = size - 1;

  // Scale to LUT index space
  const rScaled = Math.max(0, Math.min(maxIdx, r * maxIdx));
  const gScaled = Math.max(0, Math.min(maxIdx, g * maxIdx));
  const bScaled = Math.max(0, Math.min(maxIdx, b * maxIdx));

  // Integer indices
  const r0 = Math.floor(rScaled);
  const g0 = Math.floor(gScaled);
  const b0 = Math.floor(bScaled);
  const r1 = Math.min(r0 + 1, maxIdx);
  const g1 = Math.min(g0 + 1, maxIdx);
  const b1 = Math.min(b0 + 1, maxIdx);

  // Fractional parts
  const rFrac = rScaled - r0;
  const gFrac = gScaled - g0;
  const bFrac = bScaled - b0;

  // Helper to get LUT value
  const getValue = (ri: number, gi: number, bi: number, ch: number): number => {
    return data[(ri * size * size + gi * size + bi) * 3 + ch] as number;
  };

  // Trilinear interpolation for each channel
  const result: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const c000 = getValue(r0, g0, b0, ch);
    const c001 = getValue(r0, g0, b1, ch);
    const c010 = getValue(r0, g1, b0, ch);
    const c011 = getValue(r0, g1, b1, ch);
    const c100 = getValue(r1, g0, b0, ch);
    const c101 = getValue(r1, g0, b1, ch);
    const c110 = getValue(r1, g1, b0, ch);
    const c111 = getValue(r1, g1, b1, ch);

    // Interpolate along B axis
    const c00 = c000 + (c001 - c000) * bFrac;
    const c01 = c010 + (c011 - c010) * bFrac;
    const c10 = c100 + (c101 - c100) * bFrac;
    const c11 = c110 + (c111 - c110) * bFrac;

    // Interpolate along G axis
    const c0 = c00 + (c01 - c00) * gFrac;
    const c1 = c10 + (c11 - c10) * gFrac;

    // Interpolate along R axis
    result[ch] = c0 + (c1 - c0) * rFrac;
  }

  return result;
}

@RegisterNode('CacheLUT')
export class CacheLUTNode extends IPNode {
  private cachedLUT: CachedLUT3D | null = null;
  private cachedParamsHash: string = '';

  constructor(name?: string) {
    super('CacheLUT', name ?? 'CacheLUT');

    // Color transform parameters
    this.properties.add({ name: 'exposure', defaultValue: 0, min: -10, max: 10, step: 0.1 });
    this.properties.add({ name: 'contrast', defaultValue: 1, min: 0, max: 4, step: 0.01 });
    this.properties.add({ name: 'saturation', defaultValue: 1, min: 0, max: 4, step: 0.01 });
    this.properties.add({ name: 'brightness', defaultValue: 0, min: -1, max: 1, step: 0.01 });
    this.properties.add({ name: 'gamma', defaultValue: 1, min: 0.1, max: 4, step: 0.01 });
    this.properties.add({ name: 'temperature', defaultValue: 0, min: -1, max: 1, step: 0.01 });
    this.properties.add({ name: 'tint', defaultValue: 0, min: -1, max: 1, step: 0.01 });

    // LUT configuration
    this.properties.add({ name: 'lutSize', defaultValue: 33, min: 2, max: 129 });
    this.properties.add({ name: 'enabled', defaultValue: true });
  }

  /**
   * Get current transform parameters from properties.
   */
  getTransformParams(): ColorTransformParams {
    return {
      exposure: this.properties.getValue('exposure') as number,
      contrast: this.properties.getValue('contrast') as number,
      saturation: this.properties.getValue('saturation') as number,
      brightness: this.properties.getValue('brightness') as number,
      gamma: this.properties.getValue('gamma') as number,
      temperature: this.properties.getValue('temperature') as number,
      tint: this.properties.getValue('tint') as number,
    };
  }

  /**
   * Compute a hash of the current parameters for cache invalidation.
   */
  private computeParamsHash(): string {
    const params = this.getTransformParams();
    const size = this.properties.getValue('lutSize') as number;
    return JSON.stringify({ ...params, size });
  }

  /**
   * Check if the LUT is currently valid (parameters haven't changed).
   */
  isLUTValid(): boolean {
    return this.cachedLUT !== null && this.cachedParamsHash === this.computeParamsHash();
  }

  /**
   * Get the cached LUT, generating it if needed.
   */
  getLUT(): CachedLUT3D {
    const currentHash = this.computeParamsHash();

    if (this.cachedLUT !== null && this.cachedParamsHash === currentHash) {
      return this.cachedLUT;
    }

    // Generate new LUT
    const params = this.getTransformParams();
    const size = this.properties.getValue('lutSize') as number;
    this.cachedLUT = generateLUT3D(size, params);
    this.cachedParamsHash = currentHash;

    return this.cachedLUT;
  }

  /**
   * Force LUT regeneration on next access.
   */
  invalidateLUT(): void {
    this.cachedLUT = null;
    this.cachedParamsHash = '';
    this.markDirty();
  }

  /**
   * Check if the LUT represents an identity transform (no-op).
   */
  isIdentityTransform(): boolean {
    const params = this.getTransformParams();
    return (
      params.exposure === 0 &&
      params.contrast === 1 &&
      params.saturation === 1 &&
      params.brightness === 0 &&
      params.gamma === 1 &&
      params.temperature === 0 &&
      params.tint === 0
    );
  }

  protected process(_context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    const input = inputs[0];
    if (!input) return null;

    const enabled = this.properties.getValue('enabled') as boolean;
    if (!enabled || this.isIdentityTransform()) {
      return input;
    }

    // Get or generate the LUT
    const lut = this.getLUT();

    // Apply the LUT to the input image
    const output = input.deepClone();
    const data = output.getTypedArray();
    const channels = output.channels;
    const pixelCount = output.width * output.height;

    // Normalize factor based on data type
    let maxVal: number;
    switch (output.dataType) {
      case 'uint8': maxVal = 255; break;
      case 'uint16': maxVal = 65535; break;
      case 'float32': default: maxVal = 1; break;
    }

    for (let i = 0; i < pixelCount; i++) {
      const idx = i * channels;
      const r = (data[idx] ?? 0) / maxVal;
      const g = (data[idx + 1] ?? 0) / maxVal;
      const b = (data[idx + 2] ?? 0) / maxVal;

      const [outR, outG, outB] = lookupLUT3D(r, g, b, lut);

      data[idx] = outR * maxVal;
      data[idx + 1] = outG * maxVal;
      data[idx + 2] = outB * maxVal;
      // Alpha channel (if present) is left unchanged
    }

    return output;
  }

  override dispose(): void {
    this.cachedLUT = null;
    this.cachedParamsHash = '';
    super.dispose();
  }
}
