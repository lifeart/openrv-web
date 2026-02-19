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
function blendChannel(a: number, b: number, mode: BlendMode): number {
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
    default:
      result = bn;
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
 * Simple nearest-neighbor resize for ImageData
 */
function resizeImageData(source: ImageData, newWidth: number, newHeight: number): ImageData {
  const result = new ImageData(newWidth, newHeight);
  const srcData = source.data;
  const dstData = result.data;

  const xRatio = source.width / newWidth;
  const yRatio = source.height / newHeight;

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);

      const srcIdx = (srcY * source.width + srcX) * 4;
      const dstIdx = (y * newWidth + x) * 4;

      dstData[dstIdx] = srcData[srcIdx]!;
      dstData[dstIdx + 1] = srcData[srcIdx + 1]!;
      dstData[dstIdx + 2] = srcData[srcIdx + 2]!;
      dstData[dstIdx + 3] = srcData[srcIdx + 3]!;
    }
  }

  return result;
}
