/**
 * StackGroupNode - Stacks/composites multiple inputs
 *
 * Supports various blend modes and wipe effects between layers.
 * Each input can have its own blend mode and opacity.
 *
 * Multi-layer compositing:
 * All visible inputs are composited bottom-to-top using per-layer blend modes
 * and opacities, matching OpenRV's StackIPNode.collapseInputs() behavior.
 *
 * In wipe mode, the wipe position controls spatial reveal between the first
 * input and the composited result of all remaining inputs.
 *
 * Composite types (from RV spec):
 * - 'replace': Top layer replaces bottom (default)
 * - 'over': Standard alpha compositing (Porter-Duff over)
 * - 'add': Additive blending
 * - 'difference': Absolute difference
 * - 'dissolve': Cross-dissolve based on opacity
 * - Custom blend modes via per-layer settings
 */

import { BaseGroupNode } from './BaseGroupNode';
import { RegisterNode } from '../base/NodeFactory';
import { IPImage } from '../../core/image/Image';
import type { EvalContext } from '../../core/graph/Graph';
import type { BlendMode } from '../../composite/BlendModes';
import {
  compositeImageData,
  stackCompositeToBlendMode,
} from '../../composite/BlendModes';
import type { StencilBox } from '../../core/types/wipe';
import { DEFAULT_STENCIL_BOX } from '../../core/types/wipe';

/**
 * Per-layer compositing settings
 */
export interface LayerCompositeSettings {
  /** Blend mode for this layer */
  blendMode: BlendMode;
  /** Opacity (0-1) for this layer */
  opacity: number;
  /** Whether this layer is visible */
  visible: boolean;
}

/**
 * Stack composite types as defined in RV spec.
 *
 * OpenRV compatibility (IPImage.h BlendMode enum + getBlendModeFromString):
 * - 'replace':  IPImage::Replace — glDisable(GL_BLEND), last write wins
 * - 'over':     IPImage::Over — premultiplied alpha over (GL_ONE, GL_ONE_MINUS_SRC_ALPHA)
 * - 'add':      IPImage::Add — additive (GL_ONE, GL_ONE)
 * - 'difference': IPImage::Difference — GL_FUNC_SUBTRACT
 * - '-difference': IPImage::ReverseDifference — GL_FUNC_REVERSE_SUBTRACT
 * - 'dissolve': IPImage::Dissolve — per-pixel random noise selection (InlineDissolve2.glsl)
 * - 'topmost':  Maps to IPImage::Replace + topmostOnly flag (only first input evaluated)
 *
 * Note: OpenRV has no explicit 'minus' type; '-difference' is the closest equivalent.
 * The 'layer' type is deprecated: OpenRV StackIPNode converts 'layer' to 'topmost' on init.
 */
export type StackCompositeType =
  | 'replace'       // Top replaces bottom (OpenRV: IPImage::Replace)
  | 'over'          // Porter-Duff over (OpenRV: premultiplied alpha)
  | 'add'           // Additive (OpenRV: IPImage::Add)
  | 'difference'    // Absolute difference (OpenRV: IPImage::Difference)
  | '-difference'   // Reverse difference (OpenRV: IPImage::ReverseDifference)
  | 'dissolve'      // Cross-dissolve (OpenRV: per-pixel noise, InlineDissolve2.glsl)
  | 'minus'         // Subtractive (web extension, maps to ReverseDifference behavior)
  | 'topmost'       // Show topmost non-transparent (OpenRV: Replace + topmostOnly)
  | string;         // Allow custom types

