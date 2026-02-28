/**
 * Blend Modes for Compositing
 *
 * Implements standard compositing blend modes for layering images.
 *
 * Two alpha modes are supported:
 *
 * 1. **Straight alpha** (default, `premultiplied: false`):
 *    - Used by Canvas2D ImageData where RGB values are independent of alpha.
 *    - Porter-Duff over: outA = topA + baseA*(1-topA);
 *      outRGB = (blendedRGB*topA + baseRGB*baseA*(1-topA)) / outA
 *
 * 2. **Premultiplied alpha** (`premultiplied: true`):
 *    - Matches OpenRV's compositing pipeline. Over2.glsl uses:
 *      `i0.rgb + i1.rgb * (1 - i0.a)` (premultiplied over), and
 *      ImageRenderer.cpp sets `glBlendFunc(GL_ONE, GL_ONE_MINUS_SRC_ALPHA)`
 *      with the comment "src is assumed premultiplied".
 *    - Porter-Duff over (premultiplied): outA = topA + baseA*(1-topA);
 *      outRGB = topRGB + baseRGB*(1-topA)  (no division by outA)
 *    - Use this mode when compositing data from .rv sessions or OpenRV pipelines.
 */

import type { StackCompositeType } from '../nodes/groups/StackGroupNode';
import { pluginRegistry } from '../plugin/PluginRegistry';

export type BlendMode =
  | 'normal'      // Standard alpha over
  | 'add'         // Additive (Linear Dodge)
  | 'minus'       // Subtractive: clamp(base - top, 0, 1)
  | 'multiply'    // Multiply
  | 'screen'      // Screen
  | 'overlay'     // Overlay
  | 'difference'  // Difference
  | 'exclusion';  // Exclusion

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'add',
  'minus',
  'multiply',
  'screen',
  'overlay',
  'difference',
  'exclusion',
];

export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  normal: 'Normal',
  add: 'Add',
  minus: 'Minus',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  difference: 'Difference',
  exclusion: 'Exclusion',
};

/**
 * Blend two color values using the specified blend mode
 * All values are 0-255, returns 0-255
 */
function blendChannel(a: number, b: number, mode: BlendMode | (string & {})): number {
  // Normalize to 0-1 for calculations
  const an = a / 255;
  const bn = b / 255;
  let result: number;

  switch (mode) {
    case 'normal':
      result = bn;
      break;
    case 'add':
      result = Math.min(1, an + bn);
      break;
    case 'minus':
      result = Math.max(0, an - bn);
      break;
    case 'multiply':
      result = an * bn;
      break;
    case 'screen':
      result = 1 - (1 - an) * (1 - bn);
      break;
    case 'overlay':
      result = an < 0.5
        ? 2 * an * bn
        : 1 - 2 * (1 - an) * (1 - bn);
      break;
    case 'difference':
      result = Math.abs(an - bn);
      break;
    case 'exclusion':
      result = an + bn - 2 * an * bn;
      break;
    default: {
      // Fallback to plugin-registered blend modes before returning pass-through
      const pluginBlend = pluginRegistry.getBlendMode(mode);
      if (pluginBlend) {
        result = Math.max(0, Math.min(1, pluginBlend.blend(an, bn)));
      } else {
        result = bn;
      }
      break;
    }
  }

  return Math.round(result * 255);
}

/**
 * Composite two ImageData objects using alpha blending and blend modes
 *
 * @param base - The bottom layer (destination)
 * @param top - The top layer (source)
 * @param mode - The blend mode to use
 * @param opacity - Opacity of the top layer (0-1)
 * @param premultiplied - If true, use premultiplied alpha Porter-Duff formula
 *   (OpenRV compatibility: outRGB = topRGB + baseRGB * (1 - topA)).
 *   If false (default), use straight alpha formula for Canvas2D ImageData.
 * @returns New ImageData with composited result
 */
