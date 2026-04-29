/**
 * PreCacheLUTStage - Software Pre-Cache LUT stage with bit-depth reformatting
 *
 * The Pre-Cache LUT is unique in that it runs in software (CPU) at decode time,
 * before the frame enters the GPU cache. This is necessary for bit-depth conversion
 * and ensures the cached frame is already in the working color space.
 * Supports optional inMatrix/outMatrix for pre/post LUT color transformation.
 */

import { applyLUTToImageData } from '../LUTLoader';
import { applyColorMatrix } from '../LUTUtils';
import { LUTStage } from './LUTStage';
import { IPImage, type ImageMetadata } from '../../core/image/Image';
import type { PreCacheStageState } from './LUTPipelineState';

/**
 * Apply a 4x4 color matrix to every pixel in an ImageData (in-place).
 * Works in 0-1 normalized space.
 */
function applyMatrixToImageData(imageData: ImageData, matrix: Float32Array): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;

    const [outR, outG, outB] = applyColorMatrix(r, g, b, matrix);

    data[i] = Math.max(0, Math.min(255, Math.round(outR * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(outG * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(outB * 255)));
    // Alpha unchanged
  }
}

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
    const inMatrix = this.getInMatrix();
    const outMatrix = this.getOutMatrix();

    // Create a copy so we don't modify the original
    const output = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);

    if (intensity >= 1.0) {
      // Full intensity - apply directly with matrices
      if (inMatrix) applyMatrixToImageData(output, inMatrix);
      applyLUTToImageData(output, lut);
      if (outMatrix) applyMatrixToImageData(output, outMatrix);
    } else if (intensity > 0) {
      // Partial intensity - blend original with LUT result
      const lutResult = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      if (inMatrix) applyMatrixToImageData(lutResult, inMatrix);
      applyLUTToImageData(lutResult, lut);
      if (outMatrix) applyMatrixToImageData(lutResult, outMatrix);

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

  /**
   * Apply the pre-cache transform to a full {@link IPImage}, returning either
   * the input image (when the stage is bypassed) or a new IPImage that
   * preserves metadata correctly.
   *
   * **@internal — testability/future-use helper.** As of issue MED-51 the
   * production cascade flows through {@link LUTPipeline.applyToIPImage} and
   * the GPU LUT chain (see {@link LUTPipeline.computeOutputMetadata}); this
   * IPImage-shaped entry point is retained because (a) it's the cleanest
   * unit-test surface for the per-stage metadata-merge logic and (b) it's
   * the planned entry point for a future CPU-side pre-cache pipeline that
   * pre-bakes 8-bit LUTs on cached frames. Removing it would force tests
   * to construct ImageData by hand and would close off that future path.
   * Do not introduce new production callers without revisiting this comment.
   *
   * This is the IPImage-aware counterpart to {@link apply}. The non-bypass
   * return path produces a fresh IPImage whose pixel buffer is independent of
   * the input (safe to mutate). All metadata fields except color space flow
   * through unchanged (frame number, source path, pixel aspect ratio, custom
   * attributes, etc.). Color-space metadata is layered:
   *
   * - When the stage declares `outputColorPrimaries`/`outputTransferFunction`
   *   (i.e. the LUT is known to convert into a different color space), those
   *   declared values become the output IPImage's metadata.
   * - When the stage is color-space-preserving (the default), the input's
   *   `colorPrimaries`/`transferFunction` flow through unchanged.
   *
   * **Bypass semantics:** when no LUT is loaded, the stage is disabled, or
   * the intensity is zero, the input image is returned **by reference** —
   * not a clone. This is the contract: pre-cache runs at decode time on
   * potentially every frame, and a forced clone would be a waste in the
   * common "no pre-cache LUT" case. Callers therefore must not mutate the
   * returned image's pixels or metadata when bypass might be in effect.
   *
   * **Bit-depth contract:** the apply path uses an 8-bit `ImageData`
   * intermediate, so this method is restricted to `uint8` inputs. Calling
   * with `uint16` or `float32` (HDR/EXR/float-TIFF) inputs would silently
   * clamp pixels into 8-bit range while metadata claimed e.g. PQ — that
   * combination is meaningless. This method **throws** for non-`uint8`
   * inputs; callers must route HDR/float content through the GPU LUT chain
   * (where metadata propagation now happens via
   * {@link LUTPipeline.computeOutputMetadata}). The stage's `bitDepth` field
   * is also honored: when set to `'8bit'` (or `'auto'` for an 8-bit input),
   * the operation proceeds; otherwise an error is raised so callers do not
   * mistake a stage they configured for `'float'` working on an 8-bit
   * intermediate.
   */
  applyToIPImage(input: IPImage): IPImage {
    if (!this.hasLUT() || !this.isEnabled() || this.getIntensity() === 0) {
      // Bypass: no transformation, no metadata change. Return input as-is so
      // the caller can short-circuit. Returning a clone here would be wasteful
      // (precache may run on every frame) and a clone of the same metadata
      // would carry no extra information.
      return input;
    }

    if (input.dataType !== 'uint8') {
      throw new Error(
        `PreCacheLUTStage.applyToIPImage: only uint8 IPImage inputs are supported (got dataType='${input.dataType}'). ` +
          'Float/uint16 (HDR/EXR/float-TIFF) content must use the GPU LUT chain; use ' +
          'LUTPipeline.computeOutputMetadata() to propagate the cascaded output color space instead.',
      );
    }

    const declaredBitDepth = this.bitDepth;
    if (declaredBitDepth !== 'auto' && declaredBitDepth !== '8bit') {
      throw new Error(
        `PreCacheLUTStage.applyToIPImage: stage bitDepth='${declaredBitDepth}' is incompatible with the 8-bit ` +
          'CPU pre-cache path. Configure bitDepth to "auto" or "8bit", or run through the GPU LUT chain.',
      );
    }

    const inputImageData = input.toImageData();
    const outputImageData = this.apply(inputImageData);

    const metadata = this.composeOutputMetadata(input.metadata);

    const out = new IPImage({
      width: outputImageData.width,
      height: outputImageData.height,
      channels: 4,
      dataType: 'uint8',
      data: outputImageData.data.buffer.slice(0),
      metadata,
    });

    return out;
  }

  /**
   * Build the output IPImage's metadata, layering the stage's declared output
   * color space (if any) on top of the input metadata so non-color fields
   * (frame number, source path, attributes, etc.) flow through unchanged.
   *
   * Exposed for testing the metadata-merge logic in isolation.
   */
  composeOutputMetadata(inputMetadata: ImageMetadata | undefined): ImageMetadata {
    const base: ImageMetadata = inputMetadata ? { ...inputMetadata } : {};
    if (base.attributes) {
      base.attributes = { ...base.attributes };
    }

    const outputPrimaries = this.getOutputColorPrimaries();
    if (outputPrimaries !== null) {
      base.colorPrimaries = outputPrimaries;
    }

    const outputTransfer = this.getOutputTransferFunction();
    if (outputTransfer !== null) {
      base.transferFunction = outputTransfer;
    }

    return base;
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
