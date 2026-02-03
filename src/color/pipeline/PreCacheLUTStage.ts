/**
 * PreCacheLUTStage - Software Pre-Cache LUT stage with bit-depth reformatting
 *
 * The Pre-Cache LUT is unique in that it runs in software (CPU) at decode time,
 * before the frame enters the GPU cache. This is necessary for bit-depth conversion
 * and ensures the cached frame is already in the working color space.
 */

import type { LUT } from '../LUTLoader';
import { applyLUTToImageData } from '../LUTLoader';
import { LUTStage } from './LUTStage';
import type { PreCacheStageState } from './LUTPipelineState';

export class PreCacheLUTStage extends LUTStage {
  private bitDepth: 'auto' | '8bit' | '16bit' | 'float' = 'auto';

  /** Get the current bit-depth reformatting mode */
  getBitDepth(): 'auto' | '8bit' | '16bit' | 'float' {
    return this.bitDepth;
  }

  /** Set the bit-depth reformatting mode */
  setBitDepth(bitDepth: 'auto' | '8bit' | '16bit' | 'float'): void {
    this.bitDepth = bitDepth;
  }

  /**
   * Apply the pre-cache transform to decoded frame data.
   * Called once per frame at decode time, result is cached.
   * Returns a new ImageData (does not modify the original).
   */
  apply(imageData: ImageData): ImageData {
    if (!this.hasLUT() || !this.isEnabled()) {
      return imageData;
    }

    const lut = this.getLUTData()!;
    const intensity = this.getIntensity();

    // Create a copy so we don't modify the original
    const output = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );

    if (intensity >= 1.0) {
      // Full intensity - apply directly
      applyLUTToImageData(output, lut);
    } else if (intensity > 0) {
      // Partial intensity - blend original with LUT result
      const lutResult = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );
      applyLUTToImageData(lutResult, lut);

      // Blend
      const data = output.data;
      const lutData = lutResult.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(data[i]! * (1 - intensity) + lutData[i]! * intensity);
        data[i + 1] = Math.round(data[i + 1]! * (1 - intensity) + lutData[i + 1]! * intensity);
        data[i + 2] = Math.round(data[i + 2]! * (1 - intensity) + lutData[i + 2]! * intensity);
        // Alpha unchanged
      }
    }
    // If intensity === 0, return the unmodified copy

    return output;
  }

  /** Get a serializable snapshot including bit-depth */
  override getState(): PreCacheStageState {
    return {
      ...super.getState(),
      bitDepth: this.bitDepth,
    };
  }

  /** Reset to defaults including bit-depth */
  override reset(): void {
    super.reset();
    this.bitDepth = 'auto';
  }
}
