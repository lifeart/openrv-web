/**
 * Blend Modes for Compositing
 *
 * Implements standard compositing blend modes for layering images.
 * All operations assume premultiplied alpha.
 */

export type BlendMode =
  | 'normal'      // Standard alpha over
  | 'add'         // Additive (Linear Dodge)
  | 'multiply'    // Multiply
  | 'screen'      // Screen
  | 'overlay'     // Overlay
  | 'difference'  // Difference
  | 'exclusion';  // Exclusion

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'add',
  'multiply',
  'screen',
  'overlay',
  'difference',
  'exclusion',
];

export const BLEND_MODE_LABELS: Record<BlendMode, string> = {
  normal: 'Normal',
  add: 'Add',
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
 * @returns New ImageData with composited result
 */
export function compositeImageData(
  base: ImageData,
  top: ImageData,
  mode: BlendMode = 'normal',
  opacity: number = 1
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

    // Apply blend mode to RGB channels
    const blendedR = blendChannel(baseR, topR, mode);
    const blendedG = blendChannel(baseG, topG, mode);
    const blendedB = blendChannel(baseB, topB, mode);

    // Alpha compositing (Porter-Duff "over" operation)
    const outA = topA + baseA * (1 - topA);

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
  height: number
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
    const composited = compositeImageData(result, layerData, layer.blendMode, layer.opacity);

    // Copy back to result
    result.data.set(composited.data);
  }

  return result;
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