export function compositeImageData(
  base: ImageData,
  top: ImageData,
  mode: BlendMode = 'normal',
  opacity: number = 1,
  premultiplied: boolean = false
): ImageData {
  if (base.width !== top.width || base.height !== top.height) {
    throw new Error('ImageData dimensions must match for compositing');
  }

  const width = base.width;
  const height = base.height;
  const result = new ImageData(width, height);

  const baseData = base.data;
  const topData = top.data;
  const outData = result.data;

  for (let i = 0; i < baseData.length; i += 4) {
    // Get base (bottom) RGBA
    const baseR = baseData[i]!;
    const baseG = baseData[i + 1]!;
    const baseB = baseData[i + 2]!;
    const baseA = baseData[i + 3]! / 255;

    // Get top (source) RGBA with opacity
    const topR = topData[i]!;
    const topG = topData[i + 1]!;
    const topB = topData[i + 2]!;
    const topA = (topData[i + 3]! / 255) * opacity;

    if (topA === 0) {
      // Top is fully transparent, use base
      outData[i] = baseR;
      outData[i + 1] = baseG;
      outData[i + 2] = baseB;
      outData[i + 3] = baseData[i + 3]!;
      continue;
    }

    if (baseA === 0) {
      // Base is fully transparent, use top
      outData[i] = topR;
      outData[i + 1] = topG;
      outData[i + 2] = topB;
      outData[i + 3] = Math.round(topA * 255);
      continue;
    }

    // Alpha compositing (Porter-Duff "over" operation)
    const outA = topA + baseA * (1 - topA);

    if (premultiplied) {
      // Premultiplied alpha: RGB values are already multiplied by alpha.
      // Porter-Duff over (premultiplied):
      //   outRGB = topRGB + baseRGB * (1 - topA)
      //   outA   = topA   + baseA   * (1 - topA)
      // For blend modes other than normal, apply the blend to the
      // unpremultiplied color, then re-premultiply for compositing.
      if (mode === 'normal') {
        outData[i] = Math.min(255, Math.round(topR + baseR * (1 - topA)));
        outData[i + 1] = Math.min(255, Math.round(topG + baseG * (1 - topA)));
        outData[i + 2] = Math.min(255, Math.round(topB + baseB * (1 - topA)));
      } else {
        // For non-normal blend modes in premultiplied space:
        // Unpremultiply, blend, re-premultiply.
        const baseRu = baseA > 0 ? baseR / baseA : 0;
        const baseGu = baseA > 0 ? baseG / baseA : 0;
        const baseBu = baseA > 0 ? baseB / baseA : 0;
        const topRu = topA > 0 ? topR / topA : 0;
        const topGu = topA > 0 ? topG / topA : 0;
        const topBu = topA > 0 ? topB / topA : 0;
        // blendChannel expects 0-255 straight values
        const blendedR = blendChannel(Math.round(baseRu), Math.round(topRu), mode);
        const blendedG = blendChannel(Math.round(baseGu), Math.round(topGu), mode);
        const blendedB = blendChannel(Math.round(baseBu), Math.round(topBu), mode);
        // Re-premultiply: blended result * topA + base * (1 - topA)
        outData[i] = Math.min(255, Math.round(blendedR * topA + baseR * (1 - topA)));
        outData[i + 1] = Math.min(255, Math.round(blendedG * topA + baseG * (1 - topA)));
        outData[i + 2] = Math.min(255, Math.round(blendedB * topA + baseB * (1 - topA)));
      }
      outData[i + 3] = Math.round(outA * 255);
    } else {
      // Straight alpha path (original behavior)
      // Apply blend mode to RGB channels
      const blendedR = blendChannel(baseR, topR, mode);
      const blendedG = blendChannel(baseG, topG, mode);
      const blendedB = blendChannel(baseB, topB, mode);

      if (outA > 0) {
        // Composite with alpha
        outData[i] = Math.round((blendedR * topA + baseR * baseA * (1 - topA)) / outA);
        outData[i + 1] = Math.round((blendedG * topA + baseG * baseA * (1 - topA)) / outA);
        outData[i + 2] = Math.round((blendedB * topA + baseB * baseA * (1 - topA)) / outA);
        outData[i + 3] = Math.round(outA * 255);
      } else {
        outData[i] = 0;
        outData[i + 1] = 0;
        outData[i + 2] = 0;
        outData[i + 3] = 0;
      }
    }
  }

  return result;
}

/**
 * Composite multiple layers together
 * Layers are composited from bottom to top (first layer is bottom)
 */
export interface CompositeLayer {
  imageData: ImageData;
  blendMode: BlendMode;
  opacity: number;
  visible: boolean;
}

export function compositeMultipleLayers(
  layers: CompositeLayer[],
  width: number,
  height: number,
  premultiplied: boolean = false
): ImageData {
  // Start with transparent black
  const result = new ImageData(width, height);

  // Fill with transparent black
  for (let i = 0; i < result.data.length; i += 4) {
    result.data[i] = 0;
    result.data[i + 1] = 0;
    result.data[i + 2] = 0;
    result.data[i + 3] = 0;
  }

  // Composite each visible layer
  for (const layer of layers) {
    if (!layer.visible || layer.opacity === 0) continue;

    // Resize layer if needed (simple nearest-neighbor for now)
    let layerData = layer.imageData;
    if (layerData.width !== width || layerData.height !== height) {
      layerData = resizeImageData(layerData, width, height);
    }

    // Composite this layer onto result
    const composited = compositeImageData(result, layerData, layer.blendMode, layer.opacity, premultiplied);

    // Copy back to result
    result.data.set(composited.data);
  }

  return result;
}