@RegisterNode('RVStackGroup')
export class StackGroupNode extends BaseGroupNode {
  constructor(name?: string) {
    super('RVStackGroup', name ?? 'Stack');

    // Global composite mode for the stack
    this.properties.add({ name: 'composite', defaultValue: 'replace' });
    this.properties.add({ name: 'mode', defaultValue: 'wipe' });

    // Wipe control properties
    this.properties.add({ name: 'wipeX', defaultValue: 0.5 });
    this.properties.add({ name: 'wipeY', defaultValue: 0.5 });

    // Per-layer blend modes (array indexed by input)
    this.properties.add({ name: 'layerBlendModes', defaultValue: [] });
    // Per-layer opacities (array indexed by input)
    this.properties.add({ name: 'layerOpacities', defaultValue: [] });
    // Per-layer visibility (array indexed by input)
    this.properties.add({ name: 'layerVisible', defaultValue: [] });
    // Per-layer stencil boxes (array of StencilBox indexed by input)
    this.properties.add({ name: 'layerStencilBoxes', defaultValue: [] });

    // Output configuration
    this.properties.add({ name: 'chosenAudioInput', defaultValue: 0 });
    this.properties.add({ name: 'outOfRangePolicy', defaultValue: 'hold' });

    // Mode flags
    this.properties.add({ name: 'alignStartFrames', defaultValue: false });
    this.properties.add({ name: 'strictFrameRanges', defaultValue: false });
  }

  /**
   * Get composite settings for a specific layer
   */
  getLayerSettings(layerIndex: number): LayerCompositeSettings {
    const blendModes = this.properties.getValue('layerBlendModes') as BlendMode[];
    const opacities = this.properties.getValue('layerOpacities') as number[];
    const visible = this.properties.getValue('layerVisible') as boolean[];

    return {
      blendMode: blendModes[layerIndex] ?? 'normal',
      opacity: opacities[layerIndex] ?? 1.0,
      visible: visible[layerIndex] ?? true,
    };
  }

  /**
   * Set composite settings for a specific layer
   */
  setLayerSettings(layerIndex: number, settings: Partial<LayerCompositeSettings>): void {
    if (settings.blendMode !== undefined) {
      const blendModes = [...(this.properties.getValue('layerBlendModes') as BlendMode[])];
      blendModes[layerIndex] = settings.blendMode;
      this.properties.setValue('layerBlendModes', blendModes);
    }

    if (settings.opacity !== undefined) {
      const opacities = [...(this.properties.getValue('layerOpacities') as number[])];
      opacities[layerIndex] = Math.max(0, Math.min(1, settings.opacity));
      this.properties.setValue('layerOpacities', opacities);
    }

    if (settings.visible !== undefined) {
      const visible = [...(this.properties.getValue('layerVisible') as boolean[])];
      visible[layerIndex] = settings.visible;
      this.properties.setValue('layerVisible', visible);
    }

    this.markDirty();
  }

  /**
   * Get all layer settings as an array
   */
  getAllLayerSettings(): LayerCompositeSettings[] {
    const settings: LayerCompositeSettings[] = [];
    for (let i = 0; i < this.inputs.length; i++) {
      settings.push(this.getLayerSettings(i));
    }
    return settings;
  }

  /**
   * Set blend modes for all layers from an array
   */
  setLayerBlendModes(modes: BlendMode[]): void {
    this.properties.setValue('layerBlendModes', modes);
    this.markDirty();
  }

  /**
   * Set opacities for all layers from an array
   */
  setLayerOpacities(opacities: number[]): void {
    this.properties.setValue('layerOpacities', opacities.map(o => Math.max(0, Math.min(1, o))));
    this.markDirty();
  }

  /**
   * Get the global composite type
   */
  getCompositeType(): StackCompositeType {
    return this.properties.getValue('composite') as StackCompositeType;
  }

  /**
   * Set the global composite type
   */
  setCompositeType(type: StackCompositeType): void {
    this.properties.setValue('composite', type);
    this.markDirty();
  }

  getActiveInputIndex(_context: EvalContext): number {
    const mode = this.properties.getValue('mode') as string;
    const wipeX = this.properties.getValue('wipeX') as number;

    if (mode === 'wipe' && this.inputs.length >= 2) {
      // Simple horizontal wipe: select based on wipe position
      return wipeX < 0.5 ? 0 : 1;
    }

    return 0;
  }

