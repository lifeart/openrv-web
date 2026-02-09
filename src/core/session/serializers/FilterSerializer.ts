import { GTOBuilder } from 'gto-js';
import type { ObjectData } from 'gto-js';

/**
 * Gaussian blur filter settings
 */
export interface FilterGaussianSettings {
  /** Gaussian sigma (r^2/3) */
  sigma?: number;
  /** Filter radius */
  radius?: number;
}

/**
 * Unsharp mask filter settings
 */
export interface UnsharpMaskSettings {
  /** Enable effect */
  active?: boolean;
  /** Sharpening amount */
  amount?: number;
  /** Edge threshold */
  threshold?: number;
  /** Blur radius */
  unsharpRadius?: number;
}

/**
 * Noise reduction filter settings
 */
export interface NoiseReductionSettings {
  /** Enable effect */
  active?: boolean;
  /** Reduction amount */
  amount?: number;
  /** Filter radius */
  radius?: number;
  /** Noise threshold */
  threshold?: number;
}

/**
 * Clarity (local contrast) filter settings
 */
export interface ClaritySettings {
  /** Enable effect */
  active?: boolean;
  /** Clarity amount */
  amount?: number;
  /** Effect radius */
  radius?: number;
}

/**
 * Filter serialization functions for GTO export.
 * Handles all image filter node building: Gaussian blur,
 * unsharp mask, noise reduction, and clarity.
 */
export const FilterSerializer = {
  /**
   * Build an RVFilterGaussian object for Gaussian blur
   */
  buildFilterGaussianObject(name: string, settings: FilterGaussianSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVFilterGaussian', 1);
    obj.component('node')
      .float('sigma', settings.sigma ?? 0.03)
      .float('radius', settings.radius ?? 10.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVUnsharpMask object for sharpening
   */
  buildUnsharpMaskObject(name: string, settings: UnsharpMaskSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVUnsharpMask', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('amount', settings.amount ?? 1.0)
      .float('threshold', settings.threshold ?? 5.0)
      .float('unsharpRadius', settings.unsharpRadius ?? 5.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVNoiseReduction object
   */
  buildNoiseReductionObject(name: string, settings: NoiseReductionSettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVNoiseReduction', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('amount', settings.amount ?? 0.0)
      .float('radius', settings.radius ?? 0.0)
      .float('threshold', settings.threshold ?? 5.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },

  /**
   * Build an RVClarity object for local contrast enhancement
   */
  buildClarityObject(name: string, settings: ClaritySettings = {}): ObjectData {
    const builder = new GTOBuilder();

    const obj = builder.object(name, 'RVClarity', 1);
    obj.component('node')
      .int('active', settings.active !== false ? 1 : 0)
      .float('amount', settings.amount ?? 0.0)
      .float('radius', settings.radius ?? 20.0)
      .end();

    obj.end();
    return builder.build().objects[0]!;
  },
};