/**
 * Map a StackCompositeType to the corresponding BlendMode.
 *
 * OpenRV compatibility notes (from StackIPNode.cpp and IPImage.cpp):
 *
 * - 'replace': Maps to IPImage::Replace. glDisable(GL_BLEND) -- last input
 *   overwrites framebuffer. We map to 'normal' which is close enough for
 *   single-layer display.
 *
 * - 'over': Maps to IPImage::Over. Uses premultiplied alpha Over2.glsl:
 *   `i0.rgb + i1.rgb * (1 - i0.a)`. We map to 'normal' (straight-alpha over).
 *
 * - 'add': Maps to IPImage::Add. glBlendFunc(GL_ONE, GL_ONE).
 *
 * - 'difference': Maps to IPImage::Difference. glBlendEquation(GL_FUNC_SUBTRACT)
 *   with GL_ONE/GL_ONE. Uses Difference2.glsl: abs(i0 - i1).
 *
 * - 'dissolve': Maps to IPImage::Dissolve. In OpenRV, the InlineDissolve2.glsl
 *   shader randomly selects either input per-pixel based on a noise function
 *   with probability p=0.5. The blend mode at the GL level uses the same
 *   premultiplied-over blending as 'over'. Currently falls back to 'normal'
 *   because we lack the per-pixel noise implementation.
 *   TODO: Implement per-pixel noise dissolve to match OpenRV InlineDissolve2.glsl.
 *
 * - 'topmost': In OpenRV, this maps to IPImage::Replace at the blend mode level,
 *   but StackIPNode::evaluate() also sets `topmostOnly = true`, which causes it
 *   to evaluate only the FIRST input (breaking after `haveOneImage` is set).
 *   This means only the top-most layer is displayed, all others are skipped.
 *   Currently falls back to 'normal'.
 *   TODO: Implement topmost by evaluating only the first visible input.
 *
 * - 'minus': OpenRV maps '-difference' to IPImage::ReverseDifference, which uses
 *   glBlendEquation(GL_FUNC_REVERSE_SUBTRACT). The ReverseDifference2.glsl
 *   computes `clamp(i1 - i0, 0, 1)` (destination minus source). OpenRV does NOT
 *   have a separate 'minus' composite type; the closest is '-difference'.
 *   Our 'minus' blend mode computes `clamp(base - top, 0, 1)` which matches
 *   the ReverseDifference behavior.
 */
export function stackCompositeToBlendMode(composite: StackCompositeType): BlendMode {
  switch (composite) {
    case 'replace':
      return 'normal';
    case 'over':
      return 'normal';
    case 'add':
      return 'add';
    case 'difference':
      return 'difference';
    case '-difference':
      // OpenRV compatibility: ReverseDifference = clamp(dst - src, 0, 1)
      return 'minus';
    case 'minus':
      // OpenRV compatibility: maps to ReverseDifference (clamp(dst - src, 0, 1))
      return 'minus';
    case 'dissolve':
      // OpenRV: InlineDissolve2.glsl uses per-pixel noise to randomly pick input.
      // Falling back to normal until per-pixel noise dissolve is implemented.
      return 'normal';
    case 'topmost':
      // OpenRV: StackIPNode evaluates only the first input when topmost is set.
      // Falling back to normal until topmost-only evaluation is implemented.
      return 'normal';
    default:
      return 'normal';
  }
}

/**
 * Bilinear interpolation resize for ImageData.
 *
 * For each destination pixel, the corresponding source position is computed as
 * a floating-point coordinate. The four surrounding source pixels are sampled
 * and linearly interpolated to produce a smooth result, avoiding the aliasing
 * artifacts of nearest-neighbor scaling.
 */
function resizeImageData(source: ImageData, newWidth: number, newHeight: number): ImageData {
  const result = new ImageData(newWidth, newHeight);
  const srcData = source.data;
  const dstData = result.data;
  const srcW = source.width;
  const srcH = source.height;

  const xRatio = srcW / newWidth;
  const yRatio = srcH / newHeight;

  for (let dy = 0; dy < newHeight; dy++) {
    // Map destination pixel center to source pixel center
    const srcY = (dy + 0.5) * yRatio - 0.5;
    // Clamp the source coordinate to valid range, then derive integer and fractional parts
    const clampedY = Math.max(0, Math.min(srcY, srcH - 1));
    const y0 = Math.min(Math.floor(clampedY), srcH - 1);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = clampedY - y0;

    for (let dx = 0; dx < newWidth; dx++) {
      const srcX = (dx + 0.5) * xRatio - 0.5;
      const clampedX = Math.max(0, Math.min(srcX, srcW - 1));
      const x0 = Math.min(Math.floor(clampedX), srcW - 1);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = clampedX - x0;

      // Indices for the four surrounding source pixels
      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;

      const dstIdx = (dy * newWidth + dx) * 4;

      // Bilinear interpolation for each channel (R, G, B, A)
      for (let c = 0; c < 4; c++) {
        const v00 = srcData[idx00 + c]!;
        const v10 = srcData[idx10 + c]!;
        const v01 = srcData[idx01 + c]!;
        const v11 = srcData[idx11 + c]!;

        // Interpolate along x for both rows, then along y
        const top = v00 + (v10 - v00) * fx;
        const bottom = v01 + (v11 - v01) * fx;
        dstData[dstIdx + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }

  return result;
}
