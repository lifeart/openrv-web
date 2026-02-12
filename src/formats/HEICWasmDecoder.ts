/**
 * HEICWasmDecoder - HEIC WASM fallback decoder using libheif-js
 *
 * Provides cross-browser HEIC decoding for Chrome/Firefox/Edge which lack
 * native HEIC support. Safari decodes HEIC natively via createImageBitmap.
 *
 * Uses the same lazy-loading pattern as JXLDecoder.ts.
 */

import { validateImageDimensions } from './shared';
import { DecoderError } from '../core/errors';

/**
 * Shared internal function to decode a specific image from the decoded array.
 * Frees ALL images (both the target and siblings) to prevent WASM memory leaks.
 */
async function decodeHEICItemAtIndex(
  images: import('libheif-js').HeifImage[],
  itemIndex: number
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  if (itemIndex < 0 || itemIndex >= images.length) {
    // Free all images before throwing
    for (const img of images) img.free();
    throw new DecoderError(
      'HEIC',
      `Item index ${itemIndex} out of range (file has ${images.length} images)`
    );
  }

  const image = images[itemIndex]!;

  // Free all other images immediately — they won't be used
  for (let i = 0; i < images.length; i++) {
    if (i !== itemIndex) images[i]!.free();
  }

  try {
    const w = image.get_width();
    const h = image.get_height();
    validateImageDimensions(w, h, 'HEIC');

    const imageData = {
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    };

    await new Promise<void>((resolve, reject) => {
      image.display(imageData, (result: unknown) => {
        if (!result) {
          reject(new DecoderError('HEIC', 'libheif display() callback returned null'));
        } else {
          resolve();
        }
      });
    });

    return { width: w, height: h, data: imageData.data };
  } finally {
    image.free();
  }
}

/**
 * Decode a HEIC buffer to RGBA pixel data using libheif-js WASM.
 * Returns the primary image (via is_primary()), falling back to index 0.
 */
export async function decodeHEICToImageData(
  buffer: ArrayBuffer
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const libheif = await import('libheif-js');
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buffer));

  if (!images || images.length === 0) {
    throw new DecoderError('HEIC', 'libheif decoded no images from buffer');
  }

  // is_primary() may not be available in all libheif-js builds (WASM binding missing)
  let targetIndex = 0;
  try {
    const primaryIndex = images.findIndex(img => img.is_primary());
    if (primaryIndex >= 0) targetIndex = primaryIndex;
  } catch {
    // is_primary() not supported — fall back to index 0
  }

  return decodeHEICItemAtIndex(images, targetIndex);
}

/**
 * Decode a specific image item from a HEIC buffer by index.
 * HEIC files can contain multiple top-level images; this picks one by index.
 */
export async function decodeHEICItemToImageData(
  buffer: ArrayBuffer,
  itemIndex: number
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const libheif = await import('libheif-js');
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(buffer));

  if (!images || images.length === 0) {
    throw new DecoderError('HEIC', 'libheif decoded no images from buffer');
  }

  return decodeHEICItemAtIndex(images, itemIndex);
}
