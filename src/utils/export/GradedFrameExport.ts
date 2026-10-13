/**
 * Helpers that turn a GL export render (float RGBA, rows top-to-bottom) into
 * export files: an 8-bit canvas for PNG/JPEG/WebP and an OpenEXR file.
 */

import { safeCanvasContext2D } from '../../color/SafeCanvasContext';
import { encodeEXR, chromaticitiesForColorSpace } from '../../export/EXRWriter';

/** Float RGBA pixels of an export render (see ViewerGLRenderer.renderFrameForExport). */
export interface FloatFrame {
  data: Float32Array;
  width: number;
  height: number;
  colorSpace: 'srgb' | 'display-p3' | 'rec2020';
}

/**
 * Quantize display-encoded [0,1] floats to 8-bit RGBA (round to nearest,
 * clamped). Pixel values are not color-converted.
 */
export function floatFrameToRGBA8(
  frame: Pick<FloatFrame, 'data' | 'width' | 'height'>,
): Uint8ClampedArray<ArrayBuffer> {
  const n = frame.width * frame.height * 4;
  const out = new Uint8ClampedArray(n);
  const src = frame.data;
  for (let i = 0; i < n; i++) {
    // Uint8ClampedArray rounds half to even and clamps; NaN becomes 0.
    out[i] = (src[i] ?? 0) * 255;
  }
  return out;
}

/**
 * Put a display-encoded float frame on a 2D canvas of the same size, tagged
 * with the frame's color space (display-p3 or sRGB), for PNG/JPEG/WebP export.
 */
export function floatFrameToCanvas(frame: FloatFrame): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const p3 = frame.colorSpace === 'display-p3';
  const ctx = safeCanvasContext2D(canvas, {}, p3 ? 'display-p3' : undefined);
  const pixels = floatFrameToRGBA8(frame);
  const imageData = p3
    ? new ImageData(pixels, frame.width, frame.height, { colorSpace: 'display-p3' })
    : new ImageData(pixels, frame.width, frame.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/** sRGB EOTF (IEC 61966-2-1) applied to R, G and B in place; alpha is kept. */
export function decodeSRGBToLinearInPlace(data: Float32Array): void {
  for (let i = 0; i < data.length; i++) {
    if ((i & 3) === 3) continue;
    const v = data[i] ?? 0;
    data[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
}

/** Encode a scene-linear float frame as a half-float RGBA OpenEXR file. */
export function floatFrameToEXR(frame: FloatFrame): ArrayBuffer {
  return encodeEXR({
    width: frame.width,
    height: frame.height,
    data: frame.data,
    pixelType: 'half',
    includeAlpha: true,
    chromaticities: chromaticitiesForColorSpace(frame.colorSpace),
  });
}