  /**
   * Override BaseGroupNode.process() to composite ALL input layers
   * instead of just selecting one based on getActiveInputIndex().
   *
   * Compositing order: layers are composited bottom-to-top (index 0 is bottom).
   * Per-layer blend modes, opacities, and visibility are respected.
   * The global composite type provides the default blend mode when no per-layer
   * blend mode is configured.
   *
   * In wipe mode with 2+ inputs, the wipe position controls spatial reveal
   * between input[0] (left side) and the composited result of all remaining
   * inputs (right side).
   */
  protected override process(context: EvalContext, inputs: (IPImage | null)[]): IPImage | null {
    // Filter to non-null inputs, preserving original indices for layer settings lookup
    const validEntries: { image: IPImage; originalIndex: number }[] = [];
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i] !== null) {
        validEntries.push({ image: inputs[i]!, originalIndex: i });
      }
    }
    if (validEntries.length === 0) {
      return null;
    }

    // Single input: return as-is (no compositing needed)
    if (validEntries.length === 1) {
      return validEntries[0]!.image;
    }

    const mode = this.properties.getValue('mode') as string;

    if (mode === 'wipe') {
      return this.processWipe(context, validEntries);
    }

    // Non-wipe: composite all layers
    return this.compositeLayers(validEntries);
  }

  /**
   * Composite all input layers bottom-to-top using per-layer settings.
   * Returns a new IPImage with the composited result.
   *
   * Note: This performs CPU-side per-pixel compositing. For large images
   * (e.g., 1920x1080 with 3+ layers), this may be slow for real-time playback.
   * GPU-accelerated compositing would be needed for production performance.
   *
   * @param entries - Array of {image, originalIndex} tuples preserving the original
   *   input indices for correct layer settings lookup when null inputs are filtered.
   */
  compositeLayers(entries: { image: IPImage; originalIndex: number }[]): IPImage | null {
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0]!.image;

    // Use the dimensions of the first (bottom) input as the output size
    const baseEntry = entries[0]!;
    const width = baseEntry.image.width;
    const height = baseEntry.image.height;

    // Convert the bottom layer to ImageData (our compositing canvas)
    const baseSettings = this.getLayerSettings(baseEntry.originalIndex);
    let result = StackGroupNode.ipImageToImageData(baseEntry.image, width, height);

    // Apply base layer opacity if not fully opaque
    if (baseSettings.visible && baseSettings.opacity < 1) {
      result = StackGroupNode.applyOpacityToImageData(result, baseSettings.opacity);
    } else if (!baseSettings.visible) {
      // Base layer invisible: start with transparent
      result = new ImageData(width, height);
    }

    // Get the global composite type for default blend mode
    const globalBlendMode = stackCompositeToBlendMode(this.getCompositeType());

    // Composite each subsequent layer on top
    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i]!;
      const layerSettings = this.getLayerSettings(entry.originalIndex);

      // Skip invisible layers or zero-opacity layers
      if (!layerSettings.visible || layerSettings.opacity === 0) {
        continue;
      }

      const layerData = StackGroupNode.ipImageToImageData(entry.image, width, height);

      // Use per-layer blend mode if set, otherwise fall back to global
      const blendMode: BlendMode = layerSettings.blendMode !== 'normal'
        ? layerSettings.blendMode
        : globalBlendMode;

      result = compositeImageData(result, layerData, blendMode, layerSettings.opacity);
    }

    // Convert back to IPImage
    return StackGroupNode.imageDataToIPImage(result);
  }

  /**
   * Process wipe mode: spatial reveal between input[0] and composited remaining inputs.
   * Left of the wipe line shows input[0], right shows the composited stack of inputs[1..n].
   */
  private processWipe(_context: EvalContext, entries: { image: IPImage; originalIndex: number }[]): IPImage | null {
    if (entries.length < 2) {
      return entries[0]?.image ?? null;
    }

    const wipeX = this.properties.getValue('wipeX') as number;
    const baseImage = entries[0]!.image;
    const width = baseImage.width;
    const height = baseImage.height;

    // Composite all layers after the first (inputs[1..n])
    let rightImage: IPImage;
    if (entries.length === 2) {
      rightImage = entries[1]!.image;
    } else {
      // Composite the right-side entries (indices 1..n)
      const composited = this.compositeLayers(entries.slice(1));
      rightImage = composited ?? entries[1]!.image;
    }

    // Convert both sides to ImageData
    const leftData = StackGroupNode.ipImageToImageData(baseImage, width, height);
    const rightData = StackGroupNode.ipImageToImageData(rightImage, width, height);

    // Create output by spatial wipe
    const output = new ImageData(width, height);
    const wipePixelX = Math.round(wipeX * width);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const source = x < wipePixelX ? leftData : rightData;
        output.data[idx] = source.data[idx]!;
        output.data[idx + 1] = source.data[idx + 1]!;
        output.data[idx + 2] = source.data[idx + 2]!;
        output.data[idx + 3] = source.data[idx + 3]!;
      }
    }

    return StackGroupNode.imageDataToIPImage(output);
  }

  /**
   * Convert an IPImage to ImageData for compositing.
   * Handles different data types (uint8, uint16, float32) and channel counts.
   * Output is always RGBA uint8 ImageData resized to target dimensions.
   */
  static ipImageToImageData(image: IPImage, targetWidth: number, targetHeight: number): ImageData {
    const srcArr = image.getTypedArray();
    const srcW = image.width;
    const srcH = image.height;
    const channels = image.channels;

    // Create ImageData at source dimensions first
    const srcImageData = new ImageData(srcW, srcH);

    // Determine normalization factor based on data type
    let normalize: (v: number) => number;
    switch (image.dataType) {
      case 'uint8':
        normalize = (v: number) => v;
        break;
      case 'uint16':
        normalize = (v: number) => Math.round((v / 65535) * 255);
        break;
      case 'float32':
        normalize = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
        break;
      default:
        // Fallback: treat unknown types as uint8
        normalize = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
        break;
    }

    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const srcIdx = (y * srcW + x) * channels;
        const dstIdx = (y * srcW + x) * 4;

        if (channels >= 3) {
          srcImageData.data[dstIdx] = normalize(srcArr[srcIdx]!);
          srcImageData.data[dstIdx + 1] = normalize(srcArr[srcIdx + 1]!);
          srcImageData.data[dstIdx + 2] = normalize(srcArr[srcIdx + 2]!);
          srcImageData.data[dstIdx + 3] = channels >= 4 ? normalize(srcArr[srcIdx + 3]!) : 255;
        } else if (channels === 1) {
          // Grayscale
          const v = normalize(srcArr[srcIdx]!);
          srcImageData.data[dstIdx] = v;
          srcImageData.data[dstIdx + 1] = v;
          srcImageData.data[dstIdx + 2] = v;
          srcImageData.data[dstIdx + 3] = 255;
        } else {
          // 2 channels: treat as grayscale + alpha
          srcImageData.data[dstIdx] = normalize(srcArr[srcIdx]!);
          srcImageData.data[dstIdx + 1] = normalize(srcArr[srcIdx]!);
          srcImageData.data[dstIdx + 2] = normalize(srcArr[srcIdx]!);
          srcImageData.data[dstIdx + 3] = normalize(srcArr[srcIdx + 1]!);
        }
      }
    }

    // If dimensions match, return as-is
    if (srcW === targetWidth && srcH === targetHeight) {
      return srcImageData;
    }

    // Resize using nearest-neighbor (simple and fast for compositing)
    const result = new ImageData(targetWidth, targetHeight);
    const xRatio = srcW / targetWidth;
    const yRatio = srcH / targetHeight;

    for (let dy = 0; dy < targetHeight; dy++) {
      const sy = Math.min(Math.floor(dy * yRatio), srcH - 1);
      for (let dx = 0; dx < targetWidth; dx++) {
        const sx = Math.min(Math.floor(dx * xRatio), srcW - 1);
        const srcIdx = (sy * srcW + sx) * 4;
        const dstIdx = (dy * targetWidth + dx) * 4;
        result.data[dstIdx] = srcImageData.data[srcIdx]!;
        result.data[dstIdx + 1] = srcImageData.data[srcIdx + 1]!;
        result.data[dstIdx + 2] = srcImageData.data[srcIdx + 2]!;
        result.data[dstIdx + 3] = srcImageData.data[srcIdx + 3]!;
      }
    }

    return result;
  }

  /**
   * Convert an ImageData back to an IPImage (RGBA uint8).
   */
  static imageDataToIPImage(imageData: ImageData): IPImage {
    return new IPImage({
      width: imageData.width,
      height: imageData.height,
      channels: 4,
      dataType: 'uint8',
      data: imageData.data.buffer.slice(0),
    });
  }

  /**
   * Apply an opacity multiplier to all pixels in an ImageData.
   */
  private static applyOpacityToImageData(imageData: ImageData, opacity: number): ImageData {
    const result = new ImageData(imageData.width, imageData.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      result.data[i] = imageData.data[i]!;
      result.data[i + 1] = imageData.data[i + 1]!;
      result.data[i + 2] = imageData.data[i + 2]!;
      result.data[i + 3] = Math.round(imageData.data[i + 3]! * opacity);
    }
    return result;
  }

  /**
   * Get wipe position (0-1)
   */
  getWipePosition(): { x: number; y: number } {
    return {
      x: this.properties.getValue('wipeX') as number,
      y: this.properties.getValue('wipeY') as number,
    };
  }

  /**
   * Set wipe position
   */
  setWipePosition(x: number, y?: number): void {
    this.properties.setValue('wipeX', Math.max(0, Math.min(1, x)));
    if (y !== undefined) {
      this.properties.setValue('wipeY', Math.max(0, Math.min(1, y)));
    }
    this.markDirty();
  }

  /**
   * Get the stencil box for a specific layer.
   * Returns [xMin, xMax, yMin, yMax] in normalized 0-1 range.
   */
  getLayerStencilBox(layerIndex: number): StencilBox {
    const boxes = this.properties.getValue('layerStencilBoxes') as StencilBox[];
    return boxes[layerIndex] ?? [...DEFAULT_STENCIL_BOX];
  }

  /**
   * Set the stencil box for a specific layer.
   * Values are clamped to [0, 1] and min < max is enforced.
   */
  setLayerStencilBox(layerIndex: number, box: StencilBox): void {
    const boxes = [...(this.properties.getValue('layerStencilBoxes') as StencilBox[])];
    const clamped: StencilBox = [
      Math.max(0, Math.min(1, box[0])),
      Math.max(0, Math.min(1, box[1])),
      Math.max(0, Math.min(1, box[2])),
      Math.max(0, Math.min(1, box[3])),
    ];
    // Enforce min < max
    if (clamped[0] > clamped[1]) clamped[1] = Math.min(1, clamped[0] + 0.001);
    if (clamped[2] > clamped[3]) clamped[3] = Math.min(1, clamped[2] + 0.001);
    boxes[layerIndex] = clamped;
    this.properties.setValue('layerStencilBoxes', boxes);
    this.markDirty();
  }

  /**
   * Set stencil boxes for all layers.
   */
  setLayerStencilBoxes(boxes: StencilBox[]): void {
    this.properties.setValue('layerStencilBoxes', boxes);
    this.markDirty();
  }

  /**
   * Reset all layer stencil boxes to full visibility.
   */
  resetLayerStencilBoxes(): void {
    this.properties.setValue('layerStencilBoxes', []);
    this.markDirty();
  }
}
